const { cryptoAesEncrypt, rsaEncrypt2 } = require('../util');
// 关注歌手
module.exports = (params, useAxios) => {
  const singerid = Number(params.id);
  const token = params?.token || params.cookie?.token || '';
  const userid = Number(params?.userid || params?.cookie?.userid || 0);
  const clienttime = Math.floor(Date.now() / 1000);

  const encrypt = cryptoAesEncrypt({ singerid, token });
  

  const paramsMap = {
    plat: 0,
    userid,
    singerid,
    source: 7,
    p: rsaEncrypt2({ clienttime, key: encrypt.key }),
    params: encrypt.str
  }

  

  return useAxios({
    url: '/followservice/v3/follow_singer',
    method: 'post',
    data: paramsMap,
    params: {clienttime},
    encryptType: 'android',
    cookie: params?.cookie || {},
  });
};
