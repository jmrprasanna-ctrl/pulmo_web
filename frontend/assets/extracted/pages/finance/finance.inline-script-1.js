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
    : (role === "user" && allowedPaths.has("/finance/finance.html"));
if(!canAccessFinance){
    alert("You don't have access to Finance.");
    window.location.href = "../dashboard.html";
}
const canAccessPayments = (role === "admin" || role === "manager")
    ? true
    : (role === "user" && allowedPaths.has("/finance/payments.html"));
const canAccessPendings = (role === "admin" || role === "manager")
    ? true
    : (role === "user" && (allowedPaths.has("/finance/pendings.html") || allowedPaths.has("/finance/finance.html")));
const paymentsBtnEl = document.getElementById("paymentsBtn");
if(paymentsBtnEl && !canAccessPayments){
    paymentsBtnEl.style.display = "none";
}
const pendingsBtnEl = document.getElementById("pendingsBtn");
if(pendingsBtnEl && !canAccessPendings){
    pendingsBtnEl.style.display = "none";
}

function asNumber(v){
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

function fmt(v){
    return asNumber(v).toFixed(2);
}

let lastFinanceData = null;

function putRows(tbodyId, rows, emptyCols){
    const tbody = document.getElementById(tbodyId);
    tbody.innerHTML = "";
    if(!rows || !rows.length){
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="${emptyCols}">No data found.</td>`;
        tbody.appendChild(tr);
        return;
    }
    rows.forEach((trHtml) => {
        const tr = document.createElement("tr");
        tr.innerHTML = trHtml;
        tbody.appendChild(tr);
    });
}

async function loadFinanceOverview(){
    try{
        const query = `?date=${encodeURIComponent("")}`;
        const data = await request(`/reports/finance-overview${query}`, "GET");
        lastFinanceData = data;

        const monthSummary = data.summary_by_period?.month || { total_sales:0, total_expenses:0, net_profit:0 };
        document.getElementById("totalSales").innerText = fmt(monthSummary.total_sales);
        document.getElementById("totalExpense").innerText = fmt(monthSummary.total_expenses);
        document.getElementById("netProfit").innerText = fmt(monthSummary.net_profit);

        const summaryRows = ["week","month","year"].map((k) => {
            const s = data.summary_by_period?.[k] || {};
            return `
                <td>${s.period || k}</td>
                <td>${fmt(s.total_sales)}</td>
                <td>${fmt(s.total_expenses)}</td>
                <td>${fmt(s.net_profit)}</td>
            `;
        });
        putRows("summaryBody", summaryRows, 4);

        const soldRows = (data.sold_product_selling_price_by_period || []).map((r) => `
            <td>${r.period || ""}</td>
            <td>${fmt(r.total_amount)}</td>
        `);
        putRows("soldPriceBody", soldRows, 2);

        const vendorTotalRows = (data.vendor_dealer_price_by_period || []).map((r) => `
            <td>${r.period || ""}</td>
            <td>${fmt(r.total_amount)}</td>
        `);
        putRows("vendorTotalBody", vendorTotalRows, 2);

        const vendorPeriod = "month";
        const vendorDetails = data.vendor_dealer_details_by_period?.[vendorPeriod] || [];
        const vendorDetailRows = vendorDetails.map((r) => `
            <td>${r.vendor || ""}</td>
            <td>${Number(r.qty || 0)}</td>
            <td>${fmt(r.total_dealer_amount)}</td>
        `);
        putRows("vendorDetailBody", vendorDetailRows, 3);

        const rcMonthRows = (data.rental_consumables?.month_wise || []).map((r) => `
            <td>${r.month_name || ""}</td>
            <td>${fmt(r.total_amount)}</td>
        `);
        putRows("rcMonthBody", rcMonthRows, 2);

        const rcYearRows = (data.rental_consumables?.year_wise || []).map((r) => `
            <td>${r.year_name || ""}</td>
            <td>${fmt(r.total_amount)}</td>
        `);
        putRows("rcYearBody", rcYearRows, 2);

        const rcCustomerRows = (data.rental_consumables?.customer_wise || []).map((r) => `
            <td>${r.customer_name || ""}</td>
            <td>${Number(r.total_qty || 0)}</td>
            <td>${fmt(r.total_amount)}</td>
        `);
        putRows("rcCustomerBody", rcCustomerRows, 3);

    }catch(err){
        putRows("summaryBody", [`<td colspan="4">${err.message || "Failed to load finance overview"}</td>`], 4);
    }
}

function csvEscape(value){
    const text = String(value ?? "");
    if(text.includes(",") || text.includes("\"") || text.includes("\n")){
        return `"${text.replace(/"/g, "\"\"")}"`;
    }
    return text;
}

