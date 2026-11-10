/* home-stable.js — يمنع "الرمشة" في تاب الرئيسية.
   السبب: أي حدث (realtime/تحديث بيانات/أرشيف) بيعيد بناء التاب بالكامل حتى لو الشكل ما اتغيرش، فالصور والرسوم بتتعاد.
   الحل: بنحتفظ بالعناصر القديمة، وبعد ما الرسم يخلص لو الناتج HTML مطابق بنرجّع العناصر القديمة (كله في نفس اللحظة من غير ما المتصفح يرسم بينهم).
   لو اتغيّر أي رقم أو عنصر بيتبدّل عادي. للإلغاء: شيل السطر من index.html */
(function () {
  if (window.__homeStable) return; window.__homeStable = true;
  var orig = window.renderHomeTab;
  if (typeof orig !== 'function') return;
  window.renderHomeTab = function () {
    var box = document.getElementById('tab-home');
    if (!box) return orig.apply(this, arguments);
    var oldHtml, oldNodes;
    try { oldHtml = box.innerHTML; oldNodes = Array.prototype.slice.call(box.childNodes); } catch (e) { return orig.apply(this, arguments); }
    var r = orig.apply(this, arguments);
    try {
      if (oldNodes.length && box.innerHTML === oldHtml) { box.replaceChildren.apply(box, oldNodes); }
    } catch (e) { /* لو فشل بيفضل الرسم الجديد */ }
    return r;
  };
})();
