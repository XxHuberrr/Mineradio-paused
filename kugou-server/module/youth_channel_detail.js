module.exports = (params, useAxios) => {
  const data = (params.global_collection_id || '').split(',').map((s) => ({ global_collection_id: s }));
  return useAxios({
    url: '/youth/api/channel/v1/channel_list_by_id',
    encryptType: 'android',
    method: 'post',
    data: { data },
    cookie: params?.cookie,
  });
};
