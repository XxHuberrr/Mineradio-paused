module.exports = (params, useAxios) => {
  const t = Number(params.t) === 0 ? 0 : 1;
  return useAxios({
    url: `/youth/v1/channel${t === 0 ? '_un' : ''}_subscribe`,
    encryptType: 'android',
    method: t === 0 ? 'delete': 'post',
    params: { global_collection_id: params.global_collection_id, source: 1},
    cookie: params?.cookie,
  });
};
