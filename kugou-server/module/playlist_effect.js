// 获取音效歌单

module.exports = (params, useAxios) => {
  const dataMap = {
    page: params?.page || 1,
    pagesize: params?.pagesize || 30,
  };

  return useAxios({
    url: '/pubsongs/v1/get_sound_effect_list',
    method: 'POST',
    encryptType: 'android',
    data: dataMap,
    cookie: params?.cookie || {},
  });
};
