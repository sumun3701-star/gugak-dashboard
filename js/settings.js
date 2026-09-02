/* settings.js — 설정 상태 + 설정 화면 (전역 App.settings) */
window.App = window.App || {};

App.settings = (function () {
  var DEFAULTS = {
    kopisKey: '',
    youtubeKey: '',
    proxyBase: '',
    genreCode: 'CCCC',          // KOPIS 한국음악(국악)
    rangeDays: 90,
    maxPages: 10,
    designatedVenues: ['국립국악원', '남산국악당', '국립극장', '김희수아트센터'],
    fileLimitMB: 50
  };

  var state = load();

  function load() {
    var saved = App.store.get('settings', {});
    var s = {};
    Object.keys(DEFAULTS).forEach(function (k) {
      s[k] = (saved[k] !== undefined && saved[k] !== null) ? saved[k] : DEFAULTS[k];
    });
    return s;
  }

  function get() { return state; }

  function save(patch) {
    Object.keys(patch || {}).forEach(function (k) {
      if (k in DEFAULTS) state[k] = patch[k];
    });
    App.store.set('settings', state);
    return state;
  }

  /* ---------- 설정 화면 ---------- */
  function initView() {
    var $ = function (id) { return document.getElementById(id); };

    // 값 채우기
    $('setKopisKey').value = state.kopisKey;
    $('setYoutubeKey').value = state.youtubeKey;
    $('setProxyBase').value = state.proxyBase;
    $('setGenreCode').value = state.genreCode;
    $('setRangeDays').value = state.rangeDays;
    $('setDesignated').value = state.designatedVenues.join(', ');
    $('setFileLimit').value = state.fileLimitMB;
    showFileUsage();

    $('setSave').addEventListener('click', function () {
      save({
        kopisKey: $('setKopisKey').value.trim(),
        youtubeKey: $('setYoutubeKey').value.trim(),
        proxyBase: $('setProxyBase').value.trim(),
        genreCode: $('setGenreCode').value.trim() || 'CCCC',
        rangeDays: Math.min(365, Math.max(7, parseInt($('setRangeDays').value, 10) || 90)),
        designatedVenues: $('setDesignated').value.split(',').map(function (x) { return x.trim(); }).filter(Boolean),
        fileLimitMB: Math.min(500, Math.max(1, parseInt($('setFileLimit').value, 10) || 50))
      });
      var hint = $('setSaveHint');
      hint.textContent = '저장됨 · 공연정보를 새로고침하면 반영됩니다';
      setTimeout(function () { hint.textContent = ''; }, 4000);
      App.calendar && App.calendar.reload();
    });

    initManual($);
    initHidden($);
    initDataTools($);
  }

  function showFileUsage() {
    var el = document.getElementById('fileUsage');
    if (!el || !App.filedb || !App.filedb.available) { if (el) el.textContent = ''; return; }
    App.filedb.all().then(function (recs) {
      var bytes = recs.reduce(function (n, r) { return n + (r.blob && r.blob.size || 0); }, 0);
      var line = '현재 게시판 파일 ' + recs.length + '개 · ' + fmtBytes(bytes);
      return App.filedb.estimate().then(function (est) {
        if (est && est.quota) line += ' / 브라우저 허용 약 ' + fmtBytes(est.quota);
        el.textContent = line;
      });
    }).catch(function () {});
  }
  function fmtBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(0) + ' KB';
    if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
    return (n / 1073741824).toFixed(2) + ' GB';
  }

  /* ---------- 숨긴 공연 복원 (접기 가능) ---------- */
  function initHidden($) {
    var toggle = $('hiddenToggle');
    var box = $('hiddenBox');
    toggle.addEventListener('click', function () {
      var open = box.hidden;
      box.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      toggle.querySelector('.collapse-caret').textContent = open ? '▾' : '▸';
    });
    $('hiddenRestoreAll').addEventListener('click', function () {
      var h = App.store.get('hiddenPerfs', {});
      if (!Object.keys(h).length) return;
      if (!confirm('숨긴 공연을 모두 캘린더에 다시 표시할까요?')) return;
      App.store.remove('hiddenPerfs');
      renderHidden();
      App.calendar && App.calendar.reload();
    });
    renderHidden();
  }

  function agoText(ts) {
    if (!ts) return '';
    var days = Math.floor((Date.now() - ts) / 86400000);
    if (days <= 0) return '오늘 숨김';
    if (days < 31) return days + '일 전 숨김';
    return Math.floor(days / 30) + '개월 전 숨김';
  }

  function renderHidden() {
    var ul = document.getElementById('hiddenList');
    if (!ul) return;
    var h = App.store.get('hiddenPerfs', {});
    var ids = Object.keys(h);

    var summary = document.getElementById('hiddenSummary');
    var toggle = document.getElementById('hiddenToggle');
    if (summary) summary.textContent = '숨긴 공연 ' + ids.length + '건';
    if (toggle) toggle.disabled = ids.length === 0;

    if (!ids.length) { ul.innerHTML = '<li class="muted">숨긴 공연이 없습니다.</li>'; return; }

    // 최근에 숨긴 것부터
    ids.sort(function (a, b) { return (h[b] && h[b].hiddenAt || 0) - (h[a] && h[a].hiddenAt || 0); });
    ul.innerHTML = '';
    ids.forEach(function (id) {
      var info = h[id] || {};
      var li = document.createElement('li');
      li.innerHTML = '<span>' + App.util.esc(info.name || id) +
        (info.venue ? ' <span class="muted">· ' + App.util.esc(info.venue) + '</span>' : '') +
        (info.date ? ' <span class="muted">· ' + App.util.esc(App.util.fmtDateKo(info.date)) + '</span>' : '') +
        (info.hiddenAt ? ' <span class="muted">· ' + agoText(info.hiddenAt) + '</span>' : '') +
        '</span><button type="button" data-id="' + App.util.esc(id) + '">복원</button>';
      li.querySelector('button').addEventListener('click', function () {
        var cur = App.store.get('hiddenPerfs', {});
        delete cur[id];
        App.store.set('hiddenPerfs', cur);
        renderHidden();
        App.calendar && App.calendar.reload();
      });
      ul.appendChild(li);
    });
  }

  /* ---------- 수동 공연 등록 (CAL-9) ---------- */
  function getManual() { return App.store.get('manualPerfs', []); }
  function setManual(list) { App.store.set('manualPerfs', list); }

  function initManual($) {
    var form = $('manualForm');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var from = $('manFrom').value;
      var list = getManual();
      list.push({
        id: 'manual:' + App.util.uid(),
        name: $('manName').value.trim(),
        venue: $('manVenue').value.trim(),
        dateFrom: from,
        dateTo: $('manTo').value || from,
        url: $('manUrl').value.trim(),
        group: $('manGroup').value,
        source: 'manual'
      });
      setManual(list);
      form.reset();
      renderManual($);
      App.calendar && App.calendar.reload();
      App.util.toast('공연을 추가했습니다');
    });
    renderManual($);
  }

  function renderManual($) {
    var ul = $('manualList');
    var list = getManual();
    if (!list.length) { ul.innerHTML = '<li class="muted">수동 등록한 공연이 없습니다.</li>'; return; }
    ul.innerHTML = '';
    list.slice().reverse().forEach(function (p) {
      var li = document.createElement('li');
      li.innerHTML = '<span>' + App.util.esc(p.name) + ' <span class="muted">· ' + App.util.esc(p.venue) +
        ' · ' + App.util.esc(App.util.fmtDateRangeKo(p.dateFrom, p.dateTo)) + '</span></span>' +
        '<button type="button" data-id="' + p.id + '">삭제</button>';
      li.querySelector('button').addEventListener('click', function () {
        setManual(getManual().filter(function (x) { return x.id !== p.id; }));
        renderManual($);
        App.calendar && App.calendar.reload();
      });
      ul.appendChild(li);
    });
  }

  /* ---------- 데이터 내보내기/가져오기/초기화 ---------- */
  function blobToDataURL(blob) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
      r.readAsDataURL(blob);
    });
  }

  function initDataTools($) {
    $('dataExport').addEventListener('click', function () {
      var payload = App.store.exportAll();
      var filesP = (App.filedb && App.filedb.available) ? App.filedb.all() : Promise.resolve([]);
      App.util.toast('내보내는 중…');
      filesP.then(function (recs) {
        var chain = Promise.resolve([]);
        recs.forEach(function (rec) {
          chain = chain.then(function (acc) {
            return blobToDataURL(rec.blob).then(function (durl) {
              acc.push({ id: rec.id, meta: rec.meta || {}, data: durl });
              return acc;
            });
          });
        });
        return chain;
      }).then(function (files) {
        if (files.length) payload['__files__'] = JSON.stringify(files);
        var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'gugak-dashboard-' + App.util.ymd(new Date()) + '.json';
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      }).catch(function (e) { App.util.toast('내보내기 실패: ' + (e && e.message || e)); });
    });

    $('dataImportBtn').addEventListener('click', function () { $('dataImport').click(); });
    $('dataImport').addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var obj;
        try { obj = JSON.parse(reader.result); }
        catch (err) { App.util.toast('가져오기 실패: 올바른 JSON 파일이 아닙니다'); return; }

        App.store.importAll(obj);

        var filesP = Promise.resolve();
        if (obj.__files__ && App.filedb && App.filedb.available) {
          try {
            var files = JSON.parse(obj.__files__);
            filesP = Promise.all(files.map(function (f) {
              return fetch(f.data).then(function (r) { return r.blob(); })
                .then(function (b) { return App.filedb.put(f.id, b, f.meta || {}); });
            }));
          } catch (err) { /* 파일 복원 실패해도 나머지는 진행 */ }
        }
        App.util.toast('가져왔습니다. 새로고침합니다…');
        filesP.then(finish, finish);
        function finish() { setTimeout(function () { location.reload(); }, 800); }
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    $('dataClear').addEventListener('click', function () {
      if (!confirm('모든 데이터(설정·일정·할일·게시판·스크랩·노트·첨부파일)를 삭제합니다. 계속할까요?')) return;
      App.store.clearAll();
      var p = (App.filedb && App.filedb.available) ? App.filedb.clear() : Promise.resolve();
      p.then(done, done);
      function done() { location.reload(); }
    });
  }

  return { get: get, save: save, initView: initView, renderHidden: renderHidden, DEFAULTS: DEFAULTS };
})();
