// 获取验证码数据
module.exports = (params, useAxios) => {
  const userid = Number(params?.userid || params?.cookie?.userid || '0');
  const dataMap = {
    eventid: params?.eventid,
    userid,
    platid: params?.platid || 2,
    rtype: 1,
    wasm: 1,
    i: '',
    sid: '',
    edt: '',
  };

  return useAxios({
    url: '/verifyservice/v3/get_verify_info',
    encryptType: 'android',
    method: 'POST',
    data: dataMap,
    cookie: params?.cookie || {},
  });
};
