/* =====================================================================
   47-batch-receipts.js | الطباعة المجمعة وتجهيز الإيصالات (2 في ورقة A4)
   - ملف مستقل تماماً (Plugin) لا يعدل أي ملف قديم ولا يلمس قاعدة بيانات Supabase.
   - يحافظ على زر "الإيصال الرسمي" (الطباعة الفورية) كما هو 100%.
   - يضيف زر "+ للطباعة المجمعة" في جدول المعاملات، نافذة المعاملة، الكارت الجانبي، وشاشة الإيصالات.
   - يضيف شاشة مستقلة "الطباعة المجمعة" لإدارة الإيصالات الجاهزة، تعديل الملاحظات، المعاينة، وطباعة الكل (إيصالين في ورقة A4 واحدة مع خط قص).
   ===================================================================== */
(function () {
  'use strict';
  if (window.__batchReceipts) return;
  window.__batchReceipts = true;

  const STORAGE_KEY = 'ts_batch_receipts_v1';
  let memoryFallback = [];
  const eh = typeof escapeHtml === 'function' ? escapeHtml : function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  };
  const wrap = function (name, fn) {
    const orig = window[name];
    if (typeof orig === 'function') window[name] = fn(orig);
  };
  const BTN_ON = 'tab-btn bg-ink text-white dark:bg-brand-600 shadow-sm';
  const BTN_OFF = 'tab-btn text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800';
  const TOKEN_OK = /^[A-Za-z0-9_-]{16,128}$/;

  const PRESET_NOTES = [
    'مستعجل',
    'يسلم مع جواز السفر',
    'نسخة الحسابات',
    'التسليم مع المندوب',
    'العميل يستلم بنفسه'
  ];

  /* ---------------- إدارة البيانات المحفوظة (localStorage + fallback) ---------------- */
  function loadBatch() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          memoryFallback = parsed;
          return parsed;
        }
      }
    } catch (e) { /* */ }
    return memoryFallback.slice();
  }

  function saveBatch(list) {
    const arr = Array.isArray(list) ? list : [];
    memoryFallback = arr.slice();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
    } catch (e) { /* */ }
    updateBadges();
  }
  window.getBatchReceiptsList = loadBatch;

  function getTxLines(txId) {
    if (typeof allRequestLines === 'undefined' || !Array.isArray(allRequestLines)) return [];
    return allRequestLines.filter(function (l) {
      return String(l.transaction_id) === String(txId) && !l.deleted_at;
    });
  }

  function snapshotLines(lines) {
    return (lines || []).map(function (l) {
      return {
        id: l.id || '',
        transaction_id: l.transaction_id || '',
        client_name: l.client_name || '',
        phone: l.phone || '',
        address: l.address || '',
        receiver: l.receiver || '',
        employee: l.employee || '',
        payment_method: l.payment_method || '',
        service: l.service || '',
        qty: Number(l.qty) || 1,
        unit_price: Number(l.unit_price) || 0,
        total: Number(l.total) || ((Number(l.qty) || 1) * (Number(l.unit_price) || 0)),
        received_at: l.received_at || l.created_at || new Date().toISOString(),
        tracking_token: l.tracking_token || ''
      };
    });
  }

  /* ---------------- توليد رابط التتبع وQR Code للإيصال ---------------- */
  function trackBaseUrl() {
    try {
      const saved = localStorage.getItem('track_base');
      if (saved) return saved;
    } catch (e) { /* */ }
    try {
      return new URL('Track.html', location.href).href.split('#')[0].split('?')[0];
    } catch (e2) {
      return 'https://tasahel.com.eg/Track.html';
    }
  }

  function trackLinkForLines(ls) {
    if (!ls || !ls.length) return null;
    const txs = Array.from(new Set(ls.map(function (x) { return String(x.transaction_id || ''); }).filter(Boolean)));
    if (txs.length !== 1) return null;
    const tx = txs[0];
    const fromSnap = ls.find(function (x) { return TOKEN_OK.test(String(x.tracking_token || '')); });
    if (fromSnap) return trackBaseUrl() + '?token=' + encodeURIComponent(fromSnap.tracking_token);
    const live = getTxLines(tx).find(function (x) { return TOKEN_OK.test(String(x.tracking_token || '')); });
    if (live) return trackBaseUrl() + '?token=' + encodeURIComponent(live.tracking_token);
    return null;
  }

  function makeQrSvg(url) {
    if (!url || typeof qrcode !== 'function') return '';
    try {
      const q = qrcode(0, 'M');
      q.addData(url);
      q.make();
      return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true })
        .replace('<svg ', '<svg style="width:100%;height:100%;display:block" ');
    } catch (e) {
      return '';
    }
  }

  /* ---------------- بناء HTML الإيصال الواحد (نصف ورقة A4) ---------------- */
  function buildSingleHalfReceiptHtml(item) {
    const ls = (item && Array.isArray(item.lines) && item.lines.length)
      ? item.lines
      : getTxLines(item && item.transaction_id);
    if (!ls || !ls.length) return '';

    const s = ls[0];
    const total = ls.reduce(function (acc, l) { return acc + (Number(l.total) || 0); }, 0);
    const rec = item.receipt_no || ('REC-' + new Date().getFullYear() + '-' + Math.floor(10000 + Math.random() * 90000));
    const today = item.print_date || new Date().toLocaleDateString('ar-EG');
    const c = 'border:1px solid #b8d4c5;padding:3.5px 6px;font-size:10.5px;';
    const lbl = c + 'background:#eef5f0;color:#0d3b2a;font-weight:700;white-space:nowrap;';
    const logo = typeof logoImg === 'function'
      ? logoImg(38, 8)
      : '<b style="font-size:17px;color:#0a6b3a">تساهيل</b>';

    const url = trackLinkForLines(ls);
    const svg = url ? makeQrSvg(url) : '';
    const qrBlock = svg
      ? '<div style="text-align:center;flex-shrink:0"><div style="width:62px;height:62px;border:1px solid #b8d4c5;border-radius:4px;padding:2px;box-sizing:border-box;background:#fff">' + svg + '</div><div style="font-size:7px;margin-top:1.5px;color:#0d3b2a;font-weight:700">امسح لمتابعة طلبك</div></div>'
      : '';

    const peopleTxt = (typeof window.getRequestPeopleNamesText === 'function' && s.transaction_id)
      ? window.getRequestPeopleNamesText(s.transaction_id)
      : '';

    const cleanNote = String(item.note || '').trim();
    /* ملاحظة نظيفة تماماً داخل جدول بيانات الإيصال بدون أي عبارات تشغيلية */
    const noteRowHtml = cleanNote
      ? '<tr><td style="' + lbl + '">ملاحظات</td><td colspan="3" style="' + c + 'text-align:right;word-break:break-word;background:#fffbeb;color:#0d2b21;font-weight:700">' + eh(cleanNote) + '</td></tr>'
      : '';

    const fmtDate = function (l) {
      try {
        return typeof formatDateOnly === 'function' && typeof lineDate === 'function'
          ? formatDateOnly(lineDate(l))
          : String(l.received_at || '').slice(0, 10);
      } catch (e) {
        return '';
      }
    };
    const fmtMoney = function (v) {
      return typeof formatCurrency === 'function' ? formatCurrency(v) : (Number(v) || 0) + ' ج.م';
    };
    const fmtNumber = function (v) {
      return typeof fmtNum === 'function' ? fmtNum(v) : String(Number(v) || 0);
    };
    const tafqeet = function (v) {
      return typeof tafqeetArabic === 'function' ? tafqeetArabic(v) : (fmtMoney(v));
    };

    return (
      '<div class="receipt-half" style="-webkit-print-color-adjust:exact;print-color-adjust:exact;border:2px solid #0a6b3a;border-radius:8px;padding:9px 11px;font-size:10.5px;font-weight:700;color:#0d2b21;direction:rtl;background:#fff;box-sizing:border-box;width:100%">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #0a6b3a;padding-bottom:6px;margin-bottom:6px">' +
          '<div style="display:flex;flex-direction:column;align-items:flex-start;gap:3px">' + logo + '<div><div style="font-size:11.5px;font-weight:bold;color:#0a6b3a">قسم الخدمات الحكومية</div></div></div>' +
          '<div style="display:flex;align-items:center;gap:10px">' +
            '<div style="text-align:right;font-size:10px;line-height:1.5;' + (qrBlock ? 'border-left:1px solid #cfe0d6;padding-left:10px' : '') + '">' +
              '<div style="font-size:13.5px;font-weight:bold;color:#0a6b3a;margin-bottom:2px">إيصال تسليم واستلام مستندات</div>' +
              '<div style="display:flex;justify-content:space-between;gap:10px"><span style="color:#3f5a4d">رقم الإيصال</span><b dir="ltr" style="color:#0d2b21">' + eh(rec) + '</b></div>' +
              '<div style="display:flex;justify-content:space-between;gap:10px"><span style="color:#3f5a4d">التاريخ</span><b style="color:#0d2b21">' + eh(today) + '</b></div>' +
            '</div>' +
            qrBlock +
          '</div>' +
        '</div>' +
        '<table style="width:100%;border-collapse:collapse;table-layout:fixed">' +
          '<tr><td style="' + lbl + 'width:16%">السيد / المنشأة</td><td style="' + c + 'width:34%;text-align:right;word-break:break-word;line-height:1.3">' + eh(s.client_name) + (peopleTxt ? '<div style="font-size:9px;color:#0a6b3a;margin-top:1.5px">المستفيدون: ' + eh(peopleTxt) + '</div>' : '') + '</td><td style="' + lbl + 'width:16%">رقم التليفون</td><td style="' + c + 'width:34%;text-align:right" dir="ltr"><span style="display:block;text-align:right;font-weight:700">' + eh(s.phone || '—') + '</span></td></tr>' +
          '<tr><td style="' + lbl + '">العنوان</td><td colspan="3" style="' + c + 'text-align:right;word-break:break-word">' + eh(s.address || '—') + '</td></tr>' +
          noteRowHtml +
        '</table>' +
        '<table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:-1px;margin-bottom:6px">' +
          '<tr><td style="' + lbl + 'width:11%">المستلم</td><td style="' + c + 'width:22%;text-align:right">' + eh(s.receiver || '—') + '</td><td style="' + lbl + 'width:17%">الموظف المسؤول</td><td style="' + c + 'width:22%;text-align:right">' + eh(s.employee || '—') + '</td><td style="' + lbl + 'width:13%">طريقة الدفع</td><td style="' + c + 'width:15%;text-align:right">' + eh(s.payment_method || '—') + '</td></tr>' +
        '</table>' +
        '<table style="width:100%;border-collapse:collapse;margin-bottom:6px"><thead><tr style="background:#e3f1e9;color:#0d3b2a;border-bottom:1.5px solid #0a6b3a">' +
          '<th style="' + c + 'width:24px;text-align:center">م</th><th style="' + c + 'width:88px;text-align:center">المعاملة</th><th style="' + c + 'text-align:right">الخدمة</th><th style="' + c + 'width:95px;text-align:center">تاريخ الاستلام</th><th style="' + c + 'width:40px;text-align:center">العدد</th><th style="' + c + 'width:76px;text-align:center">سعر الوحدة</th><th style="' + c + 'width:86px;text-align:left">الإجمالي</th></tr></thead><tbody>' +
          ls.map(function (l, i) {
            return '<tr><td style="' + c + 'text-align:center">' + (i + 1) + '</td><td style="' + c + 'text-align:center" dir="ltr">' + eh(l.transaction_id) + '</td><td style="' + c + 'text-align:right;font-weight:700">' + eh(l.service || '') + '</td><td style="' + c + 'text-align:center">' + eh(fmtDate(l)) + '</td><td style="' + c + 'text-align:center">' + eh(l.qty) + '</td><td style="' + c + 'text-align:center">' + fmtNumber(l.unit_price) + '</td><td style="' + c + 'text-align:left;font-weight:bold">' + fmtMoney(l.total) + '</td></tr>';
          }).join('') +
        '</tbody></table>' +
        '<div style="border-top:2px solid #0a6b3a;padding-top:5px"><div style="display:flex;justify-content:space-between;align-items:baseline"><b style="font-size:12px;color:#0d3b2a">المبلغ الإجمالي:</b><b style="font-size:17px;color:#0a6b3a">' + fmtMoney(total) + '</b></div>' +
        '<div style="background:#eef5f0;color:#0d3b2a;padding:3px 7px;margin-top:4px;font-weight:700;font-size:10.5px;border-radius:4px">المبلغ كتابة: ' + eh(tafqeet(total)) + '</div></div>' +
        '<div style="border:1px solid #b8d4c5;background:#f8fbf9;padding:3.5px 6px;font-size:8.5px;line-height:1.45;text-align:center;margin:6px 0;font-weight:700;border-radius:4px">أقر أنا / ' + eh(s.client_name) + ' بأنني استلمت المستندات الموضحة أعلاه كاملة وبحالة جيدة، ولا توجد أي ملاحظات وقت الاستلام.</div>' +
        '<table style="width:100%;border-collapse:collapse;table-layout:fixed"><tr><td style="' + lbl + 'width:25%;text-align:center">اسم المندوب</td><td style="' + lbl + 'width:25%;text-align:center">توقيع المندوب</td><td style="' + lbl + 'width:25%;text-align:center">تاريخ التسليم</td><td style="' + lbl + 'width:25%;text-align:center">توقيع العميل</td></tr>' +
        '<tr><td style="' + c + 'height:28px"></td><td style="' + c + '"></td><td style="' + c + 'text-align:center" dir="ltr">&nbsp;&nbsp;/&nbsp;&nbsp;/&nbsp;' + new Date().getFullYear() + '</td><td style="' + c + '"></td></tr></table>' +
        '<div style="text-align:center;font-size:8px;color:#3f5a4d;margin-top:4px">للاستفسار: 15439 &nbsp;·&nbsp; <span dir="ltr">tasahel.com.eg</span></div>' +
      '</div>'
    );
  }

  /* ---------------- بناء صفحات A4 المجمعة (إيصالان في كل ورقة) ---------------- */
  function buildCombinedPagesHtml(items) {
    const pages = [];
    for (let i = 0; i < items.length; i += 2) {
      const topHtml = buildSingleHalfReceiptHtml(items[i]);
      const bottomHtml = items[i + 1] ? buildSingleHalfReceiptHtml(items[i + 1]) : '';
      const isLastPage = (i + 2) >= items.length;
      const cutLineHtml = bottomHtml
        ? '<div class="batch-cut-line" style="border-top:1.5px dashed #64748b;margin:8px 0;text-align:center;position:relative;height:0"><span style="background:#fff;padding:0 8px;font-size:9px;color:#475569;position:relative;top:-7px;font-weight:700">✂ خط القص</span></div>'
        : '<div class="batch-cut-line" style="border-top:1px dashed #cbd5e1;margin:8px 0"></div>';

      pages.push(
        '<div class="batch-a4-page" style="box-sizing:border-box;width:100%;' + (!isLastPage ? 'page-break-after:always;break-after:page;' : '') + '">' +
          '<div class="batch-slot-top">' + topHtml + '</div>' +
          cutLineHtml +
          (bottomHtml ? '<div class="batch-slot-bottom">' + bottomHtml + '</div>' : '') +
        '</div>'
      );
    }
    return pages.join('');
  }

  /* ---------------- تشغيل الطباعة المجمعة الفعلية ---------------- */
  window.printBatchReceiptsNow = function (itemsToPrint, askClearAfter) {
    const list = itemsToPrint || loadBatch();
    if (!list.length) {
      if (typeof showToast === 'function') showToast('لا توجد إيصالات في الطباعة المجمعة حالياً', 'info');
      return;
    }
    const printBox = document.getElementById('print-content');
    if (!printBox) return;

    printBox.innerHTML = buildCombinedPagesHtml(list);

    const oldStyle = document.getElementById('pg-orient');
    if (oldStyle) oldStyle.remove();
    const st = document.createElement('style');
    st.id = 'pg-orient';
    st.textContent =
      '@page{size:A4 portrait;margin:5mm}' +
      '@media print{' +
        '#print-content{padding:0!important}' +
        '#printArea tr{page-break-inside:avoid}' +
        '.batch-a4-page{display:flex;flex-direction:column;justify-content:space-between;min-height:284mm;box-sizing:border-box;page-break-inside:avoid;break-inside:avoid}' +
        '.receipt-half{width:100%;page-break-inside:avoid;break-inside:avoid}' +
      '}';
    document.head.appendChild(st);

    const done = function () {
      st.remove();
      window.removeEventListener('afterprint', done);
      if (askClearAfter) {
        openPostPrintClearPrompt(list.length);
      }
    };
    window.addEventListener('afterprint', done);
    window.print();
  };

  /* ---------------- نافذة السؤال الهادئة بعد انتهاء الطباعة ---------------- */
  function openPostPrintClearPrompt(printedCount) {
    const old = document.getElementById('br-postprint-modal');
    if (old) old.remove();
    const ov = document.createElement('div');
    ov.id = 'br-postprint-modal';
    ov.style.cssText = 'position:fixed;inset:0;z-index:320;background:rgba(15,23,42,.65);display:flex;align-items:center;justify-content:center;padding:16px;direction:rtl;font-family:inherit';
    ov.innerHTML =
      '<div class="card p-5 max-w-sm w-full space-y-4 text-right shadow-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">' +
        '<div class="flex items-center gap-3">' +
          '<div class="h-10 w-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0"><i class="fa-solid fa-check text-base"></i></div>' +
          '<div>' +
            '<h3 class="font-bold text-sm sm:text-base text-ink dark:text-white">هل تمت طباعة الإيصالات بنجاح؟</h3>' +
            '<p class="text-xs text-slate-500 mt-0.5">تم إرسال (' + printedCount + ') إيصال إلى الطابعة. هل تريد تفريغ القائمة لبدء دفعة جديدة؟</p>' +
          '</div>' +
        '</div>' +
        '<div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">' +
          '<button type="button" data-act="keep" class="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300">الإبقاء عليها حالياً</button>' +
          '<button type="button" data-act="clear" class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold">نعم، تفريغ القائمة</button>' +
        '</div>' +
      '</div>';
    ov.addEventListener('click', function (e) {
      const act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (e.target === ov || act === 'keep') {
        ov.remove();
      } else if (act === 'clear') {
        saveBatch([]);
        paintBatchTab();
        ov.remove();
        if (typeof showToast === 'function') showToast('تم تفريغ قائمة الطباعة المجمعة بنجاح');
      }
    });
    document.body.appendChild(ov);
  }

  /* ---------------- نافذة إضافة إيصال للطباعة المجمعة (مع الملاحظة السريعة) ---------------- */
  window.openAddToBatchModal = function (linesOrTxId) {
    let lines = [];
    if (Array.isArray(linesOrTxId)) {
      lines = linesOrTxId;
    } else if (linesOrTxId) {
      lines = getTxLines(linesOrTxId);
    }
    if (!lines || !lines.length) {
      if (typeof showToast === 'function') showToast('تعذّر العثور على بنود المعاملة', 'error');
      return;
    }

    const s = lines[0];
    const txId = String(s.transaction_id || '');
    const total = lines.reduce(function (a, l) { return a + (Number(l.total) || ((Number(l.qty) || 1) * (Number(l.unit_price) || 0))); }, 0);
    const existingList = loadBatch();
    const existingIdx = existingList.findIndex(function (x) { return String(x.transaction_id) === txId && txId !== ''; });

    const old = document.getElementById('br-add-modal');
    if (old) old.remove();

    const ov = document.createElement('div');
    ov.id = 'br-add-modal';
    ov.style.cssText = 'position:fixed;inset:0;z-index:310;background:rgba(15,23,42,.65);display:flex;align-items:center;justify-content:center;padding:16px;direction:rtl;font-family:inherit';

    const chipsHtml = PRESET_NOTES.map(function (n) {
      return '<button type="button" data-chip="' + eh(n) + '" class="px-2.5 py-1 rounded-full text-[11px] font-bold border border-emerald-200 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100 transition">' + eh(n) + '</button>';
    }).join('');

    const dupWarnHtml = existingIdx !== -1
      ? '<div class="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 p-2.5 text-[11px] text-amber-800 dark:text-amber-200 font-semibold"><i class="fa-solid fa-circle-info ms-1"></i>هذه المعاملة مضافة بالفعل في الطباعة المجمعة — الحفظ سيقوم بتحديثها وملاحظتها بدلاً من تكرارها.</div>'
      : '';

    ov.innerHTML =
      '<div class="card p-5 max-w-md w-full space-y-4 text-right shadow-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">' +
        '<div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">' +
          '<div class="flex items-center gap-2.5">' +
            '<div class="h-9 w-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center"><i class="fa-solid fa-copy"></i></div>' +
            '<div>' +
              '<h3 class="font-bold text-sm sm:text-base text-ink dark:text-white">تجهيز الإيصال للطباعة المجمعة</h3>' +
              '<p class="text-[11px] text-slate-500 font-mono" dir="ltr">' + eh(txId) + ' · ' + eh(s.client_name || '') + '</p>' +
            '</div>' +
          '</div>' +
          '<button type="button" data-close="1" class="h-8 w-8 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
        dupWarnHtml +
        '<div class="space-y-2">' +
          '<label class="label !text-xs" for="br-note-input">ملاحظة تظهر على الإيصال المطبوع (اختياري):</label>' +
          '<div class="flex flex-wrap gap-1.5">' + chipsHtml + '</div>' +
          '<input id="br-note-input" type="text" maxlength="160" value="' + eh(existingIdx !== -1 ? (existingList[existingIdx].note || '') : '') + '" placeholder="اكتب ملاحظة أو اختر من الاختصارات أعلاه..." class="field text-xs">' +
        '</div>' +
        '<div class="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 gap-2">' +
          '<span class="text-[11px] text-slate-500">الإجمالي: <b class="text-emerald-600 dark:text-emerald-400">' + (typeof formatCurrency === 'function' ? formatCurrency(total) : total + ' ج.م') + '</b> (' + lines.length + ' خدمة)</span>' +
          '<div class="flex items-center gap-2">' +
            '<button type="button" data-close="1" class="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300">إلغاء</button>' +
            '<button type="button" data-save="1" class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"><i class="fa-solid fa-check"></i><span>حفظ في الطباعة المجمعة</span></button>' +
          '</div>' +
        '</div>' +
      '</div>';

    function doSave() {
      const noteEl = document.getElementById('br-note-input');
      const noteVal = noteEl ? noteEl.value.trim() : '';
      const batch = loadBatch();
      const snap = snapshotLines(lines);
      const itemObj = {
        uid: existingIdx !== -1 ? batch[existingIdx].uid : ('BR-' + Date.now() + '-' + Math.floor(100 + Math.random() * 900)),
        receipt_no: existingIdx !== -1 ? batch[existingIdx].receipt_no : ('REC-' + new Date().getFullYear() + '-' + Math.floor(10000 + Math.random() * 90000)),
        transaction_id: txId,
        client_name: s.client_name || '—',
        phone: s.phone || '—',
        service_summary: snap.map(function (x) { return x.service + (x.qty > 1 ? ' ×' + x.qty : ''); }).join(' + '),
        total: total,
        added_at: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
        print_date: new Date().toLocaleDateString('ar-EG'),
        note: noteVal,
        lines: snap
      };

      if (existingIdx !== -1) {
        batch[existingIdx] = itemObj;
      } else {
        batch.push(itemObj);
      }
      saveBatch(batch);
      ov.remove();
      if (typeof currentTab !== 'undefined' && currentTab === 'batchprint') paintBatchTab();
      if (typeof showToast === 'function') {
        const sheets = Math.ceil(batch.length / 2);
        showToast('تم حفظ إيصال (' + (s.client_name || txId) + ') في الطباعة المجمعة — الإجمالي: ' + batch.length + ' إيصال (' + sheets + ' ورقة A4)');
      }
    }

    ov.addEventListener('click', function (e) {
      if (e.target === ov || e.target.closest('[data-close]')) {
        ov.remove();
        return;
      }
      const chip = e.target.closest('[data-chip]');
      if (chip) {
        const inp = document.getElementById('br-note-input');
        if (inp) {
          inp.value = chip.getAttribute('data-chip') || '';
          inp.focus();
        }
        return;
      }
      if (e.target.closest('[data-save]')) {
        doSave();
      }
    });

    const inp = ov.querySelector('#br-note-input');
    if (inp) {
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          doSave();
        }
      });
    }

    document.body.appendChild(ov);
    if (inp) setTimeout(function () { inp.focus(); }, 40);
  };

  /* دالة مساعدة لإضافة البنود المحددة من شاشة الإيصالات (#tab-receipt) */
  window.addSelectedReceiptLinesToBatch = function () {
    if (typeof selectedReceiptLines !== 'function') return;
    const ls = selectedReceiptLines();
    if (!ls || !ls.length) return;
    window.openAddToBatchModal(ls);
  };

  /* ---------------- معاينة إيصال أو جميع الأوراق على الشاشة قبل الطباعة ---------------- */
  function openOnScreenPreviewModal(itemsToPreview, titleText) {
    if (!itemsToPreview || !itemsToPreview.length) return;
    const old = document.getElementById('br-preview-modal');
    if (old) old.remove();

    const sheetsCount = Math.ceil(itemsToPreview.length / 2);
    const pagesHtml = [];
    for (let i = 0; i < itemsToPreview.length; i += 2) {
      const sheetNo = Math.floor(i / 2) + 1;
      const topHtml = buildSingleHalfReceiptHtml(itemsToPreview[i]);
      const bottomHtml = itemsToPreview[i + 1] ? buildSingleHalfReceiptHtml(itemsToPreview[i + 1]) : '';
      pagesHtml.push(
        '<div style="background:#fff;border:1px solid #cbd5e1;border-radius:12px;padding:14px;max-width:740px;margin:0 auto 18px;box-shadow:0 8px 25px rgba(0,0,0,.12)">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#475569;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #f1f5f9">' +
            '<b>ورقة A4 رقم (' + sheetNo + ') من (' + sheetsCount + ')</b>' +
            '<span>' + (bottomHtml ? 'إيصالان في ورقة واحدة (توفير 50%)' : 'إيصال واحد في النصف العلوي (النصف السفلي فارغ)') + '</span>' +
          '</div>' +
          topHtml +
          '<div style="border-top:1.5px dashed #64748b;margin:12px 0;text-align:center;position:relative;height:0"><span style="background:#fff;padding:0 10px;font-size:9.5px;color:#475569;position:relative;top:-8px;font-weight:700">✂ خط قص الورقة من المنتصف</span></div>' +
          (bottomHtml || '<div style="border:2px dashed #e2e8f0;border-radius:8px;padding:24px;text-align:center;color:#94a3b8;font-size:11px;font-weight:700">النصف السفلي فارغ (عدد الإيصالات فردي)</div>') +
        '</div>'
      );
    }

    const ov = document.createElement('div');
    ov.id = 'br-preview-modal';
    ov.style.cssText = 'position:fixed;inset:0;z-index:315;background:rgba(15,23,42,.75);display:flex;flex-direction:column;padding:16px;direction:rtl;font-family:inherit';
    ov.innerHTML =
      '<div style="max-width:780px;width:100%;margin:0 auto;display:flex;flex-direction:column;max-height:92vh;background:#f8fafc;border-radius:16px;overflow:hidden;box-shadow:0 25px 50px rgba(0,0,0,.4)">' +
        '<div style="background:#0f172a;color:#fff;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;gap:10px">' +
          '<div>' +
            '<div style="font-weight:700;font-size:14px">' + eh(titleText || 'معاينة أوراق الطباعة المجمعة (A4)') + '</div>' +
            '<div style="font-size:11px;color:#94a3b8">عدد الإيصالات: ' + itemsToPreview.length + ' · إجمالي الورق المطلوب: ' + sheetsCount + ' ورقة A4</div>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:8px">' +
            '<button type="button" data-print-now="1" style="background:#059669;color:#fff;border:0;border-radius:10px;padding:8px 14px;font-size:12px;font-weight:700;cursor:pointer"><i class="fa-solid fa-print ms-1"></i>طباعة الآن</button>' +
            '<button type="button" data-close-prev="1" style="background:rgba(255,255,255,.12);color:#fff;border:0;border-radius:10px;padding:8px 12px;font-size:12px;font-weight:700;cursor:pointer">إغلاق</button>' +
          '</div>' +
        '</div>' +
        '<div style="padding:16px;overflow-y:auto;flex:1">' + pagesHtml.join('') + '</div>' +
      '</div>';

    ov.addEventListener('click', function (e) {
      if (e.target === ov || e.target.closest('[data-close-prev]')) {
        ov.remove();
        return;
      }
      if (e.target.closest('[data-print-now]')) {
        ov.remove();
        window.printBatchReceiptsNow(itemsToPreview, itemsToPreview.length === loadBatch().length);
      }
    });
    document.body.appendChild(ov);
  }

  /* ---------------- تحديث العدادات (Badges) في القائمة الجانبية والهيدر ---------------- */
  function updateBadges() {
    const count = loadBatch().length;
    ['menu-batch-badge', 'hdr-batch-badge', 'rec-tab-batch-badge'].forEach(function (id) {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = count > 99 ? '99+' : String(count);
      el.classList.toggle('hidden', count === 0);
    });
  }

  /* ---------------- رسم صفحة إدارة الطباعة المجمعة (#tab-batchprint) ---------------- */
  function paintBatchTab() {
    const pane = document.getElementById('tab-batchprint');
    if (!pane) return;

    const list = loadBatch();
    const count = list.length;
    const sheets = Math.ceil(count / 2);
    const savedSheets = Math.max(0, count - sheets);
    const isOdd = count % 2 === 1;
    const fmtMoney = function (v) {
      return typeof formatCurrency === 'function' ? formatCurrency(v) : (Number(v) || 0) + ' ج.م';
    };

    const oddHintHtml = isOdd
      ? '<div class="rounded-xl border border-amber-200 dark:border-amber-800/70 bg-amber-50/80 dark:bg-amber-950/30 p-3 text-xs text-amber-900 dark:text-amber-200 flex flex-wrap items-center justify-between gap-2">' +
          '<div><i class="fa-solid fa-scissors ms-1.5 text-amber-600"></i><b>تنبيه ذكي لتوفير الورق:</b> العدد الحالي فردي (<b>' + count + '</b> إيصالات)، لذلك الورقة الأخيرة رقم (<b>' + sheets + '</b>) سيُطبع فيها إيصال واحد في النصف العلوي ويبقى نصفها السفلي فارغاً. يمكنك إضافة إيصال آخر لملء الورقة بالكامل أو الطباعة الآن.</div>' +
          '<button type="button" onclick="switchTab(\'tx\')" class="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] shrink-0">+ إضافة إيصال من المعاملات</button>' +
        '</div>'
      : '';

    const rowsHtml = count
      ? list.map(function (item, idx) {
          const sheetNum = Math.floor(idx / 2) + 1;
          const isTop = idx % 2 === 0;
          const posBadge = isTop
            ? '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">ورقة ' + sheetNum + ' · النصف العلوي</span>'
            : '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800">ورقة ' + sheetNum + ' · النصف السفلي</span>';

          return (
            '<tr class="hover:bg-slate-50/80 dark:hover:bg-white/5 align-middle">' +
              '<td class="p-3 text-center font-bold text-slate-400">' + (idx + 1) + '</td>' +
              '<td class="p-3 whitespace-nowrap">' + posBadge + '</td>' +
              '<td class="p-3 whitespace-nowrap" dir="ltr"><button type="button" onclick="if(window.openTxModal)openTxModal(\'' + eh(item.transaction_id) + '\')" class="rc-tx-pill">' + eh(item.transaction_id) + '</button></td>' +
              '<td class="p-3 font-bold text-ink dark:text-white">' + eh(item.client_name) + '<div class="text-[11px] text-slate-400 font-normal" dir="ltr">' + eh(item.phone || '') + '</div></td>' +
              '<td class="p-3 text-xs text-slate-700 dark:text-slate-200 font-semibold">' + eh(item.service_summary || '—') + '</td>' +
              '<td class="p-3 whitespace-nowrap font-bold text-emerald-600 dark:text-emerald-400">' + fmtMoney(item.total) + '</td>' +
              '<td class="p-3 whitespace-nowrap text-xs text-slate-500">' + eh(item.added_at || '—') + '</td>' +
              '<td class="p-3 min-w-[210px]">' +
                '<input type="text" data-br-note="' + idx + '" value="' + eh(item.note || '') + '" placeholder="اكتب ملاحظة تظهر على الإيصال..." class="field !py-1.5 !px-2.5 !text-xs">' +
              '</td>' +
              '<td class="p-3 text-center whitespace-nowrap">' +
                '<div class="inline-flex items-center gap-1.5">' +
                  '<button type="button" data-br-prev="' + idx + '" class="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-violet-500/20 hover:text-violet-400 transition" title="معاينة الإيصال"><i class="fa-solid fa-eye text-xs"></i></button>' +
                  '<button type="button" data-br-del="' + idx + '" class="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-300 hover:bg-rose-100 transition" title="حذف من الطباعة المجمعة"><i class="fa-solid fa-trash-can text-xs"></i></button>' +
                '</div>' +
              '</td>' +
            '</tr>'
          );
        }).join('')
      : '<tr><td colspan="9" class="p-10 text-center text-slate-400 text-xs sm:text-sm font-bold">لا توجد إيصالات مضافة حالياً في الطباعة المجمعة — يمكنك إضافة أي إيصال من شاشة «المعاملات» أو شاشة «الإيصالات» بالضغط على زر «+ للطباعة المجمعة».</td></tr>';

    pane.innerHTML =
      '<div class="space-y-4">' +
        '<div class="flex flex-wrap items-center justify-between gap-3">' +
          '<div class="flex items-center gap-2.5">' +
            '<span class="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 text-white shadow-sm"><i class="fa-solid fa-copy text-sm"></i></span>' +
            '<div>' +
              '<h1 class="text-base sm:text-lg font-bold text-ink dark:text-white leading-tight">الطباعة المجمعة للإيصالات (2 في ورقة A4)</h1>' +
              '<p class="text-[11px] text-slate-500 dark:text-slate-400">تجميع الإيصالات وطباعتها كل إيصالين في ورقة A4 واحدة مع خط قص لتوفير 50% من استهلاك الورق</p>' +
            '</div>' +
          '</div>' +
          '<div class="flex flex-wrap items-center gap-2">' +
            '<button type="button" onclick="switchTab(\'tx\')" class="btn-neo-sec text-xs"><i class="fa-solid fa-plus"></i><span>إضافة من المعاملات</span></button>' +
            (count ? '<button type="button" id="br-btn-preview-all" class="btn-neo-sec text-xs"><i class="fa-solid fa-eye text-violet-500"></i><span>معاينة الأوراق (' + sheets + ')</span></button>' : '') +
            (count ? '<button type="button" id="br-btn-clear-all" class="btn-neo-sec text-xs !text-rose-600"><i class="fa-solid fa-trash-can"></i><span>تفريغ القائمة</span></button>' : '') +
            '<button type="button" id="br-btn-print-all" ' + (!count ? 'disabled' : '') + ' class="btn-neo-pri text-xs !bg-emerald-600 hover:!bg-emerald-700 disabled:opacity-50"><i class="fa-solid fa-print"></i><span>طباعة الكل (' + sheets + ' ورقة A4)</span></button>' +
          '</div>' +
        '</div>' +

        '<div class="grid grid-cols-2 lg:grid-cols-4 gap-3">' +
          '<div class="card p-3.5">' +
            '<div class="text-[11px] text-slate-500">الإيصالات الجاهزة للطباعة</div>' +
            '<div class="mt-1 text-xl font-bold font-mono text-ink dark:text-white">' + count + ' إيصال</div>' +
          '</div>' +
          '<div class="card p-3.5">' +
            '<div class="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">عدد ورق A4 الفعلي (2×1)</div>' +
            '<div class="mt-1 text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">' + sheets + ' ورقة</div>' +
          '</div>' +
          '<div class="card p-3.5">' +
            '<div class="text-[11px] text-violet-600 dark:text-violet-300 font-semibold">الورق الموفّر في هذه الدفعة</div>' +
            '<div class="mt-1 text-xl font-bold font-mono text-violet-600 dark:text-violet-300">' + savedSheets + ' ورقة</div>' +
          '</div>' +
          '<div class="card p-3.5">' +
            '<div class="text-[11px] text-slate-500">حالة الورقة الأخيرة</div>' +
            '<div class="mt-1 text-sm font-bold text-ink dark:text-white">' + (count === 0 ? 'القائمة فارغة' : (isOdd ? 'نصف ورقة متاح (فردي)' : 'مكتملة (إيصالان بالورقة)')) + '</div>' +
          '</div>' +
        '</div>' +

        oddHintHtml +

        '<div class="card overflow-hidden">' +
          '<div class="overflow-x-auto">' +
            '<table class="w-full text-xs sm:text-sm text-right">' +
              '<thead class="bg-slate-50 dark:bg-slate-800/60 text-xs font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">' +
                '<tr>' +
                  '<th class="p-3 w-10 text-center">#</th>' +
                  '<th class="p-3">الورقة / الموضع</th>' +
                  '<th class="p-3">رقم المعاملة</th>' +
                  '<th class="p-3">اسم العميل</th>' +
                  '<th class="p-3">نوع الخدمة</th>' +
                  '<th class="p-3">الإجمالي</th>' +
                  '<th class="p-3">وقت الإضافة</th>' +
                  '<th class="p-3">الملاحظة على الإيصال</th>' +
                  '<th class="p-3 text-center">إجراءات</th>' +
                '</tr>' +
              '</thead>' +
              '<tbody class="divide-y divide-slate-100 dark:divide-slate-800">' + rowsHtml + '</tbody>' +
            '</table>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  /* ---------------- أحداث التفاعل داخل شاشة الطباعة المجمعة ---------------- */
  function onBatchPaneClick(e) {
    const delBtn = e.target.closest('[data-br-del]');
    if (delBtn) {
      const idx = parseInt(delBtn.getAttribute('data-br-del'), 10);
      const list = loadBatch();
      if (list[idx]) {
        list.splice(idx, 1);
        saveBatch(list);
        paintBatchTab();
        if (typeof showToast === 'function') showToast('تم حذف الإيصال من الطباعة المجمعة');
      }
      return;
    }

    const prevBtn = e.target.closest('[data-br-prev]');
    if (prevBtn) {
      const idx = parseInt(prevBtn.getAttribute('data-br-prev'), 10);
      const list = loadBatch();
      if (list[idx]) {
        const pairStart = Math.floor(idx / 2) * 2;
        const sheetItems = list.slice(pairStart, pairStart + 2);
        openOnScreenPreviewModal(sheetItems, 'معاينة الورقة رقم (' + (Math.floor(idx / 2) + 1) + ')');
      }
      return;
    }

    if (e.target.closest('#br-btn-preview-all')) {
      openOnScreenPreviewModal(loadBatch(), 'معاينة جميع أوراق الطباعة المجمعة (A4)');
      return;
    }

    if (e.target.closest('#br-btn-print-all')) {
      window.printBatchReceiptsNow(loadBatch(), true);
      return;
    }

    if (e.target.closest('#br-btn-clear-all')) {
      openPostPrintClearPrompt(loadBatch().length);
    }
  }

  function onBatchPaneInput(e) {
    const noteInp = e.target.closest('input[data-br-note]');
    if (!noteInp) return;
    const idx = parseInt(noteInp.getAttribute('data-br-note'), 10);
    const list = loadBatch();
    if (list[idx]) {
      list[idx].note = noteInp.value;
      saveBatch(list);
    }
  }

  /* ---------------- حقن الأزرار والتبويب في الواجهة بدون المساس بالكود القديم ---------------- */
  function injectBatchButtonsIntoRecentTable() {
    const tbody = document.getElementById('recent-table-body');
    if (!tbody) return;
    tbody.querySelectorAll('button[data-tx][onclick*="printTxReceipt"]').forEach(function (printBtn) {
      const tx = printBtn.getAttribute('data-tx');
      if (!tx || (printBtn.parentElement && printBtn.parentElement.querySelector('[data-br-tx]'))) return;
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('data-br-tx', tx);
      b.className = 'p-2 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-500/25 transition';
      b.title = 'إضافة للطباعة المجمعة (2 في ورقة A4)';
      b.innerHTML = '<i class="fa-solid fa-copy text-xs"></i>';
      b.addEventListener('click', function (ev) {
        ev.stopPropagation();
        window.openAddToBatchModal(tx);
      });
      printBtn.insertAdjacentElement('afterend', b);
    });
  }

  function injectBatchTabAndReceiptButton() {
    if (window.__role === 'partner') return;

    /* 1. إنشاء شاشة #tab-batchprint */
    if (!document.getElementById('tab-batchprint')) {
      const host = document.getElementById('tab-receipt') || document.getElementById('tab-tx');
      if (host) {
        const pane = document.createElement('div');
        pane.id = 'tab-batchprint';
        pane.className = 'hidden space-y-5';
        host.insertAdjacentElement('afterend', pane);
        pane.addEventListener('click', onBatchPaneClick);
        pane.addEventListener('input', onBatchPaneInput);
      }
    }

    /* 2. إضافة زر القائمة الجانبية بجوار الإيصالات */
    const menu = document.getElementById('nav-menu');
    if (menu && !document.getElementById('tab-batchprint-btn')) {
      const btn = document.createElement('button');
      btn.id = 'tab-batchprint-btn';
      btn.type = 'button';
      btn.setAttribute('data-tab-target', 'batchprint');
      btn.className = BTN_OFF;
      btn.setAttribute('onclick', "switchTab('batchprint')");
      btn.innerHTML =
        '<i class="fa-solid fa-copy text-emerald-500"></i>' +
        '<span>الطباعة المجمعة</span>' +
        '<span id="menu-batch-badge" class="hidden rounded-full bg-emerald-600 text-white text-[10px] font-bold px-1.5 min-w-[18px] text-center leading-[18px] mr-auto">0</span>';
      const recBtn = document.getElementById('tab-receipt-btn') || menu.querySelector('[data-tab-target="receipt"]');
      if (recBtn) recBtn.insertAdjacentElement('afterend', btn);
      else menu.insertBefore(btn, menu.firstChild);
    }

    /* 3. إضافة زر في شاشة الإيصالات (#tab-receipt) بجوار الإيصال الرسمي A5 */
    const recContainer = document.getElementById('receipt-container');
    if (recContainer && !document.getElementById('br-rec-add-btn')) {
      const officialBtn = recContainer.querySelector('button[onclick*="printOfficialReceipt"]');
      if (officialBtn && officialBtn.parentElement) {
        const addBtn = document.createElement('button');
        addBtn.id = 'br-rec-add-btn';
        addBtn.type = 'button';
        addBtn.className = 'btn-neo-sec !border-emerald-500/40 !text-emerald-700 dark:!text-emerald-300';
        addBtn.setAttribute('onclick', 'addSelectedReceiptLinesToBatch()');
        addBtn.innerHTML = '<i class="fa-solid fa-copy"></i><span>+ للطباعة المجمعة</span>';
        officialBtn.insertAdjacentElement('afterend', addBtn);

        const goBtn = document.createElement('button');
        goBtn.id = 'br-rec-go-btn';
        goBtn.type = 'button';
        goBtn.className = 'btn-neo-sec';
        goBtn.setAttribute('onclick', "switchTab('batchprint')");
        goBtn.innerHTML = '<i class="fa-solid fa-layer-group text-emerald-500"></i><span>الطباعة المجمعة</span><span id="rec-tab-batch-badge" class="hidden rounded-full bg-emerald-600 text-white text-[10px] font-bold px-1.5 min-w-[18px] text-center leading-[18px]">0</span>';
        addBtn.insertAdjacentElement('afterend', goBtn);
      }
    }

    updateBadges();
  }

  /* ---------------- ربط الدوال بأمان (Wrappers) ---------------- */
  wrap('openTxModal', function (orig) {
    return function (tx) {
      const res = orig.apply(this, arguments);
      try {
        const box = document.getElementById('tx-modal-actions-left');
        if (box && !box.querySelector('[data-br-modal]')) {
          const printBtn = box.querySelector('button[onclick*="printTxReceipt"]');
          const btnHtml = '<button type="button" data-br-modal="1" data-tx="' + eh(tx) + '" onclick="openAddToBatchModal(this.dataset.tx)" class="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5"><i class="fa-solid fa-copy"></i><span>+ للطباعة المجمعة</span></button>';
          if (printBtn) printBtn.insertAdjacentHTML('afterend', btnHtml);
          else box.insertAdjacentHTML('beforeend', btnHtml);
        }
      } catch (e) { /* */ }
      return res;
    };
  });

  wrap('renderTxInspector', function (orig) {
    return function (tx) {
      const res = orig.apply(this, arguments);
      try {
        const panel = document.getElementById('tx-inspector-panel');
        if (panel && !panel.querySelector('[data-br-insp]')) {
          const printBtn = panel.querySelector('button[onclick*="printTxReceipt"]');
          const btnHtml = '<button type="button" data-br-insp="1" data-tx="' + eh(tx) + '" onclick="openAddToBatchModal(this.dataset.tx)" class="btn-neo-sec text-xs py-2 col-span-2 !border-emerald-500/40 !text-emerald-700 dark:!text-emerald-300"><i class="fa-solid fa-copy text-emerald-500"></i><span>+ إضافة للطباعة المجمعة (2 في ورقة)</span></button>';
          if (printBtn) printBtn.insertAdjacentHTML('afterend', btnHtml);
        }
      } catch (e) { /* */ }
      return res;
    };
  });

  wrap('renderRecentRequests', function (orig) {
    return function () {
      const res = orig.apply(this, arguments);
      try {
        injectBatchButtonsIntoRecentTable();
      } catch (e) { /* */ }
      return res;
    };
  });

  wrap('switchTab', function (orig) {
    return function (id) {
      const res = orig.apply(this, arguments);
      try {
        injectBatchTabAndReceiptButton();
        const pane = document.getElementById('tab-batchprint');
        const btn = document.getElementById('tab-batchprint-btn');
        const on = id === 'batchprint';
        if (pane) pane.classList.toggle('hidden', !on);
        if (btn) btn.className = on ? BTN_ON : BTN_OFF;
        if (on) paintBatchTab();
      } catch (e) { /* */ }
      return res;
    };
  });

  wrap('loadInitialData', function (orig) {
    return async function () {
      const res = await orig.apply(this, arguments);
      try {
        injectBatchTabAndReceiptButton();
        injectBatchButtonsIntoRecentTable();
      } catch (e) { /* */ }
      return res;
    };
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      try {
        injectBatchTabAndReceiptButton();
        injectBatchButtonsIntoRecentTable();
      } catch (e) { /* */ }
    });
  } else {
    try {
      injectBatchTabAndReceiptButton();
      injectBatchButtonsIntoRecentTable();
    } catch (e) { /* */ }
  }
})();
