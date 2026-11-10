const DEFAULT_SB_URL='https://avehvjqifswsyayckpvx.supabase.co';
let sbClient=null,allRequestLines=[],allServices=[],groupedOrders=[],chartInstances={},currentDashboardRange='all',recentMode='all',currentTab='home',serviceLineCounter=0,clientSelectedReceiptLines=[];
let txStatusFilter='all',selectedInspectorTx=null,showAllQuickServices=false;
window.__saveOrderMode='normal';
window.__homeFloatingTxId=null;
const PAY_DEFAULT=['كاش','انستا باي','فودافون كاش','POS','تحويل بنكي'];
const STATUS_AR={'Delivered':'تم التسليم','Complete':'مكتمل','Under Review':'تحت المراجعة','In Progress':'قيد التنفيذ'};
const STATUS_CLS={'Delivered':'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300','Complete':'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300','Under Review':'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300','In Progress':'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300'};
const $=id=>document.getElementById(id);
let currentUser=null,profiles=[],myProfile=null,avatarUrls={},profilesReady=true,pendingAvatarBlob=null,pendingAvatarUrl=null,avatarRemoved=false;
let chatReady=false,chatSetupNeeded=false,chatItems=[],chatActive=null,chatMsgs={},chatHasMore={},chatReplyTo=null,chatMsgCh=null,chatPresCh=null,onlineIds=[],chatSending=false,chatAudio=null,chatBound=false;

/* ---------- أدوات ---------- */
function escapeHtml(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}
function formatCurrency(n){return new Intl.NumberFormat('ar-EG',{maximumFractionDigits:0}).format(Number(n)||0)+' ج.م';}
function fmtNum(n){return Number(n||0).toLocaleString('en-US',{maximumFractionDigits:2});}
function formatDateTime(s){if(!s)return '—';const d=new Date(s);return isNaN(d)?s:new Intl.DateTimeFormat('ar-EG',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(d);}
function formatDateOnly(s){if(!s)return '—';const d=new Date(String(s).length===10?s+'T00:00':s);return isNaN(d)?s:new Intl.DateTimeFormat('ar-EG',{year:'numeric',month:'short',day:'numeric'}).format(d);}
function formatTimeOnly(s){if(!s)return '';const d=new Date(s);return isNaN(d)?'':new Intl.DateTimeFormat('ar-EG',{hour:'2-digit',minute:'2-digit'}).format(d);}
function formatDateSplit(s){if(!s)return '<span class="text-slate-400">—</span>';const d=new Date(s);if(isNaN(d))return escapeHtml(s);const dt=new Intl.DateTimeFormat('ar-EG',{year:'numeric',month:'short',day:'numeric'}).format(d);const tm=new Intl.DateTimeFormat('ar-EG',{hour:'2-digit',minute:'2-digit'}).format(d);return '<div class="rc-date-box"><span class="font-semibold text-slate-700 dark:text-slate-200 text-xs">'+escapeHtml(dt)+'</span><span class="text-[11px] text-slate-400">'+escapeHtml(tm)+'</span></div>';}
function dayKey(d){return d?new Date(d).toLocaleDateString('en-CA'):'';}
function lineDate(l){return l.received_at||l.created_at;}
function statusLabel(s){return STATUS_AR[s]||s||'قيد التنفيذ';}
function badge(s){return '<span class="rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap '+(STATUS_CLS[s]||'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300')+'">'+escapeHtml(statusLabel(s))+'</span>';}
function waNum(p){p=String(p||'').replace(/\D/g,'');if(!p)return '';return p.charAt(0)==='0'?'2'+p:p;}
function waLink(p,msg){const n=waNum(p);return n?'https://wa.me/'+n+(msg?'?text='+encodeURIComponent(msg):''):'';}
const ac=n=>'data-c="'+escapeHtml(n)+'" onclick="event.stopPropagation();openClientModal(this.dataset.c)"';
const at=t=>'data-tx="'+escapeHtml(t)+'" onclick="event.stopPropagation();openTxModal(this.dataset.tx)"';
const execCostOf=l=>Number(l.exec_total)||((Number(l.exec_unit_cost)||0)*(Number(l.qty)||0))||0;
function setT(id,v){const e=$(id);if(e&&e.textContent!==v)e.textContent=v;}
function showToast(message,type,ms){
  type=type||'success';const t=$('toast');
  t.className='fixed top-5 left-1/2 z-[150] -translate-x-1/2 rounded-xl px-4 py-3 text-xs sm:text-sm font-semibold shadow-xl border backdrop-blur-md transition-all duration-300 pointer-events-auto flex items-center gap-2 max-w-[92vw] '+(type==='error'?'bg-rose-900/95 text-white border-rose-700':type==='info'?'bg-slate-900/90 text-white border-slate-700':'bg-violet-900/95 text-white border-violet-600');
  t.innerHTML='<i class="fa-solid '+(type==='error'?'fa-triangle-exclamation':type==='info'?'fa-circle-info':'fa-circle-check')+'"></i><span>'+escapeHtml(message)+'</span>';
  t.style.transform='translate(-50%,0)';t.style.opacity='1';
  clearTimeout(showToast.t);showToast.t=setTimeout(function(){t.style.transform='translate(-50%,-6rem)';t.style.opacity='0';},ms||(type==='error'?9000:3500));
}
function showError(prefix,err){console.error(prefix,err);showToast(prefix+': '+((err&&(err.message||err.details||err.hint))||err),'error');}

/* ---------- حساب حالة المعاملة وتأخيرها ---------- */
const ORDER_STATUS_RANK={'Under Review':0,'In Progress':1,'Complete':2,'Delivered':3};
function getOrderStatus(o){
  if(!o||!o.lines||!o.lines.length)return 'In Progress';
  let best='In Progress',r=9;
  o.lines.forEach(l=>{
    const s=l.status||'In Progress',k=ORDER_STATUS_RANK[s];
    if(k!=null&&k<r){r=k;best=s;}
  });
  return r===9?'In Progress':best;
}
window.isLineCancelled=(function(){
  /* سريع: نحتفظ بمجموعة البنود اللي عليها استرداد معتمد لثواني قليلة بدل ما نلف على كل البنود لكل بند */
  let ids=null,at=0;
  return function(l){
    try{
      if(!l||typeof window.getAllApprovedRefunds!=='function'||typeof window.getLineRefundSummary!=='function')return false;
      const now=Date.now();
      if(!ids||now-at>2000){ids=new Set(window.getAllApprovedRefunds().map(r=>String(r.line_id)));at=now;}
      if(!ids.has(String(l.id)))return false;
      const rs=window.getLineRefundSummary(l.id);return !!(rs&&rs.isFull);
    }catch(e){return false;}
  };
})();
function isLineLate(l){
  if(!l)return false;
  const st=l.status||'In Progress';
  if(st==='Delivered'||st==='Complete')return false;
  /* بند مسترد كليًا = اتلغى، مفيش تأخير عليه */
  if(window.isLineCancelled(l))return false;
  const dur=Number(l.duration_days)||0;
  if(dur<=0)return false;
  const baseStr=String(l.exec_start_date||lineDate(l)||'').slice(0,10);
  if(!baseStr)return false;
  const baseDate=new Date(baseStr+'T00:00:00');
  if(isNaN(baseDate))return false;
  const dueTime=baseDate.getTime()+dur*86400000;
  const todayStart=new Date();todayStart.setHours(0,0,0,0);
  return todayStart.getTime()>dueTime;
}
function isOrderLate(o){
  return !!(o&&o.lines&&o.lines.some(isLineLate));
}

/* ---------- Supabase ---------- */
function getSavedKeys(){return{url:localStorage.getItem('sb_url')||DEFAULT_SB_URL,key:localStorage.getItem('sb_key')||''};}
function openSupabaseModal(){const k=getSavedKeys();$('cfg-sb-url').value=k.url;$('cfg-sb-key').value=k.key;$('cfg-error').classList.add('hidden');$('sb-modal').classList.remove('hidden');$('sb-modal').classList.add('flex');}
function closeSupabaseModal(){$('sb-modal').classList.add('hidden');$('sb-modal').classList.remove('flex');}
async function handleSaveSupabaseConfig(e){
  e.preventDefault();const url=$('cfg-sb-url').value.trim(),key=$('cfg-sb-key').value.trim(),box=$('cfg-error');
  try{
    const c=supabase.createClient(url,key);
    const r=await c.from('services').select('name').limit(1);
    if(r.error&&/api key|jwt|invalid/i.test(r.error.message||''))throw r.error;
    localStorage.setItem('sb_url',url);localStorage.setItem('sb_key',key);sbClient=c;
    closeSupabaseModal();showToast('تم حفظ الاتصال بنجاح');checkSession();
  }catch(err){box.textContent='فشل الاتصال: '+(err.message||'تأكد من الرابط والمفتاح');box.classList.remove('hidden');}
}
function initSupabase(){
  const k=getSavedKeys();
  if(!k.key){openSupabaseModal();return false;}
  try{sbClient=supabase.createClient(k.url,k.key);return true;}catch(e){openSupabaseModal();return false;}
}

/* ---------- الدخول ---------- */
async function checkSession(){
  if(!sbClient&&!initSupabase())return;
  try{const r=await sbClient.auth.getSession();if(r.error||!r.data.session)showLoginScreen();else showAppScreen(r.data.session.user);}
  catch(err){showLoginScreen();}
}
function showLoginScreen(){$('login').classList.remove('hidden');$('app').classList.add('hidden');}
function showAppScreen(user){currentUser=user||null;
  $('login').classList.add('hidden');$('app').classList.remove('hidden');
  loadInitialData();
}
async function handleLogin(e){
  e.preventDefault();if(!sbClient&&!initSupabase())return;
  const btn=$('login-btn'),box=$('login-error');
  btn.disabled=true;btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i><span>جارٍ الدخول...</span>';box.classList.add('hidden');
  try{
    const r=await sbClient.auth.signInWithPassword({email:$('login-email').value.trim(),password:$('login-password').value});
    if(r.error)throw r.error;
    $('login-password').value='';showAppScreen(r.data.user);
  }catch(err){box.textContent=err.message==='Invalid login credentials'?'البريد أو كلمة المرور غير صحيحة.':'خطأ في الدخول: '+(err.message||'');box.classList.remove('hidden');}
  finally{btn.disabled=false;btn.innerHTML='<i class="fa-solid fa-arrow-right-to-bracket"></i><span>تسجيل الدخول</span>';}
}
async function handleLogout(){if(typeof window.clearOfflineReadCache==='function')await window.clearOfflineReadCache();if(sbClient)await sbClient.auth.signOut();currentUser=null;resetLinesCache();myProfile=null;profiles=[];avatarUrls={};renderHeaderAvatar();teardownChat();showToast('تم تسجيل الخروج','info');showLoginScreen();}

/* ---------- تحميل البيانات ---------- */
let receivedAtManual=false,receivedAtTimer=null;
function nowLocalIso(){const n=new Date();n.setMinutes(n.getMinutes()-n.getTimezoneOffset());return n.toISOString().slice(0,16);}
function syncReceivedAt(force){
  const el=$('received-at');if(!el)return;
  if(force)receivedAtManual=false;
  if(!receivedAtManual&&document.activeElement!==el)el.value=nowLocalIso();
}
function initReceivedAtClock(){
  const el=$('received-at');
  if(el&&!el.dataset.liveBound){
    el.dataset.liveBound='1';
    el.addEventListener('input',()=>{receivedAtManual=true;});
    el.addEventListener('change',()=>{receivedAtManual=true;});
  }
  syncReceivedAt(true);
  if(!receivedAtTimer)receivedAtTimer=setInterval(()=>syncReceivedAt(false),15000);
}
window.syncReceivedAt=syncReceivedAt;
window.__homeTargetsMap={};
async function loadHomeTargets(){
  if(!sbClient)return;
  try{
    const ym=new Date().toLocaleDateString('en-CA').slice(0,7);
    const r=await sbClient.from('emp_targets').select('user_id,target,services_target').eq('month',ym);
    if(!r.error&&Array.isArray(r.data)){
      const m={};
      r.data.forEach(x=>{if(x&&x.user_id)m[String(x.user_id)]={target:Number(x.target)||0,services_target:Number(x.services_target)||0};});
      window.__homeTargetsMap=m;
      if(currentTab==='home'&&typeof renderHomeTab==='function')renderHomeTab();
    }
  }catch(e){}
}
async function loadInitialData(){
  await Promise.all([loadServices(),loadRecentRequests(),loadProfiles(),loadHomeTargets()]);
  renderPaymentMethodButtons();
  renderQuickServicesGrid();
  if(!$('tx-id').value)generateNewTxId();
  initReceivedAtClock();
  updateOrderProgressBar();
  initChat();
}
async function loadServices(){
  if(!sbClient)return;
  const r=await sbClient.from('services').select('*').order('name');
  if(r.error)return showError('تعذّر تحميل الخدمات',r.error);
  allServices=r.data||[];
  $('svc-datalist').innerHTML=allServices.map(s=>'<option value="'+escapeHtml(s.name)+'">'+(s.unit_price!=null?fmtNum(s.unit_price)+' ج.م':'')+'</option>').join('');
  renderQuickServicesGrid();
}

/* ---- تحميل المعاملات: آخر 1000 بسرعة، وبعدها الأرشيف كله بالتدريج في الخلفية ---- */
const DATA_FROM='2026-10-01';
const DATA_FROM_TS=DATA_FROM+'T00:00:00';
let archiveState={done:false,loading:false,failed:false,total:null},archiveRun=0;
function paintArchiveBar(){
  let b=$('archive-bar');
  if(!b){document.body.insertAdjacentHTML('beforeend','<div id="archive-bar" class="hidden"></div>');b=$('archive-bar');}
  const s=archiveState,base='fixed bottom-3 left-3 z-[90] rounded-full border px-3 py-1.5 text-[11px] font-semibold shadow-lg ';
  if(s.failed){b.className=base+'border-rose-300 bg-rose-50 text-rose-700';b.innerHTML='<i class="fa-solid fa-triangle-exclamation ms-1"></i>تعذّر تحميل كل البيانات، الأرقام ممكن تكون ناقصة. اعمل تحديث للصفحة';return;}
  if(s.loading){b.className=base+'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300';b.innerHTML='<i class="fa-solid fa-spinner fa-spin ms-1"></i>جارٍ تحميل باقي بيانات الشهر... '+allRequestLines.length+(s.total?' / '+s.total:'');return;}
  b.className='hidden';b.innerHTML='';
}
function resetLinesCache(){archiveRun++;archiveState={done:false,loading:false,failed:false,total:null};allRequestLines=[];groupedOrders=[];paintArchiveBar();}
function mergeLines(fresh,win){
  const map=new Map(allRequestLines.map(l=>[String(l.id),l]));
  if(win){
    const floor=fresh.length<win?-Infinity:fresh.reduce((m,l)=>Math.min(m,Number(l.id)),Infinity);
    const keep=new Set(fresh.map(l=>String(l.id)));
    map.forEach((l,k)=>{if(Number(l.id)>=floor&&!keep.has(k))map.delete(k);});
  }
  fresh.forEach(l=>map.set(String(l.id),l));
  allRequestLines=Array.from(map.values()).sort((a,b)=>Number(b.id)-Number(a.id));
}
function refreshLineViews(){
  groupRequestsByTransaction();renderRecentRequests();renderClientDatalists();updateExecutorsFilterOptions();renderQuickServicesGrid();
  if(typeof window.updateHeaderLateBadge==='function')window.updateHeaderLateBadge();
  if(currentTab==='home'&&typeof renderHomeTab==='function')renderHomeTab();
  if(currentTab==='dash')renderDashboardMetrics();
  if(currentTab==='exec')filterExecSheet();
  if(currentTab==='cash')filterCashSheet();
  if(currentTab==='team')renderTeam();
  if(currentTab==='search'&&($('search-key').value||'').trim())executeSearch();
}
async function loadArchive(){
  const run=++archiveRun,s=archiveState;s.loading=true;s.failed=false;
  try{
    const c=await sbClient.from('request_lines').select('id',{count:'exact',head:true}).gte('received_at',DATA_FROM_TS);
    if(run!==archiveRun)return;
    s.total=c.error?null:c.count;paintArchiveBar();
    while(true){
      if(!allRequestLines.length)break;
      if(!allRequestLines.every(l=>Number.isFinite(Number(l.id))))throw new Error('معرّف البنود مش رقمي');
      const minId=allRequestLines.reduce((m,l)=>Math.min(m,Number(l.id)),Infinity);
      const r=await sbClient.from('request_lines').select('*').gte('received_at',DATA_FROM_TS).lt('id',minId).order('id',{ascending:false}).limit(1000);
      if(run!==archiveRun)return;
      if(r.error)throw r.error;
      const rows=r.data||[];
      if(rows.length){mergeLines(rows,0);refreshLineViews();paintArchiveBar();}
      if(rows.length<1000)break;
    }
    s.done=true;
  }catch(err){if(run!==archiveRun)return;s.failed=true;console.error('archive',err);}
  s.loading=false;paintArchiveBar();
}
async function loadRecentRequests(){
  if(!sbClient)return;
  const LIM=1000;
  const r=await sbClient.from('request_lines').select('*').gte('received_at',DATA_FROM_TS).order('id',{ascending:false}).limit(LIM);
  if(r.error)return showError('فشل تحميل المعاملات',r.error);
  try{
    mergeLines(r.data||[],LIM);
    refreshLineViews();
  }catch(err){showError('خطأ أثناء عرض البيانات',err);}
  if(!archiveState.done&&!archiveState.loading){if((r.data||[]).length>=LIM)loadArchive();else archiveState.done=true;}
}
function groupRequestsByTransaction(){
  const map=new Map();
  allRequestLines.forEach(function(line){
    const tx=line.transaction_id||('TX-'+line.id);
    if(!map.has(tx))map.set(tx,{transaction_id:tx,client_name:line.client_name,phone:line.phone,address:line.address,employee:line.employee,payment_method:line.payment_method,receiver:line.receiver,received_at:line.received_at,rn_nm:line.rn_nm,notes:line.notes,created_at:line.created_at,grand_total:0,lines:[]});
    const o=map.get(tx);o.lines.push(line);o.grand_total+=Number(line.total)||0;
  });
  groupedOrders=Array.from(map.values());
}

/* ---------- شريط تقدم تسجيل الطلب التفاعلي (#new-order-progress-wrap) ---------- */
function updateOrderProgressBar(){
  const wrap=$('new-order-progress-wrap');if(!wrap)return;
  const clientName=(($('client-name')&&$('client-name').value)||'').trim();
  const phone=(($('phone')&&$('phone').value)||'').replace(/\D/g,'');
  const address=(($('address')&&$('address').value)||'').trim();
  const emp=(($('employee')&&$('employee').value)||'').trim();
  const pay=(($('payment-method-val')&&$('payment-method-val').value)||'').trim();
  const lines=Array.from(($('lines-container')||{children:[]}).children);

  let hasService=false,allPriced=false,hasExec=false,svcCount=0;
  lines.forEach(el=>{
    const sn=((el.querySelector('.svc-name')&&el.querySelector('.svc-name').value)||'').trim();
    const pr=parseFloat((el.querySelector('.svc-price')&&el.querySelector('.svc-price').value)||0);
    const q=parseFloat((el.querySelector('.svc-qty')&&el.querySelector('.svc-qty').value)||0);
    const ex=((el.querySelector('.svc-executor')&&el.querySelector('.svc-executor').value)||'').trim();
    const co=parseFloat((el.querySelector('.svc-cost')&&el.querySelector('.svc-cost').value)||0);
    if(sn){
      hasService=true;
      svcCount++;
      if(pr>0&&q>0)allPriced=true;
      if(ex||co>0)hasExec=true;
    }
  });

  // حساب النسبة من 100%
  let pct=0;
  const step1Done=clientName.length>=2&&phone.length>=8;
  const step1Part=clientName.length>=2||phone.length>=4;
  if(clientName.length>=2)pct+=18;
  if(phone.length>=8)pct+=12;else if(phone.length>=4||address.length>=2)pct+=6;

  const step2Done=hasService&&allPriced;
  if(hasService)pct+=20;
  if(allPriced)pct+=15;

  const step3Done=hasService&&(hasExec||allPriced);
  if(hasService&&hasExec)pct+=15;else if(hasService)pct+=8;

  const step4Done=step1Done&&step2Done&&!!emp&&!!pay;
  if(pay)pct+=10;
  if(emp&&hasService)pct+=10;else if(emp)pct+=5;
  if(step1Done&&step2Done&&step3Done&&step4Done)pct=100;
  pct=Math.min(100,Math.max(0,Math.round(pct)));

  const fill=$('nop-bar-fill'),badgeEl=$('nop-pct-badge'),sFill=$('s-prog-fill'),sPct=$('s-prog-pct');
  if(fill)fill.style.width=pct+'%';
  if(badgeEl)badgeEl.textContent=pct+'%';
  if(sFill)sFill.style.width=pct+'%';
  if(sPct)sPct.textContent=pct+'%';

  const setStepState=(idx,done,active,subText)=>{
    const el=$('nop-step-'+idx),sub=$('nop-step-'+idx+'-sub');
    if(!el)return;
    el.classList.toggle('done',!!done);
    el.classList.toggle('active',!done&&!!active);
    const dot=el.querySelector('.nop-step-dot');
    if(dot)dot.innerHTML=done?'<i class="fa-solid fa-check text-[10px]"></i>':String(idx);
    if(sub&&subText)sub.textContent=subText;
  };

  setStepState(1,step1Done,!step1Done,step1Done?(clientName+' · '+phone):(step1Part?'أكمل رقم الموبايل':'الاسم ورقم الموبايل'));
  setStepState(2,step2Done,step1Done&&!step2Done,step2Done?(svcCount+' خدمة محددة'):(hasService?'حدد سعر الخدمة':'اختر من الكروت أو القائمة'));
  setStepState(3,step3Done,step2Done&&!step3Done,hasExec?'تم تحديد المنفذ':'تحديد المنفذ والتكلفة');
  setStepState(4,step4Done,step2Done&&!step4Done,step4Done?'جاهز للحفظ 100% ✓':('الدفع: '+(pay||'كاش')));

  const titleEl=$('nop-status-title'),subEl=$('nop-status-sub'),icEl=$('nop-icon');
  if(pct>=100){
    if(titleEl)titleEl.textContent='مكتمل وجاهز للحفظ ✓';
    if(subEl)subEl.textContent='';
    if(icEl)icEl.className='flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-600 text-white text-[11px] font-bold';
  }else{
    if(titleEl)titleEl.textContent='خطوات التسجيل';
    if(subEl)subEl.textContent='';
    if(icEl)icEl.className='flex h-6 w-6 items-center justify-center rounded-lg bg-violet-600 text-white text-[11px] font-bold';
  }
}
window.updateOrderProgressBar=updateOrderProgressBar;

function focusOrderStep(stepNum){
  const map={1:'client-name',2:'order-step-card-2',3:'lines-container',4:'order-step-card-3'};
  const target=$(map[stepNum]);
  if(!target)return;
  target.scrollIntoView({behavior:'smooth',block:'center'});
  if(stepNum===1&&$('client-name'))setTimeout(()=>$('client-name').focus(),220);
}
window.focusOrderStep=focusOrderStep;

/* ---------- كروت الاختيار السريع للخدمات في شاشة طلب جديد ---------- */
function getPopularCatalogServices(){
  const counts=new Map();
  allRequestLines.forEach(l=>{
    const k=normName(l.service||'');
    if(k)counts.set(k,(counts.get(k)||0)+1);
  });
  let list=allServices.slice();
  if(!list.length){
    const seen=new Map();
    allRequestLines.forEach(l=>{
      const nm=(l.service||'').trim();
      const k=normName(nm);
      if(nm&&!seen.has(k)){
        seen.set(k,{name:nm,unit_price:l.unit_price||0,exec_cost:l.exec_unit_cost||0,executor:l.executor||''});
      }
    });
    list=Array.from(seen.values());
  }
  list.sort((a,b)=>(counts.get(normName(b.name))||0)-(counts.get(normName(a.name))||0));
  return list;
}

function getSelectedServicesSet(){
  const s=new Set();
  Array.from(($('lines-container')||{children:[]}).children).forEach(el=>{
    const v=((el.querySelector('.svc-name')&&el.querySelector('.svc-name').value)||'').trim();
    if(v)s.add(normName(v));
  });
  return s;
}

function renderQuickServicesGrid(){
  const grid=$('quick-services-grid');if(!grid)return;
  const list=getPopularCatalogServices();
  if(!list.length){
    grid.innerHTML='';
    return;
  }
  const limit=showAllQuickServices?18:6;
  const shown=list.slice(0,limit);
  const selectedSet=getSelectedServicesSet();
  const btn=$('quick-svc-toggle-btn');
  if(btn){
    btn.classList.toggle('hidden',list.length<=6);
    btn.textContent=showAllQuickServices?'عرض أقل ('+6+')':'عرض المزيد ('+Math.min(18,list.length)+')';
  }
  grid.innerHTML=shown.map(s=>{
    const isOn=selectedSet.has(normName(s.name));
    const price=s.unit_price!=null?fmtNum(s.unit_price)+' ج.م':'—';
    return '<button type="button" data-qsvc="'+escapeHtml(s.name)+'" onclick="toggleQuickService(this.dataset.qsvc)" class="qsvc-card '+(isOn?'on':'')+'">'+
      '<div class="flex items-start justify-between gap-2 w-full">'+
        '<span class="font-bold text-xs sm:text-sm text-ink dark:text-white leading-snug text-right">'+escapeHtml(s.name)+'</span>'+
        '<span class="qsvc-check shrink-0"><i class="fa-solid fa-check"></i></span>'+
      '</div>'+
      '<div class="flex items-center justify-between gap-2 w-full mt-1 text-[11px] text-slate-500 dark:text-slate-400">'+
        '<span class="font-bold font-mono text-brand-600 dark:text-violet-300">'+escapeHtml(price)+'</span>'+
        (s.executor?'<span class="truncate max-w-[110px]">'+escapeHtml(s.executor)+'</span>':'')+
      '</div>'+
    '</button>';
  }).join('');
}
window.renderQuickServicesGrid=renderQuickServicesGrid;

function toggleAllQuickServices(){
  showAllQuickServices=!showAllQuickServices;
  renderQuickServicesGrid();
}
window.toggleAllQuickServices=toggleAllQuickServices;

function toggleQuickService(svcName){
  if(!svcName)return;
  const targetNorm=normName(svcName);
  const container=$('lines-container');if(!container)return;
  const lines=Array.from(container.children);
  const existing=lines.find(el=>normName((el.querySelector('.svc-name')&&el.querySelector('.svc-name').value)||'')===targetNorm);

  if(existing){
    if(lines.length>1){
      existing.remove();
    }else{
      existing.querySelector('.svc-name').value='';
      existing.querySelector('.svc-price').value=0;
      existing.querySelector('.svc-cost').value=0;
      existing.querySelector('.svc-executor').value='';
      existing.querySelector('.svc-qty').value=1;
    }
    calculateTotals();
    renderQuickServicesGrid();
    return;
  }

  let targetLine=lines.find(el=>!((el.querySelector('.svc-name')&&el.querySelector('.svc-name').value)||'').trim());
  if(!targetLine){
    addServiceLine();
    targetLine=container.lastElementChild;
  }
  if(targetLine){
    const inp=targetLine.querySelector('.svc-name');
    if(inp){
      inp.value=svcName;
      onServiceSelected(targetLine.id,svcName);
    }
  }
  renderQuickServicesGrid();
}
window.toggleQuickService=toggleQuickService;

function resetNewOrderForm(){
  ['client-name','phone','address','rn-nm','notes','discount-pct'].forEach(id=>{if($(id))$(id).value='';});
  if($('client-whatsapp-box'))$('client-whatsapp-box').classList.add('hidden');
  if($('s-client'))$('s-client').textContent='—';
  syncReceivedAt(true);
  generateNewTxId();
  if($('lines-container'))$('lines-container').innerHTML='';
  serviceLineCounter=0;
  addServiceLine();
  renderQuickServicesGrid();
  updateOrderProgressBar();
  if($('client-name'))$('client-name').focus();
}
window.resetNewOrderForm=resetNewOrderForm;

function submitOrderWithMode(mode){
  window.__saveOrderMode=mode||'normal';
  const form=$('req-form');
  if(form){
    if(typeof form.requestSubmit==='function')form.requestSubmit();
    else form.dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}));
  }
}
window.submitOrderWithMode=submitOrderWithMode;

/* ---------- شاشة المعاملات المستقلة (#tab-tx) + شريط حالة الطلب التفاعلي ---------- */
function RLIM(){return window.__recentLimit?window.__recentLimit():20;}
function setRecentMode(m){
  recentMode=m;
  renderRecentRequests();
}
function setTxStatusFilter(flt){
  txStatusFilter=flt||'all';
  if(flt!=='today'&&recentMode==='today'&&flt==='all')recentMode='all';
  document.querySelectorAll('#tx-status-chips .tx-flt-chip').forEach(b=>{
    b.classList.toggle('on',b.getAttribute('data-txf')===txStatusFilter);
  });
  renderRecentRequests();
}
window.setTxStatusFilter=setTxStatusFilter;

