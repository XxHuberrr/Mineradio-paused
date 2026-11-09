(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CuefieldAutoMix = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  var EXECUTABLE_TIERS = { magic: true, usable: true, usable_but_not_magic: true };
  var HARD_RISKS = {
    'closed outgoing phrase': true,
    'near closed outgoing phrase': true,
  };

  function toNumber(value, fallback) {
    var n = Number(value);
    return isFinite(n) ? n : fallback;
  }

  function tierOf(plan) {
    return plan && plan.chosen && plan.chosen.evaluation && plan.chosen.evaluation.tier || '';
  }

  function scoreOf(plan) {
    var chosen = plan && plan.chosen || {};
    var evaluation = chosen.evaluation || {};
    var score = Number(evaluation.score);
    if (isFinite(score)) return score;
    score = Number(chosen.score);
    return isFinite(score) ? score : 0;
  }

  function hasHardRisk(plan) {
    var risks = plan && plan.chosen && plan.chosen.evaluation && plan.chosen.evaluation.risks || [];
    for (var i = 0; i < risks.length; i++) {
      if (HARD_RISKS[risks[i]]) return true;
    }
    return false;
  }

  function validTerminalRescue(chosen, deps) {
    if (!deps.allowSafetyFallback || chosen.technicalFailure === true) return false;
    var tolerance = 0.01;
    var mixStart = chosen.mixStart;
    var handoffAt = chosen.handoffAt;
    if (!Number.isFinite(mixStart) || !Number.isFinite(handoffAt) || handoffAt <= mixStart) return false;
    var span = handoffAt - mixStart;
    var timeline = Array.isArray(chosen.timeline) ? chosen.timeline : [];
    var handoffs = timeline.filter(function(action) {
      return action && action.op === 'handoff' && Number.isFinite(action.t);
    });
    if (handoffs.length !== 1 || Math.abs(handoffs[0].t - span) > tolerance) return false;
    var handoffT = handoffs[0].t;
    var timelineAligned = timeline.every(function(action) {
      if (!action || !Number.isFinite(action.t) || action.t < 0 || action.t > handoffT) return false;
      var duration = action.duration == null ? 0 : action.duration;
      return Number.isFinite(duration)
        && duration >= 0
        && action.t + duration / 1000 <= span + tolerance;
    });
    if (!timelineAligned) return false;
    var hasBPlay = timeline.some(function(action) {
      return action && action.deck === 'B' && action.op === 'play'
        && Math.abs(action.t) <= tolerance && Number.isFinite(action.at);
    });
    var volumeRamp = function(deck) {
      return timeline.find(function(action) {
        return action && action.deck === deck && action.op === 'volume'
          && Number.isFinite(action.value)
          && Number.isFinite(action.duration)
          && action.duration > 0;
      });
    };
    var aRamp = volumeRamp('A');
    var bRamp = volumeRamp('B');
    return hasBPlay
      && !!aRamp
      && !!bRamp
      && aRamp.t >= 0
      && bRamp.t >= 0
      && aRamp.t + aRamp.duration / 1000 <= handoffT + tolerance;
  }

  function validEndOfTrackCrossfade(chosen, deps) {
    if (!deps.allowSafetyFallback || !deps.allowLiveEndCrossfadeFallback || chosen.technicalFailure === true) return false;
    var tolerance = 0.01;
    var mixStart = chosen.mixStart;
    var handoffAt = chosen.handoffAt;
    var preRollDuration = chosen.preRollDuration;
    if (!Number.isFinite(mixStart) || !Number.isFinite(handoffAt) || handoffAt <= mixStart) return false;
    if (!Number.isFinite(preRollDuration) || preRollDuration < 0 || preRollDuration > 5) return false;
    var span = handoffAt - mixStart;
    var timeline = Array.isArray(chosen.timeline) ? chosen.timeline : [];
    if (timeline.length !== 4) return false;
    var plays = timeline.filter(function(action) { return action && action.deck === 'B' && action.op === 'play'; });
    var handoffs = timeline.filter(function(action) { return action && action.deck === 'B' && action.op === 'handoff'; });
    var aRamps = timeline.filter(function(action) { return action && action.deck === 'A' && action.op === 'volume'; });
    var bRamps = timeline.filter(function(action) { return action && action.deck === 'B' && action.op === 'volume'; });
    if (plays.length !== 1 || handoffs.length !== 1 || aRamps.length !== 1 || bRamps.length !== 1) return false;
    var play = plays[0];
    var handoff = handoffs[0];
    var aRamp = aRamps[0];
    var bRamp = bRamps[0];
    if (!Number.isFinite(play.t) || !Number.isFinite(play.at) || Math.abs(play.at) > tolerance) return false;
    if (Math.abs(play.t + preRollDuration) > tolerance || Number(play.volume) !== 0) return false;
    if (!Number.isFinite(handoff.t) || Math.abs(handoff.t - span) > tolerance) return false;
    if (aRamp.curve !== 'equal-power-out' || bRamp.curve !== 'equal-power-in') return false;
    if (Number(aRamp.value) !== 0 || Number(bRamp.value) !== 1) return false;
    var ramps = [aRamp, bRamp];
    for (var index = 0; index < ramps.length; index++) {
      var ramp = ramps[index];
      if (!Number.isFinite(ramp.t) || ramp.t < 0 || !Number.isFinite(ramp.duration) || ramp.duration <= 0) return false;
      if (ramp.t + ramp.duration / 1000 > span + tolerance) return false;
    }
    return timeline.every(function(action) {
      return action && Number.isFinite(action.t) && (action === play || action.t >= 0);
    });
  }

  function isExecutablePlan(plan, deps) {
    var tier = tierOf(plan);
    var chosen = plan && plan.chosen || {};
    var recipe = chosen.transitionRecipe || chosen.recipeCandidate && chosen.recipeCandidate.recipe || '';
    if (chosen.technicalFailure === true) return false;
    if (recipe === 'honest-start-fallback') {
      return !!deps.allowSafetyFallback && Array.isArray(chosen.timeline) && chosen.timeline.length > 0;
    }
    if (recipe === 'terminal-rescue') {
      return validTerminalRescue(chosen, deps);
    }
    if (recipe === 'end-of-track-crossfade') {
      return validEndOfTrackCrossfade(chosen, deps);
    }
    if (EXECUTABLE_TIERS[tier]) return true;
    if (recipe === 'safety-long-blend') return !!deps.allowSafetyFallback;
    if (tier !== 'weak' || !deps.allowWeak) return false;
    if (hasHardRisk(plan)) return false;
    return scoreOf(plan) >= toNumber(deps.minWeakScore, 0.58);
  }

  function executionModeFor(plan) {
    var chosen = plan && plan.chosen || {};
    var recipe = chosen.transitionRecipe || chosen.recipeCandidate && chosen.recipeCandidate.recipe || '';
    if (recipe) return recipe;
    return tierOf(plan) === 'weak' ? 'intro-bed' : 'filtered-pickup';
  }

  function timelineOf(plan) {
    var chosen = plan && plan.chosen || {};
    return Array.isArray(chosen.timeline) ? chosen.timeline : [];
  }

  function timelineLeadSec(timeline, fallback) {
    var lead = 0;
    for (var i = 0; i < timeline.length; i++) {
      var t = toNumber(timeline[i] && timeline[i].t, 0);
      if (t < 0) lead = Math.max(lead, Math.abs(t));
    }
    return lead > 0 ? lead : fallback;
  }

  function timelineBStart(timeline, fallback) {
    for (var i = 0; i < timeline.length; i++) {
      var action = timeline[i] || {};
      if (action.deck === 'B' && action.op === 'play') {
        return Math.max(0, toNumber(action.at, fallback));
      }
    }
    return fallback;
  }

  function timelineHasHandoff(timeline) {
    return timeline.some(function(action) {
      return action && action.op === 'handoff' && Number.isFinite(Number(action.t));
    });
  }

  function createCuefieldAutoMix(deps) {
    deps = deps || {};
    var state = {
      enabled: false,
      preparing: false,
      preparingKey: '',
      preparingPromise: null,
      pending: null,
      lastStatus: 'idle',
      serial: 0,
    };

    function reset(status) {
      state.pending = null;
      state.preparing = false;
      state.preparingKey = '';
      state.preparingPromise = null;
      state.lastStatus = status || 'idle';
      state.serial++;
    }

    function setEnabled(enabled) {
      state.enabled = !!enabled;
      if (!state.enabled) reset('disabled');
      return state.enabled;
    }

    async function performPrepare(ctx, currentSong, nextSong, fromKey, toKey, serial) {
      try {
        if (deps.ensureBeatMap) {
          var fromReady = await deps.ensureBeatMap(currentSong, fromKey, ctx);
          if (serial !== state.serial) return { status: 'stale' };
          var toReady = await deps.ensureBeatMap(nextSong, toKey, ctx);
          if (serial !== state.serial) return { status: 'stale' };
          if (!fromReady || !toReady) {
            reset('waiting-beatmap');
            return { status: 'waiting-beatmap' };
          }
        }
        if (!deps.planTransition) throw new Error('PLAN_TRANSITION_REQUIRED');
        var plan = await deps.planTransition(fromKey, toKey, ctx);
        if (serial !== state.serial) return { status: 'stale' };
        var chosen = plan && plan.chosen;
        var tier = tierOf(plan);
        if (plan && plan.ok === false && chosen && chosen.technicalFailure === true) {
          var technicalError = plan.error || chosen.errorCode || 'CUEFIELD_TECHNICAL_FAILURE';
          reset('technical-error');
          return { status: 'technical-error', error: technicalError, plan: plan };
        }
        if (!plan || !plan.ok || !chosen || !isExecutablePlan(plan, deps)) {
          reset('fallback');
          return { status: 'fallback', plan: plan || null };
        }
        var listenFloor = Math.max(0, toNumber(chosen.protectedUntil, 0));
        ctx.minimumListenUntil = listenFloor;
        var audioUrl = deps.prepareAudioUrl ? await deps.prepareAudioUrl(nextSong, ctx) : '';
        if (serial !== state.serial) return { status: 'stale' };
        if (!audioUrl) {
          reset('missing-audio');
          return { status: 'missing-audio', plan: plan };
        }

        var exitTime = toNumber(chosen.exit && chosen.exit.time, NaN);
        var executionMode = executionModeFor(plan);
        var timeline = timelineOf(plan);
        var fallbackLeadSec = executionMode === 'intro-bed'
          ? toNumber(ctx.introBedLeadSec, toNumber(ctx.leadSec, 1))
          : toNumber(ctx.leadSec, 1);
        var leadSec = timelineLeadSec(timeline, fallbackLeadSec);
        var protectedUntil = Math.max(0, toNumber(chosen.protectedUntil, 0));
        var explicitMixStart = chosen.mixStart != null ? Number(chosen.mixStart) : NaN;
        var explicitHandoffAt = chosen.handoffAt != null ? Number(chosen.handoffAt) : NaN;
        var hasExplicitWindow = Number.isFinite(explicitMixStart)
          && Number.isFinite(explicitHandoffAt)
          && explicitHandoffAt > explicitMixStart
          && timelineHasHandoff(timeline);
        var triggerAt = hasExplicitWindow
          ? Math.max(protectedUntil, executionMode === 'end-of-track-crossfade'
            ? explicitMixStart - leadSec
            : explicitMixStart)
          : (isFinite(exitTime) ? Math.max(protectedUntil, exitTime - leadSec) : protectedUntil);
        if (executionMode === 'end-of-track-crossfade') triggerAt = Math.round(triggerAt * 1000) / 1000;
        triggerAt = Math.max(triggerAt, listenFloor);
        var entryTime = timelineBStart(timeline, Math.max(0, toNumber(chosen.entry && chosen.entry.time, 0)));
        state.pending = {
          token: ctx.token,
          currentIndex: ctx.currentIndex,
          nextIndex: ctx.nextIndex,
          fromKey: fromKey,
          toKey: toKey,
          plan: plan,
          bridgePlan: chosen.bridgePlan || null,
          timeline: timeline,
          audioUrl: audioUrl,
          executionMode: executionMode,
          entryTime: entryTime,
          exitTime: exitTime,
          protectedUntil: protectedUntil,
          minimumListenUntil: listenFloor,
          audibleOverlap: chosen.audibleOverlap,
          preRollDuration: chosen.preRollDuration,
          exitRatio: chosen.exitRatio,
          triggerAt: triggerAt,
          createdAt: Date.now(),
        };
        if (hasExplicitWindow) {
          state.pending.mixStart = explicitMixStart;
          state.pending.handoffAt = explicitHandoffAt;
        }
        state.lastStatus = 'ready';
        return { status: 'ready', pending: state.pending };
      } catch (err) {
        reset('error');
        return { status: 'error', error: err && err.message ? err.message : String(err) };
      }
    }

    function prepare(ctx) {
      ctx = ctx || {};
      if (!state.enabled) return Promise.resolve({ status: 'disabled' });
      var currentSong = ctx.currentSong;
      var nextSong = ctx.nextSong;
      if (!currentSong || !nextSong) {
        reset('missing-queue');
        return Promise.resolve({ status: 'missing-queue' });
      }
      var getKey = deps.getKey || function(song) { return song && song.key || ''; };
      var fromKey = getKey(currentSong);
      var toKey = getKey(nextSong);
      if (!fromKey || !toKey || fromKey === toKey) {
        reset('missing-key');
        return Promise.resolve({ status: 'missing-key' });
      }
      var preparingKey = [ctx.token, ctx.currentIndex, ctx.nextIndex, fromKey, toKey].join('|');
      if (state.preparingPromise) {
        if (state.preparingKey === preparingKey) return state.preparingPromise;
        return Promise.resolve({ status: 'busy' });
      }

      var serial = ++state.serial;
      state.preparing = true;
      state.preparingKey = preparingKey;
      state.lastStatus = 'preparing';
      var promise = Promise.resolve()
        .then(function() {
          return performPrepare(ctx, currentSong, nextSong, fromKey, toKey, serial);
        })
        .finally(function() {
          if (serial !== state.serial || state.preparingPromise !== promise) return;
          state.preparing = false;
          state.preparingKey = '';
          state.preparingPromise = null;
        });
      state.preparingPromise = promise;
      return promise;
    }

    function shouldTrigger(ctx) {
      ctx = ctx || {};
      var pending = state.pending;
      if (!state.enabled || !pending) return false;
      if (pending.token !== ctx.token) return false;
      if (pending.currentIndex !== ctx.currentIndex) return false;
      if (ctx.nextKey != null && String(pending.toKey) !== String(ctx.nextKey)) return false;
      return toNumber(ctx.currentTime, 0) >= pending.triggerAt;
    }

    function consumePending() {
      var pending = state.pending;
      state.pending = null;
      state.lastStatus = pending ? 'consumed' : state.lastStatus;
      return pending;
    }

    function snapshot() {
      return {
        enabled: state.enabled,
        preparing: state.preparing,
        lastStatus: state.lastStatus,
        pending: state.pending,
      };
    }

    return {
      setEnabled: setEnabled,
      reset: reset,
      prepare: prepare,
      shouldTrigger: shouldTrigger,
      consumePending: consumePending,
      snapshot: snapshot,
    };
  }

  return {
    createCuefieldAutoMix: createCuefieldAutoMix,
  };
});
