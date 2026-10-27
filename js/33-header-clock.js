/* ساعة + يوم + تاريخ في الهيدر (ديسكتوب). محلية 100%، الاختيار (رقمية/عقارب) في localStorage، وبتوقف لما التاب مخفي */
(function () {
  'use strict';
  if (window.__glClock) return; window.__glClock = true;
  var KEY = 'ts_clock_mode', TZ = 'Africa/Cairo', el, timer;
  function mode() { try { return localStorage.getItem(KEY) === 'analog' ? 'analog' : 'digital'; } catch (e) { return 'digital'; } }
  function setMode(m) { try { localStorage.setItem(KEY, m); } catch (e) {} }
  var fT = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  var fD = new Intl.DateTimeFormat('ar-EG', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
  function parts(d) { var p = fT.format(d).split(':'); return [+p[0], +p[1], +p[2]]; }
  function build() {
    var m = mode();
    el.classList.toggle('gl-clock-analog',m==='analog'); el.classList.toggle('gl-clock-digital',m!=='analog');
    el.innerHTML = m === 'analog'
      ? '<svg viewBox="0 0 40 40"><circle class="gc-face" cx="20" cy="20" r="18" stroke-width="1.5"/><line class="gc-h" x1="20" y1="20" x2="20" y2="11" stroke-width="2.4"/><line class="gc-m" x1="20" y1="20" x2="20" y2="7" stroke-width="1.8"/><line class="gc-s" x1="20" y1="22" x2="20" y2="6" stroke-width="1"/></svg><span class="gc-date"></span>'
      : '<div><div class="gc-time"></div><div class="gc-date"></div></div>';
    el.title = 'اضغط لتغيير شكل الساعة'; tick();
  }
  function tick() {
    if (!el) return; var d = new Date(), p = parts(d);
    var dt = el.querySelector('.gc-date'); if (dt) { var s = fD.format(d); if (dt.textContent !== s) dt.textContent = s; }
    var t = el.querySelector('.gc-time');
    if (t) t.textContent = ((p[0] % 12) || 12) + ':' + (p[1] < 10 ? '0' : '') + p[1] + (p[0] < 12 ? ' ص' : ' م');
    else {
      var rot = function (c, a) { var n = el.querySelector(c); if (n) n.setAttribute('transform', 'rotate(' + a + ' 20 20)'); };
      rot('.gc-h', (p[0] % 12) * 30 + p[1] * .5); rot('.gc-m', p[1] * 6 + p[2] * .1); rot('.gc-s', p[2] * 6);
    }
  }
  function start() { stop(); if (!document.hidden && el && el.offsetParent !== null) { tick(); timer = setInterval(tick, 1000); } }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }
  function init() {
    var host = document.querySelector('.ts-hdr-end'); if (!host || document.querySelector('.gl-clock')) return;
    el = document.createElement('div'); el.className = 'gl-clock'; el.setAttribute('role', 'button');
    host.insertBefore(el, host.firstChild); build();
    el.addEventListener('click', function () { setMode(mode() === 'analog' ? 'digital' : 'analog'); build(); });
    document.addEventListener('visibilitychange', function () { document.hidden ? stop() : start(); });
    window.addEventListener('resize', start); start();
    try { var app = document.getElementById('app'); if (app) new MutationObserver(start).observe(app, { attributes: true, attributeFilter: ['class'] }); } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
