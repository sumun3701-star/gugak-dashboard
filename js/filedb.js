/* filedb.js — 게시판 첨부파일 저장소 (IndexedDB, 전역 App.filedb)
   localStorage(~5MB)의 용량 한계를 벗어나 큰 파일을 보관하기 위한 래퍼. */
window.App = window.App || {};

App.filedb = (function () {
  var DB_NAME = 'gugak-files';
  var STORE = 'files';
  var VERSION = 1;
  var _db = null;

  var available = !!window.indexedDB;

  function open() {
    return new Promise(function (resolve, reject) {
      if (_db) return resolve(_db);
      if (!available) return reject(new Error('이 브라우저는 IndexedDB를 지원하지 않습니다'));
      var req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = function () { _db = req.result; resolve(_db); };
      req.onerror = function () { reject(req.error || new Error('IndexedDB 열기 실패')); };
    });
  }

  function withStore(mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(STORE, mode);
        var store = t.objectStore(STORE);
        var out = fn(store);
        t.oncomplete = function () { resolve(out && out.__result !== undefined ? out.__result : out); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error || new Error('트랜잭션 중단')); };
      });
    });
  }

  function put(id, blob, meta) {
    return withStore('readwrite', function (store) {
      var box = {};
      var r = store.put({ id: id, blob: blob, meta: meta || {}, savedAt: Date.now() });
      r.onsuccess = function () { box.__result = true; };
      return box;
    });
  }

  function get(id) {
    return withStore('readonly', function (store) {
      var box = {};
      var r = store.get(id);
      r.onsuccess = function () { box.__result = r.result || null; };
      return box;
    });
  }

  function del(id) {
    return withStore('readwrite', function (store) {
      var box = {};
      var r = store.delete(id);
      r.onsuccess = function () { box.__result = true; };
      return box;
    });
  }

  function all() {
    return withStore('readonly', function (store) {
      var box = {};
      var r = store.getAll();
      r.onsuccess = function () { box.__result = r.result || []; };
      return box;
    });
  }

  function clear() {
    return withStore('readwrite', function (store) {
      var box = {};
      var r = store.clear();
      r.onsuccess = function () { box.__result = true; };
      return box;
    });
  }

  function estimate() {
    if (navigator.storage && navigator.storage.estimate) return navigator.storage.estimate();
    return Promise.resolve(null);
  }

  return {
    available: available,
    put: put, get: get, del: del, all: all, clear: clear, estimate: estimate
  };
})();
