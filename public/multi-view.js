(() => {
  const layout=document.getElementById('layout'),watch=document.querySelector('.watch'),chat=document.getElementById('chat');
  const api=window.desktopChat,geometry=window.MultiLayout,tiles=new Map();
  let board,toolbar,primary,settings,watchAnchor,chatAnchor,statusObserver,boardObserver,manualTree=null,serial=0,drag=null,resizeDrag=null,frame=0,selected='primary';
  const splitHandles=new Map();let closingPrimary=false;
  const addButton=document.createElement('button');addButton.type='button';addButton.id='add-stream';addButton.textContent='영상 추가 +';addButton.title='주소란의 영상을 현재 영상 옆에 추가합니다';document.getElementById('open').after(addButton);
  function button(text,action,title=text){const node=document.createElement('button');node.type='button';node.textContent=text;node.title=title;node.onclick=action;return node;}
  function ids(){return [...tiles.keys()];}
  function currentTree(){return manualTree||geometry.automatic(ids(),board.clientWidth,board.clientHeight);}
  function separator(label){const node=document.createElement('div');node.className='multi-divider';node.tabIndex=0;node.setAttribute('role','separator');node.setAttribute('aria-label',label);node.title='드래그로 크기 조절 · 방향키로 미세 조정 · 더블 클릭으로 초기화';return node;}
  function chatDivider(id){const node=separator('영상과 채팅 크기 조절');node.classList.add('multi-chat-divider');node.dataset.chatResize=id;node.addEventListener('keydown',resizeKey);node.addEventListener('dblclick',()=>{const tile=tiles.get(id);if(tile){tile.chatFraction=.3;schedule();}});return node;}
  function resizeKey(event){
    const axis=event.currentTarget.dataset.axis,keys=axis==='x'?['ArrowLeft','ArrowRight']:['ArrowUp','ArrowDown'];
    if(![...keys,'Home'].includes(event.key))return;event.preventDefault();event.stopPropagation();
    const change=event.key===keys[0]?-.02:.02,id=event.currentTarget.dataset.chatResize;
    if(id){const tile=tiles.get(id);tile.chatFraction=event.key==='Home'?.3:Math.max(.12,Math.min(.75,(tile.chatFraction??.3)-change));}
    else{const path=event.currentTarget.dataset.splitPath,split=geometry.dividers(currentTree(),board.clientWidth,board.clientHeight).find(item=>item.path===path);if(split)manualTree=geometry.resize(currentTree(),path,event.key==='Home'?.5:split.ratio+change);}
    schedule();
  }
  function beginResize(event,handle){
    const id=handle.dataset.chatResize,axis=handle.dataset.axis;
    if(id){const tile=tiles.get(id);resizeDrag={kind:'chat',id,axis,side:tile.element.dataset.chatSide,rect:tile.element.querySelector('.multi-body').getBoundingClientRect(),original:tile.chatFraction??.3,pointer:event.pointerId};}
    else{const path=handle.dataset.splitPath,split=geometry.dividers(currentTree(),board.clientWidth,board.clientHeight).find(item=>item.path===path);if(!split)return;const tree=currentTree();manualTree=tree;resizeDrag={kind:'split',path,axis,area:split.area,original:tree,pointer:event.pointerId};}
    board.setPointerCapture(event.pointerId);window.multiViewDragging=true;document.body.classList.add('multi-resizing-'+axis);report();event.preventDefault();
  }
  function moveResize(event){
    const resize=resizeDrag;if(!resize||event.pointerId!==resize.pointer)return;
    if(resize.kind==='chat'){
      const rect=resize.rect,length=(resize.axis==='x'?rect.width:rect.height)-8,offset=resize.axis==='x'?event.clientX-rect.left:event.clientY-rect.top;
      tiles.get(resize.id).chatFraction=Math.max(.12,Math.min(.75,1-offset/Math.max(1,length)));
    }else{const rect=board.getBoundingClientRect(),area=resize.area,offset=resize.axis==='x'?event.clientX-rect.left-area.x:event.clientY-rect.top-area.y,length=(resize.axis==='x'?area.width:area.height)-8;manualTree=geometry.resize(manualTree,resize.path,offset/Math.max(1,length));}
    event.preventDefault();schedule();
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;reflow();});}
  function report(){
    reportChatBounds();
    if(!api?.multiBounds||!board)return;
    const fullscreen=document.fullscreenElement;
    const allowed=!document.body.classList.contains('player-only')&&(!fullscreen||fullscreen===layout||fullscreen===board);
    for(const tile of tiles.values()){
      if(tile.primary||!tile.channel)continue;
      const r=tile.slot.getBoundingClientRect(),top=Math.max(0,r.top),bottom=Math.min(innerHeight,r.bottom);
      api.multiBounds(tile.id,{x:Math.max(0,r.left),y:top,width:Math.max(0,Math.min(innerWidth,r.right)-Math.max(0,r.left)),height:Math.max(0,bottom-top),visible:allowed&&tile.chatVisible&&!tile.detached&&!window.multiViewDragging&&r.width>0});
    }
  }
  function reflow(){
    if(!board)return;
    const bounds=geometry.rectangles(currentTree(),board.clientWidth,board.clientHeight);
    for(const tile of tiles.values()){
      const b=bounds[tile.id];if(!b)continue;
      Object.assign(tile.element.style,{left:b.x+'px',top:b.y+'px',width:b.width+'px',height:b.height+'px'});
      if(tile.directory)continue;
      const detached=tile.primary?primaryChatDetached:tile.detached;
      const visible=!detached&&(tile.primary?!layout.classList.contains('no-chat'):tile.chatVisible);
      const side=resizeDrag?.kind==='chat'&&resizeDrag.id===tile.id?resizeDrag.side:b.width/Math.max(1,b.height)>1.9?'right':'bottom';
      tile.element.dataset.chat=String(visible);tile.element.dataset.chatSide=side;
      tile.chatButton.textContent=detached?'채팅 되돌리기':visible?'채팅 ON':'채팅 OFF';tile.chatButton.setAttribute('aria-pressed',String(visible));
      if(tile.popoutButton){tile.popoutButton.textContent=detached?'채팅 되돌리기':'별도 창 ↗';tile.popoutButton.disabled=tile.primary?!activeChannel||vodMode:!tile.channel;}
      const fraction=tile.chatFraction??.3,body=tile.element.querySelector('.multi-body');
      body.style.gridTemplateColumns=visible&&side==='right'?`minmax(0,${1-fraction}fr) 8px minmax(0,${fraction}fr)`:'minmax(0,1fr)';
      body.style.gridTemplateRows=visible&&side==='bottom'?`minmax(0,${1-fraction}fr) 8px minmax(0,${fraction}fr)`:'minmax(0,1fr)';
      tile.divider.hidden=!visible;tile.divider.dataset.axis=side==='right'?'x':'y';tile.divider.setAttribute('aria-orientation',side==='right'?'vertical':'horizontal');tile.divider.setAttribute('aria-valuenow',String(Math.round((1-fraction)*100)));
    }
    const splits=geometry.dividers(currentTree(),board.clientWidth,board.clientHeight),used=new Set();
    for(const split of splits){
      used.add(split.path);let handle=splitHandles.get(split.path);
      if(!handle){handle=separator('영상 사이 크기 조절');handle.classList.add('multi-splitter');handle.dataset.splitPath=split.path;handle.addEventListener('keydown',resizeKey);handle.addEventListener('dblclick',()=>{manualTree=geometry.resize(currentTree(),split.path,.5);schedule();});board.append(handle);splitHandles.set(split.path,handle);}
      handle.dataset.axis=split.axis;handle.setAttribute('aria-orientation',split.axis==='x'?'vertical':'horizontal');handle.setAttribute('aria-valuenow',String(Math.round(split.ratio*100)));
      Object.assign(handle.style,{left:split.x+'px',top:split.y+'px',width:split.width+'px',height:split.height+'px'});
    }
    for(const [path,handle] of splitHandles)if(!used.has(path)){handle.remove();splitHandles.delete(path);}
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
    const handle=button('',()=>{},'드래그하여 영상 배치');handle.className='multi-handle';
    const titleText=document.createElement('span');titleText.className='multi-handle-title';const stats=document.createElement('span');stats.className='live-info';handle.append(titleText,stats);
    const updateTitle=()=>{titleText.textContent='메인 · '+document.getElementById('title').textContent;};updateTitle();
    const titleObserver=new MutationObserver(updateTitle);titleObserver.observe(document.getElementById('title'),{childList:true,subtree:true,characterData:true});
    const primaryChat=button('채팅 ON',()=>{originalToggle();schedule();});
    const settingsButton=button('설정',()=>{settings.classList.toggle('open');settingsButton.setAttribute('aria-expanded',String(settings.classList.contains('open')));});settingsButton.setAttribute('aria-expanded','false');
    const primaryPopout=button('별도 창 ↗',()=>document.getElementById('popout').click());
    const quality=document.createElement('select');quality.setAttribute('aria-label','메인 영상 화질');quality.id='multi-primary-quality';
    const sourceQuality=document.getElementById('quality');
    const syncQuality=()=>{quality.replaceChildren(...[...sourceQuality.options].map(option=>new Option(option.textContent,option.value,false,option.selected)));quality.disabled=sourceQuality.disabled;};syncQuality();
    const qualityObserver=new MutationObserver(syncQuality);qualityObserver.observe(sourceQuality,{childList:true,subtree:true,attributes:true});sourceQuality.addEventListener('change',syncQuality);
    quality.onchange=()=>{sourceQuality.value=quality.value;sourceQuality.dispatchEvent(new Event('change',{bubbles:true}));};
    head.append(handle,quality,primaryChat,primaryPopout,settingsButton,button('×',()=>closeTile('primary'),'메인 영상 닫기'));
    const body=document.createElement('div');body.className='multi-body';const primaryDivider=chatDivider('primary');body.append(watch,primaryDivider,chat);primary.append(head,body);board.append(primary);
    settings=document.createElement('div');settings.className='multi-primary-settings';
    for(const child of [...watch.children])if(!child.classList.contains('screen'))settings.append(child);
    watch.append(settings);
    tiles.set('primary',{id:'primary',primary:true,element:primary,stats,chatButton:primaryChat,popoutButton:primaryPopout,divider:primaryDivider,observer:titleObserver,qualityObserver,syncQuality});updatePrimaryInfo();
    board.addEventListener('pointerdown',beginDrag,{capture:true});board.addEventListener('pointermove',moveDrag);for(const name of ['pointerup','pointercancel','lostpointercapture'])board.addEventListener(name,finishDrag);
    boardObserver=new ResizeObserver(schedule);boardObserver.observe(board);schedule();
  }
  function leave(){
    if(!board)return;
    const record=tiles.get('primary');record?.observer.disconnect();
    record?.stopInfo?.();
    record?.qualityObserver.disconnect();document.getElementById('quality').removeEventListener('change',record.syncQuality);splitHandles.clear();
    statusObserver?.disconnect();
    boardObserver?.disconnect();
    for(const child of [...settings.children])watch.append(child);settings.remove();
    watchAnchor.replaceWith(watch);chatAnchor.replaceWith(chat);board.remove();toolbar.remove();board=null;toolbar=null;settings=null;manualTree=null;tiles.clear();document.body.classList.remove('multi-view');window.multiViewDragging=false;
    requestAnimationFrame(reportChatBounds);
  }
  const originalToggle=document.getElementById('toggle').onclick;
  document.getElementById('toggle').onclick=()=>{if(primaryChatDetached){originalToggle();return;}originalToggle();if(board){const on=!layout.classList.contains('no-chat');for(const tile of tiles.values())if(!tile.primary&&!tile.directory)tile.chatVisible=on;schedule();}};
  function updatePrimaryInfo(){const tile=tiles.get('primary');if(!tile)return;tile.stopInfo?.();tile.stopInfo=window.LiveInfo.watch(tile.stats,resolved?.kind==='vod'?null:resolved?.channelId,resolved?.liveInfo);}
  window.addEventListener('viewer-stream-opened',updatePrimaryInfo);
  function browse(home){
    if(tiles.has('directory'))return;
    enter();const previous=currentTree(),anchor=document.createComment('broadcast directory');home.before(anchor);
    const element=document.createElement('section');element.className='multi-tile multi-directory';element.dataset.id='directory';
    const head=document.createElement('div');head.className='multi-head';const handle=button('방송 목록',()=>{},'드래그하여 목록 배치');handle.className='multi-handle';head.append(handle,button('×',closeDirectory,'방송 목록 닫기'));
    const body=document.createElement('div');body.className='multi-directory-body';body.append(home);element.append(head,body);board.append(element);
    tiles.set('directory',{id:'directory',directory:true,element,anchor,home});manualTree={axis:'x',a:previous,b:'directory'};
    document.body.classList.add('directory-docked');schedule();
  }
  function closeDirectory(){
    const tile=tiles.get('directory');if(!tile)return;
    tile.anchor.replaceWith(tile.home);tile.element.remove();tiles.delete('directory');manualTree=geometry.remove(manualTree,'directory');document.body.classList.remove('directory-docked');
    if(selected==='directory')selected='primary';
    window.dispatchEvent(new Event('directory-dock-closed'));
    if(tiles.size===1)leave();else schedule();
  }
  window.addEventListener('primary-chat-detached',schedule);
  api?.onChatPopout?.(state=>{if(state.id==='primary'||state.disposed)return;const tile=tiles.get(state.id);if(tile){tile.detached=state.detached;if(!state.detached)tile.chatVisible=true;schedule();}});
  async function popout(tile){
    if(api?.multiChat){const result=await api.multiChat(tile.detached?'attach':'detach',tile.id);if(result?.error){tile.note.hidden=false;tile.note.textContent=result.error;}}
    else if(tile.browserPopup&&!tile.browserPopup.closed){tile.browserPopup.close();}
    else if(tile.channel){const popup=window.open(`https://chzzk.naver.com/live/${tile.channel}/chat`,'chat-'+tile.id,'popup,width=420,height=820');if(popup){tile.browserPopup=popup;tile.detached=true;schedule();tile.popupTimer=setInterval(()=>{if(popup.closed){clearInterval(tile.popupTimer);tile.detached=false;schedule();}},1000);}}
  }
  function closeTile(id){
    if(id==='directory'){closeDirectory();return;}
    if(id==='primary'){closePrimary();return;}
    const tile=tiles.get(id);if(!tile||closingPrimary)return;
    tile.closed=true;tile.hls?.destroy();tile.video.pause();tile.video.removeAttribute('src');tile.video.load();tile.vodChat?.destroy();tile.element.remove();tiles.delete(id);api?.multiChat?.('close',id).catch(()=>{});
    tile.stopInfo?.();
    clearInterval(tile.popupTimer);if(tile.browserPopup&&!tile.browserPopup.closed)tile.browserPopup.close();
    if(selected===id){selected='primary';primary.classList.add('selected');}
    if(manualTree)manualTree=geometry.remove(manualTree,id);
    if(tiles.size===1)leave();else schedule();
  }
  async function closePrimary(){
    if(closingPrimary||!board)return;
    if(window.captureController?.state.active){status('녹화 또는 리플레이 버퍼를 종료한 뒤 영상을 닫아 주세요.',true);return;}
    closingPrimary=true;
    try{
      const next=[...tiles.values()].find(tile=>!tile.primary&&!tile.directory);
      if(!next){closeDirectory();await closePrimaryStream();window.viewerHome.show();return;}
      const tree=geometry.replace(geometry.remove(currentTree(),'primary'),next.id,'primary');
      const playback={paused:next.video.paused,muted:next.video.muted,volume:next.video.volume,rate:next.video.playbackRate};
      const position=next.video.currentTime,keepDirectory=tiles.has('directory'),fraction=next.chatFraction??.3,chatVisible=next.chatVisible;
      await clearPrimaryChat();
      const opened=await openStream(next.address,false,{position},{data:next.data,playback,keepDirectory});
      if(!opened)return;
      document.getElementById('address').value=next.address;
      layout.classList.toggle('no-chat',!chatVisible);document.getElementById('toggle').textContent=chatVisible?'채팅 ON':'채팅 OFF';document.getElementById('toggle').setAttribute('aria-pressed',String(chatVisible));
      tiles.get('primary').chatFraction=fraction;
      closingPrimary=false;closeTile(next.id);
      if(board){manualTree=tree;selected='primary';for(const tile of tiles.values())tile.element.classList.toggle('selected',tile.primary);schedule();}
    }catch(error){status(error.message,true);}finally{closingPrimary=false;}
  }
  function play(tile,data){
    tile.hls?.destroy();tile.vodChat?.destroy();tile.slot.replaceChildren();tile.data=data;tile.channel=data.kind==='vod'?null:data.channelId;
    tile.note.textContent='영상 연결 중…';tile.note.hidden=false;
    tile.stopInfo?.();tile.stopInfo=window.LiveInfo.watch(tile.stats,tile.channel,data.liveInfo);
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
    if([...tiles.values()].filter(tile=>!tile.directory).length>=9){status('한 창에는 최대 9개 영상을 열 수 있습니다.',true);return;}
    addButton.disabled=true;
    try{
      const response=await fetch('/api/resolve?url='+encodeURIComponent(value)),data=await response.json();
      if(!response.ok||!data.sources?.length)throw Error(data.error||'영상을 불러오지 못했습니다.');
      enter();const id='multi-'+(++serial),element=document.createElement('section');element.className='multi-tile';element.dataset.id=id;
      const head=document.createElement('div');head.className='multi-head';
      const handle=button('',()=>{},data.title||'드래그하여 영상 배치');handle.className='multi-handle';
      const titleText=document.createElement('span');titleText.className='multi-handle-title';titleText.textContent=[data.channel,data.title].filter(Boolean).join(' · ')||'추가 영상';
      const stats=document.createElement('span');stats.className='live-info';handle.append(titleText,stats);
      const media=document.createElement('video');media.controls=true;media.playsInline=true;media.muted=true;media.dataset.multiVideo=id;
      const note=document.createElement('p');note.className='multi-note';note.setAttribute('role','status');
      const screen=document.createElement('div');screen.className='screen';screen.append(media,note);
      const quality=document.createElement('select');quality.setAttribute('aria-label','추가 영상 화질');quality.append(new Option('자동 화질','-1'));
      const speed=document.createElement('select');speed.setAttribute('aria-label','추가 다시보기 재생 속도');for(const n of [.5,.75,1,1.25,1.5,2])speed.add(new Option(n+'배',String(n),n===1,n===1));
      const slot=document.createElement('div');slot.className='multi-chat-slot';
      const side=document.createElement('aside');side.className='multi-chat';const chatHead=document.createElement('div');chatHead.className='chat-head';chatHead.textContent='채팅 · '+(data.channel||data.title||'추가 영상');side.append(chatHead,slot);
      const body=document.createElement('div');body.className='multi-body';const divider=chatDivider(id);body.append(screen,divider,side);
      const tile={id,address:value,element,video:media,quality,speed,slot,note,divider,stats,chatVisible:true,closed:false,channel:null,hls:null,detached:false};
      const chatButton=tile.chatButton=button('채팅 ON',()=>{if(tile.detached){popout(tile);return;}tile.chatVisible=!tile.chatVisible;schedule();});
      tile.popoutButton=button('별도 창 ↗',()=>popout(tile));
      const muteButton=button('음소거',()=>{media.muted=!media.muted;});media.addEventListener('volumechange',()=>{muteButton.textContent=media.muted?'음소거':'소리 ON';muteButton.setAttribute('aria-pressed',String(!media.muted));});
      head.append(handle,quality,speed,muteButton,chatButton,tile.popoutButton,button('↻',()=>reconnect(tile),'영상 다시 연결'),button('×',()=>closeTile(id),'추가 영상 닫기'));
      quality.onchange=()=>{if(tile.hls)tile.hls.currentLevel=Number(quality.value);};speed.onchange=()=>{media.playbackRate=Number(speed.value);};
      media.addEventListener('playing',()=>{note.hidden=true;});
      element.append(head,body);board.append(element);
      const replacement=tiles.has('directory')?geometry.replace(currentTree(),'directory',id):null;
      tiles.set(id,tile);if(replacement){manualTree=replacement;closeDirectory();}else if(manualTree)manualTree={axis:board.clientWidth/board.clientHeight>1.3?'x':'y',a:manualTree,b:id};play(tile,data);
    }catch(error){status(error.message,true);}finally{addButton.disabled=false;}
  }
  addButton.onclick=()=>add();
  function beginDrag(event){
    if(event.button!==0||drag||resizeDrag)return;
    const divider=event.target.closest('.multi-divider');if(divider){beginResize(event,divider);return;}
    const tile=event.target.closest('.multi-tile');if(!tile)return;
    selected=tile.dataset.id;for(const item of tiles.values())item.element.classList.toggle('selected',item.id===selected);
    const handle=event.target.closest('.multi-handle'),media=event.target.closest('video');if(!handle&&!media)return;
    if(media&&event.clientY>media.getBoundingClientRect().bottom-48)return;
    drag={id:tile.dataset.id,pointer:event.pointerId,x:event.clientX,y:event.clientY,active:false,preview:null};board.setPointerCapture(event.pointerId);event.preventDefault();
  }
  function moveDrag(event){
    if(resizeDrag){moveResize(event);return;}
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
    preview.hidden=false;
    const future=geometry.rectangles(drag.preview,board.clientWidth,board.clientHeight);
    for(const item of tiles.values()){
      let ghost=preview.querySelector(`[data-preview-id="${item.id}"]`);
      if(!ghost){
        ghost=document.createElement('div');ghost.className='multi-preview-tile';ghost.dataset.previewId=item.id;ghost.dataset.source=String(item.id===drag.id);
        const title=document.createElement('div');title.className='multi-preview-title';title.textContent=item.element.querySelector('.multi-handle').textContent;
        const content=document.createElement('div');content.className='multi-preview-body';
        const canvas=document.createElement('canvas');canvas.width=480;canvas.height=270;
        try{if(item.directory){const context=canvas.getContext('2d');context.fillStyle='#10231f';context.fillRect(0,0,480,270);context.fillStyle='#a9d5bd';context.font='24px sans-serif';context.fillText('방송 목록',160,140);}else canvas.getContext('2d').drawImage(item.video||video,0,0,480,270);}catch{}
        const placeholder=document.createElement('div');placeholder.className='multi-preview-chat';placeholder.textContent='채팅';content.append(canvas,placeholder);ghost.append(title,content);preview.append(ghost);
      }
      const b=future[item.id],hasChat=item.primary?!primaryChatDetached&&!layout.classList.contains('no-chat'):item.chatVisible&&!item.detached;
      Object.assign(ghost.style,{left:b.x+'px',top:b.y+'px',width:b.width+'px',height:b.height+'px'});
      ghost.querySelector('.multi-preview-chat').hidden=!hasChat;
      const fraction=item.chatFraction??.3,content=ghost.querySelector('.multi-preview-body'),right=b.width/Math.max(1,b.height)>1.9;
      content.style.gridTemplateColumns=hasChat&&right?`${1-fraction}fr ${fraction}fr`:'minmax(0,1fr)';content.style.gridTemplateRows=hasChat&&!right?`${1-fraction}fr ${fraction}fr`:'minmax(0,1fr)';
    }
    preview.setAttribute('aria-label','놓으면 표시된 모든 영상의 배치가 적용됩니다. Escape로 취소');
  }
  function finishDrag(event){
    if(resizeDrag&&event.pointerId===resizeDrag.pointer){
      if(event.type!=='pointerup'){if(resizeDrag.kind==='chat')tiles.get(resizeDrag.id).chatFraction=resizeDrag.original;else manualTree=resizeDrag.original;}
      resizeDrag=null;window.multiViewDragging=false;document.body.classList.remove('multi-resizing-x','multi-resizing-y');schedule();return;
    }
    if(!drag||event.pointerId!==drag.pointer)return;
    if(event.type==='pointerup'&&drag.preview)manualTree=drag.preview;
    drag=null;window.multiViewDragging=false;document.body.classList.remove('multi-dragging');document.getElementById('multi-snap-preview')?.remove();schedule();
  }
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&(drag||resizeDrag))finishDrag({pointerId:(drag||resizeDrag).pointer,type:'pointercancel'});});
  window.addEventListener('resize',schedule);window.addEventListener('scroll',()=>{if(board)report();},{passive:true});document.addEventListener('fullscreenchange',schedule);
  window.addEventListener('beforeunload',()=>{for(const tile of tiles.values())if(!tile.primary&&!tile.directory){tile.hls?.destroy();tile.video.pause();tile.vodChat?.destroy();}});
  window.multiView={dispose:()=>{closeDirectory();for(const tile of [...tiles.values()])if(!tile.primary)closeTile(tile.id);},snapshot:media=>{const tile=[...tiles.values()].find(item=>item.video===media&&!item.primary);if(!tile)return null;return {address:tile.address,data:tile.data,source:tile.data.sources[0].url,position:tile.data.kind==='vod'?media.currentTime:0,paused:media.paused,muted:media.muted,volume:media.volume,rate:media.playbackRate,height:media.videoHeight};},add,browse,closeDirectory,close:closeTile,automatic:()=>{manualTree=null;schedule();},get count(){return tiles.size||1;},get activeVideo(){return tiles.get(selected)?.video||video;},fullscreen:mode=>{
    const tile=tiles.get(selected);if(mode==='video'&&tile?.video&&!tile.primary){if(document.fullscreenElement)document.exitFullscreen();else tile.video.parentElement.requestFullscreen().catch(()=>{});}else toggleFullscreen(mode);
  }};
})();
