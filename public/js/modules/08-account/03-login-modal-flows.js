var loginRefreshRequestSeq = 0;
var loginWorkflowDrag = null;
var LOGIN_WORKFLOW_CONNECTION_STORE_KEY = 'mineradio-login-workflow-connections-v1';
var LOGIN_WORKFLOW_PROVIDERS = ['netease', 'qq', 'kugou', 'qishui'];
var loginWorkflowPendingProvider = '';
var loginWorkflowVerifiedSession = {};
var loginProviderPointer = null;
var loginProviderClickSuppressed = false;
var loginWorkflowEdgeRenderFrame = 0;
var loginWorkflowEdgeRenderTimers = [];
var SPOTIFY_DEVELOPER_DASHBOARD_URL = 'https://developer.spotify.com/dashboard';
var SPOTIFY_REDIRECT_URI = 'http://127.0.0.1:43879/callback';
var spotifySetupCallbackReady = false;
var spotifySetupDiagnostics = null;
var spotifySetupBusy = false;
var spotifySetupAutoCheckKey = '';

function isLoginRefreshCurrent(provider, seq) {
  return loginProvider === provider && loginRefreshRequestSeq === seq;
}

function normalizeLoginProviderKey(provider) {
  return provider === 'qq' ? 'qq' : (provider === 'kugou' ? 'kugou' : (provider === 'qishui' ? 'qishui' : 'netease'));
}
function loginProviderSupportsCookieMode(provider) {
  provider = normalizeLoginProviderKey(provider);
  return provider !== 'spotify' && provider !== 'qishui';
}
function loginProviderOfficialModeText(provider) {
  provider = normalizeLoginProviderKey(provider);
  if (provider === 'spotify') return { title: 'OAuth', sub: '弹出 Spotify 授权窗口' };
  if (provider === 'qishui') return { title: '扫码', sub: '使用抖音 App 官方授权' };
  if (provider === 'kugou') return { title: '官网', sub: '弹出酷狗官方窗口' };
  return { title: '扫码', sub: '连接后弹出官方窗口' };
}
function setManualCookieOpenForProvider(provider, open) {
  provider = normalizeLoginProviderKey(provider);
  if (provider === 'netease') neteaseManualCookieOpen = !!open;
  else if (provider === 'qq') qqManualCookieOpen = !!open;
  else if (provider === 'kugou') kugouManualCookieOpen = !!open;
  else if (provider === 'qishui') qishuiManualCookieOpen = false;
}
function isManualCookieOpenForProvider(provider) {
  provider = normalizeLoginProviderKey(provider);
  if (provider === 'netease') return !!neteaseManualCookieOpen;
  if (provider === 'qq') return !!qqManualCookieOpen;
  if (provider === 'kugou') return !!kugouManualCookieOpen;
  if (provider === 'qishui') return false;
  return false;
}
function readLoginWorkflowConnections() {
  try { localStorage.removeItem(LOGIN_WORKFLOW_CONNECTION_STORE_KEY); } catch (e) { }
  return [];
}
function saveLoginWorkflowConnections(list) {
  try { localStorage.removeItem(LOGIN_WORKFLOW_CONNECTION_STORE_KEY); } catch (e) { }
}
function providerHasLiveLogin(provider) {
  provider = normalizeLoginProviderKey(provider);
  if (loginWorkflowVerifiedSession && loginWorkflowVerifiedSession[provider]) return true;
  try { return typeof hasPlatformLogin === 'function' && hasPlatformLogin(provider); } catch (e) { return false; }
}
function loginWorkflowConnectedProviders() {
  return loginWorkflowProviderOrder().filter(providerHasLiveLogin);
}
function loginWorkflowProviderOrder() {
  try { return accountProviderOrder(); } catch (e) { return LOGIN_WORKFLOW_PROVIDERS.slice(); }
}
function syncLoginWorkflowConnectionsFromStatus() {
  saveLoginWorkflowConnections([]);
  return loginWorkflowConnectedProviders();
}
function hasLoginWorkflowConnection(provider) {
  provider = normalizeLoginProviderKey(provider);
  return loginWorkflowConnectedProviders().indexOf(provider) >= 0;
}
function markLoginWorkflowConnected(provider) {
  provider = normalizeLoginProviderKey(provider);
  loginWorkflowVerifiedSession[provider] = true;
  if (!isAccountProviderExternallyVisible(provider)) {
    var list = accountProviderVisibleList();
    list.push(provider);
    saveAccountProviderVisibleList(list);
  }
}
function setLoginAuthDrawerOpen(open) {
  var drawer = document.getElementById('login-auth-drawer');
  var modal = document.querySelector('#login-modal .dual-login-modal');
  if (modal) modal.classList.toggle('login-details-open', !!open);
  if (drawer) drawer.classList.toggle('show', !!open);
  if (!open) {
    loginWorkflowPendingProvider = '';
    try { stopQrPoll(); } catch (e) { }
  }
}
function markLoginNodeConnecting() {
  var graph = document.getElementById('login-node-graph');
  if (!graph) return;
  graph.classList.remove('connecting');
  void graph.offsetWidth;
  graph.classList.add('connecting');
  setTimeout(function () { graph.classList.remove('connecting'); }, 980);
}
function loginWorkflowActiveMode() {
  return isManualCookieOpenForProvider(loginProvider) ? 'cookie' : 'official';
}
function workflowPointForPort(port, root) {
  if (!port || !root) return null;
  var portRect = port.getBoundingClientRect();
  var rootRect = root.getBoundingClientRect();
  return {
    x: portRect.left + portRect.width / 2 - rootRect.left,
    y: portRect.top + portRect.height / 2 - rootRect.top
  };
}
function workflowPointFromEvent(e, root) {
  if (!e || !root) return null;
  var rootRect = root.getBoundingClientRect();
  return { x: e.clientX - rootRect.left, y: e.clientY - rootRect.top };
}
function workflowPointDistance(a, b) {
  if (!a || !b) return Infinity;
  var dx = a.x - b.x;
  var dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}