function renderMyTodayMiniList(todayOrders){
  const box=$('my-today-mini-list');if(!box)return;
  const meName=normName((myProfile&&myProfile.full_name)||'');
  let list=todayOrders.filter(o=>!meName||normName(o.employee||'')===meName);
  if(!list.length)list=todayOrders;
  const top=list.slice(0,4);
  if(!top.length){
    box.innerHTML='<div class="py-4 text-center text-xs text-slate-400">لا توجد معاملات مسجلة اليوم بعد</div>';
    return;
  }
  box.innerHTML=top.map(o=>{
    const st=getOrderStatus(o);
    const svcs=o.lines.map(l=>l.service).filter(Boolean).slice(0,2).join(' + ');
    const tm=formatTimeOnly(o.received_at||o.created_at);
    return '<button type="button" data-tx="'+escapeHtml(o.transaction_id)+'" onclick="openTxInTransactionsTab(this.dataset.tx)" class="w-full flex items-center justify-between gap-2.5 p-2.5 rounded-xl border border-slate-100 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 text-right transition">'+
      '<div class="min-w-0">'+
        '<div class="font-bold text-xs text-ink dark:text-white truncate">'+escapeHtml(o.client_name||'—')+'</div>'+
        '<div class="text-[11px] text-slate-400 truncate mt-0.5">'+escapeHtml(svcs||'—')+(tm?' · '+escapeHtml(tm):'')+'</div>'+
      '</div>'+
      '<div class="shrink-0">'+badge(st)+'</div>'+
    '</button>';
  }).join('');
}

function openTxInTransactionsTab(tx){
  selectedInspectorTx=tx;
  switchTab('tx');
  renderRecentRequests();
}
window.openTxInTransactionsTab=openTxInTransactionsTab;

function syncTxInspectorLayout(){
  const wrap=$('tx-split-wrap'),aside=$('tx-inspector-aside');
  const isOpen=!!selectedInspectorTx;
  if(wrap)wrap.classList.toggle('has-inspector',isOpen);
  if(aside)aside.classList.toggle('hidden',!isOpen);
}

function closeTxInspector(){
  selectedInspectorTx=null;
  syncTxInspectorLayout();
  document.querySelectorAll('#recent-table-body tr').forEach(tr=>tr.classList.remove('tx-row-selected'));
  document.querySelectorAll('#recent-cards-container > [data-tx]').forEach(c=>c.classList.remove('ring-2','ring-violet-500'));
}
window.closeTxInspector=closeTxInspector;

function selectTxForInspector(tx,openModalOnMobile){
  const tStr=String(tx||'');
  if(!tStr){closeTxInspector();return;}
  if(selectedInspectorTx===tStr&&!openModalOnMobile){
    closeTxInspector();
    return;
  }
  selectedInspectorTx=tStr;
  syncTxInspectorLayout();
  document.querySelectorAll('#recent-table-body tr').forEach(tr=>{
    const b=tr.querySelector('[data-tx]');
    tr.classList.toggle('tx-row-selected',!!(b&&String(b.dataset.tx)===selectedInspectorTx));
  });
  document.querySelectorAll('#recent-cards-container > [data-tx]').forEach(c=>{
    const on=String(c.dataset.tx)===selectedInspectorTx;
    c.classList.toggle('ring-2',on);
    c.classList.toggle('ring-violet-500',on);
  });
  renderTxInspector(selectedInspectorTx);
  if(window.innerWidth<1024){
    const el=$('tx-inspector-aside');
    if(el)setTimeout(()=>el.scrollIntoView({behavior:'smooth',block:'nearest'}),60);
  }
}
window.selectTxForInspector=selectTxForInspector;

/* حساب نسبة التقدم لكل خدمة ومتوسط تقدم الطلب بالتساوي (القسمان 5.3 و 5.4 و 14) */
function getLinePct(st){
  if(st==='Delivered'||st==='delivered')return 100;
  if(st==='Complete'||st==='complete')return 75;
  if(st==='Under Review'||st==='under_review')return 50;
  return 25;
}
function getLineStageColor(st){
  if(st==='Delivered'||st==='delivered')return '#10b981';
  if(st==='Complete'||st==='complete')return '#14b8a6';
  if(st==='Under Review'||st==='under_review')return '#f59e0b';
  return '#8b5cf6';
}
function getOrderPct(oOrStatuses){
  if(!oOrStatuses)return 25;
  const arr=Array.isArray(oOrStatuses)?oOrStatuses:(oOrStatuses.lines||[]).map(l=>l.status||'In Progress');
  if(!arr.length)return 25;
  const sum=arr.reduce((acc,s)=>acc+getLinePct(s),0);
  return Math.round(sum/arr.length);
}
window.getLinePct=getLinePct;
window.getOrderPct=getOrderPct;

/* سجل الطوابع الزمنية الفعلية لمراحل كل خدمة من line_stage_events (القسم 5.4) */
const lineStageEventsCache={};
const STAGE_EVENT_LABELS={
  'in_progress':'بدء التنفيذ',
  'under_review':'مرحلة المراجعة / كود التنفيذ',
  'complete':'الجاهزية للتسليم',
  'delivered':'التسليم الفعلي'
};
function formatLineStageEventsHtml(l){
  const lid=String(l.id);
  const evs=lineStageEventsCache[lid];
  const pills=[];
  if(Array.isArray(evs)&&evs.length){
    const byStage={};
    evs.forEach(e=>{if(e&&e.stage&&e.at)byStage[e.stage]=e.at;});
    ['in_progress','under_review','complete','delivered'].forEach(stKey=>{
      if(byStage[stKey]){
        pills.push('<span class="inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700 px-2 py-0.5 text-[10.5px] text-slate-600 dark:text-slate-300"><b class="text-ink dark:text-white">'+escapeHtml(STAGE_EVENT_LABELS[stKey])+':</b> <span>'+escapeHtml(formatDateTime(byStage[stKey]))+'</span></span>');
      }
    });
  }else{
    const startAt=l.exec_start_date?formatDateOnly(l.exec_start_date):formatDateTime(lineDate(l));
    if(startAt&&startAt!=='—'){
      pills.push('<span class="inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700 px-2 py-0.5 text-[10.5px] text-slate-600 dark:text-slate-300"><b class="text-ink dark:text-white">بدء التنفيذ:</b> <span>'+escapeHtml(startAt)+'</span></span>');
    }
    if(l.status==='Delivered'&&l.delivered_date){
      pills.push('<span class="inline-flex items-center gap-1 rounded-md bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 text-[10.5px] text-emerald-700 dark:text-emerald-300"><b>التسليم الفعلي:</b> <span>'+escapeHtml(formatDateOnly(l.delivered_date))+'</span></span>');
    }
  }
  return pills.length?pills.join(' '):'<span class="text-[10.5px] text-slate-400">لم تُسجّل انتقالات إضافية بعد</span>';
}
async function loadLineStageEvents(tx){
  if(!sbClient||!tx)return;
  try{
    const r=await sbClient.from('line_stage_events').select('line_id,stage,at').eq('transaction_id',String(tx)).order('at',{ascending:true});
    if(r.error||!Array.isArray(r.data))return;
    const grouped={};
    r.data.forEach(row=>{
      const k=String(row.line_id);
      if(!grouped[k])grouped[k]=[];
      grouped[k].push(row);
    });
    Object.keys(grouped).forEach(k=>{lineStageEventsCache[k]=grouped[k];});
    const o=groupedOrders.find(x=>String(x.transaction_id)===String(tx));
    if(o&&o.lines){
      o.lines.forEach(l=>{
        document.querySelectorAll('[data-line-events="'+String(l.id)+'"]').forEach(el=>{
          el.innerHTML=formatLineStageEventsHtml(l);
        });
      });
    }
  }catch(e){}
}

/* بطاقة مستقلة وواضحة لكل بند خدمة داخل تفاصيل الطلب واللوحة الجانبية (القسمان 5.3 و 5.4) */
function buildServiceDetailCard(l,idx,mode){
  const st=l.status||'In Progress';
  const pct=getLinePct(st);
  const col=getLineStageColor(st);
  const disc=Number(l.discount_pct)||0;
  const listPr=Number(l.list_price)||Number(l.unit_price)||0;
  const peopleHtml=typeof window.getRequestPeopleForLineHtml==='function'?window.getRequestPeopleForLineHtml(l.transaction_id,l.id,l.service):'';
  const ctrlHtml=mode==='modal'
    ?statusSelect(l)
    :'<div class="pt-1"><label class="text-[10.5px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">تحديث حالة هذه الخدمة فقط:</label><select onchange="setLineStatus(\''+escapeHtml(l.id)+'\',this.value)" class="field !py-1.5 text-xs">'+Object.keys(STATUS_PATCH).map(s=>'<option value="'+s+'"'+(s===st?' selected':'')+'>'+statusLabel(s)+'</option>').join('')+'</select></div>';

  return '<div class="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/90 p-3 space-y-2 shadow-2xs" data-svc-card-id="'+escapeHtml(l.id)+'">'+
    '<div class="flex flex-wrap items-center justify-between gap-2">'+
      '<div class="flex items-center gap-2 min-w-0">'+
        '<span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-bold font-mono">'+(idx+1)+'</span>'+
        '<span class="font-bold text-xs sm:text-sm text-ink dark:text-white truncate">'+escapeHtml(l.service||'—')+'</span>'+
      '</div>'+
      '<div class="flex items-center gap-1.5 shrink-0">'+
        badge(st)+
      '</div>'+
    '</div>'+

    '<div class="flex flex-wrap items-center justify-between gap-2 text-xs pt-1 border-t border-slate-100 dark:border-slate-800">'+
      '<div><span class="text-slate-400 ms-1">السعر:</span><span class="font-bold font-mono text-ink dark:text-white">'+escapeHtml(formatCurrency(l.total))+'</span></div>'+
      '<div><span class="text-slate-400 ms-1">المنفذ:</span><span class="font-semibold text-ink dark:text-white">'+escapeHtml(l.executor||'—')+'</span></div>'+
    '</div>'+

    '<details class="svc-exp pt-1 border-t border-slate-100 dark:border-slate-800">'+
      '<summary class="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400 py-1 hover:text-ink dark:hover:text-white">'+
        '<span>تفاصيل</span>'+
        '<i class="fa-solid fa-chevron-down text-[10px] svc-exp-ic transition-transform"></i>'+
      '</summary>'+
      '<div class="space-y-2.5 pt-2">'+
        /* شريط تقدم مستقل للخدمة */
        '<div class="space-y-1">'+
          '<div class="flex items-center justify-between text-[10.5px] text-slate-500 dark:text-slate-400">'+
            '<span>شريط تقدم الخدمة</span>'+
            '<span data-line-st-lbl="'+escapeHtml(l.id)+'" class="font-semibold" style="color:'+col+'">'+escapeHtml(statusLabel(st))+' (<span data-line-pct-lbl="'+escapeHtml(l.id)+'">'+pct+'%</span>)</span>'+
          '</div>'+
          '<div class="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">'+
            '<div data-line-bar="'+escapeHtml(l.id)+'" class="h-full rounded-full transition-all duration-300" style="width:'+pct+'%;background:'+col+'"></div>'+
          '</div>'+
        '</div>'+

        /* حقول الخدمة المفصولة والواضحة */
        '<div class="grid grid-cols-2 sm:grid-cols-3 gap-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 p-2.5 text-xs">'+
          '<div><span class="text-[10.5px] text-slate-400 block">العدد</span><span class="font-bold font-mono text-ink dark:text-white">'+fmtNum(l.qty)+'</span></div>'+
          '<div><span class="text-[10.5px] text-slate-400 block">سعر الوحدة</span><span class="font-bold font-mono text-ink dark:text-white">'+fmtNum(l.unit_price)+' ج.م'+(disc>0?' <small class="text-rose-500">(-'+fmtNum(disc)+'% من '+fmtNum(listPr)+')</small>':'')+'</span></div>'+
          '<div><span class="text-[10.5px] text-slate-400 block">إجمالي البند</span><span class="font-bold font-mono text-brand-600 dark:text-violet-300">'+formatCurrency(l.total)+'</span></div>'+
          '<div><span class="text-[10.5px] text-slate-400 block">المنفذ</span><span class="font-semibold text-ink dark:text-white">'+escapeHtml(l.executor||'—')+'</span></div>'+
          '<div><span class="text-[10.5px] text-slate-400 block">تكلفة التنفيذ</span><span class="font-bold font-mono text-ink dark:text-white">'+formatCurrency(execCostOf(l))+' <small class="text-slate-400 font-normal">('+fmtNum(l.exec_unit_cost||0)+'/وحدة)</small></span></div>'+
          '<div><span class="text-[10.5px] text-slate-400 block" dir="ltr">Service ID</span><span class="font-bold font-mono text-violet-700 dark:text-violet-300" dir="ltr">'+(l.service_ref?escapeHtml(l.service_ref):'—')+'</span></div>'+
        '</div>'+
        (l.notes?'<div class="text-[11px] text-amber-800 dark:text-amber-300 bg-amber-50/70 dark:bg-amber-950/30 rounded-lg px-2.5 py-1.5"><i class="fa-solid fa-note-sticky ms-1"></i>'+escapeHtml(l.notes)+'</div>':'')+
        peopleHtml+
        '<div class="space-y-1 pt-0.5">'+
          '<div class="text-[10.5px] font-semibold text-slate-400">تواريخ مراحل التنفيذ المسجلة:</div>'+
          '<div class="flex flex-wrap gap-1.5" data-line-events="'+escapeHtml(l.id)+'">'+formatLineStageEventsHtml(l)+'</div>'+
        '</div>'+
        ctrlHtml+
      '</div>'+
    '</details>'+
  '</div>';
}

/* معلومات مرحلة الطلب للشريط التفاعلي والحلقة الدائرية */
function getStageMeta(st,isLateFlag,customPct){
  if(st==='Delivered'){
    const p=customPct!=null?customPct:100;
    return {step:4,pct:p,barW:p,title:'تم التسليم',sub:'تم تسليم المعاملة للعميل',color:'#10b981',icon:'fa-circle-check',nextStatus:'In Progress',nextLabel:'قيد التنفيذ'};
  }
  if(st==='Complete'){
    const p=customPct!=null?customPct:75;
    return {step:3,pct:p,barW:p,title:'جاهزة للتسليم',sub:'مكتملة وفي انتظار التسليم',color:'#14b8a6',icon:'fa-box-open',nextStatus:'Delivered',nextLabel:'تم التسليم'};
  }
  if(st==='Under Review'){
    const p=customPct!=null?customPct:50;
    return {step:2,pct:p,barW:p,title:'تحت المراجعة',sub:'مراجعة المستندات والبيانات',color:'#f59e0b',icon:'fa-magnifying-glass',nextStatus:'In Progress',nextLabel:'قيد التنفيذ'};
  }
  if(isLateFlag){
    const p=customPct!=null?customPct:25;
    return {step:2,pct:p,barW:p,title:'متأخرة',sub:'تجاوزت موعد التسليم المحدد',color:'#f43f5e',icon:'fa-clock',nextStatus:'Complete',nextLabel:'مكتمل'};
  }
  const p=customPct!=null?customPct:25;
  return {step:2,pct:p,barW:p,title:'قيد التنفيذ',sub:'جاري التنفيذ لدى المنفذ',color:'#8b5cf6',icon:'fa-gears',nextStatus:'Complete',nextLabel:'مكتمل'};
}

/* بناء شريط مراحل المعاملة والحلقة الدائرية */
function buildInteractiveStatusWidgets(tx,currentSt,isLateFlag,mode,customPct){
  const o=groupedOrders.find(x=>String(x.transaction_id)===String(tx));
  const derivedPct=customPct!=null?customPct:(o?getOrderPct(o):null);
  const m=getStageMeta(currentSt,isLateFlag,derivedPct);
  const r=44,circ=Math.round(2*Math.PI*r);
  const offset=Math.round(circ*(1-m.pct/100));
  const clickFn=stVal=>mode==='modal'
    ?("stageTxStatus('"+stVal+"')")
    :("inspectorChangeStatus('"+escapeHtml(tx)+"','"+stVal+"')");
  const cycleFn=mode==='modal'
    ?("stageTxStatus('"+m.nextStatus+"')")
    :("inspectorChangeStatus('"+escapeHtml(tx)+"','"+m.nextStatus+"')");

  const nodeCls=idx=>{
    if(m.step>idx||(m.step===4&&idx===4))return 'tx-step-node done';
    if(m.step===idx)return 'tx-step-node current';
    return 'tx-step-node';
  };
  const nodeIcon=(idx,defIc)=>{
    if(m.step>idx||(m.step===4&&idx===4))return '<i class="fa-solid fa-check"></i>';
    return '<i class="fa-solid '+defIc+'"></i>';
  };

  return '<div class="space-y-3" data-status-widget-tx="'+escapeHtml(tx)+'">'+
    '<div onclick="'+cycleFn+'" class="tx-ring-gauge-box" title="تحديث الحالة">'+
      '<div class="relative flex items-center justify-center" style="width:110px;height:110px">'+
        '<svg class="tx-ring-svg" width="110" height="110" viewBox="0 0 110 110">'+
          '<circle class="tx-ring-bg" cx="55" cy="55" r="'+r+'"></circle>'+
          '<circle class="tx-ring-fg" cx="55" cy="55" r="'+r+'" stroke="'+m.color+'" stroke-dasharray="'+circ+'" stroke-dashoffset="'+offset+'"></circle>'+
        '</svg>'+
        '<div class="absolute inset-0 flex flex-col items-center justify-center text-center px-2">'+
          '<span class="font-mono font-extrabold text-sm text-white leading-none mb-0.5" style="color:'+m.color+'">'+m.pct+'%</span>'+
          '<span class="font-bold text-[11px] text-white leading-tight">'+escapeHtml(m.title)+'</span>'+
          '<span class="text-[9px] text-slate-400 mt-0.5">متوسط تقدم الخدمات</span>'+
        '</div>'+
      '</div>'+
    '</div>'+

    '<div class="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-black/25 p-3">'+
      '<div class="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mb-0.5 px-1">'+
        '<span class="font-bold text-ink dark:text-white">تقدم تنفيذ الخدمات (الإجمالي)</span>'+
        '<span class="font-mono font-bold" style="color:'+m.color+'">'+m.pct+'%</span>'+
      '</div>'+
      '<div class="tx-stepper-wrap">'+
        '<div class="tx-stepper-track"><div class="tx-stepper-fill" style="width:'+m.barW+'%"></div></div>'+
        '<div class="tx-stepper-nodes">'+
          '<button type="button" onclick="'+clickFn('In Progress')+'" class="tx-step-node done">'+
            '<span class="tx-step-circle"><i class="fa-solid fa-check"></i></span>'+
            '<span class="tx-step-label">قيد التنفيذ</span>'+
          '</button>'+
          '<button type="button" onclick="'+clickFn('Under Review')+'" class="'+nodeCls(2)+'">'+
            '<span class="tx-step-circle">'+nodeIcon(2,'fa-magnifying-glass')+'</span>'+
            '<span class="tx-step-label">المراجعة</span>'+
          '</button>'+
          '<button type="button" onclick="'+clickFn('Complete')+'" class="'+nodeCls(3)+'">'+
            '<span class="tx-step-circle">'+nodeIcon(3,'fa-box-open')+'</span>'+
            '<span class="tx-step-label">مكتمل</span>'+
          '</button>'+
          '<button type="button" onclick="'+clickFn('Delivered')+'" class="'+nodeCls(4)+'">'+
            '<span class="tx-step-circle">'+nodeIcon(4,'fa-flag-checkered')+'</span>'+
            '<span class="tx-step-label">تم التسليم</span>'+
          '</button>'+
        '</div>'+
      '</div>'+
    '</div>'+
  '</div>';
}

/* تحديث لوحة المعاينة الجانبية في شاشة المعاملات (#tx-inspector-panel) */
async function renderTxInspector(tx){
  const panel=$('tx-inspector-panel');if(!panel)return;
  if(!tx){
    closeTxInspector();
    return;
  }
  const o=groupedOrders.find(x=>String(x.transaction_id)===String(tx));
  if(!o){
    closeTxInspector();
    return;
  }
  selectedInspectorTx=String(o.transaction_id);
  syncTxInspectorLayout();
  const st=getOrderStatus(o);
  const late=isOrderLate(o);

  panel.innerHTML=
    '<div class="flex items-start justify-between gap-2 border-b border-slate-100 dark:border-white/10 pb-3">'+
      '<div class="min-w-0">'+
        '<div class="flex items-center gap-2">'+
          '<span class="font-bold text-sm text-ink dark:text-white font-mono" dir="ltr">Request ID: '+escapeHtml(o.transaction_id)+'</span>'+
          badge(st)+
        '</div>'+
        '<button type="button" '+ac(o.client_name)+' class="mt-1 font-bold text-xs sm:text-sm text-brand-600 dark:text-violet-300 hover:underline block text-right truncate">'+escapeHtml(o.client_name||'—')+(o.phone?' · <span class="font-mono" dir="ltr">'+escapeHtml(o.phone)+'</span>':'')+'</button>'+
      '</div>'+
      '<button type="button" onclick="closeTxInspector()" class="h-7 w-7 shrink-0 rounded-lg bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-300 hover:bg-rose-500/20 hover:text-rose-400 flex items-center justify-center transition" title="إغلاق"><i class="fa-solid fa-xmark text-xs"></i></button>'+
    '</div>'+

    buildInteractiveStatusWidgets(o.transaction_id,st,late,'inspector')+

    '<div class="rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 p-3 space-y-1.5 text-xs">'+
      '<div class="flex justify-between gap-2"><span class="text-slate-400">عدد الخدمات</span><span class="font-bold text-ink dark:text-white">'+o.lines.length+' خدمة</span></div>'+
      '<div class="flex justify-between gap-2"><span class="text-slate-400">الإجمالي النهائي</span><span class="font-bold text-brand-600 dark:text-violet-300 font-mono">'+escapeHtml(formatCurrency(o.grand_total))+' · '+escapeHtml(o.payment_method||'كاش')+'</span></div>'+
      '<div class="flex justify-between gap-2"><span class="text-slate-400">الموظف المسؤول</span><span class="font-bold text-ink dark:text-white">'+empCell(o.employee)+'</span></div>'+
      '<div class="flex justify-between gap-2"><span class="text-slate-400">مندوب الاستلام</span><span class="font-semibold text-ink dark:text-white">'+escapeHtml(o.receiver||'العميل شخصياً')+'</span></div>'+
    '</div>'+

    '<div class="space-y-2.5">'+
      '<h4 class="font-bold text-xs text-slate-500 dark:text-slate-400">بطاقات بنود الخدمات ('+o.lines.length+')</h4>'+
      o.lines.map((l,i)=>buildServiceDetailCard(l,i,'inspector')).join('')+
    '</div>'+

    '<div class="space-y-2 pt-1">'+
      '<div class="grid grid-cols-2 gap-1.5">'+
        '<button type="button" onclick="openTxModal(\''+escapeHtml(o.transaction_id)+'\')" class="btn-neo-pri text-xs py-2"><i class="fa-solid fa-up-right-and-down-left-from-center"></i><span>التفاصيل الكاملة</span></button>'+
        '<button type="button" onclick="printTxReceipt(\''+escapeHtml(o.transaction_id)+'\')" class="btn-neo-sec text-xs py-2"><i class="fa-solid fa-print"></i><span>الإيصال الرسمي</span></button>'+
        (canStaffEditTx()?'<button type="button" onclick="openTxEdit(\''+escapeHtml(o.transaction_id)+'\')" class="btn-neo-sec text-xs py-2 col-span-2"><i class="fa-solid fa-pen-to-square text-amber-500"></i><span>تعديل الطلب والخدمات</span></button>':'')+
      '</div>'+
    '</div>'+

    '<form onsubmit="inspectorAddComment(event,\''+escapeHtml(o.transaction_id)+'\')" class="flex gap-1.5 pt-0.5">'+
      '<input id="insp-cmt-in" type="text" required maxlength="500" placeholder="أضف تعليق..." class="field !py-1.5 text-xs flex-1">'+
      '<button id="insp-cmt-btn" type="submit" class="btn-neo-pri !py-1.5 !px-3 text-xs shrink-0"><i class="fa-solid fa-paper-plane"></i><span>إضافة</span></button>'+
    '</form>'+

    '<div class="pt-2 border-t border-slate-100 dark:border-white/10 space-y-2.5">'+
      '<h4 class="font-bold text-xs text-ink dark:text-white">سجل التغييرات والتعليقات</h4>'+
      '<div id="insp-timeline-box" class="tx-timeline max-h-56 overflow-y-auto pr-3.5 py-0.5">'+
        '<div class="text-xs text-slate-400">جارٍ التحميل...</div>'+
      '</div>'+
    '</div>';

  loadInspectorTimeline(o);
  loadLineStageEvents(o.transaction_id);
}

async function loadInspectorTimeline(o){
  const box=$('insp-timeline-box');if(!box||!o)return;
  const tx=String(o.transaction_id);
  const events=[];

  if(sbClient){
    try{
      const [audRes,cmtRes]=await Promise.all([
        sbClient.from('audit_log').select('at,user_name,action,service,details').eq('transaction_id',tx).order('at',{ascending:false}).limit(30),
        sbClient.from('tx_comments').select('id,author_name,body,created_at').eq('transaction_id',tx).order('created_at',{ascending:false}).limit(20)
      ]);
      if(!audRes.error&&Array.isArray(audRes.data)){
        audRes.data.forEach(a=>{
          let title='تحديث '+tx,desc='';
          if(a.action==='created'){
            title='طلب جديد '+tx;
            desc=(a.user_name||'موظف')+' سجّل طلب '+(a.service||'');
          }else if(a.action==='deleted'){
            title='حذف بند '+tx;
            desc=(a.user_name||'موظف')+' حذف بند '+(a.service||'');
          }else{
            const det=a.details||{};
            if(det.delivered&&det.delivered.new===true){
              title='تم التسليم '+tx;
              desc='تم تسليم '+(a.service||'المعاملة')+' بواسطة '+(a.user_name||'موظف');
            }else if(det.complete||det.under_review||det.delivered){
              title='تغيير حالة '+tx;
              desc='تحديث حالة '+(a.service||'المعاملة')+' بواسطة '+(a.user_name||'موظف');
            }else{
              title='تعديل بيانات '+tx;
              desc=(a.user_name||'موظف')+' عدّل بيانات في '+(a.service||'المعاملة');
            }
          }
          events.push({at:a.at,title:title,desc:desc});
        });
      }
      if(!cmtRes.error&&Array.isArray(cmtRes.data)){
        cmtRes.data.forEach(c=>{
          events.push({
            at:c.created_at,
            title:'تعليق '+tx,
            desc:(c.author_name||'موظف')+': «'+c.body+'»'
          });
        });
      }
    }catch(e){}
  }

  const initAt=o.received_at||o.created_at;
  if(!events.some(x=>x.title.indexOf('طلب جديد')===0)){
    events.push({
      at:initAt,
      title:'تم إنشاء الطلب',
      desc:'تسجيل الطلب بواسطة '+(o.employee||'موظف')
    });
  }

  events.sort((a,b)=>new Date(b.at||0)-new Date(a.at||0));

  if($('insp-timeline-box')!==box||selectedInspectorTx!==tx)return;
  box.innerHTML=events.slice(0,15).map(ev=>{
    const d=new Date(ev.at);
    const isRecent=(Date.now()-d.getTime())<120000;
    const tStr=isNaN(d)?'':(isRecent?'الآن':formatDateTime(ev.at));
    return '<div class="tx-tl-item">'+
      '<span class="tx-tl-dot"></span>'+
      '<div class="font-bold text-ink dark:text-white text-xs">'+escapeHtml(ev.title)+'</div>'+
      '<div class="text-slate-500 dark:text-slate-300 text-[11px] mt-0.5">'+escapeHtml(ev.desc)+'</div>'+
      '<div class="text-[10px] text-slate-400 mt-0.5 font-mono">'+escapeHtml(tStr)+'</div>'+
    '</div>';
  }).join('');
}

async function inspectorChangeStatus(tx,newStatus){
  if(!tx||!newStatus)return;
  await setTxStatus(tx,newStatus);
  renderTxInspector(tx);
  if(currentTab==='home')renderHomeTab();
}
window.inspectorChangeStatus=inspectorChangeStatus;

async function inspectorAddComment(e,tx){
  e.preventDefault();
  const inp=$('insp-cmt-in'),btn=$('insp-cmt-btn');
  if(!inp||!tx||!sbClient||!currentUser)return;
  const body=(inp.value||'').trim();if(!body)return;
  if(btn)btn.disabled=true;
  try{
    const r=await sbClient.from('tx_comments').insert({transaction_id:tx,author_id:currentUser.id,body:body});
    if(r.error)throw r.error;
    inp.value='';
    showToast('تم إضافة التعليق');
    renderTxInspector(tx);
  }catch(err){showError('تعذّر حفظ التعليق',err);}
  finally{if(btn)btn.disabled=false;}
}
window.inspectorAddComment=inspectorAddComment;

