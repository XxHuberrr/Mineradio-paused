// 手机登录
const { cryptoAesDecrypt, cryptoAesEncrypt, cryptoRSAEncrypt, signParamsKey, isLite, randomString } = require('../util');

let liteT2Key = 'fd14b35e3f81af3817a20ae7adae7020';
let liteT2Iv = '17a20ae7adae7020';
let liteT1Key = '5e4ef500e9597fe004bd09a46d8add98';
let liteT1Iv = '04bd09a46d8add98';

module.exports = (params, useAxios) => {
  const dateTime = Date.now();
  const encrypt = cryptoAesEncrypt({ mobile: params?.mobile || '', code: params?.code || '' });
  const mobile = params?.mobile && `${params.mobile.toString().substring(0, 2)}*****${params.mobile.toString().substring(10, 11)}`;
  const dfid = params?.cookie?.dfid ?? randomString(24);
  const t2 = cryptoAesEncrypt(
    `${params.cookie?.KUGOU_API_GUID}|0f607264fc6318a92b9e13c65db7cd3c|${params.cookie?.KUGOU_API_MAC}|${params.cookie?.KUGOU_API_DEV}|${dateTime}`,
    { key: liteT2Key, iv: liteT2Iv }
  );
  const t1 = cryptoAesEncrypt(`|${dateTime}`, { key: liteT1Key, iv: liteT1Iv });
  let dataMap = {
    plat: 1,
    support_multi: 1,
    t1: isLite ? t1 : 0,
    t2: isLite ? t2 : 0,
    clienttime_ms: dateTime,
    mobile,
    key: signParamsKey(dateTime),
    pk: cryptoRSAEncrypt({ 'clienttime_ms': dateTime, key: encrypt.key }).toUpperCase(),
    params: encrypt.str,
  };

  if (params?.userid) dataMap['userid'] = params.userid;

  if (isLite) {
    dataMap['dfid'] = dfid;
    dataMap['dev'] = params.cookie?.KUGOU_API_DEV;
    dataMap['gitversion'] = '5f0b7c4';
  } else {
    dataMap['t3'] = 'MCwwLDAsMCwwLDAsMCwwLDA=';
  }

  return new Promise((resolve, reject) => {
    useAxios({
      baseURL: 'https://loginserviceretry.kugou.com',
      url: `/v7/login_by_verifycode`,
      method: 'POST',
      data: dataMap,
      encryptType: 'android',
      headers: {
        'support-calm': '1',
        'User-Agent': 'Android16-1070-11440-130-0-LOGIN-wifi',
      },
      cookie: params?.cookie || {},
    })
      .then((res) => {
        const { body } = res;
        if (body?.status && body?.status === 1) {
          if (body?.data?.secu_params) {
            const getToken = cryptoAesDecrypt(body.data.secu_params, encrypt.key);
            if (typeof getToken === 'object') {
              res.body.data = { ...body.data, ...getToken };
              Object.keys(getToken).forEach((key) => res.cookie.push(`${key}=${getToken[key]}`));
            } else {
              res.body.data['token'] = getToken;
            }
          }
          res.cookie.push(`t1=${res.body.data['t1']}`);
          res.cookie.push(`token=${res.body.data['token']}`);
          res.cookie.push(`userid=${res.body.data?.userid || 0}`);
          res.cookie.push(`vip_type=${res.body.data?.vip_type || 0}`);
          res.cookie.push(`vip_token=${res.body.data?.vip_token || ''}`);
        }
        resolve(res);
      })
      .catch((e) => reject(e));
  });
};
