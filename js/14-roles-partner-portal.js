
/* ===== المرحلة 8: الأدوار والصلاحيات + بوابة المنفذ الخارجي ===== */
(function () {
  if (window.__phase8) return; window.__phase8 = true;
  const eh = escapeHtml, DOCS = ['فاتورة', 'إيصال', 'عقد', 'إشعار', 'أخرى'];
  const miss = e => /42P01|42883|PGRST20[25]|does not exist|schema cache|Could not find/i.test(((e && e.message) || '') + ' ' + ((e && e.code) || ''));
  const day = () => new Date().toLocaleDateString('en-CA'), tot = o => Number(o.qty) * Number(o.price), sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
  const mr = m => { const a = new Date(m + '-01T00:00:00'); return [m + '-01', new Date(a.getFullYear(), a.getMonth() + 1, 1).toLocaleDateString('en-CA')]; };
  const chip = s => s ? '<span class="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">مُسوّى</span>' : '<span class="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">غير مُسوّى</span>';
  const kpi = (t, v, c) => '<div class="card p-4"><div class="text-[11px] text-slate-500">' + t + '</div><div class="mt-1 font-mono text-lg font-bold ' + (c || 'text-ink dark:text-white') + '">' + v + '</div></div>';
  const hint = '<div class="card p-4 text-center text-xs text-slate-500">لازم تشغّل ملف <b class="font-mono">phase8-roles-partner.sql</b> في Supabase الأول.</div>';
  const st = {};

  /* ---------- عرض العمليات (مشترك: المنفذ + المدير) ---------- */
  async function opsView(box, pid, mgr) {
    const s = st[box.id] = st[box.id] || { m: day().slice(0, 7) }; s.pid = pid; s.mgr = mgr; s.reload = () => opsView(box, pid, mgr);
    const r = mr(s.m);
    const q = await Promise.all([
      sbClient.from('partner_ops').select('*').eq('partner_id', pid).gte('op_date', r[0]).lt('op_date', r[1]).order('op_date', { ascending: false }).order('id', { ascending: false }).limit(2000),
      sbClient.from('partner_ops').select('qty,price').eq('partner_id', pid).eq('settled', false).limit(10000)]);
    if (q[0].error) { box.innerHTML = miss(q[0].error) ? hint : '<div class="card p-4 text-center text-xs text-slate-500">تعذّر تحميل البيانات</div>'; return; }
    const rows = s.rows = q[0].data || [], un = sum(q[1].data || [], tot), pend = rows.filter(x => !x.settled), done = rows.filter(x => x.settled), B = JSON.stringify(box.id);
    const banner = un === 0 ? '<div class="flex items-center gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"><i class="fa-solid fa-circle-check text-2xl"></i><div class="font-bold">كل الحسابات مُسوّاة</div></div>'
      : '<div class="flex items-center gap-3 rounded-2xl bg-amber-50 p-4 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"><i class="fa-solid fa-hourglass-half text-2xl"></i><div><div class="font-bold">غير مُسوّى</div><div class="font-mono text-lg font-bold">' + formatCurrency(un) + '</div></div></div>';
    const form = '<form onsubmit=\'p8.add(event,' + B + ')\' class="card grid gap-3 p-4 sm:grid-cols-6"><div class="sm:col-span-6 text-sm font-bold text-ink dark:text-white"><i class="fa-solid fa-plus ms-1.5 text-brand-500"></i>تسجيل عملية جديدة</div>' +
      '<div><label class="label">التاريخ</label><input name="d" type="date" required value="' + day() + '" class="field font-mono text-xs"></div>' +
      '<div class="sm:col-span-2"><label class="label">الخدمة</label><input name="s" list="p8-svc" required class="field"><datalist id="p8-svc">' + [...new Set(rows.map(x => x.service))].map(x => '<option value="' + eh(x) + '"></option>').join('') + '</datalist></div>' +
      '<div><label class="label">العدد</label><input name="q" type="number" min="1" step="any" value="1" required class="field text-center font-mono"></div>' +
      '<div><label class="label">السعر</label><input name="p" type="number" min="0" step="any" required class="field text-center font-mono"></div>' +
      '<div><label class="label">نوع المستند *</label><select name="t" required onchange="this.form.o.classList.toggle(\'hidden\',this.value!==\'أخرى\');this.form.o.required=this.value===\'أخرى\'" class="field"><option value="">اختر...</option>' + DOCS.map(x => '<option>' + x + '</option>').join('') + '</select></div>' +
      '<div class="sm:col-span-3"><input name="o" placeholder="اكتب نوع المستند" class="field hidden"></div><div class="sm:col-span-3"><label class="label">ملاحظة (اختياري)</label><input name="n" class="field"></div>' +
      '<button class="sm:col-span-6 rounded-xl bg-brand-500 py-3 text-sm font-bold text-slate-950 hover:bg-brand-600">تسجيل العملية</button></form>';
    const act = o => mgr ? '<button type="button" onclick=\'p8.settle(' + B + ',[' + o.id + '],' + !o.settled + ')\' class="rounded-lg px-2 py-1 text-[11px] font-bold ' + (o.settled ? 'bg-slate-100 text-slate-500 dark:bg-slate-800' : 'bg-emerald-600 text-white') + '">' + (o.settled ? 'إلغاء التسوية' : 'تسوية') + '</button>' : '';
    const del = o => !o.settled ? '<button type="button" onclick=\'p8.del(' + B + ',' + o.id + ')\' class="px-2 text-rose-500" title="حذف"><i class="fa-solid fa-trash-can"></i></button>' : '<i class="fa-solid fa-lock px-2 text-slate-300"></i>';
    box.innerHTML = banner + '<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">' + kpi('عدد العمليات', rows.length) + kpi('إجمالي الشهر', formatCurrency(sum(rows, tot))) + kpi('المُسوّى', formatCurrency(sum(done, tot)), 'text-emerald-600') + kpi('غير المُسوّى', formatCurrency(sum(pend, tot)), 'text-amber-600') + '</div>' + form +
      '<div class="card overflow-hidden"><div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800"><input type="month" value="' + s.m + '" onchange=\'p8.month(' + B + ',this.value)\' class="field !w-44 !py-2 font-mono text-xs"><div class="flex gap-2">' +
      (mgr && pend.length ? '<button type="button" onclick=\'p8.settle(' + B + ',[' + pend.map(x => x.id) + '],true)\' class="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">تسوية كل الظاهر (' + pend.length + ')</button>' : '') +
      '<button type="button" onclick=\'p8.csv(' + B + ')\' class="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold dark:bg-slate-800"><i class="fa-solid fa-file-excel ms-1"></i>تصدير Excel</button></div></div><div class="overflow-x-auto"><table class="w-full text-right text-xs"><thead class="bg-slate-50 text-slate-500 dark:bg-slate-800/60"><tr><th class="px-3 py-2.5">التاريخ</th><th>الخدمة</th><th>العدد × السعر</th><th>الإجمالي</th><th>المستند</th><th>الحالة</th><th></th></tr></thead><tbody class="divide-y divide-slate-100 dark:divide-slate-800">' +
      (rows.map(o => '<tr><td class="px-3 py-2.5 font-mono">' + eh(formatDateOnly(o.op_date)) + '</td><td class="font-semibold text-ink dark:text-white">' + eh(o.service) + (o.note ? '<div class="font-normal text-slate-400">' + eh(o.note) + '</div>' : '') + '</td><td class="font-mono">' + fmtNum(o.qty) + ' × ' + fmtNum(o.price) + '</td><td class="font-mono font-bold">' + formatCurrency(tot(o)) + '</td><td>' + eh(o.doc_type) + '</td><td>' + chip(o.settled) + '</td><td class="whitespace-nowrap px-2">' + act(o) + (mgr ? '' : del(o)) + (mgr && !o.settled ? del(o) : '') + '</td></tr>').join('') || '<tr><td colspan="7" class="p-8 text-center text-slate-400">لا توجد عمليات في الشهر ده</td></tr>') + '</tbody></table></div></div>';
  }
  window.p8 = {
    month: (b, v) => { if (v) { st[b].m = v; st[b].reload(); } },
    add: async (e, b) => {
      e.preventDefault(); const s = st[b], f = e.target.elements, t = f.t.value === 'أخرى' ? 'أخرى: ' + f.o.value.trim() : f.t.value;
      if (!f.t.value || (f.t.value === 'أخرى' && !f.o.value.trim())) return showToast('نوع المستند إجباري', 'error');
      const r = await sbClient.from('partner_ops').insert({ partner_id: s.pid, op_date: f.d.value, service: f.s.value.trim(), qty: parseFloat(f.q.value), price: parseFloat(f.p.value), doc_type: t, note: f.n.value.trim() || null });
      if (r.error) return showError('تعذّر تسجيل العملية', r.error); showToast('تم تسجيل العملية'); s.reload();
    },
    del: async (b, id) => {
      if (!confirm('حذف العملية دي؟')) return;
      const r = await sbClient.from('partner_ops').delete().eq('id', id).select('id');
      if (r.error || !(r.data || []).length) return showToast('مينفعش الحذف (العملية اتسوّت)', 'error'); st[b].reload();
    },
    settle: async (b, ids, v) => {
      const r = await sbClient.from('partner_ops').update({ settled: v, settled_at: v ? new Date().toISOString() : null }).in('id', ids).select('id');
      if (r.error) return showError('تعذّرت التسوية', r.error); showToast(v ? 'تمت التسوية' : 'اتلغت التسوية'); st[b].reload();
    },
    csv: b => {
      const s = st[b], c = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
      const txt = '\ufeff' + ['التاريخ', 'الخدمة', 'العدد', 'السعر', 'الإجمالي', 'نوع المستند', 'الحالة', 'ملاحظة'].map(c).join(',') + '\n' + (s.rows || []).map(o => [o.op_date, o.service, o.qty, o.price, tot(o), o.doc_type, o.settled ? 'مُسوّى' : 'غير مُسوّى', o.note].map(c).join(',')).join('\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' })); a.download = 'operations-' + s.m + '.csv'; a.click();
    }
  };

  /* ---------- واجهة المنفذ الخارجي (شاشة كاملة) ---------- */
  function overlay(inner) {
    $('app').classList.add('hidden'); $('login').classList.add('hidden');
    let o = $('partner-app'); if (!o) { o = document.createElement('div'); o.id = 'partner-app'; o.className = 'fixed inset-0 z-50 overflow-y-auto bg-slate-50 dark:bg-slate-950'; document.body.appendChild(o); }
    o.classList.remove('hidden'); o.innerHTML = inner; return o;
  }
  const logout = '<button type="button" onclick="handleLogout()" class="rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white"><i class="fa-solid fa-right-from-bracket ms-1"></i>خروج</button>';
  function showPartner(name, uid) {
    overlay('<header class="bg-[#0b1b33]"><div class="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-4"><div class="flex items-center gap-3"><span class="rounded-xl bg-white px-2 py-1.5">' + logoImg(30) + '</span><div><div class="text-[11px] text-emerald-300">بوابة المنفذ</div><div class="text-base font-bold text-white">' + eh(name || 'منفذ') + '</div></div></div>' + logout + '</div></header><main id="p8-main" class="mx-auto max-w-4xl space-y-4 px-4 py-5"></main>');
    opsView($('p8-main'), uid, false);
  }
  const _sl = window.showLoginScreen;
  window.showLoginScreen = function () { const o = $('partner-app'); if (o) o.classList.add('hidden'); return _sl.apply(this, arguments); };

  /* ---------- بوابة الدور عند الدخول ---------- */
  const _li = window.loadInitialData;
  window.loadInitialData = async function () {
    let role = null, err = null;
    try { const r = await sbClient.rpc('my_role'); err = r.error; role = r.data; } catch (e) { err = e; }
    window.__role = role;
    if (!err && role === 'partner') {
      const n = await sbClient.from('user_roles').select('partner_name').eq('user_id', currentUser.id).maybeSingle();
      return showPartner(n.data && n.data.partner_name, currentUser.id);
    }
    if (!err && !role) { overlay('<div class="mx-auto mt-24 max-w-sm space-y-4 p-6 text-center"><i class="fa-solid fa-lock text-4xl text-slate-400"></i><div class="font-bold text-ink dark:text-white">الحساب ده لسه متفعّلش</div><div class="text-xs text-slate-500">كلّم المدير يفعّل حسابك.</div><div class="inline-block rounded-xl bg-[#0b1b33] p-0.5">' + logout + '</div></div>'); return; }
    if (!err && role === 'manager') addPartnersTab();
    return _li.apply(this, arguments);
  };

  /* ---------- تاب المدير: المنفذون الخارجيون ---------- */
  function addPartnersTab() {
    const cb = $('tab-couriers-btn'), ct = $('tab-couriers'); if (!cb || !ct || $('tab-partners')) return;
    cb.insertAdjacentHTML('afterend', '<button id="tab-partners-btn" onclick="switchTab(\'partners\')" class="tab-btn"><i class="fa-solid fa-handshake"></i><span>المنفذون الخارجيون</span></button>');
    ct.insertAdjacentHTML('afterend', '<div id="tab-partners" class="hidden space-y-4"></div>');
  }
  const _st = window.switchTab;
  window.switchTab = function (id) {
    _st(id); const t = $('tab-partners'), b = $('tab-partners-btn'), on = id === 'partners'; if (!t || !b) return;
    t.classList.toggle('hidden', !on);
    b.className = 'tab-btn ' + (on ? 'bg-ink text-white dark:bg-brand-600 shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800');
    if (on) renderPartners();
  };
  let cur = null;
  async function renderPartners() {
    const root = $('tab-partners'); if (!root) return;
    const r = await sbClient.rpc('list_partners'); if (r.error) { root.innerHTML = hint; return; }
    const ps = r.data || []; if (!ps.some(p => p.user_id === cur)) cur = ps[0] ? ps[0].user_id : null;
    root.innerHTML = '<div class="card space-y-3 p-4"><div class="text-sm font-bold text-ink dark:text-white"><i class="fa-solid fa-user-plus ms-1.5"></i>إدارة الحسابات الخارجية</div><p class="text-[11px] text-slate-500">اعمل الحساب الأول من Supabase (Authentication ← Add user)، وبعدين اربطه هنا بالإيميل.</p><form onsubmit="p8.assign(event)" class="flex flex-wrap items-end gap-2"><input name="e" type="email" dir="ltr" required placeholder="إيميل الحساب" class="field !w-56 !py-2 text-xs"><input name="n" placeholder="اسم المنفذ" class="field !w-44 !py-2 text-xs"><select name="r" class="field !w-36 !py-2 text-xs"><option value="partner">منفذ خارجي</option><option value="staff">موظف داخلي</option></select><button class="rounded-lg bg-brand-500 px-4 py-2 text-xs font-bold text-slate-950">ربط</button></form></div>' +
      (ps.length ? '<div class="card flex flex-wrap items-center gap-2 p-3"><label class="text-xs font-semibold">المنفذ:</label><select onchange="p8.pick(this.value)" class="field !w-56 !py-2 text-xs">' + ps.map(p => '<option value="' + p.user_id + '"' + (p.user_id === cur ? ' selected' : '') + '>' + eh(p.partner_name || p.email) + '</option>').join('') + '</select><button type="button" onclick="p8.remove()" class="rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600 dark:bg-rose-950/40">إيقاف الحساب</button></div><div id="p8-mgr" class="space-y-4"></div>' : '<div class="card p-6 text-center text-xs text-slate-400">لا يوجد منفذون خارجيون لسه</div>');
    if (cur) opsView($('p8-mgr'), cur, true);
  }
  p8.pick = v => { cur = v; renderPartners(); };
  p8.assign = async e => {
    e.preventDefault(); const f = e.target.elements;
    const r = await sbClient.rpc('assign_role', { p_email: f.e.value.trim(), p_role: f.r.value, p_name: f.n.value.trim() || null });
    if (r.error) return showToast(/no such account/.test(r.error.message) ? 'مفيش حساب بالإيميل ده في Supabase' : 'تعذّر الربط: ' + r.error.message, 'error', 8000);
    showToast('تم الربط'); renderPartners();
  };
  p8.remove = async () => {
    if (!cur || !confirm('إيقاف الحساب ده؟ مش هيقدر يدخل تاني.')) return;
    const r = await sbClient.rpc('remove_role', { p_user: cur }); if (r.error) return showError('تعذّر الإيقاف', r.error); cur = null; renderPartners();
  };
})();

