function isLoginPage(value) {
  try { return new URL(value).hostname === 'nid.naver.com'; } catch { return false; }
}
function isChzzkReturn(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && u.hostname === 'chzzk.naver.com' &&
      (u.pathname === '/' || /^\/(?:live|lives|chat)(?:\/|$)/.test(u.pathname));
  } catch { return false; }
}
function watchLoginReturn(contents, onReturn, expectedLogin = false) {
  let loginSeen = expectedLogin;
  const observe = value => { if (isLoginPage(value)) loginSeen = true; };
  const finished = () => {
    const url = contents.getURL();
    observe(url);
    if (loginSeen && isChzzkReturn(url)) {
      loginSeen = false;
      onReturn();
    }
  };
  contents.on('did-start-navigation', (_event, url, _inPlace, isMainFrame) => { if (isMainFrame !== false) observe(url); });
  contents.on('did-navigate', (_event, url) => observe(url));
  contents.on('did-finish-load', finished);
  contents.on('did-navigate-in-page', (_event, _url, isMainFrame) => { if (isMainFrame !== false) finished(); });
  observe(contents.getURL());
}
module.exports = { watchLoginReturn };
