const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const vm = require('vm');

const appRoot = path.resolve(__dirname, '..');

function loadSystemMemoryModuleWithSpies() {
  const code = fs.readFileSync(path.join(appRoot, 'desktop', 'system-memory.js'), 'utf8');
  const testInstrumented = code + '\n' + [
    'module.exports.__testPurgeDecision = async function(options, isElevated) {',
    '  let calledElevated = false;',
    '  let calledStandard = false;',
    '  isProcessElevated = async () => isElevated;',
    '  purgeSystemMemoryElevated = async () => { calledElevated = true; return { ok: true, elevated: true }; };',
    '  purgeSystemMemory = async () => { calledStandard = true; return { ok: true, elevated: false }; };',
    '  const result = await purgeSystemMemorySmart(29, options);',
    '  return { result, calledElevated, calledStandard };',
    '};'
  ].join('\n');

  const sandbox = {
    require,
    process: { platform: 'win32', env: {} },
    console,
    Buffer,
    module: { exports: {} },
    exports: {}
  };
  vm.createContext(sandbox);
  vm.runInContext(testInstrumented, sandbox);
  return sandbox.module.exports;
}

function loadStateModuleContext() {
  const defaultsCode = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '00-state', '04-fx-defaults.js'), 'utf8');
  const controlsCode = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '00-state', '11-system-memory-controls.js'), 'utf8');

  const sandbox = {
    clampRange: (v, min, max) => Math.min(Math.max(v, min), max),
    window: {},
    document: {
      querySelectorAll: () => [],
      getElementById: () => null
    },
    setTimeout: () => 0,
    clearTimeout: () => 0
  };
  vm.createContext(sandbox);
  vm.runInContext(defaultsCode, sandbox);
  vm.runInContext(controlsCode, sandbox);
  return sandbox;
}

test('automatic system memory cleanup cannot request administrator elevation', async () => {
  const sysMem = loadSystemMemoryModuleWithSpies();

  // Background cleanup (manual is omitted or false): even with autoElevate=true, elevation is never triggered
  const backgroundResult = await sysMem.__testPurgeDecision({ autoElevate: true }, false);
  assert.strictEqual(backgroundResult.calledElevated, false, 'Background cleanup must never invoke purgeSystemMemoryElevated');
  assert.strictEqual(backgroundResult.calledStandard, true, 'Background cleanup should invoke standard purgeSystemMemory');

  // Explicit manual cleanup with autoElevate=true on non-elevated process should invoke elevation
  const manualResult = await sysMem.__testPurgeDecision({ manual: true, autoElevate: true }, false);
  assert.strictEqual(manualResult.calledElevated, true, 'Manual elevated cleanup should invoke purgeSystemMemoryElevated');
  assert.strictEqual(manualResult.calledStandard, false);
});

test('automatic system memory elevation is disabled by default in runtime and packaged archive', () => {
  const state = loadStateModuleContext();
  assert.strictEqual(state.fxDefaults.memorySystemAutoElevate, false, 'runtime default memorySystemAutoElevate must be false');
  assert.strictEqual(state.fxDefaults.memorySafetyRevision, 4, 'runtime memorySafetyRevision must be 4');

  const archive = JSON.parse(fs.readFileSync(path.join(appRoot, 'public', 'default-user-fx-archive.json'), 'utf8'));
  assert.strictEqual(archive.snapshot.memorySystemAutoElevate, false, 'packaged archive default memorySystemAutoElevate must be false');
  assert.strictEqual(archive.snapshot.memorySafetyRevision, 4, 'packaged archive memorySafetyRevision must be 4');
});

test('legacy memory settings migrate away from automatic elevation', () => {
  const state = loadStateModuleContext();
  state.fx = {
    memorySystemAutoElevate: true,
    memorySafetyRevision: 3
  };

  state.ensureMemoryFxDefaults();

  assert.strictEqual(state.fx.memorySystemAutoElevate, false, 'legacy memorySystemAutoElevate: true should be migrated to false');
  assert.strictEqual(state.fx.memorySafetyRevision, 4, 'memorySafetyRevision should be bumped to 4');
});

test('legacy memory safety revision survives persistence loading and archive preset import for migration', () => {
  const persistenceText = fs.readFileSync(
    path.join(appRoot, 'public', 'js', 'modules', '02-visual', '04-visual-settings-persistence.js'),
    'utf8'
  );
  const presetArchiveText = fs.readFileSync(
    path.join(appRoot, 'public', 'js', 'modules', '07-fx', '00-preset-archive-data.js'),
    'utf8'
  );

  assert.match(persistenceText, /memorySafetyRevision:\s*Number\(raw\.memorySafetyRevision\)\s*\|\|\s*0/);
  assert.match(presetArchiveText, /memorySafetyRevision:\s*Number\(raw\.memorySafetyRevision\)\s*\|\|\s*0/);
});
