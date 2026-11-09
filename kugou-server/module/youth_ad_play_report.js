// 广告奖励上报（看完一条开屏/激励广告，领取概念版 VIP 天数）需要登录
// 参照 echomusic-kugou-reward 插件：POST /youth/v1/ad/play_report
//   data: { ad_id, play_start, play_end }（毫秒时间戳，默认上报一次 30 秒广告播放）
//   次数用尽/资格用尽 → 业务码 30002
module.exports = (params, useAxios) => {
  const end = Number(params?.play_end) || Date.now();
  const start = Number(params?.play_start) || end - 30000;

  const dataMap = {
    ad_id: Number(params?.ad_id) || 12307537187,
    play_start: start,
    play_end: end,
  };

  return useAxios({
    url: '/youth/v1/ad/play_report',
    encryptType: 'android',
    method: 'post',
    data: dataMap,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    cookie: params?.cookie,
  });
};
