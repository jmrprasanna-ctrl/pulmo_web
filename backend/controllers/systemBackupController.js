const os = require("os");
const path = require("path");
const fs = require("fs/promises");
const { spawn } = require("child_process");
const db = require("../config/database");
const Invoice = require("../models/Invoice");
const InvoiceItem = require("../models/InvoiceItem");
const Product = require("../models/Product");
const Customer = require("../models/Customer");
const {
  sanitizeDriveName,
  createDriveClientFromSettings,
  ensureFolderPath,
  uploadBufferFile,
  deleteFileSafe,
  getFileMetadataSafe,
  testDriveConnection,
} = require("../services/googleDriveService");

const INVENTORY_DB_NAME = "inventory";
const BACKUP_SETTINGS_TABLE = "system_backup_settings";
const BACKUP_ENTRIES_TABLE = "system_backup_entries";

function rowsOf(result) {
  return Array.isArray(result?.[0]) ? result[0] : [];
}

function normalizeDatabaseName(value) {
  const normalized = db.normalizeDatabaseName(value || "");
  return normalized || "";
}

async function resolveTargetDatabaseName(req, providedRaw) {
  const fromReq = normalizeDatabaseName(
    providedRaw || req?.query?.database_name || req?.body?.database_name || req?.databaseName || process.env.DB_NAME || INVENTORY_DB_NAME
  );
  const target = fromReq || INVENTORY_DB_NAME;
  await db.registerDatabase(target).catch(() => {
    throw new Error(`Invalid database selected: ${target}`);
  });
  return target;
}

function parseBool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

function normalizeIsoDate(value) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
  const dt = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return "";
  return raw;
}

function toIsoDate(value) {
  const dt = value ? new Date(value) : new Date();
  if (Number.isNaN(dt.getTime())) return new Date().toISOString().slice(0, 10);
  return dt.toISOString().slice(0, 10);
}

function splitIsoDateParts(isoDate) {
  const normalized = normalizeIsoDate(isoDate) || toIsoDate();
  const year = normalized.slice(0, 4);
  const month = normalized.slice(5, 7);
  return { isoDate: normalized, year, month };
}

function safeFilePart(value, fallback = "value") {
  const normalized = String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 180);
  return normalized || fallback;
}

function parseServiceAccountEmail(rawCredentialsJson) {
  const text = String(rawCredentialsJson || "").trim();
  if (!text) return "";
  try {
    const parsed = JSON.parse(text.startsWith("{") ? text : Buffer.from(text, "base64").toString("utf8"));
    return String(parsed?.client_email || "").trim().toLowerCase();
  } catch (_err) {
    return "";
  }
}

