/* 55-public-tracking-btn.js | زرار نسخ رابط ورسالة التتبع (فيتشر 28)
   بينادي staff_get_track_code ويجهز رسالة واتساب جاهزة فيها الرابط والرقم والكود.
   SQL: sql/part-e-public-tracking-28.sql (مش بيتعدل). */
(function () {
  if (window.__pubTrackBtn) return; window.__pubTrackBtn = true;
  var eh = typeof escapeHtml === 'function' ? escapeHtml : function (s) { return String(s == null ? '' : s); };

  /* عنوان صفحة التتبع العامة */
  function trackingBase() {
    return new URL('tracking.html', location.href).href.split('#')[0].split('?')[0];
  }

  /* بناء الرابط بالباراميترز */
  function buildLink(txId, code) {
    return trackingBase() + '?tx=' + encodeURIComponent(txId) + '&code=' + encodeURIComponent(code);
  }

  /* بناء رسالة واتساب */
  function buildMessage(clientName, txId, code, link) {
    return 'أهلاً ' + (clientName || '') + '،\n' +
      'تابع حالة معاملتك رقم ' + txId + ' من هنا:\n' +
      link + '\n\n' +
      'كود التتبع: ' + code + '\n' +
      'آخر 4 أرقام من التليفون: هتحتاجها عشان تفتح الصفحة.\n\n' +
      '— تساهيل | قسم الخدمات الحكومية';
  }

  /* نسخ نص للحافظة */
  function copyText(text, onDone) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(onDone).catch(function () {
        fallbackCopy(text); onDone();
      });
    } else {
      fallbackCopy(text); onDone();
    }
  }
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) { /* */ }
    document.body.removeChild(ta);
  }

  /* الدالة الرئيسية: تتصل بالسيرفر وتنسخ الرسالة */
  async function copyTrackingMessage(txId) {
    if (!txId || !sbClient) { showToast('السيستم مش جاهز', 'error'); return; }

    /* اسم العميل من البيانات الموجودة */
    var order = (typeof groupedOrders !== 'undefined' ? groupedOrders : []).find(function (o) {
      return String(o.transaction_id) === String(txId);
    });
    var clientName = order ? (order.client_name || '') : '';

    try {
      /* نادي الدالة على السيرفر عشان تجيب الكود */
      var res = await sbClient.rpc('staff_get_track_code', { p_tx: String(txId).trim() });
      if (res.error) throw res.error;
      var code = res.data;
      if (!code) { showToast('تعذّر توليد كود التتبع', 'error'); return; }

      var link = buildLink(txId, code);
      var msg = buildMessage(clientName, txId, code, link);

      copyText(msg, function () {
        showToast('تم نسخ رسالة التتبع — الصقها في الواتساب ✓');
      });
    } catch (err) {
      showError('تعذّر توليد كود التتبع', err);
    }
  }

  /* تعريض الدالة عالمياً */
  window.copyTrackingMessage = copyTrackingMessage;

  /* ---- إضافة الزرار في نافذة تفاصيل المعاملة ---- */
  var _orig = window.openTxModal;
  if (typeof _orig === 'function') {
    window.openTxModal = function (tx) {
      var result = _orig.apply(this, arguments);
      try {
        var box = document.getElementById('tx-modal-actions-left');
        if (box && !box.querySelector('[data-pub-track]')) {
          box.insertAdjacentHTML('beforeend',
            '<button type="button" data-pub-track="1" data-tx="' + eh(tx) +
            '" onclick="copyTrackingMessage(this.dataset.tx)" class="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-1.5">' +
            '<i class="fa-solid fa-copy"></i><span>نسخ رابط ورسالة التتبع</span></button>');
        }
      } catch (e) { /* */ }
      return result;
    };
  }

  /* ---- إضافة الزرار في الكارت الجانبي (Inspector) ---- */
  var _insp = window.renderTxInspector;
  if (typeof _insp === 'function') {
    window.renderTxInspector = function (tx) {
      var result = _insp.apply(this, arguments);
      try {
        var p = document.getElementById('tx-inspector-panel');
        var f = p && p.querySelector('form');
        if (p && f && !p.querySelector('[data-pub-track]')) {
          f.insertAdjacentHTML('beforebegin',
            '<button type="button" data-pub-track="1" data-tx="' + eh(tx) +
            '" onclick="copyTrackingMessage(this.dataset.tx)" class="btn-neo-sec w-full text-xs py-2">' +
            '<i class="fa-solid fa-copy text-amber-500 dark:text-amber-400"></i><span>نسخ رابط ورسالة التتبع</span></button>');
        }
      } catch (e) { /* */ }
      return result;
    };
  }
})();
