
/* ===== المرحلة 7: سجل التغييرات + منع التكرار + تقفيل الكاش + نسخة احتياطية + تنبيه المتأخر + PWA ===== */
(function () {
  if (window.__phase7) return;
  window.__phase7 = true;
  const eh = escapeHtml, MGR = 'mahmoud.aboshama@tasahel.com.eg';
  const isMgr = () => window.__role ? window.__role === 'manager' : !!(currentUser && ['mahmoud.aboshama@tasahel.com.eg','mahmoud.aboshama.contact@gmail.com'].includes(String(currentUser.email || '').toLowerCase()));
  const missing = err => /42P01|PGRST205|does not exist|schema cache/i.test(((err && err.message) || '') + ' ' + ((err && err.code) || ''));
  const dnext = d => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + 1); return x.toLocaleDateString('en-CA'); };

  /* ---------- 1) سجل التغييرات داخل نافذة المعاملة ---------- */
  const FIELDS = { delivered: 'تم التسليم', complete: 'مكتمل', under_review: 'قيد المراجعة', qty: 'العدد', unit_price: 'سعر الوحدة', service: 'الخدمة', payment_method: 'طريقة الدفع', employee: 'الموظف', executor: 'المنفذ', client_name: 'العميل', phone: 'الهاتف', address: 'العنوان', receiver: 'المستلم', received_at: 'تاريخ الاستلام', rn_nm: 'رقم الإيصال', notes: 'ملاحظات', exec_start_date: 'بداية التنفيذ', exec_unit_cost: 'تكلفة التنفيذ', commission_per_unit: 'كوميشن الوحدة', duration_days: 'مدة التنفيذ' };
  const val = v => v === true ? 'نعم' : v === false ? 'لا' : (v == null || v === '') ? '—' : String(v);
  const fmtAt = s => new Intl.DateTimeFormat('ar-EG', { weekday: 'long', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(s));
  function audRow(a) {
    let body;
    if (a.action === 'created') body = 'أضاف بند <b>' + eh(a.service || '') + '</b>';
    else if (a.action === 'deleted') body = '<span class="text-rose-600">حذف بند ' + eh(a.service || '') + '</span>';
    else body = Object.keys(a.details || {}).map(k => '<div>' + eh(a.service || '') + ' — <b>' + eh(FIELDS[k] || k) + '</b>: <span class="text-slate-400 line-through">' + eh(val(a.details[k].old)) + '</span> ← <b>' + eh(val(a.details[k].new)) + '</b></div>').join('');
    return '<div class="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 text-xs"><div class="flex flex-wrap justify-between gap-2 text-[11px] text-slate-400"><span class="font-bold text-ink dark:text-white">' + eh(a.user_name || 'غير معروف') + '</span><span><bdi>' + eh(fmtAt(a.at)) + '</bdi></span></div><div class="mt-1 text-slate-600 dark:text-slate-300">' + body + '</div></div>';
  }
  const _ot = window.openTxModal;
  window.openTxModal = function (tx) {
    _ot(tx);
    const body = $('tx-modal-body');
    if (!body || !groupedOrders.some(x => x.transaction_id === tx)) return;
    body.insertAdjacentHTML('beforeend', '<details id="aud-box" class="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden"><summary class="cursor-pointer bg-slate-50 dark:bg-slate-800/60 px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-300"><i class="fa-solid fa-timeline ms-1.5"></i>سجل التغييرات</summary><div id="aud-list" class="max-h-60 overflow-y-auto space-y-2 p-3 bg-slate-50/50 dark:bg-slate-950/30"></div></details>');
    let done = false;
    $('aud-box').addEventListener('toggle', async function () {
      if (!this.open || done) return; done = true;
      const l = $('aud-list'); l.innerHTML = '<div class="py-4 text-center text-xs text-slate-400"><i class="fa-solid fa-spinner fa-spin ms-1"></i> جارٍ التحميل...</div>';
      const r = await sbClient.from('audit_log').select('at,user_name,action,service,details').eq('transaction_id', tx).order('at', { ascending: false }).limit(100);
      if (r.error) { l.innerHTML = '<div class="py-4 text-center text-xs text-slate-500">' + (missing(r.error) ? 'لازم تشغّل ملف <b class="font-mono">phase5-audit-cash.sql</b> علشان السجل يشتغل.' : 'تعذّر تحميل السجل') + '</div>'; return; }
      l.innerHTML = (r.data || []).map(audRow).join('') || '<div class="py-4 text-center text-xs text-slate-400">لا توجد تغييرات مسجلة على المعاملة دي</div>';
    });
  };

  /* ---------- 2) منع التكرار ---------- */
  const _so = window.handleSaveOrder;
  window.handleSaveOrder = async function (e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!sbClient) return _so(e);
    try {
      const tx = $('tx-id').value.trim(), rn = $('rn-nm').value.trim();
      if (tx) {
        const r = await sbClient.from('request_lines').select('client_name').eq('transaction_id', tx).limit(1);
        if (!r.error && r.data && r.data.length) { generateNewTxId(true); return showToast('رقم المعاملة ' + tx + ' مسجل قبل كده باسم ' + (r.data[0].client_name || '') + '. اتولّد رقم جديد، راجع واضغط حفظ تاني', 'error', 9000); }
      }
      if (rn) {
        const r = await sbClient.from('request_lines').select('client_name,transaction_id').eq('rn_nm', rn).limit(1);
        if (!r.error && r.data && r.data.length && !confirm('رقم الإيصال ' + rn + ' مسجل قبل كده على المعاملة ' + r.data[0].transaction_id + ' (' + (r.data[0].client_name || '') + ').\nتكمل الحفظ برضه؟')) return;
      }
    } catch (err) { console.warn('dup check', err); }
    return _so(e);
  };

  /* ---------- 3) تقفيل الكاش اليومي ---------- */
  let cseq = 0;
  async function cashByUser(day) {
    const r = await sbClient.from('request_lines').select('employee,total').eq('payment_method', 'كاش').gte('received_at', day + 'T00:00:00').lt('received_at', dnext(day) + 'T00:00:00').limit(5000);
    if (r.error) throw r.error;
    const m = new Map(); (r.data || []).forEach(l => { const p = profileByName(l.employee); if (p) m.set(p.id, (m.get(p.id) || 0) + (Number(l.total) || 0)); });
    return m;
  }
  const diffChip = d => d === 0 ? '<span class="rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 px-2.5 py-0.5 text-[11px] font-bold">مطابق</span>' : d < 0 ? '<span class="rounded-full bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 px-2.5 py-0.5 text-[11px] font-bold">عجز ' + formatCurrency(-d) + '</span>' : '<span class="rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 px-2.5 py-0.5 text-[11px] font-bold">زيادة ' + formatCurrency(d) + '</span>';
  async function renderCashClose() {
    const box = $('cash-close-box'); if (!box || !sbClient || !currentUser) return;
    const day = $('cash-date').value || new Date().toLocaleDateString('en-CA'), my = ++cseq;
    try {
      const cr = await sbClient.from('cash_closings').select('*').eq('day', day).order('created_at');
      if (cr.error) { if (missing(cr.error)) { box.innerHTML = '<div class="card p-4 text-center text-xs text-slate-500">لازم تشغّل ملف <b class="font-mono">phase5-audit-cash.sql</b> علشان تقفيل الكاش يشتغل.</div>'; return; } throw cr.error; }
      const exp = await cashByUser(day); if (my !== cseq) return;
      const mine = (cr.data || []).find(c => c.user_id === currentUser.id), myExp = exp.get(currentUser.id) || 0;
      let h = '<div class="card p-5 sm:p-6 space-y-4"><div class="flex items-center gap-3"><span class="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white"><i class="fa-solid fa-cash-register"></i></span><div><h3 class="font-bold text-ink dark:text-white text-base">تقفيل الكاش اليومي</h3><p class="text-xs text-slate-500">' + eh(formatDateOnly(day)) + '</p></div></div>';
      if (mine) h += '<div class="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3 text-xs"><span>المسجّل: <b class="font-mono">' + formatCurrency(mine.expected) + '</b></span><span>اللي سلّمته: <b class="font-mono">' + formatCurrency(mine.counted) + '</b></span>' + diffChip(Number(mine.counted) - Number(mine.expected)) + '<span class="text-emerald-600 font-bold"><i class="fa-solid fa-circle-check ms-1"></i>تم تقفيلك لليوم ده</span></div>';
      else h += '<form onsubmit="cashCloseSubmit(event)" data-day="' + day + '" class="flex flex-wrap items-end gap-3"><div class="rounded-xl bg-slate-50 dark:bg-slate-800/50 px-4 py-2 text-xs"><div class="text-slate-400">الكاش المسجّل باسمك</div><div class="font-mono font-bold text-base text-ink dark:text-white">' + formatCurrency(myExp) + '</div></div><div class="min-w-[160px]"><label class="label" for="cc-counted">المبلغ اللي سلّمته فعلاً</label><input id="cc-counted" type="number" min="0" step="any" required class="field font-mono text-center"></div><div class="flex-1 min-w-[180px]"><label class="label" for="cc-notes">ملاحظات (اختياري)</label><input id="cc-notes" class="field"></div><button id="cc-btn" type="submit" class="rounded-xl bg-emerald-600 hover:bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white"><i class="fa-solid fa-check ms-1"></i>تأكيد التقفيل</button></form><p class="text-[11px] text-slate-400">بعد التأكيد مش بتقدر تعدّل، وبس المدير يقدر يلغي التقفيل.</p>';
      if (isMgr()) {
        const ids = new Set([...exp.keys(), ...(cr.data || []).map(c => c.user_id)]);
        const rows = [...ids].map(id => { const p = profiles.find(x => x.id === id) || { id: id, full_name: 'موظف' }, c = (cr.data || []).find(x => x.user_id === id); return { p: p, e: exp.get(id) || 0, c: c }; }).sort((a, b) => b.e - a.e);
        h += '<div class="overflow-x-auto border-t border-slate-100 dark:border-slate-800 pt-3"><table class="w-full text-xs text-right"><thead class="text-slate-400"><tr><th class="py-2">الموظف</th><th>المسجّل</th><th>المسلّم</th><th>الفرق</th><th>ملاحظات</th><th></th></tr></thead><tbody class="divide-y divide-slate-100 dark:divide-slate-800">' +
          (rows.map(r => '<tr><td class="py-2.5 font-bold text-ink dark:text-white">' + empCell(r.p.full_name) + '</td><td class="font-mono">' + formatCurrency(r.c ? r.c.expected : r.e) + '</td><td class="font-mono">' + (r.c ? formatCurrency(r.c.counted) : '—') + '</td><td>' + (r.c ? diffChip(Number(r.c.counted) - Number(r.c.expected)) : '<span class="rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 px-2.5 py-0.5 text-[11px] font-bold">لم يقفّل</span>') + '</td><td class="text-slate-500">' + eh(r.c && r.c.notes || '') + '</td><td>' + (r.c ? '<button type="button" data-id="' + r.c.id + '" onclick="cashCloseCancel(this.dataset.id)" class="text-rose-600 hover:underline">إلغاء</button>' : '') + '</td></tr>').join('') || '<tr><td colspan="6" class="py-6 text-center text-slate-400">لا يوجد كاش في اليوم ده</td></tr>') + '</tbody></table></div>';
      }
      box.innerHTML = h + '</div>';
    } catch (err) { console.warn('cash close', err); }
  }
  window.cashCloseSubmit = async function (e) {
    e.preventDefault();
    const day = e.target.dataset.day, counted = parseFloat($('cc-counted').value), btn = $('cc-btn');
    if (!(counted >= 0)) return;
    btn.disabled = true;
    try {
      const expected = (await cashByUser(day)).get(currentUser.id) || 0;
      if (counted !== expected && !confirm('المسجّل ' + formatCurrency(expected) + ' واللي كتبته ' + formatCurrency(counted) + '. تأكد التقفيل بالفرق ده؟')) { btn.disabled = false; return; }
      const r = await sbClient.from('cash_closings').insert({ day: day, user_id: currentUser.id, user_name: (myProfile && myProfile.full_name) || currentUser.email, expected: expected, counted: counted, notes: $('cc-notes').value.trim() || null });
      if (r.error) throw r.error;
      showToast('تم تقفيل الكاش'); renderCashClose();
    } catch (err) { showError('تعذّر التقفيل', err); btn.disabled = false; }
  };
  window.cashCloseCancel = async function (id) {
    if (!isMgr() || !confirm('إلغاء تقفيل الموظف ده؟')) return;
    const r = await sbClient.from('cash_closings').delete().eq('id', id);
    if (r.error) return showError('تعذّر الإلغاء', r.error);
    showToast('تم إلغاء التقفيل'); renderCashClose();
  };
  const tabCash = $('tab-cash');
  /* كارت تقفيل الكاش اليومي اتشال (P2): التقفيل اليومي مبقاش جزء من الإجراء الحالي */
  const _fc = window.filterCashSheet;
  window.filterCashSheet = function () { _fc(); renderCashClose(); };

  /* ---------- 4) نسخة احتياطية (للمدير) ---------- */
  const BK_TABLES = ['request_lines', 'services', 'profiles', 'tx_comments', 'emp_targets', 'month_closures', 'month_snapshots', 'cash_closings', 'audit_log', 'couriers', 'courier_trips', 'courier_cash', 'courier_closings', 'partner_ops', 'tasks'], BK_DAYS = 7;
  let bkBusy = false;
  /* بتقرأ الجدول كله. أي خطأ حقيقي بيوقف النسخة (مفيش نسخة ناقصة تتحفظ على إنها كاملة). الجدول الغايب بس بيتتخطى. */
  async function fetchAll(table) {
    const out = []; let useOrder = true;
    for (let f = 0; ; f += 1000) {
      let q = sbClient.from(table).select('*'); if (useOrder) q = q.order('id', { ascending: true });
      const r = await q.range(f, f + 999);
      if (r.error) {
        const m = (r.error.message || '') + ' ' + (r.error.code || '');
        if (useOrder && /42703|column/i.test(m)) { useOrder = false; f -= 1000; out.length = 0; continue; }
        if (f === 0 && /42P01|PGRST205|schema cache|relation .* does not exist/i.test(m)) return { missing: true, rows: [] };
        throw new Error(table + ': ' + (r.error.message || r.error.code));
      }
      out.push.apply(out, r.data || []);
      if ((r.data || []).length < 1000) break;
    }
    return { missing: false, rows: out };
  }
  function saveBlob(name, text, type) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type })); a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }
  function bkLast() { try { return JSON.parse(localStorage.getItem('tasahel_last_backup') || 'null'); } catch (e) { return null; } }
 function bkRemind() {
  const old = $('bk-banner'); if (old) old.remove();
  if (!isMgr()) return;
  const l = bkLast(), age = l ? (Date.now() - l.at) / 864e5 : Infinity, b = $('backup-btn');
  if (b) b.title = 'نسخة احتياطية' + (l ? ' (آخر نسخة: ' + new Date(l.at).toLocaleDateString('ar-EG') + ')' : ' (لم تؤخذ نسخة بعد)');
  if (age < BK_DAYS) return;
  document.body.insertAdjacentHTML('beforeend', '<div id="bk-banner" class="fixed bottom-2 left-2 right-2 z-[90] flex items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900 shadow-lg dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100 sm:bottom-14 sm:left-3 sm:right-auto sm:max-w-xs sm:flex-col sm:items-stretch sm:rounded-2xl sm:p-3 sm:text-xs"><div class="font-bold">' + (l ? 'آخر نسخة احتياطية من ' + Math.floor(age) + ' يوم' : 'لم تؤخذ نسخة احتياطية على الجهاز ده بعد') + '</div><div class="flex shrink-0 gap-1.5 sm:mt-2 sm:gap-2"><button type="button" onclick="backupAll()" class="rounded-lg bg-amber-500 px-2.5 py-1 font-bold text-slate-950 sm:px-3 sm:py-1.5">خد نسخة الآن</button><button type="button" onclick="this.closest(\'#bk-banner\').remove()" class="rounded-lg px-2 py-1 font-semibold sm:px-3 sm:py-1.5">لاحقاً</button></div></div>');
}
  window.backupAll = async function () {
    if (!isMgr() || !sbClient || bkBusy) return;
    bkBusy = true; showToast('جارٍ تجهيز النسخة الاحتياطية...', 'info', 4000);
    try {
      const data = {}, counts = {}, skipped = [];
      for (const t of BK_TABLES) { const r = await fetchAll(t); if (r.missing) { skipped.push(t); continue; } data[t] = r.rows; counts[t] = r.rows.length; }
      const day = new Date().toLocaleDateString('en-CA');
      saveBlob('tasahel-backup-' + day + '.json', JSON.stringify({ exported_at: new Date().toISOString(), counts: counts, skipped: skipped, tables: data }), 'application/json');
      const rl = data.request_lines || [];
      if (rl.length) {
        const keys = [...new Set(rl.flatMap(x => Object.keys(x)))];
        setTimeout(() => downloadCsvFile('tasahel-request_lines-' + day + '.csv', keys, rl.map(x => keys.map(k => x[k]))), 600);
      }
      try { localStorage.setItem('tasahel_last_backup', JSON.stringify({ at: Date.now(), n: rl.length })); } catch (e) { /* */ }
      bkRemind();
      showToast('تم تحميل النسخة الاحتياطية: ' + rl.length + ' بند و' + Object.keys(counts).length + ' جدول' + (skipped.length ? ' (اتخطّى جداول مش موجودة: ' + skipped.join('، ') + ')' : ''), 'success', 8000);
    } catch (err) { showError('تعذّر إنشاء النسخة، ولم يتم حفظ أي ملف', err); }
    bkBusy = false;
  };

  /* ---------- 5) تنبيه الطلبات المتأخرة على تبويب الداش بورد ---------- */
  let lateAt = 0;
  async function lateBadge(force) {
    if (!sbClient || !currentUser || (!force && Date.now() - lateAt < 300000)) return;
    lateAt = Date.now();
    const btn = $('tab-dash-btn'); if (!btn) return;
    try {
      const r = await sbClient.from('request_lines').select('exec_start_date,received_at,duration_days').eq('complete', false).gte('received_at', DATA_FROM_TS).not('duration_days', 'is', null).limit(1000);
      if (r.error) return;
      const t0 = new Date(); t0.setHours(0, 0, 0, 0);
      const n = (r.data || []).filter(l => { const b = new Date(String(l.exec_start_date || l.received_at || '').slice(0, 10) + 'T00:00'); return !isNaN(b) && Math.floor((t0 - new Date(b.getTime() + (Number(l.duration_days) || 0) * 864e5)) / 864e5) > 0; }).length;
      let s = $('late-badge');
      if (!s) { btn.insertAdjacentHTML('beforeend', '<span id="late-badge" class="hidden rounded-full bg-rose-600 text-white text-[10px] font-bold px-1.5 min-w-[18px] text-center leading-[18px]"></span>'); s = $('late-badge'); }
      s.textContent = n > 99 ? '99+' : String(n); s.title = n + ' طلب متأخر'; s.classList.toggle('hidden', !n);
    } catch (e) { /* تجاهل */ }
  }
  const syncBackupBtn = () => { const b = $('backup-btn'); if (b) b.classList.toggle('hidden', !isMgr()); };
  const _li = window.loadInitialData;
  window.loadInitialData = async function () { const x = await _li(); syncBackupBtn(); bkRemind(); lateBadge(true); return x; };
  const _lr3 = window.loadRecentRequests;
  window.loadRecentRequests = async function () { const x = await _lr3(); lateBadge(false); return x; };

  /* ---------- 6) PWA ---------- */
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
})();
