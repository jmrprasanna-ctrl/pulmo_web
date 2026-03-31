const role = (localStorage.getItem("role") || "").toLowerCase();
const isAdminManager = role === "admin" || role === "manager";

document.querySelectorAll(".admin-manager-only").forEach((el) => {
    if(!isAdminManager){
        el.style.display = "none";
    }
});

function applyTableScrollLimit(tableId, visibleRows = 10){
    const table = document.getElementById(tableId);
    if(!table) return;
    const wrap = table.closest(".table-scroll-wrap");
    const tbody = table.querySelector("tbody");
    if(!wrap || !tbody) return;

    const rows = Array.from(tbody.querySelectorAll("tr"));
    if(rows.length <= visibleRows){
        wrap.classList.remove("scroll-enabled");
        wrap.style.maxHeight = "";
        return;
    }

    const headerHeight = table.querySelector("thead")?.offsetHeight || 0;
    const rowHeights = rows.slice(0, visibleRows).reduce((sum, row) => sum + row.offsetHeight, 0);
    wrap.style.maxHeight = `${headerHeight + rowHeights + 4}px`;
    wrap.classList.add("scroll-enabled");
}

async function loadSales(){
    try{
        const period = document.getElementById("salesPeriod").value;
        const date = document.getElementById("salesDate").value;
        const query = `?period=${encodeURIComponent(period)}&date=${encodeURIComponent(date)}`;
        const response = await request(`/reports/sales${query}`,"GET");
        const sales = Array.isArray(response) ? response : (response.rows || []);
        const tbody = document.querySelector("#salesTable tbody");
        tbody.innerHTML = "";
        sales.forEach(s=>{
            const tr = document.createElement("tr");
            const dateText = s.date ? new Date(s.date).toLocaleDateString() : "";
            tr.innerHTML = `
                <td>${s.invoice_no}</td>
                <td>${s.customer_name}</td>
                <td>${dateText}</td>
                <td>${s.total_amount}</td>
            `;
            tbody.appendChild(tr);
        });
        applyTableScrollLimit("salesTable");

        const summary = document.getElementById("salesSummary");
        if(summary && response && !Array.isArray(response)){
            summary.innerText = `Invoices: ${response.totalInvoices || sales.length} | Total Sales: ${Number(response.totalSales || 0).toFixed(2)}`;
        }else if(summary){
            const total = sales.reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
            summary.innerText = `Invoices: ${sales.length} | Total Sales: ${total.toFixed(2)}`;
        }
    }catch(err){
        alert("Failed to load sales");
    }
}

function exportSalesPDF(){
    const rows = Array.from(document.querySelectorAll("#salesTable tbody tr"));
    if(!rows.length){
        alert("No data to export. Please click Load first.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ format: "a4" });
    doc.setFontSize(12);
    doc.text("Sales Report", 14, 20);

    const pageHeight = doc.internal.pageSize.getHeight();
    const maxWidth = doc.internal.pageSize.getWidth() - 28;
    let y = 28;

    doc.setFontSize(9);
    rows.forEach((row) => {
        const cells = Array.from(row.children).map((td) => td.innerText.trim());
        const invoiceNo = cells[0] || "";
        const customer = cells[1] || "";
        const dateText = cells[2] || "";
        const totalAmount = cells[3] || "";
        const line = [dateText, invoiceNo, customer, totalAmount].join(" | ");
        const wrapped = doc.splitTextToSize(line, maxWidth);
        const nextY = y + (wrapped.length * 5);
        if(nextY > pageHeight - 10){
            doc.addPage();
            y = 15;
        }
        doc.text(wrapped, 14, y);
        y += (wrapped.length * 5) + 3;
    });

    doc.save("Sales_Report.pdf");
}

function exportTechnicianPDF(){
    exportTablePDF("technicianSummaryTable", "Technicians Attended Invoices", "Technician_Invoices_Report.pdf");
}

function exportStockReportsPDF(){
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ format: "a4" });
    doc.setFontSize(12);
    doc.text("Stock Reports", 14, 20);
    writeTableToDoc(doc, "Low Stock Products", "lowStockTable", 28);

    doc.save("Stock_Reports.pdf");
}

