/* =====================================================================
   بوابة المندوب (js/70-courier-portal.js) — النسخة 2
   - المندوب بيدخل بحساب دوره courier فبتظهر له الشاشة دي بس (مفيش #app).
   - 4 تابات: حسابي (عمولته لايف) / مشاويري / المراجعة (تأكيد آخر اليوم) / التواصل (رسايل خاصة + اتصال).
   - كل بياناته من دوال courier_* في sql/courier-portal.sql، وكل دالة بتجيب شغله هو بس.
   - المندوب مابيغيّرش حالة أي معاملة: بيأكّد مشاويره (لعمولته) وبيسيب ملاحظات للموظف.
   - المدير بيربط حساب بمندوب من قايمة التابات: «حسابات المناديب».
   - مش بيلمس js/13 ولا js/14 (بيلفّ حوالين loadInitialData / showLoginScreen).
   ===================================================================== */
(function () {
  if (window.__courierPortal) return; window.__courierPortal = true;
  const $ = id => document.getElementById(id);
  const eh = s => escapeHtml(s == null ? '' : String(s));
  const TZ = 'Africa/Cairo';
  const st = {
    me: null, items: [], sig: '', tab: 'home', period: 'today', day: null, type: 'all',
    contacts: [], csig: '', chat: null, msgs: [], draft: '', theme: 'dark', timer: null, tick: 0,
    busy: false, offline: false, unreadSeen: 0, loaded: false
  };

  /* ---------- تواريخ (بتوقيت القاهرة) ---------- */
  const today = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
  const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const weekStart = s => addDays(s, -((new Date(s + 'T00:00:00Z').getUTCDay() + 1) % 7));   /* الأسبوع بيبدأ السبت */
  const monthStart = s => s.slice(0, 8) + '01';
  const dayLabel = s => new Date(s + 'T12:00:00Z').toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const timeOf = iso => { try { return new Date(iso).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', timeZone: TZ }); } catch (e) { return ''; } };
  const rangeOf = p => { const t = today(); return p === 'today' ? [t, t] : p === 'week' ? [weekStart(t), t] : [monthStart(t), t]; };
  const money = n => Number(n || 0).toLocaleString('ar-EG') + ' ج';
  const num = n => Number(n || 0).toLocaleString('ar-EG');

  /* ---------- ثيم: صباحي (فاتح) / مسائي (داكن) ---------- */
  function initTheme() {
    let t = null; try { t = localStorage.getItem('ts_cp_theme'); } catch (e) { /* */ }
    if (t !== 'light' && t !== 'dark') { const h = Number(new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: TZ })); t = (h >= 6 && h < 18) ? 'light' : 'dark'; }
    st.theme = t;
  }
  function applyTheme() {
    const o = $('courier-app'); if (o) o.setAttribute('data-theme', st.theme);
    const b = $('cp-theme'); if (b) b.innerHTML = st.theme === 'dark' ? '<i class="fa-solid fa-sun"></i> صباحي' : '<i class="fa-solid fa-moon"></i> مسائي';
  }
  function toggleTheme() { st.theme = st.theme === 'dark' ? 'light' : 'dark'; try { localStorage.setItem('ts_cp_theme', st.theme); } catch (e) { /* */ } applyTheme(); }

  /* ---------- ستايل مستقل (من غير Tailwind) ---------- */
  function addCss() {
    if ($('cp-style')) return;
    const s = document.createElement('style'); s.id = 'cp-style';
    s.textContent = [
      'body.is-courier-mode #app,body.is-courier-mode #login{display:none !important}',
      '#courier-app{--bg:#0a1424;--card:#10223d;--tx:#e8eef8;--mu:#8fa1ba;--bd:rgba(255,255,255,.1);--fld:rgba(255,255,255,.07);--hd:#0b1b33;--hdtx:#fff;--hdbt:rgba(255,255,255,.1);--chip:rgba(255,255,255,.07);--sh:none}',
      '#courier-app[data-theme=light]{--bg:#eef2f7;--card:#fff;--tx:#0f172a;--mu:#64748b;--bd:#e2e8f0;--fld:#f1f5f9;--hd:#fff;--hdtx:#0f172a;--hdbt:#eef2f7;--chip:#eef2f7;--sh:0 1px 3px rgba(15,23,42,.08)}',
      '#courier-app{position:fixed;inset:0;z-index:99980;display:flex;flex-direction:column;background:var(--bg);color:var(--tx);font-family:inherit}',
      '#courier-app *{box-sizing:border-box}',
      '.cp-head{flex:0 0 auto;background:var(--hd);color:var(--hdtx);border-bottom:1px solid var(--bd);padding:8px 12px;display:flex;align-items:center;gap:8px;box-shadow:var(--sh)}',
      '.cp-who{flex:1;min-width:0}.cp-who small{display:block;color:#10b981;font-size:10px;font-weight:800}.cp-who b{display:block;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.cp-clock{text-align:center;line-height:1.2;padding:0 6px}.cp-clock b{display:block;font-size:17px;font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap;direction:ltr}.cp-clock small{display:block;font-size:10px;color:var(--mu);white-space:nowrap}',
      '.cp-btn{border:0;border-radius:12px;padding:10px 14px;font:inherit;font-size:13px;font-weight:700;cursor:pointer;color:var(--tx);background:var(--chip)}',
      '.cp-btn:disabled{opacity:.5;cursor:default}.cp-sm{padding:7px 10px;font-size:11px;border-radius:10px}',
      '.cp-hbtn{border:0;border-radius:10px;padding:8px 10px;font:inherit;font-size:11px;font-weight:700;cursor:pointer;color:var(--hdtx);background:var(--hdbt);white-space:nowrap}',
      '.cp-off{display:none;flex:0 0 auto;background:#b45309;color:#fff;text-align:center;font-size:12px;font-weight:700;padding:5px}.cp-off.on{display:block}',
      '.cp-body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:12px 12px 20px;max-width:760px;width:100%;margin:0 auto}',
      '.cp-nav{flex:0 0 auto;display:flex;background:var(--hd);border-top:1px solid var(--bd);padding-bottom:env(safe-area-inset-bottom)}',
      '.cp-nav button{flex:1;border:0;background:transparent;color:var(--mu);font:inherit;font-size:11px;font-weight:700;padding:9px 2px 8px;cursor:pointer;position:relative}',
      '.cp-nav button i{display:block;font-size:18px;margin-bottom:3px}.cp-nav button.on{color:#10b981}',
      '.cp-bdg{position:absolute;top:4px;inset-inline-start:calc(50% + 8px);min-width:17px;height:17px;border-radius:9px;background:#f43f5e;color:#fff;font-size:10px;line-height:17px;padding:0 4px;font-style:normal}',
      '.cp-seg{display:flex;gap:4px;background:var(--chip);border-radius:12px;padding:3px;margin-bottom:12px}',
      '.cp-seg button{flex:1;border:0;border-radius:9px;padding:8px 4px;font:inherit;font-size:12px;font-weight:800;background:transparent;color:var(--mu);cursor:pointer}',
      '.cp-seg button.on{background:#10b981;color:#04110c}',
      '.cp-hero{background:linear-gradient(135deg,#047857,#10b981);color:#04110c;border-radius:18px;padding:16px;margin-bottom:12px}',
      '.cp-hero small{display:block;font-size:12px;font-weight:700;opacity:.85}.cp-hero b{display:block;font-size:30px;font-weight:900;margin:2px 0}',
      '.cp-hero .pend{display:flex;align-items:center;justify-content:space-between;gap:8px;background:rgba(255,255,255,.35);border-radius:12px;padding:8px 10px;margin-top:8px;font-size:12px;font-weight:800}',
      '.cp-hero .pend button{border:0;border-radius:9px;background:#04110c;color:#fff;font:inherit;font-size:11px;font-weight:800;padding:7px 10px;cursor:pointer}',
      '.cp-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}.cp-grid .wide{grid-column:1/-1}',
      '.cp-kpi{background:var(--card);border:1px solid var(--bd);border-radius:16px;padding:12px;box-shadow:var(--sh)}',
      '.cp-kpi small{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--mu);font-weight:700}.cp-kpi b{display:block;font-size:24px;font-weight:900;margin:4px 0 2px}',
      '.cp-kpi .m{font-size:12px;font-weight:800;color:#10b981}.cp-kpi .p{font-size:11px;font-weight:700;color:#f59e0b;margin-top:2px}.cp-kpi .s{font-size:10px;color:var(--mu);margin-top:3px}',
      '.cp-h{font-size:13px;font-weight:800;margin:14px 2px 8px;color:var(--mu)}',
      '.cp-card{background:var(--card);border:1px solid var(--bd);border-radius:16px;padding:12px;margin-bottom:10px;box-shadow:var(--sh)}',
      '.cp-row{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}',
      '.cp-name{font-size:15px;font-weight:800;line-height:1.4}.cp-sub{font-size:11px;color:var(--mu);margin-top:2px}.cp-sub b{direction:ltr;unicode-bidi:embed;font-weight:700}',
      '.cp-tag{flex:0 0 auto;border-radius:999px;padding:3px 9px;font-size:11px;font-weight:800;white-space:nowrap}',
      '.k-pk{background:rgba(37,99,235,.15);color:#3b82f6}.k-dl{background:rgba(16,185,129,.16);color:#10b981}.k-fe{background:rgba(245,158,11,.18);color:#d97706}',
      '.ok{background:rgba(16,185,129,.16);color:#10b981}.wt{background:rgba(245,158,11,.18);color:#d97706}.gy{background:var(--chip);color:var(--mu)}.rd{background:rgba(244,63,94,.15);color:#f43f5e}',
      '.cp-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.cp-chip{background:var(--chip);border-radius:8px;padding:3px 9px;font-size:11px}',
      '.cp-info{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}',
      '.cp-a{display:inline-flex;align-items:center;gap:6px;border:0;border-radius:10px;padding:8px 11px;font:inherit;font-size:12px;font-weight:700;text-decoration:none;color:var(--tx);background:var(--chip);cursor:pointer}',
      '.cp-a.wa{background:rgba(37,211,102,.16);color:#16a34a}.cp-a.tel{direction:ltr}',
      '.cp-emp{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:1px dashed var(--bd);font-size:12px;color:var(--mu)}.cp-emp b{color:var(--tx)}',
      '.cp-day{display:flex;align-items:center;gap:8px;margin-bottom:10px}.cp-day .t{flex:1;text-align:center;font-size:14px;font-weight:800}',
      '.cp-day button{border:0;height:38px;padding:0 12px;border-radius:12px;background:var(--chip);color:var(--tx);font:inherit;font-size:12px;font-weight:700;cursor:pointer}.cp-day button:disabled{opacity:.35}',
      '.cp-tabs{display:flex;gap:6px;overflow-x:auto;margin-bottom:10px;padding-bottom:2px}',
      '.cp-tab{flex:0 0 auto;border:1px solid var(--bd);background:transparent;color:var(--mu);border-radius:999px;padding:6px 12px;font:inherit;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap}',
      '.cp-tab.on{background:#10b981;border-color:#10b981;color:#04110c}.cp-tab i{font-style:normal;opacity:.75;margin-inline-start:5px}',
      '.cp-empty{text-align:center;color:var(--mu);font-size:13px;padding:30px 12px}',
      '.cp-rev{display:flex;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px solid var(--bd);font-size:13px}.cp-rev:last-of-type{border-bottom:0}.cp-rev span{color:var(--mu);font-size:11px}',
      '.cp-big{width:100%;border:0;border-radius:14px;padding:13px;font:inherit;font-size:14px;font-weight:800;cursor:pointer;background:#10b981;color:#04110c;margin-top:10px}.cp-big:disabled{opacity:.5}',
      '.cp-done{margin-top:10px;text-align:center;border-radius:12px;padding:10px;font-size:13px;font-weight:800;background:rgba(16,185,129,.14);color:#10b981}',
      '.cp-old{background:rgba(245,158,11,.14);border:1px solid rgba(245,158,11,.4);border-radius:14px;padding:10px;margin-bottom:10px;font-size:12px;font-weight:700;color:#d97706}.cp-old button{margin:6px 4px 0 0}',
      '.cp-ct{display:flex;align-items:center;gap:10px;cursor:pointer}.cp-av{flex:0 0 auto;width:44px;height:44px;border-radius:50%;background:#10b981;color:#04110c;font-weight:900;font-size:17px;display:flex;align-items:center;justify-content:center;position:relative}',
      '.cp-av i{position:absolute;bottom:0;inset-inline-end:0;width:12px;height:12px;border-radius:50%;border:2px solid var(--card);background:#94a3b8}.cp-av i.on{background:#22c55e}',
      '.cp-ct .m{flex:1;min-width:0}.cp-ct .m b{display:block;font-size:14px}.cp-ct .m small{display:block;font-size:11px;color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.cp-ub{min-width:20px;height:20px;border-radius:10px;background:#f43f5e;color:#fff;font-size:11px;font-weight:800;line-height:20px;text-align:center;padding:0 6px}',
      '.cp-chat{display:flex;flex-direction:column;height:calc(100vh - 150px);min-height:300px}',
      '.cp-chead{display:flex;align-items:center;gap:8px;margin-bottom:8px}.cp-chead b{flex:1;font-size:15px}',
      '.cp-msgs{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:6px;padding:4px 2px}',
      '.cp-m{max-width:82%;border-radius:14px;padding:8px 11px;font-size:14px;line-height:1.6;white-space:pre-wrap;word-break:break-word;background:var(--card);border:1px solid var(--bd)}',
      '.cp-m.me{align-self:flex-start;background:#10b981;border-color:#10b981;color:#04110c}.cp-m.th{align-self:flex-end}',
      '.cp-m small{display:block;font-size:10px;opacity:.7;margin-top:2px}.cp-m .tx{display:inline-block;font-size:10px;font-weight:800;background:rgba(0,0,0,.12);border-radius:6px;padding:1px 6px;margin-bottom:3px}',
      '.cp-comp{display:flex;gap:6px;align-items:flex-end;margin-top:8px}.cp-comp textarea{flex:1;max-height:110px}',
      '.cp-field{width:100%;border-radius:10px;border:1px solid var(--bd);background:var(--fld);color:var(--tx);padding:10px 12px;font:inherit;font-size:14px;outline:none;resize:none}.cp-field:focus{border-color:#10b981}',
      '.cp-modal{position:fixed;inset:0;z-index:99990;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;padding:16px}',
      '.cp-box{width:100%;max-width:430px;max-height:90vh;overflow-y:auto;background:var(--card);color:var(--tx);border:1px solid var(--bd);border-radius:18px;padding:16px}',
      '.cp-box h3{margin:0 0 6px;font-size:16px}.cp-box p{margin:0 0 10px;font-size:12px;color:var(--mu);line-height:1.7}',
      '.cp-btns{display:flex;gap:8px;margin-top:10px}.cp-btns .cp-btn{flex:1;padding:12px}.cp-go{background:#10b981;color:#04110c}',
      '.cp-kinds{display:flex;flex-direction:column;gap:6px;margin-bottom:10px}.cp-kinds button{border:1px solid var(--bd);background:transparent;color:var(--tx);border-radius:12px;padding:10px;font:inherit;font-size:13px;font-weight:700;text-align:start;cursor:pointer}.cp-kinds button.on{border-color:#10b981;background:rgba(16,185,129,.12)}',
      '.cp-old-n{font-size:11px;color:var(--mu);border-top:1px dashed var(--bd);padding-top:6px;margin-top:6px}',
      '.cp-toast{position:fixed;left:50%;bottom:78px;transform:translateX(-50%);z-index:99999;background:#10b981;color:#04110c;font-weight:800;font-size:13px;padding:11px 18px;border-radius:12px;max-width:92vw}.cp-toast.err{background:#f43f5e;color:#fff}',
      '.cp-mgr-row{display:flex;align-items:center;gap:8px;padding:9px 0;border-bottom:1px solid var(--bd);flex-wrap:wrap}.cp-mgr-row .nm{flex:1 1 130px;font-weight:700;font-size:13px}.cp-mgr-row .em{font-size:11px;color:#10b981;direction:ltr}',
      '.cp-mgr-row .st{flex:1 1 100%;font-size:11px;color:var(--mu)}.cp-mgr-row input{flex:1 1 170px;margin:0;padding:8px 10px;font-size:12px;direction:ltr}.cp-mgr-row .cp-btn{padding:8px 12px;font-size:12px}',
      '#cp-mgr{--card:#10223d;--tx:#e8eef8;--mu:#9fb0c8;--bd:rgba(255,255,255,.12);--fld:rgba(255,255,255,.07);--chip:rgba(255,255,255,.1)}'
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
    if (/not your transaction/.test(m)) return 'المعاملة دي مش على اسمك';
    if (/body required/.test(m)) return 'اكتب الملاحظة الأول';
    if (/bad day/.test(m)) return 'مينفعش تأكد يوم لسه ماجاش';
    if (/not linked|courier only/.test(m)) return 'حسابك مش مربوط بمندوب. كلّم المدير';
    if (/Failed to fetch|network|NetworkError|load failed/i.test(m)) return 'مفيش اتصال بالإنترنت، جرّب تاني';
    return 'حصل خطأ: ' + m;
  }
  const waNum = p => { let d = String(p || '').replace(/\D/g, ''); if (d.startsWith('00')) d = d.slice(2); else if (d.startsWith('0')) d = '20' + d.slice(1); return d; };
  const mapsUrl = a => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(a);
  const telHref = p => 'tel:' + String(p || '').replace(/[^\d+]/g, '');
  const callBtns = (phone, label) => { if (!phone) return ''; const lb = label === undefined ? phone : label;
    return '<a class="cp-a tel" href="' + eh(telHref(phone)) + '"><i class="fa-solid fa-phone"></i>' + (lb ? ' ' + eh(lb) : '') + '</a>' +
      '<a class="cp-a wa" target="_blank" rel="noopener" href="https://wa.me/' + eh(waNum(phone)) + '"><i class="fa-brands fa-whatsapp"></i>' + (label === '' ? '' : ' واتساب') + '</a>'; };

  function txState(o) {
    const n = Number(o.lines) || 0;
    if (n && Number(o.n_delivered) === n) return ['تم التسليم', 'gy'];
    if (Number(o.n_review) > 0) return ['تحت المراجعة', 'wt'];
    if (n && Number(o.n_complete) === n) return ['جاهزة للتسليم', 'ok'];
    return ['جاري التنفيذ', 'k-pk'];
  }
  const KIND = {
    pickup: { label: 'استلام', icon: 'fa-box-archive', cls: 'k-pk', sec: 'الاستلام', btn: 'تم تأكيد الاستلام' },
    delivery: { label: 'تسليم', icon: 'fa-truck-fast', cls: 'k-dl', sec: 'التسليم', btn: 'تم تأكيد التسليم' },
    fee: { label: 'رسوم توصيل', icon: 'fa-motorcycle', cls: 'k-fe', sec: 'رسوم التوصيل', btn: 'تم تأكيد رسوم التوصيل' }
  };
  const kindLabel = it => it.type === 'fee' ? (it.fee_kind === 'round' ? 'رسوم توصيل · ذهاب وعودة' : 'رسوم توصيل · ذهاب فقط') : KIND[it.type].label;

  /* ---------- إحصائيات (من الداتا اللي جت من السيرفر) ---------- */
  function stats(range) {
    const r = { pickup: {}, delivery: {}, fee: {} }, f = range[0], t = range[1];
    Object.keys(r).forEach(k => r[k] = { n: 0, cn: 0, amt: 0, camt: 0, pn: 0, pamt: 0 });
    let one = 0, round = 0;
    st.items.forEach(it => {
      if (it.day < f || it.day > t) return;
      const s = r[it.type], a = Number(it.amount) || 0; s.n++; s.amt += a;
      if (it.confirmed) { s.cn++; s.camt += a; } else { s.pn++; s.pamt += a; }
      if (it.type === 'fee') { if (it.fee_kind === 'round') round++; else one++; }
    });
    r.one = one; r.round = round;
    r.total = r.pickup.camt + r.delivery.camt + r.fee.camt; r.pend = r.pickup.pamt + r.delivery.pamt + r.fee.pamt;
    r.pendN = r.pickup.pn + r.delivery.pn + r.fee.pn;
    return r;
  }

  /* ---------- الهيكل ---------- */
  function overlay(inner) {
    addCss();
    document.body.classList.add('is-partner-mode', 'is-courier-mode');
    ['app', 'login'].forEach(id => { const e = $(id); if (e) e.classList.add('hidden'); });
    let o = $('courier-app');
    if (!o) { o = document.createElement('div'); o.id = 'courier-app'; o.setAttribute('dir', 'rtl'); o.addEventListener('click', onClick); o.addEventListener('keydown', onKey); document.body.appendChild(o); }
    o.classList.remove('hidden'); o.setAttribute('data-theme', st.theme); o.innerHTML = inner; return o;
  }
  const logoutBtn = '<button type="button" class="cp-hbtn" data-act="logout"><i class="fa-solid fa-right-from-bracket"></i> خروج</button>';

  function shell() {
    overlay(
      '<header class="cp-head"><img src="logo-transparent.png" alt="" style="height:30px" onerror="this.style.display=\'none\'">' +
        '<div class="cp-who"><small>بوابة المندوب</small><b>' + eh(st.me && st.me.name) + '</b></div>' +
        '<div class="cp-clock"><b id="cp-time"></b><small id="cp-date"></small></div>' +
        '<button type="button" class="cp-hbtn" id="cp-theme" data-act="theme"></button>' + logoutBtn + '</header>' +
      '<div class="cp-off" id="cp-off">مفيش اتصال بالإنترنت… بحاول تاني</div>' +
      '<main class="cp-body" id="cp-body"></main>' +
      '<nav class="cp-nav" id="cp-nav"></nav><div id="cp-modal-root"></div>');
    applyTheme(); tickClock(); renderNav(); renderTab();
  }
  function tickClock() {
    const t = $('cp-time'), d = $('cp-date'); if (!t) return;
    const now = new Date();
    const a = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: TZ });
    const b = now.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });
    if (t.textContent !== a) t.textContent = a; if (d && d.textContent !== b) d.textContent = b;
  }
  const unreadTotal = () => st.contacts.reduce((a, c) => a + (Number(c.unread) || 0), 0);
  function renderNav() {
    const n = $('cp-nav'); if (!n) return;
    const u = unreadTotal(), pend = st.items.filter(i => !i.confirmed).length;
    const T = [['home', 'fa-chart-pie', 'حسابي', 0], ['trips', 'fa-motorcycle', 'مشاويري', 0], ['review', 'fa-clipboard-check', 'المراجعة', pend], ['chat', 'fa-comments', 'التواصل', u]];
    const html = T.map(t => '<button type="button" data-tab="' + t[0] + '" class="' + (st.tab === t[0] ? 'on' : '') + '"><i class="fa-solid ' + t[1] + '"></i>' + t[2] + (t[3] ? '<em class="cp-bdg">' + num(t[3]) + '</em>' : '') + '</button>').join('');
    if (n.dataset.h !== html) { n.dataset.h = html; n.innerHTML = html; }
  }
  function setTab(t) { st.tab = t; if (t !== 'chat') st.chat = null; renderNav(); renderTab(true); }
  function renderTab(top) {
    const b = $('cp-body'); if (!b) return;
    const y = b.scrollTop;
    if (st.tab === 'home') b.innerHTML = viewHome();
    else if (st.tab === 'trips') b.innerHTML = viewTrips();
    else if (st.tab === 'review') b.innerHTML = viewReview();
    else viewChat();
    b.scrollTop = top ? 0 : y;
  }

  /* ---------- حسابي ---------- */
  function viewHome() {
    const s = stats(rangeOf(st.period));
    const seg = '<div class="cp-seg">' + [['today', 'اليوم'], ['week', 'الأسبوع'], ['month', 'الشهر']].map(p => '<button type="button" data-per="' + p[0] + '" class="' + (st.period === p[0] ? 'on' : '') + '">' + p[1] + '</button>').join('') + '</div>';
    const hero = '<div class="cp-hero"><small>عمولتك المؤكدة</small><b>' + money(s.total) + '</b>' +
      (s.pendN ? '<div class="pend"><span>+ ' + money(s.pend) + ' في انتظار تأكيدك (' + num(s.pendN) + ' مشوار)</span><button type="button" data-tab="review">راجع وأكّد</button></div>' : '<small>كل مشاويرك في الفترة دي متأكدة ✓</small>') + '</div>';
    const kpi = (k, icon, title, extra) => { const x = s[k]; return '<div class="cp-kpi"><small><i class="fa-solid ' + icon + '"></i>' + title + '</small><b>' + num(x.n) + '</b><div class="m">' + money(x.camt) + ' مؤكدة</div>' + (x.pamt ? '<div class="p">+ ' + money(x.pamt) + ' في الانتظار</div>' : '') + (extra ? '<div class="s">' + extra + '</div>' : '') + '</div>'; };
    const grid = '<div class="cp-grid">' + kpi('pickup', 'fa-box-archive', 'استلمت', 'عمولة الاستلام') + kpi('delivery', 'fa-truck-fast', 'سلّمت', 'عمولة التسليم') +
      '<div class="cp-kpi wide"><small><i class="fa-solid fa-motorcycle"></i>مشاوير رسوم التوصيل</small><b>' + num(s.fee.n) + ' <span style="font-size:13px;font-weight:700;color:var(--mu)">مشوار</span></b><div class="m">' + money(s.fee.camt) + ' مؤكدة</div>' +
      (s.fee.pamt ? '<div class="p">+ ' + money(s.fee.pamt) + ' في الانتظار</div>' : '') + '<div class="s">ذهاب فقط: ' + num(s.one) + ' · ذهاب وعودة: ' + num(s.round) + '</div></div></div>';
    const recent = st.items.slice(0, 6).map(it => '<div class="cp-card" style="padding:10px"><div class="cp-row"><div><div class="cp-name" style="font-size:14px">' + eh(it.client_name || 'بدون اسم') + '</div><div class="cp-sub">' + eh(kindLabel(it)) + ' · ' + eh(dayLabel(it.day)) + '</div></div><div style="text-align:end"><b>' + money(it.amount) + '</b><div><span class="cp-tag ' + (it.confirmed ? 'ok' : 'wt') + '">' + (it.confirmed ? 'مؤكد' : 'بانتظارك') + '</span></div></div></div></div>').join('');
    const load = !st.loaded ? '<div class="cp-empty">جاري التحميل…</div>' : '';
    return seg + hero + grid + '<div class="cp-h">آخر مشاويرك</div>' + (recent || load || '<div class="cp-empty">لسه مفيش مشاوير متسجلة باسمك</div>');
  }

  /* ---------- مشاويري ---------- */
  function dayNav() {
    const t = today();
    return '<div class="cp-day"><button type="button" data-act="dprev">اليوم السابق</button><div class="t">' + eh(dayLabel(st.day)) + (st.day === t ? ' · النهارده' : '') + '</div>' +
      '<button type="button" data-act="dnext"' + (st.day >= t ? ' disabled' : '') + '>اليوم التالي</button></div>';
  }
  const itemsOf = d => st.items.filter(it => it.day === d);
  function viewTrips() {
    const all = itemsOf(st.day), n = k => all.filter(i => k === 'all' || i.type === k).length;
    const tabs = '<div class="cp-tabs">' + [['all', 'الكل'], ['pickup', 'استلام'], ['delivery', 'تسليم'], ['fee', 'رسوم توصيل']].map(t => '<button type="button" class="cp-tab' + (st.type === t[0] ? ' on' : '') + '" data-type="' + t[0] + '">' + t[1] + '<i>' + num(n(t[0])) + '</i></button>').join('') + '</div>';
    const rows = all.filter(i => st.type === 'all' || i.type === st.type);
    return dayNav() + tabs + (rows.length ? rows.map(tripCard).join('') : '<div class="cp-empty">' + (st.loaded ? 'مفيش مشاوير في اليوم ده' : 'جاري التحميل…') + '</div>');
  }
  function tripCard(it) {
    const k = KIND[it.type], [sl, sc] = txState(it);
    const links = [];
    if (it.phone) links.push(callBtns(it.phone));
    if (it.address) links.push('<a class="cp-a" target="_blank" rel="noopener" href="' + eh(mapsUrl(it.address)) + '"><i class="fa-solid fa-location-dot"></i> ' + eh(it.address) + '</a>');
    const emp = it.employee ? '<div class="cp-emp"><span>الموظف: <b>' + eh(it.employee) + '</b></span>' +
      (it.employee_phone ? '<a class="cp-a tel" href="' + eh(telHref(it.employee_phone)) + '"><i class="fa-solid fa-phone"></i> اتصال</a>' : '') +
      (it.employee_id ? '<button type="button" class="cp-a" data-act="chat-emp" data-uid="' + eh(it.employee_id) + '" data-tx="' + eh(it.transaction_id) + '"><i class="fa-solid fa-comment"></i> رسالة</button>' : '') + '</div>' : '';
    return '<div class="cp-card"><div class="cp-row"><div><div class="cp-name">' + eh(it.client_name || 'بدون اسم') + '</div><div class="cp-sub"><b>' + eh(it.transaction_id) + '</b></div></div>' +
      '<div style="text-align:end"><b style="font-size:16px">' + money(it.amount) + '</b><div style="margin-top:3px"><span class="cp-tag ' + (it.confirmed ? 'ok' : 'wt') + '">' + (it.confirmed ? '✓ مؤكد ' + eh(timeOf(it.confirmed_at)) : 'بانتظار تأكيدك') + '</span></div></div></div>' +
      '<div class="cp-chips"><span class="cp-tag ' + k.cls + '"><i class="fa-solid ' + k.icon + '"></i> ' + eh(kindLabel(it)) + '</span><span class="cp-tag ' + sc + '">' + sl + '</span>' +
      (it.type !== 'fee' ? String(it.services || '').split('، ').filter(Boolean).slice(0, 4).map(x => '<span class="cp-chip">' + eh(x) + '</span>').join('') : '') + '</div>' +
      (links.length ? '<div class="cp-info">' + links.join('') + '</div>' : '') + emp +
      '<div class="cp-info"><button type="button" class="cp-a" data-act="note" data-tx="' + eh(it.transaction_id) + '"><i class="fa-solid fa-note-sticky"></i> ملاحظة للموظف' + (Number(it.my_notes) ? ' (' + num(it.my_notes) + ')' : '') + '</button></div></div>';
  }

  /* ---------- المراجعة (تأكيد آخر اليوم) ---------- */
  function viewReview() {
    const t = today();
    const old = {}; st.items.forEach(i => { if (!i.confirmed && i.day < t) old[i.day] = (old[i.day] || 0) + 1; });
    const oldDays = Object.keys(old).sort().reverse().slice(0, 6).filter(d => d !== st.day);
    const oldBox = oldDays.length ? '<div class="cp-old">عندك أيام قبل كده لسه ما اتأكدتش:<br>' + oldDays.map(d => '<button type="button" class="cp-a" data-act="dset" data-day="' + d + '">' + eh(dayLabel(d)) + ' (' + num(old[d]) + ')</button>').join('') + '</div>' : '';
    const all = itemsOf(st.day);
    const sec = k => {
      const rows = all.filter(i => i.type === k); if (!rows.length) return '';
      const pend = rows.filter(i => !i.confirmed), tot = rows.reduce((a, i) => a + Number(i.amount || 0), 0), ptot = pend.reduce((a, i) => a + Number(i.amount || 0), 0);
      const last = rows.filter(i => i.confirmed_at).map(i => i.confirmed_at).sort().pop();
      return '<div class="cp-card"><div class="cp-row"><b>' + KIND[k].sec + '</b><span class="cp-tag ' + KIND[k].cls + '">' + num(rows.length) + ' مشوار · ' + money(tot) + '</span></div><div style="margin-top:6px">' +
        rows.map(i => '<div class="cp-rev"><div>' + eh(i.client_name || 'بدون اسم') + '<br><span><b dir="ltr">' + eh(i.transaction_id) + '</b>' + (i.type === 'fee' ? ' · ' + (i.fee_kind === 'round' ? 'ذهاب وعودة' : 'ذهاب فقط') : '') + '</span></div>' +
          '<div style="text-align:end"><b>' + money(i.amount) + '</b><br><span>' + (i.confirmed ? '✓' : '○') + ' <button type="button" class="cp-a cp-sm" data-act="note" data-tx="' + eh(i.transaction_id) + '"><i class="fa-solid fa-flag"></i> ملاحظة</button></span></div></div>').join('') + '</div>' +
        (pend.length ? '<button type="button" class="cp-big" data-act="ask" data-kind="' + k + '" data-n="' + pend.length + '" data-amt="' + ptot + '">' + KIND[k].btn + ' · ' + money(ptot) + '</button>'
          : '<div class="cp-done">✓ اتأكد' + (last ? ' الساعة ' + eh(timeOf(last)) : '') + '</div>') + '</div>';
    };
    const body = ['pickup', 'delivery', 'fee'].map(sec).join('');
    return '<p style="font-size:12px;color:var(--mu);margin:0 2px 10px;line-height:1.7">راجع مشاويرك، ولو فيه حاجة غلط اضغط 🚩 واكتب ملاحظة للموظف. بعد ما تراجع دوس «تم التأكيد» عشان المشاوير تتحسب في عمولتك.</p>' +
      dayNav() + oldBox + (body || '<div class="cp-empty">' + (st.loaded ? 'مفيش مشاوير في اليوم ده' : 'جاري التحميل…') + '</div>');
  }

  /* ---------- التواصل (رسايل خاصة + اتصال) ---------- */
  const online = c => c.last_seen_at && (Date.now() - new Date(c.last_seen_at).getTime()) < 3 * 60 * 1000;
  function viewChat() {
    const b = $('cp-body'); if (!b) return;
    if (st.chat) return convView();
    const rows = st.contacts.map(c => {
      const nm = c.full_name || 'موظف';
      return '<div class="cp-card"><div class="cp-ct" data-act="chat-open" data-uid="' + eh(c.id) + '"><div class="cp-av">' + eh(nm.trim().charAt(0).toUpperCase()) + '<i class="' + (online(c) ? 'on' : '') + '"></i></div>' +
        '<div class="m"><b>' + eh(nm) + (c.is_manager ? ' <span class="cp-tag ok">المدير</span>' : '') + '</b><small>' + eh(c.last_body ? ((c.last_sender === st.me.user_id ? 'أنت: ' : '') + c.last_body) : (c.job_title || 'موظف')) + '</small>' +
        '<small>' + (online(c) ? '🟢 متصل الآن' : (c.last_seen_at ? 'آخر ظهور ' + eh(timeOf(c.last_seen_at)) : '')) + '</small></div>' +
        (Number(c.unread) ? '<span class="cp-ub">' + num(c.unread) + '</span>' : '') + '</div>' +
        (c.phone ? '<div class="cp-info">' + callBtns(c.phone, 'اتصال') + '</div>' : '') + '</div>';
    }).join('');
    b.innerHTML = '<p style="font-size:12px;color:var(--mu);margin:0 2px 10px">اتواصل مع الإدارة والموظفين بالرسايل أو الاتصال أو الواتساب:</p>' + (rows || '<div class="cp-empty">' + (st.loaded ? 'مفيش جهات اتصال' : 'جاري التحميل…') + '</div>');
  }
  function convView() {
    const b = $('cp-body'), c = st.chat; if (!b) return;
    b.innerHTML = '<div class="cp-chat"><div class="cp-chead"><button type="button" class="cp-btn cp-sm" data-act="chat-back">رجوع</button><b>' + eh(c.name) + '</b>' + (c.phone ? callBtns(c.phone, 'اتصال') : '') + '</div>' +
      '<div class="cp-msgs" id="cp-msgs"></div>' + (c.tx ? '<div class="cp-sub" style="margin-top:6px">بخصوص معاملة <b>' + eh(c.tx) + '</b> <button type="button" class="cp-a cp-sm" data-act="chat-notx">شيل</button></div>' : '') +
      '<div class="cp-comp"><textarea id="cp-msg" class="cp-field" rows="1" placeholder="اكتب رسالة…">' + eh(st.draft) + '</textarea><button type="button" class="cp-btn cp-go" data-act="chat-send">إرسال</button></div></div>';
    paintMsgs(true);
    const t = $('cp-msg'); if (t) { t.addEventListener('input', () => { st.draft = t.value; t.style.height = 'auto'; t.style.height = Math.min(110, t.scrollHeight) + 'px'; }); }
  }
  function paintMsgs(force) {
    const m = $('cp-msgs'); if (!m) return;
    const near = force || (m.scrollHeight - m.scrollTop - m.clientHeight < 80);
    m.innerHTML = st.msgs.length ? st.msgs.map(x => '<div class="cp-m ' + (x.mine ? 'me' : 'th') + '">' + (x.tx_id ? '<span class="tx">' + eh(x.tx_id) + '</span><br>' : '') + eh(x.body) + '<small>' + eh(timeOf(x.created_at)) + '</small></div>').join('') : '<div class="cp-empty">ابدأ المحادثة…</div>';
    if (near) m.scrollTop = m.scrollHeight;
  }
  async function openChat(uid, tx) {
    const c = st.contacts.find(x => x.id === uid); if (!c) return;
    try {
      let ch = c.channel_id;
      if (!ch) { const r = await sbClient.rpc('courier_dm', { p_other: uid }); if (r.error) throw r.error; ch = r.data; c.channel_id = ch; }
      st.chat = { uid: uid, name: c.full_name || 'موظف', ch: ch, phone: c.phone, tx: tx || null }; st.msgs = []; st.tab = 'chat'; renderNav(); convView();
      await pollMsgs(true);
    } catch (e) { toast(errMsg(e), true); }
  }
  async function pollMsgs(first) {
    const c = st.chat; if (!c) return;
    try {
      const last = st.msgs.length ? st.msgs[st.msgs.length - 1].created_at : null;
      const r = await sbClient.rpc('courier_chat_messages', { p_channel: c.ch, p_after: first ? null : last });
      if (r.error) throw r.error; setOffline(false);
      if (!st.chat || st.chat.ch !== c.ch) return;
      const have = new Set(st.msgs.map(x => x.id)), add = (r.data || []).filter(x => !have.has(x.id));
      if (first) { st.msgs = r.data || []; paintMsgs(true); }
      else if (add.length) { st.msgs = st.msgs.filter(x => !String(x.id).startsWith('tmp')).concat(add); paintMsgs(false); }
      if ((first || add.some(x => !x.mine))) { sbClient.rpc('courier_chat_read', { p_channel: c.ch }); const k = st.contacts.find(x => x.channel_id === c.ch); if (k) k.unread = 0; renderNav(); }
    } catch (e) { setOffline(true); }
  }
  async function sendMsg() {
    const c = st.chat, t = $('cp-msg'); if (!c || !t) return;
    const body = t.value.trim(); if (!body || st.busy) return;
    st.busy = true; const tmp = { id: 'tmp' + Date.now(), body: body, created_at: new Date().toISOString(), mine: true, tx_id: c.tx };
    st.msgs.push(tmp); paintMsgs(true); t.value = ''; st.draft = ''; t.style.height = 'auto';
    try {
      const r = await sbClient.rpc('courier_chat_send', { p_channel: c.ch, p_body: body, p_tx: c.tx }); if (r.error) throw r.error;
      c.tx = null; await pollMsgs(true); loadContacts(true);
    } catch (e) { st.msgs = st.msgs.filter(x => x !== tmp); paintMsgs(false); t.value = body; st.draft = body; toast(errMsg(e), true); }
    st.busy = false;
  }

  /* ---------- تحميل البيانات (من غير رمشة: بنعيد الرسم بس لو البيانات اتغيّرت) ---------- */
  function setOffline(v) { st.offline = v; const e = $('cp-off'); if (e) e.classList.toggle('on', !!v); }
  async function loadItems(silent) {
    try {
      const t = today(), r = await sbClient.rpc('courier_items', { p_from: addDays(t, -62), p_to: t });
      if (r.error) throw r.error; setOffline(false);
      const data = Array.isArray(r.data) ? r.data : [], sig = JSON.stringify(data);
      st.loaded = true;
      if (sig !== st.sig) { st.sig = sig; st.items = data; renderNav(); if (st.tab !== 'chat') renderTab(false); }
    } catch (e) { setOffline(true); if (!silent) toast(errMsg(e), true); }
  }
  async function loadContacts(silent) {
    try {
      const r = await sbClient.rpc('courier_contacts'); if (r.error) throw r.error; setOffline(false);
      const data = Array.isArray(r.data) ? r.data : [], sig = JSON.stringify(data);
      if (sig !== st.csig) {
        const u0 = unreadTotal(); st.csig = sig; st.contacts = data; const u1 = unreadTotal();
        renderNav(); if (st.tab === 'chat' && !st.chat) viewChat();
        if (u1 > u0 && st.loaded && !(st.chat)) toast('وصلتك رسالة جديدة 💬');
      }
    } catch (e) { if (!silent) toast(errMsg(e), true); }
  }
  function tick() {
    st.tick++; tickClock();
    if (document.hidden || !st.me) return;
    if (st.chat && st.tick % 4 === 0) pollMsgs(false);
    if (st.tick % 20 === 0) loadItems(true);
    if (st.tick % 15 === 0) loadContacts(true);
    if (st.tick % 60 === 0) sbClient.rpc('touch_last_seen');
  }

  /* ---------- مودالات ---------- */
  function modal(html) { const r = $('cp-modal-root'); if (!r) return; r.innerHTML = '<div class="cp-modal" data-act="mclose"><div class="cp-box">' + html + '</div></div>'; const f = r.querySelector('textarea,input'); if (f) setTimeout(() => f.focus(), 60); }
  const closeModal = () => { const r = $('cp-modal-root'); if (r) r.innerHTML = ''; };
  const byTx = tx => st.items.find(o => String(o.transaction_id) === String(tx));
  const NK = [['note', '🛵 ملاحظة'], ['problem', '🚩 مشكلة في المعاملة'], ['missing_fee', '⚠ المشوار برسوم توصيل ومش متسجّل لي رسوم']];

  async function askNote(tx) {
    const o = byTx(tx); st.noteKind = 'note';
    modal('<h3>ملاحظة للموظف</h3><p>على معاملة <b>' + eh(o ? o.client_name : '') + '</b> (' + eh(tx) + '). بتظهر كتعليق على المعاملة وبيوصل إشعار للموظف المسؤول وللمدير.</p>' +
      '<div class="cp-kinds" id="cp-kinds">' + NK.map(k => '<button type="button" data-act="nkind" data-k="' + k[0] + '" class="' + (k[0] === 'note' ? 'on' : '') + '">' + k[1] + '</button>').join('') + '</div>' +
      '<textarea id="cp-nbody" class="cp-field" rows="3" maxlength="500" placeholder="اكتب التفاصيل…"></textarea>' +
      '<div class="cp-btns"><button type="button" class="cp-btn cp-go" data-act="nsend" data-tx="' + eh(tx) + '">إرسال</button><button type="button" class="cp-btn" data-act="mclose-btn">إلغاء</button></div><div class="cp-old-n" id="cp-oldn"></div>');
    try { const r = await sbClient.rpc('courier_tx_notes', { p_tx: tx }); const n = (r.data || []); const e = $('cp-oldn');
      if (e) e.innerHTML = n.length ? '<b>ملاحظاتك السابقة:</b>' + n.map(x => '<div style="margin-top:4px">' + eh(x.body) + ' <span>(' + eh(timeOf(x.at)) + ')</span></div>').join('') : ''; } catch (e) { /* */ }
  }
  async function sendNote(tx, btn) {
    if (st.busy) return; const body = ($('cp-nbody') || {}).value || '';
    if (st.noteKind !== 'missing_fee' && !body.trim()) { toast('اكتب الملاحظة الأول', true); return; }
    st.busy = true; if (btn) btn.disabled = true;
    try { const r = await sbClient.rpc('courier_add_note', { p_tx: tx, p_kind: st.noteKind, p_body: body }); if (r.error) throw r.error; closeModal(); toast('اتبعتت للموظف ✓'); st.sig = ''; loadItems(true); }
    catch (e) { toast(errMsg(e), true); if (btn) btn.disabled = false; }
    st.busy = false;
  }
  function askConfirm(kind, n, amt) {
    modal('<h3>تأكيد ' + KIND[kind].sec + ' — ' + eh(dayLabel(st.day)) + '</h3><p>هتأكد <b>' + num(n) + '</b> مشوار بإجمالي <b>' + money(amt) + '</b> وهيتحسبوا في عمولتك. متأكد إنك راجعتهم؟</p>' +
      '<div class="cp-btns"><button type="button" class="cp-btn cp-go" data-act="do-confirm" data-kind="' + kind + '">أيوه، تم التأكيد</button><button type="button" class="cp-btn" data-act="mclose-btn">رجوع</button></div>');
  }
  async function doConfirm(kind, btn) {
    if (st.busy) return; st.busy = true; if (btn) btn.disabled = true;
    try { const r = await sbClient.rpc('courier_confirm_day', { p_kind: kind, p_day: st.day }); if (r.error) throw r.error;
      closeModal(); toast('اتأكد ' + num(r.data && r.data.count) + ' مشوار ✓'); st.sig = ''; await loadItems(true); }
    catch (e) { toast(errMsg(e), true); if (btn) btn.disabled = false; }
    st.busy = false;
  }

  /* ---------- الأحداث ---------- */
  function onKey(e) {
    if (e.target && e.target.id === 'cp-msg' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
  }
  function onClick(e) {
    const el = e.target.closest('[data-act],[data-tab],[data-per],[data-type]'); if (!el) return;
    if (el.dataset.tab) return setTab(el.dataset.tab);
    if (el.dataset.per) { st.period = el.dataset.per; return renderTab(false); }
    if (el.dataset.type) { st.type = el.dataset.type; return renderTab(false); }
    const a = el.dataset.act, tx = el.dataset.tx;
    switch (a) {
      case 'mclose': if (e.target === el) closeModal(); return;
      case 'mclose-btn': return closeModal();
      case 'logout': return window.handleLogout && window.handleLogout();
      case 'theme': return toggleTheme();
      case 'dprev': st.day = addDays(st.day, -1); return renderTab(false);
      case 'dnext': if (st.day < today()) { st.day = addDays(st.day, 1); renderTab(false); } return;
      case 'dset': st.day = el.dataset.day; return renderTab(true);
      case 'note': return askNote(tx);
      case 'nkind': st.noteKind = el.dataset.k; document.querySelectorAll('#cp-kinds button').forEach(b => b.classList.toggle('on', b === el)); return;
      case 'nsend': return sendNote(tx, el);
      case 'ask': return askConfirm(el.dataset.kind, el.dataset.n, el.dataset.amt);
      case 'do-confirm': return doConfirm(el.dataset.kind, el);
      case 'chat-open': return openChat(el.dataset.uid, null);
      case 'chat-emp': st.tab = 'chat'; st.chat = null; renderNav(); return loadContacts(true).then(() => openChat(el.dataset.uid, tx));
      case 'chat-back': st.chat = null; renderTab(true); return;
      case 'chat-send': return sendMsg();
      case 'chat-notx': if (st.chat) { st.chat.tx = null; const t = $('cp-msg'); st.draft = t ? t.value : st.draft; convView(); } return;
    }
  }

  async function showCourier() {
    initTheme(); st.day = today();
    overlay('<div class="cp-empty" style="margin:auto">جاري التحميل…</div>');
    try { const r = await sbClient.rpc('courier_me'); if (r.error) throw r.error; st.me = r.data; }
    catch (e) { overlay('<header class="cp-head"><div class="cp-who"><b>بوابة المندوب</b></div>' + logoutBtn + '</header><div class="cp-empty" style="margin:auto">' + eh(errMsg(e)) + '</div>'); return; }
    shell(); sbClient.rpc('touch_last_seen');
    await Promise.all([loadItems(false), loadContacts(true)]);
    clearInterval(st.timer); st.timer = setInterval(tick, 1000);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && st.me && $('courier-app')) { loadItems(true); loadContacts(true); if (st.chat) pollMsgs(false); } });
  window.addEventListener('online', () => { if (st.me) { loadItems(true); loadContacts(true); } });

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
    clearInterval(st.timer); st.me = null; st.sig = ''; st.csig = ''; st.items = []; st.contacts = []; st.chat = null; st.msgs = []; st.loaded = false; st.tab = 'home';
    document.body.classList.remove('is-courier-mode', 'is-partner-mode');
    const o = $('courier-app'); if (o) o.remove();
    return _sl.apply(this, arguments);
  };

  /* ---------- المدير: ربط حساب بمندوب + متابعة ---------- */
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
    const [r, ov] = await Promise.all([sbClient.rpc('list_courier_accounts'), sbClient.rpc('courier_overview').then(x => x, () => ({ data: [] }))]);
    if (r.error) { mgrShell('<h3>حسابات المناديب</h3><p>مش قادر أحمّل القايمة. اتأكد إنك شغّلت sql/courier-portal.sql.</p><div class="cp-btns"><button type="button" class="cp-btn" id="cp-mgr-x">إغلاق</button></div>'); $('cp-mgr-x').onclick = () => $('cp-mgr').remove(); return; }
    const info = {}; ((ov && ov.data) || []).forEach(x => { info[x.id] = x; });
    const rows = (r.data || []).filter(c => c.active).map(c => c.user_id
      ? '<div class="cp-mgr-row"><span class="nm">' + eh(c.name) + '</span><span class="em">' + eh(c.email || 'مربوط') + '</span><button type="button" class="cp-btn" style="background:#be123c;color:#fff" data-unlink="' + eh(c.user_id) + '">إيقاف</button>' +
        (info[c.id] ? '<span class="st">مشاوير لسه ما اتأكدتش (آخر 30 يوم): <b>' + num(info[c.id].pending_trips) + '</b> · ملاحظات آخر 7 أيام: <b>' + num(info[c.id].notes_7d) + '</b></span>' : '') + '</div>'
      : '<form class="cp-mgr-row" data-link="' + eh(c.id) + '"><span class="nm">' + eh(c.name) + '</span><input class="cp-field" type="email" required placeholder="إيميل حساب المندوب"><button class="cp-btn cp-go">ربط</button></form>').join('');
    const m = mgrShell('<h3>حسابات المناديب</h3><p>1) اعمل حساب للمندوب من Supabase (Authentication ← Add user). 2) اكتب إيميله قدام اسمه هنا واضغط «ربط». المندوب هيدخل ويشوف شغله هو بس: مشاويره وعمولته، ويتواصل معاكم.</p>' + (rows || '<p>مفيش مناديب نشطين.</p>') +
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
