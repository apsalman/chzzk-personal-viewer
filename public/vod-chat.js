(function(root) {
  function visibleMessages(rows, time) { return rows.filter(row => row.time <= time).slice(-150); }
  function installVodChat(video, container) {
    let id = null, revision = 0, controller, rows = [], covered = -1, lastTime = -1, busy = false, retryAt = 0, enabled = true;
    const note = document.createElement('p'), list = document.createElement('div');
    note.className = 'vod-chat-status'; list.className = 'vod-chat-list'; container.append(note, list);
    let signature = '';
    function render(time) {
      const shown = visibleMessages(rows, time), key = JSON.stringify(shown);
      if (key === signature) return; signature = key;
      list.replaceChildren(...shown.map(row => {
        const line = document.createElement('p'), name = document.createElement('strong');
        name.textContent = row.nickname + ': '; line.append(name);
        for (const part of row.text.split(/(\{:[\w-]+:\})/)) {
          const key = part.match(/^\{:([\w-]+):\}$/)?.[1], url = row.emojis?.[key];
          if (url) { const img = document.createElement('img'); img.src = url; img.alt = part; img.className = 'chat-emoji'; img.referrerPolicy = 'no-referrer'; line.append(img); }
          else line.append(document.createTextNode(part));
        }
        return line;
      }));
      list.scrollTop = list.scrollHeight;
    }
    async function tick() {
      if (!id || !enabled) return;
      const time = Math.max(0, Math.floor(video.currentTime * 1000));
      const seek = lastTime >= 0 && (time < lastTime - 750 || time > lastTime + 10000);
      lastTime = time;
      if (seek) { revision++; controller?.abort(); busy = false; rows = []; covered = -1; retryAt = 0; signature = ''; list.replaceChildren(); }
      render(time);
      if (busy || Date.now() < retryAt || covered > time + 15000) return;
      const run = revision, start = covered >= time ? covered : time;
      const requestController = controller = new AbortController(); busy = true;
      const timer = setTimeout(() => requestController.abort(), 15000);
      try {
        const response = await fetch(`/api/vod-chat?id=${id}&time=${start}`, { signal: requestController.signal });
        const data = await response.json();
        if (run !== revision) return;
        if (!response.ok) throw new Error(data.error || '채팅 조회 실패');
        const combined = [...rows, ...(rows.length ? [] : data.previous), ...data.messages];
        const seen = new Set();
        rows = combined.filter(row => { const key = JSON.stringify(row); if (seen.has(key)) return false; seen.add(key); return true; }).sort((a,b) => a.time-b.time);
        // Keep a bounded history, retaining the most recent messages before the cursor.
        const past = rows.filter(row => row.time <= time).slice(-150);
        rows = [...past, ...rows.filter(row => row.time > time)];
        covered = Number.isFinite(data.next) && data.next > start ? data.next : start + 30000;
        note.textContent = '재생 시점에 맞춰 과거 채팅을 표시합니다.'; render(Math.floor(video.currentTime * 1000));
      } catch (error) {
        if (run === revision) { note.textContent = error.name === 'AbortError' ? '채팅 응답 지연 · 다시 시도합니다.' : `${error.message} · 잠시 후 다시 시도합니다.`; retryAt = Date.now() + 5000; }
      } finally { clearTimeout(timer); if (run === revision) busy = false; }
    }
    video.addEventListener('timeupdate', tick); video.addEventListener('seeking', tick); video.addEventListener('seeked', tick);
    setInterval(tick, 1000);
    return { open(value, available = true) {
      revision++; controller?.abort(); id = value; enabled = available; rows = []; covered = -1; lastTime = -1; busy = false; retryAt = 0; signature = ''; list.replaceChildren();
      container.hidden = !id; note.textContent = available ? '과거 채팅을 불러오는 중…' : '이 영상은 다시보기 채팅을 제공하지 않습니다.';
      if (id) tick();
    } };
  }
  root.installVodChat = installVodChat;
  if (typeof module !== 'undefined') module.exports = { visibleMessages };
})(typeof window !== 'undefined' ? window : globalThis);
