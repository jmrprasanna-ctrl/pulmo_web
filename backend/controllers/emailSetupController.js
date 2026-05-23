const EmailSetup = require("../models/EmailSetup");
const db = require("../config/database");

const INVENTORY_DB_NAME = "inventory";
const DEFAULT_COMPANY_NAME = "PULMO TECHNOLOGIES";
const DEFAULT_FROM_EMAIL = "pulmotechnoogies@gmail.com";

function normalizeDatabaseName(value) {
  return db.normalizeDatabaseName(value);
}

function normalizeEmail(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return "";
  return normalized;
}

function normalizeCompanyName(value) {
  const normalized = String(value || "").trim().replace(/\s+/g, " ");
  return normalized || "";
}

function getRole(req) {
  return String(req?.user?.role || "").trim().toLowerCase();
}

function getUserId(req) {
  const parsed = Number(req?.user?.id || req?.user?.userId || 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed;
}

function rowsFromResult(rs) {
  if (Array.isArray(rs?.[0])) return rs[0];
  if (Array.isArray(rs?.rows)) return rs.rows;
  return [];
}

function createMappedOption(raw = {}) {
  const databaseName = normalizeDatabaseName(raw.database_name || raw.databaseName || "");
  if (!databaseName) return null;
  return {
    database_name: databaseName,
    company_name: normalizeCompanyName(raw.company_name || raw.companyName || ""),
    email: normalizeEmail(raw.email || raw.mapped_email || raw.mappedEmail || ""),
  };
}

function mergeMappedOptions(existing = {}, incoming = {}) {
  const merged = { ...existing };
  const companyName = normalizeCompanyName(incoming.company_name);
  const email = normalizeEmail(incoming.email);
  if (companyName) merged.company_name = companyName;
  if (email) merged.email = email;
  return merged;
}

function ensureDefaultMappedOption(map, databaseName, companyName, email) {
  const normalizedDb = normalizeDatabaseName(databaseName);
  if (!normalizedDb) return;
  const current = map.get(normalizedDb) || { database_name: normalizedDb, company_name: "", email: "" };
  const merged = mergeMappedOptions(current, {
    database_name: normalizedDb,
    company_name: companyName,
    email,
  });
  map.set(normalizedDb, merged);
}

function finalizeMappedOptions(map) {
  const options = Array.from(map.values())
    .filter((item) => normalizeDatabaseName(item.database_name))
    .map((item) => {
      const databaseName = normalizeDatabaseName(item.database_name);
      const defaultName = databaseName === INVENTORY_DB_NAME ? DEFAULT_COMPANY_NAME : String(databaseName || "").toUpperCase();
      const defaultEmail = databaseName === INVENTORY_DB_NAME ? DEFAULT_FROM_EMAIL : "";
      return {
        database_name: databaseName,
        company_name: normalizeCompanyName(item.company_name) || defaultName,
        email: normalizeEmail(item.email) || defaultEmail || null,
      };
    });

  options.sort((a, b) => {
    const byCompany = String(a.company_name || "").localeCompare(String(b.company_name || ""), undefined, { sensitivity: "base" });
    if (byCompany !== 0) return byCompany;
    return String(a.database_name || "").localeCompare(String(b.database_name || ""), undefined, { sensitivity: "base" });
  });
  return options;
}

async function resolveMappedDatabaseOptions(req) {
  const role = getRole(req);
  const userId = getUserId(req);
  const optionMap = new Map();

  await db.withDatabase(INVENTORY_DB_NAME, async () => {
    const existsRs = await db.query(
      `SELECT to_regclass('public.company_databases') AS company_databases,
              to_regclass('public.user_mappings') AS user_mappings,
              to_regclass('public.company_profiles') AS company_profiles`
    );
    const existsRow = rowsFromResult(existsRs)[0] || {};
    const hasCompanyDatabases = Boolean(existsRow.company_databases);
    const hasUserMappings = Boolean(existsRow.user_mappings);
    const hasCompanyProfiles = Boolean(existsRow.company_profiles);

    if (hasCompanyDatabases && role !== "user") {
      const companyDbRs = await db.query(
        `SELECT database_name, company_name
         FROM company_databases
         ORDER BY LOWER(company_name) ASC, LOWER(database_name) ASC`
      );
      for (const row of rowsFromResult(companyDbRs)) {
        const option = createMappedOption({
          database_name: row.database_name,
          company_name: row.company_name,
        });
        if (!option) continue;
        const current = optionMap.get(option.database_name);
        optionMap.set(option.database_name, mergeMappedOptions(current, option));
      }
    }

    if (hasUserMappings && hasCompanyProfiles) {
      if (userId > 0) {
        const ownMapRs = await db.query(
          `SELECT um.database_name, cp.company_name, COALESCE(NULLIF(TRIM(um.mapped_email), ''), cp.email) AS email
           FROM user_mappings um
           LEFT JOIN company_profiles cp ON cp.id = um.company_profile_id
           WHERE um.user_id = $1
           ORDER BY um."updatedAt" DESC NULLS LAST, um.id DESC`,
          { bind: [userId] }
        );
        for (const row of rowsFromResult(ownMapRs)) {
          const option = createMappedOption(row);
          if (!option) continue;
          const current = optionMap.get(option.database_name);
          optionMap.set(option.database_name, mergeMappedOptions(current, option));
        }
      }

      if (role !== "user") {
        const anyMapRs = await db.query(
          `SELECT DISTINCT ON (LOWER(um.database_name))
                  um.database_name,
                  cp.company_name,
                  COALESCE(NULLIF(TRIM(um.mapped_email), ''), cp.email) AS email
           FROM user_mappings um
           LEFT JOIN company_profiles cp ON cp.id = um.company_profile_id
           ORDER BY LOWER(um.database_name) ASC, um."updatedAt" DESC NULLS LAST, um.id DESC`
        );
        for (const row of rowsFromResult(anyMapRs)) {
          const option = createMappedOption(row);
          if (!option) continue;
          const current = optionMap.get(option.database_name);
          optionMap.set(option.database_name, mergeMappedOptions(current, option));
        }
      }
    }
  });

  ensureDefaultMappedOption(optionMap, INVENTORY_DB_NAME, DEFAULT_COMPANY_NAME, DEFAULT_FROM_EMAIL);
  const requestDb = normalizeDatabaseName(req?.databaseName || req?.user?.database_name || "");
  if (requestDb) {
    ensureDefaultMappedOption(optionMap, requestDb, requestDb === INVENTORY_DB_NAME ? DEFAULT_COMPANY_NAME : requestDb.toUpperCase(), "");
  }

  return finalizeMappedOptions(optionMap);
}

function resolveSelectedMappedOption(req, options = [], explicitDatabaseName) {
  const normalizedExplicit = normalizeDatabaseName(explicitDatabaseName || "");
  const normalizedRequestDb = normalizeDatabaseName(req?.databaseName || req?.user?.database_name || "");
  const fallbackOrder = [normalizedExplicit, normalizedRequestDb, INVENTORY_DB_NAME].filter(Boolean);
  for (const dbName of fallbackOrder) {
    const matched = options.find((item) => item.database_name === dbName);
    if (matched) return matched;
  }
  return options[0] || {
    database_name: INVENTORY_DB_NAME,
    company_name: DEFAULT_COMPANY_NAME,
    email: DEFAULT_FROM_EMAIL,
  };
}

function buildCompanySubject(subjectTemplateRaw, companyName) {
  const company = normalizeCompanyName(companyName) || DEFAULT_COMPANY_NAME;
  const subjectTemplate = String(subjectTemplateRaw || "").trim();
  if (!subjectTemplate) {
    return `Invoice {{invoice_no}} - ${company}`;
  }
  const parts = subjectTemplate.split(" - ");
  if (parts.length >= 2) {
    const tail = String(parts[parts.length - 1] || "").trim();
    if (tail && !/\{\{[^}]+\}\}/.test(tail)) {
      parts[parts.length - 1] = company;
      return parts.join(" - ");
    }
  }
  if (subjectTemplate.toLowerCase().includes(company.toLowerCase())) {
    return subjectTemplate;
  }
  return `${subjectTemplate} - ${company}`;
}

