                                           
import pool from '../config/database.js';
import { sendEmail } from './emailService.js';

export const checkLowStockAndNotify = async () => {
    try {
        const lowStockProducts = await pool.query(
            'SELECT p.id, p.description, s.quantity FROM products p JOIN stock s ON p.id = s.product_id WHERE s.quantity <= 5'
        );

        if (lowStockProducts.rows.length === 0) return;

        const message = lowStockProducts.rows
            .map(p => `Product: ${p.description} | Remaining Stock: ${p.quantity}`)
            .join('\n');

                                      
        await sendEmail({
            to: process.env.ADMIN_EMAIL || 'admin@company.com',
            subject: 'Low Stock Alert',
            text: message
        });

        console.log('Low stock alert sent.');
    } catch (err) {
        console.error('Stock alert error:', err);
    }
};