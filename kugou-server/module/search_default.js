const { clientver } = require('../util');
module.exports = (params, useAxios) => {
  const userid = params?.userid || params?.cookie?.userid || 0;
  const vip_type = params?.vip_type || params?.cookie?.vip_type || 65530;
  const dataMap = {
    'plat': 0,
    'userid': Number(userid),
    'tags': '{}',
    'vip_type': vip_type,
    'm_type': 0,
    'own_ads': {},
    'ability': '3',
    'sources': [],
    'bitmap': 2,
    'mode': 'normal',
  };

  return useAxios({
    url: '/searchnofocus/v1/search_no_focus_word',
    method: 'POST',
    data: dataMap,
    params: { clientver: 12329 },
    encryptType: 'android',
    cookie: params?.cookie || {},
  });
};
