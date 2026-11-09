// 歌手详情
module.exports = (params, useAxios) => {
  return useAxios({
    url: '/kmr/v3/author',
    method: 'POST',
    data: { author_id: params.id },
    encryptType: 'android',
    cookie: params?.cookie || {},
    headers: { 'x-router': 'openapi.kugou.com', 'kg-tid': 36 },
  });
};
