// 根据 ip 获取相对于歌单
module.exports = (params, useAxios) => {
  const dataMap = {
    ip: params?.id,
    page: params?.page || 1,
    pagesize: params?.pagesize || 30,
  };

  return useAxios({
    url: '/ocean/v6/pubsongs/list_info_for_ip',
    encryptType: 'android',
    method: 'POST',
    params: dataMap,
    cookie: params?.cookie || {},
  });
};
