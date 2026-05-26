const User = require("../models/User");
const Product = require("../models/Product");
const RentalMachine = require("../models/RentalMachine");
const GeneralMachine = require("../models/GeneralMachine");
const Customer = require("../models/Customer");
const Vendor = require("../models/Vendor");
const Invoice = require("../models/Invoice");
const InvoiceItem = require("../models/InvoiceItem");
const Expense = require("../models/Expense");
const RentalMachineCount = require("../models/RentalMachineCount");
const RentalMachineConsumable = require("../models/RentalMachineConsumable");
const { queueDailyDatabaseBackup } = require("./systemBackupController");
const { Op, fn, col, where: sqWhere } = require("sequelize");

const MONTH_NAMES_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const SUMMARY_CACHE_TTL_MS = Math.max(1000, Number(process.env.DASHBOARD_SUMMARY_CACHE_TTL_MS || 15000));
const DAILY_BACKUP_TRIGGER_COOLDOWN_MS = Math.max(1000, Number(process.env.DASHBOARD_DAILY_BACKUP_COOLDOWN_MS || 300000));
const dashboardSummaryCache = new Map();
const backupTriggerState = new Map();

function buildSummaryCacheKey(databaseName, period, dateText) {
    const dbName = String(databaseName || "inventory").trim().toLowerCase() || "inventory";
    const safePeriod = String(period || "day").trim().toLowerCase() || "day";
    const safeDate = String(dateText || "").trim() || "na";
    return `${dbName}|${safePeriod}|${safeDate}`;
}

function getCachedSummary(cacheKey) {
    const cached = dashboardSummaryCache.get(cacheKey);
    if (!cached) return null;
    if (Date.now() > cached.expiresAt) {
        dashboardSummaryCache.delete(cacheKey);
        return null;
    }
    return cached.payload;
}

function setCachedSummary(cacheKey, payload) {
    if (dashboardSummaryCache.size > 300) {
        const now = Date.now();
        for (const [key, value] of dashboardSummaryCache.entries()) {
            if (!value || now > value.expiresAt) {
                dashboardSummaryCache.delete(key);
            }
        }
        if (dashboardSummaryCache.size > 300) {
            const firstKey = dashboardSummaryCache.keys().next().value;
            if (firstKey !== undefined) {
                dashboardSummaryCache.delete(firstKey);
            }
        }
    }
    dashboardSummaryCache.set(cacheKey, {
        payload,
        expiresAt: Date.now() + SUMMARY_CACHE_TTL_MS,
    });
}

function maybeQueueDailyBackup(databaseName) {
    const safeDb = String(databaseName || "").trim().toLowerCase();
    if (!safeDb) return;
    if (backupTriggerState.size > 200) {
        const nowForCleanup = Date.now();
        for (const [key, value] of backupTriggerState.entries()) {
            if (!Number.isFinite(value) || nowForCleanup - Number(value) > (DAILY_BACKUP_TRIGGER_COOLDOWN_MS * 4)) {
                backupTriggerState.delete(key);
            }
        }
    }
    const now = Date.now();
    const lastTriggeredAt = Number(backupTriggerState.get(safeDb) || 0);
    if (now - lastTriggeredAt < DAILY_BACKUP_TRIGGER_COOLDOWN_MS) {
        return;
    }
    backupTriggerState.set(safeDb, now);
    queueDailyDatabaseBackup(safeDb).catch((backupErr) => {
        console.error("[dashboard] Daily database backup warning:", backupErr?.message || backupErr);
    });
}

function sumTechnicianPaid(rows){
    return (Array.isArray(rows) ? rows : []).reduce((sum, inv) => {
        const technician = String(inv.support_technician || "").trim();
        const total = Number(inv.total_amount || 0);
        const rawPct = Number(inv.support_technician_percentage || 0);
        const pct = Number.isFinite(rawPct) ? Math.min(Math.max(rawPct, 0), 100) : 0;
        const vendorProductValue = sumVendorPaidFromInvoiceItems(inv.InvoiceItems || []);
        const balance = Math.max(total - vendorProductValue, 0);
        if(!technician) return sum;
        if(!Number.isFinite(total) || !Number.isFinite(pct) || pct <= 0) return sum;
        return sum + (balance * pct / 100);
    }, 0);
}