function renderRecentRequests(){
  const today=new Date().toLocaleDateString('en-CA');
  const td=groupedOrders.filter(o=>dayKey(o.received_at||o.created_at)===today);
  const tsum=td.reduce((s,o)=>s+o.grand_total,0);
  setT('t-sales',formatCurrency(tsum));setT('t-orders',String(td.length));
  setT('t-lines',String(td.reduce((s,o)=>s+o.lines.length,0)));setT('t-avg',formatCurrency(td.length?tsum/td.length:0));

  renderMyTodayMiniList(td);

  const openOrders=groupedOrders.filter(o=>getOrderStatus(o)!=='Delivered');
  const lateOrders=groupedOrders.filter(o=>isOrderLate(o));
  const readyOrders=groupedOrders.filter(o=>getOrderStatus(o)==='Complete');
  setT('tx-kpi-open',String(openOrders.length));
  setT('tx-kpi-late',String(lateOrders.length));
  setT('tx-kpi-ready',String(readyOrders.length));
  setT('tx-kpi-today',String(td.length));

  ['hdr-tx-badge','menu-tx-badge'].forEach(id=>{
    const b=$(id);if(!b)return;
    b.textContent=openOrders.length>99?'99+':String(openOrders.length);
    b.classList.toggle('hidden',!openOrders.length);
  });

  const q=(($('recent-q')&&$('recent-q').value)||'').trim().toLowerCase();
  let list=recentMode==='today'?td:groupedOrders;
  if(txStatusFilter&&txStatusFilter!=='all'){
    if(txStatusFilter==='open')list=list.filter(o=>getOrderStatus(o)!=='Delivered');
    else if(txStatusFilter==='late')list=list.filter(o=>isOrderLate(o));
    else list=list.filter(o=>getOrderStatus(o)===txStatusFilter);
  }
  if(q)list=list.filter(o=>(o.client_name||'').toLowerCase().includes(q)||(o.phone||'').includes(q)||String(o.transaction_id).toLowerCase().includes(q)||(o.lines||[]).some(l=>(l.service||'').toLowerCase().includes(q)||String(l.service_ref||'').toLowerCase().includes(q))||(typeof window.getRequestPeopleNamesText==='function'&&window.getRequestPeopleNamesText(o.transaction_id).toLowerCase().includes(q)));
  if(window.__recentFilter)list=window.__recentFilter(list);

  const on='rounded-lg px-2.5 py-1 text-xs font-semibold bg-white dark:bg-violet-600 text-brand-700 dark:text-white shadow-xs',off='rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-500';
  if($('rm-all'))$('rm-all').className=recentMode==='all'?on:off;
  if($('rm-today'))$('rm-today').className=recentMode==='today'?on:off;
  if($('recent-count'))$('recent-count').textContent=list.length+' معاملة'+(list.length>RLIM()?' (أحدث '+RLIM()+')':'');

  const shown=list.slice(0,RLIM());
  if(!shown.length){
    closeTxInspector();
    if($('recent-table-body'))$('recent-table-body').innerHTML='<tr><td colspan="8" class="px-6 py-10 text-center text-slate-400">لا توجد معاملات مطابقة</td></tr>';
    if($('recent-cards-container'))$('recent-cards-container').innerHTML='<div class="card p-8 text-center text-slate-400 text-xs">لا توجد معاملات مطابقة</div>';
    return;
  }

  /* لا نفتح الكارت الجانبي تلقائياً؛ يظل مغلقاً إلا إذا اختار المستخدم معاملة موجودة في القائمة */
  if(selectedInspectorTx&&!list.some(o=>String(o.transaction_id)===String(selectedInspectorTx))){
    selectedInspectorTx=null;
  }
  syncTxInspectorLayout();

  const sts=o=>isOrderLate(o)
    ?'<span class="st17-b" style="--sc:244,63,94;--sct:253,164,175">متأخر</span>'
    :[...new Set(o.lines.map(l=>l.status))].slice(0,2).map(badge).join(' ');

  if($('recent-table-body')){
    $('recent-table-body').innerHTML=shown.map(function(o){
      const isSel=!!selectedInspectorTx&&String(o.transaction_id)===String(selectedInspectorTx);
      const svcHtml='<div class="rc-svc-list">'+o.lines.map(l=>
        '<div class="rc-svc-pill">'+
          '<span class="rc-svc-name">'+escapeHtml(l.service||'—')+'</span>'+
          '<span class="rc-svc-qty" dir="ltr">×'+fmtNum(l.qty)+'</span>'+
        '</div>'
      ).join('')+'</div>';
      const wa=waLink(o.phone,'أهلاً '+o.client_name+'، بخصوص معاملتك رقم '+o.transaction_id+' — تساهيل');
      return '<tr onclick="selectTxForInspector(\''+escapeHtml(o.transaction_id)+'\',false)" class="cursor-pointer hover:bg-slate-50/80 dark:hover:bg-white/5 align-middle '+(isSel?'tx-row-selected':'')+'">'+
      '<td class="px-3 py-3 whitespace-nowrap" dir="ltr"><button type="button" '+at(o.transaction_id)+' class="rc-tx-pill">'+escapeHtml(o.transaction_id)+'</button></td>'+
      '<td class="px-3 py-3 font-bold text-ink dark:text-white min-w-[155px] max-w-[220px]">'+
        '<button type="button" '+ac(o.client_name)+' class="text-right text-start leading-snug hover:text-brand-600 hover:underline block w-full">'+escapeHtml(o.client_name)+'</button>'+
        (o.phone?'<div class="mt-1 rc-phone-pill !py-0.5 !px-2 !text-[11px]" dir="ltr"><span>'+escapeHtml(o.phone)+'</span>'+(wa?'<a href="'+wa+'" onclick="event.stopPropagation()" target="_blank" rel="noopener" class="text-emerald-500 hover:text-emerald-400"><i class="fa-brands fa-whatsapp"></i></a>':'')+'</div>':'')+
      '</td>'+
      '<td class="px-3 py-3">'+svcHtml+'</td>'+
      '<td class="px-3 py-3 text-xs whitespace-nowrap font-medium">'+empCell(o.employee)+'</td>'+
      '<td class="px-3 py-3 font-bold text-ink dark:text-white whitespace-nowrap text-xs sm:text-sm">'+formatCurrency(o.grand_total)+'</td>'+
      '<td class="px-3 py-3 whitespace-nowrap"><div class="flex flex-col items-start gap-1">'+sts(o)+'</div></td>'+
      '<td class="px-3 py-3 whitespace-nowrap">'+formatDateSplit(o.received_at||o.created_at)+'</td>'+
      '<td class="px-3 py-3 text-center whitespace-nowrap"><div class="inline-flex items-center justify-center gap-1.5">'+
        '<button type="button" '+at(o.transaction_id)+' class="p-2 rounded-lg bg-slate-100/80 dark:bg-white/10 text-slate-600 dark:text-slate-200 hover:bg-violet-500/20 hover:text-violet-300 transition" title="التفاصيل"><i class="fa-solid fa-eye text-xs"></i></button>'+
        '<button type="button" data-tx="'+escapeHtml(o.transaction_id)+'" onclick="event.stopPropagation();printTxReceipt(this.dataset.tx)" class="p-2 rounded-lg bg-violet-500/15 text-violet-600 dark:text-violet-300 hover:bg-violet-500/25 transition" title="طباعة إيصال"><i class="fa-solid fa-print text-xs"></i></button>'+
      '</div></td></tr>';
    }).join('');
  }

  if($('recent-cards-container')){
    $('recent-cards-container').innerHTML=shown.map(function(o){
      const isSel=!!selectedInspectorTx&&String(o.transaction_id)===String(selectedInspectorTx);
      const chips=o.lines.map(l=>'<div class="rc-svc-pill w-full"><span class="rc-svc-name">'+escapeHtml(l.service||'—')+'</span><span class="rc-svc-qty" dir="ltr">×'+fmtNum(l.qty)+'</span></div>').join('');
      return '<div data-tx="'+escapeHtml(o.transaction_id)+'" onclick="selectTxForInspector(\''+escapeHtml(o.transaction_id)+'\',true)" class="card lift w-full p-3.5 text-start block cursor-pointer '+(isSel?'ring-2 ring-violet-500':'')+'">'+
      '<div class="flex items-start justify-between gap-2"><div class="min-w-0"><div class="font-bold text-ink dark:text-white leading-snug">'+escapeHtml(o.client_name)+'</div><div class="mt-1 flex items-center gap-2 text-[11px] text-slate-400" dir="ltr"><span class="rc-tx-pill !py-0.5 !px-2 !text-[11px]">'+escapeHtml(o.transaction_id)+'</span>'+(o.phone?'<span>'+escapeHtml(o.phone)+'</span>':'')+'</div></div><div class="flex shrink-0 flex-wrap justify-end gap-1">'+sts(o)+'</div></div>'+
      '<div class="mt-2.5 flex flex-col gap-1.5">'+chips+'</div>'+
      '<div class="mt-2.5 flex items-end justify-between gap-2 border-t border-slate-100 dark:border-white/10 pt-2.5"><div class="min-w-0 text-[11px] text-slate-400"><div class="truncate font-medium">'+escapeHtml(o.employee||'—')+(o.receiver?' ← '+escapeHtml(o.receiver):'')+'</div><div>'+formatDateTime(o.received_at||o.created_at)+'</div></div><div class="flex items-center gap-2"><span class="font-bold text-xs sm:text-sm text-brand-600 dark:text-violet-300 whitespace-nowrap">'+formatCurrency(o.grand_total)+'</span><button type="button" '+at(o.transaction_id)+' class="px-2.5 py-1 rounded-lg bg-violet-600 text-white text-[11px] font-bold">التفاصيل</button></div></div></div>';
    }).join('');
  }

  if(selectedInspectorTx)renderTxInspector(selectedInspectorTx);
}

/* ---------- نموذج الخدمات ---------- */
function addServiceLine(){
  serviceLineCounter++;const id='line-'+serviceLineCounter;
  const d=document.createElement('div');d.id=id;
  d.className='p-3.5 sm:p-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50/60 dark:bg-white/[0.03] space-y-3';
  d.innerHTML='<div class="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium"><span>بند خدمة #'+serviceLineCounter+'</span><button type="button" onclick="removeServiceLine(\''+id+'\')" class="text-rose-500 hover:text-rose-400 p-1" title="حذف"><i class="fa-solid fa-trash-can"></i></button></div>'+
  '<div class="grid gap-3 sm:grid-cols-12 text-xs">'+
  '<div class="sm:col-span-5"><label class="block font-semibold mb-1 text-slate-600 dark:text-slate-300">اسم الخدمة</label><input list="svc-datalist" class="field svc-name" placeholder="اختر أو اكتب الخدمة..." oninput="onServiceSelected(\''+id+'\',this.value)" required></div>'+
  '<div class="sm:col-span-2"><label class="block font-semibold mb-1 text-slate-600 dark:text-slate-300">العدد</label><input type="number" min="1" value="1" class="field svc-qty text-center font-mono" oninput="calculateTotals()" required></div>'+
  '<div class="sm:col-span-2"><label class="block font-semibold mb-1 text-slate-600 dark:text-slate-300">سعر الوحدة</label><input type="number" min="0" step="any" value="0" class="field svc-price text-center font-mono" oninput="calculateTotals()" required></div>'+
  '<div class="sm:col-span-3"><label class="block font-semibold mb-1 text-slate-600 dark:text-slate-300" dir="ltr">Service ID (يدوي)</label><input dir="ltr" class="field svc-ref font-mono text-right" placeholder="مرجع الخدمة اليدوي..." maxlength="40"></div></div>'+
  '<div class="grid gap-3 sm:grid-cols-12 pt-2 border-t border-slate-200/60 dark:border-white/10 text-xs items-start">'+
  '<div class="sm:col-span-3"><label class="block font-semibold mb-1 text-slate-500 dark:text-slate-400">المنفذ / الجهة المنفذة</label><input list="exec-datalist" class="field svc-executor" placeholder="اسم المنفذ..." oninput="updateOrderProgressBar()"></div>'+
  '<div class="sm:col-span-3"><label class="block font-semibold mb-1 text-slate-500 dark:text-slate-400">تكلفة التنفيذ/وحدة</label><input type="number" min="0" step="any" value="0" class="field svc-cost text-center font-mono" oninput="calculateTotals()"><div class="mt-1 text-[11px] text-slate-500 dark:text-slate-400">إجمالي التنفيذ: <b class="svc-cost-total font-mono text-violet-600 dark:text-violet-300">0 ج.م</b></div></div>'+
  '<div class="sm:col-span-2"><label class="block font-semibold mb-1 text-slate-500 dark:text-slate-400">خصم البند %</label><input type="number" min="0" max="100" step="any" inputmode="decimal" placeholder="0" class="field svc-disc text-center font-mono" oninput="calculateTotals()"><div class="mt-1 text-[10.5px] text-rose-500 font-semibold svc-disc-note hidden"></div></div>'+
  '<div class="sm:col-span-4 rounded-xl bg-white dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-700/80 p-2.5 space-y-1">'+
    '<div class="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400"><span>الإجمالي قبل الخصم:</span><b class="line-raw-display font-mono text-slate-700 dark:text-slate-200">0 ج.م</b></div>'+
    '<div class="flex items-center justify-between text-[11px] text-rose-600 dark:text-rose-400 hidden line-disc-row"><span>قيمة الخصم:</span><b class="line-disc-display font-mono">− 0 ج.م</b></div>'+
    '<div class="flex items-center justify-between text-xs border-t border-slate-100 dark:border-slate-800 pt-1"><span class="font-bold text-slate-700 dark:text-slate-200">إجمالي البند النهائي:</span><span class="font-bold text-sm font-mono text-brand-600 dark:text-violet-300 line-total-display">0 ج.م</span></div>'+
  '</div></div>'+
  '<div class="text-xs"><label class="block font-semibold mb-1 text-slate-500 dark:text-slate-400">ملاحظة خاصة بالبند</label><input class="field svc-notes" placeholder="تعليمات تنفيذ هذا البند..."></div>';
  $('lines-container').appendChild(d);calculateTotals();
}
function removeServiceLine(id){
  if($('lines-container').children.length<=1)return showToast('يجب أن تحتوي المعاملة على خدمة واحدة على الأقل','error');
  const el=$(id);if(el)el.remove();calculateTotals();renderQuickServicesGrid();
}
function findCatalogService(name){
  const k=normName(name);if(!k)return null;
  return allServices.find(s=>normName(s.name)===k)||null;
}
function getServiceCommRate(svcObjOrName){
  const f=typeof svcObjOrName==='object'?svcObjOrName:findCatalogService(svcObjOrName);
  if(!f)return null;
  const raw=f.commission_per_unit!=null&&f.commission_per_unit!==''?f.commission_per_unit:(f.commission!=null&&f.commission!==''?f.commission:null);
  if(raw==null)return null;
  const num=Number(String(raw).replace(/[^\d.-]/g,''));
  return Number.isFinite(num)?num:null;
}
window.findCatalogService=findCatalogService;
window.getServiceCommRate=getServiceCommRate;
function onServiceSelected(id,name){
  const f=findCatalogService(name);
  const el=$(id);
  if(f&&el){
    el.querySelector('.svc-price').value=f.unit_price!=null?f.unit_price:0;
    el.querySelector('.svc-cost').value=f.exec_cost!=null?f.exec_cost:0;
    el.querySelector('.svc-executor').value=f.executor||'';
    const cr=getServiceCommRate(f);
    el.dataset.comm=cr!=null?cr:'';el.dataset.dur=f.duration_days!=null?f.duration_days:'';
  }else if(el){delete el.dataset.comm;delete el.dataset.dur;}
  calculateTotals();
  renderQuickServicesGrid();
}
function discountPct(){const el=$('discount-pct'),v=el?parseFloat(el.value):0;return v>0?Math.min(v,100):0;}
const isFeeSvc=n=>/^رسوم توصيل/.test(normName(n||''));
function lineDisc(l){
  const sn=((l.querySelector('.svc-name')&&l.querySelector('.svc-name').value)||'').trim(),di=l.querySelector('.svc-disc'),nt=l.querySelector('.svc-disc-note');
  if(!di)return 0;
  const fee=isFeeSvc(sn);
  if(di.disabled!==fee){di.disabled=fee;if(fee)di.value='';di.title=fee?'رسوم التوصيل ذات رسوم ثابتة ولا تقبل الخصم':'';}
  if(nt){
    if(fee){nt.textContent='رسوم ثابتة (لا تقبل خصم)';nt.classList.remove('hidden');}
    else{nt.textContent='';nt.classList.add('hidden');}
  }
  const v=parseFloat(di.value);return !fee&&v>0?Math.min(v,100):0;
}
function unitAfter(p,d){return d>0?Math.round(p*(1-d/100)*100)/100:p;}
const txDisc=o=>Math.max(0,...o.lines.map(l=>Number(l.discount_pct)||0));
function calculateTotals(){
  const lines=$('lines-container')?$('lines-container').children:[];
  let g=0,raw=0,dmax=0;
  const summaryRows=[];
  Array.from(lines).forEach(function(l){
    const sn=((l.querySelector('.svc-name')&&l.querySelector('.svc-name').value)||'').trim();
    const d=lineDisc(l);dmax=Math.max(dmax,d);
    const q0=parseFloat(l.querySelector('.svc-qty').value)||0;
    const p0=parseFloat(l.querySelector('.svc-price').value)||0;
    const rawLine=q0*p0;
    const netLine=q0*unitAfter(p0,d);
    const discAmt=Math.max(0,rawLine-netLine);
    raw+=rawLine;
    g+=netLine;
    const rawEl=l.querySelector('.line-raw-display');if(rawEl)rawEl.textContent=formatCurrency(rawLine);
    const discRow=l.querySelector('.line-disc-row'),discEl=l.querySelector('.line-disc-display');
    if(discRow)discRow.classList.toggle('hidden',!(discAmt>0));
    if(discEl&&discAmt>0)discEl.textContent='− '+formatCurrency(discAmt)+' ('+fmtNum(d)+'%)';
    l.querySelector('.line-total-display').textContent=formatCurrency(netLine);
    const ct=l.querySelector('.svc-cost-total');if(ct)ct.textContent=formatCurrency(q0*(parseFloat(l.querySelector('.svc-cost').value)||0));
    if(sn)summaryRows.push({name:sn,qty:q0,rawTotal:rawLine,netTotal:netLine,disc:d});
  });
  if($('s-lines'))$('s-lines').textContent=summaryRows.length||lines.length;
  if($('grand-total-display'))$('grand-total-display').textContent=g.toLocaleString('en-US');

  // تحديث قائمة البنود التفصيلية داخل ملخص الطلب الجانبي
  const sList=$('s-items-list');
  if(sList){
    if(summaryRows.length){
      sList.innerHTML=summaryRows.map(item=>
        '<div class="flex items-center justify-between gap-2 py-1 border-b border-slate-100 dark:border-white/5 last:border-0">'+
          '<span class="truncate text-slate-700 dark:text-slate-200 font-medium">'+escapeHtml(item.name)+(item.qty>1?' <small class="text-violet-600 dark:text-violet-300 font-mono">×'+fmtNum(item.qty)+'</small>':'')+(item.disc>0?' <small class="text-rose-500 font-mono">(-'+fmtNum(item.disc)+'%)</small>':'')+'</span>'+
          '<span class="font-mono font-bold text-slate-900 dark:text-white shrink-0">'+fmtNum(item.netTotal)+' ج.م</span>'+
        '</div>'
      ).join('');
    }else{
      sList.innerHTML='<div class="text-[11px] text-slate-400 py-1">اختر الخدمات لتظهر في الملخص...</div>';
    }
  }

  const dr=$('s-disc-row');if(dr){dr.classList.toggle('hidden',!(raw-g>0));if(raw-g>0){$('s-disc-pct').textContent=dmax>0?'(حتى '+fmtNum(dmax)+'%)':'';$('s-disc-amt').textContent='− '+formatCurrency(raw-g);}}
  updateOrderProgressBar();
}
function renderPaymentMethodButtons(){
  const cur=$('payment-method-val').value;
  const used=[...new Set(allRequestLines.map(l=>(l.payment_method||'').trim()).filter(Boolean))];
  const methods=[...new Set([...PAY_DEFAULT,...used])].slice(0,8);
  $('pay-group').innerHTML=methods.map(function(m){
    const on=m===cur;
    return '<button type="button" data-m="'+escapeHtml(m)+'" onclick="selectPaymentMethod(this.dataset.m)" class="p-3 rounded-xl border text-xs font-bold transition-all '+(on?'border-violet-400 bg-gradient-to-r from-violet-600/30 to-purple-600/20 text-violet-700 dark:text-white ring-2 ring-violet-500/30 shadow-xs':'border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/10')+'">'+escapeHtml(m)+'</button>';
  }).join('');
}
function selectPaymentMethod(m){$('payment-method-val').value=m;$('s-pay').textContent=m;renderPaymentMethodButtons();updateOrderProgressBar();}
function uniq(key){return [...new Set(allRequestLines.map(l=>(l[key]||'').trim()).filter(Boolean))];}
function opts(arr){return arr.map(n=>'<option value="'+escapeHtml(n)+'"></option>').join('');}
function renderClientDatalists(){
  const names=uniq('client_name');
  $('clients-datalist').innerHTML=opts(names);$('phones-datalist').innerHTML=opts(uniq('phone'));
  $('receipt-clients-datalist').innerHTML=opts([...names,...uniq('phone')]);
  $('emp-datalist').innerHTML=opts([...new Set([...profiles.map(p=>(p.full_name||'').trim()).filter(Boolean),...uniq('employee')])]);$('rec-datalist').innerHTML=opts(uniq('receiver'));
  let ex=$('exec-datalist');if(!ex){ex=document.createElement('datalist');ex.id='exec-datalist';document.body.appendChild(ex);}
  ex.innerHTML=opts([...new Set([...uniq('executor'),...allServices.map(s=>s.executor).filter(Boolean)])]);
}
function onClientNameInput(name){
  $('s-client').textContent=name||'—';
  const m=allRequestLines.find(l=>(l.client_name||'').trim().toLowerCase()===name.trim().toLowerCase());
  if(m){
    if(m.phone&&!$('phone').value){$('phone').value=m.phone;onPhoneInput(m.phone);}
    if(m.address&&!$('address').value)$('address').value=m.address;
  }
  updateOrderProgressBar();
}
function onPhoneInput(phone){
  const link=waLink(phone);
  if(link&&String(phone).replace(/\D/g,'').length>=8){$('client-whatsapp-box').classList.remove('hidden');$('client-whatsapp-link').href=link;}else $('client-whatsapp-box').classList.add('hidden');
  const m=allRequestLines.find(l=>(l.phone||'').trim()===phone.trim());
  if(m&&!$('client-name').value){$('client-name').value=m.client_name;$('s-client').textContent=m.client_name;if(m.address&&!$('address').value)$('address').value=m.address;}
  updateOrderProgressBar();
}
function generateNewTxId(force){$('tx-id').value=force===true?'TX-'+new Date().getFullYear()+'-'+Math.floor(1000+Math.random()*9000):'';}

/* ---------- حفظ المعاملة (مع دعم حفظ فقط / حفظ وطباعة إيصال / حفظ وطلب جديد / حفظ وواتساب) ---------- */
async function handleSaveOrder(e){
  e.preventDefault();if(!sbClient&&!initSupabase())return;
  const saveMode=window.__saveOrderMode||'normal';
  window.__saveOrderMode='normal';
  const els=Array.from($('lines-container').children);
  if(!els.length)return showToast('أضف خدمة واحدة على الأقل','error');
  if(!receivedAtManual)$('received-at').value=nowLocalIso();
  const base={client_name:$('client-name').value.trim(),phone:$('phone').value.trim()||null,transaction_id:$('tx-id').value.trim(),address:$('address').value.trim()||null,
    employee:$('employee').value.trim(),payment_method:$('payment-method-val').value,receiver:$('receiver').value.trim()||null,
    received_at:$('received-at').value+':00',rn_nm:$('rn-nm').value.trim()||null};
  if(!base.employee)return showToast('اختر الموظف المسؤول','error');
  if(!base.transaction_id)return showToast('اضغط "رقم جديد" لتوليد رقم الطلب الأول','error');
  const gen=$('notes').value.trim(),rows=[];
  for(const el of els){
    const service=el.querySelector('.svc-name').value.trim();
    if(!service)return showToast('اكتب اسم الخدمة في كل البنود','error');
    const ln=el.querySelector('.svc-notes').value.trim();
    const dvl=el.querySelector('.svc-disc').value;
    if(dvl!==''&&!(Number(dvl)>=0&&Number(dvl)<=100))return showToast('نسبة الخصم لازم تكون بين 0 و100','error');
    const disc=lineDisc(el);
    const catComm=getServiceCommRate(service);
    const commVal=(el.dataset.comm!==''&&el.dataset.comm!=null)?Number(el.dataset.comm):(catComm!=null?catComm:0);
    const qVal=parseFloat(el.querySelector('.svc-qty').value)||1;
    const rawPrice=parseFloat(el.querySelector('.svc-price').value)||0;
    const uPrice=unitAfter(rawPrice,disc);
    rows.push(Object.assign({},base,{discount_pct:Number(disc)||0,list_price:rawPrice,service:service,service_ref:el.querySelector('.svc-ref').value.trim()||null,qty:qVal,unit_price:uPrice,
      exec_unit_cost:parseFloat(el.querySelector('.svc-cost').value)||0,commission_per_unit:commVal,
      executor:el.querySelector('.svc-executor').value.trim()||null,duration_days:el.dataset.dur===''||el.dataset.dur==null?null:Number(el.dataset.dur),
      notes:(ln?(gen?gen+' - '+ln:ln):gen)||null}));
  }
  const btn=$('save-btn');btn.disabled=true;btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i><span>جارٍ الحفظ...</span>';
  try{
    const r=await sbClient.from('request_lines').insert(rows);
    if(r.error)throw r.error;
    showToast('تم حفظ المعاملة بنجاح ('+base.transaction_id+')');
    const printableRows=rows.map(x=>Object.assign({},x,{total:(Number(x.qty)||1)*(Number(x.unit_price)||0)}));
    ['client-name','phone','address','rn-nm','notes','discount-pct'].forEach(id=>$(id).value='');
    $('client-whatsapp-box').classList.add('hidden');$('s-client').textContent='—';
    syncReceivedAt(true);
    generateNewTxId();$('lines-container').innerHTML='';serviceLineCounter=0;addServiceLine();
    renderQuickServicesGrid();
    updateOrderProgressBar();
    await loadRecentRequests();
    

    if(saveMode==='print'){
      setTimeout(()=>buildOfficialReceipt(printableRows),180);
    }else if(saveMode==='whatsapp'){
      const svcsText=printableRows.map(x=>x.service+' (×'+x.qty+')').join('، ');
      const totText=formatCurrency(printableRows.reduce((s,x)=>s+x.total,0));
      const wUrl=waLink(base.phone,'أهلاً '+base.client_name+'، تم تسجيل معاملتك رقم '+base.transaction_id+' بنجاح في تساهيل ('+svcsText+') بإجمالي '+totText);
      if(wUrl)window.open(wUrl,'_blank','noopener');
      else showToast('تم الحفظ (لا يوجد رقم موبايل لفتح واتساب)','info');
    }else if(saveMode==='new'){
      setTimeout(()=>{if($('client-name')){$('client-name').focus();$('client-name').scrollIntoView({behavior:'smooth',block:'center'});}},120);
    }
  }catch(err){const em=((err&&err.message)||'')+' '+((err&&err.code)||'');const noCol=/42703|PGRST204|column .* does not exist|schema cache/i.test(em);showError(noCol&&/service_ref/.test(em)?'شغّل ملف sql/p1a-order-cycle.sql في Supabase الأول (عمود رقم الخدمة)':noCol&&/discount_pct|list_price/.test(em)?'شغّل ملف phase16-discount.sql في Supabase الأول (عمود الخصم)':'فشل الحفظ',err);}
  finally{btn.disabled=false;btn.innerHTML='<i class="fa-solid fa-check ms-1.5"></i><span>حفظ الطلب</span>';}
}

