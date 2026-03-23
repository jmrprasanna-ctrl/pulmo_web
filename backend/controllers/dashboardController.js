const User = require("../models/User");
const Product = require("../models/Product");
const RentalMachine = require("../models/RentalMachine");
const Customer = require("../models/Customer");
const Vendor = require("../models/Vendor");
const Invoice = require("../models/Invoice");
const InvoiceItem = require("../models/InvoiceItem");
const Expense = require("../models/Expense");
const RentalMachineCount = require("../models/RentalMachineCount");
const { Op } = require("sequelize");

function sumTechnicianPaid(rows){
    return (Array.isArray(rows) ? rows : []).reduce((sum, inv) => {
        const total = Number(inv.total_amount || 0);
        const pct = Number(inv.support_technician_percentage || 0);
        if(!Number.isFinite(total) || !Number.isFinite(pct) || pct <= 0) return sum;
        return sum + (total * pct / 100);
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

exports.getSummary = async (req,res)=>{
    try{
        const period = String(req.query.period || "day").toLowerCase();
        const dateStr = req.query.date;
        const baseDate = dateStr ? new Date(dateStr) : new Date();
        if(isNaN(baseDate.getTime())){
            return res.status(400).json({ message: "Invalid date" });
        }

        let periodStart = new Date(baseDate);
        let periodEnd = new Date(baseDate);

        if(period === "week"){
            const day = periodStart.getDay(); // 0=Sun
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

        const totalUsers = await User.count();
        const totalRentalMachines = await RentalMachine.count();
        const totalProducts = await Product.count();
        const totalCustomers = await Customer.count();
        const totalVendors = await Vendor.count();
        const totalSalesPeriod = await Invoice.sum("total_amount",{
            where:{ invoice_date:{ [Op.between]:[periodStart, periodEnd] } }
        }) || 0;
        const totalExpensesPeriod = await Expense.sum("amount",{
            where:{ date:{ [Op.between]:[periodStart, periodEnd] } }
        }) || 0;
        // Match Finance > Payments source: only General customer invoices.
        const receivedPaymentPeriod = await Invoice.sum("total_amount",{
            include: [getGeneralCustomerInclude()],
            where:{
                invoice_date:{ [Op.between]:[periodStart, periodEnd] },
                payment_status: getReceivedPaymentStatusFilter()
            }
        }) || 0;
        const invoicesPeriod = await Invoice.findAll({
            include: [getGeneralCustomerInclude()],
            where:{
                invoice_date:{ [Op.between]:[periodStart, periodEnd] },
                payment_status: getReceivedPaymentStatusFilter()
            },
            attributes:["total_amount","support_technician_percentage"]
        });
        const technicianPaidPeriod = sumTechnicianPaid(invoicesPeriod);
        const invoiceItemsPeriod = await InvoiceItem.findAll({
            include: [
                {
                    model: Invoice,
                    required: true,
                    attributes: ["id", "invoice_date", "payment_status"],
                    where: {
                        invoice_date: { [Op.between]: [periodStart, periodEnd] },
                        payment_status: getReceivedPaymentStatusFilter()
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
            where: { createdAt: { [Op.between]: [periodStart, periodEnd] } },
            attributes: ["input_count", "updated_count"]
        });
        const rentalMachinesCountsPricePeriod = sumRentalCountPrice(rentalCountsPeriodRows);

        const totalSalesAllTime = await Invoice.sum("total_amount") || 0;
        const totalExpensesAllTime = await Expense.sum("amount") || 0;
        const receivedPaymentAllTime = await Invoice.sum("total_amount", {
            include: [getGeneralCustomerInclude()],
            where: {
                payment_status: getReceivedPaymentStatusFilter()
            }
        }) || 0;
        const invoicesAllTime = await Invoice.findAll({
            include: [getGeneralCustomerInclude()],
            where: {
                payment_status: getReceivedPaymentStatusFilter()
            },
            attributes:["total_amount","support_technician_percentage"]
        });
        const technicianPaidAllTime = sumTechnicianPaid(invoicesAllTime);
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

        // Low stock alerts (<5 items)
        const lowStock = await Product.findAll({
            where:{ count:{ [Op.lt]:5 } },
            attributes:["product_id","description","count"]
        });

        // Monthly sales & profit charts
        const months = [];
        const monthlySales = [];
        const monthlyProfit = [];
        const currentYear = new Date().getFullYear();

        for(let m=0;m<12;m++){
            const start = new Date(currentYear,m,1);
            const end = new Date(currentYear,m+1,0);

            const salesInvoices = await Invoice.findAll({
                where:{ invoice_date:{ [Op.between]:[start,end] } },
                include:[InvoiceItem]
            });

            let monthSales = 0;
            let monthProfit = 0;
            salesInvoices.forEach(inv=>{
                monthSales += inv.total_amount;
                const technicianPaid = (Number(inv.total_amount || 0) * Number(inv.support_technician_percentage || 0)) / 100;
                monthProfit += inv.total_amount - inv.InvoiceItems.reduce((a,b)=>a+b.gross,0) - technicianPaid;
            });
            months.push(start.toLocaleString('default',{month:'short'}));
            monthlySales.push(monthSales);
            monthlyProfit.push(monthProfit);
        }

        res.json({
            totalUsers,
            totalRentalMachines,
            totalProducts,
            totalCustomers,
            totalVendors,
            totalSales: totalSalesPeriod,
            receivedPayment: receivedPaymentPeriod,
            rentalMachinesCountsPrice: rentalMachinesCountsPriceAllTime,
            totalExpenses: totalExpensesPeriod,
            netProfit: netProfitPeriod,
            technicianPaid: technicianPaidPeriod,
            vendorPaid: vendorPaidPeriod,
            totalSalesAllTime,
            receivedPaymentAllTime,
            rentalMachinesCountsPriceAllTime,
            rentalMachinesCountsPriceAllInputs: rentalMachinesCountsPriceAllTime,
            totalExpensesAllTime,
            netProfitAllTime,
            technicianPaidAllTime,
            vendorPaidAllTime,
            totalSalesPeriod,
            receivedPaymentPeriod,
            rentalMachinesCountsPricePeriod,
            totalExpensesPeriod,
            netProfitPeriod,
            technicianPaidPeriod,
            vendorPaidPeriod,
            lowStock,
            months,
            monthlySales,
            monthlyProfit,
            period,
            periodStart,
            periodEnd
        });

    }catch(err){
        console.error(err);
        res.status(500).json({ message:"Failed to get dashboard summary" });
    }
}
