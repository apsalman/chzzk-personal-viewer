import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { videoId, vodSources, vodMediaURL, createApp } from './server.mjs';
function load(file) { const context = { module: { exports: {} } }; vm.runInNewContext(readFileSync(new URL(file, import.meta.url), 'utf8'), context); return context.module.exports; }
const { visibleMessages } = load('./public/vod-chat.js');
const { describePoint } = load('./public/seekbar.js');

test('VOD URLs are distinguished from live and foreign URLs', () => {
  assert.equal(videoId('https://chzzk.naver.com/video/15975252?foo=bar'), '15975252');
  for (const url of ['https://example.com/video/123', 'http://chzzk.naver.com/video/123', 'https://chzzk.naver.com/live/123', 'https://user:pass@chzzk.naver.com/video/123']) assert.equal(videoId(url), null);
});
test('VOD playback supports rewind JSON and Neon HLS manifests, rejecting foreign media', () => {
  assert.equal(vodSources({ liveRewindPlaybackJson: JSON.stringify({ media: [{ mediaId: 'HLS', path: 'https://video.naver.com/rewind.m3u8' }] }) })[0].url, 'https://video.naver.com/rewind.m3u8');
  const playback = { period: [{ adaptationSet: [{ otherAttributes: { m3u: 'https://video.naver.com/master.m3u8' } }] }] };
  assert.equal(vodSources({}, playback)[0].url, 'https://video.naver.com/master.m3u8');
  assert.throws(() => vodSources({ liveRewindPlaybackJson: { media: [{ mediaId: 'HLS', path: 'https://example.com/media.m3u8' }] } }));
});
test('chat timeline hides future messages, rewinds and limits rendered history', () => {
  const rows = Array.from({ length: 300 }, (_, i) => ({ time: i * 1000, text: String(i) }));
  assert.deepEqual(visibleMessages(rows, 2500).map(r => r.text), ['0','1','2']);
  assert.equal(visibleMessages(rows, 250000).length, 150);
  assert.deepEqual(visibleMessages(rows, 500).map(r => r.text), ['0']);
  assert.equal(describePoint(60, 30, 120, true).position, '1:00 / 2:00');
});
test('VOD CDN signatures survive nested playlists without leaking to other hosts', () => {
  const base = 'https://video.naver.com/vod/master.m3u8?__gda__=master';
  const signed = new Map([['https://video.naver.com/vod/1080.m3u8', 'https://video.naver.com/vod/1080.m3u8?__gda__=quality']]);
  assert.equal(vodMediaURL('1080.m3u8', base, signed), 'https://video.naver.com/vod/1080.m3u8?__gda__=quality');
  assert.equal(vodMediaURL('part.ts', 'https://video.naver.com/vod/1080.m3u8?__gda__=quality'), 'https://video.naver.com/vod/part.ts?__gda__=quality');
  assert.equal(vodMediaURL('https://other.naver.com/part.ts', base), 'https://other.naver.com/part.ts');
  assert.equal(vodMediaURL('part.ts?token=own', base), 'https://video.naver.com/vod/part.ts?token=own');
});
test('VOD resolve and chat proxy return usable sources and sanitized timeline data', async t => {
  const original = globalThis.fetch;
  globalThis.fetch = async url => {
    const path = String(url);
    if (path.includes('/chats?')) return Response.json({ code: 200, content: { previousVideoChats: [], videoChats: [
      { playerMessageTime: 2000, messageStatusType: 'NORMAL', profile: '{"nickname":"name"}', content: '<script>text</script>', extras: 'private' },
      { playerMessageTime: 3000, messageStatusType: 'HIDDEN', content: 'hidden' }
    ], nextPlayerMessageTime: 4000 } });
    if (path.includes('/videos/')) return Response.json({ code: 200, content: { videoTitle: 'Replay', videoId: 'internal', inKey: 'key', duration: 123, videoChatEnabled: true } });
    return Response.json({ period: [{ adaptationSet: [{ otherAttributes: { m3u: 'https://video.naver.com/master.m3u8' } }] }] });
  };
  const server = createApp(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { globalThis.fetch = original; server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const vod = await (await original(base + '/api/resolve?url=https://chzzk.naver.com/video/15975252')).json();
  assert.equal(vod.kind, 'vod'); assert.equal(vod.videoId, '15975252'); assert.equal(vod.duration, 123); assert.match(vod.sources[0].url, /^\/media\//);
  assert.equal(server.vodSource(vod.sources[0].url, '15975252'), vod.sources[0].url);
  assert.equal(server.vodSource(vod.sources[0].url, '999'), null);
  assert.equal(server.vodSource('https://example.com/file.m3u8', '15975252'), null);
  const chat = await (await original(base + '/api/vod-chat?id=15975252&time=1000')).json();
  assert.deepEqual(chat.messages, [{ time: 2000, nickname: 'name', text: '<script>text</script>' }]);
  assert.equal(chat.next, 4000);
  assert.equal((await original(base + '/api/vod-chat?id=../bad&time=-1')).status, 400);
});
