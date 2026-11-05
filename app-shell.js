const page = document.body.dataset.page || "overview";
const pageTitles = {
  overview: "Overview",
  residents: "Residents",
  payments: "Monthly dues",
  map: "Property map",
  reports: "Reports",
  settings: "Settings"
};
const pageTitle = pageTitles[page];
const content = document.getElementById("page-content");

if (content && pageTitle) {
  const contentMarkup = content.innerHTML;
  content.remove();
  document.getElementById("app-shell").innerHTML = `
    <aside class="sidebar" id="sidebar">
      <a class="brand" href="dashboard.html" aria-label="Bistek Village dashboard">
        <span class="brand-mark"><svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M5 15.1 16 6l11 9.1v11.2a1.7 1.7 0 0 1-1.7 1.7h-5.8v-8.5h-7v8.5H6.7A1.7 1.7 0 0 1 5 26.3V15.1Z" fill="currentColor"/><path d="m3.7 14.8 11.2-9.4a1.8 1.8 0 0 1 2.2 0l11.2 9.4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></span>
        <span class="brand-name">haven<span>.</span><small>BISTEK VILLAGE ADMIN</small></span>
      </a>
      <div class="side-label">WORKSPACE</div>
      <nav class="side-nav" aria-label="Main navigation">
        <a class="nav-link ${page === "overview" ? "active" : ""}" href="dashboard.html"><span class="nav-icon"><svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="4" rx="1.5"/><rect x="13.5" y="9.5" width="7" height="11" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/></svg></span>Overview</a>
        <a class="nav-link ${page === "residents" ? "active" : ""}" href="residents.html"><span class="nav-icon"><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.8 20v-1.5a6.2 6.2 0 0 1 12.4 0V20M16 5.2a3.5 3.5 0 0 1 0 6.7m2 3a5 5 0 0 1 3.2 4.7V20"/></svg></span>Residents<span class="nav-count" id="resident-count">0</span></a>
        <a class="nav-link ${page === "payments" ? "active" : ""}" href="payments.html"><span class="nav-icon"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 10h18m-13 5h3"/></svg></span>Monthly dues</a>
        <a class="nav-link ${page === "map" ? "active" : ""}" href="map.html"><span class="nav-icon"><svg viewBox="0 0 24 24"><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z"/><path d="M9 3v15m6-12v15"/></svg></span>Property map</a>
        <a class="nav-link ${page === "reports" ? "active" : ""}" href="reports.html"><span class="nav-icon"><svg viewBox="0 0 24 24"><path d="M4 20V10m5 10V4m5 16v-7m5 7V7"/></svg></span>Reports</a>
      </nav>
      <div class="side-label tools-label">MANAGE</div>
      <nav class="side-nav" aria-label="Management navigation">
        <a class="nav-link ${page === "settings" ? "active" : ""}" href="settings.html"><span class="nav-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a7.8 7.8 0 0 1-1.8 1l-.3 1.8h-2.8l-.3-1.8a7.8 7.8 0 0 1-1.8-1l-1.7.7-1.4-2.4 1.4-1.1a7 7 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.7a7.8 7.8 0 0 1 1.8-1l.3-1.8h2.8l.3 1.8a7.8 7.8 0 0 1 1.8 1l1.7-.7 1.4 2.4-1.4 1.1a7 7 0 0 1 0 2Z" transform="translate(-1 -1) scale(1.08)"/></svg></span>Settings</a>
      </nav>
      <div class="sidebar-bottom">
        <div class="help-card"><div class="help-spark">✳</div><strong>Need a hand?</strong><p>Your community, a little easier to manage.</p><a href="mailto:support@haven.example">Contact support <span>↗</span></a></div>
        <div class="profile-button"><span class="avatar admin-avatar">AM</span><span class="profile-copy"><strong>Community Admin</strong><small>Administrator</small></span><button class="profile-logout" id="logout-button" type="button">Sign out</button></div>
      </div>
    </aside>
    <main class="main-content">
      <header class="topbar">
        <button class="mobile-menu" id="mobile-menu" aria-label="Toggle menu"><svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
        <div class="breadcrumb"><span>Workspace</span><span class="crumb-slash">/</span><strong id="breadcrumb-current">${pageTitle}</strong></div>
        <div class="top-actions"><span class="today-label" id="today-label"></span><button class="icon-button notification-button" aria-label="Notifications" id="notifications-button"><svg viewBox="0 0 24 24"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12h4"/></svg><i></i></button><button class="top-avatar" aria-label="Administrator">AM</button></div>
      </header>
      <div class="page-wrap">${contentMarkup}</div>
    </main>
    <div class="modal-backdrop hidden" id="resident-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-card">
        <div class="modal-header"><div><p class="eyebrow">COMMUNITY DIRECTORY</p><h2 id="modal-title">Add a resident</h2></div><button class="modal-close" id="modal-close" aria-label="Close dialog">×</button></div>
        <form id="resident-form" class="resident-form"><div class="form-grid">
          <label>Full name<input name="name" placeholder="e.g. Jamie Rivera" required maxlength="70" /></label>
          <label>Phone number<input name="phone" type="tel" placeholder="e.g. 0917 123 4567" required maxlength="24" /></label>
          <label>Email address<input name="email" type="email" placeholder="e.g. jamie@email.com" maxlength="100" /></label>
          <label>House / lot number<input name="lot" placeholder="e.g. A-09" required maxlength="20" /></label>
          <label>Street<input name="street" placeholder="e.g. Acacia Lane" required maxlength="60" /></label>
          <label>Monthly dues (₱)<input name="monthlyDues" type="number" min="0" step="50" placeholder="500" required /></label>
        </div><div class="form-footer"><p>Monthly dues start as unpaid for the current month.</p><button class="button button-primary" type="submit">Add resident</button></div></form>
      </div>
    </div>
    <div class="toast" id="toast" role="status" aria-live="polite"></div>`;
  const menuButton = document.getElementById("mobile-menu");
  menuButton.addEventListener("click", () => document.getElementById("sidebar").classList.toggle("mobile-open"));
}
