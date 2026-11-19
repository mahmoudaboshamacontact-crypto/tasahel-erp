# ترتيب تطبيق إصلاحات الأمان والسلامة (2026-11-19)

> كل ملفات SQL هنا لم تُجرَّب على قاعدة البيانات الفعلية (اتفحصت صياغتها فقط). خد Backup أو جرّبها على Branch من Supabase أولًا.

## 0) قبل البدء
- تم دمج فرع `fix/courier-radar-pending-decisions` في `main` (ملفا SQL الرادار والعمليات).
- طبّق ملفات الحزمة دي فوق `main` (الملفات مختلفة عن ملفات الفرع فمفيش تعارض).

## 1) ترتيب تشغيل SQL في Supabase (SQL Editor)
| # | الملف | ملاحظات |
|---|---|---|
| 1 | `sql/courier-radar-pending-decisions.sql` | (GPT — معتمد) |
| 2 | `sql/courier-ops-input-integrity.sql` | (GPT — معتمد) |
| 3 | `sql/fix-phase4-security.sql` | ملكية المعاملات، revoke، التحصيل، تقفيل الكاش الفعلي، PIN مشفّر، البوابة، تحويل المشاوير، وإصلاح trigger التيكتات |
| 4 | `sql/fix-tracking-public.sql` | لازم بعد `phase5-analytics-tracking.sql` |
| 5 | `sql/fix-rls-internal-tables.sql` | بيعرّف `is_internal_user()`، وبيضيف عمود `request_lines.stage` |
| 6 | `sql/fix-ops-integrity.sql` | بيعتمد على #5 (الإنقاذ الجماعي، الموارد البشرية، تحويل التيكت، خصوصية الـ AI) |

بعد ما تخلّص شغّل للتأكد (لازم `anon_can_execute = false` في كل الصفوف):
```sql
select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon_can_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (p.proname like 'courier_p4_%' or p.proname like 'staff_p4_%' or p.proname like 'radar_p4_%'
       or p.proname in ('public_courier_live_status','is_line_docs_cleared','get_customer_360_profile','ai_report','ai_late_orders'));
```
وللتأكد إن مفيش سياسات مفتوحة لأي مستخدم مسجّل:
```sql
select tablename, policyname from pg_policies
where schemaname='public' and (qual like '%auth.role()%' or with_check like '%auth.role()%');
```

## 2) رفع الواجهة
ارفع ملفات الحزمة على Vercel (مع `index.html` و`sw.js`) وبعدها Ctrl+F5 مرة. وأعد نشر Edge Function:
`supabase functions deploy ask-ai` (لو مفعّلة عندك).

## 3) تغييرات سلوك لازم تعرفها
- **كود الختم الرقمي:** الأكواد القديمة (الافتراضية 1234 أو اللي المندوب عملها) اتمسحت. كل موظف لازم يضبط كوده بنفسه من شاشة العمليات، والكود بقى مشفّر ومش ظاهر لأي حد. 5 محاولات غلط = قفل 15 دقيقة.
- **تقفيل الكاش:** المندوب بيدخل «المبلغ المسلّم فعليًا». لو فيه فرق لازم يكتب ملاحظة، والموظف بيشوف المسلّم والفرق.
- **التحصيل:** المبلغ المطلوب بيتحسب من السيرفر (حقل «المطلوب» للعرض فقط). التحصيل الكامل لازم يساوي المطلوب، والجزئي لازم يكون أقل. كل تعديل بيتحفظ في `courier_collection_history`.
- **بوابة الانطلاق:** لازم الأربع بنود، ولو السيرفر رفض الشاشة مش بتتقفل.
- **سجل المراحل:** عمود `request_lines.stage` ماكانش معرّف في أي ملف SQL، فتغيير المرحلة غالبًا ماكانش بيتحفظ. اتضاف.
- **تتبع العميل:** حالة المندوب الحية بقت جزء من نتيجة البحث بالكود + آخر 4 أرقام. الدالة القديمة بالرقم اتقفلت.
- **الـ AI:** أسماء الموظفين بقت «موظف 1، موظف 2…» وفلتر الاسم اتقفل، ووضع `context` القديم اتلغى.
- **الإنقاذ الجماعي:** لو تيكت واحد غير قابل للنقل العملية كلها بتتلغي وبيظهر رقمه.

## 4) متروك لقرارك (ما اتغيرش)
1. **لوحة الترتيب بين المناديب** (`courier_leaderboard`): بترجع أسماء كل المناديب. قاعدة المشروع «مقارنة الموظف بنفسه». تغييرها معناه إعادة تصميم تاب الترتيب — قولي لو عايز.
2. **`courier_confirm_one`:** لو المشوار متأكد بالفعل بيرجع `ok` من غير خطأ (سلوك idempotent مقصود تقريبًا).
3. **سياسة تحديث التيكت:** الموظف بيعدّل تيكت أنشأه هو فقط (أو المدير). التحويل لمعاملة بقى بيشتغل لأي موظف عن طريق RPC.
4. **ملفان متشابهان:** `sql/pickup-ticket.sql` و`sql/pickup_ticket.sql` مختلفين — اتفق على واحد وامسح التاني.
5. **حساب الرواتب** لسه بيتحسب في المتصفح وبيتبعت للسيرفر للتجميد؛ نقله للسيرفر مرحلة لاحقة.
6. **سياسة `no_partner_all`** مش موجودة في ملفات SQL؛ اتأكد منها بالاستعلام في `pg_policies`.
