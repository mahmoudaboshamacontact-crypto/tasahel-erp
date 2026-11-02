/* =====================================================================
   المرحلة 23: نظام الاسترداد على مستوى البند (line_refunds)
   - زر "استرداد" على كروت البنود (مودال: كلي/جزئي + الكمية + السبب إجباري؛ للمدير خانة حق المنفذ exec_forfeit)
   - شارة واضحة على البند (مسترد كليًا / مسترد جزئيًا / استرداد معلّق)
   - صندوق طلبات الاسترداد المعلّقة للمدير (موافقة مع تحديد حق المنفذ أو رفض مع ملاحظة)
   - ربط كامل مع الحسابات (07 الكوميشن والتارجت، 08 الداشبورد، 06 شيت الكاش، 14 المنفذين، 41 تقدمي)
   - الألوان: من متغيرات الثيم الحالي (--r-acc, --r-card, --r-line, --r-mute, --r-ok, --r-bad)
   ===================================================================== */
(function () {
  'use strict';
  if (window.__phase23Refunds) return;
  window.__phase23Refunds = true;

  const eh = typeof escapeHtml === 'function' ? escapeHtml : s => String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
  const num = v => Number(v) || 0;
  const $ = id => document.getElementById(id);
  const wrap = (name, fn) => { const o = window[name]; if (typeof o === 'function') window[name] = fn(o); };
  const isPartner = () => window.__role === 'partner';
  const isMgr = () => {
    try {
      if (window.__role) return window.__role === 'manager';
      return typeof canEditTx === 'function' && !!canEditTx();
    } catch (e) { return false; }
  };

  const state = {
    all: [],
    byLine: new Map(),
    pending: [],
    loaded: false,
    busy: false,
    tableOk: true,
    rtCh: null
  };

  const missing = err => /42P01|42883|PGRST20[25]|does not exist|schema cache|Could not find/i.test(((err && err.message) || '') + ' ' + ((err && err.code) || ''));

  /* ---------------- 1) CSS باستخدام متغيرات الثيم فقط ---------------- */
  function injectStyle() {
    if ($('rf23-style')) return;
    const st = document.createElement('style');
    st.id = 'rf23-style';
    st.textContent = `
      .rf-badge {
        display: inline-flex; align-items: center; gap: 4px;
        border-radius: 999px; padding: 2px 9px; font-size: 10.5px; font-weight: 700;
        white-space: nowrap; line-height: 1.4;
      }
      .rf-badge-full {
        background: rgba(255, 107, 107, 0.15);
        color: var(--r-bad, #ff6b6b);
        border: 1px solid rgba(255, 107, 107, 0.38);
      }
      .rf-badge-partial {
        background: rgba(255, 157, 108, 0.15);
        color: var(--r-acc, #ff9d6c);
        border: 1px solid rgba(255, 157, 108, 0.38);
      }
      .rf-badge-pending {
        background: var(--r-card, rgba(127, 127, 127, 0.12));
        color: var(--r-mute, #a0978e);
        border: 1px dashed var(--r-acc, #ff9d6c);
      }
      .rf-btn-trigger {
        display: inline-flex; align-items: center; gap: 5px;
        border-radius: 10px; padding: 4px 10px; font-size: 11px; font-weight: 700;
        background: rgba(255, 157, 108, 0.12);
        color: var(--r-acc, #ff9d6c);
        border: 1px solid var(--r-line, rgba(255, 255, 255, 0.12));
        cursor: pointer; transition: opacity .15s ease, border-color .15s ease;
      }
      .rf-btn-trigger:hover {
        border-color: var(--r-acc, #ff9d6c);
        background: rgba(255, 157, 108, 0.2);
      }
      .rf-card-box {
        background: var(--r-card, rgba(255, 255, 255, 0.045));
        border: 1px solid var(--r-line, rgba(255, 255, 255, 0.1));
        border-radius: 16px; padding: 14px 16px;
        color: var(--r-text, inherit);
      }
      .rf-modal-backdrop {
        position: fixed; inset: 0; z-index: 2147483200;
        background: rgba(0, 0, 0, 0.68);
        backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
        display: flex; align-items: center; justify-content: center; padding: 14px;
      }
      .rf-modal-dialog {
        width: 100%; max-width: 480px; max-height: 92vh; overflow-y: auto;
        border-radius: 20px; padding: 18px 20px;
        background: var(--r-bg, #141210);
        color: var(--r-text, #f4eee8);
        border: 1px solid var(--r-line, rgba(255, 255, 255, 0.14));
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
      }
      html:not(.dark) .rf-modal-dialog {
        background: #ffffff; color: #0f172a; border-color: #e2e8f0;
      }
      .rf-kind-opt {
        flex: 1; text-align: center; padding: 9px 12px; border-radius: 12px;
        font-size: 12px; font-weight: 700; cursor: pointer;
        border: 1px solid var(--r-line, rgba(127, 127, 127, 0.25));
        background: var(--r-card, rgba(127, 127, 127, 0.06));
        color: var(--r-mute, #8a8178);
      }
      .rf-kind-opt.on {
        background: linear-gradient(135deg, var(--r-acc, #ff9d6c), var(--r-acc2, #ff7a3d));
        color: #1a1208; border-color: transparent;
      }
      .rf-pri-btn {
        border-radius: 12px; padding: 9px 16px; font-size: 12px; font-weight: 700;
        background: linear-gradient(135deg, var(--r-acc, #ff9d6c), var(--r-acc2, #ff7a3d));
        color: #1a1208; border: 0; cursor: pointer;
      }
      .rf-ok-btn {
        border-radius: 10px; padding: 6px 12px; font-size: 11.5px; font-weight: 700;
        background: rgba(95, 211, 179, 0.18); color: var(--r-ok, #5fd3b3);
        border: 1px solid rgba(95, 211, 179, 0.4); cursor: pointer;
      }
      .rf-rej-btn {
        border-radius: 10px; padding: 6px 12px; font-size: 11.5px; font-weight: 700;
        background: rgba(255, 107, 107, 0.15); color: var(--r-bad, #ff6b6b);
        border: 1px solid rgba(255, 107, 107, 0.35); cursor: pointer;
      }
    `;
    document.head.appendChild(st);
  }

  /* ---------------- 2) حسابات وملخص الاسترداد لكل بند ---------------- */
  function findLine(lineId) {
    if (typeof allRequestLines === 'undefined' || !Array.isArray(allRequestLines)) return null;
    return allRequestLines.find(x => String(x.id) === String(lineId)) || null;
  }

  function rebuildIndex(rows) {
    state.all = Array.isArray(rows) ? rows : [];
    state.byLine = new Map();
    state.pending = [];
    state.all.forEach(r => {
      const k = String(r.line_id);
      if (!state.byLine.has(k)) state.byLine.set(k, []);
      state.byLine.get(k).push(r);
      if (r.status === 'pending') state.pending.push(r);
    });
  }

  function getLineRefundSummary(lineId) {
    const list = state.byLine.get(String(lineId)) || [];
    const l = findLine(lineId);
    const origQty = l ? Math.max(1, num(l.qty) || 1) : 1;
    const origSales = l ? num(l.total) : 0;
    const origExec = l ? (typeof execCostOf === 'function' ? execCostOf(l) : num(l.exec_unit_cost) * origQty) : 0;

    let appQty = 0, appSales = 0, appExecForfeit = 0, pendQty = 0, hasFullApp = false, hasPending = false;
    const approved = [], pending = [], rejected = [];

    list.forEach(r => {
      if (r.status === 'approved') {
        approved.push(r);
        appQty += Math.max(0, num(r.qty));
        appSales += Math.max(0, num(r.sales_amount));
        if (r.exec_forfeit) appExecForfeit += Math.max(0, num(r.exec_amount));
        if (r.kind === 'full') hasFullApp = true;
      } else if (r.status === 'pending') {
        pending.push(r);
        pendQty += Math.max(0, num(r.qty));
        hasPending = true;
      } else if (r.status === 'rejected') {
        rejected.push(r);
      }
    });

    const isFull = approved.length > 0 && (hasFullApp || appQty >= origQty);
    const isPartial = approved.length > 0 && !isFull;
    const remQty = Math.max(0, origQty - appQty);
    const remSales = isFull ? 0 : Math.max(0, origSales - appSales);
    const remExec = Math.max(0, origExec - appExecForfeit);

    return {
      lineId: lineId,
      origQty: origQty,
      origSales: origSales,
      origExec: origExec,
      qty: appQty,
      sales_amount: appSales,
      exec_forfeited: appExecForfeit,
      pendingQty: pendQty,
      remQty: remQty,
      remSales: remSales,
      remExec: remExec,
      isFull: isFull,
      isPartial: isPartial,
      hasPending: hasPending,
      approvedCount: approved.length,
      pendingCount: pending.length,
      approved: approved,
      pending: pending,
      rejected: rejected,
      all: list
    };
  }

  window.getLineRefundSummary = getLineRefundSummary;
  window.getApprovedRefundsForLine = lineId => getLineRefundSummary(lineId).approved;
  window.getAllApprovedRefunds = () => state.all.filter(r => r.status === 'approved');
  window.netExecCostOf = function (l) {
    if (!l) return 0;
    const base = typeof execCostOf === 'function' ? execCostOf(l) : (num(l.exec_total) || num(l.exec_unit_cost) * (num(l.qty) || 1));
    const s = getLineRefundSummary(l.id);
    if (!s || !s.approvedCount) return base;
    return Math.max(0, base - s.exec_forfeited);
  };

  function getLineRefundBadgeHtml(lineId) {
    const s = getLineRefundSummary(lineId);
    if (!s) return '';
    const parts = [];
    if (s.isFull) {
      parts.push('<span class="rf-badge rf-badge-full" title="تم استرداد البند بالكامل"><i class="fa-solid fa-rotate-left"></i><span>مسترد كليًا</span></span>');
    } else if (s.isPartial) {
      parts.push('<span class="rf-badge rf-badge-partial" title="تم استرداد ' + fmtNum(s.qty) + ' من ' + fmtNum(s.origQty) + '"><i class="fa-solid fa-rotate-left"></i><span>مسترد جزئيًا (' + fmtNum(s.qty) + '/' + fmtNum(s.origQty) + ')</span></span>');
    }
    if (s.hasPending) {
      parts.push('<span class="rf-badge rf-badge-pending" title="يوجد طلب استرداد بانتظار موافقة المدير"><i class="fa-regular fa-clock"></i><span>استرداد معلّق (' + fmtNum(s.pendingQty) + ')</span></span>');
    }
    return parts.join(' ');
  }
  window.getLineRefundBadgeHtml = getLineRefundBadgeHtml;

  /* ---------------- 3) تحميل البيانات من Supabase ---------------- */
  async function loadRefunds(silent) {
    if (typeof sbClient === 'undefined' || !sbClient || !currentUser || isPartner() || !state.tableOk) return [];
    try {
      const r = await sbClient.from('line_refunds')
        .select('id,line_id,kind,qty,sales_amount,unit_comm_hint,exec_amount,exec_forfeit,reason,status,requested_by,requested_at,decided_by,decided_at')
        .order('requested_at', { ascending: false })
        .limit(2000);
      if (r.error) {
        if (missing(r.error)) state.tableOk = false;
        return [];
      }
      rebuildIndex(r.data || []);
      state.loaded = true;
      if (!silent) refreshAllRefundUi();
      return state.all;
    } catch (e) {
      console.warn('loadRefunds', e);
      return [];
    }
  }
  window.reloadLineRefunds = loadRefunds;

  function subscribeRefunds() {
    if (typeof sbClient === 'undefined' || !sbClient || !currentUser || isPartner()) return;
    try { if (state.rtCh) sbClient.removeChannel(state.rtCh); } catch (e) {}
    try {
      state.rtCh = sbClient.channel('p23-line-refunds')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'line_refunds' }, () => {
          loadRefunds(false);
        })
        .subscribe();
    } catch (e) {}
  }

  /* ---------------- 4) تسجيل في audit_log ---------------- */
  async function logRefundAudit(txId, serviceName, actionType, detailsObj) {
    if (typeof sbClient === 'undefined' || !sbClient || !txId) return;
    try {
      const uName = (typeof myProfile !== 'undefined' && myProfile && myProfile.full_name) || (currentUser && currentUser.email) || 'موظف';
      const r = await sbClient.from('audit_log').select('id').eq('transaction_id', String(txId)).eq('action', actionType).gte('at', new Date(Date.now() - 8000).toISOString()).limit(1);
      if (!r.error && r.data && r.data.length) return; /* مسجل بالفعل من الدالة في السيرفر */
      await sbClient.from('audit_log').insert({
        transaction_id: String(txId),
        action: actionType,
        service: serviceName || 'استرداد بند',
        user_name: uName,
        details: detailsObj || {}
      });
    } catch (e) {}
  }

  /* ---------------- 5) تجميل بطاقات البنود والجداول بالشارات وزر الاسترداد ---------------- */
  const _origBuildCard = window.buildServiceDetailCard;
  if (typeof _origBuildCard === 'function') {
    window.buildServiceDetailCard = function (l, idx, mode) {
      let html = _origBuildCard.apply(this, arguments);
      if (!l || isPartner()) return html;
      const s = getLineRefundSummary(l.id);
      const badgeH = getLineRefundBadgeHtml(l.id);
      const canReq = s.remQty > 0 && !s.hasPending;
      const btnH = canReq
        ? '<button type="button" onclick="event.stopPropagation();openLineRefundModal(\'' + eh(l.id) + '\')" class="rf-btn-trigger" title="طلب استرداد كلي أو جزئي لهذا البند"><i class="fa-solid fa-rotate-left"></i><span>استرداد</span></button>'
        : '';

      /* حقن الشارة وزر الاسترداد بجانب حالة البند في الهيدر */
      const target = '<div class="flex items-center gap-1.5 shrink-0">';
      if (html.indexOf(target) !== -1) {
        html = html.replace(target, '<div class="flex flex-wrap items-center gap-1.5 shrink-0">' + badgeH + btnH);
      }

      /* إضافة ملخص الاسترداد داخل الكارت لو فيه استرداد أو طلب معلق */
      if (s.approvedCount > 0 || s.pendingCount > 0) {
        const linesInfo = [];
        s.approved.forEach(r => {
          linesInfo.push(
            '<div class="flex flex-wrap items-center justify-between gap-2 text-[11px] pt-1">' +
              '<span><b style="color:var(--r-acc,#ff9d6c)">' + (r.kind === 'full' ? 'استرداد كلي معتمد' : 'استرداد جزئي معتمد') + ':</b> الكمية ' + fmtNum(r.qty) + ' · المبلغ ' + formatCurrency(r.sales_amount) + (r.executor || l.executor ? ' · ' + (r.exec_forfeit ? 'خُصم من المنفذ' : 'احتسب للمنفذ') : '') + '</span>' +
              '<span style="color:var(--r-mute,#a0978e)">السبب: ' + eh(r.reason || '—') + '</span>' +
            '</div>'
          );
        });
        s.pending.forEach(r => {
          linesInfo.push(
            '<div class="flex flex-wrap items-center justify-between gap-2 text-[11px] pt-1">' +
              '<span><b style="color:var(--r-acc,#ff9d6c)">طلب استرداد معلّق:</b> الكمية ' + fmtNum(r.qty) + ' · السبب: ' + eh(r.reason || '—') + '</span>' +
              (isMgr()
                ? '<span class="inline-flex items-center gap-1.5">' +
                    '<button type="button" onclick="event.stopPropagation();openDecideRefundModal(\'' + eh(r.id) + '\')" class="rf-ok-btn !py-0.5 !px-2 text-[10px]">مراجعة وموافقة/رفض</button>' +
                  '</span>'
                : '<span style="color:var(--r-mute,#a0978e)">بانتظار موافقة المدير</span>') +
            '</div>'
          );
        });
        const summaryBox = '<div class="rounded-lg p-2 mt-1 space-y-1" style="background:var(--r-card,rgba(255,157,108,.07));border:1px solid var(--r-line,rgba(255,157,108,.25))">' + linesInfo.join('') + '</div>';
        const lastClose = html.lastIndexOf('</div>');
        if (lastClose !== -1) {
          html = html.slice(0, lastClose) + summaryBox + html.slice(lastClose);
        }
      }
      return html;
    };
  }

  /* ---------------- 6) مودال طلب استرداد على البند (موظف أو مدير) ---------------- */
  window.openLineRefundModal = function (lineId) {
    injectStyle();
    const l = findLine(lineId);
    if (!l) return showToast('تعذّر العثور على بيانات البند', 'error');
    const s = getLineRefundSummary(lineId);
    if (s.remQty <= 0) return showToast('هذا البند تم استرداده بالكامل بالفعل', 'info');
    if (s.hasPending && !isMgr()) return showToast('يوجد طلب استرداد معلّق على هذا البند بالفعل', 'info');

    const mgr = isMgr();
    const origQty = s.origQty;
    const maxQty = s.remQty;
    const unitSales = origQty > 0 ? (num(l.total) / origQty) : num(l.unit_price);
    const unitExec = num(l.exec_unit_cost) || (origQty > 0 ? (num(l.exec_total) / origQty) : 0);
    const hasExec = !!(String(l.executor || '').trim() || unitExec > 0);
    const canFull = s.approvedCount === 0 && maxQty === origQty;

    let old = $('rf-request-modal');
    if (old) old.remove();

    const ov = document.createElement('div');
    ov.id = 'rf-request-modal';
    ov.className = 'rf-modal-backdrop';
    ov.innerHTML =
      '<div class="rf-modal-dialog space-y-4" onclick="event.stopPropagation()">' +
        '<div class="flex items-start justify-between gap-2 border-b pb-3" style="border-color:var(--r-line,rgba(127,127,127,.2))">' +
          '<div>' +
            '<div class="font-bold text-sm sm:text-base flex items-center gap-2">' +
              '<i class="fa-solid fa-rotate-left" style="color:var(--r-acc,#ff9d6c)"></i>' +
              '<span>' + (mgr ? 'تسجيل واعتماد استرداد بند' : 'طلب استرداد على بند خدمة') + '</span>' +
            '</div>' +
            '<div class="text-xs mt-0.5" style="color:var(--r-mute,#a0978e)">معاملة: <b class="font-mono" dir="ltr">' + eh(l.transaction_id || '—') + '</b> · العميل: <b>' + eh(l.client_name || '—') + '</b></div>' +
          '</div>' +
          '<button type="button" onclick="closeLineRefundModal()" class="rounded-lg p-1.5 hover:opacity-80" style="color:var(--r-mute,#a0978e)"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +

        '<div class="rf-card-box space-y-1.5 text-xs">' +
          '<div class="flex items-center justify-between"><span style="color:var(--r-mute,#a0978e)">الخدمة:</span><b>' + eh(l.service || '—') + '</b></div>' +
          '<div class="flex items-center justify-between"><span style="color:var(--r-mute,#a0978e)">الكمية المتاحة للاسترداد:</span><b class="font-mono">' + fmtNum(maxQty) + ' من ' + fmtNum(origQty) + '</b></div>' +
          '<div class="flex items-center justify-between"><span style="color:var(--r-mute,#a0978e)">إجمالي البند المتبقي:</span><b class="font-mono" style="color:var(--r-acc,#ff9d6c)">' + formatCurrency(s.remSales) + '</b></div>' +
          (hasExec ? '<div class="flex items-center justify-between"><span style="color:var(--r-mute,#a0978e)">المنفذ الخارجي:</span><b>' + eh(l.executor || 'محدد') + ' (' + formatCurrency(unitExec) + '/وحدة)</b></div>' : '') +
        '</div>' +

        '<form id="rf-req-form" class="space-y-3.5 text-xs">' +
          '<div>' +
            '<label class="block font-bold mb-1.5">نوع الاسترداد</label>' +
            '<div class="flex gap-2">' +
              (canFull ? '<button type="button" data-rf-k="full" class="rf-kind-opt on">استرداد كلي (' + fmtNum(maxQty) + ')</button>' : '') +
              '<button type="button" data-rf-k="partial" class="rf-kind-opt ' + (!canFull ? 'on' : '') + '">استرداد جزئي (بالكمية)</button>' +
            '</div>' +
            '<input type="hidden" id="rf-kind-val" value="' + (canFull ? 'full' : 'partial') + '">' +
          '</div>' +

          '<div id="rf-qty-wrap" class="' + (canFull ? 'hidden' : '') + '">' +
            '<label class="block font-bold mb-1" for="rf-qty-in">الكمية المستردة (الحد الأقصى: ' + fmtNum(maxQty) + ')</label>' +
            '<input id="rf-qty-in" type="number" min="1" max="' + maxQty + '" step="1" value="' + (canFull ? maxQty : 1) + '" class="field font-mono text-center font-bold">' +
          '</div>' +

          '<div class="rf-card-box flex items-center justify-between text-xs">' +
            '<span style="color:var(--r-mute,#a0978e)">المبلغ المالي المسترد المتوقع:</span>' +
            '<b id="rf-calc-sales" class="font-mono text-sm" style="color:var(--r-acc,#ff9d6c)">' + formatCurrency(canFull ? s.remSales : unitSales) + '</b>' +
          '</div>' +

          (mgr
            ? '<div class="rf-card-box space-y-2">' +
                '<div class="font-bold flex items-center justify-between">' +
                  '<span><i class="fa-solid fa-handshake ms-1" style="color:var(--r-acc,#ff9d6c)"></i>موقف حق المنفذ الخارجي</span>' +
                  (hasExec ? '<span class="font-mono text-[11px]" style="color:var(--r-mute,#a0978e)">' + eh(l.executor || '') + '</span>' : '') +
                '</div>' +
                '<label class="flex items-start gap-2 cursor-pointer leading-relaxed">' +
                  '<input id="rf-exec-forfeit" type="checkbox" checked class="mt-0.5 h-4 w-4 rounded">' +
                  '<span><b>إسقاط/خصم تكلفة التنفيذ من المنفذ</b> (يتم خصم تكلفة الوحدات المستردة من مستحقات المنفذ، وإذا أُلغي التحديد يحتفظ المنفذ بحقه كاملًا)</span>' +
                '</label>' +
              '</div>'
            : '<div class="text-[11px]" style="color:var(--r-mute,#a0978e)"><i class="fa-solid fa-circle-info ms-1"></i>سيتم إرسال الطلب للمدير للمراجعة وتحديد موقف المنفذ والاعتماد.</div>') +

          '<div>' +
            '<label class="block font-bold mb-1" for="rf-reason-in">سبب الاسترداد <span style="color:var(--r-bad,#ff6b6b)">* (إجباري)</span></label>' +
            '<textarea id="rf-reason-in" rows="2" required maxlength="500" placeholder="اكتب سبب الاسترداد بوضوح (مثال: العميل ألغى الخدمة قبل التنفيذ / تعذّر استكمال الأوراق)..." class="field text-xs"></textarea>' +
          '</div>' +

          '<div class="flex items-center justify-end gap-2 pt-2 border-t" style="border-color:var(--r-line,rgba(127,127,127,.2))">' +
            '<button type="button" onclick="closeLineRefundModal()" class="rounded-xl px-4 py-2 font-semibold" style="background:var(--r-card,rgba(127,127,127,.12));color:var(--r-text,inherit)">إلغاء</button>' +
            '<button id="rf-submit-btn" type="submit" class="rf-pri-btn"><i class="fa-solid fa-check ms-1"></i><span>' + (mgr ? 'اعتماد الاسترداد فوراً' : 'إرسال طلب الاسترداد') + '</span></button>' +
          '</div>' +
        '</form>' +
      '</div>';

    ov.addEventListener('click', e => { if (e.target === ov) window.closeLineRefundModal(); });
    document.body.appendChild(ov);

    const kInput = $('rf-kind-val'), qWrap = $('rf-qty-wrap'), qIn = $('rf-qty-in'), salesOut = $('rf-calc-sales');
    function syncCalc() {
      const k = kInput.value;
      const q = k === 'full' ? maxQty : Math.max(1, Math.min(maxQty, parseInt(qIn.value, 10) || 1));
      const amt = (k === 'full' && q === maxQty) ? s.remSales : Math.round(unitSales * q * 100) / 100;
      if (salesOut) salesOut.textContent = formatCurrency(amt);
    }

    ov.querySelectorAll('[data-rf-k]').forEach(btn => {
      btn.addEventListener('click', () => {
        const k = btn.getAttribute('data-rf-k');
        kInput.value = k;
        ov.querySelectorAll('[data-rf-k]').forEach(b => b.classList.toggle('on', b === btn));
        if (k === 'full') {
          qWrap.classList.add('hidden');
          qIn.value = maxQty;
        } else {
          qWrap.classList.remove('hidden');
          if (Number(qIn.value) >= maxQty && maxQty > 1) qIn.value = maxQty - 1;
          else qIn.value = 1;
        }
        syncCalc();
      });
    });
    if (qIn) qIn.addEventListener('input', syncCalc);

    $('rf-req-form').addEventListener('submit', async e => {
      e.preventDefault();
      const kind = kInput.value;
      const qty = kind === 'full' ? maxQty : parseInt(qIn.value, 10);
      const reason = ($('rf-reason-in').value || '').trim();
      const forfeitEl = $('rf-exec-forfeit');
      const execForfeit = forfeitEl ? !!forfeitEl.checked : true;

      if (!reason) return showToast('سبب الاسترداد إجباري', 'error');
      if (!(qty > 0 && qty <= maxQty)) return showToast('الكمية المستردة غير صحيحة أو تتجاوز المتاح (' + maxQty + ')', 'error');

      const finalKind = (qty === origQty && s.approvedCount === 0) ? 'full' : kind;
      const btn = $('rf-submit-btn');
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin ms-1"></i><span>جارٍ الحفظ...</span>';

      try {
        const res = await sbClient.rpc('request_line_refund', {
          p_line_id: l.id,
          p_kind: finalKind,
          p_qty: qty,
          p_reason: reason,
          p_exec_forfeit: execForfeit
        });
        if (res.error) throw res.error;

        const estSales = (finalKind === 'full' && qty === maxQty) ? s.remSales : Math.round(unitSales * qty * 100) / 100;
        await logRefundAudit(
          l.transaction_id,
          l.service,
          mgr ? 'refund' : 'refund_request',
          { line_id: l.id, kind: finalKind, qty: qty, sales_amount: estSales, exec_forfeit: execForfeit, reason: reason }
        );

        window.closeLineRefundModal();
        showToast(mgr ? 'تم اعتماد الاسترداد وتحديث الحسابات بنجاح' : 'تم إرسال طلب الاسترداد للمدير للموافقة');
        await loadRefunds(false);
      } catch (err) {
        showError('تعذّر تنفيذ طلب الاسترداد', err);
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-check ms-1"></i><span>' + (mgr ? 'اعتماد الاسترداد فوراً' : 'إرسال طلب الاسترداد') + '</span>';
      }
    });
  };

  window.closeLineRefundModal = function () {
    const m = $('rf-request-modal');
    if (m) m.remove();
  };

  /* ---------------- 7) مودال وصندوق قرار المدير (موافقة / رفض) ---------------- */
  window.openDecideRefundModal = function (refundId) {
    if (!isMgr()) return;
    injectStyle();
    const r = state.all.find(x => String(x.id) === String(refundId));
    if (!r) return showToast('لم يتم العثور على طلب الاسترداد', 'error');
    const l = findLine(r.line_id) || {};
    const reqUser = (typeof profiles !== 'undefined' && Array.isArray(profiles)) ? profiles.find(p => String(p.id) === String(r.requested_by)) : null;
    const reqName = (reqUser && reqUser.full_name) || l.employee || 'موظف';

    let old = $('rf-decide-modal');
    if (old) old.remove();

    const ov = document.createElement('div');
    ov.id = 'rf-decide-modal';
    ov.className = 'rf-modal-backdrop';
    ov.innerHTML =
      '<div class="rf-modal-dialog space-y-4" onclick="event.stopPropagation()">' +
        '<div class="flex items-start justify-between gap-2 border-b pb-3" style="border-color:var(--r-line,rgba(127,127,127,.2))">' +
          '<div>' +
            '<div class="font-bold text-sm sm:text-base flex items-center gap-2">' +
              '<i class="fa-solid fa-gavel" style="color:var(--r-acc,#ff9d6c)"></i>' +
              '<span>البتّ في طلب الاسترداد</span>' +
            '</div>' +
            '<div class="text-xs mt-0.5" style="color:var(--r-mute,#a0978e)">مقدّم الطلب: <b>' + eh(reqName) + '</b> · ' + eh(formatDateTime(r.requested_at)) + '</div>' +
          '</div>' +
          '<button type="button" onclick="closeDecideRefundModal()" class="rounded-lg p-1.5" style="color:var(--r-mute,#a0978e)"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +

        '<div class="rf-card-box space-y-1.5 text-xs">' +
          '<div class="flex justify-between"><span style="color:var(--r-mute,#a0978e)">المعاملة والعميل:</span><b>' + eh(l.client_name || '—') + ' (<span class="font-mono" dir="ltr">' + eh(l.transaction_id || ('#' + r.line_id)) + '</span>)</b></div>' +
          '<div class="flex justify-between"><span style="color:var(--r-mute,#a0978e)">الخدمة:</span><b>' + eh(l.service || '—') + '</b></div>' +
          '<div class="flex justify-between"><span style="color:var(--r-mute,#a0978e)">نوع الاسترداد والكمية:</span><b>' + (r.kind === 'full' ? 'استرداد كلي' : 'استرداد جزئي') + ' (×' + fmtNum(r.qty) + ')</b></div>' +
          '<div class="flex justify-between"><span style="color:var(--r-mute,#a0978e)">المبلغ المسترد:</span><b class="font-mono" style="color:var(--r-acc,#ff9d6c)">' + formatCurrency(r.sales_amount) + '</b></div>' +
          '<div class="flex justify-between"><span style="color:var(--r-mute,#a0978e)">تكلفة المنفذ على الجزء المسترد:</span><b class="font-mono">' + formatCurrency(r.exec_amount) + (l.executor ? ' (' + eh(l.executor) + ')' : '') + '</b></div>' +
          '<div class="pt-1 border-t" style="border-color:var(--r-line,rgba(127,127,127,.2))"><span style="color:var(--r-mute,#a0978e)">السبب المذكور:</span> <b class="block mt-0.5">' + eh(r.reason || '—') + '</b></div>' +
        '</div>' +

        '<div class="rf-card-box space-y-2 text-xs">' +
          '<label class="flex items-start gap-2 cursor-pointer leading-relaxed">' +
            '<input id="rf-dec-forfeit" type="checkbox" ' + (r.exec_forfeit !== false ? 'checked' : '') + ' class="mt-0.5 h-4 w-4 rounded">' +
            '<span><b>إسقاط/خصم حق المنفذ الخارجي (' + formatCurrency(r.exec_amount) + ')</b> عند الموافقة على الاسترداد</span>' +
          '</label>' +
        '</div>' +

        '<div class="text-xs">' +
          '<label class="block font-bold mb-1" for="rf-dec-note">ملاحظة المدير (اختياري عند الموافقة، أو سبب الرفض)</label>' +
          '<input id="rf-dec-note" type="text" maxlength="400" placeholder="اكتب ملاحظة..." class="field text-xs">' +
        '</div>' +

        '<div class="flex flex-wrap items-center justify-end gap-2 pt-2 border-t" style="border-color:var(--r-line,rgba(127,127,127,.2))">' +
          '<button type="button" onclick="closeDecideRefundModal()" class="rounded-xl px-3.5 py-2 text-xs font-semibold" style="background:var(--r-card,rgba(127,127,127,.12))">إغلاق</button>' +
          '<button type="button" id="rf-dec-rej" onclick="submitDecideRefund(\'' + eh(r.id) + '\',false)" class="rf-rej-btn !px-4 !py-2"><i class="fa-solid fa-xmark ms-1"></i>رفض الطلب</button>' +
          '<button type="button" id="rf-dec-app" onclick="submitDecideRefund(\'' + eh(r.id) + '\',true)" class="rf-ok-btn !px-4 !py-2"><i class="fa-solid fa-check ms-1"></i>موافقة واعتماد الخصم</button>' +
        '</div>' +
      '</div>';

    ov.addEventListener('click', e => { if (e.target === ov) window.closeDecideRefundModal(); });
    document.body.appendChild(ov);
  };

  window.closeDecideRefundModal = function () {
    const m = $('rf-decide-modal');
    if (m) m.remove();
  };

  window.submitDecideRefund = async function (refundId, approve) {
    if (!isMgr()) return;
    const r = state.all.find(x => String(x.id) === String(refundId));
    if (!r) return;
    const l = findLine(r.line_id) || {};
    const forfeitEl = $('rf-dec-forfeit');
    const execForfeit = forfeitEl ? !!forfeitEl.checked : (r.exec_forfeit !== false);
    const noteEl = $('rf-dec-note');
    const note = (noteEl && noteEl.value || '').trim() || null;

    const bApp = $('rf-dec-app'), bRej = $('rf-dec-rej');
    if (bApp) bApp.disabled = true;
    if (bRej) bRej.disabled = true;

    try {
      const res = await sbClient.rpc('decide_line_refund', {
        p_id: r.id,
        p_approve: !!approve,
        p_exec_forfeit: execForfeit,
        p_note: note
      });
      if (res.error) throw res.error;

      await logRefundAudit(
        l.transaction_id,
        l.service,
        approve ? 'refund' : 'refund_rejected',
        { refund_id: r.id, line_id: r.line_id, kind: r.kind, qty: r.qty, sales_amount: r.sales_amount, exec_forfeit: execForfeit, reason: r.reason, note: note }
      );

      window.closeDecideRefundModal();
      showToast(approve ? 'تمت الموافقة على الاسترداد وخصمه من الحسابات' : 'تم رفض طلب الاسترداد');
      await loadRefunds(false);
    } catch (err) {
      showError('تعذّر حفظ القرار', err);
      if (bApp) bApp.disabled = false;
      if (bRej) bRej.disabled = false;
    }
  };

  /* ---------------- 8) صندوق طلبات الاسترداد المعلّقة للمدير ---------------- */
  function buildPendingBoxHtml() {
    if (!isMgr() || !state.pending.length) return '';
    const rows = state.pending.map(r => {
      const l = findLine(r.line_id) || {};
      const reqUser = (typeof profiles !== 'undefined' && Array.isArray(profiles)) ? profiles.find(p => String(p.id) === String(r.requested_by)) : null;
      const reqName = (reqUser && reqUser.full_name) || l.employee || 'موظف';
      const tx = l.transaction_id || ('#' + r.line_id);
      return '<div class="flex flex-wrap items-center justify-between gap-3 rounded-xl p-3 text-xs" style="background:var(--r-bg,rgba(0,0,0,.2));border:1px solid var(--r-line,rgba(255,255,255,.1))">' +
        '<div class="min-w-0 space-y-1">' +
          '<div class="flex flex-wrap items-center gap-2">' +
            '<span class="rf-badge ' + (r.kind === 'full' ? 'rf-badge-full' : 'rf-badge-partial') + '">' + (r.kind === 'full' ? 'استرداد كلي' : 'استرداد جزئي') + ' ×' + fmtNum(r.qty) + '</span>' +
            '<b class="text-sm">' + eh(l.service || 'بند خدمة') + '</b>' +
            '<button type="button" onclick="openTxModal(\'' + eh(l.transaction_id || '') + '\')" class="rc-tx-pill !py-0.5 !px-2 !text-[11px]" dir="ltr">' + eh(tx) + '</button>' +
            '<span>العميل: <b>' + eh(l.client_name || '—') + '</b></span>' +
          '</div>' +
          '<div style="color:var(--r-mute,#a0978e)">' +
            'المبلغ: <b class="font-mono" style="color:var(--r-acc,#ff9d6c)">' + formatCurrency(r.sales_amount) + '</b>' +
            (l.executor ? ' · المنفذ: <b>' + eh(l.executor) + '</b> (' + formatCurrency(r.exec_amount) + ')' : '') +
            ' · طلب بواسطة: <b>' + eh(reqName) + '</b>' +
            ' · السبب: <b>' + eh(r.reason || '—') + '</b>' +
          '</div>' +
        '</div>' +
        '<div class="flex items-center gap-2 shrink-0">' +
          '<button type="button" onclick="openDecideRefundModal(\'' + eh(r.id) + '\')" class="rf-ok-btn"><i class="fa-solid fa-check ms-1"></i>مراجعة وموافقة / رفض</button>' +
        '</div>' +
      '</div>';
    }).join('');

    return '<div class="rf-card-box space-y-3 mb-4" style="border-color:rgba(255,157,108,.45)">' +
      '<div class="flex flex-wrap items-center justify-between gap-2">' +
        '<div class="font-bold text-sm flex items-center gap-2">' +
          '<span class="flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold" style="background:linear-gradient(135deg,var(--r-acc,#ff9d6c),var(--r-acc2,#ff7a3d));color:#1a1208"><i class="fa-solid fa-rotate-left"></i></span>' +
          '<span>صندوق طلبات الاسترداد المعلّقة للمدير (' + state.pending.length + ')</span>' +
        '</div>' +
        '<span class="text-[11px]" style="color:var(--r-mute,#a0978e)">راجع السبب وحدد موقف حق المنفذ قبل الاعتماد</span>' +
      '</div>' +
      '<div class="space-y-2">' + rows + '</div>' +
    '</div>';
  }

  function renderPendingRefundBoxes() {
    injectStyle();
    const html = buildPendingBoxHtml();
    ['tab-home', 'tab-tx', 'tab-comm'].forEach(tabId => {
      const tab = $(tabId);
      if (!tab) return;
      let slot = $(tabId + '-rf-pending-slot');
      if (!html) {
        if (slot) slot.remove();
        return;
      }
      if (!slot) {
        slot = document.createElement('div');
        slot.id = tabId + '-rf-pending-slot';
        tab.insertBefore(slot, tab.firstChild);
      }
      slot.innerHTML = html;
    });
  }

  /* ---------------- 9) تزيين الجداول (المعاملات، المنفذين، البحث) بشارات الاسترداد ---------------- */
  function decorateTablesWithRefundBadges() {
    if (!state.loaded) return;
    /* داخل شيت المنفذين الداخلي: تحديث إجمالي التكلفة والشارات */
    if (currentTab === 'exec' && $('sheet-body')) {
      try {
        const f = typeof getFilteredExecLines === 'function' ? getFilteredExecLines() : [];
        const netTotal = f.reduce((acc, l) => acc + window.netExecCostOf(l), 0);
        if ($('x-total')) $('x-total').textContent = formatCurrency(netTotal);
      } catch (e) {}
    }
  }

  function refreshAllRefundUi() {
    renderPendingRefundBoxes();
    if (typeof groupRequestsByTransaction === 'function') groupRequestsByTransaction();
    if (currentTab === 'tx' && typeof renderRecentRequests === 'function') renderRecentRequests();
    if (currentTab === 'home' && typeof renderHomeTab === 'function') renderHomeTab();
    if (currentTab === 'comm' && typeof renderComm === 'function') renderComm();
    if (currentTab === 'cash' && typeof filterCashSheet === 'function') filterCashSheet();
    if (currentTab === 'exec' && typeof filterExecSheet === 'function') { filterExecSheet(true); decorateTablesWithRefundBadges(); }
    if (currentTab === 'dash' && typeof renderDashboardMetrics === 'function') renderDashboardMetrics();
    if (selectedInspectorTx && typeof renderTxInspector === 'function') renderTxInspector(selectedInspectorTx);
    if ($('tx-modal') && !$('tx-modal').classList.contains('hidden') && typeof openTxCurrent !== 'undefined' && openTxCurrent) {
      openTxModal(openTxCurrent);
    }
  }

  /* ربط الشارات في جدول المعاملات وكروت شيت المنفذين */
  wrap('renderHomeTab', orig => function () {
    const r = orig.apply(this, arguments);
    try { renderPendingRefundBoxes(); } catch (e) {}
    return r;
  });

  wrap('renderRecentRequests', orig => function () {
    const r = orig.apply(this, arguments);
    try {
      renderPendingRefundBoxes();
      /* إضافة شارة الاسترداد على المعاملات التي بها بنود مستردة */
      document.querySelectorAll('#recent-table-body tr, #recent-cards-container > [data-tx]').forEach(el => {
        const txBtn = el.getAttribute('data-tx') ? el : el.querySelector('[data-tx]');
        const tx = txBtn ? txBtn.getAttribute('data-tx') : null;
        if (!tx || el.querySelector('.rf-tx-ind')) return;
        const ord = (typeof groupedOrders !== 'undefined' ? groupedOrders : []).find(o => String(o.transaction_id) === String(tx));
        if (!ord || !ord.lines) return;
        let hasFull = false, hasPart = false, hasPend = false;
        ord.lines.forEach(l => {
          const s = getLineRefundSummary(l.id);
          if (s.isFull) hasFull = true;
          else if (s.isPartial) hasPart = true;
          if (s.hasPending) hasPend = true;
        });
        if (!hasFull && !hasPart && !hasPend) return;
        const badgeHtml = hasFull
          ? '<span class="rf-badge rf-badge-full rf-tx-ind"><i class="fa-solid fa-rotate-left"></i>مسترد كليًا</span>'
          : hasPart
            ? '<span class="rf-badge rf-badge-partial rf-tx-ind"><i class="fa-solid fa-rotate-left"></i>مسترد جزئيًا</span>'
            : '<span class="rf-badge rf-badge-pending rf-tx-ind"><i class="fa-regular fa-clock"></i>استرداد معلّق</span>';
        const pill = el.querySelector('.rc-svc-list, .rc-tx-pill');
        if (pill) pill.insertAdjacentHTML('afterend', ' ' + badgeHtml);
      });
    } catch (e) {}
    return r;
  });

  wrap('filterExecSheet', orig => function () {
    const r = orig.apply(this, arguments);
    try { decorateTablesWithRefundBadges(); } catch (e) {}
    return r;
  });

  wrap('loadInitialData', orig => async function () {
    const res = await orig.apply(this, arguments);
    try {
      injectStyle();
      await loadRefunds(false);
      subscribeRefunds();
    } catch (e) { console.warn('p23 init', e); }
    return res;
  });

  wrap('handleLogout', orig => function () {
    try {
      if (state.rtCh && typeof sbClient !== 'undefined' && sbClient) sbClient.removeChannel(state.rtCh);
    } catch (e) {}
    state.rtCh = null;
    state.all = [];
    state.byLine = new Map();
    state.pending = [];
    state.loaded = false;
    return orig.apply(this, arguments);
  });
})();
