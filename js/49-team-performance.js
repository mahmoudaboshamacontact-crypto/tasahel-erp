/* =====================================================================
   المرحلة 2 – أداء الفريق (js/49-team-performance.js)
   - يقيس الشغل داخل النظام فقط (معاملات، مواعيد تسليم، تعديلات، استردادات) بدون مراقبة جهاز.
   - يشمل:
     * بطاقة الشفافية ("إيه اللي بيتقاس؟") للمدير والموظف
     * (52) شغلي النهاردة ومعدل التارجت اليومي (لكل موظف لنفسه، مع الربط بشاشات شغلي النهاردة وتقدمي وكشف العمولة)
     * (51) لوحة أداء الموظفين للمدير فقط (اليوم / آخر 7 أيام / الشهر، سرعة الإنجاز من delivered_date فقط، ساعات الذروة، الفجوات الطويلة، ومقارنة الموظف بنفسه فقط)
     * (54) الأقل ضغطًا للمدير فقط (مع استبعاد المجازين اليوم من hr_leaves إن وُجد)
     * (59) تقييم شهري بالوقائع والأرقام فقط (المدير يرى الكل، والموظف يرى نفسه فقط، مع دعم month_snapshots للشهور المقفولة)
     * (60) جدول الصلاحيات التوضيحي للقراءة فقط للمدير
   ===================================================================== */
