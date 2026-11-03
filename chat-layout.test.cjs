const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
function controls(){
 const layout={clientWidth:0,style:{setProperty:(key,value)=>{layout.value=value;}}},attributes={},saved={};let multi=false;
 const sandbox={splitter:{setAttribute:(key,value)=>attributes[key]=value},document:{body:{classList:{contains:()=>multi}}},$:id=>id==='layout'?layout:{setAttribute:(key,value)=>attributes[key]=value},getComputedStyle:()=>({paddingLeft:'32px',paddingRight:'32px'}),localStorage:{setItem:(key,value)=>saved[key]=value},requestAnimationFrame:()=>{},reportChatBounds:()=>{}};
 const source=fs.readFileSync(require('node:path').join(__dirname,'public/app.js'),'utf8');
 vm.runInNewContext('let panelWidth=360;'+source.slice(source.indexOf('function resizePanels('),source.indexOf('let dragStart;'))+';globalThis.getWidth=()=>panelWidth;',sandbox);
 return {sandbox,layout,attributes,saved,setMulti:value=>multi=value};
}
test('hidden startup layout preserves default chat width until the player opens',()=>{
 const {sandbox,layout}=controls();sandbox.resizePanels(360);assert.equal(sandbox.getWidth(),360);assert.equal(layout.value,undefined);
 layout.clientWidth=1440;sandbox.resizePanels(sandbox.getWidth());assert.equal(layout.value,'360px');
});
test('hidden home and multi-view layouts do not overwrite an adjusted single-view split',()=>{
 const {sandbox,layout,setMulti}=controls();layout.clientWidth=1440;sandbox.resizePanels(420,true);
 layout.clientWidth=0;sandbox.resizePanels(sandbox.getWidth());assert.equal(sandbox.getWidth(),420);
 layout.clientWidth=500;setMulti(true);sandbox.resizePanels(sandbox.getWidth());assert.equal(sandbox.getWidth(),420);
 setMulti(false);layout.clientWidth=1440;sandbox.resizePanels(sandbox.getWidth());assert.equal(layout.value,'420px');
});
test('user can still shrink chat and reset to its default',()=>{
 const {sandbox,layout,saved}=controls();layout.clientWidth=1440;sandbox.resizePanels(280,true);assert.equal(layout.value,'280px');assert.equal(saved['chzzk-chat-width'],'280');
 sandbox.resizePanels(360,true);assert.equal(layout.value,'360px');
});
