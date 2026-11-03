(() => {
  const rules=window.HomeRules,api=window.desktopChat;
  const home=document.createElement('section');home.id='home-screen';home.setAttribute('aria-label','방송 목록');
  home.innerHTML=`<div class="home-heading"><div><h1>지금 방송 중</h1><p>보고 싶은 방송을 골라 시청하거나 함께 추가하세요.</p></div><button id="home-back" hidden>시청 화면으로</button></div>
    <div class="home-controls"><input id="home-search" aria-label="불러온 방송 검색" placeholder="불러온 방송에서 제목·스트리머·태그 검색"><label>정렬 <select id="home-sort"><option value="viewers">시청자순</option><option value="viewersAsc">시청자 역순</option><option value="latest">최신순</option><option value="recommended">추천순</option></select></label><button id="home-refresh">새로고침</button></div>
    <details id="home-filters"><summary>목록 필터 · 제외한 스트리머 관리</summary><div class="home-filter-body"><p class="home-filter-note">방송 제목·스트리머 이름·카테고리·태그에 제외 키워드가 포함되면 목록에서 숨깁니다. 특정 스트리머는 이름이나 방송 주소로 제외할 수 있습니다.</p><label for="home-keywords">제외 키워드 (한 줄에 하나)</label><textarea id="home-keywords" rows="3" placeholder="예: 특정 게임명 또는 태그"></textarea><form id="home-block-form"><input id="home-block-input" aria-label="제외할 스트리머 이름 또는 주소" placeholder="제외할 스트리머 이름·채널 ID·방송 주소"><button type="submit">목록에서 제외</button></form><div id="home-blocked" aria-label="제외한 스트리머"></div><p id="home-save-status" role="status"></p></div></details>
    <p id="home-status" role="status" aria-live="polite"></p><div id="home-grid"></div><div id="home-load-marker" aria-hidden="true"></div>`;
  document.getElementById('layout').before(home);
  const el=id=>document.getElementById(id);
  let settings=rules.normalize(null),rows=[],next=null,busy=false,revision=0,controller,playing=[],ready=false,saveTimer,saveRevision=0;
  let autoFailed=false,autoFrame=0,autoTarget=null;
  const autoObserver=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.target===autoTarget&&entry.isIntersecting)&&!busy&&next&&!autoFailed&&document.body.classList.contains('home-mode'))load();});
  function observeNextRow(){
    autoObserver.disconnect();autoTarget=null;
    if(!next||busy||autoFailed||!document.body.classList.contains('home-mode'))return;
    const cards=[...el('home-grid').children];let target=el('home-load-marker');
    if(cards.length){const lastTop=cards.at(-1).offsetTop;let previousTop=lastTop;for(let i=cards.length-2;i>=0;i--)if(cards[i].offsetTop<lastTop-1){previousTop=cards[i].offsetTop;break;}target=cards.find(card=>Math.abs(card.offsetTop-previousTop)<2)||cards[0];}
    autoTarget=target;autoObserver.observe(target);
  }
  function scheduleObserve(){if(!autoFrame)autoFrame=requestAnimationFrame(()=>{autoFrame=0;observeNextRow();});}
  new ResizeObserver(scheduleObserve).observe(el('home-grid'));
  window.addEventListener('resize',scheduleObserve);
  function show(user=false){
    if(user){startupAddressEdited=true;if(!resolved)generation++;}
    if(!document.body.classList.contains('home-mode')){playing=[...document.querySelectorAll('video')].filter(v=>!v.paused);for(const media of playing)media.pause();}
    document.body.classList.add('home-mode');el('home-back').hidden=!resolved?.sources?.length;
    requestAnimationFrame(()=>{reportChatBounds();window.dispatchEvent(new Event('resize'));});
    if(ready&&!rows.length&&!busy)load(true);
    scheduleObserve();
  }
  function hide(resume=true){
    document.body.classList.remove('home-mode');if(resume)for(const media of playing)if(media.isConnected)media.play().catch(()=>{});playing=[];
    autoObserver.disconnect();
    requestAnimationFrame(()=>{window.dispatchEvent(new Event('resize'));reportChatBounds();});
  }
  document.querySelector('.brand').addEventListener('click',event=>{if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();show(true);});
  el('home-back').onclick=()=>hide();
  window.addEventListener('viewer-stream-opened',()=>hide());
  function save(){
    settings=rules.normalize(settings);const value=JSON.stringify(settings),run=++saveRevision;
    clearTimeout(saveTimer);saveTimer=setTimeout(async()=>{
      try{if(api?.homeSettings)await api.homeSettings(JSON.parse(value));else localStorage.setItem('home-settings',value);if(run===saveRevision)el('home-save-status').textContent='필터 설정을 저장했습니다.';}
      catch{if(run===saveRevision)el('home-save-status').textContent='설정을 저장하지 못했습니다. 다시 변경해 주세요.';}
    },250);
  }
  function renderBlocked(){
    const container=el('home-blocked');container.replaceChildren();
    for(const [kind,values] of [['blocked',settings.blocked],['names',settings.names]])for(const value of values){
      const item=document.createElement('span');item.className='home-blocked-item';item.append(document.createTextNode(typeof value==='string'?value:value.name));
      const restore=document.createElement('button');restore.type='button';restore.textContent='해제';restore.setAttribute('aria-label',(typeof value==='string'?value:value.name)+' 제외 해제');restore.onclick=()=>{settings[kind]=settings[kind].filter(x=>kind==='names'?x!==value:x.id!==value.id);save();renderBlocked();render();};item.append(restore);container.append(item);
    }
    if(!container.children.length)container.textContent='제외한 스트리머가 없습니다.';
  }
  function exclude(item){if(!settings.blocked.some(x=>x.id===item.id))settings.blocked.push({id:item.id,name:item.name});save();renderBlocked();render();el('home-save-status').textContent=item.name+' 목록 제외 · 설정에서 해제할 수 있습니다.';}
  async function open(item,add=false){
    const address='https://chzzk.naver.com/live/'+item.id;
    if(add){hide();await window.multiView.add(address);return;}
    await openStream(address);
    if(document.body.classList.contains('home-mode')&&el('status').classList.contains('error'))el('home-status').textContent=el('status').textContent;
  }
  function render(){
    const grid=el('home-grid'),shown=rules.visible(rows,settings,el('home-search').value),existing=new Map([...grid.children].map(card=>[card.dataset.channel,card])),keep=new Set(shown.map(item=>item.id));
    for(const card of [...grid.children])if(!keep.has(card.dataset.channel))card.remove();
    let index=0;
    function place(card){if(grid.children[index]!==card)grid.insertBefore(card,grid.children[index]||null);index++;}
    for(const item of shown){
      if(existing.has(item.id)){place(existing.get(item.id));continue;}
      const card=document.createElement('article');card.className='home-card';card.dataset.channel=item.id;
      const thumbnail=document.createElement('button');thumbnail.type='button';thumbnail.className='home-thumbnail';thumbnail.setAttribute('aria-label',item.name+' 방송 시청');thumbnail.onclick=()=>open(item);
      const placeholder=document.createElement('span');placeholder.className='home-placeholder';placeholder.textContent=item.restricted||'방송 미리보기';thumbnail.append(placeholder);
      if(item.image){const image=document.createElement('img');image.src=item.image;image.loading='lazy';image.alt=item.title;image.referrerPolicy='no-referrer';image.onerror=()=>image.remove();thumbnail.append(image);}
      const badge=document.createElement('span');badge.className='home-live-badge';badge.textContent='LIVE · '+new Intl.NumberFormat('ko-KR').format(item.viewers)+'명';thumbnail.append(badge);
      const info=document.createElement('div');info.className='home-card-info';
      if(item.avatar){const avatar=document.createElement('img');avatar.className='home-avatar';avatar.src=item.avatar;avatar.alt='';avatar.loading='lazy';avatar.referrerPolicy='no-referrer';avatar.onerror=()=>avatar.remove();info.append(avatar);}
      const text=document.createElement('div'),title=document.createElement('button');title.type='button';title.className='home-card-title';title.textContent=item.title;title.title=item.title;title.onclick=()=>open(item);
      const name=document.createElement('p');name.className='home-card-name';name.textContent=item.name;
      if(item.opened){const opened=document.createElement('span');opened.className='home-card-opened';opened.textContent=item.opened.slice(5,16)+' 시작';opened.title='방송 시작 (한국 시각) · '+item.opened;name.append(opened);}
      const tags=document.createElement('div');tags.className='home-tags';for(const tag of [item.category,...item.tags].filter(Boolean).slice(0,5)){const chip=document.createElement('span');chip.textContent=tag;tags.append(chip);}
      text.append(title,name,tags);info.append(text);
      const actions=document.createElement('div');actions.className='home-card-actions';
      const add=document.createElement('button');add.type='button';add.textContent='함께 보기 +';add.onclick=()=>open(item,true);
      const block=document.createElement('button');block.type='button';block.textContent='숨기기';block.setAttribute('aria-label',item.name+' 목록에서 제외');block.onclick=()=>exclude(item);actions.append(add,block);
      card.append(thumbnail,info,actions);place(card);
    }
    el('home-status').textContent=busy?'방송 목록을 불러오는 중…':shown.length?`${shown.length}개 표시 · ${rows.length-shown.length}개 필터 제외${settings.sort==='recommended'?' · 치지직 공개 추천 목록 (개인화 추천과 다를 수 있습니다)':''}`:'조건에 맞는 방송이 없습니다. 제외 설정이나 검색어를 바꿔 보세요.';
    scheduleObserve();
  }
  async function load(reset=false){
    if(busy&&!reset)return;
    if(reset){revision++;controller?.abort();rows=[];next=null;autoFailed=false;}
    const requestedNext=next;
    const run=revision;controller=new AbortController();busy=true;render();
    try{
      const response=await fetch('/api/lives?sort='+encodeURIComponent(settings.sort)+(next?'&next='+encodeURIComponent(next):''),{signal:controller.signal}),data=await response.json();
      if(run!==revision)return;if(!response.ok||!Array.isArray(data.items))throw Error(data.error||'방송 목록을 불러오지 못했습니다.');
      rows=[...new Map([...rows,...data.items].map(item=>[item.id,item])).values()];next=data.next===requestedNext?null:data.next;
    }catch(error){if(run===revision&&error.name!=='AbortError'){busy=false;autoFailed=true;render();el('home-status').textContent=error.message+' · 새로고침으로 다시 시도하세요.';return;}}
    finally{if(run===revision)busy=false;}
    if(run===revision)render();
  }
  el('home-sort').onchange=()=>{settings.sort=el('home-sort').value;save();load(true);};
  el('home-search').oninput=render;el('home-refresh').onclick=()=>load(true);
  el('home-keywords').oninput=()=>{settings.keywords=el('home-keywords').value.split(/\r?\n/);save();render();};
  el('home-block-form').onsubmit=event=>{
    event.preventDefault();const value=el('home-block-input').value.trim();if(!value)return;
    const id=rules.channelId(value);if(id){if(!settings.blocked.some(item=>item.id===id))settings.blocked.push({id,name:rows.find(item=>item.id===id)?.name||id});}
    else if(!settings.names.includes(value))settings.names.push(value);
    el('home-block-input').value='';save();renderBlocked();render();
  };
  (async()=>{
    try{const value=api?.homeSettings?await api.homeSettings():JSON.parse(localStorage.getItem('home-settings'));settings=rules.normalize(value);}catch{}
    el('home-sort').value=settings.sort;el('home-keywords').value=settings.keywords.join('\n');renderBlocked();ready=true;
    if(resolved?.sources?.length)hide(false);else show();if(!busy)load(true);
  })();
  window.viewerHome={show:()=>show(true),hide,refresh:()=>load(true)};
  window.addEventListener('beforeunload',()=>{if(!ready)return;clearTimeout(saveTimer);if(api?.homeSettings)api.homeSettings(settings).catch(()=>{});else try{localStorage.setItem('home-settings',JSON.stringify(settings));}catch{}});
})();
