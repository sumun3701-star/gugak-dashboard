/* youtube.js — 국악방송라디오 최신 업로드 (전역 App.youtube) */
window.App = window.App || {};

App.youtube = (function () {
  // Master PRD 8.3 — 국악방송라디오 (TV 채널과 혼동 주의)
  var CHANNEL_ID = 'UChGH9Y7DVCJXFlBtNXTf98A';
  var UPLOADS_PLAYLIST = 'UUhGH9Y7DVCJXFlBtNXTf98A'; // UC... -> UU...
  var CACHE_KEY = 'ytCache';
  var CACHE_TTL = 6 * 60 * 60 * 1000;

  function s() { return App.settings.get(); }
  function getSeen() { return App.store.get('ytSeen', {}); }
  function setSeen(m) { App.store.set('ytSeen', m); }

  function getCache() { return App.store.get(CACHE_KEY, null); }
  function cacheFresh() {
    var c = getCache();
    return !!(c && (Date.now() - c.fetchedAt) < CACHE_TTL);
  }

  /* ---------- API 키 방식 (브라우저에서 직접 호출 가능) ---------- */
  function viaApi() {
    var url = 'https://www.googleapis.com/youtube/v3/playlistItems' +
      '?part=snippet&maxResults=25&playlistId=' + UPLOADS_PLAYLIST +
      '&key=' + encodeURIComponent(s().youtubeKey);
    return fetch(url).then(function (r) { return r.json(); }).then(function (j) {
      if (j.error) throw { code: 'API', message: (j.error.errors && j.error.errors[0] && j.error.errors[0].reason) || j.error.message };
      return (j.items || []).map(function (it) {
        var sn = it.snippet || {};
        var vid = (sn.resourceId && sn.resourceId.videoId) || '';
        var th = sn.thumbnails || {};
        return {
          id: vid,
          title: sn.title || '(제목 없음)',
          published: sn.publishedAt || '',
          thumb: (th.medium || th.high || th.default || {}).url || '',
          url: 'https://www.youtube.com/watch?v=' + vid
        };
      }).filter(function (v) { return v.id; });
    });
  }

  /* ---------- RSS 방식 (프록시 필요) ---------- */
  function viaRss() {
    var url = App.util.proxyBase() + '/api/youtube-rss?channel_id=' + CHANNEL_ID;
    return fetch(url).then(function (r) {
      if (!r.ok) throw { code: 'HTTP', status: r.status };
      return r.text();
    }).then(function (t) {
      var doc = new DOMParser().parseFromString(t, 'application/xml');
      var entries = doc.getElementsByTagName('entry');
      var out = [];
      for (var i = 0; i < entries.length; i++) {
        var e = entries[i];
        var vid = tagText(e, 'yt:videoId') || tagText(e, 'videoId');
        var media = e.getElementsByTagName('media:thumbnail')[0] || e.getElementsByTagName('thumbnail')[0];
        out.push({
          id: vid,
          title: tagText(e, 'title'),
          published: tagText(e, 'published'),
          thumb: media ? media.getAttribute('url') : (vid ? 'https://i.ytimg.com/vi/' + vid + '/mqdefault.jpg' : ''),
          url: 'https://www.youtube.com/watch?v=' + vid
        });
      }
      return out.filter(function (v) { return v.id; });
    });
  }
  function tagText(node, tag) {
    var el = node.getElementsByTagName(tag)[0];
    if (!el) {
      // 네임스페이스 미해석 대비
      var local = tag.split(':').pop();
      var all = node.getElementsByTagName('*');
      for (var i = 0; i < all.length; i++) if (all[i].localName === local) { el = all[i]; break; }
    }
    return el ? (el.textContent || '').trim() : '';
  }

  /* ---------- 통합 로드 ---------- */
  function load(opts) {
    opts = opts || {};
    var cache = getCache();
    if (!opts.force && cache && cacheFresh()) {
      return Promise.resolve({ items: cache.items, note: null, source: 'cache' });
    }

    var p;
    if (s().youtubeKey) p = viaApi();
    else if (App.util.proxyAvailable()) p = viaRss();
    else return Promise.resolve({
      items: (cache && cache.items) || [],
      note: 'YouTube API 키가 없고 프록시(server.js)도 없어 새 영상을 가져올 수 없습니다. 설정에서 키를 입력하거나 node server.js 로 실행하세요.',
      source: 'none'
    });

    return p.then(function (items) {
      items.sort(function (a, b) { return new Date(b.published) - new Date(a.published); });
      App.store.set(CACHE_KEY, { fetchedAt: Date.now(), items: items });
      return { items: items, note: null, source: s().youtubeKey ? 'api' : 'rss' };
    }).catch(function (err) {
      var msg = err.code === 'API' ? ('YouTube API 오류: ' + (err.message || '')) :
        err.code === 'HTTP' ? ('HTTP ' + err.status) :
        ('가져오기 실패: ' + (err.message || err));
      return {
        items: (cache && cache.items) || [],
        note: msg + (cache ? ' — 마지막으로 받은 목록을 표시합니다.' : ''),
        source: 'error'
      };
    });
  }

  function newCount() {
    var c = getCache();
    if (!c || !c.items) return 0;
    var seen = getSeen();
    return c.items.filter(function (v) { return !seen[v.id]; }).length;
  }
  function markAllSeen() {
    var c = getCache();
    if (!c || !c.items) return;
    var seen = getSeen();
    c.items.forEach(function (v) { seen[v.id] = true; });
    setSeen(seen);
  }
  function markSeen(id) {
    var seen = getSeen();
    seen[id] = true;
    setSeen(seen);
  }

  return {
    load: load, newCount: newCount,
    markAllSeen: markAllSeen, markSeen: markSeen, getSeen: getSeen,
    CHANNEL_URL: 'https://www.youtube.com/@GugakFM991'
  };
})();
