module.exports = (params, useAxios) => {
  return useAxios({
    url: `/longaudio/v1/home_new/week_new_albums_recommend`,
    method: 'post',
    encryptType: 'android',
    data: {album_playlist: []},
    params: {clientver: 12329},
    cookie: params?.cookie || {},
  });
};
