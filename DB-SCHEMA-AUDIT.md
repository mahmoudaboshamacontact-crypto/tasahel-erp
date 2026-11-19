# جرد قاعدة البيانات الفعلية وتقرير الفحص الشامل — Tasahel ERP

> **تاريخ الفحص:** 2026-11-19
>
> **المصدر:** فحص مباشر بالقراءة فقط (`SELECT`) على `schema public` في Supabase + فحص حي لبوابة المندوب وشاشة المدير.

## 1. ملخص الوضع الأمني والتقني لقاعدة البيانات

* **إجمالي الجداول في `public`:** 86 جدولاً — **جميعها مفعّل عليها RLS (`relrowsecurity = true`)**.

* **سياسات `auth.role()` المفتوحة:** **0 سياسات** (تم إغلاقها بالكامل).

* **إجمالي الدوال في `public`:** 190 دالة.

* **دوال المناديب والرادار والعباسية والتيكتات و`my_role`:** 77 دالة — **جميعها `anon_can_execute = false`**.

* **الدوال المتاحة لـ `anon` (`anon_can_execute = true`) — 11 دالة فقط:**

  * دوال عامة مقصودة للتتبع والاستفسار (5): `add_public_inquiry`, `get_public_tracking`, `get_public_tracking_v2`, `lookup_public_tracking_by_code_and_phone4`, `public_courier_live_status_by_token`.

  * دوال Trigger/مساعدة يُنصح بعمل `REVOKE` لها من `anon` تنظيفًا (6): `line_stage_of`, `trg_courier_ops_fee_notice`, `trg_courier_ops_trip_notice`, `trg_courier_trip_reset`, `trg_no_fee_discount`, `trg_set_delivered_date`.

## 2. أعمدة جدول `request_lines` (45 عمودًا)

> **تنبيه حرج للمطورين:** الأعمدة `total`, `exec_total`, `commission`, `status` هي أعمدة مولّدة تلقائيًا (**`GENERATED ALWAYS`**) — أي `UPDATE` يحاول تعديلها مباشرة سيفشل بخطأ `428C9`.

| العمود | النوع | مولّد؟ | التعبير | 
| ----- | ----- | ----- | ----- | 
| `id` | `bigint` | NEVER | — | 
| `seq` | `integer` | NEVER | — | 
| `client_name` | `text` | NEVER | — | 
| `phone` | `text` | NEVER | — | 
| `transaction_id` | `text` | NEVER | — | 
| `address` | `text` | NEVER | — | 
| `service` | `text` | NEVER | — | 
| `qty` | `numeric` | NEVER | — | 
| `employee` | `text` | NEVER | — | 
| `payment_method` | `text` | NEVER | — | 
| `rn_nm` | `text` | NEVER | — | 
| `receiver` | `text` | NEVER | — | 
| `received_at` | `timestamp without time zone` | NEVER | — | 
| `unit_price` | `numeric` | NEVER | — | 
| `exec_unit_cost` | `numeric` | NEVER | — | 
| `commission_per_unit` | `numeric` | NEVER | — | 
| `executor` | `text` | NEVER | — | 
| `duration_days` | `integer` | NEVER | — | 
| `exec_start_date` | `date` | NEVER | — | 
| `complete` | `boolean` | NEVER | — | 
| `complete_date` | `date` | NEVER | — | 
| `delivered` | `boolean` | NEVER | — | 
| `delivered_date` | `date` | NEVER | — | 
| `under_review` | `boolean` | NEVER | — | 
| `under_review_date` | `date` | NEVER | — | 
| `rnr` | `text` | NEVER | — | 
| `rejection_reason` | `text` | NEVER | — | 
| `notes` | `text` | NEVER | — | 
| `total` | `numeric` | **ALWAYS** | `(qty * unit_price)` | 
| `exec_total` | `numeric` | **ALWAYS** | `(qty * exec_unit_cost)` | 
| `commission` | `numeric` | **ALWAYS** | `(qty * commission_per_unit)` | 
| `status` | `text` | **ALWAYS** | `CASE WHEN delivered THEN 'Delivered' WHEN complete THEN 'Complete' ...` | 
| `discount_pct` | `numeric` | NEVER | — | 
| `list_price` | `numeric` | NEVER | — | 
| `created_at` | `timestamptz` | NEVER | — | 
| `deleted_at` | `timestamptz` | NEVER | — | 
| `source` | `text` | NEVER | — | 
| `source_id` | `text` | NEVER | — | 
| `tracking_token` | `text` | NEVER | — | 
| `service_ref` | `text` | NEVER | — | 
| `renewal_date` | `date` | NEVER | — | 
| `is_pinned` | `boolean` | NEVER | — | 
| `pinned_at` | `timestamptz` | NEVER | — | 
| `pinned_by` | `uuid` | NEVER | — | 
| `stage` | `text` | NEVER | — | 

