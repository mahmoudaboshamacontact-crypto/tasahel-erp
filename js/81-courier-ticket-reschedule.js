/* =====================================================================
   js/81-courier-ticket-reschedule.js
   طلب تأجيل تيكت الاستلام — قرار المكتب فقط.
   مستقل عن js/73، ولا يغيّر النماذج أو مسارات التيكت الحالية.
   ===================================================================== */
(function () {
  'use strict';
  if (window.__pt81Reschedule) return;
  window.__pt81Reschedule = true;

  var courierRequests = {};
  var officeLoaded = false;
  var officeBusy = false;
  var lastCourierLoad = 0;

  function $(id) { return document.getElementById(id); }
  function getSb() { return typeof sbClient !== 'undefined' ? sbClient : window.sbClient; }
  function esc(value) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(value == null ? '' : String(value));
    return String(value == null ? '' : value).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }
  function toast(message, type) {
    if (typeof window.showToast === 'function') window.showToast(message, type === 'error' ? 'error' : 'success');
    else alert(message);
  }
  function isCourier() {
    return window.__role === 'courier' ||
      !!(document.body && document.body.classList.contains('is-courier-mode'));
  }
  function isOffice() {
    return !isCourier() && (window.__role === 'manager' || window.__role === 'staff');
  }
  function addStyles() {
    if ($('pt81-style')) return;
    var style = document.createElement('style');
    style.id = 'pt81-style';
    style.textContent =
      '.pt81-box{margin:14px 0;padding:14px;border:1px solid var(--r-bd,rgba(148,163,184,.25));border-radius:14px;background:var(--r-card,#fff);color:var(--r-tx,#17202a);direction:rtl}' +
      '.pt81-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px}' +
      '.pt81-list{display:flex;flex-direction:column;gap:9px}' +
      '.pt81-item{padding:11px;border:1px solid var(--r-bd,rgba(148,163,184,.2));border-radius:11px;background:var(--r-bg,rgba(148,163,184,.05))}' +
      '.pt81-muted{font-size:12px;color:var(--r-mute,#64748b);line-height:1.7}' +
      '.pt81-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}' +
      '.pt81-btn{border:0;border-radius:9px;padding:8px 12px;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;background:var(--r-acc,#d97706);color:#fff}' +
      '.pt81-btn.secondary{background:rgba(148,163,184,.18);color:var(--r-tx,#334155)}' +
      '.pt81-btn.reject{background:#b91c1c;color:#fff}' +
      '.pt81-btn:disabled{opacity:.5;cursor:not-allowed}' +
      '.pt81-input{width:100%;box-sizing:border-box;border:1px solid var(--r-bd,rgba(148,163,184,.3));border-radius:9px;padding:9px;background:var(--r-bg,#fff);color:var(--r-tx,#111);font:inherit}' +
      '.pt81-modal{position:fixed;inset:0;z-index:100090;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;padding:16px}' +
      '.pt81-modal-card{width:100%;max-width:440px;background:var(--r-card,#fff);color:var(--r-tx,#17202a);border:1px solid var(--r-bd,rgba(148,163,184,.25));border-radius:16px;padding:17px;display:flex;flex-direction:column;gap:11px;direction:rtl}' +
      '.pt81-modal-card label{font-size:12px;font-weight:700}' +
      '.pt81-request-state{margin-top:8px;padding:8px 10px;border-radius:9px;background:rgba(217,119,6,.12);font-size:12px;color:var(--r-tx,#92400e)}';
    document.head.appendChild(style);
  }

  function currentRequest(ticketId) {
    return courierRequests[String(Number(ticketId))] || null;
  }

  function courierActionHtml(ticket) {
    if (!ticket || ticket.status !== 'with_courier') return '';
    var step = String(ticket.courier_step || '');
    if (['accepted', 'call_attempt', 'on_the_way'].indexOf(step) === -1) return '';
    var req = currentRequest(ticket.id);
    if (req && req.status === 'pending') {
      return '<div class="pt81-request-state">طلب التأجيل اتبعت للمكتب — مستني الموافقة أو الرفض</div>';
    }
    if (req && (req.status === 'approved' || req.status === 'rejected')) {
      var label = req.status === 'approved' ? 'المكتب وافق على التأجيل' : 'المكتب رفض طلب التأجيل';
      return '<div class="pt81-request-state">' + label +
        (req.status === 'approved' ? ' · الموعد المقترح: ' + esc(req.proposed_slot) : '') +
        (req.decision_note ? '<div>ملاحظة المكتب: ' + esc(req.decision_note) + '</div>' : '') +
        '</div>';
    }
    return '<div class="pt81-actions"><button type="button" class="pt81-btn" data-pt81-request="' +
      Number(ticket.id) + '">العميل طلب تأجيل</button></div>';
  }

  function wrapCourierRows() {
    var original = window.tsWorkTicketRows;
    if (typeof original !== 'function' || original.__pt81Wrapped) return;
    var wrapped = function (list, openKey) {
      return (list || []).map(function (ticket) {
        var html = original([ticket], openKey);
        var action = courierActionHtml(ticket);
        if (!action) return html;
        var closeAt = html.lastIndexOf('</div>');
        return closeAt < 0 ? html : html.slice(0, closeAt) + action + html.slice(closeAt);
      }).join('');
    };
    wrapped.__pt81Wrapped = true;
    window.tsWorkTicketRows = wrapped;
  }

  async function loadCourierRequests(force) {
    if (!isCourier() || !getSb()) return;
    if (!force && Date.now() - lastCourierLoad < 60000) return;
    lastCourierLoad = Date.now();
    try {
      var result = await getSb().rpc('courier_my_ticket_reschedule_requests');
      if (result.error) throw result.error;
      courierRequests = {};
      (Array.isArray(result.data) ? result.data : []).forEach(function (row) {
        var key = String(Number(row.ticket_id));
        if (!courierRequests[key]) courierRequests[key] = row;
      });
      wrapCourierRows();
      if (typeof window.tsRefreshCourierTickets === 'function') {
        // إعادة الرسم تتم من دالة البوابة الحالية دون تغيير بيانات التيكت.
        window.tsRefreshCourierTickets('active');
      }
    } catch (error) {
      toast((error && error.message) || 'تعذر تحميل حالة طلبات التأجيل', 'error');
    }
  }

  function closeRequestModal() {
    var modal = $('pt81-request-modal');
    if (modal) modal.remove();
  }

  function openRequestModal(ticketId) {
    if (!isCourier()) return;
    closeRequestModal();
    var modal = document.createElement('div');
    modal.id = 'pt81-request-modal';
    modal.className = 'pt81-modal';
    modal.innerHTML =
      '<div class="pt81-modal-card" role="dialog" aria-modal="true">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px">' +
          '<b>طلب تأجيل تيكت الاستلام</b>' +
          '<button type="button" class="pt81-btn secondary" data-pt81-close>إغلاق</button>' +
        '</div>' +
        '<div class="pt81-muted">اكتب الموعد اللي العميل طلبه والسبب. الموعد الحالي مش هيتغير غير بعد موافقة المكتب.</div>' +
        '<label for="pt81-proposed">الموعد المقترح من العميل *</label>' +
        '<input id="pt81-proposed" class="pt81-input" maxlength="160" placeholder="مثال: بكرة بعد الساعة ٥ مساءً">' +
        '<label for="pt81-reason">سبب التأجيل *</label>' +
        '<textarea id="pt81-reason" class="pt81-input" rows="3" maxlength="500" placeholder="اكتب سبب طلب العميل للتأجيل"></textarea>' +
        '<div class="pt81-actions" style="justify-content:flex-end">' +
          '<button type="button" class="pt81-btn secondary" data-pt81-close>تراجع</button>' +
          '<button type="button" class="pt81-btn" id="pt81-send">إرسال للمكتب للموافقة</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
    if ($('pt81-proposed')) $('pt81-proposed').focus();
    modal.addEventListener('click', async function (event) {
      if (event.target === modal || event.target.closest('[data-pt81-close]')) {
        closeRequestModal();
        return;
      }
      if (event.target.id !== 'pt81-send') return;
      var button = event.target;
      var proposed = ($('pt81-proposed') && $('pt81-proposed').value || '').trim();
      var reason = ($('pt81-reason') && $('pt81-reason').value || '').trim();
      if (proposed.length < 5 || proposed.length > 160) {
        toast('اكتب الموعد المقترح بوضوح (5 حروف على الأقل)', 'error');
        return;
      }
      if (reason.length < 3 || reason.length > 500) {
        toast('اكتب سبب التأجيل (3 حروف على الأقل)', 'error');
        return;
      }
      button.disabled = true;
      try {
        var result = await window.sbClient.rpc('courier_ticket_request_reschedule', {
          p_ticket_id: Number(ticketId),
          p_proposed_slot: proposed,
          p_reason: reason
        });
        if (result.error) throw result.error;
        if (!result.data || !result.data.ok) throw new Error('السيرفر ما أكدش إرسال الطلب');
        courierRequests[String(Number(ticketId))] = {
          ticket_id: Number(ticketId), proposed_slot: proposed, reason: reason, status: 'pending'
        };
        closeRequestModal();
        wrapCourierRows();
        if (typeof window.tsRefreshCourierTickets === 'function') window.tsRefreshCourierTickets('active');
        toast('تم إرسال طلب التأجيل للمكتب — الموعد لم يتغير', 'success');
      } catch (error) {
        button.disabled = false;
        toast((error && error.message) || 'تعذر إرسال طلب التأجيل', 'error');
      }
    });
  }

  async function loadOfficeRequests() {
    if (!isOffice() || !window.sbClient || officeBusy) return;
    var panel = $('pt81-office-panel');
    if (!panel) return;
    officeBusy = true;
    var list = $('pt81-office-list');
    if (list) list.innerHTML = '<div class="pt81-muted">جاري تحميل طلبات التأجيل…</div>';
    try {
      var result = await window.sbClient.rpc('pickup_ticket_reschedule_requests');
      if (result.error) throw result.error;
      var rows = Array.isArray(result.data) ? result.data : [];
      officeLoaded = true;
      if (!list) return;
      if (!rows.length) {
        list.innerHTML = '<div class="pt81-muted">مفيش طلبات تأجيل معلّقة حالياً.</div>';
        return;
      }
      list.innerHTML = rows.map(function (row) {
        return '<article class="pt81-item">' +
          '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">' +
            '<b>' + esc(row.client_name) + ' · ' + esc(row.sd_request_id) + '</b>' +
            '<span class="pt81-muted">المندوب: ' + esc(row.courier_name) + '</span>' +
          '</div>' +
          '<div class="pt81-muted">الموعد الحالي: ' + esc(row.previous_slot || 'غير محدد') + '</div>' +
          '<div><b>الموعد المقترح: ' + esc(row.proposed_slot) + '</b></div>' +
          '<div class="pt81-muted">سبب التأجيل: ' + esc(row.reason) + '</div>' +
          '<div class="pt81-muted">وقت الطلب: ' + esc(new Date(row.created_at).toLocaleString('ar-EG')) + '</div>' +
          '<input class="pt81-input" maxlength="500" data-pt81-note="' + Number(row.id) + '" placeholder="ملاحظة للمندوب (اختياري)">' +
          '<div class="pt81-actions">' +
            '<button type="button" class="pt81-btn" data-pt81-decision="approved" data-pt81-id="' + Number(row.id) + '">موافقة وتحديث الموعد</button>' +
            '<button type="button" class="pt81-btn reject" data-pt81-decision="rejected" data-pt81-id="' + Number(row.id) + '">رفض الطلب</button>' +
          '</div>' +
        '</article>';
      }).join('');
    } catch (error) {
      officeLoaded = false;
      if (list) list.innerHTML = '<div class="pt81-muted">تعذر تحميل الطلبات: ' + esc(error && error.message) + '</div>';
    } finally {
      officeBusy = false;
    }
  }

  var officeObserver = null;
  function ensureOfficePanel() {
    if (!isOffice()) return;
    var list = $('pt-list');
    var pane = $('tab-pickup');
    if (!list || !pane) return;
    if (!officeObserver && typeof MutationObserver === 'function') {
      officeObserver = new MutationObserver(function () { if (isOffice()) ensureOfficePanel(); });
      officeObserver.observe(pane, { childList: true, subtree: true });
    }
    var panel = $('pt81-office-panel');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'pt81-office-panel';
      panel.className = 'pt81-box';
      panel.innerHTML =
        '<div class="pt81-head">' +
          '<div><b>طلبات تأجيل تيكتات الاستلام</b><div class="pt81-muted">الموعد لا يتغير إلا بعد موافقة المكتب.</div></div>' +
          '<button type="button" class="pt81-btn secondary" id="pt81-office-refresh">تحديث الطلبات</button>' +
        '</div>' +
        '<div id="pt81-office-list" class="pt81-list"><div class="pt81-muted">اضغط تحديث الطلبات لعرض الطلبات المعلّقة.</div></div>';
      list.insertAdjacentElement('afterend', panel);
      officeLoaded = false;
    } else if (panel.previousElementSibling !== list) {
      list.insertAdjacentElement('afterend', panel);
    }
    if (!officeLoaded) loadOfficeRequests();
  }

  document.addEventListener('click', async function (event) {
    var requestButton = event.target.closest && event.target.closest('[data-pt81-request]');
    if (requestButton) {
      openRequestModal(Number(requestButton.getAttribute('data-pt81-request')));
      return;
    }
    if (event.target.id === 'pt81-office-refresh') {
      officeLoaded = false;
      loadOfficeRequests();
      return;
    }
    var decisionButton = event.target.closest && event.target.closest('[data-pt81-decision]');
    if (decisionButton) {
      if (!isOffice()) return;
      var requestId = Number(decisionButton.getAttribute('data-pt81-id'));
      var decision = decisionButton.getAttribute('data-pt81-decision');
      var noteEl = document.querySelector('[data-pt81-note="' + requestId + '"]');
      var note = noteEl ? noteEl.value.trim() : '';
      if (!requestId || ['approved', 'rejected'].indexOf(decision) === -1) return;
      var confirmText = decision === 'approved'
        ? 'تأكيد الموافقة؟ هيتم تحديث موعد التيكت للموعد المقترح.'
        : 'تأكيد رفض طلب التأجيل؟ الموعد الحالي هيفضل زي ما هو.';
      if (!window.confirm(confirmText)) return;
      decisionButton.disabled = true;
      try {
        var result = await window.sbClient.rpc('pickup_ticket_reschedule_resolve', {
          p_request_id: requestId,
          p_decision: decision,
          p_note: note || null
        });
        if (result.error) throw result.error;
        if (!result.data || !result.data.ok) throw new Error('السيرفر ما أكدش القرار');
        officeLoaded = false;
        await loadOfficeRequests();
        toast(decision === 'approved' ? 'تمت الموافقة وتحديث موعد التيكت' : 'تم رفض طلب التأجيل والاحتفاظ بالموعد الحالي', 'success');
        var refresh = $('pt-refresh-btn');
        if (refresh) refresh.click();
      } catch (error) {
        decisionButton.disabled = false;
        toast((error && error.message) || 'تعذر تسجيل قرار المكتب', 'error');
      }
      return;
    }
  });

  function wrap(name, factory) {
    var original = window[name];
    if (typeof original !== 'function' || original.__pt81Wrapped) return;
    var wrapped = factory(original);
    wrapped.__pt81Wrapped = true;
    window[name] = wrapped;
  }

  wrap('switchTab', function (original) {
    return function (id) {
      var result = original.apply(this, arguments);
      if (id === 'pickup') {
        setTimeout(function () {
          ensureOfficePanel();
          if (isOffice()) { officeLoaded = false; loadOfficeRequests(); }
        }, 0);
      }
      return result;
    };
  });

  wrap('loadInitialData', function (original) {
    return async function () {
      var result = await original.apply(this, arguments);
      addStyles();
      wrapCourierRows();
      if (isCourier()) loadCourierRequests(true);
      if (isOffice()) ensureOfficePanel();
      return result;
    };
  });

  function start() {
    addStyles();
    wrapCourierRows();
    if (isCourier()) loadCourierRequests(true);
    if (isOffice()) {
      ensureOfficePanel();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();