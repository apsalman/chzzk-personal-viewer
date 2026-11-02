const { test } = require('node:test');
const assert = require('node:assert/strict');
const { navigationPolicy } = require('./desktop/navigation.cjs');
test('official login HTTP handoff is rewritten to HTTPS with return address intact', () => {
  const result = navigationPolicy('http://nid.naver.com/login/sso/finalize.nhn?url=https%3A%2F%2Fchzzk.naver.com%2F');
  assert.equal(result.allowed, true);
  assert.equal(result.upgrade, 'https://nid.naver.com/login/sso/finalize.nhn?url=https%3A%2F%2Fchzzk.naver.com%2F');
  assert.deepEqual(navigationPolicy('https://nid.naver.com/nidlogin.login'), { allowed: true });
  for (const value of ['http://chzzk.naver.com/', 'http://nid.naver.com:8080/', 'https://nid.naver.com.example.org/', 'https://example.org/', 'javascript:alert(1)', 'https://user:pass@nid.naver.com/']) assert.equal(navigationPolicy(value).allowed, false);
});
