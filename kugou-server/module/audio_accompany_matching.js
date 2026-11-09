const { cryptoMd5, appid } = require('../util');

module.exports = (params, useAxios) => {

  const dataMap = {
    isteen: 0,
    mixId: Number(params.mixId) || 0,
    usemkv: 1,
    platform: 2,
    fileName: params.fileName || '',
    hash: params.hash,
    version: 12375,
    appid,
  }


  const str = '*s&iN#G70*';
  const paramsString = Object.keys(dataMap)
    .sort()
    .map((key) => `${key}=${typeof dataMap[key] === 'object' ? JSON.stringify(dataMap[key]) : dataMap[key]}`)
    .join('&');
  dataMap['sign'] = cryptoMd5(`${paramsString}${str}`).substring(8, 24);
  
  return useAxios({
    baseURL: 'https://nsongacsing.kugou.com',
    url: '/sing7/accompanywan/json/v2/cdn/optimal_matching_accompany_2_listen.do',
    params: dataMap,
    method: 'get',
    encryptType: 'android',
    cookie: params?.cookie || {},
    clearDefaultParams: true,
    notSignature: true,
  });
};
