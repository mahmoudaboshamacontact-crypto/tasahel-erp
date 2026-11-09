// =====================================================================
// js/61-doc-verification.js
// منظومة مراجعة المستندات الذكية (Smart Document Verification)
// - شاشة إعداد قوالب الفحص للمدير فقط (Checklist Builder)
// - شاشة فحص وتدقيق المستندات للموظفين قبل التحويل للتنفيذ
// - تنبيه ذكي للعميل عبر واتساب عند وجود نواقص
// =====================================================================

(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function isMgr() { return window.__role === 'manager'; }
  function eh(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function getAllLines() {
    if (typeof allRequestLines !== 'undefined' && Array.isArray(allRequestLines)) return allRequestLines;
    if (window.allRequestLines && Array.isArray(window.allRequestLines)) return window.allRequestLines;
    return [];
  }

  function wrap(name, make) {
    var o = window[name];
    if (typeof o !== 'function') return;
    window[name] = make(o);
  }

  // ذاكرة تخزين مؤقتة لبنود الفحص
  var cachedChecklists = {};
  var cachedVerifications = {};

  // =========================================================================
  // 1. واجهة المدير: إعداد قوالب فحص المستندات لكل خدمة (Checklist Builder)
  // =========================================================================

  async function fetchServiceChecklist(serviceName) {
    if (!window.sbClient || !serviceName) return [];
    try {
      var res = await window.sbClient
        .from('service_doc_checklists')
        .select('*')
        .eq('service_name', serviceName)
        .order('sort_order', { ascending: true })
        .order('id', { ascending: true });
      cachedChecklists[serviceName] = res.data || [];
      return cachedChecklists[serviceName];
    } catch (e) {
      console.warn('DocChecklist fetch error:', e);
      return [];
    }
  }

  window.openDocChecklistManagerModal = async function (preSelectedService) {
    if (!isMgr()) {
      if (typeof window.showToast === 'function') window.showToast('هذه الشاشة متاحة للمدير فقط', 'error');
      return;
    }

    var m = $('doc-checklists-mgr-modal');
    if (!m) {
      document.body.insertAdjacentHTML('beforeend',
        '<div id="doc-checklists-mgr-modal" class="modal fixed inset-0 z-[120] hidden items-center justify-center bg-black/60 p-4 backdrop-blur-sm">' +
        '  <div class="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 text-slate-800 dark:text-slate-100 max-h-[90vh] flex flex-col">' +
        '    <div class="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">' +
        '      <div class="flex items-center gap-2.5">' +
        '        <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400">' +
        '          <i class="fa-solid fa-file-shield text-lg"></i>' +
        '        </span>' +
        '        <div>' +
        '          <h3 class="text-base font-bold text-slate-900 dark:text-white">إعداد قوالب فحص المستندات (للمدير فقط)</h3>' +
        '          <p class="text-xs text-slate-500">حدّد المستندات الإلزامية وشروط قبولها قبل بدء التنفيذ</p>' +
        '        </div>' +
        '      </div>' +
        '      <button type="button" onclick="window.closeDocChecklistManagerModal()" class="h-8 w-8 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"><i class="fa-solid fa-xmark"></i></button>' +
        '    </div>' +
        '    <div class="py-4 space-y-4 overflow-y-auto flex-1">' +
        '      <div>' +
        '        <label class="block text-xs font-bold mb-1">اختر الخدمة:</label>' +
        '        <select id="doc-mgr-service-select" class="field w-full text-xs font-semibold" onchange="window.onDocMgrServiceChange()"></select>' +
        '      </div>' +
        '      <div id="doc-mgr-items-container" class="space-y-2.5">' +
        '        <div class="p-6 text-center text-xs text-slate-400">جارٍ التحميل...</div>' +
        '      </div>' +
        '      <div class="rounded-xl border border-dashed border-orange-300 dark:border-orange-800/60 bg-orange-50/50 dark:bg-orange-950/20 p-4 space-y-3">' +
        '        <div class="text-xs font-bold text-orange-800 dark:text-orange-300 flex items-center gap-1.5"><i class="fa-solid fa-circle-plus"></i> إضافة مستند مطلوب جديد لهذه الخدمة</div>' +
        '        <input id="doc-new-title" class="field w-full text-xs" placeholder="اسم المستند (مثال: أصل السجل التجاري، توكيل رسمي عام، صورة بطاقة الرقم القومي...)">' +
        '        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-semibold">' +
        '          <label class="flex items-center gap-1.5 cursor-pointer bg-white dark:bg-slate-800 p-2 rounded-lg border border-slate-200 dark:border-slate-700">' +
        '            <input type="checkbox" id="doc-new-req" checked class="rounded text-orange-600"> <span>إلزامي قبل التنفيذ</span>' +
        '          </label>' +
        '          <label class="flex items-center gap-1.5 cursor-pointer bg-white dark:bg-slate-800 p-2 rounded-lg border border-slate-200 dark:border-slate-700">' +
        '            <input type="checkbox" id="doc-new-val" checked class="rounded text-orange-600"> <span>فحص الصلاحية</span>' +
        '          </label>' +
        '          <label class="flex items-center gap-1.5 cursor-pointer bg-white dark:bg-slate-800 p-2 rounded-lg border border-slate-200 dark:border-slate-700">' +
        '            <input type="checkbox" id="doc-new-stmp" checked class="rounded text-orange-600"> <span>فحص الأختام</span>' +
        '          </label>' +
        '          <label class="flex items-center gap-1.5 cursor-pointer bg-white dark:bg-slate-800 p-2 rounded-lg border border-slate-200 dark:border-slate-700">' +
        '            <input type="checkbox" id="doc-new-mtch" checked class="rounded text-orange-600"> <span>تطابق البيانات</span>' +
        '          </label>' +
        '        </div>' +
        '        <button type="button" onclick="window.saveNewDocChecklistItem()" class="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md"><i class="fa-solid fa-plus"></i> إضافة لقائمة الخدمة</button>' +
        '      </div>' +
        '    </div>' +
        '    <div class="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end">' +
        '      <button type="button" onclick="window.closeDocChecklistManagerModal()" class="px-5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 font-bold text-xs">إغلاق</button>' +
        '    </div>' +
        '  </div>' +
        '</div>'
      );
      m = $('doc-checklists-mgr-modal');
    }

    // تعبئة قائمة الخدمات
    var sel = $('doc-mgr-service-select');
    var svcs = (window.allServices || []).map(function (s) { return typeof s === 'string' ? s : (s.name || s.service || ''); }).filter(Boolean);
    svcs = Array.from(new Set(svcs)).sort();
    sel.innerHTML = svcs.map(function (s) {
      return '<option value="' + eh(s) + '"' + (s === preSelectedService ? ' selected' : '') + '>' + eh(s) + '</option>';
    }).join('');

    m.classList.remove('hidden');
    m.classList.add('flex');
    window.onDocMgrServiceChange();
  };

  window.closeDocChecklistManagerModal = function () {
    var m = $('doc-checklists-mgr-modal');
    if (m) { m.classList.add('hidden'); m.classList.remove('flex'); }
  };

  window.onDocMgrServiceChange = async function () {
    var svc = $('doc-mgr-service-select') ? $('doc-mgr-service-select').value : '';
    var box = $('doc-mgr-items-container');
    if (!box) return;
    box.innerHTML = '<div class="p-6 text-center text-xs text-slate-400">جارٍ جلب بنود الفحص...</div>';

    var items = await fetchServiceChecklist(svc);
    if (!items.length) {
      box.innerHTML = '<div class="rounded-xl border border-slate-200 dark:border-slate-800 p-6 text-center text-xs text-slate-400">' +
        '<i class="fa-solid fa-folder-open text-2xl mb-2 text-slate-300 dark:text-slate-600 block"></i>' +
        'لا توجد مستندات فحص مسجلة لهذه الخدمة حتى الآن.<br>استخدم النموذج بالأسفل لإضافة المستندات المطلوبة.</div>';
      return;
    }

    box.innerHTML = items.map(function (it) {
      return '<div class="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">' +
        '  <div class="min-w-0 flex-1">' +
        '    <div class="flex items-center gap-2">' +
        '      <span class="font-bold text-xs text-slate-800 dark:text-slate-100">' + eh(it.item_title) + '</span>' +
        (it.is_required ? '<span class="rounded bg-rose-100 dark:bg-rose-950/60 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 dark:text-rose-300">إلزامي</span>' : '<span class="rounded bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-600 dark:text-slate-300">اختياري</span>') +
        '    </div>' +
        '    <div class="flex flex-wrap gap-2 mt-1 text-[10px] text-slate-500">' +
        (it.check_validity ? '<span class="flex items-center gap-1"><i class="fa-solid fa-check text-emerald-500"></i> فحص الصلاحية</span>' : '') +
        (it.check_stamp ? '<span class="flex items-center gap-1"><i class="fa-solid fa-check text-emerald-500"></i> فحص الأختام</span>' : '') +
        (it.check_match ? '<span class="flex items-center gap-1"><i class="fa-solid fa-check text-emerald-500"></i> تطابق البيانات</span>' : '') +
        '    </div>' +
        '  </div>' +
        '  <button type="button" onclick="window.deleteDocChecklistItem(' + it.id + ')" class="text-rose-600 hover:text-rose-700 p-2 text-xs rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40" title="حذف البند"><i class="fa-solid fa-trash-can"></i></button>' +
        '</div>';
    }).join('');
  };

  window.saveNewDocChecklistItem = async function () {
    if (!isMgr()) return;
    var svc = $('doc-mgr-service-select') ? $('doc-mgr-service-select').value : '';
    var title = $('doc-new-title') ? $('doc-new-title').value.trim() : '';
    if (!svc || !title) {
      if (typeof window.showToast === 'function') window.showToast('يرجى كتابة اسم المستند المطلوب', 'warning');
      return;
    }

    var payload = {
      service_name: svc,
      item_title: title,
      is_required: $('doc-new-req') ? $('doc-new-req').checked : true,
      check_validity: $('doc-new-val') ? $('doc-new-val').checked : true,
      check_stamp: $('doc-new-stmp') ? $('doc-new-stmp').checked : true,
      check_match: $('doc-new-mtch') ? $('doc-new-mtch').checked : true
    };

    try {
      var res = await window.sbClient.from('service_doc_checklists').insert(payload);
      if (res.error) throw res.error;
      $('doc-new-title').value = '';
      if (typeof window.showToast === 'function') window.showToast('تمت إضافة المستند بنجاح', 'success');
      delete cachedChecklists[svc];
      window.onDocMgrServiceChange();
    } catch (err) {
      if (typeof window.showError === 'function') window.showError('تعذر حفظ البند', err);
    }
  };

  window.deleteDocChecklistItem = async function (id) {
    if (!isMgr() || !confirm('هل أنت متأكد من حذف هذا البند من قائمة التحقق؟')) return;
    try {
      var res = await window.sbClient.from('service_doc_checklists').delete().eq('id', id);
      if (res.error) throw res.error;
      if (typeof window.showToast === 'function') window.showToast('تم حذف البند', 'info');
      var svc = $('doc-mgr-service-select') ? $('doc-mgr-service-select').value : '';
      delete cachedChecklists[svc];
      window.onDocMgrServiceChange();
    } catch (err) {
      if (typeof window.showError === 'function') window.showError('تعذر الحذف', err);
    }
  };

  // =========================================================================
  // 2. واجهة الموظف: فحص وتدقيق المستندات للمعاملة (Quality Verification Gate)
  // =========================================================================

  async function fetchLineVerifications(lineId) {
    if (!window.sbClient || !lineId) return [];
    try {
      var res = await window.sbClient
        .from('request_line_doc_verifications')
        .select('*')
        .eq('line_id', lineId);
      cachedVerifications[lineId] = res.data || [];
      return cachedVerifications[lineId];
    } catch (e) {
      console.warn('Verifications fetch error:', e);
      return [];
    }
  }

  window.openDocVerificationModal = async function (lineId) {
    var line = null;
    var allLines = getAllLines();
    allLines.some(function (l) {
      if (String(l.id) === String(lineId)) { line = l; return true; }
      return false;
    });

    if (!line && window.sbClient) {
      try {
        var lr = await window.sbClient.from('request_lines').select('*').eq('id', lineId).single();
        line = lr.data;
      } catch (e) { /* ignore */ }
    }

    if (!line) {
      if (typeof window.showToast === 'function') window.showToast('تعذر العثور على بيانات الخدمة', 'error');
      return;
    }

    var m = $('doc-verify-exec-modal');
    if (!m) {
      document.body.insertAdjacentHTML('beforeend',
        '<div id="doc-verify-exec-modal" class="modal fixed inset-0 z-[130] hidden items-center justify-center bg-black/60 p-4 backdrop-blur-sm">' +
        '  <div class="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 text-slate-800 dark:text-slate-100 max-h-[92vh] flex flex-col">' +
        '    <div class="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">' +
        '      <div>' +
        '        <div class="flex items-center gap-2">' +
        '          <span class="rounded-md bg-orange-100 dark:bg-orange-950/60 px-2 py-0.5 text-xs font-bold text-orange-600 dark:text-orange-400">بوابة الجودة والتدقيق</span>' +
        '          <h3 id="dve-title" class="text-base font-bold text-slate-900 dark:text-white">فحص مستندات الخدمة</h3>' +
        '        </div>' +
        '        <p id="dve-subtitle" class="text-xs text-slate-500 mt-0.5"></p>' +
        '      </div>' +
        '      <button type="button" onclick="window.closeDocVerificationModal()" class="h-8 w-8 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"><i class="fa-solid fa-xmark"></i></button>' +
        '    </div>' +
        '    <div class="py-4 space-y-4 overflow-y-auto flex-1" id="dve-body">' +
        '      <div class="p-6 text-center text-xs text-slate-400">جارٍ فحص المستندات المطلوبة...</div>' +
        '    </div>' +
        '    <div class="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">' +
        '      <div id="dve-whatsapp-slot"></div>' +
        '      <div class="flex items-center gap-2">' +
        '        <button type="button" onclick="window.closeDocVerificationModal()" class="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 font-bold text-xs">إلغاء</button>' +
        '        <button id="dve-save-btn" type="button" onclick="window.saveDocVerifications()" class="px-6 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-md flex items-center gap-1.5"><i class="fa-solid fa-check-double"></i> اعتماد الفحص وحفظ التقرير</button>' +
        '      </div>' +
        '    </div>' +
        '  </div>' +
        '</div>'
      );
      m = $('doc-verify-exec-modal');
    }

    $('dve-title').textContent = 'فحص مستندات: ' + (line.service || 'الخدمة');
    $('dve-subtitle').textContent = 'العميل: ' + (line.client_name || '-') + ' | كود: ' + (line.transaction_id || '-');
    m.setAttribute('data-line-id', String(line.id));
    m.setAttribute('data-phone', String(line.phone || ''));
    m.setAttribute('data-client', String(line.client_name || ''));
    m.setAttribute('data-service', String(line.service || ''));
    m.setAttribute('data-tx', String(line.transaction_id || ''));

    m.classList.remove('hidden');
    m.classList.add('flex');

    var checkItems = await fetchServiceChecklist(line.service);
    var savedVerifs = await fetchLineVerifications(line.id);

    if (!checkItems.length) {
      $('dve-body').innerHTML = '<div class="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-6 text-center">' +
        '<i class="fa-solid fa-clipboard-check text-3xl text-emerald-600 dark:text-emerald-400 mb-2 block"></i>' +
        '<h4 class="font-bold text-sm text-emerald-800 dark:text-emerald-200">لا توجد اشتراطات مستندية خاصة لهذه الخدمة</h4>' +
        '<p class="text-xs text-emerald-700 dark:text-emerald-300 mt-1">الخدمة جاهزة ومصرح بتحويلها للتنفيذ مباشرة.</p>' +
        (isMgr() ? '<button type="button" onclick="window.closeDocVerificationModal(); window.openDocChecklistManagerModal(\'' + eh(line.service) + '\')" class="mt-3 text-xs font-bold text-orange-600 hover:underline"><i class="fa-solid fa-gear ms-1"></i> ضبط قائمة مستندات لهذه الخدمة</button>' : '') +
        '</div>';
      $('dve-whatsapp-slot').innerHTML = '';
      return;
    }

    var verifMap = {};
    savedVerifs.forEach(function (v) {
      if (v.checklist_id) verifMap[v.checklist_id] = v;
    });

    $('dve-body').innerHTML = checkItems.map(function (it, idx) {
      var v = verifMap[it.id] || {};
      var isPresent = v.is_present === true;
      var isValid = v.is_valid !== false;
      var isStamped = v.is_stamped !== false;
      var isMatched = v.is_matched !== false;
      var note = v.notes || '';

      return '<div class="dve-item-row p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 space-y-3" data-item-id="' + it.id + '" data-title="' + eh(it.item_title) + '" data-required="' + (it.is_required ? '1' : '0') + '">' +
        '  <div class="flex items-center justify-between">' +
        '    <div class="flex items-center gap-2">' +
        '      <span class="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700 text-[11px] font-bold">' + (idx + 1) + '</span>' +
        '      <b class="text-xs text-slate-800 dark:text-slate-100">' + eh(it.item_title) + '</b>' +
        (it.is_required ? '<span class="rounded bg-rose-100 dark:bg-rose-950/60 px-1.5 py-0.2 text-[10px] font-bold text-rose-700 dark:text-rose-300">إلزامي</span>' : '') +
        '    </div>' +
        '    <span class="dve-status-pill text-[11px] font-bold px-2 py-0.5 rounded-full ' + (isPresent && isValid && isStamped && isMatched ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300') + '">' +
        (isPresent && isValid && isStamped && isMatched ? 'مستوفى بالكامل' : 'قيد المراجعة / ناقص') + '</span>' +
        '  </div>' +
        '  <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-semibold">' +
        '    <label class="flex items-center gap-1.5 p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-pointer">' +
        '      <input type="checkbox" class="dve-check-present rounded text-orange-600" onchange="window.updateDveRowStatus(this)" ' + (isPresent ? 'checked' : '') + '> <span>المستند متوفر</span>' +
        '    </label>' +
        (it.check_validity ?
          '<label class="flex items-center gap-1.5 p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-pointer">' +
          '  <input type="checkbox" class="dve-check-valid rounded text-orange-600" onchange="window.updateDveRowStatus(this)" ' + (isValid ? 'checked' : '') + '> <span>ساري الصلاحية</span>' +
          '</label>' : '') +
        (it.check_stamp ?
          '<label class="flex items-center gap-1.5 p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-pointer">' +
          '  <input type="checkbox" class="dve-check-stamp rounded text-orange-600" onchange="window.updateDveRowStatus(this)" ' + (isStamped ? 'checked' : '') + '> <span>الأختام صحيحة</span>' +
          '</label>' : '') +
        (it.check_match ?
          '<label class="flex items-center gap-1.5 p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-pointer">' +
          '  <input type="checkbox" class="dve-check-match rounded text-orange-600" onchange="window.updateDveRowStatus(this)" ' + (isMatched ? 'checked' : '') + '> <span>البيانات متطابقة</span>' +
          '</label>' : '') +
        '  </div>' +
        '  <input class="dve-notes field w-full text-[11px]" placeholder="ملاحظة أو سبب النقص إن وجد..." value="' + eh(note) + '">' +
        '</div>';
    }).join('');

    window.refreshDveWhatsappBtn();
  };

  window.closeDocVerificationModal = function () {
    var m = $('doc-verify-exec-modal');
    if (m) { m.classList.add('hidden'); m.classList.remove('flex'); }
  };

  window.updateDveRowStatus = function (el) {
    var row = el.closest('.dve-item-row');
    if (!row) return;
    var pres = row.querySelector('.dve-check-present') ? row.querySelector('.dve-check-present').checked : false;
    var val = row.querySelector('.dve-check-valid') ? row.querySelector('.dve-check-valid').checked : true;
    var stmp = row.querySelector('.dve-check-stamp') ? row.querySelector('.dve-check-stamp').checked : true;
    var mtch = row.querySelector('.dve-check-match') ? row.querySelector('.dve-check-match').checked : true;

    var pill = row.querySelector('.dve-status-pill');
    var isOk = pres && val && stmp && mtch;
    if (pill) {
      pill.className = 'dve-status-pill text-[11px] font-bold px-2 py-0.5 rounded-full ' + (isOk ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300');
      pill.textContent = isOk ? 'مستوفى بالكامل' : (pres ? 'به ملاحظات / منتهي' : 'غير متوفر');
    }
    window.refreshDveWhatsappBtn();
  };

  window.refreshDveWhatsappBtn = function () {
    var m = $('doc-verify-exec-modal');
    var slot = $('dve-whatsapp-slot');
    if (!m || !slot) return;

    var missing = [];
    var rows = m.querySelectorAll('.dve-item-row');
    rows.forEach(function (r) {
      var pres = r.querySelector('.dve-check-present') ? r.querySelector('.dve-check-present').checked : false;
      var val = r.querySelector('.dve-check-valid') ? r.querySelector('.dve-check-valid').checked : true;
      var stmp = r.querySelector('.dve-check-stamp') ? r.querySelector('.dve-check-stamp').checked : true;
      var mtch = r.querySelector('.dve-check-match') ? r.querySelector('.dve-check-match').checked : true;
      if (!pres || !val || !stmp || !mtch) {
        var t = r.getAttribute('data-title');
        var reason = !pres ? 'غير متوفر' : (!val ? 'منتهي الصلاحية' : (!stmp ? 'ينقصه الختم' : 'عدم تطابق بيانات'));
        missing.push(t + ' (' + reason + ')');
      }
    });

    var phone = m.getAttribute('data-phone') || '';
    var client = m.getAttribute('data-client') || '';
    var svc = m.getAttribute('data-service') || '';
    var tx = m.getAttribute('data-tx') || '';

    if (missing.length && phone) {
      var cleanPhone = phone.replace(/\D/g, '');
      if (cleanPhone.length >= 10) {
        if (cleanPhone.startsWith('01')) cleanPhone = '2' + cleanPhone;
        var msg = 'مرحباً أستاذ ' + client + '،\nبخصوص طلبكم لدى تساهيل (خدمة: ' + svc + ' - معاملة رقم ' + tx + ')، نود إحاطتكم بوجود نواقص يلزم استيفاؤها لاستكمال التنفيذ:\n• ' + missing.join('\n• ') + '\nشاكرين تعاونكم معنا.';
        var waUrl = 'https://wa.me/' + cleanPhone + '?text=' + encodeURIComponent(msg);
        slot.innerHTML = '<a href="' + waUrl + '" target="_blank" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow transition">' +
          '<i class="fa-brands fa-whatsapp text-sm"></i> تنبيه العميل بالنواقص عبر واتساب (' + missing.length + ')</a>';
        return;
      }
    }
    slot.innerHTML = '';
  };

  window.saveDocVerifications = async function () {
    var m = $('doc-verify-exec-modal');
    if (!m) return;
    var lineId = m.getAttribute('data-line-id');
    if (!lineId || !window.sbClient) return;

    var rows = m.querySelectorAll('.dve-item-row');
    var records = [];
    var hasMissingRequired = false;

    rows.forEach(function (r) {
      var chkId = r.getAttribute('data-item-id');
      var title = r.getAttribute('data-title');
      var isReq = r.getAttribute('data-required') === '1';
      var pres = r.querySelector('.dve-check-present') ? r.querySelector('.dve-check-present').checked : false;
      var val = r.querySelector('.dve-check-valid') ? r.querySelector('.dve-check-valid').checked : true;
      var stmp = r.querySelector('.dve-check-stamp') ? r.querySelector('.dve-check-stamp').checked : true;
      var mtch = r.querySelector('.dve-check-match') ? r.querySelector('.dve-check-match').checked : true;
      var note = r.querySelector('.dve-notes') ? r.querySelector('.dve-notes').value.trim() : '';

      var isPassed = pres && val && stmp && mtch;
      if (isReq && !isPassed) hasMissingRequired = true;

      records.push({
        line_id: Number(lineId),
        checklist_id: chkId ? Number(chkId) : null,
        item_title: title,
        is_present: pres,
        is_valid: val,
        is_stamped: stmp,
        is_matched: mtch,
        status: isPassed ? 'passed' : (!pres ? 'missing' : 'rejected'),
        notes: note || null,
        verified_by: window.__userName || 'موظف',
        verified_at: new Date().toISOString()
      });
    });

    var btn = $('dve-save-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> حفظ...'; }

    try {
      await window.sbClient.from('request_line_doc_verifications').delete().eq('line_id', lineId);
      if (records.length) {
        var ins = await window.sbClient.from('request_line_doc_verifications').insert(records);
        if (ins.error) throw ins.error;
      }
      delete cachedVerifications[lineId];

      if (typeof window.showToast === 'function') {
        if (hasMissingRequired) {
          window.showToast('تم حفظ تقرير الفحص (يوجد مستندات إلزامية ناقصة تمنع بدء التنفيذ)', 'warning', 6000);
        } else {
          window.showToast('تم اعتماد واجتياز فحص المستندات بالكامل بنجاح ✔', 'success', 5000);
        }
      }
      window.closeDocVerificationModal();
      if (typeof window.openTxModal === 'function' && window.openTxCurrent) {
        window.openTxModal(window.openTxCurrent);
      }
    } catch (err) {
      if (typeof window.showError === 'function') window.showError('تعذر حفظ تقرير الفحص', err);
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check-double"></i> اعتماد الفحص وحفظ التقرير'; }
    }
  };

  // حقن زر فحص المستندات في تفاصيل كل خدمة داخل مودال المعاملة
  wrap('buildServiceDetailCard', function (orig) {
    return function (line, index, context) {
      var html = orig.apply(this, arguments);
      if (!line || !line.id) return html;

      var btnHtml = '<div class="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px]">' +
        '  <span class="text-slate-400"><i class="fa-solid fa-shield-halved text-orange-500 ms-1"></i> بوابة مراجعة المستندات</span>' +
        '  <button type="button" onclick="window.openDocVerificationModal(' + line.id + ')" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-50 hover:bg-orange-100 dark:bg-orange-950/40 dark:hover:bg-orange-900/60 text-orange-700 dark:text-orange-300 font-bold transition">' +
        '    <i class="fa-solid fa-clipboard-check"></i> فحص المستندات والاستيفاء' +
        '  </button>' +
        '</div>';

      return html.replace(/<\/div>\s*$/, btnHtml + '</div>');
    };
  });

  // إضافة زر إعداد القوالب في قائمة المدير داخل قسم الإدارة
  function injectManagerMenuButton() {
    var menu = $('nav-menu');
    if (!menu || !isMgr()) return;
    if ($('nav-doc-checklists-btn')) return;

    var btn = document.createElement('button');
    btn.id = 'nav-doc-checklists-btn';
    btn.type = 'button';
    btn.className = 'tab-btn';
    btn.innerHTML = '<i class="fa-solid fa-file-shield text-amber-600"></i><span>قوالب فحص المستندات</span>';
    btn.onclick = function () {
      if (typeof window.toggleNavMenu === 'function') window.toggleNavMenu();
      window.openDocChecklistManagerModal();
    };

    var body = menu.querySelector(':scope > section[data-mg="admin"] .mg-body');
    if (body) {
      body.appendChild(btn);
    } else {
      var foot = menu.querySelector(':scope > .r-logout-menu');
      if (foot) menu.insertBefore(btn, foot); else menu.appendChild(btn);
    }
  }

  wrap('toggleNavMenu', function (orig) {
    return function () {
      var r = orig.apply(this, arguments);
      injectManagerMenuButton();
      return r;
    };
  });

  wrap('loadInitialData', function (orig) {
    return function () {
      var res = orig.apply(this, arguments);
      setTimeout(injectManagerMenuButton, 300);
      return res;
    };
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectManagerMenuButton);
  } else {
    setTimeout(injectManagerMenuButton, 400);
  }

})();
