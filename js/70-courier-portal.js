/* =====================================================================
   بوابة المندوب (js/70-courier-portal.js) — النسخة 3 (Courier Portal v3)
   - المندوب بيدخل بحساب دوره courier فبتظهر له الشاشة دي بس (مفيش #app).
   - 5 تابات:
       1) حسابي (عمولته لايف + ملخص ترتيبه)
       2) مشاويري (كروت المشاوير + بحث سريع + فلتر حالة التأكيد + ملاحظات سريعة)
       3) الترتيب (لوحة شرف وترتيب الاستلامات والتسليم بين المناديب: اليوم/الأسبوع/الشهر)
       4) المراجعة (تأكيد آخر اليوم: استلام / تسليم / رسوم توصيل)
       5) التواصل (رسايل خاصة مع الموظفين والمدير + اتصال / واتساب)
   - بطاقات تعريف وإرشاد (Screen Guide) أعلى كل شاشة عشان المندوب مايتوهش أبداً،
     مع إمكانية طي/فتح الشرح وحفظ التفضيل في localStorage.
   - للمدير داخل السيستم الأساسي:
       • زر ثابت في القائمة الجانبية («حسابات المناديب») مع فحص للصلاحيات وFallback للإيميل
       • شريط وزرار بارز داخل شاشة «المناديب» (#tab-couriers) لربط حسابات المناديب وإدارتهم وعرض لوحة الترتيب
   - مش بيلمس js/13 ولا js/14 ولا أي ملف مقفول.
   ===================================================================== */
