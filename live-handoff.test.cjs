const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function fixture(fail=false){
  const overlays=[];
  const classes=()=>({add(){},remove(){}});
  const parent={classList:classes(),append(element){element.parentElement=parent;overlays.push(element);}};
  function media(){return{readyState:4,videoWidth:640,currentTime:2,paused:false,muted:false,volume:.35,classList:classes(),parentElement:parent,seekable:{length:0},setAttribute(){},play(){this.paused=false;return Promise.resolve();},pause(){this.paused=true;},remove(){this.removed=true;},addEventListener(){}};}
  const primary=media();
  class Hls{
    static isSupported(){return true;}static Events={MANIFEST_PARSED:'manifest'};
    loadSource(){}attachMedia(video){this.video=video;if(fail)video.error=new Error('offline');}
    on(_event,fn){fn();}destroy(){this.destroyed=true;}
  }
  const context={Hls,setTimeout,document:{createElement(){return media();}}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'public/live-handoff.js'),'utf8'),context);
  return{handoff:context.handoffToLive,primary,overlays};
}
test('live handoff plays a prepared cover while replacing the primary source, preserving audio',async()=>{
  const {handoff,primary,overlays}=fixture();let loading=false;
  await handoff({video:primary,source:'/media/new',getPrimaryHls:()=>({url:'/dvr/old'}),loadPrimary:async()=>{
    const cover=overlays[0];assert.equal(primary.paused,true);assert.equal(cover.paused,false);assert.equal(cover.muted,false);assert.equal(primary.handoffPlayback,cover);
    loading=true;primary.currentTime=3;primary.paused=false;
  }});
  assert.equal(loading,true);assert.equal(primary.paused,false);assert.equal(primary.volume,.35);assert.equal(primary.muted,false);assert.equal(overlays[0].removed,true);assert.equal(primary.handoffPlayback,undefined);
});
test('a paused, muted viewer remains paused and muted after the handoff',async()=>{
  const {handoff,primary}=fixture();primary.paused=true;primary.muted=true;
  await handoff({video:primary,source:'/media/new',getPrimaryHls:()=>({url:'/dvr/old'}),loadPrimary:async()=>{primary.paused=false;}});
  assert.equal(primary.paused,true);assert.equal(primary.muted,true);
});
test('failed live preloading leaves the existing DVR video playing and never replaces it',async()=>{
  const {handoff,primary,overlays}=fixture(true);let changed=false;
  await assert.rejects(handoff({video:primary,source:'/media/new',getPrimaryHls:()=>({url:'/dvr/old'}),loadPrimary:async()=>{changed=true;}}));
  assert.equal(changed,false);assert.equal(primary.paused,false);assert.equal(primary.muted,false);assert.equal(overlays[0].removed,true);
});
