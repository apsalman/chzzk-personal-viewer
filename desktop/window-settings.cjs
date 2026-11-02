const fs = require('node:fs');
const path = require('node:path');
function readWindowSettings(file) {
  try { const value = JSON.parse(fs.readFileSync(file,'utf8')); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch { return {}; }
}
function fitWindow(saved, areas, { width, height, minWidth, minHeight, ratio } = {}) {
  const valid = saved && ['x','y','width','height'].every(k=>Number.isFinite(saved[k]));
  const bounds = valid ? saved : null;
  const overlap = (a,b) => Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
  const area = bounds ? [...areas].sort((a,b)=>overlap(bounds,b)-overlap(bounds,a))[0] : areas[0];
  let w = Math.round(Math.min(area.width,Math.max(Math.min(minWidth,area.width),bounds?.width || width)));
  let h = Math.round(Math.min(area.height,Math.max(Math.min(minHeight,area.height),bounds?.height || height)));
  if (ratio) { if (w/ratio>area.height) w=Math.floor(area.height*ratio); h=Math.round(w/ratio); }
  const x = Math.round(Math.max(area.x,Math.min(area.x+area.width-w,bounds?.x ?? area.x+(area.width-w)/2)));
  const y = Math.round(Math.max(area.y,Math.min(area.y+area.height-h,bounds?.y ?? area.y+(area.height-h)/2)));
  return { x,y,width:w,height:h };
}
function saveWindowSettings(file, settings) {
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file+'.tmp',JSON.stringify(settings)); fs.renameSync(file+'.tmp',file);
}
module.exports = { readWindowSettings, fitWindow, saveWindowSettings };
