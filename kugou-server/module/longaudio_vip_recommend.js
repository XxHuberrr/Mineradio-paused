module.exports = (params, useAxios) => {
  return useAxios({
    url: `/longaudio/v1/home_new/vip_select_recommend`,
    method: 'post',
    encryptType: 'android',
    data: {album_playlist: []},
    params: {position: '2', clientver: 12329},
    cookie: params?.cookie || {},
  });
};
