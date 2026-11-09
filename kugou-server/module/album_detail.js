// 专辑详情
module.exports = (params, useAxios) => {
  const data = {
    data: [{ album_id: params.id }],
    is_buy: params?.is_buy || 0,
    fields: 'album_id,album_name,publish_date,sizable_cover,intro,language,is_publish,heat,type,quality,authors,exclusive,author_name,trans_param',
  };
  return useAxios({
    url: '/kmr/v2/albums',
    method: 'POST',
    data,
    encryptType: 'android',
    cookie: params?.cookie || {},
    headers: { 'x-router': 'openapi.kugou.com', 'kg-tid': '255' },
  });
};
