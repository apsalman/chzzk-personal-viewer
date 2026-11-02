const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

class Captions extends EventEmitter {
  constructor({ runtime, worker, spawnWorker = spawn } = {}) {
    super();
    this.runtime = runtime || path.join(process.env.LOCALAPPDATA || os.homedir(), 'AZZZT', 'captions');
    this.worker = worker || path.join(__dirname, 'caption_worker.py');
    this.spawnWorker = spawnWorker;
    this.python = path.join(this.runtime, 'runtime', 'Scripts', 'python.exe');
    this.active = false; this.ready = false; this.model = 'base'; this.dropped = 0; this.nextId = 0; this.epoch = 0; this.error = '';
  }
  models() { return ['tiny','base','small','medium','turbo'].filter(name => fs.existsSync(path.join(this.runtime, 'models', name, 'model.bin'))); }
  translationAvailable() { return ['model.bin','config.json','shared_vocabulary.json','sentencepiece.bpe.model'].every(file=>fs.existsSync(path.join(this.runtime,'translation',file))); }
  state() { return { available: fs.existsSync(this.python) && this.models().length > 0, models: this.models(), translationAvailable:this.translationAvailable(), language:this.language||'ko', active: this.active, ready: this.ready, model: this.model, device: this.device || '', notice: this.notice || '', dropped: this.dropped, error: this.error }; }
  publish() { this.emit('state', this.state()); return this.state(); }
  start(model = 'base', device = 'auto', language = 'ko') {
    this.stop();
    if (!['tiny','base','small','medium','turbo'].includes(model) || !this.models().includes(model) || !fs.existsSync(this.python)) throw new Error('setup-captions.ps1로 한국어 자막 엔진을 먼저 설치하세요.');
    if (!['auto','cpu','cuda'].includes(device)) throw new Error('지원하지 않는 자막 처리 장치입니다.');
    if (!['ko','en','es','ja'].includes(language)) throw new Error('지원하지 않는 자막 언어입니다.');
    if(language!=='ko'&&!this.translationAvailable())throw new Error('setup-captions.ps1 -EnableTranslation으로 번역 모델을 먼저 설치하세요.');
    this.language=language;
    this.model = model; this.active = true; this.ready = false; this.dropped = 0; this.error = ''; this.epoch = 0;
    this.device = ''; this.notice = '';
    const child = this.child = this.spawnWorker(this.python, ['-u', this.worker, path.join(this.runtime, 'models', model), device, language], {
      windowsHide: true, stdio: ['pipe','pipe','pipe'], env: { ...process.env, PYTHONIOENCODING: 'utf-8', HF_HUB_OFFLINE: '1', HF_HUB_DISABLE_TELEMETRY: '1' }
    });
    let pending = '';
    child.stdout.setEncoding('utf8');
    child.stdin.on('error', () => {}); child.stderr.on('data', () => {});
    child.stdout.on('data', chunk => {
      if (this.child !== child) return;
      pending += chunk.toString('utf8');
      if (pending.length > 2000000) { this.error = '자막 엔진 응답이 올바르지 않습니다.'; this.stop(); return; }
      const lines = pending.split(/\r?\n/); pending = lines.pop();
      for (const line of lines) {
        let value; try { value = JSON.parse(line); } catch { continue; }
        if (value.type === 'ready') { clearTimeout(this.startTimer); this.ready = true; this.device = value.device || 'cpu'; this.notice = value.notice || ''; this.publish(); }
        else if (value.type === 'backend') { this.device = value.device; this.notice = value.notice || ''; this.publish(); }
        else if (value.type === 'result' || value.type === 'job-error') {
          const job = this.current;
          if (!job || value.id !== job.id) continue;
          clearTimeout(this.jobTimer); this.current = null;
          if (value.type === 'result' && job.epoch === this.epoch) { this.error = ''; this.emit('result', { ...value, mode:job.mode, end: job.end, capturedAt: job.capturedAt, dropped: this.dropped }); }
          if (value.type === 'job-error' && job.epoch === this.epoch && job.mode === 'vod') this.emit('result',{mode:'vod',epoch:job.epoch,error:'선행 인식 중 오류가 발생했습니다. 잠시 후 재시도합니다.'});
          if (value.type === 'job-error') { this.error = '음성 인식 중 오류가 발생했습니다. 다음 구간을 처리합니다.'; this.publish(); }
          const next = this.pending; this.pending = null; if (next) this.send(next);
        } else if (value.type === 'fatal') { this.error = value.message; this.stop(); }
      }
    });
    child.once('error', () => { if (this.child === child) { this.error = 'Python 자막 엔진을 실행하지 못했습니다.'; this.stop(); } });
    child.once('close', () => { if (this.child === child) { this.error = this.error || '자막 엔진 연결이 종료되었습니다.'; this.stop(); } });
    this.startTimer = setTimeout(() => { if (this.child === child && !this.ready) { this.error = '자막 모델 로딩 시간이 초과되었습니다.'; this.stop(); } }, 60000);
    return this.publish();
  }
  reset(epoch) {
    if (!Number.isSafeInteger(epoch) || epoch < 0) return;
    this.epoch = epoch; this.pending = null;
  }
  audio({ pcm, epoch, end, capturedAt, mode = 'live', start = 0 } = {}) {
    if (!this.ready || !this.child || epoch !== this.epoch || !(pcm instanceof ArrayBuffer || ArrayBuffer.isView(pcm)) || !Number.isFinite(end) || !Number.isFinite(capturedAt)) return false;
    const bytes = pcm instanceof ArrayBuffer ? Buffer.from(pcm) : Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
    if (!['live','vod'].includes(mode) || (mode === 'vod' && (!Number.isFinite(start) || start < 0))) return false;
    if (bytes.length < 64000 || bytes.length > (mode === 'vod' ? 1024000 : 512000) || bytes.length % 4) return false;
    const job = { id: ++this.nextId, epoch, end, capturedAt, mode, start, pcm: bytes.toString('base64') };
    if (this.current) { if (this.pending) this.dropped++; this.pending = job; this.publish(); }
    else this.send(job);
    return true;
  }
  send(job) {
    if (!this.child || !this.ready || job.epoch !== this.epoch) return;
    this.current = job; this.child.stdin.write(JSON.stringify(job) + '\n');
    this.jobTimer = setTimeout(() => { this.error = '음성 인식 처리 시간이 초과되었습니다. 자막을 끄고 GPU 또는 4초 갱신을 선택해 주세요.'; this.stop(); }, 45000);
  }
  stop() {
    clearTimeout(this.startTimer); clearTimeout(this.jobTimer);
    const child = this.child; this.child = null; this.current = null; this.pending = null; this.active = false; this.ready = false;
    if (child) { child.stdin.end(); child.kill(); }
    return this.publish();
  }
}
module.exports = { Captions };
