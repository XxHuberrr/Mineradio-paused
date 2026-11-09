
// 获取乐谱 tag
module.exports = (params, useAxios) => {
  return useAxios({
    url: '/opern/v1/home/get_tags',
    encryptType: 'android',
    method: 'GET',
    cookie: params?.cookie || {},
  });
};

