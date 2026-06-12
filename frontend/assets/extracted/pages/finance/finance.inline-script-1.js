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

const PERIOD_KEYS = ["week", "month", "year"];
const PERIOD_LABELS = { week: "Week", month: "Month", year: "Year" };
const financeSnapshotDateEl = document.getElementById("financeSnapshotDate");
const expenseYearFilterEl = document.getElementById("expenseYearFilter");
const expenseMonthFilterEl = document.getElementById("expenseMonthFilter");
const refreshFinanceBtnEl = document.getElementById("refreshFinanceBtn");
const exportFinanceExcelBtnEl = document.getElementById("exportFinanceExcelBtn");
const exportFinancePdfBtnEl = document.getElementById("exportFinancePdfBtn");
const paymentsBtnEl = document.getElementById("paymentsBtn");
const pendingsBtnEl = document.getElementById("pendingsBtn");
const financeHighlightsEl = document.getElementById("financeHighlights");
const periodChartMetaEl = document.getElementById("periodChartMeta");
const expenseChartMetaEl = document.getElementById("expenseChartMeta");
const expenseChartEmptyEl = document.getElementById("expenseChartEmpty");
const selectedSnapshotLabelEl = document.getElementById("selectedSnapshotLabel");
const selectedExpenseFocusLabelEl = document.getElementById("selectedExpenseFocusLabel");
const lastRefreshLabelEl = document.getElementById("lastRefreshLabel");

if(paymentsBtnEl && !canAccessPayments){
    paymentsBtnEl.style.display = "none";
}
if(pendingsBtnEl && !canAccessPendings){
    pendingsBtnEl.style.display = "none";
}

let lastFinanceData = null;
let financePeriodChart = null;
let financeExpenseChart = null;

function asNumber(v){
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

function fmt(v){
    return asNumber(v).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function fmtPercent(v){
    return `${asNumber(v).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}%`;
}

function escapeHtml(value){
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function todayIso(){
    const dt = new Date();
    const year = dt.getFullYear();
    const month = String(dt.getMonth() + 1).padStart(2, "0");
    const day = String(dt.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function monthNameFromNumber(value){
    const monthIndex = Number(value) - 1;
    if(!Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11){
        return "Month";
    }
    return new Date(2000, monthIndex, 1).toLocaleString(undefined, { month: "long" });
}

function formatDateLabel(value){
    const raw = String(value || "").trim();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(raw)){
        return raw || "--";
    }
    const dt = new Date(`${raw}T00:00:00`);
    if(Number.isNaN(dt.getTime())) return raw;
    return dt.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit"
    });
}

function formatMonthKey(value){
    const raw = String(value || "").trim();
    if(!/^\d{4}-\d{2}$/.test(raw)){
        return raw || "--";
    }
    const dt = new Date(`${raw}-01T00:00:00`);
    if(Number.isNaN(dt.getTime())) return raw;
    return dt.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short"
    });
}

function populateYearOptions(){
    const currentYear = new Date().getFullYear();
    const options = ['<option value="">Snapshot Year</option>'];
    for(let year = currentYear + 1; year >= currentYear - 7; year -= 1){
        options.push(`<option value="${year}">${year}</option>`);
    }
    if(expenseYearFilterEl){
        expenseYearFilterEl.innerHTML = options.join("");
    }
}

function populateMonthOptions(){
    const options = ['<option value="">Snapshot Month</option>', '<option value="all">All Months</option>'];
    for(let month = 1; month <= 12; month += 1){
        const value = String(month).padStart(2, "0");
        options.push(`<option value="${value}">${monthNameFromNumber(month)}</option>`);
    }
    if(expenseMonthFilterEl){
        expenseMonthFilterEl.innerHTML = options.join("");
    }
}

function initializeFilters(){
    populateYearOptions();
    populateMonthOptions();
    const today = todayIso();
    if(financeSnapshotDateEl){
        financeSnapshotDateEl.value = today;
    }
}

