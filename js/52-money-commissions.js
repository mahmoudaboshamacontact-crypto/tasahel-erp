/* =====================================================================
   الجزء ج: المرحلة 8 الفلوس والعمولات (js/52-money-commissions.js)
   الفيتشرز:
   - (31) موافقة المدير على الخصم الكبير (النسبة الافتراضية مؤقتاً 20%، قابلة للتعديل).
   - (32) كشف عمولة PDF مفصل وجاهز للطباعة والتحميل.
   - (33) محتاج كام في اليوم (حاسبة المعدل اليومي المطلوب لتحقيق التارجت لكل موظف وللمدير).
   - (34) قفل الشهر PDF (تقرير إقفال الشهر المالي الشامل للمدير).
   - (35) تنبيه فرق الكاش (مقارنة كاش السيستم بالتقفيل الفعلي وتنبيه فوري بأي عجز أو زيادة).
   - (36) ربحية الخدمات (تحليل إيراد وتكلفة وعمولة وصافي ربح وهامش كل خدمة من allRequestLines).
   - (37) اقتراح سعر ذكي (حساب السعر المقترح لكل خدمة لتحقيق هامش الربح المستهدف).
   - (38) توقع التدفق النقدي (توقع السيولة الداخلة والتزامات التنفيذ خلال 7 و14 و30 يوم).
   - (39) مطابقة المحافظ وطرق الدفع (انستا باي، فودافون كاش، POS، تحويل بنكي، كاش).
   - (40) صافي الربح النهائي للقسم (المبيعات - تكلفة التنفيذ - العمولات - المصاريف الثابتة).
   SQL: sql/part-c-money-commissions.sql
   ===================================================================== */
