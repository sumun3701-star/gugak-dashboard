/* weekly.js — 주간 일정 (전역 App.weekly) */
window.App = window.App || {};

App.weekly = (function () {
  var U = App.util;
  var weekStart; // Date (해당 주 월요일)

  function getTodos() { return App.store.get('weeklyTodos', []); }
  function setTodos(list) { App.store.set('weeklyTodos', list); }
  function getSyncDone() { return App.store.get('weeklySyncDone', {}); }
  function setSyncDone(m) { App.store.set('weeklySyncDone', m); }

  function init() {
    weekStart = U.startOfWeek(new Date());
    document.getElementById('weekPrev').addEventListener('click', function () { shift(-7); });
    document.getElementById('weekNext').addEventListener('click', function () { shift(7); });
    document.getElementById('weekThis').addEventListener('click', function () {
      weekStart = U.startOfWeek(new Date()); refresh();
    });
    document.getElementById('weekAddForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var input = document.getElementById('weekAddInput');
      var text = input.value.trim();
      if (!text) return;
      var list = getTodos();
      list.push({ id: 'wt:' + U.uid(), text: text, done: false, weekKey: U.ymd(weekStart) });
      setTodos(list);
      input.value = '';
      refresh();
    });
    refresh();
  }

  function shift(days) {
    weekStart = U.addDays(weekStart, days);
    refresh();
  }

  function weekEnd() { return U.addDays(weekStart, 6); }

  function fmtWeekLabel() {
    var a = weekStart, b = weekEnd();
    var thisWk = U.ymd(U.startOfWeek(new Date()));
    var tag = U.ymd(a) === thisWk ? '이번 주 · ' : '';
    return tag + (a.getMonth() + 1) + '/' + a.getDate() + ' ~ ' + (b.getMonth() + 1) + '/' + b.getDate();
  }

  /* ---------- 캘린더 → 주간 연동 항목 (WEEK-4, 단방향) ---------- */
  function syncedItems() {
    var start = weekStart, end = weekEnd();
    var out = [];

    var PE_LABEL = { work: '업무', watch: '공연 관람', personal: '개인' };
    App.calendar.getPersonal().forEach(function (ev) {
      var d = U.parseDate(ev.date);
      if (d && d >= start && d <= U.addDays(end, 1)) {
        out.push({
          srcId: ev.id,
          label: '📌 ' + ev.title + (ev.time ? ' (' + ev.time + ')' : ''),
          sub: U.fmtDateKo(ev.date) + ' · ' + (PE_LABEL[ev.kind] || '개인 일정')
        });
      }
    });

    App.calendar.interestedEntries().forEach(function (e) {
      var d = e.day;
      if (d && d >= start && d <= U.addDays(end, 1)) {
        out.push({
          srcId: e.perf.id + '|' + e.ymd,
          label: '🎫 ' + e.perf.name,
          sub: e.perf.venue + ' · ' + U.fmtDateKo(e.ymd) + ' · 관심 공연'
        });
      }
    });

    return out;
  }

  /* ---------- 렌더 ---------- */
  function refresh() {
    document.getElementById('weekTitle').textContent = fmtWeekLabel();
    renderSynced();
    renderTodos();
  }

  function renderSynced() {
    var ul = document.getElementById('weekSyncedList');
    var items = syncedItems();
    var wk = U.ymd(weekStart);
    var doneMap = getSyncDone();
    ul.innerHTML = '';
    if (!items.length) {
      ul.innerHTML = '<li class="todo-empty">이 주에 연동된 캘린더 일정이 없습니다. 캘린더에서 개인 일정을 추가하거나 공연을 관심 표시하세요.</li>';
      return;
    }
    items.forEach(function (it) {
      var key = wk + '|' + it.srcId;
      var done = !!doneMap[key];
      var li = document.createElement('li');
      if (done) li.className = 'done';
      li.innerHTML =
        '<input type="checkbox" ' + (done ? 'checked' : '') + ' />' +
        '<span class="todo-text">' + U.esc(it.label) + '<br><span class="todo-src">' + U.esc(it.sub) + '</span></span>';
      li.querySelector('input').addEventListener('change', function (e) {
        var m = getSyncDone();
        if (e.target.checked) m[key] = true; else delete m[key];
        setSyncDone(m);
        refresh();
      });
      ul.appendChild(li);
    });
  }

  function renderTodos() {
    var ul = document.getElementById('weekTodoList');
    var wk = U.ymd(weekStart);
    var list = getTodos().filter(function (t) { return t.weekKey === wk; });
    ul.innerHTML = '';
    if (!list.length) {
      ul.innerHTML = '<li class="todo-empty">직접 추가한 할일이 없습니다.</li>';
      return;
    }
    list.forEach(function (t) {
      var li = document.createElement('li');
      if (t.done) li.className = 'done';
      li.innerHTML =
        '<input type="checkbox" ' + (t.done ? 'checked' : '') + ' />' +
        '<span class="todo-text">' + U.esc(t.text) + '</span>' +
        '<button class="todo-del" title="삭제">×</button>';
      li.querySelector('input').addEventListener('change', function () {
        var all = getTodos();
        var item = all.find(function (x) { return x.id === t.id; });
        if (item) { item.done = !item.done; setTodos(all); refresh(); }
      });
      li.querySelector('.todo-del').addEventListener('click', function () {
        setTodos(getTodos().filter(function (x) { return x.id !== t.id; }));
        refresh();
      });
      ul.appendChild(li);
    });
  }

  return { init: init, refresh: refresh };
})();
