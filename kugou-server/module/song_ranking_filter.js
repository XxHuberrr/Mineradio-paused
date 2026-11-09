// 歌曲成绩单

module.exports = (params, useAxios) => {

  return useAxios({
    url: '/grow/v1/song_ranking/unlock/v2/ranking_filter',
    method: 'GET',
    params: { album_audio_id: params.album_audio_id, page: params.page || 1, pagesize: params.pagesize || 30 },
    encryptType: 'android',
    cookie: params?.cookie || {},
  });
};
