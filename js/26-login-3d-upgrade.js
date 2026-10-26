(function () {
  "use strict";
  window.TASAHEL_SYSTEM_VERSION = "v3.0.0 Pro";
  window.toggleSidebarV3 = function () {
    const sb = document.getElementById("glassy-sidebar");
    const ic = document.getElementById("sidebar-toggle-icon");
    if (!sb) return;
    const isCollapsed = sb.classList.toggle("collapsed");
    document.body.classList.toggle("sidebar-is-collapsed", isCollapsed);
    localStorage.setItem("tasahel_sidebar_collapsed", isCollapsed ? "1" : "0");
    if (ic) {
      ic.className = isCollapsed ? "fa-solid fa-chevron-left text-xs" : "fa-solid fa-chevron-right text-xs";
    }
  };
  function restoreSidebarState() {
    const saved = localStorage.getItem("tasahel_sidebar_collapsed") === "1";
    if (saved && window.innerWidth > 900) {
      const sb = document.getElementById("glassy-sidebar");
      const ic = document.getElementById("sidebar-toggle-icon");
      if (sb) sb.classList.add("collapsed");
      document.body.classList.add("sidebar-is-collapsed");
      if (ic) ic.className = "fa-solid fa-chevron-left text-xs";
    }
  }
  function syncSidebarActiveTab() {
    const cur = window.currentTab || "home";
    document.querySelectorAll(".sidebar-item").forEach(item => {
      const fn = item.getAttribute("onclick") || "";
      const isTarget = fn.includes("'" + cur + "'") || fn.includes('"' + cur + '"');
      item.classList.toggle("active", isTarget);
    });
    const uName = document.getElementById("sidebar-user-name");
    const uAv = document.getElementById("sidebar-user-avatar");
    if (window.myProfile && window.myProfile.full_name) {
      if (uName) uName.textContent = window.myProfile.full_name;
      if (uAv && typeof window.avatarHtml === "function") {
        uAv.innerHTML = window.avatarHtml(window.myProfile, 32);
      }
    } else if (window.currentUser && window.currentUser.email) {
      if (uName) uName.textContent = window.currentUser.email.split("@")[0];
    }
  }
  const origSwitchTab = window.switchTab;
  if (typeof origSwitchTab === "function") {
    window.switchTab = function (id) {
      const res = origSwitchTab.apply(this, arguments);
      syncSidebarActiveTab();
      return res;
    };
  }
  document.addEventListener("DOMContentLoaded", function () {
    restoreSidebarState();
    syncSidebarActiveTab();
  });
  setInterval(syncSidebarActiveTab, 1000);
})();