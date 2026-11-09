// 获取歌手列表
module.exports = (params, useAxios) => {
  return useAxios({
    url: '/ocean/v6/singer/list',
    encryptType: 'android',
    method: 'GET',
    params: {
      hotsize: params?.hotsize ?? 200,
      musician: 0,
      sextype: params?.sextype ?? 0,
      showtype: 2,
      type: params?.type ?? 0,
    },
    cookie: params?.cookie || {},
  });
};
