'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

const appRoot = path.resolve(__dirname, '..');
const mainText = fs.readFileSync(path.join(appRoot, 'desktop', 'main.js'), 'utf8');
const preloadText = fs.readFileSync(path.join(appRoot, 'desktop', 'preload.js'), 'utf8');
const gestureText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '10-shell', '00-gesture-control.js'), 'utf8');

assert.match(mainText, /const\s+GESTURE_CAMERA_PERMISSION_GRANT_MS\s*=\s*45000;/);
assert.match(mainText, /function\s+createGestureCameraPermissionGrant\s*\(event\)/);
assert.match(mainText, /function\s+isTrustedGestureCameraMediaPermission\s*\(webContents,\s*origin,\s*details\)/);
assert.match(mainText, /webContents\s*!==\s*mainWindow\.webContents/);
assert.match(mainText, /mediaType\.includes\('audio'\)/);
assert.match(mainText, /permission\s*===\s*'media'[\s\S]{0,220}isTrustedGestureCameraMediaPermission\(webContents,\s*origin,\s*details\)/);
assert.match(mainText, /ipcMain\.handle\('mineradio-gesture-camera-request-permission'/);
assert.match(preloadText, /requestGestureCameraPermission:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('mineradio-gesture-camera-request-permission'\)/);
assert.match(gestureText, /requestGestureCameraPermission\(\)/);
assert.match(gestureText, /cleanupGestureControlRuntime\('error'\);[\s\S]{0,220}GESTURE_CAMERA/i);
assert.match(gestureText, /persistGestureCameraDisabled\(/);

console.log('OK gesture-camera-permission');
