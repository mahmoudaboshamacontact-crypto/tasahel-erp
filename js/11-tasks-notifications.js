
/* ===== المرحلة 9: المهام + جرس الإشعارات اللحظي + تنبيه التأخير ===== */
(function () {
  if (window.__phase9) return; window.__phase9 = true;
  const eh = escapeHtml, MGR = 'mahmoud.aboshama@tasahel.com.eg';
  const isMgr = () => window.__role ? window.__role === 'manager' : !!(currentUser && ['mahmoud.aboshama@tasahel.com.eg','mahmoud.aboshama.contact@gmail.com'].includes(String(currentUser.email || '').toLowerCase()));
  const missing = err => /42P01|PGRST205|does not exist|schema cache/i.test(((err && err.message) || '') + ' ' + ((err && err.code) || ''));
  let tasks = [], notes = [], ntCh = null, tkCh = null, tick = null, uid = null, filt = 'open', tkMissing = false, ntMissing = false;
  const asked = new Set();
  const fmt = s => new Intl.DateTimeFormat('ar-EG', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(s));
  const nameOf = id => { const p = profiles.find(x => x.id === id); return p ? p.full_name : 'موظف'; };
  const isLate = t => t.status === 'open' && new Date(t.due_at) < new Date();
  function human(mins) { mins = Math.abs(Math.round(mins)); if (mins < 60) return mins + ' دقيقة'; if (mins < 1440) return Math.floor(mins / 60) + ' ساعة'; return Math.floor(mins / 1440) + ' يوم'; }
  const rel = t => { const m = (new Date(t.due_at) - new Date()) / 60000; return m < 0 ? 'متأخرة ' + human(m) : 'باقي ' + human(m); };
  function localInput(d) { const p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()); }
  function defaultDue() { let d = new Date(); d.setHours(17, 0, 0, 0); if (d < new Date()) { d = new Date(Date.now() + 3600000); d.setMinutes(0, 0, 0); } return d; }

  /* ---------- الإشعارات ---------- */
  function renderBell() {
    const c = $('nt-count'); if (!c) return;
    const n = notes.filter(x => !x.read).length;
    c.textContent = n > 99 ? '99+' : String(n); c.classList.toggle('hidden', !n);
    const p = $('nt-panel'); if (!p) return;
    const items = notes.map(x => '<button type="button" data-id="' + x.id + '" onclick="ntOpen(this.dataset.id)" class="flex w-full items-start gap-2 border-b border-slate-100 dark:border-slate-800 px-3 py-2.5 text-right hover:bg-slate-50 dark:hover:bg-slate-800/60 ' + (x.read ? 'opacity-60' : '') + '"><span class="mt-1.5 h-2 w-2 shrink-0 rounded-full ' + (x.read ? 'bg-transparent' : x.kind === 'task_late' ? 'bg-rose-500' : 'bg-teal-500') + '"></span><span class="min-w-0 flex-1"><span class="block text-xs font-bold text-ink dark:text-white">' + eh(x.title) + '</span>' + (x.body ? '<span class="block text-[11px] text-slate-500">' + eh(x.body) + '</span>' : '') + '<span class="block text-[10px] text-slate-400 mt-0.5"><bdi>' + eh(fmt(x.created_at)) + '</bdi></span></span></button>').join('');
    p.innerHTML = '<div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-3 py-2.5"><b class="text-sm text-ink dark:text-white">الإشعارات</b><button type="button" onclick="ntReadAll()" class="text-[11px] text-teal-600 hover:underline">تعليم الكل كمقروء</button></div><div class="max-h-80 overflow-y-auto">' + (ntMissing ? '<div class="p-5 text-center text-xs text-slate-500">شغّل ملف <b class="font-mono">phase6-tasks-notifications.sql</b> الأول</div>' : items || '<div class="p-6 text-center text-xs text-slate-400">لا توجد إشعارات</div>') + '</div>';
  }
  window.ntOpen = async function (id) {
    const x = notes.find(n => String(n.id) === String(id)); if (!x) return;
    $('nt-panel').classList.add('hidden');
    if (!x.read) { x.read = true; renderBell(); sbClient.from('notifications').update({ read: true }).eq('id', x.id).then(() => {}); }
    if (String(x.kind).indexOf('task') === 0) switchTab('tasks');
  };
  window.ntReadAll = async function () {
    notes.forEach(n => n.read = true); renderBell();
    await sbClient.from('notifications').update({ read: true }).eq('user_id', uid).eq('read', false);
  };
  async function loadNotes() {
    const r = await sbClient.from('notifications').select('*').order('created_at', { ascending: false }).limit(30);
    if (r.error) { ntMissing = missing(r.error); renderBell(); return; }
    ntMissing = false; notes = r.data || []; renderBell();
  }
  function subscribe() {
    try { if (ntCh) sbClient.removeChannel(ntCh); if (tkCh) sbClient.removeChannel(tkCh); } catch (e) { /* */ }
    ntCh = sbClient.channel('p9-notes-' + uid).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + uid }, p => {
      if (notes.some(n => n.id === p.new.id)) return;
      notes.unshift(p.new); notes = notes.slice(0, 30); renderBell();
      showToast(p.new.title + (p.new.body ? ' — ' + p.new.body : ''), p.new.kind === 'task_late' ? 'error' : 'info', 7000);
      if (String(p.new.kind).indexOf('task') === 0) loadTasks();
    }).subscribe();
    tkCh = sbClient.channel('p9-tasks-' + uid).on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => loadTasks()).subscribe();
  }

  /* ---------- المهام ---------- */
  async function loadTasks() {
    if (!sbClient || !uid) return;
    const r = await sbClient.from('tasks').select('*').order('created_at', { ascending: false }).limit(400);
    if (r.error) { tkMissing = missing(r.error); tasks = []; } else { tkMissing = false; tasks = r.data || []; }
    badge(); if (currentTab === 'tasks') renderTasks(); checkLate();
  }
  function badge() {
    const b = $('tk-badge'); if (!b) return;
    const open = tasks.filter(t => t.status === 'open' && (isMgr() || t.assignee_id === uid)), late = open.filter(isLate).length, n = isMgr() ? late : open.length;
    b.textContent = n > 99 ? '99+' : String(n); b.classList.toggle('hidden', !n);
    b.classList.toggle('bg-rose-600', late > 0); b.classList.toggle('bg-teal-600', late === 0);
  }
  async function checkLate() {
    for (const t of tasks) {
      if (!isLate(t) || t.late_notified || asked.has(t.id) || !(isMgr() || t.assignee_id === uid)) continue;
      asked.add(t.id);
      try { await sbClient.rpc('notify_task_overdue', { p_task: t.id }); } catch (e) { /* */ }
    }
  }
  function card(t) {
    const late = isLate(t), done = t.status === 'done', mine = t.assignee_id === uid;
    const cls = done ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20' : late ? 'border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900';
    const chip = done ? '<span class="rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 px-2.5 py-0.5 text-[11px] font-bold">تمت ' + eh(t.done_at ? fmt(t.done_at) : '') + '</span>' : late ? '<span class="rounded-full bg-rose-600 text-white px-2.5 py-0.5 text-[11px] font-bold">' + eh(rel(t)) + '</span>' : '<span class="rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 px-2.5 py-0.5 text-[11px] font-bold">' + eh(rel(t)) + '</span>';
    return '<div class="rounded-2xl border ' + cls + ' p-4 flex flex-wrap items-start gap-3"><div class="min-w-0 flex-1 space-y-1"><div class="flex flex-wrap items-center gap-2 text-xs text-slate-500">' + (isMgr() ? '<span class="font-bold text-ink dark:text-white">' + empCell(nameOf(t.assignee_id)) + '</span>' : '') + chip + '<span><i class="fa-regular fa-clock ms-1"></i><bdi>' + eh(fmt(t.due_at)) + '</bdi></span></div><div class="font-bold text-sm ' + (done ? 'line-through text-slate-400' : 'text-ink dark:text-white') + '">' + eh(t.title) + '</div>' + (t.details ? '<div class="text-xs text-slate-500 whitespace-pre-wrap">' + eh(t.details) + '</div>' : '') + '</div><div class="flex items-center gap-2">' +
      ((mine || isMgr()) ? '<button type="button" data-id="' + t.id + '" onclick="tkToggle(this.dataset.id)" class="rounded-xl px-3 py-1.5 text-xs font-bold ' + (done ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300' : 'bg-emerald-600 hover:bg-emerald-700 text-white') + '">' + (done ? 'إعادة فتح' : '<i class="fa-solid fa-check ms-1"></i>تم') + '</button>' : '') +
      (isMgr() ? '<button type="button" data-id="' + t.id + '" onclick="tkDelete(this.dataset.id)" class="rounded-xl p-2 text-slate-400 hover:text-rose-600" aria-label="حذف"><i class="fa-solid fa-trash-can"></i></button>' : '') + '</div></div>';
  }
  window.renderTasks = function () {
    const root = $('tab-tasks'); if (!root) return;
    if (tkMissing) { root.innerHTML = '<div class="card p-8 text-center text-sm text-slate-500">شغّل ملف <b class="font-mono">phase6-tasks-notifications.sql</b> في Supabase علشان المهام تشتغل.</div>'; return; }
    const mgr = isMgr(), team = profiles.filter(p => p.id && p.id !== uid);
    let h = '';
    if (mgr) h += '<form onsubmit="tkCreate(event)" class="card p-5 sm:p-6 space-y-4"><div class="flex items-center gap-3"><span class="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-600 text-white"><i class="fa-solid fa-list-check"></i></span><div><h3 class="font-bold text-ink dark:text-white text-base">إسناد مهمة</h3><p class="text-xs text-slate-500">الموظف بيوصله إشعار فوري</p></div></div><div class="grid gap-3 sm:grid-cols-2"><div><label class="label" for="tk-who">الموظف</label><select id="tk-who" class="field"><option value="all">كل الفريق</option>' + team.map(p => '<option value="' + p.id + '">' + eh(p.full_name) + '</option>').join('') + '<option value="' + uid + '">أنا</option></select></div><div><label class="label" for="tk-due">الموعد النهائي</label><input id="tk-due" type="datetime-local" required class="field" value="' + localInput(defaultDue()) + '"></div></div><div><label class="label" for="tk-title">المهمة</label><input id="tk-title" required maxlength="200" class="field" placeholder="مثال: متابعة معاملات امبارح المتأخرة"></div><div><label class="label" for="tk-det">تفاصيل (اختياري)</label><textarea id="tk-det" rows="2" class="field"></textarea></div><button id="tk-go" type="submit" class="rounded-xl bg-teal-600 hover:bg-teal-700 px-5 py-2.5 text-sm font-bold text-white"><i class="fa-solid fa-paper-plane ms-1"></i>إسناد</button></form>';
    const lateN = tasks.filter(isLate).length, openN = tasks.filter(t => t.status === 'open').length, doneN = tasks.filter(t => t.status === 'done').length;
    const tabs = [['open', 'مفتوحة', openN], ['late', 'متأخرة', lateN], ['done', 'منتهية', doneN], ['all', 'الكل', tasks.length]];
    h += '<div class="flex flex-wrap gap-2">' + tabs.map(x => '<button type="button" data-f="' + x[0] + '" onclick="tkFilter(this.dataset.f)" class="rounded-full px-3.5 py-1.5 text-xs font-bold ' + (filt === x[0] ? 'bg-ink text-white dark:bg-brand-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300') + '">' + x[1] + ' <span class="font-mono">' + x[2] + '</span></button>').join('') + '</div>';
    let list = tasks.filter(t => filt === 'all' || (filt === 'open' && t.status === 'open') || (filt === 'done' && t.status === 'done') || (filt === 'late' && isLate(t)));
    list.sort((a, b) => (a.status === 'done') - (b.status === 'done') || new Date(a.due_at) - new Date(b.due_at));
    h += '<div class="space-y-3">' + (list.map(card).join('') || '<div class="card p-8 text-center text-sm text-slate-400">' + (mgr ? 'لا توجد مهام هنا' : 'لا توجد مهام عليك دلوقتي') + '</div>') + '</div>';
    const keep = { who: $('tk-who') && $('tk-who').value, due: $('tk-due') && $('tk-due').value, title: $('tk-title') && $('tk-title').value, det: $('tk-det') && $('tk-det').value };
    root.innerHTML = h;
    if (keep.title !== null && $('tk-title')) { if (keep.who) $('tk-who').value = keep.who; if (keep.due) $('tk-due').value = keep.due; $('tk-title').value = keep.title || ''; $('tk-det').value = keep.det || ''; }
  };
  window.tkFilter = f => { filt = f; renderTasks(); };
  window.tkCreate = async function (e) {
    e.preventDefault(); if (!isMgr()) return;
    const who = $('tk-who').value, due = new Date($('tk-due').value), title = $('tk-title').value.trim(), det = $('tk-det').value.trim() || null, btn = $('tk-go');
    if (!title || isNaN(due)) return;
    const ids = who === 'all' ? profiles.filter(p => p.id && p.id !== uid).map(p => p.id) : [who];
    if (!ids.length) return showToast('مفيش موظفين مسجلين لسه', 'error');
    btn.disabled = true;
    const r = await sbClient.from('tasks').insert(ids.map(id => ({ title: title, details: det, assignee_id: id, due_at: due.toISOString(), created_by: uid })));
    btn.disabled = false;
    if (r.error) return showError('تعذّر إسناد المهمة', r.error);
    showToast('تم إسناد المهمة لـ ' + (ids.length > 1 ? ids.length + ' موظف' : nameOf(ids[0])));
    $('tk-title').value = ''; $('tk-det').value = ''; loadTasks();
  };
  window.tkToggle = async function (id) {
    const t = tasks.find(x => x.id === id); if (!t) return;
    const st = t.status === 'done' ? 'open' : 'done';
    const r = await sbClient.from('tasks').update({ status: st }).eq('id', id);
    if (r.error) return showError('تعذّر تحديث المهمة', r.error);
    loadTasks();
  };
  window.tkDelete = async function (id) {
    if (!isMgr() || !confirm('حذف المهمة دي؟')) return;
    const r = await sbClient.from('tasks').delete().eq('id', id);
    if (r.error) return showError('تعذّر الحذف', r.error);
    loadTasks();
  };

  /* ---------- تشغيل / إيقاف ---------- */
  async function init() {
    if (!sbClient || !currentUser || uid === currentUser.id) return;
    uid = currentUser.id; asked.clear();
    await Promise.all([loadNotes(), loadTasks()]); subscribe();
    clearInterval(tick);
    tick = setInterval(() => { badge(); if (currentTab === 'tasks' && !(document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))) renderTasks(); checkLate(); }, 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { loadNotes(); loadTasks(); } });
  }
  function stop() {
    clearInterval(tick); tick = null;
    try { if (ntCh) sbClient.removeChannel(ntCh); if (tkCh) sbClient.removeChannel(tkCh); } catch (e) { /* */ }
    ntCh = tkCh = null; uid = null; tasks = []; notes = []; renderBell(); badge();
  }
  const bell = $('nt-bell');
  if (bell) {
    bell.addEventListener('click', e => { e.stopPropagation(); $('nt-panel').classList.toggle('hidden'); renderBell(); });
    document.addEventListener('click', e => { const p = $('nt-panel'); if (p && !p.classList.contains('hidden') && !p.contains(e.target)) p.classList.add('hidden'); });
  }
  const _li = window.loadInitialData;
  window.loadInitialData = async function () { const x = await _li.apply(this, arguments); init(); return x; };
  const _lp = window.loadProfiles;
  window.loadProfiles = async function () { const x = await _lp.apply(this, arguments); if (currentTab === 'tasks') renderTasks(); return x; };
  const _lo = window.handleLogout;
  window.handleLogout = function () { stop(); return _lo.apply(this, arguments); };
  renderBell();
})();
