var MEMORY_REDUCT_MASK_BITS = {
  workingSet: 1,
  modifiedList: 4,
  standbyList: 8,
  standbyLow: 16
};
var MEMORY_REDUCT_MASK_DEFAULT = 29;
var memorySnapshotTimer = 0;
var memoryLastSnapshotAt = 0;
var memoryLastStatusPayload = null;
var MEMORY_SAFE_REVISION = 3;

function normalizeMemorySystemMask(mask) {
  var value = Math.round(Number(mask) || MEMORY_REDUCT_MASK_DEFAULT) & MEMORY_REDUCT_MASK_DEFAULT;
  return value > 0 ? value : MEMORY_REDUCT_MASK_DEFAULT;
}

function ensureMemoryFxDefaults() {
  if (!fx) return;
  if (fx.memoryAutoTrimApp !== false) fx.memoryAutoTrimApp = true;
  if (fx.memoryAutoTrimOnBackground !== false) fx.memoryAutoTrimOnBackground = true;
  if (fx.memorySafetyRevision !== MEMORY_SAFE_REVISION) {
    fx.memorySafetyRevision = MEMORY_SAFE_REVISION;
  }
  fx.memoryAutoSystemTrim = fx.memoryAutoSystemTrim === true;
  fx.memorySystemAutoElevate = fx.memorySystemAutoElevate === true;
  fx.memorySystemIntervalMin = clampRange(Math.round(fx.memorySystemIntervalMin == null ? fxDefaults.memorySystemIntervalMin : Number(fx.memorySystemIntervalMin)), 5, 180);
  fx.memorySystemThresholdPercent = clampRange(Math.round(fx.memorySystemThresholdPercent == null ? fxDefaults.memorySystemThresholdPercent : Number(fx.memorySystemThresholdPercent)), 50, 98);
  fx.memorySystemMask = normalizeMemorySystemMask(fx.memorySystemMask == null ? fxDefaults.memorySystemMask : fx.memorySystemMask);
}

function memoryAutoConfigPayload(runNow) {
  ensureMemoryFxDefaults();
  return {
    appTrimEnabled: !(fx && fx.memoryAutoTrimApp === false),
    backgroundTrimEnabled: !(fx && fx.memoryAutoTrimOnBackground === false),
    enabled: !!(fx && fx.memoryAutoSystemTrim && fx.memoryAutoTrimOnBackground !== false),
    mask: normalizeMemorySystemMask(fx && fx.memorySystemMask),
    intervalMin: Math.max(5, Math.round(Number(fx && fx.memorySystemIntervalMin) || 30)),
    thresholdPercent: Math.max(50, Math.min(98, Math.round(Number(fx && fx.memorySystemThresholdPercent) || 78))),
    autoElevate: !!(fx && fx.memorySystemAutoElevate),
    runNow: runNow === true
  };
}

function rememberMemoryStatusPayload(payload) {
  if (!payload) return;
  if (payload.snapshot || Object.prototype.hasOwnProperty.call(payload, 'systemPurgeAvailable')) {
    memoryLastStatusPayload = Object.assign({}, memoryLastStatusPayload || {}, payload);
    return;
  }
  if (memoryLastStatusPayload) {
    memoryLastStatusPayload.auto = payload.state || payload.auto || memoryLastStatusPayload.auto;
  }
}

function configureMemoryReductFromFx(reason, runNow) {
  if (!window.desktopWindow || typeof window.desktopWindow.configureMemoryReduct !== 'function') return Promise.resolve(null);
  return window.desktopWindow.configureMemoryReduct(memoryAutoConfigPayload(runNow)).then(function (payload) {
    rememberMemoryStatusPayload(payload);
    updateMemoryControls();
    return payload;
  }).catch(function (error) {
    updateMemoryStatusText('Mem Reduct 配置失败: ' + String(error && error.message || error || ''));
    return null;
  });
}

function memoryFormatSnapshot(snapshot) {
  if (!snapshot) return '系统内存读取中...';
  var total = Math.round(Number(snapshot.totalMB) || 0);
  var used = Math.round(Number(snapshot.usedMB) || 0);
  var free = Math.round(Number(snapshot.freeMB) || 0);
  var percent = Math.round(Number(snapshot.usedPercent) || 0);
  var proc = snapshot.process || {};
  var rss = Math.round(Number(proc.rssMB) || 0);
  return '系统 ' + used + '/' + total + ' MB (' + percent + '%), 可用 ' + free + ' MB, 播放器 ' + rss + ' MB';
}

