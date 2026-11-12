/* =====================================================================
   68-modern-dashboard-requests-history.js | تساهيل ERP — التحديثات الشاملة
   1. الشاشة الرئيسية (Dashboard):
      - منع الرمشة (Flicker) عبر Smart DOM Patching وتخفيف التحديثات الخلفية.
      - تطوير الساعة في الهيدر بتصميم عصري وأنيق (Executive Clock).
      - إضافة كارت معلومات (Widget) في الرئيسية (الساعة + التاريخ + الطقس/الحرارة).
   2. شاشة المعاملات (Requests / Transactions):
      - كروت إحصائيات KPI تفاعلية مقسمة حسب الحالة.
      - فلتر الموظف المسؤول في شريط الفلاتر.
      - فصل أعمدة الجدول: Request ID | اسم العميل | رقم التليفون (أيقونة اتصال) | الخدمة | الموظف | المبلغ | الحالة | التاريخ | إجراءات.
   3. تفاصيل المعاملة (Request Details Modal):
      - تصميم Grid / Cards عصري ومنظم.
      - ضبط التفاف النصوص الطويلة لخانة العنوان (Full width + break-words).
      - زرار الإيقاف "Under Review" مع أيقونة ⏸.
      - شريط مراحل التنفيذ (Modern Stepper / Progress Tracker).
   4. سجل التغييرات الموحد (Change History):
      - دمج السجل الزمني وسجل المتغيرات في واجهة موحدة تطابق التصميم.
      - تجميع بالتاريخ (Date Grouping) من الأحدث للأقدم.
      - أفاتار الأحرف الأولى (DM, AG, HO, EA) + اسم الموظف + شارة القسم (Gov, Accounting, Sales) + التوقيت.
      - تفاصيل التغييرات: اسم الحقل: القيمة القديمة ➔ القيمة الجديدة.
      - شارة Automatic للحركات التلقائية.
      - تسجيل دقيق وشامل لأي تعديل على المعاملة.
   ===================================================================== */

