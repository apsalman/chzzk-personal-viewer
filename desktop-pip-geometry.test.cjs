const { test } = require('node:test');
const assert = require('node:assert/strict');
const { gestureBounds } = require('./desktop/pip-geometry.cjs');
test('drag moves the whole video without changing its size', () => {
  assert.deepEqual(gestureBounds({x:100,y:100,width:480,height:270},'move',60,-20), {x:160,y:80,width:480,height:270});
});
test('resize preserves video aspect ratio and the opposite corner', () => {
  const start = {x:100,y:100,width:480,height:270};
  assert.deepEqual(gestureBounds(start, 'nw', -160, -90), {x:-60,y:10,width:640,height:360});
  const smallest = gestureBounds(start, 'se', -900, -900);
  assert.equal(smallest.width, 240);
  assert.ok(Math.abs(smallest.width/smallest.height - 16/9) < .01);
});
