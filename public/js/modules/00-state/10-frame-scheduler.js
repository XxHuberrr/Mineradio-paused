function createFrameGate(name, defaultFps) {
  return {
    name: String(name || 'frame-gate'),
    defaultFps: Math.max(0, Number(defaultFps) || 0),
    targetFps: Math.max(0, Number(defaultFps) || 0),
    lastRunAt: 0,
    pendingDt: 0,
    runs: 0,
    skips: 0,
    lastDt: 0,
    lastReason: ''
  };
}

function consumeFrameGate(gate, now, dt, fps, force, reason) {
  if (!gate) return Math.max(0, Number(dt) || 0);
  now = Number(now) || performance.now();
  dt = Math.max(0, Number(dt) || 0);
  var targetFps = fps == null ? gate.defaultFps : Number(fps);
  if (!isFinite(targetFps) || targetFps < 0) targetFps = gate.defaultFps;
  gate.targetFps = targetFps;
  gate.pendingDt += dt;
  gate.lastReason = reason || gate.lastReason || '';
  if (!targetFps || force) {
    return runFrameGate(gate, now, dt);
  }
  var minGap = 1000 / Math.max(1, targetFps);
  if (gate.lastRunAt && now - gate.lastRunAt < minGap) {
    gate.skips += 1;
    if (window.__mineradioPerf && window.__mineradioPerf.count) {
      window.__mineradioPerf.count('frameGate.' + gate.name + '.skipped');
    }
    return 0;
  }
  return runFrameGate(gate, now, dt);
}

function runFrameGate(gate, now, fallbackDt) {
  var stepDt = gate.pendingDt || fallbackDt || 0;
  gate.pendingDt = 0;
  gate.lastRunAt = now;
  gate.lastDt = Math.min(stepDt, 0.18);
  gate.runs += 1;
  if (window.__mineradioPerf && window.__mineradioPerf.count) {
    window.__mineradioPerf.count('frameGate.' + gate.name + '.runs');
  }
  return gate.lastDt;
}

function resetFrameGate(gate, now) {
  if (!gate) return;
  gate.lastRunAt = Number(now) || performance.now();
  gate.pendingDt = 0;
  gate.lastDt = 0;
  gate.lastReason = 'reset';
}

function collectFrameGateSnapshot(gates) {
  var out = {};
  Object.keys(gates || {}).forEach(function (key) {
    var gate = gates[key];
    if (!gate) return;
    out[key] = {
      name: gate.name,
      targetFps: gate.targetFps,
      runs: gate.runs,
      skips: gate.skips,
      lastDt: Math.round((gate.lastDt || 0) * 10000) / 10000,
      pendingDt: Math.round((gate.pendingDt || 0) * 10000) / 10000,
      lastReason: gate.lastReason
    };
  });
  return out;
}
