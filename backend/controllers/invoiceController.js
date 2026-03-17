const Invoice = require("../models/Invoice");
const InvoiceItem = require("../models/InvoiceItem");
const InvoiceImportant = require("../models/InvoiceImportant");
const Product = require("../models/Product");
const Customer = require("../models/Customer");
const Sequelize = require("sequelize");
const fs = require("fs");
const path = require("path");
const EmailSetup = require("../models/EmailSetup");
const { sendEmail } = require("../services/emailService");
const Op = Sequelize.Op;

function safeFilePart(value, fallback = "value"){
    const normalized = String(value || "")
        .trim()
        .replace(/[\\/:*?"<>|]/g, "_")
        .replace(/\s+/g, " ");
    return normalized || fallback;
}

function applyTemplate(template, data){
    const raw = String(template || "");
    return raw.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) => {
        const val = data[key];
        if(val === undefined || val === null) return "";
        return String(val);
    });
}

function escapePdfText(value){
    return String(value || "")
        .replace(/\\/g, "\\\\")
        .replace(/\(/g, "\\(")
        .replace(/\)/g, "\\)");
}

function buildBasicPdf(lines){
    const pdfLines = [];
    pdfLines.push("BT");
    pdfLines.push("/F1 12 Tf");
    pdfLines.push("50 760 Td");
    lines.forEach((line, index) => {
        if(index > 0) pdfLines.push("0 -16 Td");
        pdfLines.push(`(${escapePdfText(line)}) Tj`);
    });
    pdfLines.push("ET");
    const contentStream = pdfLines.join("\n");

    const objects = [
        "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
        "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
        "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
        "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
        `5 0 obj\n<< /Length ${Buffer.byteLength(contentStream, "utf8")} >>\nstream\n${contentStream}\nendstream\nendobj\n`
    ];

    let body = "";
    const offsets = [0];
    objects.forEach((obj) => {
        offsets.push(Buffer.byteLength("%PDF-1.4\n" + body, "utf8"));
        body += obj;
    });

    const xrefPos = Buffer.byteLength("%PDF-1.4\n" + body, "utf8");
    const xrefRows = ["0000000000 65535 f "];
    for(let i = 1; i < offsets.length; i += 1){
        xrefRows.push(`${String(offsets[i]).padStart(10, "0")} 00000 n `);
    }
    const xref = `xref\n0 ${offsets.length}\n${xrefRows.join("\n")}\n`;
    const trailer = `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;

    return Buffer.from(`%PDF-1.4\n${body}${xref}${trailer}`, "utf8");
}

function buildInvoicePdfBuffer(invoice, customer, items){
    const createdAt = invoice.createdAt || invoice.invoice_date;
    const formattedDate = createdAt ? new Date(createdAt).toLocaleDateString("en-GB") : "";
    const lines = [
        "INVOICE",
        `Invoice No: ${invoice.invoice_no || ""}`,
        `Date: ${formattedDate}`,
        `Customer: ${customer?.name || ""}`,
        `Customer Email: ${customer?.email || ""}`,
        customer?.address ? `Address: ${customer.address}` : "",
        customer?.tel ? `Tel: ${customer.tel}` : "",
        "",
        "Items:"
    ].filter(Boolean);

    (items || []).forEach((item, idx) => {
        const product = item.Product || {};
        const description = `${product.product_id || ""} ${product.description || product.model || ""}`.trim();
        const row = `${idx + 1}. ${description} | Qty: ${Number(item.qty || 0)} | Rate: ${Number(item.rate || 0).toFixed(2)} | VAT: ${Number(item.vat || 0).toFixed(2)} | Gross: ${Number(item.gross || 0).toFixed(2)}`;
        lines.push(row);
    });

    lines.push("");
    lines.push(`Total Amount: ${Number(invoice.total_amount || 0).toFixed(2)}`);

    return Promise.resolve(buildBasicPdf(lines));
}

function buildQuotation2AdjustedItems(items){
    const entryAdditions = [3000, 2000, 2000, 1000];
    return (items || []).map((item, index) => {
        const qty = Number(item.qty) || 0;
        const rate = Number(item.rate) || 0;
        const vat = Number(item.vat) || 0;
        const productId = String(item?.Product?.product_id || "").trim().toUpperCase();
        const entryAddition = entryAdditions[index] || 0;
        const productAddition = productId === "SV0001" ? 500 : 0;
        const adjustedRate = rate + entryAddition + productAddition;
        const adjustedGross = qty * adjustedRate * (1 + (vat / 100));
        return {
            ...item,
            quotation2_entry_addition: entryAddition,
            quotation2_product_addition: productAddition,
            quotation2_rate: Number(adjustedRate.toFixed(2)),
            quotation2_gross: Number(adjustedGross.toFixed(2))
        };
    });
}

function normalizePaymentMethod(value){
    const raw = String(value || "").trim().toLowerCase();
    if(raw === "cheque") return "Cheque";
    if(raw === "online") return "Online";
    return "Cash";
}

function normalizePaymentStatus(value){
    const raw = String(value || "").trim().toLowerCase();
    if(raw === "received" || raw === "recieved") return "Received";
    return "Pending";
}

exports.listInvoices = async (req,res)=>{
    try{
        const invoices = await Invoice.findAll({
            include:[{ model: Customer, attributes:["id","name","customer_mode"] }],
            order:[["createdAt","DESC"]]
        });
        const rows = invoices.map(inv=>({
            id: inv.id,
            invoice_no: inv.invoice_no,
            customer_id: inv.customer_id,
            customer_name: inv.Customer ? inv.Customer.name : "",
            customer_mode: inv.Customer ? inv.Customer.customer_mode : "",
            total: inv.total_amount,
            invoice_date: inv.createdAt,
            payment_method: inv.payment_method || "Cash",
            cheque_no: inv.cheque_no || "",
            payment_status: inv.payment_status || "Pending"
        }));
        res.json(rows);
    }catch(err){
        console.error(err);
        res.status(500).json({ message: err.message || "Failed to load invoices." });
    }
};

exports.getInvoice = async (req,res)=>{
    const { id } = req.params;
    try{
        const invoice = await Invoice.findByPk(id,{
            include:[
                { model: Customer, attributes:["id","name","address","tel","email"] },
                { model: InvoiceItem, include:[{ model: Product, attributes:["id","product_id","description","model"] }] },
                { model: InvoiceImportant, attributes:["id","line_no","note"] }
            ]
        });
        if(!invoice) return res.status(404).json({ message: "Invoice not found" });
        const raw = invoice.toJSON();
        const normalizedItems = (raw.InvoiceItems || []).map((item) => {
            const qty = Number(item.qty) || 0;
            const rate = Number(item.rate) || 0;
            const vat = Number(item.vat) || 0;
            const gross = Number(item.gross) || 0;
            const lineTotal = qty * rate;
            return {
                ...item,
                qty,
                rate,
                vat,
                gross,
                line_total: Number(lineTotal.toFixed(2))
            };
        });
        const grossTotal = normalizedItems.reduce((sum, item) => sum + (Number(item.gross) || 0), 0);
        const totalAmount = Number(raw.total_amount) || grossTotal;
        const quotation2Items = buildQuotation2AdjustedItems(normalizedItems);
        const quotation2GrossTotal = quotation2Items.reduce(
            (sum, item) => sum + (Number(item.quotation2_gross) || 0),
            0
        );

        res.json({
            ...raw,
            InvoiceItems: normalizedItems,
            quotation2_items: quotation2Items,
            InvoiceImportants: (raw.InvoiceImportants || []).sort((a, b) => (a.line_no || 0) - (b.line_no || 0)),
            print_meta: {
                company_name: "PULMO TECHNOLOGIES",
                company_address: "No 30/1, Muddaragama, Veyangoda",
                company_tel: "0770 3000 80",
                company_email: "pulmotechnologies@gmail.com",
                registration_no: "PV-52810",
                copy_label: "ORIGINAL"
            },
            print_totals: {
                gross_total: Number(grossTotal.toFixed(2)),
                total_amount: Number(totalAmount.toFixed(2))
            },
            quotation2_totals: {
                gross_total: Number(quotation2GrossTotal.toFixed(2)),
                total_amount: Number(quotation2GrossTotal.toFixed(2))
            }
        });
    }catch(err){
        console.error(err);
        res.status(500).json({ message: err.message || "Failed to load invoice." });
    }
};

exports.deleteInvoice = async (req,res)=>{
    const { id } = req.params;
    try{
        const invoice = await Invoice.findByPk(id, { include:[{ model: InvoiceItem }, { model: InvoiceImportant }] });
        if(!invoice) return res.status(404).json({ message: "Invoice not found" });

        for(const item of invoice.InvoiceItems || []){
            const product = await Product.findByPk(item.product_id);
            if(product){
                product.count = (Number(product.count) || 0) + (Number(item.qty) || 0);
                await product.save();
            }
            await InvoiceItem.destroy({ where: { id: item.id } });
        }
        for(const important of invoice.InvoiceImportants || []){
            await InvoiceImportant.destroy({ where: { id: important.id } });
        }
        await Invoice.destroy({ where: { id: invoice.id } });
        res.json({ message: "Invoice deleted" });
    }catch(err){
        console.error(err);
        res.status(500).json({ message: err.message || "Failed to delete invoice." });
    }
};

exports.generateInvoiceNo = async (req,res)=>{
    const year = new Date().getFullYear().toString().slice(-2);
    const lastInvoice = await Invoice.findOne({order:[["createdAt","DESC"]]});
    let num = 1;
    if(lastInvoice && lastInvoice.invoice_no){
        const lastNum = parseInt(lastInvoice.invoice_no.slice(4));
        if(!isNaN(lastNum)) {
            num = lastNum + 1;
        }
    }
    let invoice_no = `${year}INV${num.toString().padStart(4,"0")}`;
    // Ensure uniqueness
    for(let i=0;i<50;i++){
        const exists = await Invoice.findOne({ where: { invoice_no } });
        if(!exists) break;
        num += 1;
        invoice_no = `${year}INV${num.toString().padStart(4,"0")}`;
    }
    res.json({invoice_no});
}

exports.getInvoiceTemplatePdf = async (req,res)=>{
    try{
        const configured = process.env.INVOICE_TEMPLATE_PDF;
        const templatePath = configured && configured.trim()
            ? configured.trim()
            : "D:\\26XX001 PUL1V INVOICE V.pdf";
        const resolved = path.resolve(templatePath);
        if(!fs.existsSync(resolved)){
            return res.status(404).json({
                message: `Invoice template PDF not found at ${resolved}`
            });
        }
        res.setHeader("Content-Type", "application/pdf");
        res.sendFile(resolved);
    }catch(err){
        console.error(err);
        res.status(500).json({ message: err.message || "Failed to load invoice template PDF." });
    }
};

exports.getQuotationTemplatePdf = async (req,res)=>{
    try{
        const configured = process.env.QUOTATION_TEMPLATE_PDF;
        const templatePath = configured && configured.trim()
            ? configured.trim()
            : "D:\\26XX001 PUL1V QUATATION.pdf";
        const resolved = path.resolve(templatePath);
        if(!fs.existsSync(resolved)){
            return res.status(404).json({
                message: `Quotation template PDF not found at ${resolved}`
            });
        }
        res.setHeader("Content-Type", "application/pdf");
        res.sendFile(resolved);
    }catch(err){
        console.error(err);
        res.status(500).json({ message: err.message || "Failed to load quotation template PDF." });
    }
};

exports.getQuotation2TemplatePdf = async (req,res)=>{
    try{
        const configured = process.env.QUOTATION2_TEMPLATE_PDF;
        const templatePath = configured && configured.trim()
            ? configured.trim()
            : "D:\\26XX001 PUL1V QUATATION 2.pdf";
        const resolved = path.resolve(templatePath);
        if(!fs.existsSync(resolved)){
            return res.status(404).json({
                message: `Quotation 2 template PDF not found at ${resolved}`
            });
        }
        res.setHeader("Content-Type", "application/pdf");
        res.sendFile(resolved);
    }catch(err){
        console.error(err);
        res.status(500).json({ message: err.message || "Failed to load quotation 2 template PDF." });
    }
};

exports.getSign1Image = async (req,res)=>{
    try{
        const configured = process.env.INVOICE_SIGN1_IMAGE;
        const defaultPath = path.resolve(__dirname, "../../frontend/assets/images/pulmo-sign-1.png");
        const signPath = configured && configured.trim() ? path.resolve(configured.trim()) : defaultPath;
        if(!fs.existsSync(signPath)){
            return res.status(404).json({ message: `Sign 1 image not found at ${signPath}` });
        }
        res.setHeader("Content-Type", "image/png");
        res.sendFile(signPath);
    }catch(err){
        console.error(err);
        res.status(500).json({ message: err.message || "Failed to load Sign 1 image." });
    }
};

exports.getSignVImage = async (req,res)=>{
    try{
        const configured = process.env.INVOICE_SIGNV_IMAGE;
        const explicitPath = configured && configured.trim() ? path.resolve(configured.trim()) : "";
        const defaultVPath = path.resolve(__dirname, "../../frontend/assets/images/pulmo-sign-v.png");
        const fallbackCPath = path.resolve(__dirname, "../../frontend/assets/images/pulmo-sign-1.png");
        const signPath = [explicitPath, defaultVPath, fallbackCPath].find((p) => p && fs.existsSync(p));
        if(!signPath){
            return res.status(404).json({ message: "Sign V image not found. Expected frontend/assets/images/pulmo-sign-v.png" });
        }
        res.setHeader("Content-Type", "image/png");
        res.sendFile(signPath);
    }catch(err){
        console.error(err);
        res.status(500).json({ message: err.message || "Failed to load Sign V image." });
    }
};

exports.getSeal1Image = async (req,res)=>{
    try{
        const configured = process.env.INVOICE_SEAL1_IMAGE;
        const defaultPath = path.resolve(__dirname, "../../frontend/assets/images/pulmo-seal-1.png");
        const sealPath = configured && configured.trim() ? path.resolve(configured.trim()) : defaultPath;
        if(!fs.existsSync(sealPath)){
            return res.status(404).json({ message: `Seal 1 image not found at ${sealPath}` });
        }
        res.setHeader("Content-Type", "image/png");
        res.sendFile(sealPath);
    }catch(err){
        console.error(err);
        res.status(500).json({ message: err.message || "Failed to load Seal 1 image." });
    }
};

exports.getSealVImage = async (req,res)=>{
    try{
        const configured = process.env.INVOICE_SEALV_IMAGE;
        const explicitPath = configured && configured.trim() ? path.resolve(configured.trim()) : "";
        const defaultVPath = path.resolve(__dirname, "../../frontend/assets/images/pulmo-seal-v.png");
        const fallbackCPath = path.resolve(__dirname, "../../frontend/assets/images/pulmo-seal-1.png");
        const sealPath = [explicitPath, defaultVPath, fallbackCPath].find((p) => p && fs.existsSync(p));
        if(!sealPath){
            return res.status(404).json({ message: "Seal V image not found. Expected frontend/assets/images/pulmo-seal-v.png" });
        }
        res.setHeader("Content-Type", "image/png");
        res.sendFile(sealPath);
    }catch(err){
        console.error(err);
        res.status(500).json({ message: err.message || "Failed to load Seal V image." });
    }
};

exports.createInvoice = async (req,res)=>{
    const { invoice_no, customer_id, items, importants, machine_description, serial_no, machine_count, support_technician, support_technician_percentage, payment_method } = req.body;
    if(!customer_id || !invoice_no || !items || !items.length) {
        return res.status(400).json({message:"Invalid data"});
    }
    try{
        let total_amount = 0;
        for(const item of items){
            const gross = Number(item.gross) || 0;
            total_amount += gross;
        }
        const parsedCount = machine_count === undefined || machine_count === null || machine_count === ""
            ? null
            : Number(machine_count);
        const parsedSupportTechnicianPercentage =
            support_technician_percentage === undefined ||
            support_technician_percentage === null ||
            support_technician_percentage === ""
                ? null
                : Number(support_technician_percentage);
        const invoice = await Invoice.create({
            invoice_no,
            customer_id,
            machine_description: String(machine_description || "").trim() || null,
            serial_no: String(serial_no || "").trim() || null,
            machine_count: Number.isFinite(parsedCount) ? parsedCount : null,
            support_technician: String(support_technician || "").trim() || null,
            support_technician_percentage: Number.isFinite(parsedSupportTechnicianPercentage) ? parsedSupportTechnicianPercentage : null,
            payment_method: normalizePaymentMethod(payment_method),
            payment_status: "Pending",
            cheque_no: null,
            total_amount
        });
        for(const item of items){
            const productId = Number(item.productId);
            if(!productId){
                return res.status(400).json({ message: "Invalid product in invoice items" });
            }
            await InvoiceItem.create({ 
                invoice_id: invoice.id,
                product_id: productId,
                qty: Number(item.qty) || 0,
                rate: Number(item.rate) || 0,
                vat: Number(item.vat) || 0,
                gross: Number(item.gross) || 0
            });
            // Reduce stock
            const product = await Product.findByPk(productId);
            if(product) {
                product.count = product.count - (Number(item.qty) || 0);
                await product.save();
            }
        }
        if(Array.isArray(importants) && importants.length){
            let lineNo = 1;
            for(const rawNote of importants){
                const note = String(rawNote || "").trim();
                if(!note) continue;
                await InvoiceImportant.create({
                    invoice_id: invoice.id,
                    line_no: lineNo,
                    note
                });
                lineNo += 1;
            }
        }
        res.json({message:"Invoice created", invoice});
    }catch(err){
        console.error(err);
        if (err && err.errors && err.errors.length) {
            return res.status(400).json({ message: err.errors[0].message });
        }
        res.status(500).json({message: err.message || "Failed to create invoice"});
    }
}

exports.updateInvoicePayment = async (req,res)=>{
    const { id } = req.params;
    try{
        const invoice = await Invoice.findByPk(id);
        if(!invoice){
            return res.status(404).json({ message: "Invoice not found" });
        }

        const payment_method = normalizePaymentMethod(req.body.payment_method);
        const payment_status = normalizePaymentStatus(req.body.payment_status);
        const cheque_no = payment_method === "Cheque"
            ? String(req.body.cheque_no || "").trim().toUpperCase()
            : null;

        if(payment_method === "Cheque" && !cheque_no){
            return res.status(400).json({ message: "Cheque number is required for cheque payments." });
        }

        await invoice.update({
            payment_method,
            cheque_no,
            payment_status
        });

        res.json({
            message: "Payment updated successfully.",
            invoice: {
                id: invoice.id,
                invoice_no: invoice.invoice_no,
                payment_method: invoice.payment_method,
                cheque_no: invoice.cheque_no,
                payment_status: invoice.payment_status
            }
        });
    }catch(err){
        console.error(err);
        res.status(500).json({ message: err.message || "Failed to update invoice payment." });
    }
};

exports.sendInvoiceEmail = async (req, res) => {
    const { id } = req.params;
    try{
        const invoice = await Invoice.findByPk(id, {
            include: [
                { model: Customer, attributes: ["id", "name", "address", "tel", "email"] },
                { model: InvoiceItem, include: [{ model: Product, attributes: ["id", "product_id", "description", "model"] }] }
            ]
        });
        if(!invoice) return res.status(404).json({ message: "Invoice not found" });

        const customer = invoice.Customer || {};
        const recipient = String(customer.email || "").trim();
        if(!recipient){
            return res.status(400).json({ message: "Customer saved email address is not available." });
        }

        const setup = await EmailSetup.findOne({ order: [["id", "ASC"]] });
        const smtpHost = String(setup?.smtp_host || process.env.SMTP_HOST || "").trim();
        const smtpPort = Number(setup?.smtp_port || process.env.SMTP_PORT || 587);
        const smtpSecure = !!(setup?.smtp_secure || String(process.env.SMTP_SECURE || "").toLowerCase() === "true");
        const smtpUser = String(setup?.smtp_user || process.env.SMTP_USER || "").trim();
        const smtpPass = String(setup?.smtp_pass || process.env.SMTP_PASS || "").trim();

        if(!smtpHost || !smtpUser || !smtpPass){
            return res.status(400).json({
                message: "Email setup is incomplete. Please configure Support > Email Setup first."
            });
        }

        const invoiceNo = safeFilePart(invoice.invoice_no, "invoice");
        const customerName = safeFilePart(customer.name, "customer");
        const pdfFileName = `invoice_${invoiceNo}_${customerName}.pdf`;
        const pdfBuffer = await buildInvoicePdfBuffer(invoice, customer, invoice.InvoiceItems || []);

        const templateData = {
            invoice_no: String(invoice.invoice_no || ""),
            customer_name: String(customer.name || "Customer"),
            total_amount: Number(invoice.total_amount || 0).toFixed(2),
            invoice_date: new Date(invoice.createdAt || Date.now()).toLocaleDateString("en-GB")
        };

        const subjectTemplate = setup?.subject_template || "Invoice {{invoice_no}} - PULMO TECHNOLOGIES";
        const bodyTemplate =
            setup?.body_template ||
            "Dear {{customer_name}},\n\nPlease find attached your invoice {{invoice_no}}.\n\nThank you.\nPULMO TECHNOLOGIES";

        const subject = applyTemplate(subjectTemplate, templateData);
        const textBody = applyTemplate(bodyTemplate, templateData);
        const htmlBody = textBody
            .split("\n")
            .map((line) => line.trim())
            .join("<br>");

        const fromName = String(setup?.from_name || "PULMO TECHNOLOGIES").trim();
        const fromEmail = String(setup?.from_email || process.env.SMTP_FROM || smtpUser).trim();
        const from = fromEmail.includes("<") ? fromEmail : `"${fromName}" <${fromEmail}>`;

        await sendEmail({
            to: recipient,
            subject,
            text: textBody,
            html: htmlBody,
            attachments: [
                {
                    filename: pdfFileName,
                    content: pdfBuffer,
                    contentType: "application/pdf"
                }
            ],
            smtpConfig: {
                host: smtpHost,
                port: smtpPort,
                secure: smtpSecure,
                user: smtpUser,
                pass: smtpPass
            },
            from
        });

        res.json({
            message: `Invoice email sent to ${recipient}`,
            filename: pdfFileName
        });
    }catch(err){
        console.error(err);
        res.status(500).json({ message: err.message || "Failed to send invoice email." });
    }
};
