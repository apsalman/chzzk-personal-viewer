(() => {
  const el = id => document.getElementById(id), video = el('video'), api = window.desktopChat;
  const panel = document.createElement('section'); panel.id = 'caption-tools';
  panel.innerHTML = '<div class="capture-row"><button id="caption-toggle" type="button" aria-pressed="false">한국어 자막 켜기</button><label for="caption-model">모델</label><select id="caption-model"><option value="small" selected>Small · 정확도 우선</option><option value="base">Base · 속도 우선</option><option value="tiny">Tiny · 낮은 정확도</option></select><label for="caption-interval">갱신</label><select id="caption-interval"><option value="2" selected>2초 · 빠른 표시</option><option value="3">3초</option><option value="4">4초 · 문맥 우선</option></select><label for="caption-device">처리</label><select id="caption-device"><option value="auto">자동 · GPU 우선</option><option value="cpu">CPU</option><option value="cuda">NVIDIA GPU</option></select><label id="caption-mode-label" hidden>다시보기 <select id="caption-mode"><option value="ahead">선행 인식 · 시간 동기화</option><option value="live">현재 소리 인식</option></select></label></div><p id="caption-status" role="status">한국어 자동 자막 대기</p><small>Small은 정확도 우선, Base는 속도 우선입니다. 다시보기는 FFmpeg로 약 30초 앞까지 자막을 준비합니다. 시작·탐색 직후에는 준비 시간이 필요합니다. 자막은 메인 영상에 표시됩니다.</small>';
  el('capture-tools').after(panel);
  const overlay = document.createElement('div'); overlay.id = 'auto-caption'; overlay.hidden = true; overlay.setAttribute('aria-label','한국어 자동 자막'); video.parentElement.append(overlay);
  overlay.tabIndex=0;overlay.title='드래그하여 자막 위치 이동 · 방향키로 미세 조정 · Home으로 기본 위치';
  const positionReset=document.createElement('button');positionReset.type='button';positionReset.textContent='자막 위치 초기화';panel.querySelector('.capture-row').append(positionReset);
  const positionHelp=document.createElement('small');positionHelp.textContent='표시된 자막을 드래그하여 이동할 수 있습니다. 위치는 다음 실행에도 유지됩니다.';panel.append(document.createElement('br'),positionHelp);
  let captionPosition=null,positionTouched=false,drag=null;
  const validPosition=value=>value&&Number.isFinite(value.x)&&Number.isFinite(value.y)&&value.x>=0&&value.x<=1&&value.y>=0&&value.y<=1;
  function placeCaption(){
    if(!captionPosition){overlay.style.left='';overlay.style.top='';overlay.style.bottom='';overlay.style.transform='';return;}
    const area=overlay.parentElement.getBoundingClientRect();
    if(overlay.hidden||!area.width||!area.height)return;
    const halfX=Math.min(.5,overlay.offsetWidth/area.width/2),halfY=Math.min(.5,overlay.offsetHeight/area.height/2);
    const x=Math.max(halfX,Math.min(1-halfX,captionPosition.x)),y=Math.max(halfY,Math.min(1-halfY,captionPosition.y));
    overlay.style.left=`${x*100}%`;overlay.style.top=`${y*100}%`;overlay.style.bottom='auto';overlay.style.transform='translate(-50%,-50%)';
  }
  function saveCaptionPosition(){
    positionTouched=true;
    if(api?.captionSetPosition)api.captionSetPosition(captionPosition).catch(()=>{});
    else try{localStorage.setItem('caption-position',JSON.stringify(captionPosition));}catch{}
  }
  positionReset.onclick=()=>{captionPosition=null;placeCaption();saveCaptionPosition();};
  overlay.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;
    positionTouched=true;overlay.focus({preventScroll:true});
    const rect=overlay.getBoundingClientRect();drag={id:event.pointerId,dx:event.clientX-(rect.left+rect.width/2),dy:event.clientY-(rect.top+rect.height/2)};
    overlay.setPointerCapture(event.pointerId);overlay.classList.add('dragging');event.preventDefault();event.stopPropagation();
  });
  overlay.addEventListener('pointermove',event=>{
    if(!drag||drag.id!==event.pointerId)return;
    const rect=overlay.parentElement.getBoundingClientRect();if(!rect.width||!rect.height)return;
    captionPosition={x:Math.max(0,Math.min(1,(event.clientX-rect.left-drag.dx)/rect.width)),y:Math.max(0,Math.min(1,(event.clientY-rect.top-drag.dy)/rect.height))};placeCaption();
    event.preventDefault();event.stopPropagation();
  });
  function finishDrag(event){if(!drag||event.pointerId!==drag.id)return;drag=null;overlay.classList.remove('dragging');saveCaptionPosition();}
  for(const name of ['pointerup','pointercancel','lostpointercapture'])overlay.addEventListener(name,finishDrag);
  for(const name of ['click','dblclick'])overlay.addEventListener(name,event=>event.stopPropagation());
  overlay.addEventListener('keydown',event=>{
    if(event.ctrlKey||event.altKey||event.metaKey)return;
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();
    if(event.key==='Home'){positionReset.click();return;}
    const rect=overlay.getBoundingClientRect(),area=overlay.parentElement.getBoundingClientRect(),step=event.shiftKey?10:2;
    captionPosition={x:Math.max(0,Math.min(1,(rect.left+rect.width/2-area.left+(event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0))/area.width)),y:Math.max(0,Math.min(1,(rect.top+rect.height/2-area.top+(event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0))/area.height))};placeCaption();saveCaptionPosition();
  });
  new ResizeObserver(placeCaption).observe(overlay.parentElement);
  new ResizeObserver(placeCaption).observe(overlay);
  new MutationObserver(placeCaption).observe(overlay,{childList:true,attributes:true,attributeFilter:['hidden']});
  window.addEventListener('resize',placeCaption);
  document.addEventListener('fullscreenchange',placeCaption);
  if(api?.captionPosition)api.captionPosition().then(value=>{if(!positionTouched&&validPosition(value)){captionPosition=value;placeCaption();}}).catch(()=>{});
  else try{const value=JSON.parse(localStorage.getItem('caption-position'));if(validPosition(value)){captionPosition=value;placeCaption();}}catch{}
  const timeline = new window.CaptionTimeline();
  for(const [name,label] of [['medium','Medium · 고정확도'],['turbo','Turbo · 고정확도 / 속도 개선']])el('caption-model').add(new Option(label,name));
  const liveLabel=document.createElement('label');liveLabel.innerHTML='라이브 <select id="caption-live-mode"><option value="ahead">약 10초 지연 · 자막 동기화</option><option value="audio">현재 소리 인식</option></select>';el('caption-mode-label').after(liveLabel);
  let delayedHls=null,oldSync,delayPending=true;
  panel.querySelector('small').textContent='라이브 지연 모드는 최신 수신 구간보다 약 10초 뒤에서 재생하며 자막을 먼저 준비합니다. Medium·Turbo도 선택할 수 있습니다. 다시보기는 약 30초 앞까지 준비합니다. 시작·탐색 직후에는 준비 시간이 필요합니다.';
  let state = {}, enabling = false, enabled = false, context, source, processor, silent, connected = false, workletReady = false;
  let epoch = 0, hideTimer, lastMetric = '', metrics = [], lastEnd = null, cursor = 0, aheadFlight = null, retryAt = 0;
  const useVod = () => vodMode && !!currentVod && !!state.vodAvailable && !!api?.captionVod && el('caption-mode').value === 'ahead';
  const useLive = () => !vodMode && !!state.vodAvailable && !!api?.captionLive && el('caption-live-mode').value==='ahead' && !window.captureController?.state.active;
  const useAhead = () => useVod() || useLive();
  function restoreLatency(){if(delayedHls){delayedHls.config.liveSyncDuration=oldSync;delayedHls=null;}delayPending=true;}
  function clearText() { clearTimeout(hideTimer); overlay.textContent = ''; overlay.hidden = true; }
  function reset() {
    epoch++; lastEnd = null; clearText(); timeline.clear(); aheadFlight = null; cursor = useLive()?video.currentTime:Math.floor(video.currentTime/12)*12; retryAt = Date.now()+250;
    processor?.port.postMessage({epoch,seconds:Number(el('caption-interval').value)}); api?.captionReset?.(epoch);
  }
  function disconnect() {
    restoreLatency();
    if (connected) { source.disconnect(processor); processor.disconnect(); silent.disconnect(); connected = false; }
    processor?.port.close(); processor = null; silent = null; reset();
  }
  function render(next = state) {
    state = next || {};
    if (!state.active && enabled && !enabling) { enabled = false; disconnect(); }
    el('caption-toggle').textContent = enabled || state.active ? '한국어 자막 끄기' : '한국어 자막 켜기';
    el('caption-toggle').setAttribute('aria-pressed',String(enabled || !!state.active));
    el('caption-toggle').disabled = enabling || !api?.captionStart || !state.available;
    for (const id of ['caption-model','caption-interval','caption-device','caption-mode','caption-live-mode']) el(id).disabled = enabling || enabled || !!state.active;
    liveLabel.hidden=vodMode;
    el('caption-mode-label').hidden = !vodMode;
    for (const option of el('caption-model').options) option.disabled = !!state.models && !state.models.includes(option.value);
    if (!state.active && state.models?.length && !state.models.includes(el('caption-model').value)) el('caption-model').value = state.models.includes('small') ? 'small' : state.models.includes('base') ? 'base' : state.models[0];
    let status = !api?.captionStart ? '자동 자막은 독립 데스크톱 앱에서 사용할 수 있습니다.' : !state.available ? 'setup-captions.ps1로 무료 자막 엔진을 설치한 뒤 앱을 재시작하세요.' : state.error || (state.active && !state.ready ? '한국어 모델 로딩 중…' : state.ready ? lastMetric || (useVod() ? '다시보기 자막을 미리 준비하는 중…' : `음성을 듣는 중… (${state.device==='cuda'?'NVIDIA GPU':'CPU'} · ${el('caption-interval').value}초 갱신)`) : '한국어 자동 자막 대기 · GPU 우선 / CPU 자동 전환');
    if (state.ready && state.notice) status += ' · '+state.notice;
    if (enabled && useAhead()) status += ` · 현재 위치보다 ${Math.max(0,timeline.through-video.currentTime).toFixed(0)}초 앞까지 준비`;
    if(enabled&&useLive())status+=' · 라이브 약 10초 지연';
    if(enabled&&!vodMode&&window.captureController?.state.active)status+=' · 녹화/리플레이 중에는 현재 소리를 인식합니다.';
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
      if (!enabled || !state.ready || useAhead() || video.paused || video.seeking || !video.readyState || changingSource || event.data.epoch !== epoch) return;
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
    if(!useLive()&&delayedHls)restoreLatency();
    if (!enabled || !useAhead()) return;
    if(useLive()&&hls&&hls!==delayedHls){restoreLatency();delayedHls=hls;oldSync=hls.config.liveSyncDuration;hls.config.liveSyncDuration=10;delayPending=true;}
    const details=useLive()?hls?.levels[hls.currentLevel]?.details:null;
    const fragments=details?.fragments||[];
    if(useLive()&&delayPending&&fragments.length&&video.seekable.length&&!changingSource){
      const edge=fragments.at(-1).start+fragments.at(-1).duration;
      video.currentTime=Math.max(video.seekable.start(0),edge-10);delayPending=false;reset();return;
    }
    const text = timeline.at(video.currentTime); overlay.textContent = text; overlay.hidden = !text;
    timeline.prune(video.currentTime); render();
    if (!state.ready || changingSource || video.seeking || video.readyState < 1 || aheadFlight || Date.now()<retryAt) return;
    if (cursor+(useLive()?2:12) < video.currentTime) { reset(); return; }
    const edge=useLive()&&fragments.length?fragments.at(-1).start+fragments.at(-1).duration:video.duration;
    const duration = Math.min(useLive()?6:12,edge-cursor);
    if(useLive()&&(!fragments.length||duration<4))return;
    if (!Number.isFinite(duration) || duration < 1 || cursor >= video.currentTime+30) return;
    const run = epoch; aheadFlight = {epoch:run,start:cursor};
    const url = useLive()?hls.levels[hls.currentLevel].url[0]:currentVod.preview?.url || masterSourceURL;
    try {
      const result = useLive()?await api.captionLive({url:new URL(url,location.href).pathname,sn:fragments.at(-1).sn,time:fragments.at(-1).start,start:cursor,duration,epoch:run}):await api.captionVod({url,videoId:currentVod.videoId,start:cursor,duration,epoch:run});
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
  el('caption-toggle').title='한국어 자막 켜기/끄기 (C)';
  document.addEventListener('keydown',event=>{
    if(event.defaultPrevented||event.repeat||event.isComposing||event.keyCode===229||event.ctrlKey||event.altKey||event.metaKey)return;
    if(event.code!=='KeyC'&&!['c','C'].includes(event.key))return;
    if(event.target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="combobox"],[role="menu"]'))return;
    const button=el('caption-toggle');if(button.disabled)return;
    event.preventDefault();event.stopPropagation();button.click();
  });
  if (api?.captionState) {
    api.onCaptionState(next => { const justReady = !state.ready && next.ready; render(next); if (justReady) reset(); });
    api.onCaptionResult(result => {
      if (!enabled || result.epoch !== epoch || video.seeking) return;
      if (result.mode === 'vod') {
        if (!useAhead()) return;
        aheadFlight = null;
        if (result.error) { retryAt = Date.now()+5000; lastMetric = result.error; render(); return; }
        timeline.add(result.start,result.end,result.cues); cursor = result.end;
        lastMetric = `${el('caption-model').selectedOptions[0].textContent} · ${result.device==='cuda'?'GPU':'CPU'} · 선행 ${result.seconds.toFixed(0)}초 → 처리 ${result.processing.toFixed(2)}초 · 재생 시각 동기화`;
        tickAhead(); return;
      }
      if (useAhead()) return;
      const latency = (Date.now()-result.capturedAt)/1000;
      metrics.push(result.processing/result.seconds); metrics = metrics.slice(-10);
      const average = metrics.reduce((a,b)=>a+b,0)/metrics.length;
      lastMetric = `${result.device==='cuda'?'GPU':'CPU'} · ${result.seconds.toFixed(0)}초 갱신 / 문맥 ${(result.contextSeconds || result.seconds).toFixed(0)}초 → 처리 ${result.processing.toFixed(2)}초 · 평균 처리비 ${average.toFixed(2)}배 · 수집 포함 지연 약 ${(latency+result.seconds).toFixed(1)}초 · 건너뜀 ${result.dropped}구간`;
      render(); if (!result.text) return;
      overlay.textContent = result.text; overlay.hidden = false; clearTimeout(hideTimer); hideTimer = setTimeout(clearText,7000);
    });
    api.captionState().then(render).catch(()=>{});
  }
  for (const name of ['seeking','emptied','ratechange']) video.addEventListener(name,()=>{
    if(enabled){
      if(name==='seeking'&&useLive()){
        const edge=hls?.levels[hls.currentLevel]?.details?.edge;
        if(Number.isFinite(edge)&&video.currentTime>edge-8)delayPending=true;
      }
      reset();
    }
  });
  video.addEventListener('loadedmetadata',()=>{delayPending=true;if(enabled)reset();render();});
  video.addEventListener('pause',()=>{if(enabled&&!useAhead())reset();});
  setInterval(tickAhead,200);
  window.addEventListener('beforeunload',()=>{enabled=false;disconnect();});
  render();
})();
