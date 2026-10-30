/* استفسار العميل → تعليق على الطلب (اختياري) + تمييزه بصرياً + زر نسخ لكل تعليق.
   مفيش تغيير في قاعدة البيانات: الاستفسار بيتخزن كتعليق داخلي (is_public=false) بعلامة في أول النص. */
(function () {
  'use strict';
  if (window.__inqComments) return; window.__inqComments = true;
  var TAG = '[استفسار عميل] ';

  /* ---- 1) زر الإضافة في شاشة الاستفسارات ---- */
  function decorateInquiries() {
    var list = document.getElementById('inquiries-list'); if (!list) return;
    list.querySelectorAll('[data-card]').forEach(function (card) {
      if (card.querySelector('.gl-inq-add')) return;
      var bodyEl = card.querySelector('.whitespace-pre-wrap'), txEl = card.querySelector('.font-mono');
      if (!bodyEl || !txEl) return;
      var b = document.createElement('button'); b.type = 'button'; b.className = 'gl-inq-add';
      b.innerHTML = '<i class="fa-solid fa-comment-medical"></i> إضافة استفسار العميل لتعليقات الطلب';
      b.addEventListener('click', function () { addInquiry(b, txEl.textContent.replace('#', '').trim(), bodyEl.textContent.trim()); });
      bodyEl.insertAdjacentElement('afterend', b);
    });
  }
  async function addInquiry(btn, tx, text) {
    if (!tx || !text || typeof sbClient === 'undefined' || !sbClient || !currentUser) return;
    btn.disabled = true;
    try {
      var body = TAG + text;
      var dup = await sbClient.from('tx_comments').select('id').eq('transaction_id', tx).eq('body', body).limit(1);
      if (dup.data && dup.data.length) { btn.innerHTML = '<i class="fa-solid fa-check"></i> مضاف بالفعل'; showToast('الاستفسار مضاف قبل كده على الطلب', 'info'); return; }
      var r = await sbClient.from('tx_comments').insert({ transaction_id: tx, author_id: currentUser.id, body: body, is_public: false });
      if (r.error) throw r.error;
      btn.innerHTML = '<i class="fa-solid fa-check"></i> تمت الإضافة'; showToast('اتضاف الاستفسار لتعليقات الطلب');
    } catch (e) { btn.disabled = false; if (typeof showError === 'function') showError('تعذّر إضافة الاستفسار', e); }
  }

  /* ---- 2 + 3) تمييز الاستفسار + زر نسخ في قائمة التعليقات ---- */
  function copyText(t, btn) {
    function ok() { var o = btn.innerHTML; btn.classList.add('ok'); btn.innerHTML = '<i class="fa-solid fa-check"></i> تم النسخ'; setTimeout(function () { btn.classList.remove('ok'); btn.innerHTML = o; }, 1400); }
    function fallback() {
      var ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0;top:0'; document.body.appendChild(ta); ta.select();
      var done = false; try { done = document.execCommand('copy'); } catch (e) {} ta.remove();
      if (done) ok(); else window.prompt('المتصفح منع النسخ التلقائي — انسخ النص من هنا (Ctrl+C):', t);
    }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(ok, fallback); else fallback();
  }
  function decorateComments() {
    var l = document.getElementById('txc-list'); if (!l) return;
    l.querySelectorAll(':scope > div').forEach(function (card) {
      if (card.dataset.glDone) return;
      var body = card.querySelector('.whitespace-pre-wrap'); if (!body) return;
      card.dataset.glDone = '1';
      var raw = body.textContent, isInq = raw.indexOf(TAG) === 0, clean = isInq ? raw.slice(TAG.length) : raw;
      if (isInq) {
        card.classList.add('gl-inq'); body.textContent = clean;
        body.insertAdjacentHTML('afterbegin', '<span class="gl-inq-tag"><i class="fa-solid fa-headset"></i> استفسار عميل</span>');
      }
      var b = document.createElement('button'); b.type = 'button'; b.className = 'gl-copy-btn'; b.innerHTML = '<i class="fa-regular fa-copy"></i> نسخ';
      b.addEventListener('click', function () { copyText(clean, b); });
      body.insertAdjacentElement('afterend', b);
    });
  }
  var t;
  function later() { clearTimeout(t); t = setTimeout(function () { try { decorateInquiries(); decorateComments(); } catch (e) { console.warn('inq-comments', e); } }, 120); }
  function init() { try { new MutationObserver(later).observe(document.body, { childList: true, subtree: true }); } catch (e) {} later(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
