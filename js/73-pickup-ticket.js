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
    courierZones: {},
    services: [],
    courierTickets: [],
    courierLoadedAt: 0,
    loaded: false,
    busy: false,
    myUid: null,
    collectManual: false,
    rtChannel: null,
    rtDetailChannel: null,
    rtStatus: 'idle',
    detailTicketId: null,
    detailContacts: [],
    detailPapers: [],
    detailPapersLoading: false,
    mgrTab: 'active',
    courierTab: 'new',
    cancelModalId: null,
    lastFocusRefreshAt: 0,
    draftRows: [{ service_name: '', doc_type: '', sd_service_id: '', qty: 1, unit_price: 0 }]
  };

  var STEP_ORDER = ['accepted', 'call_attempt', 'on_the_way', 'waiting', 'papers_received'];
  var STEP_LABELS = {
    accepted: 'تم قبول التيكت',
    call_attempt: 'كلمت العميل',
    on_the_way: 'في طريقي',
    waiting: 'وصلت للعميل',
    papers_received: 'استلمت الأوراق'
  };
  var OUTCOME_LABELS = {
    answered: 'رد العميل',
    no_answer: 'لم يرد',
    wrong_number: 'رقم غلط',
    postponed: 'طلب تأجيل'
  };
  var PAPERS_HOLDER_LABELS = {
    office: 'المكتب',
    courier: 'المندوب',
    customer: 'العميل'
  };
  var PAPERS_COURIER_LABELS = {
    office: 'المكتب',
    courier: 'عندك',
    customer: 'العميل'
  };
  function papersHolderBadgeClass(h) {
    if (h === 'courier') return 'pt-badge-papers-courier';
    if (h === 'customer') return 'pt-badge-papers-customer';
    return 'pt-badge-papers-office';
  }
  function renderCourierPapersActionsOnly(t) {
    var holder = t.papers_holder || 'office';
    var pendId = t.papers_pending_event_id ? Number(t.papers_pending_event_id) : null;
    var pendTo = t.papers_pending_to || '';
    var isCancelled = t.status === 'cancelled';
    var btns = '';
    if (pendId && pendTo === 'courier') {
      btns += '<button type="button" class="pt-btn pt-btn-sec" style="border:1px solid var(--burg,#881337)" data-pt73-papers-confirm="' + pendId + '" data-pt73-tid="' + Number(t.id) + '">استلمت الأوراق</button>';
    } else if (holder === 'courier' && !pendId) {
      if (!isCancelled) {
        btns += '<button type="button" class="pt-btn pt-btn-sec" data-pt73-papers-customer="' + Number(t.id) + '">تسليم الأوراق للعميل</button>';
      }
      btns += '<button type="button" class="pt-btn pt-btn-sec" data-pt73-papers-return="' + Number(t.id) + '">إرجاع الورق للموظف</button>';
    } else if (pendId && pendTo === 'office') {
      btns += '<button type="button" class="pt-btn pt-btn-sec" disabled>بانتظار تأكيد الموظف</button>';
    }
    return btns ? '<div style="display:flex;flex-wrap:wrap;gap:8px">' + btns + '</div>' : '';
  }

  function fmtStepTime(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString('ar-EG', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
      });
    } catch (e) { return String(iso); }
  }
  function logTicketContact(ticketId, channel) {
    if (!sbClient || !ticketId) return;
    sbClient.rpc('courier_log_contact', {
      p_ticket_id: Number(ticketId),
      p_tx: null,
      p_channel: channel,
      p_outcome: null
    }).then(function (res) {
      if (res && res.error) return toast('ما اتسجلش التواصل', 'error');
      var id = res && res.data && res.data.id;
      if (id && channel === 'call' && typeof window.tsAskContactOutcome === 'function') window.tsAskContactOutcome(id);
    }).catch(function () {
      toast('ما اتسجلش التواصل', 'error');
    });
  }

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
      'html.dark body:not(.is-courier-mode) .pt-card{background:var(--r-card,#111827);border-color:var(--r-bd,rgba(255,255,255,.09));color:var(--r-tx,#f8fafc)}',
      '.pt-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px}',
      '.pt-title{font-size:17px;font-weight:700;margin:0}',
      '.pt-sub{font-size:12px;color:var(--r-mute,#64748b);margin-top:2px}',
      '.pt-grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}',
      '.pt-fgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}',
      '.pt-field-wrap{display:flex;flex-direction:column;gap:4px}',
      '.pt-label{font-size:11.5px;font-weight:700;color:var(--r-mute,#64748b)}',
      '.pt-input,.pt-select,.pt-textarea{width:100%;box-sizing:border-box;border-radius:11px;border:1px solid var(--r-bd,rgba(148,163,184,.3));background:var(--r-bg,#f8fafc);color:var(--r-tx,#0f172a);padding:9px 11px;font-size:13px;font-family:inherit;outline:none}',
      'html.dark body:not(.is-courier-mode) .pt-input,html.dark body:not(.is-courier-mode) .pt-select,html.dark body:not(.is-courier-mode) .pt-textarea{background:#0b0f17;color:#f8fafc;border-color:rgba(255,255,255,.14)}',
      '.pt-input:focus,.pt-select:focus,.pt-textarea:focus{border-color:var(--r-acc,#036b29)}',
      '.pt-svc-row{border:1px solid var(--r-bd,rgba(148,163,184,.25));border-radius:13px;padding:10px;background:rgba(148,163,184,.05);display:flex;flex-direction:column;gap:8px}',
      '.pt-svc-row-grid{display:grid;grid-template-columns:2fr 1.3fr 1fr .65fr auto;gap:8px;align-items:end}',
      '.pt-pay-pills{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}',
      '.pt-pay-pill{border:1px solid var(--r-bd,rgba(148,163,184,.3));border-radius:11px;padding:8px 10px;font-size:12px;font-weight:700;cursor:pointer;background:transparent;color:var(--r-tx,#0f172a);font-family:inherit;text-align:center}',
      'html.dark body:not(.is-courier-mode) .pt-pay-pill{color:#f8fafc}',
      '.pt-pay-pill.active{border-color:var(--r-acc,#036b29);background:rgba(200,162,82,.14);color:#036b29}',
      'html.dark body:not(.is-courier-mode) .pt-pay-pill.active{color:#881337}',
      '.pt-script-box{background:rgba(200,162,82,.07);border:1px solid rgba(200,162,82,.3);border-radius:14px;padding:13px;font-size:12.8px;line-height:1.75;display:flex;flex-direction:column;gap:8px}',
      '.pt-script-sec{padding-top:6px;border-top:1px dashed rgba(200,162,82,.25)}',
      '.pt-script-sec:first-child{padding-top:0;border-top:0}',
      '.pt-chk-row{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;border:1px solid var(--r-bd,rgba(148,163,184,.2));cursor:pointer;font-size:12.5px}',
      '.pt-btn{border:0;border-radius:12px;padding:9px 14px;font-size:12.5px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;font-family:inherit}',
      '.pt-btn-pri{background:var(--r-acc,#036b29);color:#ffffff}',
      '.pt-btn-ok{background:#036b29;color:#ffffff}',
      '.pt-btn-sec{background:rgba(148,163,184,.16);color:var(--r-tx,#0f172a)}',
      'html.dark body:not(.is-courier-mode) .pt-btn-sec{background:rgba(255,255,255,.1);color:#f8fafc}',
      '.pt-btn-danger{background:rgba(225,29,72,.14);color:#e11d48;border:1px solid rgba(225,29,72,.3)}',
      '.pt-btn:disabled{opacity:.48;cursor:not-allowed}',
      '.pt-price-bar{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;padding:9px 12px;border-radius:11px;background:rgba(16,185,129,.12);border:1px solid rgba(16,185,129,.3);font-size:12px;font-weight:700;color:#059669}',
      'html.dark body:not(.is-courier-mode) .pt-price-bar{color:#34d399}',
      '.pt-ticket-item{border:1px solid var(--r-bd,rgba(148,163,184,.22));border-radius:14px;padding:13px;display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:12px}',
      '.pt-badge{display:inline-flex;align-items:center;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:700}',
      '.pt-badge-org{background:rgba(200,162,82,.15);color:#036b29}',
      '.pt-badge-ok{background:var(--green-soft,#E3F1E8);color:var(--green-soft-tx,#024a1c)}',
      '.pt-badge-warn{background:rgba(245,158,11,.18);color:#d97706}',
      '.pt-badge-pur{background:rgba(139,92,246,.18);color:#7c3aed}',
      '.pt-badge-mut{background:rgba(148,163,184,.18);color:#64748b}',
      '.pt-comment-pre{font-size:11.5px;background:rgba(0,0,0,.06);padding:8px 10px;border-radius:10px;margin-top:6px;line-height:1.55;word-break:break-word}',
      'html.dark body:not(.is-courier-mode) .pt-comment-pre{background:rgba(255,255,255,.06)}',
      '.pt-courier-box{margin:10px 12px 0;padding:12px;border-radius:16px;border:1px solid var(--bd,rgba(3,107,41,.22));background:transparent;color:var(--tx,#111C15);font-size:12.5px}',
      '.pt-tabs-bar{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}',
      '.pt-ftab{height:36px;border:1px solid var(--bd,rgba(3,107,41,.18));border-radius:999px;padding:0 14px;font-size:13px;font-weight:700;cursor:pointer;background:var(--card);color:var(--tx);font-family:inherit;white-space:nowrap}',
      '.pt-ftab.active{background:#036b29;color:#fff;border-color:#881337;box-shadow:0 0 10px rgba(136,19,55,.24)}',
      '.pt-ftab-danger.active{background:#dc2626;color:#fff;border-color:#dc2626}',
      '.pt-badge-cancel{background:rgba(220,38,38,.16);color:#dc2626;border:1px solid rgba(220,38,38,.35)}',
      '.pt-cancel-card{border:1px solid rgba(220,38,38,.45);border-right:4px solid #dc2626;border-radius:14px;padding:12px;background:var(--card,#ffffff);color:var(--tx,#111C15);display:flex;flex-direction:column;gap:8px}',
      '#courier-app .pt-cancel-card{background:var(--card);color:var(--tx)}',
      '.pt-cancel-strip{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 10px;border-radius:9px;background:rgba(220,38,38,.14);color:#dc2626;font-size:12px;font-weight:800}',
      '.pt-mission-card{border:1px solid rgba(3,107,41,.38);border-right:4px solid #036b29;border-radius:14px;padding:12px;background:var(--card,#ffffff);color:var(--tx,#111C15);display:flex;flex-direction:column;gap:8px}',
      '#courier-app .pt-mission-card{background:var(--card);color:var(--tx)}',
      '.pt-mission-strip{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 10px;border-radius:9px;background:rgba(3,107,41,.12);color:#036b29;font-size:12px;font-weight:800}',
      '#courier-app:not([data-theme=light]) .pt-mission-strip{color:#86efac}',
      '.pt-btn-mission{background:#036b29;color:#ffffff}',
      '.pt-badge-papers-office{background:rgba(100,116,139,.16);color:#475569;border:1px solid rgba(100,116,139,.3)}',
      '#courier-app:not([data-theme=light]) .pt-badge-papers-office{background:rgba(148,163,184,.22);color:#e2e8f0}',
      'html.dark body:not(.is-courier-mode) .pt-badge-papers-office{color:#cbd5e1}',
      '.pt-badge-papers-courier{background:rgba(217,119,6,.16);color:#b45309;border:1px solid rgba(217,119,6,.35)}',
      'html.dark body:not(.is-courier-mode) .pt-badge-papers-courier{color:#fbbf24}',
      '.pt-badge-papers-customer{background:rgba(37,99,235,.15);color:#2563eb;border:1px solid rgba(37,99,235,.32)}',
      'html.dark body:not(.is-courier-mode) .pt-badge-papers-customer{color:#60a5fa}',
      '.pt-papers-box{border:1px solid rgba(100,116,139,.28);border-radius:12px;padding:10px;background:rgba(148,163,184,.06);display:flex;flex-direction:column;gap:8px}',
      '.pt-papers-warn{padding:7px 10px;border-radius:9px;background:rgba(217,119,6,.14);color:#b45309;border:1px solid rgba(217,119,6,.32);font-size:12px;font-weight:700}',
      'html.dark body:not(.is-courier-mode) .pt-papers-warn{color:#fbbf24}',
      '.pt-papers-pending{padding:6px 10px;border-radius:9px;background:rgba(124,58,237,.13);color:#6d28d9;border:1px solid rgba(124,58,237,.3);font-size:11.5px;font-weight:700}',
      'html.dark body:not(.is-courier-mode) .pt-papers-pending{color:#c4b5fd}',
      '.pt-btn-papers-pri{background:#2563eb;color:#ffffff}',
      '.pt-btn-papers-warn{background:#b45309;color:#ffffff}',
      '.pt-btn-papers-slate{background:#334155;color:#ffffff}',
      '.pt-modal-backdrop{position:fixed;inset:0;z-index:100060;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px}',
      '.pt-modal-box{width:100%;max-width:440px;border-radius:16px;padding:18px;background:var(--r-card,#fff);color:var(--r-tx,#0f172a);border:1px solid var(--r-bd,rgba(148,163,184,.25));display:flex;flex-direction:column;gap:12px}',
      '#courier-app .pt-modal-box{background:var(--card);color:var(--tx);border-color:var(--bd)}',
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
      sbClient.from('couriers').select('id,name,active').eq('active', true).order('name'),
      sbClient.from('courier_zones').select('zone_key,area_key,courier_id')
    ];
    if (!getServicesList().length) {
      jobs.push(sbClient.from('services').select('id,name,unit_price,executor,duration_days,required_docs,script_notes,delivery_mode').order('name'));
    }
    var res = await Promise.all(jobs);
    if (res[0] && !res[0].error && Array.isArray(res[0].data)) st.couriers = res[0].data;
    if (res[1] && !res[1].error && Array.isArray(res[1].data)) {
      var zmap = {};
      res[1].data.forEach(function (row) {
        if (row && row.zone_key) zmap[row.zone_key] = row.courier_id ? Number(row.courier_id) : null;
      });
      st.courierZones = zmap;
    }
    if (res[2] && !res[2].error && Array.isArray(res[2].data)) st.services = res[2].data;
  }

  async function loadTickets() {
    if (!sbClient) return;
    var colsNew = 'id,sd_request_id,sd_service_id,client_name,phone,address,zone,zone_key,service_name,qty,unit_price,total,executor,slot_pref,courier_id,call_checks,summary_comment,status,courier_step,courier_step_at,cancel_reason,cancelled_at,cancelled_by,courier_ack_at,converted_at,converted_by,mission_id,papers_holder,papers_pending_event_id,created_by,created_at,items,payment_status,collect_amount,staff_notes,converted_tx_id';
    var colsOld = 'id,sd_request_id,sd_service_id,client_name,phone,address,zone,service_name,qty,unit_price,total,executor,slot_pref,courier_id,call_checks,summary_comment,status,created_by,created_at';
    var r = await sbClient.from('pickup_tickets').select(colsNew).order('created_at', { ascending: false }).limit(80);
    if (r.error && /42703|papers_holder|papers_pending_event_id|mission_id|converted_at|cancel_reason|cancelled_at|courier_ack_at|courier_step|zone_key|items|payment_status|staff_notes/i.test((r.error.message || '') + ' ' + (r.error.code || ''))) {
      r = await sbClient.from('pickup_tickets').select(colsOld).order('created_at', { ascending: false }).limit(80);
    }
    if (r.error) throw r.error;
    st.tickets = Array.isArray(r.data) ? r.data : [];
    st.loaded = true;
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

  function getRouteIds() {
    try {
      var a = JSON.parse(localStorage.getItem('ts_cp_route_txs') || '[]');
      return Array.isArray(a) ? a.map(String) : [];
    } catch (e) { return []; }
  }
  function saveRouteIds(arr) {
    try { localStorage.setItem('ts_cp_route_txs', JSON.stringify(arr)); } catch (e) {}
  }
  function getPinsMap() {
    try {
      var o = JSON.parse(localStorage.getItem('ts_cp_pins') || '{}');
      return (o && typeof o === 'object') ? o : {};
    } catch (e) { return {}; }
  }

  function syncTripsHeaderTicketBadge() {
    var cnt = Array.isArray(st.courierTickets) ? st.courierTickets.filter(function (x) { return x.status === 'with_courier'; }).length : 0;
    if (!cnt) return;
    var body = $('cp-body');
    if (!body || currentCourierTab() !== 'trips') return;
    body.querySelectorAll('div, p, span').forEach(function (el) {
      if (el.children.length) return;
      var t = (el.textContent || '').trim();
      if (/مفيش مشاوير مطابقة في اليوم ده/.test(t)) {
        el.style.display = 'none';
      } else if (/0\s*مشوار/.test(t) && !/استلام/.test(t)) {
        el.textContent = t.replace(/0\s*مشوار/, cnt + ' استلام (تيكت)');
      }
    });
    body.querySelectorAll('button').forEach(function (btn) {
      if (btn.dataset.pt73CntDone === '1') return;
      var t = (btn.textContent || '').trim();
      if (t === 'الكل 0') { btn.textContent = 'الكل ' + cnt; btn.dataset.pt73CntDone = '1'; }
      else if (t === 'استلام 0') { btn.textContent = 'استلام ' + cnt; btn.dataset.pt73CntDone = '1'; }
    });
  }

  /* التيكتات بتتعرض جوه شاشة «التيكتات» الموحّدة في js/70 (قايمة واحدة مع المشاوير) — هنا بنطلب إعادة الرسم بس. */
  function renderCourierTicketsIntoBody() {
    if (typeof window.__cpRerender === 'function' && currentCourierTab() === 'tickets') window.__cpRerender();
  }

  var STEP_DONE = { accepted: 1, call_attempt: 2, on_the_way: 3, waiting: 4, papers_received: 5 };

  /* التيكتات الظاهرة للمندوب: جاري/جديد + ملغي لسه ما اتأكدش + أوراق مع المندوب. التيكت المتحوّل بيظهر كمشوار عادي في القايمة (من غير تكرار). */
  window.tsWorkTickets = function () {
    var list = Array.isArray(st.courierTickets) ? st.courierTickets : [];
    return list.filter(function (x) {
      if (x.status === 'with_courier') return true;
      if (x.status === 'cancelled') return !x.courier_ack_at;
      if (x.status === 'converted') return x.papers_holder === 'courier' || !!x.papers_pending_event_id;
      return false;
    });
  };

  /* قراءة حالة تيكت مرتبطة بمعاملة من بوابة المندوب، بدون كشف بيانات إضافية. */
  window.tsCourierTicketStepForTx = function (tx) {
    var key = String(tx || '').trim().toUpperCase();
    var list = Array.isArray(st.courierTickets) ? st.courierTickets : [];
    var ticket = list.find(function (x) {
      return String(x.converted_tx_id || x.sd_request_id || '').trim().toUpperCase() === key;
    });
    return ticket ? { step: ticket.courier_step || '', status: ticket.status || '' } : null;
  };

  window.tsPapersWithCourier = function () {
    var list = Array.isArray(st.courierTickets) ? st.courierTickets : [];
    return list.filter(function (x) { return x.papers_holder === 'courier'; }).length;
  };

  function ticketPrimaryBtn(t) {
    var common = ' data-pt73-tid="' + Number(t.id) + '" data-pt73-sd="' + eh(t.sd_request_id) + '" data-pt73-cl="' + eh(t.client_name) + '"';
    var cs = t.courier_step || '';
    if (t.status === 'cancelled') {
      return '<button type="button" class="pt-btn pt-btn-danger" style="width:100%;min-height:42px;border-radius:14px" data-pt73-ack="' + Number(t.id) + '">تأكيد الإلغاء</button>';
    }
    if (t.status === 'converted') return '';
    var next = !cs ? ['accepted', 'قبول', 'قبول التيكت']
      : cs === 'accepted' ? ['call_attempt', 'اتصال', 'تم الاتصال']
      : cs === 'call_attempt' ? ['on_the_way', 'طريق', 'في الطريق']
      : cs === 'on_the_way' ? ['waiting', 'وصلت', 'وصلت']
      : cs === 'waiting' ? ['papers_received', 'أوراق', 'استلمت الأوراق'] : null;
    if (!next) return '<button type="button" class="ts-cta done" disabled>تم استلام الأوراق ✓</button>';
    return '<button type="button" class="ts-cta" data-pt73-step="' + next[0] + '" data-pt73-lbl="' + next[1] + '"' + common + '>' + next[2] + '</button>';
  }

  function ticketWorkRow(t, openKey) {
    var key = 't' + Number(t.id), open = openKey === key;
    var done = STEP_DONE[t.courier_step || ''] || 0, pct = Math.round(done / 5 * 100);
    var isCancel = t.status === 'cancelled', isConv = t.status === 'converted';
    var tag = isCancel ? '<span class="cpw-tag bad">ملغي</span>'
      : (isConv ? '<span class="cpw-tag">أوراق معاك</span>' : (!t.courier_step ? '<span class="cpw-tag new">جديد</span>' : ''));
    var head = '<button type="button" class="cpw-head" data-act="trip-open" data-key="' + key + '" aria-expanded="' + (open ? 'true' : 'false') + '">' +
      '<span class="cpw-main"><strong>' + eh(t.client_name) + '</strong><small dir="ltr">' + eh(t.phone || '') + ' · ' + eh(t.converted_tx_id || t.sd_request_id) + '</small></span>' +
      tag + '<span class="cpw-chev"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></span></button>' +
      '<div class="cpw-bar"><i style="width:' + (isCancel ? 0 : pct) + '%"></i></div>';
    var body = '';
    if (open) {
      var waPh = cleanWaPhone(t.phone);
      var pin = getPinsMap()[String(t.sd_request_id)];
      var mapQ = encodeURIComponent([t.zone, t.address].filter(Boolean).join(' '));
      var mapHref = (pin && pin.lat && pin.lng)
        ? ('https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(pin.lat + ',' + pin.lng))
        : (mapQ ? ('https://www.google.com/maps/search/?api=1&query=' + mapQ) : '');
      var isPaid = t.payment_status === 'paid' || Number(t.collect_amount || 0) <= 0;
      var items = Array.isArray(t.items) && t.items.length ? t.items : [{ service_name: t.service_name, doc_type: '', qty: t.qty || 1 }];
      var kv = function (k, v) { return v ? '<div class="cpw-kv"><span>' + k + '</span><b>' + v + '</b></div>' : ''; };
      var holder = t.papers_holder || 'office';
      var icon = function (href, extra, path, label) {
        return '<a class="ts7b-icbtn" href="' + href + '"' + extra + ' aria-label="' + label + '"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' + path + '</svg></a>';
      };
      body = '<div class="cpw-body">' +
        (isCancel ? '<div class="pt-cancel-strip"><span>ملغي</span><span>' + eh(t.cancel_reason || '—') + '</span></div>' : '') +
        kv('الخدمة', items.map(function (it) { return eh(it.service_name) + (Number(it.qty || 1) > 1 ? ' × ' + Number(it.qty) : ''); }).join(' + ')) +
        kv('المستندات', eh(items.map(function (it) { return it.doc_type; }).filter(Boolean).join(' · '))) +
        kv('المنطقة', eh(t.zone || '')) + kv('العنوان', eh(t.address || '')) +
        kv('الدفع', isPaid ? 'خالص الدفع' : ('تحصيل ' + Number(t.collect_amount || 0).toLocaleString('en-US') + ' ج.م')) +
        kv('الميعاد', eh(t.slot_pref || '')) +
        kv('الأوراق', '<span class="pt-badge ' + papersHolderBadgeClass(holder) + '">' + eh(PAPERS_COURIER_LABELS[holder] || 'المكتب') + '</span>') +
        (t.staff_notes ? kv('ملاحظة', eh(t.staff_notes)) : '') +
        (t.summary_comment ? kv('ملخص المكالمة', '<span style="white-space:pre-wrap">' + eh(t.summary_comment) + '</span>') : '') +
        renderCourierPapersActionsOnly(t) +
        '<div class="cpw-act">' + ticketPrimaryBtn(t) + '</div>' +
        '<div class="ts7b-trow">' +
          (t.phone ? icon('tel:' + eh(t.phone), ' data-pt73-contact="call" data-pt73-tid="' + Number(t.id) + '"', '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>', 'اتصال') : '') +
          (waPh ? icon('https://wa.me/' + eh(waPh), ' target="_blank" rel="noopener" data-pt73-contact="whatsapp" data-pt73-tid="' + Number(t.id) + '"', '<path d="M21 12a9 9 0 0 1-13.4 7.8L3 21l1.3-4.4A9 9 0 1 1 21 12z"/>', 'واتساب') : '') +
          (mapHref ? icon(mapHref, ' target="_blank" rel="noopener"', '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>', 'لوكيشن') : '') +
        '</div>' +
      '</div>';
    }
    return '<div class="cpw-card' + (open ? ' open' : '') + (isCancel ? ' bad' : '') + '">' + head + body + '</div>';
  }

  window.tsWorkTicketRows = function (list, openKey) {
    return (list || []).map(function (t) { return ticketWorkRow(t, openKey); }).join('');
  };

  window.tsRenderCourierTickets = renderCourierTicketsIntoBody;
  window.tsCourierActiveTicketsCount = function () {
    return Array.isArray(st.courierTickets)
      ? st.courierTickets.filter(function (x) { return x.status === 'with_courier' && !x.courier_step; }).length
      : 0;
  };

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
      syncTripsHeaderTicketBadge();
    } catch (e) { /* ignore */ }
  }

  document.addEventListener('click', async function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var routeBtn = t.closest('[data-pt73-route]');
    if (routeBtn) {
      var rTx = String(routeBtn.getAttribute('data-pt73-route') || '');
      if (!rTx) return;
      var arr = getRouteIds();
      var idx = arr.indexOf(rTx);
      if (idx === -1) {
        arr.push(rTx);
        saveRouteIds(arr);
        if (typeof showToast === 'function') showToast('تمت إضافة تيكت الاستلام لخط السير (#' + arr.length + ')', 'success');
      } else {
        arr.splice(idx, 1);
        saveRouteIds(arr);
        if (typeof showToast === 'function') showToast('تمت إزالة التيكت من خط السير', 'info');
      }
      renderCourierTicketsIntoBody();
      return;
    }
    var pinBtn = t.closest('[data-pt73-pin]');
    if (pinBtn) {
      var pTx = String(pinBtn.getAttribute('data-pt73-pin') || '');
      if (!navigator.geolocation) {
        if (typeof showToast === 'function') showToast('الـ GPS غير مدعوم على هذا الجهاز', 'error');
        return;
      }
      pinBtn.disabled = true;
      navigator.geolocation.getCurrentPosition(function (pos) {
        var pins = getPinsMap();
        var la = Number(pos.coords.latitude.toFixed(6)), ln = Number(pos.coords.longitude.toFixed(6));
        pins[pTx] = { lat: la, lng: ln, at: Date.now() };
        try { localStorage.setItem('ts_cp_pins', JSON.stringify(pins)); } catch (e2) {}
        renderCourierTicketsIntoBody();
        if (typeof showToast === 'function') showToast('تم حفظ لوكيشن العميل على التيكت ✓', 'success');
        if (window.TasahelGeo && window.TasahelGeo.reverseGeocode) {
          window.TasahelGeo.reverseGeocode(la, ln).then(function (street) {
            if (street) {
              var pm = getPinsMap();
              if (pm[pTx]) { pm[pTx].zone = street; try { localStorage.setItem('ts_cp_pins', JSON.stringify(pm)); } catch (e3) {} renderCourierTicketsIntoBody(); }
            }
          }).catch(function () {});
        }
      }, function () {
        pinBtn.disabled = false;
        if (typeof showToast === 'function') showToast('تعذر تحديد الموقع — تأكد من تفعيل الـ GPS', 'error');
      }, { enableHighAccuracy: true, timeout: 7000 });
      return;
    }
    var ctabBtn = t.closest('[data-pt73-ctab]');
    if (ctabBtn) {
      st.courierTab = ctabBtn.getAttribute('data-pt73-ctab') || 'new';
      renderCourierTicketsIntoBody();
      return;
    }
    var openDetBtn = t.closest('[data-pt73-open-detail]');
    if (openDetBtn) {
      var dTid = Number(openDetBtn.getAttribute('data-pt73-open-detail'));
      var dItem = st.courierTickets.find(function (x) { return Number(x.id) === dTid; });
      if (dItem) openCourierTicketDetailModal(dItem);
      return;
    }
    var pConfBtn = t.closest('[data-pt73-papers-confirm]');
    if (pConfBtn) {
      var pEvId = Number(pConfBtn.getAttribute('data-pt73-papers-confirm'));
      var pTid = Number(pConfBtn.getAttribute('data-pt73-tid'));
      if (!pEvId) return;
      pConfBtn.disabled = true;
      try {
        if (!sbClient) throw new Error('لا يوجد اتصال بالسيرفر — حاول تاني');
        var pcRes = await sbClient.rpc('papers_confirm_handover', { p_event_id: pEvId });
        if (pcRes.error) throw pcRes.error;
        if (!pcRes.data || !pcRes.data.ok) throw new Error('تعذر تأكيد استلام الأوراق — حاول تاني');
        var pItem = st.courierTickets.find(function (x) { return Number(x.id) === pTid; });
        if (pItem) {
          pItem.papers_holder = pcRes.data.papers_holder || 'courier';
          pItem.papers_pending_event_id = null;
          pItem.papers_pending_to = null;
          pItem.papers_pending_from = null;
        }
        renderCourierTicketsIntoBody();
        toast('تم تأكيد استلام الأوراق بنجاح', 'success');
      } catch (err) {
        pConfBtn.disabled = false;
        toast((err && err.message) || 'تعذر تأكيد استلام الأوراق', 'error');
      }
      return;
    }
    var pRetBtn = t.closest('[data-pt73-papers-return]');
    if (pRetBtn) {
      var rTid = Number(pRetBtn.getAttribute('data-pt73-papers-return'));
      if (!rTid) return;
      pRetBtn.disabled = true;
      try {
        if (!sbClient) throw new Error('لا يوجد اتصال بالسيرفر — حاول تاني');
        var prRes = await sbClient.rpc('papers_request_handover', {
          p_ticket_id: rTid,
          p_to_holder: 'office',
          p_recipient_name: null,
          p_note: null
        });
        if (prRes.error) throw prRes.error;
        if (!prRes.data || !prRes.data.ok) throw new Error('تعذر تسجيل طلب إرجاع الأوراق');
        var rItem = st.courierTickets.find(function (x) { return Number(x.id) === rTid; });
        if (rItem) {
          rItem.papers_pending_event_id = prRes.data.event_id;
          rItem.papers_pending_to = 'office';
          rItem.papers_pending_from = 'courier';
        }
        renderCourierTicketsIntoBody();
        toast('تم إرسال طلب إرجاع الأوراق للموظف — بانتظار تأكيده', 'success');
      } catch (err) {
        pRetBtn.disabled = false;
        toast((err && err.message) || 'تعذر إرسال طلب إرجاع الأوراق', 'error');
      }
      return;
    }
    var pCustBtn = t.closest('[data-pt73-papers-customer]');
    if (pCustBtn) {
      var cTid = Number(pCustBtn.getAttribute('data-pt73-papers-customer'));
      var cItem2 = st.courierTickets.find(function (x) { return Number(x.id) === cTid; });
      if (cItem2) openCourierDeliverCustomerModal(cItem2);
      return;
    }
    var confMissionBtn = t.closest('[data-pt73-confirm-mission]');
    if (confMissionBtn) {
      var mId = Number(confMissionBtn.getAttribute('data-pt73-confirm-mission'));
      var mTid = Number(confMissionBtn.getAttribute('data-pt73-tid'));
      if (!mId) return;
      confMissionBtn.disabled = true;
      try {
        if (!sbClient) throw new Error('لا يوجد اتصال بالسيرفر — حاول تاني');
        var cmRes = await sbClient.rpc('courier_confirm_one', {
          p_type: 'pickup',
          p_ref: 'trip:' + mId
        });
        if (cmRes.error) throw cmRes.error;
        var mItem = st.courierTickets.find(function (x) { return Number(x.id) === mTid; });
        if (mItem) mItem.mission_confirmed = true;
        renderCourierTicketsIntoBody();
        toast('تم تأكيد مهمة الاستلام بنجاح', 'success');
      } catch (err) {
        confMissionBtn.disabled = false;
        toast((err && err.message) || 'تعذر تأكيد المهمة — حاول تاني', 'error');
      }
      return;
    }
    var ackBtn = t.closest('[data-pt73-ack]');
    if (ackBtn) {
      var ackTid = Number(ackBtn.getAttribute('data-pt73-ack'));
      if (!ackTid) return;
      ackBtn.disabled = true;
      try {
        if (!sbClient) throw new Error('لا يوجد اتصال بالسيرفر — حاول تاني');
        var ackRes = await sbClient.rpc('courier_ticket_ack_cancel', { p_ticket_id: ackTid });
        if (ackRes.error) throw ackRes.error;
        if (!ackRes.data || !ackRes.data.ok) throw new Error('تعذر تسجيل التأكيد — حاول تاني');
        var cItem = st.courierTickets.find(function (x) { return Number(x.id) === ackTid; });
        if (cItem) cItem.courier_ack_at = ackRes.data.courier_ack_at || new Date().toISOString();
        renderCourierTicketsIntoBody();
        toast('تم تأكيد استلام إلغاء التيكت', 'success');
      } catch (err) {
        ackBtn.disabled = false;
        toast((err && err.message) || 'تعذر تأكيد الإلغاء — حاول تاني', 'error');
      }
      return;
    }
    var contactLink = t.closest('[data-pt73-contact]');
    if (contactLink) {
      var cChannel = contactLink.getAttribute('data-pt73-contact');
      var cTid = contactLink.getAttribute('data-pt73-tid');
      if (cTid && (cChannel === 'call' || cChannel === 'whatsapp')) {
        logTicketContact(Number(cTid), cChannel);
      }
      return;
    }
    var stepBtn = t.closest('[data-pt73-step]');
    if (stepBtn) {
      var evType = stepBtn.getAttribute('data-pt73-step');
      var tid = Number(stepBtn.getAttribute('data-pt73-tid'));
      var lbl = stepBtn.getAttribute('data-pt73-lbl') || (STEP_LABELS[evType] || evType);
      stepBtn.disabled = true;
      try {
        if (!sbClient) throw new Error('لا يوجد اتصال بالسيرفر — حاول تاني');
        var res = await sbClient.rpc('courier_ticket_set_step', {
          p_ticket_id: tid,
          p_step: evType
        });
        if (res.error) throw res.error;
        if (!res.data || !res.data.ok) throw new Error('لم يتم تأكيد تحديث الحالة من السيرفر — حاول تاني');
        var item = st.courierTickets.find(function (x) { return Number(x.id) === tid; });
        if (item) {
          item.courier_step = res.data.step || evType;
          item.courier_step_at = res.data.at || new Date().toISOString();
        }
        renderCourierTicketsIntoBody();
        toast('تم تحديث حالة الاستلام: ' + lbl, 'success');
      } catch (err) {
        stepBtn.disabled = false;
        toast((err && err.message) || 'تعذر تحديث الحالة — حاول تاني', 'error');
      }
      return;
    }
    if (t.closest('#cp-nav button')) {
      setTimeout(function () { renderCourierTicketsIntoBody(); syncTripsHeaderTicketBadge(); }, 80);
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

  function getZoneLabel(key) {
    if (!key) return '';
    if (typeof window.zoneLabel === 'function') return window.zoneLabel(key);
    return String(key);
  }

  function buildZoneSelectOptions() {
    var areas = Array.isArray(window.AREAS) ? window.AREAS : [];
    var zones = Array.isArray(window.ZONES) ? window.ZONES : [];
    var html = '<option value="">اختر المنطقة…</option>';
    areas.forEach(function (a) {
      var list = zones.filter(function (z) { return z.area_key === a.area_key; });
      if (!list.length) return;
      html += '<optgroup label="' + eh(a.label) + '">' +
        list.map(function (z) {
          return '<option value="' + eh(z.zone_key) + '">' + eh(z.label) + '</option>';
        }).join('') +
      '</optgroup>';
    });
    return html;
  }

  function applyZoneSuggestion(zoneKey) {
    var hintEl = $('pt-zone-hint');
    var crEl = $('pt-courier');
    var k = String(zoneKey || '').trim();
    if (!k) {
      if (hintEl) hintEl.textContent = '';
      return;
    }
    var cid = st.courierZones && Object.prototype.hasOwnProperty.call(st.courierZones, k)
      ? st.courierZones[k]
      : null;
    var matched = cid ? st.couriers.find(function (c) { return Number(c.id) === Number(cid); }) : null;
    if (matched) {
      if (crEl) crEl.value = String(matched.id);
      if (hintEl) {
        hintEl.style.color = 'var(--r-acc, inherit)';
        hintEl.textContent = 'المندوب المقترح: ' + matched.name + ' (تقدر تغيّره لو محتاج)';
      }
    } else {
      if (crEl) crEl.value = '';
      if (hintEl) {
        hintEl.style.color = 'var(--r-mute, inherit)';
        hintEl.textContent = 'لا يوجد مندوب لهذه المنطقة — التيكت هيتحفظ بدون مندوب';
      }
    }
  }

  function buildScriptAndSummary() {
    syncDraftRowsFromDom();
    var staffName = getStaffDisplayName();
    var nameEl = $('pt-client'), reqEl = $('pt-reqid'), zoneEl = $('pt-zone'), addrEl = $('pt-addr'), slotEl = $('pt-slot'), crEl = $('pt-courier'), notesEl = $('pt-notes');
    var client = (nameEl && nameEl.value.trim()) || 'حضرتك';
    var reqId = (reqEl && reqEl.value.trim()) || '—';
    var zoneVal = (zoneEl && zoneEl.value.trim()) || '';
    var place = (zoneVal ? getZoneLabel(zoneVal) : '') || (addrEl && addrEl.value.trim()) || 'العنوان المسجل';
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
        (extra ? '<div style="margin-top:2px;color:var(--r-acc,#036b29)"><b>تنبيه مهم للعميل:</b> ' + eh(extra) + '</div>' : '') +
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

  async function directConvertTicket(ticket, payMethodOverride) {
    if (!sbClient) return false;
    if (st.converting) return false;
    if (!isManager()) {
      toast('التحويل لمهمة استلام متاح للمدير فقط', 'error');
      return false;
    }
    if (!ticket.courier_id) {
      toast('لازم تعيّن مندوب للتيكت قبل التحويل لمهمة استلام', 'error');
      return false;
    }
    st.converting = true;
    try { return await doDirectConvert(ticket, payMethodOverride); } finally { st.converting = false; }
  }

  async function doDirectConvert(ticket, payMethodOverride) {
    var items = mapTicketToItems(ticket);
    var missing = items.filter(function (it) { return !findSvc(it.service_name); })
      .map(function (it) { return it.service_name; });
    if (missing.length) {
      toast('خدمة غير موجودة في الكتالوج: ' + missing.join('، ') + ' — استخدم «فتح في معاملة جديدة»', 'error');
      return false;
    }
    var cName = courierNameById(ticket.courier_id);
    var empName = getStaffDisplayName();
    var payMethod = payMethodOverride || mapPayMethod(ticket);
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
      toast(rc.error.message || 'فشل التحويل — حاول تاني', 'error');
      return false;
    }
    var txId = (rc.data && rc.data.transaction_id) || '';
    var mId = (rc.data && rc.data.mission_id) || null;

    ticket.status = 'converted';
    ticket.converted_tx_id = txId;
    if (mId) ticket.mission_id = mId;
    ticket.converted_at = ticket.converted_at || new Date().toISOString();
    renderTicketsList();
    if (st.detailTicketId && Number(st.detailTicketId) === Number(ticket.id)) renderTicketDetailPanel();
    try { if (typeof loadRecentRequests === 'function') await loadRecentRequests(); } catch (e) { /* */ }
    if (rc.data && rc.data.already_converted) {
      toast('التيكت متحوّل بالفعل لمعاملة ' + txId + (mId ? ' (مهمة #' + mId + ')' : ''), 'info');
    } else {
      toast('تم التحويل لمعاملة ' + txId + ' وإرسال مهمة الاستلام للمندوب', 'success');
    }
    return true;
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
    var tabsBar = $('pt-mgr-tabs');
    if (!list) return;

    var activeArr = st.tickets.filter(function (x) { return x.status === 'open' || x.status === 'with_courier'; });
    var convArr = st.tickets.filter(function (x) { return x.status === 'converted'; });
    var cancArr = st.tickets.filter(function (x) { return x.status === 'cancelled'; });

    if (tabsBar) {
      tabsBar.innerHTML =
        '<button type="button" class="pt-ftab' + (st.mgrTab === 'active' ? ' active' : '') + '" data-pt-mtab="active">نشط (' + activeArr.length + ')</button>' +
        '<button type="button" class="pt-ftab' + (st.mgrTab === 'converted' ? ' active' : '') + '" data-pt-mtab="converted">تم التحويل (' + convArr.length + ')</button>' +
        '<button type="button" class="pt-ftab pt-ftab-danger' + (st.mgrTab === 'cancelled' ? ' active' : '') + '" data-pt-mtab="cancelled">ملغي (' + cancArr.length + ')</button>';
    }

    var filtered = st.mgrTab === 'cancelled'
      ? cancArr
      : (st.mgrTab === 'converted' ? convArr : activeArr);

    if (!filtered.length) {
      var emptyMsg = st.mgrTab === 'cancelled'
        ? 'مفيش تيكتات ملغية.'
        : (st.mgrTab === 'converted' ? 'مفيش تيكتات محوّلة.' : 'مفيش تيكتات نشطة دلوقتي.');
      list.innerHTML = '<div class="pt-sub" style="text-align:center;padding:18px 0">' + emptyMsg + '</div>';
      return;
    }
    var statusLabel = { open: 'مفتوح', with_courier: 'مع المندوب', converted: 'تم التحويل', cancelled: 'ملغي' };
    list.innerHTML = filtered.map(function (t) {
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
      var canCancel = canAction && isManager();

      var stepTxt = t.courier_step
        ? (STEP_LABELS[t.courier_step] || t.courier_step) + (t.courier_step_at ? ' · ' + fmtStepTime(t.courier_step_at) : '')
        : (t.status === 'with_courier' ? 'بانتظار قبول المندوب' : '');
      var waPh = cleanWaPhone(t.phone);
      return '<div class="pt-ticket-item" data-ticket-row="' + Number(t.id) + '">' +
        '<div style="flex:1;min-width:250px">' +
          '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px">' +
            '<span class="pt-badge pt-badge-org" dir="ltr">' + eh(t.sd_request_id) + '</span>' +
            '<b class="pt-client-cell">' + eh(t.client_name) + '</b>' +
            '<span class="pt-sub" dir="ltr">' + eh(t.phone) + '</span>' +
            '<span class="pt-badge ' + (t.status === 'cancelled' ? 'pt-badge-cancel' : 'pt-badge-mut') + '">' + eh(statusLabel[t.status] || t.status) + '</span>' +
            (stepTxt ? '<span class="pt-badge pt-badge-pur">' + eh(stepTxt) + '</span>' : '') +
            payBadge +
            '<span class="pt-badge pt-badge-mut">المندوب: ' + eh(courierNameById(t.courier_id)) + '</span>' +
            (t.converted_tx_id ? '<span class="pt-badge pt-badge-org" dir="ltr">' + eh(t.converted_tx_id) + '</span>' : '') +
            (t.mission_id ? '<span class="pt-badge pt-badge-pur" dir="ltr">مهمة #' + Number(t.mission_id) + '</span>' : '') +
            '<span class="pt-badge ' + papersHolderBadgeClass(t.papers_holder || 'office') + '">الأوراق: ' + eh(PAPERS_HOLDER_LABELS[t.papers_holder || 'office'] || 'المكتب') + '</span>' +
            (t.papers_pending_event_id ? '<span class="pt-badge pt-badge-pur">تسليم أوراق معلّق</span>' : '') +
            (t.status === 'cancelled' && (t.papers_holder || 'office') === 'courier' ? '<span class="pt-badge pt-badge-warn">تنبيه: الأوراق مع المندوب</span>' : '') +
          '</div>' +
          '<div class="pt-sub" style="margin-top:5px">' + svcsHtml + ' · الإجمالي: <b>' + eh(money(t.total)) + '</b> · الميعاد: ' + eh(t.slot_pref) + (t.zone ? ' · ' + eh(t.zone) : '') + '</div>' +
          (t.status === 'cancelled'
            ? '<div style="margin-top:5px;padding:6px 9px;border-radius:9px;background:rgba(220,38,38,.1);color:#dc2626;font-size:12px"><b>سبب الإلغاء:</b> ' + eh(t.cancel_reason || '—') +
              (t.cancelled_at ? ' · <b>التاريخ:</b> ' + eh(fmtStepTime(t.cancelled_at)) : '') +
              (t.courier_id ? ' · <b>المندوب:</b> ' + (t.courier_ack_at ? 'أكّد الإلغاء (' + eh(fmtStepTime(t.courier_ack_at)) + ')' : 'بانتظار تأكيد المندوب') : '') + '</div>'
            : '') +
          (t.staff_notes ? '<div class="pt-sub" style="margin-top:3px;color:var(--r-acc,#036b29)"><b>ملاحظات:</b> ' + eh(t.staff_notes) + '</div>' : '') +
          (t.summary_comment ? '<div class="pt-comment-pre">' + eh(t.summary_comment) + '</div>' : '') +
        '</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:6px">' +
          (t.phone ? '<a class="pt-btn pt-btn-pri" href="tel:' + eh(t.phone) + '"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg> اتصال</a>' : '') +
          (waPh ? '<a class="pt-btn pt-btn-sec" target="_blank" rel="noopener" href="https://wa.me/' + eh(waPh) + '"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg> واتساب</a>' : '') +
          '<button type="button" class="pt-btn pt-btn-sec" data-pt-act="detail" data-id="' + Number(t.id) + '">التفاصيل والتواصل</button>' +
          '<button type="button" class="pt-btn pt-btn-sec" data-pt-act="copy" data-id="' + Number(t.id) + '">نسخ الكومنت</button>' +
          (canAction && isManager()
            ? (t.courier_id
              ? '<button type="button" class="pt-btn pt-btn-mission" data-pt-act="convert" data-id="' + Number(t.id) + '">تحويل لمهمة استلام</button>'
              : '<button type="button" class="pt-btn pt-btn-sec" disabled title="لازم تعيّن مندوب قبل التحويل">تحويل لمهمة استلام</button><span class="pt-sub" style="align-self:center">عيّن مندوب أولاً للتحويل</span>')
            : '') +
          (canAction ? '<button type="button" class="pt-btn pt-btn-sec" data-pt-act="prefill" data-id="' + Number(t.id) + '">فتح في معاملة جديدة</button>' : '') +
          (canCancel ? '<button type="button" class="pt-btn pt-btn-danger" data-pt-act="cancel" data-id="' + Number(t.id) + '">إلغاء التيكت</button>' : '') +
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
            '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
              '<span id="pt-rt-status" class="pt-badge pt-badge-mut">جاري الاتصال بالتحديث المباشر…</span>' +
              '<button type="button" class="pt-btn pt-btn-sec hidden" id="pt-rt-reconnect">إعادة الاتصال</button>' +
              '<button type="button" class="pt-btn pt-btn-sec" id="pt-refresh-btn">تحديث القائمة</button>' +
            '</div>' +
          '</div>' +
        '</section>' +
        '<section id="pt-detail-panel" class="pt-card hidden" style="display:flex;flex-direction:column;gap:10px"></section>' +

        '<form id="pt-form" class="pt-grid2">' +
          '<section class="pt-card" style="display:flex;flex-direction:column;gap:12px">' +
            '<b style="font-size:14px">1) بيانات العميل والخدمات (من سمارت ديسك)</b>' +
            '<div class="pt-fgrid">' +
              '<div class="pt-field-wrap"><label class="pt-label" for="pt-client">اسم العميل *</label><input id="pt-client" class="pt-input" required maxlength="160" placeholder="الاسم الكامل"></div>' +
              '<div class="pt-field-wrap"><label class="pt-label" for="pt-phone">رقم الموبايل *</label><input id="pt-phone" class="pt-input" required dir="ltr" maxlength="30" placeholder="01xxxxxxxxx"></div>' +
              '<div class="pt-field-wrap"><label class="pt-label" for="pt-reqid">Request ID (سمارت ديسك) *</label><input id="pt-reqid" class="pt-input" required dir="ltr" maxlength="80" placeholder="SD-2026-..."></div>' +
              '<div class="pt-field-wrap"><label class="pt-label" for="pt-slot">الميعاد المناسب للتواصل</label><select id="pt-slot" class="pt-select"><option value="صباحي">صباحي</option><option value="بعد الظهر">بعد الظهر</option><option value="مسائي">مسائي</option><option value="سفارة">سفارة الإمارات</option></select></div>' +
              '<div class="pt-field-wrap"><label class="pt-label" for="pt-zone">المنطقة</label><select id="pt-zone" class="pt-select">' + buildZoneSelectOptions() + '</select><div id="pt-zone-hint" class="pt-sub" style="margin-top:2px"></div></div>' +
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
          '<div class="pt-head"><b style="font-size:14px">تذاكر الاستلام المبدئية</b><div id="pt-mgr-tabs" class="pt-tabs-bar" style="margin:0"></div></div>' +
          '<div id="pt-list" style="display:flex;flex-direction:column;gap:10px">جاري التحميل…</div>' +
        '</section>' +
      '</div>';

    renderDraftRows();
    refreshLivePreview();
    renderTicketsList();
    updateRtStatusUi();
    startTicketsRealtime();
  }

  function updateRtStatusUi() {
    var el = $('pt-rt-status'), btn = $('pt-rt-reconnect');
    if (!el) return;
    if (st.rtStatus === 'connected') {
      el.className = 'pt-badge pt-badge-ok';
      el.textContent = 'تحديث لحظي متصل';
      if (btn) btn.classList.add('hidden');
    } else if (st.rtStatus === 'disconnected') {
      el.className = 'pt-badge pt-badge-warn';
      el.textContent = 'التحديث متوقف';
      if (btn) btn.classList.remove('hidden');
    } else {
      el.className = 'pt-badge pt-badge-mut';
      el.textContent = 'جاري الاتصال…';
      if (btn) btn.classList.add('hidden');
    }
  }

  function applyRealtimeTicketRow(payload) {
    if (!payload) return;
    var row = payload.new || null;
    var oldRow = payload.old || null;
    var ev = payload.eventType;
    if (ev === 'DELETE' && oldRow && oldRow.id != null) {
      st.tickets = st.tickets.filter(function (x) { return Number(x.id) !== Number(oldRow.id); });
    } else if (row && row.id != null) {
      var idx = st.tickets.findIndex(function (x) { return Number(x.id) === Number(row.id); });
      if (idx >= 0) st.tickets[idx] = Object.assign({}, st.tickets[idx], row);
      else st.tickets.unshift(row);
    }
    renderTicketsList();
    if (st.detailTicketId && row && Number(row.id) === Number(st.detailTicketId)) {
      loadDetailPapers(st.detailTicketId);
      renderTicketDetailPanel();
    }
  }

  function stopTicketsRealtime() {
    if (st.rtChannel && sbClient && typeof sbClient.removeChannel === 'function') {
      try { sbClient.removeChannel(st.rtChannel); } catch (e) {}
    }
    st.rtChannel = null;
    st.rtStatus = 'idle';
    stopTicketDetailRealtime();
  }

  function startTicketsRealtime() {
    if (!sbClient || typeof sbClient.channel !== 'function' || !isAllowedStaff()) return;
    if (st.rtChannel) return;
    st.rtStatus = 'connecting';
    updateRtStatusUi();
    try {
      var ch = sbClient
        .channel('pt73-pickup-tickets-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pickup_tickets' }, applyRealtimeTicketRow)
        .subscribe(function (status) {
          if (status === 'SUBSCRIBED') st.rtStatus = 'connected';
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') st.rtStatus = 'disconnected';
          updateRtStatusUi();
        });
      st.rtChannel = ch;
    } catch (e) {
      st.rtStatus = 'disconnected';
      updateRtStatusUi();
    }
  }

  function stopTicketDetailRealtime() {
    if (st.rtDetailChannel && sbClient && typeof sbClient.removeChannel === 'function') {
      try { sbClient.removeChannel(st.rtDetailChannel); } catch (e) {}
    }
    st.rtDetailChannel = null;
  }

  async function loadDetailPapers(ticketId) {
    if (!sbClient || !ticketId) return;
    st.detailPapersLoading = true;
    try {
      var pr = await sbClient.rpc('papers_history', { p_ticket_id: Number(ticketId) });
      if (!pr.error && Array.isArray(pr.data)) st.detailPapers = pr.data;
    } catch (e) { /* */ }
    st.detailPapersLoading = false;
    if (st.detailTicketId && Number(st.detailTicketId) === Number(ticketId)) {
      renderTicketDetailPanel();
    }
  }

  function renderTicketDetailPanel() {
    var panel = $('pt-detail-panel');
    if (!panel) return;
    if (!st.detailTicketId) {
      panel.classList.add('hidden');
      panel.innerHTML = '';
      return;
    }
    var t = st.tickets.find(function (x) { return Number(x.id) === Number(st.detailTicketId); });
    if (!t) {
      panel.classList.add('hidden');
      return;
    }
    var stepTxt = t.courier_step
      ? (STEP_LABELS[t.courier_step] || t.courier_step) + (t.courier_step_at ? ' (' + fmtStepTime(t.courier_step_at) + ')' : '')
      : 'لم يبدأ المندوب بعد';
    var waPh = cleanWaPhone(t.phone);
    var logs = Array.isArray(st.detailContacts) ? st.detailContacts : [];
    var lastAt = logs.length ? fmtStepTime(logs[0].created_at) : 'لا يوجد تواصل بعد';
    var logsHtml = logs.length
      ? logs.map(function (r) {
          var ch = r.channel === 'whatsapp' ? 'واتساب' : 'اتصال';
          var out = r.outcome ? (' · ' + (OUTCOME_LABELS[r.outcome] || r.outcome)) : '';
          return '<div style="display:flex;justify-content:space-between;gap:8px;padding:6px 10px;border-radius:9px;background:var(--r-bg,rgba(148,163,184,.08));font-size:12px">' +
            '<span><b>' + ch + '</b>' + eh(out) + '</span>' +
            '<span class="pt-sub" dir="ltr">' + eh(fmtStepTime(r.created_at)) + '</span>' +
          '</div>';
        }).join('')
      : '<div class="pt-sub">لم يُسجّل أي تواصل من المندوب على التيكت ده حتى الآن.</div>';

    var pHolder = t.papers_holder || 'office';
    var pPendingId = t.papers_pending_event_id ? Number(t.papers_pending_event_id) : null;
    var pEvents = Array.isArray(st.detailPapers) ? st.detailPapers : [];
    var pendingEv = pEvents.find(function (ev) { return ev.status === 'pending'; }) || null;
    var canReqToCourier = (pHolder === 'office' && !pPendingId && t.status !== 'cancelled' && !!t.courier_id);
    var reqCourierReason = '';
    if (!canReqToCourier) {
      if (t.status === 'cancelled') reqCourierReason = 'التيكت ملغي';
      else if (!t.courier_id) reqCourierReason = 'عيّن مندوب أولاً';
      else if (pPendingId) reqCourierReason = 'يوجد طلب تسليم معلّق بالفعل';
      else reqCourierReason = 'الأوراق ليست بالمكتب حالياً';
    }
    var canConfirmOffice = !!(pendingEv && pendingEv.to_holder === 'office');
    var confirmOfficeReason = canConfirmOffice ? '' : 'بانتظار طلب المندوب لإرجاع الأوراق';

    var pHistHtml = pEvents.length
      ? pEvents.map(function (ev) {
          var fromL = PAPERS_HOLDER_LABELS[ev.from_holder] || ev.from_holder;
          var toL = PAPERS_HOLDER_LABELS[ev.to_holder] || ev.to_holder;
          var stLbl = ev.status === 'confirmed' ? 'مؤكّد' : (ev.status === 'pending' ? 'معلّق' : 'ملغي');
          var stCls = ev.status === 'pending' ? 'pt-badge-pur' : 'pt-badge-mut';
          var extra = [];
          if (ev.recipient_name) extra.push('المستلم: ' + ev.recipient_name);
          if (ev.requested_by_name) extra.push('الطلب بواسطة: ' + ev.requested_by_name);
          if (ev.confirmed_by_name && ev.status === 'confirmed') extra.push('التأكيد: ' + ev.confirmed_by_name);
          if (ev.note) extra.push('ملاحظة: ' + ev.note);
          return '<div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:6px;padding:7px 10px;border-radius:9px;background:var(--r-bg,rgba(148,163,184,.08));font-size:12px">' +
            '<div><b>' + eh(fromL) + ' ← ' + eh(toL) + '</b> <span class="pt-badge ' + stCls + '">' + stLbl + '</span>' +
              (extra.length ? '<div class="pt-sub">' + eh(extra.join(' · ')) + '</div>' : '') +
            '</div>' +
            '<span class="pt-sub" dir="ltr">' + eh(fmtStepTime(ev.confirmed_at || ev.requested_at)) + '</span>' +
          '</div>';
        }).join('')
      : '<div class="pt-sub">' + (st.detailPapersLoading ? 'جاري تحميل سجل الأوراق…' : 'لا توجد تحركات مسجّلة للأوراق بعد (الحائز المبدئي: المكتب).') + '</div>';

    var papersSectionHtml =
      '<div class="pt-papers-box">' +
        '<div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px">' +
          '<b style="font-size:13px"><i class="fa-regular fa-folder-open"></i> الأوراق (عهدة المستندات)</b>' +
          '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">' +
            '<span class="pt-badge ' + papersHolderBadgeClass(pHolder) + '">الحائز الحالي: ' + eh(PAPERS_HOLDER_LABELS[pHolder] || 'المكتب') + '</span>' +
            (pPendingId ? '<span class="pt-badge pt-badge-pur">يوجد طلب تسليم معلّق</span>' : '') +
          '</div>' +
        '</div>' +
        (t.status === 'cancelled' && pHolder === 'courier'
          ? '<div class="pt-papers-warn"><i class="fa-solid fa-triangle-exclamation"></i> تنبيه: التيكت ملغي والأوراق ما زالت مع المندوب — بانتظار إرجاعها للمكتب وتأكيد الاستلام.</div>'
          : '') +
        '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">' +
          '<button type="button" class="pt-btn pt-btn-papers-pri" data-pt-papers="to_courier" data-id="' + Number(t.id) + '"' + (canReqToCourier ? '' : ' disabled title="' + eh(reqCourierReason) + '"') + '>طلب تسليم للمندوب</button>' +
          '<button type="button" class="pt-btn pt-btn-papers-slate" data-pt-papers="confirm_office" data-id="' + Number(t.id) + '"' + (canConfirmOffice ? ' data-event-id="' + Number(pendingEv.id) + '"' : ' disabled title="' + eh(confirmOfficeReason) + '"') + '>استلام أوراق من المندوب</button>' +
          (!canReqToCourier && !canConfirmOffice
            ? '<span class="pt-sub">' + eh(reqCourierReason || confirmOfficeReason) + '</span>'
            : '') +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:5px">' + pHistHtml + '</div>' +
      '</div>';

    panel.classList.remove('hidden');
    panel.innerHTML =
      '<div class="pt-head">' +
        '<div>' +
          '<b style="font-size:14px">تفاصيل التيكت: ' + eh(t.client_name) + ' (<span dir="ltr">' + eh(t.sd_request_id) + '</span>)</b>' +
          '<div class="pt-sub">الخطوة الحالية: <b>' + eh(stepTxt) + '</b> · المندوب: <b>' + eh(courierNameById(t.courier_id)) + '</b></div>' +
        '</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:6px">' +
          (t.phone ? '<a class="pt-btn pt-btn-pri" href="tel:' + eh(t.phone) + '"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg> اتصال</a>' : '') +
          (waPh ? '<a class="pt-btn pt-btn-sec" target="_blank" rel="noopener" href="https://wa.me/' + eh(waPh) + '"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg> واتساب</a>' : '') +
          (isManager() && (t.status === 'open' || t.status === 'with_courier')
            ? (t.courier_id
              ? '<button type="button" class="pt-btn pt-btn-mission" data-pt-act="convert" data-id="' + Number(t.id) + '">تحويل لمهمة استلام</button>'
              : '<button type="button" class="pt-btn pt-btn-sec" disabled>تحويل لمهمة استلام (بدون مندوب)</button>')
            : '') +
          (isManager() && (t.status === 'open' || t.status === 'with_courier')
            ? '<button type="button" class="pt-btn pt-btn-danger" data-pt-act="cancel" data-id="' + Number(t.id) + '">إلغاء التيكت</button>'
            : '') +
          '<button type="button" class="pt-btn pt-btn-sec" id="pt-detail-close">إغلاق</button>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;font-size:12px">' +
        '<b>سجل التواصل مع العميل</b>' +
        '<span class="pt-sub">عدد المرات: <b>' + logs.length + '</b> · آخر تواصل: <b>' + eh(lastAt) + '</b></span>' +
      '</div>' +
      papersSectionHtml +
      '<div style="display:flex;flex-direction:column;gap:6px">' + logsHtml + '</div>';
  }

  async function openTicketDetail(ticketId) {
    st.detailTicketId = Number(ticketId);
    st.detailContacts = [];
    st.detailPapers = [];
    st.detailPapersLoading = true;
    renderTicketDetailPanel();
    stopTicketDetailRealtime();
    if (sbClient && typeof sbClient.channel === 'function') {
      try {
        st.rtDetailChannel = sbClient
          .channel('pt73-ticket-detail-' + st.detailTicketId)
          .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'pickup_tickets',
            filter: 'id=eq.' + st.detailTicketId
          }, applyRealtimeTicketRow)
          .subscribe();
      } catch (e) { /* */ }
    }
    if (!sbClient) return;
    try {
      var resAll = await Promise.all([
        sbClient
          .from('courier_contact_log')
          .select('id,channel,outcome,created_at,courier_id')
          .eq('ticket_id', st.detailTicketId)
          .order('created_at', { ascending: false })
          .limit(30),
        sbClient.rpc('papers_history', { p_ticket_id: st.detailTicketId })
      ]);
      if (resAll[0] && !resAll[0].error && Array.isArray(resAll[0].data)) st.detailContacts = resAll[0].data;
      if (resAll[1] && !resAll[1].error && Array.isArray(resAll[1].data)) st.detailPapers = resAll[1].data;
    } catch (e) { /* */ }
    st.detailPapersLoading = false;
    renderTicketDetailPanel();
    var p = $('pt-detail-panel');
    if (p && p.scrollIntoView) p.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
        zone: ($('pt-zone').value || '').trim() ? getZoneLabel($('pt-zone').value.trim()) : null,
        zone_key: ($('pt-zone').value || '').trim() || null,
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
      if ($('pt-zone-hint')) $('pt-zone-hint').textContent = '';
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
    var mtab = e.target && e.target.closest ? e.target.closest('[data-pt-mtab]') : null;
    if (mtab) {
      st.mgrTab = mtab.getAttribute('data-pt-mtab') || 'active';
      renderTicketsList();
      return;
    }
    if (e.target && e.target.id === 'pt-rt-reconnect') {
      stopTicketsRealtime();
      startTicketsRealtime();
      return;
    }
    if (e.target && e.target.id === 'pt-detail-close') {
      st.detailTicketId = null;
      st.detailContacts = [];
      st.detailPapers = [];
      stopTicketDetailRealtime();
      renderTicketDetailPanel();
      return;
    }
    var pBtn = e.target && e.target.closest ? e.target.closest('[data-pt-papers]') : null;
    if (pBtn) {
      var pAct = pBtn.getAttribute('data-pt-papers');
      var pTicketId = Number(pBtn.getAttribute('data-id'));
      var pT = st.tickets.find(function (x) { return Number(x.id) === pTicketId; });
      if (!pT || !sbClient) return;
      pBtn.disabled = true;
      try {
        if (pAct === 'to_courier') {
          var rq = await sbClient.rpc('papers_request_handover', {
            p_ticket_id: pTicketId,
            p_to_holder: 'courier',
            p_recipient_name: null,
            p_note: null
          });
          if (rq.error) throw rq.error;
          if (!rq.data || !rq.data.ok) throw new Error('تعذر إرسال طلب تسليم الأوراق');
          pT.papers_pending_event_id = rq.data.event_id;
          toast('تم إرسال طلب تسليم الأوراق للمندوب — بانتظار تأكيده', 'success');
        } else if (pAct === 'confirm_office') {
          var evId = Number(pBtn.getAttribute('data-event-id') || pT.papers_pending_event_id);
          if (!evId) throw new Error('لا يوجد طلب إرجاع معلّق');
          var cf = await sbClient.rpc('papers_confirm_handover', { p_event_id: evId });
          if (cf.error) throw cf.error;
          if (!cf.data || !cf.data.ok) throw new Error('تعذر تأكيد استلام الأوراق');
          pT.papers_holder = cf.data.papers_holder || 'office';
          pT.papers_pending_event_id = null;
          toast('تم تأكيد استلام الأوراق في المكتب بنجاح', 'success');
        }
        renderTicketsList();
        await loadDetailPapers(pTicketId);
      } catch (err) {
        pBtn.disabled = false;
        toast((err && err.message) || 'تعذر تنفيذ عملية الأوراق', 'error');
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

    if (b.dataset.ptAct === 'detail') {
      openTicketDetail(id);
      return;
    }
    if (b.dataset.ptAct === 'copy') {
      await copyText(t.summary_comment || '');
      toast('تم نسخ الكومنت ✓');
      return;
    }
    if (b.dataset.ptAct === 'convert') {
      if (!isManager()) return toast('التحويل لمهمة استلام متاح للمدير فقط', 'error');
      if (!t.courier_id) return toast('لازم تعيّن مندوب للتيكت قبل التحويل لمهمة استلام', 'error');
      openConvertTicketModal(t);
      return;
    }
    if (b.dataset.ptAct === 'prefill') {
      prefillNewOrderTab(t);
      return;
    }
    if (b.dataset.ptAct === 'cancel') {
      if (!isManager()) return toast('الإلغاء متاح للمدير فقط', 'error');
      openCancelTicketModal(t);
    }
  }

  function closeCourierTicketDetailModal() {
    var m = $('pt-courier-detail-modal');
    if (m) m.remove();
  }

  async function openCourierTicketDetailModal(ticket) {
    if (!ticket) return;
    closeCourierTicketDetailModal();
    var waPh = cleanWaPhone(ticket.phone);
    var mapQ = encodeURIComponent([ticket.zone, ticket.address].filter(Boolean).join(' '));
    var pins = getPinsMap();
    var pin = pins[String(ticket.sd_request_id)];
    var mapHref = (pin && pin.lat && pin.lng)
      ? ('https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(pin.lat + ',' + pin.lng))
      : (mapQ ? ('https://www.google.com/maps/search/?api=1&query=' + mapQ) : '');
    var rIds = getRouteIds();
    var inRoute = rIds.indexOf(String(ticket.sd_request_id)) !== -1;
    var isPaid = ticket.payment_status === 'paid' || Number(ticket.collect_amount || 0) <= 0;
    var curStep = ticket.courier_step || '';
    var doneUpTo = 0, curIdx = 1;
    if (curStep === 'papers_received') { doneUpTo = 5; curIdx = 6; }
    else if (curStep === 'waiting') { doneUpTo = 4; curIdx = 5; }
    else if (curStep === 'on_the_way') { doneUpTo = 3; curIdx = 4; }
    else if (curStep === 'call_attempt') { doneUpTo = 2; curIdx = 3; }
    else if (curStep === 'accepted') { doneUpTo = 1; curIdx = 2; }
    var stepperLabels = ['قبول', 'اتصال', 'طريق', 'وصلت', 'أوراق'];
    var stepperHtml = '<div class="ts-stepper">' + stepperLabels.map(function (lbl, idx) {
      var n = idx + 1;
      var isDone = n <= doneUpTo;
      var isCur = !isDone && n === curIdx;
      return '<div class="ts-step ' + (isDone ? 'done' : (isCur ? 'cur' : '')) + '"><div class="ts-dot">' + (isDone ? '✓' : n) + '</div><div class="ts-slbl">' + lbl + '</div></div>';
    }).join('') + '</div>';

    var holder = ticket.papers_holder || 'office';
    var holderTxt = PAPERS_COURIER_LABELS[holder] || 'المكتب';
    var itemsList = Array.isArray(ticket.items) && ticket.items.length
      ? ticket.items
      : [{ service_name: ticket.service_name, doc_type: '', qty: ticket.qty || 1 }];
    var svcsHtml = itemsList.map(function (it) {
      return eh(it.service_name) + (it.doc_type ? ' (' + eh(it.doc_type) + ')' : '') + (Number(it.qty || 1) > 1 ? ' × ' + Number(it.qty) : '');
    }).join(' + ');

    var wrap = document.createElement('div');
    wrap.id = 'pt-courier-detail-modal';
    wrap.className = 'ts7b-detail-view';
    wrap.innerHTML =
      '<div class="ts7b-detail-inner" role="dialog" aria-modal="true">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">' +
          '<button type="button" class="ts7b-detbtn" id="pt-cdet-close" style="margin:0"><i class="fa-solid fa-arrow-right"></i> رجوع</button>' +
          '<span dir="ltr" style="font-size:13px;font-weight:800;color:var(--mu)">' + eh(ticket.converted_tx_id || ticket.sd_request_id) + '</span>' +
        '</div>' +
        (ticket.status === 'cancelled'
          ? '<div class="pt-cancel-strip"><span><i class="fa-solid fa-ban"></i> ملغي</span><span>' + eh(ticket.cancel_reason || '—') + '</span></div>'
          : '') +
        '<div class="ts7b-amount-hero">' +
          '<div><div style="font-size:12px;opacity:.9">' + (isPaid ? 'الدفع' : 'التحصيل') + '</div>' +
            '<div class="ts7b-amount-val">' + (isPaid ? 'خالص الدفع' : (Number(ticket.collect_amount || 0).toLocaleString('en-US') + ' ج.م')) + '</div></div>' +
          '<span class="pt-badge" style="background:rgba(255,255,255,.18);color:#FFFFFF">' + eh(ticket.zone || '—') + '</span>' +
        '</div>' +
        '<div class="ts7b-tcard" style="margin:0">' +
          '<div class="ts7b-kv"><span class="ts7b-kv-k">اسم العميل</span><div class="ts7b-kv-v">' + eh(ticket.client_name) + '</div></div>' +
          '<div class="ts7b-kv"><span class="ts7b-kv-k">الخدمة</span><div class="ts7b-kv-v">' + itemsList.map(function (it) { return eh(it.service_name) + (Number(it.qty || 1) > 1 ? ' × ' + Number(it.qty) : ''); }).join(' + ') + '</div></div>' +
          '<div class="ts7b-kv"><span class="ts7b-kv-k">المستندات المطلوبة</span><div class="ts7b-kv-v">' + eh(itemsList.map(function (it) { return it.doc_type; }).filter(Boolean).join(' · ') || 'حسب بنود الطلب') + '</div></div>' +
          (ticket.address ? '<div class="ts7b-kv"><span class="ts7b-kv-k">العنوان</span><div class="ts7b-kv-v">' + eh(ticket.address) + '</div></div>' : '') +
          stepperHtml +
        '</div>' +
        '<div class="ts7b-act-grid">' +
          (ticket.phone ? '<a class="ts7b-act-btn" href="tel:' + eh(ticket.phone) + '" data-pt73-contact="call" data-pt73-tid="' + Number(ticket.id) + '"><i class="fa-solid fa-phone" style="color:#036b29"></i> اتصال</a>' : '<button type="button" class="ts7b-act-btn" disabled>بدون هاتف</button>') +
          (waPh ? '<a class="ts7b-act-btn" target="_blank" rel="noopener" href="https://wa.me/' + eh(waPh) + '" data-pt73-contact="whatsapp" data-pt73-tid="' + Number(ticket.id) + '"><i class="fa-brands fa-whatsapp" style="color:#036b29"></i> واتساب</a>' : '<button type="button" class="ts7b-act-btn" disabled>واتساب</button>') +
          (mapHref ? '<a class="ts7b-act-btn" target="_blank" rel="noopener" href="' + mapHref + '"><i class="fa-solid fa-location-dot" style="color:#036b29"></i> الخريطة</a>' : '<button type="button" class="ts7b-act-btn" disabled>الخريطة</button>') +
          '<button type="button" class="ts7b-act-btn" data-pt73-route="' + eh(ticket.sd_request_id) + '"><i class="fa-solid fa-route" style="color:#036b29"></i> ' + (inRoute ? 'إزالة من الخط' : '+ خط السير') + '</button>' +
        '</div>' +
        '<div class="ts7b-tcard" style="margin:0">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">' +
            '<b style="font-size:14px">الأوراق</b>' +
            '<span class="pt-badge ' + papersHolderBadgeClass(holder) + '">' + eh(holderTxt) + '</span>' +
          '</div>' +
          renderCourierPapersActionsOnly(ticket) +
        '</div>' +
        (ticket.staff_notes ? '<div class="ts7b-tcard" style="margin:0"><b style="font-size:14px;color:var(--burg,#881337)">ملاحظة</b><div style="font-size:12.5px">' + eh(ticket.staff_notes) + '</div></div>' : '') +
        (ticket.summary_comment ? '<div class="ts7b-tcard" style="margin:0"><b style="font-size:12.5px">ملخص المكالمة</b><div style="font-size:14px;line-height:1.65;white-space:pre-wrap">' + eh(ticket.summary_comment) + '</div></div>' : '') +
      '</div>';

    var host = $('courier-app') || document.body;
    host.appendChild(wrap);
    wrap.addEventListener('click', function (ev) {
      if (ev.target && ev.target.closest && ev.target.closest('#pt-cdet-close')) {
        closeCourierTicketDetailModal();
      }
    });
  }

  function closeCourierDeliverCustomerModal() {
    var m = $('pt-papers-cust-modal');
    if (m) m.remove();
  }

  function openCourierDeliverCustomerModal(ticket) {
    if (!ticket) return;
    closeCourierDeliverCustomerModal();
    var wrap = document.createElement('div');
    wrap.id = 'pt-papers-cust-modal';
    wrap.className = 'pt-modal-backdrop';
    wrap.innerHTML =
      '<div class="pt-modal-box" role="dialog" aria-modal="true">' +
        '<div class="pt-head">' +
          '<b style="font-size:15px;color:#2563eb">تسليم الأوراق للعميل</b>' +
          '<button type="button" class="pt-btn pt-btn-sec" id="pt-pcust-close" style="padding:4px 10px">✕</button>' +
        '</div>' +
        '<div class="pt-sub">العميل: <b>' + eh(ticket.client_name) + '</b> (<span dir="ltr">' + eh(ticket.sd_request_id) + '</span>) — يتأكد التسليم فوراً باسم المستلم.</div>' +
        '<div class="pt-field-wrap">' +
          '<label class="pt-label" for="pt-pcust-name">اسم المستلم * (من 2 إلى 80 حرف)</label>' +
          '<input id="pt-pcust-name" class="pt-input" type="text" maxlength="80" value="' + eh(ticket.client_name || '') + '" placeholder="اكتب اسم من استلم الأوراق">' +
        '</div>' +
        '<div class="pt-field-wrap">' +
          '<label class="pt-label" for="pt-pcust-note">ملاحظة اختيارية</label>' +
          '<input id="pt-pcust-note" class="pt-input" type="text" maxlength="300" placeholder="مثال: استلمها أخو العميل">' +
        '</div>' +
        '<div style="display:flex;justify-content:flex-end;gap:8px">' +
          '<button type="button" class="pt-btn pt-btn-sec" id="pt-pcust-abort">تراجع</button>' +
          '<button type="button" class="pt-btn pt-btn-papers-pri" id="pt-pcust-confirm">تأكيد التسليم للعميل</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);
    var inp = $('pt-pcust-name');
    if (inp) { inp.focus(); inp.select(); }

    wrap.addEventListener('click', async function (ev) {
      if (ev.target === wrap || ev.target.id === 'pt-pcust-close' || ev.target.id === 'pt-pcust-abort') {
        closeCourierDeliverCustomerModal();
        return;
      }
      if (ev.target.id === 'pt-pcust-confirm') {
        var btn = ev.target;
        var recName = ($('pt-pcust-name') && $('pt-pcust-name').value || '').trim();
        var note = ($('pt-pcust-note') && $('pt-pcust-note').value || '').trim() || null;
        if (recName.length < 2 || recName.length > 80) {
          toast('لازم تكتب اسم المستلم (من 2 إلى 80 حرف)', 'error');
          if ($('pt-pcust-name')) $('pt-pcust-name').focus();
          return;
        }
        btn.disabled = true;
        try {
          if (!sbClient) throw new Error('لا يوجد اتصال بالسيرفر — حاول تاني');
          var res = await sbClient.rpc('papers_request_handover', {
            p_ticket_id: Number(ticket.id),
            p_to_holder: 'customer',
            p_recipient_name: recName,
            p_note: note
          });
          if (res.error) throw res.error;
          if (!res.data || !res.data.ok) throw new Error('تعذر تسجيل تسليم الأوراق');
          ticket.papers_holder = 'customer';
          ticket.papers_pending_event_id = null;
          ticket.papers_pending_to = null;
          ticket.papers_pending_from = null;
          closeCourierDeliverCustomerModal();
          renderCourierTicketsIntoBody();
          toast('تم تسجيل تسليم الأوراق للعميل بنجاح', 'success');
        } catch (err) {
          btn.disabled = false;
          toast((err && err.message) || 'تعذر تسجيل التسليم', 'error');
        }
      }
    });
  }

  function closeConvertTicketModal() {
    var m = $('pt-convert-modal');
    if (m) m.remove();
  }

  function openConvertTicketModal(ticket) {
    if (!ticket || !isManager()) return;
    closeConvertTicketModal();
    var defaultPay = ticket.payment_status === 'instapay_on_arrival'
      ? 'إنستا باي'
      : (ticket.payment_status === 'cod_cash' ? 'كاش' : 'إنستا باي');
    var payOptions = ['إنستا باي', 'كاش', 'تحويل بنكي', 'فودافون كاش'].map(function (pm) {
      return '<option value="' + eh(pm) + '"' + (pm === defaultPay ? ' selected' : '') + '>' + eh(pm) + '</option>';
    }).join('');
    var wrap = document.createElement('div');
    wrap.id = 'pt-convert-modal';
    wrap.className = 'pt-modal-backdrop';
    wrap.innerHTML =
      '<div class="pt-modal-box" role="dialog" aria-modal="true">' +
        '<div class="pt-head">' +
          '<b style="font-size:15px;color:#2563eb">تأكيد التحويل لمهمة استلام</b>' +
          '<button type="button" class="pt-btn pt-btn-sec" id="pt-conv-close" style="padding:4px 10px">✕</button>' +
        '</div>' +
        '<div class="pt-sub" style="line-height:1.7">' +
          'العميل: <b>' + eh(ticket.client_name) + '</b> (<span dir="ltr">' + eh(ticket.sd_request_id) + '</span>)<br>' +
          'المنطقة: <b>' + eh(ticket.zone || '—') + '</b> · المندوب: <b>' + eh(courierNameById(ticket.courier_id)) + '</b><br>' +
          'الإجمالي: <b>' + eh(money(ticket.total)) + '</b> · مهمة الاستلام: <b>40 ج.م</b> (تُحتسب بعد تأكيد المندوب فقط)' +
        '</div>' +
        '<div class="pt-field-wrap">' +
          '<label class="pt-label" for="pt-conv-pay">طريقة الدفع المسجّلة مع المعاملة *</label>' +
          '<select id="pt-conv-pay" class="pt-select">' + payOptions + '</select>' +
          (ticket.payment_status === 'paid'
            ? '<div class="pt-sub">التيكت مدفوع مسبقاً — تأكد من طريقة الدفع الفعلية قبل التحويل.</div>'
            : '') +
        '</div>' +
        '<div style="display:flex;justify-content:flex-end;gap:8px">' +
          '<button type="button" class="pt-btn pt-btn-sec" id="pt-conv-abort">تراجع</button>' +
          '<button type="button" class="pt-btn pt-btn-mission" id="pt-conv-confirm">تأكيد التحويل لمهمة استلام</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);

    wrap.addEventListener('click', async function (ev) {
      if (ev.target === wrap || ev.target.id === 'pt-conv-close' || ev.target.id === 'pt-conv-abort') {
        closeConvertTicketModal();
        return;
      }
      if (ev.target.id === 'pt-conv-confirm') {
        var btn = ev.target;
        var chosenPay = ($('pt-conv-pay') && $('pt-conv-pay').value) || defaultPay;
        btn.disabled = true;
        var ok = await directConvertTicket(ticket, chosenPay);
        if (ok) closeConvertTicketModal();
        else btn.disabled = false;
      }
    });
  }

  function closeCancelTicketModal() {
    st.cancelModalId = null;
    var m = $('pt-cancel-modal');
    if (m) m.remove();
  }

  function openCancelTicketModal(ticket) {
    if (!ticket || !isManager()) return;
    closeCancelTicketModal();
    st.cancelModalId = Number(ticket.id);
    var wrap = document.createElement('div');
    wrap.id = 'pt-cancel-modal';
    wrap.className = 'pt-modal-backdrop';
    wrap.innerHTML =
      '<div class="pt-modal-box" role="dialog" aria-modal="true">' +
        '<div class="pt-head">' +
          '<b style="font-size:15px;color:#dc2626">إلغاء التيكت</b>' +
          '<button type="button" class="pt-btn pt-btn-sec" id="pt-cancel-close" style="padding:4px 10px">✕</button>' +
        '</div>' +
        '<div class="pt-sub">العميل: <b>' + eh(ticket.client_name) + '</b> (<span dir="ltr">' + eh(ticket.sd_request_id) + '</span>) — الإلغاء لا يولّد مشوار ولا عمولة.</div>' +
        '<div class="pt-field-wrap">' +
          '<label class="pt-label" for="pt-cancel-reason">سبب الإلغاء * (3 حروف على الأقل)</label>' +
          '<textarea id="pt-cancel-reason" class="pt-textarea" rows="3" maxlength="500" placeholder="مثال: العميل اعتذر وألغى الطلب"></textarea>' +
        '</div>' +
        '<div style="display:flex;justify-content:flex-end;gap:8px">' +
          '<button type="button" class="pt-btn pt-btn-sec" id="pt-cancel-abort">تراجع</button>' +
          '<button type="button" class="pt-btn pt-btn-danger" id="pt-cancel-confirm">تأكيد إلغاء التيكت</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);
    var ta = $('pt-cancel-reason');
    if (ta) ta.focus();

    wrap.addEventListener('click', async function (ev) {
      if (ev.target === wrap || ev.target.id === 'pt-cancel-close' || ev.target.id === 'pt-cancel-abort') {
        closeCancelTicketModal();
        return;
      }
      if (ev.target.id === 'pt-cancel-confirm') {
        var btn = ev.target;
        var reason = ($('pt-cancel-reason') && $('pt-cancel-reason').value || '').trim();
        if (reason.length < 3) {
          toast('لازم تكتب سبب الإلغاء (3 حروف على الأقل)', 'error');
          if ($('pt-cancel-reason')) $('pt-cancel-reason').focus();
          return;
        }
        btn.disabled = true;
        try {
          if (!sbClient) throw new Error('لا يوجد اتصال بالسيرفر');
          var rc = await sbClient.rpc('pickup_ticket_cancel', {
            p_ticket_id: Number(ticket.id),
            p_reason: reason
          });
          if (rc.error) throw rc.error;
          if (!rc.data || !rc.data.ok) throw new Error('تعذر إلغاء التيكت — حاول تاني');
          ticket.status = 'cancelled';
          ticket.cancel_reason = reason;
          ticket.cancelled_at = rc.data.cancelled_at || new Date().toISOString();
          closeCancelTicketModal();
          renderTicketsList();
          if (st.detailTicketId && Number(st.detailTicketId) === Number(ticket.id)) renderTicketDetailPanel();
          toast('تم إلغاء التيكت بنجاح وإبلاغ المندوب', 'success');
        } catch (err) {
          btn.disabled = false;
          toast((err && err.message) || 'تعذر إلغاء التيكت', 'error');
        }
      }
    });
  }

  /* تحديث شاشة المندوب عند فتح الإشعار أو عودة التطبيق (focus / visibilitychange) بدون Realtime للمندوب */
  window.tsRefreshCourierTickets = function (openTab) {
    if (!isCourier()) return;
    if (openTab === 'cancelled' || openTab === 'active') st.courierTab = openTab;
    loadAndRenderCourierMyTickets(true);
  };

  function onCourierWindowResume() {
    if (!isCourier()) return;
    if (document.visibilityState && document.visibilityState !== 'visible') return;
    var now = Date.now();
    if (now - st.lastFocusRefreshAt < 5000) return;
    st.lastFocusRefreshAt = now;
    loadAndRenderCourierMyTickets(true);
  }
  window.addEventListener('focus', onCourierWindowResume);
  document.addEventListener('visibilitychange', onCourierWindowResume);

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
      pane.addEventListener('change', function (e) {
        if (e.target && e.target.id === 'pt-zone') {
          applyZoneSuggestion(e.target.value);
        }
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
        } else {
          stopTicketsRealtime();
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
        stopTicketsRealtime();
        st.detailTicketId = null; st.detailContacts = []; st.detailPapers = [];
        st.tickets = []; st.courierTickets = []; st.courierZones = {}; st.courierLoadedAt = 0; st.loaded = false;
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
