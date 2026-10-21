/* ===== المرحلة 4 (محدّثة): الكوميشن والتارجت (بالأمونت + عدد الخدمات والأعداد داخل البنود + إنذار المتأخرين في التارجت والكوميشن) ===== */
(function () {
  if (window.__phase4) return;
  window.__phase4 = true;
  const eh = escapeHtml, MANAGER_EMAIL = 'mahmoud.aboshama@tasahel.com.eg';
  const isMgr = () => window.__role ? window.__role === 'manager' : !!(currentUser && ['mahmoud.aboshama@tasahel.com.eg','mahmoud.aboshama.contact@gmail.com'].includes(String(currentUser.email || '').toLowerCase()));
  let closures = [], snaps = [], targets = [], live = null, viewMonth = null, setupNeeded = false, busy = false, seq = 0;

  const nextM = m => { const a = m.split('-').map(Number); return a[1] === 12 ? (a[0] + 1) + '-01' : a[0] + '-' + String(a[1] + 1).padStart(2, '0'); };
  const monthLabel = m => new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric' }).format(new Date(m + '-01T00:00'));
  const curMonth = () => new Date().toLocaleDateString('en-CA').slice(0, 7);
  function workingMonth() {
    const cl = closures.map(c => c.month).sort();
    return cl.length ? nextM(cl[cl.length - 1]) : curMonth();
  }
  const isClosed = m => closures.some(c => c.month === m);

  /* حساب عمولة الوحدة من جدول الخدمات (services) أو من البند، وضربها دائماً في العدد (qty) داخل البند */
  function unitCommOf(l) {
    if (!l) return 0;
    if (typeof window.getServiceCommRate === 'function') {
      const catRate = window.getServiceCommRate(l.service);
      if (catRate != null) return catRate;
    } else if (typeof allServices !== 'undefined' && Array.isArray(allServices) && l.service) {
      const k = typeof normName === 'function' ? normName(l.service) : String(l.service).trim().toLowerCase();
      const s = allServices.find(x => (typeof normName === 'function' ? normName(x.name) : String(x.name || '').trim().toLowerCase()) === k);
      if (s) {
        const raw = s.commission_per_unit != null && s.commission_per_unit !== '' ? s.commission_per_unit : (s.commission != null && s.commission !== '' ? s.commission : null);
        if (raw != null) {
          const n = Number(String(raw).replace(/[^\d.-]/g, ''));
          if (Number.isFinite(n)) return n;
        }
      }
    }
    if (l.commission_per_unit != null && l.commission_per_unit !== '' && Number.isFinite(Number(l.commission_per_unit))) {
      return Number(l.commission_per_unit);
    }
    if (l.commission != null && l.commission !== '' && Number.isFinite(Number(l.commission))) {
      const q = Math.max(1, Number(l.qty) || 1);
      const c = Number(l.commission);
      return c === 3 ? 3 : (c / q);
    }
    return 0;
  }

  const lineComm = l => {
    const q = Math.max(0, Number(l && l.qty) || 0);
    const rate = unitCommOf(l);
    return rate * q;
  };
  window.lineComm = lineComm;

  const missing = err => /42P01|PGRST205|PGRST202|does not exist|schema cache/i.test(((err && err.message) || '') + ' ' + ((err && err.code) || ''));

  /* جلب بنود الشهر كلها من السيرفر (مش من آخر 600 بند بس) */
  async function fetchMonthLines(m) {
    const a0 = m + '-01T00:00:00', a = a0 > DATA_FROM_TS ? a0 : DATA_FROM_TS, b = nextM(m) + '-01T00:00:00', out = [];
    if (b <= DATA_FROM_TS) return out;
    for (let from = 0; ; from += 1000) {
      const r = await sbClient.from('request_lines')
        .select('id,employee,qty,total,commission,commission_per_unit,transaction_id,received_at,client_name,service')
        .gte('received_at', a).lt('received_at', b)
        .order('id', { ascending: true }).range(from, from + 999);
      if (r.error) throw r.error;
      out.push.apply(out, r.data || []);
      if ((r.data || []).length < 1000) break;
    }
    return out;
  }

  function aggregate(lines) {
    const by = new Map(), lost = new Map(), lostLines = [];
    lines.forEach(l => {
      const p = profileByName(l.employee), sales = Number(l.total) || 0, q = Math.max(0, Number(l.qty) || 0), rate = unitCommOf(l), c = rate * q;
      if (!p) { const k = (l.employee || 'بدون موظف').trim(); lost.set(k, (lost.get(k) || 0) + 1); lostLines.push(l); return; }
      if (!by.has(p.id)) by.set(p.id, { sales: 0, comm: 0, lines: 0, units: 0, commUnits: 0, tx: new Set(), bySvc: new Map() });
      const d = by.get(p.id);
      d.sales += sales;
      d.comm += c;
      d.lines++;
      d.units += q;
      if (rate > 0) d.commUnits += q;
      if (l.transaction_id) d.tx.add(l.transaction_id);
      const sn = (l.service || 'خدمة غير مسماة').trim();
      if (!d.bySvc.has(sn)) d.bySvc.set(sn, { name: sn, lines: 0, units: 0, rate: rate, sales: 0, comm: 0 });
      const sv = d.bySvc.get(sn);
      sv.lines++;
      sv.units += q;
      sv.sales += sales;
      sv.comm += c;
    });
    return { by: by, lost: lost, lostLines: lostLines };
  }

  async function loadMeta() {
    const c = await sbClient.from('month_closures').select('month,closed_at,closed_by').order('month');
    if (c.error) { if (missing(c.error)) { setupNeeded = true; return false; } throw c.error; }
    setupNeeded = false; closures = c.data || [];
    if (!viewMonth) viewMonth = workingMonth();
    const s = await sbClient.from('month_snapshots').select('*').eq('month', viewMonth);
    if (s.error) throw s.error; snaps = s.data || [];
    const t = await sbClient.from('emp_targets').select('user_id,month,target').eq('month', viewMonth);
    if (t.error) throw t.error; targets = t.data || [];
    live = null;
    if (!isClosed(viewMonth)) live = aggregate(await fetchMonthLines(viewMonth));
    return true;
  }

  function rowsForView() {
    const closed = isClosed(viewMonth);
    /* نعرض كل الموظفين علشان التيم يبلّغ بعض مين واقع في التارجت وياخد الريكوستات يشتغل عليها */
    const list = profiles.filter(p => p.id && p.role !== 'partner');
    return list.map(p => {
      if (closed) {
        const s = snaps.find(x => x.user_id === p.id);
        return { p: p, sales: s ? Number(s.sales) : 0, comm: s ? Number(s.commission) : 0, lines: s ? s.lines_count : 0, units: s ? s.lines_count : 0, commUnits: s ? Math.round((Number(s.commission) || 0) / 3) : 0, tx: s ? s.tx_count : 0, target: s ? Number(s.target) : 0, bySvc: new Map() };
      }
      const d = live && live.by.get(p.id), t = targets.find(x => x.user_id === p.id);
      return { p: p, sales: d ? d.sales : 0, comm: d ? d.comm : 0, lines: d ? d.lines : 0, units: d ? d.units : 0, commUnits: d ? d.commUnits : 0, tx: d ? d.tx.size : 0, target: t ? Number(t.target) : 0, bySvc: d ? d.bySvc : new Map() };
    }).sort((a, b) => b.sales - a.sales);
  }

  /* تحديد الموظفين المتأخرين في التارجت أو الكوميشن */
  function evaluateLagging(rows) {
    if (!rows.length) return { laggingIds: new Set(), list: [], expectedPct: 50 };
    const now = new Date();
    const ym = viewMonth || curMonth();
    const [y, m] = ym.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate() || 30;
    const isCurrentM = ym === curMonth();
    const dayOfMonth = isCurrentM ? now.getDate() : daysInMonth;
    const expectedPct = Math.min(85, Math.max(25, Math.round((dayOfMonth / daysInMonth) * 100)));

    const avgComm = rows.reduce((s, r) => s + r.comm, 0) / rows.length;
    const avgSales = rows.reduce((s, r) => s + r.sales, 0) / rows.length;

    const list = [];
    const laggingIds = new Set();
    rows.forEach(r => {
      const pct = r.target > 0 ? Math.round((r.sales / r.target) * 100) : null;
      const behindTarget = r.target > 0 && pct < Math.max(40, expectedPct - 15);
      const behindTeamComm = r.target <= 0 && avgComm > 0 && r.comm < avgComm * 0.55;
      const zeroWork = r.sales === 0 && (r.target > 0 || avgSales > 0);
      if (behindTarget || behindTeamComm || zeroWork) {
        laggingIds.add(r.p.id);
        list.push({
          r: r,
          pct: pct,
          remainingSales: r.target > 0 ? Math.max(0, r.target - r.sales) : Math.max(0, Math.round(avgSales - r.sales)),
          reason: r.target > 0 ? ('محقق ' + pct + '% فقط من التارجت') : ('كوميشن أقل من متوسط الفريق (' + formatCurrency(r.comm) + ')')
        });
      }
    });
    list.sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0) || a.r.comm - b.r.comm);
    return { laggingIds: laggingIds, list: list, expectedPct: expectedPct };
  }

  function ringColor(pct) { return pct >= 100 ? '#059669' : pct >= 60 ? '#0d9488' : pct >= 35 ? '#d97706' : '#dc2626'; }

  function card(r, closed, isLagging) {
    const pct = r.target > 0 ? Math.round(r.sales / r.target * 100) : null, col = pct == null ? '#94a3b8' : ringColor(pct);
    const me = r.p.id === currentUser.id;
    const remSales = r.target > 0 ? Math.max(0, r.target - r.sales) : 0;
    const targetBlock = isMgr() && !closed
      ? '<div class="flex items-center gap-2"><span class="text-[11px] text-slate-400 shrink-0">التارجت:</span><input type="number" min="0" step="any" value="' + (r.target || '') + '" data-u="' + eh(r.p.id) + '" placeholder="حدد التارجت بالجنيه" class="field comm-target-input !py-1.5 text-center font-mono text-xs"><span class="text-[11px] text-slate-400 shrink-0">ج.م</span></div>'
      : '<div class="flex justify-between text-xs"><span class="text-slate-400">التارجت الشهري</span><span class="font-mono font-bold">' + (r.target > 0 ? formatCurrency(r.target) : 'لم يُحدد بعد') + '</span></div>';

    const lagBanner = isLagging && !closed
      ? '<div class="rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 px-3 py-2 text-[11px] text-rose-700 dark:text-rose-300 font-bold flex items-center justify-between gap-2">' +
          '<span><i class="fa-solid fa-bell ms-1 text-rose-600"></i>واقع في التارجت/الكوميشن — أولوية لاستلام الريكوستات</span>' +
          (remSales > 0 ? '<span class="font-mono whitespace-nowrap">باقي ' + formatCurrency(remSales) + '</span>' : '') +
        '</div>'
      : '';

    return '<div class="card lift p-5 space-y-4 ' + (isLagging && !closed ? 'ring-2 ring-rose-400/70 dark:ring-rose-600/70' : '') + '">' +
      lagBanner +
      '<div class="flex items-center gap-3.5">' + avatarHtml(r.p, 48) +
        '<div class="min-w-0 flex-1">' +
          '<div class="font-bold text-ink dark:text-white truncate">' + eh(r.p.full_name || 'بدون اسم') + (me ? ' <span class="rounded-full bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 px-2 py-0.5 text-[10px] font-semibold">أنت</span>' : '') + '</div>' +
          '<div class="text-[11px] text-slate-500">' + r.tx + ' معاملة · ' + r.lines + ' بند · <b>' + r.units + ' خدمة</b></div>' +
        '</div>' +
        '<div class="text-center shrink-0"><div class="text-2xl font-bold font-mono" style="color:' + col + '">' + (pct == null ? '—' : pct + '%') + '</div><div class="text-[10px] text-slate-400">التحقيق</div></div>' +
      '</div>' +
      '<div class="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><div class="h-full rounded-full transition-all duration-700" style="width:' + Math.min(100, pct || 0) + '%;background:' + col + '"></div></div>' +
      '<div class="grid grid-cols-2 gap-2.5 text-xs">' +
        '<div class="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">' +
          '<div class="text-slate-400">المبيعات (Amount)</div>' +
          '<div class="font-mono font-bold text-sm text-ink dark:text-white mt-0.5">' + formatCurrency(r.sales) + '</div>' +
        '</div>' +
        '<div class="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 p-3">' +
          '<div class="text-emerald-700 dark:text-emerald-300">إجمالي الكوميشن</div>' +
          '<div class="font-mono font-bold text-sm text-emerald-700 dark:text-emerald-300 mt-0.5">' + formatCurrency(r.comm) + '</div>' +
        '</div>' +
        '<div class="rounded-xl bg-sky-50/70 dark:bg-sky-950/30 p-2.5">' +
          '<div class="text-sky-700 dark:text-sky-300 text-[11px]">إجمالي الأعداد بالبنود</div>' +
          '<div class="font-mono font-bold text-xs text-sky-900 dark:text-sky-200 mt-0.5">' + r.units + ' خدمة <span class="font-normal text-[10px]">(' + r.lines + ' بند)</span></div>' +
        '</div>' +
        '<div class="rounded-xl bg-amber-50/70 dark:bg-amber-950/30 p-2.5">' +
          '<div class="text-amber-800 dark:text-amber-300 text-[11px]">خدمات مستحقة للكوميشن</div>' +
          '<div class="font-mono font-bold text-xs text-amber-900 dark:text-amber-200 mt-0.5">' + r.commUnits + ' خدمة <span class="font-normal text-[10px]">(× 3 ج)</span></div>' +
        '</div>' +
      '</div>' +
      targetBlock +
      (!closed && r.bySvc && r.bySvc.size ? '<button type="button" onclick="commShowEmpServices(\'' + eh(r.p.id) + '\')" class="w-full rounded-xl border border-slate-200 dark:border-slate-700 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"><i class="fa-solid fa-list-check ms-1.5"></i>عرض تفصيل خدمات وكوميشن الموظف (' + r.bySvc.size + ' خدمة)</button>' : '') +
    '</div>';
  }

  function tile(label, val, cls) { return '<div class="card p-4"><div class="text-[11px] text-slate-500">' + label + '</div><div class="mt-1 text-xl font-bold mono ' + (cls || 'text-ink dark:text-white') + '">' + val + '</div></div>'; }

  function paint() {
    const closed = isClosed(viewMonth), mgr = isMgr(), wm = workingMonth(), rows = rowsForView();
    const months = [...new Set([...closures.map(c => c.month), wm])].sort().reverse();
    $('comm-month').innerHTML = months.map(m => '<option value="' + m + '"' + (m === viewMonth ? ' selected' : '') + '>' + eh(monthLabel(m)) + (m === wm ? ' (الشهر الحالي)' : '') + '</option>').join('');
    $('comm-status').innerHTML = closed ? '<span class="rounded-full bg-slate-200 dark:bg-slate-700 px-3 py-1 text-[11px] font-bold"><i class="fa-solid fa-lock ms-1"></i>مقفول</span>' : '<span class="rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 px-3 py-1 text-[11px] font-bold"><i class="fa-solid fa-lock-open ms-1"></i>مفتوح</span>';
    $('comm-sub').textContent = 'الكوميشن بيتحسب تلقائياً بالعدد الفعلي داخل كل بند (الكمية × عمولة الخدمة من جدول الخدمات: 3 ج أو 0 ج) — مع تنبيه للموظف الواقع في التارجت';
    let act = '';
    if (mgr && !closed && viewMonth === wm) act += '<button type="button" onclick="commSaveTargets()" class="rounded-xl bg-brand-600 hover:bg-brand-700 px-4 py-2 text-xs font-bold text-white"><i class="fa-solid fa-floppy-disk ms-1"></i>حفظ التارجت</button><button type="button" onclick="commCloseMonth()" class="rounded-xl bg-rose-600 hover:bg-rose-700 px-4 py-2 text-xs font-bold text-white"><i class="fa-solid fa-lock ms-1"></i>قفل الشهر</button>';
    if (mgr && closures.length && viewMonth === closures[closures.length - 1].month) act += '<button type="button" onclick="commReopen()" class="rounded-xl bg-slate-100 dark:bg-slate-800 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-200"><i class="fa-solid fa-rotate-left ms-1"></i>إعادة فتح الشهر</button>';
    $('comm-actions').innerHTML = act;

    const lag = evaluateLagging(rows);
    let warnHtml = '';
    if (mgr && live && live.lost.size) {
      warnHtml += '<div class="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-900 dark:text-amber-200 mb-3"><i class="fa-solid fa-triangle-exclamation ms-1"></i><b>بنود مش مربوطة بموظف مسجّل (مش داخلة في الحساب):</b> ' + [...live.lost.entries()].map(e => '<button type="button" data-n="' + eh(e[0]) + '" onclick="commLost(this.dataset.n)" class="mx-0.5 rounded-lg bg-amber-200/70 px-2 py-0.5 font-bold underline dark:bg-amber-900/50">' + eh(e[0]) + ' (' + e[1] + ') ← اعرض وصلّح</button>').join(' ') + '</div>';
    }
    if (!closed && lag.list.length) {
      warnHtml += '<div class="rounded-2xl border-2 border-rose-300 dark:border-rose-800 bg-rose-50/90 dark:bg-rose-950/40 p-4 text-xs text-rose-900 dark:text-rose-200 shadow-xs">' +
        '<div class="flex flex-wrap items-center justify-between gap-2 mb-2">' +
          '<div class="flex items-center gap-2 font-bold text-sm text-rose-700 dark:text-rose-300">' +
            '<span class="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-600 text-white"><i class="fa-solid fa-bell"></i></span>' +
            '<span>إنذار التارجت والكوميشن: موظفون واقعون في التارجت ومحتاجون استلام الريكوستات</span>' +
          '</div>' +
          '<span class="rounded-full bg-rose-200/80 dark:bg-rose-900/70 px-2.5 py-0.5 text-[11px] font-bold">المعدل المتوقع حتى اليوم: ' + lag.expectedPct + '%</span>' +
        '</div>' +
        '<p class="mb-3 text-slate-600 dark:text-slate-300">تنبيه للمدير والفريق: الزملاء الموضحون بالأسفل متأخرون في التارجت/الكوميشن. بلّغوا بعض علشان اللي واقع في التارجت ياخد هو الريكوستات الجديدة يشتغل عليها ويعلي في التارجت:</p>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">' +
          lag.list.map(item =>
            '<div class="flex items-center justify-between gap-2 rounded-xl bg-white dark:bg-slate-900 p-3 border border-rose-200 dark:border-rose-800/80">' +
              '<div class="min-w-0">' +
                '<div class="font-bold text-ink dark:text-white truncate">' + eh(item.r.p.full_name) + '</div>' +
                '<div class="text-[11px] text-rose-600 dark:text-rose-400 font-semibold">' + eh(item.reason) + '</div>' +
                '<div class="text-[11px] text-slate-500">كوميشن: <b class="font-mono">' + formatCurrency(item.r.comm) + '</b> · خدمات: <b>' + item.r.units + '</b></div>' +
              '</div>' +
              '<div class="text-end shrink-0">' +
                '<span class="inline-block rounded-lg bg-rose-100 dark:bg-rose-950 px-2 py-1 font-mono font-bold text-rose-700 dark:text-rose-300">' + (item.pct == null ? '0%' : item.pct + '%') + '</span>' +
                (item.remainingSales > 0 ? '<div class="text-[10px] text-slate-400 mt-1">باقي ' + formatCurrency(item.remainingSales) + '</div>' : '') +
              '</div>' +
            '</div>'
          ).join('') +
        '</div>' +
      '</div>';
    }
    $('comm-warn').innerHTML = warnHtml;

    const sum = k => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0), tt = sum('target'), ts = sum('sales'), tu = sum('units'), tcu = sum('commUnits');
    $('comm-totals').innerHTML =
      tile('إجمالي المبيعات (Amount)', formatCurrency(ts), 'text-brand-600 dark:text-brand-400') +
      tile('إجمالي الكوميشن المستحق', formatCurrency(sum('comm')), 'text-emerald-600 dark:text-emerald-400') +
      tile('إجمالي الخدمات (الأعداد بالبنود)', tu + ' خدمة (' + tcu + ' بكوميشن)', 'text-sky-600 dark:text-sky-400') +
      tile('إجمالي التارجت ونسبة التحقيق', (tt > 0 ? formatCurrency(tt) + ' (' + Math.round(ts / tt * 100) + '%)' : 'لم يُحدد'));

    $('comm-grid').innerHTML = rows.length ? rows.map(r => card(r, closed, lag.laggingIds.has(r.p.id))).join('') : '<div class="card p-8 text-center text-xs text-slate-400 sm:col-span-2 lg:col-span-3">لا توجد بيانات لعرضها</div>';
  }

  window.commShowEmpServices = function (uid) {
    const rows = rowsForView();
    const r = rows.find(x => String(x.p.id) === String(uid));
    if (!r || !r.bySvc) return;
    const svcs = [...r.bySvc.values()].sort((a, b) => b.comm - a.comm || b.units - a.units);
    let m = $('emp-svc-modal'); if (m) m.remove();
    const trs = svcs.map(s =>
      '<tr>' +
        '<td class="px-3 py-2 font-bold text-ink dark:text-white">' + eh(s.name) + '</td>' +
        '<td class="px-3 py-2 font-mono text-center">' + s.lines + '</td>' +
        '<td class="px-3 py-2 font-mono text-center font-bold">' + s.units + '</td>' +
        '<td class="px-3 py-2 font-mono text-center">' + (s.rate > 0 ? formatCurrency(s.rate) : '<span class="text-slate-400">0 ج (بدون كوميشن)</span>') + '</td>' +
        '<td class="px-3 py-2 font-mono">' + formatCurrency(s.sales) + '</td>' +
        '<td class="px-3 py-2 font-mono font-bold text-emerald-600">' + formatCurrency(s.comm) + '</td>' +
      '</tr>'
    ).join('');
    document.body.insertAdjacentHTML('beforeend',
      '<div id="emp-svc-modal" class="fixed inset-0 z-[220] flex items-center justify-center bg-black/60 p-4">' +
        '<div class="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900">' +
          '<div class="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">' +
            '<div><div class="font-bold text-ink dark:text-white">تفصيل الخدمات والكوميشن: ' + eh(r.p.full_name) + '</div>' +
            '<div class="text-[11px] text-slate-500">إجمالي المعاملات: ' + r.tx + ' · البنود: ' + r.lines + ' · مجموع الأعداد داخل البنود: ' + r.units + ' خدمة · الكوميشن: ' + formatCurrency(r.comm) + '</div></div>' +
            '<button type="button" onclick="document.getElementById(\'emp-svc-modal\').remove()" class="h-8 w-8 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><i class="fa-solid fa-xmark"></i></button>' +
          '</div>' +
          '<div class="overflow-y-auto p-4">' +
            '<table class="w-full text-right text-xs">' +
              '<thead class="bg-slate-50 dark:bg-slate-800 text-slate-500"><tr><th class="px-3 py-2">الخدمة</th><th class="px-3 py-2 text-center">عدد البنود</th><th class="px-3 py-2 text-center">مجموع العدد داخل البنود</th><th class="px-3 py-2 text-center">كوميشن الوحدة</th><th class="px-3 py-2">إجمالي المبيعات</th><th class="px-3 py-2">إجمالي الكوميشن</th></tr></thead>' +
              '<tbody class="divide-y divide-slate-100 dark:divide-slate-800">' + trs + '</tbody>' +
            '</table>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  };

  window.renderComm = async function () {
    if (!sbClient || !currentUser || !$('comm-grid')) return;
    if (!profilesReady) { $('comm-grid').innerHTML = '<div class="card p-8 text-center text-sm text-slate-500 sm:col-span-2 lg:col-span-3">لازم تشغّل ملف <b class="font-mono">phase1-profiles.sql</b> الأول.</div>'; return; }
    const my = ++seq;
    $('comm-grid').innerHTML = '<div class="card p-8 text-center text-xs text-slate-400 sm:col-span-2 lg:col-span-3"><i class="fa-solid fa-spinner fa-spin ms-1"></i> جارٍ الحساب...</div>';
    try {
      const ok = await loadMeta();
      if (my !== seq) return;
      if (!ok) { $('comm-grid').innerHTML = '<div class="card p-8 text-center text-sm text-slate-500 sm:col-span-2 lg:col-span-3"><i class="fa-solid fa-database text-2xl text-brand-600 mb-3 block"></i>لازم تشغّل ملف <b class="font-mono">phase4-commission-targets.sql</b> مرة واحدة في Supabase علشان الكوميشن والتارجت يشتغلوا.</div>'; return; }
      paint();
    } catch (err) { showError('تعذّر حساب الكوميشن', err); }
  };
  window.commLost = function (name) {
    if (!live) return;
    const ls = live.lostLines.filter(l => (l.employee || 'بدون موظف').trim() === name), ps = profiles.filter(p => p.id);
    const sel = ps.map(p => '<option value="' + eh(p.full_name) + '">' + eh(p.full_name) + '</option>').join('');
    let m = $('lost-modal'); if (m) m.remove();
    document.body.insertAdjacentHTML('beforeend', '<div id="lost-modal" class="fixed inset-0 z-[130] flex items-end justify-center bg-black/60 sm:items-center sm:p-4"><div class="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl dark:bg-slate-900 sm:rounded-2xl">' +
      '<div class="flex items-center justify-between border-b border-slate-100 px-5 py-3 dark:border-slate-800"><div><div class="font-bold text-ink dark:text-white">بنود مسجّلة باسم: ' + eh(name) + '</div><div class="text-[11px] text-slate-500">' + ls.length + ' بند — اربطها بموظف مسجّل علشان تدخل في الكوميشن</div></div><button type="button" onclick="document.getElementById(\'lost-modal\').remove()" class="h-8 w-8 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><i class="fa-solid fa-xmark"></i></button></div>' +
      '<div class="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-5 py-3 text-xs dark:border-slate-800 dark:bg-slate-800/40"><span class="font-semibold">اربط كل البنود دي بـ:</span><select id="lost-all" class="field !w-48 !py-2 text-xs">' + sel + '</select><button type="button" data-n="' + eh(name) + '" onclick="commLostFix(this.dataset.n)" class="rounded-xl bg-brand-600 px-4 py-2 font-bold text-white">حفظ الربط</button></div>' +
      '<div class="space-y-2 overflow-y-auto p-4">' + ls.map(l => '<div class="flex items-center justify-between gap-2 rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-700"><div class="min-w-0"><div class="truncate font-bold text-ink dark:text-white">' + eh(l.client_name) + '</div><div class="truncate text-slate-500">' + eh(l.service) + ' ×' + eh(l.qty) + '</div></div><div class="shrink-0 text-end"><div class="font-mono text-brand-600" dir="ltr">' + eh(l.transaction_id) + '</div><div class="text-slate-400">' + eh(String(l.received_at || '').slice(0, 10)) + '</div></div></div>').join('') + '</div></div></div>');
  };
  window.commLostFix = async function (name) {
    const to = $('lost-all').value, ids = live.lostLines.filter(l => (l.employee || 'بدون موظف').trim() === name).map(l => l.id);
    if (!to || !ids.length || !confirm('ربط ' + ids.length + ' بند بالموظف "' + to + '"؟')) return;
    const r = await sbClient.from('request_lines').update({ employee: to }).in('id', ids).select('id');
    if (r.error) return showError('تعذّر الربط', r.error);
    if ((r.data || []).length !== ids.length) return showToast('الربط ماتحفظش بالكامل: غالباً صلاحية التعديل مش مفعّلة', 'error', 9000);
    const m = $('lost-modal'); if (m) m.remove(); showToast('تم ربط ' + ids.length + ' بند'); renderComm();
    if (window.loadRecentRequests) loadRecentRequests();
  };
  window.commChangeMonth = function (m) { viewMonth = m; renderComm(); };

  window.commSaveTargets = async function () {
    if (!isMgr() || busy) return;
    const rows = [...document.querySelectorAll('.comm-target-input')].map(i => ({ user_id: i.dataset.u, month: viewMonth, target: parseFloat(i.value) || 0, set_by: currentUser.id, updated_at: new Date().toISOString() }));
    if (!rows.length) return;
    busy = true;
    const r = await sbClient.from('emp_targets').upsert(rows, { onConflict: 'user_id,month' });
    busy = false;
    if (r.error) return showError('تعذّر حفظ التارجت', r.error);
    showToast('تم حفظ التارجت'); renderComm();
  };

  window.commCloseMonth = async function () {
    if (!isMgr() || busy || isClosed(viewMonth)) return;
    if (!confirm('قفل ' + monthLabel(viewMonth) + '؟\nالكوميشن والتارجت هيتثبّتوا للشهر ده، ويبدأ شهر جديد من الصفر.')) return;
    busy = true;
    try {
      const fresh = aggregate(await fetchMonthLines(viewMonth));
      const rows = profiles.map(p => {
        const d = fresh.by.get(p.id), t = targets.find(x => x.user_id === p.id);
        return { month: viewMonth, user_id: p.id, full_name: p.full_name || '', sales: d ? d.sales : 0, commission: d ? d.comm : 0, target: t ? Number(t.target) : 0, lines_count: d ? d.lines : 0, tx_count: d ? d.tx.size : 0 };
      });
      let r = await sbClient.from('month_snapshots').upsert(rows, { onConflict: 'month,user_id' });
      if (r.error) throw r.error;
      r = await sbClient.from('month_closures').insert({ month: viewMonth, closed_by: currentUser.id });
      if (r.error) throw r.error;
      showToast('تم قفل ' + monthLabel(viewMonth));
      viewMonth = null; await renderComm();
    } catch (err) { showError('تعذّر قفل الشهر', err); }
    busy = false;
  };

  window.commReopen = async function () {
    if (!isMgr() || busy || !closures.length) return;
    const m = closures[closures.length - 1].month;
    if (!confirm('إعادة فتح ' + monthLabel(m) + '؟ هتتمسح لقطة النتائج المحفوظة وتتحسب من جديد.')) return;
    busy = true;
    try {
      let r = await sbClient.from('month_closures').delete().eq('month', m);
      if (r.error) throw r.error;
      r = await sbClient.from('month_snapshots').delete().eq('month', m);
      if (r.error) throw r.error;
      showToast('تم إعادة فتح الشهر');
      viewMonth = m; await renderComm();
    } catch (err) { showError('تعذّر إعادة الفتح', err); }
    busy = false;
  };

  const _lr = window.loadRecentRequests;
  window.loadRecentRequests = async function () { const x = await _lr(); if (currentTab === 'comm') renderComm(); return x; };
  const _lo = window.handleLogout;
  window.handleLogout = async function () { viewMonth = null; closures = []; snaps = []; targets = []; live = null; return _lo(); };
})();