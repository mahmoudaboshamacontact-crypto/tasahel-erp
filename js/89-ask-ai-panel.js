/* =====================================================================
   js/89-ask-ai-panel.js
   واجهة "اسأل AI" العائمة للمدير فقط — ألوان Gemini Gradient + أشرطة ليمت رشيقة.
   ملف مستقل تماماً لا يلمس js/16-ask-ai.js أو أي ملف مقفول.
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

  var GEMINI_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true" style="flex:none"><path d="M12 2C12.7 7.2 16.8 11.3 22 12C16.8 12.7 12.7 16.8 12 22C11.3 16.8 7.2 12.7 2 12C7.2 11.3 11.3 7.2 12 2Z" fill="currentColor"/></svg>';

  function $(id) { return document.getElementById(id); }
  function isMgr() {
    if (window.__role !== 'manager') return false;
    if (document.body && (document.body.classList.contains('is-courier-mode') || document.body.classList.contains('is-partner-mode'))) return false;
    return true;
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
    var daysLeft = 7 - dow;
    return daysLeft + 'ي';
  }
  function monthlyResetInfo() {
    var p = cairoParts().day.split('-');
    var daysInMonth = new Date(Date.UTC(+p[0], +p[1], 0)).getUTCDate();
    var left = Math.max(1, daysInMonth - (+p[2]) + 1);
    return left + 'ي';
  }

  function loadUsage() {
    var p = cairoParts();
    var wk = cairoWeekKey();
    var def = {
      day: p.day, day_req: 0, day_tok: 0,
      week: wk, week_req: 0, week_tok: 0,
      month: p.month, month_req: 0, month_tok: 0,
      model: 'gemini-3.5-flash-lite'
    };
    try {
      var raw = JSON.parse(localStorage.getItem(USAGE_KEY) || 'null');
      if (!raw) return def;
      if (raw.day !== p.day) { raw.day = p.day; raw.day_req = 0; raw.day_tok = 0; }
      if (raw.week !== wk) { raw.week = wk; raw.week_req = 0; raw.week_tok = 0; }
      if (raw.month !== p.month) { raw.month = p.month; raw.month_req = 0; raw.month_tok = 0; }
      return Object.assign(def, raw);
    } catch (e) { return def; }
  }
  function saveUsage(u) {
    try { localStorage.setItem(USAGE_KEY, JSON.stringify(u)); } catch (e) {}
  }
  function bumpUsage(tok, model) {
    var u = loadUsage();
    var t = Number(tok) || 0;
    u.day_req += 1; u.day_tok += t;
    u.week_req += 1; u.week_tok += t;
    u.month_req += 1; u.month_tok += t;
    if (model) u.model = model;
    sessionTokens += t;
    saveUsage(u);
    renderUsageBar();
  }

  function barColor(pct) {
    return pct >= 85 ? '#ef4444' : (pct >= 60 ? '#f59e0b' : '#22c55e');
  }
  function meterItem(label, used, limit, rightText, title) {
    var pct = Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
    var col = barColor(pct);
    var fillW = used > 0 ? Math.max(4, pct) : 0;
    return '<div class="ts-ai-m" title="' + esc(title) + '">' +
      '<span class="ts-ai-ml">' + esc(label) + '</span>' +
      '<span class="ts-ai-track"><i class="ts-ai-fill" style="width:' + fillW + '%;background:' + col + '"></i></span>' +
      '<span class="ts-ai-pct" style="color:' + col + '">' + pct + '%</span>' +
      '<span class="ts-ai-rt">' + esc(rightText) + '</span>' +
    '</div>';
  }

  function renderUsageBar() {
    var bar = $('ts-ai-usage');
    if (!bar) return;
    var u = loadUsage();
    var msgsUsed = Math.floor(history.length / 2);
    bar.innerHTML =
      meterItem('المحادثة', msgsUsed, 6, nf(sessionTokens) + ' tok', 'سياق المحادثة الحالي والتوكنات المستهلكة') +
      meterItem('اليومي', u.day_req, DAILY_REQ_LIMIT, dailyResetInfo(), u.day_req + ' طلب · ' + nf(u.day_tok) + ' توكن اليوم') +
      meterItem('الأسبوعي', u.week_req, WEEKLY_REQ_LIMIT, weeklyResetInfo(), u.week_req + ' طلب · ' + nf(u.week_tok) + ' توكن الأسبوع ده') +
      meterItem('الشهري', u.month_req, MONTHLY_REQ_LIMIT, monthlyResetInfo(), u.month_req + ' طلب · ' + nf(u.month_tok) + ' توكن الشهر ده');
  }

  function injectStyles() {
    if ($('ts-ai-style')) return;
    var st = document.createElement('style');
    st.id = 'ts-ai-style';
    st.textContent =
      '#ts-ai-btn{position:fixed;left:18px;bottom:42px;z-index:95;height:44px;padding:0 16px;border-radius:999px;border:0;cursor:pointer;display:flex;align-items:center;gap:7px;font-weight:700;font-size:13px;color:#fff;background:linear-gradient(135deg,#4285f4 0%,#8b5cf6 52%,#d96570 100%);box-shadow:0 10px 26px -6px rgba(139,92,246,.6);font-family:inherit;transition:transform .15s}' +
      '#ts-ai-btn:hover{transform:translateY(-1px)}' +
      '#ts-ai-win{position:fixed;left:22px;bottom:22px;z-index:160;width:540px;max-width:calc(100vw - 24px);height:610px;max-height:calc(100vh - 36px);display:none;flex-direction:column;border-radius:20px;overflow:hidden;background:#ffffff;color:#0f172a;border:1px solid #e2e8f0;box-shadow:0 24px 60px -12px rgba(15,23,42,.38)}' +
      '#ts-ai-win.open{display:flex}' +
      '#ts-ai-win.min{height:auto!important;width:300px!important}' +
      '#ts-ai-win.min .ts-ai-body{display:none}' +
      'html.dark #ts-ai-win{background:#0f172a;color:#f1f5f9;border-color:#334155}' +
      '.ts-ai-topband{height:3px;width:100%;background:linear-gradient(90deg,#4285f4,#8b5cf6,#d96570);flex:none}' +
      '.ts-ai-hdr{display:flex;align-items:center;justify-content:space-between;padding:11px 16px;border-bottom:1px solid #f1f5f9;cursor:move;user-select:none}' +
      'html.dark .ts-ai-hdr{border-bottom-color:#1e293b}' +
      '.ts-ai-logo{display:flex;width:32px;height:32px;align-items:center;justify-content:center;border-radius:10px;color:#fff;background:linear-gradient(135deg,#4285f4 0%,#8b5cf6 52%,#d96570 100%);box-shadow:0 4px 12px -3px rgba(139,92,246,.5)}' +
      '.ts-ai-body{display:flex;flex-direction:column;flex:1;min-height:0}' +
      '.ts-ai-usage{display:grid;grid-template-columns:1fr 1fr;gap:6px 18px;padding:8px 16px;border-bottom:1px solid #f1f5f9;background:#fafafa;font-size:11px}' +
      'html.dark .ts-ai-usage{border-bottom-color:#1e293b;background:#111827}' +
      '.ts-ai-m{display:flex;align-items:center;gap:7px;min-width:0}' +
      '.ts-ai-ml{color:#64748b;font-weight:600;white-space:nowrap;font-size:11px}' +
      'html.dark .ts-ai-ml{color:#94a3b8}' +
      '.ts-ai-track{position:relative;flex:1;height:5px;border-radius:999px;background:#e5e7eb;overflow:hidden;min-width:44px}' +
      'html.dark .ts-ai-track{background:#334155}' +
      '.ts-ai-fill{display:block;height:100%;border-radius:999px;position:relative}' +
      '.ts-ai-pct{font-family:Consolas,monospace;font-weight:700;font-size:11px;white-space:nowrap;direction:ltr}' +
      '.ts-ai-rt{color:#64748b;font-size:10.5px;white-space:nowrap;font-family:Consolas,monospace}' +
      'html.dark .ts-ai-rt{color:#94a3b8}' +
      '.ts-ai-chips{display:flex;flex-wrap:wrap;gap:5px;padding:8px 14px;border-bottom:1px solid #f1f5f9}' +
      'html.dark .ts-ai-chips{border-bottom-color:#1e293b}' +
      '.ts-ai-chip{border:1px solid #e2e8f0;background:#f8fafc;color:#334155;border-radius:999px;padding:4px 10px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;transition:border-color .15s}' +
      'html.dark .ts-ai-chip{border-color:#334155;background:#1e293b;color:#e2e8f0}' +
      '.ts-ai-chip:hover{border-color:#8b5cf6;color:#6d28d9}' +
      'html.dark .ts-ai-chip:hover{border-color:#8b5cf6;color:#c4b5fd}' +
      '#ts-ai-msgs{flex:1;overflow-y:auto;padding:14px 16px;display:flex;flex-direction:column;gap:10px}' +
      '.ts-ai-row{display:flex;width:100%}' +
      '.ts-ai-row.u{justify-content:flex-start}' +
      '.ts-ai-row.m{justify-content:flex-end}' +
      '.ts-ai-bbl{max-width:88%;border-radius:16px;padding:10px 14px;font-size:12.5px;line-height:1.7;white-space:pre-wrap;word-break:break-word}' +
      '.ts-ai-row.u .ts-ai-bbl{background:linear-gradient(135deg,#4285f4 0%,#8b5cf6 58%,#d96570 100%);color:#ffffff;border-start-start-radius:4px}' +
      '.ts-ai-row.m .ts-ai-bbl{background:#f1f5f9;color:#0f172a;border-end-end-radius:4px}' +
      'html.dark .ts-ai-row.m .ts-ai-bbl{background:#1e293b;color:#f1f5f9}' +
      '.ts-ai-row.err .ts-ai-bbl{background:#fef2f2;color:#b91c1c;border:1px solid #fecaca}' +
      'html.dark .ts-ai-row.err .ts-ai-bbl{background:#450a0a;color:#fecaca;border-color:#991b1b}' +
      '.ts-ai-ft{display:flex;align-items:center;gap:8px;padding:10px 14px;border-top:1px solid #f1f5f9}' +
      'html.dark .ts-ai-ft{border-top-color:#1e293b}' +
      '#ts-ai-inp{flex:1;border:1px solid #e2e8f0;background:#f8fafc;color:#0f172a;border-radius:12px;padding:9px 13px;font-size:13px;outline:none;font-family:inherit}' +
      'html.dark #ts-ai-inp{border-color:#334155;background:#1e293b;color:#f8fafc}' +
      '#ts-ai-inp:focus{border-color:#8b5cf6}' +
      '#ts-ai-send{border:0;border-radius:12px;padding:9px 18px;font-size:13px;font-weight:700;color:#fff;cursor:pointer;background:linear-gradient(135deg,#4285f4 0%,#8b5cf6 55%,#d96570 100%);font-family:inherit}' +
      '#ts-ai-send:disabled{opacity:.55;cursor:default}' +
      '@media(max-width:640px){#ts-ai-win{left:0!important;right:0!important;bottom:0!important;top:auto!important;width:100%!important;max-width:100%!important;height:88vh;max-height:90vh;border-radius:20px 20px 0 0}.ts-ai-hdr{cursor:default}.ts-ai-usage{grid-template-columns:1fr}}';
    document.head.appendChild(st);
  }

  function removeUI() {
    if (resetTimer) { clearInterval(resetTimer); resetTimer = null; }
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
    btn.title = 'اسأل Gemini AI (للمدير)';
    btn.setAttribute('aria-label', 'اسأل AI');
    btn.innerHTML = GEMINI_SVG + '<span>AI</span>';
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

  function openWin() {
    if (!isMgr()) return;
    injectStyles();
    var btn = $('ts-ai-btn');
    if (btn) btn.style.display = 'none';

    var win = $('ts-ai-win');
    if (win) {
      win.classList.add('open');
      win.classList.remove('min');
      renderUsageBar();
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
      '<div class="ts-ai-topband"></div>' +
      '<div class="ts-ai-hdr" id="ts-ai-drag">' +
        '<div style="display:flex;align-items:center;gap:10px">' +
          '<span class="ts-ai-logo">' + GEMINI_SVG + '</span>' +
          '<div><div style="font-weight:700;font-size:13.5px">مساعد تساهيل AI</div><div style="font-size:10.5px;opacity:.68">اسحب للتحريك · أرقام مجمّعة فقط</div></div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:4px">' +
          '<button type="button" id="ts-ai-min" title="تصغير / تكبير" style="border:0;background:transparent;color:inherit;opacity:.7;padding:5px 8px;border-radius:8px;cursor:pointer"><i class="fa-solid fa-window-minimize"></i></button>' +
          '<button type="button" id="ts-ai-clear" title="محادثة جديدة" style="border:0;background:transparent;color:inherit;opacity:.7;padding:5px 8px;border-radius:8px;cursor:pointer"><i class="fa-solid fa-rotate-right"></i></button>' +
          '<button type="button" id="ts-ai-close" aria-label="إغلاق" style="border:0;background:transparent;color:inherit;opacity:.8;padding:5px 8px;border-radius:8px;cursor:pointer;font-size:15px"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
      '</div>' +
      '<div class="ts-ai-body">' +
        '<div class="ts-ai-usage" id="ts-ai-usage"></div>' +
        '<div class="ts-ai-chips">' +
          '<button type="button" class="ts-ai-chip">ملخص مبيعات الشهر ده</button>' +
          '<button type="button" class="ts-ai-chip">أكتر 5 خدمات طلبًا</button>' +
          '<button type="button" class="ts-ai-chip">إيه البنود المتأخرة حاليًا؟</button>' +
          '<button type="button" class="ts-ai-chip">ملخص التشغيل والمناديب النهارده</button>' +
          '<button type="button" class="ts-ai-chip">وضع الاستردادات والكاش والشريك</button>' +
          '<button type="button" class="ts-ai-chip">مقارنة الشهر ده بالشهر اللي فات</button>' +
        '</div>' +
        '<div id="ts-ai-msgs">' +
          '<div class="ts-ai-row m"><div class="ts-ai-bbl">أهلاً يا مدير! اسألني عن المبيعات، الأرباح، العمولات، التأخيرات، التيكتات، المناديب، الاستردادات، أو الكاش.</div></div>' +
        '</div>' +
        '<form id="ts-ai-form" class="ts-ai-ft">' +
          '<input id="ts-ai-inp" type="text" maxlength="500" placeholder="اكتب سؤالك هنا...">' +
          '<button id="ts-ai-send" type="submit">إرسال</button>' +
        '</form>' +
      '</div>';

    document.body.appendChild(win);
    makeDraggable(win, $('ts-ai-drag'));
    renderUsageBar();
    if (!resetTimer) resetTimer = setInterval(renderUsageBar, 60000);

    $('ts-ai-close').onclick = closeWin;
    $('ts-ai-min').onclick = function () { win.classList.toggle('min'); };
    $('ts-ai-clear').onclick = function () {
      history = [];
      sessionTokens = 0;
      renderUsageBar();
      $('ts-ai-msgs').innerHTML = '<div class="ts-ai-row m"><div class="ts-ai-bbl">تم بدء محادثة جديدة.</div></div>';
    };
    Array.prototype.forEach.call(win.querySelectorAll('.ts-ai-chip'), function (c) {
      c.onclick = function () { $('ts-ai-inp').value = c.textContent; ask(c.textContent); };
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
    if (w) w.classList.remove('open');
    var btn = $('ts-ai-btn');
    if (btn && isMgr()) btn.style.display = 'flex';
  }

  function appendMsg(role, text, isErr) {
    var box = $('ts-ai-msgs');
    if (!box) return null;
    var wrap = document.createElement('div');
    wrap.className = 'ts-ai-row ' + (role === 'user' ? 'u' : 'm') + (isErr ? ' err' : '');
    var bubble = document.createElement('div');
    bubble.className = 'ts-ai-bbl';
    bubble.innerHTML = role === 'user' ? esc(text) : fmtAiText(text);
    wrap.appendChild(bubble);
    box.appendChild(wrap);
    box.scrollTop = box.scrollHeight;
    return wrap;
  }

  async function ask(question) {
    if (busy || !isMgr()) return;
    question = String(question || '').trim().slice(0, 500);
    if (!question) return;

    busy = true;
    $('ts-ai-inp').value = '';
    $('ts-ai-send').disabled = true;
    appendMsg('user', question, false);
    var waitEl = appendMsg('model', 'جارٍ تحليل الأرقام...', false);

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
    }
  }

  var _li = window.loadInitialData;
  if (typeof _li === 'function') {
    window.loadInitialData = async function () {
      var r = await _li.apply(this, arguments);
      setTimeout(ensureUI, 800);
      return r;
    };
  }
  var _sw = window.switchTab;
  if (typeof _sw === 'function') {
    window.switchTab = function () {
      var r = _sw.apply(this, arguments);
      setTimeout(ensureUI, 200);
      return r;
    };
  }
  var _lo = window.handleLogout;
  if (typeof _lo === 'function') {
    window.handleLogout = async function () {
      history = [];
      sessionTokens = 0;
      removeUI();
      return _lo.apply(this, arguments);
    };
  }
  setTimeout(ensureUI, 1800);
})();
