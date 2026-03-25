const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const { spawn } = require("child_process");
const db = require("../config/database");
const User = require("../models/User");
const UserAccess = require("../models/UserAccess");
const DEMO_DB_NAME = "demo";
const INVENTORY_DB_NAME = "inventory";
const RESERVED_DATABASES = new Set(["postgres", "template0", "template1"]);
const DATABASE_REGISTRY_TABLE = "company_databases";
const DATABASE_STORAGE_ROOT = path.resolve(__dirname, "../storage/databases");
const COMPANY_REGISTRY_TABLE = "company_profiles";
const COMPANY_STORAGE_ROOT = path.resolve(__dirname, "../storage/companies");
const COMPANY_LOGO_EXTENSIONS = new Set([".jpg", ".jpeg", ".bmp", ".gif", ".tiff", ".tif", ".png"]);

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

  // If a list page has edit permission, allow opening its edit-form page too.
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
      folder_name VARCHAR(120) NOT NULL,
      logo_path VARCHAR(500) NOT NULL,
      logo_file_name VARCHAR(255) NOT NULL,
      created_by INTEGER,
      "createdAt" TIMESTAMP DEFAULT NOW(),
      "updatedAt" TIMESTAMP DEFAULT NOW()
    );
  `);
}

async function ensureUserMappingTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS user_mappings (
      id SERIAL PRIMARY KEY,
      user_id INTEGER UNIQUE NOT NULL,
      company_profile_id INTEGER NOT NULL REFERENCES ${COMPANY_REGISTRY_TABLE}(id) ON DELETE CASCADE,
      database_name VARCHAR(120) NOT NULL,
      is_verified BOOLEAN DEFAULT FALSE,
      created_by INTEGER,
      "createdAt" TIMESTAMP DEFAULT NOW(),
      "updatedAt" TIMESTAMP DEFAULT NOW()
    );
  `);
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
      `SELECT um.database_name, cp.company_name, cp.logo_path
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
    return User.findByPk(userId, {
      attributes: ["id", "username", "email", "role"],
    });
  });
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

  // If admin has no explicit access row, keep legacy behavior: allow.
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

  // If admin has no explicit access row, keep legacy behavior: allow.
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
      `SELECT id, company_name, folder_name, logo_path, logo_file_name, "createdAt", "updatedAt"
       FROM ${COMPANY_REGISTRY_TABLE}
       ORDER BY LOWER(company_name) ASC, id ASC`
    );
    const rows = (rs.rows || []).map((row) => ({
      id: Number(row.id || 0),
      company_name: normalizeCompanyName(row.company_name),
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
  const fileName = String(req.body?.logo_file_name || "").trim();
  const ext = path.extname(fileName).toLowerCase();
  if (!companyName) {
    return res.status(400).json({ message: "Company name is required." });
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
       (company_name, folder_name, logo_path, logo_file_name, created_by, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING id, company_name, folder_name, logo_path, logo_file_name, "createdAt", "updatedAt"`,
      [companyName, folderName, relativeLogoPath, path.basename(logoPath), Number(req.user?.id || 0) || null]
    );

    const row = rs.rows[0];
    res.status(201).json({
      message: "Company created successfully.",
      company: {
        id: Number(row.id || 0),
        company_name: normalizeCompanyName(row.company_name),
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

async function getMappingPieces(mainDbClient, userId, databaseName, companyId) {
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
    `SELECT id, company_name, logo_path
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
  const userCompany = normalizeNameCompare(userRow.company);
  const dbCompany = normalizeNameCompare(dbRow.company_name);
  const selectedCompany = normalizeNameCompare(companyRow.company_name);
  const verified = userCompany && userCompany === dbCompany && userCompany === selectedCompany;

  return {
    verified: Boolean(verified),
    names: {
      user_company_name: normalizeCompanyName(userRow.company),
      database_company_name: normalizeCompanyName(dbRow.company_name),
      selected_company_name: normalizeCompanyName(companyRow.company_name),
    },
    normalized: {
      user_id: Number(userRow.id || 0),
      database_name: normalizeDatabaseName(dbRow.database_name),
      company_profile_id: Number(companyRow.id || 0),
      company_name: normalizeCompanyName(companyRow.company_name),
      logo_path: String(companyRow.logo_path || "").trim(),
    },
  };
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
      `SELECT id, company_name
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
      `SELECT um.user_id, um.database_name, um.company_profile_id, um.is_verified, cp.company_name
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
  if (!Number.isFinite(userId) || userId <= 0 || !databaseName || !Number.isFinite(companyId) || companyId <= 0) {
    return res.status(400).json({ message: "User, database and company are required." });
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
    const result = await getMappingPieces(mainDbClient, userId, databaseName, companyId);
    res.json({
      verified: result.verified,
      names: result.names,
      message: result.verified ? "Verified successfully." : "Company names do not match.",
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
  if (!Number.isFinite(userId) || userId <= 0 || !databaseName || !Number.isFinite(companyId) || companyId <= 0) {
    return res.status(400).json({ message: "User, database and company are required." });
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
    const result = await getMappingPieces(mainDbClient, userId, databaseName, companyId);
    if (!result.verified) {
      return res.status(400).json({
        message: "Verify failed. User company, database company and selected company must match.",
        names: result.names,
      });
    }

    await mainDbClient.query(
      `INSERT INTO user_mappings
       (user_id, company_profile_id, database_name, is_verified, created_by, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, TRUE, $4, NOW(), NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET company_profile_id = EXCLUDED.company_profile_id,
                     database_name = EXCLUDED.database_name,
                     is_verified = TRUE,
                     "updatedAt" = NOW()`,
      [result.normalized.user_id, result.normalized.company_profile_id, result.normalized.database_name, Number(req.user?.id || 0) || null]
    );

    res.json({
      message: "Mapped successfully.",
      mapping: {
        user_id: result.normalized.user_id,
        database_name: result.normalized.database_name,
        company_profile_id: result.normalized.company_profile_id,
        company_name: result.normalized.company_name,
        logo_path: result.normalized.logo_path,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to save mapping." });
  } finally {
    await mainDbClient.end().catch(() => {});
  }
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

  res.json({
    message: "Access settings saved",
    user_id: ref.user_id,
    user_database: ref.user_database,
    allowed_pages: allowedPages,
    allowed_actions: allowedActions,
    database_name: databaseName,
  });
};

exports.getMyAccess = async (req, res) => {
  const userId = Number(req.user?.id || req.user?.userId || 0);
  if (!Number.isFinite(userId) || userId <= 0) {
    return res.status(401).json({ message: "Invalid token user" });
  }

  const userDatabase = normalizeUserDatabase(req.databaseName || req.user?.database_name || INVENTORY_DB_NAME);

  // Access permissions are treated as global user settings stored in main DB.
  // Data DB (inventory/demo) can switch per user, but access config must remain stable.
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
