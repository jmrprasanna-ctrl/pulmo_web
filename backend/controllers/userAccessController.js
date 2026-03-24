const { Client } = require("pg");
const { spawn } = require("child_process");
const db = require("../config/database");
const User = require("../models/User");
const UserAccess = require("../models/UserAccess");
const DEMO_DB_NAME = "demo";
const INVENTORY_DB_NAME = "inventory";
const ALLOWED_DBS = new Set([INVENTORY_DB_NAME, DEMO_DB_NAME]);

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
      { path: "/stock/stock.html", label: "Stock", actions: ["view", "edit"] },
    ],
  },
  {
    module: "Communication",
    items: [
      { path: "/messages/messages.html", label: "Messages", actions: ["view", "add", "delete"] },
      { path: "/notifications/notifications.html", label: "Notifications", actions: ["view"] },
      { path: "/support/support.html", label: "Support", actions: ["view", "add", "edit", "delete"] },
    ],
  },
  {
    module: "Users",
    items: [
      { path: "/users/user-list.html", label: "User List", actions: ["view", "add", "edit", "delete"] },
      { path: "/users/add-user.html", label: "Add User", actions: ["view", "add"] },
      { path: "/users/edit-user.html", label: "Edit User", actions: ["view", "edit"] },
      { path: "/users/user-access.html", label: "User Access", actions: ["view", "edit"] },
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
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  if (!ALLOWED_DBS.has(normalized)) return null;
  return normalized;
}

function normalizeUserDatabase(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return INVENTORY_DB_NAME;
  if (!ALLOWED_DBS.has(normalized)) return INVENTORY_DB_NAME;
  return normalized;
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
      `SELECT allowed_pages_json, allowed_actions_json, database_name, user_database
       FROM user_accesses
       WHERE user_id = $1 AND (LOWER(COALESCE(user_database, 'inventory')) = $2)
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

async function findAnyAccessFromMainDb(userId) {
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
      `SELECT allowed_pages_json, allowed_actions_json, database_name, user_database
       FROM user_accesses
       WHERE user_id = $1
       ORDER BY CASE WHEN LOWER(COALESCE(user_database, 'inventory')) = 'inventory' THEN 0 ELSE 1 END, id ASC
       LIMIT 1`,
      [userId]
    );
    if (!rs.rowCount) return null;
    return rs.rows[0];
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

async function getUserFromDatabase(databaseName, userId) {
  return db.withDatabase(databaseName, async () => {
    return User.findByPk(userId, {
      attributes: ["id", "username", "email", "role"],
    });
  });
}

exports.getAccessUsers = async (_req, res) => {
  try {
    try{
      await ensureDemoDatabaseSchema();
    }catch(_err){
    }

    const rows = [];

    for (const databaseName of [INVENTORY_DB_NAME, DEMO_DB_NAME]) {
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
        rows.push({
          selection_key: `${databaseName}:${plain.id}`,
          id: plain.id,
          username: plain.username || "",
          email: plain.email || "",
          role,
          database_name: databaseName,
          label: `${plain.username || plain.email || `User ${plain.id}`} [${role}] (${databaseName})`,
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
  const client = new Client({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: "postgres",
  });

  try {
    await ensureDemoDatabaseSchema();
  } catch (_err) {
  }

  try {
    await client.connect();
    const rows = await client.query(
      "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname ASC"
    );
    const names = rows.rows.map((r) => String(r.datname || "").trim()).filter(Boolean);
    const linked = new Set([String(cfg.database || "").trim().toLowerCase(), DEMO_DB_NAME]);
    const filtered = [];
    const seen = new Set();

    names.forEach((n) => {
      const lowered = n.toLowerCase();
      if (!linked.has(lowered) || seen.has(lowered)) return;
      filtered.push(lowered);
      seen.add(lowered);
    });

    if (!seen.has(DEMO_DB_NAME)) {
      filtered.push(DEMO_DB_NAME);
    }

    res.json({ current: cfg.database, databases: filtered.sort((a, b) => a.localeCompare(b)) });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to list databases." });
  } finally {
    await client.end().catch(() => {});
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

  const row = await UserAccess.findOne({ where: { user_id: ref.user_id, user_database: ref.user_database } });
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

  let row = await UserAccess.findOne({ where: { user_id: ref.user_id, user_database: ref.user_database } });
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
  const role = String(req.user?.role || "").trim().toLowerCase();

  // Access permissions are treated as global user settings stored in main DB.
  // Data DB (inventory/demo) can switch per user, but access config must remain stable.
  let row = await findAccessFromMainDb(userId, userDatabase);
  if (!row) {
    row = await UserAccess.findOne({ where: { user_id: userId, user_database: userDatabase } });
  }
  if (!row && userDatabase !== INVENTORY_DB_NAME) {
    row = await findAccessFromMainDb(userId, INVENTORY_DB_NAME);
    if (!row) {
      row = await UserAccess.findOne({ where: { user_id: userId, user_database: INVENTORY_DB_NAME } });
    }
  }
  if (!row && (role === "admin" || role === "manager")) {
    row = await findAnyAccessFromMainDb(userId);
    if (!row) {
      row = await UserAccess.findOne({ where: { user_id: userId } });
    }
  }

  const allowedPages = parseAllowedPages(row);
  const allowedActions = parseAllowedActions(row);
  const hasAccessConfig = Boolean(row) || allowedPages.length > 0 || allowedActions.length > 0;

  res.json({
    allowed_pages: allowedPages,
    allowed_actions: allowedActions,
    database_name: normalizeDatabaseName(row?.database_name),
    user_database: userDatabase,
    has_access_config: hasAccessConfig,
  });
};
