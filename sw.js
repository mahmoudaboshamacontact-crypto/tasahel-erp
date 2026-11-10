// Service worker: يفتح التطبيق بسرعة حتى لو النت ضعيف.
// - ملفات التطبيق: من النت الأول (عشان التحديثات توصل)، ولو النت اتأخر أكتر من 4 ثواني يفتح من النسخة المحفوظة.
// - مكتبات الـ CDN (supabase / chart.js / خطوط / أيقونات): من الكاش فوراً وتتحدث في الخلفية.
// - Supabase وأي API تاني: مش بنكاشه.

const CACHE = 'tasahel-shell-v20261110-login-orange-v1';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'css/style.css?v=p1b1', 'css/phase17.css?v=20261040', 'css/phase18.css?v=20261040', 'css/phase19.css?v=20261040', 'css/phase21.css?v=1', 'css/tailwind.css?v=20261040'];
const CDN = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => null)))));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

function networkFirst(req) {
  return new Promise(resolve => {
    let done = false;
    const fromCache = () => caches.match(req).then(c => c || (req.mode === 'navigate' ? caches.match('./').then(h => h || caches.match('index.html')) : null));
    const timer = setTimeout(() => { fromCache().then(c => { if (c && !done) { done = true; resolve(c); } }); }, 4000);
    fetch(req).then(res => {
      clearTimeout(timer);
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); }
      if (!done) { done = true; resolve(res); }
    }).catch(() => {
      clearTimeout(timer);
      fromCache().then(c => { if (!done) { done = true; resolve(c || Response.error()); } });
    });
  });
}
function staleWhileRevalidate(req) {
  return caches.open(CACHE).then(cache => cache.match(req).then(hit => {
    const net = fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()).catch(() => {}); return res; }).catch(() => hit);
    return hit || net;
  }));
}
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (url.origin === location.origin) { e.respondWith(networkFirst(req)); return; }
  if (CDN.indexOf(url.hostname) !== -1) { e.respondWith(staleWhileRevalidate(req)); return; }
});

// إشعارات الدفع (الجزء ي): عنوان ونص قصير بس، والضغط عليه يفتح التطبيق.
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { /* نص عادي */ }
  e.waitUntil(self.registration.showNotification(String(d.title || 'تساهيل').slice(0, 80), {
    body: String(d.body || '').slice(0, 160), tag: d.tag || 'notif', icon: 'icon-192.png', badge: 'icon-192.png', dir: 'rtl', lang: 'ar'
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) { if ('focus' in c) return c.focus(); }
    return self.clients.openWindow('./');
  }));
});
