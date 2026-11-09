module.exports = (params, useAxios) => {
  return useAxios({
    url: `/count/v1/audio/mget_collect`,
    method: 'GET',
    encryptType: 'android',
    cookie: params?.cookie || {},
    params: { mixsongids: params.mixsongids },
  });
};
