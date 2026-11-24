/* ================================================================
 * 59. OFFLINE READ (قراءة فقط) — آخر نسخة محفوظة من الخدمات والمعاملات
 * - بعد كل تحميل ناجح بنحفظ نسخة في IndexedDB على الجهاز بمدة صلاحية 12 ساعة (TTL).
 * - بنشيل tracking_token من النسخة المخزنة محليًا، وبنمسح الكاش تلقائيًا عند الخروج أو انتهاء الجلسة.
 * - لو النت مقطوع أو التحميل فشل، بنعرض النسخة المحفوظة + شريط "آخر تحديث".
 * بيعتمد على: loadServices / loadRecentRequests / refreshLineViews (js/03-core-app.js)
 * ================================================================ */
(function () {
  'use strict';

  var DB_NAME = 'tasahel-offline', STORE = 'kv';
  var KEY_LINES = 'lines', KEY_SERVICES = 'services';
  var CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 ساعة كحد أقصى
  function scope() { return (typeof currentUser !== 'undefined' && currentUser && currentUser.id) ? String(currentUser.id) : null; }
  function scopedKey(key) { var userId = scope(); return userId ? key + ':' + userId : null; }
  var SAVE_DELAY_MS = 3000;

  /* ---------- IndexedDB صغيرة ---------- */
  var dbPromise = null;
  function db() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (res, rej) {
      if (!('indexedDB' in window)) return rej(new Error('no idb'));
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
      req.onsuccess = function () { res(req.result); };
      req.onerror = function () { rej(req.error); };
    });
    return dbPromise;
  }
  function idbSet(key, value) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var tx = d.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = res; tx.onerror = function () { rej(tx.error); };
      });
    });
  }
  function idbDel(key) {
    return db().then(function (d) {
      return new Promise(function (res) {
        var tx = d.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(key);
        tx.oncomplete = tx.onerror = function () { res(); };
      });
    }).catch(function () {});
  }
  function clearOfflineCache() {
    if (!('indexedDB' in window)) return Promise.resolve();
    dbPromise = null;
    return new Promise(function (resolve) {
      var req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = req.onerror = req.onblocked = function () { resolve(); };
    });
  }
  window.clearOfflineReadCache = clearOfflineCache;
  function idbGet(key) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var r = d.transaction(STORE, 'readonly').objectStore(STORE).get(key);
        r.onsuccess = function () { res(r.result || null); }; r.onerror = function () { rej(r.error); };
      });
    });
  }
  function isExpired(snap) {
    return !snap || !snap.ts || (Date.now() - Number(snap.ts)) > CACHE_TTL_MS;
  }
  function sanitizeLinesForCache(rows) {
    return (rows || []).map(function (r) {
      if (!r || typeof r !== 'object') return r;
      if (!('tracking_token' in r)) return r;
      var copy = Object.assign({}, r);
      delete copy.tracking_token;
      return copy;
    });
  }

  /* ---------- شريط الحالة ---------- */
  var bar = null;
  function fmtTime(ts) {
    try { return new Date(ts).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo', dateStyle: 'short', timeStyle: 'short' }); }
    catch (e) { return new Date(ts).toString(); }
  }
  function showBar(ts) {
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'offline-read-bar';
      bar.setAttribute('role', 'status');
      bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:999;padding:8px 14px;font:700 12px/1.5 system-ui,sans-serif;text-align:center;background:#fff7ed;color:#9a3412;border-bottom:1px solid #fdba74;direction:rtl';
      document.body.appendChild(bar);
    }
    bar.textContent = '⚠️ مفيش نت — بتشوف نسخة محفوظة' + (ts ? ' (آخر تحديث: ' + fmtTime(ts) + ')' : '') + ' — للقراءة بس';
    bar.style.display = 'block';
  }
  function hideBar() { if (bar) bar.style.display = 'none'; }

  /* ---------- حفظ النسخة (مؤجل عشان ما يتكررش) ---------- */
  var saveTimer = null;
  function scheduleSaveLines() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      var userId = scope(); if (!userId || !allRequestLines || !allRequestLines.length) return;
      idbSet(scopedKey(KEY_LINES), { ts: Date.now(), user_id: userId, rows: sanitizeLinesForCache(allRequestLines) }).catch(function () {});
    }, SAVE_DELAY_MS);
  }
  function saveServices() {
    var userId = scope(); if (!userId || !allServices || !allServices.length) return;
    idbSet(scopedKey(KEY_SERVICES), { ts: Date.now(), user_id: userId, rows: allServices }).catch(function () {});
  }

  /* ---------- تطبيق النسخة المحفوظة على الشاشة ---------- */
  var lastLinesTs = null;
  function restoreLines() {
    var userId = scope(); if (!userId) return Promise.resolve(false);
    var key = scopedKey(KEY_LINES);
    return idbGet(key).then(function (snap) {
      if (!snap || snap.user_id !== userId || !snap.rows || !snap.rows.length) return false;
      if (isExpired(snap)) { idbDel(key); return false; }
      allRequestLines = snap.rows;
      lastLinesTs = snap.ts;
      if (typeof archiveState !== 'undefined') { archiveState.done = true; archiveState.loading = false; archiveState.failed = false; }
      if (typeof groupRequestsByTransaction === 'function') groupRequestsByTransaction();
      if (typeof refreshLineViews === 'function') refreshLineViews();
      return true;
    }).catch(function () { return false; });
  }
  function restoreServices() {
    var userId = scope(); if (!userId) return Promise.resolve(false);
    var key = scopedKey(KEY_SERVICES);
    return idbGet(key).then(function (snap) {
      if (!snap || snap.user_id !== userId || !snap.rows || !snap.rows.length) return false;
      if (isExpired(snap)) { idbDel(key); return false; }
      allServices = snap.rows;
      var dl = document.getElementById('svc-datalist');
      if (dl) dl.innerHTML = snap.rows.map(function (s) {
        return '<option value="' + escapeHtml(s.name) + '">' + (s.unit_price != null ? fmtNum(s.unit_price) + ' ج.م' : '') + '</option>';
      }).join('');
      if (typeof renderQuickServicesGrid === 'function') renderQuickServicesGrid();
      return true;
    }).catch(function () { return false; });
  }

  /* ---------- تغليف الدوال الأصلية ---------- */
  var origServices = window.loadServices;
  if (typeof origServices === 'function') {
    window.loadServices = async function () {
      try { await origServices.apply(this, arguments); } catch (e) {}
      if (allServices && allServices.length) { saveServices(); hideBar(); }
      else { var ok2 = await restoreServices(); if (ok2) showBar(); }
    };
  }

  var origRecent = window.loadRecentRequests;
  if (typeof origRecent === 'function') {
    window.loadRecentRequests = async function () {
      try { await origRecent.apply(this, arguments); } catch (e) {}
      if (allRequestLines && allRequestLines.length) { scheduleSaveLines(); hideBar(); }
      else { var ok2 = await restoreLines(); if (ok2) showBar(lastLinesTs); }
    };
  }

  /* أي تحديث للبنود (بما فيه الأرشيف اللي بيكمل في الخلفية) يتحفظ */
  var origRefresh = window.refreshLineViews;
  if (typeof origRefresh === 'function') {
    window.refreshLineViews = function () {
      var r = origRefresh.apply(this, arguments);
      if (navigator.onLine) scheduleSaveLines();
      return r;
    };
  }

  /* مسح الكاش المحلي تلقائياً لو ظهرت شاشة الدخول (انتهاء الجلسة) */
  var origShowLogin = window.showLoginScreen;
  if (typeof origShowLogin === 'function') {
    window.showLoginScreen = function () {
      clearTimeout(saveTimer);
      clearOfflineCache().catch(function () {});
      return origShowLogin.apply(this, arguments);
    };
  }

  /* لما النت يرجع نخفي الشريط، والتحديث بيحصل من الكود الأصلي في 55 */
  window.addEventListener('online', hideBar);
})();