(function () {
  if (window.__courierPortal) return; window.__courierPortal = true;
  const $ = id => document.getElementById(id);
  const eh = s => (typeof escapeHtml === 'function' ? escapeHtml(s == null ? '' : String(s)) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const TZ = 'Africa/Cairo';
  const MGR_EMAILS = ['mahmoud.aboshama@tasahel.com.eg', 'mahmoud.aboshama.contact@gmail.com'];

  const st = {
    me: null, items: [], sig: '', tab: 'home', period: 'today', lbPeriod: 'month',
    day: null, type: 'all', statusFilter: 'all', q: '',
    leaderboard: [], lbsig: '', lbLoaded: false,
    contacts: [], csig: '', chat: null, msgs: [], draft: '',
    theme: 'dark', timer: null, tick: 0,
    busy: false, offline: false, unreadSeen: 0, loaded: false,
    guides: {}, month: null, rvOpen: false, rvf: 'all', tripScope: 'day', pPhoto: undefined, pT: undefined, pP: undefined
  };

  /* ---------- صلاحية المدير (الدور أو الإيميل المعتمد) ---------- */
  function isManagerUser() {
    if (window.__role === 'manager') return true;
    const u = window.currentUser || (typeof currentUser !== 'undefined' ? currentUser : null);
    const em = String((u && u.email) || '').toLowerCase().trim();
    return MGR_EMAILS.includes(em);
  }

  /* ---------- تواريخ (بتوقيت القاهرة) ---------- */
  const today = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
  const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const weekStart = s => addDays(s, -((new Date(s + 'T00:00:00Z').getUTCDay() + 1) % 7));   /* الأسبوع بيبدأ السبت */
  const monthStart = s => s.slice(0, 8) + '01';
  const dayLabel = s => { try { return new Date(s + 'T12:00:00Z').toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }); } catch (e) { return s; } };
  const timeOf = iso => { try { return new Date(iso).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', timeZone: TZ }); } catch (e) { return ''; } };
  const monthOf = d => d.slice(0, 7);
  const addMonths = (m, n) => { const a = m.split('-').map(Number); return new Date(Date.UTC(a[0], a[1] - 1 + n, 1)).toISOString().slice(0, 7); };
  const monthLabel = m => { try { return new Date(m + '-15T12:00:00Z').toLocaleDateString('ar-EG', { month: 'long', year: 'numeric', timeZone: 'UTC' }); } catch (e) { return m; } };
  const monthEnd = m => { const t = today(), e = addDays(addMonths(m, 1) + '-01', -1); return e > t ? t : e; };
  const minMonth = () => addMonths(monthOf(addDays(today(), -120)), 1);   /* آخر شهور كاملة متاحة من السيرفر */
  const rangeOf = (p, m) => { const t = today(); if (p === 'today') return [t, t]; if (p === 'week') return [weekStart(t), t]; m = m || monthOf(t); return [m + '-01', monthEnd(m)]; };
  const money = n => Number(n || 0).toLocaleString('ar-EG') + ' ج';
  const num = n => Number(n || 0).toLocaleString('ar-EG');

  /* ---------- حفظ واسترجاع حالة بطاقات التعريف (الشرح) ---------- */
  function initGuides() {
    try { st.guides = JSON.parse(localStorage.getItem('ts_cp_guides') || '{}') || {}; } catch (e) { st.guides = {}; }
  }
  function toggleGuide(tab) {
    st.guides[tab] = !(st.guides[tab] === true);
    try { localStorage.setItem('ts_cp_guides', JSON.stringify(st.guides)); } catch (e) { /* */ }
    renderTab(false);
  }

  const GUIDES = {
    home: { icon: 'fa-chart-pie', title: 'حسابي', desc: 'هنا بتشوف فلوسك: كام مشوار عملت وكام عمولتك. اختار اليوم أو الأسبوع أو الشهر (وتقدر تتنقل بين الشهور).',
      steps: ['الأخضر «مؤكد»: مشاوير راجعتها وأكدتها وبتتحسب لك.', 'البرتقالي «مش متأكد»: مشاوير اتسجلت باسمك ولسه مراجعتهاش.', 'في الأسبوع والشهر هتلاقي كل يوم لوحده وحالته، واضغط على اليوم عشان تراجعه.'] },
    trips: { icon: 'fa-motorcycle', title: 'مشاويري', desc: 'كل مشاويرك بالتفصيل: اسم العميل وتليفونه وعنوانه. اختار «يوم يوم» أو «الشهر كله».',
      steps: ['اضغط «اتصال» أو «واتساب» للعميل، واضغط العنوان يفتح الخريطة.', 'لو فيه مشكلة أو رسوم توصيل ناقصة اضغط «ملاحظة للموظف».', 'ابحث باسم العميل أو رقم المعاملة من خانة البحث.'] },
    rank: { icon: 'fa-trophy', title: 'الترتيب', desc: 'ترتيبك وسط المناديب في عدد الاستلامات والتسليمات. للتشجيع بس، ومحدش بيشوف فلوس غيره.',
      steps: ['الترتيب حسب إجمالي المشاوير ثم التسليمات.', 'اختار اليوم أو الأسبوع أو الشهر.'] },
    review: { icon: 'fa-clipboard-check', title: 'المراجعة', desc: 'هنا بتراجع أيام الشهر وتأكد مشاويرك عشان تتحسب في عمولتك. اختار الشهر وشوف كل يوم متأكد ولا لأ.',
      steps: ['اليوم اللي عليه «مش متأكد» اضغط «راجع وأكّد»، وبعدين زرار «تم تأكيد…» لكل قسم.', 'لو لقيت غلط اضغط «ملاحظة» وبلّغ الموظف قبل ما تأكد.', 'لو الموظف عدّل حاجة بعد تأكيدك، التأكيد بيتلغي وتأكد تاني.'] },
    chat: { icon: 'fa-comments', title: 'التواصل', desc: 'رسايل خاصة مع الموظفين والإدارة، وكمان اتصال وواتساب. اضغط على الاسم عشان تكتب له.',
      steps: ['🟢 يعني الموظف فاتح السيستم دلوقتي.', 'لو الرسالة عن طلب معين افتحها من كارت الطلب في «مشاويري».'] },
    profile: { icon: 'fa-id-card', title: 'ملفي الشخصي', desc: 'ضيف صورتك ومسماك الوظيفي ورقم تليفونك عشان الموظفين يعرفوك ويتواصلوا معاك.',
      steps: ['الاسم بتحدده الإدارة ومش بيتغير من هنا.', 'الصورة بتتصغّر لوحدها، اختار أي صورة من الموبايل.', 'اضغط «حفظ» في الآخر.'] }
  };

  function renderGuideBanner(tab) {
    const g = GUIDES[tab]; if (!g) return '';
    const open = st.guides[tab] === true;
    return '<div class="cp-guide"><div class="cp-guide-hd"><div class="cp-guide-ic"><i class="fa-solid ' + g.icon + '"></i></div>' +
      '<div class="cp-guide-tt"><b>شاشة «' + eh(g.title) + '» — إيه فايدتها؟</b><p>' + eh(g.desc) + '</p></div>' +
      '<button type="button" class="cp-guide-x" data-act="guide-toggle" data-gtab="' + tab + '">' + (open ? 'إخفاء التفاصيل' : 'تفاصيل أكتر') + '</button></div>' +
      (open ? '<ul class="cp-guide-ul">' + g.steps.map(x => '<li>' + eh(x) + '</li>').join('') + '</ul>' : '') + '</div>';
  }

  /* ---------- ثيم: صباحي (فاتح) / مسائي (داكن) ---------- */
  function initTheme() {
    let t = null; try { t = localStorage.getItem('ts_cp_theme'); } catch (e) { /* */ }
    if (t !== 'light' && t !== 'dark') { const h = Number(new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: TZ })); t = (h >= 6 && h < 18) ? 'light' : 'dark'; }
    st.theme = t;
  }
  function applyTheme() {
    const o = $('courier-app'); if (o) o.setAttribute('data-theme', st.theme);
    const b = $('cp-theme'); if (b) b.innerHTML = st.theme === 'dark' ? '<i class="fa-solid fa-sun"></i> صباحي' : '<i class="fa-solid fa-moon"></i> مسائي';
  }
  function toggleTheme() { st.theme = st.theme === 'dark' ? 'light' : 'dark'; try { localStorage.setItem('ts_cp_theme', st.theme); } catch (e) { /* */ } applyTheme(); }

  /* ---------- ستايل مستقل (من غير Tailwind) ---------- */
  function addCss() {
    if ($('cp-style')) return;
    const s = document.createElement('style'); s.id = 'cp-style';
    s.textContent = [
      'body.is-courier-mode #app,body.is-courier-mode #login{display:none !important}',
      '#courier-app{--bg:#0a1424;--card:#10223d;--tx:#e8eef8;--mu:#8fa1ba;--bd:rgba(255,255,255,.1);--fld:rgba(255,255,255,.07);--hd:#0b1b33;--hdtx:#fff;--hdbt:rgba(255,255,255,.1);--chip:rgba(255,255,255,.07);--sh:none;--gd-bg:rgba(16,185,129,.09);--gd-bd:rgba(16,185,129,.28)}',
      '#courier-app[data-theme=light]{--bg:#eef2f7;--card:#fff;--tx:#0f172a;--mu:#64748b;--bd:#e2e8f0;--fld:#f1f5f9;--hd:#fff;--hdtx:#0f172a;--hdbt:#eef2f7;--chip:#eef2f7;--sh:0 1px 3px rgba(15,23,42,.08);--gd-bg:#ecfdf5;--gd-bd:#a7f3d0}',
      '#courier-app{position:fixed;inset:0;z-index:99980;display:flex;flex-direction:column;background:var(--bg);color:var(--tx);font-family:inherit}',
      '#courier-app *{box-sizing:border-box}',
      '.cp-head{flex:0 0 auto;background:var(--hd);color:var(--hdtx);border-bottom:1px solid var(--bd);padding:8px 12px;display:flex;align-items:center;gap:8px;box-shadow:var(--sh)}',
      '.cp-who{flex:1;min-width:0}.cp-who small{display:block;color:#10b981;font-size:10px;font-weight:800}.cp-who b{display:block;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.cp-clock{text-align:center;line-height:1.2;padding:0 6px}.cp-clock b{display:block;font-size:17px;font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap;direction:ltr}.cp-clock small{display:block;font-size:10px;color:var(--mu);white-space:nowrap}',
      '.cp-btn{border:0;border-radius:12px;padding:10px 14px;font:inherit;font-size:13px;font-weight:700;cursor:pointer;color:var(--tx);background:var(--chip)}',
      '.cp-btn:disabled{opacity:.5;cursor:default}.cp-sm{padding:7px 10px;font-size:11px;border-radius:10px}',
      '.cp-hbtn{border:0;border-radius:10px;padding:8px 10px;font:inherit;font-size:11px;font-weight:700;cursor:pointer;color:var(--hdtx);background:var(--hdbt);white-space:nowrap}',
      '.cp-off{display:none;flex:0 0 auto;background:#b45309;color:#fff;text-align:center;font-size:12px;font-weight:700;padding:5px}.cp-off.on{display:block}',
      '.cp-body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:12px 12px 24px;max-width:760px;width:100%;margin:0 auto}',
      '.cp-nav{flex:0 0 auto;display:flex;background:var(--hd);border-top:1px solid var(--bd);padding-bottom:env(safe-area-inset-bottom)}',
      '.cp-nav button{flex:1;border:0;background:transparent;color:var(--mu);font:inherit;font-size:11px;font-weight:700;padding:9px 2px 8px;cursor:pointer;position:relative}',
      '.cp-nav button i{display:block;font-size:17px;margin-bottom:3px}.cp-nav button.on{color:#10b981}',
      '.cp-bdg{position:absolute;top:4px;inset-inline-start:calc(50% + 6px);min-width:17px;height:17px;border-radius:9px;background:#f43f5e;color:#fff;font-size:10px;line-height:17px;padding:0 4px;font-style:normal}',
      /* بطاقة التعريف والإرشاد لكل شاشة */
      '.cp-guide{background:var(--gd-bg);border:1px solid var(--gd-bd);border-radius:16px;padding:12px;margin-bottom:12px}',
      '.cp-guide-hd{display:flex;align-items:flex-start;gap:10px}',
      '.cp-guide-ic{flex:0 0 auto;width:34px;height:34px;border-radius:10px;background:#10b981;color:#04110c;display:flex;align-items:center;justify-content:center;font-size:16px}',
      '.cp-guide-tt{flex:1;min-width:0}.cp-guide-tt b{display:block;font-size:13px;font-weight:800;margin-bottom:2px}.cp-guide-tt p{margin:0;font-size:11.5px;color:var(--mu);line-height:1.55}',
      '.cp-guide-x{flex:0 0 auto;border:0;background:var(--chip);color:var(--mu);border-radius:8px;padding:4px 8px;font:inherit;font-size:10.5px;font-weight:700;cursor:pointer}',
      '.cp-guide-ul{margin:8px 0 0;padding:8px 18px 0 0;border-top:1px dashed var(--gd-bd);font-size:11.5px;line-height:1.65;color:var(--tx)}',
      '.cp-guide-ul li{margin-bottom:2px}',
      '.cp-whobtn{display:flex;align-items:center;gap:8px;background:none;border:0;color:inherit;font:inherit;text-align:start;cursor:pointer;padding:0}.cp-wt{min-width:0;display:block}.cp-wt small{display:block;color:#10b981;font-size:10px;font-weight:800}.cp-wt b{display:block;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.cp-pav{border-radius:50%;object-fit:cover;background:var(--chip);color:var(--tx);display:inline-flex;align-items:center;justify-content:center;font-weight:800;flex:0 0 auto}',
      '#courier-app .cp-fld{display:block;width:100%;border:1.5px solid var(--mu);background:var(--card);color:var(--tx);-webkit-text-fill-color:var(--tx);opacity:1;border-radius:12px;padding:10px 12px;font:inherit;font-size:14px;outline:none}#courier-app .cp-fld:focus{border-color:#10b981}#courier-app .cp-fld::placeholder{color:var(--mu);-webkit-text-fill-color:var(--mu);opacity:.8}',
      '.cp-whobtn{flex:1 1 0;min-width:0}@media(max-width:480px){.cp-head>img{display:none}}',
      '.cp-lbl{display:block;font-size:12px;font-weight:700;color:var(--mu);margin:10px 0 4px}',
      '.cp-guide-mini{margin-bottom:10px;text-align:start}',
      '.cp-guide-mini button{width:100%;border:1px dashed var(--gd-bd);background:var(--gd-bg);color:#10b981;border-radius:12px;padding:7px 12px;font:inherit;font-size:11.5px;font-weight:800;cursor:pointer;text-align:start;display:flex;align-items:center;gap:6px}',
      /* الفلاتر والكروت */
      '.cp-seg{display:flex;gap:4px;background:var(--chip);border-radius:12px;padding:3px;margin-bottom:12px}',
      '.cp-seg button{flex:1;border:0;border-radius:9px;padding:8px 4px;font:inherit;font-size:12px;font-weight:800;background:transparent;color:var(--mu);cursor:pointer}',
      '.cp-seg button.on{background:#10b981;color:#04110c}',
      '.cp-hero{background:linear-gradient(135deg,#047857,#10b981);color:#04110c;border-radius:18px;padding:16px;margin-bottom:12px}',
      '.cp-hero small{display:block;font-size:12px;font-weight:700;opacity:.85}.cp-hero b{display:block;font-size:30px;font-weight:900;margin:2px 0}',
      '.cp-hero .pend{display:flex;align-items:center;justify-content:space-between;gap:8px;background:rgba(255,255,255,.35);border-radius:12px;padding:8px 10px;margin-top:8px;font-size:12px;font-weight:800}',
      '.cp-hero .pend button{border:0;border-radius:9px;background:#04110c;color:#fff;font:inherit;font-size:11px;font-weight:800;padding:7px 10px;cursor:pointer}',
      '.cp-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}.cp-grid .wide{grid-column:1/-1}',
      '.cp-kpi{background:var(--card);border:1px solid var(--bd);border-radius:16px;padding:12px;box-shadow:var(--sh)}',
      '.cp-kpi small{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--mu);font-weight:700}.cp-kpi b{display:block;font-size:24px;font-weight:900;margin:4px 0 2px}',
      '.cp-kpi .m{font-size:12px;font-weight:800;color:#10b981}.cp-kpi .p{font-size:11px;font-weight:700;color:#f59e0b;margin-top:2px}.cp-kpi .s{font-size:10px;color:var(--mu);margin-top:3px}',
      '.cp-h{font-size:13px;font-weight:800;margin:14px 2px 8px;color:var(--mu);display:flex;align-items:center;justify-content:space-between}',
      '.cp-card{background:var(--card);border:1px solid var(--bd);border-radius:16px;padding:12px;margin-bottom:10px;box-shadow:var(--sh)}',
      '.cp-row{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}',
      '.cp-name{font-size:15px;font-weight:800;line-height:1.4}.cp-sub{font-size:11px;color:var(--mu);margin-top:2px}.cp-sub b{direction:ltr;unicode-bidi:embed;font-weight:700}',
      '.cp-tag{flex:0 0 auto;border-radius:999px;padding:3px 9px;font-size:11px;font-weight:800;white-space:nowrap}',
      '.k-pk{background:rgba(37,99,235,.15);color:#3b82f6}.k-dl{background:rgba(16,185,129,.16);color:#10b981}.k-fe{background:rgba(245,158,11,.18);color:#d97706}',
      '.ok{background:rgba(16,185,129,.16);color:#10b981}.wt{background:rgba(245,158,11,.18);color:#d97706}.gy{background:var(--chip);color:var(--mu)}.rd{background:rgba(244,63,94,.15);color:#f43f5e}',
      '.cp-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.cp-chip{background:var(--chip);border-radius:8px;padding:3px 9px;font-size:11px}',
      '.cp-info{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}',
      '.cp-a{display:inline-flex;align-items:center;gap:6px;border:0;border-radius:10px;padding:8px 11px;font:inherit;font-size:12px;font-weight:700;text-decoration:none;color:var(--tx);background:var(--chip);cursor:pointer}',
      '.cp-a.wa{background:rgba(37,211,102,.16);color:#16a34a}.cp-a.tel{direction:ltr}',
      '.cp-emp{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:1px dashed var(--bd);font-size:12px;color:var(--mu)}.cp-emp b{color:var(--tx)}',
      '.cp-day{display:flex;align-items:center;gap:8px;margin-bottom:10px}.cp-day .t{flex:1;text-align:center;font-size:14px;font-weight:800}',
      '.cp-day button{border:0;height:38px;padding:0 12px;border-radius:12px;background:var(--chip);color:var(--tx);font:inherit;font-size:12px;font-weight:700;cursor:pointer}.cp-day button:disabled{opacity:.35}',
      '.cp-tabs{display:flex;gap:6px;overflow-x:auto;margin-bottom:8px;padding-bottom:2px}',
      '.cp-tab{flex:0 0 auto;border:1px solid var(--bd);background:transparent;color:var(--mu);border-radius:999px;padding:6px 12px;font:inherit;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap}',
      '.cp-tab.on{background:#10b981;border-color:#10b981;color:#04110c}.cp-tab i{font-style:normal;opacity:.75;margin-inline-start:5px}',
      '.cp-search-bar{display:flex;gap:6px;margin-bottom:10px;align-items:center}',
      '.cp-search-bar input{flex:1;border-radius:12px;border:1px solid var(--bd);background:var(--card);color:var(--tx);padding:9px 12px;font:inherit;font-size:12.5px;outline:none}',
      '.cp-search-bar input:focus{border-color:#10b981}',
      '.cp-empty{text-align:center;color:var(--mu);font-size:13px;padding:30px 12px}',
      '.cp-rev{display:flex;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px solid var(--bd);font-size:13px}.cp-rev:last-of-type{border-bottom:0}.cp-rev span{color:var(--mu);font-size:11px}',
      '.cp-big{width:100%;border:0;border-radius:14px;padding:13px;font:inherit;font-size:14px;font-weight:800;cursor:pointer;background:#10b981;color:#04110c;margin-top:10px}.cp-big:disabled{opacity:.5}',
      '.cp-done{margin-top:10px;text-align:center;border-radius:12px;padding:10px;font-size:13px;font-weight:800;background:rgba(16,185,129,.14);color:#10b981}',
      '.cp-old{background:rgba(245,158,11,.14);border:1px solid rgba(245,158,11,.4);border-radius:14px;padding:10px;margin-bottom:10px;font-size:12px;font-weight:700;color:#d97706}.cp-old button{margin:6px 4px 0 0}',
      /* لوحة الترتيب Leaderboard */
      '.cp-podium{display:grid;grid-template-columns:1fr 1.08fr 1fr;gap:8px;align-items:end;margin-bottom:14px;padding-top:8px}',
      '.cp-pod{background:var(--card);border:1px solid var(--bd);border-radius:16px;padding:12px 8px;text-align:center;position:relative;box-shadow:var(--sh)}',
      '.cp-pod.r1{border-color:#f59e0b;background:linear-gradient(180deg,rgba(245,158,11,.16),var(--card));padding:16px 8px}',
      '.cp-pod.r2{border-color:#94a3b8;background:linear-gradient(180deg,rgba(148,163,184,.12),var(--card))}',
      '.cp-pod.r3{border-color:#d97706;background:linear-gradient(180deg,rgba(217,119,6,.12),var(--card))}',
      '.cp-pod.me{box-shadow:0 0 0 2px #10b981}',
      '.cp-pod-medal{font-size:24px;line-height:1;margin-bottom:4px;display:block}',
      '.cp-pod-nm{font-size:13px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:4px}',
      '.cp-pod-tot{font-size:20px;font-weight:900;color:#10b981;line-height:1.1}',
      '.cp-pod-tot small{font-size:10px;font-weight:700;color:var(--mu);display:block}',
      '.cp-pod-sub{display:flex;justify-content:center;gap:6px;margin-top:6px;font-size:10.5px;color:var(--mu);flex-wrap:wrap}',
      '.cp-lb-row{display:flex;align-items:center;gap:10px;background:var(--card);border:1px solid var(--bd);border-radius:14px;padding:11px 12px;margin-bottom:8px;box-shadow:var(--sh)}',
      '.cp-lb-row.me{border-color:#10b981;background:var(--gd-bg)}',
      '.cp-lb-rk{flex:0 0 auto;width:32px;height:32px;border-radius:10px;background:var(--chip);color:var(--tx);font-weight:900;font-size:14px;display:flex;align-items:center;justify-content:center}',
      '.cp-lb-rk.r1{background:#fef3c7;color:#b45309}.cp-lb-rk.r2{background:#e2e8f0;color:#334155}.cp-lb-rk.r3{background:#ffedd5;color:#c2410c}',
      '.cp-lb-info{flex:1;min-width:0}',
      '.cp-lb-info b{display:flex;align-items:center;gap:6px;font-size:14px;font-weight:800}',
      '.cp-lb-stats{display:flex;flex-wrap:wrap;gap:8px;margin-top:4px;font-size:11.5px;color:var(--mu)}',
      '.cp-lb-stats span{display:inline-flex;align-items:center;gap:4px}',
      '.cp-lb-tot{text-align:end;flex:0 0 auto}',
      '.cp-lb-tot b{display:block;font-size:18px;font-weight:900;color:#10b981;line-height:1.1}',
      '.cp-lb-tot small{font-size:10px;color:var(--mu)}',
      '.cp-motiv{background:linear-gradient(135deg,rgba(16,185,129,.18),rgba(59,130,246,.14));border:1px solid var(--gd-bd);border-radius:14px;padding:11px 14px;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12.5px;font-weight:700}',
      /* الشات والمودال */
      '.cp-ct{display:flex;align-items:center;gap:10px;cursor:pointer}.cp-av{flex:0 0 auto;width:44px;height:44px;border-radius:50%;background:#10b981;color:#04110c;font-weight:900;font-size:17px;display:flex;align-items:center;justify-content:center;position:relative}',
      '.cp-av i{position:absolute;bottom:0;inset-inline-end:0;width:12px;height:12px;border-radius:50%;border:2px solid var(--card);background:#94a3b8}.cp-av i.on{background:#22c55e}',
      '.cp-ct .m{flex:1;min-width:0}.cp-ct .m b{display:block;font-size:14px}.cp-ct .m small{display:block;font-size:11px;color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.cp-ub{min-width:20px;height:20px;border-radius:10px;background:#f43f5e;color:#fff;font-size:11px;font-weight:800;line-height:20px;text-align:center;padding:0 6px}',
      '.cp-chat{display:flex;flex-direction:column;height:calc(100vh - 150px);min-height:300px}',
      '.cp-chead{display:flex;align-items:center;gap:8px;margin-bottom:8px}.cp-chead b{flex:1;font-size:15px}',
      '.cp-msgs{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:6px;padding:4px 2px}',
      '.cp-m{max-width:82%;border-radius:14px;padding:8px 11px;font-size:14px;line-height:1.6;white-space:pre-wrap;word-break:break-word;background:var(--card);border:1px solid var(--bd)}',
      '.cp-m.me{align-self:flex-start;background:#10b981;border-color:#10b981;color:#04110c}.cp-m.th{align-self:flex-end}',
      '.cp-m small{display:block;font-size:10px;opacity:.7;margin-top:2px}.cp-m .tx{display:inline-block;font-size:10px;font-weight:800;background:rgba(0,0,0,.12);border-radius:6px;padding:1px 6px;margin-bottom:3px}',
      '.cp-comp{display:flex;gap:6px;align-items:flex-end;margin-top:8px}.cp-comp textarea{flex:1;max-height:110px}',
      '.cp-field{width:100%;border-radius:10px;border:1px solid var(--bd);background:var(--fld);color:var(--tx);padding:10px 12px;font:inherit;font-size:14px;outline:none;resize:none}.cp-field:focus{border-color:#10b981}',
      '.cp-modal{position:fixed;inset:0;z-index:99990;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;padding:16px}',
      '.cp-box{width:100%;max-width:460px;max-height:90vh;overflow-y:auto;background:var(--card);color:var(--tx);border:1px solid var(--bd);border-radius:18px;padding:16px}',
      '.cp-box h3{margin:0 0 6px;font-size:16px}.cp-box p{margin:0 0 10px;font-size:12px;color:var(--mu);line-height:1.7}',
      '.cp-btns{display:flex;gap:8px;margin-top:10px}.cp-btns .cp-btn{flex:1;padding:12px}.cp-go{background:#10b981;color:#04110c}',
      '.cp-kinds{display:flex;flex-direction:column;gap:6px;margin-bottom:10px}.cp-kinds button{border:1px solid var(--bd);background:transparent;color:var(--tx);border-radius:12px;padding:10px;font:inherit;font-size:13px;font-weight:700;text-align:start;cursor:pointer}.cp-kinds button.on{border-color:#10b981;background:rgba(16,185,129,.12)}',
      '.cp-qnotes{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px}',
      '.cp-qnotes button{border:1px solid var(--bd);background:var(--chip);color:var(--tx);border-radius:8px;padding:5px 9px;font:inherit;font-size:11px;font-weight:700;cursor:pointer}',
      '.cp-qnotes button:hover{border-color:#10b981;color:#10b981}',
      '.cp-old-n{font-size:11px;color:var(--mu);border-top:1px dashed var(--bd);padding-top:6px;margin-top:6px}',
      '.cp-toast{position:fixed;left:50%;bottom:78px;transform:translateX(-50%);z-index:99999;background:#10b981;color:#04110c;font-weight:800;font-size:13px;padding:11px 18px;border-radius:12px;max-width:92vw}.cp-toast.err{background:#f43f5e;color:#fff}',
      '.cp-mgr-row{display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid var(--bd);flex-wrap:wrap}.cp-mgr-row .nm{flex:1 1 130px;font-weight:800;font-size:13.5px}.cp-mgr-row .em{font-size:11.5px;color:#10b981;direction:ltr;font-weight:700}',
      '.cp-mgr-row .st{flex:1 1 100%;font-size:11px;color:var(--mu);margin-top:2px}.cp-mgr-row input{flex:1 1 180px;margin:0;padding:8px 10px;font-size:12px;direction:ltr}.cp-mgr-row .cp-btn{padding:8px 12px;font-size:12px}',
      '#cp-mgr{--card:#10223d;--tx:#e8eef8;--mu:#9fb0c8;--bd:rgba(255,255,255,.12);--fld:rgba(255,255,255,.07);--chip:rgba(255,255,255,.1);--gd-bg:rgba(16,185,129,.12);--gd-bd:rgba(16,185,129,.3)}'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ---------- مساعدات ---------- */
  function toast(msg, bad) {
    const t = document.createElement('div'); t.className = 'cp-toast' + (bad ? ' err' : ''); t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), 3200);
  }
  function errMsg(e) {
    const m = String((e && e.message) || e || '');
    if (/not your transaction/.test(m)) return 'المعاملة دي مش على اسمك';
    if (/body required/.test(m)) return 'اكتب الملاحظة الأول';
    if (/bad day/.test(m)) return 'مينفعش تأكد يوم لسه ماجاش';
    if (/not linked|courier only/.test(m)) return 'حسابك مش مربوط بمندوب. كلّم المدير';
    if (/Failed to fetch|network|NetworkError|load failed/i.test(m)) return 'مفيش اتصال بالإنترنت، جرّب تاني';
    return 'حصل خطأ: ' + m;
  }
  const waNum = p => { let d = String(p || '').replace(/\D/g, ''); if (d.startsWith('00')) d = d.slice(2); else if (d.startsWith('0')) d = '20' + d.slice(1); return d; };
  const mapsUrl = a => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(a);
  const telHref = p => 'tel:' + String(p || '').replace(/[^\d+]/g, '');
  const callBtns = (phone, label) => {
    if (!phone) return '';
    const lb = label === undefined ? phone : label;
    return '<a class="cp-a tel" href="' + eh(telHref(phone)) + '"><i class="fa-solid fa-phone"></i>' + (lb ? ' ' + eh(lb) : '') + '</a>' +
      '<a class="cp-a wa" target="_blank" rel="noopener" href="https://wa.me/' + eh(waNum(phone)) + '"><i class="fa-brands fa-whatsapp"></i>' + (label === '' ? '' : ' واتساب') + '</a>';
  };

  function txState(o) {
    const n = Number(o.lines) || 0;
    if (n && Number(o.n_delivered) === n) return ['تم التسليم', 'gy'];
    if (Number(o.n_review) > 0) return ['تحت المراجعة', 'wt'];
    if (n && Number(o.n_complete) === n) return ['جاهزة للتسليم', 'ok'];
    return ['جاري التنفيذ', 'k-pk'];
  }
  const KIND = {
    pickup: { label: 'استلام', icon: 'fa-box-archive', cls: 'k-pk', sec: 'الاستلام', btn: 'تم تأكيد الاستلام' },
    delivery: { label: 'تسليم', icon: 'fa-truck-fast', cls: 'k-dl', sec: 'التسليم', btn: 'تم تأكيد التسليم' },
    fee: { label: 'رسوم توصيل', icon: 'fa-motorcycle', cls: 'k-fe', sec: 'رسوم التوصيل', btn: 'تم تأكيد رسوم التوصيل' }
  };
  const kindLabel = it => it.type === 'fee' ? (it.fee_kind === 'round' ? 'رسوم توصيل · ذهاب وعودة' : 'رسوم توصيل · ذهاب فقط') : KIND[it.type].label;

  /* ---------- إحصائيات (من الداتا اللي جت من السيرفر) ---------- */
  function stats(range) {
    const r = { pickup: {}, delivery: {}, fee: {} }, f = range[0], t = range[1];
    Object.keys(r).forEach(k => r[k] = { n: 0, cn: 0, amt: 0, camt: 0, pn: 0, pamt: 0 });
    let one = 0, round = 0;
    st.items.forEach(it => {
      if (it.day < f || it.day > t) return;
      const s = r[it.type], a = Number(it.amount) || 0; s.n++; s.amt += a;
      if (it.confirmed) { s.cn++; s.camt += a; } else { s.pn++; s.pamt += a; }
      if (it.type === 'fee') { if (it.fee_kind === 'round') round++; else one++; }
    });
    r.one = one; r.round = round;
    r.total = r.pickup.camt + r.delivery.camt + r.fee.camt; r.pend = r.pickup.pamt + r.delivery.pamt + r.fee.pamt;
    r.pendN = r.pickup.pn + r.delivery.pn + r.fee.pn;
    return r;
  }

  /* ---------- الهيكل ---------- */
  function overlay(inner) {
    addCss();
    document.body.classList.add('is-partner-mode', 'is-courier-mode');
    ['app', 'login'].forEach(id => { const e = $(id); if (e) e.classList.add('hidden'); });
    let o = $('courier-app');
    if (!o) {
      o = document.createElement('div'); o.id = 'courier-app'; o.setAttribute('dir', 'rtl');
      o.addEventListener('click', onClick); o.addEventListener('keydown', onKey); o.addEventListener('input', onInput);
      o.addEventListener('change', e => { if (e.target && e.target.id === 'cp-pfile') pickPhoto(e.target.files && e.target.files[0]); });
      document.body.appendChild(o);
    }
    o.classList.remove('hidden'); o.setAttribute('data-theme', st.theme); o.innerHTML = inner; return o;
  }
  const logoutBtn = '<button type="button" class="cp-hbtn" data-act="logout"><i class="fa-solid fa-right-from-bracket"></i> خروج</button>';

  const avatar = (photo, name, size) => photo
    ? '<img class="cp-pav" style="width:' + size + 'px;height:' + size + 'px" src="' + eh(photo) + '" alt="">'
    : '<span class="cp-pav" style="width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size / 2.2) + 'px">' + eh(String(name || '؟').trim().charAt(0)) + '</span>';
  const whoInner = () => avatar(st.me && st.me.photo, st.me && st.me.name, 36) + '<span class="cp-wt"><small>ملفي ←</small><b>' + eh(st.me && st.me.name) + '</b></span>';

  function shell() {
    overlay(
      '<header class="cp-head"><img src="logo-transparent.png" alt="" style="height:30px" onerror="this.style.display=\'none\'">' +
        '<button type="button" class="cp-who cp-whobtn" id="cp-whobtn" data-act="profile">' + whoInner() + '</button>' +
        '<div class="cp-clock"><b id="cp-time"></b><small id="cp-date"></small></div>' +
        '<button type="button" class="cp-hbtn" id="cp-theme" data-act="theme"></button>' + logoutBtn + '</header>' +
      '<div class="cp-off" id="cp-off">مفيش اتصال بالإنترنت… بحاول تاني</div>' +
      '<main class="cp-body" id="cp-body"></main>' +
      '<nav class="cp-nav" id="cp-nav"></nav><div id="cp-modal-root"></div>');
    applyTheme(); tickClock(); renderNav(); renderTab();
  }
  function tickClock() {
    const t = $('cp-time'), d = $('cp-date'); if (!t) return;
    const now = new Date();
    const a = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: TZ });
    const b = now.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });
    if (t.textContent !== a) t.textContent = a; if (d && d.textContent !== b) d.textContent = b;
  }
  const unreadTotal = () => st.contacts.reduce((a, c) => a + (Number(c.unread) || 0), 0);
  function renderNav() {
    const n = $('cp-nav'); if (!n) return;
    const u = unreadTotal(), pend = st.items.filter(i => !i.confirmed).length;
    const T = [
      ['home', 'fa-chart-pie', 'حسابي', 0],
      ['trips', 'fa-motorcycle', 'مشاويري', 0],
      ['rank', 'fa-trophy', 'الترتيب', 0],
      ['review', 'fa-clipboard-check', 'المراجعة', pend],
      ['chat', 'fa-comments', 'التواصل', u]
    ];
    const html = T.map(t => '<button type="button" data-tab="' + t[0] + '" class="' + (st.tab === t[0] ? 'on' : '') + '"><i class="fa-solid ' + t[1] + '"></i>' + t[2] + (t[3] ? '<em class="cp-bdg">' + num(t[3]) + '</em>' : '') + '</button>').join('');
    if (n.dataset.h !== html) { n.dataset.h = html; n.innerHTML = html; }
  }
  function setTab(t) {
    if (t === 'review' && st.tab === 'review') st.rvOpen = false;
    st.tab = t;
    if (t !== 'chat') st.chat = null;
    if (t === 'rank') loadLeaderboard(true);
    renderNav(); renderTab(true);
  }
  function renderTab(top) {
    const b = $('cp-body'); if (!b) return;
    /* حفظ موضع الكتابة لو المندوب بيبحث في المشاوير */
    const activeId = document.activeElement && document.activeElement.id;
    const selStart = activeId === 'cp-trip-q' ? document.activeElement.selectionStart : null;
    const y = b.scrollTop;

    if (st.tab === 'home') b.innerHTML = viewHome();
    else if (st.tab === 'trips') b.innerHTML = viewTrips();
    else if (st.tab === 'rank') b.innerHTML = viewLeaderboard();
    else if (st.tab === 'review') b.innerHTML = viewReview();
    else if (st.tab === 'profile') b.innerHTML = viewProfile();
    else viewChat();

    b.scrollTop = top ? 0 : y;
    if (activeId === 'cp-trip-q' && $('cp-trip-q')) {
      const inp = $('cp-trip-q'); inp.focus();
      if (selStart != null) { try { inp.setSelectionRange(selStart, selStart); } catch (e) { /* */ } }
    }
  }

  /* ---------- 1) حسابي ---------- */
  function viewHome() {
    const rng = rangeOf(st.period, st.month), s = stats(rng);
    const seg = '<div class="cp-seg">' + [['today', 'اليوم'], ['week', 'الأسبوع'], ['month', 'الشهر']].map(p => '<button type="button" data-per="' + p[0] + '" class="' + (st.period === p[0] ? 'on' : '') + '">' + p[1] + '</button>').join('') + '</div>';
    const hero = '<div class="cp-hero"><small>عمولتك المؤكدة (' + (st.period === 'today' ? 'اليوم' : st.period === 'week' ? 'هذا الأسبوع' : monthLabel(st.month)) + ')</small><b>' + money(s.total) + '</b>' +
      (s.pendN ? '<div class="pend"><span>+ ' + money(s.pend) + ' في انتظار تأكيدك (' + num(s.pendN) + ' مشوار)</span><button type="button" data-tab="review">راجع وأكّد</button></div>' : '<small>كل مشاويرك في الفترة دي متأكدة ✓</small>') + '</div>';

    /* كارت مختصر لترتيب المندوب الحالي */
    const myRankRow = st.leaderboard.find(r => r.is_me);
    const rankTeaser = myRankRow
      ? '<div class="cp-motiv"><div><i class="fa-solid fa-trophy" style="color:#f59e0b;margin-inline-end:6px"></i>ترتيبك الحالي في الاستلامات والتسليم: <b>المركز #' + num(myRankRow.rank) + '</b> (' + num(myRankRow.total_trips) + ' مشوار)</div><button type="button" class="cp-btn cp-sm" style="background:#10b981;color:#04110c" data-tab="rank">لوحة الترتيب</button></div>'
      : '<div class="cp-motiv"><div><i class="fa-solid fa-trophy" style="color:#f59e0b;margin-inline-end:6px"></i>شوف ترتيبك وسط زمايلك في الاستلامات والتسليم!</div><button type="button" class="cp-btn cp-sm" style="background:#10b981;color:#04110c" data-tab="rank">فتح الترتيب</button></div>';

    const kpi = (k, icon, title, extra) => { const x = s[k]; return '<div class="cp-kpi"><small><i class="fa-solid ' + icon + '"></i>' + title + '</small><b>' + num(x.n) + '</b><div class="m">' + money(x.camt) + ' مؤكدة</div>' + (x.pamt ? '<div class="p">+ ' + money(x.pamt) + ' في الانتظار</div>' : '') + (extra ? '<div class="s">' + extra + '</div>' : '') + '</div>'; };
    const grid = '<div class="cp-grid">' + kpi('pickup', 'fa-box-archive', 'استلمت', 'عمولة الاستلام') + kpi('delivery', 'fa-truck-fast', 'سلّمت', 'عمولة التسليم') +
      '<div class="cp-kpi wide"><small><i class="fa-solid fa-motorcycle"></i>مشاوير رسوم التوصيل</small><b>' + num(s.fee.n) + ' <span style="font-size:13px;font-weight:700;color:var(--mu)">مشوار</span></b><div class="m">' + money(s.fee.camt) + ' مؤكدة</div>' +
      (s.fee.pamt ? '<div class="p">+ ' + money(s.fee.pamt) + ' في الانتظار</div>' : '') + '<div class="s">ذهاب فقط: ' + num(s.one) + ' · ذهاب وعودة: ' + num(s.round) + '</div></div></div>';
    const recent = st.items.slice(0, 6).map(it => '<div class="cp-card" style="padding:10px"><div class="cp-row"><div><div class="cp-name" style="font-size:14px">' + eh(it.client_name || 'بدون اسم') + '</div><div class="cp-sub">' + eh(kindLabel(it)) + ' · ' + eh(dayLabel(it.day)) + '</div></div><div style="text-align:end"><b>' + money(it.amount) + '</b><div><span class="cp-tag ' + (it.confirmed ? 'ok' : 'wt') + '">' + (it.confirmed ? 'مؤكد' : 'مش متأكد') + '</span></div></div></div></div>').join('');
    const load = !st.loaded ? '<div class="cp-empty">جاري التحميل…</div>' : '';
    const lower = st.period === 'today'
      ? '<div class="cp-h"><span>آخر مشاويرك</span><button type="button" class="cp-a cp-sm" data-tab="trips">كل المشاوير ←</button></div>' + (recent || load || '<div class="cp-empty">لسه مفيش مشاوير متسجلة باسمك</div>')
      : '<div class="cp-h"><span>أيام ' + (st.period === 'week' ? 'الأسبوع' : 'الشهر') + ' وحالة كل يوم</span></div>' + (dayRows(rng).map(dayRowHtml).join('') || load || '<div class="cp-empty">مفيش مشاوير في الفترة دي</div>');
    return renderGuideBanner('home') + seg + (st.period === 'month' ? monthNav() : '') + hero + rankTeaser + grid + lower;
  }

  /* ---------- شهور وأيام (مشترك بين حسابي / مشاويري / المراجعة) ---------- */
  function monthNav() {
    const cur = monthOf(today());
    return '<div class="cp-day"><button type="button" data-act="mprev"' + (st.month <= minMonth() ? ' disabled' : '') + '>الشهر السابق</button><div class="t">' + eh(monthLabel(st.month)) + (st.month === cur ? ' · الحالي' : '') + '</div>' +
      '<button type="button" data-act="mnext"' + (st.month >= cur ? ' disabled' : '') + '>الشهر التالي</button></div>';
  }
  function dayRows(range) {
    const m = {};
    st.items.forEach(it => {
      if (it.day < range[0] || it.day > range[1]) return;
      const d = m[it.day] || (m[it.day] = { day: it.day, n: 0, pn: 0, amt: 0, pickup: 0, delivery: 0, fee: 0 });
      d.n++; d[it.type]++; d.amt += Number(it.amount) || 0; if (!it.confirmed) d.pn++;
    });
    return Object.keys(m).sort().reverse().map(k => m[k]);
  }
  const dayKinds = d => [d.pickup ? num(d.pickup) + ' استلام' : '', d.delivery ? num(d.delivery) + ' تسليم' : '', d.fee ? num(d.fee) + ' رسوم توصيل' : ''].filter(Boolean).join(' · ');
  function dayRowHtml(d) {
    return '<div class="cp-card"><div class="cp-row"><div><div class="cp-name" style="font-size:14px">' + eh(dayLabel(d.day)) + '</div><div class="cp-sub">' + eh(dayKinds(d)) + '</div></div>' +
      '<div style="text-align:end"><b>' + money(d.amt) + '</b><div style="margin-top:3px"><span class="cp-tag ' + (d.pn ? 'wt' : 'ok') + '">' + (d.pn ? num(d.pn) + ' مش متأكد' : '✓ كله متأكد') + '</span></div></div></div>' +
      '<div class="cp-info"><button type="button" class="cp-a" data-act="rvday" data-day="' + d.day + '">' + (d.pn ? 'راجع وأكّد اليوم ده' : 'شوف تفاصيل اليوم') + '</button></div></div>';
  }

  /* ---------- 2) مشاويري ---------- */
  function dayNav() {
    const t = today();
    return '<div class="cp-day"><button type="button" data-act="dprev">اليوم السابق</button><div class="t">' + eh(dayLabel(st.day)) + (st.day === t ? ' · النهارده' : '') + '</div>' +
      '<button type="button" data-act="dnext"' + (st.day >= t ? ' disabled' : '') + '>اليوم التالي</button></div>';
  }
  const itemsOf = d => st.items.filter(it => it.day === d);
  function viewTrips() {
    const inMonth = st.tripScope === 'month', mr = rangeOf('month', st.month);
    const all = inMonth ? st.items.filter(i => i.day >= mr[0] && i.day <= mr[1]) : itemsOf(st.day), n = k => all.filter(i => k === 'all' || i.type === k).length;
    const tabs = '<div class="cp-tabs">' + [['all', 'الكل'], ['pickup', 'استلام'], ['delivery', 'تسليم'], ['fee', 'رسوم توصيل']].map(t => '<button type="button" class="cp-tab' + (st.type === t[0] ? ' on' : '') + '" data-type="' + t[0] + '">' + t[1] + '<i>' + num(n(t[0])) + '</i></button>').join('') + '</div>';
    const stTabs = '<div class="cp-tabs">' + [
      ['all', 'كل الحالات (' + num(all.length) + ')'],
      ['pending', '⏳ مش متأكد (' + num(all.filter(i => !i.confirmed).length) + ')'],
      ['confirmed', '✓ مؤكدة (' + num(all.filter(i => i.confirmed).length) + ')']
    ].map(s => '<button type="button" class="cp-tab' + (st.statusFilter === s[0] ? ' on' : '') + '" data-sfilter="' + s[0] + '">' + s[1] + '</button>').join('') + '</div>';

    const searchBar = '<div class="cp-search-bar">' +
      '<input id="cp-trip-q" type="search" value="' + eh(st.q) + '" placeholder="🔍 ابحث باسم العميل، رقم المعاملة، التليفون، العنوان…">' +
      (st.q ? '<button type="button" class="cp-btn cp-sm" data-act="qclear">مسح</button>' : '') +
    '</div>';

    const q = (st.q || '').trim().toLowerCase();
    const rows = all.filter(i => {
      if (st.type !== 'all' && i.type !== st.type) return false;
      if (st.statusFilter === 'pending' && i.confirmed) return false;
      if (st.statusFilter === 'confirmed' && !i.confirmed) return false;
      if (q) {
        const hay = [i.client_name, i.transaction_id, i.phone, i.address, i.services, i.employee].map(x => String(x || '').toLowerCase()).join(' ');
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const scope = '<div class="cp-seg">' + [['day', 'يوم يوم'], ['month', 'الشهر كله']].map(x => '<button type="button" data-tscope="' + x[0] + '" class="' + (st.tripScope === x[0] ? 'on' : '') + '">' + x[1] + '</button>').join('') + '</div>';
    let list = '';
    if (!rows.length) list = '<div class="cp-empty">' + (st.loaded ? 'مفيش مشاوير مطابقة' : 'جاري التحميل…') + '</div>';
    else if (inMonth) { let last = ''; rows.slice().sort((a, b) => a.day < b.day ? 1 : a.day > b.day ? -1 : 0).forEach(i => { if (i.day !== last) { last = i.day; list += '<div class="cp-h"><span>' + eh(dayLabel(i.day)) + '</span></div>'; } list += tripCard(i); }); }
    else list = rows.map(tripCard).join('');
    return renderGuideBanner('trips') + scope + (inMonth ? monthNav() : dayNav()) + searchBar + tabs + stTabs + list;
  }
  function tripCard(it) {
    const k = KIND[it.type], [sl, sc] = txState(it);
    const links = [];
    if (it.phone) links.push(callBtns(it.phone));
    if (it.address) links.push('<a class="cp-a" target="_blank" rel="noopener" href="' + eh(mapsUrl(it.address)) + '"><i class="fa-solid fa-location-dot"></i> ' + eh(it.address) + '</a>');
    const emp = it.employee ? '<div class="cp-emp"><span>الموظف المسؤول: <b>' + eh(it.employee) + '</b></span>' +
      (it.employee_phone ? '<a class="cp-a tel" href="' + eh(telHref(it.employee_phone)) + '"><i class="fa-solid fa-phone"></i> اتصال</a>' : '') +
      (it.employee_id ? '<button type="button" class="cp-a" data-act="chat-emp" data-uid="' + eh(it.employee_id) + '" data-tx="' + eh(it.transaction_id) + '"><i class="fa-solid fa-comment"></i> رسالة</button>' : '') + '</div>' : '';
    return '<div class="cp-card"><div class="cp-row"><div><div class="cp-name">' + eh(it.client_name || 'بدون اسم') + '</div><div class="cp-sub">رقم المعاملة: <b>' + eh(it.transaction_id) + '</b></div></div>' +
      '<div style="text-align:end"><b style="font-size:16px">' + money(it.amount) + '</b><div style="margin-top:3px"><span class="cp-tag ' + (it.confirmed ? 'ok' : 'wt') + '">' + (it.confirmed ? '✓ مؤكد ' + eh(timeOf(it.confirmed_at)) : 'بانتظار تأكيدك') + '</span></div></div></div>' +
      '<div class="cp-chips"><span class="cp-tag ' + k.cls + '"><i class="fa-solid ' + k.icon + '"></i> ' + eh(kindLabel(it)) + '</span><span class="cp-tag ' + sc + '">' + sl + '</span>' +
      (it.type !== 'fee' ? String(it.services || '').split('، ').filter(Boolean).slice(0, 4).map(x => '<span class="cp-chip">' + eh(x) + '</span>').join('') : '') + '</div>' +
      (links.length ? '<div class="cp-info">' + links.join('') + '</div>' : '') + emp +
      '<div class="cp-info"><button type="button" class="cp-a" data-act="note" data-tx="' + eh(it.transaction_id) + '"><i class="fa-solid fa-note-sticky"></i> ملاحظة للموظف / بلاغ سريع' + (Number(it.my_notes) ? ' (' + num(it.my_notes) + ')' : '') + '</button></div></div>';
  }

  /* ---------- 3) لوحة ترتيب المناديب (Leaderboard: الاستلامات والتسليم) ---------- */
  function renderLeaderboardInner(rows, isMgrView) {
    if (!rows || !rows.length) {
      return '<div class="cp-empty">' + (st.lbLoaded ? 'لا توجد بيانات ترتيب في هذه الفترة' : 'جاري تحميل لوحة الترتيب…') + '</div>';
    }
    const me = rows.find(r => r.is_me);
    let motivHtml = '';
    if (me) {
      if (Number(me.rank) === 1 && Number(me.total_trips) > 0) {
        motivHtml = '<div class="cp-motiv"><span>🥇 ما شاء الله يا <b>' + eh(me.name) + '</b>! أنت في <b>المركز الأول</b> بإجمالي <b>' + num(me.total_trips) + ' مشوار</b>. كمّل على القمة!</span></div>';
      } else {
        const above = rows.find(r => Number(r.rank) < Number(me.rank));
        const diff = above ? Math.max(1, Number(above.total_trips) - Number(me.total_trips) + 1) : 1;
        motivHtml = '<div class="cp-motiv"><span>💪 مركزك الحالي <b>#' + num(me.rank) + '</b> (' + num(me.total_trips) + ' مشوار) — شد حيلك، فاضلك <b>' + num(diff) + ' مشوار</b> وتتقدم للمركز اللي قبلك!</span></div>';
      }
    }

    /* منصة التتويج لأول 3 مراكز */
    const top1 = rows[0], top2 = rows[1], top3 = rows[2];
    const podCard = (r, cls, medal, lbl) => {
      if (!r) return '<div class="cp-pod" style="opacity:.4"><span class="cp-pod-medal">' + medal + '</span><div class="cp-pod-nm">—</div></div>';
      return '<div class="cp-pod ' + cls + (r.is_me ? ' me' : '') + '">' +
        '<span class="cp-pod-medal">' + medal + '</span>' +
        '<div class="cp-pod-nm">' + eh(r.name) + (r.is_me ? ' ⭐' : '') + '</div>' +
        '<div class="cp-pod-tot">' + num(r.total_trips) + '<small>إجمالي المشاوير</small></div>' +
        '<div class="cp-pod-sub">' +
          '<span title="استلام">📥 ' + num(r.pickups) + '</span>' +
          '<span title="تسليم">📤 ' + num(r.deliveries) + '</span>' +
          (Number(r.fee_trips) ? '<span title="رسوم توصيل">🛵 ' + num(r.fee_trips) + '</span>' : '') +
        '</div>' +
        '<div style="font-size:10px;color:var(--mu);margin-top:4px">' + lbl + '</div>' +
      '</div>';
    };
    const podium = rows.length >= 2
      ? '<div class="cp-podium">' + podCard(top2, 'r2', '🥈', 'المركز الثاني') + podCard(top1, 'r1', '🥇', 'المركز الأول') + podCard(top3, 'r3', '🥉', 'المركز الثالث') + '</div>'
      : '';

    /* القائمة التفصيلية لكل المناديب */
    const listHtml = rows.map(r => {
      const rk = Number(r.rank) || 1;
      const rkCls = rk === 1 ? 'r1' : rk === 2 ? 'r2' : rk === 3 ? 'r3' : '';
      const medal = rk === 1 ? '🥇' : rk === 2 ? '🥈' : rk === 3 ? '🥉' : '#' + num(rk);
      const showMoney = (isMgrView || r.is_me) && r.confirmed_amount != null;
      return '<div class="cp-lb-row' + (r.is_me ? ' me' : '') + '">' +
        '<div class="cp-lb-rk ' + rkCls + '">' + medal + '</div>' +
        '<div class="cp-lb-info">' +
          '<b>' + eh(r.name) + (r.is_me ? ' <span class="cp-tag ok">أنت</span>' : '') + '</b>' +
          '<div class="cp-lb-stats">' +
            '<span class="cp-tag k-pk"><i class="fa-solid fa-box-archive"></i> استلام: <b>' + num(r.pickups) + '</b></span>' +
            '<span class="cp-tag k-dl"><i class="fa-solid fa-truck-fast"></i> تسليم: <b>' + num(r.deliveries) + '</b></span>' +
            (Number(r.fee_trips) ? '<span class="cp-tag k-fe"><i class="fa-solid fa-motorcycle"></i> توصيل: <b>' + num(r.fee_trips) + '</b></span>' : '') +
            '<span>✓ مؤكد: <b>' + num(r.confirmed_trips) + '/' + num(r.total_trips) + '</b></span>' +
          '</div>' +
          (showMoney ? '<div style="font-size:11px;color:#10b981;font-weight:800;margin-top:4px">العمولة المؤكدة: ' + money(r.confirmed_amount) + (Number(r.pending_amount) ? ' <span style="color:#f59e0b">(+ ' + money(r.pending_amount) + ' منتظر)</span>' : '') + '</div>' : '') +
        '</div>' +
        '<div class="cp-lb-tot"><b>' + num(r.total_trips) + '</b><small>مشوار</small></div>' +
      '</div>';
    }).join('');

    return motivHtml + podium + '<div class="cp-h"><span>ترتيب الاستلامات والتسليم بالتفصيل</span><span>إجمالي المناديب: ' + num(rows.length) + '</span></div>' + listHtml;
  }

  function viewLeaderboard() {
    const seg = '<div class="cp-seg">' + [
      ['today', 'اليوم'],
      ['week', 'هذا الأسبوع'],
      ['month', 'هذا الشهر']
    ].map(p => '<button type="button" data-lbper="' + p[0] + '" class="' + (st.lbPeriod === p[0] ? 'on' : '') + '">' + p[1] + '</button>').join('') + '</div>';
    return renderGuideBanner('rank') + seg + renderLeaderboardInner(st.leaderboard, false);
  }

  /* ---------- 4) المراجعة (الشهر ← الأيام ← تأكيد اليوم) ---------- */
  function viewReview() { return st.rvOpen ? reviewDay() : reviewMonth(); }
  function reviewMonth() {
    const rng = rangeOf('month', st.month), rows = dayRows(rng);
    const n = rows.reduce((a, d) => a + d.n, 0), pn = rows.reduce((a, d) => a + d.pn, 0);
    const amt = rows.reduce((a, d) => a + d.amt, 0);
    const sum = '<div class="cp-card"><div class="cp-row"><b>' + eh(monthLabel(st.month)) + '</b><span class="cp-tag k-pk">' + num(n) + ' مشوار · ' + money(amt) + '</span></div>' +
      '<div class="cp-chips" style="margin-top:8px"><span class="cp-tag ok">✓ متأكد: ' + num(n - pn) + ' مشوار</span><span class="cp-tag ' + (pn ? 'wt' : 'ok') + '">' + (pn ? '⏳ مش متأكد: ' + num(pn) + ' مشوار' : 'مفيش حاجة مستنية تأكيدك') + '</span></div></div>';
    const fl = '<div class="cp-seg">' + [['all', 'كل الأيام'], ['pending', 'مش متأكد'], ['confirmed', 'متأكد']].map(x => '<button type="button" data-rvf="' + x[0] + '" class="' + (st.rvf === x[0] ? 'on' : '') + '">' + x[1] + '</button>').join('') + '</div>';
    const shown = rows.filter(d => st.rvf === 'all' || (st.rvf === 'pending' ? d.pn > 0 : d.pn === 0));
    return renderGuideBanner('review') + monthNav() + sum + fl + (shown.length ? shown.map(dayRowHtml).join('') : '<div class="cp-empty">' + (st.loaded ? 'مفيش أيام مطابقة في الشهر ده' : 'جاري التحميل…') + '</div>');
  }
  function reviewDay() {
    const all = itemsOf(st.day);
    const sec = k => {
      const rows = all.filter(i => i.type === k); if (!rows.length) return '';
      const pend = rows.filter(i => !i.confirmed), tot = rows.reduce((a, i) => a + Number(i.amount || 0), 0), ptot = pend.reduce((a, i) => a + Number(i.amount || 0), 0);
      const last = rows.filter(i => i.confirmed_at).map(i => i.confirmed_at).sort().pop();
      return '<div class="cp-card"><div class="cp-row"><b>' + KIND[k].sec + '</b><span class="cp-tag ' + KIND[k].cls + '">' + num(rows.length) + ' مشوار · ' + money(tot) + '</span></div><div style="margin-top:6px">' +
        rows.map(i => '<div class="cp-rev"><div>' + eh(i.client_name || 'بدون اسم') + '<br><span><b dir="ltr">' + eh(i.transaction_id) + '</b>' + (i.type === 'fee' ? ' · ' + (i.fee_kind === 'round' ? 'ذهاب وعودة' : 'ذهاب فقط') : '') + '</span></div>' +
          '<div style="text-align:end"><b>' + money(i.amount) + '</b><br><span>' + (i.confirmed ? '✓ مؤكد' : '○ مش متأكد') + ' <button type="button" class="cp-a cp-sm" data-act="note" data-tx="' + eh(i.transaction_id) + '"><i class="fa-solid fa-flag"></i> ملاحظة</button></span></div></div>').join('') + '</div>' +
        (pend.length ? '<button type="button" class="cp-big" data-act="ask" data-kind="' + k + '" data-n="' + pend.length + '" data-amt="' + ptot + '">' + KIND[k].btn + ' · ' + money(ptot) + '</button>'
          : '<div class="cp-done">✓ اتأكد بالكامل' + (last ? ' الساعة ' + eh(timeOf(last)) : '') + '</div>') + '</div>';
    };
    const body = ['pickup', 'delivery', 'fee'].map(sec).join('');
    return '<div class="cp-h"><span>مراجعة يوم واحد</span><button type="button" class="cp-a cp-sm" data-act="rvback">رجوع لأيام الشهر</button></div>' + dayNav() + (body || '<div class="cp-empty">' + (st.loaded ? 'مفيش مشاوير مسجلة في اليوم ده' : 'جاري التحميل…') + '</div>');
  }

  /* ---------- ملفي الشخصي ---------- */
  function syncDraft() { const t = $('cp-ptitle'), p = $('cp-pphone'); if (t) st.pT = t.value; if (p) st.pP = p.value; }
  function viewProfile() {
    const m = st.me || {}, ph = st.pPhoto === undefined ? m.photo : st.pPhoto;
    const title = st.pT !== undefined ? st.pT : (m.title || ''), phone = st.pP !== undefined ? st.pP : (m.phone || '');
    return '<div class="cp-h"><span>ملفي الشخصي</span><button type="button" class="cp-a cp-sm" data-act="pback">رجوع</button></div>' + renderGuideBanner('profile') +
      '<div class="cp-card" style="text-align:center">' + avatar(ph, m.name, 96) +
      '<div class="cp-info" style="justify-content:center;margin-top:10px"><label class="cp-a" for="cp-pfile">' + (ph ? 'غيّر الصورة' : 'اختار صورة') + '</label><input id="cp-pfile" type="file" accept="image/*" style="display:none">' +
      (ph ? '<button type="button" class="cp-a" data-act="pdel">شيل الصورة</button>' : '') + '</div>' +
      '<div class="cp-sub" style="margin-top:6px">' + (st.pPhoto !== undefined ? 'الصورة لسه ما اتحفظتش — اضغط «حفظ» تحت' : '') + '</div></div>' +
      '<div class="cp-card"><label class="cp-lbl">الاسم (بتحدده الإدارة)</label><div class="cp-name">' + eh(m.name) + '</div>' +
      '<label class="cp-lbl" for="cp-ptitle">المسمى الوظيفي</label><input id="cp-ptitle" class="cp-fld" maxlength="60" value="' + eh(title) + '" placeholder="مثال: مندوب تسليم">' +
      '<label class="cp-lbl" for="cp-pphone">رقم التليفون</label><input id="cp-pphone" class="cp-fld" type="tel" inputmode="tel" dir="ltr" maxlength="20" value="' + eh(phone) + '" placeholder="01xxxxxxxxx">' +
      '<button type="button" class="cp-big" data-act="psave" style="margin-top:14px">حفظ</button></div>';
  }
  function pickPhoto(file) {
    if (!file || !/^image\//.test(file.type)) return toast('اختار صورة من فضلك', true);
    const rd = new FileReader();
    rd.onload = () => {
      const img = new Image();
      img.onload = () => {
        const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
        const m = Math.min(img.width, img.height); c.getContext('2d').drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, S, S);
        syncDraft(); st.pPhoto = c.toDataURL('image/jpeg', 0.8); renderTab(false);
      };
      img.onerror = () => toast('الصورة دي مش مقروءة، جرّب غيرها', true);
      img.src = rd.result;
    };
    rd.readAsDataURL(file);
  }
  async function saveProfile(btn) {
    syncDraft();
    const m = st.me || {}, ar = '٠١٢٣٤٥٦٧٨٩';
    const title = String(st.pT !== undefined ? st.pT : (m.title || '')).trim();
    const phone = String(st.pP !== undefined ? st.pP : (m.phone || '')).replace(/[٠-٩]/g, d => ar.indexOf(d)).trim();
    if (phone && !/^[0-9+ ]{7,20}$/.test(phone)) return toast('رقم التليفون غير صحيح', true);
    btn.disabled = true; btn.textContent = 'جاري الحفظ…';
    try {
      const r = await sbClient.rpc('courier_profile_update', { p_title: title, p_phone: phone, p_photo: st.pPhoto === undefined ? null : st.pPhoto });
      if (r.error) throw r.error;
      st.me = r.data; st.pPhoto = undefined; st.pT = undefined; st.pP = undefined;
      const w = $('cp-whobtn'); if (w) w.innerHTML = whoInner();
      toast('تم حفظ ملفك ✓'); renderTab(false);
    } catch (e) { toast(errMsg(e), true); btn.disabled = false; btn.textContent = 'حفظ'; }
  }

  /* ---------- 5) التواصل (رسايل خاصة + اتصال) ---------- */
  const online = c => c.last_seen_at && (Date.now() - new Date(c.last_seen_at).getTime()) < 3 * 60 * 1000;
  function viewChat() {
    const b = $('cp-body'); if (!b) return;
    if (st.chat) return convView();
    const rows = st.contacts.map(c => {
      const nm = c.full_name || 'موظف';
      return '<div class="cp-card"><div class="cp-ct" data-act="chat-open" data-uid="' + eh(c.id) + '"><div class="cp-av">' + eh(nm.trim().charAt(0).toUpperCase()) + '<i class="' + (online(c) ? 'on' : '') + '"></i></div>' +
        '<div class="m"><b>' + eh(nm) + (c.is_manager ? ' <span class="cp-tag ok">المدير</span>' : '') + '</b><small>' + eh(c.last_body ? ((c.last_sender === st.me.user_id ? 'أنت: ' : '') + c.last_body) : (c.job_title || 'موظف')) + '</small>' +
        '<small>' + (online(c) ? '🟢 متصل الآن' : (c.last_seen_at ? 'آخر ظهور ' + eh(timeOf(c.last_seen_at)) : '')) + '</small></div>' +
        (Number(c.unread) ? '<span class="cp-ub">' + num(c.unread) + '</span>' : '') + '</div>' +
        (c.phone ? '<div class="cp-info">' + callBtns(c.phone, 'اتصال') + '</div>' : '') + '</div>';
    }).join('');
    b.innerHTML = renderGuideBanner('chat') + (rows || '<div class="cp-empty">' + (st.loaded ? 'مفيش جهات اتصال' : 'جاري التحميل…') + '</div>');
  }
  function convView() {
    const b = $('cp-body'), c = st.chat; if (!b) return;
    b.innerHTML = '<div class="cp-chat"><div class="cp-chead"><button type="button" class="cp-btn cp-sm" data-act="chat-back">رجوع</button><b>' + eh(c.name) + '</b>' + (c.phone ? callBtns(c.phone, 'اتصال') : '') + '</div>' +
      '<div class="cp-msgs" id="cp-msgs"></div>' + (c.tx ? '<div class="cp-sub" style="margin-top:6px">بخصوص معاملة <b>' + eh(c.tx) + '</b> <button type="button" class="cp-a cp-sm" data-act="chat-notx">شيل</button></div>' : '') +
      '<div class="cp-comp"><textarea id="cp-msg" class="cp-field" rows="1" placeholder="اكتب رسالة…">' + eh(st.draft) + '</textarea><button type="button" class="cp-btn cp-go" data-act="chat-send">إرسال</button></div></div>';
    paintMsgs(true);
    const t = $('cp-msg'); if (t) { t.addEventListener('input', () => { st.draft = t.value; t.style.height = 'auto'; t.style.height = Math.min(110, t.scrollHeight) + 'px'; }); }
  }
  function paintMsgs(force) {
    const m = $('cp-msgs'); if (!m) return;
    const near = force || (m.scrollHeight - m.scrollTop - m.clientHeight < 80);
    m.innerHTML = st.msgs.length ? st.msgs.map(x => '<div class="cp-m ' + (x.mine ? 'me' : 'th') + '">' + (x.tx_id ? '<span class="tx">' + eh(x.tx_id) + '</span><br>' : '') + eh(x.body) + '<small>' + eh(timeOf(x.created_at)) + '</small></div>').join('') : '<div class="cp-empty">ابدأ المحادثة…</div>';
    if (near) m.scrollTop = m.scrollHeight;
  }
  async function openChat(uid, tx) {
    const c = st.contacts.find(x => x.id === uid); if (!c) return;
    try {
      let ch = c.channel_id;
      if (!ch) { const r = await sbClient.rpc('courier_dm', { p_other: uid }); if (r.error) throw r.error; ch = r.data; c.channel_id = ch; }
      st.chat = { uid: uid, name: c.full_name || 'موظف', ch: ch, phone: c.phone, tx: tx || null }; st.msgs = []; st.tab = 'chat'; renderNav(); convView();
      await pollMsgs(true);
    } catch (e) { toast(errMsg(e), true); }
  }
  async function pollMsgs(first) {
    const c = st.chat; if (!c) return;
    try {
      const last = st.msgs.length ? st.msgs[st.msgs.length - 1].created_at : null;
      const r = await sbClient.rpc('courier_chat_messages', { p_channel: c.ch, p_after: first ? null : last });
      if (r.error) throw r.error; setOffline(false);
      if (!st.chat || st.chat.ch !== c.ch) return;
      const have = new Set(st.msgs.map(x => x.id)), add = (r.data || []).filter(x => !have.has(x.id));
      if (first) { st.msgs = r.data || []; paintMsgs(true); }
      else if (add.length) { st.msgs = st.msgs.filter(x => !String(x.id).startsWith('tmp')).concat(add); paintMsgs(false); }
      if ((first || add.some(x => !x.mine))) { sbClient.rpc('courier_chat_read', { p_channel: c.ch }); const k = st.contacts.find(x => x.channel_id === c.ch); if (k) k.unread = 0; renderNav(); }
    } catch (e) { setOffline(true); }
  }
  async function sendMsg() {
    const c = st.chat, t = $('cp-msg'); if (!c || !t) return;
    const body = t.value.trim(); if (!body || st.busy) return;
    st.busy = true; const tmp = { id: 'tmp' + Date.now(), body: body, created_at: new Date().toISOString(), mine: true, tx_id: c.tx };
    st.msgs.push(tmp); paintMsgs(true); t.value = ''; st.draft = ''; t.style.height = 'auto';
    try {
      const r = await sbClient.rpc('courier_chat_send', { p_channel: c.ch, p_body: body, p_tx: c.tx }); if (r.error) throw r.error;
      c.tx = null; await pollMsgs(true); loadContacts(true);
    } catch (e) { st.msgs = st.msgs.filter(x => x !== tmp); paintMsgs(false); t.value = body; st.draft = body; toast(errMsg(e), true); }
    st.busy = false;
  }

  /* ---------- تحميل البيانات (من غير رمشة: بنعيد الرسم بس لو البيانات اتغيّرت) ---------- */
  function setOffline(v) { st.offline = v; const e = $('cp-off'); if (e) e.classList.toggle('on', !!v); }
  async function loadItems(silent) {
    try {
      const t = today(), r = await sbClient.rpc('courier_items', { p_from: addDays(t, -120), p_to: t });
      if (r.error) throw r.error; setOffline(false);
      const data = Array.isArray(r.data) ? r.data : [], sig = JSON.stringify(data);
      st.loaded = true;
      if (sig !== st.sig) { st.sig = sig; st.items = data; renderNav(); if (st.tab !== 'chat' && st.tab !== 'profile') renderTab(false); }
    } catch (e) { setOffline(true); if (!silent) toast(errMsg(e), true); }
  }
  async function loadLeaderboard(silent) {
    try {
      const rng = rangeOf(st.lbPeriod);
      const r = await sbClient.rpc('courier_leaderboard', { p_from: rng[0], p_to: rng[1] });
      if (r.error) {
        /* Fallback لو الدالة لسه متشغلتش في Supabase: نحسب بيانات المندوب نفسه */
        if (!st.leaderboard.length && st.me) {
          const s = stats(rng);
          st.leaderboard = [{
            id: st.me.id, name: st.me.name, is_me: true, rank: 1,
            pickups: s.pickup.n, deliveries: s.delivery.n, fee_trips: s.fee.n,
            total_trips: s.pickup.n + s.delivery.n + s.fee.n,
            confirmed_trips: s.pickup.cn + s.delivery.cn + s.fee.cn,
            confirmed_amount: s.total, pending_amount: s.pend
          }];
          st.lbLoaded = true;
          if (st.tab === 'rank' || st.tab === 'home') renderTab(false);
        }
        return;
      }
      const data = Array.isArray(r.data) ? r.data : [], sig = st.lbPeriod + ':' + JSON.stringify(data);
      st.lbLoaded = true;
      if (sig !== st.lbsig) {
        st.lbsig = sig; st.leaderboard = data;
        if (st.tab === 'rank' || st.tab === 'home') renderTab(false);
      }
    } catch (e) { if (!silent) toast(errMsg(e), true); }
  }
  async function loadContacts(silent) {
    try {
      const r = await sbClient.rpc('courier_contacts'); if (r.error) throw r.error; setOffline(false);
      const data = Array.isArray(r.data) ? r.data : [], sig = JSON.stringify(data);
      if (sig !== st.csig) {
        const u0 = unreadTotal(); st.csig = sig; st.contacts = data; const u1 = unreadTotal();
        renderNav(); if (st.tab === 'chat' && !st.chat) viewChat();
        if (u1 > u0 && st.loaded && !(st.chat)) toast('وصلتك رسالة جديدة 💬');
      }
    } catch (e) { if (!silent) toast(errMsg(e), true); }
  }
  function tick() {
    st.tick++; tickClock();
    if (document.hidden || !st.me) return;
    if (st.chat && st.tick % 4 === 0) pollMsgs(false);
    if (st.tick % 20 === 0) loadItems(true);
    if (st.tick % 30 === 0) loadLeaderboard(true);
    if (st.tick % 15 === 0) loadContacts(true);
    if (st.tick % 60 === 0) sbClient.rpc('touch_last_seen');
  }

  /* ---------- مودالات الملاحظات السريعة والتأكيد ---------- */
  function modal(html) { const r = $('cp-modal-root'); if (!r) return; r.innerHTML = '<div class="cp-modal" data-act="mclose"><div class="cp-box">' + html + '</div></div>'; const f = r.querySelector('textarea,input'); if (f) setTimeout(() => f.focus(), 60); }
  const closeModal = () => { const r = $('cp-modal-root'); if (r) r.innerHTML = ''; };
  const byTx = tx => st.items.find(o => String(o.transaction_id) === String(tx));
  const NK = [
    ['note', '🛵 ملاحظة للموظف'],
    ['problem', '🚩 مشكلة في المعاملة أو العميل'],
    ['missing_fee', '⚠ المشوار برسوم توصيل ومش متسجّل لي رسوم']
  ];
  const QUICK_NOTES = [
    '📞 العميل لا يرد على التليفون',
    '📅 العميل طلب تأجيل الموعد لبكرة',
    '📍 العنوان غير واضح ومحتاج تواصل',
    '✅ تم الاستلام من العميل بنجاح',
    '🚚 تم التسليم للعميل بنجاح',
    '💰 العميل دفع رسوم التوصيل كاش'
  ];

  async function askNote(tx) {
    const o = byTx(tx); st.noteKind = 'note';
    modal('<h3>ملاحظة للموظف / بلاغ سريع</h3><p>على معاملة <b>' + eh(o ? o.client_name : '') + '</b> (<b dir="ltr">' + eh(tx) + '</b>). بتظهر كتعليق على المعاملة وبيوصل إشعار فوري للموظف المسؤول وللمدير.</p>' +
      '<div class="cp-kinds" id="cp-kinds">' + NK.map(k => '<button type="button" data-act="nkind" data-k="' + k[0] + '" class="' + (k[0] === 'note' ? 'on' : '') + '">' + k[1] + '</button>').join('') + '</div>' +
      '<div style="font-size:11px;font-weight:700;color:var(--mu);margin-bottom:5px">اختصارات سريعة (اضغط لإدراج النص):</div>' +
      '<div class="cp-qnotes">' + QUICK_NOTES.map(qn => '<button type="button" data-act="qnote" data-txt="' + eh(qn) + '">' + eh(qn) + '</button>').join('') + '</div>' +
      '<textarea id="cp-nbody" class="cp-field" rows="3" maxlength="500" placeholder="اكتب التفاصيل أو اختار من الأزرار فوق…"></textarea>' +
      '<div class="cp-btns"><button type="button" class="cp-btn cp-go" data-act="nsend" data-tx="' + eh(tx) + '">إرسال للموظف</button><button type="button" class="cp-btn" data-act="mclose-btn">إلغاء</button></div><div class="cp-old-n" id="cp-oldn"></div>');
    try {
      const r = await sbClient.rpc('courier_tx_notes', { p_tx: tx }); const n = (r.data || []); const e = $('cp-oldn');
      if (e) e.innerHTML = n.length ? '<b>ملاحظاتك السابقة على المعاملة:</b>' + n.map(x => '<div style="margin-top:4px">' + eh(x.body) + ' <span>(' + eh(timeOf(x.at)) + ')</span></div>').join('') : '';
    } catch (e) { /* */ }
  }
  async function sendNote(tx, btn) {
    if (st.busy) return; const body = ($('cp-nbody') || {}).value || '';
    if (st.noteKind !== 'missing_fee' && !body.trim()) { toast('اكتب الملاحظة أو اختار سبب سريع الأول', true); return; }
    st.busy = true; if (btn) btn.disabled = true;
    try {
      const r = await sbClient.rpc('courier_add_note', { p_tx: tx, p_kind: st.noteKind, p_body: body }); if (r.error) throw r.error;
      closeModal(); toast('اتبعتت للموظف المسؤول ✓'); st.sig = ''; loadItems(true);
    } catch (e) { toast(errMsg(e), true); if (btn) btn.disabled = false; }
    st.busy = false;
  }
  function askConfirm(kind, n, amt) {
    modal('<h3>تأكيد ' + KIND[kind].sec + ' — ' + eh(dayLabel(st.day)) + '</h3><p>هتأكد <b>' + num(n) + '</b> مشوار بإجمالي <b>' + money(amt) + '</b> وهيتحسبوا في عمولتك المؤكدة. متأكد إنك راجعتهم؟</p>' +
      '<div class="cp-btns"><button type="button" class="cp-btn cp-go" data-act="do-confirm" data-kind="' + kind + '">أيوه، تم التأكيد</button><button type="button" class="cp-btn" data-act="mclose-btn">رجوع</button></div>');
  }
  async function doConfirm(kind, btn) {
    if (st.busy) return; st.busy = true; if (btn) btn.disabled = true;
    try {
      const r = await sbClient.rpc('courier_confirm_day', { p_kind: kind, p_day: st.day }); if (r.error) throw r.error;
      closeModal(); toast('اتأكد ' + num(r.data && r.data.count) + ' مشوار ✓'); st.sig = '';
      await Promise.all([loadItems(true), loadLeaderboard(true)]);
    } catch (e) { toast(errMsg(e), true); if (btn) btn.disabled = false; }
    st.busy = false;
  }

  /* ---------- الأحداث ---------- */
  function onKey(e) {
    if (e.target && e.target.id === 'cp-msg' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
  }
  function onInput(e) {
    if (e.target && e.target.id === 'cp-trip-q') {
      st.q = e.target.value;
      renderTab(false);
    }
  }
  function onClick(e) {
    const el = e.target.closest('[data-act],[data-tab],[data-per],[data-lbper],[data-type],[data-sfilter],[data-tscope],[data-rvf]'); if (!el) return;
    if (el.dataset.tab) return setTab(el.dataset.tab);
    if (el.dataset.per) { st.period = el.dataset.per; return renderTab(false); }
    if (el.dataset.lbper) { st.lbPeriod = el.dataset.lbper; st.lbsig = ''; renderTab(false); return loadLeaderboard(false); }
    if (el.dataset.tscope) { st.tripScope = el.dataset.tscope; return renderTab(false); }
    if (el.dataset.rvf) { st.rvf = el.dataset.rvf; return renderTab(false); }
    if (el.dataset.type) { st.type = el.dataset.type; return renderTab(false); }
    if (el.dataset.sfilter) { st.statusFilter = el.dataset.sfilter; return renderTab(false); }
    const a = el.dataset.act, tx = el.dataset.tx;
    switch (a) {
      case 'mclose': if (e.target === el) closeModal(); return;
      case 'mclose-btn': return closeModal();
      case 'logout': return window.handleLogout && window.handleLogout();
      case 'theme': return toggleTheme();
      case 'guide-toggle': return toggleGuide(el.dataset.gtab);
      case 'mprev': if (st.month > minMonth()) { st.month = addMonths(st.month, -1); st.rvOpen = false; renderTab(false); } return;
      case 'mnext': if (st.month < monthOf(today())) { st.month = addMonths(st.month, 1); st.rvOpen = false; renderTab(false); } return;
      case 'rvday': st.day = el.dataset.day; st.month = monthOf(el.dataset.day); st.rvOpen = true; return st.tab === 'review' ? renderTab(true) : setTab('review');
      case 'rvback': st.rvOpen = false; return renderTab(true);
      case 'profile': return setTab('profile');
      case 'pback': st.pPhoto = undefined; st.pT = undefined; st.pP = undefined; return setTab('home');
      case 'pdel': syncDraft(); st.pPhoto = ''; return renderTab(false);
      case 'psave': return saveProfile(el);
      case 'qclear': st.q = ''; return renderTab(false);
      case 'dprev': st.day = addDays(st.day, -1); return renderTab(false);
      case 'dnext': if (st.day < today()) { st.day = addDays(st.day, 1); renderTab(false); } return;
      case 'dset': st.day = el.dataset.day; return renderTab(true);
      case 'note': return askNote(tx);
      case 'nkind': st.noteKind = el.dataset.k; document.querySelectorAll('#cp-kinds button').forEach(b => b.classList.toggle('on', b === el)); return;
      case 'qnote': {
        const nb = $('cp-nbody');
        if (nb) { nb.value = (nb.value ? nb.value.trim() + ' — ' : '') + (el.dataset.txt || ''); nb.focus(); }
        return;
      }
      case 'nsend': return sendNote(tx, el);
      case 'ask': return askConfirm(el.dataset.kind, el.dataset.n, el.dataset.amt);
      case 'do-confirm': return doConfirm(el.dataset.kind, el);
      case 'chat-open': return openChat(el.dataset.uid, null);
      case 'chat-emp': st.tab = 'chat'; st.chat = null; renderNav(); return loadContacts(true).then(() => openChat(el.dataset.uid, tx));
      case 'chat-back': st.chat = null; renderTab(true); return;
      case 'chat-send': return sendMsg();
      case 'chat-notx': if (st.chat) { st.chat.tx = null; const t = $('cp-msg'); st.draft = t ? t.value : st.draft; convView(); } return;
    }
  }

  async function showCourier() {
    initTheme(); initGuides(); st.day = today(); st.month = monthOf(today());
    overlay('<div class="cp-empty" style="margin:auto">جاري التحميل…</div>');
    try { const r = await sbClient.rpc('courier_me'); if (r.error) throw r.error; st.me = r.data; }
    catch (e) { overlay('<header class="cp-head"><div class="cp-who"><b>بوابة المندوب</b></div>' + logoutBtn + '</header><div class="cp-empty" style="margin:auto">' + eh(errMsg(e)) + '</div>'); return; }
    shell(); sbClient.rpc('touch_last_seen');
    await Promise.all([loadItems(false), loadLeaderboard(true), loadContacts(true)]);
    clearInterval(st.timer); st.timer = setInterval(tick, 1000);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && st.me && $('courier-app')) { loadItems(true); loadLeaderboard(true); loadContacts(true); if (st.chat) pollMsgs(false); } });
  window.addEventListener('online', () => { if (st.me) { loadItems(true); loadLeaderboard(true); loadContacts(true); } });

  /* ---------- نقطة الدخول: لو الدور courier نعرض البوابة، غير كده السيستم يكمل عادي ---------- */
  const _li = window.loadInitialData;
  window.loadInitialData = async function () {
    let role = null;
    try { const r = await sbClient.rpc('my_role'); role = r && !r.error ? r.data : null; } catch (e) { /* */ }
    if (role === 'courier') { window.__role = 'courier'; return showCourier(); }
    if (role) window.__role = role;
    if (isManagerUser()) ensureManagerUi();
    try {
      const out = await _li.apply(this, arguments);
      if (isManagerUser()) ensureManagerUi();
      return out;
    } catch (err) {
      if (isManagerUser()) ensureManagerUi();
      throw err;
    }
  };
  const _sl = window.showLoginScreen;
  window.showLoginScreen = function () {
    clearInterval(st.timer); st.me = null; st.sig = ''; st.lbsig = ''; st.csig = ''; st.items = []; st.leaderboard = []; st.contacts = []; st.chat = null; st.msgs = []; st.loaded = false; st.lbLoaded = false; st.tab = 'home'; st.rvOpen = false; st.pPhoto = undefined; st.pT = undefined; st.pP = undefined;
    document.body.classList.remove('is-courier-mode', 'is-partner-mode');
    const o = $('courier-app'); if (o) o.remove();
    return _sl.apply(this, arguments);
  };

  /* =====================================================================
     المدير: ربط حسابات المناديب + إضافة/إيقاف مناديب + لوحة ترتيب المناديب
     يظهر في مكانين عشان مايختفيش أبداً:
     1) زرار ثابت في القائمة الجانبية (#tab-cpmgr-btn)
     2) شريط بارز أعلى شاشة «المناديب» (#tab-couriers)
     ===================================================================== */
  function addMgrBtn() {
    if (!isManagerUser()) return;
    const menu = $('nav-menu'); if (!menu) return;
    if (!$('tab-cpmgr-btn')) {
      const b = document.createElement('button');
      b.id = 'tab-cpmgr-btn';
      b.type = 'button';
      b.className = 'tab-btn';
      b.innerHTML = '<i class="fa-solid fa-id-card text-emerald-500"></i><span>حسابات وبوابة المناديب</span>';
      b.addEventListener('click', () => { if (window.closeNavMenu) window.closeNavMenu(); openMgr('accounts'); });
      const anchor = $('tab-couriers-btn') || $('tab-notes-btn');
      const adminBody = menu.querySelector(':scope > section[data-mg="admin"] .mg-body');
      if (anchor && anchor.parentElement) anchor.insertAdjacentElement('afterend', b);
      else if (adminBody) adminBody.appendChild(b);
      else menu.appendChild(b);
    }
  }

  function injectCouriersTabBanner() {
    if (!isManagerUser()) return;
    const root = $('tab-couriers');
    if (!root || root.classList.contains('hidden')) return;
    if ($('cp-couriers-top-bar')) return;
    const bar = document.createElement('div');
    bar.id = 'cp-couriers-top-bar';
    bar.className = 'card p-4 border-2 border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/20 flex flex-wrap items-center justify-between gap-3';
    bar.innerHTML =
      '<div class="flex items-center gap-3">' +
        '<div class="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white text-base shadow-xs"><i class="fa-solid fa-id-card"></i></div>' +
        '<div>' +
          '<div class="text-sm font-bold text-ink dark:text-white">بوابة وحسابات المناديب ولوحة الترتيب (Leaderboard)</div>' +
          '<div class="text-xs text-slate-500 dark:text-slate-400">اربط كل مندوب بحساب الدخول بتاعه، ضيف أو وقّف مناديب، وتابع ترتيب الاستلامات والتسليم لحظة بلحظة.</div>' +
        '</div>' +
      '</div>' +
      '<div class="flex flex-wrap items-center gap-2">' +
        '<button type="button" id="cp-open-mgr-acc" class="rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow-xs flex items-center gap-1.5"><i class="fa-solid fa-link"></i><span>ربط وإدارة حسابات المناديب</span></button>' +
        '<button type="button" id="cp-open-mgr-lb" class="rounded-xl bg-amber-500 hover:bg-amber-600 px-4 py-2 text-xs font-bold text-slate-950 shadow-xs flex items-center gap-1.5"><i class="fa-solid fa-trophy"></i><span>لوحة ترتيب الاستلامات والتسليم</span></button>' +
      '</div>';
    root.insertBefore(bar, root.firstChild);
    const b1 = $('cp-open-mgr-acc'), b2 = $('cp-open-mgr-lb');
    if (b1) b1.onclick = () => openMgr('accounts');
    if (b2) b2.onclick = () => openMgr('leaderboard');
  }

  let mgrObsBound = false;
  function ensureManagerUi() {
    addMgrBtn();
    injectCouriersTabBanner();
    if (mgrObsBound) return;
    mgrObsBound = true;
    const root = $('tab-couriers');
    if (root && window.MutationObserver) {
      try {
        new MutationObserver(() => {
          if (isManagerUser() && !$('cp-couriers-top-bar')) injectCouriersTabBanner();
        }).observe(root, { childList: true });
      } catch (e) { /* */ }
    }
    const _st = window.switchTab;
    if (typeof _st === 'function' && !_st.__cpWrapped) {
      const wrapped = function (id) {
        const res = _st.apply(this, arguments);
        if (isManagerUser()) {
          addMgrBtn();
          if (id === 'couriers') setTimeout(injectCouriersTabBanner, 50);
        }
        return res;
      };
      wrapped.__cpWrapped = true;
      window.switchTab = wrapped;
    }
  }

  function mgrShell(inner) {
    addCss();
    let o = $('cp-mgr');
    if (!o) {
      o = document.createElement('div'); o.id = 'cp-mgr'; o.className = 'cp-modal'; o.setAttribute('dir', 'rtl');
      document.body.appendChild(o);
    }
    o.innerHTML = '<div class="cp-box" style="max-width:640px">' + inner + '</div>';
    return o;
  }

  let mgrTab = 'accounts', mgrLbPeriod = 'month';
  window.openCourierPortalManager = openMgr;

  async function openMgr(initialTab) {
    if (initialTab === 'accounts' || initialTab === 'leaderboard') mgrTab = initialTab;
    const o = mgrShell('<h3>إدارة بوابة المناديب والترتيب</h3><p>جاري التحميل…</p>');
    o.onclick = ev => { if (ev.target === o) o.remove(); };

    const rng = rangeOf(mgrLbPeriod);
    const [r, ov, lb] = await Promise.all([
      sbClient.rpc('list_courier_accounts'),
      sbClient.rpc('courier_overview').then(x => x, () => ({ data: [] })),
      sbClient.rpc('courier_leaderboard', { p_from: rng[0], p_to: rng[1] }).then(x => x, () => ({ data: [] }))
    ]);

    if (r.error) {
      mgrShell('<h3>حسابات المناديب</h3><p>مش قادر أحمّل القايمة. اتأكد إنك شغّلت <code>sql/courier-portal.sql</code> في Supabase SQL Editor.</p><div class="cp-btns"><button type="button" class="cp-btn" id="cp-mgr-x">إغلاق</button></div>');
      $('cp-mgr-x').onclick = () => $('cp-mgr').remove();
      return;
    }

    const navTabs = '<div class="cp-seg" style="margin-bottom:14px">' +
      '<button type="button" id="cp-mtab-acc" class="' + (mgrTab === 'accounts' ? 'on' : '') + '"><i class="fa-solid fa-id-card"></i> ربط وإدارة المناديب</button>' +
      '<button type="button" id="cp-mtab-lb" class="' + (mgrTab === 'leaderboard' ? 'on' : '') + '"><i class="fa-solid fa-trophy"></i> لوحة ترتيب الاستلامات والتسليم</button>' +
    '</div>';

    let contentHtml = '';
    if (mgrTab === 'accounts') {
      const info = {}; ((ov && ov.data) || []).forEach(x => { info[x.id] = x; });
      const allCouriers = r.data || [];
      const activeCouriers = allCouriers.filter(c => c.active);
      const inactiveCouriers = allCouriers.filter(c => !c.active);

      const addCourierForm =
        '<form id="cp-mgr-add-c" style="display:flex;gap:8px;margin-bottom:12px;padding:10px;background:var(--fld);border-radius:12px;border:1px solid var(--bd);align-items:center;flex-wrap:wrap">' +
          '<b style="font-size:12px"><i class="fa-solid fa-user-plus" style="color:#10b981;margin-inline-end:4px"></i>إضافة مندوب جديد:</b>' +
          '<input id="cp-mgr-new-name" class="cp-field" style="flex:1;min-width:160px;padding:7px 10px;font-size:12.5px" required placeholder="اسم المندوب الثلاثي أو الثنائي">' +
          '<button type="submit" class="cp-btn cp-go" style="padding:8px 14px;font-size:12px">إضافة للقائمة</button>' +
        '</form>';

      const rows = activeCouriers.map(c => c.user_id
        ? '<div class="cp-mgr-row">' +
            '<span class="nm"><i class="fa-solid fa-circle-check" style="color:#10b981;margin-inline-end:5px"></i>' + eh(c.name) + '</span>' +
            '<span class="em">' + eh(c.email || 'مربوط بحساب') + '</span>' +
            ((c.profile_title || c.profile_phone) ? '<span class="st">' + eh([c.profile_title, c.profile_phone].filter(Boolean).join(' · ')) + '</span>' : '') +
            '<button type="button" class="cp-btn" style="background:#be123c;color:#fff" data-unlink="' + eh(c.user_id) + '">فك الربط</button>' +
            '<button type="button" class="cp-btn" data-toggle-c="' + eh(c.id) + '" data-active="false">إيقاف المندوب</button>' +
            (info[c.id] ? '<span class="st">مشاوير بانتظار تأكيد المندوب (آخر 30 يوم): <b>' + num(info[c.id].pending_trips) + '</b> · ملاحظاته آخر 7 أيام: <b>' + num(info[c.id].notes_7d) + '</b></span>' : '') +
          '</div>'
        : '<form class="cp-mgr-row" data-link="' + eh(c.id) + '">' +
            '<span class="nm">' + eh(c.name) + ' <small style="color:#f59e0b;font-size:10px">(غير مربوط)</small></span>' +
            '<input class="cp-field" type="email" required placeholder="اكتب إيميل حساب المندوب في Supabase">' +
            '<button type="submit" class="cp-btn cp-go">ربط الحساب</button>' +
            '<button type="button" class="cp-btn" data-toggle-c="' + eh(c.id) + '" data-active="false">إيقاف</button>' +
          '</form>'
      ).join('');

      const inactiveHtml = inactiveCouriers.length
        ? '<div style="margin-top:12px;padding-top:10px;border-top:1px dashed var(--bd)"><div style="font-size:11.5px;color:var(--mu);font-weight:700;margin-bottom:6px">مناديب موقوفون (' + num(inactiveCouriers.length) + '):</div>' +
          inactiveCouriers.map(c => '<div class="cp-mgr-row" style="opacity:.75"><span class="nm">' + eh(c.name) + '</span><button type="button" class="cp-btn cp-go" data-toggle-c="' + eh(c.id) + '" data-active="true">إعادة تفعيل</button></div>').join('') + '</div>'
        : '';

      contentHtml =
        '<p>1) اعمل حساب للمندوب من Supabase (<b>Authentication ← Users ← Add user</b>).<br>2) اكتب إيميله قدام اسمه هنا واضغط <b>«ربط الحساب»</b>. المندوب هيدخل يشوف شغله وعمولته وترتيبه ويتواصل معاكم.</p>' +
        addCourierForm +
        (rows || '<p>مفيش مناديب نشطين حالياً. ضيف مندوب من الفورم فوق.</p>') +
        inactiveHtml;
    } else {
      const lbRows = (lb && Array.isArray(lb.data)) ? lb.data : [];
      const perBar = '<div class="cp-tabs" style="margin-bottom:12px">' + [
        ['today', 'اليوم'],
        ['week', 'هذا الأسبوع'],
        ['month', 'هذا الشهر']
      ].map(p => '<button type="button" class="cp-tab' + (mgrLbPeriod === p[0] ? ' on' : '') + '" data-mgr-lbper="' + p[0] + '">' + p[1] + '</button>').join('') + '</div>';
      st.lbLoaded = true;
      contentHtml = '<p>ترتيب المناديب حسب إجمالي الاستلامات والتسليم ومشاوير رسوم التوصيل (مع إجمالي العمولات المؤكدة والمنتظرة):</p>' +
        perBar + renderLeaderboardInner(lbRows, true);
    }

    const m = mgrShell(
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">' +
        '<h3 style="margin:0"><i class="fa-solid fa-motorcycle" style="color:#10b981;margin-inline-end:6px"></i>إدارة بوابة المناديب والترتيب</h3>' +
        '<button type="button" class="cp-btn cp-sm" id="cp-mgr-x">إغلاق ✕</button>' +
      '</div>' +
      navTabs + contentHtml
    );

    m.onclick = ev => { if (ev.target === m) m.remove(); };
    $('cp-mgr-x').onclick = () => m.remove();
    const tAcc = $('cp-mtab-acc'), tLb = $('cp-mtab-lb');
    if (tAcc) tAcc.onclick = () => openMgr('accounts');
    if (tLb) tLb.onclick = () => openMgr('leaderboard');

    m.querySelectorAll('[data-mgr-lbper]').forEach(b => b.addEventListener('click', () => {
      mgrLbPeriod = b.dataset.mgrLbper;
      openMgr('leaderboard');
    }));

    const addForm = $('cp-mgr-add-c');
    if (addForm) {
      addForm.addEventListener('submit', async ev => {
        ev.preventDefault();
        const nm = ($('cp-mgr-new-name').value || '').replace(/\s+/g, ' ').trim();
        if (!nm) return;
        const ins = await sbClient.from('couriers').insert({ name: nm, active: true, sort_order: ((r.data && r.data.length) || 0) + 1 });
        if (ins.error) return toast('تعذّرت إضافة المندوب: ' + ins.error.message, true);
        toast('تمت إضافة المندوب ' + nm + ' ✓');
        openMgr('accounts');
      });
    }

    m.querySelectorAll('[data-link]').forEach(f => f.addEventListener('submit', async ev => {
      ev.preventDefault();
      const x = await sbClient.rpc('assign_courier', { p_email: f.querySelector('input').value.trim(), p_courier_id: Number(f.dataset.link) });
      if (x.error) return toast(/no such account/.test(x.error.message) ? 'مفيش حساب بالإيميل ده في Supabase' : /another role/.test(x.error.message) ? 'الحساب ده مربوط بدور تاني (موظف/مدير/منفذ)' : errMsg(x.error), true);
      toast('اتربط حساب المندوب بنجاح ✓'); openMgr('accounts');
    }));

    m.querySelectorAll('[data-unlink]').forEach(b => b.addEventListener('click', async () => {
      if (!window.confirm('فك ربط وإيقاف حساب دخول المندوب ده؟')) return;
      const x = await sbClient.rpc('remove_role', { p_user: b.dataset.unlink });
      if (x.error) return toast(errMsg(x.error), true);
      toast('تم فك ربط الحساب ✓'); openMgr('accounts');
    }));

    m.querySelectorAll('[data-toggle-c]').forEach(b => b.addEventListener('click', async () => {
      const id = Number(b.dataset.toggleC), act = b.dataset.active === 'true';
      if (!act && !window.confirm('إيقاف المندوب ده من القائمة النشطة؟')) return;
      const u = await sbClient.from('couriers').update({ active: act }).eq('id', id);
      if (u.error) return toast(errMsg(u.error), true);
      toast(act ? 'تم تفعيل المندوب ✓' : 'تم إيقاف المندوب'); openMgr('accounts');
    }));
  }
})();
