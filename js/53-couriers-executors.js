/* =====================================================================
   الجزء د: المرحلة 9 المناديب والمنفذين (js/53-couriers-executors.js)
   الفيتشرز:
   - (41) ورقة مشاوير يومية (تجمّع الاستلامات والتسليمات لكل مندوب في ورقة جاهزة للطباعة A4 وواتساب).
   - (42) إحصائيات المندوب (عدد المشاوير، الاستلام مقابل التسليم، الرسوم، وتوزيع المناطق المعتمدة).
   - (43) كشف حساب سعد تلقائي (كشف حساب فوري للمنفذ «سعد» أو أي منفذ خارجي بالمنفذ والمتبقي والمدفوعات + PDF/CSV).
   - (44) تأكيد تسليم (توثيق استلام العميل بكود تحقق واسم المستلم والمندوب وتحويل المعاملة إلى Delivered).
   - (45) تقييم المنفذ (بطاقة أداء المنفذين بالسرعة والالتزام بالموعد ونسبة الإنجاز والتقييم من 5 نجوم).
   - (46) مقارنة التكاليف بين المنفذين (مقارنة تكلفة وسرعة كل خدمة بين المنفذين لاختيار الأفضل).
   - (47) تنبيه تأخر المنفذ أو المندوب (رصد البنود المتأخرة عند كل منفذ ومندوب مع رسالة متابعة جاهزة).
   ملاحظة: لا يلمس ملفات js/13-couriers.js أو js/14-roles-partner-portal.js المقفولة.
   SQL: sql/part-d-couriers-executors.sql
   ===================================================================== */
