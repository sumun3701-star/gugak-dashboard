/* calendar.js — 공연 캘린더 (전역 App.calendar) */
window.App = window.App || {};

App.calendar = (function () {
  var U = App.util;
  var DESIGNATED_FIXED = ['국립국악원', '남산국악당', '국립극장', '김희수아트센터'];
  // 개인 일정 종류
  var PE_KINDS = { work: '업무', watch: '공연 관람', personal: '개인' };
  function peKind(ev) { return PE_KINDS[ev && ev.kind] ? ev.kind : 'personal'; }
  function peLabel(ev) { return PE_KINDS[peKind(ev)]; }

  var viewMonth;          // Date (해당 달 1일)
  var performances = [];   // 현재 로드된 공연 목록
  var loading = false;

  // 관심(별표)는 "공연 + 날짜" 단위로 저장 — key: "<perfId>|YYYY-MM-DD"
  function getInterested() { return App.store.get('interested', {}); }
  function setInterested(m) { App.store.set('interested', m); }
  function intKey(id, ymd) { return id + '|' + ymd; }
  function isInterested(id, ymd) { return !!getInterested()[intKey(id, ymd)]; }
  function anyInterested(id) {
    var m = getInterested(), pre = id + '|';
    for (var k in m) if (m[k] && k.indexOf(pre) === 0) return true;
    return false;
  }
  function clearInterested(id) {
    var m = getInterested(), pre = id + '|', removed = [];
    for (var k in m) if (k.indexOf(pre) === 0) { removed.push(k); delete m[k]; }
    if (removed.length) setInterested(m);
    return removed;
  }
  // 예전(공연 id만으로 저장된) 관심 표시 → "id|첫날" 형식으로 1회 변환
  function migrateInterested() {
    var m = getInterested(), changed = false;
    Object.keys(m).forEach(function (k) {
      if (!m[k] || k.indexOf('|') !== -1) return;
      var perf = performances.filter(function (p) { return p.id === k; })[0];
      delete m[k];
      if (perf && perf.dateFrom) m[k + '|' + perf.dateFrom] = true;
      changed = true;
    });
    if (changed) setInterested(m);
  }
  function getPersonal() { return App.store.get('personalEvents', []); }
  function setPersonal(list) { App.store.set('personalEvents', list); }
  // 사용자가 캘린더에서 숨긴(삭제한) 자동수집·샘플 공연 { id: {name, venue, date, hiddenAt} }
  function getHidden() { return App.store.get('hiddenPerfs', {}); }
  function setHidden(m) { App.store.set('hiddenPerfs', m); }
  // 숨긴 지 2개월 지난 항목 자동 삭제 + hiddenAt 없는 예전 항목 보정
  function purgeOldHidden() {
    var h = getHidden();
    var now = Date.now();
    var cut = new Date(); cut.setMonth(cut.getMonth() - 2);
    var cutMs = cut.getTime();
    var changed = false, purged = 0;
    Object.keys(h).forEach(function (id) {
      var info = h[id];
      if (!info || typeof info !== 'object') { h[id] = { hiddenAt: now }; changed = true; return; }
      if (!info.hiddenAt) { info.hiddenAt = now; changed = true; return; }
      if (info.hiddenAt < cutMs) { delete h[id]; changed = true; purged++; }
    });
    if (changed) setHidden(h);
    return purged;
  }

  function getFilters() {
    return App.store.get('calFilters', {
      venues: { '국립국악원': true, '남산국악당': true, '국립극장': true, '김희수아트센터': true, '__discovered__': true, '__personal__': true },
      region: 'metro',
      onlyInterested: false
    });
  }
  function setFilters(f) { App.store.set('calFilters', f); }

  /* ---------- 초기화 ---------- */
  function init() {
    viewMonth = new Date();
    viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);

    document.getElementById('calPrev').addEventListener('click', function () { shiftMonth(-1); });
    document.getElementById('calNext').addEventListener('click', function () { shiftMonth(1); });
    document.getElementById('calToday').addEventListener('click', function () {
      viewMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      render();
    });
    document.getElementById('calRefresh').addEventListener('click', function () { reload(true); });

    // 필터 UI 초기 상태 반영
    var f = getFilters();
    document.querySelectorAll('.venue-filter').forEach(function (cb) {
      cb.checked = f.venues[cb.value] !== false;
      cb.addEventListener('change', function () {
        var ff = getFilters();
        ff.venues[cb.value] = cb.checked;
        setFilters(ff);
        render();
        App.weekly && App.weekly.refresh();
      });
    });
    var region = document.getElementById('regionSelect');
    region.value = f.region;
    region.addEventListener('change', function () {
      var ff = getFilters(); ff.region = region.value; setFilters(ff);
      render(); App.weekly && App.weekly.refresh();
    });
    var oi = document.getElementById('onlyInterested');
    oi.checked = !!f.onlyInterested;
    oi.addEventListener('change', function () {
      var ff = getFilters(); ff.onlyInterested = oi.checked; setFilters(ff);
      render();
    });

    initModal();
    reload(false);
  }

  function shiftMonth(delta) {
    viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + delta, 1);
    render();
  }

  /* ---------- 데이터 로드 ---------- */
  function reload(force) {
    loading = true;
    setStatus('공연 정보를 불러오는 중…');
    App.kopis.loadPerformances({
      force: force,
      onProgress: setStatus
    }).then(function (res) {
      performances = res.items || [];
      loading = false;
      migrateInterested();
      var when = App.kopis.getCache();
      var stamp = when ? (' · 최근 갱신 ' + U.fmtDateTimeKo(new Date(when.fetchedAt).toISOString())) : '';
      if (res.note) setStatus(res.note + stamp, true);
      else setStatus('공연 ' + performances.length + '건' +
        (res.source === 'sample' ? ' (샘플)' : res.source === 'manual' ? ' (수동)' : '') + stamp);
      render();
      App.weekly && App.weekly.refresh();
      App.app && App.app.updateHomeStamp();
    }).catch(function (err) {
      loading = false;
      setStatus('불러오기 실패: ' + App.kopis.errMsg(err), true);
    });
  }

  function setStatus(msg, isErr) {
    var el = document.getElementById('calStatus');
    el.textContent = msg || '';
    el.classList.toggle('error', !!isErr);
  }

  /* ---------- 필터 적용 ---------- */
  function whichDesignated(venueName) {
    for (var i = 0; i < DESIGNATED_FIXED.length; i++) {
      if (venueName.indexOf(DESIGNATED_FIXED[i]) !== -1) return DESIGNATED_FIXED[i];
    }
    return null;
  }

  function visiblePerformances() {
    var f = getFilters();
    var hidden = getHidden();
    return performances.filter(function (p) {
      if (hidden[p.id]) return false;
      // 지역 정보(area)가 있을 때만 수도권 필터 적용 — area 미제공 시 숨기지 않음
      if (f.region === 'metro' && p.area && !p.metro && p.source !== 'manual') return false;
      if (p.group === 'designated') {
        var key = whichDesignated(p.venue);
        if (key) return f.venues[key] !== false;
        return f.venues['__discovered__'] !== false;
      }
      return f.venues['__discovered__'] !== false;
    });
  }

  function personalVisible() {
    return getFilters().venues['__personal__'] !== false;
  }

  /* ---------- 특정 날짜의 항목 ---------- */
  function itemsOnDay(day) {
    var out = [];
    if (personalVisible()) {
      getPersonal().forEach(function (ev) {
        var d = U.parseDate(ev.date);
        if (d && U.sameDay(d, day)) out.push({ kind: 'personal', ev: ev });
      });
    }
    var f = getFilters();
    var ymd = U.ymd(day);
    visiblePerformances().forEach(function (p) {
      var from = U.parseDate(p.dateFrom), to = U.parseDate(p.dateTo) || from;
      if (!from || !U.dayInRange(day, from, to)) return;
      var starred = isInterested(p.id, ymd);
      if (f.onlyInterested && !starred) return; // "관심 공연만" → 별표한 날짜만 표시
      out.push({ kind: 'perf', perf: p, interested: starred });
    });
    // 관심(체크)한 공연을 맨 위로 — 나머지 순서(개인 일정 → 공연)는 그대로 유지 (안정 정렬)
    out.sort(function (a, b) {
      var ai = (a.kind === 'perf' && a.interested) ? 0 : 1;
      var bi = (b.kind === 'perf' && b.interested) ? 0 : 1;
      return ai - bi;
    });
    return out;
  }

  /* ---------- 렌더 ---------- */
  function render() {
    document.getElementById('calTitle').textContent = viewMonth.getFullYear() + '년 ' + (viewMonth.getMonth() + 1) + '월';
    var grid = document.getElementById('calGrid');
    grid.innerHTML = '';

    var first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    var startOffset = (first.getDay() + 6) % 7; // 월요일 시작
    var gridStart = U.addDays(first, -startOffset);
    var today = new Date();

    // 이 달에 실제로 필요한 주(행) 수만 렌더 — 대부분 5줄, 필요 시 4·6줄
    var daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
    var weeks = Math.ceil((startOffset + daysInMonth) / 7);
    var cellCount = weeks * 7;

    for (var i = 0; i < cellCount; i++) {
      var day = U.addDays(gridStart, i);
      var cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cal-cell';
      if (day.getMonth() !== viewMonth.getMonth()) cell.classList.add('is-muted');
      if (U.sameDay(day, today)) cell.classList.add('is-today');

      var head = document.createElement('span');
      head.className = 'cell-date';
      head.textContent = day.getDate();
      cell.appendChild(head);

      var items = itemsOnDay(day);
      var CELL_MAX = 5;
      items.slice(0, CELL_MAX).forEach(function (it) {
        var e = document.createElement('span');
        if (it.kind === 'personal') {
          e.className = 'evt personal pe-' + peKind(it.ev);
          e.textContent = (it.ev.time ? it.ev.time + ' ' : '') + it.ev.title;
        } else {
          e.className = 'evt ' + it.perf.group;
          e.textContent = (it.interested ? '★ ' : '') + it.perf.name;
        }
        cell.appendChild(e);
      });
      if (items.length > CELL_MAX) {
        var more = document.createElement('span');
        more.className = 'evt-more';
        more.textContent = '+' + (items.length - CELL_MAX) + ' 더보기';
        cell.appendChild(more);
      }

      (function (d) {
        cell.addEventListener('click', function () { openModal(d); });
      })(new Date(day.getFullYear(), day.getMonth(), day.getDate()));

      grid.appendChild(cell);
    }

    renderPinned();
  }

  /* ---------- 상단 고정: 관심 공연 + 개인 일정 ---------- */
  function renderPinned() {
    var box = document.getElementById('calPinned');
    if (!box) return;
    var now = new Date();
    var t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var interested = getInterested();
    var hidden = getHidden();
    var items = [];

    Object.keys(interested).forEach(function (k) {
      if (!interested[k]) return;
      var sep = k.lastIndexOf('|');
      if (sep < 0) return;
      var id = k.slice(0, sep), ymd = k.slice(sep + 1);
      if (hidden[id]) return;
      var p = performances.filter(function (x) { return x.id === id; })[0];
      if (!p) return;
      var d = U.parseDate(ymd);
      if (!d || d < t0) return; // 지난 날짜 제외
      items.push({ sort: d.getTime(), day: d, kind: 'perf', group: p.group, title: p.name, sub: p.venue });
    });

    getPersonal().forEach(function (ev) {
      var d = U.parseDate(ev.date);
      if (!d || d < t0) return;
      items.push({
        sort: d.getTime(), day: d, kind: 'personal', pe: peKind(ev),
        title: ev.title, sub: (ev.time ? ev.time + ' · ' : '') + peLabel(ev)
      });
    });

    if (!items.length) { box.hidden = true; box.innerHTML = ''; return; }
    items.sort(function (a, b) { return a.sort - b.sort; });

    var MAX = 24;
    var shown = items.slice(0, MAX);
    var chips = shown.map(function (it) {
      var cls = it.kind === 'personal' ? ('personal pe-' + it.pe) : it.group;
      var ic = it.kind === 'personal' ? '📌' : '★';
      var md = (it.day.getMonth() + 1) + '/' + it.day.getDate();
      var dd = Math.round((it.day - t0) / 86400000);
      var dtag = dd === 0 ? '오늘' : dd === 1 ? '내일' : ('D-' + dd);
      return '<button type="button" class="pin-item ' + cls + '" data-d="' + U.ymd(it.day) + '">' +
        '<span class="pin-ic">' + ic + '</span>' +
        '<span class="pin-date">' + md + ' <em>' + dtag + '</em></span>' +
        '<span class="pin-title">' + U.esc(it.title) + '</span>' +
        (it.sub ? '<span class="pin-sub">' + U.esc(it.sub) + '</span>' : '') +
        '</button>';
    }).join('');
    var more = items.length > MAX ? '<span class="pin-more">+' + (items.length - MAX) + '</span>' : '';

    box.hidden = false;
    box.innerHTML =
      '<span class="cal-pinned-label">📌 챙길 공연·일정 <b>' + items.length + '</b></span>' +
      '<div class="cal-pinned-row">' + chips + more + '</div>';

    box.querySelectorAll('.pin-item').forEach(function (b) {
      b.addEventListener('click', function () {
        var d = U.parseDate(b.dataset.d);
        if (d) openModal(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
      });
    });
  }

  /* ---------- 날짜 상세 모달 ---------- */
  var modalDay = null;
  function initModal() {
    var modal = document.getElementById('dayModal');
    modal.querySelectorAll('[data-close]').forEach(function (b) {
      b.addEventListener('click', closeModal);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modal.hidden) closeModal();
    });
    document.getElementById('dayAddForm').addEventListener('submit', function (e) {
      e.preventDefault();
      if (!modalDay) return;
      var kindEl = document.querySelector('#dayAddForm input[name="peKind"]:checked');
      var list = getPersonal();
      list.push({
        id: 'pe:' + U.uid(),
        title: document.getElementById('dayAddTitle').value.trim(),
        date: U.ymd(modalDay),
        time: document.getElementById('dayAddTime').value || '',
        memo: document.getElementById('dayAddMemo').value.trim(),
        kind: (kindEl && PE_KINDS[kindEl.value]) ? kindEl.value : 'work'
      });
      setPersonal(list);
      e.target.reset();
      renderModal();
      render();
      App.weekly && App.weekly.refresh();
      U.toast('개인 일정을 추가했습니다');
    });
  }

  function openModal(day) {
    modalDay = day;
    document.getElementById('dayModal').hidden = false;
    renderModal();
  }
  function closeModal() {
    document.getElementById('dayModal').hidden = true;
    modalDay = null;
  }

  function renderModal() {
    if (!modalDay) return;
    document.getElementById('dayModalTitle').textContent =
      modalDay.getFullYear() + '. ' + U.pad(modalDay.getMonth() + 1) + '. ' + U.pad(modalDay.getDate()) +
      ' (' + ['일', '월', '화', '수', '목', '금', '토'][modalDay.getDay()] + ')';

    var mdYmd = U.ymd(modalDay);
    var box = document.getElementById('dayModalContent');
    var items = itemsOnDay(modalDay);
    if (!items.length) {
      box.innerHTML = '<p class="md-empty">이 날짜에 공연·일정이 없습니다.</p>';
      return;
    }
    box.innerHTML = '';

    items.forEach(function (it) {
      var row = document.createElement('div');
      if (it.kind === 'personal') {
        row.className = 'md-item personal pe-' + peKind(it.ev);
        row.innerHTML =
          '<div class="md-main">' +
          '<div class="md-title">' + U.esc(it.ev.title) + '</div>' +
          '<div class="md-sub">' + U.esc(peLabel(it.ev)) + (it.ev.time ? ' · ' + U.esc(it.ev.time) : '') +
          (it.ev.memo ? ' · ' + U.esc(it.ev.memo) : '') + '</div>' +
          '</div>' +
          '<button class="md-del" title="삭제">🗑</button>';
        row.querySelector('.md-del').addEventListener('click', function () {
          setPersonal(getPersonal().filter(function (x) { return x.id !== it.ev.id; }));
          renderModal(); render(); App.weekly && App.weekly.refresh();
        });
      } else {
        var p = it.perf;
        row.className = 'md-item ' + p.group;
        var label = p.group === 'designated' ? '지정 공연장' : '그 외 국악 공연';
        row.innerHTML =
          '<label style="display:flex;align-items:center;"><input type="checkbox" class="md-int"' +
          (isInterested(p.id, mdYmd) ? ' checked' : '') + ' title="이 날짜 관심 표시" /></label>' +
          '<div class="md-main">' +
          '<div class="md-title">' +
          (p.url ? '<a href="#" class="md-link">' + U.esc(p.name) + ' ↗</a>' : U.esc(p.name)) +
          '</div>' +
          '<div class="md-sub">' + U.esc(label) + ' · ' + U.esc(p.venue) +
          (p.area ? ' · ' + U.esc(p.area) : '') +
          ' · ' + U.esc(U.fmtDateRangeKo(p.dateFrom, p.dateTo)) +
          (p.source === 'manual' ? ' · 수동등록' : p.source === 'sample' ? ' · 샘플' : '') +
          '</div></div>' +
          '<button class="md-del" title="' +
          (p.source === 'manual' ? '삭제' : '캘린더에서 숨기기') + '">' +
          (p.source === 'manual' ? '🗑' : '✕') + '</button>';
        row.querySelector('.md-int').addEventListener('change', function (e) {
          var m = getInterested();
          var key = intKey(p.id, mdYmd);
          if (e.target.checked) m[key] = true; else delete m[key];
          setInterested(m);
          render();
          App.weekly && App.weekly.refresh();
        });
        row.querySelector('.md-del').addEventListener('click', function () {
          var isManual = p.source === 'manual';
          if (isManual) {
            App.store.set('manualPerfs',
              App.store.get('manualPerfs', []).filter(function (x) { return x.id !== p.id; }));
          } else {
            var h = getHidden();
            h[p.id] = { name: p.name, venue: p.venue, date: p.dateFrom, hiddenAt: Date.now() };
            setHidden(h);
          }
          var i = performances.findIndex(function (x) { return x.id === p.id; });
          if (i !== -1) performances.splice(i, 1);
          var savedIntKeys = clearInterested(p.id);
          renderModal();
          render();
          App.weekly && App.weekly.refresh();
          App.settings && App.settings.renderHidden && App.settings.renderHidden();

          U.toast((isManual ? '삭제: ' : '숨김: ') + p.name, {
            label: '되돌리기',
            onClick: function () {
              if (isManual) {
                var list = App.store.get('manualPerfs', []);
                list.push({
                  id: p.id, name: p.name, venue: p.venue,
                  dateFrom: p.dateFrom, dateTo: p.dateTo, url: p.url,
                  group: p.group, source: 'manual'
                });
                App.store.set('manualPerfs', list);
              } else {
                var hh = getHidden(); delete hh[p.id]; setHidden(hh);
              }
              if (savedIntKeys.length) {
                var mi = getInterested();
                savedIntKeys.forEach(function (k) { mi[k] = true; });
                setInterested(mi);
              }
              App.settings && App.settings.renderHidden && App.settings.renderHidden();
              reload(false);
            }
          });
        });
        var link = row.querySelector('.md-link');
        if (link) {
          link.addEventListener('click', function (e) {
            e.preventDefault();
            openPerfLink(p);
          });
        }
      }
      box.appendChild(row);
    });
  }

  function openPerfLink(p) {
    // KOPIS 자동수집 항목은 상세(예매) URL 을 지연 조회 시도
    if (p.source === 'kopis' && /kopis\.or\.kr/.test(p.url || '')) {
      U.toast('예매 링크 확인 중…');
      App.kopis.fetchDetailUrl(p.id).then(function (u) {
        window.open(u || p.url, '_blank', 'noopener');
      });
    } else {
      window.open(p.url, '_blank', 'noopener');
    }
  }

  /* ---------- 외부 노출 (주간 일정 연동용) ---------- */
  // 별표한 (공연, 날짜) 항목 목록 — [{ perf, ymd, day }]
  function interestedEntries() {
    var m = getInterested();
    var hidden = getHidden();
    var out = [];
    Object.keys(m).forEach(function (k) {
      if (!m[k]) return;
      var sep = k.lastIndexOf('|');
      if (sep < 0) return;
      var id = k.slice(0, sep), ymd = k.slice(sep + 1);
      if (hidden[id]) return;
      var p = performances.filter(function (x) { return x.id === id; })[0];
      if (!p) return;
      out.push({ perf: p, ymd: ymd, day: U.parseDate(ymd) });
    });
    return out;
  }

  return {
    init: init,
    reload: reload,
    refresh: render,
    getPersonal: getPersonal,
    interestedEntries: interestedEntries,
    purgeOldHidden: purgeOldHidden
  };
})();
