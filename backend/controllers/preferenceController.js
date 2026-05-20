const fs = require("fs");
const path = require("path");
const db = require("../config/database");
const UiSetting = require("../models/UiSetting");
const User = require("../models/User");

const IMAGE_ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".bmp", ".gif", ".png"]);
const STORAGE_ROOT = path.resolve(__dirname, "../storage/preferences");
const LOGO_FILE_NAME = "system-logo";
const DEFAULT_DB_NAME = "inventory";
const USER_PREF_TABLE = "user_preference_settings";

const TEMPLATE_MAP = {
  invoice: {
    column: "invoice_template_pdf_path",
    baseName: "invoice-template",
  },
  quotation: {
    column: "quotation_template_pdf_path",
    baseName: "quotation-template",
  },
  quotation2: {
    column: "quotation2_template_pdf_path",
    baseName: "quotation-2-template",
  },
  quotation3: {
    column: "quotation3_template_pdf_path",
    baseName: "quotation-3-template",
  },
};

const BRAND_IMAGE_MAP = {
  sign_c: {
    column: "sign_c_path",
    env: "INVOICE_SIGN1_IMAGE",
    defaultPath: path.resolve(__dirname, "../../frontend/assets/images/pulmo-sign-1.png"),
    fallbackPath: "",
  },
  sign_v: {
    column: "sign_v_path",
    env: "INVOICE_SIGNV_IMAGE",
    defaultPath: path.resolve(__dirname, "../../frontend/assets/images/pulmo-sign-v.png"),
    fallbackPath: path.resolve(__dirname, "../../frontend/assets/images/pulmo-sign-1.png"),
  },
  seal_c: {
    column: "seal_c_path",
    env: "INVOICE_SEAL1_IMAGE",
    defaultPath: path.resolve(__dirname, "../../frontend/assets/images/pulmo-seal-1.png"),
    fallbackPath: "",
  },
  seal_v: {
    column: "seal_v_path",
    env: "INVOICE_SEALV_IMAGE",
    defaultPath: path.resolve(__dirname, "../../frontend/assets/images/pulmo-seal-v.png"),
    fallbackPath: path.resolve(__dirname, "../../frontend/assets/images/pulmo-seal-1.png"),
  },
  sign_q2: {
    column: "sign_q2_path",
    env: "INVOICE_SIGNQ2_IMAGE",
    defaultPath: path.resolve(__dirname, "../../frontend/assets/images/pulmo-sign-1.png"),
    fallbackPath: path.resolve(__dirname, "../../frontend/assets/images/pulmo-sign-1.png"),
  },
  seal_q2: {
    column: "seal_q2_path",
    env: "INVOICE_SEALQ2_IMAGE",
    defaultPath: path.resolve(__dirname, "../../frontend/assets/images/pulmo-seal-1.png"),
    fallbackPath: path.resolve(__dirname, "../../frontend/assets/images/pulmo-seal-1.png"),
  },
  sign_q3: {
    column: "sign_q3_path",
    env: "INVOICE_SIGNQ3_IMAGE",
    defaultPath: path.resolve(__dirname, "../../frontend/assets/images/pulmo-sign-1.png"),
    fallbackPath: path.resolve(__dirname, "../../frontend/assets/images/pulmo-sign-1.png"),
  },
  seal_q3: {
    column: "seal_q3_path",
    env: "INVOICE_SEALQ3_IMAGE",
    defaultPath: path.resolve(__dirname, "../../frontend/assets/images/pulmo-seal-1.png"),
    fallbackPath: path.resolve(__dirname, "../../frontend/assets/images/pulmo-seal-1.png"),
  },
};

const ensuredPreferenceSchemaDbSet = new Set();

function normalizeDbName(value) {
  const normalized = db.normalizeDatabaseName(value);
  return normalized || DEFAULT_DB_NAME;
}

function normalizeUserDatabase(value) {
  const normalized = db.normalizeDatabaseName(value);
  return normalized || DEFAULT_DB_NAME;
}

