// Built-in updater for the portable folder build.
//
// How it works:
//  1. On launch (and every few hours) it reads latest.json from the newest GitHub release.
//  2. If that version is newer, it downloads the update in the background into
//     %LOCALAPPDATA%\Study Tracker Updates (never the saves folder) and checks its SHA-256.
//     If the Electron version is unchanged only the small app.asar is downloaded,
//     otherwise the full portable zip is downloaded and unpacked.
//  3. When the app closes (or the user presses "Restart now") a small hidden PowerShell
//     script waits for the app to exit, copies the new files over the app folder
//     (keeping a backup to roll back to if anything fails) and, if asked, starts the app again.
//
// Saves in %APPDATA%\Study Tracker are never read or written here.
const { app, net } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');
const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');

const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;

let repo = '';
let send = () => {};
let state = { status: 'idle', version: null, error: null, progress: 0, notes: '' };
let pending = null; // { version, kind: 'asar' | 'full', source }
let checking = null;
let applyOnQuitArmed = false;

const UPDATES_DIR = () => path.join(process.env.LOCALAPPDATA || app.getPath('appData').replace(/Roaming$/i, 'Local'), 'Study Tracker Updates');
const APP_DIR = () => path.dirname(process.execPath);
const PENDING_FILE = () => path.join(UPDATES_DIR(), 'pending.json');
const LOG_FILE = () => path.join(UPDATES_DIR(), 'update-log.txt');

function setState(patch) {
  state = { ...state, ...patch };
  try { send(state); } catch (e) {}
}

function log(line) {
  try {
    fs.mkdirSync(UPDATES_DIR(), { recursive: true });
    fs.appendFileSync(LOG_FILE(), `${new Date().toISOString()} [app ${app.getVersion()}] ${line}\r\n`);
  } catch (e) {}
}

