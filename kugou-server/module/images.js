const { signatureAndroidParams, appid, clientver } = require('../util');

module.exports = (params, useAxios) => {
  const data = (params?.hash || '').split(',').map((s) => ({ album_id: 0, hash: s, album_audio_id: 0 }));
  (params?.album_id || '').split(',').forEach((s, index) => {
    if (index <= data.length - 1) {
      data[index]['album_id'] = s || 0;
    }
  });
  (params?.album_audio_id || '').split(',').forEach((s, index) => {
    if (index <= data.length - 1) {
      data[index]['album_audio_id'] = s || 0;
    }
  });

  const paramsMap = {
    album_image_type: '-3',
    appid,
    clientver,
    author_image_type: '3,4,5',
    count: params?.count || 5,
    data,
    isCdn: 1,
    publish_time: 1,
  };

  const query = Object.keys(paramsMap)
    .sort()
    .map((s) => `${s}=${encodeURIComponent(typeof paramsMap[s] === 'object' ? JSON.stringify(paramsMap[s]) : paramsMap[s])}`);

  const signature = signatureAndroidParams(paramsMap);

  return useAxios({
    baseURL: 'https://expendablekmr.kugou.com',
    url: `/container/v2/image?${query.join('&')}`,
    method: 'GET',
    encryptType: 'android',
    params: { signature },
    cookie: params?.cookie || {},
    notSign: true,
    clearDefaultParams: true,
  });
};
