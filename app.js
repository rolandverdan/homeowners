import { auth, authReady, loadCommunity, saveCommunity } from "./firebase.js";

const STORAGE_KEY = "haven-community-admin-v1";
const DATA_VERSION = 2;

const defaultSettings = { communityName: "Bistek Village", adminName: "Community Admin", defaultMonthlyDues: 0, dueDay: 5 };
const mapDefaultCenter = [14.732702501957057, 121.04251314283857];
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
let communityMap;
let miniMap;
let mapMarkers;
let pickerMap;
let pickerMarker;

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
            : Number(stored.settings.defaultMonthlyDues ?? defaultSettings.defaultMonthlyDues)
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
  const [year, month] = monthKey.split("-").map(Number);
  const dueDate = new Date(year, month - 1, Number(state.settings.dueDay));
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return dueDate < todayDate ? "Overdue" : "Due soon";
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
  const mappedHomes = state.residents.filter((resident) => Number.isFinite(Number(resident.latitude)) && Number.isFinite(Number(resident.longitude))).length;
  setText("map-home-count", `${mappedHomes} mapped home${mappedHomes === 1 ? "" : "s"}`);
  if (document.getElementById("mini-map") || document.getElementById("full-map")) renderMaps();
  if (document.getElementById("selected-home")) renderSelectedHome();
}

function renderResidentsTable(query = "") {
  const table = document.getElementById("residents-table");
  if (!table) return;
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = state.residents.filter((resident) => [resident.name, resident.email, resident.phone, resident.lot, resident.street].some((value) => String(value || "").toLowerCase().includes(normalizedQuery)));
  const pageItems = getTablePage(filtered, "residents");
  table.innerHTML = pageItems.map((resident) => `<tr><td>${residentCell(resident)}</td><td class="property-cell">${escapeHTML(resident.lot)}<br><span class="resident-email">${escapeHTML(resident.street)}</span></td><td>${escapeHTML(formatPhilippinesPhone(resident.phone))}<br><span class="resident-email">${escapeHTML(resident.email || "No email")}</span></td><td class="amount-cell">${formatCurrency(resident.monthlyDues)}</td><td>${statusMarkup(resident)}</td><td class="table-actions">${rowAction("View", "view", `data-view-resident="${escapeHTML(resident.id)}"`)}${rowAction("Edit", "edit", `data-edit-resident="${escapeHTML(resident.id)}"`)}${rowAction("Delete", "delete", `data-delete-resident="${escapeHTML(resident.id)}"`)}</td></tr>`).join("");
  document.getElementById("residents-empty").classList.toggle("hidden", filtered.length > 0);
  renderTablePagination("residents-pagination", filtered.length, "residents");
}

function renderPaymentsTable(query = "") {
  const table = document.getElementById("payments-table");
  if (!table) return;
  const normalizedQuery = query.trim().toLowerCase();
  const statusFilter = document.getElementById("payment-status-filter")?.value || "all";
  const filtered = state.residents.filter((resident) => {
    const matchesQuery = [resident.name, resident.lot, resident.street].some((value) => String(value || "").toLowerCase().includes(normalizedQuery));
    return matchesQuery && (statusFilter === "all" || paymentStatus(resident) === statusFilter);
  });
  const pageItems = getTablePage(filtered, "payments");
  table.innerHTML = pageItems.map((resident) => `<tr><td>${residentCell(resident)}</td><td class="property-cell">${escapeHTML(resident.lot)} · ${escapeHTML(resident.street)}</td><td class="amount-cell">${formatCurrency(resident.monthlyDues)}</td><td>${escapeHTML(currentMonthShort)} ${Number(state.settings.dueDay)}, ${today.getFullYear()}</td><td>${statusMarkup(resident)}</td><td class="payment-actions">${rowAction("View resident", "view", `data-view-resident="${escapeHTML(resident.id)}"`)}${rowAction("Edit resident", "edit", `data-edit-resident="${escapeHTML(resident.id)}"`)}</td></tr>`).join("");
  document.getElementById("payments-empty").classList.toggle("hidden", filtered.length > 0);
  const statusLabels = { all: "All payments", paid: "Paid payments", due: "Due soon", overdue: "Overdue" };
  const heading = document.getElementById("payments-page-count");
  if (heading) heading.textContent = `${statusLabels[statusFilter]} · ${filtered.length}`;
  renderTablePagination("payments-pagination", filtered.length, "payments");
}

