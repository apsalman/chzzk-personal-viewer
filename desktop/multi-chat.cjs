class MultiChat {
  constructor({window,createView,guard,isDetached=()=>false,onClose=()=>{}}){this.window=window;this.createView=createView;this.guard=guard;this.isDetached=isDetached;this.onClose=onClose;this.views=new Map();}
  async open(id,channel){
    if(!/^multi-\d{1,8}$/.test(id)||!/^[a-f\d]{32}$/i.test(channel))throw Error('잘못된 채팅 주소입니다.');
    const existing=this.views.get(id);
    if(existing?.channel===channel)return;
    if(!existing&&this.views.size>=8)throw Error('추가 채팅은 최대 8개까지 열 수 있습니다.');
    this.close(id);
    const view=this.createView();this.views.set(id,{id,view,channel,bounds:null});
    this.window.contentView.addChildView(view);view.setVisible(false);this.guard(view.webContents,channel);
    try{await view.webContents.loadURL(`https://chzzk.naver.com/live/${channel}/chat`);}catch(error){if(this.views.get(id)?.view===view)this.close(id);throw error;}
  }
  bounds(id,bounds){
    const record=this.views.get(id);if(!record)return;
    if(!bounds||!['x','y','width','height'].every(key=>Number.isFinite(bounds[key]))){if(!this.isDetached(id))record.view.setVisible(false);record.bounds=null;return;}
    record.bounds=bounds;this.layout(id);
  }
  layout(id){
    const records=id?[this.views.get(id)]:[...this.views.values()];
    const [width,height]=this.window.getContentSize();
    for(const record of records){
      if(!record||this.isDetached(record.id))continue;const b=record.bounds;
      const x=Math.max(0,Math.min(width,Math.round(b?.x||0))),y=Math.max(0,Math.min(height,Math.round(b?.y||0)));
      const w=Math.max(0,Math.min(Math.round(b?.width||0),width-x)),h=Math.max(0,Math.min(Math.round(b?.height||0),height-y));
      const visible=!!(b?.visible&&w>10&&h>10);record.view.setVisible(visible);
      if(visible)record.view.setBounds({x,y,width:w,height:h});
    }
  }
  close(id){const record=this.views.get(id);if(!record)return;this.onClose(id);this.views.delete(id);if(!record.view.webContents.isDestroyed()){if(!this.window.isDestroyed())this.window.contentView.removeChildView(record.view);record.view.webContents.close();}}
  closeAll(){for(const id of [...this.views.keys()])this.close(id);}
}
module.exports={MultiChat};
