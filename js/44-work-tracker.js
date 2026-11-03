/* =====================================================================
   المرحلة 24: متابعة الشغل
   - بتجاوب: استلمنا كام / اتنفذ كام / فاضل كام / متأخر كام، حسب الشهر والخدمة والمنفذ.
   - بتعرض كل الخدمات وكل المنفذين افتراضيًا، والفلاتر بتضيّق.
   - زرار "تحميل Excel" بيطلع ملف .xlsx جاهز (ألوان + عرض أعمدة + إجمالي) من غير أي شغل يدوي.
   - اتنفذ = جاهز للتسليم + تم التسليم | فاضل = قيد التنفيذ + قيد المراجعة | العدّ بالكمية.
   - الألوان من متغيرات الثيم (--r-*) وبدون أنيميشن.
   ===================================================================== */
(function () {
  if (window.__wtrack) return; window.__wtrack = true;
  const eh = escapeHtml, num = v => Number(v) || 0;
  const wrap = (name, fn) => { const o = window[name]; if (typeof o === 'function') window[name] = fn(o); };
  const BTN_ON = 'tab-btn bg-ink text-white dark:bg-brand-600 shadow-sm';
  const BTN_OFF = 'tab-btn text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800';
  const st = { m: '', svc: 'all', ex: 'all', f: 'all', g: 'svc', open: null };
  const isPartner = () => window.__role === 'partner';
  const stOf = l => l.status || 'In Progress';
  const isDone = l => stOf(l) === 'Complete' || stOf(l) === 'Delivered';
  const monthOf = l => String(lineDate(l) || '').slice(0, 7);
  const exOf = l => (l.executor || '').trim() || 'تنفيذ داخلي';
  const svcOf = l => (l.service || '').trim() || 'أخرى';
  const late = l => { try { return isLineLate(l); } catch (e) { return false; } };
  const qty = l => num(l.qty) || 1;
  const fmt = n => Math.round(num(n)).toLocaleString('en-US');
  const lines = () => (typeof allRequestLines !== 'undefined' && Array.isArray(allRequestLines)) ? allRequestLines : [];
  const mLabel = m => { try { return new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric' }).format(new Date(m + '-01T00:00')); } catch (e) { return m; } };
  const uniq = f => [...new Set(lines().map(f))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'ar'));
  const months = () => [...new Set(lines().map(monthOf).filter(x => /^\d{4}-\d{2}$/.test(x)))].sort().reverse();

  function filtered() {
    return lines().filter(l => {
      if (st.m && monthOf(l) !== st.m) return false;
      if (st.svc !== 'all' && svcOf(l) !== st.svc) return false;
      if (st.ex !== 'all' && exOf(l) !== st.ex) return false;
      if (st.f === 'done' && !isDone(l)) return false;
      if (st.f === 'left' && isDone(l)) return false;
      if (st.f === 'late' && !late(l)) return false;
      return true;
    });
  }
  const keyOf = l => st.g === 'svc' ? svcOf(l) : st.g === 'ex' ? exOf(l) : svcOf(l) + ' ‹ ' + exOf(l);

  function agg(rows) {
    const m = new Map();
    rows.forEach(l => {
      const k = keyOf(l); let a = m.get(k);
      if (!a) m.set(k, a = { k, got: 0, done: 0, del: 0, left: 0, late: 0, val: 0, rows: [] });
      const q = qty(l); a.got += q; a.val += num(l.total); a.rows.push(l);
      if (isDone(l)) { a.done += q; if (stOf(l) === 'Delivered') a.del += q; } else { a.left += q; if (late(l)) a.late += q; }
    });
    return [...m.values()].sort((x, y) => y.got - x.got || x.k.localeCompare(y.k, 'ar'));
  }
  const sum = list => list.reduce((t, a) => { ['got', 'done', 'del', 'left', 'late', 'val'].forEach(k => t[k] += a[k]); return t; }, { got: 0, done: 0, del: 0, left: 0, late: 0, val: 0 });
  const grpName = () => st.g === 'svc' ? 'الخدمة' : st.g === 'ex' ? 'المنفذ' : 'الخدمة ‹ المنفذ';
  const filterLine = () => 'الشهر: ' + (st.m ? mLabel(st.m) : 'كل الشهور') + ' | الخدمة: ' + (st.svc === 'all' ? 'الكل' : st.svc) + ' | المنفذ: ' + (st.ex === 'all' ? 'الكل' : st.ex) +
    ' | الحالة: ' + ({ all: 'الكل', done: 'اتنفذ', left: 'فاضل', late: 'متأخر' })[st.f];

  /* ---------------- الشاشة ---------------- */
  const CSS = '.wt{font-family:inherit}.wt-card{background:var(--r-card,#fff);border:1px solid var(--r-line,#e5e7eb);border-radius:16px;padding:14px}' +
    '.wt-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:end}.wt-bar label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--r-mute,#8a8178);min-width:130px;flex:1}' +
    '.wt-bar select{background:transparent;border:1px solid var(--r-line,#e5e7eb);border-radius:10px;padding:8px;font-size:14px;color:inherit}' +
    '.wt-btn{border:1px solid var(--r-line,#e5e7eb);border-radius:10px;padding:9px 14px;font-weight:700;font-size:14px;background:var(--r-acc,#ff9d6c);color:#1a1a1a;cursor:pointer}' +
    '.wt-tb{width:100%;border-collapse:collapse;font-size:14px}.wt-tb th,.wt-tb td{padding:9px 8px;text-align:center;border-bottom:1px solid var(--r-line,#e5e7eb)}' +
    '.wt-tb th{font-size:12px;color:var(--r-mute,#8a8178);font-weight:700}.wt-tb td:first-child,.wt-tb th:first-child{text-align:right}.wt-tb tbody tr{cursor:pointer}' +
    '.wt-tot td{font-weight:800;border-top:2px solid var(--r-line,#e5e7eb)}.wt-ok{color:var(--r-ok,#5fd3b3);font-weight:700}.wt-warn{color:var(--r-acc,#ff9d6c);font-weight:700}.wt-bad{color:#e5484d;font-weight:700}' +
    '.wt-sub{font-size:13px;padding:6px 10px;border-bottom:1px dashed var(--r-line,#e5e7eb);display:flex;gap:8px;justify-content:space-between;cursor:pointer}.wt-sum{font-size:15px;line-height:1.9}';

  function opt(v, cur, label) { return '<option value="' + eh(v) + '"' + (v === cur ? ' selected' : '') + '>' + eh(label == null ? v : label) + '</option>'; }
  function sel(id, label, html) { return '<label>' + label + '<select id="' + id + '">' + html + '</select></label>'; }

  function paint() {
    const p = document.getElementById('tab-wtrack'); if (!p || p.classList.contains('hidden')) return;
    const rows = filtered(), a = agg(rows), t = sum(a);
    const bar = '<div class="wt-card wt-bar">' +
      sel('wt-m', 'الشهر', opt('', st.m, 'كل الشهور') + months().map(m => opt(m, st.m, mLabel(m))).join('')) +
      sel('wt-svc', 'الخدمة', opt('all', st.svc, 'كل الخدمات') + uniq(svcOf).map(s => opt(s, st.svc)).join('')) +
      sel('wt-ex', 'المنفذ', opt('all', st.ex, 'كل المنفذين') + uniq(exOf).map(s => opt(s, st.ex)).join('')) +
      sel('wt-f', 'الحالة', opt('all', st.f, 'الكل') + opt('done', st.f, 'اتنفذ') + opt('left', st.f, 'فاضل') + opt('late', st.f, 'متأخر')) +
      sel('wt-g', 'تقسيم حسب', opt('svc', st.g, 'الخدمة') + opt('ex', st.g, 'المنفذ') + opt('both', st.g, 'الخدمة والمنفذ')) +
      '<button type="button" class="wt-btn" data-wt="xlsx"><i class="fa-solid fa-file-excel"></i> تحميل Excel</button>' +
      '<button type="button" class="wt-btn" data-wt="xlsxd" style="background:transparent;color:inherit">تفاصيل البنود</button></div>';
    const summary = '<div class="wt-card wt-sum">' + (st.m ? mLabel(st.m) : 'كل الفترة') + ': استلمنا <b>' + fmt(t.got) + '</b>، اتنفذ <b class="wt-ok">' + fmt(t.done) +
      '</b> (منها اتسلّم ' + fmt(t.del) + ')، فاضل <b class="wt-warn">' + fmt(t.left) + '</b>' + (t.late ? '، منهم متأخر <b class="wt-bad">' + fmt(t.late) + '</b>' : '') + '.</div>';
    let body;
    if (!a.length) body = '<div class="wt-card" style="text-align:center;color:var(--r-mute,#8a8178)">مفيش شغل بالفلاتر دي.</div>';
    else {
      body = '<div class="wt-card" style="overflow-x:auto"><table class="wt-tb"><thead><tr><th>' + grpName() + '</th><th>استلمنا</th><th>اتنفذ</th><th>منها اتسلّم</th><th>فاضل</th><th>متأخر</th><th>القيمة</th></tr></thead><tbody>' +
        a.map(x => '<tr data-wt-open="' + eh(x.k) + '"><td>' + eh(x.k) + '</td><td>' + fmt(x.got) + '</td><td class="wt-ok">' + fmt(x.done) + '</td><td>' + fmt(x.del) + '</td><td class="' + (x.left ? 'wt-warn' : '') + '">' + fmt(x.left) + '</td><td class="' + (x.late ? 'wt-bad' : '') + '">' + fmt(x.late) + '</td><td>' + fmt(x.val) + '</td></tr>' +
          (st.open === x.k ? '<tr><td colspan="7" style="padding:0">' + x.rows.filter(l => !isDone(l)).map(l => '<div class="wt-sub" data-wt-tx="' + eh(l.transaction_id || '') + '"><span>' + eh(l.client_name || '') + ' — ' + eh(svcOf(l)) + ' ×' + qty(l) + '</span><span>' + eh(statusLabel(stOf(l))) + (late(l) ? ' • متأخر' : '') + '</span></div>').join('') + (x.left ? '' : '<div class="wt-sub">كله اتنفذ</div>') + '</td></tr>' : '')).join('') +
        '<tr class="wt-tot"><td>الإجمالي</td><td>' + fmt(t.got) + '</td><td>' + fmt(t.done) + '</td><td>' + fmt(t.del) + '</td><td>' + fmt(t.left) + '</td><td>' + fmt(t.late) + '</td><td>' + fmt(t.val) + '</td></tr></tbody></table></div>';
    }
    p.innerHTML = '<div class="wt space-y-3"><h2 class="text-lg font-extrabold">متابعة الشغل</h2>' + bar + summary + body + '</div>';
  }

  function onClick(e) {
    const t = e.target && e.target.closest ? e.target : null; if (!t) return;
    const b = t.closest('[data-wt]'); if (b) { b.getAttribute('data-wt') === 'xlsx' ? xlsxSummary() : xlsxDetails(); return; }
    const tx = t.closest('[data-wt-tx]'); if (tx) { const id = tx.getAttribute('data-wt-tx'); if (id && typeof window.openTxModal === 'function') window.openTxModal(id); return; }
    const r = t.closest('[data-wt-open]'); if (r) { const k = r.getAttribute('data-wt-open'); st.open = st.open === k ? null : k; paint(); }
  }
  function onChange(e) {
    const m = { 'wt-m': 'm', 'wt-svc': 'svc', 'wt-ex': 'ex', 'wt-f': 'f', 'wt-g': 'g' }[e.target && e.target.id]; if (!m) return;
    st[m] = e.target.value; st.open = null; paint();
  }

  /* ---------------- Excel (.xlsx جاهز) ---------------- */
  let xl = null;
  function loadX() {
    if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
    if (xl) return xl;
    xl = new Promise((ok, no) => {
      const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
      s.onload = () => window.ExcelJS ? ok(window.ExcelJS) : no(new Error('ExcelJS')); s.onerror = () => { xl = null; no(new Error('load')); };
      document.head.appendChild(s);
    });
    return xl;
  }
  const NAVY = 'FF0B1B33', GREEN = 'FFD9F2E6', AMBER = 'FFFFF1CC', ROSE = 'FFFADBD8', GRAY = 'FFEDEDED';
  const thin = { style: 'thin', color: { argb: 'FFBFBFBF' } };
  const box = { top: thin, left: thin, bottom: thin, right: thin };
  const fill = c => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: c } });
  const today = () => new Date().toLocaleDateString('en-CA');

  function sheetBase(wb, name, title, heads, widths) {
    const ws = wb.addWorksheet(name, { views: [{ rightToLeft: true, state: 'frozen', ySplit: 4 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    const n = heads.length;
    ws.mergeCells(1, 1, 1, n); ws.getCell(1, 1).value = title; ws.getCell(1, 1).font = { name: 'Arial', size: 16, bold: true }; ws.getCell(1, 1).alignment = { horizontal: 'center' };
    ws.mergeCells(2, 1, 2, n); ws.getCell(2, 1).value = filterLine(); ws.getCell(2, 1).font = { name: 'Arial', size: 11 }; ws.getCell(2, 1).alignment = { horizontal: 'center' };
    ws.mergeCells(3, 1, 3, n); ws.getCell(3, 1).value = 'تاريخ التصدير: ' + today(); ws.getCell(3, 1).font = { name: 'Arial', size: 10, color: { argb: 'FF666666' } }; ws.getCell(3, 1).alignment = { horizontal: 'center' };
    const h = ws.getRow(4); heads.forEach((x, i) => { const c = h.getCell(i + 1); c.value = x; c.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = fill(NAVY); c.border = box; c.alignment = { horizontal: 'center', vertical: 'middle' }; });
    h.height = 24; widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: n } };
    return ws;
  }
  function styleRow(row, n, first) {
    for (let i = 1; i <= n; i++) { const c = row.getCell(i); c.border = box; c.font = Object.assign({ name: 'Arial' }, c.font || {}); c.alignment = { horizontal: i === first ? 'right' : 'center', vertical: 'middle', wrapText: true }; }
  }
  async function saveX(wb, name) {
    const buf = await wb.xlsx.writeBuffer();
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    a.download = name; document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    showToast('تم تحميل ملف Excel جاهز');
  }
  async function withX(fn, fallback) {
    try { showToast('بجهّز الملف...', 'info'); const X = await loadX(); await fn(X); }
    catch (e) { console.warn('wtrack xlsx', e); showToast('مقدرتش أجهّز Excel، نزّلت CSV بدله', 'info'); fallback(); }
  }
  function xlsxSummary() {
    const a = agg(filtered()); if (!a.length) return showToast('مفيش بيانات للتصدير', 'info');
    const t = sum(a), heads = [grpName(), 'استلمنا', 'اتنفذ', 'منها اتسلّم', 'فاضل', 'متأخر', 'القيمة'];
    const toRow = x => [x.k, x.got, x.done, x.del, x.left, x.late, Math.round(x.val)];
    withX(async X => {
      const wb = new X.Workbook(), ws = sheetBase(wb, 'متابعة الشغل', 'متابعة الشغل — ' + (st.m ? mLabel(st.m) : 'كل الفترة'), heads, [34, 12, 12, 14, 12, 12, 14]);
      a.forEach(x => { const r = ws.addRow(toRow(x)); styleRow(r, 7, 1); r.getCell(3).fill = fill(GREEN); if (x.left) r.getCell(5).fill = fill(AMBER); if (x.late) r.getCell(6).fill = fill(ROSE); r.getCell(7).numFmt = '#,##0'; });
      const tr = ws.addRow(['الإجمالي', t.got, t.done, t.del, t.left, t.late, Math.round(t.val)]); styleRow(tr, 7, 1);
      for (let i = 1; i <= 7; i++) { const c = tr.getCell(i); c.font = { name: 'Arial', bold: true }; c.fill = fill(GRAY); c.border = Object.assign({}, box, { top: { style: 'medium', color: { argb: 'FF000000' } } }); }
      tr.getCell(7).numFmt = '#,##0';
      await saveX(wb, 'متابعة_الشغل_' + (st.m || 'الكل') + '_' + today() + '.xlsx');
    }, () => downloadCsvFile('متابعة_الشغل_' + today() + '.csv', heads, [...a.map(toRow), ['الإجمالي', t.got, t.done, t.del, t.left, t.late, Math.round(t.val)]]));
  }
  function xlsxDetails() {
    const rows = filtered().slice().sort((x, y) => svcOf(x).localeCompare(svcOf(y), 'ar') || String(lineDate(x)).localeCompare(String(lineDate(y))));
    if (!rows.length) return showToast('مفيش بيانات للتصدير', 'info');
    const heads = ['المعاملة', 'العميل', 'الخدمة', 'العدد', 'المنفذ', 'الحالة', 'متأخر', 'تاريخ الاستلام', 'القيمة'];
    const toRow = l => [l.transaction_id || '', l.client_name || '', svcOf(l), qty(l), exOf(l), statusLabel(stOf(l)), late(l) ? 'متأخر' : '', String(lineDate(l) || '').slice(0, 10), Math.round(num(l.total))];
    withX(async X => {
      const wb = new X.Workbook(), ws = sheetBase(wb, 'تفاصيل البنود', 'تفاصيل البنود — ' + (st.m ? mLabel(st.m) : 'كل الفترة'), heads, [16, 26, 30, 8, 20, 16, 10, 16, 12]);
      rows.forEach(l => { const r = ws.addRow(toRow(l)); styleRow(r, 9, 2); r.getCell(6).fill = fill(isDone(l) ? GREEN : AMBER); if (late(l)) r.getCell(7).fill = fill(ROSE); r.getCell(9).numFmt = '#,##0'; });
      await saveX(wb, 'تفاصيل_البنود_' + (st.m || 'الكل') + '_' + today() + '.xlsx');
    }, () => downloadCsvFile('تفاصيل_البنود_' + today() + '.csv', heads, rows.map(toRow)));
  }

  /* ---------------- الربط مع النظام (من غير تعديل الملفات القديمة) ---------------- */
  function ensureUi() {
    if (isPartner()) { const b = document.getElementById('tab-wtrack-btn'); if (b) b.remove(); return false; }
    if (!document.getElementById('wt-style')) { const s = document.createElement('style'); s.id = 'wt-style'; s.textContent = CSS; document.head.appendChild(s); }
    if (!document.getElementById('tab-wtrack')) {
      const host = document.getElementById('tab-notes') || document.getElementById('tab-tasks'); if (!host) return false;
      const p = document.createElement('div'); p.id = 'tab-wtrack'; p.className = 'hidden space-y-4';
      host.insertAdjacentElement('afterend', p); p.addEventListener('click', onClick); p.addEventListener('change', onChange);
    }
    if (!document.getElementById('tab-wtrack-btn')) {
      const menu = document.getElementById('nav-menu'); if (!menu) return false;
      const b = document.createElement('button'); b.id = 'tab-wtrack-btn'; b.type = 'button'; b.className = BTN_OFF;
      b.setAttribute('onclick', "switchTab('wtrack')"); b.innerHTML = '<i class="fa-solid fa-list-check"></i><span>متابعة الشغل</span>';
      const a = document.getElementById('tab-exec-btn');
      if (a && a.parentElement === menu) a.insertAdjacentElement('afterend', b); else menu.appendChild(b);
    }
    return true;
  }
  wrap('switchTab', o => function (id) {
    const r = o.apply(this, arguments);
    try {
      const p = document.getElementById('tab-wtrack'), b = document.getElementById('tab-wtrack-btn'), on = id === 'wtrack';
      if (p) p.classList.toggle('hidden', !on);
      if (b) b.className = on ? BTN_ON : BTN_OFF;
      if (on) paint();
    } catch (e) { console.warn('wtrack tab', e); }
    return r;
  });
  wrap('refreshLineViews', o => function () { const r = o.apply(this, arguments); try { if (currentTab === 'wtrack') paint(); } catch (e) { /* */ } return r; });
  wrap('loadInitialData', o => async function () { const x = await o.apply(this, arguments); try { ensureUi(); } catch (e) { console.warn('wtrack setup', e); } return x; });
  wrap('handleLogout', o => function () { try { const b = document.getElementById('tab-wtrack-btn'); if (b) b.remove(); const p = document.getElementById('tab-wtrack'); if (p) p.innerHTML = ''; } catch (e) { /* */ } return o.apply(this, arguments); });
  try { ensureUi(); } catch (e) { /* */ }
})();