function getFilterState(){
    const snapshotDate = String(financeSnapshotDateEl?.value || todayIso()).trim() || todayIso();
    let expenseYear = String(expenseYearFilterEl?.value || "").trim();
    const expenseMonth = String(expenseMonthFilterEl?.value || "").trim().toLowerCase();

    if(!expenseYear && expenseMonth){
        expenseYear = snapshotDate.slice(0, 4);
        if(expenseYearFilterEl){
            expenseYearFilterEl.value = expenseYear;
        }
    }

    return {
        snapshotDate,
        expenseYear,
        expenseMonth
    };
}

function buildOverviewQuery(){
    const { snapshotDate, expenseYear, expenseMonth } = getFilterState();
    const params = new URLSearchParams();
    if(snapshotDate){
        params.set("date", snapshotDate);
    }
    if(expenseYear){
        params.set("expenseYear", expenseYear);
    }
    if(expenseMonth){
        params.set("expenseMonth", expenseMonth);
    }
    const query = params.toString();
    return query ? `?${query}` : "";
}

function getExpenseFocusLabel(){
    const { snapshotDate, expenseYear, expenseMonth } = getFilterState();
    if(expenseYear && expenseMonth === "all"){
        return `${expenseYear} / All Months`;
    }
    if(expenseYear && /^\d{2}$/.test(expenseMonth)){
        return `${monthNameFromNumber(expenseMonth)} ${expenseYear}`;
    }
    return `Snapshot Month (${formatMonthKey(snapshotDate.slice(0, 7))})`;
}

function getSelectedExpenseMonthKey(){
    const { snapshotDate, expenseYear, expenseMonth } = getFilterState();
    if(expenseYear && /^\d{2}$/.test(expenseMonth)){
        return `${expenseYear}-${expenseMonth}`;
    }
    return snapshotDate.slice(0, 7);
}

function getSummaryRow(data, key){
    return data?.summary_by_period?.[key] || {
        period: PERIOD_LABELS[key] || key,
        total_sales: 0,
        total_expenses: 0,
        net_profit: 0
    };
}

function findPeriodAmount(rows, key){
    const target = String(PERIOD_LABELS[key] || key).trim().toLowerCase();
    return asNumber((Array.isArray(rows) ? rows : []).find((row) => {
        const period = String(row?.period || "").trim().toLowerCase();
        return period === target || period === key;
    })?.total_amount || 0);
}

function groupExpenseCategories(rows){
    const totals = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
        const name = String(row?.category || "").trim() || "Uncategorized";
        totals.set(name, asNumber(totals.get(name)) + asNumber(row?.amount));
    });
    return Array.from(totals.entries())
        .map(([category, total]) => ({ category, total: Number(total.toFixed(2)) }))
        .sort((a, b) => b.total - a.total);
}

function setCardValue(cardId, value, isNegative){
    const valueEl = document.getElementById(cardId);
    if(valueEl){
        valueEl.innerText = value;
        const parent = valueEl.closest(".kpi-card");
        if(parent){
            parent.classList.toggle("is-negative", !!isNegative);
        }
    }
}

function setText(id, value){
    const el = document.getElementById(id);
    if(el){
        el.innerText = String(value ?? "");
    }
}

