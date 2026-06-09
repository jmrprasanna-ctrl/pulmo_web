const role = (localStorage.getItem("role") || "").toLowerCase();
const allowedPaths = (() => {
    try{
        const rows = JSON.parse(localStorage.getItem("userAllowedPathsRuntime") || "[]");
        return new Set((Array.isArray(rows) ? rows : []).map((x) => String(x || "").trim().toLowerCase()));
    }catch(_err){
        return new Set();
    }
})();
const canAccessPendings = (role === "admin" || role === "manager")
    ? true
    : (role === "user" && (allowedPaths.has("/finance/pendings.html") || allowedPaths.has("/finance/finance.html")));
if(!canAccessPendings){
    alert("You don't have access to Pendings.");
    window.location.href = "../dashboard.html";
}

const yearFilter = document.getElementById("yearFilter");
const pendingTableBody = document.querySelector("#pendingTable tbody");
const pendingActionHeader = document.getElementById("pendingActionHeader");
const canDeletePendingInvoices = role === "admin";
let selectedYear = String(new Date().getFullYear());
let rowsCache = [];
const DELETE_ICON_SVG = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 7h14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
        <path d="M9.5 7V5.5h5V7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
        <path d="M7.5 7.5l.8 11a1 1 0 0 0 1 .9h5.4a1 1 0 0 0 1-.9l.8-11" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
        <path d="M10 10.5v6M14 10.5v6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
    </svg>
`;

if(pendingActionHeader){
    pendingActionHeader.style.display = canDeletePendingInvoices ? "" : "none";
}

function asNumber(v){
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

function formatCurrency(v){
    return asNumber(v).toFixed(2);
}

function normalizeStatus(v){
    const raw = String(v || "").trim().toLowerCase();
    if(raw === "received" || raw === "recieved"){
        return "Received";
    }
    return "Pending";
}

function getPendingTotalAmount(){
    return rowsCache.reduce((sum, row) => sum + asNumber(row.total_amount), 0);
}

function initYearFilter(){
    const currentYear = new Date().getFullYear();
    yearFilter.innerHTML = "";
    for(let y = currentYear; y >= currentYear - 20; y -= 1){
        const option = document.createElement("option");
        option.value = String(y);
        option.textContent = String(y);
        yearFilter.appendChild(option);
    }
    yearFilter.value = selectedYear;
}

function renderTable(){
    pendingTableBody.innerHTML = "";

    if(!rowsCache.length){
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="${canDeletePendingInvoices ? 9 : 8}">No pending invoices found.</td>`;
        pendingTableBody.appendChild(tr);
        return;
    }

    rowsCache.forEach((row) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${row.invoice_no || ""}</td>
            <td>${row.customer_name || ""}</td>
            <td>${row.customer_mode || ""}</td>
            <td>${row.invoice_date ? new Date(`${String(row.invoice_date).slice(0, 10)}T00:00:00`).toLocaleDateString() : ""}</td>
            <td>${formatCurrency(row.total_amount)}</td>
            <td>${row.payment_method || "Cash"}</td>
            <td>${row.cheque_no || ""}</td>
            <td><span class="status-badge">${normalizeStatus(row.payment_status)}</span></td>
            ${canDeletePendingInvoices ? `<td class="pending-action-cell"></td>` : ""}
        `;
        if(canDeletePendingInvoices){
            const actionCell = tr.querySelector(".pending-action-cell");
            const button = document.createElement("button");
            button.type = "button";
            button.className = "icon-btn btn-danger pending-delete-btn";
            button.setAttribute("aria-label", "Delete invoice");
            button.setAttribute("title", "Delete invoice");
            button.dataset.invoiceId = String(Number(row.id) || 0);
            button.dataset.invoiceNo = String(row.invoice_no || "");
            button.innerHTML = DELETE_ICON_SVG;
            actionCell.appendChild(button);
        }
        pendingTableBody.appendChild(tr);
    });
}

function renderSummary(totalAmount){
    document.getElementById("pendingCount").innerText = String(rowsCache.length);
    document.getElementById("pendingAmount").innerText = formatCurrency(totalAmount);
}

async function loadPendings(){
    try{
        const year = String(selectedYear || "").trim();
        const data = await request(`/reports/pending-invoices-yearly?year=${encodeURIComponent(year)}`, "GET");
        rowsCache = Array.isArray(data?.rows) ? data.rows : [];
        renderSummary(data?.total_pending_amount || 0);
        renderTable();
    }catch(err){
        alert(err.message || "Failed to load pending invoices.");
    }
}

async function deletePendingInvoice(invoiceId, invoiceNo){
    const normalizedId = Number.parseInt(String(invoiceId || ""), 10);
    if(!Number.isInteger(normalizedId) || normalizedId <= 0){
        alert("Invoice id is invalid.");
        return;
    }

    const label = String(invoiceNo || "").trim();
    const confirmMessage = label
        ? `Delete invoice ${label} and related quotation data from the system?`
        : "Delete this invoice and related quotation data from the system?";
    if(!confirm(confirmMessage)) return;

    try{
        await request(`/invoices/${normalizedId}`, "DELETE");
        rowsCache = rowsCache.filter((row) => Number(row.id) !== normalizedId);
        renderSummary(getPendingTotalAmount());
        renderTable();
        alert("Invoice deleted.");
    }catch(err){
        alert(err.message || "Failed to delete invoice.");
    }
}

function exportPendingsPDF(){
    if(!rowsCache.length){
        alert("No pending invoices to export.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ format: "a4" });
    doc.setFontSize(12);
    doc.text(`Pending Invoices - ${selectedYear}`, 14, 20);
    doc.setFontSize(9);
    doc.text(`Total Invoices: ${rowsCache.length}`, 14, 27);
    doc.text(`Pending Amount (Rs.): ${formatCurrency(rowsCache.reduce((sum, row) => sum + asNumber(row.total_amount), 0))}`, 14, 32);

    let y = 40;
    const pageHeight = doc.internal.pageSize.getHeight();
    const maxWidth = doc.internal.pageSize.getWidth() - 28;

    rowsCache.forEach((row, index) => {
        const invoiceDate = row.invoice_date ? new Date(`${String(row.invoice_date).slice(0, 10)}T00:00:00`).toLocaleDateString() : "";
        const line = [
            `${index + 1}.`,
            row.invoice_no || "",
            row.customer_name || "",
            row.customer_mode || "",
            invoiceDate,
            formatCurrency(row.total_amount),
            row.payment_method || "Cash",
            row.cheque_no || "",
            normalizeStatus(row.payment_status)
        ].join(" | ");

        const wrapped = doc.splitTextToSize(line, maxWidth);
        const nextY = y + (wrapped.length * 5);
        if(nextY > pageHeight - 10){
            doc.addPage();
            y = 15;
        }
        doc.text(wrapped, 14, y);
        y += (wrapped.length * 5) + 3;
    });

    doc.save(`Pending_Invoices_${selectedYear}.pdf`);
}

pendingTableBody.addEventListener("click", (event) => {
    const button = event.target.closest(".pending-delete-btn");
    if(!button) return;
    deletePendingInvoice(button.dataset.invoiceId, button.dataset.invoiceNo);
});

yearFilter.addEventListener("change", () => {
    selectedYear = String(yearFilter.value || "");
    loadPendings();
});

initYearFilter();
loadPendings();