function loginWorkflowMrTargetPoint(graph) {
  if (!graph) return null;
  return workflowPointForPort(graph.querySelector('[data-login-mr-target="mr"]'), graph);
}
function loginWorkflowSnapPoint(point, graph) {
  var mr = loginWorkflowMrTargetPoint(graph);
  if (point && mr && workflowPointDistance(point, mr) <= 92) return mr;
  return point;
}
function loginWorkflowNearMr(point, graph) {
  var mr = loginWorkflowMrTargetPoint(graph);
  return !!(point && mr && workflowPointDistance(point, mr) <= 108);
}
function workflowBezierPath(a, b) {
  var gap = Math.abs(b.x - a.x);
  var dx = Math.max(18, Math.min(86, gap * 0.55));
  return 'M ' + a.x.toFixed(1) + ' ' + a.y.toFixed(1) +
    ' C ' + (a.x + dx).toFixed(1) + ' ' + a.y.toFixed(1) +
    ', ' + (b.x - dx).toFixed(1) + ' ' + b.y.toFixed(1) +
    ', ' + b.x.toFixed(1) + ' ' + b.y.toFixed(1);
}
function appendWorkflowPath(svg, from, to, className) {
  if (!svg || !from || !to) return;
  var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', workflowBezierPath(from, to));
  path.setAttribute('class', className || 'workflow-link');
  svg.appendChild(path);
}
function clearWorkflowSvg(svg) {
  if (!svg) return;
  while (svg.firstChild) svg.removeChild(svg.firstChild);
}
function renderLoginWorkflowEdges(tempPoint) {
  var graph = document.getElementById('login-node-graph');
  var svg = document.getElementById('login-workflow-svg');
  if (!graph || !svg) return;
  var w = Math.max(1, graph.clientWidth || 1);
  var h = Math.max(1, graph.clientHeight || 1);
  svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
  clearWorkflowSvg(svg);
  var mrIn = graph.querySelector('[data-login-mr-target="mr"]');
  loginWorkflowConnectedProviders().forEach(function (provider) {
    var providerOut = graph.querySelector('[data-login-provider-output="' + provider + '"]');
    appendWorkflowPath(svg, workflowPointForPort(providerOut, graph), workflowPointForPort(mrIn, graph), 'workflow-link active' + (provider === loginProvider ? ' selected' : ''));
  });
  if (loginWorkflowPendingProvider && !providerHasLiveLogin(loginWorkflowPendingProvider)) {
    var pendingOut = graph.querySelector('[data-login-provider-output="' + loginWorkflowPendingProvider + '"]');
    appendWorkflowPath(svg, workflowPointForPort(pendingOut, graph), workflowPointForPort(mrIn, graph), 'workflow-link pending');
  }
  if (loginWorkflowDrag && tempPoint) {
    appendWorkflowPath(svg, workflowPointForPort(loginWorkflowDrag.port, graph), loginWorkflowSnapPoint(tempPoint, graph), 'workflow-link temp');
  }
}
function scheduleLoginWorkflowEdges(reason) {
  if (loginWorkflowEdgeRenderFrame) cancelAnimationFrame(loginWorkflowEdgeRenderFrame);
  loginWorkflowEdgeRenderFrame = requestAnimationFrame(function () {
    loginWorkflowEdgeRenderFrame = 0;
    renderLoginWorkflowEdges();
  });
  loginWorkflowEdgeRenderTimers.forEach(function (timer) { clearTimeout(timer); });
  loginWorkflowEdgeRenderTimers = [];
  [70, 170, 340, 560].forEach(function (delay) {
    loginWorkflowEdgeRenderTimers.push(setTimeout(function () {
      renderLoginWorkflowEdges();
    }, delay));
  });
}
function selectLoginProviderNode(provider) {
  if (loginProviderClickSuppressed) {
    loginProviderClickSuppressed = false;
    return;
  }
  provider = normalizeLoginProviderKey(provider);
  setLoginProvider(provider, true);
  setLoginAuthDrawerOpen(hasLoginWorkflowConnection(provider) || loginWorkflowPendingProvider === provider);
  updateLoginProviderUi();
}
function connectLoginProviderToMr(provider) {
  provider = normalizeLoginProviderKey(provider);
  if (provider !== loginProvider) setLoginProvider(provider, true);
  loginWorkflowPendingProvider = provider;
  setLoginAuthDrawerOpen(true);
  markLoginNodeConnecting();
  updateLoginProviderUi();
  connectLoginMode(loginWorkflowActiveMode());
}
function finishLoginWorkflowDrag(e) {
  var graph = document.getElementById('login-node-graph');
  if (!graph || !loginWorkflowDrag) return;
  var drag = loginWorkflowDrag;
  var target = document.elementFromPoint(e.clientX, e.clientY);
  var port = target && target.closest ? target.closest('.flow-port.in') : null;
  var mrNode = target && target.closest ? target.closest('[data-login-node="mr"]') : null;
  var eventPoint = workflowPointFromEvent(e, graph);
  var nearMr = loginWorkflowNearMr(eventPoint, graph);
  if ((port && graph.contains(port)) || (mrNode && graph.contains(mrNode)) || nearMr) {
    var mrTarget = port && port.getAttribute('data-login-mr-target');
    if (drag.source === 'provider' && (mrTarget || mrNode || nearMr)) {
      connectLoginProviderToMr(drag.provider);
    }
  }
  loginWorkflowDrag = null;
  graph.classList.remove('dragging-line', 'drop-ready');
  try { graph.releasePointerCapture(e.pointerId); } catch (_) { }
  scheduleLoginWorkflowEdges('wire-finish');
}
function beforeLoginProviderForPointer(y) {
  var parent = document.getElementById('login-platform-tabs');
  if (!parent) return '';
  var nodes = Array.prototype.slice.call(parent.querySelectorAll('[data-login-provider]'));
  for (var i = 0; i < nodes.length; i += 1) {
    var rect = nodes[i].getBoundingClientRect();
    if (y < rect.top + rect.height / 2) return nodes[i].getAttribute('data-login-provider') || '';
  }
  return '';
}
function startLoginWorkflowPointerDrag(graph, state, e) {
  loginWorkflowDrag = {
    port: state.port,
    source: 'provider',
    provider: state.provider
  };
  graph.classList.add('dragging-line');
  renderLoginWorkflowEdges(workflowPointFromEvent(e, graph));
}
function accountProviderOrderAfterMove(provider, beforeProvider) {
  provider = normalizeLoginProviderKey(provider);
  beforeProvider = beforeProvider ? normalizeLoginProviderKey(beforeProvider) : '';
  var order = accountProviderOrder().filter(function (item) { return item !== provider; });
  var index = beforeProvider ? order.indexOf(beforeProvider) : -1;
  if (index < 0) order.push(provider);
  else order.splice(index, 0, provider);
  return order;
}
function shouldMoveLoginProviderBefore(provider, beforeProvider) {
  var current = accountProviderOrder();
  var next = accountProviderOrderAfterMove(provider, beforeProvider);
  return current.join('|') !== next.join('|');
}
function finishLoginProviderPointer(e) {
  var graph = document.getElementById('login-node-graph');
  if (loginWorkflowDrag) {
    finishLoginWorkflowDrag(e);
    loginProviderClickSuppressed = true;
    setTimeout(function () { loginProviderClickSuppressed = false; }, 120);
    return;
  }
  var state = loginProviderPointer;
  loginProviderPointer = null;
  if (graph) graph.classList.remove('sorting-provider');
  if (!state) return;
  if (state.node) state.node.classList.remove('sorting');
  try { if (graph) graph.releasePointerCapture(e.pointerId); } catch (_) { }
  loginProviderClickSuppressed = true;
  setTimeout(function () { loginProviderClickSuppressed = false; }, 120);
  scheduleLoginWorkflowEdges('sort-finish');
}
function loginProviderVipLabel(provider, status) {
  if (!status || !status.loggedIn) return '';
  var level = providerVipLevel(provider, status);
  return level === 'svip' ? 'SVIP' : (level === 'vip' ? 'VIP' : '普通');
}
function handleLoginProviderExternalSwitchEvent(e, provider) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  provider = normalizeLoginProviderKey(provider);
  toggleAccountProviderExternal(provider);
  updateLoginProviderUi();
  scheduleLoginWorkflowEdges('external-switch');
}
function updateLoginProviderCapsuleStatus(provider, btn) {
  var st = platformStatus(provider) || {};
  var meta = platformMeta(provider);
  var handle = btn.querySelector('.login-provider-sort-handle');
  if (!handle) {
    handle = document.createElement('span');
    handle.className = 'login-provider-sort-handle';
    handle.innerHTML = '<i></i><i></i><i></i>';
    btn.insertBefore(handle, btn.firstChild);
  }
  handle.setAttribute('data-login-provider-sort', provider);
  handle.setAttribute('title', 'Drag to sort');
  handle.setAttribute('aria-label', 'Drag to sort');
  var logo = btn.querySelector('.provider-logo');
  if (logo) {
    if (st.loggedIn) {
      logo.classList.add('has-avatar');
      logo.innerHTML = '<img src="' + providerAvatarSrc(provider, st) + '" alt="">';
    } else {
      logo.classList.remove('has-avatar');
      logo.textContent = meta.short;
    }
  }
  var badge = btn.querySelector('.login-provider-state-badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'login-provider-state-badge';
    btn.appendChild(badge);
  }
  var externalSwitch = btn.querySelector('.login-provider-external-switch');
  if (!externalSwitch) {
    externalSwitch = document.createElement('span');
    externalSwitch.className = 'login-provider-external-switch';
    btn.appendChild(externalSwitch);
  }
  externalSwitch.removeAttribute('aria-hidden');
  externalSwitch.setAttribute('role', 'switch');
  externalSwitch.setAttribute('tabindex', '0');
  externalSwitch.setAttribute('data-login-provider-external', provider);
  externalSwitch.setAttribute('aria-label', '展示到右上角账号胶囊');
  externalSwitch.setAttribute('aria-checked', isAccountProviderExternallyVisible(provider) ? 'true' : 'false');
  if (!externalSwitch.querySelector('.login-provider-external-label')) {
    externalSwitch.innerHTML = '<span class="login-provider-external-label">展示</span><i></i>';
  }
  if (!externalSwitch.__loginProviderExternalBound) {
    externalSwitch.__loginProviderExternalBound = true;
    externalSwitch.addEventListener('pointerdown', function (e) {
      e.stopPropagation();
    });
    externalSwitch.addEventListener('click', function (e) {
      handleLoginProviderExternalSwitchEvent(e, externalSwitch.getAttribute('data-login-provider-external') || provider);
    });
    externalSwitch.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      handleLoginProviderExternalSwitchEvent(e, externalSwitch.getAttribute('data-login-provider-external') || provider);
    });
  }
  externalSwitch.title = isAccountProviderExternallyVisible(provider) ? '已在右上角展示，点击关闭' : '未在右上角展示，点击开启';
  var label = loginProviderVipLabel(provider, st);
  var level = providerVipLevel(provider, st);
  badge.textContent = label;
  badge.className = 'login-provider-state-badge ' + (st.loggedIn ? (level === 'none' ? 'normal' : level) : 'hidden');
}
function bindLoginWorkflowPointerEvents() {
  var graph = document.getElementById('login-node-graph');
  if (!graph || graph._workflowBound) return;
  graph._workflowBound = true;
  graph.addEventListener('pointerdown', function (e) {
    var sortHandle = e.target && e.target.closest ? e.target.closest('[data-login-provider-sort]') : null;
    if (sortHandle && graph.contains(sortHandle)) {
      var sortNode = sortHandle.closest('.login-node-providers [data-login-provider]');
      var sortProvider = sortNode && sortNode.getAttribute('data-login-provider') || sortHandle.getAttribute('data-login-provider-sort') || '';
      if (!sortProvider) return;
      sortProvider = normalizeLoginProviderKey(sortProvider);
      if (sortProvider !== loginProvider) setLoginProvider(sortProvider, true);
      loginProviderPointer = {
        provider: sortProvider,
        node: sortNode,
        startX: e.clientX,
        startY: e.clientY,
        dragging: false
      };
      if (sortNode) sortNode.classList.add('sorting');
      graph.classList.add('sorting-provider');
      loginProviderClickSuppressed = true;
      try { graph.setPointerCapture(e.pointerId); } catch (_) { }
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    var port = e.target && e.target.closest ? e.target.closest('.flow-port.out') : null;
    if (!port || !graph.contains(port)) return;
    var providerNode = port.closest('.login-node-providers [data-login-provider]');
    var provider = port.getAttribute('data-login-provider-output') || (providerNode && providerNode.getAttribute('data-login-provider')) || '';
    if (!provider) return;
    if (provider !== loginProvider) setLoginProvider(provider, true);
    loginProviderClickSuppressed = true;
    startLoginWorkflowPointerDrag(graph, { provider: provider, port: port }, e);
    try { graph.setPointerCapture(e.pointerId); } catch (_) { }
    e.preventDefault();
    e.stopPropagation();
  });
  graph.addEventListener('pointermove', function (e) {
    if (!loginProviderPointer && !loginWorkflowDrag) return;
    e.preventDefault();
    if (loginProviderPointer) {
      var dx = e.clientX - loginProviderPointer.startX;
      var dy = e.clientY - loginProviderPointer.startY;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (!loginProviderPointer.dragging && dist < 5) return;
      loginProviderPointer.dragging = true;
      if (loginProviderPointer.node) loginProviderPointer.node.classList.add('sorting');
      graph.classList.add('sorting-provider');
      loginProviderClickSuppressed = true;
      var beforeProvider = beforeLoginProviderForPointer(e.clientY);
      if (beforeProvider !== loginProviderPointer.provider && shouldMoveLoginProviderBefore(loginProviderPointer.provider, beforeProvider)) {
        moveAccountProviderBefore(loginProviderPointer.provider, beforeProvider);
        updateLoginProviderUi();
      }
      return;
    }
    if (!loginWorkflowDrag) return;
    var point = workflowPointFromEvent(e, graph);
    graph.classList.toggle('drop-ready', loginWorkflowNearMr(point, graph));
    renderLoginWorkflowEdges(point);
  });
  graph.addEventListener('pointerup', finishLoginProviderPointer);
  graph.addEventListener('pointercancel', function (e) {
    if (loginProviderPointer && loginProviderPointer.node) loginProviderPointer.node.classList.remove('sorting');
    loginProviderPointer = null;
    loginWorkflowDrag = null;
    graph.classList.remove('dragging-line', 'drop-ready', 'sorting-provider');
    try { graph.releasePointerCapture(e.pointerId); } catch (_) { }
    scheduleLoginWorkflowEdges('pointer-cancel');
  });
  if (!bindLoginWorkflowPointerEvents._resizeBound) {
    bindLoginWorkflowPointerEvents._resizeBound = true;
    window.addEventListener('resize', function () { scheduleLoginWorkflowEdges('resize'); });
    window.addEventListener('orientationchange', function () { scheduleLoginWorkflowEdges('orientation'); });
  }
}
function updateLoginNodeGraphUi() {
  var graph = document.getElementById('login-node-graph');
  if (graph) graph.setAttribute('data-provider', loginProvider);
  syncAccountProviderOrderUi();
  var connected = syncLoginWorkflowConnectionsFromStatus();
  loginWorkflowProviderOrder().forEach(function (provider) {
    var btn = document.getElementById('login-provider-' + provider);
    if (!btn) return;
    updateLoginProviderCapsuleStatus(provider, btn);
    btn.classList.toggle('active', provider === loginProvider);
    btn.classList.toggle('external-on', isAccountProviderExternallyVisible(provider));
    btn.classList.toggle('connected', connected.indexOf(provider) >= 0);
    btn.classList.toggle('pending', loginWorkflowPendingProvider === provider && connected.indexOf(provider) < 0);
  });
  var official = document.getElementById('login-mode-official');
  var cookie = document.getElementById('login-mode-cookie');
  var officialText = loginProviderOfficialModeText(loginProvider);
  if (official) {
    var title = official.querySelector('b');
    var sub = official.querySelector('small');
    if (title) title.textContent = officialText.title;
    if (sub) sub.textContent = officialText.sub;
    official.disabled = false;
    official.classList.toggle('active', !isManualCookieOpenForProvider(loginProvider));
  }
  if (cookie) {
    var cookieTitle = cookie.querySelector('b');
    var cookieSub = cookie.querySelector('small');
    if (cookieTitle) cookieTitle.textContent = 'Cookie';
    if (cookieSub) cookieSub.textContent = loginProviderSupportsCookieMode(loginProvider) ? '连接后打开手动导入' : '该平台不支持 Cookie 导入';
    cookie.disabled = !loginProviderSupportsCookieMode(loginProvider);
    cookie.classList.toggle('active', isManualCookieOpenForProvider(loginProvider));
  }
  var copy = graph && graph.querySelector('.login-node-copy');
  if (copy) {
    var meta = platformMeta(loginProvider);
    var copySub = copy.querySelector('small');
    var connectedCount = connected.length;
    if (copySub) copySub.textContent = hasLoginWorkflowConnection(loginProvider)
      ? ((meta && meta.label || loginProvider) + ' 已接入 / 共 ' + connectedCount + ' 个接口')
      : (loginWorkflowPendingProvider === loginProvider
        ? ((meta && meta.label || loginProvider) + ' 待登录确认')
        : (connectedCount ? ('已接入 ' + connectedCount + ' 个接口，拖入当前接口可继续添加') : '把左侧接口拖入这里'));
  }
  scheduleLoginWorkflowEdges('node-ui');
}
function connectLoginProvider(provider) {
  selectLoginProviderNode(provider);
}
function selectLoginMode(mode) {
  if (mode === 'cookie' && !loginProviderSupportsCookieMode(loginProvider)) {
    showToast(loginProvider === 'qishui' ? '汽水音乐仅使用官方扫码登录' : 'Spotify 使用官方 OAuth 登录');
    return;
  }
  setManualCookieOpenForProvider(loginProvider, mode === 'cookie');
  updateLoginProviderUi();
  setLoginAuthDrawerOpen(hasLoginWorkflowConnection(loginProvider) || loginWorkflowPendingProvider === loginProvider);
}
function startSelectedLoginConnection() {
  if (!hasLoginWorkflowConnection(loginProvider) && loginWorkflowPendingProvider !== loginProvider) {
    showToast('先把左侧接口拖到 MR 接入口');
    return;
  }
  setLoginAuthDrawerOpen(true);
  connectLoginMode(loginWorkflowActiveMode());
}
function connectLoginMode(mode) {
  setLoginAuthDrawerOpen(true);
  markLoginNodeConnecting();
  if (loginProvider === 'spotify') {
    setManualCookieOpenForProvider('spotify', false);
    updateLoginProviderUi();
    scheduleSpotifySetupAutoCheck();
    return;
  }
  if (mode === 'cookie') {
    if (!loginProviderSupportsCookieMode(loginProvider)) {
      showToast(loginProvider === 'qishui' ? '汽水音乐仅使用官方扫码登录' : 'Spotify 使用官方 OAuth 登录');
      return;
    }
    setManualCookieOpenForProvider(loginProvider, true);
    updateLoginProviderUi();
    var input = document.getElementById('qq-cookie-input');
    if (input) setTimeout(function () { try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); } }, 80);
    return;
  }
  setManualCookieOpenForProvider(loginProvider, false);
  updateLoginProviderUi();
  setTimeout(openProviderWebLogin, 120);
}

