/* =====================================================================
   68-modern-dashboard-requests-history.js | تساهيل ERP — الإصدار الذهبي الفائق (v6)
   =====================================================================
   إصلاحات جراحية شاملة للنقاط الستة:
   1. منع الرمشة (Flicker) نهائياً في الشاشة الرئيسية:
      - فصل تحديث عقارب الساعة والأرقام (`updateClockDisplay`) عن إعادة رسم الكروت (`renderHomeTab`).
      - الاحتفاظ بعنصر ساعة الكوكتيل الفاخرة (`#ts-luxury-cockpit-clock`) كعنصر دائم لا يُحذف ولا يُعاد بناؤه عند تحديث البيانات أو الـ Presence.
      - منع إعادة تشغيل أنيميشن الدخول (`r-enter`) والعدادات عند التحديثات الخلفية، مع الحفاظ التام على تصميم ساعة الكوكتيل الفاخرة.
   2. إصلاح فلتر الموظفين بجانب شريط البحث:
      - قراءة مصفوفة `profiles` و `groupedOrders` و `allRequestLines` مباشرة من النطاق العام (`let` في `03-core-app.js`) مع Fallback مباشر من جدول `profiles` في Supabase ومن المعاملات المحملة.
      - تحديث القائمة تلقائياً فور جلب البروفايلات وعند فتح تبويب المعاملات (`tab-tx`) مع إبقاء خيار "الكل".
   3. إزالة تكرار زر الـ QR Code:
      - حذف الزر المعطل (`#ts-qr-integrated-btn`) نهائياً، والإبقاء على زر QR واحد فقط (`#scan-open-btn-tx`) مربوط بدالة المسح الأصلية (`window.scanOpenTx`) بجانب شريط البحث وفلتر الموظفين.
   4. إصلاح عدادات كروت الحالات الخمسة (KPI Cards):
      - حساب الأعداد الفعلية من إجمالي المعاملات المحملة (`groupedOrders`) قبل تطبيق فلتر الحالة حتى لا تصفر باقي الكروت عند اختيار حالة معينة.
      - إظهار الأرقام بخط كبير وواضح بلون متباين داخل كل كارت وتحديثها تلقائياً.
   5. إعادة تصميم شبكة تفاصيل المعاملة (Request Details Grid Layout):
      - الصف الأول: (رقم الطلب Request ID) + (رقم الإيصال Receipt Number) + (الموظف المسؤول بأيقونة واضحة) + (تاريخ الإنشاء).
      - الصف الثاني: (اسم العميل) + (رقم التليفون بأيقونة اتصال) + (بطاقات المستفيدين منظمة).
      - الصف الثالث (Full Width): مربع العنوان (Address) بعرض الكارت بالكامل مع التفاف نص مريح وبدون تداخل.
   6. إصلاح السجل الزمني الموحد (Change History):
      - إزالة التكرار (Deduplication) للأحداث المسجلة في `audit_log` و `line_stage_events` في نفس اللحظة (فارق ثوانٍ).
      - مطابقة `user_id` / `by_user` / `user_name` مع جدول `profiles` ومستخدم الجلسة الحالية لعرض اسم الموظف الحقيقي، وعدم كتابة "تلقائي" إلا إذا كان الفاعل في قاعدة البيانات `null` فعلاً.
      - عرض اسم الخدمة/البند المتأثر بوضوح بجانب اسم الموظف ونوع الإجراء والتغيير (Before ➔ After).
   ===================================================================== */

