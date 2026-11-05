const STORAGE_KEY = "haven-community-admin-v1";
const DATA_VERSION = 2;

const initialResidents = [
  { id: "resident-1", name: "Sofia Reyes", phone: "0917 234 8810", email: "sofia.reyes@email.com", lot: "A-01", street: "Acacia Lane", monthlyDues: 500, paid: true, paidAt: "Nov 02" },
  { id: "resident-2", name: "Marcus Dela Cruz", phone: "0918 552 1903", email: "marcus.dc@email.com", lot: "A-02", street: "Acacia Lane", monthlyDues: 500, paid: true, paidAt: "Nov 03" },
  { id: "resident-3", name: "Isabella Santos", phone: "0920 341 7726", email: "isabella.s@email.com", lot: "A-03", street: "Acacia Lane", monthlyDues: 500, paid: false },
  { id: "resident-4", name: "Noah Garcia", phone: "0917 809 4412", email: "noah.garcia@email.com", lot: "A-04", street: "Acacia Lane", monthlyDues: 500, paid: true, paidAt: "Nov 01" },
  { id: "resident-5", name: "Amara Villanueva", phone: "0998 112 0634", email: "amara.v@email.com", lot: "B-01", street: "Mango Street", monthlyDues: 500, paid: false },
  { id: "resident-6", name: "Ethan Lim", phone: "0916 875 3201", email: "ethan.lim@email.com", lot: "B-02", street: "Mango Street", monthlyDues: 500, paid: true, paidAt: "Nov 04" },
  { id: "resident-7", name: "Chloe Mendoza", phone: "0927 405 6912", email: "chloe.m@email.com", lot: "B-03", street: "Mango Street", monthlyDues: 500, paid: false },
  { id: "resident-8", name: "Liam Bautista", phone: "0917 661 0285", email: "liam.b@email.com", lot: "B-04", street: "Mango Street", monthlyDues: 500, paid: true, paidAt: "Nov 02" },
  { id: "resident-9", name: "Mia Fernandez", phone: "0922 173 8806", email: "mia.f@email.com", lot: "C-01", street: "Pine Avenue", monthlyDues: 500, paid: false },
  { id: "resident-10", name: "Lucas Navarro", phone: "0915 908 2751", email: "lucas.n@email.com", lot: "C-02", street: "Pine Avenue", monthlyDues: 500, paid: true, paidAt: "Nov 05" },
  { id: "resident-11", name: "Zara Castillo", phone: "0995 347 6219", email: "zara.c@email.com", lot: "C-03", street: "Pine Avenue", monthlyDues: 500, paid: false },
  { id: "resident-12", name: "Caleb Torres", phone: "0918 720 5146", email: "caleb.t@email.com", lot: "C-04", street: "Pine Avenue", monthlyDues: 500, paid: false }
];

const defaultSettings = { communityName: "Bistek Village", defaultMonthlyDues: 500, dueDay: 5 };
const today = new Date();
const currentMonth = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(today);
const currentMonthShort = new Intl.DateTimeFormat("en", { month: "short" }).format(today);
const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
const dateLabel = new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(today);
let dataNeedsSaving = false;
let toastTimer;
let state = loadState();
let selectedResidentId = null;

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (stored && Array.isArray(stored.residents) && stored.settings) {
      const needsDuesMigration = stored.dataVersion !== DATA_VERSION;
      dataNeedsSaving = needsDuesMigration;
      return {
        residents: stored.residents.map((resident) => {
          const migratedResident = {
            ...resident,
            monthlyDues: needsDuesMigration
              ? defaultSettings.defaultMonthlyDues
              : Number(resident.monthlyDues ?? defaultSettings.defaultMonthlyDues),
            paidMonth: resident.paidMonth || (resident.paid && (!resident.paidAt || resident.paidAt.startsWith(currentMonthShort)) ? currentMonthKey : null)
          };
          delete migratedResident.rent;
          return migratedResident;
        }),
        settings: {
          ...defaultSettings,
          ...stored.settings,
          communityName: needsDuesMigration ? defaultSettings.communityName : stored.settings.communityName,
          defaultMonthlyDues: needsDuesMigration
            ? defaultSettings.defaultMonthlyDues
            : Number(stored.settings.defaultMonthlyDues ?? defaultSettings.defaultMonthlyDues)
        }
      };
    }
  } catch (error) {
    console.error("Could not load saved community data.", error);
    showToast("Saved data could not be loaded. Using the demo list instead.");
  }
  return {
    residents: initialResidents.map((resident) => ({
      ...resident,
      paidMonth: resident.paid ? currentMonthKey : null
    })),
    settings: { ...defaultSettings }
  };
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, dataVersion: DATA_VERSION }));
  } catch (error) {
    console.error("Could not save community data.", error);
    showToast("Could not save changes in this browser.");
  }
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function formatCurrency(value) {
  return `₱${Number(value || 0).toLocaleString("en-PH")}`;
}

