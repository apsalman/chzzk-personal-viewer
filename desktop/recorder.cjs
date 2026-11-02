const { EventEmitter } = require('node:events');
const fs = require('node:fs/promises');
const fss = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { timedFetch } = require('./network.cjs');
const LENGTHS = [1, 5, 10, 30, 60, 120];
function findFfmpeg(base) {
  const candidates = [path.join(base, 'tools', 'ffmpeg.exe'), path.join(os.homedir(), 'AppData/Local/Microsoft/WinGet/Links/ffmpeg.exe')];
  try { candidates.push(...spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', ['ffmpeg'], { encoding: 'utf8', windowsHide: true }).stdout.trim().split(/\r?\n/)); } catch {}
  return candidates.find(p => p && fss.existsSync(p)) || null;
}
function parseSegments(text, fallback = Date.now()) {
  let duration = 0, date = fallback, sequence = 0;
  const result = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) sequence = Number(line.split(':')[1]);
    if (line.startsWith('#EXTINF:')) duration = Number(line.slice(8).split(',')[0]);
    if (line.startsWith('#EXT-X-PROGRAM-DATE-TIME:')) { const value = Date.parse(line.slice(25)); if (Number.isFinite(value)) date = value; }
    if (line && !line.startsWith('#') && duration > 0) {
      result.push({ file: line.trim(), duration, start: date, end: date + duration * 1000, sequence: sequence++ });
      date += duration * 1000; duration = 0;
    }
  }
  return result;
}
function playlist(entries, uri, ended = false) {
  const target = Math.max(1, Math.ceil(Math.max(...entries.map(e => e.duration), 4)));
  const lines = ['#EXTM3U', '#EXT-X-VERSION:3', `#EXT-X-TARGETDURATION:${target}`, `#EXT-X-MEDIA-SEQUENCE:${entries[0]?.sequence || 0}`, '#EXT-X-INDEPENDENT-SEGMENTS'];
  for (const entry of entries) lines.push(`#EXT-X-PROGRAM-DATE-TIME:${new Date(entry.start).toISOString()}`, `#EXTINF:${entry.duration.toFixed(6)},`, uri(entry));
  if (ended) lines.push('#EXT-X-ENDLIST');
  return lines.join('\n') + '\n';
}
function selectRange(entries, start, end) { return entries.filter(e => e.end > start && e.start <= end); }
class Recorder extends EventEmitter {
  constructor({ root, base, ffmpeg } = {}) {
    super(); this.root = root; this.ffmpeg = ffmpeg || findFfmpeg(base || root);
    this.minutes = 10; this.replay = false; this.session = null; this.job = null; this.finalizing = 0; this.error = ''; this.lastFile = ''; this.lastFolder = root;
    this.pumping = Promise.resolve();
  }
  state() {
    const s = this.session, records = s?.records || [];
    const cursor = s?.playhead || records.at(-1)?.end || 0;
    return { available: !!this.ffmpeg, active: !!s, ready: !!records.length, recording: !!this.job, finalizing: this.finalizing > 0, replay: this.replay, minutes: this.minutes,
      url: s ? `/dvr/${s.id}/index.m3u8` : '', originalURL: s?.source || '',
      seconds: records.length ? Math.max(0, (cursor - records[0].start) / 1000) : 0,
      recordedSeconds: this.job ? Math.max(0, (cursor - (this.job.start || cursor)) / 1000) : 0,
      bytes: records.reduce((total, e) => total + e.bytes, 0), error: this.error, lastFile: this.lastFile, folder: this.lastFolder };
  }
  publish() { const state = this.state(); this.emit('state', state); return state; }
  async startCapture(config) {
    if (this.session) return;
    if (!this.ffmpeg) throw new Error('FFmpeg가 필요합니다. 설치하거나 앱 폴더의 tools/ffmpeg.exe에 넣어 주세요.');
    const source = new URL(config.url, this.origin);
    if (source.origin !== this.origin || !/^\/media\/[a-f\d]{32}$/.test(source.pathname)) throw new Error('재생 중인 라이브 영상을 먼저 열어 주세요.');
    const response = await timedFetch(fetch, source.href, {}, 20000);
    if (!response.ok) throw new Error('녹화할 재생 목록을 가져오지 못했습니다. 다시 연결해 주세요.');
    const text = await response.text();
    if (!text.startsWith('#EXTM3U') || text.includes('#EXT-X-STREAM-INF')) throw new Error('영상이 재생된 후 녹화/리플레이를 시작해 주세요.');
    const rows = text.split(/\r?\n/).filter(l => l && !l.startsWith('#'));
    const fragment = config.fragment ? new URL(config.fragment, this.origin).href : '';
    const startIndex = rows.findIndex(row => new URL(row, source).href === fragment);
    const id = randomBytes(12).toString('hex');
    const dir = path.join(this.root, '.buffer', id);
    await fs.mkdir(dir, { recursive: true });
    const s = this.session = { id, dir, source: source.href, records: [], seen: new Set(), started: Date.now(), playhead: null, ended: false, stopping: false, log: '' };
    this.error = '';
    const args = ['-hide_banner', '-loglevel', 'warning', '-rw_timeout', '20000000', '-allowed_extensions', 'ALL', '-extension_picky', '0', '-live_start_index', String(startIndex >= 0 ? startIndex : -1), '-i', source.href,
      '-map', '0:v:0?', '-map', '0:a:0?', '-c', 'copy', '-f', 'hls', '-hls_time', '4', '-hls_list_size', '0', '-hls_flags', 'program_date_time+independent_segments+temp_file',
      '-hls_segment_filename', path.join(dir, 'chunk-%09d.ts'), path.join(dir, 'capture.m3u8')];
    s.process = spawn(this.ffmpeg, args, { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
    s.process.stdin.on('error', () => {});
    s.process.stderr.on('data', data => { s.log = (s.log + data.toString()).slice(-8000); });
    s.closed = new Promise(resolve => {
      s.process.once('error', error => { this.error = `FFmpeg 실행 실패: ${error.message}`; s.ended = true; resolve(); this.publish(); });
      s.process.once('close', code => {
        s.ended = true;
        if (code && !s.stopping) this.error = '영상 수신이 중단되었습니다. 녹화 조각은 보관됩니다. 녹화 종료로 파일을 합칠 수 있습니다.';
        this.pump().finally(() => { this.publish(); resolve(); });
      });
    });
    s.timer = setInterval(() => this.pump().catch(error => { this.error = `저장 오류: ${error.message}`; this.publish(); }), 1000);
    this.publish();
  }
  pump() {
    this.pumping = this.pumping.catch(() => {}).then(() => this._pump());
    return this.pumping;
  }
  async _pump() {
    const s = this.session; if (!s) return;
    let text; try { text = await fs.readFile(path.join(s.dir, 'capture.m3u8'), 'utf8'); } catch (e) { if (e.code === 'ENOENT') return; throw e; }
    for (const entry of parseSegments(text, s.started)) {
      if (!/^chunk-\d{9}\.ts$/.test(entry.file) || s.seen.has(entry.file)) continue;
      const file = path.join(s.dir, entry.file);
      const stat = await fs.stat(file);
      s.seen.add(entry.file); s.records.push({ ...entry, bytes: stat.size });
    }
    if (this.job && !this.job.start && s.records.length) this.job.start = s.records[0].start;
    if (this.job?.start) await this.copyJobSegments(this.job, selectRange(s.records, this.job.start, this.job.stop || Infinity));
    const end = s.records.at(-1)?.end;
    if (end && s.records.length > 2) {
      const cursor = s.playhead || end;
      const keepFrom = cursor - (this.replay ? this.minutes * 60 : 30) * 1000 - 15000;
      const obsolete = s.records.filter(e => e.end < keepFrom);
      for (const entry of obsolete) await fs.unlink(path.join(s.dir, entry.file)).catch(() => {});
      s.records = s.records.filter(e => e.end >= keepFrom);
    }
    this.publish();
  }
  markPlayhead(epoch) {
    const s = this.session;
    if (!s || !Number.isFinite(epoch) || !s.records.length) return;
    if (epoch >= s.records[0].start - 5000 && epoch <= s.records.at(-1).end + 10000) s.playhead = epoch;
  }
  async newJob(kind, start) {
    const dir = path.join(this.root, `${kind}-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomBytes(3).toString('hex')}`);
    await fs.mkdir(dir, { recursive: true }); this.lastFolder = dir;
    return { dir, start, stop: null, records: [], seen: new Set() };
  }
  async copyJobSegments(job, entries) {
    for (const entry of entries) {
      if (job.seen.has(entry.file)) continue;
      await fs.copyFile(path.join(this.session.dir, entry.file), path.join(job.dir, entry.file));
      job.seen.add(entry.file); job.records.push(entry);
    }
  }
  async startRecording(config) {
    if (this.job || this.finalizing) throw new Error('이미 녹화 또는 파일 합치기 작업이 진행 중입니다.');
    await this.startCapture(config);
    this.job = await this.newJob('Recording', this.session.playhead || this.session.records.at(-1)?.start || null);
    await this.pump(); return this.publish();
  }
  async merge(job) {
    if (!job.records.length) throw new Error('완료된 영상 조각이 없습니다. 몇 초 이상 녹화한 후 종료해 주세요.');
    job.records.sort((a,b) => a.start-b.start);
    const selected = selectRange(job.records, job.start || 0, job.stop || Infinity);
    if (!selected.length) throw new Error('선택한 구간의 영상 조각이 없습니다.');
    await fs.writeFile(path.join(job.dir, 'recording.m3u8'), playlist(selected, e => e.file, true));
    const output = path.join(job.dir, 'video.mp4');
    await new Promise((resolve, reject) => {
      const child = spawn(this.ffmpeg, ['-hide_banner', '-loglevel', 'warning', '-y', '-protocol_whitelist', 'file,crypto,data', '-i', path.join(job.dir, 'recording.m3u8'), '-map', '0:v:0?', '-map', '0:a:0?', '-c', 'copy', '-movflags', '+faststart', output], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
      let log = ''; child.stderr.on('data', data => { log = (log + data.toString()).slice(-8000); });
      child.once('error', reject); child.once('close', async code => {
        if (!code) resolve();
        else { await fs.writeFile(path.join(job.dir, 'merge-error.log'), log).catch(() => {}); reject(new Error('MP4 합치기에 실패했습니다. 폴더의 영상 조각과 recording.m3u8은 보관되어 있습니다.')); }
      });
    });
    const stat = await fs.stat(output);
    if (!stat.size) throw new Error('MP4 파일이 비어 있어 영상 조각을 보관했습니다.');
    this.lastFile = output; this.lastFolder = job.dir;
    // Only delete inputs belonging to this completed job, after successful muxing.
    for (const name of [...new Set(job.records.map(e => e.file)), 'recording.m3u8']) {
      if (name !== 'recording.m3u8' && !/^chunk-\d{9}\.ts$/.test(name)) continue;
      await fs.unlink(path.join(job.dir, name)).catch(error => {
        if (error.code !== 'ENOENT') throw new Error(`MP4 저장은 완료했지만 임시 파일 삭제에 실패했습니다: ${name}`);
      });
    }
    return output;
  }
  async stopRecording(epoch) {
    if (!this.job) throw new Error('진행 중인 녹화가 없습니다.');
    const job = this.job;
    if (Number.isFinite(epoch) && job.start && epoch < job.start) throw new Error('재생 위치가 녹화 시작 지점보다 이전입니다. LIVE로 돌아간 뒤 녹화 종료를 눌러 주세요.');
    job.stop = Number.isFinite(epoch) ? epoch : this.session.playhead || Date.now();
    let failed = false;
    this.finalizing++; this.publish();
    try {
      if (!this.replay) await this.stopProcess();
      await this.pump();
      this.job = null;
      await this.merge(job);
    } catch (error) { failed = true; this.job = null; this.error = error.message; throw error; }
    finally {
      this.finalizing--;
      if (!this.replay) await this.stopCapture({ keepBuffer: failed });
      this.publish();
    }
    return this.state();
  }
  async setReplay(enabled, minutes, config = {}) {
    if (!LENGTHS.includes(minutes)) throw new Error('지원하지 않는 리플레이 시간입니다.');
    if (enabled) { await this.startCapture(config); this.replay = true; this.minutes = minutes; }
    else { this.replay = false; if (!this.job && !this.finalizing) await this.stopCapture(); }
    return this.publish();
  }
  async saveReplay(epoch) {
    const s = this.session;
    if (!s?.records.length || this.finalizing) throw new Error('저장 가능한 리플레이가 없거나 파일을 합치는 중입니다.');
    const end = Number.isFinite(epoch) ? epoch : s.playhead || s.records.at(-1).end;
    const job = await this.newJob('Replay', end - this.minutes * 60000); job.stop = end;
    this.finalizing++; this.publish();
    try { await this.copyJobSegments(job, selectRange(s.records, job.start, end)); await this.merge(job); }
    catch (error) { this.error = error.message; throw error; }
    finally { this.finalizing--; this.publish(); }
    return this.state();
  }
  resource(urlPath) {
    const s = this.session; if (!s) return null;
    const prefix = `/dvr/${s.id}/`;
    if (!urlPath.startsWith(prefix)) return null;
    const name = urlPath.slice(prefix.length);
    if (name === 'index.m3u8' && s.records.length) return { text: playlist(s.records, e => prefix + e.file, s.ended), type: 'application/vnd.apple.mpegurl' };
    if (/^chunk-\d{9}\.ts$/.test(name) && s.seen.has(name)) return { file: path.join(s.dir, name), type: 'video/mp2t' };
    return null;
  }
  async stopProcess() {
    const s = this.session; if (!s || s.ended) return;
    s.stopping = true; s.process.stdin.write('q\n');
    const timer = setTimeout(() => s.process.kill(), 8000);
    try { await s.closed; } finally { clearTimeout(timer); }
  }
  async stopCapture({ keepBuffer = false } = {}) {
    const s = this.session; if (!s) return;
    clearInterval(s.timer); await this.stopProcess(); await this.pump();
    this.session = null; this.publish();
    // Only remove this generated buffer directory, never saved recordings.
    const bufferRoot = path.resolve(this.root, '.buffer');
    const target = path.resolve(s.dir);
    if (!keepBuffer && path.dirname(target) === bufferRoot && /^[a-f\d]{24}$/.test(path.basename(target))) await fs.rm(target, { recursive: true, force: true }).catch(() => {});
  }
  async shutdown() {
    while (this.finalizing) await new Promise(resolve => setTimeout(resolve, 100));
    this.replay = false;
    if (this.job) await this.stopRecording(this.session?.records.at(-1)?.end || Date.now());
    else await this.stopCapture();
  }
}
module.exports = { Recorder, parseSegments, playlist, selectRange, LENGTHS };
