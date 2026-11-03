(function(root){
  function automatic(ids,width,height){
    if(!ids.length)return null;
    if(ids.length===1)return ids[0];
    const axis=width/Math.max(1,height)>1.3?'x':'y',at=Math.ceil(ids.length/2);
    return {axis,a:automatic(ids.slice(0,at),axis==='x'?width/2:width,axis==='y'?height/2:height),b:automatic(ids.slice(at),axis==='x'?width/2:width,axis==='y'?height/2:height)};
  }
  function remove(tree,id){
    if(!tree||typeof tree==='string')return tree===id?null:tree;
    const a=remove(tree.a,id),b=remove(tree.b,id);return a&&b?{...tree,a,b}:a||b;
  }
  function dock(tree,source,target,edge){
    if(source===target||!['left','right','top','bottom'].includes(edge))return tree;
    const remaining=remove(tree,source);let found=false;
    function insert(node){
      if(node===target){found=true;const before=edge==='left'||edge==='top';return {axis:edge==='left'||edge==='right'?'x':'y',a:before?source:target,b:before?target:source};}
      return node&&typeof node!=='string'?{...node,a:insert(node.a),b:insert(node.b)}:node;
    }
    const result=insert(remaining);return found?result:tree;
  }
  function measure(tree,width,height,gap=8){
    const result={},splits=[];
    function visit(node,x,y,w,h,path=''){
      if(!node)return;
      if(typeof node==='string'){result[node]={x,y,width:Math.max(0,w),height:Math.max(0,h)};return;}
      const space=Math.min(gap,node.axis==='x'?w:h),length=(node.axis==='x'?w:h)-space,ratio=Math.max(.1,Math.min(.9,Number.isFinite(node.ratio)?node.ratio:.5)),first=length*ratio;
      splits.push({path,axis:node.axis,ratio,area:{x,y,width:w,height:h},x:node.axis==='x'?x+first:x,y:node.axis==='y'?y+first:y,width:node.axis==='x'?space:w,height:node.axis==='y'?space:h});
      if(node.axis==='x'){visit(node.a,x,y,first,h,path+'a');visit(node.b,x+first+space,y,length-first,h,path+'b');}
      else{visit(node.a,x,y,w,first,path+'a');visit(node.b,x,y+first+space,w,length-first,path+'b');}
    }
    visit(tree,0,0,Math.max(0,width),Math.max(0,height));return {rectangles:result,splits};
  }
  const rectangles=(...args)=>measure(...args).rectangles;
  const dividers=(...args)=>measure(...args).splits;
  function resize(tree,path,ratio){
    if(!tree||typeof tree==='string'||!Number.isFinite(ratio))return tree;
    if(!path)return {...tree,ratio:Math.max(.1,Math.min(.9,ratio))};
    const branch=path[0];return branch==='a'||branch==='b'?{...tree,[branch]:resize(tree[branch],path.slice(1),ratio)}:tree;
  }
  function replace(tree,id,replacement){if(typeof tree==='string')return tree===id?replacement:tree;return tree?{...tree,a:replace(tree.a,id,replacement),b:replace(tree.b,id,replacement)}:tree;}
  const api={automatic,remove,dock,rectangles,dividers,resize,replace};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MultiLayout=api;
})(globalThis);
