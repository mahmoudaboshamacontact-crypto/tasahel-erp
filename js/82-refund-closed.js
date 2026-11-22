/* حالة CLOSED للاسترداد — للمدير فقط
   - زرار «CLOSED» يظهر على كارت البند بعد اعتماد الاسترداد.
   - بعد القفل: شارة CLOSED، والبند يختفي من رادار العباسية (من السيرفر).
   - ملف مستقل: بيلف buildServiceDetailCard بعد js/42 من غير ما يعدّل فيه. */
(function () {
  'use strict';
  var cache = {};      /* line_id -> { open: [refund ids approved غير مقفولة], closed: [ids] } */
  var timer = null;

  function db() { return (typeof sbClient !== 'undefined' && sbClient) ? sbClient : null; }
  function isMgr() { return window.__role === 'manager'; }
  function toast(m, k) { try { if (typeof showToast === 'function') showToast(m, k || 'info'); } catch (e) { /* */ } }

  async function loadClosed() {
    var c = db();
    if (!c || !(typeof currentUser !== 'undefined' && currentUser)) return;
    if (window.__role === 'partner' || window.__role === 'courier') return;
    try {
      var r = await c.from('line_refunds').select('id,line_id,status,closed_at').eq('status', 'approved').limit(3000);
      if (r.error) return;
      var next = {};
      (r.data || []).forEach(function (x) {
        var k = String(x.line_id);
        var e = next[k] || (next[k] = { open: [], closed: [] });
        (x.closed_at ? e.closed : e.open).push(x.id);
      });
      var changed = JSON.stringify(next) !== JSON.stringify(cache);
      cache = next;
      if (changed && typeof window.reloadLineRefunds === 'function') window.reloadLineRefunds(false);
    } catch (e) { /* مش أساسي */ }
  }

  window.closeLineRefund = async function (lineId) {
    var e = cache[String(lineId)];
    if (!isMgr() || !e || !e.open.length) return;
    if (!window.confirm('تقفل الاسترداد ده (CLOSED)؟ العميل خد فلوسه وورقه، والطلب هيختفي من رادار العباسية.')) return;
    var c = db();
    try {
      for (var i = 0; i < e.open.length; i++) {
        var r = await c.rpc('line_refund_close', { p_id: Number(e.open[i]) });
        if (r.error) throw r.error;
      }
      toast('تم القفل — CLOSED ✓', 'success');
    } catch (err) {
      toast((err && err.message) || 'تعذر القفل', 'error');
    }
    await loadClosed();
  };

  function wrap() {
    var orig = window.buildServiceDetailCard;
    if (typeof orig !== 'function' || orig.__rfClosed) return false;
    var w = function (l) {
      var html = orig.apply(this, arguments);
      try {
        if (!l || window.__role === 'partner') return html;
        var e = cache[String(l.id)];
        if (!e) return html;
        var extra = '';
        if (e.closed.length && !e.open.length) {
          extra = '<span class="rf-badge" style="background:#1f2937;color:#fff;border:1px solid #374151" title="الاسترداد اتقفل: العميل خد فلوسه وورقه"><i class="fa-solid fa-lock"></i><span>CLOSED</span></span>';
        } else if (isMgr() && e.open.length) {
          extra = '<button type="button" onclick="event.stopPropagation();closeLineRefund(\'' + String(l.id).replace(/[^\w-]/g, '') + '\')" class="rf-btn-trigger" title="قفل الاسترداد (للمدير فقط)"><i class="fa-solid fa-lock"></i><span>CLOSED</span></button>';
        }
        if (!extra) return html;
        var t = '<div class="flex flex-wrap items-center gap-1.5 shrink-0">';
        return html.indexOf(t) !== -1 ? html.replace(t, t + extra) : html;
      } catch (err) { return html; }
    };
    w.__rfClosed = true;
    window.buildServiceDetailCard = w;
    return true;
  }

  function boot() {
    wrap();
    loadClosed();
    if (!timer) timer = setInterval(loadClosed, 60000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 2500); });
  else setTimeout(boot, 2500);
})();
