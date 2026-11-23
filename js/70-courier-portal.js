/* =====================================================================
   بوابة المندوب (js/70-courier-portal.js) — النسخة 6 (Courier Portal v6: Today-first navigation)
   - 5 تابات للمندوب: حسابي / مشاويري / الترتيب / المراجعة / التواصل + ملفي الشخصي، شهور، ثيم، ساعة، أوفلاين.
   - A) تجميع ريكوستات نفس العميل (client_name بعد التطبيع + day + type) في كارت واحد („٤ ريكوستات“)
        في مشاويري والمراجعة بدون تغيير أي حساب فلوس، والضغط على العميل يفتح مودال „تفاصيل العميل“
        من courier_tx_detail(p_tx) بدون أي أسعار عميل أو مدفوعات + علامة „<i class="fa-regular fa-clock"></i> الموظف لسه ما قفلش المعاملة“.
   - B) تأكيد فردي لكل ريكوست لوحده („أكّد ده بس“) عبر courier_confirm_one(p_type, p_ref)
        + علامة „ أبلغت الموظف (الساعة ...)“ بعد إرسال ملاحظة، وتوضيح أن „✅ تم التسليم“ لا تؤكد المشوار وحدها.
   - C) علامات القراءة في شات المندوب: „✓ اتبعتت“ / „✓✓ اتقرت“ تحت رسائل المندوب وتتحدث مع الـ polling بدون رمشة.
   - للمدير والموظفين داخل السيستم:
        • إرجاع تابة وزرار „حسابات المناديب“ في القائمة الجانبية وأعلى شاشة المناديب.
        • استبدال زر الذكاء الاصطناعي العايم (#ai-fab) بزر عائم سريع لـ „الشات الداخلي“ مع عداد الرسائل غير المقروءة.
        • إدراج تابة „أداء الموظفين“ داخل قسم „أداء وتقارير“ بدلاً من ظهورها منفردة أعلى القائمة الجانبية.
   ===================================================================== */
