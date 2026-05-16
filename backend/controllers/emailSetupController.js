const EmailSetup = require("../models/EmailSetup");
const db = require("../config/database");
const { sendEmail } = require("../services/emailService");
const Product = require("../models/Product");
const Vendor = require("../models/Vendor");
const SupportTechPay = require("../models/SupportTechPay");
const Invoice = require("../models/Invoice");
const Customer = require("../models/Customer");
const authController = require("./authController");

function buildDefaults(mappedProfile = {}){
  const companyName = String(mappedProfile.company_name || "").trim() || "PULMO TECHNOLOGIES";
  const companyEmail = String(mappedProfile.email || "").trim().toLowerCase() || "";
  return {
    smtp_user: companyEmail || null,
    from_name: companyName,
    from_email: companyEmail || null,
    subject_template: `Invoice {{invoice_no}} - ${companyName}`,
    body_template: `Dear {{customer_name}},\n\nPlease find attached your invoice {{invoice_no}}.\n\nThank you.\n${companyName}`
  };
}

function applyMappedCompanyBranding(setupLike = {}, mappedProfile = {}) {
  const companyName = String(mappedProfile.company_name || "").trim();
  const companyEmail = String(mappedProfile.email || "").trim().toLowerCase();
  const src = setupLike && typeof setupLike.toJSON === "function" ? setupLike.toJSON() : { ...(setupLike || {}) };
  if(!companyName){
    return src;
  }
  const branded = { ...src };
  branded.from_name = companyName;
  branded.subject_template = `Invoice {{invoice_no}} - ${companyName}`;
  if(companyEmail){
    branded.from_email = companyEmail;
    branded.smtp_user = companyEmail;
  }
  return branded;
}

async function resolveMappedProfile(req){
  const userId = Number(req?.user?.id || req?.user?.userId || 0);
  if(!Number.isFinite(userId) || userId <= 0){
    return {};
  }
  try{
    return await db.withDatabase("inventory", async () => {
      const rs = await db.query(
        `SELECT cp.company_name, COALESCE(NULLIF(TRIM(um.mapped_email), ''), cp.email) AS email
         FROM user_mappings um
         JOIN company_profiles cp ON cp.id = um.company_profile_id
         WHERE um.user_id = $1
         LIMIT 1`,
        { bind: [userId] }
      );
      const rows = Array.isArray(rs?.[0]) ? rs[0] : [];
      if(!rows.length) return {};
      return {
        company_name: String(rows[0]?.company_name || "").trim(),
        email: String(rows[0]?.email || "").trim().toLowerCase(),
      };
    });
  }catch(_err){
    return {};
  }
}

function normalizeBody(body = {}, defaults = {}){
  const smtpHost = String(body.smtp_host || "").trim() || null;
  const smtpUser = String(body.smtp_user || defaults.smtp_user || "").trim() || null;
  let smtpPass = String(body.smtp_pass || "").trim() || null;
  const isGmail = String(smtpHost || "").toLowerCase().includes("gmail.com")
    || String(smtpUser || "").toLowerCase().endsWith("@gmail.com")
    || String(smtpUser || "").toLowerCase().endsWith("@googlemail.com");
  if(smtpPass && isGmail){
    smtpPass = smtpPass.replace(/\s+/g, "");
  }
  return {
    smtp_host: smtpHost,
    smtp_port: Number(body.smtp_port || 587),
    smtp_secure: !!body.smtp_secure,
    smtp_user: smtpUser,
    smtp_pass: smtpPass,
    from_name: String(body.from_name || defaults.from_name || "").trim() || "PULMO TECHNOLOGIES",
    from_email: String(body.from_email || defaults.from_email || "").trim() || null,
    subject_template: String(body.subject_template || defaults.subject_template || "").trim() || "Invoice {{invoice_no}} - PULMO TECHNOLOGIES",
    body_template:
      String(body.body_template || "").trim() ||
      String(defaults.body_template || "").trim() ||
      "Dear {{customer_name}},\n\nPlease find attached your invoice {{invoice_no}}.\n\nThank you.\nPULMO TECHNOLOGIES"
  };
}

