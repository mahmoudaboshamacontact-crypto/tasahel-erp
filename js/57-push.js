/* الجزء ي: إشعارات الدفع (المرحلة 10) — js/57-push.js
   زر في القائمة لتفعيل/إيقاف إشعارات الجهاز. الاشتراك بيتخزّن في push_subscriptions (صاحبه بس).
   الإرسال من السيرفر: sql/part-j-push.sql + supabase/functions/send-push. بدون مراقبة وبدون تحديث تلقائي. */
(function () {
  'use strict';
  if (window.__phase57) return; window.__phase57 = true;

  /* المفتاح العام (VAPID public) — آمن يتحط في الكود. لو فاضي الزر بيتخفى. */
  var VAPID_PUBLIC_KEY = 'BLcrBLwE24uSU7J0jg0SYP98hhBQwfN5eo-NCEwnIhQIjzv4t6NlN2q0Ci9O6Gypwuj7jB4fF6hq-gUW0mgHrGc';

  var supported = ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window);
  if (!supported || !VAPID_PUBLIC_KEY) return;

  var $ = function (id) { return document.getElementById(id); };
  function toast(m, t) { if (typeof showToast === 'function') showToast(m, t || 'info'); }
  function db() { return typeof sbClient !== 'undefined' ? sbClient : window.sbClient; }
  function isPartner() { return window.__role === 'partner' || (document.body && document.body.classList.contains('is-partner-mode')); }
  function b64ToBytes(s) {
    var pad = '='.repeat((4 - s.length % 4) % 4), b = (s + pad).replace(/-/g, '+').replace(/_/g, '/'), raw = atob(b), out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  function getSub() { return navigator.serviceWorker.ready.then(function (r) { return r.pushManager.getSubscription(); }); }

  function setLabel(on) {
    var b = $('push-toggle-btn'); if (!b) return;
    b.querySelector('span').textContent = on ? 'إيقاف إشعارات الجهاز' : 'تفعيل إشعارات الجهاز';
    b.querySelector('i').className = on ? 'fa-solid fa-bell text-emerald-500' : 'fa-regular fa-bell text-slate-500';
  }
  function refresh() { getSub().then(function (s) { setLabel(!!s); }).catch(function () {}); }

  async function enable() {
    if (Notification.permission === 'denied') { toast('الإشعارات متقفلة من إعدادات المتصفح للموقع ده', 'error'); return; }
    var perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast('محتاج توافق على الإشعارات عشان تتفعّل', 'info'); return; }
    var reg = await navigator.serviceWorker.ready;
    var sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID_PUBLIC_KEY) });
    var j = sub.toJSON(), k = j.keys || {};
    var r = await db().from('push_subscriptions').upsert({ endpoint: j.endpoint, p256dh: k.p256dh, auth: k.auth, user_agent: String(navigator.userAgent).slice(0, 200) }, { onConflict: 'endpoint' });
    if (r.error) { await sub.unsubscribe().catch(function () {}); toast('تعذّر حفظ الاشتراك: ' + r.error.message, 'error'); return; }
    setLabel(true); toast('تم تفعيل إشعارات الجهاز ✓', 'success');
  }
  async function disable() {
    var sub = await getSub();
    if (sub) { var ep = sub.endpoint; await sub.unsubscribe().catch(function () {}); await db().from('push_subscriptions').delete().eq('endpoint', ep); }
    setLabel(false); toast('تم إيقاف إشعارات الجهاز', 'info');
  }
  function onClick() {
    getSub().then(function (s) { return s ? disable() : enable(); }).catch(function (e) { toast('حصل خطأ: ' + (e && e.message || e), 'error'); });
  }

  function ensure() {
    var menu = $('nav-menu'); if (!menu || $('push-toggle-btn') || isPartner() || !db()) return;
    var b = document.createElement('button'); b.id = 'push-toggle-btn'; b.type = 'button';
    b.className = 'tab-btn text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800';
    b.innerHTML = '<i class="fa-regular fa-bell"></i><span>تفعيل إشعارات الجهاز</span>';
    b.addEventListener('click', onClick);
    menu.appendChild(b); refresh();
  }
  /* الزر بيظهر بعد تسجيل الدخول (القائمة بتتبني وقتها). فحص خفيف كل 5 ثواني لحد ما يظهر. */
  var tries = 0, iv = setInterval(function () {
    tries++; ensure();
    if ($('push-toggle-btn') || tries > 60) clearInterval(iv);
  }, 5000);
})();
