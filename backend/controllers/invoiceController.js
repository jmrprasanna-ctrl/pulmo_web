const Invoice = require("../models/Invoice");
const InvoiceItem = require("../models/InvoiceItem");
const InvoiceImportant = require("../models/InvoiceImportant");
const Product = require("../models/Product");
const Customer = require("../models/Customer");
const Sequelize = require("sequelize");
const fs = require("fs");
const path = require("path");
const db = require("../config/database");
const EmailSetup = require("../models/EmailSetup");
const UiSetting = require("../models/UiSetting");
const { sendEmail } = require("../services/emailService");
const Op = Sequelize.Op;
const ALLOWED_WARRANTY_PERIODS = new Set(["3 month", "6 month", "1 year", "2 year"]);
const USER_PREF_TABLE = "user_preference_settings";
const ensuredUserPrefTableByDb = new Set();
const INVENTORY_DB_NAME = "inventory";

function normalizeWarrantyPeriod(value){
    const raw = String(value || "").trim().toLowerCase();
    if(ALLOWED_WARRANTY_PERIODS.has(raw)) return raw;
    return "";
}

function extractWarrantyPeriodFromText(noteText){
    const text = String(noteText || "").toLowerCase();
    if(!text) return "";
    if(/\b3\s*month\b/.test(text)) return "3 month";
    if(/\b6\s*month\b/.test(text)) return "6 month";
    if(/\b1\s*year\b/.test(text)) return "1 year";
    if(/\b2\s*year\b/.test(text)) return "2 year";
    return "";
}

