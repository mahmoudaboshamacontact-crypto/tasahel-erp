/* =====================================================================
   js/89-ask-ai-panel.js
   واجهة "اسأل الذكاء الاصطناعي" للمدير فقط — تتصل بـ Edge Function ask-ai.
   ملف مستقل تماماً لا يلمس js/16-ask-ai.js أو أي ملف مقفول.
   ===================================================================== */
(function () {
  'use strict';
  if (window.__tsAskAiPanel) return;
  window.__tsAskAiPanel = true;

  var FN_PATH = '/functions/v1/ask-ai';
  var history = [];
  var busy = false;

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

  function injectStyles() {
    if ($('ts-ai-style')) return;
    var st = document.createElement('style');
    st.id = 'ts-ai-style';
    st.textContent =
      '#ts-ai-btn{position:fixed;left:18px;bottom:42px;z-index:95;height:44px;padding:0 16px;border-radius:999px;border:0;cursor:pointer;display:flex;align-items:center;gap:8px;font-weight:700;font-size:13px;color:#fff;background:linear-gradient(135deg,#0f766e,#0369a1);box-shadow:0 10px 24px -6px rgba(3,105,161,.55);font-family:inherit}' +
      '#ts-ai-modal{position:fixed;inset:0;z-index:160;display:none;align-items:center;justify-content:center;padding:16px;background:rgba(15,23,42,.72);backdrop-filter:blur(6px)}' +
      '#ts-ai-modal.open{display:flex}' +
      '.ts-ai-card{width:100%;max-width:640px;max-height:86vh;display:flex;flex-direction:column;border-radius:22px;overflow:hidden;background:#ffffff;color:#0f172a;border:1px solid #e2e8f0;box-shadow:0 24px 60px -12px rgba(0,0,0,.45)}' +
      'html.dark .ts-ai-card{background:#0f172a;color:#f1f5f9;border-color:#334155}' +
      '.ts-ai-hdr{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #e2e8f0}' +
      'html.dark .ts-ai-hdr{border-bottom-color:#1e293b}' +
      '.ts-ai-chips{display:flex;flex-wrap:wrap;gap:6px;padding:10px 16px;border-bottom:1px solid #e2e8f0;background:#f8fafc}' +
      'html.dark .ts-ai-chips{border-bottom-color:#1e293b;background:#1e293b}' +
      '.ts-ai-chip{border:1px solid #cbd5e1;background:#ffffff;color:#1e293b;border-radius:999px;padding:5px 12px;font-size:11.5px;font-weight:600;cursor:pointer;font-family:inherit}' +
      'html.dark .ts-ai-chip{border-color:#475569;background:#0f172a;color:#e2e8f0}' +
      '.ts-ai-chip:hover{border-color:#0f766e}' +
      '#ts-ai-msgs{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;background:#ffffff}' +
      'html.dark #ts-ai-msgs{background:#0f172a}' +
      '.ts-ai-row{display:flex;width:100%}' +
      '.ts-ai-row.u{justify-content:flex-start}' +
      '.ts-ai-row.m{justify-content:flex-end}' +
      '.ts-ai-bbl{max-width:86%;border-radius:16px;padding:10px 14px;font-size:13px;line-height:1.7;white-space:pre-wrap;word-break:break-word}' +
      '.ts-ai-row.u .ts-ai-bbl{background:linear-gradient(135deg,#0f766e,#0369a1);color:#ffffff;border-start-start-radius:4px}' +
      '.ts-ai-row.m .ts-ai-bbl{background:#f1f5f9;color:#0f172a;border-end-end-radius:4px}' +
      'html.dark .ts-ai-row.m .ts-ai-bbl{background:#1e293b;color:#f1f5f9}' +
      '.ts-ai-row.err .ts-ai-bbl{background:#fef2f2;color:#b91c1c;border:1px solid #fecaca}' +
      'html.dark .ts-ai-row.err .ts-ai-bbl{background:#450a0a;color:#fecaca;border-color:#991b1b}' +
      '.ts-ai-ft{display:flex;align-items:center;gap:8px;padding:12px 14px;border-top:1px solid #e2e8f0;background:#ffffff}' +
      'html.dark .ts-ai-ft{border-top-color:#1e293b;background:#0f172a}' +
      '#ts-ai-inp{flex:1;border:1px solid #cbd5e1;background:#f8fafc;color:#0f172a;border-radius:12px;padding:10px 14px;font-size:13.5px;outline:none;font-family:inherit}' +
      'html.dark #ts-ai-inp{border-color:#334155;background:#1e293b;color:#f8fafc}' +
      '#ts-ai-inp:focus{border-color:#0f766e}' +
      '#ts-ai-send{border:0;border-radius:12px;padding:10px 18px;font-size:13px;font-weight:700;color:#fff;cursor:pointer;background:linear-gradient(135deg,#0f766e,#0369a1);font-family:inherit}' +
      '#ts-ai-send:disabled{opacity:.55;cursor:default}' +
      '@media(max-width:640px){#ts-ai-modal{padding:0;align-items:flex-end}.ts-ai-card{max-width:100%;max-height:90vh;border-radius:22px 22px 0 0}}';
    document.head.appendChild(st);
  }

  function removeUI() {
    var b = $('ts-ai-btn'), m = $('ts-ai-modal');
    if (b) b.remove();
    if (m) m.remove();
  }

  function ensureUI() {
    if (!isMgr()) { removeUI(); return; }
    injectStyles();
    if ($('ts-ai-btn')) return;

    var btn = document.createElement('button');
    btn.id = 'ts-ai-btn';
    btn.type = 'button';
    btn.title = 'اسأل الذكاء الاصطناعي (للمدير)';
    btn.setAttribute('aria-label', 'اسأل الذكاء الاصطناعي');
    btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i><span>اسأل AI</span>';
    btn.onclick = openModal;
    document.body.appendChild(btn);
  }

  function openModal() {
    if (!isMgr()) return;
    injectStyles();
    var btn = $('ts-ai-btn');
    if (btn) btn.style.display = 'none';

    var modal = $('ts-ai-modal');
    if (modal) {
      modal.classList.add('open');
      $('ts-ai-inp').focus();
      return;
    }

    modal = document.createElement('div');
    modal.id = 'ts-ai-modal';
    modal.className = 'open';
    modal.innerHTML =
      '<div class="ts-ai-card">' +
        '<div class="ts-ai-hdr">' +
          '<div style="display:flex;align-items:center;gap:10px">' +
            '<span style="display:flex;width:36px;height:36px;align-items:center;justify-content:center;border-radius:12px;color:#fff;background:linear-gradient(135deg,#0f766e,#0369a1)"><i class="fa-solid fa-wand-magic-sparkles"></i></span>' +
            '<div><div style="font-weight:700;font-size:14px">مساعد تحليل الأرقام (AI)</div><div style="font-size:11px;opacity:.7">للمدير فقط — أرقام مجمّعة بدون بيانات عملاء</div></div>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:6px">' +
            '<button type="button" id="ts-ai-clear" title="محادثة جديدة" style="border:0;background:transparent;color:inherit;opacity:.7;padding:6px 10px;border-radius:8px;cursor:pointer"><i class="fa-solid fa-rotate-right"></i></button>' +
            '<button type="button" id="ts-ai-close" aria-label="إغلاق" style="border:0;background:transparent;color:inherit;opacity:.8;padding:6px 10px;border-radius:8px;cursor:pointer;font-size:15px"><i class="fa-solid fa-xmark"></i></button>' +
          '</div>' +
        '</div>' +
        '<div class="ts-ai-chips">' +
          '<button type="button" class="ts-ai-chip">ملخص مبيعات الشهر ده</button>' +
          '<button type="button" class="ts-ai-chip">أكتر 5 خدمات طلبًا</button>' +
          '<button type="button" class="ts-ai-chip">إيه البنود المتأخرة حاليًا؟</button>' +
          '<button type="button" class="ts-ai-chip">مقارنة الشهر ده بالشهر اللي فات</button>' +
        '</div>' +
        '<div id="ts-ai-msgs">' +
          '<div class="ts-ai-row m"><div class="ts-ai-bbl">أهلاً يا مدير! اسألني عن المبيعات، الأرباح التقديرية، العمولات، أو الطلبات المتأخرة حسب الخدمة أو الشهر.</div></div>' +
        '</div>' +
        '<form id="ts-ai-form" class="ts-ai-ft">' +
          '<input id="ts-ai-inp" type="text" maxlength="500" placeholder="اكتب سؤالك هنا...">' +
          '<button id="ts-ai-send" type="submit">إرسال</button>' +
        '</form>' +
      '</div>';

    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
    $('ts-ai-close').onclick = closeModal;
    $('ts-ai-clear').onclick = function () {
      history = [];
      $('ts-ai-msgs').innerHTML = '<div class="ts-ai-row m"><div class="ts-ai-bbl">تم بدء محادثة جديدة.</div></div>';
    };
    Array.prototype.forEach.call(modal.querySelectorAll('.ts-ai-chip'), function (c) {
      c.onclick = function () { $('ts-ai-inp').value = c.textContent; ask(c.textContent); };
    });
    $('ts-ai-form').onsubmit = function (e) {
      e.preventDefault();
      var q = ($('ts-ai-inp').value || '').trim();
      if (q) ask(q);
    };
    $('ts-ai-inp').focus();
  }

  function closeModal() {
    var m = $('ts-ai-modal');
    if (m) m.classList.remove('open');
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
      removeUI();
      return _lo.apply(this, arguments);
    };
  }
  setTimeout(ensureUI, 1800);
})();