function parseUserReference(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;

  const composite = value.match(/^([a-z0-9_]+):(\d+)$/i);
  if (composite) {
    const userDatabase = normalizeUserDatabase(composite[1]);
    const userId = Number(composite[2]);
    if (!Number.isFinite(userId) || userId <= 0) return null;
    return { user_id: userId, user_database: userDatabase };
  }

  const userId = Number(value);
  if (!Number.isFinite(userId) || userId <= 0) return null;
  return { user_id: userId, user_database: DEFAULT_DB_NAME };
}

async function ensurePreferenceSchema(databaseName = DEFAULT_DB_NAME) {
  const targetDb = normalizeDbName(databaseName);
  await db.registerDatabase(targetDb).catch(() => {});
  if (ensuredPreferenceSchemaDbSet.has(targetDb)) return;

  await db.withDatabase(targetDb, async () => {
    await db.query(`
      ALTER TABLE ui_settings
      ADD COLUMN IF NOT EXISTS quotation3_template_pdf_path VARCHAR(500);
    `);
    await db.query(`ALTER TABLE ui_settings ADD COLUMN IF NOT EXISTS sign_q2_path VARCHAR(500);`);
    await db.query(`ALTER TABLE ui_settings ADD COLUMN IF NOT EXISTS seal_q2_path VARCHAR(500);`);
    await db.query(`ALTER TABLE ui_settings ADD COLUMN IF NOT EXISTS sign_q3_path VARCHAR(500);`);
    await db.query(`ALTER TABLE ui_settings ADD COLUMN IF NOT EXISTS seal_q3_path VARCHAR(500);`);
  });

  ensuredPreferenceSchemaDbSet.add(targetDb);
}

