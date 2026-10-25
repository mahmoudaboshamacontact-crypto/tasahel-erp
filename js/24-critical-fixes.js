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

  /* 4) قفل تعديل الأسعار في المعاملات المسلّمة */
const _openTxEdit = window.openTxEdit;
if (typeof _openTxEdit === 'function') {
  window.openTxEdit = async function(tx) {
    await _openTxEdit.apply(this, arguments);
    setTimeout(() => {
      // البحث عن المعاملة ومعرفة حالتها
      const o = groupedOrders.find(x => String(x.transaction_id) === String(tx));
      if (o && o.lines.some(l => l.status === 'Delivered')) {
        // قفل خانة السعر
        document.querySelectorAll('#tx-edit-modal .te-l-price').forEach(inp => {
          inp.readOnly = true;
          inp.style.backgroundColor = '#e2e8f0';
          inp.style.cursor = 'not-allowed';
          inp.title = 'لا يمكن تعديل سعر معاملة تم تسليمها';
        });
        showToast('تم قفل الأسعار لأن المعاملة مسلّمة بالفعل', 'info', 5000);
      }
    }, 300); // تأخير بسيط عشان نافذة التعديل تفتح الأول
  };
}

  console.info('[phase24] loaded successfully');
   /* 6) كارت إدارة قفل الشهور في شاشة الداش بورد */
function injectMonthLockUI() {
   if (window.__role !== 'manager') return;
  if (document.getElementById('month-lock-box')) return;
  const dash = document.getElementById('tab-dash');
  if (!dash) return;
  
  // إنشاء الكارت
  const box = document.createElement('div');
  box.id = 'month-lock-box';
  box.className = 'card p-5 mt-5 border-2 border-violet-500/30';
  box.innerHTML = `
    <div class="flex items-center gap-2 mb-3">
      <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 text-white"><i class="fa-solid fa-lock"></i></span>
      <h3 class="font-bold text-sm text-ink dark:text-white">إدارة قفل الشهور المالية</h3>
    </div>
    <p class="text-xs text-slate-500 mb-4">قفل الشهر يمنع تعديل الأسعار والكميات في المعاملات، لكن بيسمح بتعديل النصوص (اسم العميل، الملاحظات).</p>
    <div class="flex flex-wrap gap-3 items-end">
      <div>
        <label class="block text-[11px] font-bold mb-1">اختر الشهر</label>
        <input type="month" id="lock-month-input" class="field !w-auto !py-1.5 text-sm">
      </div>
      <button id="btn-lock-month" class="btn-neo-pri text-xs !py-2"><i class="fa-solid fa-lock ms-1"></i> قفل الشهر</button>
      <button id="btn-unlock-month" class="btn-neo-sec text-xs !py-2"><i class="fa-solid fa-lock-open ms-1"></i> فتح الشهر</button>
    </div>
    <div id="lock-month-msg" class="mt-3 text-xs font-bold hidden"></div>
  `;
  dash.appendChild(box);

  // تعيين الشهر الحالي تلقائياً في الخانة
  const inp = document.getElementById('lock-month-input');
  inp.value = new Date().toISOString().slice(0, 7);

  // زرار القفل
  document.getElementById('btn-lock-month').onclick = async () => {
    if (!confirm('هل أنت متأكد من قفل شهر ' + inp.value + '؟\nسيتم منع أي تعديل في الأسعار أو الكميات لهذا الشهر.')) return;
    const r = await sbClient.from('month_closures').insert({ month: inp.value });
    const msg = document.getElementById('lock-month-msg');
    msg.classList.remove('hidden');
    if (r.error) {
      if (r.error.code === '23505') msg.textContent = 'هذا الشهر مقفول بالفعل!';
      else msg.textContent = 'حدث خطأ: ' + r.error.message;
      msg.className = 'mt-3 text-xs font-bold text-rose-600';
    } else {
      msg.textContent = 'تم قفل الشهر بنجاح! تم تجميد الأرقام.';
      msg.className = 'mt-3 text-xs font-bold text-emerald-600';
    }
  };

  // زرار الفتح
  document.getElementById('btn-unlock-month').onclick = async () => {
    if (!confirm('هل أنت متأكد من فتح شهر ' + inp.value + '؟\nسيتم السماح بتعديل الأسعار مرة أخرى.')) return;
    const r = await sbClient.from('month_closures').delete().eq('month', inp.value);
    const msg = document.getElementById('lock-month-msg');
    msg.classList.remove('hidden');
    if (r.error) {
      msg.textContent = 'حدث خطأ: ' + r.error.message;
      msg.className = 'mt-3 text-xs font-bold text-rose-600';
    } else {
      msg.textContent = 'تم فتح الشهر بنجاح! يمكنك تعديل الأرقام الآن.';
      msg.className = 'mt-3 text-xs font-bold text-emerald-600';
    }
  };
}

// تشغيل الكارت لما نفتح شاشة الداش بورد
const _sw = window.switchTab;
if (typeof _sw === 'function') {
  window.switchTab = function(id) {
    const r = _sw.apply(this, arguments);
    if (id === 'dash') setTimeout(injectMonthLockUI, 100);
    return r;
  };
}
// وتشغيله لو الصفحة اتفتحت على الداش بورد
setTimeout(injectMonthLockUI, 2000);
})();
