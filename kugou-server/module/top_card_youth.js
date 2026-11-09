// 热门好歌精选
// 3006: VIP专属推荐
// 3001: 私人专属好歌
// 3004: 小众宝藏佳作
// 3014: 喜欢这首歌的TA也喜欢
// 3102: 喜欢「欧美」的TA也喜欢
// 3101:  概念er新推
// 3005: 潮流尝鲜

module.exports = (params, useAxios) => {

  const dataMap = {
    tagid: params.tagid ?? '',
    u_info: '',
    source_mixsong: ''
  };

  return useAxios({
    url: 'youth/v1/song/single_card_recommend',
    encryptType: 'android',
    method: 'POST',
    data: dataMap,
    params: { 'card_id': params?.card_id || 3005, area_code: 1, platform: 'ios', module_id: 1, ver: 'v2', pagesize: params.pagesize ?? 30 , module_id: 1,  clientver: 11490 },
    cookie: params?.cookie || {},
  });
};
