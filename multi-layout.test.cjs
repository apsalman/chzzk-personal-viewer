const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const sandbox={module:{exports:{}}};vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'public/multi-layout.js'),'utf8'),sandbox);
const {automatic,rectangles,dock,remove}=sandbox.module.exports;
const {resize,dividers}=sandbox.module.exports;
test('split resizing changes both neighbors and keeps ratios through docking and removal',()=>{
 let tree=resize(automatic(['a','b'],1600,800),'',.7);
 let r=rectangles(tree,1600,800);assert.ok(r.a.width>r.b.width*2);
 assert.equal(dividers(tree,1600,800)[0].ratio,.7);
 tree=dock(tree,'c','b','bottom');assert.equal(tree.ratio,.7);
 tree=resize(tree,'b',.3);assert.equal(tree.b.ratio,.3);
 tree=remove(tree,'c');assert.equal(tree.ratio,.7);
 r=rectangles(resize(tree,'',10),1600,800);assert.ok(r.b.width>0);
});
test('two streams adapt between side by side and stacked layouts',()=>{
 const wide=rectangles(automatic(['a','b'],1600,700),1600,700);
 assert.equal(wide.a.y,wide.b.y);assert.ok(wide.b.x>wide.a.x);
 const narrow=rectangles(automatic(['a','b'],900,900),900,900);
 assert.equal(narrow.a.x,narrow.b.x);assert.ok(narrow.b.y>narrow.a.y);
});
test('docking targets the requested side and removing a tile collapses its split',()=>{
 for(const edge of ['left','right','top','bottom']){
  const tree=dock(automatic(['a','b'],1600,700),'a','b',edge),r=rectangles(tree,1600,700);
  assert.ok(edge==='left'?r.a.x<r.b.x:edge==='right'?r.a.x>r.b.x:edge==='top'?r.a.y<r.b.y:r.a.y>r.b.y);
  assert.equal(remove(tree,'a'),'b');
 }
});
test('nested docking keeps every player once, inside the workspace without overlap',()=>{
 let tree=automatic(['a','b','c','d'],1600,800);
 tree=dock(tree,'a','d','bottom');tree=dock(tree,'b','a','right');
 const r=rectangles(tree,1600,800),entries=Object.entries(r);assert.equal(entries.length,4);
 for(const [id,b] of entries){
  assert.ok(b.width>0&&b.height>0&&b.x>=0&&b.y>=0&&b.x+b.width<=1600&&b.y+b.height<=800);
  for(const [other,c] of entries)if(id!==other)assert.ok(b.x+b.width<=c.x||c.x+c.width<=b.x||b.y+b.height<=c.y||c.y+c.height<=b.y);
 }
 assert.deepEqual(dock(tree,'a','missing','left'),tree);
 assert.deepEqual(dock(tree,'a','a','left'),tree);
});
