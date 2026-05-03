const invoiceSearchEl = document.getElementById("invoiceSearch");
const invoiceYearEl = document.getElementById("invoiceYearFilter");
const addInvoiceBtn = document.getElementById("addInvoiceBtn");
let allInvoices = [];
let selectedYear = String(new Date().getFullYear());

        function getInvoiceYear(inv){
            const raw = String(inv?.invoice_date || "").trim();
            if(!raw) return "";
            const dt = new Date(raw);
            if(Number.isNaN(dt.getTime())) return "";
            return String(dt.getFullYear());
        }

        function initYearFilter(){
            if(!invoiceYearEl) return;
            const years = new Set([selectedYear]);
            allInvoices.forEach(inv => {
                const y = getInvoiceYear(inv);
                if(y) years.add(y);
            });
            const sortedYears = Array.from(years).sort((a, b) => Number(b) - Number(a));
            invoiceYearEl.innerHTML = "";
            sortedYears.forEach(y => {
                const opt = document.createElement("option");
                opt.value = y;
                opt.textContent = y;
                invoiceYearEl.appendChild(opt);
            });
            invoiceYearEl.value = sortedYears.includes(selectedYear) ? selectedYear : sortedYears[0];
            selectedYear = String(invoiceYearEl.value || selectedYear);
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
                if(year && getInvoiceYear(inv) !== year) return false;
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
