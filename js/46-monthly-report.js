/* =====================================================================
   التقرير الشهري للمدير (Excel احترافي جاهز)
   - ملف .xlsx واحد: لوحة المدير (مؤشرات + مقارنة بالشهر اللي فات + أبرز ما في الشهر + رسوم)
     + شيتات: الخدمات، الموظفين، المنفذين، المتأخرات، الاستردادات، كل البنود.
   - الأرقام صافية بعد الاستردادات المعتمدة (بتاريخ اعتماد الاسترداد).
   - للمدير بس. بيتفتح من زرار "تقرير الشهر للمدير" في شاشة متابعة الشغل.
   ===================================================================== */
(function () {
  'use strict';
  if (window.__mrep) return; window.__mrep = true;
  const num = v => Number(v) || 0, DAY = 864e5;
  const NAVY = 'FF0B1B33', ORG = 'FFFF7A3D', SOFT = 'FFFFF4EC', GRAY = 'FFEDEDED', GREEN = 'FFD9F2E6', AMBER = 'FFFFF1CC', ROSE = 'FFFADBD8';
  const thin = { style: 'thin', color: { argb: 'FFBFBFBF' } }, box = { top: thin, left: thin, bottom: thin, right: thin };
  const fill = c => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: c } });
  const lines = () => (typeof allRequestLines !== 'undefined' && Array.isArray(allRequestLines)) ? allRequestLines : [];
  const mOf = l => String(lineDate(l) || '').slice(0, 7);
  const stOf = l => l.status || 'In Progress';
  const isDone = l => stOf(l) === 'Complete' || stOf(l) === 'Delivered';
  const qty = l => num(l.qty) || 1;
  const exOf = l => (l.executor || '').trim() || 'تنفيذ داخلي';
  const svcOf = l => (l.service || '').trim() || 'أخرى';
  const empOf = l => (l.employee || '').trim() || 'غير محدد';
  const late = l => { try { return isLineLate(l); } catch (e) { return false; } };
  const lateDays = l => {
    const b = new Date(String(l.exec_start_date || lineDate(l) || '').slice(0, 10) + 'T00:00:00'); if (isNaN(b)) return 0;
    const t = new Date(); t.setHours(0, 0, 0, 0); return Math.max(0, Math.floor((t - (b.getTime() + num(l.duration_days) * DAY)) / DAY));
  };
  const prevM = m => { const a = m.split('-').map(Number); return a[1] === 1 ? (a[0] - 1) + '-12' : a[0] + '-' + String(a[1] - 1).padStart(2, '0'); };
  const curM = () => new Date().toLocaleDateString('en-CA').slice(0, 7);
  const mLabel = m => { try { return new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric' }).format(new Date(m + '-01T00:00')); } catch (e) { return m; } };
  const refunds = () => typeof window.getAllApprovedRefunds === 'function' ? window.getAllApprovedRefunds() : [];
  const pct = (a, b) => b > 0 ? Math.round(a / b * 100) : 0;
  const pct1 = (a, b) => b > 0 ? (Math.round(a / b * 1000) / 10) : 0;
  const money = n => Math.round(num(n)).toLocaleString('en-US');
  const bar = p => '█'.repeat(Math.max(0, Math.min(20, Math.round(p / 5)))) + ' ' + p + '%';

  function compute(m) {
    const L = lines().filter(l => mOf(l) === m), byId = new Map(lines().map(l => [String(l.id), l]));
    const R = refunds().filter(r => String(r.decided_at || '').slice(0, 7) === m);
    const c = { m, L, R, gross: 0, refSales: 0, tx: new Set(), qty: 0, done: 0, del: 0, left: 0, late: 0, pay: new Map(), day: new Map(), svc: new Map(), emp: new Map(), ex: new Map(), lateList: [], refRows: [] };
    const get = (map, k, init) => { let o = map.get(k); if (!o) map.set(k, o = init()); return o; };
    L.forEach(l => {
      const q = qty(l), v = num(l.total); c.gross += v; c.tx.add(l.transaction_id); c.qty += q;
      if (isDone(l)) { c.done += q; if (stOf(l) === 'Delivered') c.del += q; } else { c.left += q; if (late(l)) { c.late += q; c.lateList.push(l); } }
      const p = (l.payment_method || 'كاش').trim(); c.pay.set(p, (c.pay.get(p) || 0) + v);
      const d = String(lineDate(l) || '').slice(0, 10); c.day.set(d, (c.day.get(d) || 0) + v);
      const s = get(c.svc, svcOf(l), () => ({ got: 0, done: 0, left: 0, late: 0, val: 0 })); s.got += q; s.val += v; if (isDone(l)) s.done += q; else { s.left += q; if (late(l)) s.late += q; }
      const e = get(c.emp, empOf(l), () => ({ tx: new Set(), qty: 0, val: 0 })); e.tx.add(l.transaction_id); e.qty += q; e.val += v;
      const x = get(c.ex, exOf(l), () => ({ got: 0, done: 0, left: 0, late: 0, cost: 0 })); x.got += q; if (isDone(l)) x.done += q; else { x.left += q; if (late(l)) x.late += q; }
      try { x.cost += typeof execCostOf === 'function' ? num(execCostOf(l)) : 0; } catch (e2) { /* */ }
    });
    R.forEach(r => {
      const v = Math.max(0, num(r.sales_amount)); c.refSales += v; const l = byId.get(String(r.line_id)) || {};
      const d = String(r.decided_at || '').slice(0, 10); c.day.set(d, (c.day.get(d) || 0) - v);
      c.refRows.push({ r, l, v });
    });
    c.net = c.gross - c.refSales; c.txN = c.tx.size; c.rate = pct(c.done, c.qty);
    c.avg = c.txN ? c.net / c.txN : 0;
    return c;
  }
  function delta(cur, prev, isPts) {
    if (!prev && !cur) return { t: '—', c: 'FF666666' };
    if (!prev) return { t: 'جديد', c: 'FF666666' };
    const d = isPts ? Math.round(cur - prev) : Math.round((cur - prev) / prev * 100);
    return { t: (d > 0 ? '▲ +' : d < 0 ? '▼ ' : '■ ') + d + (isPts ? ' نقطة' : '%') + ' عن الشهر اللي فات', c: d > 0 ? 'FF1B7F4F' : d < 0 ? 'FFC0392B' : 'FF666666' };
  }
  function insights(c, p) {
    const out = [], top = [...c.svc.entries()].sort((a, b) => b[1].val - a[1].val)[0];
    const dn = delta(c.net, p.net, false);
    out.push('صافي مبيعات ' + mLabel(c.m) + ' ' + money(c.net) + ' جنيه من ' + c.txN + ' معاملة (' + dn.t.replace(' عن الشهر اللي فات', '') + ' مقارنة بالشهر اللي فات).');
    if (top && c.gross > 0) out.push('أعلى خدمة في المبيعات: ' + top[0] + ' بنسبة ' + pct(top[1].val, c.gross) + '% من الإجمالي.');
    const bd = [...c.day.entries()].filter(x => x[0]).sort((a, b) => b[1] - a[1])[0]; if (bd) out.push('أحسن يوم مبيعات: ' + bd[0] + ' بقيمة ' + money(bd[1]) + ' جنيه.');
    out.push('اتنفذ ' + c.rate + '% من الخدمات المستلمة (' + c.done + ' من ' + c.qty + ')، والمتسلّم منها ' + c.del + '.' + (c.late ? ' فاضل ' + c.left + ' منهم ' + c.late + ' متأخر ومحتاج متابعة.' : ' مفيش متأخرات.'));
    if (c.refRows.length) out.push('استردادات الشهر: ' + c.refRows.length + ' بقيمة ' + money(c.refSales) + ' جنيه (' + pct1(c.refSales, c.gross) + '% من المبيعات).');
    const be = [...c.emp.entries()].sort((a, b) => b[1].val - a[1].val)[0]; if (be) out.push('أعلى موظف مبيعات: ' + be[0] + ' بـ ' + money(be[1].val) + ' جنيه.');
    return out;
  }

  /* ---------- رسوم (Chart.js الموجود في النظام → صور PNG جوه الإكسل) ---------- */
  function chartPng(cfg, w, h) {
    try {
      if (typeof Chart === 'undefined') return null;
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const bg = { id: 'wbg', beforeDraw: ch => { const x = ch.ctx; x.save(); x.globalCompositeOperation = 'destination-over'; x.fillStyle = '#fff'; x.fillRect(0, 0, ch.width, ch.height); x.restore(); } };
      const ch = new Chart(cv, Object.assign({}, cfg, { plugins: [bg], options: Object.assign({ animation: false, responsive: false, devicePixelRatio: 2, color: '#333' }, cfg.options || {}) }));
      const u = cv.toDataURL('image/png'); ch.destroy(); return u.split(',')[1];
    } catch (e) { console.warn('chartPng', e); return null; }
  }
  const PAL = ['#ff7a3d', '#0b1b33', '#5fd3b3', '#e8c878', '#ff6b6b', '#8a8178', '#4f8cff', '#b784f7'];
  const tick = { ticks: { color: '#333' }, grid: { color: '#eee' } };

  /* ---------- Excel ---------- */
  let xl = null;
  function loadX() {
    if (window.ExcelJS) return Promise.resolve(window.ExcelJS); if (xl) return xl;
    xl = new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'js/vendor/exceljs-4.4.0.min.js'; s.onload = () => window.ExcelJS ? ok(window.ExcelJS) : no(new Error('ExcelJS')); s.onerror = () => { xl = null; no(new Error('load')); }; document.head.appendChild(s); });
    return xl;
  }
  function sheet(wb, name, title, sub, heads, widths, rows, opt) {
    opt = opt || {};
    const ws = wb.addWorksheet(name, { views: [{ rightToLeft: true, state: 'frozen', ySplit: 4 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    const n = heads.length;
    ws.mergeCells(1, 1, 1, n); ws.getCell(1, 1).value = title; ws.getCell(1, 1).font = { name: 'Arial', size: 15, bold: true }; ws.getCell(1, 1).alignment = { horizontal: 'center' };
    ws.mergeCells(2, 1, 2, n); ws.getCell(2, 1).value = sub; ws.getCell(2, 1).font = { name: 'Arial', size: 10, color: { argb: 'FF666666' } }; ws.getCell(2, 1).alignment = { horizontal: 'center' };
    const h = ws.getRow(4); heads.forEach((x, i) => { const c = h.getCell(i + 1); c.value = x; c.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = fill(NAVY); c.border = box; c.alignment = { horizontal: 'center', vertical: 'middle' }; });
    h.height = 24; widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    rows.forEach(rw => {
      const r = ws.addRow(rw);
      for (let i = 1; i <= n; i++) { const c = r.getCell(i); c.border = box; c.font = { name: 'Arial', size: 10 }; c.alignment = { horizontal: i === 1 ? 'right' : 'center', vertical: 'middle', wrapText: true }; if (typeof rw[i - 1] === 'number' && !(opt.plain || []).includes(i)) c.numFmt = '#,##0'; }
      if (opt.row) opt.row(r, rw);
    });
    if (opt.total) {
      const t = ws.addRow(opt.total); for (let i = 1; i <= n; i++) { const c = t.getCell(i); c.font = { name: 'Arial', bold: true }; c.fill = fill(GRAY); c.border = Object.assign({}, box, { top: { style: 'medium', color: { argb: 'FF000000' } } }); c.alignment = { horizontal: i === 1 ? 'right' : 'center' }; if (typeof opt.total[i - 1] === 'number') c.numFmt = '#,##0'; }
    }
    if (rows.length) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: n } };
    else { ws.mergeCells(5, 1, 5, n); ws.getCell(5, 1).value = 'مفيش بيانات في الشهر ده'; ws.getCell(5, 1).alignment = { horizontal: 'center' }; ws.getCell(5, 1).font = { name: 'Arial', color: { argb: 'FF888888' } }; }
    return ws;
  }
  function dashboard(wb, c, p, sub) {
    const ws = wb.addWorksheet('لوحة المدير', { views: [{ rightToLeft: true, showGridLines: false }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    for (let i = 1; i <= 12; i++) ws.getColumn(i).width = 14;
    ws.mergeCells('A1:L1'); const t = ws.getCell('A1'); t.value = 'تقرير الشهر للمدير — قسم الخدمات الحكومية (تساهيل) — ' + mLabel(c.m); t.font = { name: 'Arial', size: 18, bold: true, color: { argb: 'FFFFFFFF' } }; t.fill = fill(NAVY); t.alignment = { horizontal: 'center', vertical: 'middle' }; ws.getRow(1).height = 40;
    ws.mergeCells('A2:L2'); const s2 = ws.getCell('A2'); s2.value = sub; s2.font = { name: 'Arial', size: 10, color: { argb: 'FF666666' } }; s2.alignment = { horizontal: 'center' };
    const K = [
      ['صافي المبيعات (جنيه)', c.net, delta(c.net, p.net), '#,##0'], ['عدد المعاملات', c.txN, delta(c.txN, p.txN), '#,##0'], ['عدد الخدمات المستلمة', c.qty, delta(c.qty, p.qty), '#,##0'], ['نسبة الإنجاز', c.rate / 100, delta(c.rate, p.rate, true), '0%'],
      ['فاضل للتنفيذ', c.left, { t: 'من ' + c.qty + ' خدمة', c: 'FF666666' }, '#,##0'], ['متأخر', c.late, { t: c.late ? 'محتاج متابعة' : 'ممتاز', c: c.late ? 'FFC0392B' : 'FF1B7F4F' }, '#,##0'],
      ['المسترد (جنيه)', c.refSales, { t: c.refRows.length + ' استرداد (' + pct1(c.refSales, c.gross) + '% من المبيعات)', c: 'FF666666' }, '#,##0'], ['متوسط المعاملة (جنيه)', c.avg, delta(c.avg, p.avg), '#,##0']
    ];
    K.forEach((k, i) => {
      const row = 4 + Math.floor(i / 4) * 4, col = 1 + (i % 4) * 3;
      for (let r = 0; r < 3; r++) ws.mergeCells(row + r, col, row + r, col + 2);
      const a = ws.getCell(row, col), b = ws.getCell(row + 1, col), d = ws.getCell(row + 2, col);
      a.value = k[0]; a.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF555555' } };
      b.value = k[1]; b.numFmt = k[3]; b.font = { name: 'Arial', size: 22, bold: true, color: { argb: NAVY } };
      d.value = k[2].t; d.font = { name: 'Arial', size: 9, bold: true, color: { argb: k[2].c } };
      for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) { const x = ws.getCell(row + r, col + q); x.fill = fill(SOFT); x.border = { top: r === 0 ? { style: 'medium', color: { argb: ORG } } : undefined, bottom: r === 2 ? thin : undefined, left: q === 0 ? thin : undefined, right: q === 2 ? thin : undefined }; x.alignment = { horizontal: 'center', vertical: 'middle' }; }
      ws.getRow(row + 1).height = 34;
    });
    ws.mergeCells('A12:L12'); const ih = ws.getCell('A12'); ih.value = 'أبرز ما في الشهر'; ih.font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FFFFFFFF' } }; ih.fill = fill(ORG); ih.alignment = { horizontal: 'right' };
    insights(c, p).forEach((t2, i) => { const r = 13 + i; ws.mergeCells(r, 1, r, 12); const x = ws.getCell(r, 1); x.value = '•  ' + t2; x.font = { name: 'Arial', size: 11 }; x.alignment = { horizontal: 'right', vertical: 'middle', wrapText: true, readingOrder: 'rtl' }; ws.getRow(r).height = 22; });
    let r0 = 21; ws.mergeCells(r0, 1, r0, 12); const ch = ws.getCell(r0, 1); ch.value = 'الرسوم البيانية'; ch.font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FFFFFFFF' } }; ch.fill = fill(ORG); ch.alignment = { horizontal: 'right' };
    const days = [...c.day.entries()].filter(x => x[0]).sort((a, b) => a[0].localeCompare(b[0]));
    const svc = [...c.svc.entries()].sort((a, b) => b[1].val - a[1].val).slice(0, 8);
    const pay = [...c.pay.entries()];
    const ex = [...c.ex.entries()].sort((a, b) => b[1].got - a[1].got).slice(0, 8);
    const imgs = [
      chartPng({ type: 'bar', data: { labels: days.map(x => x[0].slice(8)), datasets: [{ label: 'صافي المبيعات اليومية', data: days.map(x => Math.round(x[1])), backgroundColor: '#ff7a3d' }] }, options: { plugins: { title: { display: true, text: 'المبيعات اليومية (اليوم من الشهر)', color: '#0b1b33' }, legend: { display: false } }, scales: { x: tick, y: tick } } }, 600, 300),
      chartPng({ type: 'bar', data: { labels: svc.map(x => x[0]), datasets: [{ data: svc.map(x => Math.round(x[1].val)), backgroundColor: '#0b1b33' }] }, options: { indexAxis: 'y', plugins: { title: { display: true, text: 'أعلى الخدمات مبيعًا', color: '#0b1b33' }, legend: { display: false } }, scales: { x: tick, y: tick } } }, 600, 300),
      chartPng({ type: 'doughnut', data: { labels: pay.map(x => x[0]), datasets: [{ data: pay.map(x => Math.round(x[1])), backgroundColor: PAL }] }, options: { plugins: { title: { display: true, text: 'المبيعات حسب طريقة الدفع', color: '#0b1b33' }, legend: { position: 'right', labels: { color: '#333' } } } } }, 600, 300),
      chartPng({ type: 'bar', data: { labels: ex.map(x => x[0]), datasets: [{ label: 'اتنفذ', data: ex.map(x => x[1].done), backgroundColor: '#5fd3b3' }, { label: 'فاضل', data: ex.map(x => x[1].left - x[1].late), backgroundColor: '#e8c878' }, { label: 'متأخر', data: ex.map(x => x[1].late), backgroundColor: '#ff6b6b' }] }, options: { plugins: { title: { display: true, text: 'حالة الشغل عند كل منفذ', color: '#0b1b33' }, legend: { labels: { color: '#333' } } }, scales: { x: Object.assign({ stacked: true }, tick), y: Object.assign({ stacked: true }, tick) } } }, 600, 300)
    ];
    const pos = [[0, 21], [6, 21], [0, 37], [6, 37]];
    imgs.forEach((b, i) => { if (!b) return; const id = wb.addImage({ base64: b, extension: 'png' }); ws.addImage(id, { tl: { col: pos[i][0] + 0.05, row: pos[i][1] }, ext: { width: 590, height: 295 } }); });
    ws.mergeCells('A53:L53'); const f = ws.getCell('A53'); f.value = 'الأرقام مسحوبة من نظام تساهيل بتاريخ التصدير. المبيعات صافية بعد الاستردادات المعتمدة، والمتأخر = لسه ما اتنفذش وعدّى موعده.'; f.font = { name: 'Arial', size: 9, color: { argb: 'FF888888' } }; f.alignment = { horizontal: 'center' };
  }

  async function build(m) {
    const c = compute(m), p = compute(prevM(m));
    if (!c.L.length && !c.R.length) return showToast('مفيش شغل في ' + mLabel(m), 'info');
    showToast('بجهّز التقرير...', 'info');
    const X = await loadX(), wb = new X.Workbook(); wb.creator = 'تساهيل'; wb.created = new Date();
    const who = (typeof currentUser !== 'undefined' && currentUser && currentUser.email) || '', sub = 'تاريخ التصدير: ' + new Date().toLocaleDateString('en-CA') + (who ? ' — ' + who : '');
    dashboard(wb, c, p, sub);
    const S = [...c.svc.entries()].sort((a, b) => b[1].val - a[1].val);
    sheet(wb, 'الخدمات', 'أداء الخدمات — ' + mLabel(m), sub, ['الخدمة', 'استلمنا', 'اتنفذ', 'فاضل', 'متأخر', 'المبيعات', 'نسبة من المبيعات'], [34, 11, 11, 11, 11, 15, 30],
      S.map(([k, v]) => [k, v.got, v.done, v.left, v.late, Math.round(v.val), bar(pct(v.val, c.gross))]),
      { total: ['الإجمالي', c.qty, c.done, c.left, c.late, Math.round(c.gross), ''], row: (r, rw) => { if (rw[4]) r.getCell(5).fill = fill(ROSE); r.getCell(7).font = { name: 'Arial', color: { argb: ORG } }; } });
    const E = [...c.emp.entries()].sort((a, b) => b[1].val - a[1].val);
    sheet(wb, 'الموظفين', 'أداء الموظفين — ' + mLabel(m), sub, ['الموظف', 'معاملات', 'خدمات', 'المبيعات', 'نسبة من المبيعات'], [28, 12, 12, 16, 30],
      E.map(([k, v]) => [k, v.tx.size, v.qty, Math.round(v.val), bar(pct(v.val, c.gross))]), { total: ['الإجمالي', c.txN, c.qty, Math.round(c.gross), ''], row: r => { r.getCell(5).font = { name: 'Arial', color: { argb: ORG } }; } });
    const XS = [...c.ex.entries()].sort((a, b) => b[1].got - a[1].got);
    sheet(wb, 'المنفذين', 'متابعة المنفذين — ' + mLabel(m), sub, ['المنفذ', 'استلمنا', 'اتنفذ', 'فاضل', 'متأخر', 'نسبة الإنجاز', 'تكلفة التنفيذ'], [28, 11, 11, 11, 11, 16, 16],
      XS.map(([k, v]) => [k, v.got, v.done, v.left, v.late, pct(v.done, v.got) / 100, Math.round(v.cost)]),
      { total: ['الإجمالي', c.qty, c.done, c.left, c.late, c.rate / 100, Math.round(XS.reduce((t, x) => t + x[1].cost, 0))], plain: [6], row: (r, rw) => { r.getCell(6).numFmt = '0%'; if (rw[4]) r.getCell(5).fill = fill(ROSE); } });
    const LL = c.lateList.slice().sort((a, b) => lateDays(b) - lateDays(a));
    sheet(wb, 'المتأخرات', 'الخدمات المتأخرة (الأقدم أولًا) — ' + mLabel(m), sub, ['المعاملة', 'العميل', 'الخدمة', 'العدد', 'المنفذ', 'الموظف', 'متأخر بقاله (يوم)', 'الحالة'], [16, 26, 28, 8, 20, 20, 16, 16],
      LL.map(l => [l.transaction_id || '', l.client_name || '', svcOf(l), qty(l), exOf(l), empOf(l), lateDays(l), statusLabel(stOf(l))]), { plain: [7], row: (r, rw) => { r.getCell(7).fill = fill(rw[6] > 7 ? ROSE : AMBER); } });
    sheet(wb, 'الاستردادات', 'الاستردادات المعتمدة — ' + mLabel(m), sub, ['المعاملة', 'العميل', 'الخدمة', 'النوع', 'الكمية', 'قيمة الاسترداد', 'السبب', 'تاريخ الاعتماد'], [16, 24, 28, 12, 9, 15, 34, 16],
      c.refRows.map(x => [x.l.transaction_id || '', x.l.client_name || '', svcOf(x.l), x.r.kind === 'full' ? 'كلي' : 'جزئي', num(x.r.qty), Math.round(x.v), x.r.reason || '', String(x.r.decided_at || '').slice(0, 10)]),
      { total: c.refRows.length ? ['الإجمالي', '', '', '', '', Math.round(c.refSales), '', ''] : null });
    sheet(wb, 'كل البنود', 'كل بنود الشهر — ' + mLabel(m), sub, ['المعاملة', 'العميل', 'الخدمة', 'العدد', 'المنفذ', 'الموظف', 'الدفع', 'الحالة', 'تاريخ الاستلام', 'القيمة'], [16, 24, 28, 8, 18, 18, 12, 16, 15, 12],
      c.L.slice().sort((a, b) => String(lineDate(a)).localeCompare(String(lineDate(b)))).map(l => [l.transaction_id || '', l.client_name || '', svcOf(l), qty(l), exOf(l), empOf(l), (l.payment_method || 'كاش'), statusLabel(stOf(l)), String(lineDate(l) || '').slice(0, 10), Math.round(num(l.total))]),
      { row: (r, rw) => { r.getCell(8).fill = fill(late(c.L.find(l => l.transaction_id === rw[0] && svcOf(l) === rw[2]) || {}) ? ROSE : (rw[7] === 'تم التسليم' || rw[7] === 'جاهز للتسليم') ? GREEN : AMBER); } });
    const buf = await wb.xlsx.writeBuffer(), a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    a.download = 'تقرير_الشهر_' + m + '.xlsx'; document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    showToast('تم تحميل التقرير الشهري');
  }
  window.monthlyReport = function (m) {
    if (!(typeof canEditTx === 'function' && canEditTx())) return showToast('التقرير ده للمدير بس', 'info');
    build(m || curM()).catch(function (e) { console.warn('monthlyReport', e); showToast('مقدرتش أجهّز التقرير، جرّب تاني', 'error'); });
  };
})();
