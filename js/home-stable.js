/* home-stable.js — يمنع "الرمشة" في تاب الرئيسية.
   السبب: أي حدث (realtime / presence / تحديث بيانات / تايمر الدقيقة) بيعيد بناء #tab-home كله،
   فلو رقم واحد أو حالة موظف اتغيّرت كل العناصر والصور والـ SVG بتتبدّل وتترسم من الأول = رمشة.
   الحل (على مرحلتين):
   1) Throttle: لو renderHomeTab اتنادت أكتر من مرة في أقل من 600ms نجمّعها في رسمة واحدة بعد التهدئة.
   2) Morph: بعد ما الرسم يخلص بنقارن الجديد بالقديم عنصر عنصر، ونحدّث بس النص/الخاصية اللي اتغيّرت
      ونسيب باقي العناصر القديمة زي ما هي (الصور والـ SVG والأنيميشن ما بيتعاد تشغيلهم).
   للإلغاء: شيل السطر من index.html */
(function () {
  if (window.__homeStable) return; window.__homeStable = true;
  var orig = window.renderHomeTab;
  if (typeof orig !== 'function') return;

  /* ---------- Morph خفيف ---------- */
  function syncAttrs(o, n) {
    var i, a;
    for (i = o.attributes.length - 1; i >= 0; i--) {
      a = o.attributes[i];
      if (!n.hasAttribute(a.name)) o.removeAttribute(a.name);
    }
    for (i = 0; i < n.attributes.length; i++) {
      a = n.attributes[i];
      if (o.getAttribute(a.name) !== a.value) o.setAttribute(a.name, a.value);
    }
  }
  function sameKind(o, n) {
    if (o.nodeType !== n.nodeType) return false;
    if (o.nodeType !== 1) return true;
    return o.tagName === n.tagName && (o.id || '') === (n.id || '');
  }
  function morph(o, n) {
    if (o.nodeType === 3 || o.nodeType === 8) { if (o.nodeValue !== n.nodeValue) o.nodeValue = n.nodeValue; return; }
    if (o.nodeType !== 1) return;
    var tag = o.tagName;
    if (tag === 'CANVAS') return;                      /* Chart.js بيدير الـ canvas بنفسه */
    if (o.isEqualNode(n)) return;
    var focused = document.activeElement === o;
    if (!focused || (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT')) syncAttrs(o, n);
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    var oc = o.childNodes, nc = Array.prototype.slice.call(n.childNodes), i;
    for (i = 0; i < nc.length; i++) {
      var oi = oc[i], ni = nc[i];
      if (!oi) { o.appendChild(ni); continue; }
      if (sameKind(oi, ni)) { morph(oi, ni); }
      else { o.replaceChild(ni, oi); }
    }
    while (o.childNodes.length > nc.length) o.removeChild(o.lastChild);
  }

  function renderOnce(self, args) {
    var box = document.getElementById('tab-home');
    if (!box) return orig.apply(self, args);
    /* ساعة الرئيسية (69-home-clock.js) بتتشال قبل الرسم وبترجع بعده لنفس مكانها كما هي */
    var keep = document.getElementById('ts-ck');
    if (keep && keep.parentNode === box) box.removeChild(keep); else keep = null;
    try { return renderCore(self, args, box); }
    finally { if (keep) { try { box.insertBefore(keep, box.firstChild); } catch (e) {} } }
  }
  function renderCore(self, args, box) {
    var oldNodes, oldHtml;
    try { oldHtml = box.innerHTML; oldNodes = Array.prototype.slice.call(box.childNodes); } catch (e) { return orig.apply(self, args); }
    var r = orig.apply(self, args);
    try {
      if (!oldNodes.length) return r;
      if (box.innerHTML === oldHtml) { box.replaceChildren.apply(box, oldNodes); return r; }
      var fresh = Array.prototype.slice.call(box.childNodes);
      var out = [];
      for (var i = 0; i < fresh.length; i++) {
        var o = oldNodes[i], n = fresh[i];
        if (o && sameKind(o, n)) { morph(o, n); out.push(o); } else out.push(n);
      }
      box.replaceChildren.apply(box, out);
    } catch (e) { /* لو فشل بيفضل الرسم الجديد */ }
    return r;
  }

  /* ---------- Throttle: أول نداء فوراً، والنداءات المتلاحقة بتتجمّع في رسمة واحدة ---------- */
  var lastAt = 0, timer = null, pendingSelf = null, pendingArgs = null;
  var GAP = 600;
  window.renderHomeTab = function () {
    var now = Date.now();
    if (timer) { pendingSelf = this; pendingArgs = arguments; return; }
    if (now - lastAt >= GAP) { lastAt = now; return renderOnce(this, arguments); }
    pendingSelf = this; pendingArgs = arguments;
    timer = setTimeout(function () {
      timer = null; lastAt = Date.now();
      try { renderOnce(pendingSelf, pendingArgs); } catch (e) {}
    }, GAP - (now - lastAt));
  };
})();
