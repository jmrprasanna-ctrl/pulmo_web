const fs = require("fs");
const path = require("path");
const db = require("../config/database");
const UiSetting = require("../models/UiSetting");

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

let preferenceSchemaEnsured = false;

async function ensurePreferenceSchema() {
  if (preferenceSchemaEnsured) return;
  await db.query(`
    ALTER TABLE ui_settings
    ADD COLUMN IF NOT EXISTS quotation3_template_pdf_path VARCHAR(500);
  `);
  await db.query(`ALTER TABLE ui_settings ADD COLUMN IF NOT EXISTS sign_q2_path VARCHAR(500);`);
  await db.query(`ALTER TABLE ui_settings ADD COLUMN IF NOT EXISTS seal_q2_path VARCHAR(500);`);
  await db.query(`ALTER TABLE ui_settings ADD COLUMN IF NOT EXISTS sign_q3_path VARCHAR(500);`);
  await db.query(`ALTER TABLE ui_settings ADD COLUMN IF NOT EXISTS seal_q3_path VARCHAR(500);`);
  preferenceSchemaEnsured = true;
}

async function ensureUserPreferenceTable() {
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
}

async function getOrCreateSettings() {
  await ensurePreferenceSchema();
  await ensureUserPreferenceTable();
  let row = await UiSetting.findOne({ order: [["id", "ASC"]] });
  if (!row) {
    row = await UiSetting.create({});
  }
  return row;
}

function ensureStorage() {
  if (!fs.existsSync(STORAGE_ROOT)) {
    fs.mkdirSync(STORAGE_ROOT, { recursive: true });
  }
}

function normalizeDbName(value) {
  const normalized = db.normalizeDatabaseName(value);
  return normalized || DEFAULT_DB_NAME;
}

function getRequestDbName(req) {
  return normalizeDbName(req?.databaseName || req?.user?.database_name || req?.headers?.["x-database-name"]);
}

function getDbStorageDir(req) {
  const dbName = getRequestDbName(req);
  return path.join(STORAGE_ROOT, dbName);
}

function getUserStorageDir(req) {
  const dbDir = getDbStorageDir(req);
  const userId = getCurrentUserId(req);
  const safeUser = userId > 0 ? `user_${userId}` : "user_0";
  return path.join(dbDir, safeUser);
}

function getCurrentUserId(req) {
  const id = Number(req?.user?.id || req?.user?.userId || 0);
  return Number.isFinite(id) && id > 0 ? id : 0;
}

async function getUserPreferenceRow(req, createIfMissing = true) {
  const userId = getCurrentUserId(req);
  if (!userId) return null;

  await getOrCreateSettings();
  const selectedResult = await db.query(`SELECT * FROM ${USER_PREF_TABLE} WHERE user_id = $1 LIMIT 1`, {
    bind: [userId],
  });
  let rs = Array.isArray(selectedResult?.[0]) ? selectedResult[0] : [];
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
    const row = await getOrCreateSettings();
    const userPref = await getUserPreferenceRow(_req, true);
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

    ensureStorage();
    const targetDir = getUserStorageDir(req);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const targetPath = path.join(targetDir, `${LOGO_FILE_NAME}${ext}`);
    fs.writeFileSync(targetPath, fileBuffer);

    const row = await getOrCreateSettings();
    await getUserPreferenceRow(req, true);
    await db.query(
      `UPDATE ${USER_PREF_TABLE}
       SET logo_path = $1, "updatedAt" = NOW()
       WHERE user_id = $2`,
      { bind: [targetPath, getCurrentUserId(req)] }
    );

    res.json({
      message: "System logo updated.",
      logo_url: "/api/preferences/logo-file",
      logo_updated_at: row.updatedAt ? row.updatedAt.toISOString() : "",
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

    ensureStorage();
    const targetDir = getUserStorageDir(req);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const targetPath = path.join(targetDir, `${safeNamePart(imageType)}${ext}`);
    ensureDirForFile(targetPath);
    fs.writeFileSync(targetPath, fileBuffer);

    await getUserPreferenceRow(req, true);
    await db.query(
      `UPDATE ${USER_PREF_TABLE}
       SET ${meta.column} = $1, "updatedAt" = NOW()
       WHERE user_id = $2`,
      { bind: [targetPath, getCurrentUserId(req)] }
    );

    res.json({
      message: `${imageType} image updated.`,
      path: targetPath,
      file_name: path.basename(targetPath),
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

    ensureStorage();
    const targetDir = getUserStorageDir(req);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const targetPath = path.join(targetDir, `${safeNamePart(mapping.baseName)}.pdf`);
    fs.writeFileSync(targetPath, fileBuffer);

    await getUserPreferenceRow(req, true);
    await db.query(
      `UPDATE ${USER_PREF_TABLE}
       SET ${mapping.column} = $1, "updatedAt" = NOW()
       WHERE user_id = $2`,
      { bind: [targetPath, getCurrentUserId(req)] }
    );

    res.json({
      message: `${templateType} template updated.`,
      path: targetPath,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || "Failed to upload template." });
  }
};

exports.getLogoFile = async (_req, res) => {
  try {
    const row = await getOrCreateSettings();
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
    const base = await getOrCreateSettings();
    const userPref = await getUserPreferenceRow(req, true);
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
    await getOrCreateSettings();
    await getUserPreferenceRow(req, true);
    const primary = String(req.body?.primary_color || "").trim() || "#0f6abf";
    const background = String(req.body?.background_color || "").trim() || "#edf3fb";
    const button = String(req.body?.button_color || "").trim() || primary;
    const mode = String(req.body?.mode_theme || "").trim().toLowerCase() === "dark" ? "dark" : "light";
    await db.query(
      `UPDATE ${USER_PREF_TABLE}
       SET primary_color = $1,
           background_color = $2,
           button_color = $3,
           mode_theme = $4,
           "updatedAt" = NOW()
       WHERE user_id = $5`,
      { bind: [primary, background, button, mode, getCurrentUserId(req)] }
    );
    res.json({ message: "Theme settings updated." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || "Failed to update theme settings." });
  }
};
