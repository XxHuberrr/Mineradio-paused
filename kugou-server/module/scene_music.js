module.exports = (params, useAxios) => {
  return useAxios({
    url: '/genesisapi/v1/scene_music/rec_music',
    params: { scene_id: params.id, page: params.page || 1, pagesize: params.pagesize || 30 },
    data: { exposure: [] },
    method: 'POST',
    encryptType: 'android',
    cookie: params?.cookie || {},
  });
};
