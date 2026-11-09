// 获取歌单详情

module.exports = (params, useAxios) => {
  const data = (params?.ids || '').split(',').map(s => ({'global_collection_id': s }));
  
  const dataMap = {
    data,
    userid: params?.userid || params?.cookie?.userid || 0,
    token: params?.token || params?.cookie?.token || ''
  };

  return useAxios({
    url: '/v3/get_list_info',
    method: 'POST',
    encryptType: 'android',
    data: dataMap,
    cookie: params?.cookie || {},
    headers: {'x-router': 'pubsongs.kugou.com'}
  })


}