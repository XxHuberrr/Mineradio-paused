// 获取安卓乐库相关内容

module.exports = (params, useAxios) => {
  return useAxios({
    url: '/v1/yueku/recommend_v2',
    encryptType: 'android',
    method: 'GET',
    params: { operator: 7, plat: 0, type: 11, area_code: 1, req_multi: 1 },
    cookie: params?.cookie || {},
    headers: { 'x-router': 'service.mobile.kugou.com' },
  });
};
