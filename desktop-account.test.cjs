const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readLoginState, logoutAccount } = require('./desktop/account.cjs');
test('account state uses server confirmation instead of presence of cookies', async () => {
  for (const value of [true, false]) {
    const session = { fetch: async (_url, options) => { assert.equal(options.credentials, 'include'); return Response.json({ code: 200, content: { loggedIn: value } }); } };
    assert.equal(await readLoginState(session), value);
  }
  await assert.rejects(readLoginState({ fetch: async () => Response.json({ code: 200, content: {} }) }));
});
test('logout requests server signout, clears the dedicated app session and verifies signout', async () => {
  const calls = [];
  const session = {
    fetch: async url => { calls.push(url.includes('nidlogin.logout') ? 'signout' : 'verify'); return Response.json({ code: 200, content: { loggedIn: false } }); },
    clearStorageData: async options => { assert.ok(options.storages.includes('cookies')); calls.push('clear'); },
    cookies: { flushStore: async () => calls.push('flush') }
  };
  assert.equal(await logoutAccount(session), false);
  assert.deepEqual(calls, ['signout', 'clear', 'flush', 'verify']);
});
test('unavailable logout endpoint still removes the local session, but a still-signed-in response is rejected', async () => {
  let cleared = false;
  const session = {
    fetch: async url => { if (url.includes('nidlogin.logout')) throw new Error('offline'); return Response.json({ code: 200, content: { loggedIn: true } }); },
    clearStorageData: async () => { cleared = true; }, cookies: { flushStore: async () => {} }
  };
  await assert.rejects(logoutAccount(session)); assert.equal(cleared, true);
});
