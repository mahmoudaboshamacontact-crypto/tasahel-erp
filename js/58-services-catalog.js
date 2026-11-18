/* الجزء ط: كتالوج الخدمات (المرحلة 5 + ربط سكريبت تيكت الاستلام) — js/58-services-catalog.js
   شاشة للمدير بس: مدة الخدمة بأيام العمل، الفئة، المستندات المطلوبة، الأولوية، خدمة التجديد،
   بالإضافة إلى «تنبيهات السكريبت وطريقة التسليم» و«مكان التسليم النهائي» اللي بتغذي شاشة تيكت الاستلام. */
(function () {
  'use strict';
  if (window.__phase58) return; window.__phase58 = true;

  var $ = function (id) { return document.getElementById(id); };
  var eh = function (s) { return typeof escapeHtml === 'function' ? escapeHtml(s) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };
  var BTN_ON = 'tab-btn bg-ink text-white dark:bg-brand-600 shadow-sm';
  var BTN_OFF = 'tab-btn text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800';
  var COLS = 'id,name,duration_days,category,required_docs,priority,renewal_of,script_notes,delivery_mode';
  var COLS_FALLBACK = 'id,name,duration_days,category,required_docs,priority,renewal_of';
  var rows = [], busy = false, filt = 'all', q = '', editId = null, hasScriptCols = true;
  var PRI = ['عادية', 'مهمة', 'عاجلة'];
  var DELIV_MODES = { home: 'عنوان العميل', hub_abbasiya: 'نقطة تجمع: جوازات العباسية' };

  function toast(m, t) { if (typeof showToast === 'function') showToast(m, t || 'info'); }
  function db() { return typeof sbClient !== 'undefined' ? sbClient : window.sbClient; }
  function isMgr() { return window.__role === 'manager'; }
  function wrap(name, make) { var o = window[name]; if (typeof o !== 'function') return; window[name] = make(o); }
  function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
  function byId(id) { for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return rows[i]; return null; }

  function visible() {
    return rows.filter(function (r) {
      if (filt === 'nodur' && r.duration_days) return false;
      if (filt === 'nocat' && r.category) return false;
      if (filt === 'noscript' && (r.script_notes || '').trim()) return false;
      if (q && norm(r.name + ' ' + (r.category || '') + ' ' + (r.script_notes || '')).indexOf(q) < 0) return false;
      return true;
    });
  }
  function opts(sel) {
    return '<option value="">— مفيش —</option>' + rows.filter(function (r) { return r.id !== editId; }).map(function (r) {
      return '<option value="' + r.id + '"' + (sel === r.id ? ' selected' : '') + '>' + eh(r.name) + '</option>';
    }).join('');
  }

  function render() {
    var pane = $('tab-svccat'); if (!pane) return;
    var noDur = rows.filter(function (r) { return !r.duration_days; }).length;
    var noCat = rows.filter(function (r) { return !r.category; }).length;
    var noScr = rows.filter(function (r) { return !(r.script_notes || '').trim(); }).length;
    var list = visible().slice(0, 200);
    var chip = function (k, t) { return '<button type="button" data-f="' + k + '" class="rounded-full border px-3 py-1 text-xs font-semibold ' + (filt === k ? 'border-transparent bg-ink text-white dark:bg-brand-600' : 'border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300') + '">' + t + '</button>'; };
    var body = list.map(function (r) {
      if (editId === r.id) {
        return '<tr class="bg-amber-50/60 dark:bg-slate-800/60"><td colspan="6" class="p-3"><div class="grid grid-cols-1 gap-2 sm:grid-cols-2 text-xs">' +
          '<div class="sm:col-span-2 font-bold">' + eh(r.name) + '</div>' +
          '<label>المدة (أيام عمل بدون جمعة وسبت، 1–180)<input id="sc58-dur" type="number" min="1" max="180" class="field font-mono" dir="ltr" value="' + (r.duration_days || '') + '"></label>' +
          '<label>الفئة<input id="sc58-cat" class="field" maxlength="60" list="sc58-cats" value="' + eh(r.category || '') + '"></label>' +
          '<label>الأولوية<select id="sc58-pri" class="field">' + PRI.map(function (p, i) { return '<option value="' + i + '"' + (r.priority === i ? ' selected' : '') + '>' + p + '</option>'; }).join('') + '</select></label>' +
          '<label>مكان التسليم النهائي<select id="sc58-dmode" class="field">' +
            '<option value="home"' + ((r.delivery_mode || 'home') === 'home' ? ' selected' : '') + '>تسليم عنوان العميل</option>' +
            '<option value="hub_abbasiya"' + (r.delivery_mode === 'hub_abbasiya' ? ' selected' : '') + '>نقطة تجمع ثابتة (جوازات العباسية)</option>' +
          '</select></label>' +
          '<label class="sm:col-span-2">خدمة التجديد المرتبطة<select id="sc58-ren" class="field">' + opts(r.renewal_of) + '</select></label>' +
          '<label class="sm:col-span-2">المستندات المطلوبة (تُقرأ في السكريبت)<textarea id="sc58-docs" class="field" rows="2" maxlength="600" placeholder="مثال: أصل البطاقة + أصل المؤهل">' + eh(r.required_docs || '') + '</textarea></label>' +
          '<label class="sm:col-span-2">تنبيهات السكريبت وطريقة التسليم (تُقرأ حرفياً للموظف)<textarea id="sc58-script" class="field" rows="3" maxlength="800" placeholder="مثال: بيتبعت ملف PDF، وفي خلال 48 لـ 72 ساعة بيتم استلام الأوراق وإرسالها... وسفارة الإمارات مبتختمش ختم حي، ده ختم إلكتروني.">' + eh(r.script_notes || '') + '</textarea></label>' +
          '<div class="sm:col-span-2 flex gap-2"><button type="button" data-save="' + r.id + '" class="rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white">حفظ</button><button type="button" data-cancel="1" class="rounded-xl border px-4 py-2">إلغاء</button></div>' +
          '</div></td></tr>';
      }
      var ren = r.renewal_of && byId(r.renewal_of) ? byId(r.renewal_of).name : '';
      var modeTag = r.delivery_mode === 'hub_abbasiya' ? '<span class="inline-block rounded-full bg-orange-100 text-orange-700 px-2 py-0.5 text-[10px] font-bold mt-1">نقطة تجمع: العباسية</span>' : '';
      var scriptPrev = r.script_notes ? '<div class="text-[10.5px] text-orange-600 dark:text-orange-300 mt-0.5">سكريبت: ' + eh(r.script_notes.slice(0, 70)) + (r.script_notes.length > 70 ? '…' : '') + '</div>' : '';
      return '<tr class="border-t border-slate-200 dark:border-slate-700"><td class="p-2 font-semibold">' + eh(r.name) + (ren ? '<div class="text-[11px] text-slate-500">تجديد: ' + eh(ren) + '</div>' : '') + (modeTag ? '<div>' + modeTag + '</div>' : '') + '</td>' +
        '<td class="p-2 text-center font-mono">' + (r.duration_days ? r.duration_days : '<span class="text-rose-500">—</span>') + '</td>' +
        '<td class="p-2">' + (eh(r.category) || '<span class="text-slate-400">—</span>') + '</td>' +
        '<td class="p-2 text-center">' + PRI[r.priority] + '</td>' +
        '<td class="p-2 text-[11px] text-slate-500">' + (r.required_docs ? eh(r.required_docs.slice(0, 60)) : '<span class="text-slate-400">—</span>') + scriptPrev + '</td>' +
        '<td class="p-2"><button type="button" data-edit="' + r.id + '" class="rounded-lg border px-2.5 py-1 text-xs">تعديل</button></td></tr>';
    }).join('');
    var cats = {}; rows.forEach(function (r) { if (r.category) cats[r.category] = 1; });
    pane.innerHTML = '<div class="card p-4 space-y-3">' +
      '<div class="flex flex-wrap items-center justify-between gap-2"><h3 class="font-bold">كتالوج الخدمات</h3><span class="text-xs text-slate-500">' + rows.length + ' خدمة • ' + noDur + ' من غير مدة • ' + noCat + ' من غير فئة • ' + noScr + ' من غير تنبيه سكريبت</span></div>' +
      '<p class="text-[11px] text-slate-500">المدة، المستندات المطلوبة، وتنبيهات السكريبت هنا بتسمّع فوراً في شاشة «تيكتات الاستلام» قدام الموظف أثناء المكالمة.</p>' +
      (!hasScriptCols ? '<div class="rounded-xl border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800">لتفعيل حفظ «تنبيهات السكريبت» و«مكان التسليم»، شغّل التحديث الجديد في <b>sql/pickup-ticket.sql</b>.</div>' : '') +
      '<div class="flex flex-wrap items-center gap-2"><input id="sc58-q" class="field !w-48" placeholder="بحث..." value="' + eh(q) + '">' + chip('all', 'الكل') + chip('nodur', 'من غير مدة') + chip('nocat', 'من غير فئة') + chip('noscript', 'من غير سكريبت') + '</div>' +
      '<datalist id="sc58-cats">' + Object.keys(cats).map(function (c) { return '<option value="' + eh(c) + '">'; }).join('') + '</datalist>' +
      '<div class="overflow-x-auto"><table class="w-full text-xs"><thead><tr class="text-slate-500"><th class="p-2 text-right">الخدمة</th><th class="p-2">المدة (يوم)</th><th class="p-2 text-right">الفئة</th><th class="p-2">الأولوية</th><th class="p-2 text-right">المستندات والسكريبت</th><th></th></tr></thead><tbody>' +
      (body || '<tr><td colspan="6" class="p-4 text-center text-slate-500">مفيش نتايج</td></tr>') + '</tbody></table></div>' +
      (visible().length > 200 ? '<p class="text-[11px] text-slate-500">معروض أول 200 نتيجة، استخدم البحث.</p>' : '') + '</div>';
  }

  async function load() {
    if (!isMgr() || !db() || busy) return; busy = true;
    try {
      var r = await db().from('services').select(COLS).order('name').limit(1000);
      if (r.error && /script_notes|delivery_mode|42703/i.test((r.error.message || '') + ' ' + (r.error.code || ''))) {
        hasScriptCols = false;
        r = await db().from('services').select(COLS_FALLBACK).order('name').limit(1000);
      } else {
        hasScriptCols = true;
      }
      if (r.error) { toast('تعذّر تحميل الكتالوج: ' + r.error.message, 'error'); return; }
      rows = (r.data || []).map(function (x) {
        x.priority = Number(x.priority) || 0;
        if (!x.delivery_mode) x.delivery_mode = 'home';
        return x;
      });
      render();
    } finally { busy = false; }
  }

  async function save(id) {
    var r0 = byId(id); if (!r0) return;
    var dRaw = ($('sc58-dur').value || '').trim(), d = dRaw === '' ? null : parseInt(dRaw, 10);
    if (d !== null && (isNaN(d) || d < 1 || d > 180)) return toast('المدة لازم تكون من 1 لـ 180 يوم', 'error');
    var ren = $('sc58-ren').value ? Number($('sc58-ren').value) : null;
    if (ren === id) return toast('الخدمة مينفعش تكون تجديد لنفسها', 'error');
    var patch = {
      duration_days: d,
      category: ($('sc58-cat').value || '').trim().slice(0, 60) || null,
      priority: Math.max(0, Math.min(2, parseInt($('sc58-pri').value, 10) || 0)),
      renewal_of: ren,
      required_docs: ($('sc58-docs').value || '').trim().slice(0, 600) || null
    };
    if (hasScriptCols) {
      patch.script_notes = ($('sc58-script').value || '').trim().slice(0, 800) || null;
      patch.delivery_mode = $('sc58-dmode').value === 'hub_abbasiya' ? 'hub_abbasiya' : 'home';
    }
    busy = true;
    try {
      var colsToUse = hasScriptCols ? COLS : COLS_FALLBACK;
      var u = await db().from('services').update(patch).eq('id', id).select(colsToUse).single();
      if (u.error) return toast('تعذّر الحفظ: ' + u.error.message, 'error');
      u.data.priority = Number(u.data.priority) || 0;
      if (!u.data.delivery_mode) u.data.delivery_mode = 'home';
      rows = rows.map(function (x) { return x.id === id ? u.data : x; });
      editId = null; render(); toast('اتحفظت الخدمة في الكتالوج ✓', 'success');
      try { if (typeof loadServices === 'function') loadServices(); } catch (e) { /* تحديث قايمة الإدخال */ }
    } finally { busy = false; }
  }

  function onClick(e) {
    var t = e.target; if (!t || !t.closest) return;
    var f = t.closest('[data-f]'); if (f) { filt = f.getAttribute('data-f'); render(); return; }
    var ed = t.closest('[data-edit]'); if (ed) { editId = Number(ed.getAttribute('data-edit')); render(); return; }
    if (t.closest('[data-cancel]')) { editId = null; render(); return; }
    var sv = t.closest('[data-save]'); if (sv && !busy) return save(Number(sv.getAttribute('data-save')));
  }
  var qTimer = null;
  function onInput(e) {
    if (!e.target || e.target.id !== 'sc58-q') return;
    var v = e.target.value; clearTimeout(qTimer);
    qTimer = setTimeout(function () { q = norm(v); render(); var i = $('sc58-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250);
  }

  function placeBtn(btn) {
    var menu = $('nav-menu'); if (!menu) return;
    var body = menu.querySelector(':scope > section[data-mg="admin"] .mg-body');
    if (body) { if (btn.parentElement !== body) body.appendChild(btn); return; }
    var foot = menu.querySelector(':scope > .r-logout-menu');
    if (foot) menu.insertBefore(btn, foot); else menu.appendChild(btn);
  }
  function remove() { var b = $('tab-svccat-btn'), p = $('tab-svccat'); if (b) b.remove(); if (p) p.remove(); }
  function ensure() {
    if (!isMgr()) { remove(); return false; }
    if (!$('tab-svccat')) {
      var main = document.querySelector('main'); if (!main) return false;
      var pane = document.createElement('div'); pane.id = 'tab-svccat'; pane.className = 'hidden space-y-4';
      var host = $('tab-morale') || $('tab-trash') || $('tab-status') || main.lastElementChild;
      if (host) host.insertAdjacentElement('afterend', pane); else main.appendChild(pane);
      pane.addEventListener('click', onClick); pane.addEventListener('input', onInput);
    }
    if (!$('tab-svccat-btn') && $('nav-menu')) {
      var b = document.createElement('button'); b.id = 'tab-svccat-btn'; b.type = 'button';
      b.setAttribute('data-tab-target', 'svccat'); b.className = BTN_OFF; b.setAttribute('onclick', "switchTab('svccat')");
      b.innerHTML = '<i class="fa-solid fa-list-check text-orange-500"></i><span>كتالوج الخدمات</span>';
      placeBtn(b);
    }
    return true;
  }

  wrap('switchTab', function (orig) {
    return function (id) {
      if (id === 'svccat' && !isMgr()) { toast('الصفحة دي للمدير بس'); return; }
      var res = orig.apply(this, arguments);
      try {
        ensure();
        var on = id === 'svccat' && isMgr(), pane = $('tab-svccat'), btn = $('tab-svccat-btn');
        if (pane) pane.classList.toggle('hidden', !on);
        if (btn) btn.className = on ? BTN_ON : BTN_OFF;
        if (on) { var sec = btn && btn.closest('.mg'); if (sec && !sec.classList.contains('open')) sec.classList.add('open'); load(); }
      } catch (e) { /* */ }
      return res;
    };
  });
  wrap('loadInitialData', function (orig) {
    return async function () { var r = await orig.apply(this, arguments); try { ensure(); } catch (e) { /* */ } return r; };
  });
  wrap('handleLogout', function (orig) {
    return function () { try { rows = []; editId = null; remove(); } catch (e) { /* */ } return orig.apply(this, arguments); };
  });
})();