## 3. الـ Triggers الفعلية على الجداول الأساسية (14 Trigger)

| الجدول | اسم الـ Trigger | التوقيت والأحداث | الدالة | 
| ----- | ----- | ----- | ----- | 
| `courier_trips` | `a_protect_closed_courier_trip` | `BEFORE DELETE, UPDATE` | `trg_protect_closed_courier_trip` | 
| `courier_trips` | `courier_ops_trip_notice` | `AFTER INSERT, UPDATE` | `trg_courier_ops_trip_notice` | 
| `courier_trips` | `courier_trip_reset` | `BEFORE UPDATE` | `trg_courier_trip_reset` | 
| `pickup_tickets` | `pickup_tickets_guard_trg` | `BEFORE INSERT, UPDATE` | `trg_pickup_tickets_guard` | 
| `request_lines` | `courier_fee_confirm_reset` | `BEFORE DELETE, UPDATE` | `trg_courier_fee_confirm_reset` | 
| `request_lines` | `courier_ops_fee_notice` | `AFTER INSERT, UPDATE` | `trg_courier_ops_fee_notice` | 
| `request_lines` | `enforce_discount_cap_trg` | `BEFORE INSERT, UPDATE` | `trg_enforce_discount_cap` | 
| `request_lines` | `line_stage_event` | `AFTER INSERT, UPDATE` | `trg_line_stage_event` | 
| `request_lines` | `lock_closed_month_trg` | `AFTER INSERT, DELETE, UPDATE` | `trg_lock_closed_month` | 
| `request_lines` | `no_fee_discount` | `BEFORE INSERT, UPDATE` | `trg_no_fee_discount` | 
| `request_lines` | `set_delivered_date_on_deliver` | `BEFORE UPDATE` | `trg_set_delivered_date` | 
| `request_lines` | `trg_audit_request_lines` | `AFTER INSERT, DELETE, UPDATE` | `log_request_lines` | 
| `request_lines` | `trg_guard_locked_lines` | `BEFORE UPDATE` | `guard_locked_lines` | 
| `request_lines` | `trg_set_exec_start` | `BEFORE INSERT` | `set_exec_start` | 

### لماذا يُمنع تعديل معاملات أكتوبر `Delivered` أو حذف بنودها؟

يوجد **تريجران منفصلان** يقفان أمام التعديل/الحذف:

1. **`trg_guard_locked_lines` (`guard_locked_lines`):** يمنع أي `UPDATE` يغيّر `qty` أو `unit_price` أو `service` إذا كان `old.delivered = true` أو إذا كان الشهر (`YYYY-MM`) موجودًا في جدول `public.month_closures`.

2. **`lock_closed_month_trg` (`trg_lock_closed_month`):** يمنع `INSERT` و`DELETE` و`UPDATE` (التي تمس `employee`, `service`, `qty`, `total`, `commission`, `commission_per_unit`, `received_at`, `transaction_id`, `deleted_at`) لأي صف يقع `received_at::date` له داخل فترة مقفلة في `public.month_closings` (`reopened_at is null`).

3. **ملاحظة:** يوجد جدولان منفصلان لقفل الأشهر (`month_closures` و`month_closings`).

## 4. سياسات RLS على الجداول الثلاثة (18 سياسة — كلها لـ `authenticated`)

