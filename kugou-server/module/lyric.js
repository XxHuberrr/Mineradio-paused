// 歌词获取
const { decodeLyrics } = require('../util');

module.exports = (params, useAxios) => {
  const dataMap = {
    ver: 1,
    client: params?.client || 'android',
    id: params?.id,
    accesskey: params?.accesskey,
    fmt: params.fmt || 'krc',
    charset: 'utf8',
  };

  return new Promise((resolve, reject) => {
    useAxios({
		  baseURL: 'https://lyrics.kugou.com',
		  url: '/download',
      method: 'GET',
      params: dataMap,
      cookie: params?.cookie || {},
      encryptType: 'android',
    })
      .then((res) => {
        if (params?.decode) {
          if (res.body?.content) {
            res.body['decodeContent'] = params?.fmt == 'lrc' || Number(res.body?.contenttype) !== 0 ? Buffer.from(res.body?.content, 'base64').toString() : decodeLyrics(res.body.content);
            resolve(res);
            return;
          }
        }
        resolve(res);
      })
      .catch((e) => reject(e));
  });
};
