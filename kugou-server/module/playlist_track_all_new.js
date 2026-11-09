// 获取歌单所有歌曲
module.exports = (params, useAxios) => {
  const userid = params?.userid || params?.cookie?.userid || '0';
  const token = params?.token || params?.cookie?.token || '0';
  const dataMap = {
    listid: params.listid,
    userid,
    area_code: 1,
    show_relate_goods: 0,
    pagesize: params.pagesize || 30,
    allplatform: 1,
    show_cover: 1,
    type: 0,
    token,
    page: params.page || 1,
  };

  return useAxios({
    url: '/v4/get_list_all_file',
    method: 'post',
    encryptType: 'android',
    data: dataMap,
    cookie: params?.cookie || {},
    headers: { 'x-router': 'cloudlist.service.kugou.com' },
  });
};
