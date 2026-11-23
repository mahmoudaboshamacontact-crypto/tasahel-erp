/* =====================================================================
   js/79-courier-geo-weather.js
   - توجيه خط السير ووقت الوصول الحقيقي (Geoapify Routing API)
   - تحويل إحداثيات GPS لاسم شارع ومنطقة تلقائياً (Geoapify Reverse Geocoding)
   - تنبيهات الطقس للمناديب (Open-Meteo Weather API) مع كاش ساعة واحدة
   - عدادات الاستهلاك اليومي داخل صفحة "حالة النظام" (#tab-status) بدون لمس js/48
   ===================================================================== */
(function () {
  'use strict';
  if (window.TasahelGeo) return;

  var GEOAPIFY_KEY = '4d922dd45aad4da7b64323d0ebd44a24';
  var TZ = 'Africa/Cairo';
  var USAGE_KEY = 'ts_api_usage_v1';
  var REV_CACHE_KEY = 'ts_geo_rev_cache_v1';
  var ROUTE_CACHE_KEY = 'ts_geo_route_cache_v1';
  var WEATHER_CACHE_KEY = 'ts_weather_cache_v1';

  function cairoDay() {
    try {
      return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
    } catch (e) {
      return new Date().toISOString().slice(0, 10);
    }
  }

  function loadUsage() {
    var today = cairoDay();
    try {
      var raw = JSON.parse(localStorage.getItem(USAGE_KEY) || 'null');
      if (raw && raw.day === today) return raw;
    } catch (e) {}
    return { day: today, geoapify_routing: 0, geoapify_reverse: 0, open_meteo: 0 };
  }

  function saveUsage(u) {
    try { localStorage.setItem(USAGE_KEY, JSON.stringify(u)); } catch (e) {}
  }

  function bumpUsage(field, amount) {
    var u = loadUsage();
    u[field] = (Number(u[field]) || 0) + (Number(amount) || 1);
    saveUsage(u);
    return u;
  }

  function fetchWithTimeout(url, ms) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, ms || 5500) : null;
    return fetch(url, ctrl ? { signal: ctrl.signal } : {}).finally(function () {
      if (timer) clearTimeout(timer);
    });
  }

  function readJsonLS(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') || fallback; } catch (e) { return fallback; }
  }
  function writeJsonLS(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  /* 1) تحويل GPS لاسم شارع ومنطقة (مكالمة واحدة لكل إحداثي + كاش دائم) */
  async function reverseGeocode(lat, lng) {
    var la = Number(lat), ln = Number(lng);
    if (!isFinite(la) || !isFinite(ln)) return '';
    var coordKey = la.toFixed(4) + ',' + ln.toFixed(4);
    var cache = readJsonLS(REV_CACHE_KEY, {});
    if (cache[coordKey] && cache[coordKey].label) {
      return cache[coordKey].label;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return '';
    try {
      var url = 'https://api.geoapify.com/v1/geocode/reverse?lat=' + encodeURIComponent(la) +
        '&lon=' + encodeURIComponent(ln) + '&lang=ar&apiKey=' + encodeURIComponent(GEOAPIFY_KEY);
      var res = await fetchWithTimeout(url, 5500);
      bumpUsage('geoapify_reverse', 1);
      if (!res.ok) return '';
      var data = await res.json();
      var feat = data && data.features && data.features[0];
      var p = feat && feat.properties;
      if (!p) return '';
      var parts = [];
      if (p.street) parts.push(p.street);
      if (p.suburb || p.district || p.quarter) parts.push(p.suburb || p.district || p.quarter);
      else if (p.city || p.county) parts.push(p.city || p.county);
      var label = parts.filter(Boolean).join(' — ') || p.formatted || '';
      if (label) {
        var keys = Object.keys(cache);
        if (keys.length > 140) delete cache[keys[0]];
        cache[coordKey] = { label: label, at: Date.now() };
        writeJsonLS(REV_CACHE_KEY, cache);
      }
      return label;
    } catch (e) {
      return '';
    }
  }

  /* 2) حساب المسافة والوقت الحقيقي للطريق (Geoapify Routing API + كاش 10 دقائق) */
  async function calcRouteEta(waypoints) {
    if (!Array.isArray(waypoints) || waypoints.length < 2) return null;
    var clean = waypoints.filter(function (w) { return w && isFinite(Number(w.lat)) && isFinite(Number(w.lng)); });
    if (clean.length < 2) return null;
    var wpStr = clean.slice(0, 15).map(function (w) { return Number(w.lat).toFixed(4) + ',' + Number(w.lng).toFixed(4); }).join('|');
    var cache = readJsonLS(ROUTE_CACHE_KEY, {});
    var hit = cache[wpStr];
    if (hit && hit.data && hit.data.legsMin && (Date.now() - hit.at) < 10 * 60 * 1000) {
      return hit.data;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
    try {
      var url = 'https://api.geoapify.com/v1/routing?waypoints=' + encodeURIComponent(wpStr) +
        '&mode=drive&apiKey=' + encodeURIComponent(GEOAPIFY_KEY);
      var res = await fetchWithTimeout(url, 6500);
      var legs = Math.max(1, clean.slice(0, 15).length - 1);
      bumpUsage('geoapify_routing', legs);
      if (!res.ok) return null;
      var data = await res.json();
      var feat = data && data.features && data.features[0];
      var props = feat && feat.properties;
      if (!props) return null;
      var km = Math.round((Number(props.distance) || 0) / 100) / 10;
      var min = Math.max(1, Math.round((Number(props.time) || 0) / 60));
      var legsMin = Array.isArray(props.legs) ? props.legs.map(function (lg) { return Math.max(1, Math.round((Number(lg && lg.time) || 0) / 60)); }) : [];
      var out = { km: km, min: min, stops: clean.length, legsMin: legsMin };
      cache = {}; // نحتفظ بآخر مسار فقط عشان localStorage يفضل خفيف
      cache[wpStr] = { at: Date.now(), data: out };
      writeJsonLS(ROUTE_CACHE_KEY, cache);
      return out;
    } catch (e) {
      return null;
    }
  }

  /* 3) تنبيهات الطقس للمناديب (Open-Meteo + كاش ساعة واحدة) */
  function weatherLabel(code, temp, wind, rain) {
    if (rain > 0.2 || (code >= 51 && code <= 67) || (code >= 80 && code <= 99)) {
      return { icon: '🌧️', text: 'احتمال أمطار (' + Math.round(temp) + '°م) — خلي بالك على الطريق والورق', level: 'wn' };
    }
    if (wind >= 35) {
      return { icon: '💨', text: 'رياح نشطة ' + Math.round(wind) + ' كم/س (' + Math.round(temp) + '°م)', level: 'wn' };
    }
    if (temp >= 38) {
      return { icon: '☀️', text: 'حرارة مرتفعة ' + Math.round(temp) + '°م — اشرب مياه باستمرار', level: 'wn' };
    }
    if (temp <= 13) {
      return { icon: '🧥', text: 'جو بارد ' + Math.round(temp) + '°م — القاهرة والجيزة', level: 'ok' };
    }
    return { icon: '🌤️', text: 'الطقس مناسب للتحرك · ' + Math.round(temp) + '°م (القاهرة/الجيزة)', level: 'ok' };
  }

  async function getWeather(lat, lng) {
    var la = isFinite(Number(lat)) ? Number(lat) : 30.0444;
    var ln = isFinite(Number(lng)) ? Number(lng) : 31.2357;
    var cached = readJsonLS(WEATHER_CACHE_KEY, null);
    if (cached && cached.at && (Date.now() - cached.at) < 60 * 60 * 1000 && cached.data) {
      return cached.data;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return cached && cached.data ? cached.data : null;
    try {
      var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + la.toFixed(3) + '&longitude=' + ln.toFixed(3) +
        '&current=temperature_2m,precipitation,wind_speed_10m,weather_code&timezone=Africa%2FCairo';
      var res = await fetchWithTimeout(url, 5000);
      bumpUsage('open_meteo', 1);
      if (!res.ok) return null;
      var json = await res.json();
      var cur = json && json.current;
      if (!cur) return null;
      var info = weatherLabel(Number(cur.weather_code) || 0, Number(cur.temperature_2m) || 0, Number(cur.wind_speed_10m) || 0, Number(cur.precipitation) || 0);
      writeJsonLS(WEATHER_CACHE_KEY, { at: Date.now(), data: info });
      return info;
    } catch (e) {
      return cached && cached.data ? cached.data : null;
    }
  }

  var weatherInflight = false;
  function hydrateWeatherSlot(slotEl, lat, lng) {
    if (!slotEl) return;
    var cached = readJsonLS(WEATHER_CACHE_KEY, null);
    if (cached && cached.data) {
      slotEl.innerHTML = '<div class="cpn-weather ' + (cached.data.level === 'wn' ? 'wn' : '') + '"><span>' + cached.data.icon + '</span><span>' + cached.data.text + '</span></div>';
      if ((Date.now() - cached.at) < 60 * 60 * 1000) return;
    }
    if (weatherInflight) return;
    weatherInflight = true;
    getWeather(lat, lng).then(function (info) {
      weatherInflight = false;
      if (info && slotEl && document.body.contains(slotEl)) {
        slotEl.innerHTML = '<div class="cpn-weather ' + (info.level === 'wn' ? 'wn' : '') + '"><span>' + info.icon + '</span><span>' + info.text + '</span></div>';
      }
    }).catch(function () { weatherInflight = false; });
  }

  /* 4) عدادات الاستهلاك اليومي داخل صفحة "حالة النظام" (#tab-status) بدون تعديل js/48 */
  function renderStatusApiCard() {
    var tab = document.getElementById('tab-status');
    if (!tab || tab.classList.contains('hidden')) return;
    var container = tab.firstElementChild || tab;
    if (!container) return;

    var u = loadUsage();
    var geoTotal = (Number(u.geoapify_routing) || 0) + (Number(u.geoapify_reverse) || 0);
    var geoMax = 3000;
    var geoPct = Math.min(100, Math.round((geoTotal / geoMax) * 1000) / 10);
    var metTotal = Number(u.open_meteo) || 0;
    var metMax = 10000;
    var metPct = Math.min(100, Math.round((metTotal / metMax) * 1000) / 10);

    var cardId = 'ts-api-limits-card';
    var card = document.getElementById(cardId);
    if (!card) {
      card = document.createElement('div');
      card.id = cardId;
      card.className = 'card p-4 sm:p-5 space-y-3 mt-4 border border-slate-200 dark:border-slate-800';
      container.appendChild(card);
    }

    var geoBarCls = geoPct < 60 ? 'bg-emerald-500' : (geoPct <= 85 ? 'bg-amber-500' : 'bg-rose-500');
    var metBarCls = metPct < 60 ? 'bg-emerald-500' : (metPct <= 85 ? 'bg-amber-500' : 'bg-rose-500');

    card.innerHTML =
      '<div class="flex flex-wrap items-center justify-between gap-2">' +
        '<div>' +
          '<h3 class="font-bold text-ink dark:text-white text-sm sm:text-base"><i class="fa-solid fa-gauge-high text-emerald-600 ms-1.5"></i>عدادات خدمات الخرائط والطقس اليومية (API Limits)</h3>' +
          '<p class="text-[11px] text-slate-500 dark:text-slate-400">تتجدد تلقائياً كل 24 ساعة · تاريخ العداد: <span class="font-mono">' + u.day + '</span></p>' +
        '</div>' +
        '<button type="button" id="ts-api-reset-btn" class="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">تصفير عداد اليوم</button>' +
      '</div>' +
      '<div class="grid grid-cols-1 md:grid-cols-2 gap-3">' +
        '<div class="rounded-xl border border-slate-200/80 dark:border-slate-700/80 p-3 space-y-2">' +
          '<div class="flex items-center justify-between text-xs font-bold">' +
            '<span class="text-ink dark:text-white">Geoapify (توجيه الطرق + تحويل العناوين)</span>' +
            '<span class="font-mono text-emerald-700 dark:text-emerald-300">' + geoTotal.toLocaleString('en-US') + ' / 3,000 رصيد</span>' +
          '</div>' +
          '<div class="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden"><div class="h-full ' + geoBarCls + '" style="width:' + Math.max(geoTotal ? 2 : 0, geoPct) + '%"></div></div>' +
          '<div class="flex flex-wrap justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">' +
            '<span>توجيه الطرق: <b>' + (Number(u.geoapify_routing) || 0) + '</b> · تحويل GPS: <b>' + (Number(u.geoapify_reverse) || 0) + '</b></span>' +
            '<span>المتبقي: <b>' + Math.max(0, geoMax - geoTotal).toLocaleString('en-US') + '</b> (' + (100 - geoPct).toFixed(1) + '%)</span>' +
          '</div>' +
        '</div>' +
        '<div class="rounded-xl border border-slate-200/80 dark:border-slate-700/80 p-3 space-y-2">' +
          '<div class="flex items-center justify-between text-xs font-bold">' +
            '<span class="text-ink dark:text-white">Open-Meteo (تنبيهات الطقس للمناديب)</span>' +
            '<span class="font-mono text-emerald-700 dark:text-emerald-300">' + metTotal.toLocaleString('en-US') + ' / 10,000 طلب</span>' +
          '</div>' +
          '<div class="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden"><div class="h-full ' + metBarCls + '" style="width:' + Math.max(metTotal ? 2 : 0, metPct) + '%"></div></div>' +
          '<div class="flex flex-wrap justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">' +
            '<span>كاش تلقائي كل ساعة لتقليل الطلبات</span>' +
            '<span>المتبقي: <b>' + Math.max(0, metMax - metTotal).toLocaleString('en-US') + '</b> (' + (100 - metPct).toFixed(1) + '%)</span>' +
          '</div>' +
        '</div>' +
      '</div>';

    var rbtn = document.getElementById('ts-api-reset-btn');
    if (rbtn && !rbtn.dataset.bound) {
      rbtn.dataset.bound = '1';
      rbtn.addEventListener('click', function () {
        saveUsage({ day: cairoDay(), geoapify_routing: 0, geoapify_reverse: 0, open_meteo: 0 });
        renderStatusApiCard();
      });
    }
  }

  function hookStatusTab() {
    var tab = document.getElementById('tab-status');
    if (!tab) return;
    renderStatusApiCard();
    if (!tab.dataset.apiObs && typeof MutationObserver !== 'undefined') {
      tab.dataset.apiObs = '1';
      var obs = new MutationObserver(function () {
        if (!tab.classList.contains('hidden')) {
          setTimeout(renderStatusApiCard, 120);
        }
      });
      obs.observe(tab, { attributes: true, attributeFilter: ['class'], childList: true });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hookStatusTab);
  else hookStatusTab();

  window.TasahelGeo = {
    reverseGeocode: reverseGeocode,
    calcRouteEta: calcRouteEta,
    getWeather: getWeather,
    hydrateWeatherSlot: hydrateWeatherSlot,
    getUsage: loadUsage,
    renderStatusApiCard: renderStatusApiCard
  };
})();