/* ---------- نافذة تفاصيل المعاملة (مزودة أيضاً بشريط الحالة التفاعلي والحلقة الدائرية) ---------- */
function openTxModal(tx){
  const o=groupedOrders.find(x=>x.transaction_id===tx);if(!o)return;
  openTxCurrent=tx;txDirty=false;
  const curSt=getOrderStatus(o),late=isOrderLate(o),orderPct=getOrderPct(o);
  $('tx-modal-title').textContent='معاملة: '+o.client_name;$('tx-modal-subtitle').textContent='Request ID: '+o.transaction_id;
  const info=[['Request ID',o.transaction_id,'<span class="font-mono" dir="ltr">'+escapeHtml(o.transaction_id)+'</span>'],['العميل',o.client_name],['الهاتف',o.phone],['طريقة الدفع',o.payment_method],['الموظف المسؤول',o.employee,empCell(o.employee)],['العنوان',o.address],['مندوب الاستلام',o.receiver||'العميل شخصياً'],['تاريخ الاستلام',formatDateTime(o.received_at||o.created_at)],['رقم الإيصال',o.rn_nm]].concat(txDisc(o)>0?[['أعلى خصم بند',fmtNum(txDisc(o))+'%']]:[]);
  $('tx-modal-body').innerHTML=
  '<div id="tx-modal-stepper-slot">'+buildInteractiveStatusWidgets(o.transaction_id,curSt,late,'modal',orderPct)+'</div>'+
  '<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl text-xs">'+info.map(i=>'<div class="min-w-0"><span class="text-slate-400 block mb-0.5">'+i[0]+'</span><span class="font-semibold text-ink dark:text-white break-words">'+(i[2]||escapeHtml(i[1]||'—'))+'</span></div>').join('')+'</div>'+
  (o.notes?'<div class="p-3 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 rounded-xl text-xs"><i class="fa-solid fa-note-sticky ms-1"></i><b>ملاحظات:</b> '+escapeHtml(o.notes)+'</div>':'')+
  '<div><div class="flex items-center justify-between mb-2"><h4 class="font-bold text-xs text-slate-500">بطاقات بنود الخدمات ('+o.lines.length+')</h4><span class="text-[11px] font-semibold text-slate-400">كل خدمة لها حالة وشريط تقدم مستقل</span></div><div class="space-y-2.5">'+
  o.lines.map((l,i)=>buildServiceDetailCard(l,i,'modal')).join('')+'</div></div>'+
  '<div class="rounded-xl border border-slate-200 dark:border-slate-700 p-3"><div class="text-[11px] text-slate-500 mb-2">تحديث جماعي لكل الخدمات (اختياري)</div><div class="grid grid-cols-2 sm:grid-cols-4 gap-2">'+Object.keys(STATUS_PATCH).map(s=>'<button type="button" data-tx="'+escapeHtml(o.transaction_id)+'" data-s="'+s+'" onclick="stageTxStatus(this.dataset.s)" class="rounded-lg py-2 text-xs font-bold '+(STATUS_CLS[s]||'')+'">'+statusLabel(s)+'</button>').join('')+'</div></div>'+
  '<div class="flex items-center justify-between p-3.5 bg-slate-900 text-white rounded-xl"><span class="text-xs font-semibold text-slate-300">الإجمالي النهائي:</span><span class="text-lg font-bold font-mono">'+formatCurrency(o.grand_total)+'</span></div>';
  $('tx-modal-actions-left').innerHTML='<button id="tx-save-btn" type="button" onclick="saveTxChanges()" disabled class="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold flex items-center gap-1.5 opacity-50"><i class="fa-solid fa-floppy-disk"></i><span>حفظ</span></button>'+
  '<button data-tx="'+escapeHtml(o.transaction_id)+'" onclick="printTxReceipt(this.dataset.tx)" class="px-3.5 py-2 rounded-xl bg-ink dark:bg-brand-600 text-white text-xs font-bold flex items-center gap-1.5"><i class="fa-solid fa-print"></i><span>الإيصال الرسمي</span></button>'+
  (canStaffEditTx()?'<button data-tx="'+escapeHtml(o.transaction_id)+'" onclick="openTxEdit(this.dataset.tx)" class="px-3.5 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold flex items-center gap-1.5"><i class="fa-solid fa-pen-to-square"></i><span>تعديل</span></button>':'');
  $('tx-modal').classList.remove('hidden');$('tx-modal').classList.add('flex');
  loadLineStageEvents(o.transaction_id);
}
function closeTxModal(){if(txDirty&&!confirm('فيه تغييرات لسه ماتحفظتش. تقفل من غير حفظ؟'))return;txDirty=false;$('tx-modal').classList.add('hidden');$('tx-modal').classList.remove('flex');}

/* ---------- تعديل المعاملة (متاح لكل الموظفين المسجلين مع التسجيل في سجل التغييرات) ---------- */
function canEditTx(){return window.__role?window.__role==='manager':['mahmoud.aboshama@tasahel.com.eg','mahmoud.aboshama.contact@gmail.com'].includes(String((currentUser&&currentUser.email)||'').toLowerCase());}
function canStaffEditTx(){return !!currentUser&&window.__role!=='partner';}
const toLocalInput=v=>v?String(v).replace(' ','T').slice(0,16):'';
let txEditState=null;
function closeTxEdit(){const m=$('tx-edit-modal');if(m){m.classList.add('hidden');m.classList.remove('flex');}txEditState=null;}
function onTeServiceInput(inpEl){
  const blk=inpEl&&inpEl.closest('[data-lid],[data-new-line]');if(!blk)return;
  const f=findCatalogService(inpEl.value);
  const pr=blk.querySelector('.te-l-price'),co=blk.querySelector('.te-l-cost'),ex=blk.querySelector('.te-l-executor'),di=blk.querySelector('.te-l-disc');
  if(f){
    if(pr&&f.unit_price!=null)pr.value=f.unit_price;
    if(co&&f.exec_cost!=null)co.value=f.exec_cost;
    if(ex&&f.executor)ex.value=f.executor;
  }
  if(di){
    const fee=isFeeSvc(inpEl.value);
    di.disabled=fee;
    if(fee)di.value=0;
  }
}
window.onTeServiceInput=onTeServiceInput;
function addTxEditLine(){
  const box=$('te-lines-list');if(!box)return;
  const idx=box.children.length+1;
  const num='type="number" step="any" min="0" inputmode="decimal"';
  const lf=(cls,label,val,extra,span)=>'<div class="min-w-0'+(span?' '+span:'')+'"><label class="label">'+label+'</label><input class="field '+cls+'" value="'+escapeHtml(val==null?'':val)+'" '+(extra||'')+'></div>';
  const div=document.createElement('div');
  div.className='space-y-2 rounded-xl border border-brand-300 bg-brand-50/20 p-3 dark:border-brand-800 dark:bg-brand-950/20';
  div.setAttribute('data-new-line','1');
  div.innerHTML='<div class="flex items-center justify-between text-[11px] font-bold text-brand-700 dark:text-brand-300"><span>بند جديد #'+idx+'</span><button type="button" onclick="removeTxEditLine(this)" class="text-rose-500 hover:text-rose-700"><i class="fa-solid fa-trash-can ms-1"></i>إلغاء البند</button></div><div class="grid grid-cols-2 gap-2 sm:grid-cols-6">'+
    lf('te-l-service','اسم الخدمة','','list="svc-datalist" oninput="onTeServiceInput(this)"','col-span-2')+
    lf('te-l-qty','العدد',1,num)+
    lf('te-l-price','سعر الوحدة (قبل الخصم)',0,num)+
    lf('te-l-disc','خصم %',0,'type="number" step="any" min="0" max="100" inputmode="decimal"')+
    lf('te-l-ref','Service ID (يدوي)','','dir="ltr" maxlength="40"')+
    lf('te-l-executor','المنفذ','','list="exec-datalist"','col-span-2')+
    lf('te-l-cost','تكلفة التنفيذ للوحدة',0,num,'col-span-2')+
    lf('te-l-notes','ملاحظات البند','','','col-span-2')+'</div>';
  box.appendChild(div);
}
function removeTxEditLine(btn){
  const blk=btn&&btn.closest('[data-lid],[data-new-line]');if(!blk)return;
  const box=$('te-lines-list');
  const activeCount=box?box.querySelectorAll('[data-lid]:not([data-deleted="1"]),[data-new-line]').length:0;
  if(activeCount<=1)return showToast('لازم المعاملة تحتوي على بند واحد على الأقل','error');
  if(blk.hasAttribute('data-new-line')){blk.remove();return;}
  blk.setAttribute('data-deleted','1');
  blk.classList.add('hidden');
}
window.addTxEditLine=addTxEditLine;
window.removeTxEditLine=removeTxEditLine;
async function openTxEdit(tx){
  if(!canStaffEditTx())return;
  const o=groupedOrders.find(x=>String(x.transaction_id)===String(tx));if(!o||!o.lines||!o.lines.length)return;
  let trips=[];
  try{const r=await sbClient.from('courier_trips').select('id,kind,courier,fee').eq('transaction_id',tx);if(!r.error)trips=r.data||[];}catch(e){}
  txEditState={tx:String(tx),o:o,trips:trips};
  const first=o.lines[0],esc=escapeHtml;
  const used=[...new Set(allRequestLines.map(l=>(l.payment_method||'').trim()).filter(Boolean))];
  const pays=[...new Set([...PAY_DEFAULT,...used])];
  const inp=(id,label,val,extra)=>'<div class="min-w-0"><label class="label" for="'+id+'">'+label+'</label><input id="'+id+'" class="field" value="'+esc(val==null?'':val)+'" '+(extra||'')+'></div>';
  const lf=(cls,label,val,extra,span)=>'<div class="min-w-0'+(span?' '+span:'')+'"><label class="label">'+label+'</label><input class="field '+cls+'" value="'+esc(val==null?'':val)+'" '+(extra||'')+'></div>';
  const num='type="number" step="any" min="0" inputmode="decimal"';
  const linesH=o.lines.map((l,i)=>{
    const basePr=Number(l.discount_pct)>0&&Number(l.list_price)>0?l.list_price:l.unit_price;
    const fee=isFeeSvc(l.service);
    return '<div class="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700" data-lid="'+esc(l.id)+'"><div class="flex items-center justify-between text-[11px] font-bold text-slate-500"><span>بند '+(i+1)+'</span><button type="button" onclick="removeTxEditLine(this)" class="text-rose-500 hover:text-rose-700" title="حذف البند"><i class="fa-solid fa-trash-can ms-1"></i>حذف البند</button></div><div class="grid grid-cols-2 gap-2 sm:grid-cols-6">'+
    lf('te-l-service','اسم الخدمة',l.service,'list="svc-datalist" oninput="onTeServiceInput(this)"','col-span-2')+
    lf('te-l-qty','العدد',l.qty,num)+
    lf('te-l-price','سعر الوحدة (قبل الخصم)',basePr,num)+
    lf('te-l-disc','خصم %',fee?0:(l.discount_pct||0),'type="number" step="any" min="0" max="100" inputmode="decimal"'+(fee?' disabled title="رسوم ثابتة لا تقبل الخصم"':''))+
    lf('te-l-ref','Service ID (يدوي)',l.service_ref||'','dir="ltr" maxlength="40"')+
    lf('te-l-executor','المنفذ',l.executor,'list="exec-datalist"','col-span-2')+
    lf('te-l-cost','تكلفة التنفيذ للوحدة',l.exec_unit_cost,num,'col-span-2')+
    lf('te-l-notes','ملاحظات البند',l.notes,'','col-span-2')+'</div></div>';
  }).join('');
  const tripsH=st_trips_html(trips,esc,first.receiver);
  let m=$('tx-edit-modal');
  if(!m){m=document.createElement('div');m.id='tx-edit-modal';document.body.appendChild(m);}
  m.className='fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-3 sm:p-6';
  m.innerHTML='<div class="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900"><div class="flex items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-slate-800"><div><div class="font-bold text-ink dark:text-white">تعديل الطلب</div><div class="font-mono text-[11px] text-slate-500" dir="ltr">Request ID: '+esc(o.transaction_id)+'</div></div><button type="button" onclick="closeTxEdit()" class="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="إغلاق"><i class="fa-solid fa-xmark"></i></button></div>'+
    '<div class="space-y-4 overflow-y-auto p-5"><div class="grid grid-cols-1 gap-3 sm:grid-cols-2">'+
    inp('te-client','العميل',first.client_name)+inp('te-phone','الهاتف',first.phone,'dir="ltr"')+
    inp('te-emp','الموظف المسؤول',first.employee,'list="emp-datalist"')+inp('te-pay','طريقة الدفع',first.payment_method,'list="te-pay-dl"')+
    inp('te-date','تاريخ ووقت الاستلام',toLocalInput(first.received_at),'type="datetime-local"')+
    inp('te-rn','رقم الإيصال',first.rn_nm,'dir="ltr"')+inp('te-addr','العنوان',first.address)+
    '<input id="te-recv" type="hidden" value="'+esc(first.receiver||'')+'">'+
    '<datalist id="te-pay-dl">'+pays.map(p=>'<option value="'+esc(p)+'"></option>').join('')+'</datalist></div>'+
    '<div><div class="mb-2 flex items-center justify-between"><h4 class="text-xs font-bold text-slate-500">بنود الخدمات</h4><button type="button" onclick="addTxEditLine()" class="rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700 hover:bg-brand-100 dark:bg-brand-950/50 dark:text-brand-300"><i class="fa-solid fa-plus ms-1"></i>إضافة بند</button></div><div id="te-lines-list" class="space-y-2">'+linesH+'</div></div>'+
    '<div id="te-rp-slot"></div>'+
    tripsH+
    '<p class="text-[11px] text-slate-400">كل تعديل بيتسجّل تلقائياً في سجل التغييرات باسم الموظف اللي قام بالتعديل ووقت العملية.</p></div>'+
    '<div class="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800"><button type="button" onclick="closeTxEdit()" class="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">إلغاء</button><button id="te-save" type="button" onclick="saveTxEdit()" class="rounded-xl bg-brand-600 px-5 py-2 text-xs font-bold text-white hover:bg-brand-700">حفظ التعديلات</button></div></div>';
  if(typeof window.mountTxEditPeople==='function')window.mountTxEditPeople(tx,o.lines);
}
function st_trips_html(trips,esc,fallbackReceiver){
  const pk=trips.find(t=>t.kind==='pickup'),dl=trips.find(t=>t.kind==='delivery');
  const pkVal=(pk&&pk.courier!=='—'?pk.courier:(fallbackReceiver&&fallbackReceiver!=='العميل شخصياً'?fallbackReceiver:''));
  return '<div><h4 class="mb-2 text-xs font-bold text-slate-500">مندوب الاستلام والتسليم</h4><div class="grid grid-cols-1 gap-2 sm:grid-cols-2">'+
    '<div class="min-w-0" data-tkind="pickup" data-tid="'+esc(pk?pk.id:'')+'"><label class="label">مندوب الاستلام</label><input class="field te-t-courier" list="courier-dl" placeholder="بدون مندوب (العميل شخصياً)" value="'+esc(pkVal)+'" oninput="if($(\'te-recv\'))$(\'te-recv\').value=this.value.trim()||\'العميل شخصياً\'"></div>'+
    '<div class="min-w-0" data-tkind="delivery" data-tid="'+esc(dl?dl.id:'')+'"><label class="label">مندوب التسليم</label><input class="field te-t-courier" list="courier-dl" placeholder="بدون مندوب" value="'+esc(dl&&dl.courier!=='—'?dl.courier:'')+'"></div>'+
  '</div></div>';
}
async function saveTxEdit(){
  if(!canStaffEditTx()||!txEditState)return;
  const st=txEditState,o=st.o,first=o.lines[0],root=$('tx-edit-modal'),V=id=>String(($(id)&&$(id).value)||'').trim(),nul=s=>s===''?null:s;
  const num=(s,def)=>{const t=String(s).trim().replace(',','.');if(t==='')return def;const n=Number(t);return Number.isFinite(n)?n:NaN;};
  const client=V('te-client'),emp=V('te-emp'),pay=V('te-pay'),dt=$('te-date').value;
  if(!client)return showToast('اسم العميل مطلوب','error');
  if(!emp)return showToast('اختر الموظف المسؤول','error');
  if(!pay)return showToast('طريقة الدفع مطلوبة','error');
  if(!dt)return showToast('تاريخ الاستلام مطلوب','error');
  const pkInp=root.querySelector('[data-tkind="pickup"] .te-t-courier');
  const unifiedRecv=(pkInp&&pkInp.value.trim())?pkInp.value.trim():'العميل شخصياً';
  if($('te-recv'))$('te-recv').value=unifiedRecv;
  const patchTx={},cmp=(k,v,req)=>{const old=first[k]==null?'':String(first[k]).trim();if(v!==old)patchTx[k]=req?v:nul(v);};
  cmp('client_name',client,true);cmp('phone',V('te-phone'));cmp('address',V('te-addr'));cmp('employee',emp,true);cmp('payment_method',pay,true);cmp('receiver',unifiedRecv);cmp('rn_nm',V('te-rn'));
  if(dt!==toLocalInput(first.received_at))patchTx.received_at=dt+':00';
  const linePatches=[],deletedIds=[],newLines=[];
  for(const blk of root.querySelectorAll('[data-lid]')){
    const l=o.lines.find(x=>String(x.id)===blk.dataset.lid);if(!l)continue;
    if(blk.getAttribute('data-deleted')==='1'){deletedIds.push(l.id);continue;}
    const g=c=>String((blk.querySelector('.'+c)&&blk.querySelector('.'+c).value)||'').trim();
    const svc=g('te-l-service'),q=num(g('te-l-qty'),NaN),basePr=num(g('te-l-price'),0),co=num(g('te-l-cost'),0);
    const rawDisc=num(g('te-l-disc'),0),disc=isFeeSvc(svc)?0:Math.max(0,Math.min(100,rawDisc||0));
    const uPrice=unitAfter(basePr,disc),sRef=g('te-l-ref');
    if(!svc)return showToast('اكتب اسم الخدمة في كل البنود','error');
    if(!(q>0))return showToast('الكمية لازم تكون رقم أكبر من صفر','error');
    if(!(basePr>=0)||!(co>=0))return showToast('السعر والتكلفة لازم يكونوا أرقام صحيحة','error');
    const p={},ex=g('te-l-executor'),nt=g('te-l-notes');
    if(svc!==String(l.service||'').trim()){
      p.service=svc;
      const cr=getServiceCommRate(svc);
      if(cr!=null)p.commission_per_unit=cr;
    }
    if(q!==Number(l.qty))p.qty=q;
    if(uPrice!==Number(l.unit_price||0))p.unit_price=uPrice;
    if(disc!==Number(l.discount_pct||0)){p.discount_pct=Number(disc)||0;p.list_price=basePr;}
    else if(disc>0&&basePr!==Number(l.list_price||0))p.list_price=basePr;
    if(sRef!==String(l.service_ref||'').trim())p.service_ref=nul(sRef);
    if(co!==Number(l.exec_unit_cost||0))p.exec_unit_cost=co;
    if(ex!==String(l.executor||'').trim())p.executor=nul(ex);
    if(nt!==String(l.notes||'').trim())p.notes=nul(nt);
    if(Object.keys(p).length)linePatches.push({id:l.id,p:p});
  }
  const baseRow={client_name:client,phone:nul(V('te-phone')),transaction_id:st.tx,address:nul(V('te-addr')),employee:emp,payment_method:pay,receiver:unifiedRecv,received_at:dt+':00',rn_nm:nul(V('te-rn'))};
  for(const blk of root.querySelectorAll('[data-new-line]')){
    const g=c=>String((blk.querySelector('.'+c)&&blk.querySelector('.'+c).value)||'').trim();
    const svc=g('te-l-service'),q=num(g('te-l-qty'),NaN),basePr=num(g('te-l-price'),0),co=num(g('te-l-cost'),0);
    const rawDisc=num(g('te-l-disc'),0),disc=isFeeSvc(svc)?0:Math.max(0,Math.min(100,rawDisc||0));
    const uPrice=unitAfter(basePr,disc),sRef=g('te-l-ref');
    if(!svc)return showToast('اكتب اسم الخدمة في كل البنود الجديدة','error');
    if(!(q>0))return showToast('الكمية لازم تكون رقم أكبر من صفر','error');
    if(!(basePr>=0)||!(co>=0))return showToast('السعر والتكلفة لازم يكونوا أرقام صحيحة','error');
    const cat=findCatalogService(svc),cr=getServiceCommRate(cat||svc);
    newLines.push(Object.assign({},baseRow,{discount_pct:Number(disc)||0,list_price:basePr,service:svc,service_ref:nul(sRef),qty:q,unit_price:uPrice,exec_unit_cost:co,commission_per_unit:cr!=null?cr:0,executor:nul(g('te-l-executor')),duration_days:cat&&cat.duration_days!=null?Number(cat.duration_days):null,notes:nul(g('te-l-notes'))}));
  }
  const tripOps=[];
  for(const blk of root.querySelectorAll('[data-tkind]')){
    const kind=blk.dataset.tkind,tid=blk.dataset.tid;
    const t=st.trips.find(x=>String(x.id)===String(tid)||x.kind===kind);
    const c=String(blk.querySelector('.te-t-courier').value||'').trim(),old=t&&t.courier!=='—'?String(t.courier||'').trim():'';
    if(c!==old){
      tripOps.push({id:t?t.id:null,kind:kind,oldCourier:old||'—',newCourier:c||'—',fee:c?(t&&Number(t.fee)>0?Number(t.fee):(window.__courierFee||40)):0});
    }
  }
  const peopleChanged=typeof window.hasTxEditPeopleChanged==='function'&&window.hasTxEditPeopleChanged(st.tx);
  if(!Object.keys(patchTx).length&&!linePatches.length&&!deletedIds.length&&!newLines.length&&!tripOps.length&&!peopleChanged){closeTxEdit();return showToast('مفيش تغيير للحفظ');}
  const btn=$('te-save');btn.disabled=true;btn.textContent='جارٍ الحفظ...';
  let did=false;
  const editorName=(myProfile&&myProfile.full_name)||(currentUser&&currentUser.email)||'موظف';
  try{
    if(Object.keys(patchTx).length){
      const r=await sbClient.from('request_lines').update(patchTx).eq('transaction_id',st.tx).select('id');
      if(r.error)throw r.error;
      if(!r.data||!r.data.length)throw new Error('التعديل ماتحفظش: شغّل ملف phase22-fixes-and-permissions.sql في Supabase لتفعيل صلاحية التعديل لكل الموظفين');
      did=true;
    }
    for(const x of linePatches){
      const r=await sbClient.from('request_lines').update(x.p).eq('id',x.id).select('id');
      if(r.error)throw r.error;
      if(!r.data||!r.data.length)throw new Error('تعديل بند ماتحفظش: تأكد من تفعيل صلاحية التعديل في Supabase');
      did=true;
    }
    if(deletedIds.length){
      const r=await sbClient.from('request_lines').delete().in('id',deletedIds);
      if(r.error)throw r.error;
      did=true;
    }
    if(newLines.length){
      const r=await sbClient.from('request_lines').insert(newLines);
      if(r.error)throw r.error;
      did=true;
    }
    for(const op of tripOps){
      const day=(dt||toLocalInput(first.received_at)||'').slice(0,10)||new Date().toLocaleDateString('en-CA');
      if(op.id){
        const r=await sbClient.from('courier_trips').update({courier:op.newCourier,fee:op.fee}).eq('id',op.id);
        if(r.error)throw r.error;
      }else{
        const r=await sbClient.from('courier_trips').upsert({transaction_id:st.tx,kind:op.kind,courier:op.newCourier,fee:op.fee,trip_day:day,created_by:editorName},{onConflict:'transaction_id,kind'});
        if(r.error)throw r.error;
      }
      try{
        const label=op.kind==='pickup'?'مندوب الاستلام':'مندوب التسليم';
        await sbClient.from('audit_log').insert({transaction_id:st.tx,action:'updated',service:label,user_name:editorName,details:{[label]:{old:op.oldCourier,new:op.newCourier}}});
      }catch(e){}
      did=true;
    }
    if(typeof window.saveTxEditPeople==='function'){await window.saveTxEditPeople(st.tx);did=true;}
    showToast('تم حفظ التعديلات وتسجيلها في اللوج');
    closeTxEdit();
  }catch(err){showError('تعذّر حفظ التعديلات',err);btn.disabled=false;btn.textContent='حفظ التعديلات';}
  if(did){
    await loadRecentRequests();
    if(openTxCurrent&&!groupedOrders.find(x=>String(x.transaction_id)===String(openTxCurrent)))closeTxModal();else afterStatusChange();
  }
}

/* ---------- تغيير الحالة (يتفاعل لحظياً مع شريط الحالة والحلقة الدائرية) ---------- */
let openTxCurrent=null,txDirty=false;
const STATUS_PATCH={'In Progress':{delivered:false,complete:false,under_review:false},'Under Review':{delivered:false,complete:false,under_review:true},'Complete':{delivered:false,complete:true,under_review:false},'Delivered':{delivered:true,complete:true,under_review:false}};
function statusSelect(l){return '<select data-id="'+escapeHtml(l.id)+'" data-orig="'+escapeHtml(l.status||'In Progress')+'" onchange="markTxDirty()" class="field st-sel mt-2 !py-1.5 text-xs">'+Object.keys(STATUS_PATCH).map(s=>'<option value="'+s+'"'+(s===l.status?' selected':'')+'>'+statusLabel(s)+'</option>').join('')+'</select>';}
async function applyStatus(ids,status){
  const basePatch=STATUS_PATCH[status];if(!basePatch||!ids.length)return false;
  const patch=Object.assign({},basePatch);
  if(status==='Delivered'){
    patch.delivered_date=new Date().toLocaleDateString('en-CA');
  }
  let r=await sbClient.from('request_lines').update(patch).in('id',ids).select('id,status,delivered,complete,under_review,delivered_date');
  if(r.error&&/delivered_date|column|schema/i.test((r.error.message||'')+' '+(r.error.details||''))){
    r=await sbClient.from('request_lines').update(basePatch).in('id',ids).select('id,status,delivered,complete,under_review');
  }
  if(r.error){showError('تعذّر تغيير الحالة',r.error);return false;}
  if(!r.data||r.data.length!==ids.length){showToast('التعديل ماتحفظش: غالباً صلاحية التعديل (UPDATE) مش مفعّلة في Supabase','error',12000);return false;}
  const todayIso=new Date().toLocaleDateString('en-CA');
  r.data.forEach(row=>{
    const l=allRequestLines.find(x=>String(x.id)===String(row.id));
    if(l){
      Object.assign(l,row);
      if(status==='Delivered'&&!l.delivered_date)l.delivered_date=todayIso;
    }
  });
  return true;
}
function afterStatusChange(){
  groupRequestsByTransaction();renderRecentRequests();
  if(!$('tx-modal').classList.contains('hidden')&&openTxCurrent)openTxModal(openTxCurrent);
  if(currentTab==='home')renderHomeTab();
  if(currentTab==='dash')renderDashboardMetrics();
  if(currentTab==='exec')filterExecSheet();
  if(currentTab==='search')executeSearch();
}
function markTxDirty(){
  const sels=[...document.querySelectorAll('#tx-modal-body .st-sel')];
  txDirty=sels.some(s=>s.value!==s.dataset.orig);
  const b=$('tx-save-btn');if(b){b.disabled=!txDirty;b.classList.toggle('opacity-50',!txDirty);}
  sels.forEach(s=>{
    const lid=s.dataset.id,st=s.value,pct=getLinePct(st),col=getLineStageColor(st);
    const bar=document.querySelector('[data-line-bar="'+lid+'"]');if(bar){bar.style.width=pct+'%';bar.style.background=col;}
    const lbl=document.querySelector('[data-line-pct-lbl="'+lid+'"]');if(lbl){lbl.textContent=pct+'%';lbl.style.color=col;}
    const stLbl=document.querySelector('[data-line-st-lbl="'+lid+'"]');if(stLbl){stLbl.textContent=statusLabel(st)+' ('+pct+'%)';stLbl.style.color=col;}
  });
  // تفاعل فوري لشريط الحالة داخل نافذة المعاملة عند تغيير أي قائمة بحساب متوسط تقدم كل الخدمات
  if(openTxCurrent&&$('tx-modal-stepper-slot')&&sels.length){
    let best='In Progress',r=9;
    sels.forEach(s=>{const k=ORDER_STATUS_RANK[s.value];if(k!=null&&k<r){r=k;best=s.value;}});
    const avgPct=getOrderPct(sels.map(s=>s.value));
    const o=groupedOrders.find(x=>String(x.transaction_id)===String(openTxCurrent));
    $('tx-modal-stepper-slot').innerHTML=buildInteractiveStatusWidgets(openTxCurrent,best,isOrderLate(o),'modal',avgPct);
  }
}
function stageTxStatus(s){document.querySelectorAll('#tx-modal-body .st-sel').forEach(x=>{x.value=s;});markTxDirty();}
async function saveTxChanges(){
  const by=new Map();
  document.querySelectorAll('#tx-modal-body .st-sel').forEach(s=>{if(s.value!==s.dataset.orig){if(!by.has(s.value))by.set(s.value,[]);by.get(s.value).push(s.dataset.id);}});
  if(!by.size)return;
  const b=$('tx-save-btn');if(b){b.disabled=true;b.querySelector('span').textContent='جارٍ الحفظ...';}
  let ok=true;
  for(const [st,ids] of by){if(!(await applyStatus(ids,st))){ok=false;break;}}
  txDirty=false;
  if(ok)showToast('تم حفظ التغييرات وتحديث شريط الحالة');
  afterStatusChange();
}
async function setLineStatus(id,status){if(await applyStatus([String(id)],status)){showToast('تم تحديث الحالة');afterStatusChange();}}
async function setTxStatus(tx,status){
  const ids=allRequestLines.filter(l=>String(l.transaction_id)===String(tx)).map(l=>String(l.id));
  if(await applyStatus(ids,status)){showToast('تم تحديث حالة المعاملة وشريط التقدم');afterStatusChange();}
}

