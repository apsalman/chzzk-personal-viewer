const { test } = require('node:test');
const assert = require('node:assert/strict');
const { timedFetch } = require('./desktop/network.cjs');
test('successful response does not get aborted by a leftover timeout timer', async () => {
  let signal;
  const response = await timedFetch(async (_url, options) => { signal = options.signal; return new Response('ok'); }, 'https://example.com', {}, 10);
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(signal.aborted, false);
  assert.equal(await response.text(), 'ok');
});
test('slow headers reject normally and can be caught', async () => {
  await assert.rejects(timedFetch((_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })), 'https://example.com', {}, 10), { name: 'AbortError' });
});
