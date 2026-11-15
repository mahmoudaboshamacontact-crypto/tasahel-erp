/* ===== المرحلة 11 (محدّثة بالكامل): المناديب (كروت مناديب احترافية قابلة للطي بالسهم + فلاتر من/إلى ونوع المشوار + طباعة وPDF وExcel + نافذة اختيار المندوب في أقصى المقدمة) ===== */
(function () {
  if (window.__phase11) return; window.__phase11 = true;
  const FALLBACK = ['علي صالح', 'محمد طه', 'سمير محمد', 'مصطفي محمد'], COURIERS = FALLBACK.slice(), ALLC = FALLBACK.map((n, i) => ({ id: null, name: n, active: true, sort_order: i + 1 })), FEE = 40, MGR = 'mahmoud.aboshama@tasahel.com.eg';
  let couriersTable = false, couriersAt = 0; window.__courierFee = FEE;
  const eh = escapeHtml, nn = s => normName(s), isFar = s => /^رسوم توصيل/.test(nn(s));
  const cName = s => COURIERS.find(c => nn(c) === nn(s)) || null;
  const isMgr = () => window.__role ? window.__role === 'manager' : !!(currentUser && ['mahmoud.aboshama@tasahel.com.eg', 'mahmoud.aboshama.contact@gmail.com'].includes(String(currentUser.email || '').toLowerCase()));
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

  /* ---------- 4) تم التسليم: اسأل مين المندوب (يظهر في أقصى المقدمة z-index 999999 فوق كل المودالات والكروت) ---------- */
  function ask(n) {
    return new Promise(res => {
      const old = $('courier-ask-modal'); if (old) old.remove();
      const d = document.createElement('div');
      d.id = 'courier-ask-modal';
      d.style.cssText = 'position:fixed!important;top:0!important;left:0!important;right:0!important;bottom:0!important;width:100vw!important;height:100vh!important;z-index:999999!important;display:flex!important;align-items:center!important;justify-content:center!important;background-color:rgba(0,0,0,0.75)!important;padding:1rem!important;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);';
      d.innerHTML = '<div class="card w-full max-w-md space-y-4 p-5 shadow-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100" style="position:relative!important;z-index:1000000!important;max-width:28rem!important;width:100%!important;">' +
        '<div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">' +
          '<div class="flex items-center gap-2 font-bold text-ink dark:text-white text-base"><i class="fa-solid fa-motorcycle text-brand-600"></i><span>تحديد مندوب التسليم' + (n > 1 ? ' (' + n + ' معاملات)' : '') + '</span></div>' +
          '<button type="button" data-x="1" class="h-7 w-7 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center" aria-label="إغلاق"><i class="fa-solid fa-xmark text-sm"></i></button>' +
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

      const onKey = ev => {
        if (ev.key === 'Escape') {
          cleanup();
          res(null);
        }
      };

      const cleanup = () => {
        document.removeEventListener('keydown', onKey);
        if (d.parentElement) d.remove();
      };

      document.addEventListener('keydown', onKey);

      d.onclick = ev => {
        if (ev.target === d) { cleanup(); res(null); return; }
        const b = ev.target.closest('button'); if (!b) return;
        if (b.dataset.sel) {
          const val = ($('ask-courier-sel') && $('ask-courier-sel').value) || '';
          if (!val) return showToast('اختر اسم المندوب الأول أو اضغط استلم بنفسه', 'error');
          cleanup(); res(val); return;
        }
        cleanup(); res(b.dataset.x ? null : b.dataset.c);
      };
      document.body.appendChild(d);
    });
  }

  let prePickedCourier = undefined;
  const _stg = window.stageTxStatus;
  if (typeof _stg === 'function') {
    window.stageTxStatus = async function (s) {
      if (s === 'Delivered') {
        const pick = await ask(1);
        if (pick === null) return;
        prePickedCourier = pick;
        _stg(s);
        if (typeof window.saveTxChanges === 'function') await window.saveTxChanges();
        prePickedCourier = undefined;
      } else {
        _stg(s);
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

  /* ---------- 5) تاب المناديب + فلاتر متقدمة + كروت مناديب احترافية بالسهم ---------- */
  const nb = $('tab-notes-btn'), nt = $('tab-notes');
  if (nb && nt && !$('tab-couriers')) {
    nb.insertAdjacentHTML('afterend', '<button id="tab-couriers-btn" onclick="switchTab(\'couriers\')" class="tab-btn"><i class="fa-solid fa-motorcycle"></i><span>المناديب</span></button>');
    nt.insertAdjacentHTML('afterend', '<div id="tab-couriers" class="hidden space-y-5"></div>');
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

  const f = d => d.toLocaleDateString('en-CA');
  function defaultRange(preset) {
    const now = new Date(), t = f(now);
    if (preset === 'today') return [t, t];
    if (preset === 'week') {
      const s = new Date(now);
      s.setDate(now.getDate() - ((now.getDay() + 1) % 7));
      const e = new Date(s);
      e.setDate(s.getDate() + 6);
      return [f(s), f(e)];
    }
    if (preset === 'month') {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      const e = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return [f(s), f(e)];
    }
    if (preset === 'prev_month') {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0);
      return [f(s), f(e)];
    }
    if (preset === 'all') {
      return [DATA_FROM || '2026-10-01', t];
    }
    return [t, t];
  }

  let initRng = defaultRange('month');
  let filterPreset = 'month', filterFrom = initRng[0], filterTo = initRng[1];
  let filterKind = 'all'; // 'all' | 'pickup' | 'delivery' | 'both'
  let filterCourier = 'all';
  let filterQuery = '';
  let expandedCouriers = new Set();
  let seq = 0, last = null;

  const KIND_LABELS = {
    all: 'كل المشاوير (شامل)',
    pickup: 'استلام فقط',
    delivery: 'تسليم فقط',
    both: 'استلام وتسليم معاً'
  };

  window.courierSetPreset = function (p) {
    filterPreset = p;
    const r = defaultRange(p);
    filterFrom = r[0];
    filterTo = r[1];
    render();
  };

  window.courierApplyDates = function () {
    const s = $('cr-f-from') ? $('cr-f-from').value : filterFrom;
    const e = $('cr-f-to') ? $('cr-f-to').value : filterTo;
    if (s && e && s > e) return showToast('تاريخ البداية لازم يكون قبل أو يساوي تاريخ النهاية', 'error');
    filterFrom = s || filterFrom;
    filterTo = e || filterTo;
    filterPreset = 'custom';
    render();
  };

  window.courierSetKind = function (k) {
    filterKind = k || 'all';
    if (last) paintFromLast();
    else render();
  };

  window.courierSetPerson = function (c) {
    filterCourier = c || 'all';
    if (c && c !== 'all') expandedCouriers.add(c);
    if (last) paintFromLast();
    else render();
  };

  window.courierSetSearch = function (q) {
    filterQuery = String(q || '');
    if (last) paintFromLast();
  };

  window.courierToggleCard = function (c) {
    if (expandedCouriers.has(c)) expandedCouriers.delete(c);
    else expandedCouriers.add(c);
    const body = document.querySelector('[data-cr-body="' + CSS.escape(c) + '"]');
    const icon = document.querySelector('[data-cr-arrow="' + CSS.escape(c) + '"]');
    const lbl = document.querySelector('[data-cr-btn-lbl="' + CSS.escape(c) + '"]');
    const isOpen = expandedCouriers.has(c);
    if (body) body.classList.toggle('hidden', !isOpen);
    if (icon) icon.style.transform = isOpen ? 'rotate(180deg)' : 'rotate(0deg)';
    if (lbl) lbl.textContent = isOpen ? 'إخفاء الطلبات' : 'عرض الطلبات';
  };

  window.courierExpandAll = function (open) {
    if (!last) return;
    if (open) last.rows.forEach(r => expandedCouriers.add(r.c));
    else expandedCouriers.clear();
    paintFromLast();
  };

  function getTxInfo(txId, txMap) {
    if (!txId) return { client_name: '—', phone: '', address: '', services: '', lines: [] };
    if (txMap && txMap.has(String(txId))) return txMap.get(String(txId));
    const o = (window.groupedOrders || []).find(g => String(g.transaction_id) === String(txId));
    if (o) {
      const svcs = [...new Set((o.lines || []).map(l => l.service).filter(Boolean))].join('، ');
      return { client_name: o.client_name || '—', phone: o.phone || '', address: o.address || '', services: svcs, lines: o.lines || [] };
    }
    const ls = (window.allRequestLines || []).filter(l => String(l.transaction_id) === String(txId));
    if (ls.length) {
      const svcs = [...new Set(ls.map(l => l.service).filter(Boolean))].join('، ');
      return { client_name: ls[0].client_name || '—', phone: ls[0].phone || '', address: ls[0].address || '', services: svcs, lines: ls };
    }
    return { client_name: '—', phone: '', address: '', services: '', lines: [] };
  }

  /* بناء قائمة مشاوير المندوب المفلترة حسب نوع المشوار والبحث */
  /* خدمة التوصيل باسمها الفعلي «رسوم توصيل» + نوعها حسب التكليف */
  function feeTypeLabel(svc) { return 'رسوم توصيل — ' + (/عودة|عوده|رجوع|ذهاب\s*[+&و]\s*ع/.test(String(svc || '')) ? 'ذهاب وعودة' : 'ذهاب فقط'); }
  function buildCourierItems(courierName, trips, far, txMap, feeConfirms) {
    const includePickup = filterKind === 'all' || filterKind === 'pickup' || filterKind === 'both';
    const includeDelivery = filterKind === 'all' || filterKind === 'delivery' || filterKind === 'both';
    const includeFar = filterKind === 'all';

    const myTrips = trips.filter(t => nn(t.courier) === nn(courierName) && Number(t.fee) > 0 && ((t.kind === 'pickup' && includePickup) || (t.kind === 'delivery' && includeDelivery)));
    const myFar = includeFar ? far.filter(l => nn(l.executor) === nn(courierName)) : [];

    let items = [
      ...myTrips.map(t => {
        const info = getTxInfo(t.transaction_id, txMap);
        return {
          id: t.id,
          rawKind: t.kind,
          day: t.trip_day,
          tx: t.transaction_id,
          client: info.client_name,
          phone: info.phone,
          address: info.address,
          services: info.services,
          typeLabel: t.kind === 'pickup' ? 'استلام من عميل' : 'تسليم لعميل',
          typeIcon: t.kind === 'pickup' ? 'fa-box-open' : 'fa-truck-fast',
          typeCls: t.kind === 'pickup' ? 'bg-sky-100 text-sky-800 dark:bg-sky-950/80 dark:text-sky-300 border border-sky-200 dark:border-sky-800' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800',
          fee: Number(t.fee) || 0,
          confirmed: !!t.courier_confirmed_at,
          confirmedAt: t.courier_confirmed_at || null,
          canDel: true
        };
      }),
      ...myFar.map(l => {
        const info = getTxInfo(l.transaction_id, txMap);
        return {
          id: l.id,
          rawKind: 'far',
          day: String(l.received_at || '').slice(0, 10),
          tx: l.transaction_id,
          client: l.client_name || info.client_name,
          phone: l.phone || info.phone,
          address: l.address || info.address,
          services: l.service || info.services,
          typeLabel: feeTypeLabel(l.service),
          typeIcon: 'fa-map-location-dot',
          typeCls: 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-200 dark:border-amber-800',
          fee: Number(l.exec_total) || (Number(l.qty) || 0) * (Number(l.exec_unit_cost) || 0),
          confirmed: (() => { const fc = feeConfirms && feeConfirms.get(String(l.id)); return !!fc && nn(fc.courier) === nn(l.executor) && String(fc.trip_day || '') === String(l.received_at || '').slice(0, 10) && Number(fc.amount) === (Number(l.exec_total) || (Number(l.qty) || 0) * (Number(l.exec_unit_cost) || 0)); })(),
          confirmedAt: (feeConfirms && feeConfirms.get(String(l.id)) || {}).confirmed_at || null,
          canDel: false
        };
      })
    ];

    const q = (filterQuery || '').trim().toLowerCase();
    if (q) {
      items = items.filter(it =>
        String(it.client || '').toLowerCase().includes(q) ||
        String(it.phone || '').includes(q) ||
        String(it.tx || '').toLowerCase().includes(q) ||
        String(it.services || '').toLowerCase().includes(q) ||
        String(it.address || '').toLowerCase().includes(q)
      );
    }

    items.sort((a, b) => String(b.day).localeCompare(String(a.day)));
    return items;
  }

  function renderFilterControlPanel(allNames) {
    const presetBtn = (k, lbl) => '<button type="button" onclick="courierSetPreset(\'' + k + '\')" class="rounded-lg px-3 py-1.5 text-xs font-bold transition ' + (filterPreset === k ? 'bg-ink text-white dark:bg-brand-600 shadow-xs' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700/60') + '">' + lbl + '</button>';
    const kindChip = (k, lbl, ic) => '<button type="button" onclick="courierSetKind(\'' + k + '\')" class="rounded-xl px-3 py-2 text-xs font-bold flex items-center gap-1.5 border transition ' + (filterKind === k ? 'bg-brand-600 text-white border-brand-600 shadow-xs' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50') + '"><i class="fa-solid ' + ic + '"></i><span>' + lbl + '</span></button>';

    const courierOpts = '<option value="all"' + (filterCourier === 'all' ? ' selected' : '') + '>كل المناديب (' + allNames.length + ')</option>' +
      allNames.map(c => '<option value="' + eh(c) + '"' + (filterCourier === c ? ' selected' : '') + '>' + eh(c) + '</option>').join('');

    return '<div class="card p-5 space-y-4">' +
      '<div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3.5">' +
        '<div class="flex items-center gap-3">' +
          '<div class="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-sm text-lg"><i class="fa-solid fa-motorcycle"></i></div>' +
          '<div>' +
            '<h2 class="text-base sm:text-lg font-bold text-ink dark:text-white">إدارة ومتابعة المناديب ومشاوير العملاء</h2>' +
            '<p class="text-xs text-slate-500">الفترة: من <b>' + eh(formatDateOnly(filterFrom)) + '</b> إلى <b>' + eh(formatDateOnly(filterTo)) + '</b> · نوع المشوار: <b class="text-brand-600">' + eh(KIND_LABELS[filterKind]) + '</b> · أجر المشوار العادي: <b>' + FEE + ' ج.م</b></p>' +
          '</div>' +
        '</div>' +
        '<div class="inline-flex flex-wrap rounded-xl bg-slate-100 dark:bg-slate-800 p-1 gap-0.5">' +
          presetBtn('today', 'اليوم') +
          presetBtn('week', 'هذا الأسبوع') +
          presetBtn('month', 'هذا الشهر') +
          presetBtn('prev_month', 'الشهر السابق') +
          presetBtn('all', 'الكل') +
        '</div>' +
      '</div>' +

      '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">' +
        '<div class="lg:col-span-2">' +
          '<label class="label text-xs" for="cr-f-from"><i class="fa-regular fa-calendar ms-1 text-brand-600"></i>من تاريخ</label>' +
          '<input id="cr-f-from" type="date" value="' + eh(filterFrom) + '" onchange="courierApplyDates()" class="field !py-2 text-xs font-semibold">' +
        '</div>' +
        '<div class="lg:col-span-2">' +
          '<label class="label text-xs" for="cr-f-to"><i class="fa-regular fa-calendar-check ms-1 text-brand-600"></i>إلى تاريخ</label>' +
          '<input id="cr-f-to" type="date" value="' + eh(filterTo) + '" onchange="courierApplyDates()" class="field !py-2 text-xs font-semibold">' +
        '</div>' +
        '<div class="lg:col-span-3">' +
          '<label class="label text-xs" for="cr-f-courier"><i class="fa-solid fa-user-check ms-1 text-brand-600"></i>تصفية بالمندوب</label>' +
          '<select id="cr-f-courier" onchange="courierSetPerson(this.value)" class="field !py-2 text-xs font-bold">' + courierOpts + '</select>' +
        '</div>' +
        '<div class="lg:col-span-3">' +
          '<label class="label text-xs" for="cr-f-q"><i class="fa-solid fa-magnifying-glass ms-1 text-brand-600"></i>بحث بالعميل أو المعاملة</label>' +
          '<input id="cr-f-q" type="text" value="' + eh(filterQuery) + '" oninput="courierSetSearch(this.value)" placeholder="اسم العميل، الرقم، الخدمة..." class="field !py-2 text-xs">' +
        '</div>' +
        '<div class="lg:col-span-2 flex items-center gap-1.5">' +
          '<button type="button" onclick="courierPrintAll()" class="flex-1 rounded-xl bg-ink hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 py-2.5 px-3 text-xs font-bold text-white flex items-center justify-center gap-1.5 shadow-xs" title="طباعة الكشف حسب الفلتر"><i class="fa-solid fa-print"></i><span>طباعة</span></button>' +
          '<button type="button" onclick="courierExportPdf()" class="rounded-xl bg-rose-600 hover:bg-rose-700 py-2.5 px-3 text-xs font-bold text-white shadow-xs" title="تصدير PDF"><i class="fa-solid fa-file-pdf"></i></button>' +
          '<button type="button" onclick="courierExportCsv()" class="rounded-xl bg-emerald-600 hover:bg-emerald-700 py-2.5 px-3 text-xs font-bold text-white shadow-xs" title="تصدير Excel"><i class="fa-solid fa-file-excel"></i></button>' +
        '</div>' +
      '</div>' +

      '<div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">' +
        '<div class="flex flex-wrap items-center gap-1.5">' +
          '<span class="text-xs font-bold text-slate-500 ml-1"><i class="fa-solid fa-filter ms-1 text-brand-600"></i>نوع المشوار:</span>' +
          kindChip('all', 'الكل', 'fa-layer-group') +
          kindChip('pickup', 'استلام فقط', 'fa-box-open') +
          kindChip('delivery', 'تسليم فقط', 'fa-truck-fast') +
          kindChip('both', 'استلام وتسليم معاً', 'fa-right-left') +
        '</div>' +
        '<div class="flex items-center gap-1.5 text-xs">' +
          '<button type="button" onclick="courierExpandAll(true)" class="rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 px-2.5 py-1.5 font-semibold text-slate-600 dark:text-slate-300"><i class="fa-solid fa-angles-down ms-1"></i>فتح كل الكروت</button>' +
          '<button type="button" onclick="courierExpandAll(false)" class="rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 px-2.5 py-1.5 font-semibold text-slate-600 dark:text-slate-300"><i class="fa-solid fa-angles-up ms-1"></i>طي الكل</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function renderSummaryKpis(filteredCourierData) {
    let totTrips = 0, totPk = 0, totDl = 0, totFar = 0, totMoney = 0;
    filteredCourierData.forEach(d => {
      totTrips += d.items.length;
      totPk += d.pkCount;
      totDl += d.dlCount;
      totFar += d.farCount;
      totMoney += d.totalFee;
    });
    return '<div class="grid grid-cols-2 lg:grid-cols-4 gap-3">' +
      '<div class="card p-4 flex items-center gap-3.5">' +
        '<div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-950/50 text-brand-600 dark:text-brand-400 text-lg"><i class="fa-solid fa-route"></i></div>' +
        '<div><div class="text-[11px] text-slate-500">إجمالي المشاوير (حسب الفلتر)</div><div class="text-xl font-bold text-ink dark:text-white mt-0.5">' + totTrips + ' مشوار</div></div>' +
      '</div>' +
      '<div class="card p-4 flex items-center gap-3.5">' +
        '<div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-50 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400 text-lg"><i class="fa-solid fa-right-left"></i></div>' +
        '<div><div class="text-[11px] text-slate-500">استلام وتسليم عادي</div><div class="text-sm sm:text-base font-bold text-ink dark:text-white mt-0.5"><span class="text-sky-600">استلام: ' + totPk + '</span> · <span class="text-emerald-600">تسليم: ' + totDl + '</span></div></div>' +
      '</div>' +
      '<div class="card p-4 flex items-center gap-3.5">' +
        '<div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 text-lg"><i class="fa-solid fa-map-location-dot"></i></div>' +
        '<div><div class="text-[11px] text-slate-500">رسوم توصيل</div><div class="text-xl font-bold text-amber-600 dark:text-amber-400 mt-0.5">' + totFar + ' مشوار</div></div>' +
      '</div>' +
      '<div class="card p-4 flex items-center gap-3.5">' +
        '<div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 text-lg"><i class="fa-solid fa-sack-dollar"></i></div>' +
        '<div><div class="text-[11px] text-slate-500">إجمالي المستحق للمناديب</div><div class="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">' + formatCurrency(totMoney) + '</div></div>' +
      '</div>' +
    '</div>';
  }

  function renderCourierAccordionCards(filteredCourierData) {
    if (!filteredCourierData.length) {
      return '<div class="card p-8 text-center text-slate-400 text-sm">لا يوجد مناديب مطابقون للفلتر المحدد</div>';
    }

    const cardsHtml = filteredCourierData.map(d => {
      const r = d.row;
      const allItems = d.items;
      const isOpen = expandedCouriers.has(r.c);

      const rowsHtml = allItems.length ? allItems.map((it, idx) => {
        const wa = waLink(it.phone, 'أهلاً ' + it.client + '، معك مندوب تساهيل بخصوص معاملتك رقم ' + it.tx);
        const svcPills = (it.services || '').split('، ').filter(Boolean).map(s =>
          '<span class="inline-block rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:text-slate-200">' + eh(s) + '</span>'
        ).join(' ');

        return '<tr class="hover:bg-slate-50/90 dark:hover:bg-slate-800/50 align-middle">' +
          '<td class="px-3 py-3 text-slate-400 font-semibold text-center w-10">' + (idx + 1) + '</td>' +
          '<td class="px-3 py-3 whitespace-nowrap font-semibold text-slate-700 dark:text-slate-200">' + eh(formatDateOnly(it.day)) + '</td>' +
          '<td class="px-3 py-3 whitespace-nowrap" dir="ltr">' +
            '<button type="button" data-tx="' + eh(it.tx) + '" onclick="openTxModal(this.dataset.tx)" class="rc-tx-pill">' + eh(it.tx) + '</button>' +
          '</td>' +
          '<td class="px-3 py-3 min-w-[180px]">' +
            '<div class="font-bold text-ink dark:text-white leading-snug">' + eh(it.client) + '</div>' +
            (it.phone ? '<div class="mt-1 inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500" dir="ltr"><span>' + eh(it.phone) + '</span>' + (wa ? '<a href="' + wa + '" target="_blank" rel="noopener" class="text-emerald-600 hover:text-emerald-700"><i class="fa-brands fa-whatsapp"></i></a>' : '') + '</div>' : '') +
            (it.address ? '<div class="mt-0.5 text-[11px] text-slate-400"><i class="fa-solid fa-location-dot ms-1"></i>' + eh(it.address) + '</div>' : '') +
          '</td>' +
          '<td class="px-3 py-3 min-w-[200px] max-w-[320px]">' +
            '<div class="flex flex-wrap gap-1">' + (svcPills || '<span class="text-slate-400">—</span>') + '</div>' +
          '</td>' +
          '<td class="px-3 py-3 whitespace-nowrap">' +
            '<span class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold ' + it.typeCls + '"><i class="fa-solid ' + it.typeIcon + '"></i><span>' + eh(it.typeLabel) + '</span></span>' +
          '</td>' +
          '<td class="px-3 py-3 whitespace-nowrap"><span class="rounded-full px-2 py-1 text-[10px] font-bold ' + (it.confirmed ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300') + '">' + (it.confirmed ? 'مؤكد' : 'بانتظار التأكيد') + '</span></td>' +
          '<td class="px-3 py-3 font-bold text-ink dark:text-white whitespace-nowrap text-sm">' + formatCurrency(it.fee) + '</td>' +
          '<td class="px-3 py-3 text-center whitespace-nowrap">' +
            (it.canDel && isMgr() && !r.closed ? '<button type="button" onclick="courierDelTrip(' + it.id + ')" class="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition" title="حذف المشوار"><i class="fa-solid fa-trash-can"></i></button>' : '') +
          '</td>' +
        '</tr>';
      }).join('') : '<tr><td colspan="9" class="p-8 text-center text-slate-400 text-xs">لا توجد مشاوير مسجلة لهذا المندوب تطابق الفلتر الحالي</td></tr>';

      return '<div class="card overflow-hidden border border-slate-200/90 dark:border-slate-800 transition-all shadow-xs hover:shadow-md">' +
        /* الهيدر الرئيسي لكارت المندوب */
        '<div class="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-slate-900">' +
          '<div class="flex items-center gap-3.5 min-w-0 cursor-pointer flex-1" onclick="courierToggleCard(\'' + eh(r.c) + '\')">' +
            '<div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-teal-700 text-white text-xl shadow-sm">' +
              '<i class="fa-solid fa-motorcycle"></i>' +
            '</div>' +
            '<div class="min-w-0 flex-1">' +
              '<div class="flex flex-wrap items-center gap-2">' +
                '<h3 class="text-base sm:text-lg font-bold text-ink dark:text-white">' + eh(r.c) + '</h3>' +
                (r.closed
                  ? '<span class="rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 px-2.5 py-0.5 text-[11px] font-bold"><i class="fa-solid fa-check-double ms-1"></i>مُقفَّل</span>'
                  : '<span class="rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2.5 py-0.5 text-[11px] font-semibold">نشط</span>') +
              '</div>' +
              '<div class="mt-2 flex flex-wrap items-center gap-1.5 text-xs">' +
                '<span class="inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1 font-bold text-slate-700 dark:text-slate-200"><i class="fa-solid fa-list-ol text-slate-400"></i>الإجمالي: ' + allItems.length + ' مشوار</span>' +
                '<span class="inline-flex items-center gap-1 rounded-lg bg-sky-50 dark:bg-sky-950/60 px-2.5 py-1 font-bold text-sky-700 dark:text-sky-300"><i class="fa-solid fa-box-open"></i>استلام: ' + d.pkCount + '</span>' +
                '<span class="inline-flex items-center gap-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 font-bold text-emerald-700 dark:text-emerald-300"><i class="fa-solid fa-truck-fast"></i>تسليم: ' + d.dlCount + '</span>' +
                '<span class="inline-flex items-center gap-1 rounded-lg bg-amber-50 dark:bg-amber-950/60 px-2.5 py-1 font-bold text-amber-700 dark:text-amber-300"><i class="fa-solid fa-motorcycle"></i>رسوم توصيل: ' + d.farCount + '</span>' +
                '<span class="inline-flex items-center gap-1 rounded-lg bg-teal-50 dark:bg-teal-950/70 border border-teal-200 dark:border-teal-800 px-2.5 py-1 font-bold text-teal-800 dark:text-teal-200"><i class="fa-solid fa-coins"></i>المستحق المؤكد: ' + formatCurrency(d.totalFee) + '</span>' +
                (d.pendingCount ? '<span class="inline-flex items-center gap-1 rounded-lg bg-amber-50 dark:bg-amber-950/60 px-2.5 py-1 font-bold text-amber-700 dark:text-amber-300">معلق: ' + d.pendingCount + ' · ' + formatCurrency(d.pendingFee) + '</span>' : '') +
              '</div>' +
            '</div>' +
          '</div>' +

          /* أزرار التحكم والسهم */
          '<div class="flex flex-wrap items-center gap-2 shrink-0">' +
            '<button type="button" onclick="courierPrint(\'' + eh(r.c) + '\')" class="rounded-xl bg-ink hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white px-3.5 py-2 text-xs font-bold flex items-center gap-1.5 shadow-2xs" title="طباعة شيت المندوب بالعملاء">' +
              '<i class="fa-solid fa-print"></i><span>طباعة الشيت</span>' +
            '</button>' +
            '<button type="button" onclick="courierExportPdf(\'' + eh(r.c) + '\')" class="rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-300 px-3 py-2 text-xs font-bold flex items-center gap-1" title="تصدير PDF للمندوب">' +
              '<i class="fa-solid fa-file-pdf"></i><span>PDF</span>' +
            '</button>' +
            '<button type="button" onclick="courierExportCsv(\'' + eh(r.c) + '\')" class="rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-300 px-3 py-2 text-xs font-bold flex items-center gap-1" title="تصدير Excel للمندوب">' +
              '<i class="fa-solid fa-file-excel"></i><span>Excel</span>' +
            '</button>' +
            (isMgr() ? (r.closed
              ? '<button type="button" onclick="courierReopen(' + r.closed.id + ')" class="rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 px-3 py-2 text-xs font-bold">فتح التقفيل</button>'
              : '<button type="button" onclick="courierClose(\'' + eh(r.c) + '\')" class="rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-3 py-2 text-xs font-bold">تقفيل الحساب</button>'
            ) : '') +
            '<button type="button" onclick="courierToggleCard(\'' + eh(r.c) + '\')" class="rounded-xl bg-brand-50 hover:bg-brand-100 dark:bg-brand-950/60 dark:hover:bg-brand-900/70 border border-brand-200 dark:border-brand-800 text-brand-700 dark:text-brand-300 px-3.5 py-2 text-xs font-bold flex items-center gap-2 transition">' +
              '<span data-cr-btn-lbl="' + eh(r.c) + '">' + (isOpen ? 'إخفاء الطلبات' : 'عرض الطلبات') + '</span>' +
              '<i data-cr-arrow="' + eh(r.c) + '" class="fa-solid fa-chevron-down transition-transform duration-200" style="transform:' + (isOpen ? 'rotate(180deg)' : 'rotate(0deg)') + '"></i>' +
            '</button>' +
          '</div>' +
        '</div>' +

        /* القائمة المنسدلة للطلبات (تفتح وتغلق بالسهم) */
        '<div data-cr-body="' + eh(r.c) + '" class="' + (isOpen ? '' : 'hidden ') + 'border-t border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/40">' +
          '<div class="overflow-x-auto max-h-[440px] overflow-y-auto">' +
            '<table class="w-full text-right text-xs">' +
              '<thead class="bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800">' +
                '<tr>' +
                  '<th class="px-3 py-2.5 text-center w-10">#</th>' +
                  '<th class="px-3 py-2.5">التاريخ</th>' +
                  '<th class="px-3 py-2.5">رقم المعاملة</th>' +
                  '<th class="px-3 py-2.5">العميل والتليفون والعنوان</th>' +
                  '<th class="px-3 py-2.5">الخدمات</th>' +
                  '<th class="px-3 py-2.5">نوع المشوار</th>' +
                  '<th class="px-3 py-2.5">حالة التأكيد</th>' +
                  '<th class="px-3 py-2.5">الأجر</th>' +
                  '<th class="px-3 py-2.5 text-center">إجراء</th>' +
                '</tr>' +
              '</thead>' +
              '<tbody class="divide-y divide-slate-200/60 dark:divide-slate-800 bg-white dark:bg-slate-900">' + rowsHtml + '</tbody>' +
            '</table>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    return '<div class="space-y-3">' + cardsHtml + '</div>';
  }

  function paintFromLast() {
    const root = $('tab-couriers');
    if (!root || !last) return;

    const allNames = last.rows.map(r => r.c);
    const activeRows = filterCourier === 'all' ? last.rows : last.rows.filter(r => r.c === filterCourier);

    const filteredCourierData = activeRows.map(r => {
      const items = buildCourierItems(r.c, last.trips, last.far, last.txMap, last.feeConfirms);
      const pkCount = items.filter(i => i.rawKind === 'pickup').length;
      const dlCount = items.filter(i => i.rawKind === 'delivery').length;
      const farCount = items.filter(i => i.rawKind === 'far').length;
      const totalFee = items.filter(i => i.confirmed).reduce((s, i) => s + (Number(i.fee) || 0), 0);
      const pendingCount = items.filter(i => !i.confirmed).length;
      const pendingFee = items.filter(i => !i.confirmed).reduce((s, i) => s + (Number(i.fee) || 0), 0);
      return {
        row: r,
        items: items,
        pkCount: pkCount,
        dlCount: dlCount,
        farCount: farCount,
        totalFee: totalFee,
        pendingCount: pendingCount,
        pendingFee: pendingFee
      };
    });

    last.filteredCourierData = filteredCourierData;

    const activeElId = document.activeElement && document.activeElement.id;
    const selStart = activeElId === 'cr-f-q' ? document.activeElement.selectionStart : null;

    let h = renderFilterControlPanel(allNames);
    h += renderSummaryKpis(filteredCourierData);
    h += renderCourierAccordionCards(filteredCourierData);
    h += manageCard();
    root.innerHTML = h;

    if (activeElId === 'cr-f-q' && $('cr-f-q')) {
      const inp = $('cr-f-q');
      inp.focus();
      if (selStart != null) {
        try { inp.setSelectionRange(selStart, selStart); } catch (e) {}
      }
    }
  }

  async function render() {
    const root = $('tab-couriers'); if (!root || !sbClient) return;
    const my = ++seq;
    const s = filterFrom || today(), e = filterTo || today();
    const nx = new Date(e + 'T00:00:00'); nx.setDate(nx.getDate() + 1); const e1 = f(nx);

    root.innerHTML = renderFilterControlPanel(COURIERS) + '<div class="card p-8 text-center text-xs text-slate-400"><i class="fa-solid fa-spinner fa-spin ms-1"></i> جارٍ تحميل مشاوير المناديب...</div>';

    const q = await Promise.all([
      sbClient.from('courier_trips').select('*').gte('trip_day', s).lte('trip_day', e).order('trip_day').limit(5000),
      sbClient.from('request_lines').select('id,transaction_id,client_name,phone,address,service,executor,qty,exec_unit_cost,exec_total,received_at').ilike('service', 'رسوم توصيل%').gte('received_at', (s + 'T00:00:00' > DATA_FROM_TS ? s + 'T00:00:00' : DATA_FROM_TS)).lt('received_at', e1 + 'T00:00:00').limit(5000),
      sbClient.from('courier_closings').select('*').eq('period_start', s).eq('period_end', e).is('reopened_at', null),
      sbClient.from('courier_fee_confirms').select('line_id,courier,amount,trip_day,confirmed_at')
    ]);
    if (my !== seq) return;
    const tr = q[0], fr = q[1], cl = q[2];
    if (tr.error || fr.error || cl.error || q[3].error) {
      const er = tr.error || fr.error || cl.error || q[3].error;
      root.innerHTML = renderFilterControlPanel(COURIERS) + '<div class="card p-6 text-center text-xs text-slate-500">' + (miss(er) ? 'لازم تشغّل ملف <b class="font-mono">phase11-couriers.sql</b> في Supabase الأول.' : 'تعذّر تحميل البيانات') + '</div>';
      return;
    }
    const trips = tr.data || [], far = fr.data || [];
    const feeConfirms = new Map((q[3].data || []).map(x => [String(x.line_id), x]));

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
      } catch (err) {}
    }

    const names = ALLC.filter(x => x.active || trips.some(t => nn(t.courier) === nn(x.name)) || far.some(l => nn(l.executor) === nn(x.name)) ).map(x => x.name);
    const rows = names.map(c => {
      const t = trips.filter(x => nn(x.courier) === nn(c)), fl = far.filter(l => nn(l.executor) === nn(c));
      const isFeeConfirmed = l => { const fc = feeConfirms.get(String(l.id)); const amount = Number(l.exec_total) || (Number(l.qty) || 0) * (Number(l.exec_unit_cost) || 0); return !!fc && nn(fc.courier) === nn(l.executor) && String(fc.trip_day || '') === String(l.received_at || '').slice(0, 10) && Number(fc.amount) === amount; };
      const confirmedTrips = t.filter(x => !!x.courier_confirmed_at), confirmedFees = fl.filter(isFeeConfirmed);
      const ta = t.reduce((a, x) => a + Number(x.fee || 0), 0), fa = fl.reduce((a, l) => a + (Number(l.exec_total) || (Number(l.qty) || 0) * (Number(l.exec_unit_cost) || 0)), 0);
      const confirmedTa = confirmedTrips.reduce((a, x) => a + Number(x.fee || 0), 0), confirmedFa = confirmedFees.reduce((a, l) => a + (Number(l.exec_total) || (Number(l.qty) || 0) * (Number(l.exec_unit_cost) || 0)), 0);
      return {
        c: c,
        pk: t.filter(x => x.kind === 'pickup').length,
        dl: t.filter(x => x.kind === 'delivery').length,
        nf: fl.length,
        fa: fa,
        ta: ta,
        tot: ta + fa,
        confirmedPk: confirmedTrips.filter(x => x.kind === 'pickup').length,
        confirmedDl: confirmedTrips.filter(x => x.kind === 'delivery').length,
        confirmedFar: confirmedFees.length,
        confirmedTot: confirmedTa + confirmedFa,
        pendingCount: (t.length + fl.length) - confirmedTrips.length - confirmedFees.length,
        pendingAmount: (ta + fa) - (confirmedTa + confirmedFa),
        closed: (cl.data || []).find(x => nn(x.courier) === nn(c))
      };
    });

    last = { s: s, e: e, rows: rows, trips: trips, far: far, feeConfirms: feeConfirms, txMap: txMap, filteredCourierData: [] };
    paintFromLast();
  }

  function manageCard() {
    if (!isMgr()) return '';
    if (!couriersTable) return '<div class="card p-4 text-center text-xs text-slate-500">لازم تشغّل ملف <b class="font-mono">phase12-couriers-table.sql</b> في Supabase علشان تقدر تضيف وتوقف مناديب من هنا.</div>';
    const on = '<span class="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">شغّال</span>', off = '<span class="rounded-full bg-slate-200 px-2.5 py-0.5 text-[11px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">موقوف</span>';
    const rowsH = ALLC.map(x => '<tr><td class="px-3 py-2 font-bold text-ink dark:text-white">' + eh(x.name) + '</td><td class="px-3">' + (x.active ? on : off) + '</td><td class="px-3"><button type="button" onclick="courierToggle(' + x.id + ',' + (x.active ? 'false' : 'true') + ')" class="rounded-lg bg-slate-100 px-3 py-1 text-[11px] font-bold dark:bg-slate-800">' + (x.active ? 'إيقاف' : 'تفعيل') + '</button></td></tr>').join('') || '<tr><td class="p-4 text-center text-slate-400">لا يوجد مناديب</td></tr>';
    return '<details class="card overflow-hidden"><summary class="cursor-pointer bg-slate-50 px-4 py-3 text-xs font-bold text-slate-600 dark:bg-slate-800/60 dark:text-slate-300"><i class="fa-solid fa-users-gear ms-1.5 text-brand-600"></i>إعدادات وإدارة أسماء المناديب (' + COURIERS.length + ' شغّال)</summary><div class="space-y-3 p-4"><form onsubmit="courierAdd(event)" class="flex flex-wrap items-end gap-2"><input id="cm-n" required placeholder="اسم المندوب الجديد" class="field !w-56 !py-2 text-xs"><button type="submit" class="rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700">إضافة مندوب</button></form><p class="text-[11px] text-slate-500">الإيقاف بيشيل المندوب من الاختيارات، لكن مشاويره القديمة وعهدته بتفضل ظاهرة في الكشوف.</p><div class="overflow-x-auto"><table class="w-full text-right text-xs"><tbody class="divide-y divide-slate-100 dark:divide-slate-800">' + rowsH + '</tbody></table></div></div></details>';
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


  /* ---------- الطباعة وتصدير PDF و Excel للمناديب (حسب الفلتر المحدد) ---------- */
  function buildCourierReportDef(courierNameOpt) {
    if (!last || !last.filteredCourierData) return null;
    const targetData = courierNameOpt
      ? last.filteredCourierData.filter(d => d.row.c === courierNameOpt)
      : last.filteredCourierData;

    const flatRows = [];
    const csvRows = [];
    let totPk = 0, totDl = 0, totFar = 0, totMoney = 0;

    targetData.forEach(d => {
      totPk += d.pkCount;
      totDl += d.dlCount;
      totFar += d.farCount;
      totMoney += d.totalFee;
      d.items.forEach(it => {
        flatRows.push([
          flatRows.length + 1,
          d.row.c,
          formatDateOnly(it.day),
          it.tx,
          it.client + (it.phone ? ' (' + it.phone + ')' : ''),
          it.services || '—',
          it.typeLabel,
          formatCurrency(it.fee)
        ]);
        csvRows.push([
          d.row.c,
          it.day,
          it.tx,
          it.client,
          it.phone || '',
          it.address || '',
          it.services || '',
          it.typeLabel,
          it.fee
        ]);
      });
    });

    const title = courierNameOpt ? ('كشف مشاوير المندوب: ' + courierNameOpt) : 'كشف مشاوير المناديب بالعملاء';
    const meta = [
      'الفترة: من ' + formatDateOnly(last.s) + ' إلى ' + formatDateOnly(last.e),
      'نوع المشوار: ' + (KIND_LABELS[filterKind] || 'الكل')
    ];

    return {
      title: title,
      meta: meta,
      stats: [
        ['إجمالي المشاوير', flatRows.length + ' مشوار'],
        ['استلام / تسليم', 'استلام: ' + totPk + ' | تسليم: ' + totDl],
        ['رسوم توصيل', totFar + ' مشوار'],
        ['الإجمالي المستحق', formatCurrency(totMoney)]
      ],
      headers: ['#', 'المندوب', 'التاريخ', 'رقم المعاملة', 'العميل والهاتف', 'الخدمة', 'نوع المشوار', 'الأجر'],
      rows: flatRows,
      csvHeaders: ['المندوب', 'التاريخ', 'رقم المعاملة', 'اسم العميل', 'الهاتف', 'العنوان', 'الخدمات', 'نوع المشوار', 'الأجر'],
      csvRows: csvRows,
      filename: (courierNameOpt ? 'شيت_المندوب_' + courierNameOpt.replace(/\s+/g, '_') : 'شيت_المناديب') + '_' + last.s + '_' + last.e
    };
  }

  function renderCourierPrintHtml(def, rowsSlice, page, pages, forPdf) {
    const th = def.headers.map(h => '<th style="padding:7px 6px;border:1px solid #475569;background:#0b1b33;color:#fff;font-size:11px;white-space:nowrap">' + eh(h) + '</th>').join('');
    const tr = rowsSlice.map((r, i) => '<tr style="background:' + (i % 2 ? '#f8fafc' : '#fff') + '">' +
      r.map(v => '<td style="padding:6px;border:1px solid #cbd5e1;font-size:11px;vertical-align:middle">' + eh(v == null || v === '' ? '—' : v) + '</td>').join('') + '</tr>').join('');
    const box = forPdf ? 'width:1123px;min-height:790px;padding:24px;box-sizing:border-box;background:#fff;' : '';
    return '<div style="' + box + 'direction:rtl;font-family:\'IBM Plex Sans Arabic\',Tahoma,sans-serif;color:#0f172a">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #0d9488;padding-bottom:10px;margin-bottom:12px">' +
        '<div style="display:flex;flex-direction:column;align-items:flex-start;gap:4px">' + logoImg(44, 10) + '<div><div style="font-size:13px;font-weight:700;color:#475569">تساهيل | قسم الخدمات الحكومية</div><div style="font-size:16px;font-weight:700;color:#0f766e;margin-top:2px">' + eh(def.title) + '</div></div></div>' +
        '<div style="font-size:11px;text-align:left;line-height:1.7">' + def.meta.map(eh).join('<br>') + '</div>' +
      '</div>' +
      '<div style="display:flex;gap:10px;margin-bottom:12px">' + def.stats.map(s => '<div style="flex:1;border:1px solid #cbd5e1;border-radius:8px;padding:8px 12px;background:#f1f5f9"><div style="font-size:10px;color:#64748b">' + eh(s[0]) + '</div><div style="font-size:14px;font-weight:700">' + eh(s[1]) + '</div></div>').join('') + '</div>' +
      '<table style="width:100%;border-collapse:collapse"><thead style="display:table-header-group"><tr>' + th + '</tr></thead><tbody>' + tr + '</tbody></table>' +
      '<table style="width:100%;border-collapse:collapse;margin-top:20px"><tr><td style="border:1px solid #94a3b8;padding:12px;text-align:center;background:#f1f5f9;width:25%"><b>توقيع المندوب</b></td><td style="border:1px solid #94a3b8;width:25%"></td><td style="border:1px solid #94a3b8;padding:12px;text-align:center;background:#f1f5f9;width:25%"><b>توقيع المسؤول</b></td><td style="border:1px solid #94a3b8;width:25%"></td></tr></table>' +
      '<div style="margin-top:10px;font-size:10px;color:#64748b;display:flex;justify-content:space-between"><span>طُبع بواسطة: ' + eh(uname()) + ' · ' + eh(new Date().toLocaleString('ar-EG')) + '</span>' + (page ? '<span>صفحة ' + page + ' من ' + pages + '</span>' : '') + '</div>' +
    '</div>';
  }

  window.courierPrint = function (c) {
    const def = buildCourierReportDef(c);
    if (!def || !def.rows.length) return showToast('لا توجد مشاوير مسجلة لهذا المندوب في الفترة/الفلتر المحدد', 'info');
    $('print-content').innerHTML = renderCourierPrintHtml(def, def.rows, 0, 0, false);
    window.print();
  };

  window.courierPrintAll = function () {
    const def = buildCourierReportDef(null);
    if (!def || !def.rows.length) return showToast('لا توجد مشاوير للطباعة في الفترة/الفلتر المحدد', 'info');
    $('print-content').innerHTML = renderCourierPrintHtml(def, def.rows, 0, 0, false);
    window.print();
  };

  window.courierExportPdf = async function (c) {
    const def = buildCourierReportDef(c || null);
    if (!def || !def.rows.length) return showToast('لا توجد مشاوير للتصدير في الفترة/الفلتر المحدد', 'info');
    if (!window.html2canvas || !window.jspdf) return showToast('مكتبة الـ PDF قيد التحميل — جرّب بعد ثوانٍ', 'error');
    showToast('جارٍ تجهيز ملف PDF...', 'info', 3000);
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-10000px;top:0;width:1123px;background:#fff;z-index:-1';
    document.body.appendChild(host);
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      const pdf = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
      const W = 297, H = 210, per = 16, pages = Math.max(1, Math.ceil(def.rows.length / per));
      for (let p = 0; p < pages; p++) {
        host.innerHTML = renderCourierPrintHtml(def, def.rows.slice(p * per, (p + 1) * per), p + 1, pages, true);
        const canvas = await window.html2canvas(host.firstElementChild, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
        let w = W, h = canvas.height * W / canvas.width;
        if (h > H) { h = H; w = canvas.width * H / canvas.height; }
        if (p) pdf.addPage();
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', (W - w) / 2, 0, w, h);
      }
      pdf.save(def.filename + '.pdf');
      showToast('تم تحميل ملف PDF بنجاح');
    } catch (err) { showError('تعذّر إنشاء PDF', err); }
    finally { host.remove(); }
  };

  window.courierExportCsv = function (c) {
    const def = buildCourierReportDef(c || null);
    if (!def || !def.csvRows.length) return showToast('لا توجد مشاوير للتصدير في الفترة/الفلتر المحدد', 'info');
    downloadCsvFile(def.filename + '.csv', def.csvHeaders, def.csvRows);
  };

  window.courierClose = async function (c) {
    const x = last && last.rows.find(r => r.c === c); if (!x || !isMgr()) return;
    if (!confirm('تقفيل ' + c + ' عن الفترة من ' + last.s + ' إلى ' + last.e + '؟\nالمستحق المؤكد: ' + formatCurrency(x.confirmedTot) + '\nالمشاوير المعلقة المستبعدة: ' + x.pendingCount + ' (' + formatCurrency(x.pendingAmount) + ')')) return;
    if (x.confirmedTot <= 0) return showToast('لا توجد مشاوير مؤكدة قابلة للتقفيل لهذا المندوب في الفترة المحددة', 'info');
    const r = await sbClient.rpc('courier_close_account', { p_courier: c, p_period_type: filterPreset || 'custom', p_period_start: last.s, p_period_end: last.e });
    if (r.error) return showError('تعذّر التقفيل', r.error); showToast('تم تقفيل ' + c + ' على المشاوير المؤكدة فقط'); render();
  };

  window.courierReopen = async function (id) {
    if (!isMgr() || !confirm('فتح التقفيل؟')) return;
    const r = await sbClient.rpc('courier_reopen_account', { p_closing_id: id }); if (r.error) return showError('تعذّر فتح التقفيل', r.error); showToast('تم فتح التقفيل مع الاحتفاظ بسجل التسوية'); render();
  };

  window.courierDelTrip = async function (id) {
    if (!isMgr() || !confirm('حذف المشوار ده؟')) return;
    const r = await sbClient.from('courier_trips').delete().eq('id', id); if (r.error) return showError('تعذّر الحذف', r.error); render();
  };
})();