/* ---------- ملف العميل ---------- */
function openClientModal(name){
  const ls=allRequestLines.filter(l=>(l.client_name||'').trim().toLowerCase()===String(name).trim().toLowerCase());
  if(!ls.length)return;
  const s=ls[0],spent=ls.reduce((a,l)=>a+(Number(l.total)||0),0),txs=new Set(ls.map(l=>l.transaction_id).filter(Boolean));
  $('client-modal-name').textContent=s.client_name;$('client-modal-phone').textContent=s.phone||'بدون هاتف مسجل';
  const wa=waLink(s.phone,'أهلاً '+s.client_name+'، معك تساهيل | قسم الخدمات الحكومية');
  $('client-modal-wa-slot').innerHTML=wa?'<a href="'+wa+'" target="_blank" rel="noopener" class="px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5"><i class="fa-brands fa-whatsapp"></i><span>واتساب للعميل</span></a>':'';
  $('client-modal-body').innerHTML=
  '<div class="grid grid-cols-3 gap-3">'+[['إجمالي الإنفاق',formatCurrency(spent),'text-brand-600 dark:text-violet-300'],['عدد المعاملات',txs.size,'text-ink dark:text-white'],['إجمالي الخدمات',ls.length,'text-ink dark:text-white']].map(c=>'<div class="card p-3.5 bg-slate-50 dark:bg-slate-800/40"><span class="text-slate-400 text-xs block">'+c[0]+'</span><span class="text-sm sm:text-lg font-bold font-mono whitespace-nowrap '+c[2]+'">'+c[1]+'</span></div>').join('')+'</div>'+
  '<div><h4 class="font-bold text-xs text-slate-500 mb-2">سجل كل المعاملات والخدمات</h4><div class="space-y-2">'+
  ls.map(l=>'<button type="button" data-st17="'+escapeHtml(l.status||'In Progress')+'" data-tx="'+escapeHtml(l.transaction_id)+'" onclick="closeClientModal();openTxModal(this.dataset.tx)" class="card lift w-full flex flex-wrap items-center justify-between gap-3 p-3.5 text-start"><div class="min-w-0 space-y-1.5"><div class="rc-svc-pill"><span class="rc-svc-name">'+escapeHtml(l.service||'—')+'</span><span class="rc-svc-qty" dir="ltr">×'+fmtNum(l.qty)+'</span></div><div class="flex flex-wrap items-center gap-2 text-[11px] text-slate-500"><span class="rc-tx-pill !py-0.5 !px-2 !text-[11px]" dir="ltr">'+escapeHtml(l.transaction_id)+'</span><span>'+formatDateOnly(lineDate(l))+'</span>'+badge(l.status)+'</div></div><div class="shrink-0 font-bold text-sm text-brand-600 dark:text-violet-300 whitespace-nowrap">'+formatCurrency(l.total)+'</div></button>').join('')+'</div></div>';
  $('client-modal').classList.remove('hidden');$('client-modal').classList.add('flex');
}
function closeClientModal(){$('client-modal').classList.add('hidden');$('client-modal').classList.remove('flex');}
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeTxModal();closeClientModal();closeMeModal();}});

/* ---------- شيت المنفذين ---------- */
function updateExecutorsFilterOptions(){
  const cur=$('f-exec').value||'all';
  const list=[...new Set([...uniq('executor'),...allServices.map(s=>(s.executor||'').trim()).filter(Boolean)])];
  $('f-exec').innerHTML='<option value="all">كل المنفذين</option>'+list.map(e=>'<option value="'+escapeHtml(e)+'">'+escapeHtml(e)+'</option>').join('');
  $('f-exec').value=list.includes(cur)?cur:'all';
}
const EXEC_PAGE_SIZE=50;
let execSheetLimit=EXEC_PAGE_SIZE,lastExecFilterSig='';
function getFilteredExecLines(){
  const ex=$('f-exec')?$('f-exec').value||'all':'all',dt=$('f-date')?$('f-date').value:'';
  const q=($('f-exec-q')?$('f-exec-q').value:'').trim().toLowerCase();
  return allRequestLines.filter(l=>{
    if(ex!=='all'&&(l.executor||'').trim()!==ex)return false;
    if(dt&&String(l.exec_start_date||'').slice(0,10)!==dt)return false;
    if(q){
      const pTxt=typeof window.getRequestPeopleNamesText==='function'?window.getRequestPeopleNamesText(l.transaction_id,l.id,l.service).toLowerCase():'';
      const hit=(l.client_name||'').toLowerCase().includes(q)||pTxt.includes(q)||(l.phone||'').includes(q)||String(l.transaction_id||'').toLowerCase().includes(q)||String(l.service_ref||'').toLowerCase().includes(q)||(l.service||'').toLowerCase().includes(q)||(l.executor||'').toLowerCase().includes(q);
      if(!hit)return false;
    }
    return true;
  });
}
function loadMoreExecLines(){
  execSheetLimit+=EXEC_PAGE_SIZE;
  filterExecSheet(true);
}
window.loadMoreExecLines=loadMoreExecLines;
function filterExecSheet(keepLimit){
  const ex=$('f-exec')?$('f-exec').value||'all':'all',dt=$('f-date')?$('f-date').value:'';
  const q=($('f-exec-q')?$('f-exec-q').value:'').trim().toLowerCase();
  const sig=ex+'|'+dt+'|'+q;
  if(!keepLimit&&sig!==lastExecFilterSig){
    execSheetLimit=EXEC_PAGE_SIZE;
    lastExecFilterSig=sig;
  }
  const f=getFilteredExecLines();
  const cost=f.reduce((s,l)=>s+execCostOf(l),0);
  const shown=f.slice(0,execSheetLimit);
  $('x-count').textContent=f.length+(f.length>shown.length?' (معروض أحدث '+shown.length+')':'');
  $('x-total').textContent=formatCurrency(cost);
  $('x-label').textContent=(ex==='all'?'كل المنفذين':ex)+(dt?' ('+formatDateOnly(dt)+')':'');

  $('sheet-body').innerHTML=shown.map(function(l){
    const st=l.status||'In Progress';
    const wa=waLink(l.phone,'أهلاً '+(l.client_name||'')+'، بخصوص معاملتك رقم '+(l.transaction_id||'')+' — تساهيل');
    const phHtml=l.phone?'<div class="rc-phone-pill"><span>'+escapeHtml(l.phone)+'</span>'+(wa?'<a href="'+wa+'" target="_blank" rel="noopener" class="text-emerald-600 hover:text-emerald-700 text-sm leading-none" title="مراسلة واتساب"><i class="fa-brands fa-whatsapp"></i></a>':'')+'</div>':'<span class="text-slate-300">—</span>';
    const svcHtml='<div class="rc-svc-list"><div class="rc-svc-pill"><span class="rc-svc-name">'+escapeHtml(l.service||'—')+'</span></div></div>';
    const execHtml=l.executor?'<span class="rc-exec-pill"><i class="fa-solid fa-gear text-[10px]"></i><span>'+escapeHtml(l.executor)+'</span></span>':'<span class="text-slate-300">—</span>';
    const startDt=l.exec_start_date?formatDateOnly(l.exec_start_date):formatDateOnly(lineDate(l));
    const unitCost=Number(l.exec_unit_cost)||0;
    const totalCost=execCostOf(l);
    const peopleSub=typeof window.getRequestPeopleInlineBadge==='function'?window.getRequestPeopleInlineBadge(l.transaction_id,l.id,l.service):'';
    return '<tr data-st17="'+escapeHtml(st)+'" class="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 align-middle">'+
      '<td class="px-4 py-3.5 font-bold text-ink dark:text-white min-w-[175px] max-w-[240px]"><button '+ac(l.client_name)+' class="text-right text-start leading-snug hover:text-brand-600 hover:underline block w-full">'+escapeHtml(l.client_name)+'</button>'+peopleSub+'<div class="mt-1">'+badge(st)+'</div></td>'+
      '<td class="px-3 py-3.5 whitespace-nowrap" dir="ltr">'+phHtml+'</td>'+
      '<td class="px-3 py-3.5 whitespace-nowrap" dir="ltr"><button '+at(l.transaction_id)+' class="rc-tx-pill">'+escapeHtml(l.transaction_id)+'</button></td>'+
      '<td class="px-3 py-3.5 whitespace-nowrap font-mono text-xs font-bold text-violet-700 dark:text-violet-300" dir="ltr">'+(l.service_ref?escapeHtml(l.service_ref):'<span class="text-slate-300 font-normal">—</span>')+'</td>'+
      '<td class="px-3 py-3.5">'+svcHtml+'</td>'+
      '<td class="px-3 py-3.5 text-center whitespace-nowrap"><span class="rc-svc-qty" dir="ltr">×'+fmtNum(l.qty)+'</span></td>'+
      '<td class="px-3 py-3.5 whitespace-nowrap">'+execHtml+'</td>'+
      '<td class="px-3 py-3.5 font-mono text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">'+formatCurrency(unitCost)+'</td>'+
      '<td class="px-3 py-3.5 font-bold font-mono text-ink dark:text-white whitespace-nowrap text-sm">'+formatCurrency(totalCost)+'</td>'+
      '<td class="px-3 py-3.5 whitespace-nowrap"><span class="inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap"><i class="fa-regular fa-calendar text-[10px] text-slate-400"></i><span>'+escapeHtml(startDt)+'</span></span></td>'+
      '<td class="px-3 py-3.5 text-xs min-w-[150px] max-w-[250px] whitespace-pre-wrap break-words text-slate-700 dark:text-slate-300">'+(l.notes?'<div class="rounded-lg bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/60 px-2.5 py-1.5 text-amber-900 dark:text-amber-200">'+escapeHtml(l.notes)+'</div>':'<span class="text-slate-300">—</span>')+'</td></tr>';
  }).join('')||'<tr><td colspan="11" class="px-6 py-10 text-center text-slate-400">لا توجد مهام مطابقة</td></tr>';

  $('sheet-cards-container').innerHTML=shown.map(function(l){
    const st=l.status||'In Progress';
    const wa=waLink(l.phone,'أهلاً '+(l.client_name||'')+'، بخصوص معاملتك رقم '+(l.transaction_id||'')+' — تساهيل');
    const unitCost=Number(l.exec_unit_cost)||0;
    const totalCost=execCostOf(l);
    const peopleSub=typeof window.getRequestPeopleInlineBadge==='function'?window.getRequestPeopleInlineBadge(l.transaction_id,l.id,l.service):'';
    return '<div data-st17="'+escapeHtml(st)+'" class="card lift p-4 space-y-2.5 text-xs">'+
      '<div class="flex items-start justify-between gap-2">'+
        '<div class="min-w-0"><button '+ac(l.client_name)+' class="font-bold text-ink dark:text-white leading-snug text-start hover:text-brand-600">'+escapeHtml(l.client_name)+'</button>'+peopleSub+
          '<div class="mt-1 flex flex-wrap items-center gap-1.5" dir="ltr">'+
            '<button '+at(l.transaction_id)+' class="rc-tx-pill !py-0.5 !px-2 !text-[11px]" title="Request ID">'+escapeHtml(l.transaction_id)+'</button>'+
            (l.service_ref?'<span class="rounded-md bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 px-2 py-0.5 font-mono text-[11px] font-bold" title="Service ID">'+escapeHtml(l.service_ref)+'</span>':'')+
            (l.phone?'<span class="rc-phone-pill !py-0.5 !px-2 !text-[11px]"><span>'+escapeHtml(l.phone)+'</span>'+(wa?'<a href="'+wa+'" target="_blank" rel="noopener" class="text-emerald-600"><i class="fa-brands fa-whatsapp"></i></a>':'')+'</span>':'')+
          '</div>'+
        '</div>'+
        '<div class="shrink-0">'+badge(st)+'</div>'+
      '</div>'+
      '<div class="rc-svc-pill w-full"><span class="rc-svc-name">'+escapeHtml(l.service||'—')+'</span><span class="rc-svc-qty" dir="ltr">×'+fmtNum(l.qty)+'</span></div>'+
      (l.notes?'<div class="rounded-lg bg-amber-50 dark:bg-amber-950/30 px-2.5 py-1.5 text-[11px] text-amber-900 dark:text-amber-200 whitespace-pre-wrap break-words"><i class="fa-solid fa-note-sticky ms-1"></i>'+escapeHtml(l.notes)+'</div>':'')+
      '<div class="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px]">'+
        '<div><span class="text-slate-400 block">المنفذ</span><b class="text-ink dark:text-white">'+escapeHtml(l.executor||'—')+'</b></div>'+
        '<div><span class="text-slate-400 block">تكلفة الوحدة</span><b class="font-mono text-ink dark:text-white">'+formatCurrency(unitCost)+'</b></div>'+
        '<div><span class="text-slate-400 block">إجمالي التنفيذ</span><b class="font-mono text-brand-600 dark:text-violet-300">'+formatCurrency(totalCost)+'</b></div>'+
      '</div>'+
      '<div class="flex items-center justify-between text-[11px] text-slate-400">'+
        '<span>بداية التنفيذ: '+formatDateOnly(l.exec_start_date||lineDate(l))+'</span>'+
        '<button '+at(l.transaction_id)+' class="text-brand-600 dark:text-violet-300 font-bold px-2 py-1 rounded hover:underline">عرض التفاصيل</button>'+
      '</div>'+
    '</div>';
  }).join('')||'<div class="card p-6 text-center text-slate-400 text-xs">لا توجد مهام مطابقة</div>';

  let moreBar=$('exec-more-bar');
  if(!moreBar&&$('sheet-cards-container')){
    $('sheet-cards-container').insertAdjacentHTML('afterend','<div id="exec-more-bar" class="card p-4 text-center"></div>');
    moreBar=$('exec-more-bar');
  }
  if(moreBar){
    const rem=f.length-shown.length;
    if(rem>0){
      moreBar.className='card p-4 flex flex-wrap items-center justify-between gap-3';
      moreBar.innerHTML='<span class="text-xs font-semibold text-slate-500">يتم عرض أحدث <b class="text-ink dark:text-white">'+shown.length+'</b> معاملة تنفيذ من إجمالي <b class="text-ink dark:text-white">'+f.length+'</b> لسرعة التصفح</span>'+
        '<button type="button" onclick="loadMoreExecLines()" class="btn-neo-pri px-5 py-2.5 text-xs mx-auto sm:mx-0"><i class="fa-solid fa-angles-down"></i><span>تحميل المزيد (عرض '+Math.min(EXEC_PAGE_SIZE,rem)+' كمان — متبقي '+rem+')</span></button>';
    }else if(f.length>0){
      moreBar.className='card p-3 text-center text-xs text-slate-400';
      moreBar.innerHTML='تم عرض كل المعاملات المطابقة ('+f.length+' بند تنفيذ)';
    }else{
      moreBar.className='hidden';
      moreBar.innerHTML='';
    }
  }
}
function clearExecFilters(){
  if($('f-exec'))$('f-exec').value='all';
  if($('f-date'))$('f-date').value='';
  if($('f-exec-q'))$('f-exec-q').value='';
  execSheetLimit=EXEC_PAGE_SIZE;
  filterExecSheet();
}
function printExecSheet(){
  const ex=$('f-exec').value||'all',dt=$('f-date').value,f=getFilteredExecLines(),cost=f.reduce((s,l)=>s+execCostOf(l),0);
  $('print-content').innerHTML='<div class="receipt-box" style="font-size:12px"><div style="display:flex;justify-content:space-between;border-bottom:2px solid #0b1b33;padding-bottom:8px;margin-bottom:10px"><div style="display:flex;flex-direction:column;align-items:flex-start;gap:4px">'+logoImg(38,8)+'<div><div style="font-size:15px;font-weight:bold">قسم الخدمات الحكومية</div><div style="font-size:11px">متابعة المنفذين</div></div></div><div style="font-size:11px"><div>المنفذ: <b>'+escapeHtml(ex==='all'?'كل المنفذين':ex)+'</b></div><div>التاريخ: '+escapeHtml(dt||'كل التواريخ')+'</div></div></div><div style="background:#f1f5f9;border:1px solid #ccc;padding:8px;margin-bottom:10px">إجمالي المهام: <b>'+f.length+'</b> &nbsp;|&nbsp; إجمالي التكلفة: <b>'+formatCurrency(cost)+'</b></div><table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr style="background:#0b1b33;color:#fff">'+['العميل','الهاتف','Request ID','Service ID','الخدمة','العدد','المنفذ','تكلفة الوحدة','إجمالي التنفيذ','بداية التنفيذ','ملاحظات'].map(h=>'<th style="padding:6px;border:1px solid #555">'+h+'</th>').join('')+'</tr></thead><tbody>'+f.map(l=>{const pTxt=typeof window.getRequestPeopleNamesText==='function'?window.getRequestPeopleNamesText(l.transaction_id,l.id,l.service):'';return '<tr>'+[l.client_name+(pTxt?' ('+pTxt+')':''),l.phone||'—',l.transaction_id,l.service_ref||'—',l.service,l.qty,l.executor||'—',formatCurrency(Number(l.exec_unit_cost)||0),formatCurrency(execCostOf(l)),formatDateOnly(l.exec_start_date||lineDate(l)),l.notes||'—'].map(v=>'<td style="padding:5px;border:1px solid #888">'+escapeHtml(v)+'</td>').join('')+'</tr>';}).join('')+'</tbody></table></div>';
  window.print();
}
function csvCell(v){return '"'+String(v==null?'':v).replace(/"/g,'""')+'"';}
function downloadCsvFile(name,headers,rows){
  const blob=new Blob(['\uFEFF'+[headers.map(csvCell).join(','),...rows.map(r=>r.map(csvCell).join(','))].join('\n')],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();document.body.removeChild(a);showToast('تم تحميل ملف Excel بنجاح');
}
function exportExecSheetCsv(){
  const f=getFilteredExecLines();if(!f.length)return showToast('لا توجد بيانات للتصدير','info');
  downloadCsvFile('المنفذين_'+new Date().toISOString().slice(0,10)+'.csv',['العميل','المستفيدون','الهاتف','Request ID','Service ID','الخدمة','العدد','المنفذ','تكلفة تنفيذ الوحدة','إجمالي التنفيذ','بداية التنفيذ','الحالة','ملاحظات'],f.map(l=>[l.client_name,typeof window.getRequestPeopleNamesText==='function'?window.getRequestPeopleNamesText(l.transaction_id,l.id,l.service):'',l.phone,l.transaction_id,l.service_ref||'',l.service,l.qty,l.executor,Number(l.exec_unit_cost)||0,execCostOf(l),l.exec_start_date||dayKey(lineDate(l)),statusLabel(l.status),l.notes]));
}

/* ---------- البحث ---------- */
function searchResults(){
  const q=$('search-key').value.trim().toLowerCase(),st=$('search-status-filter').value;
  return allRequestLines.filter(l=>{
    if(st!=='all'&&l.status!==st)return false;if(!q)return true;
    const pTxt=typeof window.getRequestPeopleNamesText==='function'?window.getRequestPeopleNamesText(l.transaction_id,l.id,l.service):'';
    return [l.client_name,pTxt,l.transaction_id,l.service_ref,l.service,l.employee,l.notes,l.rn_nm].some(v=>(v||'').toLowerCase().includes(q))||(l.phone||'').replace(/\s+/g,'').includes(q.replace(/\s+/g,''));
  });
}
function searchMore(){window.__searchLim=(window.__searchLim||40)+60;executeSearch();}
let __sTimer=0;function searchDebounced(){clearTimeout(__sTimer);__sTimer=setTimeout(function(){window.__searchLim=40;executeSearch();},150);}
function executeSearch(){
  const q=$('search-key').value.trim(),st=$('search-status-filter').value;
  if(!q&&st==='all'){const m='اكتب في خانة البحث لعرض المعاملات المطابقة...';$('search-results-table').innerHTML='<tr><td colspan="9" class="px-6 py-10 text-center text-slate-400">'+m+'</td></tr>';$('search-results-cards').innerHTML='<div class="card p-6 text-center text-slate-400 text-xs">'+m+'</div>';$('search-results-count').textContent='أدخل كلمة البحث للبدء...';return;}
  const r=searchResults();$('search-results-count').textContent='تم العثور على '+r.length+' نتيجة';
  const lim=window.__searchLim||40,rv=r.slice(0,lim),moreBtn=r.length>lim?'<button type="button" onclick="searchMore()" class="btn-neo-pri text-xs">عرض المزيد ('+(r.length-lim)+' نتيجة)</button>':'';
  const none='لم يتم العثور على نتائج مطابقة';
  $('search-results-table').innerHTML=rv.map(l=>{
    const stVal=l.status||'In Progress';
    const wa=waLink(l.phone,'أهلاً '+(l.client_name||'')+'، بخصوص معاملتك رقم '+(l.transaction_id||'')+' — تساهيل');
    const phHtml=l.phone?'<div class="rc-phone-pill"><span>'+escapeHtml(l.phone)+'</span>'+(wa?'<a href="'+wa+'" target="_blank" rel="noopener" class="text-emerald-600 hover:text-emerald-700 text-sm leading-none" title="مراسلة واتساب"><i class="fa-brands fa-whatsapp"></i></a>':'')+'</div>':'<span class="text-slate-300">—</span>';
    const svcHtml='<div class="rc-svc-list"><div class="rc-svc-pill"><span class="rc-svc-name">'+escapeHtml(l.service||'—')+'</span><span class="rc-svc-qty" dir="ltr">×'+fmtNum(l.qty)+'</span></div></div>';
    return '<tr data-st17="'+escapeHtml(stVal)+'" class="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 align-middle">'+
      '<td class="px-4 py-3.5 font-bold text-ink dark:text-white min-w-[175px] max-w-[240px]"><button '+ac(l.client_name)+' class="text-right text-start leading-snug hover:text-brand-600 hover:underline block w-full">'+escapeHtml(l.client_name)+'</button></td>'+
      '<td class="px-3 py-3.5 whitespace-nowrap" dir="ltr">'+phHtml+'</td>'+
      '<td class="px-3 py-3.5 whitespace-nowrap" dir="ltr"><button '+at(l.transaction_id)+' class="rc-tx-pill">'+escapeHtml(l.transaction_id)+'</button></td>'+
      '<td class="px-3 py-3.5">'+svcHtml+'</td>'+
      '<td class="px-3 py-3.5 font-bold text-ink dark:text-white whitespace-nowrap text-sm">'+formatCurrency(l.total)+'</td>'+
      '<td class="px-3 py-3.5 text-xs whitespace-nowrap font-medium">'+empCell(l.employee)+'</td>'+
      '<td class="px-3 py-3.5 whitespace-nowrap">'+badge(stVal)+'</td>'+
      '<td class="px-3 py-3.5 text-xs text-slate-600 dark:text-slate-300 max-w-[200px] break-words">'+(l.notes?escapeHtml(l.notes):'<span class="text-slate-300">—</span>')+'</td>'+
      '<td class="px-3 py-3.5 text-center whitespace-nowrap"><div class="inline-flex items-center justify-center gap-1.5">'+(wa?'<a href="'+wa+'" target="_blank" rel="noopener" class="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 hover:bg-emerald-100 transition"><i class="fa-brands fa-whatsapp text-xs"></i></a>':'')+'<button '+at(l.transaction_id)+' class="p-2 rounded-lg bg-slate-100/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-brand-50 hover:text-brand-600 transition" title="التفاصيل"><i class="fa-solid fa-eye text-xs"></i></button></div></td></tr>';
  }).join('')+(moreBtn?'<tr><td colspan="9" class="px-6 py-4 text-center">'+moreBtn+'</td></tr>':'')||'<tr><td colspan="9" class="px-6 py-10 text-center text-slate-400">'+none+'</td></tr>';

  $('search-results-cards').innerHTML=rv.map(l=>{
    const stVal=l.status||'In Progress';
    return '<div data-st17="'+escapeHtml(stVal)+'" class="card lift p-4 space-y-2.5 text-xs">'+
      '<div class="flex items-start justify-between gap-2"><button '+ac(l.client_name)+' class="font-bold text-ink dark:text-white leading-snug text-start hover:text-brand-600">'+escapeHtml(l.client_name)+'</button><button '+at(l.transaction_id)+' class="rc-tx-pill !py-0.5 !px-2 !text-[11px]" dir="ltr">'+escapeHtml(l.transaction_id)+'</button></div>'+
      '<div class="rc-svc-pill w-full"><span class="rc-svc-name">'+escapeHtml(l.service||'—')+'</span><span class="rc-svc-qty" dir="ltr">×'+fmtNum(l.qty)+'</span></div>'+
      '<div class="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500"><span>'+empCell(l.employee)+'</span><div class="flex items-center gap-2">'+badge(stVal)+'<span class="font-bold text-sm text-brand-600 dark:text-violet-300 whitespace-nowrap">'+formatCurrency(l.total)+'</span></div></div></div>';
  }).join('')+(moreBtn?'<div class="text-center py-2">'+moreBtn+'</div>':'')||'<div class="card p-6 text-center text-slate-400 text-xs">'+none+'</div>';
}
function exportSearchResultsCsv(){
  const r=searchResults();if(!r.length)return showToast('لا توجد نتائج للتصدير','info');
  downloadCsvFile('نتائج_البحث_'+new Date().toISOString().slice(0,10)+'.csv',['العميل','الهاتف','رقم المعاملة','الخدمة','العدد','سعر الوحدة','الإجمالي','الموظف','طريقة الدفع','الحالة','التاريخ'],r.map(l=>[l.client_name,l.phone,l.transaction_id,l.service,l.qty,l.unit_price,l.total,l.employee,l.payment_method,statusLabel(l.status),lineDate(l)]));
}

/* ---------- الإيصالات ---------- */
function syncReceiptItemCb(el){
  if(!el)return;
  const val=String(el.value),chk=!!el.checked;
  document.querySelectorAll('.receipt-item-cb').forEach(cb=>{if(String(cb.value)===val)cb.checked=chk;});
  const desktopCbs=document.querySelectorAll('#receipt-lines-body .receipt-item-cb');
  const selAll=$('select-all-receipt');
  if(selAll&&desktopCbs.length)selAll.checked=Array.from(desktopCbs).every(cb=>cb.checked);
}
window.syncReceiptItemCb=syncReceiptItemCb;
function loadClientReceiptLines(){
  const q=$('receipt-client-input').value.trim().toLowerCase();
  if(!q)return showToast('اكتب اسم العميل أو رقم الهاتف','error');
  clientSelectedReceiptLines=allRequestLines.filter(l=>(l.client_name||'').toLowerCase().includes(q)||(l.phone||'').replace(/\s+/g,'').includes(q.replace(/\s+/g,'')));
  if(!clientSelectedReceiptLines.length){$('receipt-container').classList.add('hidden');return showToast('لا توجد معاملات لهذا العميل','info');}
  const s=clientSelectedReceiptLines[0];
  $('receipt-client-meta').textContent='العميل: '+s.client_name+' · الهاتف: '+(s.phone||'—')+' · عدد البنود: '+clientSelectedReceiptLines.length;
  
  $('receipt-lines-body').innerHTML=clientSelectedReceiptLines.map((l,i)=>{
    const stVal=l.status||'In Progress';
    return '<tr data-st17="'+escapeHtml(stVal)+'" class="hover:bg-slate-50 dark:hover:bg-slate-800/40 align-middle">'+
      '<td class="p-3.5 text-center"><input type="checkbox" checked value="'+i+'" onchange="syncReceiptItemCb(this)" class="receipt-item-cb h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"></td>'+
      '<td class="p-3.5 whitespace-nowrap" dir="ltr"><button type="button" '+at(l.transaction_id)+' class="rc-tx-pill">'+escapeHtml(l.transaction_id)+'</button></td>'+
      '<td class="p-3.5"><div class="rc-svc-list"><div class="rc-svc-pill"><span class="rc-svc-name">'+escapeHtml(l.service||'—')+'</span><span class="rc-svc-qty" dir="ltr">×'+fmtNum(l.qty)+'</span></div></div></td>'+
      '<td class="p-3.5 text-center whitespace-nowrap"><span class="rc-svc-qty" dir="ltr">×'+fmtNum(l.qty)+'</span></td>'+
      '<td class="p-3.5 whitespace-nowrap font-semibold text-slate-700 dark:text-slate-200">'+formatCurrency(l.unit_price)+'</td>'+
      '<td class="p-3.5 whitespace-nowrap font-bold text-sm text-brand-600 dark:text-violet-300">'+formatCurrency(l.total)+'</td>'+
      '<td class="p-3.5 text-xs whitespace-nowrap font-medium">'+empCell(l.employee)+'</td></tr>';
  }).join('');
  
  $('receipt-cards-container').innerHTML=clientSelectedReceiptLines.map((l,i)=>{
    const stVal=l.status||'In Progress';
    return '<label data-st17="'+escapeHtml(stVal)+'" class="card lift p-4 flex items-start gap-3 cursor-pointer">'+
      '<input type="checkbox" checked value="'+i+'" onchange="syncReceiptItemCb(this)" class="receipt-item-cb mt-1 h-5 w-5 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500">'+
      '<div class="min-w-0 flex-1 text-xs space-y-2">'+
        '<div class="rc-svc-pill w-full"><span class="rc-svc-name">'+escapeHtml(l.service||'—')+'</span><span class="rc-svc-qty" dir="ltr">×'+fmtNum(l.qty)+'</span></div>'+
        '<div class="flex items-center justify-between gap-2">'+
          '<span class="rc-tx-pill !py-0.5 !px-2 !text-[11px]" dir="ltr">'+escapeHtml(l.transaction_id)+'</span>'+
          '<span class="font-bold text-sm text-brand-600 dark:text-violet-300 whitespace-nowrap">'+formatCurrency(l.total)+'</span>'+
        '</div>'+
        '<div class="flex items-center justify-between text-[11px] text-slate-500">'+
          '<span>سعر الوحدة: '+formatCurrency(l.unit_price)+'</span>'+
          '<span>'+empCell(l.employee)+'</span>'+
        '</div>'+
      '</div>'+
    '</label>';
  }).join('');

  $('select-all-receipt').checked=true;$('receipt-container').classList.remove('hidden');
}
function toggleSelectAllReceipt(c){document.querySelectorAll('.receipt-item-cb').forEach(cb=>{cb.checked=c;});}
function selectedReceiptLines(){
  const cbs=document.querySelectorAll('.receipt-item-cb:checked');
  if(!cbs.length){showToast('حدد خدمة واحدة على الأقل','error');return null;}
  const uniqueIdx=[...new Set(Array.from(cbs).map(cb=>parseInt(cb.value,10)).filter(n=>Number.isFinite(n)))];
  if(!uniqueIdx.length){showToast('حدد خدمة واحدة على الأقل','error');return null;}
  return uniqueIdx.map(i=>clientSelectedReceiptLines[i]).filter(Boolean);
}
function printOfficialReceipt(){const ls=selectedReceiptLines();if(ls)buildOfficialReceipt(ls);}
function printThermalSlip(){const ls=selectedReceiptLines();if(ls)buildThermalSlip(ls);}
function printTxReceipt(tx){
  const ls=allRequestLines.filter(l=>String(l.transaction_id)===String(tx));
  if(!ls.length)return showToast('تعذّر العثور على المعاملة','error');
  closeTxModal();buildOfficialReceipt(ls);
}
function buildOfficialReceipt(ls){
  const s=ls[0],total=ls.reduce((a,l)=>a+(Number(l.total)||0),0),rec='REC-'+new Date().getFullYear()+'-'+Math.floor(10000+Math.random()*90000);
  const c='border:1px solid #555;padding:6px;';
  $('print-content').innerHTML='<div class="receipt-box" style="font-size:12px">'+
  '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #0b1b33;padding-bottom:12px;margin-bottom:14px"><div style="display:flex;flex-direction:column;align-items:flex-start;gap:4px">'+logoImg(46,10)+'<div><div style="font-size:14px;font-weight:bold;color:#0b1b33">قسم الخدمات الحكومية</div></div></div><div style="text-align:left;font-size:11px"><div style="font-size:14px;font-weight:bold">إيصال تسليم واستلام مستندات</div><div>رقم الإيصال: <b>'+rec+'</b></div><div>التاريخ: '+new Date().toLocaleDateString('ar-EG')+'</div></div></div>'+
  '<table style="width:100%;border-collapse:collapse;margin-bottom:12px"><tr><td style="'+c+'background:#eee;width:18%"><b>السيد / المنشأة</b></td><td style="'+c+'width:32%">'+escapeHtml(s.client_name)+'</td><td style="'+c+'background:#eee;width:18%"><b>رقم التليفون</b></td><td style="'+c+'width:32%" dir="ltr">'+escapeHtml(s.phone||'—')+'</td></tr>'+
  '<tr><td style="'+c+'background:#eee"><b>العنوان</b></td><td style="'+c+'">'+escapeHtml(s.address||'—')+'</td><td style="'+c+'background:#eee"><b>المستلم</b></td><td style="'+c+'">'+escapeHtml(s.receiver||'—')+'</td></tr>'+
  '<tr><td style="'+c+'background:#eee"><b>الموظف المسؤول</b></td><td style="'+c+'">'+escapeHtml(s.employee||'—')+'</td><td style="'+c+'background:#eee"><b>طريقة الدفع</b></td><td style="'+c+'">'+escapeHtml(s.payment_method||'—')+'</td></tr></table>'+
  '<table style="width:100%;border-collapse:collapse;margin-bottom:12px"><thead><tr style="background:#0b1b33;color:#fff"><th style="'+c+'width:30px">م</th><th style="'+c+'">المعاملة</th><th style="'+c+'text-align:right">الخدمة</th><th style="'+c+'">تاريخ الاستلام</th><th style="'+c+'width:44px">العدد</th><th style="'+c+'">سعر الوحدة</th><th style="'+c+'text-align:left">الإجمالي</th></tr></thead><tbody>'+
  ls.map((l,i)=>'<tr><td style="'+c+'text-align:center">'+(i+1)+'</td><td style="'+c+'text-align:center" dir="ltr">'+escapeHtml(l.transaction_id)+'</td><td style="'+c+'font-weight:600">'+escapeHtml(l.service)+'</td><td style="'+c+'text-align:center">'+formatDateOnly(lineDate(l))+'</td><td style="'+c+'text-align:center">'+l.qty+'</td><td style="'+c+'text-align:center">'+fmtNum(l.unit_price)+'</td><td style="'+c+'text-align:left;font-weight:bold">'+formatCurrency(l.total)+'</td></tr>').join('')+'</tbody></table>'+
  '<div style="border-top:2px solid #0b1b33;padding-top:8px"><div style="display:flex;justify-content:space-between;align-items:baseline"><b style="font-size:14px">المبلغ الإجمالي:</b><b style="font-size:22px;color:#0b1b33">'+formatCurrency(total)+'</b></div><div style="background:#f1f5f9;padding:6px;margin-top:6px;font-weight:600">المبلغ كتابة: '+tafqeetArabic(total)+'</div></div>'+
  '<div style="border:1px solid #555;background:#fef9c3;padding:8px;font-size:11px;text-align:center;margin:16px 0;font-weight:bold">أقر أنا / '+escapeHtml(s.client_name)+' بأنني استلمت المستندات الموضحة أعلاه كاملة وبحالة جيدة، ولا توجد أي ملاحظات وقت الاستلام.</div>'+
  '<table style="width:100%;border-collapse:collapse;margin-top:24px"><tr><td style="'+c+'background:#eee;width:25%;text-align:center"><b>اسم المندوب</b></td><td style="'+c+'width:25%"></td><td style="'+c+'background:#eee;width:25%;text-align:center"><b>تاريخ التسليم</b></td><td style="'+c+'width:25%;text-align:center">&nbsp;&nbsp;/&nbsp;&nbsp;/&nbsp;'+new Date().getFullYear()+'</td></tr><tr><td style="'+c+'padding:16px;text-align:center;background:#eee"><b>توقيع المندوب</b></td><td style="'+c+'padding:16px"></td><td style="'+c+'padding:16px;text-align:center;background:#eee"><b>توقيع العميل</b></td><td style="'+c+'padding:16px"></td></tr></table></div>';
  window.print();
}
function buildThermalSlip(ls){
  const s=ls[0],total=ls.reduce((a,l)=>a+(Number(l.total)||0),0),hr='<div style="border-top:1px dashed #000;margin:8px 0"></div>';
  $('print-content').innerHTML='<div style="max-width:300px;margin:0 auto;font-family:monospace;font-size:11px;padding:10px;border:1px dashed #000;text-align:center"><div style="display:flex;justify-content:center;margin-bottom:4px">'+logoImg(44,10)+'</div><div style="font-size:11px;font-weight:bold">قسم الخدمات الحكومية</div>'+hr+'<div style="text-align:right;line-height:1.6"><div>العميل: '+escapeHtml(s.client_name)+'</div><div>الهاتف: '+escapeHtml(s.phone||'—')+'</div><div>الموظف: '+escapeHtml(s.employee||'—')+'</div><div>التاريخ: '+new Date().toLocaleDateString('ar-EG')+'</div></div>'+hr+
  '<table style="width:100%;text-align:right;font-size:10px"><thead><tr><th>الخدمة</th><th style="text-align:center">عدد</th><th style="text-align:left">المبلغ</th></tr></thead><tbody>'+ls.map(l=>'<tr><td>'+escapeHtml(l.service)+'</td><td style="text-align:center">'+l.qty+'</td><td style="text-align:left">'+fmtNum(l.total)+'</td></tr>').join('')+'</tbody></table>'+hr+'<div style="display:flex;justify-content:space-between;font-weight:bold;font-size:13px"><span>الإجمالي:</span><span>'+formatCurrency(total)+'</span></div><div style="margin-top:10px;font-size:9px">شكراً لتعاملكم معنا</div></div>';
  window.print();
}

/* ---------- الداش بورد ---------- */
function styleDashButtons(){
  ['all','month','week','today'].forEach(r=>{const b=$('dash-btn-'+r);if(b)b.className='rounded-lg px-3 py-1 font-semibold '+(r===currentDashboardRange?'text-white bg-ink dark:bg-brand-600':'text-slate-600 dark:text-slate-300');});
}
function setDashboardRange(r){currentDashboardRange=r;styleDashButtons();renderDashboardMetrics();}
function getFilteredDashboardLines(){
  const now=new Date(),today=now.toLocaleDateString('en-CA');
  if(currentDashboardRange==='today')return allRequestLines.filter(l=>dayKey(lineDate(l))===today);
  if(currentDashboardRange==='week'){const w=new Date();w.setDate(now.getDate()-7);return allRequestLines.filter(l=>new Date(lineDate(l))>=w);}
  if(currentDashboardRange==='month')return allRequestLines.filter(l=>dayKey(lineDate(l)).slice(0,7)===today.slice(0,7));
  return allRequestLines;
}
function drawChart(key,id,cfg){const el=$(id);if(!el||typeof Chart==='undefined')return;if(chartInstances[key])chartInstances[key].destroy();chartInstances[key]=new Chart(el,cfg);}
function renderDashboardMetrics(){
  const ls=getFilteredDashboardLines();
  const rev=ls.reduce((s,l)=>s+(Number(l.total)||0),0),cost=ls.reduce((s,l)=>s+execCostOf(l),0);
  const txs=new Set(ls.map(l=>l.transaction_id).filter(Boolean)).size;
  if($('d-total-revenue'))$('d-total-revenue').textContent=formatCurrency(rev);
  if($('d-total-cost'))$('d-total-cost').textContent=formatCurrency(cost);
  if($('d-net-margin'))$('d-net-margin').textContent=formatCurrency(rev-cost);
  if($('d-orders-count'))$('d-orders-count').textContent=txs;
  if($('d-orders-avg-sub'))$('d-orders-avg-sub').textContent='متوسط المعاملة: '+formatCurrency(txs?rev/txs:0);
  const grid={color:'rgba(148,163,184,0.12)'},base={responsive:true,maintainAspectRatio:false,animation:{duration:900,easing:'easeOutQuart'}};
  const dm=new Map();ls.forEach(l=>{const k=dayKey(lineDate(l));if(k)dm.set(k,(dm.get(k)||0)+(Number(l.total)||0));});
  const days=[...dm.keys()].sort().slice(-14);
  drawChart('daily','chart-daily-revenue',{type:'line',data:{labels:days.length?days.map(d=>formatDateOnly(d)):['—'],datasets:[{label:'المبيعات (ج.م)',data:days.length?days.map(d=>dm.get(d)):[0],borderColor:'#8b5cf6',backgroundColor:'rgba(139,92,246,0.18)',fill:true,tension:.35,borderWidth:2.5}]},options:Object.assign({},base,{plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,grid:grid},x:{grid:{display:false}}}})});
  const pm=new Map();ls.forEach(l=>{const m=l.payment_method||'كاش';pm.set(m,(pm.get(m)||0)+(Number(l.total)||0));});
  drawChart('pay','chart-payment-methods',{type:'doughnut',data:{labels:pm.size?[...pm.keys()]:['—'],datasets:[{data:pm.size?[...pm.values()]:[1],backgroundColor:['#8b5cf6','#ec4899','#0d9488','#f59e0b','#10b981','#3b82f6']}]},options:Object.assign({},base,{plugins:{legend:{position:'bottom',labels:{boxWidth:12,font:{family:'IBM Plex Sans Arabic'}}}}})});
  const sm=new Map();ls.forEach(l=>{const s=l.service||'أخرى';sm.set(s,(sm.get(s)||0)+(Number(l.total)||0));});
  const top=[...sm.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5);
  drawChart('svc','chart-top-services',{type:'bar',data:{labels:top.length?top.map(t=>t[0].length>24?t[0].slice(0,24)+'…':t[0]):['—'],datasets:[{label:'المبيعات (ج.م)',data:top.length?top.map(t=>t[1]):[0],backgroundColor:'#8b5cf6',borderRadius:6}]},options:Object.assign({},base,{plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,grid:grid},x:{grid:{display:false}}}})});
  const cm=new Map();ls.forEach(l=>{const n=(l.client_name||'').trim();if(!n)return;cm.set(n,(cm.get(n)||0)+(Number(l.total)||0));});
  const tc=[...cm.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5);
  if($('top-clients-box'))$('top-clients-box').innerHTML=tc.map((c,i)=>'<div class="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 text-xs"><div class="flex items-center gap-2.5 truncate"><span class="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700 text-[10px] font-bold">'+(i+1)+'</span><button '+ac(c[0])+' class="font-bold text-ink dark:text-white truncate hover:text-brand-600">'+escapeHtml(c[0])+'</button></div><div class="font-mono font-bold text-brand-600 shrink-0">'+formatCurrency(c[1])+'</div></div>').join('')||'<div class="text-xs text-slate-400 py-6 text-center">لا توجد بيانات كافية</div>';
  const em=new Map();ls.forEach(l=>{const e=l.employee||'غير محدد';if(!em.has(e))em.set(e,{rev:0,n:0,tx:new Set()});const d=em.get(e);d.rev+=Number(l.total)||0;d.n++;if(l.transaction_id)d.tx.add(l.transaction_id);});
  if($('emp-perf-body'))$('emp-perf-body').innerHTML=[...em.entries()].sort((a,b)=>b[1].rev-a[1].rev).map(([n,d])=>{const t=d.tx.size||1;return '<tr class="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"><td class="px-6 py-3.5 font-bold text-ink dark:text-white">'+escapeHtml(n)+'</td><td class="px-4 py-3.5 text-center font-mono">'+t+'</td><td class="px-4 py-3.5 text-center font-mono text-slate-500">'+d.n+'</td><td class="px-4 py-3.5 font-mono font-bold text-brand-600">'+formatCurrency(d.rev)+'</td><td class="px-4 py-3.5 font-mono">'+formatCurrency(d.rev/t)+'</td></tr>';}).join('')||'<tr><td colspan="5" class="p-6 text-center text-slate-400">لا توجد بيانات</td></tr>';
}

