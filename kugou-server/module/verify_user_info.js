const { cryptoAesEncrypt, cryptoRSAEncrypt } = require('../util');
// 验证验证码数据
module.exports = (params, useAxios) => {
  const clienttime = Date.now();
  const v_type = Number(params?.v_type || 23);
  const userid = Number(params?.userid || params?.cookie?.userid || '0');
  //
  let dataMap = {
    eventid: params?.eventid,
    userid,
    platid: params?.platid || 2,
    v_type,
    wasm: 1,
    i: '',
    sid: decodeURIComponent(params?.sid || ''),
    edt: decodeURIComponent(params?.edt || ''),
  };

  if (v_type === 23) {
    const encrypt = cryptoAesEncrypt({});
    dataMap = {
      ...dataMap,
      verifycode: decodeURIComponent(params?.verifycode || ''),
      pk: cryptoRSAEncrypt({ key: encrypt.key }),
      params: encrypt.str,
    };
  }

  if (v_type === 32) {
    const encrypt = cryptoAesEncrypt({ code: params?.verifycode || '' });
    dataMap = {
      ...dataMap,
      code: decodeURIComponent(params?.verifycode || ''),
      pk: cryptoRSAEncrypt({ key: encrypt.key }),
      params: encrypt.str,
    };
  }


  return useAxios({
    baseURL: 'https://verifyservice.kugou.com',
    url: '/v4/verify_user_info',
    encryptType: 'android',
    method: 'POST',
    data: dataMap,
    params: { clientver: 11510 },
    cookie: params?.cookie || {},
  });
};
