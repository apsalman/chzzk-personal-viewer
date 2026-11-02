const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = { module: { exports: {} } };
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'public/seek-preview.js'),'utf8'),context);
const { previewTime } = context.module.exports;
test('preview timestamps use two-second buckets and stay within the video', () => {
  assert.equal(previewTime(183.9,1000),182);
  assert.equal(previewTime(-5,1000),0);
  assert.equal(previewTime(1005,1000),999.9);
  assert.equal(previewTime(123.9,Infinity),122);
});