function exportRentalConsumablesPDF(){
    exportTablePDF("rentalConsumablesTable", "Rental Consumables Report", "Rental_Consumables_Report.pdf");
}

function exportRentalCountPDF(){
    exportTablePDF("rentalCountTable", "Rental Count Report", "Rental_Count_Report.pdf");
}

function exportReportExpensesPDF(){
    exportTablePDF("reportExpenseTable", "Total Expenses", "SalesReport_Total_Expenses.pdf");
}

function exportTablePDF(tableId, reportTitle, fileName){
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ format: "a4" });
    doc.setFontSize(12);
    doc.text(reportTitle, 14, 20);
    const endY = writeTableToDoc(doc, "", tableId, 28);
    if(endY === -1){
        alert("No data to export. Please click Load first.");
        return;
    }
    doc.save(fileName);
}

function writeTableToDoc(doc, sectionTitle, tableId, startY){
    const rows = document.querySelectorAll(`#${tableId} tbody tr`);
    if(!rows.length){
        return -1;
    }

    const pageHeight = doc.internal.pageSize.getHeight();
    const maxWidth = doc.internal.pageSize.getWidth() - 28;
    let y = startY;

    if(sectionTitle){
        doc.setFontSize(11);
        doc.text(sectionTitle, 14, y);
        y += 8;
    }

    doc.setFontSize(9);
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

    return y;
}

async function loadTechnicianReport(){
    if(!isAdminManager) return;
    try{
        const techEl = document.getElementById("techTechnician");
        const selectedTechnician = String(techEl?.value || "").trim();
        let year = Number(document.getElementById("techYear")?.value || 0);
        const monthRaw = String(document.getElementById("techMonth")?.value || "").trim().toLowerCase();
        let monthParam = monthRaw || String(new Date().getMonth() + 1);
        if(!Number.isFinite(year) || year <= 0){
            year = new Date().getFullYear();
        }
        if(monthParam !== "all"){
            const monthNum = Number(monthParam);
            if(!Number.isFinite(monthNum) || monthNum <= 0){
                monthParam = String(new Date().getMonth() + 1);
            }
        }
        const query = `year=${year}&month=${encodeURIComponent(monthParam)}&technician=${encodeURIComponent(selectedTechnician)}`;
        const data = await request(`/reports/technician-invoices-monthly?${query}`,"GET");

        if(techEl){
            const previous = selectedTechnician;
            const list = Array.isArray(data.technicians) ? data.technicians : [];
            techEl.innerHTML = "";
            const allOpt = document.createElement("option");
            allOpt.value = "";
            allOpt.textContent = "All Support Technicians";
            techEl.appendChild(allOpt);
            list.forEach((name) => {
                const opt = document.createElement("option");
                opt.value = String(name || "");
                opt.textContent = String(name || "");
                techEl.appendChild(opt);
            });
            techEl.value = previous && list.includes(previous) ? previous : "";
        }

        const tbody = document.querySelector("#technicianSummaryTable tbody");
        tbody.innerHTML = "";
        (data.rows || []).forEach((row) => {
            const tr = document.createElement("tr");
            const dtText = row.date ? new Date(row.date).toLocaleDateString() : "";
            tr.innerHTML = `
                <td>${row.technician || ""}</td>
                <td>${row.invoice_no || ""}</td>
                <td>${row.customer_name || ""}</td>
                <td>${dtText}</td>
                <td>${Number(row.total_amount || 0).toFixed(2)}</td>
                <td>${Number(row.vendor_product_value || 0).toFixed(2)}</td>
                <td>${Number(row.balance_amount || 0).toFixed(2)}</td>
                <td>${Number(row.technician_percentage || 0).toFixed(2)}%</td>
                <td>${Number(row.allocated_amount || 0).toFixed(2)}</td>
            `;
            tbody.appendChild(tr);
        });
        applyTableScrollLimit("technicianSummaryTable");
    }catch(err){
        alert(err.message || "Failed to load technician report");
    }
}

