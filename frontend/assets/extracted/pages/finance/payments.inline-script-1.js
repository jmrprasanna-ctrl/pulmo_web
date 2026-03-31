const role = (localStorage.getItem("role") || "").toLowerCase();
const allowedPaths = (() => {
    try{
        const rows = JSON.parse(localStorage.getItem("userAllowedPathsRuntime") || "[]");
        return new Set((Array.isArray(rows) ? rows : []).map((x) => String(x || "").trim().toLowerCase()));
    }catch(_err){
        return new Set();
    }
})();
const canAccessFinance = (role === "admin" || role === "manager")
    ? true
    : (role === "user" && (allowedPaths.has("/finance/payments.html") || allowedPaths.has("/finance/finance.html")));
if(!canAccessFinance){
    alert("You don't have access to Payments.");
    window.location.href = "../dashboard.html";
}

const paymentForm = document.getElementById("paymentForm");
const invoiceSelect = document.getElementById("invoiceId");
const paymentDateInput = document.getElementById("paymentDate");
const paymentModeSelect = document.getElementById("paymentMode");
const chequeField = document.getElementById("chequeField");
const chequeNoInput = document.getElementById("chequeNo");
const paymentStatusSelect = document.getElementById("paymentStatus");
const statusFilterSelect = document.getElementById("statusFilter");
const customerSearchInput = document.getElementById("customerSearch");

let allGeneralInvoices = [];
let selectedYear = String(new Date().getFullYear());

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

function getRowYear(inv){
    const raw = String(inv?.payment_date || inv?.invoice_date || inv?.createdAt || "").trim();
    if(!raw) return "";
    const dt = new Date(raw);
    if(Number.isNaN(dt.getTime())) return "";
    return String(dt.getFullYear());
}

function getYearFilteredRows(){
    const year = String(selectedYear || "").trim();
    if(!year) return allGeneralInvoices.slice();
    return allGeneralInvoices.filter((inv) => getRowYear(inv) === year);
}

function initYearFilter(){
    const yearFilterSelect = document.getElementById("yearFilter");
    if(!yearFilterSelect) return;
    const years = new Set([selectedYear]);
    allGeneralInvoices.forEach((inv) => {
        const y = getRowYear(inv);
        if(y) years.add(y);
    });
    const sortedYears = Array.from(years).sort((a, b) => Number(b) - Number(a));
    yearFilterSelect.innerHTML = "";
    sortedYears.forEach((y) => {
        const option = document.createElement("option");
        option.value = y;
        option.textContent = y;
        yearFilterSelect.appendChild(option);
    });
    yearFilterSelect.value = sortedYears.includes(selectedYear) ? selectedYear : sortedYears[0];
    selectedYear = String(yearFilterSelect.value || selectedYear);
}

function toggleChequeField(){
    const isCheque = paymentModeSelect.value === "Cheque";
    chequeField.style.display = isCheque ? "grid" : "none";
    chequeNoInput.required = isCheque;
    if(!isCheque){
        chequeNoInput.value = "";
    }
}

function populateInvoiceSelect(rows){
    const current = invoiceSelect.value;
    invoiceSelect.innerHTML = `<option value="">Select Invoice</option>`;
    rows.forEach((inv) => {
        const option = document.createElement("option");
        option.value = String(inv.id);
        option.textContent = `${inv.invoice_no || ""} - ${inv.customer_name || ""} (${formatCurrency(inv.total)})`;
        invoiceSelect.appendChild(option);
    });
    if(current){
        invoiceSelect.value = current;
    }
}

function renderSummary(rows){
    const received = rows.filter((inv) => normalizeStatus(inv.payment_status) === "Received").length;
    const pending = rows.length - received;
    document.getElementById("totalInvoices").innerText = String(rows.length);
    document.getElementById("receivedCount").innerText = String(received);
    document.getElementById("pendingCount").innerText = String(pending);
}

