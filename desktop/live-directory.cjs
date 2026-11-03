const SORTS={viewers:'POPULAR',viewersAsc:'UNPOPULAR',latest:'LATEST',recommended:'RECOMMEND'};
function imageURL(value){
  try{const url=new URL(String(value||'').replace(/\{type\}/g,'480'));return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&['pstatic.net','naver.com','akamaized.net','ntruss.com','cloudfront.net'].some(host=>url.hostname===host||url.hostname.endsWith('.'+host))?url.href:'';}catch{return '';}
}
function cursor(value){
  if(value===null||value===undefined)return null;
  if(!value||!Number.isSafeInteger(value.liveId)||value.liveId<0||!Number.isSafeInteger(value.concurrentUserCount)||value.concurrentUserCount<0)throw Error('올바르지 않은 방송 목록 페이지입니다.');
  return {liveId:value.liveId,concurrentUserCount:value.concurrentUserCount};
}
function directoryURL(sort='viewers',next=''){
  if(!Object.hasOwn(SORTS,sort))throw Error('지원하지 않는 방송 정렬입니다.');
  const url=new URL('https://api.chzzk.naver.com/service/v1/lives');url.searchParams.set('size','30');url.searchParams.set('sortType',SORTS[sort]);
  if(next){if(typeof next!=='string'||next.length>256||!/^[\w-]+$/.test(next))throw Error('올바르지 않은 방송 목록 페이지입니다.');let data;try{data=cursor(JSON.parse(Buffer.from(next,'base64url').toString('utf8')));}catch{throw Error('올바르지 않은 방송 목록 페이지입니다.');}if(!data)throw Error('올바르지 않은 방송 목록 페이지입니다.');for(const [key,value] of Object.entries(data))url.searchParams.set(key,String(value));}
  return url.href;
}
function normalizeLives(data){
  if(data?.code!==200||!Array.isArray(data.content?.data))throw Error('방송 목록 응답 형식이 변경되었습니다.');
  const seen=new Set();
  const items=data.content.data.slice(0,200).flatMap(row=>{
    const channel=row.channel||{},id=channel.channelId;
    if(!/^[a-f\d]{32}$/i.test(id||'')||seen.has(id))return [];seen.add(id);
    return [{id,name:String(channel.channelName||'방송').slice(0,100),title:String(row.liveTitle||'라이브 방송').slice(0,300),image:row.blindType?'':imageURL(row.liveImageUrl)||imageURL(row.defaultThumbnailImageUrl),avatar:imageURL(channel.channelImageUrl),viewers:Math.max(0,Number(row.concurrentUserCount)||0),opened:String(row.openDate||''),category:String(row.liveCategoryValue||'').slice(0,100),tags:(Array.isArray(row.tags)?row.tags:[]).filter(tag=>typeof tag==='string').slice(0,30).map(tag=>tag.slice(0,80)),restricted:row.blindType==='ABROAD'?'해외 시청 제한':row.adult?'연령 확인 필요':row.blindType?'미리보기 제한':''}];
  });
  const next=cursor(data.content.page?.next);
  return {items,next:next?Buffer.from(JSON.stringify(next)).toString('base64url'):null};
}
function liveInfo(live,id){
  const raw=live.concurrentUserCount,value=raw===null||raw===undefined||raw===''?NaN:Number(raw);
  let openedAt=null;
  if(typeof live.openDate==='string'){
    const text=live.openDate.trim().replace(' ','T'),time=Date.parse(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?$/.test(text)?text+'+09:00':text);
    if(Number.isFinite(time))openedAt=time;
  }
  return {channelId:id,viewers:Number.isFinite(value)&&value>=0?Math.floor(value):null,openedAt,status:live.status==='CLOSE'?'CLOSE':'OPEN'};
}
module.exports={directoryURL,normalizeLives,liveInfo};
