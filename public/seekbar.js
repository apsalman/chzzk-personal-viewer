(function(root) {
  function timeLabel(seconds) {
    const n = Math.max(0,Math.floor(seconds||0));
    const hours = Math.floor(n/3600), minutes = Math.floor(n%3600/60), secs=String(n%60).padStart(2,'0');
    return hours ? `${hours}:${String(minutes).padStart(2,'0')}:${secs}` : `${minutes}:${secs}`;
  }
  function targetAt(start,end,fraction) { return start+Math.max(0,Math.min(1,fraction))*Math.max(0,end-start); }
  function describePoint(target,current,end,vod=false) {
    const delta = target-current;
    return { position:vod?`${timeLabel(target)} / ${timeLabel(end)}`:`${timeLabel(target)} · LIVE −${timeLabel(end-target)}`, movement:Math.abs(delta)<.5?'현재 재생 위치':`현재보다 ${Math.round(Math.abs(delta))}초 ${delta<0?'뒤로':'앞으로'}` };
  }
  function installSeekbar(video) {
    const screen=video.parentElement,doc=video.ownerDocument;
    const bar=doc.createElement('div');bar.className='seek-bar';bar.tabIndex=0;bar.setAttribute('role','slider');bar.setAttribute('aria-label','영상 재생 위치');bar.setAttribute('aria-orientation','horizontal');
    const track=doc.createElement('div');track.className='seek-track';
    const fill=doc.createElement('span');fill.className='seek-fill';
    const thumb=doc.createElement('span');thumb.className='seek-thumb';
    const tip=doc.createElement('div');tip.className='seek-tooltip';tip.setAttribute('role','tooltip');tip.hidden=true;
    const position=doc.createElement('strong'),movement=doc.createElement('span');tip.append(position,movement);track.append(fill,thumb);bar.append(track,tip);screen.append(bar);
    const preview=root.installSeekPreview?.(doc,tip,()=>updateTip());
    let dragging=false,hovered=false,lastX=0,hideTimer;
    function range() {
      if(video.seekable.length)return {start:video.seekable.start(0),end:video.seekable.end(video.seekable.length-1)};
      return {start:0,end:Number.isFinite(video.duration)?video.duration:0};
    }
    function wake() {
      screen.classList.add('seek-awake');clearTimeout(hideTimer);
      hideTimer=setTimeout(()=>{if(!dragging&&!hovered)screen.classList.remove('seek-awake');},2500);
    }
    function hoverPoint() {
      const r=bar.getBoundingClientRect(),bounds=range();
      const fraction=Math.max(0,Math.min(1,(lastX-r.left)/r.width));
      return {target:targetAt(bounds.start,bounds.end,fraction),fraction,bounds};
    }
    function updateTip() {
      if(!hovered&&!dragging)return;
      const {target,fraction,bounds}=hoverPoint();
      const text=describePoint(target,video.currentTime,bounds.end,video.dataset?.vod==='true');
      if(video.dataset?.vod==='true')preview?.show(target);else preview?.hide();
      position.textContent=text.position;movement.textContent=text.movement;tip.hidden=false;
      const width=bar.clientWidth;
      tip.style.left=Math.max(0,Math.min(width-tip.offsetWidth,fraction*width-tip.offsetWidth/2))+'px';
    }
    function update() {
      const {start,end}=range(),length=end-start;
      screen.classList.toggle('seek-ready',length>0&&video.readyState>0);
      const fraction=length>0?Math.max(0,Math.min(1,(video.currentTime-start)/length)):0;
      bar.style.setProperty('--seek-progress',fraction*100+'%');
      bar.setAttribute('aria-valuemin',String(Math.floor(start)));bar.setAttribute('aria-valuemax',String(Math.floor(end)));
      bar.setAttribute('aria-valuenow',String(Math.floor(video.currentTime)));bar.setAttribute('aria-valuetext',`${timeLabel(video.currentTime)} / ${timeLabel(end)}${video.dataset?.vod==='true'?'':` · 라이브보다 ${Math.max(0,Math.round(end-video.currentTime))}초 전`}`);
      updateTip();
    }
    function seekAtPointer() {
      const {target,bounds}=hoverPoint();
      if(bounds.end>bounds.start)video.currentTime=Math.max(bounds.start,Math.min(bounds.end-.15,target));
      update();
    }
    bar.addEventListener('pointerenter',event=>{hovered=true;lastX=event.clientX;wake();updateTip();});
    bar.addEventListener('pointermove',event=>{lastX=event.clientX;wake();if(dragging)seekAtPointer();else updateTip();});
    bar.addEventListener('pointerleave',()=>{hovered=false;if(!dragging){tip.hidden=true;preview?.hide();}wake();});
    bar.addEventListener('pointerdown',event=>{
      if(event.button!==0)return;
      event.preventDefault();lastX=event.clientX;dragging=true;hovered=true;
      bar.setPointerCapture(event.pointerId);bar.focus({preventScroll:true});seekAtPointer();wake();
    });
    const finish=()=>{dragging=false;tip.hidden=!hovered;if(!hovered)preview?.hide();wake();};
    bar.addEventListener('pointerup',finish);bar.addEventListener('pointercancel',finish);bar.addEventListener('lostpointercapture',finish);
    bar.addEventListener('keydown',event=>{
      if(!['Home','End'].includes(event.key))return;
      event.preventDefault();event.stopPropagation();const {start,end}=range();
      if(end>start)video.currentTime=event.key==='Home'?start:Math.max(start,end-.15);update();wake();
    });
    bar.addEventListener('focus',wake);bar.addEventListener('blur',()=>{if(!hovered){tip.hidden=true;preview?.hide();}});
    screen.addEventListener('pointermove',wake);screen.addEventListener('pointerleave',()=>{hovered=false;if(!dragging){tip.hidden=true;preview?.hide();screen.classList.remove('seek-awake');}});
    for(const event of ['timeupdate','durationchange','loadedmetadata','progress','seeking','emptied'])video.addEventListener(event,update);
    video.addEventListener('pause',()=>{wake();screen.classList.add('seek-paused');});
    video.addEventListener('playing',()=>{screen.classList.remove('seek-paused');update();wake();});
    doc.addEventListener('fullscreenchange',()=>{update();wake();});
    update();
    return { setPreviewSource: value => preview?.setSource(value) };
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={timeLabel,targetAt,describePoint};
  else root.installSeekbar=installSeekbar;
})(globalThis);
