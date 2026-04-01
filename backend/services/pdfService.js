                                    
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

export const generateInvoicePDF = (invoice, invoiceItems, outputPath) => {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: 'A4', margin: 50 });
            const filePath = path.resolve(outputPath);

            doc.pipe(fs.createWriteStream(filePath));

                     
            doc.fontSize(20).text('INVOICE', { align: 'center' });
            doc.moveDown();
            doc.fontSize(12).text(`Invoice No: ${invoice.invoice_no}`);
            doc.text(`Date: ${new Date(invoice.invoice_date).toLocaleDateString()}`);
            doc.text(`Customer: ${invoice.customer_name}`);
            doc.text(`Email: ${invoice.customer_email}`);
            doc.moveDown();

                           
            doc.text('Items:', { underline: true });
            doc.moveDown(0.5);

            invoiceItems.forEach((item, index) => {
                doc.text(
                    `${index + 1}. ${item.description} | Qty: ${item.quantity} | Price: ${item.price} | Total: ${item.total}`
                );
            });

            doc.moveDown();
            doc.text(`Subtotal: ${invoice.subtotal}`);
            doc.text(`Total: ${invoice.total}`, { bold: true });

            doc.end();
            resolve(filePath);
        } catch (err) {
            reject(err);
        }
    });
};