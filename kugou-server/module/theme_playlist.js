// 主题歌单
const { clientver } = require('../util');
module.exports = (params, useAxios) => {
  const dataMap = {
    platform: 'android',
    clientver,
    clienttime: Date.now(),
    area_code: 1,
    module_id: 1,
    userid: params?.userid || params?.cookie?.userid || 0,
  };

  return useAxios({
    url: '/v2/getthemelist',
    method: 'POST',
    encryptType: 'android',
    data: dataMap,
    cookie: params?.cookie || {},
    headers: { 'x-router': 'everydayrec.service.kugou.com' },
  });
};
