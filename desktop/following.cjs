const { timedFetch } = require('./network.cjs');
function normalizeFollowingLives(data) {
  const rows = data.content?.followingList;
  if (data.code !== 200 || !Array.isArray(rows)) throw new Error('팔로우 목록 응답 형식이 변경되었습니다.');
  const seen = new Set();
  return rows.flatMap(row => {
    const channel = row.channel || {};
    const live = row.liveInfo || {};
    const id = row.channelId || channel.channelId;
    const open = row.streamer?.openLive ?? channel.openLive ?? row.openLive;
    const isLive = open === true || (open !== false && (live.status === 'OPEN' || !!live.liveId || !!live.liveTitle));
    if (!/^[a-f\d]{32}$/i.test(id || '') || !isLive || seen.has(id)) return [];
    seen.add(id);
    let image = ''; try { if (new URL(channel.channelImageUrl).protocol === 'https:') image = channel.channelImageUrl; } catch {}
    return [{ channelId: id, name: channel.channelName || '방송', title: live.liveTitle || '', image }];
  });
}
async function readFollowingLives(session) {
  const response = await timedFetch(session.fetch.bind(session), 'https://api.chzzk.naver.com/service/v1/channels/followings/live', {
    credentials: 'include', cache: 'no-store'
  });
  if (response.status === 401 || response.status === 403) throw new Error('로그인 상태를 다시 확인해 주세요.');
  if (!response.ok) throw new Error('팔로우 라이브 목록을 가져오지 못했습니다.');
  return normalizeFollowingLives(await response.json());
}
module.exports = { readFollowingLives, normalizeFollowingLives };
