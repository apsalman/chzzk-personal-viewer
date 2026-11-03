const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {ChatPopout}=require('./desktop/chat-popout.cjs');
function owner(){const children=[];return {children,isDestroyed:()=>false,getContentSize:()=>[440,800],contentView:{addChildView:v=>children.push(v),removeChildView:v=>{const i=children.indexOf(v);if(i>=0)children.splice(i,1);}}};}
test('detaching moves the same chat view without duplication and closing restores it',()=>{
 const main=owner(),states=[];let popup;
 const view={setVisible:v=>{view.visible=v;},setBounds:b=>{view.bounds=b;},webContents:{isDestroyed:()=>!!view.closed,close:()=>{view.closed=true;}}};main.contentView.addChildView(view);
 const manager=new ChatPopout({window:main,createWindow:()=>{popup=Object.assign(new EventEmitter(),owner(),{show(){},focus(){},close(){this.emit('close');}});return popup;},onState:(id,state)=>states.push([id,state])});
 manager.open('primary',view);assert.equal(main.children.length,0);assert.equal(popup.children[0],view);assert.equal(manager.has('primary'),true);
 manager.open('primary',view);assert.equal(popup.children.length,1);
 manager.close('primary');assert.equal(popup.children.length,0);assert.equal(main.children[0],view);assert.equal(view.closed,undefined);assert.equal(manager.has('primary'),false);
 assert.deepEqual(states,[['primary',true],['primary',false]]);
 manager.open('primary',view);manager.closeAll();assert.equal(view.closed,true);assert.equal(main.children.length,0);
});
