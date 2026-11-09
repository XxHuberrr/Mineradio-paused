
module.exports = (params, useAxios) => {
  return useAxios({
    url: '/youth/v3/user/recent_dynamic',
    encryptType: 'android',
    method: 'get',
    cookie: params?.cookie,
  });
};
