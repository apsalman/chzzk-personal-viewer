const video = document.getElementById('pip-video');
const status = document.getElementById('pip-status');
let hls;
window.miniPlayer.onSource(config => {
  video.volume = config.volume; video.muted = config.muted;
  hls?.destroy();
  if (window.Hls?.isSupported()) {
    hls = new Hls({ lowLatencyMode: false, maxBufferLength: 20, backBufferLength: 10 });
    hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => status.textContent = '재생 버튼을 눌러 주세요.'));
    hls.on(Hls.Events.ERROR, (_event, data) => { if (data.fatal) status.textContent = 'PiP 연결이 끊어졌습니다. 돌아가기를 눌러 다시 연결해 주세요.'; });
    hls.loadSource(config.url); hls.attachMedia(video);
  } else { video.src = config.url; video.play().catch(() => {}); }
});
video.addEventListener('playing', () => status.textContent = '');
document.getElementById('pip-restore').onclick = () => window.miniPlayer.restore();
document.addEventListener('keydown', event => { if (event.key === 'Escape') window.miniPlayer.restore(); });
let keyToastTimer;
window.installPlayerKeys(video,text=>{
  status.textContent=text; clearTimeout(keyToastTimer);
  keyToastTimer=setTimeout(()=>status.textContent='',1600);
},()=>{ const action=document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen(); action.catch(()=>{status.textContent='전체 화면을 사용할 수 없습니다.';}); });
setInterval(() => { const date = hls?.playingDate; if (date instanceof Date) window.miniPlayer.playhead(date.getTime()); }, 1000);
for (const surface of [document.getElementById('pip-surface'), ...document.querySelectorAll('.resize-handle')]) {
  let dragging = false;
  surface.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault(); dragging = true;
    surface.setPointerCapture(event.pointerId); document.body.classList.add('dragging');
    window.miniPlayer.gesture('start', surface.dataset.edge || 'move');
  });
  surface.addEventListener('pointermove', () => { if (dragging) window.miniPlayer.gesture('update'); });
  const finish = () => {
    if (!dragging) return; dragging = false;
    window.miniPlayer.gesture('end'); document.body.classList.remove('dragging');
  };
  surface.addEventListener('pointerup', finish);
  surface.addEventListener('pointercancel', finish);
  surface.addEventListener('lostpointercapture', finish);
}
