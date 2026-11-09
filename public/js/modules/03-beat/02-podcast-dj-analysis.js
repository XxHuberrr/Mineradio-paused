function schedulePodcastDjAnalysis(songKey, audioUrl, token, durationSec) {
  cancelDjBeatAnalysisTimer();
  if (!songKey || !audioUrl) return;
  djBeatAnalysisTimer = setTimeout(function waitForDjStart() {
    djBeatAnalysisTimer = null;
    if (token !== djBeatMapToken || !djMode.active || djMode.songKey !== songKey || djBeatMapCache[songKey]) return;
    var startAnalysis = function () {
      if (token !== djBeatMapToken || !djMode.active || djMode.songKey !== songKey || djBeatMapCache[songKey]) return;
      if (djBeatMapBusy) {
        djBeatAnalysisTimer = setTimeout(waitForDjStart, 900);
        return;
      }
      if (/^https?:\/\//i.test(audioUrl || '') && (durationSec <= 0 || durationSec > 3300)) {
        analyzePodcastDjIntroBeats(audioUrl, token, durationSec).then(function (map) {
          if (token !== djBeatMapToken || !map) return;
          smoothPodcastDjIntroHandoff(songKey, map, token);
        }).catch(function (err) {
          console.warn('podcast DJ intro beat analysis failed:', err);
        });
      }
      analyzePodcastDjBeats(audioUrl, token, durationSec).then(function (map) {
        if (token !== djBeatMapToken || !map) return;
        smoothPodcastDjMapHandoff(songKey, map, token);
      }).catch(function (err) {
        console.warn('podcast DJ beat analysis failed:', err);
        hideBeatChip();
      });
    };
    scheduleAnalysisTask(startAnalysis, 900);
  }, 900);
}

