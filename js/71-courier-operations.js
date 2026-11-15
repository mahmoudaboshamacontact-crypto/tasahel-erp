/* Courier Operations UI — loaded after courier portal v6. */
(function () {
  'use strict';
  if (window.__courierOpsUi) return; window.__courierOpsUi = true;
  const $ = id => document.getElementById(id);
  const esc = s => typeof escapeHtml === 'function' ? escapeHtml(s == null ? '' : String(s)) : String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const money = n => Number(n || 0).toLocaleString('ar-EG') + ' ج';
  const labels = {new:'جديد',collecting:'جاري الاستلام',collected:'تم الاستلام',on_the_way:'في الطريق',delivered:'تم التسليم'};
  const issueLabels = {customer_unavailable:'العميل غير متاح',wrong_address:'عنوان خطأ',incorrect_fee:'رسوم غير صحيحة',pickup_problem:'مشكلة في الاستلام',other:'مشكلة أخرى'};
  const state = {items:[],issues:[],ledger:[],closings:[],tab:'route',busy:false,managerBusy:false};
  const statusOptions = Object.keys(labels).map(k=>'<option value="'+k+'">'+labels[k]+'</option>').join('');
  function rpc(name,args) { return sbClient.rpc(name,args || {}); }
  function toast(s,bad) { if (typeof showToast==='function') showToast(s,bad?'error':'success'); else alert(s); }
  function isManager() { return window.__role==='manager'||(typeof currentUser!=='undefined'&&currentUser&&/mahmoud\.aboshama@tasahel\.com\.eg|mahmoud\.aboshama\.contact@gmail\.com/i.test(currentUser.email||'')); }
  function isStaff() { return isManager()||window.__role==='staff'; }
  function addCourierButton() {
    const nav=$('cp-nav'); if (!nav || nav.querySelector('[data-cop-open]')) return;
    const b=document.createElement('button'); b.type='button'; b.dataset.copOpen='1';
    b.innerHTML='<i class="fa-solid fa-route"></i>التشغيل'; b.style.cssText='flex:1;border:0;background:transparent;color:#10b981;font:inherit;font-size:11px;font-weight:800;padding:9px 2px;cursor:pointer';
    nav.appendChild(b);
  }
  function shell() {
    let root=$('courier-ops-modal');
    if (!root) { root=document.createElement('div'); root.id='courier-ops-modal'; root.dir='rtl'; root.style.cssText='position:fixed;inset:0;z-index:100001;background:rgba(2,6,23,.78);display:none;overflow:auto;padding:12px'; document.body.appendChild(root); }
    root.style.display='block';
    root.innerHTML='<section style="max-width:760px;min-height:80vh;margin:0 auto;background:#10223d;color:#e8eef8;border:1px solid rgba(255,255,255,.15);border-radius:18px;padding:14px"><header style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b style="font-size:17px">التشغيل وكشف الحساب</b><button data-cop="close" class="cp-btn">إغلاق ✕</button></header><nav style="display:flex;gap:6px;flex-wrap:wrap;margin:12px 0"><button class="cp-btn" data-cop="tab" data-tab="route">خط السير</button><button class="cp-btn" data-cop="tab" data-tab="issues">البلاغات</button><button class="cp-btn" data-cop="tab" data-tab="ledger">كشف الحساب</button></nav><div id="cop-content">جاري التحميل…</div></section>';
  }
  function tabButtons() {
    const root=$('courier-ops-modal'); if(!root)return;
    root.querySelectorAll('[data-cop="tab"]').forEach(b=>{b.style.background=b.dataset.tab===state.tab?'#10b981':'rgba(255,255,255,.08)';b.style.color=b.dataset.tab===state.tab?'#052e24':'#e8eef8';});
  }
  async function loadRoute() {
    const r=await rpc('courier_ops_items',{p_from:null,p_to:null}); if(r.error)throw r.error;
    state.items=Array.isArray(r.data)?r.data:[];
  }
  async function loadIssues() {
    const r=await rpc('courier_ops_issues',{p_status:null}); if(r.error)throw r.error;
    state.issues=Array.isArray(r.data)?r.data:[];
  }
  async function loadLedger() {
    const r=await rpc('courier_ops_ledger',{p_from:null,p_to:null}); if(r.error)throw r.error;
    state.ledger=Array.isArray(r.data)?r.data:[];
  }
  function routeView() {
    const rows=state.items.map((x,i)=>'<article class="cp-card" style="margin:8px 0"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><div><b>'+esc(x.client_name||'بدون اسم')+'</b><div class="cp-sub">معاملة '+esc(x.transaction_id)+' · '+esc(x.trip_day)+' · '+(x.kind==='pickup'?'استلام':'تسليم')+'</div><div class="cp-sub">'+esc(x.address||'لا يوجد عنوان')+'</div></div><b>'+money(x.fee)+'</b></div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px"><label class="cp-sub">الحالة التشغيلية <select data-cop-status="'+x.id+'" class="cp-field">'+statusOptions.replace('value="'+x.operational_status+'"','value="'+x.operational_status+'" selected')+'</select></label><label class="cp-sub">الأولوية <select data-cop-priority="'+x.id+'" class="cp-field">'+[1,2,3,4,5].map(n=>'<option value="'+n+'" '+(Number(x.priority)===n?'selected':'')+'>'+({1:'عاجل',2:'عالية',3:'عادية',4:'منخفضة',5:'عند التفرغ'}[n])+'</option>').join('')+'</select></label><button class="cp-btn cp-sm" data-cop="up" data-id="'+x.id+'">↑</button><button class="cp-btn cp-sm" data-cop="down" data-id="'+x.id+'">↓</button><button class="cp-btn cp-sm" data-cop="report" data-id="'+x.id+'">إبلاغ عن مشكلة</button>'+(x.address?'<a class="cp-btn cp-sm" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(x.address)+'">فتح الخريطة</a>':'')+'</div></article>').join('');
    return '<p class="cp-sub">الحالة التشغيلية مستقلة عن التأكيد المالي. تحديث الحالة لا يؤكد المشوار ولا يضيفه للعمولة.</p>'+(rows||'<div class="cp-empty">لا توجد مشاوير مسجلة في الفترة الحالية.</div>');
  }
  function issuesView() {
    const rows=state.issues.map(x=>'<article class="cp-card" style="margin:8px 0"><b>'+esc(issueLabels[x.issue_type]||x.issue_type)+'</b><div class="cp-sub">معاملة '+esc(x.transaction_id)+' · '+esc(x.courier)+' · '+esc(x.created_at)+'</div><p>'+esc(x.details)+'</p><span class="cp-tag '+(x.status==='resolved'?'ok':'wt')+'">'+({open:'مفتوح',in_progress:'جاري الحل',resolved:'تم الحل'}[x.status]||x.status)+'</span>'+(isStaff()?'<div style="display:flex;gap:6px;margin-top:8px"><button class="cp-btn cp-sm" data-cop="issue-state" data-id="'+x.id+'" data-state="in_progress">بدء المتابعة</button><button class="cp-btn cp-sm" data-cop="issue-state" data-id="'+x.id+'" data-state="resolved">تم الحل</button></div>':'')+(x.resolution?'<p class="cp-sub">الإجراء: '+esc(x.resolution)+'</p>':'')+'</article>').join('');
    return (isStaff()?'<p class="cp-sub">بلاغات الفريق ومتابعة حالتها.</p>':'<p class="cp-sub">تابع حالة البلاغات التي أرسلتها.</p>')+(rows||'<div class="cp-empty">لا توجد بلاغات.</div>');
  }
  function ledgerView() {
    const rows=state.ledger.map(x=>'<tr><td>'+esc(x.day)+'</td><td>'+esc(x.transaction_id)+'</td><td>'+esc(x.type)+'</td><td>'+money(x.amount)+'</td><td>'+(x.confirmed?'مؤكد':'معلق')+'</td><td>'+(x.included_in_closing?(x.paid_at?'تم الصرف':'دخل التقفيل'):'لم يدخل التقفيل')+'</td></tr>').join('');
    const total=state.ledger.filter(x=>x.confirmed).reduce((a,x)=>a+Number(x.amount||0),0);
    const closed=state.ledger.filter(x=>x.confirmed&&x.included_in_closing).reduce((a,x)=>a+Number(x.amount||0),0);
    const paid=state.ledger.filter(x=>x.confirmed&&x.included_in_closing&&x.paid_at).reduce((a,x)=>a+Number(x.amount||0),0);
    return '<div class="cp-grid"><div class="cp-kpi"><small>إجمالي المؤكد</small><b>'+money(total)+'</b></div><div class="cp-kpi"><small>دخل التقفيل</small><b>'+money(closed)+'</b></div><div class="cp-kpi"><small>تم تسجيل صرفه</small><b>'+money(paid)+'</b></div><div class="cp-kpi"><small>مؤكد لم يدخل التقفيل</small><b>'+money(total-closed)+'</b></div></div><div style="overflow:auto"><table class="cp-table" style="width:100%;font-size:11px"><thead><tr><th>التاريخ</th><th>المعاملة</th><th>النوع</th><th>العمولة</th><th>التأكيد</th><th>التقفيل/الصرف</th></tr></thead><tbody>'+rows+'</tbody></table></div><p class="cp-sub">«تم تسجيل صرفه» تعني أن الإدارة سجلت الصرف في النظام، وليست إثباتًا بنكيًا.</p>';
  }
  async function render() {
    const c=$('cop-content'); if(!c)return; tabButtons(); c.innerHTML='<div class="cp-empty">جاري تحميل البيانات…</div>';
    try {
      if(state.tab==='route'){await loadRoute();c.innerHTML=routeView();}
      else if(state.tab==='issues'){await loadIssues();c.innerHTML=issuesView();}
      else {await loadLedger();c.innerHTML=ledgerView();}
    } catch(e) { c.innerHTML='<div class="cp-empty">تعذر تحميل البيانات. تأكد من تشغيل sql/courier-operations.sql بعد ملفات بوابة المندوب والتقفيل.</div>'; }
    tabButtons();
  }
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
      const id=Number(b.dataset.id),x=state.items.find(z=>Number(z.id)===id);if(!x)return;
      const sorted=state.items.slice().sort((m,n)=>Number(m.route_order)-Number(n.route_order));
      const i=sorted.findIndex(z=>Number(z.id)===id),j=i+(a==='up'?-1:1);if(j<0||j>=sorted.length)return;
      const other=sorted[j],r=await rpc('courier_ops_update',{p_trip_id:id,p_route_order:Number(other.route_order||0),p_status:null,p_priority:null,p_note:null});
      if(r.error)return toast(r.error.message,true);
      const q=await rpc('courier_ops_update',{p_trip_id:Number(other.id),p_route_order:i+1,p_status:null,p_priority:null,p_note:null});
      if(q.error)return toast(q.error.message,true);return render();
    }
    if(a==='paid'){return;}\n    if(a==='issue-state'){
      const resolution=b.dataset.state==='resolved'?(prompt('اكتب ملخص الحل (اختياري):')||'') : null;
      const r=await rpc('courier_ops_issue_update',{p_issue_id:Number(b.dataset.id),p_status:b.dataset.state,p_resolution:resolution});
      if(r.error)return toast(r.error.message,true);toast('تم تحديث حالة البلاغ');if(isStaff()&&!$('courier-ops-modal')?.style.display||$('courier-ops-modal')?.style.display==='none')return loadManagerPanel();return render();
    }
  }
  async function onChange(e) {
    const el=e.target;
    if(el.matches('[data-cop-status],[data-cop-priority]')){
      const id=Number(el.dataset.copStatus||el.dataset.copPriority),x=state.items.find(z=>Number(z.id)===id);if(!x)return;
      const args={p_trip_id:id,p_status:el.dataset.copStatus?el.value:null,p_priority:el.dataset.copPriority?Number(el.value):null,p_route_order:null,p_note:null};
      const r=await rpc('courier_ops_update',args);if(r.error){toast(r.error.message,true);return;}toast('تم حفظ التحديث');if(isStaff()&&(!$('courier-ops-modal')||$('courier-ops-modal').style.display==='none'))return loadManagerPanel();await render();
    }
  }
  async function onSubmit(e) {
    if(e.target.id!=='cop-report-form')return;e.preventDefault();
    const f=e.target,r=await rpc('courier_ops_report',{p_trip_id:Number(f.dataset.id),p_issue_type:f.elements.type.value,p_details:f.elements.details.value.trim()});
    if(r.error)return toast(r.error.message,true);toast('تم إرسال البلاغ للإدارة');state.tab='issues';return render();
  }
  function injectManagerPanel() {
    if(!isStaff())return;const root=$('tab-couriers');if(!root||root.classList.contains('hidden')||$('cop-manager-panel'))return;
    const box=document.createElement('section');box.id='cop-manager-panel';box.className='card p-4 space-y-3';box.innerHTML='<div class="flex items-center justify-between gap-2"><b>متابعة تشغيل المناديب والبلاغات</b><button class="rounded-lg bg-emerald-600 text-white px-3 py-2 text-xs font-bold" id="cop-manager-refresh">تحديث</button></div><div id="cop-manager-content" class="text-xs text-slate-500">جاري تحميل البلاغات والتقفيلات…</div>';
    root.appendChild(box);$('cop-manager-refresh').onclick=loadManagerPanel;loadManagerPanel();
  }
  async function loadManagerPanel() {
    const c=$('cop-manager-content');if(!c||state.managerBusy)return;state.managerBusy=true;c.textContent='جاري التحميل…';
    try{
      const [ir,cr]=await Promise.all([rpc('courier_ops_issues',{p_status:null}),rpc('courier_ops_closings',{p_from:null,p_to:null})]);
      if(ir.error)throw ir.error;if(cr.error)throw cr.error;state.issues=ir.data||[];state.closings=cr.data||[];
      c.innerHTML='<b>حالات المشاوير التشغيلية</b>'+state.items.slice(0,12).map(x=>'<div class="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-slate-200 dark:border-slate-700"><span>'+esc(x.courier)+' · '+esc(x.transaction_id)+' · '+esc(x.client_name||'بدون اسم')+'</span><select class="field !w-auto !py-1 text-xs" data-cop-status="'+x.id+'">'+Object.keys(labels).map(k=>'<option value="'+k+'" '+(x.operational_status===k?'selected':'')+'>'+labels[k]+'</option>').join('')+'</select></div>').join('')+'<hr><b>البلاغات المفتوحة: '+state.issues.filter(x=>x.status!=='resolved').length+'</b>'+state.issues.slice(0,8).map(x=>'<div class="border-b border-slate-200 dark:border-slate-700 py-2"><b>'+esc(issueLabels[x.issue_type]||x.issue_type)+'</b> · '+esc(x.courier)+' · '+esc(x.transaction_id)+'<div>'+esc(x.details)+'</div><span>'+({open:'مفتوح',in_progress:'جاري الحل',resolved:'تم الحل'}[x.status])+'</span><button class="text-emerald-600 font-bold mr-2" data-cop="issue-state" data-id="'+x.id+'" data-state="resolved">حل البلاغ</button></div>').join('')+'<hr><b>التقفيلات الأخيرة</b>'+state.closings.slice(0,8).map(x=>'<div class="flex justify-between gap-2 py-2 border-b border-slate-200 dark:border-slate-700"><span>'+esc(x.courier)+' · '+esc(x.period_start)+' → '+esc(x.period_end)+' · '+money(x.total)+' · '+(x.paid_at?'تم الصرف':'لم يُسجل الصرف')+'</span>'+(isManager()?'<button class="text-emerald-600 font-bold" data-cop="paid" data-id="'+x.id+'" '+(x.paid_at?'disabled':'')+'>تسجيل الصرف</button>':'')+'</div>').join('');
    }catch(e){c.textContent='تعذر تحميل متابعة التشغيل. '+(e.message||'');}
    finally{state.managerBusy=false;}
  }
  async function onManagerAction(e) {
    const b=e.target.closest('[data-cop="paid"]');if(!b)return;
    if(!confirm('تسجيل أن هذا التقفيل تم صرفه للمندوب؟'))return;
    const r=await rpc('courier_ops_mark_paid',{p_closing_id:Number(b.dataset.id)});if(r.error)return toast(r.error.message,true);
    toast('تم تسجيل الصرف');state.managerBusy=false;loadManagerPanel();
  }
  document.addEventListener('click',e=>{onClick(e);onManagerAction(e);});
  document.addEventListener('change',onChange);
  document.addEventListener('submit',onSubmit);
  const obs=new MutationObserver(()=>{addCourierButton();injectManagerPanel();});
  obs.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  addCourierButton();injectManagerPanel();
})();