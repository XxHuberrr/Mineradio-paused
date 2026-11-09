/**
 * 获取用户关注的歌手的消息
 */
module.exports = (params, useAxios) => {
  const userid = params?.userid || params?.cookie?.userid || '0';
  

  return useAxios({
    url: '/msg.mobile/v3/msgtag/history',
    encryptType: 'android',
    method: 'GET',
    params: { filter: 1, maxid: 0, pagesize: params.pagesize ?? 30, tag: `chat:${userid}_${params.id}`},
    cookie: params?.cookie || {},
  });
};
