// 获取乐库下的 fm

module.exports = (params, useAxios) => {
  return useAxios({
    url: '/v1/time_fm_info',
    encryptType: 'android',
    method: 'GET',
    params: { operator: 7, plat: 0, type: 11, area_code: 1, req_multi: 1 },
    cookie: params?.cookie || {},
    headers: { 'x-router': 'fm.service.kugou.com' },
  });
};
