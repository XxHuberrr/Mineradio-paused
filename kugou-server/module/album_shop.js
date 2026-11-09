// 唱片店
module.exports = (params, useAxios) => {
  return useAxios({
    url: '/zhuanjidata/v3/album_shop_v2/get_classify_data',
    method: 'GET',
    encryptType: 'android',
    cookie: params?.cookie || {},
  });
};
