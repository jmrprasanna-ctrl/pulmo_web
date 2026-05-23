const EmailSetup = require("../models/EmailSetup");
const { Client } = require("pg");
const db = require("../config/database");

const INVENTORY_DB_NAME = "inventory";
const DEFAULT_COMPANY_NAME = "PULMO TECHNOLOGIES";
const DEFAULT_FROM_EMAIL = "pulmotechnologies@gmail.com";
const RESERVED_DATABASES = new Set(["postgres", "template0", "template1"]);
const CONTROL_DB_NAME = normalizeDatabaseName(process.env.DB_NAME || INVENTORY_DB_NAME) || INVENTORY_DB_NAME;

function normalizeDatabaseName(value) {
  return db.normalizeDatabaseName(value);
}

function normalizeEmail(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized === "pulmotechnoogies@gmail.com") {
    return "pulmotechnologies@gmail.com";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return "";
  return normalized;
}

function normalizeCompanyName(value) {
  const normalized = String(value || "").trim().replace(/\s+/g, " ");
  return normalized || "";
}

function getDbConfig(databaseName) {
  return {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || "postgres",
    password: String(process.env.DB_PASSWORD || ""),
    database: databaseName,
  };
}

function getRole(req) {
  const raw = String(req?.user?.role || "").trim().toLowerCase();
  if (raw === "administrator") return "admin";
  return raw;
}

function isAdminLikeRole(role) {
  return role === "admin" || role === "manager" || role === "super_admin";
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

async function fetchDatabasesLikeDbCreateList() {
  const adminClient = new Client(getDbConfig("postgres"));
  const mainDbClient = new Client(getDbConfig(CONTROL_DB_NAME));
  const optionMap = new Map();
  try {
    await adminClient.connect();
    await mainDbClient.connect();

    const companyMap = new Map();
    const tableRs = await mainDbClient.query("SELECT to_regclass('public.company_databases') AS name");
    if (tableRs.rows?.[0]?.name) {
      const companyRs = await mainDbClient.query(
        `SELECT database_name, company_name
         FROM company_databases
         ORDER BY LOWER(company_name) ASC, LOWER(database_name) ASC`
      );
      (companyRs.rows || []).forEach((row) => {
        const dbName = normalizeDatabaseName(row?.database_name);
        if (!dbName) return;
        const companyName = normalizeCompanyName(row?.company_name);
        if (companyName) {
          companyMap.set(dbName, companyName);
        }
      });
    }

    const dbRs = await adminClient.query(
      "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname ASC"
    );
    (dbRs.rows || []).forEach((row) => {
      const dbName = normalizeDatabaseName(row?.datname);
      if (!dbName || RESERVED_DATABASES.has(dbName)) return;
      optionMap.set(dbName, {
        database_name: dbName,
        company_name: companyMap.get(dbName) || "",
        email: "",
      });
    });
  } catch (_err) {
    return [];
  } finally {
    await adminClient.end().catch(() => {});
    await mainDbClient.end().catch(() => {});
  }
  return Array.from(optionMap.values());
}

async function resolveMappedDatabaseOptions(req) {
  const role = getRole(req);
  const userId = getUserId(req);
  const optionMap = new Map();
  const userScopedDbSet = new Set();

  const dbCreateList = await fetchDatabasesLikeDbCreateList();
  for (const row of dbCreateList) {
    const option = createMappedOption(row);
    if (!option) continue;
    const current = optionMap.get(option.database_name);
    optionMap.set(option.database_name, mergeMappedOptions(current, option));
  }

  await db.withDatabase(CONTROL_DB_NAME, async () => {
    const existsRs = await db.query(
      `SELECT to_regclass('public.company_databases') AS company_databases,
              to_regclass('public.user_mappings') AS user_mappings,
              to_regclass('public.company_profiles') AS company_profiles,
              to_regclass('public.user_accesses') AS user_accesses`
    );
    const existsRow = rowsFromResult(existsRs)[0] || {};
    const hasCompanyDatabases = Boolean(existsRow.company_databases);
    const hasUserMappings = Boolean(existsRow.user_mappings);
    const hasCompanyProfiles = Boolean(existsRow.company_profiles);
    const hasUserAccesses = Boolean(existsRow.user_accesses);

    if (hasCompanyDatabases) {
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
          userScopedDbSet.add(option.database_name);
          const current = optionMap.get(option.database_name);
          optionMap.set(option.database_name, mergeMappedOptions(current, option));
        }
      }
    }

    if (hasUserAccesses) {
      const allAccessDbRs = await db.query(
        `SELECT DISTINCT LOWER(TRIM(database_name)) AS database_name
         FROM user_accesses
         WHERE database_name IS NOT NULL AND TRIM(database_name) <> ''
         ORDER BY LOWER(TRIM(database_name)) ASC`
      );
      for (const row of rowsFromResult(allAccessDbRs)) {
        const option = createMappedOption({ database_name: row.database_name });
        if (!option) continue;
        const current = optionMap.get(option.database_name);
        optionMap.set(option.database_name, mergeMappedOptions(current, option));
      }

      if (userId > 0) {
        const ownAccessDbRs = await db.query(
          `SELECT DISTINCT LOWER(TRIM(database_name)) AS database_name
           FROM user_accesses
           WHERE user_id = $1
             AND database_name IS NOT NULL
             AND TRIM(database_name) <> ''
           ORDER BY LOWER(TRIM(database_name)) ASC`,
          { bind: [userId] }
        );
        for (const row of rowsFromResult(ownAccessDbRs)) {
          const dbName = normalizeDatabaseName(row.database_name);
          if (!dbName) continue;
          userScopedDbSet.add(dbName);
        }
      }
    }
  });

  ensureDefaultMappedOption(optionMap, INVENTORY_DB_NAME, DEFAULT_COMPANY_NAME, DEFAULT_FROM_EMAIL);
  const requestDb = normalizeDatabaseName(req?.databaseName || req?.user?.database_name || "");
  if (requestDb) {
    const fallbackName = requestDb === INVENTORY_DB_NAME ? DEFAULT_COMPANY_NAME : requestDb.toUpperCase();
    ensureDefaultMappedOption(optionMap, requestDb, fallbackName, "");
    userScopedDbSet.add(requestDb);
  }

  let options = finalizeMappedOptions(optionMap);
  if (!isAdminLikeRole(role)) {
    const allowed = new Set([...userScopedDbSet].filter(Boolean));
    if (!allowed.size) {
      allowed.add(requestDb || INVENTORY_DB_NAME);
    }
    options = options.filter((item) => allowed.has(item.database_name));
    if (!options.length) {
      options = finalizeMappedOptions(new Map([[INVENTORY_DB_NAME, {
        database_name: INVENTORY_DB_NAME,
        company_name: DEFAULT_COMPANY_NAME,
        email: DEFAULT_FROM_EMAIL,
      }]]));
    }
  }

  return options;
}

