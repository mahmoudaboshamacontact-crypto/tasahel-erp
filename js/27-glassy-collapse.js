/* طي/فرد القائمة الزجاجية — إضافة معزولة (مش بتغيّر switchTab ولا toggleNavMenu) */
(function () {
  'use strict';
  var KEY = 'ts_nav_collapsed', menu;
  function load() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
  function save(v) { try { localStorage.setItem(KEY, v ? '1' : '0'); } catch (e) {} }
  function apply(c) {
    menu.classList.toggle('gl-collapsed', c);
    var b = menu.querySelector('.gl-toggle');
    if (b) { b.title = c ? 'فرد القائمة' : 'طي القائمة'; b.setAttribute('aria-expanded', c ? 'false' : 'true'); }
  }
  // تحديث tooltip والعناوين (بتشتغل تاني لما تابات HR/المناديب تتضاف)
  function decorate() {
    menu.querySelectorAll('.tab-btn').forEach(function (t) {
      if (t.title) return;
      var s = Array.prototype.find.call(t.children, function (c) { return c.tagName === 'SPAN' && !/rounded-full/.test(c.className); });
      if (s) t.title = s.textContent.trim();
    });
    menu.querySelectorAll(':scope > div:not(.gl-head)').forEach(function (d) { d.classList.add('gl-sec'); });
  }
  function init() {
    menu = document.getElementById('nav-menu');
    if (!menu || menu.querySelector('.gl-head')) return;
    var head = document.createElement('div');
    head.className = 'gl-head';
    head.innerHTML = '<span class="gl-title">القائمة الرئيسية</span>' +
      '<button type="button" class="gl-toggle"><i class="fa-solid fa-chevron-right"></i></button>';
    menu.insertBefore(head, menu.firstChild);
    head.querySelector('.gl-toggle').addEventListener('click', function (e) {
      e.stopPropagation();
      var c = !menu.classList.contains('gl-collapsed'); save(c); apply(c);
    });
    decorate(); apply(load());
    try { new MutationObserver(function () { decorate(); }).observe(menu, { childList: true }); } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
