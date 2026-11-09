// 已购单曲
const { appid, clientver } = require('../util');

module.exports = (params, useAxios) => {
  const dataMap = {
    appid,
    userid: Number(params?.cookie?.userid) || 0,
    token: params?.cookie?.token || '',
    page: Number(params?.page) || 1,
    pagesize: Number(params?.pagesize) || 50,
    clientver: String(clientver),
    deleted: 0,
    need_audio_info: 1,
    area_code: '1',
  };

  return useAxios({
    url: '/openapi/copyright/v1/audio/get_goods',
    method: 'POST',
    data: dataMap,
    encryptType: 'android',
    cookie: params?.cookie || {},
  });
};
