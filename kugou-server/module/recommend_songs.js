// 每日推荐歌曲

module.exports = (params, useAxios) => {
  const dataMap = {
    platform: params?.platform || 'android',
    userid: params?.userid || params?.cookie?.userid || '0',
  };

  return useAxios({
    url: '/everyday_song_recommend',
    method: 'POST',
    data: dataMap,
    encryptType: 'android',
    cookie: params?.cookie || {},
    headers: { 'x-router': 'everydayrec.service.kugou.com' },
  });
};
