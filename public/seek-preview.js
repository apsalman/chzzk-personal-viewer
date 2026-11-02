(function(root) {
  function previewTime(time, duration) {
    return Math.min(Math.max(0, Math.floor(time / 2) * 2), Number.isFinite(duration) ? Math.max(0, duration - .1) : Infinity);
  }
  function installSeekPreview(doc, tooltip, onResize) {
    const frame = doc.createElement('div'), video = doc.createElement('video'), note = doc.createElement('span');
    frame.className = 'seek-preview'; frame.hidden = true;
    video.muted = true; video.playsInline = true; video.preload = 'metadata'; video.hidden = true;
    video.setAttribute('aria-hidden','true'); video.setAttribute('disablepictureinpicture','');
    note.textContent = '미리보기 준비 중…'; frame.append(video,note); tooltip.prepend(frame);
    let source = null, hls = null, active = false, started = false, failed = false, timer, desired = -1;
    function seek() {
      if (!active || !started || failed || video.readyState < 1 || video.seeking) return;
      const wanted = previewTime(desired, video.duration);
      if (video.readyState >= 2 && Math.abs(video.currentTime - wanted) < .1) { video.hidden = false; note.hidden = true; return; }
      video.currentTime = wanted;
    }
    function error() { failed = true; video.hidden = true; note.hidden = false; note.textContent = '미리보기를 불러오지 못했습니다.'; }
    function start() {
      if (!active || !source || failed) return;
      if (!started) {
        started = true;
        if (source.type === 'hls' && root.Hls?.isSupported()) {
          const instance = hls = new root.Hls({ autoStartLoad: false, startLevel: 0, startPosition: previewTime(desired,Infinity), maxBufferLength: 4, maxMaxBufferLength: 8, backBufferLength: 0 });
          instance.autoLevelCapping = 0;
          instance.on(root.Hls.Events.MANIFEST_PARSED, () => { if (hls === instance && active) instance.startLoad(previewTime(desired,Infinity)); });
          instance.on(root.Hls.Events.ERROR, (_event,data) => { if (hls === instance && data.fatal) { instance.stopLoad(); error(); } });
          instance.loadSource(source.url); instance.attachMedia(video);
        } else { video.src = source.url; video.load(); }
      }
      seek();
    }
    video.addEventListener('loadedmetadata',seek);
    video.addEventListener('loadeddata',seek);
    video.addEventListener('seeked',() => {
      if (!active || failed) return;
      if (Math.abs(video.currentTime - previewTime(desired,video.duration)) > .1) { seek(); return; }
      video.hidden = false; note.hidden = true; onResize();
    });
    video.addEventListener('error',() => { if (started) error(); });
    function hide() { active = false; frame.hidden = true; clearTimeout(timer); video.pause(); hls?.stopLoad(); }
    return {
      show(time) {
        if (!source) return;
        const next = previewTime(time,Infinity), wasActive = active;
        active = true; frame.hidden = false;
        if (next === desired && wasActive) return;
        desired = next; video.hidden = true; note.hidden = false;
        note.textContent = failed ? '미리보기를 불러오지 못했습니다.' : '미리보기 준비 중…';
        clearTimeout(timer); timer = setTimeout(() => { if (hls) hls.startLoad(previewTime(desired,video.duration)); start(); },140);
      },
      hide,
      setSource(value) {
        hide(); hls?.destroy(); hls = null; started = false; failed = false; desired = -1;
        video.removeAttribute('src'); video.load();
        source = value && /^\/media\/[a-f\d]{32}$/.test(value.url) && ['mp4','hls'].includes(value.type) ? value : null;
      }
    };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { previewTime };
  else root.installSeekPreview = installSeekPreview;
})(globalThis);
