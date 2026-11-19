/* =====================================================================
   js/78-batch2-polish.js — تظبيطات UI/RTL خفيفة بدون تعديل الملفات المقفولة
   - إبعاد زر الشات العائم (#ai-fab) عن الفوتر وآخر القائمة الجانبية
   - فك تداخل الأيقونات مع النصوص العربية في تابات المنفذين والموارد البشرية
   ===================================================================== */
(function () {
  'use strict';
  if (window.__batch2Polish) return;
  window.__batch2Polish = true;

  function injectCss() {
    if (document.getElementById('b2-polish-css')) return;
    var s = document.createElement('style');
    s.id = 'b2-polish-css';
    s.textContent = [
      'footer{padding-bottom:72px !important}',
      '#nav-menu{padding-bottom:84px !important}',
      '#tab-hr h1,#tab-hr h2,#tab-hr h3,#tab-couriers button,#tab-exec button,.p53-tab{display:inline-flex;align-items:center;gap:6px}',
      '#tab-hr h1 i,#tab-hr h2 i,#tab-couriers button i,.p53-tab i{margin:0 !important;flex-shrink:0}'
    ].join('\n');
    document.head.appendChild(s);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectCss);
  else injectCss();
})();
