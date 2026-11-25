
/* ===== المرحلة 10: ملاحظاتي الخاصة + تغيير/استرجاع كلمة المرور + قفل التطبيق بالبصمة ===== */
(function () {
  if (window.__phase10) return; window.__phase10 = true;
  const eh = escapeHtml;
  const missing = err => /42P01|PGRST205|does not exist|schema cache/i.test(((err && err.message) || '') + ' ' + ((err && err.code) || ''));
  const fmt = s => new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(s));

  /* ---------- ملاحظاتي ---------- */
  let notes = [], nMissing = false, editing = null, q = '', loadedFor = null;
  async function loadPN() {
    const r = await sbClient.from('private_notes').select('*').order('created_at', { ascending: false }).limit(500);
    if (r.error) { nMissing = missing(r.error); notes = []; if (!nMissing) showError('تعذّر تحميل الملاحظات', r.error); }
    else { nMissing = false; notes = r.data || []; }
    loadedFor = currentUser && currentUser.id; renderNotes();
  }
  window.renderNotes = function () {
    const root = $('tab-notes'); if (!root) return;
    if (loadedFor !== (currentUser && currentUser.id)) { root.innerHTML = '<div class="card p-8 text-center text-sm text-slate-400"><i class="fa-solid fa-spinner fa-spin ms-1"></i> جارٍ التحميل...</div>'; loadPN(); return; }
    if (nMissing) { root.innerHTML = '<div class="card p-8 text-center text-sm text-slate-500">شغّل ملف <b class="font-mono">phase7-private-notes.sql</b> في Supabase علشان الملاحظات تشتغل.</div>'; return; }
    const keep = { t: $('pn-text') ? $('pn-text').value : '', k: $('pn-task') ? $('pn-task').checked : false };
    const list = notes.filter(n => !q || n.body.toLowerCase().indexOf(q.toLowerCase()) >= 0).sort((a, b) => (a.done - b.done) || (new Date(b.created_at) - new Date(a.created_at)));
    const item = n => {
      if (editing === n.id) return '<div class="card p-4 space-y-2"><textarea id="pn-edit" rows="3" maxlength="4000" class="field">' + eh(n.body) + '</textarea><div class="flex gap-2"><button type="button" data-id="' + n.id + '" onclick="pnSave(this.dataset.id)" class="rounded-xl bg-teal-600 px-4 py-1.5 text-xs font-bold text-white">حفظ</button><button type="button" onclick="pnEdit(null)" class="rounded-xl bg-slate-100 dark:bg-slate-800 px-4 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300">إلغاء</button></div></div>';
      return '<div class="card p-4 flex items-start gap-3 ' + (n.done ? 'opacity-60' : '') + '">' + (n.is_task ? '<button type="button" data-id="' + n.id + '" onclick="pnToggle(this.dataset.id)" class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ' + (n.done ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 dark:border-slate-600') + '" aria-label="تم">' + (n.done ? '<i class="fa-solid fa-check text-[10px]"></i>' : '') + '</button>' : '<i class="fa-regular fa-note-sticky mt-0.5 text-amber-500"></i>') +
        '<div class="min-w-0 flex-1"><div class="text-sm whitespace-pre-wrap break-words ' + (n.done ? 'line-through text-slate-400' : 'text-ink dark:text-white') + '">' + eh(n.body) + '</div><div class="mt-1 text-[10px] text-slate-400"><bdi>' + eh(fmt(n.created_at)) + '</bdi></div></div><div class="flex shrink-0 gap-1"><button type="button" data-id="' + n.id + '" onclick="pnEdit(this.dataset.id)" class="rounded-lg p-1.5 text-slate-400 hover:text-teal-600" aria-label="تعديل"><i class="fa-solid fa-pen"></i></button><button type="button" data-id="' + n.id + '" onclick="pnDelete(this.dataset.id)" class="rounded-lg p-1.5 text-slate-400 hover:text-rose-600" aria-label="حذف"><i class="fa-solid fa-trash-can"></i></button></div></div>';
    };
    root.innerHTML = '<form onsubmit="pnAdd(event)" class="card p-5 sm:p-6 space-y-3"><div class="flex items-center gap-3"><span class="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500 text-white"><i class="fa-solid fa-note-sticky"></i></span><div><h3 class="font-bold text-ink dark:text-white text-base">ملاحظاتي</h3><p class="text-xs text-slate-500"><i class="fa-solid fa-lock ms-1"></i>خاصة بيك بس، محدش يشوفها حتى المدير</p></div></div><textarea id="pn-text" rows="2" maxlength="4000" required class="field" placeholder="اكتب ملاحظة أو مهمة..."></textarea><div class="flex flex-wrap items-center justify-between gap-3"><label class="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300"><input id="pn-task" type="checkbox" class="h-4 w-4 rounded"> مهمة (أقدر أعلّم عليها تم)</label><button id="pn-go" type="submit" class="rounded-xl bg-amber-500 hover:bg-amber-600 px-5 py-2 text-sm font-bold text-white"><i class="fa-solid fa-plus ms-1"></i>إضافة</button></div></form>' +
      '<input id="pn-q" type="search" value="' + eh(q) + '" oninput="pnSearch(this.value)" class="field" placeholder="بحث في ملاحظاتي...">' +
      '<div class="space-y-3">' + (list.map(item).join('') || '<div class="card p-8 text-center text-sm text-slate-400">لا توجد ملاحظات</div>') + '</div>';
    $('pn-text').value = keep.t; $('pn-task').checked = keep.k;
  };
  window.pnSearch = v => { q = v; renderNotes(); const i = $('pn-q'); if (i) { i.focus(); i.setSelectionRange(v.length, v.length); } };
  window.pnAdd = async function (e) {
    e.preventDefault(); const body = $('pn-text').value.trim(); if (!body) return;
    $('pn-go').disabled = true;
    const r = await sbClient.from('private_notes').insert({ body: body, is_task: $('pn-task').checked }).select().single();
    if (r.error) { $('pn-go').disabled = false; return showError('تعذّر الحفظ', r.error); }
    notes.unshift(r.data); $('pn-text').value = ''; renderNotes();
  };
  window.pnToggle = async function (id) {
    const n = notes.find(x => x.id === id); if (!n) return; n.done = !n.done; renderNotes();
    const r = await sbClient.from('private_notes').update({ done: n.done }).eq('id', id);
    if (r.error) { n.done = !n.done; renderNotes(); showError('تعذّر التحديث', r.error); }
  };
  window.pnEdit = id => { editing = id; renderNotes(); const t = $('pn-edit'); if (t) t.focus(); };
  window.pnSave = async function (id) {
    const body = $('pn-edit').value.trim(); if (!body) return;
    const r = await sbClient.from('private_notes').update({ body: body }).eq('id', id);
    if (r.error) return showError('تعذّر الحفظ', r.error);
    const n = notes.find(x => x.id === id); if (n) n.body = body; editing = null; renderNotes();
  };
  window.pnDelete = async function (id) {
    if (!confirm('حذف الملاحظة دي؟')) return;
    const r = await sbClient.from('private_notes').delete().eq('id', id);
    if (r.error) return showError('تعذّر الحذف', r.error);
    notes = notes.filter(x => x.id !== id); renderNotes();
  };

  /* ---------- تغيير / استرجاع كلمة المرور ---------- */
  function pwModal(mode) {
    let m = $('pw-modal'); if (m) m.remove();
    const rec = mode === 'recovery';
    document.body.insertAdjacentHTML('beforeend', '<div id="pw-modal" class="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4"><form id="pw-form" class="w-full max-w-sm space-y-4 rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl"><h3 class="font-bold text-ink dark:text-white">' + (rec ? 'اكتب كلمة مرور جديدة' : 'تغيير كلمة المرور') + '</h3>' +
      (rec ? '' : '<div><label class="label" for="pw-old">كلمة المرور الحالية</label><input id="pw-old" type="password" required autocomplete="current-password" dir="ltr" class="field text-right"></div>') +
      '<div><label class="label" for="pw-new">كلمة المرور الجديدة (8 أحرف على الأقل)</label><input id="pw-new" type="password" required minlength="8" autocomplete="new-password" dir="ltr" class="field text-right"></div><div><label class="label" for="pw-new2">تأكيد كلمة المرور</label><input id="pw-new2" type="password" required minlength="8" autocomplete="new-password" dir="ltr" class="field text-right"></div><div id="pw-err" class="hidden rounded-xl bg-rose-50 p-2.5 text-xs text-rose-700"></div><div class="flex gap-2"><button id="pw-go" type="submit" class="flex-1 rounded-xl bg-ink dark:bg-brand-600 py-2.5 text-sm font-bold text-white">حفظ</button>' + (rec ? '' : '<button type="button" onclick="document.getElementById(\'pw-modal\').remove()" class="rounded-xl bg-slate-100 dark:bg-slate-800 px-4 text-sm font-bold text-slate-600 dark:text-slate-300">إلغاء</button>') + '</div></form></div>');
    $('pw-form').onsubmit = async e => {
      e.preventDefault();
      const err = m => { $('pw-err').textContent = m; $('pw-err').classList.remove('hidden'); };
      const a = $('pw-new').value, b = $('pw-new2').value; $('pw-err').classList.add('hidden');
      if (a !== b) return err('كلمتين المرور مش متطابقين');
      if (a.length < 8) return err('كلمة المرور أقل من 8 أحرف');
      $('pw-go').disabled = true;
      try {
        if (!rec) {
          const v = await sbClient.auth.signInWithPassword({ email: currentUser.email, password: $('pw-old').value });
          if (v.error) throw new Error('كلمة المرور الحالية غلط');
        }
        const r = await sbClient.auth.updateUser({ password: a });
        if (r.error) throw r.error;
        $('pw-modal').remove(); showToast('تم تغيير كلمة المرور');
        if (rec) { try { history.replaceState(null, '', location.pathname); } catch (x) { /* */ } }
      } catch (ex) { err(ex.message || 'تعذّر التغيير'); $('pw-go').disabled = false; }
    };
  }
  window.pwOpen = () => pwModal('change');
  window.forgotPassword = async function () {
    const em = ($('login-email').value || '').trim() || (prompt('اكتب بريدك الإلكتروني:') || '').trim();
    if (!em) return;
    if (!sbClient && !initSupabase()) return;
    const r = await sbClient.auth.resetPasswordForEmail(em, { redirectTo: location.origin + location.pathname });
    if (r.error) return showToast('تعذّر الإرسال: ' + r.error.message, 'error', 7000);
    showToast('لو الإيميل مسجل هيوصله رابط تغيير كلمة المرور', 'info', 8000);
  };
  let recovery = /type=recovery/.test(location.hash);
  const _is = window.initSupabase;
  window.initSupabase = function () {
    const ok = _is.apply(this, arguments);
    if (ok && sbClient && !sbClient.__p10) {
      sbClient.__p10 = true;
      sbClient.auth.onAuthStateChange(ev => { if (ev === 'PASSWORD_RECOVERY') { recovery = true; setTimeout(() => pwModal('recovery'), 400); } });
    }
    return ok;
  };

  /* ---------- قفل التطبيق بالبصمة (على الجهاز ده) ---------- */
  const b64u = buf => btoa(String.fromCharCode.apply(null, new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  const lkKey = () => 'tasahel_lock_' + (currentUser && currentUser.id);
  const lkGet = () => { try { return localStorage.getItem(lkKey()); } catch (e) { return null; } };
  const lkSet = v => { try { v ? localStorage.setItem(lkKey(), v) : localStorage.removeItem(lkKey()); } catch (e) { /* */ } };
  let supported = false, fresh = false, hiddenAt = 0;
  if (window.PublicKeyCredential && PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then(v => { supported = !!v; }).catch(() => {});
  const rnd = () => crypto.getRandomValues(new Uint8Array(32));
  window.bioToggle = async function () {
    if (lkGet()) { lkSet(null); showToast('اتلغى القفل بالبصمة'); return drawSec(); }
    if (!supported) return showToast('الجهاز ده مش بيدعم البصمة أو القفل', 'error', 6000);
    try {
      const c = await navigator.credentials.create({ publicKey: { challenge: rnd(), rp: { name: 'Tasahel', id: location.hostname }, user: { id: new TextEncoder().encode(currentUser.id), name: currentUser.email, displayName: (myProfile && myProfile.full_name) || currentUser.email }, pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }], authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' }, timeout: 60000 } });
      lkSet(b64u(c.rawId)); showToast('تم تفعيل القفل بالبصمة على الجهاز ده'); drawSec();
    } catch (e) { showToast('اتلغى التفعيل أو فشل', 'error', 5000); }
  };
  function drawSec() { const b = $('bio-btn'); if (b) b.innerHTML = lkGet() ? '<i class="fa-solid fa-fingerprint ms-1.5"></i>إلغاء القفل بالبصمة' : '<i class="fa-solid fa-fingerprint ms-1.5"></i>تفعيل القفل بالبصمة'; }
  function lockUI() {
    if ($('lock-ov')) return;
    document.body.insertAdjacentHTML('beforeend', '<div id="lock-ov" class="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 bg-slate-950 p-6 text-center text-white"><i class="fa-solid fa-lock text-4xl text-teal-400"></i><div class="font-bold">التطبيق مقفول</div><button id="lock-go" type="button" class="rounded-xl bg-teal-600 px-6 py-3 font-bold"><i class="fa-solid fa-fingerprint ms-2"></i>افتح بالبصمة</button><button type="button" onclick="lockLogout()" class="text-xs text-slate-400 hover:text-white">تسجيل الخروج</button></div>');
    $('lock-go').onclick = unlock; unlock();
  }
  window.lockLogout = function () { lkSet(null); const o = $('lock-ov'); if (o) o.remove(); handleLogout(); };
  async function unlock() {
    const id = lkGet(); if (!id) { const o = $('lock-ov'); if (o) o.remove(); return; }
    try {
      await navigator.credentials.get({ publicKey: { challenge: rnd(), rpId: location.hostname, allowCredentials: [{ type: 'public-key', id: unb64u(id), transports: ['internal'] }], userVerification: 'required', timeout: 60000 } });
      const o = $('lock-ov'); if (o) o.remove();
    } catch (e) { /* يفضل مقفول لحد ما يعيد المحاولة */ }
  }
  const _sa = window.showAppScreen;
  window.showAppScreen = function (u) { _sa.apply(this, arguments); if (!fresh && currentUser && lkGet()) lockUI(); if (recovery && !$('pw-modal')) setTimeout(() => pwModal('recovery'), 600); };
  const _hl = window.handleLogin;
  window.handleLogin = function () { fresh = true; return _hl.apply(this, arguments); };
  const _lo = window.handleLogout;
  window.handleLogout = function () { fresh = false; const o = $('lock-ov'); if (o) o.remove(); return _lo.apply(this, arguments); };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (currentUser && lkGet() && hiddenAt && Date.now() - hiddenAt > 120000) lockUI();
  });

  /* حقن قسم الأمان في نافذة حسابي */
  const _om = window.openMeModal;
  window.openMeModal = function () {
    _om.apply(this, arguments);
    if ($('sec-box')) { drawSec(); return; }
    const sv = $('me-save-btn'); if (!sv) return;
    const anchor = sv.parentElement && sv.parentElement.tagName !== 'FORM' ? sv.parentElement : sv;
    anchor.insertAdjacentHTML('beforebegin', '<div id="sec-box" class="space-y-2 rounded-xl border border-slate-200 dark:border-slate-700 p-3"><div class="text-xs font-bold text-slate-500">الأمان</div><button type="button" onclick="pwOpen()" class="w-full rounded-xl bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200"><i class="fa-solid fa-key ms-1.5"></i>تغيير كلمة المرور</button><button id="bio-btn" type="button" onclick="bioToggle()" class="w-full rounded-xl bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200"></button><p class="text-[10px] text-slate-400">القفل بالبصمة بيشتغل على الجهاز ده بس، ويتطلب بصمة لو التطبيق اتساب أكتر من دقيقتين.</p></div>');
    drawSec();
  };
  const _lo2 = window.handleLogout;
  window.handleLogout = function () { notes = []; loadedFor = null; editing = null; return _lo2.apply(this, arguments); };
})();
