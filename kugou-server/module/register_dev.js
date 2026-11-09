const { playlistAesEncrypt, playlistAesDecrypt, rsaEncrypt2, signParamsKey, clientver, appid } = require('../util');
module.exports = (params, useAxios) => {
  const userid = params?.userid || params?.cookie?.userid || 0;
  const token = params?.token || params.cookie?.token || '';
  //可用内存，单位是字节
  const availableRamSize = params?.availableRamSize || 4983533568;
  //内部存储可用空间，单位是字节（约 48 MB）
  const availableRomSize = params?.availableRomSize || 48114719;
  //外部存储可用空间，单位是字节（约 48 MB）
  const availableSDSize = params?.availableSDSize || 48114717;
  //基带版本
  const basebandVer = params?.basebandVer || '';
  //电池电量百分比
  const batteryLevel = params?.batteryLevel || 100;
  //电池状态
  const batteryStatus = params?.batteryStatus || 3;
  //品牌
  const brand = params?.brand || 'Redmi';
  //设备序号
  const buildSerial = params?.buildSerial || 'unknown';
  //设备代号
  const device = params?.device || 'marble';
  //IMEI 号
  const imei = params?.imei || params.cookie?.KUGOU_API_GUID;
  //sim 卡号序号
  const imsi = params?.imsi || '';
  //厂商
  const manufacturer = params?.manufacturer || 'Xiaomi';
  //设备uuid
  const uuid = params?.uuid  || params.cookie?.KUGOU_API_GUID;
  //是否有加速度传感器
  const accelerometer = params?.accelerometer || false;
  //加速度传感器值
  const accelerometerValue = params?.accelerometerValue || '';
  //是否有重力传感器
  const gravity = params?.gravity || false;
  //重力传感器的值
  const gravityValue = params?.gravityValue  || '';
  //是否有陀螺仪
  const gyroscope = params?.gyroscope || false;
  //陀螺仪的值
  const gyroscopeValue = params?.gyroscopeValue || '';
  //是否有光线传感器
  const light = params?.light  || false;
  //光线传感器的值
  const lightValue = params?.lightValue || '';
  //是否有磁力传感器
  const magnetic = params?.magnetic || false;
  //磁力传感器的值
  const magneticValue = params?.magneticValue  || '';
  //是否有方向传感器
  const orientation = params?.orientation || false;
  //方向传感器的值
  const orientationValue = params?.orientationValue || '';
  //是否有压力传感器
  const pressure = params?.pressure|| false;
  //压力传感器的值
  const pressureValue = params?.pressureValue || '';
  //是否有步数传感器
  const step_counter = params?.step_counter || false;
  //步数传感器的值
  const step_counterValue = params?.step_counterValue || '';
  //是否有温度传感器
  const temperature = params?.temperature || false;
  //温度传感器的值
  const temperatureValue = params?.temperatureValue || '';



  const dataMap = {
    'availableRamSize': availableRamSize,
    'availableRomSize': availableRomSize,
    'availableSDSize': availableSDSize,
    'basebandVer': basebandVer,
    'batteryLevel': batteryLevel,
    'batteryStatus': batteryStatus,
    'brand': brand,
    'buildSerial': buildSerial,
    'device': device,
    'imei': imei,
    'imsi': imsi,
    'manufacturer': manufacturer,
    'uuid': uuid,
    'accelerometer': accelerometer,
    'accelerometerValue': accelerometerValue,
    'gravity': gravity,
    'gravityValue': gravityValue,
    'gyroscope': gyroscope,
    'gyroscopeValue': gyroscopeValue,
    'light': light,
    'lightValue': lightValue,
    'magnetic': magnetic,
    'magneticValue': magneticValue,
    'orientation': orientation,
    'orientationValue': orientationValue,
    'pressure': pressure,
    'pressureValue': pressureValue,
    'step_counter': step_counter,
    'step_counterValue': step_counterValue,
    'temperature': temperature,
    'temperatureValue': temperatureValue,
  };

  const aesEncrypt = playlistAesEncrypt(dataMap);

  const p = rsaEncrypt2({ aes: aesEncrypt.key, uid: userid, token });

  return new Promise((resolve, reject) => {
    useAxios({
      baseURL: 'https://userservice.kugou.com',
      url: '/risk/v2/r_register_dev',
      method: 'POST',
      data: aesEncrypt.str,
      params: { part: 1, platid: 1, p },
      encryptType: 'android',
      cookie: params?.cookie || {},
      responseType: 'arraybuffer',
    })
      .then((res) => {
        res.body = playlistAesDecrypt({ str: res.body.toString('base64'), key: aesEncrypt.key });

        const { body } = res;
        if (body?.status === 1 && body?.data) {
          res.cookie.push(`dfid=${res.body.data['dfid']}`);
        }

        resolve(res);
      })
      .catch((e) => reject(e));
  });
};
