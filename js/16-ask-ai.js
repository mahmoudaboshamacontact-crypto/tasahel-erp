/* ===== زر الشات الداخلي السريع (فتح الشات بضغطة، وإغلاقه والرجوع للتابة السابقة بالضغطة التانية) ===== */
(function () {
  if (window.__phase14) return; window.__phase14 = true;
  let prevTabBeforeChat = 'home';
  const isPartnerOrCourier = () => window.__role === 'partner' || window.__role === 'courier' || (document.body && (document.body.classList.contains('is-partner-mode') || document.body.classList.contains('is-courier-mode')));

  function syncFabBadge() {
    const fab = $('ai-fab'), bdg = $('ai-fab-badge'), ic = $('ai-fab-icon'), src = $('chat-badge');
    if (!fab || !bdg) return;
    if (isPartnerOrCourier()) { fab.classList.add('hidden'); return; }
    fab.classList.remove('hidden');
    const inChat = typeof currentTab !== 'undefined' && currentTab === 'chat';
    fab.classList.toggle('on', inChat);
    fab.title = inChat ? 'إغلاق الشات والرجوع للشاشة السابقة' : 'فتح الشات الداخلي';
    if (ic) ic.className = inChat ? 'fa-solid fa-xmark' : 'fa-solid fa-comments';
    const txt = src && !src.classList.contains('hidden') ? (src.textContent || '').trim() : '';
    const n = parseInt(txt, 10) || 0;
    if (n > 0 && !inChat) {
      bdg.textContent = n > 99 ? '+99' : String(n);
      bdg.classList.remove('hidden');
    } else {
      bdg.textContent = '0';
      bdg.classList.add('hidden');
    }
  }

  window.aiToggle = function () {
    if (typeof window.switchTab !== 'function') return;
    const cur = typeof currentTab !== 'undefined' ? currentTab : 'home';
    if (cur === 'chat') {
      const target = (prevTabBeforeChat && prevTabBeforeChat !== 'chat') ? prevTabBeforeChat : 'home';
      window.switchTab(target);
    } else {
      prevTabBeforeChat = cur || 'home';
      window.switchTab('chat');
    }
    syncFabBadge();
  };

  function inject() {
    const oldPanel = $('ai-panel'); if (oldPanel) oldPanel.remove();
    if (isPartnerOrCourier()) { const f = $('ai-fab'); if (f) f.remove(); return; }
    if ($('ai-fab')) { syncFabBadge(); return; }
    document.body.insertAdjacentHTML('beforeend',
      '<button id="ai-fab" type="button" onclick="aiToggle()" class="ai-fab" style="background:linear-gradient(135deg,#ea580c,#c2410c);color:#fff;box-shadow:0 8px 24px -4px rgba(234,88,12,.65)" title="فتح الشات الداخلي" aria-label="الشات الداخلي">' +
        '<i id="ai-fab-icon" class="fa-solid fa-comments" style="font-size:1.35rem"></i>' +
        '<span id="ai-fab-badge" class="hidden" style="position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;border-radius:999px;background:#e11d48;color:#fff;font-size:11px;font-weight:800;line-height:20px;padding:0 5px;border:2px solid #fff">0</span>' +
      '</button>');
    syncFabBadge();
  }

  const _ucb = window.updateChatBadges;
  if (typeof _ucb === 'function') {
    window.updateChatBadges = function () {
      const r = _ucb.apply(this, arguments);
      try { syncFabBadge(); } catch (e) { /* */ }
      return r;
    };
  }
  const _li = window.loadInitialData;
  window.loadInitialData = async function () { const x = await _li.apply(this, arguments); try { inject(); } catch (e) { /* */ } return x; };
  const _sw = window.switchTab;
  if (typeof _sw === 'function') {
    window.switchTab = function (id) {
      const cur = typeof currentTab !== 'undefined' ? currentTab : 'home';
      if (id === 'chat' && cur && cur !== 'chat') prevTabBeforeChat = cur;
      const r = _sw.apply(this, arguments);
      try { inject(); syncFabBadge(); } catch (e) { /* */ }
      return r;
    };
  }
  setTimeout(function () { try { inject(); } catch (e) { /* */ } }, 1500);
  const _lo = window.handleLogout;
  window.handleLogout = async function () { ['ai-fab', 'ai-panel'].forEach(id => { const e = $(id); if (e) e.remove(); }); return _lo.apply(this, arguments); };
})();
