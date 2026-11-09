const {  cryptoRSAEncrypt } = require('../util');
module.exports = (params, useAxios) => {
  const token = params?.token || params?.cookie?.token || '';
  const userid = Number(params?.userid || params?.cookie?.userid || '0');
  const clienttime_ms = Math.floor(Date.now() / 1000);
  const pk = cryptoRSAEncrypt({ token, clienttime: clienttime_ms }).toUpperCase();

  const dataMap = {
    visit_time: clienttime_ms,
    usertype: 1,
    p: pk,
    userid,
  };

  return useAxios({
    url: '/v3/get_my_info',
    method: 'POST',
    data: dataMap,
    params: { plat: 1 },
    encryptType: 'android',
    cookie: params?.cookie || {},
    headers: { 'x-router': 'usercenter.kugou.com' },
  });
};
