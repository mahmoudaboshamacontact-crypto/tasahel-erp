/* =====================================================================
   js/74-abbasiya-hub-radar.js — تابة «الرادار والعمليات» الموحّدة (v7)
   - متوافقة 100% مع الثيم الدافئ الأصلي للسيستم (--r-bg, --r-card, --r-line) في الوضعين الليلي والنهاري.
   - بدون إيموجي مبالغ فيها، وبتثبيت مباشر لرادار المناديب المباشر من أول ضغطة بدون اختفاء.
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
    subView: 'abbasiya', // 'abbasiya' | 'live_radar' | 'pickup'
    passFilter: 'due',   // 'due' | 'complete' | 'all' | 'old'
    day: '',             // يوم استلام محدد (YYYY-MM-DD) — بيتخطى باقي فلاتر الحالة
    q: '',               // بحث باسم العميل/التليفون/رقم المعاملة
    snap: null,
    selectedIds: {},
    selectedCourierId: null,
    winStart: '',
    winEnd: '',
    busy: false,
    loadedAt: 0,
    courierHub: null,
    courierLoadedAt: 0,
    internalSwitch: false
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
      '#tab-couriers > #cop-manager-panel{display:none!important}',
      '#nav-menu #tab-pickup-btn{display:none!important}',
      '.ah-wrap{display:flex;flex-direction:column;gap:14px}',
      /* شريط التنقل العلوي بنفس روح رادار المكتب الدافئة */
      '.ah-nav-bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;background:var(--r-card,#ffffff);border:1px solid var(--r-line,rgba(40,25,10,.1));border-radius:20px;padding:14px 18px}',
      'html.dark .ah-nav-bar{background:#181412;border-color:rgba(255,255,255,.08)}',
      '.ah-nav-tabs{display:flex;flex-wrap:wrap;gap:8px}',
      '.ah-nav-pill{border:1px solid var(--r-line,rgba(40,25,10,.12));background:var(--r-card-2,#f4ede5);color:var(--r-text,#231B15);border-radius:12px;padding:8px 14px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:7px;transition:background-color .15s,border-color .15s,color .15s}',
      'html.dark .ah-nav-pill{background:#221c18;color:#e7dfd8;border-color:rgba(255,255,255,.08)}',
      '.ah-nav-pill:hover{border-color:var(--r-acc,#e8590c)}',
      '.ah-nav-pill.active{background:var(--r-acc,#e8590c);color:#ffffff;border-color:var(--r-acc,#e8590c)}',
      'html.dark .ah-nav-pill.active{background:#ff7a3d;color:#1a0d05;border-color:#ff7a3d}',
      /* الكروت الرئيسية والداخلية بنفس ستايل رادار المكتب #181412 و #221c18 */
      '.ah-card{background:var(--r-card,#ffffff);border:1px solid var(--r-line,rgba(40,25,10,.1));border-radius:22px;padding:18px 20px;color:var(--r-text,#231B15)}',
      'html.dark .ah-card{background:#181412;border-color:rgba(255,255,255,.08);color:#f4eee8}',
      '.ah-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px}',
      '.ah-title{font-size:16px;font-weight:700;margin:0;display:flex;align-items:center;gap:8px}',
      '.ah-sub{font-size:12px;color:var(--r-mute,#7b6f64);margin-top:2px}',
      'html.dark .ah-sub{color:#a89c91}',
      '.ah-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:14px}',
      '.ah-box{background:var(--r-card-2,#f7f2ec);border:1px solid var(--r-line,rgba(40,25,10,.09));border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:9px}',
      'html.dark .ah-box{background:#211b17;border-color:rgba(255,255,255,.07)}',
      '.ah-filter-bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px;padding-bottom:8px;border-bottom:1px solid var(--r-line,rgba(40,25,10,.08))}',
      'html.dark .ah-filter-bar{border-bottom-color:rgba(255,255,255,.07)}',
      '.ah-chip{border:1px solid var(--r-line,rgba(40,25,10,.12));background:var(--r-card,#ffffff);color:var(--r-text,#231B15);border-radius:999px;padding:4px 11px;font-size:11.5px;font-weight:700;cursor:pointer;font-family:inherit}',
      'html.dark .ah-chip{background:#181412;color:#e7dfd8;border-color:rgba(255,255,255,.09)}',
      '.ah-chip.active{background:rgba(200,162,82,.14);color:var(--r-acc,#e8590c);border-color:var(--r-acc,#e8590c)}',
      'html.dark .ah-chip.active{background:rgba(255,122,61,.16);color:#ff9d6c;border-color:#ff7a3d}',
      '.ah-row{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;border-radius:12px;background:var(--r-card,#ffffff);border:1px solid var(--r-line,rgba(40,25,10,.08))}',
      'html.dark .ah-row{background:#181412;border-color:rgba(255,255,255,.06)}',
      '.ah-chk-lbl{display:flex;align-items:flex-start;gap:9px;cursor:pointer;flex:1;min-width:200px}',
      '.ah-badge{display:inline-flex;align-items:center;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:700}',
      '.ah-badge-org{background:rgba(200,162,82,.13);color:#036b29}',
      'html.dark .ah-badge-org{background:rgba(255,122,61,.16);color:#ff9d6c}',
      '.ah-badge-ok{background:rgba(16,185,129,.14);color:#059669}',
      'html.dark .ah-badge-ok{background:rgba(63,216,192,.14);color:#3fd8c0}',
      '.ah-badge-pur{background:rgba(139,92,246,.16);color:#8b5cf6}',
      '.ah-badge-warn{background:rgba(245,158,11,.15);color:#d97706}',
      'html.dark .ah-badge-warn{background:rgba(255,194,75,.14);color:#ffc24b}',
      '.ah-badge-mut{background:rgba(148,163,184,.14);color:#64748b}',
      'html.dark .ah-badge-mut{color:#a89c91}',
      '.ah-input{border:1px solid var(--r-line,rgba(40,25,10,.14));background:var(--r-card,#ffffff);color:var(--r-text,#231B15);border-radius:10px;padding:7px 11px;font-size:12.5px;font-family:inherit;outline:none}',
      'html.dark .ah-input{background:#151210;color:#f4eee8;border-color:rgba(255,255,255,.1)}',
      '.ah-btn{border:1px solid transparent;border-radius:11px;padding:8px 14px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:6px}',
      '.ah-btn-pri{background:var(--r-acc,#036b29);color:#ffffff}',
      'html.dark .ah-btn-pri{background:#ff7a3d;color:#1a0d05}',
      '.ah-btn-ok{background:#0d9488;color:#ffffff}',
      '.ah-btn-sec{background:var(--r-card,#ffffff);border-color:var(--r-line,rgba(40,25,10,.12));color:var(--r-text,#231B15)}',
      'html.dark .ah-btn-sec{background:#272019;border-color:rgba(255,255,255,.09);color:#f4eee8}',
      '.ah-btn:disabled{opacity:.5;cursor:not-allowed}',
      '.ah-eta-card{background:var(--r-card,#ffffff);border:1px solid var(--r-line,rgba(40,25,10,.1));border-radius:12px;padding:10px 12px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:8px}',
      'html.dark .ah-eta-card{background:#181412;border-color:rgba(255,255,255,.07)}',
      '.ah-eta-card.active{border-color:var(--r-acc,#036b29);background:rgba(200,162,82,.08)}',
      'html.dark .ah-eta-card.active{border-color:#ff7a3d;background:rgba(255,122,61,.12)}',
      '.ah-courier-hub{margin:10px 12px 0;padding:13px;border-radius:16px;border:1px solid rgba(3,107,41,.32);background:rgba(3,107,41,.08);color:var(--tx,#111C15);font-size:12.5px}',
      /* موبايل: الأعمدة ما تتمددش بمحتواها (minmax(0,1fr)) عشان الكروت ما تتقطعش من الشمال */
      '@media (max-width:860px){.ah-grid{grid-template-columns:minmax(0,1fr)}.ah-grid>*,.rp3-grid2>*{min-width:0;max-width:100%}.ah-card,.ah-box{min-width:0;max-width:100%;box-sizing:border-box}}',
      '@media (max-width:600px){.ah-card{padding:14px 12px;border-radius:18px}.ah-box{padding:12px 10px}.ah-input{min-width:0;max-width:100%;box-sizing:border-box}.ah-chk-lbl{min-width:0}.ah-row{padding:9px 10px}.ah-card :where(div,span,label,section,details,summary,p,b){min-width:0}.ah-card :where(select,input,textarea,button){max-width:100%;box-sizing:border-box}.ah-card table{display:block;max-width:100%;overflow-x:auto}.ah-card{overflow-wrap:anywhere}.ah-head{gap:8px}.ah-filter-bar{overflow-x:auto;flex-wrap:nowrap;-webkit-overflow-scrolling:touch}.ah-chip{white-space:nowrap;flex:0 0 auto}}'
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
      return '<span class="ah-badge ah-badge-ok">مكتمل — جاهز للتسليم</span>';
    }
    if (l.under_review || l.status === 'Under Review') {
      return '<span class="ah-badge ah-badge-pur">تحت المراجعة</span>';
    }
    if (l.is_due) {
      return '<span class="ah-badge ah-badge-warn">قيد التنفيذ (مستحق اليوم)</span>';
    }
    return '<span class="ah-badge ah-badge-mut">قيد التنفيذ</span>';
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
      btn.dataset.mgi = '11';
      if (btn.parentElement !== dailyBody) dailyBody.appendChild(btn);
      return;
    }
    var anchor = $('tab-couriers-btn') || $('tab-tx-btn');
    if (anchor && anchor.parentElement && btn.parentElement !== anchor.parentElement) {
      anchor.insertAdjacentElement('afterend', btn);
    } else if (!btn.parentElement) {
      menu.appendChild(btn);
    }
  }

  function ensureRadarTabDom() {
    if (isCourier() || !isAllowedStaff()) return false;
    ensureCss();
    var pane = $('tab-radar');
    if (!pane) {
      var main = document.querySelector('main');
      if (!main) return false;
      pane = document.createElement('div');
      pane.id = 'tab-radar';
      pane.className = 'hidden space-y-4';
      pane.innerHTML =
        '<div class="ah-wrap">' +
          '<div class="ah-nav-bar">' +
            '<div>' +
              '<b style="font-size:15px">مركز العمليات والرادار</b>' +
              '<div class="ah-sub">متابعة تسليمات العباسية، رادار المناديب المباشر، تيكتات الاستلام، وعمليات اليوم.</div>' +
            '</div>' +
            '<div class="ah-nav-tabs" id="ah-nav-tabs">' +
              '<button type="button" class="ah-nav-pill active" data-ah-nav="abbasiya"><i class="fa-solid fa-passport"></i><span>رادار جوازات العباسية</span></button>' +
              '<button type="button" class="ah-nav-pill" data-ah-nav="live_radar"><i class="fa-solid fa-satellite-dish"></i><span>رادار المناديب المباشر</span></button>' +
              '<button type="button" class="ah-nav-pill" data-ah-nav="pickup"><i class="fa-solid fa-ticket"></i><span>تيكتات الاستلام</span></button>' +
            '</div>' +
          '</div>' +
          '<div id="ah-pane-abbasiya"></div>' +
          '<div id="ah-pane-live-radar" class="hidden"></div>' +
          '<div id="ah-pane-pickup" class="hidden"></div>' +
        '</div>';
      var host = $('tab-couriers') || $('tab-tx') || main.lastElementChild;
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
      b.innerHTML = '<i class="fa-solid fa-satellite-dish text-orange-500"></i><span>العمليات</span>';
    }
    if (b) placeMenuBtn(b);
    return true;
  }

  function updateNavPillsAndPanes() {
    ensureRadarTabDom();
    var pills = document.querySelectorAll('#ah-nav-tabs [data-ah-nav]');
    pills.forEach(function (p) {
      p.classList.toggle('active', p.dataset.ahNav === st.subView);
    });
    var rp3Btn = $('rp3-nav-btn');
    var rp3Pane = $('ah-pane-ops3');
    if (st.subView !== 'ops3') {
      if (rp3Btn) rp3Btn.classList.remove('active');
      if (rp3Pane) rp3Pane.classList.add('hidden');
    }
    var pAbb = $('ah-pane-abbasiya'), pLive = $('ah-pane-live-radar'), pPick = $('ah-pane-pickup');
    if (pAbb) pAbb.classList.toggle('hidden', st.subView !== 'abbasiya');
    if (pLive) pLive.classList.toggle('hidden', st.subView !== 'live_radar');
    if (pPick) pPick.classList.toggle('hidden', st.subView !== 'pickup');
  }

  function activateLiveRadarSubView() {
    var slot = $('ah-pane-live-radar');
    if (!slot) return;
    /* الطريقة المباشرة: js/71 بيبني اللوحة ويركبها هنا من غير تبديل تابات */
    if (typeof window.__copMountRadarInto === 'function') {
      var ok = false;
      try { ok = window.__copMountRadarInto(slot, false); } catch (e) { ok = false; }
      if (ok) return;
    }
    slot.innerHTML = '<section class="ah-card"><div class="ah-sub">رادار المناديب المباشر غير متاح حاليًا. حدّث الصفحة (Ctrl+F5) ولو المشكلة فضلت تأكد إن ملف js/71-courier-operations.js اتحمّل.</div></section>';
  }

  function activatePickupSubView() {
    var slot = $('ah-pane-pickup');
    if (!slot) return;
    var radarTab = $('tab-radar');
    if (typeof window.switchTab === 'function') {
      st.internalSwitch = true;
      try {
        window.switchTab('pickup');
      } finally {
        if (radarTab) radarTab.classList.remove('hidden');
        var rBtn = $('tab-radar-btn');
        if (rBtn) rBtn.className = BTN_ON;
        st.internalSwitch = false;
      }
    }
    var pickPane = $('tab-pickup');
    if (pickPane) {
      if (pickPane.parentElement !== slot) slot.appendChild(pickPane);
      pickPane.classList.remove('hidden');
    }
  }

  /* القديمة: استلامها من أكتر من 30 يوم — بتفضل موجودة في فلتر لوحدها ومش بتزحم الباقي */
  var OLD_DAYS = 30;
  function recvDay(l) {
    var d = new Date(l.received_date || l.received_at);
    return isNaN(d) ? '' : d.toLocaleDateString('en-CA');
  }
  function isOldLine(l) {
    var d = new Date(l.received_date || l.received_at);
    return !isNaN(d) && (Date.now() - d.getTime()) > OLD_DAYS * 86400000;
  }
  function normQ(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
  function matchQ(l) {
    var q = normQ(st.q);
    if (!q) return true;
    return normQ(l.client_name).indexOf(q) !== -1 || normQ(l.phone).indexOf(q) !== -1 || normQ(l.transaction_id).indexOf(q) !== -1;
  }
  function filterCandidates(cands) {
    var out;
    if (st.day) out = cands.filter(function (l) { return recvDay(l) === st.day; });
    else if (st.passFilter === 'old') out = cands.filter(isOldLine);
    else {
      out = cands.filter(function (l) { return !isOldLine(l); });
      if (st.passFilter === 'complete') out = out.filter(function (l) { return l.complete || l.status === 'Complete'; });
      else if (st.passFilter === 'due') out = out.filter(function (l) { return l.is_due || l.complete || l.status === 'Complete'; });
    }
    return out.filter(matchQ);
  }

  function renderAbbasiyaPane() {
    if (!isAllowedStaff()) return;
    ensureRadarTabDom();
    var target = $('ah-pane-abbasiya');
    if (!target) return;

    if (!st.snap) {
      target.innerHTML = '<section class="ah-card"><div class="ah-sub">جاري تحميل بيانات رادار جوازات العباسية…</div></section>';
      return;
    }

    var allCands = Array.isArray(st.snap.candidates) ? st.snap.candidates : [];
    var recentCands = allCands.filter(function (l) { return !isOldLine(l); });
    var oldCount = allCands.length - recentCands.length;
    var dueCount = recentCands.filter(function (l) { return l.is_due || l.complete || l.status === 'Complete'; }).length;
    var compCount = recentCands.filter(function (l) { return l.complete || l.status === 'Complete'; }).length;
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
          '<button type="button" class="ah-chip' + (!st.day && st.passFilter === 'due' ? ' active' : '') + '" data-ah-flt="due">المستحق اليوم (' + dueCount + ')</button>' +
          '<button type="button" class="ah-chip' + (!st.day && st.passFilter === 'complete' ? ' active' : '') + '" data-ah-flt="complete">مكتمل وجاهز (' + compCount + ')</button>' +
          '<button type="button" class="ah-chip' + (!st.day && st.passFilter === 'all' ? ' active' : '') + '" data-ah-flt="all">كل المفتوح (' + recentCands.length + ')</button>' +
          '<button type="button" class="ah-chip' + (!st.day && st.passFilter === 'old' ? ' active' : '') + '" data-ah-flt="old" title="استلام من أكتر من ' + OLD_DAYS + ' يوم">قديمة (' + oldCount + ')</button>' +
        '</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:6px;width:100%;margin-top:6px">' +
          '<input id="ah-q" class="ah-input" style="flex:1;min-width:150px" placeholder="بحث باسم العميل / التليفون / رقم المعاملة" value="' + eh(st.q) + '">' +
          '<input id="ah-day" type="date" class="ah-input" style="min-width:150px" title="يوم الاستلام" value="' + eh(st.day) + '">' +
          (st.day || st.q ? '<button type="button" class="ah-chip" data-ah-flt-clear="1">مسح البحث واليوم</button>' : '') +
        '</div>' +
        '<div style="display:flex;gap:6px">' +
          '<button type="button" class="ah-chip" data-ah-sel="all">تحديد الكل</button>' +
          '<button type="button" class="ah-chip" data-ah-sel="none">إلغاء</button>' +
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
                  ' · استلام: <b>' + eh(fmtDateAr(l.received_date || l.received_at)) + '</b>' +
                  (l.due_date ? ' · استحقاق: ' + eh(fmtDateAr(l.due_date)) : '') +
                  (l.executor ? ' · ' + eh(l.executor) : '') +
                  (l.phone ? ' · <span dir="ltr">' + eh(l.phone) + '</span>' : '') +
                '</div>' +
              '</div>' +
            '</label>' +
          '</div>';
        }).join('')
      : '<div class="ah-sub" style="padding:12px 0">لا توجد جوازات مطابقة لهذا الفلتر حالياً.</div>';

    var couriersHtml = couriers.length
      ? couriers.map(function (c, idx) {
          var act = Number(st.selectedCourierId) === Number(c.courier_id);
          return '<div class="ah-eta-card' + (act ? ' active' : '') + '" data-ah-courier="' + Number(c.courier_id) + '">' +
            '<div>' +
              '<div><b>' + eh(c.name) + '</b> ' + (idx === 0 ? '<span class="ah-badge ah-badge-ok">الأقرب</span>' : '') + '</div>' +
              '<div class="ah-sub">استلام: ' + Number(c.active_pickups || 0) + ' · تسليم: ' + Number(c.pending_deliveries || 0) + '</div>' +
            '</div>' +
            '<div style="text-align:left"><span class="ah-badge ah-badge-org">' + eh(c.eta.winStart) + ' – ' + eh(c.eta.winEnd) + '</span></div>' +
          '</div>';
        }).join('')
      : '<div class="ah-sub">لا يوجد مناديب مفعّلين حالياً.</div>';

    var callItemsHtml = batch && batchItems.length
      ? '<div class="ah-box" style="margin-top:12px">' +
          '<div class="ah-head" style="margin-bottom:4px">' +
            '<div><b>تأكيد مكالمات عملاء العباسية (' + batchItems.length + ')</b> — المندوب: <b>' + eh(batch.courier_name) + '</b> (' + eh(batch.window_start) + ' – ' + eh(batch.window_end) + ')</div>' +
            '<button type="button" class="ah-btn ah-btn-sec" data-ah-act="copymsg"><i class="fa-regular fa-copy"></i><span>نسخ رسالة الواتساب</span></button>' +
          '</div>' +
          batchItems.map(function (it) {
            return '<div class="ah-row">' +
              '<div>' +
                '<div><b>' + eh(it.client_name) + '</b> · <span dir="ltr">' + eh(it.phone || '—') + '</span> · <span class="ah-badge ' + (it.call_confirmed ? 'ah-badge-ok' : 'ah-badge-warn') + '">' + (it.call_confirmed ? 'تم تأكيد الميعاد' : 'بانتظار المكالمة') + '</span></div>' +
                '<div class="ah-sub">' + eh(it.service_name) + ' · <span dir="ltr">' + eh(it.transaction_id) + '</span>' + (it.call_note ? ' · ' + eh(it.call_note) : '') + '</div>' +
              '</div>' +
              '<button type="button" class="ah-btn ' + (it.call_confirmed ? 'ah-btn-sec' : 'ah-btn-ok') + '" data-ah-call="' + Number(it.id) + '" data-next="' + (it.call_confirmed ? '0' : '1') + '">' + (it.call_confirmed ? 'إلغاء التأكيد' : 'تأكيد المكالمة') + '</button>' +
            '</div>';
          }).join('') +
        '</div>'
      : '';

    target.innerHTML =
      '<section class="ah-card">' +
        '<div class="ah-head">' +
          '<div>' +
            '<h3 class="ah-title">رادار جوازات العباسية <span class="ah-badge ah-badge-ok">' + dueCount + ' مستحق اليوم</span> <span class="ah-badge ah-badge-mut">إجمالي المفتوح: ' + allCands.length + '</span></h3>' +
            '<div class="ah-sub">فرز الجوازات حسب تاريخ الاستلام وترشيح المندوب الأقرب لمحطة العباسية.</div>' +
          '</div>' +
          '<button type="button" class="ah-btn ah-btn-sec" id="ah-refresh-btn"><i class="fa-solid fa-rotate-right"></i><span>تحديث</span></button>' +
        '</div>' +
        '<div class="ah-grid">' +
          '<div class="ah-box">' +
            '<b>فرز الجوازات المفتوحة</b>' +
            filterBarHtml +
            candsHtml +
          '</div>' +
          '<div class="ah-box">' +
            '<b>ترشيح المندوب وميعاد التسليم</b>' +
            couriersHtml +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px">' +
              '<input id="ah-win-start" class="ah-input" placeholder="من الساعة (مثال: 5:20 م)" value="' + eh(st.winStart) + '">' +
              '<input id="ah-win-end" class="ah-input" placeholder="إلى الساعة (مثال: 5:50 م)" value="' + eh(st.winEnd) + '">' +
            '</div>' +
            (isManager()
              ? '<button type="button" id="ah-approve-btn" class="ah-btn ah-btn-pri" style="width:100%;justify-content:center">اعتماد المندوب وإرسال الميعاد</button>'
              : '<div class="ah-sub">اعتماد الميعاد متاح للمدير فقط.</div>') +
          '</div>' +
        '</div>' +
        callItemsHtml +
      '</section>';
  }

  function renderRadarTab() {
    if (!isAllowedStaff()) return;
    ensureRadarTabDom();
    updateNavPillsAndPanes();
    if (st.subView === 'live_radar') {
      activateLiveRadarSubView();
    } else if (st.subView === 'pickup') {
      activatePickupSubView();
    } else if (st.subView === 'abbasiya') {
      renderAbbasiyaPane();
    }
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
      var body = $('cp-body');
      var activeNav = document.querySelector('#cp-nav button.on');
      var activeTab = activeNav ? (activeNav.getAttribute('data-tab') || '') : '';
      var showHub = !activeTab || activeTab === 'today' || activeTab === 'trips' || activeTab === 'home' || activeTab === 'account';
      if (!body || !showHub) { if (box) box.remove(); return; }
      if (!box) {
        box = document.createElement('section');
        box.id = 'ah74-courier-hub';
        box.className = 'ah-courier-hub';
        box.style.margin = '0 0 12px 0';
        var host = $('pt73-courier-tickets') || $('cp4-toolkit-bar');
        if (host && host.parentElement === body) {
          if (host.nextSibling) body.insertBefore(box, host.nextSibling);
          else body.appendChild(box);
        } else {
          body.insertBefore(box, body.firstChild);
        }
      }
      var h = st.courierHub;
      box.innerHTML =
        '<div style="font-weight:700;margin-bottom:6px">محطة تسليم مجمّعة: ' + eh(h.hub_name) + ' (' + eh(h.window_start) + ' – ' + eh(h.window_end) + ') · ' + h.items.length + ' عملاء</div>' +
        h.items.map(function (it) {
          var badge = it.call_confirmed
            ? '<span style="background:rgba(16,185,129,.22);color:#34d399;padding:2px 7px;border-radius:999px;font-size:11px;font-weight:700">مؤكد مع العميل</span>'
            : '<span style="background:rgba(245,158,11,.22);color:#fbbf24;padding:2px 7px;border-radius:999px;font-size:11px;font-weight:700">جاري التأكيد</span>';
          return '<div style="padding:7px 0;border-top:1px solid rgba(255,255,255,.1)">' +
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
      st.subView = navBtn.dataset.ahNav;
      renderRadarTab();
      return;
    }

    if (t.closest && t.closest('[data-ah-flt-clear]')) {
      st.q = ''; st.day = '';
      renderAbbasiyaPane();
      return;
    }
    var fltBtn = t.closest ? t.closest('[data-ah-flt]') : null;
    if (fltBtn) {
      st.passFilter = fltBtn.dataset.ahFlt;
      st.day = '';
      renderAbbasiyaPane();
      return;
    }

    var selBtn = t.closest ? t.closest('[data-ah-sel]') : null;
    if (selBtn && st.snap && Array.isArray(st.snap.candidates)) {
      var mode = selBtn.dataset.ahSel;
      var visibleList = filterCandidates(st.snap.candidates);
      visibleList.forEach(function (l) {
        st.selectedIds[l.line_id] = (mode === 'all');
      });
      renderAbbasiyaPane();
      return;
    }

    var refBtn = t.closest ? t.closest('#ah-refresh-btn') : null;
    if (refBtn) {
      try { await loadStaffSnap(true); toast('تم تحديث الرادار'); } catch (err) { toast(err.message || 'تعذر التحديث', 'error'); }
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
      renderAbbasiyaPane();
      return;
    }
    if (t.id === 'ah-approve-btn' || (t.closest && t.closest('#ah-approve-btn'))) {
      var ab = t.id === 'ah-approve-btn' ? t : t.closest('#ah-approve-btn');
      if (!isManager()) return toast('اعتماد الميعاد للمدير فقط', 'error');
      var lineIds = Object.keys(st.selectedIds).filter(function (k) { return st.selectedIds[k]; }).map(Number);
      if (!lineIds.length) return toast('اختر جواز واحد جاهز على الأقل', 'error');
      if (!st.selectedCourierId) return toast('اختر المندوب الأول', 'error');
      var ws = ($('ah-win-start') && $('ah-win-start').value.trim()) || st.winStart;
      var we = ($('ah-win-end') && $('ah-win-end').value.trim()) || st.winEnd;
      if (!ws || !we) return toast('حدد ميعاد الوصول من وإلى', 'error');
      ab.disabled = true;
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
        toast('تم اعتماد الميعاد وإرسال محطة العباسية للمندوب');
      } finally { ab.disabled = false; }
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
        toast(nextVal ? 'تم تأكيد المكالمة' : 'تم إلغاء التأكيد');
      } finally { callBtn.disabled = false; }
      return;
    }
    var copyBtn = t.closest ? t.closest('[data-ah-act="copymsg"]') : null;
    if (copyBtn && st.snap && st.snap.batch) {
      var b = st.snap.batch;
      var msg = 'أهلاً بحضرتك من شركة تساهيل، جواز السفر جاهز للتسليم اليوم أمام جوازات العباسية في الميعاد من ' + b.window_start + ' إلى ' + b.window_end + ' مع المندوب ' + b.courier_name + '.';
      copyText(msg);
      toast('تم نسخ رسالة الواتساب');
    }
  }

  function onStaffChange(e) {
    if (e.target && e.target.classList && e.target.classList.contains('ah-cand-chk')) {
      st.selectedIds[Number(e.target.value)] = !!e.target.checked;
    }
    if (e.target && e.target.id === 'ah-day') {
      st.day = e.target.value || '';
      renderAbbasiyaPane();
    }
  }
  function onStaffInput(e) {
    if (e.target && e.target.id === 'ah-q') {
      st.q = e.target.value;
      var pos = e.target.selectionStart;
      renderAbbasiyaPane();
      var el = $('ah-q');
      if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (err) { /* */ } }
      return;
    }
    if (e.target && e.target.id === 'ah-win-start') st.winStart = e.target.value;
    if (e.target && e.target.id === 'ah-win-end') st.winEnd = e.target.value;
  }

  function wrapSwitchTab() {
    var orig = window.switchTab;
    if (typeof orig === 'function' && !orig['__ah74Wrapped']) {
      var w = function (id) {
        if (st.internalSwitch) {
          return orig.apply(this, arguments);
        }
        if (id === 'pickup' && isAllowedStaff()) {
          st.subView = 'pickup';
          id = 'radar';
        }
        if (id === 'radar' && !isAllowedStaff()) {
          toast('الصفحة دي متاحة للموظفين والإدارة فقط', 'error');
          return;
        }
        var res = orig.apply(this, [id]);
        try {
          ensureRadarTabDom();
          var on = id === 'radar' && isAllowedStaff();
          var pane = $('tab-radar'), btn = $('tab-radar-btn'), hbtn = $('tab-radar-hdr-btn');
          if (pane) pane.classList.toggle('hidden', !on);
          if (btn) btn.className = on ? BTN_ON : BTN_OFF;
          if (hbtn) hbtn.className = on ? BTN_ON : BTN_OFF;
          if (on) {
            var sec = btn && btn.closest('.mg');
            if (sec && !sec.classList.contains('open')) sec.classList.add('open');
            renderRadarTab();
            loadStaffSnap(false).catch(function (err) {
              var pAbb = $('ah-pane-abbasiya');
              if (pAbb) pAbb.innerHTML = '<section class="ah-card"><div class="ah-sub">تأكد من تشغيل النسخة الجديدة من sql/abbasiya-hub-radar.sql في Supabase. (' + eh(err && err.message) + ')</div></section>';
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
