const { appid, clientver } = require('../util');

module.exports = (params, useAxios) => {
  const userid = params?.userid || params?.cookie?.userid || 0;
  const token = params?.token || params.cookie?.token || '';

  const dataMap = {
    appid,
    clientver,
    token,
    userid,
  };

  return useAxios({
    url: '/scene/v1/scene/audio_list',
    method: 'POST',
    encryptType: 'android',
    params: { scene_id: params.id, module_id: params.module_id, tag: params.tag, page: params.page || 1, page_size: params.pagesize || 30 },
    data: dataMap,
    cookie: params?.cookie || {},
  });
};
