(() => {
  const el = id => document.getElementById(id), video = el('video');
  const panel = document.createElement('section'); panel.id = 'caption-tools';
  panel.innerHTML = '<div class="capture-row"><button id="caption-toggle" type="button" aria-pressed="false">한국어 자막 켜기</button><label for="caption-model">모델</label><select id="caption-model"><option value="base">Base · 기본</option><option value="tiny">Tiny · 빠름</option></select></div><p id="caption-status" role="status">한국어 자동 자막 대기</p><small>PC에서 무료로 처리합니다. 4초씩 인식하므로 지연·오인식이 발생할 수 있습니다. 처리 시간이 음성 길이보다 길면 Tiny를 선택하세요. 자막은 메인 영상에 표시됩니다.</small>';
  el('capture-tools').after(panel);
  const overlay = document.createElement('div'); overlay.id = 'auto-caption'; overlay.hidden = true;
  overlay.setAttribute('aria-label','한국어 자동 자막'); video.parentElement.append(overlay);
  const api = window.desktopChat;
  let state = {}, enabling = false, enabled = false, context, source, processor, silent, epoch = 0, connected = false, workletReady = false, hideTimer, lastMetric = '', metrics = [], lastEnd = null;
  function clearText() { clearTimeout(hideTimer); overlay.textContent = ''; overlay.hidden = true; }
  function reset() {
    epoch++; lastEnd = null; clearText(); processor?.port.postMessage({epoch}); api?.captionReset?.(epoch);
  }
  function disconnect() {
    if (connected) { source.disconnect(processor); processor.disconnect(); silent.disconnect(); connected = false; }
    processor?.port.close(); processor = null; silent = null;
    reset();
  }
  function render(next = state) {
    state = next || {};
    if (!state.active && enabled && !enabling) { enabled = false; disconnect(); }
    el('caption-toggle').textContent = enabled || state.active ? '한국어 자막 끄기' : '한국어 자막 켜기';
    el('caption-toggle').setAttribute('aria-pressed',String(enabled || !!state.active));
    el('caption-toggle').disabled = enabling || !api?.captionStart || !state.available;
    el('caption-model').disabled = enabling || enabled || !!state.active;
    el('caption-status').textContent = !api?.captionStart ? '자동 자막은 독립 데스크톱 앱에서 사용할 수 있습니다.' : !state.available ? 'setup-captions.ps1을 실행해 무료 자막 엔진을 설치한 뒤 앱을 재시작하세요.' : state.error || (state.active && !state.ready ? '한국어 모델 로딩 중…' : state.ready ? lastMetric || '음성을 듣는 중… (첫 자막까지 4초 이상 걸립니다.)' : '한국어 자동 자막 대기 · 로컬 CPU / INT8');
  }
  async function connectAudio() {
    if (!context) {
      context = new AudioContext();
      source = context.createMediaElementSource(video);
      // Keep normal playback connected even when captions are disabled.
      source.connect(context.destination);
    }
    if (!workletReady) { await context.audioWorklet.addModule('/caption-worklet.js'); workletReady = true; }
    await context.resume();
    processor = new AudioWorkletNode(context,'korean-caption-pcm',{channelCount:1,channelCountMode:'explicit',numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1]});
    silent = context.createGain(); silent.gain.value = 0;
    source.connect(processor); processor.connect(silent); silent.connect(context.destination); connected = true;
    processor.port.onmessage = event => {
      if (!enabled || !state.ready || video.paused || video.seeking || !video.readyState || changingSource || event.data.epoch !== epoch) return;
      const end = video.currentTime, rate = video.playbackRate;
      if (lastEnd !== null && Math.abs((end-lastEnd)-4*rate) > 2*rate) { reset(); return; }
      lastEnd = end;
      const samples = new Float32Array(event.data.pcm);
      let energy = 0; for (let i=0;i<samples.length;i++) energy += samples[i]*samples[i];
      if (Math.sqrt(energy/samples.length) < .001) return;
      api.captionAudio({pcm:event.data.pcm,epoch,end,capturedAt:Date.now()});
    };
  }
  el('caption-toggle').onclick = async () => {
    if (enabling) return;
    if (enabled || state.active) { enabled = false; disconnect(); render(await api.captionStop()); return; }
    if (!video.videoWidth) { el('caption-status').textContent = '영상을 먼저 재생한 뒤 자막을 켜세요.'; return; }
    enabling = true; render(); lastMetric = ''; metrics = [];
    try {
      await connectAudio(); enabled = true; reset();
      const result = await api.captionStart(el('caption-model').value);
      if (result.error) throw new Error(result.error);
      state = result.state; reset();
    } catch (error) { enabled = false; disconnect(); await api.captionStop(); lastMetric = ''; state.error = error.message; }
    finally { enabling = false; render(); }
  };
  if (api?.captionState) {
    api.onCaptionState(next => {
      const justReady = !state.ready && next.ready;
      render(next); if (justReady) reset();
    });
    api.onCaptionResult(result => {
      if (!enabled || result.epoch !== epoch || video.seeking) return;
      const latency = (Date.now()-result.capturedAt)/1000;
      metrics.push(result.processing/result.seconds); metrics = metrics.slice(-10);
      const average = metrics.reduce((a,b)=>a+b,0)/metrics.length;
      lastMetric = `음성 ${result.seconds.toFixed(1)}초 → 처리 ${result.processing.toFixed(2)}초 · 평균 처리비 ${average.toFixed(2)}배 (1 미만이면 실시간 처리 가능) · 수집 포함 지연 약 ${(latency+result.seconds).toFixed(1)}초 · 건너뜀 ${result.dropped}구간`;
      render();
      if (!result.text) return;
      overlay.textContent = result.text; overlay.hidden = false;
      clearTimeout(hideTimer); hideTimer = setTimeout(clearText,7000);
    });
    api.captionState().then(render).catch(() => {});
  }
  for (const name of ['seeking','emptied','ratechange','pause']) video.addEventListener(name, () => { if (enabled) reset(); });
  window.addEventListener('beforeunload', () => { enabled = false; disconnect(); });
  render();
})();
