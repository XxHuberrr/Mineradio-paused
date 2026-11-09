const { signatureAndroidParams, appid, clientver } = require('../util');

module.exports = (params, useAxios) => {
  const data = (params?.hash || '').split(',').map((s) => ({ audio_id: 0, hash: s, album_audio_id: 0, filename: '' }));
  (params?.audio_id || '').split(',').forEach((s, index) => {
    if (index <= data.length - 1) {
      data[index]['audio_id'] = s || 0;
    }
  });
  (params?.album_audio_id || '').split(',').forEach((s, index) => {
    if (index <= data.length - 1) {
      data[index]['album_audio_id'] = s || 0;
    }
  });
  (params?.filename || '').split(',').forEach((s, index) => {
    if (index <= data.length - 1) {
      data[index]['filename'] = s;
    }
  });

  const paramsMap = {
    appid,
    clientver,
    count: params?.count || 5,
    data,
    isCdn: 1,
    publish_time: 1,
    show_authors: 1,
  };

  const query = Object.keys(paramsMap)
    .sort()
    .map((s) => `${s}=${encodeURIComponent(typeof paramsMap[s] === 'object' ? JSON.stringify(paramsMap[s]) : paramsMap[s])}`);

  const signature = signatureAndroidParams(paramsMap);

  return useAxios({
    baseURL: 'https://expendablekmr.kugou.com',
    url: `/v2/author_image/audio?${query.join('&')}`,
    method: 'GET',
    encryptType: 'android',
    params: { signature },
    cookie: params?.cookie || {},
    notSign: true,
    clearDefaultParams: true,
  });
};
