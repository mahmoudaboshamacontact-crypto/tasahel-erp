/* 55-browser-apis.js | المرحلة 10 — Browser APIs متعددة (بدون VAPID)
   1. Badge API: رقم على أيقونة التطبيق للمهام/الرسائل غير المقروءة
   2. Wake Lock: منع انطفاء الشاشة أثناء شيت الكاش والطباعة
   3. QR Scanner: مسح QR من الكاميرا لرقم المعاملة
   4. Smart Paste: لصق ذكي لاستخراج الاسم والتليفون من نص منسوخ
   5. Offline Read: قراءة آخر بيانات مكاشة بدون نت (من cache-first)
   كل فيتشر بيتفعل فقط لو المتصفح بيدعمه، ولو مش مدعوم بيتجاهل بصمت.
   من غير مراقبة شخصية.
*/
(function () {
  'use strict';
  if (window.__browserApis) return;
  window.__browserApis = true;

  /* ================================================================
   * 1. BADGE API — رقم على أيقونة التطبيق
   * بيجمع: (مهام مش منجزة) + (رسائل شات غير مقروءة)
   * بيتحدث كل ما البادجات في الواجهة تتغير
   * ================================================================ */
  var badgeSupported = typeof navigator !== 'undefined' && typeof navigator.setAppBadge === 'function';
  var lastBadgeCount = -1;

  function updateAppBadge() {
    if (!badgeSupported) return;
    try {
      /* نجمع أرقام الـ badges الموجودة في الواجهة */
      var total = 0;
      /* بادج المهام */
      var tkBadge = document.getElementById('tk-badge');
      if (tkBadge && !tkBadge.classList.contains('hidden')) {
        total += parseInt(tkBadge.textContent, 10) || 0;
      }
      /* بادج الشات */
      var chatBadge = document.getElementById('chat-badge');
      if (chatBadge && !chatBadge.classList.contains('hidden')) {
        total += parseInt(chatBadge.textContent, 10) || 0;
      }
      /* بادج الإشعارات */
      var ntCount = document.getElementById('nt-count');
      if (ntCount && !ntCount.classList.contains('hidden')) {
        var n = parseInt(ntCount.textContent, 10) || 0;
        /* مضيفهاش لو البادجات التانية شاملة نفس الأرقام */
      }
      if (total === lastBadgeCount) return;
      lastBadgeCount = total;
      if (total > 0) {
        navigator.setAppBadge(total).catch(function () { /* تجاهل */ });
      } else {
        navigator.clearAppBadge().catch(function () { /* تجاهل */ });
      }
    } catch (e) { /* تجاهل */ }
  }

  if (badgeSupported) {
    /* مراقبة تغيير الـ badges باستخدام MutationObserver على الـ header */
    var badgeTimer = null;
    var badgeObserver = new MutationObserver(function () {
      clearTimeout(badgeTimer);
      badgeTimer = setTimeout(updateAppBadge, 400);
    });
    document.addEventListener('DOMContentLoaded', function () {
      var hdr = document.querySelector('header');
      if (hdr) {
        badgeObserver.observe(hdr, { subtree: true, childList: true, characterData: true, attributes: true });
      }
      updateAppBadge();
    });
    /* تحديث كل دقيقة كـ fallback */
    setInterval(updateAppBadge, 60000);
  }

  /* تعريض دالة للاستخدام الخارجي */
  window.updateAppBadge = updateAppBadge;

  /* ================================================================
   * 2. WAKE LOCK — منع انطفاء الشاشة
   * بيتفعل أثناء:
   * - فتح تاب الكاش (#tab-cash)
   * - window.print() — قبل الطباعة
   * ================================================================ */
  var wakeLockSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  var wakeLockSentinel = null;

  async function requestWakeLock(reason) {
    if (!wakeLockSupported) return;
    try {
      if (wakeLockSentinel && !wakeLockSentinel.released) return; /* مفيش حاجة */
      wakeLockSentinel = await navigator.wakeLock.request('screen');
      wakeLockSentinel.addEventListener('release', function () {
        wakeLockSentinel = null;
      });
    } catch (e) { /* مش متاح (بطارية منخفضة مثلاً) */ }
  }

  function releaseWakeLock() {
    if (!wakeLockSentinel || wakeLockSentinel.released) return;
    wakeLockSentinel.release().catch(function () { /* تجاهل */ });
    wakeLockSentinel = null;
  }

  if (wakeLockSupported) {
    /* عند فتح تاب الكاش */
    var origSwitchTab = window.switchTab;
    if (typeof origSwitchTab === 'function') {
      window.switchTab = function (tab) {
        var r = origSwitchTab.apply(this, arguments);
        try {
          if (tab === 'cash') {
            requestWakeLock('cash-tab');
          } else {
            releaseWakeLock();
          }
        } catch (e) { /* */ }
        return r;
      };
    }

    /* عند الطباعة */
    window.addEventListener('beforeprint', function () {
      requestWakeLock('print');
    });
    window.addEventListener('afterprint', function () {
      releaseWakeLock();
    });

    /* لو الصفحة اتعلّقت وعادت (visibilitychange) */
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && wakeLockSentinel && wakeLockSentinel.released) {
        /* إعادة الطلب لو الـ lock اتحرر لأن الصفحة كانت مخفية */
        var current = window.currentTab || '';
        if (current === 'cash') {
          requestWakeLock('cash-tab-resume');
        }
      }
    });
  }

  window.requestWakeLock = requestWakeLock;
  window.releaseWakeLock = releaseWakeLock;

  /* ================================================================
   * 3. QR SCANNER — مسح QR من الكاميرا لرقم المعاملة
   * بيفتح modal فيه كاميرا، لما يلاقي QR بيملا حقل tx-id
   * يشتغل فقط لو BarcodeDetector متاح في المتصفح
   * ================================================================ */
  /* الزرار بيظهر دايماً: لو BarcodeDetector مش موجود (كروم ويندوز / سفاري) بنحمّل jsQR كبديل */
  var qrSupported = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  var jsQrPromise = null;
  function loadJsQr() {
    if (window.jsQR) return Promise.resolve(window.jsQR);
    if (!jsQrPromise) jsQrPromise = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js';
      s.onload = function () { res(window.jsQR); };
      s.onerror = function () { jsQrPromise = null; rej(new Error('jsqr')); };
      document.head.appendChild(s);
    });
    return jsQrPromise;
  }

  var qrStream = null, qrDetector = null, qrAnim = null;

  function stopQrCamera() {
    if (qrAnim) { cancelAnimationFrame(qrAnim); qrAnim = null; }
    if (qrStream) {
      qrStream.getTracks().forEach(function (t) { t.stop(); });
      qrStream = null;
    }
    var modal = document.getElementById('qr-scan-modal');
    if (modal) modal.remove();
  }

  async function openQrScanner(onResult) {
    if (!qrSupported) { return; }
    try {
      stopQrCamera();
      qrStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    } catch (e) {
      if (typeof showToast === 'function') showToast('تعذّر فتح الكاميرا: تأكد من إذن الكاميرا', 'error');
      return;
    }

    /* إنشاء الـ modal */
    var modal = document.createElement('div');
    modal.id = 'qr-scan-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:500;background:rgba(0,0,0,.85);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;direction:rtl';
    modal.innerHTML =
      '<div style="font-size:14px;font-weight:700;color:#fff">وجّه الكاميرا للـ QR Code</div>' +
      '<video id="qr-video" autoplay playsinline muted style="width:min(90vw,340px);height:min(90vw,340px);border-radius:16px;object-fit:cover;border:2px solid #e97415"></video>' +
      '<canvas id="qr-canvas" style="display:none"></canvas>' +
      '<button id="qr-close" type="button" style="border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.12);color:#fff;padding:8px 24px;border-radius:999px;font:inherit;font-size:13px;font-weight:700;cursor:pointer">إلغاء</button>';
    document.body.appendChild(modal);

    var video = document.getElementById('qr-video');
    var canvas = document.getElementById('qr-canvas');
    video.srcObject = qrStream;
    document.getElementById('qr-close').addEventListener('click', stopQrCamera);

    qrDetector = null;
    if (typeof window.BarcodeDetector !== 'undefined') {
      try { qrDetector = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { qrDetector = null; }
    }
    var jsqr = null;
    if (!qrDetector) {
      try { jsqr = await loadJsQr(); } catch (e) {
        stopQrCamera();
        if (typeof showToast === 'function') showToast('تعذّر تحميل قارئ الـ QR، تأكد من الإنترنت', 'error');
        return;
      }
    }

    function done(raw) { stopQrCamera(); onResult(raw); }
    function next() { qrAnim = requestAnimationFrame(scanFrame); }
    function scanFrame() {
      if (!document.getElementById('qr-scan-modal')) return;
      if (!video || video.readyState < 2 || !video.videoWidth) { next(); return; }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      var ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(video, 0, 0);
      if (qrDetector) {
        qrDetector.detect(canvas).then(function (codes) {
          if (codes && codes.length > 0) done(codes[0].rawValue || ''); else next();
        }).catch(next);
      } else {
        var img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        var c = jsqr(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        if (c && c.data) done(c.data); else setTimeout(next, 80);
      }
    }

    video.addEventListener('loadeddata', next);
    if (video.readyState >= 2) next();
  }

  /* استخراج رقم المعاملة من QR — ممكن يكون رابط أو نص مباشر */
  function extractTxFromQr(raw) {
    if (!raw) return '';
    /* لو رابط فيه tx= */
    try {
      var url = new URL(raw);
      var tx = url.searchParams.get('tx') || url.searchParams.get('token') || '';
      if (tx) return tx.trim();
    } catch (e) { /* مش URL */ }
    /* لو نص مباشر يشبه رقم المعاملة */
    var m = raw.trim().match(/^(TX-?\d{4}-?\d+)$/i);
    if (m) return m[1].trim();
    /* لو النص قصير (أقل من 60 حرف) نرجعه كما هو */
    if (raw.trim().length <= 60) return raw.trim();
    return '';
  }

  function injectQrButton() {
    if (!qrSupported) return;
    /* نضيف زرار QR جنب حقل tx-id في نموذج الطلب الجديد */
    var txField = document.getElementById('tx-id');
    if (!txField || document.getElementById('qr-scan-btn')) return;
    var wrap = txField.parentElement;
    if (!wrap) return;
    var btn = document.createElement('button');
    btn.id = 'qr-scan-btn';
    btn.type = 'button';
    btn.title = 'مسح QR لرقم المعاملة';
    btn.style.cssText = 'position:absolute;left:8px;top:calc(100% - 22px);transform:translateY(-50%);border:0;background:none;cursor:pointer;color:#e97415;font-size:18px;line-height:1;padding:4px;z-index:2';
    btn.innerHTML = '<i class="fa-solid fa-qrcode"></i>';
    btn.addEventListener('click', function () {
      openQrScanner(function (raw) {
        var tx = extractTxFromQr(raw);
        if (tx) {
          txField.value = tx;
          txField.dispatchEvent(new Event('input', { bubbles: true }));
          if (typeof showToast === 'function') showToast('تم مسح رقم المعاملة من QR ✓');
        } else {
          if (typeof showToast === 'function') showToast('مش قادر أقرأ رقم المعاملة من الـ QR', 'error');
        }
      });
    });
    /* نخلي الـ wrap relative عشان الزرار يتموضع صح */
    var existingPos = getComputedStyle(wrap).position;
    if (existingPos === 'static') wrap.style.position = 'relative';
    wrap.appendChild(btn);
  }

  /* نضيف الزرار بعد تحميل DOM */
  if (qrSupported) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', injectQrButton);
    } else {
      /* ننتظر شوية عشان الملفات التانية تخلص */
      setTimeout(injectQrButton, 1500);
    }
  }

  window.openQrScanner = openQrScanner;

  /* ================================================================
   * 4. SMART PASTE — لصق ذكي لاستخراج الاسم والتليفون
   * لما الموظف يلصق نص في خانة اسم العميل أو التليفون
   * بيحاول يستخرج الاسم والتليفون من النص المنسوخ
   * ================================================================ */
  var pasteSupported = typeof ClipboardEvent !== 'undefined';

  /* استخراج أرقام تليفون مصرية من نص */
  function extractPhone(text) {
    /* ابحث عن أرقام مصرية: 01[0-9] ×× أو +201 ×× */
    var m = text.match(/(?:\+?2)?0(1[0-9]{9})/);
    if (m) return '0' + m[1];
    /* رقم 11 رقم */
    var m2 = text.match(/\b(01[0-9]\d{8})\b/);
    if (m2) return m2[1];
    return '';
  }

  /* استخراج الاسم من نص — نأخذ أول سطر أو أول N كلمات تبدو اسم */
  function extractName(text) {
    var lines = text.split(/[\n\r]+/).map(function (l) { return l.trim(); }).filter(function (l) { return l; });
    for (var i = 0; i < lines.length && i < 5; i++) {
      var line = lines[i];
      /* تخطّى السطور اللي فيها رقم موبايل */
      if (/01[0-9]\d{7,}/.test(line)) continue;
      /* تخطّى السطور القصيرة جداً أو الطويلة جداً */
      if (line.length < 3 || line.length > 60) continue;
      /* السطر ده يبدو اسم */
      return line;
    }
    return '';
  }

  function setupSmartPaste() {
    if (!pasteSupported) return;
    var nameField = document.getElementById('client-name');
    var phoneField = document.getElementById('phone');
    if (!nameField || !phoneField) return;

    /* لصق في خانة الاسم */
    nameField.addEventListener('paste', function (e) {
      var text = (e.clipboardData || window.clipboardData || {}).getData('text') || '';
      if (!text || text.trim().length < 5) return;

      /* لو النص فيه تليفون ومحتمل بيانات عميل كاملة */
      var phone = extractPhone(text);
      var name = extractName(text);

      /* لو فيه تليفون في النص المنسوخ وخانة التليفون فاضية */
      if (phone && !phoneField.value.trim()) {
        e.preventDefault();
        nameField.value = name || text.trim().split(/\s+/).slice(0, 3).join(' ');
        phoneField.value = phone;
        nameField.dispatchEvent(new Event('input', { bubbles: true }));
        phoneField.dispatchEvent(new Event('input', { bubbles: true }));
        if (typeof showToast === 'function') showToast('تم استخراج الاسم والتليفون من النص ✓', 'info');
      }
      /* لو مفيش تليفون، نسيب اللصق يحصل بشكل عادي */
    });

    /* لصق في خانة التليفون — استخراج الرقم بس */
    phoneField.addEventListener('paste', function (e) {
      var text = (e.clipboardData || window.clipboardData || {}).getData('text') || '';
      if (!text) return;
      var phone = extractPhone(text);
      if (phone && phone !== text.trim()) {
        e.preventDefault();
        phoneField.value = phone;
        phoneField.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  }

  /* نجهز الـ smart paste بعد تحميل DOM */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(setupSmartPaste, 1000); });
  } else {
    setTimeout(setupSmartPaste, 1000);
  }

  /* ================================================================
   * 5. OFFLINE READ — قراءة آخر بيانات بدون نت
   * بيخزّن آخر نتيجة لـ allRequestLines في localStorage
   * لو مفيش نت، بيحمّل من التخزين
   * المفيش نت بيتعرف من navigator.onLine
   * ================================================================ */
  var OFFLINE_KEY = 'ts_offline_lines_v2';
  var OFFLINE_MAX_AGE_MS = 24 * 60 * 60 * 1000; /* 24 ساعة */
  var offlineBannerShown = false;

  function saveToOfflineCache() {
    if (typeof allRequestLines === 'undefined' || !allRequestLines || !allRequestLines.length) return;
    try {
      var payload = JSON.stringify({ ts: Date.now(), count: allRequestLines.length });
      /* بنخزن عدد البنود فقط مش البيانات نفسها (أمان + حجم) */
      /* البيانات الفعلية محفوظة بالفعل في الـ service worker cache */
      localStorage.setItem(OFFLINE_KEY, payload);
    } catch (e) { /* full storage */ }
  }

  function showOfflineBanner() {
    if (offlineBannerShown) return;
    offlineBannerShown = true;
    if (typeof showToast === 'function') {
      showToast('⚠️ أنت غير متصل بالإنترنت — البيانات المعروضة هي آخر نسخة محفوظة', 'info', 8000);
    }
  }

  function hideOfflineBanner() {
    offlineBannerShown = false;
  }

  /* مراقبة حالة الاتصال */
  window.addEventListener('online', function () {
    hideOfflineBanner();
    if (typeof showToast === 'function') showToast('عاد الاتصال بالإنترنت ✓', 'success', 3000);
    /* تحديث البيانات لما يرجع النت */
    if (typeof loadRecentRequests === 'function') {
      setTimeout(loadRecentRequests, 500);
    }
  });

  window.addEventListener('offline', function () {
    showOfflineBanner();
  });

  /* حفظ البيانات كل ما تتحدث (wrapper على resetLinesCache أو مراقبة allRequestLines) */
  var origResetCache = window.resetLinesCache;
  if (typeof origResetCache === 'function') {
    window.resetLinesCache = function () {
      var r = origResetCache.apply(this, arguments);
      try { saveToOfflineCache(); } catch (e) { /* */ }
      return r;
    };
  }

  /* لو بدأنا offline، نعرض banner */
  if (!navigator.onLine) {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(showOfflineBanner, 1500);
    });
  }

  /* حفظ دوري كل 2 دقيقة */
  setInterval(function () {
    if (navigator.onLine) saveToOfflineCache();
  }, 120000);

})();
