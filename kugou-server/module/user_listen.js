const { cryptoRSAEncrypt } = require('../util');
module.exports = (params, useAxios) => {
  const token = params?.token || params?.cookie?.token || '';
  const userid = params?.userid || params?.cookie?.userid || '0';

  const clienttime = Math.floor(Date.now() / 1000);

  const p = cryptoRSAEncrypt({ clienttime, token }).toUpperCase();
  const dataMap = {
    t_userid: userid,
    userid,
    list_type: params.type || 0,
    area_code: 1,
    cover: 2,
    p,
  };

  return useAxios({
    baseURL: 'https://listenservice.kugou.com',
    url: '/v2/get_list',
    data: dataMap,
    params: { clienttime, plat: 0 },
    method: 'POST',
    encryptType: 'android',
    cookie: params?.cookie || {},
  });
};