function renderOverviewTable() {
  const table = document.getElementById("overview-table");
  if (!table) return;
  const pageItems = getTablePage(state.residents, "overview");
  table.innerHTML = pageItems.map((resident) => `<tr><td>${residentCell(resident)}</td><td class="property-cell">${escapeHTML(resident.lot)} · ${escapeHTML(resident.street)}</td><td class="amount-cell">${formatCurrency(resident.monthlyDues)}</td><td>${statusMarkup(resident)}</td><td>${isPaid(resident) ? `<span class="payment-date-action">Paid · ${escapeHTML(paymentDateLabel(resident))}</span>` : rowAction("Mark paid", "paid", `data-mark-paid="${escapeHTML(resident.id)}"`)}</td></tr>`).join("");
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

function renderMaps() {
  const mini = document.getElementById("mini-map");
  const full = document.getElementById("full-map");
  if (!mini && !full) return;
  const setupMap = (element, zoom, interactive) => {
    if (!element || !window.L) return null;
    if (element._leaflet_id) return element === full ? communityMap : miniMap;
    const map = L.map(element, { zoomControl: interactive, dragging: interactive, scrollWheelZoom: interactive, doubleClickZoom: interactive, boxZoom: interactive, keyboard: interactive, tap: interactive }).setView(mapDefaultCenter, zoom);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    return map;
  };
  if (full && !communityMap) {
    communityMap = setupMap(full, 16, true);
    if (communityMap) mapMarkers = L.layerGroup().addTo(communityMap);
  }
  if (mini && !miniMap) miniMap = setupMap(mini, 15, false);
  if (!mapMarkers && communityMap) mapMarkers = L.layerGroup().addTo(communityMap);
  const makeResidentMarker = (resident) => {
    const status = paymentStatus(resident);
    const icon = L.divIcon({ className: "resident-marker-icon", html: `<span class="resident-map-pin ${status}"></span>`, iconSize: [22, 28], iconAnchor: [11, 26] });
    return L.marker([Number(resident.latitude), Number(resident.longitude)], { icon });
  };
  if (mapMarkers) {
    mapMarkers.clearLayers();
    state.residents.filter((resident) => Number.isFinite(Number(resident.latitude)) && Number.isFinite(Number(resident.longitude))).forEach((resident) => {
      const marker = makeResidentMarker(resident);
      marker.on("click", () => selectResident(resident.id));
      marker.addTo(mapMarkers);
    });
  }
  if (miniMap) {
    miniMap.eachLayer((layer) => { if (layer instanceof L.Marker) miniMap.removeLayer(layer); });
    state.residents.filter((resident) => Number.isFinite(Number(resident.latitude)) && Number.isFinite(Number(resident.longitude))).forEach((resident) => makeResidentMarker(resident).addTo(miniMap));
  }
  const located = state.residents.find((resident) => resident.id === selectedResidentId && Number.isFinite(Number(resident.latitude)) && Number.isFinite(Number(resident.longitude)));
  if (located && communityMap) communityMap.setView([Number(located.latitude), Number(located.longitude)], 18);
  requestAnimationFrame(() => { communityMap?.invalidateSize(); miniMap?.invalidateSize(); });
}

function renderSelectedHome() {
  const panel = document.getElementById("selected-home");
  if (!panel) return;
  const resident = state.residents.find((item) => item.id === selectedResidentId);
  if (!resident) {
    panel.innerHTML = `<div class="selected-empty"><span class="selected-house">⌂</span><h3>Select a home</h3><p>Choose a lot on the map to see resident and payment details.</p></div>`;
    return;
  }
  panel.innerHTML = `<div class="selected-resident-head"><span class="resident-avatar">${escapeHTML(initials(resident.name))}</span><span><strong>${escapeHTML(resident.name)}</strong><small>${escapeHTML(resident.lot)} · ${escapeHTML(resident.street)}</small></span></div><div class="selected-detail"><span>Monthly dues</span><strong>${formatCurrency(resident.monthlyDues)}</strong></div><div class="selected-detail"><span>Phone</span><strong>${escapeHTML(formatPhilippinesPhone(resident.phone))}</strong></div><div class="selected-detail"><span>Email</span><strong>${escapeHTML(resident.email || "Not provided")}</strong></div><div class="selected-detail"><span>This month</span><strong>${statusMarkup(resident)}</strong></div>${isPaid(resident) ? `<div class="selected-detail"><span>Paid on</span><strong>${escapeHTML(paymentDateLabel(resident))}</strong></div>` : ""}<div class="selected-actions">${isPaid(resident) ? `<button class="button button-secondary" data-mark-unpaid="${escapeHTML(resident.id)}">Undo payment</button>` : `<button class="button button-primary" data-mark-paid="${escapeHTML(resident.id)}">Mark dues as paid</button>`}<button class="button button-secondary" data-edit-resident="${escapeHTML(resident.id)}">Edit resident</button><a class="button button-secondary" href="residents.html">View resident directory</a></div>`;
}

function selectResident(id) {
  if (!id) return;
  selectedResidentId = id;
  renderSelectedHome();
  const resident = state.residents.find((item) => item.id === id);
  if (resident) {
    if (resident.latitude != null && resident.longitude != null) communityMap?.setView([Number(resident.latitude), Number(resident.longitude)], 18, { animate: true });
  }
  if (window.matchMedia("(max-width: 640px)").matches) {
    requestAnimationFrame(() => scrollToResidentDetails());
  }
}

function scrollToResidentDetails() {
  const panel = document.getElementById("selected-home");
  if (!panel) return;
  const startY = window.scrollY;
  const targetY = Math.max(0, startY + panel.getBoundingClientRect().top - 68);
  const distance = targetY - startY;
  const duration = 650;
  const startedAt = performance.now();
  const animate = (now) => {
    const progress = Math.min(1, (now - startedAt) / duration);
    const eased = progress < 0.5
      ? 4 * progress * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 3) / 2;
    window.scrollTo(0, startY + distance * eased);
    if (progress < 1) requestAnimationFrame(animate);
  };
  requestAnimationFrame(animate);
}

