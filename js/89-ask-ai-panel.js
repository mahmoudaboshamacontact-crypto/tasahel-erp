/* =====================================================================
   js/89-ask-ai-panel.js
   مساعد تساهيل الذكي (للمدير فقط):
   - تصميم Liquid Glass مستوحى من Dribbble: شاشة ترحيب بـ AI Orb + بطاقات 2×2.
   - إطار ألوان Gemini دوّار على الحواف عند التفاعل والتفكير.
   - مؤشر تفكير 3 خطوط متحركة (Waveform) + إدخال صوتي عربي (Mic) + درج الليمت داخل الترس (⚙).
   ===================================================================== */
(function () {
  'use strict';
  if (window.__tsAskAiPanel) return;
  window.__tsAskAiPanel = true;

  var FN_PATH = '/functions/v1/ask-ai';
  var USAGE_KEY = 'ts_ai_usage_v1';
  var POS_KEY = 'ts_ai_win_pos_v1';
  var TZ = 'Africa/Cairo';
  var DAILY_REQ_LIMIT = 500;
  var WEEKLY_REQ_LIMIT = 3500;
  var MONTHLY_REQ_LIMIT = 15000;
  var history = [];
  var sessionTokens = 0;
  var busy = false;
  var resetTimer = null;
  var glowTimer = null;
  var recog = null;
  var listening = false;

  function gemSvg(size) {
    return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" aria-hidden="true" style="flex:none;display:block"><path d="M12 2C12.7 7.2 16.8 11.3 22 12C16.8 12.7 12.7 16.8 12 22C11.3 16.8 7.2 12.7 2 12C7.2 11.3 11.3 7.2 12 2Z" fill="currentColor"/></svg>';
  }

  function $(id) { return document.getElementById(id); }
  function isMgr() {
    if (window.__role !== 'manager') return false;
    if (document.body && (document.body.classList.contains('is-courier-mode') || document.body.classList.contains('is-partner-mode'))) return false;
    return true;
  }
  function mgrFirstName() {
    try {
      var n = (typeof myProfile !== 'undefined' && myProfile && myProfile.full_name) ? String(myProfile.full_name).trim() : '';
      return n ? n.split(/\s+/)[0] : 'مدير';
    } catch (e) { return 'مدير'; }
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtAiText(s) {
    return esc(s).replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  }
  function nf(n) { return Number(n || 0).toLocaleString('en-US'); }

  function cairoParts(d) {
    var s = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d || new Date());
    return { day: s, month: s.slice(0, 7) };
  }
  function cairoWeekKey(d) {
    var p = cairoParts(d).day.split('-');
    var dt = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    var dow = (dt.getUTCDay() + 1) % 7;
    dt.setUTCDate(dt.getUTCDate() - dow);
    return dt.toISOString().slice(0, 10);
  }
  function dailyResetInfo() {
    var now = new Date();
    var target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 8, 0, 0));
    if (now.getTime() >= target.getTime()) target = new Date(target.getTime() + 86400000);
    var mins = Math.max(1, Math.round((target.getTime() - now.getTime()) / 60000));
    var h = Math.floor(mins / 60), m = mins % 60;
    return h + 'س ' + m + 'د (10:00 ص)';
  }
  function weeklyResetInfo() {
    var p = cairoParts().day.split('-');
    var now = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    var dow = (now.getUTCDay() + 1) % 7;
    return (7 - dow) + 'ي';
  }
  function monthlyResetInfo() {
    var p = cairoParts().day.split('-');
    var daysInMonth = new Date(Date.UTC(+p[0], +p[1], 0)).getUTCDate();
    return Math.max(1, daysInMonth - (+p[2]) + 1) + 'ي';
  }

  function loadUsage() {
    var p = cairoParts(), wk = cairoWeekKey();
    var def = { day: p.day, day_req: 0, day_tok: 0, week: wk, week_req: 0, week_tok: 0, month: p.month, month_req: 0, month_tok: 0, model: 'gemini-3.5-flash-lite' };
    try {
      var raw = JSON.parse(localStorage.getItem(USAGE_KEY) || 'null');
      if (!raw) return def;
      if (raw.day !== p.day) { raw.day = p.day; raw.day_req = 0; raw.day_tok = 0; }
      if (raw.week !== wk) { raw.week = wk; raw.week_req = 0; raw.week_tok = 0; }
      if (raw.month !== p.month) { raw.month = p.month; raw.month_req = 0; raw.month_tok = 0; }
      return Object.assign(def, raw);
    } catch (e) { return def; }
  }
  function saveUsage(u) { try { localStorage.setItem(USAGE_KEY, JSON.stringify(u)); } catch (e) {} }
  function bumpUsage(tok, model) {
    var u = loadUsage(), t = Number(tok) || 0;
    u.day_req += 1; u.day_tok += t;
    u.week_req += 1; u.week_tok += t;
    u.month_req += 1; u.month_tok += t;
    if (model) u.model = model;
    sessionTokens += t;
    saveUsage(u);
    renderUsageDrawer();
  }

  function barColor(pct) { return pct >= 85 ? '#ef4444' : (pct >= 60 ? '#f59e0b' : '#22c55e'); }
  function meterRow(label, used, limit, rightText, subText) {
    var pct = Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
    var col = barColor(pct);
    var fillW = used > 0 ? Math.max(4, pct) : 0;
    return '<div class="ts-ai-mrow">' +
      '<div class="ts-ai-mtop"><span class="ts-ai-ml">' + esc(label) + '</span><span class="ts-ai-msub">' + esc(subText) + '</span></div>' +
      '<div class="ts-ai-mbar">' +
        '<span class="ts-ai-track"><i class="ts-ai-fill" style="width:' + fillW + '%;background:' + col + '"></i></span>' +
        '<span class="ts-ai-pct" style="color:' + col + '">' + pct + '%</span>' +
        '<span class="ts-ai-rt">' + esc(rightText) + '</span>' +
      '</div>' +
    '</div>';
  }
  function renderUsageDrawer() {
    var box = $('ts-ai-usage');
    if (!box) return;
    var u = loadUsage();
    var msgsUsed = Math.floor(history.length / 2);
    box.innerHTML =
      '<div class="ts-ai-uhdr"><span>الليمت واستهلاك التوكنات</span><span class="ts-ai-umodel">' + esc(u.model || 'gemini-3.5-flash-lite') + '</span></div>' +
      meterRow('المحادثة الحالية', msgsUsed, 6, nf(sessionTokens) + ' tok', msgsUsed + ' / 6 رسائل سياق') +
      meterRow('الاستهلاك اليومي', u.day_req, DAILY_REQ_LIMIT, dailyResetInfo(), nf(u.day_req) + ' طلب · ' + nf(u.day_tok) + ' tok') +
      meterRow('الاستهلاك الأسبوعي', u.week_req, WEEKLY_REQ_LIMIT, weeklyResetInfo(), nf(u.week_req) + ' طلب · ' + nf(u.week_tok) + ' tok') +
      meterRow('الاستهلاك الشهري', u.month_req, MONTHLY_REQ_LIMIT, monthlyResetInfo(), nf(u.month_req) + ' طلب · ' + nf(u.month_tok) + ' tok');
  }

  function pulseGlow(ms) {
    var win = $('ts-ai-win');
    if (!win) return;
    win.classList.add('is-glow');
    clearTimeout(glowTimer);
    if (ms) {
      glowTimer = setTimeout(function () {
        if (!busy && !listening && win) win.classList.remove('is-glow');
      }, ms);
    }
  }

  function injectStyles() {
    if ($('ts-ai-style')) return;
    var st = document.createElement('style');
    st.id = 'ts-ai-style';
    st.textContent =
      '@property --ts-ai-a{syntax:"<angle>";initial-value:0deg;inherits:false}' +
      '@keyframes tsAiSpin{to{--ts-ai-a:360deg}}' +
      '@keyframes tsAiWave{0%,100%{transform:scaleY(.35);opacity:.45}50%{transform:scaleY(1);opacity:1}}' +

      /* زر AI الدائري المميز */
      '#ts-ai-btn{position:fixed;left:20px;bottom:24px;z-index:96;width:54px;height:54px;border-radius:999px;border:2px solid rgba(255,255,255,.85);cursor:pointer;display:flex;align-items:center;justify-content:center;color:#ffffff;background:linear-gradient(135deg,#2563eb 0%,#7c3aed 52%,#ec4899 100%);box-shadow:0 12px 30px -4px rgba(124,58,237,.65),0 0 0 4px rgba(139,92,246,.18);font-family:inherit;transition:transform .18s,box-shadow .18s}' +
      'html.dark #ts-ai-btn{border-color:rgba(255,255,255,.35);box-shadow:0 12px 32px -4px rgba(139,92,246,.75),0 0 0 4px rgba(139,92,246,.22)}' +
      '#ts-ai-btn:hover{transform:translateY(-2px) scale(1.05)}' +
      '#ts-ai-btn .ts-ai-tag{position:absolute;top:-5px;right:-5px;background:#0f172a;color:#fff;font-size:9px;font-weight:800;letter-spacing:.4px;padding:2px 5px;border-radius:999px;border:1.5px solid #fff;line-height:1}' +

      /* النافذة الزجاجية العائمة (Liquid Glass Dribbble Style) */
      '#ts-ai-win{position:fixed;left:22px;bottom:22px;z-index:160;width:440px;max-width:calc(100vw - 24px);height:640px;max-height:calc(100vh - 34px);display:none;flex-direction:column;border-radius:28px;background:radial-gradient(120% 80% at 50% 0%,rgba(139,92,246,.16) 0%,rgba(255,255,255,.88) 46%,rgba(248,250,252,.92) 100%);color:#0f172a;backdrop-filter:blur(30px) saturate(200%);-webkit-backdrop-filter:blur(30px) saturate(200%);border:1px solid rgba(255,255,255,.78);box-shadow:0 28px 70px -14px rgba(15,23,42,.28),inset 0 1px 0 rgba(255,255,255,.9)}' +
      'html.dark #ts-ai-win{background:radial-gradient(120% 70% at 50% 0%,rgba(124,58,237,.28) 0%,rgba(11,15,28,.90) 48%,rgba(8,11,22,.94) 100%);color:#f1f5f9;border-color:rgba(255,255,255,.14);box-shadow:0 30px 80px -14px rgba(0,0,0,.78),inset 0 1px 0 rgba(255,255,255,.12)}' +
      '#ts-ai-win.open{display:flex}' +
      '#ts-ai-win.min{height:auto!important;width:300px!important}' +
      '#ts-ai-win.min .ts-ai-body{display:none}' +

      /* إضاءة حواف Gemini الدوارة عند التفاعل والتفكير */
      '#ts-ai-win::before{content:"";position:absolute;inset:-2.5px;border-radius:30px;padding:2.5px;background:conic-gradient(from var(--ts-ai-a),#4285f4,#8b5cf6,#ec4899,#38bdf8,#4285f4);-webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);-webkit-mask-composite:xor;mask-composite:exclude;opacity:0;pointer-events:none;transition:opacity .28s ease}' +
      '#ts-ai-win.is-glow::before{opacity:1;animation:tsAiSpin 2.2s linear infinite}' +
      '@media(prefers-reduced-motion:reduce){#ts-ai-win.is-glow::before{animation:none}}' +

      /* الهيدر النظيف */
      '.ts-ai-hdr{position:relative;display:flex;align-items:center;justify-content:space-between;padding:13px 16px;cursor:move;user-select:none;flex:none}' +
      '.ts-ai-pill{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:999px;font-size:12px;font-weight:700;color:#fff;background:linear-gradient(135deg,#2563eb 0%,#7c3aed 55%,#ec4899 100%);box-shadow:0 6px 18px -5px rgba(124,58,237,.6)}' +
      '.ts-ai-hbtn{border:1px solid rgba(15,23,42,.08);background:rgba(255,255,255,.65);color:inherit;width:32px;height:32px;border-radius:999px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:12.5px;transition:background .15s,border-color .15s,color .15s}' +
      'html.dark .ts-ai-hbtn{border-color:rgba(255,255,255,.12);background:rgba(255,255,255,.06)}' +
      '.ts-ai-hbtn:hover,.ts-ai-hbtn.on{border-color:#8b5cf6;background:rgba(124,58,237,.14);color:#7c3aed}' +
      'html.dark .ts-ai-hbtn:hover,html.dark .ts-ai-hbtn.on{color:#c4b5fd}' +

      '.ts-ai-body{position:relative;display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden;border-radius:0 0 28px 28px}' +

      /* درج الليمت داخل الترس */
      '#ts-ai-usage{display:none;flex-direction:column;gap:8px;margin:0 14px 8px;padding:12px 14px;border-radius:18px;border:1px solid rgba(15,23,42,.08);background:rgba(255,255,255,.78);backdrop-filter:blur(16px)}' +
      'html.dark #ts-ai-usage{border-color:rgba(255,255,255,.1);background:rgba(15,23,42,.72)}' +
      '#ts-ai-usage.open{display:flex}' +
      '.ts-ai-uhdr{display:flex;align-items:center;justify-content:space-between;font-size:11px;font-weight:700;opacity:.85}' +
      '.ts-ai-umodel{font-family:Consolas,monospace;font-size:10px;padding:2px 8px;border-radius:999px;background:rgba(124,58,237,.12);color:#6d28d9}' +
      'html.dark .ts-ai-umodel{color:#c4b5fd}' +
      '.ts-ai-mrow{display:flex;flex-direction:column;gap:3px}' +
      '.ts-ai-mtop{display:flex;justify-content:space-between;font-size:10.5px}' +
      '.ts-ai-ml{font-weight:600;opacity:.85}' +
      '.ts-ai-msub{font-family:Consolas,monospace;opacity:.65;direction:ltr}' +
      '.ts-ai-mbar{display:flex;align-items:center;gap:8px}' +
      '.ts-ai-track{flex:1;height:5px;border-radius:999px;background:rgba(148,163,184,.28);overflow:hidden}' +
      '.ts-ai-fill{display:block;height:100%;border-radius:999px}' +
      '.ts-ai-pct{font-family:Consolas,monospace;font-weight:700;font-size:10.5px;direction:ltr;min-width:30px;text-align:end}' +
      '.ts-ai-rt{font-family:Consolas,monospace;font-size:10px;opacity:.7;white-space:nowrap}' +

      /* شاشة الترحيب (Dribbble Hero + 2x2 Cards) */
      '#ts-ai-hero{flex:1;overflow-y:auto;padding:10px 18px 14px;display:flex;flex-direction:column;justify-content:center;gap:14px}' +
      '#ts-ai-hero.hide{display:none}' +
      '.ts-ai-orb{width:62px;height:62px;margin:0 auto;border-radius:999px;display:flex;align-items:center;justify-content:center;color:#fff;background:radial-gradient(circle at 30% 30%,#60a5fa 0%,#7c3aed 52%,#ec4899 100%);box-shadow:0 0 0 8px rgba(124,58,237,.12),0 16px 36px -6px rgba(124,58,237,.6)}' +
      '.ts-ai-htxt{text-align:center}' +
      '.ts-ai-htxt h3{margin:0;font-size:19px;font-weight:800;letter-spacing:-.2px}' +
      '.ts-ai-htxt p{margin:4px 0 0;font-size:12.5px;opacity:.68}' +
      '.ts-ai-cards{display:grid;grid-template-columns:1fr 1fr;gap:10px}' +
      '.ts-ai-card{text-align:right;border:1px solid rgba(15,23,42,.08);background:rgba(255,255,255,.72);border-radius:18px;padding:12px;cursor:pointer;font-family:inherit;color:inherit;display:flex;flex-direction:column;gap:7px;transition:transform .16s,border-color .16s,background .16s}' +
      'html.dark .ts-ai-card{border-color:rgba(255,255,255,.1);background:rgba(255,255,255,.05)}' +
      '.ts-ai-card:hover{transform:translateY(-2px);border-color:#8b5cf6;background:rgba(139,92,246,.09)}' +
      '.ts-ai-cico{width:32px;height:32px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:14px}' +
      '.ts-ai-card b{font-size:12.5px;font-weight:700;display:block}' +
      '.ts-ai-card span{font-size:10.5px;opacity:.65;line-height:1.45;display:block}' +

      /* ساحة المحادثة */
      '#ts-ai-msgs{flex:1;overflow-y:auto;padding:8px 14px 12px;display:none;flex-direction:column;gap:12px}' +
      '#ts-ai-msgs.show{display:flex}' +
      '.ts-ai-row{display:flex;width:100%;align-items:flex-start;gap:8px}' +
      '.ts-ai-row.u{justify-content:flex-start}' +
      '.ts-ai-row.m{justify-content:flex-end}' +
      '.ts-ai-av{width:26px;height:26px;border-radius:999px;flex:none;display:flex;align-items:center;justify-content:center;color:#fff;background:linear-gradient(135deg,#2563eb,#7c3aed,#ec4899);margin-top:2px;box-shadow:0 4px 12px -2px rgba(124,58,237,.5)}' +
      '.ts-ai-bbl{max-width:84%;border-radius:18px;padding:10px 14px;font-size:13px;line-height:1.72;white-space:pre-wrap;word-break:break-word}' +
      '.ts-ai-row.u .ts-ai-bbl{background:linear-gradient(135deg,#2563eb 0%,#7c3aed 100%);color:#ffffff;border-start-start-radius:5px;box-shadow:0 8px 20px -8px rgba(109,40,217,.55)}' +
      '.ts-ai-row.m .ts-ai-bbl{background:rgba(255,255,255,.82);color:#0f172a;border-end-end-radius:5px;border:1px solid rgba(15,23,42,.08)}' +
      'html.dark .ts-ai-row.m .ts-ai-bbl{background:rgba(30,41,59,.78);color:#f1f5f9;border-color:rgba(255,255,255,.1)}' +
      '.ts-ai-row.err .ts-ai-bbl{background:rgba(254,242,242,.92);color:#b91c1c;border-color:#fecaca}' +
      'html.dark .ts-ai-row.err .ts-ai-bbl{background:rgba(69,10,10,.82);color:#fecaca;border-color:#991b1b}' +

      /* مؤشر التفكير (3 شرط متحركة) */
      '.ts-ai-wave{display:inline-flex;align-items:center;gap:4px;height:18px;padding:2px 4px}' +
      '.ts-ai-wave i{display:block;width:3.5px;height:16px;border-radius:999px;background:linear-gradient(180deg,#4285f4,#8b5cf6,#ec4899);animation:tsAiWave 1s ease-in-out infinite}' +
      '.ts-ai-wave i:nth-child(2){animation-delay:.16s}' +
      '.ts-ai-wave i:nth-child(3){animation-delay:.32s}' +

      /* كارت الكتابة العائم (Dribbble Composer) */
      '.ts-ai-comp-wrap{padding:8px 14px 14px;flex:none}' +
      '.ts-ai-comp{border-radius:20px;border:1px solid rgba(15,23,42,.1);background:rgba(255,255,255,.88);padding:8px 10px 8px 8px;display:flex;flex-direction:column;gap:6px;box-shadow:0 8px 24px -10px rgba(15,23,42,.14);transition:border-color .18s,box-shadow .18s}' +
      'html.dark .ts-ai-comp{border-color:rgba(255,255,255,.12);background:rgba(15,23,42,.82)}' +
      '.ts-ai-comp:focus-within{border-color:#8b5cf6;box-shadow:0 0 0 3px rgba(139,92,246,.16)}' +
      '#ts-ai-inp{width:100%;border:0;background:transparent;color:inherit;font-size:13.5px;padding:4px 6px;outline:none;font-family:inherit}' +
      '.ts-ai-comp-bar{display:flex;align-items:center;justify-content:space-between;gap:6px}' +
      '.ts-ai-comp-tools{display:flex;align-items:center;gap:4px}' +
      '.ts-ai-tbtn{border:1px solid rgba(15,23,42,.08);background:rgba(15,23,42,.04);color:inherit;height:30px;padding:0 10px;border-radius:999px;font-size:11px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:5px;font-family:inherit;opacity:.8;transition:opacity .15s,border-color .15s}' +
      'html.dark .ts-ai-tbtn{border-color:rgba(255,255,255,.1);background:rgba(255,255,255,.06)}' +
      '.ts-ai-tbtn:hover{opacity:1;border-color:#8b5cf6}' +
      '.ts-ai-comp-act{display:flex;align-items:center;gap:6px}' +
      '#ts-ai-mic{border:1px solid rgba(15,23,42,.1);background:rgba(15,23,42,.04);color:inherit;width:34px;height:34px;border-radius:999px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:13px}' +
      'html.dark #ts-ai-mic{border-color:rgba(255,255,255,.12);background:rgba(255,255,255,.07)}' +
      '#ts-ai-mic.rec{background:#ef4444;color:#fff;border-color:#ef4444}' +
      '#ts-ai-send{border:0;border-radius:999px;width:36px;height:36px;display:inline-flex;align-items:center;justify-content:center;color:#fff;cursor:pointer;background:linear-gradient(135deg,#2563eb,#7c3aed,#ec4899);box-shadow:0 6px 16px -4px rgba(124,58,237,.6);font-size:14px}' +
      '#ts-ai-send:disabled{opacity:.5;cursor:default}' +

      '@media(max-width:640px){#ts-ai-btn{bottom:78px;left:16px}#ts-ai-win{left:0!important;right:0!important;bottom:0!important;top:auto!important;width:100%!important;max-width:100%!important;height:88vh;max-height:90vh;border-radius:26px 26px 0 0}#ts-ai-win::before{border-radius:28px 28px 0 0}.ts-ai-hdr{cursor:default}}';
    document.head.appendChild(st);
  }

  function removeUI() {
    if (resetTimer) { clearInterval(resetTimer); resetTimer = null; }
    clearTimeout(glowTimer);
    if (recog && listening) { try { recog.stop(); } catch (e) {} }
    var b = $('ts-ai-btn'), w = $('ts-ai-win');
    if (b) b.remove();
    if (w) w.remove();
  }

  function ensureUI() {
    if (!isMgr()) { removeUI(); return; }
    injectStyles();
    if ($('ts-ai-btn')) return;

    var btn = document.createElement('button');
    btn.id = 'ts-ai-btn';
    btn.type = 'button';
    btn.title = 'مساعد تساهيل الذكي (AI)';
    btn.setAttribute('aria-label', 'مساعد تساهيل AI');
    btn.innerHTML = gemSvg(24) + '<span class="ts-ai-tag">AI</span>';
    btn.onclick = openWin;
    document.body.appendChild(btn);
  }

  function makeDraggable(win, handle) {
    var sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;
    handle.addEventListener('mousedown', function (e) {
      if (window.innerWidth <= 640 || e.target.closest('button')) return;
      dragging = true;
      var r = win.getBoundingClientRect();
      win.style.left = r.left + 'px';
      win.style.top = r.top + 'px';
      win.style.right = 'auto';
      win.style.bottom = 'auto';
      sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
      e.preventDefault();
    });
    window.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      var nx = Math.max(8, Math.min(window.innerWidth - win.offsetWidth - 8, ox + (e.clientX - sx)));
      var ny = Math.max(8, Math.min(window.innerHeight - win.offsetHeight - 8, oy + (e.clientY - sy)));
      win.style.left = nx + 'px';
      win.style.top = ny + 'px';
    });
    window.addEventListener('mouseup', function () {
      if (!dragging) return;
      dragging = false;
      try { localStorage.setItem(POS_KEY, JSON.stringify({ left: win.style.left, top: win.style.top })); } catch (e) {}
    });
  }

  function showChatView() {
    var hero = $('ts-ai-hero'), msgs = $('ts-ai-msgs');
    if (hero) hero.classList.add('hide');
    if (msgs) msgs.classList.add('show');
  }
  function showHeroView() {
    var hero = $('ts-ai-hero'), msgs = $('ts-ai-msgs');
    if (hero) hero.classList.remove('hide');
    if (msgs) msgs.classList.remove('show');
  }

  function setupVoice() {
    var micBtn = $('ts-ai-mic');
    if (!micBtn) return;
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { micBtn.style.display = 'none'; return; }
    micBtn.onclick = function () {
      if (listening && recog) { recog.stop(); return; }
      try {
        recog = new SR();
        recog.lang = 'ar-EG';
        recog.interimResults = false;
        recog.onstart = function () { listening = true; micBtn.classList.add('rec'); pulseGlow(0); };
        recog.onresult = function (ev) {
          var txt = ev.results && ev.results[0] && ev.results[0][0] && ev.results[0][0].transcript;
          if (txt && $('ts-ai-inp')) { $('ts-ai-inp').value = txt; $('ts-ai-inp').focus(); }
        };
        recog.onerror = function () {};
        recog.onend = function () { listening = false; micBtn.classList.remove('rec'); pulseGlow(800); };
        recog.start();
      } catch (e) {}
    };
  }

  function openWin() {
    if (!isMgr()) return;
    injectStyles();
    var btn = $('ts-ai-btn');
    if (btn) btn.style.display = 'none';

    var win = $('ts-ai-win');
    if (win) {
      win.classList.add('open');
      win.classList.remove('min');
      pulseGlow(1800);
      renderUsageDrawer();
      $('ts-ai-inp').focus();
      return;
    }

    win = document.createElement('div');
    win.id = 'ts-ai-win';
    win.className = 'open';
    try {
      var savedPos = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
      if (savedPos && savedPos.left && savedPos.top && window.innerWidth > 640) {
        win.style.left = savedPos.left;
        win.style.top = savedPos.top;
        win.style.bottom = 'auto';
      }
    } catch (e) {}

    win.innerHTML =
      '<div class="ts-ai-hdr" id="ts-ai-drag">' +
        '<div class="ts-ai-pill">' + gemSvg(14) + '<span>تساهيل AI</span></div>' +
        '<div style="display:flex;align-items:center;gap:5px">' +
          '<button type="button" id="ts-ai-gear" class="ts-ai-hbtn" title="الليمت والاستهلاك" aria-label="الليمت والاستهلاك"><i class="fa-solid fa-gear"></i></button>' +
          '<button type="button" id="ts-ai-clear" class="ts-ai-hbtn" title="محادثة جديدة" aria-label="محادثة جديدة"><i class="fa-solid fa-rotate-right"></i></button>' +
          '<button type="button" id="ts-ai-min" class="ts-ai-hbtn" title="تصغير" aria-label="تصغير"><i class="fa-solid fa-minus"></i></button>' +
          '<button type="button" id="ts-ai-close" class="ts-ai-hbtn" title="إغلاق" aria-label="إغلاق"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
      '</div>' +
      '<div class="ts-ai-body">' +
        '<div id="ts-ai-usage"></div>' +
        '<div id="ts-ai-hero">' +
          '<div class="ts-ai-orb">' + gemSvg(28) + '</div>' +
          '<div class="ts-ai-htxt">' +
            '<h3>أهلاً، ' + esc(mgrFirstName()) + '</h3>' +
            '<p>جاهز نتابع كل تفاصيل تساهيل النهارده؟</p>' +
          '</div>' +
          '<div class="ts-ai-cards">' +
            '<button type="button" class="ts-ai-card" data-q="اديني ملخص شامل للمبيعات والأرباح والطلبات النهارده والشهر ده">' +
              '<span class="ts-ai-cico" style="background:rgba(16,185,129,.14);color:#10b981"><i class="fa-solid fa-chart-line"></i></span>' +
              '<b>المبيعات والأرباح</b><span>ملخص اليوم والشهر والهامش</span>' +
            '</button>' +
            '<button type="button" class="ts-ai-card" data-q="مين من الموظفين بصم حضور النهارده ومين مبصمش ومين في إجازة؟">' +
              '<span class="ts-ai-cico" style="background:rgba(59,130,246,.14);color:#3b82f6"><i class="fa-solid fa-user-check"></i></span>' +
              '<b>الحضور والفريق</b><span>البصمة والإجازات والغياب</span>' +
            '</button>' +
            '<button type="button" class="ts-ai-card" data-q="إيه وضع المناديب والمشاوير والتيكتات وعهدة الورق النهارده؟">' +
              '<span class="ts-ai-cico" style="background:rgba(139,92,246,.14);color:#8b5cf6"><i class="fa-solid fa-motorcycle"></i></span>' +
              '<b>المناديب والتيكتات</b><span>المشاوير والرادار والعهدة</span>' +
            '</button>' +
            '<button type="button" class="ts-ai-card" data-q="إيه وضع الكاش والاستردادات والخصومات والمحافظ والمنفذين؟">' +
              '<span class="ts-ai-cico" style="background:rgba(245,158,11,.14);color:#f59e0b"><i class="fa-solid fa-wallet"></i></span>' +
              '<b>الكاش والمالية</b><span>الاسترداد والمحافظ والأهداف</span>' +
            '</button>' +
          '</div>' +
        '</div>' +
        '<div id="ts-ai-msgs"></div>' +
        '<div class="ts-ai-comp-wrap">' +
          '<form id="ts-ai-form" class="ts-ai-comp">' +
            '<input id="ts-ai-inp" type="text" maxlength="500" placeholder="اسألني عن أي حاجة في السيستم...">' +
            '<div class="ts-ai-comp-bar">' +
              '<div class="ts-ai-comp-tools">' +
                '<button type="button" id="ts-ai-home-t" class="ts-ai-tbtn" title="البطاقات السريعة"><i class="fa-solid fa-grid-2"></i><span>الأقسام</span></button>' +
                '<button type="button" id="ts-ai-late-t" class="ts-ai-tbtn" title="المتأخرات"><i class="fa-solid fa-clock"></i><span>المتأخرات</span></button>' +
              '</div>' +
              '<div class="ts-ai-comp-act">' +
                '<button type="button" id="ts-ai-mic" title="تحدث بالصوت" aria-label="تحدث بالصوت"><i class="fa-solid fa-microphone"></i></button>' +
                '<button id="ts-ai-send" type="submit" aria-label="إرسال"><i class="fa-solid fa-arrow-up"></i></button>' +
              '</div>' +
            '</div>' +
          '</form>' +
        '</div>' +
      '</div>';

    document.body.appendChild(win);
    makeDraggable(win, $('ts-ai-drag'));
    setupVoice();
    renderUsageDrawer();
    pulseGlow(1800);
    if (!resetTimer) resetTimer = setInterval(renderUsageDrawer, 60000);

    win.addEventListener('pointerdown', function () { pulseGlow(1400); });
    $('ts-ai-inp').addEventListener('focus', function () { pulseGlow(1800); });

    $('ts-ai-gear').onclick = function () {
      var u = $('ts-ai-usage'), g = $('ts-ai-gear');
      if (!u) return;
      var open = u.classList.toggle('open');
      if (g) g.classList.toggle('on', open);
      if (open) renderUsageDrawer();
    };
    $('ts-ai-close').onclick = closeWin;
    $('ts-ai-min').onclick = function () { win.classList.toggle('min'); };
    $('ts-ai-clear').onclick = function () {
      history = [];
      sessionTokens = 0;
      renderUsageDrawer();
      $('ts-ai-msgs').innerHTML = '';
      showHeroView();
    };
    $('ts-ai-home-t').onclick = function () {
      var h = $('ts-ai-hero');
      if (h && h.classList.contains('hide')) showHeroView(); else if ($('ts-ai-msgs').children.length) showChatView();
    };
    $('ts-ai-late-t').onclick = function () { ask('إيه البنود المتأخرة حاليًا وأكتر خدمات فيها تأخير؟'); };

    Array.prototype.forEach.call(win.querySelectorAll('.ts-ai-card'), function (c) {
      c.onclick = function () { ask(c.getAttribute('data-q')); };
    });
    $('ts-ai-form').onsubmit = function (e) {
      e.preventDefault();
      var q = ($('ts-ai-inp').value || '').trim();
      if (q) ask(q);
    };
    $('ts-ai-inp').focus();
  }

  function closeWin() {
    var w = $('ts-ai-win');
    if (w) { w.classList.remove('open'); w.classList.remove('is-glow'); }
    var btn = $('ts-ai-btn');
    if (btn && isMgr()) btn.style.display = 'flex';
  }

  function appendMsg(role, text, isErr) {
    showChatView();
    var box = $('ts-ai-msgs');
    if (!box) return null;
    var wrap = document.createElement('div');
    wrap.className = 'ts-ai-row ' + (role === 'user' ? 'u' : 'm') + (isErr ? ' err' : '');
    var bubble = document.createElement('div');
    bubble.className = 'ts-ai-bbl';
    bubble.innerHTML = role === 'user' ? esc(text) : fmtAiText(text);
    wrap.appendChild(bubble);
    if (role !== 'user') {
      var av = document.createElement('span');
      av.className = 'ts-ai-av';
      av.innerHTML = gemSvg(13);
      wrap.appendChild(av);
    }
    box.appendChild(wrap);
    box.scrollTop = box.scrollHeight;
    return wrap;
  }

  function appendThinking() {
    showChatView();
    var box = $('ts-ai-msgs');
    if (!box) return null;
    var wrap = document.createElement('div');
    wrap.className = 'ts-ai-row m';
    wrap.innerHTML = '<div class="ts-ai-bbl" aria-label="جاري التفكير"><span class="ts-ai-wave"><i></i><i></i><i></i></span></div><span class="ts-ai-av">' + gemSvg(13) + '</span>';
    box.appendChild(wrap);
    box.scrollTop = box.scrollHeight;
    return wrap;
  }

  async function ask(question) {
    if (busy || !isMgr()) return;
    question = String(question || '').trim().slice(0, 500);
    if (!question) return;

    busy = true;
    pulseGlow(0);
    if ($('ts-ai-inp')) $('ts-ai-inp').value = '';
    if ($('ts-ai-send')) $('ts-ai-send').disabled = true;
    appendMsg('user', question, false);
    var waitEl = appendThinking();

    try {
      if (typeof sbClient === 'undefined' || !sbClient) throw new Error('النظام غير متصل بـ Supabase');
      var ses = await sbClient.auth.getSession();
      var token = ses && ses.data && ses.data.session && ses.data.session.access_token;
      if (!token) throw new Error('سجّل دخول الأول');

      var sbUrl = (typeof DEFAULT_SB_URL !== 'undefined' ? DEFAULT_SB_URL : null) || localStorage.getItem('sb_url') || 'https://avehvjqifswsyayckpvx.supabase.co';
      var sbKey = localStorage.getItem('sb_key') || '';
      var headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token };
      if (sbKey) headers['apikey'] = sbKey;

      var res = await fetch(sbUrl.replace(/\/$/, '') + FN_PATH, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ question: question, history: history.slice(-6) })
      });
      var data = await res.json().catch(function () { return {}; });
      if (waitEl) waitEl.remove();

      if (!res.ok) {
        appendMsg('model', data.error || ('تعذر الاتصال بالمساعد (' + res.status + ')'), true);
      } else {
        var ans = data.answer || 'مفيش رد.';
        appendMsg('model', ans, false);
        history.push({ role: 'user', text: question }, { role: 'model', text: ans });
        if (history.length > 12) history = history.slice(-12);
        var tok = (data.usage && data.usage.total_tokens) || 0;
        bumpUsage(tok, data.model);
      }
    } catch (e) {
      if (waitEl) waitEl.remove();
      appendMsg('model', (e && e.message) || 'حصل خطأ في الاتصال', true);
    } finally {
      busy = false;
      if ($('ts-ai-send')) $('ts-ai-send').disabled = false;
      pulseGlow(900);
    }
  }

  if (window.TasahelBus && typeof window.TasahelBus.on === 'function') {
    window.TasahelBus.on('app:ready', function () { setTimeout(ensureUI, 800); });
    window.TasahelBus.on('tab:change', function () { setTimeout(ensureUI, 200); });
    window.TasahelBus.on('auth:logout', function () {
      history = [];
      sessionTokens = 0;
      removeUI();
    });
  }
  setTimeout(ensureUI, 1800);
})();
