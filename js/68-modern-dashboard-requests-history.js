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
      if (Array.isArray(window.profiles)) {
        const p = window.profiles.find(x => String(x.id) === s);
        if (p && p.full_name) return p.full_name;
      }
      if (window.currentUser && String(window.currentUser.id) === s) {
        return (window.myProfile && window.myProfile.full_name) || window.currentUser.email || 'الموظف الحالي';
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
        transition: transform 0.05s cubic-bezier(0.4, 2.08, 0.55, 0.44);
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
          <div class="text-[11px] font-bold text-amber-500/80 mt-2 flex items-center gap-1.5">
            <i class="fa-solid fa-stopwatch"></i>
            <span>ساعة أنالوج سهلة القراءة</span>
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

          <div class="ts-time-format-toggle">
            <span class="text-[11px] font-bold text-slate-400 ms-1 flex items-center gap-1"><i class="fa-regular fa-clock text-amber-500"></i> تنسيق الوقت:</span>
            <button id="ts-fmt-btn-12" onclick="setTsClockFormat('12')" class="ts-fmt-btn active">✓ 12 ساعة</button>
            <button id="ts-fmt-btn-24" onclick="setTsClockFormat('24')" class="ts-fmt-btn">24 ساعة</button>
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
          <span class="text-xs font-bold text-slate-300">التاريخ الهجري:</span>
          <span id="ts-hijri-full" class="ts-hijri-day">--</span>
        </div>
        <div class="flex items-center gap-2 text-amber-500/90 text-sm font-bold">
          <i class="fa-solid fa-mosque"></i>
          <span>توقيت جمهورية مصر العربية</span>
        </div>
      </div>
    `;

    tabHome.prepend(widget);
    updateClockDisplay();
  }

  function updateClockDisplay() {
    const d = new Date();
    const is24 = getClockFormat() === '24';

    // 1. Analog Hands
    const hEl = document.getElementById('ts-hand-h');
    const mEl = document.getElementById('ts-hand-m');
    const sEl = document.getElementById('ts-hand-s');

    if (hEl && mEl && sEl) {
      const s = d.getSeconds();
      const m = d.getMinutes() + s / 60;
      const h = (d.getHours() % 12) + m / 60;

      hEl.style.transform = `rotate(${h * 30}deg)`;
      mEl.style.transform = `rotate(${m * 6}deg)`;
      sEl.style.transform = `rotate(${s * 6}deg)`;
    }

    // 2. Digital Time
    const digiTimeEl = document.getElementById('ts-digi-time');
    const digiApEl = document.getElementById('ts-digi-ap');
    if (digiTimeEl && digiApEl) {
      const h24 = d.getHours();
      const mStr = String(d.getMinutes()).padStart(2, '0');
      if (is24) {
        digiTimeEl.textContent = `${String(h24).padStart(2, '0')}:${mStr}`;
        digiApEl.textContent = '';
      } else {
        const h12 = (h24 % 12) || 12;
        const ap = h24 < 12 ? 'ص' : 'م';
        digiTimeEl.textContent = `${h12}:${mStr}`;
        digiApEl.textContent = ap;
      }
    }

    // Buttons
    const b12 = document.getElementById('ts-fmt-btn-12');
    const b24 = document.getElementById('ts-fmt-btn-24');
    if (b12 && b24) {
      b12.classList.toggle('active', !is24);
      b24.classList.toggle('active', is24);
    }

    // 3. Gregorian Date
    const dateEl = document.getElementById('ts-digi-date');
    if (dateEl) {
      const fD = new Intl.DateTimeFormat('ar-EG', { timeZone: 'Africa/Cairo', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      dateEl.textContent = fD.format(d);
    }

    // 4. Hijri Date
    const hijriEl = document.getElementById('ts-hijri-full');
    if (hijriEl) {
      try {
        const fH = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' });
        hijriEl.textContent = fH.format(d);
      } catch (e) {
        hijriEl.textContent = '1448 هـ';
      }
    }

    // 5. Weather
    const wData = cairoWeatherCache || { temp: 26, code: 1 };
    const wInfo = getWeatherDesc(wData.code);
    const tempEl = document.getElementById('ts-weather-temp');
    const descEl = document.getElementById('ts-weather-desc');
    const iconEl = document.getElementById('ts-weather-icon');
    if (tempEl) tempEl.textContent = `${wData.temp}°C`;
    if (descEl) descEl.textContent = wInfo.text;
    if (iconEl) iconEl.className = `fa-solid ${wInfo.icon} text-4xl my-1`;
  }

  // ربط مع renderHomeTab
  const origRenderHome = window.renderHomeTab;
  if (typeof origRenderHome === 'function') {
    window.renderHomeTab = function () {
      const r = origRenderHome.apply(this, arguments);
      try { mountLuxuryHomeClock(); } catch (e) {}
      return r;
    };
  }
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

    const orders = window.groupedOrders || [];
    let inProg = 0, underRev = 0, complete = 0, delivered = 0, late = 0;

    orders.forEach(o => {
      const st = calcOrderStatus(o);
      if (st === 'In Progress') inProg++;
      else if (st === 'Under Review') underRev++;
      else if (st === 'Complete') complete++;
      else if (st === 'Delivered') delivered++;

      if (calcOrderLate(o)) late++;
    });

    const activeFilter = window.txStatusFilter || 'all';

    const cards = [
      { id: 'In Progress', title: 'In Progress', sub: 'قيد التنفيذ', count: inProg, icon: 'fa-spinner fa-spin-pulse text-amber-400', cls: activeFilter === 'In Progress' ? 'active' : '' },
      { id: 'Under Review', title: 'Under Review', sub: 'قيد المراجعة', count: underRev, icon: 'fa-pause text-orange-500', cls: activeFilter === 'Under Review' ? 'active' : '' },
      { id: 'Complete', title: 'Complete', sub: 'جاهزة للتسليم', count: complete, icon: 'fa-circle-check text-teal-400', cls: activeFilter === 'Complete' ? 'active' : '' },
      { id: 'Delivered', title: 'Delivered', sub: 'تم التسليم', count: delivered, icon: 'fa-truck-fast text-emerald-400', cls: activeFilter === 'Delivered' ? 'active' : '' },
      { id: 'late', title: 'Late', sub: 'متأخرة', count: late, icon: 'fa-triangle-exclamation text-rose-500', cls: activeFilter === 'late' ? 'active' : '' }
    ];

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

    // 1. زر الـ QR المدمج بجانب البحث
    const searchInput = document.getElementById('recent-q');
    if (searchInput && !document.getElementById('ts-qr-integrated-btn')) {
      const qrBtn = document.createElement('button');
      qrBtn.id = 'ts-qr-integrated-btn';
      qrBtn.type = 'button';
      qrBtn.className = 'ts-qr-integrated-btn ms-1.5 shrink-0';
      qrBtn.title = 'مسح رمز QR / باركود الإيصال';
      qrBtn.innerHTML = '<i class="fa-solid fa-qrcode"></i><span>مسح QR</span>';
      qrBtn.onclick = function () {
        if (typeof window.scanReceipt === 'function') window.scanReceipt();
        else if (typeof window.openScanModal === 'function') window.openScanModal();
        else searchInput.focus();
      };
      if (searchInput.parentElement) searchInput.parentElement.appendChild(qrBtn);
    }

    // 2. فلتر الموظف الأنيق المدمج
    let wrap = document.getElementById('tx-emp-filter-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'tx-emp-filter-wrap';
      wrap.className = 'ts-emp-compact-wrap ms-1 shrink-0';
      cardBar.insertBefore(wrap, cardBar.children[1] || null);
    }

    const empSet = new Set();
    if (Array.isArray(window.profiles)) {
      window.profiles.forEach(p => { if (p.full_name) empSet.add(p.full_name.trim()); });
    }
    if (Array.isArray(window.groupedOrders)) {
      window.groupedOrders.forEach(o => {
        if (o.employee) empSet.add(o.employee.trim());
        (o.lines || []).forEach(l => { if (l.employee) empSet.add(l.employee.trim()); });
      });
    }

    let opts = '<option value="all">كل الموظفين</option>';
    Array.from(empSet).sort().forEach(emp => {
      const sel = window.__txEmployeeFilter === emp ? ' selected' : '';
      opts += `<option value="${eh(emp)}"${sel}>${eh(emp)}</option>`;
    });

    wrap.innerHTML = `
      <i class="fa-solid fa-user-tie text-amber-500 text-xs"></i>
      <select id="tx-emp-filter-select" class="ts-emp-select">
        ${opts}
      </select>
    `;

    const selEl = wrap.querySelector('#tx-emp-filter-select');
    selEl.addEventListener('change', function () {
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
    return list.filter(o => {
      const empNorm = norm(o.employee || '');
      if (empNorm === target || empNorm.includes(target) || target.includes(empNorm)) return true;
      return (o.lines || []).some(l => {
        const lNorm = norm(l.employee || '');
        return lNorm === target || lNorm.includes(target);
      });
    });
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
  const origOpenTxModal = window.openTxModal;
  if (typeof origOpenTxModal === 'function') {
    window.openTxModal = function (tx) {
      origOpenTxModal.apply(this, arguments);

      const o = (window.groupedOrders || []).find(x => String(x.transaction_id) === String(tx));
      if (!o) return;
      const modalBody = document.getElementById('tx-modal-body');
      if (!modalBody) return;

      // 1. إعادة تصميم بيانات المعاملة في Grid منسق
      const oldGrid = modalBody.querySelector('.grid.grid-cols-2.sm\\:grid-cols-4');
      if (oldGrid && !oldGrid.dataset.formatted68) {
        oldGrid.dataset.formatted68 = '1';
        oldGrid.className = 'ts-dtl-grid my-3';
        oldGrid.innerHTML = `
          <div class="ts-dtl-card"><div class="ts-dtl-label"><i class="fa-solid fa-hashtag text-amber-500"></i><span>Request ID</span></div><div class="ts-dtl-val font-mono" dir="ltr">${eh(o.transaction_id)}</div></div>
          <div class="ts-dtl-card"><div class="ts-dtl-label"><i class="fa-solid fa-user text-amber-500"></i><span>اسم العميل</span></div><div class="ts-dtl-val">${eh(o.client_name || '—')}</div></div>
          <div class="ts-dtl-card"><div class="ts-dtl-label"><i class="fa-solid fa-phone text-sky-500"></i><span>الهاتف</span></div><div class="ts-dtl-val font-mono" dir="ltr">${o.phone ? `<a href="tel:${eh(o.phone)}" class="text-sky-400 hover:underline"><i class="fa-solid fa-phone text-xs ms-1"></i>${eh(o.phone)}</a>` : '—'}</div></div>
          <div class="ts-dtl-card"><div class="ts-dtl-label"><i class="fa-solid fa-wallet text-amber-500"></i><span>طريقة الدفع</span></div><div class="ts-dtl-val">${eh(o.payment_method || '—')}</div></div>
          <div class="ts-dtl-card"><div class="ts-dtl-label"><i class="fa-solid fa-user-tie text-amber-500"></i><span>الموظف المسؤول</span></div><div class="ts-dtl-val">${eh(o.employee || '—')}</div></div>
          <div class="ts-dtl-card"><div class="ts-dtl-label"><i class="fa-solid fa-motorcycle text-amber-500"></i><span>مندوب الاستلام</span></div><div class="ts-dtl-val">${eh(o.receiver || 'العميل شخصياً')}</div></div>
          <div class="ts-dtl-card"><div class="ts-dtl-label"><i class="fa-solid fa-calendar-day text-amber-500"></i><span>تاريخ الاستلام</span></div><div class="ts-dtl-val font-mono">${eh(typeof formatDateTime === 'function' ? formatDateTime(o.received_at || o.created_at) : (o.received_at || '—'))}</div></div>
          <div class="ts-dtl-card"><div class="ts-dtl-label"><i class="fa-solid fa-receipt text-amber-500"></i><span>رقم الإيصال</span></div><div class="ts-dtl-val font-mono">${eh(o.rn_nm || '—')}</div></div>
          <div class="ts-dtl-card ts-dtl-card-wide"><div class="ts-dtl-label"><i class="fa-solid fa-location-dot text-rose-500"></i><span>العنوان المسجل</span></div><div class="ts-dtl-val whitespace-normal leading-relaxed text-xs">${eh(o.address || 'لم يتم تسجيل عنوان')}</div></div>
        `;
      }

      // 2. تجميل بطاقات المستفيدين
      const rpList = modalBody.querySelector('.rp-list');
      if (rpList && !rpList.dataset.styled68) {
        rpList.dataset.styled68 = '1';
        rpList.className = 'rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 p-3.5 my-3';
      }

      // 3. تحويل تواريخ مراحل التنفيذ إلى From ➔ To مفهومة
      modalBody.querySelectorAll('[data-line-events]').forEach(div => {
        const lid = div.getAttribute('data-line-events');
        const line = (o.lines || []).find(l => String(l.id) === lid) || o.lines[0];
        if (line) {
          const fromDate = line.exec_start_date ? String(line.exec_start_date).slice(0, 10) : (o.received_at ? String(o.received_at).slice(0, 10) : 'اليوم');
          const toDate = line.delivered_date ? String(line.delivered_date).slice(0, 10) : 'قيد المتابعة';

          div.parentElement.innerHTML = `
            <div class="ts-stage-from-to">
              <span class="ts-ft-badge ts-ft-from"><i class="fa-solid fa-play text-[10px]"></i> From (بدء التنفيذ): <b>${eh(fromDate)}</b></span>
              <span class="text-slate-500 text-xs font-bold">➔</span>
              <span class="ts-ft-badge ts-ft-to"><i class="fa-solid fa-flag-checkered text-[10px]"></i> To (الجاهزية / التسليم): <b>${eh(toDate)}</b></span>
            </div>
          `;
        }
      });

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
  function getInitials(name) {
    if (!name) return '??';
    const n = String(name).trim();
    const map = {
      'دنيا محمود': 'DM', 'donia mahmoud': 'DM',
      'أحمد جمال': 'AG', 'ahmed gamal': 'AG',
      'أحمد عزت': 'AE', 'ahmed ezzat': 'AE',
      'حسن عمران': 'HO', 'hassan omran': 'HO',
      'إجلال أيمن': 'EA', 'eglal aymen': 'EA',
      'محمود أبو شامة': 'MA', 'mahmoud aboshama': 'MA'
    };
    for (const k in map) {
      if (n.toLowerCase().includes(k.toLowerCase())) return map[k];
    }
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return n.slice(0, 2).toUpperCase();
  }

  function getDeptBadge(name) {
    const lk = String(name || '').toLowerCase();
    if (lk.includes('hassan') || lk.includes('omran') || lk.includes('حسن') || lk.includes('حساب')) {
      return '<span class="ts-ch-dept" style="background:#e0e7ff;color:#4338ca">الحسابات</span>';
    }
    if (lk.includes('eglal') || lk.includes('aymen') || lk.includes('إجلال') || lk.includes('مبيع')) {
      return '<span class="ts-ch-dept" style="background:#dcfce7;color:#15803d">المبيعات</span>';
    }
    if (lk.includes('owner') || lk.includes('admin') || lk.includes('إدارة') || lk.includes('aboshama')) {
      return '<span class="ts-ch-dept" style="background:#fae8ff;color:#86198f">الإدارة</span>';
    }
    return '<span class="ts-ch-dept">الخدمات الحكومية</span>';
  }

  // قاموس تعريب مصطلحات السجل للألفاظ المفهومة للمستخدم
  const FIELD_AR_LABELS = {
    'Operations Status': 'حالة تنفيذ المعاملة',
    'status': 'حالة المعاملة',
    'Current Queue': 'القسم المسؤول حالياً',
    'Payment Confirmation': 'تأكيد السداد والتحصيل',
    'Operations Cost Confirmation': 'اعتماد تكلفة التنفيذ',
    'Operations Owner': 'الموظف المسؤول',
    'Review Status': 'حالة المراجعة',
    'qty': 'عدد المعاملات',
    'unit_price': 'سعر الوحدة',
    'total': 'إجمالي المبلغ',
    'service': 'نوع الخدمة',
    'client_name': 'اسم العميل',
    'phone': 'رقم التليفون',
    'Note': 'ملاحظة مسجلة'
  };

  const VALUE_AR_LABELS = {
    'In Progress': 'قيد التنفيذ',
    'Under Review': 'قيد المراجعة (Under Review)',
    'Complete': 'جاهزة للتسليم',
    'Delivered': 'تم التسليم للعميل',
    'Confirmed': 'معتمد ومؤكد',
    'New': 'جديد / بانتظار البدء',
    'Sales': 'قسم المبيعات',
    'Gov': 'قسم الخدمات الحكومية',
    'Accounting': 'قسم الحسابات',
    'NA': 'غير محدد'
  };

  window.p51OpenTimelineModal = async function (tx) {
    if (!tx) return;

    const old = document.getElementById('ts-change-history-modal');
    if (old) old.remove();

    const ov = document.createElement('div');
    ov.id = 'ts-change-history-modal';
    ov.className = 'fixed inset-0 z-[160] flex items-center justify-center bg-black/75 p-3 sm:p-4';
    ov.innerHTML = `
      <div class="w-full max-w-3xl max-h-[90vh] bg-white dark:bg-[#141210] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden" onclick="event.stopPropagation()">
        <div class="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-white/10 bg-slate-50 dark:bg-[#1b1815]">
          <div class="flex items-center gap-2.5">
            <span class="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/20 text-amber-500 font-bold"><i class="fa-solid fa-clock-rotate-left"></i></span>
            <div>
              <h3 class="font-bold text-sm sm:text-base text-ink dark:text-white">سجل التغييرات الكامل (Change History)</h3>
              <p class="text-xs text-slate-400 font-mono" dir="ltr">Request ID: ${eh(tx)}</p>
            </div>
          </div>
          <button onclick="document.getElementById('ts-change-history-modal').remove()" class="h-8 w-8 rounded-lg text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10 flex items-center justify-center transition">
            <i class="fa-solid fa-xmark text-lg"></i>
          </button>
        </div>
        <div id="ts-ch-modal-list" class="overflow-y-auto p-4 sm:p-5 text-start">
          <div class="py-8 text-center text-xs text-slate-400"><i class="fa-solid fa-spinner fa-spin ms-1"></i> جارٍ تحميل السجل...</div>
        </div>
      </div>
    `;

    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);

    const sb = getSb();
    const bodyEl = document.getElementById('ts-ch-modal-list');

    try {
      const fetchPromise = Promise.all([
        sb ? sb.from('audit_log').select('*').eq('transaction_id', String(tx)).order('at', { ascending: false }).limit(100) : Promise.resolve({ data: [] }),
        sb ? sb.from('line_stage_events').select('*').eq('transaction_id', String(tx)).order('at', { ascending: false }).limit(50) : Promise.resolve({ data: [] }),
        sb ? sb.from('tx_comments').select('*').eq('transaction_id', String(tx)).order('created_at', { ascending: false }).limit(50) : Promise.resolve({ data: [] })
      ]);

      const timeoutPromise = new Promise(resolve => setTimeout(() => resolve([{ data: [] }, { data: [] }, { data: [] }]), 4000));
      const results = await Promise.race([fetchPromise, timeoutPromise]);

      const auditRows = (results[0] && !results[0].error && Array.isArray(results[0].data)) ? results[0].data : [];
      const stageRows = (results[1] && !results[1].error && Array.isArray(results[1].data)) ? results[1].data : [];
      const commentRows = (results[2] && !results[2].error && Array.isArray(results[2].data)) ? results[2].data : [];

      const events = [];

      // 1. تحويل سجلات audit_log
      auditRows.forEach(a => {
        const d = a.details || {};
        let action = a.action === 'created' ? 'إضافة معاملة جديدة' : (a.action === 'cost_confirmed' ? 'اعتماد تكلفة التنفيذ' : 'تحديث بيانات المعاملة');
        let isAuto = !!(d.automatic || d.Current_Queue);

        const formattedDetails = {};
        for (const k in d) {
          if (k === 'automatic') continue;
          let label = FIELD_AR_LABELS[k] || k;
          if (k === 'complete' || k === 'under_review' || k === 'delivered') label = 'حالة تنفيذ المعاملة';

          const valObj = d[k];
          if (valObj && typeof valObj === 'object' && ('new' in valObj || 'old' in valObj)) {
            const rawOld = String(valObj.old == null ? '—' : valObj.old);
            const rawNew = String(valObj.new == null ? '—' : valObj.new);
            formattedDetails[label] = {
              old: VALUE_AR_LABELS[rawOld] || rawOld,
              new: VALUE_AR_LABELS[rawNew] || rawNew
            };
          } else {
            const rawVal = String(valObj == null ? '—' : valObj);
            formattedDetails[label] = { old: '—', new: VALUE_AR_LABELS[rawVal] || rawVal };
          }
        }

        events.push({
          time: new Date(a.at || 0),
          user: resolveUserName(a.user_name),
          action: action,
          details: Object.keys(formattedDetails).length ? formattedDetails : d,
          isAuto: isAuto
        });
      });

      // 2. تحويل line_stage_events
      const stageNames = { in_progress: 'قيد التنفيذ', under_review: 'قيد المراجعة', complete: 'جاهزة للتسليم', delivered: 'تم التسليم' };
      stageRows.forEach(s => {
        events.push({
          time: new Date(s.at || 0),
          user: resolveUserName(s.by_user),
          action: 'تحديث حالة المعاملة',
          details: { 'حالة تنفيذ المعاملة': { old: 'جديد', new: stageNames[s.stage] || s.stage } },
          isAuto: true
        });
      });

      // 3. تحويل tx_comments
      commentRows.forEach(c => {
        events.push({
          time: new Date(c.created_at || 0),
          user: resolveUserName(c.author_name),
          action: 'ملاحظة مسجلة',
          details: { 'نص الملاحظة': { old: '—', new: c.body } },
          isAuto: false
        });
      });

      // 4. حدث الإضافة الأساسي للمعاملة من الذاكرة المحلية
      const o = (window.groupedOrders || []).find(x => String(x.transaction_id) === String(tx));
      if (o && (o.received_at || o.created_at)) {
        events.push({
          time: new Date(o.received_at || o.created_at),
          user: resolveUserName(o.employee),
          action: 'تسجيل المعاملة لأول مرة',
          details: { 'المسار الأولي': { old: '—', new: 'قسم المبيعات' } },
          isAuto: false
        });
      }

      events.sort((a, b) => b.time.getTime() - a.time.getTime());

      // تجميع حسب اليوم
      const groups = {};
      events.forEach(ev => {
        const d = ev.time;
        const dayStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
        if (!groups[dayStr]) groups[dayStr] = [];
        groups[dayStr].push(ev);
      });

      if (!bodyEl) return;

      if (!Object.keys(groups).length) {
        bodyEl.innerHTML = '<div class="py-8 text-center text-xs text-slate-400">لا توجد حركات مسجلة لهذه المعاملة بعد.</div>';
        return;
      }

      let html = '';
      for (const day in groups) {
        html += `
          <div class="ts-ch-date-block">
            <div class="ts-ch-date-title">${day}</div>
            ${groups[day].map(item => {
              const hmStr = `${String(item.time.getHours()).padStart(2, '0')}:${String(item.time.getMinutes()).padStart(2, '0')}`;
              const initials = getInitials(item.user);
              const deptBadge = getDeptBadge(item.user);

              const rowsHtml = Object.keys(item.details).map(k => {
                const v = item.details[k];
                if (v && typeof v === 'object' && ('old' in v || 'new' in v)) {
                  return `
                    <div class="ts-ch-row">
                      ${item.isAuto ? '<span class="ts-ch-auto">تلقائي</span>' : ''}
                      <span>${eh(k)}:</span>
                      <span>${eh(v.old || '—')}</span>
                      <span class="text-amber-500 font-bold">➔</span>
                      <b>${eh(v.new || '—')}</b>
                    </div>
                  `;
                }
                return `
                  <div class="ts-ch-row">
                    ${item.isAuto ? '<span class="ts-ch-auto">تلقائي</span>' : ''}
                    <span>${eh(k)}:</span>
                    <span class="text-amber-500 font-bold">➔</span>
                    <b>${eh(String(v || '—'))}</b>
                  </div>
                `;
              }).join('');

              return `
                <div class="ts-ch-item">
                  <div class="ts-ch-avatar">${initials}</div>
                  <div class="ts-ch-content">
                    <div class="ts-ch-top">
                      <div class="ts-ch-user">
                        <span>${eh(item.user)}</span>
                        ${deptBadge}
                      </div>
                      <div class="ts-ch-time">${hmStr}</div>
                    </div>
                    <div class="ts-ch-action">${eh(item.action)}</div>
                    <div>${rowsHtml}</div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `;
      }

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
