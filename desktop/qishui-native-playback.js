'use strict';

// Use a locally installed official Mac client; never bundle its proprietary
// components. Request fields below match that client's verified 2.9.1 contract.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const childProcess = require('node:child_process');
const { promisify } = require('node:util');
const execFile = promisify(childProcess.execFile);
const CLIENT_VERSION = '2.9.1';
const CLIENT_UA = 'LunaPC/2.9.1(273418830)';
const SIGNATURE_PREFIX = 'MR_SIGNATURE:';

function validIdentity(identity) {
  return identity && /^\d{12,20}$/.test(String(identity.deviceId || '')) &&
    /^\d{12,20}$/.test(String(identity.installId || ''));
}

function buildTrackRequest(trackId, cookie, identity) {
  if (!validIdentity(identity)) throw new Error('Missing Qishui device identity');
  const url = new URL('https://api.qishui.com/luna/pc/track_v2');
  for (const [key, value] of Object.entries({
    aid: '386088', app_name: 'luna_pc', region: 'cn', geo_region: 'cn',
    os_region: 'cn', sim_region: '', device_id: identity.deviceId, cdid: '',
    iid: identity.installId, version_name: CLIENT_VERSION, version_code: '20090100',
    channel: 'official', build_mode: 'master', network_carrier: '', ac: 'wifi',
    tz_name: 'Asia/Shanghai', resolution: '', device_platform: 'mac',
    device_type: 'MacOS', os_version: os.version(), fp: identity.deviceId,
  })) url.searchParams.set(key, String(value));
  const body = JSON.stringify({ track_id: String(trackId), media_type: 'track', queue_type: '' });
  return {
    url: url.toString(), body,
    // Sign the actual outgoing headers, including those Node would otherwise
    // add afterwards. Browser Origin/Referer do not belong to the Mac request.
    headers: {
      Accept: 'application/json,text/plain,*/*', 'Content-Type': 'application/json; charset=utf-8',
      'User-Agent': CLIENT_UA, 'x-luna-background-type': 'foreground',
      'x-luna-is-background-req': '0', 'x-luna-is-local-user': '1', Cookie: String(cookie || ''),
      Host: url.host, Connection: 'close', 'Content-Length': Buffer.byteLength(body),
      'X-SS-STUB': crypto.createHash('md5').update(body).digest('hex').toUpperCase(),
    },
  };
}

// Inline source avoids writing credentials/scripts inside the official app's
// sandbox. Account headers travel through stdin, never process arguments.
const SIGNER_PROGRAM = String.raw`
let input = '';
process.stdin.on('data', chunk => { input += chunk; if (input.length > 65536) process.exit(1); });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const url = new URL(data.url);
    if (url.origin !== 'https://api.qishui.com' || url.pathname !== '/luna/pc/track_v2') process.exit(1);
    const sdk = require(data.modulePath);
    sdk.report('cold_start');
    sdk.init({ deviceId: url.searchParams.get('device_id') });
    const fields = String(sdk.generateHttpSignatureHeaders(data.url, Object.entries(data.headers).flat().join('\r\n'))).split('\r\n').filter(Boolean);
    const headers = {};
    for (let i = 0; i + 1 < fields.length; i += 2) headers[fields[i]] = fields[i + 1];
    console.log('MR_SIGNATURE:' + JSON.stringify(headers));
    process.exit(0);
  } catch (_) { process.exit(1); }
});
`;

