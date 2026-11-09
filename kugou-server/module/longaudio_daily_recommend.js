module.exports = (params, useAxios) => {
  return useAxios({
    url: `/longaudio/v1/home_new/daily_recommend`,
    method: 'post',
    encryptType: 'android',
    params: { module_id: 1, size: params.pagesize || 30, page: params.page || 1 },
    cookie: params?.cookie || {},
  });
};
