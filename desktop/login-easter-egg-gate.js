'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LOGIN_EASTER_EGG_GATE_VERSION = 'world-peace-v1';
const LOGIN_EASTER_EGG_STATE_FILE = 'login-easter-egg.json';
const LOGIN_EASTER_EGG_PASSWORD = '世界和平';
const LOGIN_EASTER_EGG_CREDENTIAL_FILES = [
  '.cookie',
  '.qq-cookie',
  '.kugou-cookie',
  '.kugou-vip-evidence.json',
  '.qishui-cookie',
  '.qishui-token',
  '.spotify-token.json',
];

function safeReadJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) || {};
  } catch (_) {
    return {};
  }
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tempFile = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tempFile, file);
}

function securePasswordMatch(input) {
  const expected = Buffer.from(LOGIN_EASTER_EGG_PASSWORD, 'utf8');
  const received = Buffer.from(String(input || ''), 'utf8');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

class LoginEasterEggGate {
  constructor(options = {}) {
    this.userDataPath = path.resolve(String(options.userDataPath || '.'));
    this.credentialRoots = options.credentialRoots || [];
    this.stateFile = path.join(this.userDataPath, LOGIN_EASTER_EGG_STATE_FILE);
    this.now = typeof options.now === 'function' ? options.now : () => Date.now();
    this.state = this.readState();
  }

  readState() {
    const raw = safeReadJson(this.stateFile);
    return {
      schema: 1,
      gateVersion: String(raw.gateVersion || ''),
      cookieResetVersion: String(raw.cookieResetVersion || ''),
      resetComplete: raw.resetComplete === true,
      unlocked: raw.unlocked === true,
      resetAt: Number(raw.resetAt || 0) || 0,
      unlockedAt: Number(raw.unlockedAt || 0) || 0,
      resetError: String(raw.resetError || ''),
    };
  }

  writeState(next) {
    this.state = Object.assign({}, this.state, next, { schema: 1 });
    writeJsonAtomic(this.stateFile, this.state);
    return this.state;
  }

  publicStatus() {
    return {
      ok: true,
      gateVersion: LOGIN_EASTER_EGG_GATE_VERSION,
      unlocked: this.state.gateVersion === LOGIN_EASTER_EGG_GATE_VERSION && this.state.unlocked === true,
      resetComplete: this.state.gateVersion === LOGIN_EASTER_EGG_GATE_VERSION && this.state.resetComplete === true,
    };
  }

  isUnlocked() {
    const status = this.publicStatus();
    return status.unlocked && status.resetComplete;
  }

  resolveCredentialRoots() {
    let extraRoots = this.credentialRoots;
    if (typeof extraRoots === 'function') extraRoots = extraRoots();
    if (!Array.isArray(extraRoots)) extraRoots = [extraRoots];
    const roots = [this.userDataPath].concat(extraRoots || []);
    return Array.from(new Set(roots.filter(Boolean).map((root) => path.resolve(String(root)))));
  }

  clearCredentialFiles() {
    for (const root of this.resolveCredentialRoots()) {
      for (const name of LOGIN_EASTER_EGG_CREDENTIAL_FILES) {
        const file = path.join(root, name);
        try {
          if (fs.existsSync(file)) fs.unlinkSync(file);
        } catch (error) {
          throw new Error(`LOGIN_CREDENTIAL_CLEAR_FAILED:${file}:${error.message}`);
        }
      }
    }
  }

  async clearCredentialState(clearProviderSessions) {
    this.clearCredentialFiles();
    if (typeof clearProviderSessions === 'function') await clearProviderSessions();
    // Logout handlers may flush an empty or stale in-memory store while the
    // provider sessions are closing. The second pass also removes migration
    // copies so a later launch cannot restore an old credential.
    this.clearCredentialFiles();
  }

  async initialize(clearProviderSessions) {
    this.state = this.readState();
    if (
      this.state.gateVersion === LOGIN_EASTER_EGG_GATE_VERSION &&
      this.state.cookieResetVersion === LOGIN_EASTER_EGG_GATE_VERSION &&
      this.state.resetComplete
    ) {
      if (!this.state.unlocked) {
        try {
          await this.clearCredentialState(clearProviderSessions);
        } catch (error) {
          const resetError = String(error && error.message || error || 'LOGIN_SESSION_RESET_FAILED');
          try {
            this.writeState({ cookieResetVersion: '', resetComplete: false, resetError });
          } catch (_) {
            this.state = Object.assign({}, this.state, { cookieResetVersion: '', resetComplete: false, resetError });
          }
          return Object.assign({ resetPerformed: false, error: resetError }, this.publicStatus());
        }
      }
      return Object.assign({ resetPerformed: false }, this.publicStatus());
    }

    let resetError = '';
    try {
      await this.clearCredentialState(clearProviderSessions);
    } catch (error) {
      resetError = String(error && error.message || error || 'LOGIN_SESSION_RESET_FAILED');
    }

    const nextState = {
      gateVersion: LOGIN_EASTER_EGG_GATE_VERSION,
      cookieResetVersion: resetError ? '' : LOGIN_EASTER_EGG_GATE_VERSION,
      resetComplete: !resetError,
      unlocked: false,
      resetAt: this.now(),
      unlockedAt: 0,
      resetError,
    };
    try {
      this.writeState(nextState);
    } catch (error) {
      resetError = `LOGIN_EASTER_EGG_STATE_WRITE_FAILED:${error.message}`;
      this.state = Object.assign({}, this.state, nextState, {
        cookieResetVersion: '',
        resetComplete: false,
        resetError,
      });
    }
    return Object.assign({ resetPerformed: true, error: resetError || '' }, this.publicStatus());
  }

  async resetForReplay(clearProviderSessions) {
    this.state = this.readState();
    let resetError = '';
    try {
      await this.clearCredentialState(clearProviderSessions);
    } catch (error) {
      resetError = String(error && error.message || error || 'LOGIN_SESSION_RESET_FAILED');
    }
    const nextState = {
      gateVersion: LOGIN_EASTER_EGG_GATE_VERSION,
      cookieResetVersion: resetError ? '' : LOGIN_EASTER_EGG_GATE_VERSION,
      resetComplete: !resetError,
      unlocked: false,
      resetAt: this.now(),
      unlockedAt: 0,
      resetError,
    };
    try {
      this.writeState(nextState);
    } catch (error) {
      resetError = `LOGIN_EASTER_EGG_STATE_WRITE_FAILED:${error.message}`;
      this.state = Object.assign({}, this.state, nextState, {
        cookieResetVersion: '',
        resetComplete: false,
        resetError,
      });
    }
    return Object.assign({ resetPerformed: true, replayReset: true, error: resetError || '' }, this.publicStatus());
  }

  unlock(input) {
    this.state = this.readState();
    if (!this.state.resetComplete || this.state.gateVersion !== LOGIN_EASTER_EGG_GATE_VERSION) {
      return { ok: false, unlocked: false, error: 'LOGIN_EASTER_EGG_RESET_INCOMPLETE' };
    }
    if (!securePasswordMatch(input)) {
      return { ok: false, unlocked: false, error: 'LOGIN_EASTER_EGG_INVALID' };
    }
    try {
      this.writeState({ unlocked: true, unlockedAt: this.now(), resetError: '' });
    } catch (error) {
      return {
        ok: false,
        unlocked: false,
        error: 'LOGIN_EASTER_EGG_STATE_WRITE_FAILED',
        message: String(error && error.message || error),
      };
    }
    return this.publicStatus();
  }
}

module.exports = {
  LoginEasterEggGate,
  LOGIN_EASTER_EGG_GATE_VERSION,
  LOGIN_EASTER_EGG_STATE_FILE,
  LOGIN_EASTER_EGG_CREDENTIAL_FILES,
  securePasswordMatch,
};