async function ensureUserPreferenceTable(databaseName = DEFAULT_DB_NAME) {
  const targetDb = normalizeDbName(databaseName);
  await db.registerDatabase(targetDb).catch(() => {});
  await db.withDatabase(targetDb, async () => {
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
        sign_q2_path VARCHAR(500),
        seal_q2_path VARCHAR(500),
        sign_q3_path VARCHAR(500),
        seal_q3_path VARCHAR(500),
        primary_color VARCHAR(24),
        background_color VARCHAR(24),
        button_color VARCHAR(24),
        mode_theme VARCHAR(16),
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW()
      );
    `);
    await db.query(`ALTER TABLE ${USER_PREF_TABLE} ADD COLUMN IF NOT EXISTS sign_q2_path VARCHAR(500);`);
    await db.query(`ALTER TABLE ${USER_PREF_TABLE} ADD COLUMN IF NOT EXISTS seal_q2_path VARCHAR(500);`);
    await db.query(`ALTER TABLE ${USER_PREF_TABLE} ADD COLUMN IF NOT EXISTS sign_q3_path VARCHAR(500);`);
    await db.query(`ALTER TABLE ${USER_PREF_TABLE} ADD COLUMN IF NOT EXISTS seal_q3_path VARCHAR(500);`);
  });
}

async function getOrCreateSettings(databaseName = DEFAULT_DB_NAME) {
  const targetDb = normalizeDbName(databaseName);
  await ensurePreferenceSchema(targetDb);
  await ensureUserPreferenceTable(targetDb);
  return db.withDatabase(targetDb, async () => {
    let row = await UiSetting.findOne({ order: [["id", "ASC"]] });
    if (!row) {
      row = await UiSetting.create({});
    }
    return row;
  });
}

function ensureStorage() {
  if (!fs.existsSync(STORAGE_ROOT)) {
    fs.mkdirSync(STORAGE_ROOT, { recursive: true });
  }
}

function getRequestDbName(req) {
  return normalizeDbName(req?.databaseName || req?.user?.database_name || req?.headers?.["x-database-name"]);
}

function getDbStorageDir(context) {
  const dbName = normalizeDbName(context?.databaseName || DEFAULT_DB_NAME);
  return path.join(STORAGE_ROOT, dbName);
}

function getUserStorageDir(context) {
  const dbDir = getDbStorageDir(context);
  const userId = Number(context?.userId || 0);
  const safeUser = userId > 0 ? `user_${userId}` : "user_0";
  return path.join(dbDir, safeUser);
}

function getCurrentUserId(req) {
  const id = Number(req?.user?.id || req?.user?.userId || 0);
  return Number.isFinite(id) && id > 0 ? id : 0;
}

async function resolveTargetPreferenceContext(req, options = {}) {
  const allowAdminOverride = options?.allowAdminOverride !== false;
  const requesterRole = String(req?.user?.role || "").trim().toLowerCase();
  const requesterUserId = getCurrentUserId(req);
  const requesterDb = getRequestDbName(req);

  let userId = requesterUserId;
  let databaseName = requesterDb;

  if (allowAdminOverride && requesterRole === "admin") {
    const rawUserRef = req?.body?.user_ref ?? req?.query?.user_ref;
    const userRef = parseUserReference(rawUserRef);
    if (userRef && Number.isFinite(userRef.user_id) && userRef.user_id > 0) {
      if (userRef.user_database !== DEFAULT_DB_NAME) {
        await db.registerDatabase(userRef.user_database).catch(() => {});
        const sourceUser = await db.withDatabase(userRef.user_database, async () => {
          return User.findByPk(userRef.user_id, { attributes: ["id", "username", "email"] });
        }).catch(() => null);
        const plain = sourceUser && sourceUser.toJSON ? sourceUser.toJSON() : sourceUser;
        const email = String(plain?.email || "").trim().toLowerCase();
        const username = String(plain?.username || "").trim().toLowerCase();
        const canonicalUserId = await db.withDatabase(DEFAULT_DB_NAME, async () => {
          if (email) {
            const byEmailRs = await db.query(
              `SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
              { bind: [email] }
            );
            const byEmailRows = Array.isArray(byEmailRs?.[0]) ? byEmailRs[0] : [];
            if (Number(byEmailRows[0]?.id || 0) > 0) return Number(byEmailRows[0].id);
          }
          if (username) {
            const byUserRs = await db.query(
              `SELECT id FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1`,
              { bind: [username] }
            );
            const byUserRows = Array.isArray(byUserRs?.[0]) ? byUserRs[0] : [];
            if (Number(byUserRows[0]?.id || 0) > 0) return Number(byUserRows[0].id);
          }
          return Number(userRef.user_id || 0);
        }).catch(() => Number(userRef.user_id || 0));
        userId = Number(canonicalUserId || userRef.user_id || requesterUserId);
      } else {
        userId = Number(userRef.user_id);
      }
    }

    const requestedDbName = normalizeDbName(req?.body?.database_name ?? req?.query?.database_name);
    if (requestedDbName) {
      databaseName = requestedDbName;
    }
  }

  userId = Number.isFinite(Number(userId)) && Number(userId) > 0 ? Number(userId) : requesterUserId;
  databaseName = normalizeDbName(databaseName || requesterDb || DEFAULT_DB_NAME);
  await db.registerDatabase(databaseName).catch(() => {});

  return {
    userId,
    databaseName,
  };
}

async function getUserPreferenceRow(context, createIfMissing = true) {
  const userId = Number(context?.userId || 0);
  const targetDb = normalizeDbName(context?.databaseName || DEFAULT_DB_NAME);
  if (!userId) return null;

  await getOrCreateSettings(targetDb);
  return db.withDatabase(targetDb, async () => {
    const selectedResult = await db.query(`SELECT * FROM ${USER_PREF_TABLE} WHERE user_id = $1 LIMIT 1`, {
      bind: [userId],
    });
    const rs = Array.isArray(selectedResult?.[0]) ? selectedResult[0] : [];
    if (rs.length) return rs[0];
    if (!createIfMissing) return null;

    const base = await UiSetting.findOne({ order: [["id", "ASC"]] });
    await db.query(
      `INSERT INTO ${USER_PREF_TABLE}
        (user_id, primary_color, background_color, button_color, mode_theme, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT (user_id) DO NOTHING`,
      {
        bind: [
          userId,
          String(base?.primary_color || "#0f6abf"),
          String(base?.background_color || "#edf3fb"),
          String(base?.button_color || "#0f6abf"),
          String(base?.mode_theme || "light"),
        ],
      }
    );
    const insertedResult = await db.query(`SELECT * FROM ${USER_PREF_TABLE} WHERE user_id = $1 LIMIT 1`, {
      bind: [userId],
    });
    const inserted = Array.isArray(insertedResult?.[0]) ? insertedResult[0] : [];
    return (Array.isArray(inserted) && inserted[0]) || null;
  });
}

