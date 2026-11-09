// 对歌单删除歌曲

module.exports = (params, useAxios) => {
  const userid = params?.userid || params?.cookie?.userid || 0;
  const token = params?.token || params.cookie?.token || '';

  const resource = (params.fileids || '').split(',').map((s) => ({ fileid: Number(s) }));

  const dataMap = {
    listid: params.listid,
    userid,
    data: resource,
    type: 0,
    token,
    list_ver: 0,
  };

  return useAxios({
    url: '/v4/delete_songs',
    data: dataMap,
    method: 'post',
    encryptType: 'android',
    cookie: params?.cookie || {},
    headers: { 'x-router': 'cloudlist.service.kugou.com' },
  });
};
