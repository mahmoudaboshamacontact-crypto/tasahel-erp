/* =====================================================================
   المرحلة 18: داشبورد شاملة بتفهّمك شغلك + حركة وقت الضغط بس (من غير أي أنيميشن دايم)
   - كل الأرقام بتتحسب من allRequestLines (محمّلة أصلاً) → مفيش تقل إضافي على الشبكة
   - الحاجات الإضافية (مهام/كاش/مناديب/حضور) بتتسحب مرة كل 90 ثانية وللمدير بس
   ===================================================================== */
(function () {
  if (window.__phase18) return; window.__phase18 = true;
  const eh = escapeHtml, DAY = 864e5, num = v => Number(v) || 0;
  const reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const mgr = () => window.__role ? window.__role === 'manager' : !!(currentUser && ['mahmoud.aboshama@tasahel.com.eg', 'mahmoud.aboshama.contact@gmail.com'].includes(String(currentUser.email || '').toLowerCase()));

  /* ---------------------------------------------------------------
     0) حركة وقت الضغط: لفّة نيون واحدة حوالين الكارت اللي اتضغط عليه
     --------------------------------------------------------------- */
  document.addEventListener('pointerdown', function (e) {
    if (reduce || !e.target || !e.target.closest) return;
    const c = e.target.closest('#app .card, #app .mobile-card, #app .dx-card, #app .hm-nav-card, #app .hm-emp-card, #dsh-kpis > div, #comm-totals > div, #today-strip > div');
    if (!c || c.classList.contains('p18-ring')) return;
    const fix = getComputedStyle(c).position === 'static';
    if (fix) c.style.position = 'relative';
    c.classList.add('p18-ring');
    const end = () => { c.classList.remove('p18-ring'); if (fix) c.style.position = ''; };
    c.addEventListener('animationend', end, { once: true });
    setTimeout(end, 1300);
  }, { passive: true });

  /* تبديل الوضع الليلي/النهاري فوري: بنوقف الـ transitions لحظياً */
  const _tg = window.toggleDarkMode;
  if (typeof _tg === 'function') window.toggleDarkMode = function () {
    const h = document.documentElement; h.classList.add('p18-switching');
    const r = _tg.apply(this, arguments);
    requestAnimationFrame(function () { requestAnimationFrame(function () { h.classList.remove('p18-switching'); }); });
    return r;
  };

  /* أي إجراء من المستخدم على الداشبورد = يسمح بحركة واحدة */
  const act = () => { window.__p18act = true; };
  ['setDashboardRange', 'dashRefresh'].forEach(function (n) {
    const f = window[n]; if (typeof f === 'function') window[n] = function () { act(); return f.apply(this, arguments); };
  });
  const _st = window.switchTab;
  if (typeof _st === 'function') window.switchTab = function (id) { if (id === 'dash') act(); return _st.apply(this, arguments); };

  /* ---------------------------------------------------------------
     1) أدوات
     --------------------------------------------------------------- */
  const sod = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const money = v => formatCurrency(v);
  const pc = (a, b) => b ? Math.round(a / b * 100) : 0;
  const netS = l => window.Money ? window.Money.lineNet(l).sales : num(l.total);
  const netC = l => window.Money ? window.Money.lineNet(l).cost : execCostOf(l);
  const stOf = l => l.status || 'In Progress';
  const STG = { 'In Progress': '245,158,11', 'Under Review': '244,63,94', 'Complete': '14,165,233', 'Delivered': '16,185,129' };
  const PAL = ['13,148,136', '37,99,235', '139,92,246', '245,158,11', '236,72,153', '100,116,139', '16,185,129', '244,63,94'];
  const WD = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const WORDER = [6, 0, 1, 2, 3, 4, 5];
  const discOf = l => {
    const d = num(l.discount_pct); if (d <= 0) return 0;
    const lp = num(l.list_price), q = num(l.qty) || 1, t = num(l.total);
    return lp > 0 ? Math.max(0, lp * q - t) : (d < 100 ? t * d / (100 - d) : 0);
  };
  const dueOf = l => {
    if (l.duration_days == null || l.duration_days === '') return null;
    const b = new Date(String(l.exec_start_date || lineDate(l) || '').slice(0, 10) + 'T00:00'); if (isNaN(b)) return null;
    return new Date(b.getTime() + num(l.duration_days) * DAY);
  };
  const curRange = () => ['today', 'week', 'month'].find(r => { const b = $('dash-btn-' + r); return b && /(^|\s)bg-white(\s|$)/.test(b.className); }) || 'month';
  function windows(r) {
    const now = new Date(), t0 = sod(now), E = new Date(t0.getTime() + DAY);
    if (r === 'today') return { S: t0, E, PS: new Date(t0 - DAY), PE: t0, label: 'اليوم', plabel: 'أمس' };
    if (r === 'week') { const S = new Date(t0 - 6 * DAY); return { S, E, PS: new Date(S - 7 * DAY), PE: S, label: 'آخر 7 أيام', plabel: 'الـ7 أيام السابقة' }; }
    const S = new Date(now.getFullYear(), now.getMonth(), 1), PS = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    let PE = new Date(PS.getFullYear(), PS.getMonth(), now.getDate() + 1); if (PE > S) PE = S;
    return { S, E, PS, PE, label: 'هذا الشهر', plabel: 'الشهر السابق' };
  }
  function agg(rs) {
    const tx = new Set(); let sales = 0, cost = 0, disc = 0, cash = 0, items = 0, qty = 0;
    rs.forEach(x => {
      const l = x.l, v = netS(l); sales += v; cost += netC(l); disc += discOf(l); items++; qty += num(l.qty) || 0;
      if (l.transaction_id) tx.add(l.transaction_id);
      if ((l.payment_method || 'كاش').trim() === 'كاش') cash += v;
    });
    return { sales, cost, net: sales - cost, disc, cash, items, qty, tx: tx.size, avg: tx.size ? sales / tx.size : 0 };
  }
  function group(rs, kf, vf) {
    const m = new Map();
    rs.forEach(x => { const k = kf(x); if (k == null || k === '') return; const g = m.get(k) || { k, v: 0, n: 0, tx: new Set(), rs: [] }; g.v += vf ? vf(x) : netS(x.l); g.n++; if (x.l.transaction_id) g.tx.add(x.l.transaction_id); g.rs.push(x); m.set(k, g); });
    return [...m.values()].sort((a, b) => b.v - a.v);
  }
  const delta = (c, p) => !p ? '' : (function () { const d = Math.round((c - p) / Math.abs(p) * 100); return (d >= 0 ? '▲ ' : '▼ ') + Math.abs(d) + '%'; })();
  const ico = (c, i) => '<span class="dx-ico" style="--c:' + c + '"><i class="fa-solid ' + i + '"></i></span>';
  const bar = (w, c, i) => '<div class="dx-track"><div class="dx-bar" style="--w:' + Math.max(1, Math.min(100, w)).toFixed(1) + '%;--c:' + c + ';--i:' + (i || 0) + '"></div></div>';
  let idx = 0;
  const card = (title, icon, c, body, extra, cls) => '<div class="dx-card ' + (cls || '') + '" style="--i:' + (idx++) + '"><div class="dx-h"><h3><i class="fa-solid ' + icon + '" style="color:rgb(' + c + ')"></i>' + title + '</h3>' + (extra ? '<small>' + extra + '</small>' : '') + '</div>' + body + '</div>';
  const none = t => '<div class="dx-empty">' + (t || 'لا توجد بيانات كافية') + '</div>';

  /* ---------------------------------------------------------------
     2) الحسابات (مرة واحدة لكل رسم)
     --------------------------------------------------------------- */
  function compute() {
    const r = curRange(), W = windows(r), now = new Date(), t0 = sod(now);
    const all = []; allRequestLines.forEach(l => { const t = new Date(lineDate(l)); if (!isNaN(t)) all.push({ l, t }); });
    const inW = (x, a, b) => x.t >= a && x.t < b;
    const cur = all.filter(x => inW(x, W.S, W.E)), prv = all.filter(x => inW(x, W.PS, W.PE));
    const today = all.filter(x => inW(x, t0, new Date(t0.getTime() + DAY)));
    const open = all.filter(x => stOf(x.l) !== 'Delivered');
    const mS = new Date(now.getFullYear(), now.getMonth(), 1), month = all.filter(x => x.t >= mS);
    return { r, W, now, t0, all, cur, prv, today, open, month, A: agg(cur), P: agg(prv), T: agg(today), M: agg(month) };
  }

  /* ---------------------------------------------------------------
     3) التنبيهات (اللي محتاج تدخل) — كل تنبيه بيتفتح ويوريك المعاملات
     --------------------------------------------------------------- */
  let alertData = new Map();
  function buildAlerts(X) {
    const a = []; alertData = new Map();
    const add = (key, label, c, ic, rows, fmt) => { if (rows.length) a.push({ key, label, c, ic, rows, fmt }); };
    const age = x => Math.floor((X.now - x.t) / DAY);
    const lateRows = []; X.open.forEach(x => { if (stOf(x.l) === 'Complete') return; const d = dueOf(x.l); if (!d) return; const dl = Math.floor((X.t0 - d) / DAY); if (dl > 0) lateRows.push({ x, k: dl }); });
    lateRows.sort((p, q) => q.k - p.k);
    add('late', 'متأخرة عن موعد التسليم', '244,63,94', 'fa-clock', lateRows, r => 'متأخر ' + r.k + ' يوم');
    const ready = X.open.filter(x => stOf(x.l) === 'Complete' && age(x) >= 2).map(x => ({ x, k: age(x) })).sort((p, q) => q.k - p.k);
    add('ready', 'جاهزة ومستنية تسليم للعميل', '14,165,233', 'fa-box-open', ready, r => 'من ' + r.k + ' يوم');
    const rev = X.open.filter(x => stOf(x.l) === 'Under Review' && age(x) >= 2).map(x => ({ x, k: age(x) })).sort((p, q) => q.k - p.k);
    add('rev', 'قيد المراجعة من أكتر من يومين', '245,158,11', 'fa-magnifying-glass', rev, r => 'من ' + r.k + ' يوم');
    const nod = X.open.filter(x => stOf(x.l) === 'In Progress' && (x.l.duration_days == null || x.l.duration_days === '') && age(x) >= 3).map(x => ({ x, k: age(x) })).sort((p, q) => q.k - p.k);
    add('nod', 'مفتوحة من غير موعد تسليم', '100,116,139', 'fa-calendar-xmark', nod, r => 'من ' + r.k + ' يوم');
    const noe = X.open.filter(x => stOf(x.l) === 'In Progress' && !(x.l.executor || '').trim() && age(x) >= 1).map(x => ({ x, k: age(x) })).sort((p, q) => q.k - p.k);
    add('noe', 'قيد التنفيذ من غير منفذ محدد', '139,92,246', 'fa-user-slash', noe, r => 'من ' + r.k + ' يوم');
    const loss = X.month.filter(x => num(x.l.total) > 0 && execCostOf(x.l) > num(x.l.total)).map(x => ({ x, k: execCostOf(x.l) - num(x.l.total) })).sort((p, q) => q.k - p.k);
    add('loss', 'بنود تكلفتها أعلى من سعرها (خسارة)', '225,29,72', 'fa-arrow-trend-down', loss, r => 'خسارة ' + money(r.k));
    const zero = X.month.filter(x => num(x.l.total) <= 0).map(x => ({ x, k: 0 }));
    add('zero', 'بنود بسعر صفر', '168,85,247', 'fa-circle-exclamation', zero, () => 'السعر صفر');
    const bigd = X.month.filter(x => num(x.l.discount_pct) >= 20).map(x => ({ x, k: num(x.l.discount_pct) })).sort((p, q) => q.k - p.k);
    add('bigd', 'خصومات 20% أو أكتر', '234,88,12', 'fa-percent', bigd, r => 'خصم ' + fmtNum(r.k) + '%');
    const nph = []; const seen = new Set(); X.month.forEach(x => { const t = x.l.transaction_id; if (!(x.l.phone || '').trim() && t && !seen.has(t)) { seen.add(t); nph.push({ x, k: 0 }); } });
    add('nph', 'معاملات من غير رقم تليفون للعميل', '71,85,105', 'fa-phone-slash', nph, () => 'بدون تليفون');
    return a;
  }
  function alertsHtml(X, extra) {
    const al = buildAlerts(X).slice();
    if (extra && extra.tasksLate && extra.tasksLate.length) al.push({ key: 'tk', label: 'مهام متأخرة', c: '37,99,235', ic: 'fa-list-check', rows: extra.tasksLate.map(t => ({ t, k: 0 })), fmt: r => '', task: true });
    if (!al.length) return '<div class="dx-ok"><i class="fa-solid fa-circle-check"></i>كله تمام: مفيش متأخرات ولا حاجة محتاجة تدخل دلوقتي</div>';
    al.forEach(a => alertData.set(a.key, a));
    const chips = al.map((a, i) => '<button type="button" class="dx-al" data-al="' + a.key + '" aria-expanded="false" style="--c:' + a.c + '"><span class="dx-ico" style="--c:' + a.c + '"><i class="fa-solid ' + a.ic + '"></i></span><span class="n">' + a.rows.length + '</span><span class="t">' + eh(a.label) + '</span></button>').join('');
    return '<div class="dx-alerts" id="dx-alerts">' + chips + '</div>';
  }
  function alertList(key) {
    const a = alertData.get(key); if (!a) return '';
    const rows = a.rows.slice(0, 8).map(r => {
      if (a.task) return '<div><span class="truncate font-semibold">' + eh(r.t.title || 'مهمة') + '</span><span class="text-slate-400">' + eh(formatDateOnly(r.t.due_at)) + '</span></div>';
      const l = r.x.l;
      return '<div><span class="min-w-0 truncate"><button ' + at(l.transaction_id) + ' class="font-mono text-brand-600 hover:underline" dir="ltr">' + eh(l.transaction_id) + '</button> · ' + eh(l.client_name || '—') + ' · <span class="text-slate-400">' + eh(l.service || '') + '</span></span><span class="shrink-0 font-semibold" style="color:rgb(' + a.c + ')">' + eh(a.fmt(r)) + '</span></div>';
    }).join('');
    const more = a.rows.length > 8 ? '<div class="text-slate-400">+ ' + (a.rows.length - 8) + ' بند تانيين</div>' : '';
    return '<div class="dx-al-list" data-for="' + key + '">' + rows + more + '</div>';
  }

  /* ---------------------------------------------------------------
     4) الخلاصة الذكية: جمل بتقولك شغلك ماشي إزاي
     --------------------------------------------------------------- */
  function insights(X) {
    const o = [], A = X.A, P = X.P, W = X.W;
    const add = (c, ic, h) => o.push('<div class="dx-ins-row">' + ico(c, ic) + '<div>' + h + '</div></div>');
    if (!A.items) { add('100,116,139', 'fa-inbox', 'لسه مفيش معاملات متسجلة في <b>' + W.label + '</b>.'); return o.join(''); }
    const d = delta(A.sales, P.sales);
    add('13,148,136', 'fa-coins', 'إيراد <b>' + W.label + '</b> <b>' + money(A.sales) + '</b> من <b>' + A.tx + '</b> معاملة (' + A.items + ' بند)' + (d ? '، ' + (A.sales >= P.sales ? 'أعلى' : 'أقل') + ' من ' + W.plabel + ' بنسبة <b>' + d.slice(2) + '</b>' : '') + '.');
    add('5,150,105', 'fa-chart-line', 'صافي الهامش <b>' + money(A.net) + '</b> بنسبة <b>' + pc(A.net, A.sales) + '%</b> من الإيراد، وتكلفة التنفيذ ' + money(A.cost) + '.');
    if (X.r === 'month') {
      const dm = new Date(X.now.getFullYear(), X.now.getMonth() + 1, 0).getDate(), el = X.now.getDate();
      if (el >= 3) add('99,102,241', 'fa-bullseye', 'بالمعدل الحالي الشهر هيقفل على حوالي <b>' + money(A.sales / el * dm) + '</b> (عدّى ' + el + ' يوم من ' + dm + ').');
    }
    const sv = group(X.cur, x => (x.l.service || '').trim()), em = group(X.cur, x => (x.l.employee || '').trim());
    if (sv[0]) add('139,92,246', 'fa-layer-group', 'أكتر خدمة إيراداً <b>' + eh(sv[0].k) + '</b> (' + pc(sv[0].v, A.sales) + '% من الإيراد).');
    if (em[0]) add('37,99,235', 'fa-user-check', 'أعلى موظف مبيعاً <b>' + eh(em[0].k) + '</b> بـ ' + money(em[0].v) + ' من ' + em[0].tx.size + ' معاملة.');
    const op = X.open.length, lateN = alertData.get('late') ? alertData.get('late').rows.length : 0;
    add(lateN ? '244,63,94' : '16,185,129', lateN ? 'fa-triangle-exclamation' : 'fa-circle-check', 'عندك <b>' + op + '</b> بند لسه مش متسلّم' + (lateN ? '، منهم <b>' + lateN + '</b> متأخر عن الموعد.' : ' ومفيش حاجة متأخرة.'));
    add('245,158,11', 'fa-money-bill-wave', 'الكاش <b>' + pc(A.cash, A.sales) + '%</b> من التحصيل (' + money(A.cash) + ')' + (A.disc > 0 ? '، والخصومات اللي اتمنحت <b>' + money(A.disc) + '</b>.' : '.'));
    return o.join('');
  }
  function todayCard(X) {
    const T = X.T, byDay = new Map(); X.all.forEach(x => { const k = dayKey(x.t); byDay.set(k, (byDay.get(k) || 0) + netS(x.l)); });
    const tk = dayKey(X.now); byDay.delete(tk);
    const days = [...byDay.values()].filter(v => v > 0), avgDay = days.length ? days.reduce((a, b) => a + b, 0) / days.length : 0;
    const same = []; X.all.forEach(x => { if (x.t.getDay() === X.now.getDay() && dayKey(x.t) !== tk) same.push(netS(x.l)); });
    const ratio = avgDay ? T.sales / avgDay * 100 : 0;
    const last = X.today.length ? X.today.reduce((m, x) => x.t > m ? x.t : m, X.today[0].t) : null;
    const mins = last ? Math.max(0, Math.round((X.now - last) / 6e4)) : null;
    const stc = { 'In Progress': 0, 'Under Review': 0, 'Complete': 0, 'Delivered': 0 }; X.today.forEach(x => { stc[stOf(x.l)]++; });
    const chips = Object.keys(stc).map(k => '<span class="dx-pill" style="--c:' + STG[k] + '">' + eh(statusLabel(k)) + ' ' + stc[k] + '</span>').join(' ');
    return '<div class="grid grid-cols-3 gap-3 text-center"><div><div class="text-[11px] text-slate-500">مبيعات اليوم</div><div class="font-mono font-bold text-ink dark:text-white text-sm">' + money(T.sales) + '</div></div>' +
      '<div><div class="text-[11px] text-slate-500">معاملات</div><div class="font-mono font-bold text-ink dark:text-white text-sm">' + T.tx + '</div></div>' +
      '<div><div class="text-[11px] text-slate-500">متوسط المعاملة</div><div class="font-mono font-bold text-ink dark:text-white text-sm">' + money(T.avg) + '</div></div></div>' +
      '<div class="mt-4"><div class="flex justify-between text-[11px] text-slate-500"><span>اليوم مقابل متوسط اليوم النشط (' + money(avgDay) + ')</span><b class="font-mono text-ink dark:text-white">' + Math.round(ratio) + '%</b></div>' + bar(Math.min(100, ratio), ratio >= 100 ? '16,185,129' : ratio >= 60 ? '13,148,136' : '245,158,11', 0) + '</div>' +
      '<div class="mt-3 flex flex-wrap gap-1.5">' + chips + '</div>' +
      '<div class="dx-sub mt-2">' + (mins == null ? 'لسه مفيش معاملة النهاردة' : 'آخر معاملة من ' + (mins < 60 ? mins + ' دقيقة' : Math.floor(mins / 60) + ' ساعة')) + (T.disc > 0 ? ' · خصومات اليوم ' + money(T.disc) : '') + '</div>';
  }

  /* ---------------------------------------------------------------
     5) بلاطات سريعة
     --------------------------------------------------------------- */
  function tiles(X) {
    const cur = X.cur; if (!cur.length) return '';
    const days = group(cur, x => dayKey(x.t)), sv = group(cur, x => (x.l.service || '').trim()), em = group(cur, x => (x.l.employee || '').trim());
    const A = X.A, dl = cur.filter(x => stOf(x.l) === 'Delivered').length;
    const T = [
      ['fa-trophy', '245,158,11', 'أفضل يوم', days[0] ? formatDateOnly(days[0].k) : '—', days[0] ? money(days[0].v) : ''],
      ['fa-gauge-high', '13,148,136', 'متوسط اليوم النشط', money(days.length ? A.sales / days.length : 0), days.length + ' يوم نشط'],
      ['fa-layer-group', '139,92,246', 'أكتر خدمة إيراداً', sv[0] ? sv[0].k : '—', sv[0] ? money(sv[0].v) : ''],
      ['fa-user-check', '37,99,235', 'أنشط موظف', em[0] ? em[0].k : '—', em[0] ? money(em[0].v) : ''],
      ['fa-money-bill-wave', '16,185,129', 'نسبة الكاش', pc(A.cash, A.sales) + '%', money(A.cash)],
      ['fa-truck-ramp-box', '14,165,233', 'نسبة التسليم', pc(dl, cur.length) + '%', dl + ' من ' + cur.length + ' بند']
    ];
    return '<div class="dx-tiles">' + T.map((x, i) => '<div class="dx-card dx-tile" style="--i:' + (idx++) + '">' + ico(x[1], x[0]) + '<div class="min-w-0"><div class="l">' + x[2] + '</div><div class="v">' + eh(x[3]) + '</div><div class="s">' + eh(x[4]) + '</div></div></div>').join('') + '</div>';
  }

  /* ---------------------------------------------------------------
     6) أقسام اللوحة السفلية
     --------------------------------------------------------------- */
  function pipeline(X) {
    const order = ['In Progress', 'Under Review', 'Complete', 'Delivered'];
    const cols = order.map(s => {
      const rs = (s === 'Delivered' ? X.cur : X.all).filter(x => stOf(x.l) === s), v = rs.reduce((a, x) => a + netS(x.l), 0);
      const ages = rs.map(x => (X.now - x.t) / DAY), avg = ages.length ? ages.reduce((a, b) => a + b, 0) / ages.length : 0, old = ages.length ? Math.max.apply(null, ages) : 0;
      return '<div class="dx-stage" style="--c:' + STG[s] + '"><div class="l">' + eh(statusLabel(s)) + (s === 'Delivered' ? ' (' + X.W.label + ')' : '') + '</div><div class="n">' + rs.length + '</div>' +
        '<div class="m">' + money(v) + (s !== 'Delivered' && rs.length ? '<br>متوسط العمر ' + avg.toFixed(1) + ' يوم · الأقدم ' + Math.floor(old) + ' يوم' : '') + '</div></div>';
    }).join('');
    const openV = X.open.reduce((a, x) => a + netS(x.l), 0);
    return card('خط سير الشغل (الحالة الحالية)', 'fa-diagram-project', '13,148,136', '<div class="dx-pipe">' + cols + '</div>', 'قيمة الشغل المفتوح ' + money(openV), 'dx-span2');
  }
  function services(X) {
    const g = group(X.cur, x => (x.l.service || '').trim(), x => netS(x.l)).slice(0, 8); if (!g.length) return card('الخدمات والربحية', 'fa-sack-dollar', '139,92,246', none(), '', '');
    const max = g[0].v || 1;
    const rows = g.map((s, i) => { const cost = s.rs.reduce((a, x) => a + netC(x.l), 0), m = s.v - cost, mp = pc(m, s.v); const c = mp < 10 ? '244,63,94' : mp < 30 ? '245,158,11' : '16,185,129';
      return '<div class="dx-row"><div class="top"><span class="a">' + eh(s.k) + '</span><span class="b">' + money(s.v) + '</span></div>' + bar(s.v / max * 100, PAL[i % PAL.length], i) +
        '<div class="dx-sub">' + s.n + ' بند · هامش <b style="color:rgb(' + c + ')">' + mp + '%</b> (' + money(m) + ')</div></div>'; }).join('');
    return card('الخدمات والربحية', 'fa-sack-dollar', '139,92,246', '<div class="dx-rows">' + rows + '</div>', X.W.label, '');
  }
  function clients(X) {
    const g = group(X.cur, x => (x.l.client_name || '').trim()); if (!g.length) return card('العملاء', 'fa-users', '37,99,235', none(), '', '');
    const first = new Map(); X.all.forEach(x => { const k = (x.l.client_name || '').trim(), p = first.get(k); if (!p || x.t < p) first.set(k, x.t); });
    let nw = 0, rt = 0; g.forEach(c => { (first.get(c.k) >= X.W.S ? nw++ : rt++); });
    const top = g.slice(0, 6), max = top[0].v || 1;
    const rows = top.map((c, i) => { const last = c.rs.reduce((m, x) => x.t > m ? x.t : m, c.rs[0].t); return '<div class="dx-row"><div class="top"><button ' + ac(c.k) + ' class="a hover:text-brand-600 hover:underline text-start">' + eh(c.k) + '</button><span class="b">' + money(c.v) + '</span></div>' + bar(c.v / max * 100, PAL[(i + 1) % PAL.length], i) + '<div class="dx-sub">' + c.tx.size + ' معاملة · آخر زيارة ' + eh(formatDateOnly(dayKey(last))) + '</div></div>'; }).join('');
    const head = '<div class="mb-3 flex flex-wrap gap-1.5"><span class="dx-pill" style="--c:16,185,129">جداد ' + nw + '</span><span class="dx-pill" style="--c:37,99,235">راجعين ' + rt + '</span><span class="dx-pill" style="--c:139,92,246">' + g.length + ' عميل</span><span class="dx-pill" style="--c:245,158,11">نسبة التكرار ' + pc(rt, g.length) + '%</span></div>';
    return card('العملاء', 'fa-users', '37,99,235', head + '<div class="dx-rows">' + rows + '</div>', 'أعلى 6 عملاء', '');
  }
  function staff(X) {
    const g = group(X.cur, x => (x.l.employee || '').trim()); if (!g.length) return card('مصفوفة أداء الموظفين', 'fa-people-group', '37,99,235', none(), '', 'dx-span2');
    const lateBy = new Map(); X.open.forEach(x => { if (stOf(x.l) === 'Complete') return; const d = dueOf(x.l); if (d && X.t0 > d) { const k = (x.l.employee || '').trim(); lateBy.set(k, (lateBy.get(k) || 0) + 1); } });
    const body = '<div class="dx-wrap"><table class="dx-tbl"><thead><tr><th>الموظف</th><th class="m">معاملات</th><th class="m">بنود</th><th class="m">المبيعات</th><th class="m">متوسط المعاملة</th><th class="m">خصومات</th><th class="m">اتسلّم</th><th class="m">متأخر</th></tr></thead><tbody>' +
      g.slice(0, 10).map(e => { const a = agg(e.rs), dl = e.rs.filter(x => stOf(x.l) === 'Delivered').length, lt = lateBy.get(e.k) || 0;
        return '<tr><td class="nm">' + eh(e.k) + '</td><td class="m">' + a.tx + '</td><td class="m">' + a.items + '</td><td class="m">' + money(a.sales) + '</td><td class="m">' + money(a.avg) + '</td><td class="m">' + (a.disc ? money(a.disc) : '—') + '</td><td class="m">' + pc(dl, e.rs.length) + '%</td><td class="m" style="' + (lt ? 'color:#e11d48;font-weight:700' : '') + '">' + (lt || '—') + '</td></tr>'; }).join('') + '</tbody></table></div>';
    return card('مصفوفة أداء الموظفين', 'fa-people-group', '37,99,235', body, X.W.label, 'dx-span2');
  }
  function executors(X) {
    const g = group(X.month, x => (x.l.executor || '').trim() || 'تنفيذ داخلي', x => execCostOf(x.l)); if (!g.length) return card('المنفذين وعبء الشغل', 'fa-user-gear', '245,158,11', none(), '', '');
    const max = Math.max.apply(null, g.map(e => e.rs.filter(x => stOf(x.l) !== 'Delivered').length)) || 1;
    const rows = g.slice(0, 7).map((e, i) => { const op = e.rs.filter(x => stOf(x.l) !== 'Delivered').length;
      return '<div class="dx-row"><div class="top"><span class="a">' + eh(e.k) + '</span><span class="b">' + op + ' مفتوح</span></div>' + bar(op / max * 100, PAL[(i + 3) % PAL.length], i) + '<div class="dx-sub">' + e.n + ' بند الشهر · تكلفة ' + money(e.v) + '</div></div>'; }).join('');
    return card('المنفذين وعبء الشغل', 'fa-user-gear', '245,158,11', '<div class="dx-rows">' + rows + '</div>', 'الشهر الحالي', '');
  }
  function payments(X) {
    const g = group(X.cur, x => (x.l.payment_method || 'كاش').trim()); const tot = X.A.sales || 1;
    const body = g.length ? '<div class="dx-rows">' + g.map((p, i) => '<div class="dx-row"><div class="top"><span class="a">' + eh(p.k) + '</span><span class="b">' + money(p.v) + ' · ' + pc(p.v, tot) + '%</span></div>' + bar(p.v / tot * 100, PAL[i % PAL.length], i) + '<div class="dx-sub">' + p.tx.size + ' معاملة · متوسط ' + money(p.tx.size ? p.v / p.tx.size : 0) + '</div></div>').join('') + '</div>' : none();
    const dsc = X.A.disc ? '<div class="dx-sub mt-3">إجمالي الخصومات في ' + X.W.label + ': <b>' + money(X.A.disc) + '</b> (' + pc(X.A.disc, X.A.sales + X.A.disc) + '% من قيمة القوائم)</div>' : '';
    return card('التحصيل وطرق الدفع', 'fa-wallet', '16,185,129', body + dsc, X.W.label, '');
  }
  function dueSoon(X) {
    const rows = []; X.open.forEach(x => { if (stOf(x.l) === 'Complete') return; const d = dueOf(x.l); if (!d) return; const k = Math.round((d - X.t0) / DAY); if (k >= 0 && k <= 3) rows.push({ x, k }); });
    rows.sort((a, b) => a.k - b.k);
    const body = rows.length ? '<div class="dx-rows">' + rows.slice(0, 8).map(r => { const l = r.x.l, c = r.k === 0 ? '244,63,94' : r.k === 1 ? '245,158,11' : '13,148,136';
      return '<div class="dx-row"><div class="top"><span class="a"><button ' + at(l.transaction_id) + ' class="font-mono text-brand-600 hover:underline" dir="ltr">' + eh(l.transaction_id) + '</button> · ' + eh(l.client_name || '—') + '</span><span class="dx-pill" style="--c:' + c + '">' + (r.k === 0 ? 'النهاردة' : r.k === 1 ? 'بكرة' : 'بعد ' + r.k + ' أيام') + '</span></div><div class="dx-sub">' + eh(l.service || '') + ' · ' + eh(l.employee || '—') + '</div></div>'; }).join('') + (rows.length > 8 ? '<div class="dx-sub">+ ' + (rows.length - 8) + ' تانيين</div>' : '') + '</div>' : none('مفيش مواعيد تسليم خلال 3 أيام');
    return card('مواعيد تسليم قريبة', 'fa-calendar-check', '13,148,136', body, rows.length ? rows.length + ' بند' : '', '');
  }
  function rhythm(X) {
    const m = X.month; if (!m.length) return card('إيقاع الشغل', 'fa-wave-square', '99,102,241', none(), '', 'dx-span2');
    const hrs = new Array(24).fill(0), wd = new Array(7).fill(0), wdDays = new Array(7).fill(0), dayV = new Map();
    m.forEach(x => { const v = netS(x.l); hrs[x.t.getHours()] += v; wd[x.t.getDay()] += v; dayV.set(x.t.getDate(), (dayV.get(x.t.getDate()) || 0) + v); });
    const seenD = new Set(); m.forEach(x => { const k = dayKey(x.t); if (!seenD.has(k)) { seenD.add(k); wdDays[x.t.getDay()]++; } });
    let mn = 24, mx = -1; hrs.forEach((v, h) => { if (v > 0) { mn = Math.min(mn, h); mx = Math.max(mx, h); } });
    const hl = []; for (let h = mn; h <= mx; h++) hl.push(h);
    const hmax = Math.max.apply(null, hl.map(h => hrs[h])) || 1, hp = hl.find(h => hrs[h] === hmax);
    const cols = (arr, max, lab, on, c) => '<div class="dx-cols">' + arr.map((v, i) => '<div class="' + (i === on ? 'on' : '') + '" title="' + eh(lab[i]) + ': ' + money(v) + '"><div class="dx-col" style="--h:' + (v / max * 100).toFixed(1) + '%;--c:' + c + ';--i:' + i + '"></div></div>').join('') + '</div><div class="dx-lbls">' + lab.map(t => '<span>' + eh(t) + '</span>').join('') + '</div>';
    const wavg = WORDER.map(d => wdDays[d] ? wd[d] / wdDays[d] : 0), wmax = Math.max.apply(null, wavg) || 1, wb = wavg.indexOf(wmax);
    const dn = X.now.getDate(), dl = []; for (let d = 1; d <= dn; d++) dl.push(d);
    const dvals = dl.map(d => dayV.get(d) || 0), dmax = Math.max.apply(null, dvals) || 1, db = dvals.indexOf(dmax);
    const dm = new Date(X.now.getFullYear(), X.now.getMonth() + 1, 0).getDate(), proj = dn >= 3 ? X.M.sales / dn * dm : 0;
    const p1 = '<div><div class="mb-2 text-[12px] font-bold text-ink dark:text-white">ساعات الذروة</div>' + cols(hl.map(h => hrs[h]), hmax, hl.map(h => String(h)), hl.indexOf(hp), '13,148,136') + '<div class="dx-sub">ذروة المبيعات الساعة <b>' + hp + ':00</b></div></div>';
    const p2 = '<div><div class="mb-2 text-[12px] font-bold text-ink dark:text-white">متوسط اليوم حسب أيام الأسبوع</div>' + cols(wavg, wmax, WORDER.map(d => WD[d].slice(0, 3)), wb, '37,99,235') + '<div class="dx-sub">أقوى يوم في الأسبوع <b>' + WD[WORDER[wb]] + '</b> (' + money(wmax) + ')</div></div>';
    const p3 = '<div><div class="mb-2 text-[12px] font-bold text-ink dark:text-white">مبيعات كل يوم في الشهر</div>' + cols(dvals, dmax, dl.map(String), db, '139,92,246') + '<div class="dx-sub">' + (proj ? 'التوقع لآخر الشهر <b>' + money(proj) + '</b> · ' : '') + 'أحسن يوم <b>' + dl[db] + '</b> (' + money(dmax) + ')</div></div>';
    return card('إيقاع الشغل', 'fa-wave-square', '99,102,241', '<div class="dx-grid-3">' + p1 + p2 + p3 + '</div>', 'الشهر الحالي', 'dx-span2');
  }
  function surprises(X) {
    const o = [], add = (c, ic, h) => o.push('<div style="--c:' + c + '">' + ico(c, ic) + '<div>' + h + '</div></div>');
    const m = X.month; if (m.length < 5) return card('حاجات ممكن متكونش متوقعها', 'fa-lightbulb', '245,158,11', none('محتاجين بيانات أكتر عشان نكتشف أنماط'), '', 'dx-span2');
    const days = group(m, x => dayKey(x.t)); const avgD = days.length ? X.M.sales / days.length : 0;
    if (days.length >= 5 && days[0].v >= avgD * 1.8) add('245,158,11', 'fa-fire', 'يوم <b>' + eh(formatDateOnly(days[0].k)) + '</b> كان استثنائي: <b>' + money(days[0].v) + '</b> يعني <b>' + (days[0].v / avgD).toFixed(1) + 'x</b> متوسط اليوم.');
    const sameWd = days.filter(d => new Date(d.k + 'T00:00').getDay() === X.now.getDay() && d.k !== dayKey(X.now));
    if (sameWd.length >= 2) { const av = sameWd.reduce((a, b) => a + b.v, 0) / sameWd.length; if (av > 0 && X.T.sales > 0) add(X.T.sales >= av ? '16,185,129' : '244,63,94', 'fa-calendar-day', 'النهاردة (' + WD[X.now.getDay()] + ') ماشي ' + (X.T.sales >= av ? 'أعلى' : 'أقل') + ' من متوسط نفس اليوم في الشهر بنسبة <b>' + Math.abs(Math.round((X.T.sales - av) / av * 100)) + '%</b>.'); }
    const txs = group(m, x => x.l.transaction_id || null); const txAvg = X.M.tx ? X.M.sales / X.M.tx : 0;
    if (txs[0] && txAvg && txs[0].v >= txAvg * 3) add('37,99,235', 'fa-gem', 'أكبر معاملة <button ' + at(txs[0].k) + ' class="font-mono text-brand-600 hover:underline" dir="ltr">' + eh(txs[0].k) + '</button> قيمتها <b>' + money(txs[0].v) + '</b> يعني <b>' + (txs[0].v / txAvg).toFixed(1) + 'x</b> متوسط المعاملة (' + eh(txs[0].rs[0].l.client_name || '') + ').');
    const cd = group(m, x => (x.l.client_name || '').trim() + '|' + dayKey(x.t)).filter(g => g.tx.size >= 3);
    if (cd[0]) add('139,92,246', 'fa-repeat', 'العميل <b>' + eh(cd[0].k.split('|')[0]) + '</b> عمل <b>' + cd[0].tx.size + '</b> معاملات في يوم واحد (' + eh(formatDateOnly(cd[0].k.split('|')[1])) + ') — ممكن يتجمعوا في معاملة واحدة.');
    const pr = new Map(); m.forEach(x => { const s = (x.l.service || '').trim(), p = num(x.l.list_price) || num(x.l.unit_price); if (!s || p <= 0) return; const e = pr.get(s) || { lo: p, hi: p, n: 0 }; e.lo = Math.min(e.lo, p); e.hi = Math.max(e.hi, p); e.n++; pr.set(s, e); });
    const pv = [...pr.entries()].filter(e => e[1].n >= 3 && e[1].hi >= e[1].lo * 1.5).sort((a, b) => b[1].hi / b[1].lo - a[1].hi / a[1].lo)[0];
    if (pv) add('234,88,12', 'fa-tags', 'خدمة <b>' + eh(pv[0]) + '</b> اتباعت بأسعار مختلفة: من <b>' + money(pv[1].lo) + '</b> لحد <b>' + money(pv[1].hi) + '</b> — راجع هل ده مقصود.');
    const sv = group(m, x => (x.l.service || '').trim()); if (sv[0] && pc(sv[0].v, X.M.sales) >= 40) add('13,148,136', 'fa-bullseye', 'خدمة <b>' + eh(sv[0].k) + '</b> لوحدها <b>' + pc(sv[0].v, X.M.sales) + '%</b> من إيراد الشهر — اعتماد كبير على خدمة واحدة.');
    const em = group(m, x => (x.l.employee || '').trim()); if (em.length > 1 && pc(em[0].v, X.M.sales) >= 50) add('37,99,235', 'fa-user-tie', '<b>' + eh(em[0].k) + '</b> مسؤول عن <b>' + pc(em[0].v, X.M.sales) + '%</b> من مبيعات الشهر.');
    const dg = group(m.filter(x => discOf(x.l) > 0), x => (x.l.employee || '').trim(), x => discOf(x.l)), dt = dg.reduce((a, b) => a + b.v, 0);
    if (dg[0] && dg.length > 1 && dt > 0 && dg[0].v / dt >= 0.6) add('225,29,72', 'fa-percent', '<b>' + eh(dg[0].k) + '</b> هو صاحب <b>' + pc(dg[0].v, dt) + '%</b> من قيمة الخصومات (' + money(dg[0].v) + ').');
    const cl = group(m, x => (x.l.client_name || '').trim()); if (cl.length >= 6) { const t3 = cl.slice(0, 3).reduce((a, b) => a + b.v, 0); if (pc(t3, X.M.sales) >= 35) add('16,185,129', 'fa-handshake', 'أعلى 3 عملاء بيمثلوا <b>' + pc(t3, X.M.sales) + '%</b> من إيراد الشهر.'); }
    const off = m.filter(x => x.t.getHours() < 7 || x.t.getHours() >= 23).length; if (off) add('100,116,139', 'fa-moon', '<b>' + off + '</b> بند اتسجل خارج ساعات الشغل المعتادة (قبل 7 صباحاً أو بعد 11 مساءً).');
    const rep = group(m, x => (x.l.phone || '').trim() || null).filter(g => new Set(g.rs.map(x => (x.l.client_name || '').trim())).size > 1)[0];
    if (rep) add('168,85,247', 'fa-clone', 'رقم <b dir="ltr">' + eh(rep.k) + '</b> مسجّل باسمين عملاء مختلفين: ' + eh([...new Set(rep.rs.map(x => (x.l.client_name || '').trim()))].slice(0, 3).join(' / ')) + ' — يمكن تكرار اسم.');
    const body = o.length ? '<div class="dx-surp">' + o.join('') + '</div>' : none('مفيش أنماط غريبة ظاهرة دلوقتي');
    return card('حاجات ممكن متكونش متوقعها', 'fa-lightbulb', '245,158,11', body, 'اكتشاف تلقائي من بيانات الشهر', 'dx-span2');
  }

  /* ---------------------------------------------------------------
     7) عمليات مكمّلة (مهام / تقفيل كاش / مناديب / مستحقات / حضور) — للمدير بس
     --------------------------------------------------------------- */
  let ext = null, extAt = 0, extBusy = false;
  async function loadExt() {
    if (!mgr() || !sbClient || extBusy) return; if (ext && Date.now() - extAt < 90000) return;
    extBusy = true;
    try {
      const td = dayKey(new Date()), ms = td.slice(0, 7) + '-01', q = p => p.then(r => r.error ? null : r.data, () => null);
      const R = await Promise.all([
        q(sbClient.from('tasks').select('id,title,status,due_at').eq('status', 'open').limit(400)),
        q(sbClient.from('cash_closings').select('day,expected,counted').order('day', { ascending: false }).limit(6)),
        q(sbClient.from('courier_trips').select('courier,fee,kind').gte('trip_day', ms).limit(5000)),
        q(sbClient.from('partner_ops').select('qty,price').eq('settled', false).limit(10000)),
        q(sbClient.from('hr_attendance').select('user_id').eq('day', td).limit(500)),
        sbClient.from('hr_staff').select('*', { count: 'exact', head: true }).then(r => r.error ? null : r.count, () => null),
        sbClient.from('tx_comments').select('id', { count: 'exact', head: true }).gte('created_at', ms + 'T00:00:00').then(r => r.error ? null : r.count, () => null)
      ]);
      ext = { tasks: R[0], cash: R[1], trips: R[2], partner: R[3], att: R[4], staff: R[5], cmts: R[6] };
      ext.tasksLate = (ext.tasks || []).filter(t => new Date(t.due_at) < new Date());
      extAt = Date.now();
    } catch (e) { console.warn('p18 ext', e); } finally { extBusy = false; }
  }
  function extHtml() {
    if (!mgr()) return '';
    if (!ext) return card('عمليات مكمّلة', 'fa-puzzle-piece', '99,102,241', '<div class="dx-empty"><i class="fa-solid fa-spinner fa-spin"></i> جارٍ التحميل...</div>', '', 'dx-span2');
    const t = [], tile = (c, ic, l, v, s) => t.push('<div class="dx-card dx-tile" style="--i:' + (idx++) + '">' + ico(c, ic) + '<div class="min-w-0"><div class="l">' + l + '</div><div class="v">' + v + '</div><div class="s">' + s + '</div></div></div>');
    if (ext.tasks) tile('37,99,235', 'fa-list-check', 'مهام مفتوحة', ext.tasks.length, ext.tasksLate.length ? ext.tasksLate.length + ' متأخرة' : 'مفيش متأخر');
    if (ext.cash && ext.cash.length) { const c = ext.cash[0], diff = num(c.counted) - num(c.expected), td = dayKey(new Date()); tile(diff === 0 ? '16,185,129' : '244,63,94', 'fa-cash-register', 'آخر تقفيل كاش', eh(formatDateOnly(c.day)), (diff === 0 ? 'مظبوط' : 'فرق ' + money(diff)) + (c.day === td ? ' · اتقفل النهاردة' : ' · النهاردة لسه')); }
    else if (ext.cash) tile('245,158,11', 'fa-cash-register', 'تقفيل الكاش', '—', 'مفيش تقفيل مسجل');
    if (ext.trips) { const fee = ext.trips.reduce((a, x) => a + num(x.fee), 0), by = group(ext.trips.map(x => ({ l: { total: num(x.fee), courier: x.courier || '—' }, t: 0 })), x => x.l.courier)[0]; tile('14,165,233', 'fa-motorcycle', 'رحلات المناديب (الشهر)', ext.trips.length, 'مصروفات ' + money(fee) + (by ? ' · الأكتر ' + eh(by.k) : '')); }
    if (ext.partner) { const due = ext.partner.reduce((a, x) => a + num(x.qty) * num(x.price), 0); tile('245,158,11', 'fa-handshake-angle', 'مستحقات المنفذ الخارجي', money(due), 'غير مسوّاة'); }
    if (ext.att && ext.staff != null) tile('16,185,129', 'fa-user-clock', 'حضور النهاردة', ext.att.length + ' / ' + ext.staff, ext.att.length >= ext.staff ? 'الكل حاضر' : (ext.staff - ext.att.length) + ' لسه ماسجلوش');
    if (ext.cmts != null) tile('139,92,246', 'fa-comment-dots', 'تعليقات المعاملات (الشهر)', ext.cmts, 'متابعة بين الفريق');
    if (!t.length) return '';
    return '<div class="dx-span2"><div class="dx-h"><h3><i class="fa-solid fa-puzzle-piece" style="color:rgb(99,102,241)"></i>عمليات مكمّلة</h3><small>مهام · كاش · مناديب · مستحقات · حضور</small></div><div class="dx-tiles">' + t.join('') + '</div></div>';
  }

  /* ---------------------------------------------------------------
     8) الرسم (debounced) + ربط بالداشبورد الحالية
     --------------------------------------------------------------- */
  let timer = 0, goTimer = 0, lastAnim = false;
  function ensure() {
    const root = $('tab-dash'), k = $('dsh-kpis'); if (!root || !k) return false;
    if (!$('dx-top')) k.insertAdjacentHTML('afterend', '<div id="dx-top" class="dx-sec"></div>');
    if (!$('dx-bot')) root.insertAdjacentHTML('beforeend', '<div id="dx-bot" class="dx-sec"></div>');
    return true;
  }
  function render() {
    if (!ensure() || typeof allRequestLines === 'undefined') return;
    idx = 0;
    const X = compute();
    const al = alertsHtml(X, ext); /* لازم قبل الخلاصة علشان عدد المتأخر */
    const top = '<div class="dx-grid-2">' + card('الخلاصة الذكية', 'fa-wand-magic-sparkles', '13,148,136', '<div class="dx-ins">' + insights(X) + '</div>', X.W.label, '') +
      card('النهاردة لحظة بلحظة', 'fa-bolt', '245,158,11', todayCard(X), '', '') + '</div>' +
      card('محتاج تدخل منك', 'fa-bell-concierge', '244,63,94', al + '<div id="dx-al-pane"></div>', 'اضغط على أي تنبيه تشوف التفاصيل', '') + tiles(X);
    $('dx-top').innerHTML = top;
    $('dx-bot').innerHTML = pipeline(X) + '<div class="dx-grid-2">' + services(X) + clients(X) + '</div>' + staff(X) +
      '<div class="dx-grid-3">' + executors(X) + payments(X) + dueSoon(X) + '</div>' + rhythm(X) + surprises(X) + extHtml();
    if (lastAnim && !reduce) {
      const r = $('tab-dash'); r.classList.add('dx-go'); clearTimeout(goTimer); goTimer = setTimeout(function () { r.classList.remove('dx-go'); }, 1500);
    }
    lastAnim = false;
  }
  function schedule(anim) {
    if (anim) lastAnim = true;
    clearTimeout(timer);
    timer = setTimeout(function () {
      try { render(); } catch (e) { console.warn('p18 render', e); }
      loadExt().then(function () { if (ext && typeof currentTab !== 'undefined' && currentTab === 'dash') { try { const keep = lastAnim; lastAnim = false; renderExtOnly(); lastAnim = keep; } catch (e) { /* */ } } });
    }, 140);
  }
  function renderExtOnly() {
    /* لما بيانات المدير توصل نحدّث القسم بتاعها والتنبيهات من غير ما نعيد رسم كل حاجة ونعيد الحركة */
    const bot = $('dx-bot'); if (!bot) return;
    const old = bot.querySelector(':scope > .dx-span2:last-child'); const isExt = old && /عمليات مكمّلة/.test(old.textContent.slice(0, 40));
    const html = extHtml();
    if (isExt && old) old.outerHTML = html || ''; else if (html) bot.insertAdjacentHTML('beforeend', html);
    if (ext && ext.tasksLate && ext.tasksLate.length && !alertData.has('tk')) render();
  }

  /* فتح/قفل تفاصيل التنبيهات */
  document.addEventListener('click', function (e) {
    const b = e.target && e.target.closest ? e.target.closest('.dx-al') : null; if (!b) return;
    const pane = $('dx-al-pane'); if (!pane) return;
    const k = b.dataset.al, wasOpen = b.getAttribute('aria-expanded') === 'true';
    document.querySelectorAll('.dx-al').forEach(x => x.setAttribute('aria-expanded', 'false'));
    if (wasOpen) { pane.innerHTML = ''; return; }
    b.setAttribute('aria-expanded', 'true'); pane.innerHTML = '<div class="mt-3">' + alertList(k) + '</div>';
  });

  /* ربط بالداشبورد الحالية */
  const _r = window.renderDashboardMetrics;
  if (typeof _r === 'function') window.renderDashboardMetrics = async function () {
    const anim = !!window.__p18act; window.__p18act = false;
    window.__p18anim = anim && !reduce; ensure();
    let x; try { x = await _r.apply(this, arguments); } finally { window.__p18anim = false; }
    schedule(anim); return x;
  };
})();