function initials(name) {
  return String(name).trim().split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase();
}

function isPaid(resident) {
  return resident.paidMonth === currentMonthKey;
}

function paymentStatus(resident) {
  if (isPaid(resident)) return "paid";
  const dueDate = new Date(today.getFullYear(), today.getMonth(), Number(state.settings.dueDay));
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return todayDate > dueDate ? "overdue" : "due";
}

function statusMarkup(resident) {
  const status = paymentStatus(resident);
  const labels = { paid: "Paid", due: "Due soon", overdue: "Overdue" };
  return `<span class="status-badge status-${status}">${labels[status]}</span>`;
}

function residentCell(resident) {
  return `<div class="resident-cell"><span class="resident-avatar">${escapeHTML(initials(resident.name))}</span><span><strong class="resident-name">${escapeHTML(resident.name)}</strong><small class="resident-email">${escapeHTML(resident.email || resident.phone)}</small></span></div>`;
}

function render() {
  const total = state.residents.reduce((sum, resident) => sum + Number(resident.monthlyDues || 0), 0);
  const paidResidents = state.residents.filter(isPaid);
  const pendingResidents = state.residents.filter((resident) => !isPaid(resident));
  const paidTotal = paidResidents.reduce((sum, resident) => sum + Number(resident.monthlyDues || 0), 0);
  const outstanding = total - paidTotal;
  const rate = total ? Math.round((paidTotal / total) * 100) : 0;
  const dueCount = pendingResidents.filter((resident) => paymentStatus(resident) === "due").length;
  const overdueCount = pendingResidents.length - dueCount;

  const setText = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  };
  const setWidth = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.style.width = `${value}%`;
  };
  setText("today-label", dateLabel);
  setText("resident-count", state.residents.length);
  document.querySelectorAll("[data-community-name]").forEach((element) => { element.textContent = state.settings.communityName; });

  if (document.getElementById("stat-residents")) {
    setText("period-chip", currentMonth);
    setText("stat-residents", state.residents.length);
    setText("stat-collected", formatCurrency(paidTotal));
    setText("stat-total", formatCurrency(total));
    setText("stat-outstanding", formatCurrency(outstanding));
    setText("collected-count", `${paidResidents.length} paid`);
    setText("outstanding-count", `${pendingResidents.length} resident${pendingResidents.length === 1 ? "" : "s"}`);
    setText("stat-rate", rate);
    setWidth("collection-progress", rate);
    setWidth("collection-bar-fill", rate);
    setText("collection-summary-amount", formatCurrency(paidTotal));
    setText("collection-summary-caption", `${paidResidents.length} of ${state.residents.length} residents have paid`);
    setText("legend-paid", paidResidents.length);
    setText("legend-due", pendingResidents.length);
    setText("reminder-title", pendingResidents.length ? `${pendingResidents.length} payment${pendingResidents.length === 1 ? "" : "s"} to follow up` : "Looking good!");
    setText("reminder-copy", overdueCount ? `${overdueCount} overdue · ${dueCount} due soon. Check the dues register.` : pendingResidents.length ? "A quick reminder can help keep collections on track." : "All residents are up to date this month.");
    const overviewTable = document.getElementById("overview-table");
    if (overviewTable) {
      overviewTable.innerHTML = state.residents.slice(0, 5).map((resident) => `<tr><td>${residentCell(resident)}</td><td class="property-cell">${escapeHTML(resident.lot)} · ${escapeHTML(resident.street)}</td><td class="amount-cell">${formatCurrency(resident.monthlyDues)}</td><td>${statusMarkup(resident)}</td><td>${isPaid(resident) ? `<span class="row-action">${escapeHTML(resident.paidAt || "Paid")}</span>` : `<button class="row-action mark-paid" data-mark-paid="${escapeHTML(resident.id)}">Mark paid</button>`}</td></tr>`).join("");
      document.getElementById("overview-empty").classList.toggle("hidden", state.residents.length > 0);
    }
  }

  setText("payments-collected", formatCurrency(paidTotal));
  setText("payments-pending", formatCurrency(outstanding));
  setText("payments-expected", formatCurrency(total));
  setText("payments-paid-count", `${paidResidents.length} resident${paidResidents.length === 1 ? "" : "s"} paid`);
  setText("payments-pending-count", `${pendingResidents.length} payment${pendingResidents.length === 1 ? "" : "s"} remaining`);
  setText("payments-month-label", currentMonth);

  setText("report-period", currentMonth);
  setText("report-expected", formatCurrency(total));
  setText("report-collected", formatCurrency(paidTotal));
  setText("report-outstanding", formatCurrency(outstanding));
  setText("report-paid-count", `${paidResidents.length} payments recorded`);
  setText("report-due-count", `${pendingResidents.length} payments pending`);
  setText("report-rate", rate);
  setWidth("report-progress", rate);
  setText("donut-rate", `${rate}%`);
  const donut = document.getElementById("report-donut");
  if (donut) donut.style.background = `conic-gradient(#84a26b 0% ${rate}%, #edf0e9 ${rate}% 100%)`;
  setText("report-legend-paid", `${paidResidents.length} residents · ${formatCurrency(paidTotal)}`);
  setText("report-legend-due", `${dueCount} residents · ${formatCurrency(pendingResidents.filter((resident) => paymentStatus(resident) === "due").reduce((sum, resident) => sum + Number(resident.monthlyDues), 0))}`);
  setText("report-legend-late", `${overdueCount} residents · ${formatCurrency(pendingResidents.filter((resident) => paymentStatus(resident) === "overdue").reduce((sum, resident) => sum + Number(resident.monthlyDues), 0))}`);

  const residentSearch = document.getElementById("resident-search");
  if (residentSearch) renderResidentsTable(residentSearch.value);
  const paymentSearch = document.getElementById("payment-search");
  if (paymentSearch) renderPaymentsTable(paymentSearch.value);
  const pageCount = document.getElementById("resident-page-count");
  if (pageCount) pageCount.textContent = `All residents · ${state.residents.length}`;
  const paymentsPageCount = document.getElementById("payments-page-count");
  if (paymentsPageCount) paymentsPageCount.textContent = `All payments · ${state.residents.length}`;
  setText("map-home-count", `${state.residents.length} homes`);
  if (document.getElementById("mini-map") || document.getElementById("full-map")) renderMaps();
  if (document.getElementById("selected-home")) renderSelectedHome();
}

