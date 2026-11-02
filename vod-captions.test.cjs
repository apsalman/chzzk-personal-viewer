const {test}=require('node:test');
const assert=require('node:assert/strict');
const {sliceHlsPlaylist}=require('./desktop/vod-captions.cjs');
const base='http://127.0.0.1:3131/media/'+ 'a'.repeat(32);
const segment='/media/'+ 'b'.repeat(32);
test('VOD HLS extraction keeps only the requested segments and seeks relative to their start',()=>{
 const input=`#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:100\n#EXT-X-KEY:METHOD=AES-128,URI="/media/${'c'.repeat(32)}"\n`+Array.from({length:100},(_,i)=>`#EXTINF:6,\n#EXT-X-BYTERANGE:100${i?'':'@0'}\n${segment}\n`).join('');
 const result=sliceHlsPlaylist(input,base,301,12);
 assert.equal(result.seek,1);
 assert.match(result.playlist,/#EXT-X-MEDIA-SEQUENCE:150/);
 assert.match(result.playlist,/#EXT-X-BYTERANGE:100@5000/);
 assert.equal((result.playlist.match(/#EXTINF:/g)||[]).length,3);
 assert.match(result.playlist,/METHOD=AES-128,URI="http:\/\/127\.0\.0\.1:3131\/media\//);
 assert.ok(result.playlist.endsWith('#EXT-X-ENDLIST\n'));
});
test('VOD HLS extraction rejects foreign segments and missing ranges',()=>{
 assert.throws(()=>sliceHlsPlaylist('#EXTM3U\n#EXTINF:6,\nhttps://example.com/a.ts',base,0,6));
 assert.throws(()=>sliceHlsPlaylist(`#EXTM3U\n#EXTINF:6,\n${segment}`,base,60,6));
});
test('MP4 caption audio uses MP4-compatible options and extracts the requested duration',async t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const {spawnSync}=require('node:child_process');
 const {VodCaptionAudio}=require('./desktop/vod-captions.cjs');
 const ffmpeg=process.platform==='win32'?path.join(os.homedir(),'AppData/Local/Microsoft/WinGet/Links/ffmpeg.exe'):'ffmpeg';
 if(spawnSync(ffmpeg,['-version'],{windowsHide:true}).status!==0)return t.skip('FFmpeg unavailable');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'azzz-caption-'));
 t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const input=path.join(directory,'audio.mp4');
 const generated=spawnSync(ffmpeg,['-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=440:duration=5','-c:a','aac',input],{windowsHide:true});
 assert.equal(generated.status,0,generated.stderr?.toString());
 const decoder=new VodCaptionAudio(ffmpeg);t.after(()=>decoder.cancel());
 const pcm=await decoder.decode(input,1,2,false);
 assert.ok(Math.abs(pcm.length/64000-2)<.05);
 const samples=new Float32Array(pcm.buffer,pcm.byteOffset,pcm.length/4);
 assert.ok(samples.some(value=>Math.abs(value)>.01));
});
