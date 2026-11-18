/* =====================================================================
   js/73-pickup-ticket.js — تيكت الاستلام المبدئي (الدفعة 1)
   - معزول تماماً عن جدول المعاملات و جدول التعليقات وحسابات الكاش والعمولات.
   - 5 خانات منفصلة من سمارت ديسك + سكريبت مكالمة + 3 checkboxes + نسخ الكومنت.
   - متاح للموظف والمدير في قسم «الشغل اليومي» (daily)، ويعرض للمندوب تيكتاته بدون أسعار عبر courier_my_tickets().
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
    myUid: null
  };

  function getCurUser() {
    return (typeof currentUser !== 'undefined' && currentUser) ? currentUser : window.currentUser;
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
      '.pt-input,.pt-select{width:100%;box-sizing:border-box;border-radius:11px;border:1px solid var(--r-bd,rgba(148,163,184,.3));background:var(--r-bg,#f8fafc);color:var(--r-tx,#0f172a);padding:9px 11px;font-size:13px;font-family:inherit;outline:none}',
      'html.dark .pt-input,html.dark .pt-select{background:#0b0f17;color:#f8fafc;border-color:rgba(255,255,255,.14)}',
      '.pt-input:focus,.pt-select:focus{border-color:var(--r-acc,#ea580c)}',
      '.pt-script-box{background:rgba(234,88,12,.08);border:1px solid rgba(234,88,12,.3);border-radius:14px;padding:13px;font-size:13px;line-height:1.7}',
      '.pt-chk-row{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;border:1px solid var(--r-bd,rgba(148,163,184,.2));cursor:pointer;font-size:12.5px}',
      '.pt-btn{border:0;border-radius:12px;padding:10px 15px;font-size:12.5px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;font-family:inherit}',
      '.pt-btn-pri{background:var(--r-acc,#ea580c);color:#ffffff}',
      '.pt-btn-sec{background:rgba(148,163,184,.16);color:var(--r-tx,#0f172a)}',
      'html.dark .pt-btn-sec{background:rgba(255,255,255,.1);color:#f8fafc}',
      '.pt-btn-danger{background:rgba(225,29,72,.14);color:#e11d48;border:1px solid rgba(225,29,72,.3)}',
      '.pt-btn:disabled{opacity:.48;cursor:not-allowed}',
      '.pt-price-bar{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;padding:9px 12px;border-radius:11px;background:rgba(16,185,129,.12);border:1px solid rgba(16,185,129,.3);font-size:12px;font-weight:700;color:#059669}',
      'html.dark .pt-price-bar{color:#34d399}',
      '.pt-ticket-item{border:1px solid var(--r-bd,rgba(148,163,184,.22));border-radius:14px;padding:13px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px}',
      '.pt-badge{display:inline-flex;align-items:center;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:700}',
      '.pt-badge-org{background:rgba(234,88,12,.15);color:#ea580c}',
      '.pt-badge-ok{background:rgba(16,185,129,.15);color:#10b981}',
      '.pt-badge-mut{background:rgba(148,163,184,.18);color:#64748b}',
      '.pt-comment-pre{font-size:11.5px;background:rgba(0,0,0,.06);padding:8px 10px;border-radius:10px;margin-top:6px;line-height:1.5;word-break:break-word}',
      'html.dark .pt-comment-pre{background:rgba(255,255,255,.06)}',
      '.pt-courier-box{margin:10px 12px 0;padding:12px;border-radius:16px;border:1px solid rgba(234,88,12,.35);background:rgba(234,88,12,.08);color:var(--tx,#f8fafc);font-size:12.5px}',
      '@media (max-width:860px){.pt-grid2{grid-template-columns:1fr}}',
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

  async function loadDependencies() {
    if (!sbClient) return;
    var u = getCurUser();
    st.myUid = u ? u.id : null;
    var jobs = [
      sbClient.from('couriers').select('id,name,active').eq('active', true).order('name')
    ];
    if (!getServicesList().length) {
      jobs.push(sbClient.from('services').select('id,name,unit_price,executor').order('name'));
    }
    var res = await Promise.all(jobs);
    if (res[0] && !res[0].error && Array.isArray(res[0].data)) st.couriers = res[0].data;
    if (res[1] && !res[1].error && Array.isArray(res[1].data)) st.services = res[1].data;
  }

  async function loadTickets() {
    if (!sbClient) return;
    var r = await sbClient
      .from('pickup_tickets')
      .select('id,sd_request_id,sd_service_id,client_name,phone,address,zone,service_name,qty,unit_price,total,executor,slot_pref,courier_id,call_checks,summary_comment,status,created_by,created_at')
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(60);
    if (r.error) throw r.error;
    st.tickets = Array.isArray(r.data) ? r.data : [];
    st.loaded = true;
  }

  /* عرض تيكتات الاستلام المعيّنة للمندوب داخل بوابة المندوب (بدون أي أسعار أو إجمالي) */
  async function loadAndRenderCourierMyTickets() {
    if (!sbClient || !isCourier()) return;
    var app = $('courier-app');
    if (!app) return;
    if (st.courierLoadedAt && (Date.now() - st.courierLoadedAt < 60000)) return;
    st.courierLoadedAt = Date.now();
    try {
      ensureCss();
      var r = await sbClient.rpc('courier_my_tickets');
      if (r.error || !Array.isArray(r.data)) return;
      st.courierTickets = r.data;
      var host = $('cp-v12-top-banners') || app;
      var box = $('pt73-courier-tickets');
      if (!st.courierTickets.length) {
        if (box) box.remove();
        return;
      }
      if (!box) {
        box = document.createElement('section');
        box.id = 'pt73-courier-tickets';
        box.className = 'pt-courier-box';
        host.insertAdjacentElement('afterend', box);
      }
      box.innerHTML =
        '<div style="font-weight:700;margin-bottom:6px">تيكتات استلام مطلوبة منك (' + st.courierTickets.length + ')</div>' +
        st.courierTickets.map(function (t) {
          return '<div style="padding:8px 0;border-top:1px solid rgba(255,255,255,.1)">' +
            '<div><b>' + eh(t.client_name) + '</b> · <span dir="ltr">' + eh(t.sd_request_id) + '</span> · الميعاد: <b>' + eh(t.slot_pref) + '</b></div>' +
            '<div style="font-size:11.5px;opacity:.85;margin-top:2px">' + eh(t.service_name) + ' (العدد: ' + Number(t.qty || 1) + ')' + (t.zone ? ' · ' + eh(t.zone) : '') + (t.address ? ' — ' + eh(t.address) : '') + '</div>' +
            (t.summary_comment ? '<div style="font-size:11px;opacity:.78;margin-top:3px">' + eh(t.summary_comment) + '</div>' : '') +
          '</div>';
        }).join('');
    } catch (e) { /* ignore */ }
  }

  function buildScriptAndSummary() {
    var nameEl = $('pt-client'), reqEl = $('pt-reqid'), svcEl = $('pt-service'), qtyEl = $('pt-qty');
    var zoneEl = $('pt-zone'), addrEl = $('pt-addr'), slotEl = $('pt-slot'), crEl = $('pt-courier');
    var client = (nameEl && nameEl.value.trim()) || 'حضرتك';
    var reqId = (reqEl && reqEl.value.trim()) || '—';
    var svcName = (svcEl && svcEl.value) || 'الخدمة المطلوبة';
    var qty = Math.max(1, parseInt(qtyEl && qtyEl.value, 10) || 1);
    var svcObj = getServicesList().find(function (s) { return s.name === svcName; }) || null;
    var unitPrice = svcObj ? Number(svcObj.unit_price || 0) : 0;
    var executor = (svcObj && svcObj.executor) ? svcObj.executor : '—';
    var total = Math.round(unitPrice * qty * 100) / 100;
    var place = (zoneEl && zoneEl.value.trim()) || (addrEl && addrEl.value.trim()) || 'العنوان المسجل';
    var slot = (slotEl && slotEl.value) || 'صباحي';
    var courierName = (crEl && crEl.selectedOptions && crEl.selectedOptions[0]) ? crEl.selectedOptions[0].textContent : 'المندوب';

    var scriptHtml = '«أهلاً بحضرتك أ/ <b>' + eh(client) + '</b>، معاك شركة <b>تساهيل</b> بخصوص طلب رقم <b dir="ltr">' + eh(reqId) + '</b> لخدمة <b>' + eh(svcName) + '</b> (العدد: <b>' + qty + '</b>' + (total > 0 ? ' — الإجمالي: <b>' + eh(money(total)) + '</b>' : '') + '). بنأكد على تجهيز الأصول المطلوبة والتواجد في <b>' + eh(place) + '</b> (ميعاد: <b>' + eh(slot) + '</b>) عشان المندوب يعدي يستلمهم.»';

    var checks = [];
    document.querySelectorAll('.pt-chk:checked').forEach(function (c) { checks.push(c.value); });
    var summary = '[مراجعة الاستلام - تساهيل] طلب ' + reqId + ' | ' + client + ' | ' + svcName + ' (عدد ' + qty + (total > 0 ? ' - ' + total + ' ج' : '') + ') | ' + (checks.length ? checks.join(' + ') : 'تم التأكيد') + ' | الميعاد: ' + slot + ' | العنوان: ' + place + ' | المندوب: ' + courierName;

    return {
      unitPrice: unitPrice,
      executor: executor,
      total: total,
      qty: qty,
      scriptHtml: scriptHtml,
      summary: summary,
      checks: checks
    };
  }

  function refreshLivePreview() {
    var box = $('pt-script-preview'), bar = $('pt-price-bar'), chk2 = $('pt-chk2-lbl');
    var info = buildScriptAndSummary();
    if (box) box.innerHTML = info.scriptHtml;
    if (bar) {
      bar.innerHTML = '<span>سعر الوحدة: <b>' + eh(money(info.unitPrice)) + '</b> × <b>' + info.qty + '</b> = الإجمالي: <b>' + eh(money(info.total)) + '</b></span><span>المنفذ: <b>' + eh(info.executor) + '</b></span>';
    }
    if (chk2) chk2.textContent = 'العميل وافق على الرسوم (' + money(info.total) + ') والشروط';
  }

  function courierNameById(cid) {
    var c = st.couriers.find(function (x) { return Number(x.id) === Number(cid); });
    return c ? c.name : 'غير معين';
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
      var canCancel = (t.status === 'open' || t.status === 'with_courier') && (isManager() || !t.created_by || (st.myUid && t.created_by === st.myUid));
      return '<div class="pt-ticket-item" data-ticket-row="' + Number(t.id) + '">' +
        '<div style="flex:1;min-width:240px">' +
          '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px">' +
            '<span class="pt-badge pt-badge-org" dir="ltr">' + eh(t.sd_request_id) + '</span>' +
            '<b class="pt-client-cell">' + eh(t.client_name) + '</b>' +
            '<span class="pt-sub" dir="ltr">' + eh(t.phone) + '</span>' +
            '<span class="pt-badge pt-badge-ok">' + eh(statusLabel[t.status] || t.status) + '</span>' +
            '<span class="pt-badge pt-badge-mut">المندوب: ' + eh(courierNameById(t.courier_id)) + '</span>' +
          '</div>' +
          '<div class="pt-sub" style="margin-top:4px">' + eh(t.service_name) + ' · عدد: ' + Number(t.qty || 1) + ' · الإجمالي: <b>' + eh(money(t.total)) + '</b> · الميعاد: ' + eh(t.slot_pref) + (t.zone ? ' · ' + eh(t.zone) : '') + '</div>' +
          (t.summary_comment ? '<div class="pt-comment-pre">' + eh(t.summary_comment) + '</div>' : '') +
        '</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:6px">' +
          '<button type="button" class="pt-btn pt-btn-sec" data-pt-act="copy" data-id="' + Number(t.id) + '">نسخ الكومنت</button>' +
          '<button type="button" class="pt-btn pt-btn-sec" disabled title="هتتفعل في الدفعة 3">تحويل لمعاملة (قريباً)</button>' +
          (canCancel ? '<button type="button" class="pt-btn pt-btn-danger" data-pt-act="cancel" data-id="' + Number(t.id) + '">إلغاء</button>' : '') +
        '</div>' +
      '</div>';
    }).join('');
  }

  function renderView() {
    var pane = $('tab-pickup');
    if (!pane) return;
    ensureCss();
    var svcs = getServicesList();
    var svcOptions = '<option value="">اختر الخدمة من النظام…</option>' + svcs.map(function (s) {
      return '<option value="' + eh(s.name) + '">' + eh(s.name) + ' (' + eh(money(s.unit_price || 0)) + ')</option>';
    }).join('');
    var crOptions = '<option value="">بدون مندوب حالياً</option>' + st.couriers.map(function (c) {
      return '<option value="' + Number(c.id) + '">' + eh(c.name) + '</option>';
    }).join('');

    pane.innerHTML =
      '<div class="pt-wrap">' +
        '<section class="pt-card">' +
          '<div class="pt-head">' +
            '<div>' +
              '<h2 class="pt-title">تيكت الاستلام المبدئي (معزول عن المعاملات الرسمية)</h2>' +
              '<div class="pt-sub">لصق خانات سمارت ديسك + سكريبت المكالمة + نسخ الكومنت + إرسال للمندوب بدون أي تأثير على المبيعات أو الكاش.</div>' +
            '</div>' +
            '<button type="button" class="pt-btn pt-btn-sec" id="pt-refresh-btn">تحديث القائمة</button>' +
          '</div>' +
        '</section>' +

        '<form id="pt-form" class="pt-grid2">' +
          '<section class="pt-card" style="display:flex;flex-direction:column;gap:12px">' +
            '<b style="font-size:14px">1) بيانات العميل والطلب (من سمارت ديسك)</b>' +
            '<div class="pt-fgrid">' +
              '<div class="pt-field-wrap"><label class="pt-label" for="pt-client">اسم العميل *</label><input id="pt-client" class="pt-input" required maxlength="160" placeholder="الاسم الكامل"></div>' +
              '<div class="pt-field-wrap"><label class="pt-label" for="pt-phone">رقم الموبايل *</label><input id="pt-phone" class="pt-input" required dir="ltr" maxlength="30" placeholder="01xxxxxxxxx"></div>' +
              '<div class="pt-field-wrap"><label class="pt-label" for="pt-reqid">Request ID (سمارت ديسك) *</label><input id="pt-reqid" class="pt-input" required dir="ltr" maxlength="80" placeholder="SD-2026-..."></div>' +
              '<div class="pt-field-wrap"><label class="pt-label" for="pt-svcid">Service ID</label><input id="pt-svcid" class="pt-input" dir="ltr" maxlength="80" placeholder="اختياري"></div>' +
              '<div class="pt-field-wrap"><label class="pt-label" for="pt-qty">العدد *</label><input id="pt-qty" class="pt-input" type="number" min="1" max="500" value="1" required></div>' +
              '<div class="pt-field-wrap"><label class="pt-label" for="pt-slot">الميعاد المفضل</label><select id="pt-slot" class="pt-select"><option value="صباحي">صباحي</option><option value="مسائي">مسائي</option><option value="سفارة">سفارة الإمارات</option></select></div>' +
              '<div class="pt-field-wrap"><label class="pt-label" for="pt-zone">المنطقة</label><input id="pt-zone" class="pt-input" maxlength="100" placeholder="مثال: الدقي / المعادي"></div>' +
              '<div class="pt-field-wrap"><label class="pt-label" for="pt-courier">المندوب المعيّن</label><select id="pt-courier" class="pt-select">' + crOptions + '</select></div>' +
            '</div>' +
            '<div class="pt-field-wrap"><label class="pt-label" for="pt-addr">العنوان بالتفصيل</label><input id="pt-addr" class="pt-input" maxlength="400" placeholder="الشارع، الدور، علامة مميزة"></div>' +
            '<div class="pt-field-wrap"><label class="pt-label" for="pt-service">الخدمة (من جدول الخدمات) *</label><select id="pt-service" class="pt-select" required>' + svcOptions + '</select></div>' +
            '<div id="pt-price-bar" class="pt-price-bar"></div>' +
          '</section>' +

          '<section class="pt-card" style="display:flex;flex-direction:column;gap:12px">' +
            '<b style="font-size:14px">2) سكريبت المكالمة والتأكيد</b>' +
            '<div id="pt-script-preview" class="pt-script-box"></div>' +
            '<label class="pt-chk-row"><input type="checkbox" class="pt-chk" value="الأصول جاهزة ومطابقة للشروط" checked><span>الأصول جاهزة ومطابقة للشروط</span></label>' +
            '<label class="pt-chk-row"><input type="checkbox" class="pt-chk" value="العميل وافق على الرسوم والشروط" checked><span id="pt-chk2-lbl">العميل وافق على الرسوم والشروط</span></label>' +
            '<label class="pt-chk-row"><input type="checkbox" class="pt-chk" value="العنوان والميعاد متأكدين مع العميل" checked><span>العنوان والميعاد متأكدين مع العميل</span></label>' +
            '<button type="submit" id="pt-submit-btn" class="pt-btn pt-btn-pri" style="width:100%;padding:12px">تمت المكالمة — حفظ ونسخ الكومنت</button>' +
          '</section>' +
        '</form>' +

        '<section class="pt-card" style="display:flex;flex-direction:column;gap:10px">' +
          '<b style="font-size:14px">تذاكر الاستلام المبدئية الحالية</b>' +
          '<div id="pt-list" style="display:flex;flex-direction:column;gap:10px">جاري التحميل…</div>' +
        '</section>' +
      '</div>';

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
    var svcName = $('pt-service').value;
    if (!reqId || !clientName || !phoneClean || !svcName) {
      return toast('اكمل الخانات المطلوبة الأول', 'error');
    }

    var info = buildScriptAndSummary();
    var courierIdVal = $('pt-courier').value ? Number($('pt-courier').value) : null;
    var btn = $('pt-submit-btn');
    st.busy = true;
    if (btn) btn.disabled = true;

    try {
      var payload = {
        sd_request_id: reqId,
        sd_service_id: ($('pt-svcid').value || '').trim() || null,
        client_name: clientName,
        phone: phoneClean,
        address: ($('pt-addr').value || '').trim() || null,
        zone: ($('pt-zone').value || '').trim() || null,
        service_name: svcName,
        qty: info.qty,
        unit_price: info.unitPrice,
        total: info.total,
        executor: info.executor,
        slot_pref: $('pt-slot').value || 'صباحي',
        courier_id: courierIdVal,
        call_checks: info.checks,
        summary_comment: info.summary,
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
      $('pt-qty').value = '1';
      refreshLivePreview();
      toast('تم حفظ التيكت ونسخ الكومنت لسمارت ديسك ✓');
    } finally {
      st.busy = false;
      if (btn) btn.disabled = false;
    }
  }

  async function onClick(e) {
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
        refreshLivePreview();
      });
      pane.addEventListener('change', refreshLivePreview);
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
            if (list) list.innerHTML = '<div class="pt-sub">تأكد من تشغيل ملف sql/pickup-ticket.sql في Supabase. (' + eh(err && err.message) + ')</div>';
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
      try { st.tickets = []; st.courierTickets = []; st.courierLoadedAt = 0; st.loaded = false; remove(); } catch (e) { /* */ }
      return orig.apply(this, arguments);
    };
  });

  ensure();
  setTimeout(ensure, 150);
})();