async function analyzePodcastDjIntroBeats(audioUrl, token, durationSec) {
  if (!/^https?:\/\//i.test(audioUrl || '')) return null;
  if (token !== djBeatMapToken || !djMode.active) return null;
  var introResp = await fetch('/api/podcast/dj-beatmap?url=' + encodeURIComponent(audioUrl) + '&duration=' + encodeURIComponent(durationSec || 0) + '&intro=180');
  if (token !== djBeatMapToken || !djMode.active) return null;
  var introData = await introResp.json().catch(function () { return null; });
  if (introResp.ok && introData && introData.ok && introData.map && introData.map.cameraBeats && introData.map.cameraBeats.length >= 4) {
    return introData.map;
  }
  return null;
}

async function buildPodcastDjLowOnlyBeatMap(buffer, token) {
  if (!buffer) return null;
  var sr = buffer.sampleRate || 44100;
  var duration = buffer.duration || (buffer.length / sr) || 0;
  var hopSec = duration > 4200 ? 0.0125 : 0.010;
  var hopSize = Math.max(256, Math.floor(sr * hopSec));
  var nFrames = Math.max(1, Math.floor(buffer.length / hopSize));
  var lowEnergy = new Float32Array(nFrames);
  var hitEnergy = new Float32Array(nFrames);
  var channels = Math.max(1, buffer.numberOfChannels || 1);
  var ch0 = buffer.getChannelData(0);
  var ch1 = channels > 1 ? buffer.getChannelData(1) : null;
  var chList = null;
  if (channels > 2) {
    chList = [];
    for (var ch = 0; ch < channels; ch++) chList.push(buffer.getChannelData(ch));
  }
  function makeBiquad(type, freq, q) {
    freq = Math.max(8, Math.min(freq, sr * 0.45));
    var w0 = 2 * Math.PI * freq / sr;
    var cos = Math.cos(w0);
    var sin = Math.sin(w0);
    var alpha = sin / (2 * (q || 0.707));
    var b0, b1, b2, a0, a1, a2;
    if (type === 'highpass') {
      b0 = (1 + cos) * 0.5;
      b1 = -(1 + cos);
      b2 = (1 + cos) * 0.5;
    } else {
      b0 = (1 - cos) * 0.5;
      b1 = 1 - cos;
      b2 = (1 - cos) * 0.5;
    }
    a0 = 1 + alpha;
    a1 = -2 * cos;
    a2 = 1 - alpha;
    var inv = 1 / a0;
    return { b0: b0 * inv, b1: b1 * inv, b2: b2 * inv, a1: a1 * inv, a2: a2 * inv, x1: 0, x2: 0, y1: 0, y2: 0 };
  }
  function runBiquad(st, x) {
    var y = st.b0 * x + st.b1 * st.x1 + st.b2 * st.x2 - st.a1 * st.y1 - st.a2 * st.y2;
    st.x2 = st.x1; st.x1 = x; st.y2 = st.y1; st.y1 = y;
    return y;
  }
  var hp = makeBiquad('highpass', 32, 0.72);
  var lp = makeBiquad('lowpass', 178, 0.82);
  showBeatChip('DJ kick scan 0%');
  for (var f = 0; f < nFrames; f++) {
    var start = f * hopSize;
    var end = Math.min(buffer.length, start + hopSize);
    var sum = 0;
    var peak = 0;
    for (var i = start; i < end; i++) {
      var x;
      if (chList) {
        x = 0;
        for (var ci = 0; ci < channels; ci++) x += chList[ci][i];
        x /= channels;
      } else if (ch1) {
        x = (ch0[i] + ch1[i]) * 0.5;
      } else {
        x = ch0[i];
      }
      var y = runBiquad(lp, runBiquad(hp, x || 0));
      var ay = Math.abs(y);
      sum += y * y;
      if (ay > peak) peak = ay;
    }
    var count = Math.max(1, end - start);
    lowEnergy[f] = Math.sqrt(sum / count);
    hitEnergy[f] = peak;
    if (f > 0 && f % 720 === 0) {
      if (f % 4320 === 0) showBeatChip('DJ kick scan ' + Math.min(99, Math.round(f / nFrames * 100)) + '%');
      await yieldToPaint();
      if (token !== djBeatMapToken || !djMode.active) { hideBeatChip(); return null; }
    }
  }
  if (token !== djBeatMapToken || !djMode.active) { hideBeatChip(); return null; }

  function percentile(arr, p, maxSamples) {
    var len = arr ? arr.length : 0;
    if (!len) return 0.001;
    maxSamples = maxSamples || 14000;
    var sample;
    if (len <= maxSamples) {
      sample = Array.prototype.slice.call(arr);
    } else {
      sample = new Array(maxSamples);
      var step = (len - 1) / (maxSamples - 1);
      for (var si = 0; si < maxSamples; si++) sample[si] = arr[Math.min(len - 1, Math.floor(si * step))] || 0;
    }
    sample.sort(function (a, b) { return a - b; });
    return sample[Math.max(0, Math.min(sample.length - 1, Math.floor(sample.length * p)))] || 0.001;
  }
  function bandAt(arr, idx) {
    idx = Math.max(0, Math.min(nFrames - 1, idx | 0));
    var a = arr[Math.max(0, idx - 1)] || 0;
    var b = arr[idx] || 0;
    var c = arr[Math.min(nFrames - 1, idx + 1)] || 0;
    return (a + b * 2 + c) * 0.25;
  }
  function median(vals) {
    vals = vals.filter(function (v) { return isFinite(v); }).sort(function (a, b) { return a - b; });
    return vals.length ? vals[Math.floor(vals.length * 0.5)] : 0;
  }
  var lowFloor = Math.max(0.0004, percentile(lowEnergy, 0.22));
  var lowMid = Math.max(lowFloor + 0.0002, percentile(lowEnergy, 0.58));
  var lowRef = Math.max(lowMid + 0.0002, percentile(lowEnergy, 0.86));
  var lowCeil = Math.max(lowRef + 0.0004, percentile(lowEnergy, 0.96));
  var hitRef = Math.max(0.0004, percentile(hitEnergy, 0.86));

  showBeatChip('DJ locking kick grid...');
  var onset = new Float32Array(nFrames);
  for (var oi = 4; oi < nFrames; oi++) {
    var prev = lowEnergy[oi - 1] * 0.62 + lowEnergy[oi - 2] * 0.28 + lowEnergy[oi - 3] * 0.10;
    var lowRise = Math.max(0, lowEnergy[oi] - prev);
    var wideRise = Math.max(0, (lowEnergy[oi] + lowEnergy[oi - 1]) * 0.5 - (lowEnergy[oi - 3] + lowEnergy[oi - 4]) * 0.5);
    var peakRise = Math.max(0, hitEnergy[oi] - hitEnergy[oi - 2] * 0.84);
    onset[oi] = lowRise * 1.72 + wideRise * 0.86 + peakRise * 0.10;
  }

  var winN = Math.max(52, Math.round(0.82 / hopSec));
  var minFrameGap = Math.max(18, Math.round(0.215 / hopSec));
  var candidates = [];
  var sumO = 0, sqO = 0;
  for (var wi = 0; wi < winN; wi++) { var ow = onset[wi] || 0; sumO += ow; sqO += ow * ow; }
  for (var cf = winN + 4; cf < nFrames - 4; cf++) {
    var mean = sumO / winN;
    var std = Math.sqrt(Math.max(0, sqO / winN - mean * mean));
    var th = mean + std * 1.66 + lowRef * 0.0038;
    var o = onset[cf];
    if (o > th && o >= onset[cf - 1] && o > onset[cf + 1]) {
      var peakF = cf;
      var peakScore = o + lowEnergy[cf] * 0.10;
      for (var pf = cf - 2; pf <= cf + 3; pf++) {
        var ps = (onset[pf] || 0) + (lowEnergy[pf] || 0) * 0.10;
        if (ps > peakScore) { peakScore = ps; peakF = pf; }
      }
      var lowTone = Math.min(2.6, bandAt(lowEnergy, peakF) / lowRef);
      var hitTone = Math.min(2.6, bandAt(hitEnergy, peakF) / hitRef);
      var lowRel = clamp01((bandAt(lowEnergy, peakF) - lowFloor) / Math.max(0.0001, lowCeil - lowFloor));
      var score = (o - th) / Math.max(0.0006, std + mean * 0.38 + lowRef * 0.012);
      if (score > 0.16 && (lowTone > 0.32 || lowRel > 0.22 || hitTone > 0.52)) {
        var cand = {
          frame: peakF,
          time: peakF * hopSec,
          score: score,
          lowTone: lowTone,
          hitTone: hitTone,
          lowRel: lowRel,
          raw: o
        };
        cand.power = cand.score * 0.56 + Math.pow(clamp01((cand.lowTone - 0.22) / 1.42), 0.82) * 0.34 + Math.min(1.5, cand.hitTone) * 0.08 + cand.lowRel * 0.10;
        var last = candidates[candidates.length - 1];
        if (last && cand.frame - last.frame < minFrameGap) {
          if (cand.power > last.power) candidates[candidates.length - 1] = cand;
        } else {
          candidates.push(cand);
        }
      }
    }
    var old = onset[cf - winN] || 0;
    var next = onset[cf] || 0;
    sumO += next - old;
    sqO += next * next - old * old;
    if (cf > winN && cf % 3600 === 0) {
      await yieldToPaint();
      if (token !== djBeatMapToken || !djMode.active) { hideBeatChip(); return null; }
    }
  }
  if (!candidates.length) {
    return { kicks: [], beats: [], pulseBeats: [], cameraBeats: [], duration: duration, visualBeatCount: 0, tempoSource: 'podcast-dj-low-empty', analyzedAt: Date.now() };
  }

  var powers = candidates.map(function (c) { return c.power; });
  var p30 = percentile(powers, 0.30);
  var p50 = percentile(powers, 0.50);
  var p90 = Math.max(p50 + 0.001, percentile(powers, 0.90));
  var p96 = Math.max(p90 + 0.001, percentile(powers, 0.965));
  var strong = candidates.filter(function (c) { return c.power >= p50 && c.lowTone > 0.34; });
  if (strong.length < 16) strong = candidates.slice();
  function estimateStep(list) {
    if (!list || list.length < 3) return 0;
    var bin = 0.006;
    var hist = {};
    var medGaps = [];
    var minStep = 0.31;
    var maxStep = 0.86;
    for (var ai = 0; ai < list.length; ai++) {
      for (var bi = ai + 1; bi < list.length && bi < ai + 10; bi++) {
        var rawGap = list[bi].time - list[ai].time;
        if (rawGap < 0.24) continue;
        if (rawGap > 2.55) break;
        for (var div = 1; div <= 6; div++) {
          var g = rawGap / div;
          if (g < minStep) break;
          if (g > maxStep) continue;
          var weight = Math.sqrt(Math.max(0.001, list[ai].power * list[bi].power)) / Math.sqrt((bi - ai) * div);
          var key = Math.round(g / bin);
          hist[key] = (hist[key] || 0) + weight;
          medGaps.push(g);
        }
      }
    }
    var bestKey = null, bestScore = 0;
    Object.keys(hist).forEach(function (k) {
      var key = parseInt(k, 10);
      var score = (hist[key] || 0) + (hist[key - 1] || 0) * 0.72 + (hist[key + 1] || 0) * 0.72;
      if (score > bestScore) { bestScore = score; bestKey = key; }
    });
    if (bestKey != null) return bestKey * bin;
    return median(medGaps);
  }
  var globalStep = estimateStep(strong) || estimateStep(candidates) || 0.50;
  globalStep = clampRange(globalStep, 0.32, 0.86);

  function nearestCandidate(center, windowSec, startIdx) {
    var best = null;
    var bestScore = -Infinity;
    var j = startIdx || 0;
    while (j < candidates.length && candidates[j].time < center - windowSec) j++;
    for (var ni = j; ni < candidates.length && candidates[ni].time <= center + windowSec; ni++) {
      var dist = Math.abs(candidates[ni].time - center);
      var score = candidates[ni].power * (1 - dist / Math.max(0.001, windowSec) * 0.42);
      if (score > bestScore) { best = candidates[ni]; bestScore = score; }
    }
    return best;
  }
  function scorePhase(anchorTime, step) {
    var start = anchorTime;
    while (start - step > 0.05) start -= step;
    var end = Math.min(duration, 180);
    var win = Math.max(0.055, Math.min(0.125, step * 0.18));
    var score = 0, count = 0, cursor = 0;
    for (var gt = start; gt < end; gt += step) {
      while (cursor < candidates.length && candidates[cursor].time < gt - win) cursor++;
      var best = null, bestScore = 0;
      for (var pi = cursor; pi < candidates.length && candidates[pi].time <= gt + win; pi++) {
        var dist = Math.abs(candidates[pi].time - gt);
        var s = candidates[pi].power * (1 - dist / win * 0.44);
        if (s > bestScore) { bestScore = s; best = candidates[pi]; }
      }
      score += best ? bestScore : -p30 * 0.08;
      count++;
    }
    return count ? score / count : -Infinity;
  }
  var phaseSource = strong.filter(function (c) { return c.time < Math.min(duration, 180); }).slice(0, 72);
  if (!phaseSource.length) phaseSource = strong.slice(0, 1);
  var bestAnchor = phaseSource[0] ? phaseSource[0].time : 0;
  var bestAnchorScore = -Infinity;
  for (var pa = 0; pa < phaseSource.length; pa++) {
    var sc = scorePhase(phaseSource[pa].time, globalStep);
    if (sc > bestAnchorScore) { bestAnchorScore = sc; bestAnchor = phaseSource[pa].time; }
  }
  var halfStep = globalStep * 0.5;
  if (halfStep >= 0.31) {
    var halfScore = scorePhase(bestAnchor, halfStep);
    if (halfScore > bestAnchorScore * 1.04) globalStep = halfStep;
  }
  var anchor = bestAnchor;
  while (anchor - globalStep > 0.05) anchor -= globalStep;

  var sectionLen = duration > 3600 ? 96 : 72;
  var sectionCount = Math.max(1, Math.ceil(duration / sectionLen));
  var sectionSteps = [];
  for (var secIdx = 0; secIdx < sectionCount; secIdx++) {
    var t0 = secIdx * sectionLen, t1 = Math.min(duration, t0 + sectionLen);
    var seg = strong.filter(function (c) { return c.time >= t0 && c.time < t1; });
    var prevStep = sectionSteps.length ? sectionSteps[sectionSteps.length - 1] : globalStep;
    var localStep = estimateStep(seg) || prevStep || globalStep;
    if (prevStep) localStep = clampRange(localStep, prevStep * 0.94, prevStep * 1.06);
    if (globalStep) localStep = clampRange(localStep, globalStep * 0.86, globalStep * 1.14);
    var blended = prevStep ? (localStep * 0.30 + prevStep * 0.70) : localStep;
    sectionSteps.push(blended || globalStep);
  }
  function stepAt(time) {
    var idx = Math.max(0, Math.min(sectionSteps.length - 1, Math.floor(time / sectionLen)));
    return sectionSteps[idx] || globalStep || 0.50;
  }

  var beats = [];
  var gridIndex = 0;
  var cursorIdx = 0;
  for (var gridT = anchor; gridT < duration - 0.04;) {
    var localStep2 = stepAt(gridT) || globalStep || 0.50;
    var winSec = Math.max(0.060, Math.min(0.135, localStep2 * 0.20));
    while (cursorIdx < candidates.length && candidates[cursorIdx].time < gridT - winSec) cursorIdx++;
    var bestCand = nearestCandidate(gridT, winSec, cursorIdx);
    var gf = Math.max(0, Math.min(nFrames - 1, Math.round(gridT / hopSec)));
    var gridLow = bandAt(lowEnergy, gf);
    var gridHit = bandAt(hitEnergy, gf);
    var gridLowTone = Math.min(2.6, gridLow / lowRef);
    var gridHitTone = Math.min(2.6, gridHit / hitRef);
    var lowTone2 = bestCand ? Math.max(gridLowTone * 0.62, bestCand.lowTone) : gridLowTone;
    var hitTone2 = bestCand ? Math.max(gridHitTone * 0.62, bestCand.hitTone) : gridHitTone;
    var distPenalty = bestCand ? (1 - Math.min(1, Math.abs(bestCand.time - gridT) / winSec) * 0.26) : 0.54;
    var basePower = bestCand ? bestCand.power * distPenalty : (gridLowTone * 0.25 + gridHitTone * 0.06);
    var powerRel = clamp01((basePower - p30 * 0.78) / Math.max(0.001, p96 - p30 * 0.78));
    var lowRel2 = clamp01((gridLow - lowFloor) / Math.max(0.0001, lowCeil - lowFloor));
    var kickRel = clamp01(powerRel * 0.74 + lowRel2 * 0.22 + clamp01((hitTone2 - 0.26) / 1.70) * 0.04);
    var softGrid = (!bestCand && lowRel2 < 0.20) || kickRel < 0.16;
    var slot = gridIndex % 4;
    var combo = slot === 0 ? 'downbeat' : (slot === 1 ? 'push' : (slot === 2 ? 'drop' : 'rebound'));
    if (kickRel > 0.84 && combo !== 'downbeat') combo = 'accent';
    var visualRel = kickRel > 0.76 ? 0.76 + (kickRel - 0.76) * 0.52 : kickRel;
    var downLift = combo === 'downbeat' ? (visualRel > 0.18 ? (0.016 + visualRel * 0.036) : visualRel * 0.028) : 0;
    var sectionGate = clamp01((kickRel - 0.10) / 0.58);
    var impact = Math.max(0.020, Math.min(0.88, 0.022 + Math.pow(visualRel, 1.62) * 0.86 + downLift));
    var strength = Math.max(0.12, Math.min(0.93, 0.13 + Math.pow(visualRel, 1.12) * 0.68 + downLift * 0.70));
    if (softGrid) {
      var softMul = combo === 'downbeat' ? 0.48 : 0.30;
      impact *= softMul;
      strength *= 0.58 + sectionGate * 0.22;
    }
    var timingPull = bestCand ? (0.24 + clamp01((kickRel - 0.25) / 0.65) * 0.46) : 0;
    var sourceTime = bestCand ? (gridT * (1 - timingPull) + bestCand.time * timingPull) : gridT;
    var cameraActive = impact >= 0.13 || (combo === 'downbeat' && kickRel >= 0.14) || (bestCand && kickRel >= 0.18);
    var lowMix = Math.max(0.42, Math.min(0.90, 0.52 + visualRel * 0.32 + lowTone2 * 0.035 - (combo === 'accent' ? 0.10 : 0)));
    var bodyMix = Math.max(0.035, Math.min(0.54, 0.060 + visualRel * 0.12 + (combo === 'push' ? 0.18 : 0) + (combo === 'drop' ? 0.24 : 0)));
    var snapMix = Math.max(0.015, Math.min(0.62, 0.026 + (combo === 'accent' ? 0.40 : 0) + (combo === 'rebound' ? 0.08 : 0) + visualRel * 0.038));
    beats.push({
      time: sourceTime,
      strength: strength,
      confidence: Math.max(0.44, Math.min(0.99, 0.46 + kickRel * 0.43 + (bestCand ? 0.08 : -0.03))),
      impact: impact,
      primary: cameraActive,
      camera: cameraActive,
      pulse: impact > 0.16 || (combo === 'downbeat' && kickRel >= 0.18),
      tone: 'podcast-dj-low-grid',
      low: lowMix,
      body: bodyMix,
      snap: snapMix,
      mass: Math.max(0.36, Math.min(0.94, lowMix * 0.72 + Math.pow(visualRel, 1.22) * 0.24)),
      sharpness: Math.max(0.03, Math.min(0.28, snapMix * 1.18)),
      combo: combo,
      step: localStep2,
      index: beats.length,
      dj: true,
      grid: true,
      kickOnly: true
    });
    gridIndex++;
    gridT += localStep2;
    if (gridIndex > 0 && gridIndex % 1800 === 0) {
      await yieldToPaint();
      if (token !== djBeatMapToken || !djMode.active) { hideBeatChip(); return null; }
    }
  }

  var cameraBeats = beats.filter(function (b) { return b.camera !== false; });
  var pulseBeats = beats.filter(function (b) { return b.pulse !== false && (b.impact >= 0.16 || b.combo === 'downbeat'); }).map(function (b) {
    return { time: b.time, strength: b.strength, impact: b.impact, combo: b.combo, low: b.low, body: b.body, snap: b.snap, dj: true };
  });
  console.log('podcast DJ low-only beatmap:', Math.round(duration) + 's', 'step:', globalStep.toFixed(3), 'candidates:', candidates.length, 'beats:', beats.length);
  return {
    kicks: beats.map(function (b) { return b.time; }),
    beats: beats,
    pulseBeats: pulseBeats,
    cameraBeats: cameraBeats,
    gridStep: globalStep,
    sectionSteps: sectionSteps,
    tempoSource: 'podcast-dj-low-offline',
    duration: duration,
    visualBeatCount: cameraBeats.length,
    analyzedAt: Date.now()
  };
}

async function analyzePodcastDjBeats(audioUrl, token, durationSec) {
  try {
    djBeatMapBusy = true;
    showBeatChip('DJ 离线锁拍…');
    await yieldToIdle(520);
    if (token !== djBeatMapToken || !djMode.active) { hideBeatChip(); return null; }
    durationSec = Math.max(0, Number(durationSec) || 0);
    var preferServerAnalysis = /^https?:\/\//i.test(audioUrl || '') && (durationSec <= 0 || durationSec > 3300);
    if (preferServerAnalysis) {
      showBeatChip('DJ 长播客后端锁拍...');
      var serverResp = await fetch('/api/podcast/dj-beatmap?url=' + encodeURIComponent(audioUrl) + '&duration=' + encodeURIComponent(durationSec));
      if (token !== djBeatMapToken || !djMode.active) { hideBeatChip(); return null; }
      var serverData = await serverResp.json().catch(function () { return null; });
      if (serverResp.ok && serverData && serverData.ok && serverData.map) return serverData.map;
      console.warn('podcast DJ server analysis failed:', serverData && serverData.error);
      hideBeatChip();
      if (durationSec <= 0 || durationSec > 3300) return null;
    }
    var fetchAudioUrl = /^https?:\/\//i.test(audioUrl || '') ? ('/api/audio?url=' + encodeURIComponent(audioUrl)) : audioUrl;
    var resp = await fetch(fetchAudioUrl);
    if (token !== djBeatMapToken || !djMode.active) { hideBeatChip(); return null; }
    var ab = await resp.arrayBuffer();
    if (token !== djBeatMapToken || !djMode.active) { hideBeatChip(); return null; }

    showBeatChip('DJ 解码音频…');
    var TmpCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    var DecodeCtx = window.AudioContext || window.webkitAudioContext;
    if (!DecodeCtx) { hideBeatChip(); return null; }
    var dc = new DecodeCtx();
    var buffer = await new Promise(function (resolve, reject) {
      dc.decodeAudioData(ab, resolve, reject);
    }).catch(function (e) { console.warn('podcast DJ decode failed:', e); return null; });
    ab = null;
    dc.close && dc.close();
    if (!buffer || token !== djBeatMapToken || !djMode.active) { hideBeatChip(); return null; }
    return await buildPodcastDjLowOnlyBeatMap(buffer, token);

    var sr = buffer.sampleRate;
    async function renderDjBand(hpFreq, lpFreq, label) {
      showBeatChip('DJ 分离' + label + '…');
      var off = new TmpCtx(1, buffer.length, sr);
      var src = off.createBufferSource();
      src.buffer = buffer;
      var node = src;
      if (hpFreq) {
        var hp = off.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = Math.min(hpFreq, sr * 0.45);
        hp.Q.value = 0.78;
        node.connect(hp);
        node = hp;
      }
      if (lpFreq) {
        var lp = off.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = Math.min(lpFreq, sr * 0.45);
        lp.Q.value = 0.86;
        node.connect(lp);
        node = lp;
      }
      node.connect(off.destination);
      src.start(0);
      var rendered = await off.startRendering();
      if (token !== djBeatMapToken || !djMode.active) return null;
      await yieldToIdle(280);
      return rendered.getChannelData(0);
    }

    var lowPcm = await renderDjBand(34, 170, '低频');
    if (!lowPcm) { hideBeatChip(); return null; }
    var bodyPcm = await renderDjBand(150, 560, '鼓身');
    if (!bodyPcm) { hideBeatChip(); return null; }
    var snapPcm = await renderDjBand(1700, 9200, '高频');
    if (!snapPcm) { hideBeatChip(); return null; }

    var hopSec = 0.012;
    var hopSize = Math.max(256, Math.floor(sr * hopSec));
    async function makeEnergy(pcm, label) {
      showBeatChip('DJ 读取' + label + '…');
      var frames = Math.floor(pcm.length / hopSize);
      var out = new Float32Array(frames);
      for (var f = 0; f < frames; f++) {
        var sum = 0;
        var off2 = f * hopSize;
        for (var i = 0; i < hopSize; i++) {
          var v = pcm[off2 + i] || 0;
          sum += v * v;
        }
        out[f] = Math.sqrt(sum / hopSize);
        if (f > 0 && f % 1800 === 0) {
          await yieldToPaint();
          if (token !== djBeatMapToken || !djMode.active) return null;
        }
      }
      return out;
    }

    var lowEnergy = await makeEnergy(lowPcm, '低频');
    var bodyEnergy = await makeEnergy(bodyPcm, '鼓身');
    var snapEnergy = await makeEnergy(snapPcm, '高频');
    if (!lowEnergy || !bodyEnergy || !snapEnergy || token !== djBeatMapToken || !djMode.active) { hideBeatChip(); return null; }

    var nFrames = Math.min(lowEnergy.length, bodyEnergy.length, snapEnergy.length);
    function percentile(arr, p) {
      var copy = Array.prototype.slice.call(arr).sort(function (a, b) { return a - b; });
      return copy.length ? copy[Math.max(0, Math.min(copy.length - 1, Math.floor(copy.length * p)))] : 0.001;
    }
    function bandAt(arr, f) {
      var a = arr[Math.max(0, f - 1)] || 0;
      var b = arr[f] || 0;
      var c = arr[Math.min(nFrames - 1, f + 1)] || 0;
      return (a + b * 2 + c) * 0.25;
    }
    function median(vals) {
      vals = vals.filter(function (v) { return isFinite(v); }).sort(function (a, b) { return a - b; });
      return vals.length ? vals[Math.floor(vals.length * 0.5)] : 0;
    }
    var lowRef = Math.max(0.0008, percentile(lowEnergy, 0.86));
    var bodyRef = Math.max(0.0008, percentile(bodyEnergy, 0.84));
    var snapRef = Math.max(0.0008, percentile(snapEnergy, 0.84));

    showBeatChip('DJ 计算主拍…');
    var onset = new Float32Array(nFrames);
    for (var oi = 2; oi < nFrames; oi++) {
      var lowRise = Math.max(0, lowEnergy[oi] - lowEnergy[oi - 1]);
      var lowWide = Math.max(0, lowEnergy[oi] - lowEnergy[oi - 2]);
      var bodyRise = Math.max(0, bodyEnergy[oi] - bodyEnergy[oi - 1]);
      var snapRise = Math.max(0, snapEnergy[oi] - snapEnergy[oi - 1]);
      onset[oi] = lowRise * 1.52 + lowWide * 0.58 + bodyRise * 0.16 + snapRise * 0.035;
    }

    var winN = Math.max(44, Math.round(0.78 / hopSec));
    var minFrameGap = Math.max(18, Math.round(0.215 / hopSec));
    var candidates = [];
    var lastFrame = -minFrameGap;
    var sum = 0, sq = 0;
    for (var wi = 0; wi < winN; wi++) { sum += onset[wi] || 0; sq += (onset[wi] || 0) * (onset[wi] || 0); }
    for (var f2 = winN + 1; f2 < nFrames - 2; f2++) {
      var mean = sum / winN;
      var std = Math.sqrt(Math.max(0, sq / winN - mean * mean));
      var th = mean + std * 1.90 + lowRef * 0.006;
      var o = onset[f2];
      if (o > th && o >= onset[f2 - 1] && o > onset[f2 + 1] && f2 - lastFrame >= minFrameGap) {
        var lowTone = Math.min(2.2, bandAt(lowEnergy, f2) / lowRef);
        var bodyTone = Math.min(2.2, bandAt(bodyEnergy, f2) / bodyRef);
        var snapTone = Math.min(2.2, bandAt(snapEnergy, f2) / snapRef);
        var lowDom = lowTone / Math.max(0.001, bodyTone * 0.46 + snapTone * 0.18);
        var score = (o - th) / Math.max(0.0008, std + mean * 0.42);
        var kickLike = lowTone > 0.42 && (lowDom > 0.92 || lowTone > 0.82);
        if (kickLike && score > 0.28) {
          candidates.push({
            frame: f2,
            time: f2 * hopSec,
            score: score,
            lowTone: lowTone,
            bodyTone: bodyTone,
            snapTone: snapTone,
            lowDom: lowDom,
            raw: o
          });
          lastFrame = f2;
        }
      }
      var old = onset[f2 - winN] || 0;
      var next = onset[f2] || 0;
      sum += next - old;
      sq += next * next - old * old;
      if (f2 > winN && f2 % 2200 === 0) {
        await yieldToPaint();
        if (token !== djBeatMapToken || !djMode.active) { hideBeatChip(); return null; }
      }
    }

    if (!candidates.length) {
      hideBeatChip();
      return { kicks: [], beats: [], pulseBeats: [], cameraBeats: [], duration: buffer.duration, visualBeatCount: 0, tempoSource: 'podcast-dj-empty', analyzedAt: Date.now() };
    }

    var strong = candidates.filter(function (c) { return c.score > 0.52 && c.lowTone > 0.52; });
    if (strong.length < 8) strong = candidates.slice();
    var allGaps = [];
    for (var gi = 1; gi < strong.length; gi++) {
      var g = strong[gi].time - strong[gi - 1].time;
      while (g > 0.94) g *= 0.5;
      while (g < 0.30) g *= 2.0;
      if (g >= 0.30 && g <= 0.94) allGaps.push(g);
    }
    var globalStep = median(allGaps) || 0.50;
    var sectionLen = 48;
    var sectionCount = Math.max(1, Math.ceil(buffer.duration / sectionLen));
    var sectionSteps = [];
    for (var si = 0; si < sectionCount; si++) {
      var t0 = si * sectionLen, t1 = t0 + sectionLen;
      var seg = strong.filter(function (c) { return c.time >= t0 && c.time < t1; });
      var gaps = [];
      for (var sg = 1; sg < seg.length; sg++) {
        var gap = seg[sg].time - seg[sg - 1].time;
        while (gap > 0.94) gap *= 0.5;
        while (gap < 0.30) gap *= 2.0;
        if (gap >= 0.30 && gap <= 0.94) gaps.push(gap);
      }
      var prevSectionStep = sectionSteps.length ? sectionSteps[sectionSteps.length - 1] : globalStep;
      var step = median(gaps) || prevSectionStep || globalStep;
      if (globalStep) step = clampRange(step, globalStep * 0.90, globalStep * 1.10);
      if (prevSectionStep && Math.abs(step - prevSectionStep) / prevSectionStep > 0.08) {
        step = step * 0.28 + prevSectionStep * 0.72;
      } else if (prevSectionStep) {
        step = step * 0.42 + prevSectionStep * 0.58;
      }
      sectionSteps.push(step || globalStep);
    }
    function stepAt(time) {
      var idx = Math.max(0, Math.min(sectionSteps.length - 1, Math.floor(time / sectionLen)));
      return sectionSteps[idx] || globalStep || 0.50;
    }

    var powers = candidates.map(function (c) {
      c.power = c.score * 0.50 + c.lowTone * 0.26 + Math.min(1.8, c.lowDom) * 0.16 + c.bodyTone * 0.06 + c.snapTone * 0.02;
      return c.power;
    });
    var p35 = percentile(powers, 0.35);
    var p50 = percentile(powers, 0.50);
    var p90 = Math.max(p50 + 0.001, percentile(powers, 0.90));
    var phaseSource = strong.length ? strong : candidates;
    var phaseCandidates = phaseSource.filter(function (c) { return c.time < Math.min(buffer.duration, 120); }).slice(0, 56);
    if (!phaseCandidates.length) phaseCandidates = phaseSource.slice(0, 1);
    function nearestCandidate(center, windowSec, startIdx) {
      var best = null;
      var bestScore = -Infinity;
      var j = startIdx || 0;
      while (j < candidates.length && candidates[j].time < center - windowSec) j++;
      for (var ni = j; ni < candidates.length && candidates[ni].time <= center + windowSec; ni++) {
        var dist = Math.abs(candidates[ni].time - center);
        var score = candidates[ni].power * (1 - dist / Math.max(0.001, windowSec) * 0.48);
        if (score > bestScore) {
          best = candidates[ni];
          bestScore = score;
        }
      }
      return best;
    }
    function scorePhase(anchorTime) {
      var step = globalStep || 0.50;
      var start = anchorTime;
      while (start - step > 0.05) start -= step;
      var end = Math.min(buffer.duration, 132);
      var win = Math.max(0.060, Math.min(0.130, step * 0.18));
      var score = 0, count = 0, cursor = 0;
      for (var gt = start; gt < end; gt += step) {
        while (cursor < candidates.length && candidates[cursor].time < gt - win) cursor++;
        var best = null, bestScore = 0;
        for (var pi = cursor; pi < candidates.length && candidates[pi].time <= gt + win; pi++) {
          var dist = Math.abs(candidates[pi].time - gt);
          var s = candidates[pi].power * (1 - dist / win * 0.45);
          if (s > bestScore) { bestScore = s; best = candidates[pi]; }
        }
        if (best) score += bestScore;
        else score -= p35 * 0.10;
        count++;
      }
      return count ? score / count : -Infinity;
    }
    var bestAnchor = phaseCandidates[0] ? phaseCandidates[0].time : 0;
    var bestAnchorScore = -Infinity;
    for (var pa = 0; pa < phaseCandidates.length; pa++) {
      var sc = scorePhase(phaseCandidates[pa].time);
      if (sc > bestAnchorScore) {
        bestAnchorScore = sc;
        bestAnchor = phaseCandidates[pa].time;
      }
    }
    var anchor = bestAnchor;
    while (anchor - (globalStep || 0.50) > 0.05) anchor -= (globalStep || 0.50);

    var beats = [];
    var gridIndex = 0;
    var cursorIdx = 0;
    for (var gridT = anchor; gridT < buffer.duration - 0.05;) {
      var localStep = stepAt(gridT) || globalStep || 0.50;
      var winSec = Math.max(0.070, Math.min(0.145, localStep * 0.22));
      while (cursorIdx < candidates.length && candidates[cursorIdx].time < gridT - winSec) cursorIdx++;
      var bestCand = nearestCandidate(gridT, winSec, cursorIdx);
      var gf = Math.max(0, Math.min(nFrames - 1, Math.round(gridT / hopSec)));
      var gridLowTone = Math.min(2.2, bandAt(lowEnergy, gf) / lowRef);
      var gridBodyTone = Math.min(2.2, bandAt(bodyEnergy, gf) / bodyRef);
      var gridSnapTone = Math.min(2.2, bandAt(snapEnergy, gf) / snapRef);
      var sourceTime = bestCand ? (gridT * 0.38 + bestCand.time * 0.62) : gridT;
      var powerBase = bestCand ? bestCand.power : (gridLowTone * 0.22 + gridBodyTone * 0.04 + gridSnapTone * 0.02);
      var distPenalty = bestCand ? (1 - Math.min(1, Math.abs(bestCand.time - gridT) / winSec) * 0.30) : 0.58;
      var powerRel = clamp01(((powerBase * distPenalty) - p35 * 0.78) / Math.max(0.001, p90 - p35 * 0.78));
      var lowTone2 = bestCand ? Math.max(gridLowTone * 0.55, bestCand.lowTone) : gridLowTone;
      var bodyTone2 = bestCand ? Math.max(gridBodyTone * 0.50, bestCand.bodyTone) : gridBodyTone;
      var snapTone2 = bestCand ? Math.max(gridSnapTone * 0.50, bestCand.snapTone) : gridSnapTone;
      var toneTotal = Math.max(0.001, lowTone2 + bodyTone2 * 0.72 + snapTone2 * 0.48);
      var lowMix = lowTone2 / toneTotal;
      var bodyMix = (bodyTone2 * 0.72) / toneTotal;
      var snapMix = (snapTone2 * 0.48) / toneTotal;
      var comboSlot = gridIndex % 4;
      var combo = comboSlot === 0 ? 'downbeat' : (comboSlot === 1 ? 'push' : (comboSlot === 2 ? 'drop' : 'rebound'));
      if (powerRel > 0.86 && combo !== 'downbeat') combo = 'accent';
      var weakGrid = !bestCand && gridLowTone < 0.50 && powerRel < 0.24;
      if (!weakGrid || comboSlot === 0 || powerRel > 0.18) {
        var downLift = combo === 'downbeat' ? 0.06 : 0;
        var strength = Math.max(0.18, Math.min(0.94, 0.20 + Math.pow(powerRel, 1.22) * 0.54 + lowMix * 0.08 + downLift));
        var impact = Math.max(0.10, Math.min(0.96, Math.pow(powerRel, 1.36) * 0.82 + lowMix * 0.12 + downLift));
        beats.push({
          time: sourceTime,
          strength: strength,
          confidence: Math.max(0.46, Math.min(0.98, 0.50 + powerRel * 0.38 + lowMix * 0.10 - (bestCand ? 0 : 0.10))),
          impact: impact,
          primary: true,
          camera: true,
          pulse: impact > 0.18 || combo === 'downbeat',
          tone: 'podcast-dj-grid',
          low: Math.max(0.24, Math.min(0.90, lowMix * 0.78 + powerRel * 0.18)),
          body: Math.max(0.03, Math.min(0.60, bodyMix)),
          snap: Math.max(0.02, Math.min(0.50, snapMix)),
          mass: Math.max(0.28, Math.min(0.96, lowMix * 0.74 + Math.pow(powerRel, 1.25) * 0.24)),
          sharpness: Math.max(0.03, Math.min(0.62, snapMix * 1.10)),
          combo: combo,
          step: localStep,
          index: beats.length,
          dj: true,
          grid: true
        });
      }
      gridIndex++;
      gridT += localStep;
      if (gridIndex > 0 && gridIndex % 1800 === 0) {
        await yieldToPaint();
        if (token !== djBeatMapToken || !djMode.active) { hideBeatChip(); return null; }
      }
    }

    var pulseBeats = beats.filter(function (b) { return b.strength >= 0.38 || b.combo === 'downbeat'; }).map(function (b) {
      return { time: b.time, strength: b.strength, impact: b.impact, combo: b.combo, low: b.low, body: b.body, snap: b.snap, dj: true };
    });
    await yieldToPaint();
    if (token !== djBeatMapToken || !djMode.active) { hideBeatChip(); return null; }
    return {
      kicks: beats.map(function (b) { return b.time; }),
      beats: beats,
      pulseBeats: pulseBeats,
      cameraBeats: beats,
      gridStep: globalStep,
      sectionSteps: sectionSteps,
      tempoSource: 'podcast-dj-offline',
      duration: buffer.duration,
      visualBeatCount: beats.length,
      analyzedAt: Date.now()
    };
  } catch (err) {
    console.warn('podcast DJ analysis failed:', err);
    hideBeatChip();
    return null;
  } finally {
    djBeatMapBusy = false;
  }
}

function applyPodcastDjProfileFromMap(map) {
  if (!map || !djMode.active) return;
  var density = (map.cameraBeats || []).length / Math.max(20, map.duration || 20);
  cinemaTrackProfile.density = density;
  var target = 0.82 + clamp01((density - 1.25) / 1.8) * 0.16;
  target = clampRange(target, 0.76, 1.10);
  cinemaTrackProfile.target = target;
  cinemaTrackProfile.scale += (target - cinemaTrackProfile.scale) * 0.34;
}

function smoothPodcastDjMapHandoff(songKey, map, token) {
  if (!map) return;
  showBeatChip('DJ 锁拍完成…');
  var apply = function () {
    if (token !== djBeatMapToken || !djMode.active || djMode.songKey !== songKey) return;
    djBeatMapCache[songKey] = map;
    currentDjBeatMap = map;
    applyPodcastDjProfileFromMap(map);
    syncPodcastDjMapCursor(audio ? audio.currentTime : 0, true);
    notifyDesktopLyricsBeatMapReady();
    hideBeatChip();
    showToast('DJ 离线锁拍完成: ' + (map.visualBeatCount || 0) + ' 个主拍');
  };
  scheduleVisualApply(apply, 260, 360);
}

function smoothPodcastDjIntroHandoff(songKey, map, token) {
  if (!map || !map.partial) return;
  if (currentDjBeatMap && !currentDjBeatMap.partial) return;
  var apply = function () {
    if (token !== djBeatMapToken || !djMode.active || djMode.songKey !== songKey) return;
    if (currentDjBeatMap && !currentDjBeatMap.partial) return;
    currentDjBeatMap = map;
    applyPodcastDjProfileFromMap(map);
    syncPodcastDjMapCursor(audio ? audio.currentTime : 0, true);
    notifyDesktopLyricsBeatMapReady();
    showBeatChip('DJ 开头已锁拍，全曲继续分析…');
  };
  scheduleVisualApply(apply, 0, 240);
}

