const { cryptoMd5 } = require('../util');
// 综合搜索
module.exports = (params, useAxios) => {
  const time = Date.now();
  
  const dataMap = {
    ab_tag: 0,
    ability: 511,
    albumhide: 0,
    apiver: 22,
    area_code: 1,
    clientver: 20125,
    cursor: 0,
    is_gpay: 0,
    iscorrection: 1,
    keyword: params.keyword,
    nocollect: 0,
    osversion: 16.5,
    platform: 'IOSFilter',
    recver: 2,
    req_ai: 1,
    requestid: `${cryptoMd5(`bdaa53d04e7475feb9024164a47032f9${time}`)}_0`,
    search_ability: 3,
    sec_aggre: 1,
    sec_aggre_bitmap: 0,
    style_type: 3,
    tag: 'em',
  };

  return useAxios({
    url: '/v3/search/mixed',
    method: 'GET',
    params: dataMap,
    encryptType: 'android',
    headers: { 'x-router': 'complexsearch.kugou.com', 'kg-clienttimems': time.toString() },
    cookie: params?.cookie || {},
  });
};
