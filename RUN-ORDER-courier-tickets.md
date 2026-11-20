# ترتيب تشغيل ملفات SQL — مشروع تيكت الاستلام والمناطق والأوراق وخط السير (`courier-tickets-v1`)

> **تنبيه:** لا يتم تشغيل أي ملف SQL تلقائياً. شغّل الملفات التالية يدوياً بالترتيب داخل **Supabase SQL Editor** بعد مراجعة كل مرحلة. جميع الملفات قابلة لإعادة التشغيل بأمان (Idempotent).

## الترتيب

1. **المرحلة 2 — المناطق وربط المندوب:**
   - الملف: `sql/courier-zones.sql` *(تم تشغيله والتحقق منه في Supabase)*
   - ما يفعله:
     - ينشئ جدول `public.courier_zones` (`zone_key`, `area_key`, `courier_id`, `updated_at`, `updated_by`) مع Trigger يضمن وجود مندوب واحد فقط لكل `area_key` غير فارغ.
     - يفعّل RLS على `public.courier_zones` (قراءة للموظف والمدير، كتابة للمدير فقط، حظر الوصول المباشر للمندوب).
     - يضيف عمود `zone_key` (nullable) على `public.pickup_tickets` بدون تعديل عمود `zone` القديم.
     - يُدخل التوزيع الأولي للأحياء الـ 55 وربطها بالمناديب (سمير، علي، مصطفى، محمد طه) وترك القليوبية والمحافظات الأخرى بدون مندوب (`null`).

2. **المرحلة 3 — حالة التيكت عند المندوب + سجل التواصل + إشعارات المندوب:**
   - الملف: `sql/courier-phase3.sql` *(تم اعتماده في المرحلة 3)*
   - ما يفعله:
     - يضيف عمودي `courier_step` و`courier_step_at` على `public.pickup_tickets` مع قيد check للقيم الخمس (`accepted`, `call_attempt`, `on_the_way`, `waiting`, `papers_received`).
     - ينشئ دالة `public.courier_ticket_set_step(p_ticket_id, p_step)` (`SECURITY DEFINER`) لتنفيذ `UPDATE` واحد على الصف بالترتيب الصارم بدون تعديل أي سياسة RLS، ويحدّث `public.courier_my_tickets()` لإرجاع `courier_step` و`courier_step_at` و`zone_key`.
     - يضيف `public.pickup_tickets` إلى `publication supabase_realtime` بشرط يمنع التكرار.
     - ينشئ جدول `public.courier_contact_log` مع RLS (المندوب يقرأ/يكتب صفوفه فقط، والمدير/الموظف يقرأ الكل)، ودالة `public.courier_log_contact` (`INSERT` واحد فقط)، وView `public.courier_contact_summary`.
     - ينشئ دالتي `public.courier_save_push_subscription` و`public.courier_delete_push_subscription` (للمندوب فقط بدون لمس RLS)، وتريجر `pickup_ticket_notify_courier_trg` على `public.pickup_tickets` لإدخال إشعار في `public.notifications` عند تعيين تيكت لمندوب (فيُرسله `trg_notify_push` عبر Edge Function `send-push` الموجودة).

3. **المرحلة 4 — إلغاء التيكت من العميل/المدير وتأكيد المندوب:**
   - الملف: `sql/courier-tickets-phase4.sql` *(جاهز للتشغيل بعد المراجعة)*
   - ما يفعله:
     - يضيف الأعمدة `cancel_reason`, `cancelled_at`, `cancelled_by`, `courier_ack_at` على `public.pickup_tickets`.
     - ينشئ دالة `public.pickup_ticket_cancel(p_ticket_id, p_reason)` (`SECURITY DEFINER` — للمدير فقط، سبب إجباري ≥ 3 حروف، تمنع إلغاء `converted`، ولا تمسح `courier_id` أو `courier_step`).
     - ينشئ دالة `public.courier_ticket_ack_cancel(p_ticket_id)` (`SECURITY DEFINER` — للمندوب فقط، idempotent).
     - يحدّث `public.courier_my_tickets()` لإرجاع التيكتات الملغية خلال آخر 7 أيام مع `cancel_reason`, `cancelled_at`, `courier_ack_at`.
     - ينشئ تريجر `pickup_ticket_cancel_notify_trg` (`AFTER UPDATE OF status`) لإرسال إشعار الإلغاء للمندوب عبر `public.notifications` (`kind = 'pickup_ticket_cancel'`) بدون رقم تليفون، دون تعديل `courier_trips` أو أي عمولات أو سياسات RLS.
