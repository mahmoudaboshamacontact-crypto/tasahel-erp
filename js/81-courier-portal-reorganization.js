/* بوابة المندوب — إعادة تنظيم التنقل والأدوات (مرحلة الواجهة)
   يحافظ على الوظائف الأصلية ويعيد ترتيب الوصول إليها دون تغيير منطق العمليات أو الـ RPC.
*/
(function () {
  'use strict';
  if (window.__cpPortalReorg81) return;
  window.__cpPortalReorg81 = true;

  var STYLE_ID = 'cp81-reorg-style';
  var MENU_ID = 'cp81-side-menu';
  var ROOT_ID = 'courier-app';

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '#courier-app .cpn-head{display:flex;align-items:center;gap:8px}',
      '#courier-app .cpn-head #cp-who-box{flex:1;min-width:0}',
      '#courier-app .cp81-menu-btn{width:38px;height:38px;flex:0 0 38px;border:1px solid var(--bd);border-radius:12px;background:var(--fld);color:var(--tx);display:inline-flex;align-items:center;justify-content:center;font-size:18px;cursor:pointer}',
      '#courier-app .cp81-menu{position:absolute;z-index:100030;top:calc(100% + 7px);inset-inline-end:10px;width:min(310px,calc(100vw - 24px));max-height:min(76vh,620px);overflow:auto;padding:10px;border:1px solid var(--bd);border-radius:18px;background:var(--card);color:var(--tx);box-shadow:0 18px 45px rgba(0,0,0,.28)}',
      '#courier-app .cp81-menu[hidden]{display:none!important}',
      '#courier-app .cp81-menu-title{padding:8px 9px 5px;color:var(--mu);font-size:10px;font-weight:800}',
      '#courier-app .cp81-menu button{width:100%;min-height:42px;display:flex;align-items:center;gap:10px;padding:9px 11px;border:0;border-radius:11px;background:transparent;color:var(--tx);font:600 12.5px inherit;text-align:start;cursor:pointer}',
      '#courier-app .cp81-menu button:active,#courier-app .cp81-menu button:hover{background:var(--fld)}',
      '#courier-app .cp81-menu button i{width:18px;text-align:center;color:var(--ac)}',
      '#courier-app .cp81-menu-sep{height:1px;background:var(--bd);margin:6px 2px}',
      '#courier-app .cp81-toolbar{display:flex;gap:8px;padding:8px 12px;margin:0 -16px 10px;border-bottom:1px solid var(--bd);background:var(--card)}',
      '#courier-app .cp81-toolbar button{flex:1;min-height:40px;display:flex;align-items:center;justify-content:center;gap:8px;border:1px solid var(--bd);border-radius:12px;background:var(--fld);color:var(--tx);font:700 12px inherit;white-space:nowrap;cursor:pointer}',
      '#courier-app .cp81-toolbar button[data-cp4-act="toggle-driving"]{border-color:rgba(3,107,41,.55)}',
      '#courier-app .cp81-toolbar button[data-cp4-act="qr-deliver-scan"]{border-color:rgba(59,130,246,.45)}',
      '#courier-app #cp4-toolkit-bar .cp4-bar{display:none!important}',
      '#courier-app #cp-hdr-info,#courier-app #cp-hdr-review,#courier-app .cpn-head>[data-tab="account"],#courier-app #cp-theme,#courier-app .cpn-head>[data-act="refresh"],#courier-app .cpn-head>[data-act="logout"]{display:none!important}',
      '#courier-app .cp-motiv,#courier-app .cpn-lb{display:none!important}',
      '@media(max-width:520px){#courier-app .cp81-toolbar{gap:6px}#courier-app .cp81-toolbar button{font-size:11.5px;min-height:42px}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function menuButton(label, action, icon, attrs) {
    return '<button type="button" ' + (attrs || '') + '><i class="fa-solid ' + icon + '"></i><span>' + label + '</span></button>';
  }

  function ensureMenu(app) {
    var head = app.querySelector('.cpn-head');
    if (!head) return;
    var who = app.querySelector('#cp-who-box');
    if (!who) return;
    var menu = app.querySelector('#' + MENU_ID);
    if (!menu) {
      var wrap = document.createElement('div');
      wrap.style.cssText = 'position:relative;flex:0 0 auto;order:2';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cp81-menu-btn';
      btn.id = 'cp81-menu-toggle';
      btn.setAttribute('aria-label', 'فتح قائمة المندوب');
      btn.setAttribute('aria-expanded', 'false');
      btn.innerHTML = '<i class="fa-solid fa-bars" aria-hidden="true"></i>';
      menu = document.createElement('div');
      menu.id = MENU_ID;
      menu.className = 'cp81-menu';
      menu.hidden = true;
      menu.innerHTML =
        '<div class="cp81-menu-title">التنقل</div>' +
        menuButton('الرئيسية', '', 'fa-house', 'data-tab="today"') +
        menuButton('مشاويري', '', 'fa-motorcycle', 'data-tab="trips"') +
        menuButton('خط السير والمحطات', '', 'fa-route', 'data-tab="route"') +
        menuButton('تيكتات الاستلام', '', 'fa-ticket', 'data-tab="tickets"') +
        menuButton('المراجعة', '', 'fa-clipboard-check', 'data-tab="review"') +
        menuButton('التواصل مع المكتب', '', 'fa-comments', 'data-tab="chat"') +
        menuButton('حسابي وكشف الحساب', '', 'fa-wallet', 'data-tab="account"') +
        '<div class="cp81-menu-sep"></div><div class="cp81-menu-title">أدوات المندوب</div>' +
        '<div id="cp81-tools-slot"></div>' +
        '<div class="cp81-menu-sep"></div><div class="cp81-menu-title">إعدادات ومساعدة</div>' +
        menuButton('ملفي الشخصي', '', 'fa-user', 'data-act="profile"') +
        menuButton('دليل الاستخدام', '', 'fa-circle-question', 'data-cp4-act="toggle-onb"') +
        menuButton('تغيير المظهر', '', 'fa-circle-half-stroke', 'data-act="theme"') +
        menuButton('تحديث البيانات', '', 'fa-rotate', 'data-act="refresh"') +
        menuButton('تسجيل الخروج', '', 'fa-right-from-bracket', 'data-act="logout"');
      wrap.appendChild(btn);
      wrap.appendChild(menu);
      head.appendChild(wrap);
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        menu.hidden = !menu.hidden;
        btn.setAttribute('aria-expanded', menu.hidden ? 'false' : 'true');
      });
      menu.addEventListener('click', function (ev) {
        var target = ev.target.closest('button');
        if (target && target.dataset.tab) menu.hidden = true;
        if (target && (target.dataset.act || target.dataset.cp4Act)) menu.hidden = true;
      });
      document.addEventListener('click', function (ev) {
        if (!wrap.contains(ev.target)) {
          menu.hidden = true;
          btn.setAttribute('aria-expanded', 'false');
        }
      });
    }
    // إعادة إظهار التابات داخل القائمة بعد أي إعادة رسم للهيدر.
    var slot = menu.querySelector('#cp81-tools-slot');
    if (slot) buildToolMenu(slot, app);
  }

  function buildToolMenu(slot, app) {
    var actions = [
      ['open-cash-closing', 'تقفيل كاش اليوم', 'fa-wallet'],
      ['open-office-signoff', 'تسليم الورق للمكتب', 'fa-file-signature'],
      ['parking-pin', 'حفظ / فتح موقع الركنة', 'fa-location-dot'],
      ['toggle-amoled', 'توفير البطارية', 'fa-moon'],
      ['toggle-thumb', 'اختيار اليد', 'fa-hand']
    ];
    if (slot.dataset.ready === '1') return;
    var html = '';
    actions.forEach(function (a) {
      html += menuButton(a[1], '', a[2], 'data-cp4-act="' + a[0] + '"');
    });
    // الأدوات التي تتغير تسميتها حسب الحالة تؤخذ من الشريط الأصلي للحفاظ على الحالة المعروضة.
    var original = app.querySelectorAll('#cp4-toolkit-bar [data-cp4-act]');
    original.forEach(function (node) {
      var act = node.getAttribute('data-cp4-act');
      if (act === 'parking-pin' || act === 'toggle-amoled' || act === 'toggle-thumb' || act === 'open-cash-closing' || act === 'open-office-signoff') {
        var match = actions.find(function (a) { return a[0] === act; });
        if (match) {
          var label = node.textContent.trim() || match[1];
          html = html.replace(new RegExp('(<button[^>]*data-cp4-act="' + act + '"[^>]*><i[^>]*></i><span>)[\\s\\S]*?(</span></button>)'), '$1' + label.replace(/[$&]/g, '$&') + '$2');
        }
      }
    });
    slot.innerHTML = html;
    slot.dataset.ready = '1';
  }

  function ensureToolbar(app) {
    var source = app.querySelector('#cp4-toolkit-bar');
    if (!source) return;
    var driving = source.querySelector('[data-cp4-act="toggle-driving"]');
    var scan = source.querySelector('[data-cp4-act="qr-deliver-scan"]');
    if (!driving || !scan) return;
    var toolbar = app.querySelector('#cp81-toolbar');
    if (!toolbar) {
      toolbar = document.createElement('div');
      toolbar.id = 'cp81-toolbar';
      toolbar.className = 'cp81-toolbar';
      var body = app.querySelector('#cp-body');
      if (body && body.parentNode) body.parentNode.insertBefore(toolbar, body);
      else source.parentNode.insertBefore(toolbar, source);
    }
    // استبدال الزرين عند إعادة إنشاء شريط المرحلة الرابعة، مع منع التكرار.
    if (driving.parentElement !== toolbar || scan.parentElement !== toolbar) toolbar.innerHTML = '';
    if (driving.parentElement !== toolbar) toolbar.appendChild(driving);
    if (scan.parentElement !== toolbar) toolbar.appendChild(scan);
    scan.innerHTML = '<i class="fa-solid fa-qrcode"></i><span>سكان إيصال التسليم</span>';
    source.querySelectorAll('.cp4-bar').forEach(function (bar) { bar.style.display = 'none'; });
    source.querySelectorAll('.cp4-pill').forEach(function (button) {
      if (button !== driving && button !== scan) button.style.display = 'none';
    });
    // لا نغيّر البانرات التشغيلية أو رسائل التحويل ودليل البداية.
  }

  function hideRankContent(app) {
    app.querySelectorAll('.cp-motiv').forEach(function (node) { node.style.display = 'none'; });
    app.querySelectorAll('.cpn-lb').forEach(function (node) {
      var card = node.closest('.cpn-card');
      if (card) card.style.display = 'none';
      else node.style.display = 'none';
    });
    // إخفاء أي رابط قديم للترتيب دون المساس بمحتوى الحساب أو كشف الحساب.
    app.querySelectorAll('[data-tab="rank"]').forEach(function (node) {
      node.style.display = 'none';
    });
  }

  function apply() {
    var app = document.getElementById(ROOT_ID);
    if (!app || app.classList.contains('hidden')) return;
    addStyles();
    ensureMenu(app);
    ensureToolbar(app);
    hideRankContent(app);
    var info = app.querySelector('#cp-hdr-info');
    if (info) info.remove();
    var review = app.querySelector('#cp-hdr-review');
    if (review) review.remove();
    var account = app.querySelector('.cpn-head>[data-tab="account"]');
    if (account) account.remove();
  }

  function boot() {
    addStyles();
    apply();
    var app = document.getElementById(ROOT_ID);
    if (app && !app.__cp81Observer) {
      app.__cp81Observer = new MutationObserver(function () {
        if (app.__cp81Busy) return;
        app.__cp81Busy = true;
        requestAnimationFrame(function () {
          app.__cp81Busy = false;
          apply();
        });
      });
      app.__cp81Observer.observe(app, { childList: true, subtree: true });
    }
  }

  // ننتظر إنشاء بوابة المندوب، ثم نعيد تطبيق التنظيم عند كل تحديث للمحتوى.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  boot();
  var tries = 0;
  var wait = setInterval(function () {
    boot();
    tries++;
    if (document.getElementById(ROOT_ID) || tries >= 30) clearInterval(wait);
  }, 500);
})();
