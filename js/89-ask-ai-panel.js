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

  function removeUI() {
    var b = $('ts-ai-btn'), m = $('ts-ai-modal');
    if (b) b.remove();
    if (m) m.remove();
  }

  function ensureUI() {
    if (!isMgr()) { removeUI(); return; }
    if ($('ts-ai-btn')) return;

    var btn = document.createElement('button');
    btn.id = 'ts-ai-btn';
    btn.type = 'button';
    btn.title = 'اسأل الذكاء الاصطناعي (للمدير)';
    btn.setAttribute('aria-label', 'اسأل الذكاء الاصطناعي');
    btn.style.cssText = 'position:fixed;left:18px;bottom:84px;z-index:95;height:46px;padding:0 16px;border-radius:999px;border:0;cursor:pointer;display:flex;align-items:center;gap:8px;font-weight:700;font-size:13px;color:#fff;background:linear-gradient(135deg,#0f766e,#0369a1);box-shadow:0 10px 24px -6px rgba(3,105,161,.55)';
    btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i><span>اسأل AI</span>';
    btn.onclick = openModal;
    document.body.appendChild(btn);
  }

  function openModal() {
    if (!isMgr()) return;
    var modal = $('ts-ai-modal');
    if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); $('ts-ai-inp').focus(); return; }

    modal = document.createElement('div');
    modal.id = 'ts-ai-modal';
    modal.className = 'fixed inset-0 z-[140] flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm p-0 sm:p-4';
    modal.innerHTML =
      '<div class="w-full sm:max-w-xl rounded-t-3xl sm:rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl flex flex-col max-h-[88vh] overflow-hidden">' +
        '<div class="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">' +
          '<div class="flex items-center gap-2.5">' +
            '<span class="flex h-9 w-9 items-center justify-center rounded-xl text-white" style="background:linear-gradient(135deg,#0f766e,#0369a1)"><i class="fa-solid fa-wand-magic-sparkles"></i></span>' +
            '<div><div class="font-bold text-sm text-slate-900 dark:text-white">مساعد تحليل الأرقام (AI)</div><div class="text-[11px] text-slate-500">للمدير فقط — أرقام مجمّعة بدون بيانات عملاء</div></div>' +
          '</div>' +
          '<div class="flex items-center gap-1">' +
            '<button type="button" id="ts-ai-clear" title="محادثة جديدة" class="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><i class="fa-solid fa-rotate-right"></i></button>' +
            '<button type="button" id="ts-ai-close" aria-label="إغلاق" class="rounded-lg px-2.5 py-1.5 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><i class="fa-solid fa-xmark"></i></button>' +
          '</div>' +
        '</div>' +
        '<div id="ts-ai-chips" class="flex flex-wrap gap-1.5 px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">' +
          '<button type="button" class="ts-ai-chip rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:border-teal-500">ملخص مبيعات الشهر ده</button>' +
          '<button type="button" class="ts-ai-chip rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:border-teal-500">أكتر 5 خدمات طلبًا</button>' +
          '<button type="button" class="ts-ai-chip rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:border-teal-500">إيه البنود المتأخرة حاليًا؟</button>' +
          '<button type="button" class="ts-ai-chip rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:border-teal-500">مقارنة الشهر ده بالشهر اللي فات</button>' +
        '</div>' +
        '<div id="ts-ai-msgs" class="flex-1 overflow-y-auto p-4 space-y-3 text-sm">' +
          '<div class="rounded-2xl bg-slate-100 dark:bg-slate-800 px-4 py-3 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">أهلاً يا مدير! اسألني عن المبيعات، الأرباح التقديرية، العمولات، أو الطلبات المتأخرة حسب الخدمة أو الشهر.</div>' +
        '</div>' +
        '<form id="ts-ai-form" class="p-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">' +
          '<input id="ts-ai-inp" type="text" maxlength="500" placeholder="اكتب سؤالك هنا..." class="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-teal-600">' +
          '<button id="ts-ai-send" type="submit" class="rounded-xl px-4 py-2.5 text-sm font-bold text-white shrink-0" style="background:linear-gradient(135deg,#0f766e,#0369a1)">إرسال</button>' +
        '</form>' +
      '</div>';

    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
    $('ts-ai-close').onclick = closeModal;
    $('ts-ai-clear').onclick = function () {
      history = [];
      $('ts-ai-msgs').innerHTML = '<div class="rounded-2xl bg-slate-100 dark:bg-slate-800 px-4 py-3 text-xs text-slate-600 dark:text-slate-300">تم بدء محادثة جديدة.</div>';
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
    if (m) { m.classList.add('hidden'); m.classList.remove('flex'); }
  }

  function appendMsg(role, text, isErr) {
    var box = $('ts-ai-msgs');
    if (!box) return null;
    var wrap = document.createElement('div');
    wrap.className = role === 'user' ? 'flex justify-end' : 'flex justify-start';
    var bubble = document.createElement('div');
    bubble.className = role === 'user'
      ? 'max-w-[85%] rounded-2xl rounded-ee-sm px-3.5 py-2.5 text-xs sm:text-sm text-white whitespace-pre-wrap'
      : ('max-w-[90%] rounded-2xl rounded-es-sm px-3.5 py-2.5 text-xs sm:text-sm whitespace-pre-wrap leading-relaxed ' + (isErr ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-200 border border-rose-200 dark:border-rose-800' : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100'));
    if (role === 'user') bubble.style.background = 'linear-gradient(135deg,#0f766e,#0369a1)';
    bubble.innerHTML = esc(text);
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
