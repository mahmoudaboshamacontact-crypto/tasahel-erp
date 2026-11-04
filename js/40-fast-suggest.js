/* اقتراحات سريعة لاسم العميل/التليفون/الإيصالات:
   بدل قايمة المتصفح الضخمة (datalist بآلاف الأسماء) — بنعرض أحدث 8 نتايج مطابقة بس، بعد حرفين، بدون أي تقل. */
(function () {
  'use strict';
  if (window.__fastSuggest) return; window.__fastSuggest = true;
  var CFG = { 'client-name': 'name', 'phone': 'phone', 'receipt-client-input': 'both' };
  var silent = false, MAX = 8, MIN = 2, idx = null, idxKey = '', box = null, cur = null, items = [], sel = -1, timer = 0;

  function norm(s) {
    return String(s || '').toLowerCase().replace(/[ً-ٰٟ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim();
  }
  function lines() { try { return allRequestLines || []; } catch (e) { return []; } }
  function build() {
    var L = lines(), key = L.length + ':' + (L[0] && L[0].id) + ':' + (L.length && L[L.length - 1].id);
    if (idx && key === idxKey) return idx;
    var names = new Map(), phones = new Map();
    for (var i = 0; i < L.length; i++) {
      var l = L[i], n = (l.client_name || '').trim(), p = (l.phone || '').trim(), t = Date.parse(l.received_at || l.created_at || '') || 0;
      if (n) { var e = names.get(n); if (!e || t > e.t) names.set(n, { v: n, k: norm(n), sub: p, t: t }); }
      if (p) { var f = phones.get(p); if (!f || t > f.t) phones.set(p, { v: p, k: p.replace(/\s+/g, ''), sub: n, t: t }); }
    }
    idx = { names: Array.from(names.values()), phones: Array.from(phones.values()) }; idxKey = key; return idx;
  }
  function find(q, kind) {
    var I = build(), nq = norm(q), dq = q.replace(/\s+/g, ''), out = [];
    var pools = kind === 'name' ? [I.names] : kind === 'phone' ? [I.phones] : [I.names, I.phones];
    pools.forEach(function (pool) {
      var isPhone = pool === I.phones, key = isPhone ? dq : nq;
      if (isPhone && !/\d/.test(dq)) return;
      var hits = [];
      for (var i = 0; i < pool.length; i++) { var e = pool[i], pos = e.k.indexOf(key); if (pos >= 0) hits.push([pos === 0 ? 0 : 1, e]); }
      hits.sort(function (a, b) { return a[0] - b[0] || b[1].t - a[1].t; });
      hits.slice(0, MAX).forEach(function (h) { out.push(h[1]); });
    });
    return out.slice(0, MAX);
  }
  function ensureBox() {
    if (box) return box;
    var st = document.createElement('style');
    st.textContent = '#fs-box{position:fixed;z-index:2147483000;margin:0;padding:4px;list-style:none;min-width:200px;max-height:min(46vh,340px);overflow:auto;border-radius:14px;background:var(--r-bg-pop,#1b1917);color:var(--r-text,#f4eee8);border:1px solid var(--r-line,rgba(255,255,255,.12));box-shadow:0 18px 40px -12px rgba(0,0,0,.55);direction:rtl;font-size:13px}' +
      'html:not(.dark) #fs-box{background:#fff;color:#26201b;box-shadow:0 18px 40px -16px rgba(90,45,10,.35)}' +
      '#fs-box li{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 11px;border-radius:10px;cursor:pointer}' +
      '#fs-box li b{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#fs-box li span{opacity:.6;font-size:11px;direction:ltr;white-space:nowrap}' +
      '#fs-box li.on,#fs-box li:hover{background:rgba(255,122,61,.16)}';
    document.head.appendChild(st);
    box = document.createElement('ul'); box.id = 'fs-box'; box.hidden = true; box.setAttribute('role', 'listbox');
    box.addEventListener('mousedown', function (e) { e.preventDefault(); var li = e.target.closest('li'); if (li) pick(+li.dataset.i); });
    box.addEventListener('touchstart', function (e) { var li = e.target.closest('li'); if (li) { e.preventDefault(); pick(+li.dataset.i); } }, { passive: false });
    document.body.appendChild(box); return box;
  }
  function hide() { if (box) box.hidden = true; sel = -1; items = []; }
  function place() {
    if (!cur || box.hidden) return;
    var r = cur.getBoundingClientRect(), below = window.innerHeight - r.bottom, h = Math.min(box.scrollHeight, 340);
    box.style.width = Math.max(r.width, 200) + 'px'; box.style.left = Math.max(4, Math.min(r.left, window.innerWidth - Math.max(r.width, 200) - 4)) + 'px';
    if (below < h + 12 && r.top > below) { box.style.top = 'auto'; box.style.bottom = (window.innerHeight - r.top + 4) + 'px'; }
    else { box.style.bottom = 'auto'; box.style.top = (r.bottom + 4) + 'px'; }
  }
  function show(el, list) {
    ensureBox(); items = list; sel = -1; cur = el;
    if (!list.length) { hide(); return; }
    box.innerHTML = ''; list.forEach(function (e, i) {
      var li = document.createElement('li'); li.dataset.i = i; li.setAttribute('role', 'option');
      var b = document.createElement('b'); b.textContent = e.v; li.appendChild(b);
      if (e.sub) { var s = document.createElement('span'); s.textContent = e.sub; li.appendChild(s); }
      box.appendChild(li);
    });
    box.hidden = false; place();
  }
  function pick(i) {
    var e = items[i]; if (!e || !cur) return; var el = cur; el.value = e.v; hide();
    silent = true; clearTimeout(timer);
    try { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } finally { silent = false; }
    clearTimeout(timer); hide();
  }
  function onInput(ev) {
    var el = ev.target, kind = CFG[el.id]; if (!kind) return;
    clearTimeout(timer);
    var q = el.value.trim();
    if (silent || q.length < MIN) { hide(); return; }
    timer = setTimeout(function () { show(el, find(q, kind)); }, 90);
  }
  function onKey(ev) {
    if (!box || box.hidden || !CFG[ev.target.id]) return;
    var k = ev.key;
    if (k === 'ArrowDown' || k === 'ArrowUp') {
      ev.preventDefault(); sel = (sel + (k === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      Array.prototype.forEach.call(box.children, function (li, i) { li.classList.toggle('on', i === sel); });
    } else if (k === 'Enter' && sel >= 0) { ev.preventDefault(); pick(sel); }
    else if (k === 'Escape') hide();
  }
  function clearHeavyDatalists() {
    ['clients-datalist', 'phones-datalist', 'receipt-clients-datalist'].forEach(function (id) {
      var d = document.getElementById(id);
      if (d && d.firstChild) d.innerHTML = '';
    });
  }
  function lightRenderDatalists() {
    try {
      clearHeavyDatalists();
      if (typeof uniq !== 'function' || typeof opts !== 'function') return;
      var empEl = document.getElementById('emp-datalist');
      if (empEl) {
        var profNames = (typeof profiles !== 'undefined' && Array.isArray(profiles)) ? profiles.map(function (p) { return (p.full_name || '').trim(); }).filter(Boolean) : [];
        empEl.innerHTML = opts(Array.from(new Set(profNames.concat(uniq('employee')))));
      }
      var recEl = document.getElementById('rec-datalist');
      if (recEl) recEl.innerHTML = opts(uniq('receiver'));
      var exEl = document.getElementById('exec-datalist');
      if (!exEl) { exEl = document.createElement('datalist'); exEl.id = 'exec-datalist'; document.body.appendChild(exEl); }
      var svcEx = (typeof allServices !== 'undefined' && Array.isArray(allServices)) ? allServices.map(function (s) { return s.executor; }).filter(Boolean) : [];
      exEl.innerHTML = opts(Array.from(new Set(uniq('executor').concat(svcEx))));

      var svcEl = document.getElementById('svc-datalist');
      if (svcEl && typeof allServices !== 'undefined' && allServices.length) {
        var counts = new Map();
        lines().forEach(function (l) {
          var k = norm(l.service);
          if (k) counts.set(k, (counts.get(k) || 0) + 1);
        });
        var sorted = allServices.slice().sort(function (a, b) {
          return (counts.get(norm(b.name)) || 0) - (counts.get(norm(a.name)) || 0) || String(a.name).localeCompare(String(b.name), 'ar');
        });
        var eh = typeof escapeHtml === 'function' ? escapeHtml : String;
        svcEl.innerHTML = sorted.map(function (s) {
          var cnt = counts.get(norm(s.name)) || 0;
          var priceTxt = (s.unit_price != null && typeof fmtNum === 'function') ? (fmtNum(s.unit_price) + ' ج.م') : '';
          var lbl = priceTxt + (cnt ? ' · اتطلبت ' + cnt + ' مرة' : '');
          return '<option value="' + eh(s.name) + '" label="' + eh(lbl) + '"></option>';
        }).join('');
      }
    } catch (e) { /* */ }
  }
  function init() {
    Object.keys(CFG).forEach(function (id) {
      var el = document.getElementById(id); if (!el) return;
      el.removeAttribute('list'); el.setAttribute('autocomplete', 'off');
    });
    clearHeavyDatalists();
    document.addEventListener('input', onInput, true);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('focusout', function (e) { if (CFG[e.target.id]) setTimeout(hide, 120); }, true);
    window.addEventListener('resize', place); window.addEventListener('scroll', function () { if (box && !box.hidden) place(); }, true);
    window.renderClientDatalists = lightRenderDatalists;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