(function () {
  'use strict';
  if (window.__phase53CouriersExecutors) return;
  window.__phase53CouriersExecutors = true;

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

  var DEFAULT_COURIERS = ['علي صالح', 'محمد طه', 'سمير محمد', 'مصطفي محمد'];
  var APPROVED_REGIONS = [
    'الجيزة والهرم وفيصل',
    'الدقي والمهندسين والعجوزة',
    'وسط البلد والقاهرة',
    'مدينة نصر ومصر الجديدة',
    'المعادي والمقطم',
    '6 أكتوبر والشيخ زايد',
    'التجمع والقاهرة الجديدة',
    'شبرا والقليوبية',
    'محافظات وأقاليم'
  ];

  var state = {
    subTab: 'runsheet', /* 'runsheet' | 'courier_stats' | 'saad_statement' | 'confirm_delivery' | 'exec_eval' | 'cost_compare' | 'delay_alerts' */
    runDate: new Date().toLocaleDateString('en-CA'),
    runCourier: 'all',
    runKind: 'all',
    month: new Date().toLocaleDateString('en-CA').slice(0, 7),
    selectedExecutor: 'سعد',
    trips: [],
    confirmations: [],
    payments: [],
    evaluations: [],
    loadedAt: 0,
    busy: false
  };

  function todayIso() { return new Date().toLocaleDateString('en-CA'); }
  function curMonthIso() { return todayIso().slice(0, 7); }
  function getLines() {
    return (typeof allRequestLines !== 'undefined' && Array.isArray(allRequestLines)) ? allRequestLines : [];
  }
  function getOrders() {
    return (typeof groupedOrders !== 'undefined' && Array.isArray(groupedOrders)) ? groupedOrders : [];
  }
  function lineDayOf(l) {
    var d = typeof lineDate === 'function' ? lineDate(l) : (l.received_at || l.created_at);
    return String(d || '').slice(0, 10);
  }
  function lineMonthOf(l) {
    return lineDayOf(l).slice(0, 7);
  }
  function monthTitleAr(ym) {
    try { return new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric' }).format(new Date(ym + '-01T00:00:00')); }
    catch (e) { return ym; }
  }
  function detectRegion(addr) {
    var a = String(addr || '').trim();
    if (!a) return 'غير محدد';
    if (/هرم|فيصل|جيز|عمران|منيب/i.test(a)) return 'الجيزة والهرم وفيصل';
    if (/دقي|مهندس|عجوز|زمالك/i.test(a)) return 'الدقي والمهندسين والعجوزة';
    if (/وسط|رمسيس|تحرير|عتب|شبرا/i.test(a)) return 'وسط البلد والقاهرة';
    if (/نصر|جديد|روكسي|عباس|مطار/i.test(a)) return 'مدينة نصر ومصر الجديدة';
    if (/معاد|مقطم|حلوان/i.test(a)) return 'المعادي والمقطم';
    if (/أكتوبر|اكتوبر|زايد|حصري/i.test(a)) return '6 أكتوبر والشيخ زايد';
    if (/تجمع|رحاب|مدينتي|شروق|عبور/i.test(a)) return 'التجمع والقاهرة الجديدة';
    return 'محافظات وأقاليم';
  }

  function getAllCourierNames() {
    var set = new Set(DEFAULT_COURIERS);
    state.trips.forEach(function (t) {
      if (t && t.courier && t.courier !== '—') set.add(t.courier.trim());
    });
    getLines().forEach(function (l) {
      var r = (l.receiver || '').trim();
      if (r && r !== 'العميل شخصياً' && r !== '—') set.add(r);
    });
    return Array.from(set);
  }

  function getAllExecutorNames() {
    var set = new Set(['سعد']);
    getLines().forEach(function (l) {
      var ex = (l.executor || '').trim();
      if (ex && ex !== '—') set.add(ex);
    });
    return Array.from(set).sort(function (a, b) {
      if (a.indexOf('سعد') !== -1 && b.indexOf('سعد') === -1) return -1;
      if (b.indexOf('سعد') !== -1 && a.indexOf('سعد') === -1) return 1;
      return a.localeCompare(b, 'ar');
    });
  }

  /* تحميل البيانات من Supabase عند فتح التاب فقط (بحد أدنى 60 ثانية بين التحديثات) */
  async function loadCouriersExecutorsRemoteData(force) {
    if (!sbClient || !currentUser) return;
    if (!force && Date.now() - state.loadedAt < 60000) return;
    state.loadedAt = Date.now();

    try {
      var ym = state.month || curMonthIso();
      var queries = [
        sbClient.from('courier_trips').select('*').gte('trip_day', ym + '-01').lte('trip_day', ym + '-31').order('trip_day', { ascending: false }).limit(600),
        sbClient.from('delivery_confirmations').select('*').order('confirmed_at', { ascending: false }).limit(200),
        sbClient.from('executor_payments').select('*').order('pay_date', { ascending: false }).limit(200),
        sbClient.from('executor_evaluations').select('*').eq('month', ym)
      ];
      var res = await Promise.all(queries.map(function (p) {
        return p.catch(function (e) { return { error: e }; });
      }));
      if (res[0] && !res[0].error && Array.isArray(res[0].data)) state.trips = res[0].data;
      if (res[1] && !res[1].error && Array.isArray(res[1].data)) state.confirmations = res[1].data;
      if (res[2] && !res[2].error && Array.isArray(res[2].data)) state.payments = res[2].data;
      if (res[3] && !res[3].error && Array.isArray(res[3].data)) state.evaluations = res[3].data;
    } catch (e) { /* */ }
  }

  /* =====================================================================
     1) ورقة مشاوير يومية (41)
     ===================================================================== */
  function buildDailyRunSheetItems(dayStr, courierFilter, kindFilter) {
    var orderByTx = new Map();
    getOrders().forEach(function (o) { orderByTx.set(String(o.transaction_id), o); });
    var confirmByTx = new Map();
    state.confirmations.forEach(function (c) { confirmByTx.set(String(c.transaction_id), c); });

    var items = [];
    var seenKeys = new Set();

    /* المشاوير المسجلة في courier_trips لهذا اليوم */
    state.trips.forEach(function (t) {
      if (!t || String(t.trip_day).slice(0, 10) !== dayStr) return;
      var cName = (t.courier || '').trim();
      if (!cName || cName === '—') return;
      if (courierFilter !== 'all' && cName !== courierFilter) return;
      if (kindFilter !== 'all' && t.kind !== kindFilter) return;

      var o = orderByTx.get(String(t.transaction_id));
      var conf = confirmByTx.get(String(t.transaction_id));
      var key = String(t.transaction_id) + '|' + t.kind;
      seenKeys.add(key);

      items.push({
        tx: String(t.transaction_id),
        kind: t.kind === 'delivery' ? 'تسليم للعميل' : 'استلام من العميل',
        rawKind: t.kind,
        courier: cName,
        client_name: (o && o.client_name) || '—',
        phone: (o && o.phone) || '—',
        address: (o && o.address) || (conf && conf.area) || '—',
        region: (conf && conf.area) || detectRegion(o && o.address),
        services: o ? o.lines.map(function (l) { return l.service + '×' + fmtNum(l.qty); }).join('، ') : '—',
        amount: o ? num(o.grand_total) : 0,
        fee: num(t.fee) || 40,
        confirmed: !!conf
      });
    });

    /* استكمال من المعاملات المستلمة اليوم التي لها مندوب استلام في receiver */
    getOrders().forEach(function (o) {
      var rDay = String(o.received_at || o.created_at || '').slice(0, 10);
      var recv = (o.receiver || '').trim();
      if (rDay === dayStr && recv && recv !== 'العميل شخصياً' && recv !== '—') {
        var key = String(o.transaction_id) + '|pickup';
        if (seenKeys.has(key)) return;
        if (courierFilter !== 'all' && recv !== courierFilter) return;
        if (kindFilter !== 'all' && kindFilter !== 'pickup') return;
        seenKeys.add(key);
        items.push({
          tx: String(o.transaction_id),
          kind: 'استلام من العميل',
          rawKind: 'pickup',
          courier: recv,
          client_name: o.client_name || '—',
          phone: o.phone || '—',
          address: o.address || '—',
          region: detectRegion(o.address),
          services: (o.lines || []).map(function (l) { return l.service + '×' + fmtNum(l.qty); }).join('، '),
          amount: num(o.grand_total),
          fee: window.__courierFee || 40,
          confirmed: confirmByTx.has(String(o.transaction_id))
        });
      }
    });

    return items;
  }

  window.p53PrintDailyRunSheet = function () {
    var items = buildDailyRunSheetItems(state.runDate, state.runCourier, state.runKind);
    if (!items.length) return toast('لا توجد مشاوير في هذا اليوم للطباعة', 'info');
    var printBox = $('print-content');
    if (!printBox) return;
    printBox.innerHTML =
      '<div style="direction:rtl;font-family:\'IBM Plex Sans Arabic\',Tahoma,sans-serif;color:#0f172a;padding:16px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #e8590c;padding-bottom:10px;margin-bottom:14px">' +
          '<div><h2 style="margin:0;font-size:18px">ورقة مشاوير المناديب اليومية — تساهيل</h2><div style="font-size:12px;color:#475569">التاريخ: ' + eh(state.runDate) + ' · المندوب: ' + eh(state.runCourier === 'all' ? 'كل المناديب' : state.runCourier) + ' · إجمالي المشاوير: ' + items.length + '</div></div>' +
          '<div style="font-size:11px;color:#64748b">طُبع في: ' + eh(new Date().toLocaleString('ar-EG')) + '</div>' +
        '</div>' +
        '<table style="width:100%;border-collapse:collapse;font-size:11.5px">' +
          '<thead><tr style="background:#1e293b;color:#fff">' +
            '<th style="padding:7px;border:1px solid #334155">#</th>' +
            '<th style="padding:7px;border:1px solid #334155">المندوب</th>' +
            '<th style="padding:7px;border:1px solid #334155">نوع المشوار</th>' +
            '<th style="padding:7px;border:1px solid #334155">رقم المعاملة</th>' +
            '<th style="padding:7px;border:1px solid #334155">العميل والتليفون</th>' +
            '<th style="padding:7px;border:1px solid #334155">المنطقة والعنوان</th>' +
            '<th style="padding:7px;border:1px solid #334155">الخدمات</th>' +
            '<th style="padding:7px;border:1px solid #334155">المبلغ</th>' +
            '<th style="padding:7px;border:1px solid #334155;width:110px">توقيع العميل</th>' +
          '</tr></thead>' +
          '<tbody>' +
            items.map(function (it, idx) {
              return '<tr>' +
                '<td style="padding:6px;border:1px solid #cbd5e1;text-align:center">' + (idx + 1) + '</td>' +
                '<td style="padding:6px;border:1px solid #cbd5e1;font-weight:700">' + eh(it.courier) + '</td>' +
                '<td style="padding:6px;border:1px solid #cbd5e1">' + eh(it.kind) + '</td>' +
                '<td style="padding:6px;border:1px solid #cbd5e1;font-family:monospace" dir="ltr">' + eh(it.tx) + '</td>' +
                '<td style="padding:6px;border:1px solid #cbd5e1"><b>' + eh(it.client_name) + '</b><br><span dir="ltr">' + eh(it.phone) + '</span></td>' +
                '<td style="padding:6px;border:1px solid #cbd5e1"><b>' + eh(it.region) + '</b><br>' + eh(it.address) + '</td>' +
                '<td style="padding:6px;border:1px solid #cbd5e1">' + eh(it.services) + '</td>' +
                '<td style="padding:6px;border:1px solid #cbd5e1;font-family:monospace">' + eh(formatCurrency(it.amount)) + '</td>' +
                '<td style="padding:6px;border:1px solid #cbd5e1"></td>' +
              '</tr>';
            }).join('') +
          '</tbody>' +
        '</table>' +
      '</div>';
    window.print();
  };

  window.p53CopyRunSheetWhatsapp = function () {
    var items = buildDailyRunSheetItems(state.runDate, state.runCourier, state.runKind);
    if (!items.length) return toast('لا توجد مشاوير لنسخها', 'info');
    var lines = ['📋 *ورقة مشاوير يوم ' + state.runDate + '* (' + (state.runCourier === 'all' ? 'كل المناديب' : state.runCourier) + '):'];
    items.forEach(function (it, i) {
      lines.push((i + 1) + ') [' + it.kind + '] ' + it.tx + ' — ' + it.client_name + ' (' + it.phone + ') — ' + it.region + ' (' + it.address + ')');
    });
    var txt = lines.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(function () { toast('تم نسخ خط سير المشاوير للواتساب ✓'); });
    } else {
      toast(txt, 'info', 6000);
    }
  };

  /* =====================================================================
     2) إحصائيات المندوب (42)
     ===================================================================== */
  function computeCourierStats(ym) {
    var map = new Map();
    getAllCourierNames().forEach(function (c) {
      map.set(c, { name: c, pickup: 0, delivery: 0, total: 0, fees: 0, confirmed: 0, regions: {} });
    });

    var orderByTx = new Map();
    getOrders().forEach(function (o) { orderByTx.set(String(o.transaction_id), o); });

    state.trips.forEach(function (t) {
      if (!t || String(t.trip_day || '').slice(0, 7) !== ym) return;
      var c = (t.courier || '').trim();
      if (!c || c === '—') return;
      var row = map.get(c);
      if (!row) {
        row = { name: c, pickup: 0, delivery: 0, total: 0, fees: 0, confirmed: 0, regions: {} };
        map.set(c, row);
      }
      if (t.kind === 'delivery') row.delivery++;
      else row.pickup++;
      row.total++;
      row.fees += num(t.fee) || 40;

      var o = orderByTx.get(String(t.transaction_id));
      var reg = detectRegion(o && o.address);
      row.regions[reg] = (row.regions[reg] || 0) + 1;
    });

    state.confirmations.forEach(function (cf) {
      if (!cf || String(cf.confirmed_at || '').slice(0, 7) !== ym) return;
      var c = (cf.courier_name || '').trim();
      if (c && map.has(c)) map.get(c).confirmed++;
    });

    return Array.from(map.values()).sort(function (a, b) { return b.total - a.total; });
  }

  /* =====================================================================
     3) كشف حساب سعد تلقائي وكشف حساب أي منفذ خارجي (43)
     ===================================================================== */
  function computeExecutorStatement(execQuery, ym) {
    var qNorm = (execQuery || 'سعد').trim().toLowerCase();
    var matchedLines = getLines().filter(function (l) {
      if (ym && ym !== 'all' && lineMonthOf(l) !== ym) return false;
      var ex = (l.executor || '').trim().toLowerCase();
      if (!ex) return false;
      return ex === qNorm || (qNorm === 'سعد' && ex.indexOf('سعد') !== -1);
    });

    var totalUnits = 0, doneUnits = 0, openUnits = 0, grossCost = 0, forfeitedRefundCost = 0, netCost = 0;
    var rows = [];

    matchedLines.forEach(function (l) {
      var q = Math.max(0, num(l.qty) || 1);
      var uCost = num(l.exec_unit_cost);
      var lineCost = typeof execCostOf === 'function' ? execCostOf(l) : (uCost * q);
      var rfForfeit = 0;
      var isFullRefund = false;

      if (typeof window.getLineRefundSummary === 'function') {
        var rf = window.getLineRefundSummary(l.id);
        if (rf && rf.approvedCount > 0) {
          isFullRefund = !!rf.isFull;
          rfForfeit = num(rf.exec_forfeited);
          q = Math.max(0, rf.remQty);
        }
      }

      var lineNetCost = Math.max(0, lineCost - rfForfeit);
      var st = l.status || 'In Progress';
      var isDone = st === 'Complete' || st === 'Delivered';

      totalUnits += q;
      if (isDone) doneUnits += q;
      else openUnits += q;
      grossCost += lineCost;
      forfeitedRefundCost += rfForfeit;
      netCost += lineNetCost;

      rows.push({
        line: l,
        qty: q,
        unitCost: uCost,
        grossCost: lineCost,
        rfForfeit: rfForfeit,
        netCost: lineNetCost,
        status: st,
        isDone: isDone,
        isFullRefund: isFullRefund
      });
    });

    var payments = state.payments.filter(function (p) {
      var pEx = (p.executor_name || '').trim().toLowerCase();
      var matchEx = pEx === qNorm || (qNorm === 'سعد' && pEx.indexOf('سعد') !== -1);
      if (!matchEx) return false;
      if (ym && ym !== 'all' && String(p.pay_date || '').slice(0, 7) !== ym) return false;
      return true;
    });

    var totalPaid = payments.reduce(function (s, p) { return s + num(p.amount); }, 0);
    var remainingBalance = netCost - totalPaid;

    return {
      executorName: execQuery || 'سعد',
      ym: ym,
      totalLines: rows.length,
      totalUnits: totalUnits,
      doneUnits: doneUnits,
      openUnits: openUnits,
      grossCost: grossCost,
      forfeitedRefundCost: forfeitedRefundCost,
      netCost: netCost,
      totalPaid: totalPaid,
      remainingBalance: remainingBalance,
      rows: rows,
      payments: payments
    };
  }

  window.p53AddExecutorPayment = async function (ev) {
    if (ev && ev.preventDefault) ev.preventDefault();
    if (!isMgr()) return toast('تسجيل دفعات المنفذين للمدير فقط', 'error');
    var amt = num($('p53-pay-amt') && $('p53-pay-amt').value);
    var method = ($('p53-pay-method') && $('p53-pay-method').value) || 'كاش';
    var note = ($('p53-pay-note') && $('p53-pay-note').value.trim()) || '';
    if (!(amt > 0)) return toast('أدخل مبلغ الدفعة بشكل صحيح', 'error');

    var row = {
      executor_name: state.selectedExecutor || 'سعد',
      pay_date: todayIso(),
      amount: amt,
      method: method,
      reference_note: note || null,
      created_by: currentUser ? currentUser.id : null,
      created_by_name: (typeof myProfile !== 'undefined' && myProfile && myProfile.full_name) || 'المدير'
    };

    if (sbClient && currentUser) {
      var r = await sbClient.from('executor_payments').insert(row).select('*').maybeSingle();
      if (r.error) {
        if (!/42P01|PGRST205|does not exist/i.test(r.error.message || '')) {
          return showErr('تعذّر تسجيل الدفعة', r.error);
        }
      } else if (r.data) {
        row = r.data;
      }
    }
    state.payments.unshift(row);
    if ($('p53-pay-amt')) $('p53-pay-amt').value = '';
    if ($('p53-pay-note')) $('p53-pay-note').value = '';
    toast('تم تسجيل دفعة بمبلغ ' + formatCurrency(amt) + ' للمنفذ «' + state.selectedExecutor + '» ✓');
    renderCouriersExecutorsTab();
  };

  window.p53PrintSaadStatement = function () {
    var st = computeExecutorStatement(state.selectedExecutor, state.month);
    if (!st.rows.length) return toast('لا توجد بنود مسجلة لهذا المنفذ في الفترة المحددة', 'info');
    var printBox = $('print-content');
    if (!printBox) return;
    printBox.innerHTML =
      '<div style="direction:rtl;font-family:\'IBM Plex Sans Arabic\',Tahoma,sans-serif;color:#0f172a;padding:18px">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #e8590c;padding-bottom:10px;margin-bottom:14px">' +
          '<div><h2 style="margin:0;font-size:19px">كشف حساب منفذ — ' + eh(st.executorName) + '</h2><div style="font-size:12px;color:#475569">الفترة: ' + eh(st.ym === 'all' ? 'كل الفترات' : monthTitleAr(st.ym)) + '</div></div>' +
          '<div style="font-size:12px;text-align:left"><div>إجمالي المستحق الصافي: <b>' + eh(formatCurrency(st.netCost)) + '</b></div><div>المدفوع: <b>' + eh(formatCurrency(st.totalPaid)) + '</b> · المتبقي: <b>' + eh(formatCurrency(st.remainingBalance)) + '</b></div></div>' +
        '</div>' +
        '<table style="width:100%;border-collapse:collapse;font-size:11.5px">' +
          '<thead><tr style="background:#1e293b;color:#fff">' +
            '<th style="padding:7px;border:1px solid #334155">رقم المعاملة</th>' +
            '<th style="padding:7px;border:1px solid #334155">التاريخ</th>' +
            '<th style="padding:7px;border:1px solid #334155">العميل</th>' +
            '<th style="padding:7px;border:1px solid #334155">الخدمة</th>' +
            '<th style="padding:7px;border:1px solid #334155">العدد</th>' +
            '<th style="padding:7px;border:1px solid #334155">تكلفة الوحدة</th>' +
            '<th style="padding:7px;border:1px solid #334155">صافي التكلفة</th>' +
            '<th style="padding:7px;border:1px solid #334155">الحالة</th>' +
          '</tr></thead>' +
          '<tbody>' +
            st.rows.map(function (r) {
              return '<tr>' +
                '<td style="padding:6px;border:1px solid #cbd5e1;font-family:monospace" dir="ltr">' + eh(r.line.transaction_id) + '</td>' +
                '<td style="padding:6px;border:1px solid #cbd5e1">' + eh(lineDayOf(r.line)) + '</td>' +
                '<td style="padding:6px;border:1px solid #cbd5e1">' + eh(r.line.client_name || '—') + '</td>' +
                '<td style="padding:6px;border:1px solid #cbd5e1">' + eh(r.line.service || '—') + '</td>' +
                '<td style="padding:6px;border:1px solid #cbd5e1">' + fmtNum(r.qty) + '</td>' +
                '<td style="padding:6px;border:1px solid #cbd5e1">' + eh(formatCurrency(r.unitCost)) + '</td>' +
                '<td style="padding:6px;border:1px solid #cbd5e1;font-weight:700">' + eh(formatCurrency(r.netCost)) + '</td>' +
                '<td style="padding:6px;border:1px solid #cbd5e1">' + eh(statusLabel(r.status)) + '</td>' +
              '</tr>';
            }).join('') +
          '</tbody>' +
        '</table>' +
      '</div>';
    window.print();
  };

  /* =====================================================================
     4) تأكيد التسليم للعميل (44)
     ===================================================================== */
  window.p53SubmitDeliveryConfirm = async function (ev) {
    if (ev && ev.preventDefault) ev.preventDefault();
    var tx = ($('p53-dc-tx') && $('p53-dc-tx').value.trim()) || '';
    var recvBy = ($('p53-dc-recv') && $('p53-dc-recv').value.trim()) || '';
    var courier = ($('p53-dc-courier') && $('p53-dc-courier').value.trim()) || '';
    var code = ($('p53-dc-code') && $('p53-dc-code').value.trim()) || '';
    var area = ($('p53-dc-area') && $('p53-dc-area').value.trim()) || '';
    var notes = ($('p53-dc-notes') && $('p53-dc-notes').value.trim()) || '';

    if (!tx || !recvBy) return toast('اختر رقم المعاملة واكتب اسم المستلم الفعلي', 'error');

    var o = getOrders().find(function (x) { return String(x.transaction_id) === tx; });
    if (o && o.phone && code) {
      var digits = String(o.phone).replace(/\D/g, '');
      var last4 = digits.slice(-4);
      if (last4.length === 4 && code !== last4) {
        if (!window.confirm('كود التحقق المدخل (' + code + ') لا يطابق آخر 4 أرقام من تليفون العميل (' + last4 + '). هل تريد المتابعة وتأكيد التسليم؟')) {
          return;
        }
      }
    }

    if (state.busy) return;
    state.busy = true;
    try {
      if (sbClient && currentUser) {
        var r = await sbClient.rpc('confirm_tx_delivery', {
          p_tx: tx,
          p_received_by: recvBy,
          p_courier: courier || null,
          p_code: code || null,
          p_area: area || null,
          p_notes: notes || null
        });
        if (r.error) {
          if (/42883|PGRST202|does not exist/i.test(r.error.message || '')) {
            await setTxStatus(tx, 'Delivered');
          } else {
            return showErr('تعذّر تأكيد التسليم', r.error);
          }
        }
      }
      state.confirmations.unshift({
        transaction_id: tx,
        received_by_name: recvBy,
        courier_name: courier,
        verify_code: code,
        area: area,
        notes: notes,
        confirmed_at: new Date().toISOString()
      });
      toast('تم توثيق وتأكيد تسليم المعاملة ' + tx + ' للعميل ✓');
      if (typeof loadRecentRequests === 'function') await loadRecentRequests();
      renderCouriersExecutorsTab();
    } finally {
      state.busy = false;
    }
  };

  /* =====================================================================
     5) تقييم المنفذ (45) + مقارنة التكاليف (46) + تنبيه التأخر (47)
     ===================================================================== */
  function computeExecutorEvaluations(ym) {
    var map = new Map();
    var evalByExec = new Map();
    state.evaluations.forEach(function (ev) {
      if (ev && ev.executor_name) evalByExec.set(ev.executor_name, ev);
    });

    getLines().forEach(function (l) {
      if (ym && ym !== 'all' && lineMonthOf(l) !== ym) return;
      var ex = (l.executor || '').trim() || 'تنفيذ داخلي';
      var row = map.get(ex);
      if (!row) {
        row = { name: ex, total: 0, done: 0, late: 0, onTimeDelivered: 0, deliveredWithDates: 0, totalDays: 0, costSum: 0 };
        map.set(ex, row);
      }
      var q = Math.max(1, num(l.qty) || 1);
      row.total += q;
      row.costSum += (typeof execCostOf === 'function' ? execCostOf(l) : num(l.exec_unit_cost) * q);
      var st = l.status || 'In Progress';
      if (st === 'Complete' || st === 'Delivered') row.done += q;
      if (typeof isLineLate === 'function' && isLineLate(l)) row.late += q;

      if (st === 'Delivered' && l.delivered_date) {
        var bStr = String(l.exec_start_date || lineDayOf(l)).slice(0, 10);
        var bMs = new Date(bStr + 'T00:00:00').getTime();
        var dMs = new Date(String(l.delivered_date).slice(0, 10) + 'T00:00:00').getTime();
        if (!isNaN(bMs) && !isNaN(dMs) && dMs >= bMs) {
          var daysTaken = Math.max(1, Math.round((dMs - bMs) / 86400000));
          row.deliveredWithDates++;
          row.totalDays += daysTaken;
          if (!num(l.duration_days) || daysTaken <= num(l.duration_days)) {
            row.onTimeDelivered++;
          }
        }
      }
    });

    return Array.from(map.values()).map(function (r) {
      var completionPct = r.total > 0 ? Math.round((r.done / r.total) * 100) : 0;
      var onTimePct = r.deliveredWithDates > 0 ? Math.round((r.onTimeDelivered / r.deliveredWithDates) * 100) : (r.late === 0 ? 100 : Math.max(0, 100 - Math.round((r.late / r.total) * 100)));
      var avgDays = r.deliveredWithDates > 0 ? Math.round((r.totalDays / r.deliveredWithDates) * 10) / 10 : '—';
      var savedEval = evalByExec.get(r.name);
      var autoStars = Math.max(1, Math.min(5, Math.round(((completionPct * 0.5 + onTimePct * 0.5) / 20) * 10) / 10));
      var stars = savedEval ? num(savedEval.quality_score) : autoStars;
      return Object.assign({}, r, {
        completionPct: completionPct,
        onTimePct: onTimePct,
        avgDays: avgDays,
        stars: stars,
        notes: (savedEval && savedEval.notes) || ''
      });
    }).sort(function (a, b) { return b.total - a.total; });
  }

  function computeServiceCostComparison() {
    var bySvc = new Map();
    getLines().forEach(function (l) {
      var svc = (l.service || '').trim();
      var ex = (l.executor || '').trim();
      var uCost = num(l.exec_unit_cost);
      if (!svc || !ex || !(uCost > 0)) return;
      if (!bySvc.has(svc)) bySvc.set(svc, new Map());
      var exMap = bySvc.get(svc);
      var eRow = exMap.get(ex);
      if (!eRow) {
        eRow = { executor: ex, count: 0, sumCost: 0, minCost: uCost, maxCost: uCost };
        exMap.set(ex, eRow);
      }
      eRow.count++;
      eRow.sumCost += uCost;
      if (uCost < eRow.minCost) eRow.minCost = uCost;
      if (uCost > eRow.maxCost) eRow.maxCost = uCost;
    });

    var list = [];
    bySvc.forEach(function (exMap, svc) {
      var execs = Array.from(exMap.values()).map(function (e) {
        return Object.assign({}, e, { avgCost: Math.round(e.sumCost / e.count) });
      }).sort(function (a, b) { return a.avgCost - b.avgCost; });
      if (!execs.length) return;
      var cheapest = execs[0];
      var highest = execs[execs.length - 1];
      list.push({
        service: svc,
        executors: execs,
        bestExecutor: cheapest.executor,
        bestCost: cheapest.avgCost,
        maxCost: highest.avgCost,
        savingPerUnit: Math.max(0, highest.avgCost - cheapest.avgCost)
      });
    });

    return list.sort(function (a, b) { return b.savingPerUnit - a.savingPerUnit || b.executors.length - a.executors.length; });
  }

  function computeExecutorDelayAlerts() {
    var byExec = new Map();
    getLines().forEach(function (l) {
      if (typeof isLineLate !== 'function' || !isLineLate(l)) return;
      var ex = (l.executor || '').trim() || 'تنفيذ داخلي';
      if (!byExec.has(ex)) byExec.set(ex, []);
      byExec.get(ex).push(l);
    });
    return Array.from(byExec.entries()).map(function (entry) {
      return { executor: entry[0], lines: entry[1], count: entry[1].length };
    }).sort(function (a, b) { return b.count - a.count; });
  }

  window.p53CopyExecutorDelayFollowup = function (execName) {
    var delays = computeExecutorDelayAlerts().find(function (d) { return d.executor === execName; });
    if (!delays || !delays.lines.length) return;
    /* رسالة خالية من أسماء العملاء وأرقام هواتفهم وأسعار البيع التزاماً بخصوصية المنفذين */
    var txt = 'متابعة البنود المتأخرة — المنفذ «' + execName + '» (' + delays.count + ' بند):\n' +
      delays.lines.slice(0, 15).map(function (l, i) {
        return (i + 1) + ') المعاملة: ' + l.transaction_id + ' — الخدمة: ' + l.service + ' (×' + fmtNum(l.qty) + ')';
      }).join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(function () { toast('تم نسخ رسالة المتابعة للمنفذ «' + execName + '» ✓'); });
    } else {
      toast(txt, 'info', 6000);
    }
  };

  /* =====================================================================
     6) بناء واجهة تاب «ورقة المشاوير وحساب سعد» (#tab-couriers-plus)
     ===================================================================== */
  window.p53SetSubTab = function (sub) {
    state.subTab = sub;
    renderCouriersExecutorsTab();
  };

  window.p53SetMonth = async function (ym) {
    state.month = ym;
    await loadCouriersExecutorsRemoteData(true);
    renderCouriersExecutorsTab();
  };

  window.p53SetExecutor = function (ex) {
    state.selectedExecutor = ex;
    renderCouriersExecutorsTab();
  };

  function renderCouriersExecutorsTab() {
    var pane = $('tab-couriers-plus');
    if (!pane) return;

    var couriers = getAllCourierNames();
    var executors = getAllExecutorNames();
    var delays = computeExecutorDelayAlerts();
    var totalDelayedLines = delays.reduce(function (s, d) { return s + d.count; }, 0);
    var bodyHtml = '';

    if (state.subTab === 'runsheet') {
      var items = buildDailyRunSheetItems(state.runDate, state.runCourier, state.runKind);
      bodyHtml =
        '<div class="p53-card space-y-3">' +
          '<div class="flex flex-wrap items-center justify-between gap-2">' +
            '<div class="flex flex-wrap items-center gap-2 text-xs">' +
              '<label>التاريخ: <input type="date" value="' + eh(state.runDate) + '" onchange="window.__p53SetRunFilter(\'date\',this.value)" class="field !w-auto !py-1 font-mono" dir="ltr"></label>' +
              '<label>المندوب: <select onchange="window.__p53SetRunFilter(\'courier\',this.value)" class="field !w-auto !py-1">' +
                '<option value="all">كل المناديب</option>' +
                couriers.map(function (c) { return '<option value="' + eh(c) + '"' + (state.runCourier === c ? ' selected' : '') + '>' + eh(c) + '</option>'; }).join('') +
              '</select></label>' +
              '<label>النوع: <select onchange="window.__p53SetRunFilter(\'kind\',this.value)" class="field !w-auto !py-1">' +
                '<option value="all">استلام وتسليم</option>' +
                '<option value="pickup"' + (state.runKind === 'pickup' ? ' selected' : '') + '>استلام فقط</option>' +
                '<option value="delivery"' + (state.runKind === 'delivery' ? ' selected' : '') + '>تسليم فقط</option>' +
              '</select></label>' +
            '</div>' +
            '<div class="flex items-center gap-2">' +
              '<button type="button" onclick="p53CopyRunSheetWhatsapp()" class="p53-btn"><i class="fa-brands fa-whatsapp" style="color:var(--r-ok)"></i><span>نسخ خط السير</span></button>' +
              '<button type="button" onclick="p53PrintDailyRunSheet()" class="p53-btn p53-btn-pri"><i class="fa-solid fa-print"></i><span>طباعة ورقة المشاوير A4</span></button>' +
            '</div>' +
          '</div>' +
          (items.length
            ? '<div class="overflow-x-auto"><table class="p53-table"><thead><tr><th>#</th><th>المندوب</th><th>النوع</th><th>المعاملة</th><th>العميل والتليفون</th><th>المنطقة والعنوان</th><th>الخدمات</th><th>المبلغ</th><th>حالة التسليم</th></tr></thead><tbody>' +
                items.map(function (it, idx) {
                  return '<tr>' +
                    '<td>' + (idx + 1) + '</td>' +
                    '<td class="font-bold">' + eh(it.courier) + '</td>' +
                    '<td><span class="p53-pill ' + (it.rawKind === 'delivery' ? 'p53-pill-ok' : 'p53-pill-warn') + '">' + eh(it.kind) + '</span></td>' +
                    '<td class="font-mono" dir="ltr"><button type="button" onclick="openTxModal(\'' + eh(it.tx) + '\')" class="rc-tx-pill !py-0.5 !px-2 !text-[11px]">' + eh(it.tx) + '</button></td>' +
                    '<td><div class="font-bold">' + eh(it.client_name) + '</div><div class="font-mono text-[11px]" dir="ltr">' + eh(it.phone) + '</div></td>' +
                    '<td><div class="font-bold" style="color:var(--r-acc)">' + eh(it.region) + '</div><div class="text-[11px]" style="color:var(--r-mute)">' + eh(it.address) + '</div></td>' +
                    '<td>' + eh(it.services) + '</td>' +
                    '<td class="font-mono font-bold">' + eh(formatCurrency(it.amount)) + '</td>' +
                    '<td>' + (it.confirmed ? '<span class="p53-pill p53-pill-ok">مؤكد ✓</span>' : '<button type="button" onclick="window.__p53QuickConfirm(\'' + eh(it.tx) + '\',\'' + eh(it.client_name) + '\',\'' + eh(it.courier) + '\',\'' + eh(it.region) + '\')" class="p53-btn !py-1 !px-2 !text-[11px]">تأكيد تسليم</button>') + '</td>' +
                  '</tr>';
                }).join('') +
              '</tbody></table></div>'
            : '<div class="py-8 text-center text-xs" style="color:var(--r-mute)">لا توجد مشاوير مسجلة في هذا التاريخ (' + eh(state.runDate) + ').</div>') +
        '</div>';
    } else if (state.subTab === 'courier_stats') {
      var stats = computeCourierStats(state.month);
      bodyHtml =
        '<div class="p53-card space-y-3">' +
          '<h3 class="font-bold text-sm">إحصائيات المناديب وتوزيع المناطق المعتمدة — ' + eh(monthTitleAr(state.month)) + ' (42)</h3>' +
          '<div class="overflow-x-auto"><table class="p53-table"><thead><tr><th>المندوب</th><th>مشاوير استلام</th><th>مشاوير تسليم</th><th>إجمالي المشاوير</th><th>إجمالي بدل المشاوير</th><th>تسليمات مؤكدة</th><th>أكثر المناطق نشاطاً</th></tr></thead><tbody>' +
            stats.map(function (s) {
              var topRegs = Object.entries(s.regions).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 3).map(function (r) { return r[0] + ' (' + r[1] + ')'; }).join(' ، ') || '—';
              return '<tr>' +
                '<td class="font-bold">' + eh(s.name) + '</td>' +
                '<td class="font-mono">' + s.pickup + '</td>' +
                '<td class="font-mono">' + s.delivery + '</td>' +
                '<td class="font-mono font-bold">' + s.total + '</td>' +
                '<td class="font-mono font-bold" style="color:var(--r-acc)">' + eh(formatCurrency(s.fees)) + '</td>' +
                '<td class="font-mono">' + s.confirmed + '</td>' +
                '<td class="text-[11px]">' + eh(topRegs) + '</td>' +
              '</tr>';
            }).join('') +
          '</tbody></table></div>' +
        '</div>';
    } else if (state.subTab === 'saad_statement') {
      var st = computeExecutorStatement(state.selectedExecutor, state.month);
      bodyHtml =
        '<div class="space-y-4">' +
          '<div class="p53-card space-y-3">' +
            '<div class="flex flex-wrap items-center justify-between gap-2">' +
              '<div class="flex flex-wrap items-center gap-2">' +
                '<button type="button" onclick="p53SetExecutor(\'سعد\')" class="p53-btn ' + (state.selectedExecutor === 'سعد' ? 'p53-btn-pri' : '') + '"><i class="fa-solid fa-bolt"></i><span>كشف حساب سعد تلقائي</span></button>' +
                '<select onchange="p53SetExecutor(this.value)" class="field !w-auto !py-1.5 text-xs">' +
                  executors.map(function (ex) {
                    return '<option value="' + eh(ex) + '"' + (state.selectedExecutor === ex ? ' selected' : '') + '>المنفذ: ' + eh(ex) + '</option>';
                  }).join('') +
                '</select>' +
              '</div>' +
              '<button type="button" onclick="p53PrintSaadStatement()" class="p53-btn p53-btn-pri"><i class="fa-solid fa-print"></i><span>طباعة كشف الحساب A4 / PDF</span></button>' +
            '</div>' +

            '<div class="p53-kpi-grid">' +
              '<div class="p53-kpi"><div class="p53-kpi-lbl">إجمالي الخدمات الصافية</div><div class="p53-kpi-val">' + fmtNum(st.totalUnits) + '</div><div class="text-[11px] mt-1" style="color:var(--r-mute)">منفذ: ' + fmtNum(st.doneUnits) + ' · قيد التنفيذ: ' + fmtNum(st.openUnits) + '</div></div>' +
              '<div class="p53-kpi"><div class="p53-kpi-lbl">إجمالي تكلفة التنفيذ الصافية</div><div class="p53-kpi-val" style="color:var(--r-acc)">' + eh(formatCurrency(st.netCost)) + '</div><div class="text-[11px] mt-1" style="color:var(--r-mute)">مخصوم مرتجعات: ' + eh(formatCurrency(st.forfeitedRefundCost)) + '</div></div>' +
              '<div class="p53-kpi"><div class="p53-kpi-lbl">إجمالي الدفعات المسددة</div><div class="p53-kpi-val" style="color:var(--r-ok)">' + eh(formatCurrency(st.totalPaid)) + '</div><div class="text-[11px] mt-1" style="color:var(--r-mute)">' + st.payments.length + ' دفعة مسجلة</div></div>' +
              '<div class="p53-kpi"><div class="p53-kpi-lbl">الرصيد المتبقي المستحق</div><div class="p53-kpi-val" style="color:' + (st.remainingBalance > 0 ? 'var(--r-bad)' : 'var(--r-ok)') + '">' + eh(formatCurrency(st.remainingBalance)) + '</div><div class="text-[11px] mt-1" style="color:var(--r-mute)">للمنفذ «' + eh(st.executorName) + '»</div></div>' +
            '</div>' +

            (isMgr()
              ? '<form onsubmit="p53AddExecutorPayment(event)" class="pt-3 border-t flex flex-wrap items-end gap-2 text-xs" style="border-color:var(--r-line)">' +
                  '<div><label class="label">تسجيل دفعة سداد لـ «' + eh(st.executorName) + '» (ج.م)</label><input id="p53-pay-amt" type="number" step="any" min="1" required placeholder="المبلغ..." class="field !w-36 !py-1.5 font-mono" dir="ltr"></div>' +
                  '<div><label class="label">طريقة السداد</label><select id="p53-pay-method" class="field !w-auto !py-1.5"><option value="كاش">كاش</option><option value="انستا باي">انستا باي</option><option value="فودافون كاش">فودافون كاش</option><option value="تحويل بنكي">تحويل بنكي</option></select></div>' +
                  '<div class="flex-1 min-w-[160px]"><label class="label">بيان / رقم مرجع</label><input id="p53-pay-note" type="text" placeholder="مثال: دفعة تحت الحساب..." class="field !py-1.5"></div>' +
                  '<button type="submit" class="p53-btn p53-btn-pri !py-2"><i class="fa-solid fa-plus"></i><span>تسجيل الدفعة</span></button>' +
                '</form>'
              : '') +
          '</div>' +

          '<div class="p53-card space-y-2">' +
            '<h4 class="font-bold text-xs" style="color:var(--r-mute)">تفاصيل البنود المسندة إلى «' + eh(st.executorName) + '» (' + st.rows.length + ' بند)</h4>' +
            (st.rows.length
              ? '<div class="overflow-x-auto"><table class="p53-table"><thead><tr><th>المعاملة</th><th>التاريخ</th><th>العميل</th><th>الخدمة</th><th>العدد</th><th>تكلفة الوحدة</th><th>صافي التكلفة</th><th>الحالة</th></tr></thead><tbody>' +
                  st.rows.slice(0, 100).map(function (r) {
                    return '<tr>' +
                      '<td class="font-mono" dir="ltr"><button type="button" onclick="openTxModal(\'' + eh(r.line.transaction_id) + '\')" class="rc-tx-pill !py-0.5 !px-2 !text-[11px]">' + eh(r.line.transaction_id) + '</button></td>' +
                      '<td class="font-mono text-[11px]">' + eh(lineDayOf(r.line)) + '</td>' +
                      '<td>' + eh(r.line.client_name || '—') + '</td>' +
                      '<td>' + eh(r.line.service || '—') + '</td>' +
                      '<td class="font-mono">' + fmtNum(r.qty) + '</td>' +
                      '<td class="font-mono">' + eh(formatCurrency(r.unitCost)) + '</td>' +
                      '<td class="font-mono font-bold">' + eh(formatCurrency(r.netCost)) + '</td>' +
                      '<td><span class="p53-pill ' + (r.isDone ? 'p53-pill-ok' : 'p53-pill-warn') + '">' + eh(statusLabel(r.status)) + '</span></td>' +
                    '</tr>';
                  }).join('') +
                '</tbody></table></div>'
              : '<div class="py-6 text-center text-xs" style="color:var(--r-mute)">لا توجد بنود مسجلة باسم «' + eh(st.executorName) + '» في هذه الفترة.</div>') +
          '</div>' +
        '</div>';
    } else if (state.subTab === 'confirm_delivery') {
      var readyOrders = getOrders().filter(function (o) {
        return (typeof getOrderStatus === 'function' ? getOrderStatus(o) : '') !== 'Delivered';
      });
      bodyHtml =
        '<div class="p53-card space-y-4">' +
          '<div>' +
            '<h3 class="font-bold text-sm">تأكيد تسليم المعاملة للعميل (44)</h3>' +
            '<p class="text-[11px]" style="color:var(--r-mute)">يوثّق استلام العميل الفعلي بالاسم وكود التحقق (آخر 4 أرقام من الموبايل) ويحوّل حالة المعاملة إلى «تم التسليم».</p>' +
          '</div>' +
          '<form onsubmit="p53SubmitDeliveryConfirm(event)" class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">' +
            '<div><label class="label">رقم المعاملة (Request ID)</label><input id="p53-dc-tx" list="p53-dc-tx-dl" required dir="ltr" placeholder="TX-2026-..." class="field font-mono text-right">' +
              '<datalist id="p53-dc-tx-dl">' +
                readyOrders.slice(0, 80).map(function (o) { return '<option value="' + eh(o.transaction_id) + '">' + eh(o.client_name || '') + '</option>'; }).join('') +
              '</datalist>' +
            '</div>' +
            '<div><label class="label">اسم المستلم الفعلي</label><input id="p53-dc-recv" required placeholder="اسم العميل أو المفوض..." class="field"></div>' +
            '<div><label class="label">المندوب المسلِّم</label><select id="p53-dc-courier" class="field"><option value="تسليم بالمكتب">تسليم بالمكتب (بدون مندوب)</option>' +
              couriers.map(function (c) { return '<option value="' + eh(c) + '">' + eh(c) + '</option>'; }).join('') +
            '</select></div>' +
            '<div><label class="label">كود التحقق (آخر 4 أرقام من تليفون العميل)</label><input id="p53-dc-code" maxlength="8" dir="ltr" placeholder="مثال: 4821" class="field font-mono text-right"></div>' +
            '<div><label class="label">المنطقة المعتمدة</label><select id="p53-dc-area" class="field">' +
              APPROVED_REGIONS.map(function (r) { return '<option value="' + eh(r) + '">' + eh(r) + '</option>'; }).join('') +
            '</select></div>' +
            '<div><label class="label">ملاحظات التسليم</label><input id="p53-dc-notes" placeholder="اختياري..." class="field"></div>' +
            '<div class="sm:col-span-3 flex justify-end"><button type="submit" class="p53-btn p53-btn-pri"><i class="fa-solid fa-circle-check"></i><span>تأكيد التسليم وتحويل الحالة</span></button></div>' +
          '</form>' +
        '</div>';
    } else if (state.subTab === 'exec_eval') {
      var evals = computeExecutorEvaluations(state.month);
      bodyHtml =
        '<div class="p53-card space-y-3">' +
          '<h3 class="font-bold text-sm">تقييم المنفذين بالسرعة والالتزام بالموعد (45)</h3>' +
          '<div class="overflow-x-auto"><table class="p53-table"><thead><tr><th>المنفذ</th><th>إجمالي الخدمات</th><th>المنفذ</th><th>نسبة الإنجاز</th><th>متوسط سرعة التنفيذ</th><th>الالتزام بالموعد</th><th>المتأخر</th><th>التقييم</th></tr></thead><tbody>' +
            evals.map(function (ev) {
              return '<tr>' +
                '<td class="font-bold">' + eh(ev.name) + '</td>' +
                '<td class="font-mono">' + fmtNum(ev.total) + '</td>' +
                '<td class="font-mono">' + fmtNum(ev.done) + '</td>' +
                '<td><span class="p53-pill ' + (ev.completionPct >= 80 ? 'p53-pill-ok' : 'p53-pill-warn') + '">' + ev.completionPct + '%</span></td>' +
                '<td class="font-mono">' + (ev.avgDays === '—' ? '—' : ev.avgDays + ' يوم') + '</td>' +
                '<td><span class="p53-pill ' + (ev.onTimePct >= 85 ? 'p53-pill-ok' : 'p53-pill-bad') + '">' + ev.onTimePct + '%</span></td>' +
                '<td class="font-mono" style="color:' + (ev.late > 0 ? 'var(--r-bad)' : 'var(--r-ok)') + '">' + fmtNum(ev.late) + '</td>' +
                '<td class="font-bold" style="color:var(--r-acc)">★ ' + ev.stars + ' / 5</td>' +
              '</tr>';
            }).join('') +
          '</tbody></table></div>' +
        '</div>';
    } else if (state.subTab === 'cost_compare') {
      var cmp = computeServiceCostComparison();
      bodyHtml =
        '<div class="p53-card space-y-3">' +
          '<h3 class="font-bold text-sm">مقارنة التكاليف بين المنفذين لكل خدمة (46)</h3>' +
          '<div class="overflow-x-auto"><table class="p53-table"><thead><tr><th>الخدمة</th><th>أفضل منفذ تكلفة</th><th>أقل تكلفة للوحدة</th><th>أعلى تكلفة مسجلة</th><th>التوفير للوحدة</th><th>كل المنفذين للخدمة</th></tr></thead><tbody>' +
            cmp.map(function (c) {
              return '<tr>' +
                '<td class="font-bold">' + eh(c.service) + '</td>' +
                '<td><span class="p53-pill p53-pill-ok"><i class="fa-solid fa-award"></i>' + eh(c.bestExecutor) + '</span></td>' +
                '<td class="font-mono font-bold">' + eh(formatCurrency(c.bestCost)) + '</td>' +
                '<td class="font-mono">' + eh(formatCurrency(c.maxCost)) + '</td>' +
                '<td class="font-mono font-bold" style="color:var(--r-ok)">' + (c.savingPerUnit > 0 ? 'توفير ' + formatCurrency(c.savingPerUnit) : 'سعر موحّد') + '</td>' +
                '<td class="text-[11px]">' + c.executors.map(function (e) { return eh(e.executor) + ' (' + formatCurrency(e.avgCost) + ')'; }).join(' · ') + '</td>' +
              '</tr>';
            }).join('') +
          '</tbody></table></div>' +
        '</div>';
    } else if (state.subTab === 'delay_alerts') {
      bodyHtml =
        '<div class="p53-card space-y-3">' +
          '<h3 class="font-bold text-sm">تنبيه تأخر المنفذين والمناديب (47)</h3>' +
          (delays.length
            ? '<div class="space-y-3">' +
                delays.map(function (d) {
                  return '<div class="p53-card flex flex-wrap items-center justify-between gap-2">' +
                    '<div>' +
                      '<div class="font-bold text-sm">' + eh(d.executor) + ' — <span style="color:var(--r-bad)">' + d.count + ' بند متأخر</span></div>' +
                      '<div class="text-[11px] mt-1" style="color:var(--r-mute)">أرقام المعاملات: ' + d.lines.slice(0, 6).map(function (l) { return l.transaction_id; }).join(' ، ') + '</div>' +
                    '</div>' +
                    '<button type="button" onclick="p53CopyExecutorDelayFollowup(\'' + eh(d.executor) + '\')" class="p53-btn p53-btn-pri !py-1.5 !px-3"><i class="fa-brands fa-whatsapp"></i><span>نسخ رسالة استعجال للمنفذ</span></button>' +
                  '</div>';
                }).join('') +
              '</div>'
            : '<div class="py-8 text-center text-xs" style="color:var(--r-ok)">ممتاز! لا توجد بنود متأخرة عند المنفذين حالياً.</div>') +
        '</div>';
    }

    pane.innerHTML =
      '<div class="p53-wrap space-y-4">' +
        '<div class="p53-card flex flex-wrap items-center justify-between gap-3">' +
          '<div>' +
            '<h2 class="font-bold text-base sm:text-lg text-ink dark:text-white flex items-center gap-2">' +
              '<i class="fa-solid fa-motorcycle" style="color:var(--r-acc,#ff9d6c)"></i>' +
              '<span>المناديب والمنفذين وكشف حساب سعد</span>' +
            '</h2>' +
            '<p class="text-xs mt-0.5" style="color:var(--r-mute)">ورقة المشاوير اليومية، إحصائيات المندوب، كشف حساب سعد التلقائي، تأكيد التسليم، وتقييم ومقارنة المنفذين</p>' +
          '</div>' +
          '<div class="flex items-center gap-2">' +
            '<input type="month" value="' + eh(state.month) + '" onchange="p53SetMonth(this.value)" class="field !w-auto !py-1.5 text-xs font-mono" dir="ltr">' +
          '</div>' +
        '</div>' +

        '<div class="p53-subnav">' +
          '<button type="button" class="' + (state.subTab === 'runsheet' ? 'is-on' : '') + '" onclick="p53SetSubTab(\'runsheet\')"><i class="fa-solid fa-route ms-1"></i>ورقة مشاوير يومية</button>' +
          '<button type="button" class="' + (state.subTab === 'saad_statement' ? 'is-on' : '') + '" onclick="p53SetSubTab(\'saad_statement\')"><i class="fa-solid fa-file-invoice-dollar ms-1"></i>كشف حساب سعد والمنفذين</button>' +
          '<button type="button" class="' + (state.subTab === 'confirm_delivery' ? 'is-on' : '') + '" onclick="p53SetSubTab(\'confirm_delivery\')"><i class="fa-solid fa-circle-check ms-1"></i>تأكيد تسليم</button>' +
          '<button type="button" class="' + (state.subTab === 'courier_stats' ? 'is-on' : '') + '" onclick="p53SetSubTab(\'courier_stats\')"><i class="fa-solid fa-chart-simple ms-1"></i>إحصائيات المندوب</button>' +
          '<button type="button" class="' + (state.subTab === 'exec_eval' ? 'is-on' : '') + '" onclick="p53SetSubTab(\'exec_eval\')"><i class="fa-solid fa-star ms-1"></i>تقييم المنفذ</button>' +
          '<button type="button" class="' + (state.subTab === 'cost_compare' ? 'is-on' : '') + '" onclick="p53SetSubTab(\'cost_compare\')"><i class="fa-solid fa-scale-balanced ms-1"></i>مقارنة التكاليف</button>' +
          '<button type="button" class="' + (state.subTab === 'delay_alerts' ? 'is-on' : '') + '" onclick="p53SetSubTab(\'delay_alerts\')"><i class="fa-solid fa-bell ms-1"></i>تنبيه التأخر (' + totalDelayedLines + ')</button>' +
        '</div>' +

        bodyHtml +
      '</div>';
  }

  window.__p53SetRunFilter = function (k, v) {
    if (k === 'date') state.runDate = v || todayIso();
    if (k === 'courier') state.runCourier = v || 'all';
    if (k === 'kind') state.runKind = v || 'all';
    renderCouriersExecutorsTab();
  };

  window.__p53QuickConfirm = function (tx, clientName, courier, area) {
    state.subTab = 'confirm_delivery';
    renderCouriersExecutorsTab();
    if ($('p53-dc-tx')) $('p53-dc-tx').value = tx || '';
    if ($('p53-dc-recv')) $('p53-dc-recv').value = clientName || '';
    if ($('p53-dc-courier') && courier) $('p53-dc-courier').value = courier;
    if ($('p53-dc-area') && area) $('p53-dc-area').value = area;
  };

  function placeBtn(btn) {
    var menu = $('nav-menu');
    if (!menu) return;
    var adminBody = menu.querySelector(':scope > section[data-mg="admin"] .mg-body') ||
                    menu.querySelector(':scope > section[data-mg="daily"] .mg-body');
    if (adminBody) {
      btn.dataset.mgi = '8';
      if (btn.parentElement !== adminBody) adminBody.appendChild(btn);
      return;
    }
    var foot = menu.querySelector(':scope > .r-logout-menu');
    if (foot) menu.insertBefore(btn, foot);
    else menu.appendChild(btn);
  }

  function remove() {
    var b = $('tab-couriers-plus-btn'), p = $('tab-couriers-plus');
    if (b) b.remove();
    if (p) p.remove();
  }

  function ensure() {
    if (isPartner()) { remove(); return false; }
    if (!$('tab-couriers-plus')) {
      var main = document.querySelector('main');
      if (!main) return false;
      var pane = document.createElement('div');
      pane.id = 'tab-couriers-plus';
      pane.className = 'hidden space-y-4';
      var host = $('tab-exec') || main.lastElementChild;
      if (host) host.insertAdjacentElement('afterend', pane);
      else main.appendChild(pane);
    }
    if (!$('tab-couriers-plus-btn') && $('nav-menu')) {
      var b = document.createElement('button');
      b.id = 'tab-couriers-plus-btn';
      b.type = 'button';
      b.setAttribute('data-tab-target', 'couriers-plus');
      b.className = BTN_OFF;
      b.setAttribute('onclick', "switchTab('couriers-plus')");
      b.innerHTML = '<i class="fa-solid fa-route text-amber-500"></i><span>مشاوير وحساب سعد</span>';
      placeBtn(b);
    }
    return true;
  }

  wrap('switchTab', function (orig) {
    return function (id) {
      var res = orig.apply(this, arguments);
      try {
        ensure();
        var on = id === 'couriers-plus' && !isPartner();
        var pane = $('tab-couriers-plus'), btn = $('tab-couriers-plus-btn');
        if (pane) pane.classList.toggle('hidden', !on);
        if (btn) btn.className = on ? BTN_ON : BTN_OFF;
        if (on) {
          var sec = btn && btn.closest('.mg');
          if (sec && !sec.classList.contains('open')) sec.classList.add('open');
          loadCouriersExecutorsRemoteData(false).then(renderCouriersExecutorsTab);
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
        state.trips = [];
        state.confirmations = [];
        state.payments = [];
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
