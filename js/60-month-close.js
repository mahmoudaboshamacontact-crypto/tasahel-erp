/* تقفيل الشهر (الكوميشن والمناديب) — js/60-month-close.js
   شاشة للمدير فقط: فترة من/إلى (الافتراضي الشهر اللي فات)، كروت إجمالية، جدول لكل موظف،
   إجمالي كل خدمة، حالات، مشاوير المناديب (استلام/تسليم) ومكرر، وتصدير Excel بمعادلات جاهزة.
   رسوم التوصيل (خدمات «رسوم توصيل») ليها عرض منفصل بتقفيل أسبوعي وليست جزء من تقفيل الشهر.
   القراءة فقط من request_lines و line_refunds و courier_trips. مفيش كتابة ولا تحديث تلقائي. */
(function () {
  'use strict';
  if (window.__phase60) return; window.__phase60 = true;

  var $ = function (id) { return document.getElementById(id); };
  var eh = function (s) {
    return typeof escapeHtml === 'function' ? escapeHtml(s)
      : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; });
  };
  var BTN_ON = 'tab-btn bg-ink text-white dark:bg-brand-600 shadow-sm';
  var BTN_OFF = 'tab-btn text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800';
  var st = { mode: 'month', from: '', to: '', data: null, loading: false, error: '', closings: [], sqlMissing: false, busy: false };

  function isMgr() { return window.__role === 'manager'; }
  function db() { return typeof sbClient !== 'undefined' ? sbClient : window.sbClient; }
  function toast(m, t) { if (typeof showToast === 'function') showToast(m, t || 'info'); }
  function num(v) { var n = Number(v); return Number.isFinite(n) ? n : 0; }
  function nn(s) { return typeof normName === 'function' ? normName(s) : String(s || '').trim().toLowerCase(); }
  function fmt(n) { return (Math.round(num(n) * 100) / 100).toLocaleString('en-US'); }
  function isFar(svc) { return /^رسوم توصيل/.test(nn(svc)); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function addDays(day, k) { var d = new Date(day + 'T00:00:00'); d.setDate(d.getDate() + k); return ymd(d); }
  function today() { try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date()); } catch (e) { return ymd(new Date()); } }
  function prevMonthRange() {
    var t = new Date(today() + 'T00:00:00');
    var first = new Date(t.getFullYear(), t.getMonth() - 1, 1), last = new Date(t.getFullYear(), t.getMonth(), 0);
    return { from: ymd(first), to: ymd(last) };
  }
  function weekRange() { var t = today(); return { from: addDays(t, -6), to: t }; }

  var STATUS_AR = { 'Delivered': 'تم التسليم', 'Complete': 'مكتمل', 'Under Review': 'تحت المراجعة', 'In Progress': 'قيد التنفيذ' };
  function statusOf(l) {
    var s = l.status || (l.delivered ? 'Delivered' : l.complete ? 'Complete' : l.under_review ? 'Under Review' : 'In Progress');
    return STATUS_AR[s] || String(s);
  }
  function lineComm(l) { return typeof window.lineComm === 'function' ? num(window.lineComm(l)) : 0; }

  /* ---------- جلب البيانات (قراءة فقط) ---------- */
  var LINE_COLS = 'id,employee,qty,total,commission,commission_per_unit,transaction_id,received_at,client_name,phone,service,status,delivered,complete,under_review,executor,exec_unit_cost,exec_total';

  async function fetchLines(from, to) {
    var floor = typeof DATA_FROM_TS !== 'undefined' ? String(DATA_FROM_TS) : '';
    var a = from + 'T00:00:00', b = addDays(to, 1) + 'T00:00:00';
    if (floor && a < floor) a = floor;
    var out = [];
    if (b <= a) return out;
    for (var off = 0; ; off += 1000) {
      var r = await db().from('request_lines').select(LINE_COLS)
        .is('deleted_at', null).gte('received_at', a).lt('received_at', b)
        .order('id', { ascending: true }).range(off, off + 999);
      if (r.error) throw r.error;
      out.push.apply(out, r.data || []);
      if ((r.data || []).length < 1000) break;
    }
    return out;
  }

  async function fetchRefunds(from, to, lineMap) {
    var a = from + 'T00:00:00', b = addDays(to, 1) + 'T00:00:00';
    var r = await db().from('line_refunds')
      .select('id,line_id,kind,qty,sales_amount,unit_comm_hint,status,decided_at')
      .eq('status', 'approved').gte('decided_at', a).lt('decided_at', b);
    if (r.error) return [];
    var refs = r.data || [];
    var missing = [];
    refs.forEach(function (x) { if (x.line_id != null && !lineMap.has(String(x.line_id)) && missing.indexOf(x.line_id) < 0) missing.push(x.line_id); });
    if (missing.length) {
      var lr = await db().from('request_lines').select(LINE_COLS).in('id', missing);
      if (!lr.error) (lr.data || []).forEach(function (l) { lineMap.set(String(l.id), l); });
    }
    return refs;
  }

  async function fetchTrips(from, to) {
    var r = await db().from('courier_trips').select('id,transaction_id,kind,courier,fee,trip_day')
      .gte('trip_day', from).lte('trip_day', to).order('trip_day', { ascending: true });
    if (r.error) throw r.error;
    return r.data || [];
  }

  /* ---------- الحساب ---------- */
  function compute(lines, refunds, trips, lineMap) {
    var rows = [], far = [];
    lines.forEach(function (l) {
      if (isFar(l.service)) { far.push(l); return; }
      var qty = num(l.qty), comm = lineComm(l), rate = qty > 0 ? comm / qty : 0;
      rows.push({
        type: 'بند', day: String(l.received_at || '').slice(0, 10), tx: String(l.transaction_id || ''),
        emp: String(l.employee || '—'), service: String(l.service || ''), qty: qty, sales: num(l.total),
        rate: rate, status: statusOf(l), client: String(l.client_name || ''), phone: String(l.phone || ''), dup: ''
      });
    });
    var refundCount = 0;
    refunds.forEach(function (rf) {
      var o = lineMap.get(String(rf.line_id));
      if (!o || isFar(o.service)) return;
      var rq = num(rf.qty), hint = rf.unit_comm_hint != null && rf.unit_comm_hint !== '' ? rf.unit_comm_hint : o.commission_per_unit;
      var rc = lineComm({ service: o.service, qty: rq, commission_per_unit: hint });
      refundCount++;
      rows.push({
        type: 'استرداد', day: String(rf.decided_at || '').slice(0, 10), tx: String(o.transaction_id || ''),
        emp: String(o.employee || '—'), service: String(o.service || ''), qty: -rq, sales: -num(rf.sales_amount),
        rate: rq > 0 ? rc / rq : 0, status: 'استرداد', client: String(o.client_name || ''), phone: String(o.phone || ''), dup: ''
      });
    });

    /* المكرر: (أ) نفس المعاملة + الخدمة + الكمية + المبلغ. (ب) نفس التليفون + الخدمة + اليوم في معاملتين مختلفتين */
    var A = new Map(), B = new Map();
    rows.forEach(function (r, i) {
      if (r.type !== 'بند') return;
      var ka = [r.tx, nn(r.service), r.qty, r.sales].join('|');
      if (!A.has(ka)) A.set(ka, []); A.get(ka).push(i);
      var ph = r.phone.replace(/\D/g, '');
      if (ph.length >= 6) { var kb = [ph, nn(r.service), r.day].join('|'); if (!B.has(kb)) B.set(kb, []); B.get(kb).push(i); }
    });
    A.forEach(function (ix) { if (ix.length > 1) ix.forEach(function (i) { rows[i].dup = 'مكرر'; }); });
    B.forEach(function (ix) {
      var txs = {}; ix.forEach(function (i) { txs[rows[i].tx] = 1; });
      if (Object.keys(txs).length > 1) ix.forEach(function (i) { if (!rows[i].dup) rows[i].dup = 'محتمل'; });
    });

    function group(keyFn) {
      var m = new Map();
      rows.forEach(function (r) {
        var k = keyFn(r), g = m.get(k);
        if (!g) { g = { key: k, items: 0, lines: 0, qty: 0, sales: 0, comm: 0, counted: 0, uncounted: 0 }; m.set(k, g); }
        g.qty += r.qty; g.sales += r.sales; g.comm += r.qty * r.rate;
        if (r.type === 'بند') { g.lines++; if (r.rate > 0) g.counted++; else g.uncounted++; }
      });
      return Array.from(m.values()).sort(function (a, b) { return b.sales - a.sales; });
    }
    var byEmp = group(function (r) { return r.emp; }), bySvc = group(function (r) { return r.service; });
    var byStatus = {};
    rows.forEach(function (r) { if (r.type === 'بند') byStatus[r.status] = (byStatus[r.status] || 0) + 1; });

    var couriers = new Map(), noCourier = 0;
    trips.forEach(function (t) {
      var c = String(t.courier || '').trim();
      if (!c || c === '—') { noCourier++; return; }
      var g = couriers.get(c); if (!g) { g = { name: c, pickup: 0, delivery: 0, fee: 0 }; couriers.set(c, g); }
      if (t.kind === 'pickup') g.pickup++; else g.delivery++;
      g.fee += num(t.fee);
    });
    var namedTrips = trips.filter(function (t) { var c = String(t.courier || '').trim(); return c && c !== '—'; });

    var itemRows = rows.filter(function (r) { return r.type === 'بند'; });
    var farRows = far.map(function (l) {
      return { day: String(l.received_at || '').slice(0, 10), tx: String(l.transaction_id || ''), courier: String(l.executor || '—'),
        service: String(l.service || ''), qty: num(l.qty), fee: num(l.exec_total) || num(l.qty) * num(l.exec_unit_cost), client: String(l.client_name || '') };
    });
    return {
      rows: rows, byEmp: byEmp, bySvc: bySvc, byStatus: byStatus,
      couriers: Array.from(couriers.values()).sort(function (a, b) { return (b.pickup + b.delivery) - (a.pickup + a.delivery); }),
      trips: namedTrips, noCourier: noCourier, far: farRows,
      tot: {
        lines: itemRows.length, sales: rows.reduce(function (a, r) { return a + r.sales; }, 0),
        comm: rows.reduce(function (a, r) { return a + r.qty * r.rate; }, 0),
        itemsSales: itemRows.reduce(function (a, r) { return a + r.sales; }, 0),
        counted: itemRows.filter(function (r) { return r.rate > 0; }).length,
        uncounted: itemRows.filter(function (r) { return !(r.rate > 0); }).length,
        pickup: namedTrips.filter(function (t) { return t.kind === 'pickup'; }).length,
        delivery: namedTrips.filter(function (t) { return t.kind !== 'pickup'; }).length,
        dupSure: itemRows.filter(function (r) { return r.dup === 'مكرر'; }).length,
        dupMaybe: itemRows.filter(function (r) { return r.dup === 'محتمل'; }).length,
        refunds: refundCount, far: farRows.length, farFee: farRows.reduce(function (a, r) { return a + r.fee; }, 0)
      }
    };
  }

  /* ---------- اعتماد التقفيل (sql/part-n-month-closing.sql) ---------- */
  async function fetchClosings() {
    st.closings = []; st.sqlMissing = false;
    try {
      var r = await db().from('month_closings')
        .select('id,period_from,period_to,summary,lines_count,items_sales,note,closed_by_name,closed_at,reopened_at,reopen_reason')
        .order('closed_at', { ascending: false }).limit(24);
      if (r.error) {
        var m = String(r.error.message || '') + ' ' + String(r.error.code || '');
        if (/42P01|does not exist|schema cache|relation/i.test(m)) st.sqlMissing = true;
        return;
      }
      st.closings = r.data || [];
    } catch (e) { /* الميزة اختيارية، الشاشة تكمل من غيرها */ }
  }
  function activeFor(from, to) {
    var out = { exact: null, overlap: null };
    st.closings.forEach(function (c) {
      if (c.reopened_at) return;
      if (c.period_from === from && c.period_to === to) out.exact = c;
      else if (c.period_from <= to && c.period_to >= from) out.overlap = out.overlap || c;
    });
    return out;
  }
  function r2(n) { return Math.round(num(n) * 100) / 100; }
  function buildSummary(d) {
    var t = d.tot;
    return {
      version: 1, period: d.period, generated_at: new Date().toISOString(),
      data_from: typeof DATA_FROM !== 'undefined' ? String(DATA_FROM) : null,
      lines_count: t.lines, items_sales: r2(t.itemsSales),
      totals: { sales: r2(t.sales), commission: r2(t.comm), counted: t.counted, uncounted: t.uncounted, pickup: t.pickup, delivery: t.delivery, dup_sure: t.dupSure, dup_maybe: t.dupMaybe, refunds: t.refunds },
      employees: d.byEmp.map(function (g) { return { name: g.key, lines: g.lines, qty: r2(g.qty), sales: r2(g.sales), commission: r2(g.comm), counted: g.counted, uncounted: g.uncounted }; }),
      services: d.bySvc.map(function (g) { return { name: g.key, counted: g.counted > 0, lines: g.lines, qty: r2(g.qty), sales: r2(g.sales), commission: r2(g.comm) }; }),
      statuses: d.byStatus,
      couriers: d.couriers.map(function (g) { return { name: g.name, pickup: g.pickup, delivery: g.delivery, fee: r2(g.fee) }; })
    };
  }
  async function doClose() {
    if (st.busy || !st.data || st.mode !== 'month') return;
    var note = '';
    var ok = window.confirm('هتعتمد تقفيل الفترة ' + st.from + ' → ' + st.to + '\n\nبعد الاعتماد مينفعش تعديل (الموظف، الخدمة، الكمية، المبلغ، العمولة، التاريخ) لبنود الفترة دي، ولا إضافة أو حذف بنود فيها، إلا بإعادة فتح التقفيل بسبب مكتوب.\nتغيير الحالة والتسليم وبيانات العميل هيفضل شغال.\n\nتكمل؟');
    if (!ok) return;
    note = window.prompt('ملاحظة على التقفيل (اختياري):', '') || '';
    st.busy = true; render();
    try {
      var r = await db().rpc('close_month', { p_from: st.from, p_to: st.to, p_summary: buildSummary(st.data), p_note: note.trim() || null });
      if (r.error) throw r.error;
      toast('تم اعتماد التقفيل ✅', 'success');
      await fetchClosings();
    } catch (e) {
      console.warn('p60 close', e);
      toast(String((e && e.message) || e).slice(0, 220), 'error');
    }
    st.busy = false; render();
  }
  async function doReopen(id) {
    if (st.busy || !id) return;
    var reason = window.prompt('سبب إعادة فتح التقفيل (5 حروف على الأقل):', '');
    if (reason == null) return;
    st.busy = true; render();
    try {
      var r = await db().rpc('reopen_month_closing', { p_id: id, p_reason: reason.trim() });
      if (r.error) throw r.error;
      toast('اتفتح التقفيل. الفترة بقت قابلة للتعديل.', 'success');
      await fetchClosings();
    } catch (e) {
      console.warn('p60 reopen', e);
      toast(String((e && e.message) || e).slice(0, 220), 'error');
    }
    st.busy = false; render();
  }

  async function load() {
    if (st.loading) return;
    if (!db()) { st.error = 'مفيش اتصال بقاعدة البيانات'; return render(); }
    if (!st.from || !st.to || st.from > st.to) { toast('اختار فترة صحيحة (من قبل إلى)', 'error'); return; }
    st.loading = true; st.error = ''; render();
    try {
      var lines = await fetchLines(st.from, st.to);
      var lineMap = new Map(); lines.forEach(function (l) { lineMap.set(String(l.id), l); });
      var refunds = await fetchRefunds(st.from, st.to, lineMap);
      var trips = st.mode === 'month' ? await fetchTrips(st.from, st.to) : [];
      st.data = compute(lines, refunds, trips, lineMap);
      st.data.period = st.from + ' → ' + st.to;
      if (st.mode === 'month') await fetchClosings();
    } catch (e) {
      console.warn('p60 load', e); st.data = null;
      st.error = 'تعذّر تحميل البيانات: ' + String((e && e.message) || e).slice(0, 160);
    }
    st.loading = false; render();
  }

  /* ---------- الواجهة ---------- */
  function card(label, value, sub, cls) {
    return '<div class="p60-card' + (cls ? ' ' + cls : '') + '"><div class="p60-k">' + eh(label) + '</div><div class="p60-v">' + eh(value) + '</div>' + (sub ? '<div class="p60-s">' + eh(sub) + '</div>' : '') + '</div>';
  }
  function table(head, rowsHtml, foot) {
    return '<div class="p60-tw"><table class="p60-t"><thead><tr>' + head.map(function (h) { return '<th>' + eh(h) + '</th>'; }).join('') + '</tr></thead><tbody>' + rowsHtml + '</tbody>' + (foot || '') + '</table></div>';
  }
  function tr(cells) { return '<tr>' + cells.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; }
  function section(title, body) { return '<section class="p60-sec"><h3>' + eh(title) + '</h3>' + body + '</section>'; }

  function closeBanner(d) {
    var t = d.tot, a;
    if (st.sqlMissing) return '<div class="p60-ban p60-ban-info"><div>اعتماد التقفيل مش مفعّل لسه. شغّل الملف <b>sql/part-n-month-closing.sql</b> في Supabase (SQL Editor) مرة واحدة.</div></div>';
    a = activeFor(st.from, st.to);
    if (a.exact) {
      var c = a.exact, same = Number(c.lines_count) === t.lines && Math.abs(num(c.items_sales) - t.itemsSales) <= 0.01;
      return '<div class="p60-ban p60-ban-ok"><div><b>✅ التقفيل معتمد</b> — ' + eh(String(c.closed_at || '').slice(0, 10)) + (c.closed_by_name ? ' بواسطة ' + eh(c.closed_by_name) : '') + (c.note ? '<br><span>' + eh(c.note) + '</span>' : '') +
        '</div><button type="button" class="p60-btn p60-ghost" data-p60-reopen="' + eh(c.id) + '"' + (st.busy ? ' disabled' : '') + '>إعادة فتح</button></div>' +
        (same ? '' : '<div class="p60-ban p60-ban-bad"><div>⚠️ الأرقام الحالية (' + t.lines + ' بند / ' + fmt(t.itemsSales) + ') مختلفة عن المعتمدة (' + eh(c.lines_count) + ' بند / ' + fmt(c.items_sales) + '). ممكن بنود اتأرشفت أو اتغيّرت بعد الاعتماد.</div></div>');
    }
    if (a.overlap) return '<div class="p60-ban p60-ban-warn"><div>الفترة دي بتتداخل مع تقفيل معتمد (' + eh(a.overlap.period_from) + ' → ' + eh(a.overlap.period_to) + '). اختار نفس الفترة بالظبط، أو افتح التقفيل القديم الأول.</div></div>';
    if (st.to >= today()) return '<div class="p60-ban p60-ban-info"><div>الفترة لسه ما خلصتش. تقدر تعتمدها بعد آخر يوم فيها.</div></div>';
    return '<div class="p60-ban p60-ban-warn"><div>التقفيل ده <b>غير معتمد</b> لسه. راجع الأرقام، وبعدين اعتمده عشان يتقفل.</div><button type="button" class="p60-btn" id="p60-close"' + (st.busy ? ' disabled' : '') + '>اعتماد التقفيل</button></div>';
  }
  function closingsHtml() {
    if (!st.closings.length) return '';
    return section('التقفيلات السابقة', table(['الفترة', 'الحالة', 'بواسطة', 'تاريخ الاعتماد', 'البنود', 'المبيعات', 'ملاحظة'],
      st.closings.map(function (c) {
        return tr([eh(c.period_from) + ' → ' + eh(c.period_to), c.reopened_at ? 'اتفتح: ' + eh(c.reopen_reason || '') : 'معتمد', eh(c.closed_by_name || '—'), eh(String(c.closed_at || '').slice(0, 10)), eh(c.lines_count), fmt(c.items_sales), eh(c.note || '')]);
      }).join('')));
  }

  function monthHtml(d) {
    var t = d.tot, h = closeBanner(d);
    h += '<div class="p60-cards">' +
      card('إجمالي البنود', t.lines, 'بدون رسوم التوصيل') +
      card('إجمالي المبيعات', fmt(t.sales), 'بعد خصم الاستردادات') +
      card('إجمالي العمولة', fmt(t.comm), 'صافي بعد الاستردادات', 'p60-acc') +
      card('محسوبة بعمولة', t.counted, 'بند') +
      card('غير محسوبة', t.uncounted, 'بند (بدون عمولة)') +
      card('مشاوير استلام', t.pickup, 'مندوب مسجّل') +
      card('مشاوير تسليم', t.delivery, 'مندوب مسجّل') +
      card('مكرر مؤكد', t.dupSure, 'نفس المعاملة والخدمة والمبلغ', t.dupSure ? 'p60-bad' : '') +
      card('تكرار محتمل', t.dupMaybe, 'نفس التليفون والخدمة واليوم', t.dupMaybe ? 'p60-warn' : '') +
      card('استردادات', t.refunds, 'اتخصمت من العمولة') + '</div>';
    h += section('الموظفين', table(['الموظف', 'عدد البنود', 'الكمية', 'المبيعات', 'العمولة', 'محسوبة', 'غير محسوبة'],
      d.byEmp.map(function (g) { return tr([eh(g.key), g.lines, fmt(g.qty), fmt(g.sales), '<b>' + fmt(g.comm) + '</b>', g.counted, g.uncounted]); }).join('') || '<tr><td colspan="7">مفيش بيانات</td></tr>'));
    h += section('إجمالي كل خدمة', table(['الخدمة', 'محسوبة بعمولة؟', 'عدد البنود', 'الكمية', 'المبيعات', 'العمولة'],
      d.bySvc.map(function (g) { return tr([eh(g.key), g.counted > 0 ? 'نعم' : 'لا', g.lines, fmt(g.qty), fmt(g.sales), fmt(g.comm)]); }).join('') || '<tr><td colspan="6">مفيش بيانات</td></tr>'));
    h += section('الحالات', table(['الحالة', 'عدد البنود'],
      Object.keys(d.byStatus).map(function (k) { return tr([eh(k), d.byStatus[k]]); }).join('') || '<tr><td colspan="2">مفيش بيانات</td></tr>'));
    h += section('مشاوير المناديب (استلام وتسليم)', table(['المندوب', 'استلام', 'تسليم', 'الإجمالي', 'رسوم المشاوير'],
      d.couriers.map(function (g) { return tr([eh(g.name), g.pickup, g.delivery, g.pickup + g.delivery, fmt(g.fee)]); }).join('') || '<tr><td colspan="5">مفيش مشاوير في الفترة دي</td></tr>') +
      (d.noCourier ? '<p class="p60-note">فيه ' + d.noCourier + ' مشوار من غير مندوب مسجّل (مش محسوب فوق).</p>' : ''));
    var dups = d.rows.filter(function (r) { return r.dup; });
    h += section('المكرر (' + dups.length + ')', dups.length ? table(['النوع', 'التاريخ', 'المعاملة', 'الموظف', 'الخدمة', 'الكمية', 'المبلغ'],
      dups.slice(0, 200).map(function (r) { return tr([eh(r.dup), eh(r.day), eh(r.tx), eh(r.emp), eh(r.service), r.qty, fmt(r.sales)]); }).join('')) +
      (dups.length > 200 ? '<p class="p60-note">معروض أول 200 فقط، الباقي في ملف Excel.</p>' : '') : '<p class="p60-note">مفيش تكرار في الفترة دي ✅</p>');
    return h + closingsHtml();
  }

  function feesHtml(d) {
    var by = new Map();
    d.far.forEach(function (r) { var g = by.get(r.courier); if (!g) { g = { name: r.courier, n: 0, qty: 0, fee: 0 }; by.set(r.courier, g); } g.n++; g.qty += r.qty; g.fee += r.fee; });
    var list = Array.from(by.values()).sort(function (a, b) { return b.fee - a.fee; });
    var h = '<div class="p60-cards">' + card('بنود رسوم التوصيل', d.tot.far, 'في الفترة') + card('إجمالي الرسوم', fmt(d.tot.farFee), 'تكلفة المندوب', 'p60-acc') + '</div>';
    h += section('لكل مندوب', table(['المندوب', 'عدد البنود', 'الكمية', 'الرسوم'],
      list.map(function (g) { return tr([eh(g.name), g.n, fmt(g.qty), '<b>' + fmt(g.fee) + '</b>']); }).join('') || '<tr><td colspan="4">مفيش رسوم توصيل في الفترة دي</td></tr>'));
    h += section('التفاصيل', table(['التاريخ', 'المعاملة', 'المندوب', 'الخدمة', 'الكمية', 'الرسوم'],
      d.far.slice(0, 300).map(function (r) { return tr([eh(r.day), eh(r.tx), eh(r.courier), eh(r.service), r.qty, fmt(r.fee)]); }).join('') || '<tr><td colspan="6">—</td></tr>') +
      (d.far.length > 300 ? '<p class="p60-note">معروض أول 300 فقط، الباقي في ملف Excel.</p>' : ''));
    return h;
  }

  function render() {
    var pane = $('tab-monthclose'); if (!pane) return;
    if (!isMgr()) { pane.innerHTML = '<div class="p60-note">الشاشة دي للمدير فقط.</div>'; return; }
    var head = '<div class="p60-head"><div class="p60-title"><i class="fa-solid fa-lock"></i><div><h2>تقفيل الشهر</h2><p>الكوميشن ومشاوير المناديب — قراءة فقط</p></div></div>' +
      '<div class="p60-modes"><button type="button" class="p60-mode' + (st.mode === 'month' ? ' on' : '') + '" data-p60-mode="month">التقفيل الشهري</button>' +
      '<button type="button" class="p60-mode' + (st.mode === 'fees' ? ' on' : '') + '" data-p60-mode="fees">رسوم التوصيل (أسبوعي)</button></div>' +
      '<div class="p60-form"><label>من<input type="date" id="p60-from" value="' + eh(st.from) + '"></label><label>إلى<input type="date" id="p60-to" value="' + eh(st.to) + '"></label>' +
      '<button type="button" class="p60-btn" id="p60-go"' + (st.loading ? ' disabled' : '') + '><i class="fa-solid fa-rotate"></i> ' + (st.loading ? 'جارٍ التحميل...' : 'عرض') + '</button>' +
      '<button type="button" class="p60-btn p60-xl" id="p60-xl"' + (st.data && !st.loading ? '' : ' disabled') + '><i class="fa-solid fa-file-excel"></i> تصدير Excel</button></div></div>';
    var body = st.error ? '<div class="p60-note p60-bad-t">' + eh(st.error) + '</div>'
      : st.loading ? '<div class="p60-note">جارٍ تحميل البيانات...</div>'
      : !st.data ? '<div class="p60-note">اختار الفترة واضغط «عرض».</div>'
      : (st.mode === 'month' ? monthHtml(st.data) : feesHtml(st.data));
    pane.innerHTML = head + body;
  }

  /* ---------- تصدير Excel (ExcelJS محلي، بمعادلات) ---------- */
  var xlp = null;
  function loadXL() {
    if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
    if (xlp) return xlp;
    xlp = new Promise(function (ok, no) {
      var s = document.createElement('script'); s.src = 'js/vendor/exceljs-4.4.0.min.js';
      s.onload = function () { window.ExcelJS ? ok(window.ExcelJS) : no(new Error('ExcelJS')); };
      s.onerror = function () { xlp = null; no(new Error('load')); };
      document.head.appendChild(s);
    });
    return xlp;
  }
  var ORANGE = 'FFE8590C', GREY = 'FFF4EDE5';
  function head(ws, row) {
    ws.getRow(row).eachCell(function (c) {
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ORANGE } };
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
  }
  function totalRow(ws, row) {
    ws.getRow(row).eachCell(function (c) { c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREY } }; });
  }
  function newSheet(wb, name, widths) {
    var ws = wb.addWorksheet(name, { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
    ws.columns = widths.map(function (w) { return { width: w }; });
    return ws;
  }
  function safeName(s, used) {
    var n = String(s || 'موظف').replace(/[\\\/*?:\[\]]/g, ' ').trim().slice(0, 28) || 'موظف', k = n, i = 2;
    while (used[k]) { k = n.slice(0, 26) + ' ' + i++; }
    used[k] = 1; return k;
  }
  function q(name) { return "'" + name.replace(/'/g, "''") + "'"; }
  var MONEY = '#,##0.00';
  function tabc(ws, argb) { try { ws.properties.tabColor = { argb: argb }; } catch (e) { /* */ } }
  function section(ws, text) {
    var r = ws.addRow([text]); r.font = { bold: true, size: 12, color: { argb: 'FFE8590C' } }; return r;
  }
  /* شيت "اقرأني أولاً": شرح بالبلدي لكل شيت ومصطلح */
  function readMe(wb, period) {
    var w = wb.addWorksheet('اقرأني أولاً', { views: [{ rightToLeft: true, showGridLines: false }] });
    w.columns = [{ width: 24 }, { width: 70 }, { width: 22 }];
    tabc(w, 'FF1B1511');
    var t = w.addRow(['إزاي تقرأ ملف تقفيل الشهر']); t.font = { bold: true, size: 16 };
    w.addRow(['الفترة: ' + period]);
    w.addRow(['ابدأ بشيت "ملخص" — فيه الأرقام الكبيرة. لو عايز تراجع رقم، افتح "كل البنود": كل أرقام الشيتات التانية معادلات منه.']);
    w.addRow([]);
    var h = w.addRow(['الشيت', 'بيجاوب على إيه', 'مين يهتم بيه']); head(w, h.number);
    [['ملخص', 'الأرقام الرئيسية للشهر (بنود، مبيعات، عمولة، استردادات) + أداء كل موظف + حالات المعاملات + المكرر', 'المدير'],
     ['الخدمات', 'كل خدمة اتباعت كام مرة ودخّلت كام، وهل عليها عمولة', 'المدير'],
     ['المناديب', 'عدد مشاوير الاستلام والتسليم لكل مندوب ورسومها', 'المدير + المندوب'],
     ['كل البنود', 'كل بند في الشهر سطر بسطر. ده المرجع الأساسي (بتقدر تفلتر بالموظف أو الخدمة)', 'للمراجعة'],
     ['المشاوير', 'قايمة المشاوير سطر بسطر (يوم، معاملة، مندوب، نوع، رسوم)', 'للمراجعة'],
     ['المكرر', 'البنود اللي شكلها متكررة عشان تتأكد منها قبل ما تعتمد التقفيل', 'المدير'],
     ['شيت باسم كل موظف', 'بنود الموظف لوحده وعمولته، عشان يراجع شغله', 'الموظف']].forEach(function (r) { var x = w.addRow(r); x.alignment = { wrapText: true, vertical: 'top' }; x.getCell(1).font = { bold: true }; });
    w.addRow([]);
    var g = w.addRow(['معنى الكلمات']); g.font = { bold: true, size: 12 };
    var h2 = w.addRow(['الكلمة', 'معناها']); head(w, h2.number);
    [['بند', 'خدمة واحدة جوه معاملة (المعاملة الواحدة ممكن يكون فيها أكتر من بند)'],
     ['العمولة', 'الكمية × عمولة الوحدة للخدمة. لو عمولة الوحدة صفر، مفيش عمولة على البند'],
     ['بنود بعمولة', 'البنود اللي عمولة وحدتها أكبر من صفر. وبنود بدون عمولة هي الباقي (زي رسوم التوصيل)'],
     ['الاستردادات', 'بتتخصم من المبيعات والعمولة (بتظهر بالسالب)'],
     ['مكرر مؤكد', 'نفس المعاملة والخدمة والمبلغ اتسجلت مرتين'],
     ['تكرار محتمل', 'نفس التليفون والخدمة والمبلغ في نفس اليوم تقريباً. راجعه بنفسك'],
     ['رسوم التوصيل', 'مش داخلة هنا. ليها تقفيل أسبوعي منفصل']].forEach(function (r) { var x = w.addRow(r); x.alignment = { wrapText: true, vertical: 'top' }; x.getCell(1).font = { bold: true }; });
    return w;
  }

  async function exportMonth() {
    var d = st.data, XL = await loadXL(), wb = new XL.Workbook();
    wb.creator = 'Tasahel ERP'; wb.created = new Date();
    var used = { 'ملخص': 1, 'كل البنود': 1, 'المشاوير': 1, 'المكرر': 1, 'الخدمات': 1, 'المناديب': 1, 'اقرأني أولاً': 1 };
    readMe(wb, d.period);

    /* كل البنود */
    var wa = newSheet(wb, 'كل البنود', [12, 16, 18, 28, 9, 13, 12, 13, 12, 14, 10, 10, 22]); tabc(wa, 'FF8D857C');
    wa.addRow(['التاريخ', 'المعاملة', 'الموظف', 'الخدمة', 'الكمية', 'المبيعات', 'عمولة الوحدة', 'العمولة', 'محسوبة بعمولة', 'الحالة', 'النوع', 'تكرار', 'العميل']); head(wa, 1);
    var rows = d.rows.slice().sort(function (a, b) { return (a.emp + a.day).localeCompare(b.emp + b.day); });
    rows.forEach(function (r, i) {
      var n = i + 2;
      wa.addRow([r.day, r.tx, r.emp, r.service, r.qty, r.sales, r.rate, { formula: 'E' + n + '*G' + n }, { formula: 'IF(G' + n + '>0,"نعم","لا")' }, r.status, r.type, r.dup, r.client]);
      wa.getCell('F' + n).numFmt = MONEY; wa.getCell('G' + n).numFmt = MONEY; wa.getCell('H' + n).numFmt = MONEY;
    });
    var last = Math.max(rows.length + 1, 2);
    wa.autoFilter = { from: 'A1', to: 'M' + last };
    var R = function (col) { return "'كل البنود'!$" + col + '$2:$' + col + '$' + last; };

    /* ملخص */
    var ws = newSheet(wb, 'ملخص', [30, 14, 12, 14, 14, 16, 16]); tabc(ws, 'FFE8590C');
    ws.views = [{ rightToLeft: true }];
    ws.addRow(['تقفيل الشهر — ' + d.period]); ws.getRow(1).font = { bold: true, size: 14 };
    ws.addRow(['رسوم التوصيل غير مشمولة هنا (ليها تقفيل أسبوعي منفصل). الاستردادات داخلة بالسالب.']);
    var cl = activeFor(st.from, st.to).exact;
    ws.addRow([cl ? 'حالة التقفيل: معتمد بتاريخ ' + String(cl.closed_at || '').slice(0, 10) + (cl.closed_by_name ? ' — ' + cl.closed_by_name : '') : 'حالة التقفيل: غير معتمد']);
    ws.addRow([]);
    section(ws, 'الأرقام الرئيسية');
    var kp = [['إجمالي البنود', 'COUNTIF(' + R('K') + ',"بند")', 0], ['إجمالي المبيعات (بعد الاستردادات)', 'SUM(' + R('F') + ')', 1],
              ['إجمالي العمولة', 'SUM(' + R('H') + ')', 1], ['عدد الاستردادات', 'COUNTIF(' + R('K') + ',"استرداد")', 0]];
    kp.forEach(function (k) { var rr = ws.addRow([k[0], { formula: k[1] }]); rr.getCell(1).font = { bold: true }; rr.getCell(2).font = { bold: true, size: 12 }; if (k[2]) rr.getCell(2).numFmt = MONEY; });
    ws.addRow([]);
    section(ws, 'أداء كل موظف');
    var r0 = ws.addRow(['الموظف', 'عدد البنود', 'الكمية', 'المبيعات', 'العمولة', 'بنود بعمولة', 'بنود بدون عمولة']).number; head(ws, r0);
    var e1 = r0 + 1;
    d.byEmp.forEach(function (g) {
      var n = ws.rowCount + 1;
      ws.addRow([g.key,
        { formula: 'COUNTIFS(' + R('C') + ',A' + n + ',' + R('K') + ',"بند")' },
        { formula: 'SUMIFS(' + R('E') + ',' + R('C') + ',A' + n + ')' },
        { formula: 'SUMIFS(' + R('F') + ',' + R('C') + ',A' + n + ')' },
        { formula: 'SUMIFS(' + R('H') + ',' + R('C') + ',A' + n + ')' },
        { formula: 'COUNTIFS(' + R('C') + ',A' + n + ',' + R('K') + ',"بند",' + R('I') + ',"نعم")' },
        { formula: 'COUNTIFS(' + R('C') + ',A' + n + ',' + R('K') + ',"بند",' + R('I') + ',"لا")' }]);
      ['D', 'E'].forEach(function (c) { ws.getCell(c + n).numFmt = MONEY; });
    });
    var e2 = ws.rowCount, tn = e2 + 1;
    ws.addRow(['الإجمالي'].concat(['B', 'C', 'D', 'E', 'F', 'G'].map(function (c) { return { formula: 'SUM(' + c + e1 + ':' + c + e2 + ')' }; })));
    ['D', 'E'].forEach(function (c) { ws.getCell(c + tn).numFmt = MONEY; }); totalRow(ws, tn);

    var wv = newSheet(wb, 'الخدمات', [34, 16, 12, 12, 14, 14]); tabc(wv, 'FFE8590C'); wv.views = [{ rightToLeft: true }];
    var s0 = wv.addRow(['الخدمة', 'عليها عمولة؟', 'عدد البنود', 'الكمية', 'المبيعات', 'العمولة']).number; head(wv, s0);
    var sv1 = s0 + 1;
    d.bySvc.forEach(function (g) {
      var n = wv.rowCount + 1;
      wv.addRow([g.key, g.counted > 0 ? 'نعم' : 'لا',
        { formula: 'COUNTIFS(' + R('D') + ',A' + n + ',' + R('K') + ',"بند")' },
        { formula: 'SUMIFS(' + R('E') + ',' + R('D') + ',A' + n + ')' },
        { formula: 'SUMIFS(' + R('F') + ',' + R('D') + ',A' + n + ')' },
        { formula: 'SUMIFS(' + R('H') + ',' + R('D') + ',A' + n + ')' }]);
      ['E', 'F'].forEach(function (c) { wv.getCell(c + n).numFmt = MONEY; });
    });
    var sv2 = wv.rowCount, stn = sv2 + 1;
    wv.addRow(['الإجمالي', ''].concat(['C', 'D', 'E', 'F'].map(function (c) { return { formula: 'SUM(' + c + sv1 + ':' + c + sv2 + ')' }; })));
    ['E', 'F'].forEach(function (c) { wv.getCell(c + stn).numFmt = MONEY; }); totalRow(wv, stn);

    ws.addRow([]);
    section(ws, 'حالات البنود');
    var t0 = ws.addRow(['الحالة', 'عدد البنود']).number; head(ws, t0);
    Object.keys(d.byStatus).forEach(function (k) {
      var n = ws.rowCount + 1;
      ws.addRow([k, { formula: 'COUNTIFS(' + R('J') + ',A' + n + ',' + R('K') + ',"بند")' }]);
    });
    ws.addRow([]);
    section(ws, 'المكرر (راجعه قبل الاعتماد)');
    var d0 = ws.addRow(['النوع', 'العدد']).number; head(ws, d0);
    ws.addRow(['مكرر مؤكد', { formula: 'COUNTIF(' + R('L') + ',"مكرر")' }]);
    ws.addRow(['تكرار محتمل', { formula: 'COUNTIF(' + R('L') + ',"محتمل")' }]);

    /* المشاوير */
    var wt = newSheet(wb, 'المشاوير', [12, 16, 18, 12, 12]); tabc(wt, 'FF8D857C');
    wt.addRow(['اليوم', 'المعاملة', 'المندوب', 'النوع', 'الرسوم']); head(wt, 1);
    d.trips.forEach(function (t, i) {
      wt.addRow([String(t.trip_day || ''), String(t.transaction_id || ''), String(t.courier || ''), t.kind === 'pickup' ? 'استلام' : 'تسليم', num(t.fee)]);
      wt.getCell('E' + (i + 2)).numFmt = MONEY;
    });
    var tl = Math.max(d.trips.length + 1, 2);
    var T = function (col) { return "'المشاوير'!$" + col + '$2:$' + col + '$' + tl; };
    var wc = newSheet(wb, 'المناديب', [26, 16, 16, 12, 16]); tabc(wc, 'FFE8590C'); wc.views = [{ rightToLeft: true }];
    var c0 = wc.addRow(['المندوب', 'مشاوير استلام', 'مشاوير تسليم', 'الإجمالي', 'رسوم المشاوير']).number; head(wc, c0);
    var c1 = c0 + 1;
    d.couriers.forEach(function (g) {
      var n = wc.rowCount + 1;
      wc.addRow([g.name,
        { formula: 'COUNTIFS(' + T('C') + ',A' + n + ',' + T('D') + ',"استلام")' },
        { formula: 'COUNTIFS(' + T('C') + ',A' + n + ',' + T('D') + ',"تسليم")' },
        { formula: 'B' + n + '+C' + n },
        { formula: 'SUMIFS(' + T('E') + ',' + T('C') + ',A' + n + ')' }]);
      wc.getCell('E' + n).numFmt = MONEY;
    });
    if (d.couriers.length) {
      var c2 = wc.rowCount, ctn = c2 + 1;
      wc.addRow(['الإجمالي'].concat(['B', 'C', 'D', 'E'].map(function (c) { return { formula: 'SUM(' + c + c1 + ':' + c + c2 + ')' }; })));
      wc.getCell('E' + ctn).numFmt = MONEY; totalRow(wc, ctn);
    }

    /* المكرر */
    var wd = newSheet(wb, 'المكرر', [10, 12, 16, 18, 28, 9, 13, 16]); tabc(wd, 'FF8D857C');
    wd.addRow(['النوع', 'التاريخ', 'المعاملة', 'الموظف', 'الخدمة', 'الكمية', 'المبلغ', 'التليفون']); head(wd, 1);
    d.rows.filter(function (r) { return r.dup; }).forEach(function (r, i) {
      wd.addRow([r.dup, r.day, r.tx, r.emp, r.service, r.qty, r.sales, r.phone]); wd.getCell('G' + (i + 2)).numFmt = MONEY;
    });

    /* شيت لكل موظف */
    d.byEmp.forEach(function (g) {
      var we = newSheet(wb, safeName(g.key, used), [12, 16, 28, 9, 13, 12, 13, 12, 14]); tabc(we, 'FF2E9E6B');
      we.addRow(['التاريخ', 'المعاملة', 'الخدمة', 'الكمية', 'المبيعات', 'عمولة الوحدة', 'العمولة', 'النوع', 'الحالة']); head(we, 1);
      var mine = d.rows.filter(function (r) { return r.emp === g.key; }).sort(function (a, b) { return a.day.localeCompare(b.day); });
      mine.forEach(function (r, i) {
        var n = i + 2;
        we.addRow([r.day, r.tx, r.service, r.qty, r.sales, r.rate, { formula: 'D' + n + '*F' + n }, r.type, r.status]);
        ['E', 'F', 'G'].forEach(function (c) { we.getCell(c + n).numFmt = MONEY; });
      });
      var tn2 = mine.length + 2;
      we.addRow(['الإجمالي', '', '', { formula: 'SUM(D2:D' + (tn2 - 1) + ')' }, { formula: 'SUM(E2:E' + (tn2 - 1) + ')' }, '', { formula: 'SUM(G2:G' + (tn2 - 1) + ')' }]);
      ['E', 'G'].forEach(function (c) { we.getCell(c + tn2).numFmt = MONEY; }); totalRow(we, tn2);
    });

    var ORD = { 'اقرأني أولاً': 0, 'ملخص': 1, 'الخدمات': 2, 'المناديب': 3, 'كل البنود': 4, 'المشاوير': 5, 'المكرر': 6 };
    wb.worksheets.forEach(function (w, i) { w.orderNo = (w.name in ORD ? ORD[w.name] : 9) * 1000 + i; });
    await download(wb, 'تقفيل-الشهر_' + st.from + '_' + st.to + '.xlsx');
  }

  async function exportFees() {
    var d = st.data, XL = await loadXL(), wb = new XL.Workbook(); wb.creator = 'Tasahel ERP';
    var wd = newSheet(wb, 'التفاصيل', [12, 16, 18, 28, 9, 13, 22]);
    wd.addRow(['التاريخ', 'المعاملة', 'المندوب', 'الخدمة', 'الكمية', 'الرسوم', 'العميل']); head(wd, 1);
    d.far.forEach(function (r, i) { wd.addRow([r.day, r.tx, r.courier, r.service, r.qty, r.fee, r.client]); wd.getCell('F' + (i + 2)).numFmt = MONEY; });
    var last = Math.max(d.far.length + 1, 2), F = function (c) { return "'التفاصيل'!$" + c + '$2:$' + c + '$' + last; };
    var ws = wb.addWorksheet('ملخص', { views: [{ rightToLeft: true }] }); ws.columns = [{ width: 24 }, { width: 14 }, { width: 12 }, { width: 14 }];
    ws.addRow(['رسوم التوصيل — ' + d.period]); ws.getRow(1).font = { bold: true, size: 14 }; ws.addRow([]);
    var h0 = ws.addRow(['المندوب', 'عدد البنود', 'الكمية', 'الرسوم']).number; head(ws, h0);
    var names = Array.from(new Set(d.far.map(function (r) { return r.courier; })));
    names.forEach(function (nm) {
      var n = ws.rowCount + 1;
      ws.addRow([nm, { formula: 'COUNTIFS(' + F('C') + ',A' + n + ')' }, { formula: 'SUMIFS(' + F('E') + ',' + F('C') + ',A' + n + ')' }, { formula: 'SUMIFS(' + F('F') + ',' + F('C') + ',A' + n + ')' }]);
      ws.getCell('D' + n).numFmt = MONEY;
    });
    if (names.length) {
      var a = h0 + 1, b = ws.rowCount, tn = b + 1;
      ws.addRow(['الإجمالي'].concat(['B', 'C', 'D'].map(function (c) { return { formula: 'SUM(' + c + a + ':' + c + b + ')' }; })));
      ws.getCell('D' + tn).numFmt = MONEY; totalRow(ws, tn);
    }
    wb.worksheets.forEach(function (w, i) { w.orderNo = (w.name === 'ملخص' ? 0 : 1000) + i; });
    await download(wb, 'رسوم-التوصيل_' + st.from + '_' + st.to + '.xlsx');
  }

  async function download(wb, name) {
    var buf = await wb.xlsx.writeBuffer();
    var blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  window.p60Export = async function () {
    if (!st.data) return;
    try { toast('جارٍ تجهيز ملف Excel...', 'info'); if (st.mode === 'month') await exportMonth(); else await exportFees(); toast('تم تجهيز الملف ✅', 'success'); }
    catch (e) { console.warn('p60 export', e); toast('تعذّر تصدير الملف: ' + String((e && e.message) || e).slice(0, 100), 'error'); }
  };

  /* ---------- التبويب والقائمة ---------- */
  function ensureTab() {
    if (!isMgr()) { removeTab(); return false; }
    if (!$('tab-monthclose')) {
      var main = document.querySelector('main'); if (!main) return false;
      var pane = document.createElement('div'); pane.id = 'tab-monthclose'; pane.className = 'hidden space-y-4 p60';
      var host = $('tab-comm') || main.lastElementChild;
      if (host) host.insertAdjacentElement('afterend', pane); else main.appendChild(pane);
      pane.addEventListener('click', function (e) {
        var m = e.target.closest('[data-p60-mode]');
        if (m) { setMode(m.getAttribute('data-p60-mode')); return; }
        if (e.target.closest('#p60-go')) { st.from = $('p60-from').value; st.to = $('p60-to').value; load(); return; }
        if (e.target.closest('#p60-xl')) { window.p60Export(); return; }
        if (e.target.closest('#p60-close')) { doClose(); return; }
        var ro = e.target.closest('[data-p60-reopen]');
        if (ro) doReopen(ro.getAttribute('data-p60-reopen'));
      });
    }
    if (!$('tab-monthclose-btn') && $('nav-menu')) {
      var b = document.createElement('button');
      b.id = 'tab-monthclose-btn'; b.type = 'button'; b.setAttribute('data-tab-target', 'monthclose'); b.className = BTN_OFF;
      b.setAttribute('onclick', "switchTab('monthclose')");
      b.innerHTML = '<i class="fa-solid fa-lock text-emerald-500"></i><span>تقفيل الشهر</span>';
      var menu = $('nav-menu'), anchor = menu.querySelector('[data-tab-target="comm"]'), body = menu.querySelector(':scope > section[data-mg="daily"] .mg-body');
      if (anchor) anchor.insertAdjacentElement('afterend', b); else if (body) body.appendChild(b); else menu.appendChild(b);
    }
    return true;
  }
  function removeTab() { var p = $('tab-monthclose'), b = $('tab-monthclose-btn'); if (p) p.remove(); if (b) b.remove(); st.data = null; }
  function setMode(m) {
    if (m === st.mode) return;
    st.mode = m; st.data = null; st.error = '';
    var r = m === 'month' ? prevMonthRange() : weekRange(); st.from = r.from; st.to = r.to;
    render(); load();
  }
  function wrap(name, make) { var o = window[name]; if (typeof o !== 'function') return; window[name] = make(o); }

  wrap('switchTab', function (orig) {
    return function (id) {
      var res = orig.apply(this, arguments);
      try {
        ensureTab();
        var on = id === 'monthclose' && isMgr(), pane = $('tab-monthclose'), btn = $('tab-monthclose-btn');
        if (pane) pane.classList.toggle('hidden', !on);
        if (btn) btn.className = on ? BTN_ON : BTN_OFF;
        if (on) {
          var sec = btn && btn.closest('.mg'); if (sec && !sec.classList.contains('open')) sec.classList.add('open');
          if (!st.from) { var r = prevMonthRange(); st.from = r.from; st.to = r.to; }
          render(); if (!st.data && !st.loading) load();
        }
      } catch (e) { /* */ }
      return res;
    };
  });
  wrap('loadInitialData', function (orig) {
    return async function () { var r = await orig.apply(this, arguments); try { ensureTab(); } catch (e) { /* */ } return r; };
  });
  wrap('handleLogout', function (orig) {
    return function () { try { removeTab(); st.from = st.to = ''; st.mode = 'month'; } catch (e) { /* */ } return orig.apply(this, arguments); };
  });
  window.p60Render = render;
  window.__p60 = { compute: compute, state: st, setMode: setMode, ensureTab: ensureTab };
})();