function renderResidentsTable(query = "") {
  const table = document.getElementById("residents-table");
  if (!table) return;
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = state.residents.filter((resident) => [resident.name, resident.email, resident.phone, resident.lot, resident.street].some((value) => String(value || "").toLowerCase().includes(normalizedQuery)));
  table.innerHTML = filtered.map((resident) => `<tr><td>${residentCell(resident)}</td><td class="property-cell">${escapeHTML(resident.lot)}<br><span class="resident-email">${escapeHTML(resident.street)}</span></td><td>${escapeHTML(resident.phone)}<br><span class="resident-email">${escapeHTML(resident.email || "No email")}</span></td><td class="amount-cell">${formatCurrency(resident.monthlyDues)}</td><td>${statusMarkup(resident)}</td><td><a class="row-action" href="map.html?resident=${encodeURIComponent(resident.id)}">View home</a></td></tr>`).join("");
  document.getElementById("residents-empty").classList.toggle("hidden", filtered.length > 0);
}

function renderPaymentsTable(query = "") {
  const table = document.getElementById("payments-table");
  if (!table) return;
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = state.residents.filter((resident) => [resident.name, resident.lot, resident.street].some((value) => String(value || "").toLowerCase().includes(normalizedQuery)));
  table.innerHTML = filtered.map((resident) => `<tr><td>${residentCell(resident)}</td><td class="property-cell">${escapeHTML(resident.lot)} · ${escapeHTML(resident.street)}</td><td class="amount-cell">${formatCurrency(resident.monthlyDues)}</td><td>${escapeHTML(currentMonthShort)} ${Number(state.settings.dueDay)}, ${today.getFullYear()}</td><td>${statusMarkup(resident)}</td><td>${isPaid(resident) ? `<button class="row-action" data-mark-unpaid="${escapeHTML(resident.id)}">Undo</button>` : `<button class="row-action mark-paid" data-mark-paid="${escapeHTML(resident.id)}">Mark paid</button>`}</td></tr>`).join("");
  document.getElementById("payments-empty").classList.toggle("hidden", filtered.length > 0);
}

