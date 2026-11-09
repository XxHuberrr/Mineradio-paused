'use strict';
// 花再 Halo PixelBar HID 写入子进程。
// 该进程通常以 Electron 自身二进制（ELECTRON_RUN_AS_NODE 纯 Node 模式）运行，
// 加载由 electron-builder 重编为 Electron ABI 的 node-hid；开发期也可用
// HALO_NODE_BIN 指向系统 node。通过 stdin/stdout 的换行分隔 JSON 协议转发写入命令。
//
// 请求:  {"id":<可选>, "method":<字符串>, "params":<对象>}
// 响应:  {"id":<同请求>, "ok":<bool>, "result":<对象>, "error":<字符串>}
// 事件:  {"event":"status", "connected":<bool>, "device":<对象|null>}

const readline = require('readline');
const path = require('path');

let hid = null;
try {
  hid = require('node-hid');
  if (typeof hid.setDriverType === 'function') {
    try { hid.setDriverType('windows'); } catch (e) { /* ignore */ }
  }
} catch (e) {
  console.error('[halo-hid-server] 无法加载 node-hid:', e.message);
  process.exit(2);
}

const VID = 0x2D99;
const PID = 0xA106;
const CONTROL_USAGE_PAGE = 0xFF14;

let device = null;

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function statusEvent() {
  send({
    event: 'status',
    connected: !!device,
    device: device
      ? { vendorId: VID, productId: PID, path: device._path || null }
      : null,
  });
}

function findControlDevice() {
  const list = (hid.devices || hid.enumerate || (() => []))();
  const matches = list.filter(
    (d) => d.vendorId === VID && d.productId === PID
  );
  return matches.find((d) => d.usagePage === CONTROL_USAGE_PAGE) || matches[0] || null;
}

function handleConnect() {
  if (device) {
    statusEvent();
    return { ok: true, device: { vendorId: VID, productId: PID } };
  }
  const info = findControlDevice();
  if (!info) {
    return { ok: false, error: '未找到 Halo PixelBar 设备' };
  }
  try {
    const dev = new hid.HID(info.path);
    dev.setNonBlocking(1);
    device = dev;
    device._path = info.path;
    statusEvent();
    return { ok: true, device: { vendorId: VID, productId: PID, path: info.path } };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function handleDisconnect() {
  if (device) {
    try { device.close(); } catch (e) { /* ignore */ }
    device = null;
  }
  statusEvent();
  return { ok: true };
}

function handleList() {
  const list = (hid.devices || hid.enumerate || (() => []))();
  const devices = list
    .filter((d) => d.vendorId === VID && d.productId === PID)
    .map((d) => ({
      vendorId: d.vendorId,
      productId: d.productId,
      usagePage: d.usagePage,
      usage: d.usage,
      product: d.product,
      path: d.path,
    }));
  return { ok: true, devices };
}

function reopenDevice() {
  try { if (device) device.close(); } catch (e) { /* ignore */ }
  device = null;
  const info = findControlDevice();
  if (!info) return false;
  try {
    const dev = new hid.HID(info.path);
    dev.setNonBlocking(1);
    dev._path = info.path;
    device = dev;
    statusEvent();
    return true;
  } catch (e) {
    device = null;
    statusEvent();
    return false;
  }
}

function handleRaw(params) {
  if (!params || !params.hex) return { ok: false, error: '缺少 hex' };
  const buf = Buffer.from(params.hex, 'hex');
  if (!device) {
    // 句柄丢失，尝试重开后再写一次
    if (reopenDevice() && device) {
      try {
        const res = device.write(buf);
        if (res >= 0) return { ok: true, written: res, recovered: true };
      } catch (e2) { /* fallthrough */ }
    }
    return { ok: false, error: '设备未连接' };
  }
  try {
    const res = device.write(buf);
    if (res < 0) throw new Error('写入返回 ' + res);
    return { ok: true, written: res };
  } catch (e) {
    // 设备可能重置/重插，关闭旧句柄并重开重试一次
    if (reopenDevice() && device) {
      try {
        const res2 = device.write(buf);
        if (res2 >= 0) return { ok: true, written: res2, recovered: true };
      } catch (e2) { /* ignore */ }
    }
    return { ok: false, error: e.message };
  }
}

const rl = readline.createInterface({ input: process.stdin });

rl.on('line', (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch (e) {
    return;
  }
  if (!msg || typeof msg.method !== 'string') return;
  let result;
  switch (msg.method) {
    case 'ping':
      result = { ok: true };
      break;
    case 'connect':
      result = handleConnect();
      break;
    case 'disconnect':
      result = handleDisconnect();
      break;
    case 'list':
      result = handleList();
      break;
    case 'raw':
      result = handleRaw(msg.params || {});
      break;
    default:
      result = { ok: false, error: '未知方法 ' + msg.method };
  }
  if (msg.id != null) {
    send({ id: msg.id, ok: !!result.ok, result, error: result.ok ? undefined : result.error });
  }
});

process.on('SIGTERM', () => {
  handleDisconnect();
  process.exit(0);
});
process.on('SIGINT', () => {
  handleDisconnect();
  process.exit(0);
});

send({ event: 'ready' });
