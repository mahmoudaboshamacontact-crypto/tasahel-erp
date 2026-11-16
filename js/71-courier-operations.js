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
  const state = {items:[],issues:[],ledger:[],closings:[],notifications:[],staffUsers:[],ledgerFrom:'',ledgerTo:'',tab:'route',busy:false,managerBusy:false,managerLoadedAt:0,managerHtml:'',resolvingIssueId:null};
  const statusOptions = Object.keys(labels).map(k=>'<option value="'+k+'">'+labels[k]+'</option>').join('');
  function rpc(name,args) { return sbClient.rpc(name,args || {}); }
  function toast(s,bad) { if (typeof showToast==='function') showToast(s,bad?'error':'success'); else alert(s); }
  function isManager() { return window.__role === 'manager'; }
  function isStaff() { return isManager() || window.__role === 'staff'; }
  function isCourier() { return window.__role === 'courier'; }

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
    const r=await rpc('courier_ops_items',{p_from:null,p_to:null}); if(r.error)throw r.error;
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
  async function render() {
    const c=$('cop-content'); if(!c)return; tabButtons(); c.innerHTML='<div class="cp-empty">جاري تحميل البيانات…</div>';
    try {
      if(state.tab==='route'){await loadRoute();c.innerHTML=routeView();}
      else if(state.tab==='issues'){await loadIssues();if(isStaff()){const u=await rpc('courier_ops_staff_users');if(u.error)throw u.error;state.staffUsers=Array.isArray(u.data)?u.data:[];}c.innerHTML=issuesView();}
      else if(state.tab==='notifications'){await loadNotifications();c.innerHTML=notificationsView();}
      else if(isCourier()){await loadLedger();c.innerHTML=ledgerView();}
      else {state.tab='route';await loadRoute();c.innerHTML=routeView();}
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
  function injectManagerPanel() {
    if(!isStaff())return;const root=$('tab-couriers');if(!root||root.classList.contains('hidden'))return;
    if($('cop-manager-panel'))return;
    const box=document.createElement('section');box.id='cop-manager-panel';box.className='card p-4 space-y-3';
    box.innerHTML='<div class="flex items-center justify-between gap-2"><b>متابعة تشغيل المناديب والبلاغات</b><div class="flex gap-2"><button type="button" class="rounded-lg bg-slate-600 text-white px-3 py-2 text-xs font-bold" id="cop-manager-notifications">الإشعارات</button><button type="button" class="rounded-lg bg-emerald-600 text-white px-3 py-2 text-xs font-bold" id="cop-manager-refresh">تحديث</button></div></div><div id="cop-manager-content" class="text-xs text-slate-500">'+(state.managerHtml||'جاري تحميل البلاغات والتقفيلات…')+'</div>';
    root.appendChild(box);
    $('cop-manager-refresh').onclick=()=>loadManagerPanel(true);
    $('cop-manager-notifications').onclick=async()=>{shell();state.tab='notifications';await render();};
    if(!state.managerLoadedAt || (Date.now()-state.managerLoadedAt > 60000)) loadManagerPanel(false);
  }
  async function loadManagerPanel(force) {
    const c=$('cop-manager-content');if(!c||state.managerBusy)return;
    if(!force && state.managerHtml && (Date.now()-state.managerLoadedAt < 60000)){c.innerHTML=state.managerHtml;return;}
    state.managerBusy=true;c.textContent='جاري التحميل…';
    try{
      const [ir,cr,tr]=await Promise.all([rpc('courier_ops_issues',{p_status:null}),rpc('courier_ops_closings',{p_from:null,p_to:null}),rpc('courier_ops_items',{p_from:null,p_to:null})]);
      if(ir.error)throw ir.error;if(cr.error)throw cr.error;if(tr.error)throw tr.error;
      state.issues=ir.data||[];state.closings=cr.data||[];
      state.items=(tr.data||[]).filter(x=>x&&x.client_name&&String(x.client_name).trim()&&String(x.client_name).trim()!=='بدون اسم');
      const html='<b>حالات المشاوير التشغيلية</b>'+state.items.slice(0,12).map(x=>'<div class="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-slate-200 dark:border-slate-700"><span>'+esc(x.courier)+' · '+esc(x.transaction_id)+' · '+esc(x.client_name||'بدون اسم')+'</span><div class="flex items-center gap-2"><button type="button" class="text-emerald-600 font-bold" data-cop="history" data-id="'+x.id+'">السجل</button><select class="field !w-auto !py-1 text-xs" data-cop-status="'+x.id+'">'+Object.keys(labels).map(k=>'<option value="'+k+'" '+(x.operational_status===k?'selected':'')+'>'+labels[k]+'</option>').join('')+'</select></div></div>').join('')+'<hr><b>البلاغات المفتوحة: '+state.issues.filter(x=>x.status!=='resolved').length+'</b>'+state.issues.slice(0,8).map(x=>'<div class="border-b border-slate-200 dark:border-slate-700 py-2"><b>'+esc(issueLabels[x.issue_type]||x.issue_type)+'</b> · '+esc(x.courier)+' · '+esc(x.transaction_id)+'<div>'+esc(x.details)+'</div><span>'+({open:'مفتوح',in_progress:'جاري الحل',resolved:'تم الحل'}[x.status])+'</span><button type="button" class="text-emerald-600 font-bold mr-2" data-cop="ask-resolve" data-id="'+x.id+'">حل البلاغ</button></div>').join('')+'<hr><b>التقفيلات الأخيرة</b>'+state.closings.slice(0,8).map(x=>'<div class="flex justify-between gap-2 py-2 border-b border-slate-200 dark:border-slate-700"><span>'+esc(x.courier)+' · '+esc(x.period_start)+' → '+esc(x.period_end)+' · '+money(x.total)+' · '+(x.paid_at?'تم الصرف':'لم يُسجل الصرف')+'</span>'+(x.paid_method?'<small> · '+esc(({cash:'نقدي',bank_transfer:'تحويل بنكي',wallet:'محفظة إلكترونية',other:'أخرى'}[x.paid_method]||x.paid_method))+'</small>':'')+(x.paid_reference?'<small> · مرجع: '+esc(x.paid_reference)+'</small>':'')+(x.paid_note?'<small> · '+esc(x.paid_note)+'</small>':'')+(isManager()?'<button type="button" class="text-emerald-600 font-bold" data-cop="paid" data-id="'+x.id+'" '+(x.paid_at?'disabled':'')+'>تسجيل الصرف</button>':'')+'</div>').join('');
      state.managerHtml=html;
      state.managerLoadedAt=Date.now();
      const target=$('cop-manager-content');
      if(target)target.innerHTML=html;
      loadV12OfficeRadar(c);
    }catch(e){c.textContent='تعذر تحميل متابعة التشغيل. '+(e.message||'');}
    finally{state.managerBusy=false;}
  }

  /* ---------- رادار المكتب الحي والموافقات الفورية (v12) ---------- */
  async function loadV12OfficeRadar(container) {
    try {
      const r = await sbClient.rpc('courier_v12_office_radar');
      if (!r || r.error || !r.data) return;
      const d = r.data;
      const couriers = Array.isArray(d.couriers) ? d.couriers : [];
      const pending = Array.isArray(d.pending_requests) ? d.pending_requests : [];
      const totalToday = couriers.reduce((s, c) => s + Number(c.total_today || 0), 0);
      const confToday = couriers.reduce((s, c) => s + Number(c.confirmed_today || 0), 0);
      const evLabels = {
        on_the_way: '🛵 في الطريق', waiting: '⏳ وصل عند العميل', break: '⏸ في استراحة',
        resume: '🟢 متاح', near_office: '🏢 قرب من المكتب', handoff_req: '🔄 طلب تحويل',
        reschedule_req: '📅 طلب تأجيل لبكرة', expense: '💵 مصروف طريق', swap_req: '🔁 تبديل', cash_settle: '💰 تسوية كاش'
      };
      const pulseHtml = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0;padding:8px 10px;border-radius:10px;background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.3);font-size:12px;font-weight:800">' +
        '<span>📡 نبض اليوم:</span>' +
        '<span>إجمالي: ' + totalToday + '</span>' +
        '<span style="color:#10b981">مؤكد: ' + confToday + '</span>' +
        '<span style="color:#f59e0b">طلبات معلقة: ' + pending.length + '</span>' +
      '</div>';
      const couriersHtml = couriers.length ? '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px;margin-bottom:10px">' + couriers.map(c => {
        const le = c.last_event || {};
        const lbl = evLabels[le.type] || 'متصل';
        return '<div style="padding:8px 10px;border-radius:10px;border:1px solid var(--bd);background:var(--fld);font-size:12px">' +
          '<div style="display:flex;justify-content:space-between;align-items:center"><b>' + esc(c.name) + '</b><span>' + Number(c.confirmed_today || 0) + '/' + Number(c.total_today || 0) + '</span></div>' +
          '<div style="color:var(--mu);margin:4px 0">' + lbl + (le.tx ? ' · <span dir="ltr">' + esc(le.tx) + '</span>' : '') + '</div>' +
          '<button type="button" class="cp-btn cp-sm" data-v12ping="' + Number(c.id) + '" data-cname="' + esc(c.name) + '">🚨 تنبيه عاجل</button>' +
        '</div>';
      }).join('') + '</div>' : '';
      const reqsHtml = pending.length ? '<div style="margin-top:8px"><b style="font-size:12.5px">طلبات بانتظار موافقة المكتب (' + pending.length + '):</b>' + pending.map(p =>
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 9px;margin-top:5px;border-radius:10px;border:1px solid rgba(245,158,11,.4);background:rgba(245,158,11,.08);font-size:12px">' +
          '<div><b>' + esc(p.courier_name) + '</b> · ' + (evLabels[p.event_type] || esc(p.event_type)) + (p.transaction_id ? ' (<span dir="ltr">' + esc(p.transaction_id) + '</span>)' : '') +
          (p.payload && (p.payload.reason || p.payload.note) ? ' — ' + esc(p.payload.reason || p.payload.note) : '') + '</div>' +
          '<div style="display:flex;gap:5px"><button type="button" class="cp-btn cp-go cp-sm" data-v12res="' + Number(p.id) + '" data-dec="approved">✓ موافقة</button><button type="button" class="cp-btn cp-sm" data-v12res="' + Number(p.id) + '" data-dec="rejected">✕ رفض</button></div>' +
        '</div>'
      ).join('') + '</div>' : '';
      const box = document.createElement('div');
      box.innerHTML = pulseHtml + couriersHtml + reqsHtml;
      container.prepend(box);
      box.querySelectorAll('[data-v12res]').forEach(btn => {
        btn.onclick = async () => {
          btn.disabled = true;
          await sbClient.rpc('courier_v12_resolve_event', { p_event_id: Number(btn.dataset.v12res), p_decision: btn.dataset.dec });
          toast(btn.dataset.dec === 'approved' ? '✓ تمت الموافقة' : 'تم الرفض');
          loadManagerPanel();
        };
      });
      box.querySelectorAll('[data-v12ping]').forEach(btn => {
        btn.onclick = async () => {
          const msg = window.prompt('اكتب رسالة التنبيه العاجل للمندوب ' + (btn.dataset.cname || '') + ':');
          if (!msg || !msg.trim()) return;
          await sbClient.rpc('courier_v12_urgent_ping', { p_courier_id: Number(btn.dataset.v12ping), p_tx: null, p_message: msg.trim() });
          toast('🚨 تم إرسال التنبيه العاجل لشاشة المندوب فوراً ✓');
        };
      });
    } catch (e) {}
  }

  function paymentForm(id) {
    if(!isManager())return toast('تسجيل الصرف متاح للمدير فقط',true);
    shell();
    $('cop-content').innerHTML='<h3>تسجيل صرف مستحقات المندوب</h3><p class="cp-sub">سجّل طريقة الصرف والمرجع المتاح. البيانات دي سجل إداري داخلي وليست تأكيدًا من البنك.</p><form id="cop-payment-form" data-id="'+Number(id)+'" class="cp-card"><label class="cp-sub">طريقة الصرف<select class="cp-field" name="method" required><option value="cash">نقدي</option><option value="bank_transfer">تحويل بنكي</option><option value="wallet">محفظة إلكترونية</option><option value="other">أخرى</option></select></label><label class="cp-sub">رقم مرجع التحويل / الإيصال (اختياري)<input class="cp-field" name="reference" maxlength="160" placeholder="رقم العملية أو الإيصال"></label><label class="cp-sub">ملاحظات (اختياري)<textarea class="cp-field" name="note" maxlength="1000" rows="3"></textarea></label><div class="cp-btns"><button class="cp-btn cp-go" type="submit">تأكيد تسجيل الصرف</button><button class="cp-btn" type="button" data-cop="close">إلغاء</button></div></form>';
  }
  document.addEventListener('click',onClick);
  document.addEventListener('change',onChange);
  document.addEventListener('submit',onSubmit);

  /* ربط نظيف بتبديل التبويبات وتحميل البيانات بدون MutationObserver على document.body */
  const _st = window.switchTab;
  if (typeof _st === 'function' && !_st.__copWrapped) {
    const wrappedSwitch = function (id) {
      const r = _st.apply(this, arguments);
      if (id === 'couriers') setTimeout(injectManagerPanel, 60);
      return r;
    };
    wrappedSwitch.__copWrapped = true;
    window.switchTab = wrappedSwitch;
  }
  const _li = window.loadInitialData;
  if (typeof _li === 'function' && !_li.__copWrapped) {
    const wrappedLoad = async function () {
      const r = await _li.apply(this, arguments);
      setTimeout(injectManagerPanel, 120);
      return r;
    };
    wrappedLoad.__copWrapped = true;
    window.loadInitialData = wrappedLoad;
  }
  injectManagerPanel();
})();
