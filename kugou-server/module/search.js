// 搜索
// type=song: /v2/search/song，type=album: /v1/search/album，其余类型: /v1/search/{type}
module.exports = (params, useAxios) => {
  const type = ['special', 'lyric', 'song', 'album', 'author', 'mv'].includes(params.type) ? params.type : 'song';
  const isLite = process.env.platform === 'lite';
  const keyword = params?.keywords || params?.keyword || '';

  if (type === 'song') {
    const dataMap = {
      keyword,
      page: params?.page || 1,
      pagesize: params?.pagesize || 30,
      platform: 'AndroidFilter',
      iscorrection: params?.iscorrection ?? 1,
      privilegefilter: params?.privilegefilter ?? 0,
      area_code: params?.area_code || 1,
      dopicfull: 1,
    };

    // 传 tag=em 时返回带 <em> 高亮的关键词
    if (params?.tag) dataMap.tag = params.tag;

    // 概念版(Young) versionCode 为 201
    if (isLite) dataMap.clientver = 201;

    return useAxios({
      url: '/v2/search/song',
      method: 'GET',
      params: dataMap,
      encryptType: 'android',
      headers: { 'x-router': 'complexsearch.kugou.com' },
      cookie: params?.cookie || {},
    });
  }

  if (type === 'album') {
    // sorttype: 0=全部, 1=最新
    const dataMap = {
      keyword,
      page: params?.page || 1,
      pagesize: params?.pagesize || 20,
      platform: 'AndroidFilter',
      iscorrection: params?.iscorrection ?? 1,
      category: params?.category || '1',
      sorttype: Number(params?.sorttype) === 1 ? 1 : 0,
      searchsong: Number(params?.searchsong) === 1 ? 1 : 0,
    };

    // 传 tag=em 时返回带 <em> 高亮的关键词
    if (params?.tag) dataMap.tag = params.tag;

    if (isLite) dataMap.clientver = 201;

    return useAxios({
      url: '/v1/search/album',
      method: 'GET',
      params: dataMap,
      encryptType: 'android',
      headers: { 'x-router': 'complexsearch.kugou.com' },
      cookie: params?.cookie || {},
    });
  }

  const dataMap = {
    // token: '',
    albumhide: 0,
    iscorrection: 1,
    keyword,
    nocollect: 0,
    page: params?.page || 1,
    pagesize: params?.pagesize || 30,
    platform: 'AndroidFilter',
  };

  return useAxios({
    url: `/v1/search/${type}`,
    method: 'GET',
    params: dataMap,
    encryptType: 'android',
    headers: { 'x-router': 'complexsearch.kugou.com' },
    cookie: params?.cookie || {},
  });
};
