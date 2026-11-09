// 获取音频高潮部分

module.exports = (params, useAxios) => {
  const data = (params?.hash || '').split(',').map((s) => ({ hash: s }));

  return useAxios({
    baseURL: 'https://expendablekmrcdn.kugou.com',
    url: '/v1/audio_climax/audio',
    method: 'GET',
    params: { data: JSON.stringify(data) },
    encryptType: 'android',
    cookie: params?.cookie || {},
  });
};
