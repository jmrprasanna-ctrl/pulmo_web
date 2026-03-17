const { Op } = require("sequelize");
const Invoice = require("../models/Invoice");
const InvoiceItem = require("../models/InvoiceItem");
const Customer = require("../models/Customer");
const Expense = require("../models/Expense");
const Product = require("../models/Product");
const Vendor = require("../models/Vendor");
const Category = require("../models/Category");
const RentalMachineConsumable = require("../models/RentalMachineConsumable");
const RentalMachine = require("../models/RentalMachine");
const RentalMachineCount = require("../models/RentalMachineCount");
const Sequelize = require("sequelize");

function getRange(period, rawDate){
    const now = rawDate ? new Date(rawDate) : new Date();
    if(Number.isNaN(now.getTime())){
        const fallback = new Date();
        return { start: new Date(fallback.getFullYear(), fallback.getMonth(), 1), end: fallback };
    }

    const p = String(period || "all").toLowerCase();

    if(p === "week"){
        const day = now.getDay();
        const diffToMonday = (day + 6) % 7;
        const start = new Date(now);
        start.setDate(now.getDate() - diffToMonday);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        return { start, end };
    }

    if(p === "month"){
        const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        return { start, end };
    }

    if(p === "year" || p === "annual"){
        const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
        const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
        return { start, end };
    }

    return null;
}

exports.salesReport = async (req,res)=>{
    try{
        const period = String(req.query.period || "all").toLowerCase();
        const range = getRange(period, req.query.date);
        const where = range ? { createdAt: { [Op.between]: [range.start, range.end] } } : {};

        const invoices = await Invoice.findAll({
            where,
            include:[Customer],
            order:[["createdAt","DESC"]]
        });
        const rows = invoices.map(inv=>({
            id: inv.id,
            invoice_id: inv.id,
            invoice_no: inv.invoice_no,
            customer_name: inv.Customer ? inv.Customer.name : "",
            date: inv.createdAt,
            total_amount: inv.total_amount
        }));
        const totalSales = rows.reduce((sum, row) => sum + (Number(row.total_amount) || 0), 0);
        res.json({
            period,
            start: range ? range.start : null,
            end: range ? range.end : null,
            totalSales: Number(totalSales.toFixed(2)),
            totalInvoices: rows.length,
            rows
        });
    }catch(err){
        res.status(500).json({ message: err.message || "Failed to load sales report." });
    }
};

exports.expenseReport = async (req,res)=>{
    try{
        const expenses = await Expense.findAll({ order:[["date","DESC"]] });
        res.json(expenses);
    }catch(err){
        res.status(500).json({ message: err.message || "Failed to load expense report." });
    }
};

exports.profitLossReport = async (req,res)=>{
    try{
        const months = [];
        const rows = [];
        const currentYear = new Date().getFullYear();

        for(let m=0;m<12;m++){
            const start = new Date(currentYear,m,1);
            const end = new Date(currentYear,m+1,0,23,59,59,999);

            const total_sales = await Invoice.sum("total_amount",{
                where:{ createdAt:{ [Op.between]:[start,end] } }
            }) || 0;

            const total_expense = await Expense.sum("amount",{
                where:{ date:{ [Op.between]:[start,end] } }
            }) || 0;

            const net_profit = total_sales - total_expense;
            const monthName = start.toLocaleString("default",{month:"short"});
            months.push(monthName);
            rows.push({ month: monthName, total_sales, total_expense, net_profit });
        }

        res.json(rows);
    }catch(err){
        res.status(500).json({ message: err.message || "Failed to load profit-loss report." });
    }
};

