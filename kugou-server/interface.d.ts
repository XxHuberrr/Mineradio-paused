/**
 * @fileoverview KuGouMusicApi TypeScript 类型定义
 *
 * 基于 module/ 目录下各模块文件自动生成的扁平函数导出结构，
 * 每个 API 对应一个独立的导出函数，参数类型与返回类型一一对应。
 *
 * 导出结构参考 app.js:
 * module.exports = { ...require('./server'), ...require('./util/request'), ...obj };
 */

// ============================================================
//  基础通用类型
// ============================================================

/** Cookie 键值对映射 */
export interface CookieMap {
  [key: string]: string;
}

/** 所有 API 接口共享的基础请求参数 */
export interface CommonParams {
  /**
   * 用户认证 Cookie
   * - 支持字符串格式（如 `"token=xxx;userid=xxx;dfid=xxx"`）
   * - 支持对象格式（如 `{ token: "xxx", userid: "xxx" }`）
   */
  cookie?: string | CookieMap;
  /** 时间戳，用于绕过 2 分钟缓存（使每次请求 URL 不同） */
  timestamp?: number | string;
  /** 是否禁止将响应中的 Cookie 写回客户端 */
  noCookie?: boolean;
}

/** API 统一响应结构 */
export interface ApiResponse<T = any> {
  /** HTTP 状态码 */
  status: number;
  /** 响应体（JSON 格式） */
  body: T;
  /** 响应头 */
  headers: Record<string, string>;
  /** 服务端设置的 Cookie 列表 */
  cookie?: string[];
}

/** 带分页的通用请求参数 */
export interface PaginatedParams extends CommonParams {
  /** 页码 */
  page?: number;
  /** 每页条数，默认 30 */
  pagesize?: number;
}

/** 通用错误响应体 */
export interface ErrorBody {
  /** 错误码 */
  code: number;
  /** 数据（通常为 null） */
  data: null;
  /** 错误消息 */
  msg: string;
}

// ============================================================
//  枚举 / 联合字面量类型
// ============================================================

/**
 * 音乐音质类型
 *
 * - `piano`：魔法音乐 - 钢琴
 * - `acappella`：魔法音乐 - 人声伴奏（返回 mkv 格式，含人声和伴奏两个音轨）
 * - `subwoofer`：魔法音乐 - 骨笛
 * - `ancient`：魔法音乐 - 尤克里里
 * - `surnay`：魔法音乐 - 唢呐
 * - `dj`：魔法音乐 - DJ
 * - `128`：128kbps MP3
 * - `320`：320kbps MP3
 * - `flac`：FLAC 无损
 * - `high`：无损格式
 * - `viper_atmos`：蝰蛇全景声
 * - `viper_clear`：蝰蛇超清音质
 * - `viper_tape`：蝰蛇母带（需转码）
 * - `super`：DSD 格式（支持极少）
 */
export type SongQuality =
  | 'piano'
  | 'acappella'
  | 'subwoofer'
  | 'ancient'
  | 'surnay'
  | 'dj'
  | '128'
  | '320'
  | 'flac'
  | 'high'
  | 'viper_atmos'
  | 'viper_clear'
  | 'viper_tape'
  | 'super';

/** 搜索类型 */
export type SearchType = 'song' | 'special' | 'lyric' | 'album' | 'author' | 'mv';

/** 歌词搜索是否返回多个 */
export type LyricMan = 'yes' | 'no';

/** 评论排序方向 */
export type CommentSort = 1 | 2;

/** 私人 FM 获取模式 */
export type FmMode = 'normal' | 'small' | 'peak';

/** 私人 FM 操作类型 */
export type FmAction = 'play' | 'garbage';

/** 私人 FM AI 推荐池 */
export type FmSongPoolId = 0 | 1 | 2;

/** 歌曲推荐 card_id（标准版） */
export type CardId = 1 | 2 | 3 | 4 | 5 | 6;

/** 歌曲推荐 card_id（概念版） */
export type YouthCardId = 3001 | 3004 | 3005 | 3006 | 3014 | 3101;

/** 新碟上架地区类型 */
export type AlbumType = 1 | 2 | 3 | 4;

/** 歌手性别类型 */
export type ArtistSexType = 0 | 1 | 2 | 3;

/** 歌手地区类型 */
export type ArtistRegionType = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** 歌手 MV 标签类型 */
export type ArtistVideoTag = 'official' | 'live' | 'fan' | 'artist' | 'all';

/** 歌手排序方式 */
export type ArtistSort = 'hot' | 'new';

/** 场景音乐讨论区排序 */
export type SceneSort = 'rec' | 'hot' | 'new';

/** 音频相关版本排序 */
export type AudioRelatedSort = 'all' | 'hot' | 'new';

/** 歌单操作类型：0 = 创建歌单，1 = 收藏歌单 */
export type PlaylistAddType = 0 | 1;

/** 曲谱类型 */
export type SheetOpernType = 0 | 1 | 2 | 3 | 98 | 99;

/** 曲谱合集 position */
export type SheetCollectionPosition = 2 | 3 | 4;

/** 平台设备类型 */
export type Platform = 'ios' | 'android';

/** 编辑精选数据类型 */
export type IpDataType = 'audios' | 'albums' | 'videos' | 'author_list';

/** 听歌历史类型：0 = 最近一周，1 = 全部累计 */
export type ListenType = 0 | 1;

/** 历史推荐模式 */
export type HistoryMode = 'list' | 'song';

/** 专辑信息可选字段 */
export type AlbumField =
  | 'trans_param'
  | 'special_tag'
  | 'authors'
  | 'album_name'
  | 'publish_date'
  | 'cover'
  | 'intro'
  | 'publish_company'
  | 'type'
  | 'album_id'
  | 'language_id'
  | 'is_publish'
  | 'heat'
  | 'grade'
  | 'quality'
  | 'exclusive'
  | 'grade_count'
  | 'author_name'
  | 'sizable_cover'
  | 'language'
  | 'category';

/** krm/audio 接口可选字段 */
export type KrmAudioField = 'album_info' | 'authors.base' | 'base' | 'audio_info' | 'authors.ip' | 'extra' | 'tags' | 'tagmap';

/** 关注歌手新歌排序：1 = 时间，2 = 亲密度 */
export type FollowNewSongsSort = 1 | 2;

/** 获取歌曲 MV 可选字段 */
export type MvField = 'mkv' | 'tags' | 'h264' | 'h265' | 'authors';

// ============================================================
//  请求参数类型 —— 登录与认证
// ============================================================

/** 手机号登录参数 */
export interface LoginCellphoneParams extends CommonParams {
  /** 手机号码（必选） */
  mobile: string;
  /** 验证码，通过 `/captcha/sent` 获取（必选） */
  code: string;
  /** 用户 id，当用户存在多个账户时必须指定 */
  userid?: string;
}

/** 用户名登录参数 */
export interface LoginParams extends CommonParams {
  /** 用户名（必选） */
  username: string;
  /** 密码（必选），建议使用 encodeURIComponent 编码或 POST 请求 */
  password: string;
}

/** 开放接口登录参数（目前仅支持微信） */
export interface LoginOpenplatParams extends CommonParams {
  /** 微信扫码成功后生成的 code（必选） */
  code: string;
}

/** 二维码 key 生成参数 */
export interface LoginQrKeyParams extends CommonParams {}

/** 二维码生成参数 */
export interface LoginQrCreateParams extends CommonParams {
  /** 由 `/login/qr/key` 生成的 key（必选） */
  key: string;
  /** 传入后会额外返回二维码图片 base64 编码 */
  qrimg?: string | boolean;
}

/** 二维码扫码状态检测参数 */
export interface LoginQrCheckParams extends CommonParams {
  /** 由 `/login/qr/key` 生成的 key（必选） */
  key: string;
}

/** 微信二维码生成参数 */
export interface LoginWxCreateParams extends CommonParams {}

/** 微信二维码扫码状态检测参数 */
export interface LoginWxCheckParams extends CommonParams {
  /** 由 `/login/wx/create` 生成的 uuid（必选） */
  uuid: string;
  /** 建议传递，避免缓存导致延迟 */
  timestamp?: number | string;
}

/** 刷新登录参数 */
export interface LoginTokenParams extends CommonParams {
  /** 登录后获取的 token */
  token?: string;
  /** 用户 id */
  userid?: string;
}

// ============================================================
//  请求参数类型 —— 验证码 & 设备
// ============================================================

/** 发送验证码参数 */
export interface CaptchaSentParams extends CommonParams {
  /** 手机号码（必选） */
  mobile: string;
}

/** dfid 获取参数 */
export interface RegisterDevParams extends CommonParams {}

/** 获取验证码信息参数 */
export interface GetVerifyInfoParams extends CommonParams {
  /** 验证事件 ID（必选） */
  eventid: string;
  /** 用户 id */
  userid?: string;
  /** 平台 id，默认 2 */
  platid?: number;
}

/** 提交验证码验证参数 */
export interface VerifyUserInfoParams extends CommonParams {
  /** 验证事件 ID（必选） */
  eventid: string;
  /** 验证类型：23 = 腾讯验证码，32 = 手机验证码 */
  v_type?: number;
  /** 验证码数据（必选） */
  verifycode: string;
  /** RSA 加密的 AES 密钥（从 get_verify_info 或 sidedt 获取） */
  sid?: string;
  /** AES 加密的行为数据（从 get_verify_info 或 sidedt 获取） */
  edt?: string;
  /** 用户 id */
  userid?: string;
  /** 平台 id，默认 2 */
  platid?: number;
}

/** 获取设备列表参数 */
export interface LoginDeviceParams extends CommonParams {
  /** 用户 id */
  userid?: string;
}

