/* =====================================================================
   تنظيف القائمة الجانبية: تجميع الأزرار في 4 أقسام قابلة للطي
   - يومي (مفتوح دايمًا افتراضيًا) | متابعة وتواصل | أداء وتقارير | إدارة.
   - أي زر جديد بيتضاف من أي ملف بيتحط في قسمه أوتوماتيك (بالـ id أو data-tab-target).
   - القسم اللي فيه التاب الحالي بيتفتح لوحده، وحالة الفتح/الطي بتتحفظ.
   - بدون أنيميشن، والألوان من متغيرات الثيم. الأزرار نفسها ما بتتغيّرش (نفس الـ onclick).
   ===================================================================== */
(function () {
  'use strict';
  if (window.__menuGroups) return; window.__menuGroups = true;
  const KEY = 'ts_menu_groups';
  const GROUPS = [
    { id: 'daily', title: 'الشغل اليومي', icon: 'fa-sun', keys: ['home', 'new', 'tx', 'exec', 'wtrack', 'cash', 'receipt', 'batchprint', 'myday', 'late'] },
    { id: 'follow', title: 'متابعة وتواصل', icon: 'fa-comments', keys: ['chat', 'tasks', 'notes', 'inquiries', 'search'] },
    { id: 'perf', title: 'أداء وتقارير', icon: 'fa-chart-line', keys: ['comm', 'dash', 'teamperf', 'wk', 'team'] },
    { id: 'admin', title: 'إدارة', icon: 'fa-sliders', keys: ['hr', 'couriers', 'partners', 'calc', 'db', 'backup'] }
  ];
  const where = {}; GROUPS.forEach(g => g.keys.forEach((k, i) => { where[k] = { g: g.id, i: i }; }));
  let menu = null, busy = false, timer = null;

  function readState() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
  function writeState(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* */ } }

  function keyOf(b) {
    if (b.dataset && b.dataset.tabTarget) return b.dataset.tabTarget;
    if (b.hasAttribute('data-calc')) return 'calc';
    const id = b.id || '';
    if (id === 'hdr-late-btn') return 'late';
    if (id === 'backup-btn') return 'backup';
    const m = /^tab-([a-z0-9]+)-btn$/.exec(id); if (m) return m[1];
    const oc = b.getAttribute('onclick') || '';
    if (/openSupabaseModal/.test(oc)) return 'db';
    return null;
  }

  const CSS =
    '#nav-menu > section.mg{display:block;position:static!important;z-index:auto!important}' +
    '#nav-menu .mg-body{position:static}' +
    '#nav-menu .mg:not(:has(.tab-btn:not(.hidden))){display:none}' +
    '#nav-menu .mg:not(.open) .mg-body{display:none}' +
    '#nav-menu .mg-head{display:flex;width:100%;align-items:center;gap:8px;padding:8px 10px;margin-top:4px;border:0;background:transparent;cursor:pointer;font-size:11px;font-weight:700;color:var(--r-mute,#8b85a3);text-align:right;position:relative}' +
    '#nav-menu .mg-head .mg-title{flex:1}' +
    '#nav-menu .mg.open .mg-head i.mg-chev{transform:rotate(180deg)}' +
    '#nav-menu .mg:not(.open):has(.mg-body .rounded-full:not(.hidden)) .mg-head::after{content:"";width:7px;height:7px;border-radius:50%;background:var(--r-acc,#ff9d6c);position:absolute;left:34px;top:50%;margin-top:-3px}' +
    '#nav-menu.gl-collapsed .mg-head{display:none}' +
    '#nav-menu.gl-collapsed .mg .mg-body{display:block!important}' +
    '#nav-menu .mg-hide{display:none!important}';

  function buildSection(g, state) {
    const s = document.createElement('section'); s.className = 'mg'; s.dataset.mg = g.id;
    if (state[g.id] === undefined ? g.id === 'daily' : state[g.id]) s.classList.add('open');
    s.innerHTML = '<button type="button" class="mg-head" aria-expanded="false"><i class="fa-solid ' + g.icon + '"></i><span class="mg-title">' + g.title + '</span><i class="fa-solid fa-chevron-down mg-chev"></i></button><div class="mg-body"></div>';
    s.querySelector('.mg-head').addEventListener('click', function (e) {
      e.stopPropagation(); setOpen(s, !s.classList.contains('open'), true);
    });
    return s;
  }
  function setOpen(s, on, save) {
    s.classList.toggle('open', on);
    const h = s.querySelector('.mg-head'); if (h) h.setAttribute('aria-expanded', on ? 'true' : 'false');
    if (save) { const st = readState(); st[s.dataset.mg] = on ? 1 : 0; writeState(st); }
  }

  function idx(el) { const v = parseInt(el.dataset.mgi, 10); return isNaN(v) ? 99 : v; }
  function organize() {
    if (!menu || busy) return; busy = true;
    try {
      const state = readState();
      menu.querySelectorAll(':scope > .gl-sec, :scope > hr').forEach(function (el) { el.classList.add('mg-hide'); });
      const secs = {};
      GROUPS.forEach(function (g) {
        let s = menu.querySelector(':scope > section[data-mg="' + g.id + '"]');
        if (!s) {
          s = buildSection(g, state);
          const foot = menu.querySelector(':scope > .r-logout-menu');
          if (foot) menu.insertBefore(s, foot); else menu.appendChild(s);
        }
        secs[g.id] = s;
      });
      menu.querySelectorAll('.tab-btn').forEach(function (b) {
        const k = keyOf(b), w = k && where[k]; if (!w) return;
        const body = secs[w.g].querySelector('.mg-body');
        if (b.parentElement !== body) body.appendChild(b);
        b.dataset.mgi = w.i;
      });
      GROUPS.forEach(function (g) {
        const body = secs[g.id].querySelector('.mg-body');
        const kids = Array.prototype.slice.call(body.children);
        const sorted = kids.slice().sort(function (a, b) { return idx(a) - idx(b); });
        if (sorted.some(function (el, i) { return el !== kids[i]; })) sorted.forEach(function (el) { body.appendChild(el); });
      });
    } catch (e) { console.warn('menu-groups', e); }
    busy = false;
  }
  function later() { clearTimeout(timer); timer = setTimeout(organize, 60); }

  function openFor(id) {
    if (!menu || !id) return;
    const b = menu.querySelector('[data-tab-target="' + id + '"], #tab-' + id + '-btn'); if (!b) return;
    const s = b.closest('.mg'); if (s && !s.classList.contains('open')) setOpen(s, true, false);
  }

  function init() {
    menu = document.getElementById('nav-menu'); if (!menu) return;
    if (!document.getElementById('mg-style')) { const st = document.createElement('style'); st.id = 'mg-style'; st.textContent = CSS; document.head.appendChild(st); }
    organize();
    try { new MutationObserver(later).observe(menu, { childList: true, subtree: true }); } catch (e) { /* */ }
    const o = window.switchTab;
    if (typeof o === 'function') window.switchTab = function (id) { const r = o.apply(this, arguments); try { openFor(id); } catch (e) { /* */ } return r; };
    const t = window.toggleNavMenu;
    if (typeof t === 'function') window.toggleNavMenu = function () { const r = t.apply(this, arguments); try { openFor(typeof currentTab !== 'undefined' ? currentTab : null); } catch (e) { /* */ } return r; };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
