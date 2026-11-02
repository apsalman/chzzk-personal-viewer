import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import network from './desktop/network.cjs';

export function channelId(value) {
  if (/^[a-f\d]{32}$/i.test(value)) return value.toLowerCase();
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.hostname !== 'chzzk.naver.com') return null;
    return u.pathname.match(/^\/live\/([a-f\d]{32})(?:\/chat)?\/?$/i)?.[1].toLowerCase() || null;
  } catch { return null; }
}
export function mediaURL(value) {
  const u = new URL(value);
  const domains = ['naver.com', 'pstatic.net', 'ntruss.com', 'akamaized.net', 'cloudfront.net'];
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443') ||
    !domains.some(d => u.hostname === d || u.hostname.endsWith('.' + d)))
    throw new Error('지원하지 않는 영상 호스트입니다. 치지직 CDN의 HTTPS 주소를 입력해 주세요.');
  return u.href;
}
export function rewritePlaylist(text, base, register) {
  return text.split(/\r?\n/).map(line => {
    if (!line.trim()) return line;
    if (line.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (_, uri) => `URI="${register(new URL(uri, base).href)}"`);
    return register(new URL(line.trim(), base).href);
  }).join('\n');
}
async function upstream(url, headers = {}) {
  for (let i = 0; i < 6; i++) {
    const response = await network.timedFetch(fetch, mediaURL(url), {
      redirect: 'manual',
      headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://chzzk.naver.com/', ...headers }
    }, 25000);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new Error('영상 서버의 이동 주소가 없습니다.');
      url = new URL(location, url).href;
      continue;
    }
    return response;
  }
  throw new Error('영상 서버의 주소 이동이 너무 많습니다.');
}
export function createApp({ recorder } = {}) {
  const sources = new Map(), ids = new Map();
  function register(value) {
    const url = mediaURL(value);
    if (ids.has(url)) return '/media/' + ids.get(url);
    if (sources.size > 12000) { const first = sources.keys().next().value; ids.delete(sources.get(first)); sources.delete(first); }
    const id = randomBytes(16).toString('hex');
    sources.set(id, url); ids.set(url, id);
    return '/media/' + id;
  }
  return http.createServer(async (req, res) => {
    const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
    try {
      if (!/^127\.0\.0\.1:\d+$/.test(req.headers.host || '')) return json(403, { error: '로컬 주소로 접속해 주세요.' });
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return json(403, { error: '외부 요청은 허용되지 않습니다.' });
      if (req.headers['sec-fetch-site'] === 'cross-site') return json(403, { error: '외부 요청은 허용되지 않습니다.' });
      const u = new URL(req.url, 'http://' + req.headers.host);
      if (req.method !== 'GET') return json(405, { error: 'GET만 지원합니다.' });
      if (u.pathname === '/api/health') return json(200, { ok: true });
      if (u.pathname.startsWith('/dvr/')) {
        const resource = recorder?.resource(u.pathname);
        if (!resource) return json(404, { error: '리플레이 조각이 없거나 보관 기간이 지났습니다.' });
        if (resource.text) { res.writeHead(200, { 'Content-Type': resource.type, 'Cache-Control': 'no-store' }); return res.end(resource.text); }
        const info = await stat(resource.file);
        const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
        const start = range ? Number(range[1]) : 0, end = range?.[2] ? Math.min(Number(range[2]), info.size-1) : info.size-1;
        if (start > end || start >= info.size) { res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); return res.end(); }
        const headers = { 'Content-Type': resource.type, 'Accept-Ranges': 'bytes', 'Content-Length': end-start+1, 'Cache-Control': 'no-store' };
        if (range) headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`;
        res.writeHead(range ? 206 : 200, headers);
        await pipeline(createReadStream(resource.file, { start, end }), res); return;
      }
      if (u.pathname === '/api/source') {
        const path = u.searchParams.get('path') || '';
        const id = path.match(/^\/media\/([a-f\d]{32})$/)?.[1];
        const original = id && sources.get(id);
        return original ? json(200, { url: original }) : json(404, { error: '재생 주소가 만료되었습니다. 방송을 다시 열어 주세요.' });
      }
      if (u.pathname === '/api/resolve') {
        const value = (u.searchParams.get('url') || '').trim();
        const id = channelId(value);
        if (!id) {
          let direct; try { direct = mediaURL(value); } catch { return json(400, { error: '치지직 방송 주소 또는 지원 CDN의 m3u8 주소를 입력해 주세요.' }); }
          return json(200, { title: '직접 입력한 스트림', sources: [{ name: 'HLS', url: register(direct) }], channelId: null });
        }
        const response = await upstream(`https://api.chzzk.naver.com/service/v3/channels/${id}/live-detail`);
        if (!response.ok) throw new Error(`치지직 조회 실패 (${response.status}). 로그인이나 접근 제한이 있는 방송은 공식 페이지에서 확인해 주세요.`);
        const data = await response.json();
        if (data.code !== 200 || !data.content) throw new Error(data.message || '방송 정보를 가져오지 못했습니다.');
        const live = data.content;
        if (live.status === 'CLOSE') return json(409, { error: '현재 방송 중이 아닙니다.', channelId: id });
        let playback; try { playback = typeof live.livePlaybackJson === 'string' ? JSON.parse(live.livePlaybackJson) : live.livePlaybackJson; } catch {}
        const media = (playback?.media || []).filter(m => m.path && /hls/i.test(m.mediaId || m.protocol || m.path));
        media.sort((a, b) => Number(/LLHLS/i.test(a.mediaId)) - Number(/LLHLS/i.test(b.mediaId)));
        if (!media.length) return json(422, { error: '공개 재생 주소가 없습니다. 로그인 필요 방송이거나 API 형식이 변경됐을 수 있습니다. m3u8 직접 입력을 이용할 수 있습니다.', channelId: id });
        return json(200, { channelId: id, title: live.liveTitle, channel: live.channel?.channelName, sources: media.map(m => ({ name: m.mediaId || 'HLS', url: register(m.path) })) });
      }
      if (u.pathname.startsWith('/media/')) {
        const source = sources.get(u.pathname.slice(7));
        if (!source) return json(404, { error: '만료된 재생 주소입니다. 방송을 다시 열어 주세요.' });
        const target = new URL(source);
        for (const key of ['_HLS_msn', '_HLS_part', '_HLS_skip']) if (u.searchParams.has(key)) target.searchParams.set(key, u.searchParams.get(key));
        const headers = {};
        if (req.headers.range) headers.Range = req.headers.range;
        const response = await upstream(target.href, headers);
        if (!response.ok) { await response.body?.cancel(); return json(response.status, { error: `영상 서버 응답: ${response.status}` }); }
        const type = response.headers.get('content-type') || '';
        const playlist = /mpegurl/i.test(type) || /\.m3u8(?:\?|$)/i.test(target.href);
        if (playlist) {
          const body = await response.text();
          if (!body.trimStart().startsWith('#EXTM3U')) throw new Error('올바른 HLS 재생 목록이 아닙니다.');
          res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-store' });
          return res.end(rewritePlaylist(body, response.url || target.href, register));
        }
        const out = { 'Content-Type': type || 'application/octet-stream', 'Cache-Control': 'no-store' };
        for (const key of ['content-range', 'accept-ranges', 'content-length']) if (response.headers.has(key)) out[key] = response.headers.get(key);
        res.writeHead(response.status, out);
        const stream = Readable.fromWeb(response.body);
        // Keep transfer errors handled after a player disconnects for a PiP switch.
        stream.on('error', () => {});
        const transferTimer = setTimeout(() => stream.destroy(new Error('영상 수신 시간이 초과되었습니다.')), 30000);
        const disconnected = () => stream.destroy();
        res.once('close', disconnected);
        try { await pipeline(stream, res); }
        finally { clearTimeout(transferTimer); res.off('close', disconnected); }
        return;
      }
      const files = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/seekbar.js': ['seekbar.js', 'text/javascript'], '/player-keys.js': ['player-keys.js', 'text/javascript'], '/capture.js': ['capture.js', 'text/javascript'], '/live-handoff.js': ['live-handoff.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'], '/pip.html': ['pip.html', 'text/html'], '/pip.js': ['pip.js', 'text/javascript'], '/pip.css': ['pip.css', 'text/css'], '/vendor/hls.min.js': ['vendor/hls.min.js', 'text/javascript'] };
      const file = files[u.pathname];
      if (!file) return json(404, { error: '찾을 수 없습니다.' });
      const body = await readFile(new URL('./public/' + file[0], import.meta.url));
      res.writeHead(200, { 'Content-Type': file[1] + '; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-cache' }); res.end(body);
    } catch (error) {
      if (res.headersSent) res.destroy();
      else json(502, { error: error.cause ? '서버 연결에 실패했습니다. 인터넷 연결 및 치지직 접근 가능 여부를 확인해 주세요.' : error.message });
    }
  });
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.CHZZK_PORT || 3131);
  const server = createApp();
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? '3131 포트가 사용 중입니다. 이미 실행 중인 창을 확인해 주세요.' : error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`치지직 WebUI: http://127.0.0.1:${port}\n종료하려면 이 창에서 Ctrl+C를 누르세요.`));
}
