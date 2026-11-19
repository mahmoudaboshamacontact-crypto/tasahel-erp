/* =====================================================================
   js/78-preview-synthetic-mode.js
   وضع معاينة معزول ببيانات وهمية فقط.
   التشغيل: أضف ?tasahil_preview=synthetic إلى رابط المعاينة.
   لا يستخدم Supabase ولا localStorage ولا يرسل بيانات حقيقية.
   ===================================================================== */
(function () {
  'use strict';

  var params;
  try { params = new URLSearchParams(window.location.search); }
  catch (_) { return; }
  if (params.get('tasahil_preview') !== 'synthetic') return;
  if (window.__tasahilSyntheticPreviewActive) return;
  window.__tasahilSyntheticPreviewActive = true;

  var SUPABASE_HOST = 'avehvjqifswsyayckpvx.supabase.co';
  var originalFetch = window.fetch;
  var originalXhrOpen = XMLHttpRequest.prototype.open;
  var originalXhrSend = XMLHttpRequest.prototype.send;
  var originalWebSocket = window.WebSocket;
  var originalCreateClient = window.supabase && window.supabase.createClient;

  function isSupabaseUrl(value) {
    try {
      var u = new URL(String(value), window.location.href);
      return u.hostname === SUPABASE_HOST || /\.supabase\.co$/i.test(u.hostname);
    } catch (_) {
      return /\.supabase\.co(?:\/|$)/i.test(String(value || ''));
    }
  }

  /* طبقة منع احتياطية: حتى لو استدعى كود آخر Supabase بالخطأ، الطلب لا يخرج. */
  if (typeof originalFetch === 'function') {
    window.fetch = function (input, init) {
      var url = input && input.url ? input.url : input;
      if (isSupabaseUrl(url)) {
        return Promise.reject(new Error('تم منع الاتصال بقاعدة البيانات في وضع البيانات التجريبية.'));
      }
      return originalFetch.call(this, input, init);
    };
  }

  XMLHttpRequest.prototype.open = function (method, url) {
    this.__tasahilBlockedSupabase = isSupabaseUrl(url);
    if (this.__tasahilBlockedSupabase) {
      this.__tasahilBlockedMethod = method;
      this.__tasahilBlockedUrl = String(url);
      return;
    }
    return originalXhrOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    if (this.__tasahilBlockedSupabase) {
      /* لا نعدّل خصائص XHR للقراءة فقط؛ نُبلغ المستدعي بالفشل فقط. */
      if (typeof this.onerror === 'function') this.onerror(new Event('error'));
      if (typeof this.onloadend === 'function') this.onloadend(new Event('loadend'));
      return;
    }
    return originalXhrSend.apply(this, arguments);
  };

  if (typeof originalWebSocket === 'function') {
    window.WebSocket = function (url, protocols) {
      if (isSupabaseUrl(url)) throw new Error('تم منع اتصال Realtime في وضع البيانات التجريبية.');
      return protocols ? new originalWebSocket(url, protocols) : new originalWebSocket(url);
    };
    window.WebSocket.prototype = originalWebSocket.prototype;
    window.WebSocket.CONNECTING = originalWebSocket.CONNECTING;
    window.WebSocket.OPEN = originalWebSocket.OPEN;
    window.WebSocket.CLOSING = originalWebSocket.CLOSING;
    window.WebSocket.CLOSED = originalWebSocket.CLOSED;
  }

  if (window.supabase && typeof originalCreateClient === 'function') {
    window.supabase.createClient = function () {
      throw new Error('إنشاء عميل Supabase غير مسموح في وضع المعاينة التجريبية.');
    };
  }

  /* منع فحص الجلسة والتحميل التلقائي من التطبيق الأصلي في هذا الوضع فقط. */
  window.checkSession = function () {};
  window.initSupabase = function () { return false; };
  window.handleLogin = function (event) {
    if (event && event.preventDefault) event.preventDefault();
    showPreviewNotice('تسجيل الدخول الحقيقي متوقف في وضع البيانات التجريبية.');
    return false;
  };

  var records = [
    { id: 'TX-DEMO-001', client: 'عميل تجريبي ١', service: 'جواز سفر عادي', status: 'قيد التنفيذ', owner: 'موظف تجريبي', date: '١٩ نوفمبر' },
    { id: 'TX-DEMO-002', client: 'عميل تجريبي ٢', service: 'شهادة ميلاد', status: 'جاهز للتسليم', owner: 'موظف تجريبي', date: '١٩ نوفمبر' },
    { id: 'TX-DEMO-003', client: 'عميل تجريبي ٣', service: 'تصديق خارجية', status: 'تم التسليم', owner: 'موظف تجريبي', date: '١٨ نوفمبر' },
    { id: 'TX-DEMO-004', client: 'عميل تجريبي ٤', service: 'بطاقة رقم قومي', status: 'مراجعة', owner: 'موظف تجريبي', date: '١٨ نوفمبر' }
  ];
  var currentView = 'home';
  var currentRole = 'manager';
  var root = null;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function showPreviewNotice(message) {
    var notice = document.getElementById('tsp-notice');
    if (!notice) return;
    notice.textContent = message;
    notice.classList.add('is-visible');
    window.setTimeout(function () { notice.classList.remove('is-visible'); }, 2800);
  }

  function addStyle() {
    if (document.getElementById('tsp-style')) return;
    var style = document.createElement('style');
    style.id = 'tsp-style';
    style.textContent = [
      ':root{--r-bg:#f7f3ee;--r-card:#fff;--r-ink:#30251e;--r-muted:#87796e;--r-line:#eadfd5;--r-acc:#f47738;--r-soft:#fff0e7}',
      'html.dark{--r-bg:#171310;--r-card:#211b17;--r-ink:#f5eee8;--r-muted:#b9a99d;--r-line:#3a2e26;--r-acc:#ff8a4c;--r-soft:#382419}',
      'body:has(#tasahil-preview-root){margin:0!important;background:var(--r-bg)!important;color:var(--r-ink)!important;font-family:"IBM Plex Sans Arabic",Tahoma,sans-serif!important}',
      'body:has(#tasahil-preview-root)>*:not(#tasahil-preview-root){display:none!important}',
      '#tasahil-preview-root{position:fixed;inset:0;z-index:2147483000;overflow:auto;background:var(--r-bg);color:var(--r-ink);direction:rtl}',
      '#tasahil-preview-root *{box-sizing:border-box}',
      '.tsp-shell{max-width:1240px;margin:auto;padding:18px}',
      '.tsp-top{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;padding:15px 18px;border:1px solid var(--r-line);border-radius:18px;background:var(--r-card)}',
      '.tsp-brand{display:flex;align-items:center;gap:11px}.tsp-logo{width:42px;height:42px;border-radius:13px;background:var(--r-soft);color:var(--r-acc);display:grid;place-items:center;font-size:21px;font-weight:900}',
      '.tsp-title{font-size:18px;font-weight:900}.tsp-sub{font-size:12px;color:var(--r-muted);margin-top:2px}',
      '.tsp-state{display:inline-flex;align-items:center;gap:7px;border:1px solid #d6ead9;background:#effaf0;color:#28713a;padding:7px 11px;border-radius:999px;font-size:11px;font-weight:800}',
      '.tsp-dot{width:7px;height:7px;border-radius:50%;background:#28a745}',
      '.tsp-layout{display:grid;grid-template-columns:220px minmax(0,1fr);gap:16px;margin-top:16px}',
      '.tsp-nav,.tsp-main{border:1px solid var(--r-line);border-radius:18px;background:var(--r-card);padding:14px}',
      '.tsp-nav{align-self:start;display:flex;flex-direction:column;gap:6px}.tsp-nav button{border:0;background:transparent;color:var(--r-muted);text-align:right;padding:12px;border-radius:11px;font:inherit;font-size:13px;font-weight:700;cursor:pointer}',
      '.tsp-nav button.active{background:var(--r-soft);color:var(--r-acc)}',
      '.tsp-role{margin-top:14px;padding-top:13px;border-top:1px solid var(--r-line)}.tsp-role label{display:block;font-size:11px;color:var(--r-muted);margin-bottom:7px}',
      '.tsp-role select,.tsp-field{width:100%;border:1px solid var(--r-line);background:var(--r-bg);color:var(--r-ink);border-radius:10px;padding:10px;font:inherit;font-size:13px}',
      '.tsp-heading{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px}.tsp-heading h2{font-size:19px;margin:0}.tsp-muted{font-size:12px;color:var(--r-muted)}',
      '.tsp-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.tsp-card{border:1px solid var(--r-line);background:var(--r-card);border-radius:15px;padding:14px;min-width:0}.tsp-card-label{font-size:11px;color:var(--r-muted)}.tsp-card-value{font-size:25px;font-weight:900;margin-top:7px}.tsp-card-note{font-size:10px;color:var(--r-muted);margin-top:4px}',
      '.tsp-panel{margin-top:14px;border:1px solid var(--r-line);border-radius:15px;overflow:hidden}.tsp-panel-head{padding:13px 15px;border-bottom:1px solid var(--r-line);font-weight:800;font-size:13px}.tsp-table-wrap{overflow:auto}.tsp-table{width:100%;border-collapse:collapse;min-width:600px;font-size:12px}.tsp-table th,.tsp-table td{text-align:right;padding:12px 14px;border-bottom:1px solid var(--r-line);white-space:nowrap}.tsp-table th{color:var(--r-muted);font-size:11px;background:var(--r-bg)}.tsp-table tr:last-child td{border-bottom:0}',
      '.tsp-badge{display:inline-flex;padding:5px 9px;border-radius:999px;background:var(--r-soft);color:var(--r-acc);font-size:10px;font-weight:800}',
      '.tsp-btn{border:0;background:var(--r-acc);color:white;border-radius:11px;padding:10px 14px;font:inherit;font-size:12px;font-weight:800;cursor:pointer}.tsp-btn.secondary{background:var(--r-soft);color:var(--r-acc)}',
      '.tsp-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;max-width:680px}.tsp-form label{display:block;font-size:12px;font-weight:700;margin-bottom:6px}.tsp-form .full{grid-column:1/-1}',
      '.tsp-notice{position:fixed;bottom:22px;left:50%;transform:translate(-50%,20px);opacity:0;pointer-events:none;background:#30251e;color:#fff;padding:11px 16px;border-radius:12px;font-size:12px;transition:opacity .15s,transform .15s;z-index:5}.tsp-notice.is-visible{opacity:1;transform:translate(-50%,0)}',
      '.tsp-foot{margin-top:15px;text-align:center;color:var(--r-muted);font-size:10px}',
      '@media(max-width:800px){.tsp-layout{grid-template-columns:1fr}.tsp-nav{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}.tsp-nav button{text-align:center;padding:10px 5px}.tsp-role{grid-column:1/-1}.tsp-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}',
      '@media(max-width:480px){.tsp-shell{padding:10px}.tsp-grid{gap:7px}.tsp-card{padding:11px}.tsp-card-value{font-size:21px}.tsp-form{grid-template-columns:1fr}.tsp-form .full{grid-column:auto}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function navButton(id, label) {
    return '<button type="button" data-tsp-view="' + id + '" class="' + (currentView === id ? 'active' : '') + '">' + label + '</button>';
  }

  function renderHome() {
    return '<div class="tsp-heading"><div><h2>نظرة عامة</h2><div class="tsp-muted">ملخص تجريبي لبيانات تشغيل وهمية</div></div><span class="tsp-badge">تحديث يدوي تجريبي</span></div>' +
      '<div class="tsp-grid">' +
      '<div class="tsp-card"><div class="tsp-card-label">طلبات اليوم</div><div class="tsp-card-value">٢٨</div><div class="tsp-card-note">رقم تجريبي</div></div>' +
      '<div class="tsp-card"><div class="tsp-card-label">قيد التنفيذ</div><div class="tsp-card-value">١٢</div><div class="tsp-card-note">رقم تجريبي</div></div>' +
      '<div class="tsp-card"><div class="tsp-card-label">جاهز للتسليم</div><div class="tsp-card-value">٧</div><div class="tsp-card-note">رقم تجريبي</div></div>' +
      '<div class="tsp-card"><div class="tsp-card-label">تم التسليم</div><div class="tsp-card-value">٩</div><div class="tsp-card-note">رقم تجريبي</div></div>' +
      '</div>' + renderTable('أحدث الطلبات التجريبية', 4);
  }

  function renderTable(title, count) {
    var list = records.slice(0, count || records.length);
    var rows = list.map(function (r) {
      return '<tr><td dir="ltr">' + esc(r.id) + '</td><td>' + esc(r.client) + '</td><td>' + esc(r.service) + '</td><td><span class="tsp-badge">' + esc(r.status) + '</span></td><td>' + esc(r.owner) + '</td></tr>';
    }).join('');
    return '<section class="tsp-panel"><div class="tsp-panel-head">' + title + '</div><div class="tsp-table-wrap"><table class="tsp-table"><thead><tr><th>رقم تجريبي</th><th>العميل</th><th>الخدمة</th><th>الحالة</th><th>المسؤول</th></tr></thead><tbody>' + rows + '</tbody></table></div></section>';
  }

  function renderRequests() {
    return '<div class="tsp-heading"><div><h2>المعاملات التجريبية</h2><div class="tsp-muted">كل السجلات هنا وهمية ومحفوظة في ذاكرة الصفحة فقط</div></div><button type="button" class="tsp-btn" data-tsp-view="new">إضافة طلب تجريبي</button></div>' + renderTable('قائمة الطلبات', records.length);
  }

  function renderNew() {
    return '<div class="tsp-heading"><div><h2>طلب جديد تجريبي</h2><div class="tsp-muted">جرّب إدخال بيانات غير حقيقية؛ مش هيتم إرسالها لأي مكان</div></div></div>' +
      '<form class="tsp-form" id="tsp-new-form">' +
      '<div><label for="tsp-client">اسم تجريبي</label><input class="tsp-field" id="tsp-client" maxlength="60" required placeholder="عميل تجريبي"></div>' +
      '<div><label for="tsp-service">الخدمة</label><select class="tsp-field" id="tsp-service"><option>جواز سفر عادي</option><option>شهادة ميلاد</option><option>تصديق خارجية</option><option>بطاقة رقم قومي</option></select></div>' +
      '<div class="full"><button class="tsp-btn" type="submit">حفظ داخل المعاينة فقط</button></div></form>';
  }

  function renderCouriers() {
    return '<div class="tsp-heading"><div><h2>متابعة المندوبين</h2><div class="tsp-muted">أسماء وأرقام تجريبية غير مرتبطة بأي موظف حقيقي</div></div></div>' +
      '<div class="tsp-grid">' +
      '<div class="tsp-card"><div class="tsp-card-label">مندوب تجريبي ١</div><div class="tsp-card-value">٤</div><div class="tsp-card-note">مشاوير اليوم</div></div>' +
      '<div class="tsp-card"><div class="tsp-card-label">مندوب تجريبي ٢</div><div class="tsp-card-value">٣</div><div class="tsp-card-note">مشاوير اليوم</div></div>' +
      '<div class="tsp-card"><div class="tsp-card-label">قيد التوصيل</div><div class="tsp-card-value">٢</div><div class="tsp-card-note">حالة تجريبية</div></div>' +
      '<div class="tsp-card"><div class="tsp-card-label">تم التسليم</div><div class="tsp-card-value">٥</div><div class="tsp-card-note">حالة تجريبية</div></div>' +
      '</div>';
  }

  function renderContent() {
    if (currentView === 'requests') return renderRequests();
    if (currentView === 'new') return renderNew();
    if (currentView === 'couriers') return renderCouriers();
    if (currentView === 'team') return '<div class="tsp-heading"><div><h2>فريق العمل</h2><div class="tsp-muted">بيانات تعريفية وهمية للاختبار</div></div></div>' + renderTable('سجلات تجريبية', records.length);
    return renderHome();
  }

  function render() {
    if (!root) return;
    root.innerHTML =
      '<div class="tsp-shell"><header class="tsp-top"><div class="tsp-brand"><div class="tsp-logo">ت</div><div><div class="tsp-title">تساهيل | وضع المعاينة</div><div class="tsp-sub">واجهة اختبار مستقلة ببيانات وهمية</div></div></div><span class="tsp-state"><span class="tsp-dot"></span> معزول عن قاعدة البيانات</span></header>' +
      '<div class="tsp-layout"><aside class="tsp-nav">' +
      navButton('home', 'الرئيسية') + navButton('requests', 'المعاملات') + navButton('new', 'طلب جديد') + navButton('couriers', 'المندوبين') + navButton('team', 'فريق العمل') +
      '<div class="tsp-role"><label for="tsp-role-select">تبديل الدور التجريبي</label><select id="tsp-role-select"><option value="manager"' + (currentRole === 'manager' ? ' selected' : '') + '>مدير تجريبي</option><option value="staff"' + (currentRole === 'staff' ? ' selected' : '') + '>موظف تجريبي</option><option value="courier"' + (currentRole === 'courier' ? ' selected' : '') + '>مندوب تجريبي</option></select></div>' +
      '</aside><main class="tsp-main">' + renderContent() + '</main></div>' +
      '<div class="tsp-foot">بيانات افتراضية بالكامل · لا تسجيل دخول · لا اتصال بـ Supabase · لا حفظ بعد إغلاق الصفحة</div></div><div id="tsp-notice" class="tsp-notice" role="status" aria-live="polite"></div>';
  }

  function mount() {
    addStyle();
    root = document.createElement('div');
    root.id = 'tasahil-preview-root';
    document.body.appendChild(root);
    render();
    root.addEventListener('click', function (event) {
      var button = event.target.closest('[data-tsp-view]');
      if (!button) return;
      currentView = button.getAttribute('data-tsp-view') || 'home';
      render();
    });
    root.addEventListener('change', function (event) {
      if (event.target && event.target.id === 'tsp-role-select') {
        currentRole = event.target.value;
        showPreviewNotice('تم تبديل الدور التجريبي فقط.');
      }
    });
    root.addEventListener('submit', function (event) {
      if (!event.target || event.target.id !== 'tsp-new-form') return;
      event.preventDefault();
      var client = (document.getElementById('tsp-client').value || '').trim();
      var service = document.getElementById('tsp-service').value;
      if (!client) return;
      records.unshift({
        id: 'TX-DEMO-' + String(records.length + 1).padStart(3, '0'),
        client: client,
        service: service,
        status: 'مراجعة',
        owner: 'موظف تجريبي',
        date: 'الآن'
      });
      currentView = 'requests';
      render();
      showPreviewNotice('اتضاف الطلب داخل المعاينة فقط، وماتبعتش لأي سيرفر.');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
})();
