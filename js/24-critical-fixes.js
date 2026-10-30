/* phase24: حذف ناعم + سجل أخطاء + قفل أسعار + استفسارات العملاء + رابط المتابعة */
(function () {
  if (window.__phase24) return;
  window.__phase24 = true;

  var eh = escapeHtml;
  var SOFT = ['request_lines', 'tx_comments', 'tasks'];
  var isMgr = function () { return window.__role === 'manager'; };
  var haveDb = function () { return typeof sbClient !== 'undefined' && !!sbClient; };

  function patchSupabase() {
    if (!haveDb() || sbClient.__phase24) return;
    var orig = sbClient.from.bind(sbClient);
    sbClient.from = function (table) {
      var b = orig(table);
      if (SOFT.indexOf(table) !== -1) {
        b.delete = function () { return b.update({ deleted_at: new Date().toISOString() }); };
      }
      if (table === 'tx_comments') {
        var oi = b.insert.bind(b);
        b.insert = function (row, opts) {
          if (window.__txcPublic && row && !Array.isArray(row) && row.is_public === undefined) {
            row = Object.assign({}, row, { is_public: true });
          }
          return oi(row, opts);
        };
      }
      return b;
    };
    sbClient.__phase24 = true;
  }

  var errCount = 0, errSeen = {};
  async function logError(err, ctx) {
    try {
      if (!haveDb() || typeof currentUser === 'undefined' || !currentUser) return;
      var msg = String(err && err.message ? err.message : err).slice(0, 500);
      if (errCount >= 20 || errSeen[msg]) return;
      errSeen[msg] = 1; errCount++;
      await sbClient.from('error_log').insert({
        user_id: currentUser.id,
        user_email: currentUser.email,
        message: msg,
        stack: err && err.stack ? String(err.stack).slice(0, 2000) : null,
        context: ctx || null,
        user_agent: navigator.userAgent,
        url: location.href
      });
    } catch (e) { /* */ }
  }
  window.addEventListener('error', function (e) { logError(e.error || new Error(e.message), { kind: 'window.error' }); });
  window.addEventListener('unhandledrejection', function (e) { logError(e.reason || new Error('unhandled promise'), { kind: 'promise' }); });

  var _ote = window.openTxEdit;
  if (typeof _ote === 'function') {
    window.openTxEdit = async function (tx) {
      await _ote.apply(this, arguments);
      try {
        var o = groupedOrders.find(function (x) { return String(x.transaction_id) === String(tx); });
        if (!o) return;
        var n = 0;
        document.querySelectorAll('#tx-edit-modal [data-lid]').forEach(function (blk) {
          var l = o.lines.find(function (x) { return String(x.id) === blk.dataset.lid; });
          if (l && l.status === 'Delivered') {
            ['.te-l-price', '.te-l-qty'].forEach(function (s) {
              var i = blk.querySelector(s);
              if (i) { i.readOnly = true; i.style.opacity = '.6'; i.title = 'مقفول: البند تم تسليمه'; }
            });
            n++;
          }
        });
        if (n) showToast('السعر والكمية مقفولين على ' + n + ' بند مسلّم', 'info', 5000);
      } catch (e) { console.warn('p24 edit', e); }
    };
  }

  function copyLink(o) {
    var l = o.lines.find(function (x) { return x.tracking_token; });
    if (!l) return showToast('المعاملة دي قديمة وملهاش رابط متابعة', 'error', 6000);
    var url = location.origin + location.pathname.replace(/[^\/]*$/, '') + 'Track.html?token=' + encodeURIComponent(l.tracking_token);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () { showToast('تم نسخ رابط المتابعة'); }, function () { prompt('انسخ الرابط:', url); });
    } else { prompt('انسخ الرابط:', url); }
  }
  function decorateTxModal(tx) {
    var ta = document.getElementById('txc-input');
    if (ta && !document.getElementById('txc-public')) {
      ta.insertAdjacentHTML('afterend', '<label class="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300"><input id="txc-public" type="checkbox" class="h-4 w-4 rounded"> يظهر للعميل في صفحة المتابعة</label>');
    }
    var bar = document.getElementById('tx-modal-actions-left');
    var o = groupedOrders.find(function (x) { return String(x.transaction_id) === String(tx); });
    if (bar && o && !document.getElementById('p24-link')) {
      bar.insertAdjacentHTML('beforeend', '<button id="p24-link" type="button" class="px-3 py-2 rounded-xl bg-violet-600 text-white text-xs font-bold flex items-center gap-1.5"><i class="fa-solid fa-link"></i><span>رابط المتابعة</span></button>');
      document.getElementById('p24-link').onclick = function () { copyLink(o); };
    }
  }
  var _otm = window.openTxModal;
  if (typeof _otm === 'function') {
    window.openTxModal = function (tx) {
      var r = _otm.apply(this, arguments);
      try { decorateTxModal(tx); } catch (e) { console.warn('p24 modal', e); }
      return r;
    };
  }
  var _txs = window.txcSubmit;
  if (typeof _txs === 'function') {
    window.txcSubmit = async function (e) {
      var c = document.getElementById('txc-public');
      var pub = !!(c && c.checked);
      if (pub && !confirm('التعليق ده هيظهر للعميل في صفحة المتابعة. تكمل؟')) { if (e && e.preventDefault) e.preventDefault(); return; }
      window.__txcPublic = pub;
      try { return await _txs.apply(this, arguments); }
      finally { window.__txcPublic = false; if (c) c.checked = false; }
    };
  }

  function setBadge(n) {
    var b = document.getElementById('inq-badge');
    if (b) { b.textContent = n > 99 ? '99+' : String(n); b.classList.toggle('hidden', !n); }
  }
  async function inqCount() {
    if (!isMgr() || !haveDb()) return;
    var r = await sbClient.from('customer_inquiries').select('id', { count: 'exact', head: true }).eq('status', 'pending');
    if (!r.error) setBadge(r.count || 0);
  }
  function injectInquiriesTab() {
    if (!isMgr() || document.getElementById('tab-inquiries-btn')) return;
    var menu = document.getElementById('nav-menu'), main = document.querySelector('main');
    if (!menu || !main) return;
    var btn = document.createElement('button');
    btn.id = 'tab-inquiries-btn';
    btn.type = 'button';
    btn.className = 'tab-btn text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800';
    btn.onclick = function () { switchTab('inquiries'); };
    btn.innerHTML = '<i class="fa-solid fa-headset text-rose-500"></i><span>استفسارات العملاء</span><span id="inq-badge" class="hidden rounded-full bg-rose-600 text-white text-[10px] font-bold px-1.5 min-w-[18px] text-center leading-[18px] me-auto">0</span>';
    var hr = menu.querySelector('hr');
    if (hr) menu.insertBefore(btn, hr); else menu.appendChild(btn);

    var pane = document.createElement('div');
    pane.id = 'tab-inquiries';
    pane.className = 'hidden space-y-4';
    pane.innerHTML = '<div class="card p-4 sm:p-5"><div class="flex items-center gap-3 mb-4"><span class="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-600 text-white"><i class="fa-solid fa-headset"></i></span><div><h2 class="font-bold text-ink dark:text-white text-sm sm:text-base">صندوق استفسارات العملاء</h2><p class="text-xs text-slate-500">الرسائل الواردة من بوابة التتبع الخاصة بالعملاء</p></div></div><div id="inquiries-list" class="space-y-3"></div></div>';
    main.appendChild(pane);
    document.getElementById('inquiries-list').addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (b) submitReply(b);
    });
  }
  async function loadInquiries() {
    var list = document.getElementById('inquiries-list');
    if (!isMgr() || !haveDb() || !list) return;
    list.innerHTML = '<div class="text-center text-xs text-slate-400 py-6">جارٍ التحميل...</div>';
    var r = await sbClient.from('customer_inquiries').select('*').order('created_at', { ascending: false }).limit(100);
    if (r.error) { list.innerHTML = '<div class="text-center text-xs text-rose-500 py-6">تعذّر تحميل الرسائل: ' + eh(r.error.message) + '</div>'; return; }
    var data = r.data || [];
    setBadge(data.filter(function (d) { return d.status === 'pending'; }).length);
    if (!data.length) { list.innerHTML = '<div class="text-center text-xs text-slate-400 py-6">لا توجد استفسارات حالياً</div>'; return; }
    list.innerHTML = data.map(function (inq) {
      var pending = inq.status === 'pending';
      var when = inq.created_at ? new Date(inq.created_at).toLocaleString('ar-EG') : '';
      return '<div data-card="1" class="card p-4 border-r-4 ' + (pending ? 'border-r-rose-500' : 'border-r-emerald-500 opacity-60') + '">' +
        '<div class="flex justify-between items-start mb-2 gap-2"><div class="min-w-0"><span class="text-xs font-bold text-ink dark:text-white">' + eh(inq.client_name || 'عميل') + '</span> <span class="text-[10px] text-slate-400 font-mono" dir="ltr">#' + eh(inq.transaction_id) + '</span></div><span class="text-[10px] text-slate-400 shrink-0">' + eh(when) + '</span></div>' +
        '<div class="bg-slate-50 dark:bg-slate-800 p-3 rounded-lg text-sm text-slate-700 dark:text-slate-300 mb-3 border border-slate-100 dark:border-slate-700 whitespace-pre-wrap break-words">' + eh(inq.body) + '</div>' +
        (pending
          ? '<div class="space-y-2"><input type="text" maxlength="1000" id="reply-input-' + eh(inq.id) + '" placeholder="اكتب ردك هنا..." class="field !py-1.5 text-xs w-full"><div class="flex justify-end gap-2">' +
            '<button type="button" data-act="reply" data-id="' + eh(inq.id) + '" data-tx="' + eh(inq.transaction_id) + '" data-pub="0" class="rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-3 py-1.5 text-[11px] font-bold">حفظ (ملاحظة داخلية)</button>' +
            '<button type="button" data-act="reply" data-id="' + eh(inq.id) + '" data-tx="' + eh(inq.transaction_id) + '" data-pub="1" class="rounded-lg bg-violet-600 hover:bg-violet-700 text-white px-3 py-1.5 text-[11px] font-bold"><i class="fa-solid fa-paper-plane text-[10px] ms-1"></i> إرسال (للعميل)</button></div></div>'
          : '<div class="text-[11px] text-emerald-600 font-bold"><i class="fa-solid fa-check-circle"></i> تم الرد / التحويل</div>') +
        '</div>';
    }).join('');
  }
  async function submitReply(btn) {
    var id = btn.dataset.id, tx = btn.dataset.tx, pub = btn.dataset.pub === '1';
    var input = document.getElementById('reply-input-' + id);
    var body = input ? input.value.trim() : '';
    if (!body) return showToast('اكتب الرد الأول', 'error');
    var card = btn.closest('[data-card]');
    var all = card ? card.querySelectorAll('button') : [btn];
    all.forEach(function (b) { b.disabled = true; });
    try {
      var r1 = await sbClient.from('tx_comments').insert({ transaction_id: tx, author_id: currentUser.id, body: body, is_public: pub });
      if (r1.error) throw r1.error;
      var r2 = await sbClient.from('customer_inquiries').update({ status: pub ? 'replied' : 'converted' }).eq('id', id);
      if (r2.error) throw r2.error;
      showToast(pub ? 'تم إرسال الرد للعميل' : 'تم حفظ الملاحظة داخلياً');
      loadInquiries();
    } catch (e) {
      showError('تعذّر حفظ الرد', e);
      all.forEach(function (b) { b.disabled = false; });
    }
  }

  var _sw = window.switchTab;
  if (typeof _sw === 'function') {
    window.switchTab = function (id) {
      var r = _sw.apply(this, arguments);
      var pane = document.getElementById('tab-inquiries'), btn = document.getElementById('tab-inquiries-btn');
      if (pane) {
        pane.classList.toggle('hidden', id !== 'inquiries');
        if (id === 'inquiries') loadInquiries();
      }
      if (btn) btn.className = 'tab-btn ' + (id === 'inquiries' ? 'bg-ink text-white dark:bg-brand-600 shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800');
      return r;
    };
  }
  var _li = window.loadInitialData;
  if (typeof _li === 'function') {
    window.loadInitialData = async function () {
      var r = await _li.apply(this, arguments);
      try { patchSupabase(); injectInquiriesTab(); inqCount(); } catch (e) { console.warn('p24 init', e); }
      return r;
    };
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) inqCount(); });
})();
