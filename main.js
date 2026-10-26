const { app, BrowserWindow, ipcMain, dialog, screen, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');
const updater = require('./updater');
const social = require('./social');

let mainWin = null;
let miniWin = null;

const DATA_FILE = () => path.join(app.getPath('userData'), 'study-data.json');
const WIN_FILE = () => path.join(app.getPath('userData'), 'window-state.json');
// The app's own exe (for the portable single-file build this is the original file, not the temp copy).
const APP_EXE = () => process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
let wasMaximized = true; // remembered while the mini player has the main window minimised
const BACKUP_FILE = () => path.join(app.getPath('userData'), 'study-data.backup.json');

// Only one copy of the app at a time, so two windows never overwrite each other's data.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWin) {
      if (mainWin.isMinimized()) mainWin.restore();
      mainWin.show();
      mainWin.focus();
    }
  });
}

app.setAppUserModelId('com.studytracker.app');

// ---- safety: the app's windows only ever show the app's own pages ----
// Links can't move a window to a website, new windows never open inside the app, and only
// GitHub links (the "download the update" link) are handed to the web browser.
function openOutside(url) {
  try {
    const u = new URL(url);
    if (u.protocol === 'https:' && u.hostname === 'github.com') shell.openExternal(u.href);
  } catch (e) {}
}
app.on('web-contents-created', (_e, wc) => {
  wc.on('will-navigate', (e, url) => { e.preventDefault(); openOutside(url); });
  wc.on('will-redirect', (e) => e.preventDefault());
  wc.on('will-attach-webview', (e) => e.preventDefault());
  wc.setWindowOpenHandler(({ url }) => { openOutside(url); return { action: 'deny' }; });
});
// Only the app's own pages (loaded from its files) may use the app's functions.
const fromApp = (e) => {
  try { return new URL(e.senderFrame.url).protocol === 'file:'; } catch (err) { return false; }
};
const handle = (ch, fn) => ipcMain.handle(ch, (e, ...a) => { if (!fromApp(e)) throw new Error('not allowed'); return fn(e, ...a); });
const listen = (ch, fn) => ipcMain.on(ch, (e, ...a) => { if (!fromApp(e)) { e.returnValue = false; return; } fn(e, ...a); });
// don't keep a spare renderer process warmed up in the background (saves memory)
app.commandLine.appendSwitch('disable-features', 'SpareRendererForSitePerProcess');

function readData() {
  for (const f of [DATA_FILE(), BACKUP_FILE()]) {
    try {
      if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch (e) { /* try the backup next */ }
  }
  return null;
}

function writeData(data) {
  const file = DATA_FILE();
  const tmp = file + '.tmp';
  const json = JSON.stringify(data);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, json, 'utf8');
  if (fs.existsSync(file)) {
    try { fs.copyFileSync(file, BACKUP_FILE()); } catch (e) {}
  }
  fs.renameSync(tmp, file);
}

// ---- window size and maximised state are remembered between launches ----
function readWinState() {
  try { return JSON.parse(fs.readFileSync(WIN_FILE(), 'utf8')); } catch (e) { return null; }
}
function boundsVisible(b) {
  if (!b || !(b.width > 0) || !(b.height > 0) || typeof b.x !== 'number' || typeof b.y !== 'number') return false;
  // at least a decent piece of the title bar has to be on a screen
  return screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return b.x + 120 > a.x && b.x < a.x + a.width - 120 && b.y >= a.y - 10 && b.y < a.y + a.height - 60;
  });
}
let winSaveTimer = null;
function saveWinState(now) {
  clearTimeout(winSaveTimer);
  const write = () => {
    if (!mainWin || mainWin.isDestroyed()) return;
    const minimized = mainWin.isMinimized();
    const state = {
      maximized: minimized ? wasMaximized : mainWin.isMaximized(),
      bounds: mainWin.getNormalBounds(),
    };
    try { fs.mkdirSync(path.dirname(WIN_FILE()), { recursive: true }); fs.writeFileSync(WIN_FILE(), JSON.stringify(state)); } catch (e) {}
  };
  if (now) write(); else winSaveTimer = setTimeout(write, 400);
}

function createMain() {
  const saved = readWinState();
  const bounds = saved && boundsVisible(saved.bounds) ? saved.bounds : null;
  // never open bigger than the screen (small laptop screens)
  const wa = screen.getPrimaryDisplay().workAreaSize;
  const defW = Math.min(1240, wa.width - 40), defH = Math.min(820, wa.height - 40);
  // first launch opens maximised; after that it opens the way it was left
  wasMaximized = saved ? !!saved.maximized : true;
  mainWin = new BrowserWindow({
    width: bounds ? Math.max(900, bounds.width) : Math.max(900, defW),
    height: bounds ? Math.max(620, bounds.height) : Math.max(620, defH),
    ...(bounds ? { x: bounds.x, y: bounds.y } : { center: true }),
    minWidth: 900,
    minHeight: 620,
    show: false,
    backgroundColor: '#0f1a14',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: '#e8f1ea', height: 40 },
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // let Chromium treat the main window as hidden while it's minimised, so it stops drawing and
      // gives memory back (the timer uses real clock times, so it still counts correctly)
      backgroundThrottling: true,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
    },
  });
  mainWin.removeMenu();
  if (process.platform === 'win32') {
    // lets a taskbar pin point at the real app, so it still opens after the app is closed
    try { mainWin.setAppDetails({ appId: 'com.studytracker.app', appIconPath: APP_EXE(), appIconIndex: 0, relaunchCommand: `"${APP_EXE()}"`, relaunchDisplayName: 'Study Tracker' }); } catch (e) {}
  }
  mainWin.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWin.once('ready-to-show', () => {
    if (wasMaximized) mainWin.maximize();
    mainWin.show();
  });
  for (const ev of ['resize', 'move']) mainWin.on(ev, () => saveWinState());
  mainWin.on('maximize', () => { wasMaximized = true; saveWinState(); });
  mainWin.on('unmaximize', () => { if (!mainWin.isMinimized()) { wasMaximized = false; saveWinState(); } });
  mainWin.on('close', () => saveWinState(true));
  mainWin.on('closed', () => {
    mainWin = null;
    if (miniWin) miniWin.destroy();
  });
}

