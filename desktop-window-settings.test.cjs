const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fitWindow,saveWindowSettings,readWindowSettings } = require('./desktop/window-settings.cjs');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const areas=[{x:0,y:0,width:1920,height:1040},{x:-1920,y:0,width:1920,height:1040}];
const options={width:1440,height:940,minWidth:1000,minHeight:650};
test('saved main bounds are restored on the correct monitor including negative coordinates',()=>{
  const saved={x:-1800,y:50,width:1400,height:900};assert.deepEqual(fitWindow(saved,areas,options),saved);
});
test('disconnected monitor and invalid settings recover to a visible window',()=>{
  const result=fitWindow({x:99999,y:99999,width:4000,height:3000},[areas[0]],options);
  assert.deepEqual(result,{x:0,y:0,width:1920,height:1040});
  assert.deepEqual(fitWindow({x:'bad'},[areas[0]],options),{x:240,y:50,width:1440,height:940});
});
test('main and PiP preferences are stored independently and PiP retains 16:9',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'chzzk-window-test-'));
  const file=path.join(dir,'window-state.json');
  try {
    const settings={main:{bounds:{x:50,y:60,width:1200,height:800},maximized:true},pip:{bounds:{x:800,y:300,width:640,height:360}}};
    saveWindowSettings(file,settings);assert.deepEqual(readWindowSettings(file),settings);
    assert.deepEqual(fitWindow(settings.pip.bounds,areas,{width:480,height:270,minWidth:240,minHeight:135,ratio:16/9}),settings.pip.bounds);
  } finally {fs.unlinkSync(file);fs.rmdirSync(dir);}
});
