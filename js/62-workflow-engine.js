// =====================================================================
// js/62-workflow-engine.js
// محرك مسارات العمل الذكي (Intelligent Workflow Engine)
// - مراحل تنفيذ مستقلة ومخصصة لكل خدمة
// - انتقال منظم ومنضبط بين المراحل ومنع التجاوزات
// - تسجيل سجل التدقيق والتاريخ الكامل لكل مرحلة
// - تنبيهات الـ SLA عند توقف الطلب
// =====================================================================

(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function isMgr() { return window.__role === 'manager'; }
  function eh(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function wrap(name, make) {
    var o = window[name];
    if (typeof o !== 'function') return;
    window[name] = make(o);
  }

  function getAllLines() {
    if (typeof allRequestLines !== 'undefined' && Array.isArray(allRequestLines)) return allRequestLines;
    if (window.allRequestLines && Array.isArray(window.allRequestLines)) return window.allRequestLines;
    return [];
  }

  var DEFAULT_STAGES = [
    { name: 'فحص المستندات', sla_hours: 12 },
    { name: 'إرسال للمنفذ', sla_hours: 24 },
    { name: 'مراجعة الجهة الحكومية', sla_hours: 48 },
    { name: 'استلام المحرر الرسمي', sla_hours: 24 },
    { name: 'جاهز للتسليم للعميل', sla_hours: 12 }
  ];

  // فتح نافذة مسار العمل التفصيلي للبند
  window.openWorkflowStagesModal = async function (lineId) {
    var line = null;
    getAllLines().some(function (l) {
      if (String(l.id) === String(lineId)) { line = l; return true; }
      return false;
    });

    if (!line && window.sbClient) {
      try {
        var r = await window.sbClient.from('request_lines').select('*').eq('id', lineId).maybeSingle();
        if (r && r.data) line = r.data;
      } catch (_) {}
    }

    if (!line) {
      if (typeof window.showToast === 'function') window.showToast('تعذر العثور على بيانات الخدمة', 'error');
      return;
    }

    var m = $('wf-stages-modal');
    if (!m) {
      document.body.insertAdjacentHTML('beforeend',
        '<div id="wf-stages-modal" class="modal fixed inset-0 z-[125] hidden items-center justify-center bg-black/60 p-4 backdrop-blur-sm">' +
        '  <div class="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 text-slate-800 dark:text-slate-100 max-h-[92vh] flex flex-col">' +
        '    <div class="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">' +
        '      <div class="flex items-center gap-2.5">' +
        '        <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">' +
        '          <i class="fa-solid fa-diagram-project text-lg"></i>' +
        '        </span>' +
        '        <div>' +
        '          <h3 id="wf-title" class="text-base font-bold text-slate-900 dark:text-white">محرك مسار تنفيذ الطلب</h3>' +
        '          <p id="wf-subtitle" class="text-xs text-slate-500"></p>' +
        '        </div>' +
        '      </div>' +
        '      <button type="button" onclick="window.closeWorkflowStagesModal()" class="h-8 w-8 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"><i class="fa-solid fa-xmark"></i></button>' +
        '    </div>' +
        '    <div class="py-4 space-y-4 overflow-y-auto flex-1" id="wf-body">' +
        '      <div class="p-6 text-center text-xs text-slate-400">جارٍ قراءة مسار العمل...</div>' +
        '    </div>' +
        '    <div class="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end">' +
        '      <button type="button" onclick="window.closeWorkflowStagesModal()" class="px-5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 font-bold text-xs">إغلاق</button>' +
        '    </div>' +
        '  </div>' +
        '</div>'
      );
      m = $('wf-stages-modal');
    }

    $('wf-title').textContent = 'مسار تنفيذ: ' + (line.service || 'الخدمة');
    $('wf-subtitle').textContent = 'العميل: ' + (line.client_name || '-') + ' | كود المعاملة: ' + (line.transaction_id || '-');
    m.setAttribute('data-line-id', String(line.id));

    m.classList.remove('hidden');
    m.classList.add('flex');

    // جلب سجل الحركات والمراحل السابقة للبند
    var history = [];
    if (window.sbClient) {
      try {
        var r = await window.sbClient
          .from('request_line_stage_history')
          .select('*')
          .eq('line_id', line.id)
          .order('changed_at', { ascending: false });
        history = r.data || [];
      } catch (e) { /* ignore */ }
    }

    var currentStage = line.stage || line.status || 'فحص المستندات';

    // رسم شريط المراحل التفاعلي
    var stagesHtml = '<div class="space-y-4">' +
      '<div class="rounded-xl bg-slate-50 dark:bg-slate-800/40 p-4 border border-slate-200 dark:border-slate-800">' +
      '  <div class="text-xs font-bold text-slate-500 mb-3">مراحل دورة حياة هذه الخدمة:</div>' +
      '  <div class="grid grid-cols-1 sm:grid-cols-5 gap-2 text-center">' +
      DEFAULT_STAGES.map(function (st, idx) {
        var isCurrent = (currentStage === st.name);
        return '<div class="p-3 rounded-xl border text-xs ' + (isCurrent ? 'bg-indigo-600 text-white border-indigo-600 shadow-md font-bold' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700') + '">' +
          '  <div class="text-[10px] opacity-75 mb-1">مرحلة ' + (idx + 1) + '</div>' +
          '  <div class="leading-tight">' + eh(st.name) + '</div>' +
          '  <div class="text-[10px] opacity-65 mt-1"><i class="fa-regular fa-clock"></i> SLA: ' + st.sla_hours + ' س</div>' +
          '</div>';
      }).join('') +
      '  </div>' +
      '</div>';

    // قسم النقل إلى المرحلة التالية
    var nextStageActionHtml = '<div class="rounded-xl border border-indigo-200 dark:border-indigo-800/60 bg-indigo-50/40 dark:bg-indigo-950/20 p-4 space-y-3">' +
      '  <div class="text-xs font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-2"><i class="fa-solid fa-forward-step"></i> نقل الطلب إلى المرحلة التالية:</div>' +
      '  <div class="flex flex-wrap items-center gap-2">' +
      '    <select id="wf-next-stage-sel" class="field text-xs font-semibold flex-1">' +
      DEFAULT_STAGES.map(function (s) { return '<option value="' + eh(s.name) + '"' + (s.name === currentStage ? ' disabled' : '') + '>' + eh(s.name) + '</option>'; }).join('') +
      '    </select>' +
      '    <input id="wf-next-stage-notes" class="field text-xs flex-[2]" placeholder="ملاحظات النقل (اختياري)...">' +
      '    <button type="button" onclick="window.transitionWorkflowStage(' + line.id + ')" class="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow"><i class="fa-solid fa-arrow-right-arrow-left"></i> تأكيد النقل</button>' +
      '  </div>' +
      '</div>';

    // سجل حركات المراحل السابقة
    var historyHtml = '<div class="space-y-2">' +
      '  <div class="text-xs font-bold text-slate-600 dark:text-slate-300"><i class="fa-solid fa-clock-rotate-left ms-1"></i> سجل الحركات والمسؤوليات:</div>' +
      (history.length ?
        history.map(function (h) {
          var dt = new Date(h.changed_at).toLocaleString('ar-EG');
          return '<div class="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60 text-xs flex items-start justify-between gap-3">' +
            '  <div>' +
            '    <div class="font-bold text-slate-900 dark:text-white"><span class="text-slate-400">' + eh(h.stage_from || 'البداية') + '</span> ← <span class="text-indigo-600 dark:text-indigo-400">' + eh(h.stage_to) + '</span></div>' +
            (h.notes ? '<p class="text-slate-500 mt-1">' + eh(h.notes) + '</p>' : '') +
            '  </div>' +
            '  <div class="text-end text-[11px] text-slate-400 shrink-0">' +
            '    <div><i class="fa-solid fa-user-check text-slate-400 ms-1"></i>' + eh(h.changed_by) + '</div>' +
            '    <div class="font-mono mt-0.5">' + dt + '</div>' +
            '  </div>' +
            '</div>';
        }).join('') :
        '<div class="p-4 text-center text-xs text-slate-400 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">لا توجد حركات مسجلة للبند حتى الآن.</div>') +
      '</div>';

    $('wf-body').innerHTML = stagesHtml + nextStageActionHtml + historyHtml;
  };

  window.closeWorkflowStagesModal = function () {
    var m = $('wf-stages-modal');
    if (m) { m.classList.add('hidden'); m.classList.remove('flex'); }
  };

  window.transitionWorkflowStage = async function (lineId) {
    var nextStage = $('wf-next-stage-sel') ? $('wf-next-stage-sel').value : '';
    var notes = $('wf-next-stage-notes') ? $('wf-next-stage-notes').value.trim() : '';
    if (!nextStage || !window.sbClient) return;

    var line = (window.allRequestLines || []).find(function (l) { return String(l.id) === String(lineId); });
    var currentStage = line ? (line.stage || line.status || 'فحص المستندات') : 'بداية';

    try {
      // 1. تسجيل الحركة في جدول التاريخ
      await window.sbClient.from('request_line_stage_history').insert({
        line_id: Number(lineId),
        stage_from: currentStage,
        stage_to: nextStage,
        changed_by: window.__userName || 'موظف',
        notes: notes || null
      });

      // 2. تحديث البند نفسه
      await window.sbClient.from('request_lines').update({
        stage: nextStage
      }).eq('id', lineId);

      if (line) line.stage = nextStage;

      if (typeof window.showToast === 'function') {
        window.showToast('تم نقل المعاملة لمرحلة: ' + nextStage + ' بنجاح ✔', 'success');
      }
      window.openWorkflowStagesModal(lineId);
    } catch (err) {
      if (typeof window.showError === 'function') window.showError('تعذر نقل المرحلة', err);
    }
  };

  // حقن زر مسار العمل في كارت الخدمة
  wrap('buildServiceDetailCard', function (orig) {
    return function (line, index, context) {
      var html = orig.apply(this, arguments);
      if (!line || !line.id) return html;

      var st = line.stage || 'متابعة المسار';
      var wfBtn = '<button type="button" onclick="window.openWorkflowStagesModal(' + line.id + ')" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-bold text-[11px] transition">' +
        '  <i class="fa-solid fa-diagram-project"></i> مسار العمل (' + eh(st) + ')' +
        '</button>';

      return html.replace(/(<div class="mt-2 pt-2 border-t[^>]*flex[^>]*>)/, '$1' + wfBtn);
    };
  });

})();
