const { srcappid} = require('../util');
// 乐谱详情
module.exports = (params, useAxios) => {
  const paramsMap = {
    srcappid,
    position: params.position ?? 2
  }
  return useAxios({
    url: '/miniyueku/v1/opern_square/get_home_module_config',
    encryptType: 'web',
    method: 'GET',
    params: paramsMap,
    cookie: params?.cookie || {},
  });
};
