/* =====================================================================
   بوابة المندوب (js/70-courier-portal.js)
   - المندوب بيدخل بحساب دوره courier فبتظهر له الشاشة دي بس (مفيش #app).
   - كل بياناته من 3 دوال: courier_me / courier_list_tx / courier_confirm (sql/courier-portal.sql).
     الدوال دي بتخفي الأسعار والخصومات والعمولات والملاحظات الداخلية، وأي جدول تاني مقفول عليه بالـ RLS.
   - المدير بيربط حساب بمندوب من قايمة التابات: «حسابات المناديب».
   - مش بيلمس js/13 ولا js/14 (بيلفّ حوالين loadInitialData / showLoginScreen).
   ===================================================================== */
(function () {
  if (window.__courierPortal) return; window.__courierPortal = true;
  const $ = id => document.getElementById(id);
  const eh = s => escapeHtml(s == null ? '' : String(s));
  const st = { me: null, list: [], filter: 'open', q: '', sig: '', timer: null, busy: false, loadedAt: null, err: null };

  /* ---------- ستايل مستقل (من غير Tailwind) ---------- */
  function addCss() {
    if ($('cp-style')) return;
    const s = document.createElement('style'); s.id = 'cp-style';
    s.textContent = [
      'body.is-courier-mode #app,body.is-courier-mode #login{display:none !important}',
      '#courier-app{position:fixed;inset:0;z-index:99980;overflow-y:auto;background:#0a1424;color:#e8eef8;font-family:inherit;-webkit-overflow-scrolling:touch}',
      '#courier-app *{box-sizing:border-box}',
      '.cp-head{position:sticky;top:0;z-index:5;background:#0b1b33;border-bottom:1px solid rgba(255,255,255,.08);padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:10px}',
      '.cp-head b{display:block;font-size:16px}.cp-head small{color:#6ee7b7;font-size:11px;font-weight:700}',
      '.cp-btn{border:0;border-radius:12px;padding:10px 14px;font:inherit;font-size:13px;font-weight:700;cursor:pointer;color:#fff;background:rgba(255,255,255,.1)}',
      '.cp-btn:disabled{opacity:.5;cursor:default}',
      '.cp-main{max-width:760px;margin:0 auto;padding:14px 14px 40px}',
      '.cp-tools{display:flex;flex-direction:column;gap:10px;margin-bottom:12px}',
      '.cp-search{width:100%;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#fff;padding:11px 14px;font:inherit;font-size:14px;outline:none}',
      '.cp-search:focus{border-color:#34d399}',
      '.cp-tabs{display:flex;gap:6px;overflow-x:auto;padding-bottom:2px}',
      '.cp-tab{flex:0 0 auto;border:1px solid rgba(255,255,255,.12);background:transparent;color:#b6c3d8;border-radius:999px;padding:7px 13px;font:inherit;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap}',
      '.cp-tab.on{background:#10b981;border-color:#10b981;color:#04110c}',
      '.cp-tab i{font-style:normal;opacity:.75;margin-inline-start:5px}',
      '.cp-meta{display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#7f90a8;margin-bottom:8px}',
      '.cp-card{background:#10223d;border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:14px;margin-bottom:10px}',
      '.cp-row{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}',
      '.cp-name{font-size:15px;font-weight:800;line-height:1.4}',
      '.cp-sub{font-size:11px;color:#8fa1ba;margin-top:2px}.cp-sub b{direction:ltr;unicode-bidi:embed;font-weight:700}',
      '.cp-badge{flex:0 0 auto;border-radius:999px;padding:4px 10px;font-size:11px;font-weight:800;white-space:nowrap}',
      '.cp-b-prog{background:rgba(96,165,250,.16);color:#93c5fd}.cp-b-ready{background:rgba(52,211,153,.18);color:#6ee7b7}',
      '.cp-b-rev{background:rgba(251,191,36,.16);color:#fcd34d}.cp-b-done{background:rgba(148,163,184,.18);color:#cbd5e1}',
      '.cp-chips{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 0}',
      '.cp-chip{background:rgba(255,255,255,.07);border-radius:8px;padding:3px 9px;font-size:11px;color:#d3dcec}',
      '.cp-info{display:flex;flex-wrap:wrap;gap:8px;margin-top:11px}',
      '.cp-a{display:inline-flex;align-items:center;gap:6px;border-radius:10px;padding:8px 11px;font-size:12px;font-weight:700;text-decoration:none;color:#e8eef8;background:rgba(255,255,255,.08)}',
      '.cp-a.wa{background:rgba(37,211,102,.16);color:#86efac}.cp-a.tel{direction:ltr}',
      '.cp-trips{margin-top:10px;font-size:11px;color:#9fb0c8;display:flex;flex-wrap:wrap;gap:4px 14px}',
      '.cp-act{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}',
      '.cp-act .cp-btn{flex:1 1 140px;padding:12px}',
      '.cp-go{background:#10b981;color:#04110c}.cp-alt{background:#2563eb}',
      '.cp-empty{text-align:center;color:#7f90a8;font-size:13px;padding:36px 12px}',
      '.cp-modal{position:fixed;inset:0;z-index:99990;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:16px}',
      '.cp-box{width:100%;max-width:420px;max-height:90vh;overflow-y:auto;background:#10223d;border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:18px;color:#e8eef8}',
      '.cp-box h3{margin:0 0 6px;font-size:16px}.cp-box p{margin:0 0 12px;font-size:12px;color:#9fb0c8;line-height:1.7}',
      '.cp-field{width:100%;border-radius:10px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.07);color:#fff;padding:11px 12px;font:inherit;font-size:14px;margin-bottom:10px;outline:none}',
      '.cp-field:focus{border-color:#34d399}',
      '.cp-btns{display:flex;gap:8px;margin-top:4px}.cp-btns .cp-btn{flex:1;padding:12px}',
      '.cp-toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:99999;background:#10b981;color:#04110c;font-weight:800;font-size:13px;padding:11px 18px;border-radius:12px;max-width:92vw}',
      '.cp-toast.err{background:#f43f5e;color:#fff}',
      '.cp-mgr-row{display:flex;align-items:center;gap:8px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.07);flex-wrap:wrap}',
      '.cp-mgr-row .nm{flex:1 1 130px;font-weight:700;font-size:13px}.cp-mgr-row .em{font-size:11px;color:#6ee7b7;direction:ltr}',
      '.cp-mgr-row input{flex:1 1 170px;margin:0;padding:8px 10px;font-size:12px;direction:ltr}',
      '.cp-mgr-row .cp-btn{padding:8px 12px;font-size:12px}'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ---------- مساعدات ---------- */
  function toast(msg, bad) {
    const t = document.createElement('div'); t.className = 'cp-toast' + (bad ? ' err' : ''); t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), 3200);
  }
  function errMsg(e) {
    const m = String((e && e.message) || e || '');
    if (/already recorded for (.+)/.test(m)) return 'المشوار ده مسجّل لمندوب تاني: ' + m.match(/already recorded for (.+)/)[1];
    if (/not ready/.test(m)) return 'المعاملة لسه مش جاهزة للتسليم (مش مكتملة أو تحت المراجعة)';
    if (/already delivered/.test(m)) return 'المعاملة دي اتسلّمت قبل كده';
    if (/received_by/.test(m)) return 'اكتب اسم الشخص اللي استلم من العميل';
    if (/not linked|courier only/.test(m)) return 'حسابك مش مربوط بمندوب. كلّم المدير';
    if (/not found/.test(m)) return 'المعاملة مش موجودة';
    if (/Failed to fetch|network|NetworkError/i.test(m)) return 'مفيش اتصال بالإنترنت، جرّب تاني';
    return 'حصل خطأ: ' + m;
  }
  const fmtDate = s => { const d = String(s || '').slice(0, 10).split('-'); return d.length === 3 ? d.reverse().join('/') : ''; };
  const waNum = p => { let d = String(p || '').replace(/\D/g, ''); if (d.startsWith('00')) d = d.slice(2); else if (d.startsWith('0')) d = '20' + d.slice(1); return d; };
  const mapsUrl = a => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(a);

  function status(o) {
    const n = Number(o.lines) || 0;
    if (n && Number(o.n_delivered) === n) return { k: 'done', label: 'تم التسليم', cls: 'cp-b-done' };
    if (Number(o.n_review) > 0) return { k: 'rev', label: 'تحت المراجعة', cls: 'cp-b-rev' };
    if (n && Number(o.n_complete) === n) return { k: 'ready', label: 'جاهزة للتسليم', cls: 'cp-b-ready' };
    return { k: 'prog', label: 'جاري التنفيذ', cls: 'cp-b-prog' };
  }

  /* ---------- الشاشة ---------- */
  function overlay(inner) {
    addCss();
    document.body.classList.add('is-partner-mode', 'is-courier-mode');
    ['app', 'login'].forEach(id => { const e = $(id); if (e) e.classList.add('hidden'); });
    let o = $('courier-app');
    if (!o) { o = document.createElement('div'); o.id = 'courier-app'; o.setAttribute('dir', 'rtl'); o.addEventListener('click', onClick); document.body.appendChild(o); }
    o.classList.remove('hidden'); o.innerHTML = inner; return o;
  }
  const logoutBtn = '<button type="button" class="cp-btn" data-act="logout"><i class="fa-solid fa-right-from-bracket"></i> خروج</button>';

  function shell() {
    const root = overlay(
      '<header class="cp-head"><div style="display:flex;align-items:center;gap:10px">' +
        '<img src="logo-transparent.png" alt="" style="height:34px" onerror="this.style.display=\'none\'">' +
        '<div><small>بوابة المندوب</small><b>' + eh(st.me && st.me.name) + '</b></div></div>' + logoutBtn + '</header>' +
      '<main class="cp-main">' +
        '<div class="cp-tools"><input id="cp-q" class="cp-search" type="search" placeholder="ابحث باسم العميل أو الموبايل أو رقم المعاملة" autocomplete="off" value="' + eh(st.q) + '">' +
        '<div class="cp-tabs" id="cp-tabs"></div></div>' +
        '<div class="cp-meta"><span id="cp-upd"></span><button type="button" class="cp-btn" data-act="refresh" style="padding:6px 10px;font-size:11px"><i class="fa-solid fa-rotate"></i> تحديث</button></div>' +
        '<div id="cp-list"></div></main><div id="cp-modal-root"></div>');
    const q = $('cp-q'); if (q) q.addEventListener('input', () => { st.q = q.value; renderList(); });
    return root;
  }

  const TABS = [['open', 'غير المسلّم'], ['ready', 'جاهزة للتسليم'], ['mine', 'مشاويري'], ['done', 'تم التسليم']];
  function pass(o, k) {
    const s = status(o).k, me = st.me && st.me.name;
    if (k === 'open') return s !== 'done';
    if (k === 'ready') return s === 'ready';
    if (k === 'done') return s === 'done';
    if (k === 'mine') return o.pickup_courier === me || o.delivery_courier === me;
    return true;
  }
  function renderList() {
    const tabs = $('cp-tabs'), box = $('cp-list'); if (!tabs || !box) return;
    tabs.innerHTML = TABS.map(t => '<button type="button" class="cp-tab' + (st.filter === t[0] ? ' on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '<i>' + st.list.filter(o => pass(o, t[0])).length + '</i></button>').join('');
    const q = st.q.trim().toLowerCase(), qd = q.replace(/\D/g, '');
    const rows = st.list.filter(o => pass(o, st.filter)).filter(o => !q ||
      String(o.client_name || '').toLowerCase().includes(q) || String(o.transaction_id || '').toLowerCase().includes(q) ||
      (qd && String(o.phone || '').replace(/\D/g, '').includes(qd)));
    if (st.err && !st.list.length) { box.innerHTML = '<div class="cp-empty">' + eh(st.err) + '</div>'; return; }
    box.innerHTML = rows.length ? rows.map(card).join('') : '<div class="cp-empty">مفيش معاملات في القايمة دي</div>';
  }
  function card(o) {
    const s = status(o), tx = eh(o.transaction_id), phone = String(o.phone || '').trim();
    const svcs = (o.services || []).map(x => '<span class="cp-chip">' + eh(x) + '</span>').join('');
    const links = [];
    if (phone) {
      links.push('<a class="cp-a tel" href="tel:' + eh(phone.replace(/[^\d+]/g, '')) + '"><i class="fa-solid fa-phone"></i> ' + eh(phone) + '</a>');
      links.push('<a class="cp-a wa" target="_blank" rel="noopener" href="https://wa.me/' + eh(waNum(phone)) + '"><i class="fa-brands fa-whatsapp"></i> واتساب</a>');
    }
    if (o.address) links.push('<a class="cp-a" target="_blank" rel="noopener" href="' + eh(mapsUrl(o.address)) + '"><i class="fa-solid fa-location-dot"></i> ' + eh(o.address) + '</a>');
    const trips = [];
    if (o.pickup_courier) trips.push('<span><i class="fa-solid fa-box-archive"></i> استلام: ' + eh(o.pickup_courier === '—' ? 'العميل جه بنفسه' : o.pickup_courier) + '</span>');
    if (o.delivery_courier) trips.push('<span><i class="fa-solid fa-truck-fast"></i> تسليم: ' + eh(o.delivery_courier === '—' ? 'العميل استلم بنفسه' : o.delivery_courier) + '</span>');
    const acts = [];
    if (s.k !== 'done' && !o.pickup_courier) acts.push('<button type="button" class="cp-btn cp-alt" data-act="pickup" data-tx="' + tx + '"><i class="fa-solid fa-box-archive"></i> استلمت الأوراق</button>');
    if (s.k === 'ready') acts.push('<button type="button" class="cp-btn cp-go" data-act="deliver" data-tx="' + tx + '"><i class="fa-solid fa-circle-check"></i> سلّمت للعميل</button>');
    return '<div class="cp-card"><div class="cp-row"><div><div class="cp-name">' + eh(o.client_name || 'بدون اسم') + '</div>' +
      '<div class="cp-sub"><b>' + tx + '</b>' + (o.received_at ? ' · ' + eh(fmtDate(o.received_at)) : '') + '</div></div>' +
      '<span class="cp-badge ' + s.cls + '">' + s.label + '</span></div>' +
      (svcs ? '<div class="cp-chips">' + svcs + '</div>' : '') +
      (links.length ? '<div class="cp-info">' + links.join('') + '</div>' : '') +
      (trips.length ? '<div class="cp-trips">' + trips.join('') + '</div>' : '') +
      (acts.length ? '<div class="cp-act">' + acts.join('') + '</div>' : '') + '</div>';
  }

  /* ---------- تحميل البيانات (من غير رمشة: بنعيد الرسم بس لو البيانات اتغيّرت) ---------- */
  async function load(silent) {
    try {
      const r = await sbClient.rpc('courier_list_tx', { p_days: 30 });
      if (r.error) throw r.error;
      st.err = null; st.loadedAt = new Date();
      const data = Array.isArray(r.data) ? r.data : [];
      const sig = JSON.stringify(data);
      if (sig !== st.sig) { st.sig = sig; st.list = data; renderList(); }
    } catch (e) {
      st.err = errMsg(e); if (!silent || !st.list.length) renderList();
      if (!silent) toast(st.err, true);
    }
    const u = $('cp-upd'); if (u && st.loadedAt) u.textContent = 'آخر تحديث ' + st.loadedAt.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  }

  /* ---------- الأكشنز ---------- */
  function modal(html) {
    const r = $('cp-modal-root'); if (!r) return;
    r.innerHTML = '<div class="cp-modal" data-act="mclose"><div class="cp-box" data-keep="1">' + html + '</div></div>';
    const f = r.querySelector('input'); if (f) setTimeout(() => f.focus(), 50);
  }
  const closeModal = () => { const r = $('cp-modal-root'); if (r) r.innerHTML = ''; };
  const byTx = tx => st.list.find(o => String(o.transaction_id) === String(tx));

  function askPickup(tx) {
    const o = byTx(tx); if (!o) return;
    modal('<h3>تأكيد استلام الأوراق</h3><p>هيتسجّل إنك استلمت أوراق <b>' + eh(o.client_name) + '</b> (' + eh(tx) + ') باسمك: ' + eh(st.me.name) + '.</p>' +
      '<div class="cp-btns"><button type="button" class="cp-btn cp-go" data-act="do-pickup" data-tx="' + eh(tx) + '">تأكيد</button><button type="button" class="cp-btn" data-act="mclose-btn">إلغاء</button></div>');
  }
  function askDeliver(tx) {
    const o = byTx(tx); if (!o) return;
    modal('<h3>تأكيد التسليم للعميل</h3><p>معاملة <b>' + eh(o.client_name) + '</b> (' + eh(tx) + '). اكتب اسم الشخص اللي استلم منك.</p>' +
      '<input id="cp-rec" class="cp-field" placeholder="اسم المستلم (إجباري)" maxlength="120" autocomplete="off">' +
      '<input id="cp-note" class="cp-field" placeholder="ملاحظة (اختياري)" maxlength="300" autocomplete="off">' +
      '<div class="cp-btns"><button type="button" class="cp-btn cp-go" data-act="do-deliver" data-tx="' + eh(tx) + '">تأكيد التسليم</button><button type="button" class="cp-btn" data-act="mclose-btn">إلغاء</button></div>');
  }
  async function doConfirm(kind, tx, btn) {
    if (st.busy) return;
    const rec = kind === 'delivery' ? ($('cp-rec') || {}).value || '' : null, note = kind === 'delivery' ? ($('cp-note') || {}).value || '' : null;
    if (kind === 'delivery' && !rec.trim()) { toast('اكتب اسم الشخص اللي استلم من العميل', true); const f = $('cp-rec'); if (f) f.focus(); return; }
    st.busy = true; if (btn) btn.disabled = true;
    try {
      const r = await sbClient.rpc('courier_confirm', { p_tx: tx, p_kind: kind, p_received_by: rec, p_notes: note });
      if (r.error) throw r.error;
      closeModal(); toast(kind === 'pickup' ? 'اتسجّل استلام الأوراق' : 'اتسجّل التسليم'); st.sig = ''; await load(true);
    } catch (e) { toast(errMsg(e), true); if (btn) btn.disabled = false; }
    st.busy = false;
  }

  function onClick(e) {
    const el = e.target.closest('[data-act],[data-tab]'); if (!el) return;
    if (el.dataset.tab) { st.filter = el.dataset.tab; renderList(); return; }
    const a = el.dataset.act, tx = el.dataset.tx;
    if (a === 'mclose') { if (e.target === el) closeModal(); return; }
    if (a === 'mclose-btn') return closeModal();
    if (a === 'logout') return window.handleLogout && window.handleLogout();
    if (a === 'refresh') return load(false);
    if (a === 'pickup') return askPickup(tx);
    if (a === 'deliver') return askDeliver(tx);
    if (a === 'do-pickup') return doConfirm('pickup', tx, el);
    if (a === 'do-deliver') return doConfirm('delivery', tx, el);
  }

  async function showCourier() {
    overlay('<div class="cp-empty" style="margin-top:30vh">جاري التحميل…</div>');
    try {
      const r = await sbClient.rpc('courier_me'); if (r.error) throw r.error; st.me = r.data;
    } catch (e) {
      overlay('<header class="cp-head"><b>بوابة المندوب</b>' + logoutBtn + '</header><div class="cp-empty" style="margin-top:20vh">' + eh(errMsg(e)) + '</div>');
      return;
    }
    shell(); st.sig = ''; await load(false);
    clearInterval(st.timer); st.timer = setInterval(() => { if (!document.hidden) load(true); }, 60000);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && st.me && $('courier-app')) load(true); });

  /* ---------- نقطة الدخول: لو الدور courier نعرض البوابة، غير كده السيستم يكمل عادي ---------- */
  const _li = window.loadInitialData;
  window.loadInitialData = async function () {
    let role = null;
    try { const r = await sbClient.rpc('my_role'); role = r && !r.error ? r.data : null; } catch (e) { /* */ }
    if (role === 'courier') { window.__role = 'courier'; return showCourier(); }
    const out = await _li.apply(this, arguments);
    if (window.__role === 'manager') addMgrBtn();
    return out;
  };
  const _sl = window.showLoginScreen;
  window.showLoginScreen = function () {
    clearInterval(st.timer); st.me = null; st.sig = ''; st.list = [];
    document.body.classList.remove('is-courier-mode', 'is-partner-mode');
    const o = $('courier-app'); if (o) o.remove();
    return _sl.apply(this, arguments);
  };

  /* ---------- المدير: ربط حساب بمندوب ---------- */
  function addMgrBtn() {
    if ($('cp-mgr-btn')) return;
    const anchor = $('tab-couriers-btn'); if (!anchor) return;
    anchor.insertAdjacentHTML('afterend', '<button id="cp-mgr-btn" type="button" class="tab-btn"><i class="fa-solid fa-id-card"></i><span>حسابات المناديب</span></button>');
    $('cp-mgr-btn').addEventListener('click', () => { if (window.closeNavMenu) window.closeNavMenu(); openMgr(); });
  }
  function mgrShell(inner) {
    addCss(); let o = $('cp-mgr'); if (!o) { o = document.createElement('div'); o.id = 'cp-mgr'; o.className = 'cp-modal'; o.setAttribute('dir', 'rtl'); document.body.appendChild(o); }
    o.innerHTML = '<div class="cp-box" style="max-width:560px">' + inner + '</div>'; return o;
  }
  async function openMgr() {
    const o = mgrShell('<h3>حسابات المناديب</h3><p>جاري التحميل…</p>');
    o.onclick = ev => { if (ev.target === o) o.remove(); };
    const r = await sbClient.rpc('list_courier_accounts');
    if (r.error) { mgrShell('<h3>حسابات المناديب</h3><p>مش قادر أحمّل القايمة. اتأكد إنك شغّلت sql/courier-portal.sql.</p><div class="cp-btns"><button type="button" class="cp-btn" id="cp-mgr-x">إغلاق</button></div>'); $('cp-mgr-x').onclick = () => $('cp-mgr').remove(); return; }
    const rows = (r.data || []).filter(c => c.active).map(c => c.user_id
      ? '<div class="cp-mgr-row"><span class="nm">' + eh(c.name) + '</span><span class="em">' + eh(c.email || 'مربوط') + '</span><button type="button" class="cp-btn" style="background:#be123c" data-unlink="' + eh(c.user_id) + '">إيقاف</button></div>'
      : '<form class="cp-mgr-row" data-link="' + eh(c.id) + '"><span class="nm">' + eh(c.name) + '</span><input class="cp-field" type="email" required placeholder="إيميل حساب المندوب"><button class="cp-btn cp-go">ربط</button></form>').join('');
    const m = mgrShell('<h3>حسابات المناديب</h3><p>1) اعمل حساب للمندوب من Supabase (Authentication ← Add user). 2) اكتب إيميله قدام اسمه هنا واضغط «ربط». المندوب هيدخل ويلاقي شاشة مشاويره بس.</p>' + (rows || '<p>مفيش مناديب نشطين.</p>') +
      '<div class="cp-btns" style="margin-top:12px"><button type="button" class="cp-btn" id="cp-mgr-x">إغلاق</button></div>');
    m.onclick = ev => { if (ev.target === m) m.remove(); };
    $('cp-mgr-x').onclick = () => m.remove();
    m.querySelectorAll('[data-link]').forEach(f => f.addEventListener('submit', async ev => {
      ev.preventDefault();
      const x = await sbClient.rpc('assign_courier', { p_email: f.querySelector('input').value.trim(), p_courier_id: Number(f.dataset.link) });
      if (x.error) return toast(/no such account/.test(x.error.message) ? 'مفيش حساب بالإيميل ده في Supabase' : /another role/.test(x.error.message) ? 'الحساب ده ليه دور تاني' : errMsg(x.error), true);
      toast('اتربط الحساب'); openMgr();
    }));
    m.querySelectorAll('[data-unlink]').forEach(b => b.addEventListener('click', async () => {
      if (!window.confirm('إيقاف حساب المندوب ده؟ مش هيقدر يدخل تاني.')) return;
      const x = await sbClient.rpc('remove_role', { p_user: b.dataset.unlink });
      if (x.error) return toast(errMsg(x.error), true); toast('اتوقف الحساب'); openMgr();
    }));
  }
})();
