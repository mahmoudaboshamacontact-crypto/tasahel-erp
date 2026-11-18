/* =====================================================================
   js/77-phase5-analytics-tracking.js — المرحلة 5: تحفيز المندوب
   وتحليلات المناطق والربحية وأوقات المشاوير للإدارة.
   - معزول تماماً في IIFE، متناسق 100% مع ثيم تساهيل الدافئ بدون زحمة إيموجي.
   ===================================================================== */
(function () {
  'use strict';
  if (window.__phase5Analytics) return;
  window.__phase5Analytics = true;

  var $ = function (id) { return document.getElementById(id); };
  var eh = function (s) {
    if (typeof escapeHtml === 'function') return escapeHtml(s == null ? '' : String(s));
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  };
  var money = function (n) { return Number(n || 0).toLocaleString('ar-EG') + ' ج.م'; };

  var st = {
    mot: null,
    motLoadedAt: 0,
    ana: null,
    anaLoadedAt: 0,
    days: 30,
    active: false
  };

  function isCourier() {
    return window.__role === 'courier' || !!(document.body && document.body.classList.contains('is-courier-mode'));
  }
  function isManager() { return window.__role === 'manager'; }
  function isAllowedStaff() {
    if (window.__role === 'partner' || isCourier()) return false;
    if (document.body && document.body.classList.contains('is-partner-mode')) return false;
    var u = (typeof currentUser !== 'undefined' && currentUser) ? currentUser : window.currentUser;
    return !!u && (isManager() || window.__role === 'staff' || !window.__role);
  }

  function ensureCss() {
    if ($('p5-style')) return;
    var s = document.createElement('style');
    s.id = 'p5-style';
    s.textContent = [
      '.p5-mot-card{margin:10px 12px 0;padding:12px 14px;border-radius:16px;background:var(--card);border:1px solid var(--bd);font-size:12px}',
      '.p5-prog-track{height:7px;border-radius:999px;background:var(--fld);overflow:hidden;margin:6px 0 8px}',
      '.p5-prog-fill{height:100%;border-radius:999px;background:#10b981;transition:width .3s ease}',
      '.p5-mot-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}',
      '.p5-mot-kpi{padding:8px 10px;border-radius:11px;background:var(--fld);border:1px solid var(--bd)}',
      '.p5-ana-grid{display:grid;grid-template-columns:1.1fr .9fr;gap:14px}',
      '.p5-heat-bar{height:8px;border-radius:999px;background:var(--r-card,#ffffff);overflow:hidden;margin-top:5px}',
      'html.dark .p5-heat-bar{background:#181412}',
      '.p5-heat-fill{height:100%;border-radius:999px;background:var(--r-acc,#ff7a3d)}',
      '.p5-tbl{width:100%;border-collapse:collapse;font-size:12px;text-align:right}',
      '.p5-tbl th{padding:8px 6px;color:var(--r-mute,#7b6f64);border-bottom:1px solid var(--r-line,rgba(40,25,10,.1));font-weight:700}',
      '.p5-tbl td{padding:8px 6px;border-bottom:1px solid var(--r-line,rgba(40,25,10,.06))}',
      '@media (max-width:860px){.p5-ana-grid{grid-template-columns:1fr}.p5-mot-grid{grid-template-columns:1fr}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ---------- 1) كارت تحفيز المندوب داخل بوابته ---------- */
  async function loadCourierMotivation(force) {
    if (!sbClient || !isCourier() || !$('courier-app')) return;
    if (!force && st.motLoadedAt && (Date.now() - st.motLoadedAt < 60000)) {
      renderCourierMotivation();
      return;
    }
    try {
      var r = await sbClient.rpc('courier_p5_motivation');
      if (!r.error && r.data) {
        st.mot = r.data;
        st.motLoadedAt = Date.now();
        renderCourierMotivation();
      }
    } catch (e) {}
  }

  function renderCourierMotivation() {
    var app = $('courier-app');
    if (!app || !st.mot) return;
    ensureCss();
    var m = st.mot;
    var pct = m.daily_target > 0 ? Math.min(100, Math.round((Number(m.today_confirmed || 0) / Number(m.daily_target)) * 100)) : 0;

    var box = $('p5-courier-mot');
    if (!box) {
      box = document.createElement('section');
      box.id = 'p5-courier-mot';
      box.className = 'p5-mot-card';
      var host = $('cp4-toolkit-bar') || app.querySelector('.cpn-head') || app.firstChild;
      if (host && host.nextSibling) app.insertBefore(box, host.nextSibling);
      else app.insertBefore(box, app.firstChild);
    }

    var starBadge = m.is_weekly_star
      ? '<span class="cp-tag ok">نجم الأسبوع</span>'
      : (m.weekly_top_name ? '<span class="cp-tag">متصدر الأسبوع: ' + eh(m.weekly_top_name) + ' (' + Number(m.weekly_top_trips || 0) + ')</span>' : '');

    var recTxt = Number(m.personal_record || 0) > 0
      ? (Number(m.today_confirmed || 0) >= Number(m.personal_record)
          ? 'رقم قياسي جديد اليوم'
          : ('متبقي ' + Number(m.to_beat_record || 1) + ' لكسر رقمك (' + Number(m.personal_record) + ')'))
      : 'ابدأ تسجيل رقمك القياسي';

    box.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">' +
        '<b>الهدف اليومي: ' + Number(m.today_confirmed || 0) + ' من ' + Number(m.daily_target || 8) + ' مشاوير</b>' +
        starBadge +
      '</div>' +
      '<div class="p5-prog-track"><div class="p5-prog-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="p5-mot-grid">' +
        '<div class="p5-mot-kpi"><div style="color:var(--mu);font-size:11px">سلسلة الالتزام</div><b>' + Number(m.streak_days || 0) + ' يوم متتالي</b></div>' +
        '<div class="p5-mot-kpi"><div style="color:var(--mu);font-size:11px">الرقم القياسي</div><b>' + Number(m.personal_record || 0) + ' مشوار/يوم</b></div>' +
        '<div class="p5-mot-kpi"><div style="color:var(--mu);font-size:11px">المنافسة</div><b>' + eh(recTxt) + '</b></div>' +
      '</div>';
  }

  /* ---------- 2) لوحة تحليلات الإدارة والربحية في الرادار ---------- */
  function ensureAnalyticsNavAndPane() {
    var nav = $('ah-nav-tabs');
    var radarTab = $('tab-radar');
    if (!nav || !radarTab) return false;
    ensureCss();

    if (!$('p5-nav-btn')) {
      var btn = document.createElement('button');
      btn.id = 'p5-nav-btn';
      btn.type = 'button';
      btn.className = 'ah-nav-pill';
      btn.innerHTML = '<i class="fa-solid fa-chart-column"></i><span>تحليلات المناطق والأداء</span>';
      btn.onclick = function () {
        st.active = true;
        nav.querySelectorAll('.ah-nav-pill').forEach(function (p) { p.classList.remove('active'); });
        btn.classList.add('active');
        ['ah-pane-abbasiya', 'ah-pane-live-radar', 'ah-pane-pickup', 'ah-pane-ops3'].forEach(function (pid) {
          var el = $(pid);
          if (el) el.classList.add('hidden');
        });
        var pane = $('ah-pane-analytics5');
        if (pane) pane.classList.remove('hidden');
        loadAnalytics(false);
      };
      nav.appendChild(btn);

      nav.addEventListener('click', function (ev) {
        var b = ev.target && ev.target.closest ? ev.target.closest('[data-ah-nav], #rp3-nav-btn') : null;
        if (b) {
          st.active = false;
          btn.classList.remove('active');
          var pane = $('ah-pane-analytics5');
          if (pane) pane.classList.add('hidden');
        }
      });
    }

    if (!$('ah-pane-analytics5')) {
      var wrap = radarTab.querySelector('.ah-wrap') || radarTab;
      var pane5 = document.createElement('div');
      pane5.id = 'ah-pane-analytics5';
      pane5.className = 'hidden';
      pane5.addEventListener('click', onAnalyticsClick);
      wrap.appendChild(pane5);
    }
    return true;
  }

  async function loadAnalytics(force) {
    if (!sbClient || !isAllowedStaff()) return;
    if (!force && st.anaLoadedAt && (Date.now() - st.anaLoadedAt < 30000) && st.ana) {
      renderAnalyticsPane();
      return;
    }
    st.anaLoadedAt = Date.now();
    renderAnalyticsPane();
    try {
      var r = await sbClient.rpc('radar_p5_analytics', { p_days: st.days });
      if (r.error) throw r.error;
      st.ana = r.data || null;
      renderAnalyticsPane();
    } catch (err) {
      var pane = $('ah-pane-analytics5');
      if (pane) pane.innerHTML = '<section class="ah-card"><div class="ah-sub">تأكد من تشغيل ملف sql/phase5-analytics-tracking.sql في Supabase. (' + eh(err && err.message) + ')</div></section>';
    }
  }

  function renderAnalyticsPane() {
    var pane = $('ah-pane-analytics5');
    if (!pane) return;
    if (!st.ana) {
      pane.innerHTML = '<section class="ah-card"><div class="ah-sub">جاري تحميل تحليلات المناطق والربحية…</div></section>';
      return;
    }
    var d = st.ana;
    var zones = Array.isArray(d.zones) ? d.zones : [];
    var times = Array.isArray(d.trip_times) ? d.trip_times : [];
    var maxOrders = zones.reduce(function (m, z) { return Math.max(m, Number(z.orders_count || 0)); }, 1);

    var periodBtns = [7, 30, 90].map(function (days) {
      return '<button type="button" class="ah-chip' + (st.days === days ? ' active' : '') + '" data-p5-days="' + days + '">آخر ' + days + ' يوم</button>';
    }).join('');

    var heatHtml = zones.length ? zones.map(function (z) {
      var pct = Math.round((Number(z.orders_count || 0) / maxOrders) * 100);
      return '<div style="margin-bottom:8px">' +
        '<div style="display:flex;justify-content:space-between;font-size:12.5px">' +
          '<b>' + eh(z.zone_name) + '</b>' +
          '<span>' + Number(z.orders_count || 0) + ' طلب</span>' +
        '</div>' +
        '<div class="p5-heat-bar"><div class="p5-heat-fill" style="width:' + pct + '%"></div></div>' +
      '</div>';
    }).join('') : '<div class="ah-sub">لا توجد بيانات مناطق في هذه الفترة.</div>';

    var revTableHtml = zones.length
      ? '<div style="overflow-x:auto"><table class="p5-tbl">' +
          '<thead><tr><th>المنطقة</th><th>الطلبات</th><th>الإيراد</th><th>تكلفة التوصيل</th><th>نسبة التوصيل</th></tr></thead>' +
          '<tbody>' + zones.map(function (z) {
            return '<tr>' +
              '<td><b>' + eh(z.zone_name) + '</b></td>' +
              '<td>' + Number(z.orders_count || 0) + '</td>' +
              '<td>' + eh(money(z.revenue)) + '</td>' +
              '<td>' + eh(money(z.delivery_cost)) + '</td>' +
              '<td><span class="ah-badge ' + (Number(z.cost_pct) > 15 ? 'ah-badge-warn' : 'ah-badge-ok') + '">' + Number(z.cost_pct || 0) + '%</span></td>' +
            '</tr>';
          }).join('') + '</tbody></table></div>'
      : '<div class="ah-sub">لا توجد بيانات مالية في هذه الفترة.</div>';

    var timesHtml = times.length
      ? times.map(function (t) {
          return '<div class="ah-row">' +
            '<div><b>' + eh(t.courier_name) + '</b><div class="ah-sub">عينة: ' + Number(t.samples_count || 0) + ' مشوار</div></div>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
              '<span class="ah-badge ah-badge-org">طريق: ~' + Number(t.avg_transit_mins || 0) + ' د</span>' +
              '<span class="ah-badge ah-badge-ok">انتظار: ~' + Number(t.avg_wait_mins || 0) + ' د</span>' +
            '</div>' +
          '</div>';
        }).join('')
      : '<div class="ah-sub">تظهر أوقات الطريق والانتظار تلقائياً بعد تسجيل حركات «في طريقي» و«وصلت» من المناديب.</div>';

    pane.innerHTML =
      '<section class="ah-card">' +
        '<div class="ah-head">' +
          '<div>' +
            '<h3 class="ah-title">تحليلات ضغط المناطق، تكلفة التوصيل، وأوقات المشاوير</h3>' +
            '<div class="ah-sub">متابعة ربحية كل منطقة جغرافية وكفاءة أوقات التحرك والانتظار.</div>' +
          '</div>' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">' +
            periodBtns +
            '<button type="button" class="ah-btn ah-btn-sec" id="p5-refresh-btn"><i class="fa-solid fa-rotate-right"></i><span>تحديث</span></button>' +
          '</div>' +
        '</div>' +
        '<div class="p5-ana-grid">' +
          '<div style="display:flex;flex-direction:column;gap:12px">' +
            '<div class="ah-box"><b>تكلفة التوصيل مقابل إيراد المنطقة</b>' + revTableHtml + '</div>' +
            '<div class="ah-box"><b>تحليل وقت المشوار (الطريق vs الانتظار)</b>' + timesHtml + '</div>' +
          '</div>' +
          '<div class="ah-box"><b>خريطة ضغط المناطق</b>' + heatHtml + '</div>' +
        '</div>' +
      '</section>';
  }

  function onAnalyticsClick(e) {
    var t = e.target;
    if (!t) return;
    if (t.id === 'p5-refresh-btn' || (t.closest && t.closest('#p5-refresh-btn'))) {
      loadAnalytics(true);
      return;
    }
    var dBtn = t.closest ? t.closest('[data-p5-days]') : null;
    if (dBtn) {
      st.days = Number(dBtn.getAttribute('data-p5-days') || 30);
      loadAnalytics(true);
    }
  }

  function hookPhase5() {
    if (isCourier()) {
      setTimeout(function () { loadCourierMotivation(false); }, 400);
      return;
    }
    if (isAllowedStaff()) {
      ensureAnalyticsNavAndPane();
    }
  }

  function wrap(name, fn) {
    var orig = window[name];
    if (typeof orig === 'function' && !orig['__p5Wrapped']) {
      var w = fn(orig);
      w['__p5Wrapped'] = true;
      window[name] = w;
    }
  }

  wrap('switchTab', function (orig) {
    return function (id) {
      var res = orig.apply(this, arguments);
      if (id === 'radar' || id === 'pickup') {
        setTimeout(hookPhase5, 120);
      }
      return res;
    };
  });

  wrap('loadInitialData', function (orig) {
    return async function () {
      var r = await orig.apply(this, arguments);
      setTimeout(hookPhase5, 320);
      return r;
    };
  });

  wrap('handleLogout', function (orig) {
    return function () {
      st.mot = null; st.ana = null; st.motLoadedAt = 0; st.anaLoadedAt = 0;
      var b = $('p5-nav-btn'), p = $('ah-pane-analytics5'), m = $('p5-courier-mot');
      if (b) b.remove();
      if (p) p.remove();
      if (m) m.remove();
      return orig.apply(this, arguments);
    };
  });

  setTimeout(hookPhase5, 350);
})();
