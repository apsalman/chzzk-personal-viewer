(function(root) {
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function waitReady(video,timeout=20000) {
    const until=Date.now()+timeout;
    while(Date.now()<until) {
      if(video.error)throw new Error('라이브 영상 재연결에 실패했습니다.');
      if(video.readyState>=3&&video.videoWidth>0&&!video.paused&&video.currentTime>.05)return;
      await sleep(50);
    }
    throw new Error('라이브 영상 연결 시간이 초과되었습니다. 기존 리플레이는 유지합니다.');
  }
  async function handoffToLive({video,source,loadPrimary,getPrimaryHls,onStage}) {
    const overlay=document.createElement('video');
    overlay.className='handoff-video';overlay.playsInline=true;overlay.muted=true;overlay.volume=video.volume;
    overlay.setAttribute('aria-hidden','true');
    video.parentElement.append(overlay);
    let warm,visible=false;
    let wasPaused=video.paused;
    const oldSource=getPrimaryHls()?.url;
    const cleanup=()=>{
      if(video.handoffPlayback===overlay)delete video.handoffPlayback;
      overlay.pause();warm?.destroy();overlay.remove();if(!video.handoffPlayback)video.parentElement.classList.remove('live-handoff');
    };
    try {
      onStage?.('라이브 연결 준비 중 · 기존 영상은 계속 재생됩니다.');
      if(root.Hls?.isSupported()) {
        warm=new Hls({lowLatencyMode:false,maxBufferLength:12,backBufferLength:0,liveSyncDurationCount:4});
        warm.loadSource(source);warm.attachMedia(overlay);
        warm.on(Hls.Events.MANIFEST_PARSED,()=>overlay.play().catch(()=>{}));
      } else {overlay.src=source;overlay.play().catch(()=>{});}
      await waitReady(overlay);
      wasPaused=video.paused;
      const muted=video.muted,volume=video.volume;
      video.muted=true;video.pause();
      overlay.volume=volume;overlay.muted=muted;if(wasPaused)overlay.pause();
      overlay.classList.add('visible');video.handoffPlayback=overlay;video.parentElement.classList.add('live-handoff');visible=true;
      await loadPrimary(source);
      await waitReady(video);
      const liveDate=warm?.playingDate,primaryDate=getPrimaryHls()?.playingDate;
      if(liveDate instanceof Date&&primaryDate instanceof Date&&video.seekable.length) {
        const delta=(liveDate.getTime()-primaryDate.getTime())/1000;
        const last=video.seekable.length-1;
        const target=video.currentTime+delta;
        if(Number.isFinite(delta)&&Math.abs(delta)>.3&&target>=video.seekable.start(last)&&target<video.seekable.end(last)-.2) {
          video.currentTime=target;await waitReady(video,10000);
        }
      }
      const finalMuted=overlay.muted;overlay.muted=true;video.volume=overlay.volume;video.muted=finalMuted;
      if(wasPaused)video.pause();else await video.play();
      cleanup();
      onStage?.('라이브 재생 중 · 임시 버퍼를 백그라운드에서 정리하는 중…');
    } catch(error) {
      if(!visible){cleanup();throw error;}
      if(oldSource) {
        try {await loadPrimary(oldSource);await waitReady(video,15000);const muted=overlay.muted;overlay.muted=true;video.volume=overlay.volume;video.muted=muted;if(wasPaused)video.pause();else await video.play();cleanup();}catch{
          // Keep the already playing cover visible until the primary video recovers.
          video.addEventListener('playing',()=>{video.volume=overlay.volume;video.muted=overlay.muted;cleanup();},{once:true});
        }
      }
      throw error;
    }
  }
  root.handoffToLive=handoffToLive;
})(globalThis);
