const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const { spawn } = require("child_process");
const db = require("../config/database");
const User = require("../models/User");
const UserAccess = require("../models/UserAccess");
const UiSetting = require("../models/UiSetting");
const EmailSetup = require("../models/EmailSetup");
const Category = require("../models/Category");
const CategoryModelOption = require("../models/CategoryModelOption");
const DEMO_DB_NAME = "demo";
const INVENTORY_DB_NAME = "inventory";
const RESERVED_DATABASES = new Set(["postgres", "template0", "template1"]);
const DATABASE_REGISTRY_TABLE = "company_databases";
const DATABASE_STORAGE_ROOT = path.resolve(__dirname, "../storage/databases");
const COMPANY_REGISTRY_TABLE = "company_profiles";
const COMPANY_STORAGE_ROOT = path.resolve(__dirname, "../storage/companies");
const COMPANY_LOGO_EXTENSIONS = new Set([".jpg", ".jpeg", ".bmp", ".gif", ".tiff", ".tif", ".png"]);
const USER_INVOICE_MAPPING_TABLE = "user_invoice_mappings";
const USER_QUOTATION_RENDER_TABLE = "user_quotation_render_settings";
const INV_MAP_PATH = "/users/inv-map.html";
const QUOTATION2_RENDER_KEYS = new Set([
  "customerName",
  "customerAddress",
  "customerTel",
  "count",
  "serialNo",
  "date",
  "invoiceNo",
  "machineTitle",
  "supportTechnician",
  "paymentMethod",
  "amountWords",
  "totalAmount",
  "important",
  "itemNo",
  "description",
  "qty",
  "rate",
  "vat",
  "grossAmount",
  "signC",
  "sealC",
]);
const QUOTATION3_RENDER_KEYS = new Set([
  "customerName",
  "customerAddress",
  "customerTel",
  "count",
  "serialNo",
  "date",
  "invoiceNo",
  "machineTitle",
  "supportTechnician",
  "paymentMethod",
  "amountWords",
  "totalAmount",
  "important",
  "itemNo",
  "description",
  "qty",
  "rate",
  "vat",
  "grossAmount",
  "logoWithName",
  "addressColombo",
  "addressV",
  "signC",
  "signV",
  "sealC",
  "sealV",
]);
const ensuredUiSettingsDbSet = new Set();
const DEFAULT_CATEGORIES = [
  "Photocopier",
  "Printer",
  "Plotter",
  "Computer",
  "Laptop",
  "Accessory",
  "Consumable",
  "Machine",
  "CCTV",
  "Duplo",
  "Other",
  "Service",
];
const DEFAULT_CATEGORY_MODELS = {
  Accessory: ["CANON", "TOSHIBA", "RECOH", "SHARP", "KYOCERA", "SEROX", "SAMSUNG", "HP", "DELL"],
  Consumable: ["CANON", "TOSHIBA", "RECOH", "SHARP", "KYOCERA", "SEROX", "SAMSUNG", "HP", "DELL"],
  Machine: ["CANON", "TOSHIBA", "RECOH", "SHARP", "KYOCERA", "SEROX", "SAMSUNG", "HP", "DELL"],
  Photocopier: ["CANON", "TOSHIBA", "RECOH", "SHARP", "KYOCERA", "SEROX", "SAMSUNG", "HP", "DELL"],
  Printer: ["CANON", "HP", "EPSON", "BROTHER", "LEXMARK", "OTHER", "SEROX", "SAMSUNG"],
  Computer: ["HP", "DELL", "ASUS", "SONY", "SINGER", "SAMSUNG", "SPARE PARTS", "OTHER"],
  Laptop: ["HP", "DELL", "ASUS", "SONY", "SINGER", "SAMSUNG", "SPARE PARTS", "OTHER"],
  Plotter: ["CANON", "HP", "EPSON", "OTHER"],
  CCTV: ["HICKVISION", "DAHUA", "OTHER"],
  Duplo: ["RONGDA", "RISO", "RECOH", "DUPLO"],
  Other: ["OTHER"],
  Service: ["OTHER"],
};

const ACCESS_MODULE_OPTIONS = [
  {
    module: "Products",
    items: [
      { path: "/products/product-list.html", label: "Products List", actions: ["view", "add", "edit", "delete"] },
      { path: "/products/add-product.html", label: "Add Product", actions: ["view", "add"] },
      { path: "/products/edit-product.html", label: "Edit Product", actions: ["view", "edit"] },
      { path: "/products/general-machine.html", label: "General Machines", actions: ["view", "add", "edit", "delete"] },
      { path: "/products/add-general-machine.html", label: "Add General Machine", actions: ["view", "add"] },
      { path: "/products/edit-general-machine.html", label: "Edit General Machine", actions: ["view", "edit"] },
      { path: "/products/machine.html", label: "Rental Machines", actions: ["view", "add", "edit", "delete"] },
      { path: "/products/add-rental-machine.html", label: "Add Rental Machine", actions: ["view", "add"] },
      { path: "/products/edit-rental-machine.html", label: "Edit Rental Machine", actions: ["view", "edit"] },
      { path: "/products/add-rental-count.html", label: "Rental Count", actions: ["view", "add", "edit", "delete"] },
      { path: "/products/add-rental-consumable.html", label: "Rental Consumables", actions: ["view", "add", "edit", "delete"] },
    ],
  },
  {
    module: "Customers",
    items: [
      { path: "/customers/customer-list.html", label: "Customers List", actions: ["view", "add", "edit", "delete"] },
      { path: "/customers/add-customer.html", label: "Add Customer", actions: ["view", "add"] },
      { path: "/customers/edit-customer.html", label: "Edit Customer", actions: ["view", "edit"] },
    ],
  },
  {
    module: "Vendors",
    items: [
      { path: "/vendors/list-vendor.html", label: "Vendors List", actions: ["view", "add", "edit", "delete"] },
      { path: "/vendors/add-vendor.html", label: "Add Vendor", actions: ["view", "add"] },
      { path: "/vendors/edit-vendor.html", label: "Edit Vendor", actions: ["view", "edit"] },
    ],
  },
  {
    module: "Expenses",
    items: [
      { path: "/expenses/expense-list.html", label: "Expenses List", actions: ["view", "add", "edit", "delete"] },
      { path: "/expenses/add-expense.html", label: "Add Expense", actions: ["view", "add"] },
      { path: "/expenses/edit-expense.html", label: "Edit Expense", actions: ["view", "edit"] },
    ],
  },
  {
    module: "Invoices",
    items: [
      { path: "/invoices/invoice-list.html", label: "Invoice List", actions: ["view", "add", "edit", "delete"] },
      { path: "/invoices/create-invoice.html", label: "Create Invoice", actions: ["view", "add", "edit"] },
      { path: "/invoices/view-invoice.html", label: "View Invoice", actions: ["view"] },
      { path: "/invoices/view-quotation.html", label: "View Quotation", actions: ["view"] },
      { path: "/invoices/view-quotation-2.html", label: "View Quotation 2", actions: ["view"] },
      { path: "/invoices/view-quotation-3.html", label: "View Quotation 3", actions: ["view"] },
    ],
  },
  {
    module: "Reports & Analytics",
    items: [
      { path: "/reports/sales-report.html", label: "Sales Report", actions: ["view"] },
      { path: "/analytics/sales-chart.html", label: "Sales Chart", actions: ["view"] },
      { path: "/finance/finance.html", label: "Finance", actions: ["view"] },
      { path: "/finance/payments.html", label: "Payments", actions: ["view"] },
      { path: "/finance/pendings.html", label: "Pendings", actions: ["view"] },
      { path: "/stock/stock.html", label: "Stock", actions: ["view", "edit"] },
    ],
  },
  {
    module: "Communication",
    items: [
      { path: "/messages/messages.html", label: "Messages", actions: ["view", "add", "delete"] },
      { path: "/notifications/notifications.html", label: "Notifications", actions: ["view"] },
      { path: "/support/support.html", label: "Support", actions: ["view", "add", "edit", "delete"] },
      { path: "/support/warrenty.html", label: "Warrenty", actions: ["view"] },
      { path: "/users/technician-list.html", label: "Support Technician", actions: ["view", "add", "edit", "delete"] },
    ],
  },
  {
    module: "Users",
    items: [
      { path: "/users/user-list.html", label: "User List", actions: ["view", "add", "edit", "delete"] },
      { path: "/users/add-user.html", label: "Add User", actions: ["view", "add"] },
      { path: "/users/edit-user.html", label: "Edit User", actions: ["view", "edit"] },
      { path: "/users/user-access.html", label: "User Access", actions: ["view", "edit"] },
      { path: "/users/db-create.html", label: "DB Create", actions: ["view", "add", "delete"] },
      { path: "/users/company-create.html", label: "Company Create", actions: ["view", "add", "delete"] },
      { path: "/users/mapped.html", label: "Mapped", actions: ["view", "add"] },
      { path: "/users/inv-map.html", label: "Inv Map", actions: ["view", "add", "delete"] },
      { path: "/users/preference.html", label: "Preference", actions: ["view", "edit"] },
      { path: "/users/user-logged.html", label: "User Logged Times", actions: ["view"] },
      { path: "/support/email-setup.html", label: "Email Setup", actions: ["view", "edit"] },
      { path: "/tools/check-backup.html", label: "Check Tools Button", actions: ["view"] },
      { path: "/tools/backup-download.html", label: "Backup Button", actions: ["view"] },
      { path: "/tools/upload-db.html", label: "Upload DB Button", actions: ["view"] },
    ],
  },
  {
    module: "Core",
    items: [
      { path: "/dashboard.html", label: "Dashboard", actions: ["view"] },
      { path: "/users/super-user-admin.html", label: "Super User Admin", actions: ["view"] },
    ],
  },
];

const EXCLUDED_PAGES = new Set([]);

function toActionKey(path, action) {
  return `${String(path || "").trim().toLowerCase()}::${String(action || "").trim().toLowerCase()}`;
}

const ACCESS_PAGE_OPTIONS = ACCESS_MODULE_OPTIONS
  .flatMap((group) => group.items || [])
  .filter((item) => !EXCLUDED_PAGES.has(String(item.path || "").toLowerCase()));

const ACCESS_PATH_SET = new Set(ACCESS_PAGE_OPTIONS.map((x) => String(x.path || "").trim().toLowerCase()));

const ACCESS_ACTION_SET = new Set(
  ACCESS_PAGE_OPTIONS.flatMap((item) =>
    (Array.isArray(item.actions) ? item.actions : [])
      .map((action) => toActionKey(item.path, action))
  )
);

function normalizePages(rawPages) {
  const list = Array.isArray(rawPages) ? rawPages : [];
  return Array.from(
    new Set(
      list
        .map((p) => String(p || "").trim())
        .filter(Boolean)
        .filter((p) => !EXCLUDED_PAGES.has(p.toLowerCase()))
        .filter((p) => ACCESS_PATH_SET.has(p.toLowerCase()))
    )
  );
}

function normalizeActions(rawActions) {
  const list = Array.isArray(rawActions) ? rawActions : [];
  return Array.from(
    new Set(
      list
        .map((x) => String(x || "").trim().toLowerCase())
        .filter(Boolean)
        .filter((x) => ACCESS_ACTION_SET.has(x))
    )
  );
}

function expandImplicitActionDependencies(actionKeys) {
  const set = new Set((Array.isArray(actionKeys) ? actionKeys : []).map((x) => String(x || "").trim().toLowerCase()).filter(Boolean));
  const add = (path, action) => set.add(toActionKey(path, action));

                                                                              
  if (set.has(toActionKey("/products/product-list.html", "edit"))) {
    add("/products/edit-product.html", "view");
    add("/products/edit-product.html", "edit");
  }
  if (set.has(toActionKey("/products/general-machine.html", "edit"))) {
    add("/products/edit-general-machine.html", "view");
    add("/products/edit-general-machine.html", "edit");
  }
  if (set.has(toActionKey("/products/machine.html", "edit"))) {
    add("/products/edit-rental-machine.html", "view");
    add("/products/edit-rental-machine.html", "edit");
  }
  if (set.has(toActionKey("/customers/customer-list.html", "edit"))) {
    add("/customers/edit-customer.html", "view");
    add("/customers/edit-customer.html", "edit");
  }
  if (set.has(toActionKey("/vendors/list-vendor.html", "edit"))) {
    add("/vendors/edit-vendor.html", "view");
    add("/vendors/edit-vendor.html", "edit");
  }
  if (set.has(toActionKey("/expenses/expense-list.html", "edit"))) {
    add("/expenses/edit-expense.html", "view");
    add("/expenses/edit-expense.html", "edit");
  }
  if (set.has(toActionKey("/users/technician-list.html", "edit"))) {
    add("/users/edit-technician.html", "view");
    add("/users/edit-technician.html", "edit");
  }
  if (set.has(toActionKey("/users/technician-list.html", "add"))) {
    add("/users/add-technician.html", "view");
    add("/users/add-technician.html", "add");
  }
  if (
    set.has(toActionKey("/users/technician-list.html", "add")) ||
    set.has(toActionKey("/users/technician-list.html", "edit")) ||
    set.has(toActionKey("/users/technician-list.html", "delete"))
  ) {
    add("/users/technician-list.html", "view");
  }

  return normalizeActions(Array.from(set));
}

