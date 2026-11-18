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
    new MutationObserver(function () { requestAnimationFrame(place); }).observe(nav, { attributes: true, subtree: true, attributeFilter: ['class'], childList: true });
    if (window.ResizeObserver) { try { new ResizeObserver(function () { requestAnimationFrame(place); }).observe(nav); } catch (e) {} }
    window.addEventListener('resize', place);
    window.addEventListener('load', place);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { requestAnimationFrame(place); });
    place(); setTimeout(place, 250); setTimeout(place, 700); setTimeout(place, 1400);
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
    if (home.__rDone) return; /* أنيميشن الدخول وعدّاد الأرقام مرة واحدة فقط عند فتح الرئيسية لمنع الرمشة */
    home.__rDone = true;
    home.classList.remove('r-enter'); void home.offsetWidth; home.classList.add('r-enter');
    setTimeout(function () { home.classList.remove('r-enter'); }, 900);
    home.querySelectorAll('.hm-kpi-box > div.text-base').forEach(countUp);
  }

  /* 3) ألوان الرسوم البيانية (Chart.js) تتوافق مع الهوية — بتتطبق عند كل تحديث للرسم */
  (function chartTheme(n) {
    if (typeof Chart === 'undefined') { if (n < 40) setTimeout(function () { chartTheme(n + 1); }, 250); return; }
    var M = { '#0d9488': '#ff9d6c', '#2563eb': '#5fd3b3', '#3b82f6': '#5fd3b3', '#8b5cf6': '#e8c878', '#f59e0b': '#ff7a3d', '#ec4899': '#ff6b6b', '#10b981': '#5fd3b3', '#64748b': '#6f675f',
      'rgba(13,148,136,.14)': 'rgba(255,157,108,.16)', 'rgba(13, 148, 136, 0.14)': 'rgba(255,157,108,.16)' };
    var ML = { '#0d9488': '#e8590c', '#2563eb': '#0f9d77', '#3b82f6': '#0f9d77', '#8b5cf6': '#ca8a04', '#f59e0b': '#ff7a3d', '#ec4899': '#d93636', '#10b981': '#0f9d77', '#64748b': '#a89a8c',
      'rgba(13,148,136,.14)': 'rgba(232,89,12,.12)', 'rgba(13, 148, 136, 0.14)': 'rgba(232,89,12,.12)' };
    function mc(c) { var m = document.documentElement.classList.contains('dark') ? M : ML; if (Array.isArray(c)) return c.map(mc); return typeof c === 'string' && m[c.toLowerCase()] ? m[c.toLowerCase()] : c; }
    try { Chart.defaults.color = '#a0978e'; Chart.defaults.font.family = "'IBM Plex Sans Arabic', sans-serif"; } catch (e) { /* */ }
    Chart.register({ id: 'reelsTheme', beforeUpdate: function (ch) {
      try { Chart.defaults.color = document.documentElement.classList.contains('dark') ? '#a0978e' : '#7b6f64'; } catch (e) { /* */ }
      ch.data.datasets.forEach(function (d) {
        if (d.borderColor) d.borderColor = mc(d.borderColor);
        if (d.backgroundColor) d.backgroundColor = mc(d.backgroundColor);
      });
    } });
  })(0);


  /* 4) القائمة الجانبية: حبة تمييز زجاجية بتنزلق مع الماوس (ريل 1) + الدوك السفلي: كرة بتنزلق للتاب النشط (ريل 2) */
  (function slidingHighlights() {
    if (reduce) return;
    function hl(menuSel, itemSel, cls, mode) {
      var menu = document.querySelector(menuSel); if (!menu || menu.__rHl) return !!menu; menu.__rHl = true;
      var el = document.createElement('i'); el.className = cls; el.setAttribute('aria-hidden', 'true'); menu.insertBefore(el, menu.firstChild);
      if (menuSel !== '#gl-bn' && getComputedStyle(menu).position === 'static') menu.style.position = 'relative';
      function to(b) {
        if (!b) { el.style.opacity = 0; return; }
        el.style.opacity = 1; el.style.width = b.offsetWidth + 'px'; el.style.height = b.offsetHeight + 'px';
        el.style.transform = 'translate(' + b.offsetLeft + 'px,' + b.offsetTop + 'px)';
      }
      if (mode === 'hover') {
        menu.addEventListener('mouseover', function (e) { var b = e.target.closest(itemSel); if (b && menu.contains(b)) to(b); });
        menu.addEventListener('mouseleave', function () { el.style.opacity = 0; });
      } else {
        var sync = function () { to(menu.querySelector(itemSel + '.is-active')); };
        new MutationObserver(function () { requestAnimationFrame(sync); }).observe(menu, { attributes: true, subtree: true, attributeFilter: ['class'] });
        window.addEventListener('resize', sync); setTimeout(sync, 300);
      }
      return true;
    }
    (function wait(n) {
      var a = hl('#nav-menu', '.tab-btn', 'r-hl', 'hover'), b = hl('#gl-bn', 'button', 'r-bead', 'active');
      if ((!a || !b) && n < 40) setTimeout(function () { wait(n + 1); }, 400);
    })(0);
  })();

  var _r = window.renderHomeTab;
  if (typeof _r === 'function') window.renderHomeTab = function () { var r = _r.apply(this, arguments); try { decorateHome(); } catch (e) { /* */ } return r; };
})();