function lotMarkup(resident, compact = false) {
  const status = resident ? paymentStatus(resident) : "vacant";
  const name = resident ? resident.name.split(" ")[0] : "Vacant";
  if (compact) {
    const contents = `<span>${escapeHTML(resident ? resident.lot : "—")}</span>`;
    return resident
      ? `<a class="lot-pin ${status === "overdue" ? "overdue" : status}" href="map.html?resident=${encodeURIComponent(resident.id)}" aria-label="${escapeHTML(resident.lot)}, ${escapeHTML(resident.name)}, ${status}">${contents}</a>`
      : `<span class="lot-pin vacant" aria-label="Vacant lot">${contents}</span>`;
  }
  return `<button type="button" class="map-lot ${status}" data-select-resident="${resident ? escapeHTML(resident.id) : ""}" ${resident ? "" : "disabled"} aria-label="${resident ? `${escapeHTML(resident.lot)}, ${escapeHTML(resident.name)}, ${status}` : "Vacant lot"}"><span class="map-lot-mark">⌂</span><span class="map-lot-code">${escapeHTML(resident ? resident.lot : "—")}</span><span class="map-lot-name">${escapeHTML(name)}</span></button>`;
}

function renderMaps() {
  const mini = document.getElementById("mini-map");
  const full = document.getElementById("full-map");
  if (!mini && !full) return;
  const standardLayout = ["A-01", "A-02", "A-03", "A-04", "B-01", "B-02", "B-03", "B-04", "C-01", "C-02", "C-03", "C-04"];
  const additionalLots = state.residents.map((resident) => resident.lot.toUpperCase()).filter((lot) => !standardLayout.includes(lot)).sort();
  const layout = [...standardLayout, ...additionalLots];
  const byLot = new Map(state.residents.map((resident) => [resident.lot.toUpperCase(), resident]));
  const rowCount = Math.ceil(layout.length / 6);
  if (mini) {
    mini.style.gridTemplateRows = `repeat(${Math.max(3, rowCount)}, minmax(28px, 1fr))`;
    mini.style.minHeight = `${Math.max(138, Math.max(3, rowCount) * 38 + 32)}px`;
    mini.innerHTML = layout.map((lot) => lotMarkup(byLot.get(lot), true)).join("");
  }
  if (full) {
    full.style.gridTemplateRows = `repeat(${Math.max(4, rowCount)}, 76px)`;
    full.style.minHeight = `${Math.max(420, Math.max(4, rowCount) * 87 + 50)}px`;
    full.innerHTML = `<span class="street-label street-horizontal">MANGO STREET</span><span class="street-label street-vertical">ACACIA LANE</span>${layout.map((lot) => lotMarkup(byLot.get(lot))).join("")}`;
  }
}

