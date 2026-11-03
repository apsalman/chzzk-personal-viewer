(function(root){
  function strings(value,max=200){return [...new Set((Array.isArray(value)?value:[]).filter(x=>typeof x==='string').map(x=>x.trim().slice(0,100)).filter(Boolean))].slice(0,max);}
  function normalize(value){
    value=value&&typeof value==='object'?value:{};
    const blocked=(Array.isArray(value.blocked)?value.blocked:[]).filter(x=>x&&/^[a-f\d]{32}$/i.test(x.id||'')).slice(0,1000).map(x=>({id:x.id.toLowerCase(),name:String(x.name||x.id).slice(0,100)}));
    return {blocked:[...new Map(blocked.map(x=>[x.id,x])).values()],names:strings(value.names,1000),keywords:strings(value.keywords),sort:['viewers','viewersAsc','latest','recommended'].includes(value.sort)?value.sort:'viewers'};
  }
  function channelId(value){
    if(/^[a-f\d]{32}$/i.test(value))return value.toLowerCase();
    try{const url=new URL(value);return url.protocol==='https:'&&url.hostname==='chzzk.naver.com'?url.pathname.match(/^\/(?:live\/)?([a-f\d]{32})(?:\/chat)?\/?$/i)?.[1].toLowerCase()||null:null;}catch{return null;}
  }
  function visible(items,settings,query=''){
    const config=normalize(settings),blocked=new Set(config.blocked.map(x=>x.id)),names=new Set(config.names.map(x=>x.toLocaleLowerCase()));
    const keywords=config.keywords.map(x=>x.toLocaleLowerCase());
    return items.filter(item=>{
      const haystack=[item.title,item.name,item.category,...(item.tags||[])].join(' ').toLocaleLowerCase();
      return !blocked.has(item.id.toLowerCase())&&!names.has(item.name.toLocaleLowerCase())&&!keywords.some(word=>haystack.includes(word))&&(!query||haystack.includes(query.trim().toLocaleLowerCase()));
    });
  }
  const api={normalize,visible,channelId};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.HomeRules=api;
})(globalThis);
