// 歌曲成绩单

module.exports = (params, useAxios) => {

  return useAxios({
    url: '/grow/v1/song_ranking/play_page/ranking_info',
    method: 'GET',
    params: { album_audio_id: params.album_audio_id },
    encryptType: 'android',
    cookie: params?.cookie || {},
  });
};
