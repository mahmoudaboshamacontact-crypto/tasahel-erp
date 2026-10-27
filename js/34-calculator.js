/* Tasahel Pro Calculator — safe local calculator, keyboard support, history and persistent state. */
(function () {
  'use strict';
  if (window.__glCalc) return; window.__glCalc = true;
  var SK = 'ts_calc_state', HK = 'ts_calc_history', S = { expr: '', res: '', vis: 'closed', fx: null, fy: null, px: null, py: null, angle: 'deg' }, box, fab, scrim, exEl, rsEl, histEl;
  var history = [];
  function load() { try { var j = JSON.parse(localStorage.getItem(SK) || 'null'); if (j) for (var k in j) S[k] = j[k]; history = JSON.parse(localStorage.getItem(HK) || '[]').slice(0, 12); } catch (e) {} }
  function save() { try { localStorage.setItem(SK, JSON.stringify(S)); localStorage.setItem(HK, JSON.stringify(history.slice(0,12))); } catch (e) {} }
  function calc(src) {
    var s = src.replace(/×/g, '*').replace(/÷/g, '/').replace(/٫/g, '.').replace(/,/g, ''), i = 0;
    function ws() { while (s[i] === ' ') i++; }
    function num() { ws(); var m = /^(?:\d+\.?\d*|\.\d+)/.exec(s.slice(i)); if (!m) throw 0; i += m[0].length; var v = parseFloat(m[0]); while (s[i] === '%') { v /= 100; i++; } return v; }
    function atom() { ws(); if (s[i] === '(') { i++; var v = add(); ws(); if (s[i] !== ')') throw 0; i++; while (s[i] === '%') { v /= 100; i++; } return v; } if (s[i] === '-') { i++; return -atom(); } if (s[i] === '+') { i++; return atom(); } if (s.slice(i,i+2) === '√(') { i+=2; var q=add(); ws(); if(s[i]!==')'||q<0) throw 0; i++; return Math.sqrt(q); } return num(); }
    function mul() { var v = atom(); for (;;) { ws(); var c=s[i]; if(c==='*'){i++;v*=atom();} else if(c==='/'){i++;var d=atom();if(d===0)throw 1;v/=d;} else if(c==='('){v*=atom();} else return v; } }
    function add() { var v=mul(); for(;;){ws();var c=s[i];if(c==='+'){i++;v+=mul();}else if(c==='-'){i++;v-=mul();}else return v;} }
    var r=add();ws();if(i<s.length||!isFinite(r))throw 0;return r;
  }
  function fmt(n) { if (!isFinite(n)) return 'خطأ'; var r=Math.round((n + Number.EPSILON)*1e10)/1e10; return String(r); }
  function eval_() { if (!S.expr) { S.res=''; return; } try { S.res=fmt(calc(S.expr)); } catch(e) { S.res=e===1?'لا يمكن القسمة على صفر':''; } }
  function render() { exEl.textContent=S.expr||'0'; rsEl.textContent=S.res||(S.expr?'…':'0'); rsEl.classList.toggle('is-error', S.res==='لا يمكن القسمة على صفر'); renderHistory(); save(); }
  function renderHistory(){ if(!histEl)return; histEl.innerHTML=''; if(!history.length){histEl.innerHTML='<div class="gcal-empty">عملياتك الأخيرة هتظهر هنا</div>';return;} history.slice(0,5).forEach(function(h){var b=document.createElement('button');b.type='button';b.className='gcal-history-item';b.innerHTML='<span class="gcal-history-expr"></span><strong class="gcal-history-result"></strong>';b.querySelector('.gcal-history-expr').textContent=h.expr;b.querySelector('.gcal-history-result').textContent='= '+h.res;b.addEventListener('click',function(){S.expr=h.res;S.res='';render();});histEl.appendChild(b);}); }
  function press(k) {
    if(k==='C'){S.expr='';S.res='';}
    else if(k==='⌫'){S.expr=S.expr.slice(0,-1);eval_();}
    else if(k==='='){if(S.res&&S.res!=='لا يمكن القسمة على صفر'){history.unshift({expr:S.expr,res:S.res});history=history.slice(0,12);S.expr=S.res;S.res='';}}
    else if(k==='±'){if(!S.expr)return;try{S.expr=fmt(-calc(S.expr));eval_();}catch(e){}}
    else if(k==='√'){S.expr='√('+S.expr+')';eval_();}
    else {var last=S.expr.slice(-1);if(/[+\-×÷]/.test(k)&&/[+\-×÷]/.test(last))S.expr=S.expr.slice(0,-1);if(k==='.'&&(S.expr.split(/[+\-×÷()]/).pop()||'').indexOf('.')>-1)return;S.expr+=k;eval_();}
    render();
  }

function place(el, x, y, w, h) {
  var vw = document.documentElement.clientWidth;
  var vh = document.documentElement.clientHeight;
  var mw = Math.max(8, vw - w - 8);
  var mh = Math.max(8, vh - h - 8);

  el.style.left = Math.max(8, Math.min(x, mw)) + 'px';
  el.style.top = Math.max(8, Math.min(y, mh)) + 'px';
  el.style.right = 'auto';
  el.style.bottom = 'auto';
  el.style.transform = 'none';
}
  function drag(handle,el,onEnd,isFab){var sx,sy,ox,oy,moved,down=false;handle.addEventListener('pointerdown',function(e){if (!isFab && e.target.closest('button')) return;down=true;moved=false;sx=e.clientX;sy=e.clientY;var r=el.getBoundingClientRect();ox=r.left;oy=r.top;try{handle.setPointerCapture(e.pointerId);}catch(x){}});handle.addEventListener('pointermove',function(e){if(!down)return;var dx=e.clientX-sx,dy=e.clientY-sy;if(Math.abs(dx)+Math.abs(dy)>5)moved=true;if(moved)place(el,ox+dx,oy+dy,el.offsetWidth,el.offsetHeight);});handle.addEventListener('pointerup',function(){if(!down)return;down=false;if(moved){var r=el.getBoundingClientRect();onEnd(r.left,r.top);if(isFab)fab.__moved=true;}});}
  function show(v){S.vis=v;box.classList.toggle('on',v==='open');fab.classList.toggle('on',v==='min');if(scrim)scrim.classList.toggle('on',v==='open');if(v==='open'){if(S.px!=null)place(box,S.px,S.py,330,560);}if(v==='min'){if(S.fx!=null)place(fab,S.fx,S.fy,52,52);else{fab.style.right='18px';fab.style.bottom='130px';}}save();}
  function build(){
    box=document.createElement('section');box.id='gl-calc';box.setAttribute('role','dialog');box.setAttribute('aria-label','آلة حاسبة تساهيل');
    var keys=[['C','utility'],['⌫','utility'],['%','utility'],['÷','operator'],['7','number'],['8','number'],['9','number'],['×','operator'],['4','number'],['5','number'],['6','number'],['−','operator'],['1','number'],['2','number'],['3','number'],['+','operator'],['±','utility'],['0','number'],['.','number'],['=','equals']];
    box.innerHTML='<div class="gcal-head"><div class="gcal-brand"><span class="gcal-brand-icon"><i class="fa-solid fa-calculator"></i></span><div><strong>حاسبة تساهيل</strong><small>CALCULATOR · PRO</small></div></div><div class="gcal-window-actions"><button type="button" class="gcal-min" aria-label="تصغير" title="تصغير">−</button><button type="button" class="gcal-close" aria-label="إغلاق" title="إغلاق">×</button></div></div><div class="gcal-display"><div class="gcal-display-label">العملية الحسابية</div><div class="gcal-ex" dir="ltr"></div><div class="gcal-result-row"><span class="gcal-result-label">الناتج</span><div class="gcal-res" dir="ltr"></div><button type="button" class="gcal-copy" title="نسخ الناتج" aria-label="نسخ الناتج"><i class="fa-regular fa-copy"></i></button></div></div><div class="gcal-tools"><span><i class="fa-solid fa-keyboard"></i> تدعم لوحة المفاتيح</span><button type="button" class="gcal-history-toggle">سجل العمليات <i class="fa-solid fa-chevron-down"></i></button></div><div class="gcal-fx"><div class="gcal-fx-head"><strong>⇄ تحويل العملات</strong><span class="gcal-fx-status">جاري تحديث السعر…</span></div><div class="gcal-fx-controls"><input class="gcal-fx-amount" type="number" min="0" step="any" value="1" aria-label="المبلغ"><select class="gcal-fx-from" aria-label="من العملة"><option value="EGP">جنيه EGP</option><option value="USD">دولار USD</option><option value="SAR">ريال SAR</option><option value="AED">درهم AED</option><option value="KWD">دينار KWD</option><option value="EUR">يورو EUR</option><option value="GBP">إسترليني GBP</option></select><span>⇄</span><select class="gcal-fx-to" aria-label="إلى العملة"><option value="USD">دولار USD</option><option value="EGP">جنيه EGP</option><option value="SAR">ريال SAR</option><option value="AED">درهم AED</option><option value="KWD">دينار KWD</option><option value="EUR">يورو EUR</option><option value="GBP">إسترليني GBP</option></select></div><div class="gcal-fx-result"><b class="gcal-fx-result-value">—</b><button type="button" class="gcal-fx-swap">عكس</button></div><small>سعر إرشادي من الإنترنت، لا يُحفظ في قاعدة بيانات السيستم.</small></div><div class="gcal-history" hidden></div><div class="gcal-keys">'+keys.map(function(a){var k=a[0],cls=a[1],shown=k==='−'?'−':k;return '<button type="button" data-k="'+k+'" class="gcal-key '+cls+'">'+shown+'</button>';}).join('')+'</div><div class="gcal-foot"><span><i class="fa-solid fa-shield-halved"></i> حسابات محلية آمنة</span><button type="button" class="gcal-clear-history">مسح السجل</button></div>';
    scrim=document.createElement('div');scrim.id='gl-calc-scrim';document.body.appendChild(scrim);scrim.addEventListener('click',function(){show('min');});document.body.appendChild(box);fab=document.createElement('button');fab.type='button';fab.id='gl-calc-fab';fab.title='فتح حاسبة تساهيل';fab.setAttribute('aria-label','فتح الآلة الحاسبة');fab.innerHTML='<i class="fa-solid fa-calculator"></i>';document.body.appendChild(fab);
    exEl=box.querySelector('.gcal-ex');rsEl=box.querySelector('.gcal-res');histEl=box.querySelector('.gcal-history');initFx(box);
    box.querySelector('.gcal-keys').addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;var k=b.dataset.k;if(k==='−')k='-';press(k);});
    box.querySelector('.gcal-close').addEventListener('click',function(){show('closed');});box.querySelector('.gcal-min').addEventListener('click',function(){show('min');});fab.addEventListener('click',function(){if(fab.__moved){fab.__moved=false;return;}show('open');});
    box.querySelector('.gcal-history-toggle').addEventListener('click',function(){histEl.hidden=!histEl.hidden;this.classList.toggle('active',!histEl.hidden);});
    box.querySelector('.gcal-clear-history').addEventListener('click',function(){history=[];renderHistory();save();});
    box.querySelector('.gcal-copy').addEventListener('click',function(){var value=S.res||S.expr;if(!value)return;var done=function(){this.classList.add('copied');this.innerHTML='<i class="fa-solid fa-check"></i>';var self=this;setTimeout(function(){self.classList.remove('copied');self.innerHTML='<i class="fa-regular fa-copy"></i>';},1100);}.bind(this);if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(value).then(done).catch(function(){fallbackCopy(value,done);});else fallbackCopy(value,done);});
    drag(box.querySelector('.gcal-head'),box,function(x,y){S.px=x;S.py=y;save();});drag(fab,fab,function(x,y){S.fx=x;S.fy=y;save();},true);
    box.addEventListener('keydown',function(e){var k=e.key;if(/^[0-9.+()%]$/.test(k))press(k);else if(k==='*')press('×');else if(k==='/'){e.preventDefault();press('÷');}else if(k==='Enter'||k==='='){e.preventDefault();press('=');}else if(k==='Backspace')press('⌫');else if(k==='Escape')show('min');else if(k==='-')press('-');});box.tabIndex=-1;
    window.addEventListener('resize',function(){if(S.vis==='min'&&S.fx!=null)place(fab,S.fx,S.fy,52,52);if(S.vis==='open'&&box.getBoundingClientRect().right>innerWidth)place(box,innerWidth-box.offsetWidth-8,8,box.offsetWidth,box.offsetHeight);});
  }
  function initFx(root){var amount=root.querySelector('.gcal-fx-amount'),from=root.querySelector('.gcal-fx-from'),to=root.querySelector('.gcal-fx-to'),out=root.querySelector('.gcal-fx-result-value'),status=root.querySelector('.gcal-fx-status'),rates={},updated=0,busy=false;var currencies=['EGP','USD','SAR','AED','KWD','EUR','GBP'];function paint(){var n=Number(amount.value),f=from.value,t=to.value;if(!Number.isFinite(n)||n<0){out.textContent='أدخل مبلغًا صحيحًا';return;}if(f===t){out.textContent=n.toLocaleString('en-US')+' '+t;return;}out.textContent=rates[f]&&rates[t]?(n*(rates[t]/rates[f])).toLocaleString('en-US',{maximumFractionDigits:4})+' '+t:'—';}async function refresh(force){if(busy||(!force&&Date.now()-updated<1800000&&Object.keys(rates).length))return;busy=true;status.textContent='تحديث السعر…';try{var r=await fetch('https://open.er-api.com/v6/latest/USD');if(!r.ok)throw Error();var j=await r.json();if(j.result!=='success')throw Error();rates=j.rates;updated=Date.now();status.textContent='آخر تحديث '+new Date(updated).toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'});paint();}catch(e){status.textContent=Object.keys(rates).length?'تعذر التحديث · آخر سعر محفوظ':'تعذر جلب السعر، تحقق من الإنترنت';paint();}finally{busy=false;}}amount.addEventListener('input',paint);from.addEventListener('change',function(){paint();refresh(false);});to.addEventListener('change',function(){paint();refresh(false);});root.querySelector('.gcal-fx-swap').addEventListener('click',function(){var x=from.value;from.value=to.value;to.value=x;paint();});refresh(true);setInterval(function(){if(!document.hidden)refresh(false);},60000);}
  function fallbackCopy(value,done){var ta=document.createElement('textarea');ta.value=value;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();try{document.execCommand('copy');done();}catch(e){}ta.remove();}
  window.openCalculator=function(){if(typeof window.closeNavMenu==='function')window.closeNavMenu();show('open');box.focus();};
  function addEntries(){var m=document.getElementById('nav-menu');if(m&&!m.querySelector('[data-calc]')){var b=document.createElement('button');b.type='button';b.className='tab-btn';b.setAttribute('data-calc','1');b.innerHTML='<i class="fa-solid fa-calculator"></i><span>الآلة الحاسبة</span>';b.onclick=function(){window.openCalculator();};var notes=document.getElementById('tab-notes-btn');notes?notes.insertAdjacentElement('afterend',b):m.appendChild(b);}}
  function init(){load();build();render();addEntries();setTimeout(addEntries,1500);show(S.vis==='open'?'open':S.vis==='min'?'min':'closed');}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
