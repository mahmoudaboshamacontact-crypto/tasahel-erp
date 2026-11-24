/* تسجيل أخطاء المندوب: جدول error_log مقفول على المناديب، فبنبعت عن طريق دالة log_client_error.
   بدون أي بيانات عملاء (نفس تنضيف js/48): إيميلات وأرقام تليفون بتتشال. حد أقصى 5 أخطاء للجلسة، بدون تكرار. */
(function () {
  'use strict';
  if (window.__errRelay) return; window.__errRelay = true;
  var sent = 0, seen = {};
  function scrub(s) {
    s = String(s || '').replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); });
    s = s.replace(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, '[email]');
    s = s.replace(/([?&](?:token|phone|client|email|key|apikey)=)[^&\s#]+/gi, '$1[x]');
    s = s.replace(/\+?\d[\d\s\-().]{6,16}\d/g, function (m) { var n = m.replace(/\D/g, '').length; return n >= 8 && n <= 15 ? '[num]' : m; });
    return s.replace(/\s+/g, ' ').trim();
  }
  function report(msg, src, ln, cl) {
    try {
      if (window.__role !== 'courier' || sent >= 5 || typeof sbClient === 'undefined' || !sbClient) return;
      msg = scrub(msg).slice(0, 300);
      if (!msg || /^script error/i.test(msg) || /ResizeObserver|extension:\/\//i.test(msg + ' ' + src)) return;
      if (seen[msg]) return; seen[msg] = 1; sent++;
      var path = ''; try { path = new URL(String(src || ''), location.origin).pathname; } catch (e) { path = ''; }
      sbClient.rpc('log_client_error', {
        p_message: msg, p_source: scrub(path).slice(0, 120) || null,
        p_line: Number.isFinite(Number(ln)) ? Number(ln) : null, p_col: Number.isFinite(Number(cl)) ? Number(cl) : null,
        p_tab: (typeof currentTab === 'string' ? currentTab : 'courier').slice(0, 40),
        p_app_version: 'courier-relay', p_ua: String(navigator.userAgent || '').slice(0, 150)
      }).then(function () {}, function () {});
    } catch (e) { /* */ }
  }
  window.addEventListener('error', function (ev) {
    if (!ev) return;
    report(ev.message || (ev.error && ev.error.message), ev.filename, ev.lineno, ev.colno);
  });
  window.addEventListener('unhandledrejection', function (ev) {
    var r = ev && ev.reason; report('Promise: ' + ((r && r.message) || r || ''), '', null, null);
  });
})();
