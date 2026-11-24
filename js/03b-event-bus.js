/* =====================================================================
   js/03b-event-bus.js
   نظام Event Bus مركزي للسيستم (window.TasahelBus)
   - يعزل المستمعين بـ try/catch بحيث لو وحدة أخطأت لا تعطّل باقي السيستم.
   - يذيع الأحداث الأساسية (app:ready, tab:change, tx:open, auth:logout)
     بدون أي تعديل على js/03-core-app.js المقفول.
   ===================================================================== */
(function () {
  'use strict';
  if (window.TasahelBus) return;

  var map = Object.create(null);

  function on(eventName, fn) {
    if (!eventName || typeof fn !== 'function') return function () {};
    var list = map[eventName] || (map[eventName] = []);
    if (list.indexOf(fn) === -1) list.push(fn);
    return function () { off(eventName, fn); };
  }

  function off(eventName, fn) {
    var list = map[eventName];
    if (!list) return;
    var i = list.indexOf(fn);
    if (i !== -1) list.splice(i, 1);
  }

  function emit(eventName, payload) {
    var list = map[eventName];
    if (!list || !list.length) return;
    list.slice().forEach(function (fn) {
      try { fn(payload); } catch (e) { console.error('[TasahelBus]', eventName, e); }
    });
  }

  function listeners(eventName) {
    return eventName ? (map[eventName] || []).length : Object.keys(map).reduce(function (acc, k) {
      acc[k] = map[k].length;
      return acc;
    }, {});
  }

  window.TasahelBus = { on: on, off: off, emit: emit, listeners: listeners };

  /* جسر واحد فقط للأحداث الأساسية — يُربط مرة واحدة بعد تحميل الصفحة */
  function bindCoreBridge() {
    if (window.__tsBusBridged) return;
    window.__tsBusBridged = true;

    if (typeof window.switchTab === 'function') {
      var _sw = window.switchTab;
      window.switchTab = function (id) {
        var r = _sw.apply(this, arguments);
        emit('tab:change', { tab: id });
        return r;
      };
    }
    if (typeof window.loadInitialData === 'function') {
      var _li = window.loadInitialData;
      window.loadInitialData = async function () {
        var r = await _li.apply(this, arguments);
        emit('app:ready', { user: typeof currentUser !== 'undefined' ? currentUser : null });
        return r;
      };
    }
    if (typeof window.openTxModal === 'function') {
      var _tx = window.openTxModal;
      window.openTxModal = function (txId) {
        var r = _tx.apply(this, arguments);
        emit('tx:open', { transaction_id: txId });
        return r;
      };
    }
    if (typeof window.handleLogout === 'function') {
      var _lo = window.handleLogout;
      window.handleLogout = async function () {
        emit('auth:logout', {});
        return _lo.apply(this, arguments);
      };
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindCoreBridge);
  } else {
    bindCoreBridge();
  }
  window.addEventListener('load', bindCoreBridge);
})();
