const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = '/media/' + 'a'.repeat(32);
const live = { channelId: 'b'.repeat(32) };
const cdn = 'https://livecloud.akamaized.net/live/master.m3u8?token=example';
function load() {
  const context = { module: { exports: {} }, fetch, AbortSignal, URL };
  vm.runInNewContext(fs.readFileSync('public/lite-source.js', 'utf8'), context);
  return context.module.exports.litePlaybackSource;
}
test('Lite public live uses the registered CDN source after a successful CORS check', async () => {
  const calls = [];
  const selected = await load()(source, live, async (url, options) => {
    calls.push({ url, options });
    return calls.length === 1 ? { ok: true, json: async () => ({ url: cdn }) } : { ok: true, text: async () => '#EXTM3U\n#EXT-X-VERSION:7' };
  });
  assert.equal(selected, cdn);
  assert.equal(calls[0].url, '/api/source?path=' + encodeURIComponent(source));
  assert.equal(calls[1].options.mode, 'cors');
  assert.equal(calls[1].options.credentials, 'omit');
  assert.equal(calls[0].options.signal, calls[1].options.signal);
});
test('VOD, direct input and unregistered sources retain the proxy without external requests', async () => {
  const request = async () => { assert.fail('Unexpected source lookup'); };
  for (const [url, data] of [[source, { ...live, kind: 'vod' }], [source, {}], [cdn, live], ['/media/invalid', live]]) {
    assert.equal(await load()(url, data, request), url);
  }
});
test('Unavailable lookup, CDN CORS/timeout failures and non-playlists fall back to the proxy', async () => {
  const choose = load();
  assert.equal(await choose(source, live, async () => ({ ok: false })), source);
  for (const response of [new Error('CORS blocked'), new DOMException('Timed out', 'TimeoutError'), { ok: false }, { ok: true, text: async () => '<html>Denied</html>' }]) {
    let calls = 0;
    assert.equal(await choose(source, live, async () => {
      if (++calls === 1) return { ok: true, json: async () => ({ url: cdn }) };
      if (response instanceof Error) throw response;
      return response;
    }), source);
  }
});
test('Invalid source URLs are rejected before a CDN request', async () => {
  for (const url of ['http://livecloud.akamaized.net/live.m3u8', 'https://user:password@livecloud.akamaized.net/live.m3u8', 'invalid']) {
    let calls = 0;
    assert.equal(await load()(source, live, async () => { calls++; return { ok: true, json: async () => ({ url }) }; }), source);
    assert.equal(calls, 1);
  }
});
