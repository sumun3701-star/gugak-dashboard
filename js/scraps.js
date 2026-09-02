/* scraps.js — 기사/블로그 스크랩 (전역 App.scraps)
   2단계 카테고리는 App.makeCatTree(js/cattree.js) 공용 모듈 사용. */
window.App = window.App || {};

App.scraps = (function () {
  var U = App.util;
  var CT = null;
  var filter = { q: '', read: 'all', tag: '' }; // 카테고리 필터는 CT.filter

  function getScraps() { return App.store.get('scraps', []); }
  function setScraps(list) { App.store.set('scraps', list); }

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
    CT = App.makeCatTree({
      catsKey: 'scrapCats', openKey: 'scrapCatOpen',
      treeId: 'scrapCatTree', formSelectId: 'scrapCat',
      itemNoun: '스크랩',
      countIn: function (catId) {
        return getScraps().filter(function (s) { return (s.catId || '') === catId; }).length;
      },
      totalCount: function () { return getScraps().length; },
      onSelect: render,
      onCatsChanged: render,
      onCategoryDeleted: function (id) {
        var list = getScraps();
        list.forEach(function (s) { if (s.catId === id) s.catId = ''; });
        setScraps(list);
      }
    });

    var form = document.getElementById('scrapForm');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var url = normUrl(document.getElementById('scrapUrl').value);
      var title = document.getElementById('scrapTitle').value.trim();
      var catId = document.getElementById('scrapCat').value || '';
      var s = {
        id: 'sc:' + U.uid(),
        url: url,
        title: title || url,
        source: domain(url),
        note: document.getElementById('scrapNote').value.trim(),
        tags: parseTags(document.getElementById('scrapTags').value),
        catId: catId,
        read: false,
        createdAt: Date.now(), updatedAt: Date.now()
      };
      var list = getScraps();
      list.push(s);
      setScraps(list);
      form.reset();
      render();
      U.toast('스크랩에 추가했습니다' + (s.catId ? ' — ' + CT.name(s.catId) : ''));
    });

    document.getElementById('scrapFetch').addEventListener('click', fetchMeta);
    document.getElementById('scrapAI').addEventListener('click', aiOrganize);
    document.getElementById('scrapSearch').addEventListener('input', U.debounce(function (e) {
      filter.q = e.target.value.trim().toLowerCase();
      render();
    }, 200));
    document.getElementById('scrapReadFilter').addEventListener('change', function (e) {
      filter.read = e.target.value;
      render();
    });

    render();
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

  /* ---------- AI 정리 (요약 · 태그 · 카테고리) ---------- */
  function aiOrganize() {
    var url = normUrl(document.getElementById('scrapUrl').value);
    if (!url) { U.toast('먼저 URL을 입력하세요'); return; }
    if (!App.ai.available()) { U.toast('설정에서 Gemini API 키를 입력하세요'); return; }
    var btn = document.getElementById('scrapAI');
    btn.disabled = true;
    U.toast('AI가 정리하는 중…');

    var textP = U.proxyAvailable()
      ? fetch(U.proxyBase() + '/api/fetch-text?url=' + encodeURIComponent(url))
          .then(function (r) { return r.ok ? r.text() : ''; }).catch(function () { return ''; })
      : Promise.resolve('');

    textP.then(function (pageText) {
      var opts = CT.allOptions().map(function (o) { return o.label; });
      var prompt =
        '아래 웹 문서를 한국어로 정리해줘. JSON 객체 하나만 출력:\n' +
        '{"title": "제목 한 줄", "summary": "2~3문장 요약", "tags": ["태그", "3~5개", "각 1~2단어"], "category": "아래 목록 중 가장 알맞은 하나(정확히 그 문자열) 또는 빈 문자열"}\n' +
        '카테고리 목록: ' + JSON.stringify(opts) + '\n\n' +
        'URL: ' + url + '\n본문:\n' +
        (pageText ? pageText.slice(0, 8000) : '(본문을 가져오지 못함 — URL만 참고)');
      return App.ai.generateJSON(prompt);
    }).then(function (j) {
      var tEl = document.getElementById('scrapTitle');
      var nEl = document.getElementById('scrapNote');
      var gEl = document.getElementById('scrapTags');
      var cEl = document.getElementById('scrapCat');
      if (j.title && !tEl.value.trim()) tEl.value = j.title;
      if (j.summary && !nEl.value.trim()) nEl.value = j.summary;
      if (Array.isArray(j.tags) && j.tags.length && !gEl.value.trim()) gEl.value = j.tags.join(', ');
      if (j.category) { var id = CT.idByLabel(j.category); if (id) cEl.value = id; }
      U.toast('AI 정리 완료 — 확인 후 "스크랩 추가"');
    }).catch(function (e) {
      U.toast('AI 정리 실패: ' + (e && e.message || e));
    }).finally(function () { btn.disabled = false; });
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
    if (!CT.matches(s.catId)) return false;
    if (filter.q) {
      var hay = (s.title + ' ' + (s.note || '') + ' ' + (s.source || '') + ' ' +
        (s.tags || []).join(' ') + ' ' + CT.name(s.catId)).toLowerCase();
      if (hay.indexOf(filter.q) === -1) return false;
    }
    return true;
  }

  function render() {
    if (!CT) return;
    CT.render();
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
    var groups = CT.groups();
    if (!groups) {
      list.forEach(function (s) { box.appendChild(card(s)); });
      return;
    }
    groups.forEach(function (g) {
      var items = list.filter(function (s) { return (s.catId || '') === g.catId; });
      if (!items.length) return;
      var h = document.createElement('h3');
      h.className = 'sc-group';
      h.innerHTML = U.esc(g.label) + ' <span>(' + items.length + ')</span>';
      box.appendChild(h);
      items.forEach(function (s) { box.appendChild(card(s)); });
    });
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

    var csel = el.querySelector('.sc-cat');
    CT.fillSelect(csel, s.catId || '');
    csel.addEventListener('change', function () { update(s.id, { catId: csel.value || '' }); });

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
