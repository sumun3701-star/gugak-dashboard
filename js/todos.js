/* todos.js — 투두 게시판 (할 일 / 진행 중 2단 칸반, 전역 App.todos) */
window.App = window.App || {};

App.todos = (function () {
  var U = App.util;
  var STATUSES = [
    { key: 'todo', label: '할 일' },
    { key: 'doing', label: '진행 중' }
  ];

  function getItems() { return App.store.get('todos2', []); }
  function setItems(list) { return App.store.set('todos2', list); }

  function init() {
    var form = document.getElementById('todoForm');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var title = document.getElementById('todoTitle').value.trim();
      if (!title) return;
      var item = {
        id: 'td:' + U.uid(),
        title: title,
        note: document.getElementById('todoNote').value.trim(),
        tags: document.getElementById('todoTags').value.split(',').map(function (x) { return x.trim(); }).filter(Boolean),
        status: document.getElementById('todoStatus').value || 'todo',
        createdAt: Date.now()
      };
      var list = getItems();
      list.push(item);
      setItems(list);
      form.reset();
      render();
      U.toast('“' + item.title + '” 추가 (' + statusLabel(item.status) + ')');
    });
    render();
  }

  function statusLabel(key) {
    var s = STATUSES.filter(function (x) { return x.key === key; })[0];
    return s ? s.label : '할 일';
  }

  function update(id, patch) {
    var list = getItems();
    var t = list.filter(function (x) { return x.id === id; })[0];
    if (!t) return;
    Object.keys(patch).forEach(function (k) { t[k] = patch[k]; });
    setItems(list);
    render();
  }

  function complete(it) {
    setItems(getItems().filter(function (x) { return x.id !== it.id; }));
    render();
    U.toast('완료: ' + it.title, {
      label: '되돌리기',
      onClick: function () {
        var list = getItems();
        list.push(it);
        setItems(list);
        render();
      }
    });
  }

  function removeItem(id) {
    setItems(getItems().filter(function (x) { return x.id !== id; }));
    render();
  }

  /* ---------- 렌더 ---------- */
  function render() {
    var wrap = document.getElementById('todoKanban');
    if (!wrap) return;
    var items = getItems();
    wrap.innerHTML = '';

    STATUSES.forEach(function (st, idx) {
      var col = document.createElement('div');
      col.className = 'kb-col kb-' + st.key;
      col.dataset.status = st.key;

      var list = items
        .filter(function (i) { return (i.status || 'todo') === st.key; })
        .sort(function (a, b) { return b.createdAt - a.createdAt; });

      col.innerHTML =
        '<div class="kb-head"><span class="kb-name">' + st.label + '</span>' +
        '<span class="kb-count">' + list.length + '</span></div>' +
        '<div class="kb-cards"></div>';

      var cardsEl = col.querySelector('.kb-cards');
      if (!list.length) cardsEl.innerHTML = '<p class="kb-empty">비어 있음</p>';
      else list.forEach(function (it) { cardsEl.appendChild(card(it, idx)); });

      col.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        col.classList.add('drag-over');
      });
      col.addEventListener('dragleave', function (e) {
        if (!col.contains(e.relatedTarget)) col.classList.remove('drag-over');
      });
      col.addEventListener('drop', function (e) {
        e.preventDefault();
        col.classList.remove('drag-over');
        var id = e.dataTransfer.getData('text/plain');
        if (id) update(id, { status: st.key });
      });

      wrap.appendChild(col);
    });
  }

  function card(it, statusIdx) {
    var el = document.createElement('div');
    el.className = 'kb-card';
    el.draggable = true;
    el.dataset.id = it.id;

    el.innerHTML =
      '<div class="bc-title">' + U.esc(it.title) + '</div>' +
      (it.note ? '<div class="bc-desc">' + U.esc(it.note) + '</div>' : '') +
      (it.tags && it.tags.length
        ? '<div class="bc-tags">' + it.tags.map(function (t) { return '<span class="bc-tag">#' + U.esc(t) + '</span>'; }).join('') + '</div>'
        : '') +
      '<div class="bc-date">' + U.fmtDateTimeKo(new Date(it.createdAt).toISOString()) + '</div>' +
      '<div class="kb-foot">' +
      '<span class="kb-move-grp">' +
      '<button type="button" class="kb-move" data-dir="-1" title="이전 단계"' + (statusIdx <= 0 ? ' disabled' : '') + '>‹</button>' +
      '<button type="button" class="kb-move" data-dir="1" title="다음 단계"' + (statusIdx >= STATUSES.length - 1 ? ' disabled' : '') + '>›</button>' +
      '<button type="button" class="kb-done" title="완료 처리">✓ 완료</button>' +
      '</span>' +
      '<span class="bc-actions"><button type="button" class="bc-edit">수정</button>' +
      '<button type="button" class="bc-del">삭제</button></span>' +
      '</div>';

    el.addEventListener('dragstart', function (e) {
      e.dataTransfer.setData('text/plain', it.id);
      e.dataTransfer.effectAllowed = 'move';
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', function () { el.classList.remove('dragging'); });

    el.querySelectorAll('.kb-move').forEach(function (b) {
      b.addEventListener('click', function () {
        var dir = parseInt(b.dataset.dir, 10);
        var next = STATUSES[statusIdx + dir];
        if (next) update(it.id, { status: next.key });
      });
    });
    el.querySelector('.kb-done').addEventListener('click', function () { complete(it); });

    el.querySelector('.bc-edit').addEventListener('click', function () {
      var nt = prompt('제목', it.title);
      if (nt === null) return;
      var nn = prompt('메모', it.note || '');
      if (nn === null) return;
      var ng = prompt('태그 (쉼표로 구분)', (it.tags || []).join(', '));
      if (ng === null) return;
      update(it.id, {
        title: nt.trim() || it.title,
        note: nn.trim(),
        tags: ng.split(',').map(function (x) { return x.trim(); }).filter(Boolean)
      });
    });
    el.querySelector('.bc-del').addEventListener('click', function () {
      if (!confirm('이 할 일을 삭제할까요?')) return;
      removeItem(it.id);
    });

    return el;
  }

  return { init: init, render: render };
})();
