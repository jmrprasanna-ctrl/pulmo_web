// backend/config/mail.js
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

const transporter = nodemailer.createTransport({
    service: 'gmail', // you can use any email service
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

transporter.verify((error, success) => {
    if (error) {
        console.error('❌ Email service error:', error);
    } else {
        console.log('✅ Email service is ready to send messages');
    }
});

export default transporter;