var pendingCookieExportProvider = '';
function providerCookieExportLabel(provider) {
  provider = normalizeLoginProviderKey(provider);
  var meta = platformMeta(provider);
  return meta && meta.label || (provider === 'spotify' ? 'Spotify' : provider);
}
function offerLoginCookieExport(provider, info) {
  provider = normalizeLoginProviderKey(provider);
  if (!hasPlatformLogin(provider) && !(info && info.loggedIn)) return;
  markLoginWorkflowConnected(provider);
  updateLoginNodeGraphUi();
  pendingCookieExportProvider = provider;
  var label = providerCookieExportLabel(provider);
  var prompt = document.getElementById('cookie-export-prompt');
  var title = document.getElementById('cookie-export-title');
  var desc = document.getElementById('cookie-export-desc');
  if (title) title.textContent = '是否导出 ' + label + ' 登录 cookie 到桌面？';
  if (desc) desc.textContent = '文件名会保存为“' + label + '_登录cookie.txt”，用于备份当前平台登录态。';
  if (prompt) prompt.classList.add('show');
}
function dismissCookieExportPrompt() {
  pendingCookieExportProvider = '';
  var prompt = document.getElementById('cookie-export-prompt');
  if (prompt) prompt.classList.remove('show');
}
async function confirmCookieExportPrompt() {
  var provider = pendingCookieExportProvider;
  dismissCookieExportPrompt();
  if (!provider) return;
  var api = window.desktopWindow;
  if (!api || typeof api.exportLoginCookie !== 'function') {
    showToast('桌面版才支持导出登录 cookie');
    return;
  }
  try {
    var result = await api.exportLoginCookie(provider);
    if (result && result.ok) showToast('登录 cookie 已导出到桌面');
    else showToast((result && (result.message || result.error)) || '没有可导出的登录 cookie');
  } catch (e) {
    showToast('导出登录 cookie 失败');
  }
}

async function showLoginModal(opts) {
  opts = opts || {};
  loginProvider = opts.provider ? normalizeLoginProviderKey(opts.provider) : 'netease';
  var modal = document.getElementById('login-modal');
  if (typeof setLoginEasterEggMode === 'function' &&
      (!loginEasterEggState || !loginEasterEggState.ready || !loginEasterEggState.unlocked)) {
    setLoginEasterEggMode(true);
  }
  openGsapModal(modal);
  var unlocked = typeof prepareLoginEasterEggGate === 'function'
    ? await prepareLoginEasterEggGate()
    : true;
  if (!unlocked) return;
  resumeLoginModalAfterGate();
}
function resumeLoginModalAfterGate() {
  bindLoginWorkflowPointerEvents();
  setLoginAuthDrawerOpen(false);
  updateLoginProviderUi();
  scheduleLoginWorkflowEdges('open');
}
function closeLoginModal() {
  stopQrPoll();
  setLoginAuthDrawerOpen(false);
  closeGsapModal(document.getElementById('login-modal'));
}
function setLoginProvider(provider, silent) {
  loginProvider = normalizeLoginProviderKey(provider);
  loginRefreshRequestSeq += 1;
  updateLoginProviderUi();
  if (!silent && document.getElementById('login-modal').classList.contains('show')) refreshQr();
}
function qishuiPublicSearchReady() {
  return !!(qishuiLoginStatus && (qishuiLoginStatus.searchReady || qishuiLoginStatus.publicCatalog));
}
function qishuiLoginStatusText(info) {
  info = info || qishuiLoginStatus || {};
  if (info.reauthRequired) return '汽水音乐登录已失效，请使用抖音 App 重新扫码';
  if (info.stale) return '汽水音乐连接暂时不可用，账号与会员状态待同步';
  if (info.webSession) return '汽水音乐已登录 · 可同步我的喜欢、歌单并按账号权益播放';
  return '请使用抖音 App 扫描二维码并确认登录';
}
function spotifyLoginStatusText(info) {
  info = info || spotifyLoginStatus || {};
  if (info.loggedIn) return 'Spotify 已连接 / ' + (info.product === 'premium' ? 'Premium' : (info.product ? String(info.product).toUpperCase() : '方案未知')) + ' / 可同步歌单和 Liked Songs';
  if (info.reauthRequired) return 'Spotify 长期授权已到期，请重新连接官方 OAuth';
  if (info.stale) return 'Spotify 登录已过期，请重新连接官方 OAuth';
  if (info.localConfigMissing) return 'Spotify 未连接：粘贴 Spotify Client ID 后点击“保存并授权”';
  if (info.oauthConfigured) return 'Spotify Client ID 已保存，点击“连接 Spotify”打开官方授权窗口';
  if (info.configured || info.searchReady) return 'Spotify 搜索已可用；登录后可同步会员状态、歌单和红心歌单';
  var missing = info.oauthMissing && info.oauthMissing.length ? (' 缺少: ' + info.oauthMissing.join(', ')) : '';
  return '粘贴 Spotify Client ID，并在 Spotify Developer Dashboard 登记回调地址 http://127.0.0.1:43879/callback' + missing;
}
function parseSpotifyConfigInput(text) {
  text = String(text || '').trim();
  if (!text) return {};
  var parsed = null;
  if (/^\s*\{/.test(text)) {
    try { parsed = JSON.parse(text); } catch (e) { parsed = null; }
  }
  if (parsed && typeof parsed === 'object') {
    var source = parsed.spotify && typeof parsed.spotify === 'object' ? parsed.spotify : parsed;
    return {
      clientId: source.clientId || source.client_id || source.id || '',
      redirectUri: source.redirectUri || source.redirect_uri || source.callbackUrl || source.callback_url || '',
      market: source.market || source.country || '',
      scope: source.scope || source.scopes || ''
    };
  }
  var payload = {};
  var loose = [];
  text.split(/[\r\n;]+/).forEach(function (part) {
    part = String(part || '').trim();
    if (!part) return;
    var pair = part.match(/^([A-Za-z0-9_\-\s]+)\s*[:=]\s*(.+)$/);
    if (!pair) {
      loose.push(part);
      return;
    }
    var key = pair[1].toLowerCase().replace(/[\s_-]+/g, '');
    var value = pair[2].trim();
    if (key === 'clientid' || key === 'spotifyclientid' || key === 'id') payload.clientId = value;
    else if (key === 'redirecturi' || key === 'callbackurl' || key === 'callback') payload.redirectUri = value;
    else if (key === 'market' || key === 'country') payload.market = value;
    else if (key === 'scope' || key === 'scopes') payload.scope = value;
  });
  if (!payload.clientId && loose.length) payload.clientId = loose[0];
  return payload;
}
async function openSpotifyDeveloperDashboard() {
  try {
    var api = window.desktopWindow;
    if (api && typeof api.openUpdatePage === 'function') await api.openUpdatePage(SPOTIFY_DEVELOPER_DASHBOARD_URL);
    else window.open(SPOTIFY_DEVELOPER_DASHBOARD_URL, '_blank');
  } catch (e) { }
  showToast('已打开 Spotify 开发者网页');
}
async function copySpotifyRedirectUri() {
  var ok = false;
  try {
    var api = window.desktopWindow;
    if (api && typeof api.copyText === 'function') {
      var res = await Promise.resolve(api.copyText(SPOTIFY_REDIRECT_URI));
      ok = !res || res.ok !== false;
    }
  } catch (e) { ok = false; }
  if (!ok && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(SPOTIFY_REDIRECT_URI);
      ok = true;
    } catch (e) { ok = false; }
  }
  if (!ok) {
    var helper = document.createElement('textarea');
    helper.value = SPOTIFY_REDIRECT_URI;
    helper.setAttribute('readonly', 'readonly');
    helper.style.position = 'fixed';
    helper.style.left = '-9999px';
    document.body.appendChild(helper);
    helper.select();
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(helper);
  }
  showToast(ok ? '已复制 Spotify 回调地址' : '复制失败，请手动复制回调地址');
}

