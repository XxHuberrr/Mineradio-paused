const { appid, clientver, cryptoMd5, signParamsKey } = require('../util');
module.exports = (params, useAxios) => {
  const dateTime = Date.now();
  const userid = params?.cookie?.userid || params?.userid || 0;
  const dataMap = {
    kguid: userid,
    clienttime: dateTime,
    mid: params?.cookie?.KUGOU_API_MID,
    platform: 'android',
    clientver,
    uid: userid,
    get_tracker: 1,
    key: signParamsKey(dateTime),
    appid,
  };

  return useAxios({
    url: '/v1/class_fm_song',
    encryptType: 'android',
    method: 'POST',
    data: dataMap,
    cookie: params?.cookie || {},
    headers: { 'x-router': 'fm.service.kugou.com' },
  });
};
