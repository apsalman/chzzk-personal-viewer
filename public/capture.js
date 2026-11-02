if (window.desktopChat) {
  const el = id => document.getElementById(id);
  el('capture-tools').hidden = false;
  const controller = window.captureController = { state: {}, transitioning: false };
  let commandBusy = false, dvrURL = '', returnSource = '', captureHeight = null, lastSavedFile = '';
  let replayStopping = false;
  let detachedDvrURL = '';
  function epoch() {
    const date = hls?.playingDate;
    return date instanceof Date && Number.isFinite(date.getTime()) ? date.getTime() : undefined;
  }
  function currentConfig() {
    return { url: hls?.levels[hls.currentLevel]?.url?.[0] || hls?.url || video.currentSrc,
      fragment: playingFragment?.url, minutes: Number(el('replay-length').value), epoch: epoch() };
  }
  const clock = seconds => { const n = Math.max(0, Math.floor(seconds || 0)); return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`; };
  async function command(action) {
    if (commandBusy) return;
    if (['record-start','replay-start'].includes(action) && !video.videoWidth) { el('capture-status').textContent = '영상을 재생한 뒤 녹화/리플레이를 시작해 주세요.'; return; }
    const requestConfig=currentConfig();
    let commandError=false;
    commandBusy = true;
    el('capture-status').textContent = action === 'record-stop' || action === 'replay-save' ? '영상 조각을 하나의 MP4로 합치는 중…' : '처리 중…';
    renderButtons();
    try {
      const needsLiveHandoff=(action==='replay-stop'&&!controller.state.recording)||(action==='record-stop'&&!controller.state.replay);
      if (needsLiveHandoff && controller.state.ready && dvrURL && !controller.state.finalizing) {
        replayStopping = true; controller.transitioning = true;
        if (desktopPiP) {
          window.desktopChat.closePiP();
          const until=Date.now()+2500;while(desktopPiP&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,50));
        }
        await window.handoffToLive({video,source:returnSource,
          loadPrimary:source=>playSource(source,generation,true,captureHeight),getPrimaryHls:()=>hls,
          onStage:text=>{el('capture-status').textContent=text;}});
        detachedDvrURL=controller.state.url;dvrURL = '';
      }
      const result = await window.desktopChat.capture(action, requestConfig);
      if (result?.state) render(result.state);
      if (result?.error) {commandError=true;el('capture-status').textContent = result.error;}
    } catch (error) {commandError=true;el('capture-status').textContent = error.message;}
    finally {
      commandBusy = false; replayStopping = false; controller.transitioning = false; renderButtons();
      if(action==='replay-stop'&&!commandError)el('capture-status').textContent=controller.state.recording?'리플레이 보관 종료 · 녹화는 계속 진행 중입니다.':'리플레이 버퍼 종료 · 라이브 재생 중';
    }
  }
  function renderButtons() {
    const state = controller.state;
    el('record-toggle').textContent = state.recording ? '■ 녹화 종료' : '● 녹화 시작';
    el('record-toggle').classList.toggle('recording', !!state.recording);
    el('record-toggle').disabled = commandBusy || state.finalizing;
    el('replay-toggle').textContent = state.replay ? '리플레이 버퍼 종료' : '리플레이 버퍼 시작';
    el('replay-toggle').disabled = commandBusy || state.finalizing;
    el('replay-length').disabled = commandBusy || state.finalizing;
    el('replay-rewind').disabled = !state.replay || !state.ready || commandBusy;
    el('replay-save').disabled = !state.replay || !state.ready || commandBusy || state.finalizing;
    el('replay-rewind').textContent = `${Number(el('replay-length').value)}분 뒤로`;
    el('replay-save').textContent = '최근 구간 저장';
    if (state.active) { el('quality').disabled = true; el('source').disabled = true; }
    else { el('quality').disabled = qualityLevels.filter(level => level.height).length < 2; el('source').disabled = false; }
  }
  function render(state) {
    if (!state) return;
    controller.state = state;
    if (!state.active) detachedDvrURL='';
    if (state.active && state.ready && dvrURL !== state.url && state.url !== detachedDvrURL && !replayStopping) {
      returnSource = state.originalURL; captureHeight = fixedQuality || hls?.levels[hls.currentLevel]?.height || null;
      dvrURL = state.url; controller.transitioning = true;
      playSource(dvrURL, generation, true, captureHeight).finally(() => { controller.transitioning = false; });
    } else if (!state.active && dvrURL) {
      dvrURL = ''; controller.transitioning = true;
      if (returnSource) playSource(returnSource, generation, true, captureHeight).finally(() => { controller.transitioning = false; });
    }
    const label = state.finalizing ? 'MP4 파일 합치는 중…' : state.active && !state.ready ? '영상 조각을 준비하는 중… (첫 조각까지 수 초 소요)' : state.recording ? `녹화 중 ${clock(state.recordedSeconds)}` : state.replay ? `리플레이 보관 ${clock(state.seconds)} / ${state.minutes}분 · ${(state.bytes/1048576).toFixed(1)} MB` : '녹화 대기';
    if (!commandBusy || state.finalizing) el('capture-status').textContent = state.error || label;
    if (state.lastFile && state.lastFile !== lastSavedFile) { lastSavedFile = state.lastFile; el('capture-status').textContent = `저장 완료: ${state.lastFile}`; }
    renderButtons();
  }
  el('record-toggle').onclick = () => command(controller.state.recording ? 'record-stop' : 'record-start');
  el('replay-toggle').onclick = () => command(controller.state.replay ? 'replay-stop' : 'replay-start');
  el('record-folder').onclick = () => command('folder');
  el('replay-save').onclick = () => command('replay-save');
  el('replay-length').onchange = () => { renderButtons(); if (controller.state.replay) command('replay-start'); };
  el('replay-rewind').onclick = () => {
    if (!video.seekable.length) return;
    const minutes = Number(el('replay-length').value);
    const start = video.seekable.start(0), desired = video.currentTime - minutes*60;
    const previous = video.currentTime;
    video.currentTime = Math.max(start, desired); video.play().catch(() => {});
    window.desktopChat.capturePlayhead(epoch());
    el('capture-status').textContent = `${clock(previous-video.currentTime)} 전으로 이동했습니다.${desired < start ? ' 아직 설정 시간만큼 쌓이지 않아 보관 시작 지점으로 이동했습니다.' : ''}`;
  };
  window.desktopChat.onCapture(render);
  window.desktopChat.captureState().then(render);
  setInterval(() => { if (controller.state.active && dvrURL) window.desktopChat.capturePlayhead(epoch()); }, 1000);
}
