const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const mainPath = path.join(__dirname, 'desktop/main.cjs');
const originalRequire = createRequire(mainPath);

function loadMain(ownsLock) {
  const app = new EventEmitter();
  let quits = 0, readyCalls = 0;
  Object.assign(app, {
    isPackaged: false, setPath() {}, setName(value) {this.name=value;}, setAppUserModelId(value) {this.modelId=value;},
    requestSingleInstanceLock: () => ownsLock,
    quit: () => quits++,
    whenReady: () => { readyCalls++; return new Promise(() => {}); }
  });
  const mockRequire = name => name === 'electron' ? { app } : name === './window-settings.cjs' ? { readWindowSettings: () => ({}) } : originalRequire(name);
  const source = readFileSync(mainPath, 'utf8');
  const initialize = vm.runInNewContext(`(function(require,__dirname){${source}\nreturn {setWindow(value){win=value;}};})`, { process });
  const control = initialize(mockRequire, path.dirname(mainPath));
  return { app, control, get quits() { return quits; }, get readyCalls() { return readyCalls; } };
}
test('duplicate process exits before registering startup or creating a local server', () => {
  const instance = loadMain(false);
  assert.equal(instance.quits, 1);
  assert.equal(instance.readyCalls, 0);
  assert.equal(instance.control, undefined);
  assert.equal(instance.app.listenerCount('second-instance'), 0);
});

test('application identity uses Azzzt for the app name and Windows taskbar grouping',()=>{
  const instance=loadMain(false);
  assert.equal(instance.app.name,'Azzzt 아자자잣');
  if(process.platform==='win32')assert.equal(instance.app.modelId,'Azzzt.Viewer');
});
test('second launch restores and activates the existing window without restarting it', () => {
  const instance = loadMain(true), calls = [];
  assert.equal(instance.readyCalls, 1); assert.equal(instance.quits, 0);
  instance.app.emit('second-instance'); // Existing process is still starting.
  instance.control.setWindow({ isDestroyed: () => false, isMinimized: () => true, restore: () => calls.push('restore'), show: () => calls.push('show'), focus: () => calls.push('focus') });
  instance.app.emit('second-instance');
  assert.deepEqual(calls, ['restore','show','focus']);
  instance.control.setWindow({ isDestroyed: () => true });
  assert.doesNotThrow(() => instance.app.emit('second-instance'));
  assert.equal(instance.readyCalls, 1);
});