/** 登出指定设备参数 */
export interface LoginDeviceKickParams extends CommonParams {
  /** 用户 token */
  token?: string;
  /** 设备 mid */
  mid?: string;
}

/** 获取 sid/edt 参数 */
export interface SidedtParams extends CommonParams {
  /** 用户 id */
  userid?: string;
  /** 设备指纹 ID */
  dfid?: string;
  /** 设备 MID */
  mid?: string;
}

// ============================================================
//  请求参数类型 —— 用户信息
// ============================================================

/** 获取用户额外信息参数 */
export interface UserDetailParams extends CommonParams {}

/** 获取用户 VIP 信息参数 */
export interface UserVipDetailParams extends CommonParams {}

/** 获取用户歌单参数 */
export interface UserPlaylistParams extends PaginatedParams {}

/** 获取用户关注歌手参数 */
export interface UserFollowParams extends CommonParams {}

/** 获取关注歌手消息参数 */
export interface UserFollowMessageParams extends CommonParams {
  /** 歌手/用户的 userid（必选） */
  id: string;
  /** 每页页数，默认 30 */
  pagesize?: number;
}

/** 获取用户云盘参数 */
export interface UserCloudParams extends PaginatedParams {}

/** 获取用户云盘音乐 URL 参数 */
export interface UserCloudUrlParams extends CommonParams {
  /** 音乐 hash（必选） */
  hash: string;
  /** 专辑 id */
  album_id?: string;
  /** 云盘音乐名称 */
  name?: string;
  /** 专辑音频 id */
  album_audio_id?: string;
}

/** 获取用户收藏的视频参数 */
export interface UserVideoCollectParams extends PaginatedParams {}

/** 获取用户喜欢的视频参数 */
export interface UserVideoLoveParams extends CommonParams {
  /** 每页页数，默认 30 */
  pagesize?: number;
}

/** 获取用户听歌历史排行参数 */
export interface UserListenParams extends CommonParams {
  /**
   * 获取类型
   * - 0：最近一周前 120 首
   * - 1：全部累计前 120 首
   */
  type?: ListenType;
}

/** 获取用户最近听歌历史参数 */
export interface UserHistoryParams extends CommonParams {
  /** 基于上一次返回值传入，用于翻页 */
  bp?: string;
}

/** 获取继续播放信息参数 */
export interface LastestSongsListenParams extends CommonParams {
  /** 每页页数，默认 30 */
  pagesize?: number;
}

/** 获取用户动态参数 */
export interface YouthDynamicParams extends CommonParams {}

/** 听歌领取 VIP 参数 */
export interface YouthListenSongParams extends CommonParams {
  /** 专辑音乐 id (album_audio_id/MixSongID) */
  mixsongid?: number | string;
}

// ============================================================
//  请求参数类型 —— 歌单管理
// ============================================================

/** 收藏歌单 / 新建歌单参数 */
export interface PlaylistAddParams extends CommonParams {
  /** 歌单名称（必选） */
  name: string;
  /** 歌单创建者 userid（必选） */
  list_create_userid: string;
  /** 歌单 listid（必选） */
  list_create_listid: string;
  /** 是否设为隐私：0 = 公开，1 = 隐私（仅创建歌单时有效） */
  is_pri?: 0 | 1;
  /**
   * 操作类型
   * - 0：创建歌单（默认）
   * - 1：收藏歌单
   */
  type?: PlaylistAddType;
  /** 歌单 list_create_gid */
  list_create_gid?: string;
}

/** 取消收藏歌单 / 删除歌单参数 */
export interface PlaylistDelParams extends CommonParams {
  /** 用户歌单 listid（必选） */
  listid: string;
}

/** 对歌单添加歌曲参数 */
export interface PlaylistTracksAddParams extends CommonParams {
  /** 用户歌单 listid（必选） */
  listid: string;
  /**
   * 歌曲数据（必选）
   * 格式：`歌曲名称|歌曲hash|专辑id|(mixsongid/album_audio_id)`
   * 最少需要歌曲名称和歌曲 hash，多个以逗号分隔
   */
  data: string;
}

/** 对歌单删除歌曲参数 */
export interface PlaylistTracksDelParams extends CommonParams {
  /** 用户歌单 listid（必选） */
  listid: string;
  /** 歌单中歌曲的 fileid，多个以逗号分隔（必选） */
  fileids: string;
}

/** 获取歌单分类参数 */
export interface PlaylistTagsParams extends CommonParams {}

/** 获取歌单列表参数 */
export interface TopPlaylistParams extends CommonParams {
  /**
   * 分类 tag（必选）
   * - 0：推荐
   * - 11292：HI-RES
   * - 其他值从 `/playlist/tags` 接口获取
   */
  category_id: number;
  /** 是否返回歌曲列表（不全）：0 = 不返回，1 = 返回 */
  withsong?: 0 | 1;
  /** 是否返回歌单分类：0 = 不返回，1 = 返回 */
  withtag?: 0 | 1;
}

/** 获取主题歌单参数 */
export interface ThemePlaylistParams extends CommonParams {}

/** 获取音效歌单参数 */
export interface PlaylistEffectParams extends PaginatedParams {}

/** 获取歌单详情参数 */
export interface PlaylistDetailParams extends CommonParams {
  /** 歌单 global_collection_id，多个以逗号分隔（必选） */
  ids: string;
}

/** 获取歌单所有歌曲参数 */
export interface PlaylistTrackAllParams extends PaginatedParams {
  /** 歌单 global_collection_id（必选） */
  id: string;
}

/** 获取歌单所有歌曲（新版）参数 */
export interface PlaylistTrackAllNewParams extends PaginatedParams {
  /** 歌单 listid（必选） */
  listid: string;
}

/** 获取相似歌单参数 */
export interface PlaylistSimilarParams extends CommonParams {
  /** 歌单 global_collection_id，多个以逗号分隔（必选） */
  ids: string;
}

// ============================================================
//  请求参数类型 —— 专辑
// ============================================================

/** 新碟上架参数 */
export interface TopAlbumParams extends PaginatedParams {
  /** 地区类型：1 = 华语，2 = 欧美，3 = 日本，4 = 韩国，默认为空 */
  type?: AlbumType;
}

/** 专辑信息参数 */
export interface AlbumParams extends CommonParams {
  /** 专辑 id，多个以逗号分隔（必选） */
  album_id: string;
  /** 需要返回的字段，多个以逗号分隔 */
  fields?: string;
}

/** 专辑详情参数 */
export interface AlbumDetailParams extends CommonParams {
  /** 专辑 id（必选） */
  id: string;
}

/** 专辑音乐列表参数 */
export interface AlbumSongsParams extends PaginatedParams {
  /** 专辑 id（必选） */
  id: string;
}

/** 唱片店参数 */
export interface AlbumShopParams extends CommonParams {}

// ============================================================
//  请求参数类型 —— 音乐 / 歌曲
// ============================================================

/** 获取音乐 URL 参数 */
export interface SongUrlParams extends CommonParams {
  /** 音乐 hash（必选） */
  hash: string;
  /** 专辑 id */
  album_id?: string;
  /** 是否返回试听部分（仅部分歌曲） */
  free_part?: boolean | string;
  /** 专辑音频 id */
  album_audio_id?: string;
  /** 音质类型 */
  quality?: SongQuality;
}

/** 获取音乐 URL（新版）参数 */
export interface SongUrlNewParams extends CommonParams {
  /** 音乐 hash（必选） */
  hash: string;
  /** 专辑音频 id */
  album_audio_id?: string;
  /** 是否返回试听部分（仅部分歌曲） */
  free_part?: boolean | string;
}

/** 获取歌曲高潮部分参数 */
export interface SongClimaxParams extends CommonParams {
  /** 音乐 hash，多个以逗号分隔（必选） */
  hash: string;
}

/** 获取音乐相关信息参数 */
export interface AudioParams extends CommonParams {
  /** 歌曲 hash，多个以逗号分隔（必选） */
  hash: string;
}

/** 获取更多音乐版本参数 */
export interface AudioRelatedParams extends CommonParams {
  /** 音乐的 mixsongid / album_audio_id（必选） */
  album_audio_id: string;
  /** 页码 */
  page?: number;
  /** 每页条数，默认 30 */
  pagesize?: number;
  /** 是否返回分类 */
  show_type?: boolean | string;
  /** 排序：all / hot / new */
  sort?: AudioRelatedSort;
  /** 分类 */
  type?: string;
  /**
   * 是否返回详情
   * - 0：只返回总数
   * - 不传或其他值：返回详情
   */
  show_detail?: 0 | 1;
}

/** 获取音乐伴奏信息参数 */
export interface AudioAccompanyMatchingParams extends CommonParams {
  /** 音乐 hash（必选） */
  hash: string;
  /** 音乐文件名（必选） */
  fileName: string;
  /** 音乐的 mixsongid / album_audio_id（必选） */
  mixid: string;
}

/** 获取音乐 K 歌数量参数 */
export interface AudioKtvTotalParams extends CommonParams {
  /** 音乐 songid，从 `/audio/accompany/matching` 获取（必选） */
  songId: string;
  /** 歌手名称，多个以 `、` 隔开（必选） */
  singerName: string;
  /** 音乐 hash，从 `/audio/accompany/matching` 获取（必选） */
  songHash: string;
}

/** 获取音乐详情参数 */
export interface PrivilegeLiteParams extends CommonParams {
  /** 歌曲 hash，多个以逗号分隔（必选） */
  hash: string;
}

/** 获取音乐专辑/歌手信息参数 */
export interface KrmAudioParams extends CommonParams {
  /** 专辑音乐 id (album_audio_id/MixSongID)，多个以逗号分隔（必选） */
  album_audio_id: string;
  /** 返回字段，多个以逗号分隔 */
  fields?: string;
}

