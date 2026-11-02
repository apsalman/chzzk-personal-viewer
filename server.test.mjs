import { test } from 'node:test';
import assert from 'node:assert/strict';
import { channelId, mediaURL, rewritePlaylist, createApp } from './server.mjs';

test('channel links and input validation', () => {
  const id = 'c7ded8ea6b0605d3c78e18650d2df83b';
  assert.equal(channelId(`https://chzzk.naver.com/live/${id}/chat`), id);
  assert.equal(channelId(`https://chzzk.naver.com/live/${id}?foo=bar`), id);
  assert.equal(channelId(`https://example.com/live/${id}`), null);
  for (const url of ['https://127.0.0.1/a', 'https://naver.com.example.com/a', 'http://naver.com/a', 'https://user:pass@naver.com/a']) assert.throws(() => mediaURL(url));
});
test('nested playlists, encryption keys, byte ranges and signed URLs retain their meaning', () => {
  const urls = [];
  const source = '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin?token=a%2Fb"\n#EXT-X-MAP:URI="init.mp4"\n#EXT-X-BYTERANGE:100@200\n../chunk.ts?sig=x%2By\n';
  const result = rewritePlaylist(source, 'https://video.naver.com/live/720/index.m3u8', u => { urls.push(u); return '/media/' + urls.length; });
  assert.deepEqual(urls, ['https://video.naver.com/live/720/key.bin?token=a%2Fb', 'https://video.naver.com/live/720/init.mp4', 'https://video.naver.com/live/chunk.ts?sig=x%2By']);
  assert.match(result, /URI="\/media\/1"/);
  assert.match(result, /#EXT-X-BYTERANGE:100@200\n\/media\/3/);
});
test('server resolves live sources and proxies nested playlists and segment ranges', async t => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), headers: options.headers });
    if (String(url).includes('live-detail')) return Response.json({ code: 200, content: { status: 'OPEN', liveTitle: 'Test', channel: { channelName: 'Channel' }, livePlaybackJson: JSON.stringify({ media: [{ mediaId: 'HLS', path: 'https://video.naver.com/master.m3u8' }] }) } });
    if (String(url).includes('master.m3u8')) return new Response('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000000\n720/index.m3u8\n', { headers: { 'content-type': 'application/vnd.apple.mpegurl' } });
    if (String(url).includes('index.m3u8')) return new Response('#EXTM3U\n#EXTINF:3,\nsegment.ts\n', { headers: { 'content-type': 'application/vnd.apple.mpegurl' } });
    return new Response(new Uint8Array([1, 2, 3]), { status: 206, headers: { 'content-type': 'video/mp2t', 'content-range': 'bytes 0-2/3' } });
  };
  const server = createApp();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { globalThis.fetch = originalFetch; server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await originalFetch(base + '/api/resolve?url=c7ded8ea6b0605d3c78e18650d2df83b');
  const live = await response.json(); assert.equal(live.title, 'Test');
  const master = await (await originalFetch(base + live.sources[0].url)).text();
  const child = master.split('\n').find(l => l.startsWith('/media/'));
  const original = await (await originalFetch(base + '/api/source?path=' + encodeURIComponent(child))).json();
  assert.equal(original.url, 'https://video.naver.com/720/index.m3u8');
  assert.equal((await originalFetch(base + '/api/source?path=https://example.com/')).status, 404);
  const playlist = await (await originalFetch(base + child)).text();
  const segment = playlist.split('\n').find(l => l.startsWith('/media/'));
  const bytes = await originalFetch(base + segment, { headers: { Range: 'bytes=0-2' } });
  assert.equal(bytes.status, 206); assert.equal(bytes.headers.get('content-range'), 'bytes 0-2/3');
  assert.deepEqual([...new Uint8Array(await bytes.arrayBuffer())], [1, 2, 3]);
  assert.equal(calls.at(-1).headers.Range, 'bytes=0-2');
  assert.equal((await originalFetch(base + '/api/resolve?url=https://127.0.0.1/a')).status, 400);
  assert.equal((await originalFetch(base + '/api/health', { headers: { Origin: 'https://example.com' } })).status, 403);
});
test('disconnecting a player during a segment transfer leaves the server usable', async t => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]));
      setTimeout(() => controller.error(new DOMException('Transfer timed out', 'TimeoutError')), 30);
    }
  }), { headers: { 'content-type': 'video/mp2t' } });
  const server = createApp();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { globalThis.fetch = originalFetch; server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const info = await (await originalFetch(base + '/api/resolve?url=https%3A%2F%2Fvideo.naver.com%2Fslow.ts')).json();
  const response = await originalFetch(base + info.sources[0].url);
  const reader = response.body.getReader();
  await reader.read(); await reader.cancel();
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.deepEqual(await (await originalFetch(base + '/api/health')).json(), { ok: true });
});