function buildSmtpPayload(setup){
  const smtpHost = String(setup?.smtp_host || "").trim();
  const smtpPort = Number(setup?.smtp_port || 587);
  const smtpSecure = !!setup?.smtp_secure;
  const smtpUser = String(setup?.smtp_user || "").trim();
  const smtpPass = String(setup?.smtp_pass || "").trim();
  const fromName = String(setup?.from_name || "PULMO TECHNOLOGIES").trim() || "PULMO TECHNOLOGIES";
  const fromEmail = String(setup?.from_email || smtpUser || "").trim();
  const from = fromEmail ? `"${fromName}" <${fromEmail}>` : `"${fromName}" <noreply@company.com>`;
  return {
    smtpConfig: {
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      user: smtpUser,
      pass: smtpPass,
    },
    from,
  };
}

function hasSmtpConfig(payload){
  const cfg = payload?.smtpConfig || {};
  return !!String(cfg.host || "").trim() && !!String(cfg.user || "").trim() && !!String(cfg.pass || "").trim();
}

exports.getEmailSetup = async (req, res) => {
  try{
    if(actionType === "forgot_password"){
      return authController.forgotPassword({ body: { email: toEmail } }, res);
    }

    const mappedProfile = await resolveMappedProfile(req);
    const defaults = buildDefaults(mappedProfile);
    let row = await EmailSetup.findOne({ order: [["id", "ASC"]] });
    if(!row){
      row = await EmailSetup.create({
        smtp_user: defaults.smtp_user,
        from_name: defaults.from_name,
        from_email: defaults.from_email,
        subject_template: defaults.subject_template,
        body_template: defaults.body_template
      });
    }
    const brandedDbPayload = applyMappedCompanyBranding(row, mappedProfile);
    if(
      row &&
      (
        String(row.from_name || "") !== String(brandedDbPayload.from_name || "") ||
        String(row.subject_template || "") !== String(brandedDbPayload.subject_template || "") ||
        String(row.from_email || "") !== String(brandedDbPayload.from_email || "") ||
        String(row.smtp_user || "") !== String(brandedDbPayload.smtp_user || "")
      )
    ){
      await row.update({
        from_name: brandedDbPayload.from_name || row.from_name,
        subject_template: brandedDbPayload.subject_template || row.subject_template,
        from_email: brandedDbPayload.from_email || row.from_email,
        smtp_user: brandedDbPayload.smtp_user || row.smtp_user
      });
      row = await EmailSetup.findByPk(row.id);
    }
    const json = row.toJSON();
    const brandedJson = applyMappedCompanyBranding(json, mappedProfile);
    Object.assign(json, brandedJson);
    if(!String(json.smtp_user || "").trim() && defaults.smtp_user){
      json.smtp_user = defaults.smtp_user;
    }
    if(!String(json.from_name || "").trim() && defaults.from_name){
      json.from_name = defaults.from_name;
    }
    if(!String(json.from_email || "").trim() && defaults.from_email){
      json.from_email = defaults.from_email;
    }
    if(!String(json.subject_template || "").trim() && defaults.subject_template){
      json.subject_template = defaults.subject_template;
    }
    if(!String(json.body_template || "").trim() && defaults.body_template){
      json.body_template = defaults.body_template;
    }
    json.has_smtp_pass = !!String(json.smtp_pass || "").trim();
    json.smtp_pass = "";
    json.mapped_company_name = String(mappedProfile.company_name || "").trim() || null;
    json.mapped_company_email = String(mappedProfile.email || "").trim().toLowerCase() || null;
    res.json(json);
  }catch(err){
    console.error(err);
    res.status(500).json({ message: err.message || "Failed to load email setup." });
  }
};