function spotifySetupCurrentStep() {
  var configReady = !!(spotifyLoginStatus && spotifyLoginStatus.oauthConfigured);
  var loggedIn = !!(spotifyLoginStatus && spotifyLoginStatus.loggedIn);
  if (!configReady) return 1;
  if (!spotifySetupCallbackReady && !loggedIn) return 2;
  if (!loggedIn) return 3;
  return 4;
}

function setSpotifySetupOverall(message, kind) {
  var node = document.getElementById('spotify-setup-overall');
  if (!node) return;
  node.textContent = message || '按当前步骤继续，Mineradio 会自动检测。';
  node.className = 'spotify-setup-overall' + (kind ? (' ' + kind) : '');
}

function spotifySetupEscapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
  });
}

function renderSpotifySetupChecks() {
  var root = document.getElementById('spotify-setup-check-list');
  if (!root) return;
  var checks = spotifySetupDiagnostics && Array.isArray(spotifySetupDiagnostics.checks)
    ? spotifySetupDiagnostics.checks.filter(function (check) {
      return ['profile', 'scopes', 'library', 'playlists'].indexOf(check && check.id) >= 0;
    })
    : [];
  if (!checks.length) {
    root.innerHTML = '<span class="spotify-setup-check">等待账号授权</span><span class="spotify-setup-check">等待权限检测</span>';
    return;
  }
  root.innerHTML = checks.map(function (check) {
    var title = spotifySetupEscapeHtml(check && check.title || '接口');
    var message = spotifySetupEscapeHtml(check && check.message || '');
    return '<span class="spotify-setup-check ' + (check && check.ok ? 'ok' : 'fail') + '" title="' + message + '">' + title + '</span>';
  }).join('');
}

function renderSpotifySetupWizard() {
  var wizard = document.getElementById('spotify-setup-wizard');
  if (!wizard) return;
  var configReady = !!(spotifyLoginStatus && spotifyLoginStatus.oauthConfigured);
  var loggedIn = !!(spotifyLoginStatus && spotifyLoginStatus.loggedIn);
  var diagnosticsReady = !!(spotifySetupDiagnostics && spotifySetupDiagnostics.ready);
  var currentStep = spotifySetupCurrentStep();
  var completed = {
    1: configReady,
    2: spotifySetupCallbackReady || loggedIn,
    3: loggedIn,
    4: diagnosticsReady
  };
  [1, 2, 3, 4].forEach(function (step) {
    var card = document.getElementById('spotify-setup-step-' + step);
    var progress = document.querySelector('[data-spotify-progress="' + step + '"]');
    var state = document.querySelector('[data-spotify-step-state="' + step + '"]');
    var locked = step > currentStep && !completed[step];
    if (card) {
      card.classList.toggle('is-complete', !!completed[step]);
      card.classList.toggle('is-active', step === currentStep && !completed[step]);
      card.classList.toggle('is-locked', !!locked);
    }
    if (progress) {
      progress.classList.toggle('complete', !!completed[step]);
      progress.classList.toggle('current', step === currentStep && !completed[step]);
    }
    if (state) state.textContent = completed[step] ? '已通过' : (locked ? '等待上一步' : (spotifySetupBusy ? '检测中…' : '进行中'));
  });
  var input = document.getElementById('spotify-setup-client-id');
  if (input && !input.value && spotifyLoginStatus && spotifyLoginStatus.clientId) input.value = spotifyLoginStatus.clientId;
  var redirect = document.getElementById('spotify-setup-redirect-uri');
  if (redirect) redirect.textContent = spotifyLoginStatus && spotifyLoginStatus.redirectUri || SPOTIFY_REDIRECT_URI;
  var saveButton = document.getElementById('spotify-setup-save-client');
  var callbackButton = document.getElementById('spotify-setup-check-callback');
  var authButton = document.getElementById('spotify-setup-authorize');
  var diagnoseButton = document.getElementById('spotify-setup-diagnose');
  if (saveButton) saveButton.disabled = spotifySetupBusy || spotifyConfigBusy || spotifyOAuthBusy;
  if (callbackButton) callbackButton.disabled = !configReady || spotifySetupBusy || spotifyOAuthBusy;
  if (authButton) {
    authButton.disabled = !configReady || (!spotifySetupCallbackReady && !loggedIn) || spotifySetupBusy || spotifyOAuthBusy;
    authButton.textContent = spotifyOAuthBusy ? '等待浏览器授权…' : (loggedIn ? '重新授权 Spotify' : '打开浏览器并授权');
  }
  if (diagnoseButton) diagnoseButton.disabled = !loggedIn || spotifySetupBusy || spotifyOAuthBusy;
  renderSpotifySetupChecks();
}

async function saveSpotifySetupClientId() {
  if (spotifySetupBusy || spotifyConfigBusy || spotifyOAuthBusy) return;
  var input = document.getElementById('spotify-setup-client-id');
  var clientId = String(input && input.value || '').replace(/\s+/g, '').trim();
  if (!clientId) {
    setSpotifySetupOverall('请先粘贴 Dashboard 中的 Client ID。', 'fail');
    if (input) input.focus();
    return;
  }
  spotifyConfigBusy = true;
  spotifySetupBusy = true;
  setSpotifySetupOverall('正在保存并验证 Client ID…');
  renderSpotifySetupWizard();
  try {
    var info = await apiJson('/api/spotify/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: clientId, redirectUri: SPOTIFY_REDIRECT_URI })
    });
    if (!info || info.ok === false || info.error) throw new Error(info && (info.message || info.error) || 'Client ID 保存失败');
    spotifyLoginStatus = normalizeSpotifyLoginStatus(info);
    spotifySetupCallbackReady = false;
    spotifySetupDiagnostics = null;
    setSpotifySetupOverall('Client ID 已通过格式验证。现在把回调地址保存到 Spotify Dashboard。', 'success');
  } catch (error) {
    setSpotifySetupOverall(error && error.message || 'Client ID 保存失败', 'fail');
  } finally {
    spotifyConfigBusy = false;
    spotifySetupBusy = false;
    updateLoginProviderUi();
  }
}

async function verifySpotifySetupCallback(silent) {
  if (spotifySetupBusy || spotifyOAuthBusy) return false;
  var api = window.desktopWindow;
  if (!api || typeof api.verifySpotifyMusicSetup !== 'function') {
    spotifySetupCallbackReady = false;
    setSpotifySetupOverall('当前不是可执行本机回调检测的 Mineradio 桌面环境。', 'fail');
    renderSpotifySetupWizard();
    return false;
  }
  spotifySetupBusy = true;
  if (!silent) setSpotifySetupOverall('正在检测本机回调地址与端口…');
  renderSpotifySetupWizard();
  try {
    var result = await api.verifySpotifyMusicSetup();
    spotifySetupCallbackReady = !!(result && result.ok && result.callbackReady);
    setSpotifySetupOverall(result && result.message || (spotifySetupCallbackReady ? '本机回调检测通过。' : '本机回调检测失败。'), spotifySetupCallbackReady ? 'success' : 'fail');
    return spotifySetupCallbackReady;
  } catch (error) {
    spotifySetupCallbackReady = false;
    setSpotifySetupOverall(error && error.message || '本机回调检测失败。', 'fail');
    return false;
  } finally {
    spotifySetupBusy = false;
    renderSpotifySetupWizard();
  }
}

