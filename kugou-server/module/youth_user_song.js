
module.exports = (params, useAxios) => {
  const dataMap = {
    filter_video:	0,
    type:	params?.type || 0,
    userid: params.userid,
    pagesize: params.pagesize || 30,
    page: params.page || 1,
    is_filter: 0,
  }
  return useAxios({
    url: '/youth/v1/get_user_song_public',
    encryptType: 'android',
    method: 'get',
    params: dataMap,
    cookie: params?.cookie,
  });
};
