(() => {
  const menu=document.getElementById('player-menu'),button=document.createElement('button');
  button.id='menu-lite';button.type='button';button.setAttribute('role','menuitem');button.textContent='Lite 모드로 시청';menu.prepend(button);
  let target=video,busy=false;
  function snapshot(media){
    if(media!==video)return window.multiView.snapshot(media);
    return {address:lastRequest?.value||document.getElementById('address').value,data:resolved,source:resolved?.sources?.[Number(document.getElementById('source').value)||0]?.url,position:vodMode?media.currentTime:0,paused:media.paused,muted:media.muted,volume:media.volume,rate:media.playbackRate,height:media.videoHeight};
  }
  document.addEventListener('contextmenu',event=>{
    const media=event.target.closest('video')||event.target.closest('.screen')?.querySelector('video');if(!media||(media!==video&&!media.dataset.multiVideo))return;
    target=media;for(const item of menu.children)item.hidden=false;
    button.disabled=busy||!media.videoWidth||!snapshot(media)?.source;
    if(media===video)return;
    if(!media.dataset.multiVideo)return;
    event.preventDefault();event.stopPropagation();
    for(const item of menu.children)if(item!==button)item.hidden=true;
    menu.hidden=false;menu.style.left=Math.max(0,Math.min(event.clientX,innerWidth-menu.offsetWidth-8))+'px';menu.style.top=Math.max(0,Math.min(event.clientY,innerHeight-menu.offsetHeight-8))+'px';button.focus();
  },true);
  button.onclick=async()=>{
    if(busy)return;const state=snapshot(target);if(!state?.source)return;
    busy=true;button.disabled=true;menu.hidden=true;playerToast('Lite 모드 준비 중… 녹화가 진행 중이면 저장 후 전환합니다.');
    try{
      if(document.fullscreenElement)await document.exitFullscreen();
      if(document.pictureInPictureElement)await document.exitPictureInPicture();
      sessionStorage.setItem('lite-playback',JSON.stringify(state));
      if(window.desktopChat){const result=await window.desktopChat.lite(true);if(result?.error)throw Error(result.error);}
      window.multiView.dispose();primaryChatPopup?.close();
      if(window.desktopChat)await window.desktopChat.playerMode(true);
      location.replace('/lite.html');
    }catch(error){await window.desktopChat?.lite(false);playerToast(error.message);}finally{busy=false;button.disabled=false;}
  };
})();
