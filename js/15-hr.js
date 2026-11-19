/* ===== الموارد البشرية + الشيفتات (نسخة موحّدة ومصلّحة) — بديل js/15-hr.js ===== */
(function () {
  if (window.__phase13) return; window.__phase13 = true;
  const eh = escapeHtml, GRACE = 10, EARLY_GRACE = 5, PAID_LEAVE = ['annual', 'sick', 'mission'];
  const EARLY_PUNCH = 120, LATE_ALERT = 3; /* أقصى تبكير للبصمة (دقيقة) / عدد أيام التأخير في الأسبوع اللي بيطلّع تنبيه */
  const FROM_TS = (typeof DATA_FROM_TS === 'string') ? DATA_FROM_TS : '1970-01-01T00:00:00';
  const isMgr = () => window.__role ? window.__role === 'manager' : !!(currentUser && ['mahmoud.aboshama@tasahel.com.eg', 'mahmoud.aboshama.contact@gmail.com'].includes(String(currentUser.email || '').toLowerCase()));
  const missing = err => /42P01|PGRST205|does not exist|schema cache/i.test(((err && err.message) || '') + ' ' + ((err && err.code) || ''));
  const P2 = n => String(n).padStart(2, '0');
  const ymd = d => d.getFullYear() + '-' + P2(d.getMonth() + 1) + '-' + P2(d.getDate());
  const today = () => ymd(new Date());
  const addDays = (s, n) => { const d = new Date(s + 'T00:00'); d.setDate(d.getDate() + n); return ymd(d); };
  const weekStart = s => { const d = new Date(s + 'T00:00'); d.setDate(d.getDate() - d.getDay()); return ymd(d); }; /* الأسبوع بيبدأ الأحد */
  const nextM = m => { const a = m.split('-').map(Number); return a[1] === 12 ? (a[0] + 1) + '-01' : a[0] + '-' + P2(a[1] + 1); };
  const mLabel = m => new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric' }).format(new Date(m + '-01T00:00'));
  const tm = s => s ? new Date(s).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '—';
  const dl = s => new Intl.DateTimeFormat('ar-EG', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(s + 'T00:00'));
  const mins = t => { const a = String(t || '09:00').split(':').map(Number); return a[0] * 60 + (a[1] || 0); };
  const hhmm = m => P2(Math.floor(m / 60) % 24) + ':' + P2(m % 60);
  const LK = { annual: 'اعتيادية', sick: 'مرضية', unpaid: 'بدون مرتب', permission: 'إذن ساعات', mission: 'مأمورية عمل' };
  const AK = { advance: 'سلفة', deduction: 'خصم', bonus: 'مكافأة' };
  const SK = { pending: 'قيد المراجعة', approved: 'موافق عليها', rejected: 'مرفوضة' };
  const nameOf = id => { const p = profiles.find(x => x.id === id); return p ? (p.full_name || 'موظف') : 'موظف'; };
  const fld = 'field !py-2 text-xs';

  let month = new Date().toLocaleDateString('en-CA').slice(0, 7), sub = null, curWeek = weekStart(today());
  let staff = [], att = [], leaves = [], adj = [], shiftMap = new Map(), comm = new Map();
  let setup = false, shiftsOK = true, busy = false, lock = null, snaps = new Map(), locksOK = true;
  const root = () => $('tab-hr');

  /* ---------- إشعار للمدير (best-effort: لو شكل جدول notifications مختلف مش هيوقف أي حاجة) ---------- */
  async function notifyManager(title, message) {
    try {
      const r = await sbClient.from('notifications').insert({ title: title, message: message, type: 'hr_leave' });
      if (r.error) console.warn('notify', r.error.message);
    } catch (e) { console.warn('notify', e); }
  }

  /* ---------- تحميل ---------- */
  async function fetchComm(m) {
    const out = new Map(), cl = await sbClient.from('month_closures').select('month').eq('month', m);
    if (!cl.error && (cl.data || []).length) {
      const s = await sbClient.from('month_snapshots').select('user_id,commission').eq('month', m);
      (s.data || []).forEach(r => out.set(r.user_id, Number(r.commission) || 0)); return out;
    }
    const a0 = m + '-01T00:00:00', a = a0 > FROM_TS ? a0 : FROM_TS, b = nextM(m) + '-01T00:00:00';
    if (b <= FROM_TS) return out;
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
    const s0 = [addDays(a, -14), addDays(curWeek, -7)].sort()[0], s1 = [b, addDays(curWeek, 14)].sort().reverse()[0];
    const [s, t, l, j, sh, lk, sn] = await Promise.all([
      sbClient.from('hr_staff').select('*'),
      sbClient.from('hr_attendance').select('*').gte('day', a).lt('day', b).order('day'),
      sbClient.from('hr_leaves').select('*').gte('to_day', y0).lt('from_day', y1).order('created_at', { ascending: false }).limit(600),
      sbClient.from('hr_adjustments').select('*').eq('month', month).order('created_at', { ascending: false }),
      sbClient.from('hr_shifts').select('*').gte('week_start', s0).lt('week_start', s1),
      sbClient.from('hr_month_locks').select('*').eq('month', month).maybeSingle(),
      sbClient.from('hr_payroll_snapshots').select('*').eq('month', month)
    ]);
    const bad = [s, t, l, j].find(x => x.error);
    if (bad) { setup = missing(bad.error); if (!setup) showError('تعذّر تحميل الموارد البشرية', bad.error); return false; }
    setup = false; staff = s.data || []; att = t.data || []; leaves = l.data || []; adj = j.data || [];
    shiftsOK = !sh.error;
    if (sh.error && !missing(sh.error)) showError('تعذّر تحميل الشيفتات', sh.error);
    shiftMap = new Map((sh.data || []).map(x => [x.user_id + '|' + x.week_start, x]));
    locksOK = !lk.error && !sn.error;
    if ((lk.error && !missing(lk.error)) || (sn.error && !missing(sn.error))) showError('تعذّر تحميل حالة قفل الشهر', lk.error || sn.error);
    lock = locksOK ? lk.data : null;
    snaps = new Map(locksOK && lock ? (sn.data || []).map(x => [x.user_id, x.data]) : []);
    comm = isMgr() ? await fetchComm(month).catch(() => new Map()) : new Map();
    return true;
  }
  const cfg = uid => staff.find(x => x.user_id === uid) || { user_id: uid, base_salary: 0, work_start: '09:00', annual_leave_days: 21, hire_date: null };
  const people = () => isMgr() ? profiles.filter(p => p.id) : profiles.filter(p => p.id === currentUser.id);

  /* الشيفت الفعلي ليوم معيّن: شيفت الأسبوع لو متحدد، وإلا بداية الدوام الافتراضية + 8 ساعات */
  function shiftFor(uid, day) {
    const sh = shiftMap.get(uid + '|' + weekStart(day));
    if (sh) return { start: String(sh.start_time).slice(0, 5), end: String(sh.end_time).slice(0, 5), custom: true };
    const st = String(cfg(uid).work_start || '09:00').slice(0, 5);
    return { start: st, end: hhmm(mins(st) + 480), custom: false };
  }

  /* ---------- حسابات ---------- */
  function leaveDays(uid, kinds) {
    const set = new Set(), a = month + '-01', b = nextM(month) + '-01';
    leaves.filter(x => x.user_id === uid && x.status === 'approved' && x.kind !== 'permission' && kinds.includes(x.kind)).forEach(x => {
      for (let d = new Date(x.from_day + 'T00:00'), e = new Date(x.to_day + 'T00:00'); d <= e; d.setDate(d.getDate() + 1)) { const k = ymd(d); if (k >= a && k < b) set.add(k); }
    });
    return set;
  }
  function stats(uid) {
    const z = { present: 0, absent: 0, lateMin: 0, lateDays: 0, earlyMin: 0, hours: 0, paidLeave: 0 };
    if (month > today().slice(0, 7)) return z;
    const c = cfg(uid), by = new Map(att.filter(r => r.user_id === uid).map(r => [r.day, r]));
    const last = month === today().slice(0, 7) ? today() : addDays(nextM(month) + '-01', -1), paid = leaveDays(uid, PAID_LEAVE);
    z.paidLeave = paid.size;
    for (let d = new Date(month + '-01T00:00'); ymd(d) <= last; d.setDate(d.getDate() + 1)) {
      const k = ymd(d); if (d.getDay() === 5) continue; if (c.hire_date && k < c.hire_date) continue;
      const r = by.get(k), sh = shiftFor(uid, k);
      if (r && r.check_in) {
        z.present++;
        const ci = new Date(r.check_in), m = ci.getHours() * 60 + ci.getMinutes() - mins(sh.start);
        if (m > GRACE) { z.lateMin += m; z.lateDays++; }
        if (r.check_out) {
          const co = new Date(r.check_out), em = mins(sh.end) - (co.getHours() * 60 + co.getMinutes());
          if (em > EARLY_GRACE) z.earlyMin += em;
          z.hours += (co - ci) / 36e5;
        }
      } else if (!paid.has(k) && k !== today()) z.absent++;
    }
    return z;
  }
  function payroll(uid) {
    if (lock && snaps.has(uid)) { const r = snaps.get(uid); return { base: r.base, cm: r.cm, bonus: r.bonus, ded: r.ded, adv: r.adv, absDed: r.absDed, st: { absent: r.absent, lateMin: r.lateMin, earlyMin: r.earlyMin }, net: r.net, frozen: true }; }
    return livePayroll(uid);
  }
  function livePayroll(uid) {
    const c = cfg(uid), st = stats(uid), base = Number(c.base_salary) || 0, cm = comm.get(uid) || 0;
    const sum = k => adj.filter(x => x.user_id === uid && x.kind === k).reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const absDed = Math.round(st.absent * base / 30), bonus = sum('bonus'), ded = sum('deduction'), adv = sum('advance');
    return { base, cm, bonus, ded, adv, absDed, st, net: base + cm + bonus - ded - adv - absDed };
  }
  /* عدد أيام التأخير في أسبوع معيّن (الأحد → السبت) */
  function weekLate(uid, ws) {
    let n = 0;
    for (let i = 0; i < 7; i++) {
      const k = addDays(ws, i); if (new Date(k + 'T00:00').getDay() === 5) continue;
      const r = att.find(x => x.user_id === uid && x.day === k);
      if (r && r.check_in) { const ci = new Date(r.check_in); if (ci.getHours() * 60 + ci.getMinutes() - mins(shiftFor(uid, k).start) > GRACE) n++; }
    }
    return n;
  }
  function balance(uid) {
    const y = month.slice(0, 4), used = leaves.filter(x => x.user_id === uid && x.status === 'approved' && x.kind === 'annual' && x.from_day.slice(0, 4) === y)
      .reduce((s, x) => s + Math.round((new Date(x.to_day) - new Date(x.from_day)) / 864e5) + 1, 0);
    return { total: Number(cfg(uid).annual_leave_days) || 21, used };
  }

  /* ---------- واجهة ---------- */
  const tabs = () => isMgr()
    ? [['dash', 'الرئيسية'], ['wf', 'جدول الشيفتات'], ['att', 'الحضور'], ['lv', 'الإجازات والمأموريات'], ['adj', 'سلف وخصومات ومكافآت'], ['pay', 'كشف المرتبات'], ['set', 'إعدادات الموظفين']]
    : [['dash', 'الرئيسية'], ['att', 'حضوري'], ['lv', 'إجازاتي ومأمورياتي'], ['pay', 'كشفي']];
  const btn = (t, on) => `<button type="button" onclick="hr.go('${t[0]}')" class="rounded-xl px-3 py-2 text-xs font-semibold transition ${on ? 'bg-ink text-white dark:bg-brand-600' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}">${t[1]}</button>`;
  const tile = (l, v, c) => `<div class="card p-3"><div class="text-[11px] text-slate-500">${l}</div><div class="mt-1 text-base font-bold mono ${c || 'text-ink dark:text-white'}">${v}</div></div>`;
  const empty = t => `<div class="card p-6 text-center text-xs text-slate-400">${t}</div>`;
  const opts = sel => people().map(p => `<option value="${p.id}"${p.id === sel ? ' selected' : ''}>${eh(p.full_name || 'موظف')}</option>`).join('');

  function punchCard() {
    const me = currentUser.id, r = att.find(x => x.user_id === me && x.day === today());
    const label = !r ? 'تسجيل حضور' : (!r.check_out ? 'تسجيل انصراف' : 'تم الانصراف'), dis = r && r.check_out, sh = shiftFor(me, today());
    return `<div class="card flex flex-wrap items-center justify-between gap-3 p-4"><div><div class="text-sm font-bold text-ink dark:text-white">النهارده ${dl(today())} · شيفتك ${sh.start} ← ${sh.end}</div><div class="mt-1 text-xs text-slate-500">حضور: <b>${tm(r && r.check_in)}</b> — انصراف: <b>${tm(r && r.check_out)}</b></div></div>` +
      `<button type="button" onclick="hr.punch()" ${dis ? 'disabled' : ''} class="rounded-xl px-4 py-2.5 text-sm font-bold text-white ${dis ? 'bg-slate-400' : (!r ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700')}"><i class="fa-solid fa-fingerprint ms-1.5"></i>${label}</button></div>`;
  }
  function viewDash() {
    const st = stats(currentUser.id);
    let h = punchCard() + `<div class="grid gap-3 grid-cols-2 lg:grid-cols-4">${tile('أيام حضوري', st.present)}${tile('أيام غيابي', st.absent, st.absent ? 'text-rose-600' : '')}${tile('دقائق التأخير', Math.round(st.lateMin), st.lateMin ? 'text-rose-600' : '')}${tile('انصراف مبكر (دقيقة)', Math.round(st.earlyMin), st.earlyMin ? 'text-amber-600' : '')}</div>`;
    if (isMgr()) {
      const k = today(), pend = leaves.filter(x => x.status === 'pending').length;
      if (month === k.slice(0, 7)) {
        const ws = weekStart(k), al = people().map(p => [p, weekLate(p.id, ws)]).filter(x => x[1] >= LATE_ALERT);
        if (al.length) h += `<div class="card border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs space-y-1"><div class="font-bold text-amber-800 dark:text-amber-300"><i class="fa-solid fa-triangle-exclamation ms-1"></i>تنبيه: تأخير متكرر هذا الأسبوع</div>` + al.map(([p, n]) => `<div class="text-amber-900 dark:text-amber-200">${eh(p.full_name || 'موظف')} — اتأخر <b>${n}</b> أيام</div>`).join('') + '</div>';
      }
      h += `<div class="card overflow-x-auto"><div class="p-3 text-xs font-bold text-ink dark:text-white">الفريق النهارده${pend ? ` <span class="rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 ms-2">${pend} طلب ينتظر موافقتك</span>` : ''}</div><table class="w-full text-xs text-right"><thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-500"><tr><th class="p-2.5">الموظف</th><th class="p-2.5">الشيفت</th><th class="p-2.5">الحضور</th><th class="p-2.5">الحالة</th></tr></thead><tbody>` +
        people().map(p => {
          const r = att.find(x => x.user_id === p.id && x.day === k), sh = shiftFor(p.id, k);
          const onLv = leaves.some(x => x.user_id === p.id && x.status === 'approved' && x.from_day <= k && x.to_day >= k && x.kind !== 'permission');
          let s = '<span class="text-slate-400">لم يسجل</span>';
          if (r && r.check_in) { const late = (new Date(r.check_in).getHours() * 60 + new Date(r.check_in).getMinutes()) - mins(sh.start) > GRACE; s = r.check_out ? '<span class="text-slate-500">انصرف</span>' : (late ? '<span class="text-rose-600 font-bold">حاضر (متأخر)</span>' : '<span class="text-emerald-600 font-bold">حاضر</span>'); }
          else if (onLv) s = '<span class="text-indigo-600">إجازة / مأمورية</span>';
          return `<tr class="border-t border-slate-100 dark:border-slate-800"><td class="p-2.5 font-semibold">${eh(p.full_name || 'موظف')}</td><td class="p-2.5 mono">${sh.start} ← ${sh.end}</td><td class="p-2.5 mono">${tm(r && r.check_in)}</td><td class="p-2.5">${s}</td></tr>`;
        }).join('') + '</tbody></table></div>';
    }
    return h;
  }
  function viewWF() {
    if (!isMgr()) return empty('هذه الشاشة مخصصة للمدير.');
    if (!shiftsOK) return `<div class="card p-8 text-center text-sm text-slate-500"><i class="fa-solid fa-database mb-3 block text-2xl text-brand-600"></i>لازم تشغّل ملف <b class="font-mono">phase14-shifts.sql</b> مرة واحدة في Supabase.</div>`;
    return `<div class="card p-4 space-y-4"><div class="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
      <div><div class="text-sm font-bold text-ink dark:text-white">جدول الشيفتات الأسبوعي</div><div class="text-xs text-slate-500 mt-0.5">من ${dl(curWeek)} إلى ${dl(addDays(curWeek, 6))} (الجمعة إجازة). الأسبوع اللي مفيهوش شيفت بيستخدم بداية الدوام الافتراضية.</div></div>
      <div class="flex flex-wrap items-center gap-2">
        <button type="button" onclick="hr.setWeek('${addDays(curWeek, -7)}')" class="rounded-xl bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs font-bold">→ السابق</button>
        <input type="date" value="${curWeek}" onchange="hr.setWeek(this.value)" class="${fld} !w-auto">
        <button type="button" onclick="hr.setWeek('${addDays(curWeek, 7)}')" class="rounded-xl bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs font-bold">التالي ←</button>
        <button type="button" onclick="hr.copyPrev()" class="rounded-xl bg-indigo-600 hover:bg-indigo-700 px-3 py-2 text-xs font-bold text-white"><i class="fa-solid fa-copy ms-1"></i>انسخ الأسبوع السابق</button>
      </div></div>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">` +
      people().map(p => {
        const sh = shiftFor(p.id, curWeek);
        return `<form onsubmit="hr.saveShift(event,'${p.id}')" class="card p-3 space-y-2 border border-slate-200 dark:border-slate-800"><div class="flex items-center justify-between"><span class="font-bold text-xs text-ink dark:text-white">${eh(p.full_name || 'موظف')}</span>${sh.custom ? '<span class="text-[10px] text-emerald-600">محدد</span>' : '<span class="text-[10px] text-slate-400">افتراضي</span>'}</div>
          <div class="grid grid-cols-2 gap-2 text-xs"><label class="text-slate-500">الحضور<input type="time" name="s" required value="${sh.start}" class="${fld} mt-1"></label><label class="text-slate-500">الانصراف<input type="time" name="e" required value="${sh.end}" class="${fld} mt-1"></label></div>
          <button class="w-full rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold py-1.5">حفظ الشيفت</button></form>`;
      }).join('') + '</div></div>';
  }
  function viewAtt() {
    const st = people().map(p => [p, stats(p.id)]);
    let h = punchCard();
    h += '<div class="card overflow-x-auto"><table class="w-full text-xs text-right"><thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-500"><tr><th class="p-2.5">الموظف</th><th class="p-2.5">أيام الحضور</th><th class="p-2.5">غياب</th><th class="p-2.5">أيام تأخير</th><th class="p-2.5">دقائق التأخير</th><th class="p-2.5">انصراف مبكر</th><th class="p-2.5">ساعات العمل</th></tr></thead><tbody>' +
      st.map(([p, s]) => `<tr class="border-t border-slate-100 dark:border-slate-800"><td class="p-2.5 font-semibold">${eh(p.full_name || 'موظف')}</td><td class="p-2.5 mono">${s.present}</td><td class="p-2.5 mono ${s.absent ? 'text-rose-600 font-bold' : ''}">${s.absent}</td><td class="p-2.5 mono">${s.lateDays}</td><td class="p-2.5 mono">${Math.round(s.lateMin)}</td><td class="p-2.5 mono text-amber-600">${Math.round(s.earlyMin)}</td><td class="p-2.5 mono">${s.hours.toFixed(1)}</td></tr>`).join('') + '</tbody></table></div>';
    const rows = att.filter(r => isMgr() || r.user_id === currentUser.id).slice().sort((a, b) => b.day.localeCompare(a.day));
    h += `<div class="card p-3 space-y-2"><div class="text-xs font-bold text-ink dark:text-white">سجل الحضور - ${mLabel(month)}</div>` + (rows.length ? '<div class="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">' + rows.map(r => `<div class="flex items-center justify-between gap-2 py-1.5 text-xs"><span class="font-semibold">${dl(r.day)}${isMgr() ? ' - ' + eh(nameOf(r.user_id)) : ''}</span><span class="mono text-slate-500">${tm(r.check_in)} ← ${tm(r.check_out)}</span>${isMgr() ? `<button type="button" onclick="hr.delAtt('${r.id}')" class="text-slate-400 hover:text-rose-600"><i class="fa-solid fa-trash-can"></i></button>` : ''}</div>`).join('') + '</div>' : '<div class="text-xs text-slate-400">لا يوجد سجل.</div>') + '</div>';
    if (isMgr()) h += `<form onsubmit="hr.manualAtt(event)" class="card grid gap-2 p-3 sm:grid-cols-5"><div class="sm:col-span-5 text-xs font-bold text-ink dark:text-white">إضافة / تعديل حضور يدوي</div><select name="u" class="${fld}">${opts()}</select><input name="d" type="date" required value="${today()}" class="${fld}"><input name="i" type="time" required value="09:00" class="${fld}"><input name="o" type="time" class="${fld}"><button class="rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-white">حفظ</button></form>`;
    return h;
  }
  function viewLv() {
    const me = currentUser.id, mgr = isMgr(), list = leaves.filter(x => mgr || x.user_id === me), b = balance(me);
    let h = '';
    if (!mgr) h += `<div class="grid grid-cols-3 gap-2">${tile('رصيد الاعتيادي', b.total)}${tile('المستخدم', b.used)}${tile('المتبقي', b.total - b.used, 'text-emerald-600')}</div>`;
    h += `<form onsubmit="hr.reqLeave(event)" class="card grid gap-2 p-3 sm:grid-cols-6"><div class="sm:col-span-6 text-xs font-bold text-ink dark:text-white">${mgr ? 'تسجيل إجازة / مأمورية لموظف' : 'طلب إجازة / إذن / مأمورية'}</div>` +
      (mgr ? `<select name="u" class="${fld}">${opts()}</select>` : '') +
      `<select name="k" onchange="hr.kindChange(this)" class="${fld}">${Object.keys(LK).map(k => `<option value="${k}">${LK[k]}</option>`).join('')}</select>` +
      `<input name="f" type="date" required value="${today()}" class="${fld}"><input name="t" type="date" required value="${today()}" class="${fld}"><input name="r" placeholder="السبب" class="${fld}">` +
      `<div id="mission-fields" class="sm:col-span-6 grid-cols-2 gap-2" style="display:none"><input name="dst" placeholder="جهة المأمورية (شركة / جهة حكومية)" class="${fld}"><input name="det" placeholder="الهدف من المأمورية" class="${fld}"></div>` +
      `<button class="rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-white">${mgr ? 'تسجيل (معتمدة)' : 'إرسال الطلب'}</button></form>`;
    h += '<div class="space-y-2">' + (list.length ? list.map(x => {
      const st = x.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : x.status === 'rejected' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700';
      const canDel = mgr || (x.user_id === me && x.status === 'pending');
      return `<div class="card p-3 text-xs space-y-1.5"><div class="flex flex-wrap items-center justify-between gap-2"><div><div class="font-bold text-ink dark:text-white">${mgr ? eh(nameOf(x.user_id)) + ' - ' : ''}${LK[x.kind] || x.kind}</div><div class="text-slate-500">${dl(x.from_day)}${x.to_day !== x.from_day ? ' ← ' + dl(x.to_day) : ''}${x.reason ? ' · ' + eh(x.reason) : ''}</div></div>
        <div class="flex flex-wrap items-center gap-2"><span class="rounded-full px-2 py-0.5 font-semibold ${st}">${SK[x.status] || x.status}</span>
        ${x.kind === 'mission' ? `<button type="button" onclick="hr.genEmail('${x.id}')" class="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 font-bold"><i class="fa-solid fa-envelope ms-1"></i>نسخ الإيميل</button>` : ''}
        ${mgr && x.status === 'pending' ? `<button type="button" onclick="hr.decide('${x.id}','approved')" class="rounded-lg bg-emerald-600 px-2.5 py-1 font-bold text-white">موافقة</button><button type="button" onclick="hr.decide('${x.id}','rejected')" class="rounded-lg bg-rose-600 px-2.5 py-1 font-bold text-white">رفض</button>` : ''}
        ${canDel ? `<button type="button" onclick="hr.delLv('${x.id}')" class="text-slate-400 hover:text-rose-600"><i class="fa-solid fa-trash-can"></i></button>` : ''}</div></div>
        ${x.destination || x.mission_details ? `<div class="text-[11px] text-slate-500">الجهة: <b>${eh(x.destination || '—')}</b> · الهدف: ${eh(x.mission_details || x.reason || '—')}</div>` : ''}</div>`;
    }).join('') : empty('لا توجد طلبات.')) + '</div>';
    return h;
  }
  function viewAdj() {
    if (!isMgr()) return empty('هذه الصفحة مخصصة للمدير.');
    let h = `<form onsubmit="hr.addAdj(event)" class="card grid gap-2 p-3 sm:grid-cols-5"><div class="sm:col-span-5 text-xs font-bold text-ink dark:text-white">حركة مالية على موظف - ${mLabel(month)}</div><select name="u" class="${fld}">${opts()}</select><select name="k" class="${fld}"><option value="advance">سلفة</option><option value="deduction">خصم</option><option value="bonus">مكافأة</option></select><input name="a" type="number" min="1" step="any" required placeholder="المبلغ" class="${fld}"><input name="n" placeholder="ملاحظة" class="${fld}"><button class="rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-white">إضافة</button></form>`;
    h += '<div class="space-y-2">' + (adj.length ? adj.map(x => `<div class="card flex items-center justify-between gap-2 p-3 text-xs"><div><b class="text-ink dark:text-white">${eh(nameOf(x.user_id))}</b> · ${AK[x.kind]}${x.note ? ' · ' + eh(x.note) : ''}</div><div class="flex items-center gap-2"><b class="mono ${x.kind === 'bonus' ? 'text-emerald-600' : 'text-rose-600'}">${x.kind === 'bonus' ? '+' : '-'}${formatCurrency(x.amount)}</b><button type="button" onclick="hr.delAdj('${x.id}')" class="text-slate-400 hover:text-rose-600"><i class="fa-solid fa-trash-can"></i></button></div></div>`).join('') : empty('لا توجد حركات في الشهر ده.')) + '</div>';
    return h;
  }
  function viewPay() {
    const rows = people().map(p => [p, payroll(p.id)]), tot = rows.reduce((s, [, r]) => s + r.net, 0);
    let h = '<div class="card overflow-x-auto"><table class="w-full text-xs text-right"><thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-500"><tr><th class="p-2.5">الموظف</th><th class="p-2.5">الأساسي</th><th class="p-2.5">كوميشن</th><th class="p-2.5">مكافآت</th><th class="p-2.5">خصومات</th><th class="p-2.5">سلف</th><th class="p-2.5">غياب</th><th class="p-2.5">الصافي</th></tr></thead><tbody>' +
      rows.map(([p, r]) => `<tr class="border-t border-slate-100 dark:border-slate-800"><td class="p-2.5 font-semibold">${eh(p.full_name || 'موظف')}</td><td class="p-2.5 mono">${formatCurrency(r.base)}</td><td class="p-2.5 mono">${isMgr() ? formatCurrency(r.cm) : '—'}</td><td class="p-2.5 mono text-emerald-600">${formatCurrency(r.bonus)}</td><td class="p-2.5 mono text-rose-600">${formatCurrency(r.ded)}</td><td class="p-2.5 mono text-rose-600">${formatCurrency(r.adv)}</td><td class="p-2.5 mono text-rose-600">${formatCurrency(r.absDed)} <span class="text-slate-400">(${r.st.absent} يوم)</span></td><td class="p-2.5 mono font-bold text-ink dark:text-white">${formatCurrency(r.net)}</td></tr>`).join('') + '</tbody></table></div>';
    h += `<div class="flex flex-wrap items-center justify-between gap-2"><div class="text-xs text-slate-500">الغياب = أيام العمل (الجمعة إجازة) بدون حضور أو إجازة/مأمورية معتمدة × (الأساسي ÷ 30). التأخير والانصراف المبكر للعرض فقط.</div>${isMgr() ? `<div class="flex items-center gap-2"><b class="mono text-sm text-ink dark:text-white">الإجمالي: ${formatCurrency(tot)}</b><button type="button" onclick="hr.csv()" class="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white"><i class="fa-solid fa-file-csv ms-1"></i>تصدير</button></div>` : ''}</div>`;
    if (lock) h += `<div class="card flex flex-wrap items-center justify-between gap-2 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 p-3 text-xs"><span class="font-bold text-emerald-800 dark:text-emerald-300"><i class="fa-solid fa-lock ms-1"></i>الشهر مقفول ومجمّد (${eh(new Date(lock.locked_at).toLocaleDateString('ar-EG'))}) — الأرقام دي نهائية</span>${isMgr() ? '<button type="button" onclick="hr.unlockMonth()" class="rounded-lg bg-white dark:bg-slate-800 border border-slate-300 px-3 py-1 font-bold text-rose-600">فتح الشهر</button>' : ''}</div>`;
    else if (isMgr() && locksOK) h += `<div class="flex justify-end"><button type="button" onclick="hr.lockMonth()" class="rounded-xl bg-ink dark:bg-brand-600 px-4 py-2 text-xs font-bold text-white"><i class="fa-solid fa-lock ms-1"></i>قفل الشهر وتجميد الرواتب</button></div>`;
    else if (isMgr() && !locksOK) h += '<div class="text-[11px] text-slate-400">قفل الشهر محتاج تشغيل phase15-hr-security.sql.</div>';
    if (isMgr() && !lock && comm.size === 0) h += '<div class="text-[11px] text-amber-600">ملحوظة: مفيش كوميشن متسجل للشهر ده (أو الشهر قبل بداية البيانات).</div>';
    return h;
  }
  function viewSet() {
    if (!isMgr()) return empty('هذه الشاشة مخصصة للمدير.');
    return '<div class="grid gap-3 sm:grid-cols-2">' + people().map(p => { const c = cfg(p.id); return `<form onsubmit="hr.saveCfg(event,'${p.id}')" class="card space-y-2 p-3"><div class="text-sm font-bold text-ink dark:text-white">${eh(p.full_name || 'موظف')}</div><div class="grid grid-cols-2 gap-2 text-[11px] text-slate-500"><label>المرتب الأساسي<input name="b" type="number" min="0" step="any" value="${Number(c.base_salary) || 0}" class="${fld} mt-1"></label><label>بداية الدوام الافتراضية<input name="s" type="time" value="${String(c.work_start || '09:00').slice(0, 5)}" class="${fld} mt-1"></label><label>رصيد الإجازة السنوي<input name="a" type="number" min="0" value="${c.annual_leave_days == null ? 21 : c.annual_leave_days}" class="${fld} mt-1"></label><label>تاريخ التعيين<input name="h" type="date" value="${c.hire_date || ''}" class="${fld} mt-1"></label></div><button class="w-full rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-white">حفظ</button></form>`; }).join('') + '</div>';
  }
  const VIEWS = { dash: viewDash, wf: viewWF, att: viewAtt, lv: viewLv, adj: viewAdj, pay: viewPay, set: viewSet };
  function paint() {
    const r = root(); if (!r) return;
    if (setup) { r.innerHTML = '<div class="card p-8 text-center text-sm text-slate-500"><i class="fa-solid fa-database mb-3 block text-2xl text-brand-600"></i>لازم تشغّل ملف <b class="font-mono">phase13-hr.sql</b> مرة واحدة في Supabase SQL Editor، وبعدين حدّث الصفحة.</div>'; return; }
    if (!sub || !tabs().some(t => t[0] === sub)) sub = 'dash';
    r.innerHTML = `<div class="flex flex-wrap items-center justify-between gap-2"><h2 class="text-base font-bold text-ink dark:text-white"><i class="fa-solid fa-people-group ms-1.5 text-brand-600"></i>الموارد البشرية</h2><input type="month" value="${month}" onchange="hr.month(this.value)" class="field !w-auto !py-2 text-xs"></div><div class="flex flex-wrap gap-1.5">${tabs().map(t => btn(t, t[0] === sub)).join('')}</div>` + VIEWS[sub]();
  }
  async function render() { if (busy) return; busy = true; try { await load(); } catch (e) { showError('خطأ في الموارد البشرية', e); } finally { busy = false; } paint(); badge(); }
  function badge() {
    const b = $('tab-hr-btn'); if (!b || !isMgr()) return;
    const n = leaves.filter(x => x.status === 'pending').length; let s = $('hr-badge');
    if (!s) { b.insertAdjacentHTML('beforeend', '<span id="hr-badge" class="hidden rounded-full bg-amber-500 text-white text-[10px] font-bold px-1.5 min-w-[18px] text-center leading-[18px]"></span>'); s = $('hr-badge'); }
    s.textContent = n; s.classList.toggle('hidden', !n);
  }

  /* ---------- أوامر ---------- */
  const hr = window.hr = {};
  const run = async (p, ok) => { const r = await p; if (r.error) { showError('تعذّر الحفظ', r.error); return false; } if (ok) showToast(ok); await render(); return true; };
  hr.go = t => { sub = t; paint(); };
  hr.month = v => { if (v) { month = v; render(); } };
  hr.setWeek = v => { if (v) { curWeek = weekStart(v); render(); } };
  hr.kindChange = el => { const m = $('mission-fields'); if (m) m.style.display = el.value === 'mission' ? 'grid' : 'none'; };
  const lockedMsg = () => { if (lock) { showToast('الشهر ده مقفول — افتحه الأول لو عايز تعدّل', 'error'); return true; } return false; };
  hr.punch = async () => {
    const cur = today().slice(0, 7);
    if (month !== cur) { month = cur; await render(); }
    if (lockedMsg()) return;
    const me = currentUser.id, r = att.find(x => x.user_id === me && x.day === today()), d = new Date();
    if (!r) {
      const sh = shiftFor(me, today()), from = Math.max(0, mins(sh.start) - EARLY_PUNCH);
      if (d.getHours() * 60 + d.getMinutes() < from) return showToast('بدري على البصمة — تقدر تسجّل حضور من الساعة ' + hhmm(from), 'error', 6000);
      const ok = await run(sbClient.from('hr_attendance').insert({ user_id: me, day: today() }), 'تم تسجيل الحضور');
      if (ok && weekLate(me, weekStart(today())) === LATE_ALERT) notifyManager('تأخير متكرر', nameOf(me) + ' اتأخر ' + LATE_ALERT + ' أيام هذا الأسبوع');
      return;
    }
    if (!r.check_out) return run(sbClient.from('hr_attendance').update({ check_out: d.toISOString() }).eq('id', r.id), 'تم تسجيل الانصراف'); // الوقت الفعلي يحدده trigger السيرفر (p0-security.sql)
  };
  hr.lockMonth = async () => {
    if (!locksOK || lock) return;
    if (!confirm('هيتجمّد كشف مرتبات ' + mLabel(month) + ' ومحدش هيقدر يعدّل الحضور أو السلف والخصومات فيه لحد ما تفتح الشهر. متأكد؟')) return;
    const rows = people().map(p => { const r = livePayroll(p.id); return { month, user_id: p.id, data: { base: r.base, cm: r.cm, bonus: r.bonus, ded: r.ded, adv: r.adv, absDed: r.absDed, absent: r.st.absent, lateMin: r.st.lateMin, earlyMin: r.st.earlyMin, net: r.net } }; });
    // تجميد الكشف + قفل الشهر في عملية واحدة على السيرفر (كله أو مفيش)
    run(sbClient.rpc('hr_lock_month', { p_month: month, p_rows: rows.map(r => ({ user_id: r.user_id, data: r.data })) }), 'تم قفل الشهر وتجميد الرواتب');
  };
  hr.unlockMonth = async () => {
    if (!lock || !confirm('فتح الشهر هيخلّي الكشف يتحسب من جديد. متأكد؟')) return;
    run(sbClient.rpc('hr_unlock_month', { p_month: month }), 'تم فتح الشهر');
  };
  hr.manualAtt = e => {
    e.preventDefault(); if (lockedMsg()) return; const f = e.target.elements, ts = t => t ? new Date(f.d.value + 'T' + t).toISOString() : null;
    run(sbClient.from('hr_attendance').upsert({ user_id: f.u.value, day: f.d.value, check_in: ts(f.i.value), check_out: ts(f.o.value) }, { onConflict: 'user_id,day' }), 'تم الحفظ');
  };
  hr.delAtt = id => { if (lockedMsg()) return; if (confirm('حذف السجل ده؟')) run(sbClient.from('hr_attendance').delete().eq('id', id)); };
  hr.saveShift = (e, uid) => {
    e.preventDefault(); const f = e.target.elements;
    if (mins(f.e.value) <= mins(f.s.value)) return showToast('الانصراف لازم يكون بعد الحضور', 'error');
    run(sbClient.from('hr_shifts').upsert({ user_id: uid, week_start: curWeek, start_time: f.s.value, end_time: f.e.value }, { onConflict: 'user_id,week_start' }), 'تم حفظ الشيفت');
  };
  hr.copyPrev = () => {
    const pw = addDays(curWeek, -7), rows = people().map(p => shiftMap.get(p.id + '|' + pw)).filter(Boolean).map(s => ({ user_id: s.user_id, week_start: curWeek, start_time: s.start_time, end_time: s.end_time }));
    if (!rows.length) return showToast('مفيش شيفتات متسجلة في الأسبوع السابق', 'info');
    run(sbClient.from('hr_shifts').upsert(rows, { onConflict: 'user_id,week_start' }), 'تم نسخ شيفتات الأسبوع السابق');
  };
  hr.reqLeave = async e => {
    e.preventDefault(); const f = e.target.elements, mgr = isMgr(), kind = f.k.value;
    if (f.t.value < f.f.value) return showToast('تاريخ النهاية قبل البداية', 'error');
    const row = { user_id: mgr ? f.u.value : currentUser.id, kind, from_day: f.f.value, to_day: f.t.value, reason: f.r.value.trim() || null, status: mgr ? 'approved' : 'pending', decided_by: mgr ? currentUser.id : null };
    if (kind === 'mission') { row.destination = f.dst.value.trim() || null; row.mission_details = f.det.value.trim() || null; }
    const ok = await run(sbClient.from('hr_leaves').insert(row), mgr ? 'تم التسجيل' : 'تم إرسال الطلب للمدير');
    if (ok && !mgr) notifyManager('طلب ' + LK[kind] + ' جديد', nameOf(currentUser.id) + ' قدّم طلب ' + LK[kind] + ' بتاريخ ' + f.f.value);
  };
  hr.decide = (id, s) => run(sbClient.rpc('hr_decide_leave', { p_id: String(id), p_status: s }), s === 'approved' ? 'تمت الموافقة' : 'تم الرفض');
  hr.delLv = id => { if (confirm('حذف الطلب ده؟')) run(sbClient.from('hr_leaves').delete().eq('id', id)); };
  hr.genEmail = id => {
    const x = leaves.find(v => String(v.id) === String(id)); if (!x) return;
    const txt = `السيد مدير الإدارة المحترم،\n\nتحية طيبة وبعد،\n\nإحاطة بعلم سيادتكم بمأمورية العمل الرسمية للموظف: ${nameOf(x.user_id)}\n- التاريخ: ${x.from_day}${x.to_day !== x.from_day ? ' إلى ' + x.to_day : ''}\n- جهة المأمورية: ${x.destination || 'جهة خارجية'}\n- الهدف: ${x.mission_details || x.reason || 'مأمورية عمل رسمية'}\n\nتفضلوا بقبول فائق الاحترام والتقدير.`;
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(() => showToast('تم نسخ نص الإيميل'), () => prompt('انسخ النص:', txt));
    else prompt('انسخ النص:', txt);
  };
  hr.addAdj = e => { e.preventDefault(); if (lockedMsg()) return; const f = e.target.elements; run(sbClient.from('hr_adjustments').insert({ user_id: f.u.value, month, kind: f.k.value, amount: Number(f.a.value), note: f.n.value.trim() || null, created_by: currentUser.id }), 'تمت الإضافة'); };
  hr.delAdj = id => { if (lockedMsg()) return; if (confirm('حذف الحركة دي؟')) run(sbClient.from('hr_adjustments').delete().eq('id', id)); };
  hr.saveCfg = (e, uid) => { e.preventDefault(); const f = e.target.elements; run(sbClient.from('hr_staff').upsert({ user_id: uid, base_salary: Number(f.b.value) || 0, work_start: f.s.value || '09:00', annual_leave_days: Number(f.a.value) || 0, hire_date: f.h.value || null }, { onConflict: 'user_id' }), 'تم الحفظ'); };
  hr.csv = () => {
    const c = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const rows = people().map(p => { const r = payroll(p.id); return [p.full_name, r.base, r.cm, r.bonus, r.ded, r.adv, r.st.absent, r.absDed, Math.round(r.st.lateMin), Math.round(r.st.earlyMin), r.net]; });
    const txt = '\uFEFF' + [['الموظف', 'الأساسي', 'الكوميشن', 'مكافآت', 'خصومات', 'سلف', 'أيام الغياب', 'خصم الغياب', 'دقائق التأخير', 'انصراف مبكر', 'الصافي']].concat(rows).map(r => r.map(c).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' })); a.download = 'payroll-' + month + '.csv'; a.click();
  };
  window.renderHr = render;

  /* ---------- ربط التاب (نفس آلية النسخة القديمة اللي كانت شغالة) ---------- */
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
    if (window.__role && window.__role !== 'partner') {
      inject();
      if (sbClient && currentUser && isMgr()) sbClient.from('hr_leaves').select('id', { count: 'exact', head: true }).eq('status', 'pending').then(r => {
        if (r.error) return; const b = $('tab-hr-btn'); if (!b) return; let s = $('hr-badge');
        if (!s) { b.insertAdjacentHTML('beforeend', '<span id="hr-badge" class="hidden rounded-full bg-amber-500 text-white text-[10px] font-bold px-1.5 min-w-[18px] text-center leading-[18px]"></span>'); s = $('hr-badge'); }
        s.textContent = r.count || 0; s.classList.toggle('hidden', !r.count);
      });
    }
    return x;
  };
  const _lo = window.handleLogout;
  window.handleLogout = async function () { staff = []; att = []; leaves = []; adj = []; shiftMap = new Map(); lock = null; snaps = new Map(); sub = null; return _lo.apply(this, arguments); };
})();
