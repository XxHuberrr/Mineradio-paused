module.exports = (params, useAxios) => {
  return useAxios({
    url: `/longaudio/v1/home_new/rank_card_recommend`,
    method: 'get',
    encryptType: 'android',
    params: {platform: 'ios'},
    cookie: params?.cookie || {},
  });
};
