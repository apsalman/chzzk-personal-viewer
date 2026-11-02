const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fss = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { VodDownload } = require('./desktop/vod-download.cjs');
const run = promisify(execFile);
const ffmpeg = path.join(os.homedir(), 'AppData/Local/Microsoft/WinGet/Links/ffmpeg.exe');

test('VOD download requires FFmpeg and valid VOD identity', async () => {
  await assert.rejects(new VodDownload({ root: os.tmpdir() }).start({ videoId: '123' }), /FFmpeg/);
  await assert.rejects(new VodDownload({ root: os.tmpdir(), ffmpeg: 'fake' }).start({ videoId: '../bad' }), /번호/);
});
test('VOD download creates a complete MP4, reports progress and cancels without a completed file', { skip: !fss.existsSync(ffmpeg) }, async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'chzzk-vod-download-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await run(ffmpeg, ['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc=size=160x90:rate=10','-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-t','6','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-g','20','-c:a','aac','-f','hls','-hls_time','2','-hls_list_size','0','-hls_segment_filename',path.join(root,'part-%03d.ts'),path.join(root,'index.m3u8')], { windowsHide: true });
  let slow = false;
  const server = http.createServer(async (req,res) => {
    const name = req.url === '/media/master' ? 'index.m3u8' : path.basename(req.url);
    try {
      let data = await fs.readFile(path.join(root, name));
      if (name === 'index.m3u8') data = Buffer.from(data.toString().replace(/part-(\d+)\.ts/g, 'segment-$1'));
      if (slow) await new Promise(resolve => setTimeout(resolve, 400));
      res.writeHead(200, { 'Content-Type': name.endsWith('m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t' }); res.end(data);
    } catch { res.writeHead(404); res.end(); }
  });
  for(const name of await fs.readdir(root))if(name.endsWith('.ts'))await fs.copyFile(path.join(root,name),path.join(root,name.replace('part-','segment-').replace('.ts','')));
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const downloader = new VodDownload({ root: path.join(root,'saved'), ffmpeg });
  const states = []; downloader.on('state', state => states.push(state));
  const config = { videoId:'123', title:'VOD test', duration:6, url:`http://127.0.0.1:${server.address().port}/media/master`, quality:'160p' };
  await downloader.start(config); await assert.rejects(downloader.start(config), /이미/); await downloader.finished;
  assert.equal(downloader.state().status, 'completed');
  assert.ok((await fs.stat(downloader.state().file)).size > 0);
  assert.deepEqual(await fs.readdir(downloader.state().folder), ['video.mp4']);
  assert.ok(states.some(state => state.seconds > 0 && state.bytes > 0));
  const probe = path.join(path.dirname(ffmpeg), 'ffprobe.exe');
  if(fss.existsSync(probe)) { const { stdout } = await run(probe, ['-v','error','-show_entries','format=duration','-of','json',downloader.state().file], { windowsHide:true }); assert.ok(Number(JSON.parse(stdout).format.duration)>=6); }
  slow = true; await downloader.start(config); await downloader.cancel();
  assert.equal(downloader.state().status, 'cancelled'); assert.equal(downloader.state().active, false); assert.equal(downloader.state().file, '');
  assert.ok(!(await fs.readdir(downloader.state().folder)).includes('video.partial.mp4'));
  await downloader.start({ ...config, url: `http://127.0.0.1:${server.address().port}/missing` }); await downloader.finished;
  assert.equal(downloader.state().status, 'error'); assert.equal(downloader.state().file, '');
});
