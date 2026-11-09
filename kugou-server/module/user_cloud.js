const { playlistAesEncrypt, playlistAesDecrypt, rsaEncrypt2, signParamsKey, clientver, appid } = require('../util');
module.exports = (params, useAxios) => {
  const answer = { status: 500, body: {}, cookie: [] };
  return new Promise(async (resolve) => {
    try {
      const userid = params?.userid || params?.cookie?.userid || 0;
      const token = params?.token || params.cookie?.token || '';
      const mid = params?.cookie?.KUGOU_API_MID; // 可以自定义
      const clienttime = Math.floor(Date.now() / 1000);

      const dataMap = {
        page: params.page ?? 1,
        pagesize: params.pagesize ?? 30,
        getkmr: 1,
      };

      const aesEncrypt = playlistAesEncrypt(dataMap);

      const p = rsaEncrypt2({ aes: aesEncrypt.key, uid: userid, token }).toUpperCase();

      const paramsMap = {
        clienttime,
        mid,
        key: signParamsKey(clienttime.toString(), appid),
        clientver,
        appid,
        p,
      };

      const respone = await useAxios({
        baseURL: 'https://mcloudservice.kugou.com',
        url: '/v1/get_list',
        params: paramsMap,
        data: Buffer.from(aesEncrypt.str, 'base64'),
        method: 'post',
        encryptType: 'android',
        responseType: 'arraybuffer',
        cookie: params?.cookie || {},
        clearDefaultParams: true,
        notSignature: true,
      });

      respone.body = playlistAesDecrypt({ str: respone.body.toString('base64'), key: aesEncrypt.key });

      resolve(respone);
    } catch (error) {
      console.log(error);
      answer.body = error;
      resolve(answer);
    }
  });
};
