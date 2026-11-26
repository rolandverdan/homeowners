import { auth, authReady, loadCommunity, saveCommunity } from "./firebase.js";

const STORAGE_KEY = "haven-community-admin-v1";
const DATA_VERSION = 2;

const defaultSettings = { communityName: "Bistek Village", adminName: "Community Admin", defaultMonthlyDues: 0, dueDay: 5, blockCount: 15, lotCount: 20 };
const today = new Date();
const currentMonth = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(today);
const currentMonthShort = new Intl.DateTimeFormat("en", { month: "short" }).format(today);
const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
const TABLE_PAGE_SIZE = 10;
const tablePages = { overview: 1, residents: 1, payments: 1 };
const fillStates = new WeakMap();
let dataNeedsSaving = false;
let toastTimer;
let state = loadState();
let selectedResidentId = null;
let editingResidentId = null;
let residentDetailsAllowEdit = true;
let residentDetailsShowHistory = false;
let residentHistoryYear = today.getFullYear();

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
            paidMonth: resident.paidMonth || (resident.paid && (!resident.paidAt || resident.paidAt.startsWith(currentMonthShort)) ? currentMonthKey : null),
            ...normalizePaymentHistory(resident)
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
            : Number(stored.settings.defaultMonthlyDues ?? defaultSettings.defaultMonthlyDues),
          blockCount: Number(stored.settings.blockCount ?? defaultSettings.blockCount),
          lotCount: Number(stored.settings.lotCount ?? defaultSettings.lotCount)
        }
      };
    }
  } catch (error) {
    console.error("Could not load saved community data.", error);
    showToast("Saved data could not be loaded. Starting with an empty resident list.");
  }
  return {
    residents: [],
    settings: { ...defaultSettings }
  };
}

function cacheState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, dataVersion: DATA_VERSION }));
  } catch (error) {
    console.error("Could not save community data.", error);
  }
}