function signRequest(runtime, request, options = {}) {
  return new Promise((resolve, reject) => {
    const spawn = options.spawn || childProcess.spawn;
    let child, timer, stdout = '', done = false;
    function finish(error, value) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (error) { if (child) child.kill(); reject(error); }
      else resolve(value);
    }
    try {
      child = spawn(runtime.executable, ['-e', SIGNER_PROGRAM], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
      });
      timer = setTimeout(() => finish(new Error('Qishui Mac signature helper timeout')), options.timeoutMs || 3500);
      child.on('error', () => finish(new Error('Qishui Mac signature helper unavailable')));
      child.stdin.on?.('error', () => finish(new Error('Qishui Mac signature helper input failed')));
      child.stderr.on('data', () => {}); // Drain vendor diagnostics without retaining account data.
      child.stdout.on('data', chunk => {
        stdout += chunk.toString('utf8');
        if (stdout.length > 65536) finish(new Error('Invalid Qishui signature response'));
      });
      child.on('close', code => {
        if (done) return;
        try {
          if (code !== 0) throw new Error('helper failed');
          const line = stdout.split(/\r?\n/).find(value => value.startsWith(SIGNATURE_PREFIX));
          const fields = JSON.parse(line.slice(SIGNATURE_PREFIX.length));
          const headers = {};
          for (const [key, value] of Object.entries(fields)) {
            if (!/^x-(helios|medusa)$/i.test(key)) continue;
            if (typeof value !== 'string' || !value || value.length > 8192 || /[\r\n\0]/.test(value)) throw new Error('invalid header');
            headers[key] = value;
          }
          if (!Object.keys(headers).some(key => key.toLowerCase() === 'x-helios') ||
              !Object.keys(headers).some(key => key.toLowerCase() === 'x-medusa')) throw new Error('incomplete headers');
          finish(null, headers);
        } catch (_) { finish(new Error('Invalid Qishui signature response')); }
      });
      child.stdin.end(JSON.stringify({ url: request.url, headers: request.headers, modulePath: runtime.modulePath }));
    } catch (_) { finish(new Error('Qishui Mac signature helper unavailable')); }
  });
}

let runtimeCache = null;
let runtimeCheckedAt = 0;
async function findInstalledRuntime() {
  if (runtimeCache && Date.now() - runtimeCheckedAt < 5 * 60 * 1000) return runtimeCache;
  runtimeCheckedAt = Date.now();
  runtimeCache = (async () => {
    for (const root of ['/Applications/汽水音乐.app', path.join(os.homedir(), 'Applications/汽水音乐.app')]) {
      const executable = path.join(root, 'Contents/MacOS/汽水音乐');
      const modulePath = path.join(root, `Contents/Resources/app-${process.arch}.asar.unpacked/bdms.node`);
      if (!fs.existsSync(executable) || !fs.existsSync(modulePath)) continue;
      try {
        // Deep verification can exceed a few seconds on a cold filesystem.
        const options = { timeout: 15000, maxBuffer: 128 * 1024 };
        const [version, , signature] = await Promise.all([
          execFile('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', path.join(root, 'Contents/Info.plist')], options),
          execFile('/usr/bin/codesign', ['--verify', '--deep', '--strict', root], options),
          execFile('/usr/bin/codesign', ['-d', '--verbose=4', root], options),
        ]);
        if (version.stdout.trim() !== CLIENT_VERSION || !/^TeamIdentifier=3JTPEA4UU7$/m.test(signature.stderr)) continue;
        return { executable, modulePath };
      } catch (_) { /* An absent/unverified client keeps the existing fallback available. */ }
    }
    return null;
  })();
  return runtimeCache;
}

async function prepareTrackRequest(trackId, cookie) {
  if (process.platform !== 'darwin' || !process.env.QISHUI_QR_CONFIG_FILE) return null;
  let identity;
  try { identity = JSON.parse(await fs.promises.readFile(process.env.QISHUI_QR_CONFIG_FILE, 'utf8')); }
  catch (_) { return null; }
  if (!validIdentity(identity)) return null;
  const runtime = await findInstalledRuntime();
  if (!runtime) return null;
  const request = buildTrackRequest(trackId, cookie, identity);
  Object.assign(request.headers, await signRequest(runtime, request));
  return request;
}

module.exports = { prepareTrackRequest, buildTrackRequest, signRequest };
