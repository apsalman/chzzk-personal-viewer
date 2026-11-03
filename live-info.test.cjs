const test=require('node:test'),assert=require('node:assert/strict');
const {liveInfo}=require('./desktop/live-directory.cjs');
const fs=require('node:fs'),vm=require('node:vm');
function load(file){const sandbox={module:{exports:{}}};vm.runInNewContext(fs.readFileSync(file,'utf8'),sandbox);return sandbox.module.exports;}
const {format}=load('./public/live-info.js');
const layout=load('./public/multi-layout.js');
test('live metadata parses Korean start time and preserves unknown viewers',()=>{
 assert.equal(liveInfo({openDate:'2026-11-03 15:00:00',concurrentUserCount:0},'a').openedAt,Date.parse('2026-11-03T06:00:00Z'));
 assert.equal(liveInfo({concurrentUserCount:0},'a').viewers,0);
 assert.equal(liveInfo({},'a').viewers,null);
 assert.equal(liveInfo({openDate:'bad',status:'CLOSE'},'a').openedAt,null);
 assert.equal(format({status:'CLOSE'}),'방송 종료');
});
test('viewer and elapsed display counts broadcast hours, clamps future dates',()=>{
 assert.equal(format({viewers:1234,openedAt:0},3661000),'시청자 1,234명 · 방송 01:01:01');
 assert.equal(format({viewers:0,openedAt:1000},0),'시청자 0명 · 방송 00:00:00');
 assert.equal(format(null),'');assert.equal(format({viewers:null}),'시청자 수 확인 중');
});
test('selecting a broadcast replaces the directory and preserves split ratios',()=>{
 const tree={axis:'x',ratio:.6,a:{axis:'y',ratio:.4,a:'primary',b:'extra'},b:'directory'};
 const next=layout.replace(tree,'directory','new');assert.equal(next.b,'new');assert.equal(next.ratio,.6);assert.deepEqual(JSON.parse(JSON.stringify(next.a)),tree.a);assert.equal(tree.b,'directory');
 assert.deepEqual(JSON.parse(JSON.stringify(layout.remove(next,'new'))),tree.a);
});
