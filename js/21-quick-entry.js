/* =====================================================================
   المرحلة 19: الإدخال السريع
   1) بحث Ctrl+K (معاملات + عملاء + تابات + أوامر)       2) تكرار آخر معاملة للعميل
   3) مسودة تلقائية للفورم                               4) اقتراح السعر والتكلفة وتنبيه الأسعار الغريبة
   5) اختصارات كيبورد                                    6) إكمال تلقائي مرتب بالاستخدام
   7) تنبيه لو نفس العميل سجّل نفس الخدمة قريب
   القواعد: مفيش استعلامات جديدة على قاعدة البيانات (كله من البيانات المحمّلة أصلاً)،
   ومفيش أي أنيميشن دايم، وكل ميزة معزولة بـ try/catch علشان لو واحدة وقعت الباقي يكمّل.
   ===================================================================== */
(function () {
  if (window.__phase19) return; window.__phase19 = true;
  const eh = escapeHtml, num = v => Number(v) || 0;
  const AR = '٠١٢٣٤٥٦٧٨٩';
  const digits = s => String(s == null ? '' : s).replace(/[٠-٩]/g, d => AR.indexOf(d));
  const norm = s => digits(typeof normName === 'function' ? normName(s) : String(s || '').toLowerCase());
  const phoneKey = s => digits(s).replace(/\D/g, '');
  const safe = (n, f) => function () { try { return f.apply(this, arguments); } catch (e) { console.warn('p19 ' + n, e); } };
  const live = () => !!(window.currentUser || (typeof currentUser !== 'undefined' && currentUser)) && window.__role !== 'partner' && $('app') && !$('app').classList.contains('hidden');
  const tsOf = l => { const t = new Date(typeof lineDate === 'function' ? lineDate(l) : (l.received_at || l.created_at)).getTime(); return isNaN(t) ? 0 : t; };
  const ago = t => { const m = Math.max(0, Math.round((Date.now() - t) / 6e4)); if (m < 1) return 'دلوقتي'; if (m < 60) return 'منذ ' + m + ' دقيقة'; const h = Math.round(m / 60); if (h < 24) return 'منذ ' + h + ' ساعة'; return 'منذ ' + Math.round(h / 24) + ' يوم'; };
  const money = v => formatCurrency(v);
  const tab = () => (typeof currentTab !== 'undefined' ? currentTab : 'new');
  const typing = t => !!(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)));
  const lineEls = () => Array.from(($('lines-container') || { children: [] }).children);
  const val = (el, sel) => { const x = el.querySelector(sel); return x ? x.value : ''; };
  const setV = (el, sel, v) => { const x = el.querySelector(sel); if (x) x.value = v == null ? '' : v; };
  const fire = (el, type) => { if (el) el.dispatchEvent(new Event(type, { bubbles: true })); };

  /* ---------------------------------------------------------------
     0) فهارس خفيفة (بتتبني مرة لكل تحديث بيانات)
     --------------------------------------------------------------- */
  let svcIdx = null, svcSrc = null, svcLen = -1;
  function svcStats() {
    if (svcIdx && svcSrc === groupedOrders && svcLen === allRequestLines.length) return svcIdx;
    const m = new Map();
    allRequestLines.forEach(l => {
      const k = norm(l.service); if (!k) return;
      const price = num(l.discount_pct) > 0 && num(l.list_price) > 0 ? num(l.list_price) : num(l.unit_price), t = tsOf(l);
      let e = m.get(k); if (!e) { e = { n: 0, last: null }; m.set(k, e); }
      e.n++; if (!e.last || t > e.last.t) e.last = { t, price, cost: num(l.exec_unit_cost), exec: (l.executor || '').trim(), tx: l.transaction_id };
    });
    svcIdx = m; svcSrc = groupedOrders; svcLen = allRequestLines.length; return m;
  }
  const catalogOf = name => { const k = norm(name); return k ? allServices.find(s => norm(s.name) === k) : null; };
  const orderTime = o => { let t = 0; o.lines.forEach(l => { const x = tsOf(l); if (x > t) t = x; }); return t; };
  function lastOrderFor(name, phone) {
    const nk = norm(name), pk = phoneKey(phone); if (nk.length < 2 && pk.length < 8) return null;
    let best = null, bt = -1;
    groupedOrders.forEach(o => {
      const same = (nk.length >= 2 && norm(o.client_name) === nk) || (pk.length >= 8 && phoneKey(o.phone) === pk);
      if (!same) return; const t = orderTime(o); if (t > bt) { bt = t; best = o; }
    });
    return best ? { o: best, t: bt } : null;
  }

  /* ---------------------------------------------------------------
     1) الفورم: تنضيف / تعبئة / تكرار
     --------------------------------------------------------------- */
  const isDirty = () => !!(['client-name', 'phone', 'address', 'rn-nm', 'notes', 'discount-pct'].some(id => $(id) && $(id).value.trim()) || lineEls().some(el => val(el, '.svc-name').trim()));
  const linesEmpty = () => !lineEls().some(el => val(el, '.svc-name').trim());
  function resetLines() { $('lines-container').innerHTML = ''; try { serviceLineCounter = 0; } catch (e) { /* */ } addServiceLine(); }
  function nowLocal() { const n = new Date(); n.setMinutes(n.getMinutes() - n.getTimezoneOffset()); return n.toISOString().slice(0, 16); }
  function setClient(name, phone, address) {
    $('client-name').value = name || ''; $('phone').value = phone || ''; $('address').value = address || '';
    $('s-client').textContent = name || '—'; if (typeof onPhoneInput === 'function') onPhoneInput(phone || '');
  }
  function fillLine(el, l) {
    setV(el, '.svc-name', l.service);
    if (typeof onServiceSelected === 'function') onServiceSelected(el.id, l.service || '');
    setV(el, '.svc-qty', num(l.qty) || 1);
    if (!catalogOf(l.service)) {
      setV(el, '.svc-price', num(l.discount_pct) > 0 && num(l.list_price) > 0 ? num(l.list_price) : num(l.unit_price));
      setV(el, '.svc-disc', num(l.discount_pct) > 0 ? num(l.discount_pct) : '');
      setV(el, '.svc-cost', num(l.exec_unit_cost)); setV(el, '.svc-executor', l.executor || '');
      if (l.commission_per_unit != null) el.dataset.comm = l.commission_per_unit;
      if (l.duration_days != null) el.dataset.dur = l.duration_days;
    }
  }
  function newRequest(force) {
    if (!live()) return;
    if (!force && isDirty() && !confirm('فيه بيانات مكتوبة في الفورم، هتتمسح وتبدأ معاملة جديدة. تكمل؟')) return;
    switchTab('new'); ['client-name', 'phone', 'address', 'rn-nm', 'notes', 'discount-pct'].forEach(id => { if ($(id)) $(id).value = ''; });
    $('client-whatsapp-box').classList.add('hidden'); $('s-client').textContent = '—';
    generateNewTxId(); resetLines(); $('received-at').value = nowLocal(); calculateTotals(); clearDraft(); hideLast(); hideDup();
    setTimeout(() => { const i = $('client-name'); if (i) { i.focus(); i.scrollIntoView({ block: 'center' }); } }, 40);
  }
  function repeatTx(tx, linesOnly) {
    const o = groupedOrders.find(g => String(g.transaction_id) === String(tx)); if (!o) return showToast('المعاملة مش لاقيها في البيانات المحمّلة', 'error');
    if (!live()) return;
    if (linesOnly) { if (!linesEmpty() && !confirm('البنود المكتوبة هتتبدل ببنود المعاملة السابقة. تكمل؟')) return; }
    else if (isDirty() && !confirm('فيه بيانات مكتوبة في الفورم، هتتمسح. تكمل؟')) return;
    switchTab('new');
    if (!linesOnly) { setClient(o.client_name, o.phone, o.address); generateNewTxId(); $('rn-nm').value = ''; $('notes').value = ''; $('discount-pct').value = ''; $('received-at').value = nowLocal(); }
    $('lines-container').innerHTML = ''; try { serviceLineCounter = 0; } catch (e) { /* */ }
    o.lines.forEach(l => { addServiceLine(); fillLine($('lines-container').lastElementChild, l); });
    if (!linesOnly && o.payment_method && typeof selectPaymentMethod === 'function') selectPaymentMethod(o.payment_method);
    calculateTotals(); lineEls().forEach(updateHint); checkDup(); hideLast();
    showToast('اتكرّر ' + o.lines.length + ' بند من ' + o.transaction_id + ' — راجع الأسعار والأعداد قبل الحفظ', 'info', 6000);
    setTimeout(() => { const f = $('lines-container'); if (f) f.scrollIntoView({ block: 'center' }); }, 40);
  }
  function startForClient(name) {
    const lo = lastOrderFor(name, '');
    if (!live()) return;
    newRequest(false); if ($('client-name').value) return;
    setClient(name, lo ? lo.o.phone : '', lo ? lo.o.address : ''); updateLast();
  }

  /* ---------------------------------------------------------------
     2) شريحة "آخر معاملة للعميل" + تكرار البنود
     --------------------------------------------------------------- */
  function ensureLastChip() {
    let c = $('qk-last'); if (c) return c; const host = $('client-name') && $('client-name').parentElement; if (!host) return null;
    c = document.createElement('div'); c.id = 'qk-last'; c.className = 'qk-last hidden'; host.appendChild(c); return c;
  }
  function hideLast() { const c = $('qk-last'); if (c) c.classList.add('hidden'); }
  const updateLast = safe('last', function () {
    const c = ensureLastChip(); if (!c) return;
    const r = lastOrderFor($('client-name').value, $('phone').value);
    if (!r) return c.classList.add('hidden');
    const o = r.o, sv = o.lines.slice(0, 2).map(l => l.service).join('، ') + (o.lines.length > 2 ? ' +' + (o.lines.length - 2) : '');
    c.innerHTML = '<span class="qk-last-t"><i class="fa-solid fa-clock-rotate-left"></i><span>آخر معاملة <b dir="ltr">' + eh(o.transaction_id) + '</b> · ' + eh(sv) + ' · ' + money(o.grand_total) + ' · ' + ago(r.t) + '</span></span>' +
      '<button type="button" class="qk-btn" data-qk-repeat="' + eh(o.transaction_id) + '"><i class="fa-solid fa-copy"></i> كرّر البنود</button>';
    c.classList.remove('hidden');
  });

  /* ---------------------------------------------------------------
     3) المسودة التلقائية
     --------------------------------------------------------------- */
  const draftKey = () => 'p19_draft_' + ((window.currentUser || (typeof currentUser !== 'undefined' && currentUser) || {}).id || 'x');
  const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* */ } }, del: k => { try { localStorage.removeItem(k); } catch (e) { /* */ } } };
  function snapshot() {
    const g = id => ($(id) ? $(id).value : '');
    return { t: Date.now(), f: { client: g('client-name'), phone: g('phone'), address: g('address'), rn: g('rn-nm'), notes: g('notes'), disc: g('discount-pct'), recv: g('receiver'), pay: g('payment-method-val') },
      lines: lineEls().map(el => ({ s: val(el, '.svc-name'), q: val(el, '.svc-qty'), p: val(el, '.svc-price'), c: val(el, '.svc-cost'), x: val(el, '.svc-executor'), n: val(el, '.svc-notes'), d: val(el, '.svc-disc'), r: val(el, '.svc-ref'), comm: el.dataset.comm, dur: el.dataset.dur })) };
  }
  const meaningful = d => !!(d && (d.f.client.trim() || d.f.phone.trim() || d.f.notes.trim() || d.lines.some(l => l.s.trim() || l.n.trim())));
  const saveDraft = safe('draft', function () { if (!live() || !$('req-form')) return; const d = snapshot(); if (meaningful(d)) store.set(draftKey(), JSON.stringify(d)); else store.del(draftKey()); });
  function clearDraft() { store.del(draftKey()); const b = $('qk-draft'); if (b) b.remove(); }
  let dTimer = 0;
  const queueDraft = () => { clearTimeout(dTimer); dTimer = setTimeout(saveDraft, 1200); };
  function applyDraft(d) {
    switchTab('new'); const f = d.f;
    setClient(f.client, f.phone, f.address); $('rn-nm').value = f.rn || ''; $('notes').value = f.notes || ''; $('discount-pct').value = f.disc || ''; $('receiver').value = f.recv || '';
    if (f.pay && typeof selectPaymentMethod === 'function') selectPaymentMethod(f.pay);
    $('lines-container').innerHTML = ''; try { serviceLineCounter = 0; } catch (e) { /* */ }
    (d.lines.length ? d.lines : [{}]).forEach(l => {
      addServiceLine(); const el = $('lines-container').lastElementChild;
      setV(el, '.svc-name', l.s); setV(el, '.svc-qty', l.q || 1); setV(el, '.svc-price', l.p || 0); setV(el, '.svc-cost', l.c || 0); setV(el, '.svc-executor', l.x); setV(el, '.svc-notes', l.n); setV(el, '.svc-disc', l.d || ''); setV(el, '.svc-ref', l.r || '');
      if (l.comm != null && l.comm !== '') el.dataset.comm = l.comm; if (l.dur != null && l.dur !== '') el.dataset.dur = l.dur;
    });
    calculateTotals(); lineEls().forEach(updateHint); checkDup(); updateLast();
  }
  const offerDraft = safe('offer', function () {
    const raw = store.get(draftKey()); if (!raw || !$('req-form')) return;
    let d; try { d = JSON.parse(raw); } catch (e) { return store.del(draftKey()); }
    if (!meaningful(d) || Date.now() - d.t > 864e5) return store.del(draftKey());
    if (isDirty() || $('qk-draft')) return;
    const bar = document.createElement('div'); bar.id = 'qk-draft'; bar.className = 'qk-bar';
    bar.innerHTML = '<span class="qk-bar-t"><i class="fa-solid fa-floppy-disk"></i><span>فيه مسودة معاملة محفوظة' + (d.f.client ? ' لـ «' + eh(d.f.client) + '»' : '') + ' (' + ago(d.t) + ')</span></span><span class="qk-bar-b"><button type="button" class="qk-btn" data-qk="draft-restore">استرجاع</button><button type="button" class="qk-btn qk-ghost" data-qk="draft-drop">مسح</button></span>';
    bar._d = d; $('req-form').insertAdjacentElement('beforebegin', bar);
  });

  /* ---------------------------------------------------------------
     4) اقتراح السعر والتكلفة + تنبيه الأسعار الغريبة (تحت خانة السعر)
     --------------------------------------------------------------- */
  function decorateLine(el) {
    if (!el || el.querySelector('.qk-hint')) return;
    const p = el.querySelector('.svc-price'); if (!p || !p.parentElement) return;
    const h = document.createElement('div'); h.className = 'qk-hint hidden'; p.parentElement.appendChild(h);
  }
  function updateHint(el) {
    if (!el || !el.querySelector) return; decorateLine(el); const h = el.querySelector('.qk-hint'); if (!h) return;
    const name = val(el, '.svc-name').trim(), cur = num(val(el, '.svc-price')), st = name ? svcStats().get(norm(name)) : null, last = st && st.last, cat = name ? catalogOf(name) : null;
    let html = '', cls = 'info';
    const useBtn = (p, label) => '<button type="button" class="qk-lnk" data-qk-price="' + p + '">' + label + '</button>';
    if (!name) { h.classList.add('hidden'); return; }
    if (cur <= 0) {
      if (last && last.price > 0) { html = 'السعر صفر. آخر مرة اتباعت بـ <b>' + money(last.price) + '</b> ' + useBtn(last.price, 'استخدمه'); cls = 'warn'; }
      else if (!cat) { html = 'خدمة مش في الكتالوج والسعر صفر — اتأكد قبل الحفظ'; cls = 'warn'; }
      else { html = 'السعر صفر — اتأكد قبل الحفظ'; cls = 'warn'; }
    } else if (last && last.price > 0 && Math.abs(cur - last.price) / last.price > 0.25) {
      const d = Math.round(Math.abs(cur - last.price) / last.price * 100);
      html = 'السعر ' + (cur < last.price ? 'أقل' : 'أعلى') + ' من آخر مرة (' + money(last.price) + ') بنسبة <b>' + d + '%</b> ' + useBtn(last.price, 'رجّع القديم'); cls = 'warn';
    } else if (cat && last && last.price > 0 && num(cat.unit_price) > 0 && Math.abs(num(cat.unit_price) - last.price) / last.price > 0.1 && cur === num(cat.unit_price)) {
      html = 'سعر الكتالوج ' + money(cat.unit_price) + ' بس آخر مرة اتباعت بـ <b>' + money(last.price) + '</b> ' + useBtn(last.price, 'استخدمه');
    } else if (!cat && last && last.price > 0 && Math.abs(cur - last.price) / last.price > 0.1) {
      html = 'آخر سعر لنفس الخدمة <b>' + money(last.price) + '</b> ' + useBtn(last.price, 'استخدمه');
    }
    if (!html) { h.classList.add('hidden'); return; }
    h.className = 'qk-hint ' + cls; h.innerHTML = html;
  }
  let hTimer = 0;
  const queueHint = el => { clearTimeout(hTimer); hTimer = setTimeout(() => { try { updateHint(el); } catch (e) { /* */ } }, 160); };

  /* ---------------------------------------------------------------
     5) تنبيه التكرار: نفس العميل + نفس الخدمة قريب
     --------------------------------------------------------------- */
  let dismissed = '';
  function hideDup() { const d = $('qk-dup'); if (d) d.classList.add('hidden'); }
  const checkDup = safe('dup', function () {
    const host = $('lines-container'); if (!host) return;
    let box = $('qk-dup'); if (!box) { box = document.createElement('div'); box.id = 'qk-dup'; box.className = 'qk-dup hidden'; host.insertAdjacentElement('beforebegin', box); }
    const nk = norm($('client-name').value), pk = phoneKey($('phone').value), svc = lineEls().map(el => norm(val(el, '.svc-name'))).filter(Boolean);
    if (!svc.length || (nk.length < 3 && pk.length < 8)) return box.classList.add('hidden');
    const now = Date.now(), hits = [], cur = ($('tx-id') || {}).value;
    for (const o of groupedOrders) {
      if (String(o.transaction_id) === String(cur)) continue;
      const same = (pk.length >= 8 && phoneKey(o.phone) === pk) || (nk.length >= 3 && norm(o.client_name) === nk); if (!same) continue;
      const t = orderTime(o), age = now - t; if (!t || age > 14 * 864e5) continue;
      const common = o.lines.filter(l => svc.includes(norm(l.service))); if (!common.length) continue;
      const open = o.lines.some(l => (l.status || 'In Progress') !== 'Delivered');
      if (age <= 48 * 36e5 || open) hits.push({ o, common, t, open });
      if (hits.length >= 3) break;
    }
    const sig = hits.map(h => h.o.transaction_id).join(',');
    if (!hits.length || sig === dismissed) return box.classList.add('hidden');
    box.innerHTML = '<div class="qk-dup-h"><span><i class="fa-solid fa-triangle-exclamation"></i> ممكن تكون معاملة مكررة</span><button type="button" class="qk-x2" data-qk-dismiss="' + eh(sig) + '" aria-label="تجاهل"><i class="fa-solid fa-xmark"></i></button></div>' +
      hits.map(h => '<div class="qk-dup-r">نفس العميل سجّل <b>' + eh([...new Set(h.common.map(l => l.service))].join('، ')) + '</b> ' + ago(h.t) + (h.open ? ' وحالتها لسه مفتوحة' : '') + ' — <button type="button" class="qk-lnk" data-qk-tx="' + eh(h.o.transaction_id) + '" dir="ltr">' + eh(h.o.transaction_id) + '</button></div>').join('');
    box.classList.remove('hidden');
  });
  let cTimer = 0;
  const queueCheck = () => { clearTimeout(cTimer); cTimer = setTimeout(() => { checkDup(); updateLast(); }, 350); };

  /* ---------------------------------------------------------------
     6) إكمال تلقائي مرتب (العملاء الأحدث أولاً، الخدمات الأكتر استخدامًا أولاً)
     --------------------------------------------------------------- */
  const enhanceLists = safe('lists', function () {
    const byName = new Map(), byPhone = new Map();
    allRequestLines.forEach(l => {
      const t = tsOf(l), n = (l.client_name || '').trim(), p = (l.phone || '').trim();
      if (n) { const e = byName.get(n); if (!e || t > e.t) byName.set(n, { t, p }); }
      if (p) { const e = byPhone.get(p); if (!e || t > e.t) byPhone.set(p, { t, n }); }
    });
    const top = (m, k) => [...m.entries()].sort((a, b) => b[1].t - a[1].t).slice(0, 1500).map(([v, e]) => '<option value="' + eh(v) + '" label="' + eh(e[k] || '') + '"></option>').join('');
    if ($('clients-datalist')) $('clients-datalist').innerHTML = top(byName, 'p');
    if ($('phones-datalist')) $('phones-datalist').innerHTML = top(byPhone, 'n');
    const st = svcStats();
    if ($('svc-datalist') && allServices.length) {
      const arr = allServices.slice().sort((a, b) => ((st.get(norm(b.name)) || {}).n || 0) - ((st.get(norm(a.name)) || {}).n || 0) || String(a.name).localeCompare(String(b.name), 'ar'));
      $('svc-datalist').innerHTML = arr.map(s => { const u = st.get(norm(s.name)); return '<option value="' + eh(s.name) + '" label="' + eh((s.unit_price != null ? fmtNum(s.unit_price) + ' ج.م' : '') + (u ? ' · اتطلبت ' + u.n + ' مرة' : '')) + '"></option>'; }).join('');
    }
  });

  /* ---------------------------------------------------------------
     7) البحث السريع Ctrl+K
     --------------------------------------------------------------- */
  let ix = null, ixSrc = null, rows = [], act = 0, prevFocus = null;
  const TABS_SKIP = { partners: 0 };
  function buildIndex() {
    if (ix && ixSrc === groupedOrders) return ix;
    const tx = [], cl = new Map();
    groupedOrders.forEach(o => {
      const t = orderTime(o), sv = [...new Set(o.lines.map(l => l.service))];
      tx.push({ t, o, hay: norm([o.transaction_id, o.client_name, o.phone, o.rn_nm, o.employee, o.receiver, ...sv].join(' ')) });
      const k = norm(o.client_name); if (!k) return; let c = cl.get(k);
      if (!c) { c = { name: o.client_name, phone: o.phone || '', n: 0, t: 0, sum: 0, hay: norm((o.client_name || '') + ' ' + (o.phone || '')) }; cl.set(k, c); }
      c.n++; c.sum += num(o.grand_total); if (t > c.t) { c.t = t; if (o.phone) c.phone = o.phone; }
    });
    tx.sort((a, b) => b.t - a.t); ixSrc = groupedOrders;
    ix = { tx, cl: [...cl.values()].sort((a, b) => b.t - a.t) }; return ix;
  }
  function commands() {
    const c = [
      { ic: 'fa-plus', t: 'معاملة جديدة', s: 'Alt+N · يفضّي الفورم ويبدأ من الأول', k: 'جديد اضافه طلب معامله', run: () => newRequest(false) },
      { ic: 'fa-layer-group', t: 'إضافة بند خدمة', s: 'Alt+A', k: 'بند خدمه اضافه', run: () => { switchTab('new'); addServiceLine(); const l = lineEls().pop(); if (l) { const i = l.querySelector('.svc-name'); i && i.focus(); } } },
      { ic: 'fa-floppy-disk', t: 'حفظ المعاملة', s: 'Ctrl+Enter', k: 'حفظ سجل', run: () => { switchTab('new'); const b = $('save-btn'); if (b && !b.disabled) b.click(); } },
      { ic: 'fa-copy', t: 'تكرار آخر معاملة', s: 'يفتح آخر معاملة اتسجلت كمعاملة جديدة', k: 'تكرار نسخ اخر', run: () => { const x = buildIndex().tx[0]; if (x) repeatTx(x.o.transaction_id); } },
      { ic: 'fa-rotate-right', t: 'توليد رقم معاملة جديد', s: '', k: 'رقم معامله توليد', run: () => { switchTab('new'); generateNewTxId(true); } },
      { ic: 'fa-circle-half-stroke', t: 'تبديل الوضع الليلي / النهاري', s: '', k: 'ليلي نهاري داكن مظلم', run: () => toggleDarkMode() },
      { ic: 'fa-arrows-rotate', t: 'تحديث البيانات', s: '', k: 'تحديث اعاده تحميل', run: () => loadRecentRequests() },
      { ic: 'fa-keyboard', t: 'اختصارات الكيبورد', s: 'علامة ؟', k: 'اختصارات كيبورد مساعده', run: () => helpOpen() }
    ];
    if (window.aiToggle && $('ai-fab')) c.push({ ic: 'fa-wand-magic-sparkles', t: 'اسأل السيستم (AI)', s: '', k: 'ذكاء اصطناعي اسال', run: () => aiToggle() });
    return c.map(x => Object.assign(x, { kind: 'cmd', hay: norm(x.t + ' ' + x.k) }));
  }
  function tabs() {
    const out = [], seen = new Set();
    document.querySelectorAll('#nav-menu .tab-btn, #hdr-shortcuts .tab-btn, [id^="tab-"][id$="-btn"]').forEach(b => {
      if (b.classList.contains('hidden')) return;
      const id = (b.id && b.id.startsWith('tab-') && b.id.endsWith('-btn')) ? b.id.slice(4, -4) : (b.getAttribute('data-tab-target') || '');
      if (id && TABS_SKIP[id] === 1) return;
      const sp = Array.from(b.querySelectorAll('span')).find(s => !s.id && !/rounded-full/.test(s.className) && s.textContent.trim()), ic = b.querySelector('i');
      const t = sp ? sp.textContent.trim() : b.textContent.trim();
      if (!t || seen.has(t)) return;
      seen.add(t);
      const icCls = ic ? (ic.className.split(' ').find(c => c.startsWith('fa-') && c !== 'fa-solid' && c !== 'fa-regular') || 'fa-window-maximize') : 'fa-window-maximize';
      out.push({ kind: 'tab', ic: icCls, t: 'شاشة: ' + t, s: 'انتقال مباشر', hay: norm(t + ' تاب شاشة قائمة ' + id), run: () => { if (id && typeof switchTab === 'function') switchTab(id); else b.click(); if (typeof closeNavMenu === 'function') closeNavMenu(); } });
    });
    [
      ['abbasiya', 'رادار جوازات العباسية', 'fa-passport'],
      ['live_radar', 'رادار المناديب المباشر', 'fa-satellite-dish'],
      ['pickup', 'تيكتات الاستلام', 'fa-ticket'],
      ['ops3', 'عمليات اليوم والإنقاذ', 'fa-sliders'],
      ['analytics5', 'تحليلات المناطق والأداء', 'fa-chart-column']
    ].forEach(([sub, lbl, icCls]) => {
      if (seen.has(lbl)) return;
      seen.add(lbl);
      out.push({ kind: 'tab', ic: icCls, t: 'العمليات: ' + lbl, s: 'تبويب داخل العمليات', hay: norm(lbl + ' عمليات رادار'), run: () => {
        if (typeof switchTab === 'function') switchTab('radar');
        setTimeout(() => {
          const el = sub === 'ops3' ? $('rp3-nav-btn') : sub === 'analytics5' ? $('p5-nav-btn') : document.querySelector('[data-ah-nav="' + sub + '"]');
          if (el) el.click();
        }, 120);
      } });
    });
    return out;
  }
  function results(q) {
    const I = buildIndex(), qn = norm(q), tk = qn.split(' ').filter(Boolean), all = commands().concat(tabs());
    const hit = h => tk.every(t => h.includes(t));
    if (!tk.length) {
      return { g: [['إجراءات سريعة', all.filter(x => x.kind === 'cmd').slice(0, 6)], ['آخر المعاملات', I.tx.slice(0, 6).map(txItem)]] };
    }
    const strong = all.filter(x => hit(x.hay)).slice(0, 6);
    const rest = all.filter(x => hit(x.hay) && !strong.includes(x)).slice(0, 6);
    const rank = (a, b) => { const ae = a.hay.split(' ').includes(tk[0]) ? 1 : 0, be = b.hay.split(' ').includes(tk[0]) ? 1 : 0; return be - ae || b.t - a.t; };
    const tx = I.tx.filter(x => hit(x.hay)).sort(rank).slice(0, 8).map(txItem);
    const cl = I.cl.filter(x => hit(x.hay)).slice(0, 4).map(c => ({ kind: 'client', ic: 'fa-user', t: c.name, s: [c.phone, c.n + ' معاملة', money(c.sum), ago(c.t)].filter(Boolean).join(' · '), run: () => openClientModal(c.name), alt: { label: 'طلب جديد', run: () => startForClient(c.name) } }));
    return { g: [['انتقال سريع', strong], ['معاملات', tx], ['عملاء', cl], ['أوامر وتابات', rest]] };
  }
  function txItem(x) {
    const o = x.o, sv = [...new Set(o.lines.map(l => l.service))], open = o.lines.some(l => (l.status || 'In Progress') !== 'Delivered');
    return { kind: 'tx', ic: 'fa-file-invoice', t: (o.client_name || '—') + ' · ' + o.transaction_id, s: [sv.slice(0, 2).join('، ') + (sv.length > 2 ? ' +' + (sv.length - 2) : ''), money(o.grand_total), ago(x.t), open ? 'مفتوحة' : 'اتسلّمت'].filter(Boolean).join(' · '), run: () => openTxModal(o.transaction_id), alt: { label: 'كرّر', run: () => repeatTx(o.transaction_id) } };
  }
  const KC = { cmd: '245,158,11', tab: '100,116,139', tx: '13,148,136', client: '37,99,235' };
  function ensureOv() {
    let ov = $('qk-ov'); if (ov) return ov;
    ov = document.createElement('div'); ov.id = 'qk-ov'; ov.className = 'qk-ov hidden'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'بحث سريع');
    ov.innerHTML = '<div class="qk-box"><div class="qk-top"><i class="fa-solid fa-magnifying-glass"></i><input id="qk-in" type="text" autocomplete="off" spellcheck="false" placeholder="ابحث عن معاملة أو عميل أو تليفون، أو اكتب أمر..." aria-controls="qk-list"><button type="button" class="qk-x" data-qk="close" aria-label="إغلاق"><i class="fa-solid fa-xmark"></i></button></div><div id="qk-list" class="qk-list" role="listbox"></div><div class="qk-foot"><span><kbd>↑</kbd><kbd>↓</kbd> تنقّل</span><span><kbd>Enter</kbd> فتح</span><span><kbd>Shift</kbd>+<kbd>Enter</kbd> الخيار التاني</span><span><kbd>Esc</kbd> إغلاق</span></div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('mousedown', e => { if (e.target === ov) qkClose(); });
    const inp = ov.querySelector('#qk-in');
    inp.addEventListener('input', () => { act = 0; paintResults(); });
    inp.addEventListener('keydown', e => {
      if (e.isComposing) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!rows.length) return; act = (act + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length; markActive(true); }
      else if (e.key === 'Enter') { e.preventDefault(); const r = rows[act]; if (r) runRow(r, e.shiftKey); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); qkClose(); }
    });
    ov.querySelector('#qk-list').addEventListener('click', e => {
      const alt = e.target.closest('[data-alt]'), it = e.target.closest('[data-i]'); if (!it) return;
      const r = rows[+it.dataset.i]; if (r) runRow(r, !!alt);
    });
    ov.querySelector('#qk-list').addEventListener('mousemove', e => { const it = e.target.closest('[data-i]'); if (it && +it.dataset.i !== act) { act = +it.dataset.i; markActive(false); } });
    return ov;
  }
  function runRow(r, alt) { const f = alt && r.alt ? r.alt.run : r.run; qkClose(true); try { f(); } catch (e) { console.warn('p19 run', e); showToast('تعذّر تنفيذ الأمر', 'error'); } }
  function markActive(scroll) {
    const list = $('qk-list'); if (!list) return;
    list.querySelectorAll('.qk-it.on').forEach(x => x.classList.remove('on'));
    const el = list.querySelector('[data-i="' + act + '"]'); if (el) { el.classList.add('on'); if (scroll) el.scrollIntoView({ block: 'nearest' }); }
  }
  function paintResults() {
    const list = $('qk-list'), q = $('qk-in').value, R = results(q); rows = []; let h = '';
    R.g.forEach(g => {
      if (!g[1].length) return; h += '<div class="qk-gh">' + g[0] + '</div>';
      g[1].forEach(x => { const i = rows.push(x) - 1; h += '<div class="qk-it' + (i === act ? ' on' : '') + '" role="option" data-i="' + i + '"><span class="qk-ic" style="--c:' + KC[x.kind] + '"><i class="fa-solid ' + eh(x.ic) + '"></i></span><span class="qk-tx"><b>' + eh(x.t) + '</b>' + (x.s ? '<small>' + eh(x.s) + '</small>' : '') + '</span>' + (x.alt ? '<button type="button" class="qk-alt" data-alt="' + i + '" tabindex="-1">' + eh(x.alt.label) + '</button>' : '') + '</div>'; });
    });
    list.innerHTML = h || '<div class="qk-empty">مفيش نتائج لـ «' + eh(q) + '»</div>';
  }
  function qkOpen() {
    if (!live()) return; const ov = ensureOv(); if (!ov.classList.contains('hidden')) return qkClose();
    prevFocus = document.activeElement; ov.classList.remove('hidden'); act = 0; const i = $('qk-in'); i.value = ''; paintResults(); setTimeout(() => i.focus(), 20);
  }
  function qkClose(keepFocus) { const ov = $('qk-ov'); if (!ov) return; ov.classList.add('hidden'); if (!keepFocus && prevFocus && prevFocus.focus) { try { prevFocus.focus(); } catch (e) { /* */ } } }
  window.qkOpen = qkOpen; window.qkClose = qkClose;

  /* ---------------------------------------------------------------
     8) شاشة الاختصارات
     --------------------------------------------------------------- */
  const SC = [['Ctrl + K', 'بحث سريع في كل حاجة'], ['Alt + N', 'معاملة جديدة'], ['Alt + A', 'إضافة بند خدمة'], ['Ctrl + Enter', 'حفظ المعاملة'], ['؟  (Shift + /)', 'عرض الاختصارات دي'], ['Esc', 'إغلاق أي نافذة']];
  function helpOpen() {
    let h = $('qk-help'); if (!h) {
      h = document.createElement('div'); h.id = 'qk-help'; h.className = 'qk-ov hidden'; h.setAttribute('role', 'dialog'); h.setAttribute('aria-modal', 'true');
      h.innerHTML = '<div class="qk-box qk-small"><div class="qk-top"><i class="fa-solid fa-keyboard"></i><b class="qk-ttl">اختصارات الكيبورد</b><button type="button" class="qk-x" data-qk="help-close" aria-label="إغلاق"><i class="fa-solid fa-xmark"></i></button></div><div class="qk-sc">' + SC.map(s => '<div><span>' + s[1] + '</span><kbd dir="ltr">' + s[0] + '</kbd></div>').join('') + '</div></div>';
      document.body.appendChild(h); h.addEventListener('mousedown', e => { if (e.target === h) helpClose(); });
    }
    h.classList.remove('hidden');
  }
  function helpClose() { const h = $('qk-help'); if (h) h.classList.add('hidden'); }

  /* ---------------------------------------------------------------
     9) الأحداث العامة
     --------------------------------------------------------------- */
  document.addEventListener('keydown', function (e) {
    if (e.isComposing || !live()) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.code === 'KeyK') { e.preventDefault(); qkOpen(); return; }
    if (e.altKey && !ctrl && e.code === 'KeyN') { e.preventDefault(); newRequest(false); return; }
    if (e.altKey && !ctrl && e.code === 'KeyA' && tab() === 'new') { e.preventDefault(); addServiceLine(); const l = lineEls().pop(); if (l) { const i = l.querySelector('.svc-name'); i && i.focus(); } return; }
    if (ctrl && e.key === 'Enter' && tab() === 'new') {
      const t = e.target, inForm = t === document.body || (t.closest && t.closest('#req-form'));
      if (inForm) { e.preventDefault(); const b = $('save-btn'); if (b && !b.disabled) b.click(); }
      return;
    }
    if (e.code === 'Slash' && e.shiftKey && !ctrl && !e.altKey && !typing(e.target)) { e.preventDefault(); helpOpen(); return; }
    if (e.key === 'Escape') { const h = $('qk-help'); if (h && !h.classList.contains('hidden')) helpClose(); }
  });
  document.addEventListener('click', function (e) {
    const t = e.target; if (!t || !t.closest) return;
    const tx = t.closest('[data-qk-tx]'); if (tx) { openTxModal(tx.dataset.qkTx); return; }
    const r = t.closest('[data-qk-repeat]'); if (r) { repeatTx(r.dataset.qkRepeat, true); return; }
    const q = t.closest('[data-qk]');
    if (q) {
      const a = q.dataset.qk;
      if (a === 'close') qkClose(); else if (a === 'help-close') helpClose();
      else if (a === 'draft-restore') { const b = $('qk-draft'); if (b && b._d) { applyDraft(b._d); b.remove(); showToast('اتسترجعت المسودة', 'info'); } }
      else if (a === 'draft-drop') clearDraft();
      return;
    }
    const p = t.closest('[data-qk-price]');
    if (p) {
      const el = p.closest('#lines-container > div'); if (!el) return; const v = num(p.dataset.qkPrice), name = val(el, '.svc-name'), st = svcStats().get(norm(name)), last = st && st.last;
      setV(el, '.svc-price', v); if (last && !catalogOf(name)) { if (!num(val(el, '.svc-cost')) && last.cost) setV(el, '.svc-cost', last.cost); if (!val(el, '.svc-executor').trim() && last.exec) setV(el, '.svc-executor', last.exec); }
      calculateTotals(); updateHint(el); queueDraft(); return;
    }
    const d = t.closest('[data-qk-dismiss]'); if (d) { dismissed = d.dataset.qkDismiss; hideDup(); return; }
    if (t.closest('#qk-btn')) qkOpen();
  });
  document.addEventListener('input', function (e) {
    const t = e.target; if (!t || !t.closest || !t.closest('#req-form')) return;
    queueDraft(); queueCheck();
    const ln = t.closest('#lines-container > div'); if (ln) queueHint(ln);
  });
  document.addEventListener('change', function (e) { const t = e.target; if (t && t.closest && t.closest('#req-form')) { queueDraft(); queueCheck(); } });
  document.addEventListener('visibilitychange', function () { if (document.hidden) { clearTimeout(dTimer); saveDraft(); } });
  window.addEventListener('pagehide', function () { saveDraft(); });

  /* ---------------------------------------------------------------
     10) ربط بدوال النظام (كلها wrappers بدون تعديل الملفات القديمة)
     --------------------------------------------------------------- */
  const wrap = (name, fn) => { const o = window[name]; if (typeof o === 'function') window[name] = fn(o); };
  wrap('addServiceLine', o => function () { const r = o.apply(this, arguments); try { decorateLine($('lines-container').lastElementChild); } catch (e) { /* */ } return r; });
  wrap('onServiceSelected', o => function (id) { const r = o.apply(this, arguments); try { updateHint($(id)); } catch (e) { /* */ } return r; });
  wrap('renderClientDatalists', o => function () { const r = o.apply(this, arguments); enhanceLists(); return r; });
  wrap('onClientNameInput', o => function () { const r = o.apply(this, arguments); queueCheck(); return r; });
  wrap('onPhoneInput', o => function () { const r = o.apply(this, arguments); queueCheck(); return r; });
  wrap('handleSaveOrder', o => async function () {
    const r = await o.apply(this, arguments);
    try { if (!isDirty()) { clearDraft(); hideDup(); hideLast(); dismissed = ''; } } catch (e) { /* */ }
    return r;
  });
  wrap('loadInitialData', o => async function () { const x = await o.apply(this, arguments); try { setup(); } catch (e) { console.warn('p19 setup', e); } return x; });
  wrap('handleLogout', o => function () { try { clearTimeout(dTimer); const b = $('qk-draft'); if (b) b.remove(); qkClose(true); hideDup(); hideLast(); ix = null; svcIdx = null; } catch (e) { /* */ } return o.apply(this, arguments); });

  function setup() {
    if (!live()) return;
    if (!$('qk-btn')) {
      const bell = $('nt-bell'), host = bell && bell.parentElement;
      const b = document.createElement('button'); b.id = 'qk-btn'; b.type = 'button'; b.title = 'بحث سريع (Ctrl+K)'; b.setAttribute('aria-label', 'بحث سريع');
      b.className = 'relative rounded-xl p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'; b.innerHTML = '<i class="fa-solid fa-magnifying-glass text-sm"></i>';
      if (host && host.parentElement) host.parentElement.insertBefore(b, host); else if ($('hdr-me')) $('hdr-me').parentElement.insertBefore(b, $('hdr-me'));
    }
    lineEls().forEach(decorateLine); enhanceLists(); offerDraft(); updateLast(); checkDup();
  }
})();