(function () {
  'use strict';
  if (window.__phase52MoneyCommissions) return;
  window.__phase52MoneyCommissions = true;

  var $ = function (id) { return document.getElementById(id); };
  var eh = function (s) {
    return typeof escapeHtml === 'function'
      ? escapeHtml(s)
      : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
          return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
  };
  var num = function (v) { return Number(v) || 0; };
  var isPartner = function () {
    return window.__role === 'partner' || (document.body && document.body.classList.contains('is-partner-mode'));
  };
  var isMgr = function () {
    if (isPartner()) return false;
    if (window.__role) return window.__role === 'manager';
    try { return typeof canEditTx === 'function' && !!canEditTx(); } catch (e) { return false; }
  };
  var toast = function (m, t, ms) {
    if (typeof showToast === 'function') showToast(m, t || 'success', ms);
  };
  var showErr = function (prefix, err) {
    if (typeof showError === 'function') showError(prefix, err);
    else toast(prefix + ': ' + ((err && (err.message || err.details)) || err), 'error');
  };
  var wrap = function (name, make) {
    var o = window[name];
    if (typeof o !== 'function') return;
    window[name] = make(o);
  };

  var BTN_ON = 'tab-btn bg-ink text-white dark:bg-brand-600 shadow-sm';
  var BTN_OFF = 'tab-btn text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800';
  var DEFAULT_MAX_DISCOUNT_PCT = 20;

  var state = {
    month: new Date().toLocaleDateString('en-CA').slice(0, 7),
    subTab: 'overview', /* 'overview' | 'approvals' | 'daily_need' | 'profitability' | 'wallets' | 'forecast' */
    maxDiscountPct: DEFAULT_MAX_DISCOUNT_PCT,
    fixedExpenses: 0,
    targetMarginPct: 35,
    approvals: [],
    approvalsLoadedAt: 0,
    walletRecs: [],
    walletDate: new Date().toLocaleDateString('en-CA'),
    cashClosingMap: {},
    empTargetsMap: {},
    selectedCommEmp: '',
    busy: false
  };

  function todayIso() { return new Date().toLocaleDateString('en-CA'); }
  function curMonthIso() { return todayIso().slice(0, 7); }
  function getLines() {
    return (typeof allRequestLines !== 'undefined' && Array.isArray(allRequestLines)) ? allRequestLines : [];
  }
  function monthTitleAr(ym) {
    try { return new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric' }).format(new Date(ym + '-01T00:00:00')); }
    catch (e) { return ym; }
  }
  function lineMonthOf(l) {
    var d = typeof lineDate === 'function' ? lineDate(l) : (l.received_at || l.created_at);
    return String(d || '').slice(0, 7);
  }
  function lineDayOf(l) {
    var d = typeof lineDate === 'function' ? lineDate(l) : (l.received_at || l.created_at);
    return String(d || '').slice(0, 10);
  }

  /* حساب صافي البند بعد أي استرداد معتمد */
  function netLineMetrics(l) {
    var m = window.Money ? window.Money.lineNet(l) : null;
    if (!m) return { qty: num(l.qty) || 1, sales: num(l.total), cost: typeof execCostOf === 'function' ? execCostOf(l) : 0, comm: 0, discAmt: 0, refunded: 0 };
    var discPct = num(l.discount_pct);
    var listPr = num(l.list_price) > 0 ? num(l.list_price) : num(l.unit_price);
    var discAmt = discPct > 0 && !m.full ? Math.max(0, listPr * m.qty - m.sales) : 0;
    return { qty: m.qty, sales: m.sales, cost: m.cost, comm: m.comm, discAmt: discAmt, refunded: m.refunded };
  }

  function getAvailableMonths() {
    var set = new Set([curMonthIso(), state.month]);
    getLines().forEach(function (l) {
      var m = lineMonthOf(l);
      if (/^\d{4}-\d{2}$/.test(m)) set.add(m);
    });
    return Array.from(set).sort().reverse();
  }

  /* =====================================================================
     1) موافقة المدير على الخصم الكبير (31 — النسبة مؤقتاً 20%)
     ===================================================================== */
  function checkFormHighDiscounts() {
    var threshold = state.maxDiscountPct || DEFAULT_MAX_DISCOUNT_PCT;
    var container = $('lines-container');
    if (!container) return [];
    var high = [];
    Array.from(container.children).forEach(function (el) {
      var svc = (el.querySelector('.svc-name') && el.querySelector('.svc-name').value.trim()) || '';
      var discInp = el.querySelector('.svc-disc');
      var priceInp = el.querySelector('.svc-price');
      var qtyInp = el.querySelector('.svc-qty');
      var d = discInp && discInp.value !== '' ? num(discInp.value) : num($('discount-pct') && $('discount-pct').value);
      if (svc && d > threshold) {
        high.push({
          el: el,
          service: svc,
          discount_pct: d,
          list_price: priceInp ? num(priceInp.value) : 0,
          qty: qtyInp ? (num(qtyInp.value) || 1) : 1,
          discInp: discInp
        });
      }
    });
    return high;
  }

  /* تنبيه فوري عند كتابة خصم أعلى من 20% في فورم الطلب الجديد */
  document.addEventListener('input', function (e) {
    if (!e.target || !e.target.classList) return;
    if (!e.target.classList.contains('svc-disc') && e.target.id !== 'discount-pct') return;
    var d = num(e.target.value);
    var threshold = state.maxDiscountPct || DEFAULT_MAX_DISCOUNT_PCT;
    var warnId = 'p52-disc-form-warn';
    var oldWarn = $(warnId);
    if (d > threshold && !isMgr()) {
      if (!oldWarn && $('s-disc-row')) {
        $('s-disc-row').insertAdjacentHTML('afterend',
          '<div id="' + warnId + '" class="mt-2 rounded-xl p-2.5 text-[11px] font-bold" style="background:rgba(255,157,108,.16);color:var(--r-acc,#ff9d6c);border:1px solid rgba(255,157,108,.4)">' +
            '<i class="fa-solid fa-shield-halved ms-1"></i>تنبيه: الخصم (' + d + '%) أكبر من الحد المسموح تلقائياً (' + threshold + '%). عند الحفظ هيتم إرسال طلب موافقة للمدير وتطبيق الخصم فور اعتماده.' +
          '</div>');
      }
    } else if (oldWarn) {
      oldWarn.remove();
    }
  });

  /* لف handleSaveOrder لإنشاء طلب موافقة خصم تلقائياً لو الموظف مش مدير والخصم > 20% */
  wrap('handleSaveOrder', function (orig) {
    return async function (e) {
      if (isMgr()) return orig.apply(this, arguments);
      var highList = checkFormHighDiscounts();
      if (!highList.length) return orig.apply(this, arguments);

      var threshold = state.maxDiscountPct || DEFAULT_MAX_DISCOUNT_PCT;
      var tx = ($('tx-id') && $('tx-id').value.trim()) || '';
      var clientName = ($('client-name') && $('client-name').value.trim()) || '';
      var reason = window.prompt(
        'الخصم المدخل أكبر من ' + threshold + '% ويحتاج موافقة المدير.\n' +
        'اكتب سبب الخصم علشان المعاملة تتحفظ بالسعر الأساسي مؤقتاً ويتبعت طلب موافقة للمدير:',
        'خصم خاص للعميل'
      );
      if (reason === null) {
        toast('تم إلغاء الحفظ لتعديل نسبة الخصم', 'info');
        return;
      }

      /* تصفير الخصم الكبير مؤقتاً في الحقول قبل الحفظ حتى لا يُطبق بدون موافقة المدير */
      highList.forEach(function (item) {
        if (item.discInp) item.discInp.value = '0';
      });
      if ($('discount-pct') && num($('discount-pct').value) > threshold) {
        $('discount-pct').value = '';
      }
      if (typeof calculateTotals === 'function') calculateTotals();

      var res = await orig.apply(this, arguments);

      if (sbClient && currentUser && tx) {
        var reqName = (typeof myProfile !== 'undefined' && myProfile && myProfile.full_name) || (currentUser && currentUser.email) || 'موظف';
        var rowsToInsert = highList.map(function (item) {
          var reqUnit = Math.round(item.list_price * (1 - item.discount_pct / 100) * 100) / 100;
          return {
            transaction_id: tx,
            client_name: clientName,
            service: item.service,
            qty: item.qty,
            list_price: item.list_price,
            requested_discount_pct: item.discount_pct,
            requested_unit_price: reqUnit,
            reason: (reason || '').trim() || 'طلب خصم كبير',
            status: 'pending',
            requested_by: currentUser.id,
            requested_by_name: reqName
          };
        });
        var ins = await sbClient.from('discount_approvals').insert(rowsToInsert);
        if (ins.error) {
          showErr('تم حفظ المعاملة ولكن تعذّر تسجيل طلب موافقة الخصم (تأكد من تشغيل sql/part-c-money-commissions.sql)', ins.error);
        } else {
          toast('تم إرسال طلب موافقة على الخصم (' + highList[0].discount_pct + '%) للمدير للمعاملة ' + tx, 'info', 6000);
        }
      }
      var w = $('p52-disc-form-warn');
      if (w) w.remove();
      return res;
    };
  });

  window.p52DecideDiscount = async function (id, decision) {
    if (!isMgr()) return toast('الاعتماد للمدير فقط', 'error');
    if (!sbClient || state.busy) return;
    var note = decision === 'rejected' ? (window.prompt('سبب رفض الخصم (اختياري):', '') || '') : '';
    state.busy = true;
    try {
      var r = await sbClient.rpc('decide_discount_approval', {
        p_id: Number(id),
        p_decision: decision,
        p_note: note || null
      });
      if (r.error) {
        showErr('تعذّر تنفيذ القرار', r.error);
        return;
      }
      toast(decision === 'approved' ? 'تم اعتماد الخصم وتحديث سعر المعاملة ✓' : 'تم رفض طلب الخصم');
      if (typeof loadRecentRequests === 'function') await loadRecentRequests();
      await loadFinanceRemoteData(true);
      renderFinanceTab();
    } finally {
      state.busy = false;
    }
  };

  /* =====================================================================
     2) تحميل بيانات المالية والاعتمادات من Supabase عند فتح التاب فقط
     ===================================================================== */
  async function loadFinanceRemoteData(force) {
    if (!sbClient || !currentUser) return;
    if (!force && Date.now() - state.approvalsLoadedAt < 60000) return;
    state.approvalsLoadedAt = Date.now();

    try {
      var ym = state.month || curMonthIso();
      var queries = [
        sbClient.from('discount_approvals').select('*').order('created_at', { ascending: false }).limit(80),
        sbClient.from('finance_month_settings').select('*').eq('month', ym).maybeSingle(),
        sbClient.from('wallet_reconciliations').select('*').eq('rec_date', state.walletDate),
        sbClient.from('emp_targets').select('user_id,target,services_target').eq('month', ym),
        sbClient.from('cash_closings').select('*').gte('day', ym + '-01').lte('day', ym + '-31')
      ];

      var results = await Promise.all(queries.map(function (p) {
        return p.catch(function (e) { return { error: e }; });
      }));

      if (results[0] && !results[0].error && Array.isArray(results[0].data)) {
        state.approvals = results[0].data;
      }
      if (results[1] && !results[1].error && results[1].data) {
        state.fixedExpenses = num(results[1].data.fixed_expenses);
        state.maxDiscountPct = num(results[1].data.max_discount_pct) || DEFAULT_MAX_DISCOUNT_PCT;
        state.targetMarginPct = num(results[1].data.target_margin_pct) || 35;
      } else {
        try {
          var locSet = JSON.parse(localStorage.getItem('ts_fin_settings_' + ym) || '{}');
          state.fixedExpenses = num(locSet.fixed_expenses);
          state.maxDiscountPct = num(locSet.max_discount_pct) || DEFAULT_MAX_DISCOUNT_PCT;
          state.targetMarginPct = num(locSet.target_margin_pct) || 35;
        } catch (e) { /* */ }
      }
      if (results[2] && !results[2].error && Array.isArray(results[2].data)) {
        state.walletRecs = results[2].data;
      }
      if (results[3] && !results[3].error && Array.isArray(results[3].data)) {
        var tm = {};
        results[3].data.forEach(function (x) {
          if (x && x.user_id) tm[String(x.user_id)] = { target: num(x.target), services_target: num(x.services_target) };
        });
        state.empTargetsMap = tm;
      }
      if (results[4] && !results[4].error && Array.isArray(results[4].data)) {
        var cm = {};
        results[4].data.forEach(function (x) {
          if (x && x.day) cm[String(x.day).slice(0, 10)] = x;
        });
        state.cashClosingMap = cm;
      }
    } catch (e) { /* */ }
  }

  /* =====================================================================
     3) حسابات صافي الربح (40)، ربحية الخدمات (36)، اقتراح السعر (37)،
        توقع التدفق (38)، محتاج كام في اليوم (33)، وتنبيه فرق الكاش (35)
     ===================================================================== */
  function computeMonthFinancials(ym) {
    var monthLines = getLines().filter(function (l) { return lineMonthOf(l) === ym; });
    var grossSales = 0, netSales = 0, totalCost = 0, totalComm = 0, totalDisc = 0, totalRefunded = 0, totalUnits = 0;
    var txSet = new Set();
    var byPay = new Map();
    var byService = new Map();
    var byEmp = new Map();

    ['كاش', 'انستا باي', 'فودافون كاش', 'POS', 'تحويل بنكي'].forEach(function (m) {
      byPay.set(m, 0);
    });

    monthLines.forEach(function (l) {
      var m = netLineMetrics(l);
      grossSales += num(l.total);
      netSales += m.sales;
      totalCost += m.cost;
      totalComm += m.comm;
      totalDisc += m.discAmt;
      totalRefunded += m.refunded;
      totalUnits += m.qty;
      if (l.transaction_id) txSet.add(String(l.transaction_id));

      var pay = (l.payment_method || 'كاش').trim() || 'كاش';
      byPay.set(pay, (byPay.get(pay) || 0) + m.sales);

      var svc = (l.service || 'خدمة غير محددة').trim();
      var sEntry = byService.get(svc);
      if (!sEntry) {
        sEntry = {
          service: svc,
          qty: 0,
          sales: 0,
          cost: 0,
          comm: 0,
          profit: 0,
          unitPrices: [],
          unitCosts: [],
          unitComms: []
        };
        byService.set(svc, sEntry);
      }
      sEntry.qty += m.qty;
      sEntry.sales += m.sales;
      sEntry.cost += m.cost;
      sEntry.comm += m.comm;
      sEntry.profit += (m.sales - m.cost - m.comm);
      if (num(l.unit_price) > 0) sEntry.unitPrices.push(num(l.unit_price));
      if (num(l.exec_unit_cost) >= 0) sEntry.unitCosts.push(num(l.exec_unit_cost));
      if (m.qty > 0) sEntry.unitComms.push(m.comm / m.qty);

      var emp = (l.employee || 'غير محدد').trim();
      var eEntry = byEmp.get(emp);
      if (!eEntry) {
        eEntry = { employee: emp, qty: 0, sales: 0, comm: 0, txSet: new Set(), lines: [] };
        byEmp.set(emp, eEntry);
      }
      eEntry.qty += m.qty;
      eEntry.sales += m.sales;
      eEntry.comm += m.comm;
      if (l.transaction_id) eEntry.txSet.add(String(l.transaction_id));
      eEntry.lines.push({ line: l, metrics: m });
    });

    var servicesList = Array.from(byService.values()).map(function (s) {
      var marginPct = s.sales > 0 ? Math.round((s.profit / s.sales) * 1000) / 10 : 0;
      var avgPrice = s.unitPrices.length ? (s.unitPrices.reduce(function (a, b) { return a + b; }, 0) / s.unitPrices.length) : 0;
      var avgCost = s.unitCosts.length ? (s.unitCosts.reduce(function (a, b) { return a + b; }, 0) / s.unitCosts.length) : 0;
      var avgComm = s.unitComms.length ? (s.unitComms.reduce(function (a, b) { return a + b; }, 0) / s.unitComms.length) : 0;
      var targetM = Math.min(0.85, Math.max(0.1, (state.targetMarginPct || 35) / 100));
      var rawSuggested = (avgCost + avgComm) > 0 ? ((avgCost + avgComm) / (1 - targetM)) : avgPrice;
      var suggestedPrice = Math.max(avgPrice, Math.ceil(rawSuggested / 5) * 5);
      return Object.assign({}, s, {
        marginPct: marginPct,
        avgPrice: Math.round(avgPrice),
        avgCost: Math.round(avgCost),
        avgComm: Math.round(avgComm * 10) / 10,
        suggestedPrice: suggestedPrice,
        needsPriceRaise: marginPct < (state.targetMarginPct || 35) && suggestedPrice > avgPrice
      });
    }).sort(function (a, b) { return b.profit - a.profit; });

    var netProfitBeforeFixed = netSales - totalCost - totalComm;
    var finalNetProfit = netProfitBeforeFixed - num(state.fixedExpenses);
    var netMarginPct = netSales > 0 ? Math.round((finalNetProfit / netSales) * 1000) / 10 : 0;

    return {
      ym: ym,
      txCount: txSet.size,
      totalUnits: totalUnits,
      grossSales: grossSales,
      netSales: netSales,
      totalCost: totalCost,
      totalComm: totalComm,
      totalDisc: totalDisc,
      totalRefunded: totalRefunded,
      fixedExpenses: num(state.fixedExpenses),
      netProfitBeforeFixed: netProfitBeforeFixed,
      finalNetProfit: finalNetProfit,
      netMarginPct: netMarginPct,
      byPay: byPay,
      servicesList: servicesList,
      employeesList: Array.from(byEmp.values()).sort(function (a, b) { return b.comm - a.comm; })
    };
  }

  /* (33) محتاج كام في اليوم لكل موظف */
  function computeRemainingWorkingDaysInMonth(ym) {
    var now = new Date();
    var curYm = now.toLocaleDateString('en-CA').slice(0, 7);
    var parts = ym.split('-').map(Number);
    var year = parts[0], month = parts[1];
    var lastDay = new Date(year, month, 0).getDate();
    if (ym < curYm) return 0;
    var startDay = ym === curYm ? now.getDate() : 1;
    var working = 0;
    for (var d = startDay; d <= lastDay; d++) {
      var dt = new Date(year, month - 1, d);
      if (dt.getDay() !== 5) working++; /* استبعاد الجمعة */
    }
    return Math.max(1, working);
  }

  function computeDailyNeedRows(ym) {
    var fin = computeMonthFinancials(ym);
    var remDays = computeRemainingWorkingDaysInMonth(ym);
    var profs = (typeof profiles !== 'undefined' && Array.isArray(profiles)) ? profiles : [];
    var rows = [];

    fin.employeesList.forEach(function (e) {
      var p = typeof profileByName === 'function' ? profileByName(e.employee) : profs.find(function (x) { return x.full_name === e.employee; });
      var uid = p ? String(p.id) : '';
      var isMe = currentUser && uid === String(currentUser.id);
      if (!isMgr() && !isMe) return;

      var tObj = (uid && state.empTargetsMap[uid]) || (uid && window.__homeTargetsMap && window.__homeTargetsMap[uid]) || {};
      var salesTarget = num(tObj.target) || 50000;
      var svcTarget = num(tObj.services_target) || 100;

      var remSales = Math.max(0, salesTarget - e.sales);
      var remSvcs = Math.max(0, svcTarget - e.qty);

      rows.push({
        employee: e.employee,
        uid: uid,
        salesDone: e.sales,
        salesTarget: salesTarget,
        salesPct: Math.min(100, Math.round((e.sales / Math.max(1, salesTarget)) * 100)),
        dailySalesNeed: Math.ceil(remSales / remDays),
        svcDone: e.qty,
        svcTarget: svcTarget,
        svcPct: Math.min(100, Math.round((e.qty / Math.max(1, svcTarget)) * 100)),
        dailySvcNeed: Math.ceil((remSvcs / remDays) * 10) / 10,
        commEarned: e.comm,
        remDays: remDays
      });
    });

    return rows;
  }

  /* (38) توقع التدفق النقدي (7، 14، 30 يوم) */
  function computeCashFlowForecast() {
    var cutoffMs = Date.now() - 30 * 86400000;
    var in30 = 0, out30 = 0, openReceivables = 0, openPayables = 0;

    getLines().forEach(function (l) {
      var m = netLineMetrics(l);
      var dStr = lineDayOf(l);
      var t = dStr ? new Date(dStr + 'T00:00:00').getTime() : 0;
      if (t >= cutoffMs) {
        in30 += m.sales;
        out30 += (m.cost + m.comm);
      }
      var st = l.status || 'In Progress';
      if (st !== 'Delivered') {
        openPayables += m.cost;
        openReceivables += m.sales * 0.15;
      }
    });

    var dailyIn = in30 / 30;
    var dailyOut = (out30 + num(state.fixedExpenses)) / 30;
    var dailyNet = dailyIn - dailyOut;

    return {
      dailyIn: Math.round(dailyIn),
      dailyOut: Math.round(dailyOut),
      dailyNet: Math.round(dailyNet),
      openPayables: Math.round(openPayables),
      horizons: [7, 14, 30].map(function (days) {
        var expIn = Math.round(dailyIn * days);
        var expOut = Math.round(dailyOut * days + (days <= 14 ? openPayables * 0.5 : openPayables));
        return {
          days: days,
          expectedIn: expIn,
          expectedOut: expOut,
          expectedNet: expIn - expOut
        };
      })
    };
  }

  /* (35) تنبيه فرق الكاش اليومي */
  function computeCashDiscrepancy(dateStr) {
    var day = dateStr || todayIso();
    var sysCash = 0;
    getLines().forEach(function (l) {
      if (lineDayOf(l) !== day) return;
      if ((l.payment_method || 'كاش').trim() !== 'كاش') return;
      sysCash += netLineMetrics(l).sales;
    });

    var recWallet = state.walletRecs.find(function (w) { return w.rec_date === day && w.method === 'كاش'; });
    var closeRow = state.cashClosingMap[day];
    var actualCash = recWallet ? num(recWallet.actual_amount) : (closeRow && closeRow.actual_cash != null ? num(closeRow.actual_cash) : null);
    if (actualCash == null) {
      try {
        var loc = localStorage.getItem('ts_actual_cash_' + day);
        if (loc != null && loc !== '') actualCash = num(loc);
      } catch (e) { /* */ }
    }
    var diff = actualCash != null ? (actualCash - sysCash) : 0;
    return {
      day: day,
      sysCash: Math.round(sysCash),
      actualCash: actualCash != null ? Math.round(actualCash) : null,
      diff: Math.round(diff),
      hasDiscrepancy: actualCash != null && Math.abs(diff) >= 1
    };
  }

  /* =====================================================================
     4) تصدير كشف عمولة PDF (32) وتقرير قفل الشهر PDF (34)
     ===================================================================== */
  async function generateHtmlPdf(title, subtitle, kpis, headers, rows, filename, footerNotes) {
    var host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-10000px;top:0;width:1080px;background:#ffffff;color:#0f172a;padding:28px;font-family:\'IBM Plex Sans Arabic\',Tahoma,sans-serif;direction:rtl;z-index:-1';
    host.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #e8590c;padding-bottom:12px;margin-bottom:14px">' +
        '<div>' +
          '<div style="font-size:13px;font-weight:700;color:#64748b">تساهيل | قسم الخدمات الحكومية</div>' +
          '<div style="font-size:20px;font-weight:800;color:#0f172a;margin-top:2px">' + eh(title) + '</div>' +
          '<div style="font-size:12px;color:#475569;margin-top:2px">' + eh(subtitle) + '</div>' +
        '</div>' +
        '<div style="font-size:11px;color:#64748b;text-align:left">' +
          '<div>تاريخ الإصدار: ' + eh(new Date().toLocaleString('ar-EG')) + '</div>' +
        '</div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(' + Math.min(kpis.length, 5) + ',1fr);gap:10px;margin-bottom:14px">' +
        kpis.map(function (k) {
          return '<div style="border:1px solid #cbd5e1;border-radius:10px;padding:10px;background:#f8fafc">' +
            '<div style="font-size:11px;color:#64748b;font-weight:600">' + eh(k[0]) + '</div>' +
            '<div style="font-size:16px;font-weight:800;color:#0f172a;margin-top:4px">' + eh(k[1]) + '</div>' +
          '</div>';
        }).join('') +
      '</div>' +
      '<table style="width:100%;border-collapse:collapse;font-size:11.5px">' +
        '<thead><tr>' +
          headers.map(function (h) {
            return '<th style="padding:8px 6px;border:1px solid #334155;background:#1e293b;color:#ffffff;text-align:right">' + eh(h) + '</th>';
          }).join('') +
        '</tr></thead>' +
        '<tbody>' +
          rows.map(function (r, idx) {
            return '<tr style="background:' + (idx % 2 ? '#f8fafc' : '#ffffff') + '">' +
              r.map(function (c) {
                return '<td style="padding:6px;border:1px solid #cbd5e1">' + eh(c == null ? '—' : c) + '</td>';
              }).join('') +
            '</tr>';
          }).join('') +
        '</tbody>' +
      '</table>' +
      (footerNotes ? '<div style="margin-top:14px;padding:10px;border-radius:8px;background:#fff7ed;border:1px solid #fed7aa;font-size:11.5px;color:#9a3412">' + eh(footerNotes) + '</div>' : '') +
      '<div style="margin-top:24px;display:flex;justify-content:space-between;font-size:12px;color:#475569;padding-top:12px;border-top:1px dashed #cbd5e1">' +
        '<span>توقيع الموظف: ............................</span>' +
        '<span>مراجعة الحسابات: ............................</span>' +
        '<span>اعتماد مدير القسم: ............................</span>' +
      '</div>';

    document.body.appendChild(host);
    try {
      if (window.html2canvas && window.jspdf) {
        toast('جارٍ تجهيز ملف الـ PDF...', 'info', 2500);
        var canvas = await window.html2canvas(host, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
        var pdf = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
        var W = 297, H = 210;
        var w = W, h = canvas.height * W / canvas.width;
        if (h > H) { h = H; w = canvas.width * H / canvas.height; }
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', (W - w) / 2, 0, w, h);
        pdf.save(filename);
        toast('تم تحميل ملف PDF بنجاح ✓');
      } else if ($('print-content')) {
        $('print-content').innerHTML = host.innerHTML;
        window.print();
      }
    } catch (e) {
      showErr('تعذّر تصدير PDF', e);
    } finally {
      host.remove();
    }
  }

  window.p52ExportEmployeeCommPdf = async function (empName) {
    var fin = computeMonthFinancials(state.month);
    var myName = (typeof myProfile !== 'undefined' && myProfile && myProfile.full_name) || '';
    var targetEmp = empName || state.selectedCommEmp || (isMgr() && fin.employeesList[0] ? fin.employeesList[0].employee : myName);
    var empObj = fin.employeesList.find(function (e) { return e.employee === targetEmp; }) || fin.employeesList[0];
    if (!empObj) return toast('لا توجد بيانات عمولة لهذا الموظف في الشهر المحدد', 'info');

    var kpis = [
      ['الموظف', empObj.employee],
      ['الشهر', monthTitleAr(state.month)],
      ['عدد المعاملات', String(empObj.txSet.size)],
      ['إجمالي الخدمات الصافية', fmtNum(empObj.qty)],
      ['صافي العمولة المستحقة', formatCurrency(empObj.comm)]
    ];
    var headers = ['رقم المعاملة', 'التاريخ', 'العميل', 'الخدمة', 'العدد الصافي', 'قيمة البند', 'الحالة', 'عمولة البند'];
    var rows = empObj.lines.slice(0, 120).map(function (item) {
      var l = item.line, m = item.metrics;
      return [
        l.transaction_id || '—',
        lineDayOf(l),
        l.client_name || '—',
        l.service || '—',
        fmtNum(m.qty),
        formatCurrency(m.sales),
        statusLabel(l.status || 'In Progress'),
        formatCurrency(m.comm)
      ];
    });
    await generateHtmlPdf(
      'كشف عمولة شهري مفصل — ' + empObj.employee,
      'الفترة: ' + monthTitleAr(state.month) + ' (بعد استبعاد أي استردادات معتمدة)',
      kpis,
      headers,
      rows,
      'كشف_عمولة_' + empObj.employee + '_' + state.month + '.pdf',
      'إجمالي صافي العمولة المستحقة للصرف: ' + formatCurrency(empObj.comm)
    );
  };

  window.p52ExportMonthClosurePdf = async function () {
    if (!isMgr()) return toast('تقرير قفل الشهر المالي للمدير فقط', 'error');
    var fin = computeMonthFinancials(state.month);
    var kpis = [
      ['إجمالي المبيعات الصافية', formatCurrency(fin.netSales)],
      ['تكلفة التنفيذ', formatCurrency(fin.totalCost)],
      ['إجمالي العمولات', formatCurrency(fin.totalComm)],
      ['المصاريف الثابتة', formatCurrency(fin.fixedExpenses)],
      ['صافي ربح القسم (' + fin.netMarginPct + '%)', formatCurrency(fin.finalNetProfit)]
    ];
    var headers = ['البند / المؤشر', 'القيمة', 'التفاصيل والملاحظات'];
    var rows = [
      ['إجمالي المعاملات والخدمات', fin.txCount + ' معاملة / ' + fmtNum(fin.totalUnits) + ' خدمة', 'الشهر: ' + monthTitleAr(state.month)],
      ['إجمالي المبيعات الصافية (بعد الخصم والمرتجع)', formatCurrency(fin.netSales), 'إجمالي الخصومات الممنوحة: ' + formatCurrency(fin.totalDisc)],
      ['إجمالي تكلفة التنفيذ للمنفذين', formatCurrency(fin.totalCost), 'نسبة التكلفة للمبيعات: ' + (fin.netSales > 0 ? Math.round(fin.totalCost / fin.netSales * 100) : 0) + '%'],
      ['إجمالي عمولات الموظفين', formatCurrency(fin.totalComm), 'عدد الموظفين المستحقين: ' + fin.employeesList.length],
      ['المصاريف الثابتة للقسم', formatCurrency(fin.fixedExpenses), 'إيجار / مرافق / مصروفات إدارية ثابتة'],
      ['صافي الربح النهائي للقسم', formatCurrency(fin.finalNetProfit), 'هامش الربح الصافي: ' + fin.netMarginPct + '%']
    ];
    fin.byPay.forEach(function (val, method) {
      rows.push(['تحصيل طريقة دفع: ' + method, formatCurrency(val), 'من إجمالي مبيعات الشهر']);
    });
    fin.employeesList.forEach(function (e) {
      rows.push(['عمولة موظف: ' + e.employee, formatCurrency(e.comm), fmtNum(e.qty) + ' خدمة — مبيعات: ' + formatCurrency(e.sales)]);
    });

    await generateHtmlPdf(
      'تقرير إقفال الشهر المالي وصافي الربح',
      'الفترة: ' + monthTitleAr(state.month),
      kpis,
      headers,
      rows,
      'قفل_الشهر_' + state.month + '.pdf',
      'صافي ربح القسم النهائي بعد خصم تكاليف التنفيذ والعمولات والمصاريف الثابتة: ' + formatCurrency(fin.finalNetProfit) + ' (' + fin.netMarginPct + '%)'
    );
  };

  /* =====================================================================
     5) حفظ إعدادات الشهر المالي ومطابقة المحافظ
     ===================================================================== */
  window.p52SaveFinanceSettings = async function () {
    if (!isMgr()) return toast('تعديل الإعدادات المالية للمدير فقط', 'error');
    var fixed = num($('p52-inp-fixed') && $('p52-inp-fixed').value);
    var maxDisc = Math.max(0, Math.min(100, num($('p52-inp-maxdisc') && $('p52-inp-maxdisc').value) || DEFAULT_MAX_DISCOUNT_PCT));
    var targetM = Math.max(5, Math.min(95, num($('p52-inp-margin') && $('p52-inp-margin').value) || 35));

    state.fixedExpenses = fixed;
    state.maxDiscountPct = maxDisc;
    state.targetMarginPct = targetM;

    try {
      localStorage.setItem('ts_fin_settings_' + state.month, JSON.stringify({
        fixed_expenses: fixed,
        max_discount_pct: maxDisc,
        target_margin_pct: targetM
      }));
    } catch (e) { /* */ }

    if (sbClient && currentUser) {
      var r = await sbClient.from('finance_month_settings').upsert({
        month: state.month,
        fixed_expenses: fixed,
        max_discount_pct: maxDisc,
        target_margin_pct: targetM,
        updated_by: currentUser.id,
        updated_at: new Date().toISOString()
      }, { onConflict: 'month' });
      if (r.error && !/42P01|PGRST205|does not exist/i.test(r.error.message || '')) {
        return showErr('تعذّر حفظ الإعدادات المالية', r.error);
      }
    }
    toast('تم حفظ إعدادات الشهر المالي ونسبة الخصم (' + maxDisc + '%) ✓');
    renderFinanceTab();
  };

  window.p52SaveWalletReconciliation = async function () {
    if (!isMgr()) return toast('مطابقة المحافظ للمدير فقط', 'error');
    var rows = [];
    document.querySelectorAll('[data-p52-wallet-method]').forEach(function (tr) {
      var method = tr.getAttribute('data-p52-wallet-method');
      var sysAmt = num(tr.getAttribute('data-p52-sys'));
      var actInp = tr.querySelector('.p52-w-actual');
      var noteInp = tr.querySelector('.p52-w-note');
      if (!actInp || actInp.value === '') return;
      rows.push({
        rec_date: state.walletDate,
        method: method,
        system_amount: sysAmt,
        actual_amount: num(actInp.value),
        notes: noteInp ? noteInp.value.trim() : null,
        updated_by: currentUser ? currentUser.id : null,
        updated_by_name: (typeof myProfile !== 'undefined' && myProfile && myProfile.full_name) || 'المدير',
        updated_at: new Date().toISOString()
      });
      if (method === 'كاش') {
        try { localStorage.setItem('ts_actual_cash_' + state.walletDate, String(num(actInp.value))); } catch (e) { /* */ }
      }
    });

    if (!rows.length) return toast('أدخل الرصيد الفعلي لطريقة دفع واحدة على الأقل', 'info');
    state.walletRecs = rows;

    if (sbClient && currentUser) {
      var r = await sbClient.from('wallet_reconciliations').upsert(rows, { onConflict: 'rec_date,method' });
      if (r.error && !/42P01|PGRST205|does not exist/i.test(r.error.message || '')) {
        return showErr('تعذّر حفظ مطابقة المحافظ', r.error);
      }
    }
    toast('تم حفظ مطابقة المحافظ والكاش ليوم ' + state.walletDate + ' ✓');
    renderFinanceTab();
  };

  /* =====================================================================
     6) بناء واجهة تاب «الفلوس والعمولات» (#tab-finance)
     ===================================================================== */
  window.p52SetMonth = async function (ym) {
    state.month = ym;
    await loadFinanceRemoteData(true);
    renderFinanceTab();
  };

  window.p52SetSubTab = function (sub) {
    state.subTab = sub;
    renderFinanceTab();
  };

  window.p52SetWalletDate = async function (dt) {
    state.walletDate = dt || todayIso();
    await loadFinanceRemoteData(true);
    renderFinanceTab();
  };

  function renderFinanceTab() {
    var pane = $('tab-finance');
    if (!pane) return;

    var mgr = isMgr();
    var fin = computeMonthFinancials(state.month);
    var cashDisc = computeCashDiscrepancy(state.walletDate);
    var pendingApprovals = state.approvals.filter(function (a) { return a.status === 'pending'; });
    var dailyRows = computeDailyNeedRows(state.month);

    /* للموظف غير المدير: يعرض شاشة "محتاج كام في اليوم + كشف عمولتي PDF + طلبات الخصم الخاصة بي" */
    if (!mgr && state.subTab !== 'daily_need' && state.subTab !== 'approvals') {
      state.subTab = 'daily_need';
    }

    var cashAlertHtml = (mgr && cashDisc.hasDiscrepancy)
      ? '<div class="p52-alert-banner">' +
          '<div class="flex items-center gap-2.5">' +
            '<i class="fa-solid fa-triangle-exclamation text-base" style="color:var(--r-bad,#ff6b6b)"></i>' +
            '<div>' +
              '<div class="font-bold">تنبيه فرق الكاش (' + eh(cashDisc.day) + '): يوجد ' + (cashDisc.diff < 0 ? 'عجز' : 'زيادة') + ' بقيمة <span class="font-mono">' + eh(formatCurrency(Math.abs(cashDisc.diff))) + '</span></div>' +
              '<div class="text-[11px]" style="color:var(--r-mute)">كاش السيستم: ' + eh(formatCurrency(cashDisc.sysCash)) + ' · الفعلي المسجل: ' + eh(formatCurrency(cashDisc.actualCash)) + '</div>' +
            '</div>' +
          '</div>' +
          '<button type="button" onclick="p52SetSubTab(\'wallets\')" class="p52-btn p52-btn-bad">مراجعة المطابقة</button>' +
        '</div>'
      : '';

    var bodyHtml = '';

    if (state.subTab === 'overview' && mgr) {
      bodyHtml =
        '<div class="p52-kpi-grid">' +
          '<div class="p52-kpi"><div class="p52-kpi-lbl">صافي المبيعات الفعلية</div><div class="p52-kpi-val" style="color:var(--r-acc,#ff9d6c)">' + eh(formatCurrency(fin.netSales)) + '</div><div class="text-[11px] mt-1" style="color:var(--r-mute)">' + fin.txCount + ' معاملة · ' + fmtNum(fin.totalUnits) + ' خدمة</div></div>' +
          '<div class="p52-kpi"><div class="p52-kpi-lbl">تكلفة التنفيذ للمنفذين</div><div class="p52-kpi-val">' + eh(formatCurrency(fin.totalCost)) + '</div><div class="text-[11px] mt-1" style="color:var(--r-mute)">خصومات ممنوحة: ' + eh(formatCurrency(fin.totalDisc)) + '</div></div>' +
          '<div class="p52-kpi"><div class="p52-kpi-lbl">إجمالي عمولات الموظفين</div><div class="p52-kpi-val">' + eh(formatCurrency(fin.totalComm)) + '</div><div class="text-[11px] mt-1" style="color:var(--r-mute)">' + fin.employeesList.length + ' موظف</div></div>' +
          '<div class="p52-kpi"><div class="p52-kpi-lbl">المصاريف الثابتة للقسم</div><div class="p52-kpi-val">' + eh(formatCurrency(fin.fixedExpenses)) + '</div><div class="text-[11px] mt-1" style="color:var(--r-mute)">تُخصم من مجمل الربح</div></div>' +
          '<div class="p52-kpi"><div class="p52-kpi-lbl">صافي الربح النهائي (' + fin.netMarginPct + '%)</div><div class="p52-kpi-val" style="color:' + (fin.finalNetProfit >= 0 ? 'var(--r-ok,#5fd3b3)' : 'var(--r-bad,#ff6b6b)') + '">' + eh(formatCurrency(fin.finalNetProfit)) + '</div><div class="text-[11px] mt-1" style="color:var(--r-mute)">قبل الثابتة: ' + eh(formatCurrency(fin.netProfitBeforeFixed)) + '</div></div>' +
        '</div>' +

        '<div class="p52-card space-y-3 text-xs">' +
          '<div class="font-bold text-sm flex items-center gap-2"><i class="fa-solid fa-sliders" style="color:var(--r-acc)"></i><span>إعدادات الشهر المالي ونسبة موافقة الخصم</span></div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">' +
            '<div><label class="label">المصاريف الثابتة للشهر (ج.م)</label><input id="p52-inp-fixed" type="number" min="0" step="100" value="' + fin.fixedExpenses + '" class="field font-mono" dir="ltr"></div>' +
            '<div><label class="label">نسبة الخصم التي تحتاج موافقة المدير (%)</label><input id="p52-inp-maxdisc" type="number" min="1" max="100" value="' + state.maxDiscountPct + '" class="field font-mono" dir="ltr"></div>' +
            '<div><label class="label">هامش الربح المستهدف لاقتراح السعر (%)</label><input id="p52-inp-margin" type="number" min="5" max="90" value="' + state.targetMarginPct + '" class="field font-mono" dir="ltr"></div>' +
            '<button type="button" onclick="p52SaveFinanceSettings()" class="p52-btn p52-btn-pri !py-2.5"><i class="fa-solid fa-floppy-disk"></i><span>حفظ الإعدادات</span></button>' +
          '</div>' +
        '</div>';
    } else if (state.subTab === 'approvals') {
      bodyHtml =
        '<div class="p52-card space-y-3">' +
          '<div class="flex flex-wrap items-center justify-between gap-2">' +
            '<div>' +
              '<h3 class="font-bold text-sm">طلبات موافقة المدير على الخصم الكبير (أعلى من ' + state.maxDiscountPct + '%)</h3>' +
              '<p class="text-[11px]" style="color:var(--r-mute)">أي خصم يتجاوز ' + state.maxDiscountPct + '% من الموظف يُسجّل هنا للاعتماد، وبمجرد موافقة المدير يتطبّق السعر المخفض تلقائياً على المعاملة.</p>' +
            '</div>' +
            '<span class="p52-pill p52-pill-warn">معلق: ' + pendingApprovals.length + '</span>' +
          '</div>' +
          (state.approvals.length
            ? '<div class="overflow-x-auto"><table class="p52-table"><thead><tr><th>المعاملة</th><th>العميل</th><th>الخدمة</th><th>السعر الأساسي</th><th>الخصم المطلوب</th><th>السعر بعد الخصم</th><th>الموظف والسبب</th><th>الحالة / القرار</th></tr></thead><tbody>' +
                state.approvals.map(function (a) {
                  var stPill = a.status === 'approved'
                    ? '<span class="p52-pill p52-pill-ok">معتمد ✓</span>'
                    : a.status === 'rejected'
                    ? '<span class="p52-pill p52-pill-bad">مرفوض</span>'
                    : '<span class="p52-pill p52-pill-warn">بانتظار المدير</span>';
                  return '<tr>' +
                    '<td class="font-mono" dir="ltr"><button type="button" onclick="openTxModal(\'' + eh(a.transaction_id) + '\')" class="rc-tx-pill !py-0.5 !px-2 !text-[11px]">' + eh(a.transaction_id) + '</button></td>' +
                    '<td>' + eh(a.client_name || '—') + '</td>' +
                    '<td>' + eh(a.service) + ' (×' + fmtNum(a.qty) + ')</td>' +
                    '<td class="font-mono">' + eh(formatCurrency(a.list_price)) + '</td>' +
                    '<td><span class="p52-pill p52-pill-warn">' + fmtNum(a.requested_discount_pct) + '%</span></td>' +
                    '<td class="font-mono font-bold">' + eh(formatCurrency(a.requested_unit_price)) + '</td>' +
                    '<td><div class="font-bold">' + eh(a.requested_by_name || 'موظف') + '</div><div class="text-[11px]" style="color:var(--r-mute)">' + eh(a.reason || '—') + '</div></td>' +
                    '<td>' +
                      (a.status === 'pending' && mgr
                        ? '<div class="flex items-center gap-1.5">' +
                            '<button type="button" onclick="p52DecideDiscount(' + Number(a.id) + ',\'approved\')" class="p52-btn p52-btn-ok !py-1 !px-2.5 !text-[11px]">موافقة</button>' +
                            '<button type="button" onclick="p52DecideDiscount(' + Number(a.id) + ',\'rejected\')" class="p52-btn p52-btn-bad !py-1 !px-2.5 !text-[11px]">رفض</button>' +
                          '</div>'
                        : stPill) +
                    '</td>' +
                  '</tr>';
                }).join('') +
              '</tbody></table></div>'
            : '<div class="py-8 text-center text-xs" style="color:var(--r-mute)">لا توجد طلبات خصم كبير مسجلة حالياً.</div>') +
        '</div>';
    } else if (state.subTab === 'daily_need') {
      bodyHtml =
        '<div class="p52-card space-y-3">' +
          '<div class="flex flex-wrap items-center justify-between gap-2">' +
            '<div>' +
              '<h3 class="font-bold text-sm">محتاج كام في اليوم لتحقيق التارجت + كشف العمولة PDF</h3>' +
              '<p class="text-[11px]" style="color:var(--r-mute)">يحسب المعدل اليومي المطلوب في أيام العمل المتبقية من الشهر (باستبعاد أيام الجمعة).</p>' +
            '</div>' +
            '<div class="flex items-center gap-2">' +
              (mgr
                ? '<select onchange="p52OnSelectCommEmp(this.value)" class="field !w-auto !py-1 text-xs">' +
                    fin.employeesList.map(function (e) {
                      return '<option value="' + eh(e.employee) + '"' + (state.selectedCommEmp === e.employee ? ' selected' : '') + '>' + eh(e.employee) + '</option>';
                    }).join('') +
                  '</select>'
                : '') +
              '<button type="button" onclick="p52ExportEmployeeCommPdf()" class="p52-btn p52-btn-pri"><i class="fa-solid fa-file-pdf"></i><span>تحميل كشف العمولة PDF</span></button>' +
            '</div>' +
          '</div>' +
          (dailyRows.length
            ? '<div class="overflow-x-auto"><table class="p52-table"><thead><tr><th>الموظف</th><th>المبيعات المحققة / التارجت</th><th>محتاج كام مبيعات في اليوم</th><th>الخدمات المحققة / التارجت</th><th>محتاج كام خدمة في اليوم</th><th>صافي العمولة</th><th>كشف PDF</th></tr></thead><tbody>' +
                dailyRows.map(function (r) {
                  return '<tr>' +
                    '<td class="font-bold">' + eh(r.employee) + '</td>' +
                    '<td><div class="font-mono">' + eh(formatCurrency(r.salesDone)) + ' / ' + eh(formatCurrency(r.salesTarget)) + ' (' + r.salesPct + '%)</div></td>' +
                    '<td><span class="p52-pill ' + (r.dailySalesNeed === 0 ? 'p52-pill-ok' : 'p52-pill-warn') + '">' + (r.dailySalesNeed === 0 ? 'حقق التارجت ✓' : eh(formatCurrency(r.dailySalesNeed)) + ' / يوم') + '</span></td>' +
                    '<td><div class="font-mono">' + fmtNum(r.svcDone) + ' / ' + fmtNum(r.svcTarget) + ' (' + r.svcPct + '%)</div></td>' +
                    '<td><span class="p52-pill ' + (r.dailySvcNeed === 0 ? 'p52-pill-ok' : 'p52-pill-warn') + '">' + (r.dailySvcNeed === 0 ? 'حقق التارجت ✓' : fmtNum(r.dailySvcNeed) + ' خدمة / يوم') + '</span></td>' +
                    '<td class="font-mono font-bold" style="color:var(--r-ok,#5fd3b3)">' + eh(formatCurrency(r.commEarned)) + '</td>' +
                    '<td><button type="button" onclick="p52ExportEmployeeCommPdf(\'' + eh(r.employee) + '\')" class="p52-btn !py-1 !px-2.5 !text-[11px]"><i class="fa-solid fa-file-pdf"></i><span>PDF</span></button></td>' +
                  '</tr>';
                }).join('') +
              '</tbody></table></div>'
            : '<div class="py-8 text-center text-xs" style="color:var(--r-mute)">لا توجد معاملات مسجلة في هذا الشهر بعد.</div>') +
        '</div>';
    } else if (state.subTab === 'profitability' && mgr) {
      bodyHtml =
        '<div class="p52-card space-y-3">' +
          '<div>' +
            '<h3 class="font-bold text-sm">ربحية الخدمات (36) + اقتراح السعر الذكي (37)</h3>' +
            '<p class="text-[11px]" style="color:var(--r-mute)">صافي ربح الخدمة = الإيراد الفعلي - تكلفة التنفيذ - عمولة الموظف. السعر المقترح يحقق هامش ربح صافي لا يقل عن ' + state.targetMarginPct + '%.</p>' +
          '</div>' +
          '<div class="overflow-x-auto"><table class="p52-table"><thead><tr><th>الخدمة</th><th>العدد</th><th>إجمالي الإيراد</th><th>تكلفة التنفيذ</th><th>العمولات</th><th>صافي الربح</th><th>هامش الربح %</th><th>متوسط السعر الحالي</th><th>السعر المقترح</th></tr></thead><tbody>' +
            fin.servicesList.map(function (s) {
              return '<tr>' +
                '<td class="font-bold">' + eh(s.service) + '</td>' +
                '<td class="font-mono">' + fmtNum(s.qty) + '</td>' +
                '<td class="font-mono">' + eh(formatCurrency(s.sales)) + '</td>' +
                '<td class="font-mono">' + eh(formatCurrency(s.cost)) + '</td>' +
                '<td class="font-mono">' + eh(formatCurrency(s.comm)) + '</td>' +
                '<td class="font-mono font-bold" style="color:' + (s.profit >= 0 ? 'var(--r-ok,#5fd3b3)' : 'var(--r-bad,#ff6b6b)') + '">' + eh(formatCurrency(s.profit)) + '</td>' +
                '<td><span class="p52-pill ' + (s.marginPct >= state.targetMarginPct ? 'p52-pill-ok' : s.marginPct >= 15 ? 'p52-pill-warn' : 'p52-pill-bad') + '">' + s.marginPct + '%</span></td>' +
                '<td class="font-mono">' + eh(formatCurrency(s.avgPrice)) + '</td>' +
                '<td>' +
                  (s.needsPriceRaise
                    ? '<span class="p52-pill p52-pill-warn"><i class="fa-solid fa-arrow-trend-up"></i>مقترح: ' + eh(formatCurrency(s.suggestedPrice)) + '</span>'
                    : '<span class="text-[11px]" style="color:var(--r-ok)">سعر مناسب (' + eh(formatCurrency(s.avgPrice)) + ')</span>') +
                '</td>' +
              '</tr>';
            }).join('') +
          '</tbody></table></div>' +
        '</div>';
    } else if (state.subTab === 'wallets' && mgr) {
      var methods = ['كاش', 'انستا باي', 'فودافون كاش', 'POS', 'تحويل بنكي'];
      var dayTotals = {};
      methods.forEach(function (m) { dayTotals[m] = 0; });
      getLines().forEach(function (l) {
        if (lineDayOf(l) !== state.walletDate) return;
        var pay = (l.payment_method || 'كاش').trim() || 'كاش';
        dayTotals[pay] = (dayTotals[pay] || 0) + netLineMetrics(l).sales;
      });

      bodyHtml =
        '<div class="p52-card space-y-3">' +
          '<div class="flex flex-wrap items-center justify-between gap-2">' +
            '<div>' +
              '<h3 class="font-bold text-sm">مطابقة المحافظ الإلكترونية والكاش اليومي (39، 35)</h3>' +
              '<p class="text-[11px]" style="color:var(--r-mute)">قارن رصيد كل محفظة والدرج الفعلي بالمبيعات المسجلة في السيستم لاكتشاف أي فرق فوراً.</p>' +
            '</div>' +
            '<div class="flex items-center gap-2">' +
              '<input type="date" value="' + eh(state.walletDate) + '" onchange="p52SetWalletDate(this.value)" class="field !w-auto !py-1 text-xs font-mono" dir="ltr">' +
              '<button type="button" onclick="p52SaveWalletReconciliation()" class="p52-btn p52-btn-pri"><i class="fa-solid fa-floppy-disk"></i><span>حفظ المطابقة</span></button>' +
            '</div>' +
          '</div>' +
          '<div class="overflow-x-auto"><table class="p52-table"><thead><tr><th>طريقة الدفع / المحفظة</th><th>المسجل في السيستم</th><th>الرصيد الفعلي</th><th>الفرق (فعلي - سيستم)</th><th>ملاحظات</th></tr></thead><tbody>' +
            Object.keys(dayTotals).map(function (m) {
              var sysVal = Math.round(dayTotals[m] || 0);
              var rec = state.walletRecs.find(function (w) { return w.method === m && w.rec_date === state.walletDate; });
              var actVal = rec ? num(rec.actual_amount) : sysVal;
              var diff = Math.round(actVal - sysVal);
              return '<tr data-p52-wallet-method="' + eh(m) + '" data-p52-sys="' + sysVal + '">' +
                '<td class="font-bold">' + eh(m) + '</td>' +
                '<td class="font-mono font-bold">' + eh(formatCurrency(sysVal)) + '</td>' +
                '<td><input type="number" step="any" value="' + actVal + '" class="field p52-w-actual !w-32 !py-1 font-mono" dir="ltr"></td>' +
                '<td><span class="p52-pill ' + (diff === 0 ? 'p52-pill-ok' : 'p52-pill-bad') + '">' + (diff === 0 ? 'مطابق ✓' : (diff > 0 ? '+' : '') + formatCurrency(diff)) + '</span></td>' +
                '<td><input type="text" value="' + eh((rec && rec.notes) || '') + '" placeholder="ملاحظة..." class="field p52-w-note !py-1 text-xs"></td>' +
              '</tr>';
            }).join('') +
          '</tbody></table></div>' +
        '</div>';
    } else if (state.subTab === 'forecast' && mgr) {
      var fc = computeCashFlowForecast();
      bodyHtml =
        '<div class="p52-card space-y-4">' +
          '<div>' +
            '<h3 class="font-bold text-sm">توقع التدفق النقدي والالتزامات القادمة (38)</h3>' +
            '<p class="text-[11px]" style="color:var(--r-mute)">مبني على متوسط التشغيل اليومي لآخر 30 يوم (' + eh(formatCurrency(fc.dailyIn)) + ' داخل / يوم مقابل ' + eh(formatCurrency(fc.dailyOut)) + ' التزامات / يوم) + التزامات التنفيذ المفتوحة حالياً (' + eh(formatCurrency(fc.openPayables)) + ').</p>' +
          '</div>' +
          '<div class="p52-kpi-grid">' +
            fc.horizons.map(function (h) {
              return '<div class="p52-kpi space-y-1.5">' +
                '<div class="font-bold text-xs" style="color:var(--r-acc)">توقع خلال ' + h.days + ' يوم</div>' +
                '<div class="flex justify-between text-xs"><span>تدفق داخل متوقع:</span><b class="font-mono">' + eh(formatCurrency(h.expectedIn)) + '</b></div>' +
                '<div class="flex justify-between text-xs"><span>التزامات وتكاليف خارجة:</span><b class="font-mono">' + eh(formatCurrency(h.expectedOut)) + '</b></div>' +
                '<div class="pt-1 border-t flex justify-between text-xs" style="border-color:var(--r-line)"><span>صافي السيولة المتوقع:</span><b class="font-mono" style="color:' + (h.expectedNet >= 0 ? 'var(--r-ok)' : 'var(--r-bad)') + '">' + eh(formatCurrency(h.expectedNet)) + '</b></div>' +
              '</div>';
            }).join('') +
          '</div>' +
        '</div>';
    }

    pane.innerHTML =
      '<div class="p52-wrap space-y-4">' +
        '<div class="p52-card flex flex-wrap items-center justify-between gap-3">' +
          '<div>' +
            '<h2 class="font-bold text-base sm:text-lg text-ink dark:text-white flex items-center gap-2">' +
              '<i class="fa-solid fa-coins" style="color:var(--r-acc,#ff9d6c)"></i>' +
              '<span>الفلوس والعمولات وصافي الربح</span>' +
            '</h2>' +
            '<p class="text-xs mt-0.5" style="color:var(--r-mute)">موافقات الخصم الكبير (20%+)، كشف العمولة PDF، قفل الشهر PDF، ربحية الخدمات، ومطابقة المحافظ</p>' +
          '</div>' +
          '<div class="flex flex-wrap items-center gap-2">' +
            '<select onchange="p52SetMonth(this.value)" class="field !w-auto !py-1.5 text-xs">' +
              getAvailableMonths().map(function (m) {
                return '<option value="' + eh(m) + '"' + (m === state.month ? ' selected' : '') + '>' + eh(monthTitleAr(m)) + '</option>';
              }).join('') +
            '</select>' +
            '<button type="button" onclick="p52ExportEmployeeCommPdf()" class="p52-btn"><i class="fa-solid fa-file-pdf" style="color:var(--r-acc)"></i><span>كشف عمولة PDF</span></button>' +
            (mgr ? '<button type="button" onclick="p52ExportMonthClosurePdf()" class="p52-btn p52-btn-pri"><i class="fa-solid fa-file-invoice-dollar"></i><span>قفل الشهر PDF</span></button>' : '') +
          '</div>' +
        '</div>' +

        cashAlertHtml +

        '<div class="p52-subnav">' +
          (mgr ? '<button type="button" class="' + (state.subTab === 'overview' ? 'is-on' : '') + '" onclick="p52SetSubTab(\'overview\')"><i class="fa-solid fa-chart-pie ms-1"></i>صافي الربح والملخص</button>' : '') +
          '<button type="button" class="' + (state.subTab === 'daily_need' ? 'is-on' : '') + '" onclick="p52SetSubTab(\'daily_need\')"><i class="fa-solid fa-bullseye ms-1"></i>محتاج كام في اليوم + عمولتي PDF</button>' +
          '<button type="button" class="' + (state.subTab === 'approvals' ? 'is-on' : '') + '" onclick="p52SetSubTab(\'approvals\')"><i class="fa-solid fa-percent ms-1"></i>موافقات الخصم (' + pendingApprovals.length + ')</button>' +
          (mgr ? '<button type="button" class="' + (state.subTab === 'profitability' ? 'is-on' : '') + '" onclick="p52SetSubTab(\'profitability\')"><i class="fa-solid fa-sack-dollar ms-1"></i>ربحية الخدمات واقتراح السعر</button>' : '') +
          (mgr ? '<button type="button" class="' + (state.subTab === 'wallets' ? 'is-on' : '') + '" onclick="p52SetSubTab(\'wallets\')"><i class="fa-solid fa-wallet ms-1"></i>مطابقة المحافظ والكاش</button>' : '') +
          (mgr ? '<button type="button" class="' + (state.subTab === 'forecast' ? 'is-on' : '') + '" onclick="p52SetSubTab(\'forecast\')"><i class="fa-solid fa-arrow-trend-up ms-1"></i>توقع التدفق النقدي</button>' : '') +
        '</div>' +

        bodyHtml +
      '</div>';
  }

  window.p52OnSelectCommEmp = function (val) {
    state.selectedCommEmp = val;
  };

  /* ربط التاب في القائمة الجانبية بنفس نمط js/50-trash-archive.js */
  function placeBtn(btn) {
    var menu = $('nav-menu');
    if (!menu) return;
    var perfBody = menu.querySelector(':scope > section[data-mg="perf"] .mg-body') ||
                   menu.querySelector(':scope > section[data-mg="admin"] .mg-body');
    if (perfBody) {
      btn.dataset.mgi = '6';
      if (btn.parentElement !== perfBody) perfBody.appendChild(btn);
      return;
    }
    var foot = menu.querySelector(':scope > .r-logout-menu');
    if (foot) menu.insertBefore(btn, foot);
    else menu.appendChild(btn);
  }

  function remove() {
    var b = $('tab-finance-btn'), p = $('tab-finance');
    if (b) b.remove();
    if (p) p.remove();
  }

  function ensure() {
    if (isPartner()) { remove(); return false; }
    if (!$('tab-finance')) {
      var main = document.querySelector('main');
      if (!main) return false;
      var pane = document.createElement('div');
      pane.id = 'tab-finance';
      pane.className = 'hidden space-y-4';
      var host = $('tab-comm') || $('tab-dash') || main.lastElementChild;
      if (host) host.insertAdjacentElement('afterend', pane);
      else main.appendChild(pane);
    }
    if (!$('tab-finance-btn') && $('nav-menu')) {
      var b = document.createElement('button');
      b.id = 'tab-finance-btn';
      b.type = 'button';
      b.setAttribute('data-tab-target', 'finance');
      b.className = BTN_OFF;
      b.setAttribute('onclick', "switchTab('finance')");
      b.innerHTML = '<i class="fa-solid fa-coins text-amber-500"></i><span>الفلوس والعمولات</span>';
      placeBtn(b);
    }
    return true;
  }

  wrap('switchTab', function (orig) {
    return function (id) {
      var res = orig.apply(this, arguments);
      try {
        ensure();
        var on = id === 'finance' && !isPartner();
        var pane = $('tab-finance'), btn = $('tab-finance-btn');
        if (pane) pane.classList.toggle('hidden', !on);
        if (btn) btn.className = on ? BTN_ON : BTN_OFF;
        if (on) {
          var sec = btn && btn.closest('.mg');
          if (sec && !sec.classList.contains('open')) sec.classList.add('open');
          loadFinanceRemoteData(false).then(renderFinanceTab);
        }
      } catch (e) { /* */ }
      return res;
    };
  });

  wrap('loadInitialData', function (orig) {
    return async function () {
      var r = await orig.apply(this, arguments);
      try { ensure(); } catch (e) { /* */ }
      return r;
    };
  });

  wrap('handleLogout', function (orig) {
    return function () {
      try {
        state.approvals = [];
        state.walletRecs = [];
        remove();
      } catch (e) { /* */ }
      return orig.apply(this, arguments);
    };
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { try { ensure(); } catch (e) { /* */ } });
  } else {
    try { ensure(); } catch (e) { /* */ }
  }
})();
