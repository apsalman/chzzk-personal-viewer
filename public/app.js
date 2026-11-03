const $ = id => document.getElementById(id);
let hls, activeChannel, resolved, generation = 0;
let preferredQuality = 'highest';
let qualityNotice = '';
let qualityLevels = [], masterSourceURL = '', fixedQuality = null;
let currentOriginalURL = '', sourceRevision = 0, linkDirty = false, lastRequest = null;
let resizingPanels = false;
let playingFragment;
const video = $('video');
let vodMode = false;
let currentVod = null;
let preferredVodSpeed = 1;
function applyPlaybackSpeed() {
  const speed = vodMode ? preferredVodSpeed : 1;
  video.defaultPlaybackRate = speed;
  video.playbackRate = speed;
  video.preservesPitch = true;
  $('playback-speed').value = String(preferredVodSpeed);
}
let viewingState = null, pendingVodResume = null, changingSource = false, lastViewingSave = 0;
function persistViewingState(force = false) {
  if (!viewingState || (!force && Date.now() - lastViewingSave < 2000)) return;
  if (viewingState.kind === 'vod' && !changingSource && pendingVodResume === null && video.readyState >= 1) viewingState.position = Math.max(0, video.currentTime);
  lastViewingSave = Date.now();
  try {
    localStorage.setItem('chzzk-viewing-state', JSON.stringify(viewingState));
    window.desktopChat?.saveViewingState?.(viewingState);
  } catch {}
}
const vodChatElement = document.createElement('div');
vodChatElement.id = 'vod-chat'; vodChatElement.hidden = true;
$('desktop-chat-slot').before(vodChatElement);
const vodChat = window.installVodChat(video, vodChatElement);
function setVodMode(data) {
  vodMode = data?.kind === 'vod';
  $('speed-control').hidden = !vodMode;
  applyPlaybackSpeed();
  currentVod = vodMode ? data : null;
  seekbar.setPreviewSource(vodMode ? data.preview : null);
  video.dataset.vod = String(vodMode);
  vodChat.open(vodMode ? data.videoId : null, data?.chatEnabled);
  document.querySelector('.chat-head strong').textContent = vodMode ? '다시보기 채팅' : '실시간 채팅';
  document.querySelector('.chat-note').textContent = vodMode ? '과거 채팅은 읽기 전용입니다. 탐색하면 해당 시점으로 이동합니다.' : '채팅 창에서 네이버 로그인 후 입력할 수 있습니다.';
  $('desktop-chat-slot').hidden = vodMode || !window.desktopChat;
  $('chat-empty').hidden = vodMode || !!window.desktopChat;
  $('popout').hidden = vodMode; $('chat-reload').hidden = vodMode || !window.desktopChat;
  $('capture-tools').hidden = vodMode || !window.desktopChat;
  $('edge').textContent = vodMode ? 'VOD' : 'LIVE';
  $('live-jump').textContent = vodMode ? 'VOD' : 'LIVE';
  for (const id of ['edge','live-jump','menu-live']) $(id).disabled = vodMode;
  requestAnimationFrame(reportChatBounds);
  window.vodDownloadController?.update();
}
const status = (text, error = false) => { $('status').textContent = text; $('status').classList.toggle('error', error); };
const isDvrSource = url => new URL(url, location.href).pathname.startsWith('/dvr/');
async function syncSourceLink(url, force = false) {
  const revision = ++sourceRevision;
  if (force) {
    currentOriginalURL = ''; linkDirty = false;
    $('m3u8-url').value = ''; $('m3u8-url').disabled = true;
    $('m3u8-apply').disabled = true; $('m3u8-reset').disabled = true;
    $('m3u8-note').textContent = '현재 재생 주소를 확인하는 중…';
  }
  try {
    const path = new URL(url, location.href).pathname;
    const response = await fetch('/api/source?path=' + encodeURIComponent(path));
    const data = await response.json();
    if (revision !== sourceRevision) return;
    if (!response.ok) throw new Error(data.error);
    currentOriginalURL = data.url;
    $('m3u8-url').disabled = false; $('m3u8-apply').disabled = false; $('m3u8-reset').disabled = false;
    if (!linkDirty) $('m3u8-url').value = currentOriginalURL;
    $('m3u8-note').textContent = linkDirty ? '주소를 수정 중입니다. ‘현재 주소 불러오기’를 누르면 최신 재생 주소로 되돌립니다.' : '현재 화질의 원본 m3u8 주소입니다. 수정한 뒤 ‘수정 주소로 재생’을 누르세요.';
  } catch (error) {
    if (revision !== sourceRevision) return;
    $('m3u8-note').textContent = error.message;
    // Keep manual input available even if the previous stream expired.
    $('m3u8-url').disabled = false; $('m3u8-apply').disabled = false;
  }
}
function qualityLabel(level) {
  const height = level.height || Number(level.url?.[0]?.match(/(?:^|\D)(\d{3,4})p(?:\D|$)/i)?.[1]);
  return height ? `${height}p${level.frameRate ? ' · ' + Math.round(level.frameRate) + 'fps' : ''}` : `${Math.round(level.bitrate / 1000)} kbps`;
}
function updateQualityBadge(instance) {
  let level = fixedQuality ? qualityLevels.find(level => level.height === fixedQuality) : instance.levels[instance.currentLevel];
  if (level && !level.height && video.videoHeight) level = { ...level, height: video.videoHeight };
  const mode = fixedQuality ? '고정' : qualityLevels.length === 1 ? '단일 화질' : '자동';
  $('quality-current').textContent = level ? `현재 ${qualityLabel(level)} · ${mode}` : '화질 전환 중…';
}
function configureQuality(instance) {
  const levels = qualityLevels;
  const heights = [...new Set(levels.map(l => l.height).filter(Boolean))].sort((a, b) => b - a);
  $('quality').replaceChildren(new Option('최고 화질', 'highest'), new Option('자동', 'auto'));
  heights.forEach(height => {
    const matches = levels.filter(l => l.height === height);
    const fps = Math.max(...matches.map(l => l.frameRate || 0));
    $('quality').add(new Option(`${height}p${fps ? ' · ' + Math.round(fps) + 'fps' : ''}`, String(height)));
  });
  $('quality').disabled = heights.length < 2;
  qualityNotice = levels.length === 1 ? '이 주소는 단일 화질입니다. 다른 화질을 선택하려면 방송 주소나 마스터 m3u8을 입력하세요.' : '';
  $('quality-help').textContent = qualityNotice || '자동 또는 원하는 화질로 고정할 수 있습니다.';
  const available = preferredQuality === 'auto' || (preferredQuality === 'highest' && heights.length > 0) || heights.includes(Number(preferredQuality));
  $('quality').value = available ? preferredQuality : 'auto';
  if (!available && heights.length > 1) $('quality-help').textContent = `저장된 ${preferredQuality}p가 없어 자동으로 재생합니다.`;
}
function applyQuality() {
  const value = $('quality').value;
  let level;
  if (value === 'highest') {
    level = [...qualityLevels].sort((a,b) => b.height - a.height || b.bitrate - a.bitrate)[0];
  } else if (value !== 'auto') {
    level = qualityLevels.filter(l => l.height === Number(value)).sort((a,b) => b.bitrate - a.bitrate)[0];
  }
  preferredQuality = value;
  status(level ? `${qualityLabel(level)}의 재생 주소로 연결합니다.` : '자동 화질로 전환합니다.');
  playSource(level?.url[0] || masterSourceURL, generation, true, level?.height || null);
}
function setChat(id) {
  if (!id || activeChannel === id) return;
  activeChannel = id;
  document.querySelectorAll('.follow-item').forEach(button => {
    const selected = button.dataset.channelId === id;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  $('popout').disabled = false;
  if (window.desktopChat) {
    $('chat-reload').disabled = false;
    window.desktopChat.open(id);
  }
}
async function playSource(url, run, preserveLevels = false, height = null) {
  if (window.captureController?.state.active && !isDvrSource(url) && !window.captureController.transitioning) {
    status('녹화 또는 리플레이 버퍼를 종료한 뒤 화질을 변경해 주세요.', true); return;
  }
  if (desktopPiP) window.desktopChat.closePiP();
  if (!isDvrSource(url)) syncSourceLink(url, true);
  const restoring = vodMode && pendingVodResume !== null;
  const resumeTime = restoring ? Math.min(pendingVodResume, Math.max(0, (currentVod?.duration || Infinity) - .5)) : vodMode && preserveLevels && video.readyState >= 1 ? video.currentTime : null;
  const wasPaused = video.paused;
  changingSource = true;
  hls?.destroy(); hls = null;
  playingFragment = null;
  fixedQuality = height;
  if (!preserveLevels) { masterSourceURL = url; qualityLevels = []; }
  video.pause(); video.removeAttribute('src'); video.load();
  applyPlaybackSpeed();
  if (!preserveLevels) {
    $('quality').replaceChildren(new Option('불러오는 중…', 'auto'));
    $('quality').disabled = true;
  }
  $('quality-current').textContent = '화질 확인 중';
  $('quality-help').textContent = '';
  $('empty').hidden = true;
  if (window.Hls?.isSupported()) {
    const instance = hls = new Hls({ lowLatencyMode: false, maxBufferLength: 30, backBufferLength: 30, liveSyncDurationCount: 4, startPosition: resumeTime ?? -1 });
    video.addEventListener('loadedmetadata', () => {
      if (run !== generation || hls !== instance) return;
      applyPlaybackSpeed();
      if (resumeTime !== null) video.currentTime = Math.min(resumeTime, Math.max(0, video.duration - .5));
      pendingVodResume = null; changingSource = false; persistViewingState(true);
    }, { once: true });
    let mediaRecoveries = 0;
    instance.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
      if (run !== generation || hls !== instance) return;
      if (!preserveLevels) {
        qualityLevels = instance.levels.map(level => ({ height: level.height, frameRate: level.frameRate, bitrate: level.bitrate, url: [...level.url] }));
        configureQuality(instance);
        if ($('quality').value !== 'auto') { queueMicrotask(() => { if (run === generation && hls === instance) applyQuality(); }); return; }
      }
      if (preserveLevels) $('quality-help').textContent = qualityNotice || '자동 또는 원하는 화질로 고정할 수 있습니다.';
      status('연결되었습니다. 자동 재생이 안 되면 영상의 재생 버튼을 눌러 주세요.');
      if (restoring || resumeTime === null || !wasPaused) video.play().catch(() => status('재생 버튼을 눌러 시청을 시작하세요.'));
    });
    instance.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
      if (hls !== instance) return;
      updateQualityBadge(instance);
      const levelURL = instance.levels[data.level]?.url?.[0];
      if (levelURL && !isDvrSource(levelURL)) syncSourceLink(levelURL);
    });
    instance.on(Hls.Events.FRAG_CHANGED, (_, data) => { if (hls === instance) playingFragment = data.frag; });
    instance.on(Hls.Events.ERROR, (_, data) => {
      if (!data.fatal || run !== generation || hls !== instance) return;
      if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRecoveries++ < 1) return instance.recoverMediaError();
      instance.stopLoad();
      status(`재생 연결이 끊어졌습니다 (${data.details}). 다시 연결하거나 다른 스트림을 선택해 주세요.`, true);
    });
    instance.loadSource(url); instance.attachMedia(video);
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    $('quality').replaceChildren(new Option('브라우저 자동', 'auto'));
    $('quality-current').textContent = '브라우저 자동 화질';
    $('quality-help').textContent = '수동 화질 선택은 Chrome 또는 Edge에서 사용할 수 있습니다.';
    video.src = url; video.play().catch(() => status('영상의 재생 버튼을 눌러 주세요.'));
    video.addEventListener('loadedmetadata', () => { if (run !== generation) return; if (resumeTime !== null) video.currentTime = Math.min(resumeTime, Math.max(0, video.duration - .5)); pendingVodResume = null; changingSource = false; persistViewingState(true); }, { once: true });
  } else { $('empty').hidden = false; status('HLS 재생기를 불러오지 못했습니다. 서버를 다시 시작해 주세요.', true); }
}
async function openStream(value = $('address').value.trim(), manual = false, restore = null) {
  if (window.captureController?.state.active) { status('녹화 또는 리플레이 버퍼를 종료한 뒤 방송을 변경해 주세요.', true); return; }
  persistViewingState(true);
  const run = ++generation;
  viewingState = null; pendingVodResume = null; changingSource = true;
  hls?.destroy(); hls = null; video.pause(); video.removeAttribute('src'); video.load(); $('empty').hidden = false;
  $('open').disabled = true; status('방송 정보를 확인하고 재생 주소를 가져오는 중…');
  try {
    const response = await fetch('/api/resolve?url=' + encodeURIComponent(value));
    const data = await response.json();
    if (run !== generation) return;
    if (!response.ok) throw new Error(data.error);
    if (!manual) setVodMode(data);
    if (!manual) {
      viewingState = data.kind === 'vod' ? { kind: 'vod', address: `https://chzzk.naver.com/video/${data.videoId}`, position: Math.max(0, Number(restore?.position) || 0) } : data.channelId ? { kind: 'live', address: `https://chzzk.naver.com/live/${data.channelId}`, position: 0 } : null;
      if (viewingState?.kind === 'vod' && restore) pendingVodResume = viewingState.position;
      if (viewingState) persistViewingState(true);
      else { localStorage.removeItem('chzzk-viewing-state'); window.desktopChat?.saveViewingState?.(null); }
    }
    if (!vodMode) setChat(data.channelId);
    lastRequest = { value, manual };
    resolved = data;
    if (!manual) {
      localStorage.setItem('chzzk-channel', value);
      window.desktopChat?.saveAddress(value);
    }
    if (!manual) {
      $('title').textContent = data.title || '라이브 방송'; $('channel').textContent = data.channel || '직접 입력한 스트림';
    }
    $('source').replaceChildren(...data.sources.map((s, i) => new Option(s.name, String(i))));
    $('source').hidden = data.sources.length < 2;
    await playSource(data.sources[0].url, run);
    if(run===generation)window.dispatchEvent(new Event('viewer-stream-opened'));
  } catch (error) { if (run === generation) status(error.message, true); }
  finally { if (run === generation) $('open').disabled = false; }
}
$('open-form').addEventListener('submit', e => { e.preventDefault(); openStream(); });
$('reconnect').onclick = () => lastRequest ? openStream(lastRequest.value, lastRequest.manual) : openStream();
$('m3u8-form').onsubmit = e => {
  e.preventDefault();
  const value = $('m3u8-url').value.trim();
  if (!value) { status('재생할 m3u8 주소를 입력해 주세요.', true); return; }
  openStream(value, true);
};
$('m3u8-url').oninput = () => { linkDirty = true; $('m3u8-note').textContent = '수정한 주소는 ‘수정 주소로 재생’을 누를 때 적용됩니다.'; };
$('m3u8-reset').onclick = () => {
  linkDirty = false; $('m3u8-url').value = currentOriginalURL;
  $('m3u8-note').textContent = '현재 재생 주소를 불러왔습니다.';
};
$('source').onchange = () => playSource(resolved.sources[Number($('source').value)].url, generation);
$('quality').onchange = () => { if (hls) applyQuality(); };
$('playback-speed').onchange = () => {
  if (!vodMode) return;
  preferredVodSpeed = Number($('playback-speed').value);
  applyPlaybackSpeed();
  playerToast(`재생 속도 ${preferredVodSpeed}배`);
};
video.addEventListener('loadedmetadata', applyPlaybackSpeed);
video.addEventListener('ratechange', () => {
  if (!vodMode) { if (video.playbackRate !== 1) applyPlaybackSpeed(); return; }
  if (!changingSource && [...$('playback-speed').options].some(option => Number(option.value) === video.playbackRate)) {
    preferredVodSpeed = video.playbackRate; $('playback-speed').value = String(preferredVodSpeed);
  }
});
let primaryChatDetached=false;
let primaryChatPopup=null;
function updatePrimaryChatDetached(detached){
  primaryChatDetached=detached;$('layout').classList.toggle('no-chat',detached);
  $('toggle').textContent=detached?'채팅 되돌리기':'채팅 ON';$('toggle').setAttribute('aria-pressed',String(!detached));
  $('popout').textContent=detached?'채팅 되돌리기':'별도 창 ↗';
  window.dispatchEvent(new CustomEvent('primary-chat-detached',{detail:detached}));requestAnimationFrame(reportChatBounds);
}
window.desktopChat?.onChatPopout?.(state=>{if(state.id==='primary'&&!state.disposed)updatePrimaryChatDetached(state.detached);});
$('toggle').onclick = () => {
  if(primaryChatDetached){if(window.desktopChat)window.desktopChat.popout('attach');else{primaryChatPopup?.close();updatePrimaryChatDetached(false);}return;}
  const off = $('layout').classList.toggle('no-chat');
  $('toggle').textContent = off ? '채팅 OFF' : '채팅 ON'; $('toggle').setAttribute('aria-pressed', String(!off));
  requestAnimationFrame(reportChatBounds);
};
$('popout').onclick = async () => {
  if (window.desktopChat){const result=await window.desktopChat.popout(primaryChatDetached?'attach':'detach');if(result?.error)status(result.error,true);return;}
  if (activeChannel){const popup=window.open(`https://chzzk.naver.com/live/${activeChannel}/chat`, 'chzzk-chat', 'popup,width=420,height=820');if(popup){primaryChatPopup=popup;updatePrimaryChatDetached(true);const timer=setInterval(()=>{if(popup.closed){clearInterval(timer);primaryChatPopup=null;updatePrimaryChatDetached(false);}},1000);}}
};
function reportChatBounds() {
  if (!window.desktopChat) return;
  const r = $('desktop-chat-slot').getBoundingClientRect();
  const fullChat = document.fullscreenElement === $('layout') && ($('layout').classList.contains('fullscreen-chat') || document.body.classList.contains('multi-view'));
  const headerBottom = document.fullscreenElement ? 0 : document.querySelector('header').getBoundingClientRect().bottom;
  const top = Math.max(0, headerBottom, r.top), bottom = Math.min(window.innerHeight, r.bottom);
  const visibleMode = fullChat || (!document.fullscreenElement && !document.body.classList.contains('player-only') && !$('layout').classList.contains('no-chat'));
  window.desktopChat.bounds({ x: r.x, y: top, width: r.width, height: Math.max(0, bottom - top), fullscreenChat: fullChat, visible: !vodMode && visibleMode && !resizingPanels && !window.multiViewDragging && r.width > 0 });
}
const splitter = $('splitter');
let panelWidth = Number(localStorage.getItem('chzzk-chat-width')) || 360;
function resizePanels(width, save = false) {
  const layout = $('layout');
  const available = layout.clientWidth - parseFloat(getComputedStyle(layout).paddingLeft) - parseFloat(getComputedStyle(layout).paddingRight);
  const maximum = Math.max(260, Math.min(available * .6, available - 360));
  panelWidth = Math.round(Math.max(260, Math.min(maximum, width)));
  layout.style.setProperty('--chat-width', panelWidth + 'px');
  splitter.setAttribute('aria-valuemin', '260');
  splitter.setAttribute('aria-valuemax', String(Math.round(maximum)));
  splitter.setAttribute('aria-valuenow', String(panelWidth));
  splitter.setAttribute('aria-valuetext', `채팅 너비 ${panelWidth}픽셀`);
  if (save) localStorage.setItem('chzzk-chat-width', String(panelWidth));
  requestAnimationFrame(reportChatBounds);
}
let dragStart;
splitter.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  dragStart = { x: event.clientX, width: panelWidth };
  resizingPanels = true; document.body.classList.add('resizing');
  splitter.setPointerCapture(event.pointerId); reportChatBounds();
  event.preventDefault();
});
splitter.addEventListener('pointermove', event => {
  if (dragStart) resizePanels(dragStart.width + dragStart.x - event.clientX);
});
function finishPanelResize() {
  if (!dragStart) return;
  dragStart = null; resizingPanels = false;
  document.body.classList.remove('resizing'); resizePanels(panelWidth, true);
}
splitter.addEventListener('pointerup', finishPanelResize);
splitter.addEventListener('pointercancel', finishPanelResize);
splitter.addEventListener('lostpointercapture', finishPanelResize);
splitter.addEventListener('dblclick', () => resizePanels(360, true));
splitter.addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return;
  event.preventDefault();
  resizePanels(event.key === 'Home' ? 360 : panelWidth + (event.key === 'ArrowLeft' ? 20 : -20), true);
});
window.addEventListener('resize', () => resizePanels(panelWidth));
resizePanels(panelWidth);
if (window.desktopChat) {
  document.body.classList.add('desktop-app');
  $('chat-empty').hidden = true; $('desktop-chat-slot').hidden = false;
  $('chat-reload').hidden = false;
  $('chat-login').hidden = false;
  document.querySelector('.chat-note').textContent = '공식 채팅 · 로그인 후 채팅에 참여하세요.';
  $('chat-reload').onclick = () => window.desktopChat.reload();
  let accountState = { loggedIn: null, busy: false };
  let followRevision = 0, followLoading = false, lastFollowUpdate = 0;
  function followMessage(text) {
    const message = document.createElement('span'); message.className = 'following-message'; message.textContent = text;
    $('following-list').replaceChildren(message);
  }
  async function refreshFollowing(force = false) {
    if (accountState.loggedIn !== true || accountState.busy || followLoading) return;
    if (!force && Date.now() - lastFollowUpdate < 55000) return;
    const revision = ++followRevision;
    followLoading = true; $('following-refresh').disabled = true;
    if (!lastFollowUpdate) followMessage('팔로우 라이브를 불러오는 중…');
    try {
      const data = await window.desktopChat.following();
      if (revision !== followRevision || accountState.loggedIn !== true || accountState.busy) return;
      if (!data || data.error) throw new Error(data?.error || '목록을 불러오지 못했습니다.');
      const buttons = data.items.map(item => {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'follow-item'; button.dataset.channelId = item.channelId;
        button.title = `${item.name} · ${item.title}`; button.setAttribute('aria-label', `${item.name} 방송 보기`);
        button.setAttribute('aria-pressed', String(item.channelId === activeChannel));
        button.classList.toggle('selected', item.channelId === activeChannel);
        if (item.image) {
          const image = document.createElement('img'); image.src = item.image; image.alt = ''; image.referrerPolicy = 'no-referrer'; image.addEventListener('error', () => image.remove()); button.append(image);
        }
        const name = document.createElement('span'); name.textContent = item.name;
        const dot = document.createElement('i'); dot.className = 'follow-live-dot'; dot.setAttribute('aria-hidden', 'true');
        button.append(name, dot);
        button.onclick = () => {
          $('address').value = `https://chzzk.naver.com/live/${item.channelId}`;
          openStream();
        };
        return button;
      });
      if (buttons.length) $('following-list').replaceChildren(...buttons);
      else followMessage('지금 라이브 중인 팔로우 방송이 없습니다.');
      $('following-count').textContent = String(buttons.length);
      lastFollowUpdate = Date.now();
    } catch (error) { if (revision === followRevision) followMessage(error.message); }
    finally { if (revision === followRevision) { followLoading = false; $('following-refresh').disabled = false; } }
  }
  function renderAccount(state) {
    if (!state) return;
    accountState = state;
    $('chat-login').textContent = state.busy ? '처리 중…' : state.loggedIn === true ? '로그아웃' : state.loggedIn === false ? '네이버 로그인' : '로그인 확인';
    $('chat-login').disabled = state.busy;
    $('following').hidden = state.loggedIn !== true;
    if (state.loggedIn !== true || state.busy) {
      followRevision++; followLoading = false; lastFollowUpdate = 0;
      $('following-list').replaceChildren(); $('following-count').textContent = '0';
    } else refreshFollowing();
  }
  $('following-refresh').onclick = () => refreshFollowing(true);
  setInterval(() => refreshFollowing(), 60000);
  window.desktopChat.onAccount(renderAccount);
  window.desktopChat.account().then(renderAccount).catch(() => renderAccount({ loggedIn: null, busy: false }));
  $('chat-login').onclick = async () => {
    if (accountState.busy) return;
    if (accountState.loggedIn === false) return window.desktopChat.login();
    renderAccount({ ...accountState, busy: true });
    try { renderAccount(await (accountState.loggedIn === true ? window.desktopChat.logout() : window.desktopChat.account())); }
    catch { renderAccount({ loggedIn: null, busy: false }); }
  };
  window.desktopChat.onStatus(text => { if (!vodMode) document.querySelector('.chat-note').textContent = text; });
  new ResizeObserver(reportChatBounds).observe($('desktop-chat-slot'));
  new ResizeObserver(reportChatBounds).observe(document.querySelector('header'));
  window.addEventListener('resize', reportChatBounds);
  window.addEventListener('scroll', reportChatBounds, { passive: true });
  document.addEventListener('fullscreenchange', reportChatBounds);
  requestAnimationFrame(reportChatBounds);
}
function jumpToLive() {
  if (vodMode) return;
  let target;
  if (video.seekable.length) {
    const last = video.seekable.length - 1;
    target = Math.max(video.seekable.start(last), video.seekable.end(last) - 0.5);
  } else if (Number.isFinite(hls?.liveSyncPosition)) target = hls.liveSyncPosition;
  if (!Number.isFinite(target)) { status('아직 최신 재생 위치를 확인하지 못했습니다. 영상이 연결된 뒤 다시 눌러 주세요.'); return; }
  video.playbackRate = 1;
  video.currentTime = target;
  hls?.startLoad(target);
  status('재생 가능한 최신 위치로 이동했습니다.');
  video.play().catch(() => status('최신 위치로 이동했습니다. 영상의 재생 버튼을 눌러 주세요.'));
}
$('edge').onclick = jumpToLive;
$('live-jump').onclick = jumpToLive;
async function toggleFullscreen(mode = 'video') {
  const target = mode === 'chat' ? $('layout') : document.querySelector('.screen');
  try {
    if (document.fullscreenElement === target) return await document.exitFullscreen();
    if (document.fullscreenElement) await document.exitFullscreen();
    $('layout').classList.toggle('fullscreen-chat', mode === 'chat');
    await target.requestFullscreen();
  } catch { $('layout').classList.remove('fullscreen-chat'); status('전체 화면을 사용할 수 없습니다.', true); }
}
$('fullscreen').onclick = () => toggleFullscreen('video');
document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement !== $('layout')) $('layout').classList.remove('fullscreen-chat');
  requestAnimationFrame(reportChatBounds);
});
let playerMode = false, desktopPiP = false, playerAwakeTimer, playerToastTimer;
if (window.desktopChat) window.desktopChat.onPiP(active => {
  desktopPiP = active;
  if (active) { video.pause(); hls?.stopLoad(); playerToast('PiP 미니플레이어에서 재생 중입니다.'); }
  else { hls?.startLoad(); video.play().catch(() => {}); }
});
function wakePlayer() {
  document.body.classList.add('player-awake');
  clearTimeout(playerAwakeTimer);
  playerAwakeTimer = setTimeout(() => document.body.classList.remove('player-awake'), 2500);
}
function playerToast(text) {
  $('player-toast').textContent = text; $('player-toast').hidden = false;
  clearTimeout(playerToastTimer); playerToastTimer = setTimeout(() => $('player-toast').hidden = true, 4500);
}
async function setPlayerMode(enabled) {
  playerMode = enabled;
  document.body.classList.toggle('player-only', enabled);
  $('view-mode').setAttribute('aria-pressed', String(enabled));
  $('player-menu').hidden = true;
  wakePlayer(); reportChatBounds();
  if (window.desktopChat) {
    try { await window.desktopChat.playerMode(enabled); }
    catch { playerToast('창 크기를 변경하지 못했습니다. 다시 시도해 주세요.'); }
  }
  requestAnimationFrame(reportChatBounds);
  if (!enabled) $('view-mode').focus();
}
$('view-mode').onclick = () => setPlayerMode(true);
$('exit-view-mode').onclick = () => setPlayerMode(false);
document.querySelector('.screen').addEventListener('pointermove', wakePlayer);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    $('player-menu').hidden = true;
    if (playerMode && !document.fullscreenElement) setPlayerMode(false);
  }
});
async function togglePiP() {
  $('player-menu').hidden = true;
  try {
    if (vodMode && window.desktopChat) {
      if (document.pictureInPictureElement) return await document.exitPictureInPicture();
      return await video.requestPictureInPicture();
    }
    if (window.desktopChat) {
      if (desktopPiP) return window.desktopChat.closePiP();
      if (!video.videoWidth || video.readyState < 1) throw new Error('영상을 재생한 뒤 PiP를 선택해 주세요.');
      const source = hls?.levels[hls.currentLevel]?.url?.[0] || hls?.url || video.currentSrc;
      const opened = await window.desktopChat.pip({ url: source, volume: video.volume, muted: video.muted });
      if (!opened) throw new Error('PiP 창을 열지 못했습니다. 다시 시도해 주세요.');
      return;
    }
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    else {
      if (!document.pictureInPictureEnabled || !video.requestPictureInPicture) throw new Error('이 환경에서는 PiP를 지원하지 않습니다.');
      if (!video.videoWidth || video.readyState < 1) throw new Error('영상을 재생한 뒤 PiP를 선택해 주세요.');
      await video.requestPictureInPicture();
    }
  } catch (error) { playerToast(error.name === 'NotSupportedError' || error.name === 'InvalidStateError' ? '이 브라우저에서는 PiP를 사용할 수 없습니다. 독립 앱에서 이용해 주세요.' : error.message || 'PiP를 실행하지 못했습니다.'); }
}
const playerScreen = document.querySelector('.screen');
playerScreen.addEventListener('contextmenu', event => {
  event.preventDefault();
  const menu = $('player-menu');
  $('menu-pip').textContent = (desktopPiP || document.pictureInPictureElement) ? 'PiP 종료' : 'PiP 모드';
  $('menu-pip').disabled = !desktopPiP && !document.pictureInPictureElement && ((!window.desktopChat && !document.pictureInPictureEnabled) || !video.videoWidth);
  $('menu-view-mode').textContent = playerMode ? '감상모드 종료' : '감상모드';
  menu.hidden = false;
  const rect = playerScreen.getBoundingClientRect();
  menu.style.left = Math.max(0, Math.min(event.clientX, rect.right - menu.offsetWidth, innerWidth - menu.offsetWidth - 8)) + 'px';
  menu.style.top = Math.max(0, Math.min(event.clientY, rect.bottom - menu.offsetHeight, innerHeight - menu.offsetHeight - 8)) + 'px';
  (menu.querySelector('button:not(:disabled)'))?.focus();
});
$('menu-pip').onclick = togglePiP;
$('menu-view-mode').onclick = () => setPlayerMode(!playerMode);
$('menu-live').onclick = () => { $('player-menu').hidden = true; jumpToLive(); };
$('player-menu').addEventListener('keydown', event => {
  if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
  event.preventDefault();
  const buttons = [...$('player-menu').querySelectorAll('button:not(:disabled)')];
  const current = buttons.indexOf(document.activeElement);
  buttons[(current + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus();
});
document.addEventListener('pointerdown', event => { if (!$('player-menu').contains(event.target)) $('player-menu').hidden = true; });
window.addEventListener('blur', () => $('player-menu').hidden = true);
video.addEventListener('playing', () => {
  if (hls) updateQualityBadge(hls);
  status(vodMode ? '다시보기 재생 중 · 채팅은 영상 재생 시각에 맞춰 표시됩니다.' : '재생 중 · 안정적인 재생을 위해 라이브보다 약간 늦게 표시될 수 있습니다.');
});
video.addEventListener('waiting', () => status('영상을 버퍼링하는 중…'));
video.addEventListener('error', () => { if (video.currentSrc) status('영상을 재생할 수 없습니다. 다시 연결을 눌러 주세요.', true); });
window.installPlayerKeys(video, playerToast, toggleFullscreen);
const seekbar = window.installSeekbar(video);
$('address').value = localStorage.getItem('chzzk-channel') || '';
video.addEventListener('timeupdate', () => persistViewingState());
for (const name of ['pause','seeked','ended']) video.addEventListener(name, () => persistViewingState(true));
window.addEventListener('beforeunload', () => persistViewingState(true));
window.addEventListener('pagehide', () => persistViewingState(true));
let startupAddressEdited = false;
$('address').addEventListener('input', () => { startupAddressEdited = true; }, { once: true });
(async () => {
  const startupGeneration = generation;
  try {
    let saved;
    if (window.desktopChat?.viewingState) saved = await window.desktopChat.viewingState();
    else { try { saved = JSON.parse(localStorage.getItem('chzzk-viewing-state')); } catch {} }
    const address = saved?.address || (window.desktopChat ? await window.desktopChat.lastAddress() : $('address').value);
    if (startupAddressEdited || generation !== startupGeneration || lastRequest) return;
    if (address) $('address').value = address;
    if (!/^https:\/\/chzzk\.naver\.com\/(?:video\/\d+|live\/[a-f\d]{32})(?:\/chat)?\/?$/i.test(address || '')) return;
    status('마지막 시청 정보를 확인하는 중…');
    await openStream(address, false, saved?.kind === 'vod' ? saved : null);
  } catch { status('마지막 시청 정보를 복원하지 못했습니다. 방송 주소를 입력해 주세요.', true); }
})();
