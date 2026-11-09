'use strict';

// Focused authentication bridge ported from
// Wx2yZx/Mineradio-Qishui-QR-Login revision
// aaadaab7d011714f94fbe45b382ba8dcc7cf17b9 (GPL-3.0-only).

const fs = require('fs');
const os = require('os');
const path = require('path');
const qishuiAuthV6 = require('./qishui-auth-v6');

const DEFAULT_CONFIG_FILE = path.join(__dirname, '.qishui-qr-login.json');

function defaultConfig() {
  return {
    deviceId: '',
    installId: '',
    verifyPortraitId: '',
    computerName: os.hostname() || 'Windows-PC',
    cookie: '',
    msToken: '',
  };
}

function readConfig(file) {
  try {
    if (!file || !fs.existsSync(file)) return defaultConfig();
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    return { ...defaultConfig(), ...(parsed && typeof parsed === 'object' ? parsed : {}) };
  } catch (error) {
    console.warn('[QishuiQrLogin] ignored invalid config:', error && error.message || error);
    return defaultConfig();
  }
}

function writeConfig(file, value) {
  if (!file) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function hasLoginCookie(cookie) {
  return /(?:^|;\s*)(?:sessionid|sessionid_ss|sid_guard|sid_tt)=[^;\s]+/i.test(String(cookie || ''));
}

function createQishuiQrLoginBridge(options) {
  options = options && typeof options === 'object' ? options : {};
  const auth = options.auth || qishuiAuthV6;
  const configFile = options.configFile || process.env.QISHUI_QR_CONFIG_FILE || DEFAULT_CONFIG_FILE;
  let config = {
    ...readConfig(configFile),
    ...(options.initialConfig && typeof options.initialConfig === 'object' ? options.initialConfig : {}),
  };
  let qrGeneration = 0;
  let activeQrToken = '';
  let confirmedQrToken = '';
  let confirmedQrResult = null;
  let qrPending = false;

  function getConfig() {
    return { ...config };
  }

  function updateConfig(partial) {
    partial = partial && typeof partial === 'object' ? partial : {};
    config = { ...config, ...partial };
    writeConfig(configFile, config);
    return getConfig();
  }

  auth.configure({ getConfig, updateConfig });

  async function createQrCode() {
    const generation = ++qrGeneration;
    activeQrToken = '';
    confirmedQrToken = '';
    confirmedQrResult = null;
    qrPending = true;
    const result = await auth.getQrCode();
    const data = result && result.data || {};
    if (!data.token || !data.qrcode) {
      const error = new Error('QISHUI_QR_PAYLOAD_INCOMPLETE');
      error.code = 'QISHUI_QR_PAYLOAD_INCOMPLETE';
      throw error;
    }
    if (generation !== qrGeneration) {
      const error = new Error('QISHUI_QR_REPLACED');
      error.code = 'QISHUI_QR_REPLACED';
      throw error;
    }
    activeQrToken = String(data.token);
    return result;
  }

  async function checkQrConnect(token) {
    token = String(token || '').trim();
    if (!token) {
      const error = new Error('QISHUI_QR_TOKEN_REQUIRED');
      error.code = 'QISHUI_QR_TOKEN_REQUIRED';
      throw error;
    }
    if (token !== activeQrToken) {
      return { message: 'error', data: { error_code: 2, status: 'expired', confirmed: false } };
    }
    if (confirmedQrToken === token && confirmedQrResult) return confirmedQrResult;
    const generation = qrGeneration;
    const result = await auth.checkQrConnect(token);
    const data = result && result.data || {};
    const confirmed = generation === qrGeneration && token === activeQrToken &&
      Number(data.error_code) === 0 &&
      (String(data.status) === '3' || String(data.status) === 'confirmed' || !!data.session_cookie) &&
      hasLoginCookie(config.cookie);
    if (confirmed) {
      confirmedQrToken = token;
      qrPending = false;
      confirmedQrResult = { ...result, data: { ...data, confirmed: true } };
      return confirmedQrResult;
    }
    return { ...result, data: { ...data, confirmed } };
  }

  function getCookie() {
    return String(config.cookie || '').trim();
  }

  function getStatus() {
    const cookie = getCookie();
    return {
      provider: 'qishui',
      loggedIn: !qrPending && hasLoginCookie(cookie),
      cookieReady: hasLoginCookie(cookie),
      qrPending,
      qrConfirmed: !!activeQrToken && confirmedQrToken === activeQrToken,
      deviceId: String(config.deviceId || ''),
      msTokenReady: !!config.msToken,
      configFile,
    };
  }

  async function clear() {
    qrGeneration += 1;
    activeQrToken = '';
    confirmedQrToken = '';
    confirmedQrResult = null;
    qrPending = false;
    await auth.clear();
    updateConfig({ cookie: '', msToken: '' });
    return getStatus();
  }

  return {
    createQrCode,
    checkQrConnect,
    getCookie,
    getStatus,
    clear,
    _test: { getConfig, updateConfig, configFile },
  };
}

const bridge = createQishuiQrLoginBridge();

module.exports = Object.assign(bridge, {
  createQishuiQrLoginBridge,
  hasLoginCookie,
});
