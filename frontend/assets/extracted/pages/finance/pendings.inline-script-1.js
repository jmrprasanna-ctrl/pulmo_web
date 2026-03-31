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
let selectedYear = String(new Date().getFullYear());
let rowsCache = [];

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
    const tbody = document.querySelector("#pendingTable tbody");
    tbody.innerHTML = "";

    if(!rowsCache.length){
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="8">No pending invoices found.</td>`;
        tbody.appendChild(tr);
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
        `;
        tbody.appendChild(tr);
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

yearFilter.addEventListener("change", () => {
    selectedYear = String(yearFilter.value || "");
    loadPendings();
});

initYearFilter();
loadPendings();
