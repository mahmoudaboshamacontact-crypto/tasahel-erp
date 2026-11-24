// اختبار حسابات الفلوس (js/86-money-core.js) — تشغيل: node --test tests/
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), vm = require('vm'), path = require('path');

function loadMoney(refunds) {
  // refunds: { lineId: { approvedCount, isFull, remQty, remSales, exec_forfeited, sales_amount } }
  const win = {
    execCostOf: l => Number(l.exec_total) || (Number(l.exec_unit_cost) || 0) * (Number(l.qty) || 0),
    lineComm: l => (Number(l.commission_per_unit) || 0) * (Number(l.qty) || 1),
    getLineRefundSummary: id => refunds[id] || { approvedCount: 0 }
  };
  win.window = win;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/86-money-core.js'), 'utf8'), win);
  return win.Money;
}
const line = (o) => Object.assign({ id: 1, transaction_id: 'T1', qty: 2, total: 1000, exec_unit_cost: 300, commission_per_unit: 50 }, o);

test('بدون استرداد: الأرقام زي ما هي', () => {
  const m = loadMoney({}).lineNet(line());
  assert.deepEqual([m.sales, m.cost, m.comm, m.profit, m.refunded], [1000, 600, 100, 400, 0]);
});

test('استرداد كلي مع حق المنفذ: مبيعات وعمولة صفر، والتكلفة بتتشال', () => {
  const M = loadMoney({ 1: { approvedCount: 1, isFull: true, exec_forfeited: 600, sales_amount: 1000 } });
  const m = M.lineNet(line());
  assert.deepEqual([m.sales, m.cost, m.comm, m.refunded, m.full], [0, 0, 0, 1000, true]);
});

test('استرداد كلي من غير حق المنفذ: التكلفة بتفضل (المنفذ اتدفعله)', () => {
  const M = loadMoney({ 1: { approvedCount: 1, isFull: true, exec_forfeited: 0, sales_amount: 1000 } });
  const m = M.lineNet(line());
  assert.deepEqual([m.sales, m.cost, m.comm, m.profit], [0, 600, 0, -600]);
});

test('استرداد جزئي: الكمية والمبيعات والعمولة بالنسبة، وتكلفة المسترد بتتشال', () => {
  const M = loadMoney({ 1: { approvedCount: 1, isFull: false, remQty: 1, remSales: 500, exec_forfeited: 300, sales_amount: 500 } });
  const m = M.lineNet(line());
  assert.deepEqual([m.qty, m.sales, m.cost, m.comm, m.refunded, m.partial], [1, 500, 300, 50, 500, true]);
});

test('المجموع: المعاملة المستردة كليًا مش بتتعد، والباقي بيتجمع صح', () => {
  const M = loadMoney({ 2: { approvedCount: 1, isFull: true, exec_forfeited: 600, sales_amount: 1000 } });
  const t = M.sum([line({ id: 1, transaction_id: 'A' }), line({ id: 2, transaction_id: 'B' })]);
  assert.deepEqual([t.sales, t.cost, t.profit, t.refunded, t.orders, t.lines], [1000, 600, 400, 1000, 1, 2]);
});

test('مفيش بنود: كله صفر', () => {
  const t = loadMoney({}).sum([]);
  assert.deepEqual([t.sales, t.cost, t.profit, t.orders], [0, 0, 0, 0]);
});
