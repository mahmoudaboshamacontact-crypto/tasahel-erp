/* =====================================================================
   المرحلة 22: الملخص الأسبوعي (للمدير) + شاشة "تقدمي" (للموظف)
   - المدير: ملخص كل موظف مقارنةً بأسبوعه اللي فات (الترتيب أبجدي، مفيش مقارنة بين الموظفين).
   - الموظف: تقدمه هو بس (التارجت، العمولة، أسبوعه يوم بيوم، إنجازات).
   - المصدر: جدول weekly_summaries (بيتولّد من السيرفر كل سبت - sql/weekly-summary.sql).
   - الألوان: من متغيرات الثيم الحالي (--r-*) فمفيش ألوان جديدة. بدون أنيميشن.
   ===================================================================== */
(function () {
  if (window.__phase22wk) return; window.__phase22wk = true;
  const eh = escapeHtml, num = v => Number(v) || 0;
  const wrap = (name, fn) => { const o = window[name]; if (typeof o === 'function') window[name] = fn(o); };
  const isPartner = () => window.__role === 'partner';
  const isMgr = () => { try { return typeof canEditTx === 'function' && !!canEditTx(); } catch (e) { return false; } };
  const BTN_ON = 'tab-btn bg-ink text-white dark:bg-brand-600 shadow-sm';
  const BTN_OFF = 'tab-btn text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800';
  const DAYS = ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
  const OK = 'var(--r-ok,#5fd3b3)', WARN = 'var(--r-acc,#ff9d6c)', MUTE = 'var(--r-mute,#8a8178)';
  const st = { rows: null, busy: false, err: null, week: '', month: null, targets: [], tried: false };

  const nextM = m => { const a = m.split('-').map(Number); return a[1] === 12 ? (a[0] + 1) + '-01' : a[0] + '-' + String(a[1] + 1).padStart(2, '0'); };
  const curMonth = () => new Date().toLocaleDateString('en-CA').slice(0, 7);
  const fmt = n => Math.round(num(n)).toLocaleString('en-US');
  const dayNo = s => { const t = new Date(String(s || '').slice(0, 10) + 'T00:00'); return isNaN(t) ? NaN : Math.floor(t / 864e5); };
  const dLabel = ds => { try { return new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'long' }).format(new Date(ds + 'T00:00')); } catch (e) { return ds; } };
  const addDays = (ds, n) => { const d = new Date(ds + 'T00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA'); };
  function lastWeekStart() { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 1) % 7) - 7); return d.toLocaleDateString('en-CA'); }
  const profFor = name => { try { return typeof profileByName === 'function' ? profileByName(name) : null; } catch (e) { return null; } };
  const meId = () => (typeof currentUser !== 'undefined' && currentUser) ? currentUser.id : null;

  /* ---------------- جلب البيانات ---------------- */
  async function fetchRows() {
    const r = await sbClient.from('weekly_summaries').select('user_id,week_start,data').order('week_start', { ascending: false }).limit(60);
    if (r.error) throw r.error; return r.data || [];
  }
  async function loadMonth() {
    const c = await sbClient.from('month_closures').select('month').order('month');
    const cl = (c.data || []).map(x => x.month).sort();
    st.month = cl.length ? nextM(cl[cl.length - 1]) : curMonth();
    const t = await sbClient.from('emp_targets').select('user_id,target,services_target').eq('month', st.month);
    st.targets = t.data || [];
  }
  async function load() {
    if (st.busy || typeof sbClient === 'undefined' || !sbClient || isPartner()) return;
    st.busy = true; st.err = null; render();
    try {
      let rows = await fetchRows();
      if (isMgr() && !st.tried && !rows.some(x => x.week_start === lastWeekStart())) {
        st.tried = true;
        const g = await sbClient.rpc('generate_weekly_summaries_now');
        if (!g.error) rows = await fetchRows();
      }
      st.rows = rows;
      if (!st.week && rows.length) st.week = rows[0].week_start;
      await loadMonth();
    } catch (e) { st.err = e; }
    st.busy = false; render();
  }

  /* ---------------- حسابات ---------------- */
  function monthStats(uid) {
    const lines = (typeof allRequestLines !== 'undefined' && Array.isArray(allRequestLines)) ? allRequestLines : [];
    let sales = 0, units = 0, comm = 0;
    lines.forEach(l => {
      if (String(l.received_at || l.created_at || '').slice(0, 7) !== st.month) return;
      const p = profFor(l.employee); if (!p || p.id !== uid) return;
      sales += num(l.total); units += Math.max(0, num(l.qty));
      try { if (typeof window.lineComm === 'function') comm += num(window.lineComm(l)); } catch (e) { /* */ }
    });
    /* خصم الاستردادات المعتمدة (approved) التي decided_at في الشهر الحالي */
    if (typeof window.getAllApprovedRefunds === 'function') {
      window.getAllApprovedRefunds().forEach(rf => {
        if (String(rf.decided_at || '').slice(0, 7) !== st.month) return;
        const orig = lines.find(x => String(x.id) === String(rf.line_id));
        if (!orig) return;
        const p = profFor(orig.employee); if (!p || p.id !== uid) return;
        const rq = Math.max(0, num(rf.qty));
        units -= rq;
        sales -= num(rf.sales_amount);
        try {
          if (typeof window.lineComm === 'function') {
            const hint = rf.unit_comm_hint != null && rf.unit_comm_hint !== '' ? rf.unit_comm_hint : orig.commission_per_unit;
            comm -= num(window.lineComm({ service: orig.service, qty: rq, commission_per_unit: hint }));
          }
        } catch (e) { /* */ }
      });
    }
    const t = st.targets.find(x => x.user_id === uid) || {}, target = num(t.target), svc = num(t.services_target);
    const pct = svc > 0 ? Math.round(units / svc * 100) : (target > 0 ? Math.round(sales / target * 100) : null);
    return { sales, units, comm, target, svc, pct };
  }
  function liveLate(uid) {
    const lines = (typeof allRequestLines !== 'undefined' && Array.isArray(allRequestLines)) ? allRequestLines : [];
    const today = dayNo(new Date().toLocaleDateString('en-CA')); let n = 0;
    lines.forEach(l => {
      if ((l.status || 'In Progress') === 'Delivered') return;
      const du = num(l.duration_days); if (du <= 0) return;
      const base = isNaN(dayNo(l.exec_start_date)) ? dayNo(l.received_at || l.created_at) : dayNo(l.exec_start_date);
      if (isNaN(base) || today <= base + du) return;
      const p = profFor(l.employee); if (p && p.id === uid) n++;
    });
    return n;
  }
  function pctD(c, p) {
    c = num(c); p = num(p);
    if (p > 0) { const v = Math.round((c - p) / p * 100); return { t: (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v) + '%', s: Math.sign(v) }; }
    return c > 0 ? { t: 'جديد', s: 1 } : { t: '—', s: 0 };
  }
  const colOf = s => s > 0 ? OK : s < 0 ? WARN : MUTE;
  function model(row) {
    const d = row.data || {}, c = d.cur || {}, p = d.prev || {};
    const tx = pctD(c.tx, p.tx), it = pctD(c.items, p.items);
    const hasSp = c.speed_days != null && p.speed_days != null && num(p.speed_days) > 0;
    const spv = hasSp ? Math.round((num(c.speed_days) - num(p.speed_days)) / num(p.speed_days) * 100) : 0;
    const late = num(d.late), pl = d.prev_late == null ? null : num(d.prev_late);
    const ls = pl == null ? 0 : (late < pl ? 1 : late > pl ? -1 : 0);
    const score = tx.s + (hasSp ? -Math.sign(spv) : 0) + ls;
    const mid = c.speed_days != null
      ? { label: 'متوسط الإنجاز', val: num(c.speed_days) + ' يوم', d: hasSp ? (spv < 0 ? 'أسرع ' + Math.abs(spv) + '%' : spv > 0 ? 'أبطأ ' + spv + '%' : 'زي الأسبوع اللي فات') : '—', s: hasSp ? -Math.sign(spv) : 0 }
      : { label: 'بنود', val: String(num(c.items)), d: it.t, s: it.s };
    const gapTxt = num(c.gap_min) > 0 ? 'أطول فجوة بين العمليات: ' + Math.floor(num(c.gap_min) / 60) + ' س ' + (num(c.gap_min) % 60) + ' د يوم ' + (DAYS[c.gap_day] || '') : '';
    return { d, c, p, tx, mid, late, pl, ls, score, gapTxt };
  }

  /* ---------------- العرض ---------------- */
  const CSS = '.wk{max-width:560px;margin-inline:auto;display:flex;flex-direction:column;gap:14px;color:var(--r-text,inherit)}.wk.wk-m{max-width:980px}' +
    '.wk-h{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}.wk h2{margin:0;font-size:1.5rem;font-weight:700}.wk-sub{font-size:.8rem;color:' + MUTE + '}' +
    '.wk-card{padding:16px;border-radius:18px;background:var(--r-card,rgba(127,127,127,.08));border:1px solid var(--r-line,rgba(127,127,127,.25))}' +
    '.wk-grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.wk-lbl{font-size:.75rem;color:' + MUTE + '}.wk-val{font-size:1.25rem;font-weight:700}.wk-dl{font-size:.75rem;font-weight:600}' +
    '.wk-emps{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px}.wk-emp{display:flex;flex-direction:column;gap:14px}' +
    '.wk-who{display:flex;align-items:center;gap:12px}.wk-av{width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;color:#1a1208;background:linear-gradient(135deg,var(--r-acc,#ff9d6c),var(--r-acc2,#ff7a3d))}' +
    '.wk-chip{font-size:.7rem;font-weight:600;border-radius:999px;padding:4px 10px;white-space:nowrap}' +
    '.wk-bar{height:8px;border-radius:8px;background:var(--r-line,rgba(127,127,127,.25));overflow:hidden}.wk-bar>i{display:block;height:100%;border-radius:8px;background:linear-gradient(90deg,var(--r-acc2,#ff7a3d),var(--r-acc,#ff9d6c))}' +
    '.wk-note{font-size:.75rem;color:' + MUTE + ';line-height:1.7}.wk-pill{border-radius:999px;padding:6px 12px;font-size:.75rem;border:1px solid var(--r-line,rgba(127,127,127,.25));background:transparent;color:inherit;cursor:pointer}.wk-pill.on{background:var(--r-acc,#ff9d6c);color:#1a1208;border-color:transparent;font-weight:700}' +
    '.wk-ring{position:relative;width:124px;height:124px;flex-shrink:0}.wk-ring>div{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}' +
    '.wk-bars{display:flex;align-items:flex-end;justify-content:space-between;gap:8px;height:110px}.wk-bars>div{flex:1 1 0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:6px;height:100%}.wk-bars i{width:100%;border-radius:8px 8px 4px 4px;display:block}' +
    '.wk-win{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:16px;background:var(--r-card,rgba(127,127,127,.08));border:1px solid var(--r-line,rgba(127,127,127,.25))}.wk-ic{width:38px;height:38px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:rgba(255,157,108,.15);color:' + WARN + '}' +
    '.wk-btn{min-height:44px;padding:0 16px;border:0;border-radius:12px;font-family:inherit;font-size:.8rem;font-weight:700;color:#1a1208;background:linear-gradient(135deg,var(--r-acc,#ff9d6c),var(--r-acc2,#ff7a3d));cursor:pointer;flex-shrink:0}' +
    '.wk-alert{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-radius:16px;background:rgba(255,157,108,.1);border:1px solid rgba(255,157,108,.28);font-size:.8rem;line-height:1.6}';
  const STAR = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/></svg>';
  const LOCK = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

  function head(title, sub) { return '<div class="wk-h"><div><h2>' + eh(title) + '</h2><div class="wk-sub">' + eh(sub) + '</div></div><button type="button" id="wk-refresh" class="wk-pill">تحديث</button></div>'; }
  function empty(msg) { return '<div class="wk-card wk-note" style="text-align:center;padding:28px 16px">' + eh(msg) + '</div>'; }

  function renderMgr() {
    const weeks = Array.from(new Set(st.rows.map(r => r.week_start))).slice(0, 6);
    if (!weeks.includes(st.week)) st.week = weeks[0];
    const rows = st.rows.filter(r => r.week_start === st.week).map(r => ({ r, m: model(r) }))
      .sort((a, b) => String(a.m.d.name).localeCompare(String(b.m.d.name), 'ar'));
    let tx = 0, it = 0, late = 0; rows.forEach(x => { tx += num(x.m.c.tx); it += num(x.m.c.items); late += x.m.late; });
    const pills = weeks.map(w => '<button type="button" class="wk-pill' + (w === st.week ? ' on' : '') + '" data-wk="' + eh(w) + '">' + eh(dLabel(w)) + '</button>').join('');
    const cards = rows.map(x => {
      const m = x.m, ms = monthStats(x.r.user_id), nm = String(m.d.name || '');
      const chip = m.score >= 1 ? ['أحسن من أسبوعه اللي فات', OK, 'rgba(95,211,179,.14)'] : m.score <= -1 ? ['محتاج متابعة بسيطة', WARN, 'rgba(255,157,108,.14)'] : ['زي أسبوعه اللي فات تقريبًا', MUTE, 'rgba(127,127,127,.14)'];
      const lateD = m.pl == null ? '—' : (m.late < m.pl ? 'أقل بـ ' + (m.pl - m.late) : m.late > m.pl ? 'أكتر بـ ' + (m.late - m.pl) : 'زي الأسبوع اللي فات');
      const tgt = ms.pct == null ? 'غير محدد' : ms.pct + '%';
      return '<div class="wk-card wk-emp"><div class="wk-who"><div class="wk-av">' + eh(nm.trim().charAt(0)) + '</div><div style="flex-grow:1;font-weight:600">' + eh(nm) + '</div>' +
        '<span class="wk-chip" style="color:' + chip[1] + ';background:' + chip[2] + '">' + chip[0] + '</span></div>' +
        '<div class="wk-grid3"><div><div class="wk-lbl">معاملات</div><div class="wk-val">' + num(m.c.tx) + '</div><div class="wk-dl" style="color:' + colOf(m.tx.s) + '">' + m.tx.t + '</div></div>' +
        '<div><div class="wk-lbl">' + m.mid.label + '</div><div class="wk-val">' + eh(m.mid.val) + '</div><div class="wk-dl" style="color:' + colOf(m.mid.s) + '">' + eh(m.mid.d) + '</div></div>' +
        '<div><div class="wk-lbl">متأخر حاليًا</div><div class="wk-val">' + m.late + '</div><div class="wk-dl" style="color:' + colOf(m.ls) + '">' + lateD + '</div></div></div>' +
        '<div><div style="display:flex;justify-content:space-between" class="wk-lbl"><span>تارجت الشهر</span><b style="color:var(--r-text,inherit)">' + tgt + '</b></div><div class="wk-bar" style="margin-top:6px"><i style="width:' + Math.min(100, ms.pct || 0) + '%"></i></div></div>' +
        (m.gapTxt ? '<div class="wk-note" style="border-top:1px solid var(--r-line,rgba(127,127,127,.25));padding-top:10px">' + eh(m.gapTxt) + '</div>' : '') + '</div>';
    }).join('');
    return '<div class="wk wk-m">' + head('ملخص الأسبوع', 'من ' + dLabel(st.week) + ' إلى ' + dLabel(addDays(st.week, 5))) +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' + pills + '</div>' +
      '<div class="wk-grid3"><div class="wk-card"><div class="wk-lbl">المعاملات</div><div class="wk-val" style="font-size:1.5rem">' + tx + '</div></div>' +
      '<div class="wk-card"><div class="wk-lbl">البنود</div><div class="wk-val" style="font-size:1.5rem">' + it + '</div></div>' +
      '<div class="wk-card"><div class="wk-lbl">متأخر حاليًا</div><div class="wk-val" style="font-size:1.5rem;color:' + WARN + '">' + late + '</div></div></div>' +
      '<div class="wk-lbl" style="font-weight:600">كل موظف مقارنةً بأسبوعه اللي فات</div><div class="wk-emps">' + cards + '</div>' +
      '<div class="wk-note" style="text-align:center">الترتيب أبجدي، ومفيش مقارنة بين الموظفين. كل موظف بيتقارن بنفسه بس.</div></div>';
  }

  function workDaysLeft() {
    const t = new Date(); t.setHours(0, 0, 0, 0); const [y, mo] = String(st.month || curMonth()).split('-').map(Number);
    const end = new Date(y, mo, 0); let n = 0;
    for (const d = new Date(t); d <= end; d.setDate(d.getDate() + 1)) { if (d > t && d.getDay() !== 5) n++; }
    return n;
  }
  function renderEmp() {
    const me = meId(), mine = st.rows.filter(r => r.user_id === me).sort((a, b) => b.week_start.localeCompare(a.week_start));
    const p0 = (typeof myProfile !== 'undefined' && myProfile) ? myProfile : null;
    const first = String((p0 && p0.full_name) || '').trim().split(/\s+/)[0] || '';
    const hello = 'أهلًا يا ' + first;
    if (!mine.length) return '<div class="wk">' + head(hello, 'تقدمك هنا، مقارنةً بنفسك بس') + empty('تقدمك الأسبوعي هيظهر هنا أول ما يتجهز، وده بيحصل كل سبت.') + '</div>';
    const row = mine[0], m = model(row), c = m.c, ms = monthStats(me), pct = ms.pct;
    const off = (326.7 * (1 - Math.min(1, (pct || 0) / 100))).toFixed(1);
    const tgtLine = ms.svc > 0 ? ms.units + ' من ' + ms.svc + ' خدمة' : (ms.target > 0 ? fmt(ms.sales) + ' من ' + fmt(ms.target) + ' ج' : 'التارجت لسه متحددش');
    const days = (c.days || []).slice(0, 6), mx = Math.max.apply(null, days.concat([1])), best = Math.max.apply(null, days);
    const bars = days.map((v, i) => '<div><div class="wk-lbl" style="font-size:.7rem">' + v + '</div><i style="height:' + Math.max(4, Math.round(v / mx * 84)) + 'px;background:' + (v === best && v > 0 ? 'var(--r-acc,#ff9d6c)' : 'rgba(255,157,108,.38)') + '"></i></div>').join('');
    const names = days.map((v, i) => '<div class="wk-lbl" style="flex:1 1 0;text-align:center;font-size:.7rem">' + DAYS[i] + '</div>').join('');
    const wins = [];
    if (m.tx.s > 0 && num(m.p.tx) > 0) wins.push(['أعلى من أسبوعك اللي فات', num(c.tx) + ' معاملة مقابل ' + num(m.p.tx)]);
    if (m.late === 0) wins.push(['من غير أي متأخر', 'كل شغلك ماشي في ميعاده']);
    if (m.mid.s > 0 && c.speed_days != null) wins.push(['أسرع من أسبوعك اللي فات', 'متوسط ' + c.speed_days + ' يوم']);
    if (best > 0) wins.push(['أحسن يوم ليك: ' + DAYS[days.indexOf(best)], best + ' معاملة']);
    if (mine.length > 1 && num(c.tx) >= Math.max.apply(null, mine.slice(1).map(r => num(r.data && r.data.cur && r.data.cur.tx)))) wins.push(['أعلى أسبوع ليك', num(c.tx) + ' معاملة']);
    const next = [20, 30, 40, 50, 60, 80, 100, 150, 200].find(v => v > num(c.tx));
    const lateNow = liveLate(me);
    return '<div class="wk">' + head(hello, 'تقدمك الأسبوع ده، مقارنةً بنفسك بس') +
      '<div class="wk-card" style="display:flex;align-items:center;gap:18px"><div class="wk-ring"><svg width="124" height="124" viewBox="0 0 124 124" role="img" aria-label="' + (pct == null ? 'التارجت' : pct + '% من التارجت') + '"><circle cx="62" cy="62" r="52" fill="none" stroke="var(--r-line,rgba(127,127,127,.25))" stroke-width="11"/><circle cx="62" cy="62" r="52" fill="none" stroke="var(--r-acc,#ff9d6c)" stroke-width="11" stroke-linecap="round" stroke-dasharray="326.7" stroke-dashoffset="' + off + '" transform="rotate(-90 62 62)"/></svg>' +
      '<div><div style="font-size:1.9rem;font-weight:700;line-height:1">' + (pct == null ? '—' : pct + '%') + '</div><div class="wk-lbl" style="margin-top:4px">من التارجت</div></div></div>' +
      '<div style="display:flex;flex-direction:column;gap:12px;min-width:0"><div><div class="wk-lbl">تارجت الشهر</div><div style="font-weight:600">' + eh(tgtLine) + '</div></div>' +
      '<div><div class="wk-lbl">عمولتك لحد دلوقتي</div><div style="font-weight:600;color:' + WARN + '">' + fmt(ms.comm) + ' ج</div></div>' +
      '<div class="wk-note">باقي ' + workDaysLeft() + ' يوم شغل في الشهر</div></div></div>' +
      '<div class="wk-card" style="display:flex;flex-direction:column;gap:14px"><div style="display:flex;align-items:baseline;justify-content:space-between"><b>أسبوعك يوم بيوم</b><span class="wk-lbl">' + num(c.tx) + ' معاملة</span></div>' +
      '<div class="wk-bars">' + bars + '</div><div style="display:flex;justify-content:space-between;gap:8px">' + names + '</div>' +
      '<div class="wk-grid3" style="grid-template-columns:repeat(2,minmax(0,1fr));border-top:1px solid var(--r-line,rgba(127,127,127,.25));padding-top:14px">' +
      '<div><div class="wk-lbl">معاملاتك</div><div class="wk-dl" style="color:' + colOf(m.tx.s) + '">' + (m.tx.s === 0 && m.tx.t === '—' ? '—' : m.tx.t + ' عن أسبوعك اللي فات') + '</div></div>' +
      '<div><div class="wk-lbl">' + m.mid.label + ' ' + eh(m.mid.val) + '</div><div class="wk-dl" style="color:' + colOf(m.mid.s) + '">' + eh(m.mid.d) + '</div></div></div></div>' +
      '<b style="margin-top:2px">إنجازاتك</b><div style="display:flex;flex-direction:column;gap:10px">' +
      (wins.length ? wins.slice(0, 3).map(w => '<div class="wk-win"><div class="wk-ic">' + STAR + '</div><div><div style="font-weight:600;font-size:.88rem">' + eh(w[0]) + '</div><div class="wk-note">' + eh(w[1]) + '</div></div></div>').join('') : '<div class="wk-note">كل أسبوع بتشتغل فيه بيتسجل هنا.</div>') +
      (next ? '<div class="wk-win" style="border-style:dashed;background:transparent"><div class="wk-ic" style="background:rgba(127,127,127,.12);color:' + MUTE + '">' + LOCK + '</div><div><div style="font-weight:600;font-size:.88rem;color:' + MUTE + '">قريب: ' + next + ' معاملة في أسبوع</div><div class="wk-note">باقي لك ' + (next - num(c.tx)) + ' معاملة</div></div></div>' : '') + '</div>' +
      (lateNow > 0 ? '<div class="wk-alert"><div>عندك ' + lateNow + ' معاملة متأخرة. افتحها وخلّصها لما يكون مناسب.</div><button type="button" class="wk-btn" id="wk-late">افتحها</button></div>' : '') +
      '<div class="wk-note" style="text-align:center">الأرقام دي بتقارنك بأسبوعك اللي فات بس، مش بزمايلك.</div></div>';
  }

  function render() {
    if (!ensureUi()) return;
    const p = $('tab-wk'); if (!p || p.classList.contains('hidden')) return;
    if (st.err) { p.innerHTML = '<div class="wk">' + empty('مقدرتش أحمّل الملخص. جرّب تحديث.') + '<div style="text-align:center"><button type="button" id="wk-refresh" class="wk-pill">تحديث</button></div></div>'; return; }
    if (st.rows == null) { p.innerHTML = '<div class="wk">' + empty('بحمّل الملخص...') + '</div>'; return; }
    try {
      if (isMgr()) p.innerHTML = st.rows.length ? renderMgr() : '<div class="wk wk-m">' + head('ملخص الأسبوع', 'بيتجهز أوتوماتيك كل سبت') + empty('لسه مفيش ملخص جاهز. أول ما يتجهز هيظهر هنا.') + '</div>';
      else p.innerHTML = renderEmp();
    } catch (e) { console.warn('p22 render', e); p.innerHTML = '<div class="wk">' + empty('حصل خطأ في عرض الملخص.') + '</div>'; }
  }

  function ensureUi() {
    if (isPartner()) { const b = $('tab-wk-btn'); if (b) b.remove(); return false; }
    if (!$('wk-style')) { const s = document.createElement('style'); s.id = 'wk-style'; s.textContent = CSS; document.head.appendChild(s); }
    if (!$('tab-wk')) {
      const host = $('tab-perf') || $('tab-myday') || $('tab-notes') || $('tab-tasks'); if (!host) return false;
      const p = document.createElement('div'); p.id = 'tab-wk'; p.className = 'hidden space-y-4';
      host.insertAdjacentElement('afterend', p);
      p.addEventListener('click', function (e) {
        const t = e.target && e.target.closest ? e.target : null; if (!t) return;
        const w = t.closest('[data-wk]'); if (w) { st.week = w.getAttribute('data-wk'); render(); return; }
        if (t.closest('#wk-refresh')) { st.tried = false; st.rows = null; load(); return; }
        if (t.closest('#wk-late')) { if (typeof openMyDayTab === 'function') openMyDayTab('all'); else switchTab('myday'); }
      });
    }
    if (!$('tab-wk-btn')) {
      const menu = $('nav-menu'); if (!menu) return false;
      const b = document.createElement('button'); b.id = 'tab-wk-btn'; b.type = 'button'; b.className = BTN_OFF;
      b.setAttribute('onclick', "switchTab('wk')");
      b.innerHTML = '<i class="fa-solid fa-chart-column"></i><span></span>';
      const a = $('tab-search-btn');
      menu.insertBefore(b, a && a.parentElement === menu ? a : menu.firstChild);
    }
    const lab = $('tab-wk-btn') && $('tab-wk-btn').querySelector('span'); if (lab) lab.textContent = isMgr() ? 'الملخص الأسبوعي' : 'تقدمي';
    return true;
  }

  /* ---------------- الربط مع الدوال القديمة (من غير تعديلها) ---------------- */
  window.openWeeklySummary = function () { try { switchTab('wk'); } catch (e) { /* */ } };
  wrap('switchTab', o => function (id) {
    const r = o.apply(this, arguments);
    try {
      const p = $('tab-wk'), b = $('tab-wk-btn'), on = id === 'wk';
      if (p) p.classList.toggle('hidden', !on);
      if (b) b.className = on ? BTN_ON : BTN_OFF;
      if (on) { render(); if (st.rows == null) load(); }
    } catch (e) { console.warn('p22 tab', e); }
    return r;
  });
  wrap('loadInitialData', o => async function () { const x = await o.apply(this, arguments); try { ensureUi(); } catch (e) { console.warn('p22 setup', e); } return x; });
  wrap('handleLogout', o => function () {
    try { st.rows = null; st.week = ''; st.month = null; st.targets = []; st.err = null; st.tried = false; const p = $('tab-wk'); if (p) p.innerHTML = ''; const b = $('tab-wk-btn'); if (b) b.remove(); } catch (e) { /* */ }
    return o.apply(this, arguments);
  });
})();
