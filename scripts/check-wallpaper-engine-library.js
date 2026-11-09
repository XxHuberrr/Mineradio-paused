'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  WallpaperEngineLibrary,
  parseByteRange,
} = require('../desktop/wallpaper-engine-library');

function writeProject(root, name, manifest, files) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify(manifest), 'utf8');
  Object.entries(files || {}).forEach(([file, content]) => {
    const target = path.join(dir, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  });
  return dir;
}

async function main() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-we-'));
  const libraryRoot = path.join(temp, 'library');
  const userData = path.join(temp, 'user-data');
  fs.mkdirSync(libraryRoot, { recursive: true });
  fs.writeFileSync(path.join(libraryRoot, 'outside.mp4'), Buffer.alloc(64, 7));

  writeProject(libraryRoot, 'video-project', {
    title: 'Video Fixture',
    type: 'video',
    file: 'wallpaper.mp4',
    preview: 'preview.jpg',
  }, {
    'wallpaper.mp4': Buffer.from('0123456789abcdefghijklmnopqrstuvwxyz'),
    'preview.jpg': Buffer.alloc(48, 0xff),
  });
  writeProject(libraryRoot, 'scene-project', {
    title: 'Scene Fixture',
    type: 'scene',
    workshopid: '1234567890',
    file: 'scene.json',
    preview: 'preview.gif',
    general: {
      properties: {
        dbVolume: { type: 'slider', min: -60, max: 0, value: -6 },
        muteAudio: { type: 'bool', value: false },
        newproperty: { text: '音乐大小', type: 'slider', min: 0, max: 1, value: 0.55 },
        music: { text: 'Music', type: 'combo', value: '1', options: [{ label: 'None', value: '0' }, { label: 'Track', value: '1' }] },
        music_enabled: { type: 'bool', value: true },
        audio: { text: 'Audio visualizer', type: 'bool', value: true },
        tearSwitch: { text: '眼泪开关', type: 'bool', value: true },
      },
    },
  }, {
    'scene.pkg': Buffer.concat([Buffer.from([8, 0, 0, 0]), Buffer.from('PKGV0002', 'ascii'), Buffer.alloc(20, 1)]),
    'preview.gif': Buffer.from('GIF89a-fixture'),
  });
  writeProject(libraryRoot, 'pak-project', {
    title: 'PAK Scene Fixture',
    type: 'scene',
    file: 'scene.pak',
    preview: 'preview.jpg',
  }, {
    'scene.pak': Buffer.concat([Buffer.from('PKGV0003', 'ascii'), Buffer.alloc(24, 2)]),
    'preview.jpg': Buffer.alloc(48, 0xee),
  });
  const customPakProject = writeProject(libraryRoot, 'custom-pak-project', {
    title: 'Custom PAK Scene Fixture',
    type: 'scene',
    file: 'scene.json',
    preview: 'preview.jpg',
  }, {
    'custom-name.pak': Buffer.concat([Buffer.from([8, 0, 0, 0]), Buffer.from('PKGV0004', 'ascii'), Buffer.alloc(20, 3)]),
    'preview.jpg': Buffer.alloc(48, 0xdd),
  });
  const invalidPakProject = writeProject(libraryRoot, 'invalid-pak-project', {
    title: 'Invalid PAK Fixture',
    type: 'scene',
    file: 'scene.json',
    preview: 'preview.jpg',
  }, {
    'resources.pak': Buffer.from([5, 0, 0, 0, 1, 0, 0, 0, 9, 9, 9, 9]),
    'preview.jpg': Buffer.alloc(48, 0xcc),
  });
  writeProject(libraryRoot, 'web-project', {
    title: '<script>Web Fixture</script>',
    type: 'web',
    file: 'index.html',
    preview: 'preview.png',
  }, {
    'index.html': '<script>throw new Error("must not execute")</script>',
    'preview.png': Buffer.alloc(32, 2),
  });
  writeProject(libraryRoot, 'escape-project', {
    title: 'Escape Fixture',
    type: 'video',
    file: '../outside.mp4',
    preview: 'preview.jpg',
  }, {
    'preview.jpg': Buffer.alloc(24, 3),
  });

  const instance = new WallpaperEngineLibrary({ userDataPath: userData, autoDiscover: false });
  try {
    let snapshot = await instance.addManualRoot(libraryRoot);
    assert.strictEqual(snapshot.count, 7, 'all safe project manifests should be indexed');
    const video = snapshot.projects.find((item) => item.title === 'Video Fixture');
    const scene = snapshot.projects.find((item) => item.title === 'Scene Fixture');
    const pakScene = snapshot.projects.find((item) => item.title === 'PAK Scene Fixture');
    const customPakSceneBeforeImport = snapshot.projects.find((item) => item.title === 'Custom PAK Scene Fixture');
    const web = snapshot.projects.find((item) => item.title.includes('Web Fixture'));
    const escape = snapshot.projects.find((item) => item.title === 'Escape Fixture');
    assert(video && video.playable && video.mediaType === 'video');
    assert(scene && !scene.playable && scene.enginePlayable && !scene.previewOnly && scene.hasPreview && scene.previewAnimated);
    assert.strictEqual(scene.propertyCount, 7);
    assert.strictEqual(scene.workshopId, '1234567890');
    assert.strictEqual(scene.audioPropertyCount, 5, 'audio visualizer controls must not be mistaken for wallpaper sound');
    assert.strictEqual(scene.mutedAudioPropertyCount, 5);
    assert(pakScene && pakScene.enginePlayable, 'manifest-referenced PKGV .pak should be engine playable');
    assert(customPakSceneBeforeImport && !customPakSceneBeforeImport.enginePlayable && customPakSceneBeforeImport.previewOnly);
    assert(web && !web.playable && web.projectType === 'web');
    assert(escape && !escape.playable, 'path traversal media must be rejected');
    assert(!JSON.stringify(snapshot.projects).includes(temp), 'renderer metadata must not expose absolute paths');
    assert.strictEqual(snapshot.enginePlayableCount, 2, 'valid .pkg and PKGV .pak Scene packages should be engine playable');
    const sceneTarget = await instance.getNativeSceneTarget(scene.id);
    assert.strictEqual(sceneTarget.scenePackage, path.join(libraryRoot, 'scene-project', 'scene.pkg'));
    assert.strictEqual(sceneTarget.projectFile, path.join(libraryRoot, 'scene-project', 'project.json'));
    assert.deepStrictEqual(sceneTarget.muteProperties, {
      volume: 0,
      dbVolume: -60,
      muteAudio: true,
      newproperty: 0,
      music: '0',
      music_enabled: false,
    }, 'scene audio controls must move to their quiet state without changing unrelated visual toggles');
    const sceneDetails = await instance.getProjectDetails(scene.id);
    assert.strictEqual(sceneDetails.propertyCount, 7);
    assert.strictEqual(sceneDetails.workshopId, '1234567890');
    assert.strictEqual(sceneDetails.properties.find((property) => property.key === 'audio').audio, false);
    assert.strictEqual(sceneDetails.properties.find((property) => property.key === 'music').autoMuted, true);
    assert(!JSON.stringify(sceneDetails).includes(temp), 'on-demand property details must not expose absolute paths');
    const pakTarget = await instance.getNativeSceneTarget(pakScene.id);
    assert.strictEqual(pakTarget.scenePackage, path.join(libraryRoot, 'pak-project', 'scene.pak'));
    assert.strictEqual(pakTarget.projectFile, path.join(libraryRoot, 'pak-project', 'project.json'));

    snapshot = await instance.addManualProjectFile(path.join(customPakProject, 'custom-name.pak'));
    const customPakScene = snapshot.projects.find((item) => item.title === 'Custom PAK Scene Fixture');
    assert(customPakScene && customPakScene.enginePlayable, 'a selected custom-name PKGV .pak should become the project package override');
    const customPakTarget = await instance.getNativeSceneTarget(customPakScene.id);
    assert.strictEqual(customPakTarget.scenePackage, path.join(customPakProject, 'custom-name.pak'));
    await assert.rejects(
      () => instance.addManualProjectFile(path.join(invalidPakProject, 'resources.pak')),
      /不是有效的 Wallpaper Engine PKGV 场景包/
    );
    assert(/^[a-f0-9]{48}$/.test(snapshot.mediaToken), 'each app run should expose a random renderer media token');
    const mediaUrl = (kind, id) => `mineradio-wallpaper://${kind}/${id}?token=${snapshot.mediaToken}`;

    const range = await instance.mediaResponse(new Request(mediaUrl('media', video.id), {
      headers: { Range: 'bytes=2-7' },
    }));
    assert.strictEqual(range.status, 206);
    assert.strictEqual(range.headers.get('content-range'), 'bytes 2-7/36');
    assert.strictEqual(Buffer.from(await range.arrayBuffer()).toString(), '234567');

    const invalid = await instance.mediaResponse(new Request(mediaUrl('media', video.id), {
      headers: { Range: 'bytes=999-1000' },
    }));
    assert.strictEqual(invalid.status, 416);
    assert.strictEqual(parseByteRange('bytes=-4', 10).start, 6);
    assert.strictEqual(parseByteRange('bytes=-', 10).invalid, true);

    const missing = await instance.mediaResponse(new Request(mediaUrl('media', '000000000000000000000000')));
    assert.strictEqual(missing.status, 404);
    const missingToken = await instance.mediaResponse(new Request(`mineradio-wallpaper://media/${video.id}`));
    assert.strictEqual(missingToken.status, 404);
    const malformed = await instance.mediaResponse(new Request(`mineradio-wallpaper://media/%E0%A4%A?token=${snapshot.mediaToken}`));
    assert.strictEqual(malformed.status, 404);
    const extraCharacters = await instance.mediaResponse(new Request(mediaUrl('media', `prefix-${video.id}`)));
    assert.strictEqual(extraCharacters.status, 404);
    const rejectedMethod = await instance.mediaResponse(new Request(mediaUrl('media', video.id), { method: 'POST' }));
    assert.strictEqual(rejectedMethod.status, 405);
    assert.strictEqual(rejectedMethod.headers.get('allow'), 'GET, HEAD');
    const configFile = path.join(userData, 'wallpaper-engine-library.json');
    assert(fs.existsSync(configFile), 'manual root config should persist in userData');
    const savedConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    assert.strictEqual(savedConfig.version, 2);
    assert(savedConfig.manualProjectFiles.includes(path.join(customPakProject, 'custom-name.pak')));
    console.log(JSON.stringify({ ok: true, count: snapshot.count, dynamic: snapshot.dynamicCount, previewOnly: snapshot.previewOnlyCount }));
  } finally {
    instance.dispose();
    const resolved = path.resolve(temp);
    if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep)) fs.rmSync(resolved, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