async function loadStockReports(){
    if(!isAdminManager) return;
    try{
        const min = Number(document.getElementById("minStockLevel").value) || 2;
        const vendorId = String(document.getElementById("stockVendorReport").value || "").trim();
        const query = `vendor_id=${encodeURIComponent(vendorId)}&min=${encodeURIComponent(min)}`;
        const low = await request(`/reports/stock-low?${query}`,"GET");

        const lowBody = document.querySelector("#lowStockTable tbody");
        lowBody.innerHTML = "";
        (low.rows || []).forEach((row) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${row.product_id || ""}</td>
                <td>${row.description || ""}</td>
                <td>${row.model || ""}</td>
                <td>${row.count || 0}</td>
                <td>${row.category || ""}</td>
                <td>${row.vendor || ""}</td>
            `;
            lowBody.appendChild(tr);
        });
        applyTableScrollLimit("lowStockTable");
    }catch(err){
        alert(err.message || "Failed to load stock reports");
    }
}

async function loadStockFilterOptions(){
    if(!isAdminManager) return;
    try{
        const vendors = await request("/vendors","GET");
        const vendorEl = document.getElementById("stockVendorReport");

        if(vendorEl){
            const previousVendor = String(vendorEl.value || "");
            vendorEl.innerHTML = "";
            const allOpt = document.createElement("option");
            allOpt.value = "";
            allOpt.textContent = "All Vendors";
            vendorEl.appendChild(allOpt);

            (Array.isArray(vendors) ? vendors : []).forEach((v) => {
                const opt = document.createElement("option");
                opt.value = String(v.id);
                opt.textContent = String(v.name || "");
                vendorEl.appendChild(opt);
            });
            const pulmoVendor = (Array.isArray(vendors) ? vendors : []).find((v) => String(v?.name || "").trim().toLowerCase().includes("pulmo"));
            if(pulmoVendor && Number.isFinite(Number(pulmoVendor.id))){
                vendorEl.value = String(pulmoVendor.id);
            }else if(previousVendor && Array.from(vendorEl.options).some((o) => o.value === previousVendor)){
                vendorEl.value = previousVendor;
            }
            await loadStockReports();
        }
    }catch(_err){
    }
}

async function loadRentalConsumablesReport(){
    try{
        const customerId = String(document.getElementById("rentalCustomerFilter").value || "").trim();
        const year = String(document.getElementById("rentalConsumablesYearFilter")?.value || "").trim();
        const month = String(document.getElementById("rentalConsumablesMonthFilter")?.value || "").trim();
        const query = `?customer_id=${encodeURIComponent(customerId)}&year=${encodeURIComponent(year)}&month=${encodeURIComponent(month)}`;
        const data = await request(`/reports/rental-consumables${query}`,"GET");
        const tbody = document.querySelector("#rentalConsumablesTable tbody");
        tbody.innerHTML = "";
        (data.rows || []).forEach((row) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${row.customer_name || ""}</td>
                <td>${row.machine_id || ""}</td>
                <td>${row.machine_model || ""}</td>
                <td>${row.serial_no || ""}</td>
                <td>${Number(row.updated_copy_count || 0)}</td>
                <td>${Number(row.total_consumable_qty || 0)}</td>
                <td>${Number(row.total_amount || 0).toFixed(2)}</td>
                <td>${row.latest_entry_at ? new Date(row.latest_entry_at).toLocaleDateString() : ""}</td>
            `;
            tbody.appendChild(tr);
        });
        applyTableScrollLimit("rentalConsumablesTable");
    }catch(err){
        alert(err.message || "Failed to load rental consumables report");
    }
}

