const EmailSetup = require("../models/EmailSetup");
const db = require("../config/database");

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

exports.getEmailSetup = async (req, res) => {
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