| الجدول | السياسة | النوع | الأمر | الشرط (`qual`) | 
| ----- | ----- | ----- | ----- | ----- | 
| `courier_trips` | `courier_block` | `RESTRICTIVE` | `ALL` | `(NOT (SELECT is_courier()))` | 
| `courier_trips` | `staff_only` | `RESTRICTIVE` | `ALL` | `is_staff()` | 
| `courier_trips` | `courier_trips_mgr` | `PERMISSIVE` | `ALL` | `is_manager()` | 
| `courier_trips` | `courier_trips_select` | `PERMISSIVE` | `SELECT` | `true` | 
| `courier_trips` | `courier_trips_insert` | `PERMISSIVE` | `INSERT` | — | 
| `courier_trips` | `courier_trips_update_staff` | `PERMISSIVE` | `UPDATE` | `true` | 
| `pickup_tickets` | `courier_block` | `RESTRICTIVE` | `ALL` | `(NOT (SELECT is_courier()))` | 
| `pickup_tickets` | `pt_select_staff` | `PERMISSIVE` | `SELECT` | `is_staff() OR is_manager()` | 
| `pickup_tickets` | `pt_insert_staff` | `PERMISSIVE` | `INSERT` | — | 
| `pickup_tickets` | `pt_update_staff_or_mgr` | `PERMISSIVE` | `UPDATE` | `is_manager() OR ...` | 
| `pickup_tickets` | `pt_delete_mgr` | `PERMISSIVE` | `DELETE` | `is_manager() AND ...` | 
| `request_lines` | `allow_select_rl` | `PERMISSIVE` | `SELECT` | `(deleted_at IS NULL)` | 
| `request_lines` | `courier_block` | `RESTRICTIVE` | `ALL` | `(NOT (SELECT is_courier()))` | 
| `request_lines` | `no_partner_all` | `RESTRICTIVE` | `ALL` | `(NOT is_partner())` | 
| `request_lines` | `staff_only` | `RESTRICTIVE` | `ALL` | `is_staff()` | 
| `request_lines` | `rl_delete_mgr` | `PERMISSIVE` | `DELETE` | `is_manager()` | 
| `request_lines` | `rl_insert` | `PERMISSIVE` | `INSERT` | — | 
| `request_lines` | `rl_update` | `PERMISSIVE` | `UPDATE` | `true` | 

## 5. قائمة كل الجداول في `public` (86 جدولًا — جميعها RLS = true)

`abbasiya_hub_batch_items`, `abbasiya_hub_batches`, `audit_log`, `backup_log`, `cash_closings`, `channel_members`, `channels`, `client_360_notes`, `client_profiles`, `client_satisfaction_surveys`, `courier_cash`, `courier_cash_handshakes`, `courier_closing_items`, `courier_closings`, `courier_collection_events`, `courier_collection_history`, `courier_daily_gates`, `courier_dispatch_events`, `courier_fee_confirms`, `courier_landmarks`, `courier_office_handovers`, `courier_peer_transfers`, `courier_pending_reminder_state`, `courier_signatures`, `courier_trip_issues`, `courier_trip_ops`, `courier_trip_ops_history`, `courier_trips`, `courier_zero_blame_logs`, `courier_zone_routes`, `couriers`, `customer_inquiries`, `daily_call_logs`, `delivery_confirmations`, `discount_approvals`, `embassy_missions`, `emp_targets`, `error_log`, `executor_evaluations`, `executor_payments`, `finance_month_settings`, `fleet_broadcasts`, `holidays`, `hr_adjustments`, `hr_attendance`, `hr_leaves`, `hr_month_locks`, `hr_payroll_snapshots`, `hr_shifts`, `hr_staff`, `line_refunds`, `line_stage_events`, `message_receipts`, `messages`, `month_closings`, `month_closures`, `month_snapshots`, `morale_settings`, `notifications`, `partner_ops`, `partners`, `pickup_tickets`, `private_notes`, `profiles`, `public_tracking_attempts`, `push_config`, `push_subscriptions`, `radar_settings`, `request_line_doc_verifications`, `request_line_stage_history`, `request_lines`, `request_lines_archive`, `request_lines_archive_2026_q3`, `request_people`, `service_doc_checklists`, `service_workflow_stages`, `services`, `shift_handover_notes`, `staff_digital_pins`, `tasks`, `team_thanks`, `tx_comments`, `tx_track_codes`, `user_roles`, `wallet_reconciliations`, `weekly_summaries`.

