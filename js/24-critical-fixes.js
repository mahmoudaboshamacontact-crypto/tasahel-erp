/* =====================================================================
   phase24-critical-fixes.js  |  2026-10-25
   إصلاحات حرجة: Soft Delete التلقائي + سجل الأخطاء
   ===================================================================== */
(function () {
  if (window.__phase24) return;
  window.__phase24 = true;

  const SOFT_DELETE_TABLES = ['request_lines', 'tx_comments', 'tasks'];

  /* 1) تحويل أي delete() إلى soft delete (تحديث deleted_at بدل المسح) */
  function patchSupabase() {
    if (!window.sbClient || sbClient.__phase24) return;

    const originalFrom = sbClient.from.bind(sbClient);

    sbClient.from = function (table) {
      const builder = originalFrom(table);

      if (SOFT_DELETE_TABLES.includes(table)) {
        const originalDelete = builder.delete;
        builder.delete = function () {
          console.info('[phase24] Soft delete applied to', table);
          return builder.update({ deleted_at: new Date().toISOString() });
        };
      }

      return builder;
    };

    sbClient.__phase24 = true;
    console.info('[phase24] Supabase soft-delete patched ✓');
  }

  /* 2) سجل الأخطاء التلقائي */
  async function logError(err, context) {
    try {
      if (!window.sbClient || !window.currentUser) return;
      await sbClient.from('error_log').insert({
        user_id: currentUser.id,
        user_email: currentUser.email,
        message: String(err && err.message ? err.message : err),
        stack: err && err.stack ? err.stack : null,
        context: context || null,
        user_agent: navigator.userAgent,
        url: location.href
      });
    } catch (e) {
      console.warn('[phase24] Error logging failed', e);
    }
  }

  window.addEventListener('error', function (e) {
    logError(e.error || new Error(e.message), { kind: 'window.error' });
  });

  window.addEventListener('unhandledrejection', function (e) {
    logError(e.reason || new Error('unhandled promise'), { kind: 'promise' });
  });

  /* 3) تشغيل تلقائي */
  const _init = window.loadInitialData;
  if (typeof _init === 'function') {
    window.loadInitialData = async function () {
      const res = await _init.apply(this, arguments);
      patchSupabase();
      return res;
    };
  }

  setTimeout(patchSupabase, 1500);

  console.info('[phase24] loaded successfully');
})();
