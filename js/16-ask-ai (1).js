/* ===== المرحلة 14: اسأل السيستم (ذكاء اصطناعي - للمدير فقط - أرقام مجمّعة بدون بيانات عملاء) ===== */
(function () {
  if (window.__phase14) return; window.__phase14 = true;
  const eh = escapeHtml;
  const isMgr = () => window.__role === 'manager' || !!(currentUser && ['mahmoud.aboshama@tasahel.com.eg', 'mahmoud.aboshama.contact@gmail.com'].includes(String(currentUser.email || '').toLowerCase()));
  const nextM = m => { const a = m.split('-').map(Number); return a[1] === 12 ? (a[0] + 1) + '-01' : a[0] + '-' + String(a[1] + 1).padStart(2, '0'); };
  const SUGG = ['إيه أكتر خدمة جابت إيراد الشهر ده؟', 'قارن مبيعات الشهر ده بالشهر اللي قبله', 'مين أحسن موظف الشهر ده وبكام؟', 'إيه نسبة طرق الدفع؟', 'إيه اللي متأخر أو لسه مش مكتمل؟'];
  let ctx = null, ctxAt = 0, msgs = [], hist = [], busy = false;
  const root = () => $('ai-body');

  /* ---------- تجميع أرقام (من غير أسماء عملاء/تليفونات/عناوين) ---------- */
  async function fetchAll() {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const r = await sbClient.from('request_lines').select('transaction_id,service,qty,total,exec_total,employee,payment_method,status,complete,received_at,exec_start_date,duration_days,commission,commission_per_unit')
        .gte('received_at', DATA_FROM_TS).order('id', { ascending: true }).range(from, from + 999);
      if (r.error) throw r.error;
      out.push.apply(out, r.data || []);
      if ((r.data || []).length < 1000) break;
    }
    return out;
  }
  async function buildCtx() {
    if (ctx && Date.now() - ctxAt < 300000) return ctx;
    const ls = await fetchAll(), months = {}, today = new Date().toLocaleDateString('en-CA'), daily = {};
    const add = (o, k, f) => { const x = o[k] || (o[k] = { sales: 0, qty: 0, lines: 0, commission: 0, exec_cost: 0 }); f(x); };
    ls.forEach(l => {
      const m = String(l.received_at || '').slice(0, 7), d = String(l.received_at || '').slice(0, 10); if (!m) return;
      const mm = months[m] || (months[m] = { sales: 0, exec_cost: 0, lines: 0, tx: new Set(), employees: {}, services: {}, payments: {} });
      const t = Number(l.total) || 0, e = Number(l.exec_total) || 0, c = (l.commission != null && Number.isFinite(Number(l.commission))) ? Number(l.commission) : (Number(l.commission_per_unit) || 0) * (Number(l.qty) || 0);
      mm.sales += t; mm.exec_cost += e; mm.lines++; if (l.transaction_id) mm.tx.add(l.transaction_id);
      const fill = x => { x.sales += t; x.qty += Number(l.qty) || 0; x.lines++; x.commission += c; x.exec_cost += e; };
      add(mm.employees, (l.employee || 'غير محدد').trim(), fill); add(mm.services, (l.service || 'أخرى').trim(), fill); add(mm.payments, (l.payment_method || 'كاش').trim(), fill);
      if (new Date(d + 'T00:00') >= new Date(Date.now() - 14 * 864e5)) daily[d] = (daily[d] || 0) + t;
    });
    const round = o => { Object.keys(o).forEach(k => { if (typeof o[k] === 'number') o[k] = Math.round(o[k]); }); return o; };
    const top = (o, n) => Object.entries(o).sort((a, b) => b[1].sales - a[1].sales).slice(0, n).map(([k, v]) => Object.assign({ name: k }, round(Object.assign({}, v))));
    const out = {};
    Object.keys(months).sort().forEach(m => {
      const x = months[m];
      out[m] = { sales: Math.round(x.sales), exec_cost: Math.round(x.exec_cost), estimated_margin: Math.round(x.sales - x.exec_cost), transactions: x.tx.size, service_lines: x.lines, employees: top(x.employees, 15), top_services: top(x.services, 15), payment_methods: top(x.payments, 8) };
    });
    const t0 = new Date(); t0.setHours(0, 0, 0, 0), late = { total: 0, by_employee: {}, by_service: {}, worst_delay_days: 0, sample_oldest: [] };
    ls.forEach(l => {
      if (l.complete || l.status === 'Delivered' || l.status === 'Complete' || l.duration_days == null) return;
      const b = new Date(String(l.exec_start_date || l.received_at || '').slice(0, 10) + 'T00:00'); if (isNaN(b)) return;
      const days = Math.floor((t0 - new Date(b.getTime() + (Number(l.duration_days) || 0) * 864e5)) / 864e5); if (days <= 0) return;
      late.total++; const e = (l.employee || 'غير محدد').trim(), v = (l.service || 'أخرى').trim();
      late.by_employee[e] = (late.by_employee[e] || 0) + 1; late.by_service[v] = (late.by_service[v] || 0) + 1;
      late.worst_delay_days = Math.max(late.worst_delay_days, days); late.sample_oldest.push({ service: v, employee: e, delay_days: days });
    });
    late.sample_oldest = late.sample_oldest.sort((a, b) => b.delay_days - a.delay_days).slice(0, 10);
    const open = {}; ls.forEach(l => { const s = l.status || 'In Progress'; open[s] = (open[s] || 0) + 1; });
    ctx = { today: today, data_starts: DATA_FROM_TS.slice(0, 10), note: 'الأرقام بالجنيه المصري، من بداية البيانات المسجلة فقط', months: out, lines_by_status: open, late_orders: late, daily_sales_last_14_days: daily };
    ctxAt = Date.now(); return ctx;
  }

  /* ---------- واجهة ---------- */
  const SPARK = '<svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true"><defs><linearGradient id="aixg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a78bfa"/><stop offset=".55" stop-color="#e879f9"/><stop offset="1" stop-color="#fb7185"/></linearGradient></defs><path fill="url(#aixg)" d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9L12 2zM19 14l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9L19 14zM5 15l.7 1.9 1.9.7-1.9.7L5 20.2l-.7-1.9-1.9-.7 1.9-.7L5 15z"/></svg>';
  window.__aiSpark = SPARK;
  const fmt = t => eh(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  function paint() {
    const r = root(); if (!r) return;
    const bub = m => '<div class="aix-row ' + (m.role === 'user' ? 'me' : 'bot') + '"><div class="aix-b ' + (m.role === 'user' ? 'me' : (m.err ? 'err' : 'bot')) + '">' + fmt(m.text) + '</div></div>';
    const empty = '<div class="aix-empty"><div class="aix-orb">' + SPARK + '</div><div class="aix-h">اسأل شغلك أي سؤال</div><div class="aix-p">بحلّل أرقام الشغل المجمّعة وأجاوبك فوراً</div><div class="aix-chips">' + SUGG.map(q => '<button type="button" onclick="aiAsk(this.dataset.q)" data-q="' + eh(q) + '" class="aix-chip">' + eh(q) + '</button>').join('') + '</div></div>';
    r.innerHTML = '<div class="aix-wrap">' +
      '<div class="aix-head"><span class="aix-logo">' + SPARK + '</span><div class="aix-t"><b>اسأل السيستم</b><small>أرقام مجمّعة فقط · بدون أسماء عملاء أو تليفونات</small></div>' +
      (msgs.length ? '<button type="button" onclick="aiClear()" class="aix-ib" title="محادثة جديدة"><i class="fa-solid fa-rotate-right"></i></button>' : '') +
      '<button type="button" onclick="aiToggle()" class="aix-ib" title="إغلاق"><i class="fa-solid fa-xmark"></i></button></div>' +
      '<div id="ai-msgs" class="aix-msgs">' + (msgs.length ? msgs.map(bub).join('') : empty) + (busy ? '<div class="aix-row bot"><div class="aix-b bot aix-typing"><i></i><i></i><i></i></div></div>' : '') + '</div>' +
      '<form onsubmit="aiSubmit(event)" class="aix-form"><input id="ai-q" maxlength="500" autocomplete="off" placeholder="اكتب سؤالك..." class="aix-in" ' + (busy ? 'disabled' : '') + '><button class="aix-send" ' + (busy ? 'disabled' : '') + ' title="إرسال"><i class="fa-solid fa-paper-plane"></i></button></form></div>';
    const b = $('ai-msgs'); if (b) b.scrollTop = b.scrollHeight;
  }
  window.aiClear = function () { msgs = []; hist = []; busy = false; paint(); };
  window.aiSubmit = e => { e.preventDefault(); const i = $('ai-q'); if (i && i.value.trim()) aiAsk(i.value.trim()); };
  window.aiAsk = async function (q) {
    if (busy || !isMgr() || !sbClient) return;
    msgs.push({ role: 'user', text: q }); busy = true; paint();
    try {
      const c = await buildCtx();
      const r = await sbClient.functions.invoke('ask-ai', { body: { question: q, context: c, history: hist } });
      let err = r.error && (r.error.message || String(r.error));
      if (r.error && r.error.context && r.error.context.json) { try { const j = await r.error.context.json(); if (j && j.error) err = j.error; } catch (e) { /* */ } }
      if (!err && r.data && r.data.error) err = r.data.error;
      if (err) { msgs.push({ role: 'model', text: /not found|404|Failed to send|FunctionsFetch/i.test(err) ? 'الدالة ask-ai لسه متنشرتش على Supabase. راجع خطوات النشر.' : 'تعذّر الرد: ' + err, err: true }); }
      else { msgs.push({ role: 'model', text: r.data.answer }); hist.push({ role: 'user', text: q }, { role: 'model', text: r.data.answer }); hist = hist.slice(-6); }
    } catch (e) { msgs.push({ role: 'model', text: 'تعذّر الرد: ' + (e.message || e), err: true }); }
    busy = false; paint();
  };

  /* ---------- زرار عايم + لوحة جانبية ---------- */
  window.aiToggle = function () {
    const p = $('ai-panel'); if (!p) return;
    const open = p.classList.toggle('hidden') === false;
    const f = $('ai-fab'); if (f) f.classList.toggle('on', open);
    if (open) { paint(); const i = $('ai-q'); if (i && window.matchMedia && window.matchMedia('(min-width:640px)').matches) i.focus(); }
  };
  function inject() {
    if ($('ai-fab') || !isMgr()) return;
    document.body.insertAdjacentHTML('beforeend',
      '<button id="ai-fab" type="button" onclick="aiToggle()" class="ai-fab" title="اسأل السيستم" aria-label="اسأل السيستم">' + (window.__aiSpark || '') + '</button>' +
      '<div id="ai-panel" class="ai-panel hidden" role="dialog" aria-label="اسأل السيستم"><div id="ai-body" class="h-full"></div></div>');
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { const p = $('ai-panel'); if (p && !p.classList.contains('hidden')) aiToggle(); } });
  }
  const _li = window.loadInitialData;
  window.loadInitialData = async function () { const x = await _li.apply(this, arguments); inject(); return x; };
  /* لو الأيقونة ما ظهرتش وقت التحميل (الدور اتأخر مثلاً) نحاول تاني عند تغيير التاب */
  const _sw = window.switchTab;
  if (typeof _sw === 'function') window.switchTab = function () { const r = _sw.apply(this, arguments); try { inject(); } catch (e) { /* */ } return r; };
  setTimeout(function () { try { inject(); } catch (e) { /* */ } }, 3000);
  const _lo = window.handleLogout;
  window.handleLogout = async function () { ctx = null; msgs = []; hist = []; ['ai-fab', 'ai-panel'].forEach(id => { const e = $(id); if (e) e.remove(); }); return _lo.apply(this, arguments); };
})();
