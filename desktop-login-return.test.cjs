const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { watchLoginReturn } = require('./desktop/login-return.cjs');
class Page extends EventEmitter {
  url = 'about:blank';
  getURL() { return this.url; }
  visit(url) {
    this.url = url;
    this.emit('did-start-navigation', {}, url, false, true);
    this.emit('did-navigate', {}, url);
    this.emit('did-finish-load');
  }
}
test('login popup completes once on return to CHZZK home or chat', () => {
  for (const destination of ['https://chzzk.naver.com/', 'https://chzzk.naver.com/lives', 'https://chzzk.naver.com/live/channel/chat']) {
    const page = new Page(); let closed = 0;
    watchLoginReturn(page, () => closed++, true);
    page.visit('https://nid.naver.com/nidlogin.login');
    page.visit('https://nid.naver.com/login/sso/finalize.nhn');
    assert.equal(closed, 0);
    page.visit(destination);
    page.emit('did-finish-load');
    assert.equal(closed, 1);
  }
});
test('login started in chat input returns to latest channel instead of staying on home', () => {
  const page = new Page();
  const target = 'https://chzzk.naver.com/live/current-channel/chat';
  let restored = 0;
  watchLoginReturn(page, () => { restored++; page.visit(target); });
  page.visit(target);
  assert.equal(restored, 0);
  page.visit('https://nid.naver.com/nidlogin.login');
  page.visit('https://chzzk.naver.com/login');
  assert.equal(restored, 0);
  page.visit('https://chzzk.naver.com/');
  assert.equal(restored, 1);
  assert.equal(page.getURL(), target);
});
test('in-page return is handled but a login subframe cannot complete the flow', () => {
  const page = new Page(); let returned = 0;
  watchLoginReturn(page, () => returned++);
  page.url = 'https://chzzk.naver.com/';
  page.emit('did-start-navigation', {}, 'https://nid.naver.com/nidlogin.login', false, false);
  page.emit('did-finish-load');
  assert.equal(returned, 0);
  page.visit('https://nid.naver.com/nidlogin.login');
  page.url = 'https://chzzk.naver.com/';
  page.emit('did-navigate-in-page', {}, page.url, true);
  assert.equal(returned, 1);
});
