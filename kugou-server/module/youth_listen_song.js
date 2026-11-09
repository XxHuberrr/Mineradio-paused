// 听歌领取vip 需要登录
module.exports = (params, useAxios) => {
  const dataMap = {
    mixsongid: params?.mixsongid || 666075191
  }

  return useAxios({
    url: '/youth/v2/report/listen_song',
    data: dataMap,
    method: 'POST',
    encryptTyPe: 'android',
    params: { clientver: 10566 },
    cookie: params?.cookie,
    headers: {
      "user-agent": "Android13-1070-10566-201-0-ReportPlaySongToServerProtocol-wifi",
      "content-type": "application/json; charset=utf-8",
    },
  });
};
