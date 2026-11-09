const { cryptoMd5, signParamsKey, clientver, appid } = require('../util');
// 获取视频特权

module.exports = (params, useAxios) => {
  const dfid = params?.cookie?.dfid || '-';
  const mid = params?.cookie?.KUGOU_API_MID;

  const resource = (params?.hash || '').split(',').map((s) => ({ hash: s, id: 0, name: '' }));

  const dataMap = {
    appid,
    area_code: 1,
    behavior: 'play',
    clientver,
    dfid,
    mid,
    resource,
    token: params?.cookie?.token || '',
    userid: params?.cookie?.userid || 0,
    vip: params?.cookie?.vip_type || 0,
  };

  return useAxios({
    url: '/v1/get_video_privilege',
    method: 'POST',
    data: dataMap,
    encryptType: 'android',
    cookie: params?.cookie || {},
    headers: { 'x-router': 'media.store.kugou.com' },
  });
};
