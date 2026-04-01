const { Op } = require("sequelize");
const Invoice = require("../models/Invoice");
const InvoiceItem = require("../models/InvoiceItem");
const Customer = require("../models/Customer");
const Expense = require("../models/Expense");
const Product = require("../models/Product");
const Vendor = require("../models/Vendor");
const Category = require("../models/Category");
const Technician = require("../models/Technician");
const RentalMachineConsumable = require("../models/RentalMachineConsumable");
const RentalMachine = require("../models/RentalMachine");
const RentalMachineCount = require("../models/RentalMachineCount");
const Sequelize = require("sequelize");

function classifyVendorSource(vendorName){
    const name = String(vendorName || "").trim().toLowerCase();
    if(!name) return "VENDER";
    if(name.includes("pulmo")) return "PULMO";
    if(name.includes("other")) return "OTHER";
    return "VENDER";
}

function normalizeTechnicianPercentage(rawValue){
    const raw = Number(rawValue || 0);
    if(!Number.isFinite(raw)) return 0;
    return Math.min(Math.max(raw, 0), 100);
}

function sumVendorProductValueFromInvoiceItems(items){
    return (Array.isArray(items) ? items : []).reduce((sum, item) => {
        const qty = Number(item?.qty || 0);
        const dealer = Number(item?.Product?.dealer_price || 0);
        if(!Number.isFinite(qty) || !Number.isFinite(dealer) || qty <= 0 || dealer <= 0){
            return sum;
        }
        return sum + (qty * dealer);
    }, 0);
}

