// 电台 banner
module.exports = (params, useAxios) => {
  const userid = params?.cookie?.userid || params?.userid || 0;
  const dataMap = {
    isvip: 0,
    userid,
    vipType: 0,
  };
  return useAxios({
    baseURL: 'https://adservice.kugou.com',
    url: '/v3/pc_diantai',
    data: dataMap,
    method: 'post',
    encryptType: 'android',
    cookie: params?.cookie || {},
  });
};
