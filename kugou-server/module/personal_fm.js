const { signParamsKey, appid, clientver } = require('../util');
module.exports = (params, useAxios) => {
  const userid = params?.cookie?.userid || params?.userid || 0;
  const token = params?.cookie?.token || params?.token || 0;
  const vip_type = params?.cookie?.vip_type || params?.vipType || 0;
  const dateTime = Date.now();

  const dataMap = {
    appid,
    clienttime: dateTime,
    mid: params?.cookie?.KUGOU_API_MID,
    action: params?.action || 'play',
    recommend_source_locked: 0,
    song_pool_id: Number(params?.song_pool_id || 0),
    callerid: 0,
    m_type: 1,
    platform: params?.platform || 'ios',
    area_code: 1,
    remain_songcnt: Number(params?.remain_songcnt || 0),
    clientver,
    is_overplay: params?.is_overplay ? 1 : 0,
    mode: params?.mode || 'normal',
    fakem: 'ca981cfc583a4c37f28d2d49000013c16a0a',
    key: signParamsKey(dateTime),
  };

  if (userid) {
    dataMap['userid'] = userid;
    dataMap['kguid'] = userid;
  }
  if (token) dataMap['token'] = token;
  if (vip_type) dataMap['vip_type'] = vip_type;

  if (params?.hash) dataMap['hash'] = params.hash;
  if (params?.songid) dataMap['songid'] = params.songid;
  if (params?.playtime) dataMap['playtime'] = params.playtime;

  return useAxios({
    url: '/v2/personal_recommend',
    data: dataMap,
    method: 'post',
    encryptType: 'android',
    cookie: params?.cookie || {},
    headers: { 'x-router': 'persnfm.service.kugou.com' },
  });
};
