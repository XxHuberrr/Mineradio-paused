// 歌手荣誉详情
module.exports = (params, useAxios) => {
  return useAxios({
    baseURL: 'http://h5activity.kugou.com',
    url: '/v1/query_singer_honour_detail',
    method: 'POST',
    params: { singer_id: params.id, pagesize: params?.pagesize || 30, page: params?.page || 1 },
    encryptType: 'android',
    cookie: params?.cookie || {},
  });
};
