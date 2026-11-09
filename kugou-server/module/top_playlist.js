// 歌单
// categoryid 0：推荐，11292：HI-RES

const { appid, clientver, signParamsKey } = require('../util');

module.exports = (params, useAxios) => {
  const dateTime = (Date.now() / 1000).toFixed(0);
  const specialRecommend = {
    withtag: params?.withtag || 1,
    withsong: params?.withsong || 1,
    sort: params?.sort || 1,
    ugc: 1,
    is_selected: 0,
    withrecommend: 1,
    area_code: 1,
    categoryid: params?.category_id || 0,
  };

  const dataMap = {
    appid,
    mid: params?.cookie?.KUGOU_API_MID,
    clientver,
    platform: 'android',
    clienttime: dateTime,
    userid: params?.userid || params?.cookie?.userid || 0,
    module_id: params?.module_id || 1,
    page: params?.page || 1,
    pagesize: params?.pagesize || 30,
    key: signParamsKey(dateTime.toString()),
    special_recommend: specialRecommend,
    req_multi: 1,
    retrun_min: 5,
    return_special_falg: 1,
  };

  return useAxios({
    url: '/v2/special_recommend',
    encryptType: 'android',
    method: 'POST',
    data: dataMap,
    cookie: params?.cookie || {},
    headers: { 'x-router': 'specialrec.service.kugou.com' },
  });
};
