/**
 *
 * @param {Record<string, any>} params
 * @param {useAxios} useAxios
 * @returns
 */
module.exports = (params, useAxios) => {
  const dataMap = { tags: {} };
  return new Promise((resolve, reject) => {
    useAxios({
      baseURL: 'http://musicadservice.kugou.com',
      url: '/v1/daily_recommend',
      encryptType: 'android',
      method: 'POST',
      data: dataMap,
      params: {
        clientver: 12349,
        area_code: 1,
      },
      cookie: params?.cookie || {},
    })
      .then((resp) => {
        if (resp.body.status == 1) {
          const list = Array.isArray(resp.body.data.list) ? [...resp.body.data.list] : [];
          list.forEach((s, index) => {
            const inner_url = s?.extra?.inner_url;
            if (inner_url) {
              const findIndex = inner_url.lastIndexOf('ip_id');
              if (findIndex !== -1) {
                list[index]['extra']['ip_id'] = Number(inner_url.substring(findIndex + 6));
              }
            }
          });
          resp.body.data.list = list;
        }
        resolve(resp);
      })
      .catch((e) => reject(e));
  });
};
