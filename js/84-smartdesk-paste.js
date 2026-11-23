/* لصق ذكي من سمارت ديسك: المستخدم يلصق نص صفحة الطلب، والسيستم يملا خانات تذكرة الاستلام.
   - Parser يتحمّل الشكلين: «Label: value» و«Label ↵ value» (وبالعربي والإنجليزي).
   - ملف مستقل: بيربط نفسه بالصندوق #pt-sd-paste اللي في نموذج التذكرة (js/73) من غير ما يعدّل حاجة موجودة. */
(function () {
  'use strict';

  var LABELS = [
    { key: 'serviceId', re: /^service\s*id$/i },
    { key: 'requestId', re: /^request\s*id$/i },
    { key: 'customer', re: /^customer\s*name\s*\/?\s*phone$|^customer\s*name$|^اسم\s*العميل(\s*\/\s*(الموبايل|الهاتف|رقم الموبايل))?$/i },
    { key: 'date', re: /^تاريخ\s*الطلب$|^request\s*date$/i },
    { key: 'request', re: /^request$/i },
    { key: 'requestType', re: /^request\s*type$|^نوع\s*الطلب$/i },
    { key: 'type', re: /^type$/i },
    { key: 'province', re: /^المحافظة$|^governorate$|^city$/i },
    { key: 'address', re: /^address$|^العنوان$/i }
  ];

  function labelOf(line) {
    var t = String(line || '').replace(/[:：]\s*$/, '').trim();
    for (var i = 0; i < LABELS.length; i++) if (LABELS[i].re.test(t)) return LABELS[i].key;
    return null;
  }

  function toAsciiDigits(s) {
    return String(s || '').replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 1632); })
      .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 1776); });
  }

  function splitNamePhone(v) {
    var parts = String(v || '').split('/').map(function (x) { return x.trim(); }).filter(Boolean);
    var phone = '', name = [];
    parts.forEach(function (p) {
      var digits = toAsciiDigits(p).replace(/[^\d+]/g, '');
      if (!phone && digits.replace(/\D/g, '').length >= 10 && !/[^\d\s+()-]/.test(toAsciiDigits(p))) phone = digits;
      else name.push(p);
    });
    return { name: name.join(' / '), phone: phone };
  }

  function parse(text) {
    var out = { requestId: '', serviceId: '', name: '', phone: '', province: '', requestType: '', address: '', mapsUrl: '' };
    var lines = String(text || '').replace(/\r/g, '').split('\n').map(function (l) { return l.replace(/‏|‎/g, '').trim(); });
    var cur = null, acc = {};
    lines.forEach(function (line) {
      if (!line) return;
      /* «Label<TAB>value» أو «Label: value» على نفس السطر */
      var m = line.match(/^([^\t:：]{2,30})(?:\t+|\s*[:：]\s+)(.+)$/);
      if (m && labelOf(m[1])) { cur = labelOf(m[1]); (acc[cur] = acc[cur] || []).push(m[2].trim()); return; }
      var k = labelOf(line);
      if (k) { cur = k; acc[cur] = acc[cur] || []; return; }
      if (cur) acc[cur].push(line);
    });
    var one = function (k) { return (acc[k] || []).join(' ').trim(); };
    out.requestId = one('requestId').split(/\s+/)[0] || '';
    out.serviceId = one('serviceId').split(/\s+/)[0] || '';
    var np = splitNamePhone((acc.customer || []).join(' / '));
    out.name = np.name; out.phone = np.phone;
    out.province = one('province');
    out.requestType = one('requestType');
    var addrLines = (acc.address || []);
    var addr = [];
    addrLines.forEach(function (l) {
      var u = l.match(/https?:\/\/\S+/);
      if (u) { out.mapsUrl = u[0]; l = l.replace(u[0], '').trim(); }
      if (l) addr.push(l);
    });
    out.address = addr.join(' - ');
    return out;
  }
  window.parseSmartDeskText = parse;

  function setVal(id, v) {
    var el = document.getElementById(id);
    if (!el || v == null || v === '') return false;
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function fill() {
    var box = document.getElementById('pt-sd-paste'), msg = document.getElementById('pt-sd-msg');
    if (!box) return;
    var r = parse(box.value);
    var done = [];
    if (setVal('pt-client', r.name)) done.push('الاسم');
    if (setVal('pt-phone', r.phone)) done.push('الموبايل');
    if (setVal('pt-reqid', r.requestId)) done.push('Request ID');
    var addr = r.address + (r.mapsUrl ? (r.address ? ' | ' : '') + r.mapsUrl : '');
    if (setVal('pt-addr', addr.slice(0, 400))) done.push('العنوان');
    if (msg) {
      msg.textContent = done.length
        ? 'اتملّى: ' + done.join(' · ') + (r.requestType ? ' — نوع الطلب في سمارت ديسك: ' + r.requestType + ' (اختار الخدمة بإيدك)' : '')
        : 'ما قدرتش أقرا بيانات — تأكد إنك نسخت صفحة الطلب كلها من سمارت ديسك.';
    }
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('#pt-sd-fill');
    if (b) { e.preventDefault(); fill(); }
  });
  document.addEventListener('paste', function (e) {
    if (e.target && e.target.id === 'pt-sd-paste') setTimeout(fill, 30);
  });
})();
