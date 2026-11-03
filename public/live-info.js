(function(root){
  function format(info,now=Date.now()){
    if(!info)return '';
    if(info.status==='CLOSE')return '방송 종료';
    const parts=[Number.isFinite(info.viewers)?`시청자 ${new Intl.NumberFormat('ko-KR').format(info.viewers)}명`:'시청자 수 확인 중'];
    if(Number.isFinite(info.openedAt)){
      const seconds=Math.max(0,Math.floor((now-info.openedAt)/1000));
      parts.push(`방송 ${String(Math.floor(seconds/3600)).padStart(2,'0')}:${String(Math.floor(seconds/60)%60).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`);
    }
    return parts.join(' · ');
  }
  if(typeof module!=='undefined'&&module.exports){module.exports={format};return;}
  const channels=new Map();
  function paint(record){for(const element of record.elements){element.textContent=format(record.info);element.title='현재 시청자 수 · 방송 시작 후 경과 시간 (시청자 수 약 30초마다 갱신)';}}
  async function refresh(id){
    const record=channels.get(id);if(!record||record.busy)return;
    record.busy=true;record.fetched=Date.now();const controller=record.controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
    try{const response=await fetch('/api/live-info?id='+id,{signal:controller.signal});if(!response.ok)return;const data=await response.json();if(channels.get(id)!==record)return;record.info=data;paint(record);}catch{}finally{clearTimeout(timer);record.busy=false;}
  }
  function watch(element,id,initial){
    element.textContent='';
    if(!/^[a-f\d]{32}$/i.test(id||''))return ()=>{};
    let record=channels.get(id);
    if(!record){record={info:initial||{viewers:null,openedAt:null},fetched:initial?Date.now():0,elements:new Set(),busy:false};channels.set(id,record);}
    else if(initial){record.info={...record.info,...initial,viewers:initial.viewers??record.info.viewers,openedAt:initial.openedAt??record.info.openedAt};record.fetched=Date.now();}
    record.elements.add(element);paint(record);if(!initial&&!record.fetched)refresh(id);
    return ()=>{record.elements.delete(element);element.textContent='';if(!record.elements.size){record.controller?.abort();channels.delete(id);}};
  }
  setInterval(()=>{for(const [id,record] of channels){paint(record);if(!document.hidden&&Date.now()-record.fetched>=30000)refresh(id);}},1000);
  const main=document.createElement('span');main.id='primary-live-info';main.className='live-info';document.getElementById('title').after(main);let stop=()=>{};
  function update(){stop();stop=watch(main,resolved?.kind==='vod'?null:resolved?.channelId,resolved?.liveInfo);}
  window.addEventListener('viewer-stream-opened',update);if(resolved)update();
  root.LiveInfo={watch,refresh,format};
})(globalThis);
