/* ===== المرحلة 8 (محدثة وتفاعلية بالكامل): بوابة المنفذ الخارجي المعزولة ===== */
(function () {
  if (window.__phase8) return; window.__phase8 = true;
  const eh = escapeHtml;
  const miss = e => /42P01|42883|PGRST20[25]|does not exist|schema cache|Could not find/i.test(((e && e.message) || '') + ' ' + ((e && e.code) || ''));
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
  const sqlHint = '<div class="card p-5 text-center space-y-2 border border-amber-300 bg-amber-50/70 dark:bg-amber-950/30 dark:border-amber-800"><div class="text-sm font-bold text-amber-900 dark:text-amber-200"><i class="fa-solid fa-database ms-1.5"></i>يلزم تفعيل دوال بوابة المنفذ الخارجي في Supabase</div><div class="text-xs text-amber-800 dark:text-amber-300">شغّل ملف <b class="font-mono">sql/partner-portal-requests.sql</b> مرة واحدة في Supabase (SQL Editor) لتفعيل البوابة التفاعلية.</div></div>';
  const st = {};
  const PAGE = 20;   /* عدد الطلبات في كل دفعة تحميل */

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
      .partner-kpi-clickable {
        transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
        cursor: pointer;
        user-select: none;
      }
      .partner-kpi-clickable:hover {
        transform: translateY(-2px);
        box-shadow: 0 10px 20px -5px rgba(0, 0, 0, 0.08);
      }
      .partner-kpi-clickable.is-active {
        border-color: #6366f1 !important;
        box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.3) !important;
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

  function partnerRefundInfo(s, lineId, lineQty) {
    const map = s && s.refundsByLine;
    const arr = map && map.get(String(lineId));
    if (!arr || !arr.length) return null;
    let qty = 0, execForfeited = 0, hasFull = false;
    arr.forEach(r => {
      qty += Math.max(0, Number(r.qty) || 0);
      if (r.kind === 'full') hasFull = true;
      if (r.exec_forfeit) execForfeited += Math.max(0, Number(r.exec_amount) || 0);
    });
    const origQ = Math.max(1, Number(lineQty) || 1);
    const isFull = hasFull || qty >= origQ;
    return { isFull: isFull, qty: qty, origQty: origQ, execForfeited: execForfeited, list: arr };
  }

  function partnerRefundBadgeHtml(s, l) {
    const rf = partnerRefundInfo(s, l.id, l.qty);
    if (!rf) return '';
    if (rf.isFull) {
      return '<span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap" style="background:rgba(255,107,107,.16);color:var(--r-bad,#ff6b6b);border:1px solid rgba(255,107,107,.38)"><i class="fa-solid fa-rotate-left"></i><span>مسترد كليًا</span></span>';
    }
    return '<span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap" style="background:rgba(255,157,108,.16);color:var(--r-acc,#ff9d6c);border:1px solid rgba(255,157,108,.38)"><i class="fa-solid fa-rotate-left"></i><span>مسترد جزئيًا (' + fmtNum(rf.qty) + ' من ' + fmtNum(rf.origQty) + ')</span></span>';
  }

  function lineExecCost(l, sRef) {
    const base = Number(l.exec_total) || ((Number(l.exec_unit_cost) || 0) * (Number(l.qty) || 1)) || 0;
    const rf = sRef ? partnerRefundInfo(sRef, l.id, l.qty) : (l._rfInfo || null);
    if (!rf || !(rf.execForfeited > 0)) return base;
    return Math.max(0, base - rf.execForfeited);
  }

  function lineDateKey(l) {
    return String(l.exec_start_date || l.received_at || '').slice(0, 10);
  }

  function isLineLatePartner(l) {
    if (!l) return false;
    const stVal = l.status || 'In Progress';
    if (stVal === 'Delivered' || stVal === 'Complete') return false;
    const dur = Number(l.duration_days) || 0;
    if (dur <= 0) return false;
    const baseStr = lineDateKey(l);
    if (!baseStr) return false;
    const baseDate = new Date(baseStr + 'T00:00:00');
    if (isNaN(baseDate.getTime())) return false;
    const dueTime = baseDate.getTime() + dur * 86400000;
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    return todayStart.getTime() > dueTime;
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

  function formatCommentsSnippet(cList, tx, B) {
    if (!Array.isArray(cList) || !cList.length) {
      return '<button type="button" onclick=\'p8.openDetail(' + JSON.stringify(B) + ',' + JSON.stringify(tx) + ')\' class="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600 hover:text-brand-700 hover:underline"><i class="fa-solid fa-comment-dots"></i><span>إضافة تعليق</span></button>';
    }
    const last = cList[cList.length - 1];
    return '<div class="space-y-1 min-w-[160px] max-w-[240px]">' +
      '<button type="button" onclick=\'p8.openDetail(' + JSON.stringify(B) + ',' + JSON.stringify(tx) + ')\' class="text-start block w-full rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70 p-2 text-[11px] hover:border-brand-500 transition">' +
        '<div class="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">' +
          '<b class="text-slate-600 dark:text-slate-300 truncate">' + eh(last.author_name || 'تعليق') + '</b>' +
          '<span class="text-[9.5px]">' + eh(formatDateOnly(last.created_at)) + '</span>' +
        '</div>' +
        '<div class="text-slate-700 dark:text-slate-300 truncate">' + eh(last.body || '') + '</div>' +
      '</button>' +
      (cList.length > 1 ? '<button type="button" onclick=\'p8.openDetail(' + JSON.stringify(B) + ',' + JSON.stringify(tx) + ')\' class="text-[10.5px] text-brand-600 hover:underline font-semibold block">سجل التعليقات (' + cList.length + ')</button>' : '') +
    '</div>';
  }

  function formatCommentsText(cList) {
    if (!Array.isArray(cList) || !cList.length) return '';
    return cList.map(c => (c.author_name ? c.author_name + ': ' : '') + (c.body || '')).filter(Boolean).join(' | ');
  }

  function applyFilters(s) {
    const q = normAr(s.q || '');
    const from = s.from || '';
    const to = s.to || '';
    const quick = s.quickFilter || 'all';

    return (s.allRows || []).filter(l => {
      const dk = lineDateKey(l);
      if (from && dk && dk < from) return false;
      if (to && dk && dk > to) return false;
      if ((from || to) && !dk) return false;

      const stVal = l.status || 'In Progress';
      const isLate = isLineLatePartner(l);

      if (quick === 'in_progress') {
        if (stVal !== 'In Progress') return false;
      } else if (quick === 'under_review') {
        if (stVal !== 'Under Review') return false;
      } else if (quick === 'pending_or_review') {
        if (stVal !== 'In Progress' && stVal !== 'Under Review') return false;
      } else if (quick === 'late') {
        if (!isLate) return false;
      } else if (quick === 'complete') {
        if (stVal !== 'Complete' && stVal !== 'Delivered') return false;
      }

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
    const all = s.allRows || [];
    const filtered = s.filtered = applyFilters(s);
    all.forEach(l => { l._rfInfo = partnerRefundInfo(s, l.id, l.qty); });
    const totalExec = sum(filtered, l => lineExecCost(l, s));
    const totalAllExec = sum(all, l => lineExecCost(l, s));

    const inProgCount = all.filter(l => (l.status || 'In Progress') === 'In Progress').length;
    const reviewCount = all.filter(l => (l.status || 'In Progress') === 'Under Review').length;
    const lateCount = all.filter(isLineLatePartner).length;
    const completeCount = all.filter(l => (l.status || 'In Progress') === 'Complete' || (l.status || 'In Progress') === 'Delivered').length;

    const qk = s.quickFilter || 'all';
    const JB = JSON.stringify(B);

    const kpiBox = document.getElementById(B + '-kpis');
    if (kpiBox) {
      kpiBox.innerHTML =
        '<div onclick=\'p8.setQuickFilter(' + JB + ',"all")\' class="card p-4 partner-kpi-clickable ' + (qk === 'all' ? 'is-active' : '') + '">' +
          '<div class="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">' +
            '<span>إجمالي كل الطلبات</span>' +
            '<i class="fa-solid fa-list-check text-slate-400"></i>' +
          '</div>' +
          '<div class="mt-1 font-mono text-2xl font-bold text-ink dark:text-white">' + all.length + '</div>' +
          '<div class="mt-0.5 text-[10.5px] text-slate-400">انقر لعرض كل الطلبات المسندة</div>' +
        '</div>' +

        '<div onclick=\'p8.setQuickFilter(' + JB + ',"pending_or_review")\' class="card p-4 partner-kpi-clickable ' + (qk === 'pending_or_review' ? 'is-active' : '') + '">' +
          '<div class="flex items-center justify-between text-[11px] font-semibold text-amber-700 dark:text-amber-300">' +
            '<span>قيد التنفيذ والمراجعة</span>' +
            '<i class="fa-solid fa-hourglass-half text-amber-500"></i>' +
          '</div>' +
          '<div class="mt-1 font-mono text-2xl font-bold text-amber-600 dark:text-amber-400">' + (inProgCount + reviewCount) + '</div>' +
          '<div class="mt-0.5 text-[10.5px] text-slate-500">' + inProgCount + ' جاري · ' + reviewCount + ' وقفت استيفاء (مراجعة)</div>' +
        '</div>' +

        '<div onclick=\'p8.setQuickFilter(' + JB + ',"late")\' class="card p-4 partner-kpi-clickable ' + (qk === 'late' ? 'is-active' : '') + '">' +
          '<div class="flex items-center justify-between text-[11px] font-semibold text-rose-700 dark:text-rose-300">' +
            '<span>طلبات متأخرة</span>' +
            '<i class="fa-solid fa-triangle-exclamation text-rose-500"></i>' +
          '</div>' +
          '<div class="mt-1 font-mono text-2xl font-bold text-rose-600 dark:text-rose-400">' + lateCount + '</div>' +
          '<div class="mt-0.5 text-[10.5px] text-slate-500">تجاوزت مدة التنفيذ المحددة</div>' +
        '</div>' +

        '<div onclick=\'p8.setQuickFilter(' + JB + ',"complete")\' class="card p-4 partner-kpi-clickable ' + (qk === 'complete' ? 'is-active' : '') + '">' +
          '<div class="flex items-center justify-between text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">' +
            '<span>جاهز للتسليم / مكتمل</span>' +
            '<i class="fa-solid fa-circle-check text-emerald-500"></i>' +
          '</div>' +
          '<div class="mt-1 font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-400">' + completeCount + '</div>' +
          '<div class="mt-0.5 text-[10.5px] text-slate-500">إجمالي مستحقات التنفيذ: ' + formatCurrency(totalAllExec) + '</div>' +
        '</div>';
    }

    const tbody = document.getElementById(B + '-tbody');
    const cardsBox = document.getElementById(B + '-cards');
    const countBadge = document.getElementById(B + '-count');
    if (countBadge) countBadge.textContent = 'معروض ' + filtered.length + ' — تم تحميل ' + all.length + (s.total != null ? ' من ' + s.total : '') + ' طلب' + (s.hasMore && (s.q || s.from || s.to || (s.quickFilter && s.quickFilter !== 'all')) ? ' (البحث والفلاتر على المحمّل فقط)' : '');
    const moreBox = document.getElementById(B + '-more');
    if (moreBox) {
      moreBox.innerHTML = s.hasMore
        ? '<button type="button" onclick=\'p8.loadMore(' + JB + ')\' ' + (s.loadingMore ? 'disabled' : '') + ' class="p8-more-btn"><i class="fa-solid ' + (s.loadingMore ? 'fa-spinner fa-spin' : 'fa-angles-down') + ' ms-1.5"></i>' + (s.loadingMore ? 'جارٍ التحميل...' : 'تحميل المزيد') + '</button>'
        : (all.length > PAGE ? '<div class="text-[11px] text-slate-400 py-2">تم عرض كل الطلبات</div>' : '');
    }

    const costBadge = document.getElementById(B + '-cost-sum');
    if (costBadge) costBadge.textContent = formatCurrency(totalExec);

    if (tbody) {
      tbody.innerHTML = filtered.map(l => {
        const stVal = l.status || 'In Progress';
        const wa = waLink(l.phone, 'أهلاً ' + (l.client_name || '') + '، بخصوص طلبك رقم ' + (l.transaction_id || ''));
        const phHtml = l.phone
          ? '<div class="rc-phone-pill"><span>' + eh(l.phone) + '</span>' + (wa ? '<a href="' + wa + '" target="_blank" rel="noopener" class="text-emerald-600 hover:text-emerald-700 text-sm leading-none" title="واتساب"><i class="fa-brands fa-whatsapp"></i></a>' : '') + '</div>'
          : '<span class="text-slate-300">—</span>';
        const dk = lineDateKey(l);
        const startDt = dk ? formatDateOnly(dk) : '—';
        const uCost = Number(l.exec_unit_cost) || 0;
        const totCost = lineExecCost(l);
        const isLate = isLineLatePartner(l);

        return '<tr class="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 align-top cursor-pointer" onclick=\'p8.openDetail(' + JB + ',' + JSON.stringify(l.transaction_id) + ',' + JSON.stringify(l.id) + ')\'>' +
          '<td class="px-3.5 py-3 font-bold text-ink dark:text-white min-w-[150px]">' +
            '<div class="hover:text-brand-600 hover:underline flex items-center gap-1.5">' +
              '<span>' + eh(l.client_name || '—') + '</span>' +
              '<i class="fa-solid fa-up-right-from-square text-[9.5px] text-slate-400"></i>' +
            '</div>' +
            '<div class="mt-1 flex flex-wrap items-center gap-1 font-mono text-[10.5px] text-slate-400" dir="ltr">' +
              (l.transaction_id ? '<span class="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-slate-600 dark:text-slate-300 font-bold">' + eh(l.transaction_id) + '</span>' : '') +
              (l.service_ref ? '<span class="rounded bg-violet-100 dark:bg-violet-950 px-1.5 py-0.5 text-violet-700 dark:text-violet-300 font-bold">' + eh(l.service_ref) + '</span>' : '') +
            '</div>' +
          '</td>' +
          '<td class="px-3 py-3 min-w-[150px] max-w-[210px]" onclick="event.stopPropagation()">' + formatBeneficiariesBadges(l.beneficiaries) + '</td>' +
          '<td class="px-3 py-3 whitespace-nowrap" dir="ltr" onclick="event.stopPropagation()">' + phHtml + '</td>' +
          '<td class="px-3 py-3 font-semibold text-ink dark:text-white min-w-[140px]">' +
            '<div class="rc-svc-pill"><span class="rc-svc-name">' + eh(l.service || '—') + '</span></div>' +
            (l._rfInfo ? '<div class="mt-1">' + partnerRefundBadgeHtml(s, l) + '</div>' : '') +
          '</td>' +
          '<td class="px-3 py-3 text-center font-mono font-bold whitespace-nowrap" dir="ltr">×' + fmtNum(l.qty || 1) + '</td>' +
          '<td class="px-3 py-3 whitespace-nowrap">' +
            badge(stVal) +
            (isLate ? '<div class="mt-1"><span class="rounded-full bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 px-2 py-0.5 text-[10px] font-bold"><i class="fa-solid fa-clock ms-1"></i>متأخر</span></div>' : '') +
          '</td>' +
          '<td class="px-3 py-3 font-mono text-xs text-slate-700 dark:text-slate-200 whitespace-nowrap">' + formatCurrency(uCost) + '</td>' +
          '<td class="px-3 py-3 font-mono text-sm font-bold text-brand-600 dark:text-violet-300 whitespace-nowrap">' + formatCurrency(totCost) + '</td>' +
          '<td class="px-3 py-3 whitespace-nowrap"><span class="inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 px-2 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300"><i class="fa-regular fa-calendar text-[10px] text-slate-400"></i><span>' + eh(startDt) + '</span></span></td>' +
          '<td class="px-3 py-3 text-xs min-w-[140px] max-w-[220px] whitespace-pre-wrap break-words">' +
            (l.notes ? '<div class="rounded-lg bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/60 px-2 py-1 text-amber-900 dark:text-amber-200 text-[11px]">' + eh(l.notes) + '</div>' : '<span class="text-slate-300">—</span>') +
          '</td>' +
          '<td class="px-3 py-3 text-xs" onclick="event.stopPropagation()">' + formatCommentsSnippet(l.comments, l.transaction_id, B) + '</td>' +
        '</tr>';
      }).join('') || '<tr><td colspan="11" class="px-6 py-12 text-center text-slate-400">لا توجد طلبات مطابقة للفلاتر الحالية</td></tr>';
    }

    if (cardsBox) {
      cardsBox.innerHTML = filtered.map(l => {
        const stVal = l.status || 'In Progress';
        const wa = waLink(l.phone, 'أهلاً ' + (l.client_name || '') + '، بخصوص طلبك رقم ' + (l.transaction_id || ''));
        const dk = lineDateKey(l);
        const startDt = dk ? formatDateOnly(dk) : '—';
        const uCost = Number(l.exec_unit_cost) || 0;
        const totCost = lineExecCost(l);
        const isLate = isLineLatePartner(l);

        return '<div class="card p-4 space-y-2.5 text-xs hover:border-brand-500 transition cursor-pointer" onclick=\'p8.openDetail(' + JB + ',' + JSON.stringify(l.transaction_id) + ',' + JSON.stringify(l.id) + ')\'>' +
          '<div class="flex items-start justify-between gap-2">' +
            '<div class="min-w-0">' +
              '<div class="font-bold text-sm text-ink dark:text-white flex items-center gap-1.5">' +
                '<span>' + eh(l.client_name || '—') + '</span>' +
                '<i class="fa-solid fa-up-right-from-square text-[10px] text-slate-400"></i>' +
              '</div>' +
              '<div class="mt-1 flex flex-wrap items-center gap-1.5" dir="ltr">' +
                (l.transaction_id ? '<span class="rc-tx-pill !py-0.5 !px-2 !text-[11px] font-bold">' + eh(l.transaction_id) + '</span>' : '') +
                (l.service_ref ? '<span class="rounded-md bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 px-2 py-0.5 font-mono text-[11px] font-bold">' + eh(l.service_ref) + '</span>' : '') +
                (l.phone ? '<span class="rc-phone-pill !py-0.5 !px-2 !text-[11px]" onclick="event.stopPropagation()"><span>' + eh(l.phone) + '</span>' + (wa ? '<a href="' + wa + '" target="_blank" rel="noopener" class="text-emerald-600"><i class="fa-brands fa-whatsapp"></i></a>' : '') + '</span>' : '') +
              '</div>' +
            '</div>' +
            '<div class="shrink-0 flex flex-col items-end gap-1">' +
              badge(stVal) +
              partnerRefundBadgeHtml(s, l) +
              (isLate ? '<span class="rounded-full bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 px-2 py-0.5 text-[10px] font-bold"><i class="fa-solid fa-clock ms-1"></i>متأخر</span>' : '') +
            '</div>' +
          '</div>' +
          (Array.isArray(l.beneficiaries) && l.beneficiaries.length ? '<div><span class="text-[10.5px] text-slate-400 block mb-1">المستفيدون:</span>' + formatBeneficiariesBadges(l.beneficiaries) + '</div>' : '') +
          '<div class="rc-svc-pill w-full"><span class="rc-svc-name">' + eh(l.service || '—') + '</span><span class="rc-svc-qty" dir="ltr">×' + fmtNum(l.qty || 1) + '</span></div>' +
          '<div class="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px]">' +
            '<div><span class="text-slate-400 block">تكلفة الخدمة للواحدة</span><b class="font-mono text-ink dark:text-white">' + formatCurrency(uCost) + '</b></div>' +
            '<div><span class="text-slate-400 block">إجمالي التنفيذ</span><b class="font-mono text-brand-600 dark:text-violet-300 text-sm font-bold">' + formatCurrency(totCost) + '</b></div>' +
          '</div>' +
          (l.notes ? '<div class="rounded-lg bg-amber-50 dark:bg-amber-950/30 px-2.5 py-1.5 text-[11px] text-amber-900 dark:text-amber-200 whitespace-pre-wrap break-words"><i class="fa-solid fa-note-sticky ms-1"></i><b>ملاحظات:</b> ' + eh(l.notes) + '</div>' : '') +
          '<div class="flex items-center justify-between text-[11px] text-slate-400 pt-1" onclick="event.stopPropagation()">' +
            '<span>تاريخ البدء: ' + eh(startDt) + '</span>' +
            formatCommentsSnippet(l.comments, l.transaction_id, B) +
          '</div>' +
        '</div>';
      }).join('') || '<div class="card p-6 text-center text-slate-400 text-xs">لا توجد طلبات مطابقة للفلاتر الحالية</div>';
    }
  }

  /* ---------- نافذة كارت تفاصيل المعاملة المخصصة للمنفذ ---------- */
  function renderDetailModal(B, tx, lid) {
    const s = st[B];
    if (!s) return;
    const items = (s.allRows || []).filter(l => (tx != null && tx !== '' && String(l.transaction_id) === String(tx)) || (lid != null && String(l.id) === String(lid)));
    if (!items.length) return showToast('تعذّر العثور على بيانات الطلب', 'error');

    const first = items[0];
    const totalExec = sum(items, lineExecCost);
    const allCmts = first.comments || [];
    const JB = JSON.stringify(B), JTX = JSON.stringify(tx);
    const wa = waLink(first.phone, 'أهلاً ' + (first.client_name || '') + '، بخصوص طلبك رقم ' + tx);

    let modal = document.getElementById('partner-tx-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'partner-tx-modal';
      modal.className = 'fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto'; modal.style.zIndex = '2147483000';
      document.body.appendChild(modal);
    }

    modal.innerHTML =
      '<div class="relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 text-xs" onclick="event.stopPropagation()">' +
        '<div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-3.5 bg-slate-50/80 dark:bg-slate-800/50">' +
          '<div class="flex items-center gap-2.5">' +
            '<span class="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-500 text-slate-950 font-bold text-sm"><i class="fa-solid fa-file-invoice"></i></span>' +
            '<div>' +
              '<div class="font-bold text-sm text-ink dark:text-white flex items-center gap-2">' +
                '<span>معاملة رقم ' + eh(tx) + '</span>' +
                badge(first.status || 'In Progress') +
              '</div>' +
              '<div class="text-[11px] text-slate-400">تاريخ المعاملة: ' + eh(formatDateTime(first.received_at)) + '</div>' +
            '</div>' +
          '</div>' +
          '<button type="button" onclick="p8.closeDetail()" class="rounded-xl p-2 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-600 transition" title="إغلاق"><i class="fa-solid fa-xmark text-base"></i></button>' +
        '</div>' +

        '<div class="p-5 space-y-4 overflow-y-auto">' +
          '<div class="grid grid-cols-2 gap-3 sm:grid-cols-3">' +
            '<div class="card p-3 bg-slate-50/60 dark:bg-slate-800/30">' +
              '<span class="text-slate-400 block text-[10.5px]">اسم العميل</span>' +
              '<b class="text-ink dark:text-white text-sm">' + eh(first.client_name || '—') + '</b>' +
            '</div>' +
            '<div class="card p-3 bg-slate-50/60 dark:bg-slate-800/30">' +
              '<span class="text-slate-400 block text-[10.5px]">رقم التليفون</span>' +
              (first.phone
                ? '<div class="flex items-center gap-1.5 mt-0.5"><span class="font-mono font-bold text-ink dark:text-white" dir="ltr">' + eh(first.phone) + '</span>' + (wa ? '<a href="' + wa + '" target="_blank" rel="noopener" class="text-emerald-600"><i class="fa-brands fa-whatsapp text-sm"></i></a>' : '') + '</div>'
                : '<span class="text-slate-400">—</span>') +
            '</div>' +
            '<div class="card p-3 bg-slate-50/60 dark:bg-slate-800/30 col-span-2 sm:col-span-1">' +
              '<span class="text-slate-400 block text-[10.5px]">إجمالي تكلفة التنفيذ</span>' +
              '<b class="font-mono text-brand-600 dark:text-violet-300 text-sm font-bold">' + formatCurrency(totalExec) + '</b>' +
            '</div>' +
          '</div>' +

          '<div>' +
            '<h4 class="font-bold text-xs text-slate-500 mb-2 flex items-center gap-1.5"><i class="fa-solid fa-layer-group text-brand-500"></i>الخدمات والبنود المسندة إليك في هذا الطلب</h4>' +
            '<div class="space-y-2.5">' +
              items.map((it, idx) => {
                const uCost = Number(it.exec_unit_cost) || 0;
                const itTotCost = lineExecCost(it);
                return '<div class="card p-3.5 space-y-2 border border-slate-200/80 dark:border-slate-700/80">' +
                  '<div class="flex items-start justify-between gap-2">' +
                    '<div>' +
                      '<div class="font-bold text-sm text-ink dark:text-white flex flex-wrap items-center gap-2">' +
                        '<span>بند #' + (idx + 1) + ': ' + eh(it.service) + '</span>' +
                        '<span class="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-600 dark:text-slate-300" dir="ltr">×' + fmtNum(it.qty || 1) + '</span>' +
                        partnerRefundBadgeHtml(s, it) +
                      '</div>' +
                      (it.service_ref ? '<div class="text-[11px] font-mono font-bold text-violet-700 dark:text-violet-300 mt-0.5">Service ID: ' + eh(it.service_ref) + '</div>' : '') +
                    '</div>' +
                    '<div class="text-end">' +
                      '<div class="text-[10px] text-slate-400">إجمالي التنفيذ</div>' +
                      '<b class="font-mono text-brand-600 dark:text-violet-300 text-sm">' + formatCurrency(itTotCost) + '</b>' +
                    '</div>' +
                  '</div>' +
                  (Array.isArray(it.beneficiaries) && it.beneficiaries.length ? '<div class="pt-1"><span class="text-[10.5px] text-slate-400 block mb-1">المستفيدون من هذه الخدمة:</span>' + formatBeneficiariesBadges(it.beneficiaries) + '</div>' : '') +
                  (it.notes ? '<div class="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/60 p-2 text-[11px] text-amber-900 dark:text-amber-200 whitespace-pre-wrap"><i class="fa-solid fa-note-sticky ms-1"></i><b>ملاحظات الإدارة:</b> ' + eh(it.notes) + '</div>' : '') +
                '</div>';
              }).join('') +
            '</div>' +
          '</div>' +

          '<div class="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-3">' +
            '<div class="flex items-center justify-between">' +
              '<h4 class="font-bold text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1.5"><i class="fa-solid fa-comments text-brand-500"></i>سجل التعليقات والمستجدات على الطلب (' + allCmts.length + ')</h4>' +
              '<span class="text-[10px] text-slate-400">تصل التعليقات مباشرة للإدارة</span>' +
            '</div>' +
            '<div id="partner-tx-comments-box" class="space-y-2 max-h-52 overflow-y-auto p-2 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200/70 dark:border-slate-800">' +
              (allCmts.length
                ? allCmts.map(c =>
                    '<div class="rounded-lg bg-white dark:bg-slate-900 p-2.5 border border-slate-200/80 dark:border-slate-800 space-y-1">' +
                      '<div class="flex items-center justify-between text-[10.5px] text-slate-400">' +
                        '<b class="text-ink dark:text-white">' + eh(c.author_name || 'تعليق') + '</b>' +
                        '<span>' + eh(formatDateTime(c.created_at)) + '</span>' +
                      '</div>' +
                      '<div class="text-slate-700 dark:text-slate-200 whitespace-pre-wrap text-[11.5px]">' + eh(c.body) + '</div>' +
                    '</div>'
                  ).join('')
                : '<div class="p-4 text-center text-slate-400 text-[11px]">لا توجد تعليقات سابقة على هذا الطلب</div>') +
            '</div>' +

            '<form onsubmit=\'p8.submitComment(event,' + JB + ',' + JTX + ')\' class="space-y-2 pt-1">' +
              '<label class="label !mb-0" for="partner-comment-input">إضافة تعليق تنفيذي جديد على الطلب</label>' +
              '<div class="flex gap-2">' +
                '<input id="partner-comment-input" required placeholder="اكتب المستجدات أو الإفادة هنا (مثال: تم إيداع الأوراق وجاري استخراج المستند)..." class="field text-xs flex-1 !py-2">' +
                '<button id="partner-comment-btn" class="rounded-xl bg-brand-500 hover:bg-brand-600 px-4 py-2 font-bold text-slate-950 text-xs shrink-0 flex items-center gap-1.5"><i class="fa-solid fa-paper-plane"></i><span>إرسال</span></button>' +
              '</div>' +
            '</form>' +
          '</div>' +
        '</div>' +

        '<div class="border-t border-slate-100 dark:border-slate-800 px-5 py-3 bg-slate-50/80 dark:bg-slate-800/40 flex justify-end">' +
          '<button type="button" onclick="p8.closeDetail()" class="rounded-xl bg-slate-200 dark:bg-slate-700 px-4 py-2 font-bold text-slate-700 dark:text-slate-200 text-xs hover:bg-slate-300 transition">إغلاق</button>' +
        '</div>' +
      '</div>';

    modal.classList.remove('hidden');
    modal.onclick = e => { if (e.target === modal) p8.closeDetail(); };
    setTimeout(() => { const inp = document.getElementById('partner-comment-input'); if (inp) inp.focus(); }, 120);
  }

  /* ---------- عرض طلبات المنفذ الخارجي (مشترك: المنفذ + المدير) ---------- */
  async function opsView(box, pid, mgr, fallbackName) {
    if (!box) return;
    const B = box.id || 'p8-box';
    const s = st[B] = st[B] || { q: '', from: '', to: '', quickFilter: 'all', allRows: [], filtered: [] };
    s.pid = pid;
    s.mgr = mgr;
    s.reload = () => opsView(box, pid, mgr, fallbackName);

    box.innerHTML = '<div class="card p-8 text-center text-xs text-slate-400"><i class="fa-solid fa-spinner fa-spin ms-1.5"></i>جارٍ تحميل الطلبات المسندة للمنفذ...</div>';

    let rows = null, partnerName = fallbackName || '';
    let hasMore = false, total = null;
    const [rpcRes0, refRes] = await Promise.all([
      sbClient.rpc('get_partner_requests', { p_partner_uid: mgr ? pid : null, p_limit: PAGE, p_offset: 0 }),
      (async () => { try { return await sbClient.rpc('get_partner_refunds', { p_partner_uid: mgr ? pid : null }); } catch (e) { return { error: true }; } })()
    ]);
    let rpcRes = rpcRes0;
    const refMap = new Map();
    if (refRes && !refRes.error && refRes.data && Array.isArray(refRes.data.refunds)) {
      refRes.data.refunds.forEach(rf => {
        const k = String(rf.line_id);
        if (!refMap.has(k)) refMap.set(k, []);
        refMap.get(k).push(rf);
      });
    } else if (typeof window.getApprovedRefundsForLine === 'function') {
      /* احتياطي للمدير لو الدالة لسه متشغلتش في Supabase */
      (typeof allRequestLines !== 'undefined' ? allRequestLines : []).forEach(l => {
        const arr = window.getApprovedRefundsForLine(l.id);
        if (arr && arr.length) refMap.set(String(l.id), arr);
      });
    }
    s.refundsByLine = refMap;
    /* لو الـ SQL الجديد (الترقيم) لسه ما اتشغّلش: نرجع للنسخة القديمة من غير ترقيم */
    if (rpcRes.error && /PGRST202|Could not find|schema cache/i.test(((rpcRes.error.message) || '') + ((rpcRes.error.code) || ''))) {
      rpcRes = await sbClient.rpc('get_partner_requests', { p_partner_uid: mgr ? pid : null });
    }

    if (!rpcRes.error && rpcRes.data) {
      partnerName = rpcRes.data.partner_name || partnerName;
      rows = rpcRes.data.lines || [];
      hasMore = !!rpcRes.data.has_more;
      total = rpcRes.data.total_count != null ? Number(rpcRes.data.total_count) : null;
    } else if (mgr && typeof allRequestLines !== 'undefined' && allRequestLines.length && partnerName) {
      rows = allRequestLines.filter(l => String(l.executor || '').trim() === String(partnerName).trim()).map(l => ({
        id: l.id,
        transaction_id: l.transaction_id,
        service_ref: l.service_ref,
        client_name: l.client_name,
        phone: l.phone,
        service: l.service,
        qty: l.qty || 1,
        exec_unit_cost: l.exec_unit_cost,
        exec_total: execCostOf(l),
        executor: l.executor,
        status: l.status || 'In Progress',
        received_at: l.received_at,
        exec_start_date: l.exec_start_date || dayKey(lineDate(l)),
        duration_days: l.duration_days,
        notes: l.notes,
        beneficiaries: typeof window.getRequestPeople === 'function' ? window.getRequestPeople(l.transaction_id).filter(p => !p.line_id || String(p.line_id) === String(l.id)) : [],
        comments: []
      }));
    } else {
      box.innerHTML = miss(rpcRes.error) ? sqlHint : '<div class="card p-5 text-center text-xs text-rose-500">تعذّر تحميل الطلبات: ' + eh((rpcRes.error && rpcRes.error.message) || 'خطأ غير معروف') + '</div>';
      return;
    }

    s.allRows = rows;
    s.hasMore = hasMore; s.total = total; s.loadingMore = false;
    s.partnerName = partnerName;
    const JB = JSON.stringify(B);

    box.innerHTML =
      '<div id="' + B + '-kpis" class="grid grid-cols-2 gap-3 lg:grid-cols-4"></div>' +
      '<div class="card p-4 space-y-3">' +
        '<div class="flex flex-wrap items-center justify-between gap-2">' +
          '<div class="text-sm font-bold text-ink dark:text-white flex items-center gap-2">' +
            '<i class="fa-solid fa-filter text-brand-600"></i>' +
            '<span>البحث وتصفية الطلبات' + (partnerName ? ' — <b class="text-brand-600 dark:text-violet-300">' + eh(partnerName) + '</b>' : '') + '</span>' +
          '</div>' +
          '<div class="flex flex-wrap items-center gap-2">' +
            '<span class="text-xs text-slate-500">إجمالي تكلفة التنفيذ المعروضة: <b id="' + B + '-cost-sum" class="font-mono font-bold text-brand-600 dark:text-violet-300">0 ج.م</b></span>' +
            '<button type="button" onclick=\'p8.reload(' + JB + ')\' class="rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200"><i class="fa-solid fa-rotate ms-1"></i>تحديث</button>' +
            '<button type="button" onclick=\'p8.print(' + JB + ')\' class="p8-act"><i class="fa-solid fa-print ms-1"></i>طباعة</button>' +
            '<button type="button" onclick=\'p8.pdf(' + JB + ')\' class="p8-act"><i class="fa-solid fa-file-pdf ms-1"></i>PDF</button>' +
            '<button type="button" onclick=\'p8.csv(' + JB + ')\' class="rounded-xl bg-emerald-600 hover:bg-emerald-700 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm"><i class="fa-solid fa-file-excel ms-1.5"></i>تصدير Excel (CSV)</button>' +
          '</div>' +
        '</div>' +

        '<div class="grid grid-cols-1 gap-3 sm:grid-cols-12 items-end">' +
          '<div class="sm:col-span-5">' +
            '<label class="label">بحث سريع</label>' +
            '<div class="relative">' +
              '<input id="' + B + '-q" type="search" value="' + eh(s.q) + '" oninput=\'p8.setFilter(' + JB + ',"q",this.value)\' placeholder="ابحث باسم العميل، المستفيد، رقم التليفون، رقم الطلب، الخدمة..." class="field pe-8 text-xs">' +
              '<i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none"></i>' +
            '</div>' +
          '</div>' +
          '<div class="sm:col-span-3">' +
            '<label class="label">من تاريخ</label>' +
            '<input id="' + B + '-from" type="date" value="' + eh(s.from) + '" onchange=\'p8.setFilter(' + JB + ',"from",this.value)\' class="field font-mono text-xs">' +
          '</div>' +
          '<div class="sm:col-span-3">' +
            '<label class="label">إلى تاريخ</label>' +
            '<input id="' + B + '-to" type="date" value="' + eh(s.to) + '" onchange=\'p8.setFilter(' + JB + ',"to",this.value)\' class="field font-mono text-xs">' +
          '</div>' +
          '<div class="sm:col-span-1">' +
            '<button type="button" onclick=\'p8.clearFilters(' + JB + ')\' class="w-full rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-300" title="إعادة تعيين الفلاتر">إلغاء</button>' +
          '</div>' +
        '</div>' +

        '<div class="flex items-center justify-between text-xs pt-1 border-t border-slate-100 dark:border-slate-800 text-slate-500">' +
          '<span id="' + B + '-count"></span>' +
          '<span class="text-[11px] text-slate-400"><i class="fa-solid fa-circle-info ms-1"></i>انقر على أي طلب لفتح كارت التفاصيل بالكامل وإضافة تعليق</span>' +
        '</div>' +
      '</div>' +

      '<div class="card overflow-hidden hidden md:block">' +
        '<div class="overflow-x-auto">' +
          '<table class="w-full text-right text-xs">' +
            '<thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-100 dark:border-slate-800">' +
              '<tr>' +
                '<th class="px-3.5 py-3">العميل / رقم الطلب</th>' +
                '<th class="px-3 py-3">المستفيدون</th>' +
                '<th class="px-3 py-3">رقم التليفون</th>' +
                '<th class="px-3 py-3">الخدمة</th>' +
                '<th class="px-3 py-3 text-center">العدد</th>' +
                '<th class="px-3 py-3">الحالة</th>' +
                '<th class="px-3 py-3">تكلفة التنفيذ للخدمة</th>' +
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
      '<div id="' + B + '-cards" class="space-y-3 md:hidden"></div>' +
      '<div id="' + B + '-more" class="pt-1 text-center"></div>';

    renderTableAndCards(B);
  }

  /* ---------- تقرير للطباعة / PDF: الطلبات المعروضة حاليا (بعد الفلاتر) ---------- */
  function reportHtml(s) {
    const rows = s.filtered && s.filtered.length ? s.filtered : (s.allRows || []);
    const totalCost = s._cost != null ? s._cost : sum(rows, lineExecCost), cnt = s._n != null ? s._n : rows.length;
    const th = 'style="border:1px solid #d6d3cd;padding:7px 8px;background:#f3efe9;font-size:11px;text-align:right"';
    const td = 'style="border:1px solid #e4e0da;padding:6px 8px;font-size:11px;vertical-align:top;text-align:right"';
    const body = rows.map((l, i) => '<tr>' +
      '<td ' + td + '>' + (i + 1) + '</td>' +
      '<td ' + td + '><b>' + eh(l.client_name || '—') + '</b><div dir="ltr" style="color:#777;font-size:10px">' + eh(l.transaction_id || '') + (l.service_ref ? ' · ' + eh(l.service_ref) : '') + '</div></td>' +
      '<td ' + td + '>' + eh(formatBeneficiariesText(l.beneficiaries) || '—') + '</td>' +
      '<td ' + td + '>' + eh(l.service || '—') + '</td>' +
      '<td ' + td + '>' + eh(String(Number(l.qty) || 1)) + '</td>' +
      '<td ' + td + '>' + eh(statusLabel(l.status || 'In Progress')) + '</td>' +
      '<td ' + td + '>' + eh(formatCurrency(Number(l.exec_unit_cost) || 0)) + '</td>' +
      '<td ' + td + '><b>' + eh(formatCurrency(lineExecCost(l))) + '</b></td>' +
      '<td ' + td + '>' + eh(lineDateKey(l) ? formatDateOnly(lineDateKey(l)) : '—') + '</td>' +
      '<td ' + td + '>' + eh(l.notes || '') + '</td></tr>').join('');
    return '<div dir="rtl" style="font-family:\'IBM Plex Sans Arabic\',Tahoma,sans-serif;color:#1b1511;background:#fff;padding:22px 26px;width:100%;box-sizing:border-box">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #ff7a3d;padding-bottom:10px;margin-bottom:14px">' +
        '<div><div style="font-size:18px;font-weight:700">تقرير الطلبات المسندة — ' + eh(s.partnerName || 'المنفذ') + '</div>' +
        '<div style="font-size:11px;color:#777;margin-top:3px">تاريخ التقرير: ' + eh(new Date().toLocaleDateString('ar-EG')) + ' · عدد الطلبات: ' + cnt + ' · إجمالي تكلفة التنفيذ: <b>' + eh(formatCurrency(totalCost)) + '</b></div></div>' +
        '<img src="logo-transparent.png" alt="" style="height:38px" onerror="this.style.display=\'none\'"></div>' +
      '<table style="width:100%;border-collapse:collapse"><thead><tr>' +
        ['#', 'العميل / رقم الطلب', 'المستفيدون', 'الخدمة', 'العدد', 'الحالة', 'تكلفة الوحدة', 'الإجمالي', 'التاريخ', 'ملاحظات'].map(h => '<th ' + th + '>' + h + '</th>').join('') +
      '</tr></thead><tbody>' + (body || '<tr><td colspan="10" ' + td + '>لا توجد طلبات</td></tr>') + '</tbody></table></div>';
  }

  function printReport(html) {
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(f);
    const d = f.contentWindow.document;
    d.open();
    d.write('<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>تقرير الطلبات</title>' +
      '<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&display=swap" rel="stylesheet">' +
      '<style>@page{size:A4 landscape;margin:10mm}body{margin:0}thead{display:table-header-group}tr{page-break-inside:avoid}</style></head><body>' + html + '</body></html>');
    d.close();
    const go = () => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { showToast('تعذّرت الطباعة', 'error'); } setTimeout(() => f.remove(), 60000); };
    setTimeout(go, 700);
  }

  async function exportPdf(s) {
    if (!window.html2canvas || !window.jspdf) return showToast('مكتبة الـ PDF ماتحمّلتش — اتأكد من الإنترنت وجرّب تاني', 'error', 6000);
    showToast('جارٍ تجهيز ملف PDF...', 'info', 3000);
    const rows = s.filtered && s.filtered.length ? s.filtered : (s.allRows || []);
    const per = 14, pages = Math.max(1, Math.ceil(rows.length / per));
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-10000px;top:0;width:1123px;background:#fff;z-index:-1';
    document.body.appendChild(host);
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      const pdf = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
      const W = 297, H = 210;
      for (let p = 0; p < pages; p++) {
        host.innerHTML = reportHtml(Object.assign({}, s, { filtered: rows.slice(p * per, (p + 1) * per), allRows: [], _n: rows.length, _cost: sum(rows, lineExecCost) }));
        const canvas = await window.html2canvas(host.firstElementChild, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
        let w = W, h = canvas.height * W / canvas.width;
        if (h > H) { h = H; w = canvas.width * H / canvas.height; }
        if (p) pdf.addPage();
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', (W - w) / 2, 0, w, h);
      }
      pdf.save('طلبات_' + String(s.partnerName || 'المنفذ').replace(/\s+/g, '_') + '_' + new Date().toISOString().slice(0, 10) + '.pdf');
      showToast('تم تحميل ملف PDF');
    } catch (err) { showError('تعذّر إنشاء PDF', err); }
    finally { host.remove(); }
  }

  window.p8 = {
    setFilter: (b, k, v) => {
      if (!st[b]) return;
      st[b][k] = v;
      renderTableAndCards(b);
    },
    setQuickFilter: (b, mode) => {
      if (!st[b]) return;
      st[b].quickFilter = (st[b].quickFilter === mode && mode !== 'all') ? 'all' : mode;
      renderTableAndCards(b);
    },
    clearFilters: b => {
      const s = st[b];
      if (!s) return;
      s.q = ''; s.from = ''; s.to = ''; s.quickFilter = 'all';
      const qEl = document.getElementById(b + '-q'); if (qEl) qEl.value = '';
      const fEl = document.getElementById(b + '-from'); if (fEl) fEl.value = '';
      const tEl = document.getElementById(b + '-to'); if (tEl) tEl.value = '';
      renderTableAndCards(b);
    },
    reload: b => {
      if (st[b] && typeof st[b].reload === 'function') st[b].reload();
    },
    openDetail: (b, tx, lid) => {
      try { renderDetailModal(b, tx, lid); }
      catch (e) { console.error('partner detail', e); showToast('تعذّر فتح التفاصيل: ' + ((e && e.message) || ''), 'error'); }
    },
    loadMore: async b => {
      const s = st[b];
      if (!s || s.loadingMore || !s.hasMore) return;
      s.loadingMore = true; renderTableAndCards(b);
      const r = await sbClient.rpc('get_partner_requests', { p_partner_uid: s.mgr ? s.pid : null, p_limit: PAGE, p_offset: (s.allRows || []).length });
      s.loadingMore = false;
      if (r.error || !r.data) { renderTableAndCards(b); return showToast('تعذّر تحميل المزيد', 'error'); }
      const have = new Set((s.allRows || []).map(l => String(l.id)));
      s.allRows = (s.allRows || []).concat((r.data.lines || []).filter(l => !have.has(String(l.id))));
      s.hasMore = !!r.data.has_more;
      if (r.data.total_count != null) s.total = Number(r.data.total_count);
      renderTableAndCards(b);
    },
    print: b => { const s = st[b]; if (!s) return; printReport(reportHtml(s)); },
    pdf: b => { const s = st[b]; if (s) exportPdf(s); },
    closeDetail: () => {
      const m = document.getElementById('partner-tx-modal');
      if (m) m.classList.add('hidden');
    },
    submitComment: async (e, b, tx) => {
      e.preventDefault();
      const inp = document.getElementById('partner-comment-input');
      const btn = document.getElementById('partner-comment-btn');
      const body = (inp && inp.value || '').trim();
      if (!body) return;

      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>جارٍ الإرسال...</span>';

      try {
        const r = await sbClient.rpc('add_partner_comment', {
          p_transaction_id: String(tx),
          p_body: body
        });
        if (r.error) throw r.error;

        showToast('تم إرسال التعليق للإدارة بنجاح');
        inp.value = '';

        const newCmt = r.data || {
          id: Date.now(),
          transaction_id: String(tx),
          author_name: (st[b] && st[b].partnerName) || 'المنفذ',
          body: body,
          created_at: new Date().toISOString()
        };

        if (st[b] && Array.isArray(st[b].allRows)) {
          st[b].allRows.forEach(l => {
            if (String(l.transaction_id) === String(tx)) {
              l.comments = l.comments || [];
              l.comments.push(newCmt);
            }
          });
        }

        renderTableAndCards(b);
        renderDetailModal(b, tx);
      } catch (err) {
        showError('تعذّر إرسال التعليق', err);
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i><span>إرسال</span>';
        }
      }
    },
    csv: b => {
      const s = st[b];
      if (!s) return;
      const rows = s.filtered || [];
      if (!rows.length) return showToast('لا توجد بيانات لتصديرها', 'info');
      const headers = [
        'اسم العميل',
        'المستفيدون',
        'رقم التليفون',
        'رقم الطلب (Request ID)',
        'رقم الخدمة (Service ID)',
        'الخدمة',
        'العدد',
        'الحالة',
        'تكلفة التنفيذ للخدمة الواحدة',
        'إجمالي التنفيذ',
        'التاريخ',
        'الملاحظات',
        'التعليقات على الطلب'
      ];
      const data = rows.map(l => [
        l.client_name || '',
        formatBeneficiariesText(l.beneficiaries),
        l.phone || '',
        l.transaction_id || '',
        l.service_ref || '',
        l.service || '',
        Number(l.qty) || 1,
        statusLabel(l.status || 'In Progress'),
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
    document.documentElement.classList.add('dark');   /* بوابة المنفذ بالثيم الداكن دايما (الشكل الجديد) */
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
            '<img src="logo-transparent.png" alt="تساهيل" class="p8-logo" onerror="this.style.display=\'none\'">' +
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
    try { if (typeof initTheme === 'function') initTheme(); } catch (e) { /* */ }
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
