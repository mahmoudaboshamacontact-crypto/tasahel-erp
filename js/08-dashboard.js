
/* ===== المرحلة 5: الداش بورد الجديدة ===== */
(function () {
  if (window.__phase5) return;
  window.__phase5 = true;
  const eh = escapeHtml, MGR = 'mahmoud.aboshama@tasahel.com.eg';
  const isMgr = () => window.__role ? window.__role === 'manager' : !!(currentUser && ['mahmoud.aboshama@tasahel.com.eg','mahmoud.aboshama.contact@gmail.com'].includes(String(currentUser.email || '').toLowerCase()));
  let range = 'month', cache = {}, charts = {}, seq = 0;
  const pad = n => String(n).padStart(2, '0');
  const mk = d => d.getFullYear() + '-' + pad(d.getMonth() + 1);
  const addM = (m, k) => { const a = m.split('-').map(Number); return mk(new Date(a[0], a[1] - 1 + k, 1)); };
  const commOf = l => (l.commission != null && Number.isFinite(Number(l.commission))) ? Number(l.commission) : (Number(l.commission_per_unit) || 0) * (Number(l.qty) || 0);
  const AN = () => (window.__p18anim ? 700 : 0); /* الحركة بتشتغل وقت الضغط/الإجراء بس */
  const C = { brand: '#0d9488', ink: '#0b1b33', pal: ['#0d9488', '#2563eb', '#8b5cf6', '#f59e0b', '#ec4899', '#64748b'] };

  async function loadMonth(m, force) {
    const c = cache[m];
    if (c && !force && Date.now() - c.t < 60000) return c.rows;
    const a0 = m + '-01T00:00:00', a = a0 > DATA_FROM_TS ? a0 : DATA_FROM_TS, b = addM(m, 1) + '-01T00:00:00', out = [];
    if (b <= DATA_FROM_TS) return out; /* شهر قبل بداية البيانات: مفيش حاجة تتسحب */
    for (let f = 0; ; f += 1000) {
      const r = await sbClient.from('request_lines').select('*').gte('received_at', a).lt('received_at', b).order('id', { ascending: true }).range(f, f + 999);
      if (r.error) throw r.error;
      out.push.apply(out, r.data || []);
      if ((r.data || []).length < 1000) break;
    }
    cache[m] = { t: Date.now(), rows: out };
    return out;
  }

  function period() {
    const now = new Date(), t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()), end = new Date(t0.getTime() + 864e5);
    if (range === 'today') { const y = new Date(t0.getTime() - 864e5); return { start: t0, end: end, pstart: y, pend: t0, unit: 'hour', n: 24, label: 'اليوم', plabel: 'أمس', title: 'أداء اليوم' }; }
    if (range === 'week') { const s = new Date(t0.getTime() - 6 * 864e5); return { start: s, end: end, pstart: new Date(s.getTime() - 7 * 864e5), pend: s, unit: 'day', n: 7, label: 'آخر 7 أيام', plabel: 'الـ7 أيام السابقة', title: 'أداء آخر 7 أيام' }; }
    const s = new Date(now.getFullYear(), now.getMonth(), 1), ps = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    let pend = new Date(ps.getFullYear(), ps.getMonth(), now.getDate() + 1); if (pend > s) pend = s;
    return { start: s, end: end, pstart: ps, pend: pend, unit: 'day', n: now.getDate(), label: 'هذا الشهر', plabel: 'نفس الفترة من الشهر السابق', title: 'أداء ' + new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric' }).format(now) };
  }
  function stats(lines, start, end, n, unit) {
    const bs = new Array(n).fill(0), bc = new Array(n).fill(0), btx = Array.from({ length: n }, () => new Set()), tx = new Set();
    let sales = 0, cost = 0;
    lines.forEach(l => {
      const d = new Date(l.received_at);
      if (isNaN(d) || d < start || d >= end) return;
      const v = Number(l.total) || 0, c = execCostOf(l);
      sales += v; cost += c; if (l.transaction_id) tx.add(l.transaction_id);
      const i = unit === 'hour' ? d.getHours() : Math.floor((d - start) / 864e5);
      if (i >= 0 && i < n) { bs[i] += v; bc[i] += c; if (l.transaction_id) btx[i].add(l.transaction_id); }
    });
    return { sales: sales, cost: cost, net: sales - cost, tx: tx.size, avg: tx.size ? sales / tx.size : 0, bs: bs, bnet: bs.map((v, i) => v - bc[i]), btx: btx.map(s => s.size), bavg: bs.map((v, i) => btx[i].size ? v / btx[i].size : 0) };
  }
  function inRange(lines, a, b) { return lines.filter(l => { const d = new Date(l.received_at); return !isNaN(d) && d >= a && d < b; }); }

  function chip(cur, prv) {
    if (!prv) return '<span class="rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 text-[10px] font-bold">' + (cur ? 'جديد' : '—') + '</span>';
    const p = (cur - prv) / Math.abs(prv) * 100, up = p >= 0;
    return '<span class="rounded-full px-2 py-0.5 text-[10px] font-bold ' + (up ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300') + '"><i class="fa-solid ' + (up ? 'fa-arrow-up' : 'fa-arrow-down') + ' ms-0.5"></i>' + Math.abs(Math.round(p)) + '%</span>';
  }
  function destroy(k) { if (charts[k]) { charts[k].destroy(); delete charts[k]; } }
  function spark(id, data, color) {
    destroy(id); const el = $(id); if (!el || typeof Chart === 'undefined') return;
    charts[id] = new Chart(el, { type: 'line', data: { labels: data.map((_, i) => i), datasets: [{ data: data, borderColor: color, backgroundColor: color + '22', fill: true, tension: .4, borderWidth: 2, pointRadius: 0 }] }, options: { responsive: true, maintainAspectRatio: false, animation: { duration: AN() }, plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false, beginAtZero: true } } } });
  }


  /* عدّاد تصاعدي للأرقام: بيشتغل وقت الضغط بس، وغير كده الرقم بيظهر ثابت */
  function countUp(el) {
    if (!el || !window.__p18anim) return;
    const to = Number(el.dataset.raw) || 0, isCur = el.dataset.cur === '1', dur = 750, t0 = performance.now();
    function frame(t) {
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = isCur ? formatCurrency(to * e) : fmtNum(Math.round(to * e));
      if (p < 1) requestAnimationFrame(frame); else el.textContent = isCur ? formatCurrency(to) : fmtNum(Math.round(to));
    }
    requestAnimationFrame(frame);
  }

  function renderKpis(cur, prv) {
    const defs = [['المبيعات', formatCurrency(cur.sales), cur.sales, prv.sales, cur.bs, '#0d9488', 'fa-coins'], ['المعاملات', String(cur.tx), cur.tx, prv.tx, cur.btx, '#2563eb', 'fa-folder-open'], ['متوسط المعاملة', formatCurrency(cur.avg), cur.avg, prv.avg, cur.bavg, '#8b5cf6', 'fa-receipt'], ['صافي الهامش', formatCurrency(cur.net), cur.net, prv.net, cur.bnet, '#059669', 'fa-chart-line']];
    $('dsh-kpis').innerHTML = defs.map((d, i) => '<div class="card p-5 overflow-hidden dash-in" style="animation-delay:' + (i * 0.09) + 's"><div class="flex items-center justify-between"><div class="flex items-center gap-2 text-xs text-slate-500"><span class="flex h-8 w-8 items-center justify-center rounded-lg text-white" style="background:' + d[5] + '"><i class="fa-solid ' + d[6] + ' text-xs"></i></span>' + d[0] + '</div>' + chip(d[2], d[3]) + '</div><div class="mt-3 text-2xl font-bold font-mono text-ink dark:text-white" id="dkpi-' + i + '" data-raw="' + d[2] + '" data-cur="' + (d[0] === 'المعاملات' ? 0 : 1) + '">' + d[1] + '</div><div class="h-12 mt-2 -mx-1"><canvas id="dsp-' + i + '"></canvas></div></div>').join('');
    defs.forEach((d, i) => spark('dsp-' + i, d[4], d[5]));
    defs.forEach((d, i) => countUp($('dkpi-' + i)));
  }

  function renderMain(P, cur, prv, dark) {
    destroy('main');
    const wd = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const labels = cur.bs.map((_, i) => P.unit === 'hour' ? pad(i) + ':00' : (range === 'week' ? wd[new Date(P.start.getTime() + i * 864e5).getDay()] : String(i + 1)));
    $('dsh-l-cur').textContent = P.label; $('dsh-l-prv').textContent = P.plabel;
    const grid = dark ? 'rgba(148,163,184,.12)' : 'rgba(148,163,184,.2)', txt = dark ? '#94a3b8' : '#64748b';
    charts.main = new Chart($('dsh-main'), {
      type: 'line',
      data: { labels: labels, datasets: [
        { label: P.label, data: cur.bs, borderColor: C.brand, backgroundColor: 'rgba(13,148,136,.14)', fill: true, tension: .35, borderWidth: 2.5, pointRadius: 2, pointHoverRadius: 5 },
        { label: P.plabel, data: prv.bs.slice(0, cur.bs.length), borderColor: '#94a3b8', borderDash: [5, 5], fill: false, tension: .35, borderWidth: 2, pointRadius: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, animation: { duration: AN() },
        plugins: { legend: { display: false }, tooltip: { rtl: true, callbacks: { label: c => ' ' + c.dataset.label + ': ' + formatCurrency(c.parsed.y) } } },
        scales: { y: { beginAtZero: true, grid: { color: grid }, ticks: { color: txt } }, x: { grid: { display: false }, ticks: { color: txt, maxTicksLimit: 12 } } } }
    });
  }

  function renderPay(lines, dark) {
    destroy('pay');
    const m = new Map(); lines.forEach(l => { const k = (l.payment_method || 'كاش').trim(); m.set(k, (m.get(k) || 0) + (Number(l.total) || 0)); });
    const e = [...m.entries()].sort((a, b) => b[1] - a[1]);
    charts.pay = new Chart($('dsh-pay'), { type: 'doughnut', data: { labels: e.length ? e.map(x => x[0]) : ['—'], datasets: [{ data: e.length ? e.map(x => x[1]) : [1], backgroundColor: C.pal, borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '68%', animation: { duration: AN() }, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, color: dark ? '#cbd5e1' : '#475569', font: { family: 'IBM Plex Sans Arabic' } } }, tooltip: { rtl: true, callbacks: { label: c => ' ' + c.label + ': ' + formatCurrency(c.parsed) } } } } });
  }

  function renderEmps(lines) {
    const by = new Map();
    lines.forEach(l => {
      const p = profileByName(l.employee), key = p ? p.id : 'n:' + (l.employee || 'غير محدد');
      if (!by.has(key)) by.set(key, { p: p, name: p ? p.full_name : (l.employee || 'غير محدد'), sales: 0, comm: 0, tx: new Set() });
      const d = by.get(key); d.sales += Number(l.total) || 0; d.comm += commOf(l); if (l.transaction_id) d.tx.add(l.transaction_id);
    });
    const rows = [...by.values()].sort((a, b) => b.sales - a.sales), max = rows.length ? rows[0].sales || 1 : 1, mgr = isMgr();
    $('dsh-emps').innerHTML = rows.map((r, i) => {
      const showComm = mgr || (r.p && currentUser && r.p.id === currentUser.id);
      return '<div class="flex items-center gap-3 px-5 py-3"><span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ' + (i === 0 ? 'bg-amber-400 text-slate-900' : 'bg-slate-100 dark:bg-slate-800 text-slate-500') + '">' + (i + 1) + '</span>' +
        avatarHtml(r.p || { id: r.name, full_name: r.name }, 34) +
        '<div class="min-w-0 flex-1"><div class="flex items-center justify-between gap-2"><span class="truncate text-sm font-bold text-ink dark:text-white">' + eh(r.name) + '</span><span class="shrink-0 font-mono text-xs font-bold text-brand-600">' + formatCurrency(r.sales) + '</span></div>' +
        '<div class="mt-1.5 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><div class="h-full rounded-full bg-brand-500" style="width:' + Math.round(r.sales / max * 100) + '%"></div></div>' +
        '<div class="mt-1 flex justify-between text-[10px] text-slate-400"><span>' + r.tx.size + ' معاملة</span>' + (showComm ? '<span class="text-emerald-600">كوميشن ' + formatCurrency(r.comm) + '</span>' : '') + '</div></div></div>';
    }).join('') || '<div class="p-8 text-center text-xs text-slate-400">لا توجد بيانات</div>';
  }

  function renderSvcs(lines) {
    const m = new Map(); lines.forEach(l => { const k = l.service || 'أخرى'; m.set(k, (m.get(k) || 0) + (Number(l.total) || 0)); });
    const e = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6), max = e.length ? e[0][1] || 1 : 1;
    $('dsh-svcs').innerHTML = e.map((x, i) => '<div><div class="flex justify-between gap-2 text-xs"><span class="truncate font-semibold text-ink dark:text-white">' + eh(x[0]) + '</span><span class="shrink-0 font-mono text-slate-500">' + formatCurrency(x[1]) + '</span></div><div class="mt-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><div class="h-full rounded-full" style="width:' + Math.round(x[1] / max * 100) + '%;background:' + C.pal[i % C.pal.length] + '"></div></div></div>').join('') || '<div class="py-6 text-center text-xs text-slate-400">لا توجد بيانات</div>';
  }

  function renderHeat(monthLines) {
    const order = [6, 0, 1, 2, 3, 4, 5], names = { 6: 'السبت', 0: 'الأحد', 1: 'الاثنين', 2: 'الثلاثاء', 3: 'الأربعاء', 4: 'الخميس', 5: 'الجمعة' };
    const g = Array.from({ length: 7 }, () => new Array(24).fill(0)); let mn = 24, mx = -1, top = 0;
    monthLines.forEach(l => { const d = new Date(l.received_at); if (isNaN(d)) return; const v = ++g[d.getDay()][d.getHours()]; if (v > top) top = v; if (d.getHours() < mn) mn = d.getHours(); if (d.getHours() > mx) mx = d.getHours(); });
    if (mx < 0) { $('dsh-heat').innerHTML = '<div class="py-8 text-center text-xs text-slate-400">لا توجد بيانات كافية</div>'; return; }
    const hrs = []; for (let h = mn; h <= mx; h++) hrs.push(h);
    let h = '<div class="grid gap-1 text-[10px] min-w-[460px]" style="grid-template-columns:64px repeat(' + hrs.length + ',minmax(0,1fr))"><span></span>' + hrs.map(x => '<span class="text-center text-slate-400 font-mono">' + x + '</span>').join('');
    order.forEach(dw => {
      h += '<span class="flex items-center text-slate-500 font-semibold">' + names[dw] + '</span>';
      hrs.forEach(x => { const v = g[dw][x], a = top ? v / top : 0; h += '<span title="' + names[dw] + ' ' + x + ':00 — ' + v + ' بند" class="h-7 rounded-md" style="background:' + (v ? 'rgba(13,148,136,' + (0.15 + a * 0.85).toFixed(2) + ')' : 'rgba(148,163,184,.12)') + '"></span>'; });
    });
    $('dsh-heat').innerHTML = h + '</div>';
  }

  async function renderTargets() {
    const box = $('dsh-targets'); $('dsh-tgt-month').textContent = '';
    try {
      const cl = await sbClient.from('month_closures').select('month').order('month');
      if (cl.error) throw cl.error;
      const last = (cl.data || []).length ? cl.data[cl.data.length - 1].month : null, wm = last ? addM(last, 1) : mk(new Date());
      const t = await sbClient.from('emp_targets').select('user_id,target').eq('month', wm);
      if (t.error) throw t.error;
      const rows = (t.data || []).filter(x => Number(x.target) > 0);
      $('dsh-tgt-month').textContent = '· ' + new Intl.DateTimeFormat('ar-EG', { month: 'long' }).format(new Date(wm + '-01T00:00'));
      if (!rows.length) { box.innerHTML = '<div class="py-8 text-center text-xs text-slate-400">لم يتم تحديد تارجت لهذا الشهر بعد</div>'; return; }
      const lines = await loadMonth(wm), sales = new Map();
      lines.forEach(l => { const p = profileByName(l.employee); if (p) sales.set(p.id, (sales.get(p.id) || 0) + (Number(l.total) || 0)); });
      box.innerHTML = rows.map(x => {
        const p = profiles.find(q => q.id === x.user_id) || { id: x.user_id, full_name: 'موظف' }, s = sales.get(x.user_id) || 0, pct = Math.round(s / Number(x.target) * 100), col = pct >= 100 ? '#059669' : pct >= 60 ? '#0d9488' : pct >= 30 ? '#d97706' : '#dc2626';
        return '<div class="flex items-center gap-3"><div class="relative h-12 w-12 shrink-0 rounded-full" style="background:conic-gradient(' + col + ' ' + Math.min(100, pct) + '%,rgba(148,163,184,.25) 0)"><div class="absolute inset-[5px] flex items-center justify-center rounded-full bg-white dark:bg-slate-900 text-[11px] font-bold font-mono" style="color:' + col + '">' + pct + '%</div></div><div class="min-w-0 flex-1"><div class="truncate text-sm font-bold text-ink dark:text-white">' + eh(p.full_name) + '</div><div class="text-[11px] text-slate-400 font-mono">' + formatCurrency(s) + ' / ' + formatCurrency(x.target) + '</div></div></div>';
      }).join('');
    } catch (err) { box.innerHTML = '<div class="py-8 text-center text-xs text-slate-400">شغّل ملف phase4-commission-targets.sql علشان يظهر التارجت</div>'; }
  }

  async function renderLate() {
    const box = $('dsh-late');
    try {
      const r = await sbClient.from('request_lines').select('id,client_name,service,transaction_id,employee,received_at,exec_start_date,duration_days,qty')
        .eq('complete', false).gte('received_at', DATA_FROM_TS).not('duration_days', 'is', null).order('id', { ascending: false }).limit(500);
      if (r.error) throw r.error;
      const t0 = new Date(); t0.setHours(0, 0, 0, 0);
      const late = (r.data || []).map(l => {
        const base = new Date(String(l.exec_start_date || l.received_at || '').slice(0, 10) + 'T00:00'); if (isNaN(base)) return null;
        const due = new Date(base.getTime() + (Number(l.duration_days) || 0) * 864e5), days = Math.floor((t0 - due) / 864e5);
        return days > 0 ? { l: l, days: days, due: due } : null;
      }).filter(Boolean).sort((a, b) => b.days - a.days);
      $('dsh-late-count').textContent = late.length + ' متأخر';
      box.innerHTML = late.slice(0, 15).map(x => '<div class="flex items-center justify-between gap-3 px-5 py-3"><div class="min-w-0"><div class="truncate text-sm font-bold text-ink dark:text-white"><button ' + ac(x.l.client_name) + ' class="hover:text-brand-600 hover:underline">' + eh(x.l.client_name) + '</button> <span class="font-normal text-slate-400">· ' + eh(x.l.service) + '</span></div><div class="text-[11px] text-slate-400"><button ' + at(x.l.transaction_id) + ' class="font-mono text-brand-600 hover:underline" dir="ltr">' + eh(x.l.transaction_id) + '</button> · ' + eh(x.l.employee || '—') + ' · الموعد ' + eh(formatDateOnly(dayKey(x.due))) + '</div></div><span class="shrink-0 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 px-3 py-1 text-[11px] font-bold">متأخر ' + x.days + ' يوم</span></div>').join('') || '<div class="p-8 text-center text-xs text-slate-400"><i class="fa-solid fa-circle-check text-emerald-500 text-xl mb-2 block"></i>مفيش طلبات متأخرة</div>';
    } catch (err) { $('dsh-late-count').textContent = '—'; box.innerHTML = '<div class="p-6 text-center text-xs text-slate-400">تعذّر تحميل المتأخرات</div>'; console.warn('late', err); }
  }

  window.styleDashButtons = function () {
    ['today', 'week', 'month'].forEach(r => { const b = $('dash-btn-' + r); if (b) b.className = 'rounded-lg px-3.5 py-1.5 font-semibold transition ' + (r === range ? 'bg-white text-ink shadow' : 'text-white/80 hover:text-white'); });
  };
  window.setDashboardRange = function (r) { range = r; styleDashButtons(); renderDashboardMetrics(); };
  window.dashRefresh = function () { cache = {}; renderDashboardMetrics(); };
  window.renderDashboardMetrics = async function () {
    if (!sbClient || !$('dsh-kpis')) return;
    const my = ++seq, P = period(), dark = document.documentElement.classList.contains('dark');
    styleDashButtons();
    $('dsh-title').textContent = P.title;
    $('dsh-sub').textContent = 'مقارنة مع ' + P.plabel;
    if (typeof Chart !== 'undefined') { Chart.defaults.font.family = '"IBM Plex Sans Arabic",Tahoma,sans-serif'; Chart.defaults.color = dark ? '#94a3b8' : '#64748b'; }
    try {
      const cm = mk(new Date()), pm = addM(cm, -1), all = (await loadMonth(pm)).concat(await loadMonth(cm));
      if (my !== seq) return;
      const cl = inRange(all, P.start, P.end), cur = stats(all, P.start, P.end, P.n, P.unit), prv = stats(all, P.pstart, P.pend, P.n, P.unit);
      renderKpis(cur, prv); renderMain(P, cur, prv, dark); renderPay(cl, dark); renderEmps(cl); renderSvcs(cl);
      renderHeat(await loadMonth(cm));
      renderTargets(); renderLate();
    } catch (err) { showError('تعذّر تحميل الداش بورد', err); }
  };
  /* تبديل ليلي/نهاري: نغيّر ألوان الرسومات بس من غير ما نعيد تحميل أو نبني الداشبورد من الأول */
  function recolor() {
    const dark = document.documentElement.classList.contains('dark'), txt = dark ? '#94a3b8' : '#64748b', grid = dark ? 'rgba(148,163,184,.12)' : 'rgba(148,163,184,.2)';
    if (typeof Chart !== 'undefined') Chart.defaults.color = txt;
    Object.keys(charts).forEach(k => {
      const ch = charts[k]; if (!ch || !ch.options) return;
      try {
        const sc = ch.options.scales; if (sc && sc.y && sc.x && k === 'main') { sc.y.grid.color = grid; sc.y.ticks.color = txt; sc.x.ticks.color = txt; }
        const lg = ch.options.plugins && ch.options.plugins.legend; if (lg && lg.labels) lg.labels.color = dark ? '#cbd5e1' : '#475569';
        ch.update('none');
      } catch (e) { /* */ }
    });
  }
  const _tg = window.toggleDarkMode;
  window.toggleDarkMode = function () { const r = _tg.apply(this, arguments); if (currentTab === 'dash') { try { recolor(); } catch (e) { /* */ } } return r; };
  const _lr2 = window.loadRecentRequests;
  window.loadRecentRequests = async function () { const x = await _lr2(); cache = {}; return x; };
})();
