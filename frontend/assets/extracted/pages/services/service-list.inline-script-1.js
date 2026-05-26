const filterFromDateEl = document.getElementById("filterFromDate");
const filterToDateEl = document.getElementById("filterToDate");
const filterServiceTypeEl = document.getElementById("filterServiceType");
const filterServiceModeWrapEl = document.getElementById("filterServiceModeWrap");
const filterServiceModeEl = document.getElementById("filterServiceMode");
const serviceSearchEl = document.getElementById("serviceSearch");
const serviceTableBodyEl = document.getElementById("serviceTableBody");
const addServiceBtn = document.getElementById("addServiceBtn");

const today = new Date();
const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
filterFromDateEl.value = monthStart.toISOString().slice(0, 10);
filterToDateEl.value = today.toISOString().slice(0, 10);

const rawRole = String(localStorage.getItem("role") || "").toLowerCase();
const role = ["coordinator", "cordinator", "co-ordinator", "co ordinator", "co_ordinator"].includes(rawRole) ? "user" : rawRole;
const selectedDb = String(localStorage.getItem("selectedDatabaseName") || "").toLowerCase();
const isTrainingUser = role === "user" && selectedDb === "demo";
const canManage = role === "admin" || role === "manager" || isTrainingUser;
const canAddService = canManage
    ? true
    : (role === "user"
        ? (typeof hasUserActionPermission === "function"
            ? (hasUserActionPermission("/services/service-list.html", "add") || hasUserActionPermission("/services/add-service.html", "add"))
            : false)
        : false);
const canEditService = canManage
    ? true
    : (role === "user"
        ? (typeof hasUserActionPermission === "function"
            ? (
                hasUserActionPermission("/services/service-list.html", "edit")
                || hasUserActionPermission("/services/edit-service.html", "view")
                || hasUserActionPermission("/services/edit-service.html", "edit")
            )
            : false)
        : false);

if (addServiceBtn && !canAddService) {
    addServiceBtn.style.display = "none";
}

let allServiceRows = [];

function safeDateOnly(value) {
    const raw = String(value || "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

function formatDate(value) {
    const raw = safeDateOnly(value);
    if (!raw) return "";
    const d = new Date(`${raw}T00:00:00`);
    if (Number.isNaN(d.getTime())) return raw;
    return d.toLocaleDateString();
}

function normalizeServiceType(value) {
    return String(value || "").trim().toLowerCase() === "rental" ? "rental" : "general";
}

function normalizeServiceMode(value) {
    const raw = String(value || "").trim().toLowerCase();
    if (raw === "breakdown" || raw === "service") return raw;
    return "";
}

function getRowMode(row) {
    const type = normalizeServiceType(row?.service_type);
    if (type !== "general") return "";
    const mode = normalizeServiceMode(row?.service_mode);
    return mode || "service";
}

function formatType(value) {
    return normalizeServiceType(value) === "rental" ? "Rental" : "General";
}

function formatModeValue(value) {
    return normalizeServiceMode(value) === "breakdown" ? "Breakdown" : "Service";
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function isRowWithinDate(rowDate, fromDate, toDate) {
    if (!rowDate) return false;
    if (fromDate && rowDate < fromDate) return false;
    if (toDate && rowDate > toDate) return false;
    return true;
}

function shouldShowModeFilter() {
    return String(filterServiceTypeEl?.value || "").trim().toLowerCase() === "general";
}

function updateModeFilterVisibility() {
    const showMode = shouldShowModeFilter();
    if (filterServiceModeWrapEl) {
        filterServiceModeWrapEl.style.display = showMode ? "" : "none";
    }
    if (filterServiceModeEl && !showMode) {
        filterServiceModeEl.value = "";
    }
}

function applyFilters() {
    const fromDate = safeDateOnly(filterFromDateEl.value);
    const toDate = safeDateOnly(filterToDateEl.value);
    const typeFilter = String(filterServiceTypeEl.value || "").trim().toLowerCase();
    const modeFilter = shouldShowModeFilter() ? normalizeServiceMode(filterServiceModeEl.value) : "";
    const query = String(serviceSearchEl.value || "").trim().toLowerCase();

    const filtered = allServiceRows.filter((row) => {
        const serviceDate = safeDateOnly(row.service_date);
        if (!isRowWithinDate(serviceDate, fromDate, toDate)) return false;

        const rowType = normalizeServiceType(row.service_type);
        if (typeFilter && rowType !== typeFilter) return false;

        const rowMode = getRowMode(row);
        if (modeFilter && (rowType !== "general" || rowMode !== modeFilter)) return false;

        if (!query) return true;

        return [
            row.customer_name,
            row.machine_code,
            row.machine_title,
            row.counter_value,
            row.comment_text,
            row.service_date,
            row.service_type,
            row.service_mode,
        ].some((value) => String(value || "").toLowerCase().includes(query));
    });

    renderRows(filtered);
    updateSummary(filtered);
}

function updateSummary(rows) {
    const total = rows.length;
    const general = rows.filter((row) => normalizeServiceType(row.service_type) !== "rental").length;
    const rental = total - general;

    document.getElementById("serviceCount").innerText = String(total);
    document.getElementById("generalCount").innerText = String(general);
    document.getElementById("rentalCount").innerText = String(rental);
}

function renderRows(rows) {
    serviceTableBodyEl.innerHTML = "";

    if (!rows.length) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="7">No service entries found.</td>`;
        serviceTableBodyEl.appendChild(tr);
        return;
    }

    rows.forEach((row) => {
        const tr = document.createElement("tr");
        const rowId = Number.parseInt(row.id, 10);
        const typeValue = normalizeServiceType(row.service_type);
        const machineText = [String(row.machine_code || "").trim(), String(row.machine_title || "").trim()]
            .filter(Boolean)
            .join(" - ");

        const rowMode = getRowMode(row);
        const modeBadge = typeValue === "general"
            ? `<span class="service-type-badge ${rowMode === "breakdown" ? "mode-breakdown" : "mode-service"}">${escapeHtml(formatModeValue(rowMode))}</span>`
            : "-";

        tr.innerHTML = `
            <td>${escapeHtml(formatDate(row.service_date))}</td>
            <td><span class="service-type-badge ${typeValue}">${escapeHtml(formatType(row.service_type))}</span></td>
            <td>${modeBadge}</td>
            <td>${escapeHtml(row.customer_name || "-")}</td>
            <td>${escapeHtml(machineText || "-")}</td>
            <td>${escapeHtml(row.counter_value || "-")}</td>
            <td>${escapeHtml(row.comment_text || "-")}</td>
        `;

        if (canEditService && Number.isFinite(rowId) && rowId > 0) {
            tr.classList.add("service-row-clickable");
            tr.addEventListener("click", () => {
                window.location.href = `edit-service.html?id=${rowId}`;
            });
        }

        serviceTableBodyEl.appendChild(tr);
    });
}

async function loadServiceRows() {
    try {
        const rows = await request("/services", "GET");
        allServiceRows = Array.isArray(rows) ? rows : [];
        applyFilters();
    } catch (err) {
        alert(err.message || "Failed to load service list.");
    }
}

filterFromDateEl.addEventListener("change", applyFilters);
filterToDateEl.addEventListener("change", applyFilters);
filterServiceTypeEl.addEventListener("change", () => {
    updateModeFilterVisibility();
    applyFilters();
});
filterServiceModeEl?.addEventListener("change", applyFilters);
serviceSearchEl.addEventListener("input", applyFilters);

updateModeFilterVisibility();
loadServiceRows();
