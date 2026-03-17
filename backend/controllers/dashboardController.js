const User = require("../models/User");
const Product = require("../models/Product");
const RentalMachine = require("../models/RentalMachine");
const Customer = require("../models/Customer");
const Vendor = require("../models/Vendor");
const Invoice = require("../models/Invoice");
const InvoiceItem = require("../models/InvoiceItem");
const Expense = require("../models/Expense");
const { Op } = require("sequelize");

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
            where:{ createdAt:{ [Op.between]:[periodStart, periodEnd] } }
        }) || 0;
        const totalExpensesPeriod = await Expense.sum("amount",{
            where:{ date:{ [Op.between]:[periodStart, periodEnd] } }
        }) || 0;
        const netProfitPeriod = totalSalesPeriod - totalExpensesPeriod;

        const totalSalesAllTime = await Invoice.sum("total_amount") || 0;
        const totalExpensesAllTime = await Expense.sum("amount") || 0;
        const netProfitAllTime = totalSalesAllTime - totalExpensesAllTime;

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
                where:{ createdAt:{ [Op.between]:[start,end] } },
                include:[InvoiceItem]
            });

            let monthSales = 0;
            let monthProfit = 0;
            salesInvoices.forEach(inv=>{
                monthSales += inv.total_amount;
                monthProfit += inv.total_amount - inv.InvoiceItems.reduce((a,b)=>a+b.gross,0);
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
            totalExpenses: totalExpensesPeriod,
            netProfit: netProfitPeriod,
            totalSalesAllTime,
            totalExpensesAllTime,
            netProfitAllTime,
            totalSalesPeriod,
            totalExpensesPeriod,
            netProfitPeriod,
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
