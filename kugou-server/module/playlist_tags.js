// 获取歌单分类

module.exports = (params, useAxios) => {
  const dataMap = {
    tag_type: 'collection',
    tag_id: 0,
    source: 3,
  };

  return useAxios({
    url: '/pubsongs/v1/get_tags_by_type',
    method: 'POST',
    encryptType: 'android',
    data: dataMap,
    cookie: params?.cookie || {},
  });
};