exports.saveEmailSetup = async (req, res) => {
  try{
    const mappedProfile = await resolveMappedProfile(req);
    const defaults = buildDefaults(mappedProfile);
    const payload = applyMappedCompanyBranding(normalizeBody(req.body || {}, defaults), mappedProfile);
    let row = await EmailSetup.findOne({ order: [["id", "ASC"]] });

    const normalizedHost = String(payload.smtp_host || "").toLowerCase();
    const normalizedUser = String(payload.smtp_user || "").toLowerCase();
    const isGmail = normalizedHost.includes("gmail.com")
      || normalizedUser.endsWith("@gmail.com")
      || normalizedUser.endsWith("@googlemail.com");
    const enteredPass = String(payload.smtp_pass || "");
    const existingPass = String(row?.smtp_pass || "");
    const activePass = enteredPass || existingPass;
    if(isGmail && activePass){
      const normalizedPass = activePass.replace(/\s+/g, "");
      if(normalizedPass.length !== 16){
        return res.status(400).json({
          message: `Gmail App Password must be exactly 16 characters. Current length: ${normalizedPass.length}.`
        });
      }
      payload.smtp_pass = enteredPass ? normalizedPass : payload.smtp_pass;
    }

    if(!row){
      row = await EmailSetup.create(payload);
    }else{
      const updatePayload = { ...payload };
      if(!String(req.body.smtp_pass || "").trim()){
        delete updatePayload.smtp_pass;
      }
      await row.update(updatePayload);
      row = await EmailSetup.findByPk(row.id);
    }
    const json = row.toJSON();
    const brandedJson = applyMappedCompanyBranding(json, mappedProfile);
    Object.assign(json, brandedJson);
    if(!String(json.smtp_user || "").trim() && defaults.smtp_user){
      json.smtp_user = defaults.smtp_user;
    }
    if(!String(json.from_name || "").trim() && defaults.from_name){
      json.from_name = defaults.from_name;
    }
    if(!String(json.from_email || "").trim() && defaults.from_email){
      json.from_email = defaults.from_email;
    }
    if(!String(json.subject_template || "").trim() && defaults.subject_template){
      json.subject_template = defaults.subject_template;
    }
    if(!String(json.body_template || "").trim() && defaults.body_template){
      json.body_template = defaults.body_template;
    }
    json.has_smtp_pass = !!String(json.smtp_pass || "").trim();
    json.smtp_pass = "";
    json.mapped_company_name = String(mappedProfile.company_name || "").trim() || null;
    json.mapped_company_email = String(mappedProfile.email || "").trim().toLowerCase() || null;
    res.json({ message: "Email setup saved.", setup: json });
  }catch(err){
    console.error(err);
    res.status(500).json({ message: err.message || "Failed to save email setup." });
  }
};

