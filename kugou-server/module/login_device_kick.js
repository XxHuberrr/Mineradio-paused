//登出选定设备
const { cryptoAesEncrypt, cryptoRSAEncrypt, appid, clientver, srcappid,signParamsKey } = require('../util');
module.exports = (params, useAxios) => {
  const clienttime_ms = parseInt(new Date().getTime());
  const encrypt = cryptoAesEncrypt({ token: params.token || params.cookie?.token });
  const mid = calculateMid(params.mid)
  const dateTime = Date.now();
  const dataMap = {
    appid,
    clientver,
    clienttime: clienttime_ms,
    mid: mid,
    uuid,
    dfid,
    plat: 1,
    userid,
    token: encrypt,
    t_mid :guid,
    t : dateTime,
    t_appid: 3116,
    t_clientver: 10597,
    srcappid,
    signature: signParamsKey(dateTime),
  };

return useAxios({
    url: '/loginservice/v1/dev_logout',
    encryptType: 'android',
    method: 'GET',
    data: dataMap,
    cookie: params?.cookie,
    headers: { 'Host':'gateway.kugou.com'}
  });
};