function resolveSelectedMappedOption(req, options = [], explicitDatabaseName) {
  const normalizedExplicit = normalizeDatabaseName(explicitDatabaseName || "");
  if (normalizedExplicit) {
    const matchedExplicit = options.find((item) => item.database_name === normalizedExplicit);
    if (matchedExplicit) return matchedExplicit;
    return {
      database_name: normalizedExplicit,
      company_name: normalizedExplicit === INVENTORY_DB_NAME ? DEFAULT_COMPANY_NAME : normalizedExplicit.toUpperCase(),
      email: normalizedExplicit === INVENTORY_DB_NAME ? DEFAULT_FROM_EMAIL : "",
    };
  }
  const normalizedRequestDb = normalizeDatabaseName(req?.databaseName || req?.user?.database_name || "");
  const fallbackOrder = [normalizedRequestDb, INVENTORY_DB_NAME].filter(Boolean);
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

async function resolveTargetDatabaseName(databaseNameRaw, fallbackRaw) {
  const preferred = normalizeDatabaseName(databaseNameRaw || "");
  const fallback = normalizeDatabaseName(fallbackRaw || "") || INVENTORY_DB_NAME;
  const candidates = [preferred, fallback, INVENTORY_DB_NAME].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await db.registerDatabase(candidate);
      return candidate;
    } catch (_err) {
    }
  }
  return INVENTORY_DB_NAME;
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
  const branded = { ...src };
  if (companyName) {
    if (!String(branded.from_name || "").trim()) {
      branded.from_name = companyName;
    }
    if (!String(branded.subject_template || "").trim()) {
      branded.subject_template = buildCompanySubject("", companyName);
    }
  }
  if (companyEmail) {
    if (!String(branded.from_email || "").trim()) {
      branded.from_email = companyEmail;
    }
    if (!String(branded.smtp_user || "").trim()) {
      branded.smtp_user = companyEmail;
    }
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
  json.target_database_name = selectedOption.database_name || INVENTORY_DB_NAME;
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
    const targetDatabaseName = await resolveTargetDatabaseName(
      selectedOption.database_name,
      req?.databaseName || req?.user?.database_name
    );
    selectedOption.database_name = targetDatabaseName;
    const defaults = buildDefaults(selectedOption);

    const json = await db.withDatabase(targetDatabaseName, async () => {
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
      return fillJsonFallbacks(brandedJson, defaults);
    });
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
    const targetDatabaseName = await resolveTargetDatabaseName(
      selectedOption.database_name,
      req?.databaseName || req?.user?.database_name
    );
    selectedOption.database_name = targetDatabaseName;
    const defaults = buildDefaults(selectedOption);
    const payload = applyMappedCompanyBranding(normalizeBody(req.body || {}, defaults), selectedOption);

    const json = await db.withDatabase(targetDatabaseName, async () => {
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
      const existingUser = String(row?.smtp_user || "").trim().toLowerCase();
      const incomingUser = String(payload.smtp_user || "").trim().toLowerCase();
      if (row && !String(req.body.smtp_pass || "").trim() && existingUser && incomingUser && existingUser !== incomingUser) {
        const err = new Error("SMTP user/email changed. Please enter App Password again before saving.");
        err.statusCode = 400;
        throw err;
      }
      if (isGmail && activePass) {
        const normalizedPass = activePass.replace(/\s+/g, "");
        if (normalizedPass.length !== 16) {
          const err = new Error(`Gmail App Password must be exactly 16 characters. Current length: ${normalizedPass.length}.`);
          err.statusCode = 400;
          throw err;
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
      return fillJsonFallbacks(brandedJson, defaults);
    });
    attachMappedMeta(json, selectedOption, mappedOptions);
    res.json({ message: "Email setup saved.", setup: json });
  } catch (err) {
    console.error(err);
    const code = Number(err?.statusCode || 500) || 500;
    res.status(code).json({ message: err.message || "Failed to save email setup." });
  }
};
