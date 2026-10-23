const { app, BrowserWindow, ipcMain, dialog, screen, shell } = require('electron');
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
  mainWin.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
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
  ipcMain.handle('data:load', () => readData());
  ipcMain.handle('data:save', (_e, data) => { writeData(data); return true; });
  ipcMain.handle('app:version', () => app.getVersion());
  // the notes for this version, shown once after an update
  ipcMain.handle('app:notes', () => { try { return fs.readFileSync(path.join(__dirname, 'RELEASE_NOTES.md'), 'utf8'); } catch (e) { return ''; } });
  // friends (online); see social.js
  ipcMain.handle('social', (_e, op, args) => social.call(op, args));
  // Before an older save is upgraded to a new format, keep an untouched copy of it.
  ipcMain.handle('data:backupBeforeUpgrade', (_e, { data, fromVersion }) => {
    const dir = path.join(app.getPath('userData'), 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(dir, `study-data-format${fromVersion}-before-upgrade-${stamp}.json`);
    fs.writeFileSync(file, JSON.stringify(data), 'utf8');
    return file;
  });
  ipcMain.on('data:saveSync', (e, data) => {
    try { writeData(data); e.returnValue = true; } catch (err) { e.returnValue = false; }
  });

  ipcMain.handle('file:export', async (_e, { content, defaultName, filters }) => {
    const res = await dialog.showSaveDialog(mainWin, {
      defaultPath: path.join(app.getPath('documents'), defaultName),
      filters,
    });
    if (res.canceled || !res.filePath) return null;
    fs.writeFileSync(res.filePath, content, 'utf8');
    return res.filePath;
  });

  ipcMain.handle('file:import', async () => {
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

  ipcMain.on('theme:titlebar', (_e, { color, symbol }) => {
    if (mainWin && process.platform === 'win32') {
      try { mainWin.setTitleBarOverlay({ color, symbolColor: symbol, height: 40 }); } catch (e) {}
    }
  });

  // Mini player plumbing: the main window owns the timer and pushes state;
  // the mini player sends button presses back.
  ipcMain.on('mini:open', () => {
    createMini();
    if (mainWin) {
      if (!mainWin.isMinimized()) wasMaximized = mainWin.isMaximized();
      mainWin.minimize();
    }
  });
  ipcMain.on('mini:close', () => { if (miniWin) miniWin.close(); });
  ipcMain.on('mini:state', (_e, state) => { if (miniWin) miniWin.webContents.send('mini:state', state); });
  ipcMain.on('mini:command', (_e, cmd) => {
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
  ipcMain.on('mini:resize', (_e, { w, h }) => {
    if (!miniWin) return;
    const b = miniWin.getBounds();
    miniWin.setBounds({ x: b.x, y: b.y, width: Math.round(w), height: Math.round(h) }, true);
  });
  ipcMain.on('mini:corner', () => {
    if (!miniWin) return;
    const wa = screen.getDisplayMatching(miniWin.getBounds()).workArea;
    const b = miniWin.getBounds();
    miniWin.setBounds({ x: wa.x + 16, y: wa.y + 16, width: b.width, height: b.height }, true);
  });

  createMain();

  // ---- automatic updates (see updater.js) ----
  let updateRepo = '';
  try { updateRepo = require('./package.json').updateRepo || ''; } catch (e) {}
  ipcMain.handle('update:state', () => updater.getState());
  ipcMain.handle('update:check', () => updater.check(true));
  ipcMain.handle('update:restart', () => updater.restartNow());
  updater.init({
    repo: updateRepo,
    send: (st) => { if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('update:state', st); },
  });
});

app.on('window-all-closed', () => app.quit());
