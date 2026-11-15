/* ===== المرحلة 17: فلتر تاريخ + ألوان الحالات + جرس إشعارات موحّد ===== */
(function () {
  if (window.__phase17) return; window.__phase17 = true;
  const eh = escapeHtml, PAGE = 20;
  const ymd = d => d.toLocaleDateString('en-CA');
  const miss = e => /42P01|PGRST205|does not exist|schema cache/i.test(((e && e.message) || '') + ' ' + ((e && e.code) || ''));

  /* =====================================================
     (أ) فلتر التاريخ + عرض المزيد في "آخر المعاملات"
     ===================================================== */
  let from = '', to = '', limit = PAGE, lastTotal = 0, lastSum = 0;
  window.__recentLimit = () => limit;
  window.__recentFilter = function (list) {
    if (from || to) {
      list = list.filter(o => { const k = dayKey(o.received_at || o.created_at); return (!from || k >= from) && (!to || k <= to); });
    }
    lastTotal = list.length;
    lastSum = list.reduce((s, o) => s + (Number(o.grand_total) || 0), 0);
    return list;
  };
  function rangeOf(r) {
    const n = new Date(), t = ymd(n);
    if (r === 'today') return [t, t];
    if (r === 'yday') { const y = ymd(new Date(Date.now() - 864e5)); return [y, y]; }
    if (r === 'w7') return [ymd(new Date(Date.now() - 6 * 864e5)), t];
    if (r === 'month') return [ymd(new Date(n.getFullYear(), n.getMonth(), 1)), t];
    return ['', ''];
  }
  const CH_ON = 'bg-ink text-white dark:bg-brand-600', CH_OFF = 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300';
  function ensureBar() {
    if ($('f17-bar')) return;
    const q = $('recent-q'); if (!q) return;
    const card = q.closest('.card'); if (!card || !card.firstElementChild) return;
    card.firstElementChild.insertAdjacentHTML('afterend',
      '<div id="f17-bar" class="flex flex-wrap items-center gap-2 border-b border-slate-100 dark:border-slate-800 px-5 py-3 text-xs">' +
      '<span class="font-semibold text-slate-500"><i class="fa-regular fa-calendar ms-1"></i>الفترة:</span>' +
      '<label class="flex items-center gap-1.5 text-slate-500">من<input id="f17-from" type="date" class="field !w-auto !py-1.5 text-xs"></label>' +
      '<label class="flex items-center gap-1.5 text-slate-500">إلى<input id="f17-to" type="date" class="field !w-auto !py-1.5 text-xs"></label>' +
      ['today:اليوم', 'yday:أمس', 'w7:آخر 7 أيام', 'month:الشهر ده'].map(x => { const a = x.split(':'); return '<button type="button" data-r="' + a[0] + '" class="f17-chip rounded-full px-3 py-1.5 font-bold">' + a[1] + '</button>'; }).join('') +
      '<button type="button" data-r="clear" class="rounded-full px-3 py-1.5 font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"><i class="fa-solid fa-xmark ms-1"></i>مسح</button>' +
      '<span id="f17-sum" class="ms-auto hidden font-bold text-brand-700 dark:text-brand-300"></span></div>');
    const cards = $('recent-cards-container');
    if (cards) cards.insertAdjacentHTML('afterend', '<div id="f17-more" class="hidden border-t border-slate-100 dark:border-slate-800 p-3 text-center"><button type="button" id="f17-more-btn" class="rounded-xl bg-slate-100 dark:bg-slate-800 px-5 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"></button></div>');
    $('f17-from').addEventListener('change', e => { from = e.target.value; limit = PAGE; window.renderRecentRequests(); });
    $('f17-to').addEventListener('change', e => { to = e.target.value; limit = PAGE; window.renderRecentRequests(); });
    $('f17-bar').addEventListener('click', e => {
      const b = e.target.closest('[data-r]'); if (!b) return;
      const r = rangeOf(b.dataset.r); from = r[0]; to = r[1]; limit = PAGE; window.renderRecentRequests();
    });
    const mb = $('f17-more-btn'); if (mb) mb.addEventListener('click', () => { limit += PAGE; window.renderRecentRequests(); });
  }
  function paintBar() {
    ensureBar();
    const f = $('f17-from'), t = $('f17-to'); if (!f || !t) return;
    f.value = from; t.value = to;
    document.querySelectorAll('#f17-bar .f17-chip').forEach(b => {
      const r = rangeOf(b.dataset.r), on = (from || to) && r[0] === from && r[1] === to;
      b.className = 'f17-chip rounded-full px-3 py-1.5 font-bold ' + (on ? CH_ON : CH_OFF);
    });
    const s = $('f17-sum'), active = !!(from || to);
    if (s) { s.classList.toggle('hidden', !active); s.textContent = active ? (lastTotal + ' معاملة · إجمالي الفترة ' + formatCurrency(lastSum)) : ''; }
    const m = $('f17-more'), mb = $('f17-more-btn');
    if (m && mb) {
      const left = lastTotal - limit;
      m.classList.toggle('hidden', left <= 0);
      if (left > 0) mb.textContent = 'عرض ' + Math.min(PAGE, left) + ' كمان (متبقي ' + left + ')';
    }
  }

  /* =====================================================
     (ب) ألوان الحالات (هادية + توهّج نيون خفيف)
     ===================================================== */
  const RANK = { 'Under Review': 0, 'In Progress': 1, 'Complete': 2, 'Delivered': 3 };
  function ordSt(o) {
    let best = 'In Progress', r = 9;
    o.lines.forEach(l => { const s = l.status || 'In Progress', k = RANK[s]; if (k != null && k < r) { r = k; best = s; } });
    return r === 9 ? 'In Progress' : best;
  }
  if (typeof window.badge === 'function') {
    window.badge = function (s) { return '<span class="st17-b" data-s="' + eh(s || 'In Progress') + '">' + eh(statusLabel(s)) + '</span>'; };
  }
  const prevSig = new Map();
  function decorateStatus() {
    const by = new Map(); groupedOrders.forEach(o => by.set(String(o.transaction_id), ordSt(o)));
    const els = [];
    document.querySelectorAll('#recent-table-body tr').forEach(tr => { const b = tr.querySelector('[data-tx]'); if (b) els.push([tr, String(b.dataset.tx)]); });
    document.querySelectorAll('#recent-cards-container > [data-tx]').forEach(el => els.push([el, String(el.dataset.tx)]));
    els.forEach(x => {
      const st = by.get(x[1]); if (!st) return;
      x[0].setAttribute('data-st17', st);
      if (prevSig.has(x[1]) && prevSig.get(x[1]) !== st) x[0].classList.add('st17-flash');
    });
    by.forEach((v, k) => prevSig.set(k, v));
  }
  const _rr = window.renderRecentRequests;
  window.renderRecentRequests = function () {
    const x = _rr.apply(this, arguments);
    try { decorateStatus(); } catch (e) { console.warn('p17 st', e); }
    try { paintBar(); } catch (e) { console.warn('p17 bar', e); }
    return x;
  };
  function syncSel() { document.querySelectorAll('#tx-modal-body .st-sel').forEach(s => { s.dataset.s = s.value; }); }
  const _mk = window.markTxDirty;
  if (typeof _mk === 'function') window.markTxDirty = function () { const r = _mk.apply(this, arguments); try { syncSel(); } catch (e) { /* */ } return r; };
  const _ot = window.openTxModal;
  if (typeof _ot === 'function') window.openTxModal = function () { const r = _ot.apply(this, arguments); try { syncSel(); } catch (e) { /* */ } return r; };

  /* =====================================================
     (ج) جرس الإشعارات الموحّد: شات + مهام + تعليقات المعاملات
     ===================================================== */
  let uid = null, notes = [], cmts = [], seen = new Set(), flt = 'all', nCh = null, cCh = null, vis = null;
  const SK = () => 'p17-seen-' + uid;
  function loadSeen() {
    try { const j = JSON.parse(localStorage.getItem(SK()) || 'null'); if (j && Array.isArray(j.ids)) { seen = new Set(j.ids); return true; } } catch (e) { /* */ }
    seen = new Set(); return false;
  }
  function saveSeen() { try { localStorage.setItem(SK(), JSON.stringify({ ids: Array.from(seen).slice(-300) })); } catch (e) { /* */ } }
  const fmtT = s => { try { return new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(s)); } catch (e) { return ''; } };
  const short = (s, n) => String(s || '').replace(/\s+/g, ' ').slice(0, n);

  function items() {
    const out = [];
    try {
      chatItems.filter(i => i.unread > 0).forEach(it => out.push({
        k: 'chat', id: it.ch_id, t: it.last_at || new Date().toISOString(), unread: true, n: it.unread,
        title: chatName(it), body: (it.ch_kind === 'general' && it.last_sender ? nameOfUser(it.last_sender) + ': ' : '') + short(it.last_body, 80)
      }));
    } catch (e) { /* */ }
    notes.forEach(x => out.push({ k: 'task', id: x.id, t: x.created_at, unread: !x.read, title: x.title, body: x.body || '', kind: x.kind }));
    cmts.forEach(c => out.push({ k: 'cmt', id: c.id, t: c.created_at, unread: !seen.has(String(c.id)), title: 'تعليق من ' + (c.author_name || 'موظف'), body: c.transaction_id + ' — ' + short(c.body, 80), tx: c.transaction_id }));
    return out.sort((a, b) => new Date(b.t) - new Date(a.t));
  }
  const ICON = { chat: ['fa-comments', 'ub-c-chat'], task: ['fa-list-check', 'ub-c-task'], cmt: ['fa-comment-dots', 'ub-c-cmt'] };
  const FLT = [['all', 'الكل'], ['chat', 'الشات'], ['task', 'المهام'], ['cmt', 'التعليقات']];

  function renderUB() {
    const c = $('ub-count'), p = $('ub-panel'), b = $('ub-bell'); if (!c || !p || !b) return;
    const all = items(), un = all.filter(x => x.unread);
    const total = un.reduce((s, x) => s + (x.k === 'chat' ? x.n : 1), 0);
    c.textContent = total > 99 ? '99+' : String(total); c.classList.toggle('hidden', !total); b.classList.toggle('ub-has', total > 0);
    if (p.classList.contains('hidden')) return;
    const cnt = k => un.filter(x => k === 'all' || x.k === k).reduce((s, x) => s + (x.k === 'chat' ? x.n : 1), 0);
    const list = all.filter(x => flt === 'all' || x.k === flt).slice(0, 40);
    const rows = list.map(x => {
      const ic = ICON[x.k], late = x.k === 'task' && x.kind === 'task_late';
      return '<button type="button" data-k="' + x.k + '" data-id="' + eh(x.id) + '" class="ub-item flex w-full items-start gap-2.5 border-b border-slate-100 dark:border-slate-800 px-3 py-2.5 text-start hover:bg-slate-50 dark:hover:bg-slate-800/60 ' + (x.unread ? '' : 'opacity-55') + '">' +
        '<span class="ub-ic ' + (late ? 'ub-c-late' : ic[1]) + '"><i class="fa-solid ' + ic[0] + '"></i></span>' +
        '<span class="min-w-0 flex-1"><span class="flex items-center gap-1.5"><span class="truncate text-xs font-bold text-ink dark:text-white">' + eh(x.title) + '</span>' +
        (x.unread ? (x.k === 'chat' ? '<span class="ub-n">' + (x.n > 99 ? '99+' : x.n) + '</span>' : '<span class="ub-dot"></span>') : '') + '</span>' +
        (x.body ? '<span class="block truncate text-[11px] text-slate-500">' + eh(x.body) + '</span>' : '') +
        '<span class="mt-0.5 block text-[10px] text-slate-400"><bdi>' + eh(fmtT(x.t)) + '</bdi></span></span></button>';
    }).join('');
    p.innerHTML = '<div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-3 py-2.5"><b class="text-sm text-ink dark:text-white">الإشعارات</b><button type="button" data-all="1" class="text-[11px] font-semibold text-brand-600 hover:underline">تعليم الكل كمقروء</button></div>' +
      '<div class="flex gap-1.5 overflow-x-auto border-b border-slate-100 dark:border-slate-800 px-3 py-2">' + FLT.map(f => '<button type="button" data-f="' + f[0] + '" class="shrink-0 rounded-full px-3 py-1 text-[11px] font-bold ' + (flt === f[0] ? CH_ON : CH_OFF) + '">' + f[1] + (cnt(f[0]) ? ' <span class="font-mono">' + cnt(f[0]) + '</span>' : '') + '</button>').join('') + '</div>' +
      '<div class="max-h-96 overflow-y-auto">' + (rows || '<div class="p-8 text-center text-xs text-slate-400">لا توجد إشعارات</div>') + '</div>';
  }
  function closePanel() { const p = $('ub-panel'); if (p) p.classList.add('hidden'); }

  async function openItem(k, id) {
    closePanel();
    if (k === 'chat') {
      switchTab('chat');
      setTimeout(() => { try { if (chatItem(id)) openChat(id); } catch (e) { /* */ } }, 80);
    } else if (k === 'task') {
      const x = notes.find(n => String(n.id) === String(id));
      if (x && !x.read) { x.read = true; renderUB(); try { await sbClient.from('notifications').update({ read: true }).eq('id', x.id); } catch (e) { /* */ } }
      if (x && String(x.kind).indexOf('task') === 0) {
        switchTab('tasks');
      } else if (x && String(x.title || '').startsWith('ملاحظة من المندوب ')) {
        const match = String(x.title).match(/\\sعلى\\s+(.+)$/);
        const tx = match && match[1] ? match[1].trim() : '';
        if (tx && typeof window.openTxInTransactionsTab === 'function') {
          window.openTxInTransactionsTab(tx);
        } else if (tx) {
          showToast('تمت قراءة الإشعار، لكن تعذّر فتح المعاملة تلقائيًا', 'info', 5000);
        }
      }
    } else if (k === 'cmt') {
      const c = cmts.find(n => String(n.id) === String(id)); if (!c) return;
      seen.add(String(c.id)); saveSeen(); renderUB();
      if (groupedOrders.some(o => String(o.transaction_id) === String(c.transaction_id))) openTxModal(c.transaction_id);
      else showToast('المعاملة دي أقدم من البيانات المحمّلة حالياً', 'info', 4000);
    }
  }
  async function markAll() {
    const want = k => flt === 'all' || flt === k;
    if (want('task')) { notes.forEach(n => { n.read = true; }); try { await sbClient.from('notifications').update({ read: true }).eq('user_id', uid).eq('read', false); } catch (e) { /* */ } }
    if (want('cmt')) { cmts.forEach(c => seen.add(String(c.id))); saveSeen(); }
    if (want('chat')) {
      try {
        const unread = chatItems.filter(i => i.unread > 0);
        unread.forEach(i => { i.unread = 0; });
        updateChatBadges();
        for (const i of unread) { try { await sbClient.rpc('mark_channel_read', { cid: i.ch_id }); } catch (e) { /* */ } }
      } catch (e) { /* */ }
    }
    renderUB();
  }

  async function loadNotes() {
    const r = await sbClient.from('notifications').select('*').order('created_at', { ascending: false }).limit(30);
    if (r.error) { if (!miss(r.error)) console.warn('p17 notes', r.error); return; }
    notes = r.data || [];
  }
  async function loadCmts() {
    const since = new Date(Date.now() - 7 * 864e5).toISOString();
    const r = await sbClient.from('tx_comments').select('id,transaction_id,author_id,author_name,body,created_at')
      .neq('author_id', uid).gte('created_at', since).order('created_at', { ascending: false }).limit(30);
    if (r.error) { if (!miss(r.error)) console.warn('p17 comments', r.error); return; }
    cmts = r.data || [];
  }
  function subscribe() {
    try { if (nCh) sbClient.removeChannel(nCh); if (cCh) sbClient.removeChannel(cCh); } catch (e) { /* */ }
    nCh = sbClient.channel('p17-notes-' + uid).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + uid }, p => {
      if (!p.new || notes.some(n => n.id === p.new.id)) return;
      notes.unshift(p.new); notes = notes.slice(0, 30); renderUB();
    }).subscribe();
    cCh = sbClient.channel('p17-cmt-' + uid).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tx_comments' }, p => {
      const c = p.new; if (!c || c.author_id === uid || cmts.some(x => x.id === c.id)) return;
      cmts.unshift(c); cmts = cmts.slice(0, 30); renderUB();
      showToast('💬 تعليق جديد من ' + (c.author_name || 'موظف') + ' على ' + c.transaction_id, 'info', 5000);
    }).subscribe();
  }
  function mountBell() {
    if ($('ub-wrap')) return;
    const old = $('nt-bell') && $('nt-bell').parentElement; if (!old) return;
    old.insertAdjacentHTML('beforebegin',
      '<div id="ub-wrap" class="relative"><button id="ub-bell" type="button" class="relative rounded-xl p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800" title="الإشعارات" aria-label="الإشعارات"><i class="fa-solid fa-bell text-sm"></i>' +
      '<span id="ub-count" class="hidden absolute -top-1 -right-1 rounded-full bg-rose-600 px-1 text-center text-[10px] font-bold leading-4 text-white min-w-[16px]">0</span></button>' +
      '<div id="ub-panel" class="hidden absolute left-0 top-10 z-50 w-[min(94vw,380px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"></div></div>');
    old.classList.add('hidden');
    $('ub-bell').addEventListener('click', e => {
      e.stopPropagation();
      // إغلاق قائمة الثلاث شرط عند فتح الإشعارات
      if (typeof window.closeNavMenu === 'function') window.closeNavMenu();
      else {
        const nm = document.getElementById('nav-menu'); if (nm) nm.classList.add('hidden');
        const mb = document.getElementById('menu-btn'); if (mb) mb.setAttribute('aria-expanded', 'false');
      }
      $('ub-panel').classList.toggle('hidden');
      renderUB();
    });
    $('ub-panel').addEventListener('click', e => {
      e.stopPropagation();
      const f = e.target.closest('[data-f]'); if (f) { flt = f.dataset.f; return renderUB(); }
      if (e.target.closest('[data-all]')) return markAll();
      const it = e.target.closest('.ub-item'); if (it) openItem(it.dataset.k, it.dataset.id);
    });
    document.addEventListener('click', e => { const p = $('ub-panel'); if (p && !p.classList.contains('hidden') && !e.target.closest('#ub-wrap')) p.classList.add('hidden'); });
  }
  async function initUB() {
    if (!sbClient || !currentUser || uid === currentUser.id) return;
    if (window.__role === 'partner') return;
    uid = currentUser.id; mountBell();
    const had = loadSeen();
    await Promise.all([loadNotes(), loadCmts()]);
    if (!had) { cmts.forEach(c => seen.add(String(c.id))); saveSeen(); }
    subscribe(); renderUB();
    if (vis) document.removeEventListener('visibilitychange', vis);
    vis = () => { if (!document.hidden && uid) Promise.all([loadNotes(), loadCmts()]).then(renderUB); };
    document.addEventListener('visibilitychange', vis);
  }
  function stopUB() {
    try { if (nCh && sbClient) sbClient.removeChannel(nCh); if (cCh && sbClient) sbClient.removeChannel(cCh); } catch (e) { /* */ }
    nCh = cCh = null; uid = null; notes = []; cmts = []; seen = new Set();
    if (vis) { document.removeEventListener('visibilitychange', vis); vis = null; }
    const w = $('ub-wrap'); if (w) w.remove();
    const o = $('nt-bell') && $('nt-bell').parentElement; if (o) o.classList.remove('hidden');
  }

  const _ucb = window.updateChatBadges;
  if (typeof _ucb === 'function') window.updateChatBadges = function () { const r = _ucb.apply(this, arguments); try { renderUB(); } catch (e) { /* */ } return r; };
  const _li = window.loadInitialData;
  window.loadInitialData = async function () {
    const x = await _li.apply(this, arguments);
    try { await initUB(); } catch (e) { console.warn('p17 init', e); }
    try { window.renderRecentRequests(); } catch (e) { /* */ }
    return x;
  };
  const _lo = window.handleLogout;
  window.handleLogout = function () { try { stopUB(); } catch (e) { /* */ } return _lo.apply(this, arguments); };
})();