function saveState() {
  cacheState();
  saveCommunity({ ...state, dataVersion: DATA_VERSION }).catch((error) => {
    console.error("Could not save community data to Firestore.", error);
    showToast("Firestore save failed. Check Firebase setup and Firestore rules.");
  });
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

function philippinesMobileDigits(value) {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("63")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = digits.slice(1);
  return digits.slice(-10);
}

function formatPhilippinesPhone(value) {
  const digits = philippinesMobileDigits(value);
  return /^9\d{9}$/.test(digits) ? `+63${digits}` : String(value ?? "");
}

function actionIcon(name) {
  const icons = {
    view: '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/>',
    edit: '<path d="m4 16.5-.8 4.3 4.3-.8L19.8 7.7a2.1 2.1 0 0 0-3-3L4 16.5Z"/><path d="m15.5 6 3 3"/>',
    delete: '<path d="M4 7h16M10 11v6m4-6v6M5.5 7l1 13h11l1-13M9 7V4h6v3"/>',
    paid: '<path d="M20 11.1V12a8 8 0 1 1-4.7-7.3"/><path d="m8.5 11.5 3 3L21 5"/>',
    undo: '<path d="M3 7v5h5M4.2 11A8 8 0 1 1 5 16"/>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.view}</svg>`;
}

function rowAction(label, icon, attributes, tag = "button", href = "#") {
  const common = `class="row-action icon-action" aria-label="${escapeHTML(label)}" title="${escapeHTML(label)}"`;
  return tag === "a"
    ? `<a ${common} href="${href}">${actionIcon(icon)}</a>`
    : `<button type="button" ${common} ${attributes || ""}>${actionIcon(icon)}</button>`;
}

function isPaid(resident) {
  return resident.paidMonth === currentMonthKey || resident.paidMonths?.includes(currentMonthKey);
}

function normalizePaymentHistory(resident) {
  const paidMonths = new Set(Array.isArray(resident.paidMonths) ? resident.paidMonths.filter((month) => /^\d{4}-\d{2}$/.test(month)) : []);
  if (/^\d{4}-\d{2}$/.test(resident.paidMonth || "")) paidMonths.add(resident.paidMonth);
  if (resident.paid && (!resident.paidAt || resident.paidAt.startsWith(currentMonthShort))) paidMonths.add(currentMonthKey);
  const paidDates = resident.paidDates && typeof resident.paidDates === "object" ? { ...resident.paidDates } : {};
  if (/^\d{4}-\d{2}-\d{2}$/.test(resident.paidDate || "")) {
    const month = resident.paidDate.slice(0, 7);
    paidMonths.add(month);
    paidDates[month] = resident.paidDate;
  }
  return { paidMonths: [...paidMonths], paidDates };
}

function paymentStatusForMonth(resident, monthKey) {
  if (resident.paidMonths?.includes(monthKey) || resident.paidMonth === monthKey) return "Paid";
  if (monthKey > currentMonthKey) return "Not due";
  const [year, month] = monthKey.split("-").map(Number);
  const dueDate = new Date(year, month - 1, Number(state.settings.dueDay));
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return dueDate < todayDate ? "Overdue" : "Due soon";
}

function isPaidForMonth(resident, monthKey) {
  return resident.paidMonths?.includes(monthKey) || resident.paidMonth === monthKey;
}

function statusMarkupForMonth(resident, monthKey) {
  const status = paymentStatusForMonth(resident, monthKey);
  const classes = { Paid: "paid", "Due soon": "due", Overdue: "overdue", "Not due": "upcoming" };
  return `<span class="status-badge status-${classes[status]}">${status}</span>`;
}

function renderResidentPaymentHistory(resident) {
  const recordedYears = (resident.paidMonths || []).map((month) => Number(month.slice(0, 4)));
  const years = Array.from({ length: Math.max(16, today.getFullYear() + 6 - Math.min(today.getFullYear() - 10, ...recordedYears)) }, (_, index) => Math.min(today.getFullYear() - 10, ...recordedYears) + index);
  if (!years.includes(residentHistoryYear)) residentHistoryYear = today.getFullYear();
  const yearOptions = years.slice().reverse().map((year) => `<option value="${year}" ${year === residentHistoryYear ? "selected" : ""}>${year}</option>`).join("");
  const rows = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const monthKey = `${residentHistoryYear}-${String(month).padStart(2, "0")}`;
    const monthLabel = new Intl.DateTimeFormat("en", { month: "long" }).format(new Date(residentHistoryYear, index, 1));
    const dueDate = `${monthLabel} ${state.settings.dueDay}, ${residentHistoryYear}`;
    const paidDate = resident.paidDates?.[monthKey];
    const paidDateLabel = paidDate ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${paidDate}T00:00:00`)) : "—";
    const action = isPaidForMonth(resident, monthKey)
      ? rowAction("Mark unpaid", "undo", `data-mark-unpaid="${escapeHTML(resident.id)}" data-payment-month="${monthKey}"`)
      : rowAction("Mark paid", "paid", `data-mark-paid="${escapeHTML(resident.id)}" data-payment-month="${monthKey}"`);
    const reference = resident.paymentReferences?.[monthKey] || "";
    return `<tr><td>${monthLabel} ${residentHistoryYear}</td><td>${dueDate}</td><td>${statusMarkupForMonth(resident, monthKey)}</td><td>${paidDateLabel}</td><td><input class="payment-reference-input" type="text" maxlength="80" placeholder="Input Reference Number" aria-label="Reference number for ${monthLabel} ${residentHistoryYear}" data-payment-reference data-resident-id="${escapeHTML(resident.id)}" data-payment-month="${monthKey}" value="${escapeHTML(reference)}" /></td><td>${action}</td></tr>`;
  }).join("");
  return `<section class="resident-payment-history"><div class="resident-history-heading"><div><p class="eyebrow">PAYMENT HISTORY</p><h3>Monthly record</h3></div><label>Year<select id="resident-history-year">${yearOptions}</select></label></div><div class="payment-history-wrap"><table><thead><tr><th>MONTH</th><th>DUE DATE</th><th>STATUS</th><th>PAID ON</th><th>REFERENCE NUMBER (OPTIONAL)</th><th>ACTION</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

function selectedPaymentsMonth() {
  const picker = document.getElementById("payment-month-picker");
  if (!picker) return currentMonthKey;
  if (!picker.value) picker.value = currentMonthKey;
  picker.max = currentMonthKey;
  if (!/^\d{4}-\d{2}$/.test(picker.value) || picker.value > currentMonthKey) picker.value = currentMonthKey;
  return picker.value;
}

function paymentDateLabel(resident) {
  if (resident.paidDate && /^\d{4}-\d{2}-\d{2}$/.test(resident.paidDate)) {
    return new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric" }).format(new Date(`${resident.paidDate}T00:00:00`));
  }
  return resident.paidAt || "Paid";
}

function paymentStatus(resident) {
  if (isPaid(resident)) return "paid";
  const dueDate = new Date(today.getFullYear(), today.getMonth(), Number(state.settings.dueDay));
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return todayDate > dueDate ? "overdue" : "due";
}

function animateFill(element, percent, property = "width") {
  if (!element) return;
  const target = `${Math.max(0, Math.min(100, Number(percent) || 0))}%`;
  let fillState = fillStates.get(element);
  const setValue = (value) => property === "width"
    ? element.style.setProperty("width", value)
    : element.style.setProperty(property, value);
  if (fillState) {
    fillState.target = target;
    if (fillState.ready) setValue(target);
    return;
  }
  fillState = { target, ready: false };
  fillStates.set(element, fillState);
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    fillState.ready = true;
    setValue(target);
    return;
  }
  setValue("0%");
  requestAnimationFrame(() => requestAnimationFrame(() => {
    fillState.ready = true;
    setValue(fillState.target);
  }));
}

function revealLoadedData() {
  const page = document.querySelector(".page-wrap");
  if (!page || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  page.classList.remove("data-arrive");
  void page.offsetWidth;
  page.classList.add("data-arrive");
  window.setTimeout(() => page.classList.remove("data-arrive"), 900);
}

function statusMarkup(resident) {
  const status = paymentStatus(resident);
  const labels = { paid: "Paid", due: "Due soon", overdue: "Overdue" };
  return `<span class="status-badge status-${status}">${labels[status]}</span>`;
}

function residentCell(resident) {
  return `<div class="resident-cell"><span class="resident-avatar">${escapeHTML(initials(resident.name))}</span><span><strong class="resident-name">${escapeHTML(resident.name)}</strong><small class="resident-email">${escapeHTML(resident.email || formatPhilippinesPhone(resident.phone))}</small></span></div>`;
}

function render() {
  populatePropertyOptions();
  populateBlockFilters();
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
    animateFill(element, value);
  };
  setText("resident-count", state.residents.length);
  const adminName = state.settings.adminName || defaultSettings.adminName;
  const adminInitials = adminName === defaultSettings.adminName ? "AM" : initials(adminName);
  document.querySelectorAll("[data-admin-name]").forEach((element) => { element.textContent = adminName; });
  document.querySelectorAll("[data-admin-initials]").forEach((element) => { element.textContent = adminInitials; });
  document.querySelectorAll("[data-community-name]").forEach((element) => { element.textContent = state.settings.communityName; });
  const settingsForm = document.getElementById("settings-form");
  if (settingsForm) {
    settingsForm.querySelector('[name="communityName"]').value = state.settings.communityName;
    settingsForm.querySelector('[name="defaultMonthlyDues"]').value = state.settings.defaultMonthlyDues;
    settingsForm.querySelector('[name="dueDay"]').value = state.settings.dueDay;
    settingsForm.querySelector('[name="blockCount"]').value = state.settings.blockCount;
    settingsForm.querySelector('[name="lotCount"]').value = state.settings.lotCount;
  }
  const adminProfileForm = document.getElementById("admin-profile-form");
  if (adminProfileForm) adminProfileForm.elements.adminName.value = adminName;

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
    renderOverviewTable();
  }

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
  if (donut) animateFill(donut, rate, "--collection-rate");
  setText("report-legend-paid", `${paidResidents.length} residents · ${formatCurrency(paidTotal)}`);
  setText("report-legend-due", `${dueCount} residents · ${formatCurrency(pendingResidents.filter((resident) => paymentStatus(resident) === "due").reduce((sum, resident) => sum + Number(resident.monthlyDues), 0))}`);
  setText("report-legend-late", `${overdueCount} residents · ${formatCurrency(pendingResidents.filter((resident) => paymentStatus(resident) === "overdue").reduce((sum, resident) => sum + Number(resident.monthlyDues), 0))}`);

  const residentSearch = document.getElementById("resident-search");
  if (residentSearch) renderResidentsTable(residentSearch.value);
  const paymentSearch = document.getElementById("payment-search");
  if (paymentSearch) renderPaymentsTable(paymentSearch.value);
  const pageCount = document.getElementById("resident-page-count");
  if (pageCount) pageCount.textContent = `All residents · ${state.residents.length}`;
  renderPaymentHistoryPage();
}

function propertyLabel(resident) {
  return resident.block ? `Block ${resident.block} · Lot ${resident.lot}` : resident.lot || "Not set";
}

function populatePropertyOptions() {
  const form = document.getElementById("resident-form");
  if (!form) return;
  for (const [name, prefix, count] of [["block", "Block", Number(state.settings.blockCount) || 15], ["lot", "Lot", Number(state.settings.lotCount) || 20]]) {
    const select = form.elements[name];
    const previous = select.value;
    select.innerHTML = `<option value="">Choose ${prefix.toLowerCase()}</option>${Array.from({ length: count }, (_, index) => `<option value="${index + 1}">${prefix} ${index + 1}</option>`).join("")}`;
    if ([...select.options].some((option) => option.value === previous)) select.value = previous;
  }
}

function populateBlockFilters() {
  const count = Number(state.settings.blockCount) || 15;
  for (const id of ["resident-block-filter", "payment-block-filter"]) {
    const select = document.getElementById(id);
    if (!select) continue;
    const selected = select.value || "all";
    select.innerHTML = `<option value="all">All blocks</option>${Array.from({ length: count }, (_, index) => `<option value="${index + 1}">Block ${index + 1}</option>`).join("")}`;
    select.value = [...select.options].some((option) => option.value === selected) ? selected : "all";
  }
}

function renderResidentsTable(query = "") {
  const table = document.getElementById("residents-table");
  if (!table) return;
  const normalizedQuery = query.trim().toLowerCase();
  const blockFilter = document.getElementById("resident-block-filter")?.value || "all";
  const filtered = state.residents.filter((resident) => (blockFilter === "all" || String(resident.block) === blockFilter) && [resident.name, resident.email, resident.phone, resident.block, resident.lot, resident.street].some((value) => String(value || "").toLowerCase().includes(normalizedQuery)));
  const pageItems = getTablePage(filtered, "residents");
  table.innerHTML = pageItems.map((resident) => `<tr><td>${residentCell(resident)}</td><td class="property-cell">${escapeHTML(propertyLabel(resident))}<br><span class="resident-email">${escapeHTML(resident.street || "")}</span></td><td>${escapeHTML(formatPhilippinesPhone(resident.phone))}<br><span class="resident-email">${escapeHTML(resident.email || "No email")}</span></td><td class="amount-cell">${formatCurrency(resident.monthlyDues)}</td><td class="table-actions">${rowAction("View", "view", `data-view-resident="${escapeHTML(resident.id)}"`)}${rowAction("Edit", "edit", `data-edit-resident="${escapeHTML(resident.id)}"`)}${rowAction("Delete", "delete", `data-delete-resident="${escapeHTML(resident.id)}"`)}</td></tr>`).join("");
  document.getElementById("residents-empty").classList.toggle("hidden", filtered.length > 0);
  const heading = document.getElementById("resident-page-count");
  if (heading) heading.textContent = `${blockFilter === "all" ? "All residents" : `Block ${blockFilter} residents`} · ${filtered.length}`;
  renderTablePagination("residents-pagination", filtered.length, "residents");
}

function renderPaymentsTable(query = "") {
  const table = document.getElementById("payments-table");
  if (!table) return;
  const normalizedQuery = query.trim().toLowerCase();
  const monthKey = selectedPaymentsMonth();
  const blockFilter = document.getElementById("payment-block-filter")?.value || "all";
  const statusFilter = document.getElementById("payment-status-filter")?.value || "all";
  const filtered = state.residents.filter((resident) => {
    const matchesQuery = [resident.name, resident.block, resident.lot, resident.street].some((value) => String(value || "").toLowerCase().includes(normalizedQuery));
    const monthStatus = { "Due soon": "due", Overdue: "overdue", Paid: "paid" }[paymentStatusForMonth(resident, monthKey)];
    return matchesQuery && (blockFilter === "all" || String(resident.block) === blockFilter) && (statusFilter === "all" || monthStatus === statusFilter);
  });
  const pageItems = getTablePage(filtered, "payments");
  const [year, month] = monthKey.split("-").map(Number);
  const dueDay = Math.min(Number(state.settings.dueDay), new Date(year, month, 0).getDate());
  const dueDate = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(year, month - 1, dueDay));
  const monthLabel = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
  table.innerHTML = pageItems.map((resident) => `<tr><td>${residentCell(resident)}</td><td class="property-cell">${escapeHTML(propertyLabel(resident))}</td><td class="amount-cell">${formatCurrency(resident.monthlyDues)}</td><td>${escapeHTML(dueDate)}</td><td>${statusMarkupForMonth(resident, monthKey)}</td><td class="payment-actions">${rowAction("View payment history", "view", "", "a", `payment-history.html?resident=${encodeURIComponent(resident.id)}`)}</td></tr>`).join("");
  document.getElementById("payments-empty").classList.toggle("hidden", filtered.length > 0);
  const statusLabels = { all: "All payments", paid: "Paid payments", due: "Due soon", overdue: "Overdue" };
  const heading = document.getElementById("payments-page-count");
  if (heading) heading.textContent = `${monthLabel} · ${blockFilter === "all" ? statusLabels[statusFilter] : `Block ${blockFilter} · ${statusLabels[statusFilter]}`} · ${filtered.length}`;
  const paidResidents = state.residents.filter((resident) => isPaidForMonth(resident, monthKey));
  const pendingResidents = state.residents.filter((resident) => !isPaidForMonth(resident, monthKey));
  const paidTotal = paidResidents.reduce((sum, resident) => sum + Number(resident.monthlyDues || 0), 0);
  const expectedTotal = state.residents.reduce((sum, resident) => sum + Number(resident.monthlyDues || 0), 0);
  document.getElementById("payments-collected").textContent = formatCurrency(paidTotal);
  document.getElementById("payments-pending").textContent = formatCurrency(expectedTotal - paidTotal);
  document.getElementById("payments-expected").textContent = formatCurrency(expectedTotal);
  document.getElementById("payments-paid-count").textContent = `${paidResidents.length} resident${paidResidents.length === 1 ? "" : "s"} paid`;
  document.getElementById("payments-pending-count").textContent = `${pendingResidents.length} payment${pendingResidents.length === 1 ? "" : "s"} remaining`;
  document.getElementById("payments-month-label").textContent = monthLabel;
  renderTablePagination("payments-pagination", filtered.length, "payments");
}

