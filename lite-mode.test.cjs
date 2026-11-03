const test=require('node:test'),assert=require('node:assert/strict');
const {LiteMode}=require('./desktop/lite-mode.cjs');
function controller(overrides={}){
 const calls=[];
 const lite=new LiteMode({recorder:{shutdown:async()=>calls.push('save-recording')},downloader:{cancel:async()=>calls.push('cancel-download')},captions:{stop:()=>calls.push('stop-speech-and-translation')},vodCaptions:{cancel:()=>calls.push('stop-audio-decoder')},setEnabled:value=>calls.push(value?'disable-features':'enable-features'),closeViews:()=>calls.push('destroy-chat-and-extra-windows'),...overrides});return {lite,calls};
}
test('Lite stops speech and media workers, saves recording before destroying chat, and can exit',async()=>{
 const {lite,calls}=controller();await lite.set(true);
 assert.deepEqual(calls,['disable-features','stop-speech-and-translation','stop-audio-decoder','save-recording','cancel-download','destroy-chat-and-extra-windows']);assert.equal(lite.enabled,true);
 await lite.set(true);assert.equal(calls.length,6);await lite.set(false);assert.equal(lite.enabled,false);assert.equal(calls.at(-1),'enable-features');
});
test('failed recording finalization aborts Lite and keeps the normal interface available',async()=>{
 const {lite,calls}=controller({recorder:{shutdown:async()=>{throw Error('save failed');}}});
 await assert.rejects(lite.set(true),/save failed/);assert.equal(lite.enabled,false);assert.equal(lite.pending,null);assert.equal(calls.at(-1),'enable-features');assert.ok(!calls.includes('destroy-chat-and-extra-windows'));
});
test('a second transition cannot interrupt recording finalization',async()=>{
 let finish;const {lite}=controller({recorder:{shutdown:()=>new Promise(resolve=>finish=resolve)}});
 const entering=lite.set(true);await assert.rejects(lite.set(false),/전환 중/);finish();await entering;assert.equal(lite.enabled,true);
});
