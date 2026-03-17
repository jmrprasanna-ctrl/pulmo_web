const EmailSetup = require("../models/EmailSetup");

function normalizeBody(body = {}){
  return {
    smtp_host: String(body.smtp_host || "").trim() || null,
    smtp_port: Number(body.smtp_port || 587),
    smtp_secure: !!body.smtp_secure,
    smtp_user: String(body.smtp_user || "").trim() || null,
    smtp_pass: String(body.smtp_pass || "").trim() || null,
    from_name: String(body.from_name || "").trim() || "PULMO TECHNOLOGIES",
    from_email: String(body.from_email || "").trim() || null,
    subject_template: String(body.subject_template || "").trim() || "Invoice {{invoice_no}} - PULMO TECHNOLOGIES",
    body_template:
      String(body.body_template || "").trim() ||
      "Dear {{customer_name}},\n\nPlease find attached your invoice {{invoice_no}}.\n\nThank you.\nPULMO TECHNOLOGIES"
  };
}

exports.getEmailSetup = async (_req, res) => {
  try{
    let row = await EmailSetup.findOne({ order: [["id", "ASC"]] });
    if(!row){
      row = await EmailSetup.create({});
    }
    const json = row.toJSON();
    json.smtp_pass = "";
    res.json(json);
  }catch(err){
    console.error(err);
    res.status(500).json({ message: err.message || "Failed to load email setup." });
  }
};

exports.saveEmailSetup = async (req, res) => {
  try{
    const payload = normalizeBody(req.body || {});
    let row = await EmailSetup.findOne({ order: [["id", "ASC"]] });
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
    json.smtp_pass = "";
    res.json({ message: "Email setup saved.", setup: json });
  }catch(err){
    console.error(err);
    res.status(500).json({ message: err.message || "Failed to save email setup." });
  }
};
