const { appid, clientver, signParamsKey } = require('../util');

module.exports = (params, useAxios) => {
  const data = (params?.ids || '').split(',').map((s) => ({ 'global_collection_id': s }));
  const clienttime = Date.now();

  const dataMap = {
    appid,
    clientver,
    clienttime,
    key: signParamsKey(clienttime),
    userid: params?.userid || params?.cookie?.userid || 0,
    ugc: 1,
    show_list: 1,
    need_songs: 1,
    data,
  };

  return useAxios({
    url: '/pubsongs/v1/kmr_get_similar_lists',
    method: 'POST',
    encryptType: 'android',
    data: dataMap,
    cookie: params?.cookie || {},
  });
};
