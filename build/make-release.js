// Packs dist/win-unpacked into the files a GitHub release needs:
//   Study-Tracker-Portable-X.Y.Z.zip  (full app, for first installs and Electron upgrades)
//   app-X.Y.Z.asar                    (just the app code, for small updates)
//   latest.json                       (what the in-app updater reads)
// Usage: node build/make-release.js ["release notes"]
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const electron = require(path.join(root, 'node_modules', 'electron', 'package.json')).version;
const v = pkg.version;
const unpacked = path.join(root, 'dist', 'win-unpacked');
const out = path.join(root, 'release', v);
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const stage = path.join(root, 'dist', 'stage');
fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });
fs.cpSync(unpacked, path.join(stage, 'Study Tracker'), { recursive: true });
const zipName = `Study-Tracker-Portable-${v}.zip`;
if (process.platform === 'win32') execFileSync('7z', ['a', '-tzip', '-mx=9', path.join(out, zipName), 'Study Tracker'], { cwd: stage, stdio: 'ignore' });
else execFileSync('zip', ['-qr9', path.join(out, zipName), 'Study Tracker'], { cwd: stage });
const asarName = `app-${v}.asar`;
fs.copyFileSync(path.join(unpacked, 'resources', 'app.asar'), path.join(out, asarName));

const info = (name) => {
  const buf = fs.readFileSync(path.join(out, name));
  return { name, size: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') };
};
const manifest = { version: v, electron, notes: process.argv[2] || '', asar: info(asarName), zip: info(zipName), released: new Date().toISOString() };
fs.writeFileSync(path.join(out, 'latest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest, null, 2));
