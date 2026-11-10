/* login-lamp.js — شاشة الدخول بالسلك والنور. زينة فقط: الفورم و handleLogin ما بيتلمسوش.
   لو أي حاجة فشلت، مبنضيفش .lamp-ready والفورم بتفضل ظاهرة عادي. للإلغاء: شيل السطر من index.html */
(function () {
  try {
    var login = document.getElementById('login');
    if (!login || login.__lamp) return; login.__lamp = true;
    var cord = document.createElement('button');
    cord.type = 'button'; cord.className = 'lamp-cord'; cord.setAttribute('aria-label', 'شد السلك لإضاءة صفحة الدخول');
    cord.tabIndex = -1; cord.innerHTML = '<span class="lamp-knob"></span>';
    var beam = document.createElement('aside'); beam.className = 'lamp-beam'; beam.setAttribute('aria-hidden', 'true');
    var hint = document.createElement('span'); hint.className = 'lamp-hint'; hint.textContent = 'اسحب السلك لتنوّر';
    login.insertBefore(beam, login.firstChild); login.appendChild(cord); login.appendChild(hint);

    function on() {
      if (login.classList.contains('lamp-on')) return;
      login.classList.add('lamp-on');
      setTimeout(function () { var e = document.getElementById('login-email'); if (e && !e.value && login.offsetParent) { try { e.focus({ preventScroll: true }); } catch (x) {} } }, 750);
    }
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    login.classList.add('lamp-ready');
    if (reduce) { login.classList.add('lamp-on'); return; }

    var startY = null, pull = 0, moved = false;
    function setPull(v) { pull = Math.max(0, Math.min(90, v)); cord.style.setProperty('--pull', pull + 'px'); }
    function release(trigger) {
      cord.classList.add('snap'); setPull(0);
      setTimeout(function () { cord.classList.remove('snap'); }, 400);
      if (trigger) on();
    }
    cord.addEventListener('pointerdown', function (e) { startY = e.clientY; moved = false; try { cord.setPointerCapture(e.pointerId); } catch (x) {} cord.classList.remove('snap'); });
    cord.addEventListener('pointermove', function (e) { if (startY == null) return; var d = e.clientY - startY; if (Math.abs(d) > 4) moved = true; setPull(d); });
    function up() { if (startY == null) return; var trig = !moved || pull > 40; startY = null; release(trig); }
    cord.addEventListener('pointerup', up); cord.addEventListener('pointercancel', up);

    /* مفيش حد يتعلق: أي كتابة/تركيز/ملء تلقائي أو أي مفتاح بينوّر */
    login.addEventListener('focusin', function (e) { if (e.target && e.target.matches && e.target.matches('input')) on(); });
    login.addEventListener('input', on);
    document.addEventListener('keydown', function (e) { if (login.offsetParent && !e.ctrlKey && !e.metaKey && !e.altKey) on(); });
    /* الملء التلقائي من المتصفح: لو الحقل اتملى ننوّر */
    var tries = 0, t = setInterval(function () {
      var em = document.getElementById('login-email'), pw = document.getElementById('login-password');
      if ((em && em.value) || (pw && pw.value)) { on(); clearInterval(t); } else if (++tries > 20) clearInterval(t);
    }, 400);
  } catch (err) { var l = document.getElementById('login'); if (l) l.classList.remove('lamp-ready'); if (window.console) console.warn('login-lamp', err); }
})();
