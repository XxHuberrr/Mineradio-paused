// 曲风盲盒 · 随机心动

module.exports = (params, useAxios) => {

  const dataMap = {
    tagid: '',
    u_info: '',
    source_mixsong: ''
  };

  return useAxios({
    url: '/youth/v1/song/tag_card_recommend',
    encryptType: 'android',
    method: 'POST',
    data: dataMap,
    params: { ver: 'v2', area_code: 1, platform: 'ios', module_id: 1, clientver: 11490},
    cookie: params?.cookie || {},
  });
};
