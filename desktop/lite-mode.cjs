class LiteMode {
  constructor({recorder,downloader,captions,vodCaptions,setEnabled,closeViews}){Object.assign(this,{recorder,downloader,captions,vodCaptions,setEnabled,closeViews});this.enabled=false;this.pending=null;}
  async set(enabled){
    if(this.pending)throw Error('Lite 모드 전환 중입니다.');
    if(enabled===this.enabled)return;
    if(!enabled){this.enabled=false;this.setEnabled(false);return;}
    this.setEnabled(true);
    this.pending=(async()=>{
      try{
        this.captions.stop();this.vodCaptions.cancel();
        await this.recorder.shutdown();
        await this.downloader.cancel();
        this.closeViews();this.enabled=true;
      }catch(error){this.setEnabled(false);throw error;}
    })();
    try{await this.pending;}finally{this.pending=null;}
  }
}
module.exports={LiteMode};
