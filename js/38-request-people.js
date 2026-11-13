/* P1-ج: دعم تعدد الأشخاص/المستفيدين داخل الطلب الواحد (جدول request_people)
   - إنشاء الطلب وتعديل الطلب: إضافة/تعديل/حذف أكثر من مستفيد مع ربط اختياري بالخدمة التي تخصه
   - الجداول العامة والبحث والكاش والمنفذين والإيصالات: عرض منظم دون تكرار المعاملة أو مضاعفة الإجماليات */
(function () {
  'use strict';
  if (window.__rp) return; window.__rp = true;
  var $ = function (id) { return document.getElementById(id); };
  var eh = function (s) { return (typeof escapeHtml === 'function' ? escapeHtml(s) : String(s == null ? '' : s)); };
  var map = {};            // tx -> [{id, transaction_id, name, phone, line_id}]
  var tableOk = true;
  var miss = function (e) { return /42P01|PGRST205|does not exist|schema cache/i.test(((e && e.message) || '') + ' ' + ((e && e.code) || '')); };

  /* ---------- دوال مساعدة مشتركة لباقي شاشات وتقارير النظام ---------- */
  window.getRequestPeople = function (tx) {
    return (tx && map[String(tx)]) ? map[String(tx)].slice() : [];
  };

  function resolveServiceNameForLineId(tx, lineId) {
    if (!lineId) return '';
    var l = (typeof allRequestLines !== 'undefined' ? allRequestLines : []).find(function (x) { return String(x.id) === String(lineId); });
    return l && l.service ? l.service : '';
  }

  window.getRequestPeopleForLine = function (tx, lineId) {
    var ps = window.getRequestPeople(tx);
    if (!ps.length) return [];
    if (!lineId) return ps;
    return ps.filter(function (p) { return p.line_id && String(p.line_id) === String(lineId); });
  };

  window.getRequestPeopleNamesText = function (tx, lineId) {
    var ps = window.getRequestPeople(tx);
    if (!ps.length) return '';
    if (lineId) {
      var linked = ps.filter(function (p) { return !p.line_id || String(p.line_id) === String(lineId); });
      return linked.map(function (p) { return p.name; }).join('، ');
    }
    return ps.map(function (p) {
      var svc = resolveServiceNameForLineId(tx, p.line_id);
      return p.name + (svc ? ' [' + svc + ']' : '');
    }).join('، ');
  };

  window.getRequestPeopleInlineBadge = function (tx, lineId) {
    var ps = window.getRequestPeople(tx);
    if (!ps.length) return '';
    var relevant = lineId ? ps.filter(function (p) { return !p.line_id || String(p.line_id) === String(lineId); }) : ps;
    if (!relevant.length) return '';
    return '<div class="mt-1 flex flex-wrap gap-1">' + relevant.map(function (p) {
      return '<span class="inline-flex items-center gap-1 rounded-md bg-violet-50 dark:bg-violet-950/60 border border-violet-200/70 dark:border-violet-800/70 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 dark:text-violet-300"><i class="fa-solid fa-user text-[8.5px]"></i><span>' + eh(p.name) + '</span></span>';
    }).join('') + '</div>';
  };

  window.getRequestPeopleForLineHtml = function (tx, lineId) {
    var linked = window.getRequestPeopleForLine(tx, lineId);
    if (!linked.length) return '';
    return '<div class="rounded-lg bg-violet-50/70 dark:bg-violet-950/30 border border-violet-200/60 dark:border-violet-800/60 px-2.5 py-1.5 text-[11px] flex flex-wrap items-center gap-1.5">' +
      '<span class="font-bold text-violet-700 dark:text-violet-300"><i class="fa-solid fa-users ms-1"></i>المستفيدون من هذه الخدمة:</span>' +
      linked.map(function (p) {
        return '<span class="rounded-md bg-white dark:bg-slate-900 px-2 py-0.5 font-semibold text-ink dark:text-white border border-violet-200 dark:border-violet-800">' + eh(p.name) + (p.phone ? ' <small class="font-mono text-slate-500" dir="ltr">(' + eh(p.phone) + ')</small>' : '') + '</span>';
      }).join('') +
    '</div>';
  };

  /* ---------- تحميل ---------- */
  async function load() {
    if (typeof sbClient === 'undefined' || !sbClient || !tableOk) return;
    var r = await sbClient.from('request_people').select('id,transaction_id,name,phone,line_id').order('id').limit(5000);
    if (r.error) { if (miss(r.error)) tableOk = false; return; }
    map = {};
    (r.data || []).forEach(function (p) {
      (map[String(p.transaction_id)] = map[String(p.transaction_id)] || []).push(p);
    });
    paint();
    if (typeof currentTab !== 'undefined') {
      if (currentTab === 'exec' && typeof filterExecSheet === 'function') filterExecSheet(true);
      if (currentTab === 'cash' && typeof filterCashSheet === 'function') filterCashSheet();
    }
  }
  window.reloadRequestPeople = load;

  var _lid = window.loadInitialData;
  if (typeof _lid === 'function') window.loadInitialData = async function () { var x = await _lid.apply(this, arguments); load(); return x; };

  /* ---------- 1) نموذج إنشاء طلب جديد ---------- */
  function lineOptions() {
    var out = '<option value="">مشترك (كل الطلب)</option>';
    Array.prototype.forEach.call(($('lines-container') || { children: [] }).children, function (el, i) {
      var n = el.querySelector('.svc-name'), v = n ? n.value.trim() : '';
      out += '<option value="' + i + '">بند #' + (i + 1) + (v ? ': ' + eh(v) : '') + '</option>';
    });
    return out;
  }
  function addRow(initData) {
    var box = $('rp-rows'); if (!box) return;
    var d = document.createElement('div');
    d.className = 'rp-row grid gap-2 sm:grid-cols-12 items-end bg-slate-50/70 dark:bg-slate-800/40 p-2 rounded-xl border border-slate-200/70 dark:border-slate-700/60';
    d.innerHTML = '<div class="sm:col-span-5"><label class="text-[10px] font-semibold text-slate-500 block mb-0.5">اسم المستفيد</label><input class="field rp-name !py-1.5 text-xs" maxlength="120" placeholder="الاسم الثلاثي أو الرباعي..."></div>' +
      '<div class="sm:col-span-3"><label class="text-[10px] font-semibold text-slate-500 block mb-0.5">تليفون المستفيد (اختياري)</label><input class="field rp-phone font-mono text-right !py-1.5 text-xs" dir="ltr" maxlength="30" inputmode="tel" placeholder="01xxxxxxxxx"></div>' +
      '<div class="sm:col-span-3"><label class="text-[10px] font-semibold text-slate-500 block mb-0.5">الخدمة المرتبطة</label><select class="field rp-line !py-1.5 text-xs"></select></div>' +
      '<div class="sm:col-span-1 text-end"><button type="button" class="rp-del rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 p-2" title="حذف المستفيد"><i class="fa-solid fa-trash-can"></i></button></div>';
    var sel = d.querySelector('.rp-line'); sel.innerHTML = lineOptions();
    if (initData) {
      if (initData.name) d.querySelector('.rp-name').value = initData.name;
      if (initData.phone) d.querySelector('.rp-phone').value = initData.phone;
      if (initData.lineIdx != null) sel.value = String(initData.lineIdx);
    }
    sel.addEventListener('focus', function () { var v = sel.value; sel.innerHTML = lineOptions(); sel.value = v; });
    d.querySelector('.rp-del').addEventListener('click', function () { d.remove(); });
    box.appendChild(d);
  }
  function mountForm() {
    var anchor = $('address'); if (!anchor || $('rp-box')) return;
    var grid = anchor.closest('.grid'); if (!grid) return;
    grid.insertAdjacentHTML('afterend',
      '<div id="rp-box" class="space-y-2 pt-3 mt-3 border-t border-slate-100 dark:border-slate-800">' +
        '<div class="flex flex-wrap items-center justify-between gap-2">' +
          '<div><span class="text-xs font-bold text-ink dark:text-white"><i class="fa-solid fa-users text-brand-600 ms-1"></i>مستفيدون إضافيون داخل نفس الطلب</span><span class="text-[10.5px] text-slate-400 block">أضف كل اسم في حقل مستقل بدلاً من (+) مع ربطه بالخدمة الخاصة به دون مضاعفة الإجمالي</span></div>' +
          '<button type="button" id="rp-add" class="rounded-xl bg-violet-50 dark:bg-violet-950/60 border border-violet-200 dark:border-violet-800 px-3 py-1.5 text-xs font-bold text-violet-700 dark:text-violet-300 hover:bg-violet-100 transition"><i class="fa-solid fa-user-plus ms-1"></i>إضافة مستفيد</button>' +
        '</div>' +
        '<div id="rp-rows" class="space-y-2"></div>' +
      '</div>');
    $('rp-add').addEventListener('click', function () { addRow(); });
  }
  function collect() {
    var out = [];
    Array.prototype.forEach.call(document.querySelectorAll('#rp-rows .rp-row'), function (r) {
      var n = r.querySelector('.rp-name').value.trim(); if (!n) return;
      var sel = r.querySelector('.rp-line');
      var idx = sel.value === '' ? null : parseInt(sel.value, 10);
      var lineEls = ($('lines-container') || { children: [] }).children;
      var svcName = '';
      if (idx != null && lineEls[idx]) {
        var inp = lineEls[idx].querySelector('.svc-name');
        svcName = inp ? inp.value.trim() : '';
      }
      out.push({ name: n, phone: r.querySelector('.rp-phone').value.trim() || null, lineIdx: idx, svc: svcName });
    });
    return out;
  }
  async function exists(tx) { var r = await sbClient.from('request_lines').select('id,service').eq('transaction_id', tx).is('deleted_at', null).order('id'); return r.data || []; }

  function wrapSave() {
    var prev = window.handleSaveOrder;
    if (typeof prev !== 'function' || prev.__rp) return;
    window.handleSaveOrder = async function (e) {
      if (e && e.preventDefault) e.preventDefault();
      var people = collect(), tx = $('tx-id') ? $('tx-id').value.trim() : '';
      var before = (people.length && tx && sbClient) ? (await exists(tx)).length : 1;
      var r = await prev.apply(this, arguments);
      if (!people.length || !tx || before || !sbClient) return r;
      try {
        var lines = await exists(tx); if (!lines.length) return r;
        var rows = people.map(function (p) {
          var lid = null;
          if (p.lineIdx != null && lines[p.lineIdx]) lid = lines[p.lineIdx].id;
          else if (p.svc) { var m = lines.find(function (l) { return l.service === p.svc; }); if (m) lid = m.id; }
          return { transaction_id: tx, line_id: lid, name: p.name, phone: p.phone };
        });
        var ins = await sbClient.from('request_people').insert(rows);
        if (ins.error) { if (miss(ins.error)) { tableOk = false; showToast('شغّل ملف sql/p1c-request-people.sql في Supabase علشان المستفيدين يتسجلوا', 'error', 9000); } else showError('الطلب اتحفظ لكن المستفيدين ماتسجلوش', ins.error); return r; }
        if ($('rp-rows')) $('rp-rows').innerHTML = '';
        await load();
      } catch (err) { if (typeof showError === 'function') showError('الطلب اتحفظ لكن المستفيدين ماتسجلوش', err); }
      return r;
    };
    window.handleSaveOrder.__rp = true;
  }

  /* ---------- 2) تعديل المستفيدين داخل نافذة تعديل الطلب (openTxEdit / saveTxEdit) ---------- */
  var editOrigSig = '';
  function teLineOptions(lines) {
    var out = '<option value="">مشترك (كل الطلب)</option>';
    (lines || []).forEach(function (l, i) {
      out += '<option value="' + eh(l.id) + '">بند #' + (i + 1) + ': ' + eh(l.service || '') + '</option>';
    });
    return out;
  }
  function addTePersonRow(p, lines) {
    var box = $('te-rp-rows'); if (!box) return;
    var d = document.createElement('div');
    d.className = 'te-rp-row grid gap-2 sm:grid-cols-12 items-center bg-slate-50 dark:bg-slate-800/50 p-2 rounded-xl border border-slate-200 dark:border-slate-700';
    if (p && p.id) d.setAttribute('data-rpid', p.id);
    d.innerHTML = '<div class="sm:col-span-5"><input class="field te-rp-name !py-1.5 text-xs" maxlength="120" placeholder="اسم المستفيد..." value="' + eh(p && p.name ? p.name : '') + '"></div>' +
      '<div class="sm:col-span-3"><input class="field te-rp-phone font-mono text-right !py-1.5 text-xs" dir="ltr" maxlength="30" placeholder="التليفون (اختياري)" value="' + eh(p && p.phone ? p.phone : '') + '"></div>' +
      '<div class="sm:col-span-3"><select class="field te-rp-line !py-1.5 text-xs">' + teLineOptions(lines) + '</select></div>' +
      '<div class="sm:col-span-1 text-end"><button type="button" class="te-rp-del text-rose-500 hover:text-rose-700 p-1.5" title="حذف"><i class="fa-solid fa-trash-can"></i></button></div>';
    var sel = d.querySelector('.te-rp-line');
    if (p && p.line_id != null) sel.value = String(p.line_id);
    d.querySelector('.te-rp-del').addEventListener('click', function () { d.remove(); });
    box.appendChild(d);
  }
  function collectTePeople() {
    var out = [];
    Array.prototype.forEach.call(document.querySelectorAll('#te-rp-rows .te-rp-row'), function (r) {
      var n = r.querySelector('.te-rp-name').value.trim(); if (!n) return;
      var ph = r.querySelector('.te-rp-phone').value.trim() || null;
      var lid = r.querySelector('.te-rp-line').value || null;
      out.push({ id: r.getAttribute('data-rpid') || null, name: n, phone: ph, line_id: lid });
    });
    return out;
  }
  window.mountTxEditPeople = function (tx, lines) {
    var slot = $('te-rp-slot'); if (!slot) return;
    var current = window.getRequestPeople(tx);
    slot.innerHTML = '<div class="space-y-2 rounded-xl border border-slate-200 dark:border-slate-700 p-3">' +
      '<div class="flex items-center justify-between"><h4 class="text-xs font-bold text-slate-500"><i class="fa-solid fa-users text-brand-600 ms-1"></i>المستفيدون داخل الطلب</h4>' +
      '<button type="button" id="te-rp-add" class="rounded-lg bg-violet-50 dark:bg-violet-950/50 px-2.5 py-1 text-xs font-bold text-violet-700 dark:text-violet-300"><i class="fa-solid fa-user-plus ms-1"></i>إضافة مستفيد</button></div>' +
      '<div id="te-rp-rows" class="space-y-2"></div></div>';
    current.forEach(function (p) { addTePersonRow(p, lines); });
    editOrigSig = JSON.stringify(collectTePeople());
    $('te-rp-add').addEventListener('click', function () { addTePersonRow(null, lines); });
  };
  window.hasTxEditPeopleChanged = function () {
    if (!$('te-rp-rows')) return false;
    return JSON.stringify(collectTePeople()) !== editOrigSig;
  };
  window.saveTxEditPeople = async function (tx) {
    if (!sbClient || !tableOk || !window.hasTxEditPeopleChanged()) return;
    var items = collectTePeople();
    var del = await sbClient.from('request_people').delete().eq('transaction_id', String(tx));
    if (del.error && !miss(del.error)) throw del.error;
    if (items.length) {
      var rows = items.map(function (p) { return { transaction_id: String(tx), name: p.name, phone: p.phone, line_id: p.line_id || null }; });
      var ins = await sbClient.from('request_people').insert(rows);
      if (ins.error) throw ins.error;
    }
    await load();
  };

  /* ---------- 3) العرض في الجداول والتفاصيل واللوحة الجانبية ---------- */
  function nrm(s) {
    return typeof normName === 'function' ? normName(s) : String(s || '').trim().toLowerCase();
  }
  function clientOfTx(tx) {
    if (typeof groupedOrders !== 'undefined' && Array.isArray(groupedOrders)) {
      var o = groupedOrders.find(function (x) { return String(x.transaction_id) === String(tx); });
      if (o && o.client_name) return o.client_name;
    }
    return '';
  }
  function distinctPeople(tx, clientName) {
    var cNorm = nrm(clientName != null ? clientName : clientOfTx(tx));
    var seen = {};
    return (map[String(tx)] || []).filter(function (p) {
      var pNorm = nrm(p && p.name);
      if (!pNorm || (cNorm && pNorm === cNorm) || seen[pNorm]) return false;
      seen[pNorm] = true;
      return true;
    });
  }
  function subLineHtml(tx, clientName) {
    var ps = distinctPeople(tx, clientName);
    if (!ps.length) return '';
    var names = ps.map(function (p) { return eh(p.name); });
    var txt = names.length <= 2 ? names.join('، ') : (names[0] + '، ' + names[1] + ' و ' + (names.length - 2) + ' آخرين');
    var tip = ps.map(function (p) { return p.name; }).join('، ');
    return '<div class="rp-n text-[11px] font-normal text-slate-500 dark:text-slate-400 mt-0.5 truncate" title="المستفيدون: ' + eh(tip) + '"><i class="fa-solid fa-user-tag text-[9.5px] ms-1"></i>' + txt + '</div>';
  }
  function paint() {
    document.querySelectorAll('#recent-table-body tr').forEach(function (tr) {
      var m = /selectTxForInspector\('([^']+)'/.exec(tr.getAttribute('onclick') || ''); if (!m) return;
      var tx = m[1].replace(/&#39;/g, "'");
      var b = tr.querySelector('button[data-c]'); if (!b) return;
      var old = b.parentElement.querySelector('.rp-n'); if (old) old.remove();
      var sub = subLineHtml(tx, b.getAttribute('data-c') || b.textContent);
      if (sub) b.insertAdjacentHTML('afterend', sub);
    });
    document.querySelectorAll('#recent-cards-container > [data-tx]').forEach(function (c) {
      var tx = c.getAttribute('data-tx'), t = c.querySelector('.font-bold'); if (!t) return;
      var old = t.parentElement.querySelector('.rp-n'); if (old) old.remove();
      var sub = subLineHtml(tx, t.textContent);
      if (sub) t.insertAdjacentHTML('afterend', sub);
    });
  }
  function listHtml(tx) {
    var ps = distinctPeople(tx); if (!ps.length) return '';
    return '<div class="rp-list rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 p-3 text-xs space-y-1.5">' +
      '<div class="font-bold text-slate-700 dark:text-slate-200 flex items-center justify-between"><span><i class="fa-solid fa-users ms-1.5"></i>المستفيدون (' + ps.length + ')</span></div>' +
      '<div class="rp-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px">' +
      ps.map(function (p) {
        var svc = resolveServiceNameForLineId(tx, p.line_id);
        return '<div class="rp-card" style="display:flex;flex-direction:column;gap:3px;padding:8px 10px;border-radius:10px;border:1px solid rgba(148,163,184,.25);background:rgba(148,163,184,.07)">' +
          '<span class="font-bold text-ink dark:text-white" style="line-height:1.4">' + eh(p.name) + '</span>' +
          (svc ? '<span class="text-[10.5px] font-semibold text-slate-500 dark:text-slate-300">' + eh(svc) + '</span>' : '') +
          (p.phone ? '<span class="font-mono text-[11px] text-slate-500 dark:text-slate-300" dir="ltr" style="align-self:flex-start">' + eh(p.phone) + '</span>' : '') +
        '</div>';
      }).join('') + '</div></div>';
  }
  var _rr = window.renderRecentRequests;
  if (typeof _rr === 'function') window.renderRecentRequests = function () { var r = _rr.apply(this, arguments); try { paint(); } catch (e) { /* */ } return r; };
  var _ot = window.openTxModal;
  if (typeof _ot === 'function') window.openTxModal = function (tx) {
    var r = _ot.apply(this, arguments);
    try {
      var b = $('tx-modal-body'), h = listHtml(tx);
      if (b && h && !b.querySelector('.rp-list')) {
        var infoGrid = b.querySelector('.grid');
        if (infoGrid) infoGrid.insertAdjacentHTML('afterend', h);
        else b.insertAdjacentHTML('afterbegin', h);
      }
    } catch (e) { /* */ }
    return r;
  };
  var _ti = window.renderTxInspector;
  if (typeof _ti === 'function') window.renderTxInspector = function (tx) {
    var r = _ti.apply(this, arguments);
    try {
      var p = $('tx-inspector-panel'), h = listHtml(tx), top = p && p.firstElementChild;
      if (p && h && !p.querySelector('.rp-list')) {
        if (top) top.insertAdjacentHTML('afterend', h);
        else p.insertAdjacentHTML('afterbegin', h);
      }
    } catch (e) { /* */ }
    return r;
  };

  function init() { mountForm(); wrapSave(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