function renderSelectedHome() {
  const panel = document.getElementById("selected-home");
  if (!panel) return;
  const resident = state.residents.find((item) => item.id === selectedResidentId);
  document.querySelectorAll(".map-lot").forEach((lot) => lot.classList.toggle("selected", Boolean(resident && lot.dataset.selectResident === resident.id)));
  if (!resident) {
    panel.innerHTML = `<div class="selected-empty"><span class="selected-house">⌂</span><h3>Select a home</h3><p>Choose a lot on the map to see resident and payment details.</p></div>`;
    return;
  }
  panel.innerHTML = `<div class="selected-resident-head"><span class="resident-avatar">${escapeHTML(initials(resident.name))}</span><span><strong>${escapeHTML(resident.name)}</strong><small>${escapeHTML(resident.lot)} · ${escapeHTML(resident.street)}</small></span></div><div class="selected-detail"><span>Monthly dues</span><strong>${formatCurrency(resident.monthlyDues)}</strong></div><div class="selected-detail"><span>Phone</span><strong>${escapeHTML(resident.phone)}</strong></div><div class="selected-detail"><span>This month</span><strong>${statusMarkup(resident)}</strong></div><div class="selected-actions">${isPaid(resident) ? `<button class="button button-secondary" data-mark-unpaid="${escapeHTML(resident.id)}">Undo payment</button>` : `<button class="button button-primary" data-mark-paid="${escapeHTML(resident.id)}">Mark dues as paid</button>`}<a class="button button-secondary" href="residents.html">View resident directory</a></div>`;
}

function selectResident(id) {
  if (!id) return;
  selectedResidentId = id;
  renderSelectedHome();
  const resident = state.residents.find((item) => item.id === id);
  if (resident) {
    const selectedLot = document.querySelector(`.map-lot[data-select-resident="${CSS.escape(id)}"]`);
    if (selectedLot) selectedLot.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

function markPaid(id) {
  const resident = state.residents.find((item) => item.id === id);
  if (!resident) return;
  resident.paidMonth = currentMonthKey;
  delete resident.paid;
  resident.paidAt = `${currentMonthShort} ${String(today.getDate()).padStart(2, "0")}`;
  saveState();
  render();
  showToast(`${resident.name}'s monthly dues marked as paid.`);
}

function markUnpaid(id) {
  const resident = state.residents.find((item) => item.id === id);
  if (!resident) return;
  delete resident.paidMonth;
  delete resident.paid;
  delete resident.paidAt;
  saveState();
  render();
  showToast(`${resident.name}'s payment was marked unpaid.`);
}

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2800);
}

function openModal() {
  const form = document.getElementById("resident-form");
  if (!form) return;
  form.querySelector('[name="monthlyDues"]').value = state.settings.defaultMonthlyDues;
  document.getElementById("resident-modal").classList.remove("hidden");
  form.querySelector('input[name="name"]').focus();
}

function closeModal() {
  document.getElementById("resident-modal")?.classList.add("hidden");
}

