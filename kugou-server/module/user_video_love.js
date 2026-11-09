const { cryptoRSAEncrypt } = require('../util');
/**
 * 获取用户关注的歌手
 */
module.exports = (params, useAxios) => {
  const userid = params?.userid || params?.cookie?.userid || '0';
  const paramsMap = {
    kugouid: userid,
    pagesize: params?.pagesize ?? 30,
    load_video_info: 1,
    p: 1,
    plat: 1
  };

  return useAxios({
    url: '/m.comment.service/v1/get_user_like_video',
    encryptType: 'android',
    method: 'get',
    params: paramsMap,
    cookie: params?.cookie || {},
  });
};
