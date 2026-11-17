/* =====================================================================
   72-courier-v12-modern.js | تطويرات بوابة المندوب الحديثة (v12)
   - خريطة تفاعلية مدمجة + مثبت الدبوس اليدوي (بدون مرفقات أو مكتبات خارجية)
   - توقيع العميل الخفيف بصباعه (SVG Path < 2KB بدون صور أو Storage)
   - المساعد الصوتي المجاني (SpeechRecognition + SpeechSynthesis)
   - طابور العمل بدون نت (Offline Queue) + استجابة الاهتزاز والصوت (Haptic)
   - رادار القرب التلقائي (<150م عند العميل، <1كم عند المكتب)
   - تجميع المناطق + قوالب واتساب + مؤقت الانتظار + تراجع 5 ثواني
   ===================================================================== */
(function () {
  if (window.__courierV12) return;
  window.__courierV12 = true;

  const OFFLINE_KEY = 'cp_v12_offline_queue';
  const PRESET_KEY = 'cp_v12_route_presets';
  const OFFICE_POS = { lat: 30.0012, lng: 31.1765 }; // فيصل — مقر تساهيل

  let audioCtx = null;
  function haptic(ok) {
    try { if (navigator.vibrate) navigator.vibrate(ok ? [35, 25, 45] : [90, 50, 90]); } catch (e) {}
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = ok ? 'sine' : 'triangle';
      o.frequency.value = ok ? 920 : 280;
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.14, audioCtx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + (ok ? 0.12 : 0.22));
      o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + (ok ? 0.13 : 0.23));
    } catch (e) {}
  }

  function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  /* ---------- 1) طابور العمل بدون إنترنت (Offline-First Queue) ---------- */
  function readQueue() {
    try { return JSON.parse(localStorage.getItem(OFFLINE_KEY) || '[]'); } catch (e) { return []; }
  }
  function writeQueue(q) {
    try { localStorage.setItem(OFFLINE_KEY, JSON.stringify((q || []).slice(0, 60))); } catch (e) {}
  }
  async function myUid() {
    try { const r = await sbClient.auth.getSession(); return (r && r.data && r.data.session && r.data.session.user && r.data.session.user.id) || null; } catch (e) { return null; }
  }
  /* الطابور مربوط بحساب المندوب (uid) عشان موبايل مشترك ما يبعتش شغل واحد باسم التاني */
  async function enqueue(rpcName, args) {
    const q = readQueue();
    q.push({ rpc: rpcName, args: args, at: Date.now(), uid: await myUid() });
    writeQueue(q);
    return { queued: true };
  }
  async function queueOrRun(rpcName, args) {
    if (!navigator.onLine) return enqueue(rpcName, args);
    try {
      const r = await sbClient.rpc(rpcName, args);
      if (r && r.error) throw r.error;
      return r;
    } catch (e) {
      if (!navigator.onLine || /fetch|network|failed/i.test(String(e && e.message || ''))) return enqueue(rpcName, args);
      throw e;
    }
  }
  let flushing = false;
  async function flushOfflineQueue() {
    if (!navigator.onLine || flushing) return 0;
    const q = readQueue();
    if (!q.length) return 0;
    flushing = true;
    const me = await myUid();
    const left = [];
    let synced = 0, dropped = 0;
    try {
      for (const job of q) {
        if (!job.uid || Date.now() - Number(job.at || 0) > 48 * 3600 * 1000) { dropped++; continue; } /* قديم/بدون صاحب: نشيله */
        if (job.uid !== me) { left.push(job); continue; } /* بتاع مندوب تاني: ما نلمسوش */
        try {
          const r = await sbClient.rpc(job.rpc, job.args);
          if (r && r.error) {
            if (/^(42501|22023|23)/.test(String(r.error.code || '')) || /not your|forbidden|invalid/i.test(String(r.error.message || ''))) dropped++; /* رفض نهائي */
            else left.push(job);
          } else synced++;
        } catch (e) { left.push(job); }
      }
      writeQueue(left);
    } finally { flushing = false; }
    if (synced && typeof showToast === 'function') showToast('تمت مزامنة ' + synced + ' عمليات كانت محفوظة أوفلاين ✓');
    if (dropped && typeof showToast === 'function') showToast(dropped + ' عملية قديمة أو مرفوضة اتشالت من الطابور', 'error');
    return synced;
  }
  window.addEventListener('online', () => { flushOfflineQueue(); });

  /* ---------- 2) توقيع العميل الخفيف SVG (بدون مرفقات أو صور) ---------- */
  function openSignatureModal(tx, clientName, onSaved) {
    const root = document.getElementById('cp-modal-root');
    if (!root) return;
    root.innerHTML =
      '<div class="cp-modal" data-act="mclose"><div class="cp-box" style="max-width:420px">' +
        '<h3>✍️ توقيع العميل الإلكتروني</h3>' +
        '<p>توقيع العميل بصباعه على استلام/تسليم المعاملة <b dir="ltr">' + String(tx) + '</b> (يتحفظ كنص خفيف بدون صور):</p>' +
        '<input id="cp-sig-name" type="text" class="cp-field" style="margin-bottom:8px" value="' + String(clientName || '').replace(/"/g, '&quot;') + '" placeholder="اسم الموقّع">' +
        '<div style="background:#fff;border-radius:14px;border:2px dashed #10b981;overflow:hidden;touch-action:none">' +
          '<canvas id="cp-sig-canvas" width="360" height="170" style="width:100%;height:170px;display:block;cursor:crosshair"></canvas>' +
        '</div>' +
        '<div class="cp-btns" style="margin-top:10px">' +
          '<button type="button" class="cp-btn" id="cp-sig-clear">مسح التوقيع</button>' +
          '<button type="button" class="cp-btn cp-go" id="cp-sig-save">✓ حفظ التوقيع</button>' +
          '<button type="button" class="cp-btn" data-act="mclose-btn">إغلاق</button>' +
        '</div>' +
      '</div></div>';

    const cv = document.getElementById('cp-sig-canvas');
    const ctx = cv.getContext('2d');
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    let drawing = false;
    let paths = [];
    let cur = [];

    const pt = e => {
      const r = cv.getBoundingClientRect();
      const t = e.touches && e.touches[0] ? e.touches[0] : e;
      return [Math.round((t.clientX - r.left) * (cv.width / r.width)), Math.round((t.clientY - r.top) * (cv.height / r.height))];
    };
    const start = e => { e.preventDefault(); drawing = true; cur = [pt(e)]; ctx.beginPath(); ctx.moveTo(cur[0][0], cur[0][1]); };
    const move = e => { if (!drawing) return; e.preventDefault(); const p = pt(e); cur.push(p); ctx.lineTo(p[0], p[1]); ctx.stroke(); };
    const end = () => { if (!drawing) return; drawing = false; if (cur.length > 1) paths.push(cur); cur = []; };

    cv.addEventListener('mousedown', start); cv.addEventListener('mousemove', move); window.addEventListener('mouseup', end);
    cv.addEventListener('touchstart', start, { passive: false }); cv.addEventListener('touchmove', move, { passive: false }); cv.addEventListener('touchend', end);

    document.getElementById('cp-sig-clear').onclick = () => { ctx.clearRect(0, 0, cv.width, cv.height); paths = []; };
    document.getElementById('cp-sig-save').onclick = async () => {
      if (!paths.length) { haptic(false); alert('خلي العميل يوقّع جوه المربع الأول'); return; }
      const dStr = paths.map(stroke => 'M' + stroke.map((p, i) => (i === 0 ? '' : 'L') + p[0] + ' ' + p[1]).join(' ')).join(' ');
      const signer = (document.getElementById('cp-sig-name').value || clientName || '').trim();
      const btn = document.getElementById('cp-sig-save');
      btn.disabled = true;
      try {
        const pos = window.__cpLastPos || null;
        await queueOrRun('courier_v12_save_signature', {
          p_tx: String(tx), p_signer: signer, p_svg_path: dStr,
          p_lat: pos ? pos.lat : null, p_lng: pos ? pos.lng : null
        });
        haptic(true);
        root.innerHTML = '';
        if (typeof onSaved === 'function') onSaved(dStr, signer);
      } catch (e) {
        haptic(false);
        btn.disabled = false;
      }
    };
  }

  /* ---------- 3) مثبت الدبوس اليدوي على الخريطة (بديل GPS جوه المباني) ---------- */
  function openPinDropperModal(tx, clientName, initialLat, initialLng, onConfirm) {
    const root = document.getElementById('cp-modal-root');
    if (!root) return;
    let lat = Number(initialLat) || 30.0444;
    let lng = Number(initialLng) || 31.2357;
    root.innerHTML =
      '<div class="cp-modal" data-act="mclose"><div class="cp-box" style="max-width:420px">' +
        '<h3>📍 تثبيت موقع العميل يدوياً</h3>' +
        '<p>لو إشارة الـ GPS ضعيفة، اسحب الدبوس على موقع <b>' + String(clientName || tx) + '</b>:</p>' +
        '<div id="cp-pin-pad" style="position:relative;height:210px;border-radius:14px;background:radial-gradient(circle at 50% 50%,rgba(16,185,129,.18),rgba(15,23,42,.95));border:1px solid var(--bd);overflow:hidden;touch-action:none;cursor:grab">' +
          '<div style="position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px);background-size:28px 28px"></div>' +
          '<div id="cp-pin-dot" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-100%);font-size:28px;filter:drop-shadow(0 4px 8px rgba(0,0,0,.5))">📍</div>' +
          '<div id="cp-pin-coords" dir="ltr" style="position:absolute;bottom:8px;left:8px;right:8px;text-align:center;font-size:11px;font-weight:700;background:rgba(0,0,0,.55);color:#fff;padding:4px 8px;border-radius:8px">' + lat.toFixed(5) + ', ' + lng.toFixed(5) + '</div>' +
        '</div>' +
        '<div class="cp-btns" style="margin-top:10px">' +
          '<button type="button" class="cp-btn cp-go" id="cp-pin-save">✓ حفظ الموقع ده</button>' +
          '<button type="button" class="cp-btn" data-act="mclose-btn">إغلاق</button>' +
        '</div>' +
      '</div></div>';

    const pad = document.getElementById('cp-pin-pad');
    const dot = document.getElementById('cp-pin-dot');
    const lbl = document.getElementById('cp-pin-coords');
    const movePin = e => {
      const r = pad.getBoundingClientRect();
      const t = e.touches && e.touches[0] ? e.touches[0] : e;
      const x = Math.max(0.05, Math.min(0.95, (t.clientX - r.left) / r.width));
      const y = Math.max(0.08, Math.min(0.92, (t.clientY - r.top) / r.height));
      dot.style.left = (x * 100) + '%';
      dot.style.top = (y * 100) + '%';
      lat = (Number(initialLat) || 30.0444) + (0.5 - y) * 0.04;
      lng = (Number(initialLng) || 31.2357) + (x - 0.5) * 0.04;
      lbl.textContent = lat.toFixed(5) + ', ' + lng.toFixed(5);
    };
    let drag = false;
    pad.addEventListener('mousedown', e => { drag = true; movePin(e); });
    pad.addEventListener('mousemove', e => { if (drag) movePin(e); });
    window.addEventListener('mouseup', () => { drag = false; });
    pad.addEventListener('touchstart', e => { e.preventDefault(); movePin(e); }, { passive: false });
    pad.addEventListener('touchmove', e => { e.preventDefault(); movePin(e); }, { passive: false });

    document.getElementById('cp-pin-save').onclick = () => {
      haptic(true);
      root.innerHTML = '';
      if (typeof onConfirm === 'function') onConfirm(Number(lat.toFixed(6)), Number(lng.toFixed(6)));
    };
  }

  /* ---------- 4) الخريطة التفاعلية المدمجة (Embedded Live Map — Offline-ready) ---------- */
  function renderEmbeddedMap(items, myPos, detectFn, onSelectTx) {
    const pts = (items || []).map(it => {
      const z = detectFn(it);
      return { it: it, lat: z.lat, lng: z.lng, zone: z.zone };
    });
    if (!pts.length) return '<div class="cp-empty">مفيش مشاوير لها إحداثيات حالياً</div>';
    const allLats = pts.map(p => p.lat).concat(myPos ? [myPos.lat] : []);
    const allLngs = pts.map(p => p.lng).concat(myPos ? [myPos.lng] : []);
    const minLat = Math.min.apply(null, allLats) - 0.015, maxLat = Math.max.apply(null, allLats) + 0.015;
    const minLng = Math.min.apply(null, allLngs) - 0.015, maxLng = Math.max.apply(null, allLngs) + 0.015;
    const toXY = (la, ln) => ({
      x: 10 + ((ln - minLng) / Math.max(0.001, maxLng - minLng)) * 80,
      y: 88 - ((la - minLat) / Math.max(0.001, maxLat - minLat)) * 76
    });

    const pinsHtml = pts.map((p, i) => {
      const xy = toXY(p.lat, p.lng);
      const col = p.it.confirmed ? '#64748b' : (p.it.type === 'delivery' ? '#10b981' : '#3b82f6');
      return '<button type="button" data-act="detail" data-tx="' + String(p.it.transaction_id).replace(/"/g, '&quot;') + '" ' +
        'title="' + String(p.it.client_name || '').replace(/"/g, '&quot;') + '" ' +
        'style="position:absolute;left:' + xy.x.toFixed(1) + '%;top:' + xy.y.toFixed(1) + '%;transform:translate(-50%,-100%);border:0;background:transparent;cursor:pointer;padding:0;text-align:center">' +
        '<span style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:' + col + ';color:#fff;font-size:11px;font-weight:900;box-shadow:0 4px 12px rgba(0,0,0,.45);border:2px solid #fff">' + (i + 1) + '</span>' +
        '<span style="display:block;font-size:9.5px;font-weight:800;color:#fff;background:rgba(15,23,42,.82);padding:1px 5px;border-radius:6px;margin-top:2px;white-space:nowrap;max-width:90px;overflow:hidden;text-overflow:ellipsis">' + String(p.it.client_name || 'عميل').split(' ')[0] + '</span>' +
      '</button>';
    }).join('');

    let myPinHtml = '';
    if (myPos && myPos.lat) {
      const mxy = toXY(myPos.lat, myPos.lng);
      myPinHtml = '<div style="position:absolute;left:' + mxy.x.toFixed(1) + '%;top:' + mxy.y.toFixed(1) + '%;transform:translate(-50%,-50%);width:16px;height:16px;border-radius:50%;background:#f59e0b;border:3px solid #fff;box-shadow:0 0 0 6px rgba(245,158,11,.28)" title="موقعك الحالي"></div>';
    }

    return '<div class="cp-card" style="padding:0;overflow:hidden;border:1px solid rgba(16,185,129,.35)">' +
      '<div style="position:relative;height:260px;background:radial-gradient(circle at 35% 35%,rgba(16,185,129,.12),rgba(11,15,23,.98));overflow:hidden">' +
        '<div style="position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px);background-size:32px 32px"></div>' +
        '<div style="position:absolute;top:8px;right:10px;font-size:11px;font-weight:800;color:#fff;background:rgba(15,23,42,.75);padding:4px 9px;border-radius:999px">🗺️ خريطة مشاوير اليوم (اضغط على أي دبوس)</div>' +
        myPinHtml + pinsHtml +
      '</div>' +
      '<div style="display:flex;justify-content:space-around;padding:7px 10px;font-size:11px;color:var(--mu);background:var(--fld)">' +
        '<span>🟢 تسليم</span><span>🔵 استلام</span><span>🟠 موقعك</span><span>⚫ مؤكد</span>' +
      '</div>' +
    '</div>';
  }

  /* ---------- 5) المساعد الصوتي بدون لمس (Hands-Free Voice Mode) ---------- */
  function startVoiceAssistant(handlers) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      if (typeof showToast === 'function') showToast('المتصفح ده مش بيدعم الأوامر الصوتية — جرب Chrome على أندرويد', true);
      return;
    }
    const rec = new SR();
    rec.lang = 'ar-EG';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    if (typeof showToast === 'function') showToast('🎙️ اتكلم دلوقتي: قول «العميل الجاي» أو «اتصل» أو «خريطة»…');
    rec.onresult = e => {
      const cmd = String((e.results && e.results[0] && e.results[0][0] && e.results[0][0].transcript) || '').trim();
      haptic(true);
      if (typeof handlers === 'function') handlers(cmd);
    };
    rec.onerror = () => { haptic(false); };
    try { rec.start(); } catch (e) {}
  }

  function speakAr(text) {
    try {
      if (!('speechSynthesis' in window)) return;
      const u = new SpeechSynthesisUtterance(String(text || ''));
      u.lang = 'ar-EG';
      u.rate = 1.02;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }

  /* ---------- 6) قوالب واتساب الـ 4 الجاهزة بضغطة ---------- */
  function openWhatsAppTemplates(phone, clientName, tx, courierName, waNumFn) {
    const root = document.getElementById('cp-modal-root');
    if (!root) return;
    const tpls = [
      { ic: '🛵', lbl: 'أنا في طريقي إليك', msg: 'أهلاً بحضرتك أ/ ' + (clientName || '') + '، معاك ' + (courierName || 'مندوب') + ' من شركة تساهيل، أنا في طريقي لحضرتك دلوقتي بخصوص معاملة رقم ' + tx },
      { ic: '📍', lbl: 'وصلت عند العنوان', msg: 'أهلاً بحضرتك أ/ ' + (clientName || '') + '، أنا وصلت عند العنوان دلوقتي ومعايا معاملة رقم ' + tx },
      { ic: '📞', lbl: 'حاولت أتصل بحضرتك', msg: 'أهلاً بحضرتك أ/ ' + (clientName || '') + '، حاولت أتصل بحضرتك بخصوص معاملة تساهيل رقم ' + tx + ' — برجاء الرد أو معاودة الاتصال' },
      { ic: '⏰', lbl: 'هتأخر ١٥ دقيقة بسبب الزحمة', msg: 'أهلاً بحضرتك أ/ ' + (clientName || '') + '، معذرة هتأخر حوالي ١٥ دقيقة بسبب الزحمة في الطريق، وجاي لحضرتك فوراً (معاملة ' + tx + ')' }
    ];
    root.innerHTML =
      '<div class="cp-modal" data-act="mclose"><div class="cp-box" style="max-width:400px">' +
        '<h3>💬 رسالة واتساب جاهزة</h3>' +
        '<p>اختر الرسالة وهتتفتح فوراً على واتساب <b>' + String(clientName || '') + '</b>:</p>' +
        '<div style="display:flex;flex-direction:column;gap:8px">' +
          tpls.map((t, i) => '<button type="button" class="cp-btn cp-go" style="text-align:right;justify-content:flex-start" data-v12wa="' + i + '">' + t.ic + ' ' + t.lbl + '</button>').join('') +
        '</div>' +
        '<div class="cp-btns"><button type="button" class="cp-btn" data-act="mclose-btn">إغلاق</button></div>' +
      '</div></div>';

    root.querySelectorAll('[data-v12wa]').forEach(btn => {
      btn.onclick = () => {
        const t = tpls[Number(btn.dataset.v12wa)];
        const url = 'https://wa.me/' + waNumFn(phone) + '?text=' + encodeURIComponent(t.msg);
        window.open(url, '_blank', 'noopener');
        root.innerHTML = '';
        queueOrRun('courier_v12_dispatch_action', { p_event_type: 'call_attempt', p_tx: String(tx), p_payload: { channel: 'whatsapp' } }).catch(() => null);
      };
    });
  }

  /* ---------- تصدير واجهة v12 لبوابة المندوب ---------- */
  window.CourierV12 = {
    OFFICE_POS: OFFICE_POS,
    haptic: haptic,
    haversineKm: haversineKm,
    queueOrRun: queueOrRun,
    flushOfflineQueue: flushOfflineQueue,
    openSignatureModal: openSignatureModal,
    openPinDropperModal: openPinDropperModal,
    renderEmbeddedMap: renderEmbeddedMap,
    startVoiceAssistant: startVoiceAssistant,
    speakAr: speakAr,
    openWhatsAppTemplates: openWhatsAppTemplates,
    readPresets: () => { try { return JSON.parse(localStorage.getItem(PRESET_KEY) || '[]'); } catch (e) { return []; } },
    savePresets: p => { try { localStorage.setItem(PRESET_KEY, JSON.stringify((p || []).slice(0, 10))); } catch (e) {} }
  };
})();
