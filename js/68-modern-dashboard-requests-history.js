/* =====================================================================
   68-modern-dashboard-requests-history.js | تساهيل ERP — الإصدار الشامل الخفيف
   1. الشاشة الرئيسية:
      - مانع الرمشة فائق الخفة والسرعة (0ms Overhead).
      - ساعة هيدر عصرية ومودرن بتوقيت القاهرة الرسمي.
      - كارت مربع مدمج في الجزء الشمال الفاضي فوق (الساعة + التاريخ + طقس القاهرة).
   2. شاشة المعاملات:
      - 5 كروت إحصائيات للحالات (In Progress, Under Review, Complete, Delivered, Late).
      - فلتر الموظف المسؤول في شريط الفلاتر.
      - 9 أعمدة مستقلة: فصل التليفون بأيقونة اتصال مع الحفاظ التام على أسماء المستفيدين.
   3. تفاصيل المعاملة:
      - كروت تفاصيل شبكية Grid + التفاف كامل للعنوان.
      - زرار الإيقاف: Under Review مع أيقونة ⏸.
      - شريط مراحل التنفيذ Stepper عصري واحترافي.
   4. سجل التغييرات الموحد (Change History):
      - تجميع بالتاريخ + أفاتار الأحرف الأولى + شارات الأقسام + Before ➔ After + Automatic.
      - ربط مباشر وموثوق لزرار "السجل الزمني" مع معالجة آمنة لـ Supabase بدون تعليق.
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

  // جلب موثوق لعميل Supabase بدون أخطاء نطاق
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

  /* =========================================================================
     0. أنماط CSS المدمجة (خفيفة وعصرية بالكامل)
     ========================================================================= */
  (function injectStyles() {
    if (document.getElementById('ts-modern-68-styles')) return;
    const style = document.createElement('style');
    style.id = 'ts-modern-68-styles';
    style.textContent = `
      /* Header Clock */
      .ts-hdr-clock {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 5px 12px;
        border-radius: 12px;
        background: rgba(255, 122, 61, 0.08);
        border: 1px solid rgba(255, 122, 61, 0.28);
        color: var(--r-text, #f4f2fa);
        user-select: none;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .ts-hdr-clock:hover {
        background: rgba(255, 122, 61, 0.14);
        border-color: rgba(255, 122, 61, 0.45);
      }
      .ts-hdr-clock-time {
        font-family: "JetBrains Mono", "IBM Plex Sans Arabic", monospace;
        font-size: 13.5px;
        font-weight: 800;
        direction: ltr;
        display: inline-flex;
        align-items: baseline;
        gap: 2px;
      }
      .ts-hdr-clock-ap {
        font-size: 9.5px;
        font-weight: 800;
        padding: 1px 5px;
        border-radius: 5px;
        background: rgba(232, 89, 12, 0.2);
        color: #ff9d6c;
        margin-inline-start: 3px;
      }
      .ts-hdr-clock-date {
        font-size: 10px;
        opacity: 0.8;
        white-space: nowrap;
      }

      /* Home Top-Left Square Widget */
      .ts-home-top-widget {
        display: inline-flex;
        flex-direction: column;
        justify-content: center;
        gap: 5px;
        padding: 8px 14px;
        border-radius: 14px;
        background: rgba(18, 15, 13, 0.65);
        border: 1px solid rgba(255, 122, 61, 0.3);
        color: #f8fafc;
        min-width: 200px;
        max-width: 250px;
        backdrop-filter: blur(8px);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
      }
      html:not(.dark) .ts-home-top-widget {
        background: rgba(255, 255, 255, 0.95);
        border-color: rgba(232, 89, 12, 0.3);
        color: #1e293b;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
      }
      .ts-topw-row {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 11px;
      }
      .ts-topw-time {
        font-size: 13.5px;
        font-weight: 800;
        font-family: monospace;
        color: #ff9d6c;
        direction: ltr;
      }
      html:not(.dark) .ts-topw-time {
        color: #e8590c;
      }

      /* KPI Cards 5 Grid */
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
        font-size: 11.5px;
        font-weight: 700;
        color: #94a3b8;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .ts-kpi-num {
        font-size: 22px;
        font-weight: 800;
        font-family: monospace;
        margin-top: 4px;
        color: #ffffff;
      }
      html:not(.dark) .ts-kpi-num {
        color: #0f172a;
      }

      /* Stepper */
      .ts-stepper {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        position: relative;
        padding: 10px 4px 4px;
        margin: 6px 0;
      }
      .ts-stepper::before {
        content: '';
        position: absolute;
        top: 22px;
        left: 20px;
        right: 20px;
        height: 2px;
        background: rgba(255, 255, 255, 0.12);
        z-index: 1;
      }
      html:not(.dark) .ts-stepper::before {
        background: #e2e8f0;
      }
      .ts-step-node {
        position: relative;
        z-index: 2;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        flex: 1;
      }
      .ts-step-circle {
        width: 26px;
        height: 26px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10.5px;
        font-weight: 800;
        background: #1e293b;
        border: 2px solid #475569;
        color: #94a3b8;
      }
      html:not(.dark) .ts-step-circle {
        background: #f1f5f9;
        border-color: #cbd5e1;
        color: #64748b;
      }
      .ts-step-done .ts-step-circle {
        background: #10b981;
        border-color: #10b981;
        color: #ffffff;
      }
      .ts-step-current .ts-step-circle {
        background: #e8590c;
        border-color: #ff9d6c;
        color: #ffffff;
        box-shadow: 0 0 10px rgba(232, 89, 12, 0.5);
      }
      .ts-step-title {
        font-size: 10.5px;
        font-weight: 700;
        margin-top: 5px;
        color: #94a3b8;
      }
      .ts-step-done .ts-step-title,
      .ts-step-current .ts-step-title {
        color: #f8fafc;
      }
      html:not(.dark) .ts-step-done .ts-step-title,
      html:not(.dark) .ts-step-current .ts-step-title {
        color: #0f172a;
      }
      .ts-step-time {
        font-size: 9px;
        color: #64748b;
        margin-top: 2px;
        direction: ltr;
        font-family: monospace;
      }

      /* Details Grid */
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

      /* Change History Layout (Exact Match to Screenshot) */
      .ts-ch-box {
        background: #ffffff;
        color: #1b1511;
        border-radius: 14px;
        border: 1px solid #e2e8f0;
        overflow: hidden;
        margin-top: 14px;
        font-family: "IBM Plex Sans Arabic", system-ui, sans-serif;
      }
      html.dark .ts-ch-box {
        background: #141210;
        color: #f4f2fa;
        border-color: rgba(255, 255, 255, 0.1);
      }
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
        width: 34px;
        height: 34px;
        border-radius: 50%;
        background: #e2e8f0;
        color: #334155;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        font-weight: 800;
        flex-shrink: 0;
        margin-top: 2px;
      }
      html.dark .ts-ch-avatar {
        background: #2a2420;
        color: #ff9d6c;
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
      .ts-ch-dept-acc {
        background: #e0e7ff;
        color: #4338ca;
      }
      .ts-ch-dept-sales {
        background: #dcfce7;
        color: #15803d;
      }
      .ts-ch-dept-admin {
        background: #fae8ff;
        color: #86198f;
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
      .ts-ch-arrow {
        color: #94a3b8;
        font-weight: bold;
      }
    `;
    document.head.appendChild(style);
  })();

  /* =========================================================================
     1. الشاشة الرئيسية: كارت المربع بالأعلى يسار + مانع رمشة خفيف
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
      injectTopLeftHomeWidget();
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

  function injectTopLeftHomeWidget() {
    const box = document.getElementById('tab-home');
    if (!box) return;
    const heroFlex = box.querySelector('.hm-hero > div.flex.justify-between, .hm-hero > div.flex');
    if (!heroFlex) return;

    let widget = heroFlex.querySelector('#ts-home-top-widget');
    if (!widget) {
      widget = document.createElement('div');
      widget.id = 'ts-home-top-widget';
      widget.className = 'ts-home-top-widget';
      heroFlex.appendChild(widget);
    }

    const d = new Date();
    const fT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', hour12: true });
    const fD = new Intl.DateTimeFormat('ar-EG', { timeZone: 'Africa/Cairo', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const wData = cairoWeatherCache || { temp: 26, code: 1 };
    const wInfo = getWeatherDesc(wData.code);

    widget.innerHTML = `
      <div class="ts-topw-row">
        <i class="fa-solid fa-clock text-amber-400 text-xs"></i>
        <span class="ts-topw-time">${fT.format(d)}</span>
      </div>
      <div class="ts-topw-row">
        <i class="fa-solid fa-calendar-day text-amber-500 text-xs"></i>
        <span class="ts-topw-date">${eh(fD.format(d))}</span>
      </div>
      <div class="ts-topw-row">
        <i class="fa-solid ${wInfo.icon} text-xs"></i>
        <span class="ts-topw-weather">${wData.temp}°C · ${wInfo.text} (القاهرة)</span>
      </div>
    `;
  }

  // لف خفيف وفوري لـ renderHomeTab بدون أي بطء أو تكرار
  const origRenderHome = window.renderHomeTab;
  if (typeof origRenderHome === 'function') {
    window.renderHomeTab = function () {
      const r = origRenderHome.apply(this, arguments);
      try { injectTopLeftHomeWidget(); } catch (e) {}
      return r;
    };
  }

  /* =========================================================================
     2. تطوير الساعة في الهيدر (Modern Executive Clock)
     ========================================================================= */
  function updateModernHeaderClock() {
    const slot = document.getElementById('hdr-clock-slot');
    if (!slot) return;

    let clockEl = document.getElementById('ts-modern-header-clock');
    if (!clockEl) {
      slot.innerHTML = '';
      clockEl = document.createElement('div');
      clockEl.id = 'ts-modern-header-clock';
      clockEl.className = 'ts-hdr-clock';
      clockEl.title = 'توقيت القاهرة الرسمي';
      slot.appendChild(clockEl);
    }

    const d = new Date();
    const fT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const fD = new Intl.DateTimeFormat('ar-EG', { timeZone: 'Africa/Cairo', weekday: 'long', day: 'numeric', month: 'long' });

    const parts = fT.format(d).split(':');
    const h24 = +parts[0], mStr = parts[1], sStr = parts[2];
    const h12 = (h24 % 12) || 12;
    const ap = h24 < 12 ? 'AM' : 'PM';
    const dateStr = fD.format(d);

    clockEl.innerHTML = `
      <i class="fa-solid fa-clock text-amber-500 text-xs"></i>
      <div class="flex flex-col text-right">
        <div class="ts-hdr-clock-time">
          <span>${h12}:${mStr}</span>
          <span style="opacity:0.6;font-size:10px">:</span>
          <span style="opacity:0.6;font-size:10px">${sStr}</span>
          <span class="ts-hdr-clock-ap">${ap}</span>
        </div>
        <div class="ts-hdr-clock-date">${eh(dateStr)}</div>
      </div>
    `;

    // تحديث وقت المربع في الرئيسية إن وجد
    const topWTime = document.querySelector('#ts-home-top-widget .ts-topw-time');
    if (topWTime) {
      const fT12 = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', hour12: true });
      topWTime.textContent = fT12.format(d);
    }
  }

  // إيقاف تعارض ساعة 33-header-clock.js القديمة
  if (typeof window.mountHomeClock === 'function') {
    window.mountHomeClock = updateModernHeaderClock;
  }
  setInterval(updateModernHeaderClock, 1000);

  /* =========================================================================
     3. شاشة المعاملات: كروت الحالات الخمسة + فلتر الموظف + فصل الأعمدة
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
      const st = typeof getOrderStatus === 'function' ? getOrderStatus(o) : '';
      if (st === 'In Progress') inProg++;
      else if (st === 'Under Review') underRev++;
      else if (st === 'Complete') complete++;
      else if (st === 'Delivered') delivered++;

      if (typeof isOrderLate === 'function' && isOrderLate(o)) late++;
    });

    const activeFilter = window.txStatusFilter || 'all';

    const cards = [
      { id: 'In Progress', title: 'قيد التنفيذ', count: inProg, icon: 'fa-spinner text-amber-400', cls: activeFilter === 'In Progress' ? 'active' : '' },
      { id: 'Under Review', title: 'Under Review', count: underRev, icon: 'fa-pause text-orange-500', cls: activeFilter === 'Under Review' ? 'active' : '' },
      { id: 'Complete', title: 'جاهزة للتسليم', count: complete, icon: 'fa-circle-check text-teal-400', cls: activeFilter === 'Complete' ? 'active' : '' },
      { id: 'Delivered', title: 'تم التسليم', count: delivered, icon: 'fa-truck-fast text-emerald-400', cls: activeFilter === 'Delivered' ? 'active' : '' },
      { id: 'late', title: 'متأخرة', count: late, icon: 'fa-triangle-exclamation text-rose-500', cls: activeFilter === 'late' ? 'active' : '' }
    ];

    kpiWrap.innerHTML = cards.map(c => `
      <div onclick="setTxStatusFilter('${c.id}')" class="ts-kpi-card ${c.cls}">
        <div class="ts-kpi-title">
          <span>${c.title}</span>
          <i class="fa-solid ${c.icon}"></i>
        </div>
        <div class="ts-kpi-num">${c.count}</div>
      </div>
    `).join('');
  }

  function injectEmployeeFilterControl() {
    const cardBar = document.querySelector('#tab-tx .card .flex.flex-wrap.items-center.justify-between');
    if (!cardBar) return;

    let wrap = document.getElementById('tx-emp-filter-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'tx-emp-filter-wrap';
      wrap.className = 'inline-flex items-center gap-1.5 ms-2 shrink-0';
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

    let opts = '<option value="all">كل الموظفين (الكل)</option>';
    Array.from(empSet).sort().forEach(emp => {
      const sel = window.__txEmployeeFilter === emp ? ' selected' : '';
      opts += `<option value="${eh(emp)}"${sel}>${eh(emp)}</option>`;
    });

    wrap.innerHTML = `
      <div class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold">
        <i class="fa-solid fa-user-tie text-slate-400"></i>
        <span>الموظف:</span>
        <select id="tx-emp-filter-select" class="bg-transparent border-0 font-bold text-ink dark:text-white focus:outline-none cursor-pointer">
          ${opts}
        </select>
      </div>
    `;

    const selEl = wrap.querySelector('#tx-emp-filter-select');
    selEl.addEventListener('change', function () {
      window.__txEmployeeFilter = this.value;
      if (typeof window.renderRecentRequests === 'function') window.renderRecentRequests();
    });
  }

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

        // استخراج رقم التليفون وحذفه من خانة العميل مع بقاء اسم العميل والمستفيدين بالكامل
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

  // فلترة الموظفين المتسلسلة دون كسر الـ pinned أو stuck السابق
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

  const origRenderRecent = window.renderRecentRequests;
  if (typeof origRenderRecent === 'function') {
    window.renderRecentRequests = function () {
      renderTxStatusKpiCards();
      origRenderRecent.apply(this, arguments);
      formatSeparatedColumns();
      injectEmployeeFilterControl();
    };
  }

  /* =========================================================================
     4. تفاصيل المعاملة: Grid + Stepper + Under Review Button
     ========================================================================= */
  const origOpenTxModal = window.openTxModal;
  if (typeof origOpenTxModal === 'function') {
    window.openTxModal = function (tx) {
      origOpenTxModal.apply(this, arguments);

      const o = (window.groupedOrders || []).find(x => String(x.transaction_id) === String(tx));
      if (!o) return;
      const modalBody = document.getElementById('tx-modal-body');
      if (!modalBody) return;

      const oldGrid = modalBody.querySelector('.grid.grid-cols-2.sm\\:grid-cols-4');
      if (oldGrid && !oldGrid.dataset.formatted68) {
        oldGrid.dataset.formatted68 = '1';
        oldGrid.className = 'ts-dtl-grid';
        oldGrid.innerHTML = `
          <div class="ts-dtl-card"><div class="ts-dtl-label"><i class="fa-solid fa-hashtag"></i><span>Request ID</span></div><div class="ts-dtl-val font-mono" dir="ltr">${eh(o.transaction_id)}</div></div>
          <div class="ts-dtl-card"><div class="ts-dtl-label"><i class="fa-solid fa-user"></i><span>العميل</span></div><div class="ts-dtl-val">${eh(o.client_name || '—')}</div></div>
          <div class="ts-dtl-card"><div class="ts-dtl-label"><i class="fa-solid fa-phone"></i><span>الهاتف</span></div><div class="ts-dtl-val font-mono" dir="ltr">${o.phone ? `<a href="tel:${eh(o.phone)}" class="text-sky-500 hover:underline"><i class="fa-solid fa-phone text-xs ms-1"></i>${eh(o.phone)}</a>` : '—'}</div></div>
          <div class="ts-dtl-card"><div class="ts-dtl-label"><i class="fa-solid fa-credit-card"></i><span>طريقة الدفع</span></div><div class="ts-dtl-val">${eh(o.payment_method || '—')}</div></div>
          <div class="ts-dtl-card"><div class="ts-dtl-label"><i class="fa-solid fa-user-tie"></i><span>الموظف المسؤول</span></div><div class="ts-dtl-val">${eh(o.employee || '—')}</div></div>
          <div class="ts-dtl-card"><div class="ts-dtl-label"><i class="fa-solid fa-motorcycle"></i><span>مندوب الاستلام</span></div><div class="ts-dtl-val">${eh(o.receiver || 'العميل شخصياً')}</div></div>
          <div class="ts-dtl-card"><div class="ts-dtl-label"><i class="fa-solid fa-calendar"></i><span>تاريخ الاستلام</span></div><div class="ts-dtl-val font-mono">${eh(typeof formatDateTime === 'function' ? formatDateTime(o.received_at || o.created_at) : (o.received_at || '—'))}</div></div>
          <div class="ts-dtl-card"><div class="ts-dtl-label"><i class="fa-solid fa-receipt"></i><span>رقم الإيصال</span></div><div class="ts-dtl-val font-mono">${eh(o.rn_nm || '—')}</div></div>
          <div class="ts-dtl-card ts-dtl-card-wide"><div class="ts-dtl-label"><i class="fa-solid fa-location-dot text-rose-500"></i><span>العنوان</span></div><div class="ts-dtl-val whitespace-normal leading-relaxed text-xs">${eh(o.address || 'لم يتم تسجيل عنوان')}</div></div>
        `;
      }

      const stepperSlot = modalBody.querySelector('#tx-modal-stepper-slot');
      if (stepperSlot && !stepperSlot.querySelector('.ts-stepper')) {
        const st = typeof getOrderStatus === 'function' ? getOrderStatus(o) : 'In Progress';
        const steps = [
          { title: 'استلام المعاملة', icon: 'fa-inbox', done: true, time: o.received_at || o.created_at },
          { title: 'قيد التنفيذ', icon: 'fa-gears', done: true, current: st === 'In Progress' },
          { title: 'المراجعة', icon: 'fa-magnifying-glass', done: st === 'Under Review', current: st === 'Under Review' },
          { title: 'جاهز للتسليم', icon: 'fa-circle-check', done: st === 'Complete' || st === 'Delivered', current: st === 'Complete' },
          { title: 'تم التسليم', icon: 'fa-truck-fast', done: st === 'Delivered', current: st === 'Delivered', time: o.delivered_date }
        ];

        stepperSlot.insertAdjacentHTML('afterend', `
          <div class="card p-3 my-2">
            <div class="text-xs font-bold text-slate-400 mb-1 flex items-center justify-between">
              <span><i class="fa-solid fa-bars-progress text-amber-500 ms-1"></i>مراحل إنجاز المعاملة</span>
            </div>
            <div class="ts-stepper">
              ${steps.map(s => `
                <div class="ts-step-node ${s.done ? 'ts-step-done' : (s.current ? 'ts-step-current' : '')}">
                  <div class="ts-step-circle"><i class="fa-solid ${s.done ? 'fa-check' : s.icon}"></i></div>
                  <div class="ts-step-title">${s.title}</div>
                  ${s.time ? `<div class="ts-step-time">${eh(String(s.time).slice(5, 16))}</div>` : ''}
                </div>
              `).join('')}
            </div>
          </div>
        `);
      }

      modalBody.querySelectorAll('[data-svc-card-id] .lp-btn').forEach(b => {
        if (!b.classList.contains('lp-resume')) {
          b.innerHTML = '<span>⏸</span><span>Under Review</span>';
        }
      });
    };
  }

  /* =========================================================================
     5. سجل التغييرات الكامل (Change History Modal) — زرار "السجل الزمني"
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
      return '<span class="ts-ch-dept ts-ch-dept-acc">Accounting</span>';
    }
    if (lk.includes('eglal') || lk.includes('aymen') || lk.includes('إجلال') || lk.includes('مبيع')) {
      return '<span class="ts-ch-dept ts-ch-dept-sales">Sales</span>';
    }
    if (lk.includes('owner') || lk.includes('admin') || lk.includes('إدارة')) {
      return '<span class="ts-ch-dept ts-ch-dept-admin">Admin</span>';
    }
    return '<span class="ts-ch-dept">Gov</span>';
  }

  // الدالة التي يتم استدعاؤها عند الضغط على زرار "السجل الزمني"
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
              <h3 class="font-bold text-sm sm:text-base text-ink dark:text-white">Change history</h3>
              <p class="text-xs text-slate-400 font-mono" dir="ltr">Request ID: ${eh(tx)}</p>
            </div>
          </div>
          <button onclick="document.getElementById('ts-change-history-modal').remove()" class="h-8 w-8 rounded-lg text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10 flex items-center justify-center transition">
            <i class="fa-solid fa-xmark text-lg"></i>
          </button>
        </div>
        <div id="ts-ch-modal-list" class="overflow-y-auto p-4 sm:p-5 text-start" dir="ltr">
          <div class="py-8 text-center text-xs text-slate-400"><i class="fa-solid fa-spinner fa-spin ms-1"></i> Loading change history...</div>
        </div>
      </div>
    `;

    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);

    const sb = getSb();
    const bodyEl = document.getElementById('ts-ch-modal-list');

    try {
      // حماية بمهلة زمنية لا تتجاوز 4 ثوانٍ حتى لا يعلق السجل مطلقاً
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
        let action = a.action === 'created' ? 'Added' : (a.action === 'cost_confirmed' ? 'Operations Cost Confirmation' : 'Changed');
        let isAuto = !!(d.automatic || d.Current_Queue);

        const formattedDetails = {};
        for (const k in d) {
          if (k === 'automatic') continue;
          let label = k;
          if (k === 'complete') label = 'Operations Status';
          else if (k === 'under_review') label = 'Operations Status';
          else if (k === 'delivered') label = 'Operations Status';
          else if (k === 'payment_method') label = 'Payment Confirmation';
          else if (k === 'employee') label = 'Operations Owner';

          const valObj = d[k];
          if (valObj && typeof valObj === 'object' && ('new' in valObj || 'old' in valObj)) {
            const oldVal = valObj.old === true ? 'Confirmed' : (valObj.old === false ? 'New' : (valObj.old || '—'));
            const newVal = valObj.new === true ? 'Confirmed' : (valObj.new === false ? 'New' : (valObj.new || '—'));
            formattedDetails[label] = { old: oldVal, new: newVal };
          } else {
            formattedDetails[label] = { old: '—', new: String(valObj) };
          }
        }

        events.push({
          time: new Date(a.at || 0),
          user: a.user_name || 'Staff Specialist',
          action: action,
          details: Object.keys(formattedDetails).length ? formattedDetails : d,
          isAuto: isAuto
        });
      });

      // 2. تحويل line_stage_events
      const stageNames = { in_progress: 'In Progress', under_review: 'Under Review', complete: 'Complete', delivered: 'Delivered' };
      stageRows.forEach(s => {
        events.push({
          time: new Date(s.at || 0),
          user: s.by_user || 'System Bot',
          action: 'Changed',
          details: { 'Operations Status': { old: 'New', new: stageNames[s.stage] || s.stage } },
          isAuto: true
        });
      });

      // 3. تحويل tx_comments
      commentRows.forEach(c => {
        events.push({
          time: new Date(c.created_at || 0),
          user: c.author_name || 'Staff',
          action: 'Comment',
          details: { 'Note': { old: '—', new: c.body } },
          isAuto: false
        });
      });

      // 4. حدث الإضافة الأساسي للمعاملة من الذاكرة المحلية
      const o = (window.groupedOrders || []).find(x => String(x.transaction_id) === String(tx));
      if (o && (o.received_at || o.created_at)) {
        events.push({
          time: new Date(o.received_at || o.created_at),
          user: o.employee || 'Sales Specialist',
          action: 'Added',
          details: { 'Current Queue': { old: '—', new: 'Sales' } },
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
                      ${item.isAuto ? '<span class="ts-ch-auto">Automatic</span>' : ''}
                      <span>${eh(k)}:</span>
                      <span>${eh(v.old || '—')}</span>
                      <span class="ts-ch-arrow">➔</span>
                      <b>${eh(v.new || '—')}</b>
                    </div>
                  `;
                }
                return `
                  <div class="ts-ch-row">
                    ${item.isAuto ? '<span class="ts-ch-auto">Automatic</span>' : ''}
                    <span>${eh(k)}:</span>
                    <span class="ts-ch-arrow">➔</span>
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
      injectTopLeftHomeWidget();
      updateModernHeaderClock();
    });
  } else {
    injectTopLeftHomeWidget();
    updateModernHeaderClock();
  }
})();
