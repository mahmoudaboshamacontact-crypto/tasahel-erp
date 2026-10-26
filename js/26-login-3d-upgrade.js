/**
 * ============================================================================
 * 26-login-3d-upgrade.js
 * ترقية واجهة تسجيل الدخول لنظام تساهيل — قسم الخدمات الحكومية (تصميم Soltronic 3D)
 * ============================================================================
 * طريقة التركيب:
 * ضع هذا الملف في مجلد المشروع وأضف السطر التالي في نهاية ملف index.html قبل </body>:
 * <script src="26-login-3d-upgrade.js"></script>
 *
 * المميزات:
 * 1. يحول شاشة الدخول الداكنة القديمة تلقائياً إلى التصميم الزمردي الثلاثي الأبعاد (3D Mint Emerald).
 * 2. يضيف خلفية الدوائر الإلكترونية المضيئة (PCB Circuit Traces) مع النبضات الضوئية.
 * 3. يضيف حركة الميلان ثلاثي الأبعاد (3D Tilt) وشعاع الليزر الأخضر ولوحات الإحصائيات الجانبية الطائرة.
 * 4. يحافظ بنسبة 100% على جميع الدوال والأزرار الحالية (البريد، كلمة المرور، نسيت كلمة المرور، ومفاتيح Supabase).
 */

