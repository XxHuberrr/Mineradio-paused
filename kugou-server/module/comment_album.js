// 歌曲评论
module.exports = (params, useAxios) => {

  const paramsMap = {
    childrenid: params.id,
    need_show_image: 1,
    p: params.page || 1,
    pagesize: params.pagesize || 30,
    show_classify: params.show_classify || 1,
    show_hotword_list: params.show_hotword_list || 1,
    code: '94f1792ced1df89aa68a7939eaf2efca',
  }

  return useAxios({
    url: '/m.comment.service/v1/cmtlist',
    encryptType: 'android',
    method: 'POST',
    params: paramsMap,
    cookie: params?.cookie || {},
  });
};
