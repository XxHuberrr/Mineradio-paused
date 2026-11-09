(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CuefieldTimelineExecutor = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function toNumber(value, fallback) {
    var n = Number(value);
    return isFinite(n) ? n : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, toNumber(value, min)));
  }

  function round(value, digits) {
    var factor = Math.pow(10, digits == null ? 3 : digits);
    return Math.round(toNumber(value, 0) * factor) / factor;
  }

  function finiteOption(value) {
    if (value == null) return null;
    var n = Number(value);
    return isFinite(n) ? n : null;
  }

  function buildEqualPowerCurve(direction, points) {
    var count = Math.max(2, Math.round(toNumber(points, 33)));
    var incoming = direction !== 'out';
    var values = [];
    for (var i = 0; i < count; i++) {
      var progress = i / (count - 1);
      var value = incoming
        ? Math.sin(progress * Math.PI / 2)
        : Math.cos(progress * Math.PI / 2);
      values.push(round(value, 6));
    }
    values[0] = incoming ? 0 : 1;
    values[count - 1] = incoming ? 1 : 0;
    return values;
  }

  function buildVolumeOnlyCuefieldExecution(opts) {
    opts = opts || {};
    var leadSec = 2.2;
    var threshold = 0.08;
    var incomingAudibleAt = leadSec * (1 - Math.pow(1 - threshold, 1 / 3));
    var outgoingSilentAt = opts.outgoingCurve === 'cubic-ease-out'
      ? leadSec * (1 - Math.pow(threshold, 1 / 3))
      : leadSec * (1 - threshold);
    var anchorTime = Math.max(0, toNumber(opts.anchorTime, 0));
    var targetVolume = clamp(opts.targetVolume == null ? 1 : opts.targetVolume, 0, 1);
    var bStart = round(Math.max(0, anchorTime - leadSec));
    return {
      leadSec: leadSec,
      bStart: bStart,
      handoffDelayMs: 2200,
      audibleStartDelayMs: Math.round(incomingAudibleAt * 1000),
      audibleOverlap: round(Math.max(0, outgoingSilentAt - incomingAudibleAt)),
      preRollDuration: round(incomingAudibleAt),
      requiresBGraph: false,
      actions: [
        { delayMs: 0, durationMs: 0, deck: 'B', op: 'play', type: '', curve: '', value: 1, at: bStart },
        { delayMs: 0, durationMs: 2200, deck: 'B', op: 'volume', type: '', curve: '', value: 1, target: targetVolume, at: 0 },
        { delayMs: 0, durationMs: 2200, deck: 'A', op: 'volume', type: '', curve: '', value: 0, target: 0, at: 0 },
      ],
    };
  }

  function shouldReleaseCuefieldDeckGraph(opts) {
    opts = opts || {};
    return !!opts.hasGraph && !opts.isPrepared && !opts.isActiveGraph;
  }

  function transferCuefieldGainOwnership(opts) {
    opts = opts || {};
    var mediaVolume = clamp(opts.mediaVolume == null ? 1 : opts.mediaVolume, 0, 1);
    var graphGain = clamp(opts.graphGain == null ? 1 : opts.graphGain, 0, 1);
    return {
      mediaVolume: 1,
      graphGain: round(opts.gainOwned ? graphGain : mediaVolume * graphGain, 6),
      gainOwned: true,
    };
  }

  function normalizeAction(action, offsetSec, targetVolume, originT, playbackRate, sourceZeroPreRoll) {
    action = action || {};
    var actionTime = toNumber(action.t, 0);
    var value = clamp(action.value == null ? 1 : action.value, 0, 1);
    var normalized = {
      t: round(actionTime),
      delayMs: Math.max(0, Math.round((actionTime + offsetSec) * 1000)),
      durationMs: Math.max(0, Math.round(toNumber(action.duration, 0))),
      deck: action.deck === 'A' ? 'A' : 'B',
      op: String(action.op || ''),
      type: String(action.type || ''),
      curve: String(action.curve || ''),
      value: value,
      at: Math.max(0, toNumber(action.at, 0)),
      optionalWhenLate: action.optionalWhenLate === true,
      maxLateMs: Math.round(clamp(action.maxLateMs, 0, 200)),
      sourceZeroPreRoll: sourceZeroPreRoll === true,
    };
    if (normalized.deck === 'B' && normalized.op === 'play' && originT != null && actionTime < originT && !sourceZeroPreRoll) {
      normalized.at = round(normalized.at + (originT - actionTime) * clamp(playbackRate, 0.94, 1.06));
    }
    if (normalized.op === 'volume') normalized.target = round(targetVolume * value);
    if (normalized.op === 'filter') {
      normalized.value = normalized.type === 'none'
        ? 20
        : round(clamp(toNumber(action.value, 650), 20, 6000));
    }
    if (normalized.op === 'echo') {
      normalized.enabled = action.enabled !== false;
      normalized.bpm = round(clamp(toNumber(action.bpm, 120), 40, 240));
      normalized.delayBeats = round(clamp(toNumber(action.delayBeats, 0.5), 0.125, 2));
      normalized.feedback = round(clamp(toNumber(action.feedback, 0), 0, 0.72));
      normalized.wet = round(clamp(toNumber(action.wet, 0), 0, 0.5));
      normalized.tailMs = Math.round(clamp(toNumber(action.tailMs, 1200), 300, 4000));
    }
    if (normalized.op === 'duck') {
      normalized.bpm = round(clamp(toNumber(action.bpm, 120), 40, 240));
      normalized.depth = round(clamp(toNumber(action.depth, 0.35), 0.08, 0.75));
      normalized.pulses = Math.round(clamp(toNumber(action.pulses, 4), 1, 16));
      normalized.beats = round(clamp(toNumber(action.beats, 1), 0.25, 4));
      normalized.attack = Math.round(clamp(toNumber(action.attack, 24), 5, 120));
      normalized.hold = Math.round(clamp(toNumber(action.hold, 70), 10, 180));
      normalized.release = Math.round(clamp(toNumber(action.release, 180), 40, 320));
    }
    if (normalized.op === 'spectrum') {
      normalized.low = round(clamp(toNumber(action.low, 1), 0, 1));
      normalized.mid = round(clamp(toNumber(action.mid, 1), 0, 1));
      normalized.high = round(clamp(toNumber(action.high, 1), 0, 1));
    }
    if (normalized.op === 'rate') {
      normalized.value = round(clamp(toNumber(action.value, 1), 0.94, 1.06));
    }
    if (normalized.op === 'loop') {
      normalized.enabled = action.enabled !== false;
      normalized.startAt = Math.max(0, round(toNumber(action.startAt, normalized.at)));
      normalized.bpm = round(clamp(toNumber(action.bpm, 120), 40, 240));
      normalized.loopBeats = round(clamp(toNumber(action.loopBeats, 1), 0.5, 8));
      normalized.loopSeconds = round(60 / normalized.bpm * normalized.loopBeats);
      normalized.slip = action.slip !== false;
    }
    if (normalized.op === 'bridge') {
      var bridge = action.bridge || {};
      var template = ['drum-build', 'echo-break', 'loop-rise', 'impact-drop'].indexOf(bridge.template) >= 0
        ? bridge.template
        : 'drum-build';
      var requestedBars = toNumber(bridge.bars, 4);
      var bars = requestedBars >= 12 ? 16 : (requestedBars >= 6 ? 8 : 4);
      normalized.durationMs = Math.min(64000, normalized.durationMs);
      normalized.bridge = {
        template: template,
        bars: bars,
        bpmFrom: round(clamp(toNumber(bridge.bpmFrom, 120), 40, 240)),
        bpmTo: round(clamp(toNumber(bridge.bpmTo, 120), 40, 240)),
        stageDurations: Array.isArray(bridge.stageDurations)
          ? bridge.stageDurations.slice(0, 3).map(function(value){ return round(Math.max(0, toNumber(value, 0))); })
          : [],
      };
      normalized.fallbackTimeline = Array.isArray(action.fallbackTimeline) ? action.fallbackTimeline.slice() : [];
    }
    return normalized;
  }

  function leadFromTimeline(timeline, fallback) {
    var lead = 0;
    for (var i = 0; i < timeline.length; i++) {
      var t = toNumber(timeline[i] && timeline[i].t, 0);
      if (t < 0) lead = Math.max(lead, Math.abs(t));
    }
    return lead > 0 ? round(lead) : fallback;
  }

  function bStartFromTimeline(timeline, fallback) {
    for (var i = 0; i < timeline.length; i++) {
      var action = timeline[i] || {};
      if (action.deck === 'B' && action.op === 'play') return Math.max(0, toNumber(action.at, fallback));
    }
    return fallback;
  }

  function fallbackTimeline(opts) {
    var mode = opts.executionMode || 'filtered-pickup';
    var entryTime = Math.max(0, toNumber(opts.entryTime, 0));
    if (mode === 'intro-bed') {
      var introLead = 5.2;
      return {
        leadSec: introLead,
        bStart: Math.max(0, entryTime - Math.min(5.2, Math.max(2.2, entryTime * 0.7))),
        actions: [
          { t: -introLead, deck: 'B', op: 'play', at: Math.max(0, entryTime - introLead), volume: 0 },
          { t: -introLead, deck: 'B', op: 'volume', value: 0.32, duration: 1700 },
          { t: -3.5, deck: 'A', op: 'volume', value: 0, duration: 2700 },
          { t: -3.5, deck: 'B', op: 'volume', value: 1, duration: 2700 },
          { t: -1.06, deck: 'B', op: 'handoff' },
        ],
      };
    }
    return {
      leadSec: 2.8,
      bStart: Math.max(0, entryTime - Math.min(2.4, Math.max(0.8, entryTime * 0.45))),
      actions: [
        { t: -2.8, deck: 'B', op: 'play', at: Math.max(0, entryTime - 2.8), volume: 0 },
        { t: -2.8, deck: 'B', op: 'volume', value: 1, duration: 2600 },
        { t: -2.8, deck: 'A', op: 'volume', value: 0, duration: 2600 },
        { t: -0.46, deck: 'B', op: 'handoff' },
      ],
    };
  }

  function buildCuefieldTimelineExecution(opts) {
    opts = opts || {};
    var rawTimeline = Array.isArray(opts.timeline) ? opts.timeline.slice() : [];
    var targetVolume = clamp(opts.targetVolume == null ? 1 : opts.targetVolume, 0, 1);
    var fallback = rawTimeline.length ? null : fallbackTimeline(opts);
    var timeline = rawTimeline.length ? rawTimeline : fallback.actions;
    var leadSec = rawTimeline.length ? leadFromTimeline(timeline, 2.8) : fallback.leadSec;
    var mixStart = finiteOption(opts.mixStart);
    var handoffAt = finiteOption(opts.handoffAt);
    var rawHandoff = timeline.filter(function(action) { return action && action.op === 'handoff'; }).slice(-1)[0];
    var explicitWindow = mixStart != null && handoffAt != null && handoffAt > mixStart && !!rawHandoff;
    var originT = explicitWindow
      ? toNumber(rawHandoff.t, 0) - Math.max(0, handoffAt - mixStart)
      : null;
    var requestedPreRoll = Math.max(0, toNumber(opts.preRollDuration, 0));
    var rawPlay = timeline.filter(function(action) {
      return action && action.deck === 'B' && action.op === 'play';
    })[0] || null;
    var sourceZeroPreRoll = !!(explicitWindow
      && rawPlay
      && toNumber(rawPlay.t, 0) < originT
      && Math.abs(toNumber(rawPlay.at, 0)) <= 0.001
      && requestedPreRoll > 0
      && Math.abs(Math.abs(toNumber(rawPlay.t, 0)) - requestedPreRoll) <= 0.01);
    var executionStartT = sourceZeroPreRoll ? toNumber(rawPlay.t, originT) : originT;
    var offsetSec = explicitWindow ? -executionStartT : leadSec;
    var entryTime = Math.max(0, toNumber(opts.entryTime, 0));
    var rateActions = timeline.filter(function(action) {
      return action && action.deck === 'B' && action.op === 'rate';
    }).sort(function(a, b) { return toNumber(a.t, 0) - toNumber(b.t, 0); });
    function rateAt(time) {
      var value = 1;
      for (var index = 0; index < rateActions.length; index++) {
        if (toNumber(rateActions[index].t, 0) > time) break;
        value = clamp(toNumber(rateActions[index].value, 1), 0.94, 1.06);
      }
      return value;
    }
    var actions = timeline
      .map(function(action) {
        return normalizeAction(
          action,
          offsetSec,
          targetVolume,
          originT,
          rateAt(toNumber(action && action.t, 0)),
          sourceZeroPreRoll && action === rawPlay
        );
      })
      .filter(function(action) { return !!action.op; })
      .sort(function(a, b) {
        return a.delayMs - b.delayMs || a.t - b.t;
      });
    var play = actions.filter(function(action) { return action.deck === 'B' && action.op === 'play'; })[0];
    var bStart = play ? play.at : (rawTimeline.length ? bStartFromTimeline(timeline, entryTime) : fallback.bStart);
    var requiresBGraph = actions.some(function(action) {
      return action.deck === 'B' && (
        action.op === 'filter'
        || action.op === 'bass'
        || action.op === 'spectrum'
        || action.op === 'echo'
        || action.op === 'duck'
        || (action.op === 'volume' && action.curve.indexOf('equal-power-') === 0)
      );
    });
    var requiresAGraph = actions.some(function(action) {
      return action.deck === 'A' && (action.op === 'echo' || action.op === 'duck');
    });
    var requiresBridge = actions.some(function(action) { return action.op === 'bridge'; });
    var requiresSourceLoop = actions.some(function(action) { return action.op === 'loop'; });
    var handoff = actions.filter(function(action) { return action.op === 'handoff'; }).slice(-1)[0];
    var lastAction = actions[actions.length - 1] || null;
    var handoffDelayMs = handoff
      ? handoff.delayMs
      : (lastAction ? lastAction.delayMs + Math.max(520, lastAction.durationMs) : Math.round(leadSec * 1000));

    return {
      leadSec: round(leadSec),
      bStart: round(bStart),
      handoffDelayMs: Math.max(explicitWindow ? 0 : 520, handoffDelayMs),
      audibleStartDelayMs: explicitWindow
        ? Math.max(0, Math.round((originT - executionStartT) * 1000))
        : null,
      audibleOverlap: finiteOption(opts.audibleOverlap),
      preRollDuration: finiteOption(opts.preRollDuration),
      requiresAGraph: requiresAGraph,
      requiresBGraph: requiresBGraph,
      requiresBridge: requiresBridge,
      requiresSourceLoop: requiresSourceLoop,
      actions: actions,
    };
  }

  return {
    buildCuefieldTimelineExecution: buildCuefieldTimelineExecution,
    buildEqualPowerCurve: buildEqualPowerCurve,
    buildVolumeOnlyCuefieldExecution: buildVolumeOnlyCuefieldExecution,
    shouldReleaseCuefieldDeckGraph: shouldReleaseCuefieldDeckGraph,
    transferCuefieldGainOwnership: transferCuefieldGainOwnership,
  };
});
