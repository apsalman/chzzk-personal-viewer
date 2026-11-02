const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Recorder, parseSegments, playlist, selectRange } = require('./desktop/recorder.cjs');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');
const execFile = promisify(require('node:child_process').execFile);
test('DVR playlist preserves exact segment times and sequence numbers', () => {
  const text = '#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:5\n#EXT-X-PROGRAM-DATE-TIME:2026-11-01T12:00:00.000Z\n#EXTINF:4.000,\nchunk-000000005.ts\n#EXTINF:3.500,\nchunk-000000006.ts\n';
  const segments = parseSegments(text);
  assert.equal(segments[0].sequence, 5);
  assert.equal(segments[1].start - segments[0].start, 4000);
  assert.equal(segments[1].duration, 3.5);
  const output = playlist(segments, e => '/dvr/id/' + e.file);
  assert.match(output, /#EXT-X-MEDIA-SEQUENCE:5/);
  assert.match(output, /\/dvr\/id\/chunk-000000006.ts/);
  assert.ok(!output.includes('#EXT-X-ENDLIST'));
});
test('recording/replay selection ends at the current playback segment, not the live edge', () => {
  const entries = [0,4,8,12,16].map((n,i) => ({start:n*1000,end:(n+4)*1000,duration:4,file:String(i)}));
  assert.deepEqual(selectRange(entries, 4500, 8500).map(e=>e.file), ['1','2']);
  assert.ok(!selectRange(entries, 0, 8500).some(e=>e.start===12000));
  assert.match(playlist(selectRange(entries, 4500, 8500), e=>e.file, true), /#EXT-X-ENDLIST/);
});

test('successful MP4 merge removes job segments and playlist; failed merge preserves inputs', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'chzzk-merge-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const recorder = new Recorder({ root: dir });
  if (!recorder.ffmpeg) return t.skip('FFmpeg is not installed');
  const file = 'chunk-000000000.ts';
  await execFile(recorder.ffmpeg, ['-hide_banner','-loglevel','error','-f','lavfi','-i','color=size=160x90:rate=10','-t','1','-c:v','mpeg2video','-f','mpegts',path.join(dir,file)], { windowsHide: true });
  const job = { dir, start: 1, stop: 900, records: [{ file, start: 0, end: 1000, duration: 1, sequence: 0 }] };
  await recorder.merge(job);
  assert.deepEqual(await fs.readdir(dir), ['video.mp4']);
  assert.ok((await fs.stat(recorder.lastFile)).size > 0);
  await fs.writeFile(path.join(dir,file), 'invalid media');
  await assert.rejects(recorder.merge(job), /MP4 합치기에 실패/);
  assert.equal(await fs.readFile(path.join(dir,file),'utf8'), 'invalid media');
  assert.ok((await fs.stat(path.join(dir,'recording.m3u8'))).size > 0);
});