async function ensureBackupTables() {
  await db.withDatabase(INVENTORY_DB_NAME, async () => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS ${BACKUP_SETTINGS_TABLE} (
        id SERIAL PRIMARY KEY,
        database_name VARCHAR(120) UNIQUE NOT NULL,
        drive_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        drive_root_folder_name VARCHAR(255) NOT NULL DEFAULT 'AXIS CMS PULMO',
        drive_credentials_json TEXT,
        auto_backup_invoice BOOLEAN NOT NULL DEFAULT FALSE,
        auto_backup_quotation BOOLEAN NOT NULL DEFAULT FALSE,
        auto_backup_database BOOLEAN NOT NULL DEFAULT FALSE,
        last_db_backup_date DATE,
        created_by INTEGER,
        updated_by INTEGER,
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW()
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS ${BACKUP_ENTRIES_TABLE} (
        id SERIAL PRIMARY KEY,
        database_name VARCHAR(120) NOT NULL,
        entry_type VARCHAR(32) NOT NULL,
        record_key VARCHAR(255) NOT NULL,
        drive_file_id VARCHAR(255),
        drive_file_name VARCHAR(500),
        drive_folder_path VARCHAR(500),
        file_size_bytes BIGINT,
        backup_date TIMESTAMP DEFAULT NOW(),
        metadata_json TEXT,
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW(),
        UNIQUE(database_name, entry_type, record_key)
      );
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS backup_entries_db_type_idx
      ON ${BACKUP_ENTRIES_TABLE}(database_name, entry_type);
    `);
  });
}

function toPublicSettings(row = {}) {
  const credentialsText = String(row.drive_credentials_json || "").trim();
  return {
    database_name: normalizeDatabaseName(row.database_name) || INVENTORY_DB_NAME,
    drive_enabled: Boolean(row.drive_enabled),
    drive_root_folder_name: sanitizeDriveName(row.drive_root_folder_name || "AXIS CMS PULMO", "AXIS CMS PULMO"),
    auto_backup_invoice: Boolean(row.auto_backup_invoice),
    auto_backup_quotation: Boolean(row.auto_backup_quotation),
    auto_backup_database: Boolean(row.auto_backup_database),
    last_db_backup_date: normalizeIsoDate(row.last_db_backup_date) || null,
    credentials_saved: credentialsText.length > 0,
    service_account_email: parseServiceAccountEmail(credentialsText) || null,
  };
}

async function getOrCreateBackupSettings(databaseName) {
  await ensureBackupTables();
  const targetDb = normalizeDatabaseName(databaseName) || INVENTORY_DB_NAME;
  return db.withDatabase(INVENTORY_DB_NAME, async () => {
    const rs = await db.query(
      `SELECT * FROM ${BACKUP_SETTINGS_TABLE} WHERE LOWER(database_name) = LOWER($1) LIMIT 1`,
      { bind: [targetDb] }
    );
    const existing = rowsOf(rs)[0];
    if (existing) return existing;
    const created = await db.query(
      `INSERT INTO ${BACKUP_SETTINGS_TABLE}
       (database_name, drive_enabled, drive_root_folder_name, auto_backup_invoice, auto_backup_quotation, auto_backup_database, "createdAt", "updatedAt")
       VALUES ($1, FALSE, 'AXIS CMS PULMO', FALSE, FALSE, FALSE, NOW(), NOW())
       RETURNING *`,
      { bind: [targetDb] }
    );
    return rowsOf(created)[0] || {};
  });
}

async function saveBackupSettings(databaseName, body = {}, requesterId = null) {
  const existing = await getOrCreateBackupSettings(databaseName);
  const targetDb = normalizeDatabaseName(databaseName) || INVENTORY_DB_NAME;

  const hasCredentialsField = Object.prototype.hasOwnProperty.call(body || {}, "drive_credentials_json");
  const incomingCredentials = hasCredentialsField ? String(body.drive_credentials_json || "").trim() : null;
  const driveCredentialsJson = hasCredentialsField ? incomingCredentials : String(existing.drive_credentials_json || "");

  const driveRootFolderName = sanitizeDriveName(
    String(body.drive_root_folder_name || existing.drive_root_folder_name || "AXIS CMS PULMO").trim(),
    "AXIS CMS PULMO"
  );

  const payload = {
    drive_enabled: parseBool(body.drive_enabled, Boolean(existing.drive_enabled)),
    drive_root_folder_name: driveRootFolderName,
    drive_credentials_json: driveCredentialsJson,
    auto_backup_invoice: parseBool(body.auto_backup_invoice, Boolean(existing.auto_backup_invoice)),
    auto_backup_quotation: parseBool(body.auto_backup_quotation, Boolean(existing.auto_backup_quotation)),
    auto_backup_database: parseBool(body.auto_backup_database, Boolean(existing.auto_backup_database)),
    updated_by: Number(requesterId || 0) || null,
  };

  return db.withDatabase(INVENTORY_DB_NAME, async () => {
    const rs = await db.query(
      `UPDATE ${BACKUP_SETTINGS_TABLE}
       SET drive_enabled = $2,
           drive_root_folder_name = $3,
           drive_credentials_json = $4,
           auto_backup_invoice = $5,
           auto_backup_quotation = $6,
           auto_backup_database = $7,
           updated_by = $8,
           "updatedAt" = NOW()
       WHERE LOWER(database_name) = LOWER($1)
       RETURNING *`,
      {
        bind: [
          targetDb,
          payload.drive_enabled,
          payload.drive_root_folder_name,
          payload.drive_credentials_json,
          payload.auto_backup_invoice,
          payload.auto_backup_quotation,
          payload.auto_backup_database,
          payload.updated_by,
        ],
      }
    );
    const row = rowsOf(rs)[0];
    if (row) return row;

    const created = await db.query(
      `INSERT INTO ${BACKUP_SETTINGS_TABLE}
       (database_name, drive_enabled, drive_root_folder_name, drive_credentials_json, auto_backup_invoice, auto_backup_quotation, auto_backup_database, created_by, updated_by, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, NOW(), NOW())
       RETURNING *`,
      {
        bind: [
          targetDb,
          payload.drive_enabled,
          payload.drive_root_folder_name,
          payload.drive_credentials_json,
          payload.auto_backup_invoice,
          payload.auto_backup_quotation,
          payload.auto_backup_database,
          payload.updated_by,
        ],
      }
    );
    return rowsOf(created)[0] || {};
  });
}

function requireDriveReady(settings) {
  const driveEnabled = Boolean(settings?.drive_enabled);
  if (!driveEnabled) {
    throw new Error("Google Drive backup is disabled. Enable it on Backup page first.");
  }
  if (!String(settings?.drive_credentials_json || "").trim()) {
    throw new Error("Google Drive credentials are missing. Save Service Account JSON first.");
  }
}

async function upsertBackupEntry({
  databaseName,
  entryType,
  recordKey,
  driveFileId,
  driveFileName,
  driveFolderPath,
  fileSizeBytes,
  backupDate,
  metadata,
}) {
  await ensureBackupTables();
  const targetDb = normalizeDatabaseName(databaseName) || INVENTORY_DB_NAME;
  const normalizedType = String(entryType || "").trim().toLowerCase();
  const normalizedKey = String(recordKey || "").trim();
  const metadataJson = metadata ? JSON.stringify(metadata) : null;
  return db.withDatabase(INVENTORY_DB_NAME, async () => {
    const rs = await db.query(
      `INSERT INTO ${BACKUP_ENTRIES_TABLE}
       (database_name, entry_type, record_key, drive_file_id, drive_file_name, drive_folder_path, file_size_bytes, backup_date, metadata_json, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::timestamp, NOW()), $9, NOW(), NOW())
       ON CONFLICT (database_name, entry_type, record_key)
       DO UPDATE SET drive_file_id = EXCLUDED.drive_file_id,
                     drive_file_name = EXCLUDED.drive_file_name,
                     drive_folder_path = EXCLUDED.drive_folder_path,
                     file_size_bytes = EXCLUDED.file_size_bytes,
                     backup_date = EXCLUDED.backup_date,
                     metadata_json = EXCLUDED.metadata_json,
                     "updatedAt" = NOW()
       RETURNING *`,
      {
        bind: [
          targetDb,
          normalizedType,
          normalizedKey,
          String(driveFileId || "").trim() || null,
          String(driveFileName || "").trim() || null,
          String(driveFolderPath || "").trim() || null,
          Number(fileSizeBytes || 0) || 0,
          backupDate ? String(backupDate) : null,
          metadataJson,
        ],
      }
    );
    return rowsOf(rs)[0] || null;
  });
}

async function getBackupEntries(databaseName, entryType) {
  await ensureBackupTables();
  const targetDb = normalizeDatabaseName(databaseName) || INVENTORY_DB_NAME;
  const normalizedType = String(entryType || "").trim().toLowerCase();
  return db.withDatabase(INVENTORY_DB_NAME, async () => {
    const rs = await db.query(
      `SELECT *
       FROM ${BACKUP_ENTRIES_TABLE}
       WHERE LOWER(database_name) = LOWER($1)
         AND LOWER(entry_type) = LOWER($2)
       ORDER BY backup_date DESC NULLS LAST, id DESC`,
      { bind: [targetDb, normalizedType] }
    );
    return rowsOf(rs);
  });
}

async function deleteBackupEntriesByRecordKeys(databaseName, entryTypes = [], recordKeys = []) {
  if (!entryTypes.length || !recordKeys.length) return 0;
  await ensureBackupTables();
  const targetDb = normalizeDatabaseName(databaseName) || INVENTORY_DB_NAME;
  return db.withDatabase(INVENTORY_DB_NAME, async () => {
    const rs = await db.query(
      `DELETE FROM ${BACKUP_ENTRIES_TABLE}
       WHERE LOWER(database_name) = LOWER($1)
         AND LOWER(entry_type) = ANY($2)
         AND record_key = ANY($3)`,
      {
        bind: [
          targetDb,
          entryTypes.map((x) => String(x || "").trim().toLowerCase()),
          recordKeys.map((x) => String(x || "").trim()),
        ],
      }
    );
    return Number(rs?.[1]?.rowCount || 0);
  });
}

function escapePdfText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function buildBasicPdf(lines) {
  const pdfLines = [];
  pdfLines.push("BT");
  pdfLines.push("/F1 12 Tf");
  pdfLines.push("50 760 Td");
  lines.forEach((line, index) => {
    if (index > 0) pdfLines.push("0 -16 Td");
    pdfLines.push(`(${escapePdfText(line)}) Tj`);
  });
  pdfLines.push("ET");
  const contentStream = pdfLines.join("\n");

  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    `5 0 obj\n<< /Length ${Buffer.byteLength(contentStream, "utf8")} >>\nstream\n${contentStream}\nendstream\nendobj\n`,
  ];

  let body = "";
  const offsets = [0];
  objects.forEach((obj) => {
    offsets.push(Buffer.byteLength("%PDF-1.4\n" + body, "utf8"));
    body += obj;
  });

  const xrefPos = Buffer.byteLength("%PDF-1.4\n" + body, "utf8");
  const xrefRows = ["0000000000 65535 f "];
  for (let i = 1; i < offsets.length; i += 1) {
    xrefRows.push(`${String(offsets[i]).padStart(10, "0")} 00000 n `);
  }
  const xref = `xref\n0 ${offsets.length}\n${xrefRows.join("\n")}\n`;
  const trailer = `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return Buffer.from(`%PDF-1.4\n${body}${xref}${trailer}`, "utf8");
}

function buildInvoiceStylePdfBuffer(typeLabel, invoice, customer, items) {
  const invoiceDateValue = invoice.invoice_date || invoice.createdAt;
  const quotationDateValue = invoice.quotation_date || invoice.invoice_date || invoice.createdAt;
  const formattedInvoiceDate = invoiceDateValue ? new Date(invoiceDateValue).toLocaleDateString("en-GB") : "";
  const formattedQuotationDate = quotationDateValue ? new Date(quotationDateValue).toLocaleDateString("en-GB") : "";

  const lines = [
    String(typeLabel || "INVOICE").toUpperCase(),
    `Reference No: ${invoice.invoice_no || ""}`,
    `Date: ${String(typeLabel || "").toLowerCase().includes("quatation") ? formattedQuotationDate : formattedInvoiceDate}`,
    `Customer: ${customer?.name || ""}`,
    customer?.email ? `Email: ${customer.email}` : "",
    customer?.address ? `Address: ${customer.address}` : "",
    customer?.tel ? `Tel: ${customer.tel}` : "",
    "",
    "Items:",
  ].filter(Boolean);

  (items || []).forEach((item, idx) => {
    const product = item.Product || {};
    const description = `${product.product_id || ""} ${product.description || product.model || ""}`.trim();
    lines.push(
      `${idx + 1}. ${description} | Qty: ${Number(item.qty || 0)} | Rate: ${Number(item.rate || 0).toFixed(2)} | VAT: ${Number(item.vat || 0).toFixed(2)} | Gross: ${Number(item.gross || 0).toFixed(2)}`
    );
  });

  lines.push("");
  lines.push(`Total Amount: ${Number(invoice.total_amount || 0).toFixed(2)}`);
  return buildBasicPdf(lines);
}

async function loadInvoicesForBackup(databaseName, invoiceIds = null) {
  const targetDb = normalizeDatabaseName(databaseName) || INVENTORY_DB_NAME;
  await db.registerDatabase(targetDb);
  return db.withDatabase(targetDb, async () => {
    const where = Array.isArray(invoiceIds) && invoiceIds.length
      ? { id: invoiceIds.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0) }
      : undefined;
    return Invoice.findAll({
      where,
      include: [
        { model: Customer, attributes: ["id", "name", "address", "tel", "email"] },
        { model: InvoiceItem, include: [{ model: Product, attributes: ["id", "product_id", "description", "model"] }] },
      ],
      order: [["invoice_date", "DESC"], ["id", "DESC"]],
    });
  });
}

