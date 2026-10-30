/* ===== المرحلة 8 (محدّثة): الأدوار والصلاحيات + بوابة المنفذ الخارجي المعزولة بالكامل ===== */
(function () {
  if (window.__phase8) return; window.__phase8 = true;
  const eh = escapeHtml;
  const miss = e => /42P01|42883|PGRST20[25]|does not exist|schema cache|Could not find/i.test(((e && e.message) || '') + ' ' + ((e && e.code) || ''));
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
  const kpi = (t, v, c, sub) => '<div class="card p-4"><div class="text-[11px] font-semibold text-slate-500 dark:text-slate-400">' + t + '</div><div class="mt-1 font-mono text-lg font-bold ' + (c || 'text-ink dark:text-white') + '">' + v + '</div>' + (sub ? '<div class="mt-0.5 text-[10px] text-slate-400">' + sub + '</div>' : '') + '</div>';
  const sqlHint = '<div class="card p-5 text-center space-y-2 border border-amber-300 bg-amber-50/70 dark:bg-amber-950/30 dark:border-amber-800"><div class="text-sm font-bold text-amber-900 dark:text-amber-200"><i class="fa-solid fa-database ms-1.5"></i>يلزم تفعيل دالة بوابة المنفذ الخارجي في Supabase</div><div class="text-xs text-amber-800 dark:text-amber-300">شغّل ملف <b class="font-mono">sql/partner-portal-requests.sql</b> مرة واحدة في Supabase (SQL Editor) لعرض طلبات المنفذ الخارجي.</div></div>';
  const st = {};

  function injectPartnerIsolationStyle() {
    if (document.getElementById('partner-isolation-style')) return;
    const style = document.createElement('style');
    style.id = 'partner-isolation-style';
    style.textContent = `
      body.is-partner-mode #app,
      body.is-partner-mode #login,
      body.is-partner-mode #gl-bn,
      body.is-partner-mode #gl-calc,
      body.is-partner-mode #gl-calc-fab,
      body.is-partner-mode #gl-calc-scrim,
      body.is-partner-mode #ai-fab,
      body.is-partner-mode #ai-panel,
      body.is-partner-mode #gl-siren,
      body.is-partner-mode #bk-banner,
      body.is-partner-mode #archive-bar,
      body.is-partner-mode #nav-menu,
      body.is-partner-mode #gl-scrim {
        display: none !important;
      }
      body.is-partner-mode {
        padding-bottom: 0 !important;
      }
    `;
    document.head.appendChild(style);
  }

  function normAr(s) {
    return String(s == null ? '' : s).trim().toLowerCase()
      .replace(/[أإآ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي');
  }

  function lineExecCost(l) {
    return Number(l.exec_total) || ((Number(l.exec_unit_cost) || 0) * (Number(l.qty) || 1)) || 0;
  }

  function lineSaleTotal(l) {
    return Number(l.total) || ((Number(l.unit_price) || 0) * (Number(l.qty) || 1)) || 0;
  }

  function lineDateKey(l) {
    return String(l.exec_start_date || l.received_at || '').slice(0, 10);
  }

  function formatBeneficiariesBadges(bList) {
    if (!Array.isArray(bList) || !bList.length) return '<span class="text-slate-300 dark:text-slate-600">—</span>';
    return '<div class="flex flex-wrap gap-1">' + bList.map(p =>
      '<span class="inline-flex items-center gap-1 rounded-md bg-violet-50 dark:bg-violet-950/60 border border-violet-200/70 dark:border-violet-800/70 px-2 py-0.5 text-[11px] font-semibold text-violet-700 dark:text-violet-300">' +
        '<i class="fa-solid fa-user text-[9px]"></i><span>' + eh(p.name || '') + '</span>' +
        (p.phone ? '<small class="font-mono text-[10px] text-slate-500" dir="ltr">(' + eh(p.phone) + ')</small>' : '') +
      '</span>'
    ).join('') + '</div>';
  }

  function formatBeneficiariesText(bList) {
    if (!Array.isArray(bList) || !bList.length) return '';
    return bList.map(p => (p.name || '') + (p.phone ? ' (' + p.phone + ')' : '')).filter(Boolean).join(' ، ');
  }

  function formatCommentsHtml(cList, id) {
    if (!Array.isArray(cList) || !cList.length) return '<span class="text-slate-300 dark:text-slate-600">—</span>';
    const items = cList.map(c => {
      const dt = c.created_at ? formatDateTime(c.created_at) : '';
      return '<div class="rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70 px-2.5 py-1.5 text-[11px] space-y-0.5">' +
        '<div class="flex items-center justify-between gap-2 text-[10px] text-slate-400">' +
          '<b class="text-slate-600 dark:text-slate-300">' + eh(c.author_name || 'تعليق') + '</b>' +
          '<span>' + eh(dt) + '</span>' +
        '</div>' +
        '<div class="text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words">' + eh(c.body || '') + '</div>' +
      '</div>';
    }).join('');
    if (cList.length === 1) return '<div class="min-w-[180px] max-w-[260px]">' + items + '</div>';
    return '<details class="min-w-[180px] max-w-[260px] group">' +
      '<summary class="cursor-pointer inline-flex items-center gap-1.5 rounded-lg bg-sky-50 dark:bg-sky-950/50 border border-sky-200/70 dark:border-sky-800 px-2.5 py-1 text-[11px] font-bold text-sky-700 dark:text-sky-300">' +
        '<i class="fa-regular fa-comments"></i><span>عرض التعليقات (' + cList.length + ')</span>' +
      '</summary>' +
      '<div class="mt-1.5 space-y-1.5 max-h-48 overflow-y-auto">' + items + '</div>' +
    '</details>';
  }

  function formatCommentsText(cList) {
    if (!Array.isArray(cList) || !cList.length) return '';
    return cList.map(c => (c.author_name ? c.author_name + ': ' : '') + (c.body || '')).filter(Boolean).join(' | ');
  }

  function applyFilters(s) {
    const q = normAr(s.q || '');
    const from = s.from || '';
    const to = s.to || '';
    const stFilter = s.status || 'all';
    return (s.allRows || []).filter(l => {
      const dk = lineDateKey(l);
      if (from && dk && dk < from) return false;
      if (to && dk && dk > to) return false;
      if ((from || to) && !dk) return false;
      const stVal = l.status || 'In Progress';
      if (stFilter !== 'all' && stVal !== stFilter) return false;
      if (q) {
        const benText = formatBeneficiariesText(l.beneficiaries);
        const cmtText = formatCommentsText(l.comments);
        const hay = normAr([
          l.client_name,
          l.phone,
          benText,
          l.transaction_id,
          l.service_ref,
          l.service,
          l.notes,
          cmtText
        ].join(' '));
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function renderTableAndCards(B) {
    const s = st[B];
    if (!s) return;
    const filtered = s.filtered = applyFilters(s);
    const totalExec = sum(filtered, lineExecCost);
    const totalSale = sum(filtered, lineSaleTotal);
    const inProgCount = filtered.filter(l => (l.status || 'In Progress') !== 'Complete' && (l.status || 'In Progress') !== 'Delivered').length;
    const doneCount = filtered.length - inProgCount;

    const kpiBox = document.getElementById(B + '-kpis');
    if (kpiBox) {
      kpiBox.innerHTML =
        kpi('إجمالي الطلبات المعروضة', filtered.length + ' طلب', 'text-ink dark:text-white', 'من أصل ' + (s.allRows || []).length + ' طلب مسجل') +
        kpi('قيد التنفيذ / المراجعة', inProgCount + ' طلب', 'text-amber-600 dark:text-amber-400', 'مكتمل / تم التسليم: ' + doneCount) +
        kpi('إجمالي تكلفة التنفيذ', formatCurrency(totalExec), 'text-brand-600 dark:text-violet-300', 'مجموع تكلفة تنفيذ الخدمات') +
        kpi('إجمالي أسعار الخدمات', formatCurrency(totalSale), 'text-emerald-600 dark:text-emerald-400', 'شامل العدد × سعر الخدمة');
    }

    const tbody = document.getElementById(B + '-tbody');
    const cardsBox = document.getElementById(B + '-cards');
    const countBadge = document.getElementById(B + '-count');
    if (countBadge) countBadge.textContent = 'يعرض ' + filtered.length + ' من ' + (s.allRows || []).length;

    if (tbody) {
      tbody.innerHTML = filtered.map(l => {
        const stVal = l.status || 'In Progress';
        const wa = waLink(l.phone, 'أهلاً ' + (l.client_name || '') + '، بخصوص طلبك رقم ' + (l.transaction_id || ''));
        const phHtml = l.phone
          ? '<div class="rc-phone-pill"><span>' + eh(l.phone) + '</span>' + (wa ? '<a href="' + wa + '" target="_blank" rel="noopener" class="text-emerald-600 hover:text-emerald-700 text-sm leading-none" title="واتساب"><i class="fa-brands fa-whatsapp"></i></a>' : '') + '</div>'
          : '<span class="text-slate-300">—</span>';
        const dk = lineDateKey(l);
        const startDt = dk ? formatDateOnly(dk) : '—';
        const uPrice = Number(l.unit_price) || 0;
        const uCost = Number(l.exec_unit_cost) || 0;
        const totCost = lineExecCost(l);

        return '<tr class="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 align-top">' +
          '<td class="px-3.5 py-3 font-bold text-ink dark:text-white min-w-[150px]">' +
            '<div>' + eh(l.client_name || '—') + '</div>' +
            '<div class="mt-1 flex flex-wrap items-center gap-1 font-mono text-[10.5px] text-slate-400" dir="ltr">' +
              (l.transaction_id ? '<span class="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-slate-600 dark:text-slate-300">' + eh(l.transaction_id) + '</span>' : '') +
              (l.service_ref ? '<span class="rounded bg-violet-100 dark:bg-violet-950 px-1.5 py-0.5 text-violet-700 dark:text-violet-300 font-bold">' + eh(l.service_ref) + '</span>' : '') +
            '</div>' +
          '</td>' +
          '<td class="px-3 py-3 whitespace-nowrap" dir="ltr">' + phHtml + '</td>' +
          '<td class="px-3 py-3 min-w-[150px] max-w-[220px]">' + formatBeneficiariesBadges(l.beneficiaries) + '</td>' +
          '<td class="px-3 py-3 font-semibold text-ink dark:text-white min-w-[140px]">' +
            '<div class="rc-svc-pill"><span class="rc-svc-name">' + eh(l.service || '—') + '</span><span class="rc-svc-qty" dir="ltr">×' + fmtNum(l.qty || 1) + '</span></div>' +
          '</td>' +
          '<td class="px-3 py-3 whitespace-nowrap">' + badge(stVal) + '</td>' +
          '<td class="px-3 py-3 font-mono text-xs text-slate-700 dark:text-slate-200 whitespace-nowrap">' + formatCurrency(uPrice) + '</td>' +
          '<td class="px-3 py-3 font-mono text-xs text-slate-700 dark:text-slate-200 whitespace-nowrap">' + formatCurrency(uCost) + '</td>' +
          '<td class="px-3 py-3 font-mono text-sm font-bold text-brand-600 dark:text-violet-300 whitespace-nowrap">' + formatCurrency(totCost) + '</td>' +
          '<td class="px-3 py-3 whitespace-nowrap"><span class="inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300"><i class="fa-regular fa-calendar text-[10px] text-slate-400"></i><span>' + eh(startDt) + '</span></span></td>' +
          '<td class="px-3 py-3 text-xs min-w-[150px] max-w-[240px] whitespace-pre-wrap break-words">' +
            (l.notes ? '<div class="rounded-lg bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/60 px-2.5 py-1.5 text-amber-900 dark:text-amber-200">' + eh(l.notes) + '</div>' : '<span class="text-slate-300">—</span>') +
          '</td>' +
          '<td class="px-3 py-3 text-xs">' + formatCommentsHtml(l.comments, l.id) + '</td>' +
        '</tr>';
      }).join('') || '<tr><td colspan="11" class="px-6 py-12 text-center text-slate-400">لا توجد طلبات مطابقة للفلاتر الحالية</td></tr>';
    }

    if (cardsBox) {
      cardsBox.innerHTML = filtered.map(l => {
        const stVal = l.status || 'In Progress';
        const wa = waLink(l.phone, 'أهلاً ' + (l.client_name || '') + '، بخصوص طلبك رقم ' + (l.transaction_id || ''));
        const dk = lineDateKey(l);
        const startDt = dk ? formatDateOnly(dk) : '—';
        const uPrice = Number(l.unit_price) || 0;
        const uCost = Number(l.exec_unit_cost) || 0;
        const totCost = lineExecCost(l);

        return '<div class="card p-4 space-y-2.5 text-xs">' +
          '<div class="flex items-start justify-between gap-2">' +
            '<div class="min-w-0">' +
              '<div class="font-bold text-sm text-ink dark:text-white">' + eh(l.client_name || '—') + '</div>' +
              '<div class="mt-1 flex flex-wrap items-center gap-1.5" dir="ltr">' +
                (l.transaction_id ? '<span class="rc-tx-pill !py-0.5 !px-2 !text-[11px]">' + eh(l.transaction_id) + '</span>' : '') +
                (l.service_ref ? '<span class="rounded-md bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 px-2 py-0.5 font-mono text-[11px] font-bold">' + eh(l.service_ref) + '</span>' : '') +
                (l.phone ? '<span class="rc-phone-pill !py-0.5 !px-2 !text-[11px]"><span>' + eh(l.phone) + '</span>' + (wa ? '<a href="' + wa + '" target="_blank" rel="noopener" class="text-emerald-600"><i class="fa-brands fa-whatsapp"></i></a>' : '') + '</span>' : '') +
              '</div>' +
            '</div>' +
            '<div class="shrink-0">' + badge(stVal) + '</div>' +
          '</div>' +
          (Array.isArray(l.beneficiaries) && l.beneficiaries.length ? '<div><span class="text-[10.5px] text-slate-400 block mb-1">المستفيدون:</span>' + formatBeneficiariesBadges(l.beneficiaries) + '</div>' : '') +
          '<div class="rc-svc-pill w-full"><span class="rc-svc-name">' + eh(l.service || '—') + '</span><span class="rc-svc-qty" dir="ltr">×' + fmtNum(l.qty || 1) + '</span></div>' +
          '<div class="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px]">' +
            '<div><span class="text-slate-400 block">السعر</span><b class="font-mono text-ink dark:text-white">' + formatCurrency(uPrice) + '</b></div>' +
            '<div><span class="text-slate-400 block">تكلفة الخدمة</span><b class="font-mono text-ink dark:text-white">' + formatCurrency(uCost) + '</b></div>' +
            '<div><span class="text-slate-400 block">إجمالي التنفيذ</span><b class="font-mono text-brand-600 dark:text-violet-300">' + formatCurrency(totCost) + '</b></div>' +
          '</div>' +
          (l.notes ? '<div class="rounded-lg bg-amber-50 dark:bg-amber-950/30 px-2.5 py-1.5 text-[11px] text-amber-900 dark:text-amber-200 whitespace-pre-wrap break-words"><i class="fa-solid fa-note-sticky ms-1"></i><b>ملاحظات:</b> ' + eh(l.notes) + '</div>' : '') +
          (Array.isArray(l.comments) && l.comments.length ? '<div><span class="text-[10.5px] text-slate-400 block mb-1">التعليقات على الطلب:</span>' + formatCommentsHtml(l.comments, l.id) + '</div>' : '') +
          '<div class="flex items-center justify-between text-[11px] text-slate-400 pt-1">' +
            '<span>تاريخ التنفيذ: ' + eh(startDt) + '</span>' +
          '</div>' +
        '</div>';
      }).join('') || '<div class="card p-6 text-center text-slate-400 text-xs">لا توجد طلبات مطابقة للفلاتر الحالية</div>';
    }
  }

  /* ---------- عرض طلبات المنفذ الخارجي (مشترك: المنفذ + المدير) ---------- */
  async function opsView(box, pid, mgr, fallbackName) {
    if (!box) return;
    const B = box.id || 'p8-box';
    const s = st[B] = st[B] || { q: '', from: '', to: '', status: 'all', allRows: [], filtered: [] };
    s.pid = pid;
    s.mgr = mgr;
    s.reload = () => opsView(box, pid, mgr, fallbackName);

    box.innerHTML = '<div class="card p-8 text-center text-xs text-slate-400"><i class="fa-solid fa-spinner fa-spin ms-1.5"></i>جارٍ تحميل الطلبات المسندة للمنفذ...</div>';

    let rows = null, partnerName = fallbackName || '';
    const rpcRes = await sbClient.rpc('get_partner_requests', { p_partner_uid: mgr ? pid : null });

    if (!rpcRes.error && rpcRes.data) {
      partnerName = rpcRes.data.partner_name || partnerName;
      rows = rpcRes.data.lines || [];
    } else if (mgr && typeof allRequestLines !== 'undefined' && allRequestLines.length && partnerName) {
      // احتياطي للمدير من الذاكرة لو لسه مشغلش ملف الـ SQL
      rows = allRequestLines.filter(l => String(l.executor || '').trim() === String(partnerName).trim()).map(l => ({
        id: l.id,
        transaction_id: l.transaction_id,
        service_ref: l.service_ref,
        client_name: l.client_name,
        phone: l.phone,
        service: l.service,
        qty: l.qty,
        unit_price: l.unit_price,
        total: l.total,
        exec_unit_cost: l.exec_unit_cost,
        exec_total: execCostOf(l),
        executor: l.executor,
        status: l.status || 'In Progress',
        received_at: l.received_at,
        exec_start_date: l.exec_start_date || dayKey(lineDate(l)),
        notes: l.notes,
        beneficiaries: typeof window.getRequestPeople === 'function' ? window.getRequestPeople(l.transaction_id).filter(p => !p.line_id || String(p.line_id) === String(l.id)) : [],
        comments: []
      }));
    } else {
      box.innerHTML = miss(rpcRes.error) ? sqlHint : '<div class="card p-5 text-center text-xs text-rose-500">تعذّر تحميل الطلبات: ' + eh((rpcRes.error && rpcRes.error.message) || 'خطأ غير معروف') + '</div>';
      return;
    }

    s.allRows = rows;
    s.partnerName = partnerName;
    const JB = JSON.stringify(B);

    box.innerHTML =
      '<div id="' + B + '-kpis" class="grid grid-cols-2 gap-3 lg:grid-cols-4"></div>' +
      '<div class="card p-4 space-y-3">' +
        '<div class="flex flex-wrap items-center justify-between gap-2">' +
          '<div class="text-sm font-bold text-ink dark:text-white"><i class="fa-solid fa-filter ms-1.5 text-brand-600"></i>البحث وتصفية الطلبات' + (partnerName ? ' — <span class="text-brand-600 dark:text-violet-300">' + eh(partnerName) + '</span>' : '') + '</div>' +
          '<div class="flex flex-wrap items-center gap-2">' +
            '<span id="' + B + '-count" class="text-xs font-semibold text-slate-400"></span>' +
            '<button type="button" onclick=\'p8.reload(' + JB + ')\' class="rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200"><i class="fa-solid fa-rotate ms-1"></i>تحديث</button>' +
            '<button type="button" onclick=\'p8.csv(' + JB + ')\' class="rounded-xl bg-emerald-600 hover:bg-emerald-700 px-3.5 py-2 text-xs font-bold text-white shadow-sm"><i class="fa-solid fa-file-excel ms-1.5"></i>تصدير Excel (CSV)</button>' +
          '</div>' +
        '</div>' +
        '<div class="grid grid-cols-1 gap-3 sm:grid-cols-12 items-end">' +
          '<div class="sm:col-span-5">' +
            '<label class="label">بحث باسم العميل أو المستفيد أو التليفون أو الخدمة</label>' +
            '<div class="relative">' +
              '<input id="' + B + '-q" type="search" value="' + eh(s.q) + '" oninput=\'p8.setFilter(' + JB + ',"q",this.value)\' placeholder="ابحث باسم العميل، المستفيد، رقم التليفون، رقم الطلب..." class="field pe-8 text-xs">' +
              '<i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none"></i>' +
            '</div>' +
          '</div>' +
          '<div class="sm:col-span-2">' +
            '<label class="label">من تاريخ</label>' +
            '<input id="' + B + '-from" type="date" value="' + eh(s.from) + '" onchange=\'p8.setFilter(' + JB + ',"from",this.value)\' class="field font-mono text-xs">' +
          '</div>' +
          '<div class="sm:col-span-2">' +
            '<label class="label">إلى تاريخ</label>' +
            '<input id="' + B + '-to" type="date" value="' + eh(s.to) + '" onchange=\'p8.setFilter(' + JB + ',"to",this.value)\' class="field font-mono text-xs">' +
          '</div>' +
          '<div class="sm:col-span-2">' +
            '<label class="label">حالة الطلب</label>' +
            '<select id="' + B + '-status" onchange=\'p8.setFilter(' + JB + ',"status",this.value)\' class="field text-xs">' +
              '<option value="all"' + (s.status === 'all' ? ' selected' : '') + '>كل الحالات</option>' +
              '<option value="In Progress"' + (s.status === 'In Progress' ? ' selected' : '') + '>قيد التنفيذ</option>' +
              '<option value="Under Review"' + (s.status === 'Under Review' ? ' selected' : '') + '>قيد المراجعة</option>' +
              '<option value="Complete"' + (s.status === 'Complete' ? ' selected' : '') + '>جاهز للتسليم</option>' +
              '<option value="Delivered"' + (s.status === 'Delivered' ? ' selected' : '') + '>تم التسليم</option>' +
            '</select>' +
          '</div>' +
          '<div class="sm:col-span-1">' +
            '<button type="button" onclick=\'p8.clearFilters(' + JB + ')\' class="w-full rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-300" title="مسح الفلاتر">مسح</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="card overflow-hidden hidden md:block">' +
        '<div class="overflow-x-auto">' +
          '<table class="w-full text-right text-xs">' +
            '<thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-100 dark:border-slate-800">' +
              '<tr>' +
                '<th class="px-3.5 py-3">العميل / رقم الطلب</th>' +
                '<th class="px-3 py-3">رقم التليفون</th>' +
                '<th class="px-3 py-3">المستفيدون</th>' +
                '<th class="px-3 py-3">الخدمة والعدد</th>' +
                '<th class="px-3 py-3">الحالة</th>' +
                '<th class="px-3 py-3">السعر</th>' +
                '<th class="px-3 py-3">تكلفة التنفيذ للوحدة</th>' +
                '<th class="px-3 py-3">إجمالي التنفيذ</th>' +
                '<th class="px-3 py-3">التاريخ</th>' +
                '<th class="px-3 py-3">الملاحظات</th>' +
                '<th class="px-3 py-3">التعليقات</th>' +
              '</tr>' +
            '</thead>' +
            '<tbody id="' + B + '-tbody" class="divide-y divide-slate-100 dark:divide-slate-800"></tbody>' +
          '</table>' +
        '</div>' +
      '</div>' +
      '<div id="' + B + '-cards" class="space-y-3 md:hidden"></div>';

    renderTableAndCards(B);
  }

  window.p8 = {
    setFilter: (b, k, v) => {
      if (!st[b]) return;
      st[b][k] = v;
      renderTableAndCards(b);
    },
    clearFilters: b => {
      const s = st[b];
      if (!s) return;
      s.q = ''; s.from = ''; s.to = ''; s.status = 'all';
      const qEl = document.getElementById(b + '-q'); if (qEl) qEl.value = '';
      const fEl = document.getElementById(b + '-from'); if (fEl) fEl.value = '';
      const tEl = document.getElementById(b + '-to'); if (tEl) tEl.value = '';
      const sEl = document.getElementById(b + '-status'); if (sEl) sEl.value = 'all';
      renderTableAndCards(b);
    },
    reload: b => {
      if (st[b] && typeof st[b].reload === 'function') st[b].reload();
    },
    csv: b => {
      const s = st[b];
      if (!s) return;
      const rows = s.filtered || [];
      if (!rows.length) return showToast('لا توجد بيانات لتصديرها', 'info');
      const headers = [
        'اسم العميل',
        'رقم التليفون',
        'المستفيدون',
        'رقم الطلب (Request ID)',
        'رقم الخدمة (Service ID)',
        'الخدمة',
        'العدد',
        'الحالة',
        'السعر',
        'تكلفة التنفيذ للخدمة الواحدة',
        'إجمالي التنفيذ',
        'التاريخ',
        'الملاحظات',
        'التعليقات على الطلب'
      ];
      const data = rows.map(l => [
        l.client_name || '',
        l.phone || '',
        formatBeneficiariesText(l.beneficiaries),
        l.transaction_id || '',
        l.service_ref || '',
        l.service || '',
        Number(l.qty) || 1,
        statusLabel(l.status || 'In Progress'),
        Number(l.unit_price) || 0,
        Number(l.exec_unit_cost) || 0,
        lineExecCost(l),
        lineDateKey(l),
        l.notes || '',
        formatCommentsText(l.comments)
      ]);
      const pName = (s.partnerName || 'المنفذ').replace(/\s+/g, '_');
      const today = new Date().toISOString().slice(0, 10);
      downloadCsvFile('طلبات_' + pName + '_' + today + '.csv', headers, data);
    }
  };

  /* ---------- واجهة المنفذ الخارجي (شاشة كاملة معزولة تماماً) ---------- */
  function overlay(inner) {
    injectPartnerIsolationStyle();
    document.body.classList.add('is-partner-mode');
    $('app').classList.add('hidden');
    $('login').classList.add('hidden');
    let o = $('partner-app');
    if (!o) {
      o = document.createElement('div');
      o.id = 'partner-app';
      o.className = 'fixed inset-0 z-[120] overflow-y-auto bg-slate-50 dark:bg-slate-950';
      document.body.appendChild(o);
    }
    o.classList.remove('hidden');
    o.innerHTML = inner;
    return o;
  }

  const logout = '<button type="button" onclick="handleLogout()" class="rounded-xl bg-white/10 hover:bg-white/20 px-3.5 py-2 text-xs font-semibold text-white transition"><i class="fa-solid fa-right-from-bracket ms-1.5"></i>تسجيل الخروج</button>';

  function showPartner(name, uid) {
    overlay(
      '<header class="bg-[#0b1b33] shadow-md sticky top-0 z-20">' +
        '<div class="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3.5">' +
          '<div class="flex items-center gap-3">' +
            '<span class="rounded-xl bg-white px-2 py-1.5">' + logo-transparentImg(30) + '</span>' +
            '<div>' +
              '<div class="text-[11px] font-semibold text-emerald-300">بوابة المنفذ الخارجي</div>' +
              '<div class="text-base font-bold text-white">' + eh(name || 'منفذ خارجي') + '</div>' +
            '</div>' +
          '</div>' +
          logout +
        '</div>' +
      '</header>' +
      '<main id="p8-main" class="mx-auto max-w-7xl space-y-4 px-4 py-5"></main>'
    );
    opsView($('p8-main'), uid, false, name);
  }

  const _sl = window.showLoginScreen;
  window.showLoginScreen = function () {
    document.body.classList.remove('is-partner-mode');
    const o = $('partner-app');
    if (o) o.classList.add('hidden');
    return _sl.apply(this, arguments);
  };

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
    document.body.classList.remove('is-partner-mode');
    if (!err && !role) {
      overlay('<div class="mx-auto mt-24 max-w-sm space-y-4 p-6 text-center"><i class="fa-solid fa-lock text-4xl text-slate-400"></i><div class="font-bold text-ink dark:text-white">الحساب ده لسه متفعّلش</div><div class="text-xs text-slate-500">كلّم المدير يفعّل حسابك.</div><div class="inline-block rounded-xl bg-[#0b1b33] p-0.5">' + logout + '</div></div>');
      return;
    }
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
    const r = await sbClient.rpc('list_partners'); if (r.error) { root.innerHTML = sqlHint; return; }
    const ps = r.data || []; if (!ps.some(p => p.user_id === cur)) cur = ps[0] ? ps[0].user_id : null;
    const curObj = ps.find(p => p.user_id === cur);
    root.innerHTML =
      '<div class="card space-y-3 p-4">' +
        '<div class="text-sm font-bold text-ink dark:text-white"><i class="fa-solid fa-user-plus ms-1.5"></i>إدارة حسابات المنفذين الخارجيين</div>' +
        '<p class="text-[11px] text-slate-500">1) اعمل الحساب الأول من Supabase (Authentication ← Add user)، وبعدين اربطه هنا بالإيميل واسم المنفذ بالظبط زي ما بتكتبه في خانة (المنفذ) داخل الطلبات.</p>' +
        '<form onsubmit="p8.assign(event)" class="flex flex-wrap items-end gap-2">' +
          '<input name="e" type="email" dir="ltr" required placeholder="إيميل الحساب" class="field !w-56 !py-2 text-xs">' +
          '<input name="n" required placeholder="اسم المنفذ (مثال: سعد)" class="field !w-44 !py-2 text-xs">' +
          '<select name="r" class="field !w-36 !py-2 text-xs"><option value="partner">منفذ خارجي</option><option value="staff">موظف داخلي</option></select>' +
          '<button class="rounded-lg bg-brand-500 px-4 py-2 text-xs font-bold text-slate-950">ربط الحساب</button>' +
        '</form>' +
      '</div>' +
      (ps.length
        ? '<div class="card flex flex-wrap items-center justify-between gap-2 p-3">' +
            '<div class="flex flex-wrap items-center gap-2">' +
              '<label class="text-xs font-semibold">معاينة شاشة المنفذ:</label>' +
              '<select onchange="p8.pick(this.value)" class="field !w-64 !py-2 text-xs">' +
                ps.map(p => '<option value="' + p.user_id + '"' + (p.user_id === cur ? ' selected' : '') + '>' + eh((p.partner_name || 'بدون اسم') + ' (' + p.email + ')') + '</option>').join('') +
              '</select>' +
            '</div>' +
            '<button type="button" onclick="p8.remove()" class="rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600 dark:bg-rose-950/40"><i class="fa-solid fa-user-slash ms-1"></i>إيقاف الحساب</button>' +
          '</div>' +
          '<div id="p8-mgr" class="space-y-4"></div>'
        : '<div class="card p-6 text-center text-xs text-slate-400">لا يوجد منفذون خارجيون مربوطون حالياً</div>');
    if (cur) opsView($('p8-mgr'), cur, true, curObj && curObj.partner_name);
  }
  p8.pick = v => { cur = v; renderPartners(); };
  p8.assign = async e => {
    e.preventDefault(); const f = e.target.elements;
    const r = await sbClient.rpc('assign_role', { p_email: f.e.value.trim(), p_role: f.r.value, p_name: f.n.value.trim() || null });
    if (r.error) return showToast(/no such account/.test(r.error.message) ? 'مفيش حساب بالإيميل ده في Supabase' : 'تعذّر الربط: ' + r.error.message, 'error', 8000);
    showToast('تم ربط حساب المنفذ بنجاح'); renderPartners();
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
  const _st = window.switchTab;
  window.switchTab = function (id) {
    const r = _st.apply(this, arguments);
    const b = $b(), tb = document.getElementById('tab-' + id + '-btn');
    if (b) b.className = (tb && tb.closest('#nav-menu')) ? act : idle;
    return r;
  };
  function dot() { const d = document.getElementById('menu-dot'); if (d) d.classList.toggle('hidden', !document.querySelector('#nav-menu #late-badge:not(.hidden), #nav-menu #tk-badge:not(.hidden)')); }
  setInterval(dot, 2000);
})();
