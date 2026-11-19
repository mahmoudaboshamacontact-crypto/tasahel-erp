// =====================================================================
// js/63-customer-360.js
// ملف العميل الشامل (Customer 360 Profile)
// - كشف حساب متكامل وفوري لكل عميل برقم هاتفه أو اسمه
// - بحث فوري من الذاكرة المحلية وقاعدة البيانات مباشرة
// - تاريخ المعاملات السابقة وحالاتها ومواعيدها
// - سجل الشكاوى والاستفسارات وملاحظات خدمة العملاء
// =====================================================================

(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function isMgr() { return window.__role === 'manager'; }
  function eh(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmtCur(n) {
    return (Number(n) || 0).toLocaleString('ar-EG') + ' ج.م';
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

  window.openCustomer360Modal = async function (searchPhone) {
    var m = $('c360-modal');
    if (!m) {
      document.body.insertAdjacentHTML('beforeend',
        '<div id="c360-modal" class="modal fixed inset-0 z-[125] hidden items-center justify-center bg-black/60 p-4 backdrop-blur-sm">' +
        '  <div class="relative w-full max-w-3xl overflow-hidden rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 text-slate-800 dark:text-slate-100 max-h-[92vh] flex flex-col">' +
        '    <div class="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">' +
        '      <div class="flex items-center gap-2.5">' +
        '        <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400">' +
        '          <i class="fa-solid fa-address-card text-lg"></i>' +
        '        </span>' +
        '        <div>' +
        '          <h3 class="text-base font-bold text-slate-900 dark:text-white">ملف العميل الشامل (Customer 360°)</h3>' +
        '          <p class="text-xs text-slate-500">تحليل تاريخ العميل، المعاملات، المبالغ، والشكاوى</p>' +
        '        </div>' +
        '      </div>' +
        '      <button type="button" onclick="window.closeCustomer360Modal()" class="h-8 w-8 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"><i class="fa-solid fa-xmark"></i></button>' +
        '    </div>' +
        '    <div class="py-3 border-b border-slate-200 dark:border-slate-800 flex gap-2">' +
        '      <input id="c360-search-input" class="field flex-1 text-xs" placeholder="أدخل رقم تليفون العميل (مثال: 010...) أو اسمه..." onkeydown="if(event.key===\'Enter\')window.searchCustomer360()">' +
        '      <button type="button" onclick="window.searchCustomer360()" class="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs flex items-center gap-1.5 shadow"><i class="fa-solid fa-magnifying-glass"></i> بحث شامل</button>' +
        '    </div>' +
        '    <div class="py-4 space-y-4 overflow-y-auto flex-1" id="c360-body">' +
        '      <div class="p-8 text-center text-xs text-slate-400">أدخل رقم هاتف العميل للبحث الفوري في قاعدة البيانات والطلبات الحالية.</div>' +
        '    </div>' +
        '    <div class="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end">' +
        '      <button type="button" onclick="window.closeCustomer360Modal()" class="px-5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 font-bold text-xs">إغلاق</button>' +
        '    </div>' +
        '  </div>' +
        '</div>'
      );
      m = $('c360-modal');
    }

    m.classList.remove('hidden');
    m.classList.add('flex');

    if (searchPhone) {
      var inp = $('c360-search-input');
      if (inp) inp.value = searchPhone;
      window.searchCustomer360();
    }
  };

  window.closeCustomer360Modal = function () {
    var m = $('c360-modal');
    if (m) { m.classList.add('hidden'); m.classList.remove('flex'); }
  };

  window.searchCustomer360 = async function () {
    var q = $('c360-search-input') ? $('c360-search-input').value.trim() : '';
    var body = $('c360-body');
    if (!q || !body) return;

    body.innerHTML = '<div class="p-8 text-center text-xs text-slate-400"><i class="fa-solid fa-spinner fa-spin text-xl text-sky-500 mb-2 block"></i>جارٍ جلب وتجميع سجلات العميل من قاعدة البيانات...</div>';

    var clean = q.replace(/\D/g, '');
    var allLines = getAllLines();
    var matchedLines = [];
    var seenIds = new Set();

    // 1. بحث في الذاكرة المحلية أولاً
    allLines.forEach(function (l) {
      var p = String(l.phone || '').replace(/\D/g, '');
      var matchPhone = clean.length >= 6 && p.indexOf(clean) !== -1;
      var matchName = l.client_name && l.client_name.toLowerCase().indexOf(q.toLowerCase()) !== -1;
      if (matchPhone || matchName) {
        if (!seenIds.has(l.id)) { seenIds.add(l.id); matchedLines.push(l); }
      }
    });

    // 2. بحث مباشر وسريع في Supabase لضمان جلب كل المعاملات حتى لو لم تكن محملة في الذاكرة
    if (window.sbClient) {
      try {
        var query = window.sbClient.from('request_lines').select('*').is('deleted_at', null);
        if (clean.length >= 6) {
          query = query.ilike('phone', '%' + clean + '%');
        } else {
          query = query.ilike('client_name', '%' + q + '%');
        }
        var res = await query.order('received_at', { ascending: false }).limit(60);
        if (res.data && res.data.length) {
          res.data.forEach(function (l) {
            if (!seenIds.has(l.id)) { seenIds.add(l.id); matchedLines.push(l); }
          });
        }
      } catch (e) {
        console.warn('Supabase C360 search:', e);
      }
    }

    if (!matchedLines.length) {
      body.innerHTML = '<div class="p-8 text-center text-xs text-slate-400 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">' +
        '<i class="fa-solid fa-user-slash text-2xl text-slate-300 dark:text-slate-600 mb-2 block"></i>' +
        'لم يتم العثور على أي معاملات مسجلة برقم الهاتف "' + eh(q) + '". تأكد من صحة الرقم وجرب مرة أخرى.</div>';
      return;
    }

    // ترتيب المعاملات من الأحدث للأقدم
    matchedLines.sort(function (a, b) {
      var da = new Date(b.received_at || b.created_at || 0);
      var db = new Date(a.received_at || a.created_at || 0);
      return da - db;
    });

    var clientName = matchedLines[0].client_name || 'عميل';
    var clientPhone = matchedLines[0].phone || q;
    var totalSpent = matchedLines.reduce(function (sum, l) { return sum + (Number(l.total) || 0); }, 0);
    var activeCount = matchedLines.filter(function (l) { return ['Under Review', 'In Progress', 'Pending Exec', 'Pending Client'].indexOf(l.status) !== -1; }).length;
    var doneCount = matchedLines.filter(function (l) { return ['Delivered', 'Complete'].indexOf(l.status) !== -1; }).length;

    // جلب الشكاوى والملاحظات من السيرفر
    var notes = [];
    if (window.sbClient && clientPhone) {
      try {
        var nr = await window.sbClient
          .from('client_360_notes')
          .select('*')
          .eq('phone', clientPhone)
          .order('created_at', { ascending: false });
        notes = nr.data || [];
      } catch (e) { /* ignore */ }
    }

    var waPhone = String(clientPhone).replace(/\D/g, '');
    if (waPhone.startsWith('01')) waPhone = '2' + waPhone;
    var waUrl = 'https://wa.me/' + waPhone;

    body.innerHTML =
      // 1. بطاقة الهيدر السريعة
      '<div class="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">' +
      '  <div>' +
      '    <div class="flex items-center gap-2">' +
      '      <h4 class="font-bold text-sm text-slate-900 dark:text-white">' + eh(clientName) + '</h4>' +
      '      <span class="font-mono text-xs text-slate-500 dir-ltr bg-white dark:bg-slate-900 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">' + eh(clientPhone) + '</span>' +
      '    </div>' +
      '    <p class="text-xs text-slate-400 mt-0.5">عميل مسجل لدى تساهيل • ' + matchedLines.length + ' بند / طلب مسجل</p>' +
      '  </div>' +
      '  <div class="flex items-center gap-2">' +
      '    <a href="' + waUrl + '" target="_blank" class="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 shadow"><i class="fa-brands fa-whatsapp"></i> واتساب</a>' +
      '    <a href="tel:' + eh(clientPhone) + '" class="px-3 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-white text-xs font-bold flex items-center gap-1"><i class="fa-solid fa-phone"></i> اتصال</a>' +
      '  </div>' +
      '</div>' +

      // 2. كروت الإحصائيات (KPIs)
      '<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">' +
      '  <div class="p-3 rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-100 dark:border-sky-900/40">' +
      '    <div class="text-[11px] text-sky-700 dark:text-sky-300 font-bold">إجمالي التعاملات</div>' +
      '    <div class="text-sm font-extrabold text-sky-950 dark:text-sky-100 mt-1">' + fmtCur(totalSpent) + '</div>' +
      '  </div>' +
      '  <div class="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40">' +
      '    <div class="text-[11px] text-amber-700 dark:text-amber-300 font-bold">طلبات نشطة الآن</div>' +
      '    <div class="text-sm font-extrabold text-amber-950 dark:text-amber-100 mt-1">' + activeCount + '</div>' +
      '  </div>' +
      '  <div class="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40">' +
      '    <div class="text-[11px] text-emerald-700 dark:text-emerald-300 font-bold">طلبات مكتملة</div>' +
      '    <div class="text-sm font-extrabold text-emerald-950 dark:text-emerald-100 mt-1">' + doneCount + '</div>' +
      '  </div>' +
      '  <div class="p-3 rounded-xl bg-violet-50 dark:bg-violet-950/30 border border-violet-100 dark:border-violet-900/40">' +
      '    <div class="text-[11px] text-violet-700 dark:text-violet-300 font-bold">الشكاوى المسجلة</div>' +
      '    <div class="text-sm font-extrabold text-violet-950 dark:text-violet-100 mt-1">' + notes.length + '</div>' +
      '  </div>' +
      '</div>' +

      // 3. سجل الشكاوى وخدمة العملاء
      '<div class="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">' +
      '  <div class="flex items-center justify-between">' +
      '    <h5 class="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5"><i class="fa-solid fa-headset text-orange-500"></i> ملاحظات خدمة العملاء والشكاوى (' + notes.length + ')</h5>' +
      '  </div>' +
      '  <div class="flex gap-2">' +
      '    <input id="c360-new-note" class="field flex-1 text-xs" placeholder="أضف ملاحظة أو شكوى جديدة للعميل...">' +
      '    <button type="button" onclick="window.saveCustomer360Note(\'' + eh(clientPhone) + '\')" class="px-3.5 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs"><i class="fa-solid fa-plus"></i> إضافة</button>' +
      '  </div>' +
      '  <div class="space-y-2">' +
      (notes.length ?
        notes.map(function (n) {
          return '<div class="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 text-xs flex items-start justify-between gap-2 border border-slate-100 dark:border-slate-800">' +
            '  <div><b class="text-slate-700 dark:text-slate-200">' + eh(n.body) + '</b><div class="text-[10px] text-slate-400 mt-0.5">سجلها: ' + eh(n.created_by) + ' • ' + new Date(n.created_at).toLocaleDateString('ar-EG') + '</div></div>' +
            '</div>';
        }).join('') :
        '<div class="text-[11px] text-slate-400 text-center py-2">لا توجد شكاوى أو ملاحظات مسجلة على هذا العميل.</div>') +
      '  </div>' +
      '</div>' +

      // 4. جدول المعاملات التاريخي
      '<div class="space-y-2">' +
      '  <h5 class="text-xs font-bold text-slate-800 dark:text-slate-100"><i class="fa-solid fa-clock-rotate-left text-slate-400 ms-1"></i> جميع المعاملات السابقة (' + matchedLines.length + '):</h5>' +
      '  <div class="space-y-1.5 max-h-60 overflow-y-auto">' +
      matchedLines.map(function (l) {
        return '<div class="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/40 flex items-center justify-between text-xs cursor-pointer hover:border-sky-500 transition" onclick="window.closeCustomer360Modal(); if(window.openTxModal) window.openTxModal(\'' + eh(l.transaction_id) + '\');">' +
          '  <div>' +
          '    <b class="text-slate-900 dark:text-white">' + eh(l.service) + '</b>' +
          '    <div class="text-[11px] text-slate-400 mt-0.5 font-mono">TX: ' + eh(l.transaction_id) + ' • ' + (l.received_at ? new Date(l.received_at).toLocaleDateString('ar-EG') : '-') + '</div>' +
          '  </div>' +
          '  <div class="text-end">' +
          '    <div class="font-bold text-emerald-600 dark:text-emerald-400 font-mono">' + fmtCur(l.total) + '</div>' +
          '    <span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-semibold">' + eh(l.status) + '</span>' +
          '  </div>' +
          '</div>';
      }).join('') +
      '  </div>' +
      '</div>';
  };

  window.saveCustomer360Note = async function (phone) {
    var inp = $('c360-new-note');
    var txt = inp ? inp.value.trim() : '';
    if (!txt || !phone || !window.sbClient) return;

    try {
      var noteRes = await window.sbClient.from('client_360_notes').insert({
        phone: phone,
        body: txt,
        created_by: window.__userName || 'موظف'
      });
      if (noteRes.error) throw noteRes.error;
      if (typeof window.showToast === 'function') window.showToast('تمت إضافة الملاحظة بنجاح ✔', 'success');
      window.searchCustomer360();
    } catch (err) {
      if (typeof window.showError === 'function') window.showError('تعذر الحفظ', err);
    }
  };

  // حقن زر Customer 360 داخل القائمة
  function placeC360Btn() {
    var menu = $('nav-menu');
    if (!menu || $('nav-c360-btn')) return;

    var btn = document.createElement('button');
    btn.id = 'nav-c360-btn';
    btn.type = 'button';
    btn.className = 'tab-btn';
    btn.innerHTML = '<i class="fa-solid fa-address-card text-sky-500"></i><span>ملف العميل الشامل (360°)</span>';
    btn.onclick = function () {
      if (typeof window.toggleNavMenu === 'function') window.toggleNavMenu();
      window.openCustomer360Modal();
    };

    var body = menu.querySelector(':scope > section[data-mg="ops"] .mg-body') ||
               menu.querySelector(':scope > section[data-mg="follow"] .mg-body');
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
      placeC360Btn();
      return r;
    };
  });

  wrap('loadInitialData', function (orig) {
    return function () {
      var res = orig.apply(this, arguments);
      setTimeout(placeC360Btn, 200);
      return res;
    };
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', placeC360Btn);
  } else {
    setTimeout(placeC360Btn, 300);
  }

})();
