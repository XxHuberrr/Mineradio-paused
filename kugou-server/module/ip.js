// 根据 ip id 获取相对应的 歌曲/专辑/视频/歌手
module.exports = (params, useAxios) => {
  const dataMap = {
    is_publish: 1,
    ip_id: params?.id,
    sort: 3,
    page: params?.page || 1,
    pagesize: params?.pagesize || 30,
    query: 1,
  };

  const type = ['audios', 'albums', 'videos', 'author_list'].includes(params?.type) ? params.type : 'audios';

  return useAxios({
    url: `/openapi/v1/ip/${type}`,
    encryptType: 'android',
    method: 'POST',
    data: dataMap,
    cookie: params?.cookie || {},
  });
};
