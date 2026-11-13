/* =====================================================================
   69-home-clock.js | ساعة الشاشة الرئيسية القابلة للتخصيص
   - ساعة أنالوج (5 أشكال) + ساعة رقمية (5 أشكال) + طقس القاهرة + التاريخ الهجري
   - كل الإعدادات جوه أيقونة الترس: الأشكال والألوان والخلفية و12/24 وإظهار/إخفاء الكروت
   - الإعدادات بتتحفظ على الجهاز (localStorage) فكل موظف يختار على مزاجه
   - بدون أنيميشن دايم: التحديث كل ثانية للعقارب والنص اللي اتغير بس
   - نفس عنصر الويدجت بيفضل ثابت بين إعادات رسم الرئيسية (مفيش رمشة)
   ===================================================================== */
(function () {
  'use strict';
  if (window.__tsHomeClock) return; window.__tsHomeClock = true;

  /* ---------------- الإعدادات ---------------- */
  var KEY = 'ts_clock_cfg_v2';
  var DEF = { analog: 'glow', digital: 'bold', accent: '#ff7a3d', bg: '#1a130e', fmt: '12', seconds: true, weather: true, hijri: true };
  var ANALOGS = [['glow', 'متوهجة'], ['minimal', 'بسيطة'], ['roman', 'رومانية'], ['dots', 'نقاط'], ['bars', 'خطوط']];
  var DIGITALS = [['bold', 'عريضة'], ['mono', 'مونو'], ['boxes', 'مربعات'], ['outline', 'محفورة'], ['neon', 'نيون']];
  var ACCENTS = ['#ff7a3d', '#f59e0b', '#ef4444', '#ec4899', '#a855f7', '#3b82f6', '#06b6d4', '#10b981'];
  var BGS = ['#1a130e', '#0f172a', '#1f2937', '#111111', '#2a1020', '#0b2a22', '#f8fafc'];

  function load() {
    var c = {};
    try { c = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { c = {}; }
    if (!c.fmt) { try { var old = localStorage.getItem('ts_clock_format'); if (old === '24' || old === '12') c.fmt = old; } catch (e) {} }
    var o = {}; for (var k in DEF) o[k] = (c[k] === undefined || c[k] === null) ? DEF[k] : c[k];
    if (!/^#[0-9a-f]{6}$/i.test(o.accent)) o.accent = DEF.accent;
    if (!/^#[0-9a-f]{6}$/i.test(o.bg)) o.bg = DEF.bg;
    return o;
  }
  var cfg = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {} }

  /* ---------------- ألوان ---------------- */
  function rgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  function hex(a) { return '#' + a.map(function (x) { x = Math.max(0, Math.min(255, Math.round(x))); return (x < 16 ? '0' : '') + x.toString(16); }).join(''); }
  function mix(h, t, k) { var a = rgb(h), b = rgb(t); return hex([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]); }
  function lum(h) { var a = rgb(h); return (0.299 * a[0] + 0.587 * a[1] + 0.114 * a[2]) / 255; }
  function vars() {
    var light = lum(cfg.bg) > 0.6;
    var text = light ? '#0f172a' : '#f8fafc';
    return {
      '--ck-acc': cfg.accent,
      '--ck-acc-soft': mix(cfg.accent, light ? '#ffffff' : '#000000', 0.78),
      '--ck-bg1': mix(cfg.bg, light ? '#ffffff' : '#ffffff', light ? 0 : 0.04),
      '--ck-bg2': mix(cfg.bg, light ? '#cbd5e1' : '#000000', light ? 0.35 : 0.55),
      '--ck-face': light ? '#ffffff' : mix(cfg.bg, '#000000', 0.6),
      '--ck-text': text,
      '--ck-mute': light ? '#475569' : '#a8a29e',
      '--ck-line': mix(cfg.accent, light ? '#ffffff' : '#000000', 0.55),
      '--ck-hand': light ? '#0f172a' : '#ffffff',
      '--ck-cloud': light ? '#94a3b8' : '#e5e7eb'
    };
  }

  /* ---------------- CSS ---------------- */
  (function css() {
    if (document.getElementById('ts-ck-css')) return;
    var st = document.createElement('style'); st.id = 'ts-ck-css';
    st.textContent = [
      '.ts-ck{position:relative;direction:ltr;margin-bottom:20px;padding:20px;border-radius:26px;color:var(--ck-text);',
      'background:radial-gradient(120% 140% at 20% 0%,var(--ck-bg1),var(--ck-bg2));border:1px solid var(--ck-line);',
      'box-shadow:0 10px 34px rgba(0,0,0,.35),0 0 26px color-mix(in srgb,var(--ck-acc) 22%,transparent);user-select:none;overflow:hidden}',
      '.ts-ck-grid{display:grid;grid-template-columns:1fr;gap:16px;align-items:center}',
      '@media(min-width:900px){.ts-ck-grid{grid-template-columns:minmax(210px,250px) 1fr minmax(170px,210px);gap:24px}}',
      '.ts-ck-an{display:flex;justify-content:center}',
      '.ts-ck-an svg{width:100%;max-width:240px;height:auto;filter:drop-shadow(0 0 10px color-mix(in srgb,var(--ck-acc) 55%,transparent))}',
      '.ts-ck-mid{display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;min-width:0}',
      '.ts-ck-time{display:flex;align-items:center;justify-content:center;gap:6px;direction:ltr;font-variant-numeric:tabular-nums;line-height:1}',
      '.ts-ck-time .hh,.ts-ck-time .mm{font-size:clamp(46px,7vw,78px);font-weight:900;letter-spacing:1px}',
      '.ts-ck-time .cl{font-size:clamp(40px,6vw,66px);font-weight:900;color:var(--ck-acc);padding-bottom:6px}',
      '.ts-ck-time .ap{font-size:clamp(18px,2.4vw,26px);font-weight:800;color:var(--ck-acc);align-self:flex-end;padding-bottom:8px;margin-inline-start:6px}',
      '.ts-ck-d-bold .hh,.ts-ck-d-bold .mm{color:var(--ck-text);text-shadow:0 0 22px color-mix(in srgb,var(--ck-acc) 40%,transparent)}',
      '.ts-ck-d-mono .hh,.ts-ck-d-mono .mm{font-family:ui-monospace,"JetBrains Mono",Menlo,monospace;font-weight:700;color:var(--ck-text);letter-spacing:4px}',
      '.ts-ck-d-boxes .hh,.ts-ck-d-boxes .mm{background:color-mix(in srgb,var(--ck-acc) 16%,transparent);border:1px solid var(--ck-line);border-radius:16px;padding:8px 16px;color:var(--ck-text)}',
      '.ts-ck-d-outline .hh,.ts-ck-d-outline .mm{color:transparent;-webkit-text-stroke:2px var(--ck-acc);letter-spacing:3px}',
      '.ts-ck-d-neon .hh,.ts-ck-d-neon .mm{color:var(--ck-acc);text-shadow:0 0 8px var(--ck-acc),0 0 24px color-mix(in srgb,var(--ck-acc) 60%,transparent)}',
      '.ts-ck-d-neon .cl{text-shadow:0 0 10px var(--ck-acc)}',
      '.ts-ck-date{display:inline-flex;align-items:center;gap:8px;padding:7px 16px;border-radius:14px;font-size:14px;font-weight:700;direction:rtl;',
      'background:color-mix(in srgb,var(--ck-text) 7%,transparent);border:1px solid color-mix(in srgb,var(--ck-text) 14%,transparent)}',
      '.ts-ck-date svg{width:16px;height:16px;color:var(--ck-acc)}',
      '.ts-ck-card{display:flex;flex-direction:column;align-items:center;gap:4px;text-align:center;padding:14px;border-radius:20px;direction:rtl;',
      'background:color-mix(in srgb,var(--ck-text) 5%,transparent);border:1px solid var(--ck-line)}',
      '.ts-ck-card .wi{width:64px;height:64px}',
      '.ts-ck-temp{font-size:32px;font-weight:900;line-height:1.1;direction:ltr}',
      '.ts-ck-sub{font-size:12px;font-weight:700;color:var(--ck-mute)}',
      '.ts-ck-loc{font-size:11.5px;font-weight:800;color:var(--ck-acc);display:inline-flex;align-items:center;gap:4px}',
      '.ts-ck-hij{margin-top:16px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 20px;border-radius:20px;direction:rtl;',
      'background:linear-gradient(90deg,color-mix(in srgb,var(--ck-acc) 14%,transparent),transparent);border:1px solid var(--ck-line)}',
      '.ts-ck-hij .y{font-size:26px;font-weight:900;direction:ltr;unicode-bidi:isolate}',
      '.ts-ck-hij .dm{white-space:nowrap}',
      '@media(max-width:600px){.ts-ck-hij .sp{display:none}.ts-ck-hij svg{height:34px}.ts-ck-hij{padding:10px 14px}}',
      '.ts-ck-hij .dm{font-size:17px;font-weight:900;color:var(--ck-acc)}',
      '.ts-ck-hij svg{height:46px;width:auto;color:var(--ck-acc);opacity:.9}',
      '.ts-ck-gear{position:absolute;top:12px;left:12px;z-index:3;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:14px;',
      'color:var(--ck-acc);background:color-mix(in srgb,var(--ck-text) 8%,transparent);border:1px solid var(--ck-line);display:flex;align-items:center;justify-content:center}',
      '.ts-ck-gear:hover{background:var(--ck-acc);color:#fff}',
      /* لوحة الإعدادات */
      '#ts-ck-panel{position:fixed;inset:0;z-index:99991;display:flex;align-items:center;justify-content:center;padding:12px;background:rgba(0,0,0,.6)}',
      '#ts-ck-panel .bx{width:100%;max-width:560px;max-height:90vh;overflow-y:auto;background:#17120e;color:#f4efe9;border:1px solid rgba(255,255,255,.12);border-radius:20px;padding:18px;direction:rtl;box-shadow:0 24px 60px rgba(0,0,0,.6)}',
      'html:not(.dark) #ts-ck-panel .bx{background:#fff;color:#1b1511;border-color:#e2e8f0}',
      '#ts-ck-panel h4{font-size:12px;font-weight:800;color:#a8a29e;margin:14px 0 8px}',
      '#ts-ck-panel .row{display:flex;flex-wrap:wrap;gap:8px}',
      '#ts-ck-panel .opt{display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px;border-radius:12px;border:2px solid rgba(148,163,184,.3);background:rgba(148,163,184,.08);cursor:pointer;font-size:11px;font-weight:700;color:inherit}',
      '#ts-ck-panel .opt.on{border-color:var(--ck-acc)}',
      '#ts-ck-panel .opt svg{width:64px;height:64px}',
      '#ts-ck-panel .dg .hh,#ts-ck-panel .dg .mm{padding:2px 6px !important;border-radius:8px !important;letter-spacing:0 !important}',
      '#ts-ck-panel .opt .dg{width:84px;height:46px;display:flex;align-items:center;justify-content:center;border-radius:8px;background:var(--ck-bg2);color:var(--ck-text);--ck-text:#f8fafc;font-size:20px}',
      '#ts-ck-panel .sw{width:30px;height:30px;border-radius:50%;border:3px solid transparent;cursor:pointer;box-shadow:0 0 0 1px rgba(148,163,184,.5)}',
      '#ts-ck-panel .sw.on{border-color:#fff;box-shadow:0 0 0 2px var(--ck-acc)}',
      '#ts-ck-panel label.tg{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;cursor:pointer}',
      '#ts-ck-panel .seg{display:inline-flex;border-radius:10px;overflow:hidden;border:1px solid rgba(148,163,184,.4)}',
      '#ts-ck-panel .seg button{padding:6px 16px;font-size:12px;font-weight:800;background:transparent;color:inherit;cursor:pointer}',
      '#ts-ck-panel .seg button.on{background:var(--ck-acc);color:#fff}',
      '#ts-ck-panel .ft{display:flex;justify-content:space-between;gap:8px;margin-top:16px;padding-top:12px;border-top:1px solid rgba(148,163,184,.25)}',
      '#ts-ck-panel .bt{padding:8px 16px;border-radius:12px;font-size:12px;font-weight:800;cursor:pointer;background:rgba(148,163,184,.18);color:inherit}',
      '#ts-ck-panel .bt.pr{background:var(--ck-acc);color:#fff}',
      '#ts-ck-panel input[type=color]{width:34px;height:30px;padding:0;border:none;background:none;cursor:pointer}'
    ].join('\n');
    document.head.appendChild(st);
  })();

  /* ---------------- الساعة الأنالوج (SVG) ---------------- */
  var ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  function analogSvg(style, withSeconds, uid) {
    var s = '<svg viewBox="0 0 200 200" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">';
    s += '<circle cx="100" cy="100" r="96" style="fill:var(--ck-face);stroke:var(--ck-acc);stroke-width:' + (style === 'minimal' ? 2 : 4) + '"/>';
    if (style === 'glow') s += '<circle cx="100" cy="100" r="90" style="fill:none;stroke:var(--ck-line);stroke-width:1"/>';
    var i, a, x1, y1, x2, y2, r1, r2;
    // علامات الدقايق
    if (style === 'glow' || style === 'roman') {
      for (i = 0; i < 60; i++) {
        if (i % 5 === 0) continue;
        a = i * 6 * Math.PI / 180;
        s += '<line x1="' + (100 + 90 * Math.sin(a)).toFixed(1) + '" y1="' + (100 - 90 * Math.cos(a)).toFixed(1) + '" x2="' + (100 + 86 * Math.sin(a)).toFixed(1) + '" y2="' + (100 - 86 * Math.cos(a)).toFixed(1) + '" style="stroke:var(--ck-mute);stroke-width:1"/>';
      }
    }
    if (style === 'bars') {
      for (i = 0; i < 60; i++) {
        if (i % 5 === 0) continue;
        a = i * 6 * Math.PI / 180;
        s += '<circle cx="' + (100 + 88 * Math.sin(a)).toFixed(1) + '" cy="' + (100 - 88 * Math.cos(a)).toFixed(1) + '" r="0.9" style="fill:var(--ck-mute)"/>';
      }
    }
    // علامات الساعات
    for (i = 0; i < 12; i++) {
      a = i * 30 * Math.PI / 180;
      if (style === 'dots') {
        s += '<circle cx="' + (100 + 86 * Math.sin(a)).toFixed(1) + '" cy="' + (100 - 86 * Math.cos(a)).toFixed(1) + '" r="' + (i % 3 === 0 ? 3.4 : 2.2) + '" style="fill:var(--ck-acc)"/>';
        continue;
      }
      r1 = style === 'bars' ? 74 : 80; r2 = 90; var w = style === 'bars' ? 5 : (style === 'minimal' ? (i % 3 === 0 ? 3 : 1.6) : 3);
      if (style === 'minimal' && i % 3 !== 0) { r1 = 84; }
      x1 = 100 + r1 * Math.sin(a); y1 = 100 - r1 * Math.cos(a); x2 = 100 + r2 * Math.sin(a); y2 = 100 - r2 * Math.cos(a);
      s += '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '" stroke-linecap="round" style="stroke:var(--ck-acc);stroke-width:' + w + '"/>';
    }
    // الأرقام
    if (style === 'glow' || style === 'roman' || style === 'dots') {
      for (i = 1; i <= 12; i++) {
        if (style === 'dots' && i % 3 !== 0) continue;
        a = i * 30 * Math.PI / 180;
        var rr = style === 'roman' ? 68 : 70;
        var tx = 100 + rr * Math.sin(a), ty = 100 - rr * Math.cos(a);
        s += '<text x="' + tx.toFixed(1) + '" y="' + (ty + 4.5).toFixed(1) + '" text-anchor="middle" style="fill:var(--ck-text);font:800 ' + (style === 'roman' ? 11 : 14) + 'px system-ui,sans-serif">' + (style === 'roman' ? ROMAN[i - 1] : i) + '</text>';
      }
    }
    // الشعار
    s += '<g transform="translate(100 56)"><path d="M-7 4 L2 -8 L6 -8 L-1 0 L7 0 L-3 8 Z" style="fill:var(--ck-acc)"/></g>';
    s += '<text x="100" y="74" text-anchor="middle" style="fill:var(--ck-acc);font:900 7.5px system-ui,sans-serif;letter-spacing:1.6px">TASAHEL</text>';
    // العقارب
    var hw = style === 'bars' ? 6 : (style === 'minimal' ? 2.6 : 4.4), mw = style === 'bars' ? 4.6 : (style === 'minimal' ? 1.8 : 3.2);
    s += '<line id="' + uid + 'h" x1="100" y1="106" x2="100" y2="58" stroke-linecap="round" style="stroke:var(--ck-hand);stroke-width:' + hw + '"/>';
    s += '<line id="' + uid + 'm" x1="100" y1="108" x2="100" y2="34" stroke-linecap="round" style="stroke:var(--ck-hand);stroke-width:' + mw + '"/>';
    if (withSeconds) s += '<line id="' + uid + 's" x1="100" y1="116" x2="100" y2="26" stroke-linecap="round" style="stroke:var(--ck-acc);stroke-width:1.6"/>';
    s += '<circle cx="100" cy="100" r="5" style="fill:var(--ck-acc);stroke:var(--ck-hand);stroke-width:1.6"/>';
    return s + '</svg>';
  }

  /* ---------------- أيقونات الطقس والمسجد ---------------- */
  var WI = {
    sun: '<circle cx="32" cy="32" r="11" fill="#fbbf24"/><g stroke="#fbbf24" stroke-width="3" stroke-linecap="round"><path d="M32 8v6M32 50v6M8 32h6M50 32h6M15 15l4 4M45 45l4 4M49 15l-4 4M19 45l-4 4"/></g>',
    cloudsun: '<circle cx="22" cy="24" r="9" fill="#fbbf24"/><g stroke="#fbbf24" stroke-width="2.6" stroke-linecap="round"><path d="M22 6v4M6 24h4M10 12l3 3M34 12l-3 3"/></g><path d="M22 48a9 9 0 0 1 1-18 12 12 0 0 1 23 3 8 8 0 0 1-1 15z" style="fill:var(--ck-cloud)"/>',
    cloud: '<path d="M18 48a10 10 0 0 1 1-20 14 14 0 0 1 27 3 9 9 0 0 1-1 17z" style="fill:var(--ck-cloud)"/>',
    fog: '<path d="M18 36a10 10 0 0 1 1-18 14 14 0 0 1 27 3 8 8 0 0 1-1 15z" style="fill:var(--ck-cloud)"/><g stroke="#94a3b8" stroke-width="3" stroke-linecap="round"><path d="M14 44h36M20 52h28"/></g>',
    rain: '<path d="M18 38a10 10 0 0 1 1-19 14 14 0 0 1 27 3 8 8 0 0 1-1 16z" style="fill:var(--ck-cloud)"/><g stroke="#38bdf8" stroke-width="3" stroke-linecap="round"><path d="M22 46l-3 8M33 46l-3 8M44 46l-3 8"/></g>',
    storm: '<path d="M18 36a10 10 0 0 1 1-18 14 14 0 0 1 27 3 8 8 0 0 1-1 15z" fill="#94a3b8"/><path d="M34 38l-8 12h6l-3 10 11-14h-6z" fill="#fbbf24"/>'
  };
  function weatherInfo(code) {
    if (code === 0) return { t: 'مشمس', i: 'sun' };
    if (code <= 2) return { t: 'غائم جزئياً', i: 'cloudsun' };
    if (code === 3) return { t: 'غائم', i: 'cloud' };
    if (code === 45 || code === 48) return { t: 'ضبابي', i: 'fog' };
    if (code >= 95) return { t: 'عاصف', i: 'storm' };
    if (code >= 51) return { t: 'أمطار', i: 'rain' };
    return { t: 'غائم', i: 'cloud' };
  }
  var MOSQUE = '<svg viewBox="0 0 120 56" fill="currentColor" aria-hidden="true"><path d="M60 6a14 14 0 0 1 14 14v4H46v-4A14 14 0 0 1 60 6z"/><rect x="40" y="24" width="40" height="22"/><rect x="8" y="14" width="6" height="32"/><path d="M11 6l4 8H7z"/><rect x="106" y="14" width="6" height="32"/><path d="M109 6l4 8h-8z"/><rect x="0" y="46" width="120" height="6" rx="2"/><path d="M58 0h4v6h-4z"/></svg>';
  var CAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>';
  var PIN = '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>';
  var GEAR = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';

  /* ---------------- الطقس (Open-Meteo، كاش 30 دقيقة) ---------------- */
  var wx = null;
  function loadWeather() {
    try { var c = JSON.parse(localStorage.getItem('ts_cairo_weather') || 'null'); if (c && Date.now() - c.t < 1800000) { wx = c; return; } if (c) wx = c; } catch (e) {}
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var tid = ctrl ? setTimeout(function () { ctrl.abort(); }, 4000) : 0;
    fetch('https://api.open-meteo.com/v1/forecast?latitude=30.0444&longitude=31.2357&current=temperature_2m,weather_code&timezone=Africa%2FCairo', ctrl ? { signal: ctrl.signal } : undefined)
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (j) {
        wx = { temp: Math.round(j.current.temperature_2m), code: j.current.weather_code, t: Date.now() };
        try { localStorage.setItem('ts_cairo_weather', JSON.stringify(wx)); } catch (e) {}
        tick(true);
      })
      .catch(function () { /* لو فشل بنعرض آخر قيمة محفوظة أو شرطة */ })
      .then(function () { if (tid) clearTimeout(tid); });
  }

  /* ---------------- بناء الويدجت ---------------- */
  var fG = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  var fH = null, fHy = null;
  try {
    fH = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-nu-latn', { day: 'numeric', month: 'long' });
    fHy = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-nu-latn', { year: 'numeric' });
  } catch (e) {}
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function cairoNow() {
    var p = {};
    try {
      new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
        .formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
      return { h: +p.hour, m: +p.minute, s: +p.second };
    } catch (e) { var d = new Date(); return { h: d.getHours(), m: d.getMinutes(), s: d.getSeconds() }; }
  }

  var built = '';
  function widgetEl() { return document.getElementById('ts-ck'); }

  function applyVars(el) { var v = vars(); for (var k in v) el.style.setProperty(k, v[k]); }

  function build(el) {
    var key = [cfg.analog, cfg.seconds, cfg.digital, cfg.weather, cfg.hijri].join('|');
    applyVars(el);
    el.className = 'ts-ck ts-ck-d-' + cfg.digital;
    if (built === key && el.firstChild) return;
    built = key;
    el.innerHTML =
      '<button type="button" class="ts-ck-gear" id="ts-ck-gear" aria-label="إعدادات الساعة" title="إعدادات الساعة">' + GEAR + '</button>' +
      '<div class="ts-ck-grid">' +
        '<div class="ts-ck-an">' + analogSvg(cfg.analog, cfg.seconds, 'ck') + '</div>' +
        '<div class="ts-ck-mid">' +
          '<div class="ts-ck-time"><span class="hh" id="ts-ck-hh">--</span><span class="cl">:</span><span class="mm" id="ts-ck-mm">--</span><span class="ap" id="ts-ck-ap"></span></div>' +
          '<div class="ts-ck-date">' + CAL + '<span id="ts-ck-date">--</span></div>' +
        '</div>' +
        (cfg.weather ? '<div class="ts-ck-card"><svg class="wi" id="ts-ck-wi" viewBox="0 0 64 64" aria-hidden="true"></svg><div class="ts-ck-temp" id="ts-ck-temp">--°C</div><div class="ts-ck-sub" id="ts-ck-wd">--</div><div class="ts-ck-loc">' + PIN + '<span>القاهرة</span></div></div>' : '') +
      '</div>' +
      (cfg.hijri ? '<div class="ts-ck-hij"><div>' + MOSQUE + '</div><div style="text-align:center"><div class="y" style="display:flex;gap:6px;justify-content:center"><span id="ts-ck-hy">--</span><span>هـ</span></div><div class="dm" id="ts-ck-hd">--</div></div><div class="sp" style="width:60px"></div></div>' : '');
    var g = el.querySelector('#ts-ck-gear');
    if (g) g.addEventListener('click', function (e) { e.stopPropagation(); openPanel(); });
    last = {};
  }

  var last = {};
  function setT(id, v) {
    if (last[id] === v) return;
    var e = document.getElementById(id); if (!e) return;
    e.textContent = v; last[id] = v;
  }
  function setA(id, name, v) { var e = document.getElementById(id); if (e) e.setAttribute(name, v); }

  function tick(force) {
    var el = widgetEl(); if (!el) return;
    if (document.hidden && !force) return;
    var t = cairoNow();
    // العقارب
    var hDeg = ((t.h % 12) + t.m / 60) * 30, mDeg = (t.m + t.s / 60) * 6, sDeg = t.s * 6;
    setA('ckh', 'transform', 'rotate(' + hDeg.toFixed(1) + ' 100 100)');
    setA('ckm', 'transform', 'rotate(' + mDeg.toFixed(1) + ' 100 100)');
    setA('cks', 'transform', 'rotate(' + sDeg + ' 100 100)');
    // الرقمية
    var is24 = cfg.fmt === '24';
    setT('ts-ck-hh', is24 ? pad(t.h) : pad((t.h % 12) || 12));
    setT('ts-ck-mm', pad(t.m));
    setT('ts-ck-ap', is24 ? '' : (t.h < 12 ? 'ص' : 'م'));
    // التاريخ
    var now = new Date();
    setT('ts-ck-date', fG.format(now));
    if (cfg.hijri) {
      var yd = fHy ? fHy.format(now).replace(/\D/g, '') : ''; setT('ts-ck-hy', yd);
      setT('ts-ck-hd', fH ? fH.format(now) : '');
    }
    // الطقس
    if (cfg.weather) {
      var w = wx ? weatherInfo(wx.code) : null;
      setT('ts-ck-temp', wx ? wx.temp + '°C' : '--°C');
      setT('ts-ck-wd', w ? w.t : '');
      var ic = document.getElementById('ts-ck-wi');
      var name = w ? w.i : '';
      if (ic && last.wi !== name) { ic.innerHTML = name ? WI[name] : ''; last.wi = name; }
    }
  }

  /* ---------------- لوحة الإعدادات ---------------- */
  function closePanel() { var p = document.getElementById('ts-ck-panel'); if (p) p.remove(); document.removeEventListener('keydown', onKey); }
  function onKey(e) { if (e.key === 'Escape') closePanel(); }

  function previewSvg(style) {
    return analogSvg(style, false, 'pv' + style).replace(/id="pv[a-z]+[hms]"/g, '');
  }
  function renderPanel() {
    var p = document.getElementById('ts-ck-panel'); if (!p) return;
    var sw = function (list, cur, attr) {
      return list.map(function (c) { return '<button type="button" class="sw' + (c.toLowerCase() === cur.toLowerCase() ? ' on' : '') + '" data-' + attr + '="' + c + '" style="background:' + c + '" aria-label="' + c + '"></button>'; }).join('');
    };
    p.querySelector('.bx').innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:15px">إعدادات الساعة</b><button type="button" class="bt" data-close>إغلاق</button></div>' +
      '<h4>شكل الساعة التناظرية</h4><div class="row">' + ANALOGS.map(function (a) {
        return '<button type="button" class="opt' + (cfg.analog === a[0] ? ' on' : '') + '" data-analog="' + a[0] + '">' + previewSvg(a[0]) + '<span>' + a[1] + '</span></button>';
      }).join('') + '</div>' +
      '<h4>شكل الساعة الرقمية</h4><div class="row">' + DIGITALS.map(function (d) {
        return '<button type="button" class="opt' + (cfg.digital === d[0] ? ' on' : '') + '" data-digital="' + d[0] + '"><div class="dg ts-ck-time ts-ck-d-' + d[0] + '" style="gap:2px"><span class="hh" style="font-size:20px">05</span><span class="cl" style="font-size:18px;padding:0">:</span><span class="mm" style="font-size:20px">42</span></div><span>' + d[1] + '</span></button>';
      }).join('') + '</div>' +
      '<h4>لون التمييز</h4><div class="row" style="align-items:center">' + sw(ACCENTS, cfg.accent, 'accent') + '<input type="color" id="ts-ck-acc-in" value="' + cfg.accent + '" aria-label="لون مخصص"></div>' +
      '<h4>لون الخلفية</h4><div class="row" style="align-items:center">' + sw(BGS, cfg.bg, 'bg') + '<input type="color" id="ts-ck-bg-in" value="' + cfg.bg + '" aria-label="خلفية مخصصة"></div>' +
      '<h4>العرض</h4><div class="row" style="align-items:center;gap:16px">' +
        '<div class="seg"><button type="button" data-fmt="12" class="' + (cfg.fmt === '12' ? 'on' : '') + '">12 ساعة</button><button type="button" data-fmt="24" class="' + (cfg.fmt === '24' ? 'on' : '') + '">24 ساعة</button></div>' +
        '<label class="tg"><input type="checkbox" data-tg="seconds"' + (cfg.seconds ? ' checked' : '') + '> عقرب الثواني</label>' +
        '<label class="tg"><input type="checkbox" data-tg="weather"' + (cfg.weather ? ' checked' : '') + '> الطقس</label>' +
        '<label class="tg"><input type="checkbox" data-tg="hijri"' + (cfg.hijri ? ' checked' : '') + '> التاريخ الهجري</label>' +
      '</div>' +
      '<div class="ft"><button type="button" class="bt" data-reset>الرجوع للافتراضي</button><button type="button" class="bt pr" data-close>تم</button></div>';
    var pv = p.querySelector('.bx'); var v = vars(); for (var k in v) pv.style.setProperty(k, v[k]);
  }
  function change(patch) {
    for (var k in patch) cfg[k] = patch[k];
    save();
    var el = widgetEl(); if (el) { build(el); tick(true); }
    renderPanel();
  }
  function openPanel() {
    closePanel();
    var p = document.createElement('div'); p.id = 'ts-ck-panel';
    p.innerHTML = '<div class="bx" role="dialog" aria-modal="true"></div>';
    p.addEventListener('click', function (e) {
      if (e.target === p) return closePanel();
      var b = e.target.closest('[data-close],[data-analog],[data-digital],[data-accent],[data-bg],[data-fmt],[data-reset]');
      if (!b) return;
      if (b.hasAttribute('data-close')) return closePanel();
      if (b.hasAttribute('data-reset')) { var keep = cfg.fmt; return change(Object.assign({}, DEF, { fmt: keep })); }
      if (b.dataset.analog) return change({ analog: b.dataset.analog });
      if (b.dataset.digital) return change({ digital: b.dataset.digital });
      if (b.dataset.accent) return change({ accent: b.dataset.accent });
      if (b.dataset.bg) return change({ bg: b.dataset.bg });
      if (b.dataset.fmt) return change({ fmt: b.dataset.fmt });
    });
    p.addEventListener('change', function (e) {
      var t = e.target;
      if (t.id === 'ts-ck-acc-in') return change({ accent: t.value });
      if (t.id === 'ts-ck-bg-in') return change({ bg: t.value });
      if (t.dataset && t.dataset.tg) { var o = {}; o[t.dataset.tg] = t.checked; change(o); }
    });
    document.body.appendChild(p);
    document.addEventListener('keydown', onKey);
    renderPanel();
  }
  window.setTsClockFormat = function (f) { change({ fmt: f === '24' ? '24' : '12' }); };

  /* ---------------- التركيب في الرئيسية ---------------- */
  function mount() {
    var box = document.getElementById('tab-home'); if (!box) return;
    var el = widgetEl();
    if (!el) { el = document.createElement('div'); el.id = 'ts-ck'; built = ''; }
    if (el.parentNode !== box || box.firstChild !== el) box.insertBefore(el, box.firstChild);
    build(el); tick(true);
  }

  /* renderHomeTab بيمسح #tab-home: نفصل نفس عنصر الساعة قبل الرسم ونرجّعه بعده (مفيش إعادة بناء = مفيش رمشة) */
  var origHome = window.renderHomeTab;
  if (typeof origHome === 'function') {
    window.renderHomeTab = function () {
      var box = document.getElementById('tab-home'), el = widgetEl();
      if (el && box && el.parentNode === box) box.removeChild(el);
      var r;
      try { r = origHome.apply(this, arguments); }
      finally { try { var b2 = document.getElementById('tab-home'); if (el && b2) { if (!b2.contains(el)) b2.insertBefore(el, b2.firstChild); } else mount(); } catch (e) {} }
      return r;
    };
  }

  loadWeather();
  setInterval(function () { tick(false); }, 1000);
  setInterval(loadWeather, 1800000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(true); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