function renderOverviewTable() {
  const table = document.getElementById("overview-table");
  if (!table) return;
  const pageItems = getTablePage(state.residents, "overview");
  table.innerHTML = pageItems.map((resident) => `<tr><td>${residentCell(resident)}</td><td class="property-cell">${escapeHTML(propertyLabel(resident))}</td><td class="amount-cell">${formatCurrency(resident.monthlyDues)}</td><td>${statusMarkup(resident)}</td><td>${isPaid(resident) ? `<span class="payment-date-action">Paid · ${escapeHTML(paymentDateLabel(resident))}</span>` : rowAction("Mark paid", "paid", `data-mark-paid="${escapeHTML(resident.id)}"`)}</td></tr>`).join("");
  document.getElementById("overview-empty")?.classList.toggle("hidden", state.residents.length > 0);
  renderTablePagination("overview-pagination", state.residents.length, "overview");
}

function getTablePage(items, key) {
  const totalPages = Math.max(1, Math.ceil(items.length / TABLE_PAGE_SIZE));
  tablePages[key] = Math.min(Math.max(1, tablePages[key] || 1), totalPages);
  const start = (tablePages[key] - 1) * TABLE_PAGE_SIZE;
  return items.slice(start, start + TABLE_PAGE_SIZE);
}

function renderTablePagination(elementId, itemCount, key) {
  const container = document.getElementById(elementId);
  if (!container) return;
  const totalPages = Math.max(1, Math.ceil(itemCount / TABLE_PAGE_SIZE));
  const page = Math.min(Math.max(1, tablePages[key] || 1), totalPages);
  tablePages[key] = page;
  const firstItem = itemCount ? (page - 1) * TABLE_PAGE_SIZE + 1 : 0;
  const lastItem = Math.min(page * TABLE_PAGE_SIZE, itemCount);
  container.innerHTML = `<span class="pagination-summary">Showing ${firstItem}–${lastItem} of ${itemCount}</span><div class="pagination-controls"><button type="button" data-table-page="${key}" data-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>Previous</button><span>Page ${page} of ${totalPages}</span><button type="button" data-table-page="${key}" data-page="${page + 1}" ${page >= totalPages ? "disabled" : ""}>Next</button></div>`;
}