async function backupSingleInvoiceToDrive(drive, settings, databaseName, invoiceLike) {
  const invoice = invoiceLike && typeof invoiceLike.toJSON === "function" ? invoiceLike.toJSON() : (invoiceLike || {});
  const customer = invoiceLike?.Customer || invoice.Customer || {};
  const items = invoiceLike?.InvoiceItems || invoice.InvoiceItems || [];

  const invoiceDateIso = normalizeIsoDate(invoice.invoice_date) || toIsoDate(invoice.createdAt);
  const { year: invoiceYear } = splitIsoDateParts(invoiceDateIso);
  const quotationDateIso =
    normalizeIsoDate(invoice.quotation_date) ||
    normalizeIsoDate(invoice.invoice_date) ||
    toIsoDate(invoice.createdAt);
  const { year: quotationYear } = splitIsoDateParts(quotationDateIso);
  const rootName = sanitizeDriveName(settings.drive_root_folder_name || "AXIS CMS PULMO", "AXIS CMS PULMO");
  const invoiceNoSafe = safeFilePart(invoice.invoice_no || `INV_${invoice.id}`, "invoice");
  const customerSafe = safeFilePart(customer?.name || "customer", "customer");

  let invoiceBacked = 0;
  let quotationBacked = 0;

  if (settings.auto_backup_invoice) {
    const folder = await ensureFolderPath(drive, rootName, ["Invoice", invoiceYear]);
    const fileName = `Invoice_${invoiceNoSafe}_${customerSafe}.pdf`;
    const pdfBuffer = buildInvoiceStylePdfBuffer("INVOICE", invoice, customer, items);
    const uploaded = await uploadBufferFile(drive, {
      parentId: folder.folderId,
      fileName,
      mimeType: "application/pdf",
      buffer: pdfBuffer,
    });
    await upsertBackupEntry({
      databaseName,
      entryType: "invoice",
      recordKey: `${invoice.id}:invoice`,
      driveFileId: uploaded?.id,
      driveFileName: uploaded?.name || fileName,
      driveFolderPath: folder.folderPath,
      fileSizeBytes: Number(uploaded?.size || pdfBuffer.length || 0),
      backupDate: new Date().toISOString(),
      metadata: {
        invoice_id: Number(invoice.id || 0),
        invoice_no: String(invoice.invoice_no || ""),
        customer_name: String(customer?.name || ""),
      },
    });
    invoiceBacked += 1;
  }

  if (settings.auto_backup_quotation) {
    const folder = await ensureFolderPath(drive, rootName, ["Quatation", quotationYear]);
    const fileName = `Quatation_${invoiceNoSafe}_${customerSafe}.pdf`;
    const pdfBuffer = buildInvoiceStylePdfBuffer("QUATATION", invoice, customer, items);
    const uploaded = await uploadBufferFile(drive, {
      parentId: folder.folderId,
      fileName,
      mimeType: "application/pdf",
      buffer: pdfBuffer,
    });
    await upsertBackupEntry({
      databaseName,
      entryType: "quotation",
      recordKey: `${invoice.id}:quotation`,
      driveFileId: uploaded?.id,
      driveFileName: uploaded?.name || fileName,
      driveFolderPath: folder.folderPath,
      fileSizeBytes: Number(uploaded?.size || pdfBuffer.length || 0),
      backupDate: new Date().toISOString(),
      metadata: {
        invoice_id: Number(invoice.id || 0),
        invoice_no: String(invoice.invoice_no || ""),
        customer_name: String(customer?.name || ""),
      },
    });
    quotationBacked += 1;
  }

  return {
    invoice_backed: invoiceBacked,
    quotation_backed: quotationBacked,
  };
}

