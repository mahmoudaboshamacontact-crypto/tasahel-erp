/* تذكير المهام: سرينة شرطة/إسعاف حقيقية ومستمرة لحد ما الموظف يفتح المهمة */
(function () {
  'use strict';
  if (window.__taskRemind) return; window.__taskRemind = true;
  var KIND = 'task_remind', SK = 'ts_remind_sound', bar, ch = null, pending = [], uid = null;
  var sirenTimer = null, audioCtx = null;

  var isMgr = function () { return window.__role ? window.__role === 'manager' : false; };
  
  // الصوت مفعل افتراضياً إلا لو الموظف قفله بنفسه
  function sound() { try { return localStorage.getItem(SK) !== '0'; } catch (e) { return true; } }
  function setSound(v) { try { localStorage.setItem(SK, v ? '1' : '0'); } catch (e) {} }

  /* ---- تشغيل موجة سرينة شرطة/إسعاف واحدة (مدتها ثانيتين) ---- */
  function playSirenWave() {
    if (!sound() || !pending.length) return;
    try {
      var C = window.AudioContext || window.webkitAudioContext;
      if (!audioCtx || audioCtx.state === 'closed') audioCtx = new C();
      if (audioCtx.state === 'suspended') audioCtx.resume();

      var now = audioCtx.currentTime;
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();

      osc.type = 'sawtooth'; // موجات sawtooth بتدي صوت سرينة الطوارئ الحقيقي
      
      // حركة السرينة: تطلع من 550Hz لـ 1200Hz وتنزل تاني في ثانيتين
      osc.frequency.setValueAtTime(550, now);
      osc.frequency.linearRampToValueAtTime(1200, now + 0.9);
      osc.frequency.linearRampToValueAtTime(550, now + 1.8);

      // مستوى الصوت (0.12 واضح جداً ومش مزعج زيادة عن اللزوم)
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.1);
      gain.gain.setValueAtTime(0.12, now + 1.7);
      gain.gain.linearRampToValueAtTime(0.001, now + 1.85);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(now);
      osc.stop(now + 1.85);
    } catch (e) {}
  }

  /* ---- تكرار السرينة طالما الإشعار مفتوح ---- */
  function startSirenLoop() {
    stopSirenLoop();
    if (!sound() || !pending.length) return;
    playSirenWave();
    sirenTimer = setInterval(function () {
      if (!sound() || !pending.length) {
        stopSirenLoop();
        return;
      }
      playSirenWave();
    }, 2000); // تعيد الموجة كل ثانيتين بدون أي حمل على المتصفح
  }

  function stopSirenLoop() {
    if (sirenTimer) {
      clearInterval(sirenTimer);
      sirenTimer = null;
    }
    try {
      if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.close();
        audioCtx = null;
      }
    } catch (e) {}
  }

  /* ---- استخراج UUID المهمة من الزر أو الكارت ---- */
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
      if (/إعادة فتح/.test(tb.textContent)) return;

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

    var tRes = await sbClient.from('tasks').select('id, title, assignee_id, status').eq('id', taskId).single();
    if (tRes.error || !tRes.data) {
      b.disabled = false;
      return showToast('خطأ في قراءة المهمة: ' + (tRes.error ? tRes.error.message : 'غير موجودة'), 'error');
    }

    var task = tRes.data;
    var mgrName = (typeof currentUser !== 'undefined' && currentUser && (currentUser.full_name || currentUser.name)) ? (currentUser.full_name || currentUser.name) : 'المدير';

    try {
      await sbClient.from('notifications').delete().eq('task_id', task.id).eq('kind', KIND).eq('read', false);
    } catch (e) {}

    var ins = await sbClient.from('notifications').insert({
      user_id: task.assignee_id,
      kind: KIND,
      title: 'تذكير بمهمة',
      body: mgrName + ' بيفكّرك بالمهمة: ' + task.title,
      task_id: task.id
    });

    if (ins.error) {
      b.disabled = false;
      return showToast('خطأ: ' + ins.error.message, 'error');
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
    bar.querySelector('.gs-open').addEventListener('click', function () {
      stopSirenLoop();
      clearAll();
      if (typeof switchTab === 'function') switchTab('tasks');
    });
    bar.querySelector('.gs-snd').addEventListener('click', function () {
      setSound(!sound());
      paintSnd();
      if (sound()) startSirenLoop(); else stopSirenLoop();
    });
    return bar;
  }
  function paintSnd() { if (bar) bar.querySelector('.gs-snd').innerHTML = '<i class="fa-solid ' + (sound() ? 'fa-volume-high' : 'fa-volume-xmark') + '"></i>'; }
  function paint() {
    if (!pending.length) {
      stopSirenLoop();
      if (bar) bar.classList.remove('on');
      return;
    }
    ensureBar(); var f = pending[0];
    bar.querySelector('.gs-tx').innerHTML = '🚨 ' + (typeof escapeHtml === 'function' ? escapeHtml(f.body || f.title) : (f.body || f.title)) + (pending.length > 1 ? '<small>+ ' + (pending.length - 1) + ' تذكير تاني</small>' : '');
    paintSnd(); bar.classList.remove('on'); void bar.offsetWidth; bar.classList.add('on');
  }
  async function clearAll() {
    stopSirenLoop();
    var ids = pending.map(function (n) { return n.id; }); pending = []; paint();
    if (ids.length && uid) { try { await sbClient.from('notifications').update({ read: true }).in('id', ids); } catch (e) {} }
  }
  async function loadPending() {
    var r = await sbClient.from('notifications').select('id,title,body,task_id').eq('user_id', uid).eq('kind', KIND).eq('read', false).order('created_at', { ascending: false }).limit(10);
    if (r.error) return;
    pending = r.data || [];
    paint();
    if (pending.length) startSirenLoop();
  }
  function subscribe() {
    try { if (ch) sbClient.removeChannel(ch); } catch (e) {}
    ch = sbClient.channel('p2-remind-' + uid).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + uid }, function (p) {
      if (!p.new || p.new.kind !== KIND) return;
      pending = pending.filter(function (n) { return n.task_id !== p.new.task_id; });
      pending.unshift(p.new);
      paint();
      startSirenLoop();
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
  if (typeof _lo === 'function') window.handleLogout = async function () { stopSirenLoop(); pending = []; paint(); uid = null; try { if (ch) sbClient.removeChannel(ch); } catch (e) {} ch = null; return _lo.apply(this, arguments); };
  var _li = window.loadInitialData;
  if (typeof _li === 'function') window.loadInitialData = async function () { var x = await _li.apply(this, arguments); try { boot(); } catch (e) { console.warn('remind', e); } return x; };
  var t; function later() { clearTimeout(t); t = setTimeout(addButtons, 150); }
  document.addEventListener('DOMContentLoaded', function () { var tt = document.getElementById('tab-tasks'); if (tt) try { new MutationObserver(later).observe(tt, { childList: true }); } catch (e) {} });
  if (document.readyState !== 'loading') { var tt = document.getElementById('tab-tasks'); if (tt) try { new MutationObserver(later).observe(tt, { childList: true }); } catch (e) {} }
})();
