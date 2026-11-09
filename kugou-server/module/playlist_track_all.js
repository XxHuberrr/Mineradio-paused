// 获取歌单所有歌曲
module.exports = (params, useAxios) => {
  const pagesize = params?.pagesize || 30;
  const paramsMap = {
    area_code: 1,
    begin_idx: (Number(params.page || 1) - 1) * pagesize,
    plat: 1,
    type: 1,
    // module: 'NONE',
    mode: 1,
    personal_switch: 1,
    extend_fields: 'abtags,hot_cmt,popularization',
    // page: params?.page || 1,
    pagesize ,
    global_collection_id: params?.id,
  };

  return useAxios({
    url: '/pubsongs/v2/get_other_list_file_nofilt',
    method: 'GET',
    encryptType: 'android',
    params: paramsMap,
    cookie: params?.cookie || {},
    // headers: { 'x-router': 'pubsongscdn.kugou.com' },
  });
};
