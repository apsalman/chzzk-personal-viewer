const fs = require('node:fs');
const path = require('node:path');
function normalizeViewingState(value) {
  if (!value || typeof value.address !== 'string') return null;
  try {
    const url = new URL(/^[a-f\d]{32}$/i.test(value.address) ? `https://chzzk.naver.com/live/${value.address}` : value.address);
    if (url.protocol !== 'https:' || url.hostname !== 'chzzk.naver.com' || url.port || url.username || url.password) return null;
    const vod = url.pathname.match(/^\/video\/(\d+)\/?$/), live = url.pathname.match(/^\/live\/([a-f\d]{32})(?:\/chat)?\/?$/i);
    if (!vod && !live) return null;
    const kind = vod ? 'vod' : 'live';
    return { kind, address: `https://chzzk.naver.com/${vod ? 'video/' + vod[1] : 'live/' + live[1].toLowerCase()}`, position: kind === 'vod' && Number.isFinite(value.position) ? Math.max(0, value.position) : 0 };
  } catch { return null; }
}
function readViewingState(file) {
  try { return normalizeViewingState(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch { return null; }
}
function saveViewingState(file, value) {
  const state = normalizeViewingState(value);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.tmp', JSON.stringify(state)); fs.renameSync(file + '.tmp', file);
  return state;
}
module.exports = { normalizeViewingState, readViewingState, saveViewingState };
