/* ==========================================================================
   js/tx-pipelines.js — Case Pipelines View for #tab-tx (المعاملات)
   - Preserves existing #tab-tx table/cards/filters completely
   - Uses real statuses: Under Review, In Progress, Complete, Delivered
   - Drag & drop with trailing SVG wire, black Drop Pill, FLIP animation, and real Supabase updates
   ========================================================================== */
(function () {
  'use strict';
  if (window.__txPipelinesInit) return;
  window.__txPipelinesInit = true;

  var MODE_KEY = 'ts_tx_view_mode';
  var viewMode = 'table';
  try {
    if (localStorage.getItem(MODE_KEY) === 'pipelines') viewMode = 'pipelines';
  } catch (_) {}

  var subTab = 'pipes'; // pipes | progress | delivered
  var COLS = [
    ['Under Review', 'Under Review'],
    ['In Progress', 'In Progress'],
    ['Complete', 'Complete'],
    ['Delivered', 'Delivered']
  ];

  function $(id) { return document.getElementById(id); }
  function eh(s) {
    return typeof escapeHtml === 'function'
      ? escapeHtml(s)
      : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
  }

  function getOrdersList() {
    if (typeof window.__txKpiBase !== 'undefined' && Array.isArray(window.__txKpiBase)) {
      return window.__txKpiBase;
    }
    return typeof groupedOrders !== 'undefined' && Array.isArray(groupedOrders) ? groupedOrders : [];
  }

  function syncModeVisibility() {
    var root = $('tx-pipe-root');
    var tabTx = $('tab-tx');
    if (!root || !tabTx) return;
    var cardsEl = $('recent-cards-container');
    var tableWrap = cardsEl ? cardsEl.closest('.card') : null;
    var isPipe = viewMode === 'pipelines';

    root.classList.toggle('active', isPipe);
    if (tableWrap) tableWrap.classList.toggle('hidden', isPipe);

    var bTable = $('tx-mode-table'), bPipe = $('tx-mode-pipe');
    if (bTable) bTable.classList.toggle('active', !isPipe);
    if (bPipe) bPipe.classList.toggle('active', isPipe);
  }

  window.setTxViewMode = function (mode) {
    viewMode = mode === 'pipelines' ? 'pipelines' : 'table';
    try { localStorage.setItem(MODE_KEY, viewMode); } catch (_) {}
    syncModeVisibility();
    if (viewMode === 'pipelines') renderTxPipelines();
  };

  function cardHTML(o) {
    var st = typeof getOrderStatus === 'function' ? getOrderStatus(o) : 'In Progress';
    var late = typeof isOrderLate === 'function' ? isOrderLate(o) : false;
    var empName = (o.lines && o.lines[0] && o.lines[0].employee) || 'موظف';
    var prof = typeof profileByName === 'function' ? profileByName(empName) : null;
    var av = typeof avatarHtml === 'function'
      ? avatarHtml(prof || { id: empName, full_name: empName }, 40)
      : '<span class="inline-grid place-items-center w-10 h-10 rounded-full bg-emerald-600 text-white font-bold text-xs">' + eh(empName.slice(0, 2)) + '</span>';
    var svc = (o.lines && o.lines[0] && o.lines[0].service) || 'معاملة';
    var extra = (o.lines && o.lines.length > 1) ? ' (+' + (o.lines.length - 1) + ')' : '';
    var money = typeof formatCurrency === 'function' ? formatCurrency(o.grand_total || 0) : String(o.grand_total || 0);
    var badge = '';
    if (st === 'Complete' || st === 'Delivered') {
      badge = '<span class="tp-badge" title="' + eh(st) + '"><i class="fa-solid fa-check"></i></span>';
    } else if (late || st === 'Under Review') {
      badge = '<span class="tp-badge ' + (late ? 'late' : '') + '" title="' + (late ? 'متأخرة' : 'Under Review') + '"><i class="fa-regular fa-clock"></i></span>';
    }

    return '<div class="tp-card" data-tx="' + eh(o.transaction_id) + '" data-col="' + eh(st) + '">' +
      av +
      '<div class="tp-txt">' +
        '<div class="tp-name">' + eh(o.client_name || 'عميل') + '</div>' +
        '<div class="tp-sub">' + eh(svc + extra) + ' · ' + eh(money) + '</div>' +
      '</div>' +
      '<button type="button" class="tp-dots" aria-label="خيارات"><i class="fa-solid fa-ellipsis"></i></button>' +
      badge +
    '</div>';
  }

  function renderSubTabs(orders) {
    var body = $('tp-tab-body');
    if (!body) return;

    if (subTab === 'pipes') {
      var colsHtml = COLS.map(function (pair) {
        var key = pair[0], label = pair[1];
        var list = orders.filter(function (o) {
          return (typeof getOrderStatus === 'function' ? getOrderStatus(o) : 'In Progress') === key;
        });
        var cards = list.slice(0, 30).map(cardHTML).join('');
        return '<div class="tp-col" data-col="' + eh(key) + '">' +
          '<div class="tp-col-head">' + eh(label) + '<span class="tp-count-badge">' + list.length + '</span></div>' +
          '<div class="tp-col-cards">' + (cards || '<div class="text-center text-xs py-6 opacity-50">—</div>') + '</div>' +
        '</div>';
      }).join('');

      body.innerHTML = '<div class="tp-board-wrap"><svg class="tp-wires" id="tp-wires"></svg><div class="tp-board">' + colsHtml + '</div></div>';
      bindPipelineInteractions();
      requestAnimationFrame(drawWires);
    } else if (subTab === 'progress') {
      var inProg = orders.filter(function (o) {
        var s = typeof getOrderStatus === 'function' ? getOrderStatus(o) : 'In Progress';
        return s === 'In Progress' || s === 'Under Review';
      });
      var byEmp = new Map();
      inProg.forEach(function (o) {
        var emp = (o.lines && o.lines[0] && o.lines[0].employee) || 'غير محدد';
        if (!byEmp.has(emp)) byEmp.set(emp, { name: emp, total: 0, count: 0, lines: 0 });
        var rec = byEmp.get(emp);
        rec.total += Number(o.grand_total) || 0;
        rec.count += 1;
        rec.lines += (o.lines ? o.lines.length : 1);
      });
      var emps = Array.from(byEmp.values()).sort(function (a, b) { return b.total - a.total; });
      var maxT = emps.length ? Math.max(1, emps[0].total) : 1;

      body.innerHTML = '<div class="tp-progress-grid">' + emps.map(function (e, i) {
        var share = Math.round(e.total / maxT * 100);
        var p = typeof profileByName === 'function' ? profileByName(e.name) : null;
        var av = typeof avatarHtml === 'function' ? avatarHtml(p || { id: e.name, full_name: e.name }, 36) : '';
        var r = 34, c = 2 * Math.PI * r, off = c * (1 - share / 100);
        return '<div class="tp-pcard" style="animation-delay:' + (i * 55) + 'ms">' +
          '<div class="flex items-center justify-between gap-2 mb-3"><div class="flex items-center gap-2.5">' + av + '<span class="font-bold text-sm">' + eh(e.name) + '</span></div><span class="tp-count-badge">' + e.count + '</span></div>' +
          '<div class="flex items-center justify-between gap-3">' +
            '<div><div class="text-xs opacity-60">شغل مفتوح</div><div class="text-base font-bold mt-0.5">' + eh(typeof formatCurrency === 'function' ? formatCurrency(e.total) : e.total) + '</div><div class="text-[11px] opacity-60 mt-1">' + e.lines + ' بند</div></div>' +
            '<div class="relative w-20 h-20"><svg width="80" height="80" viewBox="0 0 80 80" style="transform:rotate(-90deg)"><circle cx="40" cy="40" r="' + r + '" fill="none" stroke="rgba(148,163,184,0.22)" stroke-width="7"/><circle cx="40" cy="40" r="' + r + '" fill="none" stroke="#17B26A" stroke-width="7" stroke-linecap="round" stroke-dasharray="' + c + '" stroke-dashoffset="' + off + '"/></svg><div class="absolute inset-0 grid place-items-center text-xs font-bold">' + share + '%</div></div>' +
          '</div></div>';
      }).join('') + '</div>';
    } else {
      var deliv = orders.filter(function (o) {
        return (typeof getOrderStatus === 'function' ? getOrderStatus(o) : '') === 'Delivered';
      });
      body.innerHTML = '<div class="tp-progress-grid">' + (deliv.slice(0, 24).map(cardHTML).join('') || '<div class="text-center text-xs py-8 opacity-60">لا توجد معاملات مسلّمة في الفلتر الحالي</div>') + '</div>';
      body.querySelectorAll('.tp-card').forEach(function (card) {
        card.style.cursor = 'pointer';
        card.addEventListener('click', function () {
          if (typeof openTxModal === 'function') openTxModal(card.dataset.tx);
        });
      });
    }
  }

  function renderBottomAnalytics(orders) {
    var bot = $('tp-bottom');
    if (!bot) return;
    var counts = { 'In Progress': 0, 'Complete': 0, 'Delivered': 0, 'Under Review': 0 };
    orders.forEach(function (o) {
      var s = typeof getOrderStatus === 'function' ? getOrderStatus(o) : 'In Progress';
      counts[s] = (counts[s] || 0) + 1;
    });
    var total = Math.max(1, orders.length);
    var pProg = Math.round(counts['In Progress'] / total * 100);
    var pComp = Math.round(counts['Complete'] / total * 100);
    var pDel = Math.round(counts['Delivered'] / total * 100);

    var circ = 2 * Math.PI * 44;
    var d1 = (counts['In Progress'] / total * circ).toFixed(1);
    var d2 = (counts['Complete'] / total * circ).toFixed(1);
    var d3 = (counts['Delivered'] / total * circ).toFixed(1);

    function gSvg(val, max, col) {
      var r = 46, cc = 2 * Math.PI * r, off = cc * (1 - Math.min(1, val / Math.max(1, max)));
      return '<svg width="108" height="108" viewBox="0 0 112 112" style="transform:rotate(-90deg)"><circle cx="56" cy="56" r="' + r + '" fill="none" stroke="rgba(148,163,184,0.22)" stroke-width="8.5"/><circle cx="56" cy="56" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="8.5" stroke-linecap="round" stroke-dasharray="' + cc + '" stroke-dashoffset="' + off + '"/></svg>';
    }

    bot.innerHTML =
      '<div class="tp-mini-panel">' +
        '<div class="flex items-baseline justify-between"><h3 class="font-bold text-sm">توزيع الحالات</h3><span class="text-[11px] opacity-60">' + orders.length + ' معاملة</span></div>' +
        '<div class="tp-drivers-body">' +
          '<svg width="124" height="124" viewBox="0 0 124 124" id="tp-donut">' +
            '<circle data-sl="0" cx="62" cy="62" r="44" fill="none" stroke="#17B26A" stroke-width="22" stroke-dasharray="' + d1 + ' ' + circ + '" stroke-dashoffset="0" transform="rotate(-90 62 62)"/>' +
            '<circle data-sl="1" cx="62" cy="62" r="44" fill="none" stroke="#036b29" stroke-width="22" stroke-dasharray="' + d2 + ' ' + circ + '" stroke-dashoffset="-' + d1 + '" transform="rotate(-90 62 62)"/>' +
            '<circle data-sl="2" cx="62" cy="62" r="44" fill="none" stroke="#98A2B3" stroke-width="22" stroke-dasharray="' + d3 + ' ' + circ + '" stroke-dashoffset="-' + (Number(d1) + Number(d2)).toFixed(1) + '" transform="rotate(-90 62 62)"/>' +
            '<text x="62" y="66" text-anchor="middle" font-size="16" font-weight="700" fill="currentColor">' + orders.length + '</text>' +
          '</svg>' +
          '<div class="tp-legend">' +
            '<div class="tp-lg" data-sl="0"><span class="w-2.5 h-2.5 rounded-full inline-block" style="background:#17B26A"></span>In Progress <b>(' + pProg + '%)</b></div>' +
            '<div class="tp-lg" data-sl="1"><span class="w-2.5 h-2.5 rounded-full inline-block" style="background:#036b29"></span>Complete <b>(' + pComp + '%)</b></div>' +
            '<div class="tp-lg" data-sl="2"><span class="w-2.5 h-2.5 rounded-full inline-block" style="background:#98A2B3"></span>Delivered <b>(' + pDel + '%)</b></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="tp-mini-panel">' +
        '<div class="flex items-baseline justify-between"><h3 class="font-bold text-sm">مؤشرات الإنجاز</h3><span class="text-[11px] opacity-60">حالة المعاملات الحالية</span></div>' +
        '<div class="tp-gauges">' +
          '<div class="tp-gauge">' + gSvg(counts['In Progress'] + counts['Under Review'], total, '#17B26A') + '<div class="val">' + (counts['In Progress'] + counts['Under Review']) + '</div><div class="lbl">قيد العمل</div></div>' +
          '<div class="tp-gauge">' + gSvg(counts['Complete'], total, '#47CD89') + '<div class="val">' + counts['Complete'] + '</div><div class="lbl">Complete</div></div>' +
          '<div class="tp-gauge">' + gSvg(pDel, 100, '#036b29') + '<div class="val">' + pDel + '%</div><div class="lbl">نسبة Delivered</div></div>' +
        '</div>' +
      '</div>';

    bot.querySelectorAll('.tp-legend .tp-lg').forEach(function (lg) {
      lg.addEventListener('mouseenter', function () {
        bot.querySelectorAll('#tp-donut circle').forEach(function (c) {
          c.classList.toggle('dim-slice', c.dataset.sl !== lg.dataset.sl);
        });
      });
      lg.addEventListener('mouseleave', function () {
        bot.querySelectorAll('#tp-donut circle').forEach(function (c) { c.classList.remove('dim-slice'); });
      });
    });
  }

  function drawWires() {
    var svg = $('tp-wires');
    if (!svg) return;
    var wrap = svg.closest('.tp-board-wrap');
    if (!wrap) return;
    var wr = wrap.getBoundingClientRect();
    svg.setAttribute('viewBox', '0 0 ' + wrap.scrollWidth + ' ' + wrap.scrollHeight);

    var cols = Array.prototype.slice.call(wrap.querySelectorAll('.tp-col'));
    var colCards = cols.map(function (col) {
      return Array.prototype.slice.call(col.querySelectorAll('.tp-card')).map(function (el) {
        var r = el.getBoundingClientRect();
        return { x: r.left - wr.left + wrap.scrollLeft, y: r.top - wr.top + wrap.scrollTop, w: r.width, h: r.height };
      });
    });

    var out = '';
    colCards.forEach(function (cards) {
      for (var i = 0; i < cards.length - 1; i++) {
        var a = cards[i], b = cards[i + 1], x = a.x + a.w / 2, y1 = a.y + a.h, y2 = b.y;
        if (y2 - y1 < 8) continue;
        out += '<path class="tp-wire" d="M' + x + ' ' + (y1 + 2) + ' V ' + (y2 - 2) + '"/>';
        out += '<circle class="tp-wire-node" cx="' + x + '" cy="' + ((y1 + y2) / 2) + '" r="3.2"/>';
      }
    });

    for (var c = 0; c < colCards.length - 1; c++) {
      var A = colCards[c], B = colCards[c + 1];
      var n = Math.min(A.length, B.length, 6);
      for (var j = 0; j < n; j++) {
        var ca = A[j], cb = B[j];
        var x1 = ca.x, x2 = cb.x + cb.w;
        var y1 = ca.y + ca.h / 2, y2 = cb.y + cb.h / 2;
        var mx = (x1 + x2) / 2;
        out += '<path class="tp-wire" d="M' + (x1 - 2) + ' ' + y1 + ' C ' + mx + ' ' + y1 + ', ' + mx + ' ' + y2 + ', ' + (x2 + 2) + ' ' + y2 + '"/>';
        out += '<circle class="tp-wire-node" cx="' + (x1 - 2) + '" cy="' + y1 + '" r="3"/><circle class="tp-wire-node" cx="' + (x2 + 2) + '" cy="' + y2 + '" r="3"/>';
      }
    }

    var live = svg.querySelector('.tp-live-layer');
    svg.innerHTML = out;
    if (live) svg.appendChild(live);
  }

  function closeCardMenu() {
    var m = $('tp-cardmenu');
    if (m) m.remove();
  }

  function openCardMenu(txId, anchor) {
    closeCardMenu();
    var o = getOrdersList().find(function (x) { return String(x.transaction_id) === String(txId); });
    if (!o) return;
    var curSt = typeof getOrderStatus === 'function' ? getOrderStatus(o) : 'In Progress';
    var m = document.createElement('div');
    m.className = 'tp-cardmenu';
    m.id = 'tp-cardmenu';
    m.innerHTML = '<div class="tp-cm-head">' + eh(o.client_name || txId) + '</div>' +
      '<button type="button" data-act="open"><i class="fa-regular fa-folder-open"></i> فتح تفاصيل المعاملة</button>' +
      (curSt !== 'In Progress' ? '<button type="button" data-act="st" data-s="In Progress"><i class="fa-solid fa-gears"></i> نقل إلى In Progress</button>' : '') +
      (curSt !== 'Complete' ? '<button type="button" data-act="st" data-s="Complete"><i class="fa-solid fa-box-open"></i> نقل إلى Complete</button>' : '') +
      (curSt !== 'Delivered' ? '<button type="button" data-act="st" data-s="Delivered"><i class="fa-solid fa-circle-check"></i> نقل إلى Delivered</button>' : '');
    document.body.appendChild(m);
    var r = anchor.getBoundingClientRect();
    m.style.left = Math.max(10, Math.min(r.left, window.innerWidth - 230)) + 'px';
    m.style.top = Math.min(r.bottom + 6, Math.max(10, window.innerHeight - m.offsetHeight - 10)) + 'px';

    m.addEventListener('click', async function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      var act = b.dataset.act, st = b.dataset.s;
      closeCardMenu();
      if (act === 'open' && typeof openTxModal === 'function') {
        openTxModal(txId);
      } else if (act === 'st' && st) {
        await moveOrderToStatus(o, st);
      }
    });
    setTimeout(function () {
      document.addEventListener('pointerdown', function handler(ev) {
        if (!m.contains(ev.target)) {
          closeCardMenu();
          document.removeEventListener('pointerdown', handler);
        }
      });
    }, 0);
  }

  async function moveOrderToStatus(o, targetStatus) {
    if (!o || !o.lines || !o.lines.length) return;
    if (typeof applyStatus !== 'function') return;
    var ids = o.lines.map(function (l) { return String(l.id); });
    var ok = await applyStatus(ids, targetStatus);
    if (ok) {
      if (typeof showToast === 'function') showToast('تم نقل المعاملة إلى ' + targetStatus);
      if (typeof afterStatusChange === 'function') afterStatusChange();
    }
  }

  function bindPipelineInteractions() {
    document.querySelectorAll('#tx-pipe-root .tp-board .tp-card').forEach(function (card) {
      card.addEventListener('pointerdown', function (ev) {
        if (ev.target.closest('.tp-dots')) return;
        startDrag(card, ev);
      });
      var dots = card.querySelector('.tp-dots');
      if (dots) {
        dots.addEventListener('click', function (e) {
          e.stopPropagation();
          openCardMenu(card.dataset.tx, dots);
        });
      }
    });
  }

  function startDrag(card, ev) {
    var txId = card.dataset.tx;
    var fromCol = card.dataset.col;
    var o = getOrdersList().find(function (x) { return String(x.transaction_id) === String(txId); });
    if (!o) return;

    var startX = ev.clientX, startY = ev.clientY, started = false;
    var r = card.getBoundingClientRect();
    var dx = ev.clientX - r.left, dy = ev.clientY - r.top;
    var ghost = null, pillEl = null, liveLayer = null, targetCol = null;
    var wrap = document.querySelector('#tx-pipe-root .tp-board-wrap');
    var svg = $('tp-wires');

    function ensureStarted() {
      if (started) return;
      started = true;
      ghost = card.cloneNode(true);
      ghost.className = 'tp-drag-ghost';
      ghost.style.width = r.width + 'px';
      ghost.style.left = r.left + 'px';
      ghost.style.top = r.top + 'px';
      document.body.appendChild(ghost);
      card.classList.add('dragging');
      if (svg) {
        liveLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        liveLayer.setAttribute('class', 'tp-live-layer');
        svg.appendChild(liveLayer);
      }
    }

    function ensurePill(colK) {
      var box = document.querySelector('#tx-pipe-root .tp-col[data-col="' + colK + '"] .tp-col-cards');
      if (!box) return;
      if (!pillEl) {
        pillEl = document.createElement('div');
        pillEl.className = 'tp-drop-pill';
      }
      if (pillEl.dataset.col !== colK) {
        pillEl.dataset.col = colK;
        pillEl.innerHTML = '<i class="fa-solid fa-plus"></i><span class="tp-dp-txt">Move to ' + eh(colK) + '</span>';
      }
      if (pillEl.parentNode !== box) box.insertBefore(pillEl, box.firstChild);
    }

    function removePill() {
      if (pillEl) { pillEl.remove(); pillEl = null; }
    }

    function onMove(e) {
      if (!started && Math.hypot(e.clientX - startX, e.clientY - startY) < 6) return;
      ensureStarted();
      ghost.style.left = (e.clientX - dx) + 'px';
      ghost.style.top = (e.clientY - dy) + 'px';

      targetCol = null;
      document.querySelectorAll('#tx-pipe-root .tp-col').forEach(function (c) {
        var cr = c.getBoundingClientRect();
        var hit = e.clientX >= cr.left - 10 && e.clientX <= cr.right + 10 && e.clientY >= cr.top && e.clientY <= cr.bottom;
        c.classList.toggle('drop-target', hit);
        if (hit) targetCol = c.dataset.col;
      });

      if (targetCol && targetCol !== fromCol) {
        ensurePill(targetCol);
        ghost.style.opacity = '0';
      } else {
        removePill();
        ghost.style.opacity = '1';
      }

      if (liveLayer && wrap) {
        var wr = wrap.getBoundingClientRect(), cr = card.getBoundingClientRect();
        var sx = cr.left - wr.left + wrap.scrollLeft + cr.width / 2;
        var sy = cr.top - wr.top + wrap.scrollTop + cr.height / 2;
        var px = (pillEl ? pillEl.getBoundingClientRect().left + pillEl.offsetWidth / 2 : e.clientX) - wr.left + wrap.scrollLeft;
        var py = (pillEl ? pillEl.getBoundingClientRect().top + pillEl.offsetHeight / 2 : e.clientY) - wr.top + wrap.scrollTop;
        var mx = (sx + px) / 2;
        liveLayer.innerHTML = '<path class="tp-wire live" d="M' + sx + ' ' + sy + ' C ' + mx + ' ' + sy + ', ' + mx + ' ' + py + ', ' + px + ' ' + py + '"/>';
      }
    }

    async function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (!started) {
        if (typeof openTxModal === 'function') openTxModal(txId);
        return;
      }
      if (liveLayer) liveLayer.remove();
      if (ghost) ghost.remove();
      removePill();
      card.classList.remove('dragging');
      document.querySelectorAll('#tx-pipe-root .tp-col').forEach(function (c) { c.classList.remove('drop-target'); });
      if (targetCol && targetCol !== fromCol) {
        await moveOrderToStatus(o, targetCol);
      } else {
        drawWires();
      }
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function renderTxPipelines() {
    var root = $('tx-pipe-root');
    if (!root) return;
    var orders = getOrdersList();

    root.innerHTML =
      '<div class="tp-panel">' +
        '<div class="tp-head">' +
          '<h2>Case Pipelines</h2>' +
          '<div class="tp-tabs">' +
            '<button type="button" data-tp="pipes" class="' + (subTab === 'pipes' ? 'active' : '') + '">Pipelines</button>' +
            '<button type="button" data-tp="progress" class="' + (subTab === 'progress' ? 'active' : '') + '">In Progress</button>' +
            '<button type="button" data-tp="delivered" class="' + (subTab === 'delivered' ? 'active' : '') + '">Delivered</button>' +
          '</div>' +
        '</div>' +
        '<div id="tp-tab-body"></div>' +
      '</div>' +
      '<div class="tp-bottom" id="tp-bottom"></div>';

    root.querySelectorAll('[data-tp]').forEach(function (b) {
      b.addEventListener('click', function () {
        subTab = b.dataset.tp;
        renderTxPipelines();
      });
    });

    renderSubTabs(orders);
    renderBottomAnalytics(orders);
  }

  // Hook renderRecentRequests safely without modifying js/03-core-app.js
  var _origRender = window.renderRecentRequests;
  if (typeof _origRender === 'function') {
    window.renderRecentRequests = function () {
      var res = _origRender.apply(this, arguments);
      syncModeVisibility();
      if (viewMode === 'pipelines') renderTxPipelines();
      return res;
    };
  }

  window.addEventListener('resize', function () {
    if (viewMode === 'pipelines') drawWires();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncModeVisibility);
  } else {
    syncModeVisibility();
  }
})();
