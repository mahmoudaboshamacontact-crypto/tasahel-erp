/* زر X أحمر لمسح أي شريط بحث — عام لكل الشاشات (حتى اللي بتتولد ديناميكياً) */
(function () {
  'use strict';
  if (window.__searchClear) return; window.__searchClear = true;
  var SKIP = /password|email|number|date|time|file|checkbox|radio|hidden|range|color/i;
  function isSearch(el) {
    if (el.tagName !== 'INPUT' || el.dataset.scDone || el.readOnly || el.disabled) return false;
    var t = (el.getAttribute('type') || 'text').toLowerCase();
    if (SKIP.test(t)) return false;
    if (t === 'search') return true;
    var ph = el.getAttribute('placeholder') || '';
    return /بحث|ابحث|search/i.test(ph) || /(^|[-_])(q|search|srch)($|[-_])|search/i.test(el.id || '');
  }
  function attach(el) {
    el.dataset.scDone = '1';
    var host = el.parentElement;
    var n = host ? host.querySelectorAll('input:not([type=hidden]),select,textarea').length : 0;
    if (!host || n !== 1) {
      var w = document.createElement('span'), cs = getComputedStyle(el), pf = getComputedStyle(host || document.body);
      w.className = 'sc-wrap';
      w.style.display = pf.display.indexOf('flex') > -1 ? 'block' : 'block';
      if (pf.display.indexOf('flex') > -1) w.style.flex = el.classList.contains('flex-1') || cs.flexGrow !== '0' ? '1 1 0%' : '0 1 auto';
      if (cs.width && /px/.test(el.style.width || '')) w.style.width = el.style.width;
      el.parentNode.insertBefore(w, el); w.appendChild(el); host = w;
    }
    host.classList.add('sc-host'); el.classList.add('sc-input-pad');
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'sc-btn'; b.title = 'مسح البحث'; b.setAttribute('aria-label', 'مسح البحث'); b.innerHTML = '&#10005;';
    host.appendChild(b);
    function sync() { host.classList.toggle('sc-has', !!el.value); }
    el.addEventListener('input', sync); el.addEventListener('change', sync);
    b.addEventListener('mousedown', function (e) { e.preventDefault(); });
    b.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      el.value = ''; sync();
      el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
      el.focus();
    });
    sync();
    // لو القيمة اتغيرت برمجياً (مثلاً reset) نراقب لحظياً بدون polling
    var d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    if (d && d.set && !el.__scHook) {
      el.__scHook = 1;
      Object.defineProperty(el, 'value', { configurable: true, get: function () { return d.get.call(this); }, set: function (v) { d.set.call(this, v); sync(); } });
    }
  }
  function scan(root) { (root || document).querySelectorAll('input').forEach(function (el) { if (isSearch(el)) attach(el); }); }
  var t;
  function later() { clearTimeout(t); t = setTimeout(function () { scan(); }, 250); }
  function init() { scan(); try { new MutationObserver(later).observe(document.body, { childList: true, subtree: true }); } catch (e) {} }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