function sumVendorPaidFromInvoiceItems(rows){
    return (Array.isArray(rows) ? rows : []).reduce((sum, row) => {
        const qty = Number(row.qty || 0);
        const dealer = Number((row.Product && row.Product.dealer_price) || 0);
        if(!Number.isFinite(qty) || !Number.isFinite(dealer) || qty <= 0 || dealer <= 0) return sum;
        return sum + (qty * dealer);
    }, 0);
}

function getReceivedPaymentStatusFilter(){
    return {
        [Op.or]: [
            { [Op.iLike]: "%received%" },
            { [Op.iLike]: "%recieved%" }
        ]
    };
}

function getGeneralCustomerInclude(){
    return {
        model: Customer,
        required: true,
        attributes: [],
        where: {
            customer_mode: {
                [Op.iLike]: "general"
            }
        }
    };
}

function sumRentalCountPrice(rows){
    return (Array.isArray(rows) ? rows : []).reduce((sum, row) => {
        const input = Number(row.input_count || 0);
        const updated = Number(row.updated_count || 0);
        if(!Number.isFinite(input) || !Number.isFinite(updated)) return sum;
        return sum + ((updated - input) * 1);
    }, 0);
}

function sumRentalConsumablesPrice(rows){
    return (Array.isArray(rows) ? rows : []).reduce((sum, row) => {
        const qty = Number(row.quantity || 0);
        const dealer = Number((row.Product && row.Product.dealer_price) || 0);
        if(!Number.isFinite(qty) || !Number.isFinite(dealer) || qty <= 0 || dealer <= 0) return sum;
        return sum + (qty * dealer);
    }, 0);
}