function putRows(tbodyId, rows, emptyCols, emptyMessage = "No data found."){
    const tbody = document.getElementById(tbodyId);
    if(!tbody) return;
    tbody.innerHTML = "";
    if(!rows || !rows.length){
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="${emptyCols}">${escapeHtml(emptyMessage)}</td>`;
        tbody.appendChild(tr);
        return;
    }
    rows.forEach((rowHtml) => {
        const tr = document.createElement("tr");
        tr.innerHTML = rowHtml;
        tbody.appendChild(tr);
    });
}

function renderHeaderMeta(){
    const snapshotDate = String(financeSnapshotDateEl?.value || todayIso()).trim();
    if(selectedSnapshotLabelEl){
        selectedSnapshotLabelEl.innerText = formatDateLabel(snapshotDate);
    }
    if(selectedExpenseFocusLabelEl){
        selectedExpenseFocusLabelEl.innerText = getExpenseFocusLabel();
    }
    if(lastRefreshLabelEl){
        lastRefreshLabelEl.innerText = new Date().toLocaleString();
    }
    if(periodChartMetaEl){
        periodChartMetaEl.innerText = "";
    }
    if(expenseChartMetaEl){
        expenseChartMetaEl.innerText = "";
    }
}

function renderKpis(data){
    const weekSummary = getSummaryRow(data, "week");
    const monthSummary = getSummaryRow(data, "month");
    const yearSummary = getSummaryRow(data, "year");
    const vendorMonthCost = findPeriodAmount(data?.vendor_dealer_price_by_period, "month");
    const profitMargin = monthSummary.total_sales > 0
        ? ((monthSummary.net_profit / monthSummary.total_sales) * 100)
        : 0;
    const topVendor = (data?.vendor_dealer_details_by_period?.month || [])[0] || null;
    const expenseRows = Array.isArray(data?.month_expense_rows) ? data.month_expense_rows : [];

    setCardValue("totalSales", fmt(monthSummary.total_sales), monthSummary.total_sales < 0);
    setCardValue("totalExpense", fmt(monthSummary.total_expenses), false);
    setCardValue("netProfit", fmt(monthSummary.net_profit), monthSummary.net_profit < 0);
    setCardValue("yearNetProfit", fmt(yearSummary.net_profit), yearSummary.net_profit < 0);
    setCardValue("profitMargin", fmtPercent(profitMargin), profitMargin < 0);
    setCardValue("vendorCost", fmt(vendorMonthCost), false);

    setText("salesMeta", `Week ${fmt(weekSummary.total_sales)} • Year ${fmt(yearSummary.total_sales)}`);
    setText("expenseMeta", `${expenseRows.length} expense entr${expenseRows.length === 1 ? "y" : "ies"} in focus`);
    setText("profitMeta", monthSummary.net_profit >= 0 ? "Positive monthly profit" : "Monthly profit needs attention");
    setText("yearProfitMeta", `Year sales ${fmt(yearSummary.total_sales)} • Expenses ${fmt(yearSummary.total_expenses)}`);
    setText("profitMarginMeta", monthSummary.total_sales > 0 ? "Net profit against monthly sales" : "No sales recorded in snapshot");
    setText("vendorCostMeta", topVendor ? `Top vendor: ${topVendor.vendor || "N/A"}` : "No vendor cost detail found");
}

function renderHighlights(data){
    if(!financeHighlightsEl) return;
    const weekSummary = getSummaryRow(data, "week");
    const monthSummary = getSummaryRow(data, "month");
    const yearSummary = getSummaryRow(data, "year");
    const summaryRows = [weekSummary, monthSummary, yearSummary];
    const bestProfit = summaryRows.slice().sort((a, b) => asNumber(b.net_profit) - asNumber(a.net_profit))[0] || monthSummary;
    const highestSales = summaryRows.slice().sort((a, b) => asNumber(b.total_sales) - asNumber(a.total_sales))[0] || monthSummary;
    const topVendor = (data?.vendor_dealer_details_by_period?.month || [])[0] || null;
    const topCustomer = (data?.rental_consumables?.customer_wise || [])[0] || null;
    const expenseCategories = groupExpenseCategories(data?.month_expense_rows || []);
    const topExpenseCategory = expenseCategories[0] || null;
    const latestExpense = (data?.month_expense_rows || [])[0] || null;

    const items = [
        {
            label: "Best Profit Period",
            value: `${bestProfit.period || "Period"} • ${fmt(bestProfit.net_profit)}`,
            note: "Highest net profit across the current period comparison."
        },
        {
            label: "Highest Sales",
            value: `${highestSales.period || "Period"} • ${fmt(highestSales.total_sales)}`,
            note: "Strongest sales performance in the current view."
        },
        {
            label: "Top Expense Category",
            value: topExpenseCategory ? `${topExpenseCategory.category} • ${fmt(topExpenseCategory.total)}` : "No category records",
            note: "Top cost category by amount."
        },
        {
            label: "Top Vendor",
            value: topVendor ? `${topVendor.vendor || "Unknown"} • ${fmt(topVendor.total_dealer_amount)}` : "No vendor detail found",
            note: "Highest vendor procurement cost in the monthly view."
        },
        {
            label: "Top Rental Customer",
            value: topCustomer ? `${topCustomer.customer_name || "Unknown"} • ${fmt(topCustomer.total_amount)}` : "No rental customer data",
            note: "Customer generating the highest rental consumable amount."
        },
        {
            label: "Latest Expense",
            value: latestExpense ? `${formatDateLabel(latestExpense.date)} • ${fmt(latestExpense.amount)}` : "No recent expense entry",
            note: latestExpense ? `${latestExpense.title || "Expense"}${latestExpense.customer ? ` / ${latestExpense.customer}` : ""}` : "Selected expense focus has no entries."
        }
    ];

    financeHighlightsEl.innerHTML = items.map((item) => `
        <li>
            <span>${escapeHtml(item.label)}</span>
            <strong>${escapeHtml(item.value)}</strong>
            <small>${escapeHtml(item.note)}</small>
        </li>
    `).join("");
}

function renderSummaryTable(data){
    const summaryRows = PERIOD_KEYS.map((key) => {
        const row = getSummaryRow(data, key);
        return `
            <td>${escapeHtml(row.period || PERIOD_LABELS[key])}</td>
            <td>${fmt(row.total_sales)}</td>
            <td>${fmt(row.total_expenses)}</td>
            <td>${fmt(row.net_profit)}</td>
        `;
    });
    putRows("summaryBody", summaryRows, 4);
}

function renderExpenseTable(data){
    const rows = (data?.month_expense_rows || []).map((row) => `
        <td>${escapeHtml(formatDateLabel(row.date))}</td>
        <td>${escapeHtml(row.category || "Uncategorized")}</td>
        <td>${escapeHtml(row.title || "-")}</td>
        <td>${escapeHtml(row.customer || "-")}</td>
        <td>${fmt(row.amount)}</td>
    `);
    putRows("expenseBody", rows, 5, "No expense entries for the selected focus.");
}

function renderSoldPriceTable(data){
    const rows = (data?.sold_product_selling_price_by_period || []).map((row) => `
        <td>${escapeHtml(row.period || "")}</td>
        <td>${fmt(row.total_amount)}</td>
    `);
    putRows("soldPriceBody", rows, 2);
}

function renderVendorTables(data){
    const vendorTotalRows = (data?.vendor_dealer_price_by_period || []).map((row) => `
        <td>${escapeHtml(row.period || "")}</td>
        <td>${fmt(row.total_amount)}</td>
    `);
    putRows("vendorTotalBody", vendorTotalRows, 2);

    const vendorDetailRows = (data?.vendor_dealer_details_by_period?.month || []).map((row) => `
        <td>${escapeHtml(row.vendor || "-")}</td>
        <td>${escapeHtml(Number(row.qty || 0))}</td>
        <td>${fmt(row.total_dealer_amount)}</td>
    `);
    putRows("vendorDetailBody", vendorDetailRows, 3, "No monthly vendor detail found.");
}

function renderRentalTables(data){
    const monthRows = (data?.rental_consumables?.month_wise || []).slice(-12).reverse().map((row) => `
        <td>${escapeHtml(formatMonthKey(row.month_name))}</td>
        <td>${fmt(row.total_amount)}</td>
    `);
    putRows("rcMonthBody", monthRows, 2);

    const yearRows = (data?.rental_consumables?.year_wise || []).map((row) => `
        <td>${escapeHtml(row.year_name || "")}</td>
        <td>${fmt(row.total_amount)}</td>
    `);
    putRows("rcYearBody", yearRows, 2);

    const customerRows = (data?.rental_consumables?.customer_wise || []).slice(0, 10).map((row) => `
        <td>${escapeHtml(row.customer_name || "-")}</td>
        <td>${escapeHtml(Number(row.total_qty || 0))}</td>
        <td>${fmt(row.total_amount)}</td>
    `);
    putRows("rcCustomerBody", customerRows, 3);
}

function destroyChart(instance){
    if(instance && typeof instance.destroy === "function"){
        instance.destroy();
    }
}

function renderPeriodChart(data){
    const canvas = document.getElementById("financePeriodChart");
    if(!canvas || typeof Chart === "undefined"){
        if(periodChartMetaEl){
            periodChartMetaEl.innerText = "";
        }
        return;
    }
    const rows = PERIOD_KEYS.map((key) => getSummaryRow(data, key));
    destroyChart(financePeriodChart);
    financePeriodChart = new Chart(canvas.getContext("2d"), {
        type: "bar",
        data: {
            labels: rows.map((row) => row.period || ""),
            datasets: [
                {
                    label: "Sales",
                    data: rows.map((row) => asNumber(row.total_sales)),
                    backgroundColor: "rgba(15, 106, 191, 0.75)",
                    borderRadius: 10
                },
                {
                    label: "Expenses",
                    data: rows.map((row) => asNumber(row.total_expenses)),
                    backgroundColor: "rgba(223, 91, 87, 0.75)",
                    borderRadius: 10
                },
                {
                    type: "line",
                    label: "Net Profit",
                    data: rows.map((row) => asNumber(row.net_profit)),
                    borderColor: "#2fa968",
                    backgroundColor: "rgba(47, 169, 104, 0.16)",
                    tension: 0.35,
                    pointRadius: 4,
                    pointHoverRadius: 5,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: "index",
                intersect: false
            },
            plugins: {
                legend: {
                    position: "bottom"
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.dataset.label}: ${fmt(ctx.raw)}`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: (value) => fmt(value)
                    }
                }
            }
        }
    });

}

