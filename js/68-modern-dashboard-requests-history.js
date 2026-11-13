/* =====================================================================
   68-modern-dashboard-requests-history.js | تساهيل ERP — الإصدار الذهبي الفائق
   =====================================================================
   1. الساعة الفاخرة في الشاشة الرئيسية (The Tasahel Luxury Dashboard Clock):
      - تصميم لوحة قيادة احترافية مطابقة للسكرين شوت (لون برتقالي نيون وزجاج أسود).
      - ساعة أنالوج كبيرة بحركة ثواني سلسة، أرقام 1-12، وشعار TASAHEL في المنتصف.
      - ساعة رقمية عملاقة مع مؤشر (ص / م) وزر تحويل التنسيق (12 ساعة / 24 ساعة).
      - تاريخ اليوم الميلادي باللغة العربية.
      - كارت طقس القاهرة الحي (درجة الحرارة + حالة الطقس + أيقونة شمس وسحاب + موقع القاهرة).
      - شريط التاريخ الهجري الحي (1448 هـ) مع زخرفة ظلية للمسجد والهلال.
   2. كروت الحالات في شاشة المعاملات (5 KPI Cards):
      - In Progress (قيد التنفيذ)، Under Review (قيد المراجعة)، Complete (جاهزة للتسليم)، Delivered (تم التسليم)، Late (متأخرة).
      - حساب دقيق للأرقام الحقيقية من المعاملات (لا تظهر أصفار إطلاقاً).
      - العناوين بالإنجليزية مع الترجمة العربية المريحة للعين.
   3. شريط الفلاتر والبحث والـ QR Code:
      - زر مسح الـ QR مدمج مباشرة بجانب شريط البحث كأيقونة أنيقة ومترابطة.
      - فلتر الموظف بتصميم أيقوني مصغر ومريح للعين لا يزحم شريط الفلاتر.
   4. تنسيق الجدول وأسماء المستفيدين:
      - 9 أعمدة واضحة ومفصولة (Request ID | العميل | التليفون | الخدمة | الموظف | المبلغ | الحالة | التاريخ | إجراءات).
      - بقاء أسماء المستفيدين كاملة ومرئية تحت اسم العميل.
   5. كارت تفاصيل المعاملة (Request Details Modal):
      - شبكة كروت منظمة لبيانات العميل وخانة العنوان بعرض كامل مريح.
      - تنسيق احترافي وأنيق للمستفيدين كبطاقات مستقلة.
      - مراحل تنفيذ الخدمة بصيغة مبسطة ومفهومة (From بدء التنفيذ ➔ To الجاهزية للتسليم).
      - إخفاء الأزرار المربكة (مسار العمل وفحص المستندات).
   6. سجل التغييرات المفهوم (Change History):
      - استبدال الـ UUIDs بأسماء الموظفين الحقيقية من البروفايل أو اسم "السيستم".
      - تعريب مصطلحات السجل التقنية لألفاظ عمل مفهومة وبسيطة.
      - توحيد السجل بالكامل تحت زرار "السجل الزمني".
   ===================================================================== */

