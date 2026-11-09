#!/usr/bin/env node
'use strict';

const { app, desktopCapturer } = require('electron');

app.whenReady().then(async () => {
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: { width: 0, height: 0 },
    fetchWindowIcons: false,
  });
  const filtered = (Array.isArray(sources) ? sources : [])
    .filter((source) => /Mineradio|Wallpaper|荆棘/i.test(String(source && source.name || '')))
    .map((source) => ({ id: String(source.id || ''), name: String(source.name || '') }));
  process.stdout.write(`${JSON.stringify({ ok: true, count: filtered.length, sources: filtered }, null, 2)}\n`);
}).catch((error) => {
  process.stderr.write(`${String(error && (error.stack || error.message) || error)}\n`);
  process.exitCode = 1;
}).finally(() => app.quit());
