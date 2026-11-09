// 推荐专辑
const { apiver } = require('../util');

module.exports = (params, useAxios) => {
  const dataMap = {
    apiver,
    token: params?.token || params?.cookie?.token || '',
    page: params?.page || 1,
    pagesize: params?.pagesize || 30,
    withpriv: 1,
  };

  return useAxios({
    url: '/musicadservice/v1/mobile_newalbum_sp',
    method: 'POST',
    data: dataMap,
    encryptType: 'android',
    cookie: params?.cookie || {},
  });
};
