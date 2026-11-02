(() => {
  const panel = document.createElement('section'); panel.id = 'vod-download-tools'; panel.className = 'capture-tools'; panel.hidden = true;
  panel.innerHTML = '<div class="capture-row"><button id="vod-download-start" type="button">VOD 전체 다운로드 · MP4</button><button id="vod-download-cancel" type="button" disabled>다운로드 취소</button><button id="vod-download-folder" type="button">저장 폴더 열기</button></div><progress id="vod-download-progress" max="100" value="0" aria-label="VOD 다운로드 진행률"></progress><p id="vod-download-status" role="status">다운로드 대기</p><small>선택한 화질로 영상 전체를 저장합니다. 자동 화질은 최고 화질로 저장합니다. 시청과 탐색은 계속할 수 있습니다.</small>';
  $('capture-tools').after(panel);
  let state = {}, busy = false;
  const clock = value => { const n = Math.max(0, Math.floor(value || 0)); return `${Math.floor(n/3600)}:${String(Math.floor(n%3600/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`; };
  function render(next = state) {
    state = next || {}; panel.hidden = !vodMode && !state.active;
    $('vod-download-start').disabled = !window.desktopChat?.download || !vodMode || busy || state.active || !state.available;
    $('vod-download-cancel').disabled = !state.active || busy || state.status === 'cancelling';
    $('vod-download-folder').disabled = !window.desktopChat?.download || busy;
    const percent = state.status === 'completed' ? 100 : Math.min(99, Math.max(0, (state.seconds || 0) / (state.duration || Infinity) * 100));
    $('vod-download-progress').value = percent;
    const labels = { idle: '다운로드 대기', starting: '다운로드 준비 중…', finalizing: 'MP4 파일 마무리 중…', cancelling: '다운로드 취소 중…', cancelled: '다운로드를 취소했습니다.', completed: `저장 완료: ${state.file}`, error: state.error };
    $('vod-download-status').textContent = !window.desktopChat?.download ? 'VOD 다운로드는 독립 데스크톱 앱에서 사용할 수 있습니다.' : !state.available ? '다운로드에는 FFmpeg가 필요합니다. 설치하거나 앱 폴더의 tools/ffmpeg.exe에 넣은 뒤 앱을 재시작하세요.' : state.status === 'downloading' ? `${state.title || 'VOD'} · ${state.quality || ''} · ${percent.toFixed(1)}% · ${clock(state.seconds)} / ${clock(state.duration)} · ${((state.bytes || 0)/1048576).toFixed(1)} MB` : labels[state.status] || '다운로드 대기';
  }
  async function command(action) {
    if (busy) return;
    busy = true; render();
    try {
      let config;
      if (action === 'start') {
        if (!vodMode || !currentVod) throw new Error('다시보기를 먼저 열어 주세요.');
        const selection = $('quality').value;
        const candidates = selection === 'auto' || selection === 'highest' ? qualityLevels : qualityLevels.filter(level => level.height === Number(selection));
        const level = [...candidates].sort((a,b) => b.height-a.height || b.bitrate-a.bitrate)[0];
        const url = level?.url?.[0] || hls?.levels[hls.currentLevel]?.url?.[0];
        if (!url) throw new Error('영상 화질 정보를 불러온 뒤 다운로드해 주세요.');
        config = { videoId: currentVod.videoId, title: currentVod.title, duration: currentVod.duration, url: new URL(url, location.href).pathname, quality: level?.height ? `${level.height}p` : '현재 화질' };
      }
      const result = await window.desktopChat.download(action, config);
      if (result?.state) render(result.state);
      if (result?.error) throw new Error(result.error);
    } catch(error) { $('vod-download-status').textContent = error.message; }
    finally { busy = false; renderButtons(); }
  }
  function renderButtons() {
    $('vod-download-start').disabled = !window.desktopChat?.download || !vodMode || busy || state.active || !state.available;
    $('vod-download-cancel').disabled = !state.active || busy || state.status === 'cancelling';
    $('vod-download-folder').disabled = !window.desktopChat?.download || busy;
  }
  window.vodDownloadController = { update: () => render() };
  $('vod-download-start').onclick = () => command('start');
  $('vod-download-cancel').onclick = () => command('cancel');
  $('vod-download-folder').onclick = () => command('folder');
  if (window.desktopChat?.downloadState) {
    window.desktopChat.onDownload(render);
    window.desktopChat.downloadState().then(render).catch(() => {});
  }
  render();
})();
