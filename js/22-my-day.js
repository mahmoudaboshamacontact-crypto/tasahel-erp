/* =====================================================================
   المرحلة 20 (محدّثة): شاشة "شغلي النهاردة والمتأخرات" (فيتشر 52)
   - عرض موحّد ومريح بصرياً (نفس كبسولات الخدمات والتليفون والمعاملة وألوان النيون والحالات)
   - فلتر سريع: الكل | المتأخرات فقط | المفتوحة فقط | معاملات اليوم
   - للمدير: إمكانية عرض متأخرات وشغل كل الفريق أو موظف محدد
   - بدون أي استعلامات إضافية ثقيلة على قاعدة البيانات (كل الحسابات من allRequestLines المحمّلة في الذاكرة)
   ===================================================================== */
(function () {
  if (window.__phase20md) return; window.__phase20md = true;
  const eh = escapeHtml, num = v => Number(v) || 0;
  const safe = (n, f) => function () { try { return f.apply(this, arguments); } catch (e) { console.warn('p20 ' + n, e); } };
  const wrap = (name, fn) => { const o = window[name]; if (typeof o === 'function') window[name] = fn(o); };
  const isPartner = () => window.__role === 'partner';
  const isMgr = () => { try { return typeof canEditTx === 'function' && !!canEditTx(); } catch (e) { return false; } };
  const me = () => (typeof myProfile !== 'undefined' ? myProfile : null);
  const profs = () => (typeof profiles !== 'undefined' && Array.isArray(profiles) ? profiles : []);
  const LIMIT = 40;
  const BTN_ON = 'tab-btn bg-ink text-white dark:bg-brand-600 shadow-sm';
  const BTN_OFF = 'tab-btn text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800';
  let who = '', viewFilter = 'all', rt = 0;
  const NOTICE = 'إعلان للفريق: السيستم بيقيس الشغل جوه السيستم بس: أول وآخر عملية في اليوم (بوقت الحفظ)، وعدد المعاملات والتعديلات، وسرعة الإنجاز، ولوحة الأداء بيشوفها المدير بس. مفيش أي مراقبة للشاشة أو الوش أو حركة الماوس.';

  const norm = s => { const t = String(s == null ? '' : s); return (typeof normName === 'function' ? String(normName(t)) : t).trim().toLowerCase().replace(/\s+/g, ' '); };
  const dnum = s => {
    if (!s) return NaN;
    const d = s instanceof Date ? s : new Date(String(s).length === 10 ? s + 'T00:00' : s);
    return isNaN(d) ? NaN : Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
  };

  /* ---------------- الشهر والتارجت ---------------- */
  const nextM = m => { const a = m.split('-').map(Number); return a[1] === 12 ? (a[0] + 1) + '-01' : a[0] + '-' + String(a[1] + 1).padStart(2, '0'); };
  const curMonth = () => new Date().toLocaleDateString('en-CA').slice(0, 7);
  const calcLineComm = l => {
    if (typeof window.lineComm === 'function') return window.lineComm(l);
    return (l.commission != null && Number.isFinite(Number(l.commission))) ? Number(l.commission) : (Number(l.commission_per_unit) || 0) * (Number(l.qty) || 0);
  };
  const meta = { closures: null, tgt: {}, svcTgt: {}, busy: false };
  function workingMonth() {
    const cl = (meta.closures || []).slice().sort();
    return cl.length ? nextM(cl[cl.length - 1]) : curMonth();
  }
  async function loadMeta(force) {
    if (meta.busy || typeof sbClient === 'undefined' || !sbClient) return;
    meta.busy = true;
    try {
      if (force || meta.closures === null) {
        const c = await sbClient.from('month_closures').select('month');
        meta.closures = c.error ? [] : (c.data || []).map(x => x.month);
      }
      const tp = targetProfile();
      if (tp && tp !== 'ALL') {
        const wm = workingMonth(), key = tp.id + '|' + wm;
        const t = await sbClient.from('emp_targets').select('*').eq('user_id', tp.id).eq('month', wm).maybeSingle();
        meta.tgt[key] = t.error ? null : (t.data ? num(t.data.target) : 0);
        let stVal = (!t.error && t.data && t.data.services_target != null) ? num(t.data.services_target) : 0;
        if (!stVal) {
          try {
            const loc = JSON.parse(localStorage.getItem('tasahel_svc_targets_' + wm) || '{}');
            if (loc[tp.id]) stVal = num(loc[tp.id]);
          } catch (e) {}
        }
        meta.svcTgt[key] = stVal;
      }
    } catch (e) { console.warn('p20 meta', e); if (meta.closures === null) meta.closures = []; }
    meta.busy = false;
    if (currentTab === 'myday') render();
  }
  const ringColor = pct => pct >= 100 ? '#059669' : pct >= 60 ? '#0d9488' : pct >= 30 ? '#d97706' : '#dc2626';

  /* ---------------- الحساب ---------------- */
  function targetProfile() {
    const mp = me();
    if (who === 'ALL' && isMgr()) return 'ALL';
    if (who && isMgr()) return profs().find(p => String(p.id) === who) || mp;
    return mp;
  }
  function mineFn(p) {
    if (p === 'ALL') return () => true;
    const nm = p && p.full_name ? norm(p.full_name) : '', cache = new Map();
    return l => {
      const e = l.employee || ''; if (!e) return false;
      let r = cache.get(e);
      if (r === undefined) {
        let q = null; try { q = typeof profileByName === 'function' ? profileByName(e) : null; } catch (x) { /* */ }
        r = q && p ? String(q.id) === String(p.id) : (!!nm && norm(e) === nm);
        cache.set(e, r);
      }
      return r;
    };
  }
  function compute(p, wm) {
    const mine = mineFn(p), today = dnum(new Date()), tk = dayKey(new Date());
    const r = { orders: new Set(), sales: 0, deliv: 0, late: [], open: [], todayLines: [], comm: 0, mSales: 0, mUnits: 0 };
    allRequestLines.forEach(l => {
      if (!mine(l)) return;
      const rd = lineDate(l), dk = dayKey(rd), st = l.status || 'In Progress';
      const rdn = dnum(rd), sn = dnum(l.exec_start_date), base = isNaN(sn) ? rdn : sn, dur = num(l.duration_days);
      const it = { l: l, st: st, age: isNaN(rdn) ? 0 : Math.max(0, today - rdn), late: 0 };
      if (dur > 0 && !isNaN(base) && today > base + dur && st !== 'Delivered' && st !== 'Complete') {
        it.late = today - (base + dur);
      }
      if (dk === tk) {
        r.orders.add(l.transaction_id || ('TX-' + l.id));
        r.sales += num(l.total);
        r.todayLines.push(it);
      }
      if (dk && dk.slice(0, 7) === wm) {
        r.comm += calcLineComm(l);
        r.mSales += num(l.total);
        r.mUnits += Math.max(0, num(l.qty));
      }
      if (st === 'Delivered') {
        if (String(l.delivered_date || '').slice(0, 10) === tk) r.deliv++;
        return;
      }
      if (it.late > 0) r.late.push(it);
      else r.open.push(it);
    });
    r.late.sort((a, b) => b.late - a.late);
    r.open.sort((a, b) => b.age - a.age);
    return r;
  }

  /* حساب عدد المتأخرات لتحديث العداد في الهيدر والشاشة الرئيسية */
  function countRelevantLate() {
    if (typeof allRequestLines === 'undefined' || !allRequestLines.length) return 0;
    const tp = isMgr() ? 'ALL' : me();
    if (!tp) return 0;
    const r = compute(tp, workingMonth());
    return r.late.length;
  }
  window.getMyDayLateCount = countRelevantLate;

  function updateHeaderLateBadge() {
    const n = countRelevantLate();
    ['hdr-late-badge', 'menu-late-badge', 'hm-late-badge'].forEach(id => {
      const b = $(id);
      if (!b) return;
      b.textContent = n > 99 ? '99+' : String(n);
      b.classList.toggle('hidden', !n);
    });
  }
  window.updateHeaderLateBadge = updateHeaderLateBadge;

  /* فتح شاشة شغلي النهاردة أو المتأخرات مباشرة */
  window.openMyDayTab = function (mode) {
    viewFilter = mode || 'all';
    if (mode === 'late' && isMgr()) {
      const mp = me();
      const myR = mp ? compute(mp, workingMonth()) : { late: [] };
      if (!myR.late.length) who = 'ALL';
    }
    switchTab('myday');
    render();
    if (mode === 'late') {
      setTimeout(() => {
        const el = $('md-sec-late-box');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
    }
  };
  window.setMyDayFilter = function (f) {
    viewFilter = f || 'all';
    render();
  };

  /* ---------------- العرض الموحّد والمريح بصرياً ---------------- */
  const kpi = (label, value, cls, onClick) =>
    '<button type="button" ' + (onClick ? 'onclick="' + onClick + '"' : '') + ' class="card lift p-4 text-right w-full ' + (cls || '') + '">' +
      '<div class="text-[11px] text-slate-500 font-semibold">' + label + '</div>' +
      '<div class="mt-1 text-lg sm:text-xl font-bold text-ink dark:text-white whitespace-nowrap">' + value + '</div>' +
    '</button>';

  function ageText(it) {
    if (it.late) return 'متأخر ' + it.late + ' يوم';
    return it.age === 0 ? 'اليوم' : it.age === 1 ? 'منذ أمس' : 'منذ ' + it.age + ' يوم';
  }

  function row(it, showEmp) {
    const l = it.l, tx = l.transaction_id || ('TX-' + l.id);
    const wa = typeof waLink === 'function' ? waLink(l.phone, 'أهلاً ' + (l.client_name || '') + '، بخصوص معاملتك رقم ' + tx + ' — تساهيل') : '';
    const ageCls = it.late
      ? 'bg-rose-100 text-rose-700 border border-rose-200 dark:bg-rose-950/80 dark:text-rose-300 dark:border-rose-800 font-bold'
      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 font-semibold';

    return '<div data-st17="' + eh(it.st) + '" class="md-row flex flex-wrap items-center justify-between gap-3 p-3.5 sm:px-5 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">' +
      '<div class="min-w-0 flex-1 space-y-2">' +
        '<div class="flex flex-wrap items-center gap-2">' +
          '<button type="button" ' + ac(l.client_name) + ' class="font-bold text-sm text-ink dark:text-white hover:text-brand-600 hover:underline text-start leading-snug">' + eh(l.client_name || '—') + '</button>' +
          (l.phone ? '<span class="rc-phone-pill !py-0.5 !px-2 !text-[11px]" dir="ltr"><span>' + eh(l.phone) + '</span>' + (wa ? '<a href="' + wa + '" target="_blank" rel="noopener" class="text-emerald-600 hover:text-emerald-700"><i class="fa-brands fa-whatsapp"></i></a>' : '') + '</span>' : '') +
          (showEmp && l.employee ? '<span class="text-xs text-slate-500">' + empCell(l.employee) + '</span>' : '') +
        '</div>' +
        '<div class="flex flex-wrap items-center gap-2">' +
          '<div class="rc-svc-pill"><span class="rc-svc-name">' + eh(l.service || '—') + '</span><span class="rc-svc-qty" dir="ltr">×' + fmtNum(l.qty) + '</span></div>' +
          (l.executor ? '<span class="rc-exec-pill"><i class="fa-solid fa-user-gear text-[10px]"></i><span>' + eh(l.executor) + '</span></span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="flex flex-wrap items-center justify-end gap-2 shrink-0">' +
        '<span class="font-bold text-sm text-brand-600 dark:text-brand-400 whitespace-nowrap">' + formatCurrency(l.total) + '</span>' +
        badge(it.st) +
        '<button type="button" ' + at(tx) + ' class="rc-tx-pill" dir="ltr">' + eh(tx) + '</button>' +
        '<span class="rounded-full px-2.5 py-1 text-[11px] whitespace-nowrap ' + ageCls + '"><i class="fa-regular fa-clock ms-1"></i>' + eh(ageText(it)) + '</span>' +
      '</div>' +
    '</div>';
  }

  function section(id, title, icon, list, emptyMsg, cls, showEmp) {
    let h = '<div id="' + id + '" class="card overflow-hidden ' + (cls || '') + '">' +
      '<div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-3.5 bg-slate-50/70 dark:bg-slate-800/40">' +
        '<span class="font-bold text-sm flex items-center gap-2"><i class="fa-solid ' + icon + '"></i><span>' + title + '</span></span>' +
        '<span class="rounded-full px-2.5 py-0.5 text-xs font-bold bg-slate-200/70 dark:bg-slate-700 text-slate-700 dark:text-slate-200">' + list.length + ' بند</span>' +
      '</div>';
    if (!list.length) h += '<div class="p-8 text-center text-xs text-slate-400">' + emptyMsg + '</div>';
    else {
      h += '<div class="divide-y divide-slate-100 dark:divide-slate-800">' + list.slice(0, LIMIT).map(it => row(it, showEmp)).join('') + '</div>';
      if (list.length > LIMIT) h += '<div class="p-3 text-center text-xs text-slate-400 border-t border-slate-100 dark:border-slate-800">+ ' + (list.length - LIMIT) + ' بند إضافي (استخدم البحث للوصول السريع)</div>';
    }
    return h + '</div>';
  }

  function render() {
    if (!ensureUi()) return;
    updateHeaderLateBadge();
    const p = $('tab-myday'); if (!p) return;
    const tp = targetProfile(), showEmp = tp === 'ALL';
    const tpName = tp === 'ALL' ? 'كل الفريق (شامل)' : (tp && tp.full_name ? tp.full_name : '');

    let h = '<div class="card p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">' +
      '<div class="flex items-center gap-3">' +
        '<div class="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-600 text-white text-lg shadow-xs"><i class="fa-solid fa-sun"></i></div>' +
        '<div>' +
          '<h2 class="font-bold text-base sm:text-lg text-ink dark:text-white">شغلي النهاردة والمتأخرات</h2>' +
          '<p class="text-xs text-slate-500 mt-0.5">' + eh(new Intl.DateTimeFormat('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())) + (tpName ? ' · <b>' + eh(tpName) + '</b>' : '') + '</p>' +
        '</div>' +
      '</div>' +
      '<div class="flex flex-wrap items-center gap-2">';

    if (isMgr()) {
      h += '<select id="md-who" class="field !w-48 !py-2 text-xs font-bold">' +
        '<option value=""' + (!who ? ' selected' : '') + '>شغلي أنا</option>' +
        '<option value="ALL"' + (who === 'ALL' ? ' selected' : '') + '>كل الفريق (شامل المتأخرات)</option>' +
        profs().map(x => '<option value="' + eh(x.id) + '"' + (String(x.id) === who ? ' selected' : '') + '>' + eh(x.full_name || '—') + '</option>').join('') +
      '</select>';
    }
    h += '<button type="button" id="md-refresh" class="rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 px-3.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-200"><i class="fa-solid fa-rotate ms-1"></i>تحديث</button></div></div>';

    if (!tp || (tp !== 'ALL' && !tp.full_name)) {
      h += '<div class="card p-8 text-center text-xs text-slate-400">اكتب اسمك في "حسابي" بنفس الاسم اللي بتكتبه في خانة الموظف المسؤول علشان نجمع شغلك هنا.</div>';
      p.innerHTML = h; return;
    }

    const wm = workingMonth();
    const r = compute(tp, wm), openN = r.late.length + r.open.length;

    const filterChip = (k, lbl, cnt, ic, badgeCol) => {
      const on = viewFilter === k;
      return '<button type="button" onclick="setMyDayFilter(\'' + k + '\')" class="rounded-xl px-3.5 py-2 text-xs font-bold flex items-center gap-1.5 border transition ' +
        (on ? 'bg-ink text-white border-ink dark:bg-brand-600 dark:border-brand-600 shadow-xs' : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:bg-slate-50') + '">' +
        '<i class="fa-solid ' + ic + ' ' + (!on && badgeCol ? badgeCol : '') + '"></i><span>' + lbl + '</span>' +
        '<span class="rounded-full px-2 py-0.5 text-[10px] ' + (on ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300') + '">' + cnt + '</span>' +
      '</button>';
    };

    h += '<div class="flex flex-wrap items-center gap-2">' +
      filterChip('all', 'عرض الكل', r.late.length + r.open.length + r.todayLines.length, 'fa-layer-group', 'text-brand-600') +
      filterChip('late', 'المتأخرات فقط', r.late.length, 'fa-triangle-exclamation', 'text-rose-600') +
      filterChip('open', 'المفتوحة قيد التنفيذ', r.open.length, 'fa-spinner', 'text-amber-600') +
      filterChip('today', 'معاملات اليوم', r.todayLines.length, 'fa-calendar-day', 'text-emerald-600') +
    '</div>';

    h += '<div class="grid grid-cols-2 sm:grid-cols-5 gap-3">' +
      kpi('معاملات اليوم', r.orders.size + ' معاملة', '', "setMyDayFilter('today')") +
      kpi('مبيعات اليوم', eh(formatCurrency(r.sales)), 'text-brand-600', "setMyDayFilter('today')") +
      kpi('إجمالي المفتوح', openN + ' بند', '', "setMyDayFilter('open')") +
      kpi('متأخرات تحتاج متابعة', r.late.length + ' بند', r.late.length ? 'ring-2 ring-rose-400/70' : '', "setMyDayFilter('late')") +
      kpi('مبيعات الشهر', eh(formatCurrency(r.mSales)), '', "switchTab('comm')") +
    '</div>';

    if (tp !== 'ALL') {
      const key = tp.id + '|' + wm, tg = meta.tgt[key], stg = meta.svcTgt[key] || 0;
      if (meta.closures === null || tg === undefined) loadMeta(false);
      const pct = tg > 0 ? Math.round(r.mSales / tg * 100) : null, col = pct == null ? '#94a3b8' : ringColor(pct);
      const svcPct = stg > 0 ? Math.round(r.mUnits / stg * 100) : null, svcCol = svcPct == null ? '#0284c7' : ringColor(svcPct);
      h += '<div class="card p-4 sm:p-5 space-y-3">' +
        '<div class="flex flex-wrap items-center justify-between gap-2">' +
          '<span class="font-bold text-sm text-ink dark:text-white"><i class="fa-solid fa-bullseye text-brand-600 ms-1.5"></i>تحقيق التارجت والكوميشن (' + eh(wm) + ')</span>' +
          '<span class="font-bold text-base" style="color:' + col + '">' + (pct == null ? (tg === undefined ? '...' : 'تارجت المبلغ لم يُحدد') : pct + '%') + '</span>' +
        '</div>' +
        '<div class="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><div class="h-full rounded-full transition-all duration-500" style="width:' + Math.min(100, pct || 0) + '%;background:' + col + '"></div></div>' +
        (stg > 0 ? '<div class="space-y-1 pt-1"><div class="flex justify-between text-xs"><span class="text-slate-500">تارجت عدد الخدمات (' + r.mUnits + ' من ' + stg + ' خدمة)</span><b style="color:' + svcCol + '">' + svcPct + '%</b></div><div class="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><div class="h-full rounded-full transition-all duration-500" style="width:' + Math.min(100, svcPct || 0) + '%;background:' + svcCol + '"></div></div></div>' : '') +
        '<div class="flex flex-wrap justify-between gap-2 text-xs text-slate-500 pt-1"><span>مبيعات الشهر: <b class="text-ink dark:text-white">' + eh(formatCurrency(r.mSales)) + '</b>' + (tg > 0 ? ' من ' + eh(formatCurrency(tg)) : '') + '</span><span>إجمالي الخدمات: <b class="text-sky-600">' + r.mUnits + ' خدمة</b></span><span>كوميشن الشهر: <b class="text-emerald-600">' + eh(formatCurrency(r.comm)) + '</b></span></div>' +
      '</div>';
    }

    if (viewFilter === 'all' || viewFilter === 'late') {
      h += section('md-sec-late-box', 'الطلبات المتأخرة عن موعد التسليم', 'fa-triangle-exclamation text-rose-600', r.late, 'ممتاز! لا توجد أي بنود متأخرة حالياً 🎉', r.late.length ? 'ring-1 ring-rose-300 dark:ring-rose-800' : '', showEmp);
    }
    if (viewFilter === 'all' || viewFilter === 'open') {
      h += section('md-sec-open-box', 'البنود المفتوحة (قيد التنفيذ / المراجعة / مكتملة بانتظار التسليم)', 'fa-hourglass-half text-amber-500', r.open, 'لا توجد بنود مفتوحة حالياً', '', showEmp);
    }
    if (viewFilter === 'all' || viewFilter === 'today') {
      h += section('md-sec-today-box', 'معاملات وبنود مسجلة اليوم', 'fa-calendar-check text-emerald-600', r.todayLines, 'لم يتم تسجيل معاملات اليوم بعد', '', showEmp);
    }

    h += '<div class="text-[11px] text-slate-400 px-1">' + eh(NOTICE) + '</div>';
    p.innerHTML = h;
  }
  const schedule = () => { updateHeaderLateBadge(); if (currentTab !== 'myday') return; clearTimeout(rt); rt = setTimeout(safe('render', render), 120); };

  function ensureUi() {
    if (isPartner()) { const b = $('tab-myday-btn'); if (b) b.remove(); return false; }
    if (!$('tab-myday')) {
      const host = $('tab-notes') || $('tab-tasks'); if (!host) return false;
      const p = document.createElement('div'); p.id = 'tab-myday'; p.className = 'hidden space-y-5';
      host.insertAdjacentElement('afterend', p);
      p.addEventListener('change', function (e) { if (e.target && e.target.id === 'md-who') { who = e.target.value; render(); } });
      p.addEventListener('click', function (e) {
        const b = e.target && e.target.closest ? e.target.closest('#md-refresh') : null; if (!b) return;
        if (typeof loadRecentRequests === 'function') loadRecentRequests(); loadMeta(true); render();
      });
    }
    if (!$('tab-myday-btn')) {
      const menu = $('nav-menu'); if (!menu) return false;
      const b = document.createElement('button'); b.id = 'tab-myday-btn'; b.type = 'button'; b.className = BTN_OFF;
      b.setAttribute('onclick', "openMyDayTab('all')");
      b.innerHTML = '<i class="fa-solid fa-sun"></i><span>شغلي النهاردة</span>';
      const a = $('tab-search-btn');
      menu.insertBefore(b, a && a.parentElement === menu ? a : menu.firstChild);
    }
    return true;
  }

  wrap('switchTab', o => function (id) {
    const r = o.apply(this, arguments);
    try {
      const p = $('tab-myday'), b = $('tab-myday-btn'), lb = $('hdr-late-btn'), on = id === 'myday';
      if (p) p.classList.toggle('hidden', !on);
      if (b) b.className = (on && viewFilter !== 'late') ? BTN_ON : BTN_OFF;
      if (lb) lb.className = (on && viewFilter === 'late') ? BTN_ON : BTN_OFF;
      if (on) render();
    } catch (e) { console.warn('p20 tab', e); }
    return r;
  });
  wrap('refreshLineViews', o => function () { const r = o.apply(this, arguments); schedule(); return r; });
  wrap('loadInitialData', o => async function () { const x = await o.apply(this, arguments); try { ensureUi(); updateHeaderLateBadge(); } catch (e) { console.warn('p20 setup', e); } return x; });
  wrap('handleLogout', o => function () {
    try { who = ''; viewFilter = 'all'; meta.closures = null; meta.tgt = {}; meta.svcTgt = {}; clearTimeout(rt); const p = $('tab-myday'); if (p) p.innerHTML = ''; } catch (e) { /* */ }
    return o.apply(this, arguments);
  });
})();