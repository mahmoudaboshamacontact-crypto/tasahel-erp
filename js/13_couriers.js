/* ===== المرحلة 11 (محدّثة): المناديب (مشاوير الاستلام والتسليم + كروت المناديب بأسماء العملاء + طباعة الشيت بالعملاء + نافذة اختيار المندوب في المقدمة) ===== */
(function () {
  if (window.__phase11) return; window.__phase11 = true;
  const FALLBACK = ['علي صالح', 'محمد طه', 'سمير محمد', 'مصطفي محمد'], COURIERS = FALLBACK.slice(), ALLC = FALLBACK.map((n, i) => ({ id: null, name: n, active: true, sort_order: i + 1 })), FEE = 40, MGR = 'mahmoud.aboshama@tasahel.com.eg';
  let couriersTable = false, couriersAt = 0; window.__courierFee = FEE;
  const eh = escapeHtml, nn = s => normName(s), isFar = s => /^رسوم توصيل/.test(nn(s));
  const cName = s => COURIERS.find(c => nn(c) === nn(s)) || null;
  const isMgr = () => window.__role ? window.__role === 'manager' : !!(currentUser && ['mahmoud.aboshama@tasahel.com.eg','mahmoud.aboshama.contact@gmail.com'].includes(String(currentUser.email || '').toLowerCase()));
  const miss = e => /42P01|PGRST205|does not exist|schema cache/i.test(((e && e.message) || '') + ' ' + ((e && e.code) || ''));
  const today = () => new Date().toLocaleDateString('en-CA');
  const uname = () => (myProfile && myProfile.full_name) || (currentUser && currentUser.email) || '';
  const sqlHint = () => showToast('لازم تشغّل ملف phase11-couriers.sql في Supabase علشان مشاوير المناديب تتسجل', 'error', 9000);

  /* ---------- 1) خانة مندوب الاستلام + قايمة المناديب ---------- */
  const rc = $('receiver');
  if (rc && !$('pickup-courier')) rc.parentElement.insertAdjacentHTML('afterend', '<div><label class="label" for="pickup-courier">مندوب الاستلام</label><select id="pickup-courier" class="field"><option value="">بدون مندوب (العميل سلّم بنفسه)</option>' + COURIERS.map(c => '<option>' + eh(c) + '</option>').join('') + '</select></div>');
  document.body.insertAdjacentHTML('beforeend', '<datalist id="courier-dl">' + COURIERS.map(c => '<option value="' + eh(c) + '"></option>').join('') + '</datalist>');

  /* ---------- 1-ب) المناديب من الجدول (لو الجدول لسه متعملش نكمل بالقايمة القديمة) ---------- */
  function paintCourierLists() {
    const p = $('pickup-courier');
    if (p) { const v = p.value; p.innerHTML = '<option value="">بدون مندوب (العميل سلّم بنفسه)</option>' + COURIERS.map(c => '<option>' + eh(c) + '</option>').join(''); if (COURIERS.includes(v)) p.value = v; }
    const d = $('courier-dl'); if (d) d.innerHTML = COURIERS.map(c => '<option value="' + eh(c) + '"></option>').join('');
  }
  async function loadCouriers(force) {
    if (!sbClient || !currentUser) return;
    if (!force && Date.now() - couriersAt < 60000) return;
    couriersAt = Date.now();
    const r = await sbClient.from('couriers').select('*').order('sort_order').order('id');
    if (r.error) { couriersTable = false; return; }
    couriersTable = true;
    ALLC.length = 0; (r.data || []).forEach(x => ALLC.push(x));
    COURIERS.length = 0; ALLC.filter(x => x.active).forEach(x => COURIERS.push(x.name));
    paintCourierLists();
  }
  const _lid = window.loadInitialData;
  window.loadInitialData = async function () { const x = await _lid.apply(this, arguments); loadCouriers(true); return x; };

  /* ---------- 2) رسوم التوصيل: لازم اسم مندوب ---------- */
  const _oss = window.onServiceSelected;
  window.onServiceSelected = function (id, name) {
    _oss(id, name);
    const el = $(id), ex = el && el.querySelector('.svc-executor'); if (!ex) return;
    if (isFar(name)) { ex.setAttribute('list', 'courier-dl'); ex.placeholder = 'اسم المندوب (إجباري)'; if (!cName(ex.value)) ex.value = ''; ex.classList.add('!border-rose-400'); }
    else if (ex.getAttribute('list') === 'courier-dl') { ex.setAttribute('list', 'exec-datalist'); ex.placeholder = 'اسم المنفذ...'; ex.classList.remove('!border-rose-400'); }
  };

  async function putTrip(tx, kind, courier, day) {
    if (!sbClient) return;
    const c = cName(courier) || (courier && courier.trim() && courier.trim() !== '—' ? courier.trim() : null);
    if (kind === 'pickup' && !c) return;
    const r = await sbClient.from('courier_trips').upsert({ transaction_id: tx, kind: kind, courier: c || '—', fee: c ? FEE : 0, trip_day: day || today(), created_by: uname() }, { onConflict: 'transaction_id,kind' });
    if (r.error) { if (miss(r.error)) sqlHint(); else showError('تعذّر تسجيل مشوار المندوب', r.error); }
  }
  const txExists = async tx => { const r = await sbClient.from('request_lines').select('id').eq('transaction_id', tx).limit(1); return !!(r.data && r.data.length); };

  /* ---------- 3) حفظ المعاملة: تحقق المندوب + تسجيل مشوار الاستلام ---------- */
  const _so = window.handleSaveOrder;
  window.handleSaveOrder = async function (e) {
    if (e && e.preventDefault) e.preventDefault();
    for (const el of Array.from($('lines-container').children)) {
      const s = el.querySelector('.svc-name').value, ex = el.querySelector('.svc-executor');
      if (isFar(s)) {
        const c = cName(ex.value);
        if (!c) { ex.focus(); ex.classList.add('!border-rose-400'); return showToast('خدمة "' + s.trim() + '" لازم تدخل اسم المندوب (' + COURIERS.join(' - ') + ') قبل الحفظ', 'error', 9000); }
        ex.value = c;
      }
    }
    const tx = $('tx-id').value.trim(), pk = $('pickup-courier') ? $('pickup-courier').value : '', day = ($('received-at').value || '').slice(0, 10);
    const before = sbClient && tx ? await txExists(tx) : true;
    await _so(e);
    if (!sbClient || !tx || before) return;
    if (await txExists(tx)) { await putTrip(tx, 'pickup', pk, day); if ($('pickup-courier')) $('pickup-courier').value = ''; }
  };

  /* ---------- 4) تم التسليم: اسأل مين المندوب (يظهر في المقدمة z-[300] فوق كارت العميل/المعاملة) ---------- */
  function ask(n) {
    return new Promise(res => {
      const old = $('courier-ask-modal'); if (old) old.remove();
      const d = document.createElement('div');
      d.id = 'courier-ask-modal';
      d.className = 'fixed inset-0 z-[300] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs';
      d.innerHTML = '<div class="card w-full max-w-md space-y-4 p-5 shadow-2xl border border-slate-200 dark:border-slate-700">' +
        '<div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">' +
          '<div class="flex items-center gap-2 font-bold text-ink dark:text-white text-base"><i class="fa-solid fa-motorcycle text-brand-600"></i><span>تحديد مندوب التسليم' + (n > 1 ? ' (' + n + ' معاملات)' : '') + '</span></div>' +
          '<button type="button" data-x="1" class="h-7 w-7 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
        '<div class="space-y-2">' +
          '<label class="label" for="ask-courier-sel">اختر اسم المندوب من القائمة أو الأزرار السريعة:</label>' +
          '<div class="flex gap-2">' +
            '<select id="ask-courier-sel" class="field flex-1 text-xs font-bold">' +
              '<option value="">-- اختر اسم المندوب --</option>' +
              COURIERS.map(c => '<option value="' + eh(c) + '">' + eh(c) + '</option>').join('') +
            '</select>' +
            '<button type="button" data-sel="1" class="rounded-xl bg-brand-600 hover:bg-brand-700 px-4 py-2 text-xs font-bold text-white shrink-0">تأكيد المندوب</button>' +
          '</div>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-2">' +
          COURIERS.map(c => '<button type="button" data-c="' + eh(c) + '" class="rounded-xl bg-brand-500 hover:bg-brand-600 py-2.5 text-sm font-bold text-slate-950 transition-colors"><i class="fa-solid fa-user-check ms-1 text-xs"></i>' + eh(c) + '</button>').join('') +
        '</div>' +
        '<button type="button" data-c="" class="w-full rounded-xl bg-slate-100 hover:bg-slate-200 py-2.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">العميل استلم بنفسه من المكتب (بدون مندوب)</button>' +
        '<button type="button" data-x="1" class="w-full text-xs text-slate-500 hover:underline py-1">إلغاء</button>' +
      '</div>';
      d.onclick = ev => {
        const b = ev.target.closest('button'); if (!b) return;
        if (b.dataset.sel) {
          const val = ($('ask-courier-sel') && $('ask-courier-sel').value) || '';
          if (!val) return showToast('اختر اسم المندوب الأول أو اضغط استلم بنفسه', 'error');
          d.remove(); res(val); return;
        }
        d.remove(); res(b.dataset.x ? null : b.dataset.c);
      };
      document.body.appendChild(d);
    });
  }

  let prePickedCourier = undefined;
  const _stg = window.stageTxStatus;
  if (typeof _stg === 'function') {
    window.stageTxStatus = async function (s) {
      _stg(s);
      if (s === 'Delivered') {
        const pick = await ask(1);
        if (pick === null) return;
        prePickedCourier = pick;
        if (typeof window.saveTxChanges === 'function') await window.saveTxChanges();
        prePickedCourier = undefined;
      }
    };
  }

  const _as = window.applyStatus;
  window.applyStatus = async function (ids, status) {
    if (status !== 'Delivered' || !sbClient) return _as(ids, status);
    const txs = [...new Set(ids.map(id => { const l = allRequestLines.find(x => String(x.id) === String(id)); return l && l.transaction_id; }).filter(Boolean))];
    let need = txs.slice(), pick = '';
    if (txs.length) {
      if (prePickedCourier !== undefined) {
        pick = prePickedCourier;
      } else {
        const r = await sbClient.from('courier_trips').select('transaction_id,courier').eq('kind', 'delivery').in('transaction_id', txs);
        if (r.error) { if (miss(r.error)) sqlHint(); }
        else {
          const have = new Set((r.data || []).filter(x => x.courier && x.courier !== '—').map(x => x.transaction_id));
          need = txs.filter(t => !have.has(t));
          if (!need.length) need = txs.slice();
          pick = await ask(need.length);
          if (pick === null) return false;
        }
      }
    }
    const ok = await _as(ids, status);
    if (ok) for (const t of need) await putTrip(t, 'delivery', pick, today());
    return ok;
  };

  /* ---------- 5) تاب المناديب + كروت المناديب بالمعاملات وأسماء العملاء ---------- */
  const nb = $('tab-notes-btn'), nt = $('tab-notes');
  if (nb && nt && !$('tab-couriers')) {
    nb.insertAdjacentHTML('afterend', '<button id="tab-couriers-btn" onclick="switchTab(\'couriers\')" class="tab-btn"><i class="fa-solid fa-motorcycle"></i><span>المناديب</span></button>');
    nt.insertAdjacentHTML('afterend', '<div id="tab-couriers" class="hidden space-y-4"></div>');
  }
  const _st = window.switchTab;
  window.switchTab = function (id) {
    _st(id);
    const ld = loadCouriers(id === 'couriers');
    const t = $('tab-couriers'), b = $('tab-couriers-btn'), on = id === 'couriers'; if (!t || !b) return;
    t.classList.toggle('hidden', !on);
    b.className = 'tab-btn ' + (on ? 'bg-ink text-white dark:bg-brand-600 shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800');
    if (on) ld.then(render);
  };

  let mode = 'week', anchor = today(), seq = 0, last = null;
  const f = d => d.toLocaleDateString('en-CA');
  function range() {
    const a = new Date(anchor + 'T00:00:00'); let s, e;
    if (mode === 'week') { s = new Date(a); s.setDate(a.getDate() - ((a.getDay() + 1) % 7)); e = new Date(s); e.setDate(s.getDate() + 6); }
    else { s = new Date(a.getFullYear(), a.getMonth(), 1); e = new Date(a.getFullYear(), a.getMonth() + 1, 0); }
    return [f(s), f(e)];
  }
  window.courierMode = m => { mode = m; render(); };
  window.courierAnchor = v => { if (v) { anchor = v; render(); } };
  window.courierShift = n => { const a = new Date(anchor + 'T00:00:00'); if (mode === 'week') a.setDate(a.getDate() + 7 * n); else a.setMonth(a.getMonth() + n); anchor = f(a); render(); };
  const btn = (m, t) => '<button type="button" onclick="courierMode(\'' + m + '\')" class="rounded-md px-3 py-1.5 text-xs font-semibold ' + (mode === m ? 'bg-ink text-white dark:bg-brand-600' : '') + '">' + t + '</button>';
  const head = (s, e) => '<div class="card flex flex-wrap items-center justify-between gap-3 p-4"><div><h2 class="text-base font-bold text-ink dark:text-white"><i class="fa-solid fa-motorcycle ms-1.5"></i>كشف المناديب ومشاوير العملاء</h2><p class="mt-0.5 text-xs text-slate-500">من ' + eh(formatDateOnly(s)) + ' إلى ' + eh(formatDateOnly(e)) + ' · أجر المشوار ' + FEE + ' ج</p></div><div class="flex flex-wrap items-center gap-2"><div class="inline-flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">' + btn('week', 'أسبوعي') + btn('month', 'شهري') + '</div><button type="button" onclick="courierShift(-1)" class="rounded-lg bg-slate-100 px-3 py-2 text-xs dark:bg-slate-800"><i class="fa-solid fa-chevron-right"></i></button><input type="date" value="' + anchor + '" onchange="courierAnchor(this.value)" class="field !w-40 !py-2 font-mono text-xs"><button type="button" onclick="courierShift(1)" class="rounded-lg bg-slate-100 px-3 py-2 text-xs dark:bg-slate-800"><i class="fa-solid fa-chevron-left"></i></button></div></div>';

  function getTxInfo(txId, txMap) {
    if (!txId) return { client_name: '—', phone: '', address: '', services: '' };
    if (txMap && txMap.has(String(txId))) return txMap.get(String(txId));
    const o = (window.groupedOrders || []).find(g => String(g.transaction_id) === String(txId));
    if (o) {
      const svcs = [...new Set((o.lines || []).map(l => l.service).filter(Boolean))].join('، ');
      return { client_name: o.client_name || '—', phone: o.phone || '', address: o.address || '', services: svcs };
    }
    const ls = (window.allRequestLines || []).filter(l => String(l.transaction_id) === String(txId));
    if (ls.length) {
      const svcs = [...new Set(ls.map(l => l.service).filter(Boolean))].join('، ');
      return { client_name: ls[0].client_name || '—', phone: ls[0].phone || '', address: ls[0].address || '', services: svcs };
    }
    return { client_name: '—', phone: '', address: '', services: '' };
  }

  function renderCourierBoxes(rows, trips, far, txMap) {
    if (!rows.length) return '';
    const cards = rows.map(r => {
      const myTrips = trips.filter(t => nn(t.courier) === nn(r.c) && Number(t.fee) > 0);
      const myFar = far.filter(l => nn(l.executor) === nn(r.c));
      const allItems = [
        ...myTrips.map(t => {
          const info = getTxInfo(t.transaction_id, txMap);
          return {
            id: t.id,
            day: t.trip_day,
            tx: t.transaction_id,
            client: info.client_name,
            phone: info.phone,
            address: info.address,
            services: info.services,
            typeLabel: t.kind === 'pickup' ? 'استلام من عميل' : 'تسليم لعميل',
            typeCls: t.kind === 'pickup' ? 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
            fee: Number(t.fee) || 0,
            canDel: true
          };
        }),
        ...myFar.map(l => {
          const info = getTxInfo(l.transaction_id, txMap);
          return {
            id: null,
            day: String(l.received_at || '').slice(0, 10),
            tx: l.transaction_id,
            client: l.client_name || info.client_name,
            phone: l.phone || info.phone,
            address: l.address || info.address,
            services: l.service || info.services,
            typeLabel: 'مشوار بعيد (' + (l.service || 'توصيل') + ')',
            typeCls: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
            fee: Number(l.exec_total) || (Number(l.qty) || 0) * (Number(l.exec_unit_cost) || 0),
            canDel: false
          };
        })
      ].sort((a, b) => String(b.day).localeCompare(String(a.day)));

      const tableRows = allItems.length ? allItems.map((it, idx) =>
        '<tr class="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">' +
          '<td class="px-2.5 py-2 font-mono text-slate-400">' + (idx + 1) + '</td>' +
          '<td class="px-2.5 py-2 font-mono whitespace-nowrap">' + eh(formatDateOnly(it.day)) + '</td>' +
          '<td class="px-2.5 py-2 font-mono whitespace-nowrap"><button type="button" data-tx="' + eh(it.tx) + '" onclick="openTxModal(this.dataset.tx)" class="text-brand-600 hover:underline font-bold" dir="ltr">' + eh(it.tx) + '</button></td>' +
          '<td class="px-2.5 py-2"><div class="font-bold text-ink dark:text-white">' + eh(it.client) + '</div>' + (it.phone ? '<div class="text-[11px] font-mono text-slate-400" dir="ltr">' + eh(it.phone) + '</div>' : '') + (it.services ? '<div class="text-[11px] text-slate-500 truncate max-w-[180px]">' + eh(it.services) + '</div>' : '') + '</td>' +
          '<td class="px-2.5 py-2 whitespace-nowrap"><span class="rounded-full px-2 py-0.5 text-[11px] font-bold ' + it.typeCls + '">' + eh(it.typeLabel) + '</span></td>' +
          '<td class="px-2.5 py-2 font-mono font-bold whitespace-nowrap">' + formatCurrency(it.fee) + '</td>' +
          '<td class="px-2 py-2">' + (it.canDel && isMgr() && !r.closed ? '<button type="button" onclick="courierDelTrip(' + it.id + ')" class="text-rose-500 hover:text-rose-700 px-1" title="حذف المشوار"><i class="fa-solid fa-trash-can"></i></button>' : '') + '</td>' +
        '</tr>'
      ).join('') : '<tr><td colspan="7" class="p-5 text-center text-slate-400">لا توجد ريكوستات مسجلة لهذا المندوب في هذه الفترة</td></tr>';

      return '<div class="card overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col">' +
        '<div class="flex flex-wrap items-center justify-between gap-2 bg-slate-50/90 dark:bg-slate-800/70 px-4 py-3 border-b border-slate-200/80 dark:border-slate-800">' +
          '<div class="flex items-center gap-2.5">' +
            '<span class="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-slate-950 font-bold"><i class="fa-solid fa-motorcycle"></i></span>' +
            '<div>' +
              '<div class="font-bold text-sm text-ink dark:text-white">' + eh(r.c) + ' <span class="text-xs font-normal text-slate-500">(' + allItems.length + ' مشوار)</span></div>' +
              '<div class="text-[11px] text-slate-500">استلام: <b>' + r.pk + '</b> · تسليم: <b>' + r.dl + '</b> · بعيدة: <b>' + r.nf + '</b> · الإجمالي: <b class="text-brand-600 font-mono">' + formatCurrency(r.tot) + '</b></div>' +
            '</div>' +
          '</div>' +
          '<button type="button" onclick="courierPrint(\'' + eh(r.c) + '\')" class="rounded-xl bg-ink hover:bg-slate-800 dark:bg-brand-600 dark:hover:bg-brand-700 text-white px-3.5 py-2 text-xs font-bold flex items-center gap-1.5 shadow-xs">' +
            '<i class="fa-solid fa-print"></i><span>طباعة شيت المندوب بالعملاء</span>' +
          '</button>' +
        '</div>' +
        '<div class="max-h-80 overflow-y-auto overflow-x-auto">' +
          '<table class="w-full text-right text-xs">' +
            '<thead class="bg-slate-100/70 dark:bg-slate-900/60 text-slate-500 sticky top-0">' +
              '<tr><th class="px-2.5 py-2">#</th><th class="px-2.5 py-2">التاريخ</th><th class="px-2.5 py-2">رقم الريكوست</th><th class="px-2.5 py-2">اسم العميل والخدمة</th><th class="px-2.5 py-2">النوع</th><th class="px-2.5 py-2">الأجر</th><th></th></tr>' +
            '</thead>' +
            '<tbody class="divide-y divide-slate-100 dark:divide-slate-800">' + tableRows + '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>';
    }).join('');

    return '<div class="space-y-3">' +
      '<div class="flex items-center justify-between px-1"><h3 class="text-sm font-bold text-ink dark:text-white"><i class="fa-solid fa-id-card-clip ms-1.5 text-brand-600"></i>مربعات المناديب بالريكوستات وأسماء العملاء</h3><span class="text-xs text-slate-500">اضغط «طباعة شيت المندوب بالعملاء» لطباعة كشف كامل شامل أسماء العملاء وأرقامهم</span></div>' +
      '<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">' + cards + '</div>' +
    '</div>';
  }

  async function render() {
    const root = $('tab-couriers'); if (!root || !sbClient) return;
    const my = ++seq, r0 = range(), s = r0[0], e = r0[1], nx = new Date(e + 'T00:00:00'); nx.setDate(nx.getDate() + 1); const e1 = f(nx);
    root.innerHTML = head(s, e) + '<div class="card p-6 text-center text-xs text-slate-400"><i class="fa-solid fa-spinner fa-spin ms-1"></i> جارٍ التحميل...</div>';
    const q = await Promise.all([
      sbClient.from('courier_trips').select('*').gte('trip_day', s).lte('trip_day', e).order('trip_day').limit(5000),
      sbClient.from('request_lines').select('id,transaction_id,client_name,phone,address,service,executor,qty,exec_unit_cost,exec_total,received_at').ilike('service', 'رسوم توصيل%').gte('received_at', (s + 'T00:00:00' > DATA_FROM_TS ? s + 'T00:00:00' : DATA_FROM_TS)).lt('received_at', e1 + 'T00:00:00').limit(5000),
      sbClient.from('courier_closings').select('*').eq('period_start', s).eq('period_end', e),
      sbClient.from('courier_cash').select('*').order('day', { ascending: false }).order('id', { ascending: false }).limit(5000)]);
    if (my !== seq) return;
    const tr = q[0], fr = q[1], cl = q[2], cash = q[3].error ? null : (q[3].data || []);
    if (tr.error || cl.error) { const er = tr.error || cl.error; root.innerHTML = head(s, e) + '<div class="card p-4 text-center text-xs text-slate-500">' + (miss(er) ? 'لازم تشغّل ملف <b class="font-mono">phase11-couriers.sql</b> في Supabase الأول.' : 'تعذّر تحميل البيانات') + '</div>'; return; }
    const trips = tr.data || [], far = fr.data || [];

    /* بناء خريطة أسماء العملاء لكل المعاملات الخاصة بالمناديب */
    const txMap = new Map();
    (window.groupedOrders || []).forEach(o => {
      if (o.transaction_id) {
        const svcs = [...new Set((o.lines || []).map(l => l.service).filter(Boolean))].join('، ');
        txMap.set(String(o.transaction_id), { client_name: o.client_name || '—', phone: o.phone || '', address: o.address || '', services: svcs });
      }
    });
    const missingTxs = [...new Set(trips.map(t => String(t.transaction_id || '')).filter(tx => tx && !txMap.has(tx)))];
    if (missingTxs.length) {
      try {
        const rx = await sbClient.from('request_lines').select('transaction_id,client_name,phone,address,service').in('transaction_id', missingTxs.slice(0, 400));
        if (!rx.error && rx.data) {
          rx.data.forEach(l => {
            const k = String(l.transaction_id || '');
            if (!k) return;
            if (!txMap.has(k)) txMap.set(k, { client_name: l.client_name || '—', phone: l.phone || '', address: l.address || '', services: l.service || '' });
            else if (l.service && !txMap.get(k).services.includes(l.service)) txMap.get(k).services += '، ' + l.service;
          });
        }
      } catch (e) {}
    }

    const heldOf = n => cash ? cash.filter(z => nn(z.courier) === nn(n)).reduce((s2, z) => s2 + (z.kind === 'collect' ? 1 : -1) * Number(z.amount), 0) : 0;
    const names = ALLC.filter(x => x.active || trips.some(t => nn(t.courier) === nn(x.name)) || far.some(l => nn(l.executor) === nn(x.name)) || heldOf(x.name) !== 0).map(x => x.name);
    const rows = names.map(c => {
      const t = trips.filter(x => nn(x.courier) === nn(c)), fl = far.filter(l => nn(l.executor) === nn(c));
      const fa = fl.reduce((a, l) => a + (Number(l.exec_total) || (Number(l.qty) || 0) * (Number(l.exec_unit_cost) || 0)), 0), ta = t.reduce((a, x) => a + Number(x.fee || 0), 0);
      return { c: c, pk: t.filter(x => x.kind === 'pickup').length, dl: t.filter(x => x.kind === 'delivery').length, nf: fl.length, fa: fa, ta: ta, tot: ta + fa, closed: (cl.data || []).find(x => nn(x.courier) === nn(c)), held: cash ? cash.filter(z => nn(z.courier) === nn(c)).reduce((s2, z) => s2 + (z.kind === 'collect' ? 1 : -1) * Number(z.amount), 0) : null };
    });
    last = { s: s, e: e, rows: rows, trips: trips, far: far, txMap: txMap };
    const td = 'px-3 py-2.5 font-mono', sum = k => rows.reduce((a, x) => a + x[k], 0);
    let h = head(s, e) + '<div class="card overflow-x-auto"><table class="w-full text-right text-xs"><thead class="bg-slate-50 text-slate-500 dark:bg-slate-800/60"><tr><th class="px-3 py-2.5">المندوب</th><th>استلام</th><th>تسليم</th><th>مشاوير بعيدة</th><th>أجر المشاوير</th><th>أجر البعيدة</th><th>الإجمالي</th><th>عهدة الكاش</th><th></th></tr></thead><tbody class="divide-y divide-slate-100 dark:divide-slate-800">' +
      rows.map(x => '<tr><td class="px-3 py-2.5 font-bold text-ink dark:text-white">' + eh(x.c) + '</td><td class="' + td + '">' + x.pk + '</td><td class="' + td + '">' + x.dl + '</td><td class="' + td + '">' + x.nf + '</td><td class="' + td + '">' + formatCurrency(x.ta) + '</td><td class="' + td + '">' + formatCurrency(x.fa) + '</td><td class="' + td + ' font-bold text-brand-600">' + formatCurrency(x.tot) + '</td><td class="' + td + '">' + (x.held == null ? '—' : formatCurrency(x.held)) + '</td><td class="whitespace-nowrap px-3 flex items-center gap-1.5 py-2"><button type="button" onclick="courierPrint(\'' + eh(x.c) + '\')" class="rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 px-2.5 py-1 text-[11px] font-bold text-slate-700 dark:text-slate-200" title="طباعة الكشف بأسماء العملاء"><i class="fa-solid fa-print ms-1"></i>طباعة الشيت</button>' +
        (x.closed ? '<span class="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">مُقفَّل</span>' + (isMgr() ? ' <button type="button" onclick="courierReopen(' + x.closed.id + ')" class="text-[11px] text-rose-500 underline">فتح</button>' : '') : (isMgr() ? '<button type="button" onclick="courierClose(\'' + eh(x.c) + '\')" class="rounded-lg bg-ink px-3 py-1.5 text-[11px] font-bold text-white dark:bg-brand-600">تقفيل</button>' : '')) + '</td></tr>').join('') +
      '</tbody><tfoot class="bg-slate-50 font-bold dark:bg-slate-800/60"><tr><td class="px-3 py-2.5">الإجمالي</td><td class="' + td + '">' + sum('pk') + '</td><td class="' + td + '">' + sum('dl') + '</td><td class="' + td + '">' + sum('nf') + '</td><td class="' + td + '">' + formatCurrency(sum('ta')) + '</td><td class="' + td + '">' + formatCurrency(sum('fa')) + '</td><td class="' + td + '">' + formatCurrency(sum('tot')) + '</td><td></td><td></td></tr></tfoot></table></div>';
    h += renderCourierBoxes(rows, trips, far, txMap);
    h += walletCard(cash);
    h += manageCard();
    root.innerHTML = h;
  }
  function walletNames(cash) {
    const a = COURIERS.slice();
    ALLC.forEach(x => { if (!x.active && !a.includes(x.name) && cash.filter(z => nn(z.courier) === nn(x.name)).reduce((s2, z) => s2 + (z.kind === 'collect' ? 1 : -1) * Number(z.amount), 0) !== 0) a.push(x.name); });
    return a;
  }
  function manageCard() {
    if (!isMgr()) return '';
    if (!couriersTable) return '<div class="card p-4 text-center text-xs text-slate-500">لازم تشغّل ملف <b class="font-mono">phase12-couriers-table.sql</b> في Supabase علشان تقدر تضيف وتوقف مناديب من هنا.</div>';
    const on = '<span class="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">شغّال</span>', off = '<span class="rounded-full bg-slate-200 px-2.5 py-0.5 text-[11px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">موقوف</span>';
    const rowsH = ALLC.map(x => '<tr><td class="px-3 py-2 font-bold text-ink dark:text-white">' + eh(x.name) + '</td><td class="px-3">' + (x.active ? on : off) + '</td><td class="px-3"><button type="button" onclick="courierToggle(' + x.id + ',' + (x.active ? 'false' : 'true') + ')" class="rounded-lg bg-slate-100 px-3 py-1 text-[11px] font-bold dark:bg-slate-800">' + (x.active ? 'إيقاف' : 'تفعيل') + '</button></td></tr>').join('') || '<tr><td class="p-4 text-center text-slate-400">لا يوجد مناديب</td></tr>';
    return '<details class="card overflow-hidden"><summary class="cursor-pointer bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-600 dark:bg-slate-800/60 dark:text-slate-300"><i class="fa-solid fa-users-gear ms-1.5"></i>إدارة المناديب (' + COURIERS.length + ' شغّال)</summary><div class="space-y-3 p-4"><form onsubmit="courierAdd(event)" class="flex flex-wrap items-end gap-2"><input id="cm-n" required placeholder="اسم المندوب الجديد" class="field !w-56 !py-2 text-xs"><button type="submit" class="rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700">إضافة</button></form><p class="text-[11px] text-slate-500">الإيقاف بيشيل المندوب من الاختيارات، لكن مشاويره القديمة وعهدته بتفضل ظاهرة في الكشوف. مفيش حذف ولا تعديل اسم، لأن السجل القديم مربوط بالاسم.</p><div class="overflow-x-auto"><table class="w-full text-right text-xs"><tbody class="divide-y divide-slate-100 dark:divide-slate-800">' + rowsH + '</tbody></table></div></div></details>';
  }
  window.courierAdd = async function (e) {
    e.preventDefault(); if (!isMgr()) return;
    const name = $('cm-n').value.replace(/\s+/g, ' ').trim(); if (!name) return;
    if (ALLC.some(x => nn(x.name) === nn(name))) return showToast('الاسم ده موجود بالفعل', 'error');
    const r = await sbClient.from('couriers').insert({ name: name, sort_order: ALLC.reduce((m, x) => Math.max(m, Number(x.sort_order) || 0), 0) + 1 });
    if (r.error) return showError('تعذّرت الإضافة', r.error);
    showToast('تمت إضافة ' + name); await loadCouriers(true); render();
  };
  window.courierToggle = async function (id, active) {
    if (!isMgr()) return;
    const x = ALLC.find(z => z.id === id); if (!x) return;
    if (!active && !confirm('إيقاف ' + x.name + '؟ هيتشال من الاختيارات، ومشاويره القديمة تفضل ظاهرة.')) return;
    const r = await sbClient.from('couriers').update({ active: active }).eq('id', id);
    if (r.error) return showError('تعذّر التعديل', r.error);
    showToast(active ? 'تم تفعيل ' + x.name : 'تم إيقاف ' + x.name); await loadCouriers(true); render();
  };
  function walletCard(cash) {
    if (!cash) return '<div class="card p-4 text-center text-xs text-slate-500">لازم تشغّل ملف <b class="font-mono">phase11b-courier-cash.sql</b> علشان محفظة الكاش تشتغل.</div>';
    const form = isMgr() ? '<form onsubmit="courierCashAdd(event)" class="flex flex-wrap items-end gap-2"><select id="cw-c" class="field !w-36 !py-2 text-xs">' + walletNames(cash).map(c => '<option>' + eh(c) + '</option>').join('') + '</select><select id="cw-k" class="field !w-48 !py-2 text-xs"><option value="collect">حصّل من عميل (عهدة عليه)</option><option value="handover">سلّم للمكتب</option></select><input id="cw-a" type="number" min="1" step="any" required placeholder="المبلغ" class="field !w-28 !py-2 text-center font-mono text-xs"><input id="cw-n" placeholder="ملاحظة (العميل / رقم المعاملة)" class="field !w-56 !py-2 text-xs"><button class="rounded-lg bg-brand-500 px-4 py-2 text-xs font-bold text-slate-950">تسجيل</button></form>' : '';
    const rowsH = cash.slice(0, 15).map(z => '<tr><td class="px-3 py-2 font-mono">' + eh(formatDateOnly(z.day)) + '</td><td class="font-bold">' + eh(z.courier) + '</td><td>' + (z.kind === 'collect' ? 'حصّل' : 'سلّم للمكتب') + '</td><td class="font-mono">' + formatCurrency(z.amount) + '</td><td class="text-slate-500">' + eh(z.note || '') + '</td><td>' + (isMgr() ? '<button type="button" onclick="courierCashDel(' + z.id + ')" class="px-2 text-rose-500"><i class="fa-solid fa-trash-can"></i></button>' : '') + '</td></tr>').join('') || '<tr><td class="p-4 text-center text-slate-400">لا توجد حركات كاش</td></tr>';
    return '<div class="card space-y-3 p-4"><div class="text-sm font-bold text-ink dark:text-white"><i class="fa-solid fa-wallet ms-1.5"></i>محفظة الكاش <span class="text-[11px] font-normal text-slate-500">(العهدة = المحصّل − المسلّم للمكتب، من أول يوم)</span></div>' + form + '<div class="max-h-64 overflow-x-auto overflow-y-auto"><table class="w-full text-right text-xs"><tbody class="divide-y divide-slate-100 dark:divide-slate-800">' + rowsH + '</tbody></table></div></div>';
  }
  window.courierCashAdd = async function (e) {
    e.preventDefault(); if (!isMgr()) return;
    const a = parseFloat($('cw-a').value); if (!(a > 0)) return;
    const r = await sbClient.from('courier_cash').insert({ courier: $('cw-c').value, kind: $('cw-k').value, amount: a, note: $('cw-n').value.trim() || null, day: today(), created_by: uname() });
    if (r.error) return showError('تعذّر تسجيل الحركة', r.error); showToast('تم التسجيل'); render();
  };
  window.courierCashDel = async function (id) {
    if (!isMgr() || !confirm('حذف الحركة دي؟')) return;
    const r = await sbClient.from('courier_cash').delete().eq('id', id); if (r.error) return showError('تعذّر الحذف', r.error); render();
  };
  window.courierPrint = function (c) {
    const x = last && last.rows.find(r => r.c === c); if (!x) return;
    const mine = last.trips.filter(t => nn(t.courier) === nn(c) && Number(t.fee) > 0), fl = last.far.filter(l => nn(l.executor) === nn(c));
    const cell = 'border:1px solid #999;padding:5px 8px;', cs = 'style="' + cell + '"';
    const th = a => '<tr style="background:#eee">' + a.map(z => '<th ' + cs + '>' + z + '</th>').join('') + '</tr>';
    const t1 = mine.map((t, i) => {
      const info = getTxInfo(t.transaction_id, last.txMap);
      return '<tr><td ' + cs + '>' + (i + 1) + '</td><td ' + cs + '>' + eh(formatDateOnly(t.trip_day)) + '</td><td ' + cs + '>' + eh(t.transaction_id) + '</td><td ' + cs + '><b>' + eh(info.client_name) + '</b>' + (info.phone ? '<div style="font-size:10px;color:#555">' + eh(info.phone) + '</div>' : '') + '</td><td ' + cs + '>' + eh(info.services || '—') + '</td><td ' + cs + '>' + (t.kind === 'pickup' ? 'استلام' : 'تسليم') + '</td><td ' + cs + '>' + formatCurrency(t.fee) + '</td></tr>';
    }).join('');
    const t2 = fl.map((l, i) => {
      const info = getTxInfo(l.transaction_id, last.txMap);
      return '<tr><td ' + cs + '>' + (i + 1) + '</td><td ' + cs + '>' + eh(formatDateOnly(l.received_at)) + '</td><td ' + cs + '>' + eh(l.transaction_id) + '</td><td ' + cs + '><b>' + eh(l.client_name || info.client_name) + '</b></td><td ' + cs + '>' + eh(l.service) + '</td><td ' + cs + '>' + formatCurrency(Number(l.exec_total) || (Number(l.qty) || 0) * (Number(l.exec_unit_cost) || 0)) + '</td></tr>';
    }).join('');
    $('print-content').innerHTML = '<div class="receipt-box" style="font-size:12px"><div style="display:flex;justify-content:space-between;border-bottom:2px solid #0b1b33;padding-bottom:8px;margin-bottom:10px"><div style="display:flex;flex-direction:column;align-items:flex-start;gap:4px">' + logoImg(40, 8) + '<div><div style="font-size:15px;font-weight:bold">قسم الخدمات الحكومية</div><div style="font-size:11px">كشف مشاوير مندوب بالعملاء</div></div></div><div style="font-size:11px"><div>المندوب: <b>' + eh(c) + '</b></div><div>الفترة: ' + eh(last.s) + ' إلى ' + eh(last.e) + '</div></div></div>' +
      '<div style="background:#f1f5f9;border:1px solid #ccc;padding:8px;margin-bottom:10px">أجر المشاوير: <b>' + formatCurrency(x.ta) + '</b> · أجر المشاوير البعيدة: <b>' + formatCurrency(x.fa) + '</b> · الإجمالي المستحق: <b>' + formatCurrency(x.tot) + '</b>' + (x.held == null ? '' : ' · عهدة الكاش (حتى اليوم): <b>' + formatCurrency(x.held) + '</b>') + '</div>' +
      '<div style="font-weight:bold;margin:6px 0">مشاوير الاستلام والتسليم (' + mine.length + ')</div><table style="width:100%;border-collapse:collapse;margin-bottom:10px">' + th(['#', 'التاريخ', 'المعاملة', 'اسم العميل والهاتف', 'الخدمة', 'النوع', 'الأجر']) + t1 + '</table>' +
      (fl.length ? '<div style="font-weight:bold;margin:6px 0">مشاوير بعيدة (' + fl.length + ')</div><table style="width:100%;border-collapse:collapse;margin-bottom:10px">' + th(['#', 'التاريخ', 'المعاملة', 'اسم العميل', 'الخدمة', 'الأجر']) + t2 + '</table>' : '') +
      '<table style="width:100%;border-collapse:collapse;margin-top:24px"><tr><td style="' + cell + 'padding:16px;text-align:center;background:#eee;width:25%"><b>توقيع المندوب</b></td><td ' + cs + ' width="25%"></td><td style="' + cell + 'text-align:center;background:#eee;width:25%"><b>توقيع المسؤول</b></td><td ' + cs + ' width="25%"></td></tr></table></div>';
    window.print();
  };
  window.courierClose = async function (c) {
    const x = last && last.rows.find(r => r.c === c); if (!x || !isMgr()) return;
    if (!confirm('تقفيل ' + c + ' عن الفترة من ' + last.s + ' إلى ' + last.e + '؟\nالإجمالي: ' + formatCurrency(x.tot))) return;
    const r = await sbClient.from('courier_closings').insert({ courier: c, period_type: mode, period_start: last.s, period_end: last.e, trips_count: x.pk + x.dl, trips_amount: x.ta, far_amount: x.fa, total: x.tot, closed_by: uname() });
    if (r.error) return showError('تعذّر التقفيل', r.error); showToast('تم تقفيل ' + c); render();
  };
  window.courierReopen = async function (id) {
    if (!isMgr() || !confirm('فتح التقفيل؟')) return;
    const r = await sbClient.from('courier_closings').delete().eq('id', id); if (r.error) return showError('تعذّر فتح التقفيل', r.error); render();
  };
  window.courierDelTrip = async function (id) {
    if (!isMgr() || !confirm('حذف المشوار ده؟')) return;
    const r = await sbClient.from('courier_trips').delete().eq('id', id); if (r.error) return showError('تعذّر الحذف', r.error); render();
  };
})();