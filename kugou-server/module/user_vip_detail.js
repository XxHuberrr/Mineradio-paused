module.exports = (params, useAxios) => {
  return useAxios({
    baseURL: 'https://kugouvip.kugou.com',
    url: '/v1/get_union_vip',
    method: 'GET',
    params: {busi_type: 'concept'},
    encryptType: 'android',
    cookie: params?.cookie || {},
  });
};
