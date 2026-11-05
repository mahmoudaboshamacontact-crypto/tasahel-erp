/* =====================================================================
   الجزء هـ: المرحلة 6 العملاء والنمو (js/54-clients-growth.js)
   الفيتشرز:
   - (21) قايمة تجديدات قادمة (تحديد تاريخ انتهاء/تجديد الخدمات وتنبيه قبل الموعد مع رسالة واتساب).
   - (22) ملف عميل شامل 360° (إجمالي الإنفاق، أول وآخر تعامل، الخدمات المفضلة، الملاحظات، والتجديدات).
   - (23) تصنيف وعلامات للعملاء (VIP، شركة، متكرر، عادي + وسوم مخصصة وملاحظات محفوظة).
   - (25) دمج العملاء المكررين (اكتشاف الأسماء/الأرقام المكررة وتوحيدها بضغطة للمدير عبر merge_duplicate_clients).
   - (26) قايمة اتصال يومية (الطلبات الجاهزة للتسليم، قيد المراجعة، التجديدات، ومتابعة ما بعد التسليم مع تسجيل نتيجة الاتصال).
   - (29) استبيان رضا العملاء (تقييم 1 إلى 5 نجوم وتعليق العميل بعد التسليم ومؤشر الرضا العام).
   ملاحظة أمنية: فيتشر (28) صفحة التتبع العامة مبنية في ملف SQL منفصل فقط (sql/part-e-public-tracking-28.sql)
   ولم يتم نشرها في الواجهة لحين مراجعة Claude الأمنية أولاً.
   SQL: sql/part-e-clients-growth.sql
   ===================================================================== */