// ============================================================
//  请求参数类型 —— 搜索
// ============================================================

/** 搜索参数 */
export interface SearchParams extends CommonParams {
  /** 搜索关键词（必选） */
  keywords: string;
  /** 页码 */
  page?: number;
  /** 每页条数，默认 30 */
  pagesize?: number;
  /** 搜索类型，默认为单曲 */
  type?: SearchType;
}

/** 默认搜索关键词参数 */
export interface SearchDefaultParams extends CommonParams {}

/** 综合搜索参数 */
export interface SearchComplexParams extends PaginatedParams {
  /** 搜索关键词（必选） */
  keywords: string;
}

/** 热搜列表参数 */
export interface SearchHotParams extends CommonParams {}

/** 搜索建议参数 */
export interface SearchSuggestParams extends CommonParams {
  /** 搜索关键词（必选） */
  keywords: string;
  /** 专辑返回数量 */
  albumTipCount?: number;
  /** 歌单返回数量（推测） */
  correctTipCount?: number;
  /** MV 返回数量 */
  mvTipCount?: number;
  /** 音乐返回数量 */
  musicTipCount?: number;
}

/** 歌词搜索参数 */
export interface SearchLyricParams extends CommonParams {
  /** 搜索关键词，与 hash 二选一（必选） */
  keywords?: string;
  /** 歌曲 hash，与 keywords 二选一（必选） */
  hash?: string;
  /** 专辑音乐 id */
  album_audio_id?: string;
  /** 歌曲时长 */
  duration?: number | string;
  /** 是否返回多个歌词：yes = 多个，no = 一个（默认） */
  man?: LyricMan;
}

/** 获取歌词参数 */
export interface LyricParams extends CommonParams {
  /** 歌词 id，从 `/search/lyric` 接口获取（必选） */
  id: string;
  /** 歌词 accesskey，从 `/search/lyric` 接口获取（必选） */
  accesskey: string;
  /** 歌词类型：lrc = 普通歌词，krc = 逐字歌词 */
  fmt?: 'lrc' | 'krc';
  /** 是否解码，传入后返回解码后的歌词 */
  decode?: boolean | string;
}

/** 混合搜索参数 */
export interface SearchMixedParams extends CommonParams {
  /** 搜索关键词（必选） */
  keyword: string;
}

// ============================================================
//  请求参数类型 —— 主题音乐
// ============================================================

/** 获取主题歌单所有歌曲参数 */
export interface ThemePlaylistTrackParams extends CommonParams {
  /** 主题歌单 id（必选） */
  theme_id: string;
}

/** 获取主题音乐参数 */
export interface ThemeMusicParams extends CommonParams {}

/** 获取主题音乐详情参数 */
export interface ThemeMusicDetailParams extends CommonParams {
  /** 主题音乐 id（必选） */
  id: string;
}

// ============================================================
//  请求参数类型 —— 歌曲推荐
// ============================================================

/** 歌曲推荐参数（标准版） */
export interface TopCardParams extends CommonParams {
  /**
   * 推荐类型（必选）
   * - 1：精选好歌随心听 / 私人专属好歌
   * - 2：经典怀旧金曲
   * - 3：热门好歌精选
   * - 4：小众宝藏佳作
   * - 5：未知
   * - 6：VIP 专属推荐
   */
  card_id: CardId;
}

/** 歌曲推荐参数（概念版） */
export interface TopCardYouthParams extends CommonParams {
  /**
   * 推荐类型（必选）
   * - 3001：私人专属好歌
   * - 3004：小众宝藏佳作
   * - 3005：潮流尝鲜
   * - 3006：VIP 专属推荐
   * - 3014：喜欢这首歌的 TA 也喜欢
   * - 3101：概念 er 新推
   */
  card_id: YouthCardId;
  /** 每页条数，默认 30 */
  pagesize?: number;
}

/** 曲风盲盒参数（概念版） */
export interface TopTagCardYouthParams extends CommonParams {}

// ============================================================
//  请求参数类型 —— 图片
// ============================================================

/** 获取歌手和专辑图片参数 */
export interface ImagesParams extends CommonParams {
  /** 歌曲 hash，多个以逗号分隔（必选） */
  hash: string;
  /** 专辑 id，多个以逗号分隔 */
  album_id?: string;
  /** 专辑音乐 id，多个以逗号分隔 */
  album_audio_id?: string;
  /** 最多返回图片数量，默认 5 */
  count?: number;
}

/** 获取歌手图片参数 */
export interface ImagesAudioParams extends CommonParams {
  /** 歌曲 hash，多个以逗号分隔（必选） */
  hash: string;
  /** 音乐 id，多个以逗号分隔 */
  audio_id?: string;
  /** 专辑音乐 id，多个以逗号分隔 */
  album_audio_id?: string;
  /** 音乐文件名，多个以逗号分隔 */
  filename?: string;
  /** 最多返回图片数量，默认 5 */
  count?: number;
}

// ============================================================
//  请求参数类型 —— 私人 FM
// ============================================================

/** 私人 FM 参数 */
export interface PersonalFmParams extends CommonParams {
  /** 音乐 hash（建议传入） */
  hash?: string;
  /** 音乐 songid（建议传入） */
  songid?: string;
  /** 已播放时间（建议传入） */
  playtime?: number | string;
  /**
   * 获取模式，默认 normal
   * - normal：发现
   * - small：小众
   * - peak：30s
   */
  mode?: FmMode;
  /**
   * 操作类型，默认 play
   * - play：播放
   * - garbage：不喜欢
   */
  action?: FmAction;
  /**
   * AI 推荐池
   * - 0：Alpha 根据口味推荐
   * - 1：Beta 根据风格推荐
   * - 2：Gamma
   */
  song_pool_id?: FmSongPoolId;
  /** 是否已播放完成 */
  is_overplay?: boolean | string;
  /** 剩余未播放歌曲数，默认 0，大于 4 不返回推荐歌曲（建议传入） */
  remain_songcnt?: number;
}

// ============================================================
//  请求参数类型 —— Banner / 乐库
// ============================================================

/** Banner 轮播图参数 */
export interface PcDiantaiParams extends CommonParams {}

/** 乐库 Banner 参数 */
export interface YuekuBannerParams extends CommonParams {}

/** 乐库电台参数 */
export interface YuekuFmParams extends CommonParams {}

/** 乐库参数 */
export interface YuekuParams extends CommonParams {}

// ============================================================
//  请求参数类型 —— 电台
// ============================================================

/** 电台分类参数 */
export interface FmClassParams extends CommonParams {}

/** 推荐电台参数 */
export interface FmRecommendParams extends CommonParams {}

/** 电台图片参数 */
export interface FmImageParams extends CommonParams {
  /** fmid，多个以逗号分隔（必选） */
  fmid: string;
}

/** 电台音乐列表参数 */
export interface FmSongsParams extends CommonParams {
  /** fmid，多个以逗号分隔（必选） */
  fmid: string;
  /** fmtype，多个以逗号分隔 */
  fmtype?: string;
  /** 歌曲偏移，多个以逗号分隔 */
  fmoffset?: string;
  /** 歌曲列表大小，多个以逗号分隔 */
  fmsize?: string;
}

// ============================================================
//  请求参数类型 —— 编辑精选
// ============================================================

/** 编辑精选参数 */
export interface TopIpParams extends CommonParams {}

/** 编辑精选数据参数 */
export interface IpParams extends PaginatedParams {
  /** ip id（必选） */
  id: string;
  /** 数据类型 */
  type?: IpDataType;
}

/** 编辑精选详情参数 */
export interface IpDateilParams extends CommonParams {
  /** ip id，多个以逗号分隔（必选） */
  id: string;
}

/** 编辑精选歌单参数 */
export interface IpPlaylistParams extends PaginatedParams {
  /** ip id（必选） */
  id: string;
}

/** 编辑精选专区参数 */
export interface IpZoneParams extends CommonParams {}

/** 编辑精选专区详情参数 */
export interface IpZoneHomeParams extends CommonParams {
  /** ip id（必选） */
  id: string;
}

// ============================================================
//  请求参数类型 —— VIP 相关（仅限概念版）
// ============================================================

/** 领取 VIP 参数 */
export interface YouthVipParams extends CommonParams {}

/** 领取一天 VIP 参数 */
export interface YouthDayVipParams extends CommonParams {
  /** 领取 VIP 日期，格式：YYYY-MM-DD（必选） */
  receive_day: string;
}

/** 升级概念版 VIP 参数 */
export interface YouthDayVipUpgradeParams extends CommonParams {}

/** 获取当月已领取 VIP 天数参数 */
export interface YouthMonthVipRecordParams extends CommonParams {}

/** 获取已领取 VIP 状态参数 */
export interface YouthUnionVipParams extends CommonParams {}

// ============================================================
//  请求参数类型 —— 歌手
// ============================================================

/** 获取歌手列表参数 */
export interface ArtistListsParams extends CommonParams {
  /**
   * 性别类型
   * - 0：全部
   * - 1：男
   * - 2：女
   * - 3：组合
   */
  sextypes?: ArtistSexType;
  /**
   * 地区类型
   * - 0：全部
   * - 1：华语
   * - 2：欧美
   * - 3：日韩
   * - 4：其他
   * - 5：日本
   * - 6：韩国
   */
  type?: ArtistRegionType;
  /** 3 = 音乐人，0 = 默认 */
  musician?: 0 | 3;
  /** 返回热门数量，默认 30 */
  hotsize?: number;
}

/** 获取歌手详情参数 */
export interface ArtistDetailParams extends CommonParams {
  /** 歌手 id（必选） */
  id: string;
}

