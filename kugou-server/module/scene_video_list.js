const { appid, clientver } = require('../util');

module.exports = (params, useAxios) => {
  const userid = params?.userid || params?.cookie?.userid || 0;
  const token = params?.token || params.cookie?.token || '';

  const dataMap = {
    appid,
    clientver,
    token,
    userid,
    tag_id: params.tag_id,
    page: params.page || 1,
    page_size: params.pagesize || 30,
    exposed_data: [],
  };

  return useAxios({
    url: '/scene/v1/distribution/video_list',
    method: 'POST',
    encryptType: 'android',
    data: dataMap,
    cookie: params?.cookie || {},
  });
};
