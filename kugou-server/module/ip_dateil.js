// 获取ip详情
module.exports = (params, useAxios) => {
  const data = (params?.id || '').split(',').map((s) => ({ ip_id: s }));

  const dataMap = {
    data,
    is_publish: 1,
  };

  return useAxios({
    url: '/openapi/v1/ip',
    encryptType: 'android',
    method: 'POST',
    data: dataMap,
    cookie: params?.cookie || {},
  });
};