function markPaid(id) {
  const resident = state.residents.find((item) => item.id === id);
  if (!resident) return;
  resident.paidMonth = currentMonthKey;
  resident.paidMonths = [...new Set([...(resident.paidMonths || []), currentMonthKey])];
  delete resident.paid;
  delete resident.paidProofKey;
  delete resident.paidProofName;
  resident.paidDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  resident.paidDates = { ...(resident.paidDates || {}), [currentMonthKey]: resident.paidDate };
  resident.paidAt = paymentDateLabel(resident);
  saveState();
  render();
  if (!document.getElementById("resident-details-modal")?.classList.contains("hidden")) renderResidentDetails(id);
  showToast(`${resident.name}'s monthly dues marked as paid.`);
}

function markUnpaid(id) {
  const resident = state.residents.find((item) => item.id === id);
  if (!resident) return;
  resident.paidMonths = (resident.paidMonths || []).filter((month) => month !== currentMonthKey);
  resident.paidDates = { ...(resident.paidDates || {}) };
  delete resident.paidDates[currentMonthKey];
  delete resident.paidMonth;
  delete resident.paid;
  delete resident.paidAt;
  delete resident.paidDate;
  delete resident.paidProofKey;
  delete resident.paidProofName;
  saveState();
  render();
  if (!document.getElementById("resident-details-modal")?.classList.contains("hidden")) renderResidentDetails(id);
  showToast(`${resident.name}'s payment was marked unpaid.`);
}

function openResidentDetails(id) {
  renderResidentDetails(id);
  document.getElementById("resident-details-modal")?.classList.remove("hidden");
}

function renderResidentDetails(id) {
  const resident = state.residents.find((item) => item.id === id);
  if (!resident) return;
  document.getElementById("resident-details-title").textContent = resident.name;
  document.getElementById("resident-details-content").innerHTML = `<div class="resident-details-summary"><span class="resident-avatar">${escapeHTML(initials(resident.name))}</span><div><strong>${escapeHTML(resident.name)}</strong><small>${escapeHTML(resident.email || formatPhilippinesPhone(resident.phone))}</small></div></div><div class="resident-details-grid"><div><span>Phone</span><strong>${escapeHTML(formatPhilippinesPhone(resident.phone))}</strong></div><div><span>Email</span><strong>${escapeHTML(resident.email || "Not provided")}</strong></div><div><span>Property</span><strong>${escapeHTML([resident.lot, resident.street].filter(Boolean).join(" · ") || "Not provided")}</strong></div><div><span>Monthly dues</span><strong>${formatCurrency(resident.monthlyDues)}</strong></div><div><span>Payment status</span><strong>${statusMarkup(resident)}</strong></div>${isPaid(resident) ? `<div><span>Paid on</span><strong>${escapeHTML(paymentDateLabel(resident))}</strong></div>` : ""}</div><div class="resident-details-actions">${isPaid(resident) ? `<button class="button button-secondary" data-mark-unpaid="${escapeHTML(resident.id)}">Restore to unpaid</button>` : `<button class="button button-primary" data-mark-paid="${escapeHTML(resident.id)}">Mark as paid</button>`}<button class="button button-secondary" data-edit-resident="${escapeHTML(resident.id)}">Edit resident</button></div>`;
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
  setPickerLocation(null, null);
  document.getElementById("modal-title").textContent = "Add a resident";
  document.getElementById("resident-submit").textContent = "Add resident";
  form.querySelector('[name="monthlyDues"]').value = state.settings.defaultMonthlyDues;
  document.getElementById("resident-modal").classList.remove("hidden");
  initializePickerMap();
  form.querySelector('input[name="name"]').focus();
}

