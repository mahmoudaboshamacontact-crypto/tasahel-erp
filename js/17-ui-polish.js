/* ===== المرحلة 15: اسم التاب الحالي ===== */
(function () {
  if (window.__phase15) return; window.__phase15 = true;
  function paintTitle(id) {
    const main = document.querySelector('main'); if (!main) return;
    let t = document.getElementById('cur-tab-title');
    if (!t) { main.insertAdjacentHTML('afterbegin', '<div id="cur-tab-title" class="text-ink dark:text-white"><span class="flex h-8 w-8 items-center justify-center rounded-xl bg-ink text-white dark:bg-brand-600"><i></i></span><span class="cur-name"></span></div>'); t = document.getElementById('cur-tab-title'); }
    const b = document.getElementById('tab-' + id + '-btn'); if (!b) { t.classList.add('hidden'); return; }
    const ic = b.querySelector('i'), nm = b.querySelector('span:not([class*="rounded-full"])');
    t.classList.remove('hidden');
    t.querySelector('i').className = ic ? ic.className : '';
    t.querySelector('.cur-name').textContent = nm ? nm.textContent : '';
  }
  const _st = window.switchTab;
  window.switchTab = function (id) { const r = _st.apply(this, arguments); try { paintTitle(id); } catch (e) { /* */ } return r; };
  try { paintTitle(window.currentTab || 'new'); } catch (e) { /* */ }
})();
