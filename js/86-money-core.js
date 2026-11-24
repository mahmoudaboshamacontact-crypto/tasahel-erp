/* المصدر الوحيد لحساب المبيعات/التكلفة/الربح/العمولة بعد الاسترداد.
   أي شاشة بتعرض فلوس تستخدم Money.lineNet / Money.sum بدل ما تجمع l.total الخام.
   القاعدة: استرداد معتمد (كلي/جزئي) بيتخصم، واللي مسترد كليًا بيطلع صفر في المبيعات والتكلفة والعمولة. */
(function () {
  'use strict';
  var n = function (v) { return Number(v) || 0; };

  function lineNet(l) {
    var q = Math.max(0, n(l.qty) || 1);
    var sales = n(l.total);
    var cost = typeof window.execCostOf === 'function' ? window.execCostOf(l) : (n(l.exec_total) || n(l.exec_unit_cost) * q);
    var comm = typeof window.lineComm === 'function' ? n(window.lineComm(l)) : n(l.commission_per_unit) * q;
    var unitComm = q > 0 ? comm / q : 0;
    var out = { qty: q, sales: sales, cost: cost, comm: comm, refunded: 0, full: false, partial: false };
    var rf = typeof window.getLineRefundSummary === 'function' ? window.getLineRefundSummary(l.id) : null;
    if (rf && rf.approvedCount > 0) {
      if (rf.isFull) {
        out.qty = 0; out.sales = 0; out.cost = Math.max(0, cost - n(rf.exec_forfeited)); out.comm = 0;
        out.refunded = sales; out.full = true;
      } else {
        out.qty = Math.max(0, rf.remQty); out.sales = Math.max(0, rf.remSales);
        out.cost = Math.max(0, cost - n(rf.exec_forfeited)); out.comm = unitComm * out.qty;
        out.refunded = n(rf.sales_amount); out.partial = true;
      }
    }
    out.profit = out.sales - out.cost;
    return out;
  }

  function sum(lines) {
    var t = { sales: 0, cost: 0, comm: 0, refunded: 0, profit: 0, qty: 0, lines: 0, orders: 0 }, tx = {};
    (lines || []).forEach(function (l) {
      var x = lineNet(l);
      t.sales += x.sales; t.cost += x.cost; t.comm += x.comm; t.refunded += x.refunded; t.qty += x.qty; t.lines++;
      if (!x.full && l.transaction_id) tx[l.transaction_id] = 1;
    });
    t.orders = Object.keys(tx).length;
    t.profit = t.sales - t.cost;
    return t;
  }

  window.Money = { lineNet: lineNet, sum: sum };
})();
