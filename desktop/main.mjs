import { app, BrowserWindow, dialog, ipcMain, screen, Menu } from 'electron';
import { fork } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import preferencesModule from './preferences.cjs';
import windowPolicy from './windowPolicy.cjs';
import {createPanelReadyHandler} from './panelReady.cjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appName = 'HIVE markdown editor';
app.setName(appName);
// Keep existing documents, preferences and the single-instance identity after renaming.
// Explicit isolation for acceptance runs still takes precedence.
app.setPath('userData', process.env.HIVE_DESKTOP_USER_DATA
  ? path.resolve(process.env.HIVE_DESKTOP_USER_DATA)
  : path.join(app.getPath('appData'), 'HIVE'));
const preload = path.join(root, 'desktop', 'preload.cjs');
let service, mainWindow, origin, rendererReady = false, closePending = false, exiting = false, stoppingService = false;
const panels = new Set();
const panelWindows = new Map();
const readyPanelIds = new Set();
const deliberatelyHiddenPanels = new Set();
const sizeTargets = new WeakMap();
let lastActivePanel = null, restoringWindows = false;
let panelDrag = null;
let appActive = true, appBlurTimer;
let closeTimer;
let preferenceStore, initialPreferences = {};
let dockWindow, dockData = null, dockLoaded = false;
const webPreferences = { preload, contextIsolation: true, nodeIntegration: false, sandbox: true };
const sameOrigin = url => { try { return new URL(url).origin === origin; } catch { return false; } };
function emitPanelMove(id, phase, free=panelDrag?.free===true) {
  if (id === 'global-toolbar' || !mainWindow || mainWindow.isDestroyed() || exiting || !readyPanelIds.has(id)) return;
  const point = windowPolicy.contentPoint(screen.getCursorScreenPoint(), mainWindow.getContentBounds(), mainWindow.webContents.getZoomFactor());
  mainWindow.webContents.send('hive:panel-move', {id,phase,...point,free});
}
function cancelPanelDrag(id) {
  if (!panelDrag || (id !== undefined && panelDrag.id !== id)) return;
  const drag = panelDrag; panelDrag = null;
  const child=panelWindows.get(drag.id);
  if(drag.id!=='global-toolbar'&&child&&!child.isDestroyed()){child.setBounds(drag.startBounds);sizeTargets.set(child,{width:drag.startBounds.width,height:drag.startBounds.height});}
  if (process.env.HIVE_DESKTOP_USER_DATA) console.log('HIVE drag cancel:', JSON.stringify({id:drag.id,from:drag.startBounds,edge:drag.edge}));
  emitPanelMove(drag.id, 'cancel');
}
function panelId(url) {
  try {
    const parsed = new URL(url), id = parsed.searchParams.get('panelWindow');
    return parsed.origin === origin && parsed.pathname === '/' && parsed.searchParams.size === 1 && /^[A-Za-z0-9_:-]{1,128}$/.test(id || '') && !parsed.hash ? id : null;
  } catch { return null; }
}
function panelBounds(features, id) {
  const values = Object.fromEntries((features || '').split(',').map(part => part.trim().split('=')));
  const number = (key, fallback) => Number.isFinite(Number(values[key])) && values[key] !== undefined ? Math.round(Number(values[key])) : fallback;
  const base = mainWindow.getBounds();
  if (id === 'global-toolbar') return {...windowPolicy.toolbarPosition(base, screen.getDisplayMatching(base).workArea),width:352,height:104};
  const editor = id === 'editor' || id.startsWith('editor:');
  const maxWidth = editor ? 760 : 380, maxHeight = editor ? 620 : 520;
  const desired = { x: number('left', number('x', base.x + 50)), y: number('top', number('y', base.y + 50)), width: Math.min(maxWidth, Math.max(220, number('width', maxWidth))), height: Math.min(maxHeight, Math.max(140, number('height', maxHeight))) };
  const area = screen.getDisplayMatching(desired).workArea;
  desired.width = Math.min(desired.width, area.width); desired.height = Math.min(desired.height, area.height);
  desired.x = Math.max(area.x, Math.min(desired.x, area.x + area.width - desired.width));
  desired.y = Math.max(area.y, Math.min(desired.y, area.y + area.height - 40));
  return desired;
}
function secureWindow(window, primary = false, entry = '') {
  // In-app links and browser reload must not tear down the owner of unsaved sessions.
  let loaded = false;
  window.on('will-resize', (_event, bounds) => { if (!panelDrag && !window.isMaximized()) sizeTargets.set(window,{width:bounds.width,height:bounds.height}); });
  window.webContents.on('will-navigate', (event, url) => { if (!windowPolicy.allowNavigation(url, entry, loaded)) event.preventDefault(); });
  window.webContents.on('will-redirect', event => event.preventDefault());
  window.webContents.once('did-finish-load', () => { loaded = true; });
  window.webContents.on('did-fail-load', (_event, code, description, url, mainFrame) => { if (mainFrame) console.error(`Window load failed: ${code} ${description} ${url}`); });
  window.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F5' || (input.control || input.meta) && input.key.toLowerCase() === 'r') event.preventDefault();
  });
  window.webContents.setWindowOpenHandler(({ url, features }) => {
    const id = primary && panelId(url);
    if (!id || panels.has(id)) return { action: 'deny' };
    panels.add(id);
    const created = (child, details) => {
      if (panelId(details.url) !== id) return;
      clearTimeout(expiry); window.webContents.removeListener('did-create-window', created);
      secureWindow(child, false, details.url); panelWindows.set(id, child);
      let moving = false;
      if (process.platform === 'win32' && id !== 'global-toolbar') {
        child.on('will-move', () => { if (panelDrag) return; moving = true; emitPanelMove(id, 'move'); });
        child.on('moved', () => { if (moving && !panelDrag) { moving = false; emitPanelMove(id, 'end'); } });
        child.on('closed', () => { if (moving) emitPanelMove(id, 'cancel'); moving = false; });
      }
      let normalBounds = child.getBounds();
      child.on('resize', () => { if (!child.isMaximized()) normalBounds = child.getBounds(); });
      child.on('move', () => { if (!child.isMaximized()) normalBounds = child.getBounds(); });
      child.on('maximize', () => { child.unmaximize(); child.setBounds(normalBounds); });
      child.on('focus', () => { if (!restoringWindows) { lastActivePanel = id; panelWindows.delete(id); panelWindows.set(id, child); } });
      child.on('minimize', () => cancelPanelDrag(id));
      child.on('hide', () => cancelPanelDrag(id));
      child.on('close', event => { cancelPanelDrag(id); if (!exiting) { event.preventDefault(); mainWindow?.webContents.send('hive:panel-close-requested', id); } });
      child.once('closed', () => { cancelPanelDrag(id); panels.delete(id); panelWindows.delete(id); readyPanelIds.delete(id); deliberatelyHiddenPanels.delete(id); if (lastActivePanel === id) lastActivePanel = null; });
    };
    const expiry = setTimeout(() => { panels.delete(id); window.webContents.removeListener('did-create-window', created); }, 15000);
    window.webContents.on('did-create-window', created);
    expiry.unref();
    const toolbar = id === 'global-toolbar';
    const windowOptions = toolbar ? { width: 352, height: 104, minWidth: 352, minHeight: 104, resizable: false, minimizable: false, transparent: true, backgroundColor: '#00000000' } : { minWidth: 220, minHeight: 140, resizable: true, thickFrame: true, backgroundColor: '#18181b' };
    return { action: 'allow', overrideBrowserWindowOptions: { ...panelBounds(features, id), ...windowOptions, frame: false, maximizable: false, show: false, webPreferences } };
  });
}
async function stopService() {
  if (!service || service.exitCode !== null || service.signalCode !== null) return;
  stoppingService = true;
  await new Promise(resolve => {
    const child = service;
    const timer = setTimeout(() => { child.kill(); resolve(); }, 3000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
    if (child.connected) child.send({ type: 'hive-shutdown' }, error => { if (error) child.kill(); });
    else child.kill();
  });
}
async function completeExit() {
  if (exiting) return;
  clearTimeout(appBlurTimer);
  cancelPanelDrag();
  exiting = true;
  for (const window of BrowserWindow.getAllWindows()) window.destroy();
  try { await preferenceStore?.flush(); } catch (error) { console.error('Unable to save UI preferences:', error); }
  await stopService();
  app.quit();
}
function startService() {
  return new Promise((resolve, reject) => {
    const userData = app.getPath('userData');
    service = fork(path.join(root, 'server', 'index.mjs'), process.env.HIVE_DESKTOP_DEV === '1' && !app.isPackaged ? [] : ['--production'], {
      execPath: process.execPath, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', HIVE_PORT: '0', HIVE_STATE_DIR: path.join(userData, 'state'), HIVE_DOCUMENTS: path.join(userData, 'documents') },
    });
    let settled = false;
    const timeout = setTimeout(() => fail(new Error('本地服务启动超时。')), 30000);
    function fail(error) { if (settled) return; settled = true; clearTimeout(timeout); service.kill(); reject(error); }
    service.stdout.resume();
    service.stderr.on('data', chunk => console.error(String(chunk)));
    service.on('error', fail);
    service.on('exit', code => {
      if (!settled) fail(new Error(`本地服务退出 (${code})`));
      else if (!stoppingService && !exiting) {
        mainWindow?.webContents.send('hive:service-error');
        dialog.showErrorBox(`${appName} 本地服务已停止`, '请保留当前窗口并备份未保存的内容。保存与文件操作暂不可用。');
      }
    });
    service.on('message', message => { if (message?.type !== 'hive-ready' || settled) return; settled = true; clearTimeout(timeout); resolve(message.port); });
  });
}
const isMainSender = event => !!mainWindow && event.sender === mainWindow.webContents;
const isMainOrigin = event => isMainSender(event) && sameOrigin(event.senderFrame?.url);
function updateDockOverlay() {
  if (!dockWindow || dockWindow.isDestroyed() || !mainWindow || mainWindow.isDestroyed()) return;
  if (!dockData) { dockWindow.hide(); return; }
  dockWindow.setBounds(mainWindow.getContentBounds());
  if (!dockLoaded) return;
  dockWindow.webContents.setZoomFactor(mainWindow.webContents.getZoomFactor());
  dockWindow.webContents.send('hive:dock-overlay-data', dockData);
  dockWindow.showInactive();
}
function setDockOverlay(feedback) {
  dockData = feedback && (feedback.guides.length || feedback.ready || feedback.rail) ? feedback : null;
  if (!dockData) { updateDockOverlay(); return; }
  if (!dockWindow || dockWindow.isDestroyed()) {
    dockLoaded = false;
    dockWindow = new BrowserWindow({ ...mainWindow.getContentBounds(), frame:false, transparent:true, focusable:false, alwaysOnTop:true, skipTaskbar:true, resizable:false, movable:false, minimizable:false, maximizable:false, show:false, webPreferences:{preload:path.join(root,'desktop','dock-overlay.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true} });
    dockWindow.setIgnoreMouseEvents(true);
    dockWindow.webContents.on('will-navigate', event => event.preventDefault());
    dockWindow.webContents.on('will-redirect', event => event.preventDefault());
    dockWindow.webContents.setWindowOpenHandler(() => ({action:'deny'}));
    dockWindow.webContents.on('did-finish-load', () => { dockLoaded = true; updateDockOverlay(); });
    dockWindow.on('closed', () => { dockWindow = null; dockLoaded = false; });
    dockWindow.loadFile(path.join(root,'desktop','dock-overlay.html')).catch(error => console.error('Unable to load dock overlay:', error));
  }
  updateDockOverlay();
}
ipcMain.on('hive:dock-overlay', (event, value) => {
  if (!isMainOrigin(event)) return;
  try { setDockOverlay(windowPolicy.dockFeedback(value)); }
  catch (error) { console.error('Invalid dock overlay:', error.message); }
});
ipcMain.on('hive:preferences-read', event => { event.returnValue = isMainOrigin(event) ? initialPreferences : null; });
ipcMain.on('hive:preferences-save', (event, values) => {
  if (!isMainOrigin(event) || !preferenceStore) return;
  try { preferenceStore.save(values).catch(error => console.error('Unable to save UI preferences:', error)); }
  catch (error) { console.error('Invalid UI preferences:', error.message); }
});
ipcMain.on('hive:close-ready', event => { if (isMainSender(event)) rendererReady = true; });
ipcMain.on('hive:close-finish', (event, allow) => {
  if (!isMainSender(event) || !closePending || typeof allow !== 'boolean') return;
  closePending = false;
  clearTimeout(closeTimer);
  if (allow) void completeExit();
});
ipcMain.on('hive:panel-close', (event, id) => {
  if (isMainSender(event) && typeof id === 'string') { cancelPanelDrag(id); panelWindows.get(id)?.destroy(); }
});
ipcMain.on('hive:panel-ready',createPanelReadyHandler({
  isMainOrigin,panelWindows,mainWindow:()=>mainWindow,nativePanelBounds:windowPolicy.nativePanelBounds,readyPanelIds,sizeTargets,
  onAccepted:(id,child)=>{if(process.env.HIVE_DESKTOP_USER_DATA)console.log('HIVE window-ready:',JSON.stringify({id,bounds:child.getBounds()}));},
  onRejected:detail=>console.warn('HIVE panel-ready rejected:',JSON.stringify(detail)),
}));
ipcMain.on('hive:window-command', (event, command, id) => {
  if (!isMainOrigin(event) || !windowPolicy.commandAllowed(command, id !== undefined, id) || (id !== undefined && typeof id !== 'string')) return;
  const target = id === undefined ? mainWindow : panelWindows.get(id);
  if (!target || target.isDestroyed()) return;
  if (['minimize','hide','close','maximize'].includes(command)) cancelPanelDrag(id ?? '$main');
  if (command === 'minimize') target.minimize();
  else if (command === 'maximize') { if (target.isMaximized()) target.unmaximize(); else target.maximize(); }
  else if (command === 'focus') { if (id !== undefined) deliberatelyHiddenPanels.delete(id); if (target.isMinimized()) target.restore(); target.show(); target.focus(); }
  else if (command === 'hide') { deliberatelyHiddenPanels.add(id); target.hide(); }
  else target.close();
});
ipcMain.on('hive:panel-drag', (event, id, phase, edge, free) => {
  if (!isMainOrigin(event)) { if (phase === 'start') event.returnValue = false; return; }
  const child = id === '$main' ? mainWindow : typeof id === 'string' ? panelWindows.get(id) : null;
  const ready = id === '$main' ? rendererReady : readyPanelIds.has(id);
  const canRestore = id === '$main' && edge === undefined && (phase === 'start' || panelDrag?.pendingRestore);
  if (!windowPolicy.dragAllowed(panelDrag?.id ?? null, id, phase, ready, !!child && !child.isDestroyed() && child.isVisible() && !child.isMinimized() && (!child.isMaximized() || canRestore), edge)) { if (phase === 'start') event.returnValue = false; return; }
  if (phase === 'start') {
    const cursor=screen.getCursorScreenPoint();
    const maximized=child.isMaximized(), actual=child.getBounds(), normal=child.getNormalBounds(), target=sizeTargets.get(child);
    panelDrag = {id,edge,free:free===true,startBounds:maximized ? actual : windowPolicy.withTargetSize(actual,target),startCursor:cursor,pendingRestore:maximized,normalBounds:windowPolicy.withTargetSize(normal,target)};
    if (process.env.HIVE_DESKTOP_USER_DATA) console.log('HIVE drag start:',JSON.stringify({id,from:panelDrag.startBounds,edge}));
    event.returnValue = true; return;
  }
  if (phase === 'cancel') { cancelPanelDrag(id); return; }
  panelDrag.free=free===true;
  if (panelDrag.pendingRestore) {
    const cursor=screen.getCursorScreenPoint();
    if(Math.hypot(cursor.x-panelDrag.startCursor.x,cursor.y-panelDrag.startCursor.y)<4){if(phase==='end')panelDrag=null;return;}
    const position=windowPolicy.restoredPosition(panelDrag.startBounds,panelDrag.normalBounds,panelDrag.startCursor),previous=restoringWindows;
    panelDrag.startBounds={...panelDrag.normalBounds,...position};panelDrag.pendingRestore=false;
    restoringWindows=true;
    try { child.unmaximize(); child.setBounds(panelDrag.startBounds); } finally { restoringWindows=previous; }
  }
  if (panelDrag.edge) { const [minWidth,minHeight] = child.getMinimumSize(), requested=windowPolicy.resizeBounds(panelDrag.startBounds, panelDrag.startCursor, screen.getCursorScreenPoint(), panelDrag.edge, minWidth, minHeight); child.setBounds(requested); sizeTargets.set(child,{width:requested.width,height:requested.height}); }
  else child.setBounds(windowPolicy.dragBounds(panelDrag.startBounds, panelDrag.startCursor, screen.getCursorScreenPoint()));
  const resizing = !!panelDrag.edge;
  if (phase === 'end' && process.env.HIVE_DESKTOP_USER_DATA) console.log('HIVE drag end:',JSON.stringify({id,from:panelDrag.startBounds,to:child.getBounds(),edge:panelDrag.edge}));
  const freeMove=panelDrag.free;
  if (phase === 'end') panelDrag = null;
  if (!resizing) emitPanelMove(id, phase,freeMove);
});
function showAllWindows(focusLast = false, restoreMinimized = false) {
  if (!mainWindow || mainWindow.isDestroyed() || restoringWindows || exiting) return;
  restoringWindows = true;
  try {
    if (mainWindow.isMinimized()) { if (!restoreMinimized) return; mainWindow.restore(); }
    if (focusLast || !mainWindow.isVisible()) mainWindow.showInactive();
    const ready = windowPolicy.readyPanels(panelWindows, readyPanelIds).filter(([id]) => !deliberatelyHiddenPanels.has(id));
    for (const [, child] of ready) {
      if (child.isMinimized()) { if (!restoreMinimized) continue; child.restore(); }
      if (!child.isVisible()) { if (restoreMinimized) child.showInactive(); }
      else if (focusLast) child.showInactive();
      else child.moveTop();
    }
    const last = ready.find(([id, child]) => id === lastActivePanel && !child.isMinimized() && child.isVisible())?.[1];
    if (focusLast) (last || mainWindow).focus();
    else if (!mainWindow.isFocused()) mainWindow.focus();
  } finally { restoringWindows = false; }
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => showAllWindows(true, true));
  app.on('activate', () => showAllWindows(true, true));
  app.on('browser-window-blur', () => {
    clearTimeout(appBlurTimer);
    appBlurTimer = setTimeout(() => { if (!BrowserWindow.getFocusedWindow()) appActive = false; }, 50);
  });
  app.on('browser-window-focus', () => {
    clearTimeout(appBlurTimer);
    const wasInactive = !appActive;
    appActive = true;
    if (wasInactive && !restoringWindows && !exiting) showAllWindows(true, true);
  });
  app.whenReady().then(async () => {
    try {
      Menu.setApplicationMenu(null);
      if (process.env.HIVE_DESKTOP_USER_DATA) console.log('HIVE displays:', JSON.stringify(screen.getAllDisplays().map(({id,bounds,workArea,scaleFactor}) => ({id,bounds,workArea,scaleFactor}))));
      preferenceStore = preferencesModule.preferenceStore(path.join(app.getPath('userData'), 'ui-preferences.json'));
      initialPreferences = await preferenceStore.read();
      const port = await startService(); origin = `http://127.0.0.1:${port}`;
      mainWindow = new BrowserWindow({ width: 1280, height: 800, minWidth: 640, minHeight: 420, frame: false, resizable: true, thickFrame: true, backgroundColor: '#18181b', show: false, webPreferences });
      secureWindow(mainWindow, true, `${origin}/`);
      mainWindow.on('move', updateDockOverlay);
      mainWindow.on('resize', updateDockOverlay);
      mainWindow.on('focus', () => { if (!restoringWindows) { lastActivePanel = null; showAllWindows(); } });
      mainWindow.on('restore', () => { if (!restoringWindows) showAllWindows(false, true); });
      mainWindow.webContents.on('did-start-loading', () => { rendererReady = false; closePending = false; });
      mainWindow.once('ready-to-show', () => mainWindow.show());
      mainWindow.webContents.on('console-message', event => { if (event.level === 'error') console.error(event.message); });
      mainWindow.on('close', event => {
        if (exiting) return;
        event.preventDefault();
        if (!rendererReady) { void completeExit(); return; }
        if (!closePending) {
          closePending = true; mainWindow.webContents.send('hive:close-requested');
          closeTimer = setTimeout(() => { closePending = false; if (mainWindow && !exiting) dialog.showErrorBox(`${appName} 退出未完成`, '保存等待超时，窗口和内容已保留。请检查保存状态后重试退出。'); }, 25000);
        }
      });
      mainWindow.on('closed', () => { mainWindow = null; });
      await mainWindow.loadURL(origin);
      mainWindow.show();
      if (!sizeTargets.has(mainWindow)) { const {width,height}=mainWindow.getNormalBounds(); sizeTargets.set(mainWindow,{width,height}); }
      if (process.env.HIVE_DESKTOP_USER_DATA) console.log('HIVE window-ready:',JSON.stringify({id:'$main',bounds:mainWindow.getBounds()}));
    } catch (error) { dialog.showErrorBox(`${appName} 启动失败`, String(error.message || error)); await completeExit(); }
  });
  app.on('before-quit', event => { if (!exiting) { event.preventDefault(); if (mainWindow) mainWindow.close(); else void completeExit(); } });
  app.on('window-all-closed', () => { if (!exiting) void completeExit(); });
}
