/**
 * ============================================================================
 * 26-login-3d-upgrade.js (النسخة الكاملة المضمونة 100%)
 * بوابة الدخول الذكية 3D لنظام تساهيل — قسم الخدمات الحكومية
 * ============================================================================
 * طريقة التركيب:
 * 1. احفظ هذا الملف باسم 26-login-3d-upgrade.js في نفس المكان الموجود فيه ملف 25-tracking-share.js
 * 2. ضيف سطر الاستدعاء تحته مباشرة في ملف index.html قبل </body>:
 *    <script src="26-login-3d-upgrade.js"></script>
 */

(function () {
  "use strict";
  if (window.__tasahel3DLoginInstalled) return;
  window.__tasahel3DLoginInstalled = true;

  const LOGO_URI = "data:image/png;base64,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";
  const GEAR_URI = "data:image/png;base64,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";

  const CSS = `
    #tasahel-3d-overlay {
      position: fixed;
      inset: 0;
      z-index: 99990;
      direction: rtl;
      font-family: "Cairo", "Segoe UI", Tahoma, system-ui, sans-serif;
      background: radial-gradient(circle at 50% 42%, #e4f4ed 0%, #c1dfd2 58%, #b2d6c7 100%);
      color: #0f291e;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      perspective: 1350px;
      user-select: none;
      transition: opacity 0.45s ease, visibility 0.45s ease;
    }
    #tasahel-3d-overlay.t3d-hidden {
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
    }
    #tasahel-3d-overlay * {
      box-sizing: border-box;
    }
    .t3d-circuit-bg {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 1;
      opacity: 0.92;
    }
    .t3d-trace-emboss {
      fill: none;
      stroke: rgba(255, 255, 255, 0.55);
      stroke-width: 1.2;
      transform: translate(1px, 1px);
    }
    .t3d-trace-line {
      fill: none;
      stroke: rgba(22, 118, 79, 0.17);
      stroke-width: 2.2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .t3d-trace-pulse {
      fill: none;
      stroke: url(#t3dPulseGrad);
      stroke-width: 3.2;
      stroke-linecap: round;
      stroke-dasharray: 90 900;
      animation: t3dFlow 7s linear infinite;
    }
    .t3d-trace-pulse.d1 { animation-delay: -2.2s; animation-duration: 8.4s; }
    .t3d-trace-pulse.d2 { animation-delay: -4.5s; animation-duration: 6.5s; }
    .t3d-trace-pulse.d3 { animation-delay: -1.2s; animation-duration: 9.0s; }
    @keyframes t3dFlow {
      from { stroke-dashoffset: 990; }
      to { stroke-dashoffset: 0; }
    }
    .t3d-sparkle {
      position: absolute;
      width: 18px;
      height: 18px;
      pointer-events: none;
      z-index: 2;
      animation: t3dTwinkle 3.5s ease-in-out infinite;
    }
    .t3d-sparkle::before, .t3d-sparkle::after {
      content: "";
      position: absolute;
      background: #ffffff;
      border-radius: 999px;
      box-shadow: 0 0 12px #ffffff, 0 0 20px #00ff95;
    }
    .t3d-sparkle::before {
      width: 100%; height: 2px; top: 50%; left: 0; transform: translateY(-50%);
    }
    .t3d-sparkle::after {
      width: 2px; height: 100%; left: 50%; top: 0; transform: translateX(-50%);
    }
    @keyframes t3dTwinkle {
      0%, 100% { transform: scale(0.55) rotate(0deg); opacity: 0.4; }
      50% { transform: scale(1.18) rotate(15deg); opacity: 0.95; }
    }
    .t3d-scene-rig {
      position: relative;
      z-index: 10;
      transform-style: preserve-3d;
      transition: transform 0.8s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.6s ease;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    #tasahel-3d-overlay.t3d-tilted .t3d-scene-rig {
      transform: rotateX(13deg) rotateY(-17deg) rotateZ(1.8deg) scale(0.96);
    }
    #tasahel-3d-overlay.t3d-entering .t3d-scene-rig {
      transform: translateY(-85px) translateZ(320px) rotateX(26deg) scale(0.76);
      opacity: 0;
      pointer-events: none;
    }
    .t3d-wing {
      position: absolute;
      width: 245px;
      display: flex;
      flex-direction: column;
      gap: 13px;
      transform-style: preserve-3d;
      pointer-events: none;
      opacity: 0;
      transition: all 0.8s cubic-bezier(0.22, 1, 0.36, 1);
    }
    .t3d-wing.right {
      right: -270px;
      transform: translateX(-60px) translateZ(-80px) rotateY(-24deg) scale(0.84);
    }
    .t3d-wing.left {
      left: -270px;
      transform: translateX(60px) translateZ(-80px) rotateY(24deg) scale(0.84);
    }
    #tasahel-3d-overlay.t3d-tilted .t3d-wing.right,
    #tasahel-3d-overlay:focus-within .t3d-wing.right {
      opacity: 1;
      transform: translateX(0) translateZ(42px) rotateY(-14deg) scale(1);
    }
    #tasahel-3d-overlay.t3d-tilted .t3d-wing.left,
    #tasahel-3d-overlay:focus-within .t3d-wing.left {
      opacity: 1;
      transform: translateX(0) translateZ(-30px) rotateY(14deg) scale(1);
    }
    .t3d-mini-card {
      background: rgba(248, 253, 250, 0.88);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.92);
      border-radius: 16px;
      padding: 12px 14px;
      box-shadow: 0 20px 38px rgba(10, 52, 34, 0.18), 0 0 18px rgba(16, 185, 129, 0.16);
      animation: t3dFloat 4s ease-in-out infinite;
    }
    .t3d-mini-card:nth-child(2) { animation-delay: -1.4s; }
    .t3d-mini-card:nth-child(3) { animation-delay: -2.7s; }
    @keyframes t3dFloat {
      0%, 100% { transform: translateY(0px) translateZ(10px); }
      50% { transform: translateY(-6px) translateZ(24px); }
    }
    .t3d-mini-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
      font-weight: 800;
      color: #128253;
      margin-bottom: 7px;
    }
    .t3d-mini-badge {
      background: rgba(16, 185, 129, 0.16);
      color: #128253;
      padding: 2px 7px;
      border-radius: 99px;
      font-weight: 800;
      font-size: 10px;
    }
    .t3d-mini-bars {
      display: flex;
      align-items: flex-end;
      gap: 5px;
      height: 40px;
      padding-top: 4px;
    }
    .t3d-mini-bar {
      flex: 1;
      background: linear-gradient(180deg, #10b981, #0a5837);
      border-radius: 4px 4px 2px 2px;
      box-shadow: 0 0 8px rgba(16, 185, 129, 0.35);
    }
    .t3d-mini-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      color: #4a6b5d;
      margin-top: 5px;
      font-weight: 700;
    }
    .t3d-card-wrap {
      position: relative;
      width: 420px;
      max-width: 92vw;
      border-radius: 28px;
      padding: 3px;
      transform-style: preserve-3d;
    }
    .t3d-laser-border {
      position: absolute;
      inset: -3px;
      border-radius: 30px;
      padding: 3px;
      background: conic-gradient(
        from var(--t3d-angle, 0deg),
        transparent 0deg,
        transparent 250deg,
        #10b981 290deg,
        #00ff95 335deg,
        #ffffff 355deg,
        transparent 360deg
      );
      -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
      -webkit-mask-composite: xor;
      mask-composite: exclude;
      opacity: 0.9;
      pointer-events: none;
      filter: drop-shadow(0 0 12px #00ff95);
    }
    .t3d-card {
      position: relative;
      background: rgba(248, 253, 250, 0.90);
      backdrop-filter: blur(22px);
      -webkit-backdrop-filter: blur(22px);
      border: 1.5px solid rgba(255, 255, 255, 0.95);
      border-radius: 26px;
      padding: 26px 28px 22px;
      box-shadow: 0 30px 60px -15px rgba(13, 62, 42, 0.24), 0 12px 28px -8px rgba(13, 62, 42, 0.12), inset 0 2px 4px rgba(255, 255, 255, 0.95);
      transform-style: preserve-3d;
    }
    .t3d-brand {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      margin-bottom: 18px;
      transform: translateZ(22px);
    }
    .t3d-logos {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 14px;
      margin-bottom: 10px;
    }
    .t3d-logo-box {
      width: 64px;
      height: 64px;
      border-radius: 18px;
      background: #ffffff;
      border: 1px solid rgba(18, 130, 83, 0.18);
      box-shadow: 0 10px 24px rgba(13, 62, 42, 0.12), inset 0 1px 2px #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 6px;
    }
    .t3d-logo-box img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      border-radius: 10px;
    }
    .t3d-divider {
      width: 2px;
      height: 34px;
      background: linear-gradient(180deg, transparent, rgba(18, 130, 83, 0.35), transparent);
    }
    .t3d-title {
      font-size: 26px;
      font-weight: 900;
      color: #0f291e;
      margin: 0;
      line-height: 1.15;
    }
    .t3d-subtitle {
      margin-top: 5px;
      font-size: 12px;
      font-weight: 800;
      color: #128253;
      background: rgba(18, 130, 83, 0.1);
      padding: 4px 14px;
      border-radius: 999px;
      border: 1px solid rgba(18, 130, 83, 0.18);
    }
    .t3d-group {
      margin-bottom: 14px;
      transform: translateZ(16px);
    }
    .t3d-label {
      display: block;
      font-size: 12px;
      font-weight: 700;
      color: #4a6b5d;
      margin-bottom: 6px;
      text-align: right;
    }
    .t3d-input-wrap {
      position: relative;
      display: flex;
      align-items: center;
      background: rgba(255, 255, 255, 0.96);
      border: 1.5px solid #cde2d8;
      border-radius: 13px;
      transition: all 0.25s ease;
    }
    .t3d-input-wrap:focus-within {
      border-color: #128253;
      box-shadow: 0 0 0 4px rgba(18, 130, 83, 0.14), 0 0 18px rgba(0, 255, 149, 0.25);
    }
    .t3d-icon-right {
      width: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #6e8e80;
      flex-shrink: 0;
    }
    .t3d-input {
      width: 100%;
      border: none !important;
      background: transparent !important;
      padding: 12px 4px 12px 36px !important;
      font-size: 14px !important;
      font-weight: 600 !important;
      color: #0f291e !important;
      outline: none !important;
      direction: ltr;
      text-align: left;
      box-shadow: none !important;
    }
    .t3d-eye {
      position: absolute;
      left: 10px;
      background: none;
      border: none;
      color: #6e8e80;
      cursor: pointer;
      padding: 4px;
      display: flex;
      align-items: center;
    }
    .t3d-util-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin: 10px 2px 16px;
      font-size: 12px;
    }
    .t3d-link-btn {
      background: none;
      border: none;
      color: #128253;
      font-weight: 700;
      font-size: 12px;
      cursor: pointer;
      padding: 0;
    }
    .t3d-link-btn:hover {
      text-decoration: underline;
    }
    .t3d-submit {
      position: relative;
      width: 100%;
      border: none;
      border-radius: 14px;
      padding: 13.5px 20px;
      background: linear-gradient(135deg, #128253 0%, #0a5837 100%);
      color: #ffffff;
      font-size: 15.5px;
      font-weight: 800;
      cursor: pointer;
      box-shadow: 0 12px 24px -6px rgba(10, 88, 55, 0.48), inset 0 1px 1px rgba(255, 255, 255, 0.35);
      transition: all 0.25s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transform: translateZ(24px);
    }
    .t3d-submit:hover {
      transform: translateZ(28px) translateY(-2px);
      box-shadow: 0 16px 30px -6px rgba(10, 88, 55, 0.62), 0 0 20px rgba(0, 255, 149, 0.35);
    }
    .t3d-error-msg {
      color: #dc2626;
      font-size: 12px;
      font-weight: 700;
      text-align: center;
      margin-top: 8px;
      min-height: 18px;
    }
    .t3d-supa-bar {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px dashed rgba(18, 130, 83, 0.22);
      display: flex;
      justify-content: center;
      gap: 8px;
    }
    .t3d-supa-btn {
      background: rgba(18, 130, 83, 0.08);
      border: 1px solid rgba(18, 130, 83, 0.22);
      color: #4a6b5d;
      font-size: 12px;
      font-weight: 700;
      padding: 7px 14px;
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .t3d-supa-btn:hover {
      background: rgba(18, 130, 83, 0.16);
      color: #128253;
      border-color: #128253;
    }
    /* الخريطة الخضراء الثلاثية الأبعاد بعد تسجيل الدخول (مدتها ثانيتان) */
    .t3d-portal {
      position: fixed;
      inset: 0;
      z-index: 99995;
      background: radial-gradient(circle at 50% 45%, #0d2b1f 0%, #05130d 75%);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.45s ease;
      perspective: 1100px;
      direction: rtl;
      font-family: "Cairo", "Segoe UI", Tahoma, sans-serif;
    }
    .t3d-portal.active {
      opacity: 1;
      pointer-events: auto;
    }
    .t3d-portal-head {
      text-align: center;
      margin-bottom: 18px;
      color: #ecfdf5;
    }
    .t3d-portal-head h2 {
      font-size: 24px;
      font-weight: 900;
      color: #34d399;
      margin: 0;
      text-shadow: 0 0 20px rgba(52, 211, 153, 0.45);
    }
    .t3d-portal-head p {
      font-size: 13.5px;
      color: #a7f3d0;
      margin-top: 6px;
    }
    .t3d-holo-plane {
      width: 720px;
      max-width: 90vw;
      height: 350px;
      background: rgba(16, 185, 129, 0.05);
      border: 1px solid rgba(52, 211, 153, 0.35);
      border-radius: 24px;
      transform: rotateX(38deg);
      transform-style: preserve-3d;
      box-shadow: 0 40px 90px rgba(0, 0, 0, 0.75), 0 0 50px rgba(16, 185, 129, 0.2), inset 0 0 40px rgba(16, 185, 129, 0.12);
      position: relative;
    }
    .t3d-pillar {
      position: absolute;
      width: 16px;
      background: linear-gradient(180deg, #00ff95, rgba(16, 185, 129, 0.15));
      border-radius: 6px 6px 0 0;
      box-shadow: 0 0 20px #00ff95;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .t3d-pillar span {
      position: absolute;
      top: -26px;
      background: rgba(6, 24, 17, 0.92);
      border: 1px solid #34d399;
      color: #ecfdf5;
      font-size: 10px;
      font-weight: 800;
      padding: 2px 8px;
      border-radius: 99px;
      white-space: nowrap;
    }
    @media (max-width: 960px) {
      .t3d-wing { display: none; }
    }
  `;

  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function findOriginalLoginElements() {
    const passInputs = Array.from(document.querySelectorAll('input[type="password"]')).filter(function(inp) {
      return !inp.closest("#tasahel-3d-overlay");
    });
    if (!passInputs.length) return null;

    const passEl = passInputs.find(isVisible) || passInputs[0];
    const container = passEl.closest("#login-screen, #loginScreen, #auth-screen, #authModal, #login-modal, .login-screen, .auth-container, form") || (passEl.parentElement && passEl.parentElement.parentElement) || passEl.parentElement;
    if (!container) return null;

    const rootScreen = passEl.closest("#login-screen, #loginScreen, #auth-screen, .fixed.inset-0, .min-h-screen") || container;
    const emailEl = container.querySelector('input[type="email"], input[type="text"]') || document.querySelector('input[type="email"]');

    const allBtns = Array.from((rootScreen || document).querySelectorAll("button, a, input[type=submit]")).filter(function(b) {
      return !b.closest("#tasahel-3d-overlay");
    });
    const submitBtn = allBtns.find(function(b) {
      return (b.textContent || b.value || "").indexOf("تسجيل الدخول") !== -1;
    }) || container.querySelector('button[type="submit"], button');
    const forgotBtn = allBtns.find(function(b) {
      return (b.textContent || "").indexOf("نسيت كلمة المرور") !== -1;
    });
    const supaBtn = allBtns.find(function(b) {
      return (b.textContent || "").indexOf("Supabase") !== -1 || (b.textContent || "").indexOf("مفاتيح") !== -1;
    });

    return { passEl: passEl, emailEl: emailEl, submitBtn: submitBtn, forgotBtn: forgotBtn, supaBtn: supaBtn, rootScreen: rootScreen };
  }

  function injectOverlay() {
    if (document.getElementById("tasahel-3d-overlay")) return;

    const styleEl = document.createElement("style");
    styleEl.id = "tasahel-3d-styles";
    styleEl.textContent = CSS;
    document.head.appendChild(styleEl);

    const overlay = document.createElement("div");
    overlay.id = "tasahel-3d-overlay";
    overlay.className = "t3d-hidden";
    overlay.innerHTML = `
      <div class="t3d-circuit-bg">
        <svg width="100%" height="100%" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
          <defs>
            <linearGradient id="t3dPulseGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#10b981" stop-opacity="0"/>
              <stop offset="50%" stop-color="#00ff95" stop-opacity="0.95"/>
              <stop offset="100%" stop-color="#ffffff" stop-opacity="1"/>
            </linearGradient>
          </defs>
          <g>
            <path class="t3d-trace-emboss" d="M 0 180 H 260 L 330 250 H 510"/>
            <path class="t3d-trace-line" d="M 0 180 H 260 L 330 250 H 510"/>
            <path class="t3d-trace-pulse" d="M 0 180 H 260 L 330 250 H 510"/>
            <circle cx="510" cy="250" r="5" fill="rgba(22, 118, 79, 0.25)"/>
            <path class="t3d-trace-emboss" d="M 0 340 H 190 L 250 400 H 460 L 500 440"/>
            <path class="t3d-trace-line" d="M 0 340 H 190 L 250 400 H 460 L 500 440"/>
            <path class="t3d-trace-pulse d1" d="M 0 340 H 190 L 250 400 H 460 L 500 440"/>
            <path class="t3d-trace-emboss" d="M 60 900 V 700 L 160 600 H 420 L 480 540"/>
            <path class="t3d-trace-line" d="M 60 900 V 700 L 160 600 H 420 L 480 540"/>
            <path class="t3d-trace-pulse d2" d="M 60 900 V 700 L 160 600 H 420 L 480 540"/>
            <path class="t3d-trace-emboss" d="M 1600 210 H 1320 L 1250 280 H 1080"/>
            <path class="t3d-trace-line" d="M 1600 210 H 1320 L 1250 280 H 1080"/>
            <path class="t3d-trace-pulse d3" d="M 1600 210 H 1320 L 1250 280 H 1080"/>
            <circle cx="1080" cy="280" r="5" fill="rgba(22, 118, 79, 0.25)"/>
            <path class="t3d-trace-emboss" d="M 1600 460 H 1360 L 1290 390 H 1110"/>
            <path class="t3d-trace-line" d="M 1600 460 H 1360 L 1290 390 H 1110"/>
            <path class="t3d-trace-pulse d1" d="M 1600 460 H 1360 L 1290 390 H 1110"/>
            <path class="t3d-trace-emboss" d="M 1480 900 V 710 L 1380 610 H 1120 L 1060 550"/>
            <path class="t3d-trace-line" d="M 1480 900 V 710 L 1380 610 H 1120 L 1060 550"/>
            <path class="t3d-trace-pulse d2" d="M 1480 900 V 710 L 1380 610 H 1120 L 1060 550"/>
          </g>
        </svg>
      </div>
      <div class="t3d-sparkle" style="top: 22%; left: 18%;"></div>
      <div class="t3d-sparkle" style="top: 68%; left: 24%; animation-delay: -1.4s;"></div>
      <div class="t3d-sparkle" style="top: 26%; right: 19%; animation-delay: -0.8s;"></div>
      <div class="t3d-sparkle" style="top: 64%; right: 22%; animation-delay: -2.2s;"></div>

      <div class="t3d-scene-rig" id="t3dSceneRig">
        <!-- اللوحات الثلاثية الأبعاد الجانبية الطائرة (يمين) -->
        <div class="t3d-wing right">
          <div class="t3d-mini-card">
            <div class="t3d-mini-head"><span>📊 مؤشر المعاملات</span><span class="t3d-mini-badge">+98.4%</span></div>
            <div class="t3d-mini-bars">
              <div class="t3d-mini-bar" style="height:45%"></div>
              <div class="t3d-mini-bar" style="height:70%"></div>
              <div class="t3d-mini-bar" style="height:55%"></div>
              <div class="t3d-mini-bar" style="height:90%"></div>
              <div class="t3d-mini-bar" style="height:100%"></div>
            </div>
            <div class="t3d-mini-row"><span>جوازات وسجل مدني</span><span>نشط</span></div>
          </div>
          <div class="t3d-mini-card">
            <div class="t3d-mini-head"><span>⚡ الربط السحابي</span><span class="t3d-mini-badge">متصل 100%</span></div>
            <div class="t3d-mini-row"><span>قاعدة بيانات Supabase</span><span style="color:#10b981">● متصل</span></div>
          </div>
        </div>

        <!-- كارت تسجيل الدخول الرئيسي 3D -->
        <div class="t3d-card-wrap" id="t3dCardWrap">
          <div class="t3d-laser-border"></div>
          <div class="t3d-card">
            <div class="t3d-brand">
              <div class="t3d-logos">
                <div class="t3d-logo-box"><img src="${LOGO_URI}" alt="تساهيل"></div>
                <div class="t3d-divider"></div>
                <div class="t3d-logo-box"><img src="${GEAR_URI}" alt="الخدمات الحكومية"></div>
              </div>
              <h1 class="t3d-title">تساهيل</h1>
              <div class="t3d-subtitle">قسم الخدمات الحكومية — بوابة الدخول الذكية</div>
            </div>

            <form id="t3dLoginForm">
              <div class="t3d-group">
                <label class="t3d-label">البريد الإلكتروني</label>
                <div class="t3d-input-wrap">
                  <span class="t3d-icon-right">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  </span>
                  <input type="email" id="t3dEmailInput" class="t3d-input" placeholder="name@tasahel.com.eg" required>
                </div>
              </div>

              <div class="t3d-group">
                <label class="t3d-label">كلمة المرور</label>
                <div class="t3d-input-wrap">
                  <span class="t3d-icon-right">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  </span>
                  <input type="password" id="t3dPassInput" class="t3d-input" placeholder="••••••••" required>
                  <button type="button" class="t3d-eye" id="t3dEyeBtn" title="إظهار / إخفاء">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  </button>
                </div>
              </div>

              <div class="t3d-util-row">
                <button type="button" class="t3d-link-btn" id="t3dToggle3DBtn">🧊 تفعيل / إيقاف ميلان 3D</button>
                <button type="button" class="t3d-link-btn" id="t3dForgotBtn">نسيت كلمة المرور؟</button>
              </div>

              <button type="submit" class="t3d-submit" id="t3dSubmitBtn">
                <span>تسجيل الدخول</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
              </button>
              <div class="t3d-error-msg" id="t3dErrorMsg"></div>
            </form>

            <div class="t3d-supa-bar">
              <button type="button" class="t3d-supa-btn" id="t3dSupaBtn">⚙️ ضبط مفاتيح اتصال Supabase</button>
            </div>
          </div>
        </div>

        <!-- اللوحات الثلاثية الأبعاد الجانبية الطائرة (يسار) -->
        <div class="t3d-wing left">
          <div class="t3d-mini-card">
            <div class="t3d-mini-head"><span>📑 تتبع الطلبات</span><span class="t3d-mini-badge">QR مفعّل</span></div>
            <div class="t3d-mini-row"><span>إيصالات نصف A4</span><span style="color:#10b981">جاهز</span></div>
          </div>
          <div class="t3d-mini-card">
            <div class="t3d-mini-head"><span>🛡️ حماية الجلسة</span><span class="t3d-mini-badge">SSL 256</span></div>
            <div class="t3d-mini-row"><span>دخول مشفر للموظفين</span><span>آمن</span></div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const portal = document.createElement("div");
    portal.id = "t3d-network-portal";
    portal.className = "t3d-portal";
    portal.innerHTML = `
      <div class="t3d-portal-head">
        <h2>✅ مرحباً بك في نظام تساهيل — قسم الخدمات الحكومية</h2>
        <p>تم تسجيل الدخول بنجاح • جاري فتح لوحة التحكم...</p>
      </div>
      <div class="t3d-holo-plane">
        <svg width="100%" height="100%" viewBox="0 0 720 350">
          <g stroke="rgba(52, 211, 153, 0.24)" stroke-width="1">
            <line x1="0" y1="70" x2="720" y2="70"/><line x1="0" y1="140" x2="720" y2="140"/>
            <line x1="0" y1="210" x2="720" y2="210"/><line x1="0" y1="280" x2="720" y2="280"/>
            <line x1="140" y1="0" x2="140" y2="350"/><line x1="290" y1="0" x2="290" y2="350"/>
            <line x1="440" y1="0" x2="440" y2="350"/><line x1="590" y1="0" x2="590" y2="350"/>
          </g>
          <g stroke="#00ff95" stroke-width="2.5" fill="none" opacity="0.85">
            <path d="M 150 240 Q 260 110 360 175 T 580 135"/>
            <path d="M 220 110 L 360 175 L 470 255 L 580 135"/>
          </g>
          <circle cx="150" cy="240" r="8" fill="#00ff95"/>
          <circle cx="220" cy="110" r="8" fill="#00ff95"/>
          <circle cx="360" cy="175" r="12" fill="#ffffff" stroke="#00ff95" stroke-width="4"/>
          <circle cx="470" cy="255" r="8" fill="#00ff95"/>
          <circle cx="580" cy="135" r="8" fill="#00ff95"/>
        </svg>
        <div class="t3d-pillar" style="left:142px;bottom:110px;height:85px"><span>السجل المدني</span></div>
        <div class="t3d-pillar" style="left:212px;bottom:240px;height:105px"><span>الجوازات</span></div>
        <div class="t3d-pillar" style="left:352px;bottom:175px;height:135px"><span>المركز الرئيسي — تساهيل</span></div>
        <div class="t3d-pillar" style="left:462px;bottom:95px;height:80px"><span>التصديقات</span></div>
        <div class="t3d-pillar" style="left:572px;bottom:215px;height:110px"><span>الشهر العقاري</span></div>
      </div>
    `;
    document.body.appendChild(portal);

    let angle = 0;
    const cardWrap = document.getElementById("t3dCardWrap");
    function spinLaser() {
      angle = (angle + 2.4) % 360;
      if (cardWrap) cardWrap.style.setProperty("--t3d-angle", angle + "deg");
      requestAnimationFrame(spinLaser);
    }
    requestAnimationFrame(spinLaser);

    const rig = document.getElementById("t3dSceneRig");
    overlay.addEventListener("mousemove", function (e) {
      if (overlay.classList.contains("t3d-tilted") || overlay.classList.contains("t3d-entering")) return;
      const x = (e.clientX / window.innerWidth - 0.5) * 2;
      const y = (e.clientY / window.innerHeight - 0.5) * 2;
      rig.style.transform = "rotateY(" + (x * 8) + "deg) rotateX(" + (-y * 8) + "deg)";
    });

    const t3dPass = document.getElementById("t3dPassInput");
    document.getElementById("t3dEyeBtn").addEventListener("click", function () {
      t3dPass.type = t3dPass.type === "password" ? "text" : "password";
    });

    document.getElementById("t3dToggle3DBtn").addEventListener("click", function () {
      rig.style.transform = "";
      overlay.classList.toggle("t3d-tilted");
    });

    const t3dEmail = document.getElementById("t3dEmailInput");

    function setNativeValue(el, val) {
      if (!el) return;
      const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
      if (desc && desc.set) desc.set.call(el, val);
      else el.value = val;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }

    document.getElementById("t3dLoginForm").addEventListener("submit", function (e) {
      e.preventDefault();
      const orig = findOriginalLoginElements();
      if (!orig) return;

      if (orig.emailEl) setNativeValue(orig.emailEl, t3dEmail.value);
      if (orig.passEl) setNativeValue(orig.passEl, t3dPass.value);

      overlay.classList.add("t3d-tilted");
      const submitBtn = document.getElementById("t3dSubmitBtn");
      const oldText = submitBtn.innerHTML;
      submitBtn.innerHTML = "<span>جاري التحقق والدخول...</span>";

      if (orig.submitBtn) {
        orig.submitBtn.click();
      } else if (orig.passEl && orig.passEl.form) {
        orig.passEl.form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      }

      setTimeout(function () {
        submitBtn.innerHTML = oldText;
      }, 2000);
    });

    document.getElementById("t3dForgotBtn").addEventListener("click", function () {
      const orig = findOriginalLoginElements();
      if (orig && orig.forgotBtn) {
        if (orig.emailEl && t3dEmail.value) setNativeValue(orig.emailEl, t3dEmail.value);
        orig.forgotBtn.click();
      }
    });

    document.getElementById("t3dSupaBtn").addEventListener("click", function () {
      const orig = findOriginalLoginElements();
      if (orig && orig.supaBtn) {
        orig.supaBtn.click();
        setTimeout(function () {
          document.querySelectorAll(".fixed, [id*='modal'], [id*='Modal'], [id*='supa']").forEach(function (m) {
            if (m.id !== "tasahel-3d-overlay" && m.id !== "t3d-network-portal" && isVisible(m) && m !== orig.rootScreen) {
              m.style.zIndex = "99999";
            }
          });
        }, 120);
      }
    });
  }

  let wasLoginVisible = false;

  function syncLoginState() {
    injectOverlay();
    const overlay = document.getElementById("tasahel-3d-overlay");
    const portal = document.getElementById("t3d-network-portal");
    if (!overlay) return;

    const orig = findOriginalLoginElements();
    const loginNowVisible = Boolean(orig && isVisible(orig.passEl));

    if (loginNowVisible) {
      const t3dEmail = document.getElementById("t3dEmailInput");
      const t3dPass = document.getElementById("t3dPassInput");
      if (orig.emailEl && orig.emailEl.value && !t3dEmail.value) {
        t3dEmail.value = orig.emailEl.value;
      }
      if (orig.passEl && orig.passEl.value && !t3dPass.value) {
        t3dPass.value = orig.passEl.value;
      }
      overlay.classList.remove("t3d-hidden", "t3d-entering");
      wasLoginVisible = true;
    } else {
      if (wasLoginVisible) {
        wasLoginVisible = false;
        overlay.classList.add("t3d-entering");
        if (portal) portal.classList.add("active");
        setTimeout(function () {
          overlay.classList.add("t3d-hidden");
          if (portal) portal.classList.remove("active");
        }, 1850);
      } else {
        overlay.classList.add("t3d-hidden");
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", syncLoginState);
  } else {
    syncLoginState();
  }
  setInterval(syncLoginState, 350);
})();
