/* =====================================================================
   js/76-courier-phase4.js — المرحلة 4: بوابة المندوب الميدانية، الأمان،
   الختم الرقمي لاستلام المكتب، التحويل يد بيد، سجل الوصول بدون لوم،
   التحصيل المالي المرن، إيصال العميل الحراري، تقفيل الكاش، وأدوات الموبايل.
   - معزول تماماً في IIFE بدون لمس الملفات الأساسية.
   - صفر صور مرفوعة على السيرفر (0 Supabase Storage).
   ===================================================================== */
(function () {
  'use strict';
  if (window.__courierPhase4) return;
  window.__courierPhase4 = true;

  var $ = function (id) { return document.getElementById(id); };
  var eh = function (s) {
    if (typeof escapeHtml === 'function') return escapeHtml(s == null ? '' : String(s));
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  };
  var money = function (n) { return Number(n || 0).toLocaleString('ar-EG') + ' ج.م'; };
  var todayCairo = function () {
    try { return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' }); }
    catch (e) { return new Date().toISOString().slice(0, 10); }
  };

  function toast(msg, bad) {
    if ($('courier-app')) {
      var t = document.createElement('div');
      t.className = 'cp-toast' + (bad ? ' err' : '');
      t.textContent = msg;
      document.body.appendChild(t);
      setTimeout(function () { t.remove(); }, 3500);
      return;
    }
    if (typeof showToast === 'function') showToast(msg, bad ? 'error' : 'success');
    else alert(msg);
  }

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

  /* كلمات الأصول الحساسة لدرع الأصول + كلمات الطرق السريعة والكارتة */
  var SENSITIVE_ASSET_RX = /جواز|باسبور|passport|توكيل|أصل|اصل|شهادة ميلاد|شهاده ميلاد|شهادة زواج|شهادة وفاة|فيش|عقد|سجل تجاري|بطاقة ضريبية|شهادة تخرج|مؤهل/i;
  var HIGHWAY_TOLL_RX = /طريق السويس|طريق الإسماعيلية|طريق الاسماعيليه|العاصمة الإدارية|العاصمه الاداريه|الشروق|مدينتي|الرحاب|بدر|المستقبل|أكتوبر|اكتوبر|الشيخ زايد|زايد|المحور|الصحراوي|الدائري الأوسطي|الدائري الاوسطي|التجمع|القطامية|القطاميه|سخنة|سخنه|العبور|برج العرب|العلمين/i;

  var st = {
    day: todayCairo(),
    p4: null,
    loadedAt: 0,
    loading: false,
    gateShownToday: false,
    gateChecks: { battery: false, internet: false, change_cash: false, office_papers: false },
    onboarding: localStorage.getItem('cp_p4_onboarding') === '1',
    amoled: localStorage.getItem('cp_p4_amoled') === '1',
    thumbSide: localStorage.getItem('cp_p4_thumb') || 'right',
    parkingPin: null,
    driving: false,
    autoRepliedMsgIds: {},
    torchOn: false,
    staffSnap: null,
    staffLoadedAt: 0,
    calcDue: 0,
    calcPaid: 0
  };

  try {
    var savedPark = localStorage.getItem('cp_p4_parking_pin');
    if (savedPark) st.parkingPin = JSON.parse(savedPark);
  } catch (e) {}

  function ensureCss() {
    if ($('cp-p4-style')) return;
    var s = document.createElement('style');
    s.id = 'cp-p4-style';
    s.textContent = [
      '/* Phase 4 Courier Portal & Office Styles */',
      '#courier-app[data-amoled="1"]{--bg:#000000;--card:#050505;--hd:#000000;--fld:#0a0a0a;--bd:#1f2937;background:#000000}',
      '#courier-app[data-amoled="1"] .cpn-head,#courier-app[data-amoled="1"] .cp-nav{background:#000000;border-color:#18181b}',
      '#courier-app[data-thumb="left"] .cpn-fab{right:auto;left:16px}',
      '#courier-app[data-thumb="left"] .cpn-tiles{direction:ltr}',
      '#courier-app[data-thumb="left"] .cp-v12-card > div{flex-direction:row-reverse}',
      '.cp4-bar{display:flex;align-items:center;gap:6px;overflow-x:auto;padding:8px 12px;background:var(--card);border-bottom:1px solid var(--bd);scrollbar-width:none}',
      '.cp4-bar::-webkit-scrollbar{display:none}',
      '.cp4-pill{flex:0 0 auto;display:inline-flex;align-items:center;gap:5px;padding:6px 11px;border-radius:999px;font-size:11.5px;font-weight:700;background:var(--fld);color:var(--tx);border:1px solid var(--bd);cursor:pointer;white-space:nowrap}',
      '.cp4-pill.on{background:rgba(16,185,129,.18);border-color:#10b981;color:#10b981}',
      '.cp4-pill.warn{background:rgba(245,158,11,.18);border-color:#f59e0b;color:#fbbf24}',
      '.cp4-pill.drv.on{background:rgba(239,68,68,.2);border-color:#ef4444;color:#f87171}',
      '.cp4-shield{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:800;background:rgba(239,68,68,.16);color:#f87171;border:1px solid rgba(239,68,68,.35)}',
      '.cp4-toll{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:800;background:rgba(56,189,248,.15);color:#38bdf8;border:1px solid rgba(56,189,248,.35)}',
      '.cp4-onb-box{margin:8px 12px 0;padding:10px 12px;border-radius:14px;background:linear-gradient(135deg,rgba(16,185,129,.16),rgba(56,189,248,.12));border:1px solid rgba(16,185,129,.35);font-size:12px;line-height:1.6}',
      '.cp4-tr-banner{margin:8px 12px 0;padding:10px 12px;border-radius:14px;background:rgba(245,158,11,.16);border:1px solid #f59e0b;font-size:12px}',
      '.cp4-overlay{position:fixed;inset:0;z-index:100020;background:rgba(2,6,23,.86);display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto}',
      '.cp4-dialog{width:100%;max-width:440px;background:var(--card,#0f172a);color:var(--tx,#f8fafc);border:1px solid var(--bd,#1e293b);border-radius:22px;padding:18px;box-shadow:0 20px 50px rgba(0,0,0,.55)}',
      '.cp4-chk-row{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;background:var(--fld,#1e293b);border:1px solid var(--bd,#334155);margin-bottom:8px;cursor:pointer;font-size:13px;font-weight:600}',
      '.cp4-chk-row.on{border-color:#10b981;background:rgba(16,185,129,.12)}',
      '.cp4-actions-strip{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;padding-top:8px;border-top:1px dashed var(--bd)}',
      '.cp4-act-btn{display:inline-flex;align-items:center;gap:4px;padding:5px 9px;border-radius:9px;font-size:11px;font-weight:700;background:var(--fld);color:var(--tx);border:1px solid var(--bd);cursor:pointer}',
      '.cp4-act-btn.pri{background:rgba(16,185,129,.16);border-color:#10b981;color:#10b981}',
      '.cp4-act-btn.wn{background:rgba(245,158,11,.16);border-color:#f59e0b;color:#fbbf24}',
      '.cp4-act-btn.pu{background:rgba(139,92,246,.16);border-color:#8b5cf6;color:#c4b5fd}',
      '.cp4-thermal{background:#fff;color:#0f172a;border-radius:14px;padding:16px;font-family:"Cairo",sans-serif;border:2px dashed #94a3b8;max-width:340px;margin:0 auto}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function applyMobilePrefs() {
    var app = $('courier-app');
    if (!app) return;
    if (st.amoled) app.setAttribute('data-amoled', '1');
    else app.removeAttribute('data-amoled');
    app.setAttribute('data-thumb', st.thumbSide === 'left' ? 'left' : 'right');
  }

  /* تفعيل موفر بطارية AMOLED تلقائياً لو البطارية أقل من 20% */
  function initBatteryAutoWatcher() {
    if (!navigator.getBattery) return;
    navigator.getBattery().then(function (bat) {
      function checkBat() {
        if (!bat.charging && bat.level <= 0.20 && !st.amoled && localStorage.getItem('cp_p4_amoled') === null) {
          st.amoled = true;
          applyMobilePrefs();
          renderTopToolkitBar();
          toast('🔋 بطاريتك أقل من ٢٠٪ — تم تفعيل وضع AMOLED الأسود لتوفير الشحن');
        }
      }
      checkBat();
      bat.addEventListener('levelchange', checkBat);
    }).catch(function () {});
  }

  /* جلب حالة المرحلة 4 للمندوب من Supabase مع fallback محلي */
  async function loadMyP4State(force) {
    if (!sbClient || !isCourier()) return;
    if (st.loading) return;
    if (!force && st.loadedAt && (Date.now() - st.loadedAt < 60000)) return;
    st.loading = true;
    try {
      var r = await sbClient.rpc('courier_p4_my_state', { p_day: todayCairo() });
      if (!r.error && r.data) {
        st.p4 = r.data;
        st.loadedAt = Date.now();
        st.driving = !!r.data.driving_mode;
        if (r.data.gate_completed) {
          localStorage.setItem('cp_p4_gate_' + todayCairo(), '1');
        }
      }
    } catch (e) { /* fallback to localStorage if SQL not applied yet */ }
    st.loading = false;
    if ($('courier-app')) {
      ensureCss();
      applyMobilePrefs();
      renderTopToolkitBar();
      maybeShowPreDepartureGate();
      decorateCourierCards();
    }
  }

  /* 1) بوابة ما قبل الانطلاق (Pre-Departure Gate) — مرة واحدة في بداية اليوم */
  function isGateDoneToday() {
    if (st.p4 && st.p4.gate_completed) return true;
    return localStorage.getItem('cp_p4_gate_' + todayCairo()) === '1';
  }

  function maybeShowPreDepartureGate() {
    if (!isCourier() || !$('courier-app')) return;
    if (isGateDoneToday() || st.gateShownToday) return;
    if ($('cp4-gate-modal')) return;
    openPreDepartureGateModal();
  }

  function openPreDepartureGateModal() {
    var old = $('cp4-gate-modal');
    if (old) old.remove();
    var wrap = document.createElement('div');
    wrap.id = 'cp4-gate-modal';
    wrap.className = 'cp4-overlay';
    renderGateInner(wrap);
    document.body.appendChild(wrap);
  }

  function renderGateInner(wrap) {
    var c = st.gateChecks;
    var allChecked = c.battery && c.internet && c.change_cash && c.office_papers;
    var items = [
      ['battery', '🔋 شحن الموبايل + الباور بانك جاهز'],
      ['internet', '📶 باقة الإنترنت والـ GPS شغالين'],
      ['change_cash', '💵 معايا فكة كافية للتعامل مع العملاء'],
      ['office_papers', '📁 استلمت وراجعت الأوراق والجوازات المطلوبة من المكتب']
    ];
    wrap.innerHTML =
      '<div class="cp4-dialog" dir="rtl">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">' +
          '<b style="font-size:17px;color:#10b981">🚀 بوابة الانطلاق اليومية</b>' +
          '<span style="font-size:11.5px;color:var(--mu)">' + eh(todayCairo()) + '</span>' +
        '</div>' +
        '<p style="font-size:12.5px;color:var(--mu);margin:0 0 12px">علّم على الـ ٤ بنود دول في ثانيتين قبل ما تبدأ أول مشوار النهارده:</p>' +
        items.map(function (it) {
          var on = !!c[it[0]];
          return '<div class="cp4-chk-row' + (on ? ' on' : '') + '" data-cp4-gate-chk="' + it[0] + '">' +
            '<span style="width:22px;height:22px;border-radius:7px;border:2px solid ' + (on ? '#10b981' : '#64748b') + ';background:' + (on ? '#10b981' : 'transparent') + ';color:#04110c;display:inline-flex;align-items:center;justify-content:center;font-weight:900">' + (on ? '✓' : '') + '</span>' +
            '<span style="flex:1">' + it[1] + '</span>' +
          '</div>';
        }).join('') +
        '<div style="display:flex;gap:8px;margin-top:14px">' +
          '<button type="button" class="cp-btn cp-go" style="flex:1;opacity:' + (allChecked ? '1' : '.5') + '" id="cp4-gate-submit"' + (allChecked ? '' : ' disabled') + '>ابدأ يومك الآن ✓</button>' +
          '<button type="button" class="cp-btn" id="cp4-gate-checkall">تحديد الكل</button>' +
        '</div>' +
      '</div>';
  }

  /* 2) شريط الأدوات الميدانية السريع في أعلى بوابة المندوب */
  function renderTopToolkitBar() {
    var app = $('courier-app');
    if (!app) return;
    ensureCss();
    applyMobilePrefs();
    var bar = $('cp4-toolkit-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'cp4-toolkit-bar';
      var head = app.querySelector('.cpn-head') || app.firstChild;
      if (head && head.nextSibling) app.insertBefore(bar, head.nextSibling);
      else app.insertBefore(bar, app.firstChild);
    }

    var parkTxt = st.parkingPin ? '🏍️ ارجع للموتوسيكل' : '📍 ركنت هنا';
    var drvTxt = st.driving ? '🛵 سايق (رد تلقائي شغال)' : '🛵 أنا سايق';
    var closeObj = st.p4 && st.p4.closing;
    var dayLocked = !!(st.p4 && st.p4.day_locked);
    var closeLabel = dayLocked
      ? '🔒 اليوم مقفل ومؤكد'
      : (closeObj && closeObj.status === 'submitted' ? '⏳ التقفيل قيد تأكيد المكتب' : '💰 تقفيل كاش اليوم');

    var incoming = (st.p4 && Array.isArray(st.p4.incoming_transfers)) ? st.p4.incoming_transfers : [];
    var incomingHtml = incoming.length
      ? '<div class="cp4-tr-banner">' +
          '<div style="font-weight:800;margin-bottom:6px">🔄 مشاوير محوّلة ليك يد بيد من زمايلك (' + incoming.length + '):</div>' +
          incoming.map(function (tr) {
            return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 0;border-top:1px solid rgba(245,158,11,.3)">' +
              '<div><b>' + eh(tr.client_name || tr.transaction_id) + '</b> <span dir="ltr">(' + eh(tr.transaction_id) + ')</span><div style="font-size:11px;opacity:.9">من المندوب: <b>' + eh(tr.from_courier_name) + '</b>' + (tr.reason ? ' · السبب: ' + eh(tr.reason) : '') + '</div></div>' +
              '<div style="display:flex;gap:5px">' +
                '<button type="button" class="cp4-act-btn pri" data-cp4-act="tr-accept" data-id="' + tr.id + '">✓ استلمت</button>' +
                '<button type="button" class="cp4-act-btn" data-cp4-act="tr-reject" data-id="' + tr.id + '">رفض</button>' +
              '</div>' +
            '</div>';
          }).join('') +
        '</div>'
      : '';

    var onboardingHtml = st.onboarding
      ? '<div class="cp4-onb-box">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">' +
            '<b style="color:#10b981">🎓 وضع تدريب المندوب الجديد شغّال</b>' +
            '<button type="button" class="cp4-act-btn" data-cp4-act="toggle-onb">إخفاء التدريب ✕</button>' +
          '</div>' +
          '<div>• <b>قبل التحرك:</b> اضغط «في طريقي» علشان العميل والمكتب يشوفوك.</div>' +
          '<div>• <b>عند العميل:</b> لو فيها 🛡️ أصل مهم اتأكد من اسم العميل، ولو العميل مش موجود اضغط «وصلت — العميل غير متاح» عشان يتسجل وصولك بالـ GPS بدون لوم.</div>' +
          '<div>• <b>عند التحصيل:</b> تقدر تعرض الفاتورة للعميل بدون عمولة، تحسب الفكة، تحوّل لإنستاباي، أو تشارك إيصال حراري مباشر على واتساب.</div>' +
          '<div>• <b>آخر اليوم:</b> سلّم الأوراق للمكتب بالختم الرقمي (كود الموظف ٤ أرقام) واضغط «تقفيل كاش اليوم».</div>' +
        '</div>'
      : '';

    bar.innerHTML =
      '<div class="cp4-bar">' +
        '<button type="button" class="cp4-pill drv' + (st.driving ? ' on' : '') + '" data-cp4-act="toggle-driving">' + drvTxt + '</button>' +
        '<button type="button" class="cp4-pill' + (st.parkingPin ? ' on' : '') + '" data-cp4-act="parking-pin">' + parkTxt + '</button>' +
        '<button type="button" class="cp4-pill" data-cp4-act="open-office-signoff">🔏 تسليم ورق للمكتب (ختم رقمي)</button>' +
        '<button type="button" class="cp4-pill' + (dayLocked ? ' on' : ' warn') + '" data-cp4-act="open-cash-closing">' + closeLabel + '</button>' +
        '<button type="button" class="cp4-pill' + (st.amoled ? ' on' : '') + '" data-cp4-act="toggle-amoled">🌑 AMOLED</button>' +
        '<button type="button" class="cp4-pill" data-cp4-act="toggle-thumb">👍 إبهام: ' + (st.thumbSide === 'left' ? 'شمال' : 'يمين') + '</button>' +
        '<button type="button" class="cp4-pill' + (st.onboarding ? ' on' : '') + '" data-cp4-act="toggle-onb">🎓 تدريب</button>' +
      '</div>' +
      incomingHtml +
      onboardingHtml;
  }

  /* 3) تزيين كروت المشاوير بدرع الأصول + تنبيه الكارتة + أزرار المرحلة 4 الميدانية */
  function hasSensitiveAsset(text) {
    return SENSITIVE_ASSET_RX.test(String(text || ''));
  }
  function hasHighwayToll(text) {
    return HIGHWAY_TOLL_RX.test(String(text || ''));
  }

  function decorateCourierCards() {
    var app = $('courier-app');
    if (!app) return;

    /* أ) إضافة زرار الفلاش جوه مودال الكاميرا QR لو مفتوح */
    var qrBox = $('cp-qr-box');
    if (qrBox && !$('cp4-qr-torch')) {
      var torchBtn = document.createElement('button');
      torchBtn.type = 'button';
      torchBtn.id = 'cp4-qr-torch';
      torchBtn.className = 'cp4-pill';
      torchBtn.style.cssText = 'position:absolute;top:10px;left:10px;z-index:10;background:rgba(15,23,42,.82);color:#fff;border-color:#38bdf8';
      torchBtn.innerHTML = '🔦 كشاف الإضاءة';
      torchBtn.setAttribute('data-cp4-act', 'qr-torch');
      qrBox.appendChild(torchBtn);
    }

    /* ب) تزيين الكارت الرئيسي وكروت المشاوير */
    var cards = app.querySelectorAll('.cp-v12-card, .cpn-hero, .cp-txitem');
    cards.forEach(function (card) {
      if (card.dataset.cp4Decorated === '1') return;
      var dtlEl = card.querySelector('[data-tx]');
      var tx = dtlEl ? dtlEl.getAttribute('data-tx') : null;
      if (!tx) return;
      card.dataset.cp4Decorated = '1';

      var rawText = card.textContent || '';
      var isAsset = hasSensitiveAsset(rawText);
      var isToll = hasHighwayToll(rawText);

      var badgesHtml = '';
      if (isAsset) badgesHtml += '<span class="cp4-shield">🛡️ أصل مهم</span> ';
      if (isToll) badgesHtml += '<span class="cp4-toll">🛣️ طريق سريع / كارتة</span>';

      if (badgesHtml) {
        var bWrap = document.createElement('div');
        bWrap.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-top:6px';
        bWrap.innerHTML = badgesHtml;
        card.insertBefore(bWrap, card.firstChild.nextSibling);
      }

      /* شريط أزرار المرحلة 4 الميدانية السريعة على الكارت */
      var strip = document.createElement('div');
      strip.className = 'cp4-actions-strip';
      strip.innerHTML =
        '<button type="button" class="cp4-act-btn pri" data-cp4-act="open-collect" data-tx="' + eh(tx) + '" data-kind="tx">💳 تحصيل / إنستاباي / فكة</button>' +
        '<button type="button" class="cp4-act-btn" data-cp4-act="open-invoice" data-tx="' + eh(tx) + '">🧾 فاتورة وإيصال حراري</button>' +
        '<button type="button" class="cp4-act-btn wn" data-cp4-act="open-zeroblame" data-tx="' + eh(tx) + '">🛡️ العميل غير متاح</button>' +
        '<button type="button" class="cp4-act-btn pu" data-cp4-act="open-transfer" data-tx="' + eh(tx) + '" data-kind="tx">🤝 تحويل لزميل</button>';
      card.appendChild(strip);
    });

    /* ج) تزيين تيكتات الاستلام (pt73-courier-tickets) بدرع الأصول والتحصيل المرن والإيصال الحراري */
    var ptBox = $('pt73-courier-tickets');
    if (ptBox && ptBox.dataset.cp4Decorated !== '1') {
      ptBox.dataset.cp4Decorated = '1';
      var rows = ptBox.querySelectorAll(':scope > div');
      rows.forEach(function (row, idx) {
        if (idx === 0) return;
        var spanLtr = row.querySelector('span[dir="ltr"]');
        var sdId = spanLtr ? spanLtr.textContent.trim() : '';
        if (!sdId) return;
        var txt = row.textContent || '';
        var bHtml = '';
        if (hasSensitiveAsset(txt)) bHtml += '<span class="cp4-shield">🛡️ أصل مهم</span> ';
        if (hasHighwayToll(txt)) bHtml += '<span class="cp4-toll">🛣️ طريق سريع / كارتة</span>';
        if (bHtml) {
          var bw = document.createElement('div');
          bw.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-top:4px';
          bw.innerHTML = bHtml;
          row.appendChild(bw);
        }
        var act = document.createElement('div');
        act.className = 'cp4-actions-strip';
        act.innerHTML =
          '<button type="button" class="cp4-act-btn pri" data-cp4-act="open-collect" data-tx="' + eh(sdId) + '" data-kind="ticket">💳 تحصيل / إنستاباي / فكة</button>' +
          '<button type="button" class="cp4-act-btn" data-cp4-act="open-invoice" data-tx="' + eh(sdId) + '">🧾 فاتورة وإيصال حراري</button>' +
          '<button type="button" class="cp4-act-btn wn" data-cp4-act="open-zeroblame" data-tx="' + eh(sdId) + '">🛡️ العميل غير متاح</button>' +
          '<button type="button" class="cp4-act-btn pu" data-cp4-act="open-transfer" data-tx="' + eh(sdId) + '" data-kind="ticket">🤝 تحويل لزميل</button>';
        row.appendChild(act);
      });
    }
  }

  /* نافذة منبثقة موحدة للمرحلة 4 */
  function openP4Dialog(html) {
    closeP4Dialog();
    var wrap = document.createElement('div');
    wrap.id = 'cp4-dialog-root';
    wrap.className = 'cp4-overlay';
    wrap.innerHTML = '<div class="cp4-dialog" dir="rtl">' + html + '</div>';
    wrap.addEventListener('click', function (e) {
      if (e.target === wrap) closeP4Dialog();
    });
    document.body.appendChild(wrap);
  }
  function closeP4Dialog() {
    var old = $('cp4-dialog-root');
    if (old) old.remove();
  }

  /* 4) تثبيت ركنة الموتوسيكل (Motorcycle Parking Pin) */
  function handleParkingPin() {
    if (st.parkingPin && st.parkingPin.lat && st.parkingPin.lng) {
      openP4Dialog(
        '<h3 style="margin:0 0 8px;font-size:17px">🏍️ مكان ركنة الموتوسيكل المحفوظ</h3>' +
        '<p style="font-size:12.5px;color:var(--mu);margin:0 0 12px">اتحفظ الساعة ' + eh(st.parkingPin.time || '') + '</p>' +
        '<div style="display:flex;flex-direction:column;gap:8px">' +
          '<a class="cp-btn cp-go" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(st.parkingPin.lat + ',' + st.parkingPin.lng) + '&travelmode=walking" style="text-align:center;text-decoration:none">🗺️ افتح خريطة الرجوع للموتوسيكل</a>' +
          '<button type="button" class="cp-btn" data-cp4-act="parking-save-new">📍 تحديث مكان الركنة لموقعي الحالي</button>' +
          '<button type="button" class="cp-btn" data-cp4-act="parking-clear">🗑️ مسح الركنة</button>' +
          '<button type="button" class="cp-btn" data-cp4-act="dialog-close">إغلاق</button>' +
        '</div>'
      );
      return;
    }
    saveNewParkingPin();
  }

  function saveNewParkingPin() {
    if (!navigator.geolocation) return toast('الـ GPS غير مدعوم على هذا الجهاز', true);
    toast('📍 جاري حفظ مكان ركنة الموتوسيكل…');
    navigator.geolocation.getCurrentPosition(function (pos) {
      st.parkingPin = {
        lat: Number(pos.coords.latitude.toFixed(6)),
        lng: Number(pos.coords.longitude.toFixed(6)),
        time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
      };
      try { localStorage.setItem('cp_p4_parking_pin', JSON.stringify(st.parkingPin)); } catch (e) {}
      closeP4Dialog();
      renderTopToolkitBar();
      toast('🏍️ تم حفظ مكان ركنة الموتوسيكل بنجاح ✓');
    }, function () {
      toast('تعذر لقط الـ GPS — تأكد من تفعيل الموقع على الموبايل', true);
    }, { enableHighAccuracy: true, timeout: 7000 });
  }

  /* 5) وضع القيادة والرد التلقائي (Driving Mode & Auto-Reply) */
  async function toggleDrivingMode() {
    st.driving = !st.driving;
    renderTopToolkitBar();
    toast(st.driving ? '🛵 تم تفعيل وضع القيادة (يرسل رد تلقائي للمكتب لو بعتولك تنبيه)' : '🟢 تم إيقاف وضع القيادة');
    if (sbClient) {
      try { await sbClient.rpc('courier_p4_toggle_driving', { p_driving: st.driving }); } catch (e) {}
    }
  }

  /* 6) فلاش كاميرا مسح الـ QR (QR Camera Flashlight) */
  async function toggleQrFlashlight() {
    var vid = $('cp-qr-vid');
    if (!vid || !vid.srcObject) return toast('الكاميرا مش شغالة حالياً', true);
    var track = vid.srcObject.getVideoTracks()[0];
    if (!track) return toast('كشاف الكاميرا غير متاح على هذا الجهاز', true);
    try {
      st.torchOn = !st.torchOn;
      await track.applyConstraints({ advanced: [{ torch: st.torchOn }] });
      var b = $('cp4-qr-torch');
      if (b) b.innerHTML = st.torchOn ? '🔦 إطفاء الكشاف' : '🔦 كشاف الإضاءة';
    } catch (e) {
      toast('المتصفح على جهازك لا يدعم تشغيل الفلاش أثناء الكاميرا', true);
    }
  }

  /* 7) سجل الوصول بدون لوم + رابط إعادة الجدولة الذاتي للعميل الغائب */
  function openZeroBlameModal(tx) {
    openP4Dialog(
      '<h3 style="margin:0 0 6px;font-size:16.5px">🛡️ سجل وصول بدون لوم (' + eh(tx) + ')</h3>' +
      '<p style="font-size:12px;color:var(--mu);margin:0 0 12px">هنسجل وصولك بالوقت والـ GPS في سجل المعاملة والرادار عشان ميتحسبش عليك أي تأخير، وتقدر تبعت للعميل رابط/رسالة يختار ميعاد بديل:</p>' +
      '<div style="display:flex;flex-direction:column;gap:8px">' +
        '<button type="button" class="cp-btn cp-go" data-cp4-act="zb-submit" data-tx="' + eh(tx) + '" data-reason="no_answer">📞 وصلت والعميل لا يرد على الهاتف</button>' +
        '<button type="button" class="cp-btn cp-go" data-cp4-act="zb-submit" data-tx="' + eh(tx) + '" data-reason="not_home">🚪 وصلت والعميل غير متواجد بالعنوان</button>' +
        '<button type="button" class="cp-btn cp-go" data-cp4-act="zb-submit" data-tx="' + eh(tx) + '" data-reason="reschedule_asked">📅 العميل طلب تأجيل الموعد</button>' +
        '<button type="button" class="cp-btn" data-cp4-act="dialog-close">إلغاء</button>' +
      '</div>'
    );
  }

  async function submitZeroBlame(tx, reasonCode, btn) {
    if (btn) btn.disabled = true;
    var getPos = function () {
      return new Promise(function (resolve) {
        if (!navigator.geolocation) return resolve({ lat: null, lng: null });
        navigator.geolocation.getCurrentPosition(
          function (p) { resolve({ lat: Number(p.coords.latitude.toFixed(6)), lng: Number(p.coords.longitude.toFixed(6)) }); },
          function () { resolve({ lat: null, lng: null }); },
          { enableHighAccuracy: true, timeout: 4000 }
        );
      });
    };
    var pos = await getPos();
    try {
      var r = await sbClient.rpc('courier_p4_log_zero_blame', {
        p_tx: tx,
        p_reason_code: reasonCode,
        p_lat: pos.lat,
        p_lng: pos.lng
      });
      if (r.error) throw r.error;
      var d = r.data || {};
      var phone = String(d.phone || '').replace(/\D+/g, '');
      if (phone.startsWith('0')) phone = '2' + phone;
      var trackUrl = d.tracking_token
        ? (window.location.origin + '/tracking.html?token=' + encodeURIComponent(d.tracking_token) + '&reschedule=1')
        : '';
      var waMsg = 'أهلاً بحضرتك أ/ ' + (d.client_name || '') + ' من شركة تساهيل 🌟\n' +
        'مندوبنا وصل لحضرتك اليوم بخصوص المعاملة (' + tx + ') ولكن تعذر التواصل (' + (d.reason_label || '') + ').\n' +
        (trackUrl
          ? ('تقدر تحدد الميعاد الجديد المناسب ليك بنفسك من رابط التتبع المباشر:\n' + trackUrl)
          : 'ممكن تبعتلنا هنا اليوم والميعاد البديل المناسب لحضرتك (صباحي ١٠-٢ أو مسائي ٢-٦) وهنرتبه فوراً؟');

      openP4Dialog(
        '<h3 style="margin:0 0 8px;color:#10b981;font-size:16.5px">✓ اتسجل وصولك بدون لوم بالـ GPS</h3>' +
        '<p style="font-size:12.5px;color:var(--mu);margin:0 0 12px">ابعت دلوقتي رسالة إعادة الجدولة الذاتية للعميل على واتساب بضغطة واحدة:</p>' +
        '<div style="display:flex;flex-direction:column;gap:8px">' +
          (phone ? '<a class="cp-btn cp-go" target="_blank" rel="noopener" href="https://wa.me/' + eh(phone) + '?text=' + encodeURIComponent(waMsg) + '" style="text-align:center;text-decoration:none">💬 إرسال رابط/رسالة إعادة الجدولة واتساب</a>' : '') +
          '<button type="button" class="cp-btn" data-cp4-act="dialog-close">تم</button>' +
        '</div>'
      );
      loadMyP4State(true);
    } catch (e) {
      if (btn) btn.disabled = false;
      toast((e && e.message) || 'تعذر تسجيل الوصول', true);
    }
  }

  /* 8) التحويل يد بيد بين المناديب (Hand-to-Hand Courier Transfer) */
  function openTransferModal(tx, kind) {
    var peers = (st.p4 && Array.isArray(st.p4.peer_couriers)) ? st.p4.peer_couriers : [];
    var opts = peers.length
      ? peers.map(function (p) { return '<option value="' + p.id + '">' + eh(p.name) + '</option>'; }).join('')
      : '<option value="">لا يوجد مناديب آخرين نشطين حالياً</option>';
    openP4Dialog(
      '<h3 style="margin:0 0 6px;font-size:16.5px">🤝 تحويل يد بيد لزميل (' + eh(tx) + ')</h3>' +
      '<p style="font-size:12px;color:var(--mu);margin:0 0 10px">اختر المندوب الزميل اللي هتسلّمه المعاملة في الطريق، وهيوصل له إشعار يضغط «استلمت» فتتنقل باسمه فوراً:</p>' +
      '<label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px">المندوب المستلم</label>' +
      '<select id="cp4-tr-peer" class="cp-field" style="margin-bottom:10px">' + opts + '</select>' +
      '<label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px">السبب / مكان المقابلة (اختياري)</label>' +
      '<input id="cp4-tr-reason" type="text" class="cp-field" placeholder="مثال: تقابلنا في العباسية / تقسيم خط السير" style="margin-bottom:12px">' +
      '<div style="display:flex;gap:8px">' +
        '<button type="button" class="cp-btn cp-go" style="flex:1" data-cp4-act="tr-send" data-tx="' + eh(tx) + '" data-kind="' + eh(kind || 'tx') + '">إرسال طلب التحويل</button>' +
        '<button type="button" class="cp-btn" data-cp4-act="dialog-close">إلغاء</button>' +
      '</div>'
    );
  }

  async function sendPeerTransfer(tx, kind, btn) {
    var peerId = Number(($('cp4-tr-peer') || {}).value || 0);
    var reason = (($('cp4-tr-reason') || {}).value || '').trim();
    if (!peerId) return toast('اختر المندوب الزميل أولاً', true);
    if (btn) btn.disabled = true;
    try {
      var r = await sbClient.rpc('courier_p4_request_transfer', {
        p_item_kind: kind || 'tx',
        p_tx: tx,
        p_to_courier_id: peerId,
        p_reason: reason
      });
      if (r.error) throw r.error;
      closeP4Dialog();
      toast('🤝 اتبعت طلب التحويل لزميلك ' + ((r.data && r.data.to_courier_name) || '') + ' ✓');
      loadMyP4State(true);
    } catch (e) {
      if (btn) btn.disabled = false;
      toast((e && e.message) || 'تعذر إرسال التحويل', true);
    }
  }

  async function respondPeerTransfer(transferId, decision, btn) {
    if (btn) btn.disabled = true;
    try {
      var r = await sbClient.rpc('courier_p4_respond_transfer', {
        p_transfer_id: Number(transferId),
        p_decision: decision
      });
      if (r.error) throw r.error;
      toast(decision === 'accepted' ? '✓ تم استلام المشوار ونقله لعهدتك' : 'تم رفض التحويل');
      await loadMyP4State(true);
    } catch (e) {
      if (btn) btn.disabled = false;
      toast((e && e.message) || 'تعذر تنفيذ العملية', true);
    }
  }

  /* 9) الختم الرقمي لاستلام أوراق المكتب من المندوب (Office Receiver Digital Sign-Off) */
  function openOfficeDigitalSignoffModal() {
    var staff = (st.p4 && Array.isArray(st.p4.staff_list)) ? st.p4.staff_list : [];
    var staffOpts = staff.length
      ? staff.map(function (s) { return '<option value="' + eh(s.id) + '">' + eh(s.name) + '</option>'; }).join('')
      : '<option value="">لا يوجد موظفين متاحين</option>';

    /* جمع المعاملات والتيكتات الظاهرة في البوابة لاختيارها بضغطة واحدة */
    var txSet = {};
    var txList = [];
    document.querySelectorAll('#courier-app [data-tx]').forEach(function (el) {
      var code = el.getAttribute('data-tx');
      if (code && !txSet[code]) {
        txSet[code] = true;
        var card = el.closest('.cp-v12-card, .cp-txitem, .cpn-hero, .cp-card');
        var nameEl = card ? card.querySelector('b, .cp-name') : null;
        txList.push({ tx: code, label: (nameEl ? nameEl.textContent.trim() : code) });
      }
    });
    document.querySelectorAll('#pt73-courier-tickets span[dir="ltr"]').forEach(function (el) {
      var code = el.textContent.trim();
      if (code && !txSet[code]) {
        txSet[code] = true;
        var bEl = el.parentElement ? el.parentElement.querySelector('b') : null;
        txList.push({ tx: code, label: (bEl ? bEl.textContent.trim() : code) });
      }
    });

    var handovers = (st.p4 && Array.isArray(st.p4.handovers_today)) ? st.p4.handovers_today : [];
    var prevHtml = handovers.length
      ? '<div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--bd)">' +
          '<b style="font-size:12px;color:#10b981">✓ أختام الاستلام الرقمية اليوم (' + handovers.length + '):</b>' +
          handovers.map(function (h) {
            return '<div style="font-size:11.5px;padding:6px 8px;margin-top:5px;border-radius:10px;background:var(--fld)">' +
              '<b>🔏 ' + eh(h.stamp_code) + '</b> — استلمها: <b>' + eh(h.receiver_name) + '</b>' +
              '<div style="color:var(--mu);font-size:11px" dir="ltr">' + eh((h.transaction_ids || []).join(' , ')) + '</div>' +
            '</div>';
          }).join('') +
        '</div>'
      : '';

    openP4Dialog(
      '<h3 style="margin:0 0 6px;font-size:16.5px">🔏 تسليم الأوراق للمكتب بالختم الرقمي</h3>' +
      '<p style="font-size:12px;color:var(--mu);margin:0 0 10px">حدد الأوراق/الجوازات اللي بتسلمها للمكتب، وخلي موظف الاستلام يختار اسمه ويكتب كود ختمه الرقمي (٤ أرقام) لإخلاء عهدتك فوراً:</p>' +
      '<div style="max-height:150px;overflow-y:auto;margin-bottom:10px;padding:6px;border-radius:12px;background:var(--fld);border:1px solid var(--bd)">' +
        (txList.length ? txList.map(function (item) {
          return '<label style="display:flex;align-items:center;gap:8px;padding:6px 4px;font-size:12.5px;cursor:pointer;border-bottom:1px dashed rgba(255,255,255,.07)">' +
            '<input type="checkbox" class="cp4-ho-chk" value="' + eh(item.tx) + '" data-label="' + eh(item.label) + '" checked>' +
            '<span style="flex:1"><b>' + eh(item.label) + '</b> <small dir="ltr" style="color:var(--mu)">(' + eh(item.tx) + ')</small></span>' +
          '</label>';
        }).join('') : '<div style="font-size:12px;color:var(--mu);padding:6px">اكتب رقم المعاملة يدوياً في الملاحظة أو حدث الصفحة</div>') +
      '</div>' +
      '<label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px">موظف المكتب المستلم</label>' +
      '<select id="cp4-ho-staff" class="cp-field" style="margin-bottom:10px">' + staffOpts + '</select>' +
      '<label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px">كود الختم الرقمي للموظف (٤ أرقام)</label>' +
      '<input id="cp4-ho-pin" type="password" inputmode="numeric" maxlength="4" dir="ltr" class="cp-field" placeholder="•••• (الافتراضي لأول مرة 1234)" style="text-align:center;font-size:18px;letter-spacing:6px;margin-bottom:10px">' +
      '<input id="cp4-ho-notes" type="text" class="cp-field" placeholder="ملاحظة إضافية (اختياري: عدد الجوازات أو الأصول)" style="margin-bottom:12px">' +
      '<div style="display:flex;gap:8px">' +
        '<button type="button" class="cp-btn cp-go" style="flex:1" data-cp4-act="ho-submit">🔏 ختم وتأكيد الاستلام</button>' +
        '<button type="button" class="cp-btn" data-cp4-act="dialog-close">إغلاق</button>' +
      '</div>' +
      prevHtml
    );
  }

  async function submitOfficeDigitalSignoff(btn) {
    var staffId = (($('cp4-ho-staff') || {}).value || '').trim();
    var pin = (($('cp4-ho-pin') || {}).value || '').trim();
    var notes = (($('cp4-ho-notes') || {}).value || '').trim();
    var txIds = [];
    var summary = [];
    document.querySelectorAll('.cp4-ho-chk:checked').forEach(function (el) {
      txIds.push(el.value);
      summary.push({ tx: el.value, client_name: el.dataset.label || el.value });
    });
    if (!txIds.length && notes) {
      txIds.push(notes.split(/\s+/)[0]);
    }
    if (!staffId) return toast('اختر موظف المكتب المستلم', true);
    if (!/^[0-9]{4}$/.test(pin)) return toast('كود الختم الرقمي للموظف لازم يكون ٤ أرقام', true);
    if (!txIds.length) return toast('اختر معاملة واحدة على الأقل لتسليم ورقها', true);

    if (btn) btn.disabled = true;
    try {
      var r = await sbClient.rpc('courier_p4_office_digital_signoff', {
        p_receiver_id: staffId,
        p_pin: pin,
        p_tx_ids: txIds,
        p_items_summary: summary,
        p_notes: notes
      });
      if (r.error) throw r.error;
      var d = r.data || {};
      toast('🔏 تم الختم الرقمي بنجاح (' + (d.stamp_code || '') + ') باسم ' + (d.receiver_name || ''));
      await loadMyP4State(true);
      openOfficeDigitalSignoffModal();
    } catch (e) {
      if (btn) btn.disabled = false;
      toast((e && e.message) || 'تعذر تنفيذ الختم الرقمي', true);
    }
  }

  /* 10) التحصيل المالي المرن: تحويل فوري كاش -> إنستاباي + الدفع الجزئي + حاسبة الفكة السريعة */
  async function openFlexibleCollectionModal(tx, kind) {
    if (st.p4 && st.p4.day_locked) {
      return toast('🔒 اليوم مقفل ومؤكد من الإدارة — لا يمكن تعديل التحصيل بعد التقفيل', true);
    }
    openP4Dialog('<div style="text-align:center;padding:18px">جاري تحميل بيانات التحصيل للمعاملة <b dir="ltr">' + eh(tx) + '</b>…</div>');
    var inv = null;
    try {
      var r = await sbClient.rpc('courier_p4_client_invoice', { p_tx: tx });
      if (!r.error && r.data) inv = r.data;
    } catch (e) {}

    var due = Number((inv && inv.total_due) || 0);
    st.calcDue = due;
    st.calcPaid = due;

    openP4Dialog(
      '<h3 style="margin:0 0 6px;font-size:16.5px">💳 التحصيل المرن وحاسبة الفكة (' + eh(tx) + ')</h3>' +
      '<div style="font-size:12.5px;color:var(--mu);margin-bottom:10px">العميل: <b>' + eh((inv && inv.client_name) || tx) + '</b> · المطلوب: <b style="color:#10b981">' + money(due) + '</b></div>' +
      '<label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px">طريقة التحصيل الفعلية</label>' +
      '<select id="cp4-col-mode" class="cp-field" style="margin-bottom:10px">' +
        '<option value="cash_full">💵 كاش كامل (' + money(due) + ')</option>' +
        '<option value="instapay_switch">⚡ تحويل فوري من كاش إلى إنستاباي (يتشال من عهدة الكاش)</option>' +
        '<option value="partial_cash">🌓 دفع جزئي (كاش)</option>' +
        '<option value="partial_instapay">🌓 دفع جزئي (إنستاباي)</option>' +
      '</select>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">' +
        '<div><label style="display:block;font-size:11.5px;color:var(--mu);margin-bottom:3px">إجمالي المطلوب</label>' +
          '<input id="cp4-col-orig" type="number" class="cp-field" value="' + due + '"></div>' +
        '<div><label style="display:block;font-size:11.5px;color:var(--mu);margin-bottom:3px">المبلغ المحصل فعلياً</label>' +
          '<input id="cp4-col-paid" type="number" class="cp-field" value="' + due + '"></div>' +
      '</div>' +
      '<input id="cp4-col-ref" type="text" class="cp-field" placeholder="مرجع إنستاباي (اسم المحوّل أو آخر ٤ أرقام — بدون صور)" style="margin-bottom:10px">' +
      /* حاسبة الفكة السريعة (Quick Change Calculator) */
      '<div style="padding:10px;border-radius:12px;background:var(--fld);border:1px solid var(--bd);margin-bottom:12px">' +
        '<div style="font-size:12px;font-weight:800;margin-bottom:6px">🧮 حاسبة الفكة السريعة (العميل ادّالك كام؟)</div>' +
        '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px">' +
          [200, 400, 500, 600, 1000, 2000].map(function (n) {
            return '<button type="button" class="cp4-act-btn" data-cp4-act="calc-cash" data-given="' + n + '">' + n + ' ج</button>';
          }).join('') +
        '</div>' +
        '<div id="cp4-calc-out" style="font-size:13px;font-weight:800;color:#10b981">اختر المبلغ اللي استلمته من العميل لحساب الباقي فوراً</div>' +
      '</div>' +
      '<div style="display:flex;gap:8px">' +
        '<button type="button" class="cp-btn cp-go" style="flex:1" data-cp4-act="col-save" data-tx="' + eh(tx) + '" data-kind="' + eh(kind || 'tx') + '">حفظ التحصيل ✓</button>' +
        '<button type="button" class="cp-btn" data-cp4-act="open-invoice" data-tx="' + eh(tx) + '">🧾 إيصال حراري</button>' +
        '<button type="button" class="cp-btn" data-cp4-act="dialog-close">إغلاق</button>' +
      '</div>'
    );
  }

  async function saveFlexibleCollection(tx, kind, btn) {
    var mode = (($('cp4-col-mode') || {}).value || 'cash_full');
    var orig = Number(($('cp4-col-orig') || {}).value || 0);
    var paid = Number(($('cp4-col-paid') || {}).value || 0);
    var ref = (($('cp4-col-ref') || {}).value || '').trim();
    if (btn) btn.disabled = true;
    try {
      var r = await sbClient.rpc('courier_p4_record_collection', {
        p_item_kind: kind || 'tx',
        p_tx: tx,
        p_original_amount: orig,
        p_collected_amount: paid,
        p_payment_mode: mode,
        p_instapay_ref: ref,
        p_notes: null
      });
      if (r.error) throw r.error;
      toast('✓ تم حفظ التحصيل وتحديث عهدة الكاش فوراً');
      await loadMyP4State(true);
      openClientInvoiceAndReceiptModal(tx, paid, mode, ref);
    } catch (e) {
      if (btn) btn.disabled = false;
      toast((e && e.message) || 'تعذر حفظ التحصيل', true);
    }
  }

  /* 11) تفصيل رسوم العميل بدون عمولة + الإيصال الحراري بالمشاركة المباشرة (Web Share API -> WhatsApp) */
  async function openClientInvoiceAndReceiptModal(tx, overridePaid, overrideMode, overrideRef) {
    openP4Dialog('<div style="text-align:center;padding:18px">جاري تجهيز الفاتورة والإيصال الحراري…</div>');
    var inv = null;
    try {
      var r = await sbClient.rpc('courier_p4_client_invoice', { p_tx: tx });
      if (!r.error && r.data) inv = r.data;
    } catch (e) {}

    var clientName = (inv && inv.client_name) || 'عميل تساهيل';
    var items = (inv && Array.isArray(inv.items)) ? inv.items : [];
    var totalDue = Number((inv && inv.total_due) || 0);
    var paidAmt = overridePaid != null ? Number(overridePaid) : totalDue;
    var remAmt = Math.max(0, totalDue - paidAmt);
    var modeLabel = overrideMode === 'instapay_switch' ? 'إنستاباي بالكامل'
      : overrideMode === 'partial_cash' ? 'دفع جزئي (كاش)'
      : overrideMode === 'partial_instapay' ? 'دفع جزئي (إنستاباي)'
      : ((inv && inv.payment_method) || 'كاش');

    var rowsHtml = items.length
      ? items.map(function (it) {
          var nm = it.service_name || it.service || 'خدمة';
          var q = Number(it.qty || 1);
          var lt = Number(it.line_total || it.total || 0);
          return '<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px dashed #cbd5e1;font-size:12.5px">' +
            '<span>' + eh(nm) + ' × ' + q + '</span>' +
            '<b>' + (lt > 0 ? money(lt) : 'مشمول') + '</b>' +
          '</div>';
        }).join('')
      : '<div style="font-size:12.5px;padding:5px 0">خدمات حكومية وتصديقات</div>';

    window.__cp4CurrentReceipt = {
      tx: tx,
      client_name: clientName,
      phone: (inv && inv.phone) || '',
      items: items,
      total_due: totalDue,
      paid_amount: paidAmt,
      remaining_amount: remAmt,
      payment_mode: modeLabel,
      instapay_ref: overrideRef || '',
      courier_name: (inv && inv.courier_name) || ((st.p4 && st.p4.courier_name) || 'مندوب تساهيل'),
      date_str: new Date().toLocaleString('ar-EG')
    };

    openP4Dialog(
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">' +
        '<b style="font-size:15.5px">🧾 فاتورة وإيصال العميل (بدون عمولة)</b>' +
        '<button type="button" class="cp4-act-btn" data-cp4-act="dialog-close">✕</button>' +
      '</div>' +
      '<div class="cp4-thermal" dir="rtl">' +
        '<div style="text-align:center;border-bottom:2px dashed #0f172a;padding-bottom:8px;margin-bottom:8px">' +
          '<div style="font-size:18px;font-weight:900">تساهيل للخدمات الحكومية</div>' +
          '<div style="font-size:11px;color:#475569">إيصال تحصيل واستلام رقمي</div>' +
          '<div style="font-size:11.5px;font-weight:800;margin-top:3px" dir="ltr">' + eh(tx) + '</div>' +
        '</div>' +
        '<div style="font-size:12px;margin-bottom:8px">' +
          '<div>العميل: <b>' + eh(clientName) + '</b></div>' +
          '<div>التاريخ: ' + eh(window.__cp4CurrentReceipt.date_str) + '</div>' +
          '<div>المندوب: ' + eh(window.__cp4CurrentReceipt.courier_name) + '</div>' +
        '</div>' +
        '<div style="border-top:1px solid #0f172a;padding-top:6px;margin-bottom:8px">' + rowsHtml + '</div>' +
        '<div style="border-top:2px dashed #0f172a;padding-top:8px;font-size:13px">' +
          '<div style="display:flex;justify-content:space-between"><span>إجمالي المطلوب:</span><b>' + money(totalDue) + '</b></div>' +
          '<div style="display:flex;justify-content:space-between;color:#059669"><span>المدفوع (' + eh(modeLabel) + '):</span><b>' + money(paidAmt) + '</b></div>' +
          (remAmt > 0 ? '<div style="display:flex;justify-content:space-between;color:#dc2626"><span>المتبقي:</span><b>' + money(remAmt) + '</b></div>' : '') +
        '</div>' +
        '<div style="text-align:center;font-size:10.5px;color:#64748b;margin-top:10px">شكراً لثقتكم في تساهيل ✓</div>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">' +
        '<button type="button" class="cp-btn cp-go" data-cp4-act="share-thermal">📤 مشاركة الإيصال الحراري مباشرة (واتساب / Web Share)</button>' +
        '<button type="button" class="cp-btn" data-cp4-act="dialog-close">إغلاق</button>' +
      '</div>'
    );
  }

  /* رسم الإيصال الحراري على Canvas في الذاكرة ومشاركته كصورة عبر Web Share API بدون حفظ على السيرفر */
  async function shareThermalReceiptImage(btn) {
    var rc = window.__cp4CurrentReceipt;
    if (!rc) return;
    if (btn) btn.disabled = true;
    try {
      var cv = document.createElement('canvas');
      var linesCount = Math.max(1, (rc.items && rc.items.length) || 1);
      cv.width = 640;
      cv.height = 480 + linesCount * 42;
      var ctx = cv.getContext('2d');

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, cv.width, cv.height);

      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 6]);
      ctx.strokeRect(18, 18, cv.width - 36, cv.height - 36);
      ctx.setLineDash([]);

      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'center';
      ctx.font = 'bold 30px Cairo, sans-serif';
      ctx.fillText('تساهيل للخدمات الحكومية', cv.width / 2, 70);

      ctx.font = '600 18px Cairo, sans-serif';
      ctx.fillStyle = '#475569';
      ctx.fillText('إيصال تحصيل واستلام رقمي — ' + rc.tx, cv.width / 2, 105);

      ctx.strokeStyle = '#94a3b8';
      ctx.beginPath(); ctx.moveTo(40, 125); ctx.lineTo(cv.width - 40, 125); ctx.stroke();

      ctx.textAlign = 'right';
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 20px Cairo, sans-serif';
      ctx.fillText('العميل: ' + rc.client_name, cv.width - 45, 162);
      ctx.font = '17px Cairo, sans-serif';
      ctx.fillText('التاريخ: ' + rc.date_str, cv.width - 45, 192);
      ctx.fillText('المندوب: ' + rc.courier_name, cv.width - 45, 222);

      ctx.beginPath(); ctx.moveTo(40, 242); ctx.lineTo(cv.width - 40, 242); ctx.stroke();

      var y = 278;
      var list = (rc.items && rc.items.length) ? rc.items : [{ service_name: 'خدمات حكومية', qty: 1, line_total: rc.total_due }];
      list.forEach(function (it) {
        var nm = (it.service_name || it.service || 'خدمة') + ' × ' + Number(it.qty || 1);
        var lt = Number(it.line_total || it.total || 0);
        ctx.textAlign = 'right';
        ctx.font = 'bold 18px Cairo, sans-serif';
        ctx.fillText(nm.slice(0, 36), cv.width - 45, y);
        ctx.textAlign = 'left';
        ctx.fillText(lt > 0 ? money(lt) : 'مشمول', 45, y);
        y += 40;
      });

      ctx.beginPath(); ctx.moveTo(40, y - 12); ctx.lineTo(cv.width - 40, y - 12); ctx.stroke();
      y += 26;

      ctx.textAlign = 'right';
      ctx.font = 'bold 22px Cairo, sans-serif';
      ctx.fillStyle = '#0f172a';
      ctx.fillText('إجمالي المطلوب: ' + money(rc.total_due), cv.width - 45, y);
      y += 36;
      ctx.fillStyle = '#059669';
      ctx.fillText('المدفوع (' + rc.payment_mode + '): ' + money(rc.paid_amount), cv.width - 45, y);
      if (rc.remaining_amount > 0) {
        y += 34;
        ctx.fillStyle = '#dc2626';
        ctx.fillText('المتبقي: ' + money(rc.remaining_amount), cv.width - 45, y);
      }

      ctx.textAlign = 'center';
      ctx.font = 'bold 16px Cairo, sans-serif';
      ctx.fillStyle = '#64748b';
      ctx.fillText('شكراً لثقتكم في شركة تساهيل ✓', cv.width / 2, cv.height - 40);

      var blob = await new Promise(function (resolve) { cv.toBlob(resolve, 'image/png'); });
      var file = new File([blob], 'tasahel-receipt-' + rc.tx + '.png', { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'إيصال تساهيل — ' + rc.tx,
          text: 'إيصال رقمي من شركة تساهيل للمعاملة ' + rc.tx + ' (' + rc.client_name + ')',
          files: [file]
        });
        toast('✓ تمت مشاركة الإيصال الحراري بنجاح');
      } else {
        /* لو المتصفح على الكمبيوتر لا يدعم مشاركة الملفات، نفتح واتساب العميل مباشرة مع تحميل سريع للصورة */
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'tasahel-receipt-' + rc.tx + '.png';
        a.click();
        setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
        if (rc.phone) {
          var ph = String(rc.phone).replace(/\D+/g, '');
          if (ph.startsWith('0')) ph = '2' + ph;
          var txt = 'شركة تساهيل للخدمات الحكومية\nإيصال رقمي للمعاملة: ' + rc.tx + '\nالعميل: ' + rc.client_name + '\nالمدفوع (' + rc.payment_mode + '): ' + money(rc.paid_amount) + (rc.remaining_amount > 0 ? '\nالمتبقي: ' + money(rc.remaining_amount) : '') + '\nشكراً لثقتكم في تساهيل ✓';
          window.open('https://wa.me/' + ph + '?text=' + encodeURIComponent(txt), '_blank', 'noopener');
        }
      }
    } catch (e) {
      if (e && e.name !== 'AbortError') toast('تعذرت المشاركة المباشرة', true);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  /* 12) مصافحة تقفيل الكاش آخر اليوم وقفل ما بعد التقفيل (بدون عدّ فئات الورق) */
  async function openEndOfDayCashClosingModal() {
    await loadMyP4State(true);
    var totals = (st.p4 && st.p4.cash_totals) || { expected_cash: 0, instapay_total: 0, partial_remaining_total: 0 };
    var closeObj = st.p4 && st.p4.closing;
    var locked = !!(st.p4 && st.p4.day_locked);

    var statusBanner = locked
      ? '<div style="padding:10px 12px;border-radius:12px;background:rgba(16,185,129,.18);border:1px solid #10b981;color:#10b981;font-size:12.5px;font-weight:800;margin-bottom:12px">🔒 تم استلام وتأكيد تقفيل اليوم من الإدارة (' + eh(closeObj.confirmed_by_name || 'المكتب') + ') — حساب اليوم مقفل لحماية عهدتك.</div>'
      : (closeObj && closeObj.status === 'submitted'
          ? '<div style="padding:10px 12px;border-radius:12px;background:rgba(245,158,11,.18);border:1px solid #f59e0b;color:#fbbf24;font-size:12.5px;font-weight:800;margin-bottom:12px">⏳ تم إرسال تقفيل اليوم للمكتب وبانتظار ضغطة «تأكيد الاستلام» من الإدارة.</div>'
          : '');

    openP4Dialog(
      '<h3 style="margin:0 0 6px;font-size:16.5px">💰 مصافحة تقفيل الكاش آخر اليوم</h3>' +
      '<p style="font-size:12px;color:var(--mu);margin:0 0 12px">السيستم جمعلك صافي الكاش المطلوب منك النهارده جاهز (بعد خصم أي تحويلات إنستاباي أو متبقي دفع جزئي):</p>' +
      statusBanner +
      '<div style="display:grid;grid-template-columns:1fr;gap:8px;margin-bottom:12px">' +
        '<div style="padding:14px;border-radius:14px;background:rgba(16,185,129,.14);border:1px solid rgba(16,185,129,.4);display:flex;justify-content:space-between;align-items:center">' +
          '<span style="font-size:13px;font-weight:700">💵 صافي الكاش المطلوب تسليمه للمكتب:</span>' +
          '<b style="font-size:20px;color:#10b981">' + money(totals.expected_cash) + '</b>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
          '<div style="padding:10px;border-radius:12px;background:var(--fld);border:1px solid var(--bd)">' +
            '<div style="font-size:11px;color:var(--mu)">⚡ محوّل إنستاباي اليوم</div>' +
            '<b style="font-size:14.5px;color:#c4b5fd">' + money(totals.instapay_total) + '</b>' +
          '</div>' +
          '<div style="padding:10px;border-radius:12px;background:var(--fld);border:1px solid var(--bd)">' +
            '<div style="font-size:11px;color:var(--mu)">🌓 متبقي دفع جزئي</div>' +
            '<b style="font-size:14.5px;color:#fbbf24">' + money(totals.partial_remaining_total) + '</b>' +
          '</div>' +
        '</div>' +
      '</div>' +
      (locked ? '' :
        '<input id="cp4-close-note" type="text" class="cp-field" value="' + eh((closeObj && closeObj.courier_note) || '') + '" placeholder="ملاحظة للمحاسب مع التقفيل (اختياري)" style="margin-bottom:12px">' +
        '<button type="button" class="cp-btn cp-go" style="width:100%;margin-bottom:8px" data-cp4-act="close-submit">🚀 إرسال تقفيل اليوم للمكتب بضغطة واحدة</button>') +
      '<button type="button" class="cp-btn" style="width:100%" data-cp4-act="dialog-close">إغلاق</button>'
    );
  }

  async function submitEndOfDayCashClosing(btn) {
    var note = (($('cp4-close-note') || {}).value || '').trim();
    if (btn) btn.disabled = true;
    try {
      var r = await sbClient.rpc('courier_p4_submit_cash_closing', { p_note: note });
      if (r.error) throw r.error;
      toast('🚀 تم إرسال تقفيل الكاش للمكتب بنجاح ✓');
      await loadMyP4State(true);
      openEndOfDayCashClosingModal();
    } catch (e) {
      if (btn) btn.disabled = false;
      toast((e && e.message) || 'تعذر إرسال التقفيل', true);
    }
  }

  /* 13) لوحة المكتب والرادار للمرحلة 4 (تأكيد تقفيل الكاش + الختم الرقمي للموظف + سجل الوصول بدون لوم) */
  async function loadAndRenderStaffRadarP4(force) {
    if (!sbClient || !isAllowedStaff()) return;
    var pane = $('ah-pane-ops3') || $('tab-radar');
    if (!pane) return;
    if (!force && st.staffLoadedAt && (Date.now() - st.staffLoadedAt < 45000)) {
      renderStaffRadarP4Section();
      return;
    }
    try {
      var r = await sbClient.rpc('radar_p4_office_snapshot', { p_day: todayCairo() });
      if (!r.error && r.data) {
        st.staffSnap = r.data;
        st.staffLoadedAt = Date.now();
        renderStaffRadarP4Section();
      }
    } catch (e) {}
  }

  function renderStaffRadarP4Section() {
    var host = $('ah-pane-ops3') || $('tab-radar');
    if (!host || !st.staffSnap) return;
    var box = $('cp4-office-radar-box');
    if (!box) {
      box = document.createElement('section');
      box.id = 'cp4-office-radar-box';
      box.className = 'ah-card';
      box.style.marginTop = '14px';
      host.appendChild(box);
    }
    var d = st.staffSnap;
    var handshakes = Array.isArray(d.handshakes) ? d.handshakes : [];
    var handovers = Array.isArray(d.handovers) ? d.handovers : [];
    var zeroBlame = Array.isArray(d.zero_blame) ? d.zero_blame : [];
    var gates = Array.isArray(d.gates) ? d.gates : [];

    var drivingCouriers = gates.filter(function (g) { return g.driving_mode; });

    box.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:12px">' +
        '<div>' +
          '<b style="font-size:15px">🔏 المرحلة 4: الأختام الرقمية لاستلام الأوراق + مصافحة تقفيل الكاش + سجل الوصول بدون لوم</b>' +
          '<div style="font-size:12px;color:var(--mu)">تظهر هنا كل الأوراق المختومة رقمياً وتقفيلات كاش آخر اليوم لتأكيدها بضغطة واحدة</div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:6px">' +
          '<span style="font-size:12px;font-weight:700">كود ختمك الرقمي (٤ أرقام):</span>' +
          '<input id="cp4-staff-my-pin" type="text" maxlength="4" dir="ltr" value="' + eh(d.my_pin || '1234') + '" style="width:74px;text-align:center;font-weight:800;padding:5px 8px;border-radius:8px;border:1px solid var(--bd);background:var(--fld);color:var(--tx)">' +
          '<button type="button" class="ah-btn" data-cp4-act="staff-save-pin">حفظ كودي</button>' +
          '<button type="button" class="ah-btn" data-cp4-act="staff-refresh-p4">تحديث ↻</button>' +
        '</div>' +
      '</div>' +

      (drivingCouriers.length
        ? '<div style="padding:8px 12px;border-radius:10px;background:rgba(239,68,68,.14);border:1px solid rgba(239,68,68,.35);margin-bottom:10px;font-size:12px">' +
            '<b>🛵 مناديب في وضع القيادة حالياً (الرد التلقائي مفعّل):</b> ' +
            drivingCouriers.map(function (g) { return eh(g.courier_name); }).join(' ، ') +
          '</div>'
        : '') +

      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:12px">' +
        /* 1) مصافحة تقفيل الكاش آخر اليوم */
        '<div style="padding:12px;border-radius:12px;background:var(--fld);border:1px solid var(--bd)">' +
          '<b style="font-size:13.5px;display:block;margin-bottom:8px">💰 مصافحة تقفيل كاش المناديب اليوم (' + handshakes.length + ')</b>' +
          (handshakes.length ? handshakes.map(function (hs) {
            var isConf = hs.status === 'confirmed';
            return '<div style="padding:8px 0;border-top:1px solid var(--bd);font-size:12px">' +
              '<div style="display:flex;justify-content:space-between;align-items:center">' +
                '<b>' + eh(hs.courier_name) + '</b>' +
                '<span style="font-weight:800;color:' + (isConf ? '#10b981' : '#f59e0b') + '">' + money(hs.expected_cash) + ' كاش</span>' +
              '</div>' +
              '<div style="font-size:11px;color:var(--mu);margin-top:2px">إنستاباي: ' + money(hs.instapay_total) + ' · متبقي جزئي: ' + money(hs.partial_remaining_total) + '</div>' +
              (hs.courier_note ? '<div style="font-size:11px;color:#38bdf8">ملاحظة: ' + eh(hs.courier_note) + '</div>' : '') +
              '<div style="margin-top:6px;display:flex;justify-content:space-between;align-items:center">' +
                (isConf
                  ? '<span style="color:#10b981;font-weight:700">🔒 مؤكد ومقفل (' + eh(hs.confirmed_by_name || '') + ')</span>' +
                    '<button type="button" class="cp4-act-btn" data-cp4-act="staff-reopen-hs" data-id="' + hs.id + '">إعادة فتح</button>'
                  : '<button type="button" class="cp4-act-btn pri" data-cp4-act="staff-confirm-hs" data-id="' + hs.id + '">✓ تأكيد استلام الكاش وقفل اليوم</button>') +
              '</div>' +
            '</div>';
          }).join('') : '<div style="font-size:12px;color:var(--mu)">لم يرسل أي مندوب تقفيل الكاش بعد اليوم</div>') +
        '</div>' +

        /* 2) سجل الأختام الرقمية لاستلام الأوراق بالمكتب */
        '<div style="padding:12px;border-radius:12px;background:var(--fld);border:1px solid var(--bd)">' +
          '<b style="font-size:13.5px;display:block;margin-bottom:8px">🔏 أختام استلام الأوراق بالمكتب اليوم (' + handovers.length + ')</b>' +
          (handovers.length ? handovers.map(function (ho) {
            return '<div style="padding:8px 0;border-top:1px solid var(--bd);font-size:12px">' +
              '<div><b>' + eh(ho.stamp_code) + '</b> · المندوب: <b>' + eh(ho.courier_name) + '</b></div>' +
              '<div style="color:#10b981;font-weight:700">✓ استلمها بالمكتب: ' + eh(ho.receiver_name) + '</div>' +
              '<div style="font-size:11px;color:var(--mu)" dir="ltr">' + eh((ho.transaction_ids || []).join(' , ')) + '</div>' +
            '</div>';
          }).join('') : '<div style="font-size:12px;color:var(--mu)">لا توجد أختام استلام أوراق مسجلة اليوم</div>') +
        '</div>' +

        /* 3) سجل الوصول بدون لوم */
        '<div style="padding:12px;border-radius:12px;background:var(--fld);border:1px solid var(--bd)">' +
          '<b style="font-size:13.5px;display:block;margin-bottom:8px">🛡️ سجل الوصول بدون لوم اليوم (' + zeroBlame.length + ')</b>' +
          (zeroBlame.length ? zeroBlame.map(function (zb) {
            return '<div style="padding:8px 0;border-top:1px solid var(--bd);font-size:12px">' +
              '<div><b>' + eh(zb.client_name || zb.transaction_id) + '</b> <span dir="ltr">(' + eh(zb.transaction_id) + ')</span></div>' +
              '<div style="color:#fbbf24">المندوب ' + eh(zb.courier_name) + ': ' + eh(zb.reason_label) + '</div>' +
              (zb.lat && zb.lng ? '<div style="font-size:11px;color:var(--mu)" dir="ltr">📍 GPS: ' + zb.lat + ', ' + zb.lng + '</div>' : '') +
            '</div>';
          }).join('') : '<div style="font-size:12px;color:var(--mu)">لا توجد حالات عميل غائب اليوم</div>') +
        '</div>' +
      '</div>';
  }

  /* مستمع النقرات الموحد للمرحلة 4 */
  document.addEventListener('click', async function (e) {
    var t = e.target;
    if (!t) return;

    /* تفاعل بوابة ما قبل الانطلاق */
    var gateRow = t.closest ? t.closest('[data-cp4-gate-chk]') : null;
    if (gateRow) {
      var k = gateRow.getAttribute('data-cp4-gate-chk');
      st.gateChecks[k] = !st.gateChecks[k];
      var gModal = $('cp4-gate-modal');
      if (gModal) renderGateInner(gModal);
      return;
    }
    if (t.id === 'cp4-gate-checkall') {
      st.gateChecks = { battery: true, internet: true, change_cash: true, office_papers: true };
      var gm = $('cp4-gate-modal');
      if (gm) renderGateInner(gm);
      return;
    }
    if (t.id === 'cp4-gate-submit') {
      t.disabled = true;
      st.gateShownToday = true;
      localStorage.setItem('cp_p4_gate_' + todayCairo(), '1');
      var gm2 = $('cp4-gate-modal');
      if (gm2) gm2.remove();
      toast('🚀 يوم موفق يا بطل! تم تأكيد جاهزية الانطلاق');
      if (sbClient) {
        try { await sbClient.rpc('courier_p4_complete_gate', { p_checklist: st.gateChecks }); } catch (err) {}
      }
      return;
    }

    /* درع الأصول الحساسة: تأكيد سريع عند الضغط على سحب/تأكيد مشوار فيه أصل مهم */
    var slideBtn = t.closest ? t.closest('[data-act="v12-slide-confirm"], [data-act="ask-one"]') : null;
    if (slideBtn && !slideBtn.dataset.cp4AssetConfirmed) {
      var card = slideBtn.closest('.cp-v12-card, .cpn-hero, .cp-txitem, .cpn-sheetbox');
      if (card && hasSensitiveAsset(card.textContent || '')) {
        if (!window.confirm('🛡️ تنبيه درع الأصول: هذه المعاملة تحتوي على أصل مستند مهم (جواز/توكيل/شهادة). هل تأكدت من تسليمه/استلامه من الشخص الصحيح؟')) {
          e.stopImmediatePropagation();
          e.preventDefault();
          return;
        }
        slideBtn.dataset.cp4AssetConfirmed = '1';
      }
    }

    var actBtn = t.closest ? t.closest('[data-cp4-act]') : null;
    if (!actBtn) return;
    var act = actBtn.getAttribute('data-cp4-act');
    var tx = actBtn.getAttribute('data-tx') || '';
    var kind = actBtn.getAttribute('data-kind') || 'tx';

    switch (act) {
      case 'dialog-close':
        closeP4Dialog();
        return;
      case 'toggle-amoled':
        st.amoled = !st.amoled;
        localStorage.setItem('cp_p4_amoled', st.amoled ? '1' : '0');
        applyMobilePrefs();
        renderTopToolkitBar();
        toast(st.amoled ? '🌑 تم تفعيل وضع AMOLED الأسود الموفر للبطارية' : '☀️ تم إيقاف وضع AMOLED');
        return;
      case 'toggle-thumb':
        st.thumbSide = st.thumbSide === 'left' ? 'right' : 'left';
        localStorage.setItem('cp_p4_thumb', st.thumbSide);
        applyMobilePrefs();
        renderTopToolkitBar();
        toast('👍 تم ضبط أزرار الإبهام لليد ' + (st.thumbSide === 'left' ? 'اليسرى (شمال)' : 'اليمنى (يمين)'));
        return;
      case 'toggle-onb':
        st.onboarding = !st.onboarding;
        localStorage.setItem('cp_p4_onboarding', st.onboarding ? '1' : '0');
        renderTopToolkitBar();
        return;
      case 'toggle-driving':
        toggleDrivingMode();
        return;
      case 'parking-pin':
        handleParkingPin();
        return;
      case 'parking-save-new':
        saveNewParkingPin();
        return;
      case 'parking-clear':
        st.parkingPin = null;
        localStorage.removeItem('cp_p4_parking_pin');
        closeP4Dialog();
        renderTopToolkitBar();
        toast('تم مسح موقع ركنة الموتوسيكل');
        return;
      case 'qr-torch':
        toggleQrFlashlight();
        return;
      case 'open-zeroblame':
        openZeroBlameModal(tx);
        return;
      case 'zb-submit':
        submitZeroBlame(tx, actBtn.getAttribute('data-reason'), actBtn);
        return;
      case 'open-transfer':
        openTransferModal(tx, kind);
        return;
      case 'tr-send':
        sendPeerTransfer(tx, kind, actBtn);
        return;
      case 'tr-accept':
        respondPeerTransfer(actBtn.getAttribute('data-id'), 'accepted', actBtn);
        return;
      case 'tr-reject':
        respondPeerTransfer(actBtn.getAttribute('data-id'), 'rejected', actBtn);
        return;
      case 'open-office-signoff':
        openOfficeDigitalSignoffModal();
        return;
      case 'ho-submit':
        submitOfficeDigitalSignoff(actBtn);
        return;
      case 'open-collect':
        openFlexibleCollectionModal(tx, kind);
        return;
      case 'calc-cash': {
        var given = Number(actBtn.getAttribute('data-given') || 0);
        var paidInput = $('cp4-col-paid');
        var needed = Number((paidInput && paidInput.value) || st.calcDue || 0);
        var out = $('cp4-calc-out');
        if (out) {
          var diff = given - needed;
          out.innerHTML = diff >= 0
            ? ('العميل دفع <b>' + money(given) + '</b> ← رجّعله باقي فكة: <b style="font-size:15px;color:#10b981">' + money(diff) + '</b>')
            : ('المبلغ أقل من المطلوب بـ <b style="color:#f87171">' + money(Math.abs(diff)) + '</b> (تقدر تختار دفع جزئي)');
        }
        return;
      }
      case 'col-save':
        saveFlexibleCollection(tx, kind, actBtn);
        return;
      case 'open-invoice':
        openClientInvoiceAndReceiptModal(tx);
        return;
      case 'share-thermal':
        shareThermalReceiptImage(actBtn);
        return;
      case 'open-cash-closing':
        openEndOfDayCashClosingModal();
        return;
      case 'close-submit':
        submitEndOfDayCashClosing(actBtn);
        return;
      case 'staff-save-pin': {
        var pinVal = (($('cp4-staff-my-pin') || {}).value || '').trim();
        if (!/^[0-9]{4}$/.test(pinVal)) return toast('كود الختم الرقمي لازم يكون ٤ أرقام', true);
        actBtn.disabled = true;
        try {
          var rp = await sbClient.rpc('staff_p4_set_my_pin', { p_pin: pinVal });
          if (rp.error) throw rp.error;
          toast('🔏 تم حفظ كود ختمك الرقمي (' + pinVal + ') بنجاح ✓');
        } catch (err) {
          toast((err && err.message) || 'تعذر حفظ الكود', true);
        } finally {
          actBtn.disabled = false;
        }
        return;
      }
      case 'staff-refresh-p4':
        loadAndRenderStaffRadarP4(true);
        return;
      case 'staff-confirm-hs':
      case 'staff-reopen-hs': {
        var hsId = Number(actBtn.getAttribute('data-id') || 0);
        var modeAct = act === 'staff-reopen-hs' ? 'reopen' : 'confirm';
        actBtn.disabled = true;
        try {
          var rhs = await sbClient.rpc('staff_p4_confirm_cash_handshake', {
            p_handshake_id: hsId,
            p_action: modeAct
          });
          if (rhs.error) throw rhs.error;
          toast(modeAct === 'confirm' ? '✓ تم تأكيد استلام الكاش وقفل يوم المندوب' : 'تم إعادة فتح تقفيل المندوب');
          await loadAndRenderStaffRadarP4(true);
        } catch (err) {
          actBtn.disabled = false;
          toast((err && err.message) || 'تعذر التحديث', true);
        }
        return;
      }
    }
  }, true);

  /* مراقبة تحديثات DOM في بوابة المندوب أو الرادار لتزيين الكروت تلقائياً بدون وميض */
  var domObs = null;
  function startObserver() {
    if (domObs) return;
    domObs = new MutationObserver(function () {
      if (isCourier() && $('courier-app')) {
        if (!$('cp4-toolkit-bar')) renderTopToolkitBar();
        decorateCourierCards();
      } else if (isAllowedStaff() && ($('ah-pane-ops3') || $('tab-radar')) && !$('cp4-office-radar-box')) {
        loadAndRenderStaffRadarP4(false);
      }
    });
    domObs.observe(document.body, { childList: true, subtree: true });
  }

  function bootPhase4() {
    ensureCss();
    startObserver();
    initBatteryAutoWatcher();
    if (isCourier()) {
      loadMyP4State(false);
    } else if (isAllowedStaff()) {
      loadAndRenderStaffRadarP4(false);
    }
  }

  function wrap(name, fn) {
    var orig = window[name];
    if (typeof orig === 'function' && !orig['__cp4Wrapped']) {
      var w = fn(orig);
      w['__cp4Wrapped'] = true;
      window[name] = w;
    }
  }

  wrap('switchTab', function (orig) {
    return function (id) {
      var res = orig.apply(this, arguments);
      if (id === 'radar' || id === 'pickup') {
        setTimeout(function () { loadAndRenderStaffRadarP4(false); }, 180);
      }
      return res;
    };
  });

  wrap('loadInitialData', function (orig) {
    return async function () {
      var r = await orig.apply(this, arguments);
      setTimeout(bootPhase4, 300);
      return r;
    };
  });

  setTimeout(bootPhase4, 350);
})();