async function syncInvoiceQuotationBackupsInternal(databaseName, invoiceIds = null) {
  const settingsRow = await getOrCreateBackupSettings(databaseName);
  const settings = toPublicSettings(settingsRow);
  if (!settings.auto_backup_invoice && !settings.auto_backup_quotation) {
    return {
      synced_invoices: 0,
      synced_quotations: 0,
      total_invoices: 0,
      skipped: true,
      reason: "Invoice/Quotation auto backup is disabled.",
    };
  }

  requireDriveReady(settingsRow);
  const drive = await createDriveClientFromSettings(settingsRow);
  const invoices = await loadInvoicesForBackup(databaseName, invoiceIds);

  let syncedInvoices = 0;
  let syncedQuotations = 0;
  for (const invoice of Array.isArray(invoices) ? invoices : []) {
    const one = await backupSingleInvoiceToDrive(drive, settings, databaseName, invoice);
    syncedInvoices += Number(one.invoice_backed || 0);
    syncedQuotations += Number(one.quotation_backed || 0);
  }

  return {
    synced_invoices: syncedInvoices,
    synced_quotations: syncedQuotations,
    total_invoices: Array.isArray(invoices) ? invoices.length : 0,
    skipped: false,
  };
}

async function removeInvoiceBackupsInternal(databaseName, invoiceId) {
  const numericInvoiceId = Number(invoiceId || 0);
  if (!Number.isFinite(numericInvoiceId) || numericInvoiceId <= 0) {
    return { deleted_entries: 0, deleted_drive_files: 0, skipped: true };
  }
  await ensureBackupTables();
  const targetDb = normalizeDatabaseName(databaseName) || INVENTORY_DB_NAME;

  const recordKeys = [`${numericInvoiceId}:invoice`, `${numericInvoiceId}:quotation`];

  const rows = await db.withDatabase(INVENTORY_DB_NAME, async () => {
    const rs = await db.query(
      `SELECT *
       FROM ${BACKUP_ENTRIES_TABLE}
       WHERE LOWER(database_name) = LOWER($1)
         AND record_key = ANY($2)
         AND LOWER(entry_type) = ANY($3)`,
      {
        bind: [targetDb, recordKeys, ["invoice", "quotation"]],
      }
    );
    return rowsOf(rs);
  });

  let deletedDriveFiles = 0;
  try {
    const settingsRow = await getOrCreateBackupSettings(targetDb);
    if (Boolean(settingsRow?.drive_enabled) && String(settingsRow?.drive_credentials_json || "").trim()) {
      const drive = await createDriveClientFromSettings(settingsRow);
      for (const row of rows) {
        const fileId = String(row?.drive_file_id || "").trim();
        if (!fileId) continue;
        const status = await deleteFileSafe(drive, fileId);
        if (status.deleted || status.missing) {
          deletedDriveFiles += 1;
        }
      }
    }
  } catch (err) {
    console.error("Invoice backup delete warning:", err?.message || err);
  }

  const deletedEntries = await deleteBackupEntriesByRecordKeys(targetDb, ["invoice", "quotation"], recordKeys);
  return {
    deleted_entries: deletedEntries,
    deleted_drive_files: deletedDriveFiles,
    skipped: false,
  };
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (_err) {
    return false;
  }
}

