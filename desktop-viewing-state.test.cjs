const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { normalizeViewingState, readViewingState, saveViewingState } = require('./desktop/viewing-state.cjs');
test('viewing state canonicalizes VOD and live addresses and rejects unsafe targets', () => {
  assert.deepEqual(normalizeViewingState({ address:'https://chzzk.naver.com/video/15975252?token=private', position:180.5 }), { kind:'vod', address:'https://chzzk.naver.com/video/15975252', position:180.5 });
  const live = 'https://chzzk.naver.com/live/42597020c1a79fb151bd9b9beaa9779b';
  assert.deepEqual(normalizeViewingState({ address:live+'/chat', position:180 }), { kind:'live', address:live, position:0 });
  assert.equal(normalizeViewingState({ address:live.split('/').pop() }).address,live);
  for(const address of ['https://example.com/video/123','http://chzzk.naver.com/video/123','https://user:pass@chzzk.naver.com/video/123','https://chzzk.naver.com:8080/video/123']) assert.equal(normalizeViewingState({ address }),null);
  for(const position of [-1,Infinity,NaN,'100']) assert.equal(normalizeViewingState({ address:'https://chzzk.naver.com/video/123',position }).position,0);
});
test('VOD position survives process-independent disk persistence and corrupt state recovers', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'chzzk-viewing-')); t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file = path.join(dir,'profile/viewing-state.json');
  assert.equal(readViewingState(file),null);
  saveViewingState(file,{ address:'https://chzzk.naver.com/video/15975252', position:321.75 });
  assert.equal(readViewingState(file).position,321.75);
  assert.equal(fs.existsSync(file+'.tmp'),false);
  saveViewingState(file,null); assert.equal(readViewingState(file),null);
  fs.writeFileSync(file,'broken'); assert.equal(readViewingState(file),null);
});
