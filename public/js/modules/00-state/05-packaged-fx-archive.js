var PACKAGED_DEFAULT_USER_FX_ARCHIVE_NAME = '默认测试';
var PACKAGED_DEFAULT_USER_FX_ARCHIVE_EXPORTED_AT = 1784607916226;
var PACKAGED_DEFAULT_USER_FX_ARCHIVE_SAVED_AT = 1784607916226;
// Keep the packaged first-launch snapshot sourced from the runtime defaults so
// newly added settings cannot silently drift between the two default paths.
var PACKAGED_DEFAULT_FX_SNAPSHOT = Object.freeze(Object.assign({
  visualPresetSchema: VISUAL_PRESET_SCHEMA
}, fxDefaults));
function clonePackagedDefaultFxSnapshot() {
  return Object.assign({}, PACKAGED_DEFAULT_FX_SNAPSHOT);
}
function packagedDefaultLyricLayoutRaw() {
  return Object.assign({ desktopLyricsSchema: 'desktop-lyrics-v3' }, clonePackagedDefaultFxSnapshot());
}