function buildDefaults(mappedOption = {}) {
  const companyName = normalizeCompanyName(mappedOption.company_name) || DEFAULT_COMPANY_NAME;
  const companyEmail = normalizeEmail(mappedOption.email) || DEFAULT_FROM_EMAIL;
  return {
    smtp_user: companyEmail || null,
    from_name: companyName,
    from_email: companyEmail || null,
    subject_template: `Invoice {{invoice_no}} - ${companyName}`,
    body_template: `Dear {{customer_name}},\n\nPlease find attached your invoice {{invoice_no}}.\n\nThank you.\n${companyName}`,
  };
}

function applyMappedCompanyBranding(setupLike = {}, mappedOption = {}) {
  const companyName = normalizeCompanyName(mappedOption.company_name);
  const companyEmail = normalizeEmail(mappedOption.email);
  const src = setupLike && typeof setupLike.toJSON === "function" ? setupLike.toJSON() : { ...(setupLike || {}) };
  if (!companyName) {
    return src;
  }
  const branded = { ...src };
  branded.from_name = companyName;
  branded.subject_template = buildCompanySubject(src.subject_template, companyName);
  if (companyEmail) {
    branded.from_email = companyEmail;
    branded.smtp_user = companyEmail;
  }
  return branded;
}

function normalizeBody(body = {}, defaults = {}) {
  const smtpHost = String(body.smtp_host || "").trim() || null;
  const smtpUser = String(body.smtp_user || defaults.smtp_user || "").trim() || null;
  let smtpPass = String(body.smtp_pass || "").trim() || null;
  const isGmail =
    String(smtpHost || "").toLowerCase().includes("gmail.com") ||
    String(smtpUser || "").toLowerCase().endsWith("@gmail.com") ||
    String(smtpUser || "").toLowerCase().endsWith("@googlemail.com");
  if (smtpPass && isGmail) {
    smtpPass = smtpPass.replace(/\s+/g, "");
  }
  return {
    smtp_host: smtpHost,
    smtp_port: Number(body.smtp_port || 587),
    smtp_secure: !!body.smtp_secure,
    smtp_user: smtpUser,
    smtp_pass: smtpPass,
    from_name: String(body.from_name || defaults.from_name || "").trim() || DEFAULT_COMPANY_NAME,
    from_email: String(body.from_email || defaults.from_email || "").trim() || null,
    subject_template: String(body.subject_template || defaults.subject_template || "").trim() || `Invoice {{invoice_no}} - ${DEFAULT_COMPANY_NAME}`,
    body_template:
      String(body.body_template || "").trim() ||
      String(defaults.body_template || "").trim() ||
      `Dear {{customer_name}},\n\nPlease find attached your invoice {{invoice_no}}.\n\nThank you.\n${DEFAULT_COMPANY_NAME}`,
  };
}