(function () {
  'use strict';

  if (window.__tasahelModernUpdate68) return;
  window.__tasahelModernUpdate68 = true;

  const eh = typeof escapeHtml === 'function' ? escapeHtml : function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  };

  const norm = typeof normName === 'function' ? normName : function (s) {
    return String(s || '').trim().toLowerCase().replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ');
  };

  /* ---------------------------------------------------------------------
     دوال الوصول الآمن للمتغيرات المعرفة بـ let في js/03-core-app.js
     --------------------------------------------------------------------- */
  function getSb() {
    try {
      if (typeof sbClient !== 'undefined' && sbClient) return sbClient;
      if (window.sbClient) return window.sbClient;
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

  function getProfilesList() {
    try {
      if (typeof profiles !== 'undefined' && Array.isArray(profiles) && profiles.length) return profiles;
    } catch (e) {}
    if (Array.isArray(window.profiles) && window.profiles.length) return window.profiles;
    if (Array.isArray(window.__cachedProfiles68) && window.__cachedProfiles68.length) return window.__cachedProfiles68;
    return [];
  }

  function getCurrentUserObj() {
    try {
      if (typeof currentUser !== 'undefined' && currentUser) return currentUser;
    } catch (e) {}
    return window.currentUser || null;
  }

  function getMyProfileObj() {
    try {
      if (typeof myProfile !== 'undefined' && myProfile) return myProfile;
    } catch (e) {}
    return window.myProfile || null;
  }

  function getAllLinesList() {
    try {
      if (typeof allRequestLines !== 'undefined' && Array.isArray(allRequestLines)) return allRequestLines;
    } catch (e) {}
    if (Array.isArray(window.allRequestLines)) return window.allRequestLines;
    return [];
  }

  function getGroupedOrdersList() {
    try {
      if (typeof groupedOrders !== 'undefined' && Array.isArray(groupedOrders) && groupedOrders.length) return groupedOrders;
    } catch (e) {}
    if (Array.isArray(window.groupedOrders) && window.groupedOrders.length) return window.groupedOrders;
    // Fallback: تجميع من allRequestLines إذا كانت محملة قبل بناء groupedOrders
    const lines = getAllLinesList();
    if (!lines.length) return [];
    const map = new Map();
    lines.forEach(line => {
      const tx = line.transaction_id || ('TX-' + line.id);
      if (!map.has(tx)) {
        map.set(tx, {
          transaction_id: tx,
          client_name: line.client_name,
          phone: line.phone,
          address: line.address,
          employee: line.employee,
          payment_method: line.payment_method,
          receiver: line.receiver,
          received_at: line.received_at,
          rn_nm: line.rn_nm,
          notes: line.notes,
          created_at: line.created_at,
          grand_total: 0,
          lines: []
        });
      }
      const o = map.get(tx);
      o.lines.push(line);
      o.grand_total += Number(line.total) || 0;
    });
    return Array.from(map.values());
  }

  function getActiveTxStatusFilter() {
    try {
      if (typeof txStatusFilter !== 'undefined' && txStatusFilter) return txStatusFilter;
    } catch (e) {}
    return window.txStatusFilter || 'all';
  }

  // Fallback لجلب البروفايلات مباشرة من Supabase إذا لم تكن محملة بعد
  let fetchingProfiles68 = false;
  async function ensureProfilesLoaded68() {
    if (getProfilesList().length > 0 || fetchingProfiles68) return getProfilesList();
    const sb = getSb();
    if (!sb) return [];
    fetchingProfiles68 = true;
    try {
      let r = await sb.from('profiles').select('id,full_name,phone,job_title,avatar_path').order('full_name');
      if (!r.error && Array.isArray(r.data) && r.data.length) {
        window.__cachedProfiles68 = r.data;
        try {
          if (typeof profiles !== 'undefined' && Array.isArray(profiles) && !profiles.length) {
            profiles = r.data;
          }
        } catch (e) {}
        populateEmployeeFilterSelect();
      }
    } catch (e) {}
    fetchingProfiles68 = false;
    return getProfilesList();
  }

  // مطابقة اسم الموظف الحقيقي من UUID أو البريد أو البروفايلات
  function resolveActorInfo(rawName, rawId, fallbackEmp) {
    const candidates = [rawName, rawId].map(x => (x == null ? '' : String(x).trim())).filter(Boolean);
    // إذا كان الحقل في قاعدة البيانات null تماماً ولا يوجد أي معرف للفاعل
    if (!candidates.length) {
      return { name: 'تلقائي (النظام)', isAuto: true };
    }

    const profs = getProfilesList();
    const curUser = getCurrentUserObj();
    const myProf = getMyProfileObj();

    for (let i = 0; i < candidates.length; i++) {
      const s = candidates[i];
      if (!s || s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined') continue;

      // فحص ما إذا كان UUID
      if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(s)) {
        const p = profs.find(x => String(x.id).toLowerCase() === s.toLowerCase());
        if (p && p.full_name) return { name: p.full_name.trim(), isAuto: false };
        if (curUser && String(curUser.id).toLowerCase() === s.toLowerCase()) {
          const myName = (myProf && myProf.full_name) || (curUser.email ? curUser.email.split('@')[0] : '') || fallbackEmp || 'الموظف الحالي';
          return { name: myName, isAuto: false };
        }
        continue;
      }

      // فحص ما إذا كان بريداً إلكترونياً
      if (s.includes('@')) {
        const emailPrefix = s.split('@')[0].toLowerCase();
        const pByEmail = profs.find(x => (x.email && String(x.email).toLowerCase() === s.toLowerCase()) || (x.full_name && norm(x.full_name).includes(emailPrefix)));
        if (pByEmail && pByEmail.full_name) return { name: pByEmail.full_name.trim(), isAuto: false };
        if (curUser && String(curUser.email || '').toLowerCase() === s.toLowerCase() && myProf && myProf.full_name) {
          return { name: myProf.full_name.trim(), isAuto: false };
        }
        return { name: s.split('@')[0], isAuto: false };
      }

      // اسم نصي صريح
      const pByName = profs.find(x => norm(x.full_name) === norm(s));
      if (pByName && pByName.full_name) return { name: pByName.full_name.trim(), isAuto: false };
      return { name: s, isAuto: false };
    }

    // إذا كان هناك UUID غير موجود في قائمة profiles الحالية، نستخدم الموظف المسؤول عن المعاملة أو الموظف الحالي بدلاً من كتابة "تلقائي"
    if (fallbackEmp && String(fallbackEmp).trim()) {
      return { name: String(fallbackEmp).trim(), isAuto: false };
    }
    if (myProf && myProf.full_name) {
      return { name: myProf.full_name.trim(), isAuto: false };
    }
    return { name: 'موظف بالنظام', isAuto: false };
  }

  // حساب حالة المعاملة بدقة
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
      if (typeof window.isLineCancelled === 'function' && window.isLineCancelled(l)) return false;
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
     0. أنماط CSS المدمجة (Cockpit Luxury Dark Theme + Clean Grid + KPI Cards)
     ========================================================================= */
  (function injectStyles() {
    if (document.getElementById('ts-modern-68-styles')) return;
    const style = document.createElement('style');
    style.id = 'ts-modern-68-styles';
    style.textContent = `
      /* ----- Luxury Cockpit Clock Widget (Preserved Design + Anti-Flicker GPU Isolation) ----- */
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
        contain: layout paint;
        transform: translateZ(0);
      }
      /* منع أي أنيميشن دخول متكرر يسبب رمشة للساعة أو كروت الرئيسية */
      #tab-home.ts-home-locked > * {
        animation: none !important;
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
        backface-visibility: hidden;
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
        font-variant-numeric: tabular-nums;
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
        transition: background 0.2s, color 0.2s;
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

      /* ----- KPI 5 Cards (High Contrast Numbers & Clear Layout) ----- */
      .ts-kpi-5-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        margin-bottom: 14px;
      }
      @media (min-width: 640px) {
        .ts-kpi-5-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }
      @media (min-width: 1024px) {
        .ts-kpi-5-grid {
          grid-template-columns: repeat(5, minmax(0, 1fr));
        }
      }
      .ts-kpi-card {
        padding: 14px 16px;
        border-radius: 16px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: linear-gradient(145deg, rgba(28, 22, 18, 0.9), rgba(18, 14, 12, 0.95));
        cursor: pointer;
        text-align: right;
        transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        min-height: 96px;
      }
      html:not(.dark) .ts-kpi-card {
        background: #ffffff;
        border-color: #cbd5e1;
        box-shadow: 0 2px 8px rgba(15, 23, 42, 0.05);
      }
      .ts-kpi-card:hover {
        transform: translateY(-2px);
        border-color: rgba(255, 122, 61, 0.5);
      }
      .ts-kpi-card.active {
        border-color: #ff9d6c !important;
        background: linear-gradient(145deg, rgba(232, 89, 12, 0.22), rgba(28, 22, 18, 0.95)) !important;
        box-shadow: 0 0 16px rgba(255, 122, 61, 0.3);
      }
      html:not(.dark) .ts-kpi-card.active {
        background: #fff7ed !important;
        border-color: #ea580c !important;
      }
      .ts-kpi-title {
        font-size: 12.5px;
        font-weight: 800;
        color: #f1f5f9;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
      }
      html:not(.dark) .ts-kpi-title {
        color: #1e293b;
      }
      .ts-kpi-sub {
        font-size: 11px;
        font-weight: 700;
        color: #94a3b8;
        margin-top: 2px;
      }
      html:not(.dark) .ts-kpi-sub {
        color: #64748b;
      }
      .ts-kpi-num {
        font-size: 28px !important;
        line-height: 1.15 !important;
        font-weight: 900 !important;
        font-family: "JetBrains Mono", monospace !important;
        margin-top: 8px !important;
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
        font-variant-numeric: tabular-nums;
      }

      /* ----- Compact Employee Filter & Single QR Button beside Search ----- */
      .ts-emp-compact-wrap {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 12px;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 122, 61, 0.3);
        color: #f8fafc;
        font-size: 12px;
        font-weight: 700;
        min-height: 34px;
      }
      html:not(.dark) .ts-emp-compact-wrap {
        background: #f8fafc;
        border-color: #cbd5e1;
        color: #0f172a;
      }
      .ts-emp-select {
        background: transparent;
        border: none;
        color: inherit;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        outline: none;
        min-width: 135px;
        max-width: 190px;
      }
      .ts-emp-select option {
        background: #181310;
        color: #f8fafc;
      }
      html:not(.dark) .ts-emp-select option {
        background: #ffffff;
        color: #0f172a;
      }

      /* ----- Request Details Modal Clean 3-Row Grid Layout ----- */
      .ts-dtl-grid {
        display: grid;
        grid-template-columns: repeat(1, minmax(0, 1fr));
        gap: 10px;
      }
      @media (min-width: 480px) {
        .ts-dtl-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
      @media (min-width: 680px) {
        .ts-dtl-grid {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }
      }
      .ts-dtl-card {
        padding: 11px 13px;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.035);
        border: 1px solid rgba(255, 255, 255, 0.09);
        min-width: 0;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        justify-content: center;
      }
      html:not(.dark) .ts-dtl-card {
        background: #f8fafc;
        border-color: #cbd5e1;
      }
      .ts-dtl-label {
        font-size: 11px;
        font-weight: 700;
        color: #94a3b8;
        margin-bottom: 4px;
        display: flex;
        align-items: center;
        gap: 6px;
        white-space: nowrap;
      }
      html:not(.dark) .ts-dtl-label {
        color: #64748b;
      }
      .ts-dtl-val {
        font-weight: 700;
        font-size: 12.5px;
        color: #f8fafc;
        min-width: 0;
        overflow-wrap: anywhere;
        word-break: break-word;
        line-height: 1.45;
      }
      html:not(.dark) .ts-dtl-val {
        color: #0f172a;
      }
      .ts-dtl-card-span2 {
        grid-column: 1 / -1;
      }
      @media (min-width: 680px) {
        .ts-dtl-card-span2 {
          grid-column: span 2;
        }
      }
      .ts-dtl-card-wide {
        grid-column: 1 / -1 !important;
      }

      /* Beneficiaries Inside Row 2 */
      .ts-beneficiaries-grid {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-top: 2px;
      }
      .ts-beneficiary-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 8px;
        padding: 6px 10px;
        border-radius: 9px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
        font-size: 11.5px;
      }
      html:not(.dark) .ts-beneficiary-item {
        background: #ffffff;
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

      /* Hide redundant / confusing buttons & duplicate QR button */
      button.wf-open-btn,
      button.dv-open-btn,
      #aud-box,
      #ts-qr-integrated-btn {
        display: none !important;
      }

      /* ----- Change History Modal (Clear, Deduplicated & Service-Aware) ----- */
      .ts-ch-date-block {
        border-bottom: 1px solid #edf2f7;
        padding-bottom: 10px;
      }
      html.dark .ts-ch-date-block {
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      }
      .ts-ch-date-title {
        font-size: 12px;
        font-weight: 800;
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
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 4px;
      }
      .ts-ch-user {
        font-size: 13px;
        font-weight: 800;
        color: #0f172a;
        display: flex;
        align-items: center;
        flex-wrap: wrap;
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
      .ts-ch-svc-pill {
        font-size: 11px;
        font-weight: 800;
        padding: 2px 8px;
        border-radius: 7px;
        background: rgba(255, 122, 61, 0.14);
        color: #ff9d6c;
        border: 1px solid rgba(255, 122, 61, 0.32);
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      html:not(.dark) .ts-ch-svc-pill {
        background: #fff7ed;
        color: #c2410c;
        border-color: #fdba74;
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
        margin-bottom: 5px;
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px;
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
     1. الساعة الفاخرة في الشاشة الرئيسية (Luxury Cockpit Clock) + منع الرمشة
     ========================================================================= */
  let cairoWeatherCache = null;
  let persistentClockWidget = null;
  let clockIntervalId = null;

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

  function setTextIfChanged(el, text) {
    if (el && el.textContent !== text) {
      el.textContent = text;
    }
  }

  function createClockWidgetElement() {
    if (persistentClockWidget) return persistentClockWidget;
    const existing = document.getElementById('ts-luxury-cockpit-clock');
    if (existing) {
      persistentClockWidget = existing;
      return existing;
    }

    const widget = document.createElement('div');
    widget.id = 'ts-luxury-cockpit-clock';
    widget.className = 'ts-luxury-cockpit';

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
            <button id="ts-fmt-btn-12" type="button" onclick="setTsClockFormat('12')" class="ts-fmt-btn active">✓ 12 ساعة</button>
            <button id="ts-fmt-btn-24" type="button" onclick="setTsClockFormat('24')" class="ts-fmt-btn">24 ساعة</button>
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

    persistentClockWidget = widget;
    return widget;
  }

  function mountLuxuryHomeClock() {
    const tabHome = document.getElementById('tab-home');
    if (!tabHome) return;

    const widget = createClockWidgetElement();
    if (tabHome.firstElementChild !== widget) {
      tabHome.insertBefore(widget, tabHome.firstChild);
    }
    updateClockDisplay();
  }

  // تحديث عقارب الساعة والنصوص فقط دون المساس بكروت الشاشة الرئيسية
  const fGregorianCairo = new Intl.DateTimeFormat('ar-EG', {
    timeZone: 'Africa/Cairo',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
  let fHijriCairo = null;
  try {
    fHijriCairo = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-nu-latn', {
      timeZone: 'Africa/Cairo',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  } catch (e) {}

  function updateClockDisplay() {
    if (document.hidden) return;
    const widget = persistentClockWidget || document.getElementById('ts-luxury-cockpit-clock');
    if (!widget || !document.body.contains(widget)) return;

    const d = new Date();
    const is24 = getClockFormat() === '24';

    // 1. Analog Hands (transform فقط)
    const hEl = document.getElementById('ts-hand-h');
    const mEl = document.getElementById('ts-hand-m');
    const sEl = document.getElementById('ts-hand-s');

    if (hEl && mEl && sEl) {
      const s = d.getSeconds();
      const m = d.getMinutes() + s / 60;
      const h = (d.getHours() % 12) + m / 60;

      hEl.style.transform = `rotate(${(h * 30).toFixed(2)}deg)`;
      mEl.style.transform = `rotate(${(m * 6).toFixed(2)}deg)`;
      sEl.style.transform = `rotate(${s * 6}deg)`;
    }

    // 2. Digital Time (textContent فقط عند التغير)
    const digiTimeEl = document.getElementById('ts-digi-time');
    const digiApEl = document.getElementById('ts-digi-ap');
    if (digiTimeEl && digiApEl) {
      const h24 = d.getHours();
      const mStr = String(d.getMinutes()).padStart(2, '0');
      if (is24) {
        setTextIfChanged(digiTimeEl, `${String(h24).padStart(2, '0')}:${mStr}`);
        setTextIfChanged(digiApEl, '');
      } else {
        const h12 = (h24 % 12) || 12;
        const ap = h24 < 12 ? 'ص' : 'م';
        setTextIfChanged(digiTimeEl, `${h12}:${mStr}`);
        setTextIfChanged(digiApEl, ap);
      }
    }

    // Buttons
    const b12 = document.getElementById('ts-fmt-btn-12');
    const b24 = document.getElementById('ts-fmt-btn-24');
    if (b12 && b24) {
      if (b12.classList.contains('active') === is24) b12.classList.toggle('active', !is24);
      if (b24.classList.contains('active') !== is24) b24.classList.toggle('active', is24);
    }

    // 3. Gregorian Date
    const dateEl = document.getElementById('ts-digi-date');
    if (dateEl) {
      setTextIfChanged(dateEl, fGregorianCairo.format(d));
    }

    // 4. Hijri Date
    const hijriEl = document.getElementById('ts-hijri-full');
    if (hijriEl) {
      try {
        setTextIfChanged(hijriEl, fHijriCairo ? fHijriCairo.format(d) : '1448 هـ');
      } catch (e) {
        setTextIfChanged(hijriEl, '1448 هـ');
      }
    }

    // 5. Weather
    const wData = cairoWeatherCache || { temp: 26, code: 1 };
    const wInfo = getWeatherDesc(wData.code);
    const tempEl = document.getElementById('ts-weather-temp');
    const descEl = document.getElementById('ts-weather-desc');
    const iconEl = document.getElementById('ts-weather-icon');
    setTextIfChanged(tempEl, `${wData.temp}°C`);
    setTextIfChanged(descEl, wInfo.text);
    const wantedIconCls = `fa-solid ${wInfo.icon} text-4xl my-1`;
    if (iconEl && iconEl.className !== wantedIconCls) {
      iconEl.className = wantedIconCls;
    }
  }

  // ربط ذكي مع renderHomeTab يمنع الرمشة تماماً ويحافظ على عنصر الساعة والكروت
  const origRenderHome = window.renderHomeTab;
  if (typeof origRenderHome === 'function') {
    window.renderHomeTab = function () {
      const tabHome = document.getElementById('tab-home');
      if (!tabHome) return origRenderHome.apply(this, arguments);

      // نفصل عنصر الساعة مؤقتاً قبل إعادة رسم الكروت حتى لا يُمسح أو يُفسد مقارنة الـ DOM
      if (persistentClockWidget && persistentClockWidget.parentNode === tabHome) {
        tabHome.removeChild(persistentClockWidget);
      }

      const wasRenderedBefore = tabHome.dataset.tsHomeReady === '1';
      let prevHtml = '';
      let prevNodes = [];
      if (wasRenderedBefore) {
        prevHtml = tabHome.innerHTML;
        prevNodes = Array.prototype.slice.call(tabHome.childNodes);
        // منع 39-reels-ui.js من إعادة تشغيل أنيميشن r-enter والعدادات
        tabHome.__rAt = Date.now();
      }

      const r = origRenderHome.apply(this, arguments);

      try {
        if (wasRenderedBefore) {
          tabHome.classList.remove('r-enter');
          tabHome.classList.add('ts-home-locked');
          if (prevNodes.length && tabHome.innerHTML === prevHtml) {
            tabHome.replaceChildren.apply(tabHome, prevNodes);
          }
        } else {
          tabHome.dataset.tsHomeReady = '1';
          setTimeout(() => { tabHome.classList.add('ts-home-locked'); }, 950);
        }
        mountLuxuryHomeClock();
      } catch (e) {}
      return r;
    };
  }

  if (!clockIntervalId) {
    clockIntervalId = setInterval(updateClockDisplay, 1000);
  }

  /* =========================================================================
     2. شاشة المعاملات: كروت الحالات الخمسة (KPI Cards) من إجمالي groupedOrders
     ========================================================================= */
  window.__txEmployeeFilter = window.__txEmployeeFilter || 'all';

  window.toggleTxKpiFilter68 = function (statusId) {
    const current = getActiveTxStatusFilter();
    const next = current === statusId ? 'all' : statusId;
    if (typeof window.setTxStatusFilter === 'function') {
      window.setTxStatusFilter(next);
    }
  };

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

    // الحساب من إجمالي المعاملات المحملة (groupedOrders) قبل تطبيق فلتر الحالة حتى لا تصفر باقي الكروت
    const allOrders = getGroupedOrdersList();
    let inProg = 0, underRev = 0, complete = 0, delivered = 0, late = 0;

    allOrders.forEach(o => {
      const st = calcOrderStatus(o);
      if (st === 'In Progress') inProg++;
      else if (st === 'Under Review') underRev++;
      else if (st === 'Complete') complete++;
      else if (st === 'Delivered') delivered++;

      if (calcOrderLate(o)) late++;
    });

    const activeFilter = getActiveTxStatusFilter();

    const cards = [
      {
        id: 'In Progress',
        title: 'In Progress',
        sub: 'قيد التنفيذ',
        count: inProg,
        icon: 'fa-spinner text-amber-400',
        numColor: '#fbbf24',
        cls: activeFilter === 'In Progress' ? 'active' : ''
      },
      {
        id: 'Under Review',
        title: 'Under Review',
        sub: 'قيد المراجعة',
        count: underRev,
        icon: 'fa-pause text-orange-500',
        numColor: '#fb923c',
        cls: activeFilter === 'Under Review' ? 'active' : ''
      },
      {
        id: 'Complete',
        title: 'Complete',
        sub: 'جاهزة للتسليم',
        count: complete,
        icon: 'fa-circle-check text-teal-400',
        numColor: '#2dd4bf',
        cls: activeFilter === 'Complete' ? 'active' : ''
      },
      {
        id: 'Delivered',
        title: 'Delivered',
        sub: 'تم التسليم',
        count: delivered,
        icon: 'fa-truck-fast text-emerald-400',
        numColor: '#34d399',
        cls: activeFilter === 'Delivered' ? 'active' : ''
      },
      {
        id: 'late',
        title: 'Late',
        sub: 'متأخرة',
        count: late,
        icon: 'fa-triangle-exclamation text-rose-500',
        numColor: '#fb7185',
        cls: activeFilter === 'late' ? 'active' : ''
      }
    ];

    kpiWrap.innerHTML = cards.map(c => `
      <div onclick="toggleTxKpiFilter68('${c.id}')" class="ts-kpi-card ${c.cls}" role="button" tabindex="0" title="فلترة حسب ${c.sub}">
        <div>
          <div class="ts-kpi-title">
            <span>${c.title}</span>
            <i class="fa-solid ${c.icon}"></i>
          </div>
          <div class="ts-kpi-sub">${c.sub}</div>
        </div>
        <div class="ts-kpi-num" style="color:${c.numColor}">${c.count}</div>
      </div>
    `).join('');
  }

  /* =========================================================================
     3. فلتر الموظفين (متصل بـ Supabase profiles + groupedOrders) + زر QR واحد فقط
     ========================================================================= */
  function collectAllEmployeeNames() {
    const mapByNorm = new Map();
    const addName = raw => {
      const clean = String(raw || '').trim();
      if (!clean || clean === '—' || clean === 'غير محدد') return;
      const k = norm(clean);
      if (!k) return;
      if (!mapByNorm.has(k)) mapByNorm.set(k, clean);
    };

    // 1. من جدول profiles في الذاكرة أو الكاش
    getProfilesList().forEach(p => {
      if (p && p.role !== 'partner' && p.full_name) {
        addName(p.full_name);
      }
    });

    // 2. من groupedOrders
    getGroupedOrdersList().forEach(o => {
      if (o && o.employee) addName(o.employee);
      (o && o.lines ? o.lines : []).forEach(l => {
        if (l && l.employee) addName(l.employee);
      });
    });

    // 3. من allRequestLines
    getAllLinesList().forEach(l => {
      if (l && l.employee) addName(l.employee);
    });

    // 4. من emp-datalist إن وجد
    const dl = document.getElementById('emp-datalist');
    if (dl) {
      Array.from(dl.querySelectorAll('option')).forEach(opt => addName(opt.value || opt.textContent));
    }

    return Array.from(mapByNorm.values()).sort((a, b) => a.localeCompare(b, 'ar'));
  }

  function populateEmployeeFilterSelect() {
    const selEl = document.getElementById('tx-emp-filter-select');
    if (!selEl) return;

    const names = collectAllEmployeeNames();
    const curVal = window.__txEmployeeFilter || 'all';
    const sig = names.join('|') + '::' + curVal;
    if (selEl.dataset.optionsSig === sig) return;
    selEl.dataset.optionsSig = sig;

    let opts = '<option value="all">الكل (جميع الموظفين)</option>';
    names.forEach(emp => {
      const sel = curVal !== 'all' && norm(curVal) === norm(emp) ? ' selected' : '';
      opts += `<option value="${eh(emp)}"${sel}>${eh(emp)}</option>`;
    });
    selEl.innerHTML = opts;
    if (curVal === 'all') selEl.value = 'all';
  }

  function injectCompactEmployeeAndQrFilter() {
    const cardBar = document.querySelector('#tab-tx .card .flex.flex-wrap.items-center.justify-between');
    if (!cardBar) return;

    // 1. إزالة زر الـ QR المعطل المضاف سابقاً تحت شريط البحث نهائياً
    const brokenQr = document.getElementById('ts-qr-integrated-btn');
    if (brokenQr) brokenQr.remove();

    // التأكد من وجود زر الـ QR الأصلي الشغال (#scan-open-btn-tx) بجانب البحث مباشرة
    if (typeof window.ensureSingleTxQrButton === 'function') {
      window.ensureSingleTxQrButton();
    } else {
      const searchInput = document.getElementById('recent-q');
      const searchBox = searchInput && searchInput.parentElement;
      if (searchBox && searchBox.parentElement && !document.getElementById('scan-open-btn-tx')) {
        const b = document.createElement('button');
        b.id = 'scan-open-btn-tx';
        b.type = 'button';
        b.className = 'btn-neo-sec !py-1.5 text-xs shrink-0';
        b.title = 'مسح QR الإيصال لفتح المعاملة';
        b.innerHTML = '<i class="fa-solid fa-qrcode"></i><span>مسح إيصال</span>';
        b.onclick = function () {
          if (typeof window.scanOpenTx === 'function') window.scanOpenTx();
        };
        searchBox.parentElement.insertBefore(b, searchBox.nextSibling);
      }
    }

    // 2. بناء أو تحديث فلتر الموظفين بجانب شريط البحث وزر الـ QR
    let wrap = document.getElementById('tx-emp-filter-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'tx-emp-filter-wrap';
      wrap.className = 'ts-emp-compact-wrap shrink-0';
      wrap.innerHTML = `
        <i class="fa-solid fa-user-tie text-amber-500 text-xs"></i>
        <select id="tx-emp-filter-select" class="ts-emp-select" title="تصفية المعاملات حسب الموظف المسؤول">
          <option value="all">الكل (جميع الموظفين)</option>
        </select>
      `;
      const qrBtn = document.getElementById('scan-open-btn-tx');
      if (qrBtn && qrBtn.parentElement === cardBar) {
        qrBtn.insertAdjacentElement('afterend', wrap);
      } else {
        cardBar.insertBefore(wrap, cardBar.children[1] || null);
      }

      const selEl = wrap.querySelector('#tx-emp-filter-select');
      if (selEl) {
        selEl.addEventListener('change', function () {
          window.__txEmployeeFilter = this.value || 'all';
          if (typeof window.renderRecentRequests === 'function') {
            window.renderRecentRequests();
          }
        });
      }
    }

    populateEmployeeFilterSelect();
    if (!getProfilesList().length) {
      ensureProfilesLoaded68();
    }
  }

  // فلترة الموظفين المتسلسلة
  const prevRecentFilter = window.__recentFilter;
  window.__recentFilter = function (list) {
    if (typeof prevRecentFilter === 'function') list = prevRecentFilter(list);
    if (!window.__txEmployeeFilter || window.__txEmployeeFilter === 'all') return list;
    const target = norm(window.__txEmployeeFilter);
    if (!target) return list;
    return list.filter(o => {
      const empNorm = norm(o.employee || '');
      if (empNorm && (empNorm === target || empNorm.includes(target) || target.includes(empNorm))) return true;
      return (o.lines || []).some(l => {
        const lNorm = norm(l.employee || '');
        return lNorm && (lNorm === target || lNorm.includes(target) || target.includes(lNorm));
      });
    });
  };

  /* =========================================================================
     4. فصل أعمدة الجدول (9 أعمدة) مع الحفاظ التام على أسماء المستفيدين
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
      if (cells.length === 1 && cells[0].getAttribute('colspan') === '8') {
        cells[0].setAttribute('colspan', '9');
        return;
      }
      if (cells.length === 8) {
        const clientCell = cells[1];
        const svcCell = cells[2];

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
      const res = origRenderRecent.apply(this, arguments);
      try {
        renderTxStatusKpiCards();
        formatSeparatedColumns();
        injectCompactEmployeeAndQrFilter();
      } catch (e) {
        console.warn('renderRecentRequests 68:', e);
      }
      return res;
    };
  }

  // ربط تحديث فلتر الموظفين وكروت الحالات عند جلب البروفايلات أو التبديل لتبويب المعاملات
  const origLoadProfiles = window.loadProfiles;
  if (typeof origLoadProfiles === 'function') {
    window.loadProfiles = async function () {
      const res = await origLoadProfiles.apply(this, arguments);
      try {
        injectCompactEmployeeAndQrFilter();
        populateEmployeeFilterSelect();
      } catch (e) {}
      return res;
    };
  }

  const origSwitchTab = window.switchTab;
  if (typeof origSwitchTab === 'function') {
    window.switchTab = function (id) {
      const res = origSwitchTab.apply(this, arguments);
      try {
        if (id === 'tx') {
          renderTxStatusKpiCards();
          injectCompactEmployeeAndQrFilter();
          populateEmployeeFilterSelect();
        } else if (id === 'home') {
          mountLuxuryHomeClock();
        }
      } catch (e) {}
      return res;
    };
  }

  /* =========================================================================
     5. إعادة تصميم شبكة تفاصيل المعاملة (Request Details Grid Layout - 3 صفوف منظمة)
     ========================================================================= */
  function buildBeneficiariesGridHtml(tx, o) {
    const people = typeof window.getRequestPeople === 'function' ? window.getRequestPeople(tx) : [];
    const lines = (o && o.lines) ? o.lines : [];
    if (!people || !people.length) {
      return `
        <div class="ts-beneficiaries-grid">
          <div class="ts-beneficiary-item">
            <span class="font-bold text-ink dark:text-white"><i class="fa-solid fa-user-check text-amber-500 ms-1.5"></i>${eh(o.client_name || 'العميل الأساسي')}</span>
            <span class="text-[11px] text-slate-400">الدفع: <b class="text-ink dark:text-slate-200">${eh(o.payment_method || 'كاش')}</b> · الاستلام: <b class="text-ink dark:text-slate-200">${eh(o.receiver || 'العميل شخصياً')}</b></span>
          </div>
        </div>
      `;
    }

    return `
      <div class="ts-beneficiaries-grid">
        ${people.map((p, idx) => {
          const lineObj = p.line_id ? lines.find(l => String(l.id) === String(p.line_id)) : null;
          const svcLabel = lineObj && lineObj.service ? lineObj.service : 'كل الطلب';
          return `
            <div class="ts-beneficiary-item">
              <div class="flex items-center gap-1.5 min-w-0">
                <span class="font-mono text-[10.5px] text-amber-500 font-bold">${idx + 1}.</span>
                <span class="font-bold text-ink dark:text-white truncate">${eh(p.name || '—')}</span>
                <span class="rounded-md bg-amber-500/10 border border-amber-500/25 px-2 py-0.5 text-[10px] font-bold text-amber-400">${eh(svcLabel)}</span>
              </div>
              ${p.phone ? `<a href="tel:${eh(p.phone)}" class="font-mono text-[11px] text-sky-400 hover:underline" dir="ltr"><i class="fa-solid fa-phone text-[10px] ms-1"></i>${eh(p.phone)}</a>` : ''}
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  const origOpenTxModal = window.openTxModal;
  if (typeof origOpenTxModal === 'function') {
    window.openTxModal = function (tx) {
      const res = origOpenTxModal.apply(this, arguments);

      try {
        const orders = getGroupedOrdersList();
        const o = orders.find(x => String(x.transaction_id) === String(tx));
        if (!o) return res;

        const modalBody = document.getElementById('tx-modal-body');
        if (!modalBody) return res;

        // إزالة أي بلوك مستفيدين مكرر خارج الشبكة لأننا ندمجه بشكل منظم في الصف الثاني
        modalBody.querySelectorAll('.rp-list').forEach(el => el.remove());

        // إعادة تصميم بيانات المعاملة في شبكة CSS Grid من 3 صفوف واضحة
        const oldGrid = modalBody.querySelector('.grid.grid-cols-2.sm\\:grid-cols-4, .ts-dtl-grid');
        if (oldGrid) {
          oldGrid.dataset.formatted68 = '1';
          oldGrid.className = 'ts-dtl-grid my-3 rp-list';

          const createdDateStr = typeof formatDateTime === 'function'
            ? formatDateTime(o.received_at || o.created_at)
            : String(o.received_at || o.created_at || '—');

          const empHtml = typeof empCell === 'function' && o.employee
            ? empCell(o.employee)
            : `<span class="inline-flex items-center gap-1.5"><i class="fa-solid fa-user-tie text-amber-500"></i><span>${eh(o.employee || '—')}</span></span>`;

          const phoneHtml = o.phone
            ? `<a href="tel:${eh(o.phone)}" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-400 hover:bg-sky-500/20 font-mono text-xs transition"><i class="fa-solid fa-phone text-[11px]"></i><span>${eh(o.phone)}</span></a>`
            : '<span class="text-slate-400">—</span>';

          oldGrid.innerHTML = `
            <!-- الصف الأول: Request ID + رقم الإيصال + الموظف المسؤول + تاريخ الإنشاء -->
            <div class="ts-dtl-card">
              <div class="ts-dtl-label"><i class="fa-solid fa-hashtag text-amber-500"></i><span>رقم الطلب (Request ID)</span></div>
              <div class="ts-dtl-val font-mono text-amber-400" dir="ltr">${eh(o.transaction_id)}</div>
            </div>
            <div class="ts-dtl-card">
              <div class="ts-dtl-label"><i class="fa-solid fa-receipt text-amber-500"></i><span>رقم الإيصال</span></div>
              <div class="ts-dtl-val font-mono" dir="ltr">${eh(o.rn_nm || '—')}</div>
            </div>
            <div class="ts-dtl-card">
              <div class="ts-dtl-label"><i class="fa-solid fa-user-tie text-amber-500"></i><span>الموظف المسؤول</span></div>
              <div class="ts-dtl-val">${empHtml}</div>
            </div>
            <div class="ts-dtl-card">
              <div class="ts-dtl-label"><i class="fa-solid fa-calendar-day text-amber-500"></i><span>تاريخ الإنشاء</span></div>
              <div class="ts-dtl-val font-mono text-xs">${eh(createdDateStr)}</div>
            </div>

            <!-- الصف الثاني: اسم العميل + رقم التليفون بأيقونة اتصال + بطاقات المستفيدين منظمة -->
            <div class="ts-dtl-card">
              <div class="ts-dtl-label"><i class="fa-solid fa-user text-amber-500"></i><span>اسم العميل</span></div>
              <div class="ts-dtl-val">${eh(o.client_name || '—')}</div>
            </div>
            <div class="ts-dtl-card">
              <div class="ts-dtl-label"><i class="fa-solid fa-phone-volume text-sky-400"></i><span>رقم التليفون</span></div>
              <div class="ts-dtl-val" dir="ltr">${phoneHtml}</div>
            </div>
            <div class="ts-dtl-card ts-dtl-card-span2">
              <div class="ts-dtl-label"><i class="fa-solid fa-users text-amber-500"></i><span>بطاقات المستفيدين والبيانات المكملة</span></div>
              <div class="ts-dtl-val">${buildBeneficiariesGridHtml(tx, o)}</div>
            </div>

            <!-- الصف الثالث (Full Width): مربع العنوان بعرض الكارت بالكامل -->
            <div class="ts-dtl-card ts-dtl-card-wide">
              <div class="ts-dtl-label"><i class="fa-solid fa-location-dot text-rose-500"></i><span>العنوان الكامل (Address)</span></div>
              <div class="ts-dtl-val whitespace-normal leading-relaxed text-xs sm:text-sm">${eh(o.address || 'لم يتم تسجيل عنوان لهذه المعاملة')}</div>
            </div>
          `;
        }

        // تحويل تواريخ مراحل التنفيذ إلى From ➔ To مفهومة
        modalBody.querySelectorAll('[data-line-events]').forEach(div => {
          const lid = div.getAttribute('data-line-events');
          const line = (o.lines || []).find(l => String(l.id) === String(lid)) || (o.lines && o.lines[0]);
          if (line && div.parentElement) {
            const fromDate = line.exec_start_date
              ? String(line.exec_start_date).slice(0, 10)
              : (o.received_at ? String(o.received_at).slice(0, 10) : 'اليوم');
            const toDate = line.delivered_date
              ? String(line.delivered_date).slice(0, 10)
              : (line.status === 'Complete' ? 'جاهزة للتسليم' : 'قيد المتابعة');

            div.parentElement.innerHTML = `
              <div class="ts-stage-from-to">
                <span class="ts-ft-badge ts-ft-from"><i class="fa-solid fa-play text-[10px]"></i> From (بدء التنفيذ): <b>${eh(fromDate)}</b></span>
                <span class="text-slate-500 text-xs font-bold">➔</span>
                <span class="ts-ft-badge ts-ft-to"><i class="fa-solid fa-flag-checkered text-[10px]"></i> To (الجاهزية / التسليم): <b>${eh(toDate)}</b></span>
              </div>
            `;
          }
        });

        // تسمية زر الإيقاف Under Review بأيقونة الإيقاف المؤقت
        modalBody.querySelectorAll('[data-svc-card-id] .lp-btn').forEach(b => {
          if (!b.classList.contains('lp-resume')) {
            b.innerHTML = '<span>⏸</span><span>Under Review</span>';
          }
        });
      } catch (e) {
        console.warn('openTxModal 68:', e);
      }

      return res;
    };
  }

  /* =========================================================================
     6. السجل الزمني الموحد (Change History): منع التكرار + الفاعل الحقيقي + اسم الخدمة/البند
     ========================================================================= */
  function getInitials(name) {
    if (!name) return 'TS';
    const n = String(name).trim();
    const map = {
      'دنيا محمود': 'DM', 'donia mahmoud': 'DM',
      'أحمد جمال': 'AG', 'احمد جمال': 'AG', 'ahmed gamal': 'AG',
      'أحمد عزت': 'AE', 'احمد عزت': 'AE', 'ahmed ezzat': 'AE',
      'حسن عمران': 'HO', 'hassan omran': 'HO',
      'إجلال أيمن': 'EA', 'اجلال ايمن': 'EA', 'eglal aymen': 'EA',
      'محمود أبو شامة': 'MA', 'محمود ابو شامة': 'MA', 'mahmoud aboshama': 'MA',
      'سعد': 'SA'
    };
    for (const k in map) {
      if (norm(n).includes(norm(k))) return map[k];
    }
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return n.slice(0, 2).toUpperCase();
  }

  function getDeptBadge(name, isAuto) {
    if (isAuto) {
      return '<span class="ts-ch-dept" style="background:#f1f5f9;color:#475569">النظام</span>';
    }
    const lk = String(name || '').toLowerCase();
    if (lk.includes('hassan') || lk.includes('omran') || lk.includes('حسن') || lk.includes('سعد') || lk.includes('حساب')) {
      return '<span class="ts-ch-dept" style="background:#e0e7ff;color:#4338ca">الحسابات</span>';
    }
    if (lk.includes('eglal') || lk.includes('aymen') || lk.includes('إجلال') || lk.includes('اجلال') || lk.includes('مبيع')) {
      return '<span class="ts-ch-dept" style="background:#dcfce7;color:#15803d">المبيعات</span>';
    }
    if (lk.includes('owner') || lk.includes('admin') || lk.includes('إدارة') || lk.includes('ابو شامة') || lk.includes('أبو شامة') || lk.includes('aboshama')) {
      return '<span class="ts-ch-dept" style="background:#fae8ff;color:#86198f">الإدارة</span>';
    }
    return '<span class="ts-ch-dept">الخدمات الحكومية</span>';
  }

  const FIELD_AR_LABELS = {
    'Operations Status': 'حالة تنفيذ الخدمة',
    'status': 'حالة الخدمة',
    'Current Queue': 'القسم المسؤول حالياً',
    'Payment Confirmation': 'تأكيد السداد والتحصيل',
    'Operations Cost Confirmation': 'اعتماد تكلفة التنفيذ',
    'Operations Owner': 'الموظف المسؤول',
    'Review Status': 'حالة المراجعة',
    'qty': 'الكمية / العدد',
    'unit_price': 'سعر الوحدة',
    'list_price': 'السعر الأساسي قبل الخصم',
    'discount_pct': 'نسبة الخصم %',
    'total': 'إجمالي سعر البند',
    'exec_unit_cost': 'تكلفة تنفيذ الوحدة',
    'exec_total': 'إجمالي تكلفة التنفيذ',
    'executor': 'المنفذ',
    'service': 'اسم الخدمة',
    'service_ref': 'مرجع الخدمة (Service ID)',
    'client_name': 'اسم العميل',
    'phone': 'رقم التليفون',
    'address': 'العنوان',
    'employee': 'الموظف المسؤول',
    'payment_method': 'طريقة الدفع',
    'receiver': 'المستلم',
    'rn_nm': 'رقم الإيصال',
    'notes': 'ملاحظات البند',
    'Note': 'ملاحظة مسجلة'
  };

  const VALUE_AR_LABELS = {
    'In Progress': 'قيد التنفيذ (In Progress)',
    'in_progress': 'قيد التنفيذ (In Progress)',
    'Under Review': 'قيد المراجعة (Under Review)',
    'under_review': 'قيد المراجعة (Under Review)',
    'Complete': 'جاهزة للتسليم (Complete)',
    'complete': 'جاهزة للتسليم (Complete)',
    'Delivered': 'تم التسليم للعميل (Delivered)',
    'delivered': 'تم التسليم للعميل (Delivered)',
    'Confirmed': 'معتمد ومؤكد',
    'New': 'جديد / بانتظار البدء',
    'Sales': 'قسم المبيعات',
    'Gov': 'قسم الخدمات الحكومية',
    'Accounting': 'قسم الحسابات',
    'NA': 'غير محدد',
    'true': 'نعم',
    'false': 'لا'
  };

  function resolveServiceNameForEvent(rawService, rawLineId, dObj, orderObj) {
    if (rawService && String(rawService).trim() && String(rawService).trim() !== 'null') {
      return String(rawService).trim();
    }
    if (dObj && typeof dObj === 'object') {
      if (typeof dObj.service === 'string' && dObj.service.trim()) return dObj.service.trim();
      if (dObj.service && typeof dObj.service === 'object' && (dObj.service.new || dObj.service.old)) {
        return String(dObj.service.new || dObj.service.old).trim();
      }
    }
    const lines = (orderObj && Array.isArray(orderObj.lines)) ? orderObj.lines : getAllLinesList();
    if (rawLineId != null && rawLineId !== '') {
      const found = lines.find(l => String(l.id) === String(rawLineId));
      if (found && found.service) return String(found.service).trim();
      const globalFound = getAllLinesList().find(l => String(l.id) === String(rawLineId));
      if (globalFound && globalFound.service) return String(globalFound.service).trim();
    }
    if (orderObj && Array.isArray(orderObj.lines)) {
      if (orderObj.lines.length === 1 && orderObj.lines[0].service) {
        return String(orderObj.lines[0].service).trim();
      }
      if (orderObj.lines.length > 1) {
        return orderObj.lines.map(l => l.service).filter(Boolean).join(' + ');
      }
    }
    return 'كامل المعاملة';
  }

  function formatStatusFromBooleans(d, side) {
    const getB = k => (d[k] && typeof d[k] === 'object' && side in d[k]) ? d[k][side] : undefined;
    const del = getB('delivered');
    const cmp = getB('complete');
    const rev = getB('under_review');
    if (del === true) return VALUE_AR_LABELS['Delivered'];
    if (cmp === true) return VALUE_AR_LABELS['Complete'];
    if (rev === true) return VALUE_AR_LABELS['Under Review'];
    if (del === false || cmp === false || rev === false) return VALUE_AR_LABELS['In Progress'];
    return null;
  }

  function formatFieldVal(key, val) {
    if (val == null || val === '') return '—';
    const s = String(val).trim();
    if (VALUE_AR_LABELS[s]) return VALUE_AR_LABELS[s];
    if (['unit_price', 'list_price', 'total', 'exec_unit_cost', 'exec_total', 'sales_amount'].includes(key)) {
      const num = Number(s);
      if (Number.isFinite(num)) return num.toLocaleString('en-US') + ' ج.م';
    }
    if (key === 'discount_pct') {
      const num = Number(s);
      if (Number.isFinite(num)) return num + '%';
    }
    return s;
  }

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
              <h3 class="font-bold text-sm sm:text-base text-ink dark:text-white">سجل التغييرات الموحد (Change History)</h3>
              <p class="text-xs text-slate-400 font-mono" dir="ltr">Request ID: ${eh(tx)}</p>
            </div>
          </div>
          <button type="button" onclick="document.getElementById('ts-change-history-modal').remove()" class="h-8 w-8 rounded-lg text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10 flex items-center justify-center transition">
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
      await ensureProfilesLoaded68();

      const fetchPromise = Promise.all([
        sb ? sb.from('audit_log').select('*').eq('transaction_id', String(tx)).order('at', { ascending: false }).limit(100) : Promise.resolve({ data: [] }),
        sb ? sb.from('line_stage_events').select('*').eq('transaction_id', String(tx)).order('at', { ascending: false }).limit(50) : Promise.resolve({ data: [] }),
        sb ? sb.from('tx_comments').select('*').eq('transaction_id', String(tx)).order('created_at', { ascending: false }).limit(50) : Promise.resolve({ data: [] })
      ]);

      const timeoutPromise = new Promise(resolve => setTimeout(() => resolve([{ data: [] }, { data: [] }, { data: [] }]), 4500));
      const results = await Promise.race([fetchPromise, timeoutPromise]);

      const auditRows = (results[0] && !results[0].error && Array.isArray(results[0].data)) ? results[0].data : [];
      const stageRows = (results[1] && !results[1].error && Array.isArray(results[1].data)) ? results[1].data : [];
      const commentRows = (results[2] && !results[2].error && Array.isArray(results[2].data)) ? results[2].data : [];

      const o = getGroupedOrdersList().find(x => String(x.transaction_id) === String(tx));
      const rawEvents = [];

      // 1. معالجة سجلات audit_log
      auditRows.forEach(a => {
        const d = a.details || {};
        const tMs = new Date(a.at || 0).getTime();
        const svcName = resolveServiceNameForEvent(a.service, a.line_id, d, o);

        // استكمال معرف الفاعل من line_stage_events القريبة زمنياً إذا كان فارغاً في audit_log
        let matchedStageUser = null;
        stageRows.forEach(s => {
          const sMs = new Date(s.at || 0).getTime();
          if (Math.abs(tMs - sMs) <= 10000 && s.by_user) {
            matchedStageUser = s.by_user;
          }
        });

        const actor = resolveActorInfo(
          a.user_name || d.user_name || d.by,
          a.user_id || a.by_user || a.created_by || matchedStageUser,
          o && o.employee
        );

        let actionLabel = 'تحديث بيانات الخدمة';
        if (a.action === 'created') actionLabel = 'إضافة بند خدمة جديد';
        else if (a.action === 'deleted') actionLabel = 'حذف بند خدمة';
        else if (a.action === 'cost_confirmed') actionLabel = 'اعتماد تكلفة التنفيذ';
        else if (a.action === 'refund' || a.action === 'refund_approved') actionLabel = 'اعتماد استرداد خدمة';
        else if (a.action === 'refund_request') actionLabel = 'طلب استرداد خدمة';

        const formattedDetails = {};
        let hasStatusChange = false;

        // دمج تغييرات الحالات المنطقية (delivered / complete / under_review) في سطر حالة واحد واضح
        if ('delivered' in d || 'complete' in d || 'under_review' in d) {
          const oldSt = formatStatusFromBooleans(d, 'old') || 'قيد التنفيذ (In Progress)';
          const newSt = formatStatusFromBooleans(d, 'new') || 'قيد التنفيذ (In Progress)';
          if (oldSt !== newSt) {
            formattedDetails['حالة تنفيذ الخدمة'] = { old: oldSt, new: newSt };
            actionLabel = 'تغيير حالة الخدمة';
            hasStatusChange = true;
          }
        }

        for (const k in d) {
          if (['automatic', 'delivered', 'complete', 'under_review', 'user_name', 'by'].includes(k)) continue;
          const label = FIELD_AR_LABELS[k] || k;
          const valObj = d[k];
          if (valObj && typeof valObj === 'object' && ('new' in valObj || 'old' in valObj)) {
            const oldFmt = formatFieldVal(k, valObj.old);
            const newFmt = formatFieldVal(k, valObj.new);
            if (oldFmt === newFmt) continue;
            formattedDetails[label] = { old: oldFmt, new: newFmt };
            if (k === 'unit_price' || k === 'total' || k === 'list_price' || k === 'discount_pct') {
              actionLabel = 'تعديل سعر / خصم الخدمة';
            } else if (k === 'status' || k === 'Operations Status') {
              actionLabel = 'تغيير حالة الخدمة';
              hasStatusChange = true;
            }
          } else if (valObj != null && typeof valObj !== 'object') {
            formattedDetails[label] = { old: '—', new: formatFieldVal(k, valObj) };
          }
        }

        if (!Object.keys(formattedDetails).length && a.action === 'created') {
          const lineMatch = o && o.lines ? o.lines.find(l => String(l.id) === String(a.line_id) || l.service === svcName) : null;
          formattedDetails['الخدمة المضافة'] = {
            old: 'جديد',
            new: svcName + (lineMatch && lineMatch.total != null ? ` (${formatFieldVal('total', lineMatch.total)})` : '')
          };
        }

        if (!Object.keys(formattedDetails).length) return;

        rawEvents.push({
          source: 'audit',
          time: new Date(a.at || Date.now()),
          user: actor.name,
          isAuto: actor.isAuto,
          action: actionLabel,
          service: svcName,
          lineId: a.line_id ? String(a.line_id) : '',
          hasStatusChange: hasStatusChange || a.action === 'created',
          details: formattedDetails
        });
      });

      // 2. معالجة line_stage_events مع إزالة التكرار (Deduplication) إذا وُجد حدث مقابل في audit_log
      const stageNames = {
        in_progress: VALUE_AR_LABELS['In Progress'],
        under_review: VALUE_AR_LABELS['Under Review'],
        complete: VALUE_AR_LABELS['Complete'],
        delivered: VALUE_AR_LABELS['Delivered']
      };

      // ترتيب تصاعدي لحساب الحالة السابقة لكل بند بدقة
      const stageRowsAsc = stageRows.slice().sort((a, b) => new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime());
      const lastStageByLine = {};

      stageRowsAsc.forEach(s => {
        const sTime = new Date(s.at || 0);
        const sMs = sTime.getTime();
        const lid = String(s.line_id || '');
        const svcName = resolveServiceNameForEvent(null, lid, null, o);
        const prevStageLabel = lastStageByLine[lid] || 'جديد / بدء التنفيذ';
        const newStageLabel = stageNames[s.stage] || s.stage;
        lastStageByLine[lid] = newStageLabel;

        // فحص التكرار: إذا سُجل نفس التغيير في audit_log في نفس اللحظة (فارق أقل من 10 ثوانٍ) نتجاهل النسخة المكررة
        const isDuplicateOfAudit = rawEvents.some(ev => {
          if (ev.source !== 'audit') return false;
          const diffSec = Math.abs(ev.time.getTime() - sMs);
          if (diffSec > 10000) return false;
          if (ev.lineId && lid && ev.lineId === lid && ev.hasStatusChange) return true;
          if (ev.service === svcName && ev.hasStatusChange) return true;
          return false;
        });

        if (isDuplicateOfAudit) return;

        const actor = resolveActorInfo(null, s.by_user, o && o.employee);

        rawEvents.push({
          source: 'stage',
          time: sTime,
          user: actor.name,
          isAuto: actor.isAuto,
          action: s.stage === 'in_progress' && prevStageLabel === 'جديد / بدء التنفيذ' ? 'بدء تنفيذ الخدمة' : 'تحديث حالة الخدمة',
          service: svcName,
          lineId: lid,
          hasStatusChange: true,
          details: {
            'حالة تنفيذ الخدمة': { old: prevStageLabel, new: newStageLabel }
          }
        });
      });

      // 3. معالجة التعليقات والملاحظات (tx_comments)
      commentRows.forEach(c => {
        const actor = resolveActorInfo(c.author_name, c.author_id, o && o.employee);
        // استخراج اسم الخدمة إذا كانت الملاحظة خاصة بوقف/استئناف خدمة معينة
        let commentSvc = resolveServiceNameForEvent(null, null, null, o);
        const mSvc = /خدمة «([^»]+)»/.exec(c.body || '');
        if (mSvc && mSvc[1]) commentSvc = mSvc[1];

        rawEvents.push({
          source: 'comment',
          time: new Date(c.created_at || Date.now()),
          user: actor.name,
          isAuto: false,
          action: 'ملاحظة مسجلة على المعاملة',
          service: commentSvc,
          lineId: '',
          hasStatusChange: false,
          details: {
            'نص الملاحظة': { old: '—', new: c.body || '—' }
          }
        });
      });

      // 4. إضافة حدث إنشاء المعاملة الأساسي فقط إذا لم يكن مسجلاً بالفعل في السجل
      if (o && (o.received_at || o.created_at)) {
        const initTime = new Date(o.received_at || o.created_at);
        const hasInitEvent = rawEvents.some(ev => Math.abs(ev.time.getTime() - initTime.getTime()) <= 60000 && (ev.action.includes('إضافة') || ev.action.includes('بدء')));
        if (!hasInitEvent) {
          const actor = resolveActorInfo(o.employee, null, o.employee);
          const allSvcs = (o.lines || []).map(l => l.service).filter(Boolean).join(' + ') || 'كامل المعاملة';
          rawEvents.push({
            source: 'init',
            time: initTime,
            user: actor.name,
            isAuto: false,
            action: 'تسجيل وإنشاء المعاملة',
            service: allSvcs,
            lineId: '',
            hasStatusChange: false,
            details: {
              'إجمالي المعاملة عند التسجيل': {
                old: 'جديد',
                new: `${(o.lines || []).length} خدمة — ${formatFieldVal('total', o.grand_total)}`
              }
            }
          });
        }
      }

      // ترتيب تنازلي (الأحدث في الأعلى)
      rawEvents.sort((a, b) => b.time.getTime() - a.time.getTime());

      // مرحلة Deduplication نهائية لمنع أي سطرين متطابقين في نفس الثواني الخمس
      const events = [];
      rawEvents.forEach(ev => {
        const sig = `${ev.action}|${ev.service}|${JSON.stringify(ev.details)}`;
        const dup = events.find(prev => {
          const prevSig = `${prev.action}|${prev.service}|${JSON.stringify(prev.details)}`;
          return prevSig === sig && Math.abs(prev.time.getTime() - ev.time.getTime()) <= 5000;
        });
        if (!dup) {
          events.push(ev);
        } else if (dup.isAuto && !ev.isAuto) {
          dup.user = ev.user;
          dup.isAuto = false;
        }
      });

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
              const deptBadge = getDeptBadge(item.user, item.isAuto);
              const svcBadge = item.service
                ? `<span class="ts-ch-svc-pill"><i class="fa-solid fa-briefcase text-[10px]"></i><span>الخدمة: ${eh(item.service)}</span></span>`
                : '';

              const rowsHtml = Object.keys(item.details).map(k => {
                const v = item.details[k];
                if (v && typeof v === 'object' && ('old' in v || 'new' in v)) {
                  const showBefore = v.old && v.old !== '—';
                  return `
                    <div class="ts-ch-row">
                      ${item.isAuto ? '<span class="ts-ch-auto">تلقائي</span>' : ''}
                      <span class="font-bold text-amber-500">[${eh(item.service || 'المعاملة')}]</span>
                      <span>${eh(k)}:</span>
                      ${showBefore ? `<span class="line-through opacity-75">${eh(v.old)}</span><span class="text-amber-500 font-bold">➔</span>` : ''}
                      <b>${eh(v.new || '—')}</b>
                    </div>
                  `;
                }
                return `
                  <div class="ts-ch-row">
                    ${item.isAuto ? '<span class="ts-ch-auto">تلقائي</span>' : ''}
                    <span class="font-bold text-amber-500">[${eh(item.service || 'المعاملة')}]</span>
                    <span>${eh(k)}:</span>
                    <b>${eh(String(v || '—'))}</b>
                  </div>
                `;
              }).join('');

              return `
                <div class="ts-ch-item">
                  <div class="ts-ch-avatar">${eh(initials)}</div>
                  <div class="ts-ch-content">
                    <div class="ts-ch-top">
                      <div class="ts-ch-user">
                        <span>${eh(item.user)}</span>
                        ${deptBadge}
                        ${svcBadge}
                      </div>
                      <div class="ts-ch-time">${hmStr}</div>
                    </div>
                    <div class="ts-ch-action">
                      <span>${eh(item.action)}</span>
                    </div>
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
      console.error('Timeline Error:', err);
      if (bodyEl) bodyEl.innerHTML = '<div class="py-6 text-center text-xs text-rose-500">حدث خطأ أثناء تحميل السجل</div>';
    }
  };

  // تهيئة أولية
  function init68() {
    mountLuxuryHomeClock();
    ensureProfilesLoaded68();
    renderTxStatusKpiCards();
    injectCompactEmployeeAndQrFilter();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init68);
  } else {
    init68();
  }
  setTimeout(init68, 1200);
})();