async function resolvePgTool(toolName, envOverrideName) {
  const override = String(process.env[envOverrideName] || "").trim();
  if (override) {
    return override;
  }

  if (process.platform !== "win32") {
    return toolName;
  }

  const exe = `${toolName}.exe`;
  const absoluteCandidates = [];
  for (let version = 20; version >= 10; version -= 1) {
    absoluteCandidates.push(`C:\\Program Files\\PostgreSQL\\${version}\\bin\\${exe}`);
    absoluteCandidates.push(`C:\\Program Files (x86)\\PostgreSQL\\${version}\\bin\\${exe}`);
  }

  for (const candidate of absoluteCandidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  return exe;
}

function runProcess(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, shell: false });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `${command} failed with code ${code}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function checkToolAvailable(command, env) {
  try {
    await runProcess(command, ["--version"], env);
    return true;
  } catch (_err) {
    return false;
  }
}

function buildDbArgs({ host, port, user, database }) {
  return ["-h", host, "-p", String(port), "-U", user, database];
}

function sanitizeSqlForCompatibility(sqlText) {
  const unsupportedParams = [
    "transaction_timeout",
    "idle_session_timeout",
    "idle_in_transaction_session_timeout",
  ];
  const unsupportedPattern = unsupportedParams.join("|");

  return sqlText
    .replace(
      new RegExp(`^\\s*SET\\s+(${unsupportedPattern})\\s*=.*;?\\s*$`, "gim"),
      ""
    )
    .replace(
      new RegExp(
        `^\\s*SELECT\\s+pg_catalog\\.set_config\\(\\s*'(${unsupportedPattern})'\\s*,.*;?\\s*$`,
        "gim"
      ),
      ""
    )
    .replace(
      new RegExp(
        `^\\s*ALTER\\s+(?:SYSTEM|DATABASE|ROLE)\\b.*\\bSET\\s+(${unsupportedPattern})\\b.*;?\\s*$`,
        "gim"
      ),
      ""
    );
}

function buildRestoreSql(sqlText) {
  const truncateExistingDataSql = `
DO $$
DECLARE
  stmt text;
BEGIN
  SELECT string_agg(
    format('TRUNCATE TABLE %I.%I RESTART IDENTITY CASCADE', schemaname, tablename),
    '; '
  )
  INTO stmt
  FROM pg_tables
  WHERE schemaname = 'public';

  IF stmt IS NOT NULL THEN
    EXECUTE stmt;
  END IF;
END $$;
`;

  return `${truncateExistingDataSql}\n${sqlText}`;
}

async function generateDatabaseBackupBuffer(databaseName, mode = "full") {
  const targetDb = normalizeDatabaseName(databaseName) || INVENTORY_DB_NAME;
  const host = process.env.DB_HOST || "localhost";
  const port = Number(process.env.DB_PORT || 5432);
  const user = process.env.DB_USER || "postgres";
  const password = process.env.DB_PASSWORD || "";
  const pgDumpPath = await resolvePgTool("pg_dump", "PG_DUMP_PATH");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const isFull = String(mode || "").trim().toLowerCase() === "full";
  const fileName = isFull
    ? `${targetDb}_full_backup_${timestamp}.sql`
    : `${targetDb}_data_backup_${timestamp}.sql`;
  const tempPath = path.join(os.tmpdir(), fileName);

  try {
    const args = [
      ...buildDbArgs({ host, port, user, database: targetDb }),
      "-f",
      tempPath,
      "--inserts",
      "--column-inserts",
    ];
    if (!isFull) {
      args.push("--data-only");
    }
    const env = { ...process.env, PGPASSWORD: password };
    await runProcess(pgDumpPath, args, env);
    const data = await fs.readFile(tempPath);
    return { buffer: data, fileName };
  } finally {
    await fs.unlink(tempPath).catch(() => {});
  }
}

async function uploadDatabaseBackupToDrive(databaseName, forDateIso = null) {
  const targetDb = normalizeDatabaseName(databaseName) || INVENTORY_DB_NAME;
  const settingsRow = await getOrCreateBackupSettings(targetDb);
  requireDriveReady(settingsRow);

  const settings = toPublicSettings(settingsRow);
  const { isoDate, year, month } = splitIsoDateParts(forDateIso || toIsoDate());
  const drive = await createDriveClientFromSettings(settingsRow);
  const folder = await ensureFolderPath(drive, settings.drive_root_folder_name, ["Database", year, month]);

  const sql = await generateDatabaseBackupBuffer(targetDb, "full");
  const baseName = `${targetDb}_backup_${isoDate}.sql`;

  const uploaded = await uploadBufferFile(drive, {
    parentId: folder.folderId,
    fileName: baseName,
    mimeType: "application/sql",
    buffer: sql.buffer,
  });

  const entry = await upsertBackupEntry({
    databaseName: targetDb,
    entryType: "db",
    recordKey: isoDate,
    driveFileId: uploaded?.id,
    driveFileName: uploaded?.name || baseName,
    driveFolderPath: folder.folderPath,
    fileSizeBytes: Number(uploaded?.size || sql.buffer.length || 0),
    backupDate: new Date().toISOString(),
    metadata: { date: isoDate, database_name: targetDb },
  });

  await db.withDatabase(INVENTORY_DB_NAME, async () => {
    await db.query(
      `UPDATE ${BACKUP_SETTINGS_TABLE}
       SET last_db_backup_date = $2,
           "updatedAt" = NOW()
       WHERE LOWER(database_name) = LOWER($1)`,
      { bind: [targetDb, isoDate] }
    );
  });

  return {
    database_name: targetDb,
    date: isoDate,
    entry,
    file_name: uploaded?.name || baseName,
    file_size_bytes: Number(uploaded?.size || sql.buffer.length || 0),
    folder_path: folder.folderPath,
  };
}

async function ensureDailyDatabaseBackupIfEnabled(databaseName) {
  const targetDb = normalizeDatabaseName(databaseName) || INVENTORY_DB_NAME;
  const settingsRow = await getOrCreateBackupSettings(targetDb);
  const settings = toPublicSettings(settingsRow);
  if (!settings.auto_backup_database) {
    return { skipped: true, reason: "Auto DB backup disabled." };
  }
  if (!settings.drive_enabled || !settings.credentials_saved) {
    return { skipped: true, reason: "Google Drive not configured." };
  }

  const todayIso = toIsoDate();
  if (String(settings.last_db_backup_date || "") === todayIso) {
    return { skipped: true, reason: "Today backup already exists." };
  }

  const saved = await uploadDatabaseBackupToDrive(targetDb, todayIso);
  return { skipped: false, created: true, backup: saved };
}

async function syncDatabaseEntriesWithDrive(databaseName) {
  const targetDb = normalizeDatabaseName(databaseName) || INVENTORY_DB_NAME;
  const settingsRow = await getOrCreateBackupSettings(targetDb);
  const settings = toPublicSettings(settingsRow);
  let entries = await getBackupEntries(targetDb, "db");

  if (!(settings.drive_enabled && settings.credentials_saved)) {
    return entries;
  }

  let drive = null;
  try {
    drive = await createDriveClientFromSettings(settingsRow);
  } catch (err) {
    console.error("Drive sync warning:", err?.message || err);
    return entries;
  }

  const missingRecordKeys = [];
  for (const entry of entries) {
    const fileId = String(entry?.drive_file_id || "").trim();
    if (!fileId) {
      missingRecordKeys.push(String(entry?.record_key || "").trim());
      continue;
    }
    try {
      const meta = await getFileMetadataSafe(drive, fileId);
      if (!meta) {
        missingRecordKeys.push(String(entry?.record_key || "").trim());
        continue;
      }

      const changedName = String(meta.name || "") !== String(entry.drive_file_name || "");
      const changedSize = Number(meta.size || 0) !== Number(entry.file_size_bytes || 0);
      if (changedName || changedSize) {
        await upsertBackupEntry({
          databaseName: targetDb,
          entryType: "db",
          recordKey: String(entry.record_key || ""),
          driveFileId: String(meta.id || fileId),
          driveFileName: String(meta.name || entry.drive_file_name || ""),
          driveFolderPath: String(entry.drive_folder_path || ""),
          fileSizeBytes: Number(meta.size || 0),
          backupDate: entry.backup_date || new Date().toISOString(),
          metadata: (() => {
            try {
              return entry.metadata_json ? JSON.parse(entry.metadata_json) : null;
            } catch (_err) {
              return null;
            }
          })(),
        });
      }
    } catch (err) {
      console.error("Drive metadata check warning:", err?.message || err);
    }
  }

  if (missingRecordKeys.length) {
    await deleteBackupEntriesByRecordKeys(targetDb, ["db"], missingRecordKeys);
  }

  entries = await getBackupEntries(targetDb, "db");
  return entries;
}

exports.getBackupStatus = async (_req, res) => {
  try {
    const pgDumpPath = await resolvePgTool("pg_dump", "PG_DUMP_PATH");
    const psqlPath = await resolvePgTool("psql", "PSQL_PATH");
    const env = { ...process.env };
    const pgDumpOk = await checkToolAvailable(pgDumpPath, env);
    const psqlOk = await checkToolAvailable(psqlPath, env);

    return res.json({
      ok: pgDumpOk && psqlOk,
      tools: {
        pg_dump: { command: pgDumpPath, available: pgDumpOk },
        psql: { command: psqlPath, available: psqlOk },
      },
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Failed to check PostgreSQL tools." });
  }
};

exports.downloadBackup = async (req, res) => {
  try {
    const targetDb = await resolveTargetDatabaseName(req, req.query?.database_name);
    const mode = String(req.query?.mode || "data").trim().toLowerCase() === "full" ? "full" : "data";
    const generated = await generateDatabaseBackupBuffer(targetDb, mode);
    res.setHeader("Content-Type", "application/sql; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${generated.fileName}"`);
    res.send(generated.buffer);
  } catch (err) {
    const isMissingTool = err && (err.code === "ENOENT" || String(err.message || "").includes("ENOENT"));
    if (isMissingTool) {
      return res.status(500).json({
        message:
          "PostgreSQL backup tool not found. Install PostgreSQL client tools or set PG_DUMP_PATH in backend/.env, e.g. C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe",
      });
    }
    res.status(500).json({
      message:
        err.message ||
        "Failed to generate backup. Ensure PostgreSQL tools (pg_dump) are installed and DB credentials are correct.",
    });
  }
};

