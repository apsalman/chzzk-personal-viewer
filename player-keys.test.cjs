const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),vm = require('node:vm'),path = require('node:path');
const sandbox = {module:{exports:{}}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'public/player-keys.js'),'utf8'),sandbox);
const { handlePlayerKey } = sandbox.module.exports;
function event(key,editing=false,extra={}) {
  return { key, target:{closest:()=>editing}, preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...extra };
}
function video() { return { volume:.5,muted:false,currentTime:20,duration:120,seekable:{length:1,start:()=>10,end:()=>100} }; }

test('installed shortcuts seek the selected multi-view player without changing the main player',()=>{
  const browser={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'public/player-keys.js'),'utf8'),browser);
  const main=video(),selected=video();selected.currentTime=40;let listener,mode;
  const doc={defaultView:{multiView:{count:2,activeVideo:selected,fullscreen:value=>{mode=value;}}},addEventListener:(_name,callback)=>{listener=callback;}};
  browser.installPlayerKeys(main,()=>{},()=>{},doc);
  listener(event('ArrowRight'));assert.equal(selected.currentTime,45);assert.equal(main.currentTime,20);
  listener(event('F11'));assert.equal(mode,'video');
});
test('arrow keys change volume by 5 percent and seek 5 seconds within the available range',()=>{
  const v=video();
  handlePlayerKey(event('ArrowUp'),v);assert.equal(v.volume,.55);
  handlePlayerKey(event('ArrowDown'),v);assert.equal(v.volume,.5);
  handlePlayerKey(event('ArrowRight'),v);assert.equal(v.currentTime,25);
  handlePlayerKey(event('ArrowLeft'),v);assert.equal(v.currentTime,20);
  v.currentTime=11;handlePlayerKey(event('ArrowLeft'),v);assert.equal(v.currentTime,10);
  v.currentTime=99;handlePlayerKey(event('ArrowRight'),v);assert.ok(v.currentTime<100);
});
test('editing, focused menus/separators, composing and modified shortcuts are left untouched',()=>{
  for(const e of [event('ArrowLeft',true),event('f',true),event('ArrowUp',false,{isComposing:true}),event('ArrowLeft',false,{altKey:true}),event('f',false,{ctrlKey:true})]) {
    const v=video();assert.equal(handlePlayerKey(e,v,()=>{},()=>{}),false);assert.equal(e.prevented,undefined);assert.equal(v.volume,.5);assert.equal(v.currentTime,20);
  }
});
test('F, F11 and Alt+Enter toggle fullscreen once and suppress native duplicate handlers',()=>{
  for(const e of [event('f'),event('F11'),event('Enter',false,{altKey:true}),event('ㄹ',false,{code:'KeyF'})]) {
    let count=0,mode;assert.equal(handlePlayerKey(e,video(),()=>{},value=>{count++;mode=value;}),true);assert.equal(count,1);assert.equal(mode,e.key==='F11'||e.altKey?'video':'chat');assert.equal(e.prevented,true);assert.equal(e.stopped,true);
  }
});
test('volume stays in range and increasing volume unmutes the player',()=>{
  const v=video();v.volume=.99;handlePlayerKey(event('ArrowUp'),v);assert.equal(v.volume,1);
  v.muted=true;handlePlayerKey(event('ArrowUp'),v);assert.equal(v.volume,.05);assert.equal(v.muted,false);
});