(function () {
  'use strict';
  if (window.__phase54ClientsGrowth) return;
  window.__phase54ClientsGrowth = true;

  var $ = function (id) { return document.getElementById(id); };
  var eh = function (s) {
    return typeof escapeHtml === 'function'
      ? escapeHtml(s)
      : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
          return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
  };
  var num = function (v) { return Number(v) || 0; };
  var isPartner = function () {
    return window.__role === 'partner' || (document.body && document.body.classList.contains('is-partner-mode'));
  };
  var isMgr = function () {
    if (isPartner()) return false;
    if (window.__role) return window.__role === 'manager';
    try { return typeof canEditTx === 'function' && !!canEditTx(); } catch (e) { return false; }
  };
  var toast = function (m, t, ms) {
    if (typeof showToast === 'function') showToast(m, t || 'success', ms);
  };
  var showErr = function (prefix, err) {
    if (typeof showError === 'function') showError(prefix, err);
    else toast(prefix + ': ' + ((err && (err.message || err.details)) || err), 'error');
  };
  var wrap = function (name, make) {
    var o = window[name];
    if (typeof o !== 'function') return;
    window[name] = make(o);
  };

  var BTN_ON = 'tab-btn bg-ink text-white dark:bg-brand-600 shadow-sm';
  var BTN_OFF = 'tab-btn text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800';

  /* مدد التجديد الافتراضية بالأشهر للخدمات الحكومية الدورية */
  var RENEWABLE_SERVICE_RULES = [
    { pattern: /فيش|صحيفة حالة/i, months: 3, label: 'فيش وتشبيه (3 شهور)' },
    { pattern: /شهادة صحية|كشف طبي/i, months: 12, label: 'شهادة صحية (سنة)' },
    { pattern: /تصريح عمل/i, months: 12, label: 'تصريح عمل (سنة)' },
    { pattern: /إقامة|اقامة/i, months: 12, label: 'إقامة (سنة)' },
    { pattern: /سجل تجاري/i, months: 60, label: 'سجل تجاري (5 سنوات)' },
    { pattern: /بطاقة ضريبية/i, months: 60, label: 'بطاقة ضريبية (5 سنوات)' },
    { pattern: /رخصةتسيير|رخصة سيارة|تجديد رخصة/i, months: 12, label: 'رخصة (سنة)' },
    { pattern: /بطاقة رقم قومي/i, months: 84, label: 'بطاقة رقم قومي (7 سنوات)' },
    { pattern: /جواز سفر/i, months: 84, label: 'جواز سفر (7 سنوات)' }
  ];

  var state = {
    subTab: 'directory', /* 'directory' | 'renewals' | 'call_list' | 'duplicates' | 'surveys' */
    q: '',
    tierFilter: 'all',
    renewalDaysWindow: 60,
    profilesMap: new Map(),
    callLogs: [],
    surveys: [],
    loadedAt: 0,
    busy: false
  };

  function todayIso() { return new Date().toLocaleDateString('en-CA'); }
  function getLines() {
    return (typeof allRequestLines !== 'undefined' && Array.isArray(allRequestLines)) ? allRequestLines : [];
  }
  function getOrders() {
    return (typeof groupedOrders !== 'undefined' && Array.isArray(groupedOrders)) ? groupedOrders : [];
  }
  function normAr(s) {
    return typeof normName === 'function'
      ? normName(s)
      : String(s || '').trim().toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ');
  }
  function cleanPhone(p) {
    return String(p || '').replace(/\D/g, '');
  }
  function clientKeyOf(name, phone) {
    var ph = cleanPhone(phone);
    if (ph.length >= 9) return 'ph:' + ph.slice(-10);
    return 'nm:' + normAr(name);
  }

  /* تحميل بيانات العملاء والتجديدات والاتصالات والاستبيانات من Supabase عند فتح التاب فقط */
  async function loadClientsGrowthRemoteData(force) {
    if (!sbClient || !currentUser) return;
    if (!force && Date.now() - state.loadedAt < 60000) return;
    state.loadedAt = Date.now();

    try {
      var queries = [
        sbClient.from('client_profiles').select('*').limit(500),
        sbClient.from('daily_call_logs').select('*').eq('call_date', todayIso()).order('created_at', { ascending: false }).limit(200),
        sbClient.from('client_satisfaction_surveys').select('*').order('created_at', { ascending: false }).limit(200)
      ];
      var res = await Promise.all(queries.map(function (p) {
        return p.catch(function (e) { return { error: e }; });
      }));
      if (res[0] && !res[0].error && Array.isArray(res[0].data)) {
        var pm = new Map();
        res[0].data.forEach(function (r) {
          if (r && r.client_key) pm.set(r.client_key, r);
          if (r && r.client_name) pm.set('nm:' + normAr(r.client_name), r);
        });
        state.profilesMap = pm;
      }
      if (res[1] && !res[1].error && Array.isArray(res[1].data)) state.callLogs = res[1].data;
      if (res[2] && !res[2].error && Array.isArray(res[2].data)) state.surveys = res[2].data;
    } catch (e) { /* */ }
  }

  /* =====================================================================
     1) تجميع دليل العملاء الشامل + التصنيف والعلامات (22، 23)
     ===================================================================== */
  function buildClientsDirectory() {
    var map = new Map();
    getLines().forEach(function (l) {
      if (!l || !l.client_name) return;
      var k = clientKeyOf(l.client_name, l.phone);
      var c = map.get(k);
      var dStr = String(typeof lineDate === 'function' ? lineDate(l) : (l.received_at || l.created_at || '')).slice(0, 10);
      if (!c) {
        c = {
          key: k,
          name: l.client_name.trim(),
          phone: l.phone || '',
          address: l.address || '',
          totalSpent: 0,
          txSet: new Set(),
          linesCount: 0,
          openCount: 0,
          readyCount: 0,
          firstDate: dStr,
          lastDate: dStr,
          servicesMap: new Map()
        };
        map.set(k, c);
      }
      if (!c.phone && l.phone) c.phone = l.phone;
      if (!c.address && l.address) c.address = l.address;
      c.totalSpent += num(l.total);
      c.linesCount += Math.max(1, num(l.qty) || 1);
      if (l.transaction_id) c.txSet.add(String(l.transaction_id));
      var st = l.status || 'In Progress';
      if (st !== 'Delivered') c.openCount++;
      if (st === 'Complete') c.readyCount++;
      if (dStr && (!c.firstDate || dStr < c.firstDate)) c.firstDate = dStr;
      if (dStr && (!c.lastDate || dStr > c.lastDate)) c.lastDate = dStr;
      var svc = (l.service || '').trim();
      if (svc) c.servicesMap.set(svc, (c.servicesMap.get(svc) || 0) + 1);
    });

    return Array.from(map.values()).map(function (c) {
      var saved = state.profilesMap.get(c.key) || state.profilesMap.get('nm:' + normAr(c.name));
      var txCount = c.txSet.size;
      var autoTier = (c.totalSpent >= 10000 || txCount >= 5) ? 'VIP' : (/شركة|مؤسسة|مكتب|مصنع/i.test(c.name) ? 'شركة' : (txCount >= 2 ? 'متكرر' : 'عادي'));
      var tier = (saved && saved.tier) || autoTier;
      var tags = (saved && Array.isArray(saved.tags)) ? saved.tags : [];
      var notes = (saved && saved.notes) || '';
      var topServices = Array.from(c.servicesMap.entries()).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 3).map(function (e) { return e[0]; });
      return Object.assign({}, c, {
        txCount: txCount,
        tier: tier,
        tags: tags,
        notes: notes,
        topServices: topServices
      });
    }).sort(function (a, b) { return b.totalSpent - a.totalSpent; });
  }

  window.p54SaveClientProfileModal = async function (ev) {
    if (ev && ev.preventDefault) ev.preventDefault();
    var key = ($('p54-cp-key') && $('p54-cp-key').value) || '';
    var name = ($('p54-cp-name') && $('p54-cp-name').value.trim()) || '';
    var phone = ($('p54-cp-phone') && $('p54-cp-phone').value.trim()) || '';
    var tier = ($('p54-cp-tier') && $('p54-cp-tier').value) || 'عادي';
    var tagsRaw = ($('p54-cp-tags') && $('p54-cp-tags').value) || '';
    var notes = ($('p54-cp-notes') && $('p54-cp-notes').value.trim()) || '';
    if (!key || !name) return;

    var tags = tagsRaw.split(/[,،]+/).map(function (t) { return t.trim(); }).filter(Boolean);
    var rec = {
      client_key: key,
      client_name: name,
      phone: phone || null,
      tier: tier,
      tags: tags,
      notes: notes || null,
      updated_by: currentUser ? currentUser.id : null,
      updated_by_name: (typeof myProfile !== 'undefined' && myProfile && myProfile.full_name) || 'موظف',
      updated_at: new Date().toISOString()
    };

    state.profilesMap.set(key, rec);
    state.profilesMap.set('nm:' + normAr(name), rec);

    if (sbClient && currentUser) {
      var r = await sbClient.from('client_profiles').upsert(rec, { onConflict: 'client_key' });
      if (r.error && !/42P01|PGRST205|does not exist/i.test(r.error.message || '')) {
        return showErr('تعذّر حفظ تصنيف العميل', r.error);
      }
    }
    toast('تم حفظ تصنيف وعلامات وملاحظات العميل «' + name + '» ✓');
    var m = $('p54-edit-cp-modal');
    if (m) m.remove();
    renderClientsGrowthTab();
  };

  window.p54OpenClientEditModal = function (name, phone) {
    var k = clientKeyOf(name, phone);
    var saved = state.profilesMap.get(k) || state.profilesMap.get('nm:' + normAr(name)) || {};
    var old = $('p54-edit-cp-modal');
    if (old) old.remove();

    var ov = document.createElement('div');
    ov.id = 'p54-edit-cp-modal';
    ov.style.cssText = 'position:fixed;inset:0;z-index:2147483200;background:rgba(0,0,0,.68);display:flex;align-items:center;justify-content:center;padding:14px;direction:rtl';
    ov.innerHTML =
      '<div class="p54-card w-full max-w-md space-y-3 text-xs" style="background:var(--r-bg,#141210)" onclick="event.stopPropagation()">' +
        '<div class="flex items-center justify-between border-b pb-2.5" style="border-color:var(--r-line)">' +
          '<h3 class="font-bold text-sm">تصنيف وعلامات وملاحظات العميل</h3>' +
          '<button type="button" onclick="document.getElementById(\'p54-edit-cp-modal\').remove()" class="p54-btn !py-1 !px-2"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
        '<form onsubmit="p54SaveClientProfileModal(event)" class="space-y-3">' +
          '<input id="p54-cp-key" type="hidden" value="' + eh(k) + '">' +
          '<div><label class="label">اسم العميل</label><input id="p54-cp-name" readonly value="' + eh(name) + '" class="field"></div>' +
          '<div><label class="label">رقم الهاتف</label><input id="p54-cp-phone" value="' + eh(phone || '') + '" dir="ltr" class="field font-mono text-right"></div>' +
          '<div><label class="label">تصنيف العميل</label><select id="p54-cp-tier" class="field">' +
            ['VIP', 'شركة', 'متكرر', 'عادي', 'تنبيه'].map(function (t) {
              return '<option value="' + t + '"' + ((saved.tier || 'عادي') === t ? ' selected' : '') + '>' + t + '</option>';
            }).join('') +
          '</select></div>' +
          '<div><label class="label">علامات (Tags — افصل بفاصلة)</label><input id="p54-cp-tags" value="' + eh((saved.tags || []).join('، ')) + '" placeholder="مثال: عميل مميز، سفارات، شركة" class="field"></div>' +
          '<div><label class="label">ملاحظات دائمة على ملف العميل</label><textarea id="p54-cp-notes" rows="3" placeholder="ملاحظات تفضيلات العميل أو مواعيد تواصله..." class="field">' + eh(saved.notes || '') + '</textarea></div>' +
          '<div class="flex justify-end gap-2"><button type="submit" class="p54-btn p54-btn-pri"><i class="fa-solid fa-floppy-disk"></i><span>حفظ الملف</span></button></div>' +
        '</form>' +
      '</div>';
    ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
  };

  /* إثراء نافذة ملف العميل (#client-modal) بالتصنيف والعلامات والملاحظات والتجديدات */
  wrap('openClientModal', function (orig) {
    return function (name) {
      var res = orig.apply(this, arguments);
      try {
        var body = $('client-modal-body');
        if (!body || !name) return res;
        var allC = buildClientsDirectory();
        var cObj = allC.find(function (c) { return normAr(c.name) === normAr(name); });
        if (!cObj) return res;

        var extraBox = document.createElement('div');
        extraBox.className = 'p54-card space-y-2 text-xs mb-3';
        extraBox.innerHTML =
          '<div class="flex flex-wrap items-center justify-between gap-2">' +
            '<div class="flex flex-wrap items-center gap-1.5">' +
              '<span class="p54-pill p54-pill-vip"><i class="fa-solid fa-crown"></i>التصنيف: ' + eh(cObj.tier) + '</span>' +
              cObj.tags.map(function (t) { return '<span class="p54-pill p54-pill-ok">#' + eh(t) + '</span>'; }).join('') +
              '<span class="text-[11px]" style="color:var(--r-mute)">أول تعامل: ' + eh(cObj.firstDate) + ' · آخر تعامل: ' + eh(cObj.lastDate) + '</span>' +
            '</div>' +
            '<button type="button" onclick="p54OpenClientEditModal(\'' + eh(cObj.name) + '\',\'' + eh(cObj.phone) + '\')" class="p54-btn !py-1 !px-2.5 !text-[11px]"><i class="fa-solid fa-tags"></i><span>تعديل التصنيف والملاحظات</span></button>' +
          '</div>' +
          (cObj.notes ? '<div class="pt-1 text-amber-500 font-semibold"><i class="fa-solid fa-note-sticky ms-1"></i>ملاحظة العميل: ' + eh(cObj.notes) + '</div>' : '');

        body.insertBefore(extraBox, body.firstChild);
      } catch (e) { /* */ }
      return res;
    };
  });

  /* =====================================================================
     2) قايمة التجديدات القادمة (21)
     ===================================================================== */
  function computeUpcomingRenewals(windowDays) {
    var maxDays = num(windowDays) || 60;
    var todayMs = new Date(todayIso() + 'T00:00:00').getTime();
    var list = [];

    getLines().forEach(function (l) {
      if (!l) return;
      var renYmd = l.renewal_date ? String(l.renewal_date).slice(0, 10) : '';
      var ruleLabel = '';

      if (!renYmd) {
        var svc = (l.service || '').trim();
        var rule = RENEWABLE_SERVICE_RULES.find(function (r) { return r.pattern.test(svc); });
        if (!rule) return;
        ruleLabel = rule.label;
        var baseStr = String(l.delivered_date || l.received_at || l.created_at || '').slice(0, 10);
        if (!baseStr) return;
        var dt = new Date(baseStr + 'T00:00:00');
        if (isNaN(dt)) return;
        dt.setMonth(dt.getMonth() + rule.months);
        renYmd = dt.toLocaleDateString('en-CA');
      }

      var renMs = new Date(renYmd + 'T00:00:00').getTime();
      if (isNaN(renMs)) return;
      var diffDays = Math.round((renMs - todayMs) / 86400000);
      if (diffDays <= maxDays && diffDays >= -90) {
        list.push({
          line: l,
          renewalDate: renYmd,
          daysLeft: diffDays,
          ruleLabel: ruleLabel || 'موعد تجديد مسجل'
        });
      }
    });

    return list.sort(function (a, b) { return a.daysLeft - b.daysLeft; });
  }

  window.p54SetLineRenewalDate = async function (lineId, currentVal) {
    var nextDate = window.prompt('أدخل تاريخ التجديد القادم لهذا المستند (YYYY-MM-DD):', currentVal || todayIso());
    if (!nextDate || !/^\d{4}-\d{2}-\d{2}$/.test(nextDate.trim())) return;
    var clean = nextDate.trim();
    var l = getLines().find(function (x) { return String(x.id) === String(lineId); });
    if (l) l.renewal_date = clean;
    if (sbClient) {
      var r = await sbClient.from('request_lines').update({ renewal_date: clean }).eq('id', lineId);
      if (r.error && !/42703|PGRST204|does not exist/i.test(r.error.message || '')) {
        return showErr('تعذّر حفظ تاريخ التجديد', r.error);
      }
    }
    toast('تم حفظ تاريخ التجديد القادم (' + clean + ') ✓');
    renderClientsGrowthTab();
  };

  /* =====================================================================
     3) اكتشاف ودمج العملاء المكررين (25)
     ===================================================================== */
  function detectDuplicateClientGroups() {
    var byPhone = new Map();
    getLines().forEach(function (l) {
      var ph = cleanPhone(l.phone);
      var nm = (l.client_name || '').trim();
      if (ph.length < 9 || !nm) return;
      var key = ph.slice(-10);
      if (!byPhone.has(key)) byPhone.set(key, { phoneKey: key, phones: new Set(), names: new Set(), count: 0 });
      var g = byPhone.get(key);
      g.phones.add((l.phone || '').trim());
      g.names.add(nm);
      g.count++;
    });

    var groups = [];
    byPhone.forEach(function (g) {
      if (g.names.size > 1) {
        var namesArr = Array.from(g.names);
        var phonesArr = Array.from(g.phones).filter(Boolean);
        groups.push({
          primaryName: namesArr[0],
          primaryPhone: phonesArr[0] || '',
          allNames: namesArr,
          allPhones: phonesArr,
          linesCount: g.count
        });
      }
    });
    return groups;
  }

  window.p54MergeDuplicateGroup = async function (idx) {
    if (!isMgr()) return toast('دمج العملاء المكررين للمدير فقط', 'error');
    var groups = detectDuplicateClientGroups();
    var g = groups[idx];
    if (!g) return;
    var targetName = window.prompt('اختر الاسم الموحّد النهائي للعميل:', g.primaryName);
    if (!targetName || !targetName.trim()) return;
    var cleanTarget = targetName.trim();

    if (sbClient && currentUser) {
      var r = await sbClient.rpc('merge_duplicate_clients', {
        p_target_name: cleanTarget,
        p_target_phone: g.primaryPhone,
        p_source_names: g.allNames,
        p_source_phones: g.allPhones
      });
      if (r.error && !/42883|PGRST202|does not exist/i.test(r.error.message || '')) {
        return showErr('تعذّر دمج السجلات المكررة', r.error);
      }
    }

    getLines().forEach(function (l) {
      if (g.allNames.indexOf((l.client_name || '').trim()) !== -1) {
        l.client_name = cleanTarget;
        if (g.primaryPhone) l.phone = g.primaryPhone;
      }
    });
    if (typeof groupRequestsByTransaction === 'function') groupRequestsByTransaction();
    toast('تم دمج وتوحيد سجلات العميل تحت اسم «' + cleanTarget + '» ✓');
    renderClientsGrowthTab();
  };

  /* =====================================================================
     4) قايمة الاتصال اليومية (26) + استبيان رضا العملاء (29)
     ===================================================================== */
  function buildDailyCallList() {
    var calledTxs = new Set(state.callLogs.map(function (c) { return String(c.transaction_id || ''); }));
    var list = [];

    getOrders().forEach(function (o) {
      var st = typeof getOrderStatus === 'function' ? getOrderStatus(o) : 'In Progress';
      var tx = String(o.transaction_id);
      if (st === 'Complete') {
        list.push({
          tx: tx,
          client_name: o.client_name || '—',
          phone: o.phone || '',
          reason: 'إبلاغ بجاهزية المعاملة للاستلام',
          badgeCls: 'p54-pill-ok',
          called: calledTxs.has(tx),
          waMsg: 'أهلاً ' + (o.client_name || '') + '، نود إبلاغكم بأن معاملتكم رقم ' + tx + ' في تساهيل أصبحت جاهزة للتسليم.'
        });
      } else if (st === 'Under Review') {
        list.push({
          tx: tx,
          client_name: o.client_name || '—',
          phone: o.phone || '',
          reason: 'استكمال بيانات / مراجعة مع العميل',
          badgeCls: 'p54-pill-vip',
          called: calledTxs.has(tx),
          waMsg: 'أهلاً ' + (o.client_name || '') + '، بخصوص معاملتكم رقم ' + tx + ' في تساهيل، نرجو التواصل معنا لمراجعة بعض البيانات.'
        });
      }
    });

    return list.slice(0, 60);
  }

  window.p54RecordDailyCall = async function (tx, clientName, phone, reason) {
    var outcome = window.prompt('نتيجة الاتصال بالعميل «' + clientName + '»:', 'تم التواصل وتأكيد الموعد');
    if (outcome === null) return;
    var row = {
      call_date: todayIso(),
      client_name: clientName,
      phone: phone || null,
      transaction_id: tx,
      reason: reason,
      outcome: outcome.trim() || 'تم التواصل',
      called_by: currentUser ? currentUser.id : null,
      called_by_name: (typeof myProfile !== 'undefined' && myProfile && myProfile.full_name) || 'موظف',
      created_at: new Date().toISOString()
    };
    state.callLogs.unshift(row);
    if (sbClient && currentUser) {
      var r = await sbClient.from('daily_call_logs').insert(row);
      if (r.error && !/42P01|PGRST205|does not exist/i.test(r.error.message || '')) {
        return showErr('تعذّر تسجيل الاتصال', r.error);
      }
    }
    toast('تم تسجيل الاتصال بالعميل «' + clientName + '» ✓');
    renderClientsGrowthTab();
  };

  window.p54SaveSurvey = async function (ev) {
    if (ev && ev.preventDefault) ev.preventDefault();
    var tx = ($('p54-sv-tx') && $('p54-sv-tx').value.trim()) || '';
    var score = parseInt(($('p54-sv-score') && $('p54-sv-score').value) || '5', 10) || 5;
    var comment = ($('p54-sv-comment') && $('p54-sv-comment').value.trim()) || '';
    if (!tx) return toast('اختر رقم المعاملة أولاً', 'error');

    var o = getOrders().find(function (x) { return String(x.transaction_id) === tx; });
    var row = {
      transaction_id: tx,
      client_name: (o && o.client_name) || 'عميل',
      phone: (o && o.phone) || null,
      score: Math.max(1, Math.min(5, score)),
      comment: comment || null,
      recorded_by: currentUser ? currentUser.id : null,
      recorded_by_name: (typeof myProfile !== 'undefined' && myProfile && myProfile.full_name) || 'موظف',
      created_at: new Date().toISOString()
    };

    state.surveys = state.surveys.filter(function (s) { return s.transaction_id !== tx; });
    state.surveys.unshift(row);

    if (sbClient && currentUser) {
      var r = await sbClient.from('client_satisfaction_surveys').upsert(row, { onConflict: 'transaction_id' });
      if (r.error && !/42P01|PGRST205|does not exist/i.test(r.error.message || '')) {
        return showErr('تعذّر حفظ تقييم رضا العميل', r.error);
      }
    }
    if ($('p54-sv-comment')) $('p54-sv-comment').value = '';
    toast('تم حفظ تقييم رضا العميل (' + score + ' / 5) ✓');
    renderClientsGrowthTab();
  };

  /* =====================================================================
     5) بناء واجهة تاب «العملاء والنمو» (#tab-clients)
     ===================================================================== */
  window.p54SetSubTab = function (sub) {
    state.subTab = sub;
    renderClientsGrowthTab();
  };

  function renderClientsGrowthTab() {
    var pane = $('tab-clients');
    if (!pane) return;

    var allClients = buildClientsDirectory();
    var renewals = computeUpcomingRenewals(state.renewalDaysWindow);
    var callList = buildDailyCallList();
    var dupGroups = detectDuplicateClientGroups();
    var avgCsat = state.surveys.length
      ? (Math.round((state.surveys.reduce(function (s, x) { return s + num(x.score); }, 0) / state.surveys.length) * 10) / 10)
      : 5.0;

    var bodyHtml = '';

    if (state.subTab === 'directory') {
      var q = (state.q || '').trim().toLowerCase();
      var filtered = allClients.filter(function (c) {
        if (state.tierFilter !== 'all' && c.tier !== state.tierFilter) return false;
        if (q && !c.name.toLowerCase().includes(q) && !c.phone.includes(q) && !c.tags.join(' ').toLowerCase().includes(q)) return false;
        return true;
      });

      bodyHtml =
        '<div class="p54-card space-y-3">' +
          '<div class="flex flex-wrap items-center justify-between gap-2">' +
            '<input type="text" value="' + eh(state.q) + '" oninput="window.__p54SetFilter(\'q\',this.value)" placeholder="ابحث باسم العميل أو الموبايل أو العلامة..." class="field !w-64 max-w-full !py-1.5 text-xs">' +
            '<div class="flex flex-wrap items-center gap-1.5 text-xs">' +
              ['all:الكل', 'VIP:VIP', 'شركة:شركات', 'متكرر:متكرر', 'عادي:عادي'].map(function (item) {
                var p = item.split(':');
                return '<button type="button" onclick="window.__p54SetFilter(\'tier\',\'' + p[0] + '\')" class="p54-btn ' + (state.tierFilter === p[0] ? 'p54-btn-pri' : '') + ' !py-1 !px-2.5">' + p[1] + '</button>';
              }).join('') +
            '</div>' +
          '</div>' +
          '<div class="overflow-x-auto"><table class="p54-table"><thead><tr><th>العميل</th><th>التصنيف والعلامات</th><th>الموبايل</th><th>عدد المعاملات</th><th>إجمالي الإنفاق</th><th>آخر تعامل</th><th>أكثر الخدمات</th><th>إجراءات</th></tr></thead><tbody>' +
            filtered.slice(0, 80).map(function (c) {
              return '<tr>' +
                '<td class="font-bold"><button type="button" onclick="openClientModal(\'' + eh(c.name) + '\')" class="hover:underline text-right">' + eh(c.name) + '</button>' +
                  (c.notes ? '<div class="text-[11px] text-amber-500 mt-0.5">' + eh(c.notes) + '</div>' : '') +
                '</td>' +
                '<td><div class="flex flex-wrap gap-1"><span class="p54-pill ' + (c.tier === 'VIP' ? 'p54-pill-vip' : 'p54-pill-ok') + '">' + eh(c.tier) + '</span>' +
                  c.tags.map(function (t) { return '<span class="p54-pill">#' + eh(t) + '</span>'; }).join('') +
                '</div></td>' +
                '<td class="font-mono" dir="ltr">' + eh(c.phone || '—') + '</td>' +
                '<td class="font-mono font-bold">' + c.txCount + '</td>' +
                '<td class="font-mono font-bold" style="color:var(--r-acc)">' + eh(formatCurrency(c.totalSpent)) + '</td>' +
                '<td class="font-mono text-[11px]">' + eh(c.lastDate || '—') + '</td>' +
                '<td class="text-[11px]">' + eh(c.topServices.join('، ') || '—') + '</td>' +
                '<td><button type="button" onclick="p54OpenClientEditModal(\'' + eh(c.name) + '\',\'' + eh(c.phone) + '\')" class="p54-btn !py-1 !px-2.5 !text-[11px]"><i class="fa-solid fa-pen"></i><span>تصنيف</span></button></td>' +
              '</tr>';
            }).join('') +
          '</tbody></table></div>' +
        '</div>';
    } else if (state.subTab === 'renewals') {
      bodyHtml =
        '<div class="p54-card space-y-3">' +
          '<div class="flex flex-wrap items-center justify-between gap-2">' +
            '<div>' +
              '<h3 class="font-bold text-sm">قايمة التجديدات القادمة للمستندات والخدمات الدورية (21)</h3>' +
              '<p class="text-[11px]" style="color:var(--r-mute)">تكتشف تلقائياً الخدمات التي لها صلاحية وتحتاج تجديد (فيش، شهادة صحية، تصريح عمل، إقامة، رخصة، سجل تجاري) أو تاريخ التجديد المحدد يدوياً.</p>' +
            '</div>' +
            '<select onchange="window.__p54SetFilter(\'renDays\',this.value)" class="field !w-auto !py-1 text-xs">' +
              [30, 60, 90, 180].map(function (d) {
                return '<option value="' + d + '"' + (state.renewalDaysWindow === d ? ' selected' : '') + '>خلال ' + d + ' يوم قادم</option>';
              }).join('') +
            '</select>' +
          '</div>' +
          (renewals.length
            ? '<div class="overflow-x-auto"><table class="p54-table"><thead><tr><th>المعاملة</th><th>العميل والموبايل</th><th>الخدمة</th><th>تاريخ التجديد</th><th>المتبقي</th><th>إجراءات</th></tr></thead><tbody>' +
                renewals.slice(0, 80).map(function (r) {
                  var l = r.line;
                  var msg = 'أهلاً ' + (l.client_name || '') + '، نذكّركم من تساهيل باقتراب موعد تجديد خدمة «' + (l.service || '') + '» بتاريخ ' + r.renewalDate + '. يسعدنا خدمتكم.';
                  var wa = typeof waLink === 'function' ? waLink(l.phone, msg) : '';
                  return '<tr>' +
                    '<td class="font-mono" dir="ltr">' + eh(l.transaction_id) + '</td>' +
                    '<td><div class="font-bold">' + eh(l.client_name || '—') + '</div><div class="font-mono text-[11px]" dir="ltr">' + eh(l.phone || '—') + '</div></td>' +
                    '<td><div>' + eh(l.service) + '</div><div class="text-[10.5px]" style="color:var(--r-mute)">' + eh(r.ruleLabel) + '</div></td>' +
                    '<td class="font-mono font-bold">' + eh(r.renewalDate) + '</td>' +
                    '<td><span class="p54-pill ' + (r.daysLeft < 0 ? 'p54-pill-bad' : 'p54-pill-vip') + '">' + (r.daysLeft < 0 ? ('انتهت منذ ' + Math.abs(r.daysLeft) + ' يوم') : ('بعد ' + r.daysLeft + ' يوم')) + '</span></td>' +
                    '<td><div class="flex items-center gap-1.5">' +
                      '<button type="button" onclick="p54SetLineRenewalDate(\'' + eh(l.id) + '\',\'' + eh(r.renewalDate) + '\')" class="p54-btn !py-1 !px-2 !text-[11px]">تعديل التاريخ</button>' +
                      (wa ? '<a href="' + eh(wa) + '" target="_blank" rel="noopener" class="p54-btn p54-btn-pri !py-1 !px-2.5 !text-[11px]"><i class="fa-brands fa-whatsapp"></i><span>تذكير</span></a>' : '') +
                    '</div></td>' +
                  '</tr>';
                }).join('') +
              '</tbody></table></div>'
            : '<div class="py-8 text-center text-xs" style="color:var(--r-mute)">لا توجد تجديدات مستحقة خلال هذه الفترة.</div>') +
        '</div>';
    } else if (state.subTab === 'call_list') {
      bodyHtml =
        '<div class="p54-card space-y-3">' +
          '<h3 class="font-bold text-sm">قايمة الاتصال اليومية بالعملاء (26)</h3>' +
          (callList.length
            ? '<div class="overflow-x-auto"><table class="p54-table"><thead><tr><th>المعاملة</th><th>العميل</th><th>الهاتف</th><th>سبب الاتصال</th><th>الحالة</th><th>إجراءات</th></tr></thead><tbody>' +
                callList.map(function (c) {
                  var wa = typeof waLink === 'function' ? waLink(c.phone, c.waMsg) : '';
                  return '<tr>' +
                    '<td class="font-mono" dir="ltr"><button type="button" onclick="openTxModal(\'' + eh(c.tx) + '\')" class="rc-tx-pill !py-0.5 !px-2 !text-[11px]">' + eh(c.tx) + '</button></td>' +
                    '<td class="font-bold">' + eh(c.client_name) + '</td>' +
                    '<td class="font-mono" dir="ltr">' + eh(c.phone || '—') + '</td>' +
                    '<td><span class="p54-pill ' + c.badgeCls + '">' + eh(c.reason) + '</span></td>' +
                    '<td>' + (c.called ? '<span class="p54-pill p54-pill-ok">تم الاتصال اليوم ✓</span>' : '<span class="text-[11px]" style="color:var(--r-mute)">بانتظار الاتصال</span>') + '</td>' +
                    '<td><div class="flex items-center gap-1.5">' +
                      '<button type="button" onclick="p54RecordDailyCall(\'' + eh(c.tx) + '\',\'' + eh(c.client_name) + '\',\'' + eh(c.phone) + '\',\'' + eh(c.reason) + '\')" class="p54-btn !py-1 !px-2.5 !text-[11px]"><i class="fa-solid fa-phone-check"></i><span>تسجيل اتصال</span></button>' +
                      (wa ? '<a href="' + eh(wa) + '" target="_blank" rel="noopener" class="p54-btn p54-btn-pri !py-1 !px-2.5 !text-[11px]"><i class="fa-brands fa-whatsapp"></i></a>' : '') +
                    '</div></td>' +
                  '</tr>';
                }).join('') +
              '</tbody></table></div>'
            : '<div class="py-8 text-center text-xs" style="color:var(--r-mute)">قائمة الاتصال اليومية مكتملة ولا توجد معاملات معلقة للاتصال.</div>') +
        '</div>';
    } else if (state.subTab === 'duplicates') {
      bodyHtml =
        '<div class="p54-card space-y-3">' +
          '<h3 class="font-bold text-sm">اكتشاف ودمج العملاء المكررين (25)</h3>' +
          '<p class="text-[11px]" style="color:var(--r-mute)">يرصد العملاء المسجلين بنفس رقم الهاتف ولكن بأسماء مكتوبة بطرق مختلفة لتوحيد ملفهم المالي.</p>' +
          (dupGroups.length
            ? '<div class="space-y-2.5">' +
                dupGroups.map(function (g, idx) {
                  return '<div class="p54-card flex flex-wrap items-center justify-between gap-2 text-xs">' +
                    '<div>' +
                      '<div class="font-bold">رقم الهاتف: <span class="font-mono" dir="ltr">' + eh(g.primaryPhone) + '</span> (' + g.linesCount + ' بند)</div>' +
                      '<div class="mt-1" style="color:var(--r-mute)">الأسماء المسجلة: ' + g.allNames.map(function (n) { return '«' + eh(n) + '»'; }).join(' ، ') + '</div>' +
                    '</div>' +
                    (isMgr()
                      ? '<button type="button" onclick="p54MergeDuplicateGroup(' + idx + ')" class="p54-btn p54-btn-pri"><i class="fa-solid fa-object-group"></i><span>دمج في اسم موحّد</span></button>'
                      : '<span class="text-[11px]" style="color:var(--r-mute)">الدمج للمدير فقط</span>') +
                  '</div>';
                }).join('') +
              '</div>'
            : '<div class="py-8 text-center text-xs" style="color:var(--r-ok)">ممتاز! لا توجد سجلات عملاء مكررة حالياً.</div>') +
        '</div>';
    } else if (state.subTab === 'surveys') {
      var deliveredOrders = getOrders().filter(function (o) {
        return (typeof getOrderStatus === 'function' ? getOrderStatus(o) : '') === 'Delivered';
      });
      bodyHtml =
        '<div class="p54-card space-y-4">' +
          '<div class="flex flex-wrap items-center justify-between gap-2">' +
            '<div>' +
              '<h3 class="font-bold text-sm">استبيان رضا العملاء بعد التسليم (29)</h3>' +
              '<p class="text-[11px]" style="color:var(--r-mute)">متوسط تقييم العملاء العام: <b style="color:var(--r-acc)">★ ' + avgCsat + ' / 5</b> (' + state.surveys.length + ' تقييم مسجل)</p>' +
            '</div>' +
          '</div>' +
          '<form onsubmit="p54SaveSurvey(event)" class="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end text-xs border-b pb-4" style="border-color:var(--r-line)">' +
            '<div><label class="label">رقم المعاملة المسلمة</label><input id="p54-sv-tx" list="p54-sv-dl" required dir="ltr" placeholder="TX-2026-..." class="field font-mono text-right">' +
              '<datalist id="p54-sv-dl">' +
                deliveredOrders.slice(0, 60).map(function (o) { return '<option value="' + eh(o.transaction_id) + '">' + eh(o.client_name || '') + '</option>'; }).join('') +
              '</datalist>' +
            '</div>' +
            '<div><label class="label">تقييم العميل (من 5 نجوم)</label><select id="p54-sv-score" class="field">' +
              '<option value="5">★★★★★ (5 - ممتاز جداً)</option>' +
              '<option value="4">★★★★☆ (4 - جيد جداً)</option>' +
              '<option value="3">★★★☆☆ (3 - مقبول)</option>' +
              '<option value="2">★★☆☆☆ (2 - ضعيف)</option>' +
              '<option value="1">★☆☆☆☆ (1 - غير راضٍ)</option>' +
            '</select></div>' +
            '<div><label class="label">تعليق وملاحظة العميل</label><input id="p54-sv-comment" placeholder="رأي العميل في الخدمة..." class="field"></div>' +
            '<button type="submit" class="p54-btn p54-btn-pri !py-2"><i class="fa-solid fa-star"></i><span>حفظ التقييم</span></button>' +
          '</form>' +
          (state.surveys.length
            ? '<div class="overflow-x-auto"><table class="p54-table"><thead><tr><th>المعاملة</th><th>العميل</th><th>التقييم</th><th>ملاحظة العميل</th><th>التاريخ</th></tr></thead><tbody>' +
                state.surveys.map(function (s) {
                  return '<tr>' +
                    '<td class="font-mono" dir="ltr">' + eh(s.transaction_id) + '</td>' +
                    '<td class="font-bold">' + eh(s.client_name) + '</td>' +
                    '<td class="font-bold" style="color:var(--r-acc)">★ ' + s.score + ' / 5</td>' +
                    '<td>' + eh(s.comment || '—') + '</td>' +
                    '<td class="font-mono text-[11px]">' + eh(String(s.created_at || '').slice(0, 10)) + '</td>' +
                  '</tr>';
                }).join('') +
              '</tbody></table></div>'
            : '<div class="py-4 text-center text-xs" style="color:var(--r-mute)">لم تُسجّل استبيانات بعد.</div>') +
        '</div>';
    }

    pane.innerHTML =
      '<div class="p54-wrap space-y-4">' +
        '<div class="p54-card flex flex-wrap items-center justify-between gap-3">' +
          '<div>' +
            '<h2 class="font-bold text-base sm:text-lg text-ink dark:text-white flex items-center gap-2">' +
              '<i class="fa-solid fa-users-gear" style="color:var(--r-acc,#ff9d6c)"></i>' +
              '<span>العملاء والنمو والتجديدات</span>' +
            '</h2>' +
            '<p class="text-xs mt-0.5" style="color:var(--r-mute)">ملف العميل الشامل، التصنيف والعلامات، التجديدات القادمة، قايمة الاتصال اليومية، دمج المكررين، واستبيان الرضا</p>' +
          '</div>' +
          '<div class="p54-kpi-grid !grid-cols-3 sm:!w-auto">' +
            '<div class="p54-kpi !py-2 !px-3"><div class="p54-kpi-lbl">إجمالي العملاء</div><div class="p54-kpi-val !text-sm">' + allClients.length + '</div></div>' +
            '<div class="p54-kpi !py-2 !px-3"><div class="p54-kpi-lbl">تجديدات قريبة</div><div class="p54-kpi-val !text-sm" style="color:var(--r-acc)">' + renewals.length + '</div></div>' +
            '<div class="p54-kpi !py-2 !px-3"><div class="p54-kpi-lbl">رضا العملاء</div><div class="p54-kpi-val !text-sm" style="color:var(--r-ok)">★ ' + avgCsat + '</div></div>' +
          '</div>' +
        '</div>' +

        '<div class="p54-subnav">' +
          '<button type="button" class="' + (state.subTab === 'directory' ? 'is-on' : '') + '" onclick="p54SetSubTab(\'directory\')"><i class="fa-solid fa-address-book ms-1"></i>ملف العملاء الشامل والتصنيف (' + allClients.length + ')</button>' +
          '<button type="button" class="' + (state.subTab === 'renewals' ? 'is-on' : '') + '" onclick="p54SetSubTab(\'renewals\')"><i class="fa-solid fa-calendar-plus ms-1"></i>قايمة التجديدات (' + renewals.length + ')</button>' +
          '<button type="button" class="' + (state.subTab === 'call_list' ? 'is-on' : '') + '" onclick="p54SetSubTab(\'call_list\')"><i class="fa-solid fa-phone-volume ms-1"></i>قايمة الاتصال اليومية (' + callList.length + ')</button>' +
          '<button type="button" class="' + (state.subTab === 'duplicates' ? 'is-on' : '') + '" onclick="p54SetSubTab(\'duplicates\')"><i class="fa-solid fa-object-group ms-1"></i>دمج المكررين (' + dupGroups.length + ')</button>' +
          '<button type="button" class="' + (state.subTab === 'surveys' ? 'is-on' : '') + '" onclick="p54SetSubTab(\'surveys\')"><i class="fa-solid fa-face-smile ms-1"></i>استبيان الرضا</button>' +
        '</div>' +

        bodyHtml +
      '</div>';
  }

  window.__p54SetFilter = function (k, v) {
    if (k === 'q') state.q = v || '';
    if (k === 'tier') state.tierFilter = v || 'all';
    if (k === 'renDays') state.renewalDaysWindow = parseInt(v, 10) || 60;
    renderClientsGrowthTab();
  };

  function placeBtn(btn) {
    var menu = $('nav-menu');
    if (!menu) return;
    var followBody = menu.querySelector(':scope > section[data-mg="follow"] .mg-body') ||
                     menu.querySelector(':scope > section[data-mg="admin"] .mg-body');
    if (followBody) {
      btn.dataset.mgi = '6';
      if (btn.parentElement !== followBody) followBody.appendChild(btn);
      return;
    }
    var foot = menu.querySelector(':scope > .r-logout-menu');
    if (foot) menu.insertBefore(btn, foot);
    else menu.appendChild(btn);
  }

  function remove() {
    var b = $('tab-clients-btn'), p = $('tab-clients');
    if (b) b.remove();
    if (p) p.remove();
  }

  function ensure() {
    if (isPartner()) { remove(); return false; }
    if (!$('tab-clients')) {
      var main = document.querySelector('main');
      if (!main) return false;
      var pane = document.createElement('div');
      pane.id = 'tab-clients';
      pane.className = 'hidden space-y-4';
      var host = $('tab-search') || $('tab-notes') || main.lastElementChild;
      if (host) host.insertAdjacentElement('afterend', pane);
      else main.appendChild(pane);
    }
    if (!$('tab-clients-btn') && $('nav-menu')) {
      var b = document.createElement('button');
      b.id = 'tab-clients-btn';
      b.type = 'button';
      b.setAttribute('data-tab-target', 'clients');
      b.className = BTN_OFF;
      b.setAttribute('onclick', "switchTab('clients')");
      b.innerHTML = '<i class="fa-solid fa-users-gear text-amber-500"></i><span>العملاء والنمو</span>';
      placeBtn(b);
    }
    return true;
  }

  wrap('switchTab', function (orig) {
    return function (id) {
      var res = orig.apply(this, arguments);
      try {
        ensure();
        var on = id === 'clients' && !isPartner();
        var pane = $('tab-clients'), btn = $('tab-clients-btn');
        if (pane) pane.classList.toggle('hidden', !on);
        if (btn) btn.className = on ? BTN_ON : BTN_OFF;
        if (on) {
          var sec = btn && btn.closest('.mg');
          if (sec && !sec.classList.contains('open')) sec.classList.add('open');
          loadClientsGrowthRemoteData(false).then(renderClientsGrowthTab);
        }
      } catch (e) { /* */ }
      return res;
    };
  });

  wrap('loadInitialData', function (orig) {
    return async function () {
      var r = await orig.apply(this, arguments);
      try { ensure(); } catch (e) { /* */ }
      return r;
    };
  });

  wrap('handleLogout', function (orig) {
    return function () {
      try {
        state.profilesMap = new Map();
        state.callLogs = [];
        state.surveys = [];
        remove();
      } catch (e) { /* */ }
      return orig.apply(this, arguments);
    };
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { try { ensure(); } catch (e) { /* */ } });
  } else {
    try { ensure(); } catch (e) { /* */ }
  }
})();
