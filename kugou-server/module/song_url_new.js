const { randomString, appid, cryptoMd5 } = require('../util');
module.exports = (params, useAxios) => {
  // const quality = ['piano', 'acappella', 'subwoofer', 'ancient', 'dj', 'surnay'].includes(params.quality)
  //   ? `magic_${params?.quality}`
  //   : params.quality;

  const vip_token = params?.vip_token || params?.cookie?.vip_token || '';
  const token = params?.token || params?.cookie?.token || '';
  const clienttime_ms = Date.now();
  const userid = Number(params?.userid || params?.cookie?.userid || '0');
  const dfid = params?.dfid || params?.cookie?.dfid || randomString(24); // 自定义
  const vip_type = params?.cookie?.vip_type || params?.vipType || 0;

  const dataMap = {
    area_code: '1',
    behavior: 'play',
    qualities: ['128', '320', 'flac', 'high', 'multitrack', 'viper_atmos', 'viper_tape', 'viper_clear', 'super'],
    'resource': {
      'album_audio_id': params.album_audio_id,
      'collect_list_id': '3',
      'collect_time': clienttime_ms,
      'hash': params.hash,
      'id': 0,
      'page_id': 1,
      'type': 'audio',
    },
    token,
    'tracker_param': {
      all_m: 1,
      auth: '',
      is_free_part: params?.free_part ? 1 : 0,
      key: cryptoMd5(`${params.hash}185672dd44712f60bb1736df5a377e82${appid}${params?.cookie?.KUGOU_API_MID}${userid}`),
      module_id: 0,
      need_climax: 1,
      need_xcdn: 1,
      open_time: '',
      pid: '411',
      pidversion: '3001',
      priv_vip_type: '6',
      viptoken: vip_token,
    },
    userid: `${userid}`,
    'vip': vip_type,
  };

  return useAxios({
    baseURL: 'http://tracker.kugou.com',
    url: '/v6/priv_url',
    method: 'POST',
    data: dataMap,
    encryptType: 'android',
    cookie: Object.assign({}, { dfid }, params?.cookie),
  });
};