function markPaid(id, monthKey = currentMonthKey) {
  const resident = state.residents.find((item) => item.id === id);
  if (!resident) return;
  resident.paidMonths = [...new Set([...(resident.paidMonths || []), monthKey])];
  if (monthKey === currentMonthKey) resident.paidMonth = currentMonthKey;
  if (monthKey === currentMonthKey) {
    delete resident.paid;
    delete resident.paidProofKey;
    delete resident.paidProofName;
  }
  const paidDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  resident.paidDates = { ...(resident.paidDates || {}), [monthKey]: paidDate };
  if (monthKey === currentMonthKey) {
    resident.paidDate = paidDate;
    resident.paidAt = paymentDateLabel(resident);
  }
  saveState();
  render();
  if (!document.getElementById("resident-details-modal")?.classList.contains("hidden")) renderResidentDetails(id);
  showToast(`${resident.name}'s ${monthKey} dues marked as paid.`);
}

function markUnpaid(id, monthKey = currentMonthKey) {
  const resident = state.residents.find((item) => item.id === id);
  if (!resident) return;
  resident.paidMonths = (resident.paidMonths || []).filter((month) => month !== monthKey);
  resident.paidDates = { ...(resident.paidDates || {}) };
  delete resident.paidDates[monthKey];
  resident.paymentReferences = { ...(resident.paymentReferences || {}) };
  delete resident.paymentReferences[monthKey];
  if (monthKey === currentMonthKey) {
    delete resident.paidMonth;
    delete resident.paid;
    delete resident.paidAt;
    delete resident.paidDate;
    delete resident.paidProofKey;
    delete resident.paidProofName;
  }
  saveState();
  render();
  if (!document.getElementById("resident-details-modal")?.classList.contains("hidden")) renderResidentDetails(id);
  showToast(`${resident.name}'s ${monthKey} payment was marked unpaid.`);
}

