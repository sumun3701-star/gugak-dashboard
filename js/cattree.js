/* cattree.js — 2단계(상위→하위) 카테고리 트리. 작업물 게시판·스크랩 공용.
   App.makeCatTree(cfg) -> 인스턴스.
   cfg = {
     catsKey, openKey,          // localStorage 키
     treeId, formSelectId,      // DOM 요소 id
     unfiledLabel = '미분류',
     itemNoun = '항목',          // 빈 상태 문구용
     countIn(catId)  -> catId 에 "직접" 속한 항목 수 ('' = 미분류)
     totalCount()    -> 전체 항목 수
     onSelect()      -> 카테고리 선택(필터) 변경됨. 호스트가 목록 다시 그림
     onCatsChanged() -> 카테고리/순서 변경됨. 호스트가 목록 다시 그림
     onCategoryDeleted(id) -> 호스트가 item.catId===id 를 '' 로 정리
   } */
window.App = window.App || {};

App.makeCatTree = function (cfg) {
  var U = App.util, S = App.store;
  var UNFILED = cfg.unfiledLabel || '미분류';
  var filter = ''; // '' 전체 / '__none__' 미분류 / 카테고리 id

  function getCats() { return S.get(cfg.catsKey, []); }
  function setCats(v) { S.set(cfg.catsKey, v); }
  function getOpen() { return S.get(cfg.openKey, {}); }
  function setOpen(m) { S.set(cfg.openKey, m); }

  function tops() { return getCats().filter(function (c) { return !c.parent; }); }
  function subs(pid) { return getCats().filter(function (c) { return c.parent === pid; }); }
  function byId(id) { return getCats().filter(function (c) { return c.id === id; })[0] || null; }
  function name(id) { var c = byId(id); return c ? c.name : UNFILED; }
  function isTop(id) { var c = byId(id); return !!(c && !c.parent); }
  function descIds(id) { var o = [id]; subs(id).forEach(function (s) { o.push(s.id); }); return o; }
  function countTree(id) { return descIds(id).reduce(function (n, x) { return n + cfg.countIn(x); }, 0); }

  /* ---------- 카테고리 조작 ---------- */
  function addCategory(parentId) {
    var nm = prompt(parentId ? '하위 카테고리 이름' : '상위 카테고리 이름');
    if (nm == null) return;
    nm = nm.trim();
    if (!nm) return;
    var cats = getCats();
    cats.push({ id: 'cat:' + U.uid(), name: nm, parent: parentId || '' });
    setCats(cats);
    if (parentId) { var o = getOpen(); o[parentId] = true; setOpen(o); }
    cfg.onCatsChanged();
  }

  function renameOrDelete(id) {
    var cats = getCats();
    var c = cats.filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    var top = !c.parent;
    var nv = prompt('이름을 바꾸려면 새 이름을 입력하세요.\n비우고 확인하면 이 카테고리를 삭제합니다.\n(안의 ' + (cfg.itemNoun || '항목') + '은 미분류로 이동' + (top ? ', 하위 카테고리는 상위로 이동' : '') + ')', c.name);
    if (nv == null) return;
    nv = nv.trim();
    if (!nv) {
      if (!confirm('“' + c.name + '” 카테고리를 삭제할까요?')) return;
      cats.forEach(function (x) { if (x.parent === id) x.parent = ''; });
      setCats(cats.filter(function (x) { return x.id !== id; }));
      cfg.onCategoryDeleted(id);
      if (filter === id) filter = '';
    } else {
      c.name = nv;
      setCats(cats);
    }
    cfg.onCatsChanged();
  }

  function toggleOpen(id) {
    var o = getOpen();
    o[id] = o[id] === false ? true : false;
    setOpen(o);
    renderTree();
  }

  function moveCat(id, dir) {
    var cats = getCats();
    var idx = -1;
    for (var i = 0; i < cats.length; i++) if (cats[i].id === id) { idx = i; break; }
    if (idx < 0) return;
    var parent = cats[idx].parent || '';
    var sib = [];
    cats.forEach(function (c, i) { if ((c.parent || '') === parent) sib.push(i); });
    var pos = sib.indexOf(idx);
    var t = pos + dir;
    if (t < 0 || t >= sib.length) return;
    var j = sib[t];
    var tmp = cats[idx]; cats[idx] = cats[j]; cats[j] = tmp;
    setCats(cats);
    cfg.onCatsChanged();
  }

  /* ---------- 트리 렌더 ---------- */
  function renderTree() {
    var el = document.getElementById(cfg.treeId);
    if (!el) return;
    var open = getOpen();
    el.innerHTML =
      '<div class="ct-head"><strong>카테고리</strong>' +
      '<button type="button" class="ct-add ct-add-top">+ 상위</button></div>';

    el.appendChild(row({ kind: 'all', name: '전체보기', count: cfg.totalCount(), on: filter === '' }));
    el.appendChild(row({ kind: 'none', name: UNFILED, count: cfg.countIn(''), on: filter === '__none__' }));

    var topList = tops();
    topList.forEach(function (tp, ti) {
      var isOpen = open[tp.id] !== false;
      var kids = subs(tp.id);
      el.appendChild(row({
        kind: 'top', id: tp.id, name: tp.name, count: countTree(tp.id),
        on: filter === tp.id, open: isOpen, hasKids: kids.length > 0,
        first: ti === 0, last: ti === topList.length - 1
      }));
      if (isOpen) kids.forEach(function (s, si) {
        el.appendChild(row({
          kind: 'sub', id: s.id, name: s.name, count: cfg.countIn(s.id), on: filter === s.id,
          first: si === 0, last: si === kids.length - 1
        }));
      });
    });

    el.querySelector('.ct-add-top').addEventListener('click', function () { addCategory(''); });

    function select(v) { filter = v; cfg.onSelect(); }

    function row(o) {
      var div = document.createElement('div');
      div.className = 'ct-row ct-' + o.kind + (o.on ? ' is-on' : '');
      var caret = (o.kind === 'top')
        ? '<span class="ct-caret' + (o.hasKids ? '' : ' ct-leaf') + '">' + (o.open ? '▾' : '▸') + '</span>'
        : '<span class="ct-caret ct-leaf">·</span>';
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
      var target = o.kind === 'all' ? '' : (o.kind === 'none' ? '__none__' : o.id);
      nameEl.addEventListener('click', function () { select(target); });
      div.querySelector('.ct-count').addEventListener('click', function () { select(target); });

      if (o.kind === 'top') {
        var cr = div.querySelector('.ct-caret');
        if (o.hasKids) cr.addEventListener('click', function (e) { e.stopPropagation(); toggleOpen(o.id); });
        div.querySelector('.ct-addsub').addEventListener('click', function (e) { e.stopPropagation(); addCategory(o.id); });
      }
      if (o.kind === 'top' || o.kind === 'sub') {
        nameEl.addEventListener('dblclick', function () { renameOrDelete(o.id); });
        var up = div.querySelector('.ct-up'), dn = div.querySelector('.ct-down');
        up.addEventListener('click', function (e) { e.stopPropagation(); if (!up.disabled) moveCat(o.id, -1); });
        dn.addEventListener('click', function (e) { e.stopPropagation(); if (!dn.disabled) moveCat(o.id, 1); });
      }
      return div;
    }
  }

  /* ---------- select 옵션 채우기 ---------- */
  function fillSelect(sel, val) {
    if (!sel) return;
    var html = '<option value="">' + U.esc(UNFILED) + '</option>';
    tops().forEach(function (t) {
      html += '<option value="' + U.esc(t.id) + '">' + U.esc(t.name) + '</option>';
      subs(t.id).forEach(function (s) {
        html += '<option value="' + U.esc(s.id) + '">　└ ' + U.esc(s.name) + '</option>';
      });
    });
    sel.innerHTML = html;
    if (val != null) sel.value = val;
  }

  /* ---------- 현재 필터에 대한 그룹 헤딩 목록 (null = 평면) ---------- */
  function groups() {
    if (filter === '__none__') return null;
    if (filter === '') {
      var g = [];
      tops().forEach(function (t) {
        g.push({ catId: t.id, label: t.name });
        subs(t.id).forEach(function (s) { g.push({ catId: s.id, label: t.name + ' › ' + s.name }); });
      });
      g.push({ catId: '', label: UNFILED });
      return g;
    }
    if (isTop(filter)) {
      var t = byId(filter);
      var gg = [{ catId: t.id, label: t.name }];
      subs(t.id).forEach(function (s) { gg.push({ catId: s.id, label: s.name }); });
      return gg;
    }
    return null;
  }

  /* ---------- 항목이 현재 필터에 들어가는지 ---------- */
  function matches(catId) {
    catId = catId || '';
    if (filter === '') return true;
    if (filter === '__none__') return !catId;
    return descIds(filter).indexOf(catId) !== -1;
  }

  function render() {
    renderTree();
    fillSelect(document.getElementById(cfg.formSelectId), (document.getElementById(cfg.formSelectId) || {}).value);
  }

  // 전체 카테고리를 [{id, label}] 로 (label: 상위 / "상위 › 하위")
  function allOptions() {
    var out = [];
    tops().forEach(function (t) {
      out.push({ id: t.id, label: t.name });
      subs(t.id).forEach(function (sc) { out.push({ id: sc.id, label: t.name + ' › ' + sc.name }); });
    });
    return out;
  }
  function idByLabel(label) {
    label = (label || '').trim();
    if (!label) return '';
    var m = allOptions().filter(function (o) {
      return o.label === label || o.label.split(' › ').pop() === label;
    })[0];
    return m ? m.id : '';
  }

  return {
    render: render,
    fillSelect: fillSelect,
    groups: groups,
    matches: matches,
    name: name,
    isTop: isTop,
    descIds: descIds,
    allOptions: allOptions,
    idByLabel: idByLabel,
    get filter() { return filter; },
    setFilter: function (v) { filter = v; }
  };
};
