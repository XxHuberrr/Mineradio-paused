/* 花再 Halo PixelBar 同步桥接（渲染进程）
 * 由现有模块通过 window.haloSync 调用，统一经 preload 的 desktopWindow.halo 发往主进程。
 * 所有调用均为尽力而为：halo 不可用或开关关闭时自动空转，不影响主程序。
 */
(function () {
  if (window.haloSync) return;

  var state = {
    enabled: false,
    config: null,
    song: null,
    lines: [],
    lastLine: '__force__',
    audioEl: null,
    lastPlaying: false,
    lastFrameAt: 0,
    lastCoverAt: 0,
  };

  function getHalo() {
    try {
      if (window.desktopWindow && window.desktopWindow.halo) return window.desktopWindow.halo;
    } catch (e) {}
    return null;
  }

  // 根据时间找当前应显示的歌词行
  function activeLineAt(lines, t) {
    if (!lines || !lines.length) return '';
    if (lines.length === 1) return lines[0].text || '';
    var idx = -1;
    for (var i = 0; i < lines.length; i++) {
      var lt = lines[i].t;
      if (typeof lt === 'number' && lt <= t) idx = i;
      else break;
    }
    if (idx < 0) return '';
    return lines[idx].text || '';
  }

  function getAudioEl() {
    var el = null;
    try { if (window.audio && window.audio.nodeType === 1) el = window.audio; } catch (e) {}
    if (!el) el = document.querySelector('audio');
    if (!el) el = document.querySelector('video');
    if (!el) el = state.audioEl;
    return el;
  }

  function bindAudio(el) {
    if (!el || el.__haloBound) return;
    el.__haloBound = true;
    el.addEventListener('play', function () { var h = getHalo(); if (h) h.playState(true); });
    el.addEventListener('pause', function () { var h = getHalo(); if (h) h.playState(false); });
    el.addEventListener('ended', function () { var h = getHalo(); if (h) h.playState(false); });
  }

  function ensureAudio() {
    var el = getAudioEl();
    if (el) {
      state.audioEl = el;
      bindAudio(el);
    }
    return el;
  }

  function refreshConfig() {
    var h = getHalo();
    if (!h) return;
    try {
      h.getConfig().then(function (res) {
        if (res && res.ok && res.config) {
          state.config = res.config;
          state.enabled = !!res.config.enabled;
        }
      }).catch(function () {});
    } catch (e) {}
  }

  function tick() {
    var el = ensureAudio();
    if (!el || !state.enabled) return;
    var playing = !el.paused && !el.ended;
    // 即使错过了 play 事件，也按实际播放状态同步（playing 决定歌词是否下发）
    if (playing !== state.lastPlaying) {
      state.lastPlaying = playing;
      var h0 = getHalo();
      if (h0) h0.playState(playing);
    }
    var t = el.currentTime || 0;
    var line = activeLineAt(state.lines, t);
    if (line !== state.lastLine) {
      state.lastLine = line;
      var h = getHalo();
      if (h) h.lyric(line || '');
    }
  }

  function dominantRgb(colors) {
    if (!colors || !colors.length) return null;
    var c = colors[0];
    if (typeof c === 'string') {
      var m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
      if (m) {
        var n = parseInt(m[1], 16);
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
      }
      return null;
    }
    if (c && typeof c === 'object' && c.r != null) return { r: c.r, g: c.g, b: c.b };
    return null;
  }

  window.haloSync = {
    // 由歌词解析处调用：传入歌曲元信息与解析后的行
    setLyricContext: function (song, lines) {
      state.song = song || null;
      state.lines = (lines || []).map(function (l) {
        return { t: (l && typeof l.t === 'number') ? l.t : 0, text: (l && l.text) || '' };
      });
      state.lastLine = '__force__';
      if (!song) return;
      var sig = String(song.id || '') + '|' + (song.name || song.title || '') + '|' + (song.artist || '');
      if (sig === state.lastSongSig) return; // 同一首歌的重复解析不重复刷屏
      state.lastSongSig = sig;
      var h = getHalo();
      if (h) h.song(song.name || song.title || '', song.artist || '');
    },
    // 由节拍分析处调用：frame 含 energy/beat/brightness
    onAudioFrame: function (frame) {
      if (!frame) return;
      var now = Date.now();
      if (now - state.lastFrameAt < 100) return;
      state.lastFrameAt = now;
      var h = getHalo();
      if (h) h.audioFrame(frame.energy, frame.beat, frame.brightness);
    },
    // 由音量控制处调用：v 为 0..1
    onVolume: function (v) {
      var h = getHalo();
      if (h) h.volume(v);
    },
    // 由封面色提取处调用：colors 为 ['#rrggbb', ...] 或 rgb 对象数组
    onCoverColors: function (colors) {
      var now = Date.now();
      if (now - state.lastCoverAt < 1500) return;
      state.lastCoverAt = now;
      var rgb = dominantRgb(colors);
      if (rgb) {
        var h = getHalo();
        if (h) h.coverColor(rgb);
      }
    },
    _tick: tick,
  };

  refreshConfig();
  ensureAudio();
  setInterval(tick, 200);
  setInterval(refreshConfig, 5000);

  // ---- 设置面板（自包含，追加到现有界面，不修改其它文件） ----
  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else e.setAttribute(k, attrs[k]);
    });
    if (children) children.forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }

  function buildHaloSettingsUi() {
    var topRight = document.getElementById('top-right');
    var panel = document.getElementById('halo-sync-panel');
    if (!topRight || panel) return;

    if (!document.getElementById('halo-sync-style')) {
      var st = document.createElement('style');
      st.id = 'halo-sync-style';
      st.textContent = '.halo-sync-group{margin:8px 0;}.halo-sync-group-title{font-size:11px;opacity:.7;margin-bottom:4px;}' +
        '.halo-sync-btns{display:flex;flex-wrap:wrap;gap:4px;}.halo-sync-chip{font-size:11px;padding:3px 7px;border-radius:10px;border:1px solid var(--border,#444);background:transparent;color:inherit;cursor:pointer;}' +
        '.halo-sync-chip:hover{background:rgba(255,255,255,.12);}';
      document.head.appendChild(st);
    }

    var open = false;
    var panelEl = el('div', { id: 'halo-sync-panel', class: 'halo-sync-panel' });
    var btn = el('button', {
      id: 'halo-sync-btn', class: 'icon-btn', type: 'button',
      title: '花再音响同步', 'aria-label': '花再音响同步', text: '🔊',
    });
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      open = !open;
      panelEl.classList.toggle('show', open);
      if (open) syncUiFromConfig();
    });
    document.addEventListener('click', function (e) {
      if (open && !panelEl.contains(e.target) && e.target !== btn) {
        open = false; panelEl.classList.remove('show');
      }
    });

    function row(label, control) {
      return el('div', { class: 'halo-sync-row' }, [el('label', { text: label }), control]);
    }
    function toggle(key, label, opts) {
      opts = opts || {};
      var cb = el('input', { type: 'checkbox' });
      if (opts.disabled) { cb.disabled = true; cb.checked = false; }
      cb.addEventListener('change', function () {
        var h = getHalo(); if (h) h.setConfig({ [key]: cb.checked });
      });
      toggles[key] = cb;
      return row(label, cb);
    }
    function select(key, label, opts) {
      var sel = el('select', {});
      opts.forEach(function (o) { sel.appendChild(el('option', { value: o.v, text: o.t })); });
      sel.addEventListener('change', function () {
        var h = getHalo(); if (h) h.setConfig({ [key]: sel.value });
      });
      selects[key] = sel;
      return row(label, sel);
    }

    var toggles = {};
    var selects = {};

    panelEl.appendChild(el('div', { class: 'halo-sync-title', text: '花再 Halo PixelBar 同步' }));
    panelEl.appendChild(toggle('enabled', '启用同步'));
    panelEl.appendChild(toggle('ambientEnabled', '氛围灯'));
    panelEl.appendChild(toggle('beatReactive', '随音乐律动'));
    panelEl.appendChild(toggle('followCover', '灯光跟随封面（暂不支持）', { disabled: true }));
    panelEl.appendChild(toggle('volumeSync', '音量联动'));
    panelEl.appendChild(toggle('dynamicScroll', '动态滚动歌词'));
    panelEl.appendChild(select('idleScene', '暂停时', [
      { v: 'none', t: '保持歌词' }, { v: 'clock', t: '显示时钟' },
    ]));
    panelEl.appendChild(select('align', '对齐', [
      { v: 'left', t: '左' }, { v: 'center', t: '居中' }, { v: 'right', t: '右' }, { v: 'justify', t: '两端' },
    ]));
    panelEl.appendChild(select('ambientBrightness', '灯亮度', [
      { v: 'low', t: '低' }, { v: 'medium', t: '中' }, { v: 'high', t: '高' },
    ]));

    function btnGroup(title, items, onPick) {
      var wrap = el('div', { class: 'halo-sync-group' });
      wrap.appendChild(el('div', { class: 'halo-sync-group-title', text: title }));
      var btns = el('div', { class: 'halo-sync-btns' });
      items.forEach(function (it) {
        var b = el('button', { type: 'button', class: 'halo-sync-chip', text: it.t });
        b.addEventListener('click', function () { onPick(it); });
        btns.appendChild(b);
      });
      wrap.appendChild(btns);
      return wrap;
    }

    var THEMES = [
      { v: 'clock', t: '时钟' }, { v: 'game', t: '游戏' }, { v: 'work', t: '工作' },
      { v: 'reading', t: '阅读' }, { v: 'cats', t: '猫咪' }, { v: 'dogs', t: '狗狗' },
      { v: 'memes', t: '表情' }, { v: 'cyber', t: '赛博' }, { v: 'waves', t: '波浪' },
    ];
    panelEl.appendChild(btnGroup('主题（花活儿）', THEMES, function (it) {
      var h = getHalo(); if (h) h.scene(it.v);
    }));

    var SPECTRA = [
      { v: 1, t: '柱状' }, { v: 2, t: '波浪' }, { v: 3, t: '对称' }, { v: 4, t: '密集' },
    ];
    panelEl.appendChild(btnGroup('频谱（花活儿）', SPECTRA, function (it) {
      var h = getHalo(); if (h) h.spectrum(it.v);
    }));

    var clockSel = el('select', {});
    for (var ci = 1; ci <= 11; ci++) clockSel.appendChild(el('option', { value: String(ci), text: '样式 ' + ci }));
    clockSel.addEventListener('change', function () {
      var h = getHalo(); if (h) h.clockStyle(parseInt(clockSel.value, 10));
    });
    panelEl.appendChild(row('时钟样式（花活儿）', clockSel));

    var resumeBtn = el('button', { class: 'halo-sync-mini-btn', type: 'button', text: '恢复歌词同步' });
    resumeBtn.addEventListener('click', function () {
      var h = getHalo(); if (!h) return;
      h.manualHold(false);
      status.textContent = '已退出花活儿，恢复歌词同步';
    });
    panelEl.appendChild(resumeBtn);

    var status = el('div', { class: 'halo-sync-status', text: '' });
    panelEl.appendChild(status);
    var devBtn = el('button', { class: 'halo-sync-mini-btn', type: 'button', text: '检测并连接设备' });
    devBtn.addEventListener('click', function () {
      var h = getHalo(); if (!h) return;
      h.connect().then(function () {
        return h.listDevices();
      }).then(function (r) {
        if (r && r.connected) status.textContent = '已连接设备';
        else if (r && r.devices && r.devices.length) status.textContent = '发现 ' + r.devices.length + ' 个 HID 设备（未匹配控制接口）';
        else status.textContent = '未检测到 Halo PixelBar（确认 USB 连接并以管理员运行）';
      }).catch(function () { status.textContent = '检测失败'; });
    });
    panelEl.appendChild(devBtn);

    function syncUiFromConfig() {
      var h = getHalo(); if (!h) return;
      h.getConfig().then(function (res) {
        if (!res || !res.ok) return;
        var c = res.config || {};
        Object.keys(toggles).forEach(function (k) { toggles[k].checked = !!c[k]; });
        Object.keys(selects).forEach(function (k) { if (c[k] != null) selects[k].value = c[k]; });
      }).catch(function () {});
    }

    topRight.appendChild(btn);
    topRight.appendChild(panelEl);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildHaloSettingsUi);
  } else {
    buildHaloSettingsUi();
  }
})();

