(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CuefieldSourceLoop = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function finite(value, fallback) {
    var number = Number(value);
    return isFinite(number) ? number : fallback;
  }

  function createCuefieldSourceLoop(deps) {
    deps = deps || {};
    var now = deps.now || function() { return Date.now(); };
    var setIntervalFn = deps.setInterval || setInterval;
    var clearIntervalFn = deps.clearInterval || clearInterval;
    var state = {
      active: false,
      media: null,
      sessionKey: '',
      startAt: 0,
      loopSeconds: 0,
      slip: true,
      slipOrigin: 0,
      startedAt: 0,
      timer: null,
    };

    function safeSeek(media, time) {
      if (!media || !isFinite(time)) return false;
      var duration = finite(media.duration, 0);
      var target = duration > 0 ? Math.min(Math.max(0, time), Math.max(0, duration - 0.05)) : Math.max(0, time);
      try { media.currentTime = target; return true; } catch (error) { return false; }
    }

    function clearTimer() {
      if (state.timer != null) clearIntervalFn(state.timer);
      state.timer = null;
    }

    function tick() {
      if (!state.active || !state.media || state.media.paused) return;
      var current = finite(state.media.currentTime, state.startAt);
      var end = state.startAt + state.loopSeconds;
      if (current < state.startAt || current >= end - 0.012) safeSeek(state.media, state.startAt);
    }

    function stop(reason, releaseSlip) {
      if (!state.active) return false;
      var media = state.media;
      var target = state.slipOrigin + Math.max(0, now() - state.startedAt) / 1000;
      var shouldRelease = releaseSlip === true && state.slip;
      clearTimer();
      state.active = false;
      state.media = null;
      state.sessionKey = '';
      if (shouldRelease) safeSeek(media, target);
      return true;
    }

    function apply(action, media, sessionKey) {
      action = action || {};
      if (action.enabled === false) return stop('release', true);
      if (!media) return false;
      var key = String(sessionKey || '');
      if (state.active && (state.media !== media || state.sessionKey !== key)) stop('stale', false);
      var startAt = Math.max(0, finite(action.startAt, finite(media.currentTime, 0)));
      var loopSeconds = Math.max(0.08, finite(action.loopSeconds, 0));
      if (!state.active) {
        state.active = true;
        state.media = media;
        state.sessionKey = key;
        state.slipOrigin = finite(media.currentTime, startAt);
        state.startedAt = now();
        state.timer = setIntervalFn(tick, 20);
      }
      state.startAt = startAt;
      state.loopSeconds = loopSeconds;
      state.slip = action.slip !== false;
      safeSeek(media, startAt);
      return true;
    }

    function snapshot() {
      return {
        active: state.active,
        sessionKey: state.sessionKey,
        startAt: state.startAt,
        loopSeconds: state.loopSeconds,
        slip: state.slip,
      };
    }

    return { apply: apply, stop: stop, snapshot: snapshot };
  }

  return { createCuefieldSourceLoop: createCuefieldSourceLoop };
});

