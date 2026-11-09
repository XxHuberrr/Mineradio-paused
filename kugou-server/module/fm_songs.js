const { appid, clientver, signParamsKey } = require('../util');
module.exports = (params, useAxios) => {
  const dateTime = Date.now();
  const userid = params?.cookie?.userid || params?.userid;

  const fmData = (params?.fmid || '').split(',').map((s) => ({
    fmid: s,
    fmtype: params?.type || 2,
    offset: params?.offset || -1,
    size: params?.size || 20,
    singername: s.singername || '',
  }));

  // fmType 生成
  (params?.fmtype || '').split(',').forEach((s, l) => (fmData[l].fmtype = s || fmData[l].fmtype));

  (params?.fmoffset || '').split(',').forEach((s, l) => (fmData[l].offset = s || fmData[l].offset));

  (params?.fmsize || '').split(',').forEach((s, l) => (fmData[l].size = s || fmData[l].size));

  const dataMap = {
    appid,
    area_code: 1,
    clienttime: dateTime,
    clientver,
    data: fmData,
    get_tracker: 1,
    key: signParamsKey(dateTime),
    mid: params?.cookie?.KUGOU_API_MID,
    uid: userid,
  };

  return useAxios({
    url: '/v1/app_song_list_offset',
    encryptType: 'android',
    method: 'POST',
    data: dataMap,
    cookie: params?.cookie || {},
    headers: { 'x-router': 'fm.service.kugou.com', 'Content-Type': 'application/json' },
  });
};
