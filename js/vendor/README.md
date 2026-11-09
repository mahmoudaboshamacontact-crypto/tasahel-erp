# js/vendor — مكتبات خارجية محلية

الملفات هنا منسوخة بدون تعديل من حزم npm الرسمية (ملف dist نفسه)، بدل التحميل من CDN.

| الملف | المكتبة | الإصدار | مسار الملف في حزمة npm |
|---|---|---|---|
| supabase-js-2.119.0.umd.js | @supabase/supabase-js | 2.119.0 | dist/umd/supabase.js |
| chart-4.4.1.umd.js | chart.js | 4.4.1 | dist/chart.umd.js |
| html2canvas-1.4.1.min.js | html2canvas | 1.4.1 | dist/html2canvas.min.js |
| jspdf-2.5.1.umd.min.js | jspdf | 2.5.1 | dist/jspdf.umd.min.js |
| exceljs-4.4.0.min.js | exceljs | 4.4.0 | dist/exceljs.min.js |
| jsqr-1.4.0.js | jsQR | 1.4.0 | — |

ملاحظة أمنية: jspdf 2.5.1 عليه تحذيرات معروفة (npm audit). الترقية لـ 4.x محتاجة اختبار تصدير PDF قبل ما تتعمل.
للتحديث: نزّل الإصدار الجديد من npm (`npm pack <pkg>@<version>`)، انسخ ملف dist، وغيّر اسم الملف والمرجع في index.html، وغيّر رقم CACHE في sw.js.
