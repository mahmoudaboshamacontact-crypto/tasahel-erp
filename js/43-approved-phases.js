/* =====================================================================
   المرحلة 24: المراحل المعتمدة (بدون شكل تجريبي)
   1) ملخص يومي للمتأخرات (يظهر تلقائيًا مرة يوميًا + تسجيل في سجل التنبيهات اليومي)
   2) تسجيل delivered_date تلقائيًا عند تحويل الحالة إلى Delivered من هنا ورايح بس (بدون تعديل الداتا القديمة)
   3) كشف عمولة شهري مفصل للموظف (يأخذ الاستردادات المعتمدة في الحسبان: إجمالي - مسترد = صافي، مع طباعة وPDF)
   4) تحفيز شخصي للموظف: عداد أيام متتالية بدون متأخر + تحديات شهرية فردية (بدون مقارنة مع الزملاء)
   - الألوان: من متغيرات الثيم الحالي (--r-acc, --r-card, --r-line, --r-mute, --r-ok, --r-bad)
   ===================================================================== */
(function () {
  'use strict';
  if (window.__phase24Next) return;
  window.__phase24Next = true;

  const eh = typeof escapeHtml === 'function' ? escapeHtml : s => String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
  const num = v => Number(v) || 0;
  const $ = id => document.getElementById(id);
  const wrap = (name, fn) => { const o = window[name]; if (typeof o === 'function') window[name] = fn(o); };
  const isPartner = () => window.__role === 'partner';
  const isMgr = () => {
    try {
      if (window.__role) return window.__role === 'manager';
      return typeof canEditTx === 'function' && !!canEditTx();
    } catch (e) { return false; }
  };

  const OK = 'var(--r-ok,#5fd3b3)';
  const ACC = 'var(--r-acc,#ff9d6c)';
  const ACC2 = 'var(--r-acc2,#ff7a3d)';
  const BAD = 'var(--r-bad,#ff6b6b)';
  const MUTE = 'var(--r-mute,#a0978e)';
  const CARD = 'var(--r-card,rgba(255,255,255,.045))';
  const LINE = 'var(--r-line,rgba(255,255,255,.1))';

  function todayIso() { return new Date().toLocaleDateString('en-CA'); }
  function curMonthIso() { return todayIso().slice(0, 7); }
  function dayNumber(s) {
    if (!s) return NaN;
    const d = new Date(String(s).slice(0, 10) + 'T00:00:00');
    return isNaN(d) ? NaN : Math.floor(d.getTime() / 86400000);
  }
  function monthTitleAr(ym) {
    try { return new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric' }).format(new Date(ym + '-01T00:00:00')); }
    catch (e) { return ym; }
  }

  function injectStyle() {
    if ($('p24-next-style')) return;
    const st = document.createElement('style');
    st.id = 'p24-next-style';
    st.textContent = `
      .p24-box {
        background: ${CARD};
        border: 1px solid ${LINE};
        border-radius: 18px;
        padding: 16px;
        color: var(--r-text, inherit);
      }
      .p24-chip {
        display: inline-flex; align-items: center; gap: 5px;
        border-radius: 999px; padding: 3px 10px; font-size: 11px; font-weight: 700;
      }
      .p24-btn-pri {
        display: inline-flex; align-items: center; justify-content: center; gap: 6px;
        border-radius: 12px; padding: 8px 14px; font-size: 12px; font-weight: 700;
        background: linear-gradient(135deg, ${ACC}, ${ACC2});
        color: #1a1208; border: 0; cursor: pointer;
      }
      .p24-btn-sec {
        display: inline-flex; align-items: center; justify-content: center; gap: 6px;
        border-radius: 12px; padding: 8px 14px; font-size: 12px; font-weight: 700;
        background: ${CARD}; color: var(--r-text, inherit);
        border: 1px solid ${LINE}; cursor: pointer;
      }
      .p24-btn-sec:hover { border-color: ${ACC}; }
      .p24-bar {
        height: 8px; border-radius: 999px; background: ${LINE}; overflow: hidden;
      }
      .p24-bar > i {
        display: block; height: 100%; border-radius: 999px;
        background: linear-gradient(90deg, ${ACC2}, ${ACC});
      }
      .p24-modal-ov {
        position: fixed; inset: 0; z-index: 2147483100;
        background: rgba(0, 0, 0, 0.68);
        backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
        display: flex; align-items: center; justify-content: center; padding: 14px;
      }
      .p24-modal-card {
        width: 100%; max-width: 720px; max-height: 92vh; overflow-y: auto;
        border-radius: 20px; padding: 20px;
        background: var(--r-bg, #141210);
        color: var(--r-text, #f4eee8);
        border: 1px solid ${LINE};
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
      }
      html:not(.dark) .p24-modal-card {
        background: #ffffff; color: #0f172a; border-color: #e2e8f0;
      }
    `;
    document.head.appendChild(st);
  }

  /* =====================================================================
     1) حساب المتأخرات الحالية + الملخص اليومي للمتأخرات
     ===================================================================== */
  function matchEmpProfile(empName) {
    if (!empName) return null;
    try {
      if (typeof profileByName === 'function') return profileByName(empName);
    } catch (e) {}
    return null;
  }

  function getOverdueSummaryForCurrentUser() {
    const lines = (typeof allRequestLines !== 'undefined' && Array.isArray(allRequestLines)) ? allRequestLines : [];
    const tDay = dayNumber(todayIso());
    const mgr = isMgr();
    const myUid = currentUser ? String(currentUser.id) : '';
    const myNameNorm = (typeof myProfile !== 'undefined' && myProfile && myProfile.full_name && typeof normName === 'function')
      ? normName(myProfile.full_name) : '';

    const overdueLines = [];
    const byEmp = new Map();

    lines.forEach(l => {
      if (!l) return;
      const st = l.status || 'In Progress';
      if (st === 'Delivered' || st === 'Complete') return;
      /* استبعاد البنود المستردة كلياً من المتأخرات */
      if (typeof window.getLineRefundSummary === 'function') {
        const rf = window.getLineRefundSummary(l.id);
        if (rf && rf.isFull) return;
      }
      const dur = num(l.duration_days);
      if (dur <= 0) return;
      const baseDay = !isNaN(dayNumber(l.exec_start_date)) ? dayNumber(l.exec_start_date) : dayNumber(l.received_at || l.created_at);
      if (isNaN(baseDay)) return;
      const dueDay = baseDay + dur;
      if (tDay <= dueDay) return;

      const lateDays = tDay - dueDay;
      const p = matchEmpProfile(l.employee);
      const isMine = (p && String(p.id) === myUid) || (myNameNorm && typeof normName === 'function' && normName(l.employee || '') === myNameNorm);

      if (!mgr && !isMine) return;

      const item = { l: l, lateDays: lateDays, empName: (p && p.full_name) || l.employee || 'غير محدد' };
      overdueLines.push(item);
      byEmp.set(item.empName, (byEmp.get(item.empName) || 0) + 1);
    });

    overdueLines.sort((a, b) => b.lateDays - a.lateDays);
    return { list: overdueLines, byEmp: byEmp, count: overdueLines.length };
  }

  let dailyOverdueChecked = false;
  async function checkAndRunDailyOverdueSummary() {
    if (dailyOverdueChecked || !currentUser || isPartner() || typeof allRequestLines === 'undefined' || !allRequestLines.length) return;
    dailyOverdueChecked = true;
    const tk = todayIso();
    const storageKey = 'ts_daily_late_sum_' + currentUser.id + '_' + tk;
    const sum = getOverdueSummaryForCurrentUser();

    /* تحديث شارة الملخص اليومي في شغلي النهاردة والرئيسية */
    renderDailyOverdueBanner();

    if (!sum.count) return;
    try {
      if (localStorage.getItem(storageKey) === '1') return;
      localStorage.setItem(storageKey, '1');
    } catch (e) {}

    /* حفظ سجل الملخص اليومي في جدول notifications لو متاح بدون ذكر أي كلمات ممنوعة */
    if (typeof sbClient !== 'undefined' && sbClient) {
      try {
        const titleTxt = 'ملخص المتأخرات اليومي (' + tk + ')';
        const bodyTxt = isMgr()
          ? ('إجمالي المتأخرات اليوم: ' + sum.count + ' بند يحتاج متابعة (' + [...sum.byEmp.entries()].slice(0, 4).map(e => e[0] + ': ' + e[1]).join(' ، ') + ')')
          : ('لديك اليوم ' + sum.count + ' بند متأخر عن موعد التسليم يحتاج متابعة.');
        const ex = await sbClient.from('notifications').select('id').eq('user_id', currentUser.id).eq('title', titleTxt).limit(1);
        if (!ex.error && (!ex.data || !ex.data.length)) {
          await sbClient.from('notifications').insert({
            user_id: currentUser.id,
            kind: 'daily_late_summary',
            title: titleTxt,
            body: bodyTxt,
            read: false
          });
        }
      } catch (e) {}
    }

    /* إظهار بطاقة الملخص اليومي للمتأخرات مرة واحدة في بداية اليوم */
    openDailyOverdueModal(sum);
  }

  window.openDailyOverdueModal = function (customSum) {
    injectStyle();
    const sum = customSum || getOverdueSummaryForCurrentUser();
    if (!sum.count) return showToast('ممتاز! لا توجد أي متأخرات مسجلة اليوم', 'info');

    let old = $('p24-daily-late-modal');
    if (old) old.remove();

    const mgr = isMgr();
    const topItems = sum.list.slice(0, 8);
    const empBreakdown = mgr && sum.byEmp.size
      ? '<div class="flex flex-wrap gap-1.5 pt-1">' +
          [...sum.byEmp.entries()].map(e => '<span class="p24-chip" style="background:' + CARD + ';border:1px solid ' + LINE + '"><span>' + eh(e[0]) + ':</span><b style="color:' + ACC + '">' + e[1] + '</b></span>').join('') +
        '</div>'
      : '';

    const ov = document.createElement('div');
    ov.id = 'p24-daily-late-modal';
    ov.className = 'p24-modal-ov';
    ov.innerHTML =
      '<div class="p24-modal-card space-y-4" style="max-width:560px" onclick="event.stopPropagation()">' +
        '<div class="flex items-start justify-between gap-2 border-b pb-3" style="border-color:' + LINE + '">' +
          '<div class="flex items-center gap-2.5">' +
            '<span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-bold" style="background:rgba(255,157,108,.16);color:' + ACC + '"><i class="fa-solid fa-clock-rotate-left"></i></span>' +
            '<div>' +
              '<div class="font-bold text-sm sm:text-base">ملخص المتأخرات اليومي</div>' +
              '<div class="text-xs" style="color:' + MUTE + '">' + eh(formatDateOnly(todayIso())) + ' · إجمالي <b>' + sum.count + ' بند</b> متأخر عن موعد التسليم</div>' +
            '</div>' +
          '</div>' +
          '<button type="button" onclick="document.getElementById(\'p24-daily-late-modal\').remove()" class="rounded-lg p-1.5" style="color:' + MUTE + '"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
        empBreakdown +
        '<div class="space-y-2 max-h-72 overflow-y-auto pr-1">' +
          topItems.map(it => {
            const l = it.l, tx = l.transaction_id || ('TX-' + l.id);
            return '<div class="p24-box !p-3 flex items-center justify-between gap-2 text-xs">' +
              '<div class="min-w-0">' +
                '<div class="font-bold truncate">' + eh(l.client_name || '—') + ' · <span style="color:' + ACC + '">' + eh(l.service || '—') + '</span></div>' +
                '<div class="text-[11px] mt-0.5" style="color:' + MUTE + '"><span class="font-mono" dir="ltr">' + eh(tx) + '</span>' + (mgr ? ' · ' + eh(it.empName) : '') + '</div>' +
              '</div>' +
              '<div class="flex items-center gap-2 shrink-0">' +
                '<span class="p24-chip" style="background:rgba(255,107,107,.15);color:' + BAD + '">متأخر ' + it.lateDays + ' يوم</span>' +
                '<button type="button" onclick="document.getElementById(\'p24-daily-late-modal\').remove();openTxModal(\'' + eh(tx) + '\')" class="p24-btn-sec !py-1 !px-2.5 !text-[11px]">فتح</button>' +
              '</div>' +
            '</div>';
          }).join('') +
          (sum.count > topItems.length ? '<div class="text-center text-xs" style="color:' + MUTE + '">+ ' + (sum.count - topItems.length) + ' بند متأخر إضافي</div>' : '') +
        '</div>' +
        '<div class="flex items-center justify-end gap-2 pt-2 border-t" style="border-color:' + LINE + '">' +
          '<button type="button" onclick="document.getElementById(\'p24-daily-late-modal\').remove()" class="p24-btn-sec">إغلاق</button>' +
          '<button type="button" onclick="document.getElementById(\'p24-daily-late-modal\').remove();if(typeof openMyDayTab===\'function\')openMyDayTab(\'late\')" class="p24-btn-pri"><i class="fa-solid fa-list-check"></i><span>عرض كل المتأخرات</span></button>' +
        '</div>' +
      '</div>';

    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
  };

  function renderDailyOverdueBanner() {
    injectStyle();
    const sum = getOverdueSummaryForCurrentUser();
    const host = $('tab-home');
    if (!host) return;
    let slot = $('p24-home-late-summary');
    if (!sum.count) {
      if (slot) slot.remove();
      return;
    }
    if (!slot) {
      slot = document.createElement('div');
      slot.id = 'p24-home-late-summary';
      host.insertBefore(slot, host.firstChild);
    }
    slot.innerHTML =
      '<div class="p24-box mb-3 flex flex-wrap items-center justify-between gap-3 text-xs" style="border-color:rgba(255,157,108,.4)">' +
        '<div class="flex items-center gap-2.5">' +
          '<span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl font-bold" style="background:rgba(255,157,108,.16);color:' + ACC + '"><i class="fa-solid fa-hourglass-half"></i></span>' +
          '<div>' +
            '<div class="font-bold text-sm">ملخص المتأخرات اليومي: لديك <span style="color:' + ACC + '">' + sum.count + ' بند</span> متأخر عن موعد التسليم</div>' +
            '<div style="color:' + MUTE + '">أقدم تأخير: ' + sum.list[0].lateDays + ' يوم — يُنصح بمتابعتها وتحديث حالتها أولاً بأول</div>' +
          '</div>' +
        '</div>' +
        '<div class="flex items-center gap-2">' +
          '<button type="button" onclick="openDailyOverdueModal()" class="p24-btn-sec !py-1.5 !px-3">عرض الملخص</button>' +
          '<button type="button" onclick="if(typeof openMyDayTab===\'function\')openMyDayTab(\'late\')" class="p24-btn-pri !py-1.5 !px-3">متابعة المتأخرات</button>' +
        '</div>' +
      '</div>';
  }

  /* =====================================================================
     2) التحفيز الشخصي للموظف: عداد أيام بدون متأخر + تحديات شهرية فردية
     ===================================================================== */
  function computePersonalMotivation(uid) {
    const lines = (typeof allRequestLines !== 'undefined' && Array.isArray(allRequestLines)) ? allRequestLines : [];
    const targetUid = uid || (currentUser ? currentUser.id : null);
    const prof = (typeof profiles !== 'undefined' && Array.isArray(profiles)) ? profiles.find(p => String(p.id) === String(targetUid)) : null;
    const empNorm = prof && prof.full_name && typeof normName === 'function' ? normName(prof.full_name) : '';

    const ym = curMonthIso();
    const tDay = dayNumber(todayIso());

    let currentLateCount = 0;
    let lastOverdueDueDay = NaN;
    let monthUnits = 0, monthSales = 0, monthTxSet = new Set(), monthDeliveredInTime = 0, monthDeliveredTotal = 0;

    lines.forEach(l => {
      if (!l) return;
      const p = matchEmpProfile(l.employee);
      const isMine = (p && String(p.id) === String(targetUid)) || (empNorm && typeof normName === 'function' && normName(l.employee || '') === empNorm);
      if (!isMine) return;

      const rf = typeof window.getLineRefundSummary === 'function' ? window.getLineRefundSummary(l.id) : null;
      if (rf && rf.isFull) return;

      const st = l.status || 'In Progress';
      const rStr = String(l.received_at || l.created_at || '').slice(0, 10);
      const rDay = dayNumber(rStr);
      const baseDay = !isNaN(dayNumber(l.exec_start_date)) ? dayNumber(l.exec_start_date) : rDay;
      const dur = num(l.duration_days);

      if (rStr.slice(0, 7) === ym) {
        const netQ = rf ? rf.remQty : Math.max(0, num(l.qty));
        const netS = rf ? rf.remSales : num(l.total);
        monthUnits += netQ;
        monthSales += netS;
        if (l.transaction_id) monthTxSet.add(l.transaction_id);
      }

      if (st === 'Delivered' && l.delivered_date) {
        const dDay = dayNumber(l.delivered_date);
        if (String(l.delivered_date).slice(0, 7) === ym) {
          monthDeliveredTotal++;
          if (dur <= 0 || isNaN(baseDay) || dDay <= baseDay + dur) monthDeliveredInTime++;
        }
        if (dur > 0 && !isNaN(baseDay) && !isNaN(dDay) && dDay > baseDay + dur) {
          if (isNaN(lastOverdueDueDay) || dDay > lastOverdueDueDay) lastOverdueDueDay = dDay;
        }
      } else if (st !== 'Delivered' && st !== 'Complete' && dur > 0 && !isNaN(baseDay)) {
        const dueDay = baseDay + dur;
        if (tDay > dueDay) {
          currentLateCount++;
        }
      }
    });

    /* خصم أي استردادات من شهور سابقة اتوافق عليها في الشهر الحالي */
    if (typeof window.getAllApprovedRefunds === 'function') {
      window.getAllApprovedRefunds().forEach(rf => {
        if (String(rf.decided_at || '').slice(0, 7) !== ym) return;
        const orig = lines.find(x => String(x.id) === String(rf.line_id));
        if (!orig) return;
        const origYm = String(orig.received_at || orig.created_at || '').slice(0, 7);
        if (origYm === ym) return; /* اتخصم بالفعل فوق */
        const p = matchEmpProfile(orig.employee);
        const isMine = (p && String(p.id) === String(targetUid)) || (empNorm && typeof normName === 'function' && normName(orig.employee || '') === empNorm);
        if (!isMine) return;
        monthUnits = Math.max(0, monthUnits - Math.max(0, num(rf.qty)));
        monthSales = Math.max(0, monthSales - Math.max(0, num(rf.sales_amount)));
      });
    }

    /* حساب عداد الأيام المتتالية بدون متأخرات */
    let streakDays = 0;
    if (currentLateCount === 0) {
      const monthFirstDay = dayNumber(ym + '-01');
      if (!isNaN(lastOverdueDueDay)) {
        streakDays = Math.max(1, tDay - lastOverdueDueDay);
      } else {
        streakDays = Math.max(1, tDay - monthFirstDay + 1);
      }
      /* حفظ أعلى سلسلة أيام بدون متأخر للموظف */
      try {
        const bestKey = 'ts_best_streak_' + targetUid;
        const prevBest = parseInt(localStorage.getItem(bestKey) || '0', 10) || 0;
        if (streakDays > prevBest) localStorage.setItem(bestKey, String(streakDays));
      } catch (e) {}
    }

    let bestStreak = streakDays;
    try {
      bestStreak = Math.max(streakDays, parseInt(localStorage.getItem('ts_best_streak_' + targetUid) || '0', 10) || 0);
    } catch (e) {}

    /* التحديات الشهرية الشخصية (بدون مقارنة بالزملاء) */
    const tMap = window.__homeTargetsMap || {};
    const empT = tMap[String(targetUid)] || {};
    const svcGoal = num(empT.services_target) > 0 ? num(empT.services_target) : 100;
    const salesGoal = num(empT.target) > 0 ? num(empT.target) : 0;

    const challenges = [
      {
        title: 'تحدي الالتزام صفر متأخرات (7 أيام متتالية)',
        sub: currentLateCount === 0 ? ('أنجزت ' + streakDays + ' يوم بدون أي بند متأخر') : ('لديك ' + currentLateCount + ' بند متأخر حالياً — صفّر المتأخرات ليبدأ العداد'),
        pct: Math.min(100, Math.round((streakDays / 7) * 100)),
        done: streakDays >= 7 && currentLateCount === 0
      },
      {
        title: 'تحدي الخدمات الشهرية (' + svcGoal + ' خدمة صافية)',
        sub: 'أنجزت ' + fmtNum(monthUnits) + ' من ' + fmtNum(svcGoal) + ' خدمة هذا الشهر (بعد خصم أي مرتجع)',
        pct: Math.min(100, Math.round((monthUnits / Math.max(1, svcGoal)) * 100)),
        done: monthUnits >= svcGoal
      },
      salesGoal > 0
        ? {
            title: 'تحدي تارجت المبلغ الشهري (' + formatCurrency(salesGoal) + ')',
            sub: 'حققت ' + formatCurrency(monthSales) + ' من ' + formatCurrency(salesGoal),
            pct: Math.min(100, Math.round((monthSales / salesGoal) * 100)),
            done: monthSales >= salesGoal
          }
        : {
            title: 'تحدي التسليم في الموعد (' + monthDeliveredInTime + ' بند مسلّم في موعده)',
            sub: monthDeliveredTotal > 0 ? ('نسبة التزامك بالمواعيد عند التسليم: ' + Math.round((monthDeliveredInTime / monthDeliveredTotal) * 100) + '%') : 'سلّم المعاملات المكتملة في موعدها لتسجيل نقاط التحدي',
            pct: monthDeliveredTotal > 0 ? Math.min(100, Math.round((monthDeliveredInTime / monthDeliveredTotal) * 100)) : (currentLateCount === 0 ? 100 : 0),
            done: monthDeliveredTotal >= 10 && monthDeliveredInTime === monthDeliveredTotal
          }
    ];

    return {
      streakDays: streakDays,
      bestStreak: bestStreak,
      currentLateCount: currentLateCount,
      monthUnits: monthUnits,
      monthSales: monthSales,
      monthTx: monthTxSet.size,
      challenges: challenges
    };
  }

  function buildMotivationWidgetHtml(uid) {
    injectStyle();
    const m = computePersonalMotivation(uid);
    const streakCol = m.currentLateCount === 0 ? OK : ACC;
    return '<div class="p24-box space-y-3.5">' +
      '<div class="flex flex-wrap items-center justify-between gap-3">' +
        '<div class="flex items-center gap-3">' +
          '<div class="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl font-bold" style="background:rgba(255,157,108,.14);color:' + streakCol + ';border:1px solid ' + LINE + '">' +
            '<span class="font-mono text-lg leading-none">' + m.streakDays + '</span>' +
            '<span class="text-[9px]">يوم</span>' +
          '</div>' +
          '<div>' +
            '<div class="font-bold text-sm flex items-center gap-2">' +
              '<span>عدّاد أيام بدون متأخرات</span>' +
              (m.currentLateCount === 0
                ? '<span class="p24-chip" style="background:rgba(95,211,179,.15);color:' + OK + '"><i class="fa-solid fa-check"></i>صفر متأخر</span>'
                : '<span class="p24-chip" style="background:rgba(255,157,108,.15);color:' + ACC + '">' + m.currentLateCount + ' متأخر حالياً</span>') +
            '</div>' +
            '<div class="text-xs mt-0.5" style="color:' + MUTE + '">' +
              (m.currentLateCount === 0
                ? 'شغلك كله في ميعاده لمدة <b>' + m.streakDays + ' يوم</b> متتالي (أفضل رقم شخصي لك: ' + m.bestStreak + ' يوم)'
                : 'خلّص الـ ' + m.currentLateCount + ' بند المتأخرين علشان عدّاد أيام الالتزام يرجع يعدّ من جديد') +
            '</div>' +
          '</div>' +
        '</div>' +
        '<button type="button" onclick="openMonthlyCommStatementModal()" class="p24-btn-pri"><i class="fa-solid fa-file-invoice-dollar"></i><span>كشف عمولتي الشهري</span></button>' +
      '</div>' +

      '<div class="border-t pt-3 space-y-2.5" style="border-color:' + LINE + '">' +
        '<div class="flex items-center justify-between text-xs">' +
          '<b style="color:var(--r-text,inherit)"><i class="fa-solid fa-flag-checkered ms-1" style="color:' + ACC + '"></i>تحدياتك الشهرية الشخصية (' + eh(monthTitleAr(curMonthIso())) + ')</b>' +
          '<span class="text-[11px]" style="color:' + MUTE + '">تحديات فردية لمستواك الشخصي فقط</span>' +
        '</div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">' +
          m.challenges.map(c =>
            '<div class="rounded-xl p-3 space-y-2 text-xs" style="background:rgba(127,127,127,.06);border:1px solid ' + LINE + '">' +
              '<div class="flex items-start justify-between gap-2">' +
                '<b class="leading-snug">' + eh(c.title) + '</b>' +
                '<span class="font-mono font-bold shrink-0" style="color:' + (c.done ? OK : ACC) + '">' + c.pct + '%</span>' +
              '</div>' +
              '<div class="p24-bar"><i style="width:' + c.pct + '%;' + (c.done ? 'background:' + OK : '') + '"></i></div>' +
              '<div class="text-[11px]" style="color:' + MUTE + '">' + eh(c.sub) + '</div>' +
            '</div>'
          ).join('') +
        '</div>' +
      '</div>' +
    '</div>';
  }

  /* =====================================================================
     3) كشف عمولة شهري مفصل للموظف (يأخذ الاستردادات في الحسبان)
     ===================================================================== */
  function computeMonthlyStatement(uid, ym) {
    const month = ym || curMonthIso();
    const targetUid = uid || (currentUser ? currentUser.id : null);
    const prof = (typeof profiles !== 'undefined' && Array.isArray(profiles)) ? profiles.find(p => String(p.id) === String(targetUid)) : (typeof myProfile !== 'undefined' ? myProfile : null);
    const empName = (prof && prof.full_name) || (currentUser && currentUser.email) || 'موظف';
    const empNorm = empName && typeof normName === 'function' ? normName(empName) : '';

    const lines = (typeof allRequestLines !== 'undefined' && Array.isArray(allRequestLines)) ? allRequestLines : [];
    const grossItems = [];
    let grossUnits = 0, grossSales = 0, grossComm = 0;

    lines.forEach(l => {
      if (!l) return;
      const rYm = String(l.received_at || l.created_at || '').slice(0, 7);
      if (rYm !== month) return;
      const p = matchEmpProfile(l.employee);
      const isMine = (p && String(p.id) === String(targetUid)) || (empNorm && typeof normName === 'function' && normName(l.employee || '') === empNorm);
      if (!isMine) return;

      const q = Math.max(0, num(l.qty));
      const s = num(l.total);
      const c = typeof window.lineComm === 'function' ? num(window.lineComm(l)) : 0;
      grossUnits += q;
      grossSales += s;
      grossComm += c;
      grossItems.push({
        id: l.id,
        tx: l.transaction_id || ('TX-' + l.id),
        client: l.client_name || '—',
        service: l.service || '—',
        qty: q,
        sales: s,
        comm: c,
        date: String(l.received_at || l.created_at || '').slice(0, 10)
      });
    });

    /* الاستردادات المعتمدة (approved) التي decided_at في هذا الشهر لنفس الموظف */
    const refundItems = [];
    let refUnits = 0, refSales = 0, refComm = 0;
    const allRefs = typeof window.getAllApprovedRefunds === 'function' ? window.getAllApprovedRefunds() : [];
    allRefs.forEach(rf => {
      if (String(rf.decided_at || '').slice(0, 7) !== month) return;
      const orig = lines.find(x => String(x.id) === String(rf.line_id));
      if (!orig) return;
      const p = matchEmpProfile(orig.employee);
      const isMine = (p && String(p.id) === String(targetUid)) || (empNorm && typeof normName === 'function' && normName(orig.employee || '') === empNorm);
      if (!isMine) return;

      const rq = Math.max(0, num(rf.qty));
      const rs = num(rf.sales_amount);
      const hint = rf.unit_comm_hint != null && rf.unit_comm_hint !== '' ? rf.unit_comm_hint : orig.commission_per_unit;
      const rc = typeof window.lineComm === 'function'
        ? num(window.lineComm({ service: orig.service, qty: rq, commission_per_unit: hint }))
        : num(hint) * rq;

      refUnits += rq;
      refSales += rs;
      refComm += rc;
      refundItems.push({
        id: rf.id,
        line_id: orig.id,
        tx: orig.transaction_id || ('TX-' + orig.id),
        client: orig.client_name || '—',
        service: orig.service || '—',
        kind: rf.kind,
        qty: rq,
        sales: rs,
        comm: rc,
        reason: rf.reason || '—',
        date: String(rf.decided_at || '').slice(0, 10)
      });
    });

    return {
      uid: targetUid,
      empName: empName,
      month: month,
      monthTitle: monthTitleAr(month),
      grossUnits: grossUnits,
      grossSales: grossSales,
      grossComm: grossComm,
      refUnits: refUnits,
      refSales: refSales,
      refComm: refComm,
      netUnits: grossUnits - refUnits,
      netSales: grossSales - refSales,
      netComm: grossComm - refComm,
      grossItems: grossItems,
      refundItems: refundItems
    };
  }

  window.openMonthlyCommStatementModal = function (uid, ym) {
    injectStyle();
    const targetUid = (isMgr() && uid) ? uid : (currentUser ? currentUser.id : null);
    const curM = ym || (typeof window.getCommViewMonth === 'function' ? window.getCommViewMonth() : curMonthIso());
    const st = computeMonthlyStatement(targetUid, curM);

    let old = $('p24-comm-stmt-modal');
    if (old) old.remove();

    const mgr = isMgr();
    const staffOpts = mgr && typeof profiles !== 'undefined'
      ? profiles.filter(p => p.id && p.role !== 'partner').map(p => '<option value="' + eh(p.id) + '"' + (String(p.id) === String(st.uid) ? ' selected' : '') + '>' + eh(p.full_name || 'موظف') + '</option>').join('')
      : '';

    const refRowsHtml = st.refundItems.length
      ? st.refundItems.map((r, i) =>
          '<tr class="border-b" style="border-color:' + LINE + '">' +
            '<td class="p-2 text-center">' + (i + 1) + '</td>' +
            '<td class="p-2 font-bold">' + eh(r.client) + ' <span class="font-mono text-[10px]" dir="ltr">(' + eh(r.tx) + ')</span></td>' +
            '<td class="p-2">' + eh(r.service) + ' <span class="p24-chip" style="background:rgba(255,107,107,.14);color:' + BAD + '">' + (r.kind === 'full' ? 'كلي' : 'جزئي') + '</span></td>' +
            '<td class="p-2 text-center font-mono">−' + fmtNum(r.qty) + '</td>' +
            '<td class="p-2 font-mono">−' + formatCurrency(r.sales) + '</td>' +
            '<td class="p-2 font-mono font-bold" style="color:' + BAD + '">−' + formatCurrency(r.comm) + '</td>' +
            '<td class="p-2 text-[11px]" style="color:' + MUTE + '">' + eh(r.reason) + '</td>' +
          '</tr>'
        ).join('')
      : '<tr><td colspan="7" class="p-4 text-center" style="color:' + MUTE + '">لا توجد أي استردادات مخصومة في هذا الشهر ✓</td></tr>';

    const ov = document.createElement('div');
    ov.id = 'p24-comm-stmt-modal';
    ov.className = 'p24-modal-ov';
    ov.innerHTML =
      '<div class="p24-modal-card space-y-4" onclick="event.stopPropagation()">' +
        '<div class="flex flex-wrap items-center justify-between gap-2 border-b pb-3" style="border-color:' + LINE + '">' +
          '<div>' +
            '<div class="font-bold text-base flex items-center gap-2">' +
              '<i class="fa-solid fa-file-invoice-dollar" style="color:' + ACC + '"></i>' +
              '<span>كشف العمولة الشهري — ' + eh(st.empName) + '</span>' +
            '</div>' +
            '<div class="text-xs mt-0.5" style="color:' + MUTE + '">شهر: <b>' + eh(st.monthTitle) + '</b> · يشمل خصم الاستردادات المعتمدة في الشهر</div>' +
          '</div>' +
          '<div class="flex flex-wrap items-center gap-2">' +
            (mgr ? '<select onchange="openMonthlyCommStatementModal(this.value,\'' + eh(st.month) + '\')" class="field !w-40 !py-1.5 text-xs">' + staffOpts + '</select>' : '') +
            '<input type="month" value="' + eh(st.month) + '" onchange="openMonthlyCommStatementModal(\'' + eh(st.uid) + '\',this.value)" class="field !w-36 !py-1.5 text-xs font-mono">' +
            '<button type="button" onclick="printMonthlyCommStatement(\'' + eh(st.uid) + '\',\'' + eh(st.month) + '\')" class="p24-btn-pri !py-1.5 !px-3"><i class="fa-solid fa-print"></i><span>طباعة الكشف</span></button>' +
            '<button type="button" onclick="document.getElementById(\'p24-comm-stmt-modal\').remove()" class="p24-btn-sec !py-1.5 !px-3">إغلاق</button>' +
          '</div>' +
        '</div>' +

        '<div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">' +
          '<div class="p24-box space-y-1">' +
            '<div style="color:' + MUTE + '">إجمالي الشغل (قبل الاسترداد)</div>' +
            '<div class="text-base font-bold font-mono">' + formatCurrency(st.grossComm) + '</div>' +
            '<div class="text-[11px]" style="color:' + MUTE + '">' + fmtNum(st.grossUnits) + ' خدمة · مبيعات ' + formatCurrency(st.grossSales) + '</div>' +
          '</div>' +
          '<div class="p24-box space-y-1" style="border-color:rgba(255,107,107,.35)">' +
            '<div style="color:' + BAD + '">خصم الاستردادات المعتمدة (' + st.refundItems.length + ')</div>' +
            '<div class="text-base font-bold font-mono" style="color:' + BAD + '">− ' + formatCurrency(st.refComm) + '</div>' +
            '<div class="text-[11px]" style="color:' + MUTE + '">−' + fmtNum(st.refUnits) + ' خدمة · −' + formatCurrency(st.refSales) + '</div>' +
          '</div>' +
          '<div class="p24-box space-y-1" style="border-color:rgba(95,211,179,.45)">' +
            '<div style="color:' + OK + '">صافي العمولة المستحقة للصرف</div>' +
            '<div class="text-lg font-bold font-mono" style="color:' + OK + '">' + formatCurrency(st.netComm) + '</div>' +
            '<div class="text-[11px]" style="color:' + MUTE + '">صافي ' + fmtNum(st.netUnits) + ' خدمة · صافي مبيعات ' + formatCurrency(st.netSales) + '</div>' +
          '</div>' +
        '</div>' +

        '<div class="space-y-2 text-xs">' +
          '<div class="font-bold flex items-center justify-between">' +
            '<span><i class="fa-solid fa-rotate-left ms-1" style="color:' + ACC + '"></i>بيان الاستردادات المخصومة في الشهر (' + st.refundItems.length + ')</span>' +
            '<span class="text-[11px]" style="color:' + MUTE + '">تُخصم الاستردادات حسب تاريخ اعتمادها (decided_at)</span>' +
          '</div>' +
          '<div class="overflow-x-auto rounded-xl border" style="border-color:' + LINE + '">' +
            '<table class="w-full text-right text-xs border-collapse">' +
              '<thead style="background:' + CARD + ';color:' + MUTE + '">' +
                '<tr><th class="p-2 text-center">#</th><th class="p-2">العميل والمعاملة</th><th class="p-2">الخدمة والنوع</th><th class="p-2 text-center">الكمية</th><th class="p-2">المبلغ</th><th class="p-2">خصم العمولة</th><th class="p-2">السبب</th></tr>' +
              '</thead>' +
              '<tbody>' + refRowsHtml + '</tbody>' +
            '</table>' +
          '</div>' +
        '</div>' +
      '</div>';

    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
  };

  window.printMonthlyCommStatement = function (uid, ym) {
    const st = computeMonthlyStatement(uid, ym);
    const pc = $('print-content');
    if (!pc) return;
    const refRows = st.refundItems.map((r, i) =>
      '<tr>' +
        '<td style="padding:5px;border:1px solid #cbd5e1;text-align:center">' + (i + 1) + '</td>' +
        '<td style="padding:5px;border:1px solid #cbd5e1">' + eh(r.client) + ' (' + eh(r.tx) + ')</td>' +
        '<td style="padding:5px;border:1px solid #cbd5e1">' + eh(r.service) + ' (' + (r.kind === 'full' ? 'كلي' : 'جزئي') + ')</td>' +
        '<td style="padding:5px;border:1px solid #cbd5e1;text-align:center">−' + fmtNum(r.qty) + '</td>' +
        '<td style="padding:5px;border:1px solid #cbd5e1">−' + eh(formatCurrency(r.sales)) + '</td>' +
        '<td style="padding:5px;border:1px solid #cbd5e1;font-weight:700;color:#dc2626">−' + eh(formatCurrency(r.comm)) + '</td>' +
        '<td style="padding:5px;border:1px solid #cbd5e1">' + eh(r.reason) + '</td>' +
      '</tr>'
    ).join('') || '<tr><td colspan="7" style="padding:8px;border:1px solid #cbd5e1;text-align:center">لا توجد استردادات مخصومة في هذا الشهر</td></tr>';

    pc.innerHTML =
      '<div style="direction:rtl;font-family:\'IBM Plex Sans Arabic\',Tahoma,sans-serif;color:#0f172a;padding:16px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #ff7a3d;padding-bottom:10px;margin-bottom:14px">' +
          '<div><div style="font-size:18px;font-weight:700">كشف العمولة الشهري — ' + eh(st.empName) + '</div>' +
          '<div style="font-size:12px;color:#475569">الشهر: ' + eh(st.monthTitle) + ' · تاريخ الطباعة: ' + eh(new Date().toLocaleString('ar-EG')) + '</div></div>' +
        '</div>' +
        '<div style="display:flex;gap:10px;margin-bottom:14px">' +
          '<div style="flex:1;border:1px solid #cbd5e1;border-radius:8px;padding:10px"><div style="font-size:11px;color:#64748b">إجمالي العمولة قبل الاسترداد</div><div style="font-size:16px;font-weight:700">' + eh(formatCurrency(st.grossComm)) + ' (' + fmtNum(st.grossUnits) + ' خدمة)</div></div>' +
          '<div style="flex:1;border:1px solid #fecaca;border-radius:8px;padding:10px;background:#fef2f2"><div style="font-size:11px;color:#dc2626">خصم الاستردادات المعتمدة</div><div style="font-size:16px;font-weight:700;color:#dc2626">− ' + eh(formatCurrency(st.refComm)) + ' (−' + fmtNum(st.refUnits) + ' خدمة)</div></div>' +
          '<div style="flex:1;border:1px solid #a7f3d0;border-radius:8px;padding:10px;background:#ecfdf5"><div style="font-size:11px;color:#059669">صافي العمولة المستحقة</div><div style="font-size:18px;font-weight:700;color:#059669">' + eh(formatCurrency(st.netComm)) + ' (صافي ' + fmtNum(st.netUnits) + ' خدمة)</div></div>' +
        '</div>' +
        '<h4 style="font-size:13px;margin:10px 0 6px">تفصيل الاستردادات المخصومة في الشهر:</h4>' +
        '<table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr style="background:#0f172a;color:#fff"><th style="padding:6px;border:1px solid #334155">#</th><th style="padding:6px;border:1px solid #334155">العميل والمعاملة</th><th style="padding:6px;border:1px solid #334155">الخدمة</th><th style="padding:6px;border:1px solid #334155">الكمية</th><th style="padding:6px;border:1px solid #334155">المبلغ</th><th style="padding:6px;border:1px solid #334155">خصم العمولة</th><th style="padding:6px;border:1px solid #334155">السبب</th></tr></thead><tbody>' + refRows + '</tbody></table>' +
      '</div>';
    window.print();
  };

  /* ---------------- 4) حقن لوحة التحفيز وزر كشف العمولة في الشاشات ---------------- */
  function mountMotivationAndStatementButtons() {
    if (isPartner() || !currentUser) return;
    injectStyle();

    /* في شاشة شغلي النهاردة (#tab-myday) */
    const md = $('tab-myday');
    if (md && !md.querySelector('#p24-md-motivation')) {
      const box = document.createElement('div');
      box.id = 'p24-md-motivation';
      box.innerHTML = buildMotivationWidgetHtml(currentUser.id);
      const firstCard = md.firstElementChild;
      if (firstCard && firstCard.nextSibling) md.insertBefore(box, firstCard.nextSibling);
      else md.appendChild(box);
    } else if (md && md.querySelector('#p24-md-motivation')) {
      md.querySelector('#p24-md-motivation').innerHTML = buildMotivationWidgetHtml(currentUser.id);
    }

    /* في شاشة تقدمي (#tab-wk) للموظف */
    const wk = $('tab-wk');
    if (wk && !isMgr() && wk.querySelector('.wk') && !wk.querySelector('#p24-wk-motivation')) {
      const box = document.createElement('div');
      box.id = 'p24-wk-motivation';
      box.innerHTML = buildMotivationWidgetHtml(currentUser.id);
      wk.querySelector('.wk').appendChild(box);
    }

    /* في شاشة الكوميشن والتارجت (#tab-comm): زر واضح لكشف العمولة الشهري المفصل (بالاستردادات) */
    const commBar = $('comm-filter-bar');
    if (commBar && !commBar.querySelector('#p24-stmt-btn')) {
      const actionsWrap = commBar.querySelector('.flex.flex-wrap.items-center.gap-2:last-child');
      if (actionsWrap) {
        actionsWrap.insertAdjacentHTML('afterbegin',
          '<button id="p24-stmt-btn" type="button" onclick="openMonthlyCommStatementModal()" class="p24-btn-pri"><i class="fa-solid fa-file-invoice-dollar"></i><span>كشف العمولة الشهري (صافي بعد الاسترداد)</span></button>'
        );
      }
    }
  }

  wrap('renderHomeTab', orig => function () {
    const r = orig.apply(this, arguments);
    try { renderDailyOverdueBanner(); } catch (e) {}
    return r;
  });

  wrap('renderComm', orig => async function () {
    const r = await orig.apply(this, arguments);
    try { mountMotivationAndStatementButtons(); } catch (e) {}
    return r;
  });

  wrap('switchTab', orig => function (id) {
    const r = orig.apply(this, arguments);
    try {
      setTimeout(() => {
        if (id === 'home') renderDailyOverdueBanner();
        if (id === 'myday' || id === 'wk' || id === 'comm') mountMotivationAndStatementButtons();
      }, 60);
    } catch (e) {}
    return r;
  });

  wrap('refreshLineViews', orig => function () {
    const r = orig.apply(this, arguments);
    try {
      checkAndRunDailyOverdueSummary();
      if (currentTab === 'myday' || currentTab === 'wk' || currentTab === 'comm') mountMotivationAndStatementButtons();
    } catch (e) {}
    return r;
  });

  wrap('loadInitialData', orig => async function () {
    const r = await orig.apply(this, arguments);
    try {
      injectStyle();
      checkAndRunDailyOverdueSummary();
      mountMotivationAndStatementButtons();
    } catch (e) { console.warn('p24 next init', e); }
    return r;
  });

  wrap('handleLogout', orig => function () {
    dailyOverdueChecked = false;
    return orig.apply(this, arguments);
  });
})();
