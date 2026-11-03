const { app, BrowserWindow, WebContentsView, ipcMain, session, Menu, dialog, screen, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs');
const { navigationPolicy } = require('./navigation.cjs');
const { watchLoginReturn } = require('./login-return.cjs');
const { readLoginState, logoutAccount } = require('./account.cjs');
const { readFollowingLives } = require('./following.cjs');
const { gestureBounds } = require('./pip-geometry.cjs');
const { Recorder } = require('./recorder.cjs');
const { VodDownload } = require('./vod-download.cjs');
const { Captions } = require('./captions.cjs');
const { VodCaptionAudio } = require('./vod-captions.cjs');
const { LiteMode } = require('./lite-mode.cjs');
const { MultiChat } = require('./multi-chat.cjs');
const { ChatPopout } = require('./chat-popout.cjs');
const { normalizeViewingState, readViewingState, saveViewingState } = require('./viewing-state.cjs');
const { readWindowSettings, fitWindow, saveWindowSettings } = require('./window-settings.cjs');

const root = path.resolve(__dirname, '..');
const appIcon = path.join(root, 'public', 'assets', 'app.ico');
const profile = app.isPackaged ? path.join(path.dirname(process.execPath), 'profile') : path.join(root, '.desktop-profile');
app.setPath('userData', profile);
const windowSettingsFile = path.join(profile,'window-state.json');
const windowSettings = readWindowSettings(windowSettingsFile);
let mainSaveTimer, pipSaveTimer;
app.setName('AZZZT LOCAL VIEWER');
if (!app.requestSingleInstanceLock()) {
  app.quit();
  return;
}
let win, server, chat, origin, currentChannel, chatBounds;
let chatSession, loggedIn = null, accountBusy = false, accountRevision = 0, accountTimer;
let playerOnly = false, normalWindowBounds, normalWindowMaximized = false;
let pipWindow;
let pipGesture;
let recorder, downloader, captions, vodCaptions, captureCommandBusy = false, closingCapture = false;
let multiChat;
let chatPopout,liteController,liteMode=false;
const popups = new Set();
function workAreas() {
  const primary = screen.getPrimaryDisplay();
  return [primary,...screen.getAllDisplays().filter(display=>display.id!==primary.id)].map(display=>display.workArea);
}
function writeSettings() { try { saveWindowSettings(windowSettingsFile,windowSettings); } catch {} }
function rememberMain() {
  clearTimeout(mainSaveTimer);
  if (!win || win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return;
  windowSettings.main = { bounds: playerOnly ? normalWindowBounds : win.getNormalBounds(), maximized: playerOnly ? normalWindowMaximized : win.isMaximized() };
  writeSettings();
}
function scheduleMainSave() {
  if (playerOnly || win?.isFullScreen()) return;
  clearTimeout(mainSaveTimer); mainSaveTimer = setTimeout(rememberMain,200);
}
function naverURL(value) {
  return navigationPolicy(value).allowed;
}
function trusted(event) {
  return win && !win.isDestroyed() && event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame && event.senderFrame.url.startsWith(origin + '/');
}
function sendStatus(text) { if (win && !win.isDestroyed()) win.webContents.send('chat:status', text); }
function publishAccount() {
  const state = { loggedIn, busy: accountBusy };
  if (win && !win.isDestroyed()) win.webContents.send('chat:account', state);
  return state;
}
async function refreshAccount() {
  if (liteMode || accountBusy || !chatSession) return publishAccount();
  const revision = ++accountRevision;
  try {
    const value = await readLoginState(chatSession);
    if (revision === accountRevision) loggedIn = value;
  } catch {
    if (revision === accountRevision) sendStatus('로그인 상태를 확인하지 못했습니다. 로그인 확인 버튼으로 다시 확인해 주세요.');
  }
  return publishAccount();
}
function scheduleAccountCheck() {
  if(liteMode)return;
  clearTimeout(accountTimer);
  accountTimer = setTimeout(refreshAccount, 300);
}
function authDiagnostic(kind, value = '', code = '') {
  let host; try { const u = new URL(value); host = u.hostname ? `${u.protocol}//${u.host}` : u.protocol; } catch { host = 'unknown'; }
  try {
    fs.mkdirSync(profile, { recursive: true });
    const logPath = path.join(profile, 'login-diagnostics.log');
    if (fs.existsSync(logPath) && fs.statSync(logPath).size > 64000) fs.writeFileSync(logPath, '');
    fs.appendFileSync(logPath, `${new Date().toISOString()} ${kind} ${host} ${code}\n`);
  } catch {}
}
function restoreChannelChat(contents = chat?.webContents, channel = currentChannel) {
  if (liteMode || !contents || contents.isDestroyed() || !channel) return;
  const target = `https://chzzk.naver.com/live/${channel}/chat`;
  if (contents.getURL() === target) contents.reload();
  else contents.loadURL(target).catch(error => sendStatus(error.message));
}
function guard(contents, { chatWindow = false, popup = null, expectedLogin = false, channel = null } = {}) {
  watchLoginReturn(contents, () => {
    scheduleAccountCheck();
    if (chatWindow) {
      restoreChannelChat(contents,channel||currentChannel);
      sendStatus('로그인 처리가 끝나 원래 채널의 채팅으로 돌아왔습니다.');
    } else if (popup) {
      setImmediate(() => {
        if (!popup.isDestroyed()) popup.close();
      });
    }
  }, expectedLogin);
  const validateNavigation = (event, url) => {
    const policy = navigationPolicy(url);
    if (policy.allowed) return;
    event.preventDefault(); authDiagnostic('navigation-blocked', url);
    sendStatus('네이버 외부 주소로의 이동이 차단되었습니다. 연결 기록을 확인해 주세요.');
  };
  contents.on('will-navigate', validateNavigation);
  contents.on('will-redirect', validateNavigation);
  contents.on('did-fail-load', (_event, code, description, url, mainFrame) => {
    if (mainFrame && code !== -3) { authDiagnostic('load-failed', url, code); sendStatus(`로그인/채팅 연결 오류: ${description}`); }
  });
  contents.setWindowOpenHandler(({ url }) => {
    // Form-target login flows may first open an empty window, then navigate it.
    // The new window has no preload or Node access and is guarded before navigation.
    if (!naverURL(url) && url !== 'about:blank') { authDiagnostic('popup-blocked', url); return { action: 'deny' }; }
    authDiagnostic('popup-opened', url);
    return {
    action: 'allow', overrideBrowserWindowOptions: {
      width: 600, height: 850, autoHideMenuBar: true, parent: win, icon: appIcon,
      webPreferences: { session: contents.session, nodeIntegration: false, contextIsolation: true, sandbox: true }
    }
    };
  });
  contents.on('did-create-window', (popup, details) => {
    popups.add(popup); popup.on('closed', () => { popups.delete(popup); restoreChannelChat(); scheduleAccountCheck(); });
    guard(popup.webContents, { popup, expectedLogin: details?.url ? new URL(details.url).hostname === 'nid.naver.com' : false });
  });
}
function layoutChat() {
  if (!chat || !win || win.isDestroyed()) return;
  if(chatPopout?.has('primary'))return;
  const [width, height] = win.getContentSize();
  const b = chatBounds;
  const visible = !!((!playerOnly || b?.fullscreenChat === true) && currentChannel && b?.visible && b.width > 10 && b.height > 10);
  chat.setVisible(visible);
  if (visible) {
    const x = Math.max(0, Math.round(b.x)), y = Math.max(0, Math.round(b.y));
    chat.setBounds({ x, y, width: Math.max(1, Math.min(Math.round(b.width), width - x)), height: Math.max(1, Math.min(Math.round(b.height), height - y)) });
  }
}
function ensurePrimaryChat(){
  if(chat&&!chat.webContents.isDestroyed())return;
  chat = new WebContentsView({ webPreferences: { session: chatSession, contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.contentView.addChildView(chat); chat.setVisible(false);
  guard(chat.webContents, { chatWindow: true });
  chat.webContents.on('did-finish-load', () => {
    sendStatus('공식 채팅'); scheduleAccountCheck();
  });
  chat.webContents.on('did-fail-load', (_e, code, description, _url, mainFrame) => {
    if (mainFrame && code !== -3) sendStatus(`채팅 연결 실패: ${description}. 채팅 새로고침을 눌러 주세요.`);
  });
}
async function openChat(id) {
  if(liteMode)return;
  ensurePrimaryChat();
  if (!/^[a-f\d]{32}$/i.test(id)) throw new Error('잘못된 채널 ID입니다.');
  const changed = currentChannel !== id;
  currentChannel = id;
  layoutChat();
  if (changed) {
    sendStatus('공식 채팅에 연결하는 중…');
    await chat.webContents.loadURL(`https://chzzk.naver.com/live/${id}/chat`);
  }
}
app.on('second-instance', () => {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
});
app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  const { createApp } = await import(pathToFileURL(path.join(root, 'server.mjs')).href);
  const appBase = app.isPackaged ? path.dirname(process.execPath) : root;
  recorder = new Recorder({ root: path.join(appBase, 'Recordings'), base: appBase });
  downloader = new VodDownload({ root: path.join(appBase, 'Downloads'), ffmpeg: recorder.ffmpeg });
  captions = new Captions();
  vodCaptions = new VodCaptionAudio(recorder.ffmpeg);
  const captionState = () => ({...captions.state(),vodAvailable:!!recorder.ffmpeg});
  captions.on('state', state => { if (!state.active) vodCaptions.cancel(); if (win && !win.isDestroyed()) win.webContents.send('caption:state',{...state,vodAvailable:!!recorder.ffmpeg}); });
  captions.on('result', result => { if (win && !win.isDestroyed()) win.webContents.send('caption:result',result); });
  downloader.on('state', state => { if (win && !win.isDestroyed()) win.webContents.send('vod:download-state', state); });
  recorder.on('state', state => { if (win && !win.isDestroyed()) win.webContents.send('capture:state', state); });
  server = createApp({ recorder });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
  recorder.origin = origin;
  chatSession = session.fromPartition('persist:official-chzzk');
  chatSession.cookies.on('changed', (_event, cookie) => {
    if (['NID_AUT', 'NID_SES'].includes(cookie.name)) scheduleAccountCheck();
  });
  chatSession.webRequest.onBeforeRequest({ urls: ['http://nid.naver.com/*'] }, (details, callback) => {
    const policy = navigationPolicy(details.url);
    if (policy.upgrade) {
      authDiagnostic('login-https-upgrade', details.url);
      callback({ redirectURL: policy.upgrade });
    } else callback({ cancel: true });
  });
  chatSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  chatSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === 'fullscreen'));
  const initialMain = fitWindow(windowSettings.main?.bounds,workAreas(),{width:1440,height:940,minWidth:1000,minHeight:650});
  win = new BrowserWindow({
    icon: appIcon,
    ...initialMain, minWidth: Math.min(1000,initialMain.width), minHeight: Math.min(650,initialMain.height),
    title: '아자자잣 · Chzzk Local Viewer', backgroundColor: '#101214', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, autoplayPolicy: 'no-user-gesture-required' }
  });
  ensurePrimaryChat();
  chatPopout=new ChatPopout({window:win,createWindow:()=>new BrowserWindow({icon:appIcon,width:440,height:820,parent:win,show:false,autoHideMenuBar:true,title:'채팅 · AZZZT',webPreferences:{session:chatSession,contextIsolation:true,nodeIntegration:false,sandbox:true}}),onState:(id,detached,disposed)=>{
    if(win&&!win.isDestroyed())win.webContents.send('chat:popout-state',{id,detached,disposed});
    if(!detached&&!disposed){if(id==='primary')layoutChat();else multiChat?.layout(id);}
  }});
  multiChat=new MultiChat({window:win,
    createView:()=>new WebContentsView({webPreferences:{session:chatSession,contextIsolation:true,nodeIntegration:false,sandbox:true}}),
    guard:(contents,channel)=>guard(contents,{chatWindow:true,channel}),isDetached:id=>chatPopout.has(id),onClose:id=>chatPopout.close(id,true)});
  win.webContents.on('did-start-navigation',(_event,_url,inPlace,mainFrame)=>{if(mainFrame&&!inPlace){chatPopout.close('primary');multiChat.closeAll();}});
  ipcMain.handle('multi:chat',async(event,action,id,channel)=>{
    if(!trusted(event))return;
    try{if(liteMode)throw Error('Lite 모드에서는 채팅을 사용할 수 없습니다.');if(action==='open')await multiChat.open(id,channel);else if(action==='close')multiChat.close(id);else if(action==='detach'){const record=multiChat.views.get(id);if(!record)throw Error('채팅 연결 후 다시 시도하세요.');chatPopout.open(id,record.view);}else if(action==='attach')chatPopout.close(id);else throw Error('올바르지 않은 채팅 작업입니다.');return {ok:true};}catch(error){return {error:error.message};}
  });
  ipcMain.on('multi:bounds',(event,id,bounds)=>{if(trusted(event))multiChat.bounds(id,bounds);});
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== origin) event.preventDefault(); });
  liteController=new LiteMode({recorder,downloader,captions,vodCaptions,setEnabled:enabled=>{liteMode=enabled;accountRevision++;clearTimeout(accountTimer);},closeViews:()=>{
    currentChannel=null;chatPopout.close('primary');multiChat.closeAll();
    if(chat){win.contentView.removeChildView(chat);if(!chat.webContents.isDestroyed())chat.webContents.close();chat=null;}
    if(pipWindow&&!pipWindow.isDestroyed())pipWindow.close();
    for(const popup of popups)if(!popup.isDestroyed())popup.close();
  }});
  ipcMain.handle('player:lite',async(event,enabled)=>{
    if(!trusted(event)||typeof enabled!=='boolean')return {error:'잘못된 Lite 모드 요청입니다.'};
    if(captureCommandBusy)return {error:'녹화 작업이 끝난 뒤 다시 시도해 주세요.'};
    try{await liteController.set(enabled);return {enabled:liteMode};}catch(error){return {error:error.message};}
  });
  ipcMain.handle('chat:open', async (event, id) => { if (!trusted(event)) return; try { await openChat(id); return { ok: true }; } catch (e) { sendStatus(e.message); return { ok: false }; } });
  ipcMain.handle('chat:clear', async event => {if(!trusted(event))return;currentChannel=null;chatPopout.close('primary');if(chat){chat.setVisible(false);await chat.webContents.loadURL('about:blank');}return {ok:true};});
  ipcMain.on('chat:bounds', (event, bounds) => {
    if (!trusted(event) || !bounds || !['x', 'y', 'width', 'height'].every(k => Number.isFinite(bounds[k]))) return;
    chatBounds = { ...bounds, visible: bounds.visible === true }; layoutChat();
  });
  ipcMain.on('chat:reload', event => { if (trusted(event)) restoreChannelChat(); });
  ipcMain.handle('chat:account', async event => trusted(event) ? refreshAccount() : null);
  ipcMain.handle('capture:state', event => trusted(event) ? recorder.state() : null);
  ipcMain.handle('caption:state', event => trusted(event) ? captionState() : null);
  const homeSettingsFile=path.join(profile,'home-settings.json');
  ipcMain.handle('home:settings',(event,value)=>{
    if(!trusted(event))return null;
    if(value!==undefined){if(!value||typeof value!=='object'||JSON.stringify(value).length>300000)throw Error('목록 설정이 올바르지 않습니다.');fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(homeSettingsFile,JSON.stringify(value));return true;}
    try{return JSON.parse(fs.readFileSync(homeSettingsFile,'utf8'));}catch{return null;}
  });
  const captionPositionFile=path.join(profile,'caption-position.json');
  const validCaptionPosition=value=>value&&Number.isFinite(value.x)&&Number.isFinite(value.y)&&value.x>=0&&value.x<=1&&value.y>=0&&value.y<=1;
  ipcMain.handle('caption:position',event=>{
    if(!trusted(event))return null;
    try{const value=JSON.parse(fs.readFileSync(captionPositionFile,'utf8'));return validCaptionPosition(value)?value:null;}catch{return null;}
  });
  ipcMain.handle('caption:set-position',(event,value)=>{
    if(!trusted(event)||value!==null&&!validCaptionPosition(value))return false;
    try{fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(captionPositionFile,JSON.stringify(value===null?null:{x:value.x,y:value.y}));return true;}catch{return false;}
  });
  ipcMain.handle('caption:start', (event, model, device, language) => {
    if (!trusted(event)) return;
    try { if(liteMode)throw Error('Lite 모드에서는 자막을 사용할 수 없습니다.');captions.start(model,device,language); return { state: captionState() }; } catch(error) { return { error: error.message, state: captionState() }; }
  });
  ipcMain.handle('caption:stop', event => { if (!trusted(event)) return; captions.stop(); return captionState(); });
  ipcMain.on('caption:audio', (event, data) => { if (trusted(event)) captions.audio(data); });
  ipcMain.on('caption:reset', (event, epoch) => { if (trusted(event)) { captions.reset(epoch); vodCaptions.cancel(); } });
  ipcMain.handle('caption:vod', async (event, config = {}) => {
    if (!trusted(event)) return;
    try {
      if(liteMode)return {cancelled:true};
      const source = server.vodAudioSource(config.url,config.videoId);
      if (!source || !captions.ready || config.epoch !== captions.epoch) throw new Error('재생 중인 다시보기와 자막 상태를 확인해 주세요.');
      const pcm = await vodCaptions.decode(origin+source.path,config.start,config.duration,source.hls);
      if (config.epoch !== captions.epoch || !captions.ready) return {cancelled:true};
      const accepted = captions.audio({pcm,epoch:config.epoch,start:config.start,end:config.start+pcm.length/64000,capturedAt:Date.now(),mode:'vod'});
      return {accepted};
    } catch(error) { return {error:error.message}; }
  });
  ipcMain.handle('caption:live', async (event, config = {}) => {
    if (!trusted(event)) return;
    try {
      if(liteMode)return {cancelled:true};
      const source=server.liveAudioSource(config.url);
      if(!source||!captions.ready||config.epoch!==captions.epoch)throw Error('라이브 자막 상태를 확인해 주세요.');
      const pcm=await vodCaptions.decode(origin+source,config.start,config.duration,{sn:config.sn,time:config.time});
      if(config.epoch!==captions.epoch||!captions.ready)return {cancelled:true};
      return {accepted:captions.audio({pcm,epoch:config.epoch,start:config.start,end:config.start+pcm.length/64000,capturedAt:Date.now(),mode:'vod'})};
    }catch(error){return {error:error.message};}
  });
  ipcMain.handle('vod:download-state', event => trusted(event) ? downloader.state() : null);
  ipcMain.handle('vod:download', async (event, action, config = {}) => {
    if (!trusted(event)) return;
    try {
      if(liteMode&&action==='start')throw Error('Lite 모드에서는 다운로드를 사용할 수 없습니다.');
      if (action === 'start') {
        const source = server.vodSource(config.url, config.videoId);
        if (!source) throw new Error('재생 중인 다시보기의 화질 주소를 먼저 불러와 주세요.');
        await downloader.start({ ...config, url: origin + source });
      } else if (action === 'cancel') await downloader.cancel();
      else if (action === 'folder') { await fs.promises.mkdir(downloader.state().folder, { recursive: true }); await shell.openPath(downloader.state().folder); }
      else throw new Error('지원하지 않는 다운로드 작업입니다.');
      return { state: downloader.state() };
    } catch(error) { return { error: error.message, state: downloader.state() }; }
  });
  ipcMain.on('capture:playhead', (event, epoch) => { if (trusted(event)) recorder.markPlayhead(epoch); });
  ipcMain.handle('capture:command', async (event, action, config = {}) => {
    if(!trusted(event))return;
    if(liteMode)return {error:'Lite 모드에서는 녹화·리플레이를 사용할 수 없습니다.'};
    if (captureCommandBusy) return { error: '다른 녹화 작업을 처리 중입니다.' };
    captureCommandBusy = true;
    try {
      let state;
      if (action === 'record-start') state = await recorder.startRecording(config);
      else if (action === 'record-stop') state = await recorder.stopRecording(config.epoch);
      else if (action === 'replay-start') state = await recorder.setReplay(true, Number(config.minutes), config);
      else if (action === 'replay-stop') state = await recorder.setReplay(false, recorder.minutes);
      else if (action === 'replay-save') state = await recorder.saveReplay(config.epoch);
      else if (action === 'folder') { await fs.promises.mkdir(recorder.lastFolder, { recursive: true }); await shell.openPath(recorder.lastFolder); state = recorder.state(); }
      else throw new Error('알 수 없는 녹화 요청입니다.');
      return { state };
    } catch (error) { return { error: error.message, state: recorder.state() }; }
    finally { captureCommandBusy = false; }
  });
  ipcMain.handle('player:mode', (event, enabled) => {
    if (!trusted(event) || typeof enabled !== 'boolean') return playerOnly;
    if (enabled === playerOnly) return playerOnly;
    playerOnly = enabled;
    if (enabled) {
      normalWindowBounds = win.getNormalBounds(); normalWindowMaximized = win.isMaximized();
      if (normalWindowMaximized) win.unmaximize();
      const area = screen.getDisplayMatching(win.getBounds()).workArea;
      const width = Math.round(Math.min(960, area.width - 60, (area.height - 100) * 16 / 9));
      win.setMinimumSize(400, 250);
      win.setContentSize(width, Math.round(width * 9 / 16));
      win.setAspectRatio(16 / 9);
      win.center();
    } else {
      win.setAspectRatio(0); win.setMinimumSize(1000, 650);
      if (normalWindowBounds) win.setBounds(normalWindowBounds);
      if (normalWindowMaximized) win.maximize();
    }
    layoutChat();
    return playerOnly;
  });
  ipcMain.handle('player:pip', async (event, config) => {
    if (!trusted(event) || liteMode) return false;
    let url; try { url = new URL(config?.url, origin); } catch { return false; }
    if (url.origin !== origin || !/^\/(?:media\/[a-f\d]{32}|dvr\/[a-f\d]{24}\/index\.m3u8)$/.test(url.pathname)) return false;
    if (pipWindow && !pipWindow.isDestroyed()) { pipWindow.focus(); return true; }
    const initialPiP = fitWindow(windowSettings.pip?.bounds,workAreas(),{width:480,height:270,minWidth:240,minHeight:135,ratio:16/9});
    pipWindow = new BrowserWindow({ ...initialPiP, minWidth: 240, minHeight: 135,
      icon: appIcon,
      frame: false, thickFrame: false, hasShadow: false, roundedCorners: false,
      title: '아자자잣 · Chzzk Local Viewer · PiP', alwaysOnTop: true, autoHideMenuBar: true, backgroundColor: '#000000',
      webPreferences: { preload: path.join(__dirname, 'pip-preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, autoplayPolicy: 'no-user-gesture-required' }
    });
    const current = pipWindow;
    const rememberPiP = () => {
      clearTimeout(pipSaveTimer); if(current.isDestroyed()||current.isFullScreen())return;
      windowSettings.pip = {bounds:current.getBounds()}; writeSettings();
    };
    const schedulePiPSave = () => {clearTimeout(pipSaveTimer);pipSaveTimer=setTimeout(rememberPiP,200);};
    current.on('move',schedulePiPSave); current.on('resize',schedulePiPSave); current.on('close',rememberPiP);
    current.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    current.webContents.on('will-navigate', (event, target) => { if (new URL(target).origin !== origin) event.preventDefault(); });
    current.on('closed', () => {
      pipGesture = null;
      clearTimeout(pipSaveTimer);
      pipWindow = null;
      if (win && !win.isDestroyed()) {
        if (win.isMinimized()) win.restore(); win.show(); win.focus();
        win.webContents.send('player:pip-state', false);
      }
    });
    try {
      await current.loadURL(origin + '/pip.html');
      if (current.isDestroyed()) return false;
      current.webContents.send('pip:source', { url: url.href, volume: Number.isFinite(config.volume) ? Math.min(1, Math.max(0, config.volume)) : 1, muted: config.muted === true });
      win.webContents.send('player:pip-state', true);
      current.show(); current.focus(); rememberPiP();
      return true;
    } catch (error) { if (!current.isDestroyed()) current.close(); sendStatus(error.message); return false; }
  });
  ipcMain.on('player:pip-close', event => { if (trusted(event) && pipWindow && !pipWindow.isDestroyed()) pipWindow.close(); });
  ipcMain.on('pip:restore', event => { if (pipWindow && event.sender === pipWindow.webContents) pipWindow.close(); });
  ipcMain.on('pip:playhead', (event, epoch) => { if (pipWindow && event.sender === pipWindow.webContents) recorder.markPlayhead(epoch); });
  ipcMain.on('pip:gesture', (event, action, kind) => {
    if (!pipWindow || pipWindow.isDestroyed() || event.sender !== pipWindow.webContents) return;
    if (action === 'start' && ['move','n','s','e','w','nw','ne','sw','se'].includes(kind)) {
      pipGesture = { kind, bounds: pipWindow.getBounds(), point: screen.getCursorScreenPoint() };
    } else if ((action === 'update' || action === 'end') && pipGesture) {
      const point = screen.getCursorScreenPoint();
      pipWindow.setBounds(gestureBounds(pipGesture.bounds, pipGesture.kind, point.x - pipGesture.point.x, point.y - pipGesture.point.y));
      if (action === 'end') pipGesture = null;
    }
  });
  const addressFile = path.join(profile, 'last-address.json');
  const viewingFile = path.join(profile, 'viewing-state.json');
  ipcMain.handle('settings:viewing-state', event => {
    if (!trusted(event)) return null;
    if (fs.existsSync(viewingFile)) return readViewingState(viewingFile);
    try { return normalizeViewingState(JSON.parse(fs.readFileSync(addressFile, 'utf8'))); } catch { return null; }
  });
  ipcMain.on('settings:save-viewing-state', (event, value) => {
    event.returnValue = false;
    if (!trusted(event)) return;
    try { saveViewingState(viewingFile, value); event.returnValue = true; } catch {}
  });
  ipcMain.handle('settings:last-address', event => {
    if (!trusted(event)) return '';
    try {
      const saved = JSON.parse(fs.readFileSync(addressFile, 'utf8'));
      return typeof saved.address === 'string' ? saved.address : '';
    } catch { return ''; }
  });
  ipcMain.on('settings:save-address', (event, address) => {
    if (!trusted(event) || typeof address !== 'string' || address.length > 16384) return;
    try { fs.mkdirSync(profile, { recursive: true }); fs.writeFileSync(addressFile, JSON.stringify({ address })); } catch {}
  });
  ipcMain.handle('chat:following', async event => {
    if (!trusted(event)) return null;
    if (liteMode || loggedIn !== true || accountBusy) return { items: [] };
    try {
      const items = await readFollowingLives(chatSession);
      if (liteMode || loggedIn !== true || accountBusy) return { items: [] };
      return { items };
    } catch (error) { return { items: [], error: error.message }; }
  });
  ipcMain.handle('chat:logout', async event => {
    if (!trusted(event) || liteMode || accountBusy) return null;
    accountBusy = true; accountRevision++; publishAccount();
    try {
      for (const popup of popups) if (!popup.isDestroyed()) popup.close();
      loggedIn = await logoutAccount(chatSession);
      restoreChannelChat(); sendStatus('로그아웃되었습니다.');
    } catch (error) {
      loggedIn = null; restoreChannelChat(); sendStatus(error.message);
    } finally { accountBusy = false; publishAccount(); }
    return publishAccount();
  });
  ipcMain.on('chat:login', event => {
    if (!trusted(event) || liteMode) return;
    const popup = new BrowserWindow({ icon: appIcon, width: 600, height: 850, parent: win, autoHideMenuBar: true, title: '네이버 로그인', webPreferences: { session: chatSession, contextIsolation: true, nodeIntegration: false, sandbox: true } });
    popups.add(popup); guard(popup.webContents, { popup, expectedLogin: true });
    popup.on('closed', () => { popups.delete(popup); restoreChannelChat(); scheduleAccountCheck(); });
    const destination = currentChannel ? `https://chzzk.naver.com/live/${currentChannel}/chat` : 'https://chzzk.naver.com/';
    popup.loadURL(`https://nid.naver.com/nidlogin.login?url=${encodeURIComponent(destination)}`).catch(error => sendStatus(error.message));
  });
  ipcMain.handle('chat:popout', (event,action='detach') => {
    if (!trusted(event) || liteMode || !currentChannel || !chat) return {ok:false};
    try{if(action==='attach')chatPopout.close('primary');else chatPopout.open('primary',chat);return {ok:true,detached:chatPopout.has('primary')};}catch(error){return {ok:false,error:error.message};}
  });
  win.on('resize', layoutChat);
  win.on('resize',()=>multiChat.layout());
  win.on('move',scheduleMainSave); win.on('resize',scheduleMainSave);
  win.on('maximize',scheduleMainSave); win.on('unmaximize',scheduleMainSave);
  win.on('close', event => {
    rememberMain();
    if (closingCapture || (!recorder.session && !downloader.state().active)) return;
    event.preventDefault();
    (async () => {
      if (downloader.state().active) {
        const choice = await dialog.showMessageBox(win, { type: 'question', buttons: ['다운로드 취소 후 닫기', '계속 다운로드'], defaultId: 1, cancelId: 1, message: 'VOD 다운로드가 진행 중입니다. 취소하고 종료할까요?' });
        if (choice.response !== 0) return;
      }
      if (recorder.job) {
        const choice = await dialog.showMessageBox(win, { type: 'question', buttons: ['녹화 종료 후 닫기', '취소'], defaultId: 0, cancelId: 1, message: '진행 중인 녹화를 저장하고 종료할까요?' });
        if (choice.response !== 0) return;
      }
      closingCapture = true;
      await downloader.cancel();
      try { await recorder.shutdown(); }
      catch (error) { await dialog.showMessageBox(win, { type: 'error', message: error.message, detail: '녹화 폴더에 남은 영상 조각을 확인해 주세요.' }); }
      win.close();
    })();
  });
  win.on('closed', () => {
    chatPopout.closeAll();
    multiChat.closeAll();
    captions.stop();
    clearTimeout(accountTimer);
    clearTimeout(mainSaveTimer);
    if (pipWindow && !pipWindow.isDestroyed()) pipWindow.close();
    for (const popup of popups) if (!popup.isDestroyed()) popup.close();
    if (chat && !chat.webContents.isDestroyed()) chat.webContents.close();
    server.closeAllConnections(); server.close(); win = null;
  });
  if(windowSettings.main?.maximized)win.maximize();
  win.show();
  await win.loadURL(origin);
  refreshAccount();
}).catch(error => { dialog.showErrorBox('실행 오류', error.message); app.quit(); });
app.on('window-all-closed', () => app.quit());
