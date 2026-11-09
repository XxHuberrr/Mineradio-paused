const { appid, clientver, signParamsKey } = require('../util');
module.exports = (params, useAxios) => {
  const dateTime = Date.now();
  const dfid = params?.cookie?.dfid || params?.dfid || '-';
  const dataMap = {
    appid,
    clientver,
    clienttime: dateTime,
    mid: params?.cookie?.KUGOU_API_MID,
    key: signParamsKey(dateTime),
    rcmdsongcount: 1,
    level: 0,
    area_code: 1,
    get_tracker: 1,
    uid: 0,
  };

  return useAxios({
    url: '/v1/rcmd_list',
    encryptType: 'android',
    method: 'POST',
    data: dataMap,
    cookie: params?.cookie || {},
    headers: { 'x-router': 'fm.service.kugou.com' },
  });
};
