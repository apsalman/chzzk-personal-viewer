const { spawn } = require('node:child_process');
function localUri(value, base) {
  const url = new URL(value,base), origin = new URL(base);
  if(url.origin!==origin.origin || !/^\/media\/[a-f\d]{32}$/.test(url.pathname)) throw Error('올바르지 않은 영상 주소입니다.');
  return url.href;
}
function sliceHlsPlaylist(text, base, start, duration) {
  const lines=text.split(/\r?\n/), segments=[];
  let time=0,length=0,key='',map='',range='',offset=0,sequence=0,discontinuity=false;
  for(const line of lines){
    if(line.startsWith('#EXT-X-MEDIA-SEQUENCE:'))sequence=Number(line.split(':')[1]);
    else if(line.startsWith('#EXTINF:'))length=Number(line.slice(8).split(',')[0]);
    else if(line.startsWith('#EXT-X-KEY:'))key=line;
    else if(line.startsWith('#EXT-X-MAP:'))map=line;
    else if(line.startsWith('#EXT-X-DISCONTINUITY'))discontinuity=true;
    else if(line.startsWith('#EXT-X-BYTERANGE:')){const [size,at]=line.slice(17).split('@').map(Number);range=`#EXT-X-BYTERANGE:${size}@${at??offset}`;offset=(at??offset)+size;}
    else if(line && !line.startsWith('#') && length>0){segments.push({time,length,key,map,range,discontinuity,url:localUri(line,base)});time+=length;length=0;range='';discontinuity=false;}
  }
  const first=segments.findIndex(s=>s.time+s.length>start);
  if(first<0)throw Error('자막 구간을 찾지 못했습니다.');
  const selected=segments.slice(first).filter(s=>s.time<start+duration);
  const rewrite=line=>line.replace(/URI="([^"]+)"/g,(_,uri)=>`URI="${localUri(uri,base)}"`);
  const output=['#EXTM3U','#EXT-X-VERSION:7',`#EXT-X-TARGETDURATION:${Math.ceil(Math.max(...selected.map(s=>s.length)))}`,`#EXT-X-MEDIA-SEQUENCE:${sequence+first}`];
  let lastKey='',lastMap='';
  for(const s of selected){
    if(s.discontinuity)output.push('#EXT-X-DISCONTINUITY');
    if(s.key!==lastKey){if(s.key)output.push(rewrite(s.key));lastKey=s.key;}
    if(s.map!==lastMap){if(s.map)output.push(rewrite(s.map));lastMap=s.map;}
    output.push(`#EXTINF:${s.length},`);if(s.range)output.push(s.range);output.push(s.url);
  }
  output.push('#EXT-X-ENDLIST');
  return {playlist:output.join('\n')+'\n',seek:start-segments[first].time};
}
async function loadPlaylist(url,signal){
  for(let depth=0;depth<4;depth++){
    const response=await fetch(url,{signal});if(!response.ok)throw Error('영상 목록을 불러오지 못했습니다.');
    const text=await response.text();if(!text.startsWith('#EXTM3U'))throw Error('올바르지 않은 영상 목록입니다.');
    const lines=text.split(/\r?\n/),variants=[];
    for(let i=0;i<lines.length;i++)if(lines[i].startsWith('#EXT-X-STREAM-INF:')){const bandwidth=Number(lines[i].match(/\bBANDWIDTH=(\d+)/)?.[1]||Infinity);const next=lines.slice(i+1).find(s=>s&&!s.startsWith('#'));if(next)variants.push({bandwidth,url:localUri(next,url)});}
    if(!variants.length)return {text,url};
    variants.sort((a,b)=>a.bandwidth-b.bandwidth);url=variants[0].url;
  }
  throw Error('영상 목록이 너무 깊습니다.');
}
class VodCaptionAudio {
  constructor(ffmpeg) { this.ffmpeg=ffmpeg; }
  cancel() { this.request=null;this.abort?.abort();this.abort=null;const child=this.child;this.child=null;if(child)child.kill(); }
  async decode(url,start,duration=12,hls=false) {
    if(!this.ffmpeg)throw Error('다시보기 선행 인식에는 FFmpeg가 필요합니다.');
    if(!Number.isFinite(start)||start<0||!Number.isFinite(duration)||duration<1||duration>12)throw Error('올바르지 않은 자막 구간입니다.');
    if(this.request)throw Error('이전 자막 구간을 준비 중입니다.');
    const request=this.request={},abort=this.abort=new AbortController();
    const deadline=setTimeout(()=>{abort.abort();if(this.request===request)this.child?.kill();},25000);
    try{
      let input=url,playlist,seek=start;
      if(hls){const loaded=await loadPlaylist(url,abort.signal);
        let relative=start;
        if(typeof hls==='object')relative=livePlaylistPosition(loaded.text,hls.sn,hls.time,start);
        const sliced=sliceHlsPlaylist(loaded.text,loaded.url,relative,duration);playlist=sliced.playlist;seek=sliced.seek;input='pipe:0';}
      if(this.request!==request)throw Error('cancelled');
      return await new Promise((resolve,reject)=>{
        const args=['-hide_banner','-loglevel','error','-rw_timeout','15000000'];
        if(hls)args.push('-f','hls','-protocol_whitelist','pipe,http,https,tcp,tls,crypto,data','-allowed_extensions','ALL','-extension_picky','0');else args.push('-ss',String(start));
        args.push('-i',input);
        if(hls)args.push('-ss',String(seek));
        args.push('-t',String(duration),'-vn','-sn','-ac','1','-ar','16000','-f','f32le','pipe:1');
        const child=this.child=spawn(this.ffmpeg,args,{windowsHide:true,stdio:['pipe','pipe','pipe']});
        const chunks=[];let bytes=0;
        child.stdin.on('error',()=>{});child.stdin.end(playlist);
        child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>1024000)child.kill();else chunks.push(chunk);});
        child.stderr.on('data',()=>{});child.once('error',()=>{});
        child.once('close',code=>{
          if(this.child===child)this.child=null;
          if(this.request!==request)return reject(Error('cancelled'));
          if(code!==0||bytes<64000||bytes>1024000)return reject(Error('다시보기 음성을 가져오지 못했습니다. 다시 연결해 주세요.'));
          resolve(Buffer.concat(chunks));
        });
      });
    }finally{clearTimeout(deadline);if(this.request===request){this.request=null;this.abort=null;}}
  }
}
function livePlaylistPosition(text,sn,time,start){
  const sequence=Number(text.match(/#EXT-X-MEDIA-SEQUENCE:(\d+)/)?.[1]||0);
  const lengths=[...text.matchAll(/#EXTINF:([\d.]+)/g)].map(match=>Number(match[1]));
  const index=sn-sequence;
  if(!Number.isSafeInteger(sn)||!Number.isFinite(time)||index<0||index>=lengths.length)throw Error('라이브 구간이 갱신되었습니다. 다시 준비합니다.');
  const position=start-time+lengths.slice(0,index).reduce((sum,n)=>sum+n,0);
  if(!Number.isFinite(position)||position<0)throw Error('라이브 구간이 갱신되었습니다. 다시 준비합니다.');
  return position;
}
module.exports={VodCaptionAudio,sliceHlsPlaylist,livePlaylistPosition};
