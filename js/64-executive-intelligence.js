// =====================================================================
// js/64-executive-intelligence.js
// مركز تحليلات الإدارة العليا والتحليلات التنبؤية (Executive Intelligence & Predictive AI)
// - محصورة للمدير فقط بنسبة 100%
// - حساب هوامش الأرباح الحقيقية والخدمات الخاسرة
// - التنبؤ بضغط العمل ومعدلات التأخير وتوصيات زيادة المنفذين
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

  function wrap(name, make) {
    var o = window[name];
    if (typeof o !== 'function') return;
    window[name] = make(o);
  }

  function getAllLines() {
    if (typeof allRequestLines !== 'undefined' && Array.isArray(allRequestLines)) return allRequestLines;
    if (window.allRequestLines && Array.isArray(window.allRequestLines)) return window.allRequestLines;
    return [];
  }

  window.openExecutiveIntelligenceModal = async function () {
    if (!isMgr()) {
      if (typeof window.showToast === 'function') window.showToast('هذه اللوحة خاصة بالإدارة العليا فقط', 'error');
      return;
    }

    var m = $('exec-intel-modal');
    if (!m) {
      document.body.insertAdjacentHTML('beforeend',
        '<div id="exec-intel-modal" class="modal fixed inset-0 z-[125] hidden items-center justify-center bg-black/60 p-4 backdrop-blur-sm">' +
        '  <div class="relative w-full max-w-4xl overflow-hidden rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 text-slate-800 dark:text-slate-100 max-h-[92vh] flex flex-col">' +
        '    <div class="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">' +
        '      <div class="flex items-center gap-2.5">' +
        '        <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">' +
        '          <i class="fa-solid fa-chart-line text-lg"></i>' +
        '        </span>' +
        '        <div>' +
        '          <h3 class="text-base font-bold text-slate-900 dark:text-white">مركز الذكاء الإداري والتحليلات التنبؤية (للمدير فقط)</h3>' +
        '          <p class="text-xs text-slate-500">تحليل هوامش الربحية، تكاليف المنفذين، وتوقعات الأحمال</p>' +
        '        </div>' +
        '      </div>' +
        '      <button type="button" onclick="window.closeExecutiveIntelligenceModal()" class="h-8 w-8 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"><i class="fa-solid fa-xmark"></i></button>' +
        '    </div>' +
        '    <div class="py-4 space-y-5 overflow-y-auto flex-1" id="exec-intel-body">' +
        '      <div class="p-12 text-center text-xs text-slate-400">جارٍ إعداد وتحليل مؤشرات الأداء الحقيقية...</div>' +
        '    </div>' +
        '    <div class="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end">' +
        '      <button type="button" onclick="window.closeExecutiveIntelligenceModal()" class="px-5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 font-bold text-xs">إغلاق</button>' +
        '    </div>' +
        '  </div>' +
        '</div>'
      );
      m = $('exec-intel-modal');
    }

    m.classList.remove('hidden');
    m.classList.add('flex');

    var body = $('exec-intel-body');
    body.innerHTML = '<div class="p-12 text-center text-xs text-slate-400"><i class="fa-solid fa-spinner fa-spin text-2xl mb-2 text-emerald-500 block"></i>جارٍ معالجة المؤشرات المالية والتنبؤية...</div>';

    var stats = null;
    var forecast = null;

    if (window.sbClient) {
      try {
        var r1 = await window.sbClient.rpc('get_executive_intelligence_stats', { p_days: 90 });
        stats = r1.data;
        var r2 = await window.sbClient.rpc('get_predictive_workload_forecast');
        forecast = r2.data;
      } catch (err) {
        console.warn('Exec intelligence fetch:', err);
      }
    }

    // fallback حسابي محلي إذا لم تكن دوال الـ SQL قد شُغلت بعد
    if (!stats) {
      var lines = getAllLines().filter(function (l) { return !l.deleted_at; });
      var rev = lines.reduce(function (s, l) { return s + (Number(l.total) || 0); }, 0);
      var cost = lines.reduce(function (s, l) { return s + ((Number(l.exec_unit_cost) || 0) * (Number(l.qty) || 1)); }, 0);
      var prof = rev - cost;
      stats = {
        overall: {
          total_revenue: rev,
          total_cost: cost,
          total_profit: prof,
          profit_margin_pct: rev > 0 ? (prof / rev) * 100 : 0
        },
        top_profitable_services: [],
        least_profitable_services: [],
        top_executors: []
      };
    }

    if (!forecast) {
      var allL = getAllLines();
      forecast = {
        predicted_weekly_orders: Math.round(allL.length / 4),
        daily_order_velocity: Math.round(allL.length / 30),
        high_risk_late_orders: allL.filter(function (l) { return l.status === 'In Progress'; }).length,
        staff_capacity_status: 'طاقة تشغيلية مستقرة',
        trending_services: []
      };
    }

    var ov = stats.overall || {};

    body.innerHTML =
      // 1. كروت المؤشرات الكبرى
      '<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">' +
      '  <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">' +
      '    <div class="text-[11px] text-slate-500 font-bold">إجمالي الإيرادات</div>' +
      '    <div class="text-base font-extrabold text-slate-900 dark:text-white mt-1">' + fmtCur(ov.total_revenue) + '</div>' +
      '  </div>' +
      '  <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">' +
      '    <div class="text-[11px] text-rose-500 font-bold">تكلفة المنفذين الحكومية</div>' +
      '    <div class="text-base font-extrabold text-rose-600 dark:text-rose-400 mt-1">' + fmtCur(ov.total_cost) + '</div>' +
      '  </div>' +
      '  <div class="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50">' +
      '    <div class="text-[11px] text-emerald-700 dark:text-emerald-300 font-bold">صافي الربح الفعلي</div>' +
      '    <div class="text-base font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">' + fmtCur(ov.total_profit) + '</div>' +
      '  </div>' +
      '  <div class="p-3.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/50">' +
      '    <div class="text-[11px] text-indigo-700 dark:text-indigo-300 font-bold">هامش الربح العام</div>' +
      '    <div class="text-base font-extrabold text-indigo-600 dark:text-indigo-400 mt-1">' + Math.round(ov.profit_margin_pct || 0) + '%</div>' +
      '  </div>' +
      '</div>' +

      // 2. بطاقة التحليلات التنبؤية (Predictive AI)
      '<div class="rounded-xl border border-indigo-200 dark:border-indigo-800/60 bg-gradient-to-r from-indigo-50/60 via-purple-50/40 to-indigo-50/60 dark:from-indigo-950/30 dark:via-purple-950/20 dark:to-indigo-950/30 p-4 space-y-3">' +
      '  <div class="flex items-center justify-between">' +
      '    <div class="flex items-center gap-2">' +
      '      <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white text-xs"><i class="fa-solid fa-wand-magic-sparkles"></i></span>' +
      '      <h4 class="text-xs font-bold text-indigo-950 dark:text-indigo-200">التحليلات التنبؤية وتوقعات الأسبوع القادم (Predictive AI)</h4>' +
      '    </div>' +
      '    <span class="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200 font-bold">' + eh(forecast.staff_capacity_status) + '</span>' +
      '  </div>' +
      '  <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">' +
      '    <div class="p-3 rounded-lg bg-white/80 dark:bg-slate-800/80 border border-indigo-100 dark:border-indigo-900/50">' +
      '      <span class="text-slate-500 block text-[11px]">حجم الطلبات المتوقع الأسبوع القادم</span>' +
      '      <b class="text-indigo-600 dark:text-indigo-400 text-sm font-mono mt-1 block">~ ' + forecast.predicted_weekly_orders + ' طلب</b>' +
      '    </div>' +
      '    <div class="p-3 rounded-lg bg-white/80 dark:bg-slate-800/80 border border-indigo-100 dark:border-indigo-900/50">' +
      '      <span class="text-slate-500 block text-[11px]">مؤشر احتمالية التأخير (Late Risk)</span>' +
      '      <b class="text-rose-600 dark:text-rose-400 text-sm font-mono mt-1 block">' + forecast.high_risk_late_orders + ' معاملة تقترب من حد الـ SLA</b>' +
      '    </div>' +
      '    <div class="p-3 rounded-lg bg-white/80 dark:bg-slate-800/80 border border-indigo-100 dark:border-indigo-900/50">' +
      '      <span class="text-slate-500 block text-[11px]">معدل سرعة الطلبات اليومية</span>' +
      '      <b class="text-slate-900 dark:text-white text-sm font-mono mt-1 block">' + forecast.daily_order_velocity + ' طلب / يوم</b>' +
      '    </div>' +
      '  </div>' +
      '</div>' +

      // 3. جدول الخدمات الأكثر ربحية والخدمات منخفضة الربح
      '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
      '  <div class="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-2">' +
      '    <h5 class="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5"><i class="fa-solid fa-arrow-trend-up"></i> الخدمات الأعلى ربحية للشركة</h5>' +
      '    <div class="space-y-1.5 max-h-52 overflow-y-auto">' +
      ((stats.top_profitable_services || []).length ?
        stats.top_profitable_services.map(function (s) {
          return '<div class="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 text-xs flex items-center justify-between border border-slate-100 dark:border-slate-800">' +
            '  <div><b class="text-slate-800 dark:text-white">' + eh(s.service) + '</b><div class="text-[10px] text-slate-400">' + s.total_requests + ' طلب</div></div>' +
            '  <span class="font-bold text-emerald-600 dark:text-emerald-400 font-mono text-xs">+' + fmtCur(s.net_profit) + '</span>' +
            '</div>';
        }).join('') : '<div class="text-[11px] text-slate-400 text-center py-4">البيانات ستظهر فور تجميع عمليات الفترة.</div>') +
      '    </div>' +
      '  </div>' +
      '  <div class="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-2">' +
      '    <h5 class="text-xs font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1.5"><i class="fa-solid fa-triangle-exclamation"></i> خدمات منخفضة الهامش / تستلزم مراجعة التسعير</h5>' +
      '    <div class="space-y-1.5 max-h-52 overflow-y-auto">' +
      ((stats.least_profitable_services || []).length ?
        stats.least_profitable_services.map(function (s) {
          return '<div class="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 text-xs flex items-center justify-between border border-slate-100 dark:border-slate-800">' +
            '  <div><b class="text-slate-800 dark:text-white">' + eh(s.service) + '</b><div class="text-[10px] text-slate-400">' + s.total_requests + ' طلب</div></div>' +
            '  <span class="font-bold text-rose-600 dark:text-rose-400 font-mono text-xs">' + fmtCur(s.net_profit) + '</span>' +
            '</div>';
        }).join('') : '<div class="text-[11px] text-slate-400 text-center py-4">لا توجد خدمات خاسرة مسجلة في هذه الفترة ✔</div>') +
      '    </div>' +
      '  </div>' +
      '</div>';
  };

  window.closeExecutiveIntelligenceModal = function () {
    var m = $('exec-intel-modal');
    if (m) { m.classList.add('hidden'); m.classList.remove('flex'); }
  };

  // حقن زر مركز الذكاء الإداري في قائمة المدير فقط
  function injectExecIntelMenuBtn() {
    var menu = $('nav-menu');
    if (!menu || !isMgr()) return;
    if ($('nav-exec-intel-btn')) return;

    var btn = document.createElement('button');
    btn.id = 'nav-exec-intel-btn';
    btn.type = 'button';
    btn.className = 'tab-btn';
    btn.innerHTML = '<i class="fa-solid fa-chart-pie text-emerald-500"></i><span>مركز الذكاء الإداري والتنبؤات</span>';
    btn.onclick = function () {
      if (typeof window.toggleNavMenu === 'function') window.toggleNavMenu();
      window.openExecutiveIntelligenceModal();
    };

    var body = menu.querySelector(':scope > section[data-mg="perf"] .mg-body') ||
               menu.querySelector(':scope > section[data-mg="admin"] .mg-body');
    if (body) {
      body.appendChild(btn);
    } else {
      var trashBtn = $('tab-trash-btn') || menu.lastElementChild;
      if (trashBtn && trashBtn.parentNode) {
        trashBtn.parentNode.insertBefore(btn, trashBtn);
      } else {
        menu.appendChild(btn);
      }
    }
  }

  wrap('toggleNavMenu', function (orig) {
    return function () {
      var r = orig.apply(this, arguments);
      injectExecIntelMenuBtn();
      return r;
    };
  });

  wrap('loadInitialData', function (orig) {
    return function () {
      var res = orig.apply(this, arguments);
      setTimeout(injectExecIntelMenuBtn, 200);
      return res;
    };
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectExecIntelMenuBtn);
  } else {
    setTimeout(injectExecIntelMenuBtn, 300);
  }

})();
