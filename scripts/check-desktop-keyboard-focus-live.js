#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');

const port = Number(process.argv[2] || 0);
const leaveEnabled = process.argv.includes('--leave-enabled');
assert(Number.isInteger(port) && port > 0,
  'Usage: node scripts/check-desktop-keyboard-focus-live.js <remote-debugging-port> [--leave-enabled]');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.sequence = 0;
    this.pending = new Map();
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !this.pending.has(message.id)) return;
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message || 'CDP request failed'));
      else pending.resolve(message.result);
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    return new CdpClient(socket);
  }

  call(method, params = {}) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const response = await this.call('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception && response.exceptionDetails.exception.description
        || response.exceptionDetails.text || 'Renderer evaluation failed');
    }
    return response.result && response.result.value;
  }

  close() {
    try { this.socket.close(); } catch (_) { }
  }
}

async function mainTarget(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
      const target = targets.find((item) => item.type === 'page'
        && /127\.0\.0\.1/.test(String(item.url || ''))
        && !/\/wallpaper\.html(?:[?#]|$)/.test(String(item.url || '')));
      if (target && target.webSocketDebuggerUrl) return target;
    } catch (_) { }
    await sleep(100);
  }
  throw new Error('Mineradio CDP target was not ready');
}

async function run() {
  const target = await mainTarget();
  const client = await CdpClient.connect(target.webSocketDebuggerUrl);
  let originalValue = '';
  let originalSearchPeek = false;
  try {
    const prepared = await client.evaluate(`(async () => {
      if (!window.desktopWindow || typeof desktopWindow.requestDesktopKeyboardFocus !== 'function') {
        throw new Error('DESKTOP_KEYBOARD_FOCUS_API_MISSING');
      }
      let status = (await desktopWindow.getWallpaperModeStatus()).status || {};
      if (status.enabled !== true || status.interactive !== true) {
        fx.wallpaperMode = true;
        updateFxInputs();
        await applyWallpaperModeState(true);
      }
      const deadline = performance.now() + 18000;
      do {
        status = (await desktopWindow.getWallpaperModeStatus()).status || {};
        if (status.enabled === true && status.active === true && status.interactive === true
          && status.coexisting === true && status.softwareInteractionLocked !== true) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      } while (performance.now() <= deadline);
      const input = document.getElementById('search-input');
      const searchArea = document.getElementById('search-area');
      if (!input || !searchArea) throw new Error('DESKTOP_KEYBOARD_SEARCH_INPUT_MISSING');
      const originalSearchPeek = searchArea.classList.contains('peek');
      searchArea.classList.add('peek');
      await new Promise((resolve) => setTimeout(resolve, 520));
      const rect = input.getBoundingClientRect();
      window.__mineradioKeyboardProbe = { trustedPointerDown: false, pointerTarget: '', f13: 0 };
      document.addEventListener('pointerdown', (event) => {
        window.__mineradioKeyboardProbe.trustedPointerDown = event.isTrusted === true;
        window.__mineradioKeyboardProbe.pointerTarget = event.target && event.target.id || '';
      }, { once: true, capture: true });
      window.__mineradioKeyboardProbeKeyListener = (event) => {
        if (event.code === 'F13') window.__mineradioKeyboardProbe.f13 += 1;
      };
      document.addEventListener('keydown', window.__mineradioKeyboardProbeKeyListener, { capture: true });
      return {
        status,
        originalValue: input.value,
        originalSearchPeek,
        point: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
        before: { documentFocused: document.hasFocus(), activeId: document.activeElement && document.activeElement.id || '' },
      };
    })()`);
    originalValue = String(prepared.originalValue || '');
    originalSearchPeek = prepared.originalSearchPeek === true;
    assert.equal(prepared.status && prepared.status.enabled, true);
    assert.equal(prepared.status && prepared.status.interactive, true);
    assert.equal(prepared.status && prepared.status.softwareInteractionLocked, false);

    const locked = await client.evaluate(`(async () => {
      const result = await desktopWindow.setDesktopSoftwareLocked(true);
      await new Promise((resolve) => setTimeout(resolve, 80));
      return {
        result,
        documentFocused: document.hasFocus(),
        rendererFocusRequestRejected: requestDesktopKeyboardFocus('locked-live-probe') === false,
      };
    })()`);
    assert.equal(locked.result && locked.result.ok, true);
    assert.equal(locked.result && locked.result.softwareInteractionLocked, true);
    assert.equal(locked.rendererFocusRequestRejected, true);
    assert.equal(locked.documentFocused, false, 'software lock did not blur renderer keyboard focus');

    const unlocked = await client.evaluate(`(async () => {
      const result = await desktopWindow.setDesktopSoftwareLocked(false);
      await new Promise((resolve) => setTimeout(resolve, 60));
      return { result, documentFocused: document.hasFocus() };
    })()`);
    assert.equal(unlocked.result && unlocked.result.ok, true);
    assert.equal(unlocked.result && unlocked.result.softwareInteractionLocked, false);
    assert.equal(unlocked.documentFocused, false,
      'unlock without a user pointer event unexpectedly stole keyboard focus');

    const point = await client.evaluate(`(async () => {
      const area = document.getElementById('search-area');
      const input = document.getElementById('search-input');
      area.classList.add('peek');
      await new Promise((resolve) => setTimeout(resolve, 520));
      const rect = input.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`);
    await client.call('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: Number(point.x) || 1,
      y: Number(point.y) || 1,
      button: 'none',
      buttons: 0,
    });
    await sleep(180);
    await client.call('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: Number(point.x) || 1,
      y: Number(point.y) || 1,
      button: 'left',
      buttons: 1,
      clickCount: 1,
    });
    await client.call('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: Number(point.x) || 1,
      y: Number(point.y) || 1,
      button: 'left',
      buttons: 0,
      clickCount: 1,
    });
    await sleep(140);

    const marker = `MineradioKeyboardFocus-${Date.now()}`;
    await client.call('Input.insertText', { text: marker });
    await client.call('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'F13',
      code: 'F13',
      windowsVirtualKeyCode: 124,
      nativeVirtualKeyCode: 124,
    });
    await client.call('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'F13',
      code: 'F13',
      windowsVirtualKeyCode: 124,
      nativeVirtualKeyCode: 124,
    });
    await sleep(80);

    const restored = await client.evaluate(`(() => {
      const input = document.getElementById('search-input');
      const probe = window.__mineradioKeyboardProbe || {};
      const snapshot = {
        documentFocused: document.hasFocus(),
        activeId: document.activeElement && document.activeElement.id || '',
        trustedPointerDown: probe.trustedPointerDown === true,
        pointerTarget: probe.pointerTarget || '',
        inserted: input.value.includes(${JSON.stringify(marker)}),
        f13: Number(probe.f13) || 0,
      };
      input.value = ${JSON.stringify(originalValue)};
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return snapshot;
    })()`);
    assert.equal(restored.trustedPointerDown, true,
      'CDP pointer plumbing did not reach the renderer as a trusted pointer event');
    assert.equal(restored.documentFocused, true,
      'trusted Mineradio pointerdown did not restore renderer keyboard focus');
    assert.equal(restored.activeId, 'search-input');
    assert.equal(restored.inserted, true, 'focused search input did not accept text');
    assert.equal(restored.f13 > 0, true, 'renderer did not receive a keydown after focus restoration');

    console.log(JSON.stringify({
      ok: true,
      desktopMode: {
        enabled: prepared.status.enabled,
        interactive: prepared.status.interactive,
        coexisting: prepared.status.coexisting,
        nativeWindowId: prepared.status.nativeWindowId,
        desktopListWindowId: prepared.status.desktopListWindowId,
      },
      lockBlurVerified: true,
      unlockDoesNotStealFocus: true,
      trustedPointerFocusRestored: true,
      textInputPlumbingVerified: true,
      rendererKeydownPlumbingVerified: true,
      syntheticInputUsed: true,
      manualHardwareChecksStillRequired: [
        'Click the search field with the real mouse and type English text.',
        'Use the real Chinese IME and confirm composition/candidate input works.',
        'After clicking a real desktop icon, click Mineradio again and test Space, arrows, and configured local hotkeys.',
      ],
      leftEnabled: leaveEnabled,
    }, null, 2));
  } finally {
    try {
      await client.evaluate(`(async () => {
        const input = document.getElementById('search-input');
        if (input) {
          input.value = ${JSON.stringify(originalValue)};
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const searchArea = document.getElementById('search-area');
        if (searchArea && !${originalSearchPeek}) searchArea.classList.remove('peek');
        if (window.__mineradioKeyboardProbeKeyListener) {
          document.removeEventListener('keydown', window.__mineradioKeyboardProbeKeyListener, true);
          delete window.__mineradioKeyboardProbeKeyListener;
        }
        delete window.__mineradioKeyboardProbe;
        try { await desktopWindow.setDesktopSoftwareLocked(false); } catch (_) { }
        if (!${leaveEnabled}) {
          fx.wallpaperMode = false;
          updateFxInputs();
          try { await applyWallpaperModeState(true); } catch (_) { }
        }
        return true;
      })()`);
    } catch (_) { }
    client.close();
  }
}

run().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
