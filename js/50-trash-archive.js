/* الجزء أ: سلة المحذوفات (98) + الأرشفة (96) — للمدير فقط. SQL: sql/part-a-trash-archive.sql */
(function () {
  if (window.__phase50) return; window.__phase50 = true;
  var $ = function (id) { return document.getElementById(id); };
  var eh = function (s) { return typeof escapeHtml === 'function' ? escapeHtml(s) : String(s == null ? '' : s); };
  var isMgr = function () { return window.__role === 'manager'; };
  var BTN_ON = 'tab-btn bg-ink text-white dark:bg-brand-600 shadow-sm';
  var BTN_OFF = 'tab-btn text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800';
  var rows = [], busy = false;

  function toast(m, t) { if (typeof showToast === 'function') showToast(m, t || 'info'); }
  function wrap(name, make) {
    var o = window[name]; if (typeof o !== 'function') return;
    window[name] = make(o);
  }
  function fmtDate(s) { try { return new Date(s).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return ''; } }
  function daysLeft(s) { return Math.max(0, 30 - Math.floor((Date.now() - new Date(s).getTime()) / 86400000)); }
  function defCutoff() { var d = new Date(); d.setMonth(d.getMonth() - 6); return d.toISOString().slice(0, 10); }
  async function refreshApp() {
    try { if (typeof resetLinesCache === 'function') resetLinesCache(); if (typeof loadRecentRequests === 'function') await loadRecentRequests(); } catch (e) { /* */ }
  }

  function render() {
    var pane = $('tab-trash'); if (!pane) return;
    var list = rows.length ? rows.map(function (r) {
      return '<tr class="border-t border-slate-100 dark:border-slate-800">' +
        '<td class="p-2"><input type="checkbox" class="tr50-ck h-4 w-4 rounded" value="' + eh(r.id) + '"></td>' +
        '<td class="p-2 font-mono text-[11px]" dir="ltr">' + eh(r.transaction_id) + '</td>' +
        '<td class="p-2">' + eh(r.client_name) + '</td>' +
        '<td class="p-2">' + eh(r.service) + '</td>' +
        '<td class="p-2 font-mono" dir="ltr">' + eh(r.total) + '</td>' +
        '<td class="p-2 text-[11px] text-slate-500">' + eh(fmtDate(r.deleted_at)) + '</td>' +
        '<td class="p-2 text-[11px] text-slate-500">' + daysLeft(r.deleted_at) + ' يوم</td></tr>';
    }).join('') : '<tr><td colspan="7" class="p-6 text-center text-xs text-slate-500">السلة فاضية.</td></tr>';
    pane.innerHTML =
      '<div class="space-y-4">' +
      '<div class="card p-4 sm:p-5 space-y-3">' +
        '<div class="flex flex-wrap items-center justify-between gap-2">' +
          '<div><h3 class="font-bold text-sm text-ink dark:text-white flex items-center gap-2"><i class="fa-solid fa-trash-can-arrow-up text-brand-600"></i><span>سلة المحذوفات</span></h3>' +
          '<p class="text-[11px] text-slate-500 mt-0.5">البنود المحذوفة بتفضل 30 يوم وبعدها تتمسح نهائياً.</p></div>' +
          '<div class="flex gap-2">' +
            '<button id="tr50-restore" type="button" class="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white">استرجاع المحدد</button>' +
            '<button id="tr50-purge" type="button" class="rounded-xl bg-rose-50 dark:bg-rose-950/40 px-3.5 py-2 text-xs font-bold text-rose-600 dark:text-rose-300">مسح الأقدم من 30 يوم</button>' +
          '</div></div>' +
        '<div class="overflow-x-auto"><table class="w-full text-right text-xs"><thead class="text-slate-500"><tr>' +
          '<th class="p-2 w-8"><input type="checkbox" id="tr50-all" class="h-4 w-4 rounded"></th><th class="p-2">رقم المعاملة</th><th class="p-2">العميل</th><th class="p-2">الخدمة</th><th class="p-2">الإجمالي</th><th class="p-2">اتحذف</th><th class="p-2">متبقي</th></tr></thead>' +
          '<tbody>' + list + '</tbody></table></div></div>' +
      '<div class="card p-4 sm:p-5 space-y-3">' +
        '<h3 class="font-bold text-sm text-ink dark:text-white flex items-center gap-2"><i class="fa-solid fa-box-archive text-amber-500"></i><span>أرشفة الشهور القديمة</span></h3>' +
        '<p class="text-[11px] text-slate-500">بتنقل المعاملات الأقدم من التاريخ ده لجدول أرشيف وتشيلها من السيستم الشغال (بتخفف الحمل). لازم يكون التاريخ قبل 90 يوم على الأقل. المعاملات المؤرشفة مش بتظهر في التقارير ولا في صفحة التتبع. خد نسخة احتياطية الأول.</p>' +
        '<div class="flex flex-wrap items-end gap-2">' +
          '<label class="text-[11px] text-slate-500">أرشف كل اللي قبل<input id="ar50-date" type="date" value="' + defCutoff() + '" class="field mt-1 block" dir="ltr"></label>' +
          '<button id="ar50-preview" type="button" class="rounded-xl bg-slate-100 dark:bg-slate-800 px-3.5 py-2 text-xs font-bold">معاينة العدد</button>' +
          '<button id="ar50-backup" type="button" class="rounded-xl bg-slate-100 dark:bg-slate-800 px-3.5 py-2 text-xs font-bold">نسخة احتياطية</button>' +
        '</div>' +
        '<div id="ar50-out" class="text-xs text-slate-600 dark:text-slate-300"></div>' +
        '<div id="ar50-confirm" class="hidden flex flex-wrap items-center gap-2"><input id="ar50-word" class="field" placeholder="اكتب: أرشفة" autocomplete="off"><button id="ar50-run" type="button" class="rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-bold text-white">نفّذ الأرشفة</button></div>' +
      '</div></div>';
  }

  async function load() {
    if (!isMgr() || !sbClient) return;
    var r = await sbClient.rpc('trash_list');
    if (r.error) { rows = []; render(); toast('فشل تحميل السلة: ' + (r.error.message || ''), 'error'); return; }
    rows = r.data || []; render();
  }

  async function run(fn) { if (busy) return; busy = true; try { await fn(); } finally { busy = false; } }
  function checked() { return Array.prototype.map.call(document.querySelectorAll('#tab-trash .tr50-ck:checked'), function (c) { return Number(c.value); }); }

  function onClick(e) {
    var t = e.target; if (!t || !t.closest) return;
    if (t.closest('#tr50-restore')) return run(async function () {
      var ids = checked(); if (!ids.length) return toast('اختار بنود الأول');
      var r = await sbClient.rpc('trash_restore', { ids: ids });
      if (r.error) return toast('فشل الاسترجاع: ' + r.error.message, 'error');
      toast('اترجّع ' + r.data + ' بند'); await refreshApp(); await load();
    });
    if (t.closest('#tr50-purge')) return run(async function () {
      if (!confirm('هيتمسح نهائياً كل اللي عدّى عليه 30 يوم في السلة. متأكد؟')) return;
      var r = await sbClient.rpc('trash_purge');
      if (r.error) return toast('فشل المسح: ' + r.error.message, 'error');
      toast('اتمسح ' + r.data + ' بند نهائياً'); await load();
    });
    if (t.closest('#ar50-backup')) { if (typeof window.backupAll === 'function') window.backupAll(); else toast('النسخة الاحتياطية مش متاحة'); return; }
    if (t.closest('#ar50-preview')) return run(async function () {
      var d = $('ar50-date').value; if (!d) return toast('اختار تاريخ');
      var r = await sbClient.rpc('archive_preview', { cutoff: d });
      if (r.error) return toast('فشلت المعاينة: ' + r.error.message, 'error');
      $('ar50-out').textContent = 'هيتأرشف ' + r.data + ' بند (قبل ' + d + ').';
      $('ar50-confirm').classList.toggle('hidden', !r.data);
    });
    if (t.closest('#ar50-run')) return run(async function () {
      if ($('ar50-word').value.trim() !== 'أرشفة') return toast('اكتب كلمة التأكيد بالظبط: أرشفة');
      var d = $('ar50-date').value;
      var r = await sbClient.rpc('archive_old_lines', { cutoff: d });
      if (r.error) return toast('فشلت الأرشفة: ' + r.error.message, 'error');
      $('ar50-out').textContent = 'تمت أرشفة ' + r.data + ' بند.'; $('ar50-confirm').classList.add('hidden'); $('ar50-word').value = '';
      await refreshApp();
    });
  }

  function placeBtn(btn) {
    var menu = $('nav-menu'); if (!menu) return;
    var body = menu.querySelector(':scope > section[data-mg="admin"] .mg-body');
    if (body) { btn.dataset.mgi = '7'; if (btn.parentElement !== body) body.appendChild(btn); return; }
    var foot = menu.querySelector(':scope > .r-logout-menu');
    if (foot) menu.insertBefore(btn, foot); else menu.appendChild(btn);
  }
  function remove() { var b = $('tab-trash-btn'), p = $('tab-trash'); if (b) b.remove(); if (p) p.remove(); }
  function ensure() {
    if (!isMgr()) { remove(); return false; }
    if (!$('tab-trash')) {
      var main = document.querySelector('main'); if (!main) return false;
      var pane = document.createElement('div'); pane.id = 'tab-trash'; pane.className = 'hidden space-y-4';
      var host = $('tab-status') || $('tab-partners') || $('tab-couriers') || $('tab-notes') || main.lastElementChild;
      if (host) host.insertAdjacentElement('afterend', pane); else main.appendChild(pane);
      pane.addEventListener('click', onClick);
      pane.addEventListener('change', function (e) {
        if (e.target && e.target.id === 'tr50-all') pane.querySelectorAll('.tr50-ck').forEach(function (c) { c.checked = e.target.checked; });
      });
    }
    if (!$('tab-trash-btn') && $('nav-menu')) {
      var b = document.createElement('button'); b.id = 'tab-trash-btn'; b.type = 'button';
      b.setAttribute('data-tab-target', 'trash'); b.className = BTN_OFF; b.setAttribute('onclick', "switchTab('trash')");
      b.innerHTML = '<i class="fa-solid fa-trash-can-arrow-up text-amber-500"></i><span>السلة والأرشفة</span>';
      placeBtn(b);
    }
    return true;
  }

  wrap('switchTab', function (orig) {
    return function (id) {
      if (id === 'trash' && !isMgr()) { toast('الصفحة دي للمدير بس'); return; }
      var res = orig.apply(this, arguments);
      try {
        ensure();
        var on = id === 'trash' && isMgr(), pane = $('tab-trash'), btn = $('tab-trash-btn');
        if (pane) pane.classList.toggle('hidden', !on);
        if (btn) btn.className = on ? BTN_ON : BTN_OFF;
        if (on) { var sec = btn && btn.closest('.mg'); if (sec && !sec.classList.contains('open')) sec.classList.add('open'); load(); }
      } catch (e) { /* */ }
      return res;
    };
  });
  wrap('loadInitialData', function (orig) {
    return async function () { var r = await orig.apply(this, arguments); try { ensure(); } catch (e) { /* */ } return r; };
  });
  wrap('handleLogout', function (orig) {
    return function () { try { rows = []; remove(); } catch (e) { /* */ } return orig.apply(this, arguments); };
  });
})();
