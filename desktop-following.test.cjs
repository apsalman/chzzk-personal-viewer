const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeFollowingLives, readFollowingLives } = require('./desktop/following.cjs');
const liveId = '11111111111111111111111111111111';
const offlineId = '22222222222222222222222222222222';
test('following list keeps live followed channels, removes offline and duplicate entries', () => {
  const live = { channelId: liveId, channel: { channelName: 'Live', channelImageUrl: 'https://example.com/avatar.png' }, streamer: { openLive: true }, liveInfo: { liveTitle: 'On air' } };
  const result = normalizeFollowingLives({ code: 200, content: { followingList: [live, live, { channelId: offlineId, streamer: { openLive: false }, liveInfo: { liveTitle: 'Old broadcast' } }, { channelId: 'bad', streamer: { openLive: true } }] } });
  assert.deepEqual(result, [{ channelId: liveId, name: 'Live', title: 'On air', image: 'https://example.com/avatar.png' }]);
});
test('empty list is valid, malformed response is reported, avatar accepts HTTPS only', () => {
  assert.deepEqual(normalizeFollowingLives({ code: 200, content: { followingList: [] } }), []);
  assert.throws(() => normalizeFollowingLives({ code: 200, content: {} }));
  const result = normalizeFollowingLives({ code: 200, content: { followingList: [{ channel: { channelId: liveId, openLive: true, channelImageUrl: 'javascript:alert(1)' } }] } });
  assert.equal(result[0].image, '');
});
test('following request uses the dedicated logged-in session and reports expired login', async () => {
  await assert.rejects(readFollowingLives({ fetch: async () => new Response('', { status: 401 }) }));
  const list = await readFollowingLives({ fetch: async (url, options) => { assert.match(url, /followings\/live$/); assert.equal(options.credentials, 'include'); return Response.json({ code: 200, content: { followingList: [] } }); } });
  assert.deepEqual(list, []);
});
