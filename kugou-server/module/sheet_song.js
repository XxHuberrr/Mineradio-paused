// 乐谱列表  3、钢琴（0：基础，1：进阶)，1、吉他(1: 进阶, 2：基础，0：中级)，2、尤克里里（0：基础，1：进阶），4：简谱（0：基础）
module.exports = (params, useAxios) => {
  const paramsMap = {
    mixsongid: params.album_audio_id,
    instruments: params.instruments ?? 1,
    opern_level: params?.level ?? 0
  }
  return useAxios({
    url: '/opern/v1/detail/song_info',
    encryptType: 'android',
    method: 'GET',
    params: paramsMap,
    cookie: params?.cookie || {},
  });
};
