const filterServiceMonthEl = document.getElementById("filterServiceMonth");
const filterServiceTypeEl = document.getElementById("filterServiceType");
const filterServiceModeWrapEl = document.getElementById("filterServiceModeWrap");
const filterServiceModeEl = document.getElementById("filterServiceMode");
const serviceSearchEl = document.getElementById("serviceSearch");
const serviceTableBodyEl = document.getElementById("serviceTableBody");
const addServiceBtn = document.getElementById("addServiceBtn");

const today = new Date();
if (filterServiceMonthEl) {
    filterServiceMonthEl.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
}

const rawRole = String(localStorage.getItem("role") || "").toLowerCase();
const role = ["coordinator", "cordinator", "co-ordinator", "co ordinator", "co_ordinator"].includes(rawRole) ? "user" : rawRole;
const selectedDb = String(localStorage.getItem("selectedDatabaseName") || "").toLowerCase();
const isTrainingUser = role === "user" && selectedDb === "demo";
const canManage = role === "admin" || role === "manager" || isTrainingUser;
const canAddService = canManage
    ? true
    : (role === "user"
        ? (typeof hasUserActionPermission === "function"
            ? (
                hasUserActionPermission("/services/service-list.html", "add")
                || hasUserActionPermission("/services/add-service.html", "add")
            )
            : false)
        : false);
const canEditService = canManage
    ? true
    : (role === "user"
        ? (typeof hasUserActionPermission === "function"
            ? (
                hasUserActionPermission("/services/service-list.html", "edit")
                || hasUserActionPermission("/services/edit-service.html", "edit")
            )
            : false)
        : false);

if (addServiceBtn && !canAddService) {
    addServiceBtn.style.display = "none";
}

let allServiceRows = [];
const MOBILE_COMMENT_LIMIT = 20;

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

function isMobileCommentViewport() {
    return typeof window !== "undefined"
        && typeof window.matchMedia === "function"
        && window.matchMedia("(max-width: 900px)").matches;
}

function formatCommentCellValue(value) {
    const raw = String(value || "").trim();
    if (!raw) {
        return { text: "-", title: "" };
    }
    if (!isMobileCommentViewport() || raw.length <= MOBILE_COMMENT_LIMIT) {
        return { text: raw, title: raw };
    }
    return {
        text: `${raw.slice(0, MOBILE_COMMENT_LIMIT)}...`,
        title: raw
    };
}

function safeMonthValue(value) {
    const raw = String(value || "").trim();
    return /^\d{4}-\d{2}$/.test(raw) ? raw : "";
}

function isRowWithinMonth(rowDate, monthValue) {
    if (!rowDate) return false;
    if (!monthValue) return true;
    return rowDate.slice(0, 7) === monthValue;
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
    const selectedMonth = safeMonthValue(filterServiceMonthEl?.value);
    const typeFilter = String(filterServiceTypeEl.value || "").trim().toLowerCase();
    const modeFilter = shouldShowModeFilter() ? normalizeServiceMode(filterServiceModeEl.value) : "";
    const query = String(serviceSearchEl.value || "").trim().toLowerCase();

    const filtered = allServiceRows.filter((row) => {
        const serviceDate = safeDateOnly(row.service_date);
        if (!isRowWithinMonth(serviceDate, selectedMonth)) return false;

        const rowType = normalizeServiceType(row.service_type);
        if (typeFilter && rowType !== typeFilter) return false;

        const rowMode = getRowMode(row);
        if (modeFilter && (rowType !== "general" || rowMode !== modeFilter)) return false;

        if (!query) return true;

        return [
            row.customer_name,
            row.machine_code,
            row.machine_title,
            row.technician_name,
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
        tr.innerHTML = `<td colspan="8">No service entries found.</td>`;
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
        const commentCell = formatCommentCellValue(row.comment_text);
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
            <td>${escapeHtml(row.technician_name || "-")}</td>
            <td>${escapeHtml(row.counter_value || "-")}</td>
            <td title="${escapeHtml(commentCell.title)}">${escapeHtml(commentCell.text)}</td>
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
        const rows = await request("/services?scope=visits", "GET");
        allServiceRows = Array.isArray(rows) ? rows : [];
        applyFilters();
    } catch (err) {
        alert(err.message || "Failed to load service list.");
    }
}

filterServiceMonthEl?.addEventListener("change", applyFilters);
filterServiceTypeEl.addEventListener("change", () => {
    updateModeFilterVisibility();
    applyFilters();
});
filterServiceModeEl?.addEventListener("change", applyFilters);
serviceSearchEl.addEventListener("input", applyFilters);
window.addEventListener("resize", applyFilters);

updateModeFilterVisibility();
loadServiceRows();
