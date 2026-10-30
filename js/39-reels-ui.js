/* Reels UI — حبة التنقل المنزلقة + عدّاد الأرقام + حركة دخول الرئيسية. معزول: شيل class "reels" من body لإيقافه. */
(function () {
  if (window.__reelsUI) return; window.__reelsUI = true;
  document.body.classList.add('reels');
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* 1) الحبة المنزلقة تحت الزر النشط */
  var pill;
  function place() {
    var nav = document.getElementById('hdr-shortcuts'); if (!nav) return;
    if (!pill || pill.parentNode !== nav) { pill = document.createElement('span'); pill.className = 'r-pill'; nav.prepend(pill); }
    var a = nav.querySelector('.tab-btn.bg-ink'); if (!a) { pill.style.width = '0'; return; }
    var nr = nav.getBoundingClientRect(), ar = a.getBoundingClientRect(), rtl = getComputedStyle(nav).direction === 'rtl';
    pill.style.width = ar.width + 'px';
    pill.style.insetInlineStart = (rtl ? nr.right - ar.right : ar.left - nr.left) + 'px';
  }
  function boot() {
    var nav = document.getElementById('hdr-shortcuts'); if (!nav) return setTimeout(boot, 300);
    new MutationObserver(function () { requestAnimationFrame(place); }).observe(nav, { attributes: true, subtree: true, attributeFilter: ['class'] });
    window.addEventListener('resize', place);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(place);
    place(); setTimeout(place, 400);
  }
  boot();

  /* لوجو تسجيل الدخول: شفاف وواحد */
  (function swapLoginLogo(n) {
    var im = document.querySelector('#tasahel-3d-overlay .t3d-logo-box img');
    if (im) { im.src = 'logo-transparent.png'; return; }
    if (n < 40) setTimeout(function () { swapLoginLogo(n + 1); }, 250);
  })(0);

  /* 2) عدّاد أرقام الـ KPI عند رسم الرئيسية (مرة واحدة، 700ms) */
  function countUp(el) {
    var m = /^(\D*?)([\d][\d,]*(?:\.\d+)?)(.*)$/.exec(el.textContent.trim()); if (!m) return;
    var raw = m[2], to = parseFloat(raw.replace(/,/g, '')), dec = (raw.split('.')[1] || '').length, comma = raw.indexOf(',') > -1;
    if (!isFinite(to) || to === 0) return;
    var t0 = performance.now(), D = 700;
    (function step(t) {
      var k = Math.min(1, (t - t0) / D), v = to * (1 - Math.pow(1 - k, 3));
      var s = v.toFixed(dec); if (comma) s = Number(s).toLocaleString('en', { minimumFractionDigits: dec, maximumFractionDigits: dec });
      el.textContent = m[1] + s + m[3];
      if (k < 1) requestAnimationFrame(step); else el.textContent = m[1] + raw + m[3];
    })(t0);
  }
  function decorateHome() {
    var home = document.getElementById('tab-home'); if (!home || !home.querySelector('.hm-hero')) return;
    var h1 = home.querySelector('.hm-hero h1');
    if (h1 && !h1.querySelector('.r-acc')) h1.innerHTML = h1.innerHTML.replace(/^(\s*أهلاً،\s*)(.+)$/, '$1<span class="r-acc">$2</span>');
    if (reduce) return;
    home.classList.remove('r-enter'); void home.offsetWidth; home.classList.add('r-enter');
    home.querySelectorAll('.hm-kpi-box > div.text-base').forEach(countUp);
  }
  var _r = window.renderHomeTab;
  if (typeof _r === 'function') window.renderHomeTab = function () { var r = _r.apply(this, arguments); try { decorateHome(); } catch (e) { /* */ } return r; };
})();
