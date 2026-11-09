#!/usr/bin/env node
'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const executable = 'D:\\Steam\\steamapps\\common\\wallpaper_engine\\wallpaper64.exe';
const sourceRoot = 'D:\\Steam\\steamapps\\workshop\\content\\431960\\3715870843';
const sourceProjectFile = path.join(sourceRoot, 'project.json');
const sourcePackage = path.join(sourceRoot, 'scene.pkg');
const stageRoot = path.join('D:\\MineradioCache\\we-property-probe', String(process.pid));
const projectFile = path.join(stageRoot, 'project.json');
const location = `MineradioPropertyProbe${process.pid}`;
const keepDefaultAudio = process.argv.includes('--keep-default-audio');
const skipPreOpenProperty = process.argv.includes('--skip-preopen-property');
const absolutePackageReference = process.argv.includes('--absolute-package-reference');
const onScreen = process.argv.includes('--on-screen');
const warmReopen = process.argv.includes('--warm-reopen');
const warmMove = process.argv.includes('--warm-move');
const openPackageDirectly = process.argv.includes('--open-package');
const locationMute = process.argv.includes('--location-mute');
const secondPopout = process.argv.includes('--second-popout');
const secondLocation = location + 'Other';

function prepareSilentStage() {
  fs.mkdirSync(stageRoot, { recursive: true });
  const project = JSON.parse(fs.readFileSync(sourceProjectFile, 'utf8').replace(/^\uFEFF/, ''));
  const properties = project && project.general && project.general.properties;
  if (!properties || !properties.newproperty) throw new Error('Expected Scene audio property was not found');
  if (!keepDefaultAudio) properties.newproperty.value = 0;
  if (absolutePackageReference) project.file = sourcePackage;
  fs.writeFileSync(projectFile, `${JSON.stringify(project, null, 2)}\n`, 'utf8');
  if (!absolutePackageReference) fs.linkSync(sourcePackage, path.join(stageRoot, 'scene.pkg'));
}

function run(args) {
  const result = childProcess.spawnSync(executable, args, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10000,
    shell: false,
  });
  return {
    args,
    status: result.status,
    signal: result.signal || '',
    error: result.error ? result.error.message : '',
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
  };
}

function runVerbatim(args) {
  const result = childProcess.spawnSync(executable, args, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10000,
    shell: false,
    windowsVerbatimArguments: true,
  });
  return {
    args,
    status: result.status,
    signal: result.signal || '',
    error: result.error ? result.error.message : '',
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
  };
}