/* ---------- بروفايل الموظفين والفريق ---------- */
const AV_COLORS=['#7c3aed','#db2777','#0d9488','#2563eb','#d97706','#059669','#dc2626','#0891b2'];
function avColor(s){let h=0;s=String(s||'');for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;return AV_COLORS[h%AV_COLORS.length];}
function avatarHtml(p,size){
  size=size||40;const nm=((p&&p.full_name)||'').trim(),url=p&&p.avatar_path?avatarUrls[p.avatar_path]:'';
  const box='width:'+size+'px;height:'+size+'px;';
  if(url)return '<img src="'+escapeHtml(url)+'" alt="" loading="lazy" class="rounded-full object-cover shrink-0" style="'+box+'">';
  return '<span class="rounded-full shrink-0 inline-flex items-center justify-center font-bold text-white" style="'+box+'font-size:'+Math.round(size*.42)+'px;background:'+avColor((p&&p.id)||nm)+'">'+escapeHtml(nm?Array.from(nm)[0]:'؟')+'</span>';
}
const __nnCache=new Map();
function normName(s){const k=s==null?'':String(s);let v=__nnCache.get(k);if(v!==undefined)return v;v=__normNameRaw(k);if(__nnCache.size>5000)__nnCache.clear();__nnCache.set(k,v);return v;}
function __normNameRaw(s){return String(s||'').normalize('NFKD').replace(/[\u064B-\u065F\u0670\u0640]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/[^\p{L}\p{N}]+/gu,' ').trim().toLowerCase();}
function profileByName(n){
  const q=normName(n);if(!q)return null;
  const ex=profiles.filter(p=>normName(p.full_name)===q);if(ex.length)return ex[0];
  const part=profiles.filter(p=>{const x=normName(p.full_name);return x&&(x.startsWith(q+' ')||q.startsWith(x+' '));});
  return part.length===1?part[0]:null;
}
function empCell(n){
  if(!n)return '—';const p=profileByName(n);
  return p?'<span class="inline-flex items-center gap-1.5">'+avatarHtml(p,22)+'<span>'+escapeHtml(n)+'</span></span>':escapeHtml(n);
}
async function signAvatars(){
  const paths=[...new Set(profiles.map(p=>p.avatar_path).filter(Boolean))];avatarUrls={};
  if(!paths.length)return;
  const r=await sbClient.storage.from('avatars').createSignedUrls(paths,43200);
  if(r.error){console.warn('avatars',r.error);return;}
  (r.data||[]).forEach(x=>{if(x&&x.signedUrl&&x.path)avatarUrls[x.path]=x.signedUrl;});
}
async function loadProfiles(){
  if(!sbClient||!currentUser)return;
  let r=await sbClient.from('profiles').select('id,full_name,phone,job_title,avatar_path,last_seen_at').order('full_name');
  if(r.error&&/42703|last_seen_at/i.test((r.error.message||'')+' '+(r.error.code||'')))r=await sbClient.from('profiles').select('id,full_name,phone,job_title,avatar_path').order('full_name');
  if(r.error){
    const missing=/PGRST205|42P01|schema cache|does not exist/i.test((r.error.message||'')+' '+(r.error.code||''));
    if(missing)profilesReady=false;else showError('تعذّر تحميل الفريق',r.error);
    renderHeaderAvatar();if(currentTab==='team')renderTeam();return;
  }
  profilesReady=true;profiles=r.data||[];
  myProfile=profiles.find(p=>p.id===currentUser.id)||null;
  const rawName=(myProfile&&myProfile.full_name)?myProfile.full_name.trim():(currentUser.email||'').split('@')[0];
  const parts=rawName.split(/\s+/).filter(Boolean);
  const shortName=parts.length>2?(parts[0]+' '+parts[1]):rawName;
  if($('user-display')){$('user-display').textContent=shortName;$('user-display').title=rawName;}
  
  try{await signAvatars();}catch(err){console.warn('avatars',err);}
  renderHeaderAvatar();renderRecentRequests();renderClientDatalists();
  if(myProfile&&myProfile.full_name&&$('employee')&&!$('employee').value){$('employee').value=myProfile.full_name;updateOrderProgressBar();}
  if(currentTab==='team')renderTeam();
}
function renderHeaderAvatar(){
  const b=$('hdr-me');if(!b)return;
  if(!currentUser){b.innerHTML='';return;}
  b.innerHTML=avatarHtml(myProfile||{id:currentUser.id,full_name:(currentUser.email||'').split('@')[0]},34);
}

/* ---------- متابعة حالة تواجد ونشاط الموظفين المباشرة ---------- */
let presenceMap={},myLastActiveAt=Date.now(),myActivityState='working',lastPresenceTrackAt=0,presenceTimer=null,presenceListenersBound=false;
const TAB_LABELS_AR={
  home:'الشاشة الرئيسية',
  new:'طلب جديد',
  tx:'المعاملات',
  myday:'شغلي النهاردة والمتأخرات',
  comm:'الكوميشن والتارجت',
  exec:'المنفذين',
  cash:'الكاش',
  couriers:'المناديب',
  receipt:'الإيصالات',
  search:'البحث الشامل',
  chat:'الشات الداخلي',
  dash:'الداش بورد',
  tasks:'المهام',
  team:'فريق العمل',
  hr:'الموارد البشرية',
  notes:'ملاحظاتي',
  perf:'أداء الموظفين',
  partners:'المنفذون الخارجيون'
};
/* آخر ظهور: بيتسجل في الداتابيز من دخول السيستم وأحداث فعلية (ضغط/كتابة/تعديل) — مفيش تتبع لحركة الماوس */
const SESSION_START=Date.now();
let lastSeenSentAt=0,lastSeenOk=true,lastSeenPullAt=0;
async function touchLastSeen(force){
  if(!lastSeenOk||!sbClient||!currentUser)return;
  const now=Date.now();
  if(!force&&(now-lastSeenSentAt)<3*60*1000)return;
  lastSeenSentAt=now;
  try{
    const r=await sbClient.rpc('touch_last_seen');
    if(r.error){if(/PGRST202|42883|does not exist|schema cache/i.test((r.error.message||'')+' '+(r.error.code||'')))lastSeenOk=false;return;}
    if(myProfile)myProfile.last_seen_at=new Date().toISOString();
  }catch(e){}
}
async function pullLastSeen(){
  if(!lastSeenOk||!sbClient||!currentUser||(Date.now()-lastSeenPullAt)<3*60*1000)return;
  lastSeenPullAt=Date.now();
  try{
    const r=await sbClient.from('profiles').select('id,last_seen_at');
    if(r.error)return;
    (r.data||[]).forEach(x=>{const p=profiles.find(q=>q.id===x.id);if(p)p.last_seen_at=x.last_seen_at;});
    if(currentTab==='team')renderTeam();
  }catch(e){}
}
function agoAr(ms){
  const m=Math.max(1,Math.round(ms/60000));
  if(m<60)return 'منذ '+(m===1?'دقيقة':m===2?'دقيقتين':m<=10?m+' دقائق':m+' دقيقة');
  const h=Math.floor(m/60);
  if(h<24)return 'منذ '+(h===1?'ساعة':h===2?'ساعتين':h<=10?h+' ساعات':h+' ساعة');
  const d=Math.floor(h/24);
  return 'منذ '+(d===1?'يوم':d===2?'يومين':d<=10?d+' أيام':d+' يوم');
}
/* وقت مع اليوم بوضوح: اليوم / أمس / أو اسم اليوم + التاريخ (بتوقيت القاهرة) */
function timeAr(ts){
  const d=new Date(ts),tz={timeZone:'Africa/Cairo'};
  const key=x=>new Intl.DateTimeFormat('en-CA',tz).format(x);
  const tm=new Intl.DateTimeFormat('ar-EG',Object.assign({hour:'numeric',minute:'2-digit',hour12:true},tz)).format(d);
  const k=key(d),nowD=new Date();
  if(k===key(nowD))return 'اليوم '+tm;
  if(k===key(new Date(nowD.getTime()-864e5)))return 'أمس '+tm;
  return new Intl.DateTimeFormat('ar-EG',Object.assign({weekday:'long',day:'numeric',month:'long'},tz)).format(d)+' '+tm;
}
function syncMyPresence(force){
  if(!chatPresCh||!currentUser)return;
  const now=Date.now();
  if(!force&&(now-lastPresenceTrackAt)<45000)return;
  lastPresenceTrackAt=now;
  const idle=(now-myLastActiveAt)>5*60*1000||(document.hidden&&(now-myLastActiveAt)>2*60*1000);
  myActivityState=idle?'idle':'working';
  try{
    chatPresCh.track({
      at:now,
      lastActive:myLastActiveAt,
      since:SESSION_START,
      state:myActivityState,
      tab:currentTab||'home'
    });
  }catch(e){}
}
function onUserInteract(){
  const now=Date.now();
  const wasIdle=myActivityState==='idle'||(now-myLastActiveAt)>5*60*1000;
  myLastActiveAt=now;
  touchLastSeen(false);
  if(wasIdle){
    myActivityState='working';
    syncMyPresence(true);
    if(currentTab==='home')renderHomeTab();
    else if(currentTab==='team')renderTeam();
  }
}
function bindPresenceActivity(){
  if(presenceListenersBound)return;
  presenceListenersBound=true;
  touchLastSeen(true);
  ['pointerdown','keydown','input','change'].forEach(ev=>{
    document.addEventListener(ev,onUserInteract,{passive:true});
  });
  document.addEventListener('visibilitychange',function(){
    if(!document.hidden){
      touchLastSeen(false);
      myLastActiveAt=Date.now();
      myActivityState='working';
      syncMyPresence(true);
    }else{
      syncMyPresence(false);
    }
  });
  if(!presenceTimer){
    presenceTimer=setInterval(function(){
      if(!currentUser||!chatPresCh)return;
      const now=Date.now();
      const shouldIdle=(now-myLastActiveAt)>5*60*1000||(document.hidden&&(now-myLastActiveAt)>2*60*1000);
      const nextState=shouldIdle?'idle':'working';
      if(nextState!==myActivityState||(now-lastPresenceTrackAt)>4*60*1000){
        myActivityState=nextState;
        syncMyPresence(true);
      }
      if(currentTab==='home')renderHomeTab();
      else if(currentTab==='team'){pullLastSeen();renderTeam();}
    },60000);
  }
}
function getEmpLiveStatus(p){
  if(!p||!p.id)return{online:false,working:false,statusKey:'offline',label:'قافل السيستم',sub:'غير متصل حالياً',dotCls:'bg-slate-400',badgeCls:'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',todayTx:0,todayLines:0,lastWorkAt:0};
  const tk=new Date().toLocaleDateString('en-CA');
  const pNorm=normName(p.full_name||'');
  const todayTxSet=new Set();
  let todayLines=0,lastWorkAt=0;
  allRequestLines.forEach(l=>{
    if(!l.employee)return;
    const match=normName(l.employee)===pNorm;
    if(!match)return;
    const ts=new Date(lineDate(l)).getTime();
    if(Number.isFinite(ts)&&ts>lastWorkAt)lastWorkAt=ts;
    if(dayKey(lineDate(l))===tk){
      todayLines++;
      if(l.transaction_id)todayTxSet.add(l.transaction_id);
    }
  });
  const todayTx=todayTxSet.size;
  const presList=presenceMap&&presenceMap[p.id];
  const isMe=currentUser&&String(p.id)===String(currentUser.id);
  const isOnline=isMe||onlineIds.includes(p.id)||(Array.isArray(presList)&&presList.length>0);
  if(!isOnline){
    const seenTs=p.last_seen_at?new Date(p.last_seen_at).getTime():0;
    const seenStr=Number.isFinite(seenTs)&&seenTs>0?('آخر ظهور '+timeAr(seenTs)+' ('+agoAr(Date.now()-seenTs)+')'):'';
    const workStr=lastWorkAt?('آخر معاملة: '+timeAr(lastWorkAt)):'';
    const lastStr=[seenStr,workStr].filter(Boolean).join(' · ')||'غير متصل حالياً';
    return{
      online:false,
      working:false,
      statusKey:'offline',
      label:'قافل السيستم',
      sub:lastStr,
      dotCls:'bg-slate-400 dark:bg-slate-600',
      badgeCls:'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
      todayTx:todayTx,
      todayLines:todayLines,
      lastWorkAt:lastWorkAt
    };
  }
  let best=null;
  if(Array.isArray(presList)&&presList.length){
    best=presList.reduce((a,b)=>((b.lastActive||b.at||0)>(a.lastActive||a.at||0)?b:a),presList[0]);
  }
  const lastAct=isMe?myLastActiveAt:((best&&(best.lastActive||best.at))||Date.now());
  const stateVal=isMe?myActivityState:((best&&best.state)||'working');
  const tabKey=isMe?currentTab:((best&&best.tab)||'home');
  const idleMs=Math.max(0,Date.now()-lastAct);
  const recentOrder=(Date.now()-lastWorkAt)<5*60*1000;
  const isWorking=(stateVal!=='idle'&&idleMs<6*60*1000)||recentOrder;
  const tabName=TAB_LABELS_AR[tabKey]||'الشاشة الرئيسية';
  const sinceTs=isMe?SESSION_START:((best&&best.since)||0);
  if(isWorking){
    return{
      online:true,
      working:true,
      statusKey:'working',
      label:'فاتح وشغال الآن',
      sub:'نشط الآن في: '+tabName+(sinceTs?' · متصل '+agoAr(Date.now()-sinceTs):''),
      dotCls:'bg-emerald-500 ring-4 ring-emerald-500/20',
      badgeCls:'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
      todayTx:todayTx,
      todayLines:todayLines,
      lastWorkAt:lastWorkAt
    };
  }
  const mins=Math.max(1,Math.round(idleMs/60000));
  return{
    online:true,
    working:false,
    statusKey:'idle',
    label:'فاتح السيستم (غير نشط)',
    sub:'آخر نشاط '+agoAr(idleMs)+' · على: '+tabName,
    dotCls:'bg-amber-500 ring-4 ring-amber-500/20',
    badgeCls:'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
    todayTx:todayTx,
    todayLines:todayLines,
    lastWorkAt:lastWorkAt
  };
}
window.getEmpLiveStatus=getEmpLiveStatus;

