/* ===== المرحلة 4 (محدّثة): الكوميشن والتارجت (خصوصية كوميشن الموظف + تارجت المبلغ وتارجت عدد الخدمات + فلترة بالتاريخ + طباعة وPDF وExcel + إصلاح نافذة تفصيل الخدمات) ===== */
(function () {
  if (window.__phase4) return;
  window.__phase4 = true;
  const eh = escapeHtml, MANAGER_EMAIL = 'mahmoud.aboshama@tasahel.com.eg';
  const isMgr = () => window.__role ? window.__role === 'manager' : !!(currentUser && ['mahmoud.aboshama@tasahel.com.eg', 'mahmoud.aboshama.contact@gmail.com'].includes(String(currentUser.email || '').toLowerCase()));
  let closures = [], snaps = [], targets = [], svcTargetsFallback = {}, live = null, rawMonthLines = [], viewMonth = null, setupNeeded = false, busy = false, seq = 0;
  let filterFrom = '', filterTo = '', filterEmpId = 'all';

  const nextM = m => { const a = m.split('-').map(Number); return a[1] === 12 ? (a[0] + 1) + '-01' : a[0] + '-' + String(a[1] + 1).padStart(2, '0'); };
  const monthLabel = m => {
    try { return new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric' }).format(new Date(m + '-01T00:00')); }
    catch (e) { return m; }
  };
  const curMonth = () => new Date().toLocaleDateString('en-CA').slice(0, 7);
  const monthBounds = m => {
    const [y, mm] = String(m || curMonth()).split('-').map(Number);
    const lastDay = new Date(y, mm, 0).getDate() || 30;
    return [m + '-01', m + '-' + String(lastDay).padStart(2, '0')];
  };
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

  /* جلب البنود حسب الفترة المحددة (الشهر أو الفترة من - إلى) */
  async function fetchRangeLines(startDay, endDay) {
    const a0 = startDay + 'T00:00:00', a = a0 > DATA_FROM_TS ? a0 : DATA_FROM_TS;
    const endDateObj = new Date(endDay + 'T00:00:00');
    endDateObj.setDate(endDateObj.getDate() + 1);
    const b = endDateObj.toLocaleDateString('en-CA') + 'T00:00:00';
    const out = [];
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

  /* تحميل تارجت عدد الخدمات الاحتياطي من localStorage + audit_log لضمان عمله حتى قبل ترقية جدول emp_targets */
  async function loadSvcTargetsFallback(m) {
    const map = {};
    try {
      const loc = JSON.parse(localStorage.getItem('tasahel_svc_targets_' + m) || '{}');
      Object.assign(map, loc);
    } catch (e) {}
    try {
      const r = await sbClient.from('audit_log').select('details').eq('transaction_id', 'SVC_TGT_' + m).order('at', { ascending: false }).limit(1);
      if (!r.error && r.data && r.data[0] && r.data[0].details && typeof r.data[0].details === 'object') {
        Object.assign(map, r.data[0].details);
      }
    } catch (e) {}
    svcTargetsFallback = map;
  }

  function getEmpSvcTarget(uid, tRow) {
    if (tRow && tRow.services_target != null && Number(tRow.services_target) > 0) return Number(tRow.services_target);
    if (svcTargetsFallback && svcTargetsFallback[uid] != null && Number(svcTargetsFallback[uid]) > 0) return Number(svcTargetsFallback[uid]);
    return 0;
  }

  async function loadMeta() {
    const c = await sbClient.from('month_closures').select('month,closed_at,closed_by').order('month');
    if (c.error) { if (missing(c.error)) { setupNeeded = true; return false; } throw c.error; }
    setupNeeded = false; closures = c.data || [];
    if (!viewMonth) viewMonth = workingMonth();
    const bounds = monthBounds(viewMonth);
    if (!filterFrom || !filterTo) {
      filterFrom = bounds[0];
      filterTo = bounds[1];
    }
    const s = await sbClient.from('month_snapshots').select('*').eq('month', viewMonth);
    if (s.error) throw s.error; snaps = s.data || [];
    const t = await sbClient.from('emp_targets').select('*').eq('month', viewMonth);
    if (t.error) throw t.error; targets = t.data || [];
    await loadSvcTargetsFallback(viewMonth);

    const customRange = (filterFrom && filterTo) && (filterFrom !== bounds[0] || filterTo !== bounds[1]);
    live = null;
    if (!isClosed(viewMonth) || customRange) {
      rawMonthLines = await fetchRangeLines(filterFrom || bounds[0], filterTo || bounds[1]);
      live = aggregate(rawMonthLines);
    }
    return true;
  }

  /* استخراج بيانات كل الموظفين (لحساب متوسط الفريق والإنذارات بدقة) */
  function allRowsForPeriod() {
    const bounds = monthBounds(viewMonth);
    const customRange = (filterFrom && filterTo) && (filterFrom !== bounds[0] || filterTo !== bounds[1]);
    const closed = isClosed(viewMonth) && !customRange;
    const list = profiles.filter(p => p.id && p.role !== 'partner');
    return list.map(p => {
      const t = targets.find(x => x.user_id === p.id);
      if (closed) {
        const s = snaps.find(x => x.user_id === p.id);
        return {
          p: p,
          sales: s ? Number(s.sales) : 0,
          comm: s ? Number(s.commission) : 0,
          lines: s ? s.lines_count : 0,
          units: s ? (s.units_count || s.lines_count) : 0,
          commUnits: s ? Math.round((Number(s.commission) || 0) / 3) : 0,
          tx: s ? s.tx_count : 0,
          target: s ? Number(s.target) : 0,
          svcTarget: (s && s.services_target != null) ? Number(s.services_target) : getEmpSvcTarget(p.id, t),
          bySvc: new Map()
        };
      }
      const d = live && live.by.get(p.id);
      return {
        p: p,
        sales: d ? d.sales : 0,
        comm: d ? d.comm : 0,
        lines: d ? d.lines : 0,
        units: d ? d.units : 0,
        commUnits: d ? d.commUnits : 0,
        tx: d ? d.tx.size : 0,
        target: t ? Number(t.target) : 0,
        svcTarget: getEmpSvcTarget(p.id, t),
        bySvc: d ? d.bySvc : new Map()
      };
    }).sort((a, b) => b.sales - a.sales);
  }

  /* الصفوف المسموح بعرضها حسب الصلاحية والفلتر:
     - الموظف العادي يرى الكوميشن والكارت الخاص به هو فقط!
     - المدير يرى كل الموظفين أو الموظف المختار في الفلتر. */
  function visibleRows(allRows) {
    const mgr = isMgr();
    if (!mgr) {
      return allRows.filter(r => currentUser && String(r.p.id) === String(currentUser.id));
    }
    if (filterEmpId && filterEmpId !== 'all') {
      return allRows.filter(r => String(r.p.id) === String(filterEmpId));
    }
    return allRows;
  }

  /* تحديد الموظفين المتأخرين في التارجت (المالي أو عدد الخدمات) أو الكوميشن */
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
      const pctSales = r.target > 0 ? Math.round((r.sales / r.target) * 100) : null;
      const pctSvc = r.svcTarget > 0 ? Math.round((r.units / r.svcTarget) * 100) : null;
      const behindSalesTarget = r.target > 0 && pctSales < Math.max(40, expectedPct - 15);
      const behindSvcTarget = r.svcTarget > 0 && pctSvc < Math.max(40, expectedPct - 15);
      const behindTeamComm = r.target <= 0 && r.svcTarget <= 0 && avgComm > 0 && r.comm < avgComm * 0.55;
      const zeroWork = r.sales === 0 && r.units === 0 && (r.target > 0 || r.svcTarget > 0 || avgSales > 0);

      if (behindSalesTarget || behindSvcTarget || behindTeamComm || zeroWork) {
        laggingIds.add(r.p.id);
        const reasons = [];
        if (behindSalesTarget) reasons.push('محقق ' + pctSales + '% من تارجت المبلغ');
        if (behindSvcTarget) reasons.push('محقق ' + pctSvc + '% من تارجت الخدمات (' + r.units + '/' + r.svcTarget + ')');
        if (!reasons.length) reasons.push('متأخر في معدل التارجت/الكوميشن الشهري');

        list.push({
          r: r,
          pct: pctSales != null ? pctSales : pctSvc,
          pctSales: pctSales,
          pctSvc: pctSvc,
          remainingSales: r.target > 0 ? Math.max(0, r.target - r.sales) : 0,
          remainingSvc: r.svcTarget > 0 ? Math.max(0, r.svcTarget - r.units) : 0,
          reason: reasons.join(' · ')
        });
      }
    });
    list.sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0) || a.r.comm - b.r.comm);
    return { laggingIds: laggingIds, list: list, expectedPct: expectedPct };
  }

  function ringColor(pct) { return pct >= 100 ? '#059669' : pct >= 60 ? '#0d9488' : pct >= 35 ? '#d97706' : '#dc2626'; }

  function card(r, closed, isLagging) {
    const pctSales = r.target > 0 ? Math.round(r.sales / r.target * 100) : null;
    const pctSvc = r.svcTarget > 0 ? Math.round(r.units / r.svcTarget * 100) : null;
    const mainPct = pctSales != null ? pctSales : pctSvc;
    const col = mainPct == null ? '#94a3b8' : ringColor(mainPct);
    const colSvc = pctSvc == null ? '#0284c7' : ringColor(pctSvc);
    const me = currentUser && r.p.id === currentUser.id;
    const remSales = r.target > 0 ? Math.max(0, r.target - r.sales) : 0;
    const remSvc = r.svcTarget > 0 ? Math.max(0, r.svcTarget - r.units) : 0;

    const targetInputsBlock = isMgr() && !closed
      ? '<div class="rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/70 dark:bg-slate-800/40 p-3 space-y-2.5">' +
          '<div class="text-[11px] font-bold text-slate-600 dark:text-slate-300 flex items-center justify-between">' +
            '<span><i class="fa-solid fa-sliders ms-1 text-brand-600"></i>ضبط تارجت الشهر للموظف</span>' +
          '</div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">' +
            '<div>' +
              '<label class="block text-[10px] font-semibold text-slate-500 mb-1">تارجت المبلغ (ج.م)</label>' +
              '<input type="number" min="0" step="any" value="' + (r.target || '') + '" data-u="' + eh(r.p.id) + '" placeholder="مثال: 500000" class="field comm-target-input !py-1.5 text-center font-bold text-xs">' +
            '</div>' +
            '<div>' +
              '<label class="block text-[10px] font-semibold text-slate-500 mb-1">تارجت عدد الخدمات (شهرياً)</label>' +
              '<input type="number" min="0" step="1" value="' + (r.svcTarget || '') + '" data-u="' + eh(r.p.id) + '" placeholder="مثال: 300 خدمة" class="field comm-svc-target-input !py-1.5 text-center font-bold text-xs">' +
            '</div>' +
          '</div>' +
        '</div>'
      : '<div class="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 p-3 space-y-1.5 text-xs">' +
          '<div class="flex justify-between items-center"><span class="text-slate-500">تارجت المبلغ الشهري:</span><span class="font-bold text-ink dark:text-white">' + (r.target > 0 ? formatCurrency(r.target) : 'لم يُحدد بعد') + '</span></div>' +
          '<div class="flex justify-between items-center"><span class="text-slate-500">تارجت عدد الخدمات الشهري:</span><span class="font-bold text-sky-700 dark:text-sky-300">' + (r.svcTarget > 0 ? r.svcTarget + ' خدمة' : 'لم يُحدد بعد') + '</span></div>' +
        '</div>';

    const svcProgressBlock = r.svcTarget > 0
      ? '<div class="space-y-1 pt-1">' +
          '<div class="flex items-center justify-between text-[11px]">' +
            '<span class="font-semibold text-slate-600 dark:text-slate-300"><i class="fa-solid fa-layer-group ms-1 text-sky-600"></i>تحقيق تارجت عدد الخدمات (' + r.units + ' من ' + r.svcTarget + ' خدمة)</span>' +
            '<span class="font-bold" style="color:' + colSvc + '">' + pctSvc + '%' + (remSvc > 0 ? ' (باقي ' + remSvc + ' خدمة)' : ' ✓ مكتمل') + '</span>' +
          '</div>' +
          '<div class="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><div class="h-full rounded-full transition-all duration-700" style="width:' + Math.min(100, pctSvc || 0) + '%;background:' + colSvc + '"></div></div>' +
        '</div>'
      : '';

    const lagBanner = isLagging && !closed
      ? '<div class="rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 px-3 py-2 text-[11px] text-rose-700 dark:text-rose-300 font-bold flex flex-wrap items-center justify-between gap-2">' +
          '<span><i class="fa-solid fa-bell ms-1 text-rose-600"></i>واقع في التارجت/الكوميشن — أولوية لاستلام الريكوستات</span>' +
          (remSales > 0 ? '<span class="whitespace-nowrap">باقي ' + formatCurrency(remSales) + '</span>' : (remSvc > 0 ? '<span class="whitespace-nowrap">باقي ' + remSvc + ' خدمة</span>' : '')) +
        '</div>'
      : '';

    return '<div class="card lift p-5 space-y-4 ' + (isLagging && !closed ? 'ring-2 ring-rose-400/70 dark:ring-rose-600/70' : '') + '">' +
      lagBanner +
      '<div class="flex items-center gap-3.5">' + avatarHtml(r.p, 48) +
        '<div class="min-w-0 flex-1">' +
          '<div class="font-bold text-ink dark:text-white truncate">' + eh(r.p.full_name || 'بدون اسم') + (me ? ' <span class="rounded-full bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 px-2 py-0.5 text-[10px] font-semibold">أنت</span>' : '') + '</div>' +
          '<div class="text-[11px] text-slate-500">' + r.tx + ' معاملة · ' + r.lines + ' بند · <b>' + r.units + ' خدمة</b></div>' +
        '</div>' +
        '<div class="text-center shrink-0"><div class="text-2xl font-bold" style="color:' + col + '">' + (mainPct == null ? '—' : mainPct + '%') + '</div><div class="text-[10px] text-slate-400">التحقيق</div></div>' +
      '</div>' +
      '<div class="space-y-1">' +
        '<div class="flex items-center justify-between text-[11px] text-slate-500">' +
          '<span>تحقيق تارجت المبلغ</span>' +
          '<span>' + (pctSales == null ? 'بدون تارجت مالي' : pctSales + '%' + (remSales > 0 ? ' (باقي ' + formatCurrency(remSales) + ')' : ' ✓')) + '</span>' +
        '</div>' +
        '<div class="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><div class="h-full rounded-full transition-all duration-700" style="width:' + Math.min(100, pctSales || 0) + '%;background:' + col + '"></div></div>' +
      '</div>' +
      svcProgressBlock +
      '<div class="grid grid-cols-2 gap-2.5 text-xs">' +
        '<div class="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">' +
          '<div class="text-slate-400">المبيعات (Amount)</div>' +
          '<div class="font-bold text-sm text-ink dark:text-white mt-0.5">' + formatCurrency(r.sales) + '</div>' +
        '</div>' +
        '<div class="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 p-3">' +
          '<div class="text-emerald-700 dark:text-emerald-300">إجمالي الكوميشن</div>' +
          '<div class="font-bold text-sm text-emerald-700 dark:text-emerald-300 mt-0.5">' + formatCurrency(r.comm) + '</div>' +
        '</div>' +
        '<div class="rounded-xl bg-sky-50/70 dark:bg-sky-950/30 p-2.5">' +
          '<div class="text-sky-700 dark:text-sky-300 text-[11px]">إجمالي الأعداد بالبنود</div>' +
          '<div class="font-bold text-xs text-sky-900 dark:text-sky-200 mt-0.5">' + r.units + ' خدمة <span class="font-normal text-[10px]">(' + r.lines + ' بند)' + (r.svcTarget > 0 ? ' / ' + r.svcTarget : '') + '</span></div>' +
        '</div>' +
        '<div class="rounded-xl bg-amber-50/70 dark:bg-amber-950/30 p-2.5">' +
          '<div class="text-amber-800 dark:text-amber-300 text-[11px]">خدمات مستحقة للكوميشن</div>' +
          '<div class="font-bold text-xs text-amber-900 dark:text-amber-200 mt-0.5">' + r.commUnits + ' خدمة <span class="font-normal text-[10px]">(× 3 ج)</span></div>' +
        '</div>' +
      '</div>' +
      targetInputsBlock +
      '<div class="flex flex-wrap items-center gap-2 pt-1">' +
        (r.bySvc && r.bySvc.size ? '<button type="button" onclick="commShowEmpServices(\'' + eh(r.p.id) + '\')" class="flex-1 rounded-xl border border-brand-200 dark:border-brand-800 bg-brand-50/50 dark:bg-brand-950/30 py-2 px-3 text-xs font-bold text-brand-700 dark:text-brand-300 hover:bg-brand-100 dark:hover:bg-brand-900/50 transition"><i class="fa-solid fa-list-check ms-1.5"></i>عرض تفصيل الخدمات (' + r.bySvc.size + ' خدمة)</button>' : '') +
        '<button type="button" onclick="commPrintEmp(\'' + eh(r.p.id) + '\')" class="rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 py-2 px-3 text-xs font-bold text-slate-700 dark:text-slate-200" title="طباعة كشف كوميشن الموظف"><i class="fa-solid fa-print"></i></button>' +
        '<button type="button" onclick="commExportEmpPdf(\'' + eh(r.p.id) + '\')" class="rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 py-2 px-3 text-xs font-bold text-rose-600 dark:text-rose-300" title="تصدير PDF للموظف"><i class="fa-solid fa-file-pdf"></i></button>' +
        '<button type="button" onclick="commExportEmpCsv(\'' + eh(r.p.id) + '\')" class="rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 py-2 px-3 text-xs font-bold text-emerald-600 dark:text-emerald-300" title="تصدير Excel للموظف"><i class="fa-solid fa-file-excel"></i></button>' +
      '</div>' +
    '</div>';
  }

  function tile(label, val, cls) { return '<div class="card p-4"><div class="text-[11px] text-slate-500">' + label + '</div><div class="mt-1 text-xl font-bold ' + (cls || 'text-ink dark:text-white') + '">' + val + '</div></div>'; }

  function renderFilterBar(allRows) {
    const mgr = isMgr();
    let bar = $('comm-filter-bar');
    if (!bar) {
      const warnEl = $('comm-warn');
      if (warnEl) {
        warnEl.insertAdjacentHTML('beforebegin', '<div id="comm-filter-bar" class="card p-4 sm:p-5"></div>');
        bar = $('comm-filter-bar');
      }
    }
    if (!bar) return;

    const empOpts = '<option value="all"' + (filterEmpId === 'all' ? ' selected' : '') + '>كل الموظفين (' + allRows.length + ')</option>' +
      allRows.map(r => '<option value="' + eh(r.p.id) + '"' + (String(filterEmpId) === String(r.p.id) ? ' selected' : '') + '>' + eh(r.p.full_name || 'موظف') + '</option>').join('');

    bar.innerHTML =
      '<div class="flex flex-wrap items-end justify-between gap-3">' +
        '<div class="flex flex-wrap items-end gap-3">' +
          '<div>' +
            '<label class="label text-xs" for="comm-f-from"><i class="fa-regular fa-calendar ms-1 text-brand-600"></i>من تاريخ</label>' +
            '<input id="comm-f-from" type="date" value="' + eh(filterFrom) + '" class="field !w-40 !py-2 text-xs font-semibold">' +
          '</div>' +
          '<div>' +
            '<label class="label text-xs" for="comm-f-to"><i class="fa-regular fa-calendar-check ms-1 text-brand-600"></i>إلى تاريخ</label>' +
            '<input id="comm-f-to" type="date" value="' + eh(filterTo) + '" class="field !w-40 !py-2 text-xs font-semibold">' +
          '</div>' +
          (mgr ? '<div class="min-w-[180px]"><label class="label text-xs" for="comm-f-emp"><i class="fa-solid fa-user-tie ms-1 text-brand-600"></i>الموظف</label><select id="comm-f-emp" onchange="commApplyFilter()" class="field !py-2 text-xs font-semibold">' + empOpts + '</select></div>' : '') +
          '<div class="flex flex-wrap items-center gap-1.5">' +
            '<button type="button" onclick="commApplyFilter()" class="rounded-xl bg-brand-600 hover:bg-brand-700 px-4 py-2.5 text-xs font-bold text-white shadow-xs"><i class="fa-solid fa-filter ms-1"></i>تصفية الفترة</button>' +
            '<button type="button" onclick="commResetMonthFilter()" class="rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 px-3 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300">الشهر كامل</button>' +
          '</div>' +
        '</div>' +
        '<div class="flex flex-wrap items-center gap-2">' +
          '<button type="button" onclick="commPrintReport()" class="rounded-xl bg-ink hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 px-4 py-2.5 text-xs font-bold text-white flex items-center gap-1.5 shadow-xs"><i class="fa-solid fa-print"></i><span>طباعة الكوميشن</span></button>' +
          '<button type="button" onclick="commExportPdf()" class="rounded-xl bg-rose-600 hover:bg-rose-700 px-4 py-2.5 text-xs font-bold text-white flex items-center gap-1.5 shadow-xs"><i class="fa-solid fa-file-pdf"></i><span>PDF</span></button>' +
          '<button type="button" onclick="commExportCsv()" class="rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white flex items-center gap-1.5 shadow-xs"><i class="fa-solid fa-file-excel"></i><span>Excel</span></button>' +
        '</div>' +
      '</div>';
  }

  window.commApplyFilter = function () {
    const f = $('comm-f-from') ? $('comm-f-from').value : '';
    const t = $('comm-f-to') ? $('comm-f-to').value : '';
    const emp = $('comm-f-emp') ? $('comm-f-emp').value : 'all';
    if (f && t && f > t) return showToast('تاريخ البداية لازم يكون قبل أو يساوي تاريخ النهاية', 'error');
    filterFrom = f;
    filterTo = t;
    filterEmpId = isMgr() ? emp : 'all';
    renderComm();
  };

  window.commResetMonthFilter = function () {
    const bounds = monthBounds(viewMonth || workingMonth());
    filterFrom = bounds[0];
    filterTo = bounds[1];
    filterEmpId = 'all';
    renderComm();
  };

  function paint() {
    const closed = isClosed(viewMonth), mgr = isMgr(), wm = workingMonth();
    const allRows = allRowsForPeriod();
    const shownRows = visibleRows(allRows);

    const months = [...new Set([...closures.map(c => c.month), wm])].sort().reverse();
    $('comm-month').innerHTML = months.map(m => '<option value="' + m + '"' + (m === viewMonth ? ' selected' : '') + '>' + eh(monthLabel(m)) + (m === wm ? ' (الشهر الحالي)' : '') + '</option>').join('');
    $('comm-status').innerHTML = closed ? '<span class="rounded-full bg-slate-200 dark:bg-slate-700 px-3 py-1 text-[11px] font-bold"><i class="fa-solid fa-lock ms-1"></i>مقفول</span>' : '<span class="rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 px-3 py-1 text-[11px] font-bold"><i class="fa-solid fa-lock-open ms-1"></i>مفتوح</span>';
    $('comm-sub').textContent = mgr
      ? 'لوحة المدير: متابعة وضبط تارجت المبلغ وتارجت عدد الخدمات والكوميشن لجميع الموظفين (' + formatDateOnly(filterFrom) + ' — ' + formatDateOnly(filterTo) + ')'
      : 'كشف الكوميشن والتارجت الخاص بك (' + formatDateOnly(filterFrom) + ' — ' + formatDateOnly(filterTo) + ') — يظهر لك الكوميشن الخاص بحسابك فقط مع تنبيه أولوية التارجت للفريق';

    let act = '';
    if (mgr && !closed && viewMonth === wm) {
      act += '<button type="button" onclick="commSaveTargets()" class="rounded-xl bg-brand-600 hover:bg-brand-700 px-4 py-2 text-xs font-bold text-white shadow-xs"><i class="fa-solid fa-floppy-disk ms-1"></i>حفظ التارجت (المبلغ والخدمات)</button>' +
             '<button type="button" onclick="commCloseMonth()" class="rounded-xl bg-rose-600 hover:bg-rose-700 px-4 py-2 text-xs font-bold text-white shadow-xs"><i class="fa-solid fa-lock ms-1"></i>قفل الشهر</button>';
    }
    if (mgr && closures.length && viewMonth === closures[closures.length - 1].month) {
      act += '<button type="button" onclick="commReopen()" class="rounded-xl bg-slate-100 dark:bg-slate-800 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-200"><i class="fa-solid fa-rotate-left ms-1"></i>إعادة فتح الشهر</button>';
    }
    $('comm-actions').innerHTML = act;

    renderFilterBar(allRows);

    const lag = evaluateLagging(allRows);
    let warnHtml = '';
    if (mgr && live && live.lost.size) {
      warnHtml += '<div class="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-900 dark:text-amber-200 mb-3"><i class="fa-solid fa-triangle-exclamation ms-1"></i><b>بنود مش مربوطة بموظف مسجّل (مش داخلة في الحساب):</b> ' + [...live.lost.entries()].map(e => '<button type="button" data-n="' + eh(e[0]) + '" onclick="commLost(this.dataset.n)" class="mx-0.5 rounded-lg bg-amber-200/70 px-2 py-0.5 font-bold underline dark:bg-amber-900/50">' + eh(e[0]) + ' (' + e[1] + ') ← اعرض وصلّح</button>').join(' ') + '</div>';
    }
    /* الإنذار الأحمر يظهر للجميع حتى يعرف الفريق من المتأخر في التارجت/الكوميشن، ولكن بدون كشف مبالغ كوميشن الزملاء لغير المدير */
    if (!closed && lag.list.length) {
      warnHtml += '<div class="rounded-2xl border-2 border-rose-300 dark:border-rose-800 bg-rose-50/90 dark:bg-rose-950/40 p-4 text-xs text-rose-900 dark:text-rose-200 shadow-xs">' +
        '<div class="flex flex-wrap items-center justify-between gap-2 mb-2">' +
          '<div class="flex items-center gap-2 font-bold text-sm text-rose-700 dark:text-rose-300">' +
            '<span class="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-600 text-white"><i class="fa-solid fa-bell"></i></span>' +
            '<span>إنذار التارجت والكوميشن: موظفون واقعون في التارجت ومحتاجون أولوية استلام الريكوستات</span>' +
          '</div>' +
          '<span class="rounded-full bg-rose-200/80 dark:bg-rose-900/70 px-2.5 py-0.5 text-[11px] font-bold">المعدل المتوقع حتى اليوم: ' + lag.expectedPct + '%</span>' +
        '</div>' +
        '<p class="mb-3 text-slate-600 dark:text-slate-300">تنبيه للفريق: الزملاء الموضحون بالأسفل متأخرون في التارجت/الكوميشن هذا الشهر — الأولوية لهم في استلام الريكوستات الجديدة:</p>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">' +
          lag.list.map(item => {
            const isMe = currentUser && String(item.r.p.id) === String(currentUser.id);
            const showMoney = mgr || isMe;
            return '<div class="flex items-center justify-between gap-2.5 rounded-xl bg-white dark:bg-slate-900 p-3 border border-rose-200 dark:border-rose-800/80">' +
              '<div class="flex items-center gap-2.5 min-w-0">' +
                avatarHtml(item.r.p, 36) +
                '<div class="min-w-0">' +
                  '<div class="font-bold text-ink dark:text-white truncate">' + eh(item.r.p.full_name) + (isMe ? ' <span class="text-[10px] text-rose-600 font-bold">(أنت)</span>' : '') + '</div>' +
                  '<div class="text-[11px] text-rose-600 dark:text-rose-400 font-semibold">' + (showMoney ? eh(item.reason) : 'واقع في التارجت / الكوميشن — أولوية ريكوستات') + '</div>' +
                  (showMoney ? '<div class="text-[11px] text-slate-500">كوميشن: <b>' + formatCurrency(item.r.comm) + '</b> · خدمات: <b>' + item.r.units + (item.r.svcTarget > 0 ? '/' + item.r.svcTarget : '') + '</b></div>' : '') +
                '</div>' +
              '</div>' +
              '<div class="text-end shrink-0">' +
                '<span class="inline-block rounded-lg bg-rose-100 dark:bg-rose-950 px-2.5 py-1 font-bold text-rose-700 dark:text-rose-300 text-[11px]">' + (item.pct != null ? item.pct + '%' : 'أولوية') + '</span>' +
              '</div>' +
            '</div>';
          }).join('') +
        '</div>' +
      '</div>';
    }
    $('comm-warn').innerHTML = warnHtml;

    const sum = k => shownRows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
    const tt = sum('target'), ts = sum('sales'), tu = sum('units'), tcu = sum('commUnits'), tst = sum('svcTarget');
    $('comm-totals').innerHTML =
      tile(mgr ? 'إجمالي المبيعات (Amount)' : 'مبيعاتي في الفترة', formatCurrency(ts), 'text-brand-600 dark:text-brand-400') +
      tile(mgr ? 'إجمالي الكوميشن المستحق' : 'إجمالي كوميشني المستحق', formatCurrency(sum('comm')), 'text-emerald-600 dark:text-emerald-400') +
      tile(mgr ? 'إجمالي الخدمات المنفذة' : 'إجمالي خدماتي المنفذة', tu + ' خدمة' + (tst > 0 ? ' من ' + tst + ' (' + Math.round(tu / tst * 100) + '%)' : ' (' + tcu + ' بكوميشن)'), 'text-sky-600 dark:text-sky-400') +
      tile(mgr ? 'إجمالي تارجت المبلغ' : 'تارجت المبلغ الخاص بي', (tt > 0 ? formatCurrency(tt) + ' (' + Math.round(ts / tt * 100) + '%)' : 'لم يُحدد'));

    $('comm-grid').innerHTML = shownRows.length
      ? shownRows.map(r => card(r, closed, lag.laggingIds.has(r.p.id))).join('')
      : '<div class="card p-8 text-center text-xs text-slate-400 sm:col-span-2 lg:col-span-3">لا توجد بيانات لعرضها</div>';
  }

  /* إغلاق نافذة تفصيل خدمات الموظف وإعادة تفعيل سكرول الصفحة */
  window.commCloseEmpServices = function () {
    const m = $('emp-svc-modal');
    if (m) m.remove();
    document.body.style.overflow = '';
    if (window.__empSvcEscHandler) {
      document.removeEventListener('keydown', window.__empSvcEscHandler);
      window.__empSvcEscHandler = null;
    }
  };

  /* نافذة تفصيل خدمات وكوميشن الموظف — مع إصلاح السكرول الداخلي وزر الإغلاق والطباعة */
  window.commShowEmpServices = function (uid) {
    if (!isMgr() && (!currentUser || String(uid) !== String(currentUser.id))) {
      return showToast('يسمح بعرض تفصيل الكوميشن الخاص بحسابك فقط', 'error');
    }
    const allRows = allRowsForPeriod();
    const r = allRows.find(x => String(x.p.id) === String(uid));
    if (!r || !r.bySvc) return;
    const svcs = [...r.bySvc.values()].sort((a, b) => b.comm - a.comm || b.units - a.units);

    window.commCloseEmpServices();

    const trs = svcs.map((s, idx) =>
      '<tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50">' +
        '<td class="px-3 py-2.5 text-slate-400 text-center">' + (idx + 1) + '</td>' +
        '<td class="px-3 py-2.5 font-bold text-ink dark:text-white">' + eh(s.name) + '</td>' +
        '<td class="px-3 py-2.5 text-center font-semibold">' + s.lines + '</td>' +
        '<td class="px-3 py-2.5 text-center font-bold text-sky-700 dark:text-sky-300">' + s.units + '</td>' +
        '<td class="px-3 py-2.5 text-center">' + (s.rate > 0 ? '<span class="rounded-md bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 font-bold">' + formatCurrency(s.rate) + '</span>' : '<span class="text-slate-400">بدون كوميشن (0 ج)</span>') + '</td>' +
        '<td class="px-3 py-2.5 font-semibold whitespace-nowrap">' + formatCurrency(s.sales) + '</td>' +
        '<td class="px-3 py-2.5 font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">' + formatCurrency(s.comm) + '</td>' +
      '</tr>'
    ).join('');

    const modal = document.createElement('div');
    modal.id = 'emp-svc-modal';
    modal.style.cssText = 'position:fixed!important;top:0!important;left:0!important;right:0!important;bottom:0!important;width:100vw!important;height:100vh!important;z-index:999999!important;display:flex!important;align-items:center!important;justify-content:center!important;background-color:rgba(15,23,42,0.75)!important;padding:1rem!important;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);';
    modal.innerHTML =
      '<div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl text-slate-800 dark:text-slate-100" style="position:relative!important;z-index:1000000!important;width:100%!important;max-width:54rem!important;max-height:86vh!important;display:flex!important;flex-direction:column!important;overflow:hidden!important;border-radius:1rem!important;">' +
        '<div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 px-5 py-4 bg-slate-50 dark:bg-slate-800/60" style="flex-shrink:0!important;">' +
          '<div>' +
            '<div class="font-bold text-base text-ink dark:text-white flex items-center gap-2"><i class="fa-solid fa-bullseye text-brand-600"></i><span>تفصيل خدمات وكوميشن: ' + eh(r.p.full_name) + '</span></div>' +
            '<div class="text-xs text-slate-500 mt-0.5">الفترة: ' + eh(formatDateOnly(filterFrom)) + ' إلى ' + eh(formatDateOnly(filterTo)) + ' · المعاملات: <b>' + r.tx + '</b> · البنود: <b>' + r.lines + '</b> · إجمالي الخدمات: <b>' + r.units + ' خدمة</b> · الكوميشن: <b class="text-emerald-600">' + formatCurrency(r.comm) + '</b></div>' +
          '</div>' +
          '<div class="flex items-center gap-2">' +
            '<button type="button" onclick="commPrintEmp(\'' + eh(r.p.id) + '\')" class="rounded-xl bg-ink hover:bg-slate-800 dark:bg-brand-600 text-white px-3 py-1.5 text-xs font-bold flex items-center gap-1.5"><i class="fa-solid fa-print"></i><span>طباعة</span></button>' +
            '<button type="button" onclick="commExportEmpCsv(\'' + eh(r.p.id) + '\')" class="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs font-bold flex items-center gap-1.5"><i class="fa-solid fa-file-excel"></i><span>Excel</span></button>' +
            '<button type="button" onclick="commCloseEmpServices()" class="rounded-xl bg-rose-100 hover:bg-rose-200 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 px-3 py-1.5 text-xs font-bold flex items-center gap-1" title="إغلاق النافذة"><i class="fa-solid fa-xmark text-sm"></i><span>إغلاق</span></button>' +
          '</div>' +
        '</div>' +
        '<div style="flex:1 1 auto!important;overflow-y:auto!important;overflow-x:auto!important;max-height:calc(86vh - 135px)!important;overscroll-behavior:contain!important;-webkit-overflow-scrolling:touch!important;padding:1rem!important;">' +
          '<table class="w-full text-right text-xs border-collapse">' +
            '<thead class="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 sticky top-0 z-10">' +
              '<tr>' +
                '<th class="px-3 py-2.5 text-center">#</th>' +
                '<th class="px-3 py-2.5">الخدمة</th>' +
                '<th class="px-3 py-2.5 text-center">عدد البنود</th>' +
                '<th class="px-3 py-2.5 text-center">مجموع العدد بالبنود</th>' +
                '<th class="px-3 py-2.5 text-center">كوميشن الوحدة</th>' +
                '<th class="px-3 py-2.5">إجمالي المبيعات</th>' +
                '<th class="px-3 py-2.5">إجمالي الكوميشن</th>' +
              '</tr>' +
            '</thead>' +
            '<tbody class="divide-y divide-slate-100 dark:divide-slate-800">' + trs + '</tbody>' +
          '</table>' +
        '</div>' +
        '<div class="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 px-5 py-3 bg-slate-50 dark:bg-slate-800/60 text-xs" style="flex-shrink:0!important;">' +
          '<div class="font-bold text-slate-700 dark:text-slate-200">إجمالي المبيعات: <span class="text-brand-600">' + formatCurrency(r.sales) + '</span> · إجمالي الكوميشن: <span class="text-emerald-600">' + formatCurrency(r.comm) + '</span></div>' +
          '<button type="button" onclick="commCloseEmpServices()" class="rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 px-5 py-2 font-bold text-slate-800 dark:text-white">إغلاق النافذة</button>' +
        '</div>' +
      '</div>';

    modal.addEventListener('click', function (ev) {
      if (ev.target === modal) window.commCloseEmpServices();
    });
    window.__empSvcEscHandler = function (ev) {
      if (ev.key === 'Escape') window.commCloseEmpServices();
    };
    document.addEventListener('keydown', window.__empSvcEscHandler);
    document.body.style.overflow = 'hidden';
    document.body.appendChild(modal);
  };

  /* ---------- الطباعة وتصدير PDF و Excel للكوميشن ---------- */
  function buildCommReportDef(targetRows, singleEmp) {
    const periodText = 'الفترة: من ' + formatDateOnly(filterFrom) + ' إلى ' + formatDateOnly(filterTo);
    if (singleEmp && targetRows.length === 1) {
      const r = targetRows[0];
      const svcs = [...(r.bySvc ? r.bySvc.values() : [])].sort((a, b) => b.comm - a.comm || b.units - a.units);
      return {
        title: 'تقرير كوميشن وتارجت الموظف: ' + (r.p.full_name || 'موظف'),
        meta: [periodText, 'تارجت المبلغ: ' + (r.target > 0 ? formatCurrency(r.target) : 'غير محدد') + ' | تارجت الخدمات: ' + (r.svcTarget > 0 ? r.svcTarget + ' خدمة' : 'غير محدد')],
        stats: [
          ['عدد المعاملات والبنود', r.tx + ' معاملة (' + r.lines + ' بند)'],
          ['إجمالي الخدمات المنفذة', r.units + ' خدمة (' + r.commUnits + ' بكوميشن)'],
          ['إجمالي المبيعات (Amount)', formatCurrency(r.sales)],
          ['إجمالي الكوميشن المستحق', formatCurrency(r.comm)]
        ],
        headers: ['#', 'الخدمة', 'عدد البنود', 'مجموع الأعداد بالبنود', 'كوميشن الوحدة', 'إجمالي المبيعات', 'إجمالي الكوميشن'],
        rows: svcs.map((s, i) => [i + 1, s.name, s.lines, s.units, s.rate > 0 ? formatCurrency(s.rate) : '0 ج (بدون كوميشن)', formatCurrency(s.sales), formatCurrency(s.comm)]),
        csvHeaders: ['الموظف', 'الخدمة', 'عدد البنود', 'مجموع الأعداد بالبنود', 'كوميشن الوحدة', 'إجمالي المبيعات', 'إجمالي الكوميشن'],
        csvRows: svcs.map(s => [r.p.full_name, s.name, s.lines, s.units, s.rate, s.sales, s.comm]),
        filename: 'كوميشن_' + String(r.p.full_name || 'موظف').replace(/\s+/g, '_') + '_' + filterFrom + '_' + filterTo
      };
    }
    const totSales = targetRows.reduce((s, r) => s + r.sales, 0);
    const totComm = targetRows.reduce((s, r) => s + r.comm, 0);
    const totUnits = targetRows.reduce((s, r) => s + r.units, 0);
    return {
      title: 'كشف الكوميشن والتارجت للموظفين',
      meta: [periodText],
      stats: [
        ['عدد الموظفين', targetRows.length],
        ['إجمالي الخدمات المنفذة', totUnits + ' خدمة'],
        ['إجمالي المبيعات', formatCurrency(totSales)],
        ['إجمالي الكوميشن المستحق', formatCurrency(totComm)]
      ],
      headers: ['#', 'الموظف', 'المعاملات', 'البنود', 'إجمالي الخدمات', 'خدمات بكوميشن', 'المبيعات', 'الكوميشن المستحق', 'تارجت المبلغ', 'تحقيق المبلغ', 'تارجت الخدمات', 'تحقيق الخدمات'],
      rows: targetRows.map((r, i) => [
        i + 1,
        r.p.full_name,
        r.tx,
        r.lines,
        r.units,
        r.commUnits,
        formatCurrency(r.sales),
        formatCurrency(r.comm),
        r.target > 0 ? formatCurrency(r.target) : '—',
        r.target > 0 ? Math.round(r.sales / r.target * 100) + '%' : '—',
        r.svcTarget > 0 ? r.svcTarget + ' خدمة' : '—',
        r.svcTarget > 0 ? Math.round(r.units / r.svcTarget * 100) + '%' : '—'
      ]),
      csvHeaders: ['الموظف', 'عدد المعاملات', 'عدد البنود', 'إجمالي الخدمات', 'خدمات مستحقة للكوميشن', 'إجمالي المبيعات', 'إجمالي الكوميشن', 'تارجت المبلغ', 'نسبة تحقيق المبلغ %', 'تارجت عدد الخدمات', 'نسبة تحقيق الخدمات %'],
      csvRows: targetRows.map(r => [
        r.p.full_name,
        r.tx,
        r.lines,
        r.units,
        r.commUnits,
        r.sales,
        r.comm,
        r.target || 0,
        r.target > 0 ? Math.round(r.sales / r.target * 100) + '%' : '—',
        r.svcTarget || 0,
        r.svcTarget > 0 ? Math.round(r.units / r.svcTarget * 100) + '%' : '—'
      ]),
      filename: 'كشف_الكوميشن_والتارجت_' + filterFrom + '_' + filterTo
    };
  }

  function renderCommSheetHtml(def, rowsSlice, page, pages, forPdf) {
    const th = def.headers.map(h => '<th style="padding:7px 6px;border:1px solid #475569;background:#0b1b33;color:#fff;font-size:11px;white-space:nowrap">' + eh(h) + '</th>').join('');
    const tr = rowsSlice.map((r, i) => '<tr style="background:' + (i % 2 ? '#f8fafc' : '#fff') + '">' +
      r.map(v => '<td style="padding:6px;border:1px solid #cbd5e1;font-size:11px;vertical-align:middle">' + eh(v == null || v === '' ? '—' : v) + '</td>').join('') + '</tr>').join('');
    const box = forPdf ? 'width:1123px;min-height:790px;padding:24px;box-sizing:border-box;background:#fff;' : '';
    const meName = (myProfile && myProfile.full_name) || (currentUser && currentUser.email) || 'موظف';
    return '<div style="' + box + 'direction:rtl;font-family:\'IBM Plex Sans Arabic\',Tahoma,sans-serif;color:#0f172a">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #0d9488;padding-bottom:10px;margin-bottom:12px">' +
        '<div style="display:flex;flex-direction:column;align-items:flex-start;gap:4px">' + logoImg(44, 10) + '<div><div style="font-size:13px;font-weight:700;color:#475569">تساهيل | قسم الخدمات الحكومية</div><div style="font-size:16px;font-weight:700;color:#0f766e;margin-top:2px">' + eh(def.title) + '</div></div></div>' +
        '<div style="font-size:11px;text-align:left;line-height:1.7">' + def.meta.map(eh).join('<br>') + '</div>' +
      '</div>' +
      '<div style="display:flex;gap:10px;margin-bottom:12px">' + def.stats.map(s => '<div style="flex:1;border:1px solid #cbd5e1;border-radius:8px;padding:8px 12px;background:#f1f5f9"><div style="font-size:10px;color:#64748b">' + eh(s[0]) + '</div><div style="font-size:14px;font-weight:700">' + eh(s[1]) + '</div></div>').join('') + '</div>' +
      '<table style="width:100%;border-collapse:collapse"><thead style="display:table-header-group"><tr>' + th + '</tr></thead><tbody>' + tr + '</tbody></table>' +
      '<div style="margin-top:12px;font-size:10px;color:#64748b;display:flex;justify-content:space-between"><span>طُبع بواسطة: ' + eh(meName) + ' · ' + eh(new Date().toLocaleString('ar-EG')) + '</span>' + (page ? '<span>صفحة ' + page + ' من ' + pages + '</span>' : '') + '</div>' +
    '</div>';
  }

  function doPrintComm(def) {
    if (!def.rows.length) return showToast('لا توجد بيانات للطباعة في هذه الفترة', 'info');
    $('print-content').innerHTML = renderCommSheetHtml(def, def.rows, 0, 0, false);
    window.print();
  }

  async function doExportCommPdf(def) {
    if (!def.rows.length) return showToast('لا توجد بيانات للتصدير في هذه الفترة', 'info');
    if (!window.html2canvas || !window.jspdf) return showToast('مكتبة الـ PDF قيد التحميل — جرّب بعد ثوانٍ', 'error');
    showToast('جارٍ تجهيز ملف PDF...', 'info', 3000);
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-10000px;top:0;width:1123px;background:#fff;z-index:-1';
    document.body.appendChild(host);
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      const pdf = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
      const W = 297, H = 210, per = 18, pages = Math.max(1, Math.ceil(def.rows.length / per));
      for (let p = 0; p < pages; p++) {
        host.innerHTML = renderCommSheetHtml(def, def.rows.slice(p * per, (p + 1) * per), p + 1, pages, true);
        const canvas = await window.html2canvas(host.firstElementChild, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
        let w = W, h = canvas.height * W / canvas.width;
        if (h > H) { h = H; w = canvas.width * H / canvas.height; }
        if (p) pdf.addPage();
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', (W - w) / 2, 0, w, h);
      }
      pdf.save(def.filename + '.pdf');
      showToast('تم تحميل ملف PDF بنجاح');
    } catch (err) { showError('تعذّر إنشاء PDF', err); }
    finally { host.remove(); }
  }

  window.commPrintReport = function () {
    const rows = visibleRows(allRowsForPeriod());
    doPrintComm(buildCommReportDef(rows, rows.length === 1));
  };
  window.commExportPdf = function () {
    const rows = visibleRows(allRowsForPeriod());
    doExportCommPdf(buildCommReportDef(rows, rows.length === 1));
  };
  window.commExportCsv = function () {
    const rows = visibleRows(allRowsForPeriod());
    const def = buildCommReportDef(rows, rows.length === 1);
    if (!def.csvRows.length) return showToast('لا توجد بيانات للتصدير', 'info');
    downloadCsvFile(def.filename + '.csv', def.csvHeaders, def.csvRows);
  };

  window.commPrintEmp = function (uid) {
    if (!isMgr() && (!currentUser || String(uid) !== String(currentUser.id))) return;
    const rows = allRowsForPeriod().filter(r => String(r.p.id) === String(uid));
    doPrintComm(buildCommReportDef(rows, true));
  };
  window.commExportEmpPdf = function (uid) {
    if (!isMgr() && (!currentUser || String(uid) !== String(currentUser.id))) return;
    const rows = allRowsForPeriod().filter(r => String(r.p.id) === String(uid));
    doExportCommPdf(buildCommReportDef(rows, true));
  };
  window.commExportEmpCsv = function (uid) {
    if (!isMgr() && (!currentUser || String(uid) !== String(currentUser.id))) return;
    const rows = allRowsForPeriod().filter(r => String(r.p.id) === String(uid));
    const def = buildCommReportDef(rows, true);
    if (!def.csvRows.length) return showToast('لا توجد بيانات للتصدير لهذا الموظف', 'info');
    downloadCsvFile(def.filename + '.csv', def.csvHeaders, def.csvRows);
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

  window.commChangeMonth = function (m) {
    viewMonth = m;
    const bounds = monthBounds(m);
    filterFrom = bounds[0];
    filterTo = bounds[1];
    renderComm();
  };

  window.commSaveTargets = async function () {
    if (!isMgr() || busy) return;
    const amtInputs = [...document.querySelectorAll('.comm-target-input')];
    const svcInputs = [...document.querySelectorAll('.comm-svc-target-input')];
    if (!amtInputs.length && !svcInputs.length) return;

    const svcMap = Object.assign({}, svcTargetsFallback);
    svcInputs.forEach(i => {
      svcMap[i.dataset.u] = Math.max(0, parseInt(i.value, 10) || 0);
    });

    const rowsFull = amtInputs.map(i => ({
      user_id: i.dataset.u,
      month: viewMonth,
      target: parseFloat(i.value) || 0,
      services_target: svcMap[i.dataset.u] || 0,
      set_by: currentUser.id,
      updated_at: new Date().toISOString()
    }));

    busy = true;
    try {
      localStorage.setItem('tasahel_svc_targets_' + viewMonth, JSON.stringify(svcMap));
    } catch (e) {}

    let r = await sbClient.from('emp_targets').upsert(rowsFull, { onConflict: 'user_id,month' });
    if (r.error && /services_target|column|schema/i.test((r.error.message || '') + ' ' + (r.error.details || ''))) {
      const rowsBasic = amtInputs.map(i => ({
        user_id: i.dataset.u,
        month: viewMonth,
        target: parseFloat(i.value) || 0,
        set_by: currentUser.id,
        updated_at: new Date().toISOString()
      }));
      r = await sbClient.from('emp_targets').upsert(rowsBasic, { onConflict: 'user_id,month' });
    }
    try {
      const editorName = (myProfile && myProfile.full_name) || (currentUser && currentUser.email) || 'مدير';
      await sbClient.from('audit_log').insert({
        transaction_id: 'SVC_TGT_' + viewMonth,
        action: 'services_target_cfg',
        service: 'تارجت عدد الخدمات الشهري',
        user_name: editorName,
        details: svcMap
      });
    } catch (e) {}

    busy = false;
    if (r.error) return showError('تعذّر حفظ التارجت', r.error);
    showToast('تم حفظ تارجت المبلغ وتارجت عدد الخدمات بنجاح');
    renderComm();
  };

  window.commCloseMonth = async function () {
    if (!isMgr() || busy || isClosed(viewMonth)) return;
    if (!confirm('قفل ' + monthLabel(viewMonth) + '؟\nالكوميشن والتارجت هيتثبّتوا للشهر ده، ويبدأ شهر جديد من الصفر.')) return;
    busy = true;
    try {
      const bounds = monthBounds(viewMonth);
      const fresh = aggregate(await fetchRangeLines(bounds[0], bounds[1]));
      const rows = profiles.map(p => {
        const d = fresh.by.get(p.id), t = targets.find(x => x.user_id === p.id);
        return {
          month: viewMonth,
          user_id: p.id,
          full_name: p.full_name || '',
          sales: d ? d.sales : 0,
          commission: d ? d.comm : 0,
          target: t ? Number(t.target) : 0,
          lines_count: d ? d.lines : 0,
          tx_count: d ? d.tx.size : 0
        };
      });
      let r = await sbClient.from('month_snapshots').upsert(rows, { onConflict: 'month,user_id' });
      if (r.error) throw r.error;
      r = await sbClient.from('month_closures').insert({ month: viewMonth, closed_by: currentUser.id });
      if (r.error) throw r.error;
      showToast('تم قفل ' + monthLabel(viewMonth));
      viewMonth = null; filterFrom = ''; filterTo = '';
      await renderComm();
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
      viewMonth = m;
      const bounds = monthBounds(m);
      filterFrom = bounds[0]; filterTo = bounds[1];
      await renderComm();
    } catch (err) { showError('تعذّر إعادة الفتح', err); }
    busy = false;
  };

  const _lr = window.loadRecentRequests;
  window.loadRecentRequests = async function () { const x = await _lr(); if (currentTab === 'comm') renderComm(); return x; };
  const _lo = window.handleLogout;
  window.handleLogout = async function () {
    window.commCloseEmpServices();
    viewMonth = null; filterFrom = ''; filterTo = ''; filterEmpId = 'all';
    closures = []; snaps = []; targets = []; live = null;
    return _lo();
  };
})();