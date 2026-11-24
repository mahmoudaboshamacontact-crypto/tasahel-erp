/* متابعة التشغيل في الداش بورد (للمدير): طابور الشغل، العمر، لكل موظف، لكل نوع طلب، متتبع المناديب.
   كل الأرقام من دالة ops_dashboard (sql/ops-dashboard.sql)؛ البند المسترد كليًا والمناديب مش بيتعدوا. */
(function () {
  'use strict';
  if (window.__opsDash) return; window.__opsDash = 1;
  var range = 'month', pickM = '', seq = 0;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var nf = function (x) { return Number(x || 0).toLocaleString('en-US'); };
  var iso = function (d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  var isMgr = function () { return window.__role === 'manager'; };

  function period() {
    var n = new Date(), t = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    if (range === 'today') return [iso(t), iso(t)];
    if (range === 'week') return [iso(new Date(t.getTime() - 6 * 864e5)), iso(t)];
    if (range === 'pick' && /^\d{4}-\d{2}$/.test(pickM)) {
      var y = +pickM.slice(0, 4), m = +pickM.slice(5, 7) - 1, e = new Date(y, m + 1, 0);
      return [iso(new Date(y, m, 1)), iso(e > t ? t : e)];
    }
    return [iso(new Date(n.getFullYear(), n.getMonth(), 1)), iso(t)];
  }
  var COL = { open: '#0ea5e9', ip: '#f59e0b', rev: '#f43f5e', ready: '#10b981', old: '#8b5cf6' };

  function tile(label, val, color, hint) {
    return '<div class="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3.5"><div class="text-[11px] font-semibold text-slate-500 dark:text-slate-400">' + esc(label) + '</div><div class="mt-1.5 text-3xl font-bold font-mono" dir="ltr" style="color:' + color + '">' + nf(val) + '</div>' + (hint ? '<div class="mt-0.5 text-[10.5px] text-slate-400">' + esc(hint) + '</div>' : '') + '</div>';
  }
  function section(id, title, inner, open) {
    return '<details class="card overflow-hidden" ' + (open ? 'open' : '') + ' data-od="' + id + '"><summary class="flex cursor-pointer items-center justify-between px-4 py-3.5 font-bold text-sm text-ink dark:text-white">' + esc(title) + '<i class="fa-solid fa-chevron-down text-xs text-slate-400"></i></summary><div class="border-t border-slate-100 dark:border-slate-800 p-4 space-y-4">' + inner + '</div></details>';
  }
  function bars(rows, color) {
    var max = Math.max.apply(null, rows.map(function (r) { return r[1]; }).concat([1]));
    return rows.map(function (r) {
      return '<div class="flex items-center gap-2 text-xs"><div class="w-28 shrink-0 truncate text-slate-600 dark:text-slate-300">' + esc(r[0]) + '</div><div class="h-5 flex-1 rounded bg-slate-100 dark:bg-slate-800"><div class="h-5 rounded" style="width:' + Math.max(2, r[1] / max * 100) + '%;background:' + color + '"></div></div><div class="w-10 text-end font-mono font-bold" dir="ltr">' + nf(r[1]) + '</div></div>';
    }).join('');
  }
  function table(id, heads, rows) {
    var h = heads.map(function (x) { return '<th class="px-3 py-2 text-start font-semibold whitespace-nowrap">' + esc(x) + '</th>'; }).join('');
    var b = rows.map(function (r) { return '<tr class="border-t border-slate-100 dark:border-slate-800">' + r.map(function (c, i) { return '<td class="px-3 py-2 whitespace-nowrap ' + (i ? 'font-mono' : 'font-semibold') + '">' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('');
    return '<input type="search" placeholder="بحث في الجدول…" oninput="odFilter(this,\'' + id + '\')" class="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-1.5 text-xs outline-none"><div class="overflow-x-auto"><table id="' + id + '" class="w-full text-xs"><thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-500"><tr>' + h + '</tr></thead><tbody>' + (b || '<tr><td class="px-3 py-6 text-center text-slate-400" colspan="' + heads.length + '">لا توجد بيانات</td></tr>') + '</tbody></table></div>';
  }
  window.odFilter = function (inp, id) {
    var q = String(inp.value || '').trim().toLowerCase();
    Array.prototype.forEach.call(document.querySelectorAll('#' + id + ' tbody tr'), function (tr) { tr.style.display = !q || tr.textContent.toLowerCase().indexOf(q) !== -1 ? '' : 'none'; });
  };

  function build(d) {
    var q = d.queue || {}, a = d.aging || {}, k = d.period_kpi || {}, p = d.period || {};
    var out = '';
    out += section('queue', 'طابور الشغل الحالي (لايف)',
      '<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">' +
      tile('مفتوح للتسليم', q.open, COL.open, nf(q.orders_open) + ' معاملة') + tile('قيد التنفيذ', q.in_progress, COL.ip) + tile('تحت المراجعة', q.under_review, COL.rev) +
      tile('جاهز للتسليم', q.ready, COL.ready) + tile('أقدم مفتوح (يوم)', q.oldest_days, COL.old) + tile('وصلت في الفترة', k.received, COL.open, nf(k.orders) + ' معاملة') + '</div>' +
      '<div class="grid gap-4 lg:grid-cols-2"><div class="space-y-2"><div class="text-xs font-bold text-slate-500">الشغل المفتوح حسب العمر</div>' +
      bars([['أقل من يوم', a.d0], ['1 - 3 أيام', a.d1_3], ['4 - 7 أيام', a.d3_7], ['8 - 14 يوم', a.d7_14], ['أكتر من 14 يوم', a.d14p]], COL.open) + '</div>' +
      '<div class="space-y-2"><div class="text-xs font-bold text-slate-500">الاستلام اليومي في الفترة</div>' + bars((d.daily || []).slice(-14).map(function (x) { return [x.d.slice(5), x.n]; }), COL.ready) + '</div></div>', true);
    out += section('emp', 'الموظفين: الشغل المفتوح وأدائهم',
      table('od-emp', ['الموظف', 'مفتوح', 'قيد التنفيذ', 'مراجعة', 'جاهز', 'أقدم (يوم)', 'استلم في الفترة', 'اتسلم منها'],
        (d.by_employee || []).map(function (x) { return [x.name, x.open, x.in_progress, x.under_review, x.ready, x.oldest, x.received, x.delivered_of_received]; })), true);
    out += section('svc', 'حسب نوع الطلب',
      table('od-svc', ['الخدمة', 'مفتوح', 'قيد التنفيذ', 'جاهز', 'وصل في الفترة'],
        (d.by_service || []).map(function (x) { return [x.name, x.open, x.in_progress, x.ready, x.received]; })), false);
    var run = d.runners || [];
    out += section('run', 'متتبع المناديب (الفترة)',
      table('od-run', ['المندوب', 'استلام', 'تسليم', 'إجمالي الزيارات', 'اتأكدوا'],
        run.map(function (x) { return [x.name, x.pickup, x.delivery, x.total, x.confirmed]; })) +
      '<div class="text-xs font-bold text-slate-500">أسباب إلغاء التيكيتات</div>' +
      table('od-can', ['السبب', 'العدد', 'المناديب'], (d.cancel_reasons || []).map(function (x) { return [x.reason, x.n, x.couriers || '—']; })), false);
    out += '<div class="rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-3 text-[11px] text-slate-500 leading-6">الفترة: ' + esc(p.from) + ' → ' + esc(p.to) + '. ' +
      (k.tracking_since ? 'تسجيل تغيير الحالات شغال من ' + esc(k.tracking_since) + ' — اتسلم في الفترة (من التسجيل): ' + nf(k.delivered_tracked) + '.' : 'تسجيل تغيير الحالات بدأ، وأرقام "اتسلم في الفترة" هتظهر بعد أول تسليمات.') +
      ' البنود المستردة كليًا والمناديب مش محسوبين.</div>';
    return out;
  }

  async function render() {
    var box = $('ops-dash'); if (!box) return;
    if (!isMgr() || typeof sbClient === 'undefined' || !sbClient) { box.innerHTML = ''; return; }
    var my = ++seq, pr = period(), openIds = {};
    Array.prototype.forEach.call(box.querySelectorAll('details'), function (x) { openIds[x.getAttribute('data-od')] = x.open; });
    try {
      var r = await sbClient.rpc('ops_dashboard', { p_from: pr[0], p_to: pr[1] });
      if (my !== seq) return;
      if (r.error || !r.data) { box.innerHTML = '<div class="card p-4 text-xs text-slate-400">شغّل ملف sql/ops-dashboard.sql في Supabase عشان تظهر متابعة التشغيل.</div>'; return; }
      box.innerHTML = '<div class="text-sm font-bold text-ink dark:text-white px-1">متابعة التشغيل</div>' + build(r.data);
      Array.prototype.forEach.call(box.querySelectorAll('details'), function (x) { var id = x.getAttribute('data-od'); if (id in openIds) x.open = openIds[id]; });
    } catch (e) { box.innerHTML = ''; console.warn('ops dash', e); }
  }

  function wrap(name, fn, before) { var o = window[name]; if (typeof o === 'function') window[name] = function () { if (before) { try { fn.apply(this, arguments); } catch (e) { /* */ } } var x = o.apply(this, arguments); if (!before) { try { fn.apply(this, arguments); } catch (e) { /* */ } } return x; }; }
  function fillMonths() {
    var sel = $('dsh-month'); if (!sel || sel.options.length > 1) return;
    var n = new Date(), f = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { month: 'long', year: 'numeric' });
    for (var i = 0; i < 12; i++) { var d = new Date(n.getFullYear(), n.getMonth() - i, 1), o = document.createElement('option'); o.value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); o.textContent = f.format(d); sel.appendChild(o); }
  }
  function boot() {
    wrap('setDashboardRange', function (r) { range = r; if (r !== 'pick') pickM = ''; }, true);
    wrap('setDashboardMonth', function (m) { if (/^\d{4}-\d{2}$/.test(m || '')) { range = 'pick'; pickM = m; } else { range = 'month'; pickM = ''; } }, true);
    fillMonths();
    wrap('renderDashboardMetrics', function () { render(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else setTimeout(boot, 0);
})();
