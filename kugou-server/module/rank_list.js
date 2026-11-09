// 获取排行榜列表

module.exports = (params, useAxios) => {
  const parmasMap = {
    plat: 2,
    withsong: params.withsong || 1,
    parentid: 0,
  };

  return useAxios({
    url: '/ocean/v6/rank/list',
    method: 'get',
    encryptType: 'android',
    params: parmasMap,
    cookie: params?.cookie || {},
  });
};
