/* =====================================================================
   js/74-abbasiya-hub-radar.js — تابة «الرادار والعمليات» المستقلة + رادار العباسية
   - معزول تماماً في IIFE بدون لمس js/03 أو js/13 أو js/14 أو js/45 أو js/70 أو js/73.
   - يضيف تابة مستقلة «الرادار والعمليات» في قسم «الشغل اليومي» (daily) وجواها تنقل سريع بين:
     (1) رادار جوازات العباسية  (2) رادار المناديب المباشر  (3) تيكتات الاستلام
   - يعرض حالة كل جواز (جاهز للتسليم / تحت المراجعة / قيد التنفيذ) وتاريخ استلامه وموعد استحقاقه،
     مع فلترة تلقائية على «اللي عليهم الدور النهارده».
   ===================================================================== */
(function () {
  'use strict';
  if (window.__abbasiyaHubRadar) return;
  window.__abbasiyaHubRadar = true;

  var $ = function (id) { return document.getElementById(id); };
  var eh = function (s) {
    if (typeof escapeHtml === 'function') return escapeHtml(s == null ? '' : String(s));
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  };
  var toast = function (msg, kind) {
    if (typeof showToast === 'function') showToast(msg, kind === 'error' ? 'error' : 'success');
    else alert(msg);
  };

  var BTN_OFF = 'tab-btn';
  var BTN_ON = 'tab-btn bg-ink text-white dark:bg-brand-600 shadow-sm';

  var st = {
    subView: 'abbasiya', // 'abbasiya' | 'live_radar'
    passFilter: 'due',   // 'due' | 'complete' | 'all'
    snap: null,
    selectedIds: {},
    selectedCourierId: null,
    winStart: '',
    winEnd: '',
    busy: false,
    loadedAt: 0,
    courierHub: null,
    courierLoadedAt: 0
  };

  function isManager() { return window.__role === 'manager'; }
  function isCourier() {
    return window.__role === 'courier' || !!(document.body && document.body.classList.contains('is-courier-mode'));
  }
  function isAllowedStaff() {
    if (window.__role === 'partner' || isCourier()) return false;
    if (document.body && document.body.classList.contains('is-partner-mode')) return false;
    var u = (typeof currentUser !== 'undefined' && currentUser) ? currentUser : window.currentUser;
    return !!u && (isManager() || window.__role === 'staff' || !window.__role);
  }

  function ensureCss() {
    if ($('ah74-style')) return;
    var s = document.createElement('style');
    s.id = 'ah74-style';
    s.textContent = [
      '.ah-wrap{display:flex;flex-direction:column;gap:14px}',
      '.ah-nav-bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;background:var(--r-card,#ffffff);border:1px solid var(--r-bd,rgba(234,88,12,.3));border-radius:18px;padding:12px 16px}',
      'html.dark .ah-nav-bar{background:var(--r-card,#111827);border-color:rgba(234,88,12,.35)}',
      '.ah-nav-tabs{display:flex;flex-wrap:wrap;gap:8px}',
      '.ah-nav-pill{border:1px solid var(--r-bd,rgba(148,163,184,.3));background:transparent;color:var(--r-tx,#0f172a);border-radius:12px;padding:9px 15px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:7px}',
      'html.dark .ah-nav-pill{color:#f8fafc;border-color:rgba(255,255,255,.14)}',
      '.ah-nav-pill.active{background:var(--r-acc,#ea580c);color:#ffffff;border-color:var(--r-acc,#ea580c)}',
      '.ah-card{background:var(--r-card,#ffffff);border:1px solid var(--r-bd,rgba(234,88,12,.32));border-radius:18px;padding:16px;color:var(--r-tx,#0f172a)}',
      'html.dark .ah-card{background:var(--r-card,#111827);border-color:rgba(234,88,12,.35);color:#f8fafc}',
      '.ah-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}',
      '.ah-title{font-size:16px;font-weight:700;margin:0;display:flex;align-items:center;gap:8px}',
      '.ah-sub{font-size:12px;color:var(--r-mute,#64748b);margin-top:2px}',
      '.ah-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:14px}',
      '.ah-box{border:1px solid var(--r-bd,rgba(148,163,184,.25));border-radius:14px;padding:12px;display:flex;flex-direction:column;gap:8px}',
      '.ah-filter-bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px;padding-bottom:6px;border-bottom:1px solid var(--r-bd,rgba(148,163,184,.18))}',
      '.ah-chip{border:1px solid var(--r-bd,rgba(148,163,184,.3));background:transparent;color:var(--r-tx,#0f172a);border-radius:999px;padding:4px 10px;font-size:11.5px;font-weight:700;cursor:pointer;font-family:inherit}',
      'html.dark .ah-chip{color:#e2e8f0}',
      '.ah-chip.active{background:rgba(234,88,12,.16);color:#ea580c;border-color:#ea580c}',
      'html.dark .ah-chip.active{color:#fb923c}',
      '.ah-row{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;padding:9px 11px;border-radius:11px;border:1px solid var(--r-bd,rgba(148,163,184,.2))}',
      '.ah-chk-lbl{display:flex;align-items:flex-start;gap:9px;cursor:pointer;flex:1;min-width:200px}',
      '.ah-badge{display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700}',
      '.ah-badge-org{background:rgba(234,88,12,.15);color:#ea580c}',
      '.ah-badge-ok{background:rgba(16,185,129,.16);color:#059669}',
      'html.dark .ah-badge-ok{color:#34d399}',
      '.ah-badge-pur{background:rgba(139,92,246,.18);color:#8b5cf6}',
      '.ah-badge-warn{background:rgba(245,158,11,.18);color:#d97706}',
      '.ah-badge-mut{background:rgba(148,163,184,.18);color:#94a3b8}',
      '.ah-input{border:1px solid var(--r-bd,rgba(148,163,184,.3));background:var(--r-bg,#f8fafc);color:var(--r-tx,#0f172a);border-radius:10px;padding:7px 10px;font-size:12.5px;font-family:inherit;outline:none}',
      'html.dark .ah-input{background:#0b0f17;color:#f8fafc;border-color:rgba(255,255,255,.15)}',
      '.ah-btn{border:0;border-radius:10px;padding:8px 13px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:6px}',
      '.ah-btn-pri{background:var(--r-acc,#ea580c);color:#ffffff}',
      '.ah-btn-ok{background:#059669;color:#ffffff}',
      '.ah-btn-sec{background:rgba(148,163,184,.16);color:var(--r-tx,#0f172a)}',
      'html.dark .ah-btn-sec{background:rgba(255,255,255,.1);color:#f8fafc}',
      '.ah-btn:disabled{opacity:.5;cursor:not-allowed}',
      '.ah-eta-card{border:1px solid var(--r-bd,rgba(148,163,184,.25));border-radius:12px;padding:9px 11px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:8px}',
      '.ah-eta-card.active{border-color:var(--r-acc,#ea580c);background:rgba(234,88,12,.1)}',
      '.ah-courier-hub{margin:10px 12px 0;padding:13px;border-radius:16px;border:1px solid rgba(16,185,129,.45);background:rgba(16,185,129,.1);color:var(--tx,#f8fafc);font-size:12.5px}',
      '@media (max-width:860px){.ah-grid{grid-template-columns:1fr}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function fmtTime24To12(totalMins) {
    var m = Math.max(0, Math.round(totalMins)) % (24 * 60);
    var hh = Math.floor(m / 60);
    var mm = m % 60;
    var ampm = hh >= 12 ? 'م' : 'ص';
    var h12 = hh % 12;
    if (h12 === 0) h12 = 12;
    return h12 + ':' + (mm < 10 ? '0' : '') + mm + ' ' + ampm;
  }

  function fmtDateAr(isoOrDate) {
    if (!isoOrDate) return '—';
    var d = new Date(isoOrDate);
    if (isNaN(d.getTime())) return String(isoOrDate).slice(0, 10);
    try {
      return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (e) {
      return String(isoOrDate).slice(0, 10);
    }
  }

  function statusBadgeHtml(l) {
    if (l.complete || l.status === 'Complete') {
      return '<span class="ah-badge ah-badge-ok">مكتمل — جاهز للتسليم ✓</span>';
    }
    if (l.under_review || l.status === 'Under Review') {
      return '<span class="ah-badge ah-badge-pur">تحت المراجعة</span>';
    }
    if (l.is_due) {
      return '<span class="ah-badge ah-badge-warn">قيد التنفيذ (مستحق اليوم)</span>';
    }
    return '<span class="ah-badge ah-badge-mut">قيد التنفيذ (لم يحن موعده)</span>';
  }

  function estimateCourierAbbasiya(c) {
    var now = new Date();
    var nowMins = now.getHours() * 60 + now.getMinutes();
    var baseMins = Math.max(nowMins, 10 * 60);
    if (c.last_event_at) {
      var ev = new Date(c.last_event_at);
      if (!isNaN(ev.getTime()) && ev.toDateString() === now.toDateString()) {
        baseMins = Math.max(nowMins, ev.getHours() * 60 + ev.getMinutes());
      }
    }
    var stops = Number(c.active_pickups || 0) + Number(c.pending_deliveries || 0);
    var routeMins = stops * 25;
    var toHubMins = 30;
    var arriveMins = baseMins + routeMins + toHubMins;
    var rounded = Math.ceil(arriveMins / 5) * 5;
    return {
      stops: stops,
      arriveMins: rounded,
      winStart: fmtTime24To12(rounded),
      winEnd: fmtTime24To12(rounded + 30),
      departed: !!c.last_event_at
    };
  }

  function copyText(txt) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(txt).catch(function () { /* ignore */ });
    }
    try {
      var ta = document.createElement('textarea');
      ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    } catch (e) { /* ignore */ }
  }

  function placeMenuBtn(btn) {
    var menu = $('nav-menu');
    if (!menu || !btn) return;
    var dailyBody = menu.querySelector(':scope > section[data-mg="daily"] .mg-body');
    if (dailyBody) {
      btn.dataset.mgi = '12';
      if (btn.parentElement !== dailyBody) dailyBody.appendChild(btn);
      return;
    }
    var anchor = $('tab-pickup-btn') || $('tab-couriers-btn') || $('tab-tx-btn');
    if (anchor && anchor.parentElement && btn.parentElement !== anchor.parentElement) {
      anchor.insertAdjacentElement('afterend', btn);
    } else if (!btn.parentElement) {
      menu.appendChild(btn);
    }
  }

  function ensureRadarTabDom() {
    if (isCourier() || !isAllowedStaff()) return false;
    ensureCss();
    if (!$('tab-radar')) {
      var main = document.querySelector('main');
      if (!main) return false;
      var pane = document.createElement('div');
      pane.id = 'tab-radar';
      pane.className = 'hidden space-y-4';
      var host = $('tab-pickup') || $('tab-couriers') || $('tab-tx') || main.lastElementChild;
      if (host) host.insertAdjacentElement('afterend', pane);
      else main.appendChild(pane);
      pane.addEventListener('click', onStaffClick);
      pane.addEventListener('change', onStaffChange);
      pane.addEventListener('input', onStaffInput);
    }
    var b = $('tab-radar-btn');
    if (!b && $('nav-menu')) {
      b = document.createElement('button');
      b.id = 'tab-radar-btn';
      b.type = 'button';
      b.setAttribute('data-tab-target', 'radar');
      b.className = BTN_OFF;
      b.setAttribute('onclick', "switchTab('radar')");
      b.innerHTML = '<i class="fa-solid fa-satellite-dish text-orange-500"></i><span>الرادار والعمليات</span>';
    }
    if (b) placeMenuBtn(b);
    return true;
  }

  /* نقل رادار المكتب الحي (#cop-manager-panel) داخل تابة الرادار عند اختيار «رادار المناديب المباشر» */
  function mountLiveOfficeRadarIntoSlot() {
    var slot = $('ah-live-radar-slot');
    if (!slot) return;
    var cop = $('cop-manager-panel');
    if (cop && cop.parentElement !== slot) {
      slot.appendChild(cop);
    }
    var refreshBtn = cop && (cop.querySelector('[data-radar-retry="1"]') || cop.querySelector('#cop-manager-refresh'));
    if (refreshBtn && !st.liveRadarTriggered) {
      st.liveRadarTriggered = true;
      try { refreshBtn.click(); } catch (e) {}
    }
  }

  function filterCandidates(cands) {
    if (st.passFilter === 'complete') {
      return cands.filter(function (l) { return l.complete || l.status === 'Complete'; });
    }
    if (st.passFilter === 'due') {
      return cands.filter(function (l) { return l.is_due || l.complete || l.status === 'Complete'; });
    }
    return cands;
  }

  function renderRadarTab() {
    if (!isAllowedStaff()) return;
    ensureRadarTabDom();
    var pane = $('tab-radar');
    if (!pane) return;

    var navHtml =
      '<div class="ah-nav-bar">' +
        '<div>' +
          '<b style="font-size:15px">مركز الرادار والعمليات الميدانية</b>' +
          '<div class="ah-sub">تنقّل بين رادار جوازات العباسية، رادار المناديب المباشر، وتيكتات الاستلام من مكان واحد.</div>' +
        '</div>' +
        '<div class="ah-nav-tabs">' +
          '<button type="button" class="ah-nav-pill' + (st.subView === 'abbasiya' ? ' active' : '') + '" data-ah-nav="abbasiya">🛂 رادار جوازات العباسية</button>' +
          '<button type="button" class="ah-nav-pill' + (st.subView === 'live_radar' ? ' active' : '') + '" data-ah-nav="live_radar">📡 رادار المناديب المباشر</button>' +
          '<button type="button" class="ah-nav-pill" data-ah-nav="pickup_tab">🎫 تيكتات الاستلام</button>' +
        '</div>' +
      '</div>';

    if (st.subView === 'live_radar') {
      pane.innerHTML = '<div class="ah-wrap">' + navHtml + '<div id="ah-live-radar-slot"></div></div>';
      mountLiveOfficeRadarIntoSlot();
      return;
    }

    if (!st.snap) {
      pane.innerHTML = '<div class="ah-wrap">' + navHtml + '<section class="ah-card"><div class="ah-sub">جاري تحميل بيانات رادار جوازات العباسية…</div></section></div>';
      return;
    }

    var allCands = Array.isArray(st.snap.candidates) ? st.snap.candidates : [];
    var dueCount = allCands.filter(function (l) { return l.is_due || l.complete || l.status === 'Complete'; }).length;
    var compCount = allCands.filter(function (l) { return l.complete || l.status === 'Complete'; }).length;
    var cands = filterCandidates(allCands);

    var couriers = (Array.isArray(st.snap.couriers) ? st.snap.couriers : []).map(function (c) {
      return Object.assign({}, c, { eta: estimateCourierAbbasiya(c) });
    }).sort(function (a, b) { return a.eta.arriveMins - b.eta.arriveMins; });

    if (!st.selectedCourierId && couriers.length) {
      var best = st.snap.batch && st.snap.batch.courier_id
        ? couriers.find(function (x) { return Number(x.courier_id) === Number(st.snap.batch.courier_id); }) || couriers[0]
        : couriers[0];
      st.selectedCourierId = best.courier_id;
      st.winStart = (st.snap.batch && st.snap.batch.window_start) || best.eta.winStart;
      st.winEnd = (st.snap.batch && st.snap.batch.window_end) || best.eta.winEnd;
    }

    var batch = st.snap.batch;
    var batchItems = Array.isArray(st.snap.items) ? st.snap.items : [];

    var filterBarHtml =
      '<div class="ah-filter-bar">' +
        '<div style="display:flex;flex-wrap:wrap;gap:6px">' +
          '<button type="button" class="ah-chip' + (st.passFilter === 'due' ? ' active' : '') + '" data-ah-flt="due">اللي عليهم الدور اليوم (' + dueCount + ')</button>' +
          '<button type="button" class="ah-chip' + (st.passFilter === 'complete' ? ' active' : '') + '" data-ah-flt="complete">مكتمل وجاهز فقط (' + compCount + ')</button>' +
          '<button type="button" class="ah-chip' + (st.passFilter === 'all' ? ' active' : '') + '" data-ah-flt="all">كل المفتوح (' + allCands.length + ')</button>' +
        '</div>' +
        '<div style="display:flex;gap:6px">' +
          '<button type="button" class="ah-chip" data-ah-sel="all">تحديد المعروض</button>' +
          '<button type="button" class="ah-chip" data-ah-sel="none">إلغاء التحديد</button>' +
        '</div>' +
      '</div>';

    var candsHtml = cands.length
      ? cands.map(function (l) {
          var checked = !!st.selectedIds[l.line_id];
          return '<div class="ah-row">' +
            '<label class="ah-chk-lbl">' +
              '<input type="checkbox" class="ah-cand-chk" value="' + Number(l.line_id) + '"' + (checked ? ' checked' : '') + '>' +
              '<div style="flex:1">' +
                '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px">' +
                  '<b>' + eh(l.client_name) + '</b>' +
                  '<span class="ah-badge ah-badge-org" dir="ltr">' + eh(l.transaction_id) + '</span>' +
                  statusBadgeHtml(l) +
                '</div>' +
                '<div class="ah-sub" style="margin-top:4px">' +
                  eh(l.service) +
                  ' · <b>تاريخ الاستلام: ' + eh(fmtDateAr(l.received_date || l.received_at)) + '</b>' +
                  (l.due_date ? ' · الاستحقاق: ' + eh(fmtDateAr(l.due_date)) : '') +
                  (l.executor ? ' · المنفذ: ' + eh(l.executor) : '') +
                  (l.phone ? ' · <span dir="ltr">' + eh(l.phone) + '</span>' : '') +
                '</div>' +
              '</div>' +
            '</label>' +
          '</div>';
        }).join('')
      : '<div class="ah-sub" style="padding:12px 0">مفيش جوازات مطابقة للفلتر ده حالياً — اضغط «كل المفتوح» لو عايز تعرض الجوازات اللي لسه قيد التنفيذ.</div>';

    var couriersHtml = couriers.length
      ? couriers.map(function (c, idx) {
          var act = Number(st.selectedCourierId) === Number(c.courier_id);
          return '<div class="ah-eta-card' + (act ? ' active' : '') + '" data-ah-courier="' + Number(c.courier_id) + '">' +
            '<div>' +
              '<div><b>' + eh(c.name) + '</b> ' + (idx === 0 ? '<span class="ah-badge ah-badge-ok">الترشيح الأنسب</span>' : '') + '</div>' +
              '<div class="ah-sub">استلام: ' + Number(c.active_pickups || 0) + ' · تسليم: ' + Number(c.pending_deliveries || 0) + ' · ' + (c.eta.departed ? 'بدأ خط السير' : 'تقديري مبدئي') + '</div>' +
            '</div>' +
            '<div style="text-align:left"><span class="ah-badge ah-badge-org">' + eh(c.eta.winStart) + ' – ' + eh(c.eta.winEnd) + '</span></div>' +
          '</div>';
        }).join('')
      : '<div class="ah-sub">لا يوجد مناديب مفعّلين ومربوطين بحساب دخول في قاعدة البيانات حالياً.</div>';

    var callItemsHtml = batch && batchItems.length
      ? '<div class="ah-box" style="margin-top:12px">' +
          '<div class="ah-head" style="margin-bottom:4px">' +
            '<div><b>تأكيد مكالمات عملاء العباسية (' + batchItems.length + ')</b> — المندوب: <b>' + eh(batch.courier_name) + '</b> (' + eh(batch.window_start) + ' – ' + eh(batch.window_end) + ')</div>' +
            '<button type="button" class="ah-btn ah-btn-sec" data-ah-act="copymsg">نسخ رسالة الواتساب</button>' +
          '</div>' +
          batchItems.map(function (it) {
            return '<div class="ah-row">' +
              '<div>' +
                '<div><b>' + eh(it.client_name) + '</b> · <span dir="ltr">' + eh(it.phone || '—') + '</span> · <span class="ah-badge ' + (it.call_confirmed ? 'ah-badge-ok' : 'ah-badge-warn') + '">' + (it.call_confirmed ? 'تم تأكيد الميعاد ✓' : 'في انتظار المكالمة') + '</span></div>' +
                '<div class="ah-sub">' + eh(it.service_name) + ' · <span dir="ltr">' + eh(it.transaction_id) + '</span>' + (it.call_note ? ' · ' + eh(it.call_note) : '') + '</div>' +
              '</div>' +
              '<button type="button" class="ah-btn ' + (it.call_confirmed ? 'ah-btn-sec' : 'ah-btn-ok') + '" data-ah-call="' + Number(it.id) + '" data-next="' + (it.call_confirmed ? '0' : '1') + '">' + (it.call_confirmed ? 'إلغاء التأكيد' : 'تمت المكالمة وتأكيد الميعاد') + '</button>' +
            '</div>';
          }).join('') +
        '</div>'
      : '';

    pane.innerHTML =
      '<div class="ah-wrap">' +
        navHtml +
        '<section class="ah-card">' +
          '<div class="ah-head">' +
            '<div>' +
              '<h3 class="ah-title">رادار تسليم جوازات العباسية الفوري <span class="ah-badge ah-badge-ok">' + dueCount + ' مستحق اليوم</span> <span class="ah-badge ah-badge-mut">إجمالي المفتوح: ' + allCands.length + '</span></h3>' +
              '<div class="ah-sub">بيعرض حالة كل جواز وتاريخ استلامه، ويرشّح فقط المناديب الفعليين المفعّلين بحساب دخول في قاعدة البيانات.</div>' +
            '</div>' +
            '<button type="button" class="ah-btn ah-btn-sec" id="ah-refresh-btn">تحديث الرادار</button>' +
          '</div>' +
          '<div class="ah-grid">' +
            '<div class="ah-box">' +
              '<b>1) فرز الجوازات حسب الحالة وتاريخ الاستلام</b>' +
              filterBarHtml +
              candsHtml +
            '</div>' +
            '<div class="ah-box">' +
              '<b>2) ترشيح المناديب المفعّلين وحسبة ميعاد العباسية</b>' +
              couriersHtml +
              '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px">' +
                '<input id="ah-win-start" class="ah-input" placeholder="من الساعة (مثال: 5:20 م)" value="' + eh(st.winStart) + '">' +
                '<input id="ah-win-end" class="ah-input" placeholder="إلى الساعة (مثال: 5:50 م)" value="' + eh(st.winEnd) + '">' +
              '</div>' +
              (isManager()
                ? '<button type="button" id="ah-approve-btn" class="ah-btn ah-btn-pri" style="width:100%;justify-content:center">اعتماد المندوب والميعاد وإرسال للمندوب</button>'
                : '<div class="ah-sub">اعتماد الميعاد وإرساله للمندوب متاح للمدير فقط.</div>') +
            '</div>' +
          '</div>' +
          callItemsHtml +
        '</section>' +
      '</div>';
  }

  async function loadStaffSnap(force) {
    if (!sbClient || !isAllowedStaff()) return;
    if (!force && st.loadedAt && (Date.now() - st.loadedAt < 8000) && st.snap) {
      renderRadarTab();
      return;
    }
    st.loadedAt = Date.now();
    renderRadarTab();
    var r = await sbClient.rpc('abbasiya_hub_snapshot');
    if (r.error) throw r.error;
    st.snap = r.data || null;
    if (st.snap && Array.isArray(st.snap.items) && st.snap.items.length) {
      st.selectedIds = {};
      st.snap.items.forEach(function (it) { st.selectedIds[it.line_id] = true; });
    } else if (st.snap && Array.isArray(st.snap.candidates)) {
      /* نعلّم افتراضياً فقط على الجوازات المكتملة (Complete) عشان المدير ما يضطرش يلغي 19 جواز بإيده */
      st.snap.candidates.forEach(function (c) {
        if (st.selectedIds[c.line_id] === undefined) {
          st.selectedIds[c.line_id] = !!(c.complete || c.status === 'Complete');
        }
      });
    }
    renderRadarTab();
  }

  async function loadAndRenderCourierHub() {
    if (!sbClient || !isCourier()) return;
    var app = $('courier-app');
    if (!app) return;
    if (st.courierLoadedAt && (Date.now() - st.courierLoadedAt < 60000)) return;
    st.courierLoadedAt = Date.now();
    try {
      ensureCss();
      var r = await sbClient.rpc('courier_my_abbasiya_hub');
      if (r.error) return;
      st.courierHub = r.data;
      var box = $('ah74-courier-hub');
      if (!st.courierHub || !Array.isArray(st.courierHub.items) || !st.courierHub.items.length) {
        if (box) box.remove();
        return;
      }
      if (!box) {
        box = document.createElement('section');
        box.id = 'ah74-courier-hub';
        box.className = 'ah-courier-hub';
        var host = $('pt73-courier-tickets') || $('cp-v12-top-banners') || app;
        host.insertAdjacentElement('afterend', box);
      }
      var h = st.courierHub;
      box.innerHTML =
        '<div style="font-weight:700;margin-bottom:6px">محطة تسليم مجمّعة: ' + eh(h.hub_name) + ' (' + eh(h.window_start) + ' – ' + eh(h.window_end) + ') · ' + h.items.length + ' عملاء</div>' +
        h.items.map(function (it) {
          var badge = it.call_confirmed
            ? '<span style="background:rgba(16,185,129,.25);color:#34d399;padding:2px 7px;border-radius:999px;font-size:11px;font-weight:700">تم تأكيد الميعاد مع العميل ✓</span>'
            : '<span style="background:rgba(245,158,11,.25);color:#fbbf24;padding:2px 7px;border-radius:999px;font-size:11px;font-weight:700">جاري تأكيد المكتب مع العميل</span>';
          return '<div style="padding:7px 0;border-top:1px solid rgba(255,255,255,.12)">' +
            '<div><b>' + eh(it.client_name) + '</b> · <span dir="ltr">' + eh(it.phone || '') + '</span> · ' + badge + '</div>' +
            '<div style="font-size:11.5px;opacity:.88;margin-top:2px">' + eh(it.service_name) + ' · <span dir="ltr">' + eh(it.transaction_id) + '</span>' + (it.call_note ? ' · ' + eh(it.call_note) : '') + '</div>' +
          '</div>';
        }).join('');
    } catch (e) { /* ignore */ }
  }

  async function onStaffClick(e) {
    var t = e.target;
    if (!t) return;

    var navBtn = t.closest ? t.closest('[data-ah-nav]') : null;
    if (navBtn) {
      var targetView = navBtn.dataset.ahNav;
      if (targetView === 'pickup_tab') {
        if (typeof window.switchTab === 'function') window.switchTab('pickup');
        return;
      }
      st.subView = targetView;
      renderRadarTab();
      return;
    }

    var fltBtn = t.closest ? t.closest('[data-ah-flt]') : null;
    if (fltBtn) {
      st.passFilter = fltBtn.dataset.ahFlt;
      renderRadarTab();
      return;
    }

    var selBtn = t.closest ? t.closest('[data-ah-sel]') : null;
    if (selBtn && st.snap && Array.isArray(st.snap.candidates)) {
      var mode = selBtn.dataset.ahSel;
      var visibleList = filterCandidates(st.snap.candidates);
      visibleList.forEach(function (l) {
        st.selectedIds[l.line_id] = (mode === 'all');
      });
      renderRadarTab();
      return;
    }

    if (t.id === 'ah-refresh-btn') {
      try { await loadStaffSnap(true); toast('تم تحديث رادار العباسية ✓'); } catch (err) { toast(err.message || 'تعذر التحديث', 'error'); }
      return;
    }
    var cCard = t.closest ? t.closest('[data-ah-courier]') : null;
    if (cCard) {
      st.selectedCourierId = Number(cCard.dataset.ahCourier);
      var cObj = (st.snap && st.snap.couriers || []).find(function (x) { return Number(x.courier_id) === st.selectedCourierId; });
      if (cObj) {
        var eta = estimateCourierAbbasiya(cObj);
        st.winStart = eta.winStart;
        st.winEnd = eta.winEnd;
      }
      renderRadarTab();
      return;
    }
    if (t.id === 'ah-approve-btn') {
      if (!isManager()) return toast('اعتماد الميعاد للمدير فقط', 'error');
      var lineIds = Object.keys(st.selectedIds).filter(function (k) { return st.selectedIds[k]; }).map(Number);
      if (!lineIds.length) return toast('اختار جواز واحد جاهز على الأقل', 'error');
      if (!st.selectedCourierId) return toast('اختار المندوب الأول', 'error');
      var ws = ($('ah-win-start') && $('ah-win-start').value.trim()) || st.winStart;
      var we = ($('ah-win-end') && $('ah-win-end').value.trim()) || st.winEnd;
      if (!ws || !we) return toast('حدد ميعاد الوصول من وإلى', 'error');
      t.disabled = true;
      try {
        var r = await sbClient.rpc('abbasiya_hub_approve', {
          p_day: (st.snap && st.snap.day) || null,
          p_courier_id: st.selectedCourierId,
          p_window_start: ws,
          p_window_end: we,
          p_line_ids: lineIds,
          p_notes: null
        });
        if (r.error) return toast(r.error.message || 'تعذر الاعتماد', 'error');
        await loadStaffSnap(true);
        toast('تم اعتماد الميعاد وإرسال محطة العباسية للمندوب ✓');
      } finally { t.disabled = false; }
      return;
    }
    var callBtn = t.closest ? t.closest('[data-ah-call]') : null;
    if (callBtn) {
      callBtn.disabled = true;
      try {
        var nextVal = callBtn.dataset.next === '1';
        var cr = await sbClient.rpc('abbasiya_hub_mark_called', {
          p_item_id: Number(callBtn.dataset.ahCall),
          p_called: nextVal,
          p_note: null
        });
        if (cr.error) return toast(cr.error.message || 'تعذر حفظ التأكيد', 'error');
        await loadStaffSnap(true);
        toast(nextVal ? 'تم تأكيد المكالمة وظهر للمندوب ✓' : 'تم إلغاء التأكيد');
      } finally { callBtn.disabled = false; }
      return;
    }
    if (t.dataset && t.dataset.ahAct === 'copymsg' && st.snap && st.snap.batch) {
      var b = st.snap.batch;
      var msg = 'أهلاً بحضرتك من شركة تساهيل، جواز السفر جاهز للتسليم اليوم أمام جوازات العباسية في الميعاد من ' + b.window_start + ' إلى ' + b.window_end + ' مع المندوب ' + b.courier_name + '.';
      copyText(msg);
      toast('تم نسخ رسالة الواتساب ✓');
    }
  }

  function onStaffChange(e) {
    if (e.target && e.target.classList && e.target.classList.contains('ah-cand-chk')) {
      st.selectedIds[Number(e.target.value)] = !!e.target.checked;
    }
  }
  function onStaffInput(e) {
    if (e.target && e.target.id === 'ah-win-start') st.winStart = e.target.value;
    if (e.target && e.target.id === 'ah-win-end') st.winEnd = e.target.value;
  }

  function wrapSwitchTab() {
    var orig = window.switchTab;
    if (typeof orig === 'function' && !orig['__ah74Wrapped']) {
      var w = function (id) {
        if (id === 'radar' && !isAllowedStaff()) {
          toast('الصفحة دي متاحة للموظفين والإدارة فقط', 'error');
          return;
        }
        var res = orig.apply(this, arguments);
        try {
          ensureRadarTabDom();
          var on = id === 'radar' && isAllowedStaff();
          var pane = $('tab-radar'), btn = $('tab-radar-btn');
          if (pane) pane.classList.toggle('hidden', !on);
          if (btn) btn.className = on ? BTN_ON : BTN_OFF;
          if (on) {
            var sec = btn && btn.closest('.mg');
            if (sec && !sec.classList.contains('open')) sec.classList.add('open');
            loadStaffSnap(false).catch(function (err) {
              renderRadarTab();
              var p = $('tab-radar');
              if (p) p.insertAdjacentHTML('beforeend', '<section class="ah-card"><div class="ah-sub">تأكد من تشغيل النسخة الجديدة من sql/abbasiya-hub-radar.sql في Supabase. (' + eh(err && err.message) + ')</div></section>');
            });
          }
        } catch (e) { /* */ }
        return res;
      };
      w['__ah74Wrapped'] = true;
      window.switchTab = w;
    }
  }

  function wrap(name, fn) {
    var orig = window[name];
    if (typeof orig === 'function' && !orig['__ah74Wrapped']) {
      var w = fn(orig);
      w['__ah74Wrapped'] = true;
      window[name] = w;
    }
  }

  ensureRadarTabDom();
  wrapSwitchTab();

  wrap('loadInitialData', function (orig) {
    return async function () {
      var r = await orig.apply(this, arguments);
      ensureRadarTabDom();
      wrapSwitchTab();
      setTimeout(function () {
        ensureRadarTabDom();
        wrapSwitchTab();
        if (isCourier()) loadAndRenderCourierHub();
      }, 250);
      return r;
    };
  });

  wrap('handleLogout', function (orig) {
    return function () {
      st.snap = null; st.courierHub = null; st.courierLoadedAt = 0; st.loadedAt = 0; st.selectedIds = {};
      var b1 = $('tab-radar-btn'), p1 = $('tab-radar'), b2 = $('ah74-courier-hub');
      if (b1) b1.remove();
      if (p1) p1.remove();
      if (b2) b2.remove();
      return orig.apply(this, arguments);
    };
  });

  setTimeout(function () {
    ensureRadarTabDom();
    wrapSwitchTab();
    if (isCourier()) loadAndRenderCourierHub();
  }, 200);
})();
