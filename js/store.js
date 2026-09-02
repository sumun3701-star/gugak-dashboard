/* store.js — localStorage 래퍼 (전역 App.store) */
window.App = window.App || {};

App.store = (function () {
  var PREFIX = 'gugak.';
  var memFallback = {}; // localStorage 사용 불가 시 임시 보관 (세션 한정)
  var lsOk = (function () {
    try {
      var k = '__t' + Math.random();
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch (e) { return false; }
  })();

  function get(key, def) {
    var raw;
    try {
      raw = lsOk ? localStorage.getItem(PREFIX + key) : memFallback[key];
    } catch (e) { raw = memFallback[key]; }
    if (raw == null) return def;
    try { return JSON.parse(raw); } catch (e) { return def; }
  }

  function set(key, val) {
    var raw = JSON.stringify(val);
    try {
      if (lsOk) localStorage.setItem(PREFIX + key, raw);
      else memFallback[key] = raw;
      return true;
    } catch (e) {
      memFallback[key] = raw;
      App.util && App.util.toast('저장 공간이 가득 찼습니다. 게시판 파일을 정리해 주세요.');
      console.warn('store.set failed:', key, e);
      return false;
    }
  }

  function remove(key) {
    try { if (lsOk) localStorage.removeItem(PREFIX + key); } catch (e) {}
    delete memFallback[key];
  }

  function rawKeys() {
    if (!lsOk) return Object.keys(memFallback).map(function (k) { return PREFIX + k; });
    return Object.keys(localStorage).filter(function (k) { return k.indexOf(PREFIX) === 0; });
  }

  function exportAll() {
    var o = {};
    rawKeys().forEach(function (k) {
      try { o[k] = lsOk ? localStorage.getItem(k) : memFallback[k.slice(PREFIX.length)]; } catch (e) {}
    });
    return o;
  }

  function importAll(obj) {
    Object.keys(obj || {}).forEach(function (k) {
      if (k.indexOf(PREFIX) !== 0) return;
      try {
        if (lsOk) localStorage.setItem(k, obj[k]);
        else memFallback[k.slice(PREFIX.length)] = obj[k];
      } catch (e) {}
    });
  }

  function clearAll() {
    rawKeys().forEach(function (k) {
      try { if (lsOk) localStorage.removeItem(k); } catch (e) {}
    });
    memFallback = {};
  }

  function usageBytes() {
    var n = 0;
    rawKeys().forEach(function (k) {
      var v = lsOk ? localStorage.getItem(k) : memFallback[k.slice(PREFIX.length)];
      n += (k.length + (v ? v.length : 0)) * 2;
    });
    return n;
  }

  return {
    available: lsOk,
    get: get, set: set, remove: remove,
    exportAll: exportAll, importAll: importAll, clearAll: clearAll,
    usageBytes: usageBytes
  };
})();
