(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CuefieldBridgeEngine = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  var TEMPLATES = { 'drum-build': true, 'echo-break': true, 'loop-rise': true, 'impact-drop': true };

  function number(value, fallback) {
    var parsed = Number(value);
    return isFinite(parsed) ? parsed : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, number(value, min)));
  }

  function round(value) {
    return Math.round(value * 1000) / 1000;
  }

  function normalizeBars(value) {
    value = number(value, 4);
    if (value >= 12) return 16;
    if (value >= 6) return 8;
    return 4;
  }

  function interpolateBridgeTempo(bpmFrom, bpmTo, bars) {
    bars = Math.max(1, Math.min(16, Math.round(number(bars, 4))));
    bpmFrom = clamp(bpmFrom, 40, 240);
    bpmTo = clamp(bpmTo, 40, 240);
    var result = [];
    for (var index = 0; index < bars; index++) {
      var progress = bars === 1 ? 1 : index / (bars - 1);
      result.push(round(bpmFrom + (bpmTo - bpmFrom) * progress));
    }
    return result;
  }

  function pushEvent(events, event) {
    if (events.length >= 512) return;
    events.push(event);
  }

  function buildBridgeEventPlan(input) {
    input = input || {};
    var template = TEMPLATES[input.template] ? input.template : 'drum-build';
    var bars = normalizeBars(input.bars);
    var tempos = interpolateBridgeTempo(input.bpmFrom == null ? 120 : input.bpmFrom, input.bpmTo == null ? 120 : input.bpmTo, bars);
    var barStarts = [];
    var calculatedDuration = 0;
    for (var index = 0; index < bars; index++) {
      barStarts.push(calculatedDuration);
      calculatedDuration += 4 * 60 / tempos[index];
    }
    var stages = Array.isArray(input.stageDurations) ? input.stageDurations.slice(0, 3).map(function(value){ return Math.max(0, number(value, 0)); }) : [];
    var stageDuration = stages.length === 3 ? stages.reduce(function(sum, value){ return sum + value; }, 0) : 0;
    var duration = round(clamp(stageDuration || calculatedDuration, 2, 64));
    var scale = duration / calculatedDuration;
    var events = [];
    for (var bar = 0; bar < bars; bar++) {
      var beatSec = 60 / tempos[bar] * scale;
      var barStart = barStarts[bar] * scale;
      for (var beat = 0; beat < 4; beat++) {
        var t = round(barStart + beat * beatSec);
        if (template !== 'echo-break' || beat === 0 || bar >= bars - 2) pushEvent(events, { t: t, type: 'kick', duration: 0.16, level: 0.16 });
        if (template === 'drum-build' || template === 'loop-rise') {
          pushEvent(events, { t: round(t + beatSec * 0.5), type: 'hat', duration: 0.06, level: 0.045 });
        }
        if (beat === 1 || beat === 3) pushEvent(events, { t: t, type: 'clap', duration: 0.09, level: 0.065 });
      }
      if (template === 'drum-build' && bar >= Math.floor(bars / 2)) {
        var rollCount = bar >= bars - 2 ? 8 : 4;
        for (var roll = 0; roll < rollCount; roll++) {
          pushEvent(events, { t: round(barStart + roll * (4 * beatSec / rollCount)), type: 'snare', duration: 0.07, level: 0.055 + roll * 0.004 });
        }
      }
      if (template === 'loop-rise') pushEvent(events, { t: round(barStart), type: 'pulse', duration: Math.min(0.24, beatSec * 0.6), level: 0.055 });
    }
    if (template === 'echo-break') {
      pushEvent(events, { t: round(duration * 0.26), type: 'downlifter', duration: Math.min(2.4, duration * 0.2), level: 0.05 });
      pushEvent(events, { t: round(duration * 0.58), type: 'pulse', duration: 0.24, level: 0.05 });
    } else if (template === 'impact-drop') {
      pushEvent(events, { t: round(duration * 0.35), type: 'downlifter', duration: Math.min(2, duration * 0.2), level: 0.05 });
    } else {
      pushEvent(events, { t: round(duration * 0.48), type: 'riser', duration: Math.min(4, duration * 0.36), level: 0.045 });
    }
    pushEvent(events, { t: round(Math.max(0, duration - 0.08)), type: 'impact', duration: 0.34, level: 0.14 });
    events.sort(function(a, b){ return a.t - b.t; });
    return { template: template, bars: bars, tempos: tempos, duration: duration, events: events };
  }

  function eventTone(event) {
    return {
      kick: ['sine', 92, 42],
      clap: ['square', 920, 480],
      hat: ['square', 6200, 3900],
      snare: ['triangle', 1480, 620],
      pulse: ['sawtooth', 110, 72],
      riser: ['sawtooth', 260, 2600],
      downlifter: ['sawtooth', 1800, 180],
      impact: ['sine', 74, 34],
    }[event.type] || ['sine', 220, 110];
  }

  function setParam(param, method, value, time) {
    if (param && typeof param[method] === 'function') param[method](value, time);
    else if (param) param.value = value;
  }

  function createCuefieldBridgeEngine() {
    var state = { active: false, nodes: [], plan: null, reason: '' };

    function stop(reason) {
      if (!state.active && !state.nodes.length) return false;
      state.nodes.forEach(function(node) {
        try { if (typeof node.stop === 'function') node.stop(); } catch (e) {}
        try { if (typeof node.disconnect === 'function') node.disconnect(); } catch (e) {}
      });
      state.nodes = [];
      state.active = false;
      state.plan = null;
      state.reason = reason || 'stop';
      return true;
    }

    function start(plan, opts) {
      opts = opts || {};
      stop('replace');
      var context = opts.audioContext;
      if (!context || typeof context.createOscillator !== 'function' || typeof context.createGain !== 'function' || !context.destination) return false;
      try {
        var eventPlan = buildBridgeEventPlan(plan);
        var origin = number(context.currentTime, 0) + 0.015;
        eventPlan.events.forEach(function(event) {
          var tone = eventTone(event);
          var oscillator = context.createOscillator();
          var gain = context.createGain();
          var startAt = origin + event.t;
          var stopAt = startAt + clamp(event.duration, 0.03, 4.5);
          oscillator.type = tone[0];
          setParam(oscillator.frequency, 'setValueAtTime', tone[1], startAt);
          setParam(oscillator.frequency, 'exponentialRampToValueAtTime', Math.max(20, tone[2]), stopAt);
          setParam(gain.gain, 'setValueAtTime', 0.0001, startAt);
          setParam(gain.gain, 'linearRampToValueAtTime', clamp(event.level, 0.005, 0.18), startAt + 0.012);
          setParam(gain.gain, 'exponentialRampToValueAtTime', 0.0001, stopAt);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start(startAt);
          oscillator.stop(stopAt);
          state.nodes.push(oscillator, gain);
        });
        state.active = true;
        state.plan = eventPlan;
        state.reason = 'start';
        return true;
      } catch (err) {
        stop('error');
        return false;
      }
    }

    function snapshot() {
      return { active: state.active, nodeCount: state.nodes.length, plan: state.plan, reason: state.reason };
    }

    return { start: start, stop: stop, snapshot: snapshot };
  }

  return {
    interpolateBridgeTempo: interpolateBridgeTempo,
    buildBridgeEventPlan: buildBridgeEventPlan,
    createCuefieldBridgeEngine: createCuefieldBridgeEngine,
  };
});

