const filterFromDateEl = document.getElementById("filterFromDate");
const filterToDateEl = document.getElementById("filterToDate");
const filterServiceTypeEl = document.getElementById("filterServiceType");
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
const canDeleteService = canManage
    ? true
    : (role === "user"
        ? (typeof hasUserActionPermission === "function"
            ? hasUserActionPermission("/services/service-list.html", "delete")
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

function formatType(value) {
    return String(value || "").toLowerCase() === "rental" ? "Rental" : "General";
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

function applyFilters() {
    const fromDate = safeDateOnly(filterFromDateEl.value);
    const toDate = safeDateOnly(filterToDateEl.value);
    const typeFilter = String(filterServiceTypeEl.value || "").trim().toLowerCase();
    const query = String(serviceSearchEl.value || "").trim().toLowerCase();

    const filtered = allServiceRows.filter((row) => {
        const serviceDate = safeDateOnly(row.service_date);
        if (!isRowWithinDate(serviceDate, fromDate, toDate)) return false;

        const rowType = String(row.service_type || "").trim().toLowerCase();
        if (typeFilter && rowType !== typeFilter) return false;

        if (!query) return true;

        return [
            row.customer_name,
            row.machine_code,
            row.machine_title,
            row.counter_value,
            row.comment_text,
            row.service_date,
            row.service_type,
        ].some((value) => String(value || "").toLowerCase().includes(query));
    });

    renderRows(filtered);
    updateSummary(filtered);
}

function updateSummary(rows) {
    const total = rows.length;
    const general = rows.filter((row) => String(row.service_type || "").toLowerCase() !== "rental").length;
    const rental = total - general;

    document.getElementById("serviceCount").innerText = String(total);
    document.getElementById("generalCount").innerText = String(general);
    document.getElementById("rentalCount").innerText = String(rental);
}

function buildDeleteButton(rowId) {
    if (!canDeleteService) return "-";
    return `
        <button class="icon-btn table-action-btn" type="button" data-service-delete-id="${rowId}" aria-label="Delete service" title="Delete service">
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 3.5h6m-8 3h10m-8 0v12h6v-12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        </button>
    `;
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
        const typeValue = String(row.service_type || "").toLowerCase() === "rental" ? "rental" : "general";
        const machineText = [String(row.machine_code || "").trim(), String(row.machine_title || "").trim()]
            .filter(Boolean)
            .join(" - ");

        tr.innerHTML = `
            <td>${escapeHtml(formatDate(row.service_date))}</td>
            <td><span class="service-type-badge ${typeValue}">${escapeHtml(formatType(row.service_type))}</span></td>
            <td>${escapeHtml(row.customer_name || "-")}</td>
            <td>${escapeHtml(machineText || "-")}</td>
            <td>${escapeHtml(row.counter_value || "-")}</td>
            <td>${escapeHtml(row.comment_text || "-")}</td>
            <td>${buildDeleteButton(row.id)}</td>
        `;
        serviceTableBodyEl.appendChild(tr);
    });

    if (canDeleteService) {
        serviceTableBodyEl.querySelectorAll("[data-service-delete-id]").forEach((button) => {
            button.addEventListener("click", async (event) => {
                const id = Number.parseInt(event.currentTarget.getAttribute("data-service-delete-id"), 10);
                if (!Number.isFinite(id) || id <= 0) return;
                if (!confirm("Delete this service entry?")) return;

                try {
                    await request(`/services/${id}`, "DELETE");
                    allServiceRows = allServiceRows.filter((row) => Number(row.id) !== id);
                    applyFilters();
                    showMessageBox("Service entry deleted successfully.");
                } catch (err) {
                    alert(err.message || "Failed to delete service entry.");
                }
            });
        });
    }
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
filterServiceTypeEl.addEventListener("change", applyFilters);
serviceSearchEl.addEventListener("input", applyFilters);

loadServiceRows();