/** 获取歌手专辑参数 */
export interface ArtistAlbumsParams extends PaginatedParams {
  /** 歌手 id（必选） */
  id: string;
  /** 排序：hot = 热门，new = 最新 */
  sort?: ArtistSort;
}

/** 获取歌手单曲参数 */
export interface ArtistAudiosParams extends PaginatedParams {
  /** 歌手 id（必选） */
  id: string;
  /** 排序：hot = 热门，new = 最新 */
  sort?: ArtistSort;
}

/** 获取歌手 MV 参数 */
export interface ArtistVideosParams extends PaginatedParams {
  /** 歌手 id（必选） */
  id: string;
  /** MV 标签筛选，默认获取全部 */
  tag?: ArtistVideoTag;
}

/** 关注歌手参数 */
export interface ArtistFollowParams extends CommonParams {
  /** 歌手 id（必选） */
  id: string;
}

/** 取消关注歌手参数 */
export interface ArtistUnfollowParams extends CommonParams {
  /** 歌手 id（必选） */
  id: string;
}

/** 获取关注歌手新歌参数 */
export interface ArtistFollowNewsongsParams extends CommonParams {
  /** 最后专辑 id */
  last_album_id?: string;
  /** 每页条数，默认 30 */
  pagesize?: number;
  /** 排序：1 = 时间（默认），2 = 亲密度 */
  opt_sort?: FollowNewSongsSort;
}

/** 获取歌手荣誉详情参数 */
export interface ArtistHonourParams extends PaginatedParams {
  /** 歌手 id（必选） */
  id: string;
}

/** 获取歌手列表（新版）参数 */
export interface SingerListParams extends CommonParams {
  /** 性别类型：0 = 全部，1 = 男，2 = 女 */
  sextype?: number;
  /** 地区类型：0 = 全部，1 = 华语，2 = 欧美，3 = 日韩，4 = 其他 */
  type?: number;
  /** 返回热门数量，默认 200 */
  hotsize?: number;
}

// ============================================================
//  请求参数类型 —— 视频
// ============================================================

/** 获取视频 URL 参数 */
export interface VideoUrlParams extends CommonParams {
  /** 视频 hash（必选） */
  hash: string;
}

/** 获取歌曲 MV 参数 */
export interface KmrAudioMvParams extends CommonParams {
  /** 专辑音乐 id (album_audio_id/MixSongID)，多个以逗号分隔（必选） */
  album_audio_id: string;
  /** 返回字段，多个以逗号分隔 */
  fields?: string;
}

/** 获取视频相关信息参数 */
export interface VideoPrivilegeParams extends CommonParams {
  /** 视频 hash，多个以逗号分隔（必选） */
  hash: string;
}

/** 获取视频详情参数 */
export interface VideoDetailParams extends CommonParams {
  /** 视频 id / video id（必选） */
  id: string;
}

// ============================================================
//  请求参数类型 —— 新歌速递
// ============================================================

/** 新歌速递参数 */
export interface TopSongParams extends CommonParams {}

// ============================================================
//  请求参数类型 —— 场景音乐
// ============================================================

/** 场景音乐列表参数 */
export interface SceneListsParams extends CommonParams {}

/** 场景音乐详情参数 */
export interface SceneModuleParams extends CommonParams {
  /** 场景音乐 scene_id（必选） */
  id: string;
}

/** 场景音乐讨论区参数 */
export interface SceneListV2Params extends PaginatedParams {
  /** 场景音乐 scene_id（必选） */
  id: string;
  /** 排序：rec = 推荐，hot = 热门，new = 最新（默认推荐） */
  sort?: SceneSort;
}

/** 场景音乐模块 Tag 参数 */
export interface SceneModuleInfoParams extends CommonParams {
  /** 场景音乐 scene_id（必选） */
  id: string;
  /** 场景音乐 module_id（必选） */
  module_id: string;
}

/** 场景音乐歌单列表参数 */
export interface SceneCollectionListParams extends PaginatedParams {
  /** 场景音乐 tag_id（必选） */
  tag_id: string;
}

/** 场景音乐视频列表参数 */
export interface SceneVideoListParams extends PaginatedParams {
  /** 场景音乐视频 tag_id（必选） */
  tag_id: string;
}

/** 场景音乐音乐列表参数 */
export interface SceneAudioListParams extends PaginatedParams {
  /** 场景音乐 scene_id（必选） */
  id: string;
  /** 场景音乐 module_id（必选） */
  module_id: string;
  /** 场景音乐 tag_id（必选） */
  tag: string;
}

/** 场景音乐推荐参数 */
export interface SceneMusicParams extends PaginatedParams {
  /** 场景音乐 scene_id（必选） */
  id: string;
}

// ============================================================
//  请求参数类型 —— 推荐
// ============================================================

/** 每日推荐参数 */
export interface EverydayRecommendParams extends CommonParams {
  /** 设备类型，默认 ios */
  platform?: Platform;
}

/** 历史推荐参数 */
export interface EverydayHistoryParams extends CommonParams {
  /**
   * 模式
   * - list：返回历史推荐列表
   * - song：返回当前歌曲列表
   */
  mode?: HistoryMode;
  /** 当 mode = song 时必选 */
  history_name?: string;
  /** 当 mode = song 时必选 */
  date?: string;
  /** 设备类型，默认 ios */
  platform?: Platform;
}

/** 风格推荐参数 */
export interface EverydayStyleRecommendParams extends CommonParams {
  /** 设备类型，默认 ios */
  platform?: Platform;
  /** 风格标签 id，多个以逗号分隔 */
  tagids?: string;
}

/** 每日推荐歌曲参数 */
export interface RecommendSongsParams extends CommonParams {
  /** 设备类型，默认 android */
  platform?: Platform;
  /** 用户 id */
  userid?: string;
}

/** 好友推荐参数 */
export interface EverydayFriendParams extends CommonParams {}

// ============================================================
//  请求参数类型 —— 排行榜
// ============================================================

/** 排行列表参数 */
export interface RankListParams extends CommonParams {
  /** 是否返回歌曲（部分） */
  withsong?: boolean | string | number;
}

/** 排行榜推荐列表参数 */
export interface RankTopParams extends CommonParams {}

/** 排行榜往期列表参数 */
export interface RankVolParams extends CommonParams {
  /** 排行榜 id（必选） */
  rankid: string;
  /** 排行榜 cid */
  rank_cid?: string;
}

/** 排行榜信息参数 */
export interface RankInfoParams extends CommonParams {
  /** 排行榜 id（必选） */
  rankid: string;
  /** 排行榜 cid */
  rank_cid?: string;
  /** 是否返回专辑图片：1 = 返回，0 = 不返回（默认返回） */
  album_img?: 0 | 1;
  /** 排行榜 zone */
  zone?: string;
}

/** 排行榜歌曲列表参数 */
export interface RankAudioParams extends PaginatedParams {
  /** 排行榜 id（必选） */
  rankid: string;
  /** 排行榜 cid，需要返回往期歌曲时必填（从 `/rank/vol` 的 volid 获取） */
  rank_cid?: string;
}

// ============================================================
//  请求参数类型 —— 评论
// ============================================================

/** 歌曲收藏数参数 */
export interface FavoriteCountParams extends CommonParams {
  /** 音乐 mixsongid，多个以逗号分隔（必选） */
  mixsongids: string;
}

/** 歌曲评论数参数 */
export interface CommentCountParams extends CommonParams {
  /** 音乐 hash（与 special_id 二选一） */
  hash?: string;
  /** 评论 special_child_id（与 hash 二选一） */
  special_id?: string;
}

/** 歌曲评论参数 */
export interface CommentMusicParams extends PaginatedParams {
  /** 音乐 mixsongid（必选） */
  mixsongid: string;
  /** 是否返回分类列表：0 = 不返回，1 = 返回 */
  show_classify?: 0 | 1;
  /** 是否返回热词：0 = 不返回，1 = 返回 */
  show_hotword_list?: 0 | 1;
}

/** 歌曲评论 - 根据分类返回参数 */
export interface CommentMusicClassifyParams extends PaginatedParams {
  /** 音乐 mixsongid（必选） */
  mixsongid: string;
  /** 分类 id（必选） */
  type_id: string;
  /** 排序：1 = 正序，2 = 倒序 */
  sort?: CommentSort;
}

/** 歌曲评论 - 根据热词返回参数 */
export interface CommentMusicHotwordParams extends PaginatedParams {
  /** 音乐 mixsongid（必选） */
  mixsongid: string;
  /** 热词（必选） */
  hot_word: string;
}

/** 楼层评论参数 */
export interface CommentFloorParams extends PaginatedParams {
  /** 评论 special_child_id（必选） */
  special_id: string;
  /** 歌曲 mixsongid（必选） */
  mixsongid: string;
  /** 评论 id（必选） */
  tid: string;
}

/** 歌单评论参数 */
export interface CommentPlaylistParams extends PaginatedParams {
  /** 歌单 global_collection_id（必选） */
  id: string;
  /** 是否返回分类列表：0 = 不返回，1 = 返回 */
  show_classify?: 0 | 1;
  /** 是否返回热词：0 = 不返回，1 = 返回 */
  show_hotword_list?: 0 | 1;
}

/** 专辑评论参数 */
export interface CommentAlbumParams extends PaginatedParams {
  /** 专辑 id（必选） */
  id: string;
  /** 是否返回分类列表：0 = 不返回，1 = 返回 */
  show_classify?: 0 | 1;
  /** 是否返回热词：0 = 不返回，1 = 返回 */
  show_hotword_list?: 0 | 1;
}

// ============================================================
//  请求参数类型 —— 曲谱
// ============================================================

