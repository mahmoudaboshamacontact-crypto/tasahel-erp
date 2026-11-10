/* =====================================================================
   الجزء ب: المرحلة 4 متابعة الشغل (js/51-work-tracking.js)
   الفيتشرز:
   - (11) كانبان بالحالات (قيد التنفيذ، قيد المراجعة، جاهز للتسليم، تم التسليم)
          مع سحب وإفلات على الديسكتوب والموبايل بدون أي مكتبة خارجية،
          ومع الحفاظ على أيقونات وتدرجات الخصم (.f16-disc) والتعليق (.f16-cmt).
   - (12) تعديل جماعي (تحديد معاملات وتغيير الحالة أو المنفذ أو الموظف أو التثبيت دفعة واحدة).
   - (13) حاسبة موعد التسليم (تحسب تاريخ التسليم المتوقع حسب مدة الخدمة والإجازات الرسمية وعطلة الأسبوع).
   - (15) سجل زمني متكامل للمعاملة (استلام + مراحل line_stage_events + تعديلات audit_log + تعليقات tx_comments + تسليم).
   - (17) تثبيت المعاملات المهمة في أعلى الجدول والكروت والكانبان (is_pinned + toggle_pin_tx).
   - (18) ملاحظات تسليم الوردية (shift_handover_notes + تأكيد استلام الوردية + ملخص تلقائي من allRequestLines).
   - (19) تنبيه للمعاملة الواقفة (أكتر من 48 ساعة في نفس الحالة بدون حركة).
   SQL: sql/part-b-work-tracking.sql
   ===================================================================== */
