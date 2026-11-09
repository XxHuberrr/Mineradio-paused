// 歌词搜索
const { appid, clientver } = require('../util');

module.exports = (params, useAxios) => {
  const dataMap = {
    album_audio_id: params?.album_audio_id || 0,
    appid,
    clientver,
    duration: params.duration || 0,
    hash: params?.hash || '',
    keyword: params?.keywords || '',
    lrctxt: 1,
    man: params.man ?? 'no',
  };

  return useAxios({
    baseURL: 'https://lyrics.kugou.com',
    url: '/v1/search',
    method: 'GET',
    params: dataMap,
    cookie: params?.cookie || {},
    encryptType: 'android',
    clearDefaultParams: true,
    notSign: true,
  });
};