/* ===== قايمة التابات (التلات شرط) ===== */
(function () {
  const $m = () => document.getElementById('nav-menu'), $b = () => document.getElementById('menu-btn');
  const idle = 'relative rounded-xl p-2.5 transition text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800', act = 'relative rounded-xl p-2.5 transition bg-ink text-white dark:bg-brand-600 shadow-sm';
  function close() { const m = $m(); if (m && !m.classList.contains('hidden')) { m.classList.add('hidden'); $b().setAttribute('aria-expanded', 'false'); } }
  window.closeNavMenu = close;
  window.toggleNavMenu = function (e) {
    if (e) e.stopPropagation();
    const p1 = document.getElementById('ub-panel'); if (p1) p1.classList.add('hidden');
    const p2 = document.getElementById('nt-panel'); if (p2) p2.classList.add('hidden');
    const m = $m(); if (!m) return;
    const open = m.classList.toggle('hidden') === false;
    $b().setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  document.addEventListener('click', function (e) { if (!e.target.closest('#menu-wrap') || e.target.closest('#nav-menu .tab-btn')) close(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  window.switchTab = function (id) {
    const r = _st.apply(this, arguments);
    const b = $b(), tb = document.getElementById('tab-' + id + '-btn');
    if (b) b.className = (tb && tb.closest('#nav-menu')) ? act : idle;
    return r;
  };
  function dot() { const d = document.getElementById('menu-dot'); if (d) d.classList.toggle('hidden', !document.querySelector('#nav-menu #late-badge:not(.hidden), #nav-menu #tk-badge:not(.hidden)')); }
  setInterval(dot, 2000);
})();
