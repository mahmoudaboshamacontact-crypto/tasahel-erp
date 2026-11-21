/* =====================================================================
   js/81-courier-ux-refresh.js — تحسينات تجربة خط السير
   يحافظ على ثيم بوابة المندوب الحالي ويستخدم متغيرات الألوان الموجودة.
   ===================================================================== */
(function () {
  'use strict';
  if (window.__courierUxRefresh) return;
  window.__courierUxRefresh = true;

  function injectStyles() {
    if (document.getElementById('courier-ux-refresh-css')) return;
    var style = document.createElement('style');
    style.id = 'courier-ux-refresh-css';
    style.textContent = [
      '#courier-app #cp-route-stops{display:flex;flex-direction:column;gap:8px}',
      '#courier-app .cp-route-stop{box-sizing:border-box;min-width:0;transition:none}',
      '#courier-app .cp-route-stop:focus-within{outline:2px solid var(--ac);outline-offset:2px}',
      '#courier-app .cp-route-stop [data-route-move],#courier-app .cp-route-stop [data-route-remove]{min-height:36px;min-width:38px;padding:6px 10px;border:1px solid var(--bd);border-radius:10px;background:var(--fld);color:var(--tx);font:inherit;font-size:12px;font-weight:700;cursor:pointer}',
      '#courier-app .cp-route-stop [data-route-move]:disabled{opacity:.35;cursor:not-allowed}',
      '#courier-app .cp-route-stop [data-route-remove]{color:var(--cancel)}',
      '#courier-app .cp-route-stop a.cp-btn{min-height:36px;display:inline-flex;align-items:center;justify-content:center;padding:6px 10px;border:1px solid var(--bd);border-radius:10px;background:var(--fld);color:var(--tx);font-size:12px}',
      '#courier-app #cp-route-stops [draggable=true]{-webkit-user-select:none;user-select:none}',
      '@media(max-width:480px){#courier-app .cp-route-stop{padding:10px!important;gap:8px!important}#courier-app .cp-route-stop>div:nth-child(2){min-width:0}#courier-app .cp-route-stop [data-route-move],#courier-app .cp-route-stop [data-route-remove]{min-height:40px;min-width:42px}#courier-app #cp-route-stops{gap:6px}}',
      '@media(prefers-reduced-motion:reduce){#courier-app .cp-route-stop{transition:none!important}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectStyles, { once: true });
  } else {
    injectStyles();
  }
})();