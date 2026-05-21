const invoiceSearchEl = document.getElementById("invoiceSearch");
const invoiceYearEl = document.getElementById("invoiceYearFilter");
const addInvoiceBtn = document.getElementById("addInvoiceBtn");
let allInvoices = [];
const MONTH_SHORT = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const MONTH_LONG = [
    "JANUARY",
    "FEBRUARY",
    "MARCH",
    "APRIL",
    "MAY",
    "JUNE",
    "JULY",
    "AUGUST",
    "SEPTEMBER",
    "OCTOBER",
    "NOVEMBER",
    "DECEMBER"
];
let selectedYear = "";

        function getCurrentYearKey(){
            const now = new Date();
            return String(now.getFullYear());
        }

        function getInvoiceDate(inv){
            const raw = String(inv?.invoice_date || "").trim();
            if(!raw) return null;
            const dt = new Date(raw);
            if(Number.isNaN(dt.getTime())) return null;
            return dt;
        }

        function getInvoiceYearKey(inv){
            const dt = getInvoiceDate(inv);
            if(!dt) return "";
            return String(dt.getFullYear());
        }

        function initYearFilter(){
            if(!invoiceYearEl) return;
            const currentYear = getCurrentYearKey();
            const years = new Set([currentYear]);
            allInvoices.forEach(inv => {
                const year = getInvoiceYearKey(inv);
                if(year) years.add(year);
            });
            const sortedYears = Array.from(years).sort((a, b) => b.localeCompare(a));
            invoiceYearEl.innerHTML = "";
            const allOption = document.createElement("option");
            allOption.value = "";
            allOption.textContent = "All Years";
            invoiceYearEl.appendChild(allOption);
            sortedYears.forEach(year => {
                const opt = document.createElement("option");
                opt.value = year;
                opt.textContent = year;
                invoiceYearEl.appendChild(opt);
            });
            // Default: show full current year (all months in that year).
            selectedYear = sortedYears.includes(currentYear) ? currentYear : "";
            invoiceYearEl.value = selectedYear;
        }

        function renderInvoices(invoices){
            const tbody = document.getElementById('invoice-table-body');
            if(!tbody) return;
            tbody.innerHTML = '';
            if(!invoices || invoices.length === 0){
                const row = document.createElement('tr');
                row.innerHTML = `<td colspan="4">No invoices found.</td>`;
                tbody.appendChild(row);
                return;
            }
            invoices.forEach(inv => {
                const row = document.createElement('tr');
                row.className = "invoice-row-clickable";
                const dateText = inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString() : "";
                row.innerHTML = `
                    <td>${inv.invoice_no}</td>
                    <td>${inv.customer_name || ""}</td>
                    <td>${dateText}</td>
                    <td>${inv.total}</td>
                `;
                row.addEventListener("click", () => {
                    viewInvoice(inv.id);
                });
                tbody.appendChild(row);
            });
        }

        function applyInvoiceFilter(){
            const query = (invoiceSearchEl?.value || "").trim().toLowerCase();
            const year = String(selectedYear || "").trim();
            const filtered = allInvoices.filter(inv => {
                if(year && getInvoiceYearKey(inv) !== year) return false;
                const dt = getInvoiceDate(inv);
                const dateText = dt ? dt.toLocaleDateString() : "";
                const monthShort = dt ? MONTH_SHORT[dt.getMonth()] : "";
                const monthLong = dt ? MONTH_LONG[dt.getMonth()] : "";
                const yearMonth = dt ? `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}` : "";
                if(!query) return true;
                return [
                    inv.invoice_no,
                    inv.customer_name,
                    dateText,
                    inv.total,
                    monthShort,
                    monthLong,
                    yearMonth
                ].some(v => String(v || "").toLowerCase().includes(query));
            });
            renderInvoices(filtered);
        }

        async function loadInvoices(){
            try{
                allInvoices = await request("/invoices","GET");
                initYearFilter();
                applyInvoiceFilter();
            }catch(err){
                const tbody = document.getElementById('invoice-table-body');
                if(!tbody) return;
                tbody.innerHTML = '';
                const row = document.createElement('tr');
                row.innerHTML = `<td colspan="4">${err.message || "Failed to load invoices"}</td>`;
                tbody.appendChild(row);
            }
        }

        function viewInvoice(id){
            window.location.href = `view-invoice.html?id=${id}`;
        }

        async function deleteInvoice(id){
            if(!confirm("Delete this invoice?")) return;
            try{
                await request(`/invoices/${id}`,"DELETE");
                loadInvoices();
            }catch(err){
                alert(err.message || "Failed to delete invoice");
            }
        }

        if(invoiceSearchEl){
            invoiceSearchEl.addEventListener("input", applyInvoiceFilter);
        }
if(invoiceYearEl){
    invoiceYearEl.addEventListener("change", () => {
        selectedYear = String(invoiceYearEl.value || "");
        applyInvoiceFilter();
    });
}
if(addInvoiceBtn){
    addInvoiceBtn.addEventListener("click", () => {
        window.location.href = "create-invoice.html";
    });
}

        window.addEventListener('DOMContentLoaded', loadInvoices);

        function logout(){
            localStorage.removeItem("token");
            localStorage.removeItem("role");
            window.location.href="../login.html";
        }
