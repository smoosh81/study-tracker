// Installs a downloaded update after Study Tracker has closed.
//
// main.js copies this file out to %LOCALAPPDATA%\Study Tracker Updates and runs it with the
// app's own exe in Node mode (ELECTRON_RUN_AS_NODE=1), so it needs nothing else installed.
// Usage: "Study Tracker.exe" update-helper.js job.json
//
// It waits for the app to exit, backs up every file it is about to replace, copies the new
// files in, puts the old ones back if anything fails, and can start the app again.
// It never touches the saves folder.
let fs;
try { fs = require('original-fs'); } catch (e) { fs = require('fs'); }
process.noAsar = true; // treat app.asar as a plain file
const path = require('path');
const { spawn } = require('child_process');

const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
// job: { pid, appDir, exe, kind: 'asar'|'full', source, version, updatesDir, relaunch }
const LOG = path.join(job.updatesDir, 'update-log.txt');
const log = (m) => { try { fs.appendFileSync(LOG, `${new Date().toISOString()} [helper] ${m}\r\n`); } catch (e) {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

async function retry(fn, tries = 40) {
  for (let i = 0; ; i++) {
    try { return fn(); } catch (e) { if (i >= tries - 1) throw e; await sleep(500); }
  }
}

function listFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) out.push({ src: p, rel: path.relative(root, p) });
    }
  };
  walk(root);
  return out;
}

function relaunch() {
  if (!job.relaunch) return;
  try {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    spawn(job.exe, [], { cwd: job.appDir, env, detached: true, stdio: 'ignore' }).unref();
    log('started the app again');
  } catch (e) { log(`could not start the app again: ${e.message}`); }
}

(async () => {
  log(`started: installing ${job.kind} update ${job.version}`);

  // wait (up to a minute) for the app to close and let go of its files
  for (let i = 0; i < 240 && alive(job.pid); i++) await sleep(250);
  await sleep(500);

  const files = job.kind === 'asar'
    ? [{ src: job.source, rel: path.join('resources', 'app.asar') }]
    : listFiles(job.source);
  const backup = path.join(job.updatesDir, 'previous-version');
  fs.rmSync(backup, { recursive: true, force: true });
  const done = [];
  let ok = false;
  try {
    for (const f of files) {
      const dest = path.join(job.appDir, f.rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const had = fs.existsSync(dest);
      if (had) {
        const bk = path.join(backup, f.rel);
        fs.mkdirSync(path.dirname(bk), { recursive: true });
        await retry(() => fs.copyFileSync(dest, bk));
      }
      done.push({ rel: f.rel, had });
      await retry(() => fs.copyFileSync(f.src, dest));
    }
    ok = true;
    log(`installed ${job.kind} update ${job.version} (${files.length} files)`);
  } catch (e) {
    log(`install failed, putting the old version back: ${e.message}`);
    for (const d of done.reverse()) {
      try {
        const dest = path.join(job.appDir, d.rel);
        if (d.had) fs.copyFileSync(path.join(backup, d.rel), dest);
        else fs.rmSync(dest, { force: true });
      } catch (err) { log(`could not restore ${d.rel}: ${err.message}`); }
    }
    log('rollback finished');
  }

  if (ok) {
    fs.rmSync(path.join(job.updatesDir, 'pending.json'), { force: true });
    // the downloaded files are cleaned up by the app on its next start
  }
  relaunch();
})().catch((e) => { log(`helper crashed: ${e && e.stack}`); relaunch(); });