exports.technicianInvoicesMonthlyReport = async (req,res)=>{
    try{
        const now = new Date();
        const year = Number(req.query.year) || now.getFullYear();
        const month = Number(req.query.month) || (now.getMonth() + 1);
        const safeMonth = Math.min(Math.max(month, 1), 12);

        const start = new Date(year, safeMonth - 1, 1, 0, 0, 0, 0);
        const end = new Date(year, safeMonth, 0, 23, 59, 59, 999);

        const invoices = await Invoice.findAll({
            where: {
                createdAt: { [Op.between]: [start, end] },
                support_technician: { [Op.not]: null }
            },
            include: [{ model: Customer, attributes: ["id", "name"] }],
            order: [["createdAt", "DESC"]]
        });

        const normalized = invoices
            .filter((inv) => String(inv.support_technician || "").trim())
            .map((inv) => ({
                id: inv.id,
                invoice_no: inv.invoice_no,
                technician: String(inv.support_technician || "").trim(),
                customer_name: inv.Customer ? inv.Customer.name : "",
                date: inv.createdAt,
                total_amount: Number(inv.total_amount || 0)
            }));

        const grouped = new Map();
        normalized.forEach((row) => {
            if(!grouped.has(row.technician)){
                grouped.set(row.technician, {
                    technician: row.technician,
                    invoices_count: 0,
                    total_amount: 0
                });
            }
            const g = grouped.get(row.technician);
            g.invoices_count += 1;
            g.total_amount += Number(row.total_amount || 0);
        });

        const summary = Array.from(grouped.values())
            .map((g) => ({
                ...g,
                total_amount: Number(g.total_amount.toFixed(2))
            }))
            .sort((a, b) => b.invoices_count - a.invoices_count);

        res.json({
            year,
            month: safeMonth,
            start,
            end,
            summary,
            rows: normalized
        });
    }catch(err){
        res.status(500).json({ message: err.message || "Failed to load technician invoice report." });
    }
};

exports.lowStockReport = async (req,res)=>{
    try{
        const min = Math.max(1, Number(req.query.min) || 2);
        const products = await Product.findAll({
            where: {
                count: { [Op.between]: [1, min] }
            },
            include: [
                { model: Category, attributes: ["id", "name"] },
                { model: Vendor, attributes: ["id", "name"] }
            ],
            order: [["count", "ASC"], ["product_id", "ASC"]]
        });
        res.json({
            min,
            total: products.length,
            rows: products.map((p) => ({
                id: p.id,
                product_id: p.product_id,
                description: p.description,
                model: p.model,
                count: Number(p.count || 0),
                category: p.Category ? p.Category.name : "",
                vendor: p.Vendor ? p.Vendor.name : ""
            }))
        });
    }catch(err){
        res.status(500).json({ message: err.message || "Failed to load low stock report." });
    }
};

exports.outOfStockReport = async (req,res)=>{
    try{
        const products = await Product.findAll({
            where: { count: { [Op.lte]: 0 } },
            include: [
                { model: Category, attributes: ["id", "name"] },
                { model: Vendor, attributes: ["id", "name"] }
            ],
            order: [["product_id", "ASC"]]
        });
        res.json({
            total: products.length,
            rows: products.map((p) => ({
                id: p.id,
                product_id: p.product_id,
                description: p.description,
                model: p.model,
                count: Number(p.count || 0),
                category: p.Category ? p.Category.name : "",
                vendor: p.Vendor ? p.Vendor.name : ""
            }))
        });
    }catch(err){
        res.status(500).json({ message: err.message || "Failed to load out of stock report." });
    }
};

exports.vendorWiseProductsReport = async (req,res)=>{
    try{
        const products = await Product.findAll({
            include: [
                { model: Vendor, attributes: ["id", "name"] },
                { model: Category, attributes: ["id", "name"] }
            ],
            order: [[Vendor, "name", "ASC"], ["product_id", "ASC"]]
        });

        const rows = products.map((p) => ({
            id: p.id,
            vendor: p.Vendor ? p.Vendor.name : "Unassigned",
            product_id: p.product_id,
            description: p.description,
            model: p.model,
            category: p.Category ? p.Category.name : "",
            count: Number(p.count || 0)
        }));

        res.json({ total: rows.length, rows });
    }catch(err){
        res.status(500).json({ message: err.message || "Failed to load vendor-wise product report." });
    }
};

