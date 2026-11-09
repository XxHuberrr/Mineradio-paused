module.exports = (params, useAxios) => {
  const dataMap = {
    platform: params.platform || 'ios' 
  };

  return useAxios({
    url: '/everydayrec.service/everyday_style_recommend',
    encryptType: 'android',
    method: 'POST',
    data: {},
    params: { tagids: params.tagids ?? ''},
    cookie: params?.cookie || {},
  });
};