function renderTable(){
    const tbody = document.querySelector("#paymentsTable tbody");
    tbody.innerHTML = "";
    const statusFilter = String(statusFilterSelect.value || "all").toLowerCase();
    const customerSearch = String(customerSearchInput?.value || "").trim().toLowerCase();
    const rows = getYearFilteredRows().filter((inv) => {
        const matchesStatus = statusFilter === "all"
            ? true
            : normalizeStatus(inv.payment_status).toLowerCase() === statusFilter;
        const amountText = formatCurrency(inv.total);
        const matchesSearch = !customerSearch
            ? true
            : (
                String(inv.id || "").toLowerCase().includes(customerSearch) ||
                String(inv.invoice_no || "").toLowerCase().includes(customerSearch) ||
                String(inv.customer_name || "").toLowerCase().includes(customerSearch) ||
                amountText.toLowerCase().includes(customerSearch)
            );
        return matchesStatus && matchesSearch;
    });

    if(!rows.length){
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="8">No data found.</td>`;
        tbody.appendChild(tr);
        return;
    }

    rows.forEach((inv) => {
        const tr = document.createElement("tr");
        const status = normalizeStatus(inv.payment_status);
        const badgeClass = status === "Received" ? "status-badge status-received" : "status-badge status-pending";
        tr.innerHTML = `
            <td>${inv.invoice_no || ""}</td>
            <td>${inv.customer_name || ""}</td>
            <td>${inv.payment_date ? new Date(`${inv.payment_date}T00:00:00`).toLocaleDateString() : ""}</td>
            <td>${formatCurrency(inv.total)}</td>
            <td>${inv.payment_method || "Cash"}</td>
            <td>${inv.cheque_no || ""}</td>
            <td><span class="${badgeClass}">${status}</span></td>
            <td><button type="button" class="btn btn-secondary" onclick="deletePaymentEntry(${Number(inv.id)}, '${String(inv.invoice_no || "").replace(/'/g, "\\'")}')">Delete</button></td>
        `;
        tbody.appendChild(tr);
    });
}

async function deletePaymentEntry(invoiceId, invoiceNo){
    if(!invoiceId){
        alert("Invalid invoice id.");
        return;
    }
    const safeNo = invoiceNo || String(invoiceId);
    if(!confirm(`Delete payment data for invoice ${safeNo}?`)){
        return;
    }
    try{
        await request(`/invoices/${invoiceId}/payment`, "DELETE");
        showMessageBox("Payment data deleted successfully!");
        await loadInvoices();
    }catch(err){
        alert(err.message || "Failed to delete payment data.");
    }
}

function exportPaymentsPDF(){
    const rows = document.querySelectorAll("#paymentsTable tbody tr");
    if(!rows.length){
        alert("No data to export.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ format: "a4" });
    doc.setFontSize(12);
    doc.text("Payments List", 14, 20);
    doc.setFontSize(9);
    doc.text(`Status Filter: ${statusFilterSelect.value || "all"}`, 14, 26);
    doc.text(`Year Filter: ${selectedYear || "all"}`, 14, 31);

    let y = 39;
    const pageHeight = doc.internal.pageSize.getHeight();
    const maxWidth = doc.internal.pageSize.getWidth() - 28;

    rows.forEach((row) => {
        const cells = Array.from(row.children).map((td) => td.innerText.trim());
        const line = cells.join(" | ");
        const wrapped = doc.splitTextToSize(line, maxWidth);
        const nextY = y + (wrapped.length * 5);
        if(nextY > pageHeight - 10){
            doc.addPage();
            y = 15;
        }
        doc.text(wrapped, 14, y);
        y += (wrapped.length * 5) + 3;
    });

    doc.save("Payments_List.pdf");
}

async function loadInvoices(){
    try{
        const invoices = await request("/invoices", "GET");
        allGeneralInvoices = (Array.isArray(invoices) ? invoices : []).filter((inv) =>
            String(inv.customer_mode || "").toLowerCase() === "general"
        );
        initYearFilter();
        const yearRows = getYearFilteredRows();
        const payableInvoices = yearRows.filter(
            (inv) => normalizeStatus(inv.payment_status) !== "Received"
        );
        populateInvoiceSelect(payableInvoices);
        renderSummary(yearRows);
        renderTable();
    }catch(err){
        alert(err.message || "Failed to load invoices.");
    }
}

paymentForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const invoiceId = Number(invoiceSelect.value);
    if(!invoiceId){
        alert("Please select an invoice.");
        return;
    }

    if(!paymentDateInput.value){
        alert("Please select payment date.");
        return;
    }

    const payload = {
        payment_method: paymentModeSelect.value,
        payment_status: paymentStatusSelect.value,
        cheque_no: chequeNoInput.value.trim(),
        payment_date: paymentDateInput.value
    };

    if(payload.payment_method === "Cheque" && !payload.cheque_no){
        alert("Please enter cheque number.");
        return;
    }

    try{
        await request(`/invoices/${invoiceId}/payment`, "PUT", payload);
        showMessageBox("Payment saved successfully!");
        await loadInvoices();
    }catch(err){
        alert(err.message || "Failed to save payment.");
    }
});

paymentModeSelect.addEventListener("change", toggleChequeField);
statusFilterSelect.addEventListener("change", renderTable);
customerSearchInput?.addEventListener("input", renderTable);
const yearFilterSelect = document.getElementById("yearFilter");
if(yearFilterSelect){
    yearFilterSelect.addEventListener("change", () => {
        selectedYear = String(yearFilterSelect.value || "");
        const yearRows = getYearFilteredRows();
        const payableInvoices = yearRows.filter((inv) => normalizeStatus(inv.payment_status) !== "Received");
        populateInvoiceSelect(payableInvoices);
        renderSummary(yearRows);
        renderTable();
    });
}
invoiceSelect.addEventListener("change", () => {
    const selectedId = Number(invoiceSelect.value || 0);
    const selectedInvoice = getYearFilteredRows().find((inv) => Number(inv.id) === selectedId);
    if(selectedInvoice && selectedInvoice.payment_date){
        paymentDateInput.value = String(selectedInvoice.payment_date).slice(0, 10);
        return;
    }
    paymentDateInput.value = new Date().toISOString().slice(0, 10);
});

toggleChequeField();
paymentDateInput.value = new Date().toISOString().slice(0, 10);
loadInvoices();