function parseAllowedPages(row) {
  try {
    const parsed = JSON.parse(String(row?.allowed_pages_json || "[]"));
    return normalizePages(parsed);
  } catch (_err) {
    return [];
  }
}

function parseAllowedActions(row) {
  try {
    const parsed = JSON.parse(String(row?.allowed_actions_json || "[]"));
    return normalizeActions(parsed);
  } catch (_err) {
    return [];
  }
}

function derivePagesFromActions(actionKeys, fallbackPages) {
  const fromActions = (Array.isArray(actionKeys) ? actionKeys : [])
    .map((key) => String(key || "").trim().toLowerCase())
    .filter((key) => key.includes("::view"))
    .map((key) => {
      const idx = key.lastIndexOf("::");
      return idx === -1 ? "" : key.slice(0, idx);
    })
    .filter(Boolean);

  return normalizePages([...(Array.isArray(fallbackPages) ? fallbackPages : []), ...fromActions]);
}

function normalizeDatabaseName(value) {
  const normalized = db.normalizeDatabaseName(value);
  if (!normalized) return null;
  if (RESERVED_DATABASES.has(normalized)) return null;
  return normalized;
}

function normalizeUserDatabase(value) {
  const normalized = normalizeDatabaseName(value);
  if (!normalized) return INVENTORY_DB_NAME;
  return normalized;
}

function quoteIdentifier(identifier) {
  return `"${String(identifier || "").replace(/"/g, "\"\"")}"`;
}

function normalizeCompanyName(value) {
  const normalized = String(value || "").trim().replace(/\s+/g, " ");
  return normalized ? normalized.slice(0, 200) : "";
}

function normalizeCompanyCode(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, "");
  return normalized ? normalized.slice(0, 40) : "";
}

function normalizeEmail(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return "";
  return normalized.slice(0, 200);
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
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function ensureDir(targetDir) {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
}

function toRelativeStoragePath(absPath) {
  const rel = path.relative(path.resolve(__dirname, ".."), absPath).replace(/\\/g, "/");
  return rel.startsWith("storage/") ? rel : `storage/${path.basename(absPath)}`;
}

function resolveCompanyFolder(companyName) {
  const base = safeNamePart(companyName) || `company_${Date.now()}`;
  return path.join(COMPANY_STORAGE_ROOT, base);
}

async function ensureDatabaseRegistryTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${DATABASE_REGISTRY_TABLE} (
      id SERIAL PRIMARY KEY,
      database_name VARCHAR(120) UNIQUE NOT NULL,
      company_name VARCHAR(200) NOT NULL,
      folder_name VARCHAR(120),
      created_by INTEGER,
      "createdAt" TIMESTAMP DEFAULT NOW(),
      "updatedAt" TIMESTAMP DEFAULT NOW()
    );
  `);
  await client.query(`
    ALTER TABLE ${DATABASE_REGISTRY_TABLE}
    ADD COLUMN IF NOT EXISTS folder_name VARCHAR(120);
  `);
}

async function ensureCompanyRegistryTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${COMPANY_REGISTRY_TABLE} (
      id SERIAL PRIMARY KEY,
      company_name VARCHAR(200) UNIQUE NOT NULL,
      company_code VARCHAR(40),
      email VARCHAR(200),
      folder_name VARCHAR(120) NOT NULL,
      logo_path VARCHAR(500) NOT NULL,
      logo_file_name VARCHAR(255) NOT NULL,
      created_by INTEGER,
      "createdAt" TIMESTAMP DEFAULT NOW(),
      "updatedAt" TIMESTAMP DEFAULT NOW()
    );
  `);
  await client.query(`
    ALTER TABLE ${COMPANY_REGISTRY_TABLE}
    ADD COLUMN IF NOT EXISTS company_code VARCHAR(40);
  `);
  await client.query(`
    ALTER TABLE ${COMPANY_REGISTRY_TABLE}
    ADD COLUMN IF NOT EXISTS email VARCHAR(200);
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS company_profiles_company_code_unique_idx
    ON ${COMPANY_REGISTRY_TABLE} (UPPER(company_code))
    WHERE company_code IS NOT NULL AND TRIM(company_code) <> '';
  `);
}

async function ensureUserMappingTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS user_mappings (
      id SERIAL PRIMARY KEY,
      user_id INTEGER UNIQUE NOT NULL,
      company_profile_id INTEGER NOT NULL REFERENCES ${COMPANY_REGISTRY_TABLE}(id) ON DELETE CASCADE,
      database_name VARCHAR(120) NOT NULL,
      mapped_email VARCHAR(200),
      is_verified BOOLEAN DEFAULT FALSE,
      created_by INTEGER,
      "createdAt" TIMESTAMP DEFAULT NOW(),
      "updatedAt" TIMESTAMP DEFAULT NOW()
    );
  `);
  await client.query(`
    ALTER TABLE user_mappings
    ADD COLUMN IF NOT EXISTS mapped_email VARCHAR(200);
  `);
}

async function ensureUserInvoiceMappingTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${USER_INVOICE_MAPPING_TABLE} (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      database_name VARCHAR(120) NOT NULL,
      logo_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      invoice_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      quotation_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      quotation2_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      quotation3_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      sign_c_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      sign_v_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      seal_c_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      seal_v_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      sign_q2_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      seal_q2_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      sign_q3_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      seal_q3_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      theme_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      is_verified BOOLEAN NOT NULL DEFAULT FALSE,
      created_by INTEGER,
      "createdAt" TIMESTAMP DEFAULT NOW(),
      "updatedAt" TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, database_name)
    );
  `);
  await client.query(`
    ALTER TABLE ${USER_INVOICE_MAPPING_TABLE}
    ADD COLUMN IF NOT EXISTS sign_q2_enabled BOOLEAN NOT NULL DEFAULT FALSE;
  `);
  await client.query(`
    ALTER TABLE ${USER_INVOICE_MAPPING_TABLE}
    ADD COLUMN IF NOT EXISTS seal_q2_enabled BOOLEAN NOT NULL DEFAULT FALSE;
  `);
  await client.query(`
    ALTER TABLE ${USER_INVOICE_MAPPING_TABLE}
    ADD COLUMN IF NOT EXISTS sign_q3_enabled BOOLEAN NOT NULL DEFAULT FALSE;
  `);
  await client.query(`
    ALTER TABLE ${USER_INVOICE_MAPPING_TABLE}
    ADD COLUMN IF NOT EXISTS seal_q3_enabled BOOLEAN NOT NULL DEFAULT FALSE;
  `);
}

async function ensureUserQuotationRenderTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${USER_QUOTATION_RENDER_TABLE} (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      database_name VARCHAR(120) NOT NULL,
      quotation_type VARCHAR(32) NOT NULL,
      render_visibility_json TEXT NOT NULL DEFAULT '{}',
      render_overrides_json TEXT NOT NULL DEFAULT '{}',
      created_by INTEGER,
      "createdAt" TIMESTAMP DEFAULT NOW(),
      "updatedAt" TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, database_name, quotation_type)
    );
  `);
  await client.query(`
    ALTER TABLE ${USER_QUOTATION_RENDER_TABLE}
    ADD COLUMN IF NOT EXISTS render_overrides_json TEXT NOT NULL DEFAULT '{}';
  `);
}

function normalizeQuotationRenderVisibility(raw, allowedKeys) {
  const source = raw && typeof raw === "object" ? raw : {};
  const out = {};
  allowedKeys.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      out[key] = Boolean(source[key]);
    }
  });
  return out;
}

function normalizeQuotation2RenderVisibility(raw) {
  return normalizeQuotationRenderVisibility(raw, QUOTATION2_RENDER_KEYS);
}

function normalizeQuotation3RenderVisibility(raw) {
  return normalizeQuotationRenderVisibility(raw, QUOTATION3_RENDER_KEYS);
}

function parseQuotationRenderVisibility(row, allowedKeys) {
  try {
    const parsed = JSON.parse(String(row?.render_visibility_json || "{}"));
    return normalizeQuotationRenderVisibility(parsed, allowedKeys);
  } catch (_err) {
    return {};
  }
}

function normalizeQuotation2RenderOverrides(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const itemNamesByInvoiceRaw = source.item_names_by_invoice && typeof source.item_names_by_invoice === "object"
    ? source.item_names_by_invoice
    : {};
  const itemRatesByInvoiceRaw = source.item_rates_by_invoice && typeof source.item_rates_by_invoice === "object"
    ? source.item_rates_by_invoice
    : {};
  const layoutStateRaw = source.layout_state && typeof source.layout_state === "object"
    ? source.layout_state
    : {};
  const itemNamesByInvoice = {};
  const itemRatesByInvoice = {};
  const layoutState = {};
  Object.entries(itemNamesByInvoiceRaw).forEach(([invoiceKey, itemMapRaw]) => {
    const safeInvoiceKey = String(invoiceKey || "").trim();
    if (!/^\d+$/.test(safeInvoiceKey)) return;
    if (!itemMapRaw || typeof itemMapRaw !== "object") return;
    const normalizedItemMap = {};
    Object.entries(itemMapRaw).forEach(([itemIndex, value]) => {
      const safeItemIndex = String(itemIndex || "").trim();
      if (!/^\d+$/.test(safeItemIndex)) return;
      const safeName = String(value || "").trim().slice(0, 300);
      if (!safeName) return;
      normalizedItemMap[safeItemIndex] = safeName;
    });
    if (Object.keys(normalizedItemMap).length) {
      itemNamesByInvoice[safeInvoiceKey] = normalizedItemMap;
    }
  });
  Object.entries(itemRatesByInvoiceRaw).forEach(([invoiceKey, itemMapRaw]) => {
    const safeInvoiceKey = String(invoiceKey || "").trim();
    if (!/^\d+$/.test(safeInvoiceKey)) return;
    if (!itemMapRaw || typeof itemMapRaw !== "object") return;
    const normalizedItemMap = {};
    Object.entries(itemMapRaw).forEach(([itemIndex, value]) => {
      const safeItemIndex = String(itemIndex || "").trim();
      if (!/^\d+$/.test(safeItemIndex)) return;
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return;
      normalizedItemMap[safeItemIndex] = numeric;
    });
    if (Object.keys(normalizedItemMap).length) {
      itemRatesByInvoice[safeInvoiceKey] = normalizedItemMap;
    }
  });
  Object.entries(layoutStateRaw).forEach(([layoutKey, rawConfig]) => {
    const safeLayoutKey = String(layoutKey || "").trim();
    if (!safeLayoutKey || safeLayoutKey.length > 80) return;
    if (!rawConfig || typeof rawConfig !== "object") return;
    const next = {};
    const x = Number(rawConfig.x);
    const y = Number(rawConfig.y);
    const font = Number(rawConfig.font);
    const fontFamily = String(rawConfig.fontFamily || "").trim().slice(0, 80);
    const fontWeight = String(rawConfig.fontWeight || "").trim().toLowerCase() === "bold" ? "bold" : "normal";
    const visible = rawConfig.visible;
    if (Number.isFinite(x)) next.x = x;
    if (Number.isFinite(y)) next.y = y;
    if (Number.isFinite(font) && font > 0) next.font = font;
    if (fontFamily) next.fontFamily = fontFamily;
    next.fontWeight = fontWeight;
    if (typeof visible === "boolean") next.visible = visible;
    if (Object.keys(next).length) {
      layoutState[safeLayoutKey] = next;
    }
  });
  return {
    item_names_by_invoice: itemNamesByInvoice,
    item_rates_by_invoice: itemRatesByInvoice,
    layout_state: layoutState,
  };
}

function parseQuotationRenderOverrides(row) {
  try {
    const parsed = JSON.parse(String(row?.render_overrides_json || "{}"));
    return normalizeQuotation2RenderOverrides(parsed);
  } catch (_err) {
    return { item_names_by_invoice: {}, item_rates_by_invoice: {}, layout_state: {} };
  }
}

function normalizeNameCompare(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toUpperCase();
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
  return { user_id: userId, user_database: INVENTORY_DB_NAME };
}

async function findAccessFromMainDb(userId, userDatabase = INVENTORY_DB_NAME) {
  const cfg = getDbConfig();
  const client = new Client({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database || INVENTORY_DB_NAME,
  });
  try {
    await client.connect();
    const rs = await client.query(
      `SELECT id, allowed_pages_json, allowed_actions_json, database_name, user_database, "updatedAt", "createdAt"
       FROM user_accesses
       WHERE user_id = $1 AND (LOWER(COALESCE(user_database, 'inventory')) = $2)
       ORDER BY "updatedAt" DESC NULLS LAST, "createdAt" DESC NULLS LAST, id DESC
       LIMIT 1`,
      [userId, normalizeUserDatabase(userDatabase)]
    );
    if (!rs.rowCount) return null;
    return rs.rows[0];
  } catch (_err) {
    return null;
  } finally {
    await client.end().catch(() => {});
  }
}

async function findMappedUserProfile(userId) {
  const cfg = getDbConfig();
  const client = new Client({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database || INVENTORY_DB_NAME,
  });
  try {
    await client.connect();
    const rs = await client.query(
      `SELECT um.database_name, cp.company_name, cp.company_code, cp.email, cp.logo_path
       FROM user_mappings um
       JOIN ${COMPANY_REGISTRY_TABLE} cp ON cp.id = um.company_profile_id
       WHERE um.user_id = $1
       LIMIT 1`,
      [userId]
    );
    if (!rs.rowCount) return null;
    return {
      database_name: normalizeDatabaseName(rs.rows[0]?.database_name),
      company_name: normalizeCompanyName(rs.rows[0]?.company_name),
      company_code: normalizeCompanyCode(rs.rows[0]?.company_code),
      email: normalizeEmail(rs.rows[0]?.email),
      logo_path: String(rs.rows[0]?.logo_path || "").trim(),
    };
  } catch (_err) {
    return null;
  } finally {
    await client.end().catch(() => {});
  }
}

function getDbConfig() {
  return {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || INVENTORY_DB_NAME,
  };
}

async function seedDefaultCategoryData(databaseName) {
  await db.withDatabase(databaseName, async () => {
    for (const name of DEFAULT_CATEGORIES) {
      const exists = await Category.findOne({ where: { name } });
      if (!exists) {
        await Category.create({ name });
      }
    }

    for (const [categoryName, models] of Object.entries(DEFAULT_CATEGORY_MODELS)) {
      for (const modelName of models) {
        const exists = await CategoryModelOption.findOne({
          where: { category_name: categoryName, model_name: modelName },
        });
        if (!exists) {
          await CategoryModelOption.create({
            category_name: categoryName,
            model_name: modelName,
          });
        }
      }
    }
  });
}

function runBash(command, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("bash", ["-lc", command], {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += String(d || ""); });
    child.stderr.on("data", (d) => { stderr += String(d || ""); });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(stderr || stdout || `Command failed with code ${code}`));
    });
  });
}

async function ensureDemoDatabaseSchema() {
  const cfg = getDbConfig();
  const admin = new Client({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: "postgres",
  });

  await admin.connect();
  let demoExists = false;
  try {
    const check = await admin.query(
      "SELECT 1 FROM pg_database WHERE datname = $1 LIMIT 1",
      [DEMO_DB_NAME]
    );
    demoExists = check.rowCount > 0;
    if (!demoExists) {
      await admin.query(`CREATE DATABASE "${DEMO_DB_NAME}"`);
    }
  } finally {
    await admin.end();
  }

  if (demoExists) {
    return { demoExists: true, schemaCloned: false };
  }

  const pgDumpPath = (process.env.PG_DUMP_PATH || "pg_dump").trim();
  const psqlPath = (process.env.PSQL_PATH || "psql").trim();
  const sourceDb = String(cfg.database || "").trim();
  if (!sourceDb || sourceDb.toLowerCase() === DEMO_DB_NAME) return { demoExists: true, schemaCloned: false };

  const escapedSource = `'${sourceDb.replace(/'/g, "'\\''")}'`;
  const escapedDemo = `'${DEMO_DB_NAME}'`;
  const escapedHost = `'${String(cfg.host).replace(/'/g, "'\\''")}'`;
  const escapedPort = `'${String(cfg.port).replace(/'/g, "'\\''")}'`;
  const escapedUser = `'${String(cfg.user).replace(/'/g, "'\\''")}'`;
  const escapedDump = `'${pgDumpPath.replace(/'/g, "'\\''")}'`;
  const escapedPsql = `'${psqlPath.replace(/'/g, "'\\''")}'`;

  const cmd = [
    `${escapedDump} --schema-only`,
    `-h ${escapedHost}`,
    `-p ${escapedPort}`,
    `-U ${escapedUser}`,
    `-d ${escapedSource}`,
    `|`,
    `${escapedPsql}`,
    `-h ${escapedHost}`,
    `-p ${escapedPort}`,
    `-U ${escapedUser}`,
    `-d ${escapedDemo}`
  ].join(" ");

  await runBash(cmd, { PGPASSWORD: cfg.password || "" });
  return { demoExists: true, schemaCloned: true };
}

async function cloneSchemaToDatabase(targetDatabaseName) {
  const cfg = getDbConfig();
  const pgDumpPath = (process.env.PG_DUMP_PATH || "pg_dump").trim();
  const psqlPath = (process.env.PSQL_PATH || "psql").trim();
  const sourceDb = String(cfg.database || "").trim();
  const targetDb = String(targetDatabaseName || "").trim();
  if (!sourceDb || !targetDb) {
    throw new Error("Invalid source or target database.");
  }
  if (sourceDb.toLowerCase() === targetDb.toLowerCase()) {
    return;
  }

  const escapedSource = `'${sourceDb.replace(/'/g, "'\\''")}'`;
  const escapedTarget = `'${targetDb.replace(/'/g, "'\\''")}'`;
  const escapedHost = `'${String(cfg.host).replace(/'/g, "'\\''")}'`;
  const escapedPort = `'${String(cfg.port).replace(/'/g, "'\\''")}'`;
  const escapedUser = `'${String(cfg.user).replace(/'/g, "'\\''")}'`;
  const escapedDump = `'${pgDumpPath.replace(/'/g, "'\\''")}'`;
  const escapedPsql = `'${psqlPath.replace(/'/g, "'\\''")}'`;

  const cmd = [
    `${escapedDump} --schema-only`,
    `-h ${escapedHost}`,
    `-p ${escapedPort}`,
    `-U ${escapedUser}`,
    `-d ${escapedSource}`,
    `|`,
    `${escapedPsql}`,
    `-h ${escapedHost}`,
    `-p ${escapedPort}`,
    `-U ${escapedUser}`,
    `-d ${escapedTarget}`,
  ].join(" ");

  await runBash(cmd, { PGPASSWORD: cfg.password || "" });
}

async function fetchCompanyDatabaseMap(mainDbClient) {
  await ensureDatabaseRegistryTable(mainDbClient);
  const rs = await mainDbClient.query(
    `SELECT database_name, company_name
     FROM ${DATABASE_REGISTRY_TABLE}
     ORDER BY LOWER(company_name) ASC, LOWER(database_name) ASC`
  );
  const map = new Map();
  (rs.rows || []).forEach((row) => {
    const dbName = normalizeDatabaseName(row?.database_name);
    if (!dbName) return;
    map.set(dbName, normalizeCompanyName(row?.company_name));
  });
  return map;
}

async function fetchCreatedDatabases(mainDbClient) {
  await ensureDatabaseRegistryTable(mainDbClient);
  const rs = await mainDbClient.query(
    `SELECT database_name, company_name, created_by, "createdAt", "updatedAt"
     FROM ${DATABASE_REGISTRY_TABLE}
     WHERE LOWER(database_name) <> $1
     ORDER BY "createdAt" DESC NULLS LAST, id DESC`,
    [INVENTORY_DB_NAME]
  );
  return (rs.rows || [])
    .map((row) => {
      const name = normalizeDatabaseName(row?.database_name);
      if (!name || name === INVENTORY_DB_NAME) return null;
      return {
        name,
        company_name: normalizeCompanyName(row?.company_name),
        created_by: Number(row?.created_by || 0) || null,
        created_at: row?.createdAt || null,
        updated_at: row?.updatedAt || null,
      };
    })
    .filter(Boolean);
}

