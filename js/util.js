/* util.js — 공통 헬퍼 (전역 App.util) */
window.App = window.App || {};

App.util = (function () {
  function pad(n) { return String(n).padStart(2, '0'); }

  // Date -> 'YYYY-MM-DD'
  function ymd(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  // Date -> 'YYYYMMDD' (KOPIS 파라미터용)
  function ymdCompact(d) {
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
  }
  // 'YYYY-MM-DD' | 'YYYY.MM.DD' | 'YYYYMMDD' -> Date (local)
  function parseDate(s) {
    if (!s) return null;
    s = String(s).trim();
    var m = s.match(/(\d{4})[.\-/]?(\d{2})[.\-/]?(\d{2})/);
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3]);
  }
  function addDays(d, n) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() + n);
    return x;
  }
  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }
  // 월요일 기준 주 시작
  function startOfWeek(d) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var day = (x.getDay() + 6) % 7; // Mon=0 ... Sun=6
    x.setDate(x.getDate() - day);
    return x;
  }
  function weekKey(d) { return ymd(startOfWeek(d)); }

  // [from,to] 범위가 [a,b] 범위와 겹치는가 (모두 Date, 날짜 단위)
  function rangesOverlap(from, to, a, b) {
    var f = from.getTime(), t = (to || from).getTime();
    var aa = a.getTime(), bb = (b || a).getTime();
    return f <= bb && aa <= t;
  }
  function dayInRange(day, from, to) {
    var d = day.getTime();
    return d >= new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()
      && d <= new Date((to || from).getFullYear(), (to || from).getMonth(), (to || from).getDate()).getTime();
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtDateKo(s) {
    var d = parseDate(s);
    if (!d) return s || '';
    return (d.getMonth() + 1) + '월 ' + d.getDate() + '일';
  }
  function fmtDateRangeKo(from, to) {
    if (!to || from === to) return fmtDateKo(from);
    return fmtDateKo(from) + ' ~ ' + fmtDateKo(to);
  }
  function fmtDateTimeKo(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return iso || '';
    return d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function relTime(iso) {
    var d = new Date(iso), now = Date.now();
    var diff = (now - d.getTime()) / 1000;
    if (isNaN(diff)) return '';
    if (diff < 3600) return Math.max(1, Math.floor(diff / 60)) + '분 전';
    if (diff < 86400) return Math.floor(diff / 3600) + '시간 전';
    if (diff < 86400 * 7) return Math.floor(diff / 86400) + '일 전';
    return fmtDateTimeKo(iso).slice(0, 10);
  }

  // toast(msg) 또는 toast(msg, { label, onClick }) — 두 번째 인자로 실행취소 버튼 표시
  function toast(msg, action) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    if (action && action.label && typeof action.onClick === 'function') {
      var b = document.createElement('button');
      b.className = 'toast-action';
      b.type = 'button';
      b.textContent = action.label;
      b.addEventListener('click', function () {
        clearTimeout(toast._t);
        t.hidden = true;
        action.onClick();
      });
      t.appendChild(b);
    }
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, action ? 6000 : 2600);
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, ms || 200);
    };
  }

  // 서버(server.js)나 외부 프록시를 통한 자동수집이 가능한 환경인가
  function proxyAvailable() {
    var base = (App.settings && App.settings.get().proxyBase) || '';
    if (base) return true;
    return location.protocol === 'http:' || location.protocol === 'https:';
  }
  function proxyBase() {
    return ((App.settings && App.settings.get().proxyBase) || '').replace(/\/$/, '');
  }

  return {
    pad: pad, ymd: ymd, ymdCompact: ymdCompact, parseDate: parseDate,
    addDays: addDays, sameDay: sameDay, startOfWeek: startOfWeek, weekKey: weekKey,
    rangesOverlap: rangesOverlap, dayInRange: dayInRange,
    uid: uid, esc: esc,
    fmtDateKo: fmtDateKo, fmtDateRangeKo: fmtDateRangeKo, fmtDateTimeKo: fmtDateTimeKo, relTime: relTime,
    toast: toast, debounce: debounce, proxyAvailable: proxyAvailable, proxyBase: proxyBase
  };
})();
