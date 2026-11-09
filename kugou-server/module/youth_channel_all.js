module.exports = (params, useAxios) => {
  return useAxios({
    url: '/youth/v2/channel/channel_all_list',
    encryptType: 'android',
    method: 'get',
    params: { page: params.page || 1, pagesize: params.pagesize || 30, type: 1},
    cookie: params?.cookie,
  });
};
