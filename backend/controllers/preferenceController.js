const fs = require("fs");
const path = require("path");
const db = require("../config/database");
const UiSetting = require("../models/UiSetting");

const IMAGE_ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".bmp", ".gif", ".png"]);
const STORAGE_ROOT = path.resolve(__dirname, "../storage/preferences");
const LOGO_FILE_NAME = "system-logo";
const DEFAULT_DB_NAME = "inventory";

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
};

let preferenceSchemaEnsured = false;

async function ensurePreferenceSchema() {
  if (preferenceSchemaEnsured) return;
  await db.query(`
    ALTER TABLE ui_settings
    ADD COLUMN IF NOT EXISTS quotation3_template_pdf_path VARCHAR(500);
  `);
  preferenceSchemaEnsured = true;
}

async function getOrCreateSettings() {
  await ensurePreferenceSchema();
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
    res.json({
      logo_path: row.logo_path || "",
      logo_file_name: currentFileNameFromPath(row.logo_path),
      invoice_template_pdf_path: row.invoice_template_pdf_path || "",
      invoice_template_pdf_file_name: currentFileNameFromPath(row.invoice_template_pdf_path),
      quotation_template_pdf_path: row.quotation_template_pdf_path || "",
      quotation_template_pdf_file_name: currentFileNameFromPath(row.quotation_template_pdf_path),
      quotation2_template_pdf_path: row.quotation2_template_pdf_path || "",
      quotation2_template_pdf_file_name: currentFileNameFromPath(row.quotation2_template_pdf_path),
      quotation3_template_pdf_path: row.quotation3_template_pdf_path || "",
      quotation3_template_pdf_file_name: currentFileNameFromPath(row.quotation3_template_pdf_path),
      sign_c_path: resolveBrandImagePath(row, "sign_c"),
      sign_c_file_name: currentFileNameFromPath(resolveBrandImagePath(row, "sign_c")),
      sign_v_path: resolveBrandImagePath(row, "sign_v"),
      sign_v_file_name: currentFileNameFromPath(resolveBrandImagePath(row, "sign_v")),
      seal_c_path: resolveBrandImagePath(row, "seal_c"),
      seal_c_file_name: currentFileNameFromPath(resolveBrandImagePath(row, "seal_c")),
      seal_v_path: resolveBrandImagePath(row, "seal_v"),
      seal_v_file_name: currentFileNameFromPath(resolveBrandImagePath(row, "seal_v")),
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
    const targetDir = getDbStorageDir(req);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const targetPath = path.join(targetDir, `${LOGO_FILE_NAME}${ext}`);
    fs.writeFileSync(targetPath, fileBuffer);

    const row = await getOrCreateSettings();
    await row.update({ logo_path: targetPath });

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
    const targetDir = getDbStorageDir(req);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const targetPath = path.join(targetDir, `${safeNamePart(imageType)}${ext}`);
    ensureDirForFile(targetPath);
    fs.writeFileSync(targetPath, fileBuffer);

    const row = await getOrCreateSettings();
    await row.update({ [meta.column]: targetPath });

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
    const targetDir = getDbStorageDir(req);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const targetPath = path.join(targetDir, `${safeNamePart(mapping.baseName)}.pdf`);
    fs.writeFileSync(targetPath, fileBuffer);

    const row = await getOrCreateSettings();
    await row.update({ [mapping.column]: targetPath });

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
