// 获取服务器时间
module.exports = (params, useAxios) => {
  const userid = params?.userid || params?.cookie?.userid || 0;
  const token = params?.token || params?.cookie?.token || '';

  return useAxios({
    url: '/v1/server_now',
    data: { token, userid },
    encryptType: 'android',
    method: 'POST',
    params: { plat: 3 },
    cookie: params?.cookie || {},
    headers: { 'x-router': 'usercenter.kugou.com' },
  });
};
