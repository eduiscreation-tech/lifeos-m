(function () {
  'use strict';

  var CFG = window.LIFEOS_CONFIG || { appName: 'LIFEOS M', defaultApiUrl: '', spreadsheetUrl: '#' };
  var SEED = window.LIFEOS_SEED || { tasks: [], logs: [] };
  var LS = {
    tasks: 'lifeos_m_tasks_v01',
    logs: 'lifeos_m_logs_v01',
    api: 'lifeos_m_api_url',
    token: 'lifeos_m_api_token',
    active: 'lifeos_m_active_timer'
  };
  var STATUS = ['미완료', '진행중', '완료', '보류', '위임', '취소'];
  var ROUTINE_SLOTS = ['기상', '직장', '점심', '저녁', '취침전'];
  var NAV = [
    ['today', '오늘', '⌂'],
    ['tasks', '할 일', '✓'],
    ['routine', '루틴', '↻'],
    ['buy', '구매', '🛒'],
    ['schedule', '일정', '◷'],
    ['logs', '기록', '◉'],
    ['settings', '설정', '⚙']
  ];

  function cloneSafe(v) {
    return JSON.parse(JSON.stringify(v == null ? null : v));
  }

  function loadJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : cloneSafe(fallback);
    } catch (e) {
      return cloneSafe(fallback);
    }
  }

  var loadedTasks = loadJSON(LS.tasks, SEED.tasks || []);
  var loadedLogs = loadJSON(LS.logs, SEED.logs || []);
  var state = {
    page: 'today',
    filter: '미완료',
    scopeFilter: '개인',
    tagFilter: '',
    tasks: Array.isArray(loadedTasks) ? loadedTasks : [],
    logs: Array.isArray(loadedLogs) ? loadedLogs : [],
    visibleIds: [],
    apiUrl: localStorage.getItem(LS.api) || CFG.defaultApiUrl || '',
    apiToken: localStorage.getItem(LS.token) || '',
    active: loadJSON(LS.active, null)
  };

  function el(id) { return document.getElementById(id); }
  function todayISO() { return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }); }
  function nowISO() { return new Date().toISOString(); }
  function saveLocal() {
    localStorage.setItem(LS.tasks, JSON.stringify(state.tasks));
    localStorage.setItem(LS.logs, JSON.stringify(state.logs));
    localStorage.setItem(LS.active, JSON.stringify(state.active));
  }
  function escapeHTML(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function dateOnly(v) { return v ? String(v).slice(0, 10) : ''; }
  function formatDue(v) {
    if (!v) return '';
    var d = new Date(v);
    if (isNaN(d.getTime())) return String(v);
    return new Intl.DateTimeFormat('ko-KR', {
      month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit'
    }).format(d);
  }
  function isOpen(t) { return t && t.status !== '완료' && t.status !== '취소'; }
  function isImportant(t) {
    var v = t ? t.important : '';
    return v === true || String(v).toLowerCase() === 'true' || String(v) === '1' || String(v).toUpperCase() === 'Y';
  }
  function scopeOf(t) { return (t && t.scope) ? t.scope : '개인'; }
  function sortTasks(a, b) { return (Number(a.sort_order) || 99999) - (Number(b.sort_order) || 99999); }
  function tagArray(t) {
    var raw = t && Array.isArray(t.tags) ? t.tags : String((t && t.tags) || '').split(/[,\s]+/);
    var out = [];
    raw.forEach(function (x) {
      var v = String(x).trim().replace(/^#/, '');
      if (v && out.indexOf(v) < 0) out.push(v);
    });
    return out;
  }
  function normalizeTags(v) {
    var raw = Array.isArray(v) ? v : String(v || '').split(/[,\s]+/);
    var out = [];
    raw.forEach(function (x) {
      var s = String(x).trim().replace(/^#/, '');
      if (s && out.indexOf(s) < 0) out.push(s);
    });
    return out.join(',');
  }
  function extractQuickTags(q) {
    var tags = [];
    var title = String(q || '').replace(/(^|\s)#([^\s#]+)/g, function (_, prefix, tag) {
      tags.push(tag.replace(/[.,!?;:]+$/, ''));
      return prefix;
    }).replace(/\s+/g, ' ').trim();
    return { title: title, tags: normalizeTags(tags) };
  }
  function allTags() {
    var out = [];
    state.tasks.forEach(function (t) {
      tagArray(t).forEach(function (tag) { if (out.indexOf(tag) < 0) out.push(tag); });
    });
    return out.sort(function (a, b) { return a.localeCompare(b, 'ko'); });
  }

  function navHTML() {
    return NAV.map(function (item) {
      var id = item[0], label = item[1], icon = item[2];
      return '<button class="nav-btn ' + (state.page === id ? 'active' : '') + '" data-nav="' + id + '">' + icon + '<br class="mobile-only">' + label + '</button>';
    }).join('');
  }

  function setTitle(title) {
    if (el('pageTitle')) el('pageTitle').textContent = title;
  }

  function tagChip(tag) {
    return '<button type="button" class="tag tag-click ' + (state.tagFilter === tag ? 'tag-active' : '') + '" data-tag="' + escapeHTML(tag) + '">#' + escapeHTML(tag) + '</button>';
  }

  function taskCard(t, n, compact) {
    var metaVals = [t.status, scopeOf(t), t.area, t.type, t.list].filter(Boolean);
    var meta = metaVals.map(function (x) { return '<span class="tag">' + escapeHTML(x) + '</span>'; }).join('');
    var due = t.due_at ? '<span class="tag">' + escapeHTML(formatDue(t.due_at)) + '</span>' : '';
    var del = t.delegate ? '<span class="tag">→ ' + escapeHTML(t.delegate) + '</span>' : '';
    var imp = isImportant(t) ? '<span class="tag important-tag">★ 중요</span>' : '';
    var tags = tagArray(t).map(tagChip).join('');
    var actions = '';
    if (!compact) {
      actions = '<div class="actions">' +
        (t.status !== '완료' ? '<button class="done" data-act="완료" data-id="' + t.id + '">완료</button>' : '') +
        (t.status !== '보류' ? '<button class="hold" data-act="보류" data-id="' + t.id + '">보류</button>' : '') +
        '<button class="ghost" data-important="' + t.id + '">' + (isImportant(t) ? '★ 중요 해제' : '☆ 중요') + '</button>' +
        '<button class="ghost" data-act="진행중" data-id="' + t.id + '">진행</button>' +
        '<button class="edit" data-edit="' + t.id + '">수정</button>' +
      '</div>';
    }
    return '<div class="card"><div class="task-row">' +
      '<div class="num">' + n + '</div>' +
      '<div><div class="task-title">' + escapeHTML(t.title) + '</div>' +
      '<div class="meta">' + imp + meta + due + del + tags + '</div>' +
      (t.note ? '<div class="sub" style="margin-top:7px">' + escapeHTML(t.note) + '</div>' : '') + actions + '</div>' +
      '<button class="ghost" data-edit="' + t.id + '" style="padding:6px 9px">⋯</button>' +
    '</div></div>';
  }

  function timerHTML() {
    if (!state.active) {
      return '<div class="timer-card"><div class="timer-line"><div><div class="sub" style="color:#94a3b8">현재 활동</div><strong>진행 중인 활동 없음</strong></div><button class="ghost" data-start-timer="집중">집중 시작</button></div></div>';
    }
    return '<div class="timer-card"><div class="timer-line"><div><div class="sub" style="color:#94a3b8">현재 활동</div><strong>' + escapeHTML(state.active.activity) + '</strong></div><div><div class="timer-time" id="timerTime">00:00:00</div><button class="ghost" id="stopTimer">종료</button></div></div></div>';
  }

  function renderToday() {
    setTitle('오늘');
    var today = todayISO();
    var candidates = state.tasks.filter(function (t) {
      return isOpen(t) && t.type !== '일정' && t.type !== '루틴' && (dateOnly(t.due_at) === today || isImportant(t));
    }).sort(function (a, b) {
      var at = dateOnly(a.due_at) === today, bt = dateOnly(b.due_at) === today;
      if (at !== bt) return at ? -1 : 1;
      if (isImportant(a) !== isImportant(b)) return isImportant(a) ? -1 : 1;
      return sortTasks(a, b);
    });
    var doneToday = state.tasks.filter(function (t) { return dateOnly(t.completed_at) === today; }).length;
    var dueToday = candidates.filter(function (t) { return dateOnly(t.due_at) === today; }).length;
    var importantOpen = state.tasks.filter(function (t) { return isOpen(t) && isImportant(t) && t.type !== '일정' && t.type !== '루틴'; }).length;
    var routineDone = state.tasks.filter(function (t) { return t.type === '루틴' && dateOnly(t.routine_last_done) === today; }).length;
    var schedule = state.tasks.filter(function (t) { return t.type === '일정' && isOpen(t); }).sort(function (a, b) { return String(a.due_at || '').localeCompare(String(b.due_at || '')); });
    state.visibleIds = candidates.map(function (t) { return t.id; });
    var cards = candidates.length ? candidates.map(function (t, i) { return taskCard(t, i + 1, false); }).join('') : '<div class="empty">오늘 날짜로 지정했거나 중요 표시한 할 일이 없어.</div>';
    var schedules = schedule.slice(0, 4).map(function (t) { return '<div class="card"><div class="schedule-time">' + escapeHTML(formatDue(t.due_at)) + '</div><div class="task-title">' + escapeHTML(t.title) + '</div></div>'; }).join('') || '<div class="empty">등록된 일정이 없어.</div>';
    return '<div class="summary-grid">' +
      '<div class="stat"><strong>' + dueToday + '</strong><span>오늘 지정</span></div>' +
      '<div class="stat"><strong>' + importantOpen + '</strong><span>중요</span></div>' +
      '<div class="stat"><strong>' + doneToday + '</strong><span>오늘 완료</span></div>' +
      '<div class="stat"><strong>' + routineDone + '</strong><span>루틴 완료</span></div>' +
      '</div>' + timerHTML() +
      '<div class="section-title"><h2>오늘 할 일</h2><button class="ghost" id="newTaskBtn">+ 추가</button></div>' + cards +
      '<div class="section-title"><h2>다가오는 일정</h2></div>' + schedules;
  }

  function renderTasks() {
    setTitle(state.tagFilter ? '#' + state.tagFilter : '할 일');
    var statusFilters = ['미완료', '진행중', '보류', '위임', '완료', '전체'];
    var scopeFilters = ['개인', '직장', '전체'];
    var list = state.tasks.filter(function (t) { return state.tagFilter ? t.type !== '일정' : t.type === '할일'; });
    if (state.scopeFilter !== '전체') list = list.filter(function (t) { return scopeOf(t) === state.scopeFilter; });
    if (state.filter !== '전체') list = list.filter(function (t) { return t.status === state.filter; });
    if (state.tagFilter) list = list.filter(function (t) { return tagArray(t).indexOf(state.tagFilter) >= 0; });
    list.sort(sortTasks);
    state.visibleIds = list.map(function (t) { return t.id; });
    var tags = allTags();
    return '<div class="filter-label">구분</div><div class="filters">' + scopeFilters.map(function (f) { return '<button class="filter ' + (state.scopeFilter === f ? 'active' : '') + '" data-scope="' + f + '">' + f + '</button>'; }).join('') + '</div>' +
      '<div class="filter-label">상태</div><div class="filters">' + statusFilters.map(function (f) { return '<button class="filter ' + (state.filter === f ? 'active' : '') + '" data-filter="' + f + '">' + f + '</button>'; }).join('') + '</div>' +
      (tags.length ? '<div class="filter-label">태그</div><div class="filters"><button class="filter ' + (!state.tagFilter ? 'active' : '') + '" data-clear-tag>전체 태그</button>' + tags.map(function (t) { return '<button class="filter ' + (state.tagFilter === t ? 'active' : '') + '" data-tag="' + escapeHTML(t) + '">#' + escapeHTML(t) + '</button>'; }).join('') + '</div>' : '') +
      (list.length ? list.map(function (t, i) { return taskCard(t, i + 1, false); }).join('') : '<div class="empty">조건에 맞는 항목이 없어.</div>');
  }

  function renderRoutine() {
    setTitle('루틴');
    var routines = state.tasks.filter(function (t) { return t.type === '루틴' && t.status !== '취소'; }).sort(sortTasks);
    state.visibleIds = routines.map(function (t) { return t.id; });
    return ROUTINE_SLOTS.map(function (slot) {
      var list = routines.filter(function (t) { return (t.routine_slot || '기상') === slot; });
      var body = list.length ? list.map(function (t) {
        var done = dateOnly(t.routine_last_done) === todayISO();
        return '<div class="card routine-card ' + (done ? 'routine-done' : '') + '"><div class="routine-main">' +
          '<button class="routine-check ' + (done ? 'checked' : '') + '" data-routine="' + t.id + '">' + (done ? '✓' : '○') + '</button>' +
          '<div><div class="task-title">' + escapeHTML(t.title) + '</div><div class="meta"><span class="tag">' + escapeHTML(scopeOf(t)) + '</span>' + tagArray(t).map(tagChip).join('') + '</div></div>' +
          '<button class="ghost" data-edit="' + t.id + '" style="padding:6px 9px">⋯</button></div></div>';
      }).join('') : '<div class="empty compact-empty">' + slot + ' 루틴이 없어.</div>';
      return '<div class="routine-group"><div class="section-title"><h2>' + slot + '</h2><button class="ghost" data-new-routine="' + slot + '">+ 추가</button></div>' + body + '</div>';
    }).join('');
  }

  function renderBuy() {
    setTitle('구매');
    var list = state.tasks.filter(function (t) { return t.type === '구매' && t.status !== '완료' && t.status !== '취소'; }).sort(sortTasks);
    state.visibleIds = list.map(function (t) { return t.id; });
    var groups = [];
    list.forEach(function (t) { var g = t.list || '일반'; if (groups.indexOf(g) < 0) groups.push(g); });
    return groups.length ? groups.map(function (g) {
      return '<div class="list-group"><h3>' + escapeHTML(g) + '</h3>' + list.filter(function (t) { return (t.list || '일반') === g; }).map(function (t) { return taskCard(t, state.visibleIds.indexOf(t.id) + 1, false); }).join('') + '</div>';
    }).join('') : '<div class="empty">구매할 것이 없어.</div>';
  }

  function renderSchedule() {
    setTitle('일정');
    var list = state.tasks.filter(function (t) { return t.type === '일정' && t.status !== '취소'; }).sort(function (a, b) { return String(a.due_at || '').localeCompare(String(b.due_at || '')); });
    state.visibleIds = list.map(function (t) { return t.id; });
    return list.length ? list.map(function (t, i) { return taskCard(t, i + 1, true); }).join('') : '<div class="empty">일정이 없어.</div>';
  }

  function renderLogs() {
    setTitle('기록');
    state.visibleIds = [];
    var total = state.logs.reduce(function (sum, l) { return sum + (Number(l.duration_min) || 0); }, 0);
    return timerHTML() + '<div class="summary-grid"><div class="stat"><strong>' + Math.floor(total / 60) + 'h ' + (total % 60) + 'm</strong><span>누적 기록</span></div><div class="stat"><strong>' + state.logs.length + '</strong><span>로그</span></div><div class="stat"><strong>' + (state.active ? 'ON' : 'OFF') + '</strong><span>현재 타이머</span></div></div>' + state.logs.slice().reverse().map(function (l) { return '<div class="card"><div class="task-title">' + escapeHTML(l.activity) + '</div><div class="meta"><span class="tag">' + (Number(l.duration_min) || 0) + '분</span><span class="tag">' + escapeHTML(l.category || '') + '</span></div><div class="sub">' + escapeHTML(l.note || '') + '</div></div>'; }).join('');
  }

  function renderSettings() {
    setTitle('설정');
    state.visibleIds = [];
    return '<div class="card"><div class="task-title">Google Sheet 동기화</div><p class="sub">현재 데이터 원본: LIFEOS_M_DATA</p><div class="meta"><span class="tag">' + ((state.apiUrl && state.apiToken) ? '연결 정보 저장됨' : '아직 로컬 모드') + '</span></div><div class="actions"><button id="openSettings">연결 설정</button><button class="ghost" id="syncNow">지금 동기화</button>' + ((CFG.spreadsheetUrl && CFG.spreadsheetUrl !== '#') ? '<a href="' + escapeHTML(CFG.spreadsheetUrl) + '" target="_blank"><button type="button" class="ghost">Sheet 열기</button></a>' : '') + '</div></div><div class="card"><div class="task-title">데이터</div><p class="sub">항목 ' + state.tasks.length + '개 · 로그 ' + state.logs.length + '개</p></div>';
  }

  function render() {
    try {
      if (el('desktopNav')) el('desktopNav').innerHTML = navHTML();
      if (el('bottomNav')) el('bottomNav').innerHTML = navHTML();
      if (el('todayLabel')) el('todayLabel').textContent = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'full' }).format(new Date());
      var html = '';
      if (state.page === 'today') html = renderToday();
      else if (state.page === 'tasks') html = renderTasks();
      else if (state.page === 'routine') html = renderRoutine();
      else if (state.page === 'buy') html = renderBuy();
      else if (state.page === 'schedule') html = renderSchedule();
      else if (state.page === 'logs') html = renderLogs();
      else html = renderSettings();
      if (el('view')) el('view').innerHTML = html;
      if (el('syncState')) el('syncState').textContent = (state.apiUrl && state.apiToken) ? 'Sheet 연결' : '로컬';
      bindDynamic();
      tickTimer();
    } catch (err) {
      console.error(err);
      if (el('view')) el('view').innerHTML = '<div class="card"><div class="task-title">화면 로딩 오류</div><div class="sub">' + escapeHTML(err && err.message ? err.message : String(err)) + '</div></div>';
    }
  }

  function bindDynamic() {
    document.querySelectorAll('[data-nav]').forEach(function (b) { b.onclick = function () { state.page = b.getAttribute('data-nav'); state.tagFilter = ''; render(); }; });
    document.querySelectorAll('[data-filter]').forEach(function (b) { b.onclick = function () { state.filter = b.getAttribute('data-filter'); render(); }; });
    document.querySelectorAll('[data-scope]').forEach(function (b) { b.onclick = function () { state.scopeFilter = b.getAttribute('data-scope'); render(); }; });
    document.querySelectorAll('[data-tag]').forEach(function (b) { b.onclick = function () { state.tagFilter = b.getAttribute('data-tag'); state.page = 'tasks'; state.scopeFilter = '전체'; state.filter = '전체'; render(); }; });
    document.querySelectorAll('[data-clear-tag]').forEach(function (b) { b.onclick = function () { state.tagFilter = ''; render(); }; });
    document.querySelectorAll('[data-act]').forEach(function (b) { b.onclick = function () { patchTask(b.getAttribute('data-id'), { status: b.getAttribute('data-act') }); }; });
    document.querySelectorAll('[data-important]').forEach(function (b) { b.onclick = function () { var t = state.tasks.find(function (x) { return x.id === b.getAttribute('data-important'); }); if (t) patchTask(t.id, { important: !isImportant(t) }); }; });
    document.querySelectorAll('[data-edit]').forEach(function (b) { b.onclick = function () { openEdit(b.getAttribute('data-edit')); }; });
    document.querySelectorAll('[data-start-timer]').forEach(function (b) { b.onclick = function () { startTimer(b.getAttribute('data-start-timer')); }; });
    document.querySelectorAll('[data-routine]').forEach(function (b) { b.onclick = function () { toggleRoutine(b.getAttribute('data-routine')); }; });
    document.querySelectorAll('[data-new-routine]').forEach(function (b) { b.onclick = function () { openEdit('', { type: '루틴', routine_slot: b.getAttribute('data-new-routine') }); }; });
    if (el('newTaskBtn')) el('newTaskBtn').onclick = function () { openEdit(''); };
    if (el('stopTimer')) el('stopTimer').onclick = stopTimer;
    if (el('openSettings')) el('openSettings').onclick = openSettings;
    if (el('syncNow')) el('syncNow').onclick = syncPull;
  }

  async function patchTask(id, patch) {
    var t = state.tasks.find(function (x) { return x.id === id; });
    if (!t) return;
    Object.keys(patch).forEach(function (k) { t[k] = patch[k]; });
    if (patch.status === '완료') t.completed_at = todayISO();
    else if (patch.status && patch.status !== '완료') t.completed_at = '';
    saveLocal();
    render();
    if (state.apiUrl && state.apiToken) await apiPost({ action: 'patchTask', id: id, patch: Object.assign({}, patch, { completed_at: t.completed_at }) });
  }

  function nextLocalId() {
    var max = 0;
    state.tasks.forEach(function (t) { var n = Number(String(t.id || '').replace(/\D/g, '')) || 0; if (n > max) max = n; });
    return 'T' + String(max + 1).padStart(4, '0');
  }

  async function addTask(data) {
    var t = {
      id: nextLocalId(), title: data.title, status: data.status || '미완료', area: data.area || '기타', type: data.type || '할일', list: data.list || '일반',
      created_at: todayISO(), due_at: data.due_at || '', completed_at: '', delegate: data.delegate || '', note: data.note || '', sort_order: state.tasks.length + 1,
      scope: data.scope || '개인', important: !!data.important, routine_slot: data.routine_slot || '', tags: normalizeTags(data.tags), routine_last_done: ''
    };
    state.tasks.push(t); saveLocal(); render();
    if (state.apiUrl && state.apiToken) {
      var r = await apiPost({ action: 'addTask', task: t });
      if (r && r.task) { Object.assign(t, r.task); saveLocal(); render(); }
    }
  }

  async function toggleRoutine(id) {
    var t = state.tasks.find(function (x) { return x.id === id; });
    if (!t) return;
    await patchTask(id, { routine_last_done: dateOnly(t.routine_last_done) === todayISO() ? '' : todayISO() });
  }

  function toggleRoutineField() {
    if (el('routineSlotWrap') && el('editType')) el('routineSlotWrap').style.display = el('editType').value === '루틴' ? 'grid' : 'none';
  }

  function openEdit(id, preset) {
    preset = preset || {};
    var t = state.tasks.find(function (x) { return x.id === id; });
    var src = t || preset;
    if (!el('taskDialog')) return;
    el('dialogTitle').textContent = t ? '항목 수정' : '새 항목';
    el('editId').value = t ? t.id : '';
    el('editTitle').value = t ? (t.title || '') : '';
    el('editStatus').innerHTML = STATUS.map(function (s) { return '<option' + ((src.status || '미완료') === s ? ' selected' : '') + '>' + s + '</option>'; }).join('');
    el('editArea').value = t ? (t.area || '') : '';
    el('editType').value = src.type || '할일';
    el('editList').value = t ? (t.list || '일반') : '일반';
    el('editScope').value = scopeOf(src);
    el('editImportant').checked = isImportant(src);
    el('editRoutineSlot').value = src.routine_slot || '기상';
    el('editTags').value = tagArray(src).map(function (x) { return '#' + x; }).join(' ');
    el('editDue').value = t && t.due_at ? String(t.due_at).slice(0, 16) : '';
    el('editDelegate').value = t ? (t.delegate || '') : '';
    el('editNote').value = t ? (t.note || '') : '';
    toggleRoutineField();
    el('taskDialog').showModal();
  }

  async function handleQuick(raw) {
    var q = String(raw || '').trim();
    if (!q) return;
    var m = q.match(/^(\d+)\s*(완|완료|보류|진행|진행중|취소)$/);
    if (m) {
      var id = state.visibleIds[Number(m[1]) - 1];
      if (!id) return toast('현재 화면에 그 번호가 없어.');
      var map = { '완': '완료', '완료': '완료', '보류': '보류', '진행': '진행중', '진행중': '진행중', '취소': '취소' };
      await patchTask(id, { status: map[m[2]] });
      return;
    }
    m = q.match(/^(\d+)\s*위임(?:\s+(.*))?$/);
    if (m) {
      var wid = state.visibleIds[Number(m[1]) - 1];
      if (!wid) return toast('현재 화면에 그 번호가 없어.');
      await patchTask(wid, { status: '위임', delegate: m[2] || '' });
      return;
    }
    var parsed = extractQuickTags(q);
    var text = parsed.title, tags = parsed.tags, scope = '개인';
    if (/^직장\s*[:：]/.test(text)) { scope = '직장'; text = text.replace(/^직장\s*[:：]\s*/, ''); }
    else if (/^개인\s*[:：]/.test(text)) { text = text.replace(/^개인\s*[:：]\s*/, ''); }
    m = text.match(/^루틴\s+(기상|직장|점심|저녁|취침전)\s*[:：]?\s*(.+)$/);
    if (m) { await addTask({ title: m[2].trim(), type: '루틴', routine_slot: m[1], scope: m[1] === '직장' ? '직장' : scope, tags: tags }); return; }
    if (text.indexOf('다이소 ') === 0) { await addTask({ title: text.slice(4).trim(), type: '구매', list: '다이소', area: '집', scope: scope, tags: tags }); return; }
    if (text.indexOf('대전집 ') === 0) { await addTask({ title: text.slice(4).trim(), type: '구매', list: '대전집', area: '대전집', scope: scope, tags: tags }); return; }
    if (text.indexOf('구매:') === 0) { await addTask({ title: text.slice(3).trim(), type: '구매', list: '일반', scope: scope, tags: tags }); return; }
    await addTask({ title: text, scope: scope, tags: tags });
  }

  function startTimer(activity) { state.active = { activity: activity, start_at: nowISO() }; saveLocal(); render(); }
  async function stopTimer() {
    if (!state.active) return;
    var start = new Date(state.active.start_at), end = new Date();
    var mins = Math.max(1, Math.round((end - start) / 60000));
    var log = { id: 'L' + String(state.logs.length + 1).padStart(4, '0'), activity: state.active.activity, start_at: state.active.start_at, end_at: end.toISOString(), duration_min: mins, category: '활동', note: '' };
    state.logs.push(log); state.active = null; saveLocal(); render();
    if (state.apiUrl && state.apiToken) await apiPost({ action: 'addLog', log: log });
  }
  function tickTimer() {
    var t = el('timerTime');
    if (!t || !state.active) return;
    var sec = Math.max(0, Math.floor((Date.now() - new Date(state.active.start_at).getTime()) / 1000));
    var h = String(Math.floor(sec / 3600)).padStart(2, '0');
    var m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
    var s = String(sec % 60).padStart(2, '0');
    t.textContent = h + ':' + m + ':' + s;
    setTimeout(tickTimer, 1000);
  }

  function openSettings() {
    if (!el('settingsDialog')) return;
    el('apiUrlInput').value = state.apiUrl;
    el('apiTokenInput').value = state.apiToken;
    el('settingsDialog').showModal();
  }

  async function apiGet() {
    var url = new URL(state.apiUrl);
    url.searchParams.set('action', 'snapshot');
    url.searchParams.set('token', state.apiToken);
    var r = await fetch(url.toString(), { cache: 'no-store' });
    return r.json();
  }
  async function apiPost(payload) {
    try {
      var r = await fetch(state.apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ token: state.apiToken }, payload)) });
      return await r.json();
    } catch (e) {
      console.warn(e); toast('Sheet 반영 확인 필요'); return null;
    }
  }
  async function syncPull() {
    if (!state.apiUrl || !state.apiToken) { openSettings(); return; }
    if (el('syncState')) el('syncState').textContent = '동기화 중…';
    try {
      var data = await apiGet();
      if (data && data.ok) {
        state.tasks = Array.isArray(data.tasks) ? data.tasks : [];
        state.logs = Array.isArray(data.logs) ? data.logs : [];
        saveLocal(); render(); toast('동기화 완료');
      } else toast((data && data.error) || '동기화 실패');
    } catch (e) {
      console.warn(e); toast('동기화 실패 · 로컬 데이터 유지'); render();
    }
  }

  function toast(msg) {
    var d = document.createElement('div');
    d.textContent = msg;
    Object.assign(d.style, { position: 'fixed', top: '14px', left: '50%', transform: 'translateX(-50%)', background: '#0f172a', color: 'white', padding: '9px 13px', borderRadius: '10px', zIndex: 999, fontSize: '13px' });
    document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, 2200);
  }

  function boot() {
    if (el('editType')) el('editType').addEventListener('change', toggleRoutineField);
    if (el('saveEdit')) el('saveEdit').onclick = async function (e) {
      e.preventDefault();
      var id = el('editId').value;
      var data = {
        title: el('editTitle').value.trim(), status: el('editStatus').value, area: el('editArea').value.trim() || '기타', type: el('editType').value, list: el('editList').value.trim() || '일반',
        scope: el('editScope').value, important: el('editImportant').checked, routine_slot: el('editType').value === '루틴' ? el('editRoutineSlot').value : '', tags: normalizeTags(el('editTags').value),
        due_at: el('editDue').value, delegate: el('editDelegate').value.trim(), note: el('editNote').value.trim()
      };
      var parsed = extractQuickTags(data.title); data.title = parsed.title; data.tags = normalizeTags([data.tags, parsed.tags].filter(Boolean).join(','));
      if (!data.title) return;
      el('taskDialog').close();
      if (id) await patchTask(id, data); else await addTask(data);
    };
    if (el('quickAdd') && el('quickInput')) {
      el('quickAdd').onclick = function () { var q = el('quickInput').value; el('quickInput').value = ''; handleQuick(q); };
      el('quickInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); el('quickAdd').click(); } });
    }
    if (el('saveSettings')) el('saveSettings').onclick = async function (e) {
      e.preventDefault();
      state.apiUrl = el('apiUrlInput').value.trim(); state.apiToken = el('apiTokenInput').value.trim();
      localStorage.setItem(LS.api, state.apiUrl); localStorage.setItem(LS.token, state.apiToken);
      el('settingsDialog').close(); render(); if (state.apiUrl && state.apiToken) await syncPull();
    };
    if (el('syncBtnDesktop')) el('syncBtnDesktop').onclick = function () { if (state.apiUrl && state.apiToken) syncPull(); else openSettings(); };
    render();
    if (state.apiUrl && state.apiToken) syncPull();
    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) navigator.serviceWorker.register('./service-worker.js?v=023').catch(console.warn);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
