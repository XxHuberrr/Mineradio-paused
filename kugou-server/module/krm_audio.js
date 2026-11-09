// 根据 album_audio_id/MixSongID 获取歌曲 相对应的 歌手/专辑/歌曲信息
module.exports = (params, useAxios) => {
  const resource = (params?.album_audio_id || '').split(',').map((s) => ({ entity_id: Number(s) }));

  const paramsMap = {
    data: resource,
    fields: params.fields || 'base',
  };

  return useAxios({
    url: '/kmr/v2/audio',
    method: 'POST',
    data: paramsMap,
    encryptType: 'android',
    cookie: params?.cookie || {},
    headers: {'x-router': 'openapi.kugou.com', 'KG-TID': 238},
  });
};
