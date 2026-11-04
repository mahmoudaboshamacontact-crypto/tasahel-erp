/* =====================================================================
   المرحلة 3 – أساس الاستقرار (js/48-stability.js)
   1) سجل أخطاء تلقائي (error_log) بحد أقصى 5 أخطاء للجلسة، بدون تكرار،
      وبدون أي بيانات عملاء (شطب أرقام التليفونات والإيميلات بـ regex قبل الإرسال).
   2) صفحة "حالة النظام" للمدير فقط (#tab-status) تُحمّل عند فتح التاب فقط،
      مع عداد استهلاك الباقة المجانية (500MB)، زمن استجابة القاعدة، آخر 20 خطأ،
      حالة النسخة الاحتياطية، والبيانات المحمّلة، ونسخة التطبيق.
   ===================================================================== */
(function () {
  'use strict';
  if (window.__phase48) return;
  window.__phase48 = true;

  /* ثابت وحيد لنسخة التطبيق — يتحدّث يدوياً مع كل نشر */
  const APP_VERSION = 'v3.1.0-stability.1';

  const MAX_SESSION_ERRORS = 5;
  const FREE_DB_LIMIT_BYTES = 500 * 1024 * 1024; /* 500 MB */
  const BACKUP_WARN_DAYS = 7;

  const BTN_ON = 'tab-btn bg-ink text-white dark:bg-brand-600 shadow-sm';
  const BTN_OFF = 'tab-btn text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800';

  const TAB_NAMES = {
    home: 'الرئيسية',
    new: 'طلب جديد',
    tx: 'المعاملات',
    exec: 'المنفذين',
    wtrack: 'متابعة الشغل',
    cash: 'شيت الكاش',
    receipt: 'الإيصالات',
    batchprint: 'الطباعة المجمعة',
    myday: 'شغلي النهاردة',
    late: 'المتأخرات',
    chat: 'الشات الداخلي',
    tasks: 'المهام',
    notes: 'ملاحظاتي',
    inquiries: 'استفسارات العملاء',
    search: 'البحث الشامل',
    comm: 'الكوميشن والتارجت',
    dash: 'الداش بورد',
    perf: 'أداء الموظفين',
    wk: 'الملخص الأسبوعي',
    team: 'فريق العمل',
    hr: 'الموارد البشرية',
    couriers: 'المناديب',
    partners: 'المنفذون الخارجيون',
    status: 'حالة النظام'
  };

  let sessionErrorCount = 0;
  const seenErrorHashes = new Set();
  let statusBusy = false;
  let lastStatusData = null;

  const $ = function (id) { return document.getElementById(id); };
  const eh = typeof escapeHtml === 'function' ? escapeHtml : function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  };
  const wrap = function (name, fn) {
    const orig = window[name];
    if (typeof orig === 'function') window[name] = fn(orig);
  };

  function isPartner() {
    return window.__role === 'partner' || (document.body && document.body.classList.contains('is-partner-mode'));
  }

  function isMgr() {
    if (isPartner()) return false;
    if (window.__role) return window.__role === 'manager';
    try { return typeof canEditTx === 'function' && !!canEditTx(); } catch (e) { return false; }
  }

  function haveDb() {
    return typeof sbClient !== 'undefined' && !!sbClient;
  }

  function getUid() {
    return (typeof currentUser !== 'undefined' && currentUser && currentUser.id) ? String(currentUser.id) : null;
  }

  /* ---------------------------------------------------------------
     1) تنظيف الرسائل وحجب أي إيميل أو رقم تليفون أو بيانات عملاء
     --------------------------------------------------------------- */
  function toAsciiDigits(str) {
    return String(str || '').replace(/[\u0660-\u0669\u06F0-\u06F9]/g, function (d) {
      const code = d.charCodeAt(0);
      return String(code >= 0x06F0 ? code - 0x06F0 : code - 0x0660);
    });
  }

  function scrubText(raw) {
    if (!raw) return '';
    let s = toAsciiDigits(String(raw));
    s = s.replace(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, '[إيميل محذوف]');
    s = s.replace(/([?&](?:token|phone|client|email|key|apikey)=)[^&\s#]+/gi, '$1[محذوف]');
    s = s.replace(/(?:\+?\d[\d\s\-().]{6,16}\d)/g, function (match) {
      const digits = match.replace(/\D/g, '');
      if (digits.length >= 8 && digits.length <= 15) return '[رقم محذوف]';
      return match;
    });
    return s.replace(/\s+/g, ' ').trim();
  }

  function cleanSource(src) {
    if (!src) return '';
    const s = String(src).trim();
    try {
      const u = new URL(s, location.origin);
      return scrubText(u.pathname || '').slice(0, 120);
    } catch (e) {
      return scrubText(s.split('?')[0].split('#')[0]).slice(0, 120);
    }
  }

  function simpleHash(str) {
    let h = 5381;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) + h) ^ s.charCodeAt(i);
    }
    return (h >>> 0).toString(36);
  }

  function shouldIgnoreError(rawMsg, rawSource) {
    const m = String(rawMsg || '').trim();
    const s = String(rawSource || '').trim();
    if (!m) return true;
    if (/^script error\.?$/i.test(m)) return true;
    if (/ResizeObserver/i.test(m)) return true;
    if (/chrome-extension:\/\/|moz-extension:\/\/|safari-extension:\/\/|chrome-extension/i.test(m + ' ' + s)) return true;
    if (/error_log|48-stability/i.test(m + ' ' + s)) return true;
    return false;
  }

  function guardLegacyErrorInsert() {
    if (!haveDb() || sbClient.__phase48Guarded) return;
    try {
      const origFrom = sbClient.from.bind(sbClient);
      sbClient.from = function (table) {
        const builder = origFrom(table);
        if (table === 'error_log' && builder && typeof builder.insert === 'function' && !builder.__p48) {
          const origIns = builder.insert.bind(builder);
          builder.insert = function (row, opts) {
            if (row && !Array.isArray(row) && ('user_email' in row || 'stack' in row || 'user_agent' in row || 'url' in row)) {
              return Promise.resolve({ data: null, error: null });
            }
            return origIns(row, opts);
          };
          builder.__p48 = true;
        }
        return builder;
      };
      sbClient.__phase48Guarded = true;
    } catch (e) { /* تجاهل بصمت */ }
  }

  function recordClientError(rawMsg, rawSource, lineNo, colNo) {
    try {
      if (sessionErrorCount >= MAX_SESSION_ERRORS) return;
      if (isPartner()) return;
      const uid = getUid();
      if (!haveDb() || !uid) return;
      if (shouldIgnoreError(rawMsg, rawSource)) return;

      const cleanMsg = scrubText(rawMsg).slice(0, 300);
      if (!cleanMsg) return;

      const h = simpleHash(cleanMsg);
      if (seenErrorHashes.has(h)) return;
      seenErrorHashes.add(h);
      sessionErrorCount++;

      guardLegacyErrorInsert();

      const payload = {
        user_id: uid,
        role: window.__role || (isMgr() ? 'manager' : 'staff'),
        message: cleanMsg,
        source: cleanSource(rawSource) || null,
        line: Number.isFinite(Number(lineNo)) ? Number(lineNo) : null,
        col: Number.isFinite(Number(colNo)) ? Number(colNo) : null,
        tab: (typeof currentTab === 'string' && currentTab) ? currentTab.slice(0, 40) : 'home',
        app_version: APP_VERSION,
        ua: String((typeof navigator !== 'undefined' && navigator.userAgent) || '').slice(0, 150)
      };

      const req = sbClient.from('error_log').insert(payload);
      if (req && typeof req.then === 'function') {
        req.then(function () {}, function () {});
      }
    } catch (e) {}
  }

  window.addEventListener('error', function (ev) {
    try {
      if (!ev) return;
      const msg = ev.message || (ev.error && ev.error.message) || '';
      const src = ev.filename || (ev.error && ev.error.fileName) || '';
      const ln = ev.lineno != null ? ev.lineno : (ev.error && ev.error.lineNumber);
      const cl = ev.colno != null ? ev.colno : (ev.error && ev.error.columnNumber);
      recordClientError(msg, src, ln, cl);
    } catch (e) { /* */ }
  });

  window.addEventListener('unhandledrejection', function (ev) {
    try {
      if (!ev) return;
      const r = ev.reason;
      const msg = r ? (r.message || String(r)) : 'رفض غير معالج (Promise)';
      let src = '';
      let ln = null;
      let cl = null;
      if (r && typeof r.stack === 'string') {
        const m = /((?:https?:\/\/|\/)[^\s):]+):(\d+):(\d+)/.exec(r.stack);
        if (m) {
          src = m[1];
          ln = parseInt(m[2], 10);
          cl = parseInt(m[3], 10);
        }
      }
      recordClientError(msg, src, ln, cl);
    } catch (e) { /* */ }
  });

  /* ---------------------------------------------------------------
     2) أدوات العرض لصفحة "حالة النظام" (#tab-status)
     --------------------------------------------------------------- */
  function formatMB(bytes) {
    const b = Number(bytes) || 0;
    const mb = b / (1024 * 1024);
    return (mb < 10 ? mb.toFixed(2) : mb.toFixed(1)) + ' MB';
  }

  function formatInt(n) {
    return Math.max(0, Math.round(Number(n) || 0)).toLocaleString('en-US');
  }

  function resolveUserName(uid, role) {
    if (!uid) return 'غير محدد';
    try {
      if (typeof profiles !== 'undefined' && Array.isArray(profiles)) {
        const p = profiles.find(function (x) { return String(x.id) === String(uid); });
        if (p && p.full_name) return p.full_name;
      }
      if (typeof currentUser !== 'undefined' && currentUser && String(currentUser.id) === String(uid)) {
        if (typeof myProfile !== 'undefined' && myProfile && myProfile.full_name) return myProfile.full_name;
      }
    } catch (e) { /* */ }
    return (role === 'manager' ? 'مدير' : 'موظف') + ' (' + String(uid).slice(0, 6) + ')';
  }

  function resolveTabLabel(tabId) {
    if (!tabId) return '—';
    return TAB_NAMES[tabId] ? (TAB_NAMES[tabId] + ' (' + tabId + ')') : String(tabId);
  }

  function readBackupState() {
    try {
      const raw = localStorage.getItem('tasahel_last_backup');
      if (!raw) return { exists: false, warn: true, ageDays: Infinity, dateStr: 'لم يتم أخذ نسخة على الجهاز ده بعد', count: 0 };
      const parsed = JSON.parse(raw);
      const at = Number(parsed && parsed.at);
      if (!at || isNaN(at)) return { exists: false, warn: true, ageDays: Infinity, dateStr: 'غير مسجلة', count: 0 };
      const ageDays = (Date.now() - at) / 86400000;
      const dateStr = typeof formatDateTime === 'function'
        ? formatDateTime(new Date(at).toISOString())
        : new Date(at).toLocaleString('ar-EG');
      return {
        exists: true,
        warn: ageDays > BACKUP_WARN_DAYS,
        ageDays: ageDays,
        dateStr: dateStr,
        count: Number(parsed.n) || 0
      };
    } catch (e) {
      return { exists: false, warn: true, ageDays: Infinity, dateStr: 'غير مسجلة', count: 0 };
    }
  }

  function readLoadedMemoryState() {
    const count = (typeof allRequestLines !== 'undefined' && Array.isArray(allRequestLines)) ? allRequestLines.length : 0;
    const arch = (typeof archiveState !== 'undefined' && archiveState) ? archiveState : { done: false, loading: false, failed: false, total: null };
    const fromDate = (typeof DATA_FROM !== 'undefined' && DATA_FROM) ? DATA_FROM : '—';
    let archText = 'في الانتظار';
    let archTone = 'warn';
    if (arch.failed) {
      archText = 'تعذّر استكمال الأرشيف';
      archTone = 'bad';
    } else if (arch.loading) {
      archText = 'جاري التحميل (' + formatInt(count) + (arch.total != null ? ' من ' + formatInt(arch.total) : '') + ')';
      archTone = 'warn';
    } else if (arch.done) {
      archText = 'مكتمل (' + formatInt(count) + (arch.total != null ? ' من ' + formatInt(arch.total) : '') + ')';
      archTone = 'ok';
    }
    return { count: count, archText: archText, archTone: archTone, fromDate: fromDate };
  }

  /* ---------------------------------------------------------------
     3) جلب بيانات حالة النظام (عند فتح التاب أو الضغط على تحديث فقط)
     --------------------------------------------------------------- */
  async function fetchAndRenderSystemStatus() {
    const pane = $('tab-status');
    if (!pane || !isMgr() || !haveDb() || statusBusy) return;
    statusBusy = true;
    paintStatusPane({ loading: true });

    let pingMs = null;
    let pingErr = null;
    let sysData = null;
    let sysErr = null;
    let errorsList = [];
    let errorsErr = null;

    try {
      const t0 = performance.now();
      const pingRes = await sbClient.rpc('my_role');
      pingMs = Math.max(1, Math.round(performance.now() - t0));
      if (pingRes && pingRes.error) pingErr = pingRes.error;
    } catch (e) {
      pingErr = e;
    }

    try {
      const [rpcRes, errRes] = await Promise.all([
        sbClient.rpc('get_system_status'),
        sbClient.from('error_log')
          .select('id,created_at,user_id,role,message,source,line,col,tab,app_version,ua')
          .order('created_at', { ascending: false })
          .limit(20)
      ]);
      if (rpcRes.error) sysErr = rpcRes.error;
      else sysData = rpcRes.data || {};

      if (errRes.error) errorsErr = errRes.error;
      else errorsList = errRes.data || [];
    } catch (e) {
      sysErr = e;
    }

    lastStatusData = {
      checkedAt: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      pingMs: pingMs,
      pingErr: pingErr,
      sysData: sysData,
      sysErr: sysErr,
      errorsList: errorsList,
      errorsErr: errorsErr
    };
    statusBusy = false;
    paintStatusPane(lastStatusData);
  }

  async function clearErrorLog() {
    if (!isMgr() || !haveDb()) return;
    if (!confirm('متأكد إنك عايز تمسح سجل الأخطاء بالكامل؟')) return;
    const btn = $('st48-clear-btn');
    if (btn) btn.disabled = true;
    try {
      const r = await sbClient.from('error_log').delete().gte('id', 0);
      if (r.error) throw r.error;
      if (typeof showToast === 'function') showToast('تم مسح سجل الأخطاء بنجاح');
      await fetchAndRenderSystemStatus();
    } catch (e) {
      if (typeof showError === 'function') showError('تعذّر مسح سجل الأخطاء', e);
      if (btn) btn.disabled = false;
    }
  }

  function paintStatusPane(state) {
    const pane = $('tab-status');
    if (!pane || !isMgr()) return;

    const st = state || lastStatusData || {};
    const bk = readBackupState();
    const mem = readLoadedMemoryState();

    const ms = st.pingMs;
    let latTone = 'bad';
    let latLabel = 'غير متصل';
    if (!st.pingErr && ms != null) {
      if (ms < 500) { latTone = 'ok'; latLabel = 'سريع ومستقر (أقل من 500ms)'; }
      else if (ms < 1500) { latTone = 'warn'; latLabel = 'متوسط (أقل من 1500ms)'; }
      else { latTone = 'bad'; latLabel = 'بطيء (1500ms أو أكتر)'; }
    }

    const d = st.sysData || {};
    const rowsObj = d.rows || d;
    const dbBytes = Number(d.db_size_bytes != null ? d.db_size_bytes : d.db_bytes) || 0;
    const dbPctRaw = (dbBytes / FREE_DB_LIMIT_BYTES) * 100;
    const dbPctDisplay = dbPctRaw < 10 ? dbPctRaw.toFixed(1) : String(Math.round(dbPctRaw));
    const dbBarWidth = Math.max(1, Math.min(100, dbPctRaw)).toFixed(1);
    const dbTone = dbPctRaw < 60 ? 'ok' : (dbPctRaw <= 85 ? 'warn' : 'bad');
    const dbToneLabel = dbPctRaw < 60 ? 'آمن (أقل من 60%)' : (dbPctRaw <= 85 ? 'متوسط — راقب الاستهلاك (60% - 85%)' : 'مرتفع جداً — قريب من الحد الأقصى (فوق 85%)');

    const errors24h = Number(d.errors_24h) || 0;

    const tableRows = [
      ['بنود الطلبات (request_lines)', rowsObj.request_lines],
      ['سجل التعديلات (audit_log)', rowsObj.audit_log],
      ['تعليقات المعاملات (tx_comments)', rowsObj.tx_comments],
      ['رسائل الشات (messages)', rowsObj.messages],
      ['سجل الأخطاء (error_log)', rowsObj.error_log]
    ];

    const sqlMissing = (st.sysErr && /42883|42P01|PGRST20[25]|does not exist|schema cache|Could not find/i.test((st.sysErr.message || '') + ' ' + (st.sysErr.code || '')))
      || (st.errorsErr && /42P01|PGRST205|does not exist|schema cache/i.test((st.errorsErr.message || '') + ' ' + (st.errorsErr.code || '')));

    const sqlNoticeHtml = sqlMissing
      ? '<div class="st48-card border border-amber-300 dark:border-amber-700 bg-amber-50/70 dark:bg-amber-950/30 text-xs space-y-1">' +
          '<div class="font-bold st48-warn"><i class="fa-solid fa-database ms-1.5"></i>مطلوب تشغيل ملف SQL الخاص بالمرحلة 3 في Supabase</div>' +
          '<div class="text-slate-600 dark:text-slate-300">شغّل ملف <b class="font-mono">sql/stability-1.sql</b> في Supabase SQL Editor علشان جدول الأخطاء ودالة <b class="font-mono">get_system_status()</b> يشتغلوا بالكامل.</div>' +
        '</div>'
      : '';

    const errs = Array.isArray(st.errorsList) ? st.errorsList : [];
    const errorsTableHtml = errs.length
      ? '<div class="overflow-x-auto">' +
          '<table class="w-full text-right text-xs">' +
            '<thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-100 dark:border-slate-800">' +
              '<tr>' +
                '<th class="p-2.5 whitespace-nowrap">الوقت</th>' +
                '<th class="p-2.5 whitespace-nowrap">الموظف</th>' +
                '<th class="p-2.5 whitespace-nowrap">التاب</th>' +
                '<th class="p-2.5">الرسالة والمصدر</th>' +
              '</tr>' +
            '</thead>' +
            '<tbody class="divide-y divide-slate-100 dark:divide-slate-800">' +
              errs.map(function (er) {
                const when = typeof formatDateTime === 'function' ? formatDateTime(er.created_at) : String(er.created_at || '');
                const emp = resolveUserName(er.user_id, er.role);
                const tabLbl = resolveTabLabel(er.tab);
                const loc = [er.source, er.line != null ? ('سطر ' + er.line) : null, er.app_version].filter(Boolean).join(' · ');
                return '<tr>' +
                  '<td class="p-2.5 whitespace-nowrap text-[11px] text-slate-500 dark:text-slate-400">' + eh(when) + '</td>' +
                  '<td class="p-2.5 whitespace-nowrap font-bold text-ink dark:text-white">' + eh(emp) + '</td>' +
                  '<td class="p-2.5 whitespace-nowrap"><span class="rounded-lg bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-semibold">' + eh(tabLbl) + '</span></td>' +
                  '<td class="p-2.5 break-words">' +
                    '<div class="font-mono text-xs text-rose-600 dark:text-rose-300 font-semibold" dir="ltr">' + eh(er.message || '—') + '</div>' +
                    (loc ? '<div class="text-[10.5px] text-slate-400 font-mono mt-0.5" dir="ltr">' + eh(loc) + '</div>' : '') +
                  '</td>' +
                '</tr>';
              }).join('') +
            '</tbody>' +
          '</table>' +
        '</div>'
      : '<div class="py-6 text-center text-xs text-slate-400">مفيش أي أخطاء مسجّلة في السجل حالياً ✓</div>';

    pane.innerHTML =
      '<div class="space-y-4">' +
        '<div class="card p-4 flex flex-wrap items-center justify-between gap-3">' +
          '<div class="flex items-center gap-3">' +
            '<span class="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white"><i class="fa-solid fa-heart-pulse"></i></span>' +
            '<div>' +
              '<div class="flex flex-wrap items-center gap-2">' +
                '<h2 class="font-bold text-ink dark:text-white text-sm sm:text-base">حالة النظام واستهلاك الباقة</h2>' +
                '<span class="rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 font-mono text-[11px] font-bold text-violet-600 dark:text-violet-300" dir="ltr">' + eh(APP_VERSION) + '</span>' +
              '</div>' +
              '<p class="text-xs text-slate-500 mt-0.5">' +
                (st.loading ? 'جاري فحص حالة النظام...' : ('قراءة يدوية فقط وقت فتح الصفحة · آخر فحص: ' + eh(st.checkedAt || 'الآن'))) +
              '</p>' +
            '</div>' +
          '</div>' +
          '<button id="st48-refresh-btn" type="button" ' + (st.loading ? 'disabled' : '') + ' class="st48-btn rounded-xl bg-brand-600 hover:bg-brand-700 px-4 py-2 text-xs font-bold text-white shadow-sm disabled:opacity-60 flex items-center gap-1.5">' +
            '<i class="fa-solid fa-rotate"></i><span>' + (st.loading ? 'جاري التحديث...' : 'تحديث الآن') + '</span>' +
          '</button>' +
        '</div>' +

        sqlNoticeHtml +

        '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">' +

          '<div class="st48-card space-y-2">' +
            '<div class="flex items-center justify-between text-slate-500 dark:text-slate-400 font-semibold">' +
              '<span>اتصال قاعدة البيانات</span>' +
              '<span class="st48-dot st48-bg-' + latTone + '"></span>' +
            '</div>' +
            '<div class="text-xl font-bold font-mono st48-' + latTone + '" dir="ltr">' + (ms != null ? (ms + ' ms') : '—') + '</div>' +
            '<div class="text-[11px] text-slate-500 dark:text-slate-400">' + eh(latLabel) + '</div>' +
          '</div>' +

          '<div class="st48-card space-y-2">' +
            '<div class="flex items-center justify-between text-slate-500 dark:text-slate-400 font-semibold">' +
              '<span>آخر نسخة احتياطية</span>' +
              '<span class="st48-dot st48-bg-' + (bk.warn ? 'bad' : 'ok') + '"></span>' +
            '</div>' +
            '<div class="text-sm font-bold ' + (bk.warn ? 'st48-bad' : 'text-ink dark:text-white') + '">' +
              (bk.exists ? ('من ' + Math.max(0, Math.floor(bk.ageDays)) + ' يوم') : 'لم تؤخذ بعد') +
            '</div>' +
            '<div class="text-[11px] text-slate-500 dark:text-slate-400">' +
              eh(bk.dateStr) + (bk.exists && bk.count ? (' · ' + formatInt(bk.count) + ' بند') : '') +
            '</div>' +
            (bk.warn
              ? '<div class="pt-1 flex items-center justify-between gap-2">' +
                  '<span class="text-[11px] font-bold st48-bad"><i class="fa-solid fa-triangle-exclamation ms-1"></i>' + (bk.exists ? 'أقدم من 7 أيام!' : 'خد نسخة احتياطية!') + '</span>' +
                  '<button type="button" data-st48-backup="1" class="st48-btn rounded-lg bg-amber-500 px-2.5 py-1 text-[11px] font-bold text-slate-950">نسخة الآن</button>' +
                '</div>'
              : '<div class="text-[11px] font-semibold st48-ok">محدّثة وأقل من 7 أيام ✓</div>') +
          '</div>' +

          '<div class="st48-card space-y-2">' +
            '<div class="flex items-center justify-between text-slate-500 dark:text-slate-400 font-semibold">' +
              '<span>البيانات المحمّلة حالياً</span>' +
              '<span class="st48-dot st48-bg-' + mem.archTone + '"></span>' +
            '</div>' +
            '<div class="text-xl font-bold font-mono text-ink dark:text-white">' + formatInt(mem.count) + ' <span class="text-xs font-sans font-semibold text-slate-500">بند</span></div>' +
            '<div class="text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5">' +
              '<div>حالة الأرشيف: <b class="st48-' + mem.archTone + '">' + eh(mem.archText) + '</b></div>' +
              '<div>تاريخ البداية (DATA_FROM): <b class="font-mono" dir="ltr">' + eh(mem.fromDate) + '</b></div>' +
            '</div>' +
          '</div>' +

          '<div class="st48-card space-y-2">' +
            '<div class="flex items-center justify-between text-slate-500 dark:text-slate-400 font-semibold">' +
              '<span>نسخة التطبيق والأخطاء</span>' +
              '<span class="st48-dot st48-bg-' + (errors24h === 0 ? 'ok' : (errors24h < 10 ? 'warn' : 'bad')) + '"></span>' +
            '</div>' +
            '<div class="text-sm font-bold font-mono text-ink dark:text-white" dir="ltr">' + eh(APP_VERSION) + '</div>' +
            '<div class="text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5">' +
              '<div>أخطاء آخر 24 ساعة: <b class="font-mono ' + (errors24h > 0 ? 'st48-warn' : 'st48-ok') + '">' + formatInt(errors24h) + '</b></div>' +
              '<div>المسجّل في الجلسة الحالية: <b class="font-mono">' + sessionErrorCount + ' / ' + MAX_SESSION_ERRORS + '</b></div>' +
            '</div>' +
          '</div>' +

        '</div>' +

        '<div class="card p-4 sm:p-5 space-y-4">' +
          '<div class="flex flex-wrap items-center justify-between gap-2">' +
            '<div>' +
              '<h3 class="font-bold text-sm text-ink dark:text-white flex items-center gap-2">' +
                '<i class="fa-solid fa-hard-drive text-brand-600"></i>' +
                '<span>عداد استهلاك الباقة المجانية (Supabase 500 MB)</span>' +
              '</h3>' +
              '<p class="text-xs text-slate-500 mt-0.5">' + eh(dbToneLabel) + '</p>' +
            '</div>' +
            '<div class="text-end font-mono">' +
              '<span class="text-base font-bold st48-' + dbTone + '" dir="ltr">' + eh(formatMB(dbBytes)) + '</span>' +
              '<span class="text-xs text-slate-400" dir="ltr"> / 500 MB (' + eh(dbPctDisplay) + '%)</span>' +
            '</div>' +
          '</div>' +

          '<div class="st48-meter-track">' +
            '<div class="st48-meter-fill st48-bg-' + dbTone + '" style="width:' + dbBarWidth + '%"></div>' +
          '</div>' +

          '<div class="pt-1">' +
            '<div class="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">عدد الصفوف التقديري في الجداول الأساسية:</div>' +
            '<div class="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">' +
              tableRows.map(function (tr) {
                return '<div class="st48-card !p-3">' +
                  '<div class="text-[11px] text-slate-500 dark:text-slate-400 truncate">' + eh(tr[0]) + '</div>' +
                  '<div class="mt-1 text-base font-bold font-mono text-ink dark:text-white">' + (st.sysData ? formatInt(tr[1]) : '—') + ' <span class="text-[10px] font-sans font-normal text-slate-400">صف</span></div>' +
                '</div>';
              }).join('') +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="card p-4 sm:p-5 space-y-3">' +
          '<div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">' +
            '<div>' +
              '<h3 class="font-bold text-sm text-ink dark:text-white flex items-center gap-2">' +
                '<i class="fa-solid fa-bug text-rose-500"></i>' +
                '<span>آخر 20 خطأ مسجّل في النظام</span>' +
              '</h3>' +
              '<p class="text-[11px] text-slate-500 mt-0.5">يُحذف السجل الأقدم من 30 يوم تلقائياً، ولا يحتوي على أي أرقام تليفونات أو بيانات عملاء</p>' +
            '</div>' +
            (errs.length
              ? '<button id="st48-clear-btn" type="button" class="st48-btn rounded-xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 px-3.5 py-2 text-xs font-bold text-rose-600 dark:text-rose-300 flex items-center gap-1.5">' +
                  '<i class="fa-solid fa-trash-can"></i><span>مسح السجل</span>' +
                '</button>'
              : '') +
          '</div>' +
          errorsTableHtml +
        '</div>' +
      '</div>';
  }

  /* ---------------------------------------------------------------
     4) حقن التاب والزر في القائمة الجانبية (للمدير فقط)
     --------------------------------------------------------------- */
  function placeBtnInAdminGroup(btn) {
    const menu = $('nav-menu');
    if (!menu || !btn) return;
    const adminBody = menu.querySelector(':scope > section[data-mg="admin"] .mg-body');
    if (adminBody) {
      btn.dataset.mgi = '6';
      if (btn.parentElement !== adminBody) adminBody.appendChild(btn);
      return;
    }
    const backupBtn = $('backup-btn');
    if (backupBtn && backupBtn.parentElement === menu) {
      backupBtn.insertAdjacentElement('afterend', btn);
    } else {
      const foot = menu.querySelector(':scope > .r-logout-menu');
      if (foot) menu.insertBefore(btn, foot);
      else menu.appendChild(btn);
    }
  }

  function removeStatusUi() {
    const b = $('tab-status-btn');
    if (b) b.remove();
    const p = $('tab-status');
    if (p) p.remove();
  }

  function ensureStatusTab() {
    if (!isMgr()) {
      removeStatusUi();
      return false;
    }

    if (!$('tab-status')) {
      const main = document.querySelector('main');
      const host = $('tab-partners') || $('tab-couriers') || $('tab-notes') || (main && main.lastElementChild);
      if (!host && !main) return false;
      const pane = document.createElement('div');
      pane.id = 'tab-status';
      pane.className = 'hidden space-y-4';
      if (host) host.insertAdjacentElement('afterend', pane);
      else main.appendChild(pane);

      pane.addEventListener('click', function (e) {
        const t = e.target && e.target.closest ? e.target : null;
        if (!t) return;
        if (t.closest('#st48-refresh-btn')) {
          fetchAndRenderSystemStatus();
          return;
        }
        if (t.closest('#st48-clear-btn')) {
          clearErrorLog();
          return;
        }
        if (t.closest('[data-st48-backup]')) {
          if (typeof window.backupAll === 'function') window.backupAll();
        }
      });
    }

    let btn = $('tab-status-btn');
    if (!btn) {
      const menu = $('nav-menu');
      if (!menu) return false;
      btn = document.createElement('button');
      btn.id = 'tab-status-btn';
      btn.type = 'button';
      btn.setAttribute('data-tab-target', 'status');
      btn.className = (typeof currentTab !== 'undefined' && currentTab === 'status') ? BTN_ON : BTN_OFF;
      btn.setAttribute('onclick', "switchTab('status')");
      btn.innerHTML = '<i class="fa-solid fa-heart-pulse text-emerald-500"></i><span>حالة النظام</span>';
    }
    placeBtnInAdminGroup(btn);
    return true;
  }

  wrap('switchTab', function (orig) {
    return function (id) {
      if (id === 'status' && !isMgr()) {
        if (typeof showToast === 'function') showToast('الصفحة دي للمدير بس', 'info');
        return;
      }
      const res = orig.apply(this, arguments);
      try {
        ensureStatusTab();
        const pane = $('tab-status');
        const btn = $('tab-status-btn');
        const on = id === 'status' && isMgr();
        if (pane) pane.classList.toggle('hidden', !on);
        if (btn) btn.className = on ? BTN_ON : BTN_OFF;
        if (on) {
          const sec = btn && btn.closest('.mg');
          if (sec && !sec.classList.contains('open')) {
            sec.classList.add('open');
            const h = sec.querySelector('.mg-head');
            if (h) h.setAttribute('aria-expanded', 'true');
          }
          fetchAndRenderSystemStatus();
        }
      } catch (e) { /* */ }
      return res;
    };
  });

  wrap('loadInitialData', function (orig) {
    return async function () {
      guardLegacyErrorInsert();
      const res = await orig.apply(this, arguments);
      try {
        guardLegacyErrorInsert();
        ensureStatusTab();
      } catch (e) { /* */ }
      return res;
    };
  });

  wrap('handleLogout', function (orig) {
    return function () {
      try {
        lastStatusData = null;
        removeStatusUi();
      } catch (e) { /* */ }
      return orig.apply(this, arguments);
    };
  });
})();
