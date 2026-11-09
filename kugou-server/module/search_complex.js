// 综合搜索
module.exports = (params, useAxios) => {
  const dataMap = {
    platform: 'AndroidFilter',
    keyword: params.keywords,
    page: params?.page || 1,
    pagesize: params?.pagesize || 30,
    cursor: 0,
  };

  return useAxios({
    baseURL: 'https://complexsearch.kugou.com',
    url: '/v6/search/complex',
    method: 'GET',
    params: dataMap,
    encryptType: 'android',
    cookie: params?.cookie || {},
  });
};
