// 领取vip 需要登录
module.exports = (params, useAxios) => {
 const paramsMap = {
  busi_type: 'concept',
  opt_product_types: 'dvip,qvip',
  product_type: 'svip',
 }

  return useAxios({
    baseURL: 'https://kugouvip.kugou.com',
    url: '/v1/get_union_vip',
    encryptType: 'android',
    method: 'get',
    params: paramsMap,
    cookie: params?.cookie,
  });
};
