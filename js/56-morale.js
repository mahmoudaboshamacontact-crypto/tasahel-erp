/* الجزء ح: الروح المعنوية (المرحلة 11 الأساس) — js/56-morale.js
   تحية اليوم + رسالة اليوم، هدف جماعي (أرقام مجمّعة)، احتفال لحظي مرة واحدة، حيطة شكر.
   المدير بيعدّل الإعدادات من نفس الشاشة. SQL: sql/part-h-morale.sql
   بدون أنيميشن دايم، وبدون تحديث تلقائي، وبدون ترتيب أو مقارنة بين الموظفين. */
(function () {
  'use strict';
  if (window.__phase56) return; window.__phase56 = true;

  var $ = function (id) { return document.getElementById(id); };
  var eh = function (s) { return typeof escapeHtml === 'function' ? escapeHtml(s) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };
  var BTN_ON = 'tab-btn bg-ink text-white dark:bg-brand-600 shadow-sm';
  var BTN_OFF = 'tab-btn text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800';
  var st = null, colleagues = [], thanks = [], busy = false, greeted = false;

  function toast(m, t) { if (typeof showToast === 'function') showToast(m, t || 'info'); }
  function wrap(name, make) { var o = window[name]; if (typeof o !== 'function') return; window[name] = make(o); }
  function isPartner() { return window.__role === 'partner' || (document.body && document.body.classList.contains('is-partner-mode')); }
  function isMgr() { return window.__role === 'manager'; }
  function ready() { return !!(window.sbClient || (typeof sbClient !== 'undefined' && sbClient)); }
  function db() { return typeof sbClient !== 'undefined' ? sbClient : window.sbClient; }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* */ } }
  function myName() { try { return (myProfile && myProfile.full_name) || ''; } catch (e) { return ''; } }
  function firstName() { return String(myName()).trim().split(/\s+/)[0] || ''; }
  function cairoHour() {
    try { return Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Africa/Cairo' }).format(new Date())) % 24; }
    catch (e) { return new Date().getHours(); }
  }
  function fmtWhen(s) { try { return new Date(s).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' }); } catch (e) { return ''; } }

  /* ---------- تواريخ مميزة: سطر لكل تاريخ  MM-DD | العنوان | الرسالة ---------- */
  function parseSpecial(text) {
    var out = [];
    String(text || '').split('\n').forEach(function (ln) {
      var p = ln.split('|').map(function (x) { return x.trim(); });
      if (!/^(\d{4}-)?\d{2}-\d{2}$/.test(p[0] || '') || !p[1]) return;
      if (out.length < 40) out.push({ d: p[0], t: p[1].slice(0, 60), m: (p[2] || '').slice(0, 140) });
    });
    return out;
  }
  function specialToText(arr) {
    return (Array.isArray(arr) ? arr : []).map(function (x) { return [x.d, x.t, x.m || ''].join(' | '); }).join('\n');
  }
  function todaySpecial(s) {
    if (!s || !Array.isArray(s.special_dates) || !s.today) return null;
    var md = s.today.slice(5);
    for (var i = 0; i < s.special_dates.length; i++) {
      var d = s.special_dates[i].d || '';
      if (d === s.today || d === md) return s.special_dates[i];
    }
    return null;
  }
  function goalReached(s) { return !!(s && s.goal_target > 0 && s.goal_done >= s.goal_target); }

  async function fetchState() {
    var r = await db().rpc('morale_state');
    if (r.error) throw r.error;
    st = r.data || { enabled: false };
    return st;
  }

  /* ---------- تحية اليوم (مرة في اليوم) + احتفال لحظي ---------- */
  async function greetOnce() {
    if (greeted || isPartner() || !ready()) return;
    greeted = true;
    try {
      var s = await fetchState();
      if (!s.enabled) return;
      var key = 'p56_greet_' + s.today;
      if (!lsGet(key)) {
        lsSet(key, '1');
        var parts = [(cairoHour() < 12 ? 'صباح الخير' : 'مساء الخير') + (firstName() ? ' يا ' + firstName() : '') + ' ☀️'];
        var sp = todaySpecial(s);
        if (sp) parts.push(sp.t + (sp.m ? ': ' + sp.m : ''));
        else if (s.daily_message) parts.push(s.daily_message);
        toast(parts.join(' — '), 'info');
      }
      if (goalReached(s)) {
        var ck = 'p56_cele_' + s.goal_period + '_' + s.period_key;
        if (!lsGet(ck)) { lsSet(ck, '1'); celebrate(s.goal_period === 'month' ? 'الفريق حقق هدف الشهر! 🎉' : 'الفريق حقق هدف النهارده! 🎉'); }
      }
    } catch (e) { /* الميزة اختيارية: لو SQL مش متشغّل نتجاهل بصمت */ }
  }
  function celebrate(text) {
    if ($('p56-cele')) return;
    var d = document.createElement('div'); d.id = 'p56-cele';
    d.innerHTML = '<div class="p56-pop"><span>🎉</span>' + eh(text) + '</div>';
    document.body.appendChild(d);
    setTimeout(function () { var x = $('p56-cele'); if (x) x.remove(); }, 3000);
  }

  /* ---------- الشاشة ---------- */
  function goalHtml() {
    if (!st || !st.enabled) return '<div class="p56-sub">الميزة متوقفة من المدير حالياً.</div>';
    if (!(st.goal_target > 0)) return '<div class="p56-sub">لسه مفيش هدف جماعي محدد.</div>';
    var pct = Math.min(100, Math.round((st.goal_done / st.goal_target) * 100));
    return '<div class="p56-sub">بنود اتسلّمت ' + (st.goal_period === 'month' ? 'الشهر ده' : 'النهارده') + ': <b>' + eh(st.goal_done) + '</b> من <b>' + eh(st.goal_target) + '</b></div>' +
      '<div class="p56-bar"><i style="width:' + pct + '%"></i></div>' +
      '<div class="p56-sub">' + (pct >= 100 ? 'الفريق حقق الهدف 🎉 شكراً لكل واحد فيكم.' : 'فاضل ' + eh(st.goal_target - st.goal_done) + ' بند ونوصل (' + pct + '%).') + '</div>';
  }
  function thanksListHtml() {
    if (!thanks.length) return '<div class="p56-sub" style="padding:10px 0">لسه مفيش شكر. كن أول واحد 💛</div>';
    return thanks.map(function (t) {
      return '<div class="p56-thx"><b>' + eh(t.from_name) + '</b> شكر <b>' + eh(t.to_name) + '</b>: ' + eh(t.message) +
        ' <small>' + eh(fmtWhen(t.created_at)) + '</small>' +
        (isMgr() ? ' <button type="button" class="p56-btn sec" style="padding:2px 8px" data-del="' + eh(t.id) + '">مسح</button>' : '') + '</div>';
    }).join('');
  }
  function render() {
    var pane = $('tab-morale'); if (!pane) return;
    var sp = st && st.enabled ? todaySpecial(st) : null;
    var msg = sp ? (sp.t + (sp.m ? ': ' + sp.m : '')) : (st && st.daily_message) || '';
    var opts = colleagues.map(function (c) { return '<option value="' + eh(c.id) + '">' + eh(c.full_name) + '</option>'; }).join('');
    var mgr = '';
    if (isMgr() && st) {
      mgr = '<div class="p56-card"><div class="p56-h"><i class="fa-solid fa-sliders" style="color:#e97415"></i>إعدادات الروح المعنوية (للمدير)</div>' +
        '<div class="p56-row" style="margin-bottom:8px"><label class="p56-sub"><input type="checkbox" id="p56-en" ' + (st.enabled === false ? '' : 'checked') + '> مفعّلة</label></div>' +
        '<div class="p56-sub">رسالة اليوم (200 حرف)</div><input id="p56-msg" class="p56-in" style="width:100%;margin-bottom:8px" maxlength="200" value="' + eh(st.daily_message || '') + '">' +
        '<div class="p56-row" style="margin-bottom:8px"><span class="p56-sub">الهدف الجماعي: بنود متسلّمة</span>' +
        '<input id="p56-tg" type="number" min="0" max="100000" class="p56-in" style="width:90px" value="' + eh(st.goal_target || 0) + '">' +
        '<select id="p56-pr" class="p56-in"><option value="day"' + (st.goal_period === 'day' ? ' selected' : '') + '>في اليوم</option><option value="month"' + (st.goal_period === 'month' ? ' selected' : '') + '>في الشهر</option></select></div>' +
        '<div class="p56-sub">تواريخ مميزة: سطر لكل تاريخ بالشكل <span dir="ltr">MM-DD | العنوان | الرسالة</span> (مثال: <span dir="ltr">09-01 | بداية الشهر | شهر موفق للكل</span>)</div>' +
        '<textarea id="p56-sd" class="p56-in" dir="auto"></textarea>' +
        '<div class="p56-row" style="margin-top:8px"><button type="button" class="p56-btn" id="p56-save">حفظ الإعدادات</button></div></div>';
    }
    pane.innerHTML = '<div class="space-y-4">' +
      '<div class="p56-card p56-hero"><div class="p56-h">' + (cairoHour() < 12 ? 'صباح الخير' : 'مساء الخير') + (firstName() ? ' يا ' + eh(firstName()) : '') + ' ☀️</div>' +
      (msg ? '<div class="p56-sub" style="font-size:13px">' + eh(msg) + '</div>' : '<div class="p56-sub">يوم موفق ليك ولفريقنا.</div>') + '</div>' +
      '<div class="p56-card"><div class="p56-h"><i class="fa-solid fa-bullseye" style="color:#e97415"></i>هدف الفريق</div>' + goalHtml() + '</div>' +
      '<div class="p56-card"><div class="p56-h"><i class="fa-solid fa-heart" style="color:#e11d48"></i>حيطة الشكر</div>' +
      '<div class="p56-row"><select id="p56-to" class="p56-in"><option value="">اختار زميل</option>' + opts + '</select>' +
      '<input id="p56-tm" class="p56-in" style="flex:1;min-width:160px" maxlength="200" placeholder="اكتب كلمة شكر (حد أقصى 200 حرف)">' +
      '<button type="button" class="p56-btn" id="p56-send">شكراً 💛</button></div>' +
      '<div class="p56-sub" style="margin-top:4px">حد أقصى 5 شكر في اليوم.</div>' +
      '<div style="margin-top:8px" id="p56-list">' + thanksListHtml() + '</div></div>' + mgr + '</div>';
    var sd = $('p56-sd'); if (sd && st) sd.value = specialToText(st.special_dates);
  }

  async function load() {
    if (!ready() || isPartner()) return;
    try {
      var res = await Promise.all([
        fetchState(),
        db().rpc('morale_colleagues'),
        db().from('team_thanks').select('id,from_name,to_name,message,created_at').order('created_at', { ascending: false }).limit(30)
      ]);
      colleagues = (res[1].data) || [];
      thanks = (res[2].data) || [];
    } catch (e) {
      st = { enabled: false };
      toast('لازم تشغّل ملف sql/part-h-morale.sql مرة واحدة في Supabase', 'error');
    }
    render();
  }

  async function onClick(e) {
    var t = e.target; if (!t || !t.closest || busy) return;
    var send = t.closest('#p56-send'), save = t.closest('#p56-save'), del = t.closest('[data-del]');
    if (!send && !save && !del) return;
    busy = true;
    try {
      if (send) {
        var to = $('p56-to').value, m = ($('p56-tm').value || '').trim();
        if (!to) return toast('اختار زميل الأول', 'error');
        if (!m) return toast('اكتب كلمة الشكر', 'error');
        var r = await db().rpc('send_thanks', { p_to: to, p_message: m });
        if (r.error) return toast(r.error.code === '54000' ? 'وصلت للحد الأقصى (5 شكر في اليوم)' : ('تعذّر الإرسال: ' + (r.error.message || '')), 'error');
        toast('اتبعت الشكر 💛'); await load();
      } else if (save) {
        if (!isMgr()) return;
        var tg = Math.max(0, Math.min(100000, parseInt($('p56-tg').value, 10) || 0));
        var u = await db().from('morale_settings').update({
          enabled: $('p56-en').checked,
          daily_message: ($('p56-msg').value || '').trim().slice(0, 200) || null,
          team_goal_target: tg,
          goal_period: $('p56-pr').value === 'month' ? 'month' : 'day',
          special_dates: parseSpecial($('p56-sd').value),
          updated_at: new Date().toISOString()
        }).eq('id', 1);
        if (u.error) return toast('تعذّر الحفظ: ' + (u.error.message || ''), 'error');
        toast('اتحفظت الإعدادات'); await load();
      } else if (del) {
        if (!isMgr() || !confirm('مسح رسالة الشكر دي؟')) return;
        var d = await db().from('team_thanks').delete().eq('id', Number(del.getAttribute('data-del')));
        if (d.error) return toast('تعذّر المسح: ' + (d.error.message || ''), 'error');
        await load();
      }
    } finally { busy = false; }
  }

  /* ---------- التاب والزرار (نفس نمط js/50) ---------- */
  function placeBtn(btn) {
    var menu = $('nav-menu'); if (!menu) return;
    var body = menu.querySelector(':scope > section[data-mg="follow"] .mg-body');
    if (body) { if (btn.parentElement !== body) body.appendChild(btn); return; }
    var foot = menu.querySelector(':scope > .r-logout-menu');
    if (foot) menu.insertBefore(btn, foot); else menu.appendChild(btn);
  }
  function remove() { var b = $('tab-morale-btn'), p = $('tab-morale'); if (b) b.remove(); if (p) p.remove(); }
  function ensure() {
    if (isPartner()) { remove(); return false; }
    if (!$('tab-morale')) {
      var main = document.querySelector('main'); if (!main) return false;
      var pane = document.createElement('div'); pane.id = 'tab-morale'; pane.className = 'hidden space-y-4';
      var host = $('tab-trash') || $('tab-status') || $('tab-notes') || main.lastElementChild;
      if (host) host.insertAdjacentElement('afterend', pane); else main.appendChild(pane);
      pane.addEventListener('click', onClick);
    }
    if (!$('tab-morale-btn') && $('nav-menu')) {
      var b = document.createElement('button'); b.id = 'tab-morale-btn'; b.type = 'button';
      b.setAttribute('data-tab-target', 'morale'); b.className = BTN_OFF; b.setAttribute('onclick', "switchTab('morale')");
      b.innerHTML = '<i class="fa-solid fa-heart text-rose-500"></i><span>فريقنا والشكر</span>';
      placeBtn(b);
    }
    return true;
  }

  wrap('switchTab', function (orig) {
    return function (id) {
      var res = orig.apply(this, arguments);
      try {
        ensure();
        var on = id === 'morale' && !isPartner(), pane = $('tab-morale'), btn = $('tab-morale-btn');
        if (pane) pane.classList.toggle('hidden', !on);
        if (btn) btn.className = on ? BTN_ON : BTN_OFF;
        if (on) { var sec = btn && btn.closest('.mg'); if (sec && !sec.classList.contains('open')) sec.classList.add('open'); load(); }
      } catch (e) { /* */ }
      return res;
    };
  });
  wrap('loadInitialData', function (orig) {
    return async function () {
      var r = await orig.apply(this, arguments);
      try { ensure(); greetOnce(); } catch (e) { /* */ }
      return r;
    };
  });
  wrap('handleLogout', function (orig) {
    return function () { try { st = null; colleagues = []; thanks = []; greeted = false; remove(); } catch (e) { /* */ } return orig.apply(this, arguments); };
  });
})();
