const invoiceSearchEl = document.getElementById("invoiceSearch");
const invoiceYearEl = document.getElementById("invoiceYearFilter");
const addInvoiceBtn = document.getElementById("addInvoiceBtn");
let allInvoices = [];
const MONTH_SHORT = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
let selectedPeriod = "";

        function getCurrentPeriodKey(){
            const now = new Date();
            return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        }

        function getInvoiceDate(inv){
            const raw = String(inv?.invoice_date || "").trim();
            if(!raw) return null;
            const dt = new Date(raw);
            if(Number.isNaN(dt.getTime())) return null;
            return dt;
        }

        function getInvoicePeriodKey(inv){
            const dt = getInvoiceDate(inv);
            if(!dt) return "";
            return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
        }

        function formatPeriodLabel(periodKey){
            const [year, month] = String(periodKey || "").split("-");
            const monthNum = Number(month);
            const monthText = MONTH_SHORT[monthNum - 1] || month || "";
            return `${year || ""} ${monthText}`.trim();
        }

        function initYearFilter(){
            if(!invoiceYearEl) return;
            const currentPeriod = getCurrentPeriodKey();
            const periods = new Set([currentPeriod]);
            allInvoices.forEach(inv => {
                const period = getInvoicePeriodKey(inv);
                if(period) periods.add(period);
            });
            const sortedPeriods = Array.from(periods).sort((a, b) => b.localeCompare(a));
            invoiceYearEl.innerHTML = "";
            sortedPeriods.forEach(period => {
                const opt = document.createElement("option");
                opt.value = period;
                opt.textContent = formatPeriodLabel(period);
                invoiceYearEl.appendChild(opt);
            });
            selectedPeriod = selectedPeriod || currentPeriod;
            invoiceYearEl.value = sortedPeriods.includes(selectedPeriod) ? selectedPeriod : sortedPeriods[0];
            selectedPeriod = String(invoiceYearEl.value || selectedPeriod);
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
            const period = String(selectedPeriod || "").trim();
            const filtered = allInvoices.filter(inv => {
                if(period && getInvoicePeriodKey(inv) !== period) return false;
                const dateText = inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString() : "";
                if(!query) return true;
                return [
                    inv.invoice_no,
                    inv.customer_name,
                    dateText,
                    inv.total
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
        selectedPeriod = String(invoiceYearEl.value || "");
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