function updateMemoryStatusText(text) {
  var chip = document.getElementById('memory-status-chip');
  if (chip) chip.textContent = text || '系统内存读取中...';
}

function refreshMemorySnapshot(force) {
  if (!window.desktopWindow || typeof window.desktopWindow.getMemorySnapshot !== 'function') {
    updateMemoryStatusText('当前不是桌面版，系统内存优化不可用');
    return Promise.resolve(null);
  }
  var now = performance.now();
  if (!force && now - memoryLastSnapshotAt < 5000 && memoryLastStatusPayload) {
    return Promise.resolve(memoryLastStatusPayload);
  }
  memoryLastSnapshotAt = now;
  return window.desktopWindow.getMemorySnapshot().then(function (payload) {
    if (payload) rememberMemoryStatusPayload(payload);
    else memoryLastStatusPayload = null;
    var status = payload && payload.ok ? memoryFormatSnapshot(payload.snapshot) : '系统内存读取失败';
    if (payload && payload.elevated) status += ' | 管理员';
    updateMemoryStatusText(status);
    updateMemoryControls();
    return payload;
  }).catch(function (error) {
    updateMemoryStatusText('系统内存读取失败: ' + String(error && error.message || error || ''));
    return null;
  });
}

function updateMemoryControls() {
  ensureMemoryFxDefaults();
  [
    ['memoryAutoTrimApp', 't-memoryAutoTrimApp'],
    ['memoryAutoTrimOnBackground', 't-memoryAutoTrimOnBackground'],
    ['memoryAutoSystemTrim', 't-memoryAutoSystemTrim'],
    ['memorySystemAutoElevate', 't-memorySystemAutoElevate']
  ].forEach(function (pair) {
    var el = document.getElementById(pair[1]);
    if (el) el.classList.toggle('on', !!fx[pair[0]]);
  });
  var systemAvailable = !memoryLastStatusPayload || memoryLastStatusPayload.systemPurgeAvailable !== false;
  ['t-memoryAutoSystemTrim', 't-memorySystemAutoElevate'].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('dev-locked');
    el.setAttribute('aria-disabled', 'false');
    el.title = systemAvailable
      ? 'Mem Reduct will run only after Mineradio is hidden/minimized and threshold/interval allow it.'
      : 'System-level Mem Reduct is not confirmed by the desktop process yet; app trim remains active.';
  });
  document.querySelectorAll('#memory-mask-seg [data-memory-mask]').forEach(function (btn) {
    var bit = MEMORY_REDUCT_MASK_BITS[btn.getAttribute('data-memory-mask')] || 0;
    btn.classList.toggle('active', !!(normalizeMemorySystemMask(fx.memorySystemMask) & bit));
  });
  var maskSeg = document.getElementById('memory-mask-seg');
  if (maskSeg) maskSeg.classList.remove('dev-locked');
  document.querySelectorAll('.memory-action-row button').forEach(function (btn, index) {
    if (index === 1) {
      btn.disabled = !systemAvailable;
      btn.classList.toggle('dev-locked', !systemAvailable);
      btn.title = systemAvailable
        ? 'Manual system memory release. Mineradio skips it while the main window is visible to avoid CPU spikes.'
        : 'System-level purge is unavailable; background app trim remains active.';
    } else if (index > 1) {
      btn.disabled = !systemAvailable;
      btn.classList.toggle('dev-locked', !systemAvailable);
      btn.title = systemAvailable
        ? 'Manual elevated release. Minimize or hide Mineradio first; the foreground window is skipped to avoid CPU spikes.'
        : 'System-level purge is unavailable; background app trim remains active.';
    }
  });
  setRange('fx-memory-interval', fx.memorySystemIntervalMin);
  setRange('fx-memory-threshold', fx.memorySystemThresholdPercent);
  if (!memoryLastStatusPayload && !memorySnapshotTimer) {
    memorySnapshotTimer = setTimeout(function () {
      memorySnapshotTimer = 0;
      refreshMemorySnapshot(false);
    }, 300);
  }
}

