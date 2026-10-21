/* =====================================================================
   المرحلة 20: شاشة "شغلي النهاردة" (فيتشر 52)
   تاب لكل موظف: معاملاته النهاردة، بنوده المفتوحة والمتأخرة، وعمولة الشهر.
   القواعد: مفيش استعلامات جديدة على قاعدة البيانات (كله من البيانات المحمّلة أصلاً)،
   ومفيش أي أنيميشن، والملف معزول بـ try/catch ومبيلمسش أي ملف قديم.
   المتأخر = بند مفتوح عدّت مدته (duration_days) من تاريخ بدء التنفيذ أو الاستلام.
   البند اللي من غير مدة بيظهر في "المفتوحة" بس.
   الشهر = شهر الشغل الحالي في تاب الكوميشن (الشهر اللي بعد آخر شهر مقفول)، والتارجت من جدول emp_targets.
   ===================================================================== */
(function () {
  if (window.__phase20md) return; window.__phase20md = true;
  const eh = escapeHtml, num = v => Number(v) || 0;
  const safe = (n, f) => function () { try { return f.apply(this, arguments); } catch (e) { console.warn('p20 ' + n, e); } };
  const wrap = (name, fn) => { const o = window[name]; if (typeof o === 'function') window[name] = fn(o); };
  const isPartner = () => window.__role === 'partner';
  const isMgr = () => { try { return typeof canEditTx === 'function' && !!canEditTx(); } catch (e) { return false; } };
  const me = () => (typeof myProfile !== 'undefined' ? myProfile : null);
  const profs = () => (typeof profiles !== 'undefined' && Array.isArray(profiles) ? profiles : []);
  const LIMIT = 25;
  const BTN_ON = 'tab-btn bg-ink text-white dark:bg-brand-600 shadow-sm';
  const BTN_OFF = 'tab-btn text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800';
  let who = '', rt = 0;
  const NOTICE = 'إعلان للفريق: السيستم بيقيس الشغل جوه السيستم بس: أول وآخر عملية في اليوم (بوقت الحفظ)، وعدد المعاملات والتعديلات، وسرعة الإنجاز، ولوحة الأداء بيشوفها المدير بس. مفيش أي مراقبة للشاشة أو الوش أو حركة الماوس.';

  const norm = s => { const t = String(s == null ? '' : s); return (typeof normName === 'function' ? String(normName(t)) : t).trim().toLowerCase().replace(/\s+/g, ' '); };
  const dnum = s => {
    if (!s) return NaN;
    const d = s instanceof Date ? s : new Date(String(s).length === 10 ? s + 'T00:00' : s);
    return isNaN(d) ? NaN : Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
  };

  /* ---------------- الشهر والتارجت (نفس منطق 07-commission-targets.js) ---------------- */
  const nextM = m => { const a = m.split('-').map(Number); return a[1] === 12 ? (a[0] + 1) + '-01' : a[0] + '-' + String(a[1] + 1).padStart(2, '0'); };
  const curMonth = () => new Date().toLocaleDateString('en-CA').slice(0, 7);
  const lineComm = l => (l.commission != null && Number.isFinite(Number(l.commission))) ? Number(l.commission) : (Number(l.commission_per_unit) || 0) * (Number(l.qty) || 0);
  const meta = { closures: null, tgt: {}, busy: false };
  function workingMonth() {
    const cl = (meta.closures || []).slice().sort();
    return cl.length ? nextM(cl[cl.length - 1]) : curMonth();
  }
  async function loadMeta(force) {
    if (meta.busy || typeof sbClient === 'undefined' || !sbClient) return;
    meta.busy = true;
    try {
      if (force || meta.closures === null) {
        const c = await sbClient.from('month_closures').select('month');
        meta.closures = c.error ? [] : (c.data || []).map(x => x.month);
      }
      const tp = targetProfile();
      if (tp) {
        const key = tp.id + '|' + workingMonth();
        const t = await sbClient.from('emp_targets').select('target').eq('user_id', tp.id).eq('month', workingMonth()).maybeSingle();
        meta.tgt[key] = t.error ? null : (t.data ? num(t.data.target) : 0);
      }
    } catch (e) { console.warn('p20 meta', e); if (meta.closures === null) meta.closures = []; }
    meta.busy = false;
    if (currentTab === 'myday') render();
  }
  const ringColor = pct => pct >= 100 ? '#059669' : pct >= 60 ? '#0d9488' : pct >= 30 ? '#d97706' : '#dc2626';

  /* ---------------- الحساب ---------------- */
  function targetProfile() {
    const mp = me();
    if (who && isMgr()) return profs().find(p => String(p.id) === who) || mp;
    return mp;
  }
  function mineFn(p) {
    const nm = p && p.full_name ? norm(p.full_name) : '', cache = new Map();
    return l => {
      const e = l.employee || ''; if (!e) return false;
      let r = cache.get(e);
      if (r === undefined) {
        let q = null; try { q = typeof profileByName === 'function' ? profileByName(e) : null; } catch (x) { /* */ }
        r = q && p ? String(q.id) === String(p.id) : (!!nm && norm(e) === nm);
        cache.set(e, r);
      }
      return r;
    };
  }
  function compute(p, wm) {
    const mine = mineFn(p), today = dnum(new Date()), tk = dayKey(new Date());
    const r = { orders: new Set(), sales: 0, deliv: 0, late: [], open: [], comm: 0, mSales: 0 };
    allRequestLines.forEach(l => {
      if (!mine(l)) return;
      const rd = lineDate(l), dk = dayKey(rd), st = l.status || 'In Progress';
      if (dk === tk) { r.orders.add(l.transaction_id || ('TX-' + l.id)); r.sales += num(l.total); }
      if (dk && dk.slice(0, 7) === wm) { r.comm += lineComm(l); r.mSales += num(l.total); }
      if (st === 'Delivered') { if (String(l.delivered_date || '').slice(0, 10) === tk) r.deliv++; return; }
      const rdn = dnum(rd), sn = dnum(l.exec_start_date), base = isNaN(sn) ? rdn : sn, dur = num(l.duration_days);
      const it = { l: l, st: st, age: isNaN(rdn) ? 0 : Math.max(0, today - rdn), late: 0 };
      if (dur > 0 && !isNaN(base) && today > base + dur) { it.late = today - (base + dur); r.late.push(it); } else r.open.push(it);
    });
    r.late.sort((a, b) => b.late - a.late); r.open.sort((a, b) => b.age - a.age);
    return r;
  }

  /* ---------------- العرض ---------------- */
  const kpi = (label, value, cls) => '<div class="card md-kpi' + (cls ? ' ' + cls : '') + '"><div class="md-kv">' + value + '</div><div class="md-kl">' + label + '</div></div>';
  function ageText(it) {
    if (it.late) return 'متأخر ' + it.late + (it.late === 1 ? ' يوم' : ' يوم');
    return it.age === 0 ? 'النهاردة' : it.age === 1 ? 'من أمس' : 'من ' + it.age + ' يوم';
  }
  function row(it) {
    const l = it.l, tx = l.transaction_id || ('TX-' + l.id);
    return '<div class="md-row"><div class="md-main"><button type="button" ' + ac(l.client_name) + ' class="md-client">' + eh(l.client_name) + '</button>' +
      '<div class="md-sub">' + eh(l.service) + ' ×' + eh(l.qty) + '</div></div>' +
      '<div class="md-side">' + badge(it.st) + '<button type="button" ' + at(tx) + ' class="md-tx" dir="ltr">' + eh(tx) + '</button>' +
      '<span class="md-age' + (it.late ? ' md-late' : '') + '">' + eh(ageText(it)) + '</span></div></div>';
  }
  function section(title, list, emptyMsg, cls) {
    let h = '<div class="card md-sec' + (cls ? ' ' + cls : '') + '"><div class="md-sech"><span>' + title + '</span><span class="md-cnt">' + list.length + '</span></div>';
    if (!list.length) h += '<div class="md-empty">' + emptyMsg + '</div>';
    else {
      h += list.slice(0, LIMIT).map(row).join('');
      if (list.length > LIMIT) h += '<div class="md-empty">+ ' + (list.length - LIMIT) + ' بند تاني (استخدم البحث Ctrl+K للوصول ليهم)</div>';
    }
    return h + '</div>';
  }
  function render() {
    if (!ensureUi()) return;
    const p = $('tab-myday'); if (!p) return;
    const tp = targetProfile();
    let h = '<div class="md-head"><div><div class="md-title">شغلي النهاردة</div><div class="md-date">' +
      eh(new Intl.DateTimeFormat('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())) +
      (tp && tp.full_name ? ' · ' + eh(tp.full_name) : '') + '</div></div><div class="md-tools">';
    if (isMgr()) {
      h += '<select id="md-who" class="field md-who"><option value="">أنا</option>' +
        profs().map(x => '<option value="' + eh(x.id) + '"' + (String(x.id) === who ? ' selected' : '') + '>' + eh(x.full_name || '—') + '</option>').join('') + '</select>';
    }
    h += '<button type="button" id="md-refresh" class="md-btn" title="تحديث"><i class="fa-solid fa-rotate"></i></button></div></div>';
    if (typeof archiveState !== 'undefined' && archiveState.loading) h += '<div class="md-note">جارٍ تحميل باقي بيانات الشهر، الأرقام ممكن تزيد.</div>';
    if (!tp || !tp.full_name) {
      h += '<div class="card md-empty">اكتب اسمك في "حسابي" بنفس الاسم اللي بتكتبه في خانة الموظف المسؤول علشان نجمع شغلك هنا.</div>';
      p.innerHTML = h; return;
    }
    const wm = workingMonth(), key = tp.id + '|' + wm, tg = meta.tgt[key];
    if (meta.closures === null || tg === undefined) loadMeta(false);
    const r = compute(tp, wm), openN = r.late.length + r.open.length;
    h += '<div class="md-grid">' +
      kpi('معاملاتي النهاردة', r.orders.size) + kpi('مبيعاتي النهاردة', eh(formatCurrency(r.sales))) +
      kpi('بنود مفتوحة', openN) + kpi('متأخرة', r.late.length, r.late.length ? 'md-late-card' : '') +
      kpi('مبيعات الشهر', eh(formatCurrency(r.mSales))) + '</div>';
    const pct = tg > 0 ? Math.round(r.mSales / tg * 100) : null, col = pct == null ? '#94a3b8' : ringColor(pct);
    h += '<div class="card md-goal"><div class="md-goalh"><span>التارجت</span><span class="md-goalv" style="color:' + col + '">' + (pct == null ? (tg === undefined ? '...' : 'لم يُحدد بعد') : pct + '%') + '</span></div>' +
      '<div class="md-bar"><div class="md-fill" style="width:' + Math.min(100, pct || 0) + '%;background:' + col + '"></div></div>' +
      '<div class="md-goalf"><span>مبيعات الشهر: ' + eh(formatCurrency(r.mSales)) + (tg > 0 ? ' من ' + eh(formatCurrency(tg)) : '') + '</span><span>عمولة الشهر: ' + eh(formatCurrency(r.comm)) + '</span></div></div>';
    h += '<div class="md-note">اتسلّم النهاردة: ' + r.deliv + ' بند</div>';
    h += section('متأخرة', r.late, 'مفيش بنود متأخرة', 'md-sec-late');
    h += section('مفتوحة', r.open, 'مفيش بنود مفتوحة');
    h += '<div class="md-note">' + eh(NOTICE) + '</div>';
    p.innerHTML = h;
  }
  const schedule = () => { if (currentTab !== 'myday') return; clearTimeout(rt); rt = setTimeout(safe('render', render), 120); };

  /* ---------------- الواجهة (تاب + زرار + ستايل) ---------------- */
  const CSS = '#tab-myday .md-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.5rem}' +
    '.md-title{font-weight:700;font-size:1.05rem}.md-date{font-size:11px;opacity:.65;margin-top:.1rem}' +
    '.md-tools{display:flex;align-items:center;gap:.4rem}.md-who{width:auto;min-width:8rem}' +
    '.md-btn{border-radius:.75rem;padding:.45rem .7rem;font-size:12px;background:rgba(100,116,139,.14)}.md-btn:hover{background:rgba(100,116,139,.25)}' +
    '.md-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.6rem}@media(min-width:640px){.md-grid{grid-template-columns:repeat(5,minmax(0,1fr))}}' +
    '.md-kpi{padding:.8rem;text-align:center}.md-kv{font-weight:700;font-size:1.1rem}.md-kl{font-size:11px;opacity:.65;margin-top:.15rem}' +
    '.md-late-card .md-kv{color:#e11d48}.md-note{font-size:11px;opacity:.7}' +
    '.md-sec{overflow:hidden}.md-sech{display:flex;justify-content:space-between;align-items:center;padding:.7rem .9rem;font-weight:700;font-size:.85rem}' +
    '.md-sec-late .md-sech{color:#e11d48}.md-cnt{font-size:11px;border-radius:999px;padding:.1rem .55rem;background:rgba(100,116,139,.16)}' +
    '.md-row{display:flex;justify-content:space-between;align-items:center;gap:.5rem;padding:.6rem .9rem;border-top:1px solid rgba(100,116,139,.18)}' +
    '.md-main{min-width:0}.md-client{font-weight:600;font-size:.8rem;text-align:start}.md-client:hover{text-decoration:underline}' +
    '.md-sub{font-size:11px;opacity:.65;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:46vw}' +
    '.md-side{display:flex;flex-wrap:wrap;justify-content:flex-end;align-items:center;gap:.4rem;font-size:11px}' +
    '.md-tx{font-family:monospace;color:#0d9488}.md-tx:hover{text-decoration:underline}.md-age{opacity:.7}.md-late{color:#e11d48;font-weight:700;opacity:1}' +
    '.md-goal{padding:.8rem .9rem}.md-goalh{display:flex;justify-content:space-between;align-items:baseline;font-weight:700;font-size:.85rem}.md-goalv{font-family:monospace;font-size:1.1rem}' +
    '.md-bar{height:.6rem;border-radius:999px;background:rgba(100,116,139,.18);overflow:hidden;margin:.5rem 0}.md-fill{height:100%;border-radius:999px}' +
    '.md-goalf{display:flex;flex-wrap:wrap;justify-content:space-between;gap:.3rem;font-size:11px;opacity:.75}' +
    '.md-empty{padding:1rem;text-align:center;font-size:12px;opacity:.6}';

  function ensureUi() {
    if (isPartner()) { const b = $('tab-myday-btn'); if (b) b.remove(); return false; }
    if (!$('md-style')) { const s = document.createElement('style'); s.id = 'md-style'; s.textContent = CSS; document.head.appendChild(s); }
    if (!$('tab-myday')) {
      const host = $('tab-notes') || $('tab-tasks'); if (!host) return false;
      const p = document.createElement('div'); p.id = 'tab-myday'; p.className = 'hidden space-y-5';
      host.insertAdjacentElement('afterend', p);
      p.addEventListener('change', function (e) { if (e.target && e.target.id === 'md-who') { who = e.target.value; render(); } });
      p.addEventListener('click', function (e) {
        const b = e.target && e.target.closest ? e.target.closest('#md-refresh') : null; if (!b) return;
        if (typeof loadRecentRequests === 'function') loadRecentRequests(); loadMeta(true); render();
      });
    }
    if (!$('tab-myday-btn')) {
      const menu = $('nav-menu'); if (!menu) return false;
      const b = document.createElement('button'); b.id = 'tab-myday-btn'; b.type = 'button'; b.className = BTN_OFF;
      b.setAttribute('onclick', "switchTab('myday')");
      b.innerHTML = '<i class="fa-solid fa-sun"></i><span>شغلي النهاردة</span>';
      const a = $('tab-search-btn');
      menu.insertBefore(b, a && a.parentElement === menu ? a : menu.firstChild);
    }
    return true;
  }

  /* ---------------- الربط مع الدوال القديمة (من غير تعديلها) ---------------- */
  wrap('switchTab', o => function (id) {
    const r = o.apply(this, arguments);
    try {
      const p = $('tab-myday'), b = $('tab-myday-btn'), on = id === 'myday';
      if (p) p.classList.toggle('hidden', !on);
      if (b) b.className = on ? BTN_ON : BTN_OFF;
      if (on) render();
    } catch (e) { console.warn('p20 tab', e); }
    return r;
  });
  wrap('refreshLineViews', o => function () { const r = o.apply(this, arguments); schedule(); return r; });
  wrap('loadInitialData', o => async function () { const x = await o.apply(this, arguments); try { ensureUi(); } catch (e) { console.warn('p20 setup', e); } return x; });
  wrap('handleLogout', o => function () {
    try { who = ''; meta.closures = null; meta.tgt = {}; clearTimeout(rt); const p = $('tab-myday'); if (p) p.innerHTML = ''; } catch (e) { /* */ }
    return o.apply(this, arguments);
  });
})();