function computeTechnicianPayableAmount(totalAmount, vendorProductValue, percentage){
    const total = Number(totalAmount || 0);
    const vendor = Number(vendorProductValue || 0);
    const pct = normalizeTechnicianPercentage(percentage);
    if(!Number.isFinite(total) || !Number.isFinite(vendor) || !Number.isFinite(pct) || pct <= 0){
        return 0;
    }
    const balance = Math.max(total - vendor, 0);
    return balance * (pct / 100);
}

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
        const where = range ? { invoice_date: { [Op.between]: [range.start, range.end] } } : {};

        const invoices = await Invoice.findAll({
            where,
            include:[Customer],
            order:[["invoice_date","DESC"],["createdAt","DESC"]]
        });
        const rows = invoices.map(inv=>({
            id: inv.id,
            invoice_id: inv.id,
            invoice_no: inv.invoice_no,
            customer_name: inv.Customer ? inv.Customer.name : "",
            date: inv.invoice_date || inv.createdAt,
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
                where:{ invoice_date:{ [Op.between]:[start,end] } }
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
        const monthToken = String(req.query.month || "").trim().toLowerCase();
        const isFullYear = monthToken === "all" || monthToken === "0";
        const month = Number(req.query.month) || (now.getMonth() + 1);
        const safeMonth = Math.min(Math.max(month, 1), 12);
        const technicianFilterRaw = String(req.query.technician || "").trim();

        const start = isFullYear
            ? new Date(year, 0, 1, 0, 0, 0, 0)
            : new Date(year, safeMonth - 1, 1, 0, 0, 0, 0);
        const end = isFullYear
            ? new Date(year, 11, 31, 23, 59, 59, 999)
            : new Date(year, safeMonth, 0, 23, 59, 59, 999);

        const baseWhere = {
            invoice_date: { [Op.between]: [start, end] },
            support_technician: { [Op.not]: null }
        };

        const technicianRows = await Technician.findAll({
            attributes: ["technician_name"],
            order: [["technician_name", "ASC"]],
            raw: true
        });
        const technicians = technicianRows
            .map((r) => String(r.technician_name || "").trim())
            .filter(Boolean)
            .filter((name, index, arr) => arr.indexOf(name) === index)
            .sort((a, b) => a.localeCompare(b));

        const where = { ...baseWhere };
        if(technicianFilterRaw){
            where[Op.and] = [
                Sequelize.where(
                    Sequelize.fn("LOWER", Sequelize.col("support_technician")),
                    technicianFilterRaw.toLowerCase()
                )
            ];
        }

        const invoices = await Invoice.findAll({
            where,
            include: [
                { model: Customer, attributes: ["id", "name"] },
                {
                    model: InvoiceItem,
                    attributes: ["qty"],
                    required: false,
                    include: [{ model: Product, attributes: ["dealer_price"], required: false }]
                }
            ],
            order: [["invoice_date", "DESC"], ["createdAt", "DESC"]]
        });

        const normalized = invoices
            .filter((inv) => String(inv.support_technician || "").trim())
            .map((inv) => ({
                technician_percentage: normalizeTechnicianPercentage(inv.support_technician_percentage),
                id: inv.id,
                invoice_no: inv.invoice_no,
                technician: String(inv.support_technician || "").trim(),
                customer_name: inv.Customer ? inv.Customer.name : "",
                date: inv.invoice_date || inv.createdAt,
                total_amount: Number(inv.total_amount || 0),
                vendor_product_value: Number(sumVendorProductValueFromInvoiceItems(inv.InvoiceItems || []).toFixed(2))
            }))
            .map((row) => ({
                ...row,
                balance_amount: Number(Math.max(Number(row.total_amount || 0) - Number(row.vendor_product_value || 0), 0).toFixed(2)),
                allocated_amount: Number(computeTechnicianPayableAmount(row.total_amount, row.vendor_product_value, row.technician_percentage).toFixed(2))
            }));

        const grouped = new Map();
        normalized.forEach((row) => {
            if(!grouped.has(row.technician)){
                grouped.set(row.technician, {
                    technician: row.technician,
                    invoices_count: 0,
                    total_invoice_amount: 0,
                    allocated_amount: 0,
                    total_percentage: 0
                });
            }
            const g = grouped.get(row.technician);
            g.invoices_count += 1;
            g.total_invoice_amount += Number(row.total_amount || 0);
            g.allocated_amount += Number(row.allocated_amount || 0);
            g.total_percentage += Number(row.technician_percentage || 0);
        });

        const summary = Array.from(grouped.values())
            .map((g) => ({
                technician: g.technician,
                invoices_count: g.invoices_count,
                total_invoice_amount: Number(g.total_invoice_amount.toFixed(2)),
                allocated_amount: Number(g.allocated_amount.toFixed(2)),
                average_percentage: Number((g.invoices_count ? (g.total_percentage / g.invoices_count) : 0).toFixed(2)),
                                                                             
                total_amount: Number(g.allocated_amount.toFixed(2))
            }))
            .sort((a, b) => b.invoices_count - a.invoices_count);

        res.json({
            year,
            month: isFullYear ? "all" : safeMonth,
            period: isFullYear ? "year" : "month",
            technician: technicianFilterRaw || "",
            technicians,
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
        const vendorId = Number(req.query.vendor_id);
        const where = {
                                                                                                           
            count: { [Op.lt]: min }
        };
        if(Number.isFinite(vendorId) && vendorId > 0){
            where.vendor_id = vendorId;
        }
        const products = await Product.findAll({
            where,
            include: [
                { model: Category, attributes: ["id", "name"] },
                { model: Vendor, attributes: ["id", "name"] }
            ],
            order: [["count", "ASC"], ["product_id", "ASC"]]
        });
        res.json({
            min,
            vendor_id: Number.isFinite(vendorId) && vendorId > 0 ? vendorId : null,
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

exports.stockProductsReport = async (req,res)=>{
    try{
        const vendorId = Number(req.query.vendor_id);
        const where = {};
        if(Number.isFinite(vendorId) && vendorId > 0){
            where.vendor_id = vendorId;
        }
        const products = await Product.findAll({
            where,
            include: [
                { model: Category, attributes: ["id", "name"] },
                { model: Vendor, attributes: ["id", "name"] }
            ],
            order: [["product_id", "ASC"]]
        });
        res.json({
            vendor_id: Number.isFinite(vendorId) && vendorId > 0 ? vendorId : null,
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
        res.status(500).json({ message: err.message || "Failed to load stock products report." });
    }
};

exports.outOfStockReport = async (req,res)=>{
    try{
        const source = String(req.query.source || "ALL").trim().toUpperCase();
        const vendorId = Number(req.query.vendor_id);
        const where = {
            count: { [Op.lte]: 0 }
        };
        if(Number.isFinite(vendorId) && vendorId > 0){
            where.vendor_id = vendorId;
        }
        const products = await Product.findAll({
            where,
            include: [
                { model: Category, attributes: ["id", "name"] },
                { model: Vendor, attributes: ["id", "name"] }
            ],
            order: [["product_id", "ASC"]]
        });
        const filtered = products.filter((p) => {
            if(source === "ALL") return true;
            const src = classifyVendorSource(p?.Vendor?.name);
            return src === source;
        });
        res.json({
            source,
            vendor_id: Number.isFinite(vendorId) && vendorId > 0 ? vendorId : null,
            total: filtered.length,
            rows: filtered.map((p) => ({
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
            ]
        });

        const rows = products.map((p) => ({
            id: p.id,
            vendor: p.Vendor ? p.Vendor.name : "Unassigned",
            product_id: p.product_id,
            description: p.description,
            model: p.model,
            category: p.Category ? p.Category.name : "",
            count: Number(p.count || 0)
        }))
        .sort((a, b) => {
            const vendorCmp = String(a.vendor || "").localeCompare(String(b.vendor || ""));
            if(vendorCmp !== 0) return vendorCmp;
            return String(a.product_id || "").localeCompare(String(b.product_id || ""));
        });

        res.json({ total: rows.length, rows });
    }catch(err){
        res.status(500).json({ message: err.message || "Failed to load vendor-wise product report." });
    }
};

exports.rentalConsumablesMachineCustomerReport = async (req,res)=>{
    try{
        const customerId = Number(req.query.customer_id);
        const requestedYear = Number(req.query.year || 0);
        const monthToken = String(req.query.month || "").trim().toLowerCase();
        const isAllMonths = monthToken === "all" || monthToken === "0";
        const requestedMonth = Number(req.query.month || 0);
        const now = new Date();
        const safeYear = Number.isFinite(requestedYear) && requestedYear >= 2000 && requestedYear <= 9999
            ? requestedYear
            : now.getFullYear();
        const safeMonth = Number.isFinite(requestedMonth) && requestedMonth >= 1 && requestedMonth <= 12
            ? requestedMonth
            : (now.getMonth() + 1);

        const startDate = isAllMonths
            ? new Date(safeYear, 0, 1, 0, 0, 0, 0)
            : new Date(safeYear, safeMonth - 1, 1, 0, 0, 0, 0);
        const endDate = isAllMonths
            ? new Date(safeYear, 11, 31, 23, 59, 59, 999)
            : new Date(safeYear, safeMonth, 0, 23, 59, 59, 999);
        const startDateText = startDate.toISOString().slice(0, 10);
        const endDateText = endDate.toISOString().slice(0, 10);

        const where = {};
        if(Number.isFinite(customerId) && customerId > 0){
            where.customer_id = customerId;
        }
        where[Op.or] = [
            { entry_date: { [Op.between]: [startDateText, endDateText] } },
            {
                entry_date: { [Op.is]: null },
                createdAt: { [Op.between]: [startDate, endDate] }
            }
        ];
        const consumables = await RentalMachineConsumable.findAll({
            where,
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

        res.json({
            customer_id: Number.isFinite(customerId) && customerId > 0 ? customerId : null,
            year: safeYear,
            month: isAllMonths ? "all" : safeMonth,
            period: isAllMonths ? "year" : "month",
            total: rows.length,
            rows
        });
    }catch(err){
        res.status(500).json({ message: err.message || "Failed to load rental consumables report." });
    }
};

exports.rentalCountMachineCustomerReport = async (req,res)=>{
    try{
        const rentalMachineId = Number(req.query.rental_machine_id);
        const customerId = Number(req.query.customer_id);
        const requestedYear = Number(req.query.year || 0);
        const monthToken = String(req.query.month || "").trim().toLowerCase();
        const isAllMonths = monthToken === "all" || monthToken === "0";
        const requestedMonth = Number(req.query.month || 0);
        const now = new Date();
        const safeYear = Number.isFinite(requestedYear) && requestedYear >= 2000 && requestedYear <= 9999
            ? requestedYear
            : now.getFullYear();
        const safeMonth = Number.isFinite(requestedMonth) && requestedMonth >= 1 && requestedMonth <= 12
            ? requestedMonth
            : (now.getMonth() + 1);
        const startDate = isAllMonths
            ? new Date(safeYear, 0, 1, 0, 0, 0, 0)
            : new Date(safeYear, safeMonth - 1, 1, 0, 0, 0, 0);
        const endDate = isAllMonths
            ? new Date(safeYear, 11, 31, 23, 59, 59, 999)
            : new Date(safeYear, safeMonth, 0, 23, 59, 59, 999);
        const startDateText = startDate.toISOString().slice(0, 10);
        const endDateText = endDate.toISOString().slice(0, 10);

        const where = {};
        if(Number.isFinite(rentalMachineId) && rentalMachineId > 0){
            where.rental_machine_id = rentalMachineId;
        }
        if(Number.isFinite(customerId) && customerId > 0){
            where.customer_id = customerId;
        }
        where[Op.or] = [
            { entry_date: { [Op.between]: [startDateText, endDateText] } },
            {
                entry_date: { [Op.is]: null },
                createdAt: { [Op.between]: [startDate, endDate] }
            }
        ];
        const counts = await RentalMachineCount.findAll({
            where,
            include: [
                { model: Customer, attributes: ["id", "name"] },
                { model: RentalMachine, attributes: ["id", "machine_id", "model", "serial_no", "start_count", "updated_count", "page_per_price"] }
            ],
            order: [["createdAt", "DESC"], ["id", "DESC"]]
        });

        if(Number.isFinite(customerId) && customerId > 0){
            const detailedRows = counts.map((row) => {
                const machine = row.RentalMachine || null;
                const inputCount = Number(row.input_count || 0);
                const updatedCount = Number(row.updated_count || 0);
                const copiedPages = Math.max(updatedCount - inputCount, 0);
                const pagePrice = Number((machine && machine.page_per_price) || 0);
                const price = copiedPages * pagePrice;
                return {
                    id: row.id,
                    customer_id: Number((row.Customer && row.Customer.id) || row.customer_id || 0),
                    customer_name: row.Customer ? row.Customer.name : "",
                    machine_id: machine ? String(machine.machine_id || "") : "",
                    machine_model: machine ? String(machine.model || "") : "",
                    serial_no: machine ? String(machine.serial_no || "") : "",
                    transaction_id: row.transaction_id || "",
                    input_count: inputCount,
                    updated_count: updatedCount,
                    copied_pages: copiedPages,
                    page_per_price: Number(pagePrice.toFixed(4)),
                    price: Number(price.toFixed(2)),
                    entry_at: row.entry_date || row.createdAt
                };
            });

            return res.json({
                mode: "detailed",
                rental_machine_id: Number.isFinite(rentalMachineId) && rentalMachineId > 0 ? rentalMachineId : null,
                customer_id: customerId,
                year: safeYear,
                month: isAllMonths ? "all" : safeMonth,
                period: isAllMonths ? "year" : "month",
                total: detailedRows.length,
                rows: detailedRows
            });
        }

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
                    total_transactions: 0,
                    total_price: 0
                });
            }

            const g = grouped.get(key);
            g.total_transactions += 1;
            const inputCount = Number(row.input_count || 0);
            const updatedCount = Number(row.updated_count || 0);
            const copiedPages = Math.max(updatedCount - inputCount, 0);
            const pagePrice = Number((machine && machine.page_per_price) || 0);
            const rowPrice = copiedPages * pagePrice;
            g.total_price += rowPrice;
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
            })
            .map((r) => ({
                ...r,
                total_price: Number((r.total_price || 0).toFixed(2))
            }));

        res.json({
            mode: "grouped",
            rental_machine_id: Number.isFinite(rentalMachineId) && rentalMachineId > 0 ? rentalMachineId : null,
            customer_id: Number.isFinite(customerId) && customerId > 0 ? customerId : null,
            year: safeYear,
            month: isAllMonths ? "all" : safeMonth,
            period: isAllMonths ? "year" : "month",
            total: rows.length,
            rows
        });
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
            attributes: ["id", "invoice_no", "invoice_date", "customer_id", "serial_no", "machine_description", "machine_count", "total_amount", "createdAt"],
            order: [["invoice_date", "DESC"], ["createdAt", "DESC"]]
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
                latest_invoice_date: latestInvoice ? (latestInvoice.invoice_date || latestInvoice.createdAt) : null,
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

exports.pendingInvoicesByYear = async (req, res) => {
    try{
        const nowYear = new Date().getFullYear();
        const rawYear = String(req.query.year || "").trim();
        const parsedYear = Number.parseInt(rawYear, 10);
        const year = Number.isInteger(parsedYear) && parsedYear >= 2000 && parsedYear <= 9999 ? parsedYear : nowYear;

        const start = `${year}-01-01`;
        const end = `${year}-12-31`;
        const customerMode = String(req.query.customerMode || "").trim().toLowerCase();

        const where = {
            invoice_date: { [Op.between]: [start, end] },
            [Op.or]: [
                { payment_status: { [Op.is]: null } },
                { payment_status: { [Op.ne]: "Received" } }
            ]
        };

        const include = [{
            model: Customer,
            required: false,
            attributes: ["id", "name", "customer_mode"]
        }];

        if(customerMode){
            include[0].where = { customer_mode: customerMode };
        }

        const invoices = await Invoice.findAll({
            where,
            include,
            order: [["invoice_date", "DESC"], ["createdAt", "DESC"], ["id", "DESC"]]
        });

        const rows = invoices.map((inv) => ({
            id: inv.id,
            invoice_no: inv.invoice_no || "",
            invoice_date: inv.invoice_date || inv.createdAt || null,
            customer_name: inv.Customer ? (inv.Customer.name || "") : "",
            customer_mode: inv.Customer ? (inv.Customer.customer_mode || "") : "",
            total_amount: Number(inv.total_amount || 0),
            payment_method: inv.payment_method || "Cash",
            cheque_no: inv.cheque_no || "",
            payment_status: inv.payment_status || "Pending",
            payment_date: inv.payment_date || null
        }));

        const total_pending_amount = rows.reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
        res.json({
            year,
            customer_mode: customerMode || "all",
            count: rows.length,
            total_pending_amount: Number(total_pending_amount.toFixed(2)),
            rows
        });
    }catch(err){
        res.status(500).json({ message: err.message || "Failed to load pending invoices." });
    }
};

exports.financeOverview = async (req,res)=>{
    try{
        const rawExpenseYear = Number(req.query.expenseYear || 0);
        const rawExpenseMonthParam = String(req.query.expenseMonth || "").trim().toLowerCase();
        const rawExpenseMonth = Number(rawExpenseMonthParam || 0);
        const hasValidExpenseYear = Number.isFinite(rawExpenseYear) && rawExpenseYear >= 2000 && rawExpenseYear <= 9999;
        const hasValidExpenseMonth = Number.isFinite(rawExpenseMonth) && rawExpenseMonth >= 1 && rawExpenseMonth <= 12;
        const isAllExpenseMonths = rawExpenseMonthParam === "all";
        let baseDateForPeriods = req.query.date;
        if(hasValidExpenseYear){
            const m = hasValidExpenseMonth
                ? rawExpenseMonth
                : (new Date().getMonth() + 1);
            baseDateForPeriods = `${rawExpenseYear}-${String(m).padStart(2, "0")}-01`;
        }

        const { week, month, year } = getPeriods(baseDateForPeriods);
        const periods = { week, month, year };
        const periodKeys = ["week", "month", "year"];

        const summaryByPeriod = {};
        for(const key of periodKeys){
            const range = periods[key];
            const sales = Number(await Invoice.sum("total_amount", {
                where: { invoice_date: { [Op.between]: [range.start, range.end] } }
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

        const expenseRange = (hasValidExpenseYear && isAllExpenseMonths)
            ? {
                start: `${rawExpenseYear}-01-01`,
                end: `${rawExpenseYear}-12-31`
            }
            : {
                start: month.start,
                end: month.end
            };

        const monthExpenseRowsRaw = await Expense.findAll({
            where: { date: { [Op.between]: [expenseRange.start, expenseRange.end] } },
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
                        attributes: ["id", "invoice_date"],
                        where: { invoice_date: { [Op.between]: [range.start, range.end] } }
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
            const dateSource = row.entry_date || row.createdAt;
            const date = new Date(dateSource);
            if(Number.isNaN(date.getTime())) return;
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

        res.json({
            summary_by_period: summaryByPeriod,
            month_expense_rows: monthExpenseRows,
            sold_product_selling_price_by_period: soldProductSellingPriceByPeriod,
            vendor_dealer_price_by_period: vendorDealerPriceByPeriod,
            vendor_dealer_details_by_period: vendorDealerDetailsByPeriod,
            rental_consumables: rentalConsumables
        });
    }catch(err){
        res.status(500).json({ message: err.message || "Failed to load finance overview." });
    }
};
