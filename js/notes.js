/* notes.js — 아이디어 보드 (Padlet 스타일 스티키 메모, 전역 App.notes) */
window.App = window.App || {};

App.notes = (function () {
  var U = App.util;
  var COLORS = ['c-yellow', 'c-pink', 'c-blue', 'c-green', 'c-purple'];
  var COLOR_HEX = {
    'c-yellow': '#f2e6a0', 'c-pink': '#f4b8c6', 'c-blue': '#a9d4f5',
    'c-green': '#b4e3bb', 'c-purple': '#d0bef5'
  };
  var NOTE_W = 220;
  var maxZ = 10;

  function isNarrow() { return window.matchMedia('(max-width: 560px)').matches; }
  function getNotes() { return App.store.get('notes', []); }
  function setNotes(list) { App.store.set('notes', list); }

  // 예전 스키마(위치·색 없음) 보정
  function migrate(list) {
    var changed = false;
    list.forEach(function (n, i) {
      if (typeof n.x !== 'number') { n.x = 24 + (i % 6) * 30; changed = true; }
      if (typeof n.y !== 'number') { n.y = 24 + (i % 6) * 30; changed = true; }
      if (!n.color) { n.color = COLORS[i % COLORS.length]; changed = true; }
    });
    if (changed) setNotes(list);
    return list;
  }

  function init() {
    document.getElementById('noteAdd').addEventListener('click', addNote);
    window.addEventListener('resize', U.debounce(render, 200));
    render();
  }

  function addNote() {
    var list = getNotes();
    var i = list.length;
    var n = {
      id: 'nt:' + U.uid(), text: '', color: COLORS[i % COLORS.length],
      x: 24 + (i % 6) * 30, y: 24 + (i % 6) * 30,
      createdAt: Date.now(), updatedAt: Date.now()
    };
    list.push(n);
    setNotes(list);
    render();
    var ta = document.querySelector('.idea-note[data-id="' + n.id + '"] textarea');
    if (ta) { ta.focus(); document.getElementById('view-notes').scrollIntoView({ block: 'nearest' }); }
  }

  function render() {
    var board = document.getElementById('ideaBoard');
    if (!board) return;
    var list = migrate(getNotes());
    board.innerHTML = '';
    board.classList.toggle('is-flow', isNarrow());

    if (!list.length) {
      board.innerHTML = '<p class="board-empty">메모가 없습니다. “+ 메모 추가”로 시작하세요.</p>';
      board.style.minWidth = '';
      board.style.minHeight = '';
      return;
    }

    var narrow = isNarrow();
    var maxX = 0, maxY = 0;

    list.forEach(function (n) {
      var note = document.createElement('div');
      note.className = 'idea-note ' + (n.color || 'c-yellow');
      note.dataset.id = n.id;
      if (!narrow) {
        note.style.left = (n.x || 0) + 'px';
        note.style.top = (n.y || 0) + 'px';
        note.style.width = NOTE_W + 'px';
      }

      note.innerHTML =
        '<div class="note-drag" title="끌어서 이동"><span class="note-grip">⋮⋮</span>' +
        '<button class="note-del" title="삭제" type="button">✕</button></div>' +
        '<textarea placeholder="메모…"></textarea>' +
        '<div class="note-foot"><div class="note-colors"></div>' +
        '<span class="note-date"></span></div>';

      var ta = note.querySelector('textarea');
      ta.value = n.text || '';
      setTimeout(function () { autoGrow(ta); }, 0);
      ta.addEventListener('input', function () {
        autoGrow(ta);
        saveText(n.id, ta.value);
      });
      ta.addEventListener('blur', function () { saveText(n.id, ta.value); });

      var cc = note.querySelector('.note-colors');
      COLORS.forEach(function (c) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'note-color' + (n.color === c ? ' is-on' : '');
        b.style.background = COLOR_HEX[c];
        b.title = '색 변경';
        b.addEventListener('click', function () { setColor(n.id, c); });
        cc.appendChild(b);
      });

      note.querySelector('.note-date').textContent =
        U.relTime(new Date(n.updatedAt || n.createdAt).toISOString());

      note.querySelector('.note-del').addEventListener('click', function () {
        if (!confirm('이 메모를 삭제할까요?')) return;
        setNotes(getNotes().filter(function (x) { return x.id !== n.id; }));
        render();
      });

      if (!narrow) enableDrag(note, n.id);

      board.appendChild(note);
      maxX = Math.max(maxX, (n.x || 0) + NOTE_W);
      maxY = Math.max(maxY, (n.y || 0) + note.offsetHeight || 0);
    });

    if (!narrow) {
      board.style.minWidth = Math.max(board.clientWidth, maxX + 24) + 'px';
      board.style.minHeight = Math.max(520, maxY + 40) + 'px';
    } else {
      board.style.minWidth = '';
      board.style.minHeight = '';
    }
  }

  function autoGrow(ta) {
    ta.style.height = 'auto';
    ta.style.height = Math.max(56, ta.scrollHeight) + 'px';
  }

  function patch(id, obj, silent) {
    var list = getNotes();
    var t = list.find(function (x) { return x.id === id; });
    if (!t) return null;
    Object.keys(obj).forEach(function (k) { t[k] = obj[k]; });
    t.updatedAt = Date.now();
    setNotes(list);
    if (!silent) {
      var el = document.querySelector('.idea-note[data-id="' + id + '"] .note-date');
      if (el) el.textContent = U.relTime(new Date(t.updatedAt).toISOString());
    }
    return t;
  }

  var textTimers = {};
  function saveText(id, text) {
    clearTimeout(textTimers[id]);
    textTimers[id] = setTimeout(function () { patch(id, { text: text }); }, 300);
  }

  function setColor(id, color) {
    patch(id, { color: color }, true);
    var el = document.querySelector('.idea-note[data-id="' + id + '"]');
    if (!el) return;
    COLORS.forEach(function (c) { el.classList.remove(c); });
    el.classList.add(color);
    el.querySelectorAll('.note-color').forEach(function (b, i) {
      b.classList.toggle('is-on', COLORS[i] === color);
    });
  }

  function enableDrag(note, id) {
    var handle = note.querySelector('.note-drag');
    handle.addEventListener('pointerdown', function (e) {
      if (e.target.classList.contains('note-del')) return;
      e.preventDefault();
      var startX = e.clientX, startY = e.clientY;
      var origLeft = parseInt(note.style.left, 10) || 0;
      var origTop = parseInt(note.style.top, 10) || 0;
      note.style.zIndex = ++maxZ;
      note.classList.add('dragging');
      try { handle.setPointerCapture(e.pointerId); } catch (err) {}

      function move(ev) {
        note.style.left = Math.max(0, origLeft + (ev.clientX - startX)) + 'px';
        note.style.top = Math.max(0, origTop + (ev.clientY - startY)) + 'px';
      }
      function up() {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        note.classList.remove('dragging');
        patch(id, {
          x: parseInt(note.style.left, 10) || 0,
          y: parseInt(note.style.top, 10) || 0
        }, true);
        var board = document.getElementById('ideaBoard');
        var needW = (parseInt(note.style.left, 10) || 0) + NOTE_W + 24;
        var minW = parseInt(board.style.minWidth, 10) || board.clientWidth;
        if (needW > minW) board.style.minWidth = needW + 'px';
        var needH = (parseInt(note.style.top, 10) || 0) + note.offsetHeight + 40;
        var minH = parseInt(board.style.minHeight, 10) || 520;
        if (needH > minH) board.style.minHeight = needH + 'px';
      }
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
    });
  }

  return { init: init, render: render };
})();
