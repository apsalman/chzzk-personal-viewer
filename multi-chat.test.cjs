const {test}=require('node:test'),assert=require('node:assert/strict');
const {MultiChat}=require('./desktop/multi-chat.cjs');
function fixture(){
 const children=[],views=[];
 const window={isDestroyed:()=>false,getContentSize:()=>[1000,700],contentView:{addChildView:view=>children.push(view),removeChildView:view=>children.splice(children.indexOf(view),1)}};
 const manager=new MultiChat({window,guard:()=>{},createView:()=>{const view={setVisible:value=>view.visible=value,setBounds:value=>view.bounds=value,webContents:{loadURL:async url=>{view.url=url;},isDestroyed:()=>!!view.closed,close:()=>{view.closed=true;}}};views.push(view);return view;}});
 return {manager,views,children};
}
test('each extra live chat keeps its own channel and closes independently',async()=>{
 const {manager,views,children}=fixture();await manager.open('multi-1','a'.repeat(32));await manager.open('multi-2','b'.repeat(32));
 assert.match(views[0].url,new RegExp('a'.repeat(32)));assert.match(views[1].url,new RegExp('b'.repeat(32)));
 manager.close('multi-1');assert.equal(views[0].closed,true);assert.equal(children.length,1);assert.equal(views[1].closed,undefined);
 manager.closeAll();assert.equal(children.length,0);
});
test('native chats are clipped to the window and hidden for invalid bounds or drag',async()=>{
 const {manager,views}=fixture();await manager.open('multi-1','a'.repeat(32));
 manager.bounds('multi-1',{x:900,y:650,width:300,height:200,visible:true});assert.deepEqual(views[0].bounds,{x:900,y:650,width:100,height:50});
 manager.bounds('multi-1',{x:0,y:0,width:300,height:200,visible:false});assert.equal(views[0].visible,false);
 manager.bounds('multi-1',{x:NaN,y:0,width:300,height:200,visible:true});assert.equal(views[0].visible,false);
 await assert.rejects(manager.open('multi-3','https://example.com'),/채팅/);manager.closeAll();
});
test('detached chats keep their popup bounds when the inline slot changes',async()=>{
 const {manager,views}=fixture();await manager.open('multi-1','a'.repeat(32));
 manager.isDetached=()=>true;views[0].visible=true;views[0].bounds={x:0,y:0,width:440,height:800};
 manager.bounds('multi-1',{x:0,y:0,width:0,height:0,visible:false});
 assert.equal(views[0].visible,true);assert.equal(views[0].bounds.width,440);manager.closeAll();
});
