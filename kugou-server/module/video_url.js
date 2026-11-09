// 获取视频urls
module.exports = (params, useAxios) => {
  const paramsMap = {
    backupdomain: 1,
    cmd: 123,
    ext: 'mp4',
    ismp3: 0,
    hash: params.hash,
    pid: 1,
    type: 1,
  };

  return useAxios({
    url: '/v2/interface/index',
    method: 'GET',
    params: paramsMap,
    encryptType: 'android',
    encryptKey: true,
    headers: { 'x-router': 'trackermv.kugou.com' },
  });
};