function openResidentDetails(id, allowEdit = true, showHistory = false) {
  selectedResidentId = id;
  residentDetailsAllowEdit = allowEdit;
  residentDetailsShowHistory = showHistory;
  residentHistoryYear = today.getFullYear();
  document.querySelector(".resident-details-card")?.classList.toggle("history-enabled", showHistory);
  renderResidentDetails(id);
  document.getElementById("resident-details-modal")?.classList.remove("hidden");
}

function renderResidentDetails(id) {
  const resident = state.residents.find((item) => item.id === id);
  if (!resident) return;
  document.getElementById("resident-details-title").textContent = resident.name;
  document.getElementById("resident-details-content").innerHTML = `<div class="resident-details-summary"><span class="resident-avatar">${escapeHTML(initials(resident.name))}</span><div><strong>${escapeHTML(resident.name)}</strong><small>${escapeHTML(resident.email || formatPhilippinesPhone(resident.phone))}</small></div></div><div class="resident-details-grid"><div><span>Phone</span><strong>${escapeHTML(formatPhilippinesPhone(resident.phone))}</strong></div><div><span>Email</span><strong>${escapeHTML(resident.email || "Not provided")}</strong></div><div><span>Property</span><strong>${escapeHTML([propertyLabel(resident), resident.street].filter(Boolean).join(" · ") || "Not provided")}</strong></div><div><span>Monthly dues</span><strong>${formatCurrency(resident.monthlyDues)}</strong></div><div><span>Payment status</span><strong>${statusMarkup(resident)}</strong></div>${isPaid(resident) ? `<div><span>Paid on</span><strong>${escapeHTML(paymentDateLabel(resident))}</strong></div>` : ""}</div><div class="resident-details-actions">${isPaid(resident) ? `<button class="button button-secondary" data-mark-unpaid="${escapeHTML(resident.id)}">Restore to unpaid</button>` : `<button class="button button-primary" data-mark-paid="${escapeHTML(resident.id)}">Mark as paid</button>`}${residentDetailsAllowEdit ? `<button class="button button-secondary" data-edit-resident="${escapeHTML(resident.id)}">Edit resident</button>` : ""}</div>${residentDetailsShowHistory ? renderResidentPaymentHistory(resident) : ""}`;
}

function renderPaymentHistoryPage() {
  const container = document.getElementById("resident-payment-history-content");
  if (!container) return;
  const residentId = new URLSearchParams(window.location.search).get("resident");
  const resident = state.residents.find((item) => item.id === residentId);
  if (!resident) {
    container.innerHTML = `<div class="empty-state">Resident not found. <a href="payments.html">Return to monthly dues</a></div>`;
    return;
  }
  selectedResidentId = resident.id;
  residentDetailsAllowEdit = false;
  residentDetailsShowHistory = true;
  document.getElementById("resident-history-page-title").textContent = `${resident.name} payment history`;
  document.title = `${resident.name} payment history — ${state.settings.communityName}`;
  renderResidentDetails(resident.id);
  container.innerHTML = document.getElementById("resident-details-content").innerHTML;
}

function closeResidentDetails() {
  document.getElementById("resident-details-modal")?.classList.add("hidden");
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
  editingResidentId = null;
  form.reset();
  form.elements.phone.dispatchEvent(new Event("input", { bubbles: true }));
  document.getElementById("modal-title").textContent = "Add a resident";
  document.getElementById("resident-submit").textContent = "Add resident";
  form.querySelector('[name="monthlyDues"]').value = state.settings.defaultMonthlyDues;
  document.getElementById("resident-modal").classList.remove("hidden");
  form.querySelector('input[name="name"]').focus();
}

function editResident(id) {
  const resident = state.residents.find((item) => item.id === id);
  const form = document.getElementById("resident-form");
  if (!resident || !form) return;
  editingResidentId = id;
  for (const field of ["name", "phone", "email", "block", "lot", "street", "monthlyDues"]) {
    form.elements[field].value = field === "phone" ? philippinesMobileDigits(resident.phone) : resident[field] ?? "";
  }
  form.elements.phone.dispatchEvent(new Event("input", { bubbles: true }));
  document.getElementById("modal-title").textContent = "Edit resident";
  document.getElementById("resident-submit").textContent = "Save changes";
  document.getElementById("resident-modal").classList.remove("hidden");
  form.querySelector('input[name="name"]').focus();
}

function deleteResident(id) {
  const resident = state.residents.find((item) => item.id === id);
  if (!resident || !window.confirm(`Delete ${resident.name} from the resident directory?`)) return;
  state.residents = state.residents.filter((item) => item.id !== id);
  saveState();
  render();
  showToast(`${resident.name} was deleted.`);
}

function closeModal() {
  document.getElementById("resident-modal")?.classList.add("hidden");
}

