
module.exports = (params, useAxios) => {
  const dataMap = {
    global_collection_id: params.global_collection_id,
    fileid: params.fileid
  }
  return useAxios({
    url: '/youth/v2/post/get_song_detail',
    encryptType: 'android',
    method: 'get',
    params: dataMap,
    cookie: params?.cookie,
  });
};