exports.rentalConsumablesMachineCustomerReport = async (req,res)=>{
    try{
        const consumables = await RentalMachineConsumable.findAll({
            include: [
                { model: Customer, attributes: ["id", "name"] },
                { model: RentalMachine, attributes: ["id", "machine_id", "model", "serial_no", "start_count", "updated_count"] },
                { model: Product, attributes: ["id", "dealer_price"] }
            ],
            order: [["createdAt", "DESC"]]
        });

        const grouped = new Map();
        consumables.forEach((row) => {
            const customerId = Number(row.customer_id || (row.Customer && row.Customer.id) || 0);
            const customerName = row.Customer ? row.Customer.name : "";
            const machine = row.RentalMachine || null;
            const machineId = machine ? String(machine.machine_id || "") : "";
            const serialNo = machine ? String(machine.serial_no || "") : "";
            const machineModel = machine ? String(machine.model || "") : "";
            const startCount = machine ? Number(machine.start_count || 0) : 0;
            const consumableCount = Number(row.count || 0);
            const key = `${customerId}__${machineId || "NO_MACHINE"}__${serialNo || "NO_SERIAL"}`;

            if(!grouped.has(key)){
                grouped.set(key, {
                    customer_id: customerId,
                    customer_name: customerName,
                    machine_id: machineId,
                    machine_model: machineModel,
                    serial_no: serialNo,
                    start_count: startCount,
                    count_value: startCount,
                    updated_copy_count: consumableCount > 0 ? consumableCount : 0,
                    total_consumable_qty: 0,
                    total_amount: 0,
                    latest_entry_at: row.createdAt,
                    latest_count_at: row.createdAt
                });
            }

            const g = grouped.get(key);
            const qty = Number(row.quantity || 0);
            const unitPrice = Number((row.Product && row.Product.dealer_price) || 0);
            g.total_consumable_qty += qty;
            g.total_amount += (qty * unitPrice);
            if(consumableCount > 0 && new Date(row.createdAt).getTime() >= new Date(g.latest_count_at).getTime()){
                g.updated_copy_count = consumableCount;
                g.latest_count_at = row.createdAt;
            }
            if(new Date(row.createdAt).getTime() > new Date(g.latest_entry_at).getTime()){
                g.latest_entry_at = row.createdAt;
            }
        });

        const rows = Array.from(grouped.values())
            .sort((a, b) => {
                const customerCmp = String(a.customer_name || "").localeCompare(String(b.customer_name || ""));
                if(customerCmp !== 0) return customerCmp;
                return String(a.machine_id || "").localeCompare(String(b.machine_id || ""));
            })
            .map((r) => ({
                ...r,
                total_consumable_qty: Number(r.total_consumable_qty || 0),
                total_amount: Number((r.total_amount || 0).toFixed(2))
            }));

        res.json({ total: rows.length, rows });
    }catch(err){
        res.status(500).json({ message: err.message || "Failed to load rental consumables report." });
    }
};