function renderTeam(){
  const grid=$('team-grid');if(!grid)return;
  if(!profilesReady){
    $('team-count').textContent='—';
    grid.innerHTML='<div class="card p-8 text-center text-sm text-slate-500 sm:col-span-2 lg:col-span-3"><i class="fa-solid fa-database text-2xl text-brand-600 mb-3 block"></i>لازم تشغّل ملف <b class="font-mono">phase1-profiles.sql</b> مرة واحدة في Supabase علشان تظهر صفحة الفريق.</div>';
    return;
  }
  const q=($('team-q').value||'').trim().toLowerCase(),qd=q.replace(/\D/g,'');
  const list=profiles.filter(p=>!q||(p.full_name||'').toLowerCase().includes(q)||(p.job_title||'').toLowerCase().includes(q)||(qd&&(p.phone||'').replace(/\D/g,'').includes(qd)));
  const statuses=profiles.map(p=>getEmpLiveStatus(p));
  const wCnt=statuses.filter(s=>s.statusKey==='working').length;
  const iCnt=statuses.filter(s=>s.statusKey==='idle').length;
  const oCnt=statuses.filter(s=>s.statusKey==='offline').length;
  $('team-count').textContent=profiles.length+' موظف · شغال الآن: '+wCnt+' · فاتح غير نشط: '+iCnt+' · قافل: '+oCnt;
  if(!list.length){grid.innerHTML='<div class="card p-8 text-center text-xs text-slate-400 sm:col-span-2 lg:col-span-3">لا يوجد موظفين مطابقين</div>';return;}
  grid.innerHTML=list.map(function(p){
    const me=currentUser&&p.id===currentUser.id,ph=(p.phone||'').trim(),wa=waLink(ph),tel=ph.replace(/[^\d+]/g,'');
    const st=getEmpLiveStatus(p);
    return '<div class="card lift p-5 flex flex-col gap-4">'+
      '<div class="flex items-start justify-between gap-2">'+
        '<div class="flex items-center gap-3.5 min-w-0">'+
          '<span class="relative shrink-0">'+avatarHtml(p,56)+'<span class="absolute bottom-0 end-0 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-slate-900 '+st.dotCls+'"></span></span>'+
          '<div class="min-w-0">'+
            '<div class="font-bold text-ink dark:text-white truncate">'+escapeHtml(p.full_name||'بدون اسم')+(me?' <span class="rounded-full bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 px-2 py-0.5 text-[10px] font-semibold">أنت</span>':'')+'</div>'+
            '<div class="text-xs text-slate-500 truncate">'+escapeHtml(p.job_title||'مسؤول خدمات حكومية')+'</div>'+
            '<div class="mt-1.5 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold '+st.badgeCls+'"><span class="h-2 w-2 rounded-full '+st.dotCls+'"></span><span>'+escapeHtml(st.label)+'</span></div>'+
          '</div>'+
        '</div>'+
      '</div>'+
      '<div class="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-2.5 text-xs flex items-center justify-between gap-2">'+
        '<span class="text-slate-500 truncate">'+escapeHtml(st.sub)+'</span>'+
        '<span class="shrink-0 font-bold text-brand-600 dark:text-violet-300">اليوم: '+st.todayTx+' معاملة ('+st.todayLines+' بند)</span>'+
      '</div>'+
      '<div class="font-mono text-sm text-slate-600 dark:text-slate-300" dir="ltr">'+(ph?'<span class="rc-phone-pill"><i class="fa-solid fa-phone text-xs text-brand-600"></i><span>'+escapeHtml(ph)+'</span></span>':'<span class="text-xs text-slate-400 font-sans">لم يُضَف رقم هاتف بعد</span>')+'</div>'+
      '<div class="flex items-center gap-2 mt-auto">'+(!me&&chatReady?'<button type="button" data-u="'+escapeHtml(p.id)+'" onclick="startChatWith(this.dataset.u)" class="rounded-xl bg-ink dark:bg-brand-600 hover:opacity-90 px-3 py-2 text-xs font-bold text-white" title="مراسلة"><i class="fa-solid fa-comment-dots ms-1"></i> مراسلة</button>':'')+
      (ph?'<a href="'+wa+'" target="_blank" rel="noopener" class="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 py-2 text-center text-xs font-bold text-white"><i class="fa-brands fa-whatsapp ms-1"></i> واتساب</a>':'')+
      (me?'<button type="button" onclick="openMeModal()" class="flex-1 rounded-xl bg-brand-600 hover:bg-brand-700 py-2 text-xs font-bold text-white"><i class="fa-solid fa-user-pen ms-1"></i> تعديل</button>':'')+
      '</div></div>';
  }).join('');
}

/* ---------- نافذة حسابي ---------- */
function compressImage(file,max){
  return new Promise(function(res,rej){
    const img=new Image(),u=URL.createObjectURL(file);
    img.onload=function(){
      const s=Math.min(img.width,img.height),sx=(img.width-s)/2,sy=(img.height-s)/2;
      const c=document.createElement('canvas');c.width=c.height=max;
      const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,max,max);x.drawImage(img,sx,sy,s,s,0,0,max,max);
      URL.revokeObjectURL(u);
      c.toBlob(b=>b?res(b):rej(new Error('تعذّر معالجة الصورة')),'image/jpeg',0.85);
    };
    img.onerror=function(){URL.revokeObjectURL(u);rej(new Error('الصورة دي مش مدعومة، جرّب صورة JPG أو PNG'));};
    img.src=u;
  });
}
function drawMePreview(){
  const box=$('me-avatar-preview');if(!box)return;
  const p=myProfile||{id:currentUser&&currentUser.id},nm=$('me-name').value||p.full_name||'';
  if(pendingAvatarBlob&&pendingAvatarUrl)box.innerHTML='<img src="'+pendingAvatarUrl+'" alt="" class="rounded-full object-cover" style="width:84px;height:84px">';
  else box.innerHTML=avatarHtml({id:p.id,full_name:nm,avatar_path:avatarRemoved?null:p.avatar_path},84);
  $('me-avatar-remove').classList.toggle('hidden',!(pendingAvatarBlob||(!avatarRemoved&&p.avatar_path)));
}
function openMeModal(){
  if(!profilesReady){showToast('شغّل ملف phase1-profiles.sql في Supabase الأول علشان يشتغل البروفايل','error',9000);return;}
  const p=myProfile||{};
  pendingAvatarBlob=null;if(pendingAvatarUrl){URL.revokeObjectURL(pendingAvatarUrl);pendingAvatarUrl=null;}avatarRemoved=false;
  $('me-name').value=p.full_name||((currentUser&&currentUser.email)||'').split('@')[0];
  $('me-job').value=p.job_title||'';$('me-phone').value=p.phone||'';$('me-avatar-file').value='';
  $('me-error').classList.add('hidden');drawMePreview();
  $('me-modal').classList.remove('hidden');$('me-modal').classList.add('flex');
}
function closeMeModal(){const m=$('me-modal');if(!m)return;m.classList.add('hidden');m.classList.remove('flex');}
async function onAvatarPicked(inp){
  const f=inp.files&&inp.files[0];if(!f)return;
  const box=$('me-error');box.classList.add('hidden');
  try{
    pendingAvatarBlob=await compressImage(f,320);
    if(pendingAvatarUrl)URL.revokeObjectURL(pendingAvatarUrl);
    pendingAvatarUrl=URL.createObjectURL(pendingAvatarBlob);avatarRemoved=false;drawMePreview();
  }catch(err){box.textContent=err.message||'تعذّر قراءة الصورة';box.classList.remove('hidden');}
  inp.value='';
}
function removeAvatarPick(){
  pendingAvatarBlob=null;if(pendingAvatarUrl){URL.revokeObjectURL(pendingAvatarUrl);pendingAvatarUrl=null;}
  avatarRemoved=!!(myProfile&&myProfile.avatar_path);drawMePreview();
}
async function handleSaveProfile(e){
  e.preventDefault();if(!sbClient||!currentUser)return;
  const box=$('me-error'),btn=$('me-save-btn');box.classList.add('hidden');
  const showErr=m=>{box.textContent=m;box.classList.remove('hidden');};
  const name=$('me-name').value.trim(),job=$('me-job').value.trim(),phone=$('me-phone').value.trim();
  if(!name)return showErr('اكتب اسمك.');
  if(phone&&phone.replace(/\D/g,'').length<8)return showErr('رقم التليفون غير صحيح.');
  btn.disabled=true;btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> جارٍ الحفظ...';
  const oldPath=(myProfile&&myProfile.avatar_path)||null;let newPath=oldPath;
  try{
    if(pendingAvatarBlob){
      newPath=currentUser.id+'/avatar-'+Date.now()+'.jpg';
      const up=await sbClient.storage.from('avatars').upload(newPath,pendingAvatarBlob,{contentType:'image/jpeg',upsert:false});
      if(up.error)throw up.error;
    }else if(avatarRemoved)newPath=null;
    const r=await sbClient.from('profiles').upsert({id:currentUser.id,full_name:name,job_title:job||null,phone:phone||null,avatar_path:newPath},{onConflict:'id'});
    if(r.error)throw r.error;
    if(oldPath&&oldPath!==newPath)Promise.resolve(sbClient.storage.from('avatars').remove([oldPath])).catch(()=>{});
    closeMeModal();showToast('تم حفظ بياناتك');await loadProfiles();
  }catch(err){showErr('فشل الحفظ: '+((err&&(err.message||err.details))||err));}
  finally{btn.disabled=false;btn.innerHTML='حفظ';}
}

/* ---------- الشات الداخلي ---------- */
const BASE_TITLE='تساهيل | قسم الخدمات الحكومية';
function profileById(id){return profiles.find(p=>p.id===id)||null;}
function nameOfUser(id){const p=profileById(id);return (p&&p.full_name)||'زميل';}
function chatItem(cid){return chatItems.find(i=>i.ch_id===cid)||null;}
function chatName(it){return it.ch_kind==='dm'?nameOfUser(it.other_user):(it.ch_name||'الكل');}
function chatAvatar(it,size){
  if(it.ch_kind==='dm')return avatarHtml(profileById(it.other_user)||{id:it.other_user,full_name:'؟'},size);
  return '<span class="rounded-full shrink-0 inline-flex items-center justify-center text-white bg-ink dark:bg-brand-600" style="width:'+size+'px;height:'+size+'px;font-size:'+Math.round(size*.42)+'px"><i class="fa-solid fa-users"></i></span>';
}
function chatTimeShort(s){
  if(!s)return '';const d=new Date(s);if(isNaN(d))return '';
  return dayKey(s)===dayKey(new Date())?new Intl.DateTimeFormat('ar-EG',{hour:'2-digit',minute:'2-digit'}).format(d):new Intl.DateTimeFormat('ar-EG',{day:'numeric',month:'short'}).format(d);
}
function chatVisible(){return currentTab==='chat'&&!document.hidden;}
function isTouchDevice(){return !!(window.matchMedia&&window.matchMedia('(pointer:coarse)').matches);}
function chatFormat(body){
  return escapeHtml(body).replace(/\n/g,'<br>').replace(/(https?:\/\/[^\s<]+)/g,function(u){return '<a href="'+u+'" target="_blank" rel="noopener noreferrer" class="underline break-all">'+u+'</a>';});
}

function teardownChat(){
  try{if(chatMsgCh&&sbClient)sbClient.removeChannel(chatMsgCh);}catch(e){}
  try{if(chatPresCh&&sbClient)sbClient.removeChannel(chatPresCh);}catch(e){}
  chatMsgCh=null;chatPresCh=null;chatReady=false;chatItems=[];chatActive=null;chatMsgs={};chatHasMore={};chatReplyTo=null;onlineIds=[];presenceMap={};
  updateChatBadges();
}
async function initChat(){
  teardownChat();
  if(!sbClient||!currentUser)return;
  bindPresenceActivity();
  if(!chatBound){
    chatBound=true;
    document.addEventListener('visibilitychange',function(){if(chatVisible()&&chatActive)markChatRead(chatActive);});
  }
  const ok=await loadChatOverview();
  if(!ok){renderChatList();return;}
  chatReady=true;
  chatMsgCh=sbClient.channel('chat-messages')
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'messages'},function(p){onChatInsert(p.new);})
    .on('postgres_changes',{event:'DELETE',schema:'public',table:'messages'},function(p){onChatDelete(p.old);})
    .subscribe();
  const pc=sbClient.channel('chat-presence',{config:{presence:{key:currentUser.id}}});
  pc.on('presence',{event:'sync'},function(){
    presenceMap=pc.presenceState()||{};
    onlineIds=Object.keys(presenceMap);
    renderChatList();renderChatHead();
    if(currentTab==='home')renderHomeTab();
    if(currentTab==='team')renderTeam();
  });
  pc.subscribe(function(st){
    if(st==='SUBSCRIBED'){
      lastPresenceTrackAt=0;
      syncMyPresence(true);
    }
  });
  chatPresCh=pc;
  renderChatList();
  if(currentTab==='team')renderTeam();
  if(currentTab==='home')renderHomeTab();
}
async function loadChatOverview(){
  const r=await sbClient.rpc('chat_overview');
  if(r.error){
    const missing=/PGRST202|42883|Could not find the function|does not exist/i.test((r.error.message||'')+' '+(r.error.code||''));
    chatSetupNeeded=missing;if(!missing)console.warn('chat',r.error);
    return false;
  }
  chatSetupNeeded=false;
  chatItems=(r.data||[]).map(x=>Object.assign({},x,{unread:Number(x.unread)||0}));
  updateChatBadges();return true;
}

function updateChatBadges(){
  const n=chatItems.reduce((s,i)=>s+(i.unread||0),0),b=$('chat-badge');
  if(b){b.textContent=n>99?'99+':String(n);b.classList.toggle('hidden',!n);}
  const hmChat=$('hm-chat-badge');
  if(hmChat){hmChat.textContent=n>99?'99+':String(n);hmChat.classList.toggle('hidden',!n);}
  document.title=(n?'('+n+') ':'')+BASE_TITLE;
}
function chatBeep(){
  if(localStorage.getItem('chat_mute')==='1')return;
  try{
    const C=window.AudioContext||window.webkitAudioContext;if(!C)return;
    chatAudio=chatAudio||new C();if(chatAudio.state==='suspended')chatAudio.resume();
    const o=chatAudio.createOscillator(),g=chatAudio.createGain(),t=chatAudio.currentTime;
    o.type='sine';o.frequency.value=880;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.12,t+.02);g.gain.exponentialRampToValueAtTime(.0001,t+.25);
    o.connect(g);g.connect(chatAudio.destination);o.start(t);o.stop(t+.26);
  }catch(e){}
}
function toggleChatMute(){
  const m=localStorage.getItem('chat_mute')==='1';localStorage.setItem('chat_mute',m?'0':'1');paintMuteBtn();
  showToast(m?'تم تشغيل صوت الإشعارات':'تم كتم صوت الإشعارات','info',2000);
}
function paintMuteBtn(){const b=$('chat-mute-btn');if(b)b.innerHTML='<i class="fa-solid '+(localStorage.getItem('chat_mute')==='1'?'fa-volume-xmark text-slate-400':'fa-volume-high')+'"></i>';}

function chatSortedItems(){
  return chatItems.slice().sort(function(a,b){
    if(a.ch_kind==='general'&&b.ch_kind!=='general')return -1;
    if(b.ch_kind==='general'&&a.ch_kind!=='general')return 1;
    return String(b.last_at||'').localeCompare(String(a.last_at||''));
  });
}
function renderChatList(){
  const box=$('chat-list');if(!box)return;
  if(!chatReady){
    box.innerHTML=chatSetupNeeded
      ?'<div class="p-6 text-center text-sm text-slate-500"><i class="fa-solid fa-database text-2xl text-brand-600 mb-3 block"></i>لازم تشغّل ملف <b class="font-mono">phase2-chat.sql</b> مرة واحدة في Supabase علشان الشات يشتغل.</div>'
      :'<div class="p-6 text-center text-xs text-slate-400">جارٍ تحميل المحادثات...</div>';
    return;
  }
  const q=($('chat-q').value||'').trim().toLowerCase();
  const rows=chatSortedItems().filter(it=>!q||chatName(it).toLowerCase().includes(q)||(it.last_body||'').toLowerCase().includes(q));
  const haveDm=new Set(chatItems.filter(i=>i.ch_kind==='dm').map(i=>i.other_user));
  const others=profiles.filter(p=>p.id!==currentUser.id&&!haveDm.has(p.id)&&(!q||(p.full_name||'').toLowerCase().includes(q)));
  let h=rows.map(function(it){
    const on=it.ch_id===chatActive,online=it.ch_kind==='dm'&&onlineIds.includes(it.other_user);
    const mine=it.last_sender===currentUser.id;
    return '<button type="button" data-cid="'+escapeHtml(it.ch_id)+'" onclick="openChat(this.dataset.cid)" class="w-full flex items-center gap-3 px-3.5 py-3 text-start border-b border-slate-50 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/50 '+(on?'bg-brand-50/70 dark:bg-brand-950/30':'')+'">'+
    '<span class="relative shrink-0">'+chatAvatar(it,42)+(online?'<span class="absolute bottom-0 end-0 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900"></span>':'')+'</span>'+
    '<span class="min-w-0 flex-1"><span class="flex items-center justify-between gap-2"><span class="truncate font-bold text-sm text-ink dark:text-white">'+escapeHtml(chatName(it))+'</span><span class="shrink-0 text-[10px] text-slate-400">'+chatTimeShort(it.last_at)+'</span></span>'+
    '<span class="flex items-center justify-between gap-2 mt-0.5"><span class="truncate text-xs text-slate-500">'+(it.last_body?(mine?'أنت: ':(it.ch_kind==='general'?escapeHtml(nameOfUser(it.last_sender))+': ':''))+escapeHtml(it.last_body.replace(/\s+/g,' ')):'<span class="text-slate-400">لا توجد رسائل بعد</span>')+'</span>'+
    (it.unread?'<span class="shrink-0 rounded-full bg-rose-600 text-white text-[10px] font-bold px-1.5 min-w-[18px] text-center leading-[18px]">'+(it.unread>99?'99+':it.unread)+'</span>':'')+'</span></span></button>';
  }).join('');
  if(others.length){
    h+='<div class="px-3.5 pt-4 pb-1.5 text-[11px] font-semibold text-slate-400">ابدأ محادثة جديدة</div>'+others.map(function(p){
      const online=onlineIds.includes(p.id);
      return '<button type="button" data-u="'+escapeHtml(p.id)+'" onclick="startChatWith(this.dataset.u)" class="w-full flex items-center gap-3 px-3.5 py-2.5 text-start hover:bg-slate-50 dark:hover:bg-slate-800/50">'+
      '<span class="relative shrink-0">'+avatarHtml(p,34)+(online?'<span class="absolute bottom-0 end-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900"></span>':'')+'</span>'+
      '<span class="min-w-0 flex-1"><span class="block truncate text-sm font-semibold text-ink dark:text-white">'+escapeHtml(p.full_name||'بدون اسم')+'</span><span class="block truncate text-[11px] text-slate-400">'+escapeHtml(p.job_title||'')+'</span></span></button>';
    }).join('');
  }
  box.innerHTML=h||'<div class="p-6 text-center text-xs text-slate-400">لا توجد نتائج</div>';
}

function openChatTab(){
  paintMuteBtn();
  if(!chatReady){initChat();return;}
  renderChatList();
  if(chatActive){markChatRead(chatActive);scrollChatBottom();}
  else if(window.matchMedia&&window.matchMedia('(min-width:768px)').matches){const g=chatItems.find(i=>i.ch_kind==='general');if(g)openChat(g.ch_id);}
}
function chatShowThread(open){
  $('chat-side').classList.toggle('max-md:hidden',open);
  $('chat-main').classList.toggle('max-md:hidden',!open);
  $('chat-empty').classList.toggle('hidden',open);
  $('chat-pane').classList.toggle('hidden',!open);$('chat-pane').classList.toggle('flex',open);
}
function chatBack(){chatActive=null;chatReplyTo=null;chatShowThread(false);$('chat-empty').classList.add('hidden');renderChatList();}
async function openChat(cid){
  const it=chatItem(cid);if(!it)return;
  chatActive=cid;chatReplyTo=null;cancelChatReply();chatShowThread(true);renderChatHead();renderChatList();
  $('chat-input').value='';chatAutoGrow($('chat-input'));
  if(!chatMsgs[cid]){
    $('chat-msgs').innerHTML='<div class="py-10 text-center text-xs text-slate-400"><i class="fa-solid fa-spinner fa-spin ms-1"></i> جارٍ التحميل...</div>';
    await loadChatMessages(cid,null);
    if(chatActive!==cid)return;
  }
  renderChatThread(true);
  if(chatVisible())markChatRead(cid);
  if(!isTouchDevice())$('chat-input').focus();
}
async function startChatWith(uid){
  if(!sbClient||!chatReady){showToast('الشات مش مفعّل لسه — شغّل ملف phase2-chat.sql','error',8000);return;}
  const r=await sbClient.rpc('get_or_create_dm',{other_id:uid});
  if(r.error){showError('تعذّر فتح المحادثة',r.error);return;}
  await loadChatOverview();
  if(currentTab!=='chat')switchTab('chat');
  openChat(r.data);
}
function renderChatHead(){
  const it=chatItem(chatActive);if(!it||!$('chat-head-name'))return;
  $('chat-head-avatar').innerHTML=chatAvatar(it,38);$('chat-head-name').textContent=chatName(it);
  if(it.ch_kind==='dm'){
    const p=profileById(it.other_user);
    const st=p?getEmpLiveStatus(p):null;
    $('chat-head-sub').textContent=st?st.label+' · '+st.sub:((p&&p.job_title)||'غير متصل');
  }
  else $('chat-head-sub').textContent=onlineIds.length?onlineIds.length+' متصل الآن':'قناة الشركة العامة';
  paintMuteBtn();
}

async function loadChatMessages(cid,before){
  let q=sbClient.from('messages').select('id,channel_id,sender_id,body,reply_to,created_at').eq('channel_id',cid).order('created_at',{ascending:false}).limit(40);
  if(before)q=q.lt('created_at',before);
  const r=await q;
  if(r.error){showError('تعذّر تحميل الرسائل',r.error);if(!chatMsgs[cid])chatMsgs[cid]=[];return;}
  const rows=(r.data||[]).slice().reverse();
  chatHasMore[cid]=(r.data||[]).length>=40;
  const cur=chatMsgs[cid]||[],ids=new Set(cur.map(m=>m.id));
  chatMsgs[cid]=rows.filter(m=>!ids.has(m.id)).concat(cur);
}
async function loadOlderChat(){
  const cid=chatActive;if(!cid||!chatMsgs[cid]||!chatMsgs[cid].length)return;
  const box=$('chat-msgs'),h=box.scrollHeight;
  await loadChatMessages(cid,chatMsgs[cid][0].created_at);
  if(chatActive!==cid)return;
  renderChatThread(false);box.scrollTop=box.scrollHeight-h;
}
function dayLabel(s){
  const k=dayKey(s),t=dayKey(new Date()),y=dayKey(new Date(Date.now()-86400000));
  return k===t?'اليوم':k===y?'أمس':formatDateOnly(s);
}
function renderChatThread(toBottom){
  const box=$('chat-msgs'),cid=chatActive;if(!box||!cid)return;
  const list=chatMsgs[cid]||[],it=chatItem(cid),group=it&&it.ch_kind==='general';
  const byId=new Map(list.map(m=>[m.id,m]));
  const wasNear=box.scrollHeight-box.scrollTop-box.clientHeight<140;
  let h=chatHasMore[cid]?'<div class="text-center mb-3"><button type="button" onclick="loadOlderChat()" class="rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-4 py-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">تحميل رسائل أقدم</button></div>':'';
  if(!list.length)h+='<div class="py-12 text-center text-xs text-slate-400">لا توجد رسائل بعد. ابدأ المحادثة 👋</div>';
  let lastDay='',lastSender='';
  list.forEach(function(m){
    const dk=dayKey(m.created_at),mine=m.sender_id===currentUser.id;
    if(dk!==lastDay){h+='<div class="my-3 text-center"><span class="rounded-full bg-slate-200/70 dark:bg-slate-800 px-3 py-1 text-[10px] font-semibold text-slate-500">'+escapeHtml(dayLabel(m.created_at))+'</span></div>';lastDay=dk;lastSender='';}
    const first=lastSender!==m.sender_id;lastSender=m.sender_id;
    let quote='';
    if(m.reply_to){
      const q=byId.get(m.reply_to);
      quote='<div class="mb-1 rounded-lg border-s-4 '+(mine?'border-white/60 bg-white/15':'border-brand-500 bg-slate-100 dark:bg-slate-700/60')+' px-2 py-1 text-[11px]"><div class="font-bold">'+escapeHtml(q?(q.sender_id===currentUser.id?'أنت':nameOfUser(q.sender_id)):'رسالة سابقة')+'</div>'+(q?'<div class="truncate opacity-80">'+escapeHtml(q.body.replace(/\s+/g,' ').slice(0,90))+'</div>':'')+'</div>';
    }
    const who=(!mine&&group&&first)?'<div class="mb-0.5 text-[11px] font-bold" style="color:'+avColor(m.sender_id)+'">'+escapeHtml(nameOfUser(m.sender_id))+'</div>':'';
    const acts='<div class="flex items-center gap-1 self-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-60 transition">'+
      '<button type="button" data-m="'+escapeHtml(m.id)+'" onclick="startChatReply(this.dataset.m)" class="h-6 w-6 rounded-full text-slate-400 hover:text-brand-600 hover:bg-slate-200/60 dark:hover:bg-slate-700" title="رد"><i class="fa-solid fa-reply text-[11px]"></i></button>'+
      (mine?'<button type="button" data-m="'+escapeHtml(m.id)+'" onclick="deleteChatMessage(this.dataset.m)" class="h-6 w-6 rounded-full text-slate-400 hover:text-rose-600 hover:bg-slate-200/60 dark:hover:bg-slate-700" title="حذف"><i class="fa-solid fa-trash-can text-[11px]"></i></button>':'')+'</div>';
    const bubble='<div class="max-w-[78%] sm:max-w-[65%] rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm '+(mine?'bg-brand-600 text-white rounded-te-md':'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-700 rounded-ts-md')+'">'+who+quote+'<div class="break-words">'+chatFormat(m.body)+'</div><div class="mt-1 text-[10px] '+(mine?'text-white/70':'text-slate-400')+' text-end" dir="ltr">'+new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit'}).format(new Date(m.created_at))+'</div></div>';
    h+='<div class="group flex gap-1.5 '+(first?'mt-2.5':'mt-0.5')+' '+(mine?'justify-end':'justify-start')+'" data-mid="'+escapeHtml(m.id)+'">'+(mine?acts+bubble:bubble+acts)+'</div>';
  });
  box.innerHTML=h;
  if(toBottom||wasNear)box.scrollTop=box.scrollHeight;
}
function scrollChatBottom(){const b=$('chat-msgs');if(b)b.scrollTop=b.scrollHeight;}
function addChatMessage(m){
  const arr=chatMsgs[m.channel_id];if(!arr)return false;
  if(arr.some(x=>x.id===m.id))return false;
  arr.push(m);arr.sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)));return true;
}
function touchChatItem(m){
  const it=chatItem(m.channel_id);if(!it)return;
  if(!it.last_at||String(m.created_at)>=String(it.last_at)){it.last_body=m.body;it.last_at=m.created_at;it.last_sender=m.sender_id;}
}

function chatAutoGrow(el){el.style.height='auto';el.style.height=Math.min(el.scrollHeight,128)+'px';}
function chatKey(e){if(e.key==='Enter'&&!e.shiftKey&&!isTouchDevice()&&!e.isComposing){e.preventDefault();sendChatMessage();}}
function startChatReply(mid){
  const m=(chatMsgs[chatActive]||[]).find(x=>x.id===mid);if(!m)return;
  chatReplyTo=mid;
  $('chat-reply-text').textContent=(m.sender_id===currentUser.id?'أنت':nameOfUser(m.sender_id))+': '+m.body.replace(/\s+/g,' ').slice(0,100);
  $('chat-reply-bar').classList.remove('hidden');$('chat-reply-bar').classList.add('flex');$('chat-input').focus();
}
function cancelChatReply(){chatReplyTo=null;const b=$('chat-reply-bar');if(b){b.classList.add('hidden');b.classList.remove('flex');}}
async function sendChatMessage(e){
  if(e&&e.preventDefault)e.preventDefault();
  const inp=$('chat-input'),body=(inp.value||'').trim(),cid=chatActive;
  if(!body||!cid||chatSending||!sbClient)return;
  chatSending=true;$('chat-send').disabled=true;
  const row={channel_id:cid,sender_id:currentUser.id,body:body};if(chatReplyTo)row.reply_to=chatReplyTo;
  try{
    const r=await sbClient.from('messages').insert(row).select('id,channel_id,sender_id,body,reply_to,created_at').single();
    if(r.error)throw r.error;
    inp.value='';chatAutoGrow(inp);cancelChatReply();
    addChatMessage(r.data);touchChatItem(r.data);
    if(chatActive===cid)renderChatThread(true);
    renderChatList();
  }catch(err){showError('تعذّر إرسال الرسالة',err);}
  finally{chatSending=false;$('chat-send').disabled=false;if(!isTouchDevice())inp.focus();}
}
async function deleteChatMessage(mid){
  if(!confirm('حذف الرسالة دي؟'))return;
  const r=await sbClient.from('messages').delete().eq('id',mid);
  if(r.error){showError('تعذّر حذف الرسالة',r.error);return;}
  onChatDelete({id:mid});
}

function onChatDelete(old){
  if(!old||!old.id)return;
  Object.keys(chatMsgs).forEach(function(cid){
    const i=chatMsgs[cid].findIndex(m=>m.id===old.id);
    if(i>=0){chatMsgs[cid].splice(i,1);if(cid===chatActive)renderChatThread(false);}
  });
}
async function onChatInsert(m){
  if(!m||!m.channel_id||!currentUser)return;
  const cached=chatMsgs[m.channel_id];
  if(cached&&cached.some(x=>x.id===m.id))return;
  const mine=m.sender_id===currentUser.id;
  let it=chatItem(m.channel_id),fresh=false;
  if(!it){await loadChatOverview();it=chatItem(m.channel_id);fresh=true;if(!it)return;}
  addChatMessage(m);touchChatItem(m);
  const active=chatActive===m.channel_id;
  if(active)renderChatThread(mine);
  if(!mine){
    if(active&&chatVisible())markChatRead(m.channel_id);
    else{
      if(!fresh)it.unread=(it.unread||0)+1;
      chatBeep();
      showToast('رسالة جديدة من '+nameOfUser(m.sender_id),'info',2500);
    }
  }
  updateChatBadges();renderChatList();
}
async function markChatRead(cid){
  const it=chatItem(cid);if(it&&it.unread){it.unread=0;updateChatBadges();renderChatList();}
  try{await sbClient.rpc('mark_channel_read',{cid:cid});}catch(e){console.warn('mark read',e);}
}

