'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app } = require('electron');

const configFile = path.join(os.tmpdir(), `mineradio-qishui-passport-live-${process.pid}.json`);
process.env.QISHUI_QR_CONFIG_FILE = configFile;

let timeout = null;
let bridge = null;

async function finish(code) {
  if (timeout) clearTimeout(timeout);
  if (bridge) {
    try {
      await bridge.clear();
    } catch (_) {}
  }
  try {
    fs.rmSync(configFile, { force: true });
  } catch (_) {}
  app.exit(code);
}

app.whenReady().then(async () => {
  bridge = require('../qishui-qr-login');
  const qr = await bridge.createQrCode();
  const token = String(qr && qr.data && qr.data.token || '');
  const image = String(qr && qr.data && qr.data.qrcode || '');
  const indexUrl = String(qr && qr.data && qr.data.qrcode_index_url || '');
  if (!token || !image.startsWith('data:image/png;base64,') || !indexUrl) {
    throw new Error('QISHUI_LIVE_QR_INVALID');
  }

  const firstPoll = await bridge.checkQrConnect(token);
  const data = firstPoll && firstPoll.data || {};
  console.log(JSON.stringify({
    ok: true,
    signedPassportQr: true,
    tokenLength: token.length,
    qrDataUrlLength: image.length,
    qrcodeIndexOrigin: new URL(indexUrl).origin,
    firstCheckErrorCode: Number(data.error_code || 0),
    firstCheckStatus: String(data.status || 'waiting'),
  }));
  await finish(0);
}).catch(async (error) => {
  console.error(error && error.stack || error);
  await finish(1);
});

timeout = setTimeout(async () => {
  console.error('QISHUI_LIVE_SMOKE_TIMEOUT');
  await finish(1);
}, 60000);
