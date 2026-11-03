class ChatPopout {
  constructor({window,createWindow,onState}){this.window=window;this.createWindow=createWindow;this.onState=onState;this.windows=new Map();}
  has(id){return this.windows.has(id);}
  open(id,view){
    const existing=this.windows.get(id);if(existing){existing.popup.show();existing.popup.focus();return;}
    const popup=this.createWindow(),record={popup,view,dispose:false};this.windows.set(id,record);
    this.window.contentView.removeChildView(view);popup.contentView.addChildView(view);
    const fit=()=>{if(popup.isDestroyed()||view.webContents.isDestroyed())return;const [width,height]=popup.getContentSize();view.setBounds({x:0,y:0,width,height});view.setVisible(true);};
    popup.on('resize',fit);
    popup.on('close',()=>{
      this.windows.delete(id);
      if(!view.webContents.isDestroyed()){
        view.setVisible(false);popup.contentView.removeChildView(view);
        if(record.dispose||this.window.isDestroyed())view.webContents.close();else this.window.contentView.addChildView(view);
      }
      this.onState(id,false,record.dispose);
    });
    fit();this.onState(id,true,false);popup.show();
  }
  close(id,dispose=false){const record=this.windows.get(id);if(!record)return;record.dispose=dispose;if(!record.popup.isDestroyed())record.popup.close();}
  closeAll(){for(const id of [...this.windows.keys()])this.close(id,true);}
}
module.exports={ChatPopout};
