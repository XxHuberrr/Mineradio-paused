// 歌曲评论
module.exports = (params, useAxios) => {

  const paramsMap = {
    childrenid: params.id,
    need_show_image: 1,
    p: params.page || 1,
    pagesize: params.pagesize || 30,
    show_classify: params.show_classify || 1,
    show_hotword_list: params.show_hotword_list || 1,
    code: 'ca53b96fe5a1d9c22d71c8f522ef7c4f',
    content_type: 0,
    tag: 5
  }

  return useAxios({
    url: '/m.comment.service/v1/cmtlist',
    encryptType: 'android',
    method: 'POST',
    params: paramsMap,
    cookie: params?.cookie || {},
  });
};
