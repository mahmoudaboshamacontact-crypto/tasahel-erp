/* ===== المرحلة 16: علامة الخصم + علامة الكومنت على كروت آخر المعاملات ===== */
(function () {
  if (window.__phase16) return; window.__phase16 = true;
  const miss = e => /42P01|PGRST205|does not exist|schema cache/i.test(((e && e.message) || '') + ' ' + ((e && e.code) || ''));
  let cmt = new Map(), ch = null, at = 0, uid = null;
  const discOf = o => Math.max(0, ...o.lines.map(l => Number(l.discount_pct) || 0));

  function decorate() {
    const disc = new Map();
    groupedOrders.forEach(o => { const d = discOf(o); if (d > 0) disc.set(String(o.transaction_id), d); });
    const badges = tx => {
      const d = disc.get(tx), c = cmt.get(tx); let h = '';
      if (d) h += '<span class="f16-badge f16-b-disc"><i class="fa-solid fa-percent"></i>خصم ' + fmtNum(d) + '%</span>';
      if (c) h += '<span class="f16-badge f16-b-cmt" title="فيه تعليقات على المعاملة"><i class="fa-solid fa-comment-dots"></i>' + c + '</span>';
      return h;
    };
    const mark = (el, tx) => { if (disc.has(tx)) el.classList.add('f16-disc'); if (cmt.has(tx)) el.classList.add('f16-cmt'); };
    document.querySelectorAll('#recent-table-body tr').forEach(tr => {
      const b = tr.querySelector('[data-tx]'); if (!b) return;
      const tx = b.dataset.tx, h = badges(tx); if (!h) return;
      mark(tr, tx);
      const td = tr.querySelector('td'); if (td) td.insertAdjacentHTML('beforeend', '<div class="mt-1 flex flex-wrap gap-1">' + h + '</div>');
    });
    document.querySelectorAll('#recent-cards-container > [data-tx]').forEach(el => {
      const tx = el.dataset.tx, h = badges(tx); if (!h) return;
      mark(el, tx);
      el.insertAdjacentHTML('afterbegin', '<div class="mb-2 flex flex-wrap gap-1">' + h + '</div>');
    });
  }
  const _r = window.renderRecentRequests;
  window.renderRecentRequests = function () {
    const x = _r.apply(this, arguments);
    try { decorate(); } catch (e) { console.warn('p16', e); }
    return x;
  };

  async function loadCmt(force) {
    if (!sbClient || !currentUser) return;
    if (!force && Date.now() - at < 20000) return; at = Date.now();
    const m = new Map();
    for (let f = 0; ; f += 1000) {
      const r = await sbClient.from('tx_comments').select('transaction_id').gte('created_at', DATA_FROM_TS).order('id', { ascending: true }).range(f, f + 999);
      if (r.error) { if (!miss(r.error)) console.warn('p16 comments', r.error); return; }
      (r.data || []).forEach(x => { const k = String(x.transaction_id); m.set(k, (m.get(k) || 0) + 1); });
      if ((r.data || []).length < 1000) break;
    }
    cmt = m; window.renderRecentRequests();
  }
  function sub() {
    try { if (ch) sbClient.removeChannel(ch); } catch (e) { /* */ }
    ch = sbClient.channel('p16-cmt').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tx_comments' }, p => {
      const t = p.new && String(p.new.transaction_id); if (!t) return;
      cmt.set(t, (cmt.get(t) || 0) + 1); window.renderRecentRequests();
    }).subscribe();
  }

  const _li = window.loadInitialData;
  window.loadInitialData = async function () {
    const x = await _li.apply(this, arguments);
    if (window.__role && window.__role !== 'partner' && sbClient && currentUser) { uid = currentUser.id; loadCmt(true); sub(); }
    return x;
  };
  const _lr = window.loadRecentRequests;
  window.loadRecentRequests = async function () { const x = await _lr.apply(this, arguments); if (uid) loadCmt(false); return x; };
  const _lo = window.handleLogout;
  window.handleLogout = async function () {
    uid = null; cmt = new Map();
    try { if (ch && sbClient) sbClient.removeChannel(ch); } catch (e) { /* */ }
    ch = null; return _lo.apply(this, arguments);
  };
})();