function fillJsonFallbacks(json = {}, defaults = {}) {
  if (!String(json.smtp_user || "").trim() && defaults.smtp_user) {
    json.smtp_user = defaults.smtp_user;
  }
  if (!String(json.from_name || "").trim() && defaults.from_name) {
    json.from_name = defaults.from_name;
  }
  if (!String(json.from_email || "").trim() && defaults.from_email) {
    json.from_email = defaults.from_email;
  }
  if (!String(json.subject_template || "").trim() && defaults.subject_template) {
    json.subject_template = defaults.subject_template;
  }
  if (!String(json.body_template || "").trim() && defaults.body_template) {
    json.body_template = defaults.body_template;
  }
  return json;
}

function attachMappedMeta(json = {}, selectedOption = {}, options = []) {
  json.has_smtp_pass = !!String(json.smtp_pass || "").trim();
  json.smtp_pass = "";
  json.mapped_database_name = selectedOption.database_name || INVENTORY_DB_NAME;
  json.mapped_company_name = normalizeCompanyName(selectedOption.company_name) || null;
  json.mapped_company_email = normalizeEmail(selectedOption.email) || null;
  json.mapped_options = Array.isArray(options)
    ? options.map((item) => ({
        database_name: normalizeDatabaseName(item.database_name) || null,
        company_name: normalizeCompanyName(item.company_name) || null,
        email: normalizeEmail(item.email) || null,
      }))
    : [];
  return json;
}

exports.getEmailSetup = async (req, res) => {
  try {
    const mappedOptions = await resolveMappedDatabaseOptions(req);
    const selectedOption = resolveSelectedMappedOption(req, mappedOptions, req.query?.mapped_database_name);
    const defaults = buildDefaults(selectedOption);

    let row = await EmailSetup.findOne({ order: [["id", "ASC"]] });
    if (!row) {
      row = await EmailSetup.create({
        smtp_user: defaults.smtp_user,
        from_name: defaults.from_name,
        from_email: defaults.from_email,
        subject_template: defaults.subject_template,
        body_template: defaults.body_template,
      });
    }

    const brandedJson = applyMappedCompanyBranding(row, selectedOption);
    const json = fillJsonFallbacks(brandedJson, defaults);
    attachMappedMeta(json, selectedOption, mappedOptions);
    res.json(json);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || "Failed to load email setup." });
  }
};

exports.saveEmailSetup = async (req, res) => {
  try {
    const mappedOptions = await resolveMappedDatabaseOptions(req);
    const selectedOption = resolveSelectedMappedOption(req, mappedOptions, req.body?.mapped_database_name);
    const defaults = buildDefaults(selectedOption);
    const payload = applyMappedCompanyBranding(normalizeBody(req.body || {}, defaults), selectedOption);
    let row = await EmailSetup.findOne({ order: [["id", "ASC"]] });

    const normalizedHost = String(payload.smtp_host || "").toLowerCase();
    const normalizedUser = String(payload.smtp_user || "").toLowerCase();
    const isGmail =
      normalizedHost.includes("gmail.com") ||
      normalizedUser.endsWith("@gmail.com") ||
      normalizedUser.endsWith("@googlemail.com");
    const enteredPass = String(payload.smtp_pass || "");
    const existingPass = String(row?.smtp_pass || "");
    const activePass = enteredPass || existingPass;
    if (isGmail && activePass) {
      const normalizedPass = activePass.replace(/\s+/g, "");
      if (normalizedPass.length !== 16) {
        return res.status(400).json({
          message: `Gmail App Password must be exactly 16 characters. Current length: ${normalizedPass.length}.`,
        });
      }
      payload.smtp_pass = enteredPass ? normalizedPass : payload.smtp_pass;
    }

    if (!row) {
      row = await EmailSetup.create(payload);
    } else {
      const updatePayload = { ...payload };
      if (!String(req.body.smtp_pass || "").trim()) {
        delete updatePayload.smtp_pass;
      }
      await row.update(updatePayload);
      row = await EmailSetup.findByPk(row.id);
    }

    const brandedJson = applyMappedCompanyBranding(row, selectedOption);
    const json = fillJsonFallbacks(brandedJson, defaults);
    attachMappedMeta(json, selectedOption, mappedOptions);
    res.json({ message: "Email setup saved.", setup: json });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || "Failed to save email setup." });
  }
};