function exportCSV() {
  const rows = [
    ["Resident", "Phone", "Email", "Lot", "Street", "Monthly dues", "Month", "Status", "Paid date"],
    ...state.residents.map((resident) => [resident.name, resident.phone, resident.email || "", resident.lot, resident.street, resident.monthlyDues, currentMonth, isPaid(resident) ? "Paid" : paymentStatus(resident) === "overdue" ? "Overdue" : "Due soon", resident.paidAt || ""])
  ];
  const csv = rows.map((row) => row.map((field) => `"${String(field).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `bistek-village-dues-report-${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("Your monthly dues report has been downloaded.");
}

document.querySelectorAll("[data-open-add]").forEach((button) => button.addEventListener("click", openModal));
document.querySelectorAll("[data-export]").forEach((button) => button.addEventListener("click", exportCSV));
document.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest("[data-mark-paid], [data-mark-unpaid], [data-select-resident], [data-view-residents]");
  if (!button) return;
  if (button.hasAttribute("data-mark-paid")) markPaid(button.dataset.markPaid);
  else if (button.hasAttribute("data-mark-unpaid")) markUnpaid(button.dataset.markUnpaid);
  else if (button.hasAttribute("data-select-resident")) {
    event.preventDefault();
    selectResident(button.dataset.selectResident);
  }
});
document.getElementById("export-button")?.addEventListener("click", exportCSV);
document.getElementById("payments-export-button")?.addEventListener("click", exportCSV);
document.getElementById("resident-search")?.addEventListener("input", (event) => renderResidentsTable(event.target.value));
document.getElementById("payment-search")?.addEventListener("input", (event) => renderPaymentsTable(event.target.value));
document.getElementById("modal-close")?.addEventListener("click", closeModal);
document.getElementById("resident-modal")?.addEventListener("click", (event) => {
  if (event.target.id === "resident-modal") closeModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModal();
});
document.getElementById("notifications-button")?.addEventListener("click", () => {
  const pending = state.residents.filter((resident) => !isPaid(resident)).length;
  showToast(pending ? `${pending} resident dues payment${pending === 1 ? "" : "s"} still need attention.` : "All village dues are up to date.");
});
document.getElementById("resident-form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const resident = {
    id: `resident-${Date.now()}`,
    name: String(formData.get("name")).trim(),
    phone: String(formData.get("phone")).trim(),
    email: String(formData.get("email")).trim(),
    lot: String(formData.get("lot")).trim().toUpperCase(),
    street: String(formData.get("street")).trim(),
    monthlyDues: Number(formData.get("monthlyDues")),
  };
  if (state.residents.some((item) => item.lot.toLowerCase() === resident.lot.toLowerCase())) {
    showToast("That house or lot number is already in use.");
    return;
  }
  if (!Number.isFinite(resident.monthlyDues) || resident.monthlyDues < 0) {
    showToast("Enter a valid monthly dues amount.");
    return;
  }
  state.residents.push(resident);
  saveState();
  event.currentTarget.reset();
  closeModal();
  render();
  showToast(`${resident.name} was added to the community.`);
});
document.getElementById("settings-form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const communityName = String(formData.get("communityName")).trim();
  const defaultMonthlyDues = Number(formData.get("defaultMonthlyDues"));
  const dueDay = Number(formData.get("dueDay"));
  if (!communityName || !Number.isFinite(defaultMonthlyDues) || defaultMonthlyDues < 0 || dueDay < 1 || dueDay > 28) {
    showToast("Check the community settings and try again.");
    return;
  }
  state.settings = { communityName, defaultMonthlyDues, dueDay };
  saveState();
  document.title = `${communityName} — Settings`;
  document.getElementById("settings-saved").textContent = "Changes saved";
  window.setTimeout(() => { document.getElementById("settings-saved").textContent = ""; }, 2500);
  render();
});

document.title = `${document.body.dataset.page === "overview" ? "Overview" : document.body.dataset.page === "map" ? "Community map" : document.body.dataset.page === "payments" ? "Monthly dues" : document.body.dataset.page === "residents" ? "Residents" : document.body.dataset.page === "reports" ? "Reports" : "Settings"} — ${state.settings.communityName}`;
const settingsForm = document.getElementById("settings-form");
if (settingsForm) {
  settingsForm.querySelector('[name="communityName"]').value = state.settings.communityName;
  settingsForm.querySelector('[name="defaultMonthlyDues"]').value = state.settings.defaultMonthlyDues;
  settingsForm.querySelector('[name="dueDay"]').value = state.settings.dueDay;
}
const mapResident = new URLSearchParams(window.location.search).get("resident");
if (mapResident) selectedResidentId = mapResident;
render();
if (document.getElementById("mini-map") || document.getElementById("full-map")) renderSelectedHome();
if (dataNeedsSaving) {
  saveState();
  dataNeedsSaving = false;
}