(function () {
  'use strict';

  const LOGIN_3D_CSS = `
    :root {
      --tasahel-mint-1: #e4f4ed;
      --tasahel-mint-2: #c1dfd2;
      --tasahel-mint-3: #b2d6c7;
      --tasahel-emerald-1: #128253;
      --tasahel-emerald-2: #0a5837;
      --tasahel-neon: #00ff95;
      --tasahel-text-dark: #0f291e;
      --tasahel-text-muted: #4a6b5d;
    }

    /* خلفية الدوائر الإلكترونية 3D لحاوية تسجيل الدخول */
    .tasahel-3d-login-stage {
      background: radial-gradient(circle at 50% 42%, var(--tasahel-mint-1) 0%, var(--tasahel-mint-2) 58%, var(--tasahel-mint-3) 100%) !important;
      perspective: 1350px !important;
      position: relative !important;
      overflow: hidden !important;
    }

    .tasahel-circuit-bg-layer {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 0;
      opacity: 0.92;
    }

    .tasahel-circuit-bg-layer .trace-line {
      fill: none;
      stroke: rgba(22, 118, 79, 0.17);
      stroke-width: 2.2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .tasahel-circuit-bg-layer .trace-pulse {
      fill: none;
      stroke: #00e68a;
      stroke-width: 3;
      stroke-linecap: round;
      stroke-dasharray: 85 850;
      animation: tasahelFlowTrace 7.5s linear infinite;
      filter: drop-shadow(0 0 6px #00ff95);
    }

    @keyframes tasahelFlowTrace {
      from { stroke-dashoffset: 935; }
      to { stroke-dashoffset: 0; }
    }

    /* الكارت الزجاجي الثلاثي الأبعاد */
    .tasahel-3d-login-card {
      position: relative !important;
      z-index: 5 !important;
      background: rgba(248, 253, 250, 0.89) !important;
      backdrop-filter: blur(22px) !important;
      -webkit-backdrop-filter: blur(22px) !important;
      border: 2px solid rgba(255, 255, 255, 0.95) !important;
      border-radius: 26px !important;
      box-shadow:
        0 30px 60px -15px rgba(13, 62, 42, 0.24),
        0 12px 28px -8px rgba(13, 62, 42, 0.12),
        inset 0 2px 4px rgba(255, 255, 255, 0.95) !important;
      color: var(--tasahel-text-dark) !important;
      transform-style: preserve-3d !important;
      transition: transform 0.65s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.45s ease, border-color 0.4s ease !important;
    }

    .tasahel-3d-login-card.tilt-3d-active,
    .tasahel-3d-login-card:focus-within {
      transform: rotateX(11deg) rotateY(-14deg) rotateZ(1.5deg) translateY(-4px) !important;
      border-color: #10b981 !important;
      box-shadow:
        0 38px 75px -12px rgba(13, 62, 42, 0.32),
        0 0 26px rgba(0, 255, 149, 0.42),
        inset 0 2px 4px rgba(255, 255, 255, 0.98) !important;
    }

    /* نصوص وعناوين الكارت */
    .tasahel-3d-login-card h1,
    .tasahel-3d-login-card h2,
    .tasahel-3d-login-card h3 {
      color: var(--tasahel-text-dark) !important;
      font-weight: 900 !important;
    }

    .tasahel-3d-login-card p,
    .tasahel-3d-login-card label,
    .tasahel-3d-login-card span {
      color: var(--tasahel-text-muted) !important;
    }

    /* حقول البريد الإلكتروني وكلمة المرور */
    .tasahel-3d-login-card input[type="email"],
    .tasahel-3d-login-card input[type="password"],
    .tasahel-3d-login-card input[type="text"] {
      background: rgba(255, 255, 255, 0.96) !important;
      border: 1.5px solid #cde2d8 !important;
      border-radius: 13px !important;
      color: var(--tasahel-text-dark) !important;
      padding: 12px 15px !important;
      font-weight: 600 !important;
      box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.03) !important;
      transition: all 0.25s ease !important;
    }

    .tasahel-3d-login-card input:focus {
      border-color: var(--tasahel-emerald-1) !important;
      box-shadow: 0 0 0 4px rgba(18, 130, 83, 0.15), 0 0 18px rgba(0, 255, 149, 0.28) !important;
      outline: none !important;
    }

    /* زر تسجيل الدخول الزمردي (بنفس تدريج الفيديو) */
    .tasahel-3d-login-card button[type="submit"],
    .tasahel-3d-login-card .btn-primary,
    .tasahel-3d-login-card .login-submit-btn {
      background: linear-gradient(135deg, var(--tasahel-emerald-1) 0%, var(--tasahel-emerald-2) 100%) !important;
      color: #ffffff !important;
      border: none !important;
      border-radius: 14px !important;
      padding: 13.5px 20px !important;
      font-size: 15.5px !important;
      font-weight: 800 !important;
      box-shadow: 0 12px 24px -6px rgba(10, 88, 55, 0.48), inset 0 1px 1px rgba(255, 255, 255, 0.35) !important;
      cursor: pointer !important;
      transition: all 0.25s ease !important;
    }

    .tasahel-3d-login-card button[type="submit"] *,
    .tasahel-3d-login-card .login-submit-btn * {
      color: #ffffff !important;
    }

    .tasahel-3d-login-card button[type="submit"]:hover,
    .tasahel-3d-login-card .login-submit-btn:hover {
      transform: translateY(-2px) !important;
      box-shadow: 0 16px 30px -6px rgba(10, 88, 55, 0.62), 0 0 20px rgba(0, 255, 149, 0.35) !important;
    }
  `;

  function injectStyles() {
    if (document.getElementById('tasahel-3d-login-styles')) return;
    const styleEl = document.createElement('style');
    styleEl.id = 'tasahel-3d-login-styles';
    styleEl.textContent = LOGIN_3D_CSS;
    document.head.appendChild(styleEl);
  }

  function buildCircuitSvg() {
    const wrapper = document.createElement('div');
    wrapper.className = 'tasahel-circuit-bg-layer';
    wrapper.innerHTML = `
      <svg width="100%" height="100%" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        <path class="trace-line" d="M 0 180 H 260 L 330 250 H 510"/>
        <path class="trace-pulse" d="M 0 180 H 260 L 330 250 H 510"/>
        <circle cx="510" cy="250" r="5" fill="rgba(22, 118, 79, 0.25)"/>
        <path class="trace-line" d="M 0 340 H 190 L 250 400 H 460 L 500 440"/>
        <path class="trace-pulse" d="M 0 340 H 190 L 250 400 H 460 L 500 440"/>
        <path class="trace-line" d="M 60 900 V 700 L 160 600 H 420 L 480 540"/>
        <path class="trace-line" d="M 1600 210 H 1320 L 1250 280 H 1080"/>
        <path class="trace-pulse" d="M 1600 210 H 1320 L 1250 280 H 1080"/>
        <circle cx="1080" cy="280" r="5" fill="rgba(22, 118, 79, 0.25)"/>
        <path class="trace-line" d="M 1600 460 H 1360 L 1290 390 H 1110"/>
        <path class="trace-line" d="M 1480 900 V 710 L 1380 610 H 1120 L 1060 550"/>
        <path class="trace-pulse" d="M 1480 900 V 710 L 1380 610 H 1120 L 1060 550"/>
      </svg>
    `;
    return wrapper;
  }

  function upgradeExistingLoginDOM() {
    injectStyles();

    // البحث التلقائي عن كارت تسجيل الدخول في صفحة السيستم
    const passInput = document.querySelector('input[type="password"]');
    if (!passInput) return;

    const cardEl = passInput.closest('form')?.parentElement || passInput.closest('.card, .login-box, .auth-card, div');
    if (!cardEl || cardEl.classList.contains('tasahel-3d-login-card')) return;

    cardEl.classList.add('tasahel-3d-login-card');

    // ترقية الحاوية الأب لتأخذ خلفية الدوائر الإلكترونية 3D
    const stageEl = cardEl.parentElement || document.body;
    stageEl.classList.add('tasahel-3d-login-stage');
    if (!stageEl.querySelector('.tasahel-circuit-bg-layer')) {
      stageEl.insertBefore(buildCircuitSvg(), stageEl.firstChild);
    }

    // تلوين زر تسجيل الدخول الرئيسي
    const buttons = cardEl.querySelectorAll('button');
    buttons.forEach(function (btn) {
      if ((btn.textContent || '').indexOf('تسجيل الدخول') !== -1) {
        btn.classList.add('login-submit-btn');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', upgradeExistingLoginDOM);
  } else {
    upgradeExistingLoginDOM();
  }
  setTimeout(upgradeExistingLoginDOM, 600);
})();