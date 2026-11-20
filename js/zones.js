/* =====================================================================
   js/zones.js — القائمة الثابتة الموحّدة للمناطق والأحياء (تساهيل)
   - المصدر: الأحياء الفعلية في js/70-courier-portal.js (CAIRO_ZONES)
     و js/75-radar-phase3.js (ROUTES) والتوزيع المعتمد في المرحلة 2.
   - كل منطقة لها zone_key ثابت وفريد، ومجمّعة تحت منطقة كبيرة (area_key).
   - التصدير: window.ZONES، window.AREAS، window.zoneLabel(key)، و window.TasahelZones.
   ===================================================================== */
(function (global) {
  'use strict';

  var AREAS = Object.freeze([
    Object.freeze({ area_key: 'east_north_cairo', label: 'شرق وشمال ووسط القاهرة' }),
    Object.freeze({ area_key: 'new_cairo_east',   label: 'القاهرة الجديدة والمدن الشرقية' }),
    Object.freeze({ area_key: 'south_cairo',      label: 'جنوب القاهرة (المعادي والمقطم وحلوان)' }),
    Object.freeze({ area_key: 'giza',             label: 'محافظة الجيزة وأكتوبر وزايد' }),
    Object.freeze({ area_key: 'unassigned',       label: 'مناطق بدون مندوب معيّن' })
  ]);

  var ZONES = Object.freeze([
    /* ===== 1) شرق وشمال ووسط القاهرة (سمير) ===== */
    Object.freeze({ zone_key: 'شبرا',          label: 'شبرا',          area_key: 'east_north_cairo', lat: 30.0790, lng: 31.2450 }),
    Object.freeze({ zone_key: 'مدينة نصر',     label: 'مدينة نصر',     area_key: 'east_north_cairo', lat: 30.0561, lng: 31.3301 }),
    Object.freeze({ zone_key: 'مصر الجديدة',   label: 'مصر الجديدة',   area_key: 'east_north_cairo', lat: 30.0909, lng: 31.3228 }),
    Object.freeze({ zone_key: 'النزهة',        label: 'النزهة',        area_key: 'east_north_cairo', lat: 30.1120, lng: 31.3450 }),
    Object.freeze({ zone_key: 'شيراتون',       label: 'شيراتون',       area_key: 'east_north_cairo', lat: 30.1050, lng: 31.3680 }),
    Object.freeze({ zone_key: 'وسط البلد',     label: 'وسط البلد',     area_key: 'east_north_cairo', lat: 30.0444, lng: 31.2357 }),
    Object.freeze({ zone_key: 'رمسيس',         label: 'رمسيس',         area_key: 'east_north_cairo', lat: 30.0618, lng: 31.2466 }),
    Object.freeze({ zone_key: 'العباسية',      label: 'العباسية',      area_key: 'east_north_cairo', lat: 30.0720, lng: 31.2830 }),
    Object.freeze({ zone_key: 'الوايلي',       label: 'الوايلي',       area_key: 'east_north_cairo', lat: null,    lng: null }),
    Object.freeze({ zone_key: 'جسر السويس',    label: 'جسر السويس',    area_key: 'east_north_cairo', lat: null,    lng: null }),
    Object.freeze({ zone_key: 'عين شمس',       label: 'عين شمس',       area_key: 'east_north_cairo', lat: 30.1310, lng: 31.3190 }),
    Object.freeze({ zone_key: 'المرج',         label: 'المرج',         area_key: 'east_north_cairo', lat: null,    lng: null }),
    Object.freeze({ zone_key: 'المطرية',       label: 'المطرية',       area_key: 'east_north_cairo', lat: 30.1250, lng: 31.3100 }),
    Object.freeze({ zone_key: 'الزيتون',       label: 'الزيتون',       area_key: 'east_north_cairo', lat: 30.1060, lng: 31.3010 }),
    Object.freeze({ zone_key: 'حدائق القبة',   label: 'حدائق القبة',   area_key: 'east_north_cairo', lat: 30.0880, lng: 31.2820 }),

    /* ===== 2) القاهرة الجديدة والمدن الشرقية (علي) ===== */
    Object.freeze({ zone_key: 'بدر',            label: 'بدر',            area_key: 'new_cairo_east', lat: null,    lng: null }),
    Object.freeze({ zone_key: 'العبور',         label: 'العبور',         area_key: 'new_cairo_east', lat: 30.2280, lng: 31.4790 }),
    Object.freeze({ zone_key: 'القاهرة الجديدة', label: 'القاهرة الجديدة', area_key: 'new_cairo_east', lat: 30.0150, lng: 31.4700 }),
    Object.freeze({ zone_key: 'التجمع',         label: 'التجمع',         area_key: 'new_cairo_east', lat: 30.0074, lng: 31.4913 }),
    Object.freeze({ zone_key: 'القطامية',       label: 'القطامية',       area_key: 'new_cairo_east', lat: null,    lng: null }),
    Object.freeze({ zone_key: 'مدينتي',         label: 'مدينتي',         area_key: 'new_cairo_east', lat: 30.0830, lng: 31.6300 }),
    Object.freeze({ zone_key: 'الرحاب',         label: 'الرحاب',         area_key: 'new_cairo_east', lat: 30.0580, lng: 31.4910 }),
    Object.freeze({ zone_key: 'المستقبل',       label: 'المستقبل',       area_key: 'new_cairo_east', lat: null,    lng: null }),
    Object.freeze({ zone_key: 'الشروق',         label: 'الشروق',         area_key: 'new_cairo_east', lat: 30.1440, lng: 31.6080 }),

    /* ===== 3) جنوب القاهرة — المعادي والمقطم وحلوان (مصطفى) ===== */
    Object.freeze({ zone_key: 'المعادي',        label: 'المعادي',        area_key: 'south_cairo', lat: 29.9602, lng: 31.2569 }),
    Object.freeze({ zone_key: 'زهراء المعادي',  label: 'زهراء المعادي',  area_key: 'south_cairo', lat: 29.9550, lng: 31.3000 }),
    Object.freeze({ zone_key: 'حلوان',          label: 'حلوان',          area_key: 'south_cairo', lat: 29.8414, lng: 31.3008 }),
    Object.freeze({ zone_key: 'حدائق حلوان',    label: 'حدائق حلوان',    area_key: 'south_cairo', lat: null,    lng: null }),
    Object.freeze({ zone_key: 'المعصرة',        label: 'المعصرة',        area_key: 'south_cairo', lat: 29.9060, lng: 31.2820 }),
    Object.freeze({ zone_key: 'المقطم',         label: 'المقطم',         area_key: 'south_cairo', lat: 30.0120, lng: 31.3020 }),
    Object.freeze({ zone_key: 'دار السلام',     label: 'دار السلام',     area_key: 'south_cairo', lat: 29.9820, lng: 31.2420 }),
    Object.freeze({ zone_key: 'البساتين',       label: 'البساتين',       area_key: 'south_cairo', lat: null,    lng: null }),
    Object.freeze({ zone_key: 'المنيل',         label: 'المنيل',         area_key: 'south_cairo', lat: null,    lng: null }),
    Object.freeze({ zone_key: 'السيدة زينب',    label: 'السيدة زينب',    area_key: 'south_cairo', lat: null,    lng: null }),

    /* ===== 4) محافظة الجيزة وأكتوبر وزايد والزمالك (محمد طه) ===== */
    Object.freeze({ zone_key: 'الجيزة',         label: 'الجيزة',         area_key: 'giza', lat: 30.0131, lng: 31.2089 }),
    Object.freeze({ zone_key: 'الدقي',          label: 'الدقي',          area_key: 'giza', lat: 30.0385, lng: 31.2122 }),
    Object.freeze({ zone_key: 'المهندسين',      label: 'المهندسين',      area_key: 'giza', lat: 30.0511, lng: 31.2001 }),
    Object.freeze({ zone_key: 'الزمالك',        label: 'الزمالك',        area_key: 'giza', lat: 30.0609, lng: 31.2197 }),
    Object.freeze({ zone_key: 'فيصل',           label: 'فيصل',           area_key: 'giza', lat: 30.0020, lng: 31.1850 }),
    Object.freeze({ zone_key: 'الهرم',          label: 'الهرم',          area_key: 'giza', lat: 29.9940, lng: 31.1680 }),
    Object.freeze({ zone_key: 'حدائق الأهرام',  label: 'حدائق الأهرام',  area_key: 'giza', lat: 29.9720, lng: 31.1120 }),
    Object.freeze({ zone_key: 'الطالبية',       label: 'الطالبية',       area_key: 'giza', lat: 29.9960, lng: 31.1860 }),
    Object.freeze({ zone_key: 'المريوطية',      label: 'المريوطية',      area_key: 'giza', lat: 29.9880, lng: 31.1520 }),
    Object.freeze({ zone_key: 'العجوزة',        label: 'العجوزة',        area_key: 'giza', lat: 30.0560, lng: 31.2140 }),
    Object.freeze({ zone_key: 'إمبابة',         label: 'إمبابة',         area_key: 'giza', lat: 30.0770, lng: 31.2070 }),
    Object.freeze({ zone_key: 'بولاق',          label: 'بولاق',          area_key: 'giza', lat: 30.0360, lng: 31.1920 }),
    Object.freeze({ zone_key: 'الوراق',         label: 'الوراق',         area_key: 'giza', lat: 30.0980, lng: 31.2160 }),
    Object.freeze({ zone_key: 'العمرانية',      label: 'العمرانية',      area_key: 'giza', lat: 30.0050, lng: 31.2020 }),
    Object.freeze({ zone_key: 'المنيب',         label: 'المنيب',         area_key: 'giza', lat: 29.9880, lng: 31.2130 }),
    Object.freeze({ zone_key: '6 أكتوبر',       label: '6 أكتوبر',       area_key: 'giza', lat: 29.9723, lng: 30.9401 }),
    Object.freeze({ zone_key: 'الشيخ زايد',     label: 'الشيخ زايد',     area_key: 'giza', lat: 30.0440, lng: 30.9760 }),
    Object.freeze({ zone_key: 'الحوامدية',      label: 'الحوامدية',      area_key: 'giza', lat: 29.8970, lng: 31.2580 }),
    Object.freeze({ zone_key: 'البدرشين',       label: 'البدرشين',       area_key: 'giza', lat: 29.8450, lng: 31.2700 }),

    /* ===== 5) غير مربوط (خارج تغطية المناديب حالياً) ===== */
    Object.freeze({ zone_key: 'القليوبية',       label: 'القليوبية',       area_key: 'unassigned', lat: null, lng: null }),
    Object.freeze({ zone_key: 'المحافظات الأخرى', label: 'المحافظات الأخرى', area_key: 'unassigned', lat: null, lng: null })
  ]);

  var ZONE_BY_KEY = Object.create(null);
  for (var i = 0; i < ZONES.length; i++) {
    ZONE_BY_KEY[ZONES[i].zone_key] = ZONES[i];
  }

  function zoneLabel(key) {
    if (key == null) return '';
    var k = String(key).trim();
    if (!k) return '';
    return ZONE_BY_KEY[k] ? ZONE_BY_KEY[k].label : k;
  }

  function findZone(key) {
    if (key == null) return null;
    return ZONE_BY_KEY[String(key).trim()] || null;
  }

  global.ZONES = ZONES;
  global.AREAS = AREAS;
  global.zoneLabel = zoneLabel;
  global.TasahelZones = Object.freeze({
    ZONES: ZONES,
    AREAS: AREAS,
    zoneLabel: zoneLabel,
    findZone: findZone
  });
})(typeof window !== 'undefined' ? window : globalThis);
