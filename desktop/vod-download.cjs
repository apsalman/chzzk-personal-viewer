const { EventEmitter } = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');

class VodDownload extends EventEmitter {
  constructor({ root, ffmpeg }) {
    super(); this.root = root; this.ffmpeg = ffmpeg;
    this.current = { available: !!ffmpeg, active: false, status: 'idle', seconds: 0, duration: 0, bytes: 0, file: '', folder: root, error: '' };
  }
  state() { return { ...this.current }; }
  publish() { this.emit('state', this.state()); return this.state(); }
  async start({ url, videoId, title, duration, quality }) {
    if (this.current.active) throw new Error('이미 VOD를 다운로드하고 있습니다.');
    if (!this.ffmpeg) throw new Error('FFmpeg를 설치하거나 앱 폴더의 tools/ffmpeg.exe에 넣어 주세요.');
    if (!/^\d+$/.test(videoId || '')) throw new Error('다시보기 번호가 올바르지 않습니다.');
    this.current = { available: true, active: true, status: 'starting', videoId, title: String(title || ''), quality: String(quality || ''), duration: Number.isFinite(duration) ? duration : 0, seconds: 0, bytes: 0, file: '', folder: this.root, error: '' };
    this.cancelled = false; this.finished = null; this.publish();
    let folder;
    try {
      folder = path.join(this.root, `VOD-${videoId}-${Date.now()}-${randomBytes(3).toString('hex')}`);
      this.preparing = fs.mkdir(folder, { recursive: true }); await this.preparing;
    } catch(error) { this.current.active = false; this.current.status = 'error'; this.current.error = '저장 폴더를 만들지 못했습니다.'; this.publish(); throw error; }
    this.current.folder = folder;
    const temporary = path.join(folder, 'video.partial.mp4'), output = path.join(folder, 'video.mp4');
    const child = this.child = spawn(this.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostats', '-progress', 'pipe:1', '-rw_timeout', '20000000', '-allowed_extensions', 'ALL', '-extension_picky', '0', '-i', url,
      '-map', '0:v:0?', '-map', '0:a:0?', '-c', 'copy', '-movflags', '+faststart', '-f', 'mp4', temporary], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdin.on('error', () => {});
    child.stderr.on('data', () => {});
    let pending = '', spawnError = false;
    child.stdout.on('data', chunk => {
      pending += chunk.toString(); const lines = pending.split(/\r?\n/); pending = lines.pop();
      for (const line of lines) {
        const [key, value] = line.split('=');
        if (key === 'out_time_us' && Number.isFinite(Number(value))) this.current.seconds = Math.max(0, Number(value) / 1000000);
        if (key === 'total_size' && Number.isFinite(Number(value))) this.current.bytes = Math.max(0, Number(value));
        if (key === 'progress') { this.current.status = this.cancelled ? 'cancelling' : value === 'end' ? 'finalizing' : 'downloading'; this.publish(); }
      }
    });
    child.once('error', () => { spawnError = true; });
    this.finished = new Promise(resolve => child.once('close', async code => {
      clearTimeout(this.killTimer); this.child = null;
      try {
        if (this.cancelled) { await fs.rm(temporary, { force: true }); this.current.status = 'cancelled'; }
        else if (code !== 0 || spawnError) { this.current.status = 'error'; this.current.error = '다운로드에 실패했습니다. 다시보기를 다시 연결한 뒤 재시도해 주세요. 미완성 파일은 폴더에 보관됩니다.'; }
        else {
          const info = await fs.stat(temporary);
          if (!info.size) throw new Error('다운로드 파일이 비어 있습니다.');
          await fs.rename(temporary, output); this.current.file = output; this.current.bytes = info.size; this.current.status = 'completed';
        }
      } catch(error) { this.current.status = 'error'; this.current.error = `파일 저장 처리 실패: ${error.message}`; }
      this.current.active = false; this.publish(); resolve(this.state());
    }));
    this.current.status = this.cancelled ? 'cancelling' : 'downloading';
    if (this.cancelled) this.stopChild();
    return this.publish();
  }
  stopChild() {
    const child = this.child; if (!child) return;
    clearTimeout(this.killTimer); child.stdin.write('q\n');
    this.killTimer = setTimeout(() => { if (this.child === child) child.kill(); }, 4000);
  }
  async cancel() {
    if (!this.current.active) return this.state();
    this.cancelled = true; this.current.status = 'cancelling'; this.publish(); this.stopChild();
    await this.preparing?.catch(() => {});
    if (this.finished) await this.finished;
    return this.state();
  }
}
module.exports = { VodDownload };
