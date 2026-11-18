/* =====================================================================
   js/75-radar-phase3.js — المرحلة 3: عمليات اليوم، خطوط المناطق، سفارة الإمارات،
   Domino ETA، عداد الكاش، الإنقاذ الطارئ، المتأخرات، والنداء العام.
   - معزول تماماً في IIFE بدون لمس js/03 أو js/13 أو js/14 أو js/45 أو js/70 أو js/71 أو js/73 أو js/74.
   - يضيف تبويب رابع «🚀 عمليات اليوم والإنقاذ» داخل تابة الرادار والعمليات الموحدة.
   - يضيف قاموس الأحياء الذكي + اقتراح المندوب وتاريخ العميل + عرض تنبيهات المندوب في بوابته.
   ===================================================================== */
(function () {
  'use strict';
  if (window.__radarPhase3) return;
  window.__radarPhase3 = true;

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
  var money = function (n) { return Number(n || 0).toLocaleString('ar-EG') + ' ج.م'; };

  /* قاموس خطوط المناطق والأحياء في القاهرة والجيزة */
  var ROUTES = [
    { key: 'giza', label: 'خط الجيزة', areas: ['الجيزة', 'الدقي', 'المهندسين', 'فيصل', 'الهرم', 'العجوزة', 'امبابة', 'إمبابة', 'بولاق', 'أكتوبر', 'اكتوبر', 'الشيخ زايد', 'زايد', 'حدائق الأهرام', 'حدائق الاهرام'] },
    { key: 'nasr', label: 'خط مدينة نصر ومصر الجديدة', areas: ['مدينة نصر', 'مصر الجديدة', 'النزهة', 'شيراتون', 'العباسية', 'الوايلي', 'جسر السويس', 'عين شمس', 'شبرا', 'وسط البلد', 'رمسيس'] },
    { key: 'tagamoa', label: 'خط التجمع والقاهرة الجديدة', areas: ['التجمع', 'القاهرة الجديدة', 'الرحاب', 'مدينتي', 'الشروق', 'المستقبل', 'القطامية'] },
    { key: 'maadi', label: 'خط المعادي والمقطم', areas: ['المعادي', 'زهراء المعادي', 'المقطم', 'حلوان', 'دار السلام', 'البساتين', 'المنيل', 'السيدة زينب'] }
  ];

  var CANNED_REPLIES = [
    { title: 'المندوب في الطريق', text: 'أهلاً بحضرتك من تساهيل، المندوب في طريقه لحضرتك دلوقتي وهيرن قبل الوصول بـ 10 دقايق.' },
    { title: 'تم استلام الأصول', text: 'تم استلام أصول الأوراق بنجاح من حضرتك وجاري بدء التنفيذ، وهنبلغك أول ما تخلص.' },
    { title: 'مراجعة سفارة الإمارات', text: 'تم إيداع المستند بنجاح، وللتأكيد سفارة الإمارات تصديقها إلكتروني PDF وبعدها بـ 48–72 ساعة بنستلم الورق ونرجعهولك.' }
  ];

  var st = {
    snap: null,
    active: false,
    loadedAt: 0,
    rescueSelected: {},
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

  function normAr(s) {
    return String(s || '').toLowerCase().replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').trim();
  }

  function detectRouteFromZone(zoneText) {
    var z = normAr(zoneText);
    if (!z) return null;
    for (var i = 0; i < ROUTES.length; i++) {
      var r = ROUTES[i];
      for (var j = 0; j < r.areas.length; j++) {
        if (z.indexOf(normAr(r.areas[j])) >= 0) return r;
      }
    }
    return null;
  }

  function suggestCourierForZone(zoneText) {
    if (!st.snap || !Array.isArray(st.snap.couriers) || !st.snap.couriers.length) return null;
    var route = detectRouteFromZone(zoneText);
    var pool = st.snap.couriers;
    if (route) {
      var matched = pool.filter(function (c) {
        return Array.isArray(c.route_keys) && c.route_keys.indexOf(route.key) >= 0;
      });
      if (matched.length) pool = matched;
    }
    return pool.slice().sort(function (a, b) {
      return (Number(a.active_pickups || 0) + Number(a.pending_deliveries || 0)) -
             (Number(b.active_pickups || 0) + Number(b.pending_deliveries || 0));
    })[0];
  }

  function ensureCss() {
    if ($('rp3-style')) return;
    var s = document.createElement('style');
    s.id = 'rp3-style';
    s.textContent = [
      '.rp3-brief{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:12px}',
      '.rp3-kpi{border:1px solid var(--r-bd,rgba(148,163,184,.25));border-radius:14px;padding:10px 12px;background:var(--r-card,#fff)}',
      'html.dark .rp3-kpi{background:#0f172a;border-color:rgba(255,255,255,.1)}',
      '.rp3-kpi-num{font-size:20px;font-weight:800;color:var(--r-acc,#ea580c)}',
      '.rp3-grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}',
      '.rp3-tag-red{background:rgba(225,29,72,.16);color:#e11d48;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;display:inline-flex;align-items:center}',
      '.rp3-tag-amb{background:rgba(245,158,11,.18);color:#d97706;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;display:inline-flex;align-items:center}',
      '.rp3-tag-ok{background:rgba(16,185,129,.16);color:#059669;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;display:inline-flex;align-items:center}',
      'html.dark .rp3-tag-ok{color:#34d399}',
      '.rp3-route-chk{display:inline-flex;align-items:center;gap:5px;padding:4px 8px;border:1px solid var(--r-bd,rgba(148,163,184,.28));border-radius:9px;font-size:11.5px;cursor:pointer}',
      '.rp3-alert-box{border:1px solid rgba(225,29,72,.35);background:rgba(225,29,72,.08);border-radius:14px;padding:11px 13px;font-size:12.5px;margin-bottom:12px}',
      '.rp3-courier-bcast{margin:10px 12px 0;padding:12px;border-radius:16px;border:1px solid rgba(245,158,11,.45);background:rgba(245,158,11,.12);color:var(--tx,#f8fafc);font-size:12.5px}',
      '@media (max-width:860px){.rp3-brief{grid-template-columns:repeat(2,1fr)}.rp3-grid2{grid-template-columns:1fr}}'
    ].join('\n');
    document.head.appendChild(s);
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

  function ensureNavButtonAndPane() {
    var nav = $('ah-nav-tabs');
    var radarTab = $('tab-radar');
    if (!nav || !radarTab) return false;
    ensureCss();

    if (!$('rp3-nav-btn')) {
      var btn = document.createElement('button');
      btn.id = 'rp3-nav-btn';
      btn.type = 'button';
      btn.className = 'ah-nav-pill';
      btn.textContent = '🚀 عمليات اليوم والإنقاذ';
      btn.onclick = function () {
        st.active = true;
        nav.querySelectorAll('.ah-nav-pill').forEach(function (p) { p.classList.remove('active'); });
        btn.classList.add('active');
        ['ah-pane-abbasiya', 'ah-pane-live-radar', 'ah-pane-pickup'].forEach(function (pid) {
          var el = $(pid);
          if (el) el.classList.add('hidden');
        });
        var pane = $('ah-pane-ops3');
        if (pane) pane.classList.remove('hidden');
        loadPhase3Snap(false);
      };
      nav.appendChild(btn);

      /* لو المستخدم ضغط أي زر تاني من التلاتة نخفي لوحة المرحلة 3 */
      nav.addEventListener('click', function (ev) {
        var b = ev.target && ev.target.closest ? ev.target.closest('[data-ah-nav]') : null;
        if (b) {
          st.active = false;
          btn.classList.remove('active');
          var pane = $('ah-pane-ops3');
          if (pane) pane.classList.add('hidden');
        }
      });
    }

    if (!$('ah-pane-ops3')) {
      var wrap = radarTab.querySelector('.ah-wrap') || radarTab;
      var pane3 = document.createElement('div');
      pane3.id = 'ah-pane-ops3';
      pane3.className = 'hidden';
      pane3.addEventListener('click', onPaneClick);
      pane3.addEventListener('change', onPaneChange);
      wrap.appendChild(pane3);
    }
    return true;
  }

  function fmtAgo(iso) {
    if (!iso) return 'لم يتحرك بعد';
    var mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (isNaN(mins) || mins < 1) return 'الآن';
    if (mins < 60) return 'منذ ' + mins + ' دقيقة';
    return 'منذ ' + Math.round(mins / 60) + ' ساعة';
  }

  function isStaleTrip(c) {
    if (!c.last_event_at) return false;
    var mins = (Date.now() - new Date(c.last_event_at).getTime()) / 60000;
    return (c.last_event_type === 'on_the_way' || c.last_event_type === 'waiting') && mins >= 120;
  }

  function renderPane() {
    var pane = $('ah-pane-ops3');
    if (!pane) return;
    if (!st.snap) {
      pane.innerHTML = '<section class="ah-card"><div class="ah-sub">جاري تحميل بيانات عمليات اليوم والرادار الحي…</div></section>';
      return;
    }
    var d = st.snap;
    var rushOn = !!(d.rush_mode && d.rush_mode.enabled);
    var couriers = Array.isArray(d.couriers) ? d.couriers : [];
    var embAm = Array.isArray(d.embassy_am) ? d.embassy_am : [];
    var missions = Array.isArray(d.embassy_missions) ? d.embassy_missions : [];
    var stale24 = Array.isArray(d.stale_complete_24h) ? d.stale_complete_24h : [];
    var stale72 = Array.isArray(d.stale_tickets_72h) ? d.stale_tickets_72h : [];
    var tickets = Array.isArray(d.open_tickets) ? d.open_tickets : [];
    var dups = Array.isArray(d.dup_names) ? d.dup_names : [];
    var bcasts = Array.isArray(d.broadcasts) ? d.broadcasts : [];

    var nowHour = new Date().getHours();
    var embAlert = (nowHour >= 8 && nowHour < 10 && embAm.length)
      ? '<div class="rp3-alert-box"><b>⏰ تنبيه سفارة الإمارات الصباحي (8:00 ص – 10:00 ص):</b> يوجد ' + embAm.length + ' طلبات سفارة إمارات من آخر 3 أيام تحتاج تسليمها في السفارة قبل الساعة 10:00 ص.</div>'
      : '';

    var briefHtml =
      '<div class="rp3-brief">' +
        '<div class="rp3-kpi"><div class="ah-sub">تيكتات استلام نشطة</div><div class="rp3-kpi-num">' + tickets.length + '</div></div>' +
        '<div class="rp3-kpi"><div class="ah-sub">سفارة الإمارات (آخر 3 أيام)</div><div class="rp3-kpi-num">' + embAm.length + '</div></div>' +
        '<div class="rp3-kpi"><div class="ah-sub">معاملات مركونة +24 ساعة</div><div class="rp3-kpi-num">' + stale24.length + '</div></div>' +
        '<div class="rp3-kpi"><div class="ah-sub">تيكتات معلقة +72 ساعة</div><div class="rp3-kpi-num">' + stale72.length + '</div></div>' +
      '</div>';

    var rushBarHtml =
      '<div class="ah-head">' +
        '<div><h3 class="ah-title">ملخص الصباح والتحكم الميداني</h3><div class="ah-sub">خطوط المناطق، عداد الكاش في إيد المندوب، الإنقاذ الطارئ، وحارس سفارة الإمارات.</div></div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:8px">' +
          (isManager()
            ? '<button type="button" class="ah-btn ' + (rushOn ? 'ah-btn-pri' : 'ah-btn-sec') + '" id="rp3-rush-btn">' + (rushOn ? '🌧️ وضع الذروة والمطر (+25% ETA): شغّال' : '🌧️ تشغيل وضع الذروة والمطر (+25%)') + '</button>'
            : '<span class="rp3-tag-amb">' + (rushOn ? 'وضع الذروة شغّال (+25% ETA)' : 'الوقت الطبيعي') + '</span>') +
          '<button type="button" class="ah-btn ah-btn-sec" id="rp3-refresh-btn">تحديث</button>' +
        '</div>' +
      '</div>';

    /* كروت المناديب المفعّلين + توازن الضغط + عداد الكاش + خطوط المناطق */
    var couriersHtml = couriers.length ? couriers.map(function (c) {
      var load = Number(c.active_pickups || 0) + Number(c.pending_deliveries || 0);
      var loadBadge = load >= 7
        ? '<span class="rp3-tag-red">مضغوط (' + load + ')</span>'
        : (load >= 4 ? '<span class="rp3-tag-amb">متوازن (' + load + ')</span>' : '<span class="rp3-tag-ok">خفيف (' + load + ')</span>');
      var staleBadge = isStaleTrip(c) ? '<span class="rp3-tag-red">🐢 راكد +2 ساعة</span>' : '';
      var etaMins = load * (rushOn ? 31 : 25);
      var routesHtml = ROUTES.map(function (r) {
        var chk = Array.isArray(c.route_keys) && c.route_keys.indexOf(r.key) >= 0;
        return '<label class="rp3-route-chk">' +
          '<input type="checkbox" class="rp3-rchk" data-cid="' + Number(c.courier_id) + '" value="' + eh(r.key) + '"' + (chk ? ' checked' : '') + (isManager() ? '' : ' disabled') + '>' +
          '<span>' + eh(r.label) + '</span>' +
        '</label>';
      }).join('');

      return '<div class="ah-box">' +
        '<div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:6px">' +
          '<div><b>' + eh(c.name) + '</b> ' + loadBadge + ' ' + staleBadge + '</div>' +
          '<span class="rp3-tag-ok">💵 في إيده: ' + eh(money(c.cash_in_hand || 0)) + '</span>' +
        '</div>' +
        '<div class="ah-sub">استلام: ' + Number(c.active_pickups || 0) + ' · تسليم: ' + Number(c.pending_deliveries || 0) + ' · Domino ETA المتبقي: ~' + etaMins + ' د · آخر حركة: ' + eh(fmtAgo(c.last_event_at)) + '</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">' + routesHtml + '</div>' +
      '</div>';
    }).join('') : '<div class="ah-sub">مفيش مناديب مفعّلين بحساب دخول حالياً.</div>';

    /* حافظة سفارة الإمارات الصباحية + مهمة استلام المساء */
    var courierOpts = '<option value="">اختر المندوب…</option>' + couriers.map(function (c) {
      return '<option value="' + Number(c.courier_id) + '">' + eh(c.name) + '</option>';
    }).join('');

    var embHtml =
      '<div class="ah-box">' +
        '<div class="ah-head" style="margin-bottom:4px">' +
          '<b>🏛️ حافظة سفارة الإمارات (آخر 3 أيام)</b>' +
          '<button type="button" class="ah-btn ah-btn-sec" id="rp3-copy-emb">نسخ حافظة الصبح (8–10 ص)</button>' +
        '</div>' +
        (embAm.length
          ? embAm.map(function (x) {
              return '<div class="ah-row"><span><b>' + eh(x.client_name) + '</b> <span class="ah-badge ah-badge-org" dir="ltr">' + eh(x.transaction_id) + '</span></span><span class="ah-sub">' + eh(x.service) + ' · ' + eh(x.received_date) + '</span></div>';
            }).join('')
          : '<div class="ah-sub">لا توجد طلبات سفارة إمارات جديدة في آخر 3 أيام.</div>') +
        '<div style="border-top:1px dashed rgba(148,163,184,.3);padding-top:8px;margin-top:4px">' +
          '<b style="font-size:12.5px">تسجيل مهمة استلام من السفارة (3:00 م – 5:00 م) بدون رقم ريكوست</b>' +
          '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">' +
            '<select id="rp3-emb-courier" class="ah-input" style="flex:1">' + courierOpts + '</select>' +
            '<input id="rp3-emb-note" class="ah-input" style="flex:1.5" placeholder="مثال: استلام أوراق سفارة الإمارات (3-5 م)">' +
            '<button type="button" class="ah-btn ah-btn-pri" id="rp3-emb-add">إرسال للمندوب</button>' +
          '</div>' +
          (missions.length ? '<div style="margin-top:6px">' + missions.map(function (m) {
            return '<div class="ah-sub">• <b>' + eh(m.courier_name) + '</b> — ' + eh(m.window_label) + (m.notes ? ' (' + eh(m.notes) + ')' : '') + '</div>';
          }).join('') + '</div>' : '') +
        '</div>' +
      '</div>';

    /* الموزّع الذكي + الإنقاذ الطارئ (Fleet Rescue) + التاج الأحمر + تاريخ العميل */
    var ticketsHtml = tickets.length ? tickets.map(function (t) {
      var sug = suggestCourierForZone(t.zone || t.address);
      var routeObj = detectRouteFromZone(t.zone || t.address);
      var highCash = Number(t.collect_amount || 0) >= 3000;
      var slotWarn = (t.slot_pref === 'صباحي' && new Date().getHours() >= 13)
        ? '<span class="rp3-tag-red">تجاوز الميعاد الصباحي</span>'
        : '';
      var chk = !!st.rescueSelected[t.id];
      return '<div class="ah-row">' +
        '<label class="ah-chk-lbl">' +
          '<input type="checkbox" class="rp3-rescue-chk" value="' + Number(t.id) + '"' + (chk ? ' checked' : '') + '>' +
          '<div style="flex:1">' +
            '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">' +
              '<b>' + eh(t.client_name) + '</b>' +
              '<span class="ah-badge ah-badge-org" dir="ltr">' + eh(t.sd_request_id) + '</span>' +
              (highCash ? '<span class="rp3-tag-red">👑 حساس مالياً (' + eh(money(t.collect_amount)) + ')</span>' : '') +
              (t.history_count > 1 ? '<span class="rp3-tag-ok">📜 عميل سابق (' + Number(t.history_count) + ')</span>' : '') +
              slotWarn +
            '</div>' +
            '<div class="ah-sub" style="margin-top:3px">' +
              eh(t.zone || t.address || 'بدون منطقة') +
              (routeObj ? ' · <b>' + eh(routeObj.label) + '</b>' : '') +
              (sug ? ' · المقترح: <b>' + eh(sug.name) + '</b>' : '') +
            '</div>' +
          '</div>' +
        '</label>' +
      '</div>';
    }).join('') : '<div class="ah-sub">لا توجد تيكتات استلام نشطة.</div>';

    var rescueBoxHtml =
      '<div class="ah-box">' +
        '<b>🚑 الموزّع الذكي والإنقاذ الطارئ (تحويل لمندوب تاني)</b>' +
        '<div style="display:flex;flex-wrap:wrap;gap:6px">' +
          '<select id="rp3-rescue-courier" class="ah-input" style="flex:1">' + courierOpts + '</select>' +
          '<button type="button" class="ah-btn ah-btn-pri" id="rp3-rescue-btn">تحويل التيكتات المحددة فوراً</button>' +
        '</div>' +
        ticketsHtml +
      '</div>';

    /* المتأخرات (+24 ساعة و +72 ساعة) + تشابه الأسماء + النداء العام + الردود السريعة */
    var alertsHtml =
      '<div class="ah-box">' +
        '<b>⏳ رادار المتأخرات وتنبيهات الأمان</b>' +
        (dups.length ? '<div class="rp3-alert-box" style="margin-bottom:4px"><b>⚠️ تحذير تشابه أسماء في التسليمات الجاهزة:</b> ' + dups.map(function (x) { return eh((x.names || []).join(' / ')); }).join(' — ') + '</div>' : '') +
        '<div class="ah-sub"><b>معاملات مكتملة مركونة +24 ساعة (' + stale24.length + '):</b> ' + (stale24.length ? stale24.slice(0, 6).map(function (x) { return eh(x.client_name) + ' (' + eh(x.transaction_id) + ')'; }).join('، ') : 'لا يوجد ✓') + '</div>' +
        '<div class="ah-sub"><b>تيكتات استلام معلقة +72 ساعة (' + stale72.length + '):</b> ' + (stale72.length ? stale72.slice(0, 6).map(function (x) { return eh(x.client_name) + ' (' + eh(x.sd_request_id) + ')'; }).join('، ') : 'لا يوجد ✓') + '</div>' +
        '<div style="border-top:1px dashed rgba(148,163,184,.3);padding-top:8px;margin-top:4px">' +
          '<b style="font-size:12.5px">📢 نداء عام لكل المناديب (Fleet Broadcast)</b>' +
          '<div style="display:flex;gap:6px;margin-top:6px">' +
            '<input id="rp3-bcast-msg" class="ah-input" style="flex:1" maxlength="400" placeholder="اكتب رسالة توصل لكل المناديب فوراً...">' +
            (isManager() ? '<button type="button" class="ah-btn ah-btn-pri" id="rp3-bcast-send">إرسال للكل</button>' : '<span class="ah-sub">للمدير فقط</span>') +
          '</div>' +
          (bcasts.length ? '<div style="margin-top:6px">' + bcasts.slice(0, 3).map(function (b) { return '<div class="ah-sub">• ' + eh(b.message) + '</div>'; }).join('') + '</div>' : '') +
        '</div>' +
        '<div style="border-top:1px dashed rgba(148,163,184,.3);padding-top:8px;margin-top:4px">' +
          '<b style="font-size:12.5px">💬 نسخ ردود خدمة العملاء السريعة</b>' +
          '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">' +
            CANNED_REPLIES.map(function (c, i) {
              return '<button type="button" class="ah-btn ah-btn-sec" data-rp3-reply="' + i + '">' + eh(c.title) + '</button>';
            }).join('') +
          '</div>' +
        '</div>' +
      '</div>';

    pane.innerHTML =
      '<section class="ah-card">' +
        rushBarHtml +
        embAlert +
        briefHtml +
        '<div class="rp3-grid2">' +
          '<div style="display:flex;flex-direction:column;gap:12px">' +
            '<b style="font-size:14px">خطوط المناديب، عداد الكاش، وتوازن الضغط</b>' +
            couriersHtml +
            alertsHtml +
          '</div>' +
          '<div style="display:flex;flex-direction:column;gap:12px">' +
            embHtml +
            rescueBoxHtml +
          '</div>' +
        '</div>' +
      '</section>';
  }

  async function loadPhase3Snap(force) {
    if (!sbClient || !isAllowedStaff()) return;
    if (!force && st.loadedAt && (Date.now() - st.loadedAt < 10000) && st.snap) {
      renderPane();
      return;
    }
    st.loadedAt = Date.now();
    renderPane();
    try {
      var r = await sbClient.rpc('radar_phase3_snapshot');
      if (r.error) throw r.error;
      st.snap = r.data || null;
      renderPane();
    } catch (err) {
      var pane = $('ah-pane-ops3');
      if (pane) pane.innerHTML = '<section class="ah-card"><div class="ah-sub">تأكد من تشغيل ملف sql/radar-phase3.sql في Supabase. (' + eh(err && err.message) + ')</div></section>';
    }
  }

  async function onPaneClick(e) {
    var t = e.target;
    if (!t) return;
    if (t.id === 'rp3-refresh-btn') {
      return loadPhase3Snap(true);
    }
    if (t.id === 'rp3-rush-btn') {
      if (!isManager()) return toast('للمدير فقط', 'error');
      var cur = !!(st.snap && st.snap.rush_mode && st.snap.rush_mode.enabled);
      t.disabled = true;
      try {
        var r = await sbClient.rpc('radar_toggle_rush_mode', { p_enabled: !cur });
        if (r.error) return toast(r.error.message, 'error');
        await loadPhase3Snap(true);
        toast(!cur ? 'تم تفعيل وضع الذروة (+25% ETA) ✓' : 'تم الرجوع للوضع الطبيعي ✓');
      } finally { t.disabled = false; }
      return;
    }
    if (t.id === 'rp3-copy-emb') {
      var list = (st.snap && st.snap.embassy_am) || [];
      var txt = list.length
        ? 'حافظة سفارة الإمارات (8:00 ص – 10:00 ص):\n' + list.map(function (x, i) { return (i + 1) + ') ' + x.client_name + ' — ' + x.transaction_id; }).join('\n')
        : 'لا توجد طلبات سفارة إمارات حالياً.';
      copyText(txt);
      return toast('تم نسخ حافظة سفارة الإمارات ✓');
    }
    if (t.id === 'rp3-emb-add') {
      var cid = Number(($('rp3-emb-courier') && $('rp3-emb-courier').value) || 0);
      var note = ($('rp3-emb-note') && $('rp3-emb-note').value.trim()) || 'استلام أوراق من سفارة الإمارات';
      if (!cid) return toast('اختار المندوب الأول', 'error');
      t.disabled = true;
      try {
        var er = await sbClient.rpc('radar_add_embassy_mission', {
          p_day: (st.snap && st.snap.day) || null,
          p_type: 'pickup_pm',
          p_courier_id: cid,
          p_notes: note
        });
        if (er.error) return toast(er.error.message, 'error');
        await loadPhase3Snap(true);
        toast('تم إرسال مهمة استلام السفارة (3-5 م) للمندوب ✓');
      } finally { t.disabled = false; }
      return;
    }
    if (t.id === 'rp3-rescue-btn') {
      var toId = Number(($('rp3-rescue-courier') && $('rp3-rescue-courier').value) || 0);
      var ids = Object.keys(st.rescueSelected).filter(function (k) { return st.rescueSelected[k]; }).map(Number);
      if (!ids.length) return toast('علّم على تيكت واحد على الأقل للتحويل', 'error');
      if (!toId) return toast('اختار المندوب البديل', 'error');
      t.disabled = true;
      try {
        var fr = await sbClient.rpc('radar_fleet_rescue', { p_ticket_ids: ids, p_to_courier_id: toId });
        if (fr.error) return toast(fr.error.message, 'error');
        st.rescueSelected = {};
        await loadPhase3Snap(true);
        toast('تم تحويل ' + (fr.data && fr.data.moved || ids.length) + ' تيكت إلى ' + (fr.data && fr.data.courier_name || 'المندوب') + ' ✓');
      } finally { t.disabled = false; }
      return;
    }
    if (t.id === 'rp3-bcast-send') {
      if (!isManager()) return toast('للمدير فقط', 'error');
      var msg = ($('rp3-bcast-msg') && $('rp3-bcast-msg').value.trim()) || '';
      if (msg.length < 2) return toast('اكتب رسالة النداء الأول', 'error');
      t.disabled = true;
      try {
        var br = await sbClient.rpc('radar_send_broadcast', { p_message: msg });
        if (br.error) return toast(br.error.message, 'error');
        await loadPhase3Snap(true);
        toast('وصل النداء العام لكل المناديب ✓');
      } finally { t.disabled = false; }
      return;
    }
    var rBtn = t.closest ? t.closest('[data-rp3-reply]') : null;
    if (rBtn) {
      var c = CANNED_REPLIES[Number(rBtn.dataset.rp3Reply)];
      if (c) { copyText(c.text); toast('تم نسخ الرد: ' + c.title + ' ✓'); }
    }
  }

  async function onPaneChange(e) {
    var t = e.target;
    if (!t) return;
    if (t.classList && t.classList.contains('rp3-rescue-chk')) {
      st.rescueSelected[Number(t.value)] = !!t.checked;
      return;
    }
    if (t.classList && t.classList.contains('rp3-rchk')) {
      if (!isManager()) return toast('تعديل الخطوط للمدير فقط', 'error');
      var cid = Number(t.dataset.cid);
      var keys = [];
      document.querySelectorAll('.rp3-rchk[data-cid="' + cid + '"]:checked').forEach(function (el) { keys.push(el.value); });
      var r = await sbClient.rpc('radar_set_courier_routes', { p_courier_id: cid, p_routes: keys });
      if (r.error) return toast(r.error.message, 'error');
      toast('تم حفظ خطوط المندوب ✓');
    }
  }

  /* عرض النداء العام ومهام السفارة للمندوب في بوابته بدون أي أسعار */
  async function loadAndRenderCourierAlerts() {
    if (!sbClient || !isCourier()) return;
    var app = $('courier-app');
    if (!app) return;
    if (st.courierLoadedAt && (Date.now() - st.courierLoadedAt < 60000)) return;
    st.courierLoadedAt = Date.now();
    try {
      ensureCss();
      var r = await sbClient.rpc('courier_my_radar_alerts');
      if (r.error || !r.data) return;
      var missions = Array.isArray(r.data.missions) ? r.data.missions : [];
      var bcasts = Array.isArray(r.data.broadcasts) ? r.data.broadcasts : [];
      var box = $('rp3-courier-alerts');
      if (!missions.length && !bcasts.length) {
        if (box) box.remove();
        return;
      }
      if (!box) {
        box = document.createElement('section');
        box.id = 'rp3-courier-alerts';
        box.className = 'rp3-courier-bcast';
        var host = $('ah74-courier-hub') || $('pt73-courier-tickets') || $('cp-v12-top-banners') || app;
        host.insertAdjacentElement('afterend', box);
      }
      box.innerHTML =
        (bcasts.length ? '<div style="font-weight:700;margin-bottom:4px">📢 نداء الإدارة: ' + eh(bcasts[0].message) + '</div>' : '') +
        missions.map(function (m) {
          return '<div style="padding-top:4px;border-top:1px solid rgba(255,255,255,.12)">🏛️ <b>مهمة سفارة الإمارات (' + eh(m.window_label) + '):</b> ' + eh(m.notes || 'استلام أوراق') + '</div>';
        }).join('');
    } catch (e) { /* ignore */ }
  }

  function wrap(name, fn) {
    var orig = window[name];
    if (typeof orig === 'function' && !orig['__rp3Wrapped']) {
      var w = fn(orig);
      w['__rp3Wrapped'] = true;
      window[name] = w;
    }
  }

  function hookTab() {
    if (isCourier()) {
      setTimeout(loadAndRenderCourierAlerts, 300);
      return;
    }
    if (!isAllowedStaff()) return;
    ensureNavButtonAndPane();
  }

  wrap('switchTab', function (orig) {
    return function (id) {
      var res = orig.apply(this, arguments);
      if (id === 'radar' || id === 'pickup') {
        setTimeout(hookTab, 90);
      }
      return res;
    };
  });

  wrap('loadInitialData', function (orig) {
    return async function () {
      var r = await orig.apply(this, arguments);
      setTimeout(hookTab, 250);
      return r;
    };
  });

  wrap('handleLogout', function (orig) {
    return function () {
      st.snap = null; st.active = false; st.loadedAt = 0; st.courierLoadedAt = 0; st.rescueSelected = {};
      var b = $('rp3-nav-btn'), p = $('ah-pane-ops3'), c = $('rp3-courier-alerts');
      if (b) b.remove();
      if (p) p.remove();
      if (c) c.remove();
      return orig.apply(this, arguments);
    };
  });

  setTimeout(hookTab, 250);
})();
