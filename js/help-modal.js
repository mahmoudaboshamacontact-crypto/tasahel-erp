// js/help-modal.js — دليل استخدام السيستم (8 سطور بالمصري)
(function () {
  'use strict';

  function initHelpModal() {
    var navMenu = document.getElementById('nav-menu');
    if (!navMenu || document.getElementById('btn-help-modal')) return;

    var btn = document.createElement('button');
    btn.id = 'btn-help-modal';
    btn.type = 'button';
    btn.className = 'tab-btn font-bold text-amber-600 dark:text-amber-400';
    btn.innerHTML = '<i class="fa-solid fa-circle-question text-amber-500"></i><span>إزاي أستخدم السيستم؟</span>';
    btn.onclick = function (e) {
      if (e) e.stopPropagation();
      if (typeof window.toggleNavMenu === 'function' && !navMenu.classList.contains('hidden')) {
        window.toggleNavMenu();
      }
      openHelpModal();
    };

    var hr = navMenu.querySelector('hr');
    if (hr) {
      navMenu.insertBefore(btn, hr);
    } else {
      navMenu.appendChild(btn);
    }

    if (!document.getElementById('help-modal')) {
      var modalHtml = '<div id="help-modal" class="modal fixed inset-0 z-[130] hidden items-center justify-center bg-black/60 p-4" onclick="if(event.target===this)closeHelpModal()">' +
        '<div class="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" onclick="event.stopPropagation()">' +
        '  <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-3.5 bg-slate-50 dark:bg-slate-800/40">' +
        '    <div class="flex items-center gap-3">' +
        '      <div class="h-9 w-9 rounded-xl bg-brand-600 text-slate-950 flex items-center justify-center font-bold text-base"><i class="fa-solid fa-circle-question"></i></div>' +
        '      <div><h3 class="font-bold text-slate-900 dark:text-white text-sm sm:text-base">إزاي أستخدم السيستم؟</h3><p class="text-xs text-slate-500">دليل مبسط وسريع لأهم مميزات تساهيل</p></div>' +
        '    </div>' +
        '    <button type="button" onclick="closeHelpModal()" class="h-8 w-8 rounded-lg text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 flex items-center justify-center"><i class="fa-solid fa-xmark text-lg"></i></button>' +
        '  </div>' +
        '  <div class="p-4 sm:p-5 overflow-y-auto space-y-2.5 text-xs leading-relaxed">' +
        '    <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80">' +
        '      <b class="text-brand-600 dark:text-brand-400 ms-1">١. معاملة جديدة:</b>' +
        '      <span class="text-slate-700 dark:text-slate-200">سجّل بيانات العميل وبنود الخدمات اللي طالبها، واحسب الإجمالي والخصم بضغطة زرار.</span>' +
        '    </div>' +
        '    <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80">' +
        '      <b class="text-brand-600 dark:text-brand-400 ms-1">٢. تفاصيل المعاملة:</b>' +
        '      <span class="text-slate-700 dark:text-slate-200">افتح أي معاملة عشان تتابع بنودها، تعدّل بياناتها، أو تطبع الإيصال الرسمي.</span>' +
        '    </div>' +
        '    <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80">' +
        '      <b class="text-brand-600 dark:text-brand-400 ms-1">٣. رابط المتابعة وQR:</b>' +
        '      <span class="text-slate-700 dark:text-slate-200">ابعت للعميل رابط مباشر وQR يفتحله كارت متابعة لحالة ورقه لحظة بلحظة.</span>' +
        '    </div>' +
        '    <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80">' +
        '      <b class="text-brand-600 dark:text-brand-400 ms-1">٤. مسار العمل:</b>' +
        '      <span class="text-slate-700 dark:text-slate-200">تابع كل خدمة خطوة بخطوة من بداية استلام الورق لحد ما تخلص بالكامل.</span>' +
        '    </div>' +
        '    <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80">' +
        '      <b class="text-brand-600 dark:text-brand-400 ms-1">٥. المستندات:</b>' +
        '      <span class="text-slate-700 dark:text-slate-200">افحص الأوراق المطلوبة لكل خدمة، واعرف إيه اللي ناقص عشان تبلّغ العميل فوراً.</span>' +
        '    </div>' +
        '    <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80">' +
        '      <b class="text-brand-600 dark:text-brand-400 ms-1">٦. المهام:</b>' +
        '      <span class="text-slate-700 dark:text-slate-200">رتّب شغلك اليومي ومهامك العاجلة ومواعيد المتابعة مع المنفذين والعملاء.</span>' +
        '    </div>' +
        '    <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80">' +
        '      <b class="text-brand-600 dark:text-brand-400 ms-1">٧. الإشعارات:</b>' +
        '      <span class="text-slate-700 dark:text-slate-200">جرس التنبيهات بيفكرك بأي تحديث جديد، مهام مستحقة، أو رسايل في الشات.</span>' +
        '    </div>' +
        '    <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80">' +
        '      <b class="text-brand-600 dark:text-brand-400 ms-1">٨. المتأخرات:</b>' +
        '      <span class="text-slate-700 dark:text-slate-200">شاشة بتوريك أي معاملة عدّت موعد تسليمها عشان تتحرك فيها بسرعة وما تتأخرش.</span>' +
        '    </div>' +
        '  </div>' +
        '  <div class="border-t border-slate-100 dark:border-slate-800 px-5 py-3 bg-slate-50 dark:bg-slate-800/40 flex justify-end">' +
        '    <button type="button" onclick="closeHelpModal()" class="px-4 py-2 rounded-xl bg-brand-600 text-slate-950 font-bold text-xs hover:bg-brand-500 transition">فهمت، شكراً</button>' +
        '  </div>' +
        '</div></div>';
      document.body.insertAdjacentHTML('beforeend', modalHtml);
    }
  }

  window.openHelpModal = function () {
    var m = document.getElementById('help-modal');
    if (m) {
      m.classList.remove('hidden');
      m.classList.add('flex');
    }
  };

  window.closeHelpModal = function () {
    var m = document.getElementById('help-modal');
    if (m) {
      m.classList.add('hidden');
      m.classList.remove('flex');
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHelpModal);
  } else {
    initHelpModal();
  }
})();
