/* =====================================================================
   67-line-pause.js | وقف (Under Review) واستئناف خدمة واحدة، بسبب إجباري
   - Under Review حالة استثنائية (الخدمة واقفة)، مش مرحلة في الشريط: In Progress → Complete → Delivered
   - بتتعمل على الخدمة دي بس، ومعاها تحذير واضح إن باقي خدمات المعاملة مش هتتأثر
   - الاستئناف: الموظف هو اللي يختار الحالة اللي هترجع لها (In Progress / Complete / Delivered)
   - السبب بيتسجل كتعليق على المعاملة (tx_comments)، من غير أي SQL جديد
   - أي محاولة تانية لتحويل خدمة لـ Under Review (كانبان/أزرار قديمة) بتفتح نفس نافذة السبب
   ===================================================================== */
(function () {
  if (window.__linePause) return; window.__linePause = true;
  var origApply = window.applyStatus;
  var esc = function (s) { return typeof escapeHtml === 'function' ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var toast = function (m, t) { if (typeof showToast === 'function') showToast(m, t); };
  var lineOf = function (id) { try { return allRequestLines.find(function (x) { return String(x.id) === String(id); }); } catch (e) { return null; } };
  var label = function (s) { return typeof statusLabel === 'function' ? statusLabel(s) : s; };

  /* أي طريق قديم لـ Under Review يعدّي على نافذة السبب */
  window.applyStatus = function (ids, status) {
    if (status === 'Under Review') {
      if (ids && ids.length === 1) openPause(ids[0]);
      else toast('الوقف (Under Review) بيتعمل على كل خدمة لوحدها، من زرار "وقف" على كارت الخدمة', 'error');
      return Promise.resolve(false);
    }
    return origApply.apply(this, arguments);
  };

  function close() { var m = document.getElementById('lp-modal'); if (m) m.remove(); document.removeEventListener('keydown', onKey); }
  function onKey(e) { if (e.key === 'Escape') close(); }
  function shell(html) {
    close();
    var m = document.createElement('div'); m.id = 'lp-modal';
    m.innerHTML = '<div class="lp-back" data-lp-close></div><div class="lp-box" dir="rtl" role="dialog" aria-modal="true">' + html + '</div>';
    m.addEventListener('click', function (e) { if (e.target.hasAttribute('data-lp-close')) close(); });
    document.body.appendChild(m); document.addEventListener('keydown', onKey);
    return m;
  }
  async function note(l, body) {
    try { await sbClient.from('tx_comments').insert({ transaction_id: String(l.transaction_id), author_id: currentUser.id, body: body }); } catch (e) { /* التعليق مش أساسي */ }
  }
  function dirtyOk() { try { if (typeof txDirty !== 'undefined' && txDirty) return confirm('فيه تغييرات في المعاملة لسه ماتحفظتش وهتضيع لو كملت. تكمل؟'); } catch (e) { /* */ } return true; }

  function openPause(id) {
    var l = lineOf(id); if (!l) return;
    if (!dirtyOk()) return;
    var others = 0; try { others = allRequestLines.filter(function (x) { return String(x.transaction_id) === String(l.transaction_id) && String(x.id) !== String(l.id); }).length; } catch (e) { /* */ }
    var m = shell('<h3 class="lp-h">وقف الخدمة (Under Review)</h3>' +
      '<div class="lp-svc">' + esc(l.service || '—') + '</div>' +
      '<div class="lp-warn"><b>تنبيه:</b> الوقف هيتعمل على <b>الخدمة دي بس</b>' + (others ? '، وباقي خدمات المعاملة (' + others + ') <b>مش هتتأثر</b>' : '') + '. الخدمة الواقفة مش بتتحسب متأخرة ولا بتدخل في الكوميشن لحد ما تتستأنف.</div>' +
      '<label class="lp-l" for="lp-reason">سبب الوقف <span class="lp-req">* (إجباري)</span></label>' +
      '<textarea id="lp-reason" rows="3" maxlength="400" placeholder="مثال: العميل مبعتش المستند / الجهة موقفة الطلب"></textarea>' +
      '<div class="lp-err" id="lp-err"></div>' +
      '<div class="lp-act"><button type="button" class="lp-go" id="lp-ok">تأكيد الوقف</button><button type="button" class="lp-no" data-lp-close>إلغاء</button></div>');
    var ta = m.querySelector('#lp-reason'); ta.focus();
    m.querySelector('#lp-ok').onclick = async function () {
      var reason = (ta.value || '').trim();
      if (reason.length < 3) { m.querySelector('#lp-err').textContent = 'اكتب سبب الوقف (٣ حروف على الأقل)'; ta.focus(); return; }
      this.disabled = true;
      var ok = await origApply([String(l.id)], 'Under Review');
      if (ok) { await note(l, '⏸ وقف خدمة «' + (l.service || '') + '» (Under Review): ' + reason); toast('الخدمة وقفت (Under Review)'); close(); if (typeof afterStatusChange === 'function') afterStatusChange(); }
      else this.disabled = false;
    };
  }

  function openResume(id) {
    var l = lineOf(id); if (!l) return;
    if (!dirtyOk()) return;
    var btns = ['In Progress', 'Complete', 'Delivered'].map(function (s) { return '<button type="button" class="lp-st" data-st="' + s + '">' + esc(label(s)) + '</button>'; }).join('');
    var m = shell('<h3 class="lp-h">استئناف الخدمة</h3><div class="lp-svc">' + esc(l.service || '—') + '</div>' +
      '<div class="lp-l">اختار الحالة اللي الخدمة هترجع لها:</div><div class="lp-sts">' + btns + '</div>' +
      '<div class="lp-act"><button type="button" class="lp-no" data-lp-close>إلغاء</button></div>');
    m.querySelectorAll('.lp-st').forEach(function (b) {
      b.onclick = async function () {
        var st = b.getAttribute('data-st'); m.querySelectorAll('.lp-st').forEach(function (x) { x.disabled = true; });
        var ok = await origApply([String(l.id)], st);
        if (ok) { await note(l, '▶ استئناف خدمة «' + (l.service || '') + '» وحالتها دلوقتي ' + st); toast('تم استئناف الخدمة'); close(); if (typeof afterStatusChange === 'function') afterStatusChange(); }
        else m.querySelectorAll('.lp-st').forEach(function (x) { x.disabled = false; });
      };
    });
  }
  window.lpPause = openPause; window.lpResume = openResume;

  /* زرار على كل كارت خدمة داخل نافذة المعاملة (ظاهر، مش جوه قايمة) */
  function decorate() {
    document.querySelectorAll('#tx-modal-body [data-svc-card-id]').forEach(function (card) {
      if (card.querySelector('.lp-btn')) return;
      var id = card.getAttribute('data-svc-card-id'), l = lineOf(id); if (!l) return;
      var box = card.querySelector('.flex.items-center.gap-1\\.5.shrink-0'); if (!box) return;
      var b = document.createElement('button'); b.type = 'button';
      var paused = (l.status || '') === 'Under Review';
      b.className = 'lp-btn' + (paused ? ' lp-resume' : '');
      b.innerHTML = paused ? '<i class="fa-solid fa-play"></i><span>استئناف</span>' : '<span>⏸</span><span>Under Review</span>';
      b.title = paused ? 'استئناف الخدمة دي' : 'وقف الخدمة دي بس (Under Review) بسبب';
      b.onclick = function (e) { e.stopPropagation(); (paused ? openResume : openPause)(id); };
      box.appendChild(b);
    });
  }
  var origOpen = window.openTxModal;
  if (typeof origOpen === 'function') window.openTxModal = function () { var r = origOpen.apply(this, arguments); try { decorate(); } catch (e) { /* */ } return r; };
})();
