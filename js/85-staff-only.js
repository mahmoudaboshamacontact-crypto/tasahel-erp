/* الموظفين التشغيليين: المناديب والشركاء (المديرين لا) ما يظهروش في فلتر الموظفين ولا في الأهداف/العمولات/مقارنة الأداء.
   - الأدوار من user_roles (المدير بس هو اللي يقدر يقرأها)، ولو ما اتحملتش الدالة بترجّع true (مفيش إخفاء بالغلط).
   - ملف مستقل: الملفات اللي بتعرض الموظفين بتسأل window.isOperatingStaff(profile) / window.isExcludedStaffName(name). */
(function () {
  'use strict';
  var hiddenIds = {}, hiddenNames = {}, loaded = false;
  var HIDE = { courier: 1, partner: 1 }; /* المديرين يفضلوا ظاهرين؛ بنخفي المناديب والشركاء بس */

  function norm(s) { return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase(); }

  window.isOperatingStaff = function (p) {
    if (!p) return false;
    if (!loaded) return true;
    return !hiddenIds[String(p.id)];
  };
  window.isExcludedStaffName = function (name) {
    return loaded && !!hiddenNames[norm(name)];
  };

  async function load() {
    try {
      if (typeof sbClient === 'undefined' || !sbClient || !(typeof currentUser !== 'undefined' && currentUser)) return;
      if (window.__role !== 'manager') return;
      var r = await sbClient.from('user_roles').select('user_id,role');
      if (r.error || !r.data) return;
      var ids = {};
      r.data.forEach(function (x) { if (HIDE[x.role]) ids[String(x.user_id)] = 1; });
      var cr = await sbClient.from('couriers').select('user_id,name');
      (cr.data || []).forEach(function (c) { if (c.user_id) ids[String(c.user_id)] = 1; if (c.name) hiddenNames[norm(c.name)] = 1; });
      var pr = await sbClient.from('profiles').select('id,full_name');
      (pr.data || []).forEach(function (p) { if (ids[String(p.id)] && p.full_name) hiddenNames[norm(p.full_name)] = 1; });
      hiddenIds = ids; loaded = true;
      ['renderRecentRequests'].forEach(function (fn) { if (typeof window[fn] === 'function') try { window[fn](); } catch (e) { /* */ } });
    } catch (e) { /* مش أساسي */ }
  }
  function boot() { load(); setTimeout(load, 8000); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 3000); });
  else setTimeout(boot, 3000);
})();