function renderExpenseChart(data){
    const canvas = document.getElementById("financeExpenseChart");
    if(!canvas || typeof Chart === "undefined"){
        if(expenseChartMetaEl){
            expenseChartMetaEl.innerText = "";
        }
        return;
    }

    const categories = groupExpenseCategories(data?.month_expense_rows || []).slice(0, 6);
    destroyChart(financeExpenseChart);

    if(!categories.length){
        if(expenseChartEmptyEl){
            expenseChartEmptyEl.classList.remove("is-hidden");
        }
        canvas.classList.add("is-hidden");
        return;
    }

    if(expenseChartEmptyEl){
        expenseChartEmptyEl.classList.add("is-hidden");
    }
    canvas.classList.remove("is-hidden");

    financeExpenseChart = new Chart(canvas.getContext("2d"), {
        type: "doughnut",
        data: {
            labels: categories.map((row) => row.category),
            datasets: [
                {
                    data: categories.map((row) => row.total),
                    backgroundColor: [
                        "#0f6abf",
                        "#2fa968",
                        "#f59e0b",
                        "#8457e3",
                        "#df5b57",
                        "#3d7c75"
                    ],
                    borderWidth: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "64%",
            plugins: {
                legend: {
                    position: "bottom"
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.label}: ${fmt(ctx.raw)}`
                    }
                }
            }
        }
    });

}

function renderFinanceOverview(data){
    renderHeaderMeta();
    renderKpis(data);
    renderHighlights(data);
    renderSummaryTable(data);
    renderExpenseTable(data);
    renderSoldPriceTable(data);
    renderVendorTables(data);
    renderRentalTables(data);
    renderPeriodChart(data);
    renderExpenseChart(data);
}

async function loadFinanceOverview(){
    try{
        renderHeaderMeta();
        const data = await request(`/reports/finance-overview${buildOverviewQuery()}`, "GET");
        lastFinanceData = data;
        renderFinanceOverview(data);
    }catch(err){
        destroyChart(financePeriodChart);
        destroyChart(financeExpenseChart);
        putRows("summaryBody", [`<td colspan="4">${escapeHtml(err.message || "Failed to load finance overview.")}</td>`], 4);
        putRows("expenseBody", [`<td colspan="5">${escapeHtml(err.message || "Failed to load finance overview.")}</td>`], 5);
        putRows("soldPriceBody", [], 2);
        putRows("vendorTotalBody", [], 2);
        putRows("vendorDetailBody", [], 3);
        putRows("rcMonthBody", [], 2);
        putRows("rcYearBody", [], 2);
        putRows("rcCustomerBody", [], 3);
        if(financeHighlightsEl){
            financeHighlightsEl.innerHTML = `
                <li>
                    <span>Finance Overview</span>
                    <strong>${escapeHtml(err.message || "Failed to load finance overview.")}</strong>
                    <small>Please refresh the page and verify the backend response.</small>
                </li>
            `;
        }
        if(periodChartMetaEl){
            periodChartMetaEl.innerText = "";
        }
        if(expenseChartMetaEl){
            expenseChartMetaEl.innerText = "";
        }
        if(expenseChartEmptyEl){
            expenseChartEmptyEl.classList.remove("is-hidden");
        }
        document.getElementById("financeExpenseChart")?.classList.add("is-hidden");
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
    const table = document.getElementById(tableId);
    if(!table) return -1;
    const rows = Array.from(table.querySelectorAll("tr"));
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
    rows.forEach((row, index) => {
        const cells = Array.from(row.children).map((td) => td.innerText.trim());
        const line = cells.join(" | ");
        const wrapped = doc.splitTextToSize(line, maxWidth);
        const nextY = y + (wrapped.length * 5);
        if(nextY > pageHeight - 10){
            doc.addPage();
            y = 15;
        }
        if(index === 0){
            doc.setFont(undefined, "bold");
        }else{
            doc.setFont(undefined, "normal");
        }
        doc.text(wrapped, 14, y);
        y += (wrapped.length * 5) + 3;
    });

    doc.setFont(undefined, "normal");
    return y;
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

function exportFinanceExcel(){
    if(!lastFinanceData){
        alert("Load finance data first.");
        return;
    }
    exportMultiTableXlsx(
        [
            { title: "Finance Summary by Period", tableId: "summaryTable" },
            { title: "Recent Expense Entries", tableId: "expenseTable" },
            { title: "Sold Product Revenue", tableId: "soldPriceTable" },
            { title: "Vendor Cost by Period", tableId: "vendorTotalTable" },
            { title: "Top Vendors (Month)", tableId: "vendorDetailTable" },
            { title: "Rental Consumables - Month Wise", tableId: "rcMonthTable" },
            { title: "Rental Consumables - Annual Wise", tableId: "rcYearTable" },
            { title: "Rental Consumables - Top Customers", tableId: "rcCustomerTable" }
        ],
        "Finance_Overview.csv"
    );
}

function exportFinancePDF(){
    if(!lastFinanceData){
        alert("Load finance data first.");
        return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ format: "a4" });
    doc.setFontSize(14);
    doc.text("Finance Overview", 14, 18);
    doc.setFontSize(10);
    doc.text(`Snapshot Date: ${selectedSnapshotLabelEl?.innerText || "--"}`, 14, 26);
    doc.text(`Expense Focus: ${selectedExpenseFocusLabelEl?.innerText || "--"}`, 14, 32);

    let y = 40;
    const sections = [
        { title: "Finance Summary by Period", tableId: "summaryTable" },
        { title: "Recent Expense Entries", tableId: "expenseTable" },
        { title: "Sold Product Revenue", tableId: "soldPriceTable" },
        { title: "Vendor Cost by Period", tableId: "vendorTotalTable" },
        { title: "Top Vendors (Month)", tableId: "vendorDetailTable" },
        { title: "Rental Consumables - Month Wise", tableId: "rcMonthTable" },
        { title: "Rental Consumables - Annual Wise", tableId: "rcYearTable" },
        { title: "Rental Consumables - Top Customers", tableId: "rcCustomerTable" }
    ];

    sections.forEach((section) => {
        const nextY = writeTableToDoc(doc, section.title, section.tableId, y);
        if(nextY !== -1){
            y = nextY + 6;
        }
    });

    doc.save("Finance_Overview.pdf");
}

function exportSummaryPDF(){
    exportTablePDF("summaryTable", "Finance Summary by Period", "Finance_Summary_By_Period.pdf");
}

function exportSummaryXlsx(){
    exportTableXlsx("summaryTable", "Finance_Summary_By_Period.xlsx");
}

function exportSoldPricePDF(){
    exportTablePDF("soldPriceTable", "Sold Product Revenue", "Finance_Sold_Product_Revenue.pdf");
}

function exportSoldPriceXlsx(){
    exportTableXlsx("soldPriceTable", "Finance_Sold_Product_Revenue.xlsx");
}

function exportVendorPDF(){
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ format: "a4" });
    doc.setFontSize(12);
    doc.text("Vendor Procurement", 14, 20);
    let y = 28;

    y = writeTableToDoc(doc, "Vendor Cost by Period", "vendorTotalTable", y);
    if(y === -1){
        alert("No data to export. Please click Refresh first.");
        return;
    }
    y += 6;
    writeTableToDoc(doc, "Top Vendors (Month)", "vendorDetailTable", y);
    doc.save("Finance_Vendor_Procurement.pdf");
}

function exportVendorXlsx(){
    exportMultiTableXlsx(
        [
            { title: "Vendor Cost by Period", tableId: "vendorTotalTable" },
            { title: "Top Vendors (Month)", tableId: "vendorDetailTable" }
        ],
        "Finance_Vendor_Procurement.xlsx"
    );
}

function exportRentalConsumablesPDF(){
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ format: "a4" });
    doc.setFontSize(12);
    doc.text("Rental Consumables Performance", 14, 20);
    let y = 28;

    y = writeTableToDoc(doc, "Month Wise", "rcMonthTable", y);
    if(y === -1){
        alert("No data to export. Please click Refresh first.");
        return;
    }
    y += 6;
    y = writeTableToDoc(doc, "Annual Wise", "rcYearTable", y);
    y += 6;
    writeTableToDoc(doc, "Top Customers", "rcCustomerTable", y);
    doc.save("Finance_Rental_Consumables.pdf");
}

function exportRentalConsumablesXlsx(){
    exportMultiTableXlsx(
        [
            { title: "Month Wise", tableId: "rcMonthTable" },
            { title: "Annual Wise", tableId: "rcYearTable" },
            { title: "Top Customers", tableId: "rcCustomerTable" }
        ],
        "Finance_Rental_Consumables.xlsx"
    );
}

function bindActions(){
    refreshFinanceBtnEl?.addEventListener("click", loadFinanceOverview);
    exportFinanceExcelBtnEl?.addEventListener("click", exportFinanceExcel);
    exportFinancePdfBtnEl?.addEventListener("click", exportFinancePDF);

    financeSnapshotDateEl?.addEventListener("change", loadFinanceOverview);
    expenseYearFilterEl?.addEventListener("change", loadFinanceOverview);
    expenseMonthFilterEl?.addEventListener("change", loadFinanceOverview);

    document.getElementById("summaryPdfBtn")?.addEventListener("click", exportSummaryPDF);
    document.getElementById("summaryXlsxBtn")?.addEventListener("click", exportSummaryXlsx);
    document.getElementById("soldPdfBtn")?.addEventListener("click", exportSoldPricePDF);
    document.getElementById("soldXlsxBtn")?.addEventListener("click", exportSoldPriceXlsx);
    document.getElementById("vendorPdfBtn")?.addEventListener("click", exportVendorPDF);
    document.getElementById("vendorXlsxBtn")?.addEventListener("click", exportVendorXlsx);
    document.getElementById("rentalPdfBtn")?.addEventListener("click", exportRentalConsumablesPDF);
    document.getElementById("rentalXlsxBtn")?.addEventListener("click", exportRentalConsumablesXlsx);
}

function logout(){
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.href = "../login.html";
}

window.loadFinanceOverview = loadFinanceOverview;
window.exportFinanceExcel = exportFinanceExcel;
window.exportFinancePDF = exportFinancePDF;

initializeFilters();
bindActions();
renderHeaderMeta();
loadFinanceOverview();
