const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { Captions } = require('./desktop/captions.cjs');

test('audio worklet downsamples to four seconds of mono PCM and discards samples across seeks', () => {
  let Processor; const messages = [];
  class Base { constructor() { this.port = { postMessage: value => messages.push(value) }; } }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'public/caption-worklet.js'),'utf8'), { AudioWorkletProcessor:Base, sampleRate:48000, registerProcessor:(_name,Class)=>Processor=Class, Float32Array });
  const worklet = new Processor(); const block = new Float32Array(128).fill(.25);
  worklet.port.onmessage({data:{epoch:0,seconds:4}});
  for(let i=0;i<750;i++)worklet.process([[block]]);
  worklet.port.onmessage({data:{epoch:3,seconds:4}});
  for(let i=0;i<1499;i++)worklet.process([[block]]);
  assert.equal(messages.length,0);
  worklet.process([[block]]);
  assert.equal(messages.length,1); assert.equal(messages[0].epoch,3);
  const pcm = new Float32Array(messages[0].pcm);
  assert.equal(pcm.length,64000); assert.equal(pcm[0],.25); assert.equal(pcm.at(-1),.25);
});
test('low latency capture emits two-second chunks by default', () => {
  let Processor;const messages=[];
  class Base { constructor(){this.port={postMessage:value=>messages.push(value)};} }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'public/caption-worklet.js'),'utf8'), {AudioWorkletProcessor:Base,sampleRate:48000,registerProcessor:(_name,Class)=>Processor=Class,Float32Array});
  const worklet=new Processor(),block=new Float32Array(128).fill(.1);
  for(let i=0;i<750;i++)worklet.process([[block]]);
  assert.equal(messages.length,1);assert.equal(messages[0].pcm.byteLength,32000*4);
});
test('caption queue stays bounded, ignores stale seek results and terminates the worker', t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'chzzk-caption-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(path.join(root,'models/base'),{recursive:true}); fs.writeFileSync(path.join(root,'models/base/model.bin'),'fixture');
  fs.mkdirSync(path.join(root,'runtime/Scripts'),{recursive:true});fs.writeFileSync(path.join(root,'runtime/Scripts/python.exe'),'fixture');
  const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{child.killed=true;};
  const jobs=[];child.stdin.on('data',data=>jobs.push(JSON.parse(data.toString())));
  const engine=new Captions({runtime:root,spawnWorker:()=>child});t.after(()=>engine.stop());
  const results=[];engine.on('result',value=>results.push(value));
  engine.start();child.stdout.write('{"type":"ready"}\n');engine.reset(1);
  const input={pcm:new Float32Array(64000).buffer,epoch:1,end:4,capturedAt:Date.now()};
  assert.equal(engine.audio({...input,pcm:new ArrayBuffer(4)}),false);
  assert.equal(engine.audio({...input,epoch:0}),false);
  engine.audio(input);engine.audio({...input,end:8});engine.audio({...input,end:12});
  assert.equal(jobs.length,1);assert.equal(engine.state().dropped,1);
  child.stdout.write(JSON.stringify({type:'result',id:jobs[0].id,epoch:1,text:'안녕하세요',seconds:4,processing:.5})+'\n');
  assert.equal(results.length,1);assert.equal(jobs.length,2);assert.equal(jobs[1].end,12);
  engine.reset(2);
  child.stdout.write(JSON.stringify({type:'result',id:jobs[1].id,epoch:1,text:'이전 위치'})+'\n');
  assert.equal(results.length,1);
  engine.stop();assert.equal(child.killed,true);assert.equal(engine.state().active,false);
});
test('translation requires a complete local model and accepts only Korean, English, Spanish and Japanese',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'azzz-translation-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 for(const file of ['models/base/model.bin','runtime/Scripts/python.exe']){fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),'fixture');}
 let args;
 const engine=new Captions({runtime:root,spawnWorker:(_python,argv)=>{args=argv;const child=new EventEmitter();for(const stream of ['stdin','stdout','stderr'])child[stream]=new PassThrough();child.kill=()=>{};return child;}});t.after(()=>engine.stop());
 assert.equal(engine.state().translationAvailable,false);
 assert.throws(()=>engine.start('base','cpu','es'),/EnableTranslation/);
 assert.throws(()=>engine.start('base','cpu','fr'),/언어/);
 fs.mkdirSync(path.join(root,'translation'));
 for(const file of ['model.bin','config.json','shared_vocabulary.json','sentencepiece.bpe.model'])fs.writeFileSync(path.join(root,'translation',file),'fixture');
 assert.equal(engine.state().translationAvailable,true);
 for(const language of ['ko','en','es','ja']){engine.start('base','cpu',language);assert.equal(args.at(-1),language);assert.equal(engine.state().language,language);engine.stop();}
});