function createMini() {
  if (miniWin) { miniWin.show(); return; }
  const wa = screen.getPrimaryDisplay().workArea;
  miniWin = new BrowserWindow({
    width: 310,
    height: 96,
    x: wa.x + 16,
    y: wa.y + 16,
    minWidth: 150,
    minHeight: 48,
    maxWidth: 520,
    maxHeight: 200,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
    },
  });
  miniWin.setAlwaysOnTop(true, 'floating');
  miniWin.loadFile(path.join(__dirname, 'renderer', 'mini.html'));
  miniWin.on('closed', () => {
    miniWin = null;
    if (mainWin) mainWin.webContents.send('mini:closed');
  });
}

app.whenReady().then(() => {
  // the app needs no camera, microphone, location, notifications and so on; copying the friend code is the one thing it asks for
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'clipboard-sanitized-write'));
  handle('data:load', () => readData());
  handle('data:save', (_e, data) => { writeData(data); return true; });
  handle('app:version', () => app.getVersion());
  // the notes for this version, shown once after an update
  handle('app:notes', () => { try { return fs.readFileSync(path.join(__dirname, 'RELEASE_NOTES.md'), 'utf8'); } catch (e) { return ''; } });
  // friends (online); see social.js
  handle('social', (_e, op, args) => social.call(op, args));
  // Before an older save is upgraded to a new format, keep an untouched copy of it.
  handle('data:backupBeforeUpgrade', (_e, { data, fromVersion }) => {
    const dir = path.join(app.getPath('userData'), 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(dir, `study-data-format${String(fromVersion).replace(/[^0-9]/g, '').slice(0, 6)}-before-upgrade-${stamp}.json`);
    fs.writeFileSync(file, JSON.stringify(data), 'utf8');
    return file;
  });
  listen('data:saveSync', (e, data) => {
    try { writeData(data); e.returnValue = true; } catch (err) { e.returnValue = false; }
  });

  handle('file:export', async (_e, { content, defaultName, filters }) => {
    const res = await dialog.showSaveDialog(mainWin, {
      defaultPath: path.join(app.getPath('documents'), path.basename(String(defaultName || 'study-tracker'))),
      filters,
    });
    if (res.canceled || !res.filePath) return null;
    fs.writeFileSync(res.filePath, content, 'utf8');
    return res.filePath;
  });

  handle('file:import', async () => {
    const res = await dialog.showOpenDialog(mainWin, {
      properties: ['openFile'],
      filters: [
        { name: 'Study data', extensions: ['json', 'csv', 'html', 'htm'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (res.canceled || !res.filePaths.length) return null;
    const p = res.filePaths[0];
    return { name: path.basename(p), content: fs.readFileSync(p, 'utf8') };
  });

  listen('theme:titlebar', (_e, { color, symbol }) => {
    if (mainWin && process.platform === 'win32') {
      try { mainWin.setTitleBarOverlay({ color, symbolColor: symbol, height: 40 }); } catch (e) {}
    }
  });

  // Mini player plumbing: the main window owns the timer and pushes state;
  // the mini player sends button presses back.
  listen('mini:open', () => {
    createMini();
    if (mainWin) {
      if (!mainWin.isMinimized()) wasMaximized = mainWin.isMaximized();
      mainWin.minimize();
    }
  });
  listen('mini:close', () => { if (miniWin) miniWin.close(); });
  listen('mini:state', (_e, state) => { if (miniWin) miniWin.webContents.send('mini:state', state); });
  listen('mini:command', (_e, cmd) => {
    if (cmd === 'expand') {
      // straight back to the main window, maximised if that's how it was left
      if (miniWin) { miniWin.destroy(); miniWin = null; }
      if (mainWin) {
        if (wasMaximized) mainWin.maximize();
        else if (mainWin.isMinimized()) mainWin.restore();
        mainWin.show();
        mainWin.focus();
        mainWin.webContents.send('mini:closed');
      }
      return;
    }
    if (cmd === 'close') { if (miniWin) miniWin.close(); return; }
    if (mainWin) mainWin.webContents.send('mini:command', cmd);
  });
  listen('mini:resize', (_e, { w, h }) => {
    if (!miniWin) return;
    const b = miniWin.getBounds();
    miniWin.setBounds({ x: b.x, y: b.y, width: Math.round(w), height: Math.round(h) }, true);
  });
  listen('mini:corner', () => {
    if (!miniWin) return;
    const wa = screen.getDisplayMatching(miniWin.getBounds()).workArea;
    const b = miniWin.getBounds();
    miniWin.setBounds({ x: wa.x + 16, y: wa.y + 16, width: b.width, height: b.height }, true);
  });

  createMain();

  // ---- automatic updates (see updater.js) ----
  let updateRepo = '';
  try { updateRepo = require('./package.json').updateRepo || ''; } catch (e) {}
  handle('update:state', () => updater.getState());
  handle('update:check', () => updater.check(true));
  handle('update:restart', () => updater.restartNow());
  updater.init({
    repo: updateRepo,
    send: (st) => { if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('update:state', st); },
  });
});

app.on('window-all-closed', () => app.quit());
