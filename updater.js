// Built-in updater for the portable folder build.
//
// How it works:
//  1. On launch (and every few hours) it reads latest.json from the newest GitHub release.
//  2. If that version is newer, it downloads the update in the background into
//     %LOCALAPPDATA%\Study Tracker Updates (never the saves folder) and checks its SHA-256.
//     If the Electron version is unchanged only the small app.asar is downloaded,
//     otherwise the full portable zip is downloaded and unpacked.
//  3. When the app closes (or the user presses "Restart now") update-helper.js runs on the
//     app's own exe in Node mode, waits for the app to exit, copies the new files over the app
//     folder (keeping a backup to roll back to if anything fails) and, if asked, starts the app again.
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
        const dest = path.join(dir, 'app.asar.new');
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

// Starts the helper (update-helper.js) that swaps the files once this app has exited.
// It runs on the app's own exe in Node mode, so it doesn't depend on PowerShell or scripts
// being allowed. For a full update it runs from the NEW exe, since the old one gets replaced.
function startHelper(relaunch) {
  if (!pending) return false;
  try {
    pending.attempts = (pending.attempts || 0) + 1;
    fs.writeFileSync(PENDING_FILE(), JSON.stringify(pending));
    const dir = UPDATES_DIR();
    const helper = path.join(dir, 'update-helper.js');
    fs.writeFileSync(helper, fs.readFileSync(path.join(__dirname, 'update-helper.js'), 'utf8'));
    const job = path.join(dir, 'update-job.json');
    fs.writeFileSync(job, JSON.stringify({
      pid: process.pid, appDir: APP_DIR(), exe: process.execPath, kind: pending.kind,
      source: pending.source, version: pending.version, updatesDir: dir, relaunch: !!relaunch,
    }));
    const runner = pending.kind === 'full' ? path.join(pending.source, path.basename(process.execPath)) : process.execPath;
    const child = spawn(runner, [helper, job], {
      detached: true, stdio: 'ignore', windowsHide: true, cwd: dir,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    });
    child.on('error', (err) => log(`helper could not start: ${err && err.message}`));
    child.on('exit', (code) => log(`helper exited early with code ${code}`));
    child.unref();
    log(`helper started for ${pending.version} (attempt ${pending.attempts}, relaunch: ${!!relaunch}, pid ${child.pid})`);
    return !!child.pid;
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
  } else if ((pending.attempts || 0) >= 3) {
    log(`giving up on ${pending.version} after ${pending.attempts} tries`);
    setState({ status: 'failed', version: pending.version, url: `https://github.com/${repo}/releases/latest` });
    pending = null; // stop trying on every close; the user can download it instead
    return;
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
