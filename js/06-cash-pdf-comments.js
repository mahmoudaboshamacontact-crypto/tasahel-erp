
/* ===== المرحلة 3: شيت الكاش + PDF + سجل تعليقات المعاملات + حالة الرسائل (وصلت / اتقرأت) ===== */
(function () {
  if (window.__phase3) return;
  window.__phase3 = true;

  const eh = escapeHtml;
  const COMPANY = 'تساهيل | قسم الخدمات الحكومية';
  const me = () => ((typeof myProfile !== 'undefined' && myProfile && myProfile.full_name) || (currentUser && currentUser.email) || 'موظف');
  const missingTable = err => /42P01|PGRST205|PGRST202|does not exist|Could not find the table|schema cache/i.test(((err && (err.message || '')) + ' ' + ((err && err.code) || '')));

  /* =====================================================================
     1) أدوات الطباعة وتصدير PDF (مشتركة بين شيت الكاش وشيت المنفذين)
     ===================================================================== */
  function sheetHtml(o, rows, page, pages, forPdf) {
    const th = o.headers.map(h => '<th style="padding:6px 5px;border:1px solid #475569;background:#0b1b33;color:#fff;font-size:11px;white-space:nowrap">' + eh(h) + '</th>').join('');
    const tr = rows.map((r, i) => '<tr style="background:' + (i % 2 ? '#f8fafc' : '#fff') + '">' +
      r.map(v => '<td style="padding:5px;border:1px solid #cbd5e1;font-size:11px;vertical-align:top;word-break:break-word">' + eh(v == null || v === '' ? '—' : v) + '</td>').join('') + '</tr>').join('');
    const box = forPdf ? 'width:1123px;min-height:790px;padding:24px;box-sizing:border-box;background:#fff;' : '';
    return '<div style="' + box + 'direction:rtl;font-family:\'IBM Plex Sans Arabic\',Tahoma,sans-serif;color:#0f172a">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #0d9488;padding-bottom:10px;margin-bottom:12px">' +
        '<div style="display:flex;flex-direction:column;align-items:flex-start;gap:4px">' + logoImg(44, 10) + '<div><div style="font-size:13px;font-weight:700;color:#475569">قسم الخدمات الحكومية</div><div style="font-size:16px;font-weight:700;color:#0f766e;margin-top:2px">' + eh(o.title) + '</div></div></div>' +
        '<div style="font-size:11px;text-align:left;line-height:1.7">' + o.meta.map(eh).join('<br>') + '</div></div>' +
      '<div style="display:flex;gap:10px;margin-bottom:12px">' + o.stats.map(s => '<div style="flex:1;border:1px solid #cbd5e1;border-radius:8px;padding:8px 12px;background:#f1f5f9"><div style="font-size:10px;color:#64748b">' + eh(s[0]) + '</div><div style="font-size:15px;font-weight:700">' + eh(s[1]) + '</div></div>').join('') + '</div>' +
      '<table style="width:100%;border-collapse:collapse"><thead style="display:table-header-group"><tr>' + th + '</tr></thead><tbody>' + tr + '</tbody></table>' +
      '<div style="margin-top:10px;font-size:10px;color:#64748b;display:flex;justify-content:space-between"><span>طُبع بواسطة: ' + eh(me()) + ' · ' + eh(new Date().toLocaleString('ar-EG')) + '</span>' + (page ? '<span>صفحة ' + page + ' من ' + pages + '</span>' : '') + '</div>' +
      '</div>';
  }

  function printSheet(o) {
    if (!o.rows.length) return showToast('لا توجد بيانات للطباعة', 'info');
    $('print-content').innerHTML = sheetHtml(o, o.rows, 0, 0, false);
    const st = document.createElement('style');
    st.id = 'p3-orient';
    st.textContent = '@page{size:A4 landscape;margin:8mm}@media print{#printArea tr{page-break-inside:avoid}}';
    document.head.appendChild(st);
    const done = () => { const e = $('p3-orient'); if (e) e.remove(); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
  }

  async function exportSheetPdf(o) {
    if (!o.rows.length) return showToast('لا توجد بيانات للتصدير', 'info');
    if (!window.html2canvas || !window.jspdf) return showToast('مكتبة الـ PDF ماتحمّلتش — اتأكد من الإنترنت وجرّب تاني', 'error', 6000);
    showToast('جارٍ تجهيز ملف PDF...', 'info', 3000);
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-10000px;top:0;width:1123px;background:#fff;z-index:-1';
    document.body.appendChild(host);
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      const pdf = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
      const W = 297, H = 210, per = o.perPage || 18, pages = Math.max(1, Math.ceil(o.rows.length / per));
      for (let p = 0; p < pages; p++) {
        host.innerHTML = sheetHtml(o, o.rows.slice(p * per, (p + 1) * per), p + 1, pages, true);
        const canvas = await window.html2canvas(host.firstElementChild, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
        let w = W, h = canvas.height * W / canvas.width;
        if (h > H) { h = H; w = canvas.width * H / canvas.height; }
        if (p) pdf.addPage();
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', (W - w) / 2, 0, w, h);
      }
      pdf.save(o.filename);
      showToast('تم تحميل ملف PDF');
    } catch (err) { showError('تعذّر إنشاء PDF', err); }
    finally { host.remove(); }
  }

  /* =====================================================================
     2) شيت الكاش
     ===================================================================== */
  function getCashLines() {
    const dt = $('cash-date').value;
    return allRequestLines
      .filter(l => (l.payment_method || '').trim() === 'كاش' && (!dt || dayKey(lineDate(l)) === dt))
      .sort((a, b) => String(lineDate(a)).localeCompare(String(lineDate(b))));
  }
  function clientWithPeopleText(l) {
    const pTxt = typeof window.getRequestPeopleNamesText === 'function' ? window.getRequestPeopleNamesText(l.transaction_id, l.id, l.service) : '';
    return (l.client_name || '') + (pTxt ? ' (المستفيدون: ' + pTxt + ')' : '');
  }
  function cashDef() {
    const f = getCashLines(), dt = $('cash-date').value, total = f.reduce((s, l) => s + (Number(l.total) || 0), 0);
    return {
      title: 'شيت الكاش',
      meta: ['التاريخ: ' + (dt ? formatDateOnly(dt) : 'كل التواريخ')],
      stats: [['عدد بنود الكاش', f.length], ['عدد المعاملات', new Set(f.map(l => l.transaction_id)).size], ['إجمالي تحصيل الكاش', formatCurrency(total)]],
      headers: ['العميل والمستفيدون', 'التليفون', 'العنوان', 'Request ID', 'رقم الإيصال', 'الخدمة', 'العدد', 'الإجمالي', 'الموظف', 'مندوب الاستلام', 'وقت الاستلام'],
      rows: f.map(l => [clientWithPeopleText(l), l.phone, l.address, l.transaction_id, l.rn_nm, l.service, l.qty, formatCurrency(l.total), l.employee, l.receiver, formatDateTime(lineDate(l))]),
      filename: 'شيت_الكاش_' + (dt || 'كل_التواريخ') + '.pdf',
      perPage: 15
    };
  }
  window.filterCashSheet = function () {
    if (!$('cash-body')) return;
    const f = getCashLines(), total = f.reduce((s, l) => s + (Number(l.total) || 0), 0);
    $('cash-count').textContent = f.length;
    $('cash-total').textContent = formatCurrency(total);
    const dash = v => v ? eh(v) : '<span class="text-slate-300">—</span>';
    $('cash-body').innerHTML = f.map(l => {
      const pSub = typeof window.getRequestPeopleInlineBadge === 'function' ? window.getRequestPeopleInlineBadge(l.transaction_id, l.id, l.service) : '';
      return '<tr class="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">' +
      '<td class="px-5 py-3 font-semibold text-ink dark:text-white"><button ' + ac(l.client_name) + ' class="hover:text-brand-600 hover:underline text-start">' + eh(l.client_name) + '</button>' + pSub + '</td>' +
      '<td class="px-3 py-3 font-mono text-xs" dir="ltr">' + dash(l.phone) + '</td>' +
      '<td class="px-3 py-3 text-xs max-w-[180px]">' + dash(l.address) + '</td>' +
      '<td class="px-3 py-3 font-mono text-xs font-semibold text-brand-600" dir="ltr"><button ' + at(l.transaction_id) + ' class="hover:underline">' + eh(l.transaction_id) + '</button></td>' +
      '<td class="px-3 py-3 font-mono text-xs font-bold" dir="ltr">' + dash(l.rn_nm) + '</td>' +
      '<td class="px-3 py-3 text-xs font-medium">' + eh(l.service) + '</td>' +
      '<td class="px-3 py-3 text-center font-mono font-bold">' + eh(l.qty) + '</td>' +
      '<td class="px-3 py-3 font-mono font-bold text-brand-600">' + formatCurrency(l.total) + '</td>' +
      '<td class="px-3 py-3 text-xs">' + empCell(l.employee) + '</td>' +
      '<td class="px-3 py-3 text-xs">' + dash(l.receiver) + '</td>' +
      '<td class="px-3 py-3 font-mono text-xs text-slate-500">' + formatDateTime(lineDate(l)) + '</td></tr>';
    }).join('') || '<tr><td colspan="11" class="px-6 py-10 text-center text-slate-400">لا توجد معاملات كاش في هذا التاريخ</td></tr>';
    $('cash-cards-container').innerHTML = f.map(l =>
      '<div class="card p-4 space-y-2 text-xs">' +
      '<div class="flex items-center justify-between gap-2"><button ' + ac(l.client_name) + ' class="font-bold text-ink dark:text-white text-start">' + eh(l.client_name) + '</button><button ' + at(l.transaction_id) + ' class="font-mono text-brand-600 font-bold" dir="ltr">' + eh(l.transaction_id) + '</button></div>' +
      '<div class="text-slate-500" dir="ltr" style="text-align:right">' + eh(l.phone || '—') + '</div>' +
      (l.address ? '<div class="text-slate-500">' + eh(l.address) + '</div>' : '') +
      '<div class="font-medium">' + eh(l.service) + ' (×' + eh(l.qty) + ') — <b class="text-brand-600">' + formatCurrency(l.total) + '</b></div>' +
      '<div class="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500"><span>رقم الإيصال: <b class="font-mono text-ink dark:text-white">' + eh(l.rn_nm || '—') + '</b></span><span>المستلم: ' + eh(l.receiver || '—') + '</span></div>' +
      '<div class="flex items-center justify-between text-[11px] text-slate-400"><span>الموظف: ' + eh(l.employee || '—') + '</span><span>' + formatDateTime(lineDate(l)) + '</span></div></div>'
    ).join('') || '<div class="card p-6 text-center text-slate-400 text-xs">لا توجد معاملات كاش في هذا التاريخ</div>';
  };
  window.clearCashFilter = function () { $('cash-date').value = ''; window.filterCashSheet(); };
  window.exportCashCsv = function () {
    const d = cashDef();
    if (!d.rows.length) return showToast('لا توجد بيانات للتصدير', 'info');
    const f = getCashLines();
    downloadCsvFile('شيت_الكاش_' + ($('cash-date').value || 'كل_التواريخ') + '.csv', d.headers,
      f.map(l => [l.client_name, l.phone, l.address, l.transaction_id, l.rn_nm, l.service, l.qty, l.total, l.employee, l.receiver, lineDate(l)]));
  };
  window.printCashSheet = function () { printSheet(cashDef()); };
  window.exportCashPdf = function () { exportSheetPdf(cashDef()); };

  /* =====================================================================
     3) شيت المنفذين: تصدير PDF
     ===================================================================== */
  function execDef() {
    const ex = $('f-exec').value || 'all', dt = $('f-date').value, f = getFilteredExecLines(), cost = f.reduce((s, l) => s + execCostOf(l), 0);
    return {
      title: 'شيت متابعة المنفذين',
      meta: ['المنفذ: ' + (ex === 'all' ? 'كل المنفذين' : ex), 'تاريخ بداية التنفيذ: ' + (dt ? formatDateOnly(dt) : 'كل التواريخ')],
      stats: [['عدد بنود التنفيذ', f.length], ['إجمالي تكلفة التنفيذ', formatCurrency(cost)]],
      headers: ['العميل والمستفيدون', 'الهاتف', 'Request ID', 'Service ID', 'الخدمة', 'العدد', 'المنفذ', 'تكلفة الوحدة', 'إجمالي التنفيذ', 'بداية التنفيذ', 'ملاحظات'],
      rows: f.map(l => [clientWithPeopleText(l), l.phone, l.transaction_id, l.service_ref || '—', l.service, l.qty, l.executor, formatCurrency(Number(l.exec_unit_cost) || 0), formatCurrency(execCostOf(l)), formatDateOnly(l.exec_start_date || lineDate(l)), l.notes]),
      filename: 'شيت_المنفذين_' + (ex === 'all' ? 'الكل' : ex) + '_' + (dt || dayKey(new Date())) + '.pdf',
      perPage: 14
    };
  }
  window.exportExecPdf = function () { exportSheetPdf(execDef()); };
  window.printExecSheet = function () { printSheet(execDef()); };

  /* =====================================================================
     4) سجل تعليقات المعاملة التراكمي (على غرار ERP)
        - كل تعليق: الاسم + اليوم + التاريخ + الساعة
        - التعليقات تحت بعض والجديد بيتضاف تحت
        - خانة التعليق الجديد بتفضل فاضية، والقديم ما يتعدلش ولا يتمسح (مفيش UPDATE/DELETE في القاعدة)
     ===================================================================== */
  const txc = {}, txcDraft = {};
  let txcMissing = false, txcCh = null;
  const cmpC = (a, b) => String(a.created_at).localeCompare(String(b.created_at)) || (Number(a.id) - Number(b.id));
  const fmtWd = s => new Intl.DateTimeFormat('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(s));
  const fmtTm = s => new Intl.DateTimeFormat('ar-EG', { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(s));

  function txcShell(tx) {
    return '<div id="txc-box" class="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">' +
      '<div class="flex flex-wrap items-center justify-between gap-2 bg-slate-50 dark:bg-slate-800/60 px-4 py-2.5">' +
        '<h4 class="font-bold text-xs text-slate-600 dark:text-slate-300"><i class="fa-solid fa-clock-rotate-left ms-1.5"></i>سجل التعليقات <span id="txc-count" class="font-mono text-slate-400"></span></h4>' +
        '<span class="text-[10px] text-slate-400">التعليق بعد تسجيله لا يُعدَّل ولا يُحذف</span></div>' +
      '<div id="txc-list" class="max-h-72 overflow-y-auto p-3 space-y-2 bg-slate-50/50 dark:bg-slate-950/30"></div>' +
      '<form id="txc-form" onsubmit="txcSubmit(event)" data-tx="' + eh(tx) + '" class="border-t border-slate-200 dark:border-slate-700 p-3 space-y-2">' +
        '<label class="label !mb-0" for="txc-input">إضافة تعليق جديد</label>' +
        '<textarea id="txc-input" rows="2" maxlength="1000" class="field" placeholder="اكتب التعليق هنا..." oninput="txcDraftSet(this.value)" onkeydown="if((event.ctrlKey||event.metaKey)&&event.key===\'Enter\'){this.form.requestSubmit()}"></textarea>' +
        '<div class="flex flex-wrap items-center justify-between gap-2"><span class="text-[11px] text-slate-400">هيتسجّل باسم: <b class="text-slate-600 dark:text-slate-300">' + eh(me()) + '</b> مع اليوم والتاريخ والساعة</span>' +
        '<button id="txc-btn" type="submit" class="rounded-xl bg-brand-600 hover:bg-brand-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-60"><i class="fa-solid fa-plus ms-1"></i>إضافة التعليق</button></div>' +
      '</form></div>';
  }
  function txcEntry(c) {
    const p = (typeof profileById === 'function' && profileById(c.author_id)) || { id: c.author_id, full_name: c.author_name };
    return '<div class="flex gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">' + avatarHtml(p, 32) +
      '<div class="min-w-0 flex-1"><div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5"><span class="font-bold text-xs text-ink dark:text-white">' + eh(c.author_name) + '</span>' +
      '<span class="text-[11px] text-slate-400"><bdi>' + eh(fmtWd(c.created_at)) + '</bdi> · <bdi>' + eh(fmtTm(c.created_at)) + '</bdi></span></div>' +
      '<div class="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700 dark:text-slate-200">' + eh(c.body) + '</div></div></div>';
  }
  function txcRender(tx, scroll) {
    const l = $('txc-list');
    if (!l || openTxCurrent !== tx) return;
    if (txcMissing) {
      l.innerHTML = '<div class="p-4 text-center text-xs text-slate-500">لازم تشغّل ملف <b class="font-mono">phase3-comments-receipts.sql</b> مرة واحدة في Supabase علشان سجل التعليقات يشتغل.</div>';
      $('txc-btn').disabled = true; $('txc-input').disabled = true; return;
    }
    const arr = txc[tx];
    if (!arr) { l.innerHTML = '<div class="py-6 text-center text-xs text-slate-400"><i class="fa-solid fa-spinner fa-spin ms-1"></i> جارٍ تحميل التعليقات...</div>'; return; }
    $('txc-count').textContent = arr.length ? '(' + arr.length + ')' : '';
    l.innerHTML = arr.length ? arr.map(txcEntry).join('') : '<div class="py-6 text-center text-xs text-slate-400">لا توجد تعليقات على المعاملة دي لسه</div>';
    if (scroll) l.scrollTop = l.scrollHeight;
  }
  async function txcLoad(tx) {
    if (!sbClient) return;
    const r = await sbClient.from('tx_comments').select('id,transaction_id,author_id,author_name,body,created_at')
      .eq('transaction_id', tx).order('created_at', { ascending: true }).order('id', { ascending: true });
    if (r.error) {
      if (missingTable(r.error)) txcMissing = true; else showError('تعذّر تحميل التعليقات', r.error);
      txcRender(tx); return;
    }
    txcMissing = false; txc[tx] = r.data || []; txcRender(tx, true);
  }
  function txcPush(c) {
    const a = txc[c.transaction_id] = txc[c.transaction_id] || [];
    if (a.some(x => String(x.id) === String(c.id))) return false;
    a.push(c); a.sort(cmpC);
    if (openTxCurrent === c.transaction_id) txcRender(c.transaction_id, true);
    return true;
  }
  window.txcDraftSet = function (v) { if (openTxCurrent) txcDraft[openTxCurrent] = v; };
  window.txcSubmit = async function (e) {
    e.preventDefault();
    const tx = e.target.dataset.tx, inp = $('txc-input'), body = (inp.value || '').trim(), btn = $('txc-btn');
    if (!body || !sbClient || !currentUser) return;
    btn.disabled = true;
    const r = await sbClient.from('tx_comments')
      .insert({ transaction_id: tx, author_id: currentUser.id, body: body })
      .select('id,transaction_id,author_id,author_name,body,created_at').single();
    btn.disabled = false;
    if (r.error) {
      if (missingTable(r.error)) { txcMissing = true; txcRender(tx); } else showError('تعذّر حفظ التعليق', r.error);
      return;
    }
    inp.value = ''; delete txcDraft[tx];
    txcPush(r.data);
    showToast('تم تسجيل التعليق');
  };
  function txcRealtime(p) {
    const c = p && p.new;
    if (!c || !c.transaction_id) return;
    if (!(txc[c.transaction_id] || openTxCurrent === c.transaction_id)) return;
    const added = txcPush(c);
    if (added && currentUser && c.author_id !== currentUser.id && openTxCurrent === c.transaction_id) showToast('تعليق جديد من ' + c.author_name, 'info', 2500);
  }
  const _openTx = window.openTxModal;
  window.openTxModal = function (tx) {
    _openTx(tx);
    if (!groupedOrders.some(x => x.transaction_id === tx)) return;
    const body = $('tx-modal-body');
    if (!body) return;
    body.insertAdjacentHTML('beforeend', txcShell(tx));
    if (txcDraft[tx]) $('txc-input').value = txcDraft[tx];
    txcRender(tx, true);
    txcLoad(tx);
  };

  /* =====================================================================
     5) حالة الرسائل في الشات: "وصلت" للمرسل، و"اتقرأت" داخل مربع الرسالة
     ===================================================================== */
  const rc = {};                 // message_id -> { user_id: {d: وقت الوصول, r: وقت القراءة} }
  let rcOK = true, rcCh = null, rcTimer = null;
  const rcSet = row => { (rc[String(row.message_id)] = rc[String(row.message_id)] || {})[row.user_id] = { d: row.delivered_at, r: row.read_at }; };
  const myRc = mid => (rc[String(mid)] || {})[currentUser.id] || null;
  const rcFail = err => { if (missingTable(err)) { rcOK = false; console.info('message_receipts غير موجود: شغّل phase3-comments-receipts.sql'); } else console.warn('receipts', err); };

  async function rcFetch(ids, onlyMine) {
    if (!rcOK || !ids.length || !sbClient) return;
    for (let i = 0; i < ids.length; i += 60) {
      let q = sbClient.from('message_receipts').select('message_id,user_id,delivered_at,read_at').in('message_id', ids.slice(i, i + 60));
      if (onlyMine) q = q.eq('user_id', currentUser.id);
      const r = await q;
      if (r.error) return rcFail(r.error);
      (r.data || []).forEach(rcSet);
    }
  }
  async function rcSave(rows) {
    if (!rcOK || !rows.length) return;
    const r = await sbClient.from('message_receipts').upsert(rows, { onConflict: 'message_id,user_id' });
    if (r.error) rcFail(r.error);
  }
  function ackDelivered(msgs) {
    if (!rcOK || !currentUser) return;
    const now = new Date().toISOString(), rows = [];
    (msgs || []).forEach(m => {
      if (!m || m.sender_id === currentUser.id || myRc(m.id)) return;
      const row = { message_id: m.id, user_id: currentUser.id, delivered_at: now };
      rcSet(row); rows.push(row);
    });
    rcSave(rows);
  }
  function ackRead(cid) {
    if (!rcOK || !currentUser) return;
    const now = new Date().toISOString(), rows = [];
    (chatMsgs[cid] || []).forEach(m => {
      if (m.sender_id === currentUser.id) return;
      const x = myRc(m.id);
      if (x && x.r) return;
      const row = { message_id: m.id, user_id: currentUser.id, delivered_at: (x && x.d) || now, read_at: now };
      rcSet(row); rows.push(row);
    });
    rcSave(rows);
  }
  async function rcCatchUp() {
    if (!rcOK || !sbClient || !currentUser) return;
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const r = await sbClient.from('messages').select('id,sender_id').neq('sender_id', currentUser.id).gte('created_at', since).order('created_at', { ascending: false }).limit(300);
    if (r.error || !r.data || !r.data.length) return;
    await rcFetch(r.data.map(m => m.id), true);
    ackDelivered(r.data);
  }
  function rcRealtime(p) {
    const row = p && p.new;
    if (!row || !row.message_id) return;
    rcSet(row);
    const cid = chatActive;
    if (cid && (chatMsgs[cid] || []).some(m => String(m.id) === String(row.message_id))) {
      clearTimeout(rcTimer);
      rcTimer = setTimeout(() => window.renderChatThread(false), 150);
    }
  }
  function rcLabel(m) {
    const it = chatItem(chatActive);
    if (!it) return '';
    const base = 'mt-1 flex items-center justify-end gap-1 text-[10px] ';
    const sent = '<div class="' + base + 'text-white/60"><i class="fa-regular fa-paper-plane"></i> تم الإرسال</div>';
    if (it.ch_kind === 'dm') {
      const x = (rc[String(m.id)] || {})[it.other_user];
      if (x && x.r) return '<div class="' + base + 'font-bold text-white border-t border-white/25 pt-1"><i class="fa-solid fa-eye"></i> اتقرأت · <bdi>' + eh(fmtTm(x.r)) + '</bdi></div>';
      if (x && x.d) return '<div class="' + base + 'text-white/85"><i class="fa-solid fa-inbox"></i> وصلت</div>';
      return sent;
    }
    const others = profiles.filter(p => p.id !== currentUser.id), n = others.length;
    const st = others.map(p => ({ p: p, x: (rc[String(m.id)] || {})[p.id] }));
    const rd = st.filter(s => s.x && s.x.r).length, dl = st.filter(s => s.x && (s.x.d || s.x.r)).length;
    if (!dl) return sent;
    const head = rd ? '<i class="fa-solid fa-eye"></i> اتقرأت ' + (rd === n ? 'من الكل' : 'من ' + rd + ' من ' + n) : '<i class="fa-solid fa-inbox"></i> وصلت لـ ' + dl + ' من ' + n;
    const rows = st.map(s => '<div class="flex justify-between gap-3"><span>' + eh(s.p.full_name || 'زميل') + '</span><span>' +
      (s.x && s.x.r ? 'اتقرأت · <bdi>' + eh(fmtTm(s.x.r)) + '</bdi>' : s.x && s.x.d ? 'وصلت' : 'لسه') + '</span></div>').join('');
    return '<details class="mt-1 text-[10px] text-white/85 ' + (rd ? 'border-t border-white/25 pt-1' : '') + '"><summary class="flex cursor-pointer list-none items-center justify-end gap-1 ' + (rd ? 'font-bold text-white' : '') + '">' + head + '</summary><div class="mt-1 space-y-0.5 text-white/90">' + rows + '</div></details>';
  }

  const _render = window.renderChatThread;
  window.renderChatThread = function (toBottom) {
    const box = $('chat-msgs');
    const near = box ? box.scrollHeight - box.scrollTop - box.clientHeight < 140 : false;
    _render(toBottom);
    if (!rcOK || !chatActive || !currentUser || !box) return;
    const byId = new Map((chatMsgs[chatActive] || []).map(m => [String(m.id), m]));
    box.querySelectorAll('[data-mid]').forEach(row => {
      const m = byId.get(row.dataset.mid);
      if (!m || m.sender_id !== currentUser.id) return;
      const bub = row.querySelector('.rounded-2xl');
      if (bub) bub.insertAdjacentHTML('beforeend', rcLabel(m));
    });
    if (toBottom || near) box.scrollTop = box.scrollHeight;
  };

  const _load = window.loadChatMessages;
  window.loadChatMessages = async function (cid, before) {
    await _load(cid, before);
    try {
      await rcFetch((chatMsgs[cid] || []).map(m => m.id), false);
      ackDelivered(chatMsgs[cid] || []);
    } catch (e) { console.warn('receipts load', e); }
  };

  const _mark = window.markChatRead;
  window.markChatRead = async function (cid) { await _mark(cid); ackRead(cid); };

  const _ins = window.onChatInsert;
  window.onChatInsert = async function (m) {
    if (m && currentUser && m.sender_id !== currentUser.id) ackDelivered([m]);
    return _ins(m);
  };

  const _td = window.teardownChat;
  window.teardownChat = function () {
    try { if (rcCh && sbClient) sbClient.removeChannel(rcCh); } catch (e) {}
    try { if (txcCh && sbClient) sbClient.removeChannel(txcCh); } catch (e) {}
    rcCh = null; txcCh = null; rcOK = true;
    Object.keys(rc).forEach(k => delete rc[k]);
    return _td();
  };
  const _init = window.initChat;
  window.initChat = async function () {
    await _init();
    if (!sbClient || !currentUser) return;
    try {
      rcCh = sbClient.channel('p3-receipts').on('postgres_changes', { event: '*', schema: 'public', table: 'message_receipts' }, rcRealtime).subscribe();
      txcCh = sbClient.channel('p3-txcomments').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tx_comments' }, txcRealtime).subscribe();
    } catch (e) { console.warn('p3 realtime', e); }
    if (chatReady) rcCatchUp();
  };

  /* تاريخ شيت الكاش الافتراضي = اليوم */
  const cd = $('cash-date');
  if (cd && !cd.value) cd.value = new Date().toLocaleDateString('en-CA');
})();
