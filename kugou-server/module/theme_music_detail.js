// 获取主题音乐详情
module.exports = (params, useAxios) => {
  const dataMap = {
    platform: 'android',
    clienttime: Math.floor(Date.now() / 1000),
    theme_category_id: params?.id,
    show_theme_category_id: 0,
    userid: params?.userid || params?.cookie?.userid || 0,
    module_id: 508,
  };

  return useAxios({
    url: '/everydayrec.service/v1/theme_category_recommend',
    encryptType: 'android',
    method: 'POST',
    data: dataMap,
    cookie: params?.cookie || {},
  });
};