function openExportModal() {
  const form = document.getElementById("export-form");
  if (!form) return;
  const year = form.elements.year;
  year.value = String(today.getFullYear());
  year.min = "2000";
  year.max = String(today.getFullYear());
  const block = form.elements.block;
  block.innerHTML = `<option value="all">All blocks</option>${Array.from({ length: Number(state.settings.blockCount) || 15 }, (_, index) => `<option value="${index + 1}">Block ${index + 1}</option>`).join("")}`;
  block.value = "all";
  document.getElementById("export-modal")?.classList.remove("hidden");
  year.focus();
}

function closeExportModal() {
  document.getElementById("export-modal")?.classList.add("hidden");
}

function exportYearlyWorkbook(yearValue, blockValue = "all") {
  const year = Number(yearValue);
  if (!Number.isInteger(year) || year < 2000 || year > today.getFullYear()) {
    showToast("Choose a valid year up to the current year.");
    return;
  }
  const residents = blockValue === "all"
    ? state.residents
    : state.residents.filter((resident) => String(resident.block) === String(blockValue));
  const months = Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`);
  const rows = [
    ["Block", "Lot", "Resident", ...months.map((monthKey) => `${new Intl.DateTimeFormat("en", { month: "long" }).format(new Date(`${monthKey}-01T00:00:00`))} ${year}`)],
    ...residents.map((resident) => [
      resident.block || "",
      resident.lot || "",
      resident.name,
      ...months.map((monthKey) => {
        const paid = resident.paidMonths?.includes(monthKey) || resident.paidMonth === monthKey || Boolean(resident.paidDates?.[monthKey]);
        if (!paid) return "";
        const reference = resident.paymentReferences?.[monthKey]?.trim();
        return reference ? `Paid (Ref: ${reference})` : "Paid";
      })
    ])
  ];
  const workbook = createXlsxWorkbook(rows, blockValue === "all" ? String(year) : `${year}-B${blockValue}`);
  const url = URL.createObjectURL(workbook);
  const link = document.createElement("a");
  link.href = url;
  link.download = `bistek-village-dues-report-${year}${blockValue === "all" ? "" : `-block-${blockValue}`}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
  closeExportModal();
  showToast(`${year} dues report${blockValue === "all" ? "" : ` for Block ${blockValue}`} downloaded.`);
}

function createXlsxWorkbook(rows, year) {
  const escapeXML = (value) => String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]);
  const columnName = (number) => {
    let name = "";
    while (number > 0) {
      number -= 1;
      name = String.fromCharCode(65 + number % 26) + name;
      number = Math.floor(number / 26);
    }
    return name;
  };
  const columns = rows[0].map((_, columnIndex) => {
    const longest = Math.max(...rows.map((row) => String(row[columnIndex] ?? "").length));
    const width = Math.min(60, Math.max(columnIndex === 0 ? 24 : 18, longest + 3));
    return `<col min="${columnIndex + 1}" max="${columnIndex + 1}" width="${width}" bestFit="1" customWidth="1"/>`;
  }).join("");
  const sheetRows = rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((cell, columnIndex) => `<c r="${columnName(columnIndex + 1)}${rowIndex + 1}" t="inlineStr"${rowIndex === 0 ? ' s="1"' : ""}><is><t xml:space="preserve">${escapeXML(cell)}</t></is></c>`).join("")}</row>`).join("");
  const lastColumn = columnName(rows[0].length);
  const files = [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${year}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ["xl/styles.xml", `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9EAD3"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1" applyFill="1" applyFont="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`],
    ["xl/worksheets/sheet1.xml", `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols>${columns}</cols><sheetData>${sheetRows}</sheetData><autoFilter ref="A1:${lastColumn}${rows.length}"/><pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/></worksheet>`]
  ];
  return zipStoredFiles(files);
}

