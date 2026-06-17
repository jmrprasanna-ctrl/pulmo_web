const filterBreakdownMonthEl = document.getElementById("filterBreakdownMonth");
const breakdownSearchEl = document.getElementById("breakdownSearch");
const breakdownTableBodyEl = document.getElementById("breakdownTableBody");
const breakdownQueryParams = new URLSearchParams(window.location.search);
const requestedBreakdownMonth = String(breakdownQueryParams.get("month") || "").trim();
const highlightedBreakdownId = Number.parseInt(breakdownQueryParams.get("highlight") || "", 10);

const breakdownToday = new Date();
if (filterBreakdownMonthEl) {
    filterBreakdownMonthEl.value = /^\d{4}-\d{2}$/.test(requestedBreakdownMonth)
        ? requestedBreakdownMonth
        : `${breakdownToday.getFullYear()}-${String(breakdownToday.getMonth() + 1).padStart(2, "0")}`;
}

const breakdownRawRole = String(localStorage.getItem("role") || "").toLowerCase();
const breakdownRole = ["coordinator", "cordinator", "co-ordinator", "co ordinator", "co_ordinator"].includes(breakdownRawRole) ? "user" : breakdownRawRole;
const breakdownSelectedDb = String(localStorage.getItem("selectedDatabaseName") || "").toLowerCase();
const breakdownIsTrainingUser = breakdownRole === "user" && breakdownSelectedDb === "demo";
const breakdownCanManage = breakdownRole === "admin" || breakdownRole === "manager" || breakdownIsTrainingUser;
const canEditBreakdown = breakdownCanManage
    ? true
    : (breakdownRole === "user"
        ? (typeof hasUserActionPermission === "function"
            ? hasUserActionPermission("/services/breakdown-list.html", "edit")
            : false)
        : false);

let allBreakdownRows = [];
const MOBILE_COMMENT_LIMIT = 20;

function safeBreakdownDateOnly(value) {
    const raw = String(value || "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

function formatBreakdownDate(value) {
    const raw = safeBreakdownDateOnly(value);
    if (!raw) return "";
    const dt = new Date(`${raw}T00:00:00`);
    if (Number.isNaN(dt.getTime())) return raw;
    return dt.toLocaleDateString();
}

function escapeBreakdownHtml(value) {
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

function formatBreakdownCommentCellValue(value) {
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

function safeBreakdownMonth(value) {
    const raw = String(value || "").trim();
    return /^\d{4}-\d{2}$/.test(raw) ? raw : "";
}

function breakdownWithinMonth(rowDate, monthValue) {
    if (!rowDate) return false;
    if (!monthValue) return true;
    return rowDate.slice(0, 7) === monthValue;
}

function updateBreakdownSummary(rows) {
    const total = rows.length;
    const assigned = rows.filter((row) => Number(row?.technician_user_id || 0) > 0 || String(row?.technician_name || "").trim()).length;
    const unassigned = Math.max(0, total - assigned);

    document.getElementById("breakdownCount").innerText = String(total);
    document.getElementById("assignedBreakdownCount").innerText = String(assigned);
    document.getElementById("unassignedBreakdownCount").innerText = String(unassigned);
}

function renderBreakdownRows(rows) {
    breakdownTableBodyEl.innerHTML = "";

    if (!rows.length) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="6">No breakdown entries found.</td>`;
        breakdownTableBodyEl.appendChild(tr);
        return;
    }

    rows.forEach((row) => {
        const tr = document.createElement("tr");
        const rowId = Number.parseInt(row.id, 10);
        const machineText = [String(row.machine_code || "").trim(), String(row.machine_title || "").trim()]
            .filter(Boolean)
            .join(" - ");
        const commentCell = formatBreakdownCommentCellValue(row.comment_text);

        tr.innerHTML = `
            <td>${escapeBreakdownHtml(formatBreakdownDate(row.service_date))}</td>
            <td>${escapeBreakdownHtml(row.customer_name || "-")}</td>
            <td>${escapeBreakdownHtml(machineText || "-")}</td>
            <td>${escapeBreakdownHtml(row.technician_name || "-")}</td>
            <td>${escapeBreakdownHtml(row.counter_value || "-")}</td>
            <td title="${escapeBreakdownHtml(commentCell.title)}">${escapeBreakdownHtml(commentCell.text)}</td>
        `;

        if (Number.isFinite(highlightedBreakdownId) && highlightedBreakdownId > 0 && rowId === highlightedBreakdownId) {
            tr.style.background = "rgba(34, 130, 228, 0.10)";
            tr.style.boxShadow = "inset 0 0 0 1px rgba(34, 130, 228, 0.28)";
        }

        if (canEditBreakdown && Number.isFinite(rowId) && rowId > 0) {
            tr.classList.add("service-row-clickable");
            tr.addEventListener("click", () => {
                window.location.href = `edit-service.html?id=${rowId}`;
            });
        }

        breakdownTableBodyEl.appendChild(tr);
    });
}

function applyBreakdownFilters() {
    const selectedMonth = safeBreakdownMonth(filterBreakdownMonthEl?.value);
    const query = String(breakdownSearchEl?.value || "").trim().toLowerCase();

    const filtered = allBreakdownRows.filter((row) => {
        const serviceDate = safeBreakdownDateOnly(row.service_date);
        if (!breakdownWithinMonth(serviceDate, selectedMonth)) return false;
        if (!query) return true;

        return [
            row.customer_name,
            row.machine_code,
            row.machine_title,
            row.technician_name,
            row.counter_value,
            row.comment_text,
            row.service_date,
        ].some((value) => String(value || "").toLowerCase().includes(query));
    });

    renderBreakdownRows(filtered);
    updateBreakdownSummary(filtered);
}

async function loadBreakdownRows() {
    try {
        const rows = await request("/services?scope=breakdowns", "GET");
        allBreakdownRows = Array.isArray(rows) ? rows : [];
        applyBreakdownFilters();
    } catch (err) {
        alert(err.message || "Failed to load breakdown list.");
    }
}

filterBreakdownMonthEl?.addEventListener("change", applyBreakdownFilters);
breakdownSearchEl?.addEventListener("input", applyBreakdownFilters);
window.addEventListener("resize", applyBreakdownFilters);

loadBreakdownRows();
