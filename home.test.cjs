const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {directoryURL,normalizeLives}=require('./desktop/live-directory.cjs');
const sandbox={module:{exports:{}},URL};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'public/home-rules.js'),'utf8'),sandbox);const rules=sandbox.module.exports;
test('directory sorts use the upstream order and pagination preserves zero viewers',()=>{
 for(const [key,value] of Object.entries({viewers:'POPULAR',viewersAsc:'UNPOPULAR',latest:'LATEST',recommended:'RECOMMEND'}))assert.equal(new URL(directoryURL(key)).searchParams.get('sortType'),value);
 const data=normalizeLives({code:200,content:{data:[],page:{next:{liveId:42,concurrentUserCount:0}}}});
 const url=new URL(directoryURL('viewersAsc',data.next));assert.equal(url.searchParams.get('concurrentUserCount'),'0');assert.equal(url.searchParams.get('liveId'),'42');
 assert.throws(()=>directoryURL('made-up'));assert.throws(()=>directoryURL('viewers','%%%'));assert.throws(()=>directoryURL('viewers',Buffer.from('{"liveId":-1}').toString('base64url')));
});
test('directory sanitizes thumbnail URLs and duplicate or malformed channels',()=>{
 const row={liveTitle:'Test',concurrentUserCount:12,liveImageUrl:'https://livecloud-thumb.akamaized.net/image_{type}.jpg',channel:{channelId:'a'.repeat(32),channelName:'One',channelImageUrl:'javascript:alert(1)'},tags:['버튜버',{}]};
 const result=normalizeLives({code:200,content:{data:[row,row,{channel:{channelId:'bad'}}],page:{next:null}}});
 assert.equal(result.items.length,1);assert.equal(result.items[0].image,'https://livecloud-thumb.akamaized.net/image_480.jpg');assert.equal(result.items[0].avatar,'');assert.deepEqual(result.items[0].tags,['버튜버']);
 const restricted=normalizeLives({code:200,content:{data:[{...row,blindType:'ABROAD'}]}});assert.equal(restricted.items[0].image,'');assert.equal(restricted.items[0].restricted,'해외 시청 제한');
 assert.throws(()=>normalizeLives({code:200,content:{data:null}}));
});
test('exclusions match explicit channels, exact names and metadata keywords without inspecting images',()=>{
 const rows=[{id:'a'.repeat(32),name:'One',title:'게임 방송',category:'게임',tags:[]},{id:'b'.repeat(32),name:'Two',title:'새 방송',category:'게임',tags:['버튜버']},{id:'c'.repeat(32),name:'Three',title:'여캠 소통',category:'talk',tags:[]}];
 assert.equal(rules.visible(rows,{}).length,3);assert.equal(rules.visible(rows,{excludeVirtual:true}).length,2);assert.equal(rules.visible(rows,{excludeCamera:true}).length,2);
 assert.equal(rules.visible(rows,{blocked:[{id:rows[0].id,name:'Old name'}],names:['Two']}).length,1);
 assert.equal(rules.visible(rows,{keywords:['게임']}).length,1);assert.equal(rules.visible(rows,{},'Three')[0].id,rows[2].id);
 assert.equal(rules.visible(rows,{excludeVirtual:true,excludeCamera:true})[0].id,rows[0].id);
 assert.equal(rules.channelId('https://chzzk.naver.com/live/'+rows[0].id),rows[0].id);assert.equal(rules.channelId('https://example.com/'+rows[0].id),null);
 const saved=JSON.parse(JSON.stringify(rules.normalize({blocked:[{id:rows[0].id,name:'One'}],excludeVirtual:true,sort:'latest'})));assert.equal(rules.normalize(saved).blocked[0].name,'One');assert.equal(rules.normalize(saved).sort,'latest');
});