function zipStoredFiles(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  let centralSize = 0;
  const crc32 = (bytes) => {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  };
  for (const [path, content] of files) {
    const name = encoder.encode(path);
    const data = encoder.encode(content);
    const crc = crc32(data);
    const localHeader = new Uint8Array(30 + name.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, name.length, true);
    localHeader.set(name, 30);
    localParts.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + name.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, localOffset, true);
    centralHeader.set(name, 46);
    centralParts.push(centralHeader);
    localOffset += localHeader.length + data.length;
    centralSize += centralHeader.length;
  }
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, localOffset, true);
  return new Blob([...localParts, ...centralParts, end], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

document.querySelectorAll("[data-open-add]").forEach((button) => button.addEventListener("click", openModal));
document.querySelectorAll("[data-export]").forEach((button) => button.addEventListener("click", openExportModal));
document.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest("[data-table-page]");
  if (!button || button.disabled) return;
  const key = button.dataset.tablePage;
  tablePages[key] = Number(button.dataset.page);
  if (key === "overview") renderOverviewTable();
  if (key === "residents") renderResidentsTable(document.getElementById("resident-search")?.value || "");
  if (key === "payments") renderPaymentsTable(document.getElementById("payment-search")?.value || "");
});
document.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest("[data-mark-paid], [data-mark-unpaid], [data-view-residents], [data-view-resident], [data-edit-resident], [data-delete-resident]");
  if (!button) return;
  const paymentMonth = button.dataset.paymentMonth || (button.closest("#payments-table") ? selectedPaymentsMonth() : currentMonthKey);
  if (button.hasAttribute("data-mark-paid")) markPaid(button.dataset.markPaid, paymentMonth);
  else if (button.hasAttribute("data-mark-unpaid")) markUnpaid(button.dataset.markUnpaid, paymentMonth);
  else if (button.hasAttribute("data-view-resident")) openResidentDetails(button.dataset.viewResident, !button.closest("#payments-table"), Boolean(button.closest("#payments-table")));
  else if (button.hasAttribute("data-edit-resident")) { closeResidentDetails(); editResident(button.dataset.editResident); }
  else if (button.hasAttribute("data-delete-resident")) deleteResident(button.dataset.deleteResident);
});
document.getElementById("payments-export-button")?.addEventListener("click", openExportModal);
document.getElementById("export-close")?.addEventListener("click", closeExportModal);
document.getElementById("export-cancel")?.addEventListener("click", closeExportModal);
document.getElementById("export-form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  exportYearlyWorkbook(event.currentTarget.elements.year.value, event.currentTarget.elements.block.value);
});
document.getElementById("resident-search")?.addEventListener("input", (event) => { tablePages.residents = 1; renderResidentsTable(event.target.value); });
document.getElementById("resident-block-filter")?.addEventListener("change", () => { tablePages.residents = 1; renderResidentsTable(document.getElementById("resident-search")?.value || ""); });
document.getElementById("payment-search")?.addEventListener("input", (event) => { tablePages.payments = 1; renderPaymentsTable(event.target.value); });
document.getElementById("payment-block-filter")?.addEventListener("change", () => { tablePages.payments = 1; renderPaymentsTable(document.getElementById("payment-search")?.value || ""); });
document.getElementById("payment-status-filter")?.addEventListener("change", () => { tablePages.payments = 1; renderPaymentsTable(document.getElementById("payment-search")?.value || ""); });
document.getElementById("payment-month-picker")?.addEventListener("change", () => { tablePages.payments = 1; renderPaymentsTable(document.getElementById("payment-search")?.value || ""); });
document.querySelector('#resident-form [name="phone"]')?.addEventListener("input", (event) => {
  const input = event.currentTarget;
  let digits = input.value.replace(/\D/g, "");
  if (digits.startsWith("63")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = digits.slice(1);
  input.value = digits.slice(0, 10);
  input.setCustomValidity(input.value && !/^9\d{9}$/.test(input.value)
    ? "Enter 10 digits starting with 9 after +63."
    : "");
});
document.querySelector('#resident-form [name="phone"]')?.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) return;
  if (!/\d/.test(event.key)) event.preventDefault();
});
document.getElementById("modal-close")?.addEventListener("click", closeModal);
document.getElementById("resident-details-close")?.addEventListener("click", closeResidentDetails);
document.addEventListener("change", (event) => {
  if (event.target.id === "resident-history-year") {
    residentHistoryYear = Number(event.target.value);
    if (document.getElementById("resident-payment-history-content")) renderPaymentHistoryPage();
    else renderResidentDetails(selectedResidentId);
    return;
  }
  if (!event.target.matches("[data-payment-reference]")) return;
  const resident = state.residents.find((item) => item.id === event.target.dataset.residentId);
  if (!resident) return;
  const monthKey = event.target.dataset.paymentMonth;
  const reference = event.target.value.trim();
  resident.paymentReferences = { ...(resident.paymentReferences || {}) };
  if (reference) resident.paymentReferences[monthKey] = reference;
  else delete resident.paymentReferences[monthKey];
  saveState();
});
document.getElementById("resident-modal")?.addEventListener("click", (event) => {
  if (event.target.id === "resident-modal") closeModal();
});
document.getElementById("resident-details-modal")?.addEventListener("click", (event) => {
  if (event.target.id === "resident-details-modal") closeResidentDetails();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") { closeModal(); closeResidentDetails(); closeExportModal(); }
});
document.getElementById("export-modal")?.addEventListener("click", (event) => {
  if (event.target.id === "export-modal") closeExportModal();
});
document.getElementById("notifications-button")?.addEventListener("click", () => {
  const pending = state.residents.filter((resident) => !isPaid(resident)).length;
  showToast(pending ? `${pending} resident dues payment${pending === 1 ? "" : "s"} still need attention.` : "All village dues are up to date.");
});
document.getElementById("resident-form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
    const resident = {
    ...(editingResidentId ? state.residents.find((item) => item.id === editingResidentId) : {}),
    id: editingResidentId || `resident-${Date.now()}`,
    name: String(formData.get("name")).trim(),
    phone: `+63${philippinesMobileDigits(formData.get("phone"))}`,
    email: String(formData.get("email")).trim(),
    block: String(formData.get("block")).trim(),
    lot: String(formData.get("lot")).trim(),
    street: String(formData.get("street")).trim(),
    monthlyDues: Number(formData.get("monthlyDues")),
  };
  if (!/^9\d{9}$/.test(philippinesMobileDigits(formData.get("phone")))) {
    showToast("Enter a valid Philippine mobile number: 10 digits starting with 9.");
    return;
  }
  if (state.residents.some((item) => item.id !== editingResidentId && item.block === resident.block && item.lot === resident.lot)) {
    showToast("That block and lot combination is already in use.");
    return;
  }
  if (!Number.isFinite(resident.monthlyDues) || resident.monthlyDues < 0) {
    showToast("Enter a valid monthly dues amount.");
    return;
  }
  if (editingResidentId) {
    state.residents = state.residents.map((item) => item.id === editingResidentId ? resident : item);
  } else {
    state.residents.push(resident);
  }
  const wasEditing = Boolean(editingResidentId);
  editingResidentId = null;
  saveState();
  event.currentTarget.reset();
  closeModal();
  render();
  showToast(wasEditing ? `${resident.name}'s details were updated.` : `${resident.name} was added to the community.`);
});
document.getElementById("settings-form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const communityName = String(formData.get("communityName")).trim();
  const defaultMonthlyDues = Number(formData.get("defaultMonthlyDues"));
  const dueDay = Number(formData.get("dueDay"));
  const blockCount = Number(formData.get("blockCount"));
  const lotCount = Number(formData.get("lotCount"));
  if (!communityName || !Number.isFinite(defaultMonthlyDues) || defaultMonthlyDues < 0 || dueDay < 1 || dueDay > 28 || !Number.isInteger(blockCount) || blockCount < 1 || blockCount > 100 || !Number.isInteger(lotCount) || lotCount < 1 || lotCount > 500) {
    showToast("Check the community settings and try again.");
    return;
  }
  state.settings = { ...state.settings, communityName, defaultMonthlyDues, dueDay, blockCount, lotCount };
  saveState();
  document.title = `${communityName} — Settings`;
  document.getElementById("settings-saved").textContent = "Changes saved";
  window.setTimeout(() => { document.getElementById("settings-saved").textContent = ""; }, 2500);
  render();
});
document.getElementById("admin-profile-form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const adminName = String(new FormData(event.currentTarget).get("adminName") || "").trim();
  if (!adminName) {
    showToast("Enter an admin display name.");
    return;
  }
  state.settings = { ...state.settings, adminName };
  saveState();
  render();
  const saved = document.getElementById("admin-profile-saved");
  if (saved) {
    saved.textContent = "Name saved";
    window.setTimeout(() => { saved.textContent = ""; }, 2500);
  }
});

