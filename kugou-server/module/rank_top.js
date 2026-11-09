// 获取排行榜推荐列表

module.exports = (params, useAxios) => {
  return useAxios({
    url: '/mobileservice/api/v5/rank/rec_rank_list',
    method: 'get',
    encryptType: 'android',
    cookie: params?.cookie || {},
  });
};
