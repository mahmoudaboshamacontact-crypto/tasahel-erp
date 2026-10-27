/* القائمة: نقاط ماك (أحمر = إغلاق، أصفر − = طي/فرد) + تعتيم الخلفية طول ما القائمة مفتوحة */
(function () {
  'use strict';
  if (window.__sbPolish) return; window.__sbPolish = true;
  function init() {
    var menu = document.getElementById('nav-menu'); if (!menu) return;
    var scrim = document.createElement('div'); scrim.id = 'gl-scrim'; document.body.appendChild(scrim);
    scrim.addEventListener('click', function () { if (typeof window.closeNavMenu === 'function') window.closeNavMenu(); });
    function sync() { scrim.classList.toggle('on', !menu.classList.contains('hidden')); }
    try { new MutationObserver(sync).observe(menu, { attributes: true, attributeFilter: ['class'] }); } catch (e) {}
    sync();
    function dots() {
      var head = menu.querySelector('.gl-head'); if (!head || head.querySelector('.gl-dots')) return !!head;
      var d = document.createElement('div'); d.className = 'gl-dots';
      d.innerHTML = '<button type="button" class="gl-dot red" title="إغلاق" aria-label="إغلاق">×</button>' +
                    '<button type="button" class="gl-dot yellow" title="طي / فرد" aria-label="طي أو فرد">−</button>';
      head.insertBefore(d, head.firstChild);
      d.querySelector('.red').addEventListener('click', function (e) { e.stopPropagation(); if (typeof window.closeNavMenu === 'function') window.closeNavMenu(); });
      d.querySelector('.yellow').addEventListener('click', function (e) { e.stopPropagation(); var t = menu.querySelector('.gl-toggle'); if (t) t.click(); });
      return true;
    }
    if (!dots()) { var n = 0, iv = setInterval(function () { if (dots() || ++n > 20) clearInterval(iv); }, 150); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