document.getElementById("admin-account-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = document.getElementById("admin-account-status");
  const submit = document.getElementById("admin-account-submit");
  const currentPassword = String(form.elements.currentPassword.value);
  const newEmail = String(form.elements.newEmail.value).trim().toLowerCase();
  const newPassword = String(form.elements.newPassword.value);
  const confirmPassword = String(form.elements.confirmPassword.value);
  const user = auth?.currentUser;
  status.classList.remove("error");
  status.textContent = "";
  if (!user?.email) {
    status.textContent = "No signed-in email/password admin account was found.";
    status.classList.add("error");
    return;
  }
  if (!newEmail && !newPassword) {
    status.textContent = "Enter a new email or password first.";
    status.classList.add("error");
    return;
  }
  if (newPassword !== confirmPassword) {
    status.textContent = "The new password and confirmation do not match.";
    status.classList.add("error");
    return;
  }
  const updateEmailAddress = newEmail && newEmail !== user.email.toLowerCase();
  const updatePasswordValue = Boolean(newPassword);
  if (!updateEmailAddress && !updatePasswordValue) {
    status.textContent = "The new email is already your current email.";
    status.classList.add("error");
    return;
  }

  submit.disabled = true;
  submit.textContent = "Updating…";
  try {
    const { EmailAuthProvider, reauthenticateWithCredential, verifyBeforeUpdateEmail, updatePassword } = await import("https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js");
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
    const completed = [];
    const errors = [];
    if (updateEmailAddress) {
      try {
        await verifyBeforeUpdateEmail(user, newEmail);
        completed.push("A verification link was sent to the new email.");
      } catch (error) { errors.push(error); }
    }
    if (updatePasswordValue) {
      try {
        await updatePassword(user, newPassword);
        completed.push("Password updated.");
      } catch (error) { errors.push(error); }
    }
    if (completed.length) {
      status.textContent = [...completed, ...errors.map((error) => authAccountError(error))].join(" ");
      if (errors.length) status.classList.add("error");
      form.elements.currentPassword.value = "";
      form.elements.newPassword.value = "";
      form.elements.confirmPassword.value = "";
      if (!errors.length) form.elements.newEmail.value = "";
    } else {
      status.textContent = authAccountError(errors[0]);
      status.classList.add("error");
    }
  } catch (error) {
    status.textContent = authAccountError(error);
    status.classList.add("error");
  } finally {
    submit.disabled = false;
    submit.textContent = "Update sign-in details";
  }
});

function authAccountError(error) {
  const code = String(error?.code || "").toLowerCase();
  if (code.includes("wrong-password") || code.includes("invalid-credential")) return "Current password is incorrect.";
  if (code.includes("email-already-in-use")) return "That email is already used by another account.";
  if (code.includes("invalid-email")) return "Enter a valid email address.";
  if (code.includes("weak-password")) return "Choose a stronger password.";
  if (code.includes("requires-recent-login")) return "Sign out and sign in again, then retry this change.";
  return error?.message || "Could not update the admin sign-in details.";
}

document.title = `${document.body.dataset.page === "overview" ? "Overview" : document.body.dataset.page === "payments" ? "Monthly dues" : document.body.dataset.page === "residents" ? "Residents" : document.body.dataset.page === "reports" ? "Reports" : "Settings"} — ${state.settings.communityName}`;
async function startApp() {
  try {
    await authReady;
    if (!auth?.currentUser) return;
    const adminEmailField = document.getElementById("admin-current-email");
    if (adminEmailField) adminEmailField.value = auth.currentUser.email || "";
    render();
    const cloudState = await loadCommunity();
    if (cloudState && Array.isArray(cloudState.residents) && cloudState.settings) {
      state = {
        residents: cloudState.residents.map((resident) => ({ ...resident, ...normalizePaymentHistory(resident) })),
        settings: { ...defaultSettings, ...cloudState.settings }
      };
      cacheState();
    } else {
      state = loadState();
      await saveCommunity({ ...state, dataVersion: DATA_VERSION });
    }
    render();
    revealLoadedData();
    if (dataNeedsSaving) {
      saveState();
      dataNeedsSaving = false;
    }
  } catch (error) {
    console.error("Could not connect to Firestore.", error);
    showToast(error.message || "Could not connect to Firestore.");
    render();
  }
}
startApp();
