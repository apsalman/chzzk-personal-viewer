(() => {
  const el = id => document.getElementById(id), video = el('video'), api = window.desktopChat;
  const panel = document.createElement('section'); panel.id = 'caption-tools';
  panel.innerHTML = '<div class="capture-row"><button id="caption-toggle" type="button" aria-pressed="false">한국어 자막 켜기</button><label for="caption-model">모델</label><select id="caption-model"><option value="small" selected>Small · 정확도 우선</option><option value="base">Base · 속도 우선</option><option value="tiny">Tiny · 낮은 정확도</option></select><label for="caption-interval">갱신</label><select id="caption-interval"><option value="2" selected>2초 · 빠른 표시</option><option value="3">3초</option><option value="4">4초 · 문맥 우선</option></select><label for="caption-device">처리</label><select id="caption-device"><option value="auto">자동 · GPU 우선</option><option value="cpu">CPU</option><option value="cuda">NVIDIA GPU</option></select><label id="caption-mode-label" hidden>다시보기 <select id="caption-mode"><option value="ahead">선행 인식 · 시간 동기화</option><option value="live">현재 소리 인식</option></select></label></div><p id="caption-status" role="status">한국어 자동 자막 대기</p><small>Small은 정확도 우선, Base는 속도 우선입니다. 다시보기는 FFmpeg로 약 30초 앞까지 자막을 준비합니다. 시작·탐색 직후에는 준비 시간이 필요합니다. 자막은 메인 영상에 표시됩니다.</small>';
  el('capture-tools').after(panel);
  const overlay = document.createElement('div'); overlay.id = 'auto-caption'; overlay.hidden = true; overlay.setAttribute('aria-label','한국어 자동 자막'); video.parentElement.append(overlay);
  const timeline = new window.CaptionTimeline();
  let state = {}, enabling = false, enabled = false, context, source, processor, silent, connected = false, workletReady = false;
  let epoch = 0, hideTimer, lastMetric = '', metrics = [], lastEnd = null, cursor = 0, aheadFlight = null, retryAt = 0;
  const useVod = () => vodMode && !!currentVod && !!state.vodAvailable && !!api?.captionVod && el('caption-mode').value === 'ahead';
  function clearText() { clearTimeout(hideTimer); overlay.textContent = ''; overlay.hidden = true; }
  function reset() {
    epoch++; lastEnd = null; clearText(); timeline.clear(); aheadFlight = null; cursor = Math.floor(video.currentTime/12)*12; retryAt = Date.now()+250;
    processor?.port.postMessage({epoch,seconds:Number(el('caption-interval').value)}); api?.captionReset?.(epoch);
  }
  function disconnect() {
    if (connected) { source.disconnect(processor); processor.disconnect(); silent.disconnect(); connected = false; }
    processor?.port.close(); processor = null; silent = null; reset();
  }
  function render(next = state) {
    state = next || {};
    if (!state.active && enabled && !enabling) { enabled = false; disconnect(); }
    el('caption-toggle').textContent = enabled || state.active ? '한국어 자막 끄기' : '한국어 자막 켜기';
    el('caption-toggle').setAttribute('aria-pressed',String(enabled || !!state.active));
    el('caption-toggle').disabled = enabling || !api?.captionStart || !state.available;
    for (const id of ['caption-model','caption-interval','caption-device','caption-mode']) el(id).disabled = enabling || enabled || !!state.active;
    el('caption-mode-label').hidden = !vodMode;
    for (const option of el('caption-model').options) option.disabled = !!state.models && !state.models.includes(option.value);
    if (!state.active && state.models?.length && !state.models.includes(el('caption-model').value)) el('caption-model').value = state.models.includes('small') ? 'small' : state.models.includes('base') ? 'base' : state.models[0];
    let status = !api?.captionStart ? '자동 자막은 독립 데스크톱 앱에서 사용할 수 있습니다.' : !state.available ? 'setup-captions.ps1로 무료 자막 엔진을 설치한 뒤 앱을 재시작하세요.' : state.error || (state.active && !state.ready ? '한국어 모델 로딩 중…' : state.ready ? lastMetric || (useVod() ? '다시보기 자막을 미리 준비하는 중…' : `음성을 듣는 중… (${state.device==='cuda'?'NVIDIA GPU':'CPU'} · ${el('caption-interval').value}초 갱신)`) : '한국어 자동 자막 대기 · GPU 우선 / CPU 자동 전환');
    if (state.ready && state.notice) status += ' · '+state.notice;
    if (enabled && useVod()) status += ` · 현재 위치보다 ${Math.max(0,timeline.through-video.currentTime).toFixed(0)}초 앞까지 준비`;
    if (vodMode && state.available && !state.vodAvailable) status += ' · FFmpeg가 없어 현재 소리를 인식합니다.';
    el('caption-status').textContent = status;
  }
  async function connectAudio() {
    if (!context) { context = new AudioContext(); source = context.createMediaElementSource(video); source.connect(context.destination); }
    if (!workletReady) { await context.audioWorklet.addModule('/caption-worklet.js'); workletReady = true; }
    await context.resume();
    processor = new AudioWorkletNode(context,'korean-caption-pcm',{channelCount:1,channelCountMode:'explicit',numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1]});
    silent = context.createGain(); silent.gain.value = 0;
    source.connect(processor); processor.connect(silent); silent.connect(context.destination); connected = true;
    processor.port.onmessage = event => {
      if (!enabled || !state.ready || useVod() || video.paused || video.seeking || !video.readyState || changingSource || event.data.epoch !== epoch) return;
      const end = video.currentTime, rate = video.playbackRate, interval = Number(el('caption-interval').value);
      if (lastEnd !== null && Math.abs((end-lastEnd)-interval*rate) > 2*rate) { reset(); return; }
      lastEnd = end;
      const samples = new Float32Array(event.data.pcm); let energy = 0;
      for (let i=0;i<samples.length;i++) energy += samples[i]*samples[i];
      if (Math.sqrt(energy/samples.length) < .001) return;
      api.captionAudio({pcm:event.data.pcm,epoch,end,capturedAt:Date.now()});
    };
  }
  async function tickAhead() {
    if (!enabled || !useVod()) return;
    const text = timeline.at(video.currentTime); overlay.textContent = text; overlay.hidden = !text;
    timeline.prune(video.currentTime); render();
    if (!state.ready || changingSource || video.seeking || video.readyState < 1 || aheadFlight || Date.now()<retryAt) return;
    if (cursor+12 < video.currentTime) { reset(); return; }
    const duration = Math.min(12,video.duration-cursor);
    if (!Number.isFinite(duration) || duration < 1 || cursor >= video.currentTime+30) return;
    const run = epoch; aheadFlight = {epoch:run,start:cursor};
    const url = currentVod.preview?.url || masterSourceURL;
    try {
      const result = await api.captionVod({url,videoId:currentVod.videoId,start:cursor,duration,epoch:run});
      if (run !== epoch) return;
      if (!result?.accepted) throw new Error(result?.error || '선행 자막 구간을 준비하지 못했습니다.');
    } catch(error) {
      if (run !== epoch) return;
      aheadFlight = null; retryAt = Date.now()+5000; lastMetric = error.message; render();
    }
  }
  el('caption-toggle').onclick = async () => {
    if (enabling) return;
    if (enabled || state.active) { enabled = false; disconnect(); render(await api.captionStop()); return; }
    if (!video.videoWidth) { el('caption-status').textContent = '영상을 먼저 재생한 뒤 자막을 켜세요.'; return; }
    enabling = true; render(); lastMetric = ''; metrics = [];
    try {
      await connectAudio(); enabled = true; reset();
      const result = await api.captionStart(el('caption-model').value,el('caption-device').value);
      if (result.error) throw new Error(result.error);
      state = result.state; reset();
    } catch(error) { enabled = false; disconnect(); await api.captionStop(); lastMetric = ''; state.error = error.message; }
    finally { enabling = false; render(); }
  };
  if (api?.captionState) {
    api.onCaptionState(next => { const justReady = !state.ready && next.ready; render(next); if (justReady) reset(); });
    api.onCaptionResult(result => {
      if (!enabled || result.epoch !== epoch || video.seeking) return;
      if (result.mode === 'vod') {
        if (!useVod()) return;
        aheadFlight = null;
        if (result.error) { retryAt = Date.now()+5000; lastMetric = result.error; render(); return; }
        timeline.add(result.start,result.end,result.cues); cursor = result.end;
        lastMetric = `${el('caption-model').selectedOptions[0].textContent} · ${result.device==='cuda'?'GPU':'CPU'} · 선행 ${result.seconds.toFixed(0)}초 → 처리 ${result.processing.toFixed(2)}초 · 재생 시각 동기화`;
        tickAhead(); return;
      }
      if (useVod()) return;
      const latency = (Date.now()-result.capturedAt)/1000;
      metrics.push(result.processing/result.seconds); metrics = metrics.slice(-10);
      const average = metrics.reduce((a,b)=>a+b,0)/metrics.length;
      lastMetric = `${result.device==='cuda'?'GPU':'CPU'} · ${result.seconds.toFixed(0)}초 갱신 / 문맥 ${(result.contextSeconds || result.seconds).toFixed(0)}초 → 처리 ${result.processing.toFixed(2)}초 · 평균 처리비 ${average.toFixed(2)}배 · 수집 포함 지연 약 ${(latency+result.seconds).toFixed(1)}초 · 건너뜀 ${result.dropped}구간`;
      render(); if (!result.text) return;
      overlay.textContent = result.text; overlay.hidden = false; clearTimeout(hideTimer); hideTimer = setTimeout(clearText,7000);
    });
    api.captionState().then(render).catch(()=>{});
  }
  for (const name of ['seeking','emptied','ratechange']) video.addEventListener(name,()=>{if(enabled)reset();});
  video.addEventListener('loadedmetadata',()=>{if(enabled)reset();render();});
  video.addEventListener('pause',()=>{if(enabled&&!useVod())reset();});
  setInterval(tickAhead,200);
  window.addEventListener('beforeunload',()=>{enabled=false;disconnect();});
  render();
})();