async function getUserFromDatabase(databaseName, userId) {
  return db.withDatabase(databaseName, async () => {
    try {
      await db.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS is_super_user BOOLEAN DEFAULT FALSE;
      `);
      await db.query(`
        UPDATE users
        SET is_super_user = FALSE
        WHERE is_super_user IS NULL;
      `);
    } catch (_err) {
    }
    return User.findByPk(userId, {
      attributes: ["id", "username", "email", "role", "is_super_user", "company"],
    });
  });
}

async function isRequesterSuperAdmin(req) {
  const role = String(req?.user?.role || "").toLowerCase();
  if (role !== "admin") return false;
  const requesterId = Number(req?.user?.id || req?.user?.userId || 0);
  if (!Number.isFinite(requesterId) || requesterId <= 0) return false;
  const me = await getUserFromDatabase(INVENTORY_DB_NAME, requesterId).catch(() => null);
  return Boolean(me && String(me.role || "").toLowerCase() === "admin" && me.is_super_user);
}

function isProtectedSuperAdminTarget(userLike, requesterId, requesterIsSuper) {
  const isTargetAdmin = String(userLike?.role || "").toLowerCase() === "admin";
  const isTargetSuper = Boolean(userLike?.is_super_user);
  return isTargetAdmin && isTargetSuper && Number(userLike?.id || 0) !== Number(requesterId || 0) && !requesterIsSuper;
}

async function hasAnySuperAdminInInventory() {
  try {
    const rows = await db.withDatabase(INVENTORY_DB_NAME, async () => {
      return User.findAll({
        where: { role: "admin", is_super_user: true },
        attributes: ["id"],
        limit: 1,
      });
    });
    return Array.isArray(rows) && rows.length > 0;
  } catch (_err) {
    return false;
  }
}

async function canRequesterEditSuperFlag(req, targetUser) {
  const requesterId = Number(req?.user?.id || req?.user?.userId || 0);
  const requesterRole = String(req?.user?.role || "").toLowerCase();
  if (requesterRole !== "admin") return false;

  const requesterIsSuper = await isRequesterSuperAdmin(req);
  if (requesterIsSuper) return true;

  const targetId = Number(targetUser?.id || 0);
  if (requesterId > 0 && targetId > 0 && requesterId === targetId) {
    return true;
  }

  const anySuper = await hasAnySuperAdminInInventory();
  return !anySuper;
}

async function hasDbCreateActionPermission(req, action) {
  const role = String(req.user?.role || "").toLowerCase();
  if (role !== "admin") return false;
  const userId = Number(req.user?.id || req.user?.userId || 0);
  if (!Number.isFinite(userId) || userId <= 0) return false;

  const userDatabase = normalizeUserDatabase(req.databaseName || req.user?.database_name || INVENTORY_DB_NAME);
  const actionKey = toActionKey("/users/db-create.html", action);

  let row = await findAccessFromMainDb(userId, userDatabase);
  if (!row && userDatabase !== INVENTORY_DB_NAME) {
    row = await findAccessFromMainDb(userId, INVENTORY_DB_NAME);
  }

                                                                      
  if (!row) return true;
  const allowedActions = parseAllowedActions(row);
  return allowedActions.includes(actionKey);
}

async function hasCompanyCreateActionPermission(req, action) {
  const role = String(req.user?.role || "").toLowerCase();
  if (role !== "admin") return false;
  const userId = Number(req.user?.id || req.user?.userId || 0);
  if (!Number.isFinite(userId) || userId <= 0) return false;

  const userDatabase = normalizeUserDatabase(req.databaseName || req.user?.database_name || INVENTORY_DB_NAME);
  const actionKey = toActionKey("/users/company-create.html", action);

  let row = await findAccessFromMainDb(userId, userDatabase);
  if (!row && userDatabase !== INVENTORY_DB_NAME) {
    row = await findAccessFromMainDb(userId, INVENTORY_DB_NAME);
  }

                                                                      
  if (!row) return true;
  const allowedActions = parseAllowedActions(row);
  return allowedActions.includes(actionKey);
}

async function hasMappedActionPermission(req, action) {
  const role = String(req.user?.role || "").toLowerCase();
  if (role !== "admin") return false;
  const userId = Number(req.user?.id || req.user?.userId || 0);
  if (!Number.isFinite(userId) || userId <= 0) return false;

  const userDatabase = normalizeUserDatabase(req.databaseName || req.user?.database_name || INVENTORY_DB_NAME);
  const actionKey = toActionKey("/users/mapped.html", action);

  let row = await findAccessFromMainDb(userId, userDatabase);
  if (!row && userDatabase !== INVENTORY_DB_NAME) {
    row = await findAccessFromMainDb(userId, INVENTORY_DB_NAME);
  }

  if (!row) return true;
  const allowedActions = parseAllowedActions(row);
  return allowedActions.includes(actionKey);
}

async function hasInvMapActionPermission(req, action) {
  const role = String(req.user?.role || "").toLowerCase();
  if (role !== "admin") return false;
  const userId = Number(req.user?.id || req.user?.userId || 0);
  if (!Number.isFinite(userId) || userId <= 0) return false;

  const userDatabase = normalizeUserDatabase(req.databaseName || req.user?.database_name || INVENTORY_DB_NAME);
  const actionKey = toActionKey(INV_MAP_PATH, action);

  let row = await findAccessFromMainDb(userId, userDatabase);
  if (!row && userDatabase !== INVENTORY_DB_NAME) {
    row = await findAccessFromMainDb(userId, INVENTORY_DB_NAME);
  }

  if (!row) return true;
  const allowedActions = parseAllowedActions(row);
  if (allowedActions.includes(actionKey)) return true;
  if (String(action || "").toLowerCase() === "delete") {
                                                                                                      
    const addActionKey = toActionKey(INV_MAP_PATH, "add");
    if (allowedActions.includes(addActionKey)) return true;
  }
  return false;
}

function normalizeInvMapFlags(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    logo: Boolean(source.logo),
    invoice: Boolean(source.invoice),
    quotation: Boolean(source.quotation),
    quotation2: Boolean(source.quotation2),
    quotation3: Boolean(source.quotation3),
    sign_c: Boolean(source.sign_c),
    sign_v: Boolean(source.sign_v),
    seal_c: Boolean(source.seal_c),
    seal_v: Boolean(source.seal_v),
    sign_q2: Boolean(source.sign_q2),
    seal_q2: Boolean(source.seal_q2),
    sign_q3: Boolean(source.sign_q3),
    seal_q3: Boolean(source.seal_q3),
    theme: Boolean(source.theme),
  };
}

function hasAnyInvMapFlag(flags) {
  return Object.values(flags || {}).some((v) => Boolean(v));
}

async function getPreferenceAvailability(databaseName, userId) {
  const targetDb = normalizeDatabaseName(databaseName) || INVENTORY_DB_NAME;
  await db.registerDatabase(targetDb).catch(() => {});
  if (!ensuredUiSettingsDbSet.has(targetDb)) {
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
    ensuredUiSettingsDbSet.add(targetDb);
  }
  const prefData = await db.withDatabase(targetDb, async () => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_preference_settings (
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
    const normalizedUserId = Number(userId || 0);
    if (!Number.isFinite(normalizedUserId) || normalizedUserId <= 0) return null;
    const rs = await db.query(
      `SELECT *
       FROM user_preference_settings
       WHERE user_id = $1
       LIMIT 1`,
      { bind: [normalizedUserId] }
    );
    const userRows = Array.isArray(rs?.[0]) ? rs[0] : [];
    let globalRow = await UiSetting.findOne({ order: [["id", "ASC"]] });
    if (!globalRow) {
      globalRow = await UiSetting.create({});
    }
    return {
      userRow: userRows[0] || null,
      globalRow: globalRow ? (globalRow.toJSON ? globalRow.toJSON() : globalRow) : null,
    };
  });
  const row = prefData?.userRow || null;
  const globalRow = prefData?.globalRow || null;

  const resolveFile = (...candidatesRaw) => {
    const candidates = candidatesRaw.map((v) => String(v || "").trim()).filter(Boolean);
    for (const rawPath of candidates) {
      const resolved = path.resolve(rawPath);
      if (fs.existsSync(resolved)) return resolved;
    }
    return "";
  };

  const defaultLogoPath = path.resolve(__dirname, "../../frontend/assets/images/logo.png");
  const logoPath = resolveFile(row?.logo_path, globalRow?.logo_path, defaultLogoPath);
  const invoicePath = resolveFile(row?.invoice_template_pdf_path, globalRow?.invoice_template_pdf_path);
  const quotationPath = resolveFile(row?.quotation_template_pdf_path, globalRow?.quotation_template_pdf_path);
  const quotation2Path = resolveFile(row?.quotation2_template_pdf_path, globalRow?.quotation2_template_pdf_path);
  const quotation3Path = resolveFile(row?.quotation3_template_pdf_path, globalRow?.quotation3_template_pdf_path);
  const signCPath = resolveFile(row?.sign_c_path, globalRow?.sign_c_path);
  const signVPath = resolveFile(row?.sign_v_path, globalRow?.sign_v_path);
  const sealCPath = resolveFile(row?.seal_c_path, globalRow?.seal_c_path);
  const sealVPath = resolveFile(row?.seal_v_path, globalRow?.seal_v_path);
  const signQ2Path = resolveFile(row?.sign_q2_path, globalRow?.sign_q2_path);
  const sealQ2Path = resolveFile(row?.seal_q2_path, globalRow?.seal_q2_path);
  const signQ3Path = resolveFile(row?.sign_q3_path, globalRow?.sign_q3_path);
  const sealQ3Path = resolveFile(row?.seal_q3_path, globalRow?.seal_q3_path);
  const themeMode = String(row?.mode_theme || globalRow?.mode_theme || "").trim();

  return {
    logo: Boolean(logoPath),
    invoice: Boolean(invoicePath),
    quotation: Boolean(quotationPath),
    quotation2: Boolean(quotation2Path),
    quotation3: Boolean(quotation3Path),
    sign_c: Boolean(signCPath),
    sign_v: Boolean(signVPath),
    seal_c: Boolean(sealCPath),
    seal_v: Boolean(sealVPath),
    sign_q2: Boolean(signQ2Path),
    seal_q2: Boolean(sealQ2Path),
    sign_q3: Boolean(signQ3Path),
    seal_q3: Boolean(sealQ3Path),
    theme: Boolean(themeMode),
  };
}

function getInvMapMissing(flags, availability) {
  const selected = normalizeInvMapFlags(flags);
  const available = availability && typeof availability === "object" ? availability : {};
  return Object.keys(selected).filter((key) => Boolean(selected[key]) && !Boolean(available[key]));
}

exports.getAccessUsers = async (_req, res) => {
  try {
    try{
      await ensureDemoDatabaseSchema();
    }catch(_err){
    }

    const rows = [];
    const cfg = getDbConfig();
    const mainDbClient = new Client({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      database: cfg.database || INVENTORY_DB_NAME,
    });

    const linkedByUserDbKey = new Map();
    const mappedByUserId = new Map();
    try {
      await mainDbClient.connect();
      await ensureUserMappingTable(mainDbClient);

      const accessRs = await mainDbClient.query(
        `SELECT DISTINCT ON (user_id, LOWER(COALESCE(user_database, 'inventory')))
            user_id, user_database, database_name
         FROM user_accesses
         ORDER BY user_id, LOWER(COALESCE(user_database, 'inventory')), "updatedAt" DESC NULLS LAST, "createdAt" DESC NULLS LAST, id DESC`
      );
      (accessRs.rows || []).forEach((row) => {
        const userId = Number(row?.user_id || 0);
        const userDb = normalizeUserDatabase(row?.user_database);
        const linkedDb = normalizeDatabaseName(row?.database_name);
        if (!userId || !linkedDb) return;
        linkedByUserDbKey.set(`${userDb}:${userId}`, linkedDb);
      });

      const mappingRs = await mainDbClient.query(
        `SELECT user_id, database_name
         FROM user_mappings`
      );
      (mappingRs.rows || []).forEach((row) => {
        const userId = Number(row?.user_id || 0);
        const linkedDb = normalizeDatabaseName(row?.database_name);
        if (!userId || !linkedDb) return;
        mappedByUserId.set(userId, linkedDb);
      });
    } catch (_err) {
    } finally {
      await mainDbClient.end().catch(() => {});
    }

    const includeDemo = String(_req?.query?.include_demo || "").trim().toLowerCase() === "true";
    const sourceDbs = includeDemo
      ? [INVENTORY_DB_NAME, DEMO_DB_NAME]
      : [INVENTORY_DB_NAME];

    const requesterId = Number(_req?.user?.id || _req?.user?.userId || 0);
    const requesterIsSuper = await isRequesterSuperAdmin(_req);

    for (const databaseName of sourceDbs) {
      let users = [];
      try{
        users = await db.withDatabase(databaseName, async () => {
          return User.findAll({
            attributes: ["id", "username", "email", "role"],
            order: [["role", "ASC"], ["username", "ASC"], ["id", "ASC"]],
          });
        });
      }catch(_err){
        users = [];
      }

      (Array.isArray(users) ? users : []).forEach((user) => {
        const plain = user.toJSON ? user.toJSON() : user;
        const role = String(plain.role || "").toLowerCase() || "user";
        if (isProtectedSuperAdminTarget(plain, requesterId, requesterIsSuper)) {
          return;
        }
        const sourceDb = normalizeUserDatabase(databaseName);
        const accessLinkedDb =
          linkedByUserDbKey.get(`${sourceDb}:${plain.id}`) ||
          linkedByUserDbKey.get(`${INVENTORY_DB_NAME}:${plain.id}`) ||
          null;
        const mappedLinkedDb = mappedByUserId.get(Number(plain.id || 0)) || null;
        const linkedDb = normalizeDatabaseName(mappedLinkedDb || accessLinkedDb) || sourceDb;

        rows.push({
          selection_key: `${sourceDb}:${plain.id}`,
          id: plain.id,
          username: plain.username || "",
          email: plain.email || "",
          role,
          user_database: sourceDb,
          database_name: linkedDb,
          label: `${plain.username || plain.email || `User ${plain.id}`} [${role}] (${linkedDb})`,
        });
      });
    }

    rows.sort((a, b) => {
      const dbCmp = String(a.database_name || "").localeCompare(String(b.database_name || ""));
      if (dbCmp !== 0) return dbCmp;
      const roleCmp = String(a.role || "").localeCompare(String(b.role || ""));
      if (roleCmp !== 0) return roleCmp;
      return String(a.username || a.email || "").localeCompare(String(b.username || b.email || ""));
    });

    res.json({ users: rows });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to load access users." });
  }
};

exports.getAccessPages = async (_req, res) => {
  const modules = ACCESS_MODULE_OPTIONS
    .map((group) => ({
      module: group.module,
      items: (group.items || [])
        .filter((x) => !EXCLUDED_PAGES.has(String(x.path || "").toLowerCase()))
        .map((item) => ({
          ...item,
          actions: Array.isArray(item.actions) ? item.actions : [],
          action_keys: (Array.isArray(item.actions) ? item.actions : []).map((action) => toActionKey(item.path, action)),
        })),
    }))
    .filter((group) => group.items.length > 0);

  res.json({
    modules,
    pages: modules.flatMap((g) => g.items.map((x) => ({ path: x.path, label: x.label }))),
  });
};

exports.getDatabases = async (_req, res) => {
  const cfg = getDbConfig();
  const adminClient = new Client({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: "postgres",
  });
  const mainDbClient = new Client({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database || INVENTORY_DB_NAME,
  });

  try {
    await ensureDemoDatabaseSchema();
  } catch (_err) {
  }

  try {
    await adminClient.connect();
    await mainDbClient.connect();

    const rows = await adminClient.query(
      "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname ASC"
    );
    const companyMap = await fetchCompanyDatabaseMap(mainDbClient);
    const seen = new Set();
    const databases = [];

    (rows.rows || []).forEach((row) => {
      const dbName = normalizeDatabaseName(row?.datname);
      if (!dbName || RESERVED_DATABASES.has(dbName) || seen.has(dbName)) return;
      seen.add(dbName);
      const companyName = companyMap.get(dbName) || "";
      const label = companyName ? `${companyName} (${dbName})` : dbName;
      databases.push({
        name: dbName,
        company_name: companyName,
        label,
      });
    });

    res.json({
      current: normalizeDatabaseName(cfg.database) || INVENTORY_DB_NAME,
      databases: databases.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))),
    });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to list databases." });
  } finally {
    await adminClient.end().catch(() => {});
    await mainDbClient.end().catch(() => {});
  }
};

exports.createDatabase = async (req, res) => {
  const canAdd = await hasDbCreateActionPermission(req, "add");
  if (!canAdd) {
    return res.status(403).json({ message: "Forbidden: Missing DB Create add permission." });
  }

  const databaseName = normalizeDatabaseName(req.body?.database_name);
  const companyName = normalizeCompanyName(req.body?.company_name);
  if (!databaseName) {
    return res.status(400).json({ message: "Valid database name is required." });
  }
  if (!companyName) {
    return res.status(400).json({ message: "Company name is required." });
  }

  const cfg = getDbConfig();
  const adminClient = new Client({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: "postgres",
  });
  const mainDbClient = new Client({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database || INVENTORY_DB_NAME,
  });

  try {
    await adminClient.connect();
    const existsRs = await adminClient.query(
      "SELECT 1 FROM pg_database WHERE datname = $1 LIMIT 1",
      [databaseName]
    );
    if (existsRs.rowCount > 0) {
      return res.status(409).json({ message: "Database already exists." });
    }

    await adminClient.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
    await cloneSchemaToDatabase(databaseName);
    await db.registerDatabase(databaseName);

    const connection = db.getConnection(databaseName);
    await connection.sync({ alter: true });
    await seedDefaultCategoryData(databaseName);

    await mainDbClient.connect();
    await ensureDatabaseRegistryTable(mainDbClient);
    ensureDir(DATABASE_STORAGE_ROOT);
    let dbFolderPath = path.join(DATABASE_STORAGE_ROOT, safeNamePart(companyName) || `db_${Date.now()}`);
    let suffix = 1;
    while (fs.existsSync(dbFolderPath)) {
      dbFolderPath = path.join(DATABASE_STORAGE_ROOT, `${safeNamePart(companyName) || "db"}_${suffix++}`);
    }
    ensureDir(dbFolderPath);
    const folderName = path.basename(dbFolderPath);
    await mainDbClient.query(
      `INSERT INTO ${DATABASE_REGISTRY_TABLE} (database_name, company_name, folder_name, created_by, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (database_name)
       DO UPDATE SET company_name = EXCLUDED.company_name, folder_name = EXCLUDED.folder_name, "updatedAt" = NOW()`,
      [databaseName, companyName, folderName, Number(req.user?.id || 0) || null]
    );

    res.status(201).json({
      message: "Database created successfully.",
      database: {
        name: databaseName,
        company_name: companyName,
        label: `${companyName} (${databaseName})`,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to create database." });
  } finally {
    await adminClient.end().catch(() => {});
    await mainDbClient.end().catch(() => {});
  }
};

exports.getCreatedDatabases = async (_req, res) => {
  const cfg = getDbConfig();
  const mainDbClient = new Client({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database || INVENTORY_DB_NAME,
  });
  try {
    await mainDbClient.connect();
    const databases = await fetchCreatedDatabases(mainDbClient);
    res.json({ databases });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to load created databases." });
  } finally {
    await mainDbClient.end().catch(() => {});
  }
};

exports.deleteDatabase = async (req, res) => {
  const canDelete = await hasDbCreateActionPermission(req, "delete");
  if (!canDelete) {
    return res.status(403).json({ message: "Forbidden: Missing DB Create delete permission." });
  }

  const databaseName = normalizeDatabaseName(req.params.databaseName);
  if (!databaseName || databaseName === INVENTORY_DB_NAME) {
    return res.status(400).json({ message: "Invalid database name." });
  }

  const cfg = getDbConfig();
  const adminClient = new Client({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: "postgres",
  });
  const mainDbClient = new Client({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database || INVENTORY_DB_NAME,
  });

  try {
    await mainDbClient.connect();
    await ensureDatabaseRegistryTable(mainDbClient);
    const exists = await mainDbClient.query(
      `SELECT folder_name FROM ${DATABASE_REGISTRY_TABLE} WHERE LOWER(database_name) = $1 LIMIT 1`,
      [databaseName]
    );
    if (!exists.rowCount) {
      return res.status(404).json({ message: "Database not found in created list." });
    }
    const folderName = String(exists.rows[0]?.folder_name || "").trim();

    await adminClient.connect();
    await adminClient.query(
      `SELECT pg_terminate_backend(pid)
       FROM pg_stat_activity
       WHERE datname = $1
         AND pid <> pg_backend_pid()`,
      [databaseName]
    );
    await adminClient.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`);

    await mainDbClient.query(
      `DELETE FROM ${DATABASE_REGISTRY_TABLE}
       WHERE LOWER(database_name) = $1`,
      [databaseName]
    );
    await mainDbClient.query(
      `UPDATE user_accesses
       SET database_name = NULL
       WHERE LOWER(COALESCE(database_name, '')) = $1`,
      [databaseName]
    );

    if (folderName) {
      const dbFolderPath = path.resolve(DATABASE_STORAGE_ROOT, folderName);
      const withinRoot = dbFolderPath.startsWith(DATABASE_STORAGE_ROOT);
      if (withinRoot && fs.existsSync(dbFolderPath)) {
        fs.rmSync(dbFolderPath, { recursive: true, force: true });
      }
    }

    res.json({ message: "Database deleted successfully." });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to delete database." });
  } finally {
    await adminClient.end().catch(() => {});
    await mainDbClient.end().catch(() => {});
  }
};

exports.getCompanies = async (_req, res) => {
  const cfg = getDbConfig();
  const mainDbClient = new Client({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database || INVENTORY_DB_NAME,
  });
  try {
    await mainDbClient.connect();
    await ensureCompanyRegistryTable(mainDbClient);
    const rs = await mainDbClient.query(
      `SELECT id, company_name, company_code, email, folder_name, logo_path, logo_file_name, "createdAt", "updatedAt"
       FROM ${COMPANY_REGISTRY_TABLE}
       ORDER BY LOWER(company_name) ASC, id ASC`
    );
    const rows = (rs.rows || []).map((row) => ({
      id: Number(row.id || 0),
      company_name: normalizeCompanyName(row.company_name),
      company_code: normalizeCompanyCode(row.company_code),
      email: normalizeEmail(row.email),
      folder_name: String(row.folder_name || "").trim(),
      logo_file_name: String(row.logo_file_name || "").trim(),
      logo_path: String(row.logo_path || "").trim(),
      created_at: row.createdAt || null,
      updated_at: row.updatedAt || null,
    }));
    res.json({ companies: rows });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to load companies." });
  } finally {
    await mainDbClient.end().catch(() => {});
  }
};

exports.createCompany = async (req, res) => {
  const canAdd = await hasCompanyCreateActionPermission(req, "add");
  if (!canAdd) {
    return res.status(403).json({ message: "Forbidden: Missing Company Create add permission." });
  }

  const companyName = normalizeCompanyName(req.body?.company_name);
  const companyCode = normalizeCompanyCode(req.body?.company_code);
  const companyEmail = normalizeEmail(req.body?.email);
  const fileName = String(req.body?.logo_file_name || "").trim();
  const ext = path.extname(fileName).toLowerCase();
  if (!companyName) {
    return res.status(400).json({ message: "Company name is required." });
  }
  if (!companyCode) {
    return res.status(400).json({ message: "Company code is required." });
  }
  if (!companyEmail) {
    return res.status(400).json({ message: "Valid company email is required." });
  }
  if (!COMPANY_LOGO_EXTENSIONS.has(ext)) {
    return res.status(400).json({ message: "Invalid logo format. Allowed: .jpg, .jpeg, .bmp, .gif, .tiff, .png" });
  }

  let logoBuffer;
  try {
    logoBuffer = parseBase64Payload(req.body?.logo_file_data_base64);
  } catch (_err) {
    return res.status(400).json({ message: "Invalid logo data." });
  }
  if (!logoBuffer || !logoBuffer.length) {
    return res.status(400).json({ message: "Uploaded logo is empty." });
  }

  const cfg = getDbConfig();
  const mainDbClient = new Client({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database || INVENTORY_DB_NAME,
  });

  try {
    await mainDbClient.connect();
    await ensureCompanyRegistryTable(mainDbClient);

    const existsRs = await mainDbClient.query(
      `SELECT id FROM ${COMPANY_REGISTRY_TABLE} WHERE LOWER(company_name) = LOWER($1) LIMIT 1`,
      [companyName]
    );
    if (existsRs.rowCount) {
      return res.status(409).json({ message: "Company already exists." });
    }
    const codeExistsRs = await mainDbClient.query(
      `SELECT id FROM ${COMPANY_REGISTRY_TABLE} WHERE UPPER(COALESCE(company_code, '')) = UPPER($1) LIMIT 1`,
      [companyCode]
    );
    if (codeExistsRs.rowCount) {
      return res.status(409).json({ message: "Company code already exists." });
    }

    ensureDir(COMPANY_STORAGE_ROOT);
    let folderPath = resolveCompanyFolder(companyName);
    let suffix = 1;
    while (fs.existsSync(folderPath)) {
      folderPath = path.join(COMPANY_STORAGE_ROOT, `${safeNamePart(companyName)}_${suffix++}`);
    }
    ensureDir(folderPath);

    const logoPath = path.join(folderPath, `logo${ext}`);
    fs.writeFileSync(logoPath, logoBuffer);
    const folderName = path.basename(folderPath);
    const relativeLogoPath = toRelativeStoragePath(logoPath);

    const rs = await mainDbClient.query(
      `INSERT INTO ${COMPANY_REGISTRY_TABLE}
       (company_name, company_code, email, folder_name, logo_path, logo_file_name, created_by, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       RETURNING id, company_name, company_code, email, folder_name, logo_path, logo_file_name, "createdAt", "updatedAt"`,
      [companyName, companyCode, companyEmail, folderName, relativeLogoPath, path.basename(logoPath), Number(req.user?.id || 0) || null]
    );

    const row = rs.rows[0];
    res.status(201).json({
      message: "Company created successfully.",
      company: {
        id: Number(row.id || 0),
        company_name: normalizeCompanyName(row.company_name),
        company_code: normalizeCompanyCode(row.company_code),
        email: normalizeEmail(row.email),
        folder_name: String(row.folder_name || "").trim(),
        logo_file_name: String(row.logo_file_name || "").trim(),
        logo_path: String(row.logo_path || "").trim(),
        created_at: row.createdAt || null,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to create company." });
  } finally {
    await mainDbClient.end().catch(() => {});
  }
};

exports.deleteCompany = async (req, res) => {
  const canDelete = await hasCompanyCreateActionPermission(req, "delete");
  if (!canDelete) {
    return res.status(403).json({ message: "Forbidden: Missing Company Create delete permission." });
  }

  const companyId = Number(req.params.companyId || 0);
  if (!Number.isFinite(companyId) || companyId <= 0) {
    return res.status(400).json({ message: "Invalid company id." });
  }

  const cfg = getDbConfig();
  const mainDbClient = new Client({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database || INVENTORY_DB_NAME,
  });
  try {
    await mainDbClient.connect();
    await ensureCompanyRegistryTable(mainDbClient);
    const rs = await mainDbClient.query(
      `SELECT id, folder_name
       FROM ${COMPANY_REGISTRY_TABLE}
       WHERE id = $1
       LIMIT 1`,
      [companyId]
    );
    if (!rs.rowCount) {
      return res.status(404).json({ message: "Company not found." });
    }
    const folderName = String(rs.rows[0].folder_name || "").trim();
    await mainDbClient.query(`DELETE FROM ${COMPANY_REGISTRY_TABLE} WHERE id = $1`, [companyId]);

    if (folderName) {
      const companyFolderPath = path.resolve(COMPANY_STORAGE_ROOT, folderName);
      const withinRoot = companyFolderPath.startsWith(COMPANY_STORAGE_ROOT);
      if (withinRoot && fs.existsSync(companyFolderPath)) {
        fs.rmSync(companyFolderPath, { recursive: true, force: true });
      }
    }

    res.json({ message: "Company deleted successfully." });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to delete company." });
  } finally {
    await mainDbClient.end().catch(() => {});
  }
};

async function getMappingPieces(mainDbClient, userId, databaseName, companyId, mappedEmailRaw) {
  const userRs = await mainDbClient.query(
    `SELECT id, username, company
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [userId]
  );
  if (!userRs.rowCount) {
    throw new Error("User not found.");
  }

  const dbRs = await mainDbClient.query(
    `SELECT database_name, company_name
     FROM ${DATABASE_REGISTRY_TABLE}
     WHERE LOWER(database_name) = LOWER($1)
     LIMIT 1`,
    [databaseName]
  );
  if (!dbRs.rowCount) {
    throw new Error("Database mapping entry not found.");
  }

  const companyRs = await mainDbClient.query(
    `SELECT id, company_name, company_code, email, logo_path
     FROM ${COMPANY_REGISTRY_TABLE}
     WHERE id = $1
     LIMIT 1`,
    [companyId]
  );
  if (!companyRs.rowCount) {
    throw new Error("Company not found.");
  }

  const userRow = userRs.rows[0];
  const dbRow = dbRs.rows[0];
  const companyRow = companyRs.rows[0];
  const companyEmail = normalizeEmail(companyRow.email);
  const mappedEmail = normalizeEmail(mappedEmailRaw);
  const emailVerified = !!mappedEmail && !!companyEmail && mappedEmail === companyEmail;
  const userCompany = normalizeNameCompare(userRow.company);
  const dbCompany = normalizeNameCompare(dbRow.company_name);
  const selectedCompany = normalizeNameCompare(companyRow.company_name);
  const verified = userCompany && userCompany === dbCompany && userCompany === selectedCompany && emailVerified;

  return {
    verified: Boolean(verified),
    names: {
      user_company_name: normalizeCompanyName(userRow.company),
      database_company_name: normalizeCompanyName(dbRow.company_name),
      selected_company_name: normalizeCompanyName(companyRow.company_name),
      selected_company_email: companyEmail,
      mapped_email: mappedEmail,
    },
    normalized: {
      user_id: Number(userRow.id || 0),
      database_name: normalizeDatabaseName(dbRow.database_name),
      company_profile_id: Number(companyRow.id || 0),
      company_name: normalizeCompanyName(companyRow.company_name),
      company_code: normalizeCompanyCode(companyRow.company_code),
      email: companyEmail,
      mapped_email: mappedEmail,
      logo_path: String(companyRow.logo_path || "").trim(),
    },
  };
}

async function syncMappedEmailSetupForDatabase(normalizedMapping) {
  const databaseName = normalizeDatabaseName(normalizedMapping?.database_name);
  const companyName = normalizeCompanyName(normalizedMapping?.company_name);
  const mappedEmail = normalizeEmail(normalizedMapping?.mapped_email || normalizedMapping?.email);
  if (!databaseName || !companyName) return;

  const subjectTemplate = `Invoice {{invoice_no}} - ${companyName}`;
  const bodyTemplate = `Dear {{customer_name}},\n\nPlease find attached your invoice {{invoice_no}}.\n\nThank you.\n${companyName}`;

  await db.withDatabase(databaseName, async () => {
    let row = await EmailSetup.findOne({ order: [["id", "ASC"]] });
    if (!row) {
      await EmailSetup.create({
        smtp_user: mappedEmail || null,
        from_name: companyName,
        from_email: mappedEmail || null,
        subject_template: subjectTemplate,
        body_template: bodyTemplate,
      });
      return;
    }

    const payload = {
      from_name: companyName,
      subject_template: subjectTemplate,
    };
    if (mappedEmail) {
      payload.smtp_user = mappedEmail;
      payload.from_email = mappedEmail;
    }
    await row.update(payload);
  });
}

exports.getMappedMeta = async (_req, res) => {
  const cfg = getDbConfig();
  const mainDbClient = new Client({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database || INVENTORY_DB_NAME,
  });
  try {
    await mainDbClient.connect();
    await ensureDatabaseRegistryTable(mainDbClient);
    await ensureCompanyRegistryTable(mainDbClient);
    await ensureUserMappingTable(mainDbClient);

    const usersRs = await mainDbClient.query(
      `SELECT id, username, email, company
       FROM users
       ORDER BY username ASC, id ASC`
    );
    const dbRs = await mainDbClient.query(
      `SELECT database_name, company_name
       FROM ${DATABASE_REGISTRY_TABLE}
       ORDER BY LOWER(database_name) ASC`
    );
    const companiesRs = await mainDbClient.query(
      `SELECT id, company_name, company_code, email
       FROM ${COMPANY_REGISTRY_TABLE}
       ORDER BY LOWER(company_name) ASC`
    );

    res.json({
      users: (usersRs.rows || []).map((row) => ({
        id: Number(row.id || 0),
        username: String(row.username || "").trim(),
        email: String(row.email || "").trim(),
        company_name: normalizeCompanyName(row.company),
      })),
      databases: (dbRs.rows || []).map((row) => ({
        name: normalizeDatabaseName(row.database_name),
        company_name: normalizeCompanyName(row.company_name),
        label: `${normalizeCompanyName(row.company_name)} (${normalizeDatabaseName(row.database_name)})`,
      })).filter((x) => x.name),
      companies: (companiesRs.rows || []).map((row) => ({
        id: Number(row.id || 0),
        company_name: normalizeCompanyName(row.company_name),
        company_code: normalizeCompanyCode(row.company_code),
        email: normalizeEmail(row.email),
      })),
    });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to load mapped meta data." });
  } finally {
    await mainDbClient.end().catch(() => {});
  }
};

exports.getMappedByUser = async (req, res) => {
  const userId = Number(req.params.userId || 0);
  if (!Number.isFinite(userId) || userId <= 0) {
    return res.status(400).json({ message: "Invalid user id." });
  }
  const cfg = getDbConfig();
  const mainDbClient = new Client({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database || INVENTORY_DB_NAME,
  });
  try {
    await mainDbClient.connect();
    await ensureUserMappingTable(mainDbClient);
    const rs = await mainDbClient.query(
      `SELECT um.user_id, um.database_name, um.company_profile_id, um.mapped_email, um.is_verified, cp.company_name, cp.company_code, cp.email
       FROM user_mappings um
       JOIN ${COMPANY_REGISTRY_TABLE} cp ON cp.id = um.company_profile_id
       WHERE um.user_id = $1
       LIMIT 1`,
      [userId]
    );
    if (!rs.rowCount) {
      return res.json({ mapping: null });
    }
    const row = rs.rows[0];
    res.json({
      mapping: {
        user_id: Number(row.user_id || 0),
        database_name: normalizeDatabaseName(row.database_name),
        company_profile_id: Number(row.company_profile_id || 0),
        company_name: normalizeCompanyName(row.company_name),
        company_code: normalizeCompanyCode(row.company_code),
        email: normalizeEmail(row.email),
        mapped_email: normalizeEmail(row.mapped_email || row.email),
        is_verified: Boolean(row.is_verified),
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to load mapping." });
  } finally {
    await mainDbClient.end().catch(() => {});
  }
};

exports.verifyMapping = async (req, res) => {
  const canAdd = await hasMappedActionPermission(req, "add");
  if (!canAdd) {
    return res.status(403).json({ message: "Forbidden: Missing Mapped add permission." });
  }
  const userId = Number(req.body?.user_id || 0);
  const databaseName = normalizeDatabaseName(req.body?.database_name);
  const companyId = Number(req.body?.company_profile_id || 0);
  const mappedEmail = normalizeEmail(req.body?.email || req.body?.mapped_email);
  if (!Number.isFinite(userId) || userId <= 0 || !databaseName || !Number.isFinite(companyId) || companyId <= 0 || !mappedEmail) {
    return res.status(400).json({ message: "User, database, company and email are required." });
  }

  const cfg = getDbConfig();
  const mainDbClient = new Client({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database || INVENTORY_DB_NAME,
  });
  try {
    await mainDbClient.connect();
    await ensureDatabaseRegistryTable(mainDbClient);
    await ensureCompanyRegistryTable(mainDbClient);
    const result = await getMappingPieces(mainDbClient, userId, databaseName, companyId, mappedEmail);
    res.json({
      verified: result.verified,
      names: result.names,
      message: result.verified ? "Verified successfully." : "Company/email does not match.",
    });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to verify mapping." });
  } finally {
    await mainDbClient.end().catch(() => {});
  }
};

exports.saveMapping = async (req, res) => {
  const canAdd = await hasMappedActionPermission(req, "add");
  if (!canAdd) {
    return res.status(403).json({ message: "Forbidden: Missing Mapped add permission." });
  }
  const userId = Number(req.body?.user_id || 0);
  const databaseName = normalizeDatabaseName(req.body?.database_name);
  const companyId = Number(req.body?.company_profile_id || 0);
  const mappedEmail = normalizeEmail(req.body?.email || req.body?.mapped_email);
  if (!Number.isFinite(userId) || userId <= 0 || !databaseName || !Number.isFinite(companyId) || companyId <= 0 || !mappedEmail) {
    return res.status(400).json({ message: "User, database, company and email are required." });
  }

  const cfg = getDbConfig();
  const mainDbClient = new Client({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database || INVENTORY_DB_NAME,
  });
  try {
    await mainDbClient.connect();
    await ensureDatabaseRegistryTable(mainDbClient);
    await ensureCompanyRegistryTable(mainDbClient);
    await ensureUserMappingTable(mainDbClient);
    const result = await getMappingPieces(mainDbClient, userId, databaseName, companyId, mappedEmail);
    if (!result.verified) {
      return res.status(400).json({
        message: "Verify failed. User company, database company, selected company and email must match.",
        names: result.names,
      });
    }

    await mainDbClient.query(
      `INSERT INTO user_mappings
       (user_id, company_profile_id, database_name, mapped_email, is_verified, created_by, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, TRUE, $5, NOW(), NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET company_profile_id = EXCLUDED.company_profile_id,
                     database_name = EXCLUDED.database_name,
                     mapped_email = EXCLUDED.mapped_email,
                     is_verified = TRUE,
                     "updatedAt" = NOW()`,
      [result.normalized.user_id, result.normalized.company_profile_id, result.normalized.database_name, result.normalized.mapped_email, Number(req.user?.id || 0) || null]
    );
    await syncMappedEmailSetupForDatabase(result.normalized).catch(() => {});

    res.json({
      message: "Mapped successfully.",
      mapping: {
        user_id: result.normalized.user_id,
        database_name: result.normalized.database_name,
        company_profile_id: result.normalized.company_profile_id,
        company_name: result.normalized.company_name,
        company_code: result.normalized.company_code,
        email: result.normalized.email,
        mapped_email: result.normalized.mapped_email,
        logo_path: result.normalized.logo_path,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to save mapping." });
  } finally {
    await mainDbClient.end().catch(() => {});
  }
};

exports.listInvMapEntries = async (req, res) => {
  const canView = await hasInvMapActionPermission(req, "view");
  if (!canView) {
    return res.status(403).json({ message: "Forbidden: Missing Inv Map view permission." });
  }

  const cfg = getDbConfig();
  const mainDbClient = new Client({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database || INVENTORY_DB_NAME,
  });

  try {
    await mainDbClient.connect();
    await ensureUserInvoiceMappingTable(mainDbClient);
    const filterDatabaseName = normalizeDatabaseName(req.query?.database_name);
    let rs;
    if (filterDatabaseName) {
      rs = await mainDbClient.query(
        `SELECT uim.*, u.username, u.email
         FROM ${USER_INVOICE_MAPPING_TABLE} uim
         LEFT JOIN users u ON u.id = uim.user_id
         WHERE LOWER(uim.database_name) = LOWER($1)
         ORDER BY uim.user_id ASC, uim.id ASC`,
        [filterDatabaseName]
      );
    } else {
      rs = await mainDbClient.query(
        `SELECT uim.*, u.username, u.email
         FROM ${USER_INVOICE_MAPPING_TABLE} uim
         LEFT JOIN users u ON u.id = uim.user_id
         ORDER BY LOWER(uim.database_name) ASC, uim.user_id ASC, uim.id ASC`
      );
    }

    const rows = (rs.rows || []).map((row) => ({
      id: Number(row.id || 0),
      user_id: Number(row.user_id || 0),
      username: String(row.username || "").trim(),
      email: String(row.email || "").trim(),
      database_name: normalizeDatabaseName(row.database_name),
      feature_flags: {
        logo: Boolean(row.logo_enabled),
        invoice: Boolean(row.invoice_enabled),
        quotation: Boolean(row.quotation_enabled),
        quotation2: Boolean(row.quotation2_enabled),
        quotation3: Boolean(row.quotation3_enabled),
        sign_c: Boolean(row.sign_c_enabled),
        sign_v: Boolean(row.sign_v_enabled),
        seal_c: Boolean(row.seal_c_enabled),
        seal_v: Boolean(row.seal_v_enabled),
        sign_q2: Boolean(row.sign_q2_enabled),
        seal_q2: Boolean(row.seal_q2_enabled),
        sign_q3: Boolean(row.sign_q3_enabled),
        seal_q3: Boolean(row.seal_q3_enabled),
        theme: Boolean(row.theme_enabled),
      },
      is_verified: Boolean(row.is_verified),
      updated_at: row.updatedAt || null,
    }));

    res.json({ entries: rows });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to load Inv Map entries." });
  } finally {
    await mainDbClient.end().catch(() => {});
  }
};

exports.deleteInvMapEntry = async (req, res) => {
  const canDelete = await hasInvMapActionPermission(req, "delete");
  if (!canDelete) {
    return res.status(403).json({ message: "Forbidden: Missing Inv Map delete permission." });
  }

  const entryId = Number(req.params.entryId || 0);
  if (!Number.isFinite(entryId) || entryId <= 0) {
    return res.status(400).json({ message: "Invalid entry id." });
  }

  const cfg = getDbConfig();
  const mainDbClient = new Client({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database || INVENTORY_DB_NAME,
  });
  try {
    await mainDbClient.connect();
    await ensureUserInvoiceMappingTable(mainDbClient);
    const rs = await mainDbClient.query(
      `DELETE FROM ${USER_INVOICE_MAPPING_TABLE}
       WHERE id = $1
       RETURNING id`,
      [entryId]
    );
    if (!rs.rowCount) {
      return res.status(404).json({ message: "Inv Map entry not found." });
    }
    res.json({ message: "Inv Map entry deleted successfully." });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to delete Inv Map entry." });
  } finally {
    await mainDbClient.end().catch(() => {});
  }
};

async function resolveCanonicalInvMapUserId(userRef, userModel) {
  const fallbackId = Number(userRef?.user_id || 0);
  if (String(userRef?.user_database || "").toLowerCase() === INVENTORY_DB_NAME) {
    return fallbackId;
  }

  const plain = userModel && typeof userModel.toJSON === "function" ? userModel.toJSON() : (userModel || {});
  const email = String(plain?.email || "").trim().toLowerCase();
  const username = String(plain?.username || "").trim().toLowerCase();

  const found = await db.withDatabase(INVENTORY_DB_NAME, async () => {
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
    return fallbackId;
  });

  return Number(found || fallbackId || 0);
}

exports.getInvMapByUser = async (req, res) => {
  const canView = await hasInvMapActionPermission(req, "view");
  if (!canView) {
    return res.status(403).json({ message: "Forbidden: Missing Inv Map view permission." });
  }

  const userRef = parseUserReference(req.params.userId);
  if (!userRef) {
    return res.status(400).json({ message: "Invalid user reference." });
  }

  const databaseName = normalizeDatabaseName(req.query?.database_name);
  if (!databaseName) {
    return res.status(400).json({ message: "Database is required." });
  }

  const cfg = getDbConfig();
  const mainDbClient = new Client({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database || INVENTORY_DB_NAME,
  });

  try {
    const user = await getUserFromDatabase(userRef.user_database, userRef.user_id);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    const canonicalUserId = await resolveCanonicalInvMapUserId(userRef, user);

    await mainDbClient.connect();
    await ensureUserInvoiceMappingTable(mainDbClient);
    const rs = await mainDbClient.query(
      `SELECT *
       FROM ${USER_INVOICE_MAPPING_TABLE}
       WHERE user_id = $1 AND LOWER(database_name) = LOWER($2)
       LIMIT 1`,
      [canonicalUserId, databaseName]
    );

    if (!rs.rowCount) {
      return res.json({ mapping: null });
    }

    const row = rs.rows[0];
    res.json({
      mapping: {
        user_id: Number(row.user_id || 0),
        database_name: normalizeDatabaseName(row.database_name),
        feature_flags: {
          logo: Boolean(row.logo_enabled),
          invoice: Boolean(row.invoice_enabled),
          quotation: Boolean(row.quotation_enabled),
          quotation2: Boolean(row.quotation2_enabled),
          quotation3: Boolean(row.quotation3_enabled),
          sign_c: Boolean(row.sign_c_enabled),
          sign_v: Boolean(row.sign_v_enabled),
          seal_c: Boolean(row.seal_c_enabled),
          seal_v: Boolean(row.seal_v_enabled),
          sign_q2: Boolean(row.sign_q2_enabled),
          seal_q2: Boolean(row.seal_q2_enabled),
          sign_q3: Boolean(row.sign_q3_enabled),
          seal_q3: Boolean(row.seal_q3_enabled),
          theme: Boolean(row.theme_enabled),
        },
        is_verified: Boolean(row.is_verified),
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to load Inv Map data." });
  } finally {
    await mainDbClient.end().catch(() => {});
  }
};

exports.verifyInvMap = async (req, res) => {
  const canAdd = await hasInvMapActionPermission(req, "add");
  if (!canAdd) {
    return res.status(403).json({ message: "Forbidden: Missing Inv Map add permission." });
  }

  const userRef = parseUserReference(req.body?.user_ref);
  const databaseName = normalizeDatabaseName(req.body?.database_name);
  const featureFlags = normalizeInvMapFlags(req.body?.feature_flags);

  if (!userRef) {
    return res.status(400).json({ message: "User is required." });
  }
  if (!databaseName) {
    return res.status(400).json({ message: "Database is required." });
  }
  if (!hasAnyInvMapFlag(featureFlags)) {
    return res.status(400).json({ message: "Select at least one function checkbox." });
  }

  try {
    const user = await getUserFromDatabase(userRef.user_database, userRef.user_id);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    const canonicalUserId = await resolveCanonicalInvMapUserId(userRef, user);

    const availability = await getPreferenceAvailability(databaseName, canonicalUserId);
    const missing = getInvMapMissing(featureFlags, availability);
    const verified = true;

    res.json({
      verified,
      missing,
      availability,
      message: missing.length
        ? `Verified with warning. Missing Preference uploads: ${missing.join(", ")}`
        : "Verified successfully.",
    });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to verify Inv Map." });
  }
};

exports.saveInvMap = async (req, res) => {
  const canAdd = await hasInvMapActionPermission(req, "add");
  if (!canAdd) {
    return res.status(403).json({ message: "Forbidden: Missing Inv Map add permission." });
  }

  const userRef = parseUserReference(req.body?.user_ref);
  const databaseName = normalizeDatabaseName(req.body?.database_name);
  const featureFlags = normalizeInvMapFlags(req.body?.feature_flags);

  if (!userRef) {
    return res.status(400).json({ message: "User is required." });
  }
  if (!databaseName) {
    return res.status(400).json({ message: "Database is required." });
  }
  if (!hasAnyInvMapFlag(featureFlags)) {
    return res.status(400).json({ message: "Select at least one function checkbox." });
  }

  const cfg = getDbConfig();
  const mainDbClient = new Client({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database || INVENTORY_DB_NAME,
  });

  try {
    const user = await getUserFromDatabase(userRef.user_database, userRef.user_id);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    const canonicalUserId = await resolveCanonicalInvMapUserId(userRef, user);

    const availability = await getPreferenceAvailability(databaseName, canonicalUserId);
    const missing = getInvMapMissing(featureFlags, availability);

    await mainDbClient.connect();
    await ensureUserInvoiceMappingTable(mainDbClient);
    await mainDbClient.query(
      `INSERT INTO ${USER_INVOICE_MAPPING_TABLE}
       (user_id, database_name, logo_enabled, invoice_enabled, quotation_enabled, quotation2_enabled, quotation3_enabled,
        sign_c_enabled, sign_v_enabled, seal_c_enabled, seal_v_enabled, sign_q2_enabled, seal_q2_enabled, sign_q3_enabled, seal_q3_enabled, theme_enabled, is_verified, created_by, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, TRUE, $17, NOW(), NOW())
       ON CONFLICT (user_id, database_name)
       DO UPDATE SET logo_enabled = EXCLUDED.logo_enabled,
                     invoice_enabled = EXCLUDED.invoice_enabled,
                     quotation_enabled = EXCLUDED.quotation_enabled,
                     quotation2_enabled = EXCLUDED.quotation2_enabled,
                     quotation3_enabled = EXCLUDED.quotation3_enabled,
                     sign_c_enabled = EXCLUDED.sign_c_enabled,
                     sign_v_enabled = EXCLUDED.sign_v_enabled,
                     seal_c_enabled = EXCLUDED.seal_c_enabled,
                     seal_v_enabled = EXCLUDED.seal_v_enabled,
                     sign_q2_enabled = EXCLUDED.sign_q2_enabled,
                     seal_q2_enabled = EXCLUDED.seal_q2_enabled,
                     sign_q3_enabled = EXCLUDED.sign_q3_enabled,
                     seal_q3_enabled = EXCLUDED.seal_q3_enabled,
                     theme_enabled = EXCLUDED.theme_enabled,
                     is_verified = TRUE,
                     "updatedAt" = NOW()`,
      [
        canonicalUserId,
        databaseName,
        featureFlags.logo,
        featureFlags.invoice,
        featureFlags.quotation,
        featureFlags.quotation2,
        featureFlags.quotation3,
        featureFlags.sign_c,
        featureFlags.sign_v,
        featureFlags.seal_c,
        featureFlags.seal_v,
        featureFlags.sign_q2,
        featureFlags.seal_q2,
        featureFlags.sign_q3,
        featureFlags.seal_q3,
        featureFlags.theme,
        Number(req.user?.id || 0) || null,
      ]
    );

    res.json({
      message: missing.length
        ? `Inv Map saved. Missing uploads: ${missing.join(", ")}`
        : "Inv Map saved successfully.",
      mapping: {
        user_ref: `${userRef.user_database}:${userRef.user_id}`,
        user_id: canonicalUserId,
        database_name: databaseName,
        feature_flags: featureFlags,
        is_verified: true,
      },
      missing,
    });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to save Inv Map." });
  } finally {
    await mainDbClient.end().catch(() => {});
  }
};

exports.getMyInvMap = async (req, res) => {
  const userId = Number(req.user?.id || req.user?.userId || 0);
  if (!Number.isFinite(userId) || userId <= 0) {
    return res.status(401).json({ message: "Invalid token user." });
  }

  const requesterDatabase = normalizeDatabaseName(req.databaseName || req.user?.database_name || req.headers["x-database-name"]) || INVENTORY_DB_NAME;
  const databaseName = requesterDatabase;
  const cfg = getDbConfig();
  const mainDbClient = new Client({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database || INVENTORY_DB_NAME,
  });
  try {
    const requesterUser = await getUserFromDatabase(requesterDatabase, userId);
    const canonicalUserId = await resolveCanonicalInvMapUserId(
      { user_database: requesterDatabase, user_id: userId },
      requesterUser
    );

    await mainDbClient.connect();
    await ensureUserInvoiceMappingTable(mainDbClient);
    await ensureUserQuotationRenderTable(mainDbClient);
    const rs = await mainDbClient.query(
      `SELECT *
       FROM ${USER_INVOICE_MAPPING_TABLE}
       WHERE user_id = $1 AND LOWER(database_name) = LOWER($2)
       LIMIT 1`,
      [canonicalUserId, databaseName]
    );
    if (!rs.rowCount) {
      return res.json({
        mapping: null,
        feature_flags: null,
      });
    }
    const row = rs.rows[0];
    const visibilityRs = await mainDbClient.query(
      `SELECT render_visibility_json, render_overrides_json
       FROM ${USER_QUOTATION_RENDER_TABLE}
       WHERE user_id = $1 AND LOWER(database_name) = LOWER($2) AND quotation_type = 'quotation2'
       LIMIT 1`,
      [Number(canonicalUserId || row.user_id || 0), databaseName]
    );
    const quotation2RenderVisibility = visibilityRs.rowCount
      ? parseQuotationRenderVisibility(visibilityRs.rows[0], QUOTATION2_RENDER_KEYS)
      : {};
    const quotation2RenderOverrides = visibilityRs.rowCount
      ? parseQuotationRenderOverrides(visibilityRs.rows[0])
      : { item_names_by_invoice: {}, item_rates_by_invoice: {}, layout_state: {} };
    const quotation3Rs = await mainDbClient.query(
      `SELECT render_visibility_json, render_overrides_json
       FROM ${USER_QUOTATION_RENDER_TABLE}
       WHERE user_id = $1 AND LOWER(database_name) = LOWER($2) AND quotation_type = 'quotation3'
       LIMIT 1`,
      [Number(canonicalUserId || row.user_id || 0), databaseName]
    );
    const quotation3RenderVisibility = quotation3Rs.rowCount
      ? parseQuotationRenderVisibility(quotation3Rs.rows[0], QUOTATION3_RENDER_KEYS)
      : {};
    const quotation3RenderOverrides = quotation3Rs.rowCount
      ? parseQuotationRenderOverrides(quotation3Rs.rows[0])
      : { item_names_by_invoice: {}, item_rates_by_invoice: {}, layout_state: {} };
    res.json({
      mapping: {
        user_id: Number(canonicalUserId || row.user_id || 0),
        database_name: normalizeDatabaseName(row.database_name),
        is_verified: Boolean(row.is_verified),
      },
      feature_flags: {
        logo: Boolean(row.logo_enabled),
        invoice: Boolean(row.invoice_enabled),
        quotation: Boolean(row.quotation_enabled),
        quotation2: Boolean(row.quotation2_enabled),
        quotation3: Boolean(row.quotation3_enabled),
        sign_c: Boolean(row.sign_c_enabled),
        sign_v: Boolean(row.sign_v_enabled),
        seal_c: Boolean(row.seal_c_enabled),
        seal_v: Boolean(row.seal_v_enabled),
        sign_q2: Boolean(row.sign_q2_enabled),
        seal_q2: Boolean(row.seal_q2_enabled),
        sign_q3: Boolean(row.sign_q3_enabled),
        seal_q3: Boolean(row.seal_q3_enabled),
        theme: Boolean(row.theme_enabled),
      },
      quotation2_render_visibility: quotation2RenderVisibility,
      quotation2_render_overrides: quotation2RenderOverrides,
      quotation3_render_visibility: quotation3RenderVisibility,
      quotation3_render_overrides: quotation3RenderOverrides,
    });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to load your Inv Map." });
  } finally {
    await mainDbClient.end().catch(() => {});
  }
};

async function saveMyQuotationRenderSettings(req, res, options) {
  const quotationType = options?.quotationType === "quotation3" ? "quotation3" : "quotation2";
  const allowedKeys = quotationType === "quotation3" ? QUOTATION3_RENDER_KEYS : QUOTATION2_RENDER_KEYS;
  const label = quotationType === "quotation3" ? "Quotation 3" : "Quotation 2";
  const userId = Number(req.user?.id || req.user?.userId || 0);
  if (!Number.isFinite(userId) || userId <= 0) {
    return res.status(401).json({ message: "Invalid token user." });
  }

  const requesterDatabase = normalizeDatabaseName(req.databaseName || req.user?.database_name || req.headers["x-database-name"]) || INVENTORY_DB_NAME;
  const databaseName = normalizeDatabaseName(req.body?.database_name) || requesterDatabase;
  const rawVisibility = req.body?.render_visibility;
  const rawOverrides = req.body?.render_overrides;
  const hasVisibilityPayload = rawVisibility && typeof rawVisibility === "object";
  const hasOverridesPayload = rawOverrides && typeof rawOverrides === "object";
  if (!hasVisibilityPayload && !hasOverridesPayload) {
    return res.status(400).json({ message: "At least one render input payload is required." });
  }
  const normalizedVisibility = hasVisibilityPayload ? normalizeQuotationRenderVisibility(rawVisibility, allowedKeys) : null;
  if (hasVisibilityPayload && !Object.keys(normalizedVisibility).length) {
    return res.status(400).json({ message: "At least one render visibility value is required." });
  }
  const normalizedOverrides = hasOverridesPayload
    ? normalizeQuotation2RenderOverrides(rawOverrides)
    : null;

  const cfg = getDbConfig();
  const mainDbClient = new Client({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database || INVENTORY_DB_NAME,
  });

  try {
    const requesterUser = await getUserFromDatabase(requesterDatabase, userId);
    const canonicalUserId = await resolveCanonicalInvMapUserId(
      { user_database: requesterDatabase, user_id: userId },
      requesterUser
    );

    await mainDbClient.connect();
    await ensureUserQuotationRenderTable(mainDbClient);
    const existingRs = await mainDbClient.query(
      `SELECT render_visibility_json, render_overrides_json
       FROM ${USER_QUOTATION_RENDER_TABLE}
       WHERE user_id = $1 AND LOWER(database_name) = LOWER($2) AND quotation_type = $3
       LIMIT 1`,
      [Number(canonicalUserId || userId), databaseName, quotationType]
    );
    const existingRow = existingRs.rowCount ? existingRs.rows[0] : null;
    const finalVisibility = normalizedVisibility || parseQuotationRenderVisibility(existingRow, allowedKeys);
    const finalOverrides = normalizedOverrides || parseQuotationRenderOverrides(existingRow);
    await mainDbClient.query(
      `INSERT INTO ${USER_QUOTATION_RENDER_TABLE}
       (user_id, database_name, quotation_type, render_visibility_json, render_overrides_json, created_by, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       ON CONFLICT (user_id, database_name, quotation_type)
       DO UPDATE SET render_visibility_json = EXCLUDED.render_visibility_json,
                     render_overrides_json = EXCLUDED.render_overrides_json,
                     "updatedAt" = NOW()`,
      [
        Number(canonicalUserId || userId),
        databaseName,
        quotationType,
        JSON.stringify(finalVisibility),
        JSON.stringify(finalOverrides),
        Number(req.user?.id || 0) || null,
      ]
    );

    res.json({
      message: `${label} render inputs saved.`,
      database_name: databaseName,
      render_visibility: finalVisibility,
      render_overrides: finalOverrides,
    });
  } catch (err) {
    res.status(500).json({ message: err.message || `Failed to save ${label.toLowerCase()} render inputs.` });
  } finally {
    await mainDbClient.end().catch(() => {});
  }
}

exports.saveMyQuotation2RenderVisibility = async (req, res) => {
  return saveMyQuotationRenderSettings(req, res, { quotationType: "quotation2" });
};

exports.saveMyQuotation3RenderVisibility = async (req, res) => {
  return saveMyQuotationRenderSettings(req, res, { quotationType: "quotation3" });
};

exports.getUserAccess = async (req, res) => {
  const ref = parseUserReference(req.params.userId);
  if (!ref) {
    return res.status(400).json({ message: "Invalid user id" });
  }

  const user = await getUserFromDatabase(ref.user_database, ref.user_id);
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }
  const requesterId = Number(req?.user?.id || req?.user?.userId || 0);
  const requesterIsSuper = await isRequesterSuperAdmin(req);
  const userPlain = user.toJSON ? user.toJSON() : user;
  if (isProtectedSuperAdminTarget(userPlain, requesterId, requesterIsSuper)) {
    return res.status(403).json({ message: "Forbidden: Super admin user is protected." });
  }
  const canEditSuperUser = await canRequesterEditSuperFlag(req, userPlain);

  const row = await UserAccess.findOne({
    where: { user_id: ref.user_id, user_database: ref.user_database },
    order: [["updatedAt", "DESC"], ["id", "DESC"]],
  });
  res.json({
    user: {
      ...(user.toJSON ? user.toJSON() : user),
      database_name: ref.user_database,
      selection_key: `${ref.user_database}:${ref.user_id}`,
    },
    allowed_pages: parseAllowedPages(row),
    allowed_actions: parseAllowedActions(row),
    database_name: normalizeDatabaseName(row?.database_name),
    user_database: ref.user_database,
    super_user: Boolean(userPlain.is_super_user),
    can_edit_super_user: canEditSuperUser,
  });
};

exports.saveUserAccess = async (req, res) => {
  const ref = parseUserReference(req.params.userId);
  if (!ref) {
    return res.status(400).json({ message: "Invalid user id" });
  }

  const user = await getUserFromDatabase(ref.user_database, ref.user_id);
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }
  const requesterId = Number(req?.user?.id || req?.user?.userId || 0);
  const requesterIsSuper = await isRequesterSuperAdmin(req);
  if (isProtectedSuperAdminTarget(user, requesterId, requesterIsSuper)) {
    return res.status(403).json({ message: "Forbidden: Super admin user is protected." });
  }

  const allowedActions = expandImplicitActionDependencies(normalizeActions(req.body.allowed_actions));
  const requestedPages = normalizePages(req.body.allowed_pages);
  const allowedPages = derivePagesFromActions(allowedActions, requestedPages);
  const databaseName = normalizeDatabaseName(req.body.database_name);

  let row = await UserAccess.findOne({
    where: { user_id: ref.user_id, user_database: ref.user_database },
    order: [["updatedAt", "DESC"], ["id", "DESC"]],
  });
  if (!row) {
    row = await UserAccess.create({
      user_id: ref.user_id,
      user_database: ref.user_database,
      allowed_pages_json: JSON.stringify(allowedPages),
      allowed_actions_json: JSON.stringify(allowedActions),
      database_name: databaseName,
    });
  } else {
    row.user_database = ref.user_database;
    row.allowed_pages_json = JSON.stringify(allowedPages);
    row.allowed_actions_json = JSON.stringify(allowedActions);
    row.database_name = databaseName;
    await row.save();
  }

  const canEditSuperUser = await canRequesterEditSuperFlag(req, user);
  if (canEditSuperUser && req.body && Object.prototype.hasOwnProperty.call(req.body, "super_user")) {
    user.is_super_user = Boolean(req.body.super_user);
    await user.save();
  }

  res.json({
    message: "Access settings saved",
    user_id: ref.user_id,
    user_database: ref.user_database,
    allowed_pages: allowedPages,
    allowed_actions: allowedActions,
    database_name: databaseName,
    super_user: Boolean(user.is_super_user),
  });
};

exports.getMyAccess = async (req, res) => {
  const userId = Number(req.user?.id || req.user?.userId || 0);
  if (!Number.isFinite(userId) || userId <= 0) {
    return res.status(401).json({ message: "Invalid token user" });
  }

  const userDatabase = normalizeUserDatabase(req.databaseName || req.user?.database_name || INVENTORY_DB_NAME);

                                                                              
                                                                                        
  let row = await findAccessFromMainDb(userId, userDatabase);
  if (!row) {
    row = await UserAccess.findOne({
      where: { user_id: userId, user_database: userDatabase },
      order: [["updatedAt", "DESC"], ["id", "DESC"]],
    });
  }
  if (!row && userDatabase !== INVENTORY_DB_NAME) {
    row = await findAccessFromMainDb(userId, INVENTORY_DB_NAME);
    if (!row) {
      row = await UserAccess.findOne({
        where: { user_id: userId, user_database: INVENTORY_DB_NAME },
        order: [["updatedAt", "DESC"], ["id", "DESC"]],
      });
    }
  }
  const allowedActions = parseAllowedActions(row);
  const allowedPages = derivePagesFromActions(allowedActions, parseAllowedPages(row));
  const hasAccessConfig = Boolean(row) || allowedPages.length > 0 || allowedActions.length > 0;
  const mappedProfile = await findMappedUserProfile(userId);

  res.json({
    allowed_pages: allowedPages,
    allowed_actions: allowedActions,
    database_name: normalizeDatabaseName(mappedProfile?.database_name) || normalizeDatabaseName(row?.database_name),
    user_database: userDatabase,
    has_access_config: hasAccessConfig,
  });
};