exports.restoreBackup = async (req, res) => {
  const sqlText = String(req.body?.sqlText || "");
  const fileName = String(req.body?.fileName || "uploaded_backup.sql");

  if (!sqlText.trim()) {
    return res.status(400).json({ message: "Backup file content is empty." });
  }

  if (!/\.sql$/i.test(fileName)) {
    return res.status(400).json({ message: "Only .sql backup files are allowed." });
  }

  let tempFile = "";
  try {
    const targetDb = await resolveTargetDatabaseName(req, req.body?.database_name);
    const host = process.env.DB_HOST || "localhost";
    const port = Number(process.env.DB_PORT || 5432);
    const user = process.env.DB_USER || "postgres";
    const password = process.env.DB_PASSWORD || "";
    const psqlPath = await resolvePgTool("psql", "PSQL_PATH");
    const tempFileName = `restore_${Date.now()}_${fileName.replace(/[^\w.-]/g, "_")}`;
    tempFile = path.join(os.tmpdir(), tempFileName);
    const args = [...buildDbArgs({ host, port, user, database: targetDb }), "-v", "ON_ERROR_STOP=1", "-f", tempFile];
    const env = { ...process.env, PGPASSWORD: password };

    const sanitizedSql = sanitizeSqlForCompatibility(sqlText);
    const restoreSql = buildRestoreSql(sanitizedSql);

    await fs.writeFile(tempFile, restoreSql, "utf8");
    await runProcess(psqlPath, args, env);
    return res.json({ message: "Database restore completed successfully." });
  } catch (err) {
    const isMissingTool = err && (err.code === "ENOENT" || String(err.message || "").includes("ENOENT"));
    if (isMissingTool) {
      return res.status(500).json({
        message:
          "PostgreSQL restore tool not found. Install PostgreSQL client tools or set PSQL_PATH in backend/.env, e.g. C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe",
      });
    }
    return res.status(500).json({
      message:
        err.message ||
        "Failed to restore backup. Ensure PostgreSQL tools (psql) are installed and the SQL file is valid.",
    });
  } finally {
    if (tempFile) {
      await fs.unlink(tempFile).catch(() => {});
    }
  }
};

