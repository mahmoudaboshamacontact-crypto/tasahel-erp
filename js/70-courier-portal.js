/* =====================================================================
   بوابة المندوب (js/70-courier-portal.js) — النسخة 6 (Courier Portal v6: Today-first navigation)
   - 5 تابات للمندوب: حسابي / مشاويري / الترتيب / المراجعة / التواصل + ملفي الشخصي، شهور، ثيم، ساعة، أوفلاين.
   - A) تجميع ريكوستات نفس العميل (client_name بعد التطبيع + day + type) في كارت واحد („٤ ريكوستات“)
        في مشاويري والمراجعة بدون تغيير أي حساب فلوس، والضغط على العميل يفتح مودال „تفاصيل العميل“
        من courier_tx_detail(p_tx) بدون أي أسعار عميل أو مدفوعات + علامة „⏳ الموظف لسه ما قفلش المعاملة“.
   - B) تأكيد فردي لكل ريكوست لوحده („أكّد ده بس“) عبر courier_confirm_one(p_type, p_ref)
        + علامة „📨 أبلغت الموظف (الساعة ...)“ بعد إرسال ملاحظة، وتوضيح أن „✅ تم التسليم“ لا تؤكد المشوار وحدها.
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
    day: null, type: 'all', statusFilter: 'all', q: '',
    leaderboard: [], lbsig: '', lbLoaded: false,
    notesMap: {}, nsig: '',
    contacts: [], csig: '', chat: null, msgs: [], msig: '', draft: '',
    theme: 'dark', timer: null, tick: 0, pendingReminderCheck: 0,
    busy: false, offline: false, unreadSeen: 0, loaded: false, itemsLoading: null, refreshing: false, lastSync: null,
    guides: {},
    routeTxIds: [], activeTx: '', pins: {}, bagHanded: {}, myPos: null,
    ledgerOpen: false, ledgerLoading: false, ledgerFrom: '', ledgerTo: '', ledgerRows: []
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
  const timeOf = iso => { try { if (!iso) return ''; return new Date(iso).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', timeZone: TZ }); } catch (e) { return ''; } };
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
  const money = n => Number(n || 0).toLocaleString('ar-EG') + ' ج';
  const num = n => Number(n || 0).toLocaleString('ar-EG');

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
      return { zone: saved.zone || 'لوكيشن مثبت 📍', lat: Number(saved.lat), lng: Number(saved.lng), exact: true };
    }
    if (it.client_lat && it.client_lng) {
      return { zone: 'لوكيشن مثبت 📍', lat: Number(it.client_lat), lng: Number(it.client_lng), exact: true };
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

  function isTxInRoute(tx) {
    return st.routeTxIds.includes(String(tx));
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
  function clearRoute() {
    st.routeTxIds = [];
    st.activeTx = '';
    saveRouteState();
    toast('تم مسح خط السير');
    renderTab(false);
  }

  function autoOptimizeRoute(openMapAfter) {
    const validTxs = st.routeTxIds.filter(tx => byTx(tx));
    if (!validTxs.length) {
      toast('اضغط «➕ ضيف لخط السير» على العملاء اللي نازلهم الأول', true);
      return;
    }
    const finish = (lat, lng, hasGps) => {
      sortRouteSelectionNearestFirst(lat, lng);
      saveRouteState();
      renderTab(false);
      if (openMapAfter) {
        const itemsList = st.routeTxIds.map(tx => byTx(tx)).filter(Boolean);
        const url = buildMultiStopMapsUrl(itemsList, hasGps ? { lat: lat, lng: lng } : null);
        if (url) window.open(url, '_blank', 'noopener');
      } else {
        toast('تم ترتيب خط السير تلقائياً من الأقرب لمكانك ✓');
      }
    };
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          st.myPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          finish(pos.coords.latitude, pos.coords.longitude, true);
        },
        () => finish(30.0012, 31.1765, false),
        { enableHighAccuracy: false, timeout: 3000, maximumAge: 180000 }
      );
    } else {
      finish(30.0012, 31.1765, false);
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
    if (stops.length === 1 && !startPos) {
      return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(stops[0]);
    }
    const origin = startPos ? (startPos.lat + ',' + startPos.lng) : stops[0];
    const dest = stops[stops.length - 1];
    const mid = startPos ? stops.slice(0, -1) : stops.slice(1, -1);
    return 'https://www.google.com/maps/dir/?api=1&origin=' + encodeURIComponent(origin) +
      '&destination=' + encodeURIComponent(dest) +
      (mid.length ? '&waypoints=' + encodeURIComponent(mid.slice(0, 9).join('|')) : '') +
      '&travelmode=driving';
  }

  /* حفظ اللوكيشن الفعلي للعميل من موبايل المندوب (GPS Pin) */
  function saveClientPin(tx) {
    tx = String(tx || '');
    const it = byTx(tx);
    if (!navigator.geolocation) {
      toast('جهازك مش بيدعم تحديد الموقع GPS', true);
      return;
    }
    toast('جاري تحديد موقع العميل الحالي بـ GPS…');
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        const z = detectZoneAndCoords(it);
        st.pins[tx] = { lat: lat, lng: lng, zone: z.zone, at: new Date().toISOString() };
        savePinsState();
        if (it && it.id && it.type !== 'fee') {
          try { await sbClient.rpc('courier_save_pin', { p_trip_id: Number(it.id), p_lat: lat, p_lng: lng }); } catch (e) {}
        }
        toast('📍 تم حفظ وتثبيت لوكيشن العميل بنجاح ✓');
        renderTab(false);
      },
      () => toast('فعل صلاحية الموقع (GPS) في المتصفح عشان تحفظ لوكيشن العميل', true),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  /* زرار «🛵 في طريقي للعميل» بضغطة واحدة */
  function startOnMyWay(tx) {
    tx = String(tx || '');
    const it = byTx(tx);
    if (!it) return;
    st.activeTx = tx;
    if (!st.routeTxIds.includes(tx)) st.routeTxIds.unshift(tx);
    saveRouteState();
    if (it.id && it.type !== 'fee') {
      sbClient.rpc('courier_ops_update', { p_trip_id: Number(it.id), p_status: 'on_the_way', p_priority: null, p_route_order: null, p_note: null }).catch(() => null);
    }
    renderTab(false);
    if (it.phone) {
      const msg = 'أهلاً بحضرتك أ/ ' + (it.client_name || '') + '، معاك ' + ((st.me && st.me.name) || 'مندوب') + ' من شركة تساهيل، أنا في طريقي لحضرتك دلوقتي بخصوص معاملة رقم ' + tx;
      window.open('https://wa.me/' + waNum(it.phone) + '?text=' + encodeURIComponent(msg), '_blank', 'noopener');
    } else {
      toast('🛵 تم تفعيل وضع «في طريقي للعميل» وتثبيت الكارت في الأعلى ✓');
    }
  }

  /* لوحة خط السير المبسطة والواضحة جداً للمندوب (تترتب أوتوماتيك بمجرد الاختيار) */
  function renderSmartRoutePanel() {
    const activeItems = st.routeTxIds.map(tx => byTx(tx)).filter(it => it && !it.confirmed);
    if (!activeItems.length) {
      return '<div class="cp-card" style="border:1px dashed var(--gd-bd);background:var(--gd-bg);padding:10px 12px">' +
        '<div style="font-size:12px"><b>🗺️ إزاي تعمل خط سيرك؟</b> دوس على زرار <b>«➕ ضيف لخط السير»</b> تحت أي عميل ناوي تروحله دلوقتي، والسيستم هيرتبهملك أوتوماتيك من الأقرب للأبعد ويفتحلك الخريطة!</div>' +
      '</div>';
    }

    const stepsChain = activeItems.map((it, idx) => {
      const z = detectZoneAndCoords(it);
      return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 10px;background:var(--fld);border-radius:10px;margin-top:6px">' +
        '<div style="min-width:0;flex:1">' +
          '<span class="cp-tag ok" style="margin-inline-end:6px">' + num(idx + 1) + '</span>' +
          '<b style="font-size:13px">' + eh(it.client_name || 'عميل') + '</b> ' +
          '<small style="color:#10b981;font-weight:700">(' + eh(z.zone) + ')</small>' +
          (it.address ? '<div style="font-size:11px;color:var(--mu);margin-top:2px">' + eh(it.address) + '</div>' : '') +
        '</div>' +
        '<div style="display:flex;gap:4px;shrink:0">' +
          '<button type="button" class="cp-a cp-sm" data-act="on-my-way" data-tx="' + eh(it.transaction_id) + '">🛵 في طريقي</button>' +
          '<button type="button" class="cp-a cp-sm" data-act="route-toggle" data-tx="' + eh(it.transaction_id) + '" title="إزالة">✕</button>' +
        '</div>' +
      '</div>';
    }).join('');

    return '<section class="cp-card" style="border:2px solid #10b981">' +
      '<div class="cp-row" style="align-items:center">' +
        '<div>' +
          '<b style="font-size:14.5px;color:#10b981">🗺️ خط سيرك الجاهز (' + num(activeItems.length) + ' محطات مرتبة تلقائياً للأقرب)</b>' +
        '</div>' +
        '<button type="button" class="cp-a cp-sm" data-act="route-clear">مسح الكل</button>' +
      '</div>' +
      '<div>' + stepsChain + '</div>' +
      '<button type="button" class="cp-big" data-act="route-autosort"><i class="fa-solid fa-location-arrow"></i> ابدأ التحرك وافتح خط السير على الخريطة</button>' +
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
          '<b>🏢 شنطتك آخر اليوم — أوراق مطلوب تسليمها للمكتب</b>' +
          '<div class="cp-sub">عشان متنساش أصل ورقة في الشنطة: علّم على كل معاملة لما تسلّم ورقها للموظف في المكتب</div>' +
        '</div>' +
        '<span class="cp-tag ' + (remaining.length ? 'wt' : 'ok') + '">' + (remaining.length ? 'باقي ' + num(remaining.length) + ' معاملة' : '✓ سلّمت كله') + '</span>' +
      '</div>' +
      '<div class="cp-txlist">' +
        bagItems.map(it => {
          const handed = !!st.bagHanded[String(it.transaction_id)];
          const reason = it.type === 'pickup' ? '📥 استلمتها من العميل النهاردة' : '📤 تسليم مؤجل (الورق لسه معاك)';
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
    const mUrl = s.match(/[?&](?:tx|id|code)=([^&#\s]+)/i);
    if (mUrl && mUrl[1]) return decodeURIComponent(mUrl[1]).trim();
    const mTx = s.match(/(TX-\d{4}-\d+|[A-Za-z0-9_-]{6,24})/);
    return mTx ? mTx[1] : s;
  }
  async function openQrScannerModal() {
    stopQrCamera();
    modal(
      '<h3>📷 مسح كود QR المعاملة</h3>' +
      '<p>وجّه الكاميرا على كود الـ QR المطبوع على الإيصال أو حافظة المستندات لفتح المعاملة وتأكيدها فوراً:</p>' +
      '<div id="cp-qr-box" style="position:relative;width:100%;height:220px;background:#000;border-radius:14px;overflow:hidden;display:flex;align-items:center;justify-content:center;margin-bottom:10px">' +
        '<video id="cp-qr-vid" playsinline muted style="width:100%;height:100%;object-fit:cover"></video>' +
        '<div id="cp-qr-msg" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;background:rgba(0,0,0,.45);padding:12px;text-align:center">جاري تشغيل الكاميرا…</div>' +
      '</div>' +
      '<div style="display:flex;gap:6px">' +
        '<input id="cp-qr-manual" type="text" dir="ltr" class="cp-field" placeholder="أو اكتب رقم المعاملة هنا (مثال: TX-2026-...)">' +
        '<button type="button" class="cp-btn cp-go" data-act="qr-go">فتح</button>' +
      '</div>' +
      '<div class="cp-btns"><button type="button" class="cp-btn" data-act="qr-close">إغلاق</button></div>'
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
              const tx = extractTxFromScan(codes[0].rawValue);
              stopQrCamera();
              if (tx) { openClientDetail(tx); return; }
            }
          } catch (e) {}
          requestAnimationFrame(scanLoop);
        };
        requestAnimationFrame(scanLoop);
      } else if (msg) {
        msg.style.display = 'flex';
        msg.textContent = 'اكتب رقم المعاملة بالأسفل للفتح السريع';
      }
    } catch (e) {
      const msg = $('cp-qr-msg');
      if (msg) msg.textContent = 'تعذر فتح الكاميرا — اكتب رقم المعاملة بالأسفل مباشرة';
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
        '<div><b>📋 كشف الحساب التفصيلي وحالة الصرف</b><div class="cp-sub">شوف إيه اللي دخل التقفيل وإيه اللي اتسجل صرفه من الإدارة بأي فترة تاريخية</div></div>' +
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
      const closeState = x.included_in_closing ? (x.paid_at ? '✓ تم الصرف' : '🔒 دخل التقفيل') : (x.released_at ? 'أُعيد فتحه' : 'لم يُقفل بعد');
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
      '<div class="cp-row" style="margin-bottom:8px"><b>📋 كشف الحساب التفصيلي وحالة التقفيل والصرف</b><button type="button" class="cp-btn cp-sm" data-act="ledger-toggle">إخفاء الكشف</button></div>' +
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
        'لو الموظف لسه ما قفلش المعاملة هتلاقي تنبيه واضح «⏳ الموظف لسه ما قفلش المعاملة».'
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
        'لو بعتّ ملاحظة للموظف هتظهرلك علامة «📨 أبلغت الموظف» بالساعة، والريكوست بيفضل ظاهر لحد ما الموظف يقفله أو أنت تأكده.',
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

  function renderGuideBanner(tab) {
    const g = GUIDES[tab]; if (!g) return '';
    const open = st.guides[tab] === true;
    return '<div class="cp-guide">' +
      '<div class="cp-guide-hd">' +
        '<div class="cp-guide-ic"><i class="fa-solid ' + g.icon + '"></i></div>' +
        '<div class="cp-guide-tt"><b>' + eh(g.title) + '</b><p>' + eh(g.desc) + '</p></div>' +
        '<button type="button" class="cp-guide-x" data-act="guide-toggle" data-gtab="' + tab + '">' + (open ? 'إخفاء' : 'تفاصيل أكتر') + '</button>' +
      '</div>' +
      (open ? '<ul class="cp-guide-ul">' + g.steps.map(s => '<li>' + eh(s) + '</li>').join('') + '</ul>' : '') +
    '</div>';
  }

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

  /* ---------- ستايل مستقل (من غير Tailwind ومن غير !important يكسر hidden) ---------- */
  function addCss() {
    if ($('cp-style')) return;
    const s = document.createElement('style'); s.id = 'cp-style';
    s.textContent = [
      'body.is-courier-mode #app,body.is-courier-mode #login{display:none}',
      '#courier-app.hidden,.cp-modal.hidden{display:none}',
      '#courier-app,#courier-ops-modal{--bg:#0a1424;--card:#10223d;--tx:#e8eef8;--mu:#8fa1ba;--bd:rgba(255,255,255,.1);--fld:rgba(255,255,255,.07);--hd:#0b1b33;--hdtx:#fff;--hdbt:rgba(255,255,255,.1);--chip:rgba(255,255,255,.07);--sh:none;--gd-bg:rgba(16,185,129,.09);--gd-bd:rgba(16,185,129,.28)}',
      '#courier-app[data-theme=light],#courier-ops-modal[data-theme=light]{--bg:#eef2f7;--card:#fff;--tx:#0f172a;--mu:#64748b;--bd:#e2e8f0;--fld:#f1f5f9;--hd:#fff;--hdtx:#0f172a;--hdbt:#eef2f7;--chip:#eef2f7;--sh:0 1px 3px rgba(15,23,42,.08);--gd-bg:#ecfdf5;--gd-bd:#a7f3d0}',
      '#courier-app{position:fixed;inset:0;z-index:99980;display:flex;flex-direction:column;background:var(--bg);color:var(--tx);font-family:inherit;overflow-x:hidden}',
      '#courier-app *{box-sizing:border-box}',
      '.cp-head{flex:0 0 auto;background:var(--hd);color:var(--hdtx);border-bottom:1px solid var(--bd);padding:8px 10px;display:flex;align-items:center;gap:6px;box-shadow:var(--sh);flex-wrap:wrap}',
      '.cp-who{flex:1;min-width:90px;cursor:pointer}.cp-who small{display:block;color:#10b981;font-size:10px;font-weight:800}.cp-who b{display:block;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.cp-clock{text-align:center;line-height:1.2;padding:0 4px}.cp-clock b{display:block;font-size:15px;font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap;direction:ltr}.cp-clock small{display:block;font-size:9.5px;color:var(--mu);white-space:nowrap}',
      '.cp-btn{border:0;border-radius:12px;padding:10px 14px;font:inherit;font-size:13px;font-weight:700;cursor:pointer;color:var(--tx);background:var(--chip)}',
      '.cp-btn:disabled{opacity:.5;cursor:default}.cp-sm{padding:6px 10px;font-size:11px;border-radius:10px}',
      '.cp-hbtn{border:0;border-radius:10px;padding:7px 9px;font:inherit;font-size:11px;font-weight:700;cursor:pointer;color:var(--hdtx);background:var(--hdbt);white-space:nowrap}',
      '.cp-off{display:none;flex:0 0 auto;background:#b45309;color:#fff;text-align:center;font-size:12px;font-weight:700;padding:5px}.cp-off.on{display:block}',
      '.cp-body{flex:1;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;padding:12px 12px 24px;max-width:760px;width:100%;margin:0 auto}',
      '.cp-nav{flex:0 0 auto;display:flex;background:var(--hd);border-top:1px solid var(--bd);padding-bottom:env(safe-area-inset-bottom)}',
      '.cp-nav button{flex:1;border:0;background:transparent;color:var(--mu);font:inherit;font-size:11px;font-weight:700;padding:9px 2px 8px;cursor:pointer;position:relative}',
      '.cp-nav button i{display:block;font-size:17px;margin-bottom:3px}.cp-nav button.on{color:#10b981}',
      '.cp-bdg{position:absolute;top:4px;inset-inline-start:calc(50% + 6px);min-width:17px;height:17px;border-radius:9px;background:#f43f5e;color:#fff;font-size:10px;line-height:17px;padding:0 4px;font-style:normal}',
      '.cp-guide{background:var(--gd-bg);border:1px solid var(--gd-bd);border-radius:16px;padding:12px;margin-bottom:12px}',
      '.cp-guide-hd{display:flex;align-items:flex-start;gap:10px}',
      '.cp-guide-ic{flex:0 0 auto;width:32px;height:32px;border-radius:10px;background:#10b981;color:#04110c;display:flex;align-items:center;justify-content:center;font-size:15px}',
      '.cp-guide-tt{flex:1;min-width:0}.cp-guide-tt b{display:block;font-size:12.5px;font-weight:800;margin-bottom:2px}.cp-guide-tt p{margin:0;font-size:11.5px;color:var(--mu);line-height:1.55}',
      '.cp-guide-x{flex:0 0 auto;border:0;background:var(--chip);color:var(--mu);border-radius:8px;padding:4px 8px;font:inherit;font-size:10.5px;font-weight:700;cursor:pointer}',
      '.cp-guide-ul{margin:8px 0 0;padding:8px 18px 0 0;border-top:1px dashed var(--gd-bd);font-size:11.5px;line-height:1.65;color:var(--tx)}',
      '.cp-guide-ul li{margin-bottom:2px}',
      '.cp-guide-mini{margin-bottom:10px;text-align:start}',
      '.cp-guide-mini button{width:100%;border:1px dashed var(--gd-bd);background:var(--gd-bg);color:#10b981;border-radius:12px;padding:7px 12px;font:inherit;font-size:11.5px;font-weight:800;cursor:pointer;text-align:start;display:flex;align-items:center;gap:6px}',
      '.cp-seg{display:flex;gap:4px;background:var(--chip);border-radius:12px;padding:3px;margin-bottom:12px}',
      '.cp-seg button{flex:1;border:0;border-radius:9px;padding:8px 4px;font:inherit;font-size:12px;font-weight:800;background:transparent;color:var(--mu);cursor:pointer}',
      '.cp-seg button.on{background:#10b981;color:#04110c}',
      '.cp-months{display:flex;gap:6px;overflow-x:auto;margin-bottom:10px;padding-bottom:2px}',
      '.cp-hero{background:linear-gradient(135deg,#047857,#10b981);color:#04110c;border-radius:18px;padding:16px;margin-bottom:12px}',
      '.cp-hero small{display:block;font-size:12px;font-weight:700;opacity:.85}.cp-hero b{display:block;font-size:30px;font-weight:900;margin:2px 0}',
      '.cp-hero .pend{display:flex;align-items:center;justify-content:space-between;gap:8px;background:rgba(255,255,255,.35);border-radius:12px;padding:8px 10px;margin-top:8px;font-size:12px;font-weight:800;flex-wrap:wrap}',
      '.cp-hero .pend button{border:0;border-radius:9px;background:#04110c;color:#fff;font:inherit;font-size:11px;font-weight:800;padding:7px 10px;cursor:pointer}',
      '.cp-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}.cp-grid .wide{grid-column:1/-1}',
      '.cp-kpi{background:var(--card);border:1px solid var(--bd);border-radius:16px;padding:12px;box-shadow:var(--sh)}',
      '.cp-kpi small{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--mu);font-weight:700}.cp-kpi b{display:block;font-size:24px;font-weight:900;margin:4px 0 2px}',
      '.cp-kpi .m{font-size:12px;font-weight:800;color:#10b981}.cp-kpi .p{font-size:11px;font-weight:700;color:#f59e0b;margin-top:2px}.cp-kpi .s{font-size:10px;color:var(--mu);margin-top:3px}',
      '.cp-h{font-size:13px;font-weight:800;margin:14px 2px 8px;color:var(--mu);display:flex;align-items:center;justify-content:space-between;gap:8px}',
      '.cp-card{background:var(--card);border:1px solid var(--bd);border-radius:16px;padding:12px;margin-bottom:10px;box-shadow:var(--sh)}',
      '.cp-row{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}',
      '.cp-name{font-size:15px;font-weight:800;line-height:1.4;cursor:pointer}.cp-name:hover{color:#10b981}',
      '.cp-sub{font-size:11px;color:var(--mu);margin-top:2px}.cp-sub b{direction:ltr;unicode-bidi:embed;font-weight:700}',
      '.cp-tag{flex:0 0 auto;border-radius:999px;padding:3px 9px;font-size:11px;font-weight:800;white-space:nowrap;display:inline-flex;align-items:center;gap:4px}',
      '.k-pk{background:rgba(37,99,235,.15);color:#3b82f6}.k-dl{background:rgba(16,185,129,.16);color:#10b981}.k-fe{background:rgba(245,158,11,.18);color:#d97706}',
      '.ok{background:rgba(16,185,129,.16);color:#10b981}.wt{background:rgba(245,158,11,.18);color:#d97706}.gy{background:var(--chip);color:var(--mu)}.rd{background:rgba(244,63,94,.15);color:#f43f5e}.in{background:rgba(56,189,248,.16);color:#0284c7}',
      '.cp-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.cp-chip{background:var(--chip);border-radius:8px;padding:3px 9px;font-size:11px}',
      '.cp-info{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}',
      '.cp-a{display:inline-flex;align-items:center;gap:5px;border:0;border-radius:10px;padding:7px 10px;font:inherit;font-size:11.5px;font-weight:700;text-decoration:none;color:var(--tx);background:var(--chip);cursor:pointer}',
      '.cp-a.wa{background:rgba(37,211,102,.16);color:#16a34a}.cp-a.tel{direction:ltr}',
      '.cp-a.pri{background:#10b981;color:#04110c}',
      '.cp-emp{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:1px dashed var(--bd);font-size:12px;color:var(--mu)}.cp-emp b{color:var(--tx)}',
      '.cp-txlist{margin-top:10px;border-top:1px solid var(--bd);padding-top:8px;display:flex;flex-direction:column;gap:6px}',
      '.cp-txitem{display:flex;align-items:center;justify-content:space-between;gap:6px;background:var(--fld);border-radius:12px;padding:8px 10px;flex-wrap:wrap}',
      '.cp-day{display:flex;align-items:center;gap:8px;margin-bottom:10px}.cp-day .t{flex:1;text-align:center;font-size:13.5px;font-weight:800}',
      '.cp-day button{border:0;height:38px;padding:0 12px;border-radius:12px;background:var(--chip);color:var(--tx);font:inherit;font-size:12px;font-weight:700;cursor:pointer}.cp-day button:disabled{opacity:.35}',
      '.cp-tabs{display:flex;gap:6px;overflow-x:auto;margin-bottom:8px;padding-bottom:2px}',
      '.cp-tab{flex:0 0 auto;border:1px solid var(--bd);background:transparent;color:var(--mu);border-radius:999px;padding:6px 12px;font:inherit;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap}',
      '.cp-tab.on{background:#10b981;border-color:#10b981;color:#04110c}.cp-tab i{font-style:normal;opacity:.75;margin-inline-start:5px}',
      '.cp-search-bar{display:flex;gap:6px;margin-bottom:10px;align-items:center}',
      '.cp-search-bar input{flex:1;border-radius:12px;border:1px solid var(--bd);background:var(--card);color:var(--tx);padding:9px 12px;font:inherit;font-size:12.5px;outline:none;min-width:0}',
      '.cp-search-bar input:focus{border-color:#10b981}',
      '.cp-empty{text-align:center;color:var(--mu);font-size:13px;padding:30px 12px}',
      '.cp-rev-grp{border:1px solid var(--bd);border-radius:14px;padding:10px;margin-top:8px;background:var(--fld)}',
      '.cp-rev{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 0;border-bottom:1px dashed var(--bd);font-size:12.5px;flex-wrap:wrap}.cp-rev:last-of-type{border-bottom:0}.cp-rev span{color:var(--mu);font-size:11px}',
      '.cp-big{width:100%;border:0;border-radius:14px;padding:13px;font:inherit;font-size:14px;font-weight:800;cursor:pointer;background:#10b981;color:#04110c;margin-top:10px}.cp-big:disabled{opacity:.5}',
      '.cp-done{margin-top:10px;text-align:center;border-radius:12px;padding:10px;font-size:13px;font-weight:800;background:rgba(16,185,129,.14);color:#10b981}',
      '.cp-old{background:rgba(245,158,11,.14);border:1px solid rgba(245,158,11,.4);border-radius:14px;padding:10px;margin-bottom:10px;font-size:12px;font-weight:700;color:#d97706}.cp-old button{margin:6px 4px 0 0}',
      '.cp-warn-box{background:rgba(245,158,11,.14);border:1px solid rgba(245,158,11,.4);border-radius:12px;padding:9px 11px;margin:8px 0;font-size:12px;font-weight:700;color:#d97706;line-height:1.6}',
      '.cp-info-box{background:rgba(56,189,248,.12);border:1px solid rgba(56,189,248,.35);border-radius:12px;padding:9px 11px;margin:8px 0;font-size:11.5px;color:var(--tx);line-height:1.6}',
      /* لوحة الترتيب */
      '.cp-podium{display:grid;grid-template-columns:1fr 1.08fr 1fr;gap:8px;align-items:end;margin-bottom:14px;padding-top:8px}',
      '.cp-pod{background:var(--card);border:1px solid var(--bd);border-radius:16px;padding:12px 6px;text-align:center;position:relative;box-shadow:var(--sh);min-width:0}',
      '.cp-pod.r1{border-color:#f59e0b;background:linear-gradient(180deg,rgba(245,158,11,.16),var(--card));padding:16px 6px}',
      '.cp-pod.r2{border-color:#94a3b8;background:linear-gradient(180deg,rgba(148,163,184,.12),var(--card))}',
      '.cp-pod.r3{border-color:#d97706;background:linear-gradient(180deg,rgba(217,119,6,.12),var(--card))}',
      '.cp-pod.me{box-shadow:0 0 0 2px #10b981}',
      '.cp-pod-medal{font-size:22px;line-height:1;margin-bottom:4px;display:block}',
      '.cp-pod-nm{font-size:12.5px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:4px}',
      '.cp-pod-tot{font-size:18px;font-weight:900;color:#10b981;line-height:1.1}',
      '.cp-pod-tot small{font-size:10px;font-weight:700;color:var(--mu);display:block}',
      '.cp-pod-sub{display:flex;justify-content:center;gap:5px;margin-top:6px;font-size:10px;color:var(--mu);flex-wrap:wrap}',
      '.cp-lb-row{display:flex;align-items:center;gap:10px;background:var(--card);border:1px solid var(--bd);border-radius:14px;padding:11px 12px;margin-bottom:8px;box-shadow:var(--sh)}',
      '.cp-lb-row.me{border-color:#10b981;background:var(--gd-bg)}',
      '.cp-lb-rk{flex:0 0 auto;width:32px;height:32px;border-radius:10px;background:var(--chip);color:var(--tx);font-weight:900;font-size:13px;display:flex;align-items:center;justify-content:center}',
      '.cp-lb-rk.r1{background:#fef3c7;color:#b45309}.cp-lb-rk.r2{background:#e2e8f0;color:#334155}.cp-lb-rk.r3{background:#ffedd5;color:#c2410c}',
      '.cp-lb-info{flex:1;min-width:0}',
      '.cp-lb-info b{display:flex;align-items:center;gap:6px;font-size:14px;font-weight:800}',
      '.cp-lb-stats{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;font-size:11px;color:var(--mu)}',
      '.cp-lb-tot{text-align:end;flex:0 0 auto}',
      '.cp-lb-tot b{display:block;font-size:17px;font-weight:900;color:#10b981;line-height:1.1}',
      '.cp-lb-tot small{font-size:10px;color:var(--mu)}',
      '.cp-motiv{background:linear-gradient(135deg,rgba(16,185,129,.18),rgba(59,130,246,.14));border:1px solid var(--gd-bd);border-radius:14px;padding:11px 12px;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12px;font-weight:700;flex-wrap:wrap}',
      /* الشات والمودال */
      '.cp-ct{display:flex;align-items:center;gap:10px;cursor:pointer}.cp-av{flex:0 0 auto;width:44px;height:44px;border-radius:50%;background:#10b981;color:#04110c;font-weight:900;font-size:17px;display:flex;align-items:center;justify-content:center;position:relative}',
      '.cp-av i{position:absolute;bottom:0;inset-inline-end:0;width:12px;height:12px;border-radius:50%;border:2px solid var(--card);background:#94a3b8}.cp-av i.on{background:#22c55e}',
      '.cp-ct .m{flex:1;min-width:0}.cp-ct .m b{display:block;font-size:14px}.cp-ct .m small{display:block;font-size:11px;color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.cp-ub{min-width:20px;height:20px;border-radius:10px;background:#f43f5e;color:#fff;font-size:11px;font-weight:800;line-height:20px;text-align:center;padding:0 6px}',
      '.cp-chat{display:flex;flex-direction:column;height:calc(100vh - 150px);min-height:300px}',
      '.cp-chead{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap}.cp-chead b{flex:1;font-size:15px;min-width:100px}',
      '.cp-msgs{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:6px;padding:4px 2px}',
      '.cp-m{max-width:84%;border-radius:14px;padding:8px 11px;font-size:14px;line-height:1.6;white-space:pre-wrap;word-break:break-word;background:var(--card);border:1px solid var(--bd)}',
      '.cp-m.me{align-self:flex-start;background:#10b981;border-color:#10b981;color:#04110c}.cp-m.th{align-self:flex-end}',
      '.cp-m small{display:flex;align-items:center;gap:6px;font-size:10px;opacity:.85;margin-top:3px;flex-wrap:wrap}',
      '.cp-m .rd-st{font-weight:800;padding:1px 6px;border-radius:6px;background:rgba(0,0,0,.12)}',
      '.cp-m .tx{display:inline-block;font-size:10px;font-weight:800;background:rgba(0,0,0,.12);border-radius:6px;padding:1px 6px;margin-bottom:3px}',
      '.cp-comp{display:flex;gap:6px;align-items:flex-end;margin-top:8px}.cp-comp textarea{flex:1;max-height:110px;min-width:0}',
      '.cp-field{width:100%;border-radius:10px;border:1px solid var(--bd);background:var(--fld);color:var(--tx);padding:10px 12px;font:inherit;font-size:14px;outline:none;resize:none}.cp-field:focus{border-color:#10b981}',
      '.cp-modal{position:fixed;inset:0;z-index:99990;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;padding:14px}',
      '.cp-box{width:100%;max-width:480px;max-height:90vh;overflow-y:auto;background:var(--card);color:var(--tx);border:1px solid var(--bd);border-radius:18px;padding:16px}',
      '.cp-box h3{margin:0 0 6px;font-size:16px}.cp-box p{margin:0 0 10px;font-size:12px;color:var(--mu);line-height:1.7}',
      '.cp-btns{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}.cp-btns .cp-btn{flex:1;padding:11px;min-width:110px}.cp-go{background:#10b981;color:#04110c}',
      '.cp-kinds{display:flex;flex-direction:column;gap:6px;margin-bottom:10px}.cp-kinds button{border:1px solid var(--bd);background:transparent;color:var(--tx);border-radius:12px;padding:10px;font:inherit;font-size:13px;font-weight:700;text-align:start;cursor:pointer}.cp-kinds button.on{border-color:#10b981;background:rgba(16,185,129,.12)}',
      '.cp-qnotes{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px}',
      '.cp-qnotes button{border:1px solid var(--bd);background:var(--chip);color:var(--tx);border-radius:8px;padding:5px 9px;font:inherit;font-size:11px;font-weight:700;cursor:pointer}',
      '.cp-old-n{font-size:11px;color:var(--mu);border-top:1px dashed var(--bd);padding-top:6px;margin-top:6px}',
      '.cp-dtl-sec{border:1px solid var(--bd);border-radius:12px;padding:10px;margin-bottom:10px;background:var(--fld)}',
      '.cp-dtl-sec b.hd{display:block;font-size:12px;color:var(--mu);margin-bottom:6px}',
      '.cp-toast{position:fixed;left:50%;bottom:78px;transform:translateX(-50%);z-index:99999;background:#10b981;color:#04110c;font-weight:800;font-size:13px;padding:11px 18px;border-radius:12px;max-width:92vw;text-align:center}.cp-toast.err{background:#f43f5e;color:#fff}',
      '.cp-mgr-row{display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid var(--bd);flex-wrap:wrap}.cp-mgr-row .nm{flex:1 1 130px;font-weight:800;font-size:13.5px}.cp-mgr-row .em{font-size:11.5px;color:#10b981;direction:ltr;font-weight:700}',
      '.cp-mgr-row .st{flex:1 1 100%;font-size:11px;color:var(--mu);margin-top:2px}.cp-mgr-row input{flex:1 1 180px;margin:0;padding:8px 10px;font-size:12px;direction:ltr}.cp-mgr-row .cp-btn{padding:8px 12px;font-size:12px}',
      '#cp-mgr{--card:#10223d;--tx:#e8eef8;--mu:#9fb0c8;--bd:rgba(255,255,255,.12);--fld:rgba(255,255,255,.07);--chip:rgba(255,255,255,.1);--gd-bg:rgba(16,185,129,.12);--gd-bd:rgba(16,185,129,.3)}'
    ].join('\n');
    document.head.appendChild(s);
  }
  window.__ensureCourierPortalCss = addCss;

  /* ---------- مساعدات ---------- */
  function toast(msg, bad) {
    const t = document.createElement('div'); t.className = 'cp-toast' + (bad ? ' err' : ''); t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), 3600);
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

  /* علامة 📨 أبلغت الموظف (البند B.3) */
  function noteBadgeHtml(it) {
    const tx = String(it.transaction_id || '');
    const n = st.notesMap[tx];
    const count = Number(it.my_notes) || (n ? 1 : 0);
    if (!count) return '';
    const tm = n && n.at ? timeOf(n.at) : '';
    return '<span class="cp-tag in">📨 أبلغت الموظف' + (tm ? ' (الساعة ' + eh(tm) + ')' : ' (' + num(count) + ' ملاحظة)') + '</span>';
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
      document.body.appendChild(o);
    }
    o.classList.remove('hidden'); o.setAttribute('data-theme', st.theme); o.innerHTML = inner; return o;
  }
  const logoutBtn = '<button type="button" class="cp-hbtn" data-act="logout"><i class="fa-solid fa-right-from-bracket"></i> خروج</button>';

  function myAvHtml(sz) {
    sz = sz || 34;
    const url = st.avPendingUrl || st.avUrl;
    if (url && !st.avRemoved) return '<img src="' + eh(url) + '" alt="" style="width:' + sz + 'px;height:' + sz + 'px;border-radius:50%;object-fit:cover;flex:0 0 auto;border:2px solid #10b981">';
    const ch = String((st.me && st.me.name) || 'م').trim().charAt(0) || 'م';
    return '<span style="width:' + sz + 'px;height:' + sz + 'px;border-radius:50%;background:#10b981;color:#04110c;font-weight:900;font-size:' + Math.round(sz * 0.44) + 'px;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto">' + eh(ch) + '</span>';
  }
  function updateHeaderWho() {
    const w = $('cp-who-box'); if (!w) return;
    w.innerHTML = myAvHtml(34) + '<div style="min-width:0"><small>ملفي ←</small><b>' + eh(st.me && st.me.name) + '</b></div>';
  }
  function shell() {
    overlay(
      '<header class="cp-head"><img src="logo-transparent.png" alt="" style="height:28px" onerror="this.style.display=\'none\'">' +
        '<div class="cp-who" id="cp-who-box" data-act="profile" title="ملفي الشخصي" style="display:flex;align-items:center;gap:8px">' + myAvHtml(34) + '<div style="min-width:0"><small>ملفي ←</small><b>' + eh(st.me && st.me.name) + '</b></div></div>' +
        '<div class="cp-clock"><b id="cp-time"></b><small id="cp-date"></small></div>' +
        '<button type="button" class="cp-hbtn" data-act="qr-scan" title="مسح QR المعاملة"><i class="fa-solid fa-qrcode"></i> QR</button><button type="button" class="cp-hbtn" data-act="refresh" title="تحديث البيانات" aria-label="تحديث البيانات"><i class="fa-solid fa-rotate"></i></button>' +
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
    const T = [
      ['today', 'fa-house', 'اليوم', st.items.filter(i => i.day === today() && !i.confirmed).length],
      ['trips', 'fa-motorcycle', 'مشاويري', 0],
      ['review', 'fa-clipboard-check', 'المراجعة', pend],
      ['chat', 'fa-comments', 'التواصل', u],
      ['account', 'fa-wallet', 'حسابي', 0]
    ];
    const activeTab = st.tab === 'rank' ? 'account' : st.tab;
    const html = T.map(t => '<button type="button" data-tab="' + t[0] + '" class="' + (activeTab === t[0] ? 'on' : '') + '"><i class="fa-solid ' + t[1] + '"></i>' + t[2] + (t[3] ? '<em class="cp-bdg">' + num(t[3]) + '</em>' : '') + '</button>').join('');
    if (n.dataset.h !== html) { n.dataset.h = html; n.innerHTML = html; }
  }
  function setTab(t) {
    st.tab = t === 'home' ? 'account' : t;
    if (st.tab !== 'chat') st.chat = null;
    if (st.tab === 'rank') loadLeaderboard(true);
    if (st.tab === 'today' || st.tab === 'account') loadItems(true);
    renderNav(); renderTab(true);
  }
  function renderTab(top) {
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
    else if (st.tab === 'trips') b.innerHTML = viewTrips();
    else if (st.tab === 'rank') b.innerHTML = viewLeaderboard();
    else if (st.tab === 'review') b.innerHTML = viewReview();
    else viewChat();

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
  /* ---------- شاشة اليوم: الأولويات التشغيلية للمندوب ---------- */
  function viewToday() {
    const t = today();
    const todayItems = itemsOf(t);
    const pending = todayItems.filter(i => !i.confirmed);
    const overdue = st.items.filter(i => !i.confirmed && i.day < t);
    const confirmed = todayItems.filter(i => i.confirmed);
    const groups = groupItemsByClient(pending);
    const greeting = '<section class="cp-card" style="padding:16px;margin-bottom:12px">' +
      '<small style="color:var(--mu);font-weight:700">' + eh(dayLabel(t)) + '</small>' +
      '<h2 style="font-size:21px;font-weight:900;margin:5px 0 3px">أهلاً ' + eh((st.me && st.me.name) || 'بك') + ' 👋</h2>' +
      '<div style="color:var(--mu);font-size:12px">دي متابعة شغلك النهارده — ابدأ بالمشاوير اللي لسه محتاجة تأكيد</div>' +
      '</section>';
    const kpis = '<div class="cp-grid">' +
      '<div class="cp-kpi"><small><i class="fa-solid fa-route"></i>مشاوير اليوم</small><b>' + num(todayItems.length) + '</b><div class="m">إجمالي المشاوير</div></div>' +
      '<div class="cp-kpi"><small><i class="fa-solid fa-hourglass-half"></i>بانتظار تأكيدك</small><b>' + num(pending.length) + '</b><div class="p">مطلوب مراجعتها</div></div>' +
      '<div class="cp-kpi wide"><small><i class="fa-solid fa-circle-check"></i>تم تأكيدها اليوم</small><b>' + num(confirmed.length) + '</b><div class="m">مشوار مؤكد</div></div>' +
      '</div>';
    const overdueBox = overdue.length
      ? '<section class="cp-card" style="border-color:#f59e0b;margin-bottom:12px"><div class="cp-row"><b>⚠ مشاوير من أيام سابقة</b><span class="cp-tag wt">' + num(overdue.length) + ' غير مؤكدة</span></div><p class="cp-sub">راجع المشاوير القديمة حتى لا تظل معلّقة في حسابك.</p><button type="button" class="cp-btn cp-sm" data-tab="review">فتح المراجعة</button></section>'
      : '';
    const pendingSection = '<div class="cp-h"><span>المشاوير المطلوب تأكيدها اليوم</span><button type="button" class="cp-a cp-sm" data-tab="trips">كل مشاويري</button></div>' +
      (groups.length ? groups.map(tripGroupCard).join('') : '<div class="cp-empty">' + (st.loaded ? 'مفيش مشاوير محتاجة تأكيد النهارده 🎉' : 'جاري تحميل المشاوير…') + '</div>');
    const confirmedGroups = groupItemsByClient(confirmed);
    const confirmedSection = confirmedGroups.length
      ? '<div class="cp-h" style="margin-top:14px"><span>المشاوير اللي اتأكدت النهارده</span><span class="cp-tag ok">' + num(confirmed.length) + '</span></div>' + confirmedGroups.map(tripGroupCard).join('')
      : '';
    const quickLinks = '<div class="cp-grid" style="margin-top:12px">' +
      '<button type="button" class="cp-btn" data-tab="review"><i class="fa-solid fa-clipboard-check"></i> مراجعة وتأكيد</button>' +
      '<button type="button" class="cp-btn" data-tab="account"><i class="fa-solid fa-wallet"></i> حسابي وعمولاتي</button>' +
      '</div>';
    return greeting + kpis + renderSmartRoutePanel() + overdueBox + pendingSection + confirmedSection + renderOfficeBagCard() + quickLinks;
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
      ? '<div class="cp-motiv"><div><i class="fa-solid fa-trophy" style="color:#f59e0b;margin-inline-end:6px"></i>ترتيبك في الاستلامات والتسليم: <b>المركز #' + num(myRankRow.rank) + '</b> (' + num(myRankRow.total_trips) + ' مشوار)</div><button type="button" class="cp-btn cp-sm" style="background:#10b981;color:#04110c" data-tab="rank">لوحة الترتيب</button></div>'
      : '<div class="cp-motiv"><div><i class="fa-solid fa-trophy" style="color:#f59e0b;margin-inline-end:6px"></i>شوف ترتيبك وسط زمايلك في الاستلامات والتسليم!</div><button type="button" class="cp-btn cp-sm" style="background:#10b981;color:#04110c" data-tab="rank">فتح الترتيب</button></div>';

    const kpi = (k, icon, title, extra) => { const x = s[k]; return '<div class="cp-kpi"><small><i class="fa-solid ' + icon + '"></i>' + title + '</small><b>' + num(x.n) + ' مشوار</b><div class="m">' + money(x.camt) + ' مؤكدة</div>' + (x.pamt ? '<div class="p">+ ' + money(x.pamt) + ' في الانتظار</div>' : '') + (extra ? '<div class="s">' + extra + '</div>' : '') + '</div>'; };
    const grid = '<div class="cp-grid">' + kpi('pickup', 'fa-box-archive', 'استلمت', 'عمولة الاستلام') + kpi('delivery', 'fa-truck-fast', 'سلّمت', 'عمولة التسليم') +
      '<div class="cp-kpi wide"><small><i class="fa-solid fa-motorcycle"></i>مشاوير رسوم التوصيل</small><b>' + num(s.fee.n) + ' <span style="font-size:13px;font-weight:700;color:var(--mu)">مشوار</span></b><div class="m">' + money(s.fee.camt) + ' مؤكدة</div>' +
      (s.fee.pamt ? '<div class="p">+ ' + money(s.fee.pamt) + ' في الانتظار</div>' : '') + '<div class="s">ذهاب فقط: ' + num(s.one) + ' مشوار · ذهاب وعودة: ' + num(s.round) + ' مشوار</div></div></div>';
    const recent = st.items.slice(0, 6).map(it => '<div class="cp-card" style="padding:10px" data-act="detail" data-tx="' + eh(it.transaction_id) + '"><div class="cp-row"><div><div class="cp-name" style="font-size:14px">' + eh(it.client_name || 'بدون اسم') + '</div><div class="cp-sub">' + eh(kindLabel(it)) + ' · ' + eh(dayLabel(it.day)) + '</div></div><div style="text-align:end"><b>' + money(it.amount) + '</b><div><span class="cp-tag ' + (it.confirmed ? 'ok' : 'wt') + '">' + (it.confirmed ? 'مؤكد' : 'بانتظارك') + '</span></div></div></div></div>').join('');
    const load = !st.loaded ? '<div class="cp-empty">جاري التحميل…</div>' : '';
    return renderGuideBanner('home') + seg + monthsBar + hero + rankTeaser + grid + renderIntegratedLedgerSection() + '<div class="cp-h"><span>آخر مشاويرك (اضغط على العميل للتفاصيل)</span><button type="button" class="cp-a cp-sm" data-tab="trips">كل المشاوير</button></div>' + (recent || load || '<div class="cp-empty">لسه مفيش مشاوير متسجلة باسمك</div>');
  }

  /* ---------- 2) مشاويري (تجميع ريكوستات نفس العميل + تفاصيل بالضغط) ---------- */
  function dayNav() {
    const t = today();
    return '<div class="cp-day"><button type="button" data-act="dprev">اليوم السابق</button><div class="t">' + eh(dayLabel(st.day)) + (st.day === t ? ' · النهارده' : '') + '</div>' +
      '<button type="button" data-act="dnext"' + (st.day >= t ? ' disabled' : '') + '>اليوم التالي</button></div>';
  }
  const itemsOf = d => st.items.filter(it => it.day === d);

  function viewTrips() {
    const all = itemsOf(st.day), n = k => all.filter(i => k === 'all' || i.type === k).length;
    const tabs = '<div class="cp-tabs">' + [['all', 'الكل'], ['pickup', 'استلام'], ['delivery', 'تسليم'], ['fee', 'رسوم توصيل']].map(t => '<button type="button" class="cp-tab' + (st.type === t[0] ? ' on' : '') + '" data-type="' + t[0] + '">' + t[1] + '<i>' + num(n(t[0])) + '</i></button>').join('') + '</div>';
    const stTabs = '<div class="cp-tabs">' + [
      ['all', 'كل الحالات (' + num(all.length) + ')'],
      ['pending', '⏳ بانتظار تأكيدك (' + num(all.filter(i => !i.confirmed).length) + ')'],
      ['confirmed', '✓ مؤكدة (' + num(all.filter(i => i.confirmed).length) + ')']
    ].map(s => '<button type="button" class="cp-tab' + (st.statusFilter === s[0] ? ' on' : '') + '" data-sfilter="' + s[0] + '">' + s[1] + '</button>').join('') + '</div>';

    const searchBar = '<div class="cp-search-bar">' +
      '<input id="cp-trip-q" type="search" value="' + eh(st.q) + '" placeholder="ابحث باسم العميل، رقم المعاملة، التليفون، العنوان…" aria-label="البحث في المشاوير">' +
      '<button type="button" class="cp-btn cp-go cp-sm" data-act="qsearch"><i class="fa-solid fa-magnifying-glass"></i> بحث</button>' +
      (st.q ? '<button type="button" class="cp-btn cp-sm" data-act="qclear">مسح</button>' : '') +
    '</div>';

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
    return renderGuideBanner('trips') + dayNav() + renderSmartRoutePanel() + searchBar + tabs + stTabs + (groups.length ? groups.map(tripGroupCard).join('') : '<div class="cp-empty">' + (st.loaded ? 'مفيش مشاوير مطابقة في اليوم ده' : 'جاري التحميل…') + '</div>');
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
    if (!allConfirmed) links.push('<button type="button" class="cp-a" data-act="on-my-way" data-tx="' + eh(firstTx) + '">🛵 في طريقي</button>');
    links.push('<button type="button" class="cp-a" data-act="save-pin" data-tx="' + eh(firstTx) + '">' + (st.pins[firstTx] ? '📍 لوكيشن مثبت ✓' : '📍 حفظ اللوكيشن') + '</button>');

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
            (notClosed ? '<span class="cp-tag wt">⏳ الموظف لسه ما قفلش المعاملة</span>' : '') +
            nBadge +
          '</div>' +
          (it.services ? '<div style="font-size:11px;color:var(--mu);margin-top:3px">' + eh(it.services) + '</div>' : '') +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">' +
          '<b>' + money(it.amount) + '</b>' +
          '<button type="button" class="cp-a cp-sm" data-act="detail" data-tx="' + eh(it.transaction_id) + '">التفاصيل</button>' +
          (!it.confirmed ? '<button type="button" class="cp-a cp-sm pri" data-act="ask-one" data-type="' + eh(it.type) + '" data-ref="' + eh(itemRef(it)) + '" data-tx="' + eh(it.transaction_id) + '" data-amt="' + eh(it.amount) + '">أكّد ده بس</button>' : '<span class="cp-tag ok">✓ مؤكد</span>') +
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
        (anyNotClosed ? '<span class="cp-tag wt">⏳ الموظف لسه ما قفلش المعاملة</span>' : '') +
      '</div>' +
      (links.length ? '<div class="cp-info">' + links.join('') + '</div>' : '') +
      '<div class="cp-txlist">' + txRowsHtml + '</div>' +
      emp +
    '</div>';
  }

  function singleTripCard(it) {
    const k = KIND[it.type], [sl, sc] = txState(it);
    const notClosed = isNotClosedByStaff(it);
    const nBadge = noteBadgeHtml(it);
    const links = [];
    if (it.phone) links.push(callBtns(it.phone));
    if (it.address || st.pins[it.transaction_id]) links.push('<a class="cp-a" target="_blank" rel="noopener" href="' + eh(smartMapsUrl(it)) + '"><i class="fa-solid fa-location-dot"></i><span>' + eh(it.address || 'فتح اللوكيشن المثبت') + '</span></a>');
    const inRouteIdx = routeIndexOf(it.transaction_id);
    links.push('<button type="button" class="cp-a' + (inRouteIdx !== -1 ? ' pri' : '') + '" data-act="route-toggle" data-tx="' + eh(it.transaction_id) + '"><i class="fa-solid ' + (inRouteIdx !== -1 ? 'fa-check' : 'fa-plus') + '"></i><span>' + (inRouteIdx !== -1 ? 'في خط السير (محطة ' + num(inRouteIdx + 1) + ')' : 'ضيف لخط السير') + '</span></button>');
    if (!it.confirmed) links.push('<button type="button" class="cp-a" data-act="on-my-way" data-tx="' + eh(it.transaction_id) + '">🛵 في طريقي</button>');
    links.push('<button type="button" class="cp-a" data-act="save-pin" data-tx="' + eh(it.transaction_id) + '">' + (st.pins[it.transaction_id] ? '📍 لوكيشن مثبت ✓' : '📍 حفظ اللوكيشن') + '</button>');
    const emp = it.employee ? '<div class="cp-emp"><span>الموظف المسؤول: <b>' + eh(it.employee) + '</b></span>' +
      (it.employee_phone ? '<a class="cp-a tel" href="' + eh(telHref(it.employee_phone)) + '"><i class="fa-solid fa-phone"></i><span>اتصال بالموظف</span></a>' : '') +
      (it.employee_id ? '<button type="button" class="cp-a" data-act="chat-emp" data-uid="' + eh(it.employee_id) + '" data-tx="' + eh(it.transaction_id) + '"><i class="fa-solid fa-comment"></i><span>رسالة للموظف</span></button>' : '') + '</div>' : '';

    return '<div class="cp-card">' +
      '<div class="cp-row">' +
        '<div data-act="detail" data-tx="' + eh(it.transaction_id) + '">' +
          '<div class="cp-name">' + eh(it.client_name || 'بدون اسم') + '</div>' +
          '<div class="cp-sub">رقم المعاملة: <b>' + eh(it.transaction_id) + '</b> (اضغط للتفاصيل)</div>' +
        '</div>' +
        '<div style="text-align:end">' +
          '<b style="font-size:16px">' + money(it.amount) + '</b>' +
          '<div style="margin-top:3px"><span class="cp-tag ' + (it.confirmed ? 'ok' : 'wt') + '">' + (it.confirmed ? '✓ مؤكد ' + eh(timeOf(it.confirmed_at)) : 'بانتظار تأكيدك') + '</span></div>' +
        '</div>' +
      '</div>' +
      '<div class="cp-chips">' +
        '<span class="cp-tag ' + k.cls + '"><i class="fa-solid ' + k.icon + '"></i><span>' + eh(kindLabel(it)) + '</span></span>' +
        '<span class="cp-tag ' + sc + '">' + sl + '</span>' +
        (notClosed ? '<span class="cp-tag wt">⏳ الموظف لسه ما قفلش المعاملة</span>' : '') +
        nBadge +
        (it.type !== 'fee' ? String(it.services || '').split('، ').filter(Boolean).slice(0, 4).map(x => '<span class="cp-chip">' + eh(x) + '</span>').join('') : '') +
      '</div>' +
      (links.length ? '<div class="cp-info">' + links.join('') + '</div>' : '') + emp +
      '<div class="cp-info">' +
        '<button type="button" class="cp-a" data-act="detail" data-tx="' + eh(it.transaction_id) + '"><i class="fa-solid fa-eye"></i><span>تفاصيل العميل</span></button>' +
        (!it.confirmed ? '<button type="button" class="cp-a pri" data-act="ask-one" data-type="' + eh(it.type) + '" data-ref="' + eh(itemRef(it)) + '" data-tx="' + eh(it.transaction_id) + '" data-amt="' + eh(it.amount) + '"><i class="fa-solid fa-check"></i><span>أكّد ده بس</span></button>' : '') +
        '<button type="button" class="cp-a" data-act="note" data-tx="' + eh(it.transaction_id) + '"><i class="fa-solid fa-note-sticky"></i><span>ملاحظة للموظف' + (Number(it.my_notes) ? ' (' + num(it.my_notes) + ')' : '') + '</span></button>' +
      '</div>' +
    '</div>';
  }

  /* ---------- 3) لوحة الترتيب ---------- */
  function renderLeaderboardInner(rows) {
    if (!rows || !rows.length) {
      return '<div class="cp-empty">' + (st.lbLoaded ? 'لا توجد بيانات ترتيب في هذه الفترة' : 'جاري تحميل لوحة الترتيب…') + '</div>';
    }
    const me = rows.find(r => r.is_me);
    let motivHtml = '';
    if (me) {
      if (Number(me.rank) === 1 && Number(me.total_trips) > 0) {
        motivHtml = '<div class="cp-motiv"><span>🥇 ما شاء الله يا <b>' + eh(me.name) + '</b>! أنت في <b>المركز الأول</b> بإجمالي <b>' + num(me.total_trips) + ' مشوار</b>.</span></div>';
      } else {
        const above = rows.find(r => Number(r.rank) < Number(me.rank));
        const diff = above ? Math.max(1, Number(above.total_trips) - Number(me.total_trips) + 1) : 1;
        motivHtml = '<div class="cp-motiv"><span>💪 مركزك الحالي <b>#' + num(me.rank) + '</b> (' + num(me.total_trips) + ' مشوار) — فاضلك <b>' + num(diff) + ' مشوار</b> وتتقدم للمركز اللي قبلك!</span></div>';
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
      ? '<div class="cp-podium">' + podCard(top2, 'r2', '🥈', 'المركز الثاني') + podCard(top1, 'r1', '🥇', 'المركز الأول') + podCard(top3, 'r3', '🥉', 'المركز الثالث') + '</div>'
      : '';

    const listHtml = rows.map(r => {
      const rk = Number(r.rank) || 1;
      const rkCls = rk === 1 ? 'r1' : rk === 2 ? 'r2' : rk === 3 ? 'r3' : '';
      const medal = rk === 1 ? '🥇' : rk === 2 ? '🥈' : rk === 3 ? '🥉' : '#' + num(rk);
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
    const oldBox = oldDays.length ? '<div class="cp-old">⚠ عندك أيام قبل كده لسه ما اتأكدتش (اضغط على اليوم لمراجعته):<br>' + oldDays.map(d => '<button type="button" class="cp-a" data-act="dset" data-day="' + d + '">' + eh(dayLabel(d)) + ' (' + num(old[d]) + ' مشوار)</button>').join('') + '</div>' : '';
    const all = itemsOf(st.day);

    const renderRevItem = i => {
      const notClosed = isNotClosedByStaff(i);
      const nBadge = noteBadgeHtml(i);
      return '<div class="cp-rev">' +
        '<div style="min-width:0;flex:1">' +
          '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">' +
            '<b class="cp-name" style="font-size:13.5px" data-act="detail" data-tx="' + eh(i.transaction_id) + '">' + eh(i.client_name || 'بدون اسم') + '</b>' +
            '<span dir="ltr" style="font-weight:700;font-size:11.5px;color:var(--mu)">' + eh(i.transaction_id) + '</span>' +
            (i.type === 'fee' ? '<span class="cp-chip">' + (i.fee_kind === 'round' ? 'ذهاب وعودة' : 'ذهاب فقط') + '</span>' : '') +
          '</div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:4px">' +
            (notClosed ? '<span class="cp-tag wt">⏳ الموظف لسه ما قفلش المعاملة</span>' : '') +
            nBadge +
          '</div>' +
        '</div>' +
        '<div style="text-align:end;display:flex;flex-direction:column;align-items:flex-end;gap:4px">' +
          '<b>' + money(i.amount) + '</b>' +
          '<div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end">' +
            '<button type="button" class="cp-a cp-sm" data-act="detail" data-tx="' + eh(i.transaction_id) + '">التفاصيل</button>' +
            (!i.confirmed
              ? '<button type="button" class="cp-a cp-sm pri" data-act="ask-one" data-type="' + eh(i.type) + '" data-ref="' + eh(itemRef(i)) + '" data-tx="' + eh(i.transaction_id) + '" data-amt="' + eh(i.amount) + '">أكّد ده بس</button>'
              : '<span class="cp-tag ok">✓ مؤكد</span>') +
            '<button type="button" class="cp-a cp-sm" data-act="note" data-tx="' + eh(i.transaction_id) + '"><i class="fa-solid fa-flag"></i><span>ملاحظة</span></button>' +
          '</div>' +
        '</div>' +
      '</div>';
    };

    const sec = k => {
      const rows = all.filter(i => i.type === k); if (!rows.length) return '';
      const pend = rows.filter(i => !i.confirmed), tot = rows.reduce((a, i) => a + Number(i.amount || 0), 0), ptot = pend.reduce((a, i) => a + Number(i.amount || 0), 0);
      const last = rows.filter(i => i.confirmed_at).map(i => i.confirmed_at).sort().pop();
      const groups = groupItemsByClient(rows);

      const groupsHtml = groups.map(g => {
        if (g.items.length === 1) return renderRevItem(g.items[0]);
        const gTot = g.items.reduce((a, x) => a + Number(x.amount || 0), 0);
        return '<div class="cp-rev-grp">' +
          '<div class="cp-row" style="margin-bottom:4px">' +
            '<div class="cp-name" style="font-size:14px" data-act="detail" data-tx="' + eh(g.items[0].transaction_id) + '">' +
              eh(g.client_name) + ' <span class="cp-tag k-pk">' + num(g.items.length) + ' ريكوستات</span>' +
            '</div>' +
            '<b>إجمالي العميل: ' + money(gTot) + '</b>' +
          '</div>' +
          g.items.map(renderRevItem).join('') +
        '</div>';
      }).join('');

      return '<div class="cp-card">' +
        '<div class="cp-row"><b>' + KIND[k].sec + '</b><span class="cp-tag ' + KIND[k].cls + '">' + num(rows.length) + ' مشوار · ' + money(tot) + '</span></div>' +
        '<div style="margin-top:6px">' + groupsHtml + '</div>' +
        (pend.length
          ? '<button type="button" class="cp-big" data-act="ask" data-kind="' + k + '" data-n="' + pend.length + '" data-amt="' + ptot + '">' + KIND[k].btn + ' للكل (' + num(pend.length) + ' مشوار · ' + money(ptot) + ')</button>'
          : '<div class="cp-done">✓ اتأكد بالكامل' + (last ? ' الساعة ' + eh(timeOf(last)) : '') + '</div>') +
      '</div>';
    };
    const body = ['pickup', 'delivery', 'fee'].map(sec).join('');
    return renderGuideBanner('review') + dayNav() + oldBox + (body || '<div class="cp-empty">' + (st.loaded ? 'مفيش مشاوير مسجلة في اليوم ده' : 'جاري التحميل…') + '</div>');
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
        '<small>' + (online(c) ? '🟢 متصل الآن' : (c.last_seen_at ? 'آخر ظهور ' + eh(timeOf(c.last_seen_at)) : '')) + '</small></div>' +
        (Number(c.unread) ? '<span class="cp-ub">' + num(c.unread) + '</span>' : '') + '</div>' +
        (c.phone ? '<div class="cp-info">' + callBtns(c.phone, 'اتصال') + '</div>' : '') + '</div>';
    }).join('');
    b.innerHTML = renderGuideBanner('chat') + (rows || '<div class="cp-empty">' + (st.loaded ? 'مفيش جهات اتصال' : 'جاري التحميل…') + '</div>');
  }
  function convView() {
    const b = $('cp-body'), c = st.chat; if (!b) return;
    b.innerHTML = '<div class="cp-chat"><div class="cp-chead"><button type="button" class="cp-btn cp-sm" data-act="chat-back">رجوع للقائمة</button><b>' + eh(c.name) + '</b>' + (c.phone ? callBtns(c.phone, '') : '') + '</div>' +
      '<div class="cp-msgs" id="cp-msgs"></div>' + (c.tx ? '<div class="cp-sub" style="margin-top:6px">بخصوص معاملة <b>' + eh(c.tx) + '</b> <button type="button" class="cp-a cp-sm" data-act="chat-notx">إلغاء الإشارة</button></div>' : '') +
      '<div class="cp-comp"><textarea id="cp-msg" class="cp-field" rows="1" placeholder="اكتب رسالتك هنا…">' + eh(st.draft) + '</textarea><button type="button" class="cp-btn cp-go" data-act="chat-send">إرسال</button></div></div>';
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
        const t = today(), r = await sbClient.rpc('courier_items', { p_from: addDays(t, -62), p_to: t });
        if (r.error) throw r.error;
        setOffline(false);
        const rawData = Array.isArray(r.data) ? r.data : []; const data = rawData.filter(x => x && (x.type === 'fee' || Number(x.lines) > 0 || (x.client_name && String(x.client_name).trim() && String(x.client_name).trim() !== 'بدون اسم'))); const sig = JSON.stringify(data);
        st.loaded = true;
        st.lastSync = Date.now();
        if (sig !== st.sig) { st.sig = sig; st.items = data; renderNav(); if (st.tab !== 'chat') renderTab(false); }
        return true;
      } catch (e) {
        setOffline(true);
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
        if (u1 > u0 && st.loaded && !(st.chat)) toast('وصلتك رسالة جديدة 💬');
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
    if (st.tick % 30 === 0) { loadItems(true); loadMyNotes(); loadContacts(true); }
    if (st.tick % 90 === 0) loadLeaderboard(true);
    if (st.tick % 60 === 0) sbClient.rpc('touch_last_seen');
    if (st.tick % 900 === 0) checkPendingReminders(false);
  }

  /* ---------- مودالات: تفاصيل العميل (A.2) + التأكيد الفردي (B.1) + الملاحظة (B.3/B.4) + ملفي الشخصي ---------- */
  function modal(html) { const r = $('cp-modal-root'); if (!r) return; r.innerHTML = '<div class="cp-modal" data-act="mclose"><div class="cp-box">' + html + '</div></div>'; const f = r.querySelector('textarea,input'); if (f) setTimeout(() => f.focus(), 60); }
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

    const linesHtml = lines.length
      ? lines.map(l => {
          const [stLbl, stCls] = STATUS_AR[l.status] || [l.status || 'جاري التنفيذ', 'k-pk'];
          return '<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;padding:5px 0;border-bottom:1px dashed var(--bd);font-size:12px">' +
            '<span>• ' + eh(l.service || 'خدمة') + (l.received_at ? ' <small style="color:var(--mu)">(' + eh(String(l.received_at).slice(0, 10)) + ')</small>' : '') + '</span>' +
            '<span class="cp-tag ' + stCls + '">' + eh(stLbl) + '</span>' +
          '</div>';
        }).join('')
      : '<div style="font-size:12px;color:var(--mu)">' + eh((fallbackItem && fallbackItem.services) || 'لا توجد تفاصيل خدمات') + '</div>';

    const tripsHtml = trips.length
      ? trips.map(t => {
          const kl = t.kind === 'pickup' ? '📥 استلمت من العميل' : '📤 سلّمت للعميل';
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
      ? '<div class="cp-dtl-sec"><b class="hd">📨 ملاحظاتك المسجلة على المعاملة (' + num(notes.length) + '):</b>' +
          notes.map(n => '<div style="font-size:11.5px;padding:4px 0;border-bottom:1px dashed var(--bd)">' + eh(n.body) + ' <small style="color:var(--mu)">(' + eh(timeOf(n.at)) + ')</small></div>').join('') +
        '</div>'
      : '';

    const unconfirmedItems = st.items.filter(x => String(x.transaction_id) === String(tx) && !x.confirmed);

    modal(
      '<h3>' + eh(clientName) + '</h3>' +
      '<p>رقم المعاملة: <b dir="ltr">' + eh(tx) + '</b></p>' +
      switcherHtml +
      (notClosed ? '<div class="cp-warn-box">⏳ الموظف لسه ما قفلش المعاملة بالكامل على السيستم. لو سلّمتها فعلاً للعميل تقدر تبعت ملاحظة للموظف أو تأكد مشوارك.</div>' : '') +
      '<div class="cp-info-box">💡 الريكوست بيفضل ظاهر في قائمتك لحد ما الموظف يقفله أو أنت تأكده.</div>' +
      (contactLinks.length ? '<div class="cp-info" style="margin-bottom:10px">' + contactLinks.join('') + '</div>' : '') +
      '<div class="cp-dtl-sec"><b class="hd">الخدمات وحالتها (بدون أسعار العميل):</b>' + linesHtml + '</div>' +
      '<div class="cp-dtl-sec"><b class="hd">تواريخ استلامك وتسليمك على المعاملة:</b>' + tripsHtml + '</div>' +
      empHtml +
      notesHtml +
      '<div class="cp-btns">' +
        unconfirmedItems.map(u => '<button type="button" class="cp-btn cp-go" data-act="ask-one" data-type="' + eh(u.type) + '" data-ref="' + eh(itemRef(u)) + '" data-tx="' + eh(u.transaction_id) + '" data-amt="' + eh(u.amount) + '">✓ أكّد ده بس (' + eh(KIND[u.type].label) + ' · ' + money(u.amount) + ')</button>').join('') +
        '<button type="button" class="cp-btn" data-act="note" data-tx="' + eh(tx) + '"><i class="fa-solid fa-flag"></i> ملاحظة للموظف</button>' +
        '<button type="button" class="cp-btn" data-act="mclose-btn">إغلاق</button>' +
      '</div>'
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
    ['note', '🛵 ملاحظة للموظف'],
    ['problem', '🚩 مشكلة في المعاملة أو العميل'],
    ['missing_fee', '⚠ المشوار برسوم توصيل ومش متسجّل لي رسوم']
  ];
  const QUICK_NOTES = [
    '✅ تم التسليم',
    '✅ تم الاستلام',
    '📞 العميل لا يرد على التليفون',
    '📅 العميل طلب تأجيل الموعد',
    '📍 العنوان غير واضح ومحتاج تواصل'
  ];

  async function askNote(tx) {
    const o = byTx(tx); st.noteKind = 'note';
    modal('<h3>ملاحظة للموظف</h3><p>على معاملة <b>' + eh(o ? o.client_name : '') + '</b> (<b dir="ltr">' + eh(tx) + '</b>). بتظهر كتعليق على المعاملة وبيوصل إشعار فوري للموظف المسؤول وللمدير.</p>' +
      '<div class="cp-info-box">📌 ملاحظة مهمة: الريكوست بيفضل ظاهر لحد ما الموظف يقفله أو انت تأكده بزرار «أكّد ده بس».</div>' +
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
      /* تحديث فوري لعلامة 📨 أبلغت الموظف (البند B.3) */
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
      ? '<div class="cp-warn-box">⏳ تنبيه: الموظف لسه ما قفلش المعاملة دي على السيستم. متأكد إنك نفذت المشوار وعايز تأكده دلوقتي؟</div>'
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
      ? '<div class="cp-warn-box">⏳ تنبيه: فيه <b>' + num(unclosedCount) + ' معاملة</b> الموظف لسه ما قفلهاش على السيستم. تقدر تأكد كل ريكوست لوحده بزرار «أكّد ده بس» أو تكمل التأكيد الجماعي لو متأكد.</div>'
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
    if (e.target && e.target.id === 'cp-trip-q') st.q = e.target.value;
  }
  function onClick(e) {
    const el = e.target.closest('[data-act],[data-tab],[data-per],[data-month],[data-lbper],[data-type],[data-sfilter]'); if (!el) return;
    if (!el.dataset.act) {
      if (el.dataset.tab) return setTab(el.dataset.tab);
      if (el.dataset.per) { st.period = el.dataset.per; return renderTab(false); }
      if (el.dataset.month) { st.month = el.dataset.month; return renderTab(false); }
      if (el.dataset.lbper) { st.lbPeriod = el.dataset.lbper; st.lbsig = ''; renderTab(false); return loadLeaderboard(false); }
      if (el.dataset.type) { st.type = el.dataset.type; return renderTab(false); }
      if (el.dataset.sfilter) { st.statusFilter = el.dataset.sfilter; return renderTab(false); }
    }
    const a = el.dataset.act, tx = el.dataset.tx;
    switch (a) {
      case 'mclose': if (e.target === el) closeModal(); return;
      case 'mclose-btn': return closeModal();
      case 'logout': return window.handleLogout && window.handleLogout();
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
      case 'route-autosort': return autoOptimizeRoute(true);
      case 'route-clear': return clearRoute();
      case 'on-my-way': return startOnMyWay(tx);
      case 'save-pin': return saveClientPin(tx);
      case 'bag-toggle': {
        const k = String(tx || '');
        if (k) { st.bagHanded[k] = !st.bagHanded[k]; saveBagState(); renderTab(false); }
        return;
      }
      case 'qr-scan': return openQrScannerModal();
      case 'qr-close': stopQrCamera(); return closeModal();
      case 'qr-go': {
        const inp = $('cp-qr-manual');
        const code = extractTxFromScan(inp ? inp.value : '');
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
