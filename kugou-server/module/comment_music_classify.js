// 歌曲评论-根据分类获取评论
module.exports = (params, useAxios) => {

  const paramsMap = {
    mixsongid: params.mixsongid,
    need_show_image: 1,
    page: params.page || 1,
    pagesize: params.pagesize || 30,
    type_id: params.type_id,
    extdata: '0',
    code: 'fc4be23b4e972707f36b8a828a93ba8a',
    sort_method: Number(params.sort) === 2 ? params.sort : 1
  }

  return useAxios({
    url: '/mcomment/v1/cmt_classify_list',
    encryptType: 'android',
    method: 'POST',
    params: paramsMap,
    cookie: params?.cookie || {},
  });
};
