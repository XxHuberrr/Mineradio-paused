module.exports = (params, useAxios) => {
  const data =  (params.album_id || '').split(',').map((s) => ({ album_id: s }));
  return useAxios({
    url: `/openapi/v2/broadcast`,
    method: 'post',
    encryptType: 'android',
    data: {
      data,
      show_album_tag: 1,
      fields: "album_name,album_id,category,authors,sizable_cover,intro,author_name,trans_param,album_tag,mix_intro,full_intro,is_publish"
    },
    cookie: params?.cookie || {},
    headers: {'KG-TID': '78'}
  });
};
