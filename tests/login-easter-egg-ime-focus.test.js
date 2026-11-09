'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createHarness() {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'js', 'modules', '08-account', '00-login-easter-egg.js'),
    'utf8'
  );
  let nextTimerId = 1;
  let nativeFocusRequests = 0;
  let inputFocusCount = 0;
  let selectionCount = 0;
  const timers = new Map();
  const clearedTimers = new Set();
  const inputListeners = {};
  const shellListeners = {};
  const shell = {
    addEventListener(type, listener) {
      shellListeners[type] = listener;
    },
    removeAttribute() {},
  };
  const input = {
    value: '',
    disabled: false,
    readOnly: false,
    tabIndex: 0,
    style: { removeProperty() {} },
    addEventListener(type, listener) {
      inputListeners[type] = listener;
    },
    removeAttribute() {},
    closest() {
      return shell;
    },
    focus() {
      inputFocusCount += 1;
      documentStub.activeElement = input;
    },
    setSelectionRange() {
      selectionCount += 1;
    },
  };
  const documentStub = {
    activeElement: null,
    focused: true,
    hasFocus() {
      return this.focused;
    },
    getElementById(id) {
      return id === 'login-easter-egg-input' ? input : null;
    },
    querySelectorAll() {
      return [];
    },
  };
  const sandbox = {
    console,
    Promise,
    Array,
    String,
    Number,
    Date,
    Math,
    document: undefined,
    localStorage: {
      getItem() { return null; },
      setItem() {},
      removeItem() {},
    },
    window: {
      desktopWindow: {
        requestDesktopKeyboardFocus() {
          nativeFocusRequests += 1;
          return Promise.resolve({ ok: true });
        },
      },
      setTimeout(listener, delay) {
        const id = nextTimerId++;
        timers.set(id, { listener, delay });
        return id;
      },
      clearTimeout(id) {
        clearedTimers.add(id);
      },
      requestAnimationFrame(listener) {
        listener();
        return 1;
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(
    source + '\nthis.__loginImeTest = {' +
      'state: loginEasterEggState,' +
      'bind: bindLoginEasterEggGate,' +
      'schedule: scheduleLoginEasterEggInputFocus,' +
      'focus: focusLoginEasterEggInput' +
    '};',
    sandbox
  );
  sandbox.document = documentStub;
  sandbox.__loginImeTest.bind();

  return {
    sandbox,
    state: sandbox.__loginImeTest.state,
    input,
    documentStub,
    inputListeners,
    shellListeners,
    timers,
    clearedTimers,
    stats() {
      return { nativeFocusRequests, inputFocusCount, selectionCount };
    },
  };
}

async function run() {
  const harness = createHarness();
  const { state, inputListeners, shellListeners, documentStub, timers, clearedTimers } = harness;

  let prevented = 0;
  state.composing = true;
  inputListeners.keydown({
    key: 'Enter',
    keyCode: 229,
    isComposing: true,
    preventDefault() { prevented += 1; },
  });
  assert.strictEqual(prevented, 0, 'IME candidate Enter must remain available to composition');

  state.composing = false;
  inputListeners.keydown({
    key: 'Enter',
    keyCode: 13,
    isComposing: false,
    preventDefault() { prevented += 1; },
  });
  assert.strictEqual(prevented, 1, 'plain Enter should still submit the four-character answer');

  state.revealed = true;
  state.composing = false;
  documentStub.focused = true;
  documentStub.activeElement = null;
  harness.sandbox.__loginImeTest.schedule();
  const scheduledIds = Array.from(timers.keys());
  assert.strictEqual(scheduledIds.length, 4);
  timers.get(scheduledIds[0]).listener();
  assert.strictEqual(harness.stats().inputFocusCount, 1, 'focused window should synchronously focus the hidden input once');
  assert.strictEqual(harness.stats().selectionCount, 1);
  assert.strictEqual(harness.stats().nativeFocusRequests, 0, 'normal input clicks must not rebuild native TSF focus');
  scheduledIds.forEach((id) => assert(clearedTimers.has(id), `retry timer ${id} should be cancelled after focus`));

  shellListeners.pointerdown();
  shellListeners.click();
  assert.strictEqual(harness.stats().inputFocusCount, 1, 'pointerdown and click must not refocus an already-active IME input');
  assert.strictEqual(harness.stats().nativeFocusRequests, 0);

  documentStub.activeElement = null;
  harness.sandbox.__loginImeTest.schedule();
  const secondBatch = Array.from(timers.keys()).filter((id) => !scheduledIds.includes(id));
  inputListeners.compositionstart();
  secondBatch.forEach((id) => assert(clearedTimers.has(id), `composition must cancel retry timer ${id}`));
  const focusBeforeCancelledCallbacks = harness.stats().inputFocusCount;
  secondBatch.forEach((id) => {
    if (!clearedTimers.has(id)) timers.get(id).listener();
  });
  assert.strictEqual(harness.stats().inputFocusCount, focusBeforeCancelledCallbacks);

  console.log('[OK] Login easter egg IME focus, retry cancellation, and composition Enter verified.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
