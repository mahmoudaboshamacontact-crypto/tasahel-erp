# نظام تساهيل لإدارة الموارد والعمليات (Tasahel ERP)

نظام تشغيل وإدارة متكامل لقسم الخدمات الحكومية في شركة **تساهيل**، مبني بواجهة عربية كاملة (`RTL`) بدون أدوات بناء (`No-Build`) فوق **HTML / CSS / Vanilla JS**، مع قاعدة بيانات **Supabase (PostgreSQL + RLS + Edge Functions)**، واستضافة **Vercel** مع دعم **PWA** والعمل الجزئي بدون إنترنت.

## 1. نظرة عامة والروابط التشغيلية

| البند | التفاصيل | 
| ----- | ----- | 
| **المستودع (Repository)** | `mahmoudaboshamacontact-crypto/tasahel-erp` | 
| **بيئة الإنتاج (Production)** | `https://system-erp-v3.vercel.app/` | 
| **قاعدة البيانات (Supabase)** | Project Ref: `avehvjqifswsyayckpvx` (PostgreSQL + RLS + `pg_cron` + `pg_net`) | 
| **الواجهة الأمامية (Frontend)** | Vanilla JS (IIFE Modules `00`–`88`), Tailwind CSS (Prebuilt), Font Awesome 6.5.1, IBM Plex Sans Arabic | 
| **الخدمات السحابية (Backend)** | Supabase PostgREST / RPCs + Deno Edge Functions (`ask-ai`, `send-push`, `geo-proxy`) | 
| **الاختبارات (CI/CD)** | GitHub Actions (`node --test tests/*.test.js` على Node 22) | 

## 2. المعمارية العامة للنظام (System Architecture)

يعتمد النظام على **4 نقاط دخول (Entry Points)** تتصل مباشرةً بـ Supabase عبر طبقة **RPCs محمية بـ `SECURITY DEFINER`** وسياسات **Row Level Security (RLS)**، بالإضافة إلى **Edge Functions** للمهام التي تتطلب مفاتيح سرية:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        العملاء والموظفون (Clients)                      │
├─────────────────┬─────────────────┬──────────────────┬──────────────────┤
│   index.html    │   owner.html    │  tracking.html   │    Track.html    │
│  النظام الرئيسي │  عدادات المالك  │ تتبع عميل (كود)  │ تتبع عميل (توكن) │
│ (مدير/موظف/     │  (للمدير فقط)   │  (عام - anon)    │  (عام - anon)    │
│  مندوب/شريك)    │                 │                  │                  │
└────────┬────────┴────────┬────────┴────────┬─────────┴────────┬─────────┘
         │                 │                 │                  │
         ▼                 ▼                 ▼                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Vercel Static Hosting + Edge Headers                 │
│           (HSTS, X-Frame-Options, nosniff, CSP Enforcing, sw.js)      │
└────────┬───────────────────────────────────┬────────────────────────────┘
         │ HTTPS / WSS (JWT + Anon Key)      │ External Free APIs
         ▼                                   ▼