## 6. دوال المناديب والرادار والعباسية والتيكتات (77 دالة — كلها `anon_can_execute = false`)

* **العباسية (3):** `abbasiya_hub_approve`, `abbasiya_hub_mark_called`, `abbasiya_hub_snapshot`.

* **المناديب (69):** `courier_add_note`, `courier_apply_delivery`, `courier_chat_messages`, `courier_chat_read`, `courier_chat_send`, `courier_close_account`, `courier_confirm_day`, `courier_confirm_one`, `courier_contacts`, `courier_dispatch_pending_reminders`, `courier_dm`, `courier_items`, `courier_leaderboard`, `courier_me`, `courier_my_abbasiya_hub`, `courier_my_notes`, `courier_my_radar_alerts`, `courier_my_tickets`, `courier_ops_closings`, `courier_ops_issue_assign`, `courier_ops_issue_update`, `courier_ops_issues`, `courier_ops_items`, `courier_ops_ledger`, `courier_ops_mark_paid`, `courier_ops_notification_read`, `courier_ops_notifications`, `courier_ops_reorder`, `courier_ops_report`, `courier_ops_staff_users`, `courier_ops_trip_history`, `courier_ops_update`, `courier_overview`, `courier_owns_tx`, `courier_p4_calc_day_totals`, `courier_p4_calc_day_totals_core`, `courier_p4_client_invoice`, `courier_p4_cod_due`, `courier_p4_collection_history_fn`, `courier_p4_complete_gate`, `courier_p4_deliver_by_token`, `courier_p4_log_zero_blame`, `courier_p4_my_state`, `courier_p4_office_digital_signoff`, `courier_p4_owns_item`, `courier_p4_preview_deliver_by_token`, `courier_p4_record_collection`, `courier_p4_request_transfer`, `courier_p4_respond_transfer`, `courier_p4_submit_cash_closing`, `courier_p4_toggle_driving`, `courier_p5_motivation`, `courier_pending_reminders`, `courier_photos`, `courier_profile_update`, `courier_reopen_account`, `courier_save_pin`, `courier_save_profile`, `courier_tx_detail`, `courier_tx_notes`, `courier_v12_ack_ping`, `courier_v12_dispatch_action`, `courier_v12_mark_ready`, `courier_v12_my_pings`, `courier_v12_office_radar`, `courier_v12_resolve_event`, `courier_v12_save_landmark`, `courier_v12_save_signature`, `courier_v12_urgent_ping`.

* **أخرى (5):** `my_role`, `pickup_convert_ticket`, `radar_p4_office_snapshot`, `staff_p4_confirm_cash_handshake`, `staff_p4_set_my_pin`.

## 7. ملخص الأعطال المكتشفة من الفحص الحي (مرتبة بالأولوية)

1. **بوابة المندوب (`js/73`, `js/74`, `js/76`, `js/77`):** 4 صناديق محقونة برا `#cp-body` تحبس السكرول؛ تيكت الاستلام بدون `phone` و`summary_comment` و`call_checks` وأزرار الاتصال/الخريطة وخطوات الاستلام؛ زراير `تقفيل كاش اليوم` و`تسليم ورق للمكتب` و`مسح إيصال وتسليم` لم تستجب؛ «توفير البطارية» يكسر تباين النص في الوضع النهاري؛ النص العربي في الإيصال يظهر مربعات.

2. **قفل التحميل عند `navigator.onLine === false` (`js/59-offline-read.js`):** يمنع `loadRecentRequests()` من مخاطبة Supabase نهائيًا فيُظهر `0 معاملة` في المعاملات والبحث والكاش والرئيسية حتى لو الإنترنت يعمل.

3. **شاشة المدير:** فشل فتح تاب «المهام»، تعطّل زر «حاسبة موعد التسليم»، تضارب «آخر ظهور» لعلي صالح بين الرئيسية والرادار، تضارب هدف الشهر (`0 ج.م`) والخلاصة الذكية مع الداش بورد، رمز عملة مكسور (`▯`) في الفلوس والعمولات، وتداخلات RTL بسيطة.

4. **ملاحظة تنظيف:** مسح المعاملة التجريبية `TX-2026-8362`، وإزالة `REVOKE` عن الـ 6 دوال trigger/مساعدة المتاحة لـ `anon`.