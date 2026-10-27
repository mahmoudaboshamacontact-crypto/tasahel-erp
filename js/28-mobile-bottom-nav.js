/* شريط سفلي للموبايل — بينده switchTab/toggleNavMenu الموجودين، ومبيغيّرهمش */
(function () {
  'use strict';
  var ITEMS = [
    ['home', 'fa-house', 'الرئيسية'],
    ['tx', 'fa-list-ul', 'المعاملات'],
    ['new', 'fa-plus', 'طلب جديد'],
    ['cash', 'fa-wallet', 'الكاش'],
    ['more', 'fa-bars', 'المزيد']
  ];
  var bar;
  function setActive(id) {
    if (!bar) return;
    bar.querySelectorAll('button').forEach(function (b) { b.classList.toggle('is-active', b.dataset.id === id); });
  }
  function syncBadge() {
    var src = document.getElementById('menu-tx-badge'), dst = bar && bar.querySelector('.gl-bn-badge');
    if (!dst) return;
    var n = src && !src.classList.contains('hidden') ? src.textContent.trim() : '';
    dst.textContent = n; dst.hidden = !n || n === '0';
  }
  function visible() { var m = document.getElementById('menu-btn'); return !!(m && m.offsetParent !== null); }
  function toggleShow() {
    var on = visible();
    bar.classList.toggle('gl-bn-on', on); document.body.classList.toggle('gl-bn-pad', on);
  }
  function init() {
    if (document.getElementById('gl-bn')) return;
    bar = document.createElement('nav'); bar.id = 'gl-bn'; bar.setAttribute('aria-label', 'التنقل السريع');
    bar.innerHTML = ITEMS.map(function (it) {
      return '<button type="button" data-id="' + it[0] + '"' + (it[0] === 'new' ? ' class="gl-bn-new"' : '') + '>' +
        '<i class="fa-solid ' + it[1] + '"></i><span>' + it[2] + '</span>' +
        (it[0] === 'tx' ? '<span class="gl-bn-badge" hidden></span>' : '') + '</button>';
    }).join('');
    document.body.appendChild(bar);
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.id === 'more') { if (typeof window.toggleNavMenu === 'function') window.toggleNavMenu(e); return; }
      if (typeof window.closeNavMenu === 'function') window.closeNavMenu();
      if (typeof window.switchTab === 'function') window.switchTab(b.dataset.id);
    });
    var st = window.switchTab;
    if (typeof st === 'function') window.switchTab = function (id) {
      var r = st.apply(this, arguments); setActive(id); toggleShow(); return r;
    };
    try { setActive(typeof currentTab !== 'undefined' ? currentTab : 'home'); } catch (e) { setActive('home'); }
    var mb = document.getElementById('menu-btn');
    try { if (mb) new ResizeObserver(toggleShow).observe(mb); } catch (e) {}
    window.addEventListener('resize', toggleShow);
    var tb = document.getElementById('menu-tx-badge');
    try { if (tb) new MutationObserver(syncBadge).observe(tb, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['class'] }); } catch (e) {}
    toggleShow(); syncBadge();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