/** 歌曲曲谱参数 */
export interface SheetListParams extends PaginatedParams {
  /** 音乐的 mixsongid / album_audio_id（必选） */
  album_audio_id: string;
  /**
   * 曲谱类型
   * - 0：全部
   * - 1：钢琴
   * - 2：吉他
   * - 3：鼓
   * - 98：简谱
   * - 99：其他
   */
  opern_type?: SheetOpernType;
}

/** 曲谱详情参数 */
export interface SheetDetailParams extends CommonParams {
  /** 曲谱 id（必选） */
  id: string;
  /** 曲谱 source（必选） */
  source: string;
}

/** 推荐曲谱参数 */
export interface SheetHotParams extends CommonParams {
  /** 曲谱类型 */
  opern_type?: SheetOpernType;
}

/** 曲谱合集参数（含合集详情） */
export interface SheetCollectionParams extends PaginatedParams {
  /**
   * position 类型
   * - 2：精选谱单
   * - 3：音乐教材
   * - 4：古典钢琴
   */
  position?: SheetCollectionPosition;
  /** 合集 id（获取合集详情时传入） */
  collection_id?: string;
}

/**
 * 曲谱推荐参数
 *
 * instruments 乐器类型：
 * - 1：吉他（opern_level: 0=中级, 1=进阶, 2=基础）
 * - 2：尤克里里（opern_level: 0=基础, 1=进阶）
 * - 3：钢琴（opern_level: 0=基础, 1=进阶）
 * - 4：简谱（opern_level: 0=基础）
 */
export interface SheetExploreParams extends PaginatedParams {
  /** 乐器类型，默认 1 */
  instruments?: number;
  /** 难度等级，默认 0 */
  level?: number;
  /** 标签 id */
  tagid?: number;
}

/**
 * 曲谱排行榜参数
 *
 * instruments 乐器类型同 SheetExploreParams
 */
export interface SheetRankParams extends PaginatedParams {
  /** 乐器类型，默认 1 */
  instruments?: number;
  /** 难度等级，默认 0 */
  level?: number;
  /** 标签 id */
  tagid?: number;
}

/** 曲谱歌曲详情参数 */
export interface SheetSongParams extends CommonParams {
  /** 专辑音乐 id (album_audio_id/MixSongID)（必选） */
  album_audio_id: string;
  /** 乐器类型，默认 1 */
  instruments?: number;
  /** 难度等级，默认 0 */
  level?: number;
}

/** 获取曲谱标签参数 */
export interface SheetTagsParams extends CommonParams {}

// ============================================================
//  请求参数类型 —— 听歌历史 & 服务器
// ============================================================

/** 提交听歌历史参数 */
export interface PlayhistoryUploadParams extends CommonParams {
  /** 专辑音乐 id (album_audio_id/MixSongID)（必选） */
  mxid: string;
  /** 当前时间戳（秒级，非毫秒），也可从 `/server/now` 获取 */
  ot?: number | string;
  /** 当前播放次数，服务器值大于传入值时维持最大值，否则更新 */
  pc?: number;
}

/** 获取服务器时间参数 */
export interface ServerNowParams extends CommonParams {}

// ============================================================
//  请求参数类型 —— 刷刷 & AI
// ============================================================

/** 刷刷参数 */
export interface BrushParams extends CommonParams {}

/** AI 推荐参数 */
export interface AiRecommendParams extends CommonParams {
  /** 专辑音乐 id (album_audio_id/MixSongID)，多个以逗号分隔（必选） */
  album_audio_id: string;
}

// ============================================================
//  请求参数类型 —— 频道
// ============================================================

/** 获取用户所有频道参数 */
export interface YouthChannelAllParams extends PaginatedParams {}

/** 频道详情参数 */
export interface YouthChannelDetailParams extends CommonParams {
  /** 频道 id (global_collection_id/channel_id)，多个以逗号分隔（必选） */
  global_collection_id: string;
}

/** 频道安利参数 */
export interface YouthChannelAmwayParams extends CommonParams {
  /** 频道 id (global_collection_id/channel_id)（必选） */
  global_collection_id: string;
}

/** 相似频道参数 */
export interface YouthChannelSimilarParams extends CommonParams {
  /** 频道 id (global_collection_id/channel_id)（必选） */
  channel_id: string;
}

/** 频道订阅参数 */
export interface YouthChannelSubParams extends CommonParams {
  /** 频道 id (global_collection_id/channel_id)（必选） */
  global_collection_id: string;
  /** 1 = 订阅，0 = 取消订阅，默认订阅 */
  t?: 0 | 1;
}

/** 频道音乐故事参数 */
export interface YouthChannelSongParams extends PaginatedParams {
  /** 频道 id (global_collection_id/channel_id)（必选） */
  global_collection_id: string;
}

/** 频道音乐故事详情参数 */
export interface YouthChannelSongDetailParams extends CommonParams {
  /** 频道 id (global_collection_id/channel_id)（必选） */
  global_collection_id: string;
  /** 音乐故事 fileid（必选） */
  fileid: string;
}

/** 动态 - 最常访问参数 */
export interface YouthDynamicRecentParams extends CommonParams {}

// ============================================================
//  请求参数类型 —— 用户公开音乐
// ============================================================

/** 获取用户公开的音乐参数 */
export interface YouthUserSongParams extends PaginatedParams {
  /** 用户 id（必选） */
  userid: string;
}

// ============================================================
//  请求参数类型 —— 听书
// ============================================================

/** 听书 - 每日推荐参数 */
export interface LongaudioDailyRecommendParams extends PaginatedParams {}

/** 听书 - 排行榜推荐参数 */
export interface LongaudioRankRecommendParams extends CommonParams {}

/** 听书 - VIP 推荐参数 */
export interface LongaudioVipRecommendParams extends CommonParams {}

/** 听书 - 每周推荐参数 */
export interface LongaudioWeekRecommendParams extends CommonParams {}

/** 听书 - 专辑详情参数 */
export interface LongaudioAlbumDetailParams extends CommonParams {
  /** 专辑 id，多个以逗号分隔（必选） */
  album_id: string;
}

/** 听书 - 专辑音乐列表参数 */
export interface LongaudioAlbumAudiosParams extends CommonParams {
  /** 专辑 id，多个以逗号分隔（必选） */
  album_id: string;
}

// ============================================================
//  请求参数类型 —— 歌曲成绩单
// ============================================================

/** 歌曲成绩单参数 */
export interface SongRankingParams extends CommonParams {
  /** 专辑音乐 id (album_audio_id/MixSongID)（必选） */
  album_audio_id: string;
}

/** 歌曲成绩单详情参数 */
export interface SongRankingFilterParams extends PaginatedParams {
  /** 专辑音乐 id (album_audio_id/MixSongID)（必选） */
  album_audio_id: string;
}

// ============================================================
//  服务器 & 工具类型
// ============================================================

/** Express 应用扩展，附带底层 HTTP Server 引用 */
export interface ServerExtension {
  /** 底层 HTTP Server 实例 */
  service?: import('http').Server;
}

/** 模块定义结构 */
export interface ModuleDefinition {
  /** 模块标识符（文件名去 .js 后缀） */
  identifier?: string;
  /** Express 路由路径 */
  route: string;
  /** 模块导出内容或文件路径 */
  module: any;
}

/** 请求配置对象（传递给 createRequest） */
export interface RequestConfig {
  /** 客户端 IP */
  ip?: string;
  [key: string]: any;
}

// ============================================================
//  导出函数 —— 登录与认证
// ============================================================

/**
 * 手机号验证码登录
 * @route /login/cellphone
 */
export function login_cellphone(params: LoginCellphoneParams): Promise<ApiResponse>;

/**
 * 用户名密码登录（可能需要验证，不推荐使用）
 * @route /login
 */
export function login(params: LoginParams): Promise<ApiResponse>;

/**
 * 开放接口登录（目前仅支持微信）
 * @route /login/openplat
 */
export function login_openplat(params: LoginOpenplatParams): Promise<ApiResponse>;

/**
 * 二维码登录 - 生成 key
 * @route /login/qr/key
 */
export function login_qr_key(params?: LoginQrKeyParams): Promise<ApiResponse>;

/**
 * 二维码登录 - 生成二维码
 * @route /login/qr/create
 */
export function login_qr_create(params: LoginQrCreateParams): Promise<ApiResponse>;

/**
 * 二维码登录 - 检测扫码状态
 * - 0: 二维码过期
 * - 1: 等待扫码
 * - 2: 待确认
 * - 4: 授权登录成功（返回 token）
 * @route /login/qr/check
 */
export function login_qr_check(params: LoginQrCheckParams): Promise<ApiResponse>;

/**
 * 微信登录 - 生成二维码
 * @route /login/wx/create
 */
export function login_wx_create(params?: LoginWxCreateParams): Promise<ApiResponse>;

/**
 * 微信登录 - 检测扫码状态
 * - 408: 等待扫描
 * - 404: 已扫描
 * - 403: 拒绝登录
 * - 405: 登录成功（返回 wx_code）
 * - 402: 已过期
 * @route /login/wx/check
 */
export function login_wx_check(params: LoginWxCheckParams): Promise<ApiResponse>;

/**
 * 刷新登录状态，延长 token 过期时间
 * @route /login/token
 */
export function login_token(params?: LoginTokenParams): Promise<ApiResponse>;

/**
 * 获取用户设备列表（需登录）
 * @route /v2/get_dev
 */
export function login_device(params?: LoginDeviceParams): Promise<ApiResponse>;

/**
 * 登出指定设备（需登录）
 * @route /loginservice/v1/dev_logout
 */
export function login_device_kick(params?: LoginDeviceKickParams): Promise<ApiResponse>;

// ============================================================
//  导出函数 —— 验证码 & 设备
// ============================================================

/**
 * 发送手机验证码
 * @route /captcha/sent
 */