(function () {
  'use strict';
  if (window.__tasahelModernUpdate68) return;
  window.__tasahelModernUpdate68 = true;

  const eh = typeof escapeHtml === 'function' ? escapeHtml : function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  };

  /* =========================================================================
     0. أنماط CSS المدمجة (Tailwind-compatible & Theme Matching)
     ========================================================================= */
  (function injectStyles() {
    if (document.getElementById('ts-modern-68-styles')) return;
    const style = document.createElement('style');
    style.id = 'ts-modern-68-styles';
    style.textContent = `
      /* Header Modern Clock */
      .ts-hdr-clock {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 4px 12px;
        border-radius: 12px;
        background: rgba(255, 122, 61, 0.08);
        border: 1px solid rgba(255, 122, 61, 0.28);
        color: var(--r-text, #f4f2fa);
        user-select: none;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .ts-hdr-clock:hover {
        background: rgba(255, 122, 61, 0.16);
        border-color: rgba(255, 122, 61, 0.45);
      }
      .ts-hdr-clock-time {
        font-family: "JetBrains Mono", "IBM Plex Sans Arabic", monospace;
        font-size: 13.5px;
        font-weight: 800;
        letter-spacing: 0.5px;
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

      /* Home Info Widget */
      .ts-home-widget {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 18px;
        border-radius: 16px;
        background: rgba(27, 21, 17, 0.75);
        border: 1px solid rgba(255, 122, 61, 0.22);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
        margin-top: 12px;
        margin-bottom: 8px;
      }
      html:not(.dark) .ts-home-widget {
        background: #ffffff;
        border-color: rgba(232, 89, 12, 0.25);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
      }
      .ts-widget-item {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 140px;
      }
      .ts-widget-icon {
        width: 38px;
        height: 38px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(255, 122, 61, 0.14);
        color: #ff9d6c;
        font-size: 15px;
      }
      .ts-widget-label {
        font-size: 10.5px;
        color: #94a3b8;
      }
      .ts-widget-val {
        font-size: 13.5px;
        font-weight: 800;
        color: #ffffff;
        font-family: "IBM Plex Sans Arabic", sans-serif;
      }
      html:not(.dark) .ts-widget-val {
        color: #1e293b;
      }

      /* Request Details Grid */
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
        word-break: break-word;
      }
      html:not(.dark) .ts-dtl-val {
        color: #0f172a;
      }
      .ts-dtl-card-wide {
        grid-column: 1 / -1;
      }

      /* Stepper Progress Tracker */
      .ts-stepper {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        position: relative;
        padding: 12px 6px 6px;
        margin: 6px 0;
      }
      .ts-stepper::before {
        content: '';
        position: absolute;
        top: 24px;
        left: 24px;
        right: 24px;
        height: 3px;
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
        width: 28px;
        height: 28px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        font-weight: 800;
        background: #1e293b;
        border: 2px solid #475569;
        color: #94a3b8;
        transition: all 0.2s ease;
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
        box-shadow: 0 0 10px rgba(232, 89, 12, 0.6);
      }
      .ts-step-title {
        font-size: 11px;
        font-weight: 700;
        margin-top: 6px;
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
        font-size: 9.5px;
        color: #64748b;
        margin-top: 2px;
        direction: ltr;
        font-family: monospace;
      }

      /* Change History Section (Exact Screenshot Match) */
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
      .ts-ch-header {
        padding: 12px 18px;
        font-size: 13.5px;
        font-weight: 800;
        border-bottom: 1px solid #e2e8f0;
        background: #f8fafc;
        color: #334155;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      html.dark .ts-ch-header {
        background: #1b1815;
        border-color: rgba(255, 255, 255, 0.08);
        color: #e2e8f0;
      }
      .ts-ch-date-block {
        border-bottom: 1px solid #edf2f7;
        padding-bottom: 12px;
      }
      html.dark .ts-ch-date-block {
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      }
      .ts-ch-date-title {
        font-size: 11.5px;
        font-weight: 700;
        padding: 10px 18px 6px;
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
        position: relative;
      }
      .ts-ch-avatar {
        width: 32px;
        height: 32px;
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
        font-size: 12.5px;
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
        font-size: 11.5px;
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
        font-size: 11.5px;
        color: #64748b;
        margin-bottom: 2px;
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
        font-size: 9.5px;
        font-weight: 800;
        padding: 0px 5px;
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
     1. إصلاح مشكلة الرمشة (Flicker / Auto-refresh) في الشاشة الرئيسية
     ========================================================================= */
  let lastHomeRenderTime = 0;
  let homeRenderQueued = false;

  // دالة ذكية لتحديث شجرة الـ DOM بدون تدمير العناصر وبدون رمشة للصور
  function patchDomTree(target, source) {
    if (!target || !source) return;

    // تحديث الخصائص والنصوص إذا كانت نفس نوع العنصر
    if (target.nodeType === Node.TEXT_NODE && source.nodeType === Node.TEXT_NODE) {
      if (target.nodeValue !== source.nodeValue) {
        target.nodeValue = source.nodeValue;
      }
      return;
    }

    if (target.nodeType === Node.ELEMENT_NODE && source.nodeType === Node.ELEMENT_NODE) {
      // إذا كان العنصر نفسه tag مختلف: استبدله بالكامل
      if (target.tagName !== source.tagName) {
        target.replaceWith(source.cloneNode(true));
        return;
      }

      // الحفاظ على عناصر الصور والـ inputs من التدمير
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        if (target.value !== source.value) target.value = source.value;
      }

      // مزامنة الـ attributes
      const targetAttrs = Array.from(target.attributes);
      const sourceAttrs = Array.from(source.attributes);

      for (const attr of sourceAttrs) {
        if (target.getAttribute(attr.name) !== attr.value) {
          target.setAttribute(attr.name, attr.value);
        }
      }
      for (const attr of targetAttrs) {
        if (!source.hasAttribute(attr.name)) {
          target.removeAttribute(attr.name);
        }
      }

      // مقارنة الأطفال ومزامنتهم
      const tChildren = Array.from(target.childNodes);
      const sChildren = Array.from(source.childNodes);

      const maxLen = Math.max(tChildren.length, sChildren.length);
      for (let i = 0; i < maxLen; i++) {
        const tChild = tChildren[i];
        const sChild = sChildren[i];

        if (!tChild && sChild) {
          target.appendChild(sChild.cloneNode(true));
        } else if (tChild && !sChild) {
          tChild.remove();
        } else if (tChild && sChild) {
          patchDomTree(tChild, sChild);
        }
      }
    }
  }

  // لف دالة renderHomeTab لمنع الرمشة والتحديثات المفرطة في الخلفية
  const origRenderHome = window.renderHomeTab;
  if (typeof origRenderHome === 'function') {
    window.renderHomeTab = function (isUserAction) {
      const box = document.getElementById('tab-home');
      if (!box) return origRenderHome.apply(this, arguments);

      const now = Date.now();
      // لو نداء خلفي متكرر خلال أقل من 10 ثوانٍ والمستخدم مش متفاعل الآن، أجله
      if (!isUserAction && now - lastHomeRenderTime < 10000) {
        if (!homeRenderQueued) {
          homeRenderQueued = true;
          setTimeout(() => {
            homeRenderQueued = false;
            if (window.currentTab === 'home') window.renderHomeTab(false);
          }, 10000);
        }
        return;
      }
      lastHomeRenderTime = now;

      // لو الصندوق لسه فاضي، ارسم عادي
      if (!box.children.length) {
        const r = origRenderHome.apply(this, arguments);
        injectHomeWidget();
        return r;
      }

      // لو مرسوم قبل كده: نبني في الذاكرة ونعمل Patch ناعم في مكانه
      try {
        const offscreen = document.createElement('div');
        offscreen.id = 'tab-home';
        // مؤقتاً نبدل الصندوق لعنصر الذاكرة ونشغل الرسم الأصلي
        const tempParent = box.parentNode;
        const dummy = document.createElement('div');
        dummy.id = 'tab-home-dummy';
        tempParent.replaceChild(dummy, box);
        document.body.appendChild(offscreen);

        origRenderHome.apply(this, arguments);

        // نرجع الصندوق الحقيقي ونعمل patch
        offscreen.remove();
        tempParent.replaceChild(box, dummy);
        patchDomTree(box, offscreen);
        injectHomeWidget();
      } catch (err) {
        // إذا حدث أي استثناء، نرجع للرسم المباشر الآمن
        origRenderHome.apply(this, arguments);
        injectHomeWidget();
      }
    };
  }

  /* =========================================================================
     2. تطوير الساعة في الهيدر (Modern Header Clock)
     ========================================================================= */
  let headerClockTimer = null;
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
  }

  function startHeaderClock() {
    if (headerClockTimer) clearInterval(headerClockTimer);
    updateModernHeaderClock();
    headerClockTimer = setInterval(updateModernHeaderClock, 1000);
  }
  startHeaderClock();

  /* =========================================================================
     3. إضافة كارت معلومات (Widget) في الرئيسية: ساعة + تاريخ + درجة حرارة
     ========================================================================= */
  let cairoWeatherCache = null;
  async function fetchCairoWeather() {
    try {
      const cached = localStorage.getItem('ts_cairo_weather');
      if (cached) {
        const j = JSON.parse(cached);
        if (Date.now() - j.t < 1800000) { // 30 دقيقة
          cairoWeatherCache = j;
          return;
        }
      }
    } catch (e) {}

    try {
      const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=30.0444&longitude=31.2357&current=temperature_2m,weather_code&timezone=Africa%2FCairo');
      if (!res.ok) throw new Error('weather fetch failed');
      const data = await res.json();
      const temp = Math.round(data.current.temperature_2m);
      const code = data.current.weather_code;
      cairoWeatherCache = { temp, code, t: Date.now() };
      localStorage.setItem('ts_cairo_weather', JSON.stringify(cairoWeatherCache));
    } catch (e) {
      if (!cairoWeatherCache) cairoWeatherCache = { temp: 24, code: 0, t: Date.now() };
    }
  }
  fetchCairoWeather();

  function getWeatherDesc(code) {
    if (code === 0) return { text: 'مشمس', icon: 'fa-sun text-amber-400' };
    if (code <= 3) return { text: 'غائم جزئياً', icon: 'fa-cloud-sun text-amber-300' };
    if (code <= 48) return { text: 'ضبابي', icon: 'fa-smog text-slate-300' };
    if (code <= 67) return { text: 'ماطر', icon: 'fa-cloud-rain text-sky-400' };
    return { text: 'معتدل', icon: 'fa-sun text-amber-400' };
  }

  function injectHomeWidget() {
    const box = document.getElementById('tab-home');
    if (!box) return;
    const hero = box.querySelector('.hm-hero');
    if (!hero) return;

    let widget = box.querySelector('#ts-home-main-widget');
    if (!widget) {
      widget = document.createElement('div');
      widget.id = 'ts-home-main-widget';
      widget.className = 'ts-home-widget';
      hero.insertAdjacentElement('afterend', widget);
    }

    const d = new Date();
    const fT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', hour12: true });
    const fD = new Intl.DateTimeFormat('ar-EG', { timeZone: 'Africa/Cairo', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    const wData = cairoWeatherCache || { temp: 24, code: 0 };
    const wInfo = getWeatherDesc(wData.code);

    widget.innerHTML = `
      <div class="ts-widget-item">
        <div class="ts-widget-icon"><i class="fa-solid fa-clock"></i></div>
        <div>
          <div class="ts-widget-label">الساعة الآن (توقيت القاهرة)</div>
          <div class="ts-widget-val font-mono" dir="ltr">${fT.format(d)}</div>
        </div>
      </div>
      <div class="ts-widget-item">
        <div class="ts-widget-icon"><i class="fa-solid fa-calendar-day"></i></div>
        <div>
          <div class="ts-widget-label">تاريخ اليوم</div>
          <div class="ts-widget-val">${eh(fD.format(d))}</div>
        </div>
      </div>
      <div class="ts-widget-item">
        <div class="ts-widget-icon"><i class="fa-solid ${wInfo.icon}"></i></div>
        <div>
          <div class="ts-widget-label">الطقس في القاهرة</div>
          <div class="ts-widget-val font-mono">${wData.temp}°C · <span class="font-sans text-xs font-semibold">${wInfo.text}</span></div>
        </div>
      </div>
    `;
  }

  /* =========================================================================
     4. شاشة المعاملات: كروت الإحصائيات (KPI Cards) + فلتر الموظف + فصل الأعمدة
     ========================================================================= */
  window.__txEmployeeFilter = 'all';

  // لف renderRecentRequests لتطبيق فلتر الموظف وفصل الأعمدة بدقة
  const origRenderRecent = window.renderRecentRequests;
  if (typeof origRenderRecent === 'function') {
    window.renderRecentRequests = function () {
      // 1. تحديث كروت الإحصائيات الأربعة العلوية
      updateTxKpiCards();

      // 2. تطبيق فلتر الموظف على القائمة
      const origFilter = window.__recentFilter;
      window.__recentFilter = function (list) {
        let res = typeof origFilter === 'function' ? origFilter(list) : list;
        if (window.__txEmployeeFilter && window.__txEmployeeFilter !== 'all') {
          const target = window.__txEmployeeFilter.trim().toLowerCase();
          res = res.filter(o => (o.employee || '').trim().toLowerCase() === target);
        }
        return res;
      };

      // 3. استدعاء الدالة الأصلية لحساب الفلاتر والتقسيم
      origRenderRecent.apply(this, arguments);

      // 4. تعديل رأس الجدول والصفوف لفصل الأعمدة وتعيين أيقونة الهاتف
      adjustTransactionsTableColumns();

      // 5. زرع فلتر الموظف في شريط الفلاتر
      injectEmployeeFilterControl();
    };
  }

  function updateTxKpiCards() {
    try {
      const today = new Date().toLocaleDateString('en-CA');
      const openOrders = (window.groupedOrders || []).filter(o => typeof getOrderStatus === 'function' && getOrderStatus(o) !== 'Delivered');
      const lateOrders = (window.groupedOrders || []).filter(o => typeof isOrderLate === 'function' && isOrderLate(o));
      const readyOrders = (window.groupedOrders || []).filter(o => typeof getOrderStatus === 'function' && getOrderStatus(o) === 'Complete');
      const deliveredToday = (window.groupedOrders || []).filter(o => {
        const st = typeof getOrderStatus === 'function' ? getOrderStatus(o) : '';
        const d = typeof dayKey === 'function' ? dayKey(o.delivered_date || o.received_at || o.created_at) : '';
        return st === 'Delivered' && d === today;
      });

      const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = String(v); };
      setVal('tx-kpi-open', openOrders.length);
      setVal('tx-kpi-late', lateOrders.length);
      setVal('tx-kpi-ready', readyOrders.length);
      setVal('tx-kpi-today', deliveredToday.length);

      // تحديث مسمى الكارت الرابع ليصبح "سُلّمت اليوم" كما بالصورة
      const todayCardTitle = document.querySelector('#tx-kpi-today')?.parentElement?.querySelector('span');
      if (todayCardTitle) todayCardTitle.textContent = 'سُلّمت اليوم';
    } catch (e) {
      console.warn('tx kpi update error', e);
    }
  }

  function injectEmployeeFilterControl() {
    const bar = document.querySelector('#tab-tx .card .flex.items-center');
    if (!bar || document.getElementById('tx-emp-filter-select')) return;

    const wrap = document.createElement('div');
    wrap.id = 'tx-emp-filter-wrap';
    wrap.className = 'inline-flex items-center gap-1.5 ms-2';

    // استخراج أسماء الموظفين
    const employees = new Set();
    if (Array.isArray(window.profiles)) {
      window.profiles.forEach(p => { if (p.full_name) employees.add(p.full_name.trim()); });
    }
    if (Array.isArray(window.groupedOrders)) {
      window.groupedOrders.forEach(o => { if (o.employee) employees.add(o.employee.trim()); });
    }

    let opts = '<option value="all">كل الموظفين</option>';
    Array.from(employees).sort().forEach(emp => {
      const sel = window.__txEmployeeFilter === emp ? ' selected' : '';
      opts += `<option value="${eh(emp)}"${sel}>${eh(emp)}</option>`;
    });

    wrap.innerHTML = `
      <span class="text-xs text-slate-400 font-semibold"><i class="fa-solid fa-user-tie ms-1"></i>الموظف:</span>
      <select id="tx-emp-filter-select" class="field !py-1 !px-2 text-xs font-semibold rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
        ${opts}
      </select>
    `;

    bar.appendChild(wrap);

    const selEl = wrap.querySelector('#tx-emp-filter-select');
    selEl.addEventListener('change', function () {
      window.__txEmployeeFilter = this.value;
      if (typeof window.renderRecentRequests === 'function') window.renderRecentRequests();
    });
  }

  function adjustTransactionsTableColumns() {
    const table = document.querySelector('#tab-tx table');
    if (!table) return;

    // 1. تحديث Thead ليحتوي على عمود مستقل لـ Request ID، اسم العميل، ورقم التليفون
    const theadTr = table.querySelector('thead tr');
    if (theadTr && !theadTr.dataset.separatedCols) {
      theadTr.dataset.separatedCols = '1';
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

    // 2. تحديث Tbody لتقسيم البيانات واستخدام أيقونة الاتصال بدل الواتساب
    const tbody = table.querySelector('tbody#recent-table-body');
    if (!tbody) return;

    Array.from(tbody.querySelectorAll('tr')).forEach(tr => {
      const cells = tr.children;
      // إذا كان الصف غير مقسم بعد (8 أعمدة بدل 9)
      if (cells.length === 8) {
        const idCell = cells[0];
        const clientCell = cells[1];
        const svcCell = cells[2];
        const empCell = cells[3];
        const amountCell = cells[4];
        const statusCell = cells[5];
        const dateCell = cells[6];
        const actionCell = cells[7];

        // استخراج اسم العميل والتليفون
        const clientBtn = clientCell.querySelector('button');
        const clientName = clientBtn ? clientBtn.textContent.trim() : clientCell.textContent.trim();
        const phoneDiv = clientCell.querySelector('.rc-phone-pill, span');
        let phoneText = '';
        if (phoneDiv) {
          const match = phoneDiv.textContent.match(/\d{9,15}/);
          if (match) phoneText = match[0];
        }

        // إنشاء عمود التليفون الجديد مع أيقونة اتصال
        const phoneTd = document.createElement('td');
        phoneTd.className = 'px-3 py-3 whitespace-nowrap text-xs';
        phoneTd.setAttribute('dir', 'ltr');
        if (phoneText) {
          phoneTd.innerHTML = `
            <a href="tel:${eh(phoneText)}" onclick="event.stopPropagation()" class="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-300 border border-sky-200 dark:border-sky-800 font-mono hover:bg-sky-100 transition" title="اتصال">
              <i class="fa-solid fa-phone text-[10px]"></i>
              <span>${eh(phoneText)}</span>
            </a>
          `;
        } else {
          phoneTd.innerHTML = '<span class="text-slate-400">—</span>';
        }

        // تنظيف خانة العميل لتعرض الاسم فقط
        clientCell.innerHTML = `<span class="font-bold text-ink dark:text-white leading-snug">${eh(clientName)}</span>`;

        // إدراج خانة التليفون بعد خانة اسم العميل
        tr.insertBefore(phoneTd, svcCell);
      }
    });
  }

  /* =========================================================================
     5. كارت تفاصيل المعاملة (Grid UI + التواء النصوص + Stepper + Under Review)
     ========================================================================= */
  const origOpenTxModal = window.openTxModal;
  if (typeof origOpenTxModal === 'function') {
    window.openTxModal = function (tx) {
      origOpenTxModal.apply(this, arguments);

      const o = (window.groupedOrders || []).find(x => String(x.transaction_id) === String(tx));
      if (!o) return;

      const modalBody = document.getElementById('tx-modal-body');
      if (!modalBody) return;

      // 1. إعادة تصميم قسم تفاصيل العميل إلى Grid / Cards مريحة وضبط التفاف العنوان
      reformatModalDetailsGrid(o, modalBody);

      // 2. تحديث شريط مراحل التنفيذ (Modern Stepper)
      reformatModalStepper(o, modalBody);

      // 3. بناء ودمج سجل التغييرات الموحد (Change History)
      mountUnifiedChangeHistory(tx, modalBody);

      // 4. التأكد من زرار Under Review
      decorateUnderReviewButtons();
    };
  }

  function reformatModalDetailsGrid(o, modalBody) {
    const oldGrid = modalBody.querySelector('.grid.grid-cols-2.sm\\:grid-cols-4');
    if (!oldGrid) return;

    const cards = [
      { label: 'Request ID', val: `<span class="font-mono" dir="ltr">${eh(o.transaction_id)}</span>`, ic: 'fa-hashtag' },
      { label: 'العميل', val: eh(o.client_name || '—'), ic: 'fa-user' },
      {
        label: 'الهاتف',
        val: o.phone
          ? `<a href="tel:${eh(o.phone)}" class="text-sky-500 hover:underline font-mono inline-flex items-center gap-1.5"><i class="fa-solid fa-phone text-xs"></i><span>${eh(o.phone)}</span></a>`
          : '—',
        ic: 'fa-phone'
      },
      { label: 'طريقة الدفع', val: eh(o.payment_method || '—'), ic: 'fa-credit-card' },
      { label: 'الموظف المسؤول', val: eh(o.employee || '—'), ic: 'fa-user-tie' },
      { label: 'مندوب الاستلام', val: eh(o.receiver || 'العميل شخصياً'), ic: 'fa-motorcycle' },
      { label: 'تاريخ الاستلام', val: eh(typeof formatDateTime === 'function' ? formatDateTime(o.received_at || o.created_at) : (o.received_at || '—')), ic: 'fa-calendar' },
      { label: 'رقم الإيصال', val: eh(o.rn_nm || '—'), ic: 'fa-receipt' },
      {
        label: 'العنوان',
        val: eh(o.address || 'لم يتم تسجيل عنوان للعميل'),
        ic: 'fa-location-dot text-rose-500',
        wide: true
      }
    ];

    const gridHtml = `
      <div class="ts-dtl-grid">
        ${cards.map(c => `
          <div class="ts-dtl-card ${c.wide ? 'ts-dtl-card-wide' : ''}">
            <div class="ts-dtl-label"><i class="fa-solid ${c.ic}"></i><span>${c.label}</span></div>
            <div class="ts-dtl-val ${c.wide ? 'whitespace-normal leading-relaxed' : 'truncate'}">${c.val}</div>
          </div>
        `).join('')}
      </div>
    `;

    oldGrid.outerHTML = gridHtml;
  }

  function reformatModalStepper(o, modalBody) {
    const stepperSlot = modalBody.querySelector('#tx-modal-stepper-slot');
    if (!stepperSlot) return;

    const st = typeof getOrderStatus === 'function' ? getOrderStatus(o) : 'In Progress';
    const isLate = typeof isOrderLate === 'function' ? isOrderLate(o) : false;

    const steps = [
      { key: 'received', title: 'استلام المعاملة', icon: 'fa-inbox', done: true, time: o.received_at || o.created_at },
      { key: 'in_progress', title: 'قيد التنفيذ', icon: 'fa-gears', done: true, time: o.received_at },
      { key: 'under_review', title: 'المراجعة', icon: 'fa-magnifying-glass', done: st === 'Under Review', current: st === 'Under Review', alert: st === 'Under Review' },
      { key: 'complete', title: 'جاهز للتسليم', icon: 'fa-circle-check', done: st === 'Complete' || st === 'Delivered', current: st === 'Complete' },
      { key: 'delivered', title: 'تم التسليم', icon: 'fa-truck-fast', done: st === 'Delivered', current: st === 'Delivered', time: o.delivered_date }
    ];

    let stepperHtml = `
      <div class="card p-3.5 mb-2">
        <div class="flex items-center justify-between text-xs font-bold text-slate-400 mb-1">
          <span><i class="fa-solid fa-bars-progress text-amber-500 ms-1"></i>مراحل إنجاز المعاملة</span>
          ${isLate ? '<span class="text-rose-500 font-bold"><i class="fa-solid fa-triangle-exclamation ms-1"></i>متأخرة عن الموعد</span>' : ''}
        </div>
        <div class="ts-stepper">
          ${steps.map((s, idx) => {
            const cls = s.done ? 'ts-step-done' : (s.current ? 'ts-step-current' : '');
            return `
              <div class="ts-step-node ${cls}">
                <div class="ts-step-circle">
                  <i class="fa-solid ${s.done ? 'fa-check' : s.icon}"></i>
                </div>
                <div class="ts-step-title">${s.title}</div>
                ${s.time ? `<div class="ts-step-time">${eh(String(s.time).slice(5, 16))}</div>` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    stepperSlot.insertAdjacentHTML('afterend', stepperHtml);
  }

  function decorateUnderReviewButtons() {
    document.querySelectorAll('#tx-modal-body [data-svc-card-id]').forEach(function (card) {
      const b = card.querySelector('.lp-btn');
      if (b && !b.dataset.customized) {
        b.dataset.customized = '1';
        const isPaused = b.classList.contains('lp-resume');
        b.innerHTML = isPaused
          ? '<i class="fa-solid fa-play"></i><span>استئناف</span>'
          : '<span>⏸</span><span>Under Review</span>';
      }
    });
  }

  /* =========================================================================
     6. سجل التغييرات الموحد (Unified Change History)
     ========================================================================= */
  // إخفاء الـ details القديم لسجل التغييرات لمنع التكرار
  const hideOldAuditBox = () => {
    const oldBox = document.getElementById('aud-box');
    if (oldBox) oldBox.style.display = 'none';
  };

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

  async function mountUnifiedChangeHistory(tx, modalBody) {
    hideOldAuditBox();

    let chBox = document.getElementById('ts-unified-change-history');
    if (!chBox) {
      chBox = document.createElement('div');
      chBox.id = 'ts-unified-change-history';
      chBox.className = 'ts-ch-box';
      modalBody.appendChild(chBox);
    }

    chBox.innerHTML = `
      <div class="ts-ch-header">
        <div class="flex items-center gap-2"><i class="fa-solid fa-clock-rotate-left text-amber-500"></i><span>Change history</span></div>
        <div class="text-xs text-slate-400 font-mono">${eh(tx)}</div>
      </div>
      <div id="ts-ch-list" class="p-4 text-center text-xs text-slate-400">
        <i class="fa-solid fa-spinner fa-spin ms-1"></i> جارٍ تجميع سجل التغييرات...
      </div>
    `;

    // سحب كل الأحداث من audit_log و line_stage_events و tx_comments
    try {
      const results = await Promise.all([
        window.sbClient.from('audit_log').select('*').eq('transaction_id', String(tx)).order('at', { ascending: false }).limit(100),
        window.sbClient.from('line_stage_events').select('*').eq('transaction_id', String(tx)).order('at', { ascending: false }).limit(50),
        window.sbClient.from('tx_comments').select('*').eq('transaction_id', String(tx)).order('created_at', { ascending: false }).limit(50)
      ]);

      const auditRows = (!results[0].error && Array.isArray(results[0].data)) ? results[0].data : [];
      const stageRows = (!results[1].error && Array.isArray(results[1].data)) ? results[1].data : [];
      const commentRows = (!results[2].error && Array.isArray(results[2].data)) ? results[2].data : [];

      const events = [];

      // 1. تحويل سجلات audit_log
      auditRows.forEach(a => {
        events.push({
          time: new Date(a.at || 0),
          user: a.user_name || 'موظف',
          action: a.action === 'created' ? 'Added' : (a.action === 'cost_confirmed' ? 'Operations Cost Confirmation' : 'Changed'),
          details: a.details || {},
          service: a.service,
          isAuto: !!(a.details && (a.details.automatic || a.details.Current_Queue))
        });
      });

      // 2. تحويل انتقالات المراحل line_stage_events
      const stageLabels = { in_progress: 'In Progress', under_review: 'Under Review', complete: 'Complete', delivered: 'Delivered' };
      stageRows.forEach(s => {
        events.push({
          time: new Date(s.at || 0),
          user: 'System',
          action: 'Changed',
          details: { 'Operations Status': { old: '—', new: stageLabels[s.stage] || s.stage } },
          isAuto: true
        });
      });

      // 3. تحويل التعليقات ووقف/استئناف الخدمات
      commentRows.forEach(c => {
        events.push({
          time: new Date(c.created_at || 0),
          user: c.author_name || 'موظف',
          action: 'Comment',
          details: { 'Note': { old: '', new: c.body } },
          isAuto: false
        });
      });

      // إضافة حدث الإنشاء الأساسي للمعاملة إذا كان مسجلاً
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

      // ترتيب كل الأحداث تنازلياً من الأحدث للأقدم
      events.sort((a, b) => b.time.getTime() - a.time.getTime());

      // تجميع الأحداث حسب التاريخ (Date Grouping)
      const groups = {};
      events.forEach(ev => {
        const d = ev.time;
        const dayStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
        if (!groups[dayStr]) groups[dayStr] = [];
        groups[dayStr].push(ev);
      });

      const listEl = document.getElementById('ts-ch-list');
      if (!listEl) return;

      if (!Object.keys(groups).length) {
        listEl.innerHTML = '<div class="py-6 text-center text-xs text-slate-400">لا توجد حركات مسجلة على هذه المعاملة حتى الآن</div>';
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

              // بناء صفوف التغييرات Before ➔ After
              const rowsHtml = Object.keys(item.details).map(k => {
                const valObj = item.details[k];
                if (valObj && typeof valObj === 'object' && ('old' in valObj || 'new' in valObj)) {
                  return `
                    <div class="ts-ch-row">
                      ${item.isAuto ? '<span class="ts-ch-auto">Automatic</span>' : ''}
                      <span>${eh(k)}:</span>
                      <span>${eh(valObj.old || '—')}</span>
                      <span class="ts-ch-arrow">➔</span>
                      <b>${eh(valObj.new || '—')}</b>
                    </div>
                  `;
                }
                return `
                  <div class="ts-ch-row">
                    ${item.isAuto ? '<span class="ts-ch-auto">Automatic</span>' : ''}
                    <span>${eh(k)}:</span>
                    <span class="ts-ch-arrow">➔</span>
                    <b>${eh(String(valObj || '—'))}</b>
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

      listEl.innerHTML = html;
    } catch (err) {
      console.warn('change history load error', err);
    }
  }

  // ربط دوال الفتح السابقة لتفتح سجل التغييرات الموحد بسلاسة
  window.p51OpenTimelineModal = function (tx) {
    if (typeof window.openTxModal === 'function') {
      window.openTxModal(tx);
      setTimeout(() => {
        const el = document.getElementById('ts-unified-change-history');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 200);
    }
  };

  /* =========================================================================
     7. تسجيل شامل ودقيق: اعتراض saveTxEdit لتسجيل أي تعديل في audit_log
     ========================================================================= */
  const origSaveTxEdit = window.saveTxEdit;
  if (typeof origSaveTxEdit === 'function') {
    window.saveTxEdit = async function () {
      try {
        const st = window.txEditState;
        if (st && st.tx && window.sbClient && window.currentUser) {
          const editor = (window.myProfile && window.myProfile.full_name) || window.currentUser.email || 'موظف';
          const first = st.o && st.o.lines && st.o.lines[0];
          if (first) {
            const client = (document.getElementById('te-client')?.value || '').trim();
            const phone = (document.getElementById('te-phone')?.value || '').trim();
            const addr = (document.getElementById('te-addr')?.value || '').trim();
            const emp = (document.getElementById('te-emp')?.value || '').trim();

            const changes = {};
            if (client && client !== first.client_name) changes['Client Name'] = { old: first.client_name || '—', new: client };
            if (phone !== first.phone) changes['Phone'] = { old: first.phone || '—', new: phone || '—' };
            if (addr !== first.address) changes['Address'] = { old: first.address || '—', new: addr || '—' };
            if (emp && emp !== first.employee) changes['Employee'] = { old: first.employee || '—', new: emp };

            if (Object.keys(changes).length) {
              await window.sbClient.from('audit_log').insert({
                transaction_id: String(st.tx),
                action: 'updated',
                user_name: editor,
                details: changes
              });
            }
          }
        }
      } catch (e) {
        console.warn('audit log intercept error', e);
      }
      return origSaveTxEdit.apply(this, arguments);
    };
  }

  // التهيئة المبدئية عند اكتمال تحميل المستند
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      injectHomeWidget();
      updateModernHeaderClock();
    });
  } else {
    injectHomeWidget();
    updateModernHeaderClock();
  }
})();
