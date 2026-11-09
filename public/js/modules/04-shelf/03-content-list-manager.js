// ============================================================
function makeContentListManager() {
  var group = null;
  var rows = [];           // 每行一张卡 (歌曲)
  var panel = null;
  var allTracks = [];
  var renderedStart = -1;
  var CONTENT_VISIBLE_RADIUS = 5;
  var CONTENT_MAX_RENDER = CONTENT_VISIBLE_RADIUS * 2 + 1;
  var CONTENT_PREFETCH_AHEAD = Math.max(24, Math.floor((typeof PLAYLIST_LAZY_BATCH_SIZE === 'number' ? PLAYLIST_LAZY_BATCH_SIZE : 48) * 0.75));
  var CONTENT_COVER_PREFETCH_LIMIT = 18;
  var open = false;
  var centerTarget = 0, centerSmooth = 0;
  var playlistTitle = '';
  var contentKind = 'playlist';
  var contentSource = null;
  var contentNextOffset = 0;
  var contentTotalCount = 0;
  var contentHasMore = false;
  var contentLoadingMore = false;
  var sourceCard = null;
  var requestToken = 0;
  var contentWarmPrefetchTimer = 0;
  var contentCoverPrefetchKey = '';
  var openAnimAt = -10;
  var rowAnimAt = -10;
  var panelDirty = true, rowsDirty = true;
  var panelDrawAt = -10, rowDrawAt = -10;
  var LOADING_ANIM_INTERVAL = 1 / 30;
  var DETAIL_BASE = { x: 1.28, y: 0.18, z: 1.36, rx: -0.008, ry: 0.020 };
  var detailCameraDir = new THREE.Vector3();
  var detailCameraRight = new THREE.Vector3();
  var detailCameraUp = new THREE.Vector3();
  var detailCameraPos = new THREE.Vector3();
  function detailLayout() {
    return shelfLayoutProfile().detail || DETAIL_BASE;
  }
  function placeDynamicDetailFromCamera(layout, intro, parX, parY) {
    if (!group || !camera) return false;
    var portrait = isPortraitShelfViewport();
    var narrow = !portrait && innerWidth < 980;
    var introMix = intro * (layout.intro == null ? 1 : layout.intro);
    var parallax = layout.parallax == null ? 1 : layout.parallax;
    var distance = portrait ? 5.04 : (narrow ? 4.96 : 4.86);
    var rightOffset = portrait ? 0.02 : (narrow ? 0.06 : 0.10);
    var upOffset = portrait ? -0.06 : -0.04;
    distance += clampRange((layout.z - DETAIL_BASE.z) * 0.12, -0.20, 0.24);
    rightOffset += clampRange((layout.x - DETAIL_BASE.x) * 0.08, -0.24, 0.24);
    upOffset += clampRange((layout.y - DETAIL_BASE.y) * 0.08, -0.16, 0.16);
    rightOffset += introMix * (portrait ? 0.34 : 0.46) + parX * (portrait ? 0.045 : 0.055) * parallax;
    upOffset -= introMix * (portrait ? 0.050 : 0.040);
    upOffset += parY * (portrait ? 0.042 : 0.045) * parallax;
    distance += introMix * 0.12 + parY * 0.018 * parallax - parX * 0.012 * parallax;
    camera.getWorldDirection(detailCameraDir);
    detailCameraRight.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
    detailCameraUp.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
    detailCameraPos.copy(camera.position)
      .addScaledVector(detailCameraDir, distance)
      .addScaledVector(detailCameraRight, rightOffset)
      .addScaledVector(detailCameraUp, upOffset);
    group.position.copy(detailCameraPos);
    return true;
  }

  function makeRoundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function ellipsize(ctx, text, maxWidth) {
    text = String(text || '');
    if (ctx.measureText(text).width <= maxWidth) return text;
    var out = text;
    while (out.length > 1 && ctx.measureText(out + '...').width > maxWidth) out = out.slice(0, -1);
    return out + '...';
  }
  function canvasAccent(alpha, fallback) {
    return shelfAccentRgba(alpha, fallback);
  }

  function ensurePanel() {
    if (panel || !group) return;
    var cv = document.createElement('canvas');
    cv.width = 900; cv.height = 1024;
    var tx = new THREE.CanvasTexture(cv);
    tx.minFilter = THREE.LinearFilter; tx.magFilter = THREE.LinearFilter;
    tx.generateMipmaps = false;
    var mat = new THREE.MeshBasicMaterial({ map: tx, transparent: true, opacity: 0.86, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
    var geo = new THREE.PlaneGeometry(2.62, 3.02, 1, 1);
    var mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(-0.02, 0.0, 0.20);
    mesh.renderOrder = 232;
    group.add(mesh);
    panel = { canvas: cv, texture: tx, mesh: mesh };
  }

  function drawPanel() {
    ensurePanel();
    if (!panel) return;
    var ctx = panel.canvas.getContext('2d');
    var W = panel.canvas.width, H = panel.canvas.height;
    ctx.clearRect(0, 0, W, H);
    makeRoundRect(ctx, 24, 28, W - 48, H - 56, 34);
    var bg = ctx.createLinearGradient(0, 0, W, H);
    var panelBgAlpha = shelfSettings().bgOpacity;
    bg.addColorStop(0, 'rgba(0,0,0,' + Math.min(0.98, panelBgAlpha + 0.02).toFixed(3) + ')');
    bg.addColorStop(0.42, 'rgba(0,0,0,' + panelBgAlpha.toFixed(3) + ')');
    bg.addColorStop(1, 'rgba(0,0,0,' + Math.max(0.20, panelBgAlpha - 0.04).toFixed(3) + ')');
    ctx.fillStyle = bg; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.font = '800 38px Inter, "Microsoft YaHei", Arial';
    ctx.fillStyle = 'rgba(255,246,220,0.94)';
    ctx.fillText(ellipsize(ctx, playlistTitle || '歌单详情', W - 310), 72, 92);
    ctx.font = '500 18px Inter, "Microsoft YaHei", Arial';
    ctx.fillStyle = canvasAccent(0.62);
    var playableCount = allTracks.filter(function (song) { return song && song.id && song.type !== 'podcast-radio'; }).length;
    var contentCount = allTracks.filter(function (song) { return song && song.id; }).length;
    var isLoading = allTracks.length === 1 && isLoadingLabel(allTracks[0] && allTracks[0].name);
    var countLabel = contentKind === 'podcast'
      ? (contentCount ? (contentCount + ' 项播客内容') : (isLoading ? '正在载入' : '暂无播客内容'))
      : (playableCount ? (playableCount + ' 首歌曲') : (isLoading ? '正在载入' : '暂无可播放歌曲'));
    if (contentKind !== 'podcast' && contentTotalCount && contentTotalCount > playableCount) {
      countLabel = playableCount + '/' + contentTotalCount + (contentLoadingMore ? ' loading' : ' loaded');
    }
    ctx.fillText(countLabel, 74, 128);
    var coverUrl = sourceCard && sourceCard.item && sourceCard.item.cover;
    var coverSize = 96, coverX = W - 172, coverY = 56;
    makeRoundRect(ctx, coverX, coverY, coverSize, coverSize, 22);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();
    if (coverUrl) {
      var coverRec = playlistCoverCache[coverUrl];
      if (coverRec && coverRec.loaded && coverRec.img) {
        ctx.save();
        makeRoundRect(ctx, coverX, coverY, coverSize, coverSize, 22);
        ctx.clip();
        ctx.drawImage(coverRec.img, coverX, coverY, coverSize, coverSize);
        ctx.restore();
      } else if (!coverRec || (!coverRec.loading && !coverRec.failed)) {
        requestPlaylistCover(coverUrl, function () { drawPanel(); });
      }
    }
    var sweep = (Math.sin((uniforms.uTime.value || 0) * 1.7) + 1) * 0.5;
    var shine = ctx.createLinearGradient(70, 154, W - 80, 154);
    shine.addColorStop(0, canvasAccent(0));
    shine.addColorStop(Math.max(0.01, sweep * 0.72), canvasAccent(0.14));
    shine.addColorStop(Math.min(0.99, sweep * 0.72 + 0.14), canvasAccent(0.56));
    shine.addColorStop(1, canvasAccent(0));
    ctx.fillStyle = shine;
    ctx.fillRect(72, 154, W - 144, 2);
    panel.texture.needsUpdate = true;
  }

  function disposePanelObject(targetPanel) {
    if (!targetPanel) return;
    if (targetPanel.mesh && targetPanel.mesh.parent) targetPanel.mesh.parent.remove(targetPanel.mesh);
    if (targetPanel.texture) targetPanel.texture.dispose();
    if (targetPanel.mesh && targetPanel.mesh.material) targetPanel.mesh.material.dispose();
    if (targetPanel.mesh && targetPanel.mesh.geometry) targetPanel.mesh.geometry.dispose();
  }

  function disposePanel() {
    disposePanelObject(panel);
    panel = null;
  }

  function isLoadingLabel(text) {
    return /加载中|正在载入/.test(String(text || ''));
  }

  function isLoadingContent() {
    return allTracks.length === 1 && isLoadingLabel(allTracks[0] && allTracks[0].name);
  }

  function contentSongKey(song, fallback) {
    return String(song && (song.id || song.mid || song.qqId || song.localKey || (song.name + '|' + song.artist)) || fallback || '');
  }

  function appendContentTracks(tracks) {
    tracks = Array.isArray(tracks) ? tracks : [];
    if (!tracks.length) return 0;
    var seen = Object.create(null);
    allTracks.forEach(function (song, i) {
      var key = contentSongKey(song, i);
      if (key) seen[key] = true;
    });
    var added = 0;
    tracks.forEach(function (song, i) {
      var key = contentSongKey(song, 'new:' + i);
      if (!song || !key || seen[key]) return;
      seen[key] = true;
      allTracks.push(song);
      added += 1;
    });
    return added;
  }

  function clearContentWarmPrefetch() {
    if (contentWarmPrefetchTimer) {
      clearTimeout(contentWarmPrefetchTimer);
      contentWarmPrefetchTimer = 0;
    }
  }

  function prefetchContentCoversFrom(start, count) {
    if (!allTracks.length) return;
    start = Math.max(0, Math.round(Number(start) || 0));
    count = Math.max(1, Math.round(Number(count) || CONTENT_COVER_PREFETCH_LIMIT));
    var end = Math.min(allTracks.length, start + count);
    var issued = 0;
    for (var i = start; i < end && issued < CONTENT_COVER_PREFETCH_LIMIT; i++) {
      var song = allTracks[i];
      var url = songCoverSrc(song, 80);
      if (!url) continue;
      var rec = playlistCoverCache[url];
      if (rec && (rec.loaded || rec.loading || rec.failed)) continue;
      requestPlaylistCover(url);
      issued++;
    }
  }

  function prefetchContentCoversAround(center, reason) {
    if (!open || !allTracks.length || isLoadingContent()) return;
    center = Math.max(0, Math.round(Number(center) || 0));
    var key = center + '|' + allTracks.length + '|' + (reason || '');
    if (key === contentCoverPrefetchKey) return;
    contentCoverPrefetchKey = key;
    prefetchContentCoversFrom(Math.max(0, center - 2), CONTENT_COVER_PREFETCH_LIMIT);
    prefetchContentCoversFrom(Math.max(0, center + CONTENT_VISIBLE_RADIUS), CONTENT_COVER_PREFETCH_LIMIT);
    prefetchContentCoversFrom(Math.max(0, allTracks.length - CONTENT_PREFETCH_AHEAD), Math.ceil(CONTENT_COVER_PREFETCH_LIMIT * 0.75));
  }

  function scheduleContentWarmPrefetch(token) {
    clearContentWarmPrefetch();
    if (!contentHasMore || !contentSource) return;
    contentWarmPrefetchTimer = setTimeout(function () {
      contentWarmPrefetchTimer = 0;
      if (!open || token !== requestToken || !contentHasMore || contentLoadingMore || !contentSource) return;
      prefetchContentCoversAround(centerTarget, 'warm');
      loadMoreContentRows('warm-prefetch');
    }, 360);
  }

  function contentPageUrl(offset) {
    if (!contentSource) return '';
    var limit = PLAYLIST_LAZY_BATCH_SIZE;
    if (contentSource.provider === 'qq') {
      return '/api/qq/playlist/tracks?id=' + encodeURIComponent(contentSource.id) + '&limit=' + limit + '&offset=' + Math.max(0, offset || 0);
    }
    if (contentSource.provider === 'kugou') {
      return '/api/kugou/playlist/tracks?id=' + encodeURIComponent(contentSource.id) + '&limit=' + limit + '&offset=' + Math.max(0, offset || 0);
    }
    if (contentSource.provider === 'qishui') {
      return '/api/qishui/playlist/tracks?id=' + encodeURIComponent(contentSource.id) + '&limit=' + limit + '&offset=' + Math.max(0, offset || 0);
    }
    if (contentSource.provider === 'spotify') {
      return '/api/spotify/playlist/tracks?id=' + encodeURIComponent(contentSource.id) + '&limit=' + limit + '&offset=' + Math.max(0, offset || 0);
    }
    if (contentSource.provider === 'netease') {
      return '/api/playlist/tracks?id=' + encodeURIComponent(contentSource.id) + '&limit=' + limit + '&offset=' + Math.max(0, offset || 0);
    }
    return '';
  }

  async function loadMoreContentRows(reason) {
    if (!open || contentLoadingMore || !contentHasMore || !contentSource) return false;
    var url = contentPageUrl(contentNextOffset);
    if (!url && contentSource.provider !== 'mineradio') return false;
    var token = requestToken;
    contentLoadingMore = true;
    panelDirty = true;
    try {
      var r = contentSource.provider === 'mineradio'
        ? await builtInPlaylistTracksPage(contentSource.id, { limit: PLAYLIST_LAZY_BATCH_SIZE, offset: contentNextOffset })
        : await apiJson(url);
      if (!open || token !== requestToken) return false;
      var tracks = r && r.tracks || [];
      var before = allTracks.length;
      var added = appendContentTracks(tracks);
      contentNextOffset = Math.max(contentNextOffset + tracks.length, Number(r && r.nextOffset) || (contentNextOffset + tracks.length));
      var total = Number(r && (r.total || (r.playlist && r.playlist.trackCount))) || 0;
      if (total) contentTotalCount = Math.max(contentTotalCount || 0, total);
      contentHasMore = !!(r && r.hasMore);
      if (!added && (!tracks.length || allTracks.length === before)) contentHasMore = false;
      panelDirty = true;
      rowsDirty = true;
      prefetchContentCoversAround(centerTarget, 'append');
      syncRenderedRows(true);
      return added > 0;
    } catch (e) {
      console.warn('[ShelfContentLoadMore]', reason || '', e);
      if (open && token === requestToken) showToast('歌单后续加载失败');
      return false;
    } finally {
      if (open && token === requestToken) {
        contentLoadingMore = false;
        panelDirty = true;
      }
    }
  }

  function maybeLoadMoreContentRows(reason) {
    if (!contentHasMore || contentLoadingMore || !contentSource || !allTracks.length || isLoadingContent()) return;
    prefetchContentCoversAround(centerTarget, reason || 'scroll');
    var remaining = (allTracks.length - 1) - Math.round(centerTarget);
    if (remaining <= CONTENT_PREFETCH_AHEAD) {
      loadMoreContentRows(reason);
    }
  }

  function drawPanelIfNeeded(force, nowT) {
    nowT = nowT == null ? (uniforms.uTime.value || 0) : nowT;
    if (!force && !panelDirty && (!isLoadingContent() || nowT - panelDrawAt < LOADING_ANIM_INTERVAL)) return;
    drawPanel();
    panelDirty = false;
    panelDrawAt = nowT;
  }

  function drawRow(row, song, isCenter) {
    var cv = row.canvas, ctx = cv.getContext('2d');
    var W = cv.width, H = cv.height;
    var isPodcastRadio = !!(song && song.type === 'podcast-radio');
    var playable = !!(song && song.id && !isPodcastRadio);
    var actionReady = playable || isPodcastRadio;
    ctx.clearRect(0, 0, W, H);
    makeRoundRect(ctx, 14, 10, W - 28, H - 20, 22);
    var rowGrad = ctx.createLinearGradient(0, 0, W, H);
    var rowBgAlpha = shelfSettings().bgOpacity;
    var centerRowBgAlpha = isCenter ? Math.max(rowBgAlpha, 0.92) : rowBgAlpha;
    if (isCenter) {
      rowGrad.addColorStop(0, 'rgba(8,14,24,' + Math.min(0.985, centerRowBgAlpha + 0.040).toFixed(3) + ')');
      rowGrad.addColorStop(0.48, 'rgba(0,0,0,' + Math.min(0.985, centerRowBgAlpha + 0.030).toFixed(3) + ')');
      rowGrad.addColorStop(1, 'rgba(0,0,0,' + Math.min(0.98, centerRowBgAlpha + 0.015).toFixed(3) + ')');
    } else {
      rowGrad.addColorStop(0, 'rgba(16,16,20,' + Math.max(0.20, rowBgAlpha - 0.02).toFixed(3) + ')');
      rowGrad.addColorStop(1, 'rgba(0,0,0,' + Math.max(0.20, rowBgAlpha - 0.04).toFixed(3) + ')');
    }
    if (isCenter) {
      ctx.shadowColor = canvasAccent(0.20);
      ctx.shadowBlur = 18;
    }
    ctx.fillStyle = rowGrad;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = isCenter ? canvasAccent(0.48) : 'rgba(255,255,255,0.10)';
    ctx.lineWidth = isCenter ? 1.6 : 1;
    ctx.stroke();
    ctx.font = '700 18px Inter, Arial';
    ctx.fillStyle = isCenter ? canvasAccent(0.95) : 'rgba(255,255,255,0.34)';
    var n = String(row.index + 1);
    if (n.length < 2) n = '0' + n;
    ctx.fillText(n, 32, 52);
    var coverSize = 54;
    var coverX = 84;
    var coverY = H / 2 - coverSize / 2;
    var songCover = songCoverSrc(song, 80);
    var hasSongCover = !!songCover;
    if (actionReady || hasSongCover) {
      makeRoundRect(ctx, coverX, coverY, coverSize, coverSize, 13);
      ctx.fillStyle = isCenter ? canvasAccent(0.12) : 'rgba(255,255,255,0.07)';
      ctx.fill();
      if (hasSongCover) {
        var songCoverRec = playlistCoverCache[songCover];
        if (songCoverRec && songCoverRec.loaded && songCoverRec.img) {
          ctx.save();
          makeRoundRect(ctx, coverX, coverY, coverSize, coverSize, 13);
          ctx.clip();
          ctx.drawImage(songCoverRec.img, coverX, coverY, coverSize, coverSize);
          ctx.restore();
        } else if (!songCoverRec || (!songCoverRec.loading && !songCoverRec.failed)) {
          requestPlaylistCover(songCover, function () {
            if (row && row.mesh && row.mesh.parent) drawRow(row, row.song, !!row.lastCenter);
          });
        }
      }
    }
    // 标题
    var textX = (actionReady || hasSongCover) ? 154 : 82;
    var btnW = 104, btnH = 48, btnX = W - 144, btnY = H / 2 - btnH / 2;
    var miniBtn = 44, likeX = btnX - 156, collectX = btnX - 104, nextX = btnX - 52;
    var textMax = actionReady && isCenter ? (isPodcastRadio ? btnX - textX - 24 : likeX - textX - 24) : W - textX - 42;
    var loadingRow = !playable && isLoadingLabel(song && song.name);
    if (loadingRow) {
      ctx.font = '700 22px Inter, "Microsoft YaHei", Arial';
      ctx.fillStyle = 'rgba(255,247,224,0.88)';
      ctx.fillText('正在载入歌单', textX, 42);
      var phase = ((uniforms.uTime.value || 0) * 0.85) % 1;
      for (var sk = 0; sk < 3; sk++) {
        var barY = 58 + sk * 13;
        var barW = sk === 0 ? 330 : (sk === 1 ? 250 : 180);
        makeRoundRect(ctx, textX, barY, barW, 7, 4);
        var skGrad = ctx.createLinearGradient(textX, barY, textX + barW, barY);
        var hot = (phase + sk * 0.14) % 1;
        skGrad.addColorStop(0, 'rgba(255,255,255,0.08)');
        skGrad.addColorStop(Math.max(0, hot - 0.18), canvasAccent(0.10));
        skGrad.addColorStop(Math.min(0.99, hot), canvasAccent(0.34));
        skGrad.addColorStop(1, 'rgba(255,255,255,0.08)');
        ctx.fillStyle = skGrad; ctx.fill();
      }
      row.texture.needsUpdate = true;
      return;
    }
    ctx.font = isCenter ? '800 24px Inter, "Microsoft YaHei", Arial' : '600 20px Inter, "Microsoft YaHei", Arial';
    ctx.fillStyle = isCenter ? 'rgba(255,247,224,0.96)' : 'rgba(255,255,255,0.80)';
    ctx.fillText(ellipsize(ctx, song.name || '', textMax), textX, 44);
    ctx.font = '500 15px Inter, "Microsoft YaHei", Arial';
    ctx.fillStyle = isCenter ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.64)';
    ctx.fillText(ellipsize(ctx, song.artist || '', textMax), textX, 72);
    // center 行右侧显示红心/收藏/播放按钮
    if (isCenter && actionReady) {
      if (!isPodcastRadio) {
        var liked = isSongLiked(song);
        makeRoundRect(ctx, likeX, btnY + 2, miniBtn, btnH - 4, 15);
        ctx.fillStyle = liked ? 'rgba(255,122,144,0.18)' : 'rgba(255,255,255,0.075)';
        ctx.fill();
        ctx.strokeStyle = liked ? 'rgba(255,122,144,0.52)' : 'rgba(255,255,255,0.14)';
        ctx.lineWidth = 1.1;
        ctx.stroke();
        drawCanvasHeart(ctx, likeX + miniBtn / 2, btnY + 26, 20, liked ? '#ff7a90' : 'rgba(255,255,255,0.76)');

        makeRoundRect(ctx, collectX, btnY + 2, miniBtn, btnH - 4, 15);
        var collectGrad = ctx.createLinearGradient(collectX, btnY + 2, collectX + miniBtn, btnY + btnH);
        collectGrad.addColorStop(0, 'rgba(255,255,255,0.080)');
        collectGrad.addColorStop(1, canvasAccent(0.075));
        ctx.fillStyle = collectGrad;
        ctx.fill();
        ctx.strokeStyle = canvasAccent(0.22);
        ctx.lineWidth = 1.1;
        ctx.stroke();
        var collectCx = collectX + miniBtn / 2;
        var collectCy = btnY + btnH / 2;
        ctx.strokeStyle = canvasAccent(0.72);
        ctx.lineWidth = 2.35;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(collectCx - 11, collectCy + 1);
        ctx.lineTo(collectCx - 11, collectCy + 12);
        ctx.lineTo(collectCx + 11, collectCy + 12);
        ctx.lineTo(collectCx + 11, collectCy + 1);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(collectCx, collectCy - 9);
        ctx.lineTo(collectCx, collectCy + 5);
        ctx.moveTo(collectCx - 7, collectCy - 2);
        ctx.lineTo(collectCx + 7, collectCy - 2);
        ctx.stroke();

        makeRoundRect(ctx, nextX, btnY + 2, miniBtn, btnH - 4, 15);
        var nextGrad = ctx.createLinearGradient(nextX, btnY + 2, nextX + miniBtn, btnY + btnH);
        nextGrad.addColorStop(0, 'rgba(255,255,255,0.082)');
        nextGrad.addColorStop(0.62, 'rgba(255,255,255,0.045)');
        nextGrad.addColorStop(1, canvasAccent(0.055));
        ctx.fillStyle = nextGrad;
        ctx.fill();
        ctx.strokeStyle = canvasAccent(0.24);
        ctx.lineWidth = 1.1;
        ctx.stroke();
        var nextCx = nextX + miniBtn / 2;
        var nextCy = btnY + btnH / 2;
        ctx.strokeStyle = 'rgba(255,255,255,0.90)';
        ctx.lineWidth = 2.8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(nextCx, nextCy - 8);
        ctx.lineTo(nextCx, nextCy + 8);
        ctx.moveTo(nextCx - 8, nextCy);
        ctx.lineTo(nextCx + 8, nextCy);
        ctx.stroke();
      }

      makeRoundRect(ctx, btnX, btnY, btnW, btnH, 18);
      var btnGrad = ctx.createLinearGradient(btnX, btnY, btnX + btnW, btnY + btnH);
      btnGrad.addColorStop(0, 'rgba(255,255,255,0.88)');
      btnGrad.addColorStop(0.56, canvasAccent(0.94));
      btnGrad.addColorStop(1, canvasAccent(0.58));
      ctx.fillStyle = btnGrad; ctx.fill();
      ctx.strokeStyle = canvasAccent(0.42);
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.font = '700 15px Inter, Arial';
      ctx.fillStyle = readableInkForHex(shelfAccentHex());
      ctx.fillText('播放', btnX + 36, btnY + 29);
    }
    row.texture.needsUpdate = true;
  }

  function place(row, i) {
    var delta = row.index - centerSmooth;
    var absD = Math.abs(delta);
    if (absD > CONTENT_VISIBLE_RADIUS + 0.5) { row.mesh.visible = false; return; }
    row.mesh.visible = true;
    row.mesh.renderOrder = 240 + Math.round((CONTENT_VISIBLE_RADIUS + 1 - Math.min(absD, CONTENT_VISIBLE_RADIUS + 1)) * 14);
    var nowT = uniforms.uTime.value;
    var layout = detailLayout();
    var revealRaw = Math.max(0, Math.min(1, (nowT - rowAnimAt - absD * 0.040) / (layout.rowDuration || 0.72)));
    var reveal = revealRaw * revealRaw * (3 - 2 * revealRaw);
    var parX = pointerParallax.x || 0;
    var parY = pointerParallax.y || 0;
    var parWeight = Math.max(0, 1 - absD * 0.12);
    var pulse = row.fxPulse || 0;
    var settle = group && group.userData ? (group.userData.rowSettle || 0) : 0;
    var shelfLook = shelfSettings();
    var skullDetail = shouldUseSkullSafeShelfCamera();
    var introStrength = layout.intro == null ? 1 : layout.intro;
    var parallax = layout.parallax == null ? 1 : layout.parallax;
    var rowBaseX = skullDetail ? 0.22 : -0.04;
    var rowSpreadX = skullDetail ? 0.030 : 0.014;
    var rowIntroX = skullDetail ? 0.58 : 0.38;
    var rowCenterZ = skullDetail ? 0.62 : 0.62;
    var rowBackZ = skullDetail ? 0.58 : 0.58;
    var rowDepthStep = skullDetail ? 0.046 : 0.048;
    var px = rowBaseX + absD * rowSpreadX + (1 - reveal) * (rowIntroX + absD * rowSpreadX) * introStrength;
    var py = -delta * layout.rowStep + (1 - reveal) * (0.20 + (delta < 0 ? -0.10 : 0.10)) * introStrength;
    var pz = (absD < 0.5 ? rowCenterZ : (rowBackZ - absD * rowDepthStep)) - (1 - reveal) * (skullDetail ? 0.10 : 0.16) * introStrength;
    px += settle * ((skullDetail ? 0.11 : 0.12) + absD * (skullDetail ? 0.010 : 0.012));
    py += settle * (delta < 0 ? -0.08 : 0.08);
    pz -= settle * (skullDetail ? 0.045 : 0.08);
    px += parX * (skullDetail ? 0.022 : 0.026) * parWeight * parallax;
    py += parY * (skullDetail ? 0.024 : 0.036) * parWeight * parallax;
    pz += (parY * (skullDetail ? 0.014 : 0.024) - parX * (skullDetail ? 0.010 : 0.020)) * parWeight * parallax;
    var scale = (absD < 0.5 ? 1.00 : Math.max(0.66, 0.94 - absD * 0.070)) * (0.90 + reveal * 0.10) * (1 + pulse * 0.052) * (1 - settle * 0.025) * layout.rowScale;
    row.mesh.position.set(px, py, pz);
    row.mesh.scale.setScalar(scale);
    var rowOpacityBase = Math.min(1, (absD < 0.5 ? 1.0 : Math.max(0.34, 1.0 - absD * 0.12)) * reveal + pulse * 0.14);
    var rowOpacityScale = absD < 0.5 ? Math.max(0.94, shelfLook.opacity) : shelfLook.opacity;
    row.mesh.material.opacity = Math.min(1, rowOpacityBase * rowOpacityScale);
    row.mesh.rotation.y = (skullDetail ? -0.070 : 0.10) + (1 - reveal) * (skullDetail ? 0.018 : 0.052) * introStrength + parX * (skullDetail ? 0.010 : 0.018) * parWeight * parallax;
    row.mesh.rotation.x = (skullDetail ? 0.010 : 0) - delta * (skullDetail ? 0.010 : 0.022) - parY * (skullDetail ? 0.006 : 0.014) * parWeight * parallax;
  }

  function disposeRowList(rowList) {
    while (rowList.length) {
      var row = rowList.pop();
      if (row.mesh && row.mesh.parent) row.mesh.parent.remove(row.mesh);
      if (row.mesh && row.mesh.material) {
        if (row.mesh.material.map) row.mesh.material.map.dispose();
        row.mesh.material.dispose();
      }
      if (row.mesh && row.mesh.geometry) row.mesh.geometry.dispose();
    }
  }

  function disposeRows() {
    disposeRowList(rows);
    renderedStart = -1;
  }

  function rebindContentRow(row, song, index) {
    row.song = song;
    row.index = index;
    row.lastCenter = index === Math.round(centerSmooth);
    row.mesh.renderOrder = 240 + index;
    drawRow(row, song, row.lastCenter);
    return row;
  }

  function disposeCapturedDetail(targetGroup, targetRows, targetPanel) {
    if (targetGroup && targetGroup.parent) targetGroup.parent.remove(targetGroup);
    disposeRowList(targetRows || []);
    disposePanelObject(targetPanel);
  }

  function startRowsLoadedIntro() {
    rowAnimAt = uniforms.uTime.value;
    panelDirty = true;
    rowsDirty = true;
    if (!group || !group.userData) return;
    group.userData.rowSettle = 1;
    var layout = detailLayout();
    var rowDuration = layout.rowDuration || 0.72;
    if (window.gsap) {
      window.gsap.killTweensOf(group.userData, 'rowSettle');
      window.gsap.to(group.userData, { rowSettle: 0, duration: rowDuration + 0.04, ease: 'expo.out' });
    } else {
      group.userData.rowSettle = 0;
    }
  }

  function syncRenderedRows(force) {
    if (!group) return;
    var nowT = uniforms.uTime.value || 0;
    var refreshLoading = isLoadingContent() && nowT - rowDrawAt >= LOADING_ANIM_INTERVAL;
    drawPanelIfNeeded(force || refreshLoading, nowT);
    var total = allTracks.length;
    if (!total) { disposeRows(); return; }
    var center = Math.round(centerTarget);
    var start = Math.max(0, center - CONTENT_VISIBLE_RADIUS);
    var end = Math.min(total - 1, start + CONTENT_MAX_RENDER - 1);
    start = Math.max(0, end - CONTENT_MAX_RENDER + 1);
    if (!force && start === renderedStart && rows.length === (end - start + 1)) {
      rows.forEach(function (row) { row.song = allTracks[row.index] || row.song; });
      if (rowsDirty || refreshLoading) {
        rows.forEach(function (row) {
          var isCenter = Math.abs(row.index - centerSmooth) < 0.5;
          drawRow(row, row.song, isCenter);
          row.lastCenter = isCenter;
        });
        rowsDirty = false;
        rowDrawAt = nowT;
      }
      prefetchContentCoversAround(center, 'visible');
      return;
    }
    var existingByIndex = Object.create(null);
    rows.forEach(function (row) { existingByIndex[row.index] = row; });
    var reusable = rows.filter(function (row) { return row.index < start || row.index > end; });
    renderedStart = start;
    var nextRows = [];
    for (var idx = start; idx <= end; idx++) {
      var row = existingByIndex[idx] || reusable.shift();
      if (!row) {
        row = makeRow(allTracks[idx], idx);
        drawRow(row, row.song, idx === Math.round(centerSmooth));
        row.lastCenter = idx === Math.round(centerSmooth);
      } else {
        rebindContentRow(row, allTracks[idx], idx);
      }
      nextRows.push(row);
    }
    disposeRowList(reusable);
    rows = nextRows;
    rowsDirty = false;
    rowDrawAt = nowT;
    prefetchContentCoversAround(center, 'render-window');
  }

  return {
    isOpen: function () { return open; },
    refreshTheme: function () {
      panelDirty = true;
      rowsDirty = true;
      if (!open || !group) return;
      drawPanelIfNeeded(true);
      syncRenderedRows(true);
    },
    open: async function (playlistId, title, fromCard) {
      open = true;
      playlistTitle = title;
      sourceCard = fromCard;
      var token = ++requestToken;
      openAnimAt = uniforms.uTime.value;
      rowAnimAt = openAnimAt;
      centerTarget = 0;
      centerSmooth = 0;
      panelDirty = true;
      rowsDirty = true;
      panelDrawAt = -10;
      rowDrawAt = -10;
      contentSource = null;
      contentNextOffset = 0;
      contentTotalCount = Number(fromCard && fromCard.item && fromCard.item.trackCount) || 0;
      contentHasMore = false;
      contentLoadingMore = false;
      clearContentWarmPrefetch();
      contentCoverPrefetchKey = '';
      if (!group) {
        group = new THREE.Group();
        group.renderOrder = 320;
        scene.add(group);
      }
      var openLayout = detailLayout();
      var openSkullDetail = shouldUseSkullSafeShelfCamera();
      var openDynamicDetail = !openSkullDetail && shouldUseShelfDynamicCamera('shelf-detail') && camera;
      var openCoverRx = particles && particles.rotation ? particles.rotation.x : 0;
      var openCoverRy = particles && particles.rotation ? particles.rotation.y : 0;
      var openCoverRz = particles && particles.rotation ? particles.rotation.z : 0;
      group.userData.detailIntro = 1;
      if (openDynamicDetail) {
        placeDynamicDetailFromCamera(openLayout, 1, 0, 0);
      } else {
        group.position.set(openLayout.x + (openSkullDetail ? 0.10 : 0.16), openLayout.y - (openSkullDetail ? 0.02 : 0.024), openLayout.z - (openSkullDetail ? 0.05 : 0.070));
      }
      if ((openSkullDetail || openDynamicDetail) && camera) {
        group.quaternion.copy(camera.quaternion);
        group.rotateX(openLayout.rx);
        group.rotateY(openLayout.ry + (openSkullDetail ? 0.014 : 0.018));
      } else {
        group.rotation.y = openCoverRy * 0.82 + openLayout.ry + 0.018;
        group.rotation.x = openCoverRx * 0.72 + openLayout.rx;
        group.rotation.z = openCoverRz * 0.70;
      }
      group.scale.setScalar(openLayout.scale * 0.965);
      if (window.gsap) {
        window.gsap.killTweensOf(group.userData);
        window.gsap.to(group.userData, { detailIntro: 0, duration: openLayout.openDuration || 0.48, ease: 'power3.out' });
      } else {
        group.userData.detailIntro = 0;
      }
      try {
        drawPanelIfNeeded(true);
        // 清旧
        disposeRows();
        // loading 行
        allTracks = [{ name: '加载中…', artist: '' }];
        panelDirty = true;
        rowsDirty = true;
        syncRenderedRows(true);
      } catch (renderLoadingErr) {
        console.warn('[ShelfContentLoadingRender]', playlistId, renderLoadingErr);
      }
      var podcastCollectionKey = String(playlistId || '').indexOf('podcast:') === 0 ? String(playlistId).slice(8) : '';
      var qqPlaylistId = String(playlistId || '').indexOf('qq:') === 0 ? String(playlistId).slice(3) : '';
      var kugouPlaylistId = String(playlistId || '').indexOf('kugou:') === 0 ? String(playlistId).slice(6) : '';
      var qishuiPlaylistId = String(playlistId || '').indexOf('qishui:') === 0 ? String(playlistId).slice(7) : '';
      var spotifyPlaylistId = String(playlistId || '').indexOf('spotify:') === 0 ? String(playlistId).slice(8) : '';
      var builtInPlaylistId = String(playlistId || '').indexOf('mineradio:') === 0 ? String(playlistId).slice(10) : '';
      contentKind = podcastCollectionKey ? 'podcast' : 'playlist';
      contentSource = podcastCollectionKey ? null : {
        provider: builtInPlaylistId ? 'mineradio' : (qqPlaylistId ? 'qq' : (kugouPlaylistId ? 'kugou' : (qishuiPlaylistId ? 'qishui' : (spotifyPlaylistId ? 'spotify' : 'netease')))),
        id: builtInPlaylistId || qqPlaylistId || kugouPlaylistId || qishuiPlaylistId || spotifyPlaylistId || playlistId
      };
      // 拉取歌单/播客集合
      var r = null;
      try {
        r = builtInPlaylistId
          ? await builtInPlaylistTracksPage(builtInPlaylistId, { limit: PLAYLIST_LAZY_BATCH_SIZE, offset: 0 })
          : (podcastCollectionKey
          ? await apiJson('/api/podcast/my/items?key=' + encodeURIComponent(podcastCollectionKey) + '&limit=' + PLAYLIST_LAZY_BATCH_SIZE)
          : (qqPlaylistId
            ? await apiJson('/api/qq/playlist/tracks?id=' + encodeURIComponent(qqPlaylistId) + '&limit=' + PLAYLIST_LAZY_BATCH_SIZE + '&offset=0')
            : (kugouPlaylistId
              ? await apiJson('/api/kugou/playlist/tracks?id=' + encodeURIComponent(kugouPlaylistId) + '&limit=' + PLAYLIST_LAZY_BATCH_SIZE + '&offset=0')
              : (qishuiPlaylistId
                ? await apiJson('/api/qishui/playlist/tracks?id=' + encodeURIComponent(qishuiPlaylistId) + '&limit=' + PLAYLIST_LAZY_BATCH_SIZE + '&offset=0')
                : (spotifyPlaylistId
                  ? await apiJson('/api/spotify/playlist/tracks?id=' + encodeURIComponent(spotifyPlaylistId) + '&limit=' + PLAYLIST_LAZY_BATCH_SIZE + '&offset=0')
                  : await apiJson('/api/playlist/tracks?id=' + encodeURIComponent(playlistId) + '&limit=' + PLAYLIST_LAZY_BATCH_SIZE + '&offset=0'))))));
      } catch (e) {
        if (!open || token !== requestToken) return;
        console.warn('[ShelfContentLoadApi]', playlistId, e);
        try {
          allTracks = [{ name: '歌单加载失败', artist: '' }];
          panelDirty = true;
          rowsDirty = true;
          startRowsLoadedIntro();
          syncRenderedRows(true);
        } catch (renderErrorErr) {
          console.warn('[ShelfContentErrorRender]', playlistId, renderErrorErr);
        }
        showToast('歌单加载失败');
        return;
      }
      if (!open || token !== requestToken) return;
      try {
        // 清 loading
        disposeRows();
        var tracks = podcastCollectionKey ? (r.items || []) : (r.tracks || []);
        if (!tracks.length) {
          allTracks = [{ name: podcastCollectionKey ? '播客为空' : '歌单为空', artist: '' }];
          panelDirty = true;
          rowsDirty = true;
          startRowsLoadedIntro();
          syncRenderedRows(true);
          return;
        }
        allTracks = tracks;
        if (!podcastCollectionKey) {
          contentNextOffset = Number(r && r.nextOffset) || allTracks.length;
          contentTotalCount = Math.max(contentTotalCount || 0, Number(r && (r.total || (r.playlist && r.playlist.trackCount))) || 0);
          contentHasMore = !!(r && r.hasMore);
        }
        centerTarget = 0; centerSmooth = 0;
        panelDirty = true;
        rowsDirty = true;
        startRowsLoadedIntro();
        syncRenderedRows(true);
        prefetchContentCoversAround(0, 'initial');
        scheduleContentWarmPrefetch(token);
      } catch (renderReadyErr) {
        console.warn('[ShelfContentReadyRender]', playlistId, renderReadyErr);
        showToast('歌单已载入，3D列表刷新失败');
      }
    },
    close: function () {
      open = false;
      requestToken++;
      var targetGroup = group;
      var targetRows = rows.slice();
      var targetPanel = panel;
      group = null;
      rows = [];
      panel = null;
      renderedStart = -1;
      allTracks = [];
      contentKind = 'playlist';
      contentSource = null;
      contentNextOffset = 0;
      contentTotalCount = 0;
      contentHasMore = false;
      contentLoadingMore = false;
      clearContentWarmPrefetch();
      contentCoverPrefetchKey = '';
      sourceCard = null;
      panelDirty = true;
      rowsDirty = true;
      panelDrawAt = -10;
      rowDrawAt = -10;
      if (!targetGroup) return;
      var closeLayout = detailLayout();
      var closeDuration = closeLayout.closeDuration || 0.18;
      var closeIntro = closeLayout.intro == null ? 1 : closeLayout.intro;
      var materials = targetRows.map(function (row) { return row.mesh && row.mesh.material; }).filter(Boolean);
      if (targetPanel && targetPanel.mesh && targetPanel.mesh.material) materials.push(targetPanel.mesh.material);
      if (window.gsap) {
        window.gsap.killTweensOf(targetGroup.position);
        window.gsap.killTweensOf(targetGroup.scale);
        window.gsap.to(targetGroup.scale, { x: 0.965, y: 0.965, z: 0.965, duration: closeDuration, ease: 'power2.in' });
        window.gsap.to(targetGroup.position, {
          x: targetGroup.position.x + 0.18 * closeIntro,
          y: targetGroup.position.y - 0.02 * closeIntro,
          z: targetGroup.position.z - 0.10 * closeIntro,
          duration: closeDuration,
          ease: 'power2.in'
        });
        var finishClose = function () { disposeCapturedDetail(targetGroup, targetRows, targetPanel); };
        if (materials.length) {
          window.gsap.to(materials, {
            opacity: 0,
            duration: Math.max(0.06, closeDuration * 0.88),
            ease: 'power2.in',
            onComplete: finishClose
          });
        } else {
          window.gsap.delayedCall(closeDuration, finishClose);
        }
      } else {
        disposeCapturedDetail(targetGroup, targetRows, targetPanel);
      }
    },
    update: function (dt) {
      if (!group || !open) return;
      var intro = group.userData.detailIntro || 0;
      var parX = pointerParallax.x || 0;
      var parY = pointerParallax.y || 0;
      var layout = detailLayout();
      var skullDetail = shouldUseSkullSafeShelfCamera();
      var introMix = intro * (layout.intro == null ? 1 : layout.intro);
      var parallax = layout.parallax == null ? 1 : layout.parallax;
      var dynamicDetail = !skullDetail && shouldUseShelfDynamicCamera('shelf-detail') && camera;
      var coverBoundDetail = !skullDetail && !dynamicDetail && particles && particles.rotation;
      var coverBindX = coverBoundDetail ? particles.rotation.y * 0.18 : 0;
      var coverBindY = coverBoundDetail ? particles.rotation.x * -0.16 : 0;
      var coverBindZ = coverBoundDetail ? Math.abs(particles.rotation.y) * 0.030 : 0;
      if (dynamicDetail) {
        placeDynamicDetailFromCamera(layout, intro, parX, parY);
      } else {
        group.position.set(
          layout.x + coverBindX + introMix * (skullDetail ? 0.10 : 0.16) + parX * (skullDetail ? 0.024 : 0.030) * parallax,
          layout.y + coverBindY - introMix * (skullDetail ? 0.02 : 0.024) + parY * (skullDetail ? 0.026 : 0.026) * parallax,
          layout.z + coverBindZ - introMix * (skullDetail ? 0.05 : 0.070) + parY * (skullDetail ? 0.014 : 0.016) * parallax - parX * (skullDetail ? 0.010 : 0.010) * parallax
        );
      }
      if (skullDetail && camera) {
        group.quaternion.copy(camera.quaternion);
        group.rotateX(layout.rx - parY * 0.004 * parallax);
        group.rotateY(layout.ry + introMix * 0.004 + parX * 0.004 * parallax);
      } else if (dynamicDetail) {
        group.quaternion.copy(camera.quaternion);
        group.rotateX(layout.rx - parY * 0.006 * parallax);
        group.rotateY(layout.ry + introMix * 0.012 + parX * 0.008 * parallax);
      } else {
        var coverRx = particles && particles.rotation ? particles.rotation.x : 0;
        var coverRy = particles && particles.rotation ? particles.rotation.y : 0;
        var coverRz = particles && particles.rotation ? particles.rotation.z : 0;
        group.rotation.x += ((coverRx * 0.72 + layout.rx - parY * 0.010 * parallax) - group.rotation.x) * 0.16;
        group.rotation.y += ((coverRy * 0.82 + layout.ry + introMix * 0.018 + parX * 0.014 * parallax) - group.rotation.y) * 0.16;
        group.rotation.z += ((coverRz * 0.70) - group.rotation.z) * 0.14;
      }
      group.scale.setScalar(layout.scale * (1 - introMix * (skullDetail ? 0.020 : 0.035)));
      centerSmooth += (centerTarget - centerSmooth) * 0.18;
      if (Math.abs(centerSmooth - centerTarget) < 0.001) centerSmooth = centerTarget;
      syncRenderedRows(false);
      maybeLoadMoreContentRows('update');
      if (panel && panel.mesh) {
        var pr = Math.max(0, Math.min(1, (uniforms.uTime.value - openAnimAt) / (layout.openDuration || 0.72)));
        pr = pr * pr * (3 - 2 * pr);
        panel.mesh.material.opacity = 0.86 * pr * shelfSettings().opacity;
      }
      for (var i = 0; i < rows.length; i++) {
        place(rows[i], i);
        var isC = Math.abs(rows[i].index - centerSmooth) < 0.5;
        if (rows[i].lastCenter !== isC) {
          rows[i].lastCenter = isC;
          drawRow(rows[i], rows[i].song, isC);
        }
      }
    },
    next: function () {
      if (allTracks.length) {
        var prevTarget = Math.round(centerTarget);
        centerTarget = Math.min(allTracks.length - 1, centerTarget + 1);
        var nextTarget = Math.round(centerTarget);
        syncRenderedRows(false);
        maybeLoadMoreContentRows('next');
        if (nextTarget !== prevTarget) playShelfSelectTick(1, 'row');
        pulseObjectValue(rows.find(function (r) { return r.index === nextTarget; }), 'fxPulse', 0.48, 0.36);
      }
    },
    prev: function () {
      if (allTracks.length) {
        var prevTarget = Math.round(centerTarget);
        centerTarget = Math.max(0, centerTarget - 1);
        var nextTarget = Math.round(centerTarget);
        syncRenderedRows(false);
        maybeLoadMoreContentRows('prev');
        if (nextTarget !== prevTarget) playShelfSelectTick(-1, 'row');
        pulseObjectValue(rows.find(function (r) { return r.index === nextTarget; }), 'fxPulse', 0.48, 0.36);
      }
    },
    scrollBy: function (d) {
      if (allTracks.length) {
        var prevTarget = Math.round(centerTarget);
        centerTarget = Math.max(0, Math.min(allTracks.length - 1, centerTarget + d));
        var nextTarget = Math.round(centerTarget);
        syncRenderedRows(false);
        maybeLoadMoreContentRows('scroll');
        if (nextTarget !== prevTarget) playShelfSelectTick(d, 'row');
        pulseObjectValue(rows.find(function (r) { return r.index === nextTarget; }), 'fxPulse', 0.48, 0.36);
      }
    },
    getRows: function () { return rows; },
    getCenterIdx: function () { return Math.round(centerSmooth); },
    pulseRow: function (row, amount) {
      if (!row) return;
      pulseObjectValue(row, 'fxPulse', amount || 1, 0.42);
    },
    raycastRows: function (rc) {
      if (!rows.length) return null;
      var vm = rows.filter(function (r) { return r.mesh.visible; }).map(function (r) { return r.mesh; });
      var hits = rc.intersectObjects(vm, false);
      if (!hits.length) return null;
      var row = rows.find(function (r) { return r.mesh === hits[0].object; });
      return { row: row, uv: hits[0].uv };
    },
    pickRowAtScreen: function (sx, sy) {
      if (!rows.length || !open) return null;
      var ordered = rows.filter(function (r) { return r.mesh && r.mesh.visible; }).sort(function (a, b) {
        return (b.mesh.renderOrder || 0) - (a.mesh.renderOrder || 0);
      });
      for (var ri = 0; ri < ordered.length; ri++) {
        var row = ordered[ri];
        var params = row.mesh.geometry && row.mesh.geometry.parameters || {};
        var hw = (params.width || 2.50) / 2;
        var hh = (params.height || 0.36) / 2;
        var pts = [
          new THREE.Vector3(-hw, -hh, 0),
          new THREE.Vector3(hw, -hh, 0),
          new THREE.Vector3(hw, hh, 0),
          new THREE.Vector3(-hw, hh, 0),
        ];
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        row.mesh.updateMatrixWorld(true);
        for (var pi = 0; pi < pts.length; pi++) {
          pts[pi].applyMatrix4(row.mesh.matrixWorld).project(camera);
          var x = (pts[pi].x + 1) * innerWidth / 2;
          var y = (1 - pts[pi].y) * innerHeight / 2;
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
        var padX = 24, padY = 16;
        if (sx < minX - padX || sx > maxX + padX || sy < minY - padY || sy > maxY + padY) continue;
        var u = clampRange((sx - minX) / Math.max(1, maxX - minX), 0, 1);
        var v = 1 - clampRange((sy - minY) / Math.max(1, maxY - minY), 0, 1);
        return { row: row, uv: { x: u, y: v }, screenPick: true };
      }
      return null;
    },
    raycastPanel: function (rc) {
      if (!panel || !panel.mesh) return null;
      var hits = rc.intersectObject(panel.mesh, false);
      return hits && hits.length ? hits[0] : null;
    },
    screenContainsPanel: function (sx, sy) {
      if (!panel || !panel.mesh || !open) return false;
      var params = panel.mesh.geometry && panel.mesh.geometry.parameters || {};
      var hw = (params.width || 2.62) / 2;
      var hh = (params.height || 3.02) / 2;
      var pts = [
        new THREE.Vector3(-hw, -hh, 0),
        new THREE.Vector3(hw, -hh, 0),
        new THREE.Vector3(hw, hh, 0),
        new THREE.Vector3(-hw, hh, 0),
      ];
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      panel.mesh.updateMatrixWorld(true);
      for (var pi = 0; pi < pts.length; pi++) {
        pts[pi].applyMatrix4(panel.mesh.matrixWorld).project(camera);
        var x = (pts[pi].x + 1) * innerWidth / 2;
        var y = (1 - pts[pi].y) * innerHeight / 2;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
      var pad = 42;
      return sx >= minX - pad && sx <= maxX + pad && sy >= minY - pad && sy <= maxY + pad;
    },
    rowActionAtScreen: function (row, sx, sy) {
      if (!row || !row.mesh || !row.mesh.visible) return null;
      var song = row.song || {};
      var isCenter = Math.abs(row.index - Math.round(centerSmooth)) < 0.5;
      if (!isCenter || !((song && song.id) || song.type === 'podcast-radio')) return null;
      var params = row.mesh.geometry && row.mesh.geometry.parameters || {};
      var hw = (params.width || 2.50) / 2;
      var hh = (params.height || 0.36) / 2;
      var corners = [
        new THREE.Vector3(-hw, -hh, 0),
        new THREE.Vector3(hw, -hh, 0),
        new THREE.Vector3(hw, hh, 0),
        new THREE.Vector3(-hw, hh, 0),
      ];
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      row.mesh.updateMatrixWorld(true);
      for (var i = 0; i < corners.length; i++) {
        corners[i].applyMatrix4(row.mesh.matrixWorld).project(camera);
        var x = (corners[i].x + 1) * innerWidth / 2;
        var y = (1 - corners[i].y) * innerHeight / 2;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
      var w = Math.max(1, maxX - minX);
      var h = Math.max(1, maxY - minY);
      var u = clampRange((sx - minX) / w, 0, 1);
      var v = clampRange((sy - minY) / h, 0, 1);
      if (u > 0.60 && u < 0.68 && v > 0.12 && v < 0.88) return 'like';
      if (u >= 0.68 && u < 0.75 && v > 0.12 && v < 0.88) return 'collect';
      if (u >= 0.75 && u < 0.82 && v > 0.12 && v < 0.88) return 'next';
      if (u >= 0.82 && v > 0.10 && v < 0.90) return 'play';
      return null;
    },
    playRow: function (row) {
      // 把整个歌单导入队列, 从这首开始播
      pulseObjectValue(row, 'fxPulse', 1.0, 0.34);
      var idx = row.index;
      if (idx < 0) return;
      if (row.song && row.song.type === 'podcast-radio') {
        loadPodcastRadioIntoQueue(row.song.id || row.song.radioId, true, row.song.name || playlistTitle);
        var smRadio = shelfManager;
        if (smRadio) safeShelfCloseContent('content-play-podcast-radio');
        return;
      }
      var playIndex = allTracks.slice(0, idx + 1).filter(function (song) { return song && song.id; }).length - 1;
      var allSongs = allTracks.filter(function (song) { return song && song.id; }).map(function (song) {
        return cloneSong(song);
      });
      if (!allSongs.length || playIndex < 0) return;
      var queuePlaylistId = contentSource && contentSource.provider && contentSource.provider !== 'netease'
        ? (contentSource.provider + ':' + contentSource.id)
        : (contentSource && contentSource.id || '');
      if (!queuePlaylistId) return;
      loadPlaylistIntoQueueById(queuePlaylistId, true, playlistTitle, {
        seedTracks: allSongs,
        startIndex: playIndex,
        total: contentTotalCount,
        nextOffset: contentNextOffset,
        hasMore: contentHasMore,
        preserveHomeState: true
      }).catch(function (e) { console.warn('[ContentPlayRow]', e); });
      // 关闭内容框
      var sm = shelfManager;
      if (sm) safeShelfCloseContent('content-play-row');
    }
  };

  function makeRow(song, i) {
    var cv = document.createElement('canvas');
    cv.width = 800; cv.height = 104;
    var ctx = cv.getContext('2d');
    var tx = new THREE.CanvasTexture(cv);
    tx.minFilter = THREE.LinearFilter; tx.magFilter = THREE.LinearFilter;
    tx.generateMipmaps = false;
    var mat = new THREE.MeshBasicMaterial({ map: tx, transparent: true, opacity: 0.96, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
    var geo = new THREE.PlaneGeometry(2.50, 0.36, 1, 1);
    var mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 240 + i;
    group.add(mesh);
    return { canvas: cv, texture: tx, mesh: mesh, song: song, index: i, fxPulse: 0 };
  }
}
