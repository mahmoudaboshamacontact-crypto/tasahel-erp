/* الساعة المدمجة في منطقة الملخص بواجهة البداية (القسم 3.2):
   - تصميم زجاجي متكامل عالي الوضوح (رقمي 12 ساعة + عقارب عند الضغط)
   - توقيت القاهرة (Africa/Cairo) مع اليوم والتاريخ، بدون إزحام الهيدر العلوي */
(function () {
  'use strict';
  if (window.__glClock) return; window.__glClock = true;
  var KEY = 'ts_clock_mode', TZ = 'Africa/Cairo', el = null, timer = null;
  function mode() { try { return localStorage.getItem(KEY) === 'analog' ? 'analog' : 'digital'; } catch (e) { return 'digital'; } }
  function setMode(m) { try { localStorage.setItem(KEY, m); } catch (e) {} }
  var fT = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  var fD = new Intl.DateTimeFormat('ar-EG', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
  function parts(d) { var p = fT.format(d).split(':'); return [+p[0], +p[1], +p[2]]; }
  function build() {
    if (!el) return;
    var m = mode();
    el.className = 'gl-clock ' + (m === 'analog' ? 'gl-clock-analog' : 'gl-clock-digital');
    el.innerHTML = m === 'analog'
      ? '<svg viewBox="0 0 44 44" aria-hidden="true"><circle class="gc-face" cx="22" cy="22" r="19.5" stroke-width="1.6"/><circle cx="22" cy="22" r="1.8" fill="currentColor"/><line class="gc-h" x1="22" y1="22" x2="22" y2="11.5" stroke-width="2.6"/><line class="gc-m" x1="22" y1="22" x2="22" y2="7.5" stroke-width="1.9"/><line class="gc-s" x1="22" y1="24" x2="22" y2="6.5" stroke-width="1.1"/></svg>' +
        '<div class="gc-meta"><div class="gc-time"></div><div class="gc-date"></div></div>'
      : '<div class="gc-meta"><div class="gc-time"></div><div class="gc-date"></div></div>';
    el.title = 'اضغط للتبديل بين الساعة الرقمية وساعة العقارب';
    tick();
  }
  function tick() {
    if (!el) return;
    var d = new Date(), p = parts(d);
    var dt = el.querySelector('.gc-date');
    if (dt) {
      var s = fD.format(d);
      if (dt.textContent !== s) dt.textContent = s;
    }
    var t = el.querySelector('.gc-time');
    var h12 = (p[0] % 12) || 12;
    var mStr = (p[1] < 10 ? '0' : '') + p[1];
    var sStr = (p[2] < 10 ? '0' : '') + p[2];
    var ampm = p[0] < 12 ? 'AM' : 'PM';
    if (t) {
      if (!t.firstChild || !t.querySelector('.gc-hm')) t.innerHTML = '<span class="gc-hm"></span><span class="gc-sec"></span><span class="gc-ap"></span>';
      var hm = h12 + ':' + mStr, a = t.querySelector('.gc-hm'), b = t.querySelector('.gc-sec'), c = t.querySelector('.gc-ap');
      if (a.textContent !== hm) a.textContent = hm;
      b.textContent = ':' + sStr;
      if (c.textContent !== ampm) c.textContent = ampm;
      t.setAttribute('aria-label', h12 + ':' + mStr + ' ' + ampm);
    }
    var rot = function (c, a) { var n = el.querySelector(c); if (n) n.setAttribute('transform', 'rotate(' + a + ' 22 22)'); };
    rot('.gc-h', (p[0] % 12) * 30 + p[1] * 0.5);
    rot('.gc-m', p[1] * 6 + p[2] * 0.1);
    rot('.gc-s', p[2] * 6);
  }
  function start() {
    stop();
    if (!document.hidden && el && document.body.contains(el)) {
      tick();
      timer = setInterval(tick, 1000);
    }
  }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }

  function mountHomeClock() {
    var oldHome = document.getElementById('hm-clock-slot');
    if (oldHome) oldHome.remove();
    var slot = document.getElementById('hdr-clock-slot');
    if (!slot) return;
    if (!el) {
      el = document.createElement('div');
      el.setAttribute('role', 'button');
      el.addEventListener('click', function () {
        setMode(mode() === 'analog' ? 'digital' : 'analog');
        build();
      });
    }
    if (el.parentElement !== slot) {
      slot.innerHTML = '';
      slot.appendChild(el);
    }
    build();
    start();
  }
  window.mountHomeClock = mountHomeClock;

  document.addEventListener('visibilitychange', function () { document.hidden ? stop() : start(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountHomeClock); else mountHomeClock();
})();
