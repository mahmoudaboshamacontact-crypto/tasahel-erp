/* تذكير المهام: يعمل مباشرة بدون الحاجة لتعقيدات RPC */
(function () {
  'use strict';
  if (window.__taskRemind) return; window.__taskRemind = true;
  var KIND = 'task_remind', SK = 'ts_remind_sound', bar, ch = null, pending = [], uid = null;
  var isMgr = function () { return window.__role ? window.__role === 'manager' : false; };
  // خلي الصوت شغال افتراضياً إلا لو الموظف قفله بنفسه ('0')
function sound() { try { return localStorage.getItem(SK) !== '0'; } catch (e) { return true; } }
  function setSound(v) { try { localStorage.setItem(SK, v ? '1' : '0'); } catch (e) {} }
  function beep() {
    if (!sound()) return;
    try { var C = window.AudioContext || window.webkitAudioContext, c = new C(); if (c.state === 'suspended') c.resume();
      [0, .28].forEach(function (d) { var o = c.createOscillator(), g = c.createGain(); o.type = 'square'; o.frequency.value = 880; g.gain.value = .06; o.connect(g); g.connect(c.destination); o.start(c.currentTime + d); o.stop(c.currentTime + d + .18); });
      setTimeout(function () { c.close(); }, 900); } catch (e) {}
  }

  /* ---- استخراج UUID المهمة من الزر أو الكارت بأي طريقة مكتوب بها ---- */
  function extractTaskId(tb, card) {
    if (tb.dataset && tb.dataset.id) return tb.dataset.id;
    var html = (tb.outerHTML || '') + ' ' + (card ? card.innerHTML : '');
    var m = html.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    return m ? m[0] : null;
  }

  /* ---- المدير: زر تذكير على كروت المهام المفتوحة ---- */
  function addButtons() {
    if (!isMgr()) return;
    document.querySelectorAll('#tab-tasks button[onclick^="tkToggle"]').forEach(function (tb) {
      var card = tb.closest('.rounded-2xl'); if (!card || card.querySelector('.gl-remind-btn')) return;
      if (/إعادة فتح/.test(tb.textContent)) return; // المهمة المنتهية

      var taskId = extractTaskId(tb, card);
      if (!taskId) return;

      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'gl-remind-btn';
      b.dataset.id = taskId;
      b.innerHTML = '<i class="fa-solid fa-bell"></i> تذكير';
      b.addEventListener('click', function () { remind(b); });
      tb.insertAdjacentElement('beforebegin', b);
    });
  }

  async function remind(b) {
    var taskId = b.dataset.id;
    if (!taskId) return showToast('لم يتم العثور على ID المهمة', 'error');

    b.disabled = true;

    // 1. جلب بيانات المهمة مباشرة من جدول tasks (الذي تأكدنا من وجوده في الصور)
    var tRes = await sbClient.from('tasks').select('id, title, assignee_id, status').eq('id', taskId).single();
    if (tRes.error || !tRes.data) {
      b.disabled = false;
      console.error('Task Fetch Error:', tRes.error);
      return showToast('خطأ في قراءة المهمة: ' + (tRes.error ? tRes.error.message : 'غير موجودة'), 'error');
    }

    var task = tRes.data;
    var mgrName = (typeof currentUser !== 'undefined' && currentUser && (currentUser.full_name || currentUser.name)) ? (currentUser.full_name || currentUser.name) : 'المدير';

    // 2. مسح التذكير القديم غير المقروء لنفس المهمة (إن وجد)
    try {
      await sbClient.from('notifications').delete().eq('task_id', task.id).eq('kind', KIND).eq('read', false);
    } catch (e) {}

    // 3. إرسال الإشعار مباشرة لجدول notifications
    var ins = await sbClient.from('notifications').insert({
      user_id: task.assignee_id,
      kind: KIND,
      title: 'تذكير بمهمة',
      body: mgrName + ' بيفكّرك بالمهمة: ' + task.title,
      task_id: task.id
    });

    if (ins.error) {
      b.disabled = false;
      console.error('Notification Insert Error:', ins.error);
      return showToast('السبب الحقيقي للخطأ: ' + ins.error.message, 'error');
    }

    b.innerHTML = '<i class="fa-solid fa-check"></i> اتبعت';
    showToast('اتبعت التذكير للموظف بنجاح');
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
