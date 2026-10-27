/* يلوّن كروت/صفوف المعاملات حسب الحالة الفعلية — بيلفّ renderRecentRequests وميغيّرش محتواه */
(function () {
  'use strict';
  if (window.__txStatusCards) return; window.__txStatusCards = true;
  function kind(o) {
    try {
      if (typeof isOrderLate === 'function' && isOrderLate(o)) return 'late';
      var s = typeof getOrderStatus === 'function' ? getOrderStatus(o) : 'In Progress';
      if (s === 'Delivered') return 'done';
      if (s === 'Complete') return 'ready';
    } catch (e) {}
    return 'prog';
  }
  function paint() {
    if (typeof groupedOrders === 'undefined') return;
    var m = {};
    groupedOrders.forEach(function (o) { m[String(o.transaction_id)] = kind(o); });
    document.querySelectorAll('#recent-cards-container > [data-tx]').forEach(function (el) {
      var k = m[el.dataset.tx]; if (k) el.setAttribute('data-st-bar', k);
    });
    document.querySelectorAll('#recent-table-body tr').forEach(function (tr) {
      var b = tr.querySelector('[data-tx]'), k = b && m[b.dataset.tx]; if (k) tr.setAttribute('data-st-bar', k);
    });
  }
  var _r = window.renderRecentRequests;
  if (typeof _r !== 'function') return;
  window.renderRecentRequests = function () {
    var x = _r.apply(this, arguments);
    try { paint(); } catch (e) { console.warn('tx-status', e); }
    return x;
  };
})();
