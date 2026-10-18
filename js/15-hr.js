/* ===== المرحلة 13: الموارد البشرية (حضور - إجازات - سلف/خصومات/مكافآت - كشف مرتب) ===== */
(function () {
  if (window.__phase13) return; window.__phase13 = true;
  const eh = escapeHtml, GRACE = 10, PAID_LEAVE = ['annual', 'sick'];
  const isMgr = () => window.__role ? window.__role === 'manager' : !!(currentUser && ['mahmoud.aboshama@tasahel.com.eg', 'mahmoud.aboshama.contact@gmail.com'].includes(String(currentUser.email || '').toLowerCase()));
  const missing = err => /42P01|PGRST205|does not exist|schema cache/i.test(((err && err.message) || '') + ' ' + ((err && err.code) || ''));
  const P2 = n => String(n).padStart(2, '0');
  const ymd = d => d.getFullYear() + '-' + P2(d.getMonth() + 1) + '-' + P2(d.getDate());
  const today = () => ymd(new Date());
  const nextM = m => { const a = m.split('-').map(Number); return a[1] === 12 ? (a[0] + 1) + '-01' : a[0] + '-' + P2(a[1] + 1); };
  const mLabel = m => new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric' }).format(new Date(m + '-01T00:00'));
  const tm = s => s ? new Date(s).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '—';
  const dl = s => new Intl.DateTimeFormat('ar-EG', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(s + 'T00:00'));
  const LK = { annual: 'اعتيادية', sick: 'مرضية', unpaid: 'بدون مرتب', permission: 'إذن ساعات' };
  const AK = { advance: 'سلفة', deduction: 'خصم', bonus: 'مكافأة' };
  const SK = { pending: 'قيد المراجعة', approved: 'موافق عليها', rejected: 'مرفوضة' };
  const nameOf = id => { const p = profiles.find(x => x.id === id); return p ? (p.full_name || 'موظف') : 'موظف'; };
  const fld = 'field !py-2 text-xs';

  let month = new Date().toLocaleDateString('en-CA').slice(0, 7), sub = null, staff = [], att = [], leaves = [], adj = [], comm = new Map(), setup = false, busy = false;
  const root = () => $('tab-hr');

  /* ---------- تحميل ---------- */
  async function fetchComm(m) {
    const out = new Map(), cl = await sbClient.from('month_closures').select('month').eq('month', m);
    if (!cl.error && (cl.data || []).length) {
      const s = await sbClient.from('month_snapshots').select('user_id,commission').eq('month', m);
      (s.data || []).forEach(r => out.set(r.user_id, Number(r.commission) || 0)); return out;
    }
    const a0 = m + '-01T00:00:00', a = a0 > DATA_FROM_TS ? a0 : DATA_FROM_TS, b = nextM(m) + '-01T00:00:00';
    if (b <= DATA_FROM_TS) return out;
    for (let from = 0; ; from += 1000) {
      const r = await sbClient.from('request_lines').select('employee,qty,commission,commission_per_unit').gte('received_at', a).lt('received_at', b).order('id', { ascending: true }).range(from, from + 999);
      if (r.error) return out;
      (r.data || []).forEach(l => {
        const p = profileByName(l.employee); if (!p) return;
        const c = (l.commission != null && Number.isFinite(Number(l.commission))) ? Number(l.commission) : (Number(l.commission_per_unit) || 0) * (Number(l.qty) || 0);
        out.set(p.id, (out.get(p.id) || 0) + c);
      });
      if ((r.data || []).length < 1000) break;
    }
    return out;
  }
  async function load() {
    const a = month + '-01', b = nextM(month) + '-01', y0 = month.slice(0, 4) + '-01-01', y1 = (Number(month.slice(0, 4)) + 1) + '-01-01';
    const [s, t, l, j] = await Promise.all([
      sbClient.from('hr_staff').select('*'),
      sbClient.from('hr_attendance').select('*').gte('day', a).lt('day', b).order('day'),
      sbClient.from('hr_leaves').select('*').gte('to_day', y0).lt('from_day', y1).order('created_at', { ascending: false }).limit(600),
      sbClient.from('hr_adjustments').select('*').eq('month', month).order('created_at', { ascending: false })
    ]);
    const bad = [s, t, l, j].find(x => x.error);
    if (bad) { setup = missing(bad.error); if (!setup) showError('تعذّر تحميل الموارد البشرية', bad.error); return false; }
    setup = false; staff = s.data || []; att = t.data || []; leaves = l.data || []; adj = j.data || [];
    comm = isMgr() ? await fetchComm(month).catch(() => new Map()) : new Map();
    return true;
  }
  const cfg = uid => staff.find(x => x.user_id === uid) || { user_id: uid, base_salary: 0, work_start: '09:00', annual_leave_days: 21, hire_date: null };
  const people = () => isMgr() ? profiles.filter(p => p.id) : profiles.filter(p => p.id === currentUser.id);

  /* ---------- حسابات ---------- */
  function leaveDays(uid, kinds) { /* مجموعة أيام الإجازة المعتمدة داخل الشهر */
    const set = new Set(), a = month + '-01', b = nextM(month) + '-01';
    leaves.filter(x => x.user_id === uid && x.status === 'approved' && x.kind !== 'permission' && kinds.includes(x.kind)).forEach(x => {
      for (let d = new Date(x.from_day + 'T00:00'), e = new Date(x.to_day + 'T00:00'); d <= e; d.setDate(d.getDate() + 1)) { const k = ymd(d); if (k >= a && k < b) set.add(k); }
    });
    return set;
  }
  function stats(uid) {
    const c = cfg(uid), rows = att.filter(r => r.user_id === uid), by = new Map(rows.map(r => [r.day, r]));
    const last = month === today().slice(0, 7) ? today() : ymd(new Date(new Date(nextM(month) + '-01T00:00').getTime() - 864e5));
    const paid = leaveDays(uid, PAID_LEAVE), start = (c.work_start || '09:00').split(':').map(Number);
    let present = 0, absent = 0, lateMin = 0, lateDays = 0, hours = 0;
    for (let d = new Date(month + '-01T00:00'); ymd(d) <= last; d.setDate(d.getDate() + 1)) {
      const k = ymd(d); if (d.getDay() === 5) continue; if (c.hire_date && k < c.hire_date) continue;
      const r = by.get(k);
      if (r && r.check_in) {
        present++; const ci = new Date(r.check_in), m = ci.getHours() * 60 + ci.getMinutes() - (start[0] * 60 + (start[1] || 0));
        if (m > GRACE) { lateMin += m; lateDays++; }
        if (r.check_out) hours += (new Date(r.check_out) - ci) / 36e5;
      } else if (!paid.has(k) && !(k === today())) absent++;
    }
    return { present, absent, lateMin, lateDays, hours, paidLeave: paid.size };
  }
  function payroll(uid) {
    const c = cfg(uid), st = stats(uid), base = Number(c.base_salary) || 0, cm = comm.get(uid) || 0;
    const sum = k => adj.filter(x => x.user_id === uid && x.kind === k).reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const absDed = Math.round(st.absent * base / 30), bonus = sum('bonus'), ded = sum('deduction'), adv = sum('advance');
    return { base, cm, bonus, ded, adv, absDed, st, net: base + cm + bonus - ded - adv - absDed };
  }
  function balance(uid) {
    const y = month.slice(0, 4), used = leaves.filter(x => x.user_id === uid && x.status === 'approved' && x.kind === 'annual' && x.from_day.slice(0, 4) === y)
      .reduce((s, x) => s + Math.round((new Date(x.to_day) - new Date(x.from_day)) / 864e5) + 1, 0);
    return { total: Number(cfg(uid).annual_leave_days) || 21, used };
  }

  /* ---------- واجهة ---------- */
  const tabs = () => isMgr()
    ? [['att', 'الحضور'], ['lv', 'الإجازات'], ['adj', 'سلف وخصومات ومكافآت'], ['pay', 'كشف المرتبات'], ['set', 'إعدادات الموظفين']]
    : [['att', 'حضوري'], ['lv', 'إجازاتي'], ['pay', 'كشفي']];
  const btn = (t, on) => '<button type="button" onclick="hr.go(\'' + t[0] + '\')" class="rounded-xl px-3 py-2 text-xs font-semibold transition ' + (on ? 'bg-ink text-white dark:bg-brand-600' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300') + '">' + t[1] + '</button>';
  const tile = (l, v, c) => '<div class="card p-3"><div class="text-[11px] text-slate-500">' + l + '</div><div class="mt-1 text-base font-bold mono ' + (c || 'text-ink dark:text-white') + '">' + v + '</div></div>';
  const empty = t => '<div class="card p-6 text-center text-xs text-slate-400">' + t + '</div>';
  const opts = (sel) => people().map(p => '<option value="' + p.id + '"' + (p.id === sel ? ' selected' : '') + '>' + eh(p.full_name || 'موظف') + '</option>').join('');

  function todayCard() {
    const me = currentUser.id, r = att.find(x => x.user_id === me && x.day === today());
    const label = !r ? 'تسجيل حضور' : (!r.check_out ? 'تسجيل انصراف' : 'تم الانصراف'), dis = r && r.check_out;
    return '<div class="card flex flex-wrap items-center justify-between gap-3 p-4"><div><div class="text-sm font-bold text-ink dark:text-white">النهارده ' + dl(today()) + '</div><div class="mt-1 text-xs text-slate-500">حضور: <b>' + tm(r && r.check_in) + '</b> — انصراف: <b>' + tm(r && r.check_out) + '</b></div></div>' +
      '<button type="button" onclick="hr.punch()" ' + (dis ? 'disabled' : '') + ' class="rounded-xl px-4 py-2.5 text-sm font-bold text-white ' + (dis ? 'bg-slate-400' : (!r ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700')) + '"><i class="fa-solid fa-fingerprint ms-1.5"></i>' + label + '</button></div>';
  }
  function viewAtt() {
    const ps = people(), st = ps.map(p => [p, stats(p.id)]);
    let h = todayCard();
    h += '<div class="card overflow-x-auto"><table class="w-full text-xs text-right"><thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-500"><tr><th class="p-2.5">الموظف</th><th class="p-2.5">أيام الحضور</th><th class="p-2.5">غياب</th><th class="p-2.5">أيام تأخير</th><th class="p-2.5">دقائق التأخير</th><th class="p-2.5">ساعات العمل</th></tr></thead><tbody>' +
      st.map(([p, s]) => '<tr class="border-t border-slate-100 dark:border-slate-800"><td class="p-2.5 font-semibold">' + eh(p.full_name || 'موظف') + '</td><td class="p-2.5 mono">' + s.present + '</td><td class="p-2.5 mono ' + (s.absent ? 'text-rose-600 font-bold' : '') + '">' + s.absent + '</td><td class="p-2.5 mono">' + s.lateDays + '</td><td class="p-2.5 mono">' + Math.round(s.lateMin) + '</td><td class="p-2.5 mono">' + s.hours.toFixed(1) + '</td></tr>').join('') + '</tbody></table></div>';
    const rows = att.filter(r => isMgr() || r.user_id === currentUser.id).slice().sort((a, b) => b.day.localeCompare(a.day) || 0);
    h += '<div class="card p-3 space-y-2"><div class="text-xs font-bold text-ink dark:text-white">سجل الحضور - ' + mLabel(month) + '</div>' + (rows.length ? '<div class="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">' + rows.map(r => '<div class="flex items-center justify-between gap-2 py-1.5 text-xs"><span class="font-semibold">' + dl(r.day) + (isMgr() ? ' - ' + eh(nameOf(r.user_id)) : '') + '</span><span class="mono text-slate-500">' + tm(r.check_in) + ' ← ' + tm(r.check_out) + '</span>' + (isMgr() ? '<button type="button" onclick="hr.delAtt(\'' + r.id + '\')" class="text-slate-400 hover:text-rose-600"><i class="fa-solid fa-trash-can"></i></button>' : '') + '</div>').join('') + '</div>' : '<div class="text-xs text-slate-400">لا يوجد سجل.</div>') + '</div>';
    if (isMgr()) h += '<form onsubmit="hr.manualAtt(event)" class="card grid gap-2 p-3 sm:grid-cols-5"><div class="sm:col-span-5 text-xs font-bold text-ink dark:text-white">إضافة / تعديل حضور يدوي</div><select name="u" class="' + fld + '">' + opts() + '</select><input name="d" type="date" required value="' + today() + '" class="' + fld + '"><input name="i" type="time" required value="09:00" class="' + fld + '"><input name="o" type="time" class="' + fld + '"><button class="rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-white">حفظ</button></form>';
    return h;
  }
  function viewLv() {
    const me = currentUser.id, mgr = isMgr(), list = leaves.filter(x => mgr || x.user_id === me), b = balance(me);
    let h = '';
    if (!mgr) h += '<div class="grid grid-cols-3 gap-2">' + tile('رصيد الاعتيادي', b.total) + tile('المستخدم', b.used) + tile('المتبقي', b.total - b.used, 'text-emerald-600') + '</div>';
    h += '<form onsubmit="hr.reqLeave(event)" class="card grid gap-2 p-3 sm:grid-cols-6"><div class="sm:col-span-6 text-xs font-bold text-ink dark:text-white">' + (mgr ? 'تسجيل إجازة لموظف' : 'طلب إجازة / إذن') + '</div>' +
      (mgr ? '<select name="u" class="' + fld + '">' + opts() + '</select>' : '') +
      '<select name="k" class="' + fld + '">' + Object.keys(LK).map(k => '<option value="' + k + '">' + LK[k] + '</option>').join('') + '</select>' +
      '<input name="f" type="date" required value="' + today() + '" class="' + fld + '"><input name="t" type="date" required value="' + today() + '" class="' + fld + '">' +
      '<input name="r" placeholder="السبب" class="' + fld + '"><button class="rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-white">' + (mgr ? 'تسجيل (معتمدة)' : 'إرسال الطلب') + '</button></form>';
    h += '<div class="space-y-2">' + (list.length ? list.map(x => '<div class="card flex flex-wrap items-center justify-between gap-2 p-3 text-xs"><div><div class="font-bold text-ink dark:text-white">' + (mgr ? eh(nameOf(x.user_id)) + ' - ' : '') + LK[x.kind] + '</div><div class="text-slate-500">' + dl(x.from_day) + (x.to_day !== x.from_day ? ' ← ' + dl(x.to_day) : '') + (x.reason ? ' · ' + eh(x.reason) : '') + '</div></div><div class="flex items-center gap-2"><span class="rounded-full px-2 py-0.5 font-semibold ' + (x.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : x.status === 'rejected' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700') + '">' + SK[x.status] + '</span>' +
      (mgr && x.status === 'pending' ? '<button type="button" onclick="hr.decide(\'' + x.id + '\',\'approved\')" class="rounded-lg bg-emerald-600 px-2.5 py-1 font-bold text-white">موافقة</button><button type="button" onclick="hr.decide(\'' + x.id + '\',\'rejected\')" class="rounded-lg bg-rose-600 px-2.5 py-1 font-bold text-white">رفض</button>' : '') +
      ((mgr || x.status === 'pending') && x.user_id === me || mgr ? '<button type="button" onclick="hr.delLv(\'' + x.id + '\')" class="text-slate-400 hover:text-rose-600"><i class="fa-solid fa-trash-can"></i></button>' : '') + '</div></div>').join('') : empty('لا توجد إجازات.')) + '</div>';
    return h;
  }
  function viewAdj() {
    let h = '<form onsubmit="hr.addAdj(event)" class="card grid gap-2 p-3 sm:grid-cols-5"><div class="sm:col-span-5 text-xs font-bold text-ink dark:text-white">حركة مالية على موظف - ' + mLabel(month) + '</div><select name="u" class="' + fld + '">' + opts() + '</select><select name="k" class="' + fld + '"><option value="advance">سلفة</option><option value="deduction">خصم</option><option value="bonus">مكافأة</option></select><input name="a" type="number" min="1" step="any" required placeholder="المبلغ" class="' + fld + '"><input name="n" placeholder="ملاحظة" class="' + fld + '"><button class="rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-white">إضافة</button></form>';
    h += '<div class="space-y-2">' + (adj.length ? adj.map(x => '<div class="card flex items-center justify-between gap-2 p-3 text-xs"><div><b class="text-ink dark:text-white">' + eh(nameOf(x.user_id)) + '</b> · ' + AK[x.kind] + (x.note ? ' · ' + eh(x.note) : '') + '</div><div class="flex items-center gap-2"><b class="mono ' + (x.kind === 'bonus' ? 'text-emerald-600' : 'text-rose-600') + '">' + (x.kind === 'bonus' ? '+' : '-') + formatCurrency(x.amount) + '</b><button type="button" onclick="hr.delAdj(\'' + x.id + '\')" class="text-slate-400 hover:text-rose-600"><i class="fa-solid fa-trash-can"></i></button></div></div>').join('') : empty('لا توجد حركات في الشهر ده.')) + '</div>';
    return h;
  }
  function viewPay() {
    const ps = people(), rows = ps.map(p => [p, payroll(p.id)]), tot = rows.reduce((s, [, r]) => s + r.net, 0);
    let h = '<div class="card overflow-x-auto"><table class="w-full text-xs text-right"><thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-500"><tr><th class="p-2.5">الموظف</th><th class="p-2.5">الأساسي</th><th class="p-2.5">كوميشن</th><th class="p-2.5">مكافآت</th><th class="p-2.5">خصومات</th><th class="p-2.5">سلف</th><th class="p-2.5">غياب</th><th class="p-2.5">الصافي</th></tr></thead><tbody>' +
      rows.map(([p, r]) => '<tr class="border-t border-slate-100 dark:border-slate-800"><td class="p-2.5 font-semibold">' + eh(p.full_name || 'موظف') + '</td><td class="p-2.5 mono">' + formatCurrency(r.base) + '</td><td class="p-2.5 mono">' + (isMgr() ? formatCurrency(r.cm) : '—') + '</td><td class="p-2.5 mono text-emerald-600">' + formatCurrency(r.bonus) + '</td><td class="p-2.5 mono text-rose-600">' + formatCurrency(r.ded) + '</td><td class="p-2.5 mono text-rose-600">' + formatCurrency(r.adv) + '</td><td class="p-2.5 mono text-rose-600">' + formatCurrency(r.absDed) + ' <span class="text-slate-400">(' + r.st.absent + ' يوم)</span></td><td class="p-2.5 mono font-bold text-ink dark:text-white">' + formatCurrency(r.net) + '</td></tr>').join('') + '</tbody></table></div>';
    h += '<div class="flex flex-wrap items-center justify-between gap-2"><div class="text-xs text-slate-500">الغياب = أيام العمل (الجمعة إجازة) بدون حضور أو إجازة معتمدة × (الأساسي ÷ 30). التأخير للعرض فقط.</div>' + (isMgr() ? '<div class="flex items-center gap-2"><b class="mono text-sm text-ink dark:text-white">الإجمالي: ' + formatCurrency(tot) + '</b><button type="button" onclick="hr.csv()" class="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white"><i class="fa-solid fa-file-csv ms-1"></i>تصدير</button></div>' : '') + '</div>';
    if (isMgr() && comm.size === 0) h += '<div class="text-[11px] text-amber-600">ملحوظة: مفيش كوميشن متسجل للشهر ده (أو الشهر قبل بداية البيانات).</div>';
    return h;
  }
  function viewSet() {
    return '<div class="grid gap-3 sm:grid-cols-2">' + people().map(p => { const c = cfg(p.id); return '<form onsubmit="hr.saveCfg(event,\'' + p.id + '\')" class="card space-y-2 p-3"><div class="text-sm font-bold text-ink dark:text-white">' + eh(p.full_name || 'موظف') + '</div><div class="grid grid-cols-2 gap-2 text-[11px] text-slate-500"><label>المرتب الأساسي<input name="b" type="number" min="0" step="any" value="' + (Number(c.base_salary) || 0) + '" class="' + fld + ' mt-1"></label><label>بداية الدوام<input name="s" type="time" value="' + (c.work_start || '09:00').slice(0, 5) + '" class="' + fld + ' mt-1"></label><label>رصيد الإجازة السنوي<input name="a" type="number" min="0" value="' + (c.annual_leave_days == null ? 21 : c.annual_leave_days) + '" class="' + fld + ' mt-1"></label><label>تاريخ التعيين<input name="h" type="date" value="' + (c.hire_date || '') + '" class="' + fld + ' mt-1"></label></div><button class="w-full rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-white">حفظ</button></form>'; }).join('') + '</div>';
  }
  const VIEWS = { att: viewAtt, lv: viewLv, adj: viewAdj, pay: viewPay, set: viewSet };
  function paint() {
    const r = root(); if (!r) return;
    if (setup) { r.innerHTML = '<div class="card p-8 text-center text-sm text-slate-500"><i class="fa-solid fa-database mb-3 block text-2xl text-brand-600"></i>لازم تشغّل ملف <b class="font-mono">phase13-hr.sql</b> مرة واحدة في Supabase SQL Editor، وبعدين حدّث الصفحة.</div>'; return; }
    if (!sub || !tabs().some(t => t[0] === sub)) sub = 'att';
    r.innerHTML = '<div class="flex flex-wrap items-center justify-between gap-2"><h2 class="text-base font-bold text-ink dark:text-white"><i class="fa-solid fa-people-group ms-1.5 text-brand-600"></i>الموارد البشرية</h2><input type="month" value="' + month + '" onchange="hr.month(this.value)" class="field !w-auto !py-2 text-xs"></div><div class="flex flex-wrap gap-1.5">' + tabs().map(t => btn(t, t[0] === sub)).join('') + '</div>' + VIEWS[sub]();
  }
  async function render() { if (busy) return; busy = true; try { await load(); } finally { busy = false; } paint(); badge(); }
  function badge() {
    const b = $('tab-hr-btn'); if (!b || !isMgr()) return;
    const n = leaves.filter(x => x.status === 'pending').length; let s = $('hr-badge');
    if (!s) { b.insertAdjacentHTML('beforeend', '<span id="hr-badge" class="hidden rounded-full bg-amber-500 text-white text-[10px] font-bold px-1.5 min-w-[18px] text-center leading-[18px]"></span>'); s = $('hr-badge'); }
    s.textContent = n; s.classList.toggle('hidden', !n);
  }

  /* ---------- أوامر ---------- */
  const hr = window.hr = {};
  const run = async (p, ok) => { const r = await p; if (r.error) return showError('تعذّر الحفظ', r.error), false; if (ok) showToast(ok); await render(); return true; };
  hr.go = t => { sub = t; paint(); };
  hr.month = v => { if (v) { month = v; render(); } };
  hr.punch = async () => {
    const me = currentUser.id, r = att.find(x => x.user_id === me && x.day === today()), now = new Date().toISOString();
    if (!r) return run(sbClient.from('hr_attendance').insert({ user_id: me, day: today(), check_in: now }), 'تم تسجيل الحضور');
    if (!r.check_out) return run(sbClient.from('hr_attendance').update({ check_out: now }).eq('id', r.id), 'تم تسجيل الانصراف');
  };
  hr.manualAtt = async e => {
    e.preventDefault(); const f = e.target.elements, ts = t => t ? new Date(f.d.value + 'T' + t).toISOString() : null;
    run(sbClient.from('hr_attendance').upsert({ user_id: f.u.value, day: f.d.value, check_in: ts(f.i.value), check_out: ts(f.o.value) }, { onConflict: 'user_id,day' }), 'تم الحفظ');
  };
  hr.delAtt = id => { if (confirm('حذف السجل ده؟')) run(sbClient.from('hr_attendance').delete().eq('id', id)); };
  hr.reqLeave = async e => {
    e.preventDefault(); const f = e.target.elements, mgr = isMgr();
    if (f.t.value < f.f.value) return showToast('تاريخ النهاية قبل البداية', 'error');
    run(sbClient.from('hr_leaves').insert({ user_id: mgr ? f.u.value : currentUser.id, kind: f.k.value, from_day: f.f.value, to_day: f.t.value, reason: f.r.value.trim() || null, status: mgr ? 'approved' : 'pending', decided_by: mgr ? currentUser.id : null }), mgr ? 'تم التسجيل' : 'تم إرسال الطلب للمدير');
  };
  hr.decide = (id, s) => run(sbClient.from('hr_leaves').update({ status: s, decided_by: currentUser.id }).eq('id', id), s === 'approved' ? 'تمت الموافقة' : 'تم الرفض');
  hr.delLv = id => { if (confirm('حذف الإجازة دي؟')) run(sbClient.from('hr_leaves').delete().eq('id', id)); };
  hr.addAdj = e => { e.preventDefault(); const f = e.target.elements; run(sbClient.from('hr_adjustments').insert({ user_id: f.u.value, month, kind: f.k.value, amount: Number(f.a.value), note: f.n.value.trim() || null, created_by: currentUser.id }), 'تمت الإضافة'); };
  hr.delAdj = id => { if (confirm('حذف الحركة دي؟')) run(sbClient.from('hr_adjustments').delete().eq('id', id)); };
  hr.saveCfg = (e, uid) => { e.preventDefault(); const f = e.target.elements; run(sbClient.from('hr_staff').upsert({ user_id: uid, base_salary: Number(f.b.value) || 0, work_start: f.s.value || '09:00', annual_leave_days: Number(f.a.value) || 0, hire_date: f.h.value || null }, { onConflict: 'user_id' }), 'تم الحفظ'); };
  hr.csv = () => {
    const c = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const rows = people().map(p => { const r = payroll(p.id); return [p.full_name, r.base, r.cm, r.bonus, r.ded, r.adv, r.st.absent, r.absDed, r.st.lateMin, r.net]; });
    const txt = '﻿' + [['الموظف', 'الأساسي', 'الكوميشن', 'مكافآت', 'خصومات', 'سلف', 'أيام الغياب', 'خصم الغياب', 'دقائق التأخير', 'الصافي']].concat(rows).map(r => r.map(c).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' })); a.download = 'payroll-' + month + '.csv'; a.click();
  };
  window.renderHr = render;

  /* ---------- ربط التاب ---------- */
  function inject() {
    if ($('tab-hr')) return;
    const nb = $('tab-notes-btn'), nt = $('tab-notes'); if (!nb || !nt) return;
    nb.insertAdjacentHTML('afterend', '<button id="tab-hr-btn" onclick="switchTab(\'hr\')" class="tab-btn"><i class="fa-solid fa-people-group"></i><span>الموارد البشرية</span></button>');
    nt.insertAdjacentHTML('afterend', '<div id="tab-hr" class="hidden space-y-4"></div>');
  }
  const _st = window.switchTab;
  window.switchTab = function (id) {
    const r = _st.apply(this, arguments); const t = $('tab-hr'), b = $('tab-hr-btn'), on = id === 'hr'; if (!t || !b) return r;
    t.classList.toggle('hidden', !on);
    b.className = 'tab-btn ' + (on ? 'bg-ink text-white dark:bg-brand-600 shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800');
    if (on) render(); return r;
  };
  const _li = window.loadInitialData;
  window.loadInitialData = async function () {
    const x = await _li.apply(this, arguments);
    if (window.__role && window.__role !== 'partner') { inject(); if (sbClient && currentUser && isMgr()) sbClient.from('hr_leaves').select('id', { count: 'exact', head: true }).eq('status', 'pending').then(r => { if (!r.error) { const b = $('tab-hr-btn'); if (b) { let s = $('hr-badge'); if (!s) { b.insertAdjacentHTML('beforeend', '<span id="hr-badge" class="hidden rounded-full bg-amber-500 text-white text-[10px] font-bold px-1.5 min-w-[18px] text-center leading-[18px]"></span>'); s = $('hr-badge'); } s.textContent = r.count || 0; s.classList.toggle('hidden', !r.count); } } }); }
    return x;
  };
  const _lo = window.handleLogout;
  window.handleLogout = async function () { staff = []; att = []; leaves = []; adj = []; sub = null; return _lo.apply(this, arguments); };
})();
