/* board.js — 작업물 게시판 (완료된 작업물 보관: 링크 / 파일, 전역 App.board)
   2단계 카테고리는 App.makeCatTree(js/cattree.js) 공용 모듈 사용. 파일 첨부는 IndexedDB. */
window.App = window.App || {};

App.board = (function () {
  var U = App.util;
  var CT = null;

  function getItems() { return App.store.get('board', []); }
  function setItems(list) { return App.store.set('board', list); }

  /* 예전 버전(칸반 board) → 작업물/투두 분리 (1회성) */
  function migrateSplit() {
    if (App.store.get('boardSplitV2', false)) return;
    var board = getItems();
    var archive = [];
    var todos = App.store.get('todos2', []);
    board.forEach(function (it) {
      if (it.status === 'todo' || it.status === 'doing') {
        var note = it.desc || '';
        if (it.url) note += (note ? '\n' : '') + it.url;
        if (it.fileName) note += (note ? '\n' : '') + '(이전 첨부: ' + it.fileName + ')';
        todos.push({ id: it.id, title: it.title, note: note, tags: it.tags || [], status: it.status, createdAt: it.createdAt || Date.now() });
        if (it.type === 'file' && App.filedb && App.filedb.available) App.filedb.del(it.id).catch(function () {});
      } else {
        delete it.status;
        archive.push(it);
      }
    });
    setItems(archive);
    App.store.set('todos2', todos);
    App.store.set('boardSplitV2', true);
  }

  /* 예전(localStorage dataURL) 파일 → IndexedDB 이전 */
  function migrateFiles() {
    if (!App.filedb || !App.filedb.available) return;
    var pending = getItems().filter(function (it) { return it.type === 'file' && it.fileData; });
    if (!pending.length) return;
    var chain = Promise.resolve();
    pending.forEach(function (it) {
      chain = chain.then(function () {
        return fetch(it.fileData)
          .then(function (r) { return r.blob(); })
          .then(function (blob) { return App.filedb.put(it.id, blob, { name: it.fileName, type: it.fileType }); })
          .then(function () {
            var cur = getItems();
            var t = cur.filter(function (x) { return x.id === it.id; })[0];
            if (t) { delete t.fileData; setItems(cur); }
          })
          .catch(function () {});
      });
    });
  }

  function init() {
    migrateSplit();
    migrateFiles();

    CT = App.makeCatTree({
      catsKey: 'boardCats', openKey: 'boardCatOpen',
      treeId: 'boardCatTree', formSelectId: 'boardCat',
      itemNoun: '작업물',
      countIn: function (catId) {
        return getItems().filter(function (i) { return (i.catId || '') === catId; }).length;
      },
      totalCount: function () { return getItems().length; },
      onSelect: render,
      onCatsChanged: render,
      onCategoryDeleted: function (id) {
        var items = getItems();
        items.forEach(function (it) { if (it.catId === id) it.catId = ''; });
        setItems(items);
      }
    });

    var form = document.getElementById('boardForm');
    var urlInput = document.getElementById('boardUrl');
    var fileInput = document.getElementById('boardFile');

    function syncType() {
      var t = form.querySelector('input[name="boardType"]:checked').value;
      urlInput.hidden = t !== 'link';
      fileInput.hidden = t !== 'file';
      urlInput.required = t === 'link';
    }
    form.querySelectorAll('input[name="boardType"]').forEach(function (r) { r.addEventListener('change', syncType); });
    syncType();

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var type = form.querySelector('input[name="boardType"]:checked').value;
      var title = document.getElementById('boardTitle').value.trim();
      var desc = document.getElementById('boardDesc').value.trim();
      var catId = document.getElementById('boardCat').value || '';
      var tags = document.getElementById('boardTags').value.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
      if (!title) return;

      if (type === 'link') {
        var url = urlInput.value.trim();
        if (!url) return;
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
        if (addItem({ id: 'bd:' + U.uid(), type: 'link', title: title, url: url, desc: desc, tags: tags, catId: catId, createdAt: Date.now() })) {
          form.reset(); syncType();
        }
      } else {
        var file = fileInput.files[0];
        if (!file) { U.toast('파일을 선택하세요'); return; }
        var limitMB = App.settings.get().fileLimitMB || 50;
        if (file.size > limitMB * 1024 * 1024) {
          U.toast('파일이 너무 큽니다 (최대 ' + limitMB + 'MB). 설정에서 한도를 늘릴 수 있습니다.');
          return;
        }
        if (!App.filedb || !App.filedb.available) {
          U.toast('이 브라우저에서 파일 저장을 쓸 수 없습니다. 링크로 등록하세요.');
          return;
        }
        var id = 'bd:' + U.uid();
        U.toast('파일 저장 중…');
        App.filedb.put(id, file, { name: file.name, type: file.type || 'application/octet-stream' })
          .then(function () {
            addItem({
              id: id, type: 'file', title: title,
              fileName: file.name, fileType: file.type || 'application/octet-stream',
              fileSize: file.size, desc: desc, tags: tags, catId: catId, createdAt: Date.now()
            });
            form.reset(); syncType();
          })
          .catch(function (err) { U.toast('파일 저장 실패: ' + (err && err.message || err)); });
      }
    });

    render();
  }

  function addItem(item) {
    var list = getItems();
    list.push(item);
    var ok = setItems(list);
    if (ok) { render(); U.toast('“' + item.title + '” 등록' + (item.catId ? ' — ' + CT.name(item.catId) : '')); }
    return ok;
  }

  function update(id, patch) {
    var list = getItems();
    var t = list.filter(function (x) { return x.id === id; })[0];
    if (!t) return;
    Object.keys(patch).forEach(function (k) { t[k] = patch[k]; });
    setItems(list);
    render();
  }

  function removeItem(it) {
    setItems(getItems().filter(function (x) { return x.id !== it.id; }));
    if (it.type === 'file' && App.filedb && App.filedb.available) App.filedb.del(it.id).catch(function () {});
    render();
  }

  function downloadFile(it) {
    function trigger(href, revoke) {
      var a = document.createElement('a');
      a.href = href;
      a.download = it.fileName || it.title || 'file';
      document.body.appendChild(a); a.click(); a.remove();
      if (revoke) setTimeout(function () { URL.revokeObjectURL(href); }, 15000);
    }
    if (it.fileData) { trigger(it.fileData, false); return; }
    if (!App.filedb || !App.filedb.available) { U.toast('파일 저장소를 열 수 없습니다'); return; }
    App.filedb.get(it.id).then(function (rec) {
      if (!rec || !rec.blob) { U.toast('파일을 찾을 수 없습니다'); return; }
      trigger(URL.createObjectURL(rec.blob), true);
    }).catch(function (e) { U.toast('파일 열기 실패: ' + (e && e.message || e)); });
  }

  /* ---------- 목록 렌더 ---------- */
  function render() {
    if (!CT) return;
    CT.render();

    var box = document.getElementById('boardList');
    if (!box) return;
    var all = getItems().slice().sort(function (a, b) { return b.createdAt - a.createdAt; });
    var list = all.filter(function (i) { return CT.matches(i.catId); });

    if (!list.length) {
      box.innerHTML = '<p class="muted">' +
        (all.length ? '이 카테고리에 작업물이 없습니다.' : '보관된 작업물이 없습니다. 완료된 파일이나 노션·구글 시트 링크를 등록하세요.') +
        '</p>';
      return;
    }

    box.innerHTML = '';
    var groups = CT.groups();
    if (!groups) {
      list.forEach(function (it) { box.appendChild(card(it)); });
      return;
    }
    groups.forEach(function (g) {
      var items = list.filter(function (i) { return (i.catId || '') === g.catId; });
      if (!items.length) return;
      var h = document.createElement('h3');
      h.className = 'bc-group';
      h.innerHTML = U.esc(g.label) + ' <span>(' + items.length + ')</span>';
      box.appendChild(h);
      items.forEach(function (it) { box.appendChild(card(it)); });
    });
  }

  function card(it) {
    var el = document.createElement('div');
    el.className = 'board-card';
    var titleHtml = it.type === 'link'
      ? '<a href="' + U.esc(it.url) + '" target="_blank" rel="noopener">' + U.esc(it.title) + ' ↗</a>'
      : '<a href="#" class="bc-download">' + U.esc(it.title) + ' ⬇</a>';
    el.innerHTML =
      '<span class="bc-type">' + (it.type === 'link' ? '링크' : '파일') + '</span>' +
      '<div class="bc-title">' + titleHtml + '</div>' +
      (it.type === 'file' ? '<div class="bc-desc">' + U.esc(it.fileName) + ' · ' + fmtSize(it.fileSize) + '</div>' : '') +
      (it.desc ? '<div class="bc-desc">' + U.esc(it.desc) + '</div>' : '') +
      (it.tags && it.tags.length
        ? '<div class="bc-tags">' + it.tags.map(function (t) { return '<span class="bc-tag">#' + U.esc(t) + '</span>'; }).join('') + '</div>'
        : '') +
      '<div class="bc-catrow"><select class="bc-cat" title="카테고리 이동"></select></div>' +
      '<div class="bc-foot">' +
      '<span class="bc-date">' + U.fmtDateTimeKo(new Date(it.createdAt).toISOString()) + '</span>' +
      '<span class="bc-actions"><button type="button" class="bc-edit">제목수정</button>' +
      '<button type="button" class="bc-del">삭제</button></span>' +
      '</div>';

    var csel = el.querySelector('.bc-cat');
    CT.fillSelect(csel, it.catId || '');
    csel.addEventListener('change', function () { update(it.id, { catId: csel.value || '' }); });

    var dl = el.querySelector('.bc-download');
    if (dl) dl.addEventListener('click', function (e) { e.preventDefault(); downloadFile(it); });
    el.querySelector('.bc-edit').addEventListener('click', function () {
      var nt = prompt('제목 수정', it.title);
      if (nt == null) return;
      update(it.id, { title: nt.trim() || it.title });
    });
    el.querySelector('.bc-del').addEventListener('click', function () {
      if (!confirm('이 작업물을 삭제할까요?')) return;
      removeItem(it);
    });
    return el;
  }

  function fmtSize(n) {
    if (!n) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  }

  return { init: init, render: render };
})();
