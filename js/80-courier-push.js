/* =====================================================================
   js/80-courier-push.js — المرحلة 3:
   1) زر تفعيل الإشعارات الخارجية (Web Push) في الشاشة الرئيسية للمندوب
      باستخدام نفس VAPID_PUBLIC_KEY و send-push الموجودة + RPC الاشتراك.
   2) فتح تاب التيكتات عند الضغط على الإشعار (message / ?cp_tab=tickets).
   3) تسجيل تواصل المندوب (اتصال/واتساب) على كروت المعاملات بدون تغيير شكلها.
   4) حقن أزرار الاتصال والواتساب وسجل التواصل في تفاصيل المعاملة (#tx-modal)
      للمدير بنفس نمط js/51-work-tracking.js بدون لمس js/03.
   ===================================================================== */
(function () {
  'use strict';
  if (window.__courierPushPhase3) return;
  window.__courierPushPhase3 = true;

  /* نفس المفتاح العام (VAPID public) المستخدم في js/57-push.js — لا يوجد أي مفتاح خاص هنا */
  var VAPID_PUBLIC_KEY = 'BLcrBLwE24uSU7J0jg0SYP98hhBQwfN5eo-NCEwnIhQIjzv4t6NlN2q0Ci9O6Gypwuj7jB4fF6hq-gUW0mgHrGc';

  var $ = function (id) { return document.getElementById(id); };
  var eh = function (s) {
    if (typeof escapeHtml === 'function') return escapeHtml(s == null ? '' : String(s));
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  };
  var toast = function (msg, kind) {
    if (typeof showToast === 'function') showToast(msg, kind || 'info');
  };
  function db() { return typeof sbClient !== 'undefined' ? sbClient : window.sbClient; }
  function isCourier() {
    return window.__role === 'courier' || !!(document.body && document.body.classList.contains('is-courier-mode'));
  }
  function isManagerOrStaff() {
    if (window.__role === 'partner' || isCourier()) return false;
    return window.__role === 'manager' || window.__role === 'staff';
  }
  function waNum(p) {
    var d = String(p || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.startsWith('00')) return d.slice(2);
    if (d.startsWith('0')) return '20' + d.slice(1);
    return d;
  }
  function telHref(p) {
    return 'tel:' + String(p || '').replace(/[^\d+]/g, '');
  }
  function fmtTimeAr(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('ar-EG', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
      });
    } catch (e) { return String(iso); }
  }
  function b64ToBytes(s) {
    var pad = '='.repeat((4 - s.length % 4) % 4);
    var b = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(b), out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  /* ===================================================================
     1) زر تفعيل الإشعارات الخارجية في الشاشة الرئيسية للمندوب
     =================================================================== */
  var pushSupported = ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window) && !!VAPID_PUBLIC_KEY;
  var pushChecked = false;
  var pushIsSubscribed = false;

  async function checkCourierPushState() {
    if (!pushSupported || !isCourier()) return;
    try {
      var reg = await navigator.serviceWorker.ready;
      var sub = await reg.pushManager.getSubscription();
      pushIsSubscribed = !!(sub && Notification.permission === 'granted');
    } catch (e) {
      pushIsSubscribed = false;
    }
    pushChecked = true;
    renderCourierPushBanner();
  }

  function renderCourierPushBanner() {
    if (!pushSupported || !isCourier()) return;
    var body = $('cp-body');
    if (!body) return;
    var old = $('cp-push-banner');
    if (pushIsSubscribed) {
      if (old) old.remove();
      return;
    }
    if (old) return;

    var banner = document.createElement('div');
    banner.id = 'cp-push-banner';
    banner.style.cssText = 'margin:0 0 10px 0;padding:10px 12px;border-radius:14px;border:1px solid var(--bd,rgba(148,163,184,.28));background:var(--card,var(--r-card,#fff));color:var(--tx,var(--r-tx,#0f172a));display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:12px';
    banner.innerHTML =
      '<div style="display:flex;align-items:center;gap:8px;min-width:0;flex:1">' +
        '<i class="fa-regular fa-bell" style="font-size:16px;color:var(--ac,var(--r-acc,inherit))"></i>' +
        '<div><b>فعّل إشعارات التيكتات الجديدة</b><div style="font-size:11px;color:var(--mu,var(--r-mute,#64748b))">عشان يوصلك تنبيه فوري أول ما يتعيّن لك تيكت استلام</div></div>' +
      '</div>' +
      '<button type="button" id="cp-push-enable-btn" style="border:0;border-radius:10px;padding:8px 13px;font-size:12px;font-weight:700;cursor:pointer;background:var(--ac,var(--r-acc,#2C3B32));color:#fff;font-family:inherit">تفعيل الإشعارات</button>';

    body.insertBefore(banner, body.firstChild);
  }

  async function enableCourierPush(btn) {
    if (!pushSupported || !db()) return;
    if (Notification.permission === 'denied') {
      toast('الإشعارات مقفولة من إعدادات المتصفح للموقع ده — افتحها من إعدادات المتصفح', 'error');
      return;
    }
    if (btn) btn.disabled = true;
    try {
      var perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        toast('محتاج توافق على الإشعارات عشان توصلك التيكتات الجديدة', 'info');
        if (btn) btn.disabled = false;
        return;
      }
      var reg = await navigator.serviceWorker.ready;
      var sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: b64ToBytes(VAPID_PUBLIC_KEY)
        });
      }
      var j = sub.toJSON(), k = j.keys || {};
      var r = await db().rpc('courier_save_push_subscription', {
        p_endpoint: j.endpoint,
        p_p256dh: k.p256dh,
        p_auth: k.auth,
        p_user_agent: String(navigator.userAgent || '').slice(0, 200)
      });
      if (r.error) {
        await sub.unsubscribe().catch(function () {});
        throw r.error;
      }
      pushIsSubscribed = true;
      renderCourierPushBanner();
      toast('تم تفعيل إشعارات التيكتات الجديدة ✓', 'success');
    } catch (err) {
      if (btn) btn.disabled = false;
      toast('تعذر تفعيل الإشعارات: ' + ((err && err.message) || 'خطأ غير معروف'), 'error');
    }
  }

  /* فتح تاب التيكتات عند المندوب بعد الضغط على الإشعار */
  function focusCourierTickets() {
    if (!isCourier()) return;
    var navToday = document.querySelector('#cp-nav button[data-tab="today"], #cp-nav button[data-tab="trips"]');
    if (navToday && !navToday.classList.contains('on')) navToday.click();
    setTimeout(function () {
      var box = $('pt73-courier-tickets');
      if (box && box.scrollIntoView) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 220);
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', function (ev) {
      if (ev.data && ev.data.type === 'TS_NOTIF_CLICK' && (ev.data.tag === 'pickup_ticket' || ev.data.tag === 'pickup_ticket_cancel' || ev.data.tag === 'pickup_mission' || ev.data.tag === 'papers_handover')) {
        if (typeof window.tsRefreshCourierTickets === 'function') {
          window.tsRefreshCourierTickets(ev.data.tag === 'pickup_ticket_cancel' ? 'cancelled' : 'active');
        }
        focusCourierTickets();
      }
    });
  }

  /* لو اتفتح الرابط من الإشعار مباشرة (?cp_tab=tickets أو ?cp_tab=tickets_cancelled) */
  function checkUrlOpenTickets() {
    try {
      var params = new URLSearchParams(window.location.search || '');
      var cpTab = params.get('cp_tab');
      if ((cpTab === 'tickets' || cpTab === 'tickets_cancelled') && isCourier()) {
        if (typeof window.tsRefreshCourierTickets === 'function') {
          window.tsRefreshCourierTickets(cpTab === 'tickets_cancelled' ? 'cancelled' : 'active');
        }
        setTimeout(focusCourierTickets, 600);
      }
    } catch (e) { /* */ }
  }

  /* مراقب خفيف على #cp-body لإبقاء الزر ظاهراً لو لم يتفعّل الإذن بعد */
  var cpObs = null;
  function bindCourierObserver() {
    var body = $('cp-body');
    if (!body || cpObs || !window.MutationObserver) return;
    cpObs = new MutationObserver(function () {
      if (isCourier() && pushChecked && !pushIsSubscribed && !$('cp-push-banner')) {
        renderCourierPushBanner();
      }
    });
    cpObs.observe(body, { childList: true });
  }

  /* ===================================================================
     2) تسجيل تواصل المندوب (اتصال/واتساب) على كروت المعاملات بدون تغيير الشكل
     =================================================================== */
  function extractTxFromElement(el) {
    var node = el;
    for (var depth = 0; node && depth < 6; depth++, node = node.parentElement) {
      if (node.dataset && node.dataset.tx) return node.dataset.tx;
      var innerTx = node.querySelector && node.querySelector('[data-tx]');
      if (innerTx && innerTx.dataset && innerTx.dataset.tx) return innerTx.dataset.tx;
      var txt = (node.textContent || '');
      var m = txt.match(/\bTX-\d{4}-\d+\b/i);
      if (m) return m[0];
    }
    return '';
  }

  function logCourierContact(ticketId, txId, channel) {
    if (!db() || !isCourier()) return;
    if (!ticketId && !txId) return;
    db().rpc('courier_log_contact', {
      p_ticket_id: ticketId ? Number(ticketId) : null,
      p_tx: txId ? String(txId) : null,
      p_channel: channel,
      p_outcome: null
    }).then(function (res) {
      if (res && res.error) toast('ما اتسجلش التواصل', 'error');
    }).catch(function () {
      toast('ما اتسجلش التواصل', 'error');
    });
  }

  /* تصدير دالة مساعدة مشتركة لـ js/73-pickup-ticket.js */
  window.tsLogCourierContact = logCourierContact;

  document.addEventListener('click', function (e) {
    var target = e.target;
    if (!target || !target.closest) return;

    var enableBtn = target.closest('#cp-push-enable-btn');
    if (enableBtn) {
      enableCourierPush(enableBtn);
      return;
    }

    /* تسجيل اتصال/واتساب المندوب على كروت المعاملات داخل #courier-app (تيكتات js/73 تتعامل مع نفسها عبر data-pt73-contact) */
    if (isCourier() && target.closest('#courier-app')) {
      var link = target.closest('a[href^="tel:"], a[href*="wa.me"]');
      if (link && !link.hasAttribute('data-pt73-contact')) {
        var channel = (link.getAttribute('href') || '').indexOf('tel:') === 0 ? 'call' : 'whatsapp';
        var txId = extractTxFromElement(link);
        if (txId) logCourierContact(null, txId, channel);
      }
    }
  }, true);

  /* ===================================================================
     3) حقن أزرار الاتصال والواتساب وسجل التواصل في تفاصيل المعاملة (#tx-modal)
        للمدير والموظف بنفس نمط js/51-work-tracking.js بدون لمس js/03
     =================================================================== */
  var OUTCOME_LABEL = {
    answered: 'رد العميل',
    no_answer: 'لم يرد',
    wrong_number: 'رقم غلط',
    postponed: 'طلب تأجيل'
  };

  function findTxPhone(tx) {
    var lines = (typeof allRequestLines !== 'undefined' && Array.isArray(allRequestLines))
      ? allRequestLines
      : (Array.isArray(window.allRequestLines) ? window.allRequestLines : []);
    for (var i = 0; i < lines.length; i++) {
      if (String(lines[i].transaction_id || '') === String(tx) && lines[i].phone) {
        return String(lines[i].phone);
      }
    }
    return '';
  }

  function renderContactLogSection(rows) {
    var cnt = Array.isArray(rows) ? rows.length : 0;
    var lastAt = cnt ? fmtTimeAr(rows[0].created_at) : 'لا يوجد تواصل مسجّل بعد';
    var itemsHtml = cnt
      ? rows.map(function (r) {
          var chLbl = r.channel === 'whatsapp' ? 'واتساب' : 'اتصال';
          var outLbl = r.outcome ? (' · ' + (OUTCOME_LABEL[r.outcome] || r.outcome)) : '';
          return '<div style="display:flex;justify-content:space-between;gap:8px;padding:6px 8px;border-radius:8px;background:var(--r-bg,rgba(148,163,184,.08));font-size:11.5px">' +
            '<span><b>' + chLbl + '</b>' + eh(outLbl) + '</span>' +
            '<span style="color:var(--r-mute,#64748b)" dir="ltr">' + eh(fmtTimeAr(r.created_at)) + '</span>' +
          '</div>';
        }).join('')
      : '<div style="font-size:11.5px;color:var(--r-mute,#64748b)">لم يُسجّل أي اتصال أو واتساب من المندوب على المعاملة دي.</div>';

    return '<div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px;margin-bottom:6px">' +
        '<b style="font-size:12.5px">سجل تواصل المندوب مع العميل</b>' +
        '<span style="font-size:11.5px;color:var(--r-mute,#64748b)">عدد المرات: <b>' + cnt + '</b> · آخر تواصل: <b>' + eh(lastAt) + '</b></span>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:5px">' + itemsHtml + '</div>';
  }

  async function hydrateTxModalContacts(tx) {
    if (!tx || !isManagerOrStaff()) return;
    var act = $('tx-modal-actions-left');
    var body = $('tx-modal-body');
    var phone = findTxPhone(tx);

    /* أزرار اتصال وواتساب ظاهرة على طول في تفاصيل المعاملة */
    if (act && phone && !act.querySelector('[data-p3-tx-contact]')) {
      act.insertAdjacentHTML('beforeend',
        '<a data-p3-tx-contact="call" href="' + eh(telHref(phone)) + '" class="px-3 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5" style="background:var(--r-acc,#2C3B32);color:#fff">' +
          '<i class="fa-solid fa-phone"></i><span>اتصال</span>' +
        '</a>' +
        '<a data-p3-tx-contact="whatsapp" target="_blank" rel="noopener" href="https://wa.me/' + eh(waNum(phone)) + '" class="px-3 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5" style="border:1px solid var(--r-bd,rgba(148,163,184,.35));color:var(--r-tx,inherit)">' +
          '<i class="fa-brands fa-whatsapp"></i><span>واتساب</span>' +
        '</a>');
    }

    if (!body || !db()) return;
    var sec = $('p3-tx-contact-log');
    if (!sec) {
      sec = document.createElement('section');
      sec.id = 'p3-tx-contact-log';
      sec.style.cssText = 'border:1px solid var(--r-bd,rgba(148,163,184,.25));border-radius:14px;padding:12px;margin-top:8px';
      sec.innerHTML = '<div style="font-size:11.5px;color:var(--r-mute,#64748b)">جاري تحميل سجل التواصل…</div>';
      body.appendChild(sec);
    }

    try {
      var r = await db()
        .from('courier_contact_log')
        .select('id,channel,outcome,created_at,courier_id')
        .eq('transaction_id', String(tx))
        .order('created_at', { ascending: false })
        .limit(30);
      if (r.error) throw r.error;
      sec.innerHTML = renderContactLogSection(r.data || []);
    } catch (err) {
      sec.innerHTML = '<div style="font-size:11.5px;color:var(--r-mute,#64748b)">تعذر تحميل سجل التواصل (' + eh((err && err.message) || 'تأكد من تشغيل sql/courier-phase3.sql') + ')</div>';
    }
  }

  function wrap(name, fn) {
    var orig = window[name];
    if (typeof orig === 'function' && !orig.__p3PushWrapped) {
      var w = fn(orig);
      w.__p3PushWrapped = true;
      window[name] = w;
    }
  }

  wrap('openTxModal', function (orig) {
    return function (tx) {
      var res = orig.apply(this, arguments);
      try { hydrateTxModalContacts(tx); } catch (e) { /* */ }
      return res;
    };
  });

  wrap('loadInitialData', function (orig) {
    return async function () {
      var r = await orig.apply(this, arguments);
      try {
        if (isCourier()) {
          bindCourierObserver();
          checkCourierPushState();
          checkUrlOpenTickets();
        }
      } catch (e) { /* */ }
      return r;
    };
  });

  /* تهيئة أولية لو الجلسة مفتوحة بالفعل */
  setTimeout(function () {
    if (isCourier()) {
      bindCourierObserver();
      checkCourierPushState();
      checkUrlOpenTickets();
    }
  }, 400);
})();
