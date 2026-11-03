(function(root){
  function automatic(ids,width,height){
    if(!ids.length)return null;
    if(ids.length===1)return ids[0];
    const axis=width/Math.max(1,height)>1.3?'x':'y',at=Math.ceil(ids.length/2);
    return {axis,a:automatic(ids.slice(0,at),axis==='x'?width/2:width,axis==='y'?height/2:height),b:automatic(ids.slice(at),axis==='x'?width/2:width,axis==='y'?height/2:height)};
  }
  function remove(tree,id){
    if(!tree||typeof tree==='string')return tree===id?null:tree;
    const a=remove(tree.a,id),b=remove(tree.b,id);return a&&b?{axis:tree.axis,a,b}:a||b;
  }
  function dock(tree,source,target,edge){
    if(source===target||!['left','right','top','bottom'].includes(edge))return tree;
    const remaining=remove(tree,source);let found=false;
    function insert(node){
      if(node===target){found=true;const before=edge==='left'||edge==='top';return {axis:edge==='left'||edge==='right'?'x':'y',a:before?source:target,b:before?target:source};}
      return node&&typeof node!=='string'?{axis:node.axis,a:insert(node.a),b:insert(node.b)}:node;
    }
    const result=insert(remaining);return found?result:tree;
  }
  function rectangles(tree,width,height,gap=8){
    const result={};
    function visit(node,x,y,w,h){
      if(!node)return;
      if(typeof node==='string'){result[node]={x,y,width:Math.max(0,w),height:Math.max(0,h)};return;}
      const space=Math.min(gap,node.axis==='x'?w:h),half=((node.axis==='x'?w:h)-space)/2;
      if(node.axis==='x'){visit(node.a,x,y,half,h);visit(node.b,x+half+space,y,half,h);}
      else{visit(node.a,x,y,w,half);visit(node.b,x,y+half+space,w,half);}
    }
    visit(tree,0,0,Math.max(0,width),Math.max(0,height));return result;
  }
  const api={automatic,remove,dock,rectangles};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MultiLayout=api;
})(globalThis);
