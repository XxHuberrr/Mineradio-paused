// 歌曲评论数
module.exports = (params, useAxios) => {

  const paramsMap = {
    r: 'comments/getcommentsnum',
    code: 'fc4be23b4e972707f36b8a828a93ba8a',
  };

  if (params && params.hash) {
    paramsMap.hash = params.hash;
  } else if (params && params.special_id) {
    paramsMap.childrenid = params.special_id;
  }

  return useAxios({
    url: '/index.php',
    encryptType: 'web',
    method: 'GET',
    params: paramsMap,
    cookie: params?.cookie || {},
    headers: { 'x-router': 'sum.comment.service.kugou.com' },
  });
};
