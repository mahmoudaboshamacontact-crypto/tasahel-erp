/* Courier Operations UI — loaded after courier portal. */
(function () {
  'use strict';
  if (window.__courierOpsUi) return; window.__courierOpsUi = true;
  const $ = id => document.getElementById(id);
  const esc = s => typeof escapeHtml === 'function' ? escapeHtml(s == null ? '' : String(s)) : String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const money = n => Number(n || 0).toLocaleString('ar-EG') + ' ج';
  const labels = {new:'جديد',collecting:'جاري الاستلام',collected:'تم الاستلام',on_the_way:'في الطريق',delivered:'تم التسليم'};
  const typeLabels = {pickup:'استلام',delivery:'تسليم',fee:'رسوم توصيل'};
  const issueLabels = {customer_unavailable:'العميل غير متاح',wrong_address:'عنوان خطأ',incorrect_fee:'رسوم غير صحيحة',pickup_problem:'مشكلة في الاستلام',other:'مشكلة أخرى'};
  const MIN_REFRESH_MS = 60000; /* حد أدنى 60 ثانية بين أي تحديثين تلقائيين لمنع أي حمل على قاعدة البيانات */
  const MGR_EMAILS = ['mahmoud.aboshama@tasahel.com.eg', 'mahmoud.aboshama.contact@gmail.com'];
  const state = {
    items:[],issues:[],ledger:[],closings:[],notifications:[],staffUsers:[],
    ledgerFrom:'',ledgerTo:'',tab:'route',busy:false,
    managerBusy:false,managerLoadedAt:0,managerHtml:'',managerFailed:false,
    radarBusy:false,radarLoadedAt:0,radarFailed:false,radarTimer:0,
    resolvingIssueId:null,pingTo:0,activeCase:'all',radarModalData:{},avatarById:{},avatarByName:{},avatarsLoadedAt:0
  };
  function ensureRadarSmartCss() {
    if ($('cpo-smart-radar-css')) return;
    const s = document.createElement('style');
    s.id = 'cpo-smart-radar-css';
    s.textContent = [
      'html.dark #cop-radar{--bg:#050606;--s1:#0d100e;--s2:#141916;--bd:rgba(255,255,255,.10);--tx:#F5F4F0;--mu:#9BA59F;--ac:#10b981;--acink:#041b11;--acsoft:rgba(16,185,129,.15);--ok:#22c55e;--oksoft:rgba(34,197,94,.14);--wn:#f59e0b;--wnsoft:rgba(245,158,11,.15);--er:#f43f5e;--ersoft:rgba(244,63,94,.15);border:1px solid rgba(255,255,255,.09);box-shadow:0 16px 40px rgba(0,0,0,.65)}',
      'html:not(.dark) #cop-radar{--ersoft:rgba(180,35,47,.12)}',
      '#cop-radar .cpo-cases-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}',
      '#cop-radar .cpo-case-tile{text-align:start;background:var(--s1);border:1px solid var(--bd);border-radius:18px;padding:13px 14px;cursor:pointer;display:flex;flex-direction:column;gap:4px;color:var(--tx);font:inherit;transition:border-color .15s,transform .12s}',
      '#cop-radar .cpo-case-tile:hover{border-color:var(--ac)}',
      '#cop-radar .cpo-case-tile.active{border-color:var(--ac);box-shadow:0 0 0 1px var(--ac)}',
      '#cop-radar .cpo-case-tile.warn{border-color:rgba(245,158,11,.45);background:var(--wnsoft)}',
      '#cop-radar .cpo-case-tile.crit{border-color:rgba(244,63,94,.48);background:var(--ersoft)}',
      '#cop-radar .cpo-case-num{font-size:26px;font-weight:800;line-height:1.1;font-variant-numeric:tabular-nums}',
      '#cop-radar .cpo-case-board{background:var(--s1);border:1px solid var(--bd);border-radius:20px;padding:14px 16px;display:flex;flex-direction:column;gap:10px}',
      '#cop-radar .cpo-case-item{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-radius:14px;background:var(--s2);border:1px solid var(--bd);font-size:13px}',
      '#cop-radar .cpo-case-item.crit{border-inline-start:3px solid var(--er)}',
      '#cop-radar .cpo-case-item.warn{border-inline-start:3px solid var(--wn)}',
      '#cop-radar .cpo-case-item.info{border-inline-start:3px solid var(--ac)}',
      '#cop-radar .cpo-av{width:44px;height:44px;border-radius:50%;background:var(--acsoft);border:2px solid var(--ac);color:var(--ac);font-weight:800;font-size:13px;display:flex;align-items:center;justify-content:center;flex:none;overflow:hidden}',
      '#cop-radar .cpo-av img,.cpo-dd-av img{width:100%;height:100%;object-fit:cover;display:block}',
      '.cpo-dd-av{width:44px;height:44px;border-radius:50%;background:var(--acsoft,rgba(16,185,129,.15));border:2px solid var(--ac,#10b981);color:var(--ac,#10b981);font-weight:800;font-size:13px;display:flex;align-items:center;justify-content:center;flex:none;overflow:hidden}',
      '#cop-radar .cpo-zpin-av{position:absolute;top:-26px;width:24px;height:24px;border-radius:50%;border:2px solid var(--ac);background:var(--s1);overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;color:var(--ac);box-shadow:0 2px 8px rgba(0,0,0,.35)}',
      '#cop-radar .cpo-zpin-av img{width:100%;height:100%;object-fit:cover;display:block}',
      '#cop-radar .cpo-now-box{padding:9px 11px;border-radius:12px;background:var(--bg);border:1px solid var(--bd);display:flex;flex-direction:column;gap:4px;font-size:12px}',
      '#cop-radar .cpo-now-row{display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap}',
      '#cop-radar .cpo-kind-pill{display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;font-size:10.5px;font-weight:800;background:var(--acsoft);color:var(--ac)}',
      '#cop-radar .cpo-next-hint{font-size:11.5px;font-weight:700;color:var(--tx)}',
      '#cop-radar .cpo-next-hint.office{color:var(--wn)}',
      '.cpo-dd-next{margin-top:4px;padding:6px 9px;border-radius:9px;background:rgba(16,185,129,.11);border:1px solid rgba(16,185,129,.25);font-size:11.5px;font-weight:700;color:#059669}',
      'html.dark .cpo-dd-next{color:#34d399}',
      '.cpo-dd-next.office{background:rgba(245,158,11,.13);border-color:rgba(245,158,11,.35);color:#b45309}',
      'html.dark .cpo-dd-next.office{color:#fbbf24}',
      '#cop-radar .cpo-zline{position:relative;display:flex;align-items:flex-start;justify-content:space-between;gap:6px;padding:24px 8px 6px;margin:4px 0;background:var(--bg);border:1px solid var(--bd);border-radius:14px}',
      '#cop-radar .cpo-ztrack{position:absolute;top:35px;right:14%;left:14%;height:4px;border-radius:999px;background:var(--bd);z-index:0;overflow:hidden}',
      '#cop-radar .cpo-ztrack>i{display:block;height:100%;background:var(--ac);border-radius:999px}',
      '#cop-radar .cpo-znode{position:relative;z-index:1;flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:4px;background:transparent;border:0;color:var(--tx);font:inherit;cursor:pointer;padding:0}',
      '#cop-radar .cpo-zdot{width:24px;height:24px;border-radius:50%;border:2px solid var(--bd);background:var(--s1);color:var(--mu);font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center}',
      '#cop-radar .cpo-znode.done .cpo-zdot{background:var(--ok);border-color:var(--ok);color:#041b11}',
      '#cop-radar .cpo-znode.active .cpo-zdot{background:var(--ac);border-color:var(--ac);color:var(--acink);box-shadow:0 0 0 4px var(--acsoft)}',
      '#cop-radar .cpo-zpin{position:absolute;top:-22px;padding:1px 6px;border-radius:999px;background:var(--ac);color:var(--acink);font-size:10px;font-weight:800;white-space:nowrap}',
      '#cop-radar .cpo-zname{font-size:11.5px;font-weight:700;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '#cop-radar .cpo-zcnt{font-size:10.5px;color:var(--mu);font-variant-numeric:tabular-nums}',
      '#cop-radar .cpo-zpreview{font-size:12px;color:var(--tx);padding:7px 10px;border-radius:10px;background:var(--bg);border:1px dashed var(--bd)}',
      '#cop-radar [hidden]{display:none!important}',
      '#cop-radar .cpo-last-act{display:flex;align-items:center;gap:7px;padding:7px 10px;border-radius:11px;background:var(--bg);border:1px solid var(--bd);font-size:12px;color:var(--mu);min-width:0}',
      '#cop-radar .cpo-last-act span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '#cop-radar .cpo-ok-strip{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;border-radius:14px;background:var(--oksoft);border:1px solid var(--ok);font-size:13px;font-weight:700;color:var(--ok)}',
      '.cpo-dd-backdrop{position:fixed;inset:0;z-index:100050;background:rgba(0,0,0,.68);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:14px}',
      '.cpo-dd-box{width:100%;max-width:760px;max-height:86vh;overflow:auto;border-radius:22px;background:var(--s1,#111513);color:var(--tx,#f5f4f0);border:1px solid var(--bd,rgba(255,255,255,.12));padding:18px;display:flex;flex-direction:column;gap:12px;box-shadow:0 24px 60px rgba(0,0,0,.55)}',
      'html:not(.dark) .cpo-dd-box{background:#ffffff;color:#1a211d;border-color:rgba(44,59,50,.16)}',
      '.cpo-dd-item{padding:10px 12px;border-radius:14px;background:var(--s2,rgba(148,163,184,.08));border:1px solid var(--bd,rgba(148,163,184,.2));display:flex;flex-direction:column;gap:4px;font-size:12.5px}',
      '@media (max-width:900px){#cop-radar .cpo-cases-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}'
    ].join('\n');
    document.head.appendChild(s);
  }
  let panelBox = null, radarBox = null, contentBox = null;
  let couriersObs = null, observedRoot = null, isMounting = false;

  const statusOptions = Object.keys(labels).map(k=>'<option value="'+k+'">'+labels[k]+'</option>').join('');
  function rpc(name,args) { return sbClient.rpc(name,args || {}); }
  function toast(s,bad) { if (typeof showToast==='function') showToast(s,bad?'error':'success'); else alert(s); }
  function getCurUser() { return (typeof currentUser !== 'undefined' && currentUser) ? currentUser : window.currentUser; }
  function isManager() {
    if (window.__role === 'manager') return true;
    const u = getCurUser();
    const em = String((u && u.email) || '').toLowerCase().trim();
    return MGR_EMAILS.includes(em);
  }
  function isStaff() {
    if (isManager() || window.__role === 'staff') return true;
    if (window.__role === 'partner' || window.__role === 'courier') return false;
    if (document.body && (document.body.classList.contains('is-partner-mode') || document.body.classList.contains('is-courier-mode'))) return false;
    return !!getCurUser();
  }
  function isCourier() { return window.__role === 'courier'; }
  function isCouriersTabVisible() {
    const root = $('tab-couriers');
    return !!(root && !root.classList.contains('hidden'));
  }
  function isRadarVisible() {
    if (isCouriersTabVisible()) return true;
    return !!(radarBox && document.body.contains(radarBox) && radarBox.offsetParent !== null);
  }

  function shell() {
    if (typeof window.__ensureCourierPortalCss === 'function') window.__ensureCourierPortalCss();
    let root=$('courier-ops-modal');
    if (!root) { root=document.createElement('div'); root.id='courier-ops-modal'; root.dir='rtl'; root.style.cssText='position:fixed;inset:0;z-index:100001;background:rgba(2,6,23,.78);display:none;overflow:auto;padding:12px'; document.body.appendChild(root); }
    const cpApp = $('courier-app');
    const theme = cpApp ? (cpApp.getAttribute('data-theme') || 'dark') : (document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    root.setAttribute('data-theme', theme);
    root.style.display='block';
    const ledgerBtn = isCourier() ? '<button type="button" class="cp-btn" data-cop="tab" data-tab="ledger">كشف الحساب</button>' : '';
    root.innerHTML='<section style="max-width:760px;min-height:80vh;margin:0 auto;background:var(--bg);color:var(--tx);border:1px solid var(--bd);border-radius:18px;padding:14px"><header style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b style="font-size:17px">التشغيل والمتابعة</b><button type="button" data-cop="close" class="cp-btn">إغلاق ✕</button></header><nav style="display:flex;gap:6px;flex-wrap:wrap;margin:12px 0"><button type="button" class="cp-btn" data-cop="tab" data-tab="route">خط السير</button><button type="button" class="cp-btn" data-cop="tab" data-tab="issues">البلاغات</button>'+ledgerBtn+'<button type="button" class="cp-btn" data-cop="tab" data-tab="notifications">الإشعارات</button></nav><div id="cop-content">جاري التحميل…</div></section>';
  }
  function tabButtons() {
    const root=$('courier-ops-modal'); if(!root)return;
    root.querySelectorAll('[data-cop="tab"]').forEach(b=>{b.style.background=b.dataset.tab===state.tab?'#10b981':'var(--chip)';b.style.color=b.dataset.tab===state.tab?'#052e24':'var(--tx)';});
  }
  async function loadRoute() {
    const cairoToday=new Date().toLocaleDateString('en-CA',{timeZone:'Africa/Cairo'}); const r=await rpc('courier_ops_items',{p_from:cairoToday.slice(0,8)+'01',p_to:null}); if(r.error)throw r.error;
    state.items=(Array.isArray(r.data)?r.data:[]).filter(x=>x&&x.client_name&&String(x.client_name).trim()&&String(x.client_name).trim()!=='بدون اسم');
  }
  async function loadIssues() {
    const r=await rpc('courier_ops_issues',{p_status:null}); if(r.error)throw r.error;
    state.issues=Array.isArray(r.data)?r.data:[];
  }
  async function loadNotifications(){
    const r=await rpc('courier_ops_notifications',{p_limit:50});if(r.error)throw r.error;
    state.notifications=Array.isArray(r.data)?r.data:[];
  }
  async function loadTripHistory(id){
    const r=await rpc('courier_ops_trip_history',{p_trip_id:Number(id)});if(r.error)throw r.error;
    const rows=(Array.isArray(r.data)?r.data:[]).map(x=>'<article class="cp-card" style="margin:8px 0"><b>'+esc(x.action==='created'?'إنشاء سجل الحالة':'تحديث حالة المشوار')+'</b><div class="cp-sub">'+esc(x.changed_at)+' · '+esc(x.actor_name||'النظام')+'</div><div>من: '+esc(labels[x.old_values?.operational_status]||x.old_values?.operational_status||'—')+' ← إلى: '+esc(labels[x.new_values?.operational_status]||x.new_values?.operational_status||'—')+'</div><div class="cp-sub">الأولوية: '+esc(x.new_values?.priority??'—')+' · ترتيب المسار: '+esc(x.new_values?.route_order??'—')+'</div></article>').join('');
    const c=$('cop-content');if(c)c.innerHTML='<h3>سجل تغييرات المشوار</h3><button type="button" class="cp-btn" data-cop="tab" data-tab="route">رجوع</button>'+(rows||'<div class="cp-empty">لا يوجد سجل تغييرات حتى الآن.</div>');
  }
  function notificationsView(){
    const rows=state.notifications.map(n=>'<article class="cp-card" style="margin:8px 0;opacity:'+(n.read?'0.68':'1')+'"><div style="display:flex;justify-content:space-between;gap:8px"><b>'+esc(n.title||'إشعار')+'</b><small>'+esc(n.created_at||'')+'</small></div><p>'+esc(n.body||'')+'</p>'+(n.read?'':'<button type="button" class="cp-btn cp-sm" data-cop="notification-read" data-id="'+n.id+'">تحديد كمقروء</button>')+'</article>').join('');
    return '<p class="cp-sub">إشعارات حسابك، مرتبة من الأحدث.</p>'+(rows||'<div class="cp-empty">لا توجد إشعارات.</div>');
  }
  function localDay(d) { return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function dayOffset(n) { const d=new Date(); d.setDate(d.getDate()+n); return localDay(d); }
  async function loadLedger() {
    if (!isCourier()) { state.ledger = []; return; }
    state.ledgerFrom=state.ledgerFrom||dayOffset(-62); state.ledgerTo=state.ledgerTo||dayOffset(0);
    if(state.ledgerFrom>state.ledgerTo) throw new Error('تاريخ البداية لازم يكون قبل تاريخ النهاية');
    const r=await rpc('courier_ops_ledger',{p_from:state.ledgerFrom,p_to:state.ledgerTo}); if(r.error)throw r.error;
    state.ledger=Array.isArray(r.data)?r.data:[];
  }
  function routeView() {
    const routeStops=[...new Set(state.items.filter(x=>x.address&&String(x.address).trim()).map(x=>String(x.address).trim()))].slice(0,11);
    const routeUrl=routeStops.length>=2
      ? 'https://www.google.com/maps/dir/?api=1&origin='+encodeURIComponent(routeStops[0])+
        '&destination='+encodeURIComponent(routeStops[routeStops.length-1])+
        (routeStops.length>2?'&waypoints='+encodeURIComponent(routeStops.slice(1,-1).join('|')):'')+
        '&travelmode=driving'
      : '';
    const mapAction=routeUrl
      ? '<div class="cp-card" style="margin:8px 0;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><b>خريطة خط السير بالكامل</b><div class="cp-sub">فتح '+routeStops.length+' محطات حسب الترتيب الحالي على Google Maps</div></div><a class="cp-btn cp-go" target="_blank" rel="noopener noreferrer" href="'+esc(routeUrl)+'">فتح خط السير على الخريطة</a></div>'
      : '';
    const rows=state.items.map((x,i)=>'<article class="cp-card" style="margin:8px 0"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><div><b>'+esc(x.client_name||'بدون اسم')+'</b><div class="cp-sub">معاملة '+esc(x.transaction_id)+' · '+esc(x.trip_day)+' · '+(x.kind==='pickup'?'استلام':'تسليم')+'</div><div class="cp-sub">'+esc(x.address||'لا يوجد عنوان')+'</div></div><b>'+money(x.fee)+'</b></div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px"><label class="cp-sub">الحالة التشغيلية <select data-cop-status="'+x.id+'" class="cp-field">'+statusOptions.replace('value="'+x.operational_status+'"','value="'+x.operational_status+'" selected')+'</select></label><label class="cp-sub">الأولوية <select data-cop-priority="'+x.id+'" class="cp-field">'+[1,2,3,4,5].map(n=>'<option value="'+n+'" '+(Number(x.priority)===n?'selected':'')+'>'+({1:'عاجل',2:'عالية',3:'عادية',4:'منخفضة',5:'عند التفرغ'}[n])+'</option>').join('')+'</select></label><button type="button" class="cp-btn cp-sm" data-cop="up" data-id="'+x.id+'" '+(i===0?'disabled':'')+'>↑ لأعلى</button><button type="button" class="cp-btn cp-sm" data-cop="down" data-id="'+x.id+'" '+(i===state.items.length-1?'disabled':'')+'>↓ لأسفل</button><button type="button" class="cp-btn cp-sm" data-cop="report" data-id="'+x.id+'">إبلاغ عن مشكلة</button><button type="button" class="cp-btn cp-sm" data-cop="history" data-id="'+x.id+'">سجل التغييرات</button>'+(x.address?'<a class="cp-btn cp-sm" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(x.address)+'">فتح الخريطة</a>':'')+'</div></article>').join('');
    return '<p class="cp-sub">الحالة التشغيلية مستقلة عن التأكيد المالي. تحديث الحالة لا يؤكد المشوار ولا يضيفه للعمولة.</p>'+mapAction+(rows||'<div class="cp-empty">لا توجد مشاوير مسجلة في الفترة الحالية.</div>');
  }
  function issuesView() {
    const rows=state.issues.map(x=>{
      const isResolving = state.resolvingIssueId === Number(x.id);
      const resolveBox = isResolving
        ? '<form class="cp-resolve-form" data-id="'+x.id+'" style="margin-top:8px"><input class="cp-field" name="resolution" maxlength="500" placeholder="اكتب ملخص الحل (اختياري)…" style="margin-bottom:6px"><div style="display:flex;gap:6px"><button type="submit" class="cp-btn cp-go cp-sm">تأكيد الحل</button><button type="button" class="cp-btn cp-sm" data-cop="cancel-resolve">إلغاء</button></div></form>'
        : '';
      return '<article class="cp-card" style="margin:8px 0"><b>'+esc(issueLabels[x.issue_type]||x.issue_type)+'</b><div class="cp-sub">معاملة '+esc(x.transaction_id)+' · '+esc(x.courier)+' · '+esc(x.created_at)+'</div><p>'+esc(x.details)+'</p><span class="cp-tag '+(x.status==='resolved'?'ok':'wt')+'">'+({open:'مفتوح',in_progress:'جاري الحل',resolved:'تم الحل'}[x.status]||x.status)+'</span>'+(isStaff()?'<div class="cp-sub">المسؤول: '+esc(x.assignee_name||'غير معين')+'</div><label class="cp-sub">تعيين المسؤول<select class="cp-field" data-cop-assign="'+x.id+'"><option value="">بدون مسؤول</option>'+state.staffUsers.map(u=>'<option value="'+u.id+'" '+(x.assigned_to===u.id?'selected':'')+'>'+esc(u.full_name)+'</option>').join('')+'</select></label><div style="display:flex;gap:6px;margin-top:8px"><button type="button" class="cp-btn cp-sm" data-cop="issue-state" data-id="'+x.id+'" data-state="in_progress">بدء المتابعة</button><button type="button" class="cp-btn cp-sm" data-cop="ask-resolve" data-id="'+x.id+'">تم الحل</button></div>'+resolveBox:'')+(x.resolution?'<p class="cp-sub">الإجراء: '+esc(x.resolution)+'</p>':'')+'</article>';
    }).join('');
    return (isStaff()?'<p class="cp-sub">بلاغات الفريق مع تعيين المسؤول ومتابعة الحالة.</p>':'<p class="cp-sub">تابع حالة البلاغات التي أرسلتها.</p>')+(rows||'<div class="cp-empty">لا توجد بلاغات.</div>');
  }
  function ledgerView() {
    const fmtDate = v => v ? new Date(v).toLocaleString('ar-EG') : '—';
    const rows=state.ledger.map(x=>{
      const closeState=x.included_in_closing?(x.paid_at?'تم تسجيل الصرف':'دخل التقفيل'):(x.released_at?'أُعيد فتح التقفيل':'لم يدخل التقفيل');
      return '<tr><td>'+esc(x.day)+'</td><td>'+esc(x.transaction_id)+'</td><td>'+esc(typeLabels[x.type]||x.type)+'</td><td>'+money(x.amount)+'</td><td>'+(x.confirmed?'مؤكد':'معلق')+'</td><td>'+esc(fmtDate(x.confirmed_at))+'</td><td>'+esc(closeState)+'</td><td>'+esc(x.paid_at?fmtDate(x.paid_at):'—')+'</td></tr>';
    }).join('');
    const total=state.ledger.filter(x=>x.confirmed).reduce((a,x)=>a+Number(x.amount||0),0);
    const closed=state.ledger.filter(x=>x.confirmed&&x.included_in_closing).reduce((a,x)=>a+Number(x.amount||0),0);
    const paid=state.ledger.filter(x=>x.confirmed&&x.included_in_closing&&x.paid_at).reduce((a,x)=>a+Number(x.amount||0),0);
    const unpaid=Math.max(0,closed-paid);
    return '<form id="cop-ledger-range" class="cp-card" style="display:flex;gap:8px;flex-wrap:wrap;align-items:end"><label class="cp-sub" style="flex:1;min-width:125px">من تاريخ<input class="cp-field" type="date" name="from" value="'+esc(state.ledgerFrom)+'" required></label><label class="cp-sub" style="flex:1;min-width:125px">إلى تاريخ<input class="cp-field" type="date" name="to" value="'+esc(state.ledgerTo)+'" required></label><button class="cp-btn cp-go" type="submit">عرض الفترة</button></form><p class="cp-sub">اختر أي فترة تاريخية لعرض كشف حسابك.</p><div class="cp-grid"><div class="cp-kpi"><small>إجمالي المؤكد</small><b>'+money(total)+'</b></div><div class="cp-kpi"><small>دخل التقفيل</small><b>'+money(closed)+'</b></div><div class="cp-kpi"><small>تم تسجيل صرفه</small><b>'+money(paid)+'</b></div><div class="cp-kpi"><small>دخل التقفيل ولم يُصرف</small><b>'+money(unpaid)+'</b></div><div class="cp-kpi"><small>مؤكد لم يدخل التقفيل</small><b>'+money(total-closed)+'</b></div></div><div style="overflow:auto"><table class="cp-table" style="width:100%;font-size:11px"><thead><tr><th>التاريخ</th><th>المعاملة</th><th>النوع</th><th>العمولة</th><th>التأكيد</th><th>تاريخ التأكيد</th><th>حالة التقفيل</th><th>تاريخ الصرف</th></tr></thead><tbody>'+rows+'</tbody></table></div><p class="cp-sub">«تم تسجيل صرفه» تعني أن الإدارة سجلت الصرف في النظام، وليست إثباتًا بنكيًا.</p>';
  }
  /* المعتاد لكل مرحلة (وسيط مرجّح بعدد التذاكر) من آخر 30 يوم؛ بيتخزن 10 دقايق، ولو مفيش بيانات كفاية (أقل من 5) ما بنتوقعش */
  var stageMedCache = { at: 0, med: null };
  async function ensureStageMedians() {
    if (Date.now() - stageMedCache.at < 600000) return stageMedCache.med;
    stageMedCache.at = Date.now();
    try {
      const c = (typeof sbClient !== 'undefined') ? sbClient : null;
      if (!c || window.__role !== 'manager') return (stageMedCache.med = null);
      const r = await c.rpc('courier_stage_timings', { p_days: 30 });
      if (r.error || !r.data) return (stageMedCache.med = null);
      const acc = {};
      (r.data.couriers || []).forEach(cr => Object.keys(cr.stages || {}).forEach(k => {
        const s = cr.stages[k], n = Number(s.n || 0);
        const a = acc[k] || (acc[k] = { w: 0, n: 0 });
        a.w += Number(s.median_min || 0) * n; a.n += n;
      }));
      const out = {};
      Object.keys(acc).forEach(k => { if (acc[k].n >= 5) out[k] = acc[k].w / acc[k].n; });
      return (stageMedCache.med = Object.keys(out).length ? out : null);
    } catch (e) { return (stageMedCache.med = null); }
  }

  async function render() {
    const c=$('cop-content'); if(!c)return; tabButtons(); c.innerHTML='<div class="cp-empty">جاري تحميل البيانات…</div>';
    try {
      if(state.tab==='route'){await loadRoute();c.innerHTML=routeView();}
      else if(state.tab==='issues'){await loadIssues();if(isStaff()){const u=await rpc('courier_ops_staff_users');if(u.error)throw u.error;state.staffUsers=Array.isArray(u.data)?rData(u):[];}c.innerHTML=issuesView();}
      else if(state.tab==='notifications'){await loadNotifications();c.innerHTML=notificationsView();}
      else if(isCourier()){await loadLedger();c.innerHTML=ledgerView();}
      else {state.tab='route';await loadRoute();c.innerHTML=routeView();}
    } catch(e) { c.innerHTML='<div class="cp-empty">تعذر تحميل البيانات. تأكد من تشغيل sql/courier-operations.sql بعد ملفات بوابة المندوب والتقفيل.</div>'; }
    tabButtons();
  }
  function rData(u){ return Array.isArray(u && u.data) ? u.data : []; }
  function reportForm(id) {
    const c=$('cop-content'); if(!c)return;
    c.innerHTML='<h3>إبلاغ عن مشكلة في المشوار</h3><form id="cop-report-form" data-id="'+id+'" class="cp-card"><label>نوع المشكلة<select name="type" class="cp-field"><option value="customer_unavailable">العميل غير متاح</option><option value="wrong_address">عنوان خطأ</option><option value="incorrect_fee">رسوم غير صحيحة</option><option value="pickup_problem">مشكلة في الاستلام</option><option value="other">أخرى</option></select></label><label style="display:block;margin-top:10px">التفاصيل<textarea name="details" class="cp-field" required minlength="3" maxlength="1000"></textarea></label><div class="cp-btns"><button class="cp-btn cp-go">إرسال البلاغ</button><button type="button" class="cp-btn" data-cop="tab" data-tab="route">رجوع</button></div></form>';
  }
  async function open() { shell(); state.tab='route'; await render(); }
  async function onClick(e) {
    const b=e.target.closest('[data-cop],[data-cop-open]'); if(!b)return;
    if(b.hasAttribute('data-cop-open')){e.preventDefault();return open();}
    const a=b.dataset.cop;
    if(a==='close'){const r=$('courier-ops-modal');if(r)r.style.display='none';return;}
    if(a==='tab'){state.tab=b.dataset.tab;return render();}
    if(a==='report')return reportForm(b.dataset.id);
    if(a==='up'||a==='down'){
      if(state.busy)return;
      const id=Number(b.dataset.id);
      const next=state.items.slice();
      const i=next.findIndex(z=>Number(z.id)===id), j=i+(a==='up'?-1:1);
      if(i<0||j<0||j>=next.length)return;
      [next[i],next[j]]=[next[j],next[i]];
      state.busy=true;
      try {
        const ids=next.map(x=>Number(x.id));
        const q=await rpc('courier_ops_reorder',{p_trip_ids:ids});
        if(q.error){
          const [r1,r2]=await Promise.all([
            rpc('courier_ops_update',{p_trip_id:Number(next[i].id),p_route_order:i+1,p_status:null,p_priority:null,p_note:null}),
            rpc('courier_ops_update',{p_trip_id:Number(next[j].id),p_route_order:j+1,p_status:null,p_priority:null,p_note:null})
          ]);
          if(r1.error)throw r1.error;
          if(r2.error)throw r2.error;
        }
      } catch(err) {
        toast(err.message||'تعذر تغيير الترتيب',true);
      } finally {
        state.busy=false;
      }
      return render();
    }
    if(a==='paid')return paymentForm(b.dataset.id);
    if(a==='history'){shell();state.tab='route';await loadTripHistory(b.dataset.id);return;}
    if(a==='notification-read'){const r=await rpc('courier_ops_notification_read',{p_notification_id:Number(b.dataset.id)});if(r.error)return toast(r.error.message,true);await loadNotifications();return render();}
    if(a==='ask-resolve'){
      state.resolvingIssueId=Number(b.dataset.id);
      if($('courier-ops-modal')&&$('courier-ops-modal').style.display==='block'&&state.tab==='issues'){
        const c=$('cop-content');if(c)c.innerHTML=issuesView();
      } else {
        shell();state.tab='issues';await render();
      }
      return;
    }
    if(a==='cancel-resolve'){
      state.resolvingIssueId=null;
      const c=$('cop-content');if(c)c.innerHTML=issuesView();
      return;
    }
    if(a==='issue-state'){
      const r=await rpc('courier_ops_issue_update',{p_issue_id:Number(b.dataset.id),p_status:b.dataset.state,p_resolution:null});
      if(r.error)return toast(r.error.message,true);toast('تم تحديث حالة البلاغ');if(isStaff()&&(!$('courier-ops-modal')||$('courier-ops-modal').style.display==='none'))return loadManagerPanel(true);return render();
    }
  }
  async function onChange(e) {
    const el=e.target;
    if(el.matches('[data-cop-assign]')){const r=await rpc('courier_ops_issue_assign',{p_issue_id:Number(el.dataset.copAssign),p_assigned_to:el.value||null});if(r.error){toast(r.error.message,true);return;}toast('تم تحديث المسؤول');return render();}
    if(el.matches('[data-cop-status],[data-cop-priority]')){
      const id=Number(el.dataset.copStatus||el.dataset.copPriority),x=state.items.find(z=>Number(z.id)===id);if(!x)return;
      const args={p_trip_id:id,p_status:el.dataset.copStatus?el.value:null,p_priority:el.dataset.copPriority?Number(el.value):null,p_route_order:null,p_note:null};
      const r=await rpc('courier_ops_update',args);if(r.error){toast(r.error.message,true);return;}toast('تم حفظ التحديث');if(isStaff()&&(!$('courier-ops-modal')||$('courier-ops-modal').style.display==='none'))return loadManagerPanel(true);await render();
    }
  }
  async function onSubmit(e) {
    if(e.target.classList && e.target.classList.contains('cp-resolve-form')){
      e.preventDefault();
      const f=e.target, id=Number(f.dataset.id), resolution=(f.elements.resolution.value||'').trim()||null;
      const r=await rpc('courier_ops_issue_update',{p_issue_id:id,p_status:'resolved',p_resolution:resolution});
      if(r.error)return toast(r.error.message,true);
      state.resolvingIssueId=null;
      toast('تم حل البلاغ');
      await loadManagerPanel(true);
      if($('courier-ops-modal')&&$('courier-ops-modal').style.display==='block')return render();
      return;
    }
    if(e.target.id==='cop-ledger-range'){
      e.preventDefault();state.ledgerFrom=e.target.elements.from.value;state.ledgerTo=e.target.elements.to.value;
      if(!state.ledgerFrom||!state.ledgerTo||state.ledgerFrom>state.ledgerTo)return toast('راجع تاريخ البداية والنهاية',true);
      return render();
    }
    if(e.target.id==='cop-payment-form'){
      e.preventDefault();const f=e.target;
      const r=await rpc('courier_ops_mark_paid',{p_closing_id:Number(f.dataset.id),p_method:f.elements.method.value,p_reference:f.elements.reference.value.trim()||null,p_note:f.elements.note.value.trim()||null});
      if(r.error)return toast(r.error.message,true);
      toast('تم تسجيل الصرف وبياناته');const m=$('courier-ops-modal');if(m)m.style.display='none';state.managerBusy=false;return loadManagerPanel(true);
    }
    if(e.target.id!=='cop-report-form')return;e.preventDefault();
    const f=e.target,r=await rpc('courier_ops_report',{p_trip_id:Number(f.dataset.id),p_issue_type:f.elements.type.value,p_details:f.elements.details.value.trim()});
    if(r.error)return toast(r.error.message,true);toast('تم إرسال البلاغ للإدارة');state.tab='issues';return render();
  }

  /* ---------- إنشاء عنصر اللوحة والرادار مرة واحدة في الذاكرة ---------- */
  function ensurePanelDom() {
    if (panelBox && radarBox && contentBox) return;
    if (typeof window.__ensureCourierPortalCss === 'function') window.__ensureCourierPortalCss();
    panelBox = document.createElement('section');
    panelBox.id = 'cop-manager-panel';
    panelBox.className = 'card p-4 space-y-3';
    panelBox.innerHTML =
      '<div id="cop-radar"></div>' +
      '<details id="cop-ops-accordion" style="border:1px solid var(--r-line,rgba(148,163,184,.2));border-radius:14px;padding:10px 14px;background:var(--r-card-2,rgba(255,255,255,.04))">' +
        '<summary style="cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:8px;font-weight:700;font-size:13.5px">' +
          '<span>متابعة تشغيل المناديب والبلاغات والتقفيلات (اضغط للفتح / الطي)</span>' +
          '<span style="display:inline-flex;align-items:center;gap:6px">' +
            '<button type="button" class="rounded-lg bg-slate-600 text-white px-2.5 py-1 text-xs font-bold" id="cop-manager-notifications">الإشعارات</button>' +
            '<button type="button" class="rounded-lg bg-emerald-600 text-white px-2.5 py-1 text-xs font-bold" id="cop-manager-refresh">تحديث</button>' +
          '</span>' +
        '</summary>' +
        '<div id="cop-manager-content" class="text-xs text-slate-500" style="margin-top:10px;padding-top:10px;border-top:1px solid var(--r-line,rgba(148,163,184,.15))">' + (state.managerHtml || 'جاري تحميل البلاغات والتقفيلات…') + '</div>' +
      '</details>';
    radarBox = panelBox.querySelector('#cop-radar');
    contentBox = panelBox.querySelector('#cop-manager-content');
    const refreshBtn = panelBox.querySelector('#cop-manager-refresh');
    const notifBtn = panelBox.querySelector('#cop-manager-notifications');
    if (refreshBtn) refreshBtn.onclick = () => { loadV12OfficeRadar(radarBox, true); loadManagerPanel(true); };
    if (notifBtn) notifBtn.onclick = async () => { shell(); state.tab = 'notifications'; await render(); };
    if (radarBox) radarBox.onclick = radarClick;
  }

  /* تثبيت اللوحة في أول تاب المناديب بدون أي استدعاء لقاعدة البيانات وبدون حلقة مفرغة */
  function syncPanelPosition() {
    if (isMounting || !isStaff()) return false;
    const liveSlot = $('ah-pane-live-radar');
    const radarTab = $('tab-radar');
    if (panelBox && liveSlot && panelBox.parentNode === liveSlot) return false;
    if (radarTab && !radarTab.classList.contains('hidden')) return false;
    const root = $('tab-couriers');
    if (!root || root.classList.contains('hidden')) return false;
    ensurePanelDom();
    const topBar = $('cp-couriers-top-bar');
    const desiredNext = (topBar && topBar.parentNode === root) ? topBar.nextSibling : root.firstChild;
    if (panelBox.parentNode === root && panelBox === desiredNext) return true;
    isMounting = true;
    try {
      root.insertBefore(panelBox, desiredNext);
    } finally {
      isMounting = false;
    }
    return true;
  }

  /* تركيب لوحة الرادار مباشرة داخل أي حاوية (مركز العمليات) بدون الاعتماد على تبديل التابات */
  function mountInto(slot, force) {
    if (!slot || !isStaff()) return false;
    ensurePanelDom();
    isMounting = true;
    try {
      if (panelBox.parentNode !== slot) { slot.innerHTML = ''; slot.appendChild(panelBox); }
    } finally { isMounting = false; }
    panelBox.classList.remove('hidden');
    panelBox.style.display = 'block';
    startRadarTimer();
    const empty = !radarBox.innerHTML.trim();
    loadV12OfficeRadar(radarBox, !!force || empty || state.radarFailed);
    const now = Date.now();
    if (force || !state.managerLoadedAt || state.managerFailed || (now - state.managerLoadedAt >= MIN_REFRESH_MS)) loadManagerPanel(!!force);
    return true;
  }
  window.__copMountRadarInto = mountInto;

  function bindCouriersObserver(root) {
    if (!root || !window.MutationObserver || observedRoot === root) return;
    if (couriersObs) { try { couriersObs.disconnect(); } catch (e) {} }
    observedRoot = root;
    try {
      couriersObs = new MutationObserver(() => {
        if (isMounting) return;
        syncPanelPosition();
      });
      couriersObs.observe(root, { childList: true });
    } catch (e) {}
  }

  function injectManagerPanel(forceLoad) {
    if (!isStaff()) return;
    const root = $('tab-couriers');
    if (!root) return;
    bindCouriersObserver(root);
    if (root.classList.contains('hidden')) {
      stopRadarTimer();
      return;
    }
    syncPanelPosition();
    startRadarTimer();
    const now = Date.now();
    if (forceLoad || !state.radarLoadedAt || (now - state.radarLoadedAt >= MIN_REFRESH_MS)) {
      loadV12OfficeRadar(radarBox, !!forceLoad);
    }
    if (forceLoad || !state.managerLoadedAt || (!state.managerFailed && (now - state.managerLoadedAt >= MIN_REFRESH_MS))) {
      loadManagerPanel(!!forceLoad);
    }
  }

  async function loadManagerPanel(force) {
    ensurePanelDom();
    const c = contentBox || $('cop-manager-content');
    if (!c || state.managerBusy) return;
    const now = Date.now();
    if (!force && state.managerLoadedAt && (now - state.managerLoadedAt < MIN_REFRESH_MS)) {
      if (state.managerHtml) c.innerHTML = state.managerHtml;
      return;
    }
    state.managerBusy = true;
    state.managerLoadedAt = now;
    if (!state.managerHtml) c.textContent = 'جاري التحميل…';
    try{
      const cairoToday=new Date().toLocaleDateString('en-CA',{timeZone:'Africa/Cairo'}); const monthStart=cairoToday.slice(0,8)+'01'; const [ir,cr,tr]=await Promise.all([rpc('courier_ops_issues',{p_status:null}),rpc('courier_ops_closings',{p_from:null,p_to:null}),rpc('courier_ops_items',{p_from:monthStart,p_to:null})]);
      if(ir.error)throw ir.error;if(cr.error)throw cr.error;if(tr.error)throw tr.error;
      state.issues=ir.data||[];state.closings=cr.data||[];
      state.items=(tr.data||[]).filter(x=>x&&x.client_name&&String(x.client_name).trim()&&String(x.client_name).trim()!=='بدون اسم');
      const html='<b>حالات المشاوير التشغيلية</b>'+state.items.slice(0,12).map(x=>'<div class="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-slate-200 dark:border-slate-700"><span>'+esc(x.courier)+' · '+esc(x.transaction_id)+' · '+esc(x.client_name||'بدون اسم')+'</span><div class="flex items-center gap-2"><button type="button" class="text-emerald-600 font-bold" data-cop="history" data-id="'+x.id+'">السجل</button><select class="field !w-auto !py-1 text-xs" data-cop-status="'+x.id+'">'+Object.keys(labels).map(k=>'<option value="'+k+'" '+(x.operational_status===k?'selected':'')+'>'+labels[k]+'</option>').join('')+'</select></div></div>').join('')+'<hr><b>البلاغات المفتوحة: '+state.issues.filter(x=>x.status!=='resolved').length+'</b>'+state.issues.slice(0,8).map(x=>'<div class="border-b border-slate-200 dark:border-slate-700 py-2"><b>'+esc(issueLabels[x.issue_type]||x.issue_type)+'</b> · '+esc(x.courier)+' · '+esc(x.transaction_id)+'<div>'+esc(x.details)+'</div><span>'+({open:'مفتوح',in_progress:'جاري الحل',resolved:'تم الحل'}[x.status])+'</span><button type="button" class="text-emerald-600 font-bold mr-2" data-cop="ask-resolve" data-id="'+x.id+'">حل البلاغ</button></div>').join('')+'<hr><b>التقفيلات الأخيرة</b>'+state.closings.slice(0,8).map(x=>'<div class="flex justify-between gap-2 py-2 border-b border-slate-200 dark:border-slate-700"><span>'+esc(x.courier)+' · '+esc(x.period_start)+' → '+esc(x.period_end)+' · '+money(x.total)+' · '+(x.paid_at?'تم الصرف':'لم يُسجل الصرف')+'</span>'+(x.paid_method?'<small> · '+esc(({cash:'نقدي',bank_transfer:'تحويل بنكي',wallet:'محفظة إلكترونية',other:'أخرى'}[x.paid_method]||x.paid_method))+'</small>':'')+(x.paid_reference?'<small> · مرجع: '+esc(x.paid_reference)+'</small>':'')+(x.paid_note?'<small> · '+esc(x.paid_note)+'</small>':'')+(isManager()?'<button type="button" class="text-emerald-600 font-bold" data-cop="paid" data-id="'+x.id+'" '+(x.paid_at?'disabled':'')+'>تسجيل الصرف</button>':'')+'</div>').join('');
      state.managerHtml=html;
      state.managerFailed=false;
      state.managerLoadedAt=Date.now();
      c.innerHTML=html;
    }catch(e){
      state.managerFailed=true;
      state.managerLoadedAt=Date.now();
      c.textContent='تعذر تحميل متابعة التشغيل. '+(e.message||'');
    }
    finally{state.managerBusy=false;}
  }

  /* ---------- رادار المكتب الحي والموافقات الفورية (v12) ---------- */
  async function loadV12OfficeRadar(container, force) {
    const target = container || radarBox || $('cop-radar');
    if (!target || state.radarBusy) return;
    const now = Date.now();
    if (!force && state.radarLoadedAt && (now - state.radarLoadedAt < MIN_REFRESH_MS)) return;
    const act = document.activeElement;
    if (!force && act && target.contains(act) && act.tagName === 'INPUT') return; /* المدير بيكتب — ما نقطعوش */
    state.radarBusy = true;
    state.radarLoadedAt = now;
    try {
      if (typeof window.__ensureCourierPortalCss === 'function') window.__ensureCourierPortalCss();
      ensureRadarSmartCss();
      const r = await Promise.race([
        sbClient.rpc('courier_v12_office_radar'),
        new Promise((_, rej) => setTimeout(() => rej(new Error('انتهت مهلة الاتصال بالسيرفر (20 ثانية). اتأكد من النت وجرّب تاني.')), 20000))
      ]);
      if (!r || r.error || !r.data) throw new Error((r && r.error && r.error.message) || 'مفيش بيانات راجعة من السيرفر');
      const d = r.data;
      const couriers = Array.isArray(d.couriers) ? d.couriers : [];
      const pending = Array.isArray(d.pending_requests) ? d.pending_requests : [];
      /* بيانات الرحلات محدودة بفترة RPC، وبيانات تيكتات الاستلام من RPC إضافي اختياري لحد تشغيل SQL المقترح. */
      let radarTickets = [];
      let opsItems = Array.isArray(state.items) ? state.items : [];
      const radarMonthStart = new Date(); radarMonthStart.setDate(1); radarMonthStart.setHours(0,0,0,0);
      const radarMonthStartDate = [radarMonthStart.getFullYear(), String(radarMonthStart.getMonth()+1).padStart(2,'0'), '01'].join('-');
      let ptMetaById = {};
      let ptMetaBySd = {};
      const normCourier = s => String(s || '').replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim().toLowerCase();
      try {
        const needAvatars = !state.avatarsLoadedAt || (Date.now() - state.avatarsLoadedAt > 1800000);
        const jobs = [
          rpc('courier_ops_items', { p_from: radarMonthStartDate, p_to: null }),
          rpc('courier_radar_active_tickets', {}),
          sbClient.from('pickup_tickets').select('id,sd_request_id,zone,address,service_name,slot_pref,collect_amount,payment_status,status').in('status', ['open', 'with_courier', 'converted']).order('created_at', { ascending: false }).limit(120)
        ];
        if (needAvatars) {
          jobs.push(sbClient.from('couriers').select('id,name,user_id').eq('active', true));
          jobs.push(sbClient.from('profiles').select('id,full_name,avatar_path'));
        }
        const resAll = await Promise.all(jobs);
        const ir = resAll[0], tr = resAll[1], ptr = resAll[2];
        if (ir && !ir.error && Array.isArray(ir.data)) { opsItems = ir.data; state.items = ir.data; }
        if (tr && !tr.error && Array.isArray(tr.data)) radarTickets = tr.data;
        if (ptr && !ptr.error && Array.isArray(ptr.data)) {
          ptr.data.forEach(p => {
            if (p && p.id != null) ptMetaById[Number(p.id)] = p;
            if (p && p.sd_request_id) ptMetaBySd[String(p.sd_request_id).trim().toUpperCase()] = p;
          });
        }
        if (needAvatars && resAll[3] && !resAll[3].error && Array.isArray(resAll[3].data)) {
          const cRows = resAll[3].data;
          const pRows = (resAll[4] && !resAll[4].error && Array.isArray(resAll[4].data)) ? resAll[4].data : [];
          const profByUid = {}, profByName = {};
          pRows.forEach(p => {
            if (p && p.id) profByUid[String(p.id)] = p;
            if (p && p.full_name) profByName[normCourier(p.full_name)] = p;
          });
          const pathByCid = {}, pathByName = {}, paths = [];
          cRows.forEach(cr => {
            const p = (cr.user_id && profByUid[String(cr.user_id)]) || profByName[normCourier(cr.name)];
            if (p && p.avatar_path) {
              pathByCid[Number(cr.id)] = p.avatar_path;
              pathByName[normCourier(cr.name)] = p.avatar_path;
              if (paths.indexOf(p.avatar_path) === -1) paths.push(p.avatar_path);
            }
          });
          const existingUrls = (typeof avatarUrls !== 'undefined' && avatarUrls) ? avatarUrls : (window.avatarUrls || {});
          const missing = paths.filter(pt => !existingUrls[pt]);
          const signedMap = Object.assign({}, existingUrls);
          if (missing.length) {
            try {
              const sr = await sbClient.storage.from('avatars').createSignedUrls(missing, 43200);
              if (sr && !sr.error && Array.isArray(sr.data)) {
                sr.data.forEach(x => { if (x && x.path && x.signedUrl) signedMap[x.path] = x.signedUrl; });
              }
            } catch (e2) { /* ignore avatar error */ }
          }
          state.avatarById = {};
          state.avatarByName = {};
          Object.keys(pathByCid).forEach(cid => { if (signedMap[pathByCid[cid]]) state.avatarById[cid] = signedMap[pathByCid[cid]]; });
          Object.keys(pathByName).forEach(nm => { if (signedMap[pathByName[nm]]) state.avatarByName[nm] = signedMap[pathByName[nm]]; });
          state.avatarsLoadedAt = Date.now();
        }
      } catch (e) { /* نكمل بالبيانات المتاحة */ }

      /* استبعاد أي بيانات قديمة رجعت من كاش محلي، مع إثراء العناوين من allRequestLines لتفادي «بدون منطقة» */
      opsItems = opsItems.filter(x => { const d = x && x.trip_day ? new Date(x.trip_day).getTime() : NaN; return !Number.isFinite(d) || d >= radarMonthStart.getTime(); });
      const rlAddrByTx = {}, rlSvcByTx = {};
      const allLines = (typeof allRequestLines !== 'undefined' && Array.isArray(allRequestLines)) ? allRequestLines : (Array.isArray(window.allRequestLines) ? window.allRequestLines : []);
      allLines.forEach(l => {
        if (!l || !l.transaction_id) return;
        const k = String(l.transaction_id).trim().toUpperCase();
        if (l.address && !rlAddrByTx[k]) rlAddrByTx[k] = String(l.address).trim();
        if (l.service && !rlSvcByTx[k]) rlSvcByTx[k] = String(l.service).trim();
      });
      state.items = opsItems;
      /* اسم العميل لكل معاملة */
      const nameByTx = {};
      opsItems.forEach(x => { if (x && x.transaction_id && x.client_name) nameByTx[x.transaction_id] = String(x.client_name).trim(); });
      const statusText = {
        new:'جديد', converted:'المعاملة اتعملت — تأكيد فقط', accepted:'تم قبول التيكت', call_attempt:'تم الاتصال', collecting:'جاري الاستلام', collected:'تم الاستلام',
        on_the_way:'في الطريق', waiting:'وصل عند العميل', arrived:'وصل عند العميل',
        reschedule_pending:'طلب تأجيل', postponed:'مؤجل', trip_confirmed:'تم تأكيد المشوار', cancelled:'ملغي',
        papers_received:'استلم الأوراق'
      };
      const tripDayByTx = new Map(opsItems.filter(x => x && x.transaction_id).map(x => [String(x.transaction_id).toUpperCase(), x.trip_day]));
      const monthStartMs = radarMonthStart.getTime();
      const ticketRows = radarTickets.filter(t => {
        const tx = String(t.transaction_id || t.sd_request_id || '').toUpperCase();
        const linkedTripDay = tripDayByTx.get(tx);
        const ticketDate = linkedTripDay || t.created_at;
        const stamp = ticketDate ? new Date(ticketDate).getTime() : NaN;
        return !Number.isFinite(stamp) || stamp >= monthStartMs;
      }).map(t => {
        const meta = ptMetaById[Number(t.ticket_id)] || ptMetaBySd[String(t.sd_request_id || '').trim().toUpperCase()] || {};
        const txKey = String(t.transaction_id || t.sd_request_id || '').trim().toUpperCase();
        return {
          ticket_id:Number(t.ticket_id), courier_id:Number(t.courier_id), courier_name:t.courier_name,
          client_name:t.client_name, transaction_id:t.transaction_id || t.sd_request_id,
          zone:t.zone || meta.zone || '',
          address:t.address || meta.address || meta.zone || rlAddrByTx[txKey] || '',
          service_name:meta.service_name || rlSvcByTx[txKey] || '',
          slot_pref:meta.slot_pref || '',
          collect_amount:Number(meta.collect_amount || 0),
          payment_status:meta.payment_status || '',
          kind:'pickup',
          status:t.radar_status || t.status_label || t.courier_step || t.status || 'new',
          at:t.status_at || t.courier_step_at || t.converted_at || t.created_at,
          reschedule_status:t.reschedule_status || '',
          proposed_slot:t.proposed_slot || '',
          reschedule_reason:t.reschedule_reason || '',
          action_history:Array.isArray(t.action_history) ? t.action_history : [],
          source:'ticket'
        };
      }).filter(t => t.status !== 'delivered' && t.status !== 'trip_confirmed' && t.status !== 'cancelled');
      const radarTodayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
      const radarDayAgoMs = Date.now() - 24 * 3600 * 1000;
      const tripRows = opsItems.filter(x => {
        if (!x || x.operational_status === 'delivered' || x.operational_status === 'confirmed' || x.operational_status === 'cancelled') return false;
        const isTodayTrip = String(x.trip_day || '').slice(0, 10) === radarTodayKey;
        const isMovingNow = ['on_the_way', 'waiting', 'arrived', 'collecting'].includes(x.operational_status) && (x.updated_at ? new Date(x.updated_at).getTime() >= radarDayAgoMs : false);
        return isTodayTrip || isMovingNow;
      }).map(x => {
        const txKey = String(x.transaction_id || '').trim().toUpperCase();
        return {
          courier_name:x.courier, client_name:x.client_name, transaction_id:x.transaction_id,
          zone:x.zone || '', address:x.address || rlAddrByTx[txKey] || '',
          service_name:x.service || rlSvcByTx[txKey] || '',
          kind:x.kind || x.type || 'delivery',
          trip_day:x.trip_day || '',
          status:x.operational_status || 'new', at:x.updated_at || x.trip_day, source:'trip'
        };
      });
      const allRadarRows = ticketRows.concat(tripRows).sort((a,b) => new Date(b.at || 0) - new Date(a.at || 0));
      const totalToday = couriers.reduce((s, c) => s + Number(c.total_today || 0), 0);
      const confToday = couriers.reduce((s, c) => s + Number(c.confirmed_today || 0), 0);
      const evLabels = {
        on_the_way: 'في الطريق', waiting: 'وصل عند العميل', break: 'في استراحة',
        resume: 'متاح', near_office: 'قرب من المكتب', handoff_req: 'طلب تحويل',
        reschedule_req: 'طلب تأجيل لبكرة', expense: 'مصروف طريق', swap_req: 'تبديل', cash_settle: 'تسوية كاش'
      };
      const I = {
        refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/>', bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0"/>',
        warn: '<path d="M12 3l10 18H2zM12 10v5M12 18h.01"/>', truck: '<path d="M2 6h12v10H2zM14 9h4l4 3.5V16h-8z"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>'
      };
      const svg = (n, z) => '<svg class="cpo-i" viewBox="0 0 24 24" style="width:' + (z || 16) + 'px;height:' + (z || 16) + 'px" aria-hidden="true">' + I[n] + '</svg>';
      const tm = at => { if (!at) return ''; const d = new Date(at); return isNaN(d) ? '' : d.toLocaleTimeString('ar-EG-u-nu-latn', { hour: 'numeric', minute: '2-digit' }); };
      const ago = at => { if (!at) return 'دلوقتي'; const stamp = new Date(at).getTime(); if (!Number.isFinite(stamp)) return 'وقت غير محدد'; const m = Math.round((Date.now() - stamp) / 60000); return m <= 0 ? 'دلوقتي' : m < 60 ? 'من ' + m + ' د' : 'من ' + Math.round(m / 60) + ' س'; };

      /* مربع «في الطريق»: يعرض فقط اللي فعلاً في الطريق دلوقتي — بمجرد ما المندوب يدوس «وصلت» أو يخلّص يتشال فوراً */
      const radarRowKey = (courierId, courierName, tx) => (courierId ? 'id:' + Number(courierId) : 'name:' + normCourier(courierName)) + '|tx:' + String(tx || '').trim().toUpperCase();
      const nonMovingKeys = new Set();
      radarTickets.forEach(t => {
        const st0 = t.radar_status || t.status_label || t.courier_step || t.status || '';
        if (st0 !== 'on_the_way') nonMovingKeys.add(radarRowKey(t.courier_id, t.courier_name, t.transaction_id || t.sd_request_id));
      });
      opsItems.forEach(x => {
        if (x && x.operational_status && x.operational_status !== 'on_the_way') {
          nonMovingKeys.add(radarRowKey(null, x.courier, x.transaction_id));
        }
      });
      const onWayRows = allRadarRows.filter(x => x.status === 'on_the_way');
      const knownOnWayRows = new Set(onWayRows.map(x => radarRowKey(x.courier_id, x.courier_name, x.transaction_id)));
      couriers.forEach(c => {
        const le = c.last_event || {};
        if (le.type !== 'on_the_way' || !le.tx) return;
        const kId = radarRowKey(c.id, c.name, le.tx);
        const kNm = radarRowKey(null, c.name, le.tx);
        if (knownOnWayRows.has(kId) || knownOnWayRows.has(kNm) || nonMovingKeys.has(kId) || nonMovingKeys.has(kNm)) return;
        onWayRows.push({ courier_id:Number(c.id), courier_name:c.name, client_name:nameByTx[le.tx] || '', transaction_id:le.tx, status:'on_the_way', at:le.at, source:'event' });
      });
      const onWayCount = new Set(onWayRows.map(x => x.courier_id || normCourier(x.courier_name))).size;
      const stTag = t => t === 'on_the_way' ? ['ac', 'في الطريق'] : t === 'waiting' ? ['wn', 'وصل عند العميل'] : t === 'break' ? ['mu', 'في استراحة'] : ['ok', 'متاح'];
      const head = '<div class="cpo-row" style="gap:14px;flex-wrap:wrap"><div style="flex:1;min-width:200px"><div style="font-size:26px;font-weight:700">رادار المكتب</div>' +
        '<div class="cpo-row" style="gap:7px;font-size:13px;color:var(--mu)"><span style="width:9px;height:9px;border-radius:50%;background:var(--ok)"></span>مباشر · بيتحدّث كل دقيقة عند فتح التاب · آخر تحديث <span class="cpo-num">' + new Date().toLocaleTimeString('ar-EG-u-nu-latn', { hour: 'numeric', minute: '2-digit', second: '2-digit' }) + '</span></div></div>' +
        '<button type="button" class="cpo-btn g" data-radar-retry="1" style="min-height:44px">' + svg('refresh', 18) + 'تحديث</button>' +
        '<button type="button" class="cpo-btn g" data-radar-notif="1" style="min-height:44px">' + svg('bell', 18) + 'إشعارات</button></div>';
      const STALE_MIN = 30;
      const WAIT_MIN = 20;
      const staleMin = at => { const t0 = at ? new Date(at).getTime() : NaN; return Number.isFinite(t0) ? Math.floor((Date.now() - t0) / 60000) : 0; };
      const AREAS = ['الدقي', 'المهندسين', 'الزمالك', 'الجيزة', 'فيصل', 'الهرم', 'أكتوبر', 'الشيخ زايد', 'المعادي', 'حلوان', 'المقطم', 'المنيل', 'السيدة زينب', 'مدينة نصر', 'مصر الجديدة', 'شبرا', 'وسط البلد', 'رمسيس', 'عين شمس', 'المرج', 'المطرية', 'الزيتون', 'حدائق القبة', 'التجمع', 'القاهرة الجديدة', 'الرحاب', 'مدينتي', 'الشروق', 'بدر', 'العبور', 'القطامية'];
      const normA = x => String(x || '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').trim();
      const detectArea = (zone, addr) => {
        const hay = normA([zone, addr].filter(Boolean).join(' '));
        const hit = AREAS.find(k => hay.includes(normA(k)));
        if (hit) return hit;
        const cleanZ = String(zone || '').trim();
        return cleanZ || '';
      };
      const courierIdByName = nm => {
        const hit = couriers.find(c => normCourier(c.name) === normCourier(nm));
        return hit ? Number(hit.id) : 0;
      };
      const initialsOf = nm => {
        const parts = String(nm || '').trim().split(/\s+/).filter(Boolean);
        return parts.length >= 2 ? (parts[0][0] + ' ' + parts[1][0]) : (parts[0] ? parts[0].slice(0, 2) : 'م');
      };

      /* ---------- الحالات الـ 4 الذكية للرادار (قرارات مش أرقام) ---------- */
      /* 1) متأخر: مشوار/تيكت أكتر من 30 دقيقة من غير حركة */
      const delayedSeen = new Set();
      const delayedRows = [];
      allRadarRows.forEach(x => {
        if (!['on_the_way', 'call_attempt', 'collecting', 'accepted'].includes(x.status)) return;
        const m = staleMin(x.at);
        if (m < STALE_MIN) return;
        const k = radarRowKey(x.courier_id, x.courier_name, x.transaction_id);
        if (delayedSeen.has(k)) return;
        delayedSeen.add(k);
        delayedRows.push({
          courier_id: Number(x.courier_id || courierIdByName(x.courier_name)),
          courier_name: x.courier_name || 'مندوب',
          client_name: x.client_name || '',
          transaction_id: x.transaction_id || '',
          status: x.status,
          mins: m
        });
      });
      couriers.forEach(c => {
        const le = c.last_event || {};
        if (le.type === 'on_the_way' && le.at && staleMin(le.at) >= STALE_MIN) {
          const k = radarRowKey(c.id, c.name, le.tx || '');
          if (!delayedSeen.has(k)) {
            delayedSeen.add(k);
            delayedRows.push({ courier_id: Number(c.id), courier_name: c.name, client_name: nameByTx[le.tx] || '', transaction_id: le.tx || '', status: 'on_the_way', mins: staleMin(le.at) });
          }
        }
      });
      delayedRows.sort((a, b) => b.mins - a.mins);

      /* 1.5) توقع التأخير: المرحلة الحالية عدّت 1.5× المعتاد (من أزمنة آخر 30 يوم) لكن لسه ما وصلتش 30 د */
      const soonRows = [];
      const med = await ensureStageMedians();
      if (med) {
        const NEXT = { new: 'to_accept', accepted: 'call_attempt', call_attempt: 'on_the_way', on_the_way: 'waiting', waiting: 'papers_received' };
        const soonSeen = new Set();
        allRadarRows.forEach(x => {
          const stage = NEXT[x.status];
          const typical = stage && med[stage];
          if (!typical) return;
          const m = staleMin(x.at);
          if (m >= STALE_MIN || m < Math.max(8, Math.round(typical * 1.5))) return;
          const k = radarRowKey(x.courier_id, x.courier_name, x.transaction_id);
          if (delayedSeen.has(k) || soonSeen.has(k)) return;
          soonSeen.add(k);
          soonRows.push({ courier_id: Number(x.courier_id || courierIdByName(x.courier_name)), courier_name: x.courier_name || 'مندوب', client_name: x.client_name || '', transaction_id: x.transaction_id || '', status: x.status, mins: m, typical: Math.round(typical) });
        });
        soonRows.sort((a, b) => (b.mins / b.typical) - (a.mins / a.typical));
      }

      /* 2) واقف كتير عند عميل: في حالة وصل عند العميل >= 20 دقيقة */
      const stuckSeen = new Set();
      const stuckRows = [];
      allRadarRows.forEach(x => {
        if (!['waiting', 'arrived'].includes(x.status)) return;
        const m = staleMin(x.at);
        if (m < WAIT_MIN) return;
        const k = radarRowKey(x.courier_id, x.courier_name, x.transaction_id);
        if (stuckSeen.has(k)) return;
        stuckSeen.add(k);
        stuckRows.push({
          courier_id: Number(x.courier_id || courierIdByName(x.courier_name)),
          courier_name: x.courier_name || 'مندوب',
          client_name: x.client_name || '',
          transaction_id: x.transaction_id || '',
          mins: m
        });
      });
      couriers.forEach(c => {
        const le = c.last_event || {};
        if (le.type === 'waiting' && le.at && staleMin(le.at) >= WAIT_MIN) {
          const k = radarRowKey(c.id, c.name, le.tx || '');
          if (!stuckSeen.has(k)) {
            stuckSeen.add(k);
            stuckRows.push({ courier_id: Number(c.id), courier_name: c.name, client_name: nameByTx[le.tx] || '', transaction_id: le.tx || '', mins: staleMin(le.at) });
          }
        }
      });
      stuckRows.sort((a, b) => b.mins - a.mins);

      /* 3) مندوبين اتنين في نفس المنطقة (تقاطع مشاوير اليوم + تيكتات الاستلام النشطة) */
      const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
      const byArea = {};
      const seenAreaStop = new Set();
      opsItems.filter(x => x && x.courier && String(x.trip_day || '').slice(0, 10) === todayKey && !['delivered', 'confirmed', 'cancelled'].includes(x.operational_status)).forEach(x => {
        const hit = detectArea(x.zone, x.address);
        if (!hit) return;
        const sk = normCourier(x.courier) + '|' + String(x.transaction_id || x.client_name || '');
        if (seenAreaStop.has(sk)) return;
        seenAreaStop.add(sk);
        (byArea[hit] = byArea[hit] || {})[x.courier] = (byArea[hit][x.courier] || 0) + 1;
      });
      ticketRows.filter(x => x.courier_name && !['cancelled', 'papers_received', 'trip_confirmed'].includes(x.status)).forEach(x => {
        const hit = detectArea(x.zone, x.address);
        if (!hit) return;
        const sk = normCourier(x.courier_name) + '|' + String(x.transaction_id || x.ticket_id);
        if (seenAreaStop.has(sk)) return;
        seenAreaStop.add(sk);
        (byArea[hit] = byArea[hit] || {})[x.courier_name] = (byArea[hit][x.courier_name] || 0) + 1;
      });
      const overlaps = Object.keys(byArea).filter(k => Object.keys(byArea[k]).length >= 2).map(k => {
        const entries = Object.keys(byArea[k]).map(n => ({ name: n, count: byArea[k][n], id: courierIdByName(n) })).sort((a, b) => b.count - a.count);
        return { area: k, couriers: byArea[k], entries: entries };
      });

      /* 4) محتاج تدخل المكتب: طلبات موافقة + تأجيلات معلقة + تيكتات بدون قبول > 30 د */
      const pendingReschedTickets = ticketRows.filter(x => x.reschedule_status === 'pending');
      const unacceptedTickets = ticketRows.filter(x => x.status === 'new' && staleMin(x.at) >= STALE_MIN);
      const officeNeedCount = pending.length + pendingReschedTickets.length + unacceptedTickets.length;

      /* شريط الحالات الـ 4 التفاعلي */
      const activeCase = state.activeCase || 'all';
      const totalCases = delayedRows.length + stuckRows.length + overlaps.length + officeNeedCount;
      const caseTile = (key, title, count, subTxt, sev) => {
        const tone = count > 0 ? sev : '';
        const actCls = activeCase === key ? ' active' : '';
        return '<button type="button" class="cpo-case-tile ' + tone + actCls + '" data-radar-case="' + key + '">' +
          '<div class="cpo-row" style="justify-content:space-between;width:100%"><span class="cpo-lbl" style="color:inherit">' + title + '</span><span class="cpo-case-num" style="color:' + (count ? (sev === 'crit' ? 'var(--er)' : 'var(--wn)') : 'var(--ok)') + '">' + count + '</span></div>' +
          '<div class="cpo-lbl">' + subTxt + '</div>' +
        '</button>';
      };
      const casesGrid = '<div class="cpo-cases-grid">' +
        caseTile('delayed', '1) متأخر (+30 د)', delayedRows.length, delayedRows.length ? 'حركة متوقفة — يحتاج متابعة' : 'لا يوجد تأخير حالياً', 'crit') +
        caseTile('stuck', '2) واقف عند عميل', stuckRows.length, stuckRows.length ? 'انتظار أكتر من 20 د' : 'مفيش وقوف طويل', 'warn') +
        caseTile('overlap', '3) تقاطع مناطق', overlaps.length, overlaps.length ? 'مندوبين في نفس الحي' : 'توزيع المناطق ممتاز', 'warn') +
        caseTile('office', '4) محتاج تدخل المكتب', officeNeedCount, officeNeedCount ? 'موافقات / تأجيل / لم يُقبل' : 'مفيش قرارات معلقة', 'crit') +
      '</div>';

      /* قائمة حالات القرار (تظهر فقط ما يحتاج قرار أو تدخل حقيقي) */
      const caseRowsHtml = [];
      if (activeCase === 'all' || activeCase === 'delayed') {
        delayedRows.slice(0, 6).forEach(x => {
          caseRowsHtml.push('<div class="cpo-case-item crit"><div style="flex:1;min-width:200px"><b>⏳ متأخر · ' + esc(x.courier_name) + '</b> — ' + esc(x.client_name || x.transaction_id || 'مشوار') +
            '<div class="cpo-lbl">' + esc(statusText[x.status] || x.status) + ' من <b>' + x.mins + ' د</b> من غير حركة' + (x.transaction_id ? ' · <span dir="ltr">' + esc(x.transaction_id) + '</span>' : '') + '</div></div>' +
            '<div class="cpo-row"><button type="button" class="cpo-btn g" data-v12ping="' + Number(x.courier_id || 0) + '" data-cname="' + esc(x.courier_name) + '" data-ping-prefill="إيه الأخبار في مشوار ' + esc(x.client_name || x.transaction_id) + '؟ بقى له ' + x.mins + ' دقيقة">تنبيه المندوب</button></div></div>');
        });
      }
      if (activeCase === 'all' || activeCase === 'delayed') {
        soonRows.slice(0, 4).forEach(x => {
          caseRowsHtml.push('<div class="cpo-case-item warn"><div style="flex:1;min-width:200px"><b>🔮 قرب يتأخر · ' + esc(x.courier_name) + '</b> — ' + esc(x.client_name || x.transaction_id || 'مشوار') +
            '<div class="cpo-lbl">' + esc(statusText[x.status] || x.status) + ' من <b>' + x.mins + ' د</b> والمعتاد حوالي ' + x.typical + ' د' + (x.transaction_id ? ' · <span dir="ltr">' + esc(x.transaction_id) + '</span>' : '') + '</div></div>' +
            '<div class="cpo-row"><button type="button" class="cpo-btn g" data-v12ping="' + Number(x.courier_id || 0) + '" data-cname="' + esc(x.courier_name) + '" data-ping-prefill="إيه الأخبار في مشوار ' + esc(x.client_name || x.transaction_id) + '؟">اطمّن</button></div></div>');
        });
      }
      if (activeCase === 'all' || activeCase === 'stuck') {
        stuckRows.slice(0, 6).forEach(x => {
          caseRowsHtml.push('<div class="cpo-case-item warn"><div style="flex:1;min-width:200px"><b>📍 واقف عند عميل · ' + esc(x.courier_name) + '</b> — ' + esc(x.client_name || x.transaction_id || 'عميل') +
            '<div class="cpo-lbl">واقف عند العميل من <b>' + x.mins + ' د</b>' + (x.transaction_id ? ' · <span dir="ltr">' + esc(x.transaction_id) + '</span>' : '') + '</div></div>' +
            '<div class="cpo-row"><button type="button" class="cpo-btn g" data-v12ping="' + Number(x.courier_id || 0) + '" data-cname="' + esc(x.courier_name) + '" data-ping-prefill="هل في مشكلة عند ' + esc(x.client_name || 'العميل') + '؟ المكتب يقدر يتواصل معاه">اطمّن / تدخل</button></div></div>');
        });
      }
      if (activeCase === 'all' || activeCase === 'overlap') {
        overlaps.slice(0, 6).forEach(o => {
          const mainC = o.entries[0];
          const secC = o.entries[1];
          const mergeMsg = 'تقاطع في ' + o.area + ': ' + o.entries.map(e => e.name + ' (' + e.count + ')').join(' و ') + ' — مقترح ضم مشاوير ' + o.area + ' لـ ' + mainC.name + ' وتوفير مشوار.';
          caseRowsHtml.push('<div class="cpo-case-item warn"><div style="flex:1;min-width:200px"><b>🔀 تقاطع في «' + esc(o.area) + '»</b>: ' + o.entries.map(e => esc(e.name) + ' (' + e.count + ')').join(' و ') +
            '<div class="cpo-lbl">الاتنين نازلين نفس الحي — ضمهم لـ <b>' + esc(mainC.name) + '</b> ووفر مشوار.</div></div>' +
            '<div class="cpo-row" style="flex-wrap:wrap">' +
              '<button type="button" class="cpo-btn p" data-radar-cs="' + esc(mergeMsg) + '">نسخ اقتراح الضم</button>' +
              (secC && secC.id ? '<button type="button" class="cpo-btn g" data-v12ping="' + Number(secC.id) + '" data-cname="' + esc(secC.name) + '" data-ping-prefill="تنسيق منطقة ' + esc(o.area) + ': ' + esc(mainC.name) + ' نازل نفس الحي — تواصل مع المكتب قبل التحرك">تنسيق مع ' + esc(secC.name) + '</button>' : '') +
            '</div></div>');
        });
      }
      if (activeCase === 'all' || activeCase === 'office') {
        pending.forEach(q => {
          caseRowsHtml.push('<div class="cpo-case-item crit"><div style="flex:1;min-width:200px"><b>🔔 قرار مطلوب · ' + esc(q.courier_name) + '</b> — ' + esc(evLabels[q.event_type] || q.event_type) +
            '<div class="cpo-lbl cpo-num">' + (q.transaction_id ? '<span dir="ltr">' + esc(q.transaction_id) + '</span>' : '') + (q.payload && (q.payload.reason || q.payload.note) ? ' — ' + esc(q.payload.reason || q.payload.note) : '') + ' · ' + esc(ago(q.created_at || q.at)) + '</div></div>' +
            '<div class="cpo-row"><button type="button" class="cpo-btn p" data-v12res="' + Number(q.id) + '" data-dec="approved">موافقة</button><button type="button" class="cpo-btn g" data-v12res="' + Number(q.id) + '" data-dec="rejected">رفض</button></div></div>');
        });
        pendingReschedTickets.forEach(x => {
          caseRowsHtml.push('<div class="cpo-case-item warn"><div style="flex:1;min-width:200px"><b>📅 طلب تأجيل تيكت · ' + esc(x.courier_name) + '</b> — ' + esc(x.client_name || '') +
            '<div class="cpo-lbl">الموعد المقترح: ' + esc(x.proposed_slot || 'غير محدد') + (x.reschedule_reason ? ' · ' + esc(x.reschedule_reason) : '') + '</div></div>' +
            '<span class="cpo-tag wn">راجع طلبات التأجيل</span></div>');
        });
        unacceptedTickets.slice(0, 5).forEach(x => {
          caseRowsHtml.push('<div class="cpo-case-item warn"><div style="flex:1;min-width:200px"><b>🕒 تيكت لم يُقبل · ' + esc(x.courier_name) + '</b> — ' + esc(x.client_name || '') +
            '<div class="cpo-lbl">بقاله <b>' + staleMin(x.at) + ' د</b> والمندوب لسه مقبلش التيكت</div></div>' +
            '<button type="button" class="cpo-btn g" data-v12ping="' + Number(x.courier_id || 0) + '" data-cname="' + esc(x.courier_name) + '" data-ping-prefill="في تيكت استلام للعميل ' + esc(x.client_name || '') + ' بقاله ' + staleMin(x.at) + ' دقيقة لسه متقبلش">تذكير المندوب</button></div>');
        });
      }

      /* ترتيب الأولوية: قرار مطلوب منك أولاً، بعدين المتأخر، الواقف، قرب يتأخر، التقاطع */
      const PRIO = ['🔔', '📅', '🕒', '⏳', '📍', '🔮', '🔀'];
      const prioOf = h => { const i = PRIO.findIndex(m => h.indexOf('<b>' + m) !== -1); return i === -1 ? 99 : i; };
      caseRowsHtml.map((h, i) => ({ h, i })).sort((a, b) => prioOf(a.h) - prioOf(b.h) || a.i - b.i).forEach((o, i) => { caseRowsHtml[i] = o.h; });

      const casesBoard = caseRowsHtml.length
        ? '<div class="cpo-case-board">' +
            '<div class="cpo-row" style="justify-content:space-between;flex-wrap:wrap">' +
              '<div class="cpo-row"><b style="font-size:15px">حالات تحتاج قرار الآن</b><span class="cpo-tag wn cpo-num">' + caseRowsHtml.length + '</span></div>' +
              '<div class="cpo-row" style="gap:6px;flex-wrap:wrap">' +
                '<span class="cpo-lbl">مشاوير اليوم: <b style="color:var(--tx)">' + confToday + '/' + totalToday + '</b> · في الطريق: <b style="color:var(--ac)">' + onWayCount + '/' + couriers.length + '</b></span>' +
                (activeCase !== 'all' ? '<button type="button" class="cpo-btn g" style="min-height:32px;font-size:12px" data-radar-case="all">عرض الكل</button>' : '') +
              '</div>' +
            '</div>' +
            caseRowsHtml.join('') +
          '</div>'
        : '<div class="cpo-ok-strip"><span>✓ كل الحالات تمام — مفيش تأخير أو وقوف طويل أو تقاطع مناطق محتاج تدخل دلوقتي.</span><span class="cpo-lbl" style="color:inherit">مشاوير اليوم: ' + confToday + '/' + totalToday + ' · في الطريق: ' + onWayCount + '/' + couriers.length + '</span></div>';

      /* شرح واضح للخطوة الجاية المطلوبة لكل تيكت أو مشوار (عشان المكتب يفهم المندوب بيعمل إيه بالظبط) */
      const describeWorkflow = x => {
        const isTk = x.source === 'ticket';
        const kindTxt = isTk ? 'تيكت استلام' : (x.kind === 'pickup' ? 'استلام أوراق' : (x.kind === 'fee' ? 'تحصيل رسوم' : 'تسليم للعميل'));
        const st = String(x.status || 'new');
        if (x.reschedule_status === 'pending') return { kindTxt, nextTxt: 'مطلوب من المكتب: الموافقة أو الرفض على طلب التأجيل', owner: 'office' };
        if (st === 'papers_received') return { kindTxt, nextTxt: 'المندوب استلم الأوراق ✓ — مطلوب من المكتب التحويل لمعاملة رسمية', owner: 'office' };
        if (st === 'converted') return { kindTxt, nextTxt: 'المعاملة اتعملت — مطلوب من المندوب تأكيد المشوار فقط', owner: 'courier' };
        if (st === 'waiting' || st === 'arrived') return { kindTxt, nextTxt: isTk ? 'المندوب عند العميل الآن — الخطوة الجاية: استلام الأوراق' : 'المندوب عند العميل الآن — الخطوة الجاية: تأكيد التسليم', owner: 'courier' };
        if (st === 'on_the_way') return { kindTxt, nextTxt: 'المندوب في الطريق للعميل — الخطوة الجاية: يدوس «وصلت عند العميل»', owner: 'courier' };
        if (st === 'call_attempt') return { kindTxt, nextTxt: 'اتصل بالعميل — الخطوة الجاية: يتحرك ويدوس «في طريقي»', owner: 'courier' };
        if (st === 'accepted') return { kindTxt, nextTxt: 'قبل التيكت — الخطوة الجاية: يتصل بالعميل لتأكيد الميعاد', owner: 'courier' };
        if (st === 'collecting') return { kindTxt, nextTxt: 'جاري الاستلام من العميل — الخطوة الجاية: تأكيد الاستلام', owner: 'courier' };
        return { kindTxt, nextTxt: isTk ? 'جديد — مطلوب من المندوب يقبل التيكت ويبدأ التواصل' : 'في خط السير — مطلوب من المندوب يبدأ التحرك للعميل', owner: 'courier' };
      };
      const avatarUrlOf = c => state.avatarById[String(c.id)] || state.avatarByName[normCourier(c.name)] || '';

      /* تجهيز بيانات المودال التفصيلي لكل مندوب */
      state.radarModalData = {};
      const historyLabels = { accepted:'قبول التيكت', call_attempt:'تم الاتصال', on_the_way:'في الطريق', waiting:'وصل للعميل', papers_received:'استلم الأوراق', contact_call:'اتصال', contact_whatsapp:'واتساب' };

      /* كارت المندوب بالصورة الحقيقية + خط المحطات + شرح واضح للمهمة والخطوة الجاية */
      const cc = c => {
        const le = c.last_event || {}, tot = Number(c.total_today || 0), cf = Number(c.confirmed_today || 0);
        const rows = allRadarRows.filter(x => x.courier_id ? Number(x.courier_id) === Number(c.id) : normCourier(x.courier_name) === normCourier(c.name));
        const myOpsToday = opsItems.filter(x => x && normCourier(x.courier) === normCourier(c.name) && String(x.trip_day || '').slice(0, 10) === todayKey);

        /* حساب الحالة الحقيقية اللحظية للمندوب: لو داس «وصلت» يتنقل فوراً من «في الطريق» لـ «وصل عند العميل» */
        const waitingRow = rows.find(x => x.status === 'waiting' || x.status === 'arrived');
        const movingRow = rows.find(x => x.status === 'on_the_way');
        const liveType = waitingRow ? 'waiting' : (movingRow ? 'on_the_way' : (le.type === 'break' ? 'break' : 'resume'));
        const t = stTag(liveType);

        /* بناء خط المحطات البصري بأسماء المناطق الحقيقية */
        const zoneMap = new Map();
        const pushZoneStop = (zName, clientNm, kindLbl, stageLbl, isDone, isActive) => {
          const clean = zName || 'قيد التحديد';
          if (!zoneMap.has(clean)) zoneMap.set(clean, { name: clean, total: 0, done: 0, active: false, details: [] });
          const z = zoneMap.get(clean);
          z.total++;
          if (isDone) z.done++;
          if (isActive) z.active = true;
          const entry = (clientNm || 'عميل') + ' (' + kindLbl + ' · ' + stageLbl + ')';
          if (z.details.indexOf(entry) === -1) z.details.push(entry);
        };
        myOpsToday.forEach(x => {
          const txKey = String(x.transaction_id || '').trim().toUpperCase();
          const zn = detectArea(x.zone, x.address || rlAddrByTx[txKey] || '');
          const isD = x.operational_status === 'delivered' || x.operational_status === 'confirmed';
          const isA = x.operational_status === 'on_the_way' || x.operational_status === 'waiting';
          const kl = (x.kind || x.type) === 'pickup' ? 'استلام' : 'تسليم';
          pushZoneStop(zn, x.client_name, kl, statusText[x.operational_status] || 'جديد', isD, isA);
        });
        rows.forEach(x => {
          if (x.source !== 'ticket') return;
          const zn = detectArea(x.zone, x.address);
          const isD = x.status === 'papers_received' || x.status === 'trip_confirmed';
          const isA = x.status === 'on_the_way' || x.status === 'waiting' || x.status === 'arrived';
          pushZoneStop(zn, x.client_name, 'استلام', statusText[x.status] || 'جديد', isD, isA);
        });
        const zList = Array.from(zoneMap.values()).slice(0, 4);
        const doneZones = zList.filter(z => z.total > 0 && z.done >= z.total).length;
        const activeZoneIdx = zList.findIndex(z => z.active);
        const zPct = zList.length > 1
          ? Math.min(100, Math.round(((activeZoneIdx >= 0 ? activeZoneIdx : doneZones) / (zList.length - 1)) * 100))
          : (doneZones ? 100 : 0);
        const avTxt = initialsOf(c.name);
        const avUrl = avatarUrlOf(c);
        const avHtml = avUrl
          ? '<img src="' + esc(avUrl) + '" alt="' + esc(c.name) + '">'
          : esc(avTxt);
        const zoneLineHtml = zList.length
          ? '<div class="cpo-zline"><div class="cpo-ztrack"><i style="width:' + zPct + '%"></i></div>' +
              zList.map((z, idx) => {
                const isDone = z.total > 0 && z.done >= z.total;
                const isAct = z.active || (!isDone && idx === activeZoneIdx);
                const cls = isDone ? 'done' : (isAct ? 'active' : '');
                const prevTxt = 'محطة ' + z.name + ' (' + z.done + '/' + z.total + '): ' + (z.details.slice(0, 5).join(' — ') || '—');
                return '<button type="button" class="cpo-znode ' + cls + '" data-radar-zprev="' + Number(c.id) + '" data-ztxt="' + esc(prevTxt) + '">' +
                  (isAct ? '<span class="cpo-zpin-av">' + avHtml + '</span>' : '') +
                  '<span class="cpo-zdot">' + (isDone ? '✓' : (idx + 1)) + '</span>' +
                  '<span class="cpo-zname">' + esc(z.name) + '</span>' +
                  '<span class="cpo-zcnt">' + z.done + '/' + z.total + '</span>' +
                '</button>';
              }).join('') +
            '</div><div id="cop-zprev-' + Number(c.id) + '" class="cpo-zpreview" hidden></div>'
          : '<div class="cpo-last-act"><span>مفيش محطات مفتوحة للمندوب النهارده</span></div>';

        const first = String(c.name || '').trim().split(/\s+/)[0] || 'المندوب';
        const csText = (function () {
          const now1 = waitingRow ? 'وصل عند العميل ' + (waitingRow.client_name || '') + ' ' + ago(waitingRow.at) : movingRow ? 'في الطريق للعميل ' + (movingRow.client_name || '') + ' ' + ago(movingRow.at) : 'مفيش مشوار شغال دلوقتي';
          return 'المندوب ' + first + ' حالياً ' + now1.trim() + '. معاه ' + rows.length + ' طلب نشط النهارده، وخلّص ' + cf + ' من ' + tot + '.';
        })();

        /* المهمة الحالية الأهم + إيه الخطوة الجاية بالظبط */
        const focusRow = waitingRow || movingRow || rows[0] || null;
        let nowBoxHtml = '<div class="cpo-last-act"><span>متاح وجاهز لاستلام شغل اليوم</span></div>';
        if (focusRow) {
          const wf = describeWorkflow(focusRow);
          const fArea = detectArea(focusRow.zone, focusRow.address);
          nowBoxHtml = '<div class="cpo-now-box">' +
            '<div class="cpo-now-row">' +
              '<span><span class="cpo-kind-pill">' + esc(wf.kindTxt) + '</span> <b>' + esc(focusRow.client_name || focusRow.transaction_id) + '</b>' + (fArea ? ' · <span style="color:var(--mu)">' + esc(fArea) + '</span>' : '') + '</span>' +
              '<span class="cpo-lbl">' + esc(ago(focusRow.at)) + '</span>' +
            '</div>' +
            '<div class="cpo-next-hint' + (wf.owner === 'office' ? ' office' : '') + '">' + esc(wf.nextTxt) + '</div>' +
          '</div>';
        }

        /* حفظ تفاصيل المندوب للمودال (مع الصورة ونوع المهمة والخطوة الجاية لكل طلب) */
        state.radarModalData[String(c.id)] = {
          id: Number(c.id), name: c.name, initials: avTxt, avatarUrl: avUrl, statusTag: t,
          done: cf, total: tot, csText: csText,
          rows: rows.map(x => {
            const wf = describeWorkflow(x);
            const areaNm = detectArea(x.zone, x.address);
            return {
              client_name: x.client_name || 'عميل بدون اسم',
              transaction_id: x.transaction_id || '—',
              zone: areaNm || x.zone || '',
              address: x.address || '',
              service_name: x.service_name || '',
              kindTxt: wf.kindTxt,
              nextTxt: wf.nextTxt,
              nextOwner: wf.owner,
              source: x.source,
              statusLabel: statusText[x.status] || String(x.status || 'نشط'),
              atTxt: ago(x.at),
              reschedule_status: x.reschedule_status || '',
              proposed_slot: x.proposed_slot || '',
              reschedule_reason: x.reschedule_reason || '',
              historyTxt: x.source === 'ticket' && Array.isArray(x.action_history) && x.action_history.length
                ? x.action_history.map(h => (historyLabels[h.step] || h.step) + (h.outcome ? ' (' + h.outcome + ')' : '') + ' · ' + ago(h.created_at)).join(' ← ')
                : ''
            };
          })
        };

        const myDelay = delayedRows.filter(x => x.courier_id === Number(c.id) || normCourier(x.courier_name) === normCourier(c.name));
        const myStuck = stuckRows.filter(x => x.courier_id === Number(c.id) || normCourier(x.courier_name) === normCourier(c.name));
        const warnLine = myDelay.length
          ? '<div class="cpo-lbl" style="color:var(--er);font-weight:700">⏳ متأخر: ' + myDelay[0].mins + ' د من غير حركة (' + esc(myDelay[0].client_name || myDelay[0].transaction_id) + ')</div>'
          : (myStuck.length ? '<div class="cpo-lbl" style="color:var(--wn);font-weight:700">📍 واقف عند ' + esc(myStuck[0].client_name || 'عميل') + ' من ' + myStuck[0].mins + ' د</div>' : '');
        const activeCount = Math.max(rows.length, tot);
        const doneCount = cf + rows.filter(x => x.status === 'papers_received').length;
        const pct = activeCount ? Math.min(100, Math.round(doneCount / activeCount * 100)) : 0;
        const sub = waitingRow
          ? ('وصل عند ' + esc(waitingRow.client_name || 'عميل') + ' · ' + esc(ago(waitingRow.at)))
          : (movingRow
            ? ('في الطريق لـ ' + esc(movingRow.client_name || 'عميل') + ' · ' + esc(ago(movingRow.at)))
            : (le.at ? 'آخر حركة ' + esc(tm(le.at)) : 'متاح على الخط'));

        return '<div class="cpo-cc" style="' + (myDelay.length ? 'border:1px solid var(--er)' : (myStuck.length ? 'border:1px solid var(--wn)' : 'border:1px solid var(--bd)')) + '">' +
          '<div class="cpo-row" style="justify-content:space-between">' +
            '<div class="cpo-row" style="min-width:0"><div class="cpo-av">' + avHtml + '</div><div style="min-width:0"><b style="font-size:15px">' + esc(c.name) + '</b><div style="font-size:12px;color:var(--mu)">' + sub + '</div></div></div>' +
            '<span class="cpo-tag ' + t[0] + '">' + t[1] + '</span>' +
          '</div>' +
          zoneLineHtml +
          warnLine +
          nowBoxHtml +
          '<div class="cpo-row"><div class="cpo-bar" style="flex:1"><span style="width:' + pct + '%"></span></div><span class="cpo-num cpo-lbl">الإنجاز: ' + doneCount + '/' + activeCount + '</span></div>' +
          '<div class="cpo-row" style="gap:6px;flex-wrap:wrap">' +
            '<button type="button" class="cpo-btn p" style="flex:1;min-height:36px;font-size:12.5px" data-radar-dd="' + Number(c.id) + '">الطلبات والسجل (' + rows.length + ')</button>' +
            '<button type="button" class="cpo-btn g" style="min-height:36px;font-size:12px" data-radar-cs="' + esc(csText) + '">المندوب فين</button>' +
            '<button type="button" class="cpo-btn g" style="min-height:36px;padding:0 10px" data-v12ping="' + Number(c.id) + '" data-cname="' + esc(c.name) + '" title="تنبيه عاجل">' + svg('warn') + '</button>' +
          '</div>' +
        '</div>';
      };
      const composer = '<div id="cop-ping-box" class="cpo-ping" style="display:none"><span id="cop-ping-to" class="cpo-lbl"></span>' +
        '<input id="cop-ping-msg" type="text" maxlength="200" placeholder="اكتب رسالة التنبيه العاجل" aria-label="رسالة التنبيه"><button type="button" class="cpo-btn p" style="min-height:44px" data-ping-send="1">أرسل</button><button type="button" class="cpo-btn g" style="min-height:44px" data-ping-cancel="1">إلغاء</button></div>';
      const couriersCard = '<div class="cpo-card"><div class="cpo-row" style="justify-content:space-between;margin-bottom:12px"><b style="font-size:16px">تحركات المناديب وخط المحطات</b><span class="cpo-lbl">اضغط على أي منطقة لمعرفة عملائها</span></div>' +
        (couriers.length ? '<div class="cpo-grid2">' + couriers.map(cc).join('') + '</div>' : '<div class="cpo-lbl">مفيش مناديب نشطين دلوقتي</div>') + composer + '</div>';

      /* إشعار واحد بس لما الحالة تحتاج قرار (بدون زحمة الخطوات الروتينية) */
      const decisionFeedItems = []
        .concat(pending.slice(0, 4).map(q => ({ c: 'er', t: 'قرار مطلوب: <b>' + esc(q.courier_name) + '</b> — ' + esc(evLabels[q.event_type] || q.event_type), at: q.created_at || q.at })))
        .concat(delayedRows.slice(0, 3).map(x => ({ c: 'er', t: 'تأخير +' + x.mins + ' د: <b>' + esc(x.courier_name) + '</b> (' + esc(x.client_name || x.transaction_id) + ')', at: null })))
        .concat(stuckRows.slice(0, 2).map(x => ({ c: 'wn', t: 'وقوف +' + x.mins + ' د: <b>' + esc(x.courier_name) + '</b> عند ' + esc(x.client_name || 'عميل'), at: null })))
        .concat(overlaps.slice(0, 2).map(o => ({ c: 'wn', t: 'تقاطع منطقة <b>' + esc(o.area) + '</b>: ' + o.entries.map(e => esc(e.name)).join(' و '), at: null })));
      const feed = '<div class="cpo-card"><div class="cpo-row" style="justify-content:space-between"><b style="font-size:15.5px">إشعارات القرار فقط</b><span class="cpo-tag ' + (decisionFeedItems.length ? 'wn' : 'ok') + ' cpo-num">' + decisionFeedItems.length + '</span></div>' +
        '<div class="cpo-lbl" style="margin-top:4px">باقي خطوات المناديب بتتسجل تلقائياً جوه سجل المعاملة بدون إزعاج.</div>' +
        '<div style="margin-top:10px;display:flex;flex-direction:column;gap:8px;font-size:13px;line-height:1.45">' +
        (decisionFeedItems.length ? decisionFeedItems.map(f => '<div class="cpo-row" style="align-items:flex-start"><span style="width:8px;height:8px;border-radius:50%;background:var(--' + f.c + ');margin-top:6px;flex:none"></span><span>' + f.t + (f.at ? ' · <span class="cpo-lbl cpo-num">' + ago(f.at) + '</span>' : '') + '</span></div>').join('') : '<span class="cpo-lbl" style="color:var(--ok)">✓ مفيش حاجة محتاجة قرار دلوقتي</span>') + '</div></div>';
      const ready = '<div class="cpo-card"><b style="font-size:15.5px">علّم جاهزية المعاملة</b>' +
        '<input id="cop-ready-tx" type="text" dir="ltr" class="cpo-tx" placeholder="TX-2026-0412" aria-label="رقم المعاملة">' +
        '<div class="cpo-row" style="justify-content:space-between;padding:8px 0"><span style="font-size:14px">جاهز بالمكتب</span><button type="button" role="switch" aria-label="جاهز بالمكتب" class="cpo-sw" data-ready="ready_flag"><i></i></button></div>' +
        '<div class="cpo-row" style="justify-content:space-between;padding:8px 0"><span style="font-size:14px">الميعاد متأكد مع العميل</span><button type="button" role="switch" aria-label="الميعاد متأكد" class="cpo-sw" data-ready="client_confirmed"><i></i></button></div>' +
        '<div class="cpo-lbl" style="margin-top:6px">بتظهر للمندوب كعلامة على كارت المشوار</div></div>';
      const cust = '<div class="cpo-card" style="flex:1"><div class="cpo-row" style="justify-content:space-between"><b style="font-size:15.5px">في الطريق للعملاء الآن</b><span class="cpo-tag ' + (onWayRows.length ? 'ac' : 'mu') + ' cpo-num">' + onWayRows.length + '</span></div><div class="cpo-lbl" style="margin-top:3px">يختفي تلقائياً أول ما المندوب يدوس «وصلت» أو يخلّص.</div><div class="cpo-cc" style="margin-top:10px;padding:14px;border-radius:18px">' +
        (onWayRows.length ? onWayRows.map(x => {
          const courierFirst = String(x.courier_name || '').trim().split(/\s+/)[0] || 'المندوب';
          const clientFirst = String(x.client_name || '').trim().split(/\s+/)[0];
          return '<div class="cpo-row" style="gap:10px;padding:8px 0;border-bottom:1px solid var(--bd)"><div class="cpo-ico">' + svg('truck', 20) + '</div><div><b>' + esc(courierFirst) + ' في الطريق' + (clientFirst ? ' لـ ' + esc(clientFirst) : '') + '</b><div class="cpo-lbl">المندوب في طريقه للعميل · ' + esc(ago(x.at)) + '</div></div></div>';
        }).join('') : '<div class="cpo-lbl">مفيش مندوب في الطريق دلوقتي.</div>') + '</div>' +
        '<div class="cpo-lbl" style="margin-top:10px;line-height:1.5">الاسم الأول للمندوب والعميل فقط، من غير رقم أو عنوان.</div></div>';
      state.radarFailed = false;
      state.radarLoadedAt = Date.now();
      target.innerHTML = '<div class="cpo-wrap">' + head + casesGrid + casesBoard + '<div class="cpo-cols"><div class="cpo-main">' + couriersCard + '</div><div class="cpo-side">' + feed + ready + cust + '</div></div></div>';
      target.onclick = radarClick;
    } catch (e) {
      state.radarFailed = true;
      state.radarLoadedAt = Date.now();
      target.innerHTML = '<div role="alert" style="padding:12px;border-radius:14px;border:1px solid rgba(239,68,68,.4);background:rgba(239,68,68,.08);font-size:12.5px;line-height:1.6">' +
        '<b>الرادار مش قادر يحمّل.</b><br>' + esc((e && e.message) || '') +
        '<br><span style="color:var(--mu)">لو الرسالة فيها "function" أو "does not exist" شغّل ملفي SQL: courier-v12-modern.sql ثم courier-link-v13.sql.</span><br>' +
        '<button type="button" class="cp-btn cp-sm" data-radar-retry="1" style="margin-top:8px">إعادة المحاولة</button></div>';
      target.onclick = radarClick;
    } finally { state.radarBusy = false; }
  }
  function openCourierRadarModal(courierId) {
    const old = $('cop-courier-dd-modal');
    if (old) old.remove();
    const info = state.radarModalData && state.radarModalData[String(courierId)];
    if (!info) return;
    const avHtml = info.avatarUrl
      ? '<img src="' + esc(info.avatarUrl) + '" alt="' + esc(info.name) + '">'
      : esc(info.initials || 'م');
    const rowsHtml = info.rows.length
      ? info.rows.map(x =>
          '<div class="cpo-dd-item">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">' +
              '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">' +
                '<span style="font-size:11px;font-weight:800;padding:2px 8px;border-radius:999px;background:rgba(16,185,129,.15);color:#059669">' + esc(x.kindTxt || 'مهمة') + '</span>' +
                '<b style="font-size:14px">' + esc(x.client_name) + '</b>' +
                (x.zone ? '<span style="font-size:12px;font-weight:700;opacity:.75">· ' + esc(x.zone) + '</span>' : '') +
              '</div>' +
              '<span style="font-size:11.5px;font-weight:800;padding:3px 10px;border-radius:999px;background:rgba(148,163,184,.16)">' + esc(x.statusLabel) + '</span>' +
            '</div>' +
            '<div style="font-size:12px;opacity:.78"><span dir="ltr">' + esc(x.transaction_id) + '</span>' + (x.service_name ? ' · ' + esc(x.service_name) : '') + (x.address ? ' · ' + esc(x.address) : '') + ' · ' + esc(x.atTxt) + '</div>' +
            (x.nextTxt ? '<div class="cpo-dd-next' + (x.nextOwner === 'office' ? ' office' : '') + '">' + esc(x.nextTxt) + '</div>' : '') +
            (x.historyTxt ? '<div style="font-size:11.5px;opacity:.85;margin-top:3px">سجل الخطوات: ' + esc(x.historyTxt) + '</div>' : '') +
            (x.reschedule_status === 'pending' ? '<div style="font-size:12px;color:#f59e0b;font-weight:700">طلب تأجيل معلّق · ' + esc(x.proposed_slot || '') + (x.reschedule_reason ? ' · ' + esc(x.reschedule_reason) : '') + '</div>' : '') +
          '</div>'
        ).join('')
      : '<div style="padding:18px;text-align:center;opacity:.7;font-size:13px">مفيش طلبات نشطة للمندوب ده النهارده.</div>';
    const wrap = document.createElement('div');
    wrap.id = 'cop-courier-dd-modal';
    wrap.className = 'cpo-dd-backdrop';
    wrap.dir = 'rtl';
    wrap.innerHTML =
      '<div class="cpo-dd-box" role="dialog" aria-modal="true">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;border-bottom:1px solid var(--bd,rgba(148,163,184,.2));padding-bottom:10px">' +
          '<div style="display:flex;align-items:center;gap:10px"><div class="cpo-dd-av">' + avHtml + '</div><div><b style="font-size:16px">' + esc(info.name) + ' — خط السير والمطلوب اليوم</b><div style="font-size:12px;opacity:.75">نشط النهارده: ' + info.rows.length + ' · مؤكد: ' + info.done + '/' + info.total + ' · الحالة: ' + esc((info.statusTag && info.statusTag[1]) || 'متاح') + '</div></div></div>' +
          '<div style="display:flex;gap:6px"><button type="button" class="cpo-btn g" id="cop-dd-copy" style="min-height:36px;font-size:12px">نسخ ملخص خدمة العملاء</button><button type="button" class="cpo-btn g" id="cop-dd-close" style="min-height:36px">إغلاق ✕</button></div>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:8px">' + rowsHtml + '</div>' +
      '</div>';
    wrap.addEventListener('click', e => {
      if (e.target === wrap || (e.target.closest && e.target.closest('#cop-dd-close'))) wrap.remove();
      if (e.target.closest && e.target.closest('#cop-dd-copy')) {
        try { navigator.clipboard.writeText(info.csText); toast('اتنسخ ملخص خدمة العملاء ✓'); } catch (er) { window.prompt('انسخ الملخص:', info.csText); }
      }
    });
    document.body.appendChild(wrap);
  }
  async function radarClick(ev) {
    const t = ev.target.closest && ev.target.closest('button'); if (!t) return;
    const el = radarBox || $('cop-radar');
    if (t.dataset.radarDd) {
      openCourierRadarModal(t.dataset.radarDd);
      return;
    }
    if (t.dataset.radarCase) {
      const nextCase = t.dataset.radarCase;
      state.activeCase = (state.activeCase === nextCase && nextCase !== 'all') ? 'all' : nextCase;
      return loadV12OfficeRadar(el, true);
    }
    if (t.dataset.radarZprev) {
      const box = $('cop-zprev-' + t.dataset.radarZprev);
      if (box) {
        const txt = t.dataset.ztxt || '';
        const same = !box.hidden && box.textContent === txt;
        box.textContent = txt;
        box.hidden = same;
      }
      return;
    }
    if (t.dataset.radarGroup) {
      if (!el) return;
      const key = t.dataset.radarGroup;
      const panel = Array.from(el.querySelectorAll('[data-radar-panel]')).find(node => node.dataset.radarPanel === key);
      if (panel) { panel.hidden = !panel.hidden; t.setAttribute('aria-expanded', panel.hidden ? 'false' : 'true'); }
      return;
    }
    if (t.dataset.radarCs) {
      const txt = t.dataset.radarCs;
      try { await navigator.clipboard.writeText(txt); toast('اتنسخ — ابعته لخدمة العملاء'); }
      catch (e) { window.prompt('انسخ الملخص:', txt); }
      return;
    }
    if (t.dataset.radarRetry) return loadV12OfficeRadar(el, true);
    if (t.dataset.radarNotif) { shell(); state.tab = 'notifications'; return render(); }
    if (t.dataset.v12res) {
      t.disabled = true;
      const r = await rpc('courier_v12_resolve_event', { p_event_id: Number(t.dataset.v12res), p_decision: t.dataset.dec });
      if (r.error) { t.disabled = false; return toast(r.error.message, true); }
      toast(t.dataset.dec === 'approved' ? 'تمت الموافقة' : 'تم الرفض');
      return loadV12OfficeRadar(el, true);
    }
    if (t.dataset.v12ping) {
      state.pingTo = Number(t.dataset.v12ping);
      const b = $('cop-ping-box'); if (!b) return;
      $('cop-ping-to').textContent = 'تنبيه لـ ' + (t.dataset.cname || '');
      const inp = $('cop-ping-msg');
      if (inp && t.dataset.pingPrefill) inp.value = t.dataset.pingPrefill;
      b.style.display = 'flex';
      if (inp) { inp.focus(); b.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      return;
    }
    if (t.dataset.pingCancel) { const b = $('cop-ping-box'); if (b) b.style.display = 'none'; return; }
    if (t.dataset.pingSend) {
      const m = ($('cop-ping-msg').value || '').trim(); if (!m) return toast('اكتب الرسالة الأول', true);
      t.disabled = true;
      const r = await rpc('courier_v12_urgent_ping', { p_courier_id: state.pingTo, p_tx: null, p_message: m });
      t.disabled = false;
      if (r.error) return toast(r.error.message, true);
      $('cop-ping-msg').value = ''; $('cop-ping-box').style.display = 'none';
      return toast('وصل التنبيه العاجل لشاشة المندوب');
    }
    if (t.dataset.ready) {
      const tx = ($('cop-ready-tx').value || '').trim(); if (!tx) return toast('اكتب رقم المعاملة', true);
      t.disabled = true;
      const nv = !t.classList.contains('on');
      const r = await rpc('courier_v12_mark_ready', { p_tx: tx, p_flag: t.dataset.ready, p_val: nv });
      t.disabled = false;
      if (r.error) return toast(r.error.message, true);
      t.classList.toggle('on', nv); t.setAttribute('aria-checked', nv ? 'true' : 'false');
      return toast('اتسجلت الجاهزية للمندوب');
    }
  }
  function stopRadarTimer() {
    if (state.radarTimer) {
      clearInterval(state.radarTimer);
      state.radarTimer = 0;
    }
  }
  function radarTick() {
    if (document.hidden || !isRadarVisible()) {
      if (!isRadarVisible()) stopRadarTimer();
      return;
    }
    const el = radarBox || $('cop-radar');
    if (!el || !document.body.contains(el)) return;
    loadV12OfficeRadar(el, false);
  }
  function startRadarTimer() {
    if (!state.radarTimer) state.radarTimer = setInterval(radarTick, MIN_REFRESH_MS);
  }

  function paymentForm(id) {
    if(!isManager())return toast('تسجيل الصرف متاح للمدير فقط',true);
    shell();
    $('cop-content').innerHTML='<h3>تسجيل صرف مستحقات المندوب</h3><p class="cp-sub">سجّل طريقة الصرف والمرجع المتاح. البيانات دي سجل إداري داخلي وليست تأكيدًا من البنك.</p><form id="cop-payment-form" data-id="'+Number(id)+'" class="cp-card"><label class="cp-sub">طريقة الصرف<select class="cp-field" name="method" required><option value="cash">نقدي</option><option value="bank_transfer">تحويل بنكي</option><option value="wallet">محفظة إلكترونية</option><option value="other">أخرى</option></select></label><label class="cp-sub">رقم مرجع التحويل / الإيصال (اختياري)<input class="cp-field" name="reference" maxlength="160" placeholder="رقم العملية أو الإيصال"></label><label class="cp-sub">ملاحظات (اختياري)<textarea class="cp-field" name="note" maxlength="1000" rows="3"></textarea></label><div class="cp-btns"><button class="cp-btn cp-go" type="submit">تأكيد تسجيل الصرف</button><button class="cp-btn" type="button" data-cop="close">إلغاء</button></div></form>';
  }
  document.addEventListener('click',onClick);
  document.addEventListener('change',onChange);
  document.addEventListener('submit',onSubmit);

  /* ربط نظيف بتبديل التبويبات وتحميل البيانات */
  const _st = window.switchTab;
  if (typeof _st === 'function' && !_st.__copWrapped) {
    const wrappedSwitch = function (id) {
      const r = _st.apply(this, arguments);
      if (id === 'couriers') {
        injectManagerPanel(false);
        setTimeout(() => injectManagerPanel(false), 80);
      } else {
        stopRadarTimer();
      }
      return r;
    };
    wrappedSwitch.__copWrapped = true;
    window.switchTab = wrappedSwitch;
  }
  const _li = window.loadInitialData;
  if (typeof _li === 'function' && !_li.__copWrapped) {
    const wrappedLoad = async function () {
      const r = await _li.apply(this, arguments);
      setTimeout(() => injectManagerPanel(false), 120);
      return r;
    };
    wrappedLoad.__copWrapped = true;
    window.loadInitialData = wrappedLoad;
  }
  injectManagerPanel(false);
})();
