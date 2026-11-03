import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import network from './desktop/network.cjs';
import directory from './desktop/live-directory.cjs';

export function videoId(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && u.hostname === 'chzzk.naver.com' && !u.username && !u.password ? u.pathname.match(/^\/video\/(\d+)\/?$/)?.[1] || null : null; } catch { return null; }
}
export function vodSources(meta, playback) {
  const result = [];
  const add = (url, name = 'HLS') => { if (url && !result.some(s => s.url === url)) result.push({ name, url: mediaURL(url) }); };
  let rewind = meta.liveRewindPlaybackJson;
  if (typeof rewind === 'string') { try { rewind = JSON.parse(rewind); } catch { rewind = null; } }
  for (const item of rewind?.media || []) if (/hls/i.test(item.mediaId || item.protocol || item.path || '')) add(item.path, item.mediaId || 'HLS');
  for (const period of playback?.period || []) for (const adaptation of period.adaptationSet || []) {
    add(adaptation.otherAttributes?.m3u);
  }
  return result;
}
export function vodMediaURL(value, base, signed = new Map()) {
  const url = new URL(value, base), parent = new URL(base);
  const replacement = signed.get(url.origin + url.pathname);
  if (!url.search && replacement) return replacement;
  // VOD playlists omit the CDN signature on relative children. Preserve only
  // this known token, within the same CDN directory, never across hosts.
  if (!url.search && url.origin === parent.origin && url.pathname.startsWith(parent.pathname.slice(0, parent.pathname.lastIndexOf('/') + 1)) && parent.searchParams.has('__gda__')) url.searchParams.set('__gda__', parent.searchParams.get('__gda__'));
  return url.href;
}
export function vodPreview(playback) {
  const candidates = [];
  for (const period of playback?.period || []) for (const adaptation of period.adaptationSet || []) {
    if (adaptation.mimeType !== 'video/mp4') continue;
    for (const rep of adaptation.representation || []) {
      const url = rep.baseURL?.[0]?.value;
      if (url && /\.mp4(?:\?|$)/i.test(url)) candidates.push({ url: mediaURL(url), height: rep.height || Infinity, bitrate: rep.bandwidth || Infinity });
    }
  }
  candidates.sort((a,b) => a.height-b.height || a.bitrate-b.bitrate);
  return candidates[0]?.url || null;
}

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
  const directoryCache=new Map();
  const liveInfoCache=new Map();
  const sources = new Map(), ids = new Map(), vodContexts = new Map();
  function register(value, context) {
    const url = mediaURL(value);
    if (ids.has(url)) { const id = ids.get(url); if (context) vodContexts.set(id, context); return '/media/' + id; }
    if (sources.size > 24000) { const first = sources.keys().next().value; ids.delete(sources.get(first)); sources.delete(first); vodContexts.delete(first); }
    const id = randomBytes(16).toString('hex');
    sources.set(id, url); ids.set(url, id);
    if (context) vodContexts.set(id, context);
    return '/media/' + id;
  }
  const server = http.createServer(async (req, res) => {
    const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
    try {
      if (!/^127\.0\.0\.1:\d+$/.test(req.headers.host || '')) return json(403, { error: '로컬 주소로 접속해 주세요.' });
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return json(403, { error: '외부 요청은 허용되지 않습니다.' });
      if (req.headers['sec-fetch-site'] === 'cross-site') return json(403, { error: '외부 요청은 허용되지 않습니다.' });
      const u = new URL(req.url, 'http://' + req.headers.host);
      if (req.method !== 'GET') return json(405, { error: 'GET만 지원합니다.' });
      if (u.pathname === '/api/health') return json(200, { ok: true });
      if(u.pathname==='/api/live-info'){
        const id=u.searchParams.get('id');if(!/^[a-f\d]{32}$/i.test(id||''))return json(400,{error:'잘못된 채널 ID입니다.'});
        const cached=liveInfoCache.get(id);if(cached&&Date.now()-cached.time<15000)return json(200,cached.data);
        const response=await upstream(`https://api.chzzk.naver.com/service/v3/channels/${id}/live-detail`);
        if(!response.ok)return json(502,{error:'방송 정보를 갱신하지 못했습니다.'});
        const result=await response.json();if(result.code!==200||!result.content)return json(502,{error:'방송 정보를 갱신하지 못했습니다.'});
        const data=directory.liveInfo(result.content,id);liveInfoCache.set(id,{time:Date.now(),data});if(liveInfoCache.size>32)liveInfoCache.delete(liveInfoCache.keys().next().value);return json(200,data);
      }
      if(u.pathname==='/api/lives'){
        let address;try{address=directory.directoryURL(u.searchParams.get('sort')||'viewers',u.searchParams.get('next')||'');}catch(error){return json(400,{error:error.message});}
        const cached=directoryCache.get(address);if(cached&&Date.now()-cached.time<15000)return json(200,cached.data);
        const response=await upstream(address);if(!response.ok)return json(502,{error:'방송 목록을 가져오지 못했습니다. 잠시 후 새로고침하세요.'});
        const data=directory.normalizeLives(await response.json());directoryCache.set(address,{time:Date.now(),data});if(directoryCache.size>128)directoryCache.delete(directoryCache.keys().next().value);return json(200,data);
      }
      if (u.pathname === '/api/vod-chat') {
        const id = u.searchParams.get('id'), time = Number(u.searchParams.get('time'));
        if (!/^\d+$/.test(id || '') || !Number.isSafeInteger(time) || time < 0) return json(400, { error: '잘못된 다시보기 채팅 요청입니다.' });
        const response = await upstream(`https://api.chzzk.naver.com/service/v1/videos/${id}/chats?playerMessageTime=${time}&previousVideoChatSize=50`);
        if (!response.ok) return json(response.status, { error: '과거 채팅을 가져오지 못했습니다.' });
        const data = await response.json();
        if (data.code !== 200 || !data.content) return json(502, { error: data.message || '과거 채팅이 제공되지 않습니다.' });
        const normalize = rows => (rows || []).filter(row => row.messageStatusType === 'NORMAL' && Number.isFinite(row.playerMessageTime)).map(row => {
          let profile; try { profile = typeof row.profile === 'string' ? JSON.parse(row.profile) : row.profile; } catch {}
          let extras; try { extras = typeof row.extras === 'string' ? JSON.parse(row.extras) : row.extras; } catch {}
          const emojis = {};
          for (const [key, value] of Object.entries(extras?.emojis || {})) {
            try { const url = new URL(value); if (url.protocol === 'https:' && (url.hostname === 'pstatic.net' || url.hostname.endsWith('.pstatic.net'))) emojis[key] = url.href; } catch {}
          }
          return { time: row.playerMessageTime, nickname: profile?.nickname || '시청자', text: String(row.content || ''), ...(Object.keys(emojis).length ? { emojis } : {}) };
        });
        return json(200, { previous: normalize(data.content.previousVideoChats), messages: normalize(data.content.videoChats), next: data.content.nextPlayerMessageTime });
      }
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
        const vod = videoId(value);
        if (vod) {
          const response = await upstream(`https://api.chzzk.naver.com/service/v3/videos/${vod}`);
          if (!response.ok) return json(response.status, { error: '다시보기 정보를 가져오지 못했습니다. 공개 여부와 시청 권한을 확인해 주세요.' });
          const data = await response.json(), meta = data.content;
          if (data.code !== 200 || !meta) throw new Error(data.message || '다시보기 정보가 없습니다.');
          let playback;
          if (!vodSources(meta).length && meta.videoId && meta.inKey) {
            const result = await upstream(`https://apis.naver.com/neonplayer/vodplay/v1/playback/${encodeURIComponent(meta.videoId)}?key=${encodeURIComponent(meta.inKey)}`);
            if (!result.ok) throw new Error('다시보기 재생 정보를 가져오지 못했습니다.');
            playback = await result.json();
          }
          const sources = vodSources(meta, playback);
          if (!sources.length) return json(422, { error: '이 다시보기에서 지원 가능한 HLS 재생 주소를 찾지 못했습니다.' });
          const signed = new Map();
          signed.videoId = vod;
          for (const period of playback?.period || []) for (const adaptation of period.adaptationSet || []) for (const rep of adaptation.representation || []) {
            if (rep.otherAttributes?.m3u) { const url = new URL(mediaURL(rep.otherAttributes.m3u)); signed.set(url.origin + url.pathname, url.href); }
          }
          const previewURL = vodPreview(playback);
          return json(200, { kind: 'vod', videoId: vod, duration: meta.duration, preview: { url: register(previewURL || sources[0].url, signed), type: previewURL ? 'mp4' : 'hls' }, chatEnabled: meta.videoChatEnabled === true, title: meta.videoTitle, channel: meta.channel?.channelName, channelId: meta.channel?.channelId, sources: sources.map(s => ({ ...s, url: register(s.url, signed) })) });
        }
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
        return json(200, { channelId: id, title: live.liveTitle, channel: live.channel?.channelName, liveInfo:directory.liveInfo(live,id), sources: media.map(m => ({ name: m.mediaId || 'HLS', url: register(m.path) })) });
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
          const context = vodContexts.get(u.pathname.slice(7));
          return res.end(rewritePlaylist(body, response.url || target.href, value => register(context ? vodMediaURL(value, response.url || target.href, context) : value, context)));
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
      files['/vod-chat.js'] = ['vod-chat.js', 'text/javascript'];
      files['/vod-download.js'] = ['vod-download.js', 'text/javascript'];
      files['/seek-preview.js'] = ['seek-preview.js', 'text/javascript'];
      files['/captions.js'] = ['captions.js', 'text/javascript'];
      files['/multi-view.js'] = ['multi-view.js', 'text/javascript'];
      files['/multi-layout.js'] = ['multi-layout.js', 'text/javascript'];
      files['/multi-view.css'] = ['multi-view.css', 'text/css'];
      files['/home.js'] = ['home.js', 'text/javascript'];
      files['/home-rules.js'] = ['home-rules.js', 'text/javascript'];
      files['/home.css'] = ['home.css', 'text/css'];
      files['/live-info.js'] = ['live-info.js', 'text/javascript'];
      files['/caption-timeline.js'] = ['caption-timeline.js', 'text/javascript'];
      files['/caption-worklet.js'] = ['caption-worklet.js', 'text/javascript'];
      files['/assets/logo.png'] = ['assets/logo.png', 'image/png'];
      files['/assets/app.ico'] = ['assets/app.ico', 'image/x-icon'];
      const file = files[u.pathname];
      if (!file) return json(404, { error: '찾을 수 없습니다.' });
      const body = await readFile(new URL('./public/' + file[0], import.meta.url));
      res.writeHead(200, { 'Content-Type': file[1] + '; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-cache' }); res.end(body);
    } catch (error) {
      if (res.headersSent) res.destroy();
      else json(502, { error: error.cause ? '서버 연결에 실패했습니다. 인터넷 연결 및 치지직 접근 가능 여부를 확인해 주세요.' : error.message });
    }
  });
  server.vodSource = (value, video) => {
    const id = typeof value === 'string' && value.match(/^\/media\/([a-f\d]{32})$/)?.[1];
    const source = id && sources.get(id);
    return source && vodContexts.get(id)?.videoId === video && /\.m3u8$/i.test(new URL(source).pathname) ? value : null;
  };
  server.liveAudioSource = value => {
    const id = typeof value === 'string' && value.match(/^\/media\/([a-f\d]{32})$/)?.[1];
    return id && sources.has(id) && !vodContexts.has(id) ? value : null;
  };
  server.vodAudioSource = (value, video) => {
    const id = typeof value === 'string' && value.match(/^\/media\/([a-f\d]{32})$/)?.[1];
    const source = id && sources.get(id);
    return source && vodContexts.get(id)?.videoId === video && /\.(?:m3u8|mp4)$/i.test(new URL(source).pathname) ? {path:value,hls:/\.m3u8$/i.test(new URL(source).pathname)} : null;
  };
  return server;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.CHZZK_PORT || 3131);
  const server = createApp();
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? '3131 포트가 사용 중입니다. 이미 실행 중인 창을 확인해 주세요.' : error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`치지직 WebUI: http://127.0.0.1:${port}\n종료하려면 이 창에서 Ctrl+C를 누르세요.`));
}