async function loadReportExpenses(){
    try{
        const year = String(document.getElementById("reportExpenseYear")?.value || "").trim();
        const month = String(document.getElementById("reportExpenseMonth")?.value || "").trim();
        const baseDate = (year && month && month !== "all")
            ? `${year}-${String(month).padStart(2, "0")}-01`
            : (year ? `${year}-01-01` : "");
        const query = `?date=${encodeURIComponent(baseDate)}&expenseYear=${encodeURIComponent(year)}&expenseMonth=${encodeURIComponent(month)}`;
        const data = await request(`/reports/finance-overview${query}`,"GET");
        const tbody = document.querySelector("#reportExpenseTable tbody");
        tbody.innerHTML = "";
        const rows = Array.isArray(data.month_expense_rows) ? data.month_expense_rows : [];
        if(!rows.length){
            const tr = document.createElement("tr");
            tr.innerHTML = `<td colspan="5">No data found.</td>`;
            tbody.appendChild(tr);
            applyTableScrollLimit("reportExpenseTable");
            return;
        }
        rows.forEach((row) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${row.date ? new Date(row.date).toLocaleDateString() : ""}</td>
                <td>${row.title || ""}</td>
                <td>${row.customer || ""}</td>
                <td>${row.category || ""}</td>
                <td>${Number(row.amount || 0).toFixed(2)}</td>
            `;
            tbody.appendChild(tr);
        });
        applyTableScrollLimit("reportExpenseTable");
    }catch(err){
        const tbody = document.querySelector("#reportExpenseTable tbody");
        if(tbody){
            tbody.innerHTML = `<tr><td colspan="5">${err.message || "Failed to load total expenses"}</td></tr>`;
        }
    }
}

async function loadRentalCustomerFilterOptions(){
    try{
        const select = document.getElementById("rentalCustomerFilter");
        if(!select) return;
        const previous = String(select.value || "");
        const customers = await request("/customers","GET");
        const rentalCustomers = (Array.isArray(customers) ? customers : [])
            .filter((c) => String(c.customer_mode || "").toLowerCase() === "rental")
            .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

        select.innerHTML = "";
        const allOpt = document.createElement("option");
        allOpt.value = "";
        allOpt.textContent = "All Rental Customers";
        select.appendChild(allOpt);

        rentalCustomers.forEach((c) => {
            const opt = document.createElement("option");
            opt.value = String(c.id);
            opt.textContent = String(c.name || "");
            select.appendChild(opt);
        });

        if(previous && rentalCustomers.some((c) => String(c.id) === previous)){
            select.value = previous;
        }
    }catch(_err){
    }
}

async function loadRentalCountReport(){
    try{
        const customerId = String(document.getElementById("rentalCountCustomerFilter").value || "").trim();
        const year = String(document.getElementById("rentalCountYearFilter").value || "").trim();
        const month = String(document.getElementById("rentalCountMonthFilter").value || "").trim();
        const rentalMachineId = String(document.getElementById("rentalMachineFilter").value || "").trim();
        const query = `?rental_machine_id=${encodeURIComponent(rentalMachineId)}&customer_id=${encodeURIComponent(customerId)}&year=${encodeURIComponent(year)}&month=${encodeURIComponent(month)}`;
        const data = await request(`/reports/rental-counts${query}`,"GET");
        const head = document.getElementById("rentalCountHead");
        const tbody = document.querySelector("#rentalCountTable tbody");
        tbody.innerHTML = "";

        if(String(data.mode || "") === "detailed"){
            head.innerHTML = `
                <tr>
                    <th>Customer</th>
                    <th>Machine ID</th>
                    <th>Model</th>
                    <th>Serial No</th>
                    <th>Transaction ID</th>
                    <th>Input Count</th>
                    <th>Updated Count</th>
                    <th>Copied Pages</th>
                    <th>Price</th>
                    <th>Entry Date</th>
                </tr>
            `;
            (data.rows || []).forEach((row) => {
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td>${row.customer_name || ""}</td>
                    <td>${row.machine_id || ""}</td>
                    <td>${row.machine_model || ""}</td>
                    <td>${row.serial_no || ""}</td>
                    <td>${row.transaction_id || ""}</td>
                    <td>${Number(row.input_count || 0)}</td>
                    <td>${Number(row.updated_count || 0)}</td>
                    <td>${Number(row.copied_pages || 0)}</td>
                    <td>${Number(row.price || 0).toFixed(2)}</td>
                    <td>${row.entry_at ? new Date(row.entry_at).toLocaleDateString() : ""}</td>
                `;
                tbody.appendChild(tr);
            });
        }else{
            head.innerHTML = `
                <tr>
                    <th>Customer</th>
                    <th>Machine ID</th>
                    <th>Model</th>
                    <th>Serial No</th>
                    <th>Start Count</th>
                    <th>Last Input Count</th>
                    <th>Updated Copy Count</th>
                    <th>Transactions</th>
                    <th>Price</th>
                    <th>Latest Entry</th>
                </tr>
            `;
            (data.rows || []).forEach((row) => {
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td>${row.customer_name || ""}</td>
                    <td>${row.machine_id || ""}</td>
                    <td>${row.machine_model || ""}</td>
                    <td>${row.serial_no || ""}</td>
                    <td>${Number(row.start_count || 0)}</td>
                    <td>${Number(row.last_input_count || 0)}</td>
                    <td>${Number(row.updated_copy_count || 0)}</td>
                    <td>${Number(row.total_transactions || 0)}</td>
                    <td>${Number(row.total_price || 0).toFixed(2)}</td>
                    <td>${row.latest_entry_at ? new Date(row.latest_entry_at).toLocaleDateString() : ""}</td>
                `;
                tbody.appendChild(tr);
            });
        }
        applyTableScrollLimit("rentalCountTable");
    }catch(err){
        alert(err.message || "Failed to load rental count report");
    }
}

async function loadRentalMachineFilterOptions(){
    try{
        const select = document.getElementById("rentalMachineFilter");
        if(!select) return;
        const previous = String(select.value || "");
        const machines = await request("/rental-machines","GET");
        const rows = Array.isArray(machines) ? machines : [];
        const sorted = rows.slice().sort((a, b) => String(a.machine_id || "").localeCompare(String(b.machine_id || "")));

        select.innerHTML = "";
        const allOpt = document.createElement("option");
        allOpt.value = "";
        allOpt.textContent = "All Rental Machines";
        select.appendChild(allOpt);

        sorted.forEach((m) => {
            const opt = document.createElement("option");
            opt.value = String(m.id);
            const machineId = String(m.machine_id || "");
            const model = String(m.model || "");
            const serial = String(m.serial_no || "");
            opt.textContent = [machineId, model, serial].filter(Boolean).join(" - ");
            select.appendChild(opt);
        });

        if(previous && sorted.some((m) => String(m.id) === previous)){
            select.value = previous;
        }
    }catch(_err){
    }
}

async function loadRentalCountCustomerFilterOptions(){
    try{
        const select = document.getElementById("rentalCountCustomerFilter");
        if(!select) return;
        const previous = String(select.value || "");
        const customers = await request("/customers","GET");
        const rentalCustomers = (Array.isArray(customers) ? customers : [])
            .filter((c) => String(c.customer_mode || "").toLowerCase() === "rental")
            .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

        select.innerHTML = "";
        const allOpt = document.createElement("option");
        allOpt.value = "";
        allOpt.textContent = "All Rental Customers";
        select.appendChild(allOpt);

        rentalCustomers.forEach((c) => {
            const opt = document.createElement("option");
            opt.value = String(c.id);
            opt.textContent = String(c.name || "");
            select.appendChild(opt);
        });

        if(previous && rentalCustomers.some((c) => String(c.id) === previous)){
            select.value = previous;
        }
    }catch(_err){
    }
}

function logout(){
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.href="../login.html";
}

const REPORT_MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function populateSalesYearOptions(){
    const yearEl = document.getElementById("salesYearSelect");
    if(!yearEl) return;
    const currentYear = new Date().getFullYear();
    const startYear = currentYear - 15;
    const opts = [];
    for(let y = currentYear; y >= startYear; y--){
        opts.push(`<option value="${y}">${y}</option>`);
    }
    yearEl.innerHTML = opts.join("");
}

function populateReportExpenseYearOptions(){
    const yearEl = document.getElementById("reportExpenseYear");
    if(!yearEl) return;
    const currentYear = new Date().getFullYear();
    const startYear = currentYear - 15;
    const opts = [];
    for(let y = currentYear; y >= startYear; y--){
        opts.push(`<option value="${y}">${y}</option>`);
    }
    yearEl.innerHTML = opts.join("");
}

function populateReportExpenseMonthOptions(){
    const monthEl = document.getElementById("reportExpenseMonth");
    if(!monthEl) return;
    monthEl.innerHTML = [
        `<option value="all">All Months (Full Year)</option>`,
        ...REPORT_MONTH_NAMES.map((name, i) => `<option value="${i + 1}">${name}</option>`)
    ].join("");
}

function populateSalesMonthOptions(){
    const monthEl = document.getElementById("salesMonthSelect");
    if(!monthEl) return;
    monthEl.innerHTML = REPORT_MONTH_NAMES
        .map((name, i) => `<option value="${String(i + 1).padStart(2,"0")}">${name}</option>`)
        .join("");
}

function populateTechYearOptions(){
    const yearEl = document.getElementById("techYear");
    if(!yearEl) return;
    const currentYear = new Date().getFullYear();
    const startYear = currentYear - 15;
    const opts = [];
    for(let y = currentYear; y >= startYear; y--){
        opts.push(`<option value="${y}">${y}</option>`);
    }
    yearEl.innerHTML = opts.join("");
}

function populateTechMonthOptions(){
    const monthEl = document.getElementById("techMonth");
    if(!monthEl) return;
    monthEl.innerHTML = [
        `<option value="all">All Months (Full Year)</option>`,
        ...REPORT_MONTH_NAMES.map((name, i) => `<option value="${i + 1}">${name}</option>`)
    ].join("");
}

function populateRentalConsumablesYearOptions(){
    const yearEl = document.getElementById("rentalConsumablesYearFilter");
    if(!yearEl) return;
    const currentYear = new Date().getFullYear();
    const startYear = currentYear - 15;
    const opts = [];
    for(let y = currentYear; y >= startYear; y--){
        opts.push(`<option value="${y}">${y}</option>`);
    }
    yearEl.innerHTML = opts.join("");
}

function populateRentalConsumablesMonthOptions(){
    const monthEl = document.getElementById("rentalConsumablesMonthFilter");
    if(!monthEl) return;
    monthEl.innerHTML = [
        `<option value="all">All Months (Full Year)</option>`,
        ...REPORT_MONTH_NAMES.map((name, i) => `<option value="${i + 1}">${name}</option>`)
    ].join("");
}

function populateRentalCountYearOptions(){
    const yearEl = document.getElementById("rentalCountYearFilter");
    if(!yearEl) return;
    const currentYear = new Date().getFullYear();
    const startYear = currentYear - 15;
    const opts = [];
    for(let y = currentYear; y >= startYear; y--){
        opts.push(`<option value="${y}">${y}</option>`);
    }
    yearEl.innerHTML = opts.join("");
}

function populateRentalCountMonthOptions(){
    const monthEl = document.getElementById("rentalCountMonthFilter");
    if(!monthEl) return;
    monthEl.innerHTML = [
        `<option value="all">All Months (Full Year)</option>`,
        ...REPORT_MONTH_NAMES.map((name, i) => `<option value="${i + 1}">${name}</option>`)
    ].join("");
}

function toggleSalesPeriodSelectors(){
    const period = (document.getElementById("salesPeriod")?.value || "month").toLowerCase();
    const yearEl = document.getElementById("salesYearSelect");
    const monthEl = document.getElementById("salesMonthSelect");
    const dateEl = document.getElementById("salesDate");
    if(!yearEl || !monthEl || !dateEl) return;
    yearEl.style.display = (period === "year" || period === "month") ? "" : "none";
    monthEl.style.display = period === "month" ? "" : "none";
    dateEl.style.display = (period === "week" || period === "all") ? "" : "none";
}

function syncSalesDateFromSelectors(){
    const period = (document.getElementById("salesPeriod")?.value || "month").toLowerCase();
    const dateEl = document.getElementById("salesDate");
    const year = document.getElementById("salesYearSelect")?.value || String(new Date().getFullYear());
    const month = document.getElementById("salesMonthSelect")?.value || String(new Date().getMonth() + 1).padStart(2,"0");
    if(!dateEl) return;

    if(period === "year"){
        dateEl.value = `${year}-01-01`;
    }else if(period === "month"){
        dateEl.value = `${year}-${month}-01`;
    }else if(!dateEl.value){
        dateEl.value = new Date().toISOString().slice(0,10);
    }
}

document.getElementById("salesDate").value = new Date().toISOString().slice(0,10);
populateReportExpenseYearOptions();
populateReportExpenseMonthOptions();
populateSalesYearOptions();
populateSalesMonthOptions();
populateTechYearOptions();
populateTechMonthOptions();
populateRentalConsumablesYearOptions();
populateRentalConsumablesMonthOptions();
populateRentalCountYearOptions();
populateRentalCountMonthOptions();
document.getElementById("salesYearSelect").value = String(new Date().getFullYear());
document.getElementById("salesMonthSelect").value = String(new Date().getMonth() + 1).padStart(2,"0");
document.getElementById("reportExpenseYear").value = String(new Date().getFullYear());
document.getElementById("reportExpenseMonth").value = "all";
document.getElementById("techYear").value = String(new Date().getFullYear());
document.getElementById("techMonth").value = "all";
document.getElementById("rentalConsumablesYearFilter").value = String(new Date().getFullYear());
document.getElementById("rentalConsumablesMonthFilter").value = "all";
document.getElementById("rentalCountYearFilter").value = String(new Date().getFullYear());
document.getElementById("rentalCountMonthFilter").value = "all";
toggleSalesPeriodSelectors();
syncSalesDateFromSelectors();

document.getElementById("salesPeriod").addEventListener("change", () => {
    toggleSalesPeriodSelectors();
    syncSalesDateFromSelectors();
});
document.getElementById("salesYearSelect").addEventListener("change", syncSalesDateFromSelectors);
document.getElementById("salesMonthSelect").addEventListener("change", syncSalesDateFromSelectors);
document.getElementById("reportExpenseYear").addEventListener("change", loadReportExpenses);
document.getElementById("reportExpenseMonth").addEventListener("change", loadReportExpenses);
document.getElementById("techYear").addEventListener("change", loadTechnicianReport);
document.getElementById("techMonth").addEventListener("change", loadTechnicianReport);
document.getElementById("techTechnician").addEventListener("change", loadTechnicianReport);
document.getElementById("stockVendorReport").addEventListener("change", loadStockReports);
document.getElementById("minStockLevel").addEventListener("change", loadStockReports);
document.getElementById("rentalCustomerFilter").addEventListener("change", loadRentalConsumablesReport);
document.getElementById("rentalConsumablesYearFilter").addEventListener("change", loadRentalConsumablesReport);
document.getElementById("rentalConsumablesMonthFilter").addEventListener("change", loadRentalConsumablesReport);
document.getElementById("rentalCountCustomerFilter").addEventListener("change", loadRentalCountReport);
document.getElementById("rentalCountYearFilter").addEventListener("change", loadRentalCountReport);
document.getElementById("rentalCountMonthFilter").addEventListener("change", loadRentalCountReport);
document.getElementById("rentalMachineFilter").addEventListener("change", loadRentalCountReport);

loadSales();
const reportExpenseBlockEl = document.getElementById("reportExpenseBlock");
if(reportExpenseBlockEl){
    reportExpenseBlockEl.style.display = "";
}
loadReportExpenses();
loadRentalCustomerFilterOptions();
loadRentalCountCustomerFilterOptions();
loadRentalMachineFilterOptions();
loadRentalConsumablesReport();
loadRentalCountReport();
if(isAdminManager){
    loadStockFilterOptions();
    loadTechnicianReport();
}
