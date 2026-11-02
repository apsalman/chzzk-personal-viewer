const { test }=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const sandbox={module:{exports:{}}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'public/seekbar.js'),'utf8'),sandbox);
const {timeLabel,targetAt,describePoint}=sandbox.module.exports;
test('hover uses the actual rolling seek range rather than treating its left edge as zero',()=>{
  assert.equal(targetAt(300,330,0),300);assert.equal(targetAt(300,330,.5),315);assert.equal(targetAt(300,330,1),330);
  assert.equal(describePoint(300,325,330).position,'5:00 · LIVE −0:30');
  assert.equal(describePoint(300,325,330).movement,'현재보다 25초 뒤로');
});
test('recording/replay ranges and forward targets have correct hover times',()=>{
  assert.equal(targetAt(0,600,.25),150);assert.equal(describePoint(150,120,600).movement,'현재보다 30초 앞으로');
  assert.equal(timeLabel(7205),'2:00:05');assert.equal(targetAt(300,330,-1),300);assert.equal(targetAt(300,330,2),330);
  assert.equal(describePoint(150,150,600).movement,'현재 재생 위치');
});
