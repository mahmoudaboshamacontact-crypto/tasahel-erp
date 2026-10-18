
/* ===== تحسينات الشات: اسم المرسل + التاريخ والساعة + المنشن @ + الإيموجي ===== */
(function () {
  if (window.__chatUpgrade) return;
  window.__chatUpgrade = true;

  const $q = id => document.getElementById(id);
  const mentionFlag = {};            // محادثات فيها منشن لسه ماتقراش
  let mIdx = 0, mList = [];
  const EMOJIS = ('😀 😃 😄 😁 😆 😅 😂 🤣 🙂 😉 😊 😍 🥰 😘 😎 🤩 🥳 🤔 😐 😴 😢 😭 😡 🤯 😱 🙏 👍 👎 👏 🙌 💪 🤝 👋 ✌️ 👌 ❤️ 💔 🔥 ⭐ ✨ 🎉 ✅ ❌ ⚠️ ❓ ❗ 💯 📌 📎 📞 📱 💰 💵 🧾 📄 📅 ⏰ 🚚 🏢 ☕ 🌹').split(' ');

  const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const myName = () => ((typeof myProfile !== 'undefined' && myProfile && myProfile.full_name) || '').trim();
  const allNames = () => profiles.map(p => (p.full_name || '').trim()).filter(Boolean).sort((a, b) => b.length - a.length);

  /* ---------- المنشن ---------- */
  function mentionedNames(body) {
    const names = allNames();
    if (!names.length) return [];
    const re = new RegExp('@(' + names.map(reEsc).join('|') + ')', 'gi'), out = [];
    let m;
    while ((m = re.exec(body || ''))) out.push(m[1].toLowerCase());
    return out;
  }
  function mentionsMe(body) {
    const n = myName().toLowerCase();
    return !!n && mentionedNames(body).includes(n);
  }
  window.chatFormat = function (body) {
    let h = escapeHtml(body);
    const names = allNames();
    if (names.length) {
      const re = new RegExp('@(' + names.map(n => reEsc(escapeHtml(n))).join('|') + ')', 'g');
      const me = escapeHtml(myName()).toLowerCase();
      h = h.replace(re, function (_, n) {
        return '<span class="' + (n.toLowerCase() === me ? 'bg-amber-300 text-slate-900' : 'bg-black/10 dark:bg-white/15') + ' rounded px-1 font-semibold">@' + n + '</span>';
      });
    }
    return h.replace(/\n/g, '<br>').replace(/(https?:\/\/[^\s<]+)/g, function (u) {
      return '<a href="' + u + '" target="_blank" rel="noopener noreferrer" class="underline break-all">' + u + '</a>';
    });
  };

  /* ---------- التاريخ والساعة ---------- */
  const fmtDay = s => new Intl.DateTimeFormat('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(s));
  const fmtStamp = s => new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(s));
  function dayText(s) {
    const k = dayKey(s), t = dayKey(new Date()), y = dayKey(new Date(Date.now() - 86400000));
    return (k === t ? 'اليوم · ' : k === y ? 'أمس · ' : '') + fmtDay(s);
  }
  window.chatTimeShort = function (s) {
    if (!s) return '';
    const d = new Date(s);
    if (isNaN(d)) return '';
    const txt = dayKey(s) === dayKey(new Date())
      ? new Intl.DateTimeFormat('ar-EG', { hour: 'numeric', minute: '2-digit', hour12: true }).format(d)
      : new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'short' }).format(d);
    return '<bdi>' + txt + '</bdi>';
  };

  /* ---------- عرض الرسائل: صورة + اسم المرسل + التاريخ والساعة ---------- */
  window.renderChatThread = function (toBottom) {
    const box = $q('chat-msgs'), cid = chatActive;
    if (!box || !cid) return;
    const list = chatMsgs[cid] || [], it = chatItem(cid), group = it && it.ch_kind === 'general';
    const byId = new Map(list.map(m => [m.id, m]));
    const wasNear = box.scrollHeight - box.scrollTop - box.clientHeight < 140;
    let h = chatHasMore[cid] ? '<div class="text-center mb-3"><button type="button" onclick="loadOlderChat()" class="rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-4 py-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">تحميل رسائل أقدم</button></div>' : '';
    if (!list.length) h += '<div class="py-12 text-center text-xs text-slate-400">لا توجد رسائل بعد. ابدأ المحادثة 👋</div>';
    let lastDay = '', lastSender = '';
    list.forEach(function (m) {
      const dk = dayKey(m.created_at), mine = m.sender_id === currentUser.id;
      if (dk !== lastDay) {
        h += '<div class="my-3 text-center"><span class="rounded-full bg-slate-200/70 dark:bg-slate-800 px-3 py-1 text-[10px] font-semibold text-slate-500">' + escapeHtml(dayText(m.created_at)) + '</span></div>';
        lastDay = dk; lastSender = '';
      }
      const first = lastSender !== m.sender_id;
      lastSender = m.sender_id;
      const p = profileById(m.sender_id), nm = mine ? 'أنت' : nameOfUser(m.sender_id), mentioned = !mine && mentionsMe(m.body);
      let quote = '';
      if (m.reply_to) {
        const q = byId.get(m.reply_to);
        quote = '<div class="mb-1 rounded-lg border-s-4 ' + (mine ? 'border-white/60 bg-white/15' : 'border-brand-500 bg-slate-100 dark:bg-slate-700/60') + ' px-2 py-1 text-[11px]"><div class="font-bold">' + escapeHtml(q ? (q.sender_id === currentUser.id ? 'أنت' : nameOfUser(q.sender_id)) : 'رسالة سابقة') + '</div>' + (q ? '<div class="truncate opacity-80">' + escapeHtml(q.body.replace(/\s+/g, ' ').slice(0, 90)) + '</div>' : '') + '</div>';
      }
      const head = first
        ? '<div class="mb-0.5 text-[11px] font-bold" style="color:' + (mine ? 'rgba(255,255,255,.9)' : avColor(m.sender_id)) + '">' + escapeHtml(nm) +
          (group && !mine && p && p.job_title ? ' <span class="font-normal opacity-60">· ' + escapeHtml(p.job_title) + '</span>' : '') + '</div>'
        : '';
      const stamp = '<div class="mt-1 text-[10px] ' + (mine ? 'text-white/75' : 'text-slate-400') + ' text-end" title="' + escapeHtml(new Date(m.created_at).toLocaleString('ar-EG')) + '"><bdi>' + fmtStamp(m.created_at) + '</bdi></div>';
      const bubble = '<div class="max-w-[80%] sm:max-w-[68%] rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm ' +
        (mine ? 'bg-brand-600 text-white rounded-te-md' : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-700 rounded-ts-md') +
        (mentioned ? ' ring-2 ring-amber-400' : '') + '">' + head + quote + '<div class="break-words">' + chatFormat(m.body) + '</div>' + stamp + '</div>';
      const acts = '<div class="flex items-center gap-1 self-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-60 transition">' +
        '<button type="button" data-m="' + escapeHtml(m.id) + '" onclick="startChatReply(this.dataset.m)" class="h-6 w-6 rounded-full text-slate-400 hover:text-brand-600 hover:bg-slate-200/60 dark:hover:bg-slate-700" title="رد"><i class="fa-solid fa-reply text-[11px]"></i></button>' +
        (mine ? '<button type="button" data-m="' + escapeHtml(m.id) + '" onclick="deleteChatMessage(this.dataset.m)" class="h-6 w-6 rounded-full text-slate-400 hover:text-rose-600 hover:bg-slate-200/60 dark:hover:bg-slate-700" title="حذف"><i class="fa-solid fa-trash-can text-[11px]"></i></button>' : '') + '</div>';
      const av = mine ? '' : (first ? avatarHtml(p || { id: m.sender_id, full_name: nm }, 30) : '<span class="shrink-0" style="width:30px"></span>');
      h += '<div class="group flex items-end gap-2 ' + (first ? 'mt-3' : 'mt-0.5') + ' ' + (mine ? 'justify-end' : 'justify-start') + '" data-mid="' + escapeHtml(m.id) + '">' +
        (mine ? acts + bubble : av + bubble + acts) + '</div>';
    });
    box.innerHTML = h;
    if (toBottom || wasNear) box.scrollTop = box.scrollHeight;
  };

  /* ---------- إيموجي + منشن (واجهة الكتابة) ---------- */
  function insertAtCaret(text) {
    const el = $q('chat-input'), s = el.selectionStart == null ? el.value.length : el.selectionStart, e = el.selectionEnd == null ? s : el.selectionEnd;
    el.value = el.value.slice(0, s) + text + el.value.slice(e);
    const p = s + text.length;
    el.setSelectionRange(p, p); el.focus(); chatAutoGrow(el);
  }
  function hideMention() { const b = $q('mention-box'); if (b) b.classList.add('hidden'); mList = []; }
  function paintMention() {
    const b = $q('mention-box');
    b.innerHTML = mList.map((p, i) => '<button type="button" data-u="' + escapeHtml(p.id) + '" class="flex w-full items-center gap-2.5 px-3 py-2 text-start ' + (i === mIdx ? 'bg-brand-50 dark:bg-brand-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800') + '">' +
      avatarHtml(p, 28) + '<span class="min-w-0"><span class="block truncate text-sm font-semibold text-ink dark:text-white">' + escapeHtml(p.full_name) + '</span><span class="block truncate text-[11px] text-slate-400">' + escapeHtml(p.job_title || '') + '</span></span></button>').join('');
  }
  function updateMention() {
    const el = $q('chat-input'), b = $q('mention-box');
    if (!el || !b || !currentUser) return;
    const before = el.value.slice(0, el.selectionStart == null ? el.value.length : el.selectionStart);
    const m = before.match(/(^|\s)@([^\s@]*)$/);
    if (!m) return hideMention();
    const q = m[2].toLowerCase(), it = chatItem(chatActive);
    let pool = profiles.filter(p => p.id !== currentUser.id && (p.full_name || '').trim());
    if (it && it.ch_kind === 'dm') pool = pool.filter(p => p.id === it.other_user);
    mList = pool.filter(p => p.full_name.toLowerCase().includes(q)).slice(0, 6);
    if (!mList.length) return hideMention();
    mIdx = 0; paintMention();
    $q('emoji-panel').classList.add('hidden');
    b.classList.remove('hidden');
  }
  function pickMention(uid) {
    const p = profileById(uid), el = $q('chat-input');
    if (!p) return;
    const pos = el.selectionStart, m = el.value.slice(0, pos).match(/(^|\s)@([^\s@]*)$/);
    if (!m) return;
    const start = pos - m[2].length - 1, name = p.full_name.trim();
    el.value = el.value.slice(0, start) + '@' + name + ' ' + el.value.slice(pos);
    const np = start + name.length + 2;
    el.setSelectionRange(np, np); hideMention(); el.focus(); chatAutoGrow(el);
  }
  function ensureUI() {
    const inp = $q('chat-input');
    if (!inp || $q('emoji-btn')) return;
    const form = inp.closest('form');
    form.classList.add('relative');
    const mk = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };
    const emojiBtn = mk('<button type="button" id="emoji-btn" class="shrink-0 h-10 w-10 rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title="إيموجي"><i class="fa-regular fa-face-smile text-lg"></i></button>');
    const atBtn = mk('<button type="button" id="at-btn" class="shrink-0 h-10 w-10 rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-base" title="منشن">@</button>');
    const panel = mk('<div id="emoji-panel" class="hidden absolute bottom-full start-3 mb-2 z-20 w-72 max-w-[90vw] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 shadow-xl"><div class="grid grid-cols-8 gap-1 max-h-48 overflow-y-auto">' +
      EMOJIS.map(e => '<button type="button" data-e="' + e + '" class="h-8 rounded-lg text-xl hover:bg-slate-100 dark:hover:bg-slate-800">' + e + '</button>').join('') + '</div></div>');
    const mbox = mk('<div id="mention-box" class="hidden absolute bottom-full start-3 mb-2 z-20 w-64 max-w-[90vw] overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl"></div>');
    form.insertBefore(atBtn, inp); form.insertBefore(emojiBtn, atBtn);
    form.appendChild(panel); form.appendChild(mbox);
    emojiBtn.addEventListener('click', () => { hideMention(); panel.classList.toggle('hidden'); });
    panel.addEventListener('click', e => { const b = e.target.closest('[data-e]'); if (b) insertAtCaret(b.dataset.e); });
    atBtn.addEventListener('click', () => {
      const v = inp.value, pos = inp.selectionStart == null ? v.length : inp.selectionStart;
      insertAtCaret((pos > 0 && !/\s/.test(v[pos - 1]) ? ' ' : '') + '@'); updateMention();
    });
    mbox.addEventListener('mousedown', e => { e.preventDefault(); const b = e.target.closest('[data-u]'); if (b) pickMention(b.dataset.u); });
    inp.addEventListener('input', updateMention);
    inp.addEventListener('click', updateMention);
    form.addEventListener('submit', () => { panel.classList.add('hidden'); hideMention(); });
    document.addEventListener('click', e => { if (!e.target.closest('#emoji-panel,#emoji-btn')) panel.classList.add('hidden'); });
  }

  const _key = window.chatKey;
  window.chatKey = function (e) {
    const b = $q('mention-box');
    if (b && !b.classList.contains('hidden') && mList.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); mIdx = (mIdx + 1) % mList.length; paintMention(); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); mIdx = (mIdx - 1 + mList.length) % mList.length; paintMention(); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMention(mList[mIdx].id); return; }
      if (e.key === 'Escape') { hideMention(); return; }
    }
    return _key(e);
  };

  /* ---------- إشعار المنشن ---------- */
  const _insert = window.onChatInsert;
  window.onChatInsert = async function (m) {
    const ment = !!m && !!currentUser && m.sender_id !== currentUser.id && mentionsMe(m.body);
    await _insert(m);
    if (ment) {
      if (!(chatActive === m.channel_id && chatVisible())) { mentionFlag[m.channel_id] = true; window.renderChatList(); }
      showToast('📣 ' + nameOfUser(m.sender_id) + ' ذكرك في رسالة', 'info', 6000);
      chatBeep();
    }
  };
  const _open = window.openChat;
  window.openChat = async function (cid) { mentionFlag[cid] = false; return _open(cid); };
  const _list = window.renderChatList;
  window.renderChatList = function () {
    _list();
    document.querySelectorAll('#chat-list [data-cid]').forEach(b => {
      if (mentionFlag[b.dataset.cid] && !b.querySelector('.mention-dot')) {
        b.classList.add('relative');
        b.insertAdjacentHTML('beforeend', '<span class="mention-dot absolute top-2.5 end-16 rounded-full bg-amber-400 px-1.5 text-[10px] font-bold text-slate-900">@</span>');
      }
    });
  };

  ensureUI();
})();
