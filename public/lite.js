(() => {
  const media=document.getElementById('lite-video'),note=document.getElementById('lite-status'),menu=document.getElementById('lite-menu');
  const api=window.desktopChat;let state,player,lastSave=0,exiting=false,connecting=false,awakeTimer,noteTimer,revision=0;
  const notify=text=>{note.textContent=text;note.hidden=false;clearTimeout(noteTimer);noteTimer=setTimeout(()=>note.hidden=true,4000);};
  function save(force=false){
    if(!state||(!force&&Date.now()-lastSave<2000))return;lastSave=Date.now();
    if(!connecting&&media.readyState>=1){if(state.data.kind==='vod')state.position=media.currentTime;state.paused=media.paused;state.volume=media.volume;state.muted=media.muted;state.rate=media.playbackRate;}
    sessionStorage.setItem('lite-playback',JSON.stringify(state));
    const viewing=state.data.kind==='vod'?{kind:'vod',address:state.address,position:state.position}:state.data.channelId?{kind:'live',address:state.address,position:0}:null;
    if(viewing){localStorage.setItem('chzzk-viewing-state',JSON.stringify(viewing));api?.saveViewingState(viewing);}
    api?.saveAddress(state.address);localStorage.setItem('chzzk-channel',state.address);
  }
  async function leave(){
    if(exiting)return;exiting=true;save(true);sessionStorage.setItem('lite-return',JSON.stringify(state));
    try{if(document.fullscreenElement)await document.exitFullscreen();if(api){const result=await api.lite(false);if(result?.error)throw Error(result.error);await api.playerMode(false);}location.replace('/');}
    catch(error){exiting=false;notify(error.message);}
  }
  async function fullscreen(){if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}
  async function connect(forceProxy=false){
    connecting=true;const run=++revision;player?.destroy();player=null;note.hidden=false;note.textContent='Lite 모드로 연결 중…';
    const position=state.data.kind==='vod'?state.position:null;
    media.muted=state.muted;media.volume=state.volume;media.playbackRate=state.data.kind==='vod'?state.rate:1;
    media.addEventListener('loadeddata',()=>{if(run===revision)connecting=false;},{once:true});
    media.addEventListener('loadedmetadata',()=>{if(run!==revision)return;if(position!==null)media.currentTime=Math.min(position,Math.max(0,media.duration-.5));media.playbackRate=state.data.kind==='vod'?state.rate:1;},{once:true});
    const playbackSource=forceProxy||!window.Hls?.isSupported()?state.source:await window.litePlaybackSource(state.source,state.data);
    if(run!==revision||exiting)return;
    const direct=playbackSource!==state.source;
    if(window.Hls?.isSupported()){
      player=new Hls({lowLatencyMode:false,maxBufferLength:15,maxMaxBufferLength:30,maxBufferSize:20000000,backBufferLength:5,startPosition:position??-1});
      player.on(Hls.Events.MANIFEST_PARSED,()=>{if(run!==revision)return;const index=player.levels.findIndex(level=>level.height===state.height);if(index>=0)player.currentLevel=index;if(!state.paused)media.play().catch(()=>{if(run===revision&&!exiting)notify('재생 버튼을 눌러 주세요.');});else note.hidden=true;});
      let recoveries=0;player.on(Hls.Events.ERROR,(_event,error)=>{if(run!==revision)return;if(direct&&error.type===Hls.ErrorTypes.NETWORK_ERROR){save(true);connect(true);return;}if(!error.fatal)return;if(error.type===Hls.ErrorTypes.MEDIA_ERROR&&recoveries++<1)player.recoverMediaError();else{player.stopLoad();notify('연결이 끊겼습니다. 우클릭 → 다시 연결을 선택하세요.');}});
      player.loadSource(playbackSource);player.attachMedia(media);
    }else if(media.canPlayType('application/vnd.apple.mpegurl')){media.src=state.source;if(!state.paused)media.play().catch(()=>notify('재생 버튼을 눌러 주세요.'));}
    else notify('이 환경에서는 영상을 재생할 수 없습니다.');
  }
  document.getElementById('lite-exit').onclick=leave;document.getElementById('lite-return').onclick=leave;
  document.getElementById('lite-fullscreen').onclick=()=>{menu.hidden=true;fullscreen().catch(error=>notify(error.message));};
  document.getElementById('lite-reconnect').onclick=async()=>{menu.hidden=true;save(true);try{const response=await fetch('/api/resolve?url='+encodeURIComponent(state.address)),data=await response.json();if(!response.ok||!data.sources?.length)throw Error(data.error||'다시 연결하지 못했습니다.');state.data=data;state.source=data.sources[0].url;connect();}catch(error){notify(error.message);}};
  media.addEventListener('contextmenu',event=>{event.preventDefault();menu.hidden=false;menu.style.left=Math.max(0,Math.min(event.clientX,innerWidth-menu.offsetWidth-8))+'px';menu.style.top=Math.max(0,Math.min(event.clientY,innerHeight-menu.offsetHeight-8))+'px';document.getElementById('lite-reconnect').focus();});
  document.addEventListener('pointerdown',event=>{if(!menu.contains(event.target))menu.hidden=true;});
  document.addEventListener('pointermove',()=>{document.body.classList.add('awake');clearTimeout(awakeTimer);awakeTimer=setTimeout(()=>document.body.classList.remove('awake'),2000);},{passive:true});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.fullscreenElement){event.preventDefault();leave();}});
  media.addEventListener('playing',()=>note.hidden=true);
  media.addEventListener('timeupdate',()=>{if(state?.data.kind==='vod')save();});for(const name of ['pause','seeked','ended'])media.addEventListener(name,()=>save(true));
  window.addEventListener('pagehide',()=>save(true));window.addEventListener('beforeunload',()=>{save(true);player?.destroy();});
  window.installPlayerKeys(media,notify,()=>fullscreen().catch(error=>notify(error.message)));
  try{state=JSON.parse(sessionStorage.getItem('lite-playback'));if(!state?.source||!state.data?.sources?.length)throw Error('시청할 영상이 없습니다. Esc로 돌아가세요.');save(true);connect();}
  catch(error){notify(error.message);}
})();
