// 听歌识曲
module.exports = (params, useAxios) => {
  const paramsMap = {
    fpid: Date.now(),
    area_code: 1,
    include_unpublish: 1,
    useid: params?.userid || params?.cookie?.userid || 0,
    multi_result: 1,
  };

  return useAxios({
    url: '/fingerprint.service/v1/music_trackid_mulit',
    encryptType: 'android',
    method: 'POST',
    data: params.data,
    params: paramsMap,
    cookie: params?.cookie || {},
    headers: { 'content-type': 'application/octet-stream', 'user-agent': 'KuGou/11490 (Android)' },
  });
};
