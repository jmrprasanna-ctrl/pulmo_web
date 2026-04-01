                                       
import pool from '../config/database.js';

   
                                                         
   
export const calculateProfitLoss = async (startDate, endDate) => {
    try {
                      
        const salesResult = await pool.query(
            `SELECT COALESCE(SUM(total),0) AS total_sales
             FROM invoices
             WHERE invoice_date BETWEEN $1 AND $2`,
            [startDate, endDate]
        );
        const totalSales = parseFloat(salesResult.rows[0].total_sales);

                         
        const expenseResult = await pool.query(
            `SELECT COALESCE(SUM(amount),0) AS total_expenses
             FROM expenses
             WHERE expense_date BETWEEN $1 AND $2`,
            [startDate, endDate]
        );
        const totalExpenses = parseFloat(expenseResult.rows[0].total_expenses);

                        
        const profit = totalSales - totalExpenses;

        return {
            totalSales,
            totalExpenses,
            profit
        };
    } catch (err) {
        console.error('Profit calculation error:', err);
        throw err;
    }
};

   
                                                    
   
export const calculateMonthlyProfit = async (year) => {
    try {
        const monthlyData = [];

        for (let month = 1; month <= 12; month++) {
            const startDate = `${year}-${month.toString().padStart(2,'0')}-01`;
            const endDate = new Date(year, month, 0).toISOString().split('T')[0];

            const result = await calculateProfitLoss(startDate, endDate);
            monthlyData.push({
                month,
                totalSales: result.totalSales,
                totalExpenses: result.totalExpenses,
                profit: result.profit
            });
        }

        return monthlyData;
    } catch (err) {
        console.error('Monthly profit calculation error:', err);
        throw err;
    }
};