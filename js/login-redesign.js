/* login-redesign.js — Clean English login interactions, Remember Me, Password Eye, Forgot Password, and Client-side Rate Limiting */
(function () {
  var RL_KEY = 'ts_login_rl_v1';
  var REM_KEY = 'ts_remember_email';
  var MAX_ATTEMPTS = 5;
  var LOCK_MS = 60 * 1000;
  var lockTimer = null;

  function byId(id) { return document.getElementById(id); }

  function getRl() {
    try {
      var raw = localStorage.getItem(RL_KEY);
      if (!raw) return { fails: 0, lockUntil: 0 };
      var parsed = JSON.parse(raw);
      return {
        fails: Number(parsed.fails) || 0,
        lockUntil: Number(parsed.lockUntil) || 0
      };
    } catch (_) {
      return { fails: 0, lockUntil: 0 };
    }
  }

  function saveRl(rl) {
    try { localStorage.setItem(RL_KEY, JSON.stringify(rl)); } catch (_) {}
  }

  function resetRl() {
    try { localStorage.removeItem(RL_KEY); } catch (_) {}
  }

  function updateLockUi() {
    var btn = byId('login-btn');
    var box = byId('login-error');
    if (!btn || !box) return false;
    var rl = getRl();
    var now = Date.now();
    if (rl.lockUntil > now) {
      var secs = Math.ceil((rl.lockUntil - now) / 1000);
      btn.disabled = true;
      box.textContent = 'Too many failed attempts. Please wait ' + secs + 's before trying again.';
      box.classList.remove('hidden');
      if (!lockTimer) {
        lockTimer = setInterval(function () {
          var stillLocked = updateLockUi();
          if (!stillLocked) {
            clearInterval(lockTimer);
            lockTimer = null;
          }
        }, 1000);
      }
      return true;
    }
    if (rl.lockUntil && rl.lockUntil <= now) {
      saveRl({ fails: 0, lockUntil: 0 });
      box.classList.add('hidden');
    }
    btn.disabled = false;
    return false;
  }

  function initLoginUi() {
    var eyeBtn = byId('login-eye-btn');
    var passEl = byId('login-password');
    var emailEl = byId('login-email');
    var remBtn = byId('login-remember');
    var forgotBtn = byId('login-forgot-btn');
    var modal = byId('forgot-modal');
    var closeForgot = byId('forgot-cancel-btn');
    var sendForgot = byId('forgot-send-btn');
    var forgotEmail = byId('forgot-email');

    if (eyeBtn && passEl) {
      eyeBtn.addEventListener('click', function () {
        passEl.type = passEl.type === 'password' ? 'text' : 'password';
      });
    }

    if (remBtn && emailEl) {
      try {
        var savedEmail = localStorage.getItem(REM_KEY);
        if (savedEmail) {
          emailEl.value = savedEmail;
          remBtn.setAttribute('aria-checked', 'true');
        }
      } catch (_) {}

      remBtn.addEventListener('click', function () {
        var next = remBtn.getAttribute('aria-checked') !== 'true';
        remBtn.setAttribute('aria-checked', String(next));
        try {
          if (!next) localStorage.removeItem(REM_KEY);
          else if (emailEl.value.trim()) localStorage.setItem(REM_KEY, emailEl.value.trim());
        } catch (_) {}
      });
    }

    if (forgotBtn && modal) {
      forgotBtn.addEventListener('click', function () {
        if (forgotEmail && emailEl && emailEl.value.trim()) {
          forgotEmail.value = emailEl.value.trim();
        }
        modal.classList.add('open');
      });
    }

    if (closeForgot && modal) {
      closeForgot.addEventListener('click', function () {
        modal.classList.remove('open');
      });
    }

    if (sendForgot && modal) {
      sendForgot.addEventListener('click', async function () {
        var target = forgotEmail ? forgotEmail.value.trim() : '';
        if (!target) return;
        if (typeof window.sbClient === 'undefined' || !window.sbClient) {
          if (typeof window.initSupabase === 'function') window.initSupabase();
        }
        try {
          if (window.sbClient && window.sbClient.auth) {
            await window.sbClient.auth.resetPasswordForEmail(target, {
              redirectTo: window.location.origin
            });
          }
          modal.classList.remove('open');
          if (typeof window.showToast === 'function') {
            window.showToast('تم إرسال رابط استعادة كلمة المرور إلى بريدك', 'success');
          }
        } catch (err) {
          if (typeof window.showToast === 'function') {
            window.showToast('تعذر إرسال الرابط: ' + (err && err.message ? err.message : ''), 'error');
          }
        }
      });
    }

    // Wrap window.handleLogin safely to add rate limiting + Remember Me + clean English button label
    var origHandleLogin = window.handleLogin;
    if (typeof origHandleLogin === 'function') {
      window.handleLogin = async function (e) {
        if (e && e.preventDefault) e.preventDefault();
        if (updateLockUi()) return;

        if (remBtn && emailEl) {
          try {
            if (remBtn.getAttribute('aria-checked') === 'true' && emailEl.value.trim()) {
              localStorage.setItem(REM_KEY, emailEl.value.trim());
            } else {
              localStorage.removeItem(REM_KEY);
            }
          } catch (_) {}
        }

        await origHandleLogin(e);

        var btn = byId('login-btn');
        var box = byId('login-error');
        var loginSection = byId('login');
        var succeeded = loginSection && loginSection.classList.contains('hidden');

        if (succeeded) {
          resetRl();
        } else if (box && !box.classList.contains('hidden')) {
          var rl = getRl();
          rl.fails += 1;
          if (rl.fails >= MAX_ATTEMPTS) {
            rl.lockUntil = Date.now() + LOCK_MS;
          }
          saveRl(rl);
          if (!updateLockUi() && rl.fails > 0) {
            var left = MAX_ATTEMPTS - rl.fails;
            box.textContent = 'Invalid email or password (' + left + ' attempts left).';
          }
        }

        if (btn && !btn.disabled) {
          btn.textContent = 'Login';
        }
      };
    }

    updateLockUi();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLoginUi);
  } else {
    initLoginUi();
  }
})();
