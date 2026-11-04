// إلغاء تفعيل الـ Service Worker المؤقت لحل مشكلة اللوجن
self.addEventListener('install', function(e) {
  self.skipWaiting();
});
self.addEventListener('activate', function(e) {
  e.waitUntil(clients.claim());
});
self.addEventListener('fetch', function(e) {
  // تمرير الطلبات بشكل طبيعي بدون اعتراض
  e.respondWith(fetch(e.request));
});