(function () {
  'use strict';
  if (window.__phase49) return;
  window.__phase49 = true;

  /* ثوابت قابلة للتعديل في مكان واحد */
  const LONG_GAP_MINUTES = 120;      /* حد الفجوة الطويلة بين العمليات في اليوم (120 دقيقة = ساعتين) */
  const LATE_EDIT_HOURS = 24;        /* التعديلات بعد 24 ساعة من وقت تسجيل الطلب في التقييم الشهري */
  const AUDIT_FETCH_LIMIT = 1500;    /* حد معقول لسحب سجل التعديلات عند فتح التاب فقط */
  const WORK_HOURS_RANGE = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];

  const BTN_ON = 'tab-btn bg-ink text-white dark:bg-brand-600 shadow-sm';
  const BTN_OFF = 'tab-btn text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800';

  const $ = function (id) { return document.getElementById(id); };
  const eh = typeof escapeHtml === 'function' ? escapeHtml : function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  };
  const num = function (v) { return Number(v) || 0; };
  const wrap = function (name, fn) {
    const orig = window[name];
    if (typeof orig === 'function') window[name] = fn(orig);
  };

  function isPartner() {
    return window.__role === 'partner' || (document.body && document.body.classList.contains('is-partner-mode'));
  }

  function isMgr() {
    if (isPartner()) return false;
    if (window.__role) return window.__role === 'manager';
    try { return typeof canEditTx === 'function' && !!canEditTx(); } catch (e) { return false; }
  }

  function haveDb() {
    return typeof sbClient !== 'undefined' && !!sbClient;
  }

  function todayIso() {
    return new Date().toLocaleDateString('en-CA');
  }

  function curMonthIso() {
    return todayIso().slice(0, 7);
  }

  function prevMonthIso(ym) {
    const parts = String(ym || curMonthIso()).split('-').map(Number);
    if (!parts[0] || !parts[1]) return curMonthIso();
    return parts[1] === 1
      ? (parts[0] - 1) + '-12'
      : parts[0] + '-' + String(parts[1] - 1).padStart(2, '0');
  }

  function monthLabelAr(ym) {
    try {
      return new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric' }).format(new Date(ym + '-01T00:00:00'));
    } catch (e) {
      return ym;
    }
  }

  function dayNum(dateStrOrObj) {
    if (!dateStrOrObj) return NaN;
    const s = dateStrOrObj instanceof Date
      ? dateStrOrObj.toLocaleDateString('en-CA')
      : String(dateStrOrObj).slice(0, 10);
    const d = new Date(s + 'T00:00:00');
    return isNaN(d.getTime()) ? NaN : Math.floor(d.getTime() / 86400000);
  }

  function fmtTimeShort(dt) {
    if (!dt) return '—';
    const d = dt instanceof Date ? dt : new Date(dt);
    if (isNaN(d.getTime())) return '—';
    try {
      return new Intl.DateTimeFormat('ar-EG', { hour: 'numeric', minute: '2-digit', hour12: true }).format(d);
    } catch (e) {
      return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    }
  }

  function fmtDurationMin(mins) {
    const m = Math.round(num(mins));
    if (m < 60) return m + ' دقيقة';
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return h + ' س' + (rem > 0 ? ' و' + rem + ' د' : '');
  }

  function fmtMoney(v) {
    return typeof formatCurrency === 'function' ? formatCurrency(v) : (Math.round(num(v)).toLocaleString('en-US') + ' ج.م');
  }

  function fmtInt(v) {
    return Math.round(num(v)).toLocaleString('en-US');
  }

  function matchProfile(empName) {
    if (!empName) return null;
    try {
      if (typeof profileByName === 'function') return profileByName(empName);
    } catch (e) { /* */ }
    return null;
  }

  function normStr(s) {
    if (typeof normName === 'function') return normName(s || '');
    return String(s || '').trim().toLowerCase();
  }

  function getStaffProfiles() {
    const list = (typeof profiles !== 'undefined' && Array.isArray(profiles))
      ? profiles.filter(function (p) { return p && p.id && p.role !== 'partner'; })
      : [];
    if (!isMgr()) {
      const myId = (typeof currentUser !== 'undefined' && currentUser && currentUser.id) ? String(currentUser.id) : '';
      const mine = list.filter(function (p) { return String(p.id) === myId; });
      if (mine.length) return mine;
      if (typeof myProfile !== 'undefined' && myProfile && myProfile.id) return [myProfile];
      if (myId) return [{ id: myId, full_name: (currentUser && currentUser.email) || 'حسابي' }];
      return [];
    }
    return list.slice().sort(function (a, b) {
      return String(a.full_name || '').localeCompare(String(b.full_name || ''), 'ar');
    });
  }

  function isLineForProfile(line, prof) {
    if (!line || !prof) return false;
    const emp = line.employee || '';
    if (!emp) return false;
    const p = matchProfile(emp);
    if (p && p.id) return String(p.id) === String(prof.id);
    const pNorm = normStr(prof.full_name || '');
    return !!pNorm && normStr(emp) === pNorm;
  }

  function calcLineCommSafe(l) {
    try {
      if (typeof window.lineComm === 'function') return num(window.lineComm(l));
    } catch (e) { /* */ }
    return (num(l && l.commission_per_unit) || 0) * Math.max(0, num(l && l.qty));
  }

  function getLineRefundInfo(lineId) {
    try {
      if (typeof window.getLineRefundSummary === 'function') return window.getLineRefundSummary(lineId);
    } catch (e) { /* */ }
    return null;
  }

  function getAllApprovedRefundsSafe() {
    try {
      if (typeof window.getAllApprovedRefunds === 'function') return window.getAllApprovedRefunds() || [];
    } catch (e) { /* */ }
    return [];
  }

  const state = {
    period: 'today',
    evalMonth: curMonthIso(),
    loadedOnce: false,
    busy: false,
    checkedAt: '',
    auditRows: null,
    auditAvailable: false,
    leavesTodaySet: new Set(),
    leavesAvailable: false,
    closuresSet: new Set(),
    snapshotsByMonth: new Map(),
    targetsByMonth: new Map()
  };

  function availableMonthsList() {
    const set = new Set([curMonthIso(), prevMonthIso(curMonthIso())]);
    state.closuresSet.forEach(function (m) { if (m) set.add(m); });
    const lines = (typeof allRequestLines !== 'undefined' && Array.isArray(allRequestLines)) ? allRequestLines : [];
    lines.forEach(function (l) {
      const m = String(lineDate(l) || '').slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(m)) set.add(m);
    });
    return Array.from(set).sort().reverse();
  }

  async function loadMonthTargetsAndSnapshots(ym) {
    if (!haveDb() || !ym) return;
    try {
      const [clRes, tRes, snRes] = await Promise.all([
        sbClient.from('month_closures').select('month'),
        sbClient.from('emp_targets').select('user_id,month,target,services_target').eq('month', ym),
        sbClient.from('month_snapshots').select('*').eq('month', ym)
      ]);
      if (!clRes.error && Array.isArray(clRes.data)) {
        clRes.data.forEach(function (c) { if (c && c.month) state.closuresSet.add(c.month); });
      }
      const tMap = new Map();
      let locSvc = {};
      try {
        locSvc = JSON.parse(localStorage.getItem('tasahel_svc_targets_' + ym) || '{}') || {};
      } catch (e) { /* */ }
      if (!tRes.error && Array.isArray(tRes.data)) {
        tRes.data.forEach(function (row) {
          if (!row || !row.user_id) return;
          const uid = String(row.user_id);
          tMap.set(uid, {
            target: num(row.target),
            services_target: num(row.services_target) || num(locSvc[uid])
          });
        });
      }
      Object.keys(locSvc).forEach(function (uid) {
        if (!tMap.has(uid)) tMap.set(uid, { target: 0, services_target: num(locSvc[uid]) });
      });
      state.targetsByMonth.set(ym, tMap);

      const sMap = new Map();
      if (!snRes.error && Array.isArray(snRes.data)) {
        snRes.data.forEach(function (row) {
          if (row && row.user_id) sMap.set(String(row.user_id), row);
        });
      }
      state.snapshotsByMonth.set(ym, sMap);
    } catch (e) { /* */ }
  }

  async function fetchSupplementaryData() {
    if (!haveDb() || state.busy || isPartner()) return;
    state.busy = true;
    renderTeamPerfTab();

    const curM = curMonthIso();
    const evalM = state.evalMonth || curM;

    try {
      await loadMonthTargetsAndSnapshots(curM);
      if (evalM !== curM) await loadMonthTargetsAndSnapshots(evalM);

      if (typeof window.reloadLineRefunds === 'function' && !getAllApprovedRefundsSafe().length) {
        try { await window.reloadLineRefunds(true); } catch (e) { /* */ }
      }

      try {
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - 45);
        const evalStartIso = evalM + '-01T00:00:00.000Z';
        const minIso = evalStartIso < fromDate.toISOString() ? evalStartIso : fromDate.toISOString();

        const audRes = await sbClient.from('audit_log')
          .select('at,user_name,action,transaction_id')
          .gte('at', minIso)
          .order('at', { ascending: false })
          .limit(AUDIT_FETCH_LIMIT);

        if (!audRes.error && Array.isArray(audRes.data)) {
          state.auditRows = audRes.data;
          state.auditAvailable = true;
        } else {
          state.auditRows = null;
          state.auditAvailable = false;
        }
      } catch (e) {
        state.auditRows = null;
        state.auditAvailable = false;
      }

      if (isMgr()) {
        try {
          const tk = todayIso();
          const lvRes = await sbClient.from('hr_leaves')
            .select('user_id,from_day,to_day,status')
            .eq('status', 'approved')
            .lte('from_day', tk)
            .gte('to_day', tk);
          if (!lvRes.error && Array.isArray(lvRes.data)) {
            state.leavesTodaySet = new Set(lvRes.data.map(function (x) { return String(x.user_id); }));
            state.leavesAvailable = true;
          } else {
            state.leavesTodaySet = new Set();
            state.leavesAvailable = false;
          }
        } catch (e) {
          state.leavesTodaySet = new Set();
          state.leavesAvailable = false;
        }
      }

      state.loadedOnce = true;
      state.checkedAt = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    } catch (e) { /* */ }

    state.busy = false;
    renderTeamPerfTab();
  }

  function countRemainingWorkDaysInMonth(ym) {
    const now = new Date();
    const curM = curMonthIso();
    if (ym && ym !== curM) return 0;
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const lastDay = new Date(y, m, 0).getDate();
    let count = 0;
    for (let d = now.getDate(); d <= lastDay; d++) {
      const dt = new Date(y, m - 1, d);
      if (dt.getDay() !== 5) count++;
    }
    return Math.max(1, count);
  }

  function txPillsHtml(txList, maxShow) {
    const arr = Array.from(new Set((txList || []).filter(Boolean)));
    if (!arr.length) return '';
    const lim = maxShow || 5;
    const shown = arr.slice(0, lim).map(function (tx) {
      return '<button type="button" data-tx="' + eh(tx) + '" onclick="if(window.openTxModal)openTxModal(this.dataset.tx)" class="rc-tx-pill !py-0.5 !px-2 !text-[10.5px] font-mono" dir="ltr">' + eh(tx) + '</button>';
    }).join(' ');
    const more = arr.length > lim ? ' <span class="text-[10.5px] text-slate-400">+' + (arr.length - lim) + '</span>' : '';
    return '<div class="flex flex-wrap items-center gap-1 mt-1">' + shown + more + '</div>';
  }

  function computeEmpWindowMetrics(prof, startDayNum, endDayNum) {
    const lines = (typeof allRequestLines !== 'undefined' && Array.isArray(allRequestLines)) ? allRequestLines : [];
    const lineById = new Map();
    const txSet = new Set();
    let linesCount = 0;
    let units = 0;
    let sales = 0;
    let comm = 0;
    const deliveryDaysList = [];
    const timestamps = [];
    const hourCounts = new Array(24).fill(0);

    lines.forEach(function (l) {
      if (!l) return;
      lineById.set(String(l.id), l);
      if (!isLineForProfile(l, prof)) return;

      const rRaw = lineDate(l);
      const rDay = dayNum(rRaw);
      if (!isNaN(rDay) && rDay >= startDayNum && rDay <= endDayNum) {
        linesCount++;
        const q = Math.max(0, num(l.qty) || 1);
        units += q;
        sales += num(l.total);
        comm += calcLineCommSafe(l);
        if (l.transaction_id) txSet.add(String(l.transaction_id));

        const dt = new Date(rRaw);
        if (!isNaN(dt.getTime())) {
          timestamps.push(dt);
          hourCounts[dt.getHours()]++;
        }
      }

      const st = l.status || 'In Progress';
      if (st === 'Delivered' && l.delivered_date) {
        const dDay = dayNum(l.delivered_date);
        if (!isNaN(dDay) && !isNaN(rDay) && dDay >= startDayNum && dDay <= endDayNum && dDay >= rDay) {
          deliveryDaysList.push(dDay - rDay);
        }
      }
    });

    let refundCount = 0;
    let refundUnits = 0;
    let refundSales = 0;
    let refundComm = 0;
    getAllApprovedRefundsSafe().forEach(function (rf) {
      if (!rf || rf.status !== 'approved') return;
      const dDay = dayNum(rf.decided_at || rf.requested_at);
      if (isNaN(dDay) || dDay < startDayNum || dDay > endDayNum) return;
      const orig = lineById.get(String(rf.line_id));
      if (!orig || !isLineForProfile(orig, prof)) return;

      const rq = Math.max(0, num(rf.qty));
      const rs = Math.max(0, num(rf.sales_amount));
      const hint = rf.unit_comm_hint != null && rf.unit_comm_hint !== '' ? rf.unit_comm_hint : orig.commission_per_unit;
      const rc = calcLineCommSafe({ service: orig.service, qty: rq, commission_per_unit: hint });

      refundCount++;
      refundUnits += rq;
      refundSales += rs;
      refundComm += rc;
    });

    let editsCount = null;
    if (state.auditAvailable && Array.isArray(state.auditRows)) {
      editsCount = 0;
      state.auditRows.forEach(function (a) {
        if (!a || !a.at || a.action === 'created') return;
        const aDay = dayNum(a.at);
        if (isNaN(aDay) || aDay < startDayNum || aDay > endDayNum) return;
        const p = matchProfile(a.user_name);
        const isSame = (p && String(p.id) === String(prof.id)) || (normStr(a.user_name) === normStr(prof.full_name));
        if (isSame) editsCount++;
      });
    }

    const avgSpeed = deliveryDaysList.length
      ? Math.round((deliveryDaysList.reduce(function (s, v) { return s + v; }, 0) / deliveryDaysList.length) * 10) / 10
      : null;

    return {
      txCount: txSet.size,
      linesCount: linesCount,
      netUnits: Math.max(0, units - refundUnits),
      netSales: Math.max(0, sales - refundSales),
      netComm: Math.max(0, comm - refundComm),
      refundCount: refundCount,
      refundUnits: refundUnits,
      refundSales: refundSales,
      avgSpeed: avgSpeed,
      deliveredWithDateCount: deliveryDaysList.length,
      editsCount: editsCount,
      timestamps: timestamps,
      hourCounts: hourCounts
    };
  }

  function computeEmpLiveOperational(prof) {
    const lines = (typeof allRequestLines !== 'undefined' && Array.isArray(allRequestLines)) ? allRequestLines : [];
    const tDay = dayNum(todayIso());
    const dueTodayTxs = [];
    const lateTxs = [];
    const readyTxs = [];
    let dueTodayCount = 0;
    let lateCount = 0;
    let readyCount = 0;
    let openInProgCount = 0;
    const todayTimestamps = [];

    lines.forEach(function (l) {
      if (!l || !isLineForProfile(l, prof)) return;
      const rf = getLineRefundInfo(l.id);
      if (rf && rf.isFull) return;

      const rRaw = lineDate(l);
      const rDay = dayNum(rRaw);
      if (rDay === tDay) {
        const dt = new Date(rRaw);
        if (!isNaN(dt.getTime())) todayTimestamps.push(dt);
      }

      const st = l.status || 'In Progress';
      if (st === 'Delivered') return;

      const tx = l.transaction_id || ('TX-' + l.id);
      if (st === 'Complete') {
        readyCount++;
        readyTxs.push(tx);
        return;
      }

      openInProgCount++;
      const dur = num(l.duration_days);
      const baseDay = !isNaN(dayNum(l.exec_start_date)) ? dayNum(l.exec_start_date) : rDay;
      if (dur > 0 && !isNaN(baseDay)) {
        const dueDay = baseDay + dur;
        if (tDay > dueDay) {
          lateCount++;
          lateTxs.push(tx);
        } else if (tDay === dueDay) {
          dueTodayCount++;
          dueTodayTxs.push(tx);
        }
      }
    });

    todayTimestamps.sort(function (a, b) { return a - b; });
    const firstToday = todayTimestamps.length ? todayTimestamps[0] : null;
    const lastToday = todayTimestamps.length ? todayTimestamps[todayTimestamps.length - 1] : null;

    const longGaps = [];
    for (let i = 1; i < todayTimestamps.length; i++) {
      const diffMin = (todayTimestamps[i] - todayTimestamps[i - 1]) / 60000;
      if (diffMin > LONG_GAP_MINUTES) {
        longGaps.push({
          mins: Math.round(diffMin),
          from: fmtTimeShort(todayTimestamps[i - 1]),
          to: fmtTimeShort(todayTimestamps[i])
        });
      }
    }

    return {
      dueTodayCount: dueTodayCount,
      dueTodayTxs: dueTodayTxs,
      lateCount: lateCount,
      lateTxs: lateTxs,
      readyCount: readyCount,
      readyTxs: readyTxs,
      openTotal: openInProgCount + readyCount,
      openInProgCount: openInProgCount,
      firstToday: firstToday,
      lastToday: lastToday,
      longGaps: longGaps
    };
  }

  function formatSelfDiffHtml(curVal, prevVal, unitLabel) {
    const c = num(curVal);
    const p = num(prevVal);
    const diff = c - p;
    if (c === 0 && p === 0) return '<span class="text-slate-400">لا تغيير (0)</span>';
    if (diff === 0) return '<span class="text-slate-500 font-semibold">= نفس المعدل (' + fmtInt(c) + ' ' + eh(unitLabel) + ')</span>';
    const arrow = diff > 0 ? '▲ +' : '▼ −';
    const toneCls = diff > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400';
    return '<span class="font-bold font-mono ' + toneCls + '">' + arrow + fmtInt(Math.abs(diff)) + ' ' + eh(unitLabel) + '</span> <span class="text-[10.5px] text-slate-400">(' + fmtInt(c) + ' مقابل ' + fmtInt(p) + ')</span>';
  }

  function buildTransparencyCardHtml() {
    return '<div class="tp49-box border-brand-500/40 space-y-2">' +
      '<div class="flex items-center gap-2.5">' +
        '<span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white text-xs"><i class="fa-solid fa-shield-halved"></i></span>' +
        '<h3 class="font-bold text-sm sm:text-base text-ink dark:text-white">إيه اللي بيتقاس؟ (بطاقة الشفافية)</h3>' +
      '</div>' +
      '<p class="text-xs leading-relaxed text-slate-600 dark:text-slate-300">' +
        'بنقيس <b>الشغل جوه السيستم بس</b> (عدد المعاملات والخدمات، الالتزام بمواعيد التسليم، التعديلات، والاستردادات المعتمدة) — <b>من غير أي مراقبة للشاشة أو الماوس أو الكيبورد أو الموقع الجغرافي</b>. ' +
        'كل موظف بيشوف أرقامه هو بنفس الطريقة اللي بيشوفها المدير بالظبط، والمقارنة دايمًا بتكون <b>بين شغلك الحالي وشغلك اللي فات (نفس الشخص)</b> ومش بنقارن ولا نرتّب أي موظف بزميله.' +
      '</p>' +
    '</div>';
  }

  function buildMyDayCardHtml() {
    const myId = (typeof currentUser !== 'undefined' && currentUser && currentUser.id) ? String(currentUser.id) : '';
    const allProfs = (typeof profiles !== 'undefined' && Array.isArray(profiles)) ? profiles : [];
    const myProf = allProfs.find(function (p) { return String(p.id) === myId; })
      || (typeof myProfile !== 'undefined' && myProfile ? myProfile : { id: myId, full_name: (currentUser && currentUser.email) || 'حسابي' });

    const ops = computeEmpLiveOperational(myProf);
    const curM = curMonthIso();
    const mStart = dayNum(curM + '-01');
    const mEnd = dayNum(todayIso());
    const mStats = computeEmpWindowMetrics(myProf, mStart, mEnd);

    const tMap = state.targetsByMonth.get(curM) || new Map();
    const homeT = (window.__homeTargetsMap && window.__homeTargetsMap[myId]) || {};
    const empT = tMap.get(myId) || { target: num(homeT.target), services_target: num(homeT.services_target) };

    const salesTarget = num(empT.target);
    const svcTarget = num(empT.services_target);
    const remSales = Math.max(0, salesTarget - mStats.netSales);
    const remSvc = Math.max(0, svcTarget - mStats.netUnits);
    const daysLeft = countRemainingWorkDaysInMonth(curM);

    const needSalesPerDay = salesTarget > 0
      ? (remSales > 0 ? (fmtMoney(Math.ceil(remSales / daysLeft)) + ' / يوم') : 'تم تحقيق تارجت المبلغ ✓')
      : 'غير محدد';
    const needSvcPerDay = svcTarget > 0
      ? (remSvc > 0 ? (Math.ceil(remSvc / daysLeft) + ' خدمة / يوم') : 'تم تحقيق تارجت الخدمات ✓')
      : 'غير محدد';

    const salesPct = salesTarget > 0 ? Math.min(100, Math.round((mStats.netSales / salesTarget) * 100)) : null;
    const svcPct = svcTarget > 0 ? Math.min(100, Math.round((mStats.netUnits / svcTarget) * 100)) : null;

    return '<div class="card p-4 sm:p-5 space-y-4">' +
      '<div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">' +
        '<div class="flex items-center gap-2.5">' +
          '<span class="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-600 text-white"><i class="fa-solid fa-sun"></i></span>' +
          '<div>' +
            '<h3 class="font-bold text-sm sm:text-base text-ink dark:text-white">شغلي النهاردة ومعدل التارجت المتبقي — ' + eh(myProf.full_name || 'حسابي') + '</h3>' +
            '<p class="text-[11px] text-slate-500">أرقامك أنت بس · باقي <b>' + daysLeft + ' يوم عمل</b> في الشهر (الجمعة إجازة)</p>' +
          '</div>' +
        '</div>' +
        '<div class="flex flex-wrap items-center gap-1.5 text-xs">' +
          '<button type="button" onclick="if(window.openMyDayTab)openMyDayTab(\'all\');else switchTab(\'myday\')" class="tp49-act-btn rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 px-3 py-1.5 font-bold text-slate-700 dark:text-slate-200"><i class="fa-solid fa-list-check ms-1 text-sky-500"></i>شاشة شغلي النهاردة</button>' +
          '<button type="button" onclick="if(window.openWeeklySummary)openWeeklySummary();else switchTab(\'wk\')" class="tp49-act-btn rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 px-3 py-1.5 font-bold text-slate-700 dark:text-slate-200"><i class="fa-solid fa-chart-column ms-1 text-brand-600"></i>شاشة تقدمي</button>' +
          '<button type="button" onclick="if(window.openMonthlyCommStatementModal)openMonthlyCommStatementModal()" class="tp49-act-btn rounded-xl bg-brand-600 hover:bg-brand-700 px-3 py-1.5 font-bold text-white"><i class="fa-solid fa-file-invoice-dollar ms-1"></i>كشف عمولتي الشهري</button>' +
        '</div>' +
      '</div>' +

      '<div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">' +
        '<div class="tp49-box space-y-1">' +
          '<div class="text-slate-500 dark:text-slate-400 font-semibold">اللي عليا النهاردة (موعد تسليمه اليوم)</div>' +
          '<div class="text-xl font-bold font-mono text-ink dark:text-white">' + fmtInt(ops.dueTodayCount) + ' <span class="text-xs font-sans font-normal text-slate-400">بند</span></div>' +
          (ops.dueTodayCount ? txPillsHtml(ops.dueTodayTxs, 5) : '<div class="text-[11px] text-slate-400">مفيش بنود موعد تسليمها النهاردة</div>') +
        '</div>' +

        '<div class="tp49-box space-y-1">' +
          '<div class="text-slate-500 dark:text-slate-400 font-semibold">المتأخر عن موعد التسليم</div>' +
          '<div class="text-xl font-bold font-mono ' + (ops.lateCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400') + '">' + fmtInt(ops.lateCount) + ' <span class="text-xs font-sans font-normal text-slate-400">بند</span></div>' +
          (ops.lateCount ? txPillsHtml(ops.lateTxs, 5) : '<div class="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">ممتاز — صفر متأخرات ✓</div>') +
        '</div>' +

        '<div class="tp49-box space-y-1">' +
          '<div class="text-slate-500 dark:text-slate-400 font-semibold">الجاهز للتسليم (ولسه ما اتسلّمش)</div>' +
          '<div class="text-xl font-bold font-mono text-teal-600 dark:text-teal-300">' + fmtInt(ops.readyCount) + ' <span class="text-xs font-sans font-normal text-slate-400">بند</span></div>' +
          (ops.readyCount ? txPillsHtml(ops.readyTxs, 5) : '<div class="text-[11px] text-slate-400">مفيش بنود مكتملة منتظرة تسليم</div>') +
        '</div>' +
      '</div>' +

      '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">' +
        '<div class="tp49-box space-y-2">' +
          '<div class="flex items-center justify-between">' +
            '<span class="font-bold text-ink dark:text-white">تارجت المبلغ الشهري (صافي بعد الاسترداد)</span>' +
            '<span class="font-mono font-bold">' + (salesPct != null ? (salesPct + '%') : 'غير محدد') + '</span>' +
          '</div>' +
          '<div class="tp49-bar-track"><div class="tp49-bar-fill ' + (salesPct != null && salesPct >= 100 ? 'tp49-bar-ok' : '') + '" style="width:' + (salesPct || 0) + '%"></div></div>' +
          '<div class="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">' +
            '<span>المتحقق: <b class="font-mono text-ink dark:text-white">' + eh(fmtMoney(mStats.netSales)) + '</b>' + (salesTarget > 0 ? ' من ' + eh(fmtMoney(salesTarget)) : '') + '</span>' +
            '<span>محتاج في اليوم: <b class="font-mono text-brand-600 dark:text-violet-300">' + eh(needSalesPerDay) + '</b></span>' +
          '</div>' +
        '</div>' +

        '<div class="tp49-box space-y-2">' +
          '<div class="flex items-center justify-between">' +
            '<span class="font-bold text-ink dark:text-white">تارجت عدد الخدمات الشهري (صافي)</span>' +
            '<span class="font-mono font-bold">' + (svcPct != null ? (svcPct + '%') : 'غير محدد') + '</span>' +
          '</div>' +
          '<div class="tp49-bar-track"><div class="tp49-bar-fill ' + (svcPct != null && svcPct >= 100 ? 'tp49-bar-ok' : '') + '" style="width:' + (svcPct || 0) + '%"></div></div>' +
          '<div class="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">' +
            '<span>المتحقق: <b class="font-mono text-ink dark:text-white">' + fmtInt(mStats.netUnits) + ' خدمة</b>' + (svcTarget > 0 ? ' من ' + fmtInt(svcTarget) : '') + '</span>' +
            '<span>محتاج في اليوم: <b class="font-mono text-brand-600 dark:text-violet-300">' + eh(needSvcPerDay) + '</b></span>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function buildManagerStaffCardsSectionHtml() {
    if (!isMgr()) return '';
    const staffList = getStaffProfiles();
    const tDay = dayNum(todayIso());
    const curM = curMonthIso();
    const prevM = prevMonthIso(curM);

    let pStart = tDay;
    let pEnd = tDay;
    let periodLabel = 'اليوم (' + formatDateOnly(todayIso()) + ')';
    if (state.period === 'week') {
      pStart = tDay - 6;
      periodLabel = 'آخر 7 أيام';
    } else if (state.period === 'month') {
      pStart = dayNum(curM + '-01');
      periodLabel = 'الشهر الحالي (' + monthLabelAr(curM) + ')';
    }

    const wCurStart = tDay - 6, wCurEnd = tDay;
    const wPrevStart = tDay - 13, wPrevEnd = tDay - 7;
    const mCurStart = dayNum(curM + '-01'), mCurEnd = tDay;
    const [py, pm] = prevM.split('-').map(Number);
    const prevMonthLastDay = new Date(py, pm, 0).getDate() || 30;
    const mPrevStart = dayNum(prevM + '-01');
    const mPrevEnd = dayNum(prevM + '-' + String(prevMonthLastDay).padStart(2, '0'));

    const cardsHtml = staffList.map(function (prof) {
      const wMetrics = computeEmpWindowMetrics(prof, pStart, pEnd);
      const ops = computeEmpLiveOperational(prof);

      const wkCur = computeEmpWindowMetrics(prof, wCurStart, wCurEnd);
      const wkPrev = computeEmpWindowMetrics(prof, wPrevStart, wPrevEnd);
      const moCur = computeEmpWindowMetrics(prof, mCurStart, mCurEnd);
      const moPrev = computeEmpWindowMetrics(prof, mPrevStart, mPrevEnd);

      const maxHVal = Math.max.apply(null, WORK_HOURS_RANGE.map(function (h) { return wMetrics.hourCounts[h] || 0; }).concat([1]));
      let peakHour = null;
      let peakCount = 0;
      WORK_HOURS_RANGE.forEach(function (h) {
        if ((wMetrics.hourCounts[h] || 0) > peakCount) {
          peakCount = wMetrics.hourCounts[h];
          peakHour = h;
        }
      });

      const hoursBarsHtml = '<div class="tp49-hours">' +
        WORK_HOURS_RANGE.map(function (h) {
          const cnt = wMetrics.hourCounts[h] || 0;
          const pctH = cnt > 0 ? Math.max(14, Math.round((cnt / maxHVal) * 100)) : 6;
          const barCls = (cnt > 0 && h === peakHour) ? 'is-peak' : (cnt > 0 ? 'has-val' : '');
          const hLabel = h === 12 ? '12م' : (h > 12 ? (h - 12) + 'م' : h + 'ص');
          return '<div class="tp49-hour-col" title="الساعة ' + hLabel + ': ' + cnt + ' بند">' +
            '<div class="tp49-hour-bar ' + barCls + '" style="height:' + pctH + '%"></div>' +
            '<span class="text-[9px] text-slate-400 font-mono">' + h + '</span>' +
          '</div>';
        }).join('') +
      '</div>';

      const gapsHtml = ops.longGaps.length
        ? '<div class="flex flex-wrap items-center gap-1.5 pt-1">' +
            ops.longGaps.map(function (g) {
              return '<span class="tp49-gap-chip"><i class="fa-regular fa-clock"></i><span>فجوة ' + eh(fmtDurationMin(g.mins)) + ' (' + eh(g.from) + ' ← ' + eh(g.to) + ')</span></span>';
            }).join('') +
          '</div>'
        : '<div class="text-[11px] text-slate-400">لا توجد فجوات طويلة (&gt; ' + LONG_GAP_MINUTES + ' دقيقة) بين عمليات اليوم</div>';

      return '<div class="tp49-box space-y-3 text-xs">' +
        '<div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2.5">' +
          '<div class="flex items-center gap-2.5">' +
            (typeof avatarHtml === 'function' ? avatarHtml(prof, 38) : '') +
            '<div>' +
              '<div class="font-bold text-sm text-ink dark:text-white">' + eh(prof.full_name || 'موظف') + '</div>' +
              '<div class="text-[11px] text-slate-500">' +
                (ops.firstToday
                  ? ('نشاط اليوم: أول بند <b>' + eh(fmtTimeShort(ops.firstToday)) + '</b> · آخر بند <b>' + eh(fmtTimeShort(ops.lastToday)) + '</b>')
                  : 'لم يسجّل بنود جديدة اليوم بعد') +
              '</div>' +
            '</div>' +
          '</div>' +
          '<span class="rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-[10.5px] font-semibold text-slate-500">ترتيب أبجدي</span>' +
        '</div>' +

        '<div class="grid grid-cols-2 sm:grid-cols-3 gap-2">' +
          '<div class="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-2.5">' +
            '<div class="text-[11px] text-slate-400">المعاملات والخدمات (صافي)</div>' +
            '<div class="font-bold font-mono text-sm text-ink dark:text-white mt-0.5">' + fmtInt(wMetrics.txCount) + ' معاملة · ' + fmtInt(wMetrics.netUnits) + ' خدمة</div>' +
            (wMetrics.refundCount > 0 ? '<div class="text-[10px] text-rose-500">مخصوم ' + fmtInt(wMetrics.refundUnits) + ' مسترد</div>' : '') +
          '</div>' +

          '<div class="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-2.5">' +
            '<div class="text-[11px] text-slate-400">سرعة الإنجاز (من delivered_date)</div>' +
            '<div class="font-bold font-mono text-sm text-ink dark:text-white mt-0.5">' +
              (wMetrics.avgSpeed != null ? (wMetrics.avgSpeed + ' يوم') : 'غير متاح') +
            '</div>' +
            '<div class="text-[10px] text-slate-400">' +
              (wMetrics.deliveredWithDateCount > 0 ? ('من ' + wMetrics.deliveredWithDateCount + ' بند مسلّم بتاريخ') : 'لا توجد بنود مسلّمة بـ delivered_date') +
            '</div>' +
          '</div>' +

          '<div class="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-2.5">' +
            '<div class="text-[11px] text-slate-400">التعديلات على المعاملات</div>' +
            '<div class="font-bold font-mono text-sm text-ink dark:text-white mt-0.5">' +
              (wMetrics.editsCount != null ? (fmtInt(wMetrics.editsCount) + ' تعديل') : 'غير متاح') +
            '</div>' +
            '<div class="text-[10px] text-slate-400">من سجل التعديلات (audit_log)</div>' +
          '</div>' +

          '<div class="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-2.5">' +
            '<div class="text-[11px] text-slate-400">المتأخر عن موعد التسليم</div>' +
            '<div class="font-bold font-mono text-sm ' + (ops.lateCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400') + ' mt-0.5">' + fmtInt(ops.lateCount) + ' بند</div>' +
            txPillsHtml(ops.lateTxs, 3) +
          '</div>' +

          '<div class="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-2.5">' +
            '<div class="text-[11px] text-slate-400">الجاهز ولسه ما اتسلّمش</div>' +
            '<div class="font-bold font-mono text-sm text-teal-600 dark:text-teal-300 mt-0.5">' + fmtInt(ops.readyCount) + ' بند</div>' +
            txPillsHtml(ops.readyTxs, 3) +
          '</div>' +

          '<div class="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-2.5">' +
            '<div class="text-[11px] text-slate-400">إجمالي المفتوح حالياً</div>' +
            '<div class="font-bold font-mono text-sm text-ink dark:text-white mt-0.5">' + fmtInt(ops.openTotal) + ' بند</div>' +
            '<div class="text-[10px] text-slate-400">قيد التنفيذ/المراجعة: ' + fmtInt(ops.openInProgCount) + '</div>' +
          '</div>' +
        '</div>' +

        '<div class="space-y-1 pt-1">' +
          '<div class="flex items-center justify-between text-[11px] text-slate-500">' +
            '<span>توزيع النشاط على الساعات (8 ص – 11 م)</span>' +
            '<span>' + (peakHour != null ? ('أعلى ساعة نشاط: <b>' + peakHour + ':00</b> (' + peakCount + ' بند)') : 'لا يوجد نشاط مسجّل في الفترة') + '</span>' +
          '</div>' +
          hoursBarsHtml +
        '</div>' +

        '<div class="space-y-1 pt-1 border-t border-slate-100 dark:border-slate-800">' +
          '<div class="text-[11px] font-semibold text-slate-500">الفجوات الطويلة في اليوم (لفهم توزيع الشغل فقط، بدون تقييم):</div>' +
          gapsHtml +
        '</div>' +

        '<div class="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">' +
          '<div class="text-[11px] font-bold text-slate-500">مقارنة الموظف بنفسه فقط (بدون مقارنة بالزملاء):</div>' +
          '<div class="flex flex-wrap items-center justify-between gap-2 text-[11px]">' +
            '<span class="text-slate-500">الأسبوع ده مقابل الأسبوع اللي فات:</span>' +
            formatSelfDiffHtml(wkCur.netUnits, wkPrev.netUnits, 'خدمة') +
          '</div>' +
          '<div class="flex flex-wrap items-center justify-between gap-2 text-[11px]">' +
            '<span class="text-slate-500">الشهر ده مقابل الشهر اللي قبله:</span>' +
            formatSelfDiffHtml(moCur.netUnits, moPrev.netUnits, 'خدمة') +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    const periodBtn = function (k, lbl) {
      const on = state.period === k;
      return '<button type="button" data-tp49-period="' + k + '" class="tp49-act-btn rounded-xl px-3 py-1.5 text-xs font-bold border ' +
        (on ? 'bg-ink text-white border-ink dark:bg-brand-600 dark:border-brand-600' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700') + '">' + eh(lbl) + '</button>';
    };

    return '<div class="card p-4 sm:p-5 space-y-4">' +
      '<div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">' +
        '<div>' +
          '<h3 class="font-bold text-sm sm:text-base text-ink dark:text-white flex items-center gap-2">' +
            '<i class="fa-solid fa-users-gear text-brand-600"></i>' +
            '<span>51. لوحة أداء الموظفين — ' + eh(periodLabel) + '</span>' +
          '</h3>' +
          '<p class="text-[11px] text-slate-500 mt-0.5">الترتيب أبجدي · سرعة الإنجاز تُحسب من delivered_date فقط · الاستردادات المعتمدة مخصومة</p>' +
        '</div>' +
        '<div class="flex flex-wrap items-center gap-1.5">' +
          periodBtn('today', 'اليوم') +
          periodBtn('week', 'آخر 7 أيام') +
          periodBtn('month', 'الشهر الحالي') +
        '</div>' +
      '</div>' +
      '<div class="grid grid-cols-1 lg:grid-cols-2 gap-3.5">' +
        (cardsHtml || '<div class="py-6 text-center text-xs text-slate-400 col-span-2">لا توجد بيانات موظفين حالياً</div>') +
      '</div>' +
    '</div>';
  }

  function buildLeastLoadedSectionHtml() {
    if (!isMgr()) return '';
    const staffList = getStaffProfiles();
    const rows = staffList.map(function (prof) {
      const ops = computeEmpLiveOperational(prof);
      const onLeave = state.leavesAvailable && state.leavesTodaySet.has(String(prof.id));
      return {
        prof: prof,
        openTotal: ops.openTotal,
        inProg: ops.openInProgCount,
        ready: ops.readyCount,
        late: ops.lateCount,
        onLeave: onLeave
      };
    }).sort(function (a, b) {
      return a.openTotal - b.openTotal || String(a.prof.full_name || '').localeCompare(String(b.prof.full_name || ''), 'ar');
    });

    const maxOpen = Math.max.apply(null, rows.map(function (r) { return r.openTotal; }).concat([1]));
    const availableCandidates = rows.filter(function (r) { return !r.onLeave; });
    const suggested = availableCandidates.length ? availableCandidates[0] : null;

    const suggestionBanner = suggested
      ? '<div class="tp49-box flex flex-wrap items-center justify-between gap-2 text-xs">' +
          '<div class="flex items-center gap-2">' +
            '<i class="fa-solid fa-scale-balanced text-emerald-500"></i>' +
            '<span><b>الأقل ضغطًا حاليًا: ' + eh(suggested.prof.full_name || 'موظف') + '</b> (لديه <b>' + fmtInt(suggested.openTotal) + ' بند مفتوح</b> غير مسلّم)</span>' +
          '</div>' +
          '<span class="text-[11px] text-slate-400">اقتراح استرشادي فقط — لا يوجد إسناد تلقائي</span>' +
        '</div>'
      : '<div class="tp49-box text-xs text-slate-400">لا يوجد اقتراح متاح حالياً</div>';

    const trsHtml = rows.map(function (r) {
      const barPct = maxOpen > 0 ? Math.round((r.openTotal / maxOpen) * 100) : 0;
      return '<tr>' +
        '<td class="p-2.5 font-bold text-ink dark:text-white whitespace-nowrap">' +
          eh(r.prof.full_name || 'موظف') +
          (r.onLeave ? ' <span class="rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 px-2 py-0.5 text-[10px] font-bold">في إجازة معتمدة اليوم (مستبعد)</span>' : '') +
        '</td>' +
        '<td class="p-2.5 text-center font-mono">' + fmtInt(r.inProg) + '</td>' +
        '<td class="p-2.5 text-center font-mono text-teal-600 dark:text-teal-300">' + fmtInt(r.ready) + '</td>' +
        '<td class="p-2.5 text-center font-mono font-bold text-ink dark:text-white">' + fmtInt(r.openTotal) + '</td>' +
        '<td class="p-2.5 min-w-[160px]">' +
          '<div class="tp49-bar-track"><div class="tp49-bar-fill ' + (r.openTotal === 0 ? 'tp49-bar-ok' : '') + '" style="width:' + Math.max(4, barPct) + '%"></div></div>' +
        '</td>' +
      '</tr>';
    }).join('');

    return '<div class="card p-4 sm:p-5 space-y-3">' +
      '<div>' +
        '<h3 class="font-bold text-sm sm:text-base text-ink dark:text-white flex items-center gap-2">' +
          '<i class="fa-solid fa-layer-group text-emerald-600"></i>' +
          '<span>54. الأقل ضغطًا وتوزيع البنود المفتوحة</span>' +
        '</h3>' +
        '<p class="text-[11px] text-slate-500 mt-0.5">عدد البنود غير المسلّمة عند كل موظف حالياً (مع استبعاد الحاصلين على إجازة معتمدة اليوم من الاقتراح)</p>' +
      '</div>' +
      suggestionBanner +
      '<div class="overflow-x-auto">' +
        '<table class="w-full text-right text-xs">' +
          '<thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-100 dark:border-slate-800">' +
            '<tr>' +
              '<th class="p-2.5">الموظف</th>' +
              '<th class="p-2.5 text-center">قيد التنفيذ / المراجعة</th>' +
              '<th class="p-2.5 text-center">جاهز للتسليم</th>' +
              '<th class="p-2.5 text-center">إجمالي المفتوح</th>' +
              '<th class="p-2.5">نسبة الضغط الحالي</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody class="divide-y divide-slate-100 dark:divide-slate-800">' + trsHtml + '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>';
  }

  function buildMonthlyEvaluationSectionHtml() {
    const ym = state.evalMonth || curMonthIso();
    const isClosed = state.closuresSet.has(ym);
    const snapsMap = state.snapshotsByMonth.get(ym) || new Map();
    const targetsMap = state.targetsByMonth.get(ym) || new Map();
    const staffList = getStaffProfiles();

    const [y, m] = ym.split('-').map(Number);
    const lastDayNum = new Date(y, m, 0).getDate() || 30;
    const mStartDay = dayNum(ym + '-01');
    const mEndDay = dayNum(ym + '-' + String(lastDayNum).padStart(2, '0'));
    const refEndDay = ym === curMonthIso() ? Math.min(mEndDay, dayNum(todayIso())) : mEndDay;

    const lines = (typeof allRequestLines !== 'undefined' && Array.isArray(allRequestLines)) ? allRequestLines : [];
    const txByCode = new Map();
    lines.forEach(function (l) {
      if (l && l.transaction_id && !txByCode.has(String(l.transaction_id))) {
        txByCode.set(String(l.transaction_id), l);
      }
    });

    const evalRows = staffList.map(function (prof) {
      const uid = String(prof.id);
      const liveM = computeEmpWindowMetrics(prof, mStartDay, mEndDay);
      const snap = isClosed ? snapsMap.get(uid) : null;
      const tObj = targetsMap.get(uid) || {};

      const netSales = snap ? num(snap.sales) : liveM.netSales;
      const netUnits = snap ? num(snap.units_count || snap.lines_count) : liveM.netUnits;
      const salesTarget = snap && snap.target != null ? num(snap.target) : num(tObj.target);
      const svcTarget = snap && snap.services_target != null ? num(snap.services_target) : num(tObj.services_target);

      const salesPctTxt = salesTarget > 0 ? (Math.round((netSales / salesTarget) * 100) + '% (' + fmtMoney(netSales) + ' / ' + fmtMoney(salesTarget) + ')') : (fmtMoney(netSales) + ' (بدون تارجت مبلغ)');
      const svcPctTxt = svcTarget > 0 ? (Math.round((netUnits / svcTarget) * 100) + '% (' + fmtInt(netUnits) + ' / ' + fmtInt(svcTarget) + ' خدمة)') : (fmtInt(netUnits) + ' خدمة (بدون تارجت خدمات)');

      let lateEdits24h = null;
      if (state.auditAvailable && Array.isArray(state.auditRows)) {
        lateEdits24h = 0;
        state.auditRows.forEach(function (a) {
          if (!a || !a.at || a.action === 'created') return;
          if (String(a.at).slice(0, 7) !== ym) return;
          const p = matchProfile(a.user_name);
          const isSame = (p && String(p.id) === uid) || (normStr(a.user_name) === normStr(prof.full_name));
          if (!isSame) return;
          const origTx = a.transaction_id ? txByCode.get(String(a.transaction_id)) : null;
          if (!origTx) return;
          const rTs = new Date(lineDate(origTx)).getTime();
          const aTs = new Date(a.at).getTime();
          if (Number.isFinite(rTs) && Number.isFinite(aTs) && (aTs - rTs) > LATE_EDIT_HOURS * 3600 * 1000) {
            lateEdits24h++;
          }
        });
      }

      let lateEndOfMonth = 0;
      lines.forEach(function (l) {
        if (!l || !isLineForProfile(l, prof)) return;
        const rStr = String(lineDate(l) || '');
        if (rStr.slice(0, 7) !== ym) return;
        const rf = getLineRefundInfo(l.id);
        if (rf && rf.isFull) return;

        const dur = num(l.duration_days);
        if (dur <= 0) return;
        const rDay = dayNum(rStr);
        const baseDay = !isNaN(dayNum(l.exec_start_date)) ? dayNum(l.exec_start_date) : rDay;
        if (isNaN(baseDay)) return;
        const dueDay = baseDay + dur;
        if (dueDay > refEndDay) return;

        const st = l.status || 'In Progress';
        if (st === 'Delivered') {
          const dDay = dayNum(l.delivered_date);
          if (!isNaN(dDay) && dDay > dueDay) lateEndOfMonth++;
        } else if (st !== 'Complete') {
          lateEndOfMonth++;
        }
      });

      return {
        prof: prof,
        salesPctTxt: salesPctTxt,
        svcPctTxt: svcPctTxt,
        avgSpeedTxt: liveM.avgSpeed != null ? (liveM.avgSpeed + ' يوم') : 'غير متاح',
        refundsTxt: fmtInt(liveM.refundCount) + ' استرداد (' + fmtInt(liveM.refundUnits) + ' خدمة)',
        lateEditsTxt: lateEdits24h != null ? (fmtInt(lateEdits24h) + ' تعديل') : 'غير متاح',
        lateEndTxt: fmtInt(lateEndOfMonth) + ' بند'
      };
    });

    const monthsOpts = availableMonthsList().map(function (m) {
      return '<option value="' + eh(m) + '"' + (m === ym ? ' selected' : '') + '>' + eh(monthLabelAr(m)) + (state.closuresSet.has(m) ? ' (شهر مقفول — Snapshot)' : (m === curMonthIso() ? ' (الشهر الحالي — حي)' : '')) + '</option>';
    }).join('');

    const trsHtml = evalRows.map(function (r) {
      return '<tr>' +
        '<td class="p-2.5 font-bold text-ink dark:text-white whitespace-nowrap">' + eh(r.prof.full_name || 'موظف') + '</td>' +
        '<td class="p-2.5">' +
          '<div class="font-semibold text-ink dark:text-white">' + eh(r.salesPctTxt) + '</div>' +
          '<div class="text-[11px] text-slate-500 mt-0.5">' + eh(r.svcPctTxt) + '</div>' +
        '</td>' +
        '<td class="p-2.5 text-center font-mono">' + eh(r.avgSpeedTxt) + '</td>' +
        '<td class="p-2.5 text-center font-mono">' + eh(r.refundsTxt) + '</td>' +
        '<td class="p-2.5 text-center font-mono">' + eh(r.lateEditsTxt) + '</td>' +
        '<td class="p-2.5 text-center font-mono font-bold">' + eh(r.lateEndTxt) + '</td>' +
      '</tr>';
    }).join('');

    return '<div class="card p-4 sm:p-5 space-y-3">' +
      '<div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">' +
        '<div>' +
          '<h3 class="font-bold text-sm sm:text-base text-ink dark:text-white flex items-center gap-2">' +
            '<i class="fa-solid fa-calendar-check text-violet-500"></i>' +
            '<span>59. ملخص الوقائع الشهري — ' + eh(monthLabelAr(ym)) + '</span>' +
            (isClosed ? '<span class="rounded-full bg-slate-200 dark:bg-slate-700 px-2.5 py-0.5 text-[10px] font-bold">من لقطة الشهر المقفول (month_snapshots)</span>' : '<span class="rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 px-2.5 py-0.5 text-[10px] font-bold">حساب حي</span>') +
          '</h3>' +
          '<p class="text-[11px] text-slate-500 mt-0.5">أرقام ووقائع فعلية فقط بدون درجات أو نجوم أو تقييم لفظي · ' + (isMgr() ? 'يعرض الفريق بالترتيب الأبجدي' : 'يعرض أرقام حسابك أنت فقط') + '</p>' +
        '</div>' +
        '<div class="flex items-center gap-2">' +
          '<label class="text-xs font-semibold text-slate-500" for="tp49-eval-month">الشهر:</label>' +
          '<select id="tp49-eval-month" class="field !w-56 !py-1.5 text-xs font-bold">' + monthsOpts + '</select>' +
        '</div>' +
      '</div>' +
      '<div class="overflow-x-auto">' +
        '<table class="w-full text-right text-xs">' +
          '<thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-100 dark:border-slate-800">' +
            '<tr>' +
              '<th class="p-2.5">الموظف</th>' +
              '<th class="p-2.5">تحقيق التارجت (مبلغ وخدمات)</th>' +
              '<th class="p-2.5 text-center">متوسط سرعة التسليم</th>' +
              '<th class="p-2.5 text-center">الاستردادات المعتمدة</th>' +
              '<th class="p-2.5 text-center">تعديلات بعد 24 ساعة</th>' +
              '<th class="p-2.5 text-center">المتأخر في نهاية الفترة</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody class="divide-y divide-slate-100 dark:divide-slate-800">' + trsHtml + '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>';
  }

  function buildPermissionsMatrixSectionHtml() {
    if (!isMgr()) return '';
    const matrix = [
      ['الرئيسية وملخص اليوم (home)', 'كامل (إحصائيات القسم والفريق)', 'متاح (إحصائيات الشغل وتنبيهات اليوم)', 'غير متاح (معزول في بوابة المنفذ)'],
      ['طلب جديد والمعاملات والبحث (new / tx / search)', 'كامل (إضافة، تعديل، حذف ناعم، تغيير حالات)', 'متاح (إضافة، تعديل، وتحديث الحالات)', 'غير متاح'],
      ['شيت المنفذين الداخلي ومتابعة الشغل (exec / wtrack)', 'كامل + تصدير التقرير الشهري Excel للمدير', 'متابعة وتحديث الحالات وتصدير الجدول', 'غير متاح'],
      ['شيت الكاش وتقفيل الكاش (cash)', 'كامل + مراجعة وإلغاء تقفيل الكاش لكل الموظفين', 'متابعة الكاش وتأكيد تقفيل الكاش الشخصي', 'غير متاح'],
      ['الإيصالات والطباعة المجمعة (receipt / batchprint)', 'كامل', 'كامل', 'غير متاح'],
      ['الاستردادات على البنود (line_refunds)', 'اعتماد فوري أو موافقة/رفض الطلبات المعلّقة', 'تقديم طلب استرداد بانتظار موافقة المدير', 'قراءة الاستردادات المعتمدة على بنوده فقط'],
      ['الكوميشن والتارجت وكشف العمولة (comm)', 'كامل لجميع الموظفين + ضبط التارجت وقفل الشهر', 'يرى كوميشنه وتارجته وكشفه الشخصي فقط', 'غير متاح (تُحجب الأسعار والعمولات تماماً)'],
      ['الداش بورد الشاملة (dash)', 'كامل + العمليات المكمّلة (مهام/مناديب/حضور)', 'إحصائيات الشغل العامة', 'غير متاح'],
      ['أداء الفريق والتقييم الشهري (teamperf)', 'كامل (لوحة الأداء، الأقل ضغطًا، التقييم الشهري للكل، الصلاحيات)', 'يرى كارت "شغلي النهاردة" والتقييم الشهري لنفسه فقط', 'غير متاح'],
      ['الملخص الأسبوعي / تقدمي (wk)', 'ملخص الأسبوع لكل موظف مقارنةً بأسبوعه السابق', 'شاشة "تقدمي" الشخصية للموظف فقط', 'غير متاح'],
      ['الشات والمهام وملاحظاتي (chat / tasks / notes)', 'كامل + إسناد وتذكير المهام', 'كامل للمحادثات ومهامه وملاحظاته الشخصية', 'غير متاح'],
      ['استفسارات العملاء (inquiries)', 'للمدير فقط (قراءة والرد العام أو الداخلي)', 'غير متاح (محمي بـ RLS للمدير فقط)', 'غير متاح'],
      ['الموارد البشرية والمناديب (hr / couriers)', 'إدارة كاملة (مرتبات، اعتماد إجازات، شيفتات، تقفيل مناديب)', 'تسجيل حضور/انصراف وطلب إجازة وتسجيل مشاوير', 'غير متاح'],
      ['إدارة المنفذين الخارجيين (partners)', 'للمدير فقط (ربط/إيقاف حسابات ومعاينة البوابة)', 'غير متاح', 'يرى بوابتة المعزولة وطلباته المسندة فقط'],
      ['النسخة الاحتياطية وحالة النظام (backup / status)', 'للمدير فقط', 'غير متاح', 'غير متاح']
    ];

    const trs = matrix.map(function (row) {
      return '<tr>' +
        '<td class="p-2.5 font-bold text-ink dark:text-white">' + eh(row[0]) + '</td>' +
        '<td class="p-2.5 text-emerald-700 dark:text-emerald-300 font-semibold">' + eh(row[1]) + '</td>' +
        '<td class="p-2.5 text-sky-700 dark:text-sky-300">' + eh(row[2]) + '</td>' +
        '<td class="p-2.5 text-slate-500 dark:text-slate-400">' + eh(row[3]) + '</td>' +
      '</tr>';
    }).join('');

    return '<div class="card p-4 sm:p-5 space-y-3">' +
      '<div>' +
        '<h3 class="font-bold text-sm sm:text-base text-ink dark:text-white flex items-center gap-2">' +
          '<i class="fa-solid fa-user-shield text-amber-500"></i>' +
          '<span>60. دليل الصلاحيات الحالي في النظام (النسخة الأولى — للقراءة فقط)</span>' +
        '</h3>' +
        '<p class="text-[11px] text-slate-500 mt-0.5">يوضّح "مين يشوف إيه" حسب الأدوار الثلاثة المطبّقة في قاعدة البيانات (RLS). تخصيص الصلاحيات لكل موظف على حدة مؤجّل للمرحلة 13.</p>' +
      '</div>' +
      '<div class="overflow-x-auto">' +
        '<table class="w-full text-right text-xs">' +
          '<thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-100 dark:border-slate-800">' +
            '<tr>' +
              '<th class="p-2.5">الشاشة / الميزة</th>' +
              '<th class="p-2.5">المدير (manager)</th>' +
              '<th class="p-2.5">الموظف الداخلي (staff)</th>' +
              '<th class="p-2.5">المنفذ الخارجي (partner)</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody class="divide-y divide-slate-100 dark:divide-slate-800">' + trs + '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>';
  }

  function renderTeamPerfTab() {
    const pane = $('tab-teamperf');
    if (!pane || isPartner() || pane.classList.contains('hidden')) return;

    const mgr = isMgr();
    pane.innerHTML =
      '<div class="space-y-4">' +
        '<div class="card p-4 flex flex-wrap items-center justify-between gap-3">' +
          '<div class="flex items-center gap-3">' +
            '<span class="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white"><i class="fa-solid fa-chart-line"></i></span>' +
            '<div>' +
              '<h2 class="font-bold text-ink dark:text-white text-sm sm:text-base">' + (mgr ? 'أداء الفريق ومتابعة التارجت والتقييم الشهري' : 'أداء شغلي ومتابعة التارجت والتقييم الشهري') + '</h2>' +
              '<p class="text-xs text-slate-500 mt-0.5">' +
                (state.busy ? 'جاري تحديث البيانات...' : ('تحديث يدوي عند فتح التاب فقط' + (state.checkedAt ? ' · آخر تحديث: ' + eh(state.checkedAt) : ''))) +
              '</p>' +
            '</div>' +
          '</div>' +
          '<button id="tp49-refresh-btn" type="button" ' + (state.busy ? 'disabled' : '') + ' class="tp49-act-btn rounded-xl bg-brand-600 hover:bg-brand-700 px-4 py-2 text-xs font-bold text-white shadow-sm disabled:opacity-60 flex items-center gap-1.5">' +
            '<i class="fa-solid fa-rotate"></i><span>' + (state.busy ? 'جاري التحديث...' : 'تحديث') + '</span>' +
          '</button>' +
        '</div>' +

        buildTransparencyCardHtml() +
        buildMyDayCardHtml() +
        (mgr ? buildManagerStaffCardsSectionHtml() : '') +
        (mgr ? buildLeastLoadedSectionHtml() : '') +
        buildMonthlyEvaluationSectionHtml() +
        (mgr ? buildPermissionsMatrixSectionHtml() : '') +
      '</div>';
  }

  function placeBtnInPerfGroup(btn) {
    const menu = $('nav-menu');
    if (!menu || !btn) return;
    const perfBody = menu.querySelector(':scope > section[data-mg="perf"] .mg-body');
    if (perfBody) {
      btn.dataset.mgi = '3';
      if (btn.parentElement !== perfBody) perfBody.appendChild(btn);
      return;
    }
    const dashBtn = $('tab-dash-btn');
    if (dashBtn && dashBtn.parentElement === menu) {
      dashBtn.insertAdjacentElement('afterend', btn);
    } else {
      const foot = menu.querySelector(':scope > .r-logout-menu');
      if (foot) menu.insertBefore(btn, foot);
      else menu.appendChild(btn);
    }
  }

  function removeTeamPerfUi() {
    const b = $('tab-teamperf-btn');
    if (b) b.remove();
    const p = $('tab-teamperf');
    if (p) p.remove();
  }

  function ensureTeamPerfTab() {
    if (isPartner() || typeof currentUser === 'undefined' || !currentUser) {
      removeTeamPerfUi();
      return false;
    }

    if (!$('tab-teamperf')) {
      const main = document.querySelector('main');
      const host = $('tab-wk') || $('tab-perf') || $('tab-myday') || $('tab-comm') || (main && main.lastElementChild);
      if (!host && !main) return false;
      const pane = document.createElement('div');
      pane.id = 'tab-teamperf';
      pane.className = 'hidden space-y-4';
      if (host) host.insertAdjacentElement('afterend', pane);
      else main.appendChild(pane);

      pane.addEventListener('click', function (e) {
        const t = e.target && e.target.closest ? e.target : null;
        if (!t) return;
        const pBtn = t.closest('[data-tp49-period]');
        if (pBtn) {
          state.period = pBtn.getAttribute('data-tp49-period') || 'today';
          renderTeamPerfTab();
          return;
        }
        if (t.closest('#tp49-refresh-btn')) {
          fetchSupplementaryData();
        }
      });

      pane.addEventListener('change', function (e) {
        if (e.target && e.target.id === 'tp49-eval-month') {
          state.evalMonth = e.target.value || curMonthIso();
          loadMonthTargetsAndSnapshots(state.evalMonth).then(function () {
            renderTeamPerfTab();
          });
        }
      });
    }

    let btn = $('tab-teamperf-btn');
    if (!btn) {
      const menu = $('nav-menu');
      if (!menu) return false;
      btn = document.createElement('button');
      btn.id = 'tab-teamperf-btn';
      btn.type = 'button';
      btn.setAttribute('data-tab-target', 'teamperf');
      btn.className = (typeof currentTab !== 'undefined' && currentTab === 'teamperf') ? BTN_ON : BTN_OFF;
      btn.setAttribute('onclick', "switchTab('teamperf')");
      btn.innerHTML = '<i class="fa-solid fa-chart-line text-teal-500"></i><span>أداء الفريق</span>';
    }
    placeBtnInPerfGroup(btn);
    return true;
  }

  wrap('switchTab', function (orig) {
    return function (id) {
      if (id === 'teamperf' && isPartner()) return;
      const res = orig.apply(this, arguments);
      try {
        ensureTeamPerfTab();
        const pane = $('tab-teamperf');
        const btn = $('tab-teamperf-btn');
        const on = id === 'teamperf' && !isPartner();
        if (pane) pane.classList.toggle('hidden', !on);
        if (btn) btn.className = on ? BTN_ON : BTN_OFF;
        if (on) {
          const sec = btn && btn.closest('.mg');
          if (sec && !sec.classList.contains('open')) {
            sec.classList.add('open');
            const h = sec.querySelector('.mg-head');
            if (h) h.setAttribute('aria-expanded', 'true');
          }
          renderTeamPerfTab();
          if (!state.loadedOnce) fetchSupplementaryData();
        }
      } catch (e) { /* */ }
      return res;
    };
  });

  wrap('refreshLineViews', function (orig) {
    return function () {
      const res = orig.apply(this, arguments);
      try {
        if (typeof currentTab !== 'undefined' && currentTab === 'teamperf') {
          renderTeamPerfTab();
        }
      } catch (e) { /* */ }
      return res;
    };
  });

  wrap('loadInitialData', function (orig) {
    return async function () {
      const res = await orig.apply(this, arguments);
      try {
        ensureTeamPerfTab();
      } catch (e) { /* */ }
      return res;
    };
  });

  wrap('handleLogout', function (orig) {
    return function () {
      try {
        state.loadedOnce = false;
        state.auditRows = null;
        state.auditAvailable = false;
        state.leavesTodaySet = new Set();
        state.closuresSet = new Set();
        state.snapshotsByMonth = new Map();
        state.targetsByMonth = new Map();
        removeTeamPerfUi();
      } catch (e) { /* */ }
      return orig.apply(this, arguments);
    };
  });
})();
