module.exports = (params, useAxios) => {
  return useAxios({
    url: '/youth/api/amway/v2/index',
    encryptType: 'android',
    method: 'get',
    params: { global_collection_id: params.global_collection_id },
    cookie: params?.cookie,
  });
};
