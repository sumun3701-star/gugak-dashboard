/* board.js — 작업물 게시판 (완료된 작업물 보관: 링크 / 파일, 전역 App.board)
   네이버 블로그식 2단계 카테고리(상위 → 하위). 파일 첨부는 IndexedDB(App.filedb). */
window.App = window.App || {};

App.board = (function () {
  var U = App.util;
  var filter = { cat: '' }; // '' 전체 / '__none__' 미분류 / 카테고리 id

  function getItems() { return App.store.get('board', []); }
  function setItems(list) { return App.store.set('board', list); }
  function getCats() { return App.store.get('boardCats', []); }
  function setCats(list) { App.store.set('boardCats', list); }
  function getOpen() { return App.store.get('boardCatOpen', {}); }
  function setOpen(m) { App.store.set('boardCatOpen', m); }

  function tops() { return getCats().filter(function (c) { return !c.parent; }); }
  function subs(pid) { return getCats().filter(function (c) { return c.parent === pid; }); }
  function catById(id) { return getCats().filter(function (c) { return c.id === id; })[0] || null; }
  function catName(id) { var c = catById(id); return c ? c.name : '미분류'; }
  function isTop(id) { var c = catById(id); return !!(c && !c.parent); }
  function descIds(id) {
    var out = [id];
    subs(id).forEach(function (s) { out.push(s.id); });
    return out;
  }
  function countIn(catId) {
    return getItems().filter(function (i) { return (i.catId || '') === catId; }).length;
  }
  function countTree(catId) {
    return descIds(catId).reduce(function (n, id) { return n + countIn(id); }, 0);
  }

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

    var form = document.getElementById('boardForm');
    var urlInput = document.getElementById('boardUrl');
    var fileInput = document.getElementById('boardFile');

    function syncType() {
      var t = form.querySelector('input[name="boardType"]:checked').value;
      urlInput.hidden = t !== 'link';
      fileInput.hidden = t !== 'file';
      urlInput.required = t === 'link';
    }
    form.querySelectorAll('input[name="boardType"]').forEach(function (r) {
      r.addEventListener('change', syncType);
    });
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
    if (ok) { render(); U.toast('“' + item.title + '” 등록' + (item.catId ? ' — ' + catName(item.catId) : '')); }
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

  /* ---------- 카테고리 관리 ---------- */
  function addCategory(parentId) {
    var name = prompt(parentId ? '하위 카테고리 이름' : '상위 카테고리 이름');
    if (name == null) return;
    name = name.trim();
    if (!name) return;
    var cats = getCats();
    cats.push({ id: 'cat:' + U.uid(), name: name, parent: parentId || '' });
    setCats(cats);
    if (parentId) { var o = getOpen(); o[parentId] = true; setOpen(o); }
    render();
  }

  function renameOrDelete(id) {
    var cats = getCats();
    var c = cats.filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    var top = !c.parent;
    var nv = prompt('이름을 바꾸려면 새 이름을 입력하세요.\n비우고 확인하면 이 카테고리를 삭제합니다.\n(안의 작업물은 미분류로 이동' + (top ? ', 하위 카테고리는 상위로 이동' : '') + ')', c.name);
    if (nv == null) return;
    nv = nv.trim();
    if (!nv) {
      if (!confirm('“' + c.name + '” 카테고리를 삭제할까요?')) return;
      cats.forEach(function (x) { if (x.parent === id) x.parent = ''; }); // 하위는 상위로
      setCats(cats.filter(function (x) { return x.id !== id; }));
      var items = getItems();
      items.forEach(function (it) { if (it.catId === id) it.catId = ''; });
      setItems(items);
      if (filter.cat === id) filter.cat = '';
    } else {
      c.name = nv;
      setCats(cats);
    }
    render();
  }

  function toggleOpen(id) {
    var o = getOpen();
    o[id] = o[id] === false ? true : false;
    setOpen(o);
    renderTree();
  }

  // 같은 레벨(형제) 안에서 위/아래로 순서 이동. dir: -1 위 / +1 아래
  function moveCat(id, dir) {
    var cats = getCats();
    var idx = -1;
    for (var i = 0; i < cats.length; i++) if (cats[i].id === id) { idx = i; break; }
    if (idx < 0) return;
    var parent = cats[idx].parent || '';
    var sibIdx = [];
    cats.forEach(function (c, i) { if ((c.parent || '') === parent) sibIdx.push(i); });
    var pos = sibIdx.indexOf(idx);
    var t = pos + dir;
    if (t < 0 || t >= sibIdx.length) return;
    var j = sibIdx[t];
    var tmp = cats[idx]; cats[idx] = cats[j]; cats[j] = tmp;
    setCats(cats);
    renderTree();
    fillCatSelect(document.getElementById('boardCat'), document.getElementById('boardCat').value);
  }

  /* ---------- 트리 렌더 ---------- */
  function renderTree() {
    var el = document.getElementById('boardCatTree');
    if (!el) return;
    var open = getOpen();
    el.innerHTML =
      '<div class="ct-head"><strong>카테고리</strong>' +
      '<button type="button" class="ct-add" id="ctAddTop">+ 상위</button></div>';

    el.appendChild(row({ id: '', name: '전체보기', kind: 'all', count: getItems().length, on: filter.cat === '' }));
    el.appendChild(row({ id: '__none__', name: '미분류', kind: 'none', count: countIn(''), on: filter.cat === '__none__' }));

    var topList = tops();
    topList.forEach(function (t, ti) {
      var isOpen = open[t.id] !== false;
      var kids = subs(t.id);
      el.appendChild(row({
        id: t.id, name: t.name, kind: 'top', count: countTree(t.id),
        on: filter.cat === t.id, open: isOpen, hasKids: kids.length > 0,
        first: ti === 0, last: ti === topList.length - 1
      }));
      if (isOpen) {
        kids.forEach(function (s, si) {
          el.appendChild(row({
            id: s.id, name: s.name, kind: 'sub', count: countIn(s.id), on: filter.cat === s.id,
            first: si === 0, last: si === kids.length - 1
          }));
        });
      }
    });

    el.querySelector('#ctAddTop').addEventListener('click', function () { addCategory(''); });

    function row(o) {
      var div = document.createElement('div');
      div.className = 'ct-row ct-' + o.kind + (o.on ? ' is-on' : '');
      var caret = '';
      if (o.kind === 'top') caret = '<span class="ct-caret' + (o.hasKids ? '' : ' ct-leaf') + '">' + (o.open ? '▾' : '▸') + '</span>';
      else caret = '<span class="ct-caret ct-leaf">·</span>';
      var mini = '';
      if (o.kind === 'top' || o.kind === 'sub') {
        mini = '<span class="ct-mini">' +
          (o.kind === 'top' ? '<button type="button" class="ct-addsub" title="하위 추가">＋</button>' : '') +
          '<button type="button" class="ct-up" title="위로"' + (o.first ? ' disabled' : '') + '>▲</button>' +
          '<button type="button" class="ct-down" title="아래로"' + (o.last ? ' disabled' : '') + '>▼</button>' +
          '</span>';
      }
      div.innerHTML = caret +
        '<span class="ct-name">' + U.esc(o.name) + '</span>' +
        '<span class="ct-count">' + o.count + '</span>' + mini;

      var nameEl = div.querySelector('.ct-name');
      nameEl.addEventListener('click', function () {
        filter.cat = o.kind === 'all' ? '' : o.id;
        render();
      });
      div.querySelector('.ct-count').addEventListener('click', function () {
        filter.cat = o.kind === 'all' ? '' : o.id;
        render();
      });
      if (o.kind === 'top') {
        var c = div.querySelector('.ct-caret');
        if (o.hasKids) c.addEventListener('click', function (e) { e.stopPropagation(); toggleOpen(o.id); });
        div.querySelector('.ct-addsub').addEventListener('click', function (e) { e.stopPropagation(); addCategory(o.id); });
      }
      if (o.kind === 'top' || o.kind === 'sub') {
        nameEl.addEventListener('dblclick', function () { renameOrDelete(o.id); });
        var up = div.querySelector('.ct-up'), down = div.querySelector('.ct-down');
        up.addEventListener('click', function (e) { e.stopPropagation(); if (!up.disabled) moveCat(o.id, -1); });
        down.addEventListener('click', function (e) { e.stopPropagation(); if (!down.disabled) moveCat(o.id, 1); });
      }
      return div;
    }
  }

  /* ---------- 카테고리 select 옵션 ---------- */
  function fillCatSelect(sel, currentVal) {
    var html = '<option value="">미분류</option>';
    tops().forEach(function (t) {
      html += '<option value="' + U.esc(t.id) + '">' + U.esc(t.name) + '</option>';
      subs(t.id).forEach(function (s) {
        html += '<option value="' + U.esc(s.id) + '">　└ ' + U.esc(s.name) + '</option>';
      });
    });
    sel.innerHTML = html;
    if (currentVal != null) sel.value = currentVal;
  }

  /* ---------- 목록 렌더 ---------- */
  function render() {
    renderTree();
    fillCatSelect(document.getElementById('boardCat'), null);

    var box = document.getElementById('boardList');
    if (!box) return;
    var all = getItems().slice().sort(function (a, b) { return b.createdAt - a.createdAt; });

    var list = all;
    if (filter.cat === '__none__') list = all.filter(function (i) { return !i.catId; });
    else if (filter.cat) {
      var ids = descIds(filter.cat);
      list = all.filter(function (i) { return ids.indexOf(i.catId || '') !== -1; });
    }

    if (!list.length) {
      box.innerHTML = '<p class="muted">' +
        (all.length ? '이 카테고리에 작업물이 없습니다.' : '보관된 작업물이 없습니다. 완료된 파일이나 노션·구글 시트 링크를 등록하세요.') +
        '</p>';
      return;
    }

    box.innerHTML = '';

    var groups = groupsFor();
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

  // 그룹 헤딩 목록 (null 이면 헤딩 없이 평면)
  function groupsFor() {
    if (filter.cat === '__none__') return null;
    if (filter.cat === '') {
      var g = [];
      tops().forEach(function (t) {
        g.push({ catId: t.id, label: t.name });
        subs(t.id).forEach(function (s) { g.push({ catId: s.id, label: t.name + ' › ' + s.name }); });
      });
      g.push({ catId: '', label: '미분류' });
      return g;
    }
    if (isTop(filter.cat)) {
      var t = catById(filter.cat);
      var gg = [{ catId: t.id, label: t.name }];
      subs(t.id).forEach(function (s) { gg.push({ catId: s.id, label: s.name }); });
      return gg;
    }
    return null; // 하위 카테고리 선택 → 평면
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
    fillCatSelect(csel, it.catId || '');
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
