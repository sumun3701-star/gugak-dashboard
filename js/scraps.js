/* scraps.js — 기사/블로그 스크랩 (네이버 블로그식 카테고리 분류, 전역 App.scraps) */
window.App = window.App || {};

App.scraps = (function () {
  var U = App.util;
  var NONE = '__none__'; // 미분류
  var filter = { q: '', read: 'all', tag: '', cat: '' }; // cat '' = 전체(카테고리별 그룹 보기)

  function getScraps() { return App.store.get('scraps', []); }
  function setScraps(list) { App.store.set('scraps', list); }
  function getCats() { return App.store.get('scrapCats', []); }
  function setCats(list) { App.store.set('scrapCats', list); }
  function catName(id) {
    if (!id) return '미분류';
    var c = getCats().find(function (x) { return x.id === id; });
    return c ? c.name : '미분류';
  }

  function domain(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
  }
  function parseTags(str) {
    return (str || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
  }
  function normUrl(url) {
    url = (url || '').trim();
    if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
    return url;
  }

  function init() {
    var form = document.getElementById('scrapForm');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var url = normUrl(document.getElementById('scrapUrl').value);
      var title = document.getElementById('scrapTitle').value.trim();
      var catVal = document.getElementById('scrapCat').value;
      var s = {
        id: 'sc:' + U.uid(),
        url: url,
        title: title || url,
        source: domain(url),
        note: document.getElementById('scrapNote').value.trim(),
        tags: parseTags(document.getElementById('scrapTags').value),
        catId: catVal === NONE ? '' : catVal,
        read: false,
        createdAt: Date.now(), updatedAt: Date.now()
      };
      var list = getScraps();
      list.push(s);
      setScraps(list);
      form.reset();
      renderCatSelect();
      render();
      U.toast('스크랩에 추가했습니다' + (s.catId ? ' — ' + catName(s.catId) : ''));
    });

    document.getElementById('scrapFetch').addEventListener('click', fetchMeta);
    document.getElementById('scrapCatAdd').addEventListener('click', addCategory);

    document.getElementById('scrapSearch').addEventListener('input', U.debounce(function (e) {
      filter.q = e.target.value.trim().toLowerCase();
      render();
    }, 200));
    document.getElementById('scrapReadFilter').addEventListener('change', function (e) {
      filter.read = e.target.value;
      render();
    });

    renderCatSelect();
    render();
  }

  /* ---------- 카테고리 관리 ---------- */
  function addCategory() {
    var name = prompt('새 카테고리 이름');
    if (name == null) return;
    name = name.trim();
    if (!name) return;
    var cats = getCats();
    if (cats.some(function (c) { return c.name === name; })) { U.toast('같은 이름의 카테고리가 있습니다'); return; }
    cats.push({ id: 'cat:' + U.uid(), name: name });
    setCats(cats);
    filter.cat = cats[cats.length - 1].id;
    renderCatSelect();
    render();
  }

  function renameOrDeleteCategory(id) {
    var cats = getCats();
    var c = cats.find(function (x) { return x.id === id; });
    if (!c) return;
    var nv = prompt('카테고리 이름을 바꾸려면 새 이름을 입력하세요.\n비우고 확인하면 이 카테고리를 삭제합니다. (안의 스크랩은 미분류로 이동)', c.name);
    if (nv == null) return;
    nv = nv.trim();
    if (!nv) {
      if (!confirm('“' + c.name + '” 카테고리를 삭제할까요? 안의 스크랩은 미분류로 이동합니다.')) return;
      setCats(cats.filter(function (x) { return x.id !== id; }));
      var list = getScraps();
      list.forEach(function (s) { if (s.catId === id) s.catId = ''; });
      setScraps(list);
      if (filter.cat === id) filter.cat = '';
    } else {
      c.name = nv;
      setCats(cats);
    }
    renderCatSelect();
    render();
  }

  function renderCatSelect() {
    var sel = document.getElementById('scrapCat');
    var keep = sel.value;
    var cats = getCats();
    sel.innerHTML = '<option value="' + NONE + '">미분류</option>' +
      cats.map(function (c) {
        return '<option value="' + U.esc(c.id) + '">' + U.esc(c.name) + '</option>';
      }).join('');
    if (keep && (keep === NONE || cats.some(function (c) { return c.id === keep; }))) sel.value = keep;
  }

  function renderCatBar() {
    var bar = document.getElementById('scrapCats');
    var scraps = getScraps();
    var cats = getCats();
    function count(pred) { return scraps.filter(pred).length; }

    var chips = [];
    chips.push(chip('', '전체 ' + scraps.length, filter.cat === ''));
    chips.push(chip(NONE, '미분류 ' + count(function (s) { return !s.catId; }), filter.cat === NONE));
    cats.forEach(function (c) {
      chips.push(chip(c.id, c.name + ' ' + count(function (s) { return s.catId === c.id; }), filter.cat === c.id, true));
    });
    bar.innerHTML = '';
    chips.forEach(function (el) { bar.appendChild(el); });

    function chip(val, label, on, real) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'catchip' + (on ? ' is-on' : '');
      b.textContent = label;
      b.addEventListener('click', function () { filter.cat = val; render(); });
      if (real) {
        b.title = '두 번 클릭: 이름 변경 / 삭제';
        b.addEventListener('dblclick', function () { renameOrDeleteCategory(val); });
      }
      return b;
    }
  }

  /* ---------- 메타 자동 채움 ---------- */
  function fetchMeta() {
    var url = normUrl(document.getElementById('scrapUrl').value);
    if (!url) { U.toast('먼저 URL을 입력하세요'); return; }
    if (!U.proxyAvailable()) {
      U.toast('제목 자동 수집은 로컬 서버(server.py / server.js) 실행 시 가능합니다');
      return;
    }
    U.toast('페이지 정보 확인 중…');
    fetch(U.proxyBase() + '/api/fetch-meta?url=' + encodeURIComponent(url))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var tEl = document.getElementById('scrapTitle');
        var nEl = document.getElementById('scrapNote');
        if (j.title && !tEl.value.trim()) tEl.value = j.title;
        if (j.description && !nEl.value.trim()) nEl.value = j.description;
        U.toast(j.title ? '정보를 채웠습니다' : '제목을 찾지 못했습니다 — 직접 입력하세요');
      })
      .catch(function () { U.toast('정보를 가져오지 못했습니다 — 직접 입력하세요'); });
  }

  function allTags() {
    var set = {};
    getScraps().forEach(function (s) { (s.tags || []).forEach(function (t) { set[t] = true; }); });
    return Object.keys(set).sort();
  }

  /* ---------- 렌더 ---------- */
  function matches(s) {
    if (filter.read === 'read' && !s.read) return false;
    if (filter.read === 'unread' && s.read) return false;
    if (filter.tag && (s.tags || []).indexOf(filter.tag) === -1) return false;
    if (filter.cat === NONE && s.catId) return false;
    if (filter.cat && filter.cat !== NONE && s.catId !== filter.cat) return false;
    if (filter.q) {
      var hay = (s.title + ' ' + (s.note || '') + ' ' + (s.source || '') + ' ' +
        (s.tags || []).join(' ') + ' ' + catName(s.catId)).toLowerCase();
      if (hay.indexOf(filter.q) === -1) return false;
    }
    return true;
  }

  function render() {
    renderCatBar();
    renderTagFilter();

    var box = document.getElementById('scrapList');
    var list = getScraps().slice().sort(function (a, b) { return b.createdAt - a.createdAt; }).filter(matches);

    if (!list.length) {
      box.innerHTML = '<p class="muted">' +
        (getScraps().length ? '조건에 맞는 스크랩이 없습니다.' : '스크랩이 없습니다. 기사·블로그 URL을 추가하세요.') +
        '</p>';
      return;
    }

    box.innerHTML = '';

    if (filter.cat === '') {
      // 전체 보기 → 카테고리별 그룹
      var groups = [];
      getCats().forEach(function (c) { groups.push({ id: c.id, name: c.name }); });
      groups.push({ id: '', name: '미분류' });
      groups.forEach(function (g) {
        var items = list.filter(function (s) { return (s.catId || '') === g.id; });
        if (!items.length) return;
        var h = document.createElement('h3');
        h.className = 'sc-group';
        h.innerHTML = U.esc(g.name) + ' <span>(' + items.length + ')</span>';
        box.appendChild(h);
        items.forEach(function (s) { box.appendChild(card(s)); });
      });
    } else {
      list.forEach(function (s) { box.appendChild(card(s)); });
    }
  }

  function card(s) {
    var el = document.createElement('div');
    el.className = 'scrap-card' + (s.read ? ' is-read' : '');
    el.innerHTML =
      '<div class="sc-head">' +
      '<label class="sc-read"><input type="checkbox" ' + (s.read ? 'checked' : '') + ' title="읽음 표시" /></label>' +
      '<a class="sc-title" href="' + U.esc(s.url) + '" target="_blank" rel="noopener">' + U.esc(s.title) + ' ↗</a>' +
      '</div>' +
      (s.source ? '<div class="sc-source">' + U.esc(s.source) + '</div>' : '') +
      (s.note ? '<div class="sc-note">' + U.esc(s.note) + '</div>' : '') +
      (s.tags && s.tags.length
        ? '<div class="sc-tags">' + s.tags.map(function (t) {
            return '<button type="button" class="sc-tag" data-tag="' + U.esc(t) + '">#' + U.esc(t) + '</button>';
          }).join('') + '</div>'
        : '') +
      '<div class="sc-catrow"><select class="sc-cat" title="카테고리 이동"></select></div>' +
      '<div class="sc-foot">' +
      '<span class="sc-date">' + U.fmtDateTimeKo(new Date(s.createdAt).toISOString()) + '</span>' +
      '<span class="sc-actions"><button type="button" class="sc-edit">수정</button>' +
      '<button type="button" class="sc-del">삭제</button></span>' +
      '</div>';

    // 카테고리 이동 select
    var csel = el.querySelector('.sc-cat');
    csel.innerHTML = '<option value="' + NONE + '">미분류</option>' +
      getCats().map(function (c) {
        return '<option value="' + U.esc(c.id) + '">' + U.esc(c.name) + '</option>';
      }).join('');
    csel.value = s.catId || NONE;
    csel.addEventListener('change', function () {
      update(s.id, { catId: csel.value === NONE ? '' : csel.value });
    });

    el.querySelector('.sc-read input').addEventListener('change', function (e) {
      update(s.id, { read: e.target.checked });
    });
    el.querySelectorAll('.sc-tag').forEach(function (b) {
      b.addEventListener('click', function () {
        filter.tag = (filter.tag === b.dataset.tag) ? '' : b.dataset.tag;
        render();
      });
    });
    el.querySelector('.sc-edit').addEventListener('click', function () { editScrap(s); });
    el.querySelector('.sc-del').addEventListener('click', function () {
      if (!confirm('이 스크랩을 삭제할까요?')) return;
      setScraps(getScraps().filter(function (x) { return x.id !== s.id; }));
      render();
    });
    return el;
  }

  function renderTagFilter() {
    var box = document.getElementById('scrapTagFilter');
    var tags = allTags();
    if (!tags.length) { box.innerHTML = ''; return; }
    box.innerHTML = '';
    var all = document.createElement('button');
    all.type = 'button';
    all.className = 'tagchip' + (!filter.tag ? ' is-on' : '');
    all.textContent = '태그 전체';
    all.addEventListener('click', function () { filter.tag = ''; render(); });
    box.appendChild(all);
    tags.forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tagchip' + (filter.tag === t ? ' is-on' : '');
      b.textContent = '#' + t;
      b.addEventListener('click', function () {
        filter.tag = (filter.tag === t) ? '' : t;
        render();
      });
      box.appendChild(b);
    });
  }

  function editScrap(s) {
    var nt = prompt('제목', s.title);
    if (nt === null) return;
    var nn = prompt('메모 / 발췌', s.note || '');
    if (nn === null) return;
    var ng = prompt('태그 (쉼표로 구분)', (s.tags || []).join(', '));
    if (ng === null) return;
    update(s.id, { title: nt.trim() || s.title, note: nn.trim(), tags: parseTags(ng) });
  }

  function update(id, obj) {
    var list = getScraps();
    var t = list.find(function (x) { return x.id === id; });
    if (!t) return;
    Object.keys(obj).forEach(function (k) { t[k] = obj[k]; });
    t.updatedAt = Date.now();
    setScraps(list);
    render();
  }

  return { init: init, render: render };
})();