async function runSpotifySetupDiagnostics(force) {
  if (spotifySetupBusy) return spotifySetupDiagnostics;
  spotifySetupBusy = true;
  setSpotifySetupOverall('正在验证账号资料、权限、喜欢歌曲和个人歌单…');
  renderSpotifySetupWizard();
  try {
    spotifySetupDiagnostics = await apiJson('/api/spotify/setup/diagnostics?t=' + Date.now());
    var ready = !!(spotifySetupDiagnostics && spotifySetupDiagnostics.ready);
    setSpotifySetupOverall(spotifySetupDiagnostics && spotifySetupDiagnostics.message || (ready ? 'Spotify 接口已全部接通。' : '仍有接口未通过。'), ready ? 'success' : 'fail');
    return spotifySetupDiagnostics;
  } catch (error) {
    spotifySetupDiagnostics = { ready: false, checks: [], message: error && error.message || 'Spotify 接口体检失败' };
    setSpotifySetupOverall(spotifySetupDiagnostics.message, 'fail');
    return spotifySetupDiagnostics;
  } finally {
    spotifySetupBusy = false;
    renderSpotifySetupWizard();
  }
}

function scheduleSpotifySetupAutoCheck() {
  if (loginProvider !== 'spotify') return;
  var key = [spotifyLoginStatus && spotifyLoginStatus.oauthConfigured ? 1 : 0, spotifyLoginStatus && spotifyLoginStatus.loggedIn ? 1 : 0].join(':');
  if (spotifySetupAutoCheckKey === key) return;
  spotifySetupAutoCheckKey = key;
  setTimeout(async function () {
    if (loginProvider !== 'spotify') return;
    if (loginProvider === 'spotify' && spotifyLoginStatus && spotifyLoginStatus.loggedIn) await runSpotifySetupDiagnostics(false);
  }, 80);
}
function openQishuiPublicSearch() {
  closeLoginModal();
  if (typeof setSearchMode === 'function') setSearchMode('qishui');
  var input = document.getElementById('search-input');
  if (input) {
    setTimeout(function () {
      try { input.focus({ preventScroll: true }); } catch (e) { try { input.focus(); } catch (_) { } }
    }, 60);
  }
  showToast('汽水搜索已切换为匹配源');
}
function updateLoginProviderUi() {
  var meta = platformMeta(loginProvider);
  var isQQ = loginProvider === 'qq';
  var isKugou = loginProvider === 'kugou';
  var isQishui = loginProvider === 'qishui';
  var isNetease = loginProvider === 'netease';
  var isManualCookieProvider = isNetease || isQQ || isKugou;
  var title = document.getElementById('login-modal-title');
  var desc = document.getElementById('login-modal-desc');
  var shell = document.getElementById('qr-shell');
  var st = document.getElementById('qr-status');
  var refreshBtn = document.getElementById('refresh-qr-btn');
  var qqPanel = document.getElementById('qq-cookie-panel');
  var qqCookieToggle = document.getElementById('qq-cookie-toggle-btn');
  var qqCookieInput = document.getElementById('qq-cookie-input');
  var qqCookieNote = qqPanel ? qqPanel.querySelector('.qq-cookie-note') : null;
  var qqCard = document.getElementById('qq-web-login-card');
  var neteaseBtn = document.getElementById('login-provider-netease');
  var qqBtn = document.getElementById('login-provider-qq');
  var kugouBtn = document.getElementById('login-provider-kugou');
  var qishuiBtn = document.getElementById('login-provider-qishui');
  var qqCookieSaveBtn = document.getElementById('qq-cookie-save-btn');
  var canOpenNeteaseWeb = !!(window.desktopWindow && typeof window.desktopWindow.openNeteaseMusicLogin === 'function');
  var canUseQishuiQrLogin = true;
  var qishuiSearchReady = qishuiPublicSearchReady();
  var qishuiBusy = !!(qishuiTokenBusy || qishuiOAuthBusy);
  var isSpotify = loginProvider === 'spotify';
  var spotifyBtn = document.getElementById('login-provider-spotify');
  var loginDrawer = document.getElementById('login-auth-drawer');
  var loginModalPanel = document.querySelector('#login-modal .dual-login-modal');
  var spotifyWizard = document.getElementById('spotify-setup-wizard');
  var canOpenSpotifyOAuth = !!(window.desktopWindow && typeof window.desktopWindow.openSpotifyMusicLogin === 'function');
  var spotifyBusy = !!(spotifyConfigBusy || spotifyOAuthBusy);
  if (loginDrawer) loginDrawer.classList.toggle('spotify-mode', isSpotify);
  if (loginModalPanel) loginModalPanel.classList.toggle('spotify-setup-open', isSpotify);
  if (spotifyWizard) spotifyWizard.setAttribute('aria-hidden', isSpotify ? 'false' : 'true');
  updateLoginNodeGraphUi();
  if (isSpotify) {
    if (neteaseBtn) neteaseBtn.classList.toggle('active', false);
    if (qqBtn) qqBtn.classList.toggle('active', false);
    if (kugouBtn) kugouBtn.classList.toggle('active', false);
    if (qishuiBtn) qishuiBtn.classList.toggle('active', false);
    if (spotifyBtn) spotifyBtn.classList.toggle('active', true);
    if (title) title.textContent = '连接 Spotify';
    if (desc) desc.innerHTML = canOpenSpotifyOAuth
      ? '粘贴 <b>Spotify Client ID</b> 后保存并授权，用于同步 Premium/Free 状态、歌单和 Liked Songs；播放仍按匹配源自动换源。'
      : '当前环境不支持桌面授权桥；请在 Mineradio 桌面版中连接 Spotify。';
    if (shell) {
      shell.classList.add('web-login-preview');
      shell.classList.remove('qq-preview', 'netease-preview');
    }
    if (qqPanel) {
      qqPanel.classList.add('show', 'spotify-guide-panel');
    }
    if (qqCookieToggle) qqCookieToggle.classList.remove('show');
    if (qqCookieInput) qqCookieInput.placeholder = spotifyLoginStatus.oauthConfigured
      ? '已保存 Client ID；可粘贴新的 Client ID 覆盖'
      : '粘贴 Spotify Client ID';
    if (qqCookieNote) qqCookieNote.innerHTML =
      '<div class="spotify-guide-title">Spotify 玩家接入三步</div>' +
      '<div class="spotify-guide-steps">' +
        '<span>1. 打开网页，创建 App</span>' +
        '<span>2. 回调填 <code>' + SPOTIFY_REDIRECT_URI + '</code></span>' +
        '<span>3. 复制 Client ID，粘到这里</span>' +
      '</div>' +
      '<div class="spotify-guide-actions">' +
        '<button type="button" class="spotify-guide-link" onclick="openSpotifyDeveloperDashboard()">打开网页</button>' +
        '<button type="button" class="spotify-guide-link" onclick="copySpotifyRedirectUri()">复制回调</button>' +
        '<span>PKCE 不用填 Client Secret</span>' +
      '</div>';
    if (qqCookieSaveBtn) {
      qqCookieSaveBtn.disabled = spotifyBusy;
      qqCookieSaveBtn.textContent = spotifyConfigBusy ? '保存中…' : (spotifyOAuthBusy ? '等待授权…' : '保存并授权');
    }
    if (qqCard) {
      qqCard.style.display = '';
      qqCard.disabled = spotifyBusy || !canOpenSpotifyOAuth || !spotifyLoginStatus.oauthConfigured;
      var spCardMark = qqCard.querySelector('b');
      var spCardLabel = qqCard.querySelector('span');
      if (spCardMark) spCardMark.textContent = 'SP';
      if (spCardLabel) spCardLabel.textContent = spotifyOAuthBusy ? '等待 Spotify 授权' : (spotifyLoginStatus.oauthConfigured ? '打开 Spotify 授权' : '先保存 Client ID');
    }
    if (st) {
      st.className = 'preview';
      st.textContent = spotifyLoginStatusText();
    }
    if (refreshBtn) {
      refreshBtn.disabled = spotifyBusy || !canOpenSpotifyOAuth;
      refreshBtn.textContent = spotifyConfigBusy ? '保存中…' : (spotifyOAuthBusy ? '等待授权…' : (spotifyLoginStatus.oauthConfigured ? '连接 Spotify' : '保存并授权'));
      refreshBtn.onclick = spotifyLoginStatus.oauthConfigured ? openSpotifyWebLogin : submitSpotifyConfigLogin;
    }
    renderSpotifySetupWizard();
    scheduleSpotifySetupAutoCheck();
    updateLoginNodeGraphUi();
    return;
  }
  if (qqPanel) qqPanel.classList.remove('spotify-guide-panel');
  if (spotifyBtn) spotifyBtn.classList.toggle('active', false);
  if (neteaseBtn) neteaseBtn.classList.toggle('active', loginProvider === 'netease');
  if (qqBtn) qqBtn.classList.toggle('active', isQQ);
  if (kugouBtn) kugouBtn.classList.toggle('active', isKugou);
  if (qishuiBtn) qishuiBtn.classList.toggle('active', isQishui);
  if (title) title.textContent = isQishui ? '扫码登录汽水音乐' : ('扫码登录' + meta.label);
  if (desc) desc.innerHTML = isQQ
    ? '打开 <b>QQ 音乐官方网页登录窗口</b> 扫码，成功后会自动同步账号会话。'
    : (isKugou
      ? '打开 <b>酷狗音乐官方网页登录窗口</b> 登录，成功后会自动同步账号会话。'
    : (isQishui
      ? '使用已登录账号的 <b>抖音 App</b> 扫描官方二维码并确认，登录后可同步我的喜欢、歌单并按账号权益播放。'
    : (canOpenNeteaseWeb
      ? '打开 <b>网易云音乐官方网页登录窗口</b> 扫码，避开接口二维码风控；成功后会自动同步账号会话。'
      : '使用 <b>网易云音乐 App</b> 扫码，可同步歌单、红心与播客。')));
  var manualCookieOpen = isManualCookieOpenForProvider(loginProvider);
  if (shell) {
    var useWebPreview = isQQ || isKugou || (isNetease && (canOpenNeteaseWeb || manualCookieOpen));
    shell.classList.toggle('web-login-preview', useWebPreview);
    shell.classList.toggle('qq-preview', isQQ);
    shell.classList.toggle('netease-preview', isNetease && canOpenNeteaseWeb);
  }
  if (qqPanel) qqPanel.classList.toggle('show', isManualCookieProvider && manualCookieOpen);
  if (qqCookieToggle) {
    qqCookieToggle.classList.toggle('show', isManualCookieProvider);
    qqCookieToggle.textContent = manualCookieOpen ? '收起导入' : 'Cookie 导入';
  }
  if (qqCookieInput) qqCookieInput.placeholder = isKugou ? 'KuGoo=...; token=...; userid=...; kg_mid=...' : (isNetease ? 'MUSIC_U=...; __csrf=...' : 'uin=...; qqmusic_key=...; qm_keyst=...');
  if (qqCookieNote) qqCookieNote.textContent = isKugou ? '从 kugou.com 的登录会话导入。' : (isNetease ? '从 music.163.com 的登录会话导入。' : '从 y.qq.com 的登录会话导入。');
  if (qqCookieSaveBtn) qqCookieSaveBtn.textContent = '保存 Cookie';
  if (qqCard) {
    qqCard.style.display = '';
    qqCard.disabled = isQishui ? (qishuiBusy || !canUseQishuiQrLogin) : (isQQ ? !!qqWebLoginBusy : (isKugou ? !!kugouWebLoginBusy : !!neteaseWebLoginBusy));
    var cardMark = qqCard.querySelector('b');
    var cardLabel = qqCard.querySelector('span');
    if (cardMark) cardMark.textContent = isQQ ? 'QQ' : (isKugou ? 'KG' : (isQishui ? 'QS' : 'NE'));
    if (cardLabel) cardLabel.textContent = isQQ
      ? (qqWebLoginBusy ? '等待扫码确认' : (qqLoginStatus.loggedIn ? '重新打开官方窗口同步会员' : '打开官方扫码窗口'))
      : (isKugou ? (kugouWebLoginBusy ? '等待登录确认' : '打开官方登录窗口') : (isQishui ? (qishuiOAuthBusy ? '正在生成二维码' : '扫码登录汽水') : (neteaseWebLoginBusy ? '等待扫码确认' : '打开官方登录窗口')));
  }
  if (st) {
    st.className = isManualCookieProvider ? 'preview' : '';
    st.textContent = isQQ
      ? qqLoginStatusText(qqLoginStatus)
      : (isKugou
        ? (kugouLoginStatus.loggedIn ? ('已保存酷狗音乐会话 · ' + (kugouLoginStatus.nickname || '')) : '点击“登录”打开酷狗音乐官方窗口')
        : (isQishui
          ? qishuiLoginStatusText()
        : (canOpenNeteaseWeb ? '点击“网页登录”打开网易云官方窗口' : '正在生成二维码…')));
  }
  if (refreshBtn) {
    refreshBtn.disabled = isQishui ? (qishuiBusy || !canUseQishuiQrLogin) : (isQQ ? !!qqWebLoginBusy : (isKugou ? !!kugouWebLoginBusy : !!neteaseWebLoginBusy));
    var qqNeedsAuthRefresh = isQQ && qqLoginStatus.loggedIn && (
      qqLoginStatus.authorizationIncomplete ||
      qqLoginStatus.playbackKeyReady === false
    );
    var qqNeedsMembershipSync = isQQ && typeof qqMembershipNeedsSync === 'function' && qqMembershipNeedsSync(qqLoginStatus);
    refreshBtn.textContent = isQishui ? (qishuiOAuthBusy ? '生成中…' : '刷新二维码') : (isQQ ? (qqWebLoginBusy ? '等待扫码…' : (qqNeedsAuthRefresh ? '重新授权' : (qqNeedsMembershipSync ? '同步会员' : (qqLoginStatus.loggedIn ? '刷新状态' : '扫码登录')))) : (isKugou ? (kugouWebLoginBusy ? '等待登录…' : '登录') : (canOpenNeteaseWeb ? (neteaseWebLoginBusy ? '等待扫码…' : '网页登录') : '刷新二维码')));
    refreshBtn.onclick = isQishui ? openQishuiWebLogin : (isQQ ? (qqNeedsAuthRefresh ? openQQWebLogin : (qqLoginStatus.loggedIn ? refreshQr : openQQWebLogin)) : (isKugou ? openKugouWebLogin : (canOpenNeteaseWeb ? openNeteaseWebLogin : refreshQr)));
  }
  updateLoginNodeGraphUi();
}
async function refreshQr() {
  stopQrPoll();
  updateLoginProviderUi();
  var refreshProvider = loginProvider;
  var refreshSeq = ++loginRefreshRequestSeq;
  if (loginProvider === 'spotify') {
    qrKey = null;
    var spotifyStatus = document.getElementById('qr-status');
    var spotifyImg = document.getElementById('qr-img');
    if (spotifyImg) spotifyImg.src = '';
    var spotifyInfo = await refreshSpotifyLoginStatus();
    if (!isLoginRefreshCurrent(refreshProvider, refreshSeq)) return;
    updateLoginProviderUi();
    if (spotifyStatus) {
      spotifyStatus.textContent = spotifyLoginStatusText(spotifyInfo);
      spotifyStatus.className = 'preview';
    }
    return;
  }
  if (loginProvider === 'qishui') {
    qrKey = null;
    var qishuiStatus = document.getElementById('qr-status');
    var qishuiImg = document.getElementById('qr-img');
    if (qishuiImg) qishuiImg.src = '';
    qishuiOAuthBusy = true;
    updateLoginProviderUi();
    try {
      var qishuiQr = await apiJson('/api/qishui/login/qrcode?t=' + Date.now());
      if (!isLoginRefreshCurrent(refreshProvider, refreshSeq)) return;
      if (!qishuiQr || !qishuiQr.token || !qishuiQr.qrcode) {
        throw new Error((qishuiQr && (qishuiQr.message || qishuiQr.error)) || '生成汽水音乐二维码失败');
      }
      qrKey = qishuiQr.token;
      if (qishuiImg) {
        qishuiImg.src = qishuiQr.qrcode;
        qishuiImg.alt = '汽水音乐登录二维码';
      }
      if (qishuiStatus) {
        qishuiStatus.textContent = '请使用抖音 App 扫码并确认登录';
        qishuiStatus.className = '';
      }
      startQrPoll();
    } catch (e) {
      if (!isLoginRefreshCurrent(refreshProvider, refreshSeq)) return;
      if (qishuiStatus) {
        qishuiStatus.textContent = '出错: ' + (e && e.message ? e.message : e);
        qishuiStatus.className = 'fail';
      }
    } finally {
      qishuiOAuthBusy = false;
      if (isLoginRefreshCurrent(refreshProvider, refreshSeq)) updateLoginProviderUi();
      if (qishuiStatus && qrKey && isLoginRefreshCurrent(refreshProvider, refreshSeq)) {
        qishuiStatus.textContent = '请使用抖音 App 扫码并确认登录';
        qishuiStatus.className = '';
      }
    }
    return;
  }
  if (loginProvider === 'qq') {
    qrKey = null;
    var qqStatus = document.getElementById('qr-status');
    var qqImg = document.getElementById('qr-img');
    if (qqImg) qqImg.src = '';
    var info = await refreshQQVipStatusNow('login-panel');
    if (!isLoginRefreshCurrent(refreshProvider, refreshSeq)) return;
    if (qqStatus) {
      qqStatus.textContent = qqLoginStatusText(info);
      qqStatus.className = 'preview';
    }
    return;
  }
  if (loginProvider === 'kugou') {
    qrKey = null;
    var kugouStatus = document.getElementById('qr-status');
    var kugouImg = document.getElementById('qr-img');
    if (kugouImg) kugouImg.src = '';
    var kugouInfo = await refreshKugouLoginStatus();
    if (!isLoginRefreshCurrent(refreshProvider, refreshSeq)) return;
    if (kugouStatus) {
      kugouStatus.textContent = kugouInfo && kugouInfo.loggedIn ? ('已保存酷狗音乐会话 · ' + (kugouInfo.nickname || '')) : '点击“登录”打开酷狗音乐官方窗口';
      kugouStatus.className = 'preview';
    }
    return;
  }
  if (window.desktopWindow && typeof window.desktopWindow.openNeteaseMusicLogin === 'function') {
    qrKey = null;
    var neImg = document.getElementById('qr-img');
    var neStatus = document.getElementById('qr-status');
    if (neImg) neImg.src = '';
    if (neStatus) {
      neStatus.textContent = loginStatus.loggedIn ? ('已保存网易云会话 · ' + (loginStatus.nickname || '')) : '点击“网页登录”打开网易云官方窗口';
      neStatus.className = 'preview';
    }
    return;
  }
  try {
    var k = await apiJson('/api/login/qr/key');
    if (!isLoginRefreshCurrent(refreshProvider, refreshSeq)) return;
    if (!k.key) throw new Error('获取 key 失败');
    qrKey = k.key;
    var q = await apiJson('/api/login/qr/create?key=' + encodeURIComponent(qrKey));
    if (!isLoginRefreshCurrent(refreshProvider, refreshSeq)) return;
    if (!q.img) throw new Error('生成二维码失败');
    document.getElementById('qr-img').src = q.img;
    document.getElementById('qr-status').textContent = '请使用网易云音乐 App 扫码';
    startQrPoll();
  } catch (e) {
    if (!isLoginRefreshCurrent(refreshProvider, refreshSeq)) return;
    document.getElementById('qr-status').textContent = '出错: ' + e.message;
    document.getElementById('qr-status').className = 'fail';
  }
}
function startQrPoll() {
  if (qrPollTimer) {
    clearInterval(qrPollTimer);
    clearTimeout(qrPollTimer);
  }
  if (loginProvider === 'qishui') {
    var generation = qishuiQrPollGeneration;
    qrPollTimer = setTimeout(function () { pollQishuiQr(generation); }, 1200);
    return;
  }
  qrPollTimer = setInterval(checkQr, 2000);
}
function stopQrPoll() {
  if (qrPollTimer) {
    clearInterval(qrPollTimer);
    clearTimeout(qrPollTimer);
    qrPollTimer = null;
  }
  qishuiQrPollGeneration += 1;
  qishuiQrPollBusy = false;
}
function scheduleQishuiQrPoll(generation, delay) {
  if (generation !== qishuiQrPollGeneration || loginProvider !== 'qishui' || !qrKey) return;
  if (qrPollTimer) clearTimeout(qrPollTimer);
  qrPollTimer = setTimeout(function () { pollQishuiQr(generation); }, Math.max(1000, Number(delay) || 4500));
}
async function pollQishuiQr(generation) {
  if (generation !== qishuiQrPollGeneration || loginProvider !== 'qishui' || !qrKey || qishuiQrPollBusy) return;
  qishuiQrPollBusy = true;
  var statusEl = document.getElementById('qr-status');
  var nextDelay = 4500;
  try {
    var result = await apiJson('/api/qishui/login/check?token=' + encodeURIComponent(qrKey) + '&t=' + Date.now());
    if (generation !== qishuiQrPollGeneration || loginProvider !== 'qishui') return;
    if (result && result.loggedIn) {
      stopQrPoll();
      qishuiLoginStatus = normalizeQishuiLoginStatus(result);
      activeAccountProvider = 'qishui';
      markLoginWorkflowConnected('qishui');
      renderUserBtn();
      if (statusEl) {
        statusEl.textContent = '登录成功！';
        statusEl.className = 'scan';
      }
      await refreshUserPlaylists(true);
      loadHomeDiscover(true);
      setTimeout(function () {
        closeLoginModal();
        showToast('汽水音乐已登录: ' + (qishuiLoginStatus.nickname || qishuiLoginStatus.userId || ''));
      }, 450);
      return;
    }
    var code = Number(result && (result.errorCode || result.error_code) || 0);
    var qrStatus = String(result && result.status || 'waiting');
    if (code === 2 || qrStatus === 'expired' || qrStatus === 'reauth_required' || result && result.reauthRequired) {
      stopQrPoll();
      if (statusEl) {
        statusEl.textContent = result && result.reauthRequired ? '登录状态已失效，请刷新二维码后重新扫码' : '二维码已过期，请刷新';
        statusEl.className = 'fail';
      }
      return;
    }
    if (qrStatus === 'verifying') {
      nextDelay = 8000;
      if (statusEl) {
        statusEl.textContent = '扫码已确认，正在重新验证账号连接…';
        statusEl.className = 'preview';
      }
    } else if (code === 7 || qrStatus === 'rate_limited') {
      nextDelay = Number(result && result.retryAfterMs) || 60000;
      if (statusEl) {
        statusEl.textContent = '请求较频繁，稍后自动继续检查…';
        statusEl.className = 'preview';
      }
    } else if (qrStatus === 'mfa_cancelled') {
      stopQrPoll();
      if (statusEl) {
        statusEl.textContent = '二次验证已取消，请刷新二维码后重试';
        statusEl.className = 'fail';
      }
      return;
    } else if (statusEl) {
      statusEl.textContent = qrStatus === 'scanned' || qrStatus === '2'
        ? '已扫码，请在手机确认…'
        : '等待扫码确认…';
      statusEl.className = qrStatus === 'scanned' || qrStatus === '2' ? 'scan' : '';
    }
  } catch (e) {
    nextDelay = 8000;
    console.warn('Qishui QR check failed:', e);
    if (statusEl) {
      statusEl.textContent = '登录状态检查失败，正在重试…';
      statusEl.className = 'fail';
    }
  } finally {
    qishuiQrPollBusy = false;
    scheduleQishuiQrPoll(generation, nextDelay);
  }
}
function toggleQQCookiePanel() {
  if (loginProvider === 'spotify') return;
  setManualCookieOpenForProvider(loginProvider, !isManualCookieOpenForProvider(loginProvider));
  updateLoginProviderUi();
}
function openProviderWebLogin() {
  if (loginProvider === 'qq') return openQQWebLogin();
  if (loginProvider === 'kugou') return openKugouWebLogin();
  if (loginProvider === 'qishui') return openQishuiWebLogin();
  if (loginProvider === 'spotify') return openSpotifyWebLogin();
  return openNeteaseWebLogin();
}
async function openSpotifyWebLogin() {
  if (spotifyOAuthBusy) return;
  var api = window.desktopWindow;
  if (!api || !api.isDesktop || typeof api.openSpotifyMusicLogin !== 'function') {
    setSpotifySetupOverall('当前环境不支持 Spotify 本地授权桥，请使用 Mineradio 桌面版。', 'fail');
    return;
  }
  if (!spotifyLoginStatus.oauthConfigured && !spotifyLoginStatus.tokenConfigured) {
    var latestStatus = await refreshSpotifyLoginStatus();
    if (!latestStatus.oauthConfigured && !latestStatus.tokenConfigured) {
      updateLoginProviderUi();
      setSpotifySetupOverall('先完成第一步：粘贴并保存 Spotify Client ID。', 'fail');
      return;
    }
  }
  if (!spotifySetupCallbackReady) {
    var callbackReady = await verifySpotifySetupCallback(false);
    if (!callbackReady) return;
  }
  spotifyOAuthBusy = true;
  updateLoginProviderUi();
  setSpotifySetupOverall('已打开系统浏览器，请在 Spotify 官方页面完成授权；Mineradio 正在等待回调。');
  var failText = '';
  try {
    var result = await api.openSpotifyMusicLogin();
    if (!result || !result.ok) {
      if (result && result.error === 'SPOTIFY_OAUTH_NOT_CONFIGURED') {
        throw new Error((result.message || '请先保存 Spotify Client ID') + (result.redirectUri ? (' / 回调地址: ' + result.redirectUri) : ''));
      }
      throw new Error((result && (result.message || result.error)) || 'Spotify 授权未完成');
    }
    setSpotifySetupOverall('授权已返回，正在验证账号资料和接口…');
    var info = await refreshSpotifyLoginStatus();
    if (!info || !info.loggedIn) throw new Error((info && (info.message || info.error)) || 'Spotify 登录态不可用');
    activeAccountProvider = 'spotify';
    markLoginWorkflowConnected('spotify');
    renderUserBtn();
    await refreshUserPlaylists(true);
    loadHomeDiscover(true);
    spotifyOAuthBusy = false;
    updateLoginProviderUi();
    await runSpotifySetupDiagnostics(true);
    showToast('Spotify 已连接: ' + (info.nickname || info.userId || ''));
  } catch (e) {
    failText = e && e.message ? e.message : 'Spotify 授权失败';
    setSpotifySetupOverall(failText, 'fail');
  } finally {
    spotifyOAuthBusy = false;
    updateLoginProviderUi();
    if (failText) setSpotifySetupOverall(failText, 'fail');
  }
}
async function submitSpotifyConfigLogin() {
  return saveSpotifySetupClientId();
}
async function openNeteaseWebLogin() {
  if (neteaseWebLoginBusy) return;
  var statusEl = document.getElementById('qr-status');
  var api = window.desktopWindow;
  if (!api || !api.isDesktop || typeof api.openNeteaseMusicLogin !== 'function') {
    if (statusEl) { statusEl.textContent = '当前环境不支持官方网页登录，正在尝试旧二维码…'; statusEl.className = 'fail'; }
    return refreshQr();
  }

  neteaseWebLoginBusy = true;
  updateLoginProviderUi();
  if (statusEl) { statusEl.textContent = '已打开网易云窗口，请在官方页面扫码登录…'; statusEl.className = 'preview'; }
  try {
    var result = await api.openNeteaseMusicLogin();
    if (!result || !result.ok || !result.cookie) {
      throw new Error((result && (result.message || result.error)) || '网易云登录未完成');
    }
    if (statusEl) { statusEl.textContent = '正在同步网易云会话…'; statusEl.className = 'preview'; }
    var info = await apiJson('/api/login/cookie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie: result.cookie })
    });
    if (!info || !info.loggedIn) throw new Error((info && (info.message || info.error)) || '网易云会话不可用');
    loginStatus = info;
    activeAccountProvider = 'netease';
    renderUserBtn();
    refreshUserPlaylists(true);
    loadHomeDiscover(true);
    if (statusEl) { statusEl.textContent = '网易云会话已保存'; statusEl.className = 'scan'; }
    offerLoginCookieExport('netease', info);
    setTimeout(function () {
      closeLoginModal();
      showToast('网易云已登录: ' + (info.nickname || info.userId || ''));
    }, 420);
  } catch (e) {
    neteaseWebLoginBusy = false;
    updateLoginProviderUi();
    if (statusEl) { statusEl.textContent = e && e.message ? e.message : '网易云登录失败'; statusEl.className = 'fail'; }
  } finally {
    if (neteaseWebLoginBusy) {
      neteaseWebLoginBusy = false;
      updateLoginProviderUi();
    }
  }
}
async function openQQWebLogin() {
  if (qqWebLoginBusy) return;
  var statusEl = document.getElementById('qr-status');
  var api = window.desktopWindow;
  if (!api || !api.isDesktop || typeof api.openQQMusicLogin !== 'function') {
    qqManualCookieOpen = true;
    updateLoginProviderUi();
    if (statusEl) { statusEl.textContent = '当前环境不支持自动网页登录，可先使用手动导入。'; statusEl.className = 'fail'; }
    return;
  }

  qqWebLoginBusy = true;
  updateLoginProviderUi();
  if (statusEl) { statusEl.textContent = '已打开 QQ 音乐窗口，请扫码并确认登录…'; statusEl.className = 'preview'; }
  try {
    var result = await api.openQQMusicLogin({
      forceReauth: !!(qqLoginStatus && qqLoginStatus.authorizationIncomplete && qqLoginStatus.playbackKeyReady === false)
    });
    if (!result || !result.ok || !result.cookie) {
      throw new Error((result && (result.message || result.error)) || 'QQ 登录未完成');
    }
    if (statusEl) { statusEl.textContent = '正在同步 QQ 音乐会话…'; statusEl.className = 'preview'; }
    var info = await apiJson('/api/qq/login/cookie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie: result.cookie })
    });
    if (!info || !info.loggedIn) throw new Error((info && (info.message || info.error)) || 'QQ 会话不可用');
    qqLoginStatus = normalizeQQLoginStatus(info);
    auditProviderVipState('qq', qqLoginStatus);
    activeAccountProvider = 'qq';
    qqManualCookieOpen = false;
    renderUserBtn();
    refreshUserPlaylists(true);
    offerLoginCookieExport('qq', info);
    var qqPlaybackReady = !!info.playbackKeyReady && !result.partial;
    if (!qqPlaybackReady) {
      if (statusEl) { statusEl.textContent = 'QQ 账号态已同步，但播放授权未完成；请重新打开 QQ 音乐登录并等待进入播放器页后再关闭窗口。'; statusEl.className = 'preview'; }
      showToast('QQ 账号态已同步，播放授权未完成');
      return;
    }
    if (statusEl) { statusEl.textContent = qqPlaybackReady ? qqLoginStatusText(qqLoginStatus) : 'QQ 账号已同步，播放授权不完整，部分歌曲会自动换源'; statusEl.className = 'scan'; }
    setTimeout(function () {
      closeLoginModal();
      showToast((qqPlaybackReady ? 'QQ 音乐已登录: ' : 'QQ 账号已同步: ') + (info.nickname || info.userId || ''));
    }, 420);
  } catch (e) {
    qqWebLoginBusy = false;
    updateLoginProviderUi();
    if (statusEl) { statusEl.textContent = e && e.message ? e.message : 'QQ 登录失败'; statusEl.className = 'fail'; }
  } finally {
    if (qqWebLoginBusy) {
      qqWebLoginBusy = false;
      updateLoginProviderUi();
    }
  }
}
async function openKugouWebLogin() {
  if (kugouWebLoginBusy) return;
  var statusEl = document.getElementById('qr-status');
  var api = window.desktopWindow;
  if (!api || !api.isDesktop || typeof api.openKugouMusicLogin !== 'function') {
    kugouManualCookieOpen = true;
    updateLoginProviderUi();
    if (statusEl) { statusEl.textContent = '当前环境不支持自动网页登录，可先使用手动导入。'; statusEl.className = 'fail'; }
    return;
  }

  kugouWebLoginBusy = true;
  updateLoginProviderUi();
  if (statusEl) { statusEl.textContent = '已打开酷狗音乐窗口，请完成官方登录…'; statusEl.className = 'preview'; }
  try {
    var result = await api.openKugouMusicLogin({ forceReauth: true });
    if (!result || !result.ok || !result.cookie) {
      throw new Error((result && (result.message || result.error)) || '酷狗登录未完成');
    }
    if (statusEl) { statusEl.textContent = '正在同步酷狗音乐会话…'; statusEl.className = 'preview'; }
    var info = await apiJson('/api/kugou/login/cookie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie: result.cookie })
    });
    if (!info || !info.loggedIn) throw new Error((info && (info.message || info.error)) || '酷狗会话不可用');
    kugouLoginStatus = normalizeKugouLoginStatus(info);
    activeAccountProvider = 'kugou';
    kugouManualCookieOpen = false;
    renderUserBtn();
    refreshUserPlaylists(true);
    offerLoginCookieExport('kugou', info);
    var ready = !!info.playbackKeyReady && !result.partial;
    if (statusEl) { statusEl.textContent = ready ? '酷狗音乐会话已保存' : '酷狗账号已同步，播放授权不完整，部分歌曲可能需要重登'; statusEl.className = 'scan'; }
    setTimeout(function () {
      closeLoginModal();
      showToast((ready ? '酷狗音乐已登录: ' : '酷狗账号已同步: ') + (info.nickname || info.userId || ''));
    }, 420);
  } catch (e) {
    kugouWebLoginBusy = false;
    updateLoginProviderUi();
    if (statusEl) { statusEl.textContent = e && e.message ? e.message : '酷狗登录失败'; statusEl.className = 'fail'; }
  } finally {
    if (kugouWebLoginBusy) {
      kugouWebLoginBusy = false;
      updateLoginProviderUi();
    }
  }
}
async function openQishuiWebLogin() {
  if (qishuiTokenBusy || qishuiOAuthBusy) return;
  return refreshQr();
}
async function submitQQCookieLogin() {
  if (loginProvider === 'spotify') return submitSpotifyConfigLogin();
  if (loginProvider === 'qishui') return openQishuiWebLogin();
  if (loginProvider === 'netease') return submitNeteaseCookieLogin();
  var isKugou = loginProvider === 'kugou';
  if (isKugou ? kugouCookieBusy : qqCookieBusy) return;
  var input = document.getElementById('qq-cookie-input');
  var statusEl = document.getElementById('qr-status');
  var saveBtn = document.getElementById('qq-cookie-save-btn');
  var cookie = input ? input.value.trim() : '';
  if (!cookie) {
    if (statusEl) { statusEl.textContent = isKugou ? '先粘贴酷狗音乐 cookie' : '先粘贴 QQ 音乐 cookie'; statusEl.className = 'fail'; }
    return;
  }
  if (isKugou) kugouCookieBusy = true;
  else qqCookieBusy = true;
  if (saveBtn) saveBtn.classList.add('busy');
  if (statusEl) { statusEl.textContent = isKugou ? '正在保存酷狗会话…' : '正在保存 QQ 会话…'; statusEl.className = 'preview'; }
  try {
    var info = await apiJson(isKugou ? '/api/kugou/login/cookie' : '/api/qq/login/cookie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie: cookie })
    });
    if (!info || !info.loggedIn) throw new Error((info && (info.message || info.error)) || (isKugou ? '酷狗会话不可用' : 'QQ 会话不可用'));
    if (isKugou) kugouLoginStatus = normalizeKugouLoginStatus(info);
    else {
      qqLoginStatus = normalizeQQLoginStatus(info);
      auditProviderVipState('qq', qqLoginStatus);
    }
    activeAccountProvider = isKugou ? 'kugou' : 'qq';
    if (input) input.value = '';
    renderUserBtn();
    refreshUserPlaylists(true);
    var manualPlaybackReady = !!info.playbackKeyReady;
    if (statusEl) { statusEl.textContent = manualPlaybackReady ? (isKugou ? '酷狗音乐会话已保存' : qqLoginStatusText(qqLoginStatus)) : (isKugou ? '酷狗账号已同步，播放授权不完整，部分歌曲可能需要重登' : 'QQ 账号已同步，播放授权不完整，部分歌曲会自动换源'); statusEl.className = 'scan'; }
    setManualCookieOpenForProvider(activeAccountProvider, false);
    offerLoginCookieExport(activeAccountProvider, info);
    setTimeout(function () {
      closeLoginModal();
      showToast((manualPlaybackReady ? (isKugou ? '酷狗音乐已登录: ' : 'QQ 音乐已登录: ') : (isKugou ? '酷狗账号已同步: ' : 'QQ 账号已同步: ')) + (info.nickname || info.userId || ''));
    }, 420);
  } catch (e) {
    if (statusEl) { statusEl.textContent = e && e.message ? e.message : (isKugou ? '酷狗会话保存失败' : 'QQ 会话保存失败'); statusEl.className = 'fail'; }
  } finally {
    if (isKugou) kugouCookieBusy = false;
    else qqCookieBusy = false;
    if (saveBtn) saveBtn.classList.remove('busy');
  }
}

