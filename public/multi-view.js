(() => {
  const layout=document.getElementById('layout'),watch=document.querySelector('.watch'),chat=document.getElementById('chat');
  const api=window.desktopChat,geometry=window.MultiLayout,tiles=new Map();
  let board,toolbar,primary,settings,watchAnchor,chatAnchor,statusObserver,boardObserver,manualTree=null,serial=0,drag=null,frame=0,selected='primary';
  const addButton=document.createElement('button');addButton.type='button';addButton.id='add-stream';addButton.textContent='영상 추가 +';addButton.title='주소란의 영상을 현재 영상 옆에 추가합니다';document.getElementById('open').after(addButton);
  function button(text,action,title=text){const node=document.createElement('button');node.type='button';node.textContent=text;node.title=title;node.onclick=action;return node;}
  function ids(){return [...tiles.keys()];}
  function currentTree(){return manualTree||geometry.automatic(ids(),board.clientWidth,board.clientHeight);}
  function schedule(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;reflow();});}
  function report(){
    reportChatBounds();
    if(!api?.multiBounds||!board)return;
    const fullscreen=document.fullscreenElement;
    const allowed=!document.body.classList.contains('player-only')&&(!fullscreen||fullscreen===layout||fullscreen===board);
    for(const tile of tiles.values()){
      if(tile.primary||!tile.channel)continue;
      const r=tile.slot.getBoundingClientRect(),top=Math.max(0,r.top),bottom=Math.min(innerHeight,r.bottom);
      api.multiBounds(tile.id,{x:Math.max(0,r.left),y:top,width:Math.max(0,Math.min(innerWidth,r.right)-Math.max(0,r.left)),height:Math.max(0,bottom-top),visible:allowed&&tile.chatVisible&&!window.multiViewDragging&&r.width>0});
    }
  }
  function reflow(){
    if(!board)return;
    const bounds=geometry.rectangles(currentTree(),board.clientWidth,board.clientHeight);
    for(const tile of tiles.values()){
      const b=bounds[tile.id];if(!b)continue;
      Object.assign(tile.element.style,{left:b.x+'px',top:b.y+'px',width:b.width+'px',height:b.height+'px'});
      const visible=tile.primary?!layout.classList.contains('no-chat'):tile.chatVisible;
      tile.element.dataset.chat=String(visible);tile.element.dataset.chatSide=b.width/Math.max(1,b.height)>1.9?'right':'bottom';
      tile.chatButton.textContent=visible?'채팅 ON':'채팅 OFF';tile.chatButton.setAttribute('aria-pressed',String(visible));
    }
    requestAnimationFrame(report);
  }
  function enter(){
    if(board)return;
    document.body.classList.add('multi-view');
    watchAnchor=document.createComment('primary video');chatAnchor=document.createComment('primary chat');watch.before(watchAnchor);chat.before(chatAnchor);
    toolbar=document.createElement('div');toolbar.id='multi-toolbar';
    const hint=document.createElement('span');hint.textContent='영상 또는 제목을 드래그 → 왼쪽·오른쪽·위·아래에 분할 배치';
    toolbar.append(button('자동 배치',()=>{manualTree=null;schedule();}),button('모두 전체 화면',()=>{if(document.fullscreenElement)document.exitFullscreen();else layout.requestFullscreen().catch(()=>{});}),hint);
    const notice=document.createElement('span');notice.id='multi-status';notice.setAttribute('role','status');toolbar.append(notice);
    const originalStatus=document.getElementById('status');statusObserver=new MutationObserver(()=>{notice.textContent=originalStatus.classList.contains('error')?originalStatus.textContent:'';});statusObserver.observe(originalStatus,{childList:true,attributes:true,attributeFilter:['class']});
    board=document.createElement('div');board.id='multi-board';board.setAttribute('aria-label','여러 영상 분할 보기');layout.append(toolbar,board);
    primary=document.createElement('section');primary.className='multi-tile multi-primary selected';primary.dataset.id='primary';selected='primary';
    const head=document.createElement('div');head.className='multi-head';
    const handle=button('메인 영상',()=>{},'드래그하여 영상 배치');handle.className='multi-handle';
    const titleObserver=new MutationObserver(()=>{handle.textContent='메인 · '+document.getElementById('title').textContent;});titleObserver.observe(document.getElementById('title'),{childList:true,subtree:true,characterData:true});
    const primaryChat=button('채팅 ON',()=>{originalToggle();schedule();});
    const settingsButton=button('설정',()=>{settings.classList.toggle('open');settingsButton.setAttribute('aria-expanded',String(settings.classList.contains('open')));});settingsButton.setAttribute('aria-expanded','false');
    head.append(handle,primaryChat,settingsButton);
    const body=document.createElement('div');body.className='multi-body';body.append(watch,chat);primary.append(head,body);board.append(primary);
    settings=document.createElement('div');settings.className='multi-primary-settings';
    for(const child of [...watch.children])if(!child.classList.contains('screen'))settings.append(child);
    watch.append(settings);
    tiles.set('primary',{id:'primary',primary:true,element:primary,chatButton:primaryChat,observer:titleObserver});
    board.addEventListener('pointerdown',beginDrag,{capture:true});board.addEventListener('pointermove',moveDrag);for(const name of ['pointerup','pointercancel','lostpointercapture'])board.addEventListener(name,finishDrag);
    boardObserver=new ResizeObserver(schedule);boardObserver.observe(board);schedule();
  }
  function leave(){
    if(!board)return;
    const record=tiles.get('primary');record?.observer.disconnect();
    statusObserver?.disconnect();
    boardObserver?.disconnect();
    for(const child of [...settings.children])watch.append(child);settings.remove();
    watchAnchor.replaceWith(watch);chatAnchor.replaceWith(chat);board.remove();toolbar.remove();board=null;toolbar=null;settings=null;manualTree=null;tiles.clear();document.body.classList.remove('multi-view');window.multiViewDragging=false;
    requestAnimationFrame(reportChatBounds);
  }
  const originalToggle=document.getElementById('toggle').onclick;
  document.getElementById('toggle').onclick=()=>{originalToggle();if(board){const on=!layout.classList.contains('no-chat');for(const tile of tiles.values())if(!tile.primary)tile.chatVisible=on;schedule();}};
  function closeTile(id){
    const tile=tiles.get(id);if(!tile||tile.primary)return;
    tile.closed=true;tile.hls?.destroy();tile.video.pause();tile.video.removeAttribute('src');tile.video.load();tile.vodChat?.destroy();tile.element.remove();tiles.delete(id);api?.multiChat?.('close',id).catch(()=>{});
    if(selected===id){selected='primary';primary.classList.add('selected');}
    if(manualTree)manualTree=geometry.remove(manualTree,id);
    if(tiles.size===1)leave();else schedule();
  }
  function play(tile,data){
    tile.hls?.destroy();tile.vodChat?.destroy();tile.slot.replaceChildren();tile.data=data;tile.channel=data.kind==='vod'?null:data.channelId;
    tile.note.textContent='영상 연결 중…';tile.note.hidden=false;
    if(window.Hls?.isSupported()){
      const player=tile.hls=new Hls({lowLatencyMode:false,maxBufferLength:20,backBufferLength:15,liveSyncDurationCount:4});
      player.on(Hls.Events.MANIFEST_PARSED,()=>{
        tile.quality.replaceChildren(new Option('자동 화질','-1'),...player.levels.map((level,index)=>new Option(`${level.height||'?'}p${level.frameRate>30?' · '+Math.round(level.frameRate):''}`,String(index))));
        tile.video.play().catch(()=>{tile.note.textContent='재생 버튼을 눌러 주세요.';});
      });
      player.on(Hls.Events.ERROR,(_event,error)=>{if(error.fatal){tile.note.hidden=false;tile.note.textContent='영상 연결이 끊겼습니다. 다시 연결을 눌러 주세요.';}});
      player.loadSource(data.sources[0].url);player.attachMedia(tile.video);
    }else if(tile.video.canPlayType('application/vnd.apple.mpegurl')){tile.video.src=data.sources[0].url;tile.video.play().catch(()=>{});}
    else tile.note.textContent='이 브라우저에서는 영상을 재생할 수 없습니다.';
    tile.speed.hidden=data.kind!=='vod';
    if(data.kind==='vod'){
      tile.vodChat=window.installVodChat(tile.video,tile.slot);tile.vodChat.open(data.videoId,data.chatEnabled);
    }else if(tile.channel){
      if(api?.multiChat)api.multiChat('open',tile.id,tile.channel).then(result=>{if(result?.error&&!tile.closed)tile.slot.textContent=result.error;schedule();}).catch(()=>{if(!tile.closed)tile.slot.textContent='채팅 연결에 실패했습니다.';});
      else tile.slot.append(button('공식 채팅 열기 ↗',()=>window.open(`https://chzzk.naver.com/live/${tile.channel}/chat`,'chat-'+tile.id,'popup,width=420,height=820')));
    }else tile.slot.textContent='이 영상은 연결된 채팅이 없습니다.';
    schedule();
  }
  async function reconnect(tile){
    if(tile.reconnecting||tile.closed)return;tile.reconnecting=true;tile.note.hidden=false;tile.note.textContent='다시 연결 중…';
    try{const response=await fetch('/api/resolve?url='+encodeURIComponent(tile.address)),data=await response.json();if(!response.ok||!data.sources?.length)throw Error(data.error||'연결 실패');if(!tile.closed)play(tile,data);}
    catch(error){if(!tile.closed)tile.note.textContent=error.message;}finally{tile.reconnecting=false;}
  }
  async function add(value=document.getElementById('address').value.trim()){
    if(addButton.disabled)return;
    if(!value){document.getElementById('address').focus();status('추가할 방송 주소를 입력해 주세요.',true);return;}
    if(!resolved?.sources?.length){await openStream(value);return;}
    if(tiles.size>=9){status('한 창에는 최대 9개 영상을 열 수 있습니다.',true);return;}
    addButton.disabled=true;
    try{
      const response=await fetch('/api/resolve?url='+encodeURIComponent(value)),data=await response.json();
      if(!response.ok||!data.sources?.length)throw Error(data.error||'영상을 불러오지 못했습니다.');
      enter();const id='multi-'+(++serial),element=document.createElement('section');element.className='multi-tile';element.dataset.id=id;
      const head=document.createElement('div');head.className='multi-head';
      const handle=button(data.channel||data.title||'추가 영상',()=>{},data.title||'드래그하여 영상 배치');handle.className='multi-handle';
      const media=document.createElement('video');media.controls=true;media.playsInline=true;media.muted=true;media.dataset.multiVideo=id;
      const note=document.createElement('p');note.className='multi-note';note.setAttribute('role','status');
      const screen=document.createElement('div');screen.className='screen';screen.append(media,note);
      const quality=document.createElement('select');quality.setAttribute('aria-label','추가 영상 화질');quality.append(new Option('자동 화질','-1'));
      const speed=document.createElement('select');speed.setAttribute('aria-label','추가 다시보기 재생 속도');for(const n of [.5,.75,1,1.25,1.5,2])speed.add(new Option(n+'배',String(n),n===1,n===1));
      const slot=document.createElement('div');slot.className='multi-chat-slot';
      const side=document.createElement('aside');side.className='multi-chat';const chatHead=document.createElement('div');chatHead.className='chat-head';chatHead.textContent='채팅 · '+(data.channel||data.title||'추가 영상');side.append(chatHead,slot);
      const body=document.createElement('div');body.className='multi-body';body.append(screen,side);
      const tile={id,address:value,element,video:media,quality,speed,slot,note,chatVisible:true,closed:false,channel:null,hls:null};
      const chatButton=tile.chatButton=button('채팅 ON',()=>{tile.chatVisible=!tile.chatVisible;schedule();});
      const muteButton=button('음소거',()=>{media.muted=!media.muted;});media.addEventListener('volumechange',()=>{muteButton.textContent=media.muted?'음소거':'소리 ON';muteButton.setAttribute('aria-pressed',String(!media.muted));});
      head.append(handle,quality,speed,muteButton,chatButton,button('↻',()=>reconnect(tile),'영상 다시 연결'),button('×',()=>closeTile(id),'추가 영상 닫기'));
      quality.onchange=()=>{if(tile.hls)tile.hls.currentLevel=Number(quality.value);};speed.onchange=()=>{media.playbackRate=Number(speed.value);};
      media.addEventListener('playing',()=>{note.hidden=true;});
      element.append(head,body);board.append(element);tiles.set(id,tile);if(manualTree)manualTree={axis:board.clientWidth/board.clientHeight>1.3?'x':'y',a:manualTree,b:id};play(tile,data);
    }catch(error){status(error.message,true);}finally{addButton.disabled=false;}
  }
  addButton.onclick=()=>add();
  function beginDrag(event){
    if(event.button!==0||drag)return;
    const tile=event.target.closest('.multi-tile');if(!tile)return;
    selected=tile.dataset.id;for(const item of tiles.values())item.element.classList.toggle('selected',item.id===selected);
    const handle=event.target.closest('.multi-handle'),media=event.target.closest('video');if(!handle&&!media)return;
    if(media&&event.clientY>media.getBoundingClientRect().bottom-48)return;
    drag={id:tile.dataset.id,pointer:event.pointerId,x:event.clientX,y:event.clientY,active:false,preview:null};board.setPointerCapture(event.pointerId);event.preventDefault();
  }
  function moveDrag(event){
    if(!drag||event.pointerId!==drag.pointer)return;
    if(!drag.active&&Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<8)return;
    if(!drag.active){drag.active=true;window.multiViewDragging=true;document.body.classList.add('multi-dragging');report();}
    event.preventDefault();
    let target=null;
    for(const tile of tiles.values()){const r=tile.element.getBoundingClientRect();if(tile.id!==drag.id&&event.clientX>=r.left&&event.clientX<=r.right&&event.clientY>=r.top&&event.clientY<=r.bottom){target={tile,r};break;}}
    const preview=document.getElementById('multi-snap-preview')||document.createElement('div');preview.id='multi-snap-preview';
    if(!preview.parentElement)board.append(preview);
    if(!target){preview.hidden=true;drag.preview=null;return;}
    const {r,tile}=target,x=(event.clientX-r.left)/r.width,y=(event.clientY-r.top)/r.height;
    const distances={left:x,right:1-x,top:y,bottom:1-y};const edge=Object.keys(distances).sort((a,b)=>distances[a]-distances[b])[0];
    drag.preview=geometry.dock(currentTree(),drag.id,tile.id,edge);
    const b=geometry.rectangles(drag.preview,board.clientWidth,board.clientHeight)[drag.id];
    preview.hidden=false;Object.assign(preview.style,{left:b.x+'px',top:b.y+'px',width:b.width+'px',height:b.height+'px'});preview.textContent={left:'왼쪽에 배치',right:'오른쪽에 배치',top:'위에 배치',bottom:'아래에 배치'}[edge];
  }
  function finishDrag(event){
    if(!drag||event.pointerId!==drag.pointer)return;
    if(event.type==='pointerup'&&drag.preview)manualTree=drag.preview;
    drag=null;window.multiViewDragging=false;document.body.classList.remove('multi-dragging');document.getElementById('multi-snap-preview')?.remove();schedule();
  }
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&drag)finishDrag({pointerId:drag.pointer,type:'pointercancel'});});
  window.addEventListener('resize',schedule);window.addEventListener('scroll',()=>{if(board)report();},{passive:true});document.addEventListener('fullscreenchange',schedule);
  window.addEventListener('beforeunload',()=>{for(const tile of tiles.values())if(!tile.primary){tile.hls?.destroy();tile.video.pause();tile.vodChat?.destroy();}});
  window.multiView={add,close:closeTile,automatic:()=>{manualTree=null;schedule();},get count(){return tiles.size||1;},get activeVideo(){return tiles.get(selected)?.video||video;},fullscreen:mode=>{
    const tile=tiles.get(selected);if(mode==='video'&&tile&&!tile.primary){if(document.fullscreenElement)document.exitFullscreen();else tile.video.parentElement.requestFullscreen().catch(()=>{});}else toggleFullscreen(mode);
  }};
})();
