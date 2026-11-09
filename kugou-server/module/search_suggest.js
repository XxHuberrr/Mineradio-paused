module.exports = (params, useAxios) => {
  return useAxios({
    url: '/v2/getSearchTip',
    method: 'GET',
    params: {
      keyword: params.keywords,
      AlbumTipCount: params.albumTipCount || 10,
      CorrectTipCount: params.correctTipCount || 10,
      MVTipCount: params.mvTipCount || 10,
      MusicTipCount: params.musicTipCount || 10,
      radiotip: 1
    },
    encryptType: 'android',
    cookie: params?.cookie || {},
    headers: { 'x-router': 'searchtip.kugou.com' },
  });
};
