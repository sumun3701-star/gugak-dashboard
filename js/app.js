/* app.js — 탭 라우팅 + 초기화 (전역 App.app) */
window.App = window.App || {};

App.app = (function () {
  var ytLoadedOnce = false;

  function init() {
    // 탭 전환
    var tabs = document.querySelectorAll('.tab');
    tabs.forEach(function (t) {
      t.addEventListener('click', function () { activate(t.dataset.tab); });
    });

    App.calendar.purgeOldHidden();   // 설정 화면이 그려지기 전에 오래된 숨김 항목 정리
    App.settings.initView();
    App.calendar.init();
    App.weekly.init();
    App.board.init();
    App.todos.init();
    App.scraps.init();
    App.notes.init();
    initYoutubeView();

    updateYtBadge();

    if (!App.store.available) {
      App.util.toast('브라우저 저장소를 쓸 수 없어 이번 세션에만 데이터가 유지됩니다.');
    }
  }

  function activate(name) {
    document.querySelectorAll('.tab').forEach(function (t) {
      t.classList.toggle('is-active', t.dataset.tab === name);
    });
    document.querySelectorAll('.view').forEach(function (v) {
      v.classList.toggle('is-active', v.id === 'view-' + name);
    });
    if (name === 'youtube' && !ytLoadedOnce) {
      ytLoadedOnce = true;
      loadYoutube(false);
    }
    // 아이디어 보드는 보이는 상태에서 크기·높이 측정이 필요 → 탭 전환 시 다시 그림
    if (name === 'notes' && App.notes) App.notes.render();
    window.scrollTo(0, 0);
  }

  /* ---------- 유튜브 뷰 ---------- */
  function initYoutubeView() {
    document.getElementById('ytRefresh').addEventListener('click', function () { loadYoutube(true); });
    document.getElementById('ytMarkAll').addEventListener('click', function () {
      App.youtube.markAllSeen();
      loadYoutube(false);
      updateYtBadge();
    });
  }

  function loadYoutube(force) {
    var status = document.getElementById('ytStatus');
    status.textContent = '불러오는 중…';
    App.youtube.load({ force: force }).then(function (res) {
      status.textContent = res.note || ('최신 ' + res.items.length + '건' +
        (res.source === 'rss' ? ' (RSS)' : res.source === 'api' ? ' (API)' : res.source === 'cache' ? ' (캐시)' : ''));
      renderYoutubeItems(res.items);
      updateYtBadge();
    });
  }

  function renderYoutubeItems(items) {
    var grid = document.getElementById('ytGrid');
    if (!items || !items.length) {
      grid.innerHTML = '<p class="muted">표시할 영상이 없습니다. <a href="' + App.youtube.CHANNEL_URL + '" target="_blank" rel="noopener">채널 바로가기 ↗</a></p>';
      return;
    }
    var seen = App.youtube.getSeen();
    grid.innerHTML = '';
    items.forEach(function (v) {
      var isNew = !seen[v.id];
      var a = document.createElement('a');
      a.className = 'yt-card' + (isNew ? ' is-new' : '');
      a.href = v.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.innerHTML =
        '<img class="thumb" loading="lazy" src="' + App.util.esc(v.thumb) + '" alt="" />' +
        '<div class="yt-meta">' +
        '<div class="yt-title">' + App.util.esc(v.title) + '</div>' +
        '<div class="yt-date">' + App.util.esc(App.util.relTime(v.published)) + '</div>' +
        (isNew ? '<span class="yt-new-tag">NEW</span>' : '') +
        '</div>';
      a.addEventListener('click', function () {
        App.youtube.markSeen(v.id);
        setTimeout(updateYtBadge, 100);
      });
      grid.appendChild(a);
    });
  }

  function updateYtBadge() {
    var n = App.youtube.newCount();
    var b = document.getElementById('ytBadge');
    if (n > 0) { b.textContent = n; b.hidden = false; }
    else b.hidden = true;
  }

  /* ---------- 홈 갱신 스탬프 (calendar 에서 호출) ---------- */
  function updateHomeStamp() { /* 확장 지점 */ }

  return { init: init, activate: activate, updateYtBadge: updateYtBadge, updateHomeStamp: updateHomeStamp };
})();

document.addEventListener('DOMContentLoaded', App.app.init);
