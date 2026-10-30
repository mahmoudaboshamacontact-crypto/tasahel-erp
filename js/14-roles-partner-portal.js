/* ===== المرحلة 8 (محدثة وتفاعلية بالكامل): بوابة المنفذ الخارجي المعزولة ===== */
(function () {
  if (window.__phase8) return; window.__phase8 = true;
  const eh = escapeHtml;
  const miss = e => /42P01|42883|PGRST20[25]|does not exist|schema cache|Could not find/i.test(((e && e.message) || '') + ' ' + ((e && e.code) || ''));
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
  const sqlHint = '<div class="card p-5 text-center space-y-2 border border-amber-300 bg-amber-50/70 dark:bg-amber-950/30 dark:border-amber-800"><div class="text-sm font-bold text-amber-900 dark:text-amber-200"><i class="fa-solid fa-database ms-1.5"></i>يلزم تفعيل دوال بوابة المنفذ الخارجي في Supabase</div><div class="text-xs text-amber-800 dark:text-amber-300">شغّل ملف <b class="font-mono">sql/partner-portal-requests.sql</b> مرة واحدة في Supabase (SQL Editor) لتفعيل البوابة التفاعلية.</div></div>';
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

  function lineExecCost(l) {
    return Number(l.exec_total) || ((Number(l.exec_unit_cost) || 0) * (Number(l.qty) || 1)) || 0;
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
    const totalExec = sum(filtered, lineExecCost);
    const totalAllExec = sum(all, lineExecCost);

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
    if (countBadge) countBadge.textContent = 'معروض ' + filtered.length + ' من إجمالي ' + all.length + ' طلب مسند';

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

        return '<tr class="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 align-top cursor-pointer" onclick=\'p8.openDetail(' + JB + ',' + JSON.stringify(l.transaction_id) + ')\'>' +
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

        return '<div class="card p-4 space-y-2.5 text-xs hover:border-brand-500 transition cursor-pointer" onclick=\'p8.openDetail(' + JB + ',' + JSON.stringify(l.transaction_id) + ')\'>' +
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
  function renderDetailModal(B, tx) {
    const s = st[B];
    if (!s) return;
    const items = (s.allRows || []).filter(l => String(l.transaction_id) === String(tx));
    if (!items.length) return showToast('تعذّر العثور على بيانات الطلب', 'error');

    const first = items[0];
    const totalExec = sum(items, lineExecCost);
    const allCmts = first.comments || [];
    const JB = JSON.stringify(B), JTX = JSON.stringify(tx);
    const wa = waLink(first.phone, 'أهلاً ' + (first.client_name || '') + '، بخصوص طلبك رقم ' + tx);

    let modal = doc
