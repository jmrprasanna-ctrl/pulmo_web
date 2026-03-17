const { Op } = require("sequelize");
const Invoice = require("../models/Invoice");
const Expense = require("../models/Expense");

exports.salesChart = async (req,res)=>{
    try{
        const rows = [];
        const currentYear = new Date().getFullYear();
        for(let m=0;m<12;m++){
            const start = new Date(currentYear,m,1);
            const end = new Date(currentYear,m+1,0,23,59,59,999);
            const total_sales = await Invoice.sum("total_amount",{
                where:{ createdAt:{ [Op.between]:[start,end] } }
            }) || 0;
            rows.push({
                month: start.toLocaleString("default",{month:"short"}),
                total_sales
            });
        }
        res.json(rows);
    }catch(err){
        res.status(500).json({ message: err.message || "Failed to load sales chart." });
    }
};

exports.profitChart = async (req,res)=>{
    try{
        const rows = [];
        const currentYear = new Date().getFullYear();
        for(let m=0;m<12;m++){
            const start = new Date(currentYear,m,1);
            const end = new Date(currentYear,m+1,0,23,59,59,999);
            const total_sales = await Invoice.sum("total_amount",{
                where:{ createdAt:{ [Op.between]:[start,end] } }
            }) || 0;
            const total_expenses = await Expense.sum("amount",{
                where:{ date:{ [Op.between]:[start,end] } }
            }) || 0;
            rows.push({
                month: start.toLocaleString("default",{month:"short"}),
                net_profit: total_sales - total_expenses
            });
        }
        res.json(rows);
    }catch(err){
        res.status(500).json({ message: err.message || "Failed to load profit chart." });
    }
};