export function captcha_sent(params: CaptchaSentParams): Promise<ApiResponse>;

/**
 * 获取 dfid（设备标识），获取音乐 URL 前需先调用此接口
 * @route /register/dev
 */
export function register_dev(params?: RegisterDevParams): Promise<ApiResponse>;

/**
 * 获取验证码信息（登录触发二次验证时调用）
 * @route /verifyservice/v3/get_verify_info
 */
export function get_verify_info(params: GetVerifyInfoParams): Promise<ApiResponse>;

/**
 * 提交验证码验证（腾讯验证码/手机验证码）
 * @route /verifyservice/v4/verify_user_info
 */
export function verify_user_info(params: VerifyUserInfoParams): Promise<ApiResponse>;

/**
 * 生成 sid/edt 并提交验证（内部调用 generateSimulate + verify_user_info）
 * @route /verifyservice/v4/verify_user_info
 */
export function sidedt(params?: SidedtParams): Promise<ApiResponse>;

// ============================================================
//  导出函数 —— 用户信息
// ============================================================

/**
 * 获取用户额外信息（需登录）
 * @route /user/detail
 */
export function user_detail(params?: UserDetailParams): Promise<ApiResponse>;

/**
 * 获取用户 VIP 信息（需登录）
 * @route /user/vip/detail
 */
export function user_vip_detail(params?: UserVipDetailParams): Promise<ApiResponse>;

/**
 * 获取用户所有创建及收藏的歌单（需登录）
 * @route /user/playlist
 */
export function user_playlist(params?: UserPlaylistParams): Promise<ApiResponse>;

/**
 * 获取用户所有关注的歌手/用户（需登录）
 * @route /user/follow
 */
export function user_follow(params?: UserFollowParams): Promise<ApiResponse>;

/**
 * 获取关注歌手/用户消息（需登录）
 * @route /user/follow/message
 */
export function user_follow_message(params: UserFollowMessageParams): Promise<ApiResponse>;

/**
 * 获取用户云盘音乐（需登录）
 * @route /user/cloud
 */
export function user_cloud(params?: UserCloudParams): Promise<ApiResponse>;

/**
 * 获取用户云盘音乐 URL（需登录，目前文件大小约 10M）
 * @route /user/cloud/url
 */
export function user_cloud_url(params: UserCloudUrlParams): Promise<ApiResponse>;

/**
 * 获取用户收藏的视频（需登录）
 * @route /user/video/collect
 */
export function user_video_collect(params?: UserVideoCollectParams): Promise<ApiResponse>;

/**
 * 获取用户喜欢的视频（需登录）
 * @route /user/video/love
 */
export function user_video_love(params?: UserVideoLoveParams): Promise<ApiResponse>;

/**
 * 获取用户听歌历史排行（需登录）
 * @route /user/listen
 */
export function user_listen(params?: UserListenParams): Promise<ApiResponse>;

/**
 * 获取用户最近听歌历史（需登录）
 * @route /user/history
 */
export function user_history(params?: UserHistoryParams): Promise<ApiResponse>;

/**
 * 获取继续播放信息，对应手机版首页继续播放入口（需登录）
 * @route /lastest/songs/listen
 */
export function lastest_songs_listen(params?: LastestSongsListenParams): Promise<ApiResponse>;

// ============================================================
//  导出函数 —— 歌单管理
// ============================================================

/**
 * 收藏歌单 / 新建歌单（需登录）
 * @route /playlist/add
 */
export function playlist_add(params: PlaylistAddParams): Promise<ApiResponse>;

/**
 * 取消收藏歌单 / 删除歌单（需登录）
 * @route /playlist/del
 */
export function playlist_del(params: PlaylistDelParams): Promise<ApiResponse>;

/**
 * 对歌单添加歌曲（需登录）
 * @route /playlist/tracks/add
 */
export function playlist_tracks_add(params: PlaylistTracksAddParams): Promise<ApiResponse>;

/**
 * 对歌单删除歌曲（需登录）
 * @route /playlist/tracks/del
 */
export function playlist_tracks_del(params: PlaylistTracksDelParams): Promise<ApiResponse>;

/**
 * 获取歌单分类（含 category 信息）
 * @route /playlist/tags
 */
export function playlist_tags(params?: PlaylistTagsParams): Promise<ApiResponse>;

/**
 * 获取歌单列表
 * @route /top/playlist
 */
export function top_playlist(params: TopPlaylistParams): Promise<ApiResponse>;

/**
 * 获取主题歌单
 * @route /theme/playlist
 */
export function theme_playlist(params?: ThemePlaylistParams): Promise<ApiResponse>;

/**
 * 获取音效歌单
 * @route /playlist/effect
 */
export function playlist_effect(params?: PlaylistEffectParams): Promise<ApiResponse>;

/**
 * 获取歌单详情
 * @route /playlist/detail
 */
export function playlist_detail(params: PlaylistDetailParams): Promise<ApiResponse>;

/**
 * 获取歌单所有歌曲
 * @route /playlist/track/all
 */
export function playlist_track_all(params: PlaylistTrackAllParams): Promise<ApiResponse>;

/**
 * 获取歌单所有歌曲（新版，仅支持用户创建及收藏的歌单）
 * @route /playlist/track/all/new
 */
export function playlist_track_all_new(params: PlaylistTrackAllNewParams): Promise<ApiResponse>;

/**
 * 获取相似歌单
 * @route /playlist/similar
 */
export function playlist_similar(params: PlaylistSimilarParams): Promise<ApiResponse>;

/**
 * 获取主题歌单所有歌曲
 * @route /theme/playlist/track
 */
export function theme_playlist_track(params: ThemePlaylistTrackParams): Promise<ApiResponse>;

/**
 * 获取主题音乐
 * @route /theme/music
 */
export function theme_music(params?: ThemeMusicParams): Promise<ApiResponse>;

/**
 * 获取主题音乐详情
 * @route /theme/music/detail
 */
export function theme_music_detail(params: ThemeMusicDetailParams): Promise<ApiResponse>;

// ============================================================
//  导出函数 —— 专辑
// ============================================================

/**
 * 获取新碟上架列表
 * @route /top/album
 */
export function top_album(params?: TopAlbumParams): Promise<ApiResponse>;

/**
 * 获取专辑信息
 * @route /album
 */
export function album(params: AlbumParams): Promise<ApiResponse>;

/**
 * 获取专辑详情
 * @route /album/detail
 */
export function album_detail(params: AlbumDetailParams): Promise<ApiResponse>;

/**
 * 获取专辑音乐列表
 * @route /album/songs
 */
export function album_songs(params: AlbumSongsParams): Promise<ApiResponse>;

/**
 * 获取唱片店分类数据
 * @route /zhuanjidata/v3/album_shop_v2/get_classify_data
 */
export function album_shop(params?: AlbumShopParams): Promise<ApiResponse>;

// ============================================================
//  导出函数 —— 音乐 / 歌曲
// ============================================================

/**
 * 获取音乐 URL（需先调用 /register/dev 获取 dfid）
 * @route /song/url
 */
export function song_url(params: SongUrlParams): Promise<ApiResponse>;

/**
 * 获取音乐 URL（新版，一次性返回所有音质，但存在音频加密）
 * @route /song/url/new
 */
export function song_url_new(params: SongUrlNewParams): Promise<ApiResponse>;

/**
 * 获取歌曲高潮部分时间
 * @route /song/climax
 */
export function song_climax(params: SongClimaxParams): Promise<ApiResponse>;

/**
 * 获取音乐相关信息
 * @route /audio
 */
export function audio(params: AudioParams): Promise<ApiResponse>;

/**
 * 获取更多版本音乐
 * @route /audio/related
 */
export function audio_related(params: AudioRelatedParams): Promise<ApiResponse>;

/**
 * 获取最佳伴奏信息
 * @route /audio/accompany/matching
 */
export function audio_accompany_matching(params: AudioAccompanyMatchingParams): Promise<ApiResponse>;

/**
 * 获取音乐 K 歌数量（参数来自 /audio/accompany/matching）
 * @route /audio/ktv/total
 */
export function audio_ktv_total(params: AudioKtvTotalParams): Promise<ApiResponse>;

/**
 * 获取音乐详情
 * @route /privilege/lite
 */
export function privilege_lite(params: PrivilegeLiteParams): Promise<ApiResponse>;

/**
 * 获取音乐专辑/歌手信息
 * @route /krm/audio
 */
export function krm_audio(params: KrmAudioParams): Promise<ApiResponse>;

/**
 * 获取歌曲推荐（标准版）
 * @route /top/card
 */
export function top_card(params: TopCardParams): Promise<ApiResponse>;

/**
 * 获取歌曲推荐（概念版）
 * @route /top/card/youth
 */
export function top_card_youth(params: TopCardYouthParams): Promise<ApiResponse>;

/**
 * 获取曲风盲盒（概念版）
 * @route /youth/v1/song/tag_card_recommend
 */
export function top_tag_card_youth(params?: TopTagCardYouthParams): Promise<ApiResponse>;

/**
 * 获取歌手和专辑图片
 * @route /images
 */
export function images(params: ImagesParams): Promise<ApiResponse>;

/**
 * 获取歌手图片
 * @route /images/audio
 */
export function images_audio(params: ImagesAudioParams): Promise<ApiResponse>;

// ============================================================
//  导出函数 —— 搜索
// ============================================================

/**
 * 搜索音乐 / MV / 歌单 / 歌词 / 专辑 / 歌手
 * ⚠️ 需携带 cookie 认证信息，否则返回 error_code: 152
 * @route /search
 */
export function search(params: SearchParams): Promise<ApiResponse>;

/**
 * 获取默认搜索关键词
 * @route /search/default
 */
export function search_default(params?: SearchDefaultParams): Promise<ApiResponse>;

