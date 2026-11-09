
module.exports = (params, useAxios) => {

  return useAxios({
    url: '/youth/v1/activity/get_month_vip_record',
    encryptType: 'android',
    params: { latest_limit: 100 },
    method: 'get',
    cookie: params?.cookie,
  });
};
