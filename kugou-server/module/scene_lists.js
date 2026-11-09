module.exports = (params, useAxios) => {
  return useAxios({
    url: '/scene/v1/scene/list',
    method: 'GET',
    encryptType: 'android',
    cookie: params?.cookie || {},
  });
};
