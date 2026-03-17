const Expense = require("../models/Expense");

exports.getExpenses = async (req,res)=>{
    try{
        const expenses = await Expense.findAll({ order: [["id","DESC"]] });
        res.json(expenses);
    }catch(err){
        res.status(500).json({ message: err.message || "Failed to load expenses." });
    }
};

exports.getExpenseById = async (req,res)=>{
    const { id } = req.params;
    const expense = await Expense.findByPk(id);
    if(!expense){
        return res.status(404).json({ message: "Expense not found." });
    }
    res.json(expense);
};

exports.createExpense = async (req,res)=>{
    try{
        const { title, customer, amount, date, category } = req.body;
        if(!title || amount === undefined || !date || !category){
            return res.status(400).json({ message: "Missing required fields." });
        }
        const created = await Expense.create({
            title,
            customer,
            amount,
            date,
            category
        });
        res.status(201).json(created);
    }catch(err){
        res.status(500).json({ message: err.message || "Failed to add expense." });
    }
};

exports.updateExpense = async (req,res)=>{
    try{
        const { id } = req.params;
        const { title, customer, amount, date, category } = req.body;
        if(!title || amount === undefined || !date || !category){
            return res.status(400).json({ message: "Missing required fields." });
        }
        const expense = await Expense.findByPk(id);
        if(!expense){
            return res.status(404).json({ message: "Expense not found." });
        }
        await expense.update({ title, customer, amount, date, category });
        res.json(expense);
    }catch(err){
        res.status(500).json({ message: err.message || "Failed to update expense." });
    }
};

exports.deleteExpense = async (req,res)=>{
    try{
        const { id } = req.params;
        const expense = await Expense.findByPk(id);
        if(!expense){
            return res.status(404).json({ message: "Expense not found." });
        }
        await expense.destroy();
        res.json({ message: "Expense deleted successfully." });
    }catch(err){
        res.status(500).json({ message: err.message || "Failed to delete expense." });
    }
};