exports.sendEmailAction = async (req, res) => {
  const actionType = String(req.body?.action_type || "").trim().toLowerCase();
  const toEmail = String(req.body?.to_email || "").trim();
  const invoiceId = Number(req.body?.invoice_id || 0);
  if(!actionType){
    return res.status(400).json({ message: "Action type is required." });
  }
  if(!toEmail){
    return res.status(400).json({ message: "Recipient email is required." });
  }

  try{
    const mappedProfile = await resolveMappedProfile(req);
    const defaults = buildDefaults(mappedProfile);
    let row = await EmailSetup.findOne({ order: [["id", "ASC"]] });
    if(!row){
      row = await EmailSetup.create({
        smtp_user: defaults.smtp_user,
        from_name: defaults.from_name,
        from_email: defaults.from_email,
        subject_template: defaults.subject_template,
        body_template: defaults.body_template
      });
    }
    const setup = applyMappedCompanyBranding(row.toJSON(), mappedProfile);
    const smtpPayload = buildSmtpPayload(setup);
    if(!hasSmtpConfig(smtpPayload)){
      return res.status(400).json({ message: "Email setup is incomplete. Please configure SMTP first." });
    }

    if(actionType === "invoice" || actionType === "quotation"){
      return res.status(400).json({
        message: "Invoice/Quotation email is already available from the Invoice page send-email action."
      });
    }

    if(actionType === "support_technician"){
      if(!Number.isFinite(invoiceId) || invoiceId <= 0){
        return res.status(400).json({ message: "Invoice ID is required for Support Technician email." });
      }
      const invoice = await Invoice.findByPk(invoiceId, {
        include: [{ model: Customer, attributes: ["id", "name"] }]
      });
      if(!invoice){
        return res.status(404).json({ message: "Invoice not found." });
      }
      const payment = await SupportTechPay.findOne({ where: { invoice_id: invoiceId } });
      if(!payment){
        return res.status(404).json({ message: "Support technician payment record not found for this invoice." });
      }
      const csv = [
        "Invoice No,Invoice Date,Customer,Support Technician,Total Amount,Vendor Pay,Support Tech Pay,Payment Method,Payment Status,Paid At",
        [
          String(invoice.invoice_no || ""),
          String(invoice.invoice_date || "").slice(0, 10),
          String(invoice.Customer?.name || ""),
          String(invoice.support_technician || ""),
          Number(invoice.total_amount || 0).toFixed(2),
          Number(payment.vendor_pay_amount || 0).toFixed(2),
          Number(payment.support_tech_pay_amount || 0).toFixed(2),
          String(payment.payment_method || ""),
          String(payment.payment_status || ""),
          String(payment.paid_at || "").slice(0, 10)
        ].map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")
      ].join("\n");

      await sendEmail({
        to: toEmail,
        subject: `Support Technician Payment Detail - ${invoice.invoice_no || "Invoice"}`,
        text: `Please find attached support technician payment detail for invoice ${invoice.invoice_no || invoiceId}.`,
        html: `Please find attached support technician payment detail for invoice <b>${String(invoice.invoice_no || invoiceId)}</b>.`,
        attachments: [{
          filename: `support_technician_payment_${String(invoice.invoice_no || invoiceId)}.csv`,
          content: Buffer.from(csv, "utf8"),
          contentType: "text/csv"
        }],
        smtpConfig: smtpPayload.smtpConfig,
        from: smtpPayload.from
      });

      return res.json({ message: "Support technician payment detail email sent." });
    }

    if(actionType === "vendor"){
      const rows = await Product.findAll({
        include: [{ model: Vendor, attributes: ["id", "name"] }],
        order: [["id", "ASC"]]
      });
      const lowStockRows = (rows || []).filter((row) => Number(row.count || 0) <= 1);
      if(!lowStockRows.length){
        return res.status(400).json({ message: "No stock items with count <= 1 found." });
      }
      const csvLines = [
        "Product ID,Description,Model,Vendor,Stock Count,Category ID"
      ];
      lowStockRows.forEach((row) => {
        csvLines.push([
          String(row.product_id || ""),
          String(row.description || ""),
          String(row.model || ""),
          String(row.Vendor?.name || ""),
          String(Number(row.count || 0)),
          String(row.category_id || "")
        ].map((x) => `"${String(x).replace(/"/g, '""')}"`).join(","));
      });
      await sendEmail({
        to: toEmail,
        subject: "Vendor Stock Report - Items With Stock <= 1",
        text: "Please find attached low stock report (stock count <= 1).",
        html: "Please find attached low stock report (stock count <= 1).",
        attachments: [{
          filename: "vendor_stock_report_count_lte_1.csv",
          content: Buffer.from(csvLines.join("\n"), "utf8"),
          contentType: "text/csv"
        }],
        smtpConfig: smtpPayload.smtpConfig,
        from: smtpPayload.from
      });
      return res.json({ message: "Vendor stock report email sent." });
    }

    return res.status(400).json({ message: "Unsupported action type." });
  }catch(err){
    console.error(err);
    return res.status(500).json({ message: err.message || "Failed to send action email." });
  }
};
