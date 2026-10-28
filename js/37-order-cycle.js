/* P1-أ: دمج "المستلم" + "مندوب الاستلام" في حقل واحد، مع الحفاظ على عمود receiver */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  function sync() {
    var p = $('pickup-courier'), r = $('receiver');
    if (r) r.value = (p && p.value) ? p.value : 'العميل شخصياً';
  }
  function init() {
    var p = $('pickup-courier'); if (!p) return;
    p.addEventListener('change', sync);
    var prev = window.handleSaveOrder;
    if (typeof prev === 'function' && !prev.__p1a) {
      window.handleSaveOrder = async function () { sync(); return prev.apply(this, arguments); };
      window.handleSaveOrder.__p1a = true;
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
