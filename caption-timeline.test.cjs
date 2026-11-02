const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = {module:{exports:{}}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'public/caption-timeline.js'),'utf8'),context);
const {CaptionTimeline}=context.module.exports;
test('VOD captions follow the media clock, leave silence empty and switch at cue boundaries',()=>{
 const timeline=new CaptionTimeline();
 timeline.add(60,72,[{start:61,end:63,text:'안녕하세요'},{start:63,end:66,text:'한국어 자막입니다'}]);
 assert.equal(timeline.at(60),'');assert.equal(timeline.at(61),'안녕하세요');assert.equal(timeline.at(63),'한국어 자막입니다');assert.equal(timeline.at(66),'');
 assert.equal(timeline.at(62),'안녕하세요'); // Rewind or pause uses the same media timestamp.
 assert.equal(timeline.through,72);
 timeline.clear();assert.equal(timeline.at(62),'');assert.equal(timeline.through,0);
});
test('VOD timeline ignores invalid timestamps and prunes old cues',()=>{
 const timeline=new CaptionTimeline();
 timeline.add(0,12,[{start:1,end:3,text:'첫 구간'},{start:5,end:2,text:'잘못된 구간'},{start:NaN,end:6,text:'오류'},{start:20,end:22,text:'범위 밖'}]);
 assert.equal(timeline.cues.length,1);timeline.prune(40);assert.equal(timeline.cues.length,0);
});