/**
 * 综合搜索（结果包含单曲、歌手、歌单等）
 * @route /search/complex
 */
export function search_complex(params: SearchComplexParams): Promise<ApiResponse>;

/**
 * 获取热门搜索列表
 * @route /search/hot
 */
export function search_hot(params?: SearchHotParams): Promise<ApiResponse>;

/**
 * 获取搜索建议（包含单曲、歌手、歌单信息）
 * @route /search/suggest
 */
export function search_suggest(params: SearchSuggestParams): Promise<ApiResponse>;

/**
 * 歌词搜索，需配合 /lyric 使用
 * @route /search/lyric
 */
export function search_lyric(params: SearchLyricParams): Promise<ApiResponse>;

/**
 * 混合搜索（iOS 端接口）
 * @route /v3/search/mixed
 */
export function search_mixed(params: SearchMixedParams): Promise<ApiResponse>;

/**
 * 获取歌词（需先调用 /search/lyric 获取 id 和 accesskey）
 * @route /lyric
 */
export function lyric(params: LyricParams): Promise<ApiResponse>;

// ============================================================
//  导出函数 —— 私人 FM
// ============================================================

/**
 * 私人 FM（对应手机和 PC 端的猜你喜欢）
 * @route /personal/fm
 */
export function personal_fm(params?: PersonalFmParams): Promise<ApiResponse>;

// ============================================================
//  导出函数 —— Banner / 乐库
// ============================================================

/**
 * 获取 Banner 轮播图数据
 * @route /pc/diantai
 */
export function pc_diantai(params?: PcDiantaiParams): Promise<ApiResponse>;

/**
 * 获取乐库 Banner 轮播图数据
 * @route /yueku/banner
 */
export function yueku_banner(params?: YuekuBannerParams): Promise<ApiResponse>;

/**
 * 获取乐库电台数据
 * @route /yueku/fm
 */
export function yueku_fm(params?: YuekuFmParams): Promise<ApiResponse>;

/**
 * 获取手机端乐库数据
 * @route /yueku
 */
export function yueku(params?: YuekuParams): Promise<ApiResponse>;

// ============================================================
//  导出函数 —— 电台
// ============================================================

/**
 * 获取所有电台分类数据
 * @route /fm/class
 */
export function fm_class(params?: FmClassParams): Promise<ApiResponse>;

/**
 * 获取推荐电台
 * @route /fm/recommend
 */
export function fm_recommend(params?: FmRecommendParams): Promise<ApiResponse>;

/**
 * 获取电台图片
 * @route /fm/image
 */
export function fm_image(params: FmImageParams): Promise<ApiResponse>;

/**
 * 获取电台音乐列表
 * @route /fm/songs
 */
export function fm_songs(params: FmSongsParams): Promise<ApiResponse>;

// ============================================================
//  导出函数 —— 编辑精选
// ============================================================

/**
 * 获取编辑精选数据
 * @route /top/ip
 */
export function top_ip(params?: TopIpParams): Promise<ApiResponse>;

/**
 * 获取编辑精选对应数据
 * @route /ip
 */
export function ip(params: IpParams): Promise<ApiResponse>;

/**
 * 获取编辑精选详情（批量）
 * @route /openapi/v1/ip
 */
export function ip_dateil(params: IpDateilParams): Promise<ApiResponse>;

/**
 * 获取编辑精选歌单数据
 * @route /ip/playlist
 */
export function ip_playlist(params: IpPlaylistParams): Promise<ApiResponse>;

/**
 * 获取编辑精选专区相关内容
 * @route /ip/zone
 */
export function ip_zone(params?: IpZoneParams): Promise<ApiResponse>;

/**
 * 获取编辑精选专区详情
 * @route /ip/zone/home
 */
export function ip_zone_home(params: IpZoneHomeParams): Promise<ApiResponse>;

// ============================================================
//  导出函数 —— VIP（仅限概念版）
// ============================================================

/**
 * 领取 VIP（测试接口，仅限概念版，目前不可使用）
 * @route /youth/vip
 */
export function youth_vip(params?: YouthVipParams): Promise<ApiResponse>;

/**
 * 领取一天 VIP（测试接口，仅限概念版）
 * @route /youth/day/vip
 */
export function youth_day_vip(params: YouthDayVipParams): Promise<ApiResponse>;

/**
 * 升级概念版 VIP 为畅听 VIP（需先领取一天 VIP）
 * @route /youth/day/vip/upgrade
 */
export function youth_day_vip_upgrade(params?: YouthDayVipUpgradeParams): Promise<ApiResponse>;

/**
 * 获取当月已领取 VIP 天数（测试接口，仅限概念版）
 * @route /youth/month/vip/record
 */
export function youth_month_vip_record(params?: YouthMonthVipRecordParams): Promise<ApiResponse>;

/**
 * 获取已领取 VIP 状态（测试接口，仅限概念版）
 * @route /youth/union/vip
 */
export function youth_union_vip(params?: YouthUnionVipParams): Promise<ApiResponse>;

/**
 * 听歌领取 VIP（需登录）
 * @route /youth/v2/report/listen_song
 */
export function youth_listen_song(params?: YouthListenSongParams): Promise<ApiResponse>;

// ============================================================
//  导出函数 —— 歌手
// ============================================================

/**
 * 获取歌手列表
 * @route /artist/lists
 */
export function artist_lists(params?: ArtistListsParams): Promise<ApiResponse>;

/**
 * 获取歌手详情
 * @route /artist/detail
 */
export function artist_detail(params: ArtistDetailParams): Promise<ApiResponse>;

/**
 * 获取歌手专辑
 * @route /artist/albums
 */
export function artist_albums(params: ArtistAlbumsParams): Promise<ApiResponse>;

/**
 * 获取歌手单曲
 * @route /artist/audios
 */
export function artist_audios(params: ArtistAudiosParams): Promise<ApiResponse>;

/**
 * 获取歌手 MV
 * @route /artist/videos
 */
export function artist_videos(params: ArtistVideosParams): Promise<ApiResponse>;

/**
 * 关注歌手（需登录）
 * @route /artist/follow
 */
export function artist_follow(params: ArtistFollowParams): Promise<ApiResponse>;

/**
 * 取消关注歌手（需登录）
 * @route /artist/unfollow
 */
export function artist_unfollow(params: ArtistUnfollowParams): Promise<ApiResponse>;

/**
 * 获取已关注歌手的新歌（需登录）
 * @route /artist/follow/newsongs
 */
export function artist_follow_newsongs(params?: ArtistFollowNewsongsParams): Promise<ApiResponse>;

/**
 * 获取歌手荣誉详情
 * @route /v1/query_singer_honour_detail
 */
export function artist_honour(params: ArtistHonourParams): Promise<ApiResponse>;

/**
 * 获取歌手列表（新版）
 * @route /ocean/v6/singer/list
 */
export function singer_list(params?: SingerListParams): Promise<ApiResponse>;

// ============================================================
//  导出函数 —— 视频
// ============================================================

/**
 * 获取视频 URL
 * @route /video/url
 */
export function video_url(params: VideoUrlParams): Promise<ApiResponse>;

/**
 * 获取歌曲对应的 MV
 * @route /kmr/audio/mv
 */
export function kmr_audio_mv(params: KmrAudioMvParams): Promise<ApiResponse>;

/**
 * 获取视频相关信息
 * @route /video/privilege
 */
export function video_privilege(params: VideoPrivilegeParams): Promise<ApiResponse>;

/**
 * 获取视频详情（可获取更高清的视频 hash）
 * @route /video/detail
 */
export function video_detail(params: VideoDetailParams): Promise<ApiResponse>;

// ============================================================
//  导出函数 —— 新歌速递
// ============================================================

/**
 * 获取新歌速递
 * @route /top/song
 */
export function top_song(params?: TopSongParams): Promise<ApiResponse>;

// ============================================================
//  导出函数 —— 场景音乐
// ============================================================

/**
 * 获取场景音乐列表
 * @route /scene/lists
 */
export function scene_lists(params?: SceneListsParams): Promise<ApiResponse>;

/**
 * 获取场景音乐详情
 * @route /scene/module
 */
export function scene_module(params: SceneModuleParams): Promise<ApiResponse>;

/**
 * 获取场景音乐讨论区
 * @route /scene/list/v2
 */
export function scene_lists_v2(params: SceneListV2Params): Promise<ApiResponse>;

/**
 * 获取场景音乐模块 Tag
 * @route /scene/module/info
 */
export function scene_module_info(params: SceneModuleInfoParams): Promise<ApiResponse>;

/**
 * 获取场景音乐歌单列表
 * @route /scene/collection/list
 */
export function scene_collection_list(params: SceneCollectionListParams): Promise<ApiResponse>;

/**
 * 获取场景音乐视频列表
 * @route /scene/video/list
 */
export function scene_video_list(params: SceneVideoListParams): Promise<ApiResponse>;

/**
 * 获取场景音乐音乐列表
 * @route /scene/audio/list
 */
export function scene_audio_list(params: SceneAudioListParams): Promise<ApiResponse>;

/**
 * 获取场景音乐推荐
 * @route /genesisapi/v1/scene_music/rec_music
 */
export function scene_music(params: SceneMusicParams): Promise<ApiResponse>;

// ============================================================
//  导出函数 —— 推荐
// ============================================================

/**
 * 获取每日推荐列表
 * @route /everyday/recommend
 */
export function everyday_recommend(params?: EverydayRecommendParams): Promise<ApiResponse>;

/**
 * 获取历史推荐
 * @route /everyday/history
 */
export function everyday_history(params?: EverydayHistoryParams): Promise<ApiResponse>;

/**
 * 获取风格推荐
 * @route /everyday/style/recommend
 */
