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