function parseBase64Payload(fileDataBase64) {
  const raw = String(fileDataBase64 || "").trim();
  if (!raw) {
    throw new Error("Missing file data.");
  }
  const parts = raw.split(",");
  const payload = parts.length > 1 ? parts.slice(1).join(",") : raw;
  return Buffer.from(payload, "base64");
}

function safeNamePart(value) {
  return String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_");
}

function currentFileNameFromPath(filePath) {
  const normalized = String(filePath || "").trim();
  if (!normalized) return "";
  return path.basename(normalized);
}

function guessMime(filePath) {
  const ext = path.extname(String(filePath || "").toLowerCase());
  if (ext === ".gif") return "image/gif";
  if (ext === ".bmp") return "image/bmp";
  if (ext === ".png") return "image/png";
  return "image/jpeg";
}

function ensureDirForFile(targetPath) {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function resolveBrandImagePath(row, imageType) {
  const meta = BRAND_IMAGE_MAP[imageType];
  if (!meta) return "";
  const dbPath = String(row?.[meta.column] || "").trim();
  const envPath = String(process.env[meta.env] || "").trim();
  const defaultPath = String(meta.defaultPath || "").trim();
  const fallbackPath = String(meta.fallbackPath || "").trim();
  const firstConfigured = dbPath || envPath || defaultPath || fallbackPath;
  const candidates = [dbPath, envPath, defaultPath, fallbackPath].filter(Boolean);
  const existing = candidates.find((p) => fs.existsSync(path.resolve(p)));
  return path.resolve(existing || firstConfigured || "");
}

exports.getPreferences = async (_req, res) => {
  try {
    const target = await resolveTargetPreferenceContext(_req, { allowAdminOverride: true });
    const row = await getOrCreateSettings(target.databaseName);
    const userPref = await getUserPreferenceRow(target, true);
    const readPath = (column) => String(userPref?.[column] || "").trim();
    res.json({
      logo_path: readPath("logo_path"),
      logo_file_name: currentFileNameFromPath(readPath("logo_path")),
      invoice_template_pdf_path: readPath("invoice_template_pdf_path"),
      invoice_template_pdf_file_name: currentFileNameFromPath(readPath("invoice_template_pdf_path")),
      quotation_template_pdf_path: readPath("quotation_template_pdf_path"),
      quotation_template_pdf_file_name: currentFileNameFromPath(readPath("quotation_template_pdf_path")),
      quotation2_template_pdf_path: readPath("quotation2_template_pdf_path"),
      quotation2_template_pdf_file_name: currentFileNameFromPath(readPath("quotation2_template_pdf_path")),
      quotation3_template_pdf_path: readPath("quotation3_template_pdf_path"),
      quotation3_template_pdf_file_name: currentFileNameFromPath(readPath("quotation3_template_pdf_path")),
      sign_c_path: readPath("sign_c_path"),
      sign_c_file_name: currentFileNameFromPath(readPath("sign_c_path")),
      sign_v_path: readPath("sign_v_path"),
      sign_v_file_name: currentFileNameFromPath(readPath("sign_v_path")),
      seal_c_path: readPath("seal_c_path"),
      seal_c_file_name: currentFileNameFromPath(readPath("seal_c_path")),
      seal_v_path: readPath("seal_v_path"),
      seal_v_file_name: currentFileNameFromPath(readPath("seal_v_path")),
      sign_q2_path: readPath("sign_q2_path"),
      sign_q2_file_name: currentFileNameFromPath(readPath("sign_q2_path")),
      seal_q2_path: readPath("seal_q2_path"),
      seal_q2_file_name: currentFileNameFromPath(readPath("seal_q2_path")),
      sign_q3_path: readPath("sign_q3_path"),
      sign_q3_file_name: currentFileNameFromPath(readPath("sign_q3_path")),
      seal_q3_path: readPath("seal_q3_path"),
      seal_q3_file_name: currentFileNameFromPath(readPath("seal_q3_path")),
      logo_url: "/api/preferences/logo-file",
      updated_at: row.updatedAt ? row.updatedAt.toISOString() : "",
      target_user_id: Number(target.userId || 0),
      target_database_name: normalizeDbName(target.databaseName),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || "Failed to load preferences." });
  }
};

exports.uploadLogo = async (req, res) => {
  try {
    const fileName = String(req.body.fileName || "").trim();
    const ext = path.extname(fileName).toLowerCase();
    if (!IMAGE_ALLOWED_EXTENSIONS.has(ext) || ext === ".png") {
      return res.status(400).json({
        message: "Invalid logo format. Allowed formats: .jpg, .jpeg, .bmp, .gif",
      });
    }

    const fileBuffer = parseBase64Payload(req.body.fileDataBase64);
    if (!fileBuffer.length) {
      return res.status(400).json({ message: "Uploaded logo is empty." });
    }

    const target = await resolveTargetPreferenceContext(req, { allowAdminOverride: true });
    ensureStorage();
    const targetDir = getUserStorageDir(target);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const targetPath = path.join(targetDir, `${LOGO_FILE_NAME}${ext}`);
    fs.writeFileSync(targetPath, fileBuffer);

    const row = await getOrCreateSettings(target.databaseName);
    await getUserPreferenceRow(target, true);
    await db.withDatabase(target.databaseName, async () => {
      await db.query(
        `UPDATE ${USER_PREF_TABLE}
         SET logo_path = $1, "updatedAt" = NOW()
         WHERE user_id = $2`,
        { bind: [targetPath, Number(target.userId || 0)] }
      );
    });

    res.json({
      message: "System logo updated.",
      logo_url: "/api/preferences/logo-file",
      logo_updated_at: row.updatedAt ? row.updatedAt.toISOString() : "",
      target_user_id: Number(target.userId || 0),
      target_database_name: normalizeDbName(target.databaseName),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || "Failed to upload logo." });
  }
};

exports.uploadBrandImage = async (req, res) => {
  try {
    const imageType = String(req.body.imageType || "").trim().toLowerCase();
    const meta = BRAND_IMAGE_MAP[imageType];
    if (!meta) {
      return res.status(400).json({ message: "Invalid image type." });
    }

    const fileName = String(req.body.fileName || "").trim();
    const ext = path.extname(fileName).toLowerCase();
    if (!IMAGE_ALLOWED_EXTENSIONS.has(ext)) {
      return res.status(400).json({
        message: "Invalid image format. Allowed formats: .jpg, .jpeg, .bmp, .gif, .png",
      });
    }

    const fileBuffer = parseBase64Payload(req.body.fileDataBase64);
    if (!fileBuffer.length) {
      return res.status(400).json({ message: "Uploaded image is empty." });
    }

    const target = await resolveTargetPreferenceContext(req, { allowAdminOverride: true });
    ensureStorage();
    const targetDir = getUserStorageDir(target);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const targetPath = path.join(targetDir, `${safeNamePart(imageType)}${ext}`);
    ensureDirForFile(targetPath);
    fs.writeFileSync(targetPath, fileBuffer);

    await getUserPreferenceRow(target, true);
    await db.withDatabase(target.databaseName, async () => {
      await db.query(
        `UPDATE ${USER_PREF_TABLE}
         SET ${meta.column} = $1, "updatedAt" = NOW()
         WHERE user_id = $2`,
        { bind: [targetPath, Number(target.userId || 0)] }
      );
    });

    res.json({
      message: `${imageType} image updated.`,
      path: targetPath,
      file_name: path.basename(targetPath),
      target_user_id: Number(target.userId || 0),
      target_database_name: normalizeDbName(target.databaseName),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || "Failed to upload brand image." });
  }
};

exports.uploadTemplate = async (req, res) => {
  try {
    const templateType = String(req.body.templateType || "").trim().toLowerCase();
    const mapping = TEMPLATE_MAP[templateType];
    if (!mapping) {
      return res.status(400).json({ message: "Invalid template type." });
    }

    const fileName = String(req.body.fileName || "").trim();
    const ext = path.extname(fileName).toLowerCase();
    if (ext !== ".pdf") {
      return res.status(400).json({ message: "Template file must be a PDF." });
    }

    const fileBuffer = parseBase64Payload(req.body.fileDataBase64);
    if (!fileBuffer.length) {
      return res.status(400).json({ message: "Uploaded template is empty." });
    }

    const target = await resolveTargetPreferenceContext(req, { allowAdminOverride: true });
    ensureStorage();
    const targetDir = getUserStorageDir(target);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const targetPath = path.join(targetDir, `${safeNamePart(mapping.baseName)}.pdf`);
    fs.writeFileSync(targetPath, fileBuffer);

    await getUserPreferenceRow(target, true);
    await db.withDatabase(target.databaseName, async () => {
      await db.query(
        `UPDATE ${USER_PREF_TABLE}
         SET ${mapping.column} = $1, "updatedAt" = NOW()
         WHERE user_id = $2`,
        { bind: [targetPath, Number(target.userId || 0)] }
      );
    });

    res.json({
      message: `${templateType} template updated.`,
      path: targetPath,
      target_user_id: Number(target.userId || 0),
      target_database_name: normalizeDbName(target.databaseName),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || "Failed to upload template." });
  }
};

exports.getLogoFile = async (_req, res) => {
  try {
    const targetDb = getRequestDbName(_req);
    const row = await getOrCreateSettings(targetDb);
    const configuredLogoPath = String(row.logo_path || "").trim();
    const defaultLogoPath = path.resolve(__dirname, "../../frontend/assets/images/logo.png");
    const logoPath = configuredLogoPath && fs.existsSync(configuredLogoPath)
      ? configuredLogoPath
      : defaultLogoPath;

    if (!fs.existsSync(logoPath)) {
      return res.status(404).json({ message: "Logo file not found." });
    }

    res.setHeader("Content-Type", guessMime(logoPath));
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.resolve(logoPath));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || "Failed to load logo." });
  }
};

