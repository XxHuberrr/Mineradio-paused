const { cryptoAesEncrypt, cryptoRSAEncrypt } = require('../util');

module.exports = (params, useAxios) => {
  const clienttime_ms = parseInt(new Date().getTime());
  const encrypt = cryptoAesEncrypt({ token: params.token || params.cookie?.token });
  const dataMap = {
    plat: 1,
    userid: params.userid || params.cookie?.userid || 0,
    clienttime_ms,
    pk: cryptoRSAEncrypt({ clienttime_ms, key: encrypt.key }).toUpperCase(),
    params: encrypt.str,
  };

  return useAxios({
    baseURL: 'https://userinfoservice.kugou.com',
    url: '/v2/get_dev',
    encryptType: 'android',
    method: 'POST',
    data: dataMap,
    cookie: params?.cookie || {},
  });
};