(function () {
  if (window.__courierPortal) return; window.__courierPortal = true;
  const $ = id => document.getElementById(id);
  const eh = s => (typeof escapeHtml === 'function' ? escapeHtml(s == null ? '' : String(s)) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const TZ = 'Africa/Cairo';
  const MGR_EMAILS = ['mahmoud.aboshama@tasahel.com.eg', 'mahmoud.aboshama.contact@gmail.com'];

  const st = {
    me: null, prevTab: 'home', avUrl: '', avPendingBlob: null, avPendingUrl: '', avRemoved: false, items: [], sig: '', tab: 'today', period: 'today', month: '', lbPeriod: 'month',
    day: null, type: 'all', statusFilter: 'all', q: '', wf: 'all', calOpen: false, calMonth: '',
    leaderboard: [], lbsig: '', lbLoaded: false,
    notesMap: {}, nsig: '',
    contacts: [], csig: '', chat: null, msgs: [], msig: '', draft: '',
    theme: 'dark', timer: null, tick: 0, pendingReminderCheck: 0,
    busy: false, offline: false, unreadSeen: 0, loaded: false, itemsLoading: null, refreshing: false, lastSync: null,
    guides: {},
    routeTxIds: [], activeTx: '', pins: {}, bagHanded: {}, myPos: null,
    ledgerOpen: false, ledgerLoading: false, ledgerFrom: '', ledgerTo: '', ledgerRows: [],
    globalSearchOpen: false, globalQ: '', mapMode: false, onBreak: false, shiftFilter: 'all',
    batchScan: false, urgentPings: [], waitingMap: {}, undoData: null, geofenceNotified: {}, nearOfficeNotified: false
  };

  /* ---------- تطبيع الأسماء العربية (مثل normName / norm_ar) ---------- */
  function normAr(s) {
    if (typeof normName === 'function') {
      try { return normName(s); } catch (e) { /* */ }
    }
    return String(s == null ? '' : s)
      .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/[\s\p{P}]+/gu, ' ')
      .trim()
      .toLowerCase();
  }

  function isManagerUser() {
    if (window.__role === 'manager') return true;
    const u = (typeof currentUser !== 'undefined' && currentUser) ? currentUser : null;
    const em = String((u && u.email) || '').toLowerCase().trim();
    return MGR_EMAILS.includes(em);
  }

  /* ---------- تواريخ (بتوقيت القاهرة) ---------- */
  const today = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
  const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const weekStart = s => addDays(s, -((new Date(s + 'T00:00:00Z').getUTCDay() + 1) % 7));
  const monthStart = s => s.slice(0, 8) + '01';
  const monthEnd = ym => {
    const p = String(ym || '').split('-').map(Number);
    if (p.length < 2 || !p[0] || !p[1]) return today();
    const d = new Date(Date.UTC(p[0], p[1], 0));
    return d.toISOString().slice(0, 10);
  };
  const monthLabel = ym => {
    try {
      return new Date(ym + '-15T12:00:00Z').toLocaleDateString('ar-EG', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    } catch (e) { return ym; }
  };
  const dayLabel = s => { try { return new Date(s + 'T12:00:00Z').toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }); } catch (e) { return s; } };
  const timeOf = iso => { try { if (!iso) return ''; return new Date(iso).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ }); } catch (e) { return ''; } };
  const rangeOf = p => {
    const t = today();
    if (p === 'today') return [t, t];
    if (p === 'week') return [weekStart(t), t];
    if (p === 'month') {
      const m = st.month || t.slice(0, 7);
      return [m + '-01', m === t.slice(0, 7) ? t : monthEnd(m)];
    }
    return [monthStart(t), t];
  };
  const money = n => Number(n || 0).toLocaleString('en-US') + ' ج';
  const num = n => Number(n || 0).toLocaleString('en-US');

  /* أيقونات SVG (نفس أيقونات التصميم) */
  const IC = {
    home: '<path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    ring: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="9"/>',
    route: '<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.5"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    chat: '<path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l1.9-5.4A8.4 8.4 0 1 1 21 11.5z"/>',
    wallet: '<path d="M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l2-3h12M16 14h2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/>',
    power: '<path d="M12 2v10M18.4 6.6a9 9 0 1 1-12.8 0"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    qr: '<path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM20 14v7M14 20h3"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    chev: '<path d="M6 9l6 6 6-6"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    papers: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 15l2 2 4-4"/>',
    battery: '<rect x="3" y="8" width="16" height="9" rx="2"/><path d="M21 11v3M7 12.5h5"/>',
    cash: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    pin: '<path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
    nav: '<path d="M3 11l18-8-8 18-2-8-8-2z"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    back: '<path d="M15 6l-6 6 6 6"/>',
    fwd: '<path d="M9 6l6 6-6 6"/>',
    truck: '<path d="M2 6h12v10H2zM14 9h4l4 3.5V16h-8z"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
    box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5zM3.3 7.5l8.7 5 8.7-5M12 22V12.5"/>',
    send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>',
    trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3"/>',
    cloud: '<path d="M6.5 19a4.5 4.5 0 0 1-.4-9A6 6 0 0 1 17.7 8 4.5 4.5 0 0 1 17.5 19z"/>',
    warn: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    link: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
    id: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M14 10h4M14 14h3M6 16c.5-1.5 1.5-2 3-2s2.5.5 3 2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
    swap: '<path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
    pen: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'
  };
  const FA2IC = { 'phone': 'phone', 'whatsapp': 'chat', 'location-arrow': 'nav', 'location-dot': 'pin', 'trophy': 'trophy', 'id-card': 'id', 'comment': 'chat', 'comments': 'chat', 'power-off': 'power', 'motorcycle': 'route', 'route': 'route', 'magnifying-glass': 'search', 'link': 'link', 'flag': 'flag', 'circle-info': 'info', 'box-archive': 'box', 'truck-fast': 'truck', 'circle-check': 'check', 'clipboard-check': 'check', 'check': 'check', 'house': 'ring', 'sun': 'sun', 'moon': 'moon', 'rotate': 'refresh', 'map': 'nav', 'wallet': 'wallet', 'plus': 'plus', 'xmark': 'x', 'microphone': 'mic', 'qrcode': 'qr', 'pause': 'pause', 'pen': 'pen', 'clock': 'clock', 'calendar': 'cal', 'right-left': 'swap' };
  /* يحوّل أي أيقونة FontAwesome متبقية لأيقونة SVG من نفس طقم التصميم */
  function swapFa(root) {
    if (!root) return;
    root.querySelectorAll('i[class*="fa-"]').forEach(el => {
      const m = (el.className.match(/fa-([a-z0-9-]+)/g) || []).map(x => x.slice(3)).filter(x => x !== 'solid' && x !== 'brands' && x !== 'regular');
      const key = m.map(x => FA2IC[x]).find(Boolean); if (!key) return;
      const w = document.createElement('span'); w.innerHTML = ic(key, 18);
      const svg = w.firstChild; if (el.getAttribute('style')) svg.setAttribute('style', (svg.getAttribute('style') || '') + ';' + el.getAttribute('style'));
      el.replaceWith(svg);
    });
  }
  window.__cpIc = (n, sz) => ic(n, sz);
  const ic = (n, sz) => '<svg class="cpn-i" viewBox="0 0 24 24" aria-hidden="true"' + (sz ? ' style="width:' + sz + 'px;height:' + sz + 'px"' : '') + '>' + (IC[n] || '') + '</svg>';

  /* ---------- حفظ واسترجاع حالة بطاقات التعريف ---------- */
  function initGuides() {
    try { st.guides = JSON.parse(localStorage.getItem('ts_cp_guides') || '{}') || {}; } catch (e) { st.guides = {}; }
  }

  /* ---------- حفظ واسترجاع خط السير الذكي واللوكيشن والشنطة ---------- */
  function initSmartFeatures() {
    try { st.routeTxIds = JSON.parse(localStorage.getItem('ts_cp_route_txs') || '[]') || []; } catch (e) { st.routeTxIds = []; }
    try { st.activeTx = localStorage.getItem('ts_cp_active_tx') || ''; } catch (e) { st.activeTx = ''; }
    try { st.pins = JSON.parse(localStorage.getItem('ts_cp_pins') || '{}') || {}; } catch (e) { st.pins = {}; }
    try { st.bagHanded = JSON.parse(localStorage.getItem('ts_cp_bag_' + today()) || '{}') || {}; } catch (e) { st.bagHanded = {}; }
    if (!st.ledgerFrom) st.ledgerFrom = addDays(today(), -30);
    if (!st.ledgerTo) st.ledgerTo = today();
  }
  function saveRouteState() {
    try { localStorage.setItem('ts_cp_route_txs', JSON.stringify(st.routeTxIds)); } catch (e) {}
    try { localStorage.setItem('ts_cp_active_tx', st.activeTx || ''); } catch (e) {}
  }
  function savePinsState() {
    try { localStorage.setItem('ts_cp_pins', JSON.stringify(st.pins)); } catch (e) {}
  }
  function saveBagState() {
    try { localStorage.setItem('ts_cp_bag_' + today(), JSON.stringify(st.bagHanded)); } catch (e) {}
  }

  /* قاموس إحداثيات مناطق القاهرة الكبرى والجيزة للترتيب التلقائي الذكي (الأقرب فالأقرب) بصفر تكلفة */
  const CAIRO_ZONES = [
    ['ترعه عبد العال', 'فيصل', 30.0012, 31.1765],
    ['اولاد الرفاعي', 'فيصل', 30.0015, 31.1770],
    ['العشرين', 'فيصل', 30.0045, 31.1820],
    ['الطالبيه', 'فيصل/الهرم', 29.9960, 31.1860],
    ['المريوطيه', 'الهرم', 29.9880, 31.1520],
    ['حدائق الاهرام', 'الهرم', 29.9720, 31.1120],
    ['فيصل', 'فيصل', 30.0020, 31.1850],
    ['الهرم', 'الهرم', 29.9940, 31.1680],
    ['العمرانيه', 'الجيزة', 30.0050, 31.2020],
    ['المنيب', 'الجيزة', 29.9880, 31.2130],
    ['الجيزه', 'الجيزة', 30.0131, 31.2089],
    ['الدقي', 'الدقي', 30.0385, 31.2122],
    ['المهندسين', 'المهندسين', 30.0511, 31.2001],
    ['العجوزه', 'العجوزة', 30.0560, 31.2140],
    ['امبابه', 'إمبابة', 30.0770, 31.2070],
    ['الوراق', 'الوراق', 30.0980, 31.2160],
    ['بولاق', 'بولاق', 30.0360, 31.1920],
    ['الزمالك', 'الزمالك', 30.0609, 31.2197],
    ['وسط البلد', 'وسط البلد', 30.0444, 31.2357],
    ['التحرير', 'وسط البلد', 30.0444, 31.2357],
    ['رمسيس', 'رمسيس', 30.0618, 31.2466],
    ['شبرا', 'شبرا', 30.0790, 31.2450],
    ['العباسيه', 'العباسية', 30.0720, 31.2830],
    ['مدينه نصر', 'مدينة نصر', 30.0561, 31.3301],
    ['مكرم عبيد', 'مدينة نصر', 30.0620, 31.3450],
    ['عباس العقاد', 'مدينة نصر', 30.0630, 31.3360],
    ['مصر الجديده', 'مصر الجديدة', 30.0909, 31.3228],
    ['النزهه', 'مصر الجديدة', 30.1120, 31.3450],
    ['شيراتون', 'مصر الجديدة', 30.1050, 31.3680],
    ['عين شمس', 'عين شمس', 30.1310, 31.3190],
    ['المطريه', 'المطرية', 30.1250, 31.3100],
    ['الزيتون', 'الزيتون', 30.1060, 31.3010],
    ['حدائق القبه', 'حدائق القبة', 30.0880, 31.2820],
    ['المقطم', 'المقطم', 30.0120, 31.3020],
    ['دار السلام', 'دار السلام', 29.9820, 31.2420],
    ['المعادي', 'المعادي', 29.9602, 31.2569],
    ['زهراء المعادي', 'المعادي', 29.9550, 31.3000],
    ['المعصره', 'حلوان/المعصرة', 29.9060, 31.2820],
    ['حلوان', 'حلوان', 29.8414, 31.3008],
    ['التجمع', 'التجمع', 30.0074, 31.4913],
    ['القاهره الجديده', 'القاهرة الجديدة', 30.0150, 31.4700],
    ['الرحاب', 'الرحاب', 30.0580, 31.4910],
    ['مدينتي', 'مدينتي', 30.0830, 31.6300],
    ['الشروق', 'الشروق', 30.1440, 31.6080],
    ['العبور', 'العبور', 30.2280, 31.4790],
    ['اكتوبر', '6 أكتوبر', 29.9723, 30.9401],
    ['الشيخ زايد', 'الشيخ زايد', 30.0440, 30.9760],
    ['الحوامديه', 'الحوامدية', 29.8970, 31.2580],
    ['البدرشين', 'البدرشين', 29.8450, 31.2700]
  ];

  function detectZoneAndCoords(it) {
    if (!it) return { zone: 'غير محدد', lat: 30.0200, lng: 31.2100, exact: false };
    const tx = String(it.transaction_id || '');
    const saved = st.pins[tx];
    if (saved && saved.lat && saved.lng) {
      return { zone: saved.zone || 'لوكيشن مثبت ', lat: Number(saved.lat), lng: Number(saved.lng), exact: true };
    }
    if (it.client_lat && it.client_lng) {
      return { zone: 'لوكيشن مثبت ', lat: Number(it.client_lat), lng: Number(it.client_lng), exact: true };
    }
    const addr = normAr(it.address || '');
    for (let i = 0; i < CAIRO_ZONES.length; i++) {
      if (addr.includes(CAIRO_ZONES[i][0])) {
        return { zone: CAIRO_ZONES[i][1], lat: CAIRO_ZONES[i][2], lng: CAIRO_ZONES[i][3], exact: false };
      }
    }
    return { zone: addr ? 'القاهرة/الجيزة' : 'بدون عنوان', lat: 30.0250, lng: 31.2150, exact: false };
  }

  function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function routeIndexOf(tx) {
    return st.routeTxIds.indexOf(String(tx));
  }
  function sortRouteSelectionNearestFirst(startLat, startLng) {
    const validTxs = st.routeTxIds.filter(tx => byTx(tx));
    if (validTxs.length < 2) return validTxs;
    const pool = validTxs.map(tx => {
      const item = byTx(tx);
      const z = detectZoneAndCoords(item);
      return { tx: tx, item: item, lat: z.lat, lng: z.lng, zone: z.zone };
    });
    const sorted = [];
    let curLat = startLat || 30.0012, curLng = startLng || 31.1765;
    while (pool.length > 0) {
      let bestIdx = 0, bestDist = Infinity;
      for (let i = 0; i < pool.length; i++) {
        const d = haversineKm(curLat, curLng, pool[i].lat, pool[i].lng);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
      const picked = pool.splice(bestIdx, 1)[0];
      sorted.push(picked);
      curLat = picked.lat;
      curLng = picked.lng;
    }
    st.routeTxIds = sorted.map(x => x.tx);
    const tripIds = sorted.map(s => s.item && s.item.type !== 'fee' && s.item.id ? Number(s.item.id) : null).filter(Boolean);
    if (tripIds.length > 1) {
      sbClient.rpc('courier_ops_reorder', { p_trip_ids: tripIds }).catch(() => null);
    }
    return st.routeTxIds;
  }

  function toggleRouteTx(tx) {
    tx = String(tx || '');
    if (!tx) return;
    const idx = st.routeTxIds.indexOf(tx);
    if (idx === -1) {
      st.routeTxIds.push(tx);
      const pos = st.myPos || { lat: 30.0012, lng: 31.1765 };
      sortRouteSelectionNearestFirst(pos.lat, pos.lng);
      toast('اتضاف واترتب في خط سيرك تلقائياً ✓');
    } else {
      st.routeTxIds.splice(idx, 1);
      const pos = st.myPos || { lat: 30.0012, lng: 31.1765 };
      sortRouteSelectionNearestFirst(pos.lat, pos.lng);
      toast('اتشال من خط السير');
    }
    saveRouteState();
    renderTab(false);
  }
  /* «ابدأ اليوم»: كل شغل النهارده غير المؤكد يدخل خط السير مرة واحدة ومترتب الأقرب فالأقرب */
  function startDay() {
    const open = itemsOf(today()).filter(i => !i.confirmed && i.type !== 'fee').map(i => String(i.transaction_id));
    if (!open.length) { toast('مفيش شغل مفتوح النهارده'); return; }
    open.forEach(tx => { if (st.routeTxIds.indexOf(tx) === -1) st.routeTxIds.push(tx); });
    const pos = st.myPos || { lat: 30.0012, lng: 31.1765 };
    sortRouteSelectionNearestFirst(pos.lat, pos.lng);
    saveRouteState();
    toast('خط سير النهارده جاهز: ' + st.routeTxIds.length + ' محطة ✓');
    renderTab(false);
  }
  function clearRoute() {
    st.routeTxIds = [];
    st.activeTx = '';
    saveRouteState();
    toast('تم مسح خط السير');
    renderTab(false);
  }

  function refreshMyPosQuiet() {
    try {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        pos => {
          st.myPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          window.__cpLastPos = st.myPos;
          checkProximityAndOffice();
        },
        () => {},
        { enableHighAccuracy: false, timeout: 4000, maximumAge: 120000 }
      );
    } catch (e) {}
  }

  function checkProximityAndOffice() {
    if (!st.myPos || !window.CourierV12) return;
    const distOffice = window.CourierV12.haversineKm(st.myPos.lat, st.myPos.lng, window.CourierV12.OFFICE_POS.lat, window.CourierV12.OFFICE_POS.lng);
    if (distOffice <= 1.0 && !st.nearOfficeNotified && st.items.some(i => i.day === today() && i.confirmed)) {
      st.nearOfficeNotified = true;
      window.CourierV12.queueOrRun('courier_v12_dispatch_action', { p_event_type: 'near_office', p_tx: null, p_payload: { dist_km: Number(distOffice.toFixed(2)) } }).catch(() => null);
    }
    const pendingToday = st.items.filter(i => i.day === today() && !i.confirmed);
    for (const it of pendingToday) {
      const tx = String(it.transaction_id);
      if (st.geofenceNotified[tx]) continue;
      const pin = st.pins[tx];
      if (!pin || !pin.lat) continue;
      const dKm = window.CourierV12.haversineKm(st.myPos.lat, st.myPos.lng, pin.lat, pin.lng);
      if (dKm <= 0.15) {
        st.geofenceNotified[tx] = true;
        toast(' وصلت عند ' + (it.client_name || 'العميل') + ' — اضغط لفتح المعاملة');
        break;
      }
    }
  }

  function autoOptimizeRoute(openMapAfter) {
    const validTxs = st.routeTxIds.filter(tx => byTx(tx));
    if (!validTxs.length) {
      toast('اضغط «+ خط السير» على العملاء اللي نازلهم الأول', true);
      return;
    }
    const basePos = st.myPos || { lat: 30.0012, lng: 31.1765 };
    sortRouteSelectionNearestFirst(basePos.lat, basePos.lng);
    saveRouteState();
    renderTab(false);
    if (openMapAfter) {
      const itemsList = st.routeTxIds.map(tx => byTx(tx)).filter(Boolean);
      const url = buildMultiStopMapsUrl(itemsList, st.myPos || null);
      if (url) window.open(url, '_blank', 'noopener');
      refreshMyPosQuiet();
    } else {
      refreshMyPosQuiet();
      toast('تم ترتيب خط السير تلقائياً من الأقرب لمكانك ✓');
    }
  }

  function stopDestinationQuery(it) {
    if (!it) return '';
    const tx = String(it.transaction_id || '');
    const pin = st.pins[tx];
    if (pin && pin.lat && pin.lng) return pin.lat + ',' + pin.lng;
    if (it.client_lat && it.client_lng) return it.client_lat + ',' + it.client_lng;
    return String(it.address || '').trim();
  }

  function smartMapsUrl(it) {
    const q = stopDestinationQuery(it);
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q || (it && it.address) || '');
  }

  function buildMultiStopMapsUrl(itemsList, startPos) {
    const stops = (itemsList || []).map(stopDestinationQuery).filter(Boolean);
    if (!stops.length) return '';
    const dest = stops[stops.length - 1];
    const mid = stops.slice(0, -1);
    const originPart = (startPos && startPos.lat && startPos.lng)
      ? ('&origin=' + encodeURIComponent(startPos.lat + ',' + startPos.lng))
      : '';
    return 'https://www.google.com/maps/dir/?api=1' +
      originPart +
      '&destination=' + encodeURIComponent(dest) +
      (mid.length ? '&waypoints=' + encodeURIComponent(mid.slice(0, 9).join('|')) : '') +
      '&travelmode=driving';
  }

  /* حفظ اللوكيشن الفعلي للعميل من موبايل المندوب (GPS Pin) */
  async function commitSavedPin(tx, lat, lng) {
    const it = byTx(tx);
    const z = detectZoneAndCoords(it);
    st.pins[tx] = { lat: lat, lng: lng, zone: z.zone, at: new Date().toISOString() };
    savePinsState();
    if (it && it.id && it.type !== 'fee') {
      try {
        if (window.CourierV12) await window.CourierV12.queueOrRun('courier_save_pin', { p_trip_id: Number(it.id), p_lat: lat, p_lng: lng });
        else await sbClient.rpc('courier_save_pin', { p_trip_id: Number(it.id), p_lat: lat, p_lng: lng });
      } catch (e) {}
    }
    if (window.CourierV12) window.CourierV12.haptic(true);
    toast(' تم حفظ وتثبيت لوكيشن العميل بنجاح ✓');
    renderTab(false);
    if (window.TasahelGeo && window.TasahelGeo.reverseGeocode) {
      window.TasahelGeo.reverseGeocode(lat, lng).then(street => {
        if (street && st.pins[tx]) {
          st.pins[tx].zone = street;
          savePinsState();
          toast(' تم تحديد العنوان: ' + street);
          renderTab(false);
        }
      }).catch(() => null);
    }
  }
  function saveClientPin(tx) {
    tx = String(tx || '');
    const it = byTx(tx);
    const z = detectZoneAndCoords(it);
    if (!navigator.geolocation) {
      if (window.CourierV12) return window.CourierV12.openPinDropperModal(tx, it && it.client_name, z.lat, z.lng, (la, ln) => commitSavedPin(tx, la, ln));
      return toast('جهازك مش بيدعم GPS', true);
    }
    toast('جاري تحديد موقع العميل بـ GPS…');
    navigator.geolocation.getCurrentPosition(
      pos => commitSavedPin(tx, Number(pos.coords.latitude.toFixed(6)), Number(pos.coords.longitude.toFixed(6))),
      err => {
        if (err && err.code === 1) {
          toast('إذن الموقع مقفول من المتصفح — افتح القفل جنب الرابط واسمح بالموقع، أو اسحب الدبوس يدوياً', true);
          if (window.CourierV12) window.CourierV12.openPinDropperModal(tx, it && it.client_name, z.lat, z.lng, (la, ln) => commitSavedPin(tx, la, ln));
          return;
        }
        navigator.geolocation.getCurrentPosition(
          pos2 => commitSavedPin(tx, Number(pos2.coords.latitude.toFixed(6)), Number(pos2.coords.longitude.toFixed(6))),
          () => {
            toast('إشارة GPS ضعيفة — تقدر تسحب الدبوس على الخريطة وتحفظ الموقع يدوياً', true);
            if (window.CourierV12) window.CourierV12.openPinDropperModal(tx, it && it.client_name, z.lat, z.lng, (la, ln) => commitSavedPin(tx, la, ln));
          },
          { enableHighAccuracy: false, timeout: 6000, maximumAge: 60000 }
        );
      },
      { enableHighAccuracy: true, timeout: 5000 }
    );
  }

  /* زرار «في طريقي» المفعّل بالكامل */
  function startOnMyWay(tx) {
    tx = String(tx || '');
    const it = byTx(tx);
    if (!it) return;
    st.activeTx = tx;
    it.live_state = 'on_the_way';
    if (!st.routeTxIds.includes(tx)) st.routeTxIds.unshift(tx);
    saveRouteState();
    if (window.CourierV12) {
      window.CourierV12.haptic(true);
      window.CourierV12.queueOrRun('courier_v12_dispatch_action', { p_event_type: 'on_the_way', p_tx: tx, p_payload: { client: it.client_name || '' } }).catch(() => null);
    }
    if (it.id && it.type !== 'fee') {
      sbClient.rpc('courier_ops_update', { p_trip_id: Number(it.id), p_status: 'on_the_way', p_priority: null, p_route_order: null, p_note: null }).catch(() => null);
    }
    renderTab(false);
    toast('تم تفعيل «في طريقي» وتثبيت ' + (it.client_name || 'العميل') + ' في الأعلى ✓');
    modal(
      '<h3>في طريقك إلى ' + eh(it.client_name || 'العميل') + '</h3>' +
      '<p>المشوار اتثبت فوق واتحدّث على شاشة المكتب والعميل. تحب تفتح إيه دلوقتي؟</p>' +
      '<div class="cp-btns">' +
        '<a class="cp-btn cp-go" target="_blank" rel="noopener" href="' + eh(buildMultiStopMapsUrl([it], st.myPos || null)) + '"><i class="fa-solid fa-location-arrow"></i> فتح الخريطة</a>' +
        (it.phone ? '<button type="button" class="cp-btn" data-act="v12-wa-tpl" data-tx="' + eh(tx) + '"><i class="fa-brands fa-whatsapp"></i> إرسال رسالة للعميل</button>' : '') +
        '<button type="button" class="cp-btn" data-act="mclose-btn">تم</button>' +
      '</div>'
    );
  }

  /* لوحة خط السير المبسطة والواضحة جداً للمندوب (تترتب أوتوماتيك بمجرد الاختيار) */
  function renderSmartRoutePanel() {
    const picked = st.routeTxIds.map(tx => byTx(tx)).filter(it => it && !it.confirmed);
    const activeItems = picked.length ? picked : itemsOf(today()).filter(it => !it.confirmed);
    if (!activeItems.length) {
      return '<section class="ts7b-route-sheet" style="text-align:center;color:var(--mu);font-weight:700">لا توجد محطات في خط السير</section>';
    }
    const mapHtml = (window.CpV12 && typeof window.CpV12.renderEmbeddedMap === 'function')
      ? window.CpV12.renderEmbeddedMap(activeItems, st.myPos || null, detectZoneAndCoords)
      : '';
    /* قائمة محطات مختصرة بالترتيب — تفاصيل المحطة الحالية وأزرارها في الرئيسية بس */
    const rows = activeItems.map((it, idx) => {
      const z = detectZoneAndCoords(it);
      return '<button type="button" class="cp-stop-row' + (idx === 0 ? ' cur' : '') + '" data-act="detail" data-tx="' + eh(it.transaction_id) + '">' +
        '<b class="n">' + num(idx + 1) + '</b>' +
        '<span class="t"><strong>' + eh(it.client_name || 'عميل') + '</strong><small>' + eh(it.address || z.zone || '') + ' · ' + eh(kindLabel(it)) + '</small><small class="cp-stop-eta" data-eta-tx="' + eh(it.transaction_id) + '"></small></span>' +
      '</button>';
    }).join('');
    return '<section style="display:flex;flex-direction:column;gap:12px">' + mapHtml +
      '<div id="cp-geo-route-eta"></div>' +
      '<div class="cp-stop-list">' + rows + '</div>' +
    '</section>';
  }

  /* كارت «شنطتك آخر اليوم — أوراق مطلوب تسليمها للمكتب» */
  function renderOfficeBagCard() {
    const t = today();
    const bagItems = itemsOf(t).filter(it => (it.type === 'pickup' && it.confirmed) || (it.type === 'delivery' && !it.confirmed));
    if (!bagItems.length) return '';
    const remaining = bagItems.filter(it => !st.bagHanded[String(it.transaction_id)]);
    return '<section class="cp-card" style="border-color:rgba(56,189,248,.4);margin-top:12px">' +
      '<div class="cp-row">' +
        '<div>' +
          '<b><i class="fa-solid fa-briefcase"></i> شنطتك آخر اليوم — أوراق مطلوب تسليمها للمكتب</b>' +
          '<div class="cp-sub">عشان متنساش أصل ورقة في الشنطة: علّم على كل معاملة لما تسلّم ورقها للموظف في المكتب</div>' +
        '</div>' +
        '<span class="cp-tag ' + (remaining.length ? 'wt' : 'ok') + '">' + (remaining.length ? 'باقي ' + num(remaining.length) + ' معاملة' : '✓ سلّمت كله') + '</span>' +
      '</div>' +
      '<div class="cp-txlist">' +
        bagItems.map(it => {
          const handed = !!st.bagHanded[String(it.transaction_id)];
          const reason = it.type === 'pickup' ? 'استلمتها من العميل النهاردة' : 'تسليم مؤجل (الورق لسه معاك)';
          return '<div class="cp-txitem" style="opacity:' + (handed ? '.65' : '1') + '">' +
            '<div style="min-width:0;flex:1">' +
              '<b>' + eh(it.client_name || 'عميل') + '</b> <span dir="ltr" style="font-size:11px;color:var(--mu)">(' + eh(it.transaction_id) + ')</span>' +
              '<div style="font-size:11px;color:var(--mu)">' + reason + (it.employee ? ' · سلّمها لـ: <b>' + eh(it.employee) + '</b>' : '') + '</div>' +
            '</div>' +
            '<button type="button" class="cp-a cp-sm ' + (handed ? '' : 'pri') + '" data-act="bag-toggle" data-tx="' + eh(it.transaction_id) + '">' + (handed ? '✓ اتسلمت للمكتب' : 'تسليم للمكتب') + '</button>' +
          '</div>';
        }).join('') +
      '</div>' +
    '</section>';
  }

  /* ماسح الـ QR المدمج في هيدر المندوب */
  let qrStream = null;
  function stopQrCamera() {
    if (qrStream) {
      try { qrStream.getTracks().forEach(t => t.stop()); } catch (e) {}
      qrStream = null;
    }
  }
  function extractTxFromScan(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    try {
      if (/^https?:\/\//i.test(s) || s.indexOf('?') !== -1) {
        const u = new URL(s.startsWith('http') ? s : ('https://x.local/' + s.replace(/^\/+/, '')));
        const q = u.searchParams.get('token') || u.searchParams.get('tx') || u.searchParams.get('id') || u.searchParams.get('code') || '';
        if (q) return q.trim();
      }
    } catch (e) {}
    const mUrl = s.match(/[?&](?:token|tx|id|code)=([^&#\s]+)/i);
    if (mUrl && mUrl[1]) return decodeURIComponent(mUrl[1]).trim();
    if (/^https?:\/\//i.test(s)) return '';
    const mTx = s.match(/(TX-\d{4}-\d+|[A-Za-z0-9_-]{6,64})/);
    return mTx ? mTx[1] : s;
  }
  function resolveLocalTx(code) {
    const c = String(code || '').trim();
    if (!c) return '';
    const direct = st.items.find(x => String(x.transaction_id) === c || String(x.tracking_token || '') === c);
    return direct ? String(direct.transaction_id) : c;
  }
  window.__cpToggleBatch = v => { st.batchScan = !!v; };
  window.__cpRerender = () => { if (document.getElementById('cp-body')) renderTab(false); };
  window.__cpGoTab = t => setTab(t);
  window.__cpDaySummary = () => { const it = itemsOf(today()); return { total: it.length, pending: it.filter(i => !i.confirmed).length }; };
  /* قارئ بديل (BarcodeDetector + jsQR احتياطي) للموبايلات القديمة. نفس التوجيه: إيصال تسليم → شاشة التسليم، كود معاملة → تفاصيلها. */
  function openAltScanner() {
    if (typeof window.openQrScanner !== 'function') return toast('القارئ البديل مش متاح على الجهاز ده', true);
    if (typeof window.__cp4Beep === 'function') window.__cp4Beep(true); /* فتح الصوت من ضغطة المندوب */
    window.openQrScanner(function (raw) {
      if (typeof window.__cp4ReceiptToken === 'function' && window.__cp4ReceiptToken(raw) && typeof window.__cp4DeliverFromRaw === 'function') {
        return window.__cp4DeliverFromRaw(raw);
      }
      const tx = resolveLocalTx(extractTxFromScan(raw));
      if (tx) return openClientDetail(tx);
      toast('الكود ده مش خاص بإيصال أو معاملة تساهيل', true);
    });
  }

  async function openQrScannerModal() {
    stopQrCamera();
    modal(
      '<h3> مسح كود QR المعاملة</h3>' +
      '<p>وجّه الكاميرا على كود الـ QR المطبوع على الإيصال أو حافظة المستندات لفتح المعاملة وتأكيدها فوراً:</p>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><label style="font-size:12px;font-weight:700;display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="cp-qr-batch-chk"' + (st.batchScan ? ' checked' : '') + ' onchange="window.__cpToggleBatch(this.checked)"> مسح متتابع (أكتر من إيصال ورا بعض)</label></div>' +
      '<div id="cp-qr-batch-bar"></div>' +
      '<div id="cp-qr-box" style="position:relative;width:100%;height:220px;background:#000;border-radius:14px;overflow:hidden;display:flex;align-items:center;justify-content:center;margin-bottom:10px">' +
        '<video id="cp-qr-vid" playsinline muted style="width:100%;height:100%;object-fit:cover"></video>' +
        '<div id="cp-qr-msg" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;background:rgba(0,0,0,.45);padding:12px;text-align:center">جاري تشغيل الكاميرا…</div>' +
      '</div>' +
      '<div style="display:flex;gap:6px">' +
        '<input id="cp-qr-manual" type="text" dir="ltr" class="cp-field" placeholder="أو اكتب رقم المعاملة هنا (مثال: TX-2026-...)">' +
        '<button type="button" class="cp-btn cp-go" data-act="qr-go">فتح</button>' +
      '</div>' +
      '<div class="cp-btns"><button type="button" class="cp-btn" data-act="qr-alt">قارئ بديل</button><button type="button" class="cp-btn" data-act="qr-close">إغلاق</button></div>'
    );
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('no camera');
      qrStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const vid = $('cp-qr-vid'), msg = $('cp-qr-msg');
      if (!vid) { stopQrCamera(); return; }
      vid.srcObject = qrStream;
      await vid.play();
      if (msg) msg.style.display = 'none';
      if ('BarcodeDetector' in window) {
        const det = new window.BarcodeDetector({ formats: ['qr_code'] });
        const scanLoop = async () => {
          if (!qrStream || !$('cp-qr-vid')) return;
          try {
            const codes = await det.detect(vid);
            if (codes && codes.length && codes[0].rawValue) {
              if (!st.batchScan && typeof window.__cp4ReceiptToken === 'function' && window.__cp4ReceiptToken(codes[0].rawValue)) {
                stopQrCamera(); closeModal(); window.__cp4DeliverFromRaw(codes[0].rawValue); return;
              }
              const rawCode = extractTxFromScan(codes[0].rawValue);
              const tx = resolveLocalTx(rawCode);
              if (window.CourierV12) window.CourierV12.haptic(!!tx);
              if (tx && st.batchScan) {
                const it = byTx(tx);
                const bar = $('cp-qr-batch-bar');
                if (bar) bar.innerHTML = '<div style="padding:8px 10px;border-radius:10px;background:rgba(16,185,129,.2);border:1px solid #036b29;color:#036b29;font-size:12px;font-weight:800;margin-bottom:8px">✓ اتلقط: ' + eh((it && it.client_name) || tx) + ' <button type="button" class="cp-a cp-sm pri" data-act="detail" data-tx="' + eh(tx) + '">فتح</button></div>';
                setTimeout(() => requestAnimationFrame(scanLoop), 1100);
                return;
              }
              stopQrCamera();
              if (tx) { openClientDetail(tx); return; }
              toast('كود الـ QR ده مش خاص بمعاملة تساهيل', true);
              return;
            }
          } catch (e) {}
          requestAnimationFrame(scanLoop);
        };
        requestAnimationFrame(scanLoop);
      } else if (msg) {
        msg.style.display = 'flex';
        msg.textContent = 'القارئ ده مش مدعوم على جهازك — جرّب «قارئ بديل» أو اكتب رقم المعاملة بالأسفل';
      }
    } catch (e) {
      const msg = $('cp-qr-msg');
      if (msg) msg.textContent = 'تعذر فتح الكاميرا — اكتب رقم المعاملة أو لصق رابط الإيصال بالأسفل';
    }
  }

  /* تحميل وعرض كشف الحساب التفصيلي وحالة التقفيل والصرف داخل تابة «حسابي» */
  async function loadCourierLedger() {
    if (st.ledgerLoading) return;
    st.ledgerLoading = true;
    renderTab(false);
    try {
      const r = await sbClient.rpc('courier_ops_ledger', { p_from: st.ledgerFrom, p_to: st.ledgerTo });
      if (!r.error && Array.isArray(r.data)) {
        st.ledgerRows = r.data.filter(x => x && (Number(x.lines) > 0 || x.type === 'fee' || (x.client_name && x.client_name !== 'بدون اسم')));
      }
    } catch (e) {}
    st.ledgerLoading = false;
    renderTab(false);
  }

  function renderIntegratedLedgerSection() {
    if (!st.ledgerOpen) {
      return '<div class="cp-card" style="margin-top:12px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">' +
        '<div><b> كشف الحساب التفصيلي وحالة الصرف</b><div class="cp-sub">شوف إيه اللي دخل التقفيل وإيه اللي اتسجل صرفه من الإدارة بأي فترة تاريخية</div></div>' +
        '<button type="button" class="cp-btn cp-go cp-sm" data-act="ledger-toggle">فتح كشف الحساب</button>' +
      '</div>';
    }
    const confirmedRows = st.ledgerRows.filter(x => x.confirmed);
    const total = confirmedRows.reduce((a, x) => a + Number(x.amount || 0), 0);
    const closed = confirmedRows.filter(x => x.included_in_closing).reduce((a, x) => a + Number(x.amount || 0), 0);
    const paid = confirmedRows.filter(x => x.included_in_closing && x.paid_at).reduce((a, x) => a + Number(x.amount || 0), 0);
    const unpaid = Math.max(0, closed - paid);
    const typeAr = { pickup: 'استلام', delivery: 'تسليم', fee: 'رسوم توصيل' };
    const rowsHtml = st.ledgerRows.map(x => {
      const closeState = x.included_in_closing ? (x.paid_at ? '✓ تم الصرف' : ' دخل التقفيل') : (x.released_at ? 'أُعيد فتحه' : 'لم يُقفل بعد');
      return '<tr style="border-bottom:1px solid var(--bd)">' +
        '<td style="padding:6px">' + eh(x.day) + '</td>' +
        '<td style="padding:6px" dir="ltr">' + eh(x.transaction_id) + '</td>' +
        '<td style="padding:6px">' + eh(x.client_name || '—') + '</td>' +
        '<td style="padding:6px">' + eh(typeAr[x.type] || x.type) + '</td>' +
        '<td style="padding:6px;font-weight:700">' + money(x.amount) + '</td>' +
        '<td style="padding:6px">' + (x.confirmed ? '<span class="cp-tag ok">مؤكد</span>' : '<span class="cp-tag wt">معلق</span>') + '</td>' +
        '<td style="padding:6px">' + eh(closeState) + '</td>' +
      '</tr>';
    }).join('');

    return '<section class="cp-card" style="margin-top:12px">' +
      '<div class="cp-row" style="margin-bottom:8px"><b> كشف الحساب التفصيلي وحالة التقفيل والصرف</b><button type="button" class="cp-btn cp-sm" data-act="ledger-toggle">إخفاء الكشف</button></div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:flex-end;margin-bottom:10px">' +
        '<label class="cp-sub" style="flex:1;min-width:120px">من تاريخ<input id="cp-ldg-from" type="date" class="cp-field" style="padding:7px" value="' + eh(st.ledgerFrom) + '"></label>' +
        '<label class="cp-sub" style="flex:1;min-width:120px">إلى تاريخ<input id="cp-ldg-to" type="date" class="cp-field" style="padding:7px" value="' + eh(st.ledgerTo) + '"></label>' +
        '<button type="button" class="cp-btn cp-go cp-sm" data-act="ledger-run">عرض الفترة</button>' +
      '</div>' +
      '<div class="cp-grid">' +
        '<div class="cp-kpi"><small>إجمالي المؤكد</small><b>' + money(total) + '</b></div>' +
        '<div class="cp-kpi"><small>دخل التقفيل</small><b>' + money(closed) + '</b></div>' +
        '<div class="cp-kpi"><small>تم تسجيل صرفه</small><b>' + money(paid) + '</b></div>' +
        '<div class="cp-kpi"><small>مؤكد لم يدخل التقفيل</small><b>' + money(total - closed) + '</b>' + (unpaid ? '<div class="p">مقفل بانتظار الصرف: ' + money(unpaid) + '</div>' : '') + '</div>' +
      '</div>' +
      (st.ledgerLoading ? '<div class="cp-empty">جاري تحميل كشف الحساب…</div>' :
        (rowsHtml ? '<div style="overflow-x:auto"><table style="width:100%;font-size:11.5px;border-collapse:collapse;text-align:right"><thead><tr style="border-bottom:2px solid var(--bd);color:var(--mu)"><th style="padding:6px">التاريخ</th><th style="padding:6px">المعاملة</th><th style="padding:6px">العميل</th><th style="padding:6px">النوع</th><th style="padding:6px">العمولة</th><th style="padding:6px">التأكيد</th><th style="padding:6px">التقفيل/الصرف</th></tr></thead><tbody>' + rowsHtml + '</tbody></table></div>'
          : '<div class="cp-empty">لا توجد حركات في هذه الفترة.</div>')) +
    '</section>';
  }

  function isGuideOpen(tab) { return st.guides[tab] === true; }
  function toggleGuide(tab) {
    st.guides[tab] = !isGuideOpen(tab);
    try { localStorage.setItem('ts_cp_guides', JSON.stringify(st.guides)); } catch (e) { /* */ }
    renderTab(false);
  }

  const GUIDES = {
    profile: {
      icon: 'fa-id-card',
      title: 'شاشة «ملفي الشخصي» — إيه فايدتها؟',
      desc: 'ضيف صورتك ومسماك الوظيفي ورقم تليفونك عشان الموظفين يعرفوك ويتواصلوا معاك.',
      steps: [
        'تقدر ترفع صورتك الشخصية من الموبايل أو الكمبيوتر وتتحفظ تلقائياً.',
        'اكتب مسماك الوظيفي ورقم تليفونك واضغط «حفظ» عشان يظهروا للموظفين في الشات والمعاملات.'
      ]
    },
    home: {
      icon: 'fa-chart-pie',
      title: 'شاشة «حسابي» — متابعة عمولتك ومشاويرك لحظة بلحظة',
      desc: 'هنا بتشوف عمولتك المؤكدة عن اليوم أو الأسبوع أو الشهر، وتفصيل المشاوير اللي استلمتها أو سلمتها ومشاوير رسوم التوصيل.',
      steps: [
        'الأخضر (مؤكدة): مشاوير راجعتها وأكدتها ونزلت في حساب عمولتك.',
        'البرتقالي (في انتظار تأكيدك): مشاوير اتسجلت باسمك ومستنية تراجعها وتأكدها من شاشة «المراجعة».',
        'كارت الترتيب: بيعرفك مركزك الحالي وسط زمايلك في الاستلامات والتسليم.'
      ]
    },
    trips: {
      icon: 'fa-motorcycle',
      title: 'شاشة «مشاويري» — خط سيرك وتفاصيل العملاء',
      desc: 'لو العميل ليه كذا ريكوست في نفس اليوم هتلاقيهم متجمعين في كارت واحد مكتوب عليه عدد الريكوستات عشان متتلخبطش.',
      steps: [
        'اضغط على اسم العميل أو زرار «تفاصيل العميل» عشان تشوف كل خدماته وحالتها وتواريخ استلامك وتسليمك.',
        'تقدر تتصل بالعميل أو تبعتله واتساب أو تفتح عنوانه على الخريطة بضغطة واحدة.',
        'لو الموظف لسه ما قفلش المعاملة هتلاقي تنبيه واضح «<i class="fa-regular fa-clock"></i> الموظف لسه ما قفلش المعاملة».'
      ]
    },
    rank: {
      icon: 'fa-trophy',
      title: 'شاشة «الترتيب» — لوحة شرف الاستلامات والتسليم',
      desc: 'بتعرض ترتيب كل المناديب حسب عدد مرات الاستلام والتسليم ومشاوير التوصيل خلال اليوم أو الأسبوع أو الشهر.',
      steps: [
        'الترتيب بيتحسب تلقائياً حسب إجمالي المشاوير ثم عدد التسليمات.',
        'كل ما تنجز مشاوير أكتر وتأكدها، مركزك بيعلى في لوحة الشرف.',
        'الأرقام المالية الخاصة بيك بتظهرلك أنت بس في حسابي، ومحدش بيشوف عمولة زميله.'
      ]
    },
    review: {
      icon: 'fa-clipboard-check',
      title: 'شاشة «المراجعة» — تقفيل وتأكيد شغل آخر اليوم',
      desc: 'راجع مشاويرك آخر اليوم: تقدر تأكد كل ريكوست لوحده بزرار «أكّد ده بس» أو تأكد القسم كله مرة واحدة.',
      steps: [
        'اضغط على اسم العميل لو عايز تراجع تفاصيل خدماته وتتأكد إنه العميل اللي استلمت منه أو سلمته.',
        'لو بعتّ ملاحظة للموظف هتظهرلك علامة « أبلغت الموظف» بالساعة، والريكوست بيفضل ظاهر لحد ما الموظف يقفله أو أنت تأكده.',
        'اضغط «أكّد ده بس» لتأكيد معاملة واحدة أو الزرار الكبير لتأكيد القسم كله.'
      ]
    },
    chat: {
      icon: 'fa-comments',
      title: 'شاشة «التواصل» — رسايل خاصة ومباشرة مع الموظفين والإدارة',
      desc: 'اتواصل مع أي موظف أو مع المدير بخصوص أي معاملة، وشوف تحت كل رسالة بعتها هل «✓ اتبعتت» ولا «✓✓ اتقرت».',
      steps: [
        'اضغط على اسم الموظف أو المدير لفتح المحادثة الخاصة معاه.',
        'تحت رسالتك هتلاقي «✓ اتبعتت» وأول ما الموظف يفتحها بتتحول تلقائياً إلى «✓✓ اتقرت».',
        'تقدر كمان تتصل بالموظف تليفونياً أو تبعتله واتساب.'
      ]
    }
  };

  function renderGuideBanner() { return ''; }
  function openScreenHelpModal() {
    const map = { today: 'home', tickets: 'trips', trips: 'trips', route: 'trips', review: 'review', chat: 'chat', account: 'home', profile: 'profile' };
    const g = GUIDES[map[st.tab] || 'home'] || GUIDES.home;
    if (!g) return;
    modal(
      '<h3>' + eh(g.title) + '</h3>' +
      '<p>' + eh(g.desc) + '</p>' +
      (Array.isArray(g.steps) && g.steps.length
        ? '<ul class="cp-guide-ul" style="border-top:1px solid var(--bd);margin-bottom:12px">' + g.steps.map(x => '<li>' + eh(x) + '</li>').join('') + '</ul>'
        : '') +
      '<div class="cp-btns"><button type="button" class="cp-btn cp-go" data-act="mclose-btn">فهمت</button></div>'
    );
  }

  /* ---------- ثيم: صباحي (فاتح) / مسائي (داكن) ---------- */
  function initTheme() {
    let t = null; try { t = localStorage.getItem('ts_cp_theme'); } catch (e) { /* */ }
    if (t !== 'light' && t !== 'dark') { const h = Number(new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: TZ })); t = (h >= 6 && h < 18) ? 'light' : 'dark'; }
    st.theme = t;
  }
  /* سحب حقيقي لزرار التأكيد (.cpn-slide): اسحب الزرار لآخر الشريط عشان تأكد. الضغط العادي لسه شغال. */
  function initSlideConfirm() {
    if (window.__cpSlideInit) return; window.__cpSlideInit = true;
    let drag = null, suppressUntil = 0;
    document.addEventListener('pointerdown', e => {
      const kn = e.target.closest && e.target.closest('#courier-app .cpn-slide .kn'); if (!kn) return;
      const tr = kn.closest('.cpn-slide'), tw = tr.getBoundingClientRect().width, kw = kn.getBoundingClientRect().width;
      drag = { tr, kn, x0: e.clientX, id: e.pointerId, dir: getComputedStyle(tr).direction === 'rtl' ? -1 : 1, max: Math.max(1, tw - kw - 10), dx: 0, moved: false };
      try { kn.setPointerCapture(e.pointerId); } catch (err) { /* */ }
      kn.style.transition = 'none';
    });
    document.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      drag.dx = Math.max(0, Math.min(drag.max, (e.clientX - drag.x0) * drag.dir));
      if (drag.dx > 6) drag.moved = true;
      drag.kn.style.transform = 'translateX(' + (drag.dx * drag.dir) + 'px)';
      drag.tr.style.setProperty('--slide', Math.round(drag.dx / drag.max * 100) + '%');
    });
    const end = e => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag; drag = null;
      d.kn.style.transition = 'transform .2s'; d.kn.style.transform = ''; d.tr.style.removeProperty('--slide');
      if (!d.moved) return; /* ضغطة عادية: الـ click الطبيعي يكمّل */
      suppressUntil = Date.now() + 400; /* نمنع الـ click الطبيعي بعد السحب */
      if (d.dx >= d.max * 0.75) { if (window.CourierV12) window.CourierV12.haptic(true); d.tr.click(); }
    };
    document.addEventListener('pointerup', end); document.addEventListener('pointercancel', end);
    document.addEventListener('click', e => {
      if (e.isTrusted && Date.now() < suppressUntil && e.target.closest && e.target.closest('.cpn-slide')) { e.stopImmediatePropagation(); e.preventDefault(); }
    }, true);
  }

  function applyTheme() {
    const o = $('courier-app'); if (o) o.setAttribute('data-theme', st.theme);
    const b = $('cp-theme'); if (b) b.innerHTML = st.theme === 'dark' ? ic('sun') : ic('moon');
  }
  function toggleTheme() { st.theme = st.theme === 'dark' ? 'light' : 'dark'; try { localStorage.setItem('ts_cp_theme', st.theme); } catch (e) { /* */ } applyTheme(); }

  /* ---------- ستايل مستقل (من غير Tailwind ومن غير !important يكسر hidden) ---------- */
  function addCss() {
    if ($('cp-style')) return;
    const s = document.createElement('style'); s.id = 'cp-style';
    s.textContent = (window.__CP_CSS || []).join('\n'); /* الستايل في js/70a-courier-css.js */
    document.head.appendChild(s);
  }
  window.__ensureCourierPortalCss = addCss;

  /* ---------- مساعدات ---------- */
  function toast(msg, bad) {
    const t = document.createElement('div'); t.className = 'cp-toast' + (bad ? ' err' : ''); t.textContent = msg;
    ($('courier-app') || document.body).appendChild(t); setTimeout(() => t.remove(), 3600);
  }
  function errMsg(e) {
    const m = String((e && e.message) || e || '');
    if (/not your transaction/.test(m)) return 'المعاملة دي مش متسجلة على اسمك';
    if (/body required/.test(m)) return 'اكتب الملاحظة الأول';
    if (/bad day/.test(m)) return 'مينفعش تأكد يوم لسه ماجاش';
    if (/not linked|courier only/.test(m)) return 'حسابك مش مربوط بمندوب. كلّم المدير';
    if (/Failed to fetch|network|NetworkError|load failed/i.test(m)) return 'مفيش اتصال بالإنترنت، جرّب تاني';
    return 'حصل خطأ: ' + m;
  }
  const waNum = p => { let d = String(p || '').replace(/\D/g, ''); if (d.startsWith('00')) d = d.slice(2); else if (d.startsWith('0')) d = '20' + d.slice(1); return d; };
  const mapsUrl = a => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(a);
  const telHref = p => 'tel:' + String(p || '').replace(/[^\d+]/g, '');
  const callBtns = (phone, label) => {
    if (!phone) return '';
    const lb = label === undefined ? phone : label;
    return '<a class="cp-a tel" href="' + eh(telHref(phone)) + '"><i class="fa-solid fa-phone"></i><span>اتصال' + (lb ? ' ' + eh(lb) : '') + '</span></a>' +
      '<a class="cp-a wa" target="_blank" rel="noopener" href="https://wa.me/' + eh(waNum(phone)) + '"><i class="fa-brands fa-whatsapp"></i><span>واتساب</span></a>';
  };

  /* هل الموظف لسه ما قفلش المعاملة؟ (البند A.3) */
  function isNotClosedByStaff(it) {
    const lines = Number(it.lines) || 0;
    const rev = Number(it.n_review) || 0;
    const deliv = Number(it.n_delivered) || 0;
    if (rev > 0) return true;
    if (it.type === 'delivery' && lines > 0 && deliv < lines) return true;
    return false;
  }

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

  /* مرجع التأكيد الفردي (للبند B.1) */
  // التأكيد الفردي لازم يشير إلى سجل المشوار نفسه، لا إلى رقم المعاملة الذي قد يحتوي أكثر من مشوار.
  const itemRef = it => (it.type === 'fee' ? 'fee:' : 'trip:') + String(it.id);

  /* علامة  أبلغت الموظف (البند B.3) */
  function noteBadgeHtml(it) {
    const tx = String(it.transaction_id || '');
    const n = st.notesMap[tx];
    const count = Number(it.my_notes) || (n ? 1 : 0);
    if (!count) return '';
    const tm = n && n.at ? timeOf(n.at) : '';
    return '<span class="cp-tag in"> أبلغت الموظف' + (tm ? ' (الساعة ' + eh(tm) + ')' : ' (' + num(count) + ' ملاحظة)') + '</span>';
  }

  /* تجميع العناصر لنفس العميل + اليوم + النوع (البند A.1) */
  function groupItemsByClient(rows) {
    const groups = [];
    const map = new Map();
    rows.forEach(it => {
      const cNorm = normAr(it.client_name || 'بدون اسم') || ('tx_' + it.transaction_id);
      const key = cNorm + '||' + it.day + '||' + it.type;
      let g = map.get(key);
      if (!g) {
        g = {
          key: key,
          client_name: it.client_name || 'بدون اسم',
          day: it.day,
          type: it.type,
          phone: it.phone || '',
          address: it.address || '',
          employee: it.employee || '',
          employee_id: it.employee_id || null,
          employee_phone: it.employee_phone || '',
          items: []
        };
        map.set(key, g);
        groups.push(g);
      }
      if (!g.phone && it.phone) g.phone = it.phone;
      if (!g.address && it.address) g.address = it.address;
      if (!g.employee && it.employee) { g.employee = it.employee; g.employee_id = it.employee_id; g.employee_phone = it.employee_phone; }
      g.items.push(it);
    });
    return groups;
  }

  /* ---------- إحصائيات (كل ريكوست عنصر مستقل في الداتا والمجاميع) ---------- */
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
    if (!o) {
      o = document.createElement('div'); o.id = 'courier-app'; o.setAttribute('dir', 'rtl');
      o.addEventListener('click', onClick); o.addEventListener('keydown', onKey); o.addEventListener('input', onInput);
      initSlideConfirm();
      document.body.appendChild(o);
    }
    o.classList.remove('hidden'); o.setAttribute('data-theme', st.theme); o.innerHTML = inner; return o;
  }
  const logoutBtn = '<button type="button" class="cp-v12-hicon pwr" data-act="logout" title="تسجيل الخروج" aria-label="خروج"><i class="fa-solid fa-power-off"></i></button>';

  function myAvHtml(sz) {
    sz = sz || 34;
    const url = st.avPendingUrl || st.avUrl;
    if (url && !st.avRemoved) return '<img src="' + eh(url) + '" alt="" style="width:' + sz + 'px;height:' + sz + 'px;border-radius:50%;object-fit:cover;flex:0 0 auto;border:2px solid #036b29">';
    const ch = String((st.me && st.me.name) || 'م').trim().charAt(0) || 'م';
    return '<span style="width:' + sz + 'px;height:' + sz + 'px;border-radius:50%;background:#036b29;color:#ffffff;font-weight:900;font-size:' + Math.round(sz * 0.44) + 'px;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto">' + eh(ch) + '</span>';
  }
  function todayEarnedAmt() {
    return st.items.filter(i => i.day === today() && i.confirmed).reduce((s, x) => s + (Number(x.amount) || 0), 0);
  }
  function myAvTile() {
    const url = st.avPendingUrl || st.avUrl;
    if (url && !st.avRemoved) return '<img class="cpn-av" src="' + eh(url) + '" alt="">';
    const ch = String((st.me && st.me.name) || 'م').trim().charAt(0) || 'م';
    return '<div class="cpn-av">' + eh(ch) + '</div>';
  }
  function updateHeaderWho() {
    const w = $('cp-who-box'); if (!w) return;
    w.innerHTML = myAvTile() +
      '<div class="cpn-wt"><b>' + eh(st.me && st.me.name) + '</b>' +
      '<div class="cpn-st"><i style="background:' + (st.onBreak ? 'var(--wn)' : '#036b29') + '"></i><span class="cpn-num" id="cp-time" dir="rtl"></span></div></div>';
    tickClock();
  }
  function shell() {
    overlay(
      '<header class="cpn-head">' +
        '<div class="cpn-who" id="cp-who-box" data-act="profile" title="الحساب الشخصي"></div>' +
        '<button type="button" class="cpn-ib" id="cp-theme" data-act="theme" aria-label="الوضع الفاتح / الداكن"></button>' +
        '<button type="button" class="cpn-ib cpn-scan" data-act="qr-scan" aria-label="Scan" title="Scan">' + ic('qr') + '<span>Scan</span></button>' +
        '<button type="button" class="cpn-ib" id="cp-menu-btn" data-act="menu" aria-label="القائمة" title="القائمة">' + ic('menu') + '</button>' +
      '</header>' +
      '<div class="cp-drawer" id="cp-drawer" hidden>' +
        '<div class="cp-drawer-bg" data-act="menu-close"></div>' +
        '<aside class="cp-drawer-panel" role="menu">' +
          '<div class="cp-drawer-title">التنقل</div>' +
          '<button type="button" class="cp-drawer-item" id="cp-hdr-review" data-tab="review" role="menuitem">' + ic('check') + '<span>المراجعة</span></button>' +
          '<button type="button" class="cp-drawer-item" data-tab="account" role="menuitem">' + ic('wallet') + '<span>حسابي وكشف الحساب</span></button>' +
          '<div class="cp-drawer-sep"></div>' +
          '<div class="cp-drawer-title">أدوات المندوب</div>' +
          '<div id="cp-drawer-tools" class="cp-drawer-group"></div>' +
          '<div class="cp-drawer-sep"></div>' +
          '<div class="cp-drawer-title">إعدادات ومساعدة</div>' +
          '<button type="button" class="cp-drawer-item" data-act="profile" role="menuitem">' + ic('user') + '<span>ملفي الشخصي</span></button>' +
          '<button type="button" class="cp-drawer-item" id="cp-hdr-info" data-act="screen-help" role="menuitem">' + ic('info') + '<span>دليل الاستخدام</span></button>' +
          '<button type="button" class="cp-drawer-item" data-act="refresh" role="menuitem">' + ic('refresh') + '<span>تحديث البيانات</span></button>' +
          '<button type="button" class="cp-drawer-item pwr" data-act="logout" role="menuitem">' + ic('power') + '<span>تسجيل الخروج</span></button>' +
        '</aside>' +
      '</div>' +
      '<div id="cp-v12-top-banners"></div>' +
      '<div class="cp-off" id="cp-off">مفيش اتصال بالإنترنت… الحفظ شغال أوفلاين</div>' +
      '<main class="cp-body" id="cp-body"></main>' +
      '<nav class="cp-nav" id="cp-nav" aria-label="التنقل"></nav><div id="cp-modal-root"></div>');
    const dr = $('cp-drawer');
    if (dr) dr.addEventListener('click', e => { if (e.target.closest('.cp-drawer-item')) setTimeout(() => { dr.hidden = true; }, 0); });
    updateHeaderWho(); applyTheme(); tickClock(); renderNav(); renderTab(); refreshMyPosQuiet();
  }
  function tickClock() {
    const t = $('cp-time'); if (!t) return;
    const now = new Date();
    let a = '';
    try {
      const parts = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ }).formatToParts(now);
      const hh = (parts.find(p => p.type === 'hour') || {}).value || '';
      const mm = (parts.find(p => p.type === 'minute') || {}).value || '';
      const dp = ((parts.find(p => p.type === 'dayPeriod') || {}).value || '').toUpperCase() === 'PM' ? 'م' : 'ص';
      a = '\u200E' + hh + ':' + mm + ' ' + dp;
    } catch (e) {
      a = now.toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ });
    }
    if (t.textContent !== a) t.textContent = a;
    const eb = $('cp-v12-earn');
    if (eb) { const m = money(todayEarnedAmt()); if (eb.textContent !== m) eb.textContent = m; }
  }
  const unreadTotal = () => st.contacts.reduce((a, c) => a + (Number(c.unread) || 0), 0);
  function renderNav() {
    const n = $('cp-nav'); if (!n) return;
    const u = unreadTotal(), pend = st.items.filter(i => !i.confirmed).length;
    const revBtn = $('cp-hdr-review');
    if (revBtn) {
      revBtn.innerHTML = ic('check') + '<span>المراجعة</span>' + (pend ? '<em class="cp-bdg">' + num(pend) + '</em>' : '');
    }
    const tCnt = typeof window.tsCourierActiveTicketsCount === 'function' ? window.tsCourierActiveTicketsCount() : 0;
    const rCnt = st.items.filter(i => i.day === today() && !i.confirmed).length;
    const T = [
      ['today', 'home', 'الرئيسية', 0],
      ['tickets', 'check', 'التيكتات', tCnt],
      ['route', 'route', 'خط السير والمحطات', rCnt],
      ['chat', 'chat', 'التواصل', u]
    ];
    const html = T.map(t => '<button type="button" data-tab="' + t[0] + '" aria-label="' + t[2] + '" title="' + t[2] + '" class="' + (st.tab === t[0] ? 'on' : '') + '">' + ic(t[1]) + (t[3] ? '<em class="cp-bdg">' + num(t[3]) + '</em>' : '') + '</button>').join('');
    if (n.dataset.h !== html) { n.dataset.h = html; n.innerHTML = html; }
  }
  function setTab(t) {
    const dr = $('cp-drawer'); if (dr) dr.hidden = true;
    st.tab = t === 'home' ? 'account' : t;
    if (st.tab !== 'chat') st.chat = null;
    if (st.tab === 'rank') loadLeaderboard(true);
    if (st.tab === 'today' || st.tab === 'account') loadItems(true);
    renderNav(); renderTab(true);
  }
  function renderTopBanners() {
    const box = $('cp-v12-top-banners'); if (!box) return;
    let html = '';
    if (st.urgentPings && st.urgentPings.length) {
      html += st.urgentPings.map(p => '<div style="background:#991b1b;color:#fff;padding:8px 12px;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:space-between;gap:8px">' +
        '<span><i class="fa-solid fa-bell"></i> تنبيه من ' + eh(p.from_name || 'المكتب') + ': ' + eh(p.message) + (p.transaction_id ? ' (' + eh(p.transaction_id) + ')' : '') + '</span>' +
        '<button type="button" class="cp-a cp-sm" style="background:#fff;color:#991b1b;border:0" data-act="ack-ping" data-id="' + eh(p.id) + '">علم ✓</button>' +
      '</div>').join('');
    }
    if (st.undoData) {
      html += '<div style="background:#065f46;color:#fff;padding:8px 12px;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:space-between;gap:8px">' +
        '<span>✓ تم تأكيد المشوار (' + eh(st.undoData.tx) + ')</span>' +
        '<button type="button" class="cp-a cp-sm" style="background:#fff;color:#065f46;border:0" data-act="undo-confirm">تراجع (5ث)</button>' +
      '</div>';
    }
    if (st.globalSearchOpen) {
      const gq = normAr((st.globalQ || '').trim());
      const matches = gq ? st.items.filter(i => normAr([i.client_name, i.transaction_id, i.phone, i.address].join(' ')).includes(gq)).slice(0, 12) : [];
      html += '<div style="background:var(--hd);border-bottom:1px solid var(--bd);padding:10px 12px">' +
        '<div class="cp-v12-gsearch" style="margin-bottom:' + (gq ? '8px' : '0') + '">' +
          '<i class="fa-solid fa-magnifying-glass gs-ic"></i>' +
          '<input id="cp-v12-ginput" type="text" value="' + eh(st.globalQ) + '" placeholder="بحث شامل في كل الأيام بالاسم أو الهاتف أو TX…">' +
          (st.globalQ ? '<button type="button" class="gs-x" data-act="gsearch-clear">✕</button>' : '') +
        '</div>' +
        (gq ? (matches.length
          ? '<div style="max-height:220px;overflow:auto;display:flex;flex-direction:column;gap:6px">' +
              matches.map(m => '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border-radius:10px;background:var(--fld);cursor:pointer" data-act="detail" data-tx="' + eh(m.transaction_id) + '">' +
                '<div><b>' + eh(m.client_name || 'عميل') + '</b> <small style="color:var(--mu)">· ' + eh(dayLabel(m.day)) + '</small><div style="font-size:11px;color:var(--mu)" dir="ltr">' + eh(m.transaction_id) + ' · ' + eh(m.phone || '') + '</div></div>' +
                '<span class="cp-tag ' + (m.confirmed ? 'ok' : 'wt') + '">' + money(m.amount) + '</span>' +
              '</div>').join('') + '</div>'
          : '<div style="font-size:12px;color:var(--mu);text-align:center;padding:6px">مفيش نتائج مطابقة في كل الأيام</div>') : '') +
      '</div>';
    }
    html += '<div id="cp-weather-slot"></div>';
    box.innerHTML = html;
    if (window.TasahelGeo && window.TasahelGeo.hydrateWeatherSlot) {
      const sl = $('cp-weather-slot');
      const pos = st.myPos || {};
      window.TasahelGeo.hydrateWeatherSlot(sl, pos.lat, pos.lng);
    }
  }
  function renderTab(top) {
    renderTopBanners();
    const b = $('cp-body'); if (!b) return;
    /* ممنوع إعادة الرسم لو المندوب بيكتب في حقل رسالة أو نموذج */
    const activeEl = document.activeElement;
    const activeId = activeEl && activeEl.id;
    if (!top && (activeId === 'cp-msg' || activeId === 'cp-nbody' || activeId === 'cp-pf-job' || activeId === 'cp-pf-phone')) return;
    const selStart = activeId === 'cp-trip-q' ? activeEl.selectionStart : null;
    const y = b.scrollTop;

    if (st.tab === 'profile') b.innerHTML = viewProfile();
    else if (st.tab === 'today') b.innerHTML = viewToday();
    else if (st.tab === 'home' || st.tab === 'account') b.innerHTML = viewHome();
    else if (st.tab === 'tickets') b.innerHTML = viewWork();
    else if (st.tab === 'trips') b.innerHTML = viewTrips();
    else if (st.tab === 'route') b.innerHTML = '<div style="padding:4px 0 10px;font-size:20px;font-weight:900">خط السير والمحطات</div>' + renderSmartRoutePanel();
    else if (st.tab === 'rank') b.innerHTML = viewLeaderboard();
    else if (st.tab === 'review') b.innerHTML = viewReview();
    else viewChat();

    swapFa(b); swapFa($('cp-v12-top-banners'));
    const etaBox = $('cp-geo-route-eta');
    /* وقت الوصول الفعلي: على المحطات المختارة لخط السير، ولو مفيش فعلى كل محطات النهارده غير المؤكدة */
    const etaIds = (st.routeTxIds && st.routeTxIds.length) ? st.routeTxIds : itemsOf(today()).filter(i => !i.confirmed).map(i => String(i.transaction_id));
    if (etaBox && window.TasahelGeo && window.TasahelGeo.calcRouteEta && etaIds.length) {
      const wps = [], wpTx = [];
      if (st.myPos && st.myPos.lat && st.myPos.lng) wps.push({ lat: st.myPos.lat, lng: st.myPos.lng });
      else wps.push({ lat: 30.0012, lng: 31.1765 });
      etaIds.forEach(rtx => {
        const rit = byTx(rtx);
        if (rit && !rit.confirmed) {
          const z = detectZoneAndCoords(rit);
          if (z && z.lat && z.lng) { wps.push({ lat: z.lat, lng: z.lng }); wpTx.push(String(rit.transaction_id)); }
        }
      });
      if (wps.length >= 2) {
        window.TasahelGeo.calcRouteEta(wps).then(info => {
          const el = $('cp-geo-route-eta');
          if (info && el) {
            el.innerHTML = '<div class="cp-geo-eta"> المسار الفعلي: ' + num(info.km) + ' كم · ~' + num(info.min) + ' دقيقة <span style="opacity:.65;font-weight:500">(OSM)</span></div>';
          }
          /* وقت الوصول المتوقع لكل محطة: مدة كل شوط + 10 دقايق وقوف عند كل محطة سابقة */
          if (info && Array.isArray(info.legsMin) && info.legsMin.length) {
            const fmt = d => d.toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit', hour12: true });
            let acc = 0;
            wpTx.forEach((tx, i) => {
              if (info.legsMin[i] == null) return;
              acc += info.legsMin[i] + (i ? 10 : 0);
              const from = new Date(Date.now() + acc * 60000), to = new Date(Date.now() + (acc + 15) * 60000);
              const box = Array.from(document.querySelectorAll('[data-eta-tx]')).find(n => n.getAttribute('data-eta-tx') === tx);
              if (box) box.textContent = 'وصول متوقع: ' + fmt(from) + ' – ' + fmt(to);
            });
          }
        }).catch(() => null);
      }
    }
    b.scrollTop = top ? 0 : y;
    if (activeId === 'cp-trip-q' && $('cp-trip-q')) {
      const inp = $('cp-trip-q'); inp.focus();
      if (selStart != null) { try { inp.setSelectionRange(selStart, selStart); } catch (e) { /* */ } }
    }
  }

  /* ---------- 1) حسابي ---------- */
  function availableMonths() {
    const cur = today().slice(0, 7);
    const set = new Set([cur]);
    st.items.forEach(i => { if (i.day && i.day.length >= 7) set.add(i.day.slice(0, 7)); });
    return Array.from(set).sort().reverse().slice(0, 6);
  }
  function distTxtOf(it) {
    if (!st.myPos || !window.CourierV12) return '';
    const z = detectZoneAndCoords(it);
    const km = window.CourierV12.haversineKm(st.myPos.lat, st.myPos.lng, z.lat, z.lng);
    return km < 1 ? (Math.round(km * 1000) + ' م') : (km.toFixed(1) + ' كم');
  }
  const doneLabel = it => it.type === 'pickup' ? 'تم الاستلام' : it.type === 'fee' ? 'تم التحصيل' : 'تم التسليم';
  function pickHero(pending) {
    const a = st.activeTx && pending.find(i => String(i.transaction_id) === String(st.activeTx));
    if (a) return a;
    for (const tx of st.routeTxIds) { const it = pending.find(i => String(i.transaction_id) === String(tx)); if (it) return it; }
    return pending[0] || null;
  }
  function buildFiveStepper(doneUpTo, curIdx) {
    const labels = ['قبول', 'اتصال', 'خط السير', 'في الطريق', 'تم'];
    return '<div class="ts-stepper">' + labels.map((lbl, idx) => {
      const n = idx + 1;
      const isDone = n <= doneUpTo;
      const isCur = !isDone && n === curIdx;
      const cls = isDone ? 'done' : (isCur ? 'cur' : '');
      return '<div class="ts-step ' + cls + '"><div class="ts-dot">' + (isDone ? '✓' : num(n)) + '</div><div class="ts-slbl">' + lbl + '</div></div>';
    }).join('') + '</div>';
  }
  function heroCard(it, pending) {
    const tx = String(it.transaction_id), z = detectZoneAndCoords(it), k = KIND[it.type];
    const onway = it.live_state === 'on_the_way', waiting = !!st.waitingMap[tx];
    const inRouteIdx = routeIndexOf(tx);
    const called = Number(it.call_attempts || 0) > 0 || !!it.client_confirmed;
    const cod = Number(it.cod_remaining || 0), dist = distTxtOf(it);
    const mates = pending.filter(x => x !== it && normAr(x.client_name || '') === normAr(it.client_name || '') && x.type === it.type).length;

    let doneUpTo = 1, curIdx = 2;
    if (it.confirmed) { doneUpTo = 5; curIdx = 6; }
    else if (waiting) { doneUpTo = 4; curIdx = 5; }
    else if (onway) { doneUpTo = 3; curIdx = 4; }
    else if (inRouteIdx !== -1) { doneUpTo = 3; curIdx = 4; }
    else if (called) { doneUpTo = 2; curIdx = 3; }

    const slideAttrs = ' data-act="v12-slide-confirm" data-type="' + eh(it.type) + '" data-ref="' + eh(itemRef(it)) + '" data-tx="' + eh(tx) + '" data-amt="' + eh(it.amount) + '"';
    let primaryBtn = '';
    if (waiting) {
      primaryBtn = '<button type="button" class="ts-hero-cta done"' + slideAttrs + '>✓ تأكيد ' + eh(k.sec === 'الاستلام' ? 'الاستلام' : k.sec === 'التسليم' ? 'التسليم' : 'الرسوم') + '</button>';
    } else if (onway) {
      primaryBtn = '<button type="button" class="ts-hero-cta" data-act="v12-wait" data-tx="' + eh(tx) + '">' + ic('pin', 16) + ' وصلت</button>';
    } else {
      primaryBtn = '<button type="button" class="ts-hero-cta" data-act="v12-wait" data-tx="' + eh(tx) + '">' + ic('pin', 16) + ' وصلت</button>';
    }

    const eyebrowLeft = inRouteIdx !== -1 ? ('المحطة الجاية #' + num(inRouteIdx + 1)) : 'المحطة الجاية';
    const eyebrowRight = eh(k.sec || k.label) + (dist ? ' · ' + eh(dist) : '');

    return '<section class="cpn-hero">' +
      '<div class="ts-hero-eyebrow"><span>' + eyebrowLeft + '</span><span>' + eyebrowRight + '</span></div>' +
      '<div class="ts-hero-client" data-act="detail" data-tx="' + eh(tx) + '">' + eh(it.client_name || 'بدون اسم') + '</div>' +
      '<div class="ts-hero-sub">' + eh((it.services ? it.services + ' · ' : '') + (it.address || z.zone)) + '</div>' +
      (it.landmark_note ? '<div style="margin-top:7px;padding:6px 10px;border-radius:10px;background:rgba(212,175,99,.16);font-size:11.5px;color:#FDE68A"><i class="fa-regular fa-note-sticky"></i> ' + eh(it.landmark_note) + '</div>' : '') +
      '<div class="ts-hero-meta">' +
        (cod > 0 ? '<span class="ts-hero-chip gold">تحصيل ' + money(cod) + '</span>' : '<span class="ts-hero-chip ok">خالص الدفع</span>') +
        '<span class="ts-hero-chip cpn-num" dir="ltr">' + eh(tx) + '</span>' +
        (mates ? '<span class="ts-hero-chip">+' + num(mates) + ' طلب</span>' : '') +
        (it.office_ready ? '<span class="ts-hero-chip ok">جاهز بالمكتب</span>' : '') +
      '</div>' +
      buildFiveStepper(doneUpTo, curIdx) +
      '<div class="ts-hero-actions">' +
        primaryBtn +
        (it.phone ? '<a class="ts-hero-icon" data-act="v12-call-log" data-tx="' + eh(tx) + '" href="' + eh(telHref(it.phone)) + '" aria-label="اتصال">' + ic('phone', 18) + '</a>' : '') +
        '<button type="button" class="ts-hero-icon" data-act="v12-map-opts" data-tx="' + eh(tx) + '" aria-label="الخريطة">' + ic('nav', 18) + '</button>' +
      '</div>' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;font-size:11.5px">' +
        '<button type="button" style="border:0;background:none;color:rgba(245,243,238,.78);font:inherit;cursor:pointer;padding:2px 0" data-act="detail" data-tx="' + eh(tx) + '">تفاصيل وخيارات إضافية ←</button>' +
        (!waiting ? '<button type="button" style="border:0;background:none;color:#fecdd3;font:inherit;font-weight:700;cursor:pointer;padding:2px 0"' + slideAttrs + '>تأكيد مباشر</button>' : '') +
      '</div>' +
    '</section>';
  }
  /* ---------- شاشة الآن (حلقة اليوم + المشوار الحالي + التالي في خط السير) ---------- */
  function viewToday() {
    const t = today();
    const todayItems = itemsOf(t);
    const pending = todayItems.filter(i => !i.confirmed);
    const q = (st.homeSearch || '').trim().toLowerCase();
    const filteredPending = q
      ? pending.filter(i => [i.client_name, i.address, i.transaction_id, detectZoneAndCoords(i).zone].join(' ').toLowerCase().indexOf(q) !== -1)
      : pending;

    const searchBar = '<div class="ts7b-search">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
      '<input id="cp-home-search" type="search" autocomplete="off" placeholder="ابحث بالاسم أو المنطقة أو الرقم" value="' + eh(st.homeSearch || '') + '">' +
    '</div>';

    const kpis = '<section class="ts7b-kpi2">' +
      '<div class="ts7b-kpi" data-tab="route">' +
        '<div class="ts7b-kpi-val">' + num(pending.length) + '</div>' +
        '<span class="ts7b-kpi-lbl">مشاوير اليوم</span>' +
      '</div>' +
      '<div class="ts7b-kpi" data-tab="account">' +
        '<div class="ts7b-kpi-val">' + num(todayEarnedAmt()) + ' <span style="font-size:14px;color:var(--mu);font-weight:700">ج</span></div>' +
        '<span class="ts7b-kpi-lbl">عمولة اليوم</span>' +
      '</div>' +
    '</section>';

    const cur = pickHero(filteredPending);
    const hero = cur ? heroCard(cur, filteredPending)
      : '<section class="cpn-card" style="text-align:center;color:var(--mu);font-weight:700">' + (st.loaded ? 'لا توجد محطات معلّقة اليوم' : 'جاري التحميل…') + '</section>';

    return searchBar + kpis + hero;
  }

  function viewHome() {
    if (!st.month) st.month = today().slice(0, 7);
    const s = stats(rangeOf(st.period));
    const seg = '<div class="cp-seg">' + [['today', 'اليوم'], ['week', 'الأسبوع'], ['month', 'الشهر']].map(p => '<button type="button" data-per="' + p[0] + '" class="' + (st.period === p[0] ? 'on' : '') + '">' + p[1] + '</button>').join('') + '</div>';
    const monthsBar = st.period === 'month'
      ? '<div class="cp-months">' + availableMonths().map(m => '<button type="button" class="cp-tab' + (st.month === m ? ' on' : '') + '" data-month="' + m + '">' + eh(monthLabel(m)) + '</button>').join('') + '</div>'
      : '';
    const hero = '<div class="cp-hero"><small>عمولتك المؤكدة (' + (st.period === 'today' ? 'اليوم' : st.period === 'week' ? 'هذا الأسبوع' : eh(monthLabel(st.month))) + ')</small><b>' + money(s.total) + '</b>' +
      (s.pendN ? '<div class="pend"><span>+ ' + money(s.pend) + ' في انتظار تأكيدك (' + num(s.pendN) + ' مشوار)</span><button type="button" data-tab="review">راجع وأكّد</button></div>' : '<small>كل مشاويرك في الفترة دي متأكدة ✓</small>') + '</div>';

    const myRankRow = st.leaderboard.find(r => r.is_me);
    const rankTeaser = myRankRow
      ? '<div class="cp-motiv"><div><i class="fa-solid fa-trophy" style="color:#f59e0b;margin-inline-end:6px"></i>ترتيبك في الاستلامات والتسليم: <b>المركز #' + num(myRankRow.rank) + '</b> (' + num(myRankRow.total_trips) + ' مشوار)</div><button type="button" class="cp-btn cp-sm" style="background:#036b29;color:#ffffff" data-tab="rank">لوحة الترتيب</button></div>'
      : '<div class="cp-motiv"><div><i class="fa-solid fa-trophy" style="color:#f59e0b;margin-inline-end:6px"></i>شوف ترتيبك وسط زمايلك في الاستلامات والتسليم!</div><button type="button" class="cp-btn cp-sm" style="background:#036b29;color:#ffffff" data-tab="rank">فتح الترتيب</button></div>';

    const kpi = (k, icon, title, extra) => { const x = s[k]; return '<div class="cp-kpi"><small><i class="fa-solid ' + icon + '"></i>' + title + '</small><b>' + num(x.n) + ' مشوار</b><div class="m">' + money(x.camt) + ' مؤكدة</div>' + (x.pamt ? '<div class="p">+ ' + money(x.pamt) + ' في الانتظار</div>' : '') + (extra ? '<div class="s">' + extra + '</div>' : '') + '</div>'; };
    const grid = '<div class="cp-grid">' + kpi('pickup', 'fa-box-archive', 'استلمت', 'عمولة الاستلام') + kpi('delivery', 'fa-truck-fast', 'سلّمت', 'عمولة التسليم') +
      '<div class="cp-kpi wide"><small><i class="fa-solid fa-motorcycle"></i>مشاوير رسوم التوصيل</small><b>' + num(s.fee.n) + ' <span style="font-size:13px;font-weight:700;color:var(--mu)">مشوار</span></b><div class="m">' + money(s.fee.camt) + ' مؤكدة</div>' +
      (s.fee.pamt ? '<div class="p">+ ' + money(s.fee.pamt) + ' في الانتظار</div>' : '') + '<div class="s">ذهاب فقط: ' + num(s.one) + ' مشوار · ذهاب وعودة: ' + num(s.round) + ' مشوار</div></div></div>';
    const recent = st.items.slice(0, 6).map(it => '<div class="cp-card" style="padding:10px" data-act="detail" data-tx="' + eh(it.transaction_id) + '"><div class="cp-row"><div><div class="cp-name" style="font-size:14px">' + eh(it.client_name || 'بدون اسم') + '</div><div class="cp-sub">' + eh(kindLabel(it)) + ' · ' + eh(dayLabel(it.day)) + '</div></div><div style="text-align:end"><b>' + money(it.amount) + '</b><div><span class="cp-tag ' + (it.confirmed ? 'ok' : 'wt') + '">' + (it.confirmed ? 'مؤكد' : 'بانتظارك') + '</span></div></div></div></div>').join('');
    const load = !st.loaded ? '<div class="cp-empty">جاري التحميل…</div>' : '';
    return renderGuideBanner('home') + seg + monthsBar + hero + rankTeaser + grid + renderIntegratedLedgerSection() + '<div class="cp-h"><span>آخر مشاويرك (اضغط على العميل للتفاصيل)</span><button type="button" class="cp-a cp-sm" data-tab="trips">كل المشاوير</button></div>' + (recent || load || '<div class="cp-empty">لسه مفيش مشاوير متسجلة باسمك</div>');
  }

  document.addEventListener('input', function (ev) {
    var inp = ev.target;
    if (!inp || inp.id !== 'cp-home-search') return;
    st.homeSearch = String(inp.value || '').trim();
    if (st.tab === 'today') {
      var pos = inp.selectionStart;
      renderTab(false);
      var inp2 = $('cp-home-search');
      if (inp2) { inp2.focus(); try { inp2.setSelectionRange(pos, pos); } catch (e) {} }
    }
  });

  /* ---------- 2) مشاويري (تجميع ريكوستات نفس العميل + تفاصيل بالضغط) ---------- */
  /* ---------- شاشة «التيكتات» الموحّدة: قايمة واحدة (مشاوير + تيكتات استلام جديدة) + تقويم + فلاتر ---------- */
  const WF = [['all', 'الكل'], ['pickup', 'استلام'], ['delivery', 'تسليم'], ['confirmed', 'مؤكد'], ['pending', 'غير مؤكد'], ['fee', 'مشاوير']];
  const shiftMonth = (ym, n) => { const d = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1)); return d.toISOString().slice(0, 7); };
  function itemSteps(it) {
    if (it.confirmed) return 5;
    const tx = String(it.transaction_id);
    if (st.waitingMap[tx]) return 4;
    if (it.live_state === 'on_the_way' || routeIndexOf(tx) !== -1) return 3;
    if (Number(it.call_attempts || 0) > 0 || it.client_confirmed) return 2;
    return 1;
  }
  const workTickets = () => (typeof window.tsWorkTickets === 'function' ? window.tsWorkTickets() : []);
  function pickupTicketReadyForTrip(it) {
    if (!it || it.type !== 'pickup' || typeof window.tsCourierTicketStepForTx !== 'function') return false;
    const state = window.tsCourierTicketStepForTx(it.transaction_id);
    return !!(state && state.status === 'converted' && state.step === 'papers_received');
  }
  function dayDots() {
    const m = {};
    st.items.forEach(it => { const d = m[it.day] || (m[it.day] = { ok: 0, no: 0 }); if (it.confirmed) d.ok++; else d.no++; });
    const tk = workTickets();
    if (tk.length) { const t = today(); const d = m[t] || (m[t] = { ok: 0, no: 0 }); d.no += tk.length; }
    return m;
  }
  function calendarHtml() {
    const ym = st.calMonth || st.day.slice(0, 7), t = today(), dots = dayDots();
    const dim = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate();
    const lead = (new Date(ym + '-01T00:00:00Z').getUTCDay() + 1) % 7; /* الأسبوع بيبدأ السبت */
    let cells = '';
    for (let i = 0; i < lead; i++) cells += '<span></span>';
    for (let d = 1; d <= dim; d++) {
      const ds = ym + '-' + String(d).padStart(2, '0'), x = dots[ds] || { ok: 0, no: 0 };
      cells += '<button type="button" class="cpw-d' + (ds === st.day ? ' sel' : '') + (ds === t ? ' td' : '') + '" data-act="cal-day" data-day="' + ds + '">' +
        '<i class="dots"><b' + (x.ok ? ' class="g"' : '') + '></b><b' + (x.no ? ' class="r"' : '') + '></b></i>' + num(d) + '</button>';
    }
    return '<div class="cpw-cal">' +
      '<div class="cpw-calhead"><button type="button" class="cpn-ib" data-act="cal-next" aria-label="الشهر التالي">' + ic('fwd') + '</button><b>' + eh(monthLabel(ym)) + '</b>' +
      '<button type="button" class="cpn-ib" data-act="cal-prev" aria-label="الشهر السابق" style="transform:scaleX(-1)">' + ic('fwd') + '</button></div>' +
      '<div class="cpw-wk">' + ['س', 'ح', 'ن', 'ث', 'ر', 'خ', 'ج'].map(x => '<span>' + x + '</span>').join('') + '</div>' +
      '<div class="cpw-grid">' + cells + '</div>' +
      '<div class="cpw-key"><span><b class="g"></b>مؤكد</span><span><b class="r"></b>غير مؤكد</span></div>' +
    '</div>';
  }
  function workItemRow(g) {
    const it = g.items[0], open = st.openKey === g.key;
    const steps = Math.min.apply(null, g.items.map(itemSteps)), allConf = g.items.every(x => x.confirmed);
    return '<div class="cpw-card' + (open ? ' open' : '') + '">' +
      '<button type="button" class="cpw-head" data-act="trip-open" data-key="' + eh(g.key) + '" aria-expanded="' + (open ? 'true' : 'false') + '">' +
        '<span class="cpw-main"><strong>' + eh(g.client_name) + (g.items.length > 1 ? ' <em>· ' + num(g.items.length) + ' طلبات</em>' : '') + '</strong>' +
        '<small dir="ltr">' + eh(g.phone || '') + ' · ' + eh(it.transaction_id) + '</small></span>' +
        '<span class="cpw-tag' + (allConf ? ' ok' : '') + '">' + (allConf ? 'مؤكد' : eh(KIND[g.type] ? KIND[g.type].label : '')) + '</span>' +
        '<span class="cpw-chev">' + ic('chev', 18) + '</span></button>' +
      '<div class="cpw-bar"><i style="width:' + Math.round(steps / 5 * 100) + '%"></i></div>' +
      (open ? '<div class="cpw-body">' + tripGroupCard(g) + '</div>' : '') +
    '</div>';
  }
  function viewWork() {
    if (!st.day) st.day = today();
    const f = st.wf || 'all', isToday = st.day === today();
    const q = normAr((st.q || '').trim());
    const all = itemsOf(st.day);
    const tkAll = isToday ? workTickets() : [];
    const itemOk = i => f === 'all' || (f === 'confirmed' ? i.confirmed : f === 'pending' ? !i.confirmed : i.type === f);
    const tkOk = f === 'all' || f === 'pickup' || f === 'pending';
    const qItem = i => !q || normAr([i.client_name, i.transaction_id, i.phone, i.address, i.services, i.employee].map(x => String(x || '')).join(' ')).includes(q);
    const qTk = t => !q || normAr([t.client_name, t.sd_request_id, t.phone, t.address, t.zone].map(x => String(x || '')).join(' ')).includes(q);
    const rows = all.filter(i => itemOk(i) && qItem(i));
    const tks = tkOk ? tkAll.filter(qTk) : [];
    const cnt = k => all.filter(i => k === 'all' || (k === 'confirmed' ? i.confirmed : k === 'pending' ? !i.confirmed : i.type === k)).length +
      ((k === 'all' || k === 'pickup' || k === 'pending') ? tkAll.length : 0);
    const chips = '<div class="cpn-chips cpw-chips">' + WF.map(c => '<button type="button" class="cpn-chip' + (f === c[0] ? ' on' : '') + '" data-wf="' + c[0] + '">' + c[1] + ' ' + num(cnt(c[0])) + '</button>').join('') + '</div>';
    const calBtn = '<button type="button" class="cpw-calbtn" data-act="cal-toggle" aria-expanded="' + (st.calOpen ? 'true' : 'false') + '">' + ic('cal', 18) +
      '<span>' + eh(dayLabel(st.day)) + (isToday ? ' · النهارده' : '') + '</span><span class="cpw-chev">' + ic('chev', 18) + '</span></button>';
    const searchBar = '<div class="cpn-search">' + ic('search') +
      '<input id="cp-trip-q" type="text" value="' + eh(st.q) + '" placeholder="ابحث بالاسم أو التليفون أو رقم المعاملة" aria-label="بحث">' +
      (st.q ? '<button type="button" class="x" data-act="qclear" aria-label="مسح البحث">' + ic('x', 16) + '</button>' : '') + '</div>';
    const groups = groupItemsByClient(rows);
    const tkHtml = tks.length && typeof window.tsWorkTicketRows === 'function' ? window.tsWorkTicketRows(tks, st.openKey) : '';
    const empty = (!groups.length && !tks.length)
      ? '<div class="cp-empty">' + (st.loaded ? 'مفيش حاجة مطابقة في اليوم ده' : 'جاري التحميل…') + '</div>' : '';
    const startBtn = (isToday && all.some(i => !i.confirmed && i.type !== 'fee'))
      ? '<button type="button" class="ts-cta" style="width:100%;margin:8px 0" data-act="start-day">' + (st.routeTxIds.length ? 'رتّب خط السير من جديد' : 'ابدأ اليوم — جهّز خط السير') + '</button>' : '';
    return calBtn + (st.calOpen ? calendarHtml() : '') + searchBar + startBtn + chips +
      '<div class="cpw-list">' + tkHtml + groups.map(workItemRow).join('') + empty + '</div>';
  }

  function dayNav() {
    const t = today();
    return '<div class="cp-day"><button type="button" data-act="dprev">اليوم السابق</button><div class="t">' + eh(dayLabel(st.day)) + (st.day === t ? ' · النهارده' : '') + '</div>' +
      '<button type="button" data-act="dnext"' + (st.day >= t ? ' disabled' : '') + '>اليوم التالي</button></div>';
  }
  const itemsOf = d => st.items.filter(it => it.day === d);

  const KIND_IC = { pickup: ['pk', 'box'], delivery: ['dl', 'truck'], fee: ['fe', 'route'] };
  function tripRow(g) {
    const it = g.items[0], k = KIND_IC[g.type] || KIND_IC.pickup;
    const tot = g.items.reduce((a, x) => a + (Number(x.amount) || 0), 0);
    const allConf = g.items.every(x => x.confirmed);
    const open = st.openKey === g.key;
    return '<div class="cpn-li" data-act="trip-open" data-key="' + eh(g.key) + '"><div class="cpn-ico ' + k[0] + '">' + ic(k[1]) + '</div>' +
      '<div class="m"><div class="n">' + eh(g.client_name) + (g.items.length > 1 ? ' <span class="cpn-lbl">· ' + num(g.items.length) + ' طلبات</span>' : '') + '</div>' +
      '<div class="s cpn-num" dir="ltr" style="text-align:start">' + eh(it.transaction_id) + (g.phone ? ' · ' + eh(g.phone) : '') + '</div></div>' +
      '<div style="text-align:end"><div class="cpn-num" style="font-weight:700">' + money(tot) + '</div><span class="cpn-tag ' + (allConf ? 'ok' : 'wn') + '">' + (allConf ? 'مؤكد' : 'بانتظار') + '</span></div></div>' +
      (open ? '<div class="cpn-exp">' + tripGroupCard(g) + '</div>' : '');
  }
  function tripSections(groups) {
    const by = {};
    groups.forEach(g => { const zn = detectZoneAndCoords(g.items[0]).zone; (by[zn] = by[zn] || []).push(g); });
    return Object.keys(by).map(zn => {
      const gs = by[zn], n = gs.reduce((a, g) => a + g.items.length, 0);
      const tot = gs.reduce((a, g) => a + g.items.reduce((b, x) => b + (Number(x.amount) || 0), 0), 0);
      return '<div class="cpn-sec"><div class="cpn-sech"><span class="cpn-lbl">' + eh(zn) + ' · ' + num(n) + ' مشوار</span><span class="cpn-lbl">مجموع ' + money(tot) + '</span></div>' +
        '<div class="cpn-list">' + gs.map(tripRow).join('') + '</div></div>';
    }).join('');
  }
  function viewTrips() {
    const all = itemsOf(st.day), n = k => all.filter(i => k === 'all' || i.type === k).length;
    const chip = (attr, val, on, label, cnt) => '<button type="button" class="cpn-chip' + (on ? ' on' : '') + '" ' + attr + '="' + val + '">' + label + (cnt != null ? ' ' + num(cnt) : '') + '</button>';
    const chips = '<div class="cpn-chips">' +
      [['all', 'الكل'], ['pickup', 'استلام'], ['delivery', 'تسليم'], ['fee', 'رسوم']].map(t => chip('data-type', t[0], st.type === t[0], t[1], n(t[0]))).join('') +
      '</div><div class="cpn-chips" style="padding-top:0">' +
      [['all', 'كل الحالات', all.length], ['pending', 'غير مؤكد', all.filter(i => !i.confirmed).length], ['confirmed', 'مؤكد', all.filter(i => i.confirmed).length]].map(s2 => chip('data-sfilter', s2[0], st.statusFilter === s2[0], s2[1], s2[2])).join('') + '</div>';

    const head = '<div class="cpn-row" style="padding:6px 0 10px"><div style="flex:1"><div style="font-size:22px;font-weight:700">مشاويري</div><div style="font-size:12px;color:var(--mu)">' + eh(dayLabel(st.day)) + ' · ' + num(all.length) + ' مشوار</div></div>' +
      '<button type="button" class="cpn-ib" data-act="gsearch-toggle" aria-label="بحث شامل في كل الأيام">' + ic('search') + '</button>' +
      '<button type="button" class="cpn-ib" data-act="qr-scan" aria-label="مسح إيصال QR">' + ic('qr') + '</button></div>';
    const searchBar = '<div class="cpn-search">' + ic('search') +
      '<input id="cp-trip-q" type="text" value="' + eh(st.q) + '" placeholder="ابحث بالاسم أو التليفون أو رقم المعاملة" aria-label="بحث في المشاوير">' +
      (st.q ? '<button type="button" class="x" data-act="qclear" aria-label="مسح البحث">' + ic('x', 16) + '</button>' : '') + '</div>';

    const q = normAr((st.q || '').trim());
    const rows = all.filter(i => {
      if (st.type !== 'all' && i.type !== st.type) return false;
      if (st.statusFilter === 'pending' && i.confirmed) return false;
      if (st.statusFilter === 'confirmed' && !i.confirmed) return false;
      if (q) {
        const hay = normAr([i.client_name, i.transaction_id, i.phone, i.address, i.services, i.employee].map(x => String(x || '')).join(' '));
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const groups = groupItemsByClient(rows);

    const routeStepper = st.routeTxIds.length
      ? '<div class="cp-v12-stepper">' + st.routeTxIds.map((rtx, idx) => {
          const rit = byTx(rtx); if (!rit) return '';
          const rz = detectZoneAndCoords(rit);
          return '<div class="cp-v12-step' + (idx === 0 ? ' on' : '') + '" data-act="detail" data-tx="' + eh(rtx) + '">' + num(idx + 1) + '. ' + eh(rz.zone) + '</div>';
        }).join('') + '</div>'
      : '';
    const zonesMap = {};
    all.filter(x => !x.confirmed).forEach(x => {
      const zn = detectZoneAndCoords(x).zone;
      (zonesMap[zn] = zonesMap[zn] || []).push(x.transaction_id);
    });
    const zoneClusters = Object.keys(zonesMap).length
      ? '<div class="cpn-chips" style="padding:0 0 8px">' + Object.keys(zonesMap).map(zn =>
          '<button type="button" class="cpn-chip" data-act="v12-add-zone" data-zone="' + eh(zn) + '">' + ic('pin', 14) + eh(zn) + ' (' + num(zonesMap[zn].length) + ')</button>').join('') + '</div>'
      : '';
    const shiftBtn = (v, l) => '<button type="button" class="cpn-chip' + (st.shiftFilter === v ? ' on' : '') + '" data-act="v12-shift" data-val="' + v + '">' + l + '</button>';
    const mapToggleBar = '<div class="cpn-chips" style="padding:0 0 8px">' + shiftBtn('all', 'اليوم كله') + shiftBtn('am', ' صباحي') + shiftBtn('pm', ' مسائي') +
      '<button type="button" class="cpn-chip' + (st.mapMode ? ' on' : '') + '" data-act="v12-map-toggle">' + ic('nav', 14) + (st.mapMode ? 'عرض القائمة' : 'الخريطة الحية') + '</button></div>';
    const mapHtml = (st.mapMode && window.CourierV12) ? window.CourierV12.renderEmbeddedMap(rows, st.myPos, detectZoneAndCoords) : '';

    const pendRows = rows.filter(x => !x.confirmed);
    const rc = st.routeTxIds.filter(tx => { const it = byTx(tx); return it && !it.confirmed; }).length;
    const fab = (rc || pendRows.length)
      ? '<button type="button" class="cpn-btn p cpn-fab" data-act="' + (rc ? 'route-autosort' : 'route-all') + '">' + ic('route') + 'رتّب خط السير (' + num(rc || pendRows.length) + ')</button>'
      : '';
    const foot = (q || st.type !== 'all' || st.statusFilter !== 'all')
      ? '<div style="font-size:12px;color:var(--mu);text-align:center;padding:10px 0">' + num(rows.length) + ' نتيجة من ' + num(all.length) + ' · البحث الشامل في كل الأيام من زرار العدسة</div>' : '';
    return head + dayNav() + searchBar + chips + routeStepper + renderSmartRoutePanel() + mapToggleBar + zoneClusters + mapHtml +
      (groups.length ? tripSections(groups) : '<div class="cp-empty">' + (st.loaded ? 'مفيش مشاوير مطابقة في اليوم ده' : 'جاري التحميل…') + '</div>') + foot + fab;
  }

  function tripGroupCard(g) {
    if (g.items.length === 1) return singleTripCard(g.items[0]);
    const k = KIND[g.type];
    const totalAmt = g.items.reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const allConfirmed = g.items.every(x => x.confirmed);
    const anyNotClosed = g.items.some(isNotClosedByStaff);
    const firstTx = g.items[0].transaction_id;

    const links = [];
    if (g.phone) links.push(callBtns(g.phone));
    if (g.address || st.pins[firstTx]) links.push('<a class="cp-a" target="_blank" rel="noopener" href="' + eh(smartMapsUrl(g.items[0])) + '"><i class="fa-solid fa-location-dot"></i><span>' + eh(g.address || 'فتح اللوكيشن المثبت') + '</span></a>');
    const inRouteIdx = routeIndexOf(firstTx);
    links.push('<button type="button" class="cp-a' + (inRouteIdx !== -1 ? ' pri' : '') + '" data-act="route-toggle" data-tx="' + eh(firstTx) + '"><i class="fa-solid ' + (inRouteIdx !== -1 ? 'fa-check' : 'fa-plus') + '"></i><span>' + (inRouteIdx !== -1 ? 'في خط السير (محطة ' + num(inRouteIdx + 1) + ')' : 'ضيف لخط السير') + '</span></button>');
    if (!allConfirmed) links.push('<button type="button" class="cp-a" data-act="on-my-way" data-tx="' + eh(firstTx) + '">في طريقي</button>');
    links.push('<button type="button" class="cp-a" data-act="save-pin" data-tx="' + eh(firstTx) + '">' + (st.pins[firstTx] ? ' لوكيشن مثبت ✓' : ' حفظ اللوكيشن') + '</button>');

    const emp = g.employee ? '<div class="cp-emp"><span>الموظف المسؤول: <b>' + eh(g.employee) + '</b></span>' +
      (g.employee_phone ? '<a class="cp-a tel" href="' + eh(telHref(g.employee_phone)) + '"><i class="fa-solid fa-phone"></i><span>اتصال بالموظف</span></a>' : '') +
      (g.employee_id ? '<button type="button" class="cp-a" data-act="chat-emp" data-uid="' + eh(g.employee_id) + '" data-tx="' + eh(firstTx) + '"><i class="fa-solid fa-comment"></i><span>رسالة للموظف</span></button>' : '') + '</div>' : '';

    const txRowsHtml = g.items.map(it => {
      const [sl, sc] = txState(it);
      const notClosed = isNotClosedByStaff(it);
      const nBadge = noteBadgeHtml(it);
      return '<div class="cp-txitem">' +
        '<div style="min-width:0;flex:1">' +
          '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">' +
            '<b dir="ltr" style="font-size:12.5px">' + eh(it.transaction_id) + '</b>' +
            '<span class="cp-tag ' + sc + '">' + sl + '</span>' +
            (notClosed ? '<span class="cp-tag wt"><i class="fa-regular fa-clock"></i> الموظف لسه ما قفلش المعاملة</span>' : '') +
            nBadge +
          '</div>' +
          (it.services ? '<div style="font-size:11px;color:var(--mu);margin-top:3px">' + eh(it.services) + '</div>' : '') +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">' +
          '<b>' + money(it.amount) + '</b>' +
          '<button type="button" class="cp-a cp-sm" data-act="detail" data-tx="' + eh(it.transaction_id) + '">التفاصيل</button>' +
          (!it.confirmed ? '<button type="button" class="cp-a cp-sm pri" data-act="ask-one" data-type="' + eh(it.type) + '" data-ref="' + eh(itemRef(it)) + '" data-tx="' + eh(it.transaction_id) + '" data-amt="' + eh(it.amount) + '">' + (pickupTicketReadyForTrip(it) ? 'تأكيد مشوار الاستلام' : 'أكّد ده بس') + '</button>' : '<span class="cp-tag ok">✓ مؤكد</span>') +
          '<button type="button" class="cp-a cp-sm" data-act="note" data-tx="' + eh(it.transaction_id) + '">ملاحظة</button>' +
        '</div>' +
      '</div>';
    }).join('');

    return '<div class="cp-card">' +
      '<div class="cp-row">' +
        '<div data-act="detail" data-tx="' + eh(firstTx) + '">' +
          '<div class="cp-name">' + eh(g.client_name) + ' <span class="cp-tag k-pk">' + num(g.items.length) + ' ريكوستات</span></div>' +
          '<div class="cp-sub">اضغط على العميل أو أي ريكوست لعرض التفاصيل الكاملة</div>' +
        '</div>' +
        '<div style="text-align:end">' +
          '<b style="font-size:16px">' + money(totalAmt) + '</b>' +
          '<div style="margin-top:3px"><span class="cp-tag ' + (allConfirmed ? 'ok' : 'wt') + '">' + (allConfirmed ? '✓ كله مؤكد' : 'فيه ريكوستات بانتظارك') + '</span></div>' +
        '</div>' +
      '</div>' +
      '<div class="cp-chips">' +
        '<span class="cp-tag ' + k.cls + '"><i class="fa-solid ' + k.icon + '"></i><span>' + eh(k.label) + '</span></span>' +
        (anyNotClosed ? '<span class="cp-tag wt"><i class="fa-regular fa-clock"></i> الموظف لسه ما قفلش المعاملة</span>' : '') +
      '</div>' +
      (links.length ? '<div class="cp-info">' + links.join('') + '</div>' : '') +
      '<div class="cp-txlist">' + txRowsHtml + '</div>' +
      emp +
    '</div>';
  }

  function singleTripCard(it) {
    const k = KIND[it.type];
    const tx = String(it.transaction_id);
    const z = detectZoneAndCoords(it);
    const inRouteIdx = routeIndexOf(tx);
    const onway = it.live_state === 'on_the_way';
    const ticketReady = pickupTicketReadyForTrip(it);
    const waiting = !!st.waitingMap[tx] || ticketReady;
    const called = Number(it.call_attempts || 0) > 0 || !!it.client_confirmed;
    let distTxt = '';
    if (st.myPos && window.CourierV12) {
      const km = window.CourierV12.haversineKm(st.myPos.lat, st.myPos.lng, z.lat, z.lng);
      distTxt = km < 1 ? (Math.round(km * 1000) + ' م') : (km.toFixed(1) + ' كم');
    }
    const codAmt = Number(it.cod_remaining || 0);
    const pillCls = it.type === 'delivery' ? 'delivery' : (it.type === 'pickup' ? 'pickup' : 'fee');
    const pillTxt = it.type === 'delivery' ? 'تسليم' : (it.type === 'pickup' ? 'استلام' : 'رسوم');

    let doneUpTo = 1, curIdx = 2;
    if (it.confirmed) { doneUpTo = 5; curIdx = 6; }
    else if (waiting) { doneUpTo = 4; curIdx = 5; }
    else if (onway) { doneUpTo = 3; curIdx = 4; }
    else if (inRouteIdx !== -1) { doneUpTo = 3; curIdx = 4; }
    else if (called) { doneUpTo = 2; curIdx = 3; }

    const slideAttrs = ' data-act="v12-slide-confirm" data-type="' + eh(it.type) + '" data-ref="' + eh(itemRef(it)) + '" data-tx="' + eh(tx) + '" data-amt="' + eh(it.amount) + '"';
    let primaryBtn = '';
    if (it.confirmed) {
      primaryBtn = '<button type="button" class="ts-cta done" data-act="detail" data-tx="' + eh(tx) + '">✓ تم التأكيد · ' + eh(timeOf(it.confirmed_at)) + '</button>';
    } else if (waiting) {
      primaryBtn = '<button type="button" class="ts-cta done"' + slideAttrs + '>' + (ticketReady ? '✓ تأكيد مشوار الاستلام' : '✓ تأكيد ' + eh(k.sec)) + '</button>';
    } else if (onway) {
      primaryBtn = '<button type="button" class="ts-cta gold" data-act="v12-wait" data-tx="' + eh(tx) + '">وصلت عند العميل</button>';
    } else if (inRouteIdx !== -1) {
      primaryBtn = '<button type="button" class="ts-cta" data-act="on-my-way" data-tx="' + eh(tx) + '">' + ic('nav', 15) + ' ابدأ التحرك الآن</button>';
    } else {
      primaryBtn = '<button type="button" class="ts-cta" data-act="route-toggle" data-tx="' + eh(tx) + '">+ أضف لخط السير</button>';
    }

    return '<div class="ts-card cp-v12-card ' + eh(it.type) + (inRouteIdx !== -1 && !it.confirmed ? ' in-route' : '') + '">' +
      '<div class="ts-tc-top" data-act="detail" data-tx="' + eh(tx) + '">' +
        '<div style="min-width:0;flex:1">' +
          '<div class="ts-tc-client">' + eh(it.client_name || 'بدون اسم') + '</div>' +
          '<div class="ts-tc-id"><span dir="ltr">' + eh(tx) + '</span>' + (distTxt ? '<span>· ' + eh(distTxt) + '</span>' : '') + '<span>· ' + money(it.amount) + '</span></div>' +
        '</div>' +
        '<span class="ts-pill ' + pillCls + '">' + pillTxt + '</span>' +
      '</div>' +
      (it.services ? '<div class="ts-tc-svc" data-act="detail" data-tx="' + eh(tx) + '">' + eh(it.services) + '</div>' : '') +
      '<div class="ts-tc-loc" data-act="detail" data-tx="' + eh(tx) + '">' + ic('pin', 14) + '<span>' + eh(it.address || z.zone) + '</span></div>' +
      '<div class="ts-meta-row">' +
        (codAmt > 0 ? '<span class="ts-mchip cod">تحصيل ' + money(codAmt) + '</span>' : '<span class="ts-mchip paid">خالص الدفع</span>') +
        (inRouteIdx !== -1 ? '<span class="ts-mchip route">خط السير #' + num(inRouteIdx + 1) + '</span>' : '') +
        (onway ? '<span class="ts-mchip paid">في الطريق</span>' : (inRouteIdx !== -1 ? '<span class="ts-mchip">في خط السير</span>' : '')) +
        (it.office_ready ? '<span class="ts-mchip paid">جاهز بالمكتب</span>' : '') +
      '</div>' +
      buildFiveStepper(doneUpTo, curIdx) +
      (ticketReady && typeof window.tsCourierTicketDetailsHtml === 'function' ? window.tsCourierTicketDetailsHtml(tx) : '') +
      '<div class="ts-actions">' +
        primaryBtn +
        (it.phone ? '<a class="ts-cbtn call" data-act="v12-call-log" data-tx="' + eh(tx) + '" href="' + eh(telHref(it.phone)) + '" aria-label="اتصال">' + ic('phone', 17) + '</a>' : '') +
        '<button type="button" class="ts-cbtn" data-act="v12-map-opts" data-tx="' + eh(tx) + '" aria-label="الخريطة">' + ic('nav', 17) + '</button>' +
      '</div>' +
    '</div>';
  }

  function renderLeaderboardInner(rows) {
    if (!rows || !rows.length) {
      return '<div class="cp-empty">' + (st.lbLoaded ? 'لا توجد بيانات ترتيب في هذه الفترة' : 'جاري تحميل لوحة الترتيب…') + '</div>';
    }
    const me = rows.find(r => r.is_me);
    let motivHtml = '';
    if (me) {
      if (Number(me.rank) === 1 && Number(me.total_trips) > 0) {
        motivHtml = '<div class="cp-motiv"><span> ما شاء الله يا <b>' + eh(me.name) + '</b>! أنت في <b>المركز الأول</b> بإجمالي <b>' + num(me.total_trips) + ' مشوار</b>.</span></div>';
      } else {
        const above = rows.find(r => Number(r.rank) < Number(me.rank));
        const diff = above ? Math.max(1, Number(above.total_trips) - Number(me.total_trips) + 1) : 1;
        motivHtml = '<div class="cp-motiv"><span> مركزك الحالي <b>#' + num(me.rank) + '</b> (' + num(me.total_trips) + ' مشوار) — فاضلك <b>' + num(diff) + ' مشوار</b> وتتقدم للمركز اللي قبلك!</span></div>';
      }
    }

    const top1 = rows[0], top2 = rows[1], top3 = rows[2];
    const podCard = (r, cls, medal, lbl) => {
      if (!r) return '<div class="cp-pod" style="opacity:.4"><span class="cp-pod-medal">' + medal + '</span><div class="cp-pod-nm">—</div></div>';
      return '<div class="cp-pod ' + cls + (r.is_me ? ' me' : '') + '">' +
        '<span class="cp-pod-medal">' + medal + '</span>' +
        '<div class="cp-pod-nm">' + eh(r.name) + (r.is_me ? ' ⭐' : '') + '</div>' +
        '<div class="cp-pod-tot">' + num(r.total_trips) + ' مشوار<small>إجمالي المشاوير</small></div>' +
        '<div class="cp-pod-sub">' +
          '<span>استلام ' + num(r.pickups) + '</span>' +
          '<span>تسليم ' + num(r.deliveries) + '</span>' +
        '</div>' +
        '<div style="font-size:10px;color:var(--mu);margin-top:4px">' + lbl + '</div>' +
      '</div>';
    };
    const podium = rows.length >= 2
      ? '<div class="cp-podium">' + podCard(top2, 'r2', '', 'المركز الثاني') + podCard(top1, 'r1', '', 'المركز الأول') + podCard(top3, 'r3', '', 'المركز الثالث') + '</div>'
      : '';

    const listHtml = rows.map(r => {
      const rk = Number(r.rank) || 1;
      const rkCls = rk === 1 ? 'r1' : rk === 2 ? 'r2' : rk === 3 ? 'r3' : '';
      const medal = rk === 1 ? '' : rk === 2 ? '' : rk === 3 ? '' : '#' + num(rk);
      return '<div class="cp-lb-row' + (r.is_me ? ' me' : '') + '">' +
        '<div class="cp-lb-rk ' + rkCls + '">' + medal + '</div>' +
        '<div class="cp-lb-info">' +
          '<b>' + eh(r.name) + (r.is_me ? ' <span class="cp-tag ok">أنت</span>' : '') + '</b>' +
          '<div class="cp-lb-stats">' +
            '<span class="cp-tag k-pk">استلام: ' + num(r.pickups) + ' مشوار</span>' +
            '<span class="cp-tag k-dl">تسليم: ' + num(r.deliveries) + ' مشوار</span>' +
            (Number(r.fee_trips) ? '<span class="cp-tag k-fe">توصيل: ' + num(r.fee_trips) + ' مشوار</span>' : '') +
            '<span>المؤكد: ' + num(r.confirmed_trips) + ' من ' + num(r.total_trips) + ' مشوار</span>' +
          '</div>' +
        '</div>' +
        '<div class="cp-lb-tot"><b>' + num(r.total_trips) + '</b><small>مشوار</small></div>' +
      '</div>';
    }).join('');

    return motivHtml + podium + '<div class="cp-h"><span>ترتيب الاستلامات والتسليم بالتفصيل</span><span>' + num(rows.length) + ' مندوب</span></div>' + listHtml;
  }

  function viewLeaderboard() {
    const seg = '<div class="cp-seg">' + [
      ['today', 'اليوم'],
      ['week', 'هذا الأسبوع'],
      ['month', 'هذا الشهر']
    ].map(p => '<button type="button" data-lbper="' + p[0] + '" class="' + (st.lbPeriod === p[0] ? 'on' : '') + '">' + p[1] + '</button>').join('') + '</div>';
    return '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px"><b>ترتيب المندوبين</b><button type="button" class="cp-a cp-sm" data-tab="account">رجوع لحسابي</button></div>' + renderGuideBanner('rank') + seg + renderLeaderboardInner(st.leaderboard);
  }

  /* ---------- 4) المراجعة (تأكيد آخر اليوم: مجمع بالعميل + أكّد ده بس + أبلغت الموظف) ---------- */
  function viewReview() {
    const t = today();
    const old = {}; st.items.forEach(i => { if (!i.confirmed && i.day < t) old[i.day] = (old[i.day] || 0) + 1; });
    const oldDays = Object.keys(old).sort().reverse().slice(0, 6).filter(d => d !== st.day);
    const oldBox = oldDays.length ? '<div class="cp-old"><i class="fa-solid fa-triangle-exclamation"></i> عندك أيام قبل كده لسه ما اتأكدتش (اضغط على اليوم لمراجعته):<br>' + oldDays.map(d => '<button type="button" class="cp-a" data-act="dset" data-day="' + d + '">' + eh(dayLabel(d)) + ' (' + num(old[d]) + ' مشوار)</button>').join('') + '</div>' : '';
    const all = itemsOf(st.day);
    st.sel = st.sel || {};
    const selKeys = Object.keys(st.sel).filter(k => all.some(i => !i.confirmed && (i.type + '|' + itemRef(i)) === k));
    const selAmt = selKeys.reduce((a, k) => a + Number(st.sel[k].amt || 0), 0);
    const sumC = all.filter(i => i.confirmed).reduce((a, i) => a + Number(i.amount || 0), 0);
    const sumP = all.filter(i => !i.confirmed).reduce((a, i) => a + Number(i.amount || 0), 0);
    const closed = all.filter(i => !i.confirmed && !isNotClosedByStaff(i)).length;
    const head = '<div style="padding:6px 0 4px;font-size:22px;font-weight:700">مراجعة اليوم</div>';
    const summary = '<div class="cpn-card cpn-sum3" style="margin-top:6px;padding:14px"><div><span class="cpn-lbl">مؤكد</span><b style="color:var(--ok)">' + num(sumC) + '</b></div>' +
      '<div><span class="cpn-lbl">بانتظارك</span><b style="color:var(--wn)">' + num(sumP) + '</b></div><div><span class="cpn-lbl">المقفل</span><b>' + num(closed) + '</b></div></div>';

    const renderRevItem = i => {
      const notClosed = isNotClosedByStaff(i), key = i.type + '|' + itemRef(i), on = !!st.sel[key];
      const chk = i.confirmed
        ? '<span class="cpn-chk dn">' + ic('check', 16) + '</span>'
        : '<button type="button" class="cpn-chk' + (on ? ' on' : '') + '" data-act="sel-toggle" data-type="' + eh(i.type) + '" data-ref="' + eh(itemRef(i)) + '" data-amt="' + eh(i.amount) + '" aria-label="اختيار">' + (on ? ic('check', 16) : '') + '</button>';
      return '<div class="cpn-li" style="cursor:default;align-items:flex-start">' + chk +
        '<div class="m"><div class="n" data-act="detail" data-tx="' + eh(i.transaction_id) + '" style="cursor:pointer">' + eh(i.client_name || 'بدون اسم') + '</div>' +
        '<div class="s cpn-num" dir="ltr" style="text-align:start">' + eh(i.transaction_id) + '</div>' +
        '<div class="cpn-row" style="flex-wrap:wrap;gap:5px;margin-top:5px">' +
          (i.type === 'fee' ? '<span class="cpn-chip" style="height:22px;font-size:11px">' + (i.fee_kind === 'round' ? 'ذهاب وعودة' : 'ذهاب فقط') + '</span>' : '') +
          (notClosed ? '<span class="cpn-tag wn">الموظف لسه ما قفلش</span>' : '') + noteBadgeHtml(i) +
          (!i.confirmed ? '<button type="button" class="cpn-chip" style="height:26px;font-size:11px;padding:0 9px" data-act="ask-one" data-type="' + eh(i.type) + '" data-ref="' + eh(itemRef(i)) + '" data-tx="' + eh(i.transaction_id) + '" data-amt="' + eh(i.amount) + '">أكّد ده بس</button>' : '') +
          '<button type="button" class="cpn-chip" style="height:26px;font-size:11px;padding:0 9px" data-act="note" data-tx="' + eh(i.transaction_id) + '">ملاحظة</button>' +
        '</div></div><b class="cpn-num">' + money(i.amount) + '</b></div>';
    };
    const sec = k => {
      const rows = all.filter(i => i.type === k); if (!rows.length) return '';
      const pend = rows.filter(i => !i.confirmed), ptot = pend.reduce((a, i) => a + Number(i.amount || 0), 0);
      const last = rows.filter(i => i.confirmed_at).map(i => i.confirmed_at).sort().pop();
      const groupsHtml = groupItemsByClient(rows).map(g => {
        if (g.items.length === 1) return renderRevItem(g.items[0]);
        const gTot = g.items.reduce((a, x) => a + Number(x.amount || 0), 0);
        return '<div style="background:var(--bg)"><div class="cpn-row" style="justify-content:space-between;padding:8px 14px 0"><span class="cpn-lbl">' + eh(g.client_name) + ' · ' + num(g.items.length) + ' ريكوستات</span><span class="cpn-lbl">إجمالي العميل ' + money(gTot) + '</span></div></div>' + g.items.map(renderRevItem).join('');
      }).join('');
      return '<div class="cpn-sec"><div class="cpn-sech"><span class="cpn-lbl">' + KIND[k].sec + ' · ' + num(rows.length) + '</span>' +
        (pend.length ? '<button type="button" class="cpn-lbl" style="background:none;border:0;cursor:pointer;color:var(--ac)" data-act="sel-all" data-kind="' + k + '">اختار الكل</button>' : '<span class="cpn-tag ok">اتأكد' + (last ? ' ' + eh(timeOf(last)) : '') + '</span>') + '</div>' +
        '<div class="cpn-list">' + groupsHtml + '</div>' +
        (pend.length ? '<button type="button" class="cpn-btn" style="width:100%;margin-top:8px" data-act="ask" data-kind="' + k + '" data-n="' + pend.length + '" data-amt="' + ptot + '">' + eh(KIND[k].btn) + ' للكل (' + num(pend.length) + ' · ' + money(ptot) + ')</button>' : '') + '</div>';
    };
    const body = ['pickup', 'delivery', 'fee'].map(sec).join('');
    const bar = selKeys.length ? '<div class="cpn-bar"><button type="button" class="cpn-btn p" style="width:100%;min-height:52px" data-act="confirm-sel">' + ic('check') + 'تأكيد ' + num(selKeys.length) + ' مشاوير · ' + money(selAmt) + '</button></div>' : '';
    return renderGuideBanner('review') + head + dayNav() + oldBox + summary + (body || '<div class="cp-empty">' + (st.loaded ? 'مفيش مشاوير مسجلة في اليوم ده' : 'جاري التحميل…') + '</div>') + bar;
  }

  /* ---------- 5) التواصل (مع علامات القراءة: ✓ اتبعتت / ✓✓ اتقرت) ---------- */
  const online = c => c.last_seen_at && (Date.now() - new Date(c.last_seen_at).getTime()) < 3 * 60 * 1000;
  function viewChat() {
    const b = $('cp-body'); if (!b) return;
    if (st.chat) return convView();
    const rows = st.contacts.map(c => {
      const nm = c.full_name || 'موظف';
      return '<div class="cp-card"><div class="cp-ct" data-act="chat-open" data-uid="' + eh(c.id) + '"><div class="cp-av">' + eh(nm.trim().charAt(0).toUpperCase()) + '<i class="' + (online(c) ? 'on' : '') + '"></i></div>' +
        '<div class="m"><b>' + eh(nm) + (c.is_manager ? ' <span class="cp-tag ok">المدير</span>' : '') + '</b><small>' + eh(c.last_body ? ((c.last_sender === st.me.user_id ? 'أنت: ' : '') + c.last_body) : (c.job_title || 'موظف')) + '</small>' +
        '<small>' + (online(c) ? ' متصل الآن' : (c.last_seen_at ? 'آخر ظهور ' + eh(timeOf(c.last_seen_at)) : '')) + '</small></div>' +
        (Number(c.unread) ? '<span class="cp-ub">' + num(c.unread) + '</span>' : '') + '</div>' +
        (c.phone ? '<div class="cp-info">' + callBtns(c.phone, 'اتصال') + '</div>' : '') + '</div>';
    }).join('');
    let qn = 0;
    try { const uid = st.me && st.me.user_id; qn = (JSON.parse(localStorage.getItem('cp_v12_offline_queue') || '[]') || []).filter(x => !x.uid || x.uid === uid).length; } catch (e) { /* */ }
    const officeOn = st.contacts.some(online);
    const head = '<div style="padding:6px 0 8px"><div style="font-size:22px;font-weight:700">التواصل</div><div class="cpn-st"><i style="background:' + (officeOn ? 'var(--ok)' : 'var(--mu)') + '"></i>' + (officeOn ? 'المكتب متصل' : 'المكتب مش متصل دلوقتي') + ' · شات خاص بينك وبين الإدارة</div></div>';
    const offBar = qn ? '<div class="cpn-warnbar">' + ic('cloud') + '<span style="flex:1">' + num(qn) + ' عمليات محفوظة وهتتبعت أول ما النت يرجع</span><span class="cpn-lbl">مندوب: ' + eh(((st.me && st.me.name) || '').split(' ')[0]) + '</span></div>' : '';
    const tool = (act, id, cls, icn, label) => '<button type="button" class="cpn-tool" data-act="' + act + '"' + (id ? ' id="' + id + '"' : '') + '><span class="ti ' + cls + '">' + ic(icn) + '</span>' + label + '</button>';
    const tools = '<div class="cpn-tools">' + tool('voice-cmd', '', '', 'mic', 'مساعد صوتي') + tool('qr-scan', '', '', 'qr', 'مسح QR') + tool('send-loc', '', 'ok', 'pin', 'ابعت موقعي') + tool('break-toggle', 'cp-break-btn', 'wn', 'pause', st.onBreak ? 'إنهاء الاستراحة' : 'استراحة') + '</div>';
    const lbAll = (st.leaderboard || []).slice().sort((a, c) => (a.rank || 99) - (c.rank || 99));
    let lbShow = lbAll.slice(0, 3);
    const meRow = lbAll.find(r => r.is_me);
    if (meRow && !lbShow.includes(meRow)) lbShow = lbAll.slice(0, 2).concat([meRow]);
    const lb = lbShow.length > 1
      ? '<div class="cpn-card" style="margin-top:12px;padding:12px 14px"><div class="cpn-row" style="justify-content:space-between;margin-bottom:8px"><span class="cpn-lbl">ترتيب المناديب · عدد المشاوير</span><span style="color:var(--wn)">' + ic('trophy', 18) + '</span></div>' +
        '<div class="cpn-lb" data-tab="rank">' + lbShow.map(r => '<div class="' + (r.is_me ? 'me' : '') + '"><div class="a">' + eh(String(r.name || 'م').trim().charAt(0)) + '</div><div style="' + (r.is_me ? 'font-weight:700' : '') + '">' + (r.is_me ? 'أنت · ' : '') + eh(String(r.name || '').split(' ').slice(0, 2).join(' ')) + '</div><div class="cpn-lbl cpn-num">' + num(r.total_trips) + '</div></div>').join('') + '</div></div>'
      : '';
    b.innerHTML = renderGuideBanner('chat') + head + offBar + tools + lb + '<div class="cpn-sec">' + (rows || '<div class="cp-empty">' + (st.loaded ? 'مفيش جهات اتصال' : 'جاري التحميل…') + '</div>') + '</div>';
  }
  function convView() {
    const b = $('cp-body'), c = st.chat; if (!b) return;
    b.innerHTML = '<div class="cp-chat"><div class="cp-chead"><button type="button" class="cp-btn cp-sm" data-act="chat-back">رجوع للقائمة</button><b>' + eh(c.name) + '</b>' + (c.phone ? callBtns(c.phone, '') : '') + '</div>' +
      '<div class="cp-msgs" id="cp-msgs"></div>' + (c.tx ? '<div class="cp-sub" style="margin-top:6px">بخصوص معاملة <b>' + eh(c.tx) + '</b> <button type="button" class="cp-a cp-sm" data-act="chat-notx">إلغاء الإشارة</button></div>' : '') +
      '<div class="cpn-qr">' + ['وصلت', 'العميل مش بيرد', 'متأخر 10 دقايق', 'تم التسليم'].map(x => '<button type="button" class="cpn-chip" style="height:34px;border:1px solid var(--bd);cursor:pointer" data-act="qreply" data-t="' + x + '">' + x + '</button>').join('') + '</div>' +
      '<div class="cp-comp"><textarea id="cp-msg" class="cp-field" rows="1" placeholder="اكتب رسالتك للمكتب…">' + eh(st.draft) + '</textarea><button type="button" class="cp-btn cp-go" data-act="chat-send" aria-label="إرسال">' + ic('send') + '</button></div></div>';
    paintMsgs(true);
    const t = $('cp-msg'); if (t) { t.addEventListener('input', () => { st.draft = t.value; t.style.height = 'auto'; t.style.height = Math.min(110, t.scrollHeight) + 'px'; }); }
  }
  function paintMsgs(force) {
    const m = $('cp-msgs'); if (!m) return;
    const near = force || (m.scrollHeight - m.scrollTop - m.clientHeight < 80);
    const html = st.msgs.length ? st.msgs.map(x => {
      const readTag = x.mine
        ? '<span class="rd-st">' + (x.read ? '✓✓ اتقرت' : '✓ اتبعتت') + '</span>'
        : '';
      return '<div class="cp-m ' + (x.mine ? 'me' : 'th') + '">' +
        (x.tx_id ? '<span class="tx">معاملة ' + eh(x.tx_id) + '</span><br>' : '') +
        eh(x.body) +
        '<small><span>' + eh(timeOf(x.created_at)) + '</span>' + readTag + '</small>' +
      '</div>';
    }).join('') : '<div class="cp-empty">ابدأ المحادثة…</div>';
    if (m.dataset.h !== html) {
      m.dataset.h = html;
      m.innerHTML = html;
      if (near) m.scrollTop = m.scrollHeight;
    }
  }
  async function openChat(uid, tx) {
    const c = st.contacts.find(x => x.id === uid); if (!c) return;
    try {
      let ch = c.channel_id;
      if (!ch) { const r = await sbClient.rpc('courier_dm', { p_other: uid }); if (r.error) throw r.error; ch = r.data; c.channel_id = ch; }
      st.chat = { uid: uid, name: c.full_name || 'موظف', ch: ch, phone: c.phone, tx: tx || null }; st.msgs = []; st.msig = ''; st.tab = 'chat'; renderNav(); convView();
      await pollMsgs(true);
    } catch (e) { toast(errMsg(e), true); }
  }
  async function pollMsgs(first) {
    const c = st.chat; if (!c) return;
    try {
      /* بنجيب آخر رسايل القناة عشان علامة القراءة (read) تتحدث فوراً لما الطرف التاني يقرأ الرسالة */
      const r = await sbClient.rpc('courier_chat_messages', { p_channel: c.ch, p_after: null });
      if (r.error) throw r.error; setOffline(false);
      if (!st.chat || st.chat.ch !== c.ch) return;
      const list = Array.isArray(r.data) ? r.data : [];
      const sig = JSON.stringify(list);
      if (first || sig !== st.msig) {
        const hadIncoming = list.some(x => !x.mine && !st.msgs.some(o => o.id === x.id));
        st.msig = sig;
        st.msgs = list;
        paintMsgs(first);
        if (first || hadIncoming) {
          sbClient.rpc('courier_chat_read', { p_channel: c.ch });
          const k = st.contacts.find(x => x.channel_id === c.ch);
          if (k) k.unread = 0;
          renderNav();
        }
      }
    } catch (e) { setOffline(true); }
  }
  async function sendMsg() {
    const c = st.chat, t = $('cp-msg'); if (!c || !t) return;
    const body = t.value.trim(); if (!body || st.busy) return;
    st.busy = true;
    const tmp = { id: 'tmp' + Date.now(), body: body, created_at: new Date().toISOString(), mine: true, read: false, tx_id: c.tx };
    st.msgs.push(tmp); paintMsgs(true); t.value = ''; st.draft = ''; t.style.height = 'auto';
    try {
      const r = await sbClient.rpc('courier_chat_send', { p_channel: c.ch, p_body: body, p_tx: c.tx }); if (r.error) throw r.error;
      c.tx = null; await pollMsgs(true); loadContacts(true);
    } catch (e) { st.msgs = st.msgs.filter(x => x !== tmp); paintMsgs(false); t.value = body; st.draft = body; toast(errMsg(e), true); }
    st.busy = false;
  }

  /* ---------- تحميل البيانات (من غير رمشة) ---------- */
  function setOffline(v) { st.offline = v; const e = $('cp-off'); if (e) e.classList.toggle('on', !!v); }
  async function loadItems(silent) {
    if (st.itemsLoading) return st.itemsLoading;
    st.itemsLoading = (async () => {
      try {
        const t = today(), r = await sbClient.rpc('courier_items', { p_from: monthStart(t), p_to: t });
        if (r.error) throw r.error;
        setOffline(false);
        const rawData = Array.isArray(r.data) ? r.data : []; const data = rawData.filter(x => x && (x.type === 'fee' || Number(x.lines) > 0 || (x.client_name && String(x.client_name).trim() && String(x.client_name).trim() !== 'بدون اسم'))); const sig = JSON.stringify(data);
        st.loaded = true;
        st.lastSync = Date.now();
        if (sig !== st.sig) { st.sig = sig; st.items = data; renderNav(); if (st.tab !== 'chat') renderTab(false); }
        return true;
      } catch (e) {
        if (!navigator.onLine) setOffline(true);
        else setOffline(false);
        if (!silent) toast(errMsg(e), true);
        return false;
      }
    })();
    const result = await st.itemsLoading;
    st.itemsLoading = null;
    return result;
  }

  async function refreshPortal(btn) {
    if (st.refreshing) return;
    st.refreshing = true;
    if (btn) btn.disabled = true;
    const ok = await loadItems(false);
    await Promise.all([loadMyNotes(), loadLeaderboard(true), loadContacts(true)]);
    st.refreshing = false;
    if (btn && btn.isConnected) btn.disabled = false;
    if (ok) toast('تم تحديث بيانات المشاوير ✓');
    else toast('تعذر تحديث المشاوير. راجع الاتصال وحاول تاني.', true);
  }
  async function loadMyNotes() {
    try {
      const r = await sbClient.rpc('courier_my_notes');
      if (r.error || !Array.isArray(r.data)) return;
      const sig = JSON.stringify(r.data);
      if (sig !== st.nsig) {
        st.nsig = sig;
        const m = {};
        r.data.forEach(x => { if (x && x.transaction_id && !m[x.transaction_id]) m[x.transaction_id] = x; });
        st.notesMap = m;
        if (st.tab === 'trips' || st.tab === 'review') renderTab(false);
      }
    } catch (e) { /* لو الدالة لسه متشغلتش منوقفش الشاشة */ }
  }
  async function loadLeaderboard(silent) {
    try {
      const rng = rangeOf(st.lbPeriod);
      const r = await sbClient.rpc('courier_leaderboard', { p_from: rng[0], p_to: rng[1] });
      if (r.error) {
        if (!st.leaderboard.length && st.me) {
          const s = stats(rng);
          st.leaderboard = [{
            id: st.me.id, name: st.me.name, is_me: true, rank: 1,
            pickups: s.pickup.n, deliveries: s.delivery.n, fee_trips: s.fee.n,
            total_trips: s.pickup.n + s.delivery.n + s.fee.n,
            confirmed_trips: s.pickup.cn + s.delivery.cn + s.fee.cn
          }];
          st.lbLoaded = true;
          if (st.tab === 'rank' || st.tab === 'home') renderTab(false);
        }
        return;
      }
      const data = Array.isArray(r.data) ? r.data : [], sig = st.lbPeriod + ':' + JSON.stringify(data);
      st.lbLoaded = true;
      if (sig !== st.lbsig) {
        st.lbsig = sig; st.leaderboard = data;
        if (st.tab === 'rank' || st.tab === 'home') renderTab(false);
      }
    } catch (e) { if (!silent) toast(errMsg(e), true); }
  }
  async function loadContacts(silent) {
    try {
      const r = await sbClient.rpc('courier_contacts'); if (r.error) throw r.error; setOffline(false);
      const data = Array.isArray(r.data) ? r.data : [], sig = JSON.stringify(data);
      if (sig !== st.csig) {
        const u0 = unreadTotal(); st.csig = sig; st.contacts = data; const u1 = unreadTotal();
        renderNav(); if (st.tab === 'chat' && !st.chat) viewChat();
        if (u1 > u0 && st.loaded && !(st.chat)) toast('وصلتك رسالة جديدة ');
      }
    } catch (e) { if (!silent) toast(errMsg(e), true); }
  }
  async function checkPendingReminders(force) {
    if (!st.me || (!force && Date.now() - st.pendingReminderCheck < 15 * 60 * 1000)) return;
    st.pendingReminderCheck = Date.now();
    try {
      /* يطلق فحص التذكير داخل الجلسة عبر دالة SECURITY DEFINER متوافقة مع سياسة courier_block */
      let newCount = 0;
      try {
        const pr = await sbClient.rpc('courier_pending_reminders');
        if (!pr.error && typeof pr.data === 'number') newCount = pr.data;
      } catch (e) { /* optional until migration is applied */ }

      const q = await sbClient.rpc('courier_ops_notifications', { p_limit: 20 });
      if (q.error) {
        if (newCount > 0) toast('عندك ' + num(newCount) + ' مشوار أو رسوم توصيل محتاجة تأكيد');
        return;
      }
      const list = Array.isArray(q.data) ? q.data : [];
      const pending = list.filter(x => !x.read && (x.title === 'تذكير: عندك مشوار غير مؤكد' || x.title === 'تذكير: عندك رسوم توصيل غير مؤكدة'));
      if (pending.length) {
        toast(pending[0].body || ('عندك ' + num(pending.length) + ' تذكير لمشاوير أو رسوم توصيل محتاجة تأكيد'));
        await Promise.all(pending.map(x => sbClient.rpc('courier_ops_notification_read', { p_notification_id: Number(x.id) }).catch(() => null)));
      }
    } catch (e) { /* لا نعطل البوابة إذا لم تُشغّل migration بعد */ }
  }
  function tick() {
    st.tick++; tickClock();
    if (document.hidden || !st.me) return;
    if (st.chat && st.tick % 4 === 0) pollMsgs(false);
    if (st.tick % 30 === 0) { loadItems(true); loadMyNotes(); loadContacts(true); sbClient.rpc('courier_v12_my_pings').then(r => { if (r && Array.isArray(r.data)) { st.urgentPings = r.data; renderTopBanners(); } }).catch(() => null); }
    if (st.tick % 90 === 0) loadLeaderboard(true);
    if (st.tick % 60 === 0) {
      sbClient.rpc('touch_last_seen');
      if (typeof window.tsRefreshCourierTickets === 'function') window.tsRefreshCourierTickets();
    }
    if (st.tick % 900 === 0) checkPendingReminders(false);
  }

  /* ---------- مودالات: تفاصيل العميل (A.2) + التأكيد الفردي (B.1) + الملاحظة (B.3/B.4) + ملفي الشخصي ---------- */
  function modal(html, sheet) { const r = $('cp-modal-root'); if (!r) return; r.innerHTML = '<div class="cp-modal' + (sheet ? ' cpn-sheet' : '') + '" data-act="mclose"><div class="' + (sheet ? 'cpn-sheetbox' : 'cp-box') + '">' + html + '</div></div>'; swapFa(r); const f = r.querySelector('textarea,input'); if (f) setTimeout(() => f.focus(), 60); }
  const closeModal = () => { const r = $('cp-modal-root'); if (r) r.innerHTML = ''; };
  const byTx = tx => st.items.find(o => String(o.transaction_id) === String(tx));

  const STATUS_AR = {
    'Delivered': ['تم التسليم', 'gy'],
    'Complete': ['مكتملة (جاهزة للتسليم)', 'ok'],
    'Under Review': ['تحت المراجعة', 'wt'],
    'In Progress': ['جاري التنفيذ', 'k-pk'],
    'Pending Exec': ['بانتظار المنفذ', 'wt'],
    'Pending Client': ['بانتظار العميل', 'wt']
  };

  /* مودال تفاصيل العميل والمعاملة (البند A.2) — بدون أي أسعار عميل أو مدفوعات */
  async function openClientDetail(tx) {
    const fallbackItem = byTx(tx);
    const ticketStepState = typeof window.tsCourierTicketStepForTx === 'function' ? window.tsCourierTicketStepForTx(tx) : null;
    const ticketReachedCustomer = !!(fallbackItem && (fallbackItem.live_state === 'waiting' || fallbackItem.confirmed)) ||
      !!(ticketStepState && (ticketStepState.step === 'waiting' || ticketStepState.step === 'papers_received'));
    const sameClientItems = fallbackItem
      ? st.items.filter(x => normAr(x.client_name) === normAr(fallbackItem.client_name) && x.day === fallbackItem.day)
      : [];

    modal('<h3>تفاصيل العميل والمعاملة</h3><p>جاري تحميل بيانات المعاملة <b dir="ltr">' + eh(tx) + '</b>…</p><div class="cp-btns"><button type="button" class="cp-btn" data-act="mclose-btn">إغلاق</button></div>');

    let d = null;
    try {
      const r = await sbClient.rpc('courier_tx_detail', { p_tx: String(tx) });
      if (!r.error && r.data) d = r.data;
    } catch (e) { /* نستخدم البيانات المتاحة في الذاكرة كـ fallback لو الدالة لسه متشغلتش */ }

    const clientName = (d && d.client_name) || (fallbackItem && fallbackItem.client_name) || 'بدون اسم';
    const phone = (d && d.phone) || (fallbackItem && fallbackItem.phone) || '';
    const address = (d && d.address) || (fallbackItem && fallbackItem.address) || '';
    const employee = (d && d.employee) || (fallbackItem && fallbackItem.employee) || '';
    const empId = (d && d.employee_id) || (fallbackItem && fallbackItem.employee_id) || '';
    const empPhone = (d && d.employee_phone) || (fallbackItem && fallbackItem.employee_phone) || '';
    const lines = (d && Array.isArray(d.lines)) ? d.lines : [];
    const trips = (d && Array.isArray(d.trips)) ? d.trips : [];
    const notes = (d && Array.isArray(d.notes)) ? d.notes : [];

    const notClosed = fallbackItem ? isNotClosedByStaff(fallbackItem) : lines.some(l => !l.delivered || l.under_review);

    /* التبديل السريع بين ريكوستات نفس العميل لو ليه كذا ريكوست */
    const switcherHtml = sameClientItems.length > 1
      ? '<div class="cp-dtl-sec"><b class="hd">ريكوستات العميل ده في نفس اليوم (' + num(sameClientItems.length) + ' ريكوستات):</b><div class="cp-chips">' +
          sameClientItems.map(it => '<button type="button" class="cp-a cp-sm' + (String(it.transaction_id) === String(tx) ? ' pri' : '') + '" data-act="detail" data-tx="' + eh(it.transaction_id) + '">' + eh(it.transaction_id) + ' (' + eh(KIND[it.type].label) + ')</button>').join('') +
        '</div></div>'
      : '';

    const contactLinks = [];
    if (phone) contactLinks.push(callBtns(phone));
    if (address) contactLinks.push('<a class="cp-a" target="_blank" rel="noopener" href="' + eh(mapsUrl(address)) + '"><i class="fa-solid fa-location-dot"></i><span>خريطة: ' + eh(address) + '</span></a>');

    const svcNames = lines.length
      ? lines.map(l => l.service).filter(Boolean).join(' + ')
      : ((fallbackItem && fallbackItem.services) || '—');
    const docNotes = lines.length
      ? lines.map(l => l.notes).filter(Boolean).join(' · ')
      : '';
    const linesHtml =
      '<div class="ts7b-kv"><span class="ts7b-kv-k">اسم العميل</span><div class="ts7b-kv-v">' + eh(clientName) + '</div></div>' +
      '<div class="ts7b-kv"><span class="ts7b-kv-k">الخدمة</span><div class="ts7b-kv-v">' + eh(svcNames) + '</div></div>' +
      '<div class="ts7b-kv"><span class="ts7b-kv-k">المستندات المطلوبة</span><div class="ts7b-kv-v">' + eh(docNotes || 'حسب بنود الطلب') + '</div></div>' +
      (address ? '<div class="ts7b-kv"><span class="ts7b-kv-k">العنوان</span><div class="ts7b-kv-v">' + eh(address) + '</div></div>' : '');

    const tripsHtml = trips.length
      ? trips.map(t => {
          const kl = t.kind === 'pickup' ? 'استلمت من العميل' : 'سلّمت للعميل';
          return '<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;padding:5px 0;font-size:12px">' +
            '<span><b>' + kl + '</b> · يوم ' + eh(dayLabel(t.trip_day)) + '</span>' +
            '<span class="cp-tag ' + (t.confirmed ? 'ok' : 'wt') + '">' + (t.confirmed ? '✓ مؤكد ' + eh(timeOf(t.courier_confirmed_at)) : 'بانتظار تأكيدك') + '</span>' +
          '</div>';
        }).join('')
      : (fallbackItem ? '<div style="font-size:12px">' + eh(kindLabel(fallbackItem)) + ' · ' + eh(dayLabel(fallbackItem.day)) + '</div>' : '');

    const empHtml = employee
      ? '<div class="cp-dtl-sec"><b class="hd">الموظف المسؤول عن المعاملة:</b><div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap"><b>' + eh(employee) + '</b><div style="display:flex;gap:6px">' +
          (empPhone ? '<a class="cp-a cp-sm tel" href="' + eh(telHref(empPhone)) + '"><i class="fa-solid fa-phone"></i><span>اتصال</span></a>' : '') +
          (empId ? '<button type="button" class="cp-a cp-sm" data-act="chat-emp" data-uid="' + eh(empId) + '" data-tx="' + eh(tx) + '"><i class="fa-solid fa-comment"></i><span>رسالة للموظف</span></button>' : '') +
        '</div></div></div>'
      : '';

    const notesHtml = notes.length
      ? '<div class="cp-dtl-sec"><b class="hd"> ملاحظاتك المسجلة على المعاملة (' + num(notes.length) + '):</b>' +
          notes.map(n => '<div style="font-size:11.5px;padding:4px 0;border-bottom:1px dashed var(--bd)">' + eh(n.body) + ' <small style="color:var(--mu)">(' + eh(timeOf(n.at)) + ')</small></div>').join('') +
        '</div>'
      : '';

    const unconfirmedItems = st.items.filter(x => String(x.transaction_id) === String(tx) && !x.confirmed);

    const first = unconfirmedItems[0];
    const trk = (c, l, tm) => '<div class="cpn-row" style="font-size:12.5px;gap:10px;padding:3px 0"><span style="width:8px;height:8px;border-radius:50%;background:' + c + '"></span><span style="flex:1">' + l + '</span><span class="cpn-num cpn-lbl">' + tm + '</span></div>';
    const logRows = [];
    if (fallbackItem && fallbackItem.live_state === 'on_the_way') logRows.push(trk('var(--ac)', 'ضغطت «في الطريق»', ''));
    if (fallbackItem && fallbackItem.office_ready) logRows.push(trk('var(--ok)', 'المكتب علّم «جاهز بالمكتب»', ''));
    trips.forEach(t => { if (t.confirmed) logRows.push(trk('var(--ok)', 'اتأكد المشوار', eh(timeOf(t.courier_confirmed_at)))); });
    const dtile = (act, cls, icn, label, extra) => '<button type="button" class="cpn-tile" data-act="' + act + '" data-tx="' + eh(tx) + '"' + (extra || '') + '><span class="ti ' + cls + '">' + ic(icn) + '</span>' + label + '</button>';
    const waitSince = st.waitingMap[String(tx)];
    const dist = fallbackItem ? distTxtOf(fallbackItem) : '';
    const kindTxt = fallbackItem ? KIND[fallbackItem.type].label : '';
    const stChip = fallbackItem && fallbackItem.live_state === 'on_the_way' ? '<span class="cpn-chip" style="background:var(--wnsoft);color:var(--wn)">في الطريق</span>'
      : (unconfirmedItems.length ? '<span class="cpn-chip" style="background:var(--wnsoft);color:var(--wn)">بانتظار</span>' : '<span class="cpn-chip" style="background:var(--oksoft);color:var(--ok)">مؤكد</span>');
    const cod = fallbackItem ? Number(fallbackItem.cod_remaining || 0) : 0;
    const navUrl = fallbackItem ? smartMapsUrl(fallbackItem) : (address ? mapsUrl(address) : '');
    const slideHtml = first
      ? '<div class="cpn-slide cpn-slide-fix" data-act="v12-slide-confirm" data-type="' + eh(first.type) + '" data-ref="' + eh(itemRef(first)) + '" data-tx="' + eh(first.transaction_id) + '" data-amt="' + eh(first.amount) + '"><div class="kn">' + ic('back') + '</div><span>اسحب / اضغط لتأكيد ' + eh(KIND[first.type].sec) + ' · ' + money(first.amount) + '</span></div>'
      : '';
    const moreConfirm = unconfirmedItems.slice(1).map(u => '<button type="button" class="cpn-btn p" style="width:100%;margin-top:8px" data-act="ask-one" data-type="' + eh(u.type) + '" data-ref="' + eh(itemRef(u)) + '" data-tx="' + eh(u.transaction_id) + '" data-amt="' + eh(u.amount) + '">' + ic('check') + 'أكّد ' + eh(KIND[u.type].label) + ' (' + money(u.amount) + ')</button>').join('');

    modal(
      '<div class="cpn-row" style="padding:14px 16px 10px;gap:10px"><button type="button" class="cpn-ib" data-act="mclose-btn" aria-label="رجوع">' + ic('fwd') + '</button>' +
        '<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:17px">' + eh(clientName) + '</div><div class="cpn-num" dir="ltr" style="font-size:12px;color:var(--mu);text-align:start">' + eh(tx) + (kindTxt ? ' · ' + eh(kindTxt) : '') + '</div></div>' + stChip + '</div>' +
      '<div style="margin:0 16px;height:150px;border-radius:24px;overflow:hidden;position:relative;background:var(--card);border:1px solid var(--bd)">' +
        '<svg viewBox="0 0 358 150" width="100%" height="150" preserveAspectRatio="none" aria-hidden="true" style="display:block"><defs><pattern id="cpg" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M28 0H0V28" fill="none" stroke="var(--bd)" stroke-width="1"/></pattern></defs><rect width="358" height="150" fill="url(#cpg)"/>' +
        '<path d="M30 124 C90 124 100 80 160 80 S250 54 308 32" fill="none" stroke="var(--ac)" stroke-width="4" stroke-linecap="round" stroke-dasharray="1 10"/><circle cx="30" cy="124" r="7" fill="var(--tx)"/><circle cx="30" cy="124" r="14" fill="none" stroke="var(--tx)" stroke-opacity=".3"/>' +
        '<path d="M308 16c-9 0-15 7-15 15 0 11 15 24 15 24s15-13 15-24c0-8-6-15-15-15z" fill="var(--ac)"/><circle cx="308" cy="31" r="5" fill="var(--acink)"/></svg>' +
        (dist ? '<div style="position:absolute;inset-inline-start:10px;bottom:10px"><span class="cpn-chip cpn-num" style="background:var(--bg)">' + eh(dist) + '</span></div>' : '') +
        (navUrl ? '<a target="_blank" rel="noopener" href="' + eh(navUrl) + '" class="cpn-btn p" style="position:absolute;inset-inline-end:10px;bottom:10px;min-height:36px;border-radius:12px;font-size:12px;padding:0 12px">' + ic('nav', 16) + 'افتح الملاحة</a>' : '') + '</div>' +
      '<div class="cpn-card" style="margin:12px 16px 0;display:flex;flex-direction:column;gap:10px;padding:14px">' +
        (address ? '<div class="cpn-row" style="align-items:flex-start"><span style="color:var(--ac);margin-top:2px">' + ic('pin') + '</span><div style="flex:1;font-size:14px;line-height:1.5">' + eh(address) + '</div></div>' : '') +
        (fallbackItem && fallbackItem.landmark_note ? '<div style="padding:9px 11px;border-radius:14px;background:var(--acsoft);font-size:12.5px;line-height:1.5"><span class="cpn-lbl" style="color:var(--ac)">ذاكرة المكان</span><br>' + eh(fallbackItem.landmark_note) + '</div>' : '') +
        '<div class="cpn-row" style="flex-wrap:wrap;gap:6px">' + (cod > 0 ? '<span class="cpn-chip" style="background:var(--wnsoft);color:var(--wn)">تحصيل ' + money(cod) + '</span>' : '') +
          (fallbackItem && fallbackItem.services ? '<span class="cpn-chip">الخدمات: ' + eh(fallbackItem.services) + '</span>' : '') +
          (fallbackItem && fallbackItem.client_confirmed ? '<span class="cpn-chip" style="background:var(--oksoft);color:var(--ok)">الميعاد مأكد</span>' : '') +
          (fallbackItem && fallbackItem.office_ready ? '<span class="cpn-chip">جاهز بالمكتب</span>' : '') + '</div></div>' +
      '<div class="cpn-tiles" style="margin:12px 16px 0">' +
        (phone ? '<a class="cpn-tile" data-act="v12-call-log" data-tx="' + eh(tx) + '" href="' + eh(telHref(phone)) + '"><span class="ti ok">' + ic('phone') + '</span>اتصال</a>' : '') +
        (phone ? dtile('v12-wa-tpl', 'ok', 'chat', 'واتساب') : '') +
        dtile('v12-sign', '', 'pen', 'توقيع', ' data-client="' + eh(clientName) + '"') +
        dtile('v12-wait', '', 'clock', waitSince ? 'انتظار' : 'وصلت/انتظار') +
        dtile('v12-expense', 'wn', 'wallet', 'مصروف') + dtile('v12-handoff', 'wn', 'swap', 'تحويل') + (ticketReachedCustomer ? '' : dtile('v12-reschedule', 'wn', 'cal', 'تأجيل لبكرة')) +
        '<button type="button" class="cpn-tile" data-act="note" data-tx="' + eh(tx) + '"><span class="ti" style="background:var(--ersoft);color:var(--er)">' + ic('flag') + '</span>بلاغ</button>' +
      '</div>' +
      '<div class="cpn-row" style="margin:10px 16px 0;gap:6px;flex-wrap:wrap">' +
        '<button type="button" class="cpn-chip" data-act="save-pin" data-tx="' + eh(tx) + '">' + ic('pin', 14) + 'حفظ اللوكيشن</button>' +
        '<button type="button" class="cpn-chip" data-act="v12-landmark" data-tx="' + eh(tx) + '">' + ic('info', 14) + 'علامة المكان</button>' +
        (phone ? '<button type="button" class="cpn-chip" data-act="v12-receipt-wa" data-tx="' + eh(tx) + '">' + ic('send', 14) + 'إيصال واتساب</button>' : '') + '</div>' +
      (logRows.length ? '<div class="cpn-card" style="margin:12px 16px 0;padding:12px 14px"><div class="cpn-lbl" style="margin-bottom:8px">سجل المشوار</div>' + logRows.join('') + '</div>' : '') +
      '<div style="margin:12px 16px 0">' + switcherHtml + (notClosed ? '<div class="cp-warn-box"><i class="fa-regular fa-clock"></i> الموظف لسه ما قفلش المعاملة بالكامل على السيستم. لو سلّمتها فعلاً للعميل تقدر تبعت ملاحظة للموظف أو تأكد مشوارك.</div>' : '') +
        '<div class="cp-dtl-sec"><b class="hd">الخدمات وحالتها (بدون أسعار العميل):</b>' + linesHtml + '</div>' +
        '<div class="cp-dtl-sec"><b class="hd">تواريخ استلامك وتسليمك على المعاملة:</b>' + tripsHtml + '</div>' + empHtml + notesHtml + '</div>' +
      '<div class="cpn-slidebar">' + slideHtml + moreConfirm + '</div>', true
    );
  }

  /* ---------- شاشة ملفي الشخصي الكاملة (زي النسخة 4 بالظبط) ---------- */
  async function loadMyAvatar() {
    if (!st.me || !st.me.avatar_path) { st.avUrl = ''; updateHeaderWho(); return; }
    try {
      const r = await sbClient.storage.from('avatars').createSignedUrl(st.me.avatar_path, 43200);
      if (r && r.data && r.data.signedUrl) {
        st.avUrl = r.data.signedUrl;
        updateHeaderWho();
        if (st.tab === 'profile') renderTab(false);
      }
    } catch (e) { /* */ }
  }
  function openProfileModal() {
    if (st.tab !== 'profile') st.prevTab = st.tab || 'home';
    st.avPendingBlob = null;
    if (st.avPendingUrl) { try { URL.revokeObjectURL(st.avPendingUrl); } catch (e) {} st.avPendingUrl = ''; }
    st.avRemoved = false;
    st.tab = 'profile';
    renderNav();
    renderTab(true);
  }
  function viewProfile() {
    const m = st.me || {};
    const hasImg = !!(st.avPendingUrl || (st.avUrl && !st.avRemoved) || (m.avatar_path && !st.avRemoved));
    return '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">' +
        '<b style="font-size:15px">ملفي الشخصي</b>' +
        '<button type="button" class="cp-btn cp-sm" data-act="pf-back">رجوع</button>' +
      '</div>' +
      renderGuideBanner('profile') +
      '<div class="cp-card" style="text-align:center;padding:20px 12px">' +
        '<div style="display:flex;justify-content:center;margin-bottom:10px">' + myAvHtml(88) + '</div>' +
        '<input type="file" id="cp-pf-file" accept="image/*" style="display:none">' +
        '<div style="display:flex;justify-content:center;gap:8px">' +
          '<button type="button" class="cp-btn cp-sm" data-act="pf-pick">غيّر الصورة</button>' +
          (hasImg ? '<button type="button" class="cp-btn cp-sm" data-act="pf-rm">شيل الصورة</button>' : '') +
        '</div>' +
      '</div>' +
      '<div class="cp-card">' +
        '<div style="margin-bottom:12px">' +
          '<small style="display:block;font-size:11px;color:var(--mu);margin-bottom:3px">الاسم (بتحدده الإدارة)</small>' +
          '<b style="font-size:15px">' + eh(m.name || '') + '</b>' +
        '</div>' +
        '<div style="margin-bottom:12px">' +
          '<label for="cp-pf-job" style="display:block;font-size:11.5px;color:var(--mu);margin-bottom:5px;font-weight:700">المسمى الوظيفي</label>' +
          '<input id="cp-pf-job" type="text" class="cp-field" maxlength="80" value="' + eh(m.job_title || '') + '" placeholder="مثال: مندوب توصيل">' +
        '</div>' +
        '<div style="margin-bottom:14px">' +
          '<label for="cp-pf-phone" style="display:block;font-size:11.5px;color:var(--mu);margin-bottom:5px;font-weight:700">رقم التليفون</label>' +
          '<input id="cp-pf-phone" type="tel" dir="ltr" class="cp-field" maxlength="20" value="' + eh(m.phone || '') + '" placeholder="01xxxxxxxxx">' +
        '</div>' +
        '<button type="button" class="cp-big" style="margin-top:0" data-act="pf-save">حفظ</button>' +
      '</div>';
  }
  function pickCourierPhoto() {
    const inp = $('cp-pf-file'); if (!inp) return;
    inp.onchange = async () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      try {
        const blob = await (typeof compressImage === 'function' ? compressImage(f, 320) : Promise.resolve(f));
        st.avPendingBlob = blob;
        if (st.avPendingUrl) URL.revokeObjectURL(st.avPendingUrl);
        st.avPendingUrl = URL.createObjectURL(blob);
        st.avRemoved = false;
        updateHeaderWho();
        renderTab(false);
      } catch (e) { toast('تعذّر قراءة الصورة', true); }
    };
    inp.click();
  }
  async function saveCourierProfile(btn) {
    if (st.busy || !st.me) return;
    const job = (($('cp-pf-job') || {}).value || '').trim();
    const phone = (($('cp-pf-phone') || {}).value || '').trim();
    st.busy = true; if (btn) btn.disabled = true;
    try {
      let avPath = st.avRemoved ? null : (st.me.avatar_path || null);
      if (st.avPendingBlob) {
        const p = st.me.user_id + '/avatar-' + Date.now() + '.jpg';
        const up = await sbClient.storage.from('avatars').upload(p, st.avPendingBlob, { contentType: 'image/jpeg', upsert: true });
        if (up.error) throw up.error;
        avPath = p;
      }
      const r = await sbClient.rpc('courier_save_profile', { p_job: job, p_phone: phone, p_avatar: avPath });
      if (r.error) throw r.error;
      if (r.data) st.me = Object.assign({}, st.me, r.data);
      else { st.me.job_title = job; st.me.phone = phone; st.me.avatar_path = avPath; }
      if (st.avPendingUrl) { st.avUrl = st.avPendingUrl; st.avPendingUrl = ''; st.avPendingBlob = null; }
      else if (st.avRemoved) { st.avUrl = ''; }
      updateHeaderWho();
      toast('تم حفظ ملفك الشخصي ✓');
      renderTab(false);
    } catch (e) { toast(errMsg(e), true); }
    if (btn) btn.disabled = false;
    st.busy = false;
  }

  const NK = [
    ['note', 'ملاحظة للموظف'],
    ['problem', ' مشكلة في المعاملة أو العميل'],
    ['missing_fee', '<i class="fa-solid fa-triangle-exclamation"></i> المشوار برسوم توصيل ومش متسجّل لي رسوم']
  ];
  const QUICK_NOTES = [
    '✅ تم التسليم',
    '✅ تم الاستلام',
    ' العميل لا يرد على التليفون',
    ' العميل طلب تأجيل الموعد',
    ' العنوان غير واضح ومحتاج تواصل'
  ];

  async function askNote(tx) {
    const o = byTx(tx); st.noteKind = 'note';
    modal('<h3>ملاحظة للموظف</h3><p>على معاملة <b>' + eh(o ? o.client_name : '') + '</b> (<b dir="ltr">' + eh(tx) + '</b>). بتظهر كتعليق على المعاملة وبيوصل إشعار فوري للموظف المسؤول وللمدير.</p>' +
      '<div class="cp-info-box"> ملاحظة مهمة: الريكوست بيفضل ظاهر لحد ما الموظف يقفله أو انت تأكده بزرار «أكّد ده بس».</div>' +
      '<div class="cp-kinds" id="cp-kinds">' + NK.map(k => '<button type="button" data-act="nkind" data-k="' + k[0] + '" class="' + (k[0] === 'note' ? 'on' : '') + '">' + k[1] + '</button>').join('') + '</div>' +
      '<div style="font-size:11px;font-weight:700;color:var(--mu);margin-bottom:5px">اختصارات سريعة (اضغط لإدراج النص):</div>' +
      '<div class="cp-qnotes">' + QUICK_NOTES.map(qn => '<button type="button" data-act="qnote" data-txt="' + eh(qn) + '">' + eh(qn) + '</button>').join('') + '</div>' +
      '<textarea id="cp-nbody" class="cp-field" rows="3" maxlength="500" placeholder="اكتب التفاصيل…"></textarea>' +
      '<div class="cp-btns"><button type="button" class="cp-btn cp-go" data-act="nsend" data-tx="' + eh(tx) + '">إرسال للموظف</button><button type="button" class="cp-btn" data-act="mclose-btn">إلغاء</button></div><div class="cp-old-n" id="cp-oldn"></div>');
    try {
      const r = await sbClient.rpc('courier_tx_notes', { p_tx: tx }); const n = (r.data || []); const e = $('cp-oldn');
      if (e) e.innerHTML = n.length ? '<b>ملاحظاتك السابقة:</b>' + n.map(x => '<div style="margin-top:4px">' + eh(x.body) + ' <span>(' + eh(timeOf(x.at)) + ')</span></div>').join('') : '';
    } catch (e) { /* */ }
  }

  async function sendNote(tx, btn) {
    if (st.busy) return; const body = (($('cp-nbody') || {}).value || '').trim();
    if (st.noteKind !== 'missing_fee' && !body) { toast('اكتب الملاحظة الأول', true); return; }
    st.busy = true; if (btn) btn.disabled = true;
    try {
      const r = await sbClient.rpc('courier_add_note', { p_tx: tx, p_kind: st.noteKind, p_body: body });
      if (r.error) throw r.error;
      /* تحديث فوري لعلامة  أبلغت الموظف (البند B.3) */
      const nowIso = new Date().toISOString();
      st.notesMap[String(tx)] = { id: Date.now(), transaction_id: String(tx), body: body, at: nowIso };
      st.items.forEach(it => { if (String(it.transaction_id) === String(tx)) it.my_notes = (Number(it.my_notes) || 0) + 1; });
      closeModal();
      /* البند B.4: لو الملاحظة فيها تم التسليم نوضحله اضغط أكّد ده بس */
      if (/تم التسليم/.test(body)) {
        toast('اتبعتت للموظف. ولو عايز المشوار يتحسب في عمولتك اضغط «أكّد ده بس»');
      } else {
        toast('اتبعتت للموظف ✓');
      }
      renderTab(false);
      st.sig = '';
      loadItems(true);
      loadMyNotes();
    } catch (e) { toast(errMsg(e), true); if (btn) btn.disabled = false; }
    st.busy = false;
  }

  /* تأكيد مشوار واحد لوحده „أكّد ده بس“ (البند B.1 / B.2 + تحذير A.3) */
  function askConfirmOne(type, ref, tx, amt) {
    const it = byTx(tx);
    const warn = it && isNotClosedByStaff(it)
      ? '<div class="cp-warn-box"><i class="fa-regular fa-clock"></i> تنبيه: الموظف لسه ما قفلش المعاملة دي على السيستم. متأكد إنك نفذت المشوار وعايز تأكده دلوقتي؟</div>'
      : '';
    modal(
      '<h3>تأكيد مشوار واحد («أكّد ده بس»)</h3>' +
      '<p>هتأكد مشوار <b>' + eh((KIND[type] && KIND[type].label) || 'المشوار') + '</b> للعميل <b>' + eh(it ? it.client_name : '') + '</b> (<b dir="ltr">' + eh(tx) + '</b>) بقيمة <b>' + money(amt) + '</b>.</p>' +
      warn +
      '<div class="cp-btns">' +
        '<button type="button" class="cp-btn cp-go" data-act="do-confirm-one" data-type="' + eh(type) + '" data-ref="' + eh(ref) + '">أيوه، أكّد ده بس</button>' +
        '<button type="button" class="cp-btn" data-act="mclose-btn">رجوع</button>' +
      '</div>'
    );
  }

  async function doConfirmOne(type, ref, btn) {
    if (st.busy) return; st.busy = true; if (btn) btn.disabled = true;
    try {
      const r = await sbClient.rpc('courier_confirm_one', { p_type: type, p_ref: String(ref) });
      if (r.error) throw r.error;
      closeModal();
      toast('اتأكد المشوار بنجاح ✓');
      st.sig = '';
      await Promise.all([loadItems(true), loadLeaderboard(true)]);
    } catch (e) { toast(errMsg(e), true); if (btn) btn.disabled = false; }
    st.busy = false;
  }

  function askConfirm(kind, n, amt) {
    const dayRows = itemsOf(st.day).filter(i => i.type === kind && !i.confirmed);
    const unclosedCount = dayRows.filter(isNotClosedByStaff).length;
    const warn = unclosedCount
      ? '<div class="cp-warn-box"><i class="fa-regular fa-clock"></i> تنبيه: فيه <b>' + num(unclosedCount) + ' معاملة</b> الموظف لسه ما قفلهاش على السيستم. تقدر تأكد كل ريكوست لوحده بزرار «أكّد ده بس» أو تكمل التأكيد الجماعي لو متأكد.</div>'
      : '';
    modal('<h3>تأكيد ' + KIND[kind].sec + ' — ' + eh(dayLabel(st.day)) + '</h3><p>هتأكد <b>' + num(n) + ' مشوار</b> بإجمالي <b>' + money(amt) + '</b> وهيتحسبوا في عمولتك. متأكد إنك راجعتهم؟</p>' +
      warn +
      '<div class="cp-btns"><button type="button" class="cp-btn cp-go" data-act="do-confirm" data-kind="' + kind + '">أيوه، تم التأكيد</button><button type="button" class="cp-btn" data-act="mclose-btn">رجوع</button></div>');
  }
  async function doConfirm(kind, btn) {
    if (st.busy) return; st.busy = true; if (btn) btn.disabled = true;
    try {
      const r = await sbClient.rpc('courier_confirm_day', { p_kind: kind, p_day: st.day }); if (r.error) throw r.error;
      closeModal(); toast('اتأكد ' + num(r.data && r.data.count) + ' مشوار ✓'); st.sig = '';
      await Promise.all([loadItems(true), loadLeaderboard(true)]);
    } catch (e) { toast(errMsg(e), true); if (btn) btn.disabled = false; }
    st.busy = false;
  }

  /* ---------- الأحداث ---------- */
  function onKey(e) {
    if (e.target && e.target.id === 'cp-msg' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); return; }
    if (e.target && e.target.id === 'cp-trip-q' && e.key === 'Enter') {
      e.preventDefault();
      st.q = e.target.value;
      renderTab(false);
    }
  }
  function onInput(e) {
    if (e.target && e.target.id === 'cp-v12-ginput') { st.globalQ = e.target.value; renderTopBanners(); const gi = $('cp-v12-ginput'); if (gi) { gi.focus(); gi.setSelectionRange(gi.value.length, gi.value.length); } return; }
    if (e.target && e.target.id === 'cp-trip-q') st.q = e.target.value;
  }
  function onClick(e) {
    const el = e.target.closest('[data-act],[data-tab],[data-per],[data-month],[data-lbper],[data-type],[data-sfilter],[data-wf]'); if (!el) return;
    if (!el.dataset.act) {
      if (el.dataset.tab) return setTab(el.dataset.tab);
      if (el.dataset.per) { st.period = el.dataset.per; return renderTab(false); }
      if (el.dataset.month) { st.month = el.dataset.month; return renderTab(false); }
      if (el.dataset.lbper) { st.lbPeriod = el.dataset.lbper; st.lbsig = ''; renderTab(false); return loadLeaderboard(false); }
      if (el.dataset.type) { st.type = el.dataset.type; return renderTab(false); }
      if (el.dataset.sfilter) { st.statusFilter = el.dataset.sfilter; return renderTab(false); }
      if (el.dataset.wf) { st.wf = el.dataset.wf; st.openKey = null; return renderTab(false); }
    }
    const a = el.dataset.act, tx = el.dataset.tx;
    switch (a) {
      case 'mclose': if (e.target === el) closeModal(); return;
      case 'mclose-btn': return closeModal();
      case 'logout': return window.handleLogout && window.handleLogout();
      case 'menu': { const d = $('cp-drawer'); if (d) d.hidden = false; return; }
      case 'menu-close': { const d = $('cp-drawer'); if (d) d.hidden = true; return; }
      case 'screen-help': return openScreenHelpModal();
      case 'theme': return toggleTheme();
      case 'refresh': return refreshPortal(el);
      case 'profile': return openProfileModal();
      case 'pf-back': st.tab = st.prevTab || 'account'; renderNav(); return renderTab(true);
      case 'pf-pick': return pickCourierPhoto();
      case 'pf-rm': st.avPendingBlob = null; if (st.avPendingUrl) { URL.revokeObjectURL(st.avPendingUrl); st.avPendingUrl = ''; } st.avRemoved = true; updateHeaderWho(); return renderTab(false);
      case 'pf-save': return saveCourierProfile(el);
      case 'guide-toggle': return toggleGuide(el.dataset.gtab);
      case 'qsearch': {
        const input = $('cp-trip-q');
        if (input) st.q = input.value;
        renderTab(false);
        return;
      }
      case 'qclear': st.q = ''; return renderTab(false);
      case 'cal-toggle': st.calOpen = !st.calOpen; if (st.calOpen) st.calMonth = (st.day || today()).slice(0, 7); return renderTab(false);
      case 'cal-day': st.day = el.dataset.day; st.calOpen = false; st.openKey = null; return renderTab(false);
      case 'cal-prev': st.calMonth = shiftMonth(st.calMonth || st.day.slice(0, 7), -1); return renderTab(false);
      case 'cal-next': st.calMonth = shiftMonth(st.calMonth || st.day.slice(0, 7), 1); return renderTab(false);
      case 'dprev': st.day = addDays(st.day, -1); return renderTab(false);
      case 'dnext': if (st.day < today()) { st.day = addDays(st.day, 1); renderTab(false); } return;
      case 'dset': st.day = el.dataset.day; return renderTab(true);
      case 'detail': return openClientDetail(tx);
      case 'note': return askNote(tx);
      case 'nkind': st.noteKind = el.dataset.k; document.querySelectorAll('#cp-kinds button').forEach(b => b.classList.toggle('on', b === el)); return;
      case 'qnote': {
        const nb = $('cp-nbody');
        if (nb) { nb.value = el.dataset.txt || ''; nb.focus(); }
        return;
      }
      case 'nsend': return sendNote(tx, el);
      case 'route-toggle': return toggleRouteTx(tx);
      case 'start-day': return startDay();
      case 'route-autosort': return autoOptimizeRoute(true);
      case 'route-clear': return clearRoute();
      case 'on-my-way': return startOnMyWay(tx);
      case 'save-pin': return saveClientPin(tx);
      case 'bag-toggle': {
        const k = String(tx || '');
        if (k) { st.bagHanded[k] = !st.bagHanded[k]; saveBagState(); renderTab(false); }
        return;
      }
      case 'gsearch-toggle': st.globalSearchOpen = !st.globalSearchOpen; renderTopBanners(); if (st.globalSearchOpen && $('cp-v12-ginput')) $('cp-v12-ginput').focus(); return;
      case 'gsearch-clear': st.globalQ = ''; renderTopBanners(); if ($('cp-v12-ginput')) $('cp-v12-ginput').focus(); return;
      case 'break-toggle': {
        st.onBreak = !st.onBreak;
        updateHeaderWho();
        const bb = $('cp-break-btn'); if (bb) bb.style.color = st.onBreak ? '#f59e0b' : '';
        if (st.tab === 'chat' && !st.chat) viewChat();
        if (window.CourierV12) window.CourierV12.queueOrRun('courier_v12_dispatch_action', { p_event_type: st.onBreak ? 'break' : 'resume', p_tx: null, p_payload: {} }).catch(() => null);
        toast(st.onBreak ? '⏸ تم تفعيل وضع الاستراحة للمكتب' : ' رجعت متاح للشغل');
        return;
      }
      case 'voice-cmd': {
        if (!window.CourierV12) return;
        window.CourierV12.startVoiceAssistant(cmd => {
          const nextIt = st.routeTxIds.length ? byTx(st.routeTxIds[0]) : st.items.find(x => x.day === today() && !x.confirmed);
          if (/الجاي|العميل|مين/.test(cmd) && nextIt) {
            window.CourierV12.speakAr('العميل الجاي هو ' + (nextIt.client_name || '') + ' في ' + (nextIt.address || ''));
            openClientDetail(nextIt.transaction_id);
          } else if (/خريطة|طريق/.test(cmd) && nextIt) {
            autoOptimizeRoute(true);
          } else if (/اتصل/.test(cmd) && nextIt && nextIt.phone) {
            window.location.href = telHref(nextIt.phone);
          } else {
            toast(' سمعتك: ' + cmd);
          }
        });
        return;
      }
      case 'ack-ping': {
        const pid = Number(el.dataset.id);
        st.urgentPings = st.urgentPings.filter(x => Number(x.id) !== pid);
        renderTopBanners();
        sbClient.rpc('courier_v12_ack_ping', { p_event_id: pid }).catch(() => null);
        return;
      }
      case 'v12-map-toggle': st.mapMode = !st.mapMode; return renderTab(false);
      case 'v12-shift': st.shiftFilter = el.dataset.val || 'all'; return renderTab(false);
      case 'v12-add-zone': {
        const zn = el.dataset.zone;
        itemsOf(st.day).filter(x => !x.confirmed && detectZoneAndCoords(x).zone === zn).forEach(x => {
          const xtx = String(x.transaction_id);
          if (!st.routeTxIds.includes(xtx)) st.routeTxIds.push(xtx);
        });
        const pos = st.myPos || { lat: 30.0012, lng: 31.1765 };
        sortRouteSelectionNearestFirst(pos.lat, pos.lng);
        saveRouteState();
        toast(' تم إضافة منطقة ' + zn + ' بالكامل لخط السير ✓');
        return renderTab(false);
      }
      case 'v12-wa-tpl': {
        const it = byTx(tx);
        if (it && it.phone && window.CourierV12) window.CourierV12.openWhatsAppTemplates(it.phone, it.client_name, tx, st.me && st.me.name, waNum);
        return;
      }
      case 'v12-call-log': {
        const it = byTx(tx); if (it) it.call_attempts = Number(it.call_attempts || 0) + 1;
        if (window.CourierV12) window.CourierV12.queueOrRun('courier_v12_dispatch_action', { p_event_type: 'call_attempt', p_tx: tx, p_payload: { channel: 'phone' } }).catch(() => null);
        return;
      }
      case 'v12-map-opts': {
        const it = byTx(tx); if (!it) return;
        const q = stopDestinationQuery(it);
        modal(
          '<h3><i class="fa-solid fa-route"></i> فتح الموقع على الخريطة</h3>' +
          '<p>' + eh(it.address || q) + '</p>' +
          '<div class="cp-btns">' +
            '<a class="cp-btn cp-go" target="_blank" rel="noopener" href="' + eh(buildMultiStopMapsUrl([it], st.myPos || null)) + '">Google Maps</a>' +
            '<a class="cp-btn" target="_blank" rel="noopener" href="https://waze.com/ul?q=' + encodeURIComponent(q) + '&navigate=yes">Waze</a>' +
            '<button type="button" class="cp-btn" data-act="v12-copy-pin" data-tx="' + eh(tx) + '">نسخ العنوان</button>' +
            '<button type="button" class="cp-btn" data-act="mclose-btn">إغلاق</button>' +
          '</div>'
        );
        return;
      }
      case 'v12-copy-pin': {
        const it = byTx(tx);
        try { navigator.clipboard.writeText(stopDestinationQuery(it) || (it && it.address) || ''); toast('تم نسخ العنوان/الإحداثيات ✓'); } catch (e) {}
        return closeModal();
      }
      case 'v12-sign': {
        if (!window.CourierV12) return;
        window.CourierV12.openSignatureModal(tx, el.dataset.client || '', () => {
          const it = byTx(tx); if (it) it.has_signature = true;
          toast(' تم حفظ توقيع العميل الإلكتروني بدون مرفقات ✓');
          renderTab(false);
        });
        return;
      }
      case 'v12-landmark': {
        const ln = window.prompt('اكتب علامة مميزة للمكان ده (تظهر لكل المناديب):');
        if (!ln || !ln.trim()) return;
        if (window.CourierV12) window.CourierV12.queueOrRun('courier_v12_save_landmark', { p_tx: tx, p_note: ln.trim() }).then(() => {
          const it = byTx(tx); if (it) it.landmark_note = ln.trim();
          toast('<i class="fa-regular fa-note-sticky"></i> تم حفظ علامة المكان الدائمة ✓'); renderTab(false);
        }).catch(() => null);
        return;
      }
      case 'v12-wait': {
        st.waitingMap[tx] = Date.now();
        if (window.CourierV12) window.CourierV12.queueOrRun('courier_v12_dispatch_action', { p_event_type: 'waiting', p_tx: tx, p_payload: {} }).catch(() => null);
        toast('<i class="fa-regular fa-clock"></i> تم تسجيل وصولك عند العميل — لو اتأخر 5 دقايق ابعتله تذكير');
        renderTab(false);
        return;
      }
      case 'v12-expense': {
        const amt = window.prompt('مبلغ مصروف الطريق (مثال: 20 ركنة):');
        if (!amt) return;
        if (window.CourierV12) window.CourierV12.queueOrRun('courier_v12_dispatch_action', { p_event_type: 'expense', p_tx: tx, p_payload: { note: amt } }).catch(() => null);
        toast(' تم إرسال طلب مصروف الطريق للمدير للموافقة ✓');
        return;
      }
      case 'v12-handoff': {
        const rs = window.prompt('سبب طلب التحويل لمندوب تاني:');
        if (!rs) return;
        if (window.CourierV12) window.CourierV12.queueOrRun('courier_v12_dispatch_action', { p_event_type: 'handoff_req', p_tx: tx, p_payload: { reason: rs } }).catch(() => null);
        toast(' تم إرسال طلب التحويل للمكتب فوراً ✓');
        return;
      }
      case 'v12-reschedule': {
        const rs = window.prompt('سبب التأجيل ليوم بكرة:');
        if (!rs) return;
        if (window.CourierV12) window.CourierV12.queueOrRun('courier_v12_dispatch_action', { p_event_type: 'reschedule_req', p_tx: tx, p_payload: { reason: rs } }).catch(() => null);
        toast(' تم إرسال طلب تأجيل لبكرة لموافقة المكتب ✓');
        return;
      }
      case 'v12-receipt-wa': {
        const it = byTx(tx); if (!it || !it.phone) return;
        const msg = 'شركة تساهيل للخدمات\nإيصال رقمي للمعاملة: ' + tx + '\nالعميل: ' + (it.client_name || '') + '\nالمندوب: ' + ((st.me && st.me.name) || '') + '\nتم التوثيق بنجاح ✓';
        window.open('https://wa.me/' + waNum(it.phone) + '?text=' + encodeURIComponent(msg), '_blank', 'noopener');
        return;
      }
      case 'v12-slide-confirm': {
        closeModal();
        const cType = el.dataset.type, cRef = el.dataset.ref, cAmt = el.dataset.amt;
        if (window.CourierV12) window.CourierV12.haptic(true);
        st.undoData = { tx: tx, type: cType, ref: cRef };
        renderTopBanners();
        setTimeout(() => {
          if (!st.undoData || st.undoData.tx !== tx) return;
          st.undoData = null; renderTopBanners();
          doConfirmOne(cType, cRef, el);
        }, 5000);
        return;
      }
      case 'undo-confirm': {
        st.undoData = null;
        if (window.CourierV12) window.CourierV12.haptic(false);
        renderTopBanners();
        toast('تم التراجع عن التأكيد');
        return;
      }
      case 'trip-open': st.openKey = st.openKey === el.dataset.key ? null : el.dataset.key; return renderTab(false);
      case 'route-all': {
        itemsOf(st.day).filter(x => !x.confirmed).forEach(x => { const id = String(x.transaction_id); if (!st.routeTxIds.includes(id)) st.routeTxIds.push(id); });
        saveRouteState(); return renderTab(false);
      }
      case 'sel-toggle': {
        st.sel = st.sel || {}; const k = el.dataset.type + '|' + el.dataset.ref;
        if (st.sel[k]) delete st.sel[k]; else st.sel[k] = { type: el.dataset.type, ref: el.dataset.ref, amt: el.dataset.amt };
        return renderTab(false);
      }
      case 'sel-all': {
        st.sel = st.sel || {};
        itemsOf(st.day).filter(x => x.type === el.dataset.kind && !x.confirmed).forEach(x => { st.sel[x.type + '|' + itemRef(x)] = { type: x.type, ref: itemRef(x), amt: x.amount }; });
        return renderTab(false);
      }
      case 'confirm-sel': {
        const ks = Object.keys(st.sel || {}); if (!ks.length) return;
        const amt = ks.reduce((a, k) => a + Number(st.sel[k].amt || 0), 0);
        const warn = itemsOf(st.day).filter(x => st.sel[x.type + '|' + itemRef(x)] && isNotClosedByStaff(x)).length;
        modal('<h3>تأكيد المشاوير المختارة</h3><p>هتأكد <b>' + num(ks.length) + ' مشوار</b> بإجمالي <b>' + money(amt) + '</b> وهيتحسبوا في عمولتك.</p>' +
          (warn ? '<div class="cp-warn-box"><i class="fa-regular fa-clock"></i> فيه ' + num(warn) + ' معاملة الموظف لسه ما قفلهاش على السيستم.</div>' : '') +
          '<div class="cp-btns"><button type="button" class="cp-btn cp-go" data-act="do-confirm-sel">أيوه، أكّد المختار</button><button type="button" class="cp-btn" data-act="mclose-btn">رجوع</button></div>');
        return;
      }
      case 'do-confirm-sel': {
        if (st.busy) return; st.busy = true; el.disabled = true;
        (async () => {
          let ok = 0, bad = 0;
          for (const k of Object.keys(st.sel || {})) {
            try { const r = await sbClient.rpc('courier_confirm_one', { p_type: st.sel[k].type, p_ref: String(st.sel[k].ref) }); if (r.error) throw r.error; ok++; delete st.sel[k]; } catch (e) { bad++; }
          }
          closeModal(); toast(bad ? 'اتأكد ' + num(ok) + ' وفشل ' + num(bad) + ' — جرّب تاني' : 'اتأكد ' + num(ok) + ' مشوار ✓', !!bad);
          st.sig = ''; st.busy = false;
          await Promise.all([loadItems(true), loadLeaderboard(true)]);
        })();
        return;
      }
      case 'qreply': {
        const ta = $('cp-msg'); if (!ta) return;
        ta.value = el.dataset.t; st.draft = el.dataset.t; return sendMsg();
      }
      case 'send-loc': {
        const showLocationHelp = reason => {
          const apple = /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
          const steps = apple
            ? 'على آيفون: افتح إعدادات الجهاز > الخصوصية والأمان > خدمات الموقع > Safari (أو Chrome) > أثناء استخدام التطبيق. ولو بتستخدم Safari افتح إعدادات الموقع من زر aA بجوار العنوان واسمح بالموقع.'
            : 'على أندرويد: افتح رمز إعدادات الموقع بجوار عنوان الصفحة (القفل أو رمز التحكم) > الأذونات > الموقع > سماح. واتأكد إن خدمة الموقع / GPS شغالة من إعدادات الجهاز.';
          window.alert((reason ? reason + '\n\n' : '') + steps + '\n\nالموقع هيتبعت للمدير بس في الشات.');
        };
        const go = pos => {
          const mgr = st.contacts.find(c => c.is_manager) || st.contacts[0];
          if (!mgr) return toast('مفيش جهة اتصال متاحة دلوقتي', true);
          st.draft = ' موقعي الحالي: https://maps.google.com/?q=' + pos.lat.toFixed(6) + ',' + pos.lng.toFixed(6);
          openChat(mgr.id, null);
        };
        if (!navigator.geolocation) { showLocationHelp('الموقع غير مدعوم في المتصفح أو الصفحة الحالية.'); return; }
        navigator.geolocation.getCurrentPosition(p => { st.myPos = { lat: p.coords.latitude, lng: p.coords.longitude }; go(st.myPos); },
          err => {
            if (err && err.code === 1) { showLocationHelp('تم رفض إذن الوصول للموقع. فعّله وجرب تاني.'); return; }
            if (st.myPos) { go(st.myPos); return; }
            showLocationHelp('مقدرتش أجيب موقعك. اتأكد من تشغيل GPS والسماح للموقع.');
          }, { enableHighAccuracy: true, timeout: 8000 });
        return;
      }
      case 'qr-scan': return openQrScannerModal();
      case 'qr-alt': stopQrCamera(); closeModal(); return openAltScanner();
      case 'qr-close': stopQrCamera(); return closeModal();
      case 'qr-go': {
        const inp = $('cp-qr-manual');
        const rawIn = String(inp ? inp.value : '').trim();
        if (rawIn && typeof window.__cp4ReceiptToken === 'function' && window.__cp4ReceiptToken(rawIn) && typeof window.__cp4DeliverFromRaw === 'function') {
          stopQrCamera(); closeModal(); return window.__cp4DeliverFromRaw(rawIn);
        }
        const code = extractTxFromScan(rawIn);
        stopQrCamera();
        if (!code) return toast('اكتب رقم المعاملة الأول', true);
        return openClientDetail(code);
      }
      case 'ledger-toggle': {
        st.ledgerOpen = !st.ledgerOpen;
        if (st.ledgerOpen && !st.ledgerRows.length) return loadCourierLedger();
        return renderTab(false);
      }
      case 'ledger-run': {
        const f = $('cp-ldg-from'), t = $('cp-ldg-to');
        if (f && f.value) st.ledgerFrom = f.value;
        if (t && t.value) st.ledgerTo = t.value;
        if (st.ledgerFrom > st.ledgerTo) return toast('تاريخ البداية لازم يكون قبل تاريخ النهاية', true);
        return loadCourierLedger();
      }
      case 'ask-one': return askConfirmOne(el.dataset.type, el.dataset.ref, el.dataset.tx, el.dataset.amt);
      case 'do-confirm-one': return doConfirmOne(el.dataset.type, el.dataset.ref, el);
      case 'ask': return askConfirm(el.dataset.kind, el.dataset.n, el.dataset.amt);
      case 'do-confirm': return doConfirm(el.dataset.kind, el);
      case 'chat-open': return openChat(el.dataset.uid, null);
      case 'chat-emp': closeModal(); st.tab = 'chat'; st.chat = null; renderNav(); return loadContacts(true).then(() => openChat(el.dataset.uid, tx));
      case 'chat-back': st.chat = null; renderTab(true); return;
      case 'chat-send': return sendMsg();
      case 'chat-notx': if (st.chat) { st.chat.tx = null; const t = $('cp-msg'); st.draft = t ? t.value : st.draft; convView(); } return;
    }
  }

  async function showCourier() {
    initTheme(); initGuides(); initSmartFeatures(); st.day = today(); st.month = st.day.slice(0, 7);
    overlay('<div class="cp-empty" style="margin:auto">جاري التحميل…</div>');
    try { const r = await sbClient.rpc('courier_me'); if (r.error) throw r.error; st.me = r.data; }
    catch (e) { overlay('<header class="cp-head"><div class="cp-who"><b>بوابة المندوب</b></div>' + logoutBtn + '</header><div class="cp-empty" style="margin:auto">' + eh(errMsg(e)) + '</div>'); return; }
    shell(); loadMyAvatar(); sbClient.rpc('touch_last_seen');
    await Promise.all([loadItems(false), loadMyNotes(), loadLeaderboard(true), loadContacts(true)]);
    await checkPendingReminders(true);
    clearInterval(st.timer); st.timer = setInterval(tick, 1000);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && st.me && $('courier-app')) { loadItems(true); loadMyNotes(); loadLeaderboard(true); loadContacts(true); checkPendingReminders(false); if (st.chat) pollMsgs(false); } });
  window.addEventListener('online', () => { if (st.me) { loadItems(true); loadMyNotes(); loadLeaderboard(true); loadContacts(true); } });

  /* ---------- نقطة الدخول ---------- */
  const _li = window.loadInitialData;
  window.loadInitialData = async function () {
    let role = null;
    try { const r = await sbClient.rpc('my_role'); role = r && !r.error ? r.data : null; } catch (e) { /* */ }
    if (role === 'courier') { window.__role = 'courier'; return showCourier(); }
    if (role) window.__role = role;
    if (isManagerUser()) ensureManagerUi();
    try {
      const out = await _li.apply(this, arguments);
      if (isManagerUser()) ensureManagerUi();
      return out;
    } catch (err) {
      if (isManagerUser()) ensureManagerUi();
      throw err;
    }
  };
  const _sl = window.showLoginScreen;
  window.showLoginScreen = function () {
    clearInterval(st.timer); st.me = null; st.sig = ''; st.lbsig = ''; st.nsig = ''; st.csig = ''; st.msig = ''; st.items = []; st.leaderboard = []; st.notesMap = {}; st.contacts = []; st.chat = null; st.msgs = []; st.loaded = false; st.lbLoaded = false; st.tab = 'home';
    document.body.classList.remove('is-courier-mode', 'is-partner-mode');
    const o = $('courier-app'); if (o) o.remove();
    return _sl.apply(this, arguments);
  };

  /* =====================================================================
     المدير: ربط حسابات المناديب + متابعة الترتيب
     ===================================================================== */
  function addMgrBtn() {
    if (!isManagerUser()) return;
    const menu = $('nav-menu'); if (!menu) return;
    if (!$('tab-cpmgr-btn')) {
      const b = document.createElement('button');
      b.id = 'tab-cpmgr-btn';
      b.type = 'button';
      b.className = 'tab-btn';
      b.innerHTML = '<i class="fa-solid fa-id-card text-emerald-500"></i><span>حسابات المناديب</span>';
      b.addEventListener('click', () => { if (window.closeNavMenu) window.closeNavMenu(); openMgr(); });
      const anchor = $('tab-couriers-btn') || $('tab-notes-btn');
      const adminBody = menu.querySelector(':scope > section[data-mg="admin"] .mg-body');
      if (anchor && anchor.parentElement) anchor.insertAdjacentElement('afterend', b);
      else if (adminBody) adminBody.appendChild(b);
      else menu.appendChild(b);
    }
  }

  function injectCouriersTabBanner() {
    if (!isManagerUser()) return;
    const root = $('tab-couriers');
    if (!root || root.classList.contains('hidden')) return;
    if ($('cp-couriers-top-bar')) return;
    const bar = document.createElement('div');
    bar.id = 'cp-couriers-top-bar';
    bar.className = 'card p-4 border-2 border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/20 flex flex-wrap items-center justify-between gap-3';
    bar.innerHTML =
      '<div class="flex items-center gap-3">' +
        '<div class="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white text-base shadow-xs"><i class="fa-solid fa-id-card"></i></div>' +
        '<div>' +
          '<div class="text-sm font-bold text-ink dark:text-white">بوابة وحسابات المناديب (ربط الإيميلات وإدارة الدخول)</div>' +
          '<div class="text-xs text-slate-500 dark:text-slate-400">اربط كل مندوب بحساب الدخول بتاعه في Supabase وتابع المشاوير المنتظرة والملاحظات.</div>' +
        '</div>' +
      '</div>' +
      '<button type="button" id="cp-open-mgr-acc" class="rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow-xs flex items-center gap-1.5"><i class="fa-solid fa-link"></i><span>حسابات المناديب</span></button>';
    root.insertBefore(bar, root.firstChild);
    const b1 = $('cp-open-mgr-acc');
    if (b1) b1.onclick = () => openMgr();
  }

  let mgrObsBound = false;
  function ensureManagerUi() {
    addMgrBtn();
    injectCouriersTabBanner();
    if (mgrObsBound) return;
    mgrObsBound = true;
    const root = $('tab-couriers');
    if (root && window.MutationObserver) {
      try {
        new MutationObserver(() => {
          if (isManagerUser() && !$('cp-couriers-top-bar')) injectCouriersTabBanner();
        }).observe(root, { childList: true });
      } catch (e) { /* */ }
    }
    const _st = window.switchTab;
    if (typeof _st === 'function' && !_st.__cpWrapped) {
      const wrapped = function (id) {
        const res = _st.apply(this, arguments);
        if (isManagerUser()) {
          addMgrBtn();
          if (id === 'couriers') setTimeout(injectCouriersTabBanner, 50);
        }
        return res;
      };
      wrapped.__cpWrapped = true;
      window.switchTab = wrapped;
    }
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
        (info[c.id] ? '<span class="st">مشاوير لسه ما اتأكدتش (آخر 30 يوم): <b>' + num(info[c.id].pending_trips) + ' مشوار</b> · ملاحظات آخر 7 أيام: <b>' + num(info[c.id].notes_7d) + ' ملاحظة</b></span>' : '') + '</div>'
      : '<form class="cp-mgr-row" data-link="' + eh(c.id) + '"><span class="nm">' + eh(c.name) + '</span><input class="cp-field" type="email" required placeholder="إيميل حساب المندوب"><button class="cp-btn cp-go">ربط</button></form>').join('');
    const m = mgrShell('<h3>حسابات المناديب</h3><p>1) اعمل حساب للمندوب من Supabase (Authentication ← Add user). 2) اكتب إيميله قدام اسمه هنا واضغط «ربط». المندوب هيدخل ويشوف شغله هو بس: مشاويره وعمولته، ويتواصل معاكم.</p>' + (rows || '<p>مفيش مناديب نشطين.</p>') +
      '<div class="cp-btns" style="margin-top:12px"><button type="button" class="cp-btn" id="cp-mgr-x">إغلاق</button></div>');
    m.onclick = ev => { if (ev.target === m) m.remove(); };
    $('cp-mgr-x').onclick = () => m.remove();
    m.querySelectorAll('[data-link]').forEach(f => f.addEventListener('submit', async ev => {
      ev.preventDefault();
      const x = await sbClient.rpc('assign_courier', { p_email: f.querySelector('input').value.trim(), p_courier_id: Number(f.dataset.link) });
      if (x.error) return toast(/no such account/.test(x.error.message) ? 'مفيش حساب بالإيميل ده في Supabase' : /another role/.test(x.error.message) ? 'الحساب ده ليه دور تاني' : errMsg(x.error), true);
      toast('اتربط الحساب ✓'); openMgr();
    }));
    m.querySelectorAll('[data-unlink]').forEach(b => b.addEventListener('click', async () => {
      if (!window.confirm('إيقاف حساب المندوب ده؟ مش هيقدر يدخل تاني.')) return;
      const x = await sbClient.rpc('remove_role', { p_user: b.dataset.unlink });
      if (x.error) return toast(errMsg(x.error), true); toast('اتوقف الحساب'); openMgr();
    }));
  }
})();
