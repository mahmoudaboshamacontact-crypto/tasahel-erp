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
   function logError(err, context) {
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
    window.loadInitialData =  function () {
      const res = await _init.apply(this, arguments);
      patchSupabase();
      return res;
    };
  }

  setTimeout(patchSupabase, 1500);

  /* 4) قفل تعديل الأسعار في المعاملات المسلّمة */
const _openTxEdit = window.openTxEdit;
if (typeof _openTxEdit === 'function') {
  window.openTxEdit =  function(tx) {
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
  document.getElementById('btn-lock-month').onclick =  () => {
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
  document.getElementById('btn-unlock-month').onclick =  () => {
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
/* 8) تاب استفسارات العملاء للمدير */
function injectInquiriesTab() {
  if (window.__role !== 'manager') return;
  const menu = document.getElementById('nav-menu');
  if (!menu || document.getElementById('tab-inquiries-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'tab-inquiries-btn';
  btn.className = 'tab-btn text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800';
  btn.onclick = () => switchTab('inquiries');
  btn.innerHTML = '<i class="fa-solid fa-headset text-rose-500"></i><span>استفسارات العملاء</span><span id="inq-badge" class="hidden rounded-full bg-rose-600 text-white text-[10px] font-bold px-1.5 min-w-[18px] text-center leading-[18px] mr-auto">0</span>';
  
  const dbBtn = menu.querySelector('button[onclick="openSupabaseModal()"]');
  if (dbBtn) menu.insertBefore(btn, dbBtn); else menu.appendChild(btn);

  if (!document.getElementById('tab-inquiries')) {
    const main = document.querySelector('main');
    const div = document.createElement('div');
    div.id = 'tab-inquiries';
    div.className = 'hidden space-y-4';
    div.innerHTML = '<div class="card p-4 sm:p-5"><div class="flex items-center gap-3 mb-4"><span class="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-600 text-white"><i class="fa-solid fa-headset"></i></span><div><h2 class="font-bold text-ink dark:text-white text-sm sm:text-base">صندوق استفسارات العملاء</h2><p class="text-xs text-slate-500">الرسائل الواردة من بوابة التتبع الخاصة بالعملاء</p></div></div><div id="inquiries-list" class="space-y-3"><div class="text-center text-xs text-slate-400 py-6">جارٍ التحميل...</div></div></div>';
    main.appendChild(div);
  }
}

async function loadInquiries() {
  if (window.__role !== 'manager' || !sbClient) return;
  const list = document.getElementById('inquiries-list');
  if (!list) return;

  const r = await sbClient.from('customer_inquiries').select('*').order('created_at', { ascending: false }).limit(100);
  if (r.error) {
    list.innerHTML = '<div class="text-center text-xs text-rose-500 py-6">حدث خطأ في تحميل الرسائل: ' + r.error.message + '</div>';
    return;
  }

  const data = r.data || [];
  const pendingCount = data.filter(d => d.status === 'pending').length;
  const badge = document.getElementById('inq-badge');
  if (badge) {
    badge.textContent = pendingCount;
    badge.classList.toggle('hidden', pendingCount === 0);
  }

  if (data.length === 0) {
    list.innerHTML = '<div class="text-center text-xs text-slate-400 py-6">لا توجد استفسارات حالياً</div>';
    return;
  }

  list.innerHTML = data.map(inq => `
    <div class="card p-4 ${inq.status === 'pending' ? 'border-r-4 border-r-rose-500' : 'border-r-4 border-r-emerald-500 opacity-60'}">
      <div class="flex justify-between items-start mb-2">
        <div>
          <span class="text-xs font-bold text-ink dark:text-white">${inq.client_name || 'عميل'}</span>
          <span class="text-[10px] text-slate-400 font-mono mr-2" dir="ltr">#${inq.transaction_id}</span>
        </div>
        <span class="text-[10px] text-slate-400">${new Date(inq.created_at).toLocaleString('ar-EG')}</span>
      </div>
      
      <div class="bg-slate-50 dark:bg-slate-800 p-3 rounded-lg text-sm text-slate-700 dark:text-slate-300 mb-3 border border-slate-100 dark:border-slate-700">
        <i class="fa-solid fa-quote-right text-slate-300 text-xs mb-1 block"></i>
        ${inq.body}
      </div>

      ${inq.status === 'pending' ? `
        <div class="space-y-2 mt-3">
          <input type="text" id="reply-input-${inq.id}" placeholder="اكتب ردك هنا..." class="field !py-1.5 text-xs w-full">
          <div class="flex justify-end gap-2">
            <button onclick="submitInquiryReply(${inq.id}, '${inq.transaction_id}', false)" class="rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-3 py-1.5 text-[11px] font-bold transition">
              حفظ (ملاحظة داخلية)
            </button>
            <button onclick="submitInquiryReply(${inq.id}, '${inq.transaction_id}', true)" class="rounded-lg bg-violet-600 hover:bg-violet-700 text-white px-3 py-1.5 text-[11px] font-bold transition">
              <i class="fa-solid fa-paper-plane text-[10px] ms-1"></i> إرسال (للعميل)
            </button>
          </div>
        </div>
      ` : `
        <div class="text-[11px] text-emerald-600 font-bold text-left mt-2 bg-emerald-50 inline-block px-2 py-1 rounded border border-emerald-100">
          <i class="fa-solid fa-check-circle"></i> تم الرد / التحويل
        </div>
      `}
    </div>
  `).join('');
}

window.submitInquiryReply = async function(id, txId, isPublic) {
  const input = document.getElementById(`reply-input-${id}`);
  const body = input.value.trim();
  if (!body) return showToast('اكتب الرد الأول', 'error');

  const author = (myProfile && myProfile.full_name) || currentUser.email;
  const btn = input.nextElementSibling.querySelector('button'); 
  if (btn) btn.disabled = true;

  try {
    const r1 = await sbClient.from('tx_comments').insert({
      transaction_id: txId,
      author_id: currentUser.id,
      author_name: author,
      body: body,
      is_public: isPublic
    });
    if (r1.error) throw r1.error;

    const r2 = await sbClient.from('customer_inquiries').update({ status: isPublic ? 'replied' : 'converted' }).eq('id', id);
    if (r2.error) throw r2.error;

    showToast(isPublic ? 'تم إرسال الرد للعميل' : 'تم حفظ الملاحظة داخلياً');
    loadInquiries();
  } catch (e) {
    showError('تعذر حفظ الرد', e);
    if (btn) btn.disabled = false;
  }
};

const _switchTabInq = window.switchTab;
if (typeof _switchTabInq === 'function') {
  window.switchTab = function(id) {
    const r = _switchTabInq.apply(this, arguments);
    const inqPane = document.getElementById('tab-inquiries');
    if (inqPane) {
      if (id === 'inquiries') {
        inqPane.classList.remove('hidden');
        loadInquiries();
      } else {
        inqPane.classList.add('hidden');
      }
    }
    const inqBtn = document.getElementById('tab-inquiries-btn');
    if (inqBtn) {
      inqBtn.className = 'tab-btn ' + (id === 'inquiries' ? 'bg-ink text-white dark:bg-brand-600 shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800');
    }
    return r;
  };
}

const _initInq = window.loadInitialData;
if (typeof _initInq === 'function') {
  window.loadInitialData = async function() {
    const r = await _initInq.apply(this, arguments);
    injectInquiriesTab();
    return r;
  };
}
