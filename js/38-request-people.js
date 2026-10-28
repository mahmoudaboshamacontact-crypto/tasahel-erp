/* P1-ج: مستفيدون متعددون على الطلب (جدول request_people) — إضافة معزولة
   - نموذج الطلب: قسم "مستفيدون إضافيون" (اسم + تليفون + ربط اختياري ببند)
   - الجداول: "اسم +N" | نافذة التفاصيل واللوحة الجانبية: قائمة المستفيدين
   - الإجماليات ما بتتأثرش (بتتحسب من البنود بس) */
(function () {
  'use strict';
  if (window.__rp) return; window.__rp = true;
  var $ = function (id) { return document.getElementById(id); };
  var eh = function (s) { return (typeof escapeHtml === 'function' ? escapeHtml(s) : String(s == null ? '' : s)); };
  var map = {};            // tx -> [{name, phone, line_id}]
  var tableOk = true;
  var miss = function (e) { return /42P01|PGRST205|does not exist|schema cache/i.test(((e && e.message) || '') + ' ' + ((e && e.code) || '')); };

  /* ---------- تحميل ---------- */
  async function load() {
    if (typeof sbClient === 'undefined' || !sbClient || !tableOk) return;
    var r = await sbClient.from('request_people').select('transaction_id,name,phone,line_id').order('id').limit(5000);
    if (r.error) { if (miss(r.error)) tableOk = false; return; }
    map = {}; (r.data || []).forEach(function (p) { (map[p.transaction_id] = map[p.transaction_id] || []).push(p); });
    paint();
  }
  var _lid = window.loadInitialData;
  if (typeof _lid === 'function') window.loadInitialData = async function () { var x = await _lid.apply(this, arguments); load(); return x; };

  /* ---------- نموذج الطلب ---------- */
  function lineOptions() {
    var out = '<option value="">كل الطلب</option>';
    Array.prototype.forEach.call(($('lines-container') || { children: [] }).children, function (el, i) {
      var n = el.querySelector('.svc-name'), v = n ? n.value.trim() : '';
      if (v) out += '<option value="' + i + '">' + eh(v) + '</option>';
    });
    return out;
  }
  function addRow() {
    var box = $('rp-rows'); if (!box) return;
    var d = document.createElement('div');
    d.className = 'rp-row grid gap-2 sm:grid-cols-12 items-end';
    d.innerHTML = '<div class="sm:col-span-4"><input class="field rp-name" maxlength="120" placeholder="اسم المستفيد"></div>' +
      '<div class="sm:col-span-3"><input class="field rp-phone font-mono text-right" dir="ltr" maxlength="30" inputmode="tel" placeholder="تليفون (اختياري)"></div>' +
      '<div class="sm:col-span-4"><select class="field rp-line"></select></div>' +
      '<div class="sm:col-span-1 text-end"><button type="button" class="rp-del text-rose-500 p-2" title="حذف"><i class="fa-solid fa-trash-can"></i></button></div>';
    var sel = d.querySelector('.rp-line'); sel.innerHTML = lineOptions();
    sel.addEventListener('focus', function () { var v = sel.value; sel.innerHTML = lineOptions(); sel.value = v; });
    d.querySelector('.rp-del').addEventListener('click', function () { d.remove(); });
    box.appendChild(d);
  }
  function mountForm() {
    var anchor = $('address'); if (!anchor || $('rp-box')) return;
    var grid = anchor.closest('.grid'); if (!grid) return;
    grid.insertAdjacentHTML('afterend',
      '<div id="rp-box" class="space-y-2 pt-1"><div class="flex items-center justify-between gap-2"><span class="text-xs font-semibold text-slate-500 dark:text-slate-400">مستفيدون إضافيون (اختياري)</span>' +
      '<button type="button" id="rp-add" class="text-xs font-semibold text-brand-600 dark:text-violet-300 hover:underline"><i class="fa-solid fa-user-plus ms-1"></i>إضافة مستفيد</button></div><div id="rp-rows" class="space-y-2"></div></div>');
    $('rp-add').addEventListener('click', addRow);
  }
  function collect() {
    var out = [];
    Array.prototype.forEach.call(document.querySelectorAll('#rp-rows .rp-row'), function (r) {
      var n = r.querySelector('.rp-name').value.trim(); if (!n) return;
      out.push({ name: n, phone: r.querySelector('.rp-phone').value.trim() || null, lineIdx: r.querySelector('.rp-line').value, svc: (function () { var s = r.querySelector('.rp-line'); return s.value === '' ? '' : s.options[s.selectedIndex].textContent; })() });
    });
    return out;
  }
  async function exists(tx) { var r = await sbClient.from('request_lines').select('id,service').eq('transaction_id', tx).is('deleted_at', null); return r.data || []; }

  function wrapSave() {
    var prev = window.handleSaveOrder;
    if (typeof prev !== 'function' || prev.__rp) return;
    window.handleSaveOrder = async function (e) {
      if (e && e.preventDefault) e.preventDefault();   /* لازم قبل أي await وإلا الفورم بيتبعت عادي والصفحة بتعمل ريفرش */
      var people = collect(), tx = $('tx-id') ? $('tx-id').value.trim() : '';
      var before = (people.length && tx && sbClient) ? (await exists(tx)).length : 1;
      var r = await prev.apply(this, arguments);
      if (!people.length || !tx || before || !sbClient) return r;
      try {
        var lines = await exists(tx); if (!lines.length) return r;       // الحفظ ماتمش
        var used = {};
        var rows = people.map(function (p) {
          var lid = null;
          if (p.svc) { var m = lines.find(function (l) { return l.service === p.svc && !used[l.id + '|' + p.name]; }); if (m) lid = m.id; }
          return { transaction_id: tx, line_id: lid, name: p.name, phone: p.phone };
        });
        var ins = await sbClient.from('request_people').insert(rows);
        if (ins.error) { if (miss(ins.error)) { tableOk = false; showToast('شغّل ملف sql/p1c-request-people.sql في Supabase علشان المستفيدين يتسجلوا', 'error', 9000); } else showError('الطلب اتحفظ لكن المستفيدين ماتسجلوش', ins.error); return r; }
        if ($('rp-rows')) $('rp-rows').innerHTML = '';
        load();
      } catch (err) { if (typeof showError === 'function') showError('الطلب اتحفظ لكن المستفيدين ماتسجلوش', err); }
      return r;
    };
    window.handleSaveOrder.__rp = true;
  }

  /* ---------- العرض ---------- */
  function cnt(tx) { return (map[tx] || []).length; }
  function badge(n) { return '<span class="rp-n" title="مستفيدون إضافيون" style="display:inline-block;margin-inline-start:6px;padding:0 6px;border-radius:999px;background:rgba(124,58,237,.15);color:#7c3aed;font-size:10.5px;font-weight:700">+' + n + '</span>'; }
  function paint() {
    document.querySelectorAll('#recent-table-body tr').forEach(function (tr) {
      var m = /selectTxForInspector\('([^']+)'/.exec(tr.getAttribute('onclick') || ''); if (!m) return;
      var n = cnt(m[1].replace(/&#39;/g, "'")), b = tr.querySelector('button[data-c]'); if (!b || b.querySelector('.rp-n')) return;
      if (n) b.insertAdjacentHTML('beforeend', badge(n));
    });
    document.querySelectorAll('#recent-cards-container > [data-tx]').forEach(function (c) {
      var n = cnt(c.getAttribute('data-tx')), t = c.querySelector('.font-bold'); if (!n || !t || t.querySelector('.rp-n')) return;
      t.insertAdjacentHTML('beforeend', badge(n));
    });
  }
  function listHtml(tx) {
    var ps = map[tx] || []; if (!ps.length) return '';
    return '<div class="rp-list rounded-xl border border-slate-200 dark:border-slate-700 p-3 text-xs space-y-1"><div class="font-bold text-slate-500 mb-1">المستفيدون (' + ps.length + ')</div>' +
      ps.map(function (p) { return '<div class="flex justify-between gap-2"><span class="font-semibold text-ink dark:text-white">' + eh(p.name) + '</span>' + (p.phone ? '<span class="font-mono text-slate-500" dir="ltr">' + eh(p.phone) + '</span>' : '') + '</div>'; }).join('') + '</div>';
  }
  var _rr = window.renderRecentRequests;
  if (typeof _rr === 'function') window.renderRecentRequests = function () { var r = _rr.apply(this, arguments); try { paint(); } catch (e) { /* */ } return r; };
  var _ot = window.openTxModal;
  if (typeof _ot === 'function') window.openTxModal = function (tx) {
    var r = _ot.apply(this, arguments);
    try { var b = $('tx-modal-body'), h = listHtml(tx); if (b && h && !b.querySelector('.rp-list')) b.insertAdjacentHTML('beforeend', h); } catch (e) { /* */ }
    return r;
  };
  var _ti = window.renderTxInspector;
  if (typeof _ti === 'function') window.renderTxInspector = function (tx) {
    var r = _ti.apply(this, arguments);
    try { var p = $('tx-inspector-panel'), h = listHtml(tx), f = p && p.querySelector('form'); if (p && h && f && !p.querySelector('.rp-list')) f.insertAdjacentHTML('beforebegin', h); } catch (e) { /* */ }
    return r;
  };

  function init() { mountForm(); wrapSave(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
