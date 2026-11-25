/* ===== الداش بورد الشاملة — SugarCRM Motion + 100% Rich Business Intelligence ===== */
(function () {
  if (window.__phase5) return;
  window.__phase5 = true;

  const eh = escapeHtml;
  const isMgr = () => window.__role ? window.__role === 'manager' : !!(currentUser && ['mahmoud.aboshama@tasahel.com.eg', 'mahmoud.aboshama.contact@gmail.com'].includes(String(currentUser.email || '').toLowerCase()));
  let range = 'month', activeView = 'overview', selectedEmp = '', cache = {}, charts = {}, seq = 0, selMonth = '';
  const pad = n => String(n).padStart(2, '0');
  const mk = d => d.getFullYear() + '-' + pad(d.getMonth() + 1);
  const addM = (m, k) => { const a = m.split('-').map(Number); return mk(new Date(a[0], a[1] - 1 + k, 1)); };
  const commOf = l => (l.commission != null && Number.isFinite(Number(l.commission))) ? Number(l.commission) : (Number(l.commission_per_unit) || 0) * (Number(l.qty) || 0);
  const execOf = l => (l.executor_fee != null && Number.isFinite(Number(l.executor_fee))) ? Number(l.executor_fee) : (Number(l.executor_cost) || 0);
  const C = { brand: '#036b29', emerald: '#17B26A', pal: ['#036b29', '#17B26A', '#47CD89', '#75E0A7', '#344054', '#98A2B3'] };

  let refCache = {};
  async function loadMonthRefunds(m, force) {
    const c = refCache[m];
    if (c && !force && Date.now() - c.t < 60000) return c.rows;
    const a = m + '-01T00:00:00', b = addM(m, 1) + '-01T00:00:00';
    let refs = [];
    try {
      const r = await sbClient.from('line_refunds')
        .select('id,line_id,kind,qty,sales_amount,unit_comm_hint,exec_amount,exec_forfeit,reason,status,decided_at')
        .eq('status', 'approved').gte('decided_at', a).lt('decided_at', b);
      if (!r.error && Array.isArray(r.data)) refs = r.data;
    } catch (_) {}
    if (refs.length) {
      const map = new Map();
      if (typeof allRequestLines !== 'undefined' && Array.isArray(allRequestLines)) {
        allRequestLines.forEach(l => map.set(String(l.id), l));
      }
      const missIds = [...new Set(refs.map(x => x.line_id).filter(id => id != null && !map.has(String(id))))];
      if (missIds.length) {
        try {
          const lr = await sbClient.from('request_lines').select('*').in('id', missIds);
          if (!lr.error && Array.isArray(lr.data)) lr.data.forEach(l => map.set(String(l.id), l));
        } catch (_) {}
      }
      refs = refs.map(rf => Object.assign({}, rf, { _line: map.get(String(rf.line_id)) || null }));
    }
    refCache[m] = { t: Date.now(), rows: refs };
    return refs;
  }

  async function loadMonth(m, force) {
    const c = cache[m];
    if (c && !force && Date.now() - c.t < 60000) return c.rows;
    const a0 = m + '-01T00:00:00', a = a0 > DATA_FROM_TS ? a0 : DATA_FROM_TS, b = addM(m, 1) + '-01T00:00:00', out = [];
    if (b <= DATA_FROM_TS) return out;
    for (let f = 0; ; f += 1000) {
      const r = await sbClient.from('request_lines').select('*').gte('received_at', a).lt('received_at', b).order('id', { ascending: true }).range(f, f + 999);
      if (r.error) throw r.error;
      out.push.apply(out, r.data || []);
      if ((r.data || []).length < 1000) break;
    }
    const refs = await loadMonthRefunds(m, force);
    refs.forEach(rf => {
      const orig = rf._line || out.find(x => String(x.id) === String(rf.line_id));
      if (!orig) return;
      const rQty = Math.max(0, Number(rf.qty) || 0), rSales = Number(rf.sales_amount) || 0;
      const uComm = Number(rf.unit_comm_hint) || Number(orig.commission_per_unit) || 0;
      const rComm = (rf.kind === 'full' && orig.commission != null) ? Number(orig.commission) || (uComm * rQty) : (uComm * rQty);
      const rExec = rf.exec_forfeit ? (Number(rf.exec_amount) || 0) : 0;
      out.push({
        id: 'ref-' + rf.id, transaction_id: orig.transaction_id, received_at: rf.decided_at || orig.received_at,
        employee: orig.employee, service: orig.service, payment_method: orig.payment_method, executor: orig.executor,
        qty: -rQty, total: -rSales, commission: -rComm, commission_per_unit: uComm, executor_fee: -rExec, _isRefundEntry: true
      });
    });
    cache[m] = { t: Date.now(), rows: out };
    return out;
  }

  function period() {
    const n = new Date(), t = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    if (range === 'today') {
      const s = t, e = new Date(t.getTime() + 864e5), ps = new Date(t.getTime() - 864e5);
      return { start: s, end: e, pstart: ps, pend: s, n: 24, unit: 'hour', label: 'اليوم', plabel: 'أمس', months: [...new Set([mk(s), mk(ps)])] };
    }
    if (range === 'week') {
      const s = new Date(t.getTime() - 6 * 864e5), e = new Date(t.getTime() + 864e5), ps = new Date(s.getTime() - 7 * 864e5);
      return { start: s, end: e, pstart: ps, pend: s, n: 7, unit: 'day', label: 'آخر 7 أيام', plabel: 'الـ 7 أيام السابقة', months: [...new Set([mk(s), mk(t), mk(ps)])] };
    }
    if (range === 'pick' && /^\d{4}-\d{2}$/.test(selMonth)) {
      const p = selMonth.split('-').map(Number), s = new Date(p[0], p[1] - 1, 1), e = new Date(p[0], p[1], 1);
      const ps = new Date(p[0], p[1] - 2, 1), days = Math.round((e - s) / 864e5);
      const lbl = new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric' }).format(s);
      const plbl = new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric' }).format(ps);
      return { start: s, end: e, pstart: ps, pend: s, n: days, unit: 'day', label: lbl, plabel: plbl, months: [selMonth, mk(ps)] };
    }
    const s = new Date(n.getFullYear(), n.getMonth(), 1), e = new Date(n.getFullYear(), n.getMonth() + 1, 1), ps = new Date(n.getFullYear(), n.getMonth() - 1, 1);
    const days = Math.round((e - s) / 864e5);
    const lbl = new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric' }).format(s);
    const plbl = new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric' }).format(ps);
    return { start: s, end: e, pstart: ps, pend: s, n: days, unit: 'day', label: lbl, plabel: plbl, months: [mk(s), mk(ps)] };
  }

  function stats(lines, start, end, n, unit) {
    let sales = 0, comm = 0, exec = 0; const tx = new Set();
    const bs = new Array(n).fill(0), btx = Array.from({ length: n }, () => new Set()), bnet = new Array(n).fill(0);
    lines.forEach(l => {
      const d = new Date(l.received_at); if (isNaN(d) || d < start || d >= end) return;
      const tot = Number(l.total) || 0, cm = commOf(l), ex = execOf(l);
      sales += tot; comm += cm; exec += ex; if (l.transaction_id && !l._isRefundEntry) tx.add(l.transaction_id);
      const i = unit === 'hour' ? d.getHours() : Math.floor((d - start) / 864e5);
      if (i >= 0 && i < n) { bs[i] += tot; if (l.transaction_id && !l._isRefundEntry) btx[i].add(l.transaction_id); bnet[i] += tot - cm - ex; }
    });
    const txCount = tx.size, net = sales - comm - exec, avg = txCount ? sales / txCount : 0;
    return { sales, comm, exec, net, tx: txCount, avg, bs, btx: btx.map(s => s.size), bnet };
  }

  function inRange(lines, a, b) {
    return lines.filter(l => { const d = new Date(l.received_at); return !isNaN(d) && d >= a && d < b; });
  }

  function deltaBadge(cur, prv) {
    if (!prv) return cur ? '<span class="sg-delta sg-tabular">جديد</span>' : '';
    const p = Math.round((cur - prv) / Math.abs(prv) * 100);
    return '<span class="sg-delta sg-tabular ' + (p < 0 ? 'neg' : '') + '">' + (p >= 0 ? '▲ +' : '▼ ') + p + '%</span>';
  }

  function destroy(k) { if (charts[k]) { charts[k].destroy(); delete charts[k]; } }

  function svgArc(pct, color) {
    const cl = Math.max(0, Math.min(100, pct || 0)), len = 132, off = (len - len * cl / 100).toFixed(1);
    return '<svg width="92" height="52" viewBox="0 0 104 60" style="overflow:visible">' +
      '<path d="M 10 52 A 42 42 0 0 1 94 52" fill="none" stroke="rgba(148,163,184,0.22)" stroke-width="7.5" stroke-linecap="round"/>' +
      '<path class="sg-arc-stroke" data-target-offset="' + off + '" d="M 10 52 A 42 42 0 0 1 94 52" fill="none" stroke="' + color + '" stroke-width="7.5" stroke-linecap="round" stroke-dasharray="' + len + '" stroke-dashoffset="' + len + '"/></svg>';
  }

  function animateArcs(scope) {
    requestAnimationFrame(() => {
      (scope || document).querySelectorAll('.sg-arc-stroke').forEach(p => {
        if (p.dataset.targetOffset != null) p.setAttribute('stroke-dashoffset', p.dataset.targetOffset);
      });
    });
  }

  function animateCount(el, to, isMoney) {
    if (!el || !Number.isFinite(to)) return;
    const t0 = performance.now(), dur = 680;
    function step(t) {
      const k = Math.min(1, (t - t0) / dur), ease = 1 - Math.pow(1 - k, 3), v = Math.round(to * ease);
      el.textContent = new Intl.NumberFormat('en-US').format(v) + (isMoney ? ' ج.م' : ' معاملة');
      if (k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function positionGlider() {
    const track = $('sg-nav-track'), glider = $('sg-nav-glider');
    if (!track || !glider) return;
    const act = track.querySelector('.sg-pill.active');
    if (!act) return;
    glider.style.width = act.offsetWidth + 'px';
    glider.style.transform = 'translateX(' + act.offsetLeft + 'px)';
  }

  function renderKpis(cur, prv) {
    const el = $('dsh-kpis'); if (!el) return;
    const defs = [
      ['إجمالي المبيعات', cur.sales, prv.sales, true],
      ['عدد المعاملات', cur.tx, prv.tx, false],
      ['متوسط المعاملة', cur.avg, prv.avg, true],
      ['صافي الهامش', cur.net, prv.net, true]
    ];
    el.innerHTML = defs.map((d, i) =>
      '<div class="sg-kpi-tile sg-stagger" style="--i:' + i + '">' +
        '<div class="sg-kpi-top"><span>' + d[0] + '</span>' + deltaBadge(d[1], d[2]) + '</div>' +
        '<div class="sg-kpi-num sg-tabular" id="sg-kpi-v-' + i + '">0</div>' +
      '</div>'
    ).join('');
    defs.forEach((d, i) => animateCount($('sg-kpi-v-' + i), d[1], d[3]));
  }

  function renderSmartInsights(P, cur, prv, curLines) {
    const el = $('dsh-insights'); if (!el) return;
    const margin = cur.sales ? Math.round((cur.net / cur.sales) * 100) : 0;
    const diff = prv.sales ? Math.round(((cur.sales - prv.sales) / Math.abs(prv.sales)) * 100) : 0;
    const svcMap = new Map();
    curLines.forEach(l => { const k = l.service || 'أخرى'; svcMap.set(k, (svcMap.get(k) || 0) + (Number(l.total) || 0)); });
    const topSvc = [...svcMap.entries()].sort((a, b) => b[1] - a[1])[0];
    const topShare = (topSvc && cur.sales) ? Math.round(topSvc[1] / cur.sales * 100) : 0;

    // Peak day detection
    const maxDayVal = Math.max.apply(null, cur.bs.concat([0]));
    const avgDayVal = cur.bs.filter(v => v > 0).reduce((a, b) => a + b, 0) / Math.max(1, cur.bs.filter(v => v > 0).length);
    const items = [
      ['صافي هامش الربح في ' + P.label + ': <strong>' + margin + '%</strong> (' + formatCurrency(cur.net) + ')', diff >= 0 ? 'نمو +' + diff + '%' : diff + '%'],
      topSvc ? ['الخدمة الأعلى إيرادًا: <strong>' + eh(topSvc[0]) + '</strong> (' + topShare + '% من الإيراد)', formatCurrency(topSvc[1])] : null,
      maxDayVal > avgDayVal * 1.5 ? ['ذروة التحصيل وصلت إلى <strong>' + formatCurrency(maxDayVal) + '</strong> (' + (maxDayVal / Math.max(1, avgDayVal)).toFixed(1) + 'x المتوسط)', 'ذروة'] : null
    ].filter(Boolean);

    el.innerHTML = items.map((x, i) =>
      '<div class="sg-ins-item sg-stagger" style="--i:' + i + '"><span>' + x[0] + '</span><span class="sg-col-count sg-tabular shrink-0">' + x[1] + '</span></div>'
    ).join('') || '<div class="text-xs text-center py-4" style="color:var(--sg-mute)">لا توجد بيانات كافية للتحليل</div>';
  }

  function renderMain(P, cur, prv, dark) {
    destroy('main');
    const cnv = $('dsh-main'); if (!cnv) return;
    const wd = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const labels = cur.bs.map((_, i) => P.unit === 'hour' ? pad(i) + ':00' : (range === 'week' ? wd[new Date(P.start.getTime() + i * 864e5).getDay()] : String(i + 1)));
    const grid = dark ? 'rgba(255,255,255,0.06)' : 'rgba(16,24,40,0.06)', txt = dark ? '#98A2B3' : '#667085';
    const maxV = Math.max.apply(null, cur.bs.concat([1]));
    charts.main = new Chart(cnv, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          { type: 'bar', label: P.label, data: cur.bs, backgroundColor: cur.bs.map(v => v === maxV ? '#036b29' : 'rgba(23,178,106,0.28)'), borderColor: '#17B26A', borderWidth: 1, borderRadius: 7, barPercentage: 0.6 },
          { type: 'line', label: P.plabel, data: prv.bs.slice(0, cur.bs.length), borderColor: '#98A2B3', borderDash: [4, 4], fill: false, tension: 0.35, borderWidth: 1.8, pointRadius: 0 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: false }, tooltip: { rtl: true, callbacks: { label: c => ' ' + c.dataset.label + ': ' + formatCurrency(c.parsed.y) } } },
        scales: { y: { beginAtZero: true, grid: { color: grid }, ticks: { color: txt } }, x: { grid: { display: false }, ticks: { color: txt, maxTicksLimit: 12 } } }
      }
    });
  }

  function renderPay(lines, dark) {
    destroy('pay');
    const cnv = $('dsh-pay'); if (!cnv) return;
    const m = new Map();
    lines.forEach(l => { const k = (l.payment_method || 'كاش').trim(); m.set(k, (m.get(k) || 0) + (Number(l.total) || 0)); });
    const e = [...m.entries()].sort((a, b) => b[1] - a[1]);
    charts.pay = new Chart(cnv, {
      type: 'doughnut',
      data: { labels: e.length ? e.map(x => x[0]) : ['—'], datasets: [{ data: e.length ? e.map(x => x[1]) : [1], backgroundColor: C.pal, borderWidth: 0 }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '70%',
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 9, color: dark ? '#D0D5DD' : '#475467', font: { family: 'IBM Plex Sans Arabic', size: 12 } } }, tooltip: { rtl: true, callbacks: { label: c => ' ' + c.label + ': ' + formatCurrency(c.parsed) } } }
      }
    });
  }

  function renderPipelineAndAging(lines) {
    const board = $('dsh-pipeline'), agingEl = $('dsh-aging');
    const activeLines = lines.filter(l => !l._isRefundEntry && !(window.isLineCancelled && window.isLineCancelled(l)));
    const cols = [
      { key: 'prog', title: 'قيد التنفيذ', items: [], val: 0 },
      { key: 'rev',  title: 'تحت المراجعة', items: [], val: 0 },
      { key: 'done', title: 'جاهز للتسليم', items: [], val: 0 },
      { key: 'del',  title: 'تم التسليم', items: [], val: 0 }
    ];
    const now = Date.now(), buckets = [['أقل من يوم', 0], ['1 - 3 أيام', 0], ['4 - 7 أيام', 0], ['8 - 14 يوم', 0], ['أكتر من 14 يوم', 0]];

    activeLines.forEach(l => {
      const st = String(l.status || '').toLowerCase(), v = Number(l.total) || 0;
      if (l.delivered || st === 'delivered' || st === 'closed') { cols[3].items.push(l); cols[3].val += v; }
      else {
        if (l.complete || st === 'complete') { cols[2].items.push(l); cols[2].val += v; }
        else if (st.indexOf('review') !== -1 || st.indexOf('مراجع') !== -1) { cols[1].items.push(l); cols[1].val += v; }
        else { cols[0].items.push(l); cols[0].val += v; }
        const ageDays = Math.max(0, Math.floor((now - new Date(l.received_at).getTime()) / 864e5));
        if (ageDays < 1) buckets[0][1]++;
        else if (ageDays <= 3) buckets[1][1]++;
        else if (ageDays <= 7) buckets[2][1]++;
        else if (ageDays <= 14) buckets[3][1]++;
        else buckets[4][1]++;
      }
    });

    if (board) {
      board.innerHTML = cols.map((c, ci) =>
        '<div class="sg-pipe-col sg-stagger" style="--i:' + ci + '">' +
          '<div class="sg-col-pill"><span>' + c.title + '</span><span class="sg-col-count sg-tabular">' + c.items.length + '</span></div>' +
          '<div class="sg-col-val sg-tabular">الإجمالي: ' + formatCurrency(c.val) + '</div>' +
          '<div class="sg-pipe-list">' +
            (c.items.slice(0, 20).map(l => {
              const p = profileByName(l.employee);
              return '<div class="sg-case-card" onclick="openTxModal(\'' + eh(l.transaction_id || '') + '\')">' +
                avatarHtml(p || { id: l.employee || 'u', full_name: l.employee || 'موظف' }, 34) +
                '<div class="sg-case-body"><div class="sg-case-title">' + eh(l.client_name || l.service || 'معاملة') + '</div>' +
                '<div class="sg-case-sub">' + eh(l.service || '—') + ' · ' + formatCurrency(l.total || 0) + '</div></div></div>';
            }).join('') || '<div class="text-center text-xs py-6" style="color:var(--sg-mute)">لا توجد بنود</div>') +
          '</div></div>'
      ).join('');
    }

    if (agingEl) {
      const mx = Math.max.apply(null, buckets.map(b => b[1]).concat([1]));
      agingEl.innerHTML = buckets.map(b =>
        '<div class="sg-bar-row"><div class="sg-bar-top"><span>' + b[0] + '</span><strong class="sg-tabular">' + b[1] + ' بند</strong></div>' +
        '<div class="sg-bar-track"><div class="sg-bar-fill" style="width:' + Math.round(b[1] / mx * 100) + '%"></div></div></div>'
      ).join('');
    }
  }

  async function renderTeamAndTargets(lines) {
    const strip = $('dsh-av-strip'), grid = $('dsh-emps'), ovGrid = $('dsh-ov-targets');
    if (!grid) return;
    const by = new Map();
    lines.forEach(l => {
      const p = profileByName(l.employee), key = p ? p.id : 'n:' + (l.employee || 'غير محدد');
      if (!by.has(key)) by.set(key, { p: p, id: p ? p.id : key, name: p ? p.full_name : (l.employee || 'غير محدد'), sales: 0, comm: 0, open: 0, delivered: 0, tx: new Set() });
      const d = by.get(key); d.sales += Number(l.total) || 0; d.comm += commOf(l);
      if (l.transaction_id && !l._isRefundEntry) {
        d.tx.add(l.transaction_id);
        if (l.delivered) d.delivered++; else d.open++;
      }
    });

    const tgtMap = new Map();
    try {
      const cl = await sbClient.from('month_closures').select('month').order('month');
      const last = (!cl.error && (cl.data || []).length) ? cl.data[cl.data.length - 1].month : null;
      const wm = last ? addM(last, 1) : mk(new Date());
      const t = await sbClient.from('emp_targets').select('user_id,target').eq('month', wm);
      if (!t.error) (t.data || []).forEach(x => { if (Number(x.target) > 0) tgtMap.set(x.user_id, Number(x.target)); });
    } catch (_) {}

    const allRows = [...by.values()].sort((a, b) => b.sales - a.sales);
    const totalSales = Math.max(1, allRows.reduce((a, b) => a + b.sales, 0));
    const maxS = allRows.length ? allRows[0].sales || 1 : 1, mgr = isMgr();

    if (strip) {
      strip.innerHTML = '<button type="button" class="sg-av-chip ' + (!selectedEmp ? 'selected' : '') + '" onclick="filterDashEmp(\'\')">الكل <span class="sg-col-count sg-tabular">' + allRows.length + '</span></button>' +
        allRows.map(r =>
          '<button type="button" class="sg-av-chip ' + (selectedEmp === r.id ? 'selected' : '') + '" onclick="filterDashEmp(\'' + eh(r.id) + '\')">' +
          avatarHtml(r.p || { id: r.name, full_name: r.name }, 26) +
          '<span>' + eh(r.name) + '</span><span class="sg-col-count sg-tabular">' + r.tx.size + '</span></button>'
        ).join('');
    }

    const filtered = selectedEmp ? allRows.filter(r => r.id === selectedEmp) : allRows;
    grid.innerHTML = filtered.map((r, i) => {
      const showComm = mgr || (r.p && currentUser && r.p.id === currentUser.id);
      const tgt = tgtMap.get(r.id) || 0;
      const tgtPct = tgt ? Math.round(r.sales / tgt * 100) : Math.round(r.sales / maxS * 100);
      const sharePct = Math.round(r.sales / totalSales * 100);
      return '<article class="sg-emp-card sg-stagger" style="--i:' + i + '">' +
        '<div class="sg-emp-top"><div class="sg-emp-person">' + avatarHtml(r.p || { id: r.name, full_name: r.name }, 46) +
        '<div class="min-w-0"><div class="truncate font-bold text-sm">' + eh(r.name) + '</div><div class="text-xs" style="color:var(--sg-mute)">' + r.tx.size + ' معاملة · مفتوح ' + r.open + ' · اتسلّم ' + r.delivered + '</div></div></div>' +
        '<span class="sg-col-count sg-tabular">#' + (i + 1) + '</span></div>' +
        '<div class="sg-emp-nums"><div><div class="text-[11px]" style="color:var(--sg-mute)">المبيعات</div><div class="font-bold text-sm sg-tabular mt-0.5">' + formatCurrency(r.sales) + '</div></div>' +
        '<div><div class="text-[11px]" style="color:var(--sg-mute)">' + (showComm ? 'الكوميشن' : 'التارجت') + '</div><div class="font-bold text-sm sg-tabular mt-0.5" style="color:#17B26A">' + (showComm ? formatCurrency(r.comm) : tgtPct + '%') + '</div></div></div>' +
        '<div class="sg-arcs-pair">' +
          '<div class="sg-arc-box">' + svgArc(tgtPct, '#036b29') + '<div class="sg-arc-val sg-tabular">' + tgtPct + '%</div><div class="sg-arc-lbl">' + (tgt ? 'تحقيق التارجت' : 'مقارنة بالأعلى') + '</div></div>' +
          '<div class="sg-arc-box">' + svgArc(sharePct, '#17B26A') + '<div class="sg-arc-val sg-tabular">' + sharePct + '%</div><div class="sg-arc-lbl">حصة المبيعات</div></div>' +
        '</div></article>';
    }).join('') || '<div class="text-center text-xs py-8" style="color:var(--sg-mute)">لا توجد بيانات</div>';

    if (ovGrid) {
      ovGrid.innerHTML = allRows.slice(0, 4).map((r, i) => {
        const tgt = tgtMap.get(r.id) || 0, pct = tgt ? Math.round(r.sales / tgt * 100) : Math.round(r.sales / maxS * 100);
        return '<div class="sg-arc-box sg-stagger" style="--i:' + i + '">' + svgArc(pct, pct >= 60 ? '#036b29' : '#17B26A') +
          '<div class="sg-arc-val sg-tabular">' + pct + '%</div><div class="sg-arc-lbl font-semibold">' + eh(r.name) + '</div></div>';
      }).join('') || '<div class="text-center text-xs py-6" style="color:var(--sg-mute)">لا يوجد تارجت محدد</div>';
    }
    animateArcs($('tab-dash'));
  }

  function renderOpsRich(lines, monthLines) {
    // 1. Top Services with Profit Margin
    const svcEl = $('dsh-svcs');
    if (svcEl) {
      const m = new Map();
      lines.forEach(l => {
        const k = l.service || 'أخرى';
        if (!m.has(k)) m.set(k, { rev: 0, net: 0, cnt: 0 });
        const o = m.get(k), tot = Number(l.total) || 0;
        o.rev += tot; o.net += tot - commOf(l) - execOf(l); if (!l._isRefundEntry) o.cnt++;
      });
      const e = [...m.entries()].sort((a, b) => b[1].rev - a[1].rev).slice(0, 7), max = e.length ? e[0][1].rev || 1 : 1;
      svcEl.innerHTML = e.map(([name, o]) => {
        const mg = o.rev ? Math.round(o.net / o.rev * 100) : 0;
        return '<div class="sg-bar-row"><div class="sg-bar-top"><span class="truncate font-semibold">' + eh(name) + '</span><strong class="sg-tabular shrink-0">' + formatCurrency(o.rev) + '</strong></div>' +
          '<div class="sg-bar-track"><div class="sg-bar-fill" style="width:' + Math.round(o.rev / max * 100) + '%"></div></div>' +
          '<div class="sg-bar-sub sg-tabular">' + o.cnt + ' بند · هامش ربح ' + mg + '% (' + formatCurrency(o.net) + ')</div></div>';
      }).join('') || '<div class="text-center text-xs py-6" style="color:var(--sg-mute)">لا توجد بيانات</div>';
    }

    // 2. Executors Workload
    const exEl = $('dsh-executors');
    if (exEl) {
      const ex = new Map();
      lines.forEach(l => {
        if (l._isRefundEntry) return;
        const k = (l.executor || '').trim() || 'تنفيذ داخلي';
        if (!ex.has(k)) ex.set(k, { open: 0, total: 0, cost: 0 });
        const o = ex.get(k); o.total++; o.cost += execOf(l);
        if (!l.complete && !l.delivered) o.open++;
      });
      const rows = [...ex.entries()].sort((a, b) => b[1].open - a[1].open).slice(0, 7), mx = rows.length ? Math.max(1, rows[0][1].open) : 1;
      exEl.innerHTML = rows.map(([name, o]) =>
        '<div class="sg-bar-row"><div class="sg-bar-top"><span class="font-semibold">' + eh(name) + '</span><strong class="sg-tabular">' + o.open + ' مفتوح</strong></div>' +
        '<div class="sg-bar-track"><div class="sg-bar-fill" style="width:' + Math.round(o.open / mx * 100) + '%"></div></div>' +
        '<div class="sg-bar-sub sg-tabular">' + o.total + ' بند في الفترة · تكلفة ' + formatCurrency(o.cost) + '</div></div>'
      ).join('') || '<div class="text-center text-xs py-6" style="color:var(--sg-mute)">لا توجد بيانات</div>';
    }

    // 3. Top Clients
    const clEl = $('dsh-clients');
    if (clEl) {
      const cl = new Map();
      lines.forEach(l => {
        if (l._isRefundEntry || !l.client_name) return;
        const k = String(l.client_name).trim();
        if (!cl.has(k)) cl.set(k, { rev: 0, tx: new Set() });
        const o = cl.get(k); o.rev += Number(l.total) || 0; if (l.transaction_id) o.tx.add(l.transaction_id);
      });
      const rows = [...cl.entries()].sort((a, b) => b[1].rev - a[1].rev).slice(0, 6), mx = rows.length ? Math.max(1, rows[0][1].rev) : 1;
      clEl.innerHTML = rows.map(([name, o]) =>
        '<div class="sg-bar-row"><div class="sg-bar-top"><span class="truncate font-semibold">' + eh(name) + '</span><strong class="sg-tabular shrink-0">' + formatCurrency(o.rev) + '</strong></div>' +
        '<div class="sg-bar-track"><div class="sg-bar-fill" style="width:' + Math.round(o.rev / mx * 100) + '%"></div></div>' +
        '<div class="sg-bar-sub sg-tabular">' + o.tx.size + ' معاملة</div></div>'
      ).join('') || '<div class="text-center text-xs py-6" style="color:var(--sg-mute)">لا توجد بيانات</div>';
    }

    // 4. Peak Hours Heatmap
    const heatEl = $('dsh-heat');
    if (heatEl) {
      const order = [6, 0, 1, 2, 3, 4, 5], names = { 6: 'السبت', 0: 'الأحد', 1: 'الاثنين', 2: 'الثلاثاء', 3: 'الأربعاء', 4: 'الخميس', 5: 'الجمعة' };
      const g = Array.from({ length: 7 }, () => new Array(24).fill(0)); let mn = 24, mx = -1, top = 0;
      monthLines.forEach(l => {
        if (l._isRefundEntry) return;
        const d = new Date(l.received_at); if (isNaN(d)) return;
        const v = ++g[d.getDay()][d.getHours()]; if (v > top) top = v;
        if (d.getHours() < mn) mn = d.getHours(); if (d.getHours() > mx) mx = d.getHours();
      });
      if (mx < 0) { heatEl.innerHTML = '<div class="py-8 text-center text-xs" style="color:var(--sg-mute)">لا توجد بيانات كافية</div>'; return; }
      const hrs = []; for (let h = mn; h <= mx; h++) hrs.push(h);
      let h = '<div class="grid gap-1.5 text-[10px] min-w-[420px]" style="grid-template-columns:58px repeat(' + hrs.length + ',minmax(0,1fr))"><span></span>' + hrs.map(x => '<span class="text-center sg-tabular" style="color:var(--sg-mute)">' + x + '</span>').join('');
      order.forEach(dw => {
        h += '<span class="flex items-center font-semibold" style="color:var(--sg-ink-2)">' + names[dw] + '</span>';
        hrs.forEach(x => {
          const v = g[dw][x], a = top ? v / top : 0;
          h += '<span title="' + names[dw] + ' ' + x + ':00 — ' + v + ' بند" class="h-7 rounded-lg" style="background:' + (v ? 'rgba(3,107,41,' + (0.14 + a * 0.86).toFixed(2) + ')' : 'rgba(148,163,184,0.14)') + '"></span>';
        });
      });
      heatEl.innerHTML = h + '</div>';
    }
  }

  async function renderLateAndDue() {
    const lateBox = $('dsh-late'), dueBox = $('dsh-due'), cnt = $('dsh-late-count');
    if (!lateBox) return;
    try {
      const r = await sbClient.from('request_lines').select('id,client_name,service,transaction_id,employee,received_at,exec_start_date,duration_days,qty')
        .eq('complete', false).gte('received_at', DATA_FROM_TS).not('duration_days', 'is', null).order('id', { ascending: false }).limit(500);
      if (r.error) throw r.error;
      const t0 = new Date(); t0.setHours(0, 0, 0, 0);
      const calc = (r.data || []).filter(l => !(window.isLineCancelled && window.isLineCancelled(l))).map(l => {
        const base = l.exec_start_date ? new Date(l.exec_start_date + 'T00:00:00') : new Date(l.received_at);
        const due = new Date(base.getTime() + (Number(l.duration_days) || 0) * 864e5);
        return { l, diff: Math.floor((t0 - due) / 864e5) };
      });
      const late = calc.filter(x => x.diff > 0).sort((a, b) => b.diff - a.diff);
      const dueSoon = calc.filter(x => x.diff >= -2 && x.diff <= 0).sort((a, b) => b.diff - a.diff);
      if (cnt) cnt.textContent = String(late.length);

      lateBox.innerHTML = late.slice(0, 40).map(x => {
        const p = profileByName(x.l.employee);
        return '<div class="sg-row-pill" onclick="openTxModal(\'' + eh(x.l.transaction_id || '') + '\')">' +
          '<div class="flex items-center gap-3 min-w-0">' + avatarHtml(p || { id: x.l.employee || 'u', full_name: x.l.employee || 'موظف' }, 34) +
          '<div class="min-w-0"><div class="truncate font-semibold text-sm">' + eh(x.l.client_name || 'عميل') + ' — ' + eh(x.l.service || '') + '</div>' +
          '<div class="text-xs" style="color:var(--sg-mute)">' + eh(x.l.employee || '—') + '</div></div></div>' +
          '<span class="sg-delta neg sg-tabular shrink-0">متأخر ' + x.diff + ' يوم</span></div>';
      }).join('') || '<div class="text-center text-xs py-8" style="color:var(--sg-mute)">لا توجد طلبات متأخرة 🎉</div>';

      if (dueBox) {
        dueBox.innerHTML = dueSoon.slice(0, 25).map(x =>
          '<div class="sg-row-pill" onclick="openTxModal(\'' + eh(x.l.transaction_id || '') + '\')">' +
            '<div class="min-w-0"><div class="truncate font-semibold text-sm">' + eh(x.l.client_name || 'عميل') + '</div>' +
            '<div class="text-xs" style="color:var(--sg-mute)">' + eh(x.l.service || '') + ' · ' + eh(x.l.employee || '') + '</div></div>' +
            '<span class="sg-col-count shrink-0">' + (x.diff === 0 ? 'النهاردة' : 'خلال ' + Math.abs(x.diff) + ' يوم') + '</span></div>'
        ).join('') || '<div class="text-center text-xs py-8" style="color:var(--sg-mute)">لا توجد مواعيد قريبة</div>';
      }
    } catch (_) {
      lateBox.innerHTML = '<div class="text-center text-xs py-6" style="color:var(--sg-mute)">تعذّر تحميل المتأخرات</div>';
    }
  }

  window.filterDashEmp = function (id) {
    selectedEmp = id || '';
    renderDashboardMetrics();
  };

  window.switchDashView = function (v) {
    activeView = v;
    document.querySelectorAll('#tab-dash .sg-pill').forEach(b => b.classList.toggle('active', b.dataset.view === v));
    document.querySelectorAll('#tab-dash .sg-view').forEach(p => p.classList.toggle('active', p.id === 'sg-view-' + v));
    positionGlider();
    animateArcs($('sg-view-' + v));
  };

  window.styleDashButtons = function () {
    ['today', 'week', 'month'].forEach(k => {
      const b = $('dash-btn-' + k);
      if (b) b.classList.toggle('active', range === k);
    });
  };

  window.setDashboardRange = function (r) {
    range = r;
    if (r !== 'pick') { selMonth = ''; const i = $('dsh-month'); if (i) i.value = ''; }
    styleDashButtons();
    renderDashboardMetrics();
  };

  window.setDashboardMonth = function (m) {
    if (!/^\d{4}-\d{2}$/.test(m || '')) { window.setDashboardRange('month'); return; }
    selMonth = m; range = 'pick';
    styleDashButtons();
    renderDashboardMetrics();
  };

  window.dashRefresh = function () { cache = {}; refCache = {}; renderDashboardMetrics(); };

  window.renderDashboardMetrics = async function () {
    if (!sbClient) return;
    const mySeq = ++seq;
    const sel = $('dsh-month');
    if (sel && sel.options.length <= 1) {
      const now = new Date();
      for (let i = 0; i < 12; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1), val = mk(d);
        if (val + '-31' < DATA_FROM_TS) break;
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric' }).format(d);
        sel.appendChild(opt);
      }
    }
    styleDashButtons();
    setTimeout(positionGlider, 30);
    const P = period();
    if ($('dsh-title')) $('dsh-title').textContent = 'لوحة المتابعة — ' + P.label;
    if ($('dsh-sub')) $('dsh-sub').textContent = 'مقارنة مع ' + P.plabel;
    try {
      const chunks = await Promise.all(P.months.map(m => loadMonth(m)));
      if (mySeq !== seq) return;
      const all = chunks.flat();
      const curLines = inRange(all, P.start, P.end), prvLines = inRange(all, P.pstart, P.pend);
      const cur = stats(curLines, P.start, P.end, P.n, P.unit), prv = stats(prvLines, P.pstart, P.pend, P.n, P.unit);
      const dark = document.documentElement.classList.contains('dark');
      renderKpis(cur, prv);
      renderSmartInsights(P, cur, prv, curLines);
      renderMain(P, cur, prv, dark);
      renderPay(curLines, dark);
      renderPipelineAndAging(curLines);
      renderTeamAndTargets(curLines);
      renderOpsRich(curLines, chunks[0] || curLines);
      renderLateAndDue();
    } catch (err) {
      console.warn('dash render error:', err);
    }
  };

  window.addEventListener('resize', positionGlider);

  const _tg = window.toggleDarkMode;
  if (typeof _tg === 'function') {
    window.toggleDarkMode = function () {
      const r = _tg.apply(this, arguments);
      if (typeof currentTab !== 'undefined' && currentTab === 'dash') {
        try { renderDashboardMetrics(); } catch (_) {}
      }
      return r;
    };
  }
  const _lr2 = window.loadRecentRequests;
  if (typeof _lr2 === 'function') {
    window.loadRecentRequests = async function () {
      const x = await _lr2(); cache = {}; refCache = {}; return x;
    };
  }
})();
