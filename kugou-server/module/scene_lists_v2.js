module.exports = (params, useAxios) => {
  const userid = params?.userid || params?.cookie?.userid || '0';

  const sortType = { rec: 1, hot: 2, new: 3 };

  return useAxios({
    url: '/scene/v1/scene/list_v2',
    params: {
      scene_id: params.id,
      page: params.page || 1,
      pagesize: params.pagesize || 30,
      sort_type: sortType[params.sort || 'rec'] || 1,
      kugouid: userid,
    },
    data: { exposure: [] },
    method: 'POST',
    encryptType: 'android',
    cookie: params?.cookie || {},
  });
};
