'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('node:assert/strict');

const appRoot = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(appRoot, rel), 'utf8');
const gestureText = read('public/js/modules/10-shell/00-gesture-control.js');
const splashText = read('public/js/modules/10-shell/03-splash.js');
const powerText = read('public/js/modules/00-state/08-desktop-render-power.js');

let capturedCameraOptions = null;
let sendCount = 0;
let savedReason = '';
let now = 1000;
const classNames = new Set();
const canvasContext = {
  setTransform() {},
  clearRect() {},
  save() {},
  restore() {},
  beginPath() {},
  moveTo() {},
  lineTo() {},
  stroke() {},
  arc() {},
  fill() {},
  createRadialGradient() { return { addColorStop() {} }; },
  createLinearGradient() { return { addColorStop() {} }; }
};
const handCanvas = {
  width: 0,
  height: 0,
  style: {},
  classList: { toggle() {}, add() {}, remove() {} },
  getContext() { return canvasContext; }
};
const hud = { classList: { add() {}, remove() {} }, innerHTML: '' };
const gestureLabel = { textContent: '' };
const gestureConfirm = { textContent: '' };
const gestureFill = { style: {} };
const body = {
  classList: {
    contains(name) { return classNames.has(name); },
    toggle(name, enabled) { if (enabled) classNames.add(name); else classNames.delete(name); }
  },
  appendChild() {}
};
const documentStub = {
  hidden: false,
  body,
  activeElement: null,
  querySelector() { return null; },
  querySelectorAll() { return []; },
  getElementById(id) {
    if (id === 'hand-canvas') return handCanvas;
    if (id === 'gesture-hud') return hud;
    if (id === 'gesture-label') return gestureLabel;
    if (id === 'gesture-confirm') return gestureConfirm;
    if (id === 'gesture-fill') return gestureFill;
    return null;
  },
  createElement() {
    return { playsInline: false, muted: false, style: {}, remove() {}, srcObject: null };
  }
};
const context = {
  console,
  Promise,
  Math,
  Date,
  performance: { now() { now += 100; return now; } },
  setTimeout,
  clearTimeout,
  requestAnimationFrame() {},
  window: { addEventListener() {}, desktopWindow: null },
  document: documentStub,
  innerWidth: 1280,
  innerHeight: 720,
  devicePixelRatio: 1,
  fx: {
    cam: 'gesture',
    gesturePlayerActions: true,
    gestureHandOverlay: true,
    gestureSensitivity: 'balanced',
    performanceQuality: 'eco',
    particleLyrics: true
  },
  desktopRuntimeState: {
    desktop: true,
    minimized: false,
    visible: true,
    focused: true,
    embedded: false,
    interactive: false
  },
  uniforms: {
    uHandActive: { value: 0 },
    uGestureGrip: { value: 0 },
    uBurstAmt: { value: 0 },
    uHandXY: { value: { set() {} } }
  },
  particles: null,
  bloomParticles: null,
  floatGroup: null,
  backCoverGroup: null,
  skullParticleGroup: null,
  stageLyrics: { group: { rotation: { x: 0, y: 0 } } },
  showToast() {},
  saveLyricLayout(opts) { savedReason = opts && opts.reason || ''; },
  getDesktopWindowApi() {
    return { requestGestureCameraPermission: async () => ({ ok: true }) };
  },
  loadScriptOnce: async () => true,
  Hands: function Hands() {
    this.setOptions = opts => { this.options = opts; };
    this.onResults = callback => { this.results = callback; };
    this.send = async () => {
      sendCount++;
      if (sendCount === 1) throw new Error('synthetic-frame-error');
      return true;
    };
    this.close = () => true;
  },
  Camera: function Camera(_video, options) {
    capturedCameraOptions = options;
    this.start = async () => true;
    this.stop = () => true;
  }
};
context.window.window = context.window;
vm.createContext(context);
vm.runInContext(gestureText, context, { filename: '00-gesture-control.js' });

(async () => {
  assert.equal(context.gestureHostVisible(), true);
  context.desktopRuntimeState.minimized = true;
  context.desktopRuntimeState.visible = false;
  assert.equal(context.gestureHostVisible(), false, 'ordinary minimized window must suspend camera inference');
  context.desktopRuntimeState.embedded = true;
  assert.equal(context.gestureHostVisible(), true, 'desktop-embedded host must not inherit stale hidden/minimized gating');
  context.desktopRuntimeState.embedded = false;
  context.desktopRuntimeState.minimized = false;
  context.desktopRuntimeState.visible = true;

  assert.equal(await context.startGestureControl(), true);
  assert.equal(context.gestureActive, true);
  assert.equal(context.gestureLifecycleState, 'active');
  assert.equal(context.gestureHands.options.modelComplexity, 1, 'explicit gesture mode keeps the stable hand model');
  assert.equal(context.gestureHands.options.minDetectionConfidence, 0.58);
  assert.ok(capturedCameraOptions && typeof capturedCameraOptions.onFrame === 'function');

  await assert.doesNotReject(capturedCameraOptions.onFrame(), 'one failed inference frame must not break camera_utils RAF');
  await assert.doesNotReject(capturedCameraOptions.onFrame(), 'the next inference frame must still run');
  assert.equal(sendCount, 2);
  assert.equal(context.gestureInferenceBusy, false);
  assert.equal(context.gestureInferenceErrorCount, 1);

  context.fx.cam = 'gesture';
  context.desktopRuntimeState.minimized = true;
  context.desktopRuntimeState.visible = false;
  context.syncGestureControlHostVisibility('test-minimize');
  assert.equal(context.gestureActive, false);
  assert.equal(context.gestureLifecycleState, 'suspended');
  assert.equal(context.gestureVideo, null);
  context.desktopRuntimeState.minimized = false;
  context.desktopRuntimeState.visible = true;
  context.syncGestureControlHostVisibility('test-restore');
  await new Promise(resolve => setTimeout(resolve, 180));
  assert.equal(context.gestureActive, true);
  assert.equal(context.gestureLifecycleState, 'active');

  context.persistGestureCameraDisabled('test');
  assert.equal(context.fx.cam, 'off');
  assert.equal(savedReason, 'cam');

  assert.match(splashText, /finishSplashReveal[\s\S]{0,420}resumeSavedGestureControl/);
  assert.match(powerText, /syncGestureControlHostVisibility\('desktop-runtime-state'\)/);
  assert.match(powerText, /isDesktopEmbedded/);
  assert.doesNotMatch(gestureText, /gestureHands\s*\|\|\s*gestureInferenceBusy\s*\|\|\s*document\.hidden/);

  console.log('OK gesture-runtime-lifecycle');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
