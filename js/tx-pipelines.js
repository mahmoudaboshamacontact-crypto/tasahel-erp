/* js/tx-pipelines.js — لوحة المعاملات (عرض كانبان لشاشة #tab-tx)
   - إضافة فقط: الجدول والفلاتر الحالية زي ما هي، وده عرض بديل بزرار تبديل.
   - الحالات الحقيقية: Under Review / In Progress / Complete / Delivered
   - السحب بيغيّر الحالة فعلاً، فبنسأل تأكيد قبل الكتابة. «تحت المراجعة» للعرض بس. */
(function () {
  'use strict';
  if (window.__txPipelinesInit) return;
  window.__txPipelinesInit = true;

  var MODE_KEY = 'ts_tx_view_mode';
  var viewMode = 'table';
  try { if (localStorage.getItem(MODE_KEY) === 'pipelines') viewMode = 'pipelines'; } catch (_) {}

  /* key, عربي, لون، ينفع الإسقاط عليه؟ */
  var COLS = [
    { k: 'Under Review', t: 'تحت المراجعة', c: '#d97706', drop: false },
    { k: 'In Progress', t: 'جاري التنفيذ', c: '#2563eb', drop: true },
    { k: 'Complete', t: 'جاهز للتسليم', c: '#17b26a', drop: true },
    { k: 'Delivered', t: 'تم التسليم', c: '#036b29', drop: true }
  ];
  var PER_COL = 40;

  function $(id) { return document.getElementById(id); }
  function eh(s) {
    return typeof escapeHtml === 'function' ? escapeHtml(s)
      : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
  }
  function colByKey(k) { return COLS.filter(function (c) { return c.k === k; })[0]; }
  function canMove() { return window.__role !== 'partner' && window.__role !== 'courier'; }
  function statusOf(o) { return typeof getOrderStatus === 'function' ? getOrderStatus(o) : 'In Progress'; }

  function getOrdersList() {
    if (Array.isArray(window.__txKpiBase)) return window.__txKpiBase;
    return typeof groupedOrders !== 'undefined' && Array.isArray(groupedOrders) ? groupedOrders : [];
  }

  function syncModeVisibility() {
    var root = $('tx-pipe-root');
    if (!root || !$('tab-tx')) return;
    var cardsEl = $('recent-cards-container');
    var tableWrap = cardsEl ? cardsEl.closest('.card') : null;
    var isPipe = viewMode === 'pipelines';
    root.classList.toggle('active', isPipe);
    if (tableWrap) tableWrap.classList.toggle('hidden', isPipe);
    var bT = $('tx-mode-table'), bP = $('tx-mode-pipe');
    if (bT) bT.classList.toggle('active', !isPipe);
    if (bP) bP.classList.toggle('active', isPipe);
  }

  window.setTxViewMode = function (mode) {
    viewMode = mode === 'pipelines' ? 'pipelines' : 'table';
    try { localStorage.setItem(MODE_KEY, viewMode); } catch (_) {}
    syncModeVisibility();
    if (viewMode === 'pipelines') renderTxPipelines();
  };

  function cardHTML(o, col) {
    var late = typeof isOrderLate === 'function' ? !!isOrderLate(o) && col.k !== 'Delivered' : false;
    var l0 = (o.lines && o.lines[0]) || {};
    var emp = l0.employee || '';
    var svc = (l0.service || 'معاملة') + (o.lines && o.lines.length > 1 ? ' +' + (o.lines.length - 1) : '');
    var money = typeof formatCurrency === 'function' ? formatCurrency(o.grand_total || 0) : String(o.grand_total || 0);
    var prof = emp && typeof profileByName === 'function' ? profileByName(emp) : null;
    var av = emp && typeof avatarHtml === 'function' ? avatarHtml(prof || { id: emp, full_name: emp }, 22) : '';
    return '<div class="tp-card' + (late ? ' is-late' : '') + '" data-tx="' + eh(o.transaction_id) + '" data-col="' + eh(col.k) + '" tabindex="0">' +
      '<div class="tp-top"><span class="tp-name">' + eh(o.client_name || 'عميل') + '</span>' +
        (late ? '<span class="tp-late">متأخرة</span>' : '') + '</div>' +
      '<div class="tp-svc">' + eh(svc) + '</div>' +
      '<div class="tp-foot"><span class="tp-money">' + eh(money) + '</span>' +
        (emp ? '<span class="tp-emp">' + av + '<span>' + eh(emp) + '</span></span>' : '') + '</div>' +
    '</div>';
  }

  function renderTxPipelines() {
    var root = $('tx-pipe-root');
    if (!root) return;
    var orders = getOrdersList();
    var buckets = {};
    COLS.forEach(function (c) { buckets[c.k] = []; });
    orders.forEach(function (o) { var s = statusOf(o); (buckets[s] || buckets['In Progress']).push(o); });

    root.innerHTML = '<div class="tp-board">' + COLS.map(function (c) {
      var list = buckets[c.k], more = list.length - PER_COL;
      return '<section class="tp-col' + (c.drop ? '' : ' no-drop') + '" data-col="' + c.k + '" style="--tp-c:' + c.c + '">' +
        '<header class="tp-col-head"><span class="tp-dot"></span><span class="tp-col-title">' + c.t + '</span><span class="tp-count">' + list.length + '</span></header>' +
        '<div class="tp-col-cards">' +
          (list.length ? list.slice(0, PER_COL).map(function (o) { return cardHTML(o, c); }).join('') : '<div class="tp-empty">مفيش معاملات</div>') +
          (more > 0 ? '<div class="tp-more">+' + more + ' معاملة أخرى — استخدم الفلاتر أو الجدول</div>' : '') +
        '</div></section>';
    }).join('') + '</div>' +
    (canMove() ? '<p class="tp-hint">اسحب الكارت لعمود تاني لتغيير الحالة (هيطلب منك تأكيد). «تحت المراجعة» بتتحدد من المندوب/المراجعة.</p>' : '');
    bind(root);
  }

  async function moveOrder(o, target) {
    if (!o || !o.lines || !o.lines.length || typeof applyStatus !== 'function') return;
    var c = colByKey(target);
    if (!window.confirm('تنقل معاملة «' + (o.client_name || '') + '» إلى «' + c.t + '»؟')) return;
    var ok = await applyStatus(o.lines.map(function (l) { return String(l.id); }), target);
    if (ok) {
      if (typeof showToast === 'function') showToast('اتنقلت إلى ' + c.t, 'success');
      if (typeof afterStatusChange === 'function') afterStatusChange();
    }
  }

  function bind(root) {
    root.querySelectorAll('.tp-card').forEach(function (card) {
      card.addEventListener('pointerdown', function (ev) { if (ev.button === 0 || ev.pointerType !== 'mouse') startDrag(card, ev); });
      card.addEventListener('keydown', function (ev) {
        if ((ev.key === 'Enter' || ev.key === ' ') && typeof openTxModal === 'function') { ev.preventDefault(); openTxModal(card.dataset.tx); }
      });
    });
  }

  function startDrag(card, ev) {
    var tx = card.dataset.tx, from = card.dataset.col;
    var o = getOrdersList().filter(function (x) { return String(x.transaction_id) === String(tx); })[0];
    if (!o) return;
    var sx = ev.clientX, sy = ev.clientY, started = false, ghost = null, target = null;
    var r = card.getBoundingClientRect(), dx = sx - r.left, dy = sy - r.top;
    var cols = Array.prototype.slice.call(document.querySelectorAll('#tx-pipe-root .tp-col'));

    function onMove(e) {
      if (!started) {
        if (Math.hypot(e.clientX - sx, e.clientY - sy) < 6 || !canMove()) return;
        started = true;
        ghost = card.cloneNode(true);
        ghost.className = 'tp-card tp-ghost';
        ghost.style.width = r.width + 'px';
        document.body.appendChild(ghost);
        card.classList.add('dragging');
      }
      ghost.style.left = (e.clientX - dx) + 'px';
      ghost.style.top = (e.clientY - dy) + 'px';
      target = null;
      cols.forEach(function (c) {
        var b = c.getBoundingClientRect();
        var hit = e.clientX >= b.left && e.clientX <= b.right && e.clientY >= b.top && e.clientY <= b.bottom;
        var ok = hit && !c.classList.contains('no-drop') && c.dataset.col !== from;
        c.classList.toggle('drop-ok', ok);
        if (ok) target = c.dataset.col;
      });
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (!started) { if (typeof openTxModal === 'function') openTxModal(tx); return; }
      ghost.remove();
      card.classList.remove('dragging');
      cols.forEach(function (c) { c.classList.remove('drop-ok'); });
      if (target) moveOrder(o, target);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  /* نلفّ renderRecentRequests من غير ما نعدّل js/03 */
  var _orig = window.renderRecentRequests;
  if (typeof _orig === 'function') {
    window.renderRecentRequests = function () {
      var res = _orig.apply(this, arguments);
      syncModeVisibility();
      if (viewMode === 'pipelines') renderTxPipelines();
      return res;
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncModeVisibility);
  else syncModeVisibility();
})();
