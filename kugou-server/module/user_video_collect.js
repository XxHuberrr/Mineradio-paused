const { cryptoRSAEncrypt } = require('../util');
/**
 * 获取用户关注的歌手
 */
module.exports = (params, useAxios) => {
  const token = params?.token || params?.cookie?.token || '';
  const userid = params?.userid || params?.cookie?.userid || '0';
  const dataMap = {
    userid,
    token,
    page: params?.page ?? 1,
    pagesize: params?.pagesize ?? 30,
  };

  return useAxios({
    url: '/collectservice/v2/collect_list_mixvideo',
    encryptType: 'android',
    method: 'POST',
    data: dataMap,
    params: { plat: 1 },
    cookie: params?.cookie || {},
  });
};