function editResident(id) {
  const resident = state.residents.find((item) => item.id === id);
  const form = document.getElementById("resident-form");
  if (!resident || !form) return;
  editingResidentId = id;
  for (const field of ["name", "phone", "email", "lot", "street", "monthlyDues"]) {
    form.elements[field].value = field === "phone" ? philippinesMobileDigits(resident.phone) : resident[field] ?? "";
  }
  form.elements.phone.dispatchEvent(new Event("input", { bubbles: true }));
  document.getElementById("modal-title").textContent = "Edit resident";
  document.getElementById("resident-submit").textContent = "Save changes";
  document.getElementById("resident-modal").classList.remove("hidden");
  setPickerLocation(resident.latitude, resident.longitude);
  initializePickerMap();
  form.querySelector('input[name="name"]').focus();
}

function setPickerLocation(latitude, longitude) {
  const form = document.getElementById("resident-form");
  if (!form) return;
  const latInput = form.elements.latitude;
  const lngInput = form.elements.longitude;
  const hasLocation = Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude)) && latitude !== null && longitude !== null && latitude !== "" && longitude !== "";
  latInput.value = hasLocation ? Number(latitude) : "";
  lngInput.value = hasLocation ? Number(longitude) : "";
  const hint = document.getElementById("location-hint");
  if (hint) hint.textContent = hasLocation ? `${Number(latitude).toFixed(5)}, ${Number(longitude).toFixed(5)} · click to move pin` : "Click the map to place a pin.";
  if (pickerMap && hasLocation) {
    pickerMap.setView([Number(latitude), Number(longitude)], Math.max(pickerMap.getZoom(), 17));
    if (pickerMarker) pickerMarker.setLatLng([Number(latitude), Number(longitude)]);
    else pickerMarker = L.marker([Number(latitude), Number(longitude)]).addTo(pickerMap);
  } else if (pickerMarker && !hasLocation) {
    pickerMap.removeLayer(pickerMarker);
    pickerMarker = null;
  }
}

function initializePickerMap() {
  const element = document.getElementById("location-picker");
  if (!element || !window.L) return;
  if (!pickerMap) {
    pickerMap = L.map(element).setView(mapDefaultCenter, 17);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(pickerMap);
    pickerMap.on("click", (event) => setPickerLocation(event.latlng.lat, event.latlng.lng));
  }
  window.setTimeout(() => pickerMap.invalidateSize(), 80);
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
  const month = form.elements.month;
  month.value = currentMonthKey;
  month.max = currentMonthKey;
  document.getElementById("export-modal")?.classList.remove("hidden");
  month.focus();
}

function closeExportModal() {
  document.getElementById("export-modal")?.classList.add("hidden");
}

