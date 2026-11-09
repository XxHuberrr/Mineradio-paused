// 获取用户听歌排行
module.exports = (params, useAxios) => {
  const userid = params?.userid || params?.cookie?.userid || 0;
  const token = params?.token || params?.cookie?.token || '';

  const dataMap = {  token, userid, source_classify: 'app',  to_subdivide_sr: 1 };

  if (params.bp) dataMap['bp'] = params.bp;

  return useAxios({
    url: '/playhistory/v1/get_songs',
    data: dataMap,
    encryptType: 'android',
    method: 'POST',
    cookie: params?.cookie || {},
  });

};