exports.rentalCountMachineCustomerReport = async (req,res)=>{
    try{
        const counts = await RentalMachineCount.findAll({
            include: [
                { model: Customer, attributes: ["id", "name"] },
                { model: RentalMachine, attributes: ["id", "machine_id", "model", "serial_no", "start_count", "updated_count"] }
            ],
            order: [["createdAt", "DESC"], ["id", "DESC"]]
        });

        const grouped = new Map();
        counts.forEach((row) => {
            const customerId = Number((row.Customer && row.Customer.id) || row.customer_id || 0);
            const customerName = row.Customer ? row.Customer.name : "";
            const machine = row.RentalMachine || null;
            const machineId = machine ? String(machine.machine_id || "") : "";
            const machineModel = machine ? String(machine.model || "") : "";
            const serialNo = machine ? String(machine.serial_no || "") : "";
            const startCount = machine ? Number(machine.start_count || 0) : 0;
            const key = `${customerId}__${machineId || "NO_MACHINE"}__${serialNo || "NO_SERIAL"}`;

            if(!grouped.has(key)){
                grouped.set(key, {
                    customer_id: customerId,
                    customer_name: customerName,
                    machine_id: machineId,
                    machine_model: machineModel,
                    serial_no: serialNo,
                    start_count: startCount,
                    updated_copy_count: Number(row.updated_count || 0),
                    last_input_count: Number(row.input_count || 0),
                    last_transaction_id: row.transaction_id || "",
                    latest_entry_at: row.createdAt,
                    total_transactions: 0
                });
            }

            const g = grouped.get(key);
            g.total_transactions += 1;
            if(new Date(row.createdAt).getTime() >= new Date(g.latest_entry_at).getTime()){
                g.updated_copy_count = Number(row.updated_count || 0);
                g.last_input_count = Number(row.input_count || 0);
                g.last_transaction_id = row.transaction_id || "";
                g.latest_entry_at = row.createdAt;
            }
        });

        const rows = Array.from(grouped.values())
            .sort((a, b) => {
                const customerCmp = String(a.customer_name || "").localeCompare(String(b.customer_name || ""));
                if(customerCmp !== 0) return customerCmp;
                return String(a.machine_id || "").localeCompare(String(b.machine_id || ""));
            });

        res.json({ total: rows.length, rows });
    }catch(err){
        res.status(500).json({ message: err.message || "Failed to load rental count report." });
    }
};

exports.rentalMachineCopyCountPriceReport = async (req,res)=>{
    try{
        const machines = await RentalMachine.findAll({
            include: [{ model: Customer, attributes: ["id", "name"] }],
            order: [["customer_name", "ASC"], ["machine_id", "ASC"]]
        });

        const invoices = await Invoice.findAll({
            attributes: ["id", "invoice_no", "customer_id", "serial_no", "machine_description", "machine_count", "total_amount", "createdAt"],
            order: [["createdAt", "DESC"]]
        });

        const rows = machines.map((m) => {
            const customerId = Number(m.customer_id || 0);
            const serialNo = String(m.serial_no || "").trim().toUpperCase();
            const machineTitle = String(m.machine_title || "").trim().toUpperCase();

            const relatedInvoices = invoices.filter((inv) => {
                if(Number(inv.customer_id || 0) !== customerId) return false;
                const invSerial = String(inv.serial_no || "").trim().toUpperCase();
                const invMachineDesc = String(inv.machine_description || "").trim().toUpperCase();

                if(serialNo){
                    return invSerial === serialNo;
                }
                if(machineTitle){
                    return invMachineDesc === machineTitle;
                }
                return false;
            });

            const latestInvoice = relatedInvoices.length ? relatedInvoices[0] : null;
            const startCount = Number(m.start_count || 0);
            const manualUpdatedCount = Number(m.updated_count || startCount);
            const updatedCopyCount = latestInvoice ? Number(latestInvoice.machine_count || manualUpdatedCount) : manualUpdatedCount;
            const totalAmount = latestInvoice ? Number(latestInvoice.total_amount || 0) : 0;
            const deltaCopies = updatedCopyCount - startCount;
            const manualPricePerPage = Number(m.page_per_price || 0);
            const pricePerPage = deltaCopies > 0 ? (totalAmount / deltaCopies) : manualPricePerPage;

            return {
                customer_id: customerId,
                customer_name: (m.Customer && m.Customer.name) || m.customer_name || "",
                machine_id: m.machine_id || "",
                machine_title: m.machine_title || "",
                serial_no: m.serial_no || "",
                start_count: startCount,
                updated_copy_count: updatedCopyCount,
                copied_pages: deltaCopies > 0 ? deltaCopies : 0,
                latest_invoice_no: latestInvoice ? latestInvoice.invoice_no || "" : "",
                latest_invoice_date: latestInvoice ? latestInvoice.createdAt : null,
                latest_invoice_total: Number(totalAmount.toFixed(2)),
                price_per_page: Number(pricePerPage.toFixed(4))
            };
        });

        res.json({ total: rows.length, rows });
    }catch(err){
        res.status(500).json({ message: err.message || "Failed to load rental machine copy count report." });
    }
};

