// 获取今日推荐信息，有可能为空
module.exports = (params, useAxios) => {
  const dataMap = {
    id: params?.id,
    share: 0,
  };

  return useAxios({
    url: '/v1/zone/home',
    encryptType: 'android',
    method: 'GET',
    params: dataMap,
    cookie: params?.cookie || {},
    headers: { 'x-router': 'yuekucategory.kugou.com' },
  });
};
