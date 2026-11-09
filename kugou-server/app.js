#!/usr/bin/env node

async function start() {
  require('./util/runtime').applyCliOverrides();
  await require('./server').startService();
}

start().catch(console.error);
