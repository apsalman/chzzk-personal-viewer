function navigationPolicy(value) {
  if (value === 'about:blank') return { allowed: true };
  try {
    const u = new URL(value);
    if (u.username || u.password) return { allowed: false };
    const naver = u.hostname === 'naver.com' || u.hostname.endsWith('.naver.com');
    if (u.protocol === 'https:' && naver) return { allowed: true };
    // Support the official login service's legacy HTTP handoff without sending
    // any HTTP request: the session rewrites it to HTTPS before network I/O.
    if (u.protocol === 'http:' && u.hostname === 'nid.naver.com' && !u.port) {
      u.protocol = 'https:';
      return { allowed: true, upgrade: u.href };
    }
  } catch {}
  return { allowed: false };
}
module.exports = { navigationPolicy };