function calculateWarrantyExpiryDate(invoiceDate, warrantyPeriod){
    const period = normalizeWarrantyPeriod(warrantyPeriod);
    const value = String(invoiceDate || "").trim();
    if(!period || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(`${value}T00:00:00`);
    if(Number.isNaN(date.getTime())) return null;
    if(period === "3 month"){
        date.setMonth(date.getMonth() + 3);
    }else if(period === "6 month"){
        date.setMonth(date.getMonth() + 6);
    }else if(period === "1 year"){
        date.setFullYear(date.getFullYear() + 1);
    }else if(period === "2 year"){
        date.setFullYear(date.getFullYear() + 2);
    }
    return date.toISOString().slice(0, 10);
}

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
    const invoiceDateValue = invoice.invoice_date || invoice.createdAt;
    const formattedDate = invoiceDateValue ? new Date(invoiceDateValue).toLocaleDateString("en-GB") : "";
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

async function resolveTemplatePath(req, dbColumn, envVariableName, defaultPath){
    let dbPath = "";
    const userPath = await resolveUserPreferencePath(req, dbColumn).catch(() => "");
    if(userPath){
        dbPath = userPath;
    }else{
        try{
            const row = await UiSetting.findOne({ order: [["id", "ASC"]], attributes: [dbColumn] });
            dbPath = String(row?.[dbColumn] || "").trim();
        }catch(_err){
            dbPath = "";
        }
    }

    const envPath = String(process.env[envVariableName] || "").trim();
    const fallbackPath = String(defaultPath || "").trim();
    const candidates = [dbPath, envPath, fallbackPath].filter(Boolean);

    for(const candidate of candidates){
        const resolved = path.resolve(candidate);
        if(fs.existsSync(resolved)){
            return resolved;
        }
    }

    return path.resolve(candidates[0] || fallbackPath);
}

async function resolveImagePath(req, dbColumn, envVariableName, defaultPath, fallbackPath = ""){
    let dbPath = "";
    const userPath = await resolveUserPreferencePath(req, dbColumn).catch(() => "");
    if(userPath){
        dbPath = userPath;
    }else{
        try{
            const row = await UiSetting.findOne({ order: [["id", "ASC"]], attributes: [dbColumn] });
            dbPath = String(row?.[dbColumn] || "").trim();
        }catch(_err){
            dbPath = "";
        }
    }

    const envPath = String(process.env[envVariableName] || "").trim();
    const baseDefault = String(defaultPath || "").trim();
    const baseFallback = String(fallbackPath || "").trim();
    const candidates = [dbPath, envPath, baseDefault, baseFallback].filter(Boolean);

    for(const candidate of candidates){
        const resolved = path.resolve(candidate);
        if(fs.existsSync(resolved)){
            return resolved;
        }
    }

    return path.resolve(candidates[0] || baseDefault || baseFallback);
}

async function ensureUserPreferenceTableForCurrentDb() {
    const activeDb = String(db.getCurrentDatabase ? db.getCurrentDatabase() : "").trim().toLowerCase() || "inventory";
    if (ensuredUserPrefTableByDb.has(activeDb)) return;
    await db.query(`
        CREATE TABLE IF NOT EXISTS ${USER_PREF_TABLE} (
            id SERIAL PRIMARY KEY,
            user_id INTEGER UNIQUE NOT NULL,
            logo_path VARCHAR(500),
            invoice_template_pdf_path VARCHAR(500),
            quotation_template_pdf_path VARCHAR(500),
            quotation2_template_pdf_path VARCHAR(500),
            quotation3_template_pdf_path VARCHAR(500),
            sign_c_path VARCHAR(500),
            sign_v_path VARCHAR(500),
            seal_c_path VARCHAR(500),
            seal_v_path VARCHAR(500),
            primary_color VARCHAR(24),
            background_color VARCHAR(24),
            button_color VARCHAR(24),
            mode_theme VARCHAR(16),
            "createdAt" TIMESTAMP DEFAULT NOW(),
            "updatedAt" TIMESTAMP DEFAULT NOW()
        );
    `);
    ensuredUserPrefTableByDb.add(activeDb);
}

async function resolveUserPreferencePath(req, columnName) {
    const userId = Number(req?.user?.id || req?.user?.userId || 0);
    if (!Number.isFinite(userId) || userId <= 0) return "";
    await ensureUserPreferenceTableForCurrentDb();
    const rs = await db.query(
        `SELECT ${columnName} AS path FROM ${USER_PREF_TABLE} WHERE user_id = $1 LIMIT 1`,
        { bind: [userId] }
    );
    const rows = Array.isArray(rs?.[0]) ? rs[0] : [];
    return String(rows[0]?.path || "").trim();
}

function getImageMimeType(filePath){
    const ext = path.extname(String(filePath || "").toLowerCase());
    if(ext === ".gif") return "image/gif";
    if(ext === ".bmp") return "image/bmp";
    if(ext === ".png") return "image/png";
    return "image/jpeg";
}

function isSmtpAuthFailure(err){
    const msg = String(err?.message || "").toLowerCase();
    return msg.includes("authentication failed") || msg.includes("gmail smtp authentication failed") || msg.includes("badcredentials") || msg.includes("(535)");
}

function buildSmtpPayload(setup){
    const smtpHost = String(setup?.smtp_host || process.env.SMTP_HOST || "").trim();
    const smtpPort = Number(setup?.smtp_port || process.env.SMTP_PORT || 587);
    const smtpSecure = !!(setup?.smtp_secure || String(process.env.SMTP_SECURE || "").toLowerCase() === "true");
    const smtpUser = String(setup?.smtp_user || process.env.SMTP_USER || "").trim();
    const smtpPass = String(setup?.smtp_pass || process.env.SMTP_PASS || "").trim();
    const fromName = String(setup?.from_name || "PULMO TECHNOLOGIES").trim();
    const fromEmail = String(setup?.from_email || process.env.SMTP_FROM || smtpUser).trim();
    const from = fromEmail.includes("<") ? fromEmail : `"${fromName}" <${fromEmail}>`;

    return {
        smtpConfig: {
            host: smtpHost,
            port: smtpPort,
            secure: smtpSecure,
            user: smtpUser,
            pass: smtpPass
        },
        from
    };
}

function hasSmtpConfig(payload){
    const cfg = payload?.smtpConfig || {};
    return !!String(cfg.host || "").trim() && !!String(cfg.user || "").trim() && !!String(cfg.pass || "").trim();
}

function smtpSignature(payload){
    const cfg = payload?.smtpConfig || {};
    return [
        String(cfg.host || "").trim().toLowerCase(),
        String(cfg.port || ""),
        String(cfg.secure || ""),
        String(cfg.user || "").trim().toLowerCase(),
        String(cfg.pass || "").trim()
    ].join("|");
}

exports.listInvoices = async (req,res)=>{
    try{
        const invoices = await Invoice.findAll({
            include:[{ model: Customer, attributes:["id","name","customer_mode"] }],
            order:[["invoice_date","DESC"],["createdAt","DESC"]]
        });
        const rows = invoices.map(inv=>({
            id: inv.id,
            invoice_no: inv.invoice_no,
            customer_id: inv.customer_id,
            customer_name: inv.Customer ? inv.Customer.name : "",
            customer_mode: inv.Customer ? inv.Customer.customer_mode : "",
            total: inv.total_amount,
            invoice_date: inv.invoice_date || inv.createdAt,
            payment_date: inv.payment_date || null,
            quotation_date: inv.quotation_date || inv.invoice_date || inv.createdAt,
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
                { model: InvoiceImportant, attributes:["id","line_no","note","warranty_period","warranty_expiry_date"] }
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
    const lastInvoice = await Invoice.findOne({order:[["invoice_date","DESC"],["createdAt","DESC"]]});
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
        const resolved = await resolveTemplatePath(
            req,
            "invoice_template_pdf_path",
            "INVOICE_TEMPLATE_PDF",
            "D:\\26XX001 PUL1V INVOICE V.pdf"
        );
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
        const resolved = await resolveTemplatePath(
            req,
            "quotation_template_pdf_path",
            "QUOTATION_TEMPLATE_PDF",
            "D:\\26XX001 PUL1V QUATATION.pdf"
        );
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
        const resolved = await resolveTemplatePath(
            req,
            "quotation2_template_pdf_path",
            "QUOTATION2_TEMPLATE_PDF",
            "D:\\26XX001 PUL1V QUATATION 2.pdf"
        );
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
        const signPath = await resolveImagePath(
            req,
            "sign_c_path",
            "INVOICE_SIGN1_IMAGE",
            path.resolve(__dirname, "../../frontend/assets/images/pulmo-sign-1.png")
        );
        if(!fs.existsSync(signPath)){
            return res.status(404).json({ message: `Sign 1 image not found at ${signPath}` });
        }
        res.setHeader("Content-Type", getImageMimeType(signPath));
        res.sendFile(signPath);
    }catch(err){
        console.error(err);
        res.status(500).json({ message: err.message || "Failed to load Sign 1 image." });
    }
};

exports.getSignVImage = async (req,res)=>{
    try{
        const signPath = await resolveImagePath(
            req,
            "sign_v_path",
            "INVOICE_SIGNV_IMAGE",
            path.resolve(__dirname, "../../frontend/assets/images/pulmo-sign-v.png"),
            path.resolve(__dirname, "../../frontend/assets/images/pulmo-sign-1.png")
        );
        if(!signPath){
            return res.status(404).json({ message: "Sign V image not found. Expected frontend/assets/images/pulmo-sign-v.png" });
        }
        res.setHeader("Content-Type", getImageMimeType(signPath));
        res.sendFile(signPath);
    }catch(err){
        console.error(err);
        res.status(500).json({ message: err.message || "Failed to load Sign V image." });
    }
};

exports.getSeal1Image = async (req,res)=>{
    try{
        const sealPath = await resolveImagePath(
            req,
            "seal_c_path",
            "INVOICE_SEAL1_IMAGE",
            path.resolve(__dirname, "../../frontend/assets/images/pulmo-seal-1.png")
        );
        if(!fs.existsSync(sealPath)){
            return res.status(404).json({ message: `Seal 1 image not found at ${sealPath}` });
        }
        res.setHeader("Content-Type", getImageMimeType(sealPath));
        res.sendFile(sealPath);
    }catch(err){
        console.error(err);
        res.status(500).json({ message: err.message || "Failed to load Seal 1 image." });
    }
};

exports.getSealVImage = async (req,res)=>{
    try{
        const sealPath = await resolveImagePath(
            req,
            "seal_v_path",
            "INVOICE_SEALV_IMAGE",
            path.resolve(__dirname, "../../frontend/assets/images/pulmo-seal-v.png"),
            path.resolve(__dirname, "../../frontend/assets/images/pulmo-seal-1.png")
        );
        if(!sealPath){
            return res.status(404).json({ message: "Seal V image not found. Expected frontend/assets/images/pulmo-seal-v.png" });
        }
        res.setHeader("Content-Type", getImageMimeType(sealPath));
        res.sendFile(sealPath);
    }catch(err){
        console.error(err);
        res.status(500).json({ message: err.message || "Failed to load Seal V image." });
    }
};

exports.createInvoice = async (req,res)=>{
    const { invoice_no, invoice_date, quotation_date, customer_id, items, importants, machine_description, serial_no, machine_count, support_technician, support_technician_percentage, payment_method } = req.body;
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
        const parsedInvoiceDate = String(invoice_date || "").trim();
        const invoiceDateValue = parsedInvoiceDate || new Date().toISOString().slice(0, 10);
        const isValidInvoiceDate = /^\d{4}-\d{2}-\d{2}$/.test(invoiceDateValue) && !Number.isNaN(new Date(`${invoiceDateValue}T00:00:00`).getTime());
        if(!isValidInvoiceDate){
            return res.status(400).json({ message: "Invalid invoice date." });
        }
        const parsedQuotationDate = String(quotation_date || "").trim();
        const quotationDateValue = parsedQuotationDate || invoiceDateValue;
        const isValidQuotationDate = /^\d{4}-\d{2}-\d{2}$/.test(quotationDateValue) && !Number.isNaN(new Date(`${quotationDateValue}T00:00:00`).getTime());
        if(!isValidQuotationDate){
            return res.status(400).json({ message: "Invalid quotation date." });
        }
        const invoice = await Invoice.create({
            invoice_no,
            invoice_date: invoiceDateValue,
            quotation_date: quotationDateValue,
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
                const rawValue = rawNote && typeof rawNote === "object" ? rawNote.note : rawNote;
                const note = String(rawValue || "").trim();
                if(!note) continue;
                const explicitWarranty = rawNote && typeof rawNote === "object"
                    ? normalizeWarrantyPeriod(rawNote.warranty_period)
                    : "";
                const detectedWarranty = extractWarrantyPeriodFromText(note);
                const warrantyPeriod = explicitWarranty || detectedWarranty || null;
                const warrantyExpiryDate = warrantyPeriod
                    ? calculateWarrantyExpiryDate(invoiceDateValue, warrantyPeriod)
                    : null;
                await InvoiceImportant.create({
                    invoice_id: invoice.id,
                    line_no: lineNo,
                    note,
                    warranty_period: warrantyPeriod,
                    warranty_expiry_date: warrantyExpiryDate
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

exports.listWarrantyInvoices = async (_req, res) => {
    try{
        const invoices = await Invoice.findAll({
            include: [
                { model: Customer, attributes: ["id","name"] },
                { model: InvoiceImportant, attributes: ["id","note","warranty_period","warranty_expiry_date"] }
            ],
            order:[["invoice_date","DESC"],["createdAt","DESC"]]
        });

        const rows = [];
        const todayIso = new Date().toISOString().slice(0, 10);
        invoices.forEach((inv) => {
            const importants = Array.isArray(inv.InvoiceImportants) ? inv.InvoiceImportants : [];
            const periodToExpiry = new Map();
            importants.forEach((imp) => {
                const explicit = normalizeWarrantyPeriod(imp.warranty_period);
                const detected = extractWarrantyPeriodFromText(imp.note);
                const period = explicit || detected;
                if(period){
                    const expiry = String(
                        imp.warranty_expiry_date
                        || calculateWarrantyExpiryDate(inv.invoice_date || inv.createdAt, period)
                        || ""
                    ).slice(0, 10);
                    if(!expiry || expiry >= todayIso){
                        const previous = periodToExpiry.get(period);
                        if(!previous || expiry > previous){
                            periodToExpiry.set(period, expiry);
                        }
                    }
                }
            });

            periodToExpiry.forEach((expiry, period) => {
                rows.push({
                    invoice_id: inv.id,
                    invoice_no: inv.invoice_no,
                    invoice_date: inv.invoice_date || inv.createdAt,
                    customer_name: inv.Customer ? inv.Customer.name : "",
                    total: Number(inv.total_amount || 0),
                    payment_status: inv.payment_status || "Pending",
                    warranty_period: period,
                    warranty_expiry_date: expiry || null
                });
            });
        });

        const rank = { "3 month": 1, "6 month": 2, "1 year": 3, "2 year": 4 };
        rows.sort((a, b) => {
            const p = (rank[a.warranty_period] || 99) - (rank[b.warranty_period] || 99);
            if(p !== 0) return p;
            return new Date(b.invoice_date || 0) - new Date(a.invoice_date || 0);
        });

        res.json(rows);
    }catch(err){
        console.error(err);
        res.status(500).json({ message: err.message || "Failed to load warranty invoices." });
    }
};

exports.getQuotation3TemplatePdf = async (req,res)=>{
    try{
        const resolved = await resolveTemplatePath(
            req,
            "quotation3_template_pdf_path",
            "QUOTATION3_TEMPLATE_PDF",
            "D:\\26XX001 PUL1V QUATATION 3.pdf"
        );
        if(!fs.existsSync(resolved)){
            return res.status(404).json({
                message: `Quotation 3 template PDF not found at ${resolved}`
            });
        }
        res.setHeader("Content-Type", "application/pdf");
        res.sendFile(resolved);
    }catch(err){
        console.error(err);
        res.status(500).json({ message: err.message || "Failed to load quotation 3 template PDF." });
    }
};

exports.updateInvoicePayment = async (req,res)=>{
    const { id } = req.params;
    try{
        const invoice = await Invoice.findByPk(id);
        if(!invoice){
            return res.status(404).json({ message: "Invoice not found" });
        }

        let payment_method = invoice.payment_method || "Cash";
        if(req.body.payment_method !== undefined){
            payment_method = normalizePaymentMethod(req.body.payment_method);
        }

        let payment_status = invoice.payment_status || "Pending";
        if(req.body.payment_status !== undefined){
            payment_status = normalizePaymentStatus(req.body.payment_status);
        }

        let cheque_no = invoice.cheque_no ? String(invoice.cheque_no).trim().toUpperCase() : null;
        if(payment_method === "Cheque"){
            if(req.body.cheque_no !== undefined){
                cheque_no = String(req.body.cheque_no || "").trim().toUpperCase() || null;
            }
        }else{
            cheque_no = null;
        }

        if(payment_method === "Cheque" && !cheque_no){
            return res.status(400).json({ message: "Cheque number is required for cheque payments." });
        }

        let invoice_date = invoice.invoice_date;
        if(req.body.invoice_date !== undefined){
            const parsedInvoiceDate = String(req.body.invoice_date || "").trim();
            const isValidInvoiceDate = /^\d{4}-\d{2}-\d{2}$/.test(parsedInvoiceDate) && !Number.isNaN(new Date(`${parsedInvoiceDate}T00:00:00`).getTime());
            if(!isValidInvoiceDate){
                return res.status(400).json({ message: "Invalid invoice date." });
            }
            invoice_date = parsedInvoiceDate;
        }
        let payment_date = invoice.payment_date || null;
        if(req.body.payment_date !== undefined){
            const parsedPaymentDate = String(req.body.payment_date || "").trim();
            if(parsedPaymentDate){
                const isValidPaymentDate = /^\d{4}-\d{2}-\d{2}$/.test(parsedPaymentDate) && !Number.isNaN(new Date(`${parsedPaymentDate}T00:00:00`).getTime());
                if(!isValidPaymentDate){
                    return res.status(400).json({ message: "Invalid payment date." });
                }
                payment_date = parsedPaymentDate;
            }else{
                payment_date = null;
            }
        }

        await invoice.update({
            payment_method,
            cheque_no,
            payment_status,
            invoice_date,
            payment_date
        });

        if(req.body.invoice_date !== undefined){
            const importants = await InvoiceImportant.findAll({ where: { invoice_id: invoice.id } });
            for(const imp of importants){
                const period = normalizeWarrantyPeriod(imp.warranty_period) || extractWarrantyPeriodFromText(imp.note);
                const expiry = period ? calculateWarrantyExpiryDate(invoice_date, period) : null;
                await imp.update({
                    warranty_period: period || null,
                    warranty_expiry_date: expiry
                });
            }
        }

        res.json({
            message: "Payment updated successfully.",
            invoice: {
                id: invoice.id,
                invoice_no: invoice.invoice_no,
                invoice_date: invoice.invoice_date,
                payment_date: invoice.payment_date,
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

exports.deleteInvoicePayment = async (req,res)=>{
    const { id } = req.params;
    try{
        const invoice = await Invoice.findByPk(id);
        if(!invoice){
            return res.status(404).json({ message: "Invoice not found" });
        }

        await invoice.update({
            payment_method: "Cash",
            cheque_no: null,
            payment_status: "Pending",
            payment_date: null
        });

        res.json({
            message: "Payment data deleted successfully.",
            invoice: {
                id: invoice.id,
                invoice_no: invoice.invoice_no,
                payment_date: invoice.payment_date,
                payment_method: invoice.payment_method,
                cheque_no: invoice.cheque_no,
                payment_status: invoice.payment_status
            }
        });
    }catch(err){
        console.error(err);
        res.status(500).json({ message: err.message || "Failed to delete payment data." });
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

        const currentDbName = String(db.getCurrentDatabase ? db.getCurrentDatabase() : "").trim().toLowerCase() || INVENTORY_DB_NAME;
        const currentSetup = await EmailSetup.findOne({ order: [["id", "ASC"]] });
        const inventorySetup = currentDbName === INVENTORY_DB_NAME
            ? currentSetup
            : await db.withDatabase(INVENTORY_DB_NAME, async () => EmailSetup.findOne({ order: [["id", "ASC"]] }));

        const smtpCandidates = [];
        const seen = new Set();
        [currentSetup, inventorySetup, null].forEach((setupRow) => {
            const payload = buildSmtpPayload(setupRow);
            if(!hasSmtpConfig(payload)) return;
            const key = smtpSignature(payload);
            if(seen.has(key)) return;
            seen.add(key);
            smtpCandidates.push({
                setup: setupRow,
                smtpConfig: payload.smtpConfig,
                from: payload.from
            });
        });

        if(!smtpCandidates.length){
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
            invoice_date: new Date(invoice.invoice_date || invoice.createdAt || Date.now()).toLocaleDateString("en-GB")
        };

        const templateSetup = currentSetup || inventorySetup || null;
        const subjectTemplate = templateSetup?.subject_template || "Invoice {{invoice_no}} - PULMO TECHNOLOGIES";
        const bodyTemplate =
            templateSetup?.body_template ||
            "Dear {{customer_name}},\n\nPlease find attached your invoice {{invoice_no}}.\n\nThank you.\nPULMO TECHNOLOGIES";

        const subject = applyTemplate(subjectTemplate, templateData);
        const textBody = applyTemplate(bodyTemplate, templateData);
        const htmlBody = textBody
            .split("\n")
            .map((line) => line.trim())
            .join("<br>");

        let lastAuthError = null;
        let sent = false;
        for(const candidate of smtpCandidates){
            try{
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
                    smtpConfig: candidate.smtpConfig,
                    from: candidate.from
                });
                sent = true;
                break;
            }catch(sendErr){
                if(isSmtpAuthFailure(sendErr)){
                    lastAuthError = sendErr;
                    continue;
                }
                throw sendErr;
            }
        }
        if(!sent){
            throw lastAuthError || new Error("Failed to send invoice email.");
        }

        res.json({
            message: `Invoice email sent to ${recipient}`,
            filename: pdfFileName
        });
    }catch(err){
        console.error(err);
        res.status(500).json({ message: err.message || "Failed to send invoice email." });
    }
};
