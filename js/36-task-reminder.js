/* تذكير المهام: زر "تذكير" للمدير → إشعار للموظف + سيرينة ثابتة لحد ما يفتح المهمة.
   بدون polling: بيستخدم جدول notifications + Realtime الموجودين. محتاج sql/phase2-task-reminder.sql مرة واحدة. */
(function () {
  'use strict';
  if (window.__taskRemind) return; window.__taskRemind = true;
  var KIND = 'task_remind', SK = 'ts_remind_sound', bar, ch = null, pending = [], uid = null;
  var isMgr = function () { return window.__role ? window.__role === 'manager' : false; };
  function sound() { try { return localStorage.getItem(SK) === '1'; } catch (e) { return false; } }
  function setSound(v) { try { localStorage.setItem(SK, v ? '1' : '0'); } catch (e) {} }
  function beep() {
    if (!sound()) return;
    try { var C = window.AudioContext || window.webkitAudioContext, c = new C(); if (c.state === 'suspended') c.resume();
      [0, .28].forEach(function (d) { var o = c.createOscillator(), g = c.createGain(); o.type = 'square'; o.frequency.value = 880; g.gain.value = .06; o.connect(g); g.connect(c.destination); o.start(c.currentTime + d); o.stop(c.currentTime + d + .18); });
      setTimeout(function () { c.close(); }, 900); } catch (e) {}
  }

  /* ---- المدير: زر تذكير على كروت المهام المفتوحة ---- */
  function addButtons() {
    if (!isMgr()) return;
    document.querySelectorAll('#tab-tasks button[onclick^="tkToggle"]').forEach(function (tb) {
      var card = tb.closest('.rounded-2xl'); if (!card || card.querySelector('.gl-remind-btn')) return;
      if (/إعادة فتح/.test(tb.textContent)) return;       // المهمة المنتهية
      var b = document.createElement('button'); b.type = 'button'; b.className = 'gl-remind-btn'; b.dataset.id = tb.dataset.id;
      b.innerHTML = '<i class="fa-solid fa-bell"></i> تذكير';
      b.addEventListener('click', function () { remind(b); });
      tb.insertAdjacentElement('beforebegin', b);
    });
  }
  async function remind(b) {
    b.disabled = true;
    var r = await sbClient.rpc('remind_task', { p_task: b.dataset.id });
    if (r.error) {
      b.disabled = false;
      var m = (r.error.message || '') + ' ' + (r.error.code || ''), miss = /42883|PGRST202|schema cache|could not find the function/i.test(m);
      console.warn('remind_task', r.error);
      return showToast(miss ? 'الدالة مش ظاهرة لسه: شغّل في Supabase السطر: notify pgrst, \'reload schema\';  أو الملف phase2-task-reminder.sql' : 'تعذّر إرسال التذكير: ' + (r.error.message || r.error.code || 'خطأ غير معروف'), 'error');
    }
    b.innerHTML = '<i class="fa-solid fa-check"></i> اتبعت'; showToast('اتبعت التذكير للموظف');
    setTimeout(function () { b.disabled = false; b.innerHTML = '<i class="fa-solid fa-bell"></i> تذكير'; }, 8000);
  }

  /* ---- الموظف: السيرينة ---- */
  function ensureBar() {
    if (bar) return bar; bar = document.createElement('div'); bar.id = 'gl-siren'; bar.setAttribute('role', 'alert');
    bar.innerHTML = '<span class="gs-ic"><i class="fa-solid fa-bell"></i></span><div class="gs-tx"></div><button type="button" class="gs-snd" title="الصوت"></button><button type="button" class="gs-open">افتح المهمة</button>';
    document.body.appendChild(bar);
    bar.querySelector('.gs-open').addEventListener('click', function () { clearAll(); if (typeof switchTab === 'function') switchTab('tasks'); });
    bar.querySelector('.gs-snd').addEventListener('click', function () { setSound(!sound()); paintSnd(); if (sound()) beep(); });
    return bar;
  }
  function paintSnd() { if (bar) bar.querySelector('.gs-snd').innerHTML = '<i class="fa-solid ' + (sound() ? 'fa-volume-high' : 'fa-volume-xmark') + '"></i>'; }
  function paint() {
    if (!pending.length) { if (bar) bar.classList.remove('on'); return; }
    ensureBar(); var f = pending[0];
    bar.querySelector('.gs-tx').innerHTML = '🚨 ' + (typeof escapeHtml === 'function' ? escapeHtml(f.body || f.title) : (f.body || f.title)) + (pending.length > 1 ? '<small>+ ' + (pending.length - 1) + ' تذكير تاني</small>' : '');
    paintSnd(); bar.classList.remove('on'); void bar.offsetWidth; bar.classList.add('on');
  }
  async function clearAll() {
    var ids = pending.map(function (n) { return n.id; }); pending = []; paint();
    if (ids.length && uid) { try { await sbClient.from('notifications').update({ read: true }).in('id', ids); } catch (e) {} }
  }
  async function loadPending() {
    var r = await sbClient.from('notifications').select('id,title,body,task_id').eq('user_id', uid).eq('kind', KIND).eq('read', false).order('created_at', { ascending: false }).limit(10);
    if (r.error) return; pending = r.data || []; paint();
  }
  function subscribe() {
    try { if (ch) sbClient.removeChannel(ch); } catch (e) {}
    ch = sbClient.channel('p2-remind-' + uid).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + uid }, function (p) {
      if (!p.new || p.new.kind !== KIND) return;
      pending = pending.filter(function (n) { return n.task_id !== p.new.task_id; }); pending.unshift(p.new); paint(); beep();
    }).subscribe();
  }
  function boot() {
    if (typeof sbClient === 'undefined' || !sbClient || typeof currentUser === 'undefined' || !currentUser || uid === currentUser.id) return false;
    uid = currentUser.id; loadPending(); subscribe(); return true;
  }
  var _sw = window.switchTab;
  if (typeof _sw === 'function') window.switchTab = function (id) {
    var r = _sw.apply(this, arguments);
    if (id === 'tasks') { if (pending.length) clearAll(); setTimeout(addButtons, 80); }
    return r;
  };
  var _lo = window.handleLogout;
  if (typeof _lo === 'function') window.handleLogout = async function () { pending = []; paint(); uid = null; try { if (ch) sbClient.removeChannel(ch); } catch (e) {} ch = null; return _lo.apply(this, arguments); };
  var _li = window.loadInitialData;
  if (typeof _li === 'function') window.loadInitialData = async function () { var x = await _li.apply(this, arguments); try { boot(); } catch (e) { console.warn('remind', e); } return x; };
  var t; function later() { clearTimeout(t); t = setTimeout(addButtons, 150); }
  document.addEventListener('DOMContentLoaded', function () { var tt = document.getElementById('tab-tasks'); if (tt) try { new MutationObserver(later).observe(tt, { childList: true }); } catch (e) {} });
  if (document.readyState !== 'loading') { var tt = document.getElementById('tab-tasks'); if (tt) try { new MutationObserver(later).observe(tt, { childList: true }); } catch (e) {} }
})();