// "1.10.0" > "1.9.3"
function newer(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

// Updating only works for the unpacked portable folder on Windows, not when running from source.
function canUpdate() {
  if (process.platform !== 'win32' || !app.isPackaged || !repo) return false;
  if (process.env.PORTABLE_EXECUTABLE_FILE) return false; // old single-file build
  try { fs.accessSync(APP_DIR(), fs.constants.W_OK); } catch (e) { return false; }
  return fs.existsSync(path.join(APP_DIR(), 'resources', 'app.asar'));
}

async function fetchJson(url) {
  const res = await net.fetch(`${url}?t=${Date.now()}`, { cache: 'no-store', headers: { 'User-Agent': 'Study-Tracker-Updater' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function download(url, dest, size, sha256) {
  const res = await net.fetch(url, { cache: 'no-store', headers: { 'User-Agent': 'Study-Tracker-Updater' } });
  if (!res.ok || !res.body) throw new Error(`download failed (HTTP ${res.status})`);
  const total = size || Number(res.headers.get('content-length')) || 0;
  const hash = crypto.createHash('sha256');
  let got = 0, lastSent = 0;
  const meter = new Transform({
    transform(chunk, _enc, cb) {
      hash.update(chunk);
      got += chunk.length;
      const now = Date.now();
      if (total && now - lastSent > 250) { lastSent = now; setState({ progress: Math.min(0.99, got / total) }); }
      cb(null, chunk);
    },
  });
  const tmp = dest + '.part';
  await pipeline(Readable.fromWeb(res.body), meter, fs.createWriteStream(tmp));
  const digest = hash.digest('hex');
  if (sha256 && digest.toLowerCase() !== String(sha256).toLowerCase()) {
    try { fs.unlinkSync(tmp); } catch (e) {}
    throw new Error('the download was damaged (checksum did not match)');
  }
  fs.renameSync(tmp, dest);
}

function unzip(zip, outDir) {
  // Windows 10+ ships bsdtar, which reads zip files. Fall back to PowerShell if it is missing.
  return new Promise((resolve, reject) => {
    fs.mkdirSync(outDir, { recursive: true });
    const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
    const viaPs = () => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${outDir.replace(/'/g, "''")}' -Force`],
    { windowsHide: true }, (err) => (err ? reject(err) : resolve()));
    if (!fs.existsSync(tar)) return viaPs();
    execFile(tar, ['-xf', zip, '-C', outDir], { windowsHide: true }, (err) => (err ? viaPs() : resolve()));
  });
}

function findAppFolder(root) {
  // the zip holds a "Study Tracker" folder; find the folder that has resources/app.asar in it
  const stack = [root];
  for (let depth = 0; stack.length && depth < 200; depth++) {
    const d = stack.shift();
    if (fs.existsSync(path.join(d, 'resources', 'app.asar'))) return d;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) if (e.isDirectory()) stack.push(path.join(d, e.name));
  }
  return null;
}

function rmrf(p) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (e) {} }

function loadPending() {
  try {
    const p = JSON.parse(fs.readFileSync(PENDING_FILE(), 'utf8'));
    if (p && newer(p.version, app.getVersion()) && fs.existsSync(p.source)) return p;
  } catch (e) {}
  return null;
}

async function check(manual = false) {
  if (!canUpdate()) {
    if (manual) setState({ status: 'unsupported', error: null });
    return state;
  }
  if (pending) { setState({ status: 'ready', version: pending.version }); return state; }
  if (checking) return checking;
  checking = (async () => {
    try {
      setState({ status: 'checking', error: null });
      const m = await fetchJson(`https://github.com/${repo}/releases/latest/download/latest.json`);
      if (!m || !m.version || !newer(m.version, app.getVersion())) {
        setState({ status: 'current', version: m && m.version, lastChecked: Date.now() });
        return state;
      }
      const base = `https://github.com/${repo}/releases/download/v${m.version}/`;
      const dir = path.join(UPDATES_DIR(), m.version);
      rmrf(dir);
      fs.mkdirSync(dir, { recursive: true });
      setState({ status: 'downloading', version: m.version, progress: 0, notes: m.notes || '' });
      let p;
      if (m.asar && m.electron && m.electron === process.versions.electron) {
        const dest = path.join(dir, 'app.asar');
        await download(base + m.asar.name, dest, m.asar.size, m.asar.sha256);
        p = { version: m.version, kind: 'asar', source: dest };
      } else {
        if (!m.zip) throw new Error('no full download in this release');
        const zip = path.join(dir, 'update.zip');
        await download(base + m.zip.name, zip, m.zip.size, m.zip.sha256);
        setState({ status: 'unpacking' });
        await unzip(zip, path.join(dir, 'unpacked'));
        const folder = findAppFolder(path.join(dir, 'unpacked'));
        if (!folder) throw new Error('the update zip did not contain the app');
        try { fs.unlinkSync(zip); } catch (e) {}
        p = { version: m.version, kind: 'full', source: folder };
      }
      fs.writeFileSync(PENDING_FILE(), JSON.stringify(p));
      pending = p;
      log(`downloaded ${p.kind} update ${p.version}`);
      setState({ status: 'ready', version: p.version, progress: 1 });
    } catch (err) {
      log(`check failed: ${err && err.message}`);
      setState({ status: 'error', error: String((err && err.message) || err) });
    } finally {
      checking = null;
    }
    return state;
  })();
  return checking;
}

function psQuote(s) { return `'${String(s).replace(/'/g, "''")}'`; }

// Writes and starts the hidden helper that swaps the files once this app has exited.
function startHelper(relaunch) {
  if (!pending) return false;
  const exe = process.execPath;
  const script = path.join(UPDATES_DIR(), 'apply-update.ps1');
  const ps = `
$ErrorActionPreference = 'Stop'
$appPid   = ${process.pid}
$appDir   = ${psQuote(APP_DIR())}
$exe      = ${psQuote(exe)}
$kind     = ${psQuote(pending.kind)}
$source   = ${psQuote(pending.source)}
$version  = ${psQuote(pending.version)}
$updates  = ${psQuote(UPDATES_DIR())}
$relaunch = ${relaunch ? '$true' : '$false'}
$logFile  = Join-Path $updates 'update-log.txt'
function Log($m) { Add-Content -LiteralPath $logFile -Value ((Get-Date).ToString('o') + ' [helper] ' + $m) }

# wait for the app (and its helper processes) to let go of the files
try { Wait-Process -Id $appPid -Timeout 60 -ErrorAction SilentlyContinue } catch {}
$exeName = [IO.Path]::GetFileNameWithoutExtension($exe)
for ($i = 0; $i -lt 40; $i++) {
  $left = Get-Process -Name $exeName -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe }
  if (-not $left) { break }
  Start-Sleep -Milliseconds 250
}

function Retry($block) {
  for ($i = 0; $i -lt 30; $i++) { try { & $block; return } catch { if ($i -eq 29) { throw }; Start-Sleep -Milliseconds 500 } }
}

$backup = Join-Path $updates 'previous-version'
# list of files to install: @{ src = new file; rel = path inside the app folder }
if ($kind -eq 'asar') {
  $files = @(@{ src = $source; rel = 'resources\\app.asar' })
} else {
  $root = (Resolve-Path -LiteralPath $source).ProviderPath.TrimEnd('\\')
  $files = @(Get-ChildItem -LiteralPath $root -Recurse -File | ForEach-Object { @{ src = $_.FullName; rel = $_.FullName.Substring($root.Length).TrimStart('\\') } })
}
$ok = $false
$done = @()
try {
  if (Test-Path -LiteralPath $backup) { Remove-Item -LiteralPath $backup -Recurse -Force }
  New-Item -ItemType Directory -Path $backup -Force | Out-Null
  foreach ($f in $files) {
    $dest = Join-Path $appDir $f.rel
    $destDir = Split-Path -Parent $dest
    if (-not (Test-Path -LiteralPath $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
    $had = Test-Path -LiteralPath $dest
    if ($had) {
      # keep the old file so a failed update can be undone
      $bk = Join-Path $backup $f.rel
      $bkDir = Split-Path -Parent $bk
      if (-not (Test-Path -LiteralPath $bkDir)) { New-Item -ItemType Directory -Path $bkDir -Force | Out-Null }
      Retry { Copy-Item -LiteralPath $dest -Destination $bk -Force }
    }
    $done += ,@{ rel = $f.rel; had = $had }
    $src = $f.src
    Retry { Copy-Item -LiteralPath $src -Destination $dest -Force }
  }
  $ok = $true
  Log "installed $kind update $version ($($files.Count) files)"
} catch {
  Log ("install failed, putting the old version back: " + $_.Exception.Message)
  foreach ($d in $done) {
    try {
      $dest = Join-Path $appDir $d.rel
      if ($d.had) { Copy-Item -LiteralPath (Join-Path $backup $d.rel) -Destination $dest -Force }
      else { Remove-Item -LiteralPath $dest -Force -ErrorAction SilentlyContinue }
    } catch { Log ("could not restore " + $d.rel + ": " + $_.Exception.Message) }
  }
  Log 'rollback finished'
}

if ($ok) {
  Remove-Item -LiteralPath (Join-Path $updates 'pending.json') -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath (Join-Path $updates $version) -Recurse -Force -ErrorAction SilentlyContinue
}
if ($relaunch) { Start-Process -FilePath $exe -WorkingDirectory $appDir }
`;
  try {
    fs.mkdirSync(UPDATES_DIR(), { recursive: true });
    fs.writeFileSync(script, '\ufeff' + ps.replace(/\r?\n/g, '\r\n'), 'utf8');
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], {
      detached: true, stdio: 'ignore', windowsHide: true, cwd: UPDATES_DIR(),
    });
    child.unref();
    log(`helper started for ${pending.version} (relaunch: ${relaunch})`);
    return true;
  } catch (err) {
    log(`could not start helper: ${err && err.message}`);
    return false;
  }
}

function init(opts) {
  repo = opts.repo || '';
  send = opts.send || send;
  if (!canUpdate()) { setState({ status: 'unsupported' }); return; }
  // a previous run may have finished downloading already
  pending = loadPending();
  if (!pending) {
    // clean up old downloads (and a finished pending.json) so the folder never grows
    try {
      for (const e of fs.readdirSync(UPDATES_DIR())) {
        if (/^\d+\.\d+\.\d+$/.test(e) && !newer(e, app.getVersion())) rmrf(path.join(UPDATES_DIR(), e));
      }
      fs.rmSync(PENDING_FILE(), { force: true });
    } catch (e) {}
  } else {
    setState({ status: 'ready', version: pending.version });
  }
  setTimeout(() => check(false), 8000);
  setInterval(() => check(false), CHECK_EVERY_MS).unref?.();
  // install whatever is ready when the app closes normally
  app.on('will-quit', () => {
    if (pending && !applyOnQuitArmed) { applyOnQuitArmed = true; startHelper(false); }
  });
}

function restartNow() {
  if (!pending) return false;
  applyOnQuitArmed = true;
  if (!startHelper(true)) { applyOnQuitArmed = false; return false; }
  app.quit();
  return true;
}

module.exports = { init, check, restartNow, getState: () => state, _newer: newer };
