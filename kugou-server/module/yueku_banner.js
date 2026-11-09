// 获取乐库下的 banner

module.exports = (params, useAxios) => {
  const dataMap = {
    plat: 0,
    channel: 201,
    operator: 7,
    networktype: 2,
    userid: params?.userid || params?.cookie?.userid || 0,
    vip_type: 0,
    m_type: 0,
    tags: [],
    apiver: 5,
    ability: 2,
    mode: 'normal',
  };

  return useAxios({
    url: '/ads.gateway/v3/listen_banner',
    encryptType: 'android',
    method: 'POST',
    data: dataMap,
    cookie: params?.cookie || {},
  });
};
