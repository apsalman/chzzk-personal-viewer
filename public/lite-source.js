(function(root) {
  async function litePlaybackSource(source, data, request = root.fetch.bind(root)) {
    // VOD needs the proxy's signed-URL rewriting. Only public channel lives
    // can try the CDN's own CORS support without the binary loopback relay.
    if (data?.kind === 'vod' || !/^[a-f\d]{32}$/i.test(data?.channelId || '') || !/^\/media\/[a-f\d]{32}$/.test(source || '')) return source;
    try {
      const signal = AbortSignal.timeout(2500);
      const lookup = await request('/api/source?path=' + encodeURIComponent(source), { signal });
      if (!lookup.ok) return source;
      const { url } = await lookup.json(), target = new URL(url);
      if (target.protocol !== 'https:' || target.username || target.password) return source;
      const response = await request(target.href, { mode: 'cors', credentials: 'omit', signal });
      if (response.ok && (await response.text()).trimStart().startsWith('#EXTM3U')) return target.href;
    } catch {}
    return source;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { litePlaybackSource };
  else root.litePlaybackSource = litePlaybackSource;
})(globalThis);
