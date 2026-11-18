/* =====================================================================
   js/74-abbasiya-hub-radar.js — المرحلة 2: رادار تسليم جوازات العباسية الفوري
   - معزول تماماً في IIFE بدون لمس js/03 أو js/13 أو js/14 أو js/45 أو js/70 أو js/73.
   - قراءة فقط من request_lines عبر RPC؛ جميع التعديلات والاعتمادات عبر دوال السيرفر.
   - يعرض للمندوب كارت محطة مجمّع واحد في بوابته بدون أي أسعار أو عمولات.
   ===================================================================== */
(function () {
  'use strict';
  if (window.__abbasiyaHubRadar) return;
  window.__abbasiyaHubRadar = true;

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

  var st = {
    snap: null,
    selectedIds: {},
    selectedCourierId: null,
    winStart: '',
    winEnd: '',
    busy: false,
    loadedAt: 0,
    courierHub: null,
    courierLoadedAt: 0
  };

  function isManager() { return window.__role === 'manager'; }
  function isCourier() {
    return window.__role === 'courier' || !!(document.body && document.body.classList.contains('is-courier-mode'));
  }
  function isAllowedStaff() {
    if (window.__role === 'partner' || isCourier()) return false;
    if (document.body && document.body.classList.contains('is-partner-mode')) return false;
    var u = (typeof currentUser !== 'undefined' && currentUser) ? currentUser : window.currentUser;
    return !!u && (isManager() || window.__role === 'staff' || !window.__role);
  }

  function ensureCss() {
    if ($('ah74-style')) return;
    var s = document.createElement('style');
    s.id = 'ah74-style';
    s.textContent = [
      '.ah-card{background:var(--r-card,#ffffff);border:1px solid var(--r-bd,rgba(234,88,12,.32));border-radius:18px;padding:16px;margin-bottom:14px;color:var(--r-tx,#0f172a)}',
      'html.dark .ah-card{background:var(--r-card,#111827);border-color:rgba(234,88,12,.35);color:#f8fafc}',
      '.ah-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}',
      '.ah-title{font-size:15.5px;font-weight:700;margin:0;display:flex;align-items:center;gap:8px}',
      '.ah-sub{font-size:12px;color:var(--r-mute,#64748b);margin-top:2px}',
      '.ah-grid{display:grid;grid-template-columns:1.1fr .9fr;gap:14px}',
      '.ah-box{border:1px solid var(--r-bd,rgba(148,163,184,.25));border-radius:14px;padding:12px;display:flex;flex-direction:column;gap:8px}',
      '.ah-row{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border-radius:11px;border:1px solid var(--r-bd,rgba(148,163,184,.2))}',
      '.ah-chk-lbl{display:flex;align-items:flex-start;gap:8px;cursor:pointer;flex:1;min-width:190px}',
      '.ah-badge{display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700}',
      '.ah-badge-org{background:rgba(234,88,12,.15);color:#ea580c}',
      '.ah-badge-ok{background:rgba(16,185,129,.16);color:#059669}',
      'html.dark .ah-badge-ok{color:#34d399}',
      '.ah-badge-warn{background:rgba(245,158,11,.18);color:#d97706}',
      '.ah-input,.ah-select{border:1px solid var(--r-bd,rgba(148,163,184,.3));background:var(--r-bg,#f8fafc);color:var(--r-tx,#0f172a);border-radius:10px;padding:7px 10px;font-size:12.5px;font-family:inherit;outline:none}',
      'html.dark .ah-input,html.dark .ah-select{background:#0b0f17;color:#f8fafc;border-color:rgba(255,255,255,.15)}',
      '.ah-btn{border:0;border-radius:10px;padding:8px 13px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:6px}',
      '.ah-btn-pri{background:var(--r-acc,#ea580c);color:#ffffff}',
      '.ah-btn-ok{background:#059669;color:#ffffff}',
      '.ah-btn-sec{background:rgba(148,163,184,.16);color:var(--r-tx,#0f172a)}',
      'html.dark .ah-btn-sec{background:rgba(255,255,255,.1);color:#f8fafc}',
      '.ah-btn:disabled{opacity:.5;cursor:not-allowed}',
      '.ah-eta-card{border:1px solid var(--r-bd,rgba(148,163,184,.25));border-radius:12px;padding:9px 11px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:8px}',
      '.ah-eta-card.active{border-color:var(--r-acc,#ea580c);background:rgba(234,88,12,.1)}',
      '.ah-courier-hub{margin:10px 12px 0;padding:13px;border-radius:16px;border:1px solid rgba(16,185,129,.45);background:rgba(16,185,129,.1);color:var(--tx,#f8fafc);font-size:12.5px}',
      '@media (max-width:860px){.ah-grid{grid-template-columns:1fr}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function fmtTime24To12(totalMins) {
    var m = Math.max(0, Math.round(totalMins)) % (24 * 60);
    var hh = Math.floor(m / 60);
    var mm = m % 60;
    var ampm = hh >= 12 ? 'م' : 'ص';
    var h12 = hh % 12;
    if (h12 === 0) h12 = 12;
    return h12 + ':' + (mm < 10 ? '0' : '') + mm + ' ' + ampm;
  }

  /* تقدير ساعة الوصول للعباسية بناءً على حركة خط السير الفعلي (أو وقت البدء الافتراضي إن لم ينطلق المندوب بعد) */
  function estimateCourierAbbasiya(c) {
    var now = new Date();
    var nowMins = now.getHours() * 60 + now.getMinutes();
    var baseMins = Math.max(nowMins, 10 * 60);
    if (c.last_event_at) {
      var ev = new Date(c.last_event_at);
      if (!isNaN(ev.getTime()) && ev.toDateString() === now.toDateString()) {
        baseMins = Math.max(nowMins, ev.getHours() * 60 + ev.getMinutes());
      }
    }
    var stops = Number(c.active_pickups || 0) + Number(c.pending_deliveries || 0);
    var routeMins = stops * 25;
    var toHubMins = 30;
    var arriveMins = baseMins + routeMins + toHubMins;
    var rounded = Math.ceil(arriveMins / 5) * 5;
    return {
      stops: stops,
      arriveMins: rounded,
      winStart: fmtTime24To12(rounded),
      winEnd: fmtTime24To12(rounded + 30),
      departed: !!c.last_event_at
    };
  }

  function copyText(txt) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(txt).catch(function () { /* ignore */ });
    }
    try {
      var ta = document.createElement('textarea');
      ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    } catch (e) { /* ignore */ }
  }

  function ensureStaffPanelHost() {
    var tab = $('tab-couriers');
    if (!tab) return null;
    var box = $('ah74-panel');
    if (!box) {
      box = document.createElement('div');
      box.id = 'ah74-panel';
      var radar = $('cop-manager-panel');
      if (radar && radar.parentElement === tab) {
        radar.insertAdjacentElement('afterend', box);
      } else {
        tab.prepend(box);
      }
      box.addEventListener('click', onStaffClick);
      box.addEventListener('change', onStaffChange);
      box.addEventListener('input', onStaffInput);
    }
    return box;
  }

  function renderStaffPanel() {
    if (!isAllowedStaff()) return;
    var box = ensureStaffPanelHost();
    if (!box) return;
    ensureCss();

    if (!st.snap) {
      box.innerHTML = '<section class="ah-card"><div class="ah-sub">جاري فحص دفعة جوازات العباسية الفوري…</div></section>';
      return;
    }

    var cands = Array.isArray(st.snap.candidates) ? st.snap.candidates : [];
    var couriers = (Array.isArray(st.snap.couriers) ? st.snap.couriers : []).map(function (c) {
      return Object.assign({}, c, { eta: estimateCourierAbbasiya(c) });
    }).sort(function (a, b) { return a.eta.arriveMins - b.eta.arriveMins; });

    if (!st.selectedCourierId && couriers.length) {
      var best = st.snap.batch && st.snap.batch.courier_id
        ? couriers.find(function (x) { return Number(x.courier_id) === Number(st.snap.batch.courier_id); }) || couriers[0]
        : couriers[0];
      st.selectedCourierId = best.courier_id;
      st.winStart = (st.snap.batch && st.snap.batch.window_start) || best.eta.winStart;
      st.winEnd = (st.snap.batch && st.snap.batch.window_end) || best.eta.winEnd;
    }

    var batch = st.snap.batch;
    var batchItems = Array.isArray(st.snap.items) ? st.snap.items : [];

    var candsHtml = cands.length
      ? cands.map(function (l) {
          var checked = !!st.selectedIds[l.line_id];
          return '<div class="ah-row">' +
            '<label class="ah-chk-lbl">' +
              '<input type="checkbox" class="ah-cand-chk" value="' + Number(l.line_id) + '"' + (checked ? ' checked' : '') + '>' +
              '<div>' +
                '<div><b>' + eh(l.client_name) + '</b> <span class="ah-badge ah-badge-org" dir="ltr">' + eh(l.transaction_id) + '</span></div>' +
                '<div class="ah-sub">' + eh(l.service) + (l.executor ? ' · المنفذ: ' + eh(l.executor) : '') + (l.phone ? ' · <span dir="ltr">' + eh(l.phone) + '</span>' : '') + '</div>' +
              '</div>' +
            '</label>' +
          '</div>';
        }).join('')
      : '<div class="ah-sub">لا توجد جوازات فوري قيد التسليم حالياً.</div>';

    var couriersHtml = couriers.length
      ? couriers.map(function (c, idx) {
          var act = Number(st.selectedCourierId) === Number(c.courier_id);
          return '<div class="ah-eta-card' + (act ? ' active' : '') + '" data-ah-courier="' + Number(c.courier_id) + '">' +
            '<div>' +
              '<div><b>' + eh(c.name) + '</b> ' + (idx === 0 ? '<span class="ah-badge ah-badge-ok">الترشيح الأنسب</span>' : '') + '</div>' +
              '<div class="ah-sub">استلام: ' + Number(c.active_pickups || 0) + ' · تسليم: ' + Number(c.pending_deliveries || 0) + ' · ' + (c.eta.departed ? 'بدأ خط السير' : 'تقديري مبدئي') + '</div>' +
            '</div>' +
            '<div style="text-align:left"><span class="ah-badge ah-badge-org">' + eh(c.eta.winStart) + ' – ' + eh(c.eta.winEnd) + '</span></div>' +
          '</div>';
        }).join('')
      : '<div class="ah-sub">مفيش مناديب نشطين حالياً.</div>';

    var callItemsHtml = batch && batchItems.length
      ? '<div class="ah-box" style="margin-top:12px">' +
          '<div class="ah-head" style="margin-bottom:4px">' +
            '<div><b>تأكيد مكالمات عملاء العباسية (' + batchItems.length + ')</b> — المندوب: <b>' + eh(batch.courier_name) + '</b> (' + eh(batch.window_start) + ' – ' + eh(batch.window_end) + ')</div>' +
            '<button type="button" class="ah-btn ah-btn-sec" data-ah-act="copymsg">نسخ رسالة الواتساب</button>' +
          '</div>' +
          batchItems.map(function (it) {
            return '<div class="ah-row">' +
              '<div>' +
                '<div><b>' + eh(it.client_name) + '</b> · <span dir="ltr">' + eh(it.phone || '—') + '</span> · <span class="ah-badge ' + (it.call_confirmed ? 'ah-badge-ok' : 'ah-badge-warn') + '">' + (it.call_confirmed ? 'تم تأكيد الميعاد ✓' : 'في انتظار المكالمة') + '</span></div>' +
                '<div class="ah-sub">' + eh(it.service_name) + ' · <span dir="ltr">' + eh(it.transaction_id) + '</span>' + (it.call_note ? ' · ' + eh(it.call_note) : '') + '</div>' +
              '</div>' +
              '<button type="button" class="ah-btn ' + (it.call_confirmed ? 'ah-btn-sec' : 'ah-btn-ok') + '" data-ah-call="' + Number(it.id) + '" data-next="' + (it.call_confirmed ? '0' : '1') + '">' + (it.call_confirmed ? 'إلغاء التأكيد' : 'تمت المكالمة وتأكيد الميعاد') + '</button>' +
            '</div>';
          }).join('') +
        '</div>'
      : '';

    box.innerHTML =
      '<section class="ah-card">' +
        '<div class="ah-head">' +
          '<div>' +
            '<h3 class="ah-title">رادار تسليم جوازات العباسية الفوري <span class="ah-badge ah-badge-org">' + cands.length + ' مفتوح</span></h3>' +
            '<div class="ah-sub">علّم على الجوازات اللي خلصت من المنفذ، وقارن أوقات المناديب من خط السير ثم اعتمد الميعاد (للمدير فقط).</div>' +
          '</div>' +
          '<button type="button" class="ah-btn ah-btn-sec" id="ah-refresh-btn">تحديث الرادار</button>' +
        '</div>' +
        '<div class="ah-grid">' +
          '<div class="ah-box"><b>1) الجوازات الجاهزة للتسليم النهارده</b>' + candsHtml + '</div>' +
          '<div class="ah-box"><b>2) ترشيح المندوب وحسبة ميعاد العباسية</b>' + couriersHtml +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px">' +
              '<input id="ah-win-start" class="ah-input" placeholder="من الساعة (مثال: 5:20 م)" value="' + eh(st.winStart) + '">' +
              '<input id="ah-win-end" class="ah-input" placeholder="إلى الساعة (مثال: 5:50 م)" value="' + eh(st.winEnd) + '">' +
            '</div>' +
            (isManager()
              ? '<button type="button" id="ah-approve-btn" class="ah-btn ah-btn-pri" style="width:100%;justify-content:center">اعتماد المندوب والميعاد وإرسال للمندوب</button>'
              : '<div class="ah-sub">اعتماد الميعاد وإرساله للمندوب متاح للمدير فقط.</div>') +
          '</div>' +
        '</div>' +
        callItemsHtml +
      '</section>';
  }

  async function loadStaffSnap() {
    if (!sbClient || !isAllowedStaff()) return;
    st.loadedAt = Date.now();
    var r = await sbClient.rpc('abbasiya_hub_snapshot');
    if (r.error) throw r.error;
    st.snap = r.data || null;
    if (st.snap && Array.isArray(st.snap.items) && st.snap.items.length) {
      st.selectedIds = {};
      st.snap.items.forEach(function (it) { st.selectedIds[it.line_id] = true; });
    } else if (st.snap && Array.isArray(st.snap.candidates)) {
      st.snap.candidates.forEach(function (c) {
        // افتراضياً غير مختار: الموظف يعلّم بإيده الجوازات اللي المنفذ خلّصها فعلاً
        if (st.selectedIds[c.line_id] === undefined) st.selectedIds[c.line_id] = false;
      });
    }
    renderStaffPanel();
  }

  /* كارت محطة جوازات العباسية داخل بوابة المندوب (بدون أي أسعار أو عمولات) */
  async function loadAndRenderCourierHub() {
    if (!sbClient || !isCourier()) return;
    var app = $('courier-app');
    if (!app) return;
    if (st.courierLoadedAt && (Date.now() - st.courierLoadedAt < 60000)) return;
    st.courierLoadedAt = Date.now();
    try {
      ensureCss();
      var r = await sbClient.rpc('courier_my_abbasiya_hub');
      if (r.error) return;
      st.courierHub = r.data;
      var box = $('ah74-courier-hub');
      if (!st.courierHub || !Array.isArray(st.courierHub.items) || !st.courierHub.items.length) {
        if (box) box.remove();
        return;
      }
      if (!box) {
        box = document.createElement('section');
        box.id = 'ah74-courier-hub';
        box.className = 'ah-courier-hub';
        var host = $('pt73-courier-tickets') || $('cp-v12-top-banners') || app;
        host.insertAdjacentElement('afterend', box);
      }
      var h = st.courierHub;
      box.innerHTML =
        '<div style="font-weight:700;margin-bottom:6px">محطة تسليم مجمّعة: ' + eh(h.hub_name) + ' (' + eh(h.window_start) + ' – ' + eh(h.window_end) + ') · ' + h.items.length + ' عملاء</div>' +
        h.items.map(function (it) {
          var badge = it.call_confirmed
            ? '<span style="background:rgba(16,185,129,.25);color:#34d399;padding:2px 7px;border-radius:999px;font-size:11px;font-weight:700">تم تأكيد الميعاد مع العميل ✓</span>'
            : '<span style="background:rgba(245,158,11,.25);color:#fbbf24;padding:2px 7px;border-radius:999px;font-size:11px;font-weight:700">جاري تأكيد المكتب مع العميل</span>';
          return '<div style="padding:7px 0;border-top:1px solid rgba(255,255,255,.12)">' +
            '<div><b>' + eh(it.client_name) + '</b> · <span dir="ltr">' + eh(it.phone || '') + '</span> · ' + badge + '</div>' +
            '<div style="font-size:11.5px;opacity:.88;margin-top:2px">' + eh(it.service_name) + ' · <span dir="ltr">' + eh(it.transaction_id) + '</span>' + (it.call_note ? ' · ' + eh(it.call_note) : '') + '</div>' +
          '</div>';
        }).join('');
    } catch (e) { /* ignore */ }
  }

  async function onStaffClick(e) {
    var t = e.target;
    if (!t) return;
    if (t.id === 'ah-refresh-btn') {
      try { await loadStaffSnap(); toast('تم تحديث رادار العباسية ✓'); } catch (err) { toast(err.message || 'تعذر التحديث', 'error'); }
      return;
    }
    var cCard = t.closest ? t.closest('[data-ah-courier]') : null;
    if (cCard) {
      st.selectedCourierId = Number(cCard.dataset.ahCourier);
      var cObj = (st.snap && st.snap.couriers || []).find(function (x) { return Number(x.courier_id) === st.selectedCourierId; });
      if (cObj) {
        var eta = estimateCourierAbbasiya(cObj);
        st.winStart = eta.winStart;
        st.winEnd = eta.winEnd;
      }
      renderStaffPanel();
      return;
    }
    if (t.id === 'ah-approve-btn') {
      if (!isManager()) return toast('اعتماد الميعاد للمدير فقط', 'error');
      var lineIds = Object.keys(st.selectedIds).filter(function (k) { return st.selectedIds[k]; }).map(Number);
      if (!lineIds.length) return toast('اختار جواز واحد جاهز على الأقل', 'error');
      if (!st.selectedCourierId) return toast('اختار المندوب الأول', 'error');
      var ws = ($('ah-win-start') && $('ah-win-start').value.trim()) || st.winStart;
      var we = ($('ah-win-end') && $('ah-win-end').value.trim()) || st.winEnd;
      if (!ws || !we) return toast('حدد ميعاد الوصول من وإلى', 'error');
      t.disabled = true;
      try {
        var r = await sbClient.rpc('abbasiya_hub_approve', {
          p_day: (st.snap && st.snap.day) || null,
          p_courier_id: st.selectedCourierId,
          p_window_start: ws,
          p_window_end: we,
          p_line_ids: lineIds,
          p_notes: null
        });
        if (r.error) return toast(r.error.message || 'تعذر الاعتماد', 'error');
        await loadStaffSnap();
        toast('تم اعتماد الميعاد وإرسال محطة العباسية للمندوب ✓');
      } finally { t.disabled = false; }
      return;
    }
    var callBtn = t.closest ? t.closest('[data-ah-call]') : null;
    if (callBtn) {
      callBtn.disabled = true;
      try {
        var nextVal = callBtn.dataset.next === '1';
        var cr = await sbClient.rpc('abbasiya_hub_mark_called', {
          p_item_id: Number(callBtn.dataset.ahCall),
          p_called: nextVal,
          p_note: null
        });
        if (cr.error) return toast(cr.error.message || 'تعذر حفظ التأكيد', 'error');
        await loadStaffSnap();
        toast(nextVal ? 'تم تأكيد المكالمة وظهر للمندوب ✓' : 'تم إلغاء التأكيد');
      } finally { callBtn.disabled = false; }
      return;
    }
    if (t.dataset && t.dataset.ahAct === 'copymsg' && st.snap && st.snap.batch) {
      var b = st.snap.batch;
      var msg = 'أهلاً بحضرتك من شركة تساهيل، جواز السفر جاهز للتسليم اليوم أمام جوازات العباسية في الميعاد من ' + b.window_start + ' إلى ' + b.window_end + ' مع المندوب ' + b.courier_name + '.';
      copyText(msg);
      toast('تم نسخ رسالة الواتساب ✓');
    }
  }

  function onStaffChange(e) {
    if (e.target && e.target.classList && e.target.classList.contains('ah-cand-chk')) {
      st.selectedIds[Number(e.target.value)] = !!e.target.checked;
    }
  }
  function onStaffInput(e) {
    if (e.target && e.target.id === 'ah-win-start') st.winStart = e.target.value;
    if (e.target && e.target.id === 'ah-win-end') st.winEnd = e.target.value;
  }

  function wrap(name, fn) {
    var orig = window[name];
    if (typeof orig === 'function' && !orig['__ah74Wrapped']) {
      var w = fn(orig);
      w['__ah74Wrapped'] = true;
      window[name] = w;
    }
  }

  wrap('switchTab', function (orig) {
    return function (id) {
      var res = orig.apply(this, arguments);
      if (id === 'couriers' && isAllowedStaff()) {
        setTimeout(function () {
          loadStaffSnap().catch(function (err) {
            var box = ensureStaffPanelHost();
            if (box) box.innerHTML = '<section class="ah-card"><div class="ah-sub">تأكد من تشغيل ملف sql/abbasiya-hub-radar.sql في Supabase. (' + eh(err && err.message) + ')</div></section>';
          });
        }, 120);
      }
      return res;
    };
  });

  wrap('loadInitialData', function (orig) {
    return async function () {
      var r = await orig.apply(this, arguments);
      if (isCourier()) setTimeout(loadAndRenderCourierHub, 250);
      return r;
    };
  });

  wrap('handleLogout', function (orig) {
    return function () {
      st.snap = null; st.courierHub = null; st.courierLoadedAt = 0; st.selectedIds = {};
      var b1 = $('ah74-panel'), b2 = $('ah74-courier-hub');
      if (b1) b1.remove();
      if (b2) b2.remove();
      return orig.apply(this, arguments);
    };
  });

  if (isCourier()) setTimeout(loadAndRenderCourierHub, 250);
})();