function runVerbatimFromExecutableDirectory(args, targetExecutable = executable) {
  const rawIndex = args.indexOf('-properties') + 1;
  const quote = (value) => {
    const text = String(value == null ? '' : value);
    if (text && !/[\s"]/.test(text)) return text;
    return '"' + text.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1') + '"';
  };
  const verbatimArgs = args.map((value, index) => index === rawIndex ? String(value) : quote(value));
  const result = childProcess.spawnSync(path.basename(targetExecutable), verbatimArgs, {
    cwd: path.dirname(targetExecutable),
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10000,
    shell: false,
    windowsVerbatimArguments: true,
    env: { ...process.env, PATH: '' },
  });
  return {
    args,
    status: result.status,
    signal: result.signal || '',
    error: result.error ? result.error.message : '',
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
  };
}

function runViaCommandProcessor(args, targetExecutable = executable) {
  const quote = (value) => {
    const text = String(value == null ? '' : value);
    if (text && !/[\s"]/.test(text)) return text;
    return '"' + text.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1') + '"';
  };
  const rawIndex = args.indexOf('-properties') + 1;
  const argumentLine = args.map((value, index) => index === rawIndex ? String(value) : quote(value)).join(' ');
  const commandLine = quote(targetExecutable) + (argumentLine ? ' ' + argumentLine : '');
  const result = childProcess.spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', commandLine], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10000,
    shell: false,
  });
  return {
    args,
    commandLine,
    status: result.status,
    signal: result.signal || '',
    error: result.error ? result.error.message : '',
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
  };
}

function runViaVerbatimCommandProcessor(args, targetExecutable = executable) {
  const quote = (value) => {
    const text = String(value == null ? '' : value);
    if (text && !/[\s"]/.test(text)) return text;
    return '"' + text.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1') + '"';
  };
  const rawIndex = args.indexOf('-properties') + 1;
  const argumentLine = args.map((value, index) => index === rawIndex ? String(value) : quote(value)).join(' ');
  const commandLine = quote(targetExecutable) + (argumentLine ? ' ' + argumentLine : '');
  const result = childProcess.spawnSync(process.env.ComSpec || 'cmd.exe', [
    '/d',
    '/s',
    '/c',
    `"${commandLine}"`,
  ], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10000,
    shell: false,
    windowsVerbatimArguments: true,
  });
  return {
    args,
    commandLine,
    status: result.status,
    signal: result.signal || '',
    error: result.error ? result.error.message : '',
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
  };
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function main() {
  if (locationMute) {
    throw new Error('--location-mute is disabled: this QA script must never change Wallpaper Engine global audio state; use location-scoped applyProperties checks instead.');
  }
  const evidence = {};
  prepareSilentStage();
  try {
    if (!skipPreOpenProperty) {
      evidence.preOpenProperty = runVerbatimFromExecutableDirectory([
        '-control', 'applyProperties',
        '-properties', 'RAW~({"newproperty":0,"volume":0})~END',
        '-location', location,
      ]);
    }
    evidence.spacedExecutable = runViaCommandProcessor(['--version'], process.execPath);
    evidence.spacedExecutableVerbatimCmd = runViaVerbatimCommandProcessor(['--version'], process.execPath);
    evidence.spacedExecutableFromCwd = runVerbatimFromExecutableDirectory(['--version'], process.execPath);
    evidence.open = run([
      '-control', 'openWallpaper',
      '-file', openPackageDirectly ? sourcePackage : projectFile,
      '-playInWindow', location,
      '-width', onScreen ? '1440' : '960',
      '-height', onScreen ? '810' : '600',
      '-x', onScreen ? '192' : '-2000',
      '-y', onScreen ? '132' : '-2000',
      '-borderless',
    ]);
    if (secondPopout) {
      evidence.openSecond = run([
        '-control', 'openWallpaper',
        '-file', openPackageDirectly ? sourcePackage : projectFile,
        '-playInWindow', secondLocation,
        '-width', '960',
        '-height', '600',
        '-x', '-3200',
        '-y', '-2000',
        '-borderless',
      ]);
    }
    if (warmReopen || warmMove) {
      await sleep(1800);
      evidence.warmMute = runVerbatimFromExecutableDirectory([
        '-control', 'applyProperties',
        '-properties', 'RAW~({"newproperty":0,"volume":0})~END',
        '-location', location,
      ]);
      if (warmReopen) {
        evidence.warmClose = run(['-control', 'closeWallpaper', '-location', location]);
        await sleep(500);
        evidence.warmReopen = run([
        '-control', 'openWallpaper',
          '-file', openPackageDirectly ? sourcePackage : projectFile,
          '-playInWindow', location,
          '-width', '1440',
          '-height', '810',
          '-x', '192',
          '-y', '132',
          '-borderless',
        ]);
      }
      await sleep(8000);
    } else {
      await sleep(8000);
    }
    evidence.getWallpaper = run([
      '-control', 'getWallpaper',
      '-location', location,
    ]);
    evidence.newproperty = run([
      '-control', 'applyProperties',
      '-properties', 'RAW~({"newproperty":0})~END',
      '-location', location,
    ]);
    evidence.volume = run([
      '-control', 'applyProperties',
      '-properties', 'RAW~({"volume":0})~END',
      '-location', location,
    ]);
    evidence.combined = run([
      '-control', 'applyProperties',
      '-properties', 'RAW~({"volume":0,"newproperty":0})~END',
      '-location', location,
    ]);
    evidence.verbatimCombined = runVerbatim([
      '-control', 'applyProperties',
      '-properties', 'RAW~({"newproperty":0,"volume":0})~END',
      '-location', `"${location}"`,
    ]);
    evidence.verbatimFromCwdCombined = runVerbatimFromExecutableDirectory([
      '-control', 'applyProperties',
      '-properties', 'RAW~({"newproperty":0,"volume":0})~END',
      '-location', location,
    ]);
    evidence.commandProcessorCombined = runViaCommandProcessor([
      '-control', 'applyProperties',
      '-properties', 'RAW~({"newproperty":0,"volume":0})~END',
      '-location', location,
    ]);
    evidence.verbatimCommandProcessorCombined = runViaVerbatimCommandProcessor([
      '-control', 'applyProperties',
      '-properties', 'RAW~({"newproperty":0,"volume":0})~END',
      '-location', location,
    ]);
  } finally {
    evidence.close = run(['-control', 'closeWallpaper', '-location', location]);
    if (secondPopout) evidence.closeSecond = run(['-control', 'closeWallpaper', '-location', secondLocation]);
    fs.rmSync(stageRoot, { recursive: true, force: true });
  }
  console.log(JSON.stringify({ ok: true, location, evidence }, null, 2));
}

main().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
