/* =====================================================================
   js/73-pickup-ticket.js — تيكت الاستلام المبدئي (النسخة المتكاملة)
   - تعدد الخدمات في نفس الطلب (+ إضافة خدمة تانية) مع خانة نوع المستند / البيان.
   - حالة الدفع (مدفوع مسبقاً / كاش مع المندوب / إنستا باي عند الاستلام) + مبلغ التحصيل.
   - خانة ملاحظات للمندوب وعن العميل + السكريبت المثالي المربوط بكتالوج الخدمات.
   - تحويل للمعاملات الرسمية بخيارين: (تحويل مباشر سريع + فتح في شاشة معاملة جديدة).
   - عرض واضح للمندوب بدون تكلفة أو عمولات داخلية.
   ===================================================================== */
(function () {
  'use strict';
  if (window.__pickupTicketUi) return;
  window.__pickupTicketUi = true;

  var $ = function (id) { return document.getElementById(id); };
  var eh = function (s) {
    if (typeof escapeHtml === 'function') return escapeHtml(s == null ? '' : String(s));
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  };
  var toast = function (msg, kind) {
    if (typeof showToast === 'function') showToast(msg, kind === 'error' ? 'error' : 'success');
    else alert(msg);
  };
  var money = function (n) { return Number(n || 0).toLocaleString('ar-EG') + ' ج.م'; };

  var BTN_OFF = 'tab-btn';
  var BTN_ON = 'tab-btn bg-ink text-white dark:bg-brand-600 shadow-sm';

  var st = {
    tickets: [],
    couriers: [],
    services: [],
    courierTickets: [],
    courierLoadedAt: 0,
    loaded: false,
    busy: false,
    myUid: null,
    collectManual: false,
    draftRows: [{ service_name: '', doc_type: '', sd_service_id: '', qty: 1, unit_price: 0 }]
  };

  function getCurUser() {
    return (typeof currentUser !== 'undefined' && currentUser) ? currentUser : window.currentUser;
  }
  function getStaffDisplayName() {
    if (typeof myProfile !== 'undefined' && myProfile && myProfile.full_name) return myProfile.full_name;
    if (window.myProfile && window.myProfile.full_name) return window.myProfile.full_name;
    var u = getCurUser();
    if (u && u.user_metadata && u.user_metadata.full_name) return u.user_metadata.full_name;
    if (u && u.email) return String(u.email).split('@')[0];
    return 'فريق تساهيل';
  }
  function isManager() { return window.__role === 'manager'; }
  function isCourier() {
    return window.__role === 'courier' || !!(document.body && document.body.classList.contains('is-courier-mode'));
  }
  function isAllowedStaff() {
    if (window.__role === 'partner' || isCourier()) return false;
    if (document.body && document.body.classList.contains('is-partner-mode')) return false;
    return !!getCurUser() && (isManager() || window.__role === 'staff' || !window.__role);
  }

  function cleanPhone(raw) {
    var map = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };
    return String(raw || '')
      .replace(/[٠-٩]/g, function (d) { return map[d] || d; })
      .replace(/[\s\-().]+/g, '')
      .trim();
  }

  function ensureCss() {
    if ($('pt73-style')) return;
    var s = document.createElement('style');
    s.id = 'pt73-style';
    s.textContent = [
      '.pt-wrap{display:flex;flex-direction:column;gap:16px}',
      '.pt-card{background:var(--r-card,#ffffff);border:1px solid var(--r-bd,rgba(148,163,184,.22));border-radius:18px;padding:18px;color:var(--r-tx,#0f172a)}',
      'html.dark .pt-card{background:var(--r-card,#111827);border-color:var(--r-bd,rgba(255,255,255,.09));color:var(--r-tx,#f8fafc)}',
      '.pt-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px}',
      '.pt-title{font-size:17px;font-weight:700;margin:0}',
      '.pt-sub{font-size:12px;color:var(--r-mute,#64748b);margin-top:2px}',
      '.pt-grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}',
      '.pt-fgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}',
      '.pt-field-wrap{display:flex;flex-direction:column;gap:4px}',
      '.pt-label{font-size:11.5px;font-weight:700;color:var(--r-mute,#64748b)}',
      '.pt-input,.pt-select,.pt-textarea{width:100%;box-sizing:border-box;border-radius:11px;border:1px solid var(--r-bd,rgba(148,163,184,.3));background:var(--r-bg,#f8fafc);color:var(--r-tx,#0f172a);padding:9px 11px;font-size:13px;font-family:inherit;outline:none}',
      'html.dark .pt-input,html.dark .pt-select,html.dark .pt-textarea{background:#0b0f17;color:#f8fafc;border-color:rgba(255,255,255,.14)}',
      '.pt-input:focus,.pt-select:focus,.pt-textarea:focus{border-color:var(--r-acc,#ea580c)}',
      '.pt-svc-row{border:1px solid var(--r-bd,rgba(148,163,184,.25));border-radius:13px;padding:10px;background:rgba(148,163,184,.05);display:flex;flex-direction:column;gap:8px}',
      '.pt-svc-row-grid{display:grid;grid-template-columns:2fr 1.3fr 1fr .65fr auto;gap:8px;align-items:end}',
      '.pt-pay-pills{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}',
      '.pt-pay-pill{border:1px solid var(--r-bd,rgba(148,163,184,.3));border-radius:11px;padding:8px 10px;font-size:12px;font-weight:700;cursor:pointer;background:transparent;color:var(--r-tx,#0f172a);font-family:inherit;text-align:center}',
      'html.dark .pt-pay-pill{color:#f8fafc}',
      '.pt-pay-pill.active{border-color:var(--r-acc,#ea580c);background:rgba(234,88,12,.14);color:#ea580c}',
      'html.dark .pt-pay-pill.active{color:#fb923c}',
      '.pt-script-box{background:rgba(234,88,12,.07);border:1px solid rgba(234,88,12,.3);border-radius:14px;padding:13px;font-size:12.8px;line-height:1.75;display:flex;flex-direction:column;gap:8px}',
      '.pt-script-sec{padding-top:6px;border-top:1px dashed rgba(234,88,12,.25)}',
      '.pt-script-sec:first-child{padding-top:0;border-top:0}',
      '.pt-chk-row{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;border:1px solid var(--r-bd,rgba(148,163,184,.2));cursor:pointer;font-size:12.5px}',
      '.pt-btn{border:0;border-radius:12px;padding:9px 14px;font-size:12.5px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;font-family:inherit}',
      '.pt-btn-pri{background:var(--r-acc,#ea580c);color:#ffffff}',
      '.pt-btn-ok{background:#059669;color:#ffffff}',
      '.pt-btn-sec{background:rgba(148,163,184,.16);color:var(--r-tx,#0f172a)}',
      'html.dark .pt-btn-sec{background:rgba(255,255,255,.1);color:#f8fafc}',
      '.pt-btn-danger{background:rgba(225,29,72,.14);color:#e11d48;border:1px solid rgba(225,29,72,.3)}',
      '.pt-btn:disabled{opacity:.48;cursor:not-allowed}',
      '.pt-price-bar{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;padding:9px 12px;border-radius:11px;background:rgba(16,185,129,.12);border:1px solid rgba(16,185,129,.3);font-size:12px;font-weight:700;color:#059669}',
      'html.dark .pt-price-bar{color:#34d399}',
      '.pt-ticket-item{border:1px solid var(--r-bd,rgba(148,163,184,.22));border-radius:14px;padding:13px;display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:12px}',
      '.pt-badge{display:inline-flex;align-items:center;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:700}',
      '.pt-badge-org{background:rgba(234,88,12,.15);color:#ea580c}',
      '.pt-badge-ok{background:rgba(16,185,129,.15);color:#10b981}',
      '.pt-badge-warn{background:rgba(245,158,11,.18);color:#d97706}',
      '.pt-badge-pur{background:rgba(139,92,246,.18);color:#7c3aed}',
      '.pt-badge-mut{background:rgba(148,163,184,.18);color:#64748b}',
      '.pt-comment-pre{font-size:11.5px;background:rgba(0,0,0,.06);padding:8px 10px;border-radius:10px;margin-top:6px;line-height:1.55;word-break:break-word}',
      'html.dark .pt-comment-pre{background:rgba(255,255,255,.06)}',
      '.pt-courier-box{margin:10px 12px 0;padding:12px;border-radius:16px;border:1px solid rgba(234,88,12,.35);background:rgba(234,88,12,.08);color:var(--tx,#f8fafc);font-size:12.5px}',
      '@media (max-width:960px){.pt-grid2{grid-template-columns:1fr}}',
      '@media (max-width:640px){.pt-svc-row-grid{grid-template-columns:1fr 1fr}.pt-pay-pills{grid-template-columns:1fr}}',
      '@media (max-width:520px){.pt-fgrid{grid-template-columns:1fr}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function copyText(txt) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(txt).catch(function () { return fallbackCopy(txt); });
    }
    return fallbackCopy(txt);
  }
  function fallbackCopy(txt) {
    try {
      var ta = document.createElement('textarea');
      ta.value = txt;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    } catch (e) { /* ignore */ }
  }

  function getServicesList() {
    if (typeof allServices !== 'undefined' && Array.isArray(allServices) && allServices.length) return allServices;
    if (Array.isArray(window.allServices) && window.allServices.length) return window.allServices;
    return st.services;
  }
  function findSvc(name) {
    if (!name) return null;
    var svcs = getServicesList();
    return svcs.find(function (s) { return s.name === name; }) || null;
  }

  async function loadDependencies() {
    if (!sbClient) return;
    var u = getCurUser();
    st.myUid = u ? u.id : null;
    var jobs = [
      sbClient.from('couriers').select('id,name,active').eq('active', true).order('name')
    ];
    if (!getServicesList().length) {
      jobs.push(sbClient.from('services').select('id,name,unit_price,executor,duration_days,required_docs,script_notes,delivery_mode').order('name'));
    }
    var res = await Promise.all(jobs);
    if (res[0] && !res[0].error && Array.isArray(res[0].data)) st.couriers = res[0].data;
    if (res[1] && !res[1].error && Array.isArray(res[1].data)) st.services = res[1].data;
  }

  async function loadTickets() {
    if (!sbClient) return;
    var colsNew = 'id,sd_request_id,sd_service_id,client_name,phone,address,zone,service_name,qty,unit_price,total,executor,slot_pref,courier_id,call_checks,summary_comment,status,created_by,created_at,items,payment_status,collect_amount,staff_notes,converted_tx_id';
    var colsOld = 'id,sd_request_id,sd_service_id,client_name,phone,address,zone,service_name,qty,unit_price,total,executor,slot_pref,courier_id,call_checks,summary_comment,status,created_by,created_at';
    var r = await sbClient.from('pickup_tickets').select(colsNew).neq('status', 'cancelled').order('created_at', { ascending: false }).limit(60);
    if (r.error && /42703|items|payment_status|staff_notes/i.test((r.error.message || '') + ' ' + (r.error.code || ''))) {
      r = await sbClient.from('pickup_tickets').select(colsOld).neq('status', 'cancelled').order('created_at', { ascending: false }).limit(60);
    }
    if (r.error) throw r.error;
    st.tickets = Array.isArray(r.data) ? r.data : [];
    st.loaded = true;
  }

  function paymentBadgeForCourier(t) {
    if (t.payment_status === 'cod_cash') {
      return '<div style="margin-top:4px;padding:4px 8px;border-radius:8px;background:rgba(245,158,11,.2);color:#fbbf24;font-weight:700;font-size:11.5px">مطلوب تحصيل كاش: ' + eh(money(t.collect_amount || 0)) + ' + عمل إيصال للعميل</div>';
    }
    if (t.payment_status === 'instapay_on_arrival') {
      return '<div style="margin-top:4px;padding:4px 8px;border-radius:8px;background:rgba(139,92,246,.22);color:#c4b5fd;font-weight:700;font-size:11.5px">مطلوب تأكيد تحويل إنستا باي: ' + eh(money(t.collect_amount || 0)) + ' + إيصال</div>';
    }
    return '<div style="margin-top:4px;padding:4px 8px;border-radius:8px;background:rgba(16,185,129,.18);color:#34d399;font-weight:700;font-size:11.5px">خالص الدفع — استلام أوراق فقط</div>';
  }

  /* معرفة التاب النشط في بوابة المندوب */
  function currentCourierTab() {
    var on = document.querySelector('#cp-nav button.on');
    return on ? (on.getAttribute('data-tab') || '') : '';
  }

  function cleanWaPhone(ph) {
    var d = String(ph || '').replace(/\D+/g, '');
    if (!d) return '';
    if (d.startsWith('0')) return '2' + d;
    return d;
  }

  function renderCallChecksBadges(cc) {
    if (!cc || typeof cc !== 'object') return '';
    var labels = {
      docs_ready: 'الأوراق جاهزة',
      address_ok: 'العنوان مؤكد',
      slot_ok: 'الميعاد مؤكد',
      fees_ok: 'الرسوم واضحة',
      whatsapp_ok: 'واتساب مؤكد'
    };
    var keys = Object.keys(cc).filter(function (k) { return !!cc[k]; });
    if (!keys.length) return '';
    return '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">' +
      keys.map(function (k) {
        return '<span style="font-size:10.5px;padding:2px 7px;border-radius:999px;background:rgba(16,185,129,.14);color:#34d399;border:1px solid rgba(16,185,129,.3)">✓ ' + eh(labels[k] || k) + '</span>';
      }).join('') +
    '</div>';
  }

  function renderCourierTicketsIntoBody() {
    var body = $('cp-body');
    if (!body) return;
    var old = $('pt73-courier-tickets');
    var tab = currentCourierTab();
    var showHere = !tab || tab === 'today' || tab === 'trips' || tab === 'home' || tab === 'account';
    if (!showHere || !Array.isArray(st.courierTickets) || !st.courierTickets.length) {
      if (old) old.remove();
      return;
    }
    var box = old;
    if (!box) {
      box = document.createElement('section');
      box.id = 'pt73-courier-tickets';
      box.className = 'pt-courier-box';
      box.style.margin = '0 0 12px 0';
      var bar = $('cp4-toolkit-bar');
      if (bar && bar.parentElement === body) {
        if (bar.nextSibling) body.insertBefore(box, bar.nextSibling);
        else body.appendChild(box);
      } else {
        body.insertBefore(box, body.firstChild);
      }
    }
    box.dataset.cp4Decorated = '';
    var steps = [
      ['on_the_way', 'في طريقي', '#f59e0b'],
      ['call_attempt', 'كلمت العميل', '#38bdf8'],
      ['waiting', 'وصلت للعميل', '#a855f7'],
      ['near_office', 'تم استلام الأوراق', '#10b981']
    ];
    box.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">' +
        '<b style="font-size:13.5px">تيكتات استلام مطلوبة منك (' + st.courierTickets.length + ')</b>' +
        '<span style="font-size:11px;opacity:.8">اضغط الخطوة لتحديث المكتب</span>' +
      '</div>' +
      st.courierTickets.map(function (t) {
        var itemsList = Array.isArray(t.items) && t.items.length
          ? t.items
          : [{ service_name: t.service_name, doc_type: '', qty: t.qty || 1 }];
        var svcsHtml = itemsList.map(function (it) {
          return eh(it.service_name) + (it.doc_type ? ' (' + eh(it.doc_type) + ')' : '') + ' × ' + Number(it.qty || 1);
        }).join(' + ');
        var waPh = cleanWaPhone(t.phone);
        var mapQ = encodeURIComponent([t.zone, t.address].filter(Boolean).join(' '));
        var curStep = '';
        try { curStep = localStorage.getItem('pt73_step_' + t.id) || ''; } catch (e) {}
        var isPaid = t.payment_status === 'paid' || Number(t.collect_amount || 0) <= 0;

        return '<div class="pt73-ticket-item" data-ticket-id="' + Number(t.id) + '" data-paid="' + (isPaid ? '1' : '0') + '" style="padding:10px 0;border-top:1px solid rgba(255,255,255,.12)">' +
          '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;flex-wrap:wrap">' +
            '<div><b style="font-size:14px">' + eh(t.client_name) + '</b> · <span dir="ltr" style="font-size:12px;opacity:.85">' + eh(t.sd_request_id) + '</span></div>' +
            '<span style="font-size:11px;padding:2px 8px;border-radius:999px;background:rgba(245,158,11,.18);color:#fbbf24;font-weight:700">الميعاد: ' + eh(t.slot_pref || 'غير محدد') + '</span>' +
          '</div>' +
          '<div style="font-size:12px;opacity:.92;margin-top:4px">' + svcsHtml + '</div>' +
          ((t.zone || t.address) ? '<div style="font-size:12px;opacity:.88;margin-top:3px">العنوان: ' + eh([t.zone, t.address].filter(Boolean).join(' — ')) + '</div>' : '') +
          paymentBadgeForCourier(t) +
          renderCallChecksBadges(t.call_checks) +
          (t.summary_comment
            ? '<details style="margin-top:7px;padding:7px 9px;border-radius:10px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1)" open>' +
                '<summary style="cursor:pointer;font-size:11.5px;font-weight:700;color:#93c5fd">ملخص وسكريبت مكالمة الموظف مع العميل</summary>' +
                '<div style="font-size:12px;margin-top:5px;line-height:1.6;white-space:pre-wrap">' + eh(t.summary_comment) + '</div>' +
              '</details>'
            : '') +
          (t.staff_notes ? '<div style="font-size:11.5px;margin-top:5px;color:#fde68a">ملاحظة الموظف: ' + eh(t.staff_notes) + '</div>' : '') +
          '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">' +
            (t.phone ? '<a href="tel:' + eh(t.phone) + '" style="display:inline-flex;align-items:center;gap:5px;padding:6px 11px;border-radius:10px;background:rgba(16,185,129,.18);border:1px solid rgba(16,185,129,.4);color:#34d399;font-size:12px;font-weight:700;text-decoration:none"><i class="fa-solid fa-phone"></i><span>اتصال</span></a>' : '') +
            (waPh ? '<a href="https://wa.me/' + eh(waPh) + '" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:5px;padding:6px 11px;border-radius:10px;background:rgba(34,197,94,.16);border:1px solid rgba(34,197,94,.35);color:#4ade80;font-size:12px;font-weight:700;text-decoration:none"><i class="fa-brands fa-whatsapp"></i><span>واتساب</span></a>' : '') +
            (mapQ ? '<a href="https://www.google.com/maps/search/?api=1&query=' + mapQ + '" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:5px;padding:6px 11px;border-radius:10px;background:rgba(56,189,248,.16);border:1px solid rgba(56,189,248,.35);color:#38bdf8;font-size:12px;font-weight:700;text-decoration:none"><i class="fa-solid fa-location-dot"></i><span>الخريطة</span></a>' : '') +
          '</div>' +
          '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-top:8px">' +
            steps.map(function (sp) {
              var active = curStep === sp[0];
              return '<button type="button" data-pt73-step="' + sp[0] + '" data-pt73-tid="' + Number(t.id) + '" data-pt73-sd="' + eh(t.sd_request_id) + '" data-pt73-cl="' + eh(t.client_name) + '" data-pt73-lbl="' + sp[1] + '" style="padding:8px 8px;border-radius:10px;font:inherit;font-size:12px;font-weight:700;cursor:pointer;border:1px solid ' + (active ? sp[2] : 'rgba(255,255,255,.16)') + ';background:' + (active ? sp[2] : 'rgba(255,255,255,.06)') + ';color:' + (active ? '#0b0a09' : 'inherit') + '">' + (active ? '✓ ' : '') + sp[1] + '</button>';
            }).join('') +
          '</div>' +
        '</div>';
      }).join('');
  }

  /* عرض تيكتات الاستلام المعيّنة للمندوب (داخل #cp-body القابل للتمرير) */
  async function loadAndRenderCourierMyTickets(force) {
    if (!sbClient || !isCourier()) return;
    var app = $('courier-app');
    if (!app) return;
    if (!force && st.courierLoadedAt && (Date.now() - st.courierLoadedAt < 60000)) {
      renderCourierTicketsIntoBody();
      return;
    }
    st.courierLoadedAt = Date.now();
    try {
      ensureCss();
      var r = await sbClient.rpc('courier_my_tickets');
      if (r.error || !Array.isArray(r.data)) return;
      st.courierTickets = r.data;
      renderCourierTicketsIntoBody();
    } catch (e) { /* ignore */ }
  }

  document.addEventListener('click', async function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var stepBtn = t.closest('[data-pt73-step]');
    if (stepBtn) {
      var evType = stepBtn.getAttribute('data-pt73-step');
      var tid = stepBtn.getAttribute('data-pt73-tid');
      var sdId = stepBtn.getAttribute('data-pt73-sd') || '';
      var clName = stepBtn.getAttribute('data-pt73-cl') || '';
      var lbl = stepBtn.getAttribute('data-pt73-lbl') || evType;
      stepBtn.disabled = true;
      try {
        if (!sbClient) throw new Error('لا يوجد اتصال بالسيرفر');
        var res = await sbClient.rpc('courier_v12_dispatch_action', {
          p_event_type: evType,
          p_tx: null,
          p_payload: {
            source: 'pickup_ticket',
            ticket_id: Number(tid),
            sd_request_id: sdId,
            client_name: clName,
            note: 'تيكت استلام ' + sdId + ' (' + clName + '): ' + lbl
          }
        });
        if (res.error) throw res.error;
        try { localStorage.setItem('pt73_step_' + tid, evType); } catch (e2) {}
        renderCourierTicketsIntoBody();
        if (typeof showToast === 'function') showToast('تم تحديث حالة الاستلام: ' + lbl, 'success');
      } catch (err) {
        stepBtn.disabled = false;
        if (typeof showToast === 'function') showToast((err && err.message) || 'تعذر تحديث الحالة', 'error');
      }
      return;
    }
    if (t.closest('#cp-nav button')) {
      setTimeout(renderCourierTicketsIntoBody, 80);
    }
  });

  function syncDraftRowsFromDom() {
    var rowsEl = document.querySelectorAll('#pt-items-wrap .pt-svc-row');
    if (!rowsEl.length) return;
    var next = [];
    rowsEl.forEach(function (rowEl) {
      var svcName = (rowEl.querySelector('.pt-row-svc') && rowEl.querySelector('.pt-row-svc').value) || '';
      var docType = (rowEl.querySelector('.pt-row-doc') && rowEl.querySelector('.pt-row-doc').value.trim()) || '';
      var svcId = (rowEl.querySelector('.pt-row-svcid') && rowEl.querySelector('.pt-row-svcid').value.trim()) || '';
      var qty = Math.max(1, parseInt(rowEl.querySelector('.pt-row-qty') && rowEl.querySelector('.pt-row-qty').value, 10) || 1);
      var svcObj = findSvc(svcName);
      var unitPrice = svcObj ? Number(svcObj.unit_price || 0) : 0;
      var executor = (svcObj && svcObj.executor) ? svcObj.executor : '';
      next.push({
        service_name: svcName,
        doc_type: docType,
        sd_service_id: svcId,
        qty: qty,
        unit_price: unitPrice,
        executor: executor,
        line_total: Math.round(unitPrice * qty * 100) / 100
      });
    });
    st.draftRows = next;
  }

  function getPayMode() {
    var el = $('pt-pay-status');
    return el ? el.value : 'paid';
  }

  function buildScriptAndSummary() {
    syncDraftRowsFromDom();
    var staffName = getStaffDisplayName();
    var nameEl = $('pt-client'), reqEl = $('pt-reqid'), zoneEl = $('pt-zone'), addrEl = $('pt-addr'), slotEl = $('pt-slot'), crEl = $('pt-courier'), notesEl = $('pt-notes');
    var client = (nameEl && nameEl.value.trim()) || 'حضرتك';
    var reqId = (reqEl && reqEl.value.trim()) || '—';
    var place = (zoneEl && zoneEl.value.trim()) || (addrEl && addrEl.value.trim()) || 'العنوان المسجل';
    var slot = (slotEl && slotEl.value) || 'صباحي';
    var courierName = (crEl && crEl.selectedOptions && crEl.selectedOptions[0]) ? crEl.selectedOptions[0].textContent : 'المندوب';
    var staffNotes = (notesEl && notesEl.value.trim()) || '';

    var items = st.draftRows.filter(function (r) { return r.service_name; });
    var total = 0;
    items.forEach(function (r) { total += Number(r.line_total || 0); });
    total = Math.round(total * 100) / 100;

    var payMode = getPayMode();
    var colEl = $('pt-collect-amt');
    var collectAmt = payMode === 'paid' ? 0 : Math.max(0, Number((colEl && colEl.value !== '' ? colEl.value : total)) || 0);

    var svcsPhraseHtml = items.length
      ? items.map(function (r) {
          return '<b>' + eh(r.service_name) + '</b>' + (r.doc_type ? ' (نوع المستند: <b>' + eh(r.doc_type) + '</b>)' : '') + (r.qty > 1 ? ' × <b>' + r.qty + '</b>' : '');
        }).join(' + ')
      : '<b>الخدمة المطلوبة</b>';

    var payHtml = '';
    if (payMode === 'paid') {
      payHtml = 'أنا باين قدامي في السيستم إن حضرتك <b>دافع الرسوم بالكامل</b>، تمام كده المندوب هيستلم الأوراق بس.';
    } else if (payMode === 'cod_cash') {
      payHtml = 'بالنسبة للرسوم، حضرتك تفضّل كاش مع المندوب ولا إنستا باي؟ طيب تمام، هستأذن حضرتك تجهّز مبلغ <b>' + eh(money(collectAmt)) + '</b> رسوم الخدمة، والمندوب هيحصّلهم من حضرتك كاش ويسلّمك <b>إيصال رسمي</b>.';
    } else {
      payHtml = 'بالنسبة للرسوم، أول ما المندوب يوصل لحضرتك ويراجع الأصول هتحوّل مبلغ <b>' + eh(money(collectAmt)) + '</b> إنستا باي أو تحويل بنكي وتورّيه سكرين التحويل، والمندوب هيسلّمك <b>إيصال</b> بالاستلام.';
    }

    var catalogBlocks = items.map(function (r) {
      var svc = findSvc(r.service_name) || {};
      var docs = (svc.required_docs || '').trim() || 'أصل البطاقة + أصل المستند المطلوب';
      var dur = svc.duration_days ? 'بتاخد <b>' + Number(svc.duration_days) + ' يوم عمل</b> (من غير جمعة وسبت)' : 'بنتابع مع حضرتك موعد الانتهاء أول بأول';
      var extra = (svc.script_notes || '').trim();
      var hubNote = svc.delivery_mode === 'hub_abbasiya' ? ' (التسليم النهائي في نقطة تجمع جوازات العباسية)' : '';
      return '<div style="margin-top:4px">' +
        '• <b>' + eh(r.service_name) + ':</b> هتحضر <b>' + eh(docs) + '</b> — المدة ' + dur + eh(hubNote) + '.' +
        (extra ? '<div style="margin-top:2px;color:var(--r-acc,#ea580c)"><b>تنبيه مهم للعميل:</b> ' + eh(extra) + '</div>' : '') +
      '</div>';
    }).join('');

    var scriptHtml =
      '<div class="pt-script-sec">«مساء الخير يا فندم، مع حضرتك <b>' + eh(staffName) + '</b> من شركة <b>تساهيل</b>. أستاذ <b>' + eh(client) + '</b>، بخصوص طلب <b dir="ltr">' + eh(reqId) + '</b>، حضرتك بتقدم على ' + svcsPhraseHtml + '، مظبوط كده؟»</div>' +
      '<div class="pt-script-sec">«المندوب هيعدي على حضرتك النهارده على مدار اليوم في <b>' + eh(place) + '</b>، وهيبقى في مكالمة تانية من المندوب قبل ما يتحرك. الميعاد المناسب للتواصل: <b>' + eh(slot) + '</b>.»</div>' +
      '<div class="pt-script-sec">' + payHtml + '</div>' +
      '<div class="pt-script-sec"><b>الأوراق والمدة وشروط الخدمة (من كتالوج الخدمات):</b>' +
        (catalogBlocks || '<div>• أصل البطاقة + أصل المستندات المطلوبة.</div>') +
        (payMode !== 'paid' ? '<div style="margin-top:4px"><b>+ تجهيز مبلغ: ' + eh(money(collectAmt)) + '</b></div>' : '') +
      '</div>';

    var checks = [];
    document.querySelectorAll('.pt-chk:checked').forEach(function (c) { checks.push(c.value); });

    var svcsSummary = items.map(function (r) {
      return r.service_name + (r.doc_type ? ' [' + r.doc_type + ']' : '') + ' ×' + r.qty;
    }).join(' + ') || 'خدمة';
    var payText = payMode === 'paid' ? 'مدفوع مسبقاً' : (payMode === 'cod_cash' ? 'تحصيل كاش ' + collectAmt + ' ج' : 'تحويل إنستا باي ' + collectAmt + ' ج');

    var summary = '[مراجعة الاستلام - تساهيل] طلب ' + reqId + ' | ' + client + ' | ' + svcsSummary + ' | الدفع: ' + payText + ' | الميعاد: ' + slot + ' | العنوان: ' + place + ' | المندوب: ' + courierName + (staffNotes ? ' | ملاحظات: ' + staffNotes : '');

    return {
      items: items,
      total: total,
      payMode: payMode,
      collectAmt: collectAmt,
      staffNotes: staffNotes,
      scriptHtml: scriptHtml,
      summary: summary,
      checks: checks
    };
  }

  function refreshLivePreview() {
    var box = $('pt-script-preview'), bar = $('pt-price-bar'), colInput = $('pt-collect-amt'), colWrap = $('pt-collect-wrap');
    var info = buildScriptAndSummary();
    if (colWrap) colWrap.classList.toggle('hidden', info.payMode === 'paid');
    if (colInput && !st.collectManual) colInput.value = info.payMode === 'paid' ? '0' : String(info.total || 0);
    if (box) box.innerHTML = info.scriptHtml;
    if (bar) {
      var execs = [];
      info.items.forEach(function (r) { if (r.executor && execs.indexOf(r.executor) < 0) execs.push(r.executor); });
      bar.innerHTML = '<span>عدد الخدمات: <b>' + info.items.length + '</b> · الإجمالي: <b>' + eh(money(info.total)) + '</b></span><span>المنفذ: <b>' + eh(execs.join('، ') || '—') + '</b></span>';
    }
  }

  function renderDraftRows() {
    var wrap = $('pt-items-wrap');
    if (!wrap) return;
    var svcs = getServicesList();
    var svcOptsHtml = '<option value="">اختر الخدمة…</option>' + svcs.map(function (s) {
      return '<option value="' + eh(s.name) + '">' + eh(s.name) + ' (' + eh(money(s.unit_price || 0)) + ')</option>';
    }).join('');

    wrap.innerHTML = st.draftRows.map(function (row, idx) {
      return '<div class="pt-svc-row" data-row-idx="' + idx + '">' +
        '<div class="pt-svc-row-grid">' +
          '<div class="pt-field-wrap"><label class="pt-label">الخدمة #' + (idx + 1) + ' *</label><select class="pt-select pt-row-svc" required>' + svcOptsHtml + '</select></div>' +
          '<div class="pt-field-wrap"><label class="pt-label">نوع المستند / البيان</label><input class="pt-input pt-row-doc" maxlength="80" placeholder="مثال: مؤهل / ميلاد" value="' + eh(row.doc_type) + '"></div>' +
          '<div class="pt-field-wrap"><label class="pt-label">Service ID</label><input class="pt-input pt-row-svcid" dir="ltr" maxlength="60" placeholder="اختياري" value="' + eh(row.sd_service_id) + '"></div>' +
          '<div class="pt-field-wrap"><label class="pt-label">العدد</label><input class="pt-input pt-row-qty" type="number" min="1" max="500" value="' + Number(row.qty || 1) + '" required></div>' +
          (st.draftRows.length > 1
            ? '<button type="button" class="pt-btn pt-btn-danger" data-pt-delrow="' + idx + '" title="حذف السطر">✕</button>'
            : '<div></div>') +
        '</div>' +
      '</div>';
    }).join('');

    var rowEls = wrap.querySelectorAll('.pt-svc-row');
    rowEls.forEach(function (el, idx) {
      var sel = el.querySelector('.pt-row-svc');
      if (sel && st.draftRows[idx]) sel.value = st.draftRows[idx].service_name || '';
    });
  }

  function courierNameById(cid) {
    var c = st.couriers.find(function (x) { return Number(x.id) === Number(cid); });
    return c ? c.name : 'غير معين';
  }

  function mapTicketToItems(t) {
    if (Array.isArray(t.items) && t.items.length) return t.items;
    return [{
      service_name: t.service_name,
      doc_type: '',
      sd_service_id: t.sd_service_id || '',
      qty: Number(t.qty || 1),
      unit_price: Number(t.unit_price || 0),
      executor: t.executor || '',
      line_total: Number(t.total || 0)
    }];
  }

  function mapPayMethod(ticket) {
    if (ticket.payment_status === 'instapay_on_arrival') return 'إنستا باي';
    return 'كاش';
  }

  function buildLineNote(ticket, item) {
    var parts = [];
    if (item.doc_type) parts.push('نوع المستند: ' + item.doc_type);
    if (ticket.staff_notes) parts.push(ticket.staff_notes);
    return parts.join(' - ') || null;
  }

  async function directConvertTicket(ticket) {
    if (!sbClient) return;
    if (st.converting) return;
    if (ticket.status === 'converted') return toast('التيكت ده اتحوّل لمعاملة بالفعل', 'error');
    // مدفوع مسبقاً: طريقة الدفع الفعلية لازم الموظف يحددها بنفسه، فنفتح شاشة معاملة جديدة للمراجعة
    if (ticket.payment_status === 'paid') {
      toast('التيكت مدفوع مسبقاً: راجع طريقة الدفع الفعلية في شاشة معاملة جديدة ثم احفظ', 'error');
      return prefillNewOrderTab(ticket);
    }
    st.converting = true;
    try { await doDirectConvert(ticket); } finally { st.converting = false; }
  }

  async function doDirectConvert(ticket) {
    var items = mapTicketToItems(ticket);
    // لو أي خدمة مش موجودة في الكتالوج: نوقف بدل ما نسجل تكلفة وعمولة 0
    var missing = items.filter(function (it) { return !findSvc(it.service_name); })
      .map(function (it) { return it.service_name; });
    if (missing.length) {
      return toast('خدمة غير موجودة في الكتالوج: ' + missing.join('، ') + ' — استخدم «فتح في معاملة جديدة»', 'error');
    }
    var cName = courierNameById(ticket.courier_id);
    var empName = getStaffDisplayName();
    var payMethod = mapPayMethod(ticket);
    var nowIso = new Date().toISOString().slice(0, 19);

    var rows = items.map(function (it) {
      var svcObj = findSvc(it.service_name) || {};
      var uPrice = Number(it.unit_price != null ? it.unit_price : (svcObj.unit_price || 0));
      var cost = Number(svcObj.default_cost || 0);
      var comm = Number(svcObj.commission_per_unit || 0);
      return {
        client_name: ticket.client_name,
        phone: ticket.phone || null,
        address: ticket.address || (ticket.zone || null),
        employee: empName,
        payment_method: payMethod,
        receiver: cName !== 'غير معين' ? cName : null,
        received_at: nowIso,
        rn_nm: ticket.sd_request_id || null,
        service: it.service_name,
        service_ref: it.sd_service_id || ticket.sd_service_id || null,
        qty: Math.max(1, Number(it.qty || 1)),
        unit_price: uPrice,
        list_price: uPrice,
        discount_pct: 0,
        exec_unit_cost: cost,
        commission_per_unit: comm,
        executor: it.executor || svcObj.executor || null,
        duration_days: svcObj.duration_days || null,
        notes: buildLineNote(ticket, it)
      };
    });

    // كل الخطوات (قفل التيكت + رقم المعاملة + البنود + تغيير الحالة) في RPC واحدة على السيرفر
    var rc = await sbClient.rpc('pickup_convert_ticket', { p_ticket_id: ticket.id, p_rows: rows });
    if (rc.error) {
      var already = /اتحوّل لمعاملة بالفعل/.test(rc.error.message || '');
      if (already) { ticket.status = 'converted'; renderTicketsList(); }
      return toast((already ? '' : 'فشل التحويل: ') + (rc.error.message || 'خطأ غير معروف'), 'error');
    }
    var txId = (rc.data && rc.data.transaction_id) || '';

    ticket.status = 'converted';
    ticket.converted_tx_id = txId;
    renderTicketsList();
    try { if (typeof loadRecentRequests === 'function') await loadRecentRequests(); } catch (e) { /* */ }
    toast('تم تحويل التيكت إلى معاملة رسمية برقم: ' + txId + ' ✓');
  }

  function prefillNewOrderTab(ticket) {
    if (typeof window.switchTab !== 'function') return toast('شاشة معاملة جديدة غير متاحة', 'error');
    window.switchTab('new');
    setTimeout(function () {
      try {
        if ($('client-name')) $('client-name').value = ticket.client_name || '';
        if ($('phone')) { $('phone').value = ticket.phone || ''; if (typeof onPhoneInput === 'function') onPhoneInput(ticket.phone || ''); }
        if ($('address')) $('address').value = [ticket.zone, ticket.address].filter(Boolean).join(' — ');
        if ($('rn-nm')) $('rn-nm').value = ticket.sd_request_id || '';
        var cName = courierNameById(ticket.courier_id);
        if ($('receiver') && cName !== 'غير معين') $('receiver').value = cName;
        if ($('notes')) $('notes').value = ticket.staff_notes || '';
        if ($('tx-id') && !$('tx-id').value && typeof generateNewTxId === 'function') generateNewTxId(true);
        if (typeof selectPaymentMethod === 'function') selectPaymentMethod(mapPayMethod(ticket));

        var items = mapTicketToItems(ticket);
        if ($('lines-container') && typeof addServiceLine === 'function') {
          $('lines-container').innerHTML = '';
          if (typeof serviceLineCounter !== 'undefined') window.serviceLineCounter = 0;
          items.forEach(function (it) {
            addServiceLine();
            var lineEl = $('lines-container').lastElementChild;
            if (!lineEl) return;
            var svcInp = lineEl.querySelector('.svc-name');
            if (svcInp) {
              svcInp.value = it.service_name || '';
              if (typeof onServiceSelected === 'function') onServiceSelected(lineEl.id, svcInp.value);
            }
            var qtyInp = lineEl.querySelector('.svc-qty');
            if (qtyInp) qtyInp.value = String(it.qty || 1);
            var refInp = lineEl.querySelector('.svc-ref');
            if (refInp && it.sd_service_id) refInp.value = it.sd_service_id;
            var noteInp = lineEl.querySelector('.svc-notes');
            if (noteInp && it.doc_type) noteInp.value = 'نوع المستند: ' + it.doc_type;
          });
          if (typeof calculateTotals === 'function') calculateTotals();
        }
        toast('اتفتحت شاشة «معاملة جديدة» متعبية ببيانات التيكت — راجع واضغط حفظ ✓');
      } catch (e) {
        toast('تعذر تعبئة بعض الخانات: ' + e.message, 'error');
      }
    }, 120);
  }

  function renderTicketsList() {
    var list = $('pt-list');
    if (!list) return;
    if (!st.tickets.length) {
      list.innerHTML = '<div class="pt-sub" style="text-align:center;padding:18px 0">مفيش تذاكر استلام مبدئية دلوقتي.</div>';
      return;
    }
    var statusLabel = { open: 'مفتوح', with_courier: 'مع المندوب', converted: 'تم التحويل', cancelled: 'ملغي' };
    list.innerHTML = st.tickets.map(function (t) {
      var items = mapTicketToItems(t);
      var svcsHtml = items.map(function (it) {
        return eh(it.service_name) + (it.doc_type ? ' (' + eh(it.doc_type) + ')' : '') + ' × ' + Number(it.qty || 1);
      }).join(' + ');
      var payBadge = t.payment_status === 'cod_cash'
        ? '<span class="pt-badge pt-badge-warn">تحصيل كاش: ' + eh(money(t.collect_amount || 0)) + '</span>'
        : (t.payment_status === 'instapay_on_arrival'
          ? '<span class="pt-badge pt-badge-pur">إنستا باي عند الاستلام: ' + eh(money(t.collect_amount || 0)) + '</span>'
          : '<span class="pt-badge pt-badge-ok">دافع مسبقاً</span>');
      var canAction = t.status === 'open' || t.status === 'with_courier';
      var canCancel = canAction && (isManager() || !t.created_by || (st.myUid && t.created_by === st.myUid));

      return '<div class="pt-ticket-item" data-ticket-row="' + Number(t.id) + '">' +
        '<div style="flex:1;min-width:250px">' +
          '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px">' +
            '<span class="pt-badge pt-badge-org" dir="ltr">' + eh(t.sd_request_id) + '</span>' +
            '<b class="pt-client-cell">' + eh(t.client_name) + '</b>' +
            '<span class="pt-sub" dir="ltr">' + eh(t.phone) + '</span>' +
            '<span class="pt-badge pt-badge-ok">' + eh(statusLabel[t.status] || t.status) + '</span>' +
            payBadge +
            '<span class="pt-badge pt-badge-mut">المندوب: ' + eh(courierNameById(t.courier_id)) + '</span>' +
            (t.converted_tx_id ? '<span class="pt-badge pt-badge-org" dir="ltr">' + eh(t.converted_tx_id) + '</span>' : '') +
          '</div>' +
          '<div class="pt-sub" style="margin-top:5px">' + svcsHtml + ' · الإجمالي: <b>' + eh(money(t.total)) + '</b> · الميعاد: ' + eh(t.slot_pref) + (t.zone ? ' · ' + eh(t.zone) : '') + '</div>' +
          (t.staff_notes ? '<div class="pt-sub" style="margin-top:3px;color:var(--r-acc,#ea580c)"><b>ملاحظات:</b> ' + eh(t.staff_notes) + '</div>' : '') +
          (t.summary_comment ? '<div class="pt-comment-pre">' + eh(t.summary_comment) + '</div>' : '') +
        '</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:6px">' +
          '<button type="button" class="pt-btn pt-btn-sec" data-pt-act="copy" data-id="' + Number(t.id) + '">نسخ الكومنت</button>' +
          (canAction ? '<button type="button" class="pt-btn pt-btn-ok" data-pt-act="convert" data-id="' + Number(t.id) + '">تحويل مباشر لمعاملة</button>' : '') +
          (canAction ? '<button type="button" class="pt-btn pt-btn-sec" data-pt-act="prefill" data-id="' + Number(t.id) + '">فتح في معاملة جديدة</button>' : '') +
          (canCancel ? '<button type="button" class="pt-btn pt-btn-danger" data-pt-act="cancel" data-id="' + Number(t.id) + '">إلغاء</button>' : '') +
        '</div>' +
      '</div>';
    }).join('');
  }

  function renderView() {
    var pane = $('tab-pickup');
    if (!pane) return;
    ensureCss();
    var crOptions = '<option value="">بدون مندوب حالياً</option>' + st.couriers.map(function (c) {
      return '<option value="' + Number(c.id) + '">' + eh(c.name) + '</option>';
    }).join('');

    pane.innerHTML =
      '<div class="pt-wrap">' +
        '<section class="pt-card">' +
          '<div class="pt-head">' +
            '<div>' +
              '<h2 class="pt-title">تيكت الاستلام المبدئي (سمارت ديسك + السكريبت الحي)</h2>' +
              '<div class="pt-sub">دعم تعدد الخدمات، حالة الدفع والتحصيل للمندوب، شروط كتالوج الخدمات، والتحويل المباشر لمعاملة رسمية.</div>' +
            '</div>' +
            '<button type="button" class="pt-btn pt-btn-sec" id="pt-refresh-btn">تحديث القائمة</button>' +
          '</div>' +
        '</section>' +

        '<form id="pt-form" class="pt-grid2">' +
          '<section class="pt-card" style="display:flex;flex-direction:column;gap:12px">' +
            '<b style="font-size:14px">1) بيانات العميل والخدمات (من سمارت ديسك)</b>' +
            '<div class="pt-fgrid">' +
              '<div class="pt-field-wrap"><label class="pt-label" for="pt-client">اسم العميل *</label><input id="pt-client" class="pt-input" required maxlength="160" placeholder="الاسم الكامل"></div>' +
              '<div class="pt-field-wrap"><label class="pt-label" for="pt-phone">رقم الموبايل *</label><input id="pt-phone" class="pt-input" required dir="ltr" maxlength="30" placeholder="01xxxxxxxxx"></div>' +
              '<div class="pt-field-wrap"><label class="pt-label" for="pt-reqid">Request ID (سمارت ديسك) *</label><input id="pt-reqid" class="pt-input" required dir="ltr" maxlength="80" placeholder="SD-2026-..."></div>' +
              '<div class="pt-field-wrap"><label class="pt-label" for="pt-slot">الميعاد المناسب للتواصل</label><select id="pt-slot" class="pt-select"><option value="صباحي">صباحي</option><option value="بعد الظهر">بعد الظهر</option><option value="مسائي">مسائي</option><option value="سفارة">سفارة الإمارات</option></select></div>' +
              '<div class="pt-field-wrap"><label class="pt-label" for="pt-zone">المنطقة</label><input id="pt-zone" class="pt-input" maxlength="100" placeholder="مثال: الدقي / المعادي"></div>' +
              '<div class="pt-field-wrap"><label class="pt-label" for="pt-courier">المندوب المعيّن</label><select id="pt-courier" class="pt-select">' + crOptions + '</select></div>' +
            '</div>' +
            '<div class="pt-field-wrap"><label class="pt-label" for="pt-addr">العنوان بالتفصيل</label><input id="pt-addr" class="pt-input" maxlength="400" placeholder="الشارع، الدور، علامة مميزة"></div>' +

            '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:4px">' +
              '<b style="font-size:13px">الخدمات المطلوبة في الطلب</b>' +
              '<button type="button" id="pt-add-row-btn" class="pt-btn pt-btn-sec" style="padding:6px 11px;font-size:12px">+ إضافة خدمة تانية</button>' +
            '</div>' +
            '<div id="pt-items-wrap" style="display:flex;flex-direction:column;gap:8px"></div>' +

            '<div class="pt-field-wrap">' +
              '<label class="pt-label">حالة الدفع في سمارت ديسك</label>' +
              '<input type="hidden" id="pt-pay-status" value="paid">' +
              '<div class="pt-pay-pills">' +
                '<button type="button" class="pt-pay-pill active" data-pt-pay="paid">دافع مسبقاً</button>' +
                '<button type="button" class="pt-pay-pill" data-pt-pay="cod_cash">كاش مع المندوب</button>' +
                '<button type="button" class="pt-pay-pill" data-pt-pay="instapay_on_arrival">إنستا باي عند الاستلام</button>' +
              '</div>' +
            '</div>' +
            '<div id="pt-collect-wrap" class="pt-field-wrap hidden">' +
              '<label class="pt-label" for="pt-collect-amt">المبلغ المطلوب تحصيله من العميل (ج.م) — يظهر للمندوب مع الإيصال</label>' +
              '<input id="pt-collect-amt" class="pt-input" type="number" min="0" step="any" dir="ltr" placeholder="مثال: 8200">' +
            '</div>' +

            '<div id="pt-price-bar" class="pt-price-bar"></div>' +
          '</section>' +

          '<section class="pt-card" style="display:flex;flex-direction:column;gap:12px">' +
            '<b style="font-size:14px">2) السكريبت المثالي (مربوط بكتالوج الخدمات)</b>' +
            '<div id="pt-script-preview" class="pt-script-box"></div>' +
            '<label class="pt-chk-row"><input type="checkbox" class="pt-chk" value="الأصول جاهزة ومطابقة للشروط" checked><span>تم تأكيد جاهزية الأصول المطلوبة</span></label>' +
            '<label class="pt-chk-row"><input type="checkbox" class="pt-chk" value="تم إبلاغ العميل بمدة التنفيذ والشروط الخاصة" checked><span>تم إبلاغ العميل بالمدة والشروط (من الكتالوج)</span></label>' +
            '<label class="pt-chk-row"><input type="checkbox" class="pt-chk" value="تم تأكيد حالة الدفع وميعاد المندوب" checked><span>تم تأكيد حالة الدفع وميعاد المندوب</span></label>' +
            '<div class="pt-field-wrap">' +
              '<label class="pt-label" for="pt-notes">ملاحظات العميل / للمندوب (بتظهر للمندوب وفي سمارت ديسك والمعاملة)</label>' +
              '<textarea id="pt-notes" class="pt-textarea" rows="2" maxlength="800" placeholder="مثال: العميل متواجد بعد 3 عصراً / رن على الرقم التاني عند الوصول..."></textarea>' +
            '</div>' +
            '<button type="submit" id="pt-submit-btn" class="pt-btn pt-btn-pri" style="width:100%;padding:12px">تمت المكالمة — حفظ ونسخ الكومنت</button>' +
          '</section>' +
        '</form>' +

        '<section class="pt-card" style="display:flex;flex-direction:column;gap:10px">' +
          '<b style="font-size:14px">تذاكر الاستلام المبدئية الحالية</b>' +
          '<div id="pt-list" style="display:flex;flex-direction:column;gap:10px">جاري التحميل…</div>' +
        '</section>' +
      '</div>';

    renderDraftRows();
    refreshLivePreview();
    renderTicketsList();
  }

  async function onSubmit(e) {
    if (!e.target || e.target.id !== 'pt-form') return;
    e.preventDefault();
    if (st.busy) return;
    var phoneClean = cleanPhone($('pt-phone').value);
    $('pt-phone').value = phoneClean;
    var reqId = ($('pt-reqid').value || '').trim();
    var clientName = ($('pt-client').value || '').trim();
    var info = buildScriptAndSummary();

    if (!reqId || !clientName || !phoneClean || !info.items.length) {
      return toast('اكمل بيانات العميل واختر خدمة واحدة على الأقل', 'error');
    }

    var firstItem = info.items[0];
    var totalQty = 0;
    info.items.forEach(function (it) { totalQty += Number(it.qty || 1); });
    var courierIdVal = $('pt-courier').value ? Number($('pt-courier').value) : null;
    var btn = $('pt-submit-btn');
    st.busy = true;
    if (btn) btn.disabled = true;

    try {
      var payload = {
        sd_request_id: reqId,
        sd_service_id: firstItem.sd_service_id || null,
        client_name: clientName,
        phone: phoneClean,
        address: ($('pt-addr').value || '').trim() || null,
        zone: ($('pt-zone').value || '').trim() || null,
        service_name: info.items.length > 1 ? firstItem.service_name + ' (+' + (info.items.length - 1) + ')' : firstItem.service_name,
        qty: totalQty,
        unit_price: info.items.length === 1 ? firstItem.unit_price : info.total,
        total: info.total,
        executor: firstItem.executor || null,
        slot_pref: $('pt-slot').value || 'صباحي',
        courier_id: courierIdVal,
        call_checks: info.checks,
        summary_comment: info.summary,
        items: info.items,
        payment_status: info.payMode,
        collect_amount: info.collectAmt,
        staff_notes: info.staffNotes || null,
        status: courierIdVal ? 'with_courier' : 'open'
      };
      var r = await sbClient.from('pickup_tickets').insert(payload).select('*').single();
      if (r.error) {
        if (String(r.error.code || '') === '23505' || /duplicate|unique/i.test(r.error.message || '')) {
          toast('رقم الطلب (' + reqId + ') متسجل بالفعل في تذاكر الاستلام!', 'error');
        } else {
          toast(r.error.message || 'تعذر حفظ التيكت', 'error');
        }
        return;
      }
      await copyText(info.summary);
      if (r.data) st.tickets.unshift(r.data);
      renderTicketsList();
      $('pt-form').reset();
      st.collectManual = false;
      st.draftRows = [{ service_name: '', doc_type: '', sd_service_id: '', qty: 1, unit_price: 0 }];
      if ($('pt-pay-status')) $('pt-pay-status').value = 'paid';
      document.querySelectorAll('.pt-pay-pill').forEach(function (p) {
        p.classList.toggle('active', p.dataset.ptPay === 'paid');
      });
      renderDraftRows();
      refreshLivePreview();
      toast('تم حفظ التيكت ونسخ الكومنت لسمارت ديسك ✓');
    } finally {
      st.busy = false;
      if (btn) btn.disabled = false;
    }
  }

  async function onClick(e) {
    var payBtn = e.target && e.target.closest ? e.target.closest('[data-pt-pay]') : null;
    if (payBtn) {
      var mode = payBtn.dataset.ptPay;
      if ($('pt-pay-status')) $('pt-pay-status').value = mode;
      document.querySelectorAll('.pt-pay-pill').forEach(function (p) {
        p.classList.toggle('active', p.dataset.ptPay === mode);
      });
      st.collectManual = false;
      refreshLivePreview();
      return;
    }
    if (e.target && e.target.id === 'pt-add-row-btn') {
      syncDraftRowsFromDom();
      st.draftRows.push({ service_name: '', doc_type: '', sd_service_id: '', qty: 1, unit_price: 0 });
      renderDraftRows();
      refreshLivePreview();
      return;
    }
    var delBtn = e.target && e.target.closest ? e.target.closest('[data-pt-delrow]') : null;
    if (delBtn) {
      syncDraftRowsFromDom();
      var idx = Number(delBtn.dataset.ptDelrow);
      if (st.draftRows.length > 1) {
        st.draftRows.splice(idx, 1);
        renderDraftRows();
        refreshLivePreview();
      }
      return;
    }
    if (e.target && e.target.id === 'pt-refresh-btn') {
      try {
        await Promise.all([loadDependencies(), loadTickets()]);
        renderTicketsList();
        toast('تم التحديث ✓');
      } catch (err) {
        toast((err && err.message) || 'تعذر التحديث', 'error');
      }
      return;
    }
    var b = e.target && e.target.closest ? e.target.closest('[data-pt-act]') : null;
    if (!b) return;
    var id = Number(b.dataset.id);
    var t = st.tickets.find(function (x) { return Number(x.id) === id; });
    if (!t) return;

    if (b.dataset.ptAct === 'copy') {
      await copyText(t.summary_comment || '');
      toast('تم نسخ الكومنت ✓');
      return;
    }
    if (b.dataset.ptAct === 'convert') {
      b.disabled = true;
      try { await directConvertTicket(t); } finally { b.disabled = false; }
      return;
    }
    if (b.dataset.ptAct === 'prefill') {
      prefillNewOrderTab(t);
      return;
    }
    if (b.dataset.ptAct === 'cancel') {
      b.disabled = true;
      var r = await sbClient.from('pickup_tickets').update({ status: 'cancelled' }).eq('id', id);
      if (r.error) {
        b.disabled = false;
        return toast(r.error.message || 'تعذر إلغاء التيكت', 'error');
      }
      st.tickets = st.tickets.filter(function (x) { return Number(x.id) !== id; });
      renderTicketsList();
      toast('تم إلغاء التيكت (status=cancelled) واختفاؤه من عند المندوب ✓');
    }
  }

  function placeBtn(btn) {
    var menu = $('nav-menu');
    if (!menu || !btn) return;
    var dailyBody = menu.querySelector(':scope > section[data-mg="daily"] .mg-body');
    if (dailyBody) {
      btn.dataset.mgi = '11';
      if (btn.parentElement !== dailyBody) dailyBody.appendChild(btn);
      return;
    }
    var anchor = $('tab-cash-btn') || $('tab-exec-btn');
    if (anchor && anchor.parentElement && btn.parentElement !== anchor.parentElement) {
      anchor.insertAdjacentElement('afterend', btn);
    } else if (!btn.parentElement) {
      menu.appendChild(btn);
    }
  }

  function remove() {
    var b = $('tab-pickup-btn'), p = $('tab-pickup');
    if (b) b.remove();
    if (p) p.remove();
  }

  function ensure() {
    if (isCourier()) {
      remove();
      setTimeout(loadAndRenderCourierMyTickets, 200);
      return false;
    }
    if (!isAllowedStaff()) { remove(); return false; }
    if (!$('tab-pickup')) {
      var main = document.querySelector('main');
      if (!main) return false;
      var pane = document.createElement('div');
      pane.id = 'tab-pickup';
      pane.className = 'hidden space-y-4';
      var host = $('tab-exec') || $('tab-tx') || main.lastElementChild;
      if (host) host.insertAdjacentElement('afterend', pane);
      else main.appendChild(pane);
      pane.addEventListener('submit', onSubmit);
      pane.addEventListener('click', onClick);
      pane.addEventListener('input', function (e) {
        if (e.target && e.target.id === 'pt-phone') {
          var pos = e.target.selectionStart;
          var cleaned = cleanPhone(e.target.value);
          if (e.target.value !== cleaned) {
            e.target.value = cleaned;
            try { e.target.setSelectionRange(pos, pos); } catch (err) {}
          }
        }
        if (e.target && e.target.id === 'pt-collect-amt') st.collectManual = true;
        refreshLivePreview();
      });
      pane.addEventListener('change', function () {
        refreshLivePreview();
      });
    }
    var b = $('tab-pickup-btn');
    if (!b && $('nav-menu')) {
      b = document.createElement('button');
      b.id = 'tab-pickup-btn';
      b.type = 'button';
      b.setAttribute('data-tab-target', 'pickup');
      b.className = BTN_OFF;
      b.setAttribute('onclick', "switchTab('pickup')");
      b.innerHTML = '<i class="fa-solid fa-ticket text-orange-500"></i><span>تيكتات الاستلام</span>';
    }
    if (b) placeBtn(b);
    return true;
  }

  function wrap(name, fn) {
    var orig = window[name];
    if (typeof orig === 'function' && !orig['__pt73Wrapped']) {
      var w = fn(orig);
      w['__pt73Wrapped'] = true;
      window[name] = w;
    }
  }

  wrap('switchTab', function (orig) {
    return function (id) {
      if (id === 'pickup' && !isAllowedStaff()) { toast('الصفحة دي متاحة للموظفين والإدارة فقط', 'error'); return; }
      var res = orig.apply(this, arguments);
      try {
        ensure();
        var on = id === 'pickup' && isAllowedStaff();
        var pane = $('tab-pickup'), btn = $('tab-pickup-btn');
        if (pane) pane.classList.toggle('hidden', !on);
        if (btn) btn.className = on ? BTN_ON : BTN_OFF;
        if (on) {
          var sec = btn && btn.closest('.mg');
          if (sec && !sec.classList.contains('open')) sec.classList.add('open');
          Promise.all([loadDependencies(), loadTickets()]).then(renderView).catch(function (err) {
            renderView();
            var list = $('pt-list');
            if (list) list.innerHTML = '<div class="pt-sub">تأكد من تشغيل التحديث الجديد في sql/pickup-ticket.sql في Supabase. (' + eh(err && err.message) + ')</div>';
          });
        }
      } catch (e) { /* */ }
      return res;
    };
  });

  wrap('loadInitialData', function (orig) {
    return async function () {
      var r = await orig.apply(this, arguments);
      try { ensure(); } catch (e) { /* */ }
      return r;
    };
  });

  wrap('handleLogout', function (orig) {
    return function () {
      try {
        st.tickets = []; st.courierTickets = []; st.courierLoadedAt = 0; st.loaded = false;
        st.collectManual = false;
        st.draftRows = [{ service_name: '', doc_type: '', sd_service_id: '', qty: 1, unit_price: 0 }];
        remove();
      } catch (e) { /* */ }
      return orig.apply(this, arguments);
    };
  });

  ensure();
  setTimeout(ensure, 150);
})();