exports.getMyUiSettings = async (req, res) => {
  try {
    const target = await resolveTargetPreferenceContext(req, { allowAdminOverride: false });
    const base = await getOrCreateSettings(target.databaseName);
    const userPref = await getUserPreferenceRow(target, true);
    const logoUpdatedAt = userPref?.updatedAt || base.updatedAt;
    res.json({
      app_name: base.app_name,
      footer_text: base.footer_text,
      primary_color: String(userPref?.primary_color || base.primary_color || "#0f6abf"),
      accent_color: base.accent_color,
      background_color: String(userPref?.background_color || base.background_color || "#edf3fb"),
      button_color: String(userPref?.button_color || base.button_color || "#0f6abf"),
      mode_theme: String(userPref?.mode_theme || base.mode_theme || "light"),
      logo_url: "/api/preferences/logo-file",
      logo_updated_at: logoUpdatedAt ? new Date(logoUpdatedAt).toISOString() : "",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || "Failed to load user UI settings." });
  }
};

exports.updateMyTheme = async (req, res) => {
  try {
    const target = await resolveTargetPreferenceContext(req, { allowAdminOverride: false });
    await getOrCreateSettings(target.databaseName);
    await getUserPreferenceRow(target, true);
    const primary = String(req.body?.primary_color || "").trim() || "#0f6abf";
    const background = String(req.body?.background_color || "").trim() || "#edf3fb";
    const button = String(req.body?.button_color || "").trim() || primary;
    const rawMode = String(req.body?.mode_theme || "").trim().toLowerCase();
    const mode = rawMode === "dark" || rawMode === "darker" ? rawMode : "light";
    await db.withDatabase(target.databaseName, async () => {
      await db.query(
        `UPDATE ${USER_PREF_TABLE}
         SET primary_color = $1,
             background_color = $2,
             button_color = $3,
             mode_theme = $4,
             "updatedAt" = NOW()
         WHERE user_id = $5`,
        { bind: [primary, background, button, mode, Number(target.userId || 0)] }
      );
    });
    res.json({ message: "Theme settings updated." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || "Failed to update theme settings." });
  }
};