exports.getBackupConfig = async (req, res) => {
  try {
    const targetDb = await resolveTargetDatabaseName(req, req.query?.database_name);
    const settingsRow = await getOrCreateBackupSettings(targetDb);
    res.json({
      database_name: targetDb,
      settings: toPublicSettings(settingsRow),
    });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to load backup configuration." });
  }
};

exports.saveBackupConfig = async (req, res) => {
  try {
    const targetDb = await resolveTargetDatabaseName(req, req.body?.database_name);
    const requesterId = Number(req.user?.id || req.user?.userId || 0) || null;
    const beforeRow = await getOrCreateBackupSettings(targetDb);
    const before = toPublicSettings(beforeRow);
    const saved = await saveBackupSettings(targetDb, req.body || {}, requesterId);
    const after = toPublicSettings(saved);

    const autoActions = {
      invoice_quotation_sync: { attempted: false, skipped: true },
      daily_db_backup: { attempted: false, skipped: true },
    };

    const turnedOnInvoiceBackup = (!before.auto_backup_invoice && after.auto_backup_invoice);
    const turnedOnQuotationBackup = (!before.auto_backup_quotation && after.auto_backup_quotation);
    const turnedOnDbBackup = (!before.auto_backup_database && after.auto_backup_database);
    const driveReady = Boolean(after.drive_enabled && after.credentials_saved);

    if (driveReady && (turnedOnInvoiceBackup || turnedOnQuotationBackup)) {
      autoActions.invoice_quotation_sync.attempted = true;
      try {
        const syncResult = await syncInvoiceQuotationBackupsInternal(targetDb, null);
        autoActions.invoice_quotation_sync = {
          attempted: true,
          skipped: Boolean(syncResult?.skipped),
          result: syncResult,
        };
      } catch (syncErr) {
        autoActions.invoice_quotation_sync = {
          attempted: true,
          skipped: true,
          error: syncErr?.message || "Invoice/Quotation auto sync failed.",
        };
      }
    }

    if (driveReady && turnedOnDbBackup) {
      autoActions.daily_db_backup.attempted = true;
      try {
        const dbResult = await ensureDailyDatabaseBackupIfEnabled(targetDb);
        autoActions.daily_db_backup = {
          attempted: true,
          skipped: Boolean(dbResult?.skipped),
          result: dbResult,
        };
      } catch (dbErr) {
        autoActions.daily_db_backup = {
          attempted: true,
          skipped: true,
          error: dbErr?.message || "Daily DB backup run failed.",
        };
      }
    }

    res.json({
      message: "Backup configuration saved.",
      database_name: targetDb,
      settings: after,
      auto_actions: autoActions,
    });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to save backup configuration." });
  }
};