┌──────────────────────────────┐   ┌──────────────────────────────────────┐
│    Supabase Platform         │   │  Geoapify (Routing / Reverse Geo)    │
│  ┌────────────────────────┐  │   │  Open-Meteo (Weather Alerts)         │
│  │ Auth & RBAC (user_roles│  │   │  Open-ER-API (Currency Rates)        │
│  └───────────┬────────────┘  │   └──────────────────────────────────────┘
│  ┌───────────▼────────────┐  │
│  │ PostgreSQL (86 Tables) │  │
│  │ RLS Enabled (100%)     │  │
│  │ 190 Functions / 14 Trg │  │
│  └───────────┬────────────┘  │
│  ┌───────────▼────────────┐  │
│  │ Edge Functions (Deno)  │  │
│  │ • ask-ai (Gemini API)  │  │
│  │ • send-push (Web Push) │  │
│  └────────────────────────┘  │
└──────────────────────────────┘

```

### نمط تحميل الواجهة (Frontend Module Pattern)

* يتم تحميل **93 ملف JavaScript** و**31 ملف CSS** داخل `index.html` بالترتيب التسلسلي.

* تعتمد الوحدات على نمط **IIFE** (`(function () { 'use strict'; ... })()`) مع مشاركة الدوال عبر `window.*`.

* المكونات الحرجة (مثل `js/02`, `js/03`, شاشة `#login`) تُعامل كوحدات أساسية مقفولة، ويتم توسيعها عبر وحدات لاحقة (`js/70`–`js/88`).

## 3. نقاط الدخول (HTML Entry Points)

| الملف | الوظيفة | الفئة المستهدفة | ملاحظات أمنية ومعمارية | 
| ----- | ----- | ----- | ----- | 
| `index.html` | التطبيق الرئيسي (SPA) بكل شاشات الإدارة والموظفين والمندوب والشريك | الموظفون، المديرون، المناديب، الشركاء | يحمّل 93 سكريبت و31 CSS؛ يبدأ بشاشة تسجيل الدخول `#login`. | 
| `owner.html` | لوحة عدادات المالك (حجم القاعدة، زمن الاستجابة، مؤشر الأمان، الأخطاء) | المدير فقط (`manager`) | يقرأ `sb_url` و`sb_key` من `localStorage` ويتحقق من `my_role() === 'manager'`. | 
| `tracking.html` | تتبع المعاملة العام برقم المعاملة + كود 8 خانات + آخر 4 أرقام هاتف | العملاء (زوار `anon`) | يستدعي `lookup_public_tracking_by_code_and_phone4` مع Rate Limiting. | 
| `Track.html` | صفحة متابعة الطلب بالرابط المباشر (`?token=...`) مع محادثة الاستفسارات | العملاء (زوار `anon`) | محمية بـ `<meta http-equiv="Content-Security-Policy">`، وتعرض حالة المندوب الحية. | 

## 4. خريطة وحدات الجافاسكريبت (`js/`)

### أ. النواة والملفات الأساسية (`01` – `18`)

| الملف | الوظيفة | 
| ----- | ----- | 
| `js/00-tailwind-config.js` | إعدادات Tailwind (غير محمّل في `index.html`؛ الاعتماد الفعلي على `css/tailwind.css` المبني مسبقًا). | 
| `js/01-assets-images.js` | ثوابت الصور والأيقونات المضمنة. | 
| `js/02-login-brand.js` | هوية شاشة الدخول (ملف محمي). | 
| `js/03-core-app.js` | **النواة الرئيسية** (2,977 سطر): تهيئة `sbClient`، المصادقة، تحميل `allRequestLines` و`allServices`، إدارة المعاملات، الشات الداخلي، أدوات `escapeHtml` و`formatCurrency`. | 
| `js/03b-event-bus.js` | **نظام Event Bus المركزي** (`window.TasahelBus`): بث الأحداث الأساسية (`app:ready`, `tab:change`, `tx:open`, `auth:logout`) بعزل `try/catch` بدل الـ Monkey-Patching. |
| `js/05-chat-improvements.js` | تحسينات الشات الداخلي والإشعارات الصوتية. | 
| `js/06-cash-pdf-comments.js` | الكاش وتصدير PDF وتعليقات المعاملات. | 
| `js/07-commission-targets.js` | حساب العمولات والأهداف الشهرية (`emp_targets`). | 
| `js/08-dashboard.js` | لوحة المؤشرات والرسوم البيانية (Chart.js). | 
| `js/09-receipt-and-print.js` | طباعة الإيصالات الفردية. | 
| `js/10-audit-backup-pwa.js` | سجل التدقيق (`audit_log`) والنسخ الاحتياطي وتثبيت PWA. | 
| `js/11-tasks-notifications.js` | المهام (`tasks`) والإشعارات (`notifications`). | 
| `js/12-notes-password-lock.js` | الملاحظات الخاصة (`private_notes`) وتغيير كلمة المرور وقفل التطبيق. | 
| `js/13-couriers.js` | إدارة المناديب وحساباتهم الأساسية. | 
| `js/14-roles-partner-portal.js` | إدارة الأدوار (`user_roles`) وبوابة الشريك الخارجي (`partner`). | 
| `js/15-hr.js` | الموارد البشرية: الحضور، الإجازات، السلف/الخصومات، تجميد الرواتب. | 
| `js/16-ask-ai.js` | واجهة المساعد الذكي للمدير (يتصل بـ Edge Function `ask-ai`). | 
| `js/17-ui-polish.js` | تحسينات الواجهة العامة. | 
| `js/18-discount-comments.js` | موافقات الخصومات (`discount_approvals`) وتعليقاتها. | 

### ب. التحسينات والتقارير والعمليات (`19` – `69`)

| النطاق | الملفات الرئيسية | الوظائف | 
| ----- | ----- | ----- | 
| **التشغيل السريع ويومي** | `js/19` – `js/25` | الإدخال السريع (`js/21`)، يومي (`js/22`)، أداء الموظف (`js/23`)، إصلاحات حرجة (`js/24`)، مشاركة رابط التتبع (`js/25`). | 
| **واجهة المستخدم والأدوات** | `js/27` – `js/40` | شريط الموبايل السفلي (`js/28`)، كروت الحالات (`js/29`)، ساعة الهيدر (`js/33`)، الآلة الحاسبة الآمنة (`js/34`)، استفسارات العملاء (`js/35`)، تذكير المهام (`js/36`)، دورة الطلب (`js/37`)، أطراف الطلب (`js/38`)، واجهة Reels (`js/39`)، الاقتراح السريع (`js/40`). | 
| **التقارير والاسترداد والإغلاق** | `js/41` – `js/50` | الملخص الأسبوعي (`js/41`)، الاستردادات الجزئية والكلية (`js/42`)، متتبع الشغل (`js/44`)، مجموعات القائمة (`js/45`)، التقرير الشهري (`js/46`)، الإيصالات المجمعة (`js/47`)، مراقبة الاستقرار (`js/48`)، أداء الفريق (`js/49`)، سلة المحذوفات والأرشفة (`js/50`). | 
| **الوحدات المتقدمة (أجزاء ب–ن)** | `js/51` – `js/69` | متابعة الشغل (`js/51`)، الفلوس والعمولات (`js/52`)، المناديب والمنفذين (`js/53`)، العملاء والنمو (`js/54`)، إمكانيات المتصفح Badge/QR/WakeLock (`js/55`)، الروح المعنوية (`js/56`)، إشعارات الدفع (`js/57`)، كتالوج الخدمات (`js/58`)، القراءة بدون إنترنت عبر IndexedDB بمدة صلاحية 12 ساعة ومسح تلقائي عند انتهاء الجلسة (`js/59`)، إقفال الشهر (`js/60`)، توثيق المستندات (`js/61`)، محرك المراحل (`js/62`)، ملف العميل 360 (`js/63`)، ذكاء الإدارة (`js/64`)، مسح QR وفتح المعاملة (`js/66`)، إيقاف البند مؤقتًا (`js/67`)، سجل الطلبات الحديث (`js/68`)، ساعة الرئيسية (`js/69`). | 

### ج. بوابة المندوب، الرادار، والتكاملات الحديثة (`70` – `89` + الملحقات)

| الملف | الوظيفة | 
| ----- | ----- | 
| `js/70-courier-portal.js` & `js/70a-courier-css.js` | **بوابة المندوب المستقلة** (`#courier-app`, 3,276 سطر) بتصميم Portrait 390×844 وهوية تساهيل (`#036b29` و`#881337`). | 
| `js/71-courier-operations.js` & `js/72-courier-v12-modern.js` | شاشة عمليات المناديب للموظفين والمديرين، الختم الرقمي (PIN)، ومهام الطوارئ. | 
| `js/73-pickup-ticket.js` | **نظام تيكتات الاستلام** (2,409 سطر): إنشاء التيكت، توزيعه، خطوات المندوب، تحويله لمعاملة. | 
| `js/74-abbasiya-hub-radar.js` & `js/75-radar-phase3.js` | رادار العباسية والقرارات المعلقة وتوجيه الدفعات. | 
| `js/76-courier-phase4.js` & `js/77-phase5-analytics-tracking.js` | المرحلة 4 و5 للمندوب: بوابة الانطلاق، تقفيل الكاش الفعلي، تسليم QR، تحليلات التتبع. | 
| `js/78-batch2-polish.js` | تحسينات وتنظيف الواجهة. | 
| `js/79-courier-geo-weather.js` | تكامل **Geoapify** (توجيه خط السير + Reverse Geocoding) و**Open-Meteo** (الطقس) مع عدادات استهلاك يومية في `#tab-status`. | 
| `js/80-courier-push.js` | إشعارات الدفع الخاصة ببوابة المندوب (`pickup_ticket`, `papers_handover`). | 
| `js/81-courier-ticket-reschedule.js` | إعادة جدولة تيكتات الاستلام. | 
| `js/82-refund-closed.js` | إقفال الاستردادات المعتمدة (`Closed`). | 
| `js/84-smartdesk-paste.js` | اللصق الذكي لبيانات العملاء في شاشة الإدخال. | 
| `js/85-staff-only.js` | عزل المناديب والشركاء عن فلاتر الموظفين التشغيليين والأهداف. | 
| `js/86-money-core.js` | **المصدر الموحد للحسابات المالية** (`Money.lineNet`, `Money.sum`) بعد خصم الاستردادات المعتمدة. | 
| `js/87-error-relay.js` | ترحيل أخطاء المندوب إلى `error_log` مع تنقية بيانات العملاء (`scrub`). | 
| `js/88-ops-dashboard.js` | لوحة متابعة التشغيل والـ Aging للمدير (`ops_dashboard` RPC). |
| `js/89-ask-ai-panel.js` | واجهة "اسأل AI" للمدير فقط (تتصل بـ Edge Function `ask-ai` بدون المساس بـ `js/16`). | 
| `js/zones.js`, `js/help-modal.js`, `js/home-stable.js`, `js/login-redesign.js` | خريطة الـ 55 منطقة في 5 قطاعات، نافذة المساعدة، استقرار الرئيسية، شاشة الدخول الجديدة وحماية المحاولات (`login-redesign.css`). | 
| `js/vendor/*` | مكتبات محلية: `supabase-js-2.119.0`, `chart-4.4.1`, `exceljs-4.4.0`, `html2canvas-1.4.1`, `jspdf-2.5.1`, `jsqr-1.4.0`. | 

## 5. قاعدة البيانات (`sql/` & `supabase/`)

### أ. إحصائيات القاعدة

* **86 جدولاً** في `public` — جميعها مفعّل عليها **RLS (`relrowsecurity = true`)**.

* **190 دالة** (RPCs + Triggers) — معظمها `SECURITY DEFINER` مع `SET search_path = public`.

* **14 Trigger** على الجداول الأساسية (`request_lines`, `courier_trips`, `pickup_tickets`).

### ب. الجداول والأعمدة الحرجة

* **`request_lines`** (45 عمودًا):

  * أعمدة **`GENERATED ALWAYS`** (يُمنع تعديلها مباشرة في `UPDATE`): `total`, `exec_total`, `commission`, `status`.

  * تحكمها Triggers حرجة: `trg_guard_locked_lines` (منع تعديل المسلم/المقفل)، `lock_closed_month_trg` (قفل الشهر)، `enforce_discount_cap_trg` (سقف الخصم 20%).

* **تيكتات الاستلام وعهدة الورق**: `pickup_tickets`, `pickup_ticket_action_history`, `papers_custody_events`.

* **الأمان والتدقيق**: `user_roles`, `audit_log`, `error_log`, `staff_digital_pins`, `public_tracking_attempts`, `push_config`, `push_subscriptions`.

### ج. Edge Functions (`supabase/functions/`)

1. **`ask-ai/index.ts`**: مساعد تحليلي للمدير فقط (`my_role() === 'manager'`). يستخدم Gemini API (`gemini-3.5-flash-lite`) مع 6 أدوات مقيدة تغطي السيستم بالكامل بدون بيانات عملاء (`ai_report`, `ai_late_orders`, `ai_ops_snapshot`, `ai_hr_snapshot`, `ai_couriers_snapshot`, `ai_finance_snapshot` في `sql/part-l-ai-full-system.sql`) بدون كشف أسماء عملاء أو موظفين حقيقيين.

2. **`send-push/index.ts`**: يرسل إشعارات Web Push عبر `web-push` عند استدعائه من Trigger `notify_push` باستخدام `x-cron-secret` المخزن في `push_config`.
3. **`geo-proxy/index.ts`**: بروكسي آمن لـ Geoapify (توجيه خط السير وتحويل GPS لعناوين) يحفظ `GEOAPIFY_KEY` في Supabase Secrets ويتحقق من JWT وCORS.

## 6. الأدوار والصلاحيات (RBAC)

| الدور (`user_roles.role`) | النطاق والصلاحيات | 
| ----- | ----- | 
| **`manager` (مدير)** | صلاحية كاملة: الداش بورد، لوحة `owner.html`، اعتماد الخصومات والاستردادات، إغلاق الأشهر، HR والرواتب، `ask-ai`، إدارة الأدوار. | 
| **`staff` (موظف تشغيل)** | إدارة المعاملات (`request_lines`)، تيكتات الاستلام، الشات، المهام، الملاحظات الخاصة، تأكيد استلام الكاش/الورق عبر PIN مشفر. | 
| **`courier` (مندوب)** | معزول عبر سياسات `RESTRICTIVE` (`courier_block`) عن قراءة الجداول الداخلية مباشرة؛ يتعامل حصريًا عبر واجهة `#courier-app` ودوال `courier_*` و`papers_*`. | 
| **`partner` (شريك خارجي)** | معزول عبر `no_partner_all`؛ يتعامل عبر بوابة الشريك فقط. | 
| **`anon` (زائر عام)** | محجوب عن كل الجداول؛ متاح له فقط دوال التتبع العام المحدودة (`lookup_public_tracking_by_code_and_phone4`, `get_public_tracking_v2`, `add_public_inquiry`, `public_courier_live_status_by_token`). | 

## 7. التشغيل المحلي والاختبارات

### المتطلبات

* Node.js `v22+` (لتشغيل الاختبارات).

* حساب Supabase مفعّل مع تشغيل ملفات `sql/` بالترتيب الموثق في `RUN-ORDER-*.md`.

### أوامر الفحص والاختبار

```
# تشغيل اختبارات الصياغة لكل ملفات js/ + اختبارات الحسابات المالية (96 اختبار)
node --test tests/*.test.js

```

### النشر (Deployment)

* **Vercel**: نشر تلقائي من فرع `main` (ومعاينات تلقائية للفروع مثل `courier-tickets-v1`).

* **Service Worker (`sw.js`)**: عند تعديل أي ملف واجهة أو CSS، يجب تحديث رقم `CACHE` في `sw.js` ومعامل `?v=` في `index.html`.

* **Edge Functions**:

  ```
  supabase functions deploy ask-ai
  supabase functions deploy send-push --no-verify-jwt
  
  ```

## 8. الملاحظات المعمارية وخطة التحويل لنظام شركة (Enterprise Roadmap)

1. **إدارة الأسرار الخارجية**: نقل `GEOAPIFY_KEY` من `js/79-courier-geo-weather.js` إلى Supabase Edge Function Proxy لحماية حصة الاستخدام.

2. **تفعيل سياسة CSP الصارمة**: تحويل `Content-Security-Policy-Report-Only` في `vercel.json` إلى `Content-Security-Policy` بعد إضافة `https://api.geoapify.com` و`https://api.open-meteo.com` إلى `connect-src`، وإضافة CSP لـ `tracking.html`.

3. **إعادة هيكلة الـ Monkey-Patching**: استبدال التعديلات المتسلسلة على الدوال العامة (`switchTab` 23 مرة، `openTxModal` 16 مرة) بنظام **Event Bus / Hooks** موحد (`TasahelBus.on('tab:change', ...)`).

4. **تنظيف الملفات المتكررة واليتيمة**: توحيد `sql/pickup-ticket.sql` و`sql/pickup_ticket.sql`، بعد إزالة الملفات المكررة واليتيمة في النقطة 1.

5. **نقل حسابات الرواتب للسيرفر**: نقل منطق حساب الرواتب في `js/15-hr.js` إلى دالة RPC على PostgreSQL أسوةً بـ `Money` و`courier_p4_calc_day_totals`.