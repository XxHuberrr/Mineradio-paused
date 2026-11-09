// 获取排行榜音乐列表
module.exports = (params, useAxios) => {
  const dataMap = {
    show_portrait_mv: 1,
    show_type_total: 1,
    filter_original_remarks: 1,
    area_code: 1,
    pagesize: params.pagesize || 30,
    rank_cid: params.rank_cid || 0,
    type: 1,
    page: params.page || 1,
    rank_id: params.rankid,
  };
  return useAxios({
    url: '/openapi/kmr/v2/rank/audio',
    method: 'post',
    data: dataMap,
    encryptType: 'android',
    cookie: params?.cookie || {},
    headers: { 'kg-tid': '369' },
  });
};