exports.testGoogleDriveConnection = async (req, res) => {
  try {
    const targetDb = await resolveTargetDatabaseName(req, req.body?.database_name || req.query?.database_name);
    const settingsRow = await getOrCreateBackupSettings(targetDb);

    const merged = {
      ...settingsRow,
      drive_root_folder_name: String(req.body?.drive_root_folder_name || settingsRow.drive_root_folder_name || "AXIS CMS PULMO"),
      drive_credentials_json: Object.prototype.hasOwnProperty.call(req.body || {}, "drive_credentials_json")
        ? String(req.body?.drive_credentials_json || "").trim()
        : String(settingsRow.drive_credentials_json || "").trim(),
    };

    if (!String(merged.drive_credentials_json || "").trim()) {
      return res.status(400).json({
        message:
          "No saved Google Drive credentials for this database. Paste Service Account JSON and click Save Backup Settings first.",
      });
    }

    const result = await testDriveConnection(merged);
    res.json({
      message: "Google Drive connection successful.",
      database_name: targetDb,
      result,
    });
  } catch (err) {
    res.status(500).json({ message: err.message || "Google Drive connection failed." });
  }
};

exports.syncInvoiceQuotationBackups = async (req, res) => {
  try {
    const targetDb = await resolveTargetDatabaseName(req, req.body?.database_name || req.query?.database_name);
    const result = await syncInvoiceQuotationBackupsInternal(targetDb, null);
    res.json({
      message: result.skipped
        ? result.reason || "Invoice/Quotation backup skipped."
        : "Invoice/Quotation backup sync completed.",
      database_name: targetDb,
      result,
    });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to sync invoice/quotation backups." });
  }
};

exports.runDatabaseBackupNow = async (req, res) => {
  try {
    const targetDb = await resolveTargetDatabaseName(req, req.body?.database_name || req.query?.database_name);
    const backup = await uploadDatabaseBackupToDrive(targetDb, toIsoDate());
    res.json({
      message: "Database backup uploaded to Google Drive.",
      database_name: targetDb,
      backup,
    });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to run database backup." });
  }
};

exports.listDatabaseBackupHistory = async (req, res) => {
  try {
    const targetDb = await resolveTargetDatabaseName(req, req.query?.database_name || req.body?.database_name);
    const autoRun = parseBool(req.query?.auto_run_daily, true);

    let autoResult = { skipped: true, reason: "Not requested." };
    if (autoRun) {
      autoResult = await ensureDailyDatabaseBackupIfEnabled(targetDb);
    }

    const entries = await syncDatabaseEntriesWithDrive(targetDb);
    res.json({
      database_name: targetDb,
      auto_daily: autoResult,
      backups: (entries || []).map((row) => ({
        id: Number(row.id || 0),
        database_name: normalizeDatabaseName(row.database_name) || targetDb,
        entry_type: String(row.entry_type || "").toLowerCase(),
        record_key: String(row.record_key || ""),
        drive_file_id: String(row.drive_file_id || ""),
        drive_file_name: String(row.drive_file_name || ""),
        drive_folder_path: String(row.drive_folder_path || ""),
        file_size_bytes: Number(row.file_size_bytes || 0),
        backup_date: row.backup_date || row.updatedAt || row.createdAt || null,
      })),
    });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to load database backup history." });
  }
};

exports.queueAutoInvoiceBackup = async (databaseName, invoiceId) => {
  try {
    const targetDb = normalizeDatabaseName(databaseName) || INVENTORY_DB_NAME;
    return await syncInvoiceQuotationBackupsInternal(targetDb, [invoiceId]);
  } catch (err) {
    console.error("Auto invoice backup warning:", err?.message || err);
    return { skipped: true, reason: err?.message || "Auto invoice backup failed." };
  }
};

exports.handleInvoiceDeletionBackup = async (databaseName, invoiceId) => {
  try {
    const targetDb = normalizeDatabaseName(databaseName) || INVENTORY_DB_NAME;
    return await removeInvoiceBackupsInternal(targetDb, invoiceId);
  } catch (err) {
    console.error("Invoice backup delete warning:", err?.message || err);
    return { skipped: true, reason: err?.message || "Invoice backup delete failed." };
  }
};

exports.queueDailyDatabaseBackup = async (databaseName) => {
  try {
    const targetDb = normalizeDatabaseName(databaseName) || INVENTORY_DB_NAME;
    return await ensureDailyDatabaseBackupIfEnabled(targetDb);
  } catch (err) {
    console.error("Daily database backup warning:", err?.message || err);
    return { skipped: true, reason: err?.message || "Daily database backup failed." };
  }
};