function clampMonth(month){
    const m = Number(month) || 1;
    return Math.min(Math.max(m, 1), 12);
}

function getPeriods(baseDate){
    const ref = baseDate && !Number.isNaN(new Date(baseDate).getTime()) ? new Date(baseDate) : new Date();
    const week = getRange("week", ref);
    const month = getRange("month", ref);
    const year = getRange("year", ref);
    return { week, month, year };
}

function periodLabel(periodName){
    if(periodName === "week") return "Week";
    if(periodName === "month") return "Month";
    return "Annual";
}

exports.financeOverview = async (req,res)=>{
    try{
        const { week, month, year } = getPeriods(req.query.date);
        const periods = { week, month, year };
        const periodKeys = ["week", "month", "year"];

        const summaryByPeriod = {};
        for(const key of periodKeys){
            const range = periods[key];
            const sales = Number(await Invoice.sum("total_amount", {
                where: { createdAt: { [Op.between]: [range.start, range.end] } }
            }) || 0);
            const expenses = Number(await Expense.sum("amount", {
                where: { date: { [Op.between]: [range.start, range.end] } }
            }) || 0);
            summaryByPeriod[key] = {
                period: periodLabel(key),
                total_sales: Number(sales.toFixed(2)),
                total_expenses: Number(expenses.toFixed(2)),
                net_profit: Number((sales - expenses).toFixed(2))
            };
        }

        const monthExpenseRowsRaw = await Expense.findAll({
            where: { date: { [Op.between]: [month.start, month.end] } },
            order: [["date", "DESC"], ["id", "DESC"]],
            attributes: ["id", "title", "customer", "category", "amount", "date"]
        });
        const monthExpenseRows = monthExpenseRowsRaw.map((e) => ({
            id: e.id,
            title: e.title || "",
            customer: e.customer || "",
            category: e.category || "",
            amount: Number(e.amount || 0),
            date: e.date
        }));

        const techMonthRaw = String(req.query.techMonth || "").trim();
        const techRef = techMonthRaw ? new Date(`${techMonthRaw}-01T00:00:00`) : new Date();
        const techYear = techRef.getFullYear();
        const techMonth = clampMonth(techRef.getMonth() + 1);
        const techStart = new Date(techYear, techMonth - 1, 1, 0, 0, 0, 0);
        const techEnd = new Date(techYear, techMonth, 0, 23, 59, 59, 999);

        const techInvoices = await Invoice.findAll({
            where: {
                createdAt: { [Op.between]: [techStart, techEnd] },
                support_technician: { [Op.not]: null }
            },
            attributes: ["support_technician", "support_technician_percentage", "total_amount"]
        });

        const techMap = new Map();
        techInvoices.forEach((inv) => {
            const technician = String(inv.support_technician || "").trim();
            if(!technician) return;
            const pct = Number(inv.support_technician_percentage || 0);
            const total = Number(inv.total_amount || 0);
            const pctAmount = total * (pct / 100);
            if(!techMap.has(technician)){
                techMap.set(technician, {
                    technician,
                    invoices_count: 0,
                    total_sales: 0,
                    total_percentage_amount: 0,
                    total_percentage_value: 0
                });
            }
            const row = techMap.get(technician);
            row.invoices_count += 1;
            row.total_sales += total;
            row.total_percentage_amount += pctAmount;
            row.total_percentage_value += pct;
        });

        const technicianMonthly = {
            year: techYear,
            month: techMonth,
            rows: Array.from(techMap.values()).map((r) => ({
                technician: r.technician,
                invoices_count: r.invoices_count,
                total_sales: Number(r.total_sales.toFixed(2)),
                average_percentage: Number((r.invoices_count ? (r.total_percentage_value / r.invoices_count) : 0).toFixed(2)),
                percentage_amount: Number(r.total_percentage_amount.toFixed(2))
            })).sort((a, b) => b.percentage_amount - a.percentage_amount)
        };

        const soldProductSellingPriceByPeriod = [];
        const vendorDealerPriceByPeriod = [];
        const vendorDealerDetailsByPeriod = {};

        for(const key of periodKeys){
            const range = periods[key];
            const items = await InvoiceItem.findAll({
                include: [
                    {
                        model: Invoice,
                        required: true,
                        attributes: ["id", "createdAt"],
                        where: { createdAt: { [Op.between]: [range.start, range.end] } }
                    },
                    {
                        model: Product,
                        required: false,
                        attributes: ["id", "dealer_price", "vendor_id"],
                        include: [{ model: Vendor, attributes: ["id", "name"] }]
                    }
                ]
            });

            let soldTotal = 0;
            let dealerTotal = 0;
            const vendorMap = new Map();

            items.forEach((item) => {
                const qty = Number(item.qty || 0);
                const rate = Number(item.rate || 0);
                soldTotal += qty * rate;

                const dealer = Number((item.Product && item.Product.dealer_price) || 0);
                const dealerAmount = qty * dealer;
                dealerTotal += dealerAmount;

                const vendorName = item.Product && item.Product.Vendor ? item.Product.Vendor.name : "Unassigned";
                if(!vendorMap.has(vendorName)){
                    vendorMap.set(vendorName, {
                        vendor: vendorName,
                        qty: 0,
                        total_dealer_amount: 0
                    });
                }
                const v = vendorMap.get(vendorName);
                v.qty += qty;
                v.total_dealer_amount += dealerAmount;
            });

            soldProductSellingPriceByPeriod.push({
                period: periodLabel(key),
                total_amount: Number(soldTotal.toFixed(2))
            });
            vendorDealerPriceByPeriod.push({
                period: periodLabel(key),
                total_amount: Number(dealerTotal.toFixed(2))
            });
            vendorDealerDetailsByPeriod[key] = Array.from(vendorMap.values())
                .map((v) => ({
                    vendor: v.vendor,
                    qty: Number(v.qty || 0),
                    total_dealer_amount: Number((v.total_dealer_amount || 0).toFixed(2))
                }))
                .sort((a, b) => b.total_dealer_amount - a.total_dealer_amount);
        }

        const rentalConsumablesRows = await RentalMachineConsumable.findAll({
            include: [
                { model: Product, attributes: ["id", "dealer_price"] },
                { model: Customer, attributes: ["id", "name"] }
            ],
            order: [["createdAt", "DESC"]]
        });

        const rcMonthMap = new Map();
        const rcYearMap = new Map();
        const rcCustomerMap = new Map();

        rentalConsumablesRows.forEach((row) => {
            const qty = Number(row.quantity || 0);
            const dealer = Number((row.Product && row.Product.dealer_price) || 0);
            const amount = qty * dealer;
            const date = new Date(row.createdAt);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
            const yearKey = String(date.getFullYear());
            const customerName = row.Customer ? row.Customer.name : "Unknown";

            rcMonthMap.set(monthKey, (rcMonthMap.get(monthKey) || 0) + amount);
            rcYearMap.set(yearKey, (rcYearMap.get(yearKey) || 0) + amount);
            if(!rcCustomerMap.has(customerName)){
                rcCustomerMap.set(customerName, { customer_name: customerName, total_qty: 0, total_amount: 0 });
            }
            const c = rcCustomerMap.get(customerName);
            c.total_qty += qty;
            c.total_amount += amount;
        });

        const rentalConsumables = {
            month_wise: Array.from(rcMonthMap.entries())
                .map(([month_name, total_amount]) => ({ month_name, total_amount: Number(total_amount.toFixed(2)) }))
                .sort((a, b) => a.month_name.localeCompare(b.month_name)),
            year_wise: Array.from(rcYearMap.entries())
                .map(([year_name, total_amount]) => ({ year_name, total_amount: Number(total_amount.toFixed(2)) }))
                .sort((a, b) => a.year_name.localeCompare(b.year_name)),
            customer_wise: Array.from(rcCustomerMap.values())
                .map((r) => ({
                    customer_name: r.customer_name,
                    total_qty: Number(r.total_qty || 0),
                    total_amount: Number((r.total_amount || 0).toFixed(2))
                }))
                .sort((a, b) => b.total_amount - a.total_amount)
        };

        const rentalCountRows = await RentalMachineCount.findAll({
            include: [
                { model: Customer, attributes: ["id", "name"] },
                { model: RentalMachine, attributes: ["id", "machine_id", "serial_no", "page_per_price"] }
            ],
            order: [["createdAt", "DESC"], ["id", "DESC"]]
        });

        const rentalCountMonthMap = new Map();
        rentalCountRows.forEach((row) => {
            const dt = new Date(row.createdAt);
            const monthKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
            const customerName = row.Customer ? row.Customer.name : "Unknown";
            const machineId = row.RentalMachine ? (row.RentalMachine.machine_id || "") : "";
            const serialNo = row.RentalMachine ? (row.RentalMachine.serial_no || "") : "";
            const pagePerPrice = Number((row.RentalMachine && row.RentalMachine.page_per_price) || 0);
            const inputCount = Number(row.input_count || 0);
            const updatedCount = Number(row.updated_count || 0);
            const copiedPages = Math.max(0, updatedCount - inputCount);
            const rowPrice = copiedPages * pagePerPrice;
            const key = `${monthKey}__${customerName}__${machineId}__${serialNo}`;
            if(!rentalCountMonthMap.has(key)){
                rentalCountMonthMap.set(key, {
                    month_name: monthKey,
                    customer_name: customerName,
                    machine_id: machineId,
                    serial_no: serialNo,
                    transactions: 0,
                    latest_updated_count: Number(row.updated_count || 0),
                    latest_entry_at: row.createdAt,
                    total_price: 0
                });
            }
            const r = rentalCountMonthMap.get(key);
            r.transactions += 1;
            r.total_price += rowPrice;
            if(new Date(row.createdAt).getTime() >= new Date(r.latest_entry_at).getTime()){
                r.latest_updated_count = Number(row.updated_count || 0);
                r.latest_entry_at = row.createdAt;
            }
        });

        const rentalCountMonthWise = Array.from(rentalCountMonthMap.values())
            .map((r) => ({
                month_name: r.month_name,
                customer_name: r.customer_name,
                machine_id: r.machine_id,
                serial_no: r.serial_no,
                transactions: Number(r.transactions || 0),
                latest_updated_count: Number(r.latest_updated_count || 0),
                total_price: Number((r.total_price || 0).toFixed(2)),
                latest_entry_at: r.latest_entry_at
            }))
            .sort((a, b) => {
                const m = a.month_name.localeCompare(b.month_name);
                if(m !== 0) return m;
                const c = a.customer_name.localeCompare(b.customer_name);
                if(c !== 0) return c;
                return a.machine_id.localeCompare(b.machine_id);
            });

        res.json({
            summary_by_period: summaryByPeriod,
            month_expense_rows: monthExpenseRows,
            technician_monthly: technicianMonthly,
            sold_product_selling_price_by_period: soldProductSellingPriceByPeriod,
            vendor_dealer_price_by_period: vendorDealerPriceByPeriod,
            vendor_dealer_details_by_period: vendorDealerDetailsByPeriod,
            rental_consumables: rentalConsumables,
            rental_count_month_wise: rentalCountMonthWise
        });
    }catch(err){
        res.status(500).json({ message: err.message || "Failed to load finance overview." });
    }
};
