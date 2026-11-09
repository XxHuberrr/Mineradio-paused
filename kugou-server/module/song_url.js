const { randomString } = require('../util/util');

// 获取音乐urls
// quality 支持 魔法音乐
// piano 钢琴
// acappella 人声 伴奏 分离
// subwoofer 乐器
// ancient 尤克里里
// dj dj
module.exports = (params, useAxios) => {
  const quality = ['piano', 'acappella', 'subwoofer', 'ancient', 'dj', 'surnay'].includes(params.quality)
    ? `magic_${params?.quality}`
    : params.quality;

  const isLite = process.env.platform === 'lite';
  const page_id = isLite ? 967177915 : 151369488;
  const ppage_id = isLite
    ? (params.ppage_id || '356753938,823673182,967485191')
    : '463467626,350369493,788954147';

  const dataMap = {
    album_id: Number(params.album_id ?? 0),
    area_code: 1,
    hash: (params?.hash || '').toLowerCase(),
    ssa_flag: 'is_fromtrack',
    version: 11430,
    page_id,
    quality: quality || 128,
    album_audio_id: Number(params.album_audio_id ?? 0),

    behavior: 'play',
    pid: isLite ? 411 : 2,
    cmd: 26,
    pidversion: 3001,
    IsFreePart: params?.free_part ? 1 : 0, //是否返回试听部分（仅部分歌曲）
    ppage_id,
    cdnBackup: 1,
    module: '',
    clientver: 11430,
  };
  
  return useAxios({
    url: '/v5/url',
    method: 'GET',
    params: dataMap,
    encryptType: 'android',
    headers: { 'x-router': 'trackercdn.kugou.com'},
    encryptKey: true,
    notSign: true,
    cookie: Object.assign({}, {dfid: randomString(24)}, params?.cookie ),
  });
};
