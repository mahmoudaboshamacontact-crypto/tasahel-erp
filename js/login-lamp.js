/* login-lamp.js — شاشة الدخول بالأباجورة: بتشد السلسلة فالنور ينوّر والفورم تظهر. زينة فقط:
   الفورم و handleLogin ما بيتلمسوش. لو أي حاجة فشلت مبنضيفش .lamp-ready والفورم بتفضل ظاهرة.
   للإلغاء: شيل السطر من index.html */
(function () {
  try {
    var login = document.getElementById('login');
    if (!login || login.__lamp) return; login.__lamp = true;
    var stage = document.createElement('aside'); stage.className = 'lamp-stage'; stage.setAttribute('aria-hidden', 'true');
    stage.innerHTML =
      '<svg viewBox="0 0 200 520" xmlns="http://www.w3.org/2000/svg"><defs>' +
      '<linearGradient id="lampGlow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd9a8"/><stop offset="1" stop-color="#ff9d6c"/></linearGradient>' +
      '<linearGradient id="lampPole" x1="0" x2="1"><stop offset="0" stop-color="#15120f"/><stop offset=".5" stop-color="#3b3027"/><stop offset="1" stop-color="#15120f"/></linearGradient></defs>' +
      '<path class="lamp-shade" d="M62 38 L138 38 L172 150 L28 150 Z"/>' +
      '<ellipse class="lamp-bulb" cx="100" cy="150" rx="56" ry="9"/>' +
      '<rect x="97" y="150" width="6" height="22" fill="#2a2119"/>' +
      '<rect x="95" y="172" width="10" height="296" fill="url(#lampPole)"/>' +
      '<rect x="91" y="300" width="18" height="8" rx="2" fill="#5a4630"/>' +
      '<ellipse cx="100" cy="472" rx="58" ry="13" fill="#1d1a18"/><ellipse cx="100" cy="468" rx="46" ry="9" fill="#2a2420"/></svg>' +
      '<div class="lamp-halo"></div><div class="lamp-cone"></div>';
    var chain = document.createElement('button');
    chain.type = 'button'; chain.className = 'lamp-chain'; chain.tabIndex = -1;
    chain.setAttribute('aria-label', 'شد السلسلة لإضاءة صفحة الدخول'); chain.innerHTML = '<span class="lamp-bead"></span>';
    var hint = document.createElement('span'); hint.className = 'lamp-hint'; hint.textContent = 'اسحب السلسلة';
    stage.appendChild(chain); stage.appendChild(hint);
    login.insertBefore(stage, login.firstChild);

    function on() { if (login.classList.contains('lamp-on')) return; login.classList.add('lamp-on');
      setTimeout(function () { var e = document.getElementById('login-email'); if (e && !e.value && login.offsetParent) { try { e.focus({ preventScroll: true }); } catch (x) {} } }, 900); }
    function off() { login.classList.remove('lamp-on'); }
    function toggle() { login.classList.contains('lamp-on') ? off() : on(); }

    login.classList.add('lamp-ready');
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) login.classList.add('lamp-on');

    var startY = null, pull = 0, moved = false;
    function setPull(v) { pull = Math.max(0, Math.min(80, v)); chain.style.setProperty('--pull', pull + 'px'); }
    function release(trig) { chain.classList.add('snap'); setPull(0); setTimeout(function () { chain.classList.remove('snap'); }, 400); if (trig) toggle(); }
    chain.addEventListener('pointerdown', function (e) { startY = e.clientY; moved = false; try { chain.setPointerCapture(e.pointerId); } catch (x) {} chain.classList.remove('snap'); });
    chain.addEventListener('pointermove', function (e) { if (startY == null) return; var d = e.clientY - startY; if (Math.abs(d) > 4) moved = true; setPull(d); });
    function up() { if (startY == null) return; var trig = !moved || pull > 30; startY = null; release(trig); }
    chain.addEventListener('pointerup', up); chain.addEventListener('pointercancel', up);

    /* مفيش حد يتعلق: كتابة/تركيز/ملء تلقائي/أي مفتاح بينوّر */
    login.addEventListener('focusin', function (e) { if (e.target && e.target.matches && e.target.matches('input')) on(); });
    login.addEventListener('input', on);
    document.addEventListener('keydown', function (e) { if (login.offsetParent && !e.ctrlKey && !e.metaKey && !e.altKey) on(); });
    var tries = 0, t = setInterval(function () {
      var em = document.getElementById('login-email'), pw = document.getElementById('login-password');
      if ((em && em.value) || (pw && pw.value)) { on(); clearInterval(t); } else if (++tries > 20) clearInterval(t);
    }, 400);
  } catch (err) { var l = document.getElementById('login'); if (l) l.classList.remove('lamp-ready'); if (window.console) console.warn('login-lamp', err); }
})();