function downloadFile(name, content, type){
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function exportFinanceExcel(){
    if(!lastFinanceData){
        alert("Load finance data first.");
        return;
    }
    const lines = [];
    lines.push("Summary By Period");
    lines.push("Period,Total Sales,Total Expenses,Net Profit");
    ["week","month","year"].forEach((k) => {
        const s = lastFinanceData.summary_by_period?.[k] || {};
        lines.push([s.period || k, fmt(s.total_sales), fmt(s.total_expenses), fmt(s.net_profit)].map(csvEscape).join(","));
    });

    lines.push("");
    lines.push("Sold Product Price");
    lines.push("Period,Total Amount");
    (lastFinanceData.sold_product_selling_price_by_period || []).forEach((r) => {
        lines.push([r.period, fmt(r.total_amount)].map(csvEscape).join(","));
    });

    lines.push("");
    lines.push("Vendor Dealer Price By Period");
    lines.push("Period,Total Dealer Amount");
    (lastFinanceData.vendor_dealer_price_by_period || []).forEach((r) => {
        lines.push([r.period, fmt(r.total_amount)].map(csvEscape).join(","));
    });

    lines.push("");
    lines.push("Rental Consumables - Month Wise");
    lines.push("Month,Total Amount");
    (lastFinanceData.rental_consumables?.month_wise || []).forEach((r) => {
        lines.push([r.month_name, fmt(r.total_amount)].map(csvEscape).join(","));
    });

    lines.push("");
    lines.push("Rental Consumables - Annual Wise");
    lines.push("Year,Total Amount");
    (lastFinanceData.rental_consumables?.year_wise || []).forEach((r) => {
        lines.push([r.year_name, fmt(r.total_amount)].map(csvEscape).join(","));
    });

    lines.push("");
    lines.push("Rental Consumables - Customer Wise");
    lines.push("Customer,Total Qty,Total Amount");
    (lastFinanceData.rental_consumables?.customer_wise || []).forEach((r) => {
        lines.push([r.customer_name, r.total_qty, fmt(r.total_amount)].map(csvEscape).join(","));
    });

    downloadFile("Finance_Overview.csv", lines.join("\n"), "text/csv;charset=utf-8;");
}

function exportFinancePDF(){
    if(!lastFinanceData){
        alert("Load finance data first.");
        return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ format: "a4" });
    let y = 12;
    const line = (text) => {
        if(y > 285){
            doc.addPage();
            y = 12;
        }
        doc.text(String(text), 10, y);
        y += 6;
    };

    line("Finance Overview");
    line("");
    line("Summary By Period");
    ["week","month","year"].forEach((k) => {
        const s = lastFinanceData.summary_by_period?.[k] || {};
        line(`${s.period || k}: Sales ${fmt(s.total_sales)} | Expenses ${fmt(s.total_expenses)} | Net ${fmt(s.net_profit)}`);
    });
    line("");
    line("Sold Product Price");
    (lastFinanceData.sold_product_selling_price_by_period || []).forEach((r) => {
        line(`${r.period || ""}: ${fmt(r.total_amount)}`);
    });
    line("");
    line("Vendor Dealer Price By Period");
    (lastFinanceData.vendor_dealer_price_by_period || []).forEach((r) => {
        line(`${r.period || ""}: ${fmt(r.total_amount)}`);
    });
    line("");
    line("Rental Consumables Month Wise");
    (lastFinanceData.rental_consumables?.month_wise || []).forEach((r) => {
        line(`${r.month_name || ""}: ${fmt(r.total_amount)}`);
    });
    doc.save("Finance_Overview.pdf");
}

