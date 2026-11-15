/* =====================================================================
   المرحلة 21: لوحة أداء الموظفين (فيتشر 51) - للمدير بس
   لكل موظف في اليوم المختار: أول وآخر عملية، البنود والمعاملات والتعديلات والحذف،
   أطول فجوة بين العمليات، المتأخر حالياً، وسرعة الإنجاز.
   ومقارنة الموظف بنفسه: آخر 7 أيام مقابل الـ 7 اللي قبلها (مش مقارنة بزمايله).
   المصدر: جدول audit_log (وقت العملية بيتسجل من السيرفر) + البنود المحمّلة أصلاً.
   القياس على سجل العمليات الفعلي في السيستم.
   القواعد: طلب واحد (بصفحات) لسجل آخر 14 يوم بس لما المدير يفتح التاب، ومفيش أنيميشن.
   ===================================================================== */
(function () {
  if (window.__phase21pf) return; window.__phase21pf = true;
  const eh = escapeHtml, num = v => Number(v) || 0;
  const safe = (n, f) => function () { try { return f.apply(this, arguments); } catch (e) { console.warn('p21 ' + n, e); } };
  const wrap = (name, fn) => { const o = window[name]; if (typeof o === 'function') window[name] = fn(o); };
  const isPartner = () => window.__role === 'partner';
  const isMgr = () => { try { return typeof canEditTx === 'function' && !!canEditTx(); } catch (e) { return false; } };
  const profs = () => (typeof profiles !== 'undefined' && Array.isArray(profiles) ? profiles : []);
  const GAP_MIN = 90;           /* فجوة أكبر من كده (بالدقايق) بتتعلّم بتنبيه */
  const BTN_ON = 'tab-btn bg-ink text-white dark:bg-brand-600 shadow-sm';
  const BTN_OFF = 'tab-btn text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800';
  const NOTICE = 'مبني على أوقات العمليات المسجلة وعدد المعاملات والتعديلات وسرعة الإنجاز.';
  window.__perfNotice = NOTICE;

  const st = { day: '', key: '', rows: null, busy: false, err: null };
  let rt = 0;

  const norm = s => { const t = String(s == null ? '' : s); return (typeof normName === 'function' ? String(normName(t)) : t).trim().toLowerCase().replace(/\s+/g, ' '); };
  const dnum = s => {
    if (!s) return NaN;
    const d = s instanceof Date ? s : new Date(String(s).length === 10 ? s + 'T00:00' : s);
    return isNaN(d) ? NaN : Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
  };
  const missing = err => /42P01|PGRST205|does not exist|schema cache/i.test(((err && err.message) || '') + ' ' + ((err && err.code) || ''));
  const todayKey = () => new Date().toLocaleDateString('en-CA');
  const hm = d => new Intl.DateTimeFormat('ar-EG', { hour: 'numeric', minute: '2-digit', hour12: true }).format(d);
  const dur = m => m < 60 ? Math.round(m) + ' دقيقة' : Math.floor(m / 60) + ' س ' + (Math.round(m) % 60) + ' د';
  const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;

  /* ---------------- مفتاح الموظف (نفس ربط الأسماء المستخدم في باقي السيستم) ---------------- */
  const kc = new Map();
  function keyOf(name) {
    const raw = String(name || '').trim(); if (!raw) return null;
    let r = kc.get(raw);
    if (!r) {
      let p = null; try { p = typeof profileByName === 'function' ? profileByName(raw) : null; } catch (e) { /* */ }
      r = p ? { k: 'p' + p.id, name: p.full_name || raw, p: p } : { k: 'n' + norm(raw), name: raw, p: null };
      kc.set(raw, r);
    }
    return r;
  }

  /* ---------------- جلب سجل العمليات (آخر 14 يوم لحد اليوم المختار) ---------------- */
  async function fetchAudit(day) {
    const to = new Date(day + 'T00:00'); to.setDate(to.getDate() + 1);
    const from = new Date(day + 'T00:00'); from.setDate(from.getDate() - 13);
    const out = [];
    for (let i = 0; i < 20; i++) {
      const r = await sbClient.from('audit_log').select('at,user_name,action,transaction_id')
        .gte('at', from.toISOString()).lt('at', to.toISOString()).order('at', { ascending: true }).range(i * 1000, i * 1000 + 999);
      if (r.error) throw r.error;
      out.push.apply(out, r.data || []);
      if ((r.data || []).length < 1000) break;
    }
    return out;
  }
  async function load(force) {
    if (!isMgr() || typeof sbClient === 'undefined' || !sbClient) return;
    if (!force && st.key === st.day && st.rows) return;
    if (st.busy) return;
    st.busy = true; st.err = null; render();
    const want = st.day;
    try { st.rows = await fetchAudit(want); st.key = want; } catch (e) { st.err = e; st.rows = null; }
    st.busy = false; render();
    if (!st.err && st.key !== st.day) load(false);
  }

  /* ---------------- الحساب ---------------- */
  function build(day) {
    const dn = dnum(day), w1a = dn - 6, w0a = dn - 13, w0b = dn - 7, today = dnum(new Date());
    const P = new Map();
    const get = (r) => { let x = P.get(r.k); if (!x) { x = { name: r.name, p: r.p, ev: [], cr: 0, ed: 0, del: 0, tx: new Set(), cr1: 0, cr0: 0, ed1: 0, ed0: 0, sales1: 0, sales0: 0, late: 0, sp1: [], sp0: [], ok1: [0, 0], ok0: [0, 0], plan1: [] }; P.set(r.k, x); } return x; };
    (st.rows || []).forEach(a => {
      const r = keyOf(a.user_name); if (!r) return;
      const t = new Date(a.at), d = dnum(t); if (isNaN(d)) return;
      const x = get(r), isC = a.action === 'created', isD = a.action === 'deleted', isE = !isC && !isD;
      if (d === dn) { x.ev.push(t); if (isC) { x.cr++; if (a.transaction_id) x.tx.add(a.transaction_id); } else if (isD) x.del++; else x.ed++; }
      if (d >= w1a && d <= dn) { if (isC) x.cr1++; if (isE) x.ed1++; }
      else if (d >= w0a && d <= w0b) { if (isC) x.cr0++; if (isE) x.ed0++; }
    });
    allRequestLines.forEach(l => {
      const r = keyOf(l.employee); if (!r) return;
      const x = get(r), rd = dnum(l.received_at || l.created_at), tot = num(l.total);
      if (rd >= w1a && rd <= dn) x.sales1 += tot; else if (rd >= w0a && rd <= w0b) x.sales0 += tot;
      const s = l.status || 'In Progress';
      if (s !== 'Delivered') {
        const sn = dnum(l.exec_start_date), base = isNaN(sn) ? rd : sn, du = num(l.duration_days);
        if (du > 0 && !isNaN(base) && today > base + du) x.late++;
      } else {
        const dd = dnum(l.delivered_date); if (isNaN(dd) || isNaN(rd)) return;
        const days = Math.max(0, dd - rd), du = num(l.duration_days);
        const w = dd >= w1a && dd <= dn ? 1 : (dd >= w0a && dd <= w0b ? 0 : -1);
        if (w === -1) return;
        (w ? x.sp1 : x.sp0).push(days);
        if (du > 0) { const ok = w ? x.ok1 : x.ok0; ok[1]++; if (days <= du) ok[0]++; }
      }
    });
    const list = [];
    P.forEach(x => {
      x.ev.sort((a, b) => a - b);
      x.first = x.ev[0] || null; x.last = x.ev[x.ev.length - 1] || null;
      let g = 0; for (let i = 1; i < x.ev.length; i++) g = Math.max(g, (x.ev[i] - x.ev[i - 1]) / 6e4); x.gap = g;
      if (x.ev.length || x.cr1 || x.cr0 || x.ed1 || x.ed0 || x.sales1 || x.sales0 || x.late) list.push(x);
    });
    list.sort((a, b) => (b.cr - a.cr) || (b.cr1 - a.cr1) || String(a.name).localeCompare(String(b.name), 'ar'));
    return list;
  }

  /* ---------------- العرض ---------------- */
  function dl(cur, prev, lowerBetter) {
    if (!prev && !cur) return '<span class="pf-d">—</span>';
    if (!prev) return '<span class="pf-d">جديد</span>';
    const pct = Math.round((cur - prev) / prev * 100);
    if (!pct) return '<span class="pf-d">=</span>';
    const up = pct > 0, good = lowerBetter === undefined ? null : (lowerBetter ? !up : up);
    return '<span class="pf-d' + (good == null ? '' : good ? ' pf-good' : ' pf-bad') + '">' + (up ? '▲ ' : '▼ ') + Math.abs(pct) + '%</span>';
  }
  const stat = (label, v, warn) => '<div class="pf-st' + (warn ? ' pf-warn' : '') + '"><div class="pf-sv">' + v + '</div><div class="pf-sl">' + label + '</div></div>';
  const wk = (label, v, d) => '<div class="pf-wk"><span>' + label + '</span><span><b>' + v + '</b> ' + d + '</span></div>';
  function card(x) {
    const av = x.p && typeof avatarHtml === 'function' ? avatarHtml(x.p, 34) : '';
    const a1 = avg(x.sp1), a0 = avg(x.sp0), okp = x.ok1[1] ? Math.round(x.ok1[0] / x.ok1[1] * 100) : null;
    const times = x.first ? 'أول عملية <b>' + eh(hm(x.first)) + '</b> · آخر عملية <b>' + eh(hm(x.last)) + '</b>' : 'مفيش عمليات مسجّلة في اليوم ده';
    return '<div class="card pf-card"><div class="pf-head">' + av + '<div class="pf-name">' + eh(x.name) + '</div><div class="pf-ops">' + x.ev.length + ' عملية</div></div>' +
      '<div class="pf-times">' + times + '</div>' +
      '<div class="pf-grid">' + stat('بنود أضافها', x.cr) + stat('معاملات', x.tx.size) + stat('تعديلات', x.ed) + stat('حذف', x.del, x.del > 0) +
      stat('أطول فجوة', x.ev.length > 1 ? eh(dur(x.gap)) : '—', x.gap > GAP_MIN) + stat('متأخر حالياً', x.late, x.late > 0) + '</div>' +
      '<div class="pf-wkh">آخر 7 أيام مقابل الـ 7 اللي قبلها (مقارنة بنفسه)</div>' +
      wk('بنود مضافة', x.cr1, dl(x.cr1, x.cr0)) + wk('مبيعات', eh(formatCurrency(x.sales1)), dl(x.sales1, x.sales0)) + wk('تعديلات', x.ed1, dl(x.ed1, x.ed0)) +
      wk('سرعة الإنجاز', a1 == null ? '—' : (Math.round(a1 * 10) / 10) + ' يوم' + (okp == null ? '' : ' · ' + okp + '% في الميعاد'), a1 == null || a0 == null ? '' : dl(a1, a0, true)) +
      '</div>';
  }
  function render() {
    if (!ensureUi()) return;
    const p = $('tab-perf'); if (!p) return;
    if (!isMgr()) { p.innerHTML = '<div class="card pf-empty">لوحة الأداء للمدير بس.</div>'; return; }
    if (!st.day) st.day = todayKey();
    let h = '<div class="pf-bar"><div><div class="pf-title">أداء الموظفين</div><div class="pf-date">أول وآخر عملية بتتحسب من وقت الحفظ في السيستم</div></div>' +
      '<div class="pf-tools"><input type="date" id="pf-day" class="field pf-in" value="' + eh(st.day) + '" max="' + eh(todayKey()) + '"><button type="button" id="pf-refresh" class="pf-btn" title="تحديث"><i class="fa-solid fa-rotate"></i></button></div></div>' +
      '<div class="pf-note">' + eh(NOTICE) + '</div>';
    if (typeof archiveState !== 'undefined' && archiveState.loading) h += '<div class="pf-note">جارٍ تحميل باقي بيانات الشهر، أرقام المبيعات والسرعة ممكن تزيد.</div>';
    if (typeof DATA_FROM !== 'undefined') h += '<div class="pf-note">البيانات المحمّلة من ' + eh(DATA_FROM) + '، فالمقارنة بالأسابيع الأقدم منه مش هتكون كاملة.</div>';
    if (st.busy) h += '<div class="card pf-empty"><i class="fa-solid fa-spinner fa-spin ms-1"></i> جارٍ تحميل سجل العمليات...</div>';
    else if (st.err) h += '<div class="card pf-empty">' + (missing(st.err) ? 'لازم تشغّل ملف <b>phase5-audit-cash.sql</b> علشان سجل العمليات يشتغل.' : 'تعذّر تحميل سجل العمليات: ' + eh((st.err && st.err.message) || st.err)) + '</div>';
    else if (st.rows) {
      const list = build(st.day);
      h += list.length ? '<div class="pf-cards">' + list.map(card).join('') + '</div>' : '<div class="card pf-empty">مفيش نشاط مسجّل في الفترة دي.</div>';
    }
    p.innerHTML = h;
  }
  const schedule = () => { if (currentTab !== 'perf' || !st.rows) return; clearTimeout(rt); rt = setTimeout(safe('render', render), 150); };

  /* ---------------- الواجهة ---------------- */
  const CSS = '.pf-bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.5rem}.pf-title{font-weight:700;font-size:1.05rem}.pf-date{font-size:11px;opacity:.65;margin-top:.1rem}' +
    '.pf-tools{display:flex;align-items:center;gap:.4rem}.pf-in{width:auto}.pf-btn{border-radius:.75rem;padding:.45rem .7rem;font-size:12px;background:rgba(100,116,139,.14)}.pf-btn:hover{background:rgba(100,116,139,.25)}' +
    '.pf-note{font-size:11px;opacity:.75;border-radius:.75rem;padding:.5rem .7rem;background:rgba(100,116,139,.1)}' +
    '.pf-cards{display:grid;grid-template-columns:minmax(0,1fr);gap:.75rem}@media(min-width:768px){.pf-cards{grid-template-columns:repeat(2,minmax(0,1fr))}}' +
    '.pf-card{padding:.9rem}.pf-head{display:flex;align-items:center;gap:.6rem}.pf-name{font-weight:700;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pf-ops{font-size:11px;opacity:.65}' +
    '.pf-times{font-size:12px;margin:.6rem 0}.pf-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.45rem}' +
    '.pf-st{border-radius:.7rem;padding:.5rem;text-align:center;background:rgba(100,116,139,.1)}.pf-sv{font-weight:700;font-size:.95rem}.pf-sl{font-size:10px;opacity:.65;margin-top:.1rem}' +
    '.pf-warn{background:rgba(225,29,72,.12)}.pf-warn .pf-sv{color:#e11d48}' +
    '.pf-wkh{font-size:11px;font-weight:700;opacity:.7;margin:.8rem 0 .3rem}.pf-wk{display:flex;justify-content:space-between;gap:.5rem;font-size:12px;padding:.3rem 0;border-top:1px solid rgba(100,116,139,.15)}' +
    '.pf-d{font-size:11px;opacity:.75;margin-inline-start:.3rem}.pf-good{color:#059669;opacity:1;font-weight:700}.pf-bad{color:#e11d48;opacity:1;font-weight:700}' +
    '.pf-empty{padding:1.2rem;text-align:center;font-size:12px;opacity:.7}';

  function ensureUi() {
    if (isPartner() || !isMgr()) { const b = $('tab-perf-btn'); if (b) b.remove(); return false; }
    if (!$('pf-style')) { const s = document.createElement('style'); s.id = 'pf-style'; s.textContent = CSS; document.head.appendChild(s); }
    if (!$('tab-perf')) {
      const host = $('tab-myday') || $('tab-notes') || $('tab-tasks'); if (!host) return false;
      const p = document.createElement('div'); p.id = 'tab-perf'; p.className = 'hidden space-y-4';
      host.insertAdjacentElement('afterend', p);
      p.addEventListener('change', function (e) { if (e.target && e.target.id === 'pf-day' && e.target.value) { st.day = e.target.value; load(true); } });
      p.addEventListener('click', function (e) { const b = e.target && e.target.closest ? e.target.closest('#pf-refresh') : null; if (b) load(true); });
    }
    if (!$('tab-perf-btn')) {
      const menu = $('nav-menu'); if (!menu) return false;
      const b = document.createElement('button'); b.id = 'tab-perf-btn'; b.type = 'button'; b.className = BTN_OFF;
      b.setAttribute('onclick', "switchTab('perf')");
      b.innerHTML = '<i class="fa-solid fa-gauge-high"></i><span>أداء الموظفين</span>';
      b.setAttribute('data-tab-target', 'perf');
      const perfBody = menu.querySelector(':scope > section[data-mg="perf"] .mg-body');
      const a = $('tab-dash-btn') || $('tab-search-btn');
      if (perfBody) perfBody.appendChild(b);
      else if (a && a.parentElement) a.insertAdjacentElement('afterend', b);
      else menu.appendChild(b);
    }
    return true;
  }

  /* ---------------- الربط مع الدوال القديمة (من غير تعديلها) ---------------- */
  wrap('switchTab', o => function (id) {
    const r = o.apply(this, arguments);
    try {
      const p = $('tab-perf'), b = $('tab-perf-btn'), on = id === 'perf';
      if (p) p.classList.toggle('hidden', !on);
      if (b) b.className = on ? BTN_ON : BTN_OFF;
      if (on) { render(); load(false); }
    } catch (e) { console.warn('p21 tab', e); }
    return r;
  });
  wrap('refreshLineViews', o => function () { const r = o.apply(this, arguments); schedule(); return r; });
  wrap('loadInitialData', o => async function () { const x = await o.apply(this, arguments); try { ensureUi(); } catch (e) { console.warn('p21 setup', e); } return x; });
  wrap('handleLogout', o => function () {
    try { st.rows = null; st.key = ''; st.day = ''; st.err = null; kc.clear(); clearTimeout(rt); const p = $('tab-perf'); if (p) p.innerHTML = ''; const b = $('tab-perf-btn'); if (b) b.remove(); } catch (e) { /* */ }
    return o.apply(this, arguments);
  });
})();
