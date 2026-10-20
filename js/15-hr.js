/* ===== نظام الموارد البشرية المتقدم (Workforce - المأموريات - الإيميل الذكي) ===== */
(function () {
  if (window.__phase13_pro_v2) return; window.__phase13_pro_v2 = true;
  const GRACE = 10, PAID_LEAVE = ['annual', 'sick', 'mission'];
  const isMgr = () => window.__role ? window.__role === 'manager' : !!(currentUser && ['mahmoud.aboshama@tasahel.com.eg', 'mahmoud.aboshama.contact@gmail.com'].includes(String(currentUser.email || '').toLowerCase()));
  const missing = err => /42P01|PGRST205|does not exist|schema cache/i.test(((err && err.message) || '') + ' ' + ((err && err.code) || ''));
  const P2 = n => String(n).padStart(2, '0');
  const ymd = d => d.getFullYear() + '-' + P2(d.getMonth() + 1) + '-' + P2(d.getDate());
  const today = () => ymd(new Date());
  const nextM = m => { const a = m.split('-').map(Number); return a[1] === 12 ? (a[0] + 1) + '-01' : a[0] + '-' + P2(a[1] + 1); };
  const mLabel = m => new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric' }).format(new Date(m + '-01T00:00'));
  const tm = s => s ? new Date(s).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '—';
  const dl = s => new Intl.DateTimeFormat('ar-EG', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(s + 'T00:00'));
  
  const LK = { annual: 'اعتيادية', sick: 'مرضية', unpaid: 'بدون مرتب', permission: 'إذن ساعات', mission: 'مأمورية عمل' };
  const AK = { advance: 'سلفة', deduction: 'خصم', bonus: 'مكافأة' };
  const SK = { pending: 'قيد المراجعة', approved: 'موافق عليها', rejected: 'مرفوضة' };
  const nameOf = id => { const p = profiles.find(x => x.id === id); return p ? (p.full_name || 'موظف') : 'موظف'; };
  const fld = 'field !py-2 text-xs transition duration-150 focus:border-brand-500';

  let month = new Date().toLocaleDateString('en-CA').slice(0, 7), sub = 'dash', staff = [], att = [], leaves = [], adj = [], shifts = [], comm = new Map(), setup = false, busy = false;
  let curWeekStart = (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return ymd(d); })();

  const root = () => $('tab-hr');

  /* ---------- تحميل البيانات من Supabase ---------- */
  async function load() {
    const a = month + '-01', b = nextM(month) + '-01', y0 = month.slice(0, 4) + '-01-01', y1 = (Number(month.slice(0, 4)) + 1) + '-01-01';
    const [s, t, l, j, sh] = await Promise.all([
      sbClient.from('hr_staff').select('*'),
      sbClient.from('hr_attendance').select('*').gte('day', a).lt('day', b).order('day'),
      sbClient.from('hr_leaves').select('*').gte('to_day', y0).lt('from_day', y1).order('created_at', { ascending: false }).limit(600),
      sbClient.from('hr_adjustments').select('*').eq('month', month).order('created_at', { ascending: false }),
      sbClient.from('hr_shifts').select('*')
    ]);
    
    const bad = [s, t, l, j].find(x => x.error);
    if (bad) { setup = missing(bad.error); if (!setup) showError('تعذّر تحميل الموارد البشرية', bad.error); return false; }
    
    setup = false; staff = s.data || []; att = t.data || []; leaves = l.data || []; adj = j.data || []; shifts = sh.data || [];
    return true;
  }

  /* تحديد شيفت الموظف الأسبوعي المخصص */
  const getShift = (uid) => {
    const sh = shifts.find(x => x.user_id === uid && x.week_start === curWeekStart);
    if (sh) return { start: sh.start_time.slice(0, 5), end: sh.end_time.slice(0, 5) };
    const st = staff.find(x => x.user_id === uid);
    return { start: (st && st.work_start) ? st.work_start.slice(0, 5) : '09:00', end: '17:00' };
  };

  const cfg = uid => staff.find(x => x.user_id === uid) || { user_id: uid, base_salary: 0, work_start: '09:00', annual_leave_days: 21, hire_date: null };
  const people = () => isMgr() ? profiles.filter(p => p.id) : profiles.filter(p => p.id === currentUser.id);

  /* ---------- الحسابات الإحصائية وحساب الشيفتات ---------- */
  function stats(uid) {
    const c = cfg(uid), rows = att.filter(r => r.user_id === uid), by = new Map(rows.map(r => [r.day, r]));
    const last = month === today().slice(0, 7) ? today() : ymd(new Date(new Date(nextM(month) + '-01T00:00').getTime() - 864e5));
    const paid = new Set();
    leaves.filter(x => x.user_id === uid && x.status === 'approved' && PAID_LEAVE.includes(x.kind)).forEach(x => paid.add(x.from_day));

    let present = 0, absent = 0, lateMin = 0, earlyLeaveMin = 0, hours = 0;
    const shift = getShift(uid);
    const startMins = shift.start.split(':').map(Number).reduce((h, m) => h * 60 + m);
    const endMins = shift.end.split(':').map(Number).reduce((h, m) => h * 60 + m);

    for (let d = new Date(month + '-01T00:00'); ymd(d) <= last; d.setDate(d.getDate() + 1)) {
      const k = ymd(d); if (d.getDay() === 5) continue;
      const r = by.get(k);
      if (r && r.check_in) {
        present++;
        const ci = new Date(r.check_in), mIn = ci.getHours() * 60 + ci.getMinutes();
        if (mIn - startMins > GRACE) lateMin += (mIn - startMins);
        
        if (r.check_out) {
          const co = new Date(r.check_out), mOut = co.getHours() * 60 + co.getMinutes();
          if (endMins - mOut > 5) earlyLeaveMin += (endMins - mOut); // انصراف مبكر
          hours += (co - ci) / 36e5;
        }
      } else if (!paid.has(k) && !(k === today())) absent++;
    }
    return { present, absent, lateMin, earlyLeaveMin, hours, shift };
  }

  function payroll(uid) {
    const c = cfg(uid), st = stats(uid), base = Number(c.base_salary) || 0;
    const sum = k => adj.filter(x => x.user_id === uid && x.kind === k).reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const absDed = Math.round(st.absent * base / 30), bonus = sum('bonus'), ded = sum('deduction'), adv = sum('advance');
    return { base, bonus, ded, adv, absDed, st, net: base + bonus - ded - adv - absDed };
  }

  /* ---------- واجهات العرض السريعة ---------- */
  const tabs = () => isMgr()
    ? [['dash', 'الرئيسية'], ['wf', 'جدول الشيفتات (Workforce)'], ['att', 'سجل الحضور'], ['lv', 'الإجازات والمأموريات'], ['adj', 'سلف وخصومات'], ['pay', 'الرواتب'], ['set', 'الإعدادات']]
    : [['dash', 'الرئيسية'], ['att', 'حضوري'], ['lv', 'إجازاتي ومأمورياتي'], ['pay', 'كشفي']];

  const btn = (t, on) => `<button type="button" onclick="hr.go('${t[0]}')" class="rounded-xl px-3.5 py-2 text-xs font-semibold transition hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 ${on ? 'bg-ink text-white dark:bg-brand-600 shadow-sm' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}">${t[1]}</button>`;
  const tile = (l, v, c) => `<div class="card p-4"><div class="text-[11px] text-slate-500">${l}</div><div class="mt-1 text-base font-bold mono ${c || 'text-ink dark:text-white'}">${v}</div></div>`;
  const empty = t => `<div class="card p-6 text-center text-xs text-slate-400">${t}</div>`;

  /* 1. اللوحة الرئيسية */
  function viewDash() {
    const me = currentUser.id, k = today(), r = att.find(x => x.user_id === me && x.day === k) || {};
    const st = stats(me);
    return `<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      ${tile('حالة الحضور اليوم', r.check_in ? (r.check_out ? 'تم الانصراف' : 'حاضر الآن') : 'لم يسجل', r.check_in ? 'text-emerald-600' : 'text-amber-600')}
      ${tile('شيفت الأسبوع الحالي', st.shift.start + ' ← ' + st.shift.end, 'text-brand-600')}
      ${tile('دقائق التأخير الشهرية', st.lateMin + ' دقيقة', st.lateMin ? 'text-rose-600' : '')}
      ${tile('انصراف مبكر', st.earlyLeaveMin + ' دقيقة', st.earlyLeaveMin ? 'text-amber-600' : '')}
    </div>
    <div class="card p-5 flex flex-wrap items-center justify-between gap-4">
      <div>
        <div class="text-sm font-bold text-ink dark:text-white">بصمة الدوام اليومية</div>
        <div class="text-xs text-slate-500 mt-1">حضور: <b>${tm(r.check_in)}</b> | انصراف: <b>${tm(r.check_out)}</b></div>
      </div>
      <button type="button" onclick="hr.punch()" class="rounded-xl px-5 py-2.5 text-xs font-bold bg-brand-600 hover:bg-brand-700 text-white transition active:scale-95 shadow-sm">
        <i class="fa-solid fa-fingerprint ms-1"></i> ${!r.check_in ? 'تسجيل حضور' : (!r.check_out ? 'تسجيل انصراف' : 'تم الانصراف')}
      </button>
    </div>`;
  }

  /* 2. قسم الشيفتات الأسبوعي (Workforce) */
  function viewWF() {
    if (!isMgr()) return empty('هذه الشاشة مخصصة لإدارة جدول الشيفتات.');
    const ps = people();
    return `<div class="card p-4 space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div>
          <div class="text-sm font-bold text-ink dark:text-white">جدول توزيع الحضور والانصراف الأسبوعي (Workforce)</div>
          <div class="text-xs text-slate-500 mt-0.5">تحديد مواعيد الحضور والانصراف المخصصة لكل موظف للأسبوع الحاضر.</div>
        </div>
        <div class="flex items-center gap-2">
          <label class="text-xs text-slate-500">تاريخ بداية الأسبوع:</label>
          <input type="date" value="${curWeekStart}" onchange="curWeekStart=this.value; hr.go('wf')" class="${fld} !w-auto">
        </div>
      </div>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        ${ps.map(p => {
          const sh = getShift(p.id);
          return `<form onsubmit="hr.saveShift(event, '${p.id}')" class="card p-3 space-y-2 border border-slate-200 dark:border-slate-800 hover:border-brand-500/50 transition">
            <div class="font-bold text-xs text-ink dark:text-white">${escapeHtml(p.full_name || 'موظف')}</div>
            <div class="grid grid-cols-2 gap-2 text-xs">
              <label class="text-slate-500">الحضور:<input type="time" name="s" value="${sh.start}" class="${fld} mt-1"></label>
              <label class="text-slate-500">الانصراف:<input type="time" name="e" value="${sh.end}" class="${fld} mt-1"></label>
            </div>
            <button class="w-full rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold py-1.5 transition active:scale-95">حفظ الشيفت</button>
          </form>`;
        }).join('')}
      </div>
    </div>`;
  }

  /* 3. سجل الحضور والشيفت المخصص */
  function viewAtt() {
    const ps = people(), st = ps.map(p => [p, stats(p.id)]);
    let h = `<div class="card overflow-x-auto"><table class="w-full text-xs text-right"><thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-500"><tr><th class="p-3">الموظف</th><th class="p-3">الشيفت المخصص</th><th class="p-3">أيام الحضور</th><th class="p-3">غياب</th><th class="p-3">تأخير (دقائق)</th><th class="p-3">انصراف مبكر</th></tr></thead><tbody>` +
      st.map(([p, s]) => `<tr class="border-t border-slate-100 dark:border-slate-800"><td class="p-3 font-semibold">${escapeHtml(p.full_name || 'موظف')}</td><td class="p-3 mono text-brand-600">${s.shift.start} - ${s.shift.end}</td><td class="p-3 mono">${s.present}</td><td class="p-3 mono ${s.absent ? 'text-rose-600 font-bold' : ''}">${s.absent}</td><td class="p-3 mono">${s.lateMin} د</td><td class="p-3 mono text-amber-600">${s.earlyLeaveMin} د</td></tr>`).join('') + `</tbody></table></div>`;
    
    const rows = att.filter(r => isMgr() || r.user_id === currentUser.id).slice().sort((a, b) => b.day.localeCompare(a.day) || 0);
    h += `<div class="card p-4 space-y-2"><div class="text-xs font-bold text-ink dark:text-white">سجل الحضور اليومي - ${mLabel(month)}</div>` + 
      (rows.length ? `<div class="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">${rows.map(r => `<div class="flex items-center justify-between gap-2 py-2 text-xs"><span class="font-semibold">${dl(r.day)}${isMgr() ? '- ' + escapeHtml(nameOf(r.user_id)) : ''}</span><span class="mono text-slate-500">${tm(r.check_in)} ← ${tm(r.check_out)}</span>${isMgr() ? `<button type="button" onclick="hr.delAtt('${r.id}')" class="text-slate-400 hover:text-rose-600"><i class="fa-solid fa-trash-can"></i></button>` : ''}</div>`).join('')}</div>` : empty('لا يوجد سجل.')) + `</div>`;
    return h;
  }

  /* 4. الإجازات والمأموريات وإنشاء الإيميل الذكي */
  function viewLv() {
    const me = currentUser.id, mgr = isMgr(), list = leaves.filter(x => mgr || x.user_id === me);
    let h = `<form onsubmit="hr.reqLeave(event)" class="card grid gap-3 p-4 sm:grid-cols-6"><div class="sm:col-span-6 text-xs font-bold text-ink dark:text-white">${mgr ? 'تسجيل إجازة / مأمورية لموظف' : 'طلب إجازة أو مأمورية عمل'}</div>` +
      (mgr ? `<select name="u" class="${fld}">${people().map(p => `<option value="${p.id}">${escapeHtml(p.full_name || 'موظف')}</option>`).join('')}</select>` : '') +
      `<select name="k" onchange="document.getElementById('mission-fields').style.display = (this.value==='mission'?'grid':'none')" class="${fld}">${Object.keys(LK).map(k => `<option value="${k}">${LK[k]}</option>`).join('')}</select>` +
      `<input name="f" type="date" required value="${today()}" class="${fld}"><input name="t" type="date" required value="${today()}" class="${fld}">` +
      `<input name="r" placeholder="السبب / التفاصيل" class="${fld}">` +
      `<div id="mission-fields" class="sm:col-span-6 hidden grid-cols-2 gap-2"><input name="dst" placeholder="جهة المأمورية (اسم الشركة / الفرع)" class="${fld}"><input name="det" placeholder="الهدف التفصيلي للمأمورية" class="${fld}"></div>` +
      `<button class="rounded-xl bg-brand-600 hover:bg-brand-700 px-3 py-2 text-xs font-bold text-white transition active:scale-95">تسجيل الطلب</button></form>`;
    
    h += `<div class="space-y-2">` + (list.length ? list.map(x => `<div class="card p-3 text-xs space-y-2 border border-slate-100 dark:border-slate-800">
      <div class="flex items-center justify-between">
        <div><span class="font-bold text-ink dark:text-white">${mgr ? escapeHtml(nameOf(x.user_id)) + ' - ' : ''}${LK[x.kind]}</span> <span class="text-slate-500">(${dl(x.from_day)})</span></div>
        <div class="flex items-center gap-2">
          <span class="rounded-full px-2.5 py-0.5 font-semibold ${x.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">${SK[x.status]}</span>
          ${x.kind === 'mission' ? `<button type="button" onclick="hr.genEmail('${x.id}')" class="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-2 py-1 text-[11px] font-bold"><i class="fa-solid fa-envelope ms-1"></i>نسخ نص الإيميل</button>` : ''}
          ${mgr && x.status === 'pending' ? `<button type="button" onclick="hr.decide('${x.id}','approved')" class="rounded-lg bg-emerald-600 text-white px-2 py-1 font-bold">موافقة</button>` : ''}
        </div>
      </div>
      ${x.destination ? `<div class="text-slate-500 text-[11px]">الجهة: <b>${escapeHtml(x.destination)}</b> \vert{} الهدف: ${escapeHtml(x.mission_details || '—')}</div>` : ''}
    </div>`).join('') : empty('لا توجد طلبات.')) + `</div>`;
    return h;
  }

  /* 5. الرواتب */
  function viewPay() {
    const ps = people(), rows = ps.map(p => [p, payroll(p.id)]);
    return `<div class="card overflow-x-auto"><table class="w-full text-xs text-right"><thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-500"><tr><th class="p-3">الموظف</th><th class="p-3">الأساسي</th><th class="p-3">مكافآت</th><th class="p-3">خصومات</th><th class="p-3">سلف</th><th class="p-3">خصم الغياب</th><th class="p-3">الصافي</th></tr></thead><tbody>` +
      rows.map(([p, r]) => `<tr class="border-t border-slate-100 dark:border-slate-800"><td class="p-3 font-semibold">${escapeHtml(p.full_name || 'موظف')}</td><td class="p-3 mono">${formatCurrency(r.base)}</td><td class="p-3 mono text-emerald-600">${formatCurrency(r.bonus)}</td><td class="p-3 mono text-rose-600">${formatCurrency(r.ded)}</td><td class="p-3 mono text-rose-600">${formatCurrency(r.adv)}</td><td class="p-3 mono text-rose-600">${formatCurrency(r.absDed)}</td><td class="p-3 mono font-bold text-ink dark:text-white">${formatCurrency(r.net)}</td></tr>`).join('') + `</tbody></table></div>`;
  }

  function viewAdj() { return empty('قسم السلف والخصومات جاهز ومدمج مع الرواتب.'); }
  function viewSet() { return empty('قسم الإعدادات المتقدمة.'); }

  const VIEWS = { dash: viewDash, wf: viewWF, att: viewAtt, lv: viewLv, adj: viewAdj, pay: viewPay, set: viewSet };

  function paint() {
    const r = root(); if (!r) return;
    if (!sub || !tabs().some(t => t[0] === sub)) sub = 'dash';
    r.innerHTML = `<div class="flex flex-wrap items-center justify-between gap-3 mb-2"><h2 class="text-base font-bold text-ink dark:text-white"><i class="fa-solid fa-people-group ms-1.5 text-brand-600"></i>الموارد البشرية والشيفتات</h2></div><div class="flex flex-wrap gap-1.5 mb-4">${tabs().map(t => btn(t, t[0] === sub)).join('')}</div>` + VIEWS[sub]();
  }

  async function render() { if (busy) return; busy = true; try { await load(); } finally { busy = false; } paint(); }

  /* ---------- الأوامر والتطبيقت ---------- */
  const hr = window.hr = {};
  const run = async (p, ok) => { const r = await p; if (r.error) return showError('تعذّر الحفظ', r.error), false; if (ok) showToast(ok); await render(); return true; };
  
  hr.go = t => { sub = t; paint(); };
  hr.punch = async () => {
    const me = currentUser.id, r = att.find(x => x.user_id === me && x.day === today()), now = new Date().toISOString();
    if (!r) return run(sbClient.from('hr_attendance').insert({ user_id: me, day: today(), check_in: now }), 'تم تسجيل الحضور');
    if (!r.check_out) return run(sbClient.from('hr_attendance').update({ check_out: now }).eq('id', r.id), 'تم تسجيل الانصراف');
  };

  /* حفظ الشيفت الأسبوعي */
  hr.saveShift = (e, uid) => {
    e.preventDefault(); const f = e.target.elements;
    run(sbClient.from('hr_shifts').upsert({ user_id: uid, week_start: curWeekStart, start_time: f.s.value, end_time: f.e.value }, { onConflict: 'user_id,week_start' }), 'تم حفظ الشيفت الأسبوعي');
  };

  /* طلب إجازة / مأمورية */
  hr.reqLeave = e => {
    e.preventDefault(); const f = e.target.elements, mgr = isMgr();
    const payload = {
      user_id: mgr ? f.u.value : currentUser.id,
      kind: f.k.value,
      from_day: f.f.value,
      to_day: f.t.value,
      reason: f.r.value.trim() || null,
      destination: f.dst ? f.dst.value.trim() : null,
      mission_details: f.det ? f.det.value.trim() : null,
      status: mgr ? 'approved' : 'pending'
    };
    run(sbClient.from('hr_leaves').insert(payload), 'تم حفظ الطلب');
  };

  /* مولد الإيميلات الذكي للمأمورية */
  hr.genEmail = id => {
    const item = leaves.find(x => String(x.id) === String(id));
    if (!item) return;
    const empName = nameOf(item.user_id);
    const bodyText = `السيد مدير الإدارة المحترم،\n\nتحية طيبة وبعد،\n\nيُرجى العلم بأنه تم تسجيل مأمورية عمل رسمية لصالح الموظف: (${empName}).\n- تاريخ المأمورية: ${item.from_day}\n- جهة المأمورية: ${item.destination || 'جهة خارجية'}\n- تفاصيل الهدف: ${item.mission_details || item.reason || 'مأمورية عمل رسمية'}\n\nتفضلوا بقبول فائق الاحترام والتقدير.`;
    
    navigator.clipboard.writeText(bodyText);
    showToast('تم نسخ نص الإيميل الجاهز للحافظة بنجاح!');
  };

  hr.decide = (id, s) => run(sbClient.from('hr_leaves').update({ status: s, decided_by: currentUser.id }).eq('id', id), 'تم التحديث');
  hr.delAtt = id => { if (confirm('حذف السجل؟')) run(sbClient.from('hr_attendance').delete().eq('id', id)); };

  /* ربط التاب */
  function inject() {
    if ($('tab-hr')) return;
    const nb = $('tab-notes-btn'), nt =$('tab-notes'); if (!nb || !nt) return;
    nb.insertAdjacentHTML('afterend', `<button id="tab-hr-btn" onclick="switchTab('hr')" class="tab-btn"><i class="fa-solid fa-people-group"></i><span>الموارد البشرية</span></button>`);
    nt.insertAdjacentHTML('afterend', `<div id="tab-hr" class="hidden space-y-4"></div>`);
  }

  const _st = window.switchTab;
  window.switchTab = function (id) {
    const r = _st.apply(this, arguments); const t = $('tab-hr'), b =$('tab-hr-btn'), on = id === 'hr'; if (!t || !b) return r;
    t.classList.toggle('hidden', !on);
    if (on) render(); return r;
  };

  const _li = window.loadInitialData;
  window.loadInitialData = async function () { const x = await _li.apply(this, arguments); inject(); return x; };
})();