function toggleMemoryMaskPart(part) {
  ensureMemoryFxDefaults();
  var bit = MEMORY_REDUCT_MASK_BITS[part] || 0;
  if (!bit) return;
  var next = normalizeMemorySystemMask(fx.memorySystemMask) ^ bit;
  fx.memorySystemMask = normalizeMemorySystemMask(next);
  saveLyricLayout({ user: true, reason: 'memorySystemMask' });
  updateMemoryControls();
  configureMemoryReductFromFx('mask', false);
}

function runAppMemoryTrim(reason) {
  if (!window.desktopWindow || typeof window.desktopWindow.trimAppMemory !== 'function') {
    showToast('桌面版才支持进程内存压缩');
    return;
  }
  updateMemoryStatusText('正在压缩播放器工作集...');
  window.desktopWindow.trimAppMemory({ reason: reason || 'manual' }).then(function (payload) {
    if (payload && payload.ok && payload.after) updateMemoryStatusText('播放器已压缩: ' + memoryFormatSnapshot(payload.after));
    else if (payload && payload.skipped && payload.reason === 'foreground-visible') updateMemoryStatusText('前台可见时不压缩，避免操作卡顿；最小化/隐藏后自动处理');
    else updateMemoryStatusText('播放器压缩未完成');
    refreshMemorySnapshot(true);
  }).catch(function (error) {
    updateMemoryStatusText('播放器压缩失败: ' + String(error && error.message || error || ''));
  });
}

function runSystemMemoryPurge(autoElevate) {
  ensureMemoryFxDefaults();
  if (!window.desktopWindow || typeof window.desktopWindow.purgeSystemMemory !== 'function') {
    showToast('桌面版才支持系统级释放');
    return;
  }
  updateMemoryStatusText(autoElevate ? '正在请求提权系统释放（前台可见时会跳过）...' : '正在尝试系统级手动释放（前台可见时会跳过）...');
  window.desktopWindow.purgeSystemMemory({
    mask: normalizeMemorySystemMask(fx && fx.memorySystemMask),
    autoElevate: !!autoElevate,
    manual: true
  }).then(function (payload) {
    rememberMemoryStatusPayload(payload);
    var result = payload && payload.result;
    if (result && result.skipped && result.reason === 'foreground-visible') {
      updateMemoryStatusText('前台可见时不执行系统释放；先最小化/隐藏再用，避免操作卡顿');
      showToast('前台已跳过系统释放，最小化后再用');
    } else if (result && result.ok) {
      updateMemoryStatusText('系统释放完成，约释放 ' + (result.freedMB || 0) + ' MB' + (result.partial ? '（部分权限）' : ''));
      showToast('系统释放完成');
    } else if (result && result.needAdmin) {
      updateMemoryStatusText(autoElevate ? '提权释放未完成：可能取消了管理员权限或被系统拦截' : '当前权限只能完成部分释放；需要时可最小化后点提权释放');
      showToast(autoElevate ? '提权释放未完成' : '需要管理员权限的部分已跳过');
    } else {
      updateMemoryStatusText('系统释放未完成: ' + String(result && result.message || payload && payload.error || ''));
    }
    refreshMemorySnapshot(true);
  }).catch(function (error) {
    updateMemoryStatusText('系统释放失败: ' + String(error && error.message || error || ''));
  });
}

function bindSystemMemoryControls() {
  document.querySelectorAll('#memory-mask-seg [data-memory-mask]').forEach(function (btn) {
    if (btn._mineradioMemoryBound) return;
    btn._mineradioMemoryBound = true;
    btn.addEventListener('click', function () {
      toggleMemoryMaskPart(btn.getAttribute('data-memory-mask'));
    });
  });
  [
    ['fx-memory-interval', 'memorySystemIntervalMin', 5, 180],
    ['fx-memory-threshold', 'memorySystemThresholdPercent', 50, 98]
  ].forEach(function (item) {
    var input = document.getElementById(item[0]);
    if (!input || input._mineradioMemoryBound) return;
    input._mineradioMemoryBound = true;
    input.addEventListener('input', function () {
      fx[item[1]] = clampRange(Math.round(Number(input.value) || fxDefaults[item[1]]), item[2], item[3]);
      setRange(item[0], fx[item[1]]);
      saveLyricLayout({ user: true, reason: item[1] });
      configureMemoryReductFromFx('slider', false);
    });
  });
  refreshMemorySnapshot(false);
  configureMemoryReductFromFx('bind', false);
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', function () {
    setTimeout(bindSystemMemoryControls, 0);
  });
} else {
  setTimeout(bindSystemMemoryControls, 0);
}
