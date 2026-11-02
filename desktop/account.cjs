const STATUS_URL = 'https://comm-api.game.naver.com/nng_main/v1/user/getUserStatus';
const { timedFetch } = require('./network.cjs');
async function readLoginState(session) {
  const response = await timedFetch(session.fetch.bind(session), STATUS_URL, { credentials: 'include', cache: 'no-store' });
  if (!response.ok) throw new Error('로그인 상태를 확인하지 못했습니다.');
  const data = await response.json();
  if (data.code !== 200 || typeof data.content?.loggedIn !== 'boolean') throw new Error('로그인 상태 응답을 확인하지 못했습니다.');
  return data.content.loggedIn;
}
async function logoutAccount(session) {
  // This session belongs exclusively to the app's official chat and login views.
  // Ask Naver to sign out, then remove the app session's persisted login state.
  try {
    const response = await timedFetch(session.fetch.bind(session), 'https://nid.naver.com/nidlogin.logout?returl=https%3A%2F%2Fchzzk.naver.com%2F', {
      credentials: 'include'
    });
    await response.body?.cancel();
  } catch {}
  await session.clearStorageData({ storages: ['cookies', 'localstorage', 'indexdb', 'cachestorage', 'serviceworkers'] });
  await session.cookies.flushStore();
  const loggedIn = await readLoginState(session);
  if (loggedIn) throw new Error('로그아웃을 확인하지 못했습니다. 다시 시도해 주세요.');
  return false;
}
module.exports = { readLoginState, logoutAccount };