(function () {
  'use strict';
  if (window.__phase51WorkTracking) return;
  window.__phase51WorkTracking = true;

  var $ = function (id) { return document.getElementById(id); };
  var eh = function (s) {
    return typeof escapeHtml === 'function'
      ? escapeHtml(s)
      : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
          return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
  };
  var num = function (v) { return Number(v) || 0; };
  var isMgr = function () {
    if (window.__role) return window.__role === 'manager';
    try { return typeof canEditTx === 'function' && !!canEditTx(); } catch (e) { return false; }
  };
  var isPartner = function () {
    return window.__role === 'partner' || (document.body && document.body.classList.contains('is-partner-mode'));
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

  var STAGES = [
    { key: 'In Progress', label: 'قيد التنفيذ', icon: 'fa-gears', color: '#8b5cf6' },
    { key: 'Under Review', label: 'تحت المراجعة', icon: 'fa-magnifying-glass', color: '#f59e0b' },
    { key: 'Complete', label: 'مكتمل', icon: 'fa-box-open', color: '#14b8a6' },
    { key: 'Delivered', label: 'تم التسليم', icon: 'fa-circle-check', color: '#10b981' }
  ];

  /* إجازات رسمية افتراضية (مصر 2026) وتُدمج مع جدول public.holidays عند فتح الحاسبة */
  var DEFAULT_HOLIDAYS = [
    { day: '2026-01-07', title: 'عيد الميلاد المجيد' },
    { day: '2026-01-25', title: 'عيد الشرطة وثورة 25 يناير' },
    { day: '2026-03-20', title: 'وقفة وإجازة عيد الفطر المبارك' },
    { day: '2026-03-21', title: 'عيد الفطر المبارك' },
    { day: '2026-03-22', title: 'إجازة عيد الفطر المبارك' },
    { day: '2026-04-13', title: 'عيد شم النسيم' },
    { day: '2026-04-25', title: 'عيد تحرير سيناء' },
    { day: '2026-05-01', title: 'عيد العمال' },
    { day: '2026-05-26', title: 'وقفة عرفات' },
    { day: '2026-05-27', title: 'عيد الأضحى المبارك' },
    { day: '2026-05-28', title: 'إجازة عيد الأضحى المبارك' },
    { day: '2026-05-29', title: 'إجازة عيد الأضحى المبارك' },
    { day: '2026-06-17', title: 'رأس السنة الهجرية' },
    { day: '2026-06-30', title: 'ذكرى ثورة 30 يونيو' },
    { day: '2026-07-23', title: 'عيد ثورة 23 يوليو' },
    { day: '2026-08-26', title: 'المولد النبوي الشريف' },
    { day: '2026-10-06', title: 'عيد القوات المسلحة (6 أكتوبر)' }
  ];

  var state = {
    txViewMode: 'table', /* 'table' | 'kanban' */
    stuckOnly: false,
    stuckHours: 48,
    selectedTxs: new Set(),
    pinnedCache: new Set(),
    commentCountMap: new Map(),
    holidays: DEFAULT_HOLIDAYS.slice(),
    holidaysLoadedAt: 0,
    shiftNotes: [],
    shiftNotesLoadedAt: 0,
    kanbanLimitPerCol: 35,
    kanbanSearch: '',
    kanbanEmp: 'all',
    kanbanExec: 'all',
    busy: false
  };

  /* تحميل الدبابيس المحفوظة محلياً كنسخة مساندة إلى جانب قاعدة البيانات */
  function loadLocalPins() {
    try {
      var raw = JSON.parse(localStorage.getItem('ts_pinned_txs_v1') || '[]');
      if (Array.isArray(raw)) {
        raw.forEach(function (tx) { if (tx) state.pinnedCache.add(String(tx)); });
      }
    } catch (e) { /* */ }
  }
  function saveLocalPins() {
    try {
      localStorage.setItem('ts_pinned_txs_v1', JSON.stringify(Array.from(state.pinnedCache)));
    } catch (e) { /* */ }
  }
  loadLocalPins();

  function getLines() {
    return (typeof allRequestLines !== 'undefined' && Array.isArray(allRequestLines)) ? allRequestLines : [];
  }
  function getOrders() {
    return (typeof groupedOrders !== 'undefined' && Array.isArray(groupedOrders)) ? groupedOrders : [];
  }

  /* مزامنة حالة التثبيت من allRequestLines */
  function syncPinsFromLines() {
    getLines().forEach(function (l) {
      if (l && l.is_pinned && l.transaction_id) {
        state.pinnedCache.add(String(l.transaction_id));
      }
    });
  }

  function isTxPinned(tx) {
    if (!tx) return false;
    var k = String(tx);
    if (state.pinnedCache.has(k)) return true;
    var o = getOrders().find(function (x) { return String(x.transaction_id) === k; });
    return !!(o && o.lines && o.lines.some(function (l) { return !!l.is_pinned; }));
  }

  /* =====================================================================
     1) حساب المعاملات الواقفة (Stuck Transactions - فيتشر 19)
     ===================================================================== */
  function getTxLastActivityMs(o) {
    if (!o || !o.lines || !o.lines.length) return Date.now();
    var best = 0;
    o.lines.forEach(function (l) {
      var candidates = [l.updated_at, l.pinned_at, l.exec_start_date, l.received_at, l.created_at];
      if (typeof lineStageEventsCache !== 'undefined' && lineStageEventsCache[String(l.id)]) {
        lineStageEventsCache[String(l.id)].forEach(function (ev) {
          if (ev && ev.at) candidates.push(ev.at);
        });
      }
      candidates.forEach(function (dt) {
        if (!dt) return;
        var t = new Date(String(dt).length === 10 ? dt + 'T12:00:00' : dt).getTime();
        if (!isNaN(t) && t > best) best = t;
      });
    });
    return best || Date.now();
  }

  function getStuckInfo(o) {
    if (!o || !o.lines || !o.lines.length) return null;
    var st = typeof getOrderStatus === 'function' ? getOrderStatus(o) : 'In Progress';
    if (st === 'Delivered') return null;
    /* استبعاد المعاملات المستردة بالكامل */
    var allFullRefund = o.lines.every(function (l) {
      if (typeof window.getLineRefundSummary === 'function') {
        var rf = window.getLineRefundSummary(l.id);
        return !!(rf && rf.isFull);
      }
      return false;
    });
    if (allFullRefund) return null;

    var lastMs = getTxLastActivityMs(o);
    var elapsedHours = Math.floor((Date.now() - lastMs) / 3600000);
    if (elapsedHours < state.stuckHours) return null;
    var days = Math.max(1, Math.floor(elapsedHours / 24));
    return {
      tx: String(o.transaction_id),
      status: st,
      hours: elapsedHours,
      days: days,
      lastMs: lastMs
    };
  }

  function getAllStuckOrders() {
    var list = [];
    getOrders().forEach(function (o) {
      var info = getStuckInfo(o);
      if (info) list.push({ order: o, info: info });
    });
    list.sort(function (a, b) { return b.info.hours - a.info.hours; });
    return list;
  }

  /* =====================================================================
     2) تثبيت المعاملات المهمة (Pinning - فيتشر 17)
     ===================================================================== */
  window.p51TogglePinTx = async function (tx, ev) {
    if (ev && ev.stopPropagation) ev.stopPropagation();
    if (!tx) return;
    var k = String(tx);
    var nextPin = !isTxPinned(k);
    if (nextPin) state.pinnedCache.add(k);
    else state.pinnedCache.delete(k);
    saveLocalPins();

    getLines().forEach(function (l) {
      if (String(l.transaction_id) === k) {
        l.is_pinned = nextPin;
        l.pinned_at = nextPin ? new Date().toISOString() : null;
      }
    });

    if (typeof sbClient !== 'undefined' && sbClient && typeof currentUser !== 'undefined' && currentUser) {
      try {
        var r = await sbClient.rpc('toggle_pin_tx', { p_tx: k, p_pin: nextPin });
        if (r.error) {
          var u = await sbClient
            .from('request_lines')
            .update({ is_pinned: nextPin, pinned_at: nextPin ? new Date().toISOString() : null })
            .eq('transaction_id', k);
          if (u.error && !/42703|42883|PGRST20[24]|does not exist|schema cache/i.test((u.error.message || '') + ' ' + (r.error.message || ''))) {
            showErr('تعذّر حفظ التثبيت في القاعدة', u.error);
          }
        }
      } catch (e) { /* */ }
    }

    toast(nextPin ? ('تم تثبيت المعاملة ' + k + ' في الأعلى 📌') : ('تم إلغاء تثبيت المعاملة ' + k), 'info');
    if (typeof renderRecentRequests === 'function') renderRecentRequests();
    renderKanbanBoard();
  };

  /* ترتيب المثبّت في الأعلى + فلتر الواقفة داخل __recentFilter */
  var prevRecentFilter = window.__recentFilter;
  window.__recentFilter = function (list) {
    var out = Array.isArray(list) ? list.slice() : [];
    if (typeof prevRecentFilter === 'function') {
      out = prevRecentFilter(out);
    }
    if (state.stuckOnly) {
      out = out.filter(function (o) { return !!getStuckInfo(o); });
    }
    syncPinsFromLines();
    out.sort(function (a, b) {
      var pa = isTxPinned(a.transaction_id) ? 1 : 0;
      var pb = isTxPinned(b.transaction_id) ? 1 : 0;
      if (pa !== pb) return pb - pa;
      return 0;
    });
    return out;
  };

  /* =====================================================================
     3) التعديل الجماعي (Bulk Edit - فيتشر 12)
     ===================================================================== */
  window.p51ToggleSelectTx = function (tx, checked, ev) {
    if (ev && ev.stopPropagation) ev.stopPropagation();
    if (!tx) return;
    var k = String(tx);
    if (checked == null) {
      if (state.selectedTxs.has(k)) state.selectedTxs.delete(k);
      else state.selectedTxs.add(k);
    } else if (checked) {
      state.selectedTxs.add(k);
    } else {
      state.selectedTxs.delete(k);
    }
    syncBulkBar();
    document.querySelectorAll('.p51-tx-ck[data-tx="' + CSS.escape(k) + '"]').forEach(function (cb) {
      cb.checked = state.selectedTxs.has(k);
    });
  };

  window.p51SelectAllVisible = function (selectAll) {
    if (!selectAll) {
      state.selectedTxs.clear();
    } else {
      document.querySelectorAll('.p51-tx-ck').forEach(function (cb) {
        if (cb.dataset.tx) state.selectedTxs.add(String(cb.dataset.tx));
      });
    }
    document.querySelectorAll('.p51-tx-ck').forEach(function (cb) {
      cb.checked = state.selectedTxs.has(String(cb.dataset.tx));
    });
    syncBulkBar();
  };

  function getSelectedLineIds() {
    var ids = [];
    getLines().forEach(function (l) {
      if (l && l.id != null && state.selectedTxs.has(String(l.transaction_id))) {
        ids.push(String(l.id));
      }
    });
    return ids;
  }

  window.p51BulkApplyStatus = async function () {
    var sel = $('p51-bulk-status');
    var st = sel ? sel.value : '';
    if (!st) return toast('اختر الحالة الجديدة أولاً', 'info');
    var ids = getSelectedLineIds();
    if (!ids.length) return toast('اختر معاملة واحدة على الأقل', 'info');
    if (state.busy) return;
    state.busy = true;
    try {
      var ok = await applyStatus(ids, st);
      if (ok) {
        toast('تم تحديث حالة ' + state.selectedTxs.size + ' معاملة (' + ids.length + ' بند) إلى ' + statusLabel(st));
        state.selectedTxs.clear();
        afterStatusChange();
        renderKanbanBoard();
        syncBulkBar();
      }
    } finally {
      state.busy = false;
    }
  };

  window.p51BulkApplyExecutor = async function () {
    var inp = $('p51-bulk-exec');
    var ex = inp ? inp.value.trim() : '';
    if (!ex) return toast('اكتب أو اختر اسم المنفذ أولاً', 'info');
    var ids = getSelectedLineIds();
    if (!ids.length) return toast('اختر معاملة واحدة على الأقل', 'info');
    if (!sbClient || state.busy) return;
    state.busy = true;
    try {
      var r = await sbClient.from('request_lines').update({ executor: ex }).in('id', ids).select('id,executor');
      if (r.error) { showErr('فشل التعديل الجماعي للمنفذ', r.error); return; }
      getLines().forEach(function (l) {
        if (ids.indexOf(String(l.id)) !== -1) l.executor = ex;
      });
      toast('تم تعيين المنفذ «' + ex + '» لـ ' + state.selectedTxs.size + ' معاملة');
      state.selectedTxs.clear();
      afterStatusChange();
      renderKanbanBoard();
      syncBulkBar();
    } finally {
      state.busy = false;
    }
  };

  window.p51BulkApplyEmployee = async function () {
    var inp = $('p51-bulk-emp');
    var emp = inp ? inp.value.trim() : '';
    if (!emp) return toast('اكتب أو اختر اسم الموظف أولاً', 'info');
    var ids = getSelectedLineIds();
    if (!ids.length) return toast('اختر معاملة واحدة على الأقل', 'info');
    if (!sbClient || state.busy) return;
    state.busy = true;
    try {
      var r = await sbClient.from('request_lines').update({ employee: emp }).in('id', ids).select('id,employee');
      if (r.error) { showErr('فشل التعديل الجماعي للموظف', r.error); return; }
      getLines().forEach(function (l) {
        if (ids.indexOf(String(l.id)) !== -1) l.employee = emp;
      });
      toast('تم تحويل ' + state.selectedTxs.size + ' معاملة للموظف «' + emp + '»');
      state.selectedTxs.clear();
      afterStatusChange();
      renderKanbanBoard();
      syncBulkBar();
    } finally {
      state.busy = false;
    }
  };

  window.p51BulkPin = async function (pinVal) {
    var txs = Array.from(state.selectedTxs);
    if (!txs.length) return;
    for (var i = 0; i < txs.length; i++) {
      var tx = txs[i];
      if (isTxPinned(tx) !== !!pinVal) {
        await window.p51TogglePinTx(tx);
      }
    }
    state.selectedTxs.clear();
    syncBulkBar();
  };

  function syncBulkBar() {
    var bar = $('p51-bulk-bar');
    var cnt = state.selectedTxs.size;
    if (!cnt) {
      if (bar) bar.remove();
      return;
    }
    var lineCnt = getSelectedLineIds().length;
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'p51-bulk-bar';
      bar.className = 'p51-bulk-bar';
      var host = (typeof currentTab !== 'undefined' && currentTab === 'kanban') ? $('tab-kanban') : $('tab-tx');
      if (!host) host = document.querySelector('main');
      if (host) host.appendChild(bar);
    }
    bar.innerHTML =
      '<div class="flex flex-wrap items-center gap-2 text-xs">' +
        '<span class="p51-pin-pill"><i class="fa-solid fa-check-double"></i><span>محدد: <b>' + cnt + '</b> معاملة (' + lineCnt + ' بند)</span></span>' +
        '<button type="button" onclick="p51SelectAllVisible(true)" class="p51-btn !py-1 !px-2.5 !text-[11px]">تحديد المعروض</button>' +
        '<button type="button" onclick="p51SelectAllVisible(false)" class="p51-btn !py-1 !px-2.5 !text-[11px]">إلغاء التحديد</button>' +
      '</div>' +
      '<div class="flex flex-wrap items-center gap-2 text-xs">' +
        '<div class="flex items-center gap-1">' +
          '<select id="p51-bulk-status" class="field !w-auto !py-1 !px-2 text-xs">' +
            '<option value="">تغيير الحالة...</option>' +
            STAGES.map(function (s) { return '<option value="' + s.key + '">' + s.label + '</option>'; }).join('') +
          '</select>' +
          '<button type="button" onclick="p51BulkApplyStatus()" class="p51-btn p51-btn-pri !py-1.5 !px-3">تطبيق الحالة</button>' +
        '</div>' +
        '<div class="flex items-center gap-1">' +
          '<input id="p51-bulk-exec" list="exec-datalist" placeholder="تعيين منفذ..." class="field !w-32 !py-1 !px-2 text-xs">' +
          '<button type="button" onclick="p51BulkApplyExecutor()" class="p51-btn !py-1.5 !px-2.5">حفظ المنفذ</button>' +
        '</div>' +
        '<div class="flex items-center gap-1">' +
          '<input id="p51-bulk-emp" list="emp-datalist" placeholder="تحويل لموظف..." class="field !w-32 !py-1 !px-2 text-xs">' +
          '<button type="button" onclick="p51BulkApplyEmployee()" class="p51-btn !py-1.5 !px-2.5">تحويل</button>' +
        '</div>' +
        '<button type="button" onclick="p51BulkPin(true)" class="p51-btn !py-1.5 !px-2.5" title="تثبيت المحدد"><i class="fa-solid fa-thumbtack"></i><span>تثبيت</span></button>' +
      '</div>';
  }

  /* =====================================================================
     4) تزيين شاشة المعاملات (#tab-tx) بأدوات المرحلة 4 والكانبان والتثبيت والواقفة
     ===================================================================== */
  function ensureTxPhase4Toolbar() {
    var txTab = $('tab-tx');
    var splitWrap = $('tx-split-wrap');
    if (!txTab || !splitWrap) return;

    if (!$('p51-tx-toolbar')) {
      var bar = document.createElement('div');
      bar.id = 'p51-tx-toolbar';
      bar.className = 'space-y-2.5';
      splitWrap.insertAdjacentElement('beforebegin', bar);
    }

    if (!$('p51-tx-kanban-host')) {
      var kh = document.createElement('div');
      kh.id = 'p51-tx-kanban-host';
      kh.className = 'hidden';
      splitWrap.insertAdjacentElement('beforebegin', kh);
    }

    renderTxPhase4Toolbar();
  }

  function renderTxPhase4Toolbar() {
    var bar = $('p51-tx-toolbar');
    if (!bar) return;
    var stuckList = getAllStuckOrders();
    var pinnedCount = getOrders().filter(function (o) { return isTxPinned(o.transaction_id); }).length;

    var stuckBannerHtml = stuckList.length
      ? '<div class="p51-stuck-banner">' +
          '<div class="flex items-center gap-2.5">' +
            '<span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl font-bold" style="background:rgba(255,107,107,.18);color:var(--r-bad,#ff6b6b)"><i class="fa-solid fa-triangle-exclamation"></i></span>' +
            '<div>' +
              '<div class="font-bold">تنبيه المعاملات الواقفة: يوجد <span style="color:var(--r-acc,#ff9d6c)">' + stuckList.length + ' معاملة</span> في نفس الحالة منذ أكثر من ' + state.stuckHours + ' ساعة بدون حركة</div>' +
              '<div class="text-[11px]" style="color:var(--r-mute,#a0978e)">أقدم معاملة واقفة: <b class="font-mono" dir="ltr">' + eh(stuckList[0].info.tx) + '</b> (' + eh(stuckList[0].order.client_name || '—') + ') — منذ ' + stuckList[0].info.days + ' يوم</div>' +
            '</div>' +
          '</div>' +
          '<div class="flex flex-wrap items-center gap-1.5">' +
            '<select onchange="p51SetStuckHours(this.value)" class="field !w-auto !py-1 !px-2 text-[11px]">' +
              [24, 48, 72].map(function (h) {
                return '<option value="' + h + '"' + (state.stuckHours === h ? ' selected' : '') + '>حد التنبيه: ' + h + ' ساعة</option>';
              }).join('') +
            '</select>' +
            '<button type="button" onclick="p51ToggleStuckFilter()" class="p51-btn ' + (state.stuckOnly ? 'p51-btn-active' : '') + ' !py-1.5 !px-3">' +
              '<i class="fa-solid fa-filter"></i><span>' + (state.stuckOnly ? 'إلغاء فلتر الواقفة (' + stuckList.length + ')' : 'عرض الواقفة فقط (' + stuckList.length + ')') + '</span>' +
            '</button>' +
          '</div>' +
        '</div>'
      : '';

    bar.innerHTML =
      stuckBannerHtml +
      '<div class="p51-toolbar">' +
        '<div class="flex flex-wrap items-center gap-1.5">' +
          '<button type="button" onclick="p51SetTxViewMode(\'table\')" class="p51-btn ' + (state.txViewMode === 'table' ? 'p51-btn-active' : '') + '">' +
            '<i class="fa-solid fa-table-list"></i><span>جدول وكروت</span>' +
          '</button>' +
          '<button type="button" onclick="p51SetTxViewMode(\'kanban\')" class="p51-btn ' + (state.txViewMode === 'kanban' ? 'p51-btn-active' : '') + '">' +
            '<i class="fa-solid fa-table-columns"></i><span>كانبان بالحالات</span>' +
          '</button>' +
          '<button type="button" onclick="p51ToggleStuckFilter()" class="p51-btn ' + (state.stuckOnly ? 'p51-btn-active' : '') + '">' +
            '<i class="fa-solid fa-hourglass-end"></i><span>المعاملات الواقفة (' + stuckList.length + ')</span>' +
          '</button>' +
          (pinnedCount > 0 ? '<span class="p51-pin-pill"><i class="fa-solid fa-thumbtack"></i><span>مثبتة: ' + pinnedCount + '</span></span>' : '') +
        '</div>' +
        '<div class="flex flex-wrap items-center gap-1.5">' +
          '<button type="button" onclick="p51OpenDeliveryCalculatorModal()" class="p51-btn">' +
            '<i class="fa-solid fa-calendar-check" style="color:var(--r-acc,#ff9d6c)"></i><span>حاسبة موعد التسليم</span>' +
          '</button>' +
          '<button type="button" onclick="p51OpenShiftHandoverModal()" class="p51-btn">' +
            '<i class="fa-solid fa-clipboard-user" style="color:var(--r-ok,#5fd3b3)"></i><span>تسليم الوردية</span>' +
          '</button>' +
        '</div>' +
      '</div>';
  }

  window.p51SetStuckHours = function (val) {
    state.stuckHours = Math.max(12, parseInt(val, 10) || 48);
    if (typeof renderRecentRequests === 'function') renderRecentRequests();
    renderKanbanBoard();
  };

  window.p51ToggleStuckFilter = function () {
    state.stuckOnly = !state.stuckOnly;
    if (typeof renderRecentRequests === 'function') renderRecentRequests();
    renderKanbanBoard();
  };

  window.p51SetTxViewMode = function (mode) {
    state.txViewMode = mode === 'kanban' ? 'kanban' : 'table';
    var splitWrap = $('tx-split-wrap');
    var kh = $('p51-tx-kanban-host');
    if (splitWrap) splitWrap.classList.toggle('hidden', state.txViewMode === 'kanban');
    if (kh) kh.classList.toggle('hidden', state.txViewMode !== 'kanban');
    renderTxPhase4Toolbar();
    if (state.txViewMode === 'kanban') renderKanbanBoard();
  };

  /* إضافة مربعات التحديد وأزرار التثبيت والسجل الزمني وشارة الواقفة لصفوف وكروت المعاملات */
  function decorateRecentRowsAndCards() {
    ensureTxPhase4Toolbar();
    syncPinsFromLines();

    var orderMap = new Map();
    getOrders().forEach(function (o) { orderMap.set(String(o.transaction_id), o); });

    document.querySelectorAll('#recent-table-body tr').forEach(function (tr) {
      var txBtn = tr.querySelector('[data-tx]');
      if (!txBtn) return;
      var tx = String(txBtn.dataset.tx || '');
      if (!tx || tr.dataset.p51Decorated === '1') return;
      tr.dataset.p51Decorated = '1';

      var o = orderMap.get(tx);
      var pinned = isTxPinned(tx);
      var stuck = o ? getStuckInfo(o) : null;
      var checked = state.selectedTxs.has(tx);

      if (pinned) tr.classList.add('bg-amber-50/40', 'dark:bg-amber-950/20');

      var firstTd = tr.querySelector('td');
      if (firstTd) {
        var ctrlWrap = document.createElement('div');
        ctrlWrap.className = 'inline-flex items-center gap-1.5 me-1.5 align-middle';
        ctrlWrap.innerHTML =
          '<input type="checkbox" class="p51-tx-ck h-3.5 w-3.5 rounded cursor-pointer" data-tx="' + eh(tx) + '"' + (checked ? ' checked' : '') + ' onclick="p51ToggleSelectTx(this.dataset.tx, this.checked, event)" title="تحديد للتعديل الجماعي">' +
          '<button type="button" class="p51-pin-btn ' + (pinned ? 'is-pinned' : '') + '" data-tx="' + eh(tx) + '" onclick="p51TogglePinTx(this.dataset.tx, event)" title="' + (pinned ? 'إلغاء التثبيت' : 'تثبيت في الأعلى') + '"><i class="fa-solid fa-thumbtack"></i></button>';
        firstTd.insertBefore(ctrlWrap, firstTd.firstChild);

        if (pinned || stuck) {
          var metaRow = document.createElement('div');
          metaRow.className = 'mt-1 flex flex-wrap gap-1';
          if (pinned) metaRow.innerHTML += '<span class="p51-pin-pill"><i class="fa-solid fa-thumbtack"></i>مثبتة</span>';
          if (stuck) metaRow.innerHTML += '<span class="p51-stuck-pill" title="معاملة واقفة بدون حركة"><i class="fa-solid fa-hourglass-end"></i>واقفة ' + stuck.days + ' يوم</span>';
          firstTd.appendChild(metaRow);
        }
      }

      var lastTd = tr.querySelector('td:last-child > div');
      if (lastTd) {
        var tlBtn = document.createElement('button');
        tlBtn.type = 'button';
        tlBtn.className = 'p-2 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-300 hover:bg-amber-500/25 transition';
        tlBtn.title = 'السجل الزمني الكامل';
        tlBtn.setAttribute('data-tx', tx);
        tlBtn.onclick = function (ev) { ev.stopPropagation(); window.p51OpenTimelineModal(tx); };
        tlBtn.innerHTML = '<i class="fa-solid fa-timeline text-xs"></i>';
        lastTd.appendChild(tlBtn);
      }
    });

    document.querySelectorAll('#recent-cards-container > [data-tx]').forEach(function (card) {
      var tx = String(card.dataset.tx || '');
      if (!tx || card.dataset.p51Decorated === '1') return;
      card.dataset.p51Decorated = '1';

      var o = orderMap.get(tx);
      var pinned = isTxPinned(tx);
      var stuck = o ? getStuckInfo(o) : null;
      var checked = state.selectedTxs.has(tx);

      if (pinned) card.classList.add('is-pinned');

      var topBar = document.createElement('div');
      topBar.className = 'mb-2 flex flex-wrap items-center justify-between gap-1.5 border-b border-slate-100 dark:border-white/10 pb-2';
      topBar.innerHTML =
        '<div class="flex items-center gap-1.5">' +
          '<input type="checkbox" class="p51-tx-ck h-4 w-4 rounded cursor-pointer" data-tx="' + eh(tx) + '"' + (checked ? ' checked' : '') + ' onclick="p51ToggleSelectTx(this.dataset.tx, this.checked, event)">' +
          '<button type="button" class="p51-pin-btn ' + (pinned ? 'is-pinned' : '') + '" data-tx="' + eh(tx) + '" onclick="p51TogglePinTx(this.dataset.tx, event)" title="تثبيت"><i class="fa-solid fa-thumbtack"></i></button>' +
          (pinned ? '<span class="p51-pin-pill">مثبتة</span>' : '') +
          (stuck ? '<span class="p51-stuck-pill"><i class="fa-solid fa-hourglass-end"></i>واقفة ' + stuck.days + ' يوم</span>' : '') +
        '</div>' +
        '<button type="button" data-tx="' + eh(tx) + '" onclick="event.stopPropagation();p51OpenTimelineModal(this.dataset.tx)" class="p51-btn !py-1 !px-2 !text-[11px]"><i class="fa-solid fa-timeline"></i><span>السجل الزمني</span></button>';
      card.insertBefore(topBar, card.firstChild);
    });

    if (state.txViewMode === 'kanban') {
      renderKanbanBoard();
    }
  }

  /* =====================================================================
     5) لوحة الكانبان بالحالات + سحب وإفلات للديسكتوب والموبايل بدون مكتبة (11)
     ===================================================================== */
  function maxDiscOfOrder(o) {
    if (!o || !o.lines) return 0;
    return Math.max.apply(null, [0].concat(o.lines.map(function (l) { return num(l.discount_pct); })));
  }

  function buildKanbanCardHtml(o) {
    var tx = String(o.transaction_id || '');
    var st = typeof getOrderStatus === 'function' ? getOrderStatus(o) : 'In Progress';
    var late = typeof isOrderLate === 'function' && isOrderLate(o);
    var stuck = getStuckInfo(o);
    var pinned = isTxPinned(tx);
    var disc = maxDiscOfOrder(o);
    var cmtCnt = state.commentCountMap.get(tx) || 0;
    var checked = state.selectedTxs.has(tx);

    var stageIdx = STAGES.findIndex(function (s) { return s.key === st; });
    var prevStage = stageIdx > 0 ? STAGES[stageIdx - 1] : null;
    var nextStage = stageIdx >= 0 && stageIdx < STAGES.length - 1 ? STAGES[stageIdx + 1] : null;

    /* الحفاظ الكامل على أيقونات وتدرجات الخصم والتعليق (.f16-disc, .f16-cmt, .f16-badge) */
    var extraClasses = [];
    if (disc > 0) extraClasses.push('f16-disc');
    if (cmtCnt > 0) extraClasses.push('f16-cmt');
    if (pinned) extraClasses.push('is-pinned');

    var topBadges = '';
    if (pinned) topBadges += '<span class="p51-pin-pill"><i class="fa-solid fa-thumbtack"></i>مثبتة</span>';
    if (disc > 0) topBadges += '<span class="f16-badge f16-b-disc"><i class="fa-solid fa-percent"></i>خصم ' + fmtNum(disc) + '%</span>';
    if (cmtCnt > 0) topBadges += '<span class="f16-badge f16-b-cmt" title="تعليقات المعاملة"><i class="fa-solid fa-comment-dots"></i>' + cmtCnt + '</span>';
    if (late) topBadges += '<span class="p51-stuck-pill"><i class="fa-solid fa-clock"></i>متأخر</span>';
    else if (stuck) topBadges += '<span class="p51-stuck-pill"><i class="fa-solid fa-hourglass-end"></i>واقفة ' + stuck.days + ' يوم</span>';

    var svcs = (o.lines || []).slice(0, 3).map(function (l) {
      return '<span class="rc-svc-pill !py-0.5 !px-2 !text-[10.5px]"><span class="rc-svc-name">' + eh(l.service || '—') + '</span><span class="rc-svc-qty" dir="ltr">×' + fmtNum(l.qty) + '</span></span>';
    }).join(' ');
    if ((o.lines || []).length > 3) {
      svcs += ' <span class="text-[10px] font-bold" style="color:var(--r-mute)">+' + (o.lines.length - 3) + '</span>';
    }

    return '<div class="p51-kb-card ' + extraClasses.join(' ') + '" draggable="true" data-kb-tx="' + eh(tx) + '" data-kb-status="' + eh(st) + '">' +
      '<div class="flex items-center justify-between gap-1.5 mb-1.5">' +
        '<div class="flex items-center gap-1.5">' +
          '<input type="checkbox" class="p51-tx-ck h-3.5 w-3.5 rounded cursor-pointer" data-tx="' + eh(tx) + '"' + (checked ? ' checked' : '') + ' onclick="p51ToggleSelectTx(this.dataset.tx, this.checked, event)">' +
          '<span class="p51-drag-handle" title="اسحب لنقل المعاملة لحالة أخرى"><i class="fa-solid fa-grip-vertical"></i></span>' +
          '<button type="button" onclick="openTxModal(\'' + eh(tx) + '\')" class="rc-tx-pill !py-0.5 !px-2 !text-[11px]" dir="ltr">' + eh(tx) + '</button>' +
        '</div>' +
        '<div class="flex items-center gap-1">' +
          '<button type="button" class="p51-pin-btn ' + (pinned ? 'is-pinned' : '') + '" data-tx="' + eh(tx) + '" onclick="p51TogglePinTx(this.dataset.tx, event)" title="تثبيت"><i class="fa-solid fa-thumbtack"></i></button>' +
          '<button type="button" data-tx="' + eh(tx) + '" onclick="p51OpenTimelineModal(this.dataset.tx)" class="p51-pin-btn" title="السجل الزمني"><i class="fa-solid fa-timeline"></i></button>' +
        '</div>' +
      '</div>' +
      (topBadges ? '<div class="mb-1.5 flex flex-wrap gap-1">' + topBadges + '</div>' : '') +
      '<div class="font-bold text-ink dark:text-white text-xs sm:text-sm leading-snug mb-1 cursor-pointer hover:underline" onclick="openTxModal(\'' + eh(tx) + '\')">' + eh(o.client_name || '—') + '</div>' +
      (o.phone ? '<div class="text-[11px] font-mono mb-1.5" style="color:var(--r-mute)" dir="ltr">' + eh(o.phone) + '</div>' : '') +
      '<div class="flex flex-wrap gap-1 mb-2">' + svcs + '</div>' +
      '<div class="flex items-center justify-between gap-2 pt-2 border-t text-[11px]" style="border-color:var(--r-line,rgba(255,255,255,.08))">' +
        '<span class="truncate" style="color:var(--r-mute)">' + eh(o.employee || '—') + '</span>' +
        '<span class="font-bold font-mono" style="color:var(--r-acc,#ff9d6c)">' + eh(formatCurrency(o.grand_total)) + '</span>' +
      '</div>' +
      '<div class="mt-2 pt-1.5 border-t flex items-center justify-between gap-1 text-[10.5px]" style="border-color:var(--r-line,rgba(255,255,255,.06))">' +
        (prevStage
          ? '<button type="button" onclick="p51MoveCardStatus(\'' + eh(tx) + '\',\'' + prevStage.key + '\')" class="p51-btn !py-0.5 !px-2 !text-[10.5px]" title="نقل إلى ' + prevStage.label + '"><i class="fa-solid fa-arrow-right"></i><span>' + prevStage.label + '</span></button>'
          : '<span></span>') +
        (nextStage
          ? '<button type="button" onclick="p51MoveCardStatus(\'' + eh(tx) + '\',\'' + nextStage.key + '\')" class="p51-btn !py-0.5 !px-2 !text-[10.5px]" title="نقل إلى ' + nextStage.label + '"><span>' + nextStage.label + '</span><i class="fa-solid fa-arrow-left"></i></button>'
          : '<span></span>') +
      '</div>' +
    '</div>';
  }

  window.p51MoveCardStatus = async function (tx, newStatus) {
    if (!tx || !newStatus) return;
    var o = getOrders().find(function (x) { return String(x.transaction_id) === String(tx); });
    if (!o) return;
    var cur = typeof getOrderStatus === 'function' ? getOrderStatus(o) : 'In Progress';
    if (cur === newStatus) return;
    await setTxStatus(tx, newStatus);
    renderKanbanBoard();
  };

  function getKanbanFilteredOrders(forStandaloneTab) {
    var list = getOrders().slice();
    if (!forStandaloneTab) {
      var qTx = (($('recent-q') && $('recent-q').value) || '').trim().toLowerCase();
      if (qTx) {
        list = list.filter(function (o) {
          return (o.client_name || '').toLowerCase().includes(qTx) ||
            (o.phone || '').includes(qTx) ||
            String(o.transaction_id).toLowerCase().includes(qTx) ||
            (o.lines || []).some(function (l) { return (l.service || '').toLowerCase().includes(qTx); });
        });
      }
      if (typeof window.__recentFilter === 'function') {
        list = window.__recentFilter(list);
      }
    } else {
      var q = (state.kanbanSearch || '').trim().toLowerCase();
      if (q) {
        list = list.filter(function (o) {
          return (o.client_name || '').toLowerCase().includes(q) ||
            (o.phone || '').includes(q) ||
            String(o.transaction_id).toLowerCase().includes(q) ||
            (o.lines || []).some(function (l) { return (l.service || '').toLowerCase().includes(q); });
        });
      }
      if (state.kanbanEmp !== 'all') {
        list = list.filter(function (o) { return (o.employee || '').trim() === state.kanbanEmp; });
      }
      if (state.kanbanExec !== 'all') {
        list = list.filter(function (o) {
          return (o.lines || []).some(function (l) { return ((l.executor || '').trim() || 'تنفيذ داخلي') === state.kanbanExec; });
        });
      }
      if (state.stuckOnly) {
        list = list.filter(function (o) { return !!getStuckInfo(o); });
      }
      list.sort(function (a, b) {
        var pa = isTxPinned(a.transaction_id) ? 1 : 0;
        var pb = isTxPinned(b.transaction_id) ? 1 : 0;
        return pb - pa;
      });
    }
    return list;
  }

  function buildKanbanColumnsHtml(orders) {
    var byStage = { 'In Progress': [], 'Under Review': [], 'Complete': [], 'Delivered': [] };
    orders.forEach(function (o) {
      var st = typeof getOrderStatus === 'function' ? getOrderStatus(o) : 'In Progress';
      if (!byStage[st]) byStage[st] = [];
      byStage[st].push(o);
    });

    return '<div class="p51-kanban-grid">' +
      STAGES.map(function (stg) {
        var colOrders = byStage[stg.key] || [];
        var shown = colOrders.slice(0, state.kanbanLimitPerCol);
        var sumTotal = colOrders.reduce(function (s, o) { return s + num(o.grand_total); }, 0);
        return '<div class="p51-kb-col" data-kb-col="' + stg.key + '">' +
          '<div class="p51-kb-head">' +
            '<div class="flex items-center gap-2">' +
              '<i class="fa-solid ' + stg.icon + '" style="color:' + stg.color + '"></i>' +
              '<span>' + stg.label + '</span>' +
            '</div>' +
            '<div class="flex items-center gap-1.5">' +
              '<span class="text-[10.5px] font-mono" style="color:var(--r-mute)">' + eh(formatCurrency(sumTotal)) + '</span>' +
              '<span class="p51-kb-count">' + colOrders.length + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="p51-kb-body" data-kb-drop="' + stg.key + '">' +
            (shown.length
              ? shown.map(buildKanbanCardHtml).join('') +
                (colOrders.length > shown.length
                  ? '<button type="button" onclick="p51ShowMoreKanban()" class="p51-btn w-full !py-1.5 text-center">عرض المزيد (' + (colOrders.length - shown.length) + ' متبقي)</button>'
                  : '')
              : '<div class="py-10 text-center text-xs" style="color:var(--r-mute)">اسحب معاملة إلى هنا أو لا توجد معاملات في هذه المرحلة</div>') +
          '</div>' +
        '</div>';
      }).join('') +
    '</div>';
  }

  window.p51ShowMoreKanban = function () {
    state.kanbanLimitPerCol += 30;
    renderKanbanBoard();
  };

  function renderKanbanBoard() {
    var txHost = $('p51-tx-kanban-host');
    if (txHost && state.txViewMode === 'kanban') {
      var listTx = getKanbanFilteredOrders(false);
      txHost.innerHTML = buildKanbanColumnsHtml(listTx);
      bindKanbanDragDrop(txHost);
    }

    var tabPane = $('tab-kanban');
    if (tabPane && !tabPane.classList.contains('hidden')) {
      renderStandaloneKanbanTab();
    }
  }

  /* سحب وإفلات للديسكتوب (HTML5 Drag & Drop) + الموبايل (Touch Events بدون أي مكتبة) */
  function bindKanbanDragDrop(container) {
    if (!container || container.dataset.kbBound === '1') return;
    container.dataset.kbBound = '1';

    var draggedTx = null;

    container.addEventListener('dragstart', function (e) {
      var card = e.target && e.target.closest ? e.target.closest('.p51-kb-card') : null;
      if (!card) return;
      draggedTx = card.getAttribute('data-kb-tx');
      card.classList.add('is-dragging');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', draggedTx || '');
      }
    });

    container.addEventListener('dragend', function (e) {
      var card = e.target && e.target.closest ? e.target.closest('.p51-kb-card') : null;
      if (card) card.classList.remove('is-dragging');
      container.querySelectorAll('.p51-kb-col.is-drop-target').forEach(function (c) {
        c.classList.remove('is-drop-target');
      });
      draggedTx = null;
    });

    container.addEventListener('dragover', function (e) {
      var col = e.target && e.target.closest ? e.target.closest('.p51-kb-col') : null;
      if (!col) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      container.querySelectorAll('.p51-kb-col').forEach(function (c) {
        c.classList.toggle('is-drop-target', c === col);
      });
    });

    container.addEventListener('drop', function (e) {
      var col = e.target && e.target.closest ? e.target.closest('.p51-kb-col') : null;
      if (!col) return;
      e.preventDefault();
      col.classList.remove('is-drop-target');
      var targetStatus = col.getAttribute('data-kb-col');
      var tx = draggedTx || (e.dataTransfer && e.dataTransfer.getData('text/plain'));
      if (tx && targetStatus) {
        window.p51MoveCardStatus(tx, targetStatus);
      }
    });

    /* سحب وإفلات للموبايل باللمس بدون مكتبة خارجية */
    var touchState = null;

    function clearTouchDrag() {
      if (!touchState) return;
      if (touchState.timer) clearTimeout(touchState.timer);
      if (touchState.ghost && touchState.ghost.parentNode) touchState.ghost.parentNode.removeChild(touchState.ghost);
      if (touchState.card) touchState.card.classList.remove('is-dragging');
      container.querySelectorAll('.p51-kb-col.is-drop-target').forEach(function (c) {
        c.classList.remove('is-drop-target');
      });
      touchState = null;
    }

    container.addEventListener('touchstart', function (e) {
      if (!e.touches || e.touches.length !== 1) return;
      var t = e.touches[0];
      var handle = e.target && e.target.closest ? e.target.closest('.p51-drag-handle') : null;
      var card = e.target && e.target.closest ? e.target.closest('.p51-kb-card') : null;
      if (!card) return;
      if (e.target.closest('button, input, a, select')) return;

      var tx = card.getAttribute('data-kb-tx');
      if (!tx) return;

      touchState = {
        tx: tx,
        card: card,
        startX: t.clientX,
        startY: t.clientY,
        active: false,
        ghost: null,
        targetStatus: null,
        timer: setTimeout(function () {
          if (!touchState) return;
          touchState.active = true;
          card.classList.add('is-dragging');
          var g = document.createElement('div');
          g.className = 'p51-touch-ghost';
          g.innerHTML = '<div class="font-bold">' + eh(tx) + '</div><div class="text-[11px] opacity-80">اسحب إلى عمود الحالة المطلوب ثم اترك</div>';
          g.style.left = Math.max(8, t.clientX - 120) + 'px';
          g.style.top = Math.max(8, t.clientY - 36) + 'px';
          document.body.appendChild(g);
          touchState.ghost = g;
        }, handle ? 40 : 240)
      };
    }, { passive: true });

    container.addEventListener('touchmove', function (e) {
      if (!touchState || !e.touches || !e.touches.length) return;
      var t = e.touches[0];
      var dx = Math.abs(t.clientX - touchState.startX);
      var dy = Math.abs(t.clientY - touchState.startY);
      if (!touchState.active) {
        if (dx > 12 || dy > 12) clearTouchDrag();
        return;
      }
      if (e.cancelable) e.preventDefault();
      if (touchState.ghost) {
        touchState.ghost.style.left = Math.max(8, t.clientX - 120) + 'px';
        touchState.ghost.style.top = Math.max(8, t.clientY - 36) + 'px';
      }
      var grid = container.querySelector('.p51-kanban-grid');
      if (grid) {
        var rect = grid.getBoundingClientRect();
        if (t.clientX < rect.left + 48) grid.scrollLeft -= 14;
        else if (t.clientX > rect.right - 48) grid.scrollLeft += 14;
      }
      var elUnder = document.elementFromPoint(t.clientX, t.clientY);
      var col = elUnder && elUnder.closest ? elUnder.closest('.p51-kb-col') : null;
      touchState.targetStatus = col ? col.getAttribute('data-kb-col') : null;
      container.querySelectorAll('.p51-kb-col').forEach(function (c) {
        c.classList.toggle('is-drop-target', c === col);
      });
    }, { passive: false });

    container.addEventListener('touchend', function () {
      if (!touchState) return;
      var active = touchState.active;
      var tx = touchState.tx;
      var targetStatus = touchState.targetStatus;
      clearTouchDrag();
      if (active && tx && targetStatus) {
        window.p51MoveCardStatus(tx, targetStatus);
      }
    });

    container.addEventListener('touchcancel', clearTouchDrag);
  }

  /* =====================================================================
     6) حاسبة موعد التسليم (Delivery Date Calculator - فيتشر 13)
     ===================================================================== */
  async function loadHolidaysIfNeeded(force) {
    if (!sbClient || !currentUser) return;
    if (!force && Date.now() - state.holidaysLoadedAt < 120000) return;
    state.holidaysLoadedAt = Date.now();
    try {
      var r = await sbClient.from('holidays').select('id,day,title').order('day', { ascending: true });
      if (!r.error && Array.isArray(r.data) && r.data.length) {
        var map = new Map();
        DEFAULT_HOLIDAYS.forEach(function (h) { map.set(h.day, h); });
        r.data.forEach(function (h) {
          if (h && h.day) map.set(String(h.day).slice(0, 10), { id: h.id, day: String(h.day).slice(0, 10), title: h.title || 'إجازة رسمية' });
        });
        state.holidays = Array.from(map.values()).sort(function (a, b) { return a.day.localeCompare(b.day); });
      }
    } catch (e) { /* */ }
  }

  function calculateDeliverySchedule(startDateStr, workingDays, weekendMode) {
    var base = new Date((startDateStr || new Date().toLocaleDateString('en-CA')) + 'T00:00:00');
    if (isNaN(base)) base = new Date();
    var targetDays = Math.max(1, parseInt(workingDays, 10) || 1);
    var holidayMap = new Map();
    state.holidays.forEach(function (h) { holidayMap.set(h.day, h.title); });

    var cur = new Date(base.getTime());
    var counted = 0;
    var calendarDays = 0;
    var skipped = [];

    while (counted < targetDays && calendarDays < 365) {
      cur.setDate(cur.getDate() + 1);
      calendarDays++;
      var ymd = cur.toLocaleDateString('en-CA');
      var dow = cur.getDay(); /* 5 = Friday, 6 = Saturday */
      var isWeekend = weekendMode === 'fri_sat' ? (dow === 5 || dow === 6) : (weekendMode === 'none' ? false : dow === 5);
      var holTitle = holidayMap.get(ymd);

      if (holTitle) {
        skipped.push({ day: ymd, reason: 'إجازة رسمية: ' + holTitle });
      } else if (isWeekend) {
        skipped.push({ day: ymd, reason: dow === 5 ? 'عطلة الجمعة' : 'عطلة السبت' });
      } else {
        counted++;
      }
    }

    var finalYmd = cur.toLocaleDateString('en-CA');
    var finalFormatted = typeof formatDateOnly === 'function' ? formatDateOnly(finalYmd) : finalYmd;
    var dayNameAr = '';
    try {
      dayNameAr = new Intl.DateTimeFormat('ar-EG', { weekday: 'long' }).format(cur);
    } catch (e) { /* */ }

    return {
      startYmd: base.toLocaleDateString('en-CA'),
      finalYmd: finalYmd,
      finalFormatted: finalFormatted,
      dayNameAr: dayNameAr,
      workingDays: targetDays,
      calendarDays: calendarDays,
      skipped: skipped
    };
  }

  function suggestServiceDurationDays(serviceName) {
    if (!serviceName) return 3;
    var cat = typeof findCatalogService === 'function' ? findCatalogService(serviceName) : null;
    if (cat && num(cat.duration_days) > 0) return num(cat.duration_days);
    var normSvc = typeof normName === 'function' ? normName(serviceName) : serviceName.trim().toLowerCase();
    var durs = [];
    getLines().forEach(function (l) {
      if (!l || !l.service) return;
      var k = typeof normName === 'function' ? normName(l.service) : l.service.trim().toLowerCase();
      if (k === normSvc && num(l.duration_days) > 0) durs.push(num(l.duration_days));
    });
    if (durs.length) {
      var sum = durs.reduce(function (a, b) { return a + b; }, 0);
      return Math.max(1, Math.round(sum / durs.length));
    }
    return 3;
  }

  window.p51OpenDeliveryCalculatorModal = async function () {
    await loadHolidaysIfNeeded(false);
    var old = $('p51-calc-modal');
    if (old) old.remove();

    var todayStr = new Date().toLocaleDateString('en-CA');
    var svcs = (typeof allServices !== 'undefined' && Array.isArray(allServices)) ? allServices : [];

    var ov = document.createElement('div');
    ov.id = 'p51-calc-modal';
    ov.className = 'p51-modal-ov';
    ov.innerHTML =
      '<div class="p51-modal-card space-y-4" onclick="event.stopPropagation()">' +
        '<div class="flex items-center justify-between border-b pb-3" style="border-color:var(--r-line)">' +
          '<div class="flex items-center gap-2.5">' +
            '<span class="flex h-9 w-9 items-center justify-center rounded-xl font-bold" style="background:rgba(255,157,108,.18);color:var(--r-acc,#ff9d6c)"><i class="fa-solid fa-calendar-check"></i></span>' +
            '<div>' +
              '<h3 class="font-bold text-sm sm:text-base">حاسبة موعد التسليم المتوقع</h3>' +
              '<p class="text-[11px]" style="color:var(--r-mute)">تحسب موعد استلام العميل بدقة مع استبعاد العطلات الأسبوعية والإجازات الرسمية</p>' +
            '</div>' +
          '</div>' +
          '<button type="button" onclick="document.getElementById(\'p51-calc-modal\').remove()" class="p51-btn !px-2.5 !py-1"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +

        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">' +
          '<div>' +
            '<label class="label">الخدمة (اختياري لجلب مدتها تلقائياً)</label>' +
            '<input id="p51-dc-svc" list="p51-dc-svc-dl" placeholder="اختر أو اكتب اسم الخدمة..." class="field" oninput="p51OnCalcServiceInput(this.value)">' +
            '<datalist id="p51-dc-svc-dl">' +
              svcs.map(function (s) {
                return '<option value="' + eh(s.name) + '">' + (s.duration_days ? s.duration_days + ' يوم عمل' : '') + '</option>';
              }).join('') +
            '</datalist>' +
          '</div>' +
          '<div>' +
            '<label class="label">تاريخ بداية التنفيذ / الاستلام</label>' +
            '<input id="p51-dc-start" type="date" value="' + todayStr + '" class="field font-mono" dir="ltr" onchange="p51RunDeliveryCalc()">' +
          '</div>' +
          '<div>' +
            '<label class="label">مدة التنفيذ (أيام عمل)</label>' +
            '<input id="p51-dc-days" type="number" min="1" max="180" value="3" class="field font-mono" dir="ltr" oninput="p51RunDeliveryCalc()">' +
          '</div>' +
          '<div>' +
            '<label class="label">نظام الإجازة الأسبوعية للجهة</label>' +
            '<select id="p51-dc-weekend" class="field" onchange="p51RunDeliveryCalc()">' +
              '<option value="fri_sat" selected>الجمعة والسبت (مصالح حكومية / سفارات)</option>' +
              '<option value="fri">الجمعة فقط</option>' +
              '<option value="none">بدون عطلة أسبوعية (أيام تقويمية)</option>' +
            '</select>' +
          '</div>' +
        '</div>' +

        '<div id="p51-dc-result" class="p51-card space-y-2"></div>' +

        '<details class="p51-card text-xs">' +
          '<summary class="cursor-pointer font-bold flex items-center justify-between">' +
            '<span><i class="fa-solid fa-calendar-day ms-1.5" style="color:var(--r-acc)"></i>قائمة الإجازات الرسمية المعتمدة (' + state.holidays.length + ')</span>' +
            '<span class="text-[11px]" style="color:var(--r-mute)">اضغط للعرض أو التعديل</span>' +
          '</summary>' +
          '<div class="mt-3 space-y-2">' +
            (isMgr()
              ? '<div class="flex flex-wrap items-end gap-2 pb-2 border-b" style="border-color:var(--r-line)">' +
                  '<label class="text-[11px]">التاريخ<input id="p51-hol-day" type="date" class="field !py-1 mt-0.5 font-mono" dir="ltr"></label>' +
                  '<label class="text-[11px] flex-1 min-w-[160px]">اسم الإجازة<input id="p51-hol-title" type="text" placeholder="مثال: إجازة رسمية..." class="field !py-1 mt-0.5"></label>' +
                  '<button type="button" onclick="p51AddHoliday()" class="p51-btn p51-btn-pri !py-1.5">إضافة إجازة</button>' +
                '</div>'
              : '') +
            '<div id="p51-hol-list" class="max-h-40 overflow-y-auto divide-y" style="border-color:var(--r-line)"></div>' +
          '</div>' +
        '</details>' +

        '<div class="flex flex-wrap items-center justify-end gap-2 pt-2 border-t" style="border-color:var(--r-line)">' +
          '<button type="button" onclick="p51CopyCalcText()" class="p51-btn"><i class="fa-regular fa-copy"></i><span>نسخ الموعد للعميل</span></button>' +
          '<button type="button" onclick="p51ApplyCalcToNewOrder()" class="p51-btn p51-btn-pri"><i class="fa-solid fa-check"></i><span>تطبيق المدة على الطلب الحالي</span></button>' +
        '</div>' +
      '</div>';

    ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
    p51RenderHolidaysList();
    window.p51RunDeliveryCalc();
  };

  function p51RenderHolidaysList() {
    var box = $('p51-hol-list');
    if (!box) return;
    box.innerHTML = state.holidays.map(function (h) {
      return '<div class="py-1.5 flex items-center justify-between gap-2 text-xs">' +
        '<div><span class="font-mono font-bold me-2" dir="ltr">' + eh(h.day) + '</span><span>' + eh(h.title) + '</span></div>' +
        (isMgr() ? '<button type="button" onclick="p51DeleteHoliday(\'' + eh(h.day) + '\')" class="text-rose-500 hover:underline text-[11px]">حذف</button>' : '') +
      '</div>';
    }).join('');
  }

  window.p51AddHoliday = async function () {
    if (!isMgr()) return toast('إضافة الإجازات الرسمية للمدير فقط', 'error');
    var day = $('p51-hol-day') ? $('p51-hol-day').value : '';
    var title = $('p51-hol-title') ? $('p51-hol-title').value.trim() : '';
    if (!day || !title) return toast('اختر التاريخ واكتب اسم الإجازة', 'info');
    if (sbClient) {
      var r = await sbClient.from('holidays').upsert({ day: day, title: title }, { onConflict: 'day' });
      if (r.error && !/42P01|PGRST205|does not exist/i.test(r.error.message || '')) {
        return showErr('تعذّر حفظ الإجازة', r.error);
      }
    }
    state.holidays = state.holidays.filter(function (x) { return x.day !== day; });
    state.holidays.push({ day: day, title: title });
    state.holidays.sort(function (a, b) { return a.day.localeCompare(b.day); });
    if ($('p51-hol-title')) $('p51-hol-title').value = '';
    p51RenderHolidaysList();
    window.p51RunDeliveryCalc();
    toast('تمت إضافة الإجازة الرسمية');
  };

  window.p51DeleteHoliday = async function (day) {
    if (!isMgr()) return;
    if (sbClient) {
      await sbClient.from('holidays').delete().eq('day', day);
    }
    state.holidays = state.holidays.filter(function (x) { return x.day !== day; });
    p51RenderHolidaysList();
    window.p51RunDeliveryCalc();
  };

  window.p51OnCalcServiceInput = function (val) {
    var dur = suggestServiceDurationDays(val);
    if ($('p51-dc-days')) $('p51-dc-days').value = dur;
    window.p51RunDeliveryCalc();
  };

  var lastCalcRes = null;
  window.p51RunDeliveryCalc = function () {
    var box = $('p51-dc-result');
    if (!box) return;
    var start = $('p51-dc-start') ? $('p51-dc-start').value : '';
    var days = $('p51-dc-days') ? $('p51-dc-days').value : 3;
    var wk = $('p51-dc-weekend') ? $('p51-dc-weekend').value : 'fri_sat';
    var res = calculateDeliverySchedule(start, days, wk);
    lastCalcRes = res;

    box.innerHTML =
      '<div class="flex flex-wrap items-center justify-between gap-3">' +
        '<div>' +
          '<div class="text-xs" style="color:var(--r-mute)">موعد التسليم المتوقع للعميل:</div>' +
          '<div class="text-base sm:text-lg font-extrabold mt-0.5" style="color:var(--r-acc,#ff9d6c)">' + eh(res.dayNameAr) + ' — ' + eh(res.finalFormatted) + ' <span class="font-mono text-xs" dir="ltr">(' + eh(res.finalYmd) + ')</span></div>' +
        '</div>' +
        '<div class="text-left text-xs">' +
          '<div>أيام العمل الفعلية: <b>' + res.workingDays + ' يوم</b></div>' +
          '<div style="color:var(--r-mute)">إجمالي الأيام التقويمية: <b>' + res.calendarDays + ' يوم</b> (تم تخطي ' + res.skipped.length + ' يوم عطلة)</div>' +
        '</div>' +
      '</div>' +
      (res.skipped.length
        ? '<div class="pt-2 border-t text-[11px] flex flex-wrap gap-1.5" style="border-color:var(--r-line)">' +
            '<span style="color:var(--r-mute)">العطلات التي تم استبعادها:</span>' +
            res.skipped.map(function (s) {
              return '<span class="p51-pin-pill !bg-transparent">' + eh(s.day) + ' (' + eh(s.reason) + ')</span>';
            }).join('') +
          '</div>'
        : '');
  };

  window.p51CopyCalcText = function () {
    if (!lastCalcRes) return;
    var svc = ($('p51-dc-svc') && $('p51-dc-svc').value.trim()) || 'المعاملة';
    var txt = 'موعد التسليم المتوقع لخدمة «' + svc + '»: يوم ' + lastCalcRes.dayNameAr + ' الموافق ' + lastCalcRes.finalFormatted + ' (' + lastCalcRes.workingDays + ' أيام عمل — بإجمالي ' + lastCalcRes.calendarDays + ' يوم تقويمي بعد استبعاد الإجازات الرسمية والعطلات).';
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(function () { toast('تم نسخ موعد التسليم للحافظة ✓'); });
    } else {
      toast(txt, 'info', 6000);
    }
  };

  window.p51ApplyCalcToNewOrder = function () {
    if (!lastCalcRes) return;
    var container = $('lines-container');
    if (container && container.lastElementChild) {
      container.lastElementChild.dataset.dur = String(lastCalcRes.calendarDays);
      toast('تم ضبط مدة التنفيذ (' + lastCalcRes.calendarDays + ' يوم تقويمي شاملة العطلات) على البند الحالي');
    }
    var m = $('p51-calc-modal');
    if (m) m.remove();
  };

  /* =====================================================================
     7) السجل الزمني المتكامل للمعاملة (Visual Timeline - فيتشر 15)
     ===================================================================== */
  window.p51OpenTimelineModal = async function (tx) {
    if (!tx) return;
    var o = getOrders().find(function (x) { return String(x.transaction_id) === String(tx); });
    if (!o) return toast('المعاملة غير موجودة', 'error');

    var old = $('p51-tl-modal');
    if (old) old.remove();

    var ov = document.createElement('div');
    ov.id = 'p51-tl-modal';
    ov.className = 'p51-modal-ov';
    ov.innerHTML =
      '<div class="p51-modal-card space-y-4" onclick="event.stopPropagation()">' +
        '<div class="flex items-center justify-between border-b pb-3" style="border-color:var(--r-line)">' +
          '<div class="flex items-center gap-2.5">' +
            '<span class="flex h-9 w-9 items-center justify-center rounded-xl font-bold" style="background:rgba(255,157,108,.18);color:var(--r-acc,#ff9d6c)"><i class="fa-solid fa-timeline"></i></span>' +
            '<div>' +
              '<h3 class="font-bold text-sm sm:text-base">السجل الزمني المتكامل — <span class="font-mono" dir="ltr">' + eh(tx) + '</span></h3>' +
              '<p class="text-[11px]" style="color:var(--r-mute)">العميل: ' + eh(o.client_name || '—') + ' · الموظف: ' + eh(o.employee || '—') + '</p>' +
            '</div>' +
          '</div>' +
          '<button type="button" onclick="document.getElementById(\'p51-tl-modal\').remove()" class="p51-btn !px-2.5 !py-1"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
        '<div id="p51-tl-body" class="py-4 text-center text-xs" style="color:var(--r-mute)"><i class="fa-solid fa-spinner fa-spin ms-1"></i>جارٍ تجميع السجل الزمني...</div>' +
      '</div>';

    ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);

    var events = [];
    var initAt = o.received_at || o.created_at;
    if (initAt) {
      events.push({
        at: initAt,
        kind: 'create',
        title: 'استلام وتسجيل المعاملة',
        desc: 'تم تسجيل المعاملة بواسطة ' + (o.employee || 'موظف') + ' بعدد ' + o.lines.length + ' بند خدمة وبإجمالي ' + formatCurrency(o.grand_total),
        color: '#8b5cf6'
      });
    }

    if (sbClient) {
      try {
        var resArr = await Promise.all([
          sbClient.from('line_stage_events').select('line_id,stage,at').eq('transaction_id', String(tx)).order('at', { ascending: true }),
          sbClient.from('audit_log').select('at,user_name,action,service,details').eq('transaction_id', String(tx)).order('at', { ascending: true }).limit(100),
          sbClient.from('tx_comments').select('author_name,body,is_public,created_at').eq('transaction_id', String(tx)).order('created_at', { ascending: true }).limit(50)
        ]);
        var stageRes = resArr[0], audRes = resArr[1], cmtRes = resArr[2];
        var stageNames = { in_progress: 'قيد التنفيذ', under_review: 'قيد المراجعة', complete: 'جاهز للتسليم', delivered: 'تم التسليم' };

        if (!stageRes.error && Array.isArray(stageRes.data)) {
          var prevStageTimeByLine = {};
          stageRes.data.forEach(function (ev) {
            var lineObj = (o.lines || []).find(function (l) { return String(l.id) === String(ev.line_id); });
            var svcName = (lineObj && lineObj.service) || ('بند #' + ev.line_id);
            var prevT = prevStageTimeByLine[ev.line_id];
            var curT = new Date(ev.at).getTime();
            var durText = '';
            if (prevT && !isNaN(curT) && curT > prevT) {
              var diffH = Math.round((curT - prevT) / 3600000);
              durText = diffH >= 24 ? (' (استغرقت المرحلة السابقة ' + Math.round(diffH / 24) + ' يوم)') : (diffH > 0 ? (' (استغرقت ' + diffH + ' ساعة)') : '');
            }
            prevStageTimeByLine[ev.line_id] = curT;
            events.push({
              at: ev.at,
              kind: 'stage',
              title: 'انتقال حالة: ' + (stageNames[ev.stage] || ev.stage),
              desc: 'الخدمة: «' + svcName + '»' + durText,
              color: ev.stage === 'delivered' ? '#10b981' : ev.stage === 'complete' ? '#14b8a6' : '#f59e0b'
            });
          });
        }

        if (!audRes.error && Array.isArray(audRes.data)) {
          audRes.data.forEach(function (a) {
            events.push({
              at: a.at,
              kind: 'audit',
              title: (a.action === 'created' ? 'إضافة بند' : a.action === 'deleted' ? 'حذف بند' : 'تعديل في المعاملة') + (a.service ? ' — ' + a.service : ''),
              desc: 'بواسطة: ' + (a.user_name || 'موظف'),
              color: '#ff9d6c'
            });
          });
        }

        if (!cmtRes.error && Array.isArray(cmtRes.data)) {
          cmtRes.data.forEach(function (c) {
            events.push({
              at: c.created_at,
              kind: 'comment',
              title: 'تعليق ' + (c.is_public ? '(مرئي للعميل)' : '(داخلي)') + ' — ' + (c.author_name || 'موظف'),
              desc: c.body || '',
              color: '#38bdf8'
            });
          });
        }
      } catch (e) { /* */ }
    }

    events.sort(function (a, b) {
      return new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime();
    });

    var body = $('p51-tl-body');
    if (!body) return;
    if (!events.length) {
      body.innerHTML = '<div class="py-6 text-center text-xs">لا توجد أحداث مسجلة لهذه المعاملة بعد.</div>';
      return;
    }

    body.className = 'p51-tl-list text-right';
    body.innerHTML = events.map(function (ev) {
      var dtStr = typeof formatDateTime === 'function' ? formatDateTime(ev.at) : String(ev.at || '');
      return '<div class="p51-tl-item">' +
        '<span class="p51-tl-dot" style="background:' + (ev.color || 'var(--r-acc)') + '"></span>' +
        '<div class="flex flex-wrap items-center justify-between gap-2">' +
          '<span class="font-bold text-ink dark:text-white">' + eh(ev.title) + '</span>' +
          '<span class="font-mono text-[11px]" style="color:var(--r-mute)" dir="ltr">' + eh(dtStr) + '</span>' +
        '</div>' +
        '<div class="mt-1 text-[11.5px]" style="color:var(--r-mute)">' + eh(ev.desc) + '</div>' +
      '</div>';
    }).join('');
  };

  /* =====================================================================
     8) ملاحظات تسليم الوردية (Shift Handover Notes - فيتشر 18)
     ===================================================================== */
  async function loadShiftHandoverNotes(force) {
    if (!sbClient || !currentUser) return;
    if (!force && Date.now() - state.shiftNotesLoadedAt < 60000) return;
    state.shiftNotesLoadedAt = Date.now();
    try {
      var r = await sbClient
        .from('shift_handover_notes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(25);
      if (r.error) {
        if (!/42P01|PGRST205|does not exist|schema cache/i.test((r.error.message || '') + ' ' + (r.error.code || ''))) {
          showErr('تعذّر تحميل ملاحظات الوردية', r.error);
        }
        return;
      }
      state.shiftNotes = r.data || [];
    } catch (e) { /* */ }
  }

  function buildAutoShiftSummary() {
    var today = new Date().toLocaleDateString('en-CA');
    var myName = (typeof myProfile !== 'undefined' && myProfile && myProfile.full_name) || '';
    var todayOrders = getOrders().filter(function (o) {
      return String(o.received_at || o.created_at || '').slice(0, 10) === today;
    });
    var readyOrders = getOrders().filter(function (o) {
      return (typeof getOrderStatus === 'function' ? getOrderStatus(o) : '') === 'Complete';
    });
    var reviewOrders = getOrders().filter(function (o) {
      return (typeof getOrderStatus === 'function' ? getOrderStatus(o) : '') === 'Under Review';
    });
    var stuck = getAllStuckOrders();

    var pendingTxs = []
      .concat(reviewOrders.slice(0, 4).map(function (o) { return o.transaction_id; }))
      .concat(stuck.slice(0, 4).map(function (s) { return s.info.tx; }));
    pendingTxs = Array.from(new Set(pendingTxs.filter(Boolean)));

    var text =
      'ملخص تسليم الوردية (' + today + ')' + (myName ? ' — ' + myName : '') + ':\n' +
      '• معاملات استُلمت اليوم: ' + todayOrders.length + ' معاملة\n' +
      '• معاملات جاهزة للتسليم للعملاء: ' + readyOrders.length + ' معاملة\n' +
      '• معاملات قيد المراجعة تحتاج متابعة: ' + reviewOrders.length + ' معاملة\n' +
      '• معاملات واقفة (+' + state.stuckHours + ' ساعة): ' + stuck.length + ' معاملة';

    return { text: text, pendingTxs: pendingTxs.join(', ') };
  }

  window.p51FillAutoShiftSummary = function () {
    var auto = buildAutoShiftSummary();
    if ($('p51-sh-summary')) $('p51-sh-summary').value = auto.text;
    if ($('p51-sh-txs')) $('p51-sh-txs').value = auto.pendingTxs;
  };

  window.p51SaveShiftNote = async function (ev) {
    if (ev && ev.preventDefault) ev.preventDefault();
    if (!sbClient || !currentUser) return;
    var shiftType = $('p51-sh-type') ? $('p51-sh-type').value : 'صباحية';
    var summary = $('p51-sh-summary') ? $('p51-sh-summary').value.trim() : '';
    var txsRaw = $('p51-sh-txs') ? $('p51-sh-txs').value : '';
    if (!summary) return toast('اكتب ملخص تسليم الوردية أولاً', 'error');

    var pendingTxs = txsRaw.split(/[,،\s]+/).map(function (s) { return s.trim(); }).filter(Boolean);
    var authorName = (typeof myProfile !== 'undefined' && myProfile && myProfile.full_name) || (currentUser && currentUser.email) || 'موظف';

    var btn = $('p51-sh-save-btn');
    if (btn) btn.disabled = true;
    try {
      var r = await sbClient.from('shift_handover_notes').insert({
        shift_type: shiftType,
        author_id: currentUser.id,
        author_name: authorName,
        summary: summary,
        pending_txs: pendingTxs
      });
      if (r.error) {
        if (/42P01|PGRST205|does not exist/i.test(r.error.message || '')) {
          return showErr('شغّل ملف sql/part-b-work-tracking.sql في Supabase أولاً لتفعيل جدول ملاحظات تسليم الوردية', r.error);
        }
        return showErr('فشل حفظ ملاحظة تسليم الوردية', r.error);
      }
      toast('تم حفظ ملاحظة تسليم الوردية بنجاح');
      if ($('p51-sh-summary')) $('p51-sh-summary').value = '';
      if ($('p51-sh-txs')) $('p51-sh-txs').value = '';
      await loadShiftHandoverNotes(true);
      p51RenderShiftNotesList();
    } finally {
      if (btn) btn.disabled = false;
    }
  };

  window.p51AcknowledgeShiftNote = async function (id) {
    if (!sbClient || !id) return;
    var r = await sbClient.rpc('acknowledge_shift_note', { p_id: Number(id) });
    if (r.error) {
      var myName = (typeof myProfile !== 'undefined' && myProfile && myProfile.full_name) || (currentUser && currentUser.email) || 'موظف';
      var u = await sbClient.from('shift_handover_notes').update({
        acknowledged_by: currentUser.id,
        acknowledged_name: myName,
        acknowledged_at: new Date().toISOString()
      }).eq('id', Number(id));
      if (u.error) return showErr('تعذّر تأكيد استلام الوردية', u.error);
    }
    toast('تم تأكيد استلام الوردية ✓');
    await loadShiftHandoverNotes(true);
    p51RenderShiftNotesList();
  };

  function p51RenderShiftNotesList() {
    var box = $('p51-sh-list');
    if (!box) return;
    if (!state.shiftNotes.length) {
      box.innerHTML = '<div class="py-6 text-center text-xs" style="color:var(--r-mute)">لا توجد ملاحظات تسليم وردية مسجلة بعد.</div>';
      return;
    }
    box.innerHTML = state.shiftNotes.map(function (n) {
      var txs = Array.isArray(n.pending_txs) ? n.pending_txs : [];
      return '<div class="p51-card space-y-2 text-xs">' +
        '<div class="flex flex-wrap items-center justify-between gap-2">' +
          '<div class="flex items-center gap-2">' +
            '<span class="p51-pin-pill">وردية ' + eh(n.shift_type || 'عام') + '</span>' +
            '<span class="font-bold text-ink dark:text-white">' + eh(n.author_name || 'موظف') + '</span>' +
            '<span class="text-[11px] font-mono" style="color:var(--r-mute)" dir="ltr">' + eh(typeof formatDateTime === 'function' ? formatDateTime(n.created_at) : n.shift_date) + '</span>' +
          '</div>' +
          (n.acknowledged_at
            ? '<span class="px-2.5 py-1 rounded-full text-[11px] font-bold" style="background:rgba(95,211,179,.16);color:var(--r-ok,#5fd3b3)"><i class="fa-solid fa-check ms-1"></i>استلمها: ' + eh(n.acknowledged_name || 'موظف') + '</span>'
            : '<button type="button" onclick="p51AcknowledgeShiftNote(' + Number(n.id) + ')" class="p51-btn p51-btn-pri !py-1 !px-2.5 !text-[11px]"><i class="fa-solid fa-handshake"></i><span>تأكيد استلام الوردية</span></button>') +
        '</div>' +
        '<div class="whitespace-pre-line leading-relaxed">' + eh(n.summary || '') + '</div>' +
        (txs.length
          ? '<div class="flex flex-wrap items-center gap-1.5 pt-1">' +
              '<span class="text-[11px]" style="color:var(--r-mute)">معاملات للمتابعة:</span>' +
              txs.map(function (tx) {
                return '<button type="button" onclick="if(document.getElementById(\'p51-shift-modal\'))document.getElementById(\'p51-shift-modal\').remove();openTxModal(\'' + eh(tx) + '\')" class="rc-tx-pill !py-0.5 !px-2 !text-[11px]" dir="ltr">' + eh(tx) + '</button>';
              }).join('') +
            '</div>'
          : '') +
      '</div>';
    }).join('');
  }

  window.p51OpenShiftHandoverModal = async function () {
    var old = $('p51-shift-modal');
    if (old) old.remove();

    var ov = document.createElement('div');
    ov.id = 'p51-shift-modal';
    ov.className = 'p51-modal-ov';
    ov.innerHTML =
      '<div class="p51-modal-card space-y-4" onclick="event.stopPropagation()">' +
        '<div class="flex items-center justify-between border-b pb-3" style="border-color:var(--r-line)">' +
          '<div class="flex items-center gap-2.5">' +
            '<span class="flex h-9 w-9 items-center justify-center rounded-xl font-bold" style="background:rgba(95,211,179,.18);color:var(--r-ok,#5fd3b3)"><i class="fa-solid fa-clipboard-user"></i></span>' +
            '<div>' +
              '<h3 class="font-bold text-sm sm:text-base">ملاحظات تسليم الوردية</h3>' +
              '<p class="text-[11px]" style="color:var(--r-mute)">سجّل ما تم إنجازه والمعاملات المعلقة للزميل في الوردية التالية</p>' +
            '</div>' +
          '</div>' +
          '<button type="button" onclick="document.getElementById(\'p51-shift-modal\').remove()" class="p51-btn !px-2.5 !py-1"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +

        '<form onsubmit="p51SaveShiftNote(event)" class="p51-card space-y-3 text-xs">' +
          '<div class="flex flex-wrap items-center justify-between gap-2">' +
            '<div class="flex items-center gap-2">' +
              '<label class="font-bold">الوردية:</label>' +
              '<select id="p51-sh-type" class="field !w-auto !py-1 text-xs">' +
                '<option value="صباحية">وردية صباحية</option>' +
                '<option value="مسائية">وردية مسائية</option>' +
                '<option value="ليلية">وردية ليلية</option>' +
                '<option value="عام">تسليم عام</option>' +
              '</select>' +
            '</div>' +
            '<button type="button" onclick="p51FillAutoShiftSummary()" class="p51-btn !py-1 !px-2.5 !text-[11px]">' +
              '<i class="fa-solid fa-wand-magic-sparkles" style="color:var(--r-acc)"></i><span>تعبئة تلقائية بملخص اليوم</span>' +
            '</button>' +
          '</div>' +
          '<div>' +
            '<label class="label">ملخص التسليم والملاحظات المهمة</label>' +
            '<textarea id="p51-sh-summary" rows="3" required maxlength="2000" placeholder="اكتب أهم الملاحظات أو اضغط تعبئة تلقائية..." class="field"></textarea>' +
          '</div>' +
          '<div>' +
            '<label class="label">أرقام المعاملات المعلقة للمتابعة (اختياري — افصل بفاصلة)</label>' +
            '<input id="p51-sh-txs" type="text" dir="ltr" placeholder="TX-2026-1001, TX-2026-1002" class="field font-mono text-right">' +
          '</div>' +
          '<div class="flex justify-end">' +
            '<button id="p51-sh-save-btn" type="submit" class="p51-btn p51-btn-pri"><i class="fa-solid fa-floppy-disk"></i><span>حفظ تسليم الوردية</span></button>' +
          '</div>' +
        '</form>' +

        '<div class="space-y-2">' +
          '<h4 class="font-bold text-xs" style="color:var(--r-mute)">سجل تسليمات الورديات الأخيرة</h4>' +
          '<div id="p51-sh-list" class="space-y-2.5 max-h-72 overflow-y-auto"><div class="py-4 text-center text-xs" style="color:var(--r-mute)">جارٍ التحميل...</div></div>' +
        '</div>' +
      '</div>';

    ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
    await loadShiftHandoverNotes(true);
    p51RenderShiftNotesList();
  };

  /* =====================================================================
     9) تاب مستقل «لوحة الكانبان والوردية» (#tab-kanban) بنفس نمط js/50
     ===================================================================== */
  function renderStandaloneKanbanTab() {
    var pane = $('tab-kanban');
    if (!pane) return;
    syncPinsFromLines();
    var stuckList = getAllStuckOrders();
    var emps = Array.from(new Set(getLines().map(function (l) { return (l.employee || '').trim(); }).filter(Boolean))).sort();
    var execs = Array.from(new Set(getLines().map(function (l) { return (l.executor || '').trim() || 'تنفيذ داخلي'; }).filter(Boolean))).sort();
    var orders = getKanbanFilteredOrders(true);

    pane.innerHTML =
      '<div class="p51-wrap space-y-4">' +
        '<div class="p51-card flex flex-wrap items-center justify-between gap-3">' +
          '<div>' +
            '<h2 class="font-bold text-base sm:text-lg text-ink dark:text-white flex items-center gap-2">' +
              '<i class="fa-solid fa-table-columns" style="color:var(--r-acc,#ff9d6c)"></i>' +
              '<span>لوحة كانبان ومتابعة الشغل</span>' +
            '</h2>' +
            '<p class="text-xs mt-0.5" style="color:var(--r-mute)">اسحب الكارت بين الأعمدة لتحديث الحالة فوراً (يعمل على الكمبيوتر والموبايل بدون مكتبات)</p>' +
          '</div>' +
          '<div class="flex flex-wrap items-center gap-2">' +
            '<button type="button" onclick="p51OpenDeliveryCalculatorModal()" class="p51-btn"><i class="fa-solid fa-calendar-check" style="color:var(--r-acc)"></i><span>حاسبة موعد التسليم</span></button>' +
            '<button type="button" onclick="p51OpenShiftHandoverModal()" class="p51-btn"><i class="fa-solid fa-clipboard-user" style="color:var(--r-ok)"></i><span>ملاحظات تسليم الوردية</span></button>' +
          '</div>' +
        '</div>' +

        '<div class="p51-toolbar">' +
          '<div class="flex flex-wrap items-center gap-2 flex-1">' +
            '<input id="p51-kb-q" type="text" value="' + eh(state.kanbanSearch) + '" placeholder="ابحث بالعميل أو رقم المعاملة أو الموبايل..." class="field !w-64 max-w-full !py-1.5 text-xs" oninput="p51OnKanbanFilterChange()">' +
            '<select id="p51-kb-emp" class="field !w-auto !py-1.5 text-xs" onchange="p51OnKanbanFilterChange()">' +
              '<option value="all">كل الموظفين</option>' +
              emps.map(function (e) { return '<option value="' + eh(e) + '"' + (state.kanbanEmp === e ? ' selected' : '') + '>' + eh(e) + '</option>'; }).join('') +
            '</select>' +
            '<select id="p51-kb-exec" class="field !w-auto !py-1.5 text-xs" onchange="p51OnKanbanFilterChange()">' +
              '<option value="all">كل المنفذين</option>' +
              execs.map(function (ex) { return '<option value="' + eh(ex) + '"' + (state.kanbanExec === ex ? ' selected' : '') + '>' + eh(ex) + '</option>'; }).join('') +
            '</select>' +
            '<button type="button" onclick="p51ToggleStuckFilter()" class="p51-btn ' + (state.stuckOnly ? 'p51-btn-active' : '') + '">' +
              '<i class="fa-solid fa-hourglass-end"></i><span>الواقفة فقط (' + stuckList.length + ')</span>' +
            '</button>' +
          '</div>' +
          '<div class="text-xs font-bold" style="color:var(--r-mute)">إجمالي المعروض: ' + orders.length + ' معاملة</div>' +
        '</div>' +

        '<div id="p51-standalone-kb-board">' + buildKanbanColumnsHtml(orders) + '</div>' +
      '</div>';

    var board = $('p51-standalone-kb-board');
    if (board) bindKanbanDragDrop(board);
    syncBulkBar();
  }

  window.p51OnKanbanFilterChange = function () {
    state.kanbanSearch = ($('p51-kb-q') && $('p51-kb-q').value) || '';
    state.kanbanEmp = ($('p51-kb-emp') && $('p51-kb-emp').value) || 'all';
    state.kanbanExec = ($('p51-kb-exec') && $('p51-kb-exec').value) || 'all';
    var board = $('p51-standalone-kb-board');
    if (board) {
      board.innerHTML = buildKanbanColumnsHtml(getKanbanFilteredOrders(true));
    }
  };

  function placeKanbanNavBtn(btn) {
    var menu = $('nav-menu');
    if (!menu) return;
    var dailyBody = menu.querySelector(':scope > section[data-mg="daily"] .mg-body');
    if (dailyBody) {
      btn.dataset.mgi = '4';
      if (btn.parentElement !== dailyBody) dailyBody.appendChild(btn);
      return;
    }
    var txBtn = menu.querySelector('[data-tab-target="tx"]');
    if (txBtn) txBtn.insertAdjacentElement('afterend', btn);
    else menu.insertBefore(btn, menu.firstChild);
  }

  function removeKanbanTab() {
    var b = $('tab-kanban-btn'), p = $('tab-kanban');
    if (b) b.remove();
    if (p) p.remove();
  }

  function ensureKanbanTab() {
    if (isPartner()) { removeKanbanTab(); return false; }
    if (!$('tab-kanban')) {
      var main = document.querySelector('main');
      if (!main) return false;
      var pane = document.createElement('div');
      pane.id = 'tab-kanban';
      pane.className = 'hidden space-y-4';
      var host = $('tab-tx') || main.lastElementChild;
      if (host) host.insertAdjacentElement('afterend', pane);
      else main.appendChild(pane);
    }
    if (!$('tab-kanban-btn') && $('nav-menu')) {
      var b = document.createElement('button');
      b.id = 'tab-kanban-btn';
      b.type = 'button';
      b.setAttribute('data-tab-target', 'kanban');
      b.className = BTN_OFF;
      b.setAttribute('onclick', "switchTab('kanban')");
      b.innerHTML = '<i class="fa-solid fa-table-columns text-amber-500"></i><span>كانبان والوردية</span>';
      placeKanbanNavBtn(b);
    }
    return true;
  }

  /* إضافة زر التثبيت والسجل الزمني في نافذة تفاصيل المعاملة (#tx-modal) */
  wrap('openTxModal', function (orig) {
    return function (tx) {
      var res = orig.apply(this, arguments);
      try {
        var act = $('tx-modal-actions-left');
        if (act && tx) {
          var pinned = isTxPinned(tx);
          if (!act.querySelector('[data-p51-modal-pin]')) {
            act.insertAdjacentHTML('beforeend',
              '<button type="button" data-p51-modal-pin="1" data-tx="' + eh(tx) + '" onclick="p51TogglePinTx(this.dataset.tx, event);openTxModal(this.dataset.tx)" class="px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 ' + (pinned ? 'bg-amber-500 text-slate-950' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200') + '">' +
                '<i class="fa-solid fa-thumbtack"></i><span>' + (pinned ? 'مثبتة 📌' : 'تثبيت') + '</span>' +
              '</button>' +
              '<button type="button" data-tx="' + eh(tx) + '" onclick="p51OpenTimelineModal(this.dataset.tx)" class="px-3 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5">' +
                '<i class="fa-solid fa-timeline text-amber-500"></i><span>السجل الزمني</span>' +
              '</button>');
          }
        }
      } catch (e) { /* */ }
      return res;
    };
  });

  wrap('renderRecentRequests', function (orig) {
    return function () {
      var res = orig.apply(this, arguments);
      try { decorateRecentRowsAndCards(); } catch (e) { console.warn('p51 decorate', e); }
      return res;
    };
  });

  wrap('switchTab', function (orig) {
    return function (id) {
      var res = orig.apply(this, arguments);
      try {
        ensureKanbanTab();
        var on = id === 'kanban' && !isPartner();
        var pane = $('tab-kanban'), btn = $('tab-kanban-btn');
        if (pane) pane.classList.toggle('hidden', !on);
        if (btn) btn.className = on ? BTN_ON : BTN_OFF;
        if (on) {
          var sec = btn && btn.closest('.mg');
          if (sec && !sec.classList.contains('open')) sec.classList.add('open');
          renderStandaloneKanbanTab();
        }
        if (id === 'tx') {
          ensureTxPhase4Toolbar();
        }
      } catch (e) { /* */ }
      return res;
    };
  });

  wrap('loadInitialData', function (orig) {
    return async function () {
      var r = await orig.apply(this, arguments);
      try {
        ensureKanbanTab();
        ensureTxPhase4Toolbar();
        syncPinsFromLines();
      } catch (e) { /* */ }
      return r;
    };
  });

  wrap('handleLogout', function (orig) {
    return function () {
      try {
        state.selectedTxs.clear();
        state.shiftNotes = [];
        syncBulkBar();
        removeKanbanTab();
      } catch (e) { /* */ }
      return orig.apply(this, arguments);
    };
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      try { ensureKanbanTab(); ensureTxPhase4Toolbar(); } catch (e) { /* */ }
    });
  } else {
    try { ensureKanbanTab(); ensureTxPhase4Toolbar(); } catch (e) { /* */ }
  }
})();