(function () {
  'use strict';

  if (window.__tasahelModernUpdate68) return;
  window.__tasahelModernUpdate68 = true;

  const eh = typeof escapeHtml === 'function' ? escapeHtml : function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  };

  const norm = typeof normName === 'function' ? normName : function (s) {
    return String(s || '').trim().toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
  };


  /* مهم: groupedOrders / profiles / currentUser / myProfile متعرّفين بـ let في 03-core-app.js يعني مش على window.
     القراءة من window كانت بترجّع undefined → الكروت أصفار وقايمة الموظفين فاضية. */
  function G() { try { return Array.isArray(groupedOrders) ? groupedOrders : []; } catch (e) { return []; } }
  function P() { try { return Array.isArray(profiles) ? profiles : []; } catch (e) { return []; } }
  function CU() { try { return currentUser || null; } catch (e) { return null; } }
  function MP() { try { return myProfile || null; } catch (e) { return null; } }

  /* المتغيرات اللي معرّفة بـ let في 03-core-app.js مش على window، فملفات زي 61 (فحص المستندات) و62 و13 كانت بتقراها فاضية.
     بنعرّفها كـ getter/setter يقرا/يكتب نفس المتغير الأصلي (مفيش نسخة تانية). */
  [
    ['sbClient', () => sbClient, v => { sbClient = v; }],
    ['allServices', () => allServices, v => { allServices = v; }],
    ['allRequestLines', () => allRequestLines, v => { allRequestLines = v; }],
    ['groupedOrders', () => groupedOrders, v => { groupedOrders = v; }],
    ['profiles', () => profiles, v => { profiles = v; }],
    ['currentUser', () => currentUser, v => { currentUser = v; }],
    ['myProfile', () => myProfile, v => { myProfile = v; }]
  ].forEach(([n, g, st]) => {
    if (Object.prototype.hasOwnProperty.call(window, n)) return;
    try {
      Object.defineProperty(window, n, { configurable: true, get() { try { return g(); } catch (e) { return undefined; } }, set(v) { try { st(v); } catch (e) {} } });
    } catch (e) {}
  });

  function getSb() {
    try {
      if (window.sbClient) return window.sbClient;
      if (typeof sbClient !== 'undefined' && sbClient) {
        window.sbClient = sbClient;
        return sbClient;
      }
      if (window.supabase) {
        const url = localStorage.getItem('sb_url') || 'https://avehvjqifswsyayckpvx.supabase.co';
        const key = localStorage.getItem('sb_key');
        if (url && key) {
          window.sbClient = window.supabase.createClient(url, key);
          return window.sbClient;
        }
      }
    } catch (e) {}
    return null;
  }

  // حل أسماء الموظفين من الـ UUID
  function resolveUserName(raw) {
    if (!raw) return 'السيستم (تلقائي)';
    const s = String(raw).trim();
    if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(s)) {
      if (Array.isArray(P())) {
        const p = P().find(x => String(x.id) === s);
        if (p && p.full_name) return p.full_name;
      }
      if (CU() && String(CU().id) === s) {
        return (MP() && MP().full_name) || CU().email || 'الموظف الحالي';
      }
      return 'السيستم (تلقائي)';
    }
    return s;
  }

  // حساب حالة المعاملة بدقة حتى لو getOrderStatus غير موجودة على window
  const STATUS_PRIORITY = { 'Under Review': 0, 'In Progress': 1, 'Complete': 2, 'Delivered': 3 };
  function calcOrderStatus(o) {
    if (!o) return 'In Progress';
    if (typeof getOrderStatus === 'function') {
      try { return getOrderStatus(o); } catch (e) {}
    }
    if (!o.lines || !o.lines.length) return 'In Progress';
    let best = 'In Progress', minRank = 9;
    for (let i = 0; i < o.lines.length; i++) {
      const s = o.lines[i].status || 'In Progress';
      const r = STATUS_PRIORITY[s];
      if (r != null && r < minRank) {
        minRank = r;
        best = s;
      }
    }
    return best;
  }

  function calcOrderLate(o) {
    if (!o) return false;
    if (typeof isOrderLate === 'function') {
      try { return isOrderLate(o); } catch (e) {}
    }
    if (!o.lines || !o.lines.length) return false;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return o.lines.some(l => {
      const s = l.status || 'In Progress';
      if (s === 'Delivered' || s === 'Complete') return false;
      const dur = Number(l.duration_days) || 0;
      if (dur <= 0) return false;
      const baseStr = String(l.exec_start_date || l.received_at || o.received_at || o.created_at || '').slice(0, 10);
      if (!baseStr) return false;
      const baseDate = new Date(baseStr + 'T00:00:00');
      if (isNaN(baseDate.getTime())) return false;
      return now.getTime() > (baseDate.getTime() + dur * 86400000);
    });
  }

  /* =========================================================================
     0. أنماط CSS المدمجة (Cockpit Luxury Dark Theme)
     ========================================================================= */
  (function injectStyles() {
    if (document.getElementById('ts-modern-68-styles')) return;
    const style = document.createElement('style');
    style.id = 'ts-modern-68-styles';
    style.textContent = `
      /* ----- Luxury Cockpit Clock Widget ----- */
      .ts-luxury-cockpit {
        background: radial-gradient(circle at 50% 0%, rgba(255, 122, 61, 0.14) 0%, rgba(18, 14, 11, 0.95) 75%), #110e0c;
        border: 1px solid rgba(255, 122, 61, 0.38);
        border-radius: 24px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 0 25px rgba(255, 122, 61, 0.2);
        color: #f8fafc;
        padding: 20px;
        margin-bottom: 20px;
        position: relative;
        overflow: hidden;
        user-select: none;
        backdrop-filter: blur(12px);
      }
      .ts-cockpit-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 16px;
        align-items: center;
      }
      @media (min-width: 900px) {
        .ts-cockpit-grid {
          grid-template-columns: 240px 1fr 200px;
          gap: 24px;
        }
      }

      /* Analog Clock Face */
      .ts-analog-wrap {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        position: relative;
      }
      .ts-analog-dial {
        width: 210px;
        height: 210px;
        border-radius: 50%;
        background: radial-gradient(circle at center, #1f1915 0%, #0d0a08 85%);
        border: 4px solid #2a1f18;
        box-shadow: 0 0 0 2px rgba(255, 122, 61, 0.5), 0 8px 25px rgba(0, 0, 0, 0.8), inset 0 0 20px rgba(0, 0, 0, 0.9);
        position: relative;
      }
      .ts-dial-center {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 14px;
        height: 14px;
        background: radial-gradient(circle, #ffb38a 0%, #e8590c 100%);
        border: 2px solid #ffffff;
        border-radius: 50%;
        transform: translate(-50%, -50%);
        z-index: 10;
        box-shadow: 0 0 8px rgba(255, 122, 61, 0.8);
      }
      .ts-dial-logo {
        position: absolute;
        top: 28%;
        left: 50%;
        transform: translate(-50%, -50%);
        text-align: center;
        pointer-events: none;
      }
      .ts-dial-logo svg {
        width: 24px;
        height: 16px;
        fill: #ff7a3d;
        margin: 0 auto;
      }
      .ts-dial-logo-text {
        font-size: 9.5px;
        font-weight: 900;
        letter-spacing: 2px;
        color: #ff9d6c;
        font-family: system-ui, -apple-system, sans-serif;
      }
      .ts-dial-num {
        position: absolute;
        font-size: 13px;
        font-weight: 800;
        color: #f1f5f9;
        font-family: "JetBrains Mono", monospace;
        transform: translate(-50%, -50%);
      }
      .ts-hand {
        position: absolute;
        bottom: 50%;
        left: 50%;
        transform-origin: 50% 100%;
        border-radius: 6px;
        will-change: transform;
      }
      .ts-hand-h {
        width: 5px;
        height: 52px;
        background: linear-gradient(to top, #ffffff, #ffb38a);
        margin-left: -2.5px;
        z-index: 5;
        box-shadow: 0 0 6px rgba(0, 0, 0, 0.6);
      }
      .ts-hand-m {
        width: 3.5px;
        height: 72px;
        background: linear-gradient(to top, #ffffff, #ffd8c2);
        margin-left: -1.75px;
        z-index: 6;
        box-shadow: 0 0 8px rgba(0, 0, 0, 0.7);
      }
      .ts-hand-s {
        width: 2px;
        height: 84px;
        background: #ff5722;
        margin-left: -1px;
        z-index: 7;
        box-shadow: 0 0 10px rgba(255, 87, 34, 0.8);
      }
      .ts-hand-s::after {
        content: '';
        position: absolute;
        bottom: -14px;
        left: -3px;
        width: 8px;
        height: 20px;
        background: #ff5722;
        border-radius: 4px;
      }

      /* Center Digital Panel */
      .ts-digital-wrap {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        gap: 8px;
      }
      .ts-digi-clock-box {
        display: inline-flex;
        align-items: baseline;
        gap: 6px;
        font-family: "JetBrains Mono", "IBM Plex Sans Arabic", monospace;
      }
      .ts-digi-time {
        font-size: 56px;
        font-weight: 900;
        color: #ffffff;
        text-shadow: 0 0 20px rgba(255, 122, 61, 0.45);
        letter-spacing: 2px;
        line-height: 1;
        direction: ltr;
      }
      .ts-digi-ap {
        font-size: 20px;
        font-weight: 800;
        color: #ff9d6c;
        margin-inline-start: 4px;
      }
      .ts-date-pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        padding: 6px 14px;
        border-radius: 12px;
        font-size: 13px;
        font-weight: 700;
        color: #e2e8f0;
      }
      .ts-time-format-toggle {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        background: rgba(0, 0, 0, 0.4);
        border: 1px solid rgba(255, 122, 61, 0.25);
        border-radius: 14px;
        padding: 4px;
        margin-top: 4px;
      }
      .ts-fmt-btn {
        padding: 4px 12px;
        border-radius: 10px;
        font-size: 11.5px;
        font-weight: 800;
        color: #94a3b8;
        background: transparent;
        border: none;
        cursor: pointer;
        transition: all 0.2s;
      }
      .ts-fmt-btn.active {
        background: #e8590c;
        color: #ffffff;
        box-shadow: 0 0 10px rgba(232, 89, 12, 0.6);
      }

      /* Weather Card Right */
      .ts-weather-card {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 122, 61, 0.3);
        border-radius: 18px;
        padding: 14px;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 6px;
      }
      .ts-weather-temp {
        font-size: 32px;
        font-weight: 900;
        color: #ffffff;
        font-family: monospace;
      }
      .ts-weather-desc {
        font-size: 12px;
        font-weight: 700;
        color: #cbd5e1;
      }
      .ts-weather-loc {
        font-size: 11px;
        color: #ff9d6c;
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }

      /* Hijri Banner Bottom */
      .ts-hijri-banner {
        margin-top: 16px;
        padding: 12px 18px;
        border-radius: 16px;
        background: linear-gradient(90deg, rgba(232, 89, 12, 0.12), rgba(0, 0, 0, 0.4));
        border: 1px solid rgba(255, 122, 61, 0.3);
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }
      .ts-hijri-text {
        display: flex;
        align-items: baseline;
        gap: 8px;
      }
      .ts-hijri-year {
        font-size: 20px;
        font-weight: 900;
        color: #ff9d6c;
        font-family: monospace;
      }
      .ts-hijri-day {
        font-size: 13px;
        font-weight: 700;
        color: #f1f5f9;
      }

      /* ----- KPI 5 Cards ----- */
      .ts-kpi-5-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 10px;
        margin-bottom: 14px;
      }
      @media (min-width: 640px) {
        .ts-kpi-5-grid {
          grid-template-columns: repeat(3, 1fr);
        }
      }
      @media (min-width: 1024px) {
        .ts-kpi-5-grid {
          grid-template-columns: repeat(5, 1fr);
        }
      }
      .ts-kpi-card {
        padding: 12px 14px;
        border-radius: 14px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(27, 21, 17, 0.65);
        cursor: pointer;
        text-align: right;
        transition: all 0.2s ease;
      }
      html:not(.dark) .ts-kpi-card {
        background: #ffffff;
        border-color: #e2e8f0;
      }
      .ts-kpi-card:hover {
        transform: translateY(-2px);
        border-color: rgba(255, 122, 61, 0.4);
      }
      .ts-kpi-card.active {
        border-color: #ff9d6c;
        background: rgba(255, 122, 61, 0.14);
        box-shadow: 0 0 12px rgba(255, 122, 61, 0.25);
      }
      .ts-kpi-title {
        font-size: 12px;
        font-weight: 800;
        color: #e2e8f0;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      html:not(.dark) .ts-kpi-title {
        color: #1e293b;
      }
      .ts-kpi-sub {
        font-size: 10px;
        font-weight: 600;
        color: #94a3b8;
        margin-top: 1px;
      }
      .ts-kpi-num {
        font-size: 24px;
        font-weight: 900;
        font-family: "JetBrains Mono", monospace;
        margin-top: 4px;
        color: #ffffff;
      }
      html:not(.dark) .ts-kpi-num {
        color: #0f172a;
      }

      /* Compact Employee Filter */
      .ts-emp-compact-wrap {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.12);
        color: #e2e8f0;
        font-size: 11.5px;
        font-weight: 700;
      }
      html:not(.dark) .ts-emp-compact-wrap {
        background: #f1f5f9;
        border-color: #cbd5e1;
        color: #1e293b;
      }
      .ts-emp-select {
        background: transparent;
        border: none;
        color: inherit;
        font-size: 11.5px;
        font-weight: 700;
        cursor: pointer;
        outline: none;
        max-width: 140px;
      }

      /* QR Scan Button */
      .ts-qr-integrated-btn {
        padding: 6px 10px;
        border-radius: 10px;
        background: rgba(255, 122, 61, 0.12);
        border: 1px solid rgba(255, 122, 61, 0.3);
        color: #ff9d6c;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 11.5px;
        font-weight: 700;
        transition: all 0.2s;
      }
      .ts-qr-integrated-btn:hover {
        background: rgba(255, 122, 61, 0.25);
        color: #ffffff;
      }

      /* Detail Modal Clean Grid */
      .ts-dtl-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 10px;
      }
      @media (min-width: 640px) {
        .ts-dtl-grid {
          grid-template-columns: repeat(4, 1fr);
        }
      }
      .ts-dtl-card {
        padding: 10px 12px;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.08);
      }
      html:not(.dark) .ts-dtl-card {
        background: #f8fafc;
        border-color: #e2e8f0;
      }
      .ts-dtl-label {
        font-size: 11px;
        color: #94a3b8;
        margin-bottom: 3px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .ts-dtl-val {
        font-weight: 700;
        font-size: 12.5px;
        color: #f8fafc;
      }
      html:not(.dark) .ts-dtl-val {
        color: #0f172a;
      }
      .ts-dtl-card-wide {
        grid-column: 1 / -1;
      }

      /* Beneficiaries Professional Cards */
      .ts-beneficiary-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.06);
        margin-bottom: 6px;
      }
      html:not(.dark) .ts-beneficiary-item {
        background: #f8fafc;
        border-color: #e2e8f0;
      }

      /* Service Stage From ➔ To Line */
      .ts-stage-from-to {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 6px;
      }
      .ts-ft-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        border-radius: 8px;
        font-size: 11px;
        font-weight: 700;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
      }
      .ts-ft-from {
        border-color: rgba(232, 89, 12, 0.35);
        color: #ff9d6c;
      }
      .ts-ft-to {
        border-color: rgba(16, 185, 129, 0.35);
        color: #34d399;
      }



      .ts-clock-gear-wrap { position: relative; margin-top: 2px; }
      .ts-clock-gear { width: 28px; height: 28px; border-radius: 50%; border: 1px solid rgba(255,122,61,.3); background: rgba(0,0,0,.35); color: #ff9d6c; cursor: pointer; font-size: 12px; }
      .ts-clock-gear:hover { background: rgba(255,122,61,.2); color: #fff; }
      .ts-clock-pop { position: absolute; top: 34px; left: 50%; transform: translateX(-50%); z-index: 20; display: flex; gap: 4px; padding: 4px; border-radius: 12px; background: #1b1510; border: 1px solid rgba(255,122,61,.35); box-shadow: 0 8px 24px rgba(0,0,0,.5); white-space: nowrap; }
      .ts-clock-pop[hidden] { display: none; }
      /* خانات تفاصيل الخدمة: العنوان فوق والقيمة تحته بنفس المحاذاة */
      .ts-svc-grid { display: grid !important; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px !important; background: transparent !important; padding: 0 !important; }
      .ts-svc-grid > div { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; padding: 8px 10px; border-radius: 10px; border: 1px solid rgba(148,163,184,.22); background: rgba(148,163,184,.06); min-width: 0; text-align: start; }
      .ts-svc-grid > div > span:first-child { direction: rtl !important; text-align: start; }
      .ts-svc-grid > div > span:last-child { overflow-wrap: anywhere; }
      .ts-dtl-card { min-height: 60px; display: flex; flex-direction: column; justify-content: center; gap: 4px; }
      .ts-dtl-val { overflow-wrap: anywhere; line-height: 1.5; }
      .ts-dtl-phone { display: inline-flex; align-items: center; gap: 6px; direction: ltr; }


      /* ألوان كانت ناقصة من tailwind.css (كانت بتطلع زراير بيضاء فاضية) */
      .bg-orange-600 { background-color: #e8590c; color: #fff; }
      .hover\:bg-orange-700:hover { background-color: #c2410c; }
      .bg-orange-50, .bg-orange-100 { background-color: rgba(255,122,61,.13); }
      .text-orange-500, .text-orange-600, .text-orange-700, .text-orange-800 { color: #ea580c; }
      .border-orange-300 { border-color: rgba(255,122,61,.45); }
      .bg-indigo-600 { background-color: #e8590c; color: #fff; }
      #wf-stages-modal { z-index: 125; }
      /* مسار العمل: مسار موازي للحالة بيلخبط (In Progress/Complete/Delivered هي الأصل) فمخفي من الكارت */
      button[onclick*="openWorkflowStagesModal"] { display: none !important; }
      /* كلمة "متوسط تقدم الخدمات" كانت بتطلع برا الدايرة */
      .tx-ring-gauge-box .absolute > span:nth-child(3) { display: none; }
      .ts-deliv-by { font-size: 10px; color: #10b981; font-weight: 700; margin-top: 2px; line-height: 1.4; }

      /* Stepper */
      .ts-stepper { margin-top: 2px; }
      .ts-stp-row { display: flex; align-items: flex-start; gap: 0; }
      .ts-stp { flex: 0 0 auto; width: 84px; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 1px; }
      .ts-stp-line { flex: 1; height: 2px; margin-top: 13px; background: rgba(148,163,184,.35); border-radius: 2px; min-width: 14px; }
      .ts-stp-dot { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; background: rgba(148,163,184,.18); color: #94a3b8; border: 2px solid rgba(148,163,184,.35); }
      .ts-stp b { font-size: 11px; font-weight: 800; color: #64748b; margin-top: 4px; }
      html.dark .ts-stp b { color: #cbd5e1; }
      .ts-stp small { font-size: 10px; color: #94a3b8; }
      .ts-stp em { font-style: normal; font-size: 10px; font-family: monospace; color: #64748b; margin-top: 2px; }
      .ts-stp.done .ts-stp-dot { background: #10b981; border-color: #10b981; color: #fff; }
      .ts-stp.now .ts-stp-dot { background: #ff7a3d; border-color: #ffb38a; color: #fff; box-shadow: 0 0 0 4px rgba(255,122,61,.2); }
      .ts-stp.paused .ts-stp-dot { background: #f59e0b; border-color: #fcd34d; color: #fff; }
      .ts-stp-hold { font-size: 11px; font-weight: 800; color: #b45309; background: rgba(245,158,11,.14); border: 1px solid rgba(245,158,11,.35); border-radius: 8px; padding: 3px 9px; display: inline-block; margin-bottom: 8px; }
      .ts-ch-svc { font-size: 11px; font-weight: 700; color: #ea580c; }

      /* Hide redundant / confusing buttons */
      button.wf-open-btn,
      button.dv-open-btn,
      #aud-box {
        display: none !important;
      }

      /* Change History Modal (Clear & Human Readable) */
      .ts-ch-date-block {
        border-bottom: 1px solid #edf2f7;
        padding-bottom: 10px;
      }
      html.dark .ts-ch-date-block {
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      }
      .ts-ch-date-title {
        font-size: 12px;
        font-weight: 700;
        padding: 12px 18px 4px;
        color: #475569;
        direction: ltr;
        text-align: right;
      }
      html.dark .ts-ch-date-title {
        color: #94a3b8;
      }
      .ts-ch-item {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 10px 18px;
      }
      .ts-ch-avatar {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: rgba(255, 122, 61, 0.15);
        color: #ff9d6c;
        border: 1px solid rgba(255, 122, 61, 0.35);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: 900;
        flex-shrink: 0;
        margin-top: 2px;
      }
      .ts-ch-content {
        flex: 1;
        min-width: 0;
      }
      .ts-ch-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 3px;
      }
      .ts-ch-user {
        font-size: 13px;
        font-weight: 800;
        color: #0f172a;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      html.dark .ts-ch-user {
        color: #f8fafc;
      }
      .ts-ch-dept {
        font-size: 10px;
        font-weight: 700;
        padding: 1px 7px;
        border-radius: 9999px;
        background: #e0f2fe;
        color: #0369a1;
      }
      .ts-ch-time {
        font-size: 12px;
        color: #64748b;
        font-family: monospace;
        direction: ltr;
      }
      .ts-ch-action {
        font-size: 12px;
        font-weight: 700;
        color: #334155;
        margin-bottom: 4px;
      }
      html.dark .ts-ch-action {
        color: #cbd5e1;
      }
      .ts-ch-row {
        font-size: 12px;
        color: #64748b;
        margin-bottom: 3px;
        line-height: 1.5;
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
      }
      html.dark .ts-ch-row {
        color: #94a3b8;
      }
      .ts-ch-row b {
        color: #0f172a;
      }
      html.dark .ts-ch-row b {
        color: #f1f5f9;
      }
      .ts-ch-auto {
        font-size: 10px;
        font-weight: 800;
        padding: 1px 6px;
        border-radius: 4px;
        background: #f1f5f9;
        color: #475569;
        border: 1px solid #cbd5e1;
      }
      html.dark .ts-ch-auto {
        background: #26201b;
        color: #cbd5e1;
        border-color: rgba(255, 255, 255, 0.15);
      }
    `;
    document.head.appendChild(style);
  })();

  /* =========================================================================
     1. الساعة الفاخرة في الشاشة الرئيسية (Luxury Cockpit Clock)
     ========================================================================= */
  let cairoWeatherCache = null;
  async function fetchCairoWeather() {
    try {
      const cached = localStorage.getItem('ts_cairo_weather');
      if (cached) {
        const j = JSON.parse(cached);
        if (Date.now() - j.t < 1800000) { cairoWeatherCache = j; return; }
      }
    } catch (e) {}

    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 3500);
      const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=30.0444&longitude=31.2357&current=temperature_2m,weather_code&timezone=Africa%2FCairo', { signal: ctrl.signal });
      clearTimeout(tid);
      if (!res.ok) throw new Error('weather error');
      const data = await res.json();
      cairoWeatherCache = { temp: Math.round(data.current.temperature_2m), code: data.current.weather_code, t: Date.now() };
      localStorage.setItem('ts_cairo_weather', JSON.stringify(cairoWeatherCache));
      updateClockDisplay();
    } catch (e) {
      if (!cairoWeatherCache) cairoWeatherCache = { temp: 26, code: 1, t: Date.now() };
    }
  }
  fetchCairoWeather();

  function getWeatherDesc(code) {
    if (code === 0) return { text: 'مشمس', icon: 'fa-sun text-amber-400' };
    if (code <= 3) return { text: 'غائم جزئياً', icon: 'fa-cloud-sun text-amber-300' };
    if (code <= 48) return { text: 'ضبابي', icon: 'fa-smog text-slate-300' };
    return { text: 'معتدل', icon: 'fa-cloud text-amber-400' };
  }

  function getClockFormat() {
    return localStorage.getItem('ts_clock_format') === '24' ? '24' : '12';
  }

  window.setTsClockFormat = function (fmt) {
    localStorage.setItem('ts_clock_format', fmt === '24' ? '24' : '12');
    updateClockDisplay();
  };

  function mountLuxuryHomeClock() {
    const tabHome = document.getElementById('tab-home');
    if (!tabHome) return;

    if (document.getElementById('ts-luxury-cockpit-clock')) return;

    const widget = document.createElement('div');
    widget.id = 'ts-luxury-cockpit-clock';
    widget.className = 'ts-luxury-cockpit';

    // بناء الدائرة بالأرقام 1-12
    let dialNums = '';
    const cx = 105, cy = 105, r = 78;
    for (let n = 1; n <= 12; n++) {
      const angle = (n * 30) * (Math.PI / 180);
      const nx = cx + r * Math.sin(angle);
      const ny = cy - r * Math.cos(angle);
      dialNums += `<div class="ts-dial-num" style="left:${nx}px;top:${ny}px;">${n}</div>`;
    }

    widget.innerHTML = `
      <div class="ts-cockpit-grid">
        <!-- 1. Analog Clock -->
        <div class="ts-analog-wrap">
          <div class="ts-analog-dial" id="ts-analog-dial">
            <div class="ts-dial-logo">
              <svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zm0 9l-10-5v6l10 5 10-5v-6l-10 5z"/></svg>
              <div class="ts-dial-logo-text">TASAHEL</div>
            </div>
            ${dialNums}
            <div id="ts-hand-h" class="ts-hand ts-hand-h"></div>
            <div id="ts-hand-m" class="ts-hand ts-hand-m"></div>
            <div id="ts-hand-s" class="ts-hand ts-hand-s"></div>
            <div class="ts-dial-center"></div>
          </div>
        </div>

        <!-- 2. Middle Digital Clock & Date -->
        <div class="ts-digital-wrap">
          <div class="ts-digi-clock-box">
            <span id="ts-digi-time" class="ts-digi-time">--:--</span>
            <span id="ts-digi-ap" class="ts-digi-ap"></span>
          </div>

          <div class="ts-date-pill">
            <i class="fa-solid fa-calendar-days text-amber-500"></i>
            <span id="ts-digi-date">--</span>
          </div>

          <div class="ts-clock-gear-wrap">
            <button type="button" id="ts-clock-gear" class="ts-clock-gear" aria-label="إعدادات الساعة" title="إعدادات الساعة"><i class="fa-solid fa-gear"></i></button>
            <div id="ts-clock-pop" class="ts-clock-pop" hidden>
              <button type="button" id="ts-fmt-btn-12" onclick="setTsClockFormat('12')" class="ts-fmt-btn active">12 ساعة</button>
              <button type="button" id="ts-fmt-btn-24" onclick="setTsClockFormat('24')" class="ts-fmt-btn">24 ساعة</button>
            </div>
          </div>
        </div>

        <!-- 3. Cairo Weather Card -->
        <div class="ts-weather-card">
          <i id="ts-weather-icon" class="fa-solid fa-cloud-sun text-4xl text-amber-400 my-1"></i>
          <div id="ts-weather-temp" class="ts-weather-temp">26°C</div>
          <div id="ts-weather-desc" class="ts-weather-desc">غائم جزئياً</div>
          <div class="ts-weather-loc">
            <i class="fa-solid fa-location-dot"></i>
            <span>القاهرة</span>
          </div>
        </div>
      </div>

      <!-- 4. Bottom Hijri Date Banner -->
      <div class="ts-hijri-banner">
        <div class="ts-hijri-text">
          <span class="text-xs font-bold text-slate-300">هجريًا:</span>
          <span id="ts-hijri-full" class="ts-hijri-day">--</span>
        </div>
        <div class="flex items-center gap-2 text-amber-500/90 text-sm font-bold">
          <i class="fa-solid fa-mosque"></i>
          <span>مصر</span>
        </div>
      </div>
    `;

    tabHome.prepend(widget);
    const gear = widget.querySelector('#ts-clock-gear'), pop = widget.querySelector('#ts-clock-pop');
    gear.addEventListener('click', e => { e.stopPropagation(); pop.hidden = !pop.hidden; });
    pop.addEventListener('click', e => { e.stopPropagation(); if (e.target.closest('button')) pop.hidden = true; });
    document.addEventListener('click', () => { pop.hidden = true; });
    updateClockDisplay();
  }

  var updateClockDisplay = function () {};

  /* سبب الرمشة: renderHomeTab بيمسح محتوى #tab-home كله وبعدها كان الويدجت بيتبني من الأول (والعقارب والطقس بيترسموا تاني).
     الحل: نفصل نفس عنصر الويدجت قبل الرسم ونرجّعه بعده كما هو، فالمتصفح مبيرسمش حاجة جديدة،
     وكمان home-stable.js يقدر يقارن الـ HTML الباقي ويرجّع العناصر القديمة لو ما اتغيرش حاجة. */
  const origRenderHome = window.renderHomeTab;
  if (typeof origRenderHome === 'function') {
    window.renderHomeTab = function () {
      const box = document.getElementById('tab-home');
      const w = document.getElementById('ts-luxury-cockpit-clock');
      if (w && box && w.parentNode === box) box.removeChild(w);
      let r;
      try { r = origRenderHome.apply(this, arguments); }
      finally {
        try {
          const b2 = document.getElementById('tab-home');
          if (w && b2) { if (!b2.contains(w)) b2.prepend(w); }
          else mountLuxuryHomeClock();
        } catch (e) {}
      }
      return r;
    };
  }

  /* تحديث خفيف: الثواني بس كل ثانية، والباقي (تاريخ/هجري/طقس) لما قيمته تتغير فقط */
  const _last = {};
  function setTxt(id, v) {
    if (_last[id] === v) return;
    const el = document.getElementById(id);
    if (el) { el.textContent = v; _last[id] = v; } else { delete _last[id]; }
  }
  const fmtGreg = new Intl.DateTimeFormat('ar-EG', { timeZone: 'Africa/Cairo', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  let fmtHij = null;
  try { fmtHij = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) {}
  updateClockDisplay = function () {
    if (document.hidden) return;
    const d = new Date();
    const is24 = getClockFormat() === '24';
    const hEl = document.getElementById('ts-hand-h');
    const mEl = document.getElementById('ts-hand-m');
    const sEl = document.getElementById('ts-hand-s');
    if (hEl && mEl && sEl) {
      const s = d.getSeconds();
      const m = d.getMinutes() + s / 60;
      const h = (d.getHours() % 12) + m / 60;
      hEl.style.transform = 'rotate(' + (h * 30) + 'deg)';
      mEl.style.transform = 'rotate(' + (m * 6) + 'deg)';
      sEl.style.transform = 'rotate(' + (s * 6) + 'deg)';
    }
    const h24 = d.getHours(), mStr = String(d.getMinutes()).padStart(2, '0');
    if (is24) { setTxt('ts-digi-time', String(h24).padStart(2, '0') + ':' + mStr); setTxt('ts-digi-ap', ''); }
    else { setTxt('ts-digi-time', ((h24 % 12) || 12) + ':' + mStr); setTxt('ts-digi-ap', h24 < 12 ? 'ص' : 'م'); }
    const b12 = document.getElementById('ts-fmt-btn-12'), b24 = document.getElementById('ts-fmt-btn-24');
    if (b12 && b24 && b24.classList.contains('active') !== is24) { b12.classList.toggle('active', !is24); b24.classList.toggle('active', is24); }
    setTxt('ts-digi-date', fmtGreg.format(d));
    setTxt('ts-hijri-full', fmtHij ? fmtHij.format(d) : '1448 هـ');
    const wData = cairoWeatherCache || { temp: 26, code: 1 };
    const wInfo = getWeatherDesc(wData.code);
    setTxt('ts-weather-temp', wData.temp + '°C');
    setTxt('ts-weather-desc', wInfo.text);
    const iconEl = document.getElementById('ts-weather-icon');
    const cls = 'fa-solid ' + wInfo.icon + ' text-4xl my-1';
    if (iconEl && iconEl.className !== cls) iconEl.className = cls;
  };
  setInterval(updateClockDisplay, 1000);

  /* =========================================================================
     2. شاشة المعاملات: كروت الحالات الخمسة بالأرقام الحقيقية المؤكدة
     ========================================================================= */
  window.__txEmployeeFilter = 'all';

  function renderTxStatusKpiCards() {
    const tabTx = document.getElementById('tab-tx');
    if (!tabTx) return;

    let kpiWrap = document.getElementById('ts-tx-kpi-5-container');
    const oldGrid = tabTx.querySelector('.grid.grid-cols-2.lg\\:grid-cols-4');

    if (!kpiWrap) {
      if (oldGrid) {
        kpiWrap = oldGrid;
        kpiWrap.id = 'ts-tx-kpi-5-container';
        kpiWrap.className = 'ts-kpi-5-grid';
      } else {
        kpiWrap = document.createElement('div');
        kpiWrap.id = 'ts-tx-kpi-5-container';
        kpiWrap.className = 'ts-kpi-5-grid';
        tabTx.prepend(kpiWrap);
      }
    }

    const orders = G() || [];
    let inProg = 0, underRev = 0, complete = 0, delivered = 0, late = 0;

    orders.forEach(o => {
      const st = calcOrderStatus(o);
      if (st === 'In Progress') inProg++;
      else if (st === 'Under Review') underRev++;
      else if (st === 'Complete') complete++;
      else if (st === 'Delivered') delivered++;

      if (calcOrderLate(o)) late++;
    });

    let activeFilter = 'all'; try { activeFilter = txStatusFilter || 'all'; } catch (e) {}

    const cards = [
      { id: 'In Progress', title: 'In Progress', sub: 'قيد التنفيذ', count: inProg, icon: 'fa-spinner text-amber-400', cls: activeFilter === 'In Progress' ? 'active' : '' },
      { id: 'Under Review', title: 'Under Review', sub: 'قيد المراجعة', count: underRev, icon: 'fa-pause text-orange-500', cls: activeFilter === 'Under Review' ? 'active' : '' },
      { id: 'Complete', title: 'Complete', sub: 'جاهزة للتسليم', count: complete, icon: 'fa-circle-check text-teal-400', cls: activeFilter === 'Complete' ? 'active' : '' },
      { id: 'Delivered', title: 'Delivered', sub: 'تم التسليم', count: delivered, icon: 'fa-truck-fast text-emerald-400', cls: activeFilter === 'Delivered' ? 'active' : '' },
      { id: 'late', title: 'Late', sub: 'متأخرة', count: late, icon: 'fa-triangle-exclamation text-rose-500', cls: activeFilter === 'late' ? 'active' : '' }
    ];

    const sig = cards.map(c => c.id + ':' + c.count + ':' + c.cls).join('|');
    if (kpiWrap.dataset.sig === sig) return;
    kpiWrap.dataset.sig = sig;
    kpiWrap.innerHTML = cards.map(c => `
      <div onclick="setTxStatusFilter('${c.id}')" class="ts-kpi-card ${c.cls}">
        <div class="ts-kpi-title">
          <span>${c.title}</span>
          <i class="fa-solid ${c.icon}"></i>
        </div>
        <div class="ts-kpi-sub">${c.sub}</div>
        <div class="ts-kpi-num">${c.count}</div>
      </div>
    `).join('');
  }

  /* =========================================================================
     3. فلتر الموظف الأنيق وزر مسح الـ QR المدمج
     ========================================================================= */
  function injectCompactEmployeeAndQrFilter() {
    const cardBar = document.querySelector('#tab-tx .card .flex.flex-wrap.items-center.justify-between');
    if (!cardBar) return;

    // زر مسح QR موجود أصلاً من js/66-scan-open.js (scan-open-btn-tx) — مفيش زرار تاني
    const dup = document.getElementById('ts-qr-integrated-btn'); if (dup) dup.remove();

    // 2. فلتر الموظف الأنيق المدمج
    let wrap = document.getElementById('tx-emp-filter-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'tx-emp-filter-wrap';
      wrap.className = 'ts-emp-compact-wrap ms-1 shrink-0';
      cardBar.insertBefore(wrap, cardBar.children[1] || null);
    }

    const empMap = new Map();
    const add = n => { n = String(n || '').trim(); if (n) { const k = norm(n); if (!empMap.has(k)) empMap.set(k, n); } };
    P().forEach(p => add(p.full_name));
    G().forEach(o => { add(o.employee); (o.lines || []).forEach(l => add(l.employee)); });
    const names = Array.from(empMap.values()).sort((a, b) => a.localeCompare(b, 'ar'));
    const sig = names.join('|');
    if (wrap.dataset.sig === sig && wrap.querySelector('select')) return;
    wrap.dataset.sig = sig;

    let opts = '<option value="all">كل الموظفين</option>';
    names.forEach(emp => {
      const sel = window.__txEmployeeFilter === emp ? ' selected' : '';
      opts += `<option value="${eh(emp)}"${sel}>${eh(emp)}</option>`;
    });
    wrap.innerHTML = `
      <i class="fa-solid fa-user-tie text-amber-500 text-xs"></i>
      <select id="tx-emp-filter-select" class="ts-emp-select" aria-label="فلتر الموظف المسؤول">${opts}</select>
    `;
    wrap.querySelector('select').addEventListener('change', function () {
      window.__txEmployeeFilter = this.value;
      if (typeof window.renderRecentRequests === 'function') window.renderRecentRequests();
    });
  }

  // فلترة الموظفين المتسلسلة
  const prevRecentFilter = window.__recentFilter;
  window.__recentFilter = function (list) {
    if (typeof prevRecentFilter === 'function') list = prevRecentFilter(list);
    if (!window.__txEmployeeFilter || window.__txEmployeeFilter === 'all') return list;
    const target = norm(window.__txEmployeeFilter);
    return list.filter(o => norm(o.employee || '') === target || (o.lines || []).some(l => norm(l.employee || '') === target));
  };

  /* =========================================================================
     4. فصل أعمدة الجدول مع الحفاظ التام على أسماء المستفيدين
     ========================================================================= */
  function formatSeparatedColumns() {
    const table = document.querySelector('#tab-tx table');
    if (!table) return;

    const theadTr = table.querySelector('thead tr');
    if (theadTr && theadTr.children.length === 8) {
      theadTr.innerHTML = `
        <th class="th px-3.5" dir="ltr">Request ID</th>
        <th class="th">اسم العميل</th>
        <th class="th">رقم التليفون</th>
        <th class="th">الخدمة</th>
        <th class="th">الموظف المسؤول</th>
        <th class="th">المبلغ</th>
        <th class="th">الحالة</th>
        <th class="th">التاريخ</th>
        <th class="th text-center">إجراءات</th>
      `;
    }

    const tbody = table.querySelector('tbody#recent-table-body');
    if (!tbody) return;

    Array.from(tbody.querySelectorAll('tr')).forEach(tr => {
      const cells = tr.children;
      if (cells.length === 8) {
        const clientCell = cells[1];
        const svcCell = cells[2];

        // استخراج رقم التليفون فقط وحذفه من خانة العميل دون المساس باسم العميل أو المستفيدين
        const phonePill = clientCell.querySelector('.rc-phone-pill');
        let phoneText = '';
        if (phonePill) {
          const match = phonePill.textContent.match(/[\d+]{8,16}/);
          if (match) phoneText = match[0];
          phonePill.remove();
        }

        const phoneTd = document.createElement('td');
        phoneTd.className = 'px-3 py-3 whitespace-nowrap text-xs';
        phoneTd.setAttribute('dir', 'ltr');

        if (phoneText) {
          phoneTd.innerHTML = `
            <a href="tel:${eh(phoneText)}" onclick="event.stopPropagation()" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-300 border border-sky-200 dark:border-sky-800 font-mono text-xs hover:bg-sky-100 transition" title="اتصال هاتفي">
              <i class="fa-solid fa-phone text-[11px]"></i>
              <span>${eh(phoneText)}</span>
            </a>
          `;
        } else {
          phoneTd.innerHTML = '<span class="text-slate-400">—</span>';
        }

        tr.insertBefore(phoneTd, svcCell);
      }
    });
  }

  const origRenderRecent = window.renderRecentRequests;
  if (typeof origRenderRecent === 'function') {
    window.renderRecentRequests = function () {
      renderTxStatusKpiCards();
      origRenderRecent.apply(this, arguments);
      formatSeparatedColumns();
      injectCompactEmployeeAndQrFilter();
    };
  }

  /* =========================================================================
     5. كارت تفاصيل المعاملة: Grid UI + التفاف العنوان + From ➔ To + إخفاء الزوائد
     ========================================================================= */

  /* ===== Stepper مراحل التنفيذ: In Progress → Complete → Delivered (+ Under Review كحالة وقف) ===== */
  function fmtStepDate(v) {
    if (!v) return '';
    const d = new Date(v);
    if (isNaN(d)) return String(v).slice(0, 10);
    const hasTime = String(v).length > 10;
    try {
      return new Intl.DateTimeFormat('en-GB', Object.assign({ timeZone: 'Africa/Cairo', day: '2-digit', month: '2-digit', year: 'numeric' }, hasTime ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } : {})).format(d).replace(',', '');
    } catch (e) { return String(v).slice(0, 10); }
  }
  function stepperHtml(o, line) {
    let evs = [];
    try { evs = (lineStageEventsCache && lineStageEventsCache[String(line.id)]) || []; } catch (e) {}
    const by = {};
    evs.forEach(e => { if (e && e.stage && e.at) by[e.stage] = e.at; });
    const st = line.status || 'In Progress';
    const paused = st === 'Under Review';
    const rank = { 'In Progress': 0, 'Complete': 1, 'Delivered': 2 };
    let cur = rank[st];
    if (cur == null) cur = by.delivered ? 2 : by.complete ? 1 : 0;
    const steps = [
      { t: 'In Progress', ar: 'بدء التنفيذ', at: by.in_progress || line.exec_start_date || line.received_at || o.received_at || o.created_at },
      { t: 'Complete', ar: 'جاهزة للتسليم', at: by.complete },
      { t: 'Delivered', ar: 'تم التسليم', at: by.delivered || (st === 'Delivered' ? line.delivered_date : '') }
    ];
    const nodes = steps.map((x, i) => {
      const cls = i < cur || (i === cur && st === 'Delivered') ? 'done' : i === cur ? (paused ? 'paused' : 'now') : '';
      const ic = cls === 'done' ? '<i class="fa-solid fa-check"></i>' : cls === 'paused' ? '⏸' : (i + 1);
      const when = x.at ? fmtStepDate(x.at) : (cls === 'now' || cls === 'paused' ? 'جارية الآن' : '—');
      let who = '';
      if (x.t === 'In Progress' && o.receiver) who = 'استلام: ' + o.receiver;
      if (x.t === 'Delivered' && st === 'Delivered') { const dt = (trips[o.transaction_id] || {}).delivery; if (dt) who = 'تسليم: ' + courierText(dt.courier); }
      return `<div class="ts-stp ${cls}"><span class="ts-stp-dot">${ic}</span><b>${x.t}</b><small>${x.ar}</small><em dir="ltr">${eh(when)}</em>${who ? '<div class="ts-deliv-by">' + eh(who) + '</div>' : ''}</div>`;
    }).join('<span class="ts-stp-line"></span>');
    return `<div class="ts-stepper">${paused ? '<div class="ts-stp-hold">⏸ Under Review — الخدمة موقوفة مؤقتاً</div>' : ''}<div class="ts-stp-row">${nodes}</div></div>`;
  }
  function renderSteppers(o) {
    const body = document.getElementById('tx-modal-body');
    if (!body || !o) return;
    body.querySelectorAll('[data-svc-card-id]').forEach(card => {
      const lid = card.getAttribute('data-svc-card-id');
      const line = (o.lines || []).find(l => String(l.id) === lid);
      if (!line) return;
      let slot = card.querySelector('[data-ts-stepper]');
      if (!slot) {
        const ev = card.querySelector('[data-line-events]');
        const holder = ev && ev.parentElement;
        if (!holder) return;
        holder.innerHTML = '<div class="text-[10.5px] font-semibold text-slate-400 mb-1">مراحل التنفيذ</div><div data-ts-stepper="' + eh(lid) + '"></div>';
        slot = holder.querySelector('[data-ts-stepper]');
      }
      slot.innerHTML = stepperHtml(o, line);
    });
  }

  /* ===== مندوب التسليم: بيتسجل أصلاً في courier_trips (kind=delivery) لما الحالة تبقى Delivered ===== */
  const trips = {};
  const selfPick = c => !c || c === '—';
  function courierText(c) { return selfPick(c) ? 'العميل استلم بنفسه من المكتب' : c; }
  async function loadDeliveredBy(o) {
    if (!o || !(o.lines || []).some(l => l.status === 'Delivered')) return;
    const sb = getSb(); if (!sb) return;
    try {
      const r = await sb.from('courier_trips').select('kind,courier,trip_day').eq('transaction_id', String(o.transaction_id));
      if (r.error || !Array.isArray(r.data)) return;
      const t = {};
      r.data.forEach(x => { t[x.kind] = x; });
      trips[o.transaction_id] = t;
      renderSteppers(o);
      paintDeliveredCard(o);
    } catch (e) {}
  }
  function paintDeliveredCard(o) {
    const grid = document.querySelector('#tx-modal-body .ts-dtl-grid');
    if (!grid) return;
    let c = grid.querySelector('[data-ts-delivered]');
    const t = (trips[o.transaction_id] || {}).delivery;
    const delivered = (o.lines || []).some(l => l.status === 'Delivered');
    if (!delivered || !t) { if (c) c.remove(); return; }
    if (!c) {
      c = document.createElement('div');
      c.className = 'ts-dtl-card';
      c.setAttribute('data-ts-delivered', '1');
      grid.insertBefore(c, grid.querySelector('.ts-dtl-card-wide') || null);
    }
    c.innerHTML = '<div class="ts-dtl-label"><i class="fa-solid fa-truck-fast text-emerald-500"></i><span>مندوب التسليم</span></div><div class="ts-dtl-val">' + eh(courierText(t.courier)) + '</div>' +
      (t.trip_day ? '<div class="ts-deliv-by" dir="ltr" style="text-align:start">' + eh(fmtStepDate(t.trip_day)) + '</div>' : '');
  }

  // لما تواريخ المراحل الحقيقية تتحمّل من السيرفر نعيد رسم الـ Stepper
  const origLoadStage = window.loadLineStageEvents;
  if (typeof origLoadStage === 'function') {
    window.loadLineStageEvents = async function (tx) {
      const r = await origLoadStage.apply(this, arguments);
      try { renderSteppers(G().find(x => String(x.transaction_id) === String(tx))); } catch (e) {}
      return r;
    };
  }

  const origOpenTxModal = window.openTxModal;
  if (typeof origOpenTxModal === 'function') {
    window.openTxModal = function (tx) {
      origOpenTxModal.apply(this, arguments);

      const o = G().find(x => String(x.transaction_id) === String(tx));
      if (!o) return;
      const modalBody = document.getElementById('tx-modal-body');
      if (!modalBody) return;

      // 1. إعادة تصميم بيانات المعاملة في Grid منسق
      const oldGrid = modalBody.querySelector(':scope > .grid.grid-cols-2.sm\\:grid-cols-4');
      if (oldGrid && !oldGrid.dataset.formatted68) {
        oldGrid.dataset.formatted68 = '1';
        oldGrid.className = 'ts-dtl-grid my-3';
        oldGrid.innerHTML = `
          <div class="ts-dtl-card"><div class="ts-dtl-label"><i class="fa-solid fa-hashtag text-amber-500"></i><span>Request ID</span></div><div class="ts-dtl-val font-mono" dir="ltr">${eh(o.transaction_id)}</div></div>
          <div class="ts-dtl-card"><div class="ts-dtl-label"><i class="fa-solid fa-user text-amber-500"></i><span>اسم العميل</span></div><div class="ts-dtl-val">${eh(o.client_name || '—')}</div></div>
          <div class="ts-dtl-card"><div class="ts-dtl-label"><i class="fa-solid fa-phone text-sky-500"></i><span>الهاتف</span></div><div class="ts-dtl-val font-mono" dir="ltr">${o.phone ? `<a href="tel:${eh(o.phone)}" class="ts-dtl-phone text-sky-400 hover:underline"><i class="fa-solid fa-phone text-xs"></i><span>${eh(o.phone)}</span></a>` : '—'}</div></div>
          <div class="ts-dtl-card"><div class="ts-dtl-label"><i class="fa-solid fa-wallet text-amber-500"></i><span>طريقة الدفع</span></div><div class="ts-dtl-val">${eh(o.payment_method || '—')}</div></div>
          <div class="ts-dtl-card"><div class="ts-dtl-label"><i class="fa-solid fa-user-tie text-amber-500"></i><span>الموظف المسؤول</span></div><div class="ts-dtl-val">${eh(o.employee || '—')}</div></div>
          <div class="ts-dtl-card"><div class="ts-dtl-label"><i class="fa-solid fa-motorcycle text-amber-500"></i><span>مندوب الاستلام</span></div><div class="ts-dtl-val">${eh(o.receiver || 'العميل شخصياً')}</div></div>
          <div class="ts-dtl-card"><div class="ts-dtl-label"><i class="fa-solid fa-calendar-day text-amber-500"></i><span>تاريخ الاستلام</span></div><div class="ts-dtl-val font-mono" dir="ltr" style="text-align:start">${eh(fmtStepDate(o.received_at || o.created_at) || '—')}</div></div>
          <div class="ts-dtl-card"><div class="ts-dtl-label"><i class="fa-solid fa-receipt text-amber-500"></i><span>رقم الإيصال</span></div><div class="ts-dtl-val font-mono">${eh(o.rn_nm || '—')}</div></div>
          ${(() => { try { const dsc = typeof txDisc === 'function' ? txDisc(o) : 0; return dsc > 0 ? `<div class="ts-dtl-card"><div class="ts-dtl-label"><i class="fa-solid fa-percent text-rose-500"></i><span>أعلى خصم بند</span></div><div class="ts-dtl-val font-mono">${eh(String(dsc))}%</div></div>` : ''; } catch (e) { return ''; } })()}
          <div class="ts-dtl-card ts-dtl-card-wide"><div class="ts-dtl-label"><i class="fa-solid fa-location-dot text-rose-500"></i><span>العنوان المسجل</span></div><div class="ts-dtl-val whitespace-normal leading-relaxed text-xs">${eh(o.address || 'لم يتم تسجيل عنوان')}</div></div>
        `;
      }

      // 2. تجميل بطاقات المستفيدين
      const rpList = modalBody.querySelector('.rp-list');
      if (rpList && !rpList.dataset.styled68) {
        rpList.dataset.styled68 = '1';
        rpList.className = 'rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 p-3.5 my-3';
      }

      modalBody.querySelectorAll('[data-svc-card-id] .svc-exp .grid.grid-cols-2').forEach(g => {
        g.classList.add('ts-svc-grid');
        g.querySelectorAll('[dir="ltr"]').forEach(x => { if (x.classList.contains('block')) x.removeAttribute('dir'); });
      });

      // 3. شريط مراحل التنفيذ (Stepper) لكل خدمة
      renderSteppers(o);
      paintDeliveredCard(o);
      loadDeliveredBy(o);

      // 4. زر الإيقاف Under Review
      modalBody.querySelectorAll('[data-svc-card-id] .lp-btn').forEach(b => {
        if (!b.classList.contains('lp-resume')) {
          b.innerHTML = '<span>⏸</span><span>Under Review</span>';
        }
      });
    };
  }

  /* =========================================================================
     6. سجل التغييرات المفهوم والإنساني (Human-Friendly Change History)
     ========================================================================= */
  /* ----- Change History: سجل واحد موحّد (audit_log + مراحل البنود + التعليقات) ----- */
  const CAIRO = 'Africa/Cairo';
  const fDay = new Intl.DateTimeFormat('en-GB', { timeZone: CAIRO, day: '2-digit', month: '2-digit', year: 'numeric' });
  const fHm = new Intl.DateTimeFormat('en-GB', { timeZone: CAIRO, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '··';
    const latin = /^[A-Za-z]/.test(parts[0]);
    if (parts.length >= 2) return latin ? (parts[0][0] + parts[1][0]).toUpperCase() : (parts[0][0] + parts[1][0]);
    return parts[0].slice(0, 2).toUpperCase();
  }
  function profileByName(name) {
    const k = norm(name);
    return P().find(p => norm(p.full_name) === k) || null;
  }
  function profileById(id) { return P().find(p => String(p.id) === String(id)) || null; }
  function roleBadge(name) {
    const p = profileByName(name);
    const t = p && p.job_title ? String(p.job_title).trim() : '';
    return t ? '<span class="ts-ch-dept">' + eh(t) + '</span>' : '';
  }

  const STATUS_AR = { 'In Progress': 'In Progress', 'Under Review': 'Under Review', 'Complete': 'Complete', 'Delivered': 'Delivered' };
  const FIELD_LABELS = {
    delivered: 'تم التسليم', complete: 'جاهزة للتسليم', under_review: 'Under Review', status: 'الحالة',
    qty: 'العدد', unit_price: 'سعر الوحدة', total: 'الإجمالي', service: 'الخدمة', payment_method: 'طريقة الدفع',
    employee: 'الموظف المسؤول', executor: 'المنفذ', receiver: 'مندوب الاستلام', client_name: 'اسم العميل', phone: 'التليفون',
    address: 'العنوان', notes: 'ملاحظات', discount_pct: 'الخصم %', exec_unit_cost: 'تكلفة التنفيذ/وحدة', service_ref: 'Service ID',
    received_at: 'تاريخ الاستلام', rn_nm: 'رقم الإيصال', 'Current Queue': 'Current Queue', 'Operations Status': 'Operations Status',
    'Operations Owner': 'Operations Owner', 'Operations Cost Confirmation': 'Operations Cost Confirmation', 'Payment Confirmation': 'Payment Confirmation'
  };
  const ACTION_TITLES = {
    created: 'Added', updated: 'Changed', deleted: 'Deleted', cost_confirmed: 'Operations Cost Confirmation',
    refund: 'Refund Approved', refund_approved: 'Refund Approved', refund_request: 'Refund Requested', refund_rejected: 'Refund Rejected'
  };
  const sv = v => v === true ? 'نعم' : v === false ? 'لا' : (v == null || v === '') ? '—' : (STATUS_AR[v] || String(v));
  const BOOL_STATUS = { delivered: 'Delivered', complete: 'Complete', under_review: 'Under Review' };

  function rowsFromDetails(d) {
    const rows = [];
    Object.keys(d || {}).forEach(k => {
      if (k === 'automatic') return;
      const label = FIELD_LABELS[k] || k;
      const v = d[k];
      if (BOOL_STATUS[k] && v && typeof v === 'object' && typeof v.new === 'boolean') {
        // نعم/لا مش مفهومة لوحدها: نكتبها كحالة صريحة
        rows.push({ label: 'الحالة', old: null, neu: v.new ? 'تم تحويلها إلى ' + BOOL_STATUS[k] : 'اتشالت من ' + BOOL_STATUS[k] });
        return;
      }
      if (v && typeof v === 'object' && ('old' in v || 'new' in v)) rows.push({ label, old: sv(v.old), neu: sv(v.new) });
      else rows.push({ label, old: null, neu: sv(v) });
    });
    return rows;
  }

  const lineName = (o, id) => { const l = o && (o.lines || []).find(x => String(x.id) === String(id)); return l ? l.service : ''; };

  window.p51OpenTimelineModal = async function (tx) {
    if (!tx) return;
    tx = String(tx);
    const old = document.getElementById('ts-change-history-modal');
    if (old) old.remove();

    const ov = document.createElement('div');
    ov.id = 'ts-change-history-modal';
    ov.style.cssText = 'position:fixed;inset:0;z-index:99990;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.72);padding:12px';
    ov.innerHTML = `
      <div class="w-full max-w-3xl max-h-[90vh] bg-white dark:bg-[#141210] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden" onclick="event.stopPropagation()">
        <div class="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-white/10 bg-slate-50 dark:bg-[#1b1815]">
          <div class="flex items-center gap-2.5">
            <span class="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/20 text-amber-500 font-bold"><i class="fa-solid fa-clock-rotate-left"></i></span>
            <div>
              <h3 class="font-bold text-sm sm:text-base text-ink dark:text-white">Change History</h3>
              <p class="text-xs text-slate-400 font-mono" dir="ltr">Request ID: ${eh(tx)}</p>
            </div>
          </div>
          <button type="button" aria-label="إغلاق" onclick="document.getElementById('ts-change-history-modal').remove()" class="h-8 w-8 rounded-lg text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10 flex items-center justify-center transition">
            <i class="fa-solid fa-xmark text-lg"></i>
          </button>
        </div>
        <div id="ts-ch-modal-list" class="overflow-y-auto p-2 sm:p-3 text-start">
          <div class="py-8 text-center text-xs text-slate-400"><i class="fa-solid fa-spinner fa-spin ms-1"></i> جارٍ تحميل السجل...</div>
        </div>
      </div>`;
    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);

    const bodyEl = document.getElementById('ts-ch-modal-list');
    const sb = getSb();
    const o = G().find(x => String(x.transaction_id) === tx);
    const q = (t, cols, col, n) => sb ? sb.from(t).select(cols).eq('transaction_id', tx).order(col, { ascending: false }).limit(n) : Promise.resolve({ data: [] });

    try {
      const [ra, rs, rc] = await Promise.all([
        q('audit_log', '*', 'at', 500),
        q('line_stage_events', 'line_id,stage,at', 'at', 300),
        q('tx_comments', 'id,author_id,author_name,body,created_at', 'created_at', 300)
      ]);
      const ok = r => (r && !r.error && Array.isArray(r.data)) ? r.data : [];
      const audit = ok(ra), stages = ok(rs), comments = ok(rc);
      const events = [];

      audit.forEach(a => {
        const d = a.details || {};
        const user = (a.user_name && String(a.user_name).trim()) || '';
        const auto = !user || !!d.automatic || /^(system|النظام|السيستم)/i.test(user);
        const rows = rowsFromDetails(d);
        if (a.action === 'created' && !rows.length) rows.push({ label: 'الخدمة', old: null, neu: a.service || '—' });
        events.push({
          t: new Date(a.at || 0).getTime(), user: auto ? 'System' : user, auto, svc: a.service || '',
          title: ACTION_TITLES[a.action] || 'Changed', rows, kind: 'audit', lineKey: a.service || ''
        });
      });

      // مراحل البنود (بتتسجل بتريجر من السيرفر): الأصل هو audit_log لو لنفس الخدمة قريب (±3 دقايق)،
      // وأول In Progress بعد الإضافة مجرد انعكاس للإضافة فنتجاهله. باقي الحالات بنعرضها "من ➔ إلى" بالمرحلة اللي قبلها.
      const STG = { in_progress: 'In Progress', under_review: 'Under Review', complete: 'Complete', delivered: 'Delivered' };
      const byLine = {};
      stages.slice().sort((x, y) => new Date(x.at) - new Date(y.at)).forEach(st => { (byLine[st.line_id] = byLine[st.line_id] || []).push(st); });
      Object.keys(byLine).forEach(lid => {
        const svc = lineName(o, lid);
        byLine[lid].forEach((st, i) => {
          const t = new Date(st.at || 0).getTime();
          const near = events.some(e => e.kind === 'audit' && e.svc === svc && Math.abs(e.t - t) <= 180000);
          if (near && (i === 0 || events.some(e => e.kind === 'audit' && e.svc === svc && Math.abs(e.t - t) <= 180000 &&
            e.rows.some(r => /Complete|Delivered|Under Review|الحالة|Status/i.test(r.label + ' ' + r.neu))))) return;
          const prev = i > 0 ? STG[byLine[lid][i - 1].stage] : null;
          events.push({ t, user: 'System', auto: true, svc, title: 'Status Changed', kind: 'stage',
            rows: [{ label: 'الحالة', old: prev, neu: STG[st.stage] || st.stage }] });
        });
      });

      comments.forEach(c => {
        const p = profileById(c.author_id);
        events.push({
          t: new Date(c.created_at || 0).getTime(), user: (p && p.full_name) || c.author_name || '—', auto: false, svc: '',
          title: 'Note', kind: 'note', rows: [{ label: 'Note', old: null, neu: c.body || '' }]
        });
      });

      if (o && !events.some(e => e.title === 'Added')) {
        const t0 = o.received_at || o.created_at;
        if (t0) events.push({ t: new Date(t0).getTime(), user: o.employee || '—', auto: false, svc: '', title: 'Added', kind: 'created', rows: [{ label: 'Request', old: null, neu: o.client_name || tx }] });
      }

      events.sort((x, y) => y.t - x.t);
      if (!bodyEl) return;
      if (!events.length) { bodyEl.innerHTML = '<div class="py-8 text-center text-xs text-slate-400">لا توجد حركات مسجلة لهذه المعاملة بعد.</div>'; return; }

      const groups = new Map();
      events.forEach(ev => {
        const d = new Date(ev.t);
        const day = isNaN(d) ? '—' : fDay.format(d);
        if (!groups.has(day)) groups.set(day, []);
        groups.get(day).push(ev);
      });

      let html = '';
      groups.forEach((list, day) => {
        html += '<div class="ts-ch-date-block"><div class="ts-ch-date-title">' + eh(day) + '</div>' + list.map(ev => {
          const hm = isNaN(ev.t) ? '' : fHm.format(new Date(ev.t));
          const rowsHtml = ev.rows.map(r => `
            <div class="ts-ch-row">
              <span>${eh(r.label)}:</span>
              ${r.old != null ? `<span>${eh(r.old)}</span><span class="text-amber-500 font-bold">➔</span>` : ''}
              <b>${eh(r.neu)}</b>
              ${ev.auto ? '<span class="ts-ch-auto">Automatic</span>' : ''}
            </div>`).join('');
          return `
            <div class="ts-ch-item">
              <div class="ts-ch-avatar">${eh(ev.auto ? '⚙' : initials(ev.user))}</div>
              <div class="ts-ch-content">
                <div class="ts-ch-top">
                  <div class="ts-ch-user"><span>${eh(ev.user)}</span>${ev.auto ? '' : roleBadge(ev.user)}</div>
                  <div class="ts-ch-time">${eh(hm)}</div>
                </div>
                <div class="ts-ch-action">${eh(ev.title)}${ev.svc ? ' <span class="ts-ch-svc">· ' + eh(ev.svc) + '</span>' : ''}</div>
                <div>${rowsHtml}</div>
              </div>
            </div>`;
        }).join('') + '</div>';
      });
      bodyEl.innerHTML = html;
    } catch (err) {
      if (bodyEl) bodyEl.innerHTML = '<div class="py-6 text-center text-xs text-rose-500">حدث خطأ أثناء تحميل السجل</div>';
    }
  };

  // تهيئة أولية
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      mountLuxuryHomeClock();
    });
  } else {
    mountLuxuryHomeClock();
  }
})();