export function everyday_style_recommend(params?: EverydayStyleRecommendParams): Promise<ApiResponse>;

/**
 * 获取每日推荐歌曲
 * @route /everyday_song_recommend
 */
export function recommend_songs(params?: RecommendSongsParams): Promise<ApiResponse>;

/**
 * 获取好友推荐
 * @route /sing7/relation/json/v3/friend_rec_by_using_song_list
 */
export function everyday_friend(params?: EverydayFriendParams): Promise<ApiResponse>;

// ============================================================
//  导出函数 —— 排行榜
// ============================================================

/**
 * 获取排行榜列表
 * @route /rank/list
 */
export function rank_list(params?: RankListParams): Promise<ApiResponse>;

/**
 * 获取排行榜推荐列表
 * @route /rank/top
 */
export function rank_top(params?: RankTopParams): Promise<ApiResponse>;

/**
 * 获取排行榜往期列表
 * @route /rank/vol
 */
export function rank_vol(params: RankVolParams): Promise<ApiResponse>;

/**
 * 获取排行榜信息
 * @route /rank/info
 */
export function rank_info(params: RankInfoParams): Promise<ApiResponse>;

/**
 * 获取排行榜歌曲列表
 * @route /rank/audio
 */
export function rank_audio(params: RankAudioParams): Promise<ApiResponse>;

// ============================================================
//  导出函数 —— 评论
// ============================================================

/**
 * 获取歌曲收藏数（无需登录）
 * @route /favorite/count
 */
export function favorite_count(params: FavoriteCountParams): Promise<ApiResponse>;

/**
 * 获取歌曲评论数（无需登录）
 * @route /comment/count
 */
export function comment_count(params: CommentCountParams): Promise<ApiResponse>;

/**
 * 获取歌曲所有评论（无需登录）
 * @route /comment/music
 */
export function comment_music(params: CommentMusicParams): Promise<ApiResponse>;

/**
 * 获取歌曲分类评论（无需登录）
 * @route /comment/music/classify
 */
export function comment_music_classify(params: CommentMusicClassifyParams): Promise<ApiResponse>;

/**
 * 获取歌曲热词评论（无需登录）
 * @route /comment/music/hotword
 */
export function comment_music_hotword(params: CommentMusicHotwordParams): Promise<ApiResponse>;

/**
 * 获取楼层评论
 * @route /comment/floor
 */
export function comment_floor(params: CommentFloorParams): Promise<ApiResponse>;

/**
 * 获取歌单评论（无需登录）
 * @route /comment/playlist
 */
export function comment_playlist(params: CommentPlaylistParams): Promise<ApiResponse>;

/**
 * 获取专辑评论（无需登录）
 * @route /comment/album
 */
export function comment_album(params: CommentAlbumParams): Promise<ApiResponse>;

// ============================================================
//  导出函数 —— 曲谱
// ============================================================

/**
 * 获取歌曲曲谱（AI 曲谱为 XML 文件需自行解析）
 * @route /sheet/list
 */
export function sheet_list(params: SheetListParams): Promise<ApiResponse>;

/**
 * 获取曲谱详情（AI 曲谱为 XML 文件需自行解析）
 * @route /sheet/detail
 */
export function sheet_detail(params: SheetDetailParams): Promise<ApiResponse>;

/**
 * 获取推荐曲谱
 * @route /sheet/hot
 */
export function sheet_hot(params?: SheetHotParams): Promise<ApiResponse>;

/**
 * 获取曲谱合集 / 曲谱合集详情
 * @route /sheet/collection
 */
export function sheet_collection(params?: SheetCollectionParams): Promise<ApiResponse>;

/**
 * 获取曲谱推荐
 * @route /opern/v1/home/get_rec_opern
 */
export function sheet_explore(params?: SheetExploreParams): Promise<ApiResponse>;

/**
 * 获取曲谱排行榜
 * @route /opern/v1/home/get_rank_opern
 */
export function sheet_rank(params?: SheetRankParams): Promise<ApiResponse>;

/**
 * 获取曲谱歌曲详情
 * @route /opern/v1/detail/song_info
 */
export function sheet_song(params: SheetSongParams): Promise<ApiResponse>;

/**
 * 获取曲谱标签
 * @route /opern/v1/home/get_tags
 */
export function sheet_tags(params?: SheetTagsParams): Promise<ApiResponse>;

// ============================================================
//  导出函数 —— 听歌历史 & 服务器
// ============================================================

/**
 * 提交听歌历史（支持跨设备查看）
 * @route /playhistory/upload
 */
export function playhistory_upload(params: PlayhistoryUploadParams): Promise<ApiResponse>;

/**
 * 获取服务器时间戳
 * @route /server/now
 */
export function server_now(params?: ServerNowParams): Promise<ApiResponse>;

// ============================================================
//  导出函数 —— 刷刷 & AI
// ============================================================

/**
 * 获取刷刷视频
 * @route /brush
 */
export function brush(params?: BrushParams): Promise<ApiResponse>;

/**
 * 获取 AI 推荐歌曲
 * @route /ai/recommend
 */
export function ai_recommend(params: AiRecommendParams): Promise<ApiResponse>;

// ============================================================
//  导出函数 —— 频道
// ============================================================

/**
 * 获取用户所有订阅的频道（需登录）
 * @route /youth/channel/all
 */
export function youth_channel_all(params?: YouthChannelAllParams): Promise<ApiResponse>;

/**
 * 获取频道详情
 * @route /youth/channel/detail
 */
export function youth_channel_detail(params: YouthChannelDetailParams): Promise<ApiResponse>;

/**
 * 获取频道安利
 * @route /youth/channel/amway
 */
export function youth_channel_amway(params: YouthChannelAmwayParams): Promise<ApiResponse>;

/**
 * 获取相似频道
 * @route /youth/channel/similar
 */
export function youth_channel_similar(params: YouthChannelSimilarParams): Promise<ApiResponse>;

/**
 * 订阅 / 取消订阅频道（需登录）
 * @route /youth/channel/sub
 */
export function youth_channel_sub(params: YouthChannelSubParams): Promise<ApiResponse>;

/**
 * 获取频道音乐故事
 * @route /youth/channel/song
 */
export function youth_channel_song(params: YouthChannelSongParams): Promise<ApiResponse>;

/**
 * 获取频道音乐故事详情
 * @route /youth/channel/song/detail
 */
export function youth_channel_song_detail(params: YouthChannelSongDetailParams): Promise<ApiResponse>;

/**
 * 获取经常访问的频道和用户（需登录）
 * @route /youth/dynamic/recent
 */
export function youth_dynamic_recent(params?: YouthDynamicRecentParams): Promise<ApiResponse>;

/**
 * 获取用户动态（需登录）
 * @route /youth/v3/user/get_dynamic
 */
export function youth_dynamic(params?: YouthDynamicParams): Promise<ApiResponse>;

// ============================================================
//  导出函数 —— 用户公开音乐
// ============================================================

/**
 * 获取用户公开的音乐
 * @route /youth/user/song
 */
export function youth_user_song(params: YouthUserSongParams): Promise<ApiResponse>;

// ============================================================
//  导出函数 —— 听书
// ============================================================

/**
 * 听书 - 每日推荐
 * @route /longaudio/daily/recommend
 */
export function longaudio_daily_recommend(params?: LongaudioDailyRecommendParams): Promise<ApiResponse>;

/**
 * 听书 - 排行榜推荐
 * @route /longaudio/rank/recommend
 */
export function longaudio_rank_recommend(params?: LongaudioRankRecommendParams): Promise<ApiResponse>;

/**
 * 听书 - VIP 推荐
 * @route /longaudio/vip/recommend
 */
export function longaudio_vip_recommend(params?: LongaudioVipRecommendParams): Promise<ApiResponse>;

/**
 * 听书 - 每周推荐
 * @route /longaudio/week/recommend
 */
export function longaudio_week_recommend(params?: LongaudioWeekRecommendParams): Promise<ApiResponse>;

/**
 * 听书 - 专辑详情
 * @route /longaudio/album/detail
 */
export function longaudio_album_detail(params: LongaudioAlbumDetailParams): Promise<ApiResponse>;

/**
 * 听书 - 专辑音乐列表
 * @route /longaudio/album/audios
 */
export function longaudio_album_audios(params: LongaudioAlbumAudiosParams): Promise<ApiResponse>;

// ============================================================
//  导出函数 —— 歌曲成绩单
// ============================================================

/**
 * 获取歌曲成绩单信息
 * @route /song/ranking
 */
export function song_ranking(params: SongRankingParams): Promise<ApiResponse>;

/**
 * 获取更详细的歌曲成绩单信息（需登录）
 * @route /song/ranking/filter
 */
export function song_ranking_filter(params: SongRankingFilterParams): Promise<ApiResponse>;

// ============================================================
//  导出函数 —— 服务器管理（来自 server 模块）
// ============================================================

/**
 * 启动 KuGouMusic API HTTP 服务
 * @returns Express 应用实例（含 service 属性指向 HTTP Server）
 */
export function startService(): Promise<import('express').Express & ServerExtension>;

/**
 * 动态扫描目录获取所有 API 模块定义
 * @param modulesPath - 模块目录绝对路径
 * @param specificRoute - 自定义路由映射
 * @param doRequire - 是否通过 require 加载模块（默认 true）
 */
export function getModulesDefinitions(modulesPath: string, specificRoute: Record<string, string>, doRequire?: boolean): Promise<ModuleDefinition[]>;

// ============================================================
//  导出函数 —— 请求工具（来自 util/request 模块）
// ============================================================

/**
 * 创建底层 HTTP 请求
 * @param config - 请求配置
 */
export function createRequest(config: RequestConfig): Promise<any>;