/* ---------- الشاشة الرئيسية (Home Hub) ---------- */
function selectHomeFloatingTx(tx){
  window.__homeFloatingTxId=String(tx||'');
  renderHomeTab();
}
window.selectHomeFloatingTx=selectHomeFloatingTx;

function computeHomeOperationalMetrics(){
  const curYm=new Date().toLocaleDateString('en-CA').slice(0,7);
  const tgtMap=window.__homeTargetsMap||{};
  const monthLines=allRequestLines.filter(l=>dayKey(lineDate(l)).slice(0,7)===curYm);
  const monthSales=monthLines.reduce((s,l)=>s+(Number(l.total)||0),0);
  const monthTxSet=new Set(monthLines.map(l=>l.transaction_id).filter(Boolean));
  const monthUnits=monthLines.reduce((s,l)=>s+(Math.max(1,Number(l.qty)||1)),0);

  // بناء إحصائيات الأداء الفعلية لكل موظف في الشهر الحالي
  const staffProfiles=profiles.filter(p=>p&&p.id&&p.role!=='partner');
  const byEmp=new Map();
  staffProfiles.forEach(p=>{
    const tObj=tgtMap[String(p.id)]||{target:0,services_target:0};
    byEmp.set(String(p.id),{
      p:p,
      name:p.full_name||'موظف',
      sales:0,
      units:0,
      txSet:new Set(),
      openCnt:0,
      lateCnt:0,
      target:Number(tObj.target)||0,
      svcTarget:Number(tObj.services_target)||0
    });
  });

  monthLines.forEach(l=>{
    if(!l.employee)return;
    const p=typeof profileByName==='function'?profileByName(l.employee):null;
    const key=p?String(p.id):('raw:'+normName(l.employee));
    if(!byEmp.has(key)){
      byEmp.set(key,{p:p,name:l.employee.trim(),sales:0,units:0,txSet:new Set(),openCnt:0,lateCnt:0,target:0,svcTarget:0});
    }
    const rec=byEmp.get(key);
    rec.sales+=Number(l.total)||0;
    rec.units+=Math.max(1,Number(l.qty)||1);
    if(l.transaction_id)rec.txSet.add(l.transaction_id);
  });

  allRequestLines.forEach(l=>{
    if(!l.employee)return;
    const st=l.status||'In Progress';
    if(st==='Delivered')return;
    const p=typeof profileByName==='function'?profileByName(l.employee):null;
    const key=p?String(p.id):('raw:'+normName(l.employee));
    if(!byEmp.has(key))return;
    const rec=byEmp.get(key);
    rec.openCnt++;
    if(isLineLate(l))rec.lateCnt++;
  });

  const empList=[...byEmp.values()].filter(x=>x.sales>0||x.target>0||x.openCnt>0);
  const sumConfiguredTargets=empList.reduce((s,x)=>s+(x.target||0),0);
  const targetGoal=sumConfiguredTargets>0?sumConfiguredTargets:Math.max(120000,Math.ceil((monthSales||85000)/50000)*50000);
  const goalPct=targetGoal>0?Math.min(100,Math.round((monthSales/targetGoal)*100)):0;

  // حساب نسبة تحقيق المستهدف لكل موظف (أو حصته من متوسط المستهدف إن لم يُحدد له هدف فردي بعد)
  const perEmpDefaultTarget=empList.length?Math.round(targetGoal/empList.length):targetGoal;
  empList.forEach(x=>{
    const effTgt=x.target>0?x.target:perEmpDefaultTarget;
    x.effectiveTarget=effTgt;
    x.pct=effTgt>0?Math.round((x.sales/effTgt)*100):0;
    x.txCount=x.txSet.size;
  });

  // ترتيب الموظفين لتحديد الأعلى تحقيقاً للمستهدف والأكثر احتياجاً للدعم
  const rankedByAch=empList.slice().sort((a,b)=>(b.pct-a.pct)||(b.sales-a.sales)||(b.txCount-a.txCount));
  const topEmp=rankedByAch[0]||null;

  // الموظف الأكثر احتياجاً للدعم: من لديه أقل نسبة تحقيق للمستهدف أو أعلى معاملات متأخرة/مفتوحة (بشرط ألا يكون هو نفسه الأعلى إن وُجد أكثر من موظف)
  let supportEmp=null;
  if(rankedByAch.length>1){
    const candidates=rankedByAch.slice(1).sort((a,b)=>(a.pct-b.pct)||(b.lateCnt-a.lateCnt)||(a.sales-b.sales));
    supportEmp=candidates[0];
  }else if(rankedByAch.length===1){
    supportEmp=rankedByAch[0];
  }

  return {
    curYm:curYm,
    monthSales:monthSales,
    monthTxCount:monthTxSet.size,
    monthUnits:monthUnits,
    targetGoal:targetGoal,
    goalPct:goalPct,
    hasConfiguredTargets:sumConfiguredTargets>0,
    topEmp:topEmp,
    supportEmp:supportEmp
  };
}

function renderFloatingCardsStage(eh,todayOrders,lateCnt){
  const M=computeHomeOperationalMetrics();
  const rRing=36,cRing=Math.round(2*Math.PI*rRing),oRing=Math.round(cRing*(1-M.goalPct/100));
  const readyOrders=groupedOrders.filter(o=>getOrderStatus(o)==='Complete');

  const topHtml=M.topEmp
    ?'<div class="flex items-start justify-between gap-3">'+
        '<div class="flex items-center gap-3 min-w-0">'+
          '<span class="shrink-0">'+(M.topEmp.p?avatarHtml(M.topEmp.p,44):'<span class="fl-av">★</span>')+'</span>'+
          '<div class="min-w-0">'+
            '<div class="font-bold text-sm text-slate-900 dark:text-white truncate">'+eh(M.topEmp.name)+'</div>'+
            '<div class="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">حقق '+M.topEmp.pct+'% من المستهدف</div>'+
          '</div>'+
        '</div>'+
        '<span class="rounded-full bg-emerald-100 dark:bg-emerald-500/20 border border-emerald-300 dark:border-emerald-400/30 px-2.5 py-0.5 text-[11px] font-bold font-mono text-emerald-800 dark:text-emerald-300 shrink-0">'+M.topEmp.pct+'%</span>'+
      '</div>'+
      '<div class="space-y-1.5 pt-2">'+
        '<div class="h-2 w-full rounded-full bg-slate-200/80 dark:bg-white/10 overflow-hidden"><div class="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300" style="width:'+Math.min(100,M.topEmp.pct)+'%"></div></div>'+
        '<div class="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-300">'+
          '<span>إيراد الشهر: <b class="font-mono text-slate-800 dark:text-white">'+eh(formatCurrency(M.topEmp.sales))+'</b></span>'+
          '<span>'+M.topEmp.txCount+' معاملة · '+M.topEmp.units+' خدمة</span>'+
        '</div>'+
      '</div>'
    :'<div class="py-5 text-center text-xs text-slate-400">تظهر المؤشرات تلقائياً مع تسجيل معاملات الشهر</div>';

  const supHtml=M.supportEmp
    ?'<div class="flex items-start justify-between gap-3">'+
        '<div class="flex items-center gap-3 min-w-0">'+
          '<span class="shrink-0">'+(M.supportEmp.p?avatarHtml(M.supportEmp.p,44):'<span class="fl-av">•</span>')+'</span>'+
          '<div class="min-w-0">'+
            '<div class="font-bold text-sm text-slate-900 dark:text-white truncate">'+eh(M.supportEmp.name)+'</div>'+
            '<div class="text-[11px] text-amber-600 dark:text-amber-300 font-semibold mt-0.5">'+(M.supportEmp.lateCnt>0?('لديه '+M.supportEmp.lateCnt+' بنود متأخرة تحتاج مساندة'):('نسبة الإنجاز الحالية '+M.supportEmp.pct+'% من المستهدف'))+'</div>'+
          '</div>'+
        '</div>'+
        '<span class="rounded-full bg-amber-100 dark:bg-amber-500/20 border border-amber-300 dark:border-amber-400/30 px-2.5 py-0.5 text-[10.5px] font-bold text-amber-800 dark:text-amber-200 shrink-0">أولوية دعم</span>'+
      '</div>'+
      '<div class="space-y-1.5 pt-2">'+
        '<div class="h-2 w-full rounded-full bg-slate-200/80 dark:bg-white/10 overflow-hidden"><div class="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-400 transition-all duration-300" style="width:'+Math.max(8,Math.min(100,M.supportEmp.pct))+'%"></div></div>'+
        '<div class="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-300">'+
          '<span>المحقق: <b class="font-mono text-slate-800 dark:text-white">'+eh(formatCurrency(M.supportEmp.sales))+'</b></span>'+
          '<span>مفتوح قيد المتابعة: <b class="font-mono text-slate-800 dark:text-white">'+M.supportEmp.openCnt+' بند</b></span>'+
        '</div>'+
      '</div>'
    :'<div class="py-5 text-center text-xs text-slate-400">لا توجد حالات تحتاج دعماً إضافياً حالياً</div>';

  return '<div class="fl-stage-wrap">'+
    '<div class="fl-deck-grid">'+

      /* البطاقة 1: هدف الشهر الفعلي ومؤشر الإنجاز العام */
      '<div onclick="switchTab(\'comm\')" class="fl-card cursor-pointer flex flex-col justify-between gap-3">'+
        '<div class="flex items-start justify-between gap-3">'+
          '<div>'+
            '<span class="inline-flex items-center gap-1.5 rounded-full bg-violet-100 dark:bg-violet-500/20 border border-violet-300 dark:border-violet-400/30 px-2.5 py-0.5 text-[10.5px] font-bold text-violet-700 dark:text-violet-200"><i class="fa-solid fa-bullseye"></i><span>هدف الشهر</span></span>'+
            '<div class="mt-2 text-xl sm:text-2xl font-extrabold font-mono text-slate-900 dark:text-white">'+eh(formatCurrency(M.monthSales))+'</div>'+
            '<div class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">من مستهدف <b class="font-mono text-slate-700 dark:text-slate-200">'+eh(formatCurrency(M.targetGoal))+'</b></div>'+
          '</div>'+
          '<div class="relative flex items-center justify-center shrink-0" style="width:84px;height:84px">'+
            '<svg class="tx-ring-svg" width="84" height="84" viewBox="0 0 84 84">'+
              '<circle class="tx-ring-bg" cx="42" cy="42" r="'+rRing+'"></circle>'+
              '<circle class="tx-ring-fg" cx="42" cy="42" r="'+rRing+'" stroke="#8b5cf6" stroke-dasharray="'+cRing+'" stroke-dashoffset="'+oRing+'"></circle>'+
            '</svg>'+
            '<span class="absolute font-bold text-sm font-mono text-slate-900 dark:text-white">'+M.goalPct+'%</span>'+
          '</div>'+
        '</div>'+
        '<div class="pt-2 border-t border-slate-200/70 dark:border-white/10 flex items-center justify-between text-xs text-slate-500 dark:text-slate-300">'+
          '<span>إنجاز الشهر: <b class="text-slate-800 dark:text-white font-mono">'+M.monthTxCount+' طلب</b> ('+M.monthUnits+' خدمة)</span>'+
          '<span class="text-violet-600 dark:text-violet-300 font-bold hover:underline">التفاصيل ←</span>'+
        '</div>'+
      '</div>'+

      /* البطاقة 2: الموظف الأعلى تحقيقاً للمستهدف */
      '<div onclick="switchTab(\'comm\')" class="fl-card cursor-pointer flex flex-col justify-between gap-2.5">'+
        '<div class="flex items-center justify-between">'+
          '<span class="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300"><i class="fa-solid fa-trophy text-amber-500"></i><span>الأعلى تحقيقاً للمستهدف</span></span>'+
          '<span class="text-[11px] text-slate-400">بيانات الأداء الفعلية</span>'+
        '</div>'+
        topHtml+
      '</div>'+

      /* البطاقة 3: الموظف الأكثر احتياجاً للدعم والمساندة (بصياغة مهنية) */
      '<div onclick="openMyDayTab(\'all\')" class="fl-card cursor-pointer flex flex-col justify-between gap-2.5">'+
        '<div class="flex items-center justify-between">'+
          '<span class="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-300"><i class="fa-solid fa-hands-helping"></i><span>الأكثر احتياجاً للدعم والمتابعة</span></span>'+
          '<span class="text-[11px] text-slate-400">توزيع العبء والمساندة</span>'+
        '</div>'+
        supHtml+
      '</div>'+

    '</div>'+
  '</div>';
}

function renderHomeTab(){
  const box=$('tab-home');if(!box)return;
  const eh=escapeHtml;
  const mgr=canEditTx();
  const meName=(myProfile&&myProfile.full_name)||((currentUser&&currentUser.email)||'').split('@')[0]||'مرحباً بك';
  const todayStr=new Intl.DateTimeFormat('ar-EG',{weekday:'long',year:'numeric',month:'long',day:'numeric'}).format(new Date());
  const tk=new Date().toLocaleDateString('en-CA');
  const todayOrders=groupedOrders.filter(o=>dayKey(o.received_at||o.created_at)===tk);
  const todaySales=todayOrders.reduce((s,o)=>s+(Number(o.grand_total)||0),0);
  const openLines=allRequestLines.filter(l=>(l.status||'In Progress')!=='Delivered').length;
  const lateCnt=typeof window.getMyDayLateCount==='function'?window.getMyDayLateCount():0;
  const unreadChat=chatItems.reduce((s,i)=>s+(i.unread||0),0);
  const cashTodayCnt=allRequestLines.filter(l=>(l.payment_method||'').trim()==='كاش'&&dayKey(lineDate(l))===tk).length;

  const staffList=profiles.filter(p=>p.id&&p.role!=='partner');
  const empCards=staffList.map(p=>({p:p,st:getEmpLiveStatus(p)}));
  empCards.sort((a,b)=>{
    const rank={working:0,idle:1,offline:2};
    return (rank[a.st.statusKey]-rank[b.st.statusKey])||(b.st.todayTx-a.st.todayTx);
  });
  const wCount=empCards.filter(x=>x.st.statusKey==='working').length;
  const iCount=empCards.filter(x=>x.st.statusKey==='idle').length;
  const oCount=empCards.filter(x=>x.st.statusKey==='offline').length;

  const navCard=(title,sub,icon,bgGrad,actionJs,badgeHtml)=>
    '<button type="button" onclick="'+actionJs+'" class="hm-nav-card lift group">'+
      '<span class="hm-nav-icon" style="background:'+bgGrad+'"><i class="fa-solid '+icon+'"></i></span>'+
      '<div class="min-w-0 flex-1">'+
        '<div class="flex items-center justify-between gap-2">'+
          '<span class="font-bold text-xs sm:text-sm text-ink dark:text-white group-hover:text-violet-400 transition truncate">'+eh(title)+'</span>'+
          (badgeHtml||'<i class="fa-solid fa-chevron-left text-[10px] text-slate-400 group-hover:text-violet-400 transition"></i>')+
        '</div>'+
        '<p class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">'+eh(sub)+'</p>'+
      '</div>'+
    '</button>';

  const bPill=(txt,cls)=>txt?'<span class="rounded-full border px-2 py-0.5 text-[10px] font-bold whitespace-nowrap '+cls+'">'+txt+'</span>':'';

  let h=
    /* 1. الهيدر العلوي المتناسق للشاشة الرئيسية (بدون ألوان بيضاء أو نصوص ضخمة) */
    '<div class="hm-hero">'+
      '<div class="flex flex-wrap items-center justify-between gap-3">'+
        '<div>'+
          '<h1 class="text-base sm:text-lg font-bold text-white">أهلاً، '+eh(meName)+'</h1>'+
          '<p class="text-[11px] text-slate-300 mt-0.5">'+eh(todayStr)+'</p>'+
        '</div>'+
      '</div>'+
      '<div class="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mt-3.5">'+
        '<button type="button" onclick="switchTab(\'tx\')" class="hm-kpi-box">'+
          '<div class="text-[11px] text-slate-400">إيراد اليوم</div>'+
          '<div class="text-base sm:text-lg font-bold font-mono text-white mt-0.5 whitespace-nowrap">'+eh(formatCurrency(todaySales))+'</div>'+
        '</button>'+
        '<button type="button" onclick="switchTab(\'tx\')" class="hm-kpi-box">'+
          '<div class="text-[11px] text-slate-400">معاملات اليوم</div>'+
          '<div class="text-base sm:text-lg font-bold font-mono text-white mt-0.5 whitespace-nowrap">'+todayOrders.length+' معاملة</div>'+
        '</button>'+
        '<button type="button" onclick="switchTab(\'tx\')" class="hm-kpi-box">'+
          '<div class="text-[11px] text-slate-400">بنود قيد التنفيذ</div>'+
          '<div class="text-base sm:text-lg font-bold font-mono text-violet-300 mt-0.5 whitespace-nowrap">'+openLines+' بند</div>'+
        '</button>'+
        '<button type="button" onclick="openMyDayTab(\'late\')" class="hm-kpi-box" style="'+(lateCnt>0?'background:rgba(244,63,94,0.16);border-color:rgba(251,113,133,0.35)':'')+'">'+
          '<div class="text-[11px] text-slate-300 flex items-center justify-between"><span>المتأخرات</span><i class="fa-solid fa-triangle-exclamation text-rose-400"></i></div>'+
          '<div class="text-base sm:text-lg font-bold font-mono '+(lateCnt>0?'text-rose-300':'text-emerald-300')+' mt-0.5 whitespace-nowrap">'+(lateCnt>0?lateCnt+' متأخر':'0 متأخرات ✓')+'</div>'+
        '</button>'+
      '</div>'+
    '</div>'+

    /* 2. الكروت التفاعلية */
    renderFloatingCardsStage(eh,todayOrders,lateCnt)+

    /* 3. الأقسام */
    '<div class="space-y-2.5">'+
      '<div class="flex items-center justify-between px-1">'+
        '<h2 class="font-bold text-xs sm:text-sm text-ink dark:text-white">الأقسام</h2>'+
      '</div>'+
      '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">'+
        navCard('طلب جديد','تسجيل معاملة جديدة للعميل','fa-plus','linear-gradient(135deg,#7c3aed,#a855f7)',"switchTab('new')",bPill('جديد +','bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300'))+
        navCard('المعاملات','متابعة كل المعاملات وتحديث الحالات','fa-list-ul','linear-gradient(135deg,#6366f1,#4338ca)',"switchTab('tx')",bPill(groupedOrders.length+' معاملة','bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'))+
        navCard('شغلي النهاردة','معاملاتك اليوم والبنود المفتوحة','fa-sun','linear-gradient(135deg,#0284c7,#1d4ed8)',"openMyDayTab('all')",bPill('اليوم','bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300'))+
        navCard('المتأخرات','الطلبات المتجاوزة لموعد التسليم','fa-triangle-exclamation','linear-gradient(135deg,#e11d48,#be123c)',"openMyDayTab('late')",lateCnt>0?bPill(lateCnt+' متأخر','bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'):bPill('0 متأخر','bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'))+
        navCard('الكوميشن والتارجت','حساب الكوميشن وتارجت الموظفين','fa-bullseye','linear-gradient(135deg,#059669,#047857)',"switchTab('comm')",bPill('الشهر الحالي','bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'))+
        navCard('المنفذين','متابعة بنود وتكلفة التنفيذ','fa-user-gear','linear-gradient(135deg,#4f46e5,#3730a3)',"switchTab('exec')",bPill(allRequestLines.length+' بند','bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'))+
        navCard('الكاش','تحصيلات الكاش اليومية والتقارير','fa-wallet','linear-gradient(135deg,#d97706,#b45309)',"switchTab('cash')",bPill(cashTodayCnt+' اليوم','bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300'))+
        navCard('المناديب','مشاوير الاستلام والتسليم ورسوم التوصيل','fa-motorcycle','linear-gradient(135deg,#0f766e,#134e4a)',"switchTab('couriers')",bPill('المشاوير','bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300'))+
        navCard('الإيصالات','إصدار وطباعة الإيصالات الرسمية','fa-receipt','linear-gradient(135deg,#9333ea,#6b21a8)',"switchTab('receipt')",'')+
        navCard('البحث الشامل','بحث بالعميل أو التليفون أو المعاملة','fa-magnifying-glass','linear-gradient(135deg,#2563eb,#1e40af)',"switchTab('search')",'')+
        navCard('المحادثة','مراسلة الزملاء وقناة القسم','fa-comments','linear-gradient(135deg,#0891b2,#155e75)',"switchTab('chat')",unreadChat>0?bPill(unreadChat+' جديد','bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'):bPill('متصل','bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300'))+
        navCard('الداش بورد','إحصائيات وتقارير الأداء','fa-chart-pie','linear-gradient(135deg,#3b0764,#1e1b4b)',"switchTab('dash')",'')+
        navCard('المهام','متابعة المهام المسندة','fa-list-check','linear-gradient(135deg,#0d9488,#0f766e)',"switchTab('tasks')",'')+
        navCard('فريق العمل','بيانات التواصل وحالة الزملاء','fa-user-group','linear-gradient(135deg,#6366f1,#4338ca)',"switchTab('team')",bPill(wCount+' نشط','bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'))+
        navCard('الموارد البشرية','الحضور والانصراف والشيفتات','fa-fingerprint','linear-gradient(135deg,#db2777,#9d174d)',"switchTab('hr')",'')+
        navCard('ملاحظاتي','الملاحظات الشخصية المحمية','fa-note-sticky','linear-gradient(135deg,#eab308,#ca8a04)',"switchTab('notes')",'')+
        (mgr?navCard('أداء الموظفين','سرعة الإنجاز والنشاط اليومي','fa-gauge-high','linear-gradient(135deg,#dc2626,#991b1b)',"switchTab('perf')",bPill('للمدير','bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300')):'')+
        (mgr&&$('tab-partners-btn')?navCard('المنفذون الخارجيون','إدارة وتسويات الشركاء','fa-handshake','linear-gradient(135deg,#475569,#1e293b)',"switchTab('partners')",bPill('للمدير','bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300')):'')+
      '</div>'+
    '</div>'+

    /* 4. حالة الفريق الآن (بدون نصوص إنشائية) */
    '<div class="card p-4 space-y-3">'+
      '<div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">'+
        '<div class="flex items-center gap-2">'+
          '<span class="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-white text-xs"><i class="fa-solid fa-signal"></i></span>'+
          '<h3 class="font-bold text-xs sm:text-sm text-ink dark:text-white">حالة الفريق</h3>'+
        '</div>'+
        '<div class="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">'+
          '<span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-2.5 py-0.5 text-emerald-700 dark:text-emerald-300"><span class="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>شغال الآن: '+wCount+'</span>'+
          '<span class="inline-flex items-center gap-1.5 rounded-full bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 px-2.5 py-0.5 text-amber-700 dark:text-amber-300"><span class="h-1.5 w-1.5 rounded-full bg-amber-500"></span>خامل: '+iCount+'</span>'+
          '<span class="inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-0.5 text-slate-600 dark:text-slate-400"><span class="h-1.5 w-1.5 rounded-full bg-slate-400"></span>قافل: '+oCount+'</span>'+
        '</div>'+
      '</div>'+
      (empCards.length
        ?'<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">'+empCards.map(function(item){
            const p=item.p,st=item.st,isMe=currentUser&&String(p.id)===String(currentUser.id);
            return '<div class="hm-emp-card">'+
              '<div class="flex items-center gap-2.5 min-w-0">'+
                '<span class="relative shrink-0">'+avatarHtml(p,36)+'<span class="absolute bottom-0 end-0 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-slate-900 '+st.dotCls+'"></span></span>'+
                '<div class="min-w-0">'+
                  '<div class="font-bold text-xs text-ink dark:text-white truncate">'+eh(p.full_name||'موظف')+(isMe?' <span class="text-[10px] text-violet-400 font-bold">(أنت)</span>':'')+'</div>'+
                  '<div class="text-[10.5px] text-slate-500 truncate mt-0.5">'+eh(st.sub)+'</div>'+
                '</div>'+
              '</div>'+
              '<div class="text-left shrink-0 flex flex-col items-end gap-0.5">'+
                '<span class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold whitespace-nowrap '+st.badgeCls+'"><span class="h-1.5 w-1.5 rounded-full '+st.dotCls+'"></span><span>'+eh(st.label)+'</span></span>'+
                '<span class="text-[10.5px] font-semibold text-slate-500">اليوم: <b class="text-ink dark:text-white">'+st.todayTx+' معاملة</b></span>'+
              '</div>'+
            '</div>';
          }).join('')+'</div>'
        :'<div class="text-center py-5 text-xs text-slate-400">جارٍ تحميل بيانات الفريق...</div>')+
    '</div>';

  box.innerHTML=h;
}
window.renderHomeTab=renderHomeTab;

/* إيقاف شريط العنوان المكرر أسفل الهيدر */
window.__phase15=true;
function paintCurrentTabBanner(id){
  const t=$('cur-tab-title');
  if(t){t.classList.add('hidden');t.style.display='none';}
}

/* ---------- تنقل وثيم ---------- */
function switchTab(id){
  currentTab=id;
  const baseTabs=['home','new','tx','exec','cash','search','receipt','dash','comm','team','chat','tasks','notes'];
  baseTabs.forEach(t=>{
    const pane=$('tab-'+t);if(pane)pane.classList.toggle('hidden',t!==id);
    const btn=$('tab-'+t+'-btn');
    if(btn)btn.className='tab-btn '+(t===id?'bg-ink text-white dark:bg-brand-600 shadow-sm':'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800');
  });
  document.querySelectorAll('[data-tab-target]').forEach(el=>{
    const on=el.getAttribute('data-tab-target')===id;
    el.className='tab-btn '+(on?'bg-ink text-white dark:bg-brand-600 shadow-sm':'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800');
  });
  try{paintCurrentTabBanner(id);}catch(e){}
  syncMyPresence(false);
  if(id==='home')renderHomeTab();
  if(id==='new'){updateOrderProgressBar();renderQuickServicesGrid();}
  if(id==='tx')renderRecentRequests();
  if(id==='dash')renderDashboardMetrics();
  if(id==='exec')filterExecSheet();
  if(id==='cash')filterCashSheet();
  if(id==='search')executeSearch();
  if(id==='comm'&&window.renderComm)renderComm();
  if(id==='team'){renderTeam();loadProfiles();}
  if(id==='chat')openChatTab();
  if(id==='tasks'&&window.renderTasks)renderTasks();
  if(id==='notes'&&window.renderNotes)renderNotes();
}
function toggleDarkMode(){
  const d=document.documentElement.classList.toggle('dark');
  document.documentElement.classList.toggle('light',!d);
  localStorage.setItem('theme_v2',d?'dark':'light');
}
function initTheme(){
  const s=localStorage.getItem('theme_v2');
  const d=s?s==='dark':true; // الثيم البنفسجي النيون الداكن هو الافتراضي للتصميم الجديد
  document.documentElement.classList.toggle('dark',d);
  document.documentElement.classList.toggle('light',!d);
}

function tafqeetArabic(num){
  num=Number(num)||0;if(num<=0)return 'صفر جنيه مصري فقط لا غير';
  const n=Math.floor(num);if(n>=1000000)return fmtNum(num)+' جنيه مصري';
  const ones=['','واحد','اثنان','ثلاثة','أربعة','خمسة','ستة','سبعة','ثمانية','تسعة'],tens=['','عشرة','عشرون','ثلاثون','أربعون','خمسون','ستون','سبعون','ثمانون','تسعون'],teens=['عشرة','أحد عشر','اثنا عشر','ثلاثة عشر','أربعة عشر','خمسة عشر','ستة عشر','سبعة عشر','ثمانية عشر','تسعة عشر'],hund=['','مائة','مئتان','ثلاثمائة','أربعمائة','خمسمائة','ستمائة','سبعمائة','ثمانمائة','تسعمائة'];
  const chunk=x=>{const p=[],h=Math.floor(x/100),r=x%100,t=Math.floor(r/10),o=r%10;if(h)p.push(hund[h]);if(r>=10&&r<=19)p.push(teens[r-10]);else{if(o)p.push(ones[o]);if(t)p.push(tens[t]);}return p.join(' و');};
  const th=Math.floor(n/1000),rem=n%1000;let res='';
  if(th){res=th===1?'ألف':th===2?'ألفان':th<=10?chunk(th)+' آلاف':chunk(th)+' ألفاً';}
  if(rem){res+=(res?' و':'')+chunk(rem);}
  const piasters=Math.round((num-n)*100);
  return 'فقط '+res+' جنيه مصري'+(piasters?' و'+piasters+' قرشاً':'')+' لا غير';
}

window.addEventListener('DOMContentLoaded',()=>{initTheme();styleDashButtons();switchTab('home');addServiceLine();checkSession();});
