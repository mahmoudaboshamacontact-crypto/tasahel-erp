
/* ===== المرحلة 6: الإيصال A5 + طباعة الشيتات A4 بالعرض ===== */
(function () {
  const eh = escapeHtml;
  function printWithPage(css) {
    const st = document.createElement('style');
    st.id = 'pg-orient'; st.textContent = css;
    document.head.appendChild(st);
    const done = () => { st.remove(); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
  }
  window.buildOfficialReceipt = function (ls) {
    /* إيصال بنص ورقة A4: الصفحة A4 طولي والإيصال ياخد النص العلوي (قص الورقة من النص) */
    const s = ls[0], total = ls.reduce((a, l) => a + (Number(l.total) || 0), 0),
      rec = 'REC-' + new Date().getFullYear() + '-' + Math.floor(10000 + Math.random() * 90000),
      c = 'border:1px solid #555;padding:4px 6px;font-size:11px;',
      lbl = c + 'background:#eee;font-weight:700;white-space:nowrap;';
    $('print-content').innerHTML = '<div class="receipt-half" style="border:2px solid #0b1b33;border-radius:8px;padding:10px 12px;font-size:11px;color:#000;direction:rtl;background:#fff;box-sizing:border-box">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #0b1b33;padding-bottom:7px;margin-bottom:8px">' +
        '<div style="display:flex;flex-direction:column;align-items:flex-start;gap:4px">'+logoImg(40,9)+'<div><div style="font-size:12px;font-weight:bold;color:#0b1b33">قسم الخدمات الحكومية</div></div></div>' +
        '<div style="text-align:left;font-size:10.5px;line-height:1.55"><div style="font-size:13px;font-weight:bold">إيصال تسليم واستلام مستندات</div><div>رقم الإيصال: <b>' + rec + '</b></div><div>التاريخ: ' + new Date().toLocaleDateString('ar-EG') + '</div></div></div>' +
      /* بيانات العميل: الاسم يمين / التليفون شمال — العنوان في خانة بالعرض كله */
      '<table style="width:100%;border-collapse:collapse;table-layout:fixed">' +
        '<tr><td style="' + lbl + 'width:16%">السيد / المنشأة</td><td style="' + c + 'width:34%;text-align:right">' + eh(s.client_name) + '</td><td style="' + lbl + 'width:16%">رقم التليفون</td><td style="' + c + 'width:34%;text-align:right" dir="ltr"><span style="display:block;text-align:right">' + eh(s.phone || '—') + '</span></td></tr>' +
        '<tr><td style="' + lbl + '">العنوان</td><td colspan="3" style="' + c + 'text-align:right;word-break:break-word">' + eh(s.address || '—') + '</td></tr></table>' +
      '<table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:-1px;margin-bottom:8px">' +
        '<tr><td style="' + lbl + 'width:11%">المستلم</td><td style="' + c + 'width:22%;text-align:right">' + eh(s.receiver || '—') + '</td><td style="' + lbl + 'width:17%">الموظف المسؤول</td><td style="' + c + 'width:22%;text-align:right">' + eh(s.employee || '—') + '</td><td style="' + lbl + 'width:13%">طريقة الدفع</td><td style="' + c + 'width:15%;text-align:right">' + eh(s.payment_method || '—') + '</td></tr></table>' +
      '<table style="width:100%;border-collapse:collapse;margin-bottom:8px"><thead><tr style="background:#0b1b33;color:#fff">' +
        '<th style="' + c + 'width:26px">م</th><th style="' + c + '">المعاملة</th><th style="' + c + 'text-align:right">الخدمة</th><th style="' + c + '">تاريخ الاستلام</th><th style="' + c + 'width:40px">العدد</th><th style="' + c + '">سعر الوحدة</th><th style="' + c + 'text-align:left">الإجمالي</th></tr></thead><tbody>' +
        ls.map((l, i) => '<tr><td style="' + c + 'text-align:center">' + (i + 1) + '</td><td style="' + c + 'text-align:center" dir="ltr">' + eh(l.transaction_id) + '</td><td style="' + c + 'font-weight:600">' + eh(l.service) + '</td><td style="' + c + 'text-align:center">' + formatDateOnly(lineDate(l)) + '</td><td style="' + c + 'text-align:center">' + eh(l.qty) + '</td><td style="' + c + 'text-align:center">' + fmtNum(l.unit_price) + '</td><td style="' + c + 'text-align:left;font-weight:bold">' + formatCurrency(l.total) + '</td></tr>').join('') +
      '</tbody></table>' +
      '<div style="border-top:2px solid #0b1b33;padding-top:6px"><div style="display:flex;justify-content:space-between;align-items:baseline"><b style="font-size:13px">المبلغ الإجمالي:</b><b style="font-size:19px;color:#0b1b33">' + formatCurrency(total) + '</b></div>' +
      '<div style="background:#f1f5f9;padding:4px 6px;margin-top:5px;font-weight:600;font-size:11px">المبلغ كتابة: ' + tafqeetArabic(total) + '</div></div>' +
      /* الإقرار بخط أصغر */
      '<div style="border:1px solid #555;background:#fef9c3;padding:4px 6px;font-size:8.5px;line-height:1.5;text-align:center;margin:8px 0;font-weight:normal">أقر أنا / ' + eh(s.client_name) + ' بأنني استلمت المستندات الموضحة أعلاه كاملة وبحالة جيدة، ولا توجد أي ملاحظات وقت الاستلام.</div>' +
      '<table style="width:100%;border-collapse:collapse;table-layout:fixed"><tr><td style="' + lbl + 'width:25%;text-align:center">اسم المندوب</td><td style="' + c + 'width:25%"></td><td style="' + lbl + 'width:25%;text-align:center">تاريخ التسليم</td><td style="' + c + 'width:25%;text-align:center">&nbsp;&nbsp;/&nbsp;&nbsp;/&nbsp;' + new Date().getFullYear() + '</td></tr>' +
      '<tr><td style="' + lbl + 'padding:12px 6px;text-align:center">توقيع المندوب</td><td style="' + c + '"></td><td style="' + lbl + 'padding:12px 6px;text-align:center">توقيع العميل</td><td style="' + c + '"></td></tr></table></div>';
    printWithPage('@page{size:A4 portrait;margin:6mm}@media print{#print-content{padding:0!important}#printArea tr{page-break-inside:avoid}.receipt-half{width:100%}}');
  };
})();