async function submitNeteaseCookieLogin() {
  if (qqCookieBusy) return;
  var input = document.getElementById('qq-cookie-input');
  var statusEl = document.getElementById('qr-status');
  var saveBtn = document.getElementById('qq-cookie-save-btn');
  var cookie = input ? input.value.trim() : '';
  if (!cookie) {
    if (statusEl) { statusEl.textContent = '先粘贴网易云 MUSIC_U cookie'; statusEl.className = 'fail'; }
    return;
  }
  qqCookieBusy = true;
  if (saveBtn) saveBtn.classList.add('busy');
  if (statusEl) { statusEl.textContent = '正在保存网易云会话…'; statusEl.className = 'preview'; }
  try {
    var info = await apiJson('/api/login/cookie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie: cookie })
    });
    if (!info || !info.loggedIn) throw new Error((info && (info.message || info.error)) || '网易云会话不可用');
    loginStatus = info;
    activeAccountProvider = 'netease';
    neteaseManualCookieOpen = false;
    if (input) input.value = '';
    renderUserBtn();
    refreshUserPlaylists(true);
    loadHomeDiscover(true);
    if (statusEl) { statusEl.textContent = '网易云会话已保存'; statusEl.className = 'scan'; }
    offerLoginCookieExport('netease', info);
    setTimeout(function () {
      closeLoginModal();
      showToast('网易云已登录: ' + (info.nickname || info.userId || ''));
    }, 420);
  } catch (e) {
    if (statusEl) { statusEl.textContent = e && e.message ? e.message : '网易云会话保存失败'; statusEl.className = 'fail'; }
  } finally {
    qqCookieBusy = false;
    if (saveBtn) saveBtn.classList.remove('busy');
    updateLoginProviderUi();
  }
}
async function checkQr() {
  if (!qrKey) return;
  try {
    var r = await apiJson('/api/login/qr/check?key=' + encodeURIComponent(qrKey));
    var $st = document.getElementById('qr-status');
    if (r.code === 800) { $st.textContent = '二维码已过期, 请刷新'; $st.className = 'fail'; stopQrPoll(); }
    else if (r.code === 801) { $st.textContent = '请在 App 中扫码'; $st.className = ''; }
    else if (r.code === 802) { $st.textContent = '已扫码, 请在手机确认…'; $st.className = 'scan'; }
    else if (r.code === 803 && (r.loggedIn || r.hasCookie)) {
      $st.textContent = r.pendingProfile ? '登录成功，正在同步账号资料…' : '登录成功！'; $st.className = 'scan';
      stopQrPoll();
      loginStatus = r.loggedIn ? r : Object.assign({}, r, { loggedIn: true, pendingProfile: true, nickname: r.nickname || '网易云用户' });
      activeAccountProvider = 'netease';
      renderUserBtn();
      setTimeout(async function () {
        var fresh = await refreshLoginStatus(true);
        if (!fresh || !fresh.loggedIn) {
          loginStatus = Object.assign({}, loginStatus, { loggedIn: true, pendingProfile: true });
          renderUserBtn();
          fresh = loginStatus;
        }
        closeLoginModal();
        offerLoginCookieExport('netease', fresh);
        showToast('欢迎 ' + (fresh && fresh.nickname ? fresh.nickname : ''));
      }, r.pendingProfile ? 1200 : 500);
    } else if (r.code === 803) {
      $st.textContent = '扫码已确认，但没有拿到登录凭证，请刷新二维码重试'; $st.className = 'fail';
      stopQrPoll();
    }
  } catch (e) { console.warn(e); }
}
