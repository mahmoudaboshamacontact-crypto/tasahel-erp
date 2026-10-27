/* الرئيسية: إخفاء الاختصارات (الأقسام + أزرار الهيرو) وإضافة كروت أرقام (جاهزة للتسليم / تم تسليمها اليوم).
   بيلفّ renderHomeTab ومبيمسحش أي كود. لإرجاع الاختصارات: window.__homeShortcuts = true */
(function () {
  'use strict';
  if (window.__homeCleanup) return; window.__homeCleanup = true;
  var _r = window.renderHomeTab;
  if (typeof _r !== 'function') return;
  function kpi(label, val, cls) {
    return '<div class="hm-kpi-box ' + cls + '"><div class="text-[11px] text-slate-400">' + label + '</div>' +
      '<div class="text-base sm:text-lg font-bold font-mono text-white mt-0.5 whitespace-nowrap">' + val + '</div></div>';
  }
  function tweak() {
    var box = document.getElementById('tab-home'); if (!box) return;
    if (window.__homeShortcuts !== true) {
      var nav = box.querySelector('.hm-nav-card');
      var sec = nav && nav.parentElement && nav.parentElement.parentElement;     // بلوك "الأقسام"
      if (sec && sec !== box) sec.setAttribute('data-hm-hide', '');
      var hb = box.querySelector('.hm-hero button.btn-neo-pri');
      if (hb && hb.parentElement) hb.parentElement.setAttribute('data-hm-hide', '');   // أزرار طلب جديد/المعاملات/بحث
    }
    var grid = box.querySelector('.hm-hero .grid');
    if (grid && !grid.querySelector('.hm-ready')) {
      var ready = 0, done = 0, tk = new Date().toLocaleDateString('en-CA');
      try {
        groupedOrders.forEach(function (o) {
          var s = getOrderStatus(o);
          if (s === 'Complete') ready++;
          if (s === 'Delivered' && dayKey(o.received_at || o.created_at) === tk) done++;
        });
      } catch (e) {}
      grid.insertAdjacentHTML('beforeend', kpi('جاهزة للتسليم', ready + ' معاملة', 'hm-ready') + kpi('سُلّمت اليوم', done + ' معاملة', 'hm-done'));
    }
  }
  window.renderHomeTab = function () {
    var x = _r.apply(this, arguments);
    try { tweak(); } catch (e) { console.warn('home-cleanup', e); }
    return x;
  };
})();