function exportCSV(monthKey) {
  if (!/^\d{4}-\d{2}$/.test(monthKey || "") || monthKey > currentMonthKey) {
    showToast("Choose a valid month up to the current month.");
    return;
  }
  const monthLabel = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(new Date(`${monthKey}-01T00:00:00`));
  const hasRecordedPayment = state.residents.some((resident) => resident.paidMonths?.includes(monthKey) || resident.paidMonth === monthKey);
  const hasCurrentMonthRegister = monthKey === currentMonthKey && state.residents.length > 0;
  if (!hasRecordedPayment && !hasCurrentMonthRegister) {
    showToast(`No payment data is recorded for ${monthLabel}. Choose another month.`);
    return;
  }
  const rows = [
    ["Resident", "Phone", "Email", "Lot", "Street", "Monthly dues", "Month", "Status", "Paid date"],
    ...state.residents.map((resident) => [resident.name, formatPhilippinesPhone(resident.phone), resident.email || "", resident.lot, resident.street, resident.monthlyDues, monthLabel, paymentStatusForMonth(resident, monthKey), resident.paidDates?.[monthKey] || (resident.paidDate?.startsWith(monthKey) ? resident.paidDate : "")])
  ];
  const csv = rows.map((row) => row.map((field) => `"${String(field).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `bistek-village-dues-report-${monthKey}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  closeExportModal();
  showToast(`${monthLabel} dues report downloaded.`);
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
  const button = event.target.closest("[data-mark-paid], [data-mark-unpaid], [data-select-resident], [data-view-residents], [data-view-resident], [data-edit-resident], [data-delete-resident]");
  if (!button) return;
  if (button.hasAttribute("data-mark-paid")) markPaid(button.dataset.markPaid);
  else if (button.hasAttribute("data-mark-unpaid")) markUnpaid(button.dataset.markUnpaid);
  else if (button.hasAttribute("data-view-resident")) openResidentDetails(button.dataset.viewResident);
  else if (button.hasAttribute("data-select-resident")) {
    event.preventDefault();
    selectResident(button.dataset.selectResident);
  } else if (button.hasAttribute("data-edit-resident")) { closeResidentDetails(); editResident(button.dataset.editResident); }
  else if (button.hasAttribute("data-delete-resident")) deleteResident(button.dataset.deleteResident);
});
document.getElementById("payments-export-button")?.addEventListener("click", openExportModal);
document.getElementById("export-close")?.addEventListener("click", closeExportModal);
document.getElementById("export-cancel")?.addEventListener("click", closeExportModal);
document.getElementById("export-form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  exportCSV(event.currentTarget.elements.month.value);
});
document.getElementById("resident-search")?.addEventListener("input", (event) => { tablePages.residents = 1; renderResidentsTable(event.target.value); });
document.getElementById("payment-search")?.addEventListener("input", (event) => { tablePages.payments = 1; renderPaymentsTable(event.target.value); });
document.getElementById("payment-status-filter")?.addEventListener("change", () => { tablePages.payments = 1; renderPaymentsTable(document.getElementById("payment-search")?.value || ""); });
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
  const latitude = Number(formData.get("latitude"));
  const longitude = Number(formData.get("longitude"));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !formData.get("latitude") || !formData.get("longitude")) {
    showToast("Choose the resident's home on the map first.");
    return;
  }
  const resident = {
    ...(editingResidentId ? state.residents.find((item) => item.id === editingResidentId) : {}),
    id: editingResidentId || `resident-${Date.now()}`,
    name: String(formData.get("name")).trim(),
    phone: `+63${philippinesMobileDigits(formData.get("phone"))}`,
    email: String(formData.get("email")).trim(),
    lot: String(formData.get("lot")).trim().toUpperCase(),
    street: String(formData.get("street")).trim(),
    latitude,
    longitude,
    monthlyDues: Number(formData.get("monthlyDues")),
  };
  if (!/^9\d{9}$/.test(philippinesMobileDigits(formData.get("phone")))) {
    showToast("Enter a valid Philippine mobile number: 10 digits starting with 9.");
    return;
  }
  if (resident.lot && state.residents.some((item) => item.id !== editingResidentId && item.lot?.toLowerCase() === resident.lot.toLowerCase())) {
    showToast("That house or lot number is already in use.");
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
  if (!communityName || !Number.isFinite(defaultMonthlyDues) || defaultMonthlyDues < 0 || dueDay < 1 || dueDay > 28) {
    showToast("Check the community settings and try again.");
    return;
  }
  state.settings = { ...state.settings, communityName, defaultMonthlyDues, dueDay };
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

document.title = `${document.body.dataset.page === "overview" ? "Overview" : document.body.dataset.page === "map" ? "Community map" : document.body.dataset.page === "payments" ? "Monthly dues" : document.body.dataset.page === "residents" ? "Residents" : document.body.dataset.page === "reports" ? "Reports" : "Settings"} — ${state.settings.communityName}`;
const mapResident = new URLSearchParams(window.location.search).get("resident");
if (mapResident) selectedResidentId = mapResident;
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
    if (document.getElementById("mini-map") || document.getElementById("full-map")) renderSelectedHome();
    if (dataNeedsSaving) {
      saveState();
      dataNeedsSaving = false;
    }
  } catch (error) {
    console.error("Could not connect to Firestore.", error);
    showToast(error.message || "Could not connect to Firestore.");
    render();
    if (document.getElementById("mini-map") || document.getElementById("full-map")) renderSelectedHome();
  }
}
startApp();
