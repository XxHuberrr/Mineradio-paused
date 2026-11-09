// 领取vip 需要登录
module.exports = (params, useAxios) => {
  const time = Date.now();
  const dataMap = {
    ad_id: 12307537187,
    play_end: time,
    play_start: time - 30000,
  };

  return useAxios({
    url: '/youth/v1/ad/play_report',
    encryptType: 'android',
    method: 'post',
    data: dataMap,
    cookie: params?.cookie,
  });
};
