
module.exports = (params, useAxios) => {
  const dataMap = {
    global_collection_id: params.global_collection_id,
    pagesize: params.pagesize || 30,
    page: params.page || 1,
    is_filter: 0,
  }
  return useAxios({
    url: '/youth/api/channel/v1/channel_get_song_audit_passed',
    encryptType: 'android',
    method: 'get',
    params: dataMap,
    cookie: params?.cookie,
  });
};
