// ============================================================
//  界面语言切换 (i18n)
//  依赖 head bootstrap 暴露的 window.I18N / window.t
// ============================================================
function updateLangToggleBtn() {
  if (!window.I18N) return;
  var label = document.getElementById('lang-toggle-label');
  if (label) label.textContent = window.I18N.getLang() === 'zh' ? '中' : 'EN';
}
function cycleAppLanguage() {
  if (window.I18N) window.I18N.toggleLang();
  updateLangToggleBtn();
  if (window.t) showToast(window.t('toast.langSwitched'));
}
document.addEventListener('mineradio-lang-changed', function () {
  try { updateLangToggleBtn(); } catch (e) {}
  try { if (typeof renderHomeDiscover === 'function') renderHomeDiscover(); } catch (e) {}
  try { if (typeof updateSearchModeTabs === 'function') updateSearchModeTabs(); } catch (e) {}
  try { if (typeof syncDiyModeButton === 'function') syncDiyModeButton(); } catch (e) {}
  try { if (typeof updatePlaybackQualityUi === 'function') updatePlaybackQualityUi(); } catch (e) {}
  try { if (typeof updatePlayModeButton === 'function') updatePlayModeButton(false); } catch (e) {}
  try { if (typeof updateLikeButtons === 'function') updateLikeButtons(); } catch (e) {}
  try { if (typeof refreshSearchResultActionStates === 'function') refreshSearchResultActionStates(); } catch (e) {}
  try { if (typeof safeRenderQueuePanel === 'function') safeRenderQueuePanel('lang-changed', { scrollCurrent: false }); } catch (e) {}
  try { if (typeof renderUserPlaylistsList === 'function' && userPlaylists.length) renderUserPlaylistsList(); } catch (e) {}
  try { if (typeof renderMyPodcastCollections === 'function') renderMyPodcastCollections(); } catch (e) {}
  try { if (typeof renderUserBtn === 'function') renderUserBtn(); } catch (e) {}
  try { if (document.getElementById('login-modal') && document.getElementById('login-modal').classList.contains('show') && typeof updateLoginProviderUi === 'function') updateLoginProviderUi(); } catch (e) {}
  try { if (typeof updateLyricColorControls === 'function') updateLyricColorControls(); } catch (e) {}
  try { if (typeof updateLyricHighlightControls === 'function') updateLyricHighlightControls(); } catch (e) {}
  try { if (typeof updateLyricGlowControls === 'function') updateLyricGlowControls(); } catch (e) {}
  try { if (typeof updateVisualTintControls === 'function') updateVisualTintControls(); } catch (e) {}
  try { if (typeof updateCustomBackgroundControls === 'function') updateCustomBackgroundControls(); } catch (e) {}
  try { if (typeof buildLyricColorControls === 'function') buildLyricColorControls(); } catch (e) {}
  try { if (typeof relabelFxPanelControls === 'function') relabelFxPanelControls(); } catch (e) {}
  try { if (typeof buildPresetGrid === 'function') buildPresetGrid(); } catch (e) {}
  try { if (typeof renderUserFxArchives === 'function') renderUserFxArchives(); } catch (e) {}
  try { var hkm = document.getElementById('hotkey-modal'); if (hkm && typeof renderHotkeySettings === 'function') renderHotkeySettings(); } catch (e) {}
});
