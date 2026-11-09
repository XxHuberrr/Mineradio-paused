(function installMineradioPerformanceProbe() {
  var PERF_PROBE_VERSION = 'foreground-cpu-phase-a';
  var MAX_SAMPLES_PER_METRIC = 90;
  var MAX_TOP_METRICS = 24;

  function readNow() {
    return (typeof performance !== 'undefined' && performance && performance.now)
      ? performance.now()
      : Date.now();
  }

  function emptyMap() {
    return Object.create(null);
  }

  function roundNumber(value, digits) {
    var scale = Math.pow(10, digits || 0);
    return Math.round((Number(value) || 0) * scale) / scale;
  }

  function clonePlainMap(map) {
    var out = {};
    Object.keys(map || {}).forEach(function (key) {
      out[key] = map[key];
    });
    return out;
  }

  function cloneRenderState(renderState) {
    if (!renderState) return null;
    return {
      mode: renderState.mode,
      fps: renderState.fps,
      frames: renderState.frames,
      skipped: renderState.skipped,
      longFrames: renderState.longFrames,
      targetFps: renderState.targetFps,
      displayHz: renderState.displayHz,
      adaptiveDivisor: renderState.adaptiveDivisor,
      adaptiveKind: renderState.adaptiveKind,
      adaptivePressure: renderState.adaptivePressure,
      adaptiveFrameCostMs: renderState.adaptiveFrameCostMs,
      foregroundFpsMode: renderState.foregroundFpsMode,
      interactionBoost: renderState.interactionBoost,
      lastRenderAt: roundNumber(renderState.lastRenderAt, 2),
      lastSampleAt: roundNumber(renderState.lastSampleAt, 2)
    };
  }

  var state = {
    version: PERF_PROBE_VERSION,
    enabled: true,
    startedAt: readNow(),
    lastResetAt: readNow(),
    renderState: null,
    metrics: emptyMap(),
    counters: emptyMap()
  };

  function metricFor(name) {
    var key = String(name || 'unknown');
    if (!state.metrics[key]) {
      state.metrics[key] = {
        name: key,
        count: 0,
        totalMs: 0,
        avgMs: 0,
        maxMs: 0,
        lastMs: 0,
        samples: []
      };
    }
    return state.metrics[key];
  }

  function mark(name, costMs) {
    if (!state.enabled) return null;
    var cost = Number(costMs);
    if (!isFinite(cost) || cost < 0) return null;
    var metric = metricFor(name);
    metric.count += 1;
    metric.totalMs += cost;
    metric.lastMs = cost;
    if (cost > metric.maxMs) metric.maxMs = cost;
    metric.avgMs = metric.totalMs / Math.max(1, metric.count);
    metric.samples.push(roundNumber(cost, 3));
    if (metric.samples.length > MAX_SAMPLES_PER_METRIC) metric.samples.shift();
    return metric;
  }

  function markSince(name, start) {
    return mark(name, readNow() - Number(start || 0));
  }

  function begin(name) {
    var start = readNow();
    return function finishMetric() {
      return markSince(name, start);
    };
  }

  function measure(name, fn) {
    var start = readNow();
    try {
      return fn();
    } finally {
      markSince(name, start);
    }
  }

  function count(name, amount) {
    if (!state.enabled) return 0;
    var key = String(name || 'unknown');
    var delta = Number(amount);
    if (!isFinite(delta)) delta = 1;
    state.counters[key] = (state.counters[key] || 0) + delta;
    return state.counters[key];
  }

  function metricSummary(metric) {
    return {
      count: metric.count,
      totalMs: roundNumber(metric.totalMs, 3),
      avgMs: roundNumber(metric.avgMs, 3),
      maxMs: roundNumber(metric.maxMs, 3),
      lastMs: roundNumber(metric.lastMs, 3),
      samples: metric.samples.slice(-18)
    };
  }

  function metricsByTotal(limit) {
    return Object.keys(state.metrics)
      .map(function (key) { return state.metrics[key]; })
      .sort(function (a, b) { return b.totalMs - a.totalMs; })
      .slice(0, limit || MAX_TOP_METRICS)
      .map(function (metric) {
        return {
          name: metric.name,
          count: metric.count,
          totalMs: roundNumber(metric.totalMs, 3),
          avgMs: roundNumber(metric.avgMs, 3),
          maxMs: roundNumber(metric.maxMs, 3),
          lastMs: roundNumber(metric.lastMs, 3)
        };
      });
  }

  function summary() {
    var metrics = {};
    Object.keys(state.metrics).forEach(function (key) {
      metrics[key] = metricSummary(state.metrics[key]);
    });
    return {
      version: state.version,
      enabled: state.enabled,
      uptimeMs: roundNumber(readNow() - state.startedAt, 1),
      sinceResetMs: roundNumber(readNow() - state.lastResetAt, 1),
      render: cloneRenderState(state.renderState),
      counters: clonePlainMap(state.counters),
      topByTotal: metricsByTotal(MAX_TOP_METRICS),
      metrics: metrics
    };
  }

  function snapshot() {
    var snap = summary();
    if (typeof collectRuntimePerfSnapshot === 'function') {
      try {
        snap.runtimeSnapshot = collectRuntimePerfSnapshot(readNow());
      } catch (e) {
        snap.runtimeSnapshotError = String(e && e.message || e);
      }
    }
    return snap;
  }

  function reset() {
    state.metrics = emptyMap();
    state.counters = emptyMap();
    state.lastResetAt = readNow();
    return summary();
  }

  function attachLegacyRenderKeys(api, renderState) {
    ['mode', 'fps', 'frames', 'skipped', 'longFrames', 'targetFps', 'displayHz', 'adaptiveDivisor', 'adaptiveKind', 'adaptivePressure', 'adaptiveFrameCostMs', 'foregroundFpsMode', 'interactionBoost', 'lastRenderAt', 'lastSampleAt'].forEach(function (key) {
      try {
        Object.defineProperty(api, key, {
          configurable: true,
          enumerable: false,
          get: function () {
            return renderState ? renderState[key] : undefined;
          },
          set: function (value) {
            if (renderState) renderState[key] = value;
          }
        });
      } catch (e) { }
    });
  }

  function registerRenderState(renderState) {
    state.renderState = renderState || null;
    attachLegacyRenderKeys(api, state.renderState);
    return api;
  }

  var api = {
    version: PERF_PROBE_VERSION,
    state: state,
    now: readNow,
    mark: mark,
    markSince: markSince,
    begin: begin,
    measure: measure,
    count: count,
    summary: summary,
    snapshot: snapshot,
    reset: reset,
    registerRenderState: registerRenderState
  };

  window.__mineradioPerf = api;
})();