function exportSummaryPDF(){
    exportTablePDF("summaryTable", "Total Sales / Expenses / Net Profit", "Finance_Summary_By_Period.pdf");
}
function exportSummaryXlsx(){
    exportTableXlsx("summaryTable", "Finance_Summary_By_Period.xlsx");
}

function exportSoldPricePDF(){
    exportTablePDF("soldPriceTable", "Sold Product Price", "Finance_Sold_Product_Price.pdf");
}
function exportSoldPriceXlsx(){
    exportTableXlsx("soldPriceTable", "Finance_Sold_Product_Price.xlsx");
}

function exportVendorPDF(){
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ format: "a4" });
    doc.setFontSize(12);
    doc.text("Vendor Products Dealer Price", 14, 20);
    let y = 28;

    y = writeTableToDoc(doc, "Vendor Products Dealer Price", "vendorTotalTable", y);
    if(y === -1){
        alert("No data to export. Please click Refresh first.");
        return;
    }
    y += 6;
    writeTableToDoc(doc, "Vendor Detail", "vendorDetailTable", y);
    doc.save("Finance_Vendor_Dealer_Price.pdf");
}

function exportRentalConsumablesPDF(){
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ format: "a4" });
    doc.setFontSize(12);
    doc.text("Rental Consumables", 14, 20);
    let y = 28;

    y = writeTableToDoc(doc, "Month Wise", "rcMonthTable", y);
    if(y === -1){
        alert("No data to export. Please click Refresh first.");
        return;
    }
    y += 6;
    y = writeTableToDoc(doc, "Annual Wise", "rcYearTable", y);
    y += 6;
    writeTableToDoc(doc, "Customer Wise", "rcCustomerTable", y);
    doc.save("Finance_Rental_Consumables.pdf");
}
function exportRentalConsumablesXlsx(){
    exportMultiTableXlsx(
        [
            { title: "Month Wise", tableId: "rcMonthTable" },
            { title: "Annual Wise", tableId: "rcYearTable" },
            { title: "Customer Wise", tableId: "rcCustomerTable" }
        ],
        "Finance_Rental_Consumables.xlsx"
    );
}

function exportVendorXlsx(){
    exportMultiTableXlsx(
        [
            { title: "Vendor Products Dealer Price", tableId: "vendorTotalTable" },
            { title: "Vendor Detail", tableId: "vendorDetailTable" }
        ],
        "Finance_Vendor_Dealer_Price.xlsx"
    );
}

function exportTablePDF(tableId, title, fileName){
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ format: "a4" });
    doc.setFontSize(12);
    doc.text(title, 14, 20);
    const endY = writeTableToDoc(doc, "", tableId, 28);
    if(endY === -1){
        alert("No data to export. Please click Refresh first.");
        return;
    }
    doc.save(fileName);
}

function getTableRowsAsCsvLines(tableId){
    const table = document.getElementById(tableId);
    if(!table) return [];
    const rows = Array.from(table.querySelectorAll("tr"));
    return rows.map((row) => {
        const cells = Array.from(row.children).map((cell) => csvEscape(cell.innerText.trim()));
        return cells.join(",");
    });
}

function exportTableXlsx(tableId, fileName){
    const lines = getTableRowsAsCsvLines(tableId);
    if(!lines.length){
        alert("No data to export. Please click Refresh first.");
        return;
    }
    downloadFile(
        fileName,
        lines.join("\n"),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=utf-8;"
    );
}

function exportMultiTableXlsx(sections, fileName){
    const lines = [];
    sections.forEach((section, index) => {
        const rows = getTableRowsAsCsvLines(section.tableId);
        if(!rows.length) return;
        if(index > 0 && lines.length){
            lines.push("");
        }
        lines.push(csvEscape(section.title || ""));
        lines.push(...rows);
    });
    if(!lines.length){
        alert("No data to export. Please click Refresh first.");
        return;
    }
    downloadFile(
        fileName,
        lines.join("\n"),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=utf-8;"
    );
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

function logout(){
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.href="../login.html";
}

loadFinanceOverview();
