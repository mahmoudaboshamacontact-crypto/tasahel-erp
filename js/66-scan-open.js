/* =====================================================================
   66-scan-open.js | زرار "مسح" جنب البحث: الموظف يمسح QR الإيصال فتفتح المعاملة على طول
   - نفس QR الإيصال (رابط التتبع) هو اللي بيتقرا: العميل بيفتح صفحة التتبع بكاميرته، والموظف بيفتح المعاملة من هنا
   - بيعتمد على openQrScanner الموجود في 55-browser-apis.js (BarcodeDetector أو jsQR المحلي)
   - بيب عند النجاح، وبيب أوطى + رسالة عند QR غلط، واهتزاز على الموبايل. من غير أي ملف صوت ولا خدمة خارجية
   ===================================================================== */
(function () {
  if (window.__scanOpen) return; window.__scanOpen = true;
  var OK = /^[A-Za-z0-9_-]{16,128}$/;
  var actx = null;

  function beep(ok) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      var o = actx.createOscillator(), g = actx.createGain();
      o.type = 'square'; o.frequency.value = ok ? 1800 : 300;
      g.gain.setValueAtTime(0.0001, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.25, actx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + (ok ? 0.14 : 0.3));
      o.connect(g); g.connect(actx.destination);
      o.start(); o.stop(actx.currentTime + (ok ? 0.15 : 0.32));
    } catch (e) { /* الصوت مش أساسي */ }
    try { if (navigator.vibrate) navigator.vibrate(ok ? 60 : [80, 60, 80]); } catch (e) { /* */ }
  }
  function lines() { try { return allRequestLines || []; } catch (e) { return []; } }
  function toast(m, t) { if (typeof showToast === 'function') showToast(m, t); }
  function hasTx(tx) { return lines().some(function (l) { return String(l.transaction_id) === String(tx); }); }

  /* من نص الـ QR نطلع رمز التتبع (من رابط ?token=) أو رقم معاملة مكتوب مباشرة */
  function parse(raw) {
    raw = String(raw || '').trim();
    if (!raw) return null;
    try {
      var u = new URL(raw), t = u.searchParams.get('token') || '';
      if (OK.test(t)) return { token: t };
    } catch (e) { /* مش رابط */ }
    if (raw.length <= 60 && hasTx(raw)) return { tx: raw };
    return null;
  }

  async function resolveTx(p) {
    if (p.tx) return p.tx;
    var l = lines().find(function (x) { return String(x.tracking_token || '') === p.token; });
    if (l) return String(l.transaction_id);
    try {
      var r = await sbClient.from('request_lines').select('transaction_id').eq('tracking_token', p.token).limit(1);
      if (r && r.data && r.data[0]) return String(r.data[0].transaction_id);
    } catch (e) { /* */ }
    return null;
  }

  function scan() {
    if (typeof window.openQrScanner !== 'function') { toast('قارئ الـ QR مش متاح على الجهاز ده', 'error'); return; }
    beep(true); /* بيب تجريبي بيفتح الصوت من ضغطة الموظف (المتصفح بيمنعه من غير ضغطة) */
    window.openQrScanner(async function (raw) {
      var p = parse(raw);
      var tx = p ? await resolveTx(p) : null;
      if (!tx) { beep(false); toast('ده مش إيصال تساهيل أو المعاملة مش موجودة', 'error'); setTimeout(scan, 700); return; }
      beep(true);
      if (hasTx(tx)) { try { window.openTxModal(tx); return; } catch (e) { /* نكمل للبحث */ } }
      var k = document.getElementById('search-key');
      if (k) { k.value = tx; if (typeof window.executeSearch === 'function') window.executeSearch(); }
      toast('المعاملة اتحدّدت في البحث');
    });
  }
  window.scanOpenTx = scan;

  function inject() {
    var k = document.getElementById('search-key');
    if (!k || document.getElementById('scan-open-btn')) return;
    var box = k.closest('.flex.flex-wrap') || k.parentElement.parentElement;
    var searchBtn = box && box.querySelector('button[onclick="executeSearch()"]');
    var b = document.createElement('button');
    b.id = 'scan-open-btn'; b.type = 'button'; b.className = 'btn-neo-sec'; b.title = 'مسح QR الإيصال لفتح المعاملة';
    b.innerHTML = '<i class="fa-solid fa-qrcode"></i><span>مسح إيصال</span>';
    b.onclick = scan;
    if (searchBtn && searchBtn.parentElement) searchBtn.parentElement.insertBefore(b, searchBtn);
    else k.parentElement.parentElement.appendChild(b);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject); else inject();
  setTimeout(inject, 1500);
})();
