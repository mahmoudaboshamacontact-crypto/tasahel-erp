/* آلة حاسبة عائمة — حسابات محلية بدون eval، الحالة والمكان في localStorage.
   أصفر = تصغير لزرار عائم (بيحتفظ بالقيمة)، أحمر = إغلاق (القيمة كمان محفوظة لحد ما تمسحها بـ C) */
(function () {
  'use strict';
  if (window.__glCalc) return; window.__glCalc = true;
  var SK = 'ts_calc_state', S = { expr: '', res: '', vis: 'closed', fx: null, fy: null, px: null, py: null }, box, fab, exEl, rsEl;
  function load() { try { var j = JSON.parse(localStorage.getItem(SK) || 'null'); if (j) for (var k in j) S[k] = j[k]; } catch (e) {} }
  function save() { try { localStorage.setItem(SK, JSON.stringify(S)); } catch (e) {} }

  /* parser آمن: أرقام + - × ÷ % وأقواس */
  function calc(src) {
    var s = src.replace(/×/g, '*').replace(/÷/g, '/').replace(/٫/g, '.'), i = 0;
    function ws() { while (s[i] === ' ') i++; }
    function num() {
      ws(); var m = /^\d*\.?\d+/.exec(s.slice(i)); if (!m) throw 0; i += m[0].length; var v = parseFloat(m[0]);
      while (s[i] === '%') { v /= 100; i++; } return v;
    }
    function atom() { ws();
      if (s[i] === '(') { i++; var v = add(); ws(); if (s[i] !== ')') throw 0; i++; while (s[i] === '%') { v /= 100; i++; } return v; }
      if (s[i] === '-') { i++; return -atom(); } if (s[i] === '+') { i++; return atom(); } return num(); }
    function mul() { var v = atom(); for (;;) { ws(); var c = s[i]; if (c === '*') { i++; v *= atom(); } else if (c === '/') { i++; var d = atom(); if (d === 0) throw 1; v /= d; } else if (c === '(') { v *= atom(); } else return v; } }
    function add() { var v = mul(); for (;;) { ws(); var c = s[i]; if (c === '+') { i++; v += mul(); } else if (c === '-') { i++; v -= mul(); } else return v; } }
    var r = add(); ws(); if (i < s.length) throw 0; return r;
  }
  function fmt(n) { if (!isFinite(n)) return 'خطأ'; var r = Math.round(n * 1e10) / 1e10; return String(r); }
  function eval_() { if (!S.expr) { S.res = ''; return; } try { S.res = fmt(calc(S.expr)); } catch (e) { S.res = e === 1 ? 'لا يمكن القسمة على صفر' : ''; } }
  function render() { exEl.textContent = S.expr || ' '; rsEl.textContent = S.res || (S.expr ? '' : '0'); save(); }

  function press(k) {
    if (k === 'C') { S.expr = ''; S.res = ''; }
    else if (k === '⌫') { S.expr = S.expr.slice(0, -1); eval_(); }
    else if (k === '=') { if (S.res && S.res !== 'لا يمكن القسمة على صفر') { S.expr = S.res; S.res = ''; } }
    else { var last = S.expr.slice(-1); if (/[+\-×÷]/.test(k) && /[+\-×÷]/.test(last)) S.expr = S.expr.slice(0, -1); S.expr += k; eval_(); }
    render();
  }
  function place(el, x, y, w, h) {
    var mw = innerWidth - w - 6, mh = innerHeight - h - 6;
    el.style.left = Math.max(6, Math.min(x, mw)) + 'px'; el.style.top = Math.max(6, Math.min(y, mh)) + 'px'; el.style.right = 'auto'; el.style.bottom = 'auto';
  }
  function drag(handle, el, onEnd, isFab) {
    var sx, sy, ox, oy, moved, down = false;
    handle.addEventListener('pointerdown', function (e) { if (e.target.closest('.gl-dot')) return; down = true; moved = false; sx = e.clientX; sy = e.clientY; var r = el.getBoundingClientRect(); ox = r.left; oy = r.top; try { handle.setPointerCapture(e.pointerId); } catch (x) {} });
    handle.addEventListener('pointermove', function (e) { if (!down) return; var dx = e.clientX - sx, dy = e.clientY - sy; if (Math.abs(dx) + Math.abs(dy) > 4) moved = true; if (moved) place(el, ox + dx, oy + dy, el.offsetWidth, el.offsetHeight); });
    handle.addEventListener('pointerup', function () { if (!down) return; down = false; if (moved) { var r = el.getBoundingClientRect(); onEnd(r.left, r.top); if (isFab) fab.__moved = true; } });
  }
  function show(v) {
    S.vis = v; box.classList.toggle('on', v === 'open'); fab.classList.toggle('on', v === 'min');
    if (v === 'open') { if (S.px != null) place(box, S.px, S.py, 258, 380); } if (v === 'min') { if (S.fx != null) place(fab, S.fx, S.fy, 48, 48); else { fab.style.right = '16px'; fab.style.bottom = '150px'; } }
    save();
  }
  function build() {
    box = document.createElement('div'); box.id = 'gl-calc'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'آلة حاسبة');
    var keys = ['C', '(', ')', '÷', '7', '8', '9', '×', '4', '5', '6', '-', '1', '2', '3', '+', '0', '.', '%', '=', '⌫'];
    box.innerHTML = '<div class="gcal-bar"><div class="gl-dots"><button type="button" class="gl-dot red" title="إغلاق">×</button><button type="button" class="gl-dot yellow" title="تصغير">−</button></div><span class="gcal-title">الآلة الحاسبة</span></div>' +
      '<div class="gcal-scr"><div class="gcal-ex"></div><div class="gcal-res"></div></div><div class="gcal-keys">' +
      keys.map(function (k) { var c = k === 'C' ? 'clr' : k === '=' ? 'eq' : /[÷×\-+%()]/.test(k) ? 'op' : ''; return '<button type="button" data-k="' + k + '" class="' + c + '">' + k + '</button>'; }).join('') + '</div>';
    document.body.appendChild(box);
    fab = document.createElement('button'); fab.type = 'button'; fab.id = 'gl-calc-fab'; fab.title = 'الآلة الحاسبة'; fab.innerHTML = '<i class="fa-solid fa-calculator"></i>';
    document.body.appendChild(fab);
    exEl = box.querySelector('.gcal-ex'); rsEl = box.querySelector('.gcal-res');
    box.querySelector('.gcal-keys').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) press(b.dataset.k); });
    box.querySelector('.red').addEventListener('click', function () { show('closed'); });
    box.querySelector('.yellow').addEventListener('click', function () { show('min'); });
    fab.addEventListener('click', function () { if (fab.__moved) { fab.__moved = false; return; } show('open'); });
    drag(box.querySelector('.gcal-bar'), box, function (x, y) { S.px = x; S.py = y; save(); });
    drag(fab, fab, function (x, y) { S.fx = x; S.fy = y; save(); }, true);
    box.addEventListener('keydown', function (e) { var k = e.key; if (/^[0-9.+\-()%]$/.test(k)) press(k); else if (k === '*') press('×'); else if (k === '/') { e.preventDefault(); press('÷'); } else if (k === 'Enter' || k === '=') { e.preventDefault(); press('='); } else if (k === 'Backspace') press('⌫'); else if (k === 'Escape') show('min'); });
    box.tabIndex = -1;
    window.addEventListener('resize', function () { if (S.vis === 'min' && S.fx != null) place(fab, S.fx, S.fy, 48, 48); });
  }
  window.openCalculator = function () { if (typeof window.closeNavMenu === 'function') window.closeNavMenu(); show('open'); box.focus(); };
  function addEntries() {
    var m = document.getElementById('nav-menu');
    if (m && !m.querySelector('[data-calc]')) { m.querySelector('hr:last-of-type') ; var b = document.createElement('button'); b.type = 'button'; b.className = 'tab-btn'; b.setAttribute('data-calc', '1'); b.innerHTML = '<i class="fa-solid fa-calculator"></i><span>الآلة الحاسبة</span>'; b.onclick = function () { window.openCalculator(); }; var notes = document.getElementById('tab-notes-btn'); notes ? notes.insertAdjacentElement('afterend', b) : m.appendChild(b); }
  }
  function init() { load(); build(); render(); addEntries(); setTimeout(addEntries, 1500); show(S.vis === 'open' ? 'open' : S.vis === 'min' ? 'min' : 'closed'); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