function toDateOnlyText(value){
    const raw = String(value || "").trim();
    if(!raw) return "";
    if(/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const dt = new Date(raw);
    if(Number.isNaN(dt.getTime())) return "";
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const d = String(dt.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function parseBaseDateInput(value){
    const normalized = toDateOnlyText(value);
    if(normalized){
        return new Date(`${normalized}T00:00:00`);
    }
    const dt = value ? new Date(value) : new Date();
    return Number.isNaN(dt.getTime()) ? new Date() : dt;
}

function buildDateOnlyRangeWhere(columnName, startDate, endDate){
    return sqWhere(
        fn("DATE", col(columnName)),
        { [Op.between]: [startDate, endDate] }
    );
}

function toNumberSafe(value){
    const n = Number(value || 0);
    return Number.isFinite(n) ? n : 0;
}

function getErrorCode(err){
    return String(
        err?.original?.code
        || err?.parent?.code
        || err?.code
        || ""
    ).trim();
}

function getErrorMessage(err){
    return String(
        err?.original?.message
        || err?.parent?.message
        || err?.message
        || ""
    ).trim();
}

function isSchemaCompatibilityError(err){
    const code = getErrorCode(err);
    if(code === "42P01" || code === "42703" || code === "42704" || code === "42883"){
        return true;
    }
    const msg = getErrorMessage(err).toLowerCase();
    return msg.includes("does not exist")
        || msg.includes("undefined table")
        || msg.includes("undefined column")
        || msg.includes("undefined function");
}

function buildEmptySummaryPayload(period, periodStart, periodEnd, baseDate){
    const year = Number(baseDate?.getFullYear?.() || new Date().getFullYear());
    const months = MONTH_NAMES_SHORT.slice();
    const monthlySales = new Array(12).fill(0);
    const monthlyProfit = new Array(12).fill(0);
    return {
        totalUsers: 0,
        totalGeneralMachines: 0,
        totalRentalMachines: 0,
        totalProducts: 0,
        totalCustomers: 0,
        totalVendors: 0,
        totalSales: 0,
        receivedPayment: 0,
        rentalMachinesCountsPrice: 0,
        rentalConsumablesPrice: 0,
        totalExpenses: 0,
        netProfit: 0,
        technicianPaid: 0,
        technicianPaidForProfit: 0,
        vendorPaid: 0,
        totalSalesAllTime: 0,
        receivedPaymentAllTime: 0,
        rentalMachinesCountsPriceAllTime: 0,
        rentalMachinesCountsPriceAllInputs: 0,
        rentalConsumablesPriceAllTime: 0,
        rentalConsumablesPriceAllInputs: 0,
        totalExpensesAllTime: 0,
        netProfitAllTime: 0,
        technicianPaidAllTime: 0,
        technicianPaidAllTimeForProfit: 0,
        vendorPaidAllTime: 0,
        totalSalesPeriod: 0,
        receivedPaymentPeriod: 0,
        rentalMachinesCountsPricePeriod: 0,
        rentalConsumablesPricePeriod: 0,
        totalExpensesPeriod: 0,
        netProfitPeriod: 0,
        technicianPaidPeriod: 0,
        technicianPaidForProfitPeriod: 0,
        vendorPaidPeriod: 0,
        lowStock: [],
        months,
        monthlySales,
        monthlyProfit,
        period,
        periodStart,
        periodEnd,
        year,
        fallback_mode: "schema_compatibility"
    };
}

async function buildSchemaCompatibleSummary(period, periodStart, periodEnd, baseDate){
    const periodStartDate = toDateOnlyText(periodStart) || new Date(periodStart).toISOString().slice(0, 10);
    const periodEndDate = toDateOnlyText(periodEnd) || new Date(periodEnd).toISOString().slice(0, 10);
    const year = Number(baseDate?.getFullYear?.() || new Date().getFullYear());

    const safe = async (fn, fallbackValue) => {
        try{
            const value = await fn();
            if(value === null || value === undefined){
                return fallbackValue;
            }
            return value;
        }catch(err){
            if(isSchemaCompatibilityError(err)){
                return fallbackValue;
            }
            throw err;
        }
    };

    const totalUsers = toNumberSafe(await safe(() => User.count(), 0));
    const totalGeneralMachines = toNumberSafe(await safe(() => GeneralMachine.count(), 0));
    const totalRentalMachines = toNumberSafe(await safe(() => RentalMachine.count(), 0));
    const totalProducts = toNumberSafe(await safe(() => Product.count(), 0));
    const totalCustomers = toNumberSafe(await safe(() => Customer.count(), 0));
    const totalVendors = toNumberSafe(await safe(() => Vendor.count(), 0));

    const invoiceDateRangeWhere = buildDateOnlyRangeWhere("invoice_date", periodStartDate, periodEndDate);
    const invoiceCreatedRangeWhere = { createdAt: { [Op.between]: [periodStart, periodEnd] } };
    const expenseDateRangeWhere = buildDateOnlyRangeWhere("date", periodStartDate, periodEndDate);
    const expenseCreatedRangeWhere = { createdAt: { [Op.between]: [periodStart, periodEnd] } };

    let totalSalesPeriod = await safe(() => Invoice.sum("total_amount", { where: invoiceDateRangeWhere }), null);
    if(totalSalesPeriod === null){
        totalSalesPeriod = await safe(() => Invoice.sum("total_amount", { where: invoiceCreatedRangeWhere }), 0);
    }

    let totalExpensesPeriod = await safe(() => Expense.sum("amount", { where: expenseDateRangeWhere }), null);
    if(totalExpensesPeriod === null){
        totalExpensesPeriod = await safe(() => Expense.sum("amount", { where: expenseCreatedRangeWhere }), 0);
    }

    let receivedPaymentPeriod = await safe(() => Invoice.sum("total_amount", {
        where: {
            [Op.and]: [
                invoiceDateRangeWhere,
                { payment_status: getReceivedPaymentStatusFilter() }
            ]
        }
    }), null);
    if(receivedPaymentPeriod === null){
        receivedPaymentPeriod = await safe(() => Invoice.sum("total_amount", {
            where: {
                [Op.and]: [
                    invoiceCreatedRangeWhere,
                    { payment_status: getReceivedPaymentStatusFilter() }
                ]
            }
        }), 0);
    }

    const totalSalesAllTime = toNumberSafe(await safe(() => Invoice.sum("total_amount"), 0));
    const totalExpensesAllTime = toNumberSafe(await safe(() => Expense.sum("amount"), 0));
    const receivedPaymentAllTime = toNumberSafe(await safe(() => Invoice.sum("total_amount", {
        where: {
            payment_status: getReceivedPaymentStatusFilter()
        }
    }), 0));

    const lowStock = await safe(() => Product.findAll({
        where:{ count:{ [Op.lt]:5 } },
        attributes:["product_id","description","count"]
    }), []);

    const months = MONTH_NAMES_SHORT.slice();
    const monthlySales = [];
    const monthlyProfit = [];
    for(let m = 0; m < 12; m += 1){
        const start = new Date(year, m, 1, 0, 0, 0, 0);
        const end = new Date(year, m + 1, 0, 23, 59, 59, 999);
        const startText = toDateOnlyText(start);
        const endText = toDateOnlyText(end);
        const monthDateWhere = buildDateOnlyRangeWhere("invoice_date", startText, endText);
        const monthCreatedWhere = { createdAt: { [Op.between]: [start, end] } };

        let monthSales = await safe(() => Invoice.sum("total_amount", { where: monthDateWhere }), null);
        if(monthSales === null){
            monthSales = await safe(() => Invoice.sum("total_amount", { where: monthCreatedWhere }), 0);
        }
        let monthReceivedPayment = await safe(() => Invoice.sum("total_amount", {
            where: {
                [Op.and]: [
                    monthDateWhere,
                    { payment_status: getReceivedPaymentStatusFilter() }
                ]
            }
        }), null);
        if(monthReceivedPayment === null){
            monthReceivedPayment = await safe(() => Invoice.sum("total_amount", {
                where: {
                    [Op.and]: [
                        monthCreatedWhere,
                        { payment_status: getReceivedPaymentStatusFilter() }
                    ]
                }
            }), 0);
        }

        let monthExpenses = await safe(() => Expense.sum("amount", {
            where: buildDateOnlyRangeWhere("date", startText, endText)
        }), null);
        if(monthExpenses === null){
            monthExpenses = await safe(() => Expense.sum("amount", { where: monthCreatedWhere }), 0);
        }

        monthlySales.push(toNumberSafe(monthSales));
        monthlyProfit.push(toNumberSafe(monthReceivedPayment) - toNumberSafe(monthExpenses));
    }

    const totalSalesPeriodSafe = toNumberSafe(totalSalesPeriod);
    const totalExpensesPeriodSafe = toNumberSafe(totalExpensesPeriod);
    const receivedPaymentPeriodSafe = toNumberSafe(receivedPaymentPeriod);
    const netProfitPeriod = receivedPaymentPeriodSafe - totalExpensesPeriodSafe;
    const netProfitAllTime = receivedPaymentAllTime - totalExpensesAllTime;

    return {
        totalUsers,
        totalGeneralMachines,
        totalRentalMachines,
        totalProducts,
        totalCustomers,
        totalVendors,
        totalSales: totalSalesPeriodSafe,
        receivedPayment: receivedPaymentPeriodSafe,
        rentalMachinesCountsPrice: 0,
        rentalConsumablesPrice: 0,
        totalExpenses: totalExpensesPeriodSafe,
        netProfit: netProfitPeriod,
        technicianPaid: 0,
        technicianPaidForProfit: 0,
        vendorPaid: 0,
        totalSalesAllTime,
        receivedPaymentAllTime,
        rentalMachinesCountsPriceAllTime: 0,
        rentalMachinesCountsPriceAllInputs: 0,
        rentalConsumablesPriceAllTime: 0,
        rentalConsumablesPriceAllInputs: 0,
        totalExpensesAllTime,
        netProfitAllTime,
        technicianPaidAllTime: 0,
        technicianPaidAllTimeForProfit: 0,
        vendorPaidAllTime: 0,
        totalSalesPeriod: totalSalesPeriodSafe,
        receivedPaymentPeriod: receivedPaymentPeriodSafe,
        rentalMachinesCountsPricePeriod: 0,
        rentalConsumablesPricePeriod: 0,
        totalExpensesPeriod: totalExpensesPeriodSafe,
        netProfitPeriod,
        technicianPaidPeriod: 0,
        technicianPaidForProfitPeriod: 0,
        vendorPaidPeriod: 0,
        lowStock: Array.isArray(lowStock) ? lowStock : [],
        months,
        monthlySales,
        monthlyProfit,
        period,
        periodStart,
        periodEnd,
        year,
        fallback_mode: "schema_compatibility_partial"
    };
}

exports.getSummary = async (req,res)=>{
    let period = "day";
    let baseDate = new Date();
    let periodStart = new Date(baseDate);
    let periodEnd = new Date(baseDate);
    let summaryCacheKey = "";
    try{
        period = String(req.query.period || "day").toLowerCase();
        const dateStr = req.query.date;
        baseDate = parseBaseDateInput(dateStr);
        if(isNaN(baseDate.getTime())){
            return res.status(400).json({ message: "Invalid date" });
        }

        periodStart = new Date(baseDate);
        periodEnd = new Date(baseDate);

        const requestedDbName = String(
            req.databaseName || req.user?.database_name || req.headers["x-database-name"] || process.env.DB_NAME || "inventory"
        ).trim().toLowerCase() || "inventory";
        maybeQueueDailyBackup(requestedDbName);

        if(period === "week"){
            const day = periodStart.getDay();         
            const diffToMonday = (day + 6) % 7;
            periodStart.setDate(periodStart.getDate() - diffToMonday);
            periodStart.setHours(0,0,0,0);
            periodEnd = new Date(periodStart);
            periodEnd.setDate(periodStart.getDate() + 6);
            periodEnd.setHours(23,59,59,999);
        }else if(period === "month"){
            periodStart = new Date(periodStart.getFullYear(), periodStart.getMonth(), 1, 0,0,0,0);
            periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 0, 23,59,59,999);
        }else if(period === "year"){
            periodStart = new Date(periodStart.getFullYear(), 0, 1, 0,0,0,0);
            periodEnd = new Date(periodStart.getFullYear(), 11, 31, 23,59,59,999);
        }else{
            periodStart.setHours(0,0,0,0);
            periodEnd.setHours(23,59,59,999);
        }
        const periodStartDate = toDateOnlyText(periodStart) || new Date(periodStart).toISOString().slice(0, 10);
        const periodEndDate = toDateOnlyText(periodEnd) || new Date(periodEnd).toISOString().slice(0, 10);
        const cacheDateText = toDateOnlyText(baseDate) || periodStartDate;
        summaryCacheKey = buildSummaryCacheKey(requestedDbName, period, cacheDateText);
        const cachedPayload = getCachedSummary(summaryCacheKey);
        if (cachedPayload) {
            return res.json(cachedPayload);
        }

        const totalUsers = await User.count();
        const totalGeneralMachines = await GeneralMachine.count({
            include: [getGeneralCustomerInclude()]
        });
        const totalRentalMachines = await RentalMachine.count();
        const totalProducts = await Product.count();
        const totalCustomers = await Customer.count();
        const totalVendors = await Vendor.count();
        const totalSalesPeriod = await Invoice.sum("total_amount",{
            where: buildDateOnlyRangeWhere("invoice_date", periodStartDate, periodEndDate)
        }) || 0;
        const totalExpensesPeriod = await Expense.sum("amount",{
            where: buildDateOnlyRangeWhere("date", periodStartDate, periodEndDate)
        }) || 0;
                                                                           
        const receivedPaymentPeriod = await Invoice.sum("total_amount",{
            include: [getGeneralCustomerInclude()],
            where:{
                [Op.and]: [
                    buildDateOnlyRangeWhere("invoice_date", periodStartDate, periodEndDate),
                    { payment_status: getReceivedPaymentStatusFilter() }
                ]
            }
        }) || 0;
        const invoicesPeriodForProfit = await Invoice.findAll({
            where:{
                [Op.and]: [
                    buildDateOnlyRangeWhere("invoice_date", periodStartDate, periodEndDate),
                    { payment_status: getReceivedPaymentStatusFilter() }
                ]
            },
            attributes:["id","total_amount","support_technician","support_technician_percentage"],
            include: [
                getGeneralCustomerInclude(),
                {
                    model: InvoiceItem,
                    required: false,
                    attributes: ["qty"],
                    include: [{ model: Product, required: false, attributes: ["dealer_price"] }]
                }
            ]
        });
        const technicianPaidPeriodForProfit = sumTechnicianPaid(invoicesPeriodForProfit);
        const invoicesPeriodForCard = await Invoice.findAll({
            where:{
                [Op.and]: [
                    buildDateOnlyRangeWhere("invoice_date", periodStartDate, periodEndDate),
                    { support_technician: { [Op.not]: null } }
                ]
            },
            attributes:["id","total_amount","support_technician","support_technician_percentage"],
            include: [
                {
                    model: InvoiceItem,
                    required: false,
                    attributes: ["qty"],
                    include: [{ model: Product, required: false, attributes: ["dealer_price"] }]
                }
            ]
        });
        const technicianPaidPeriod = sumTechnicianPaid(invoicesPeriodForCard);
        const invoiceItemsPeriod = await InvoiceItem.findAll({
            include: [
                {
                    model: Invoice,
                    required: true,
                    attributes: ["id", "invoice_date", "payment_status"],
                    where: {
                        [Op.and]: [
                            buildDateOnlyRangeWhere("invoice_date", periodStartDate, periodEndDate),
                            { payment_status: getReceivedPaymentStatusFilter() }
                        ]
                    },
                    include: [getGeneralCustomerInclude()]
                },
                { model: Product, required: false, attributes: ["id", "dealer_price"] }
            ],
            attributes: ["qty"]
        });
        const vendorPaidPeriod = sumVendorPaidFromInvoiceItems(invoiceItemsPeriod);
        const netProfitPeriod = receivedPaymentPeriod - totalExpensesPeriod - technicianPaidPeriod - vendorPaidPeriod;
        const rentalCountsPeriodRows = await RentalMachineCount.findAll({
            where: {
                [Op.or]: [
                    { entry_date: { [Op.between]: [periodStartDate, periodEndDate] } },
                    {
                        entry_date: { [Op.is]: null },
                        createdAt: { [Op.between]: [periodStart, periodEnd] }
                    }
                ]
            },
            attributes: ["input_count", "updated_count"]
        });
        const rentalMachinesCountsPricePeriod = sumRentalCountPrice(rentalCountsPeriodRows);
        const rentalConsumablesPeriodRows = await RentalMachineConsumable.findAll({
            where: {
                [Op.or]: [
                    { entry_date: { [Op.between]: [periodStartDate, periodEndDate] } },
                    {
                        entry_date: { [Op.is]: null },
                        createdAt: { [Op.between]: [periodStart, periodEnd] }
                    }
                ]
            },
            include: [{ model: Product, required: false, attributes: ["id", "dealer_price"] }],
            attributes: ["quantity"]
        });
        const rentalConsumablesPricePeriod = sumRentalConsumablesPrice(rentalConsumablesPeriodRows);

        const totalSalesAllTime = await Invoice.sum("total_amount") || 0;
        const totalExpensesAllTime = await Expense.sum("amount") || 0;
        const receivedPaymentAllTime = await Invoice.sum("total_amount", {
            include: [getGeneralCustomerInclude()],
            where: {
                payment_status: getReceivedPaymentStatusFilter()
            }
        }) || 0;
        const invoicesAllTimeForProfit = await Invoice.findAll({
            include: [
                getGeneralCustomerInclude(),
                {
                    model: InvoiceItem,
                    required: false,
                    attributes: ["qty"],
                    include: [{ model: Product, required: false, attributes: ["dealer_price"] }]
                }
            ],
            where: {
                payment_status: getReceivedPaymentStatusFilter()
            },
            attributes:["id","total_amount","support_technician","support_technician_percentage"]
        });
        const technicianPaidAllTimeForProfit = sumTechnicianPaid(invoicesAllTimeForProfit);
        const invoicesAllTimeForCard = await Invoice.findAll({
            where: {
                support_technician: { [Op.not]: null }
            },
            attributes:["id","total_amount","support_technician","support_technician_percentage"],
            include: [
                {
                    model: InvoiceItem,
                    required: false,
                    attributes: ["qty"],
                    include: [{ model: Product, required: false, attributes: ["dealer_price"] }]
                }
            ]
        });
        const technicianPaidAllTime = sumTechnicianPaid(invoicesAllTimeForCard);
        const invoiceItemsAllTime = await InvoiceItem.findAll({
            include: [
                {
                    model: Invoice,
                    required: true,
                    attributes: ["id", "payment_status"],
                    where: {
                        payment_status: getReceivedPaymentStatusFilter()
                    },
                    include: [getGeneralCustomerInclude()]
                },
                { model: Product, required: false, attributes: ["id", "dealer_price"] }
            ],
            attributes: ["qty"]
        });
        const vendorPaidAllTime = sumVendorPaidFromInvoiceItems(invoiceItemsAllTime);
        const netProfitAllTime = receivedPaymentAllTime - totalExpensesAllTime - technicianPaidAllTime - vendorPaidAllTime;
        const rentalCountsAllTimeRows = await RentalMachineCount.findAll({
            attributes: ["input_count", "updated_count"]
        });
        const rentalMachinesCountsPriceAllTime = sumRentalCountPrice(rentalCountsAllTimeRows);
        const rentalConsumablesAllTimeRows = await RentalMachineConsumable.findAll({
            include: [{ model: Product, required: false, attributes: ["id", "dealer_price"] }],
            attributes: ["quantity"]
        });
        const rentalConsumablesPriceAllTime = sumRentalConsumablesPrice(rentalConsumablesAllTimeRows);

                                      
        const lowStock = await Product.findAll({
            where:{ count:{ [Op.lt]:5 } },
            attributes:["product_id","description","count"]
        });

                                        
        const months = [];
        const monthlySales = [];
        const monthlyProfit = [];
        const currentYear = baseDate.getFullYear();

        for(let m=0;m<12;m++){
            const start = new Date(currentYear,m,1,0,0,0,0);
            const end = new Date(currentYear,m+1,0,23,59,59,999);
            const startText = toDateOnlyText(start);
            const endText = toDateOnlyText(end);
            const monthInvoiceDateWhere = buildDateOnlyRangeWhere("invoice_date", startText, endText);

            const monthSales = await Invoice.sum("total_amount",{
                where: monthInvoiceDateWhere
            }) || 0;
            const monthExpenses = await Expense.sum("amount",{
                where: buildDateOnlyRangeWhere("date", startText, endText)
            }) || 0;
            const monthReceivedPayment = await Invoice.sum("total_amount",{
                include: [getGeneralCustomerInclude()],
                where:{
                    [Op.and]: [
                        monthInvoiceDateWhere,
                        { payment_status: getReceivedPaymentStatusFilter() }
                    ]
                }
            }) || 0;
            const monthInvoicesForTechnician = await Invoice.findAll({
                where:{
                    [Op.and]: [
                        monthInvoiceDateWhere,
                        { support_technician: { [Op.not]: null } }
                    ]
                },
                attributes:["id","total_amount","support_technician","support_technician_percentage"],
                include: [
                    {
                        model: InvoiceItem,
                        required: false,
                        attributes: ["qty"],
                        include: [{ model: Product, required: false, attributes: ["dealer_price"] }]
                    }
                ]
            });
            const monthTechnicianPaid = sumTechnicianPaid(monthInvoicesForTechnician);
            const monthInvoiceItemsForVendor = await InvoiceItem.findAll({
                include: [
                    {
                        model: Invoice,
                        required: true,
                        attributes: ["id", "invoice_date", "payment_status"],
                        where: {
                            [Op.and]: [
                                monthInvoiceDateWhere,
                                { payment_status: getReceivedPaymentStatusFilter() }
                            ]
                        },
                        include: [getGeneralCustomerInclude()]
                    },
                    { model: Product, required: false, attributes: ["id", "dealer_price"] }
                ],
                attributes: ["qty"]
            });
            const monthVendorPaid = sumVendorPaidFromInvoiceItems(monthInvoiceItemsForVendor);
            const monthRentalCountsRows = await RentalMachineCount.findAll({
                where: {
                    [Op.or]: [
                        { entry_date: { [Op.between]: [startText, endText] } },
                        {
                            entry_date: { [Op.is]: null },
                            createdAt: { [Op.between]: [start, end] }
                        }
                    ]
                },
                attributes: ["input_count", "updated_count"]
            });
            const monthRentalMachinesCountsPrice = sumRentalCountPrice(monthRentalCountsRows);
            const monthRentalConsumablesRows = await RentalMachineConsumable.findAll({
                where: {
                    [Op.or]: [
                        { entry_date: { [Op.between]: [startText, endText] } },
                        {
                            entry_date: { [Op.is]: null },
                            createdAt: { [Op.between]: [start, end] }
                        }
                    ]
                },
                include: [{ model: Product, required: false, attributes: ["id", "dealer_price"] }],
                attributes: ["quantity"]
            });
            const monthRentalConsumablesPrice = sumRentalConsumablesPrice(monthRentalConsumablesRows);

            const monthProfit =
                toNumberSafe(monthReceivedPayment)
                + toNumberSafe(monthRentalMachinesCountsPrice)
                - toNumberSafe(monthRentalConsumablesPrice)
                - toNumberSafe(monthExpenses)
                - toNumberSafe(monthTechnicianPaid)
                - toNumberSafe(monthVendorPaid);
            months.push(start.toLocaleString('default',{month:'short'}));
            monthlySales.push(toNumberSafe(monthSales));
            monthlyProfit.push(Number(monthProfit.toFixed(2)));
        }

        const payload = {
            totalUsers,
            totalGeneralMachines,
            totalRentalMachines,
            totalProducts,
            totalCustomers,
            totalVendors,
            totalSales: totalSalesPeriod,
            receivedPayment: receivedPaymentPeriod,
            rentalMachinesCountsPrice: rentalMachinesCountsPricePeriod,
            rentalConsumablesPrice: rentalConsumablesPricePeriod,
            totalExpenses: totalExpensesPeriod,
            netProfit: netProfitPeriod,
            technicianPaid: technicianPaidPeriod,
            technicianPaidForProfit: technicianPaidPeriodForProfit,
            vendorPaid: vendorPaidPeriod,
            totalSalesAllTime,
            receivedPaymentAllTime,
            rentalMachinesCountsPriceAllTime,
            rentalMachinesCountsPriceAllInputs: rentalMachinesCountsPriceAllTime,
            rentalConsumablesPriceAllTime,
            rentalConsumablesPriceAllInputs: rentalConsumablesPriceAllTime,
            totalExpensesAllTime,
            netProfitAllTime,
            technicianPaidAllTime,
            technicianPaidAllTimeForProfit,
            vendorPaidAllTime,
            totalSalesPeriod,
            receivedPaymentPeriod,
            rentalMachinesCountsPricePeriod,
            rentalConsumablesPricePeriod,
            totalExpensesPeriod,
            netProfitPeriod,
            technicianPaidPeriod,
            technicianPaidForProfitPeriod: technicianPaidPeriodForProfit,
            vendorPaidPeriod,
            lowStock,
            months,
            monthlySales,
            monthlyProfit,
            period,
            periodStart,
            periodEnd
        };

        setCachedSummary(summaryCacheKey, payload);
        res.json(payload);

    }catch(err){
        if(isSchemaCompatibilityError(err)){
            const message = getErrorMessage(err);
            console.warn("[dashboard] Schema compatibility fallback used for summary.", {
                database: String(req?.databaseName || req?.user?.database_name || ""),
                code: getErrorCode(err),
                message
            });
            try{
                const compatibleSummary = await buildSchemaCompatibleSummary(period, periodStart, periodEnd, baseDate);
                if (summaryCacheKey) {
                    setCachedSummary(summaryCacheKey, compatibleSummary);
                }
                return res.json(compatibleSummary);
            }catch(compatErr){
                console.error("[dashboard] Compatible summary fallback failed.", compatErr);
                const emptyPayload = buildEmptySummaryPayload(period, periodStart, periodEnd, baseDate);
                if (summaryCacheKey) {
                    setCachedSummary(summaryCacheKey, emptyPayload);
                }
                return res.json(emptyPayload);
            }
        }
        console.error(err);
        res.status(500).json({ message:"Failed to get dashboard summary" });
    }
}
