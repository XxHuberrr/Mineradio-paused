'use strict';
/* 花再 Halo PixelBar 独立自测（绕开 GUI，验证 HID 是否写通）
 * 运行：node scripts/test-halo.js   （需以管理员身份运行）
 * 依赖：npm install 已成功编译 node-hid；或 npm run rebuild 后用于 Electron。
 */
const path = require('path');
const { HaloSync } = require('../desktop/halo-lyric-sync.js');

const halo = new HaloSync(null);

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

(async () => {
  if (halo.simulated) {
    console.log('⚠️  未加载到 node-hid，进入模拟模式（不会真正写设备）。请先 npm install / npm run rebuild，并以管理员运行。');
  }
  const ok = await halo.connect();
  console.log('连接结果:', ok, '已连接:', halo.connected);
  if (!halo.connected) {
    console.log('未连上设备。请确认：1) USB 数据线连接；2) 以管理员身份运行；3) VID 2D99/PID A106 被识别。');
    process.exit(1);
  }

  console.log('→ 显示文字：Hello 花再');
  halo.onLyric('Hello 花再');
  await sleep(1500);

  console.log('→ 切歌信息：🎵 晴天 - 周杰伦');
  halo.onSong('晴天', '周杰伦');
  await sleep(3000);

  console.log('→ 歌词行：故事的小黄花');
  halo.onLyric('故事的小黄花');
  await sleep(1500);

  console.log('→ 氛围灯：呼吸 蓝色');
  halo.onCoverColor({ r: 60, g: 150, b: 255 });
  halo.sendAmbient(1, { r: 60, g: 150, b: 255 }, 60, 5);
  await sleep(1500);

  console.log('→ 氛围灯：流光 暖色（模拟强拍）');
  halo.onAudioFrame(0.9, 0.9, 0.5);
  await sleep(1500);

  console.log('→ 硬件音量设为 12/16');
  halo.onVolume01(12 / 16);
  await sleep(800);

  console.log('→ 时钟场景');
  halo.onPlayState(false);
  await sleep(1500);

  console.log('✅ 自测完成。若音响有对应显示，说明 HID 通道正常；可关闭此脚本后在 Mineradio 里体验完整同步。');
  process.exit(0);
})();
