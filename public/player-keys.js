(function(root) {
  function handlePlayerKey(event, video, notify = () => {}, fullscreen) {
    video = video.handoffPlayback || video;
    const fullscreenKey = event.key === 'F11' || event.code === 'KeyF' || ['f','F'].includes(event.key) || (event.altKey && event.key === 'Enter');
    if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || (event.altKey && event.key !== 'Enter')) return false;
    if (!fullscreenKey && !['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)) return false;
    if (event.target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="combobox"],[role="slider"]:not(.seek-bar),[role="menu"],[role="separator"]')) return false;
    if (fullscreenKey && typeof fullscreen !== 'function') return false;
    event.preventDefault(); event.stopImmediatePropagation();
    if (fullscreenKey) { fullscreen(event.key === 'F11' || (event.altKey && event.key === 'Enter') ? 'video' : 'chat'); return true; }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const volume = video.muted ? 0 : video.volume;
      video.volume = Math.max(0, Math.min(1, Math.round((volume + (event.key === 'ArrowUp' ? .05 : -.05))*100)/100));
      if (video.volume > 0) video.muted = false;
      notify(`볼륨 ${Math.round(video.volume*100)}%`);
    } else {
      let start = 0, end = Number.isFinite(video.duration) ? video.duration : 0;
      if (video.seekable.length) { start = video.seekable.start(0); end = video.seekable.end(video.seekable.length-1); }
      if (end <= start) { notify('아직 이동 가능한 영상이 없습니다.'); return true; }
      const delta = event.key === 'ArrowRight' ? 5 : -5;
      video.currentTime = Math.max(start, Math.min(Math.max(start,end-.15), video.currentTime+delta));
      notify(delta > 0 ? '5초 앞으로' : '5초 뒤로');
    }
    return true;
  }
  function installPlayerKeys(video, notify, fullscreen, doc = document) {
    doc.addEventListener('keydown', event => handlePlayerKey(event, video, notify, fullscreen), { capture: true });
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { handlePlayerKey };
  else root.installPlayerKeys = installPlayerKeys;
})(globalThis);
