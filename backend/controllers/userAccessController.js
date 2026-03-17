const { Client } = require("pg");
const { spawn } = require("child_process");
const User = require("../models/User");
const UserAccess = require("../models/UserAccess");

const ACCESS_PAGE_OPTIONS = [
  { path: "/dashboard.html", label: "Dashboard" },
  { path: "/products/product-list.html", label: "Products List" },
  { path: "/products/general-machine.html", label: "General Machines" },
  { path: "/products/machine.html", label: "Rental Machines" },
  { path: "/products/add-rental-count.html", label: "Rental Count" },
  { path: "/products/add-rental-consumable.html", label: "Rental Consumables" },
  { path: "/customers/customer-list.html", label: "Customers List" },
  { path: "/vendors/list-vendor.html", label: "Vendors List" },
  { path: "/expenses/expense-list.html", label: "Expenses List" },
  { path: "/invoices/invoice-list.html", label: "Invoice List" },
  { path: "/invoices/create-invoice.html", label: "Create Invoice" },
  { path: "/invoices/view-invoice.html", label: "Invoice Details" },
  { path: "/reports/sales-report.html", label: "Sales Report" },
  { path: "/messages/messages.html", label: "Messages" },
  { path: "/notifications/notifications.html", label: "Notifications" },
  { path: "/support/support.html", label: "Support" },
  { path: "/finance/finance.html", label: "Finance" },
  { path: "/stock/stock.html", label: "Stock Management" }
];

const EXCLUDED_PAGES = new Set([
  "/users/user-list.html",
  "/user-list.html"
]);

function normalizePages(rawPages) {
  const list = Array.isArray(rawPages) ? rawPages : [];
  const valid = new Set(
    ACCESS_PAGE_OPTIONS.map((x) => String(x.path || "").trim().toLowerCase())
  );
  return list
    .map((p) => String(p || "").trim())
    .filter(Boolean)
    .filter((p) => !EXCLUDED_PAGES.has(p.toLowerCase()))
    .filter((p) => valid.has(p.toLowerCase()));
}

function parseAllowedPages(row) {
  try {
    const parsed = JSON.parse(String(row?.allowed_pages_json || "[]"));
    return normalizePages(parsed);
  } catch (_err) {
    return [];
  }
}

function getDbConfig() {
  return {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "inventory",
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
      ["Demo"]
    );
    demoExists = check.rowCount > 0;
    if (!demoExists) {
      await admin.query('CREATE DATABASE "Demo"');
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
  if (!sourceDb) return { demoExists: true, schemaCloned: false };

  const escapedSource = `'${sourceDb.replace(/'/g, "'\\''")}'`;
  const escapedDemo = "'Demo'";
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

exports.getAccessPages = async (_req, res) => {
  res.json({
    pages: ACCESS_PAGE_OPTIONS.filter((x) => !EXCLUDED_PAGES.has(String(x.path || "").toLowerCase()))
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
    const names = rows.rows.map((r) => String(r.datname || "")).filter(Boolean);
    if (!names.includes("Demo")) names.push("Demo");
    res.json({ current: cfg.database, databases: names.sort((a, b) => a.localeCompare(b)) });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to list databases." });
  } finally {
    await client.end().catch(() => {});
  }
};

exports.getUserAccess = async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isFinite(userId) || userId <= 0) {
    return res.status(400).json({ message: "Invalid user id" });
  }
  const user = await User.findByPk(userId, {
    attributes: ["id", "username", "email", "role"]
  });
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }
  const row = await UserAccess.findOne({ where: { user_id: userId } });
  res.json({
    user,
    allowed_pages: parseAllowedPages(row),
    database_name: row?.database_name || null
  });
};

exports.saveUserAccess = async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isFinite(userId) || userId <= 0) {
    return res.status(400).json({ message: "Invalid user id" });
  }
  const user = await User.findByPk(userId, {
    attributes: ["id", "username", "email", "role"]
  });
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }
  if (String(user.role || "").toLowerCase() !== "user") {
    return res.status(400).json({ message: "Access settings are only for role: user" });
  }

  const allowedPages = normalizePages(req.body.allowed_pages);
  const databaseName = String(req.body.database_name || "").trim() || null;

  let row = await UserAccess.findOne({ where: { user_id: userId } });
  if (!row) {
    row = await UserAccess.create({
      user_id: userId,
      allowed_pages_json: JSON.stringify(allowedPages),
      database_name: databaseName
    });
  } else {
    row.allowed_pages_json = JSON.stringify(allowedPages);
    row.database_name = databaseName;
    await row.save();
  }
  res.json({
    message: "Access settings saved",
    user_id: userId,
    allowed_pages: allowedPages,
    database_name: databaseName
  });
};

exports.getMyAccess = async (req, res) => {
  const userId = Number(req.user?.id || req.user?.userId || 0);
  if (!Number.isFinite(userId) || userId <= 0) {
    return res.status(401).json({ message: "Invalid token user" });
  }
  const row = await UserAccess.findOne({ where: { user_id: userId } });
  res.json({
    allowed_pages: parseAllowedPages(row),
    database_name: row?.database_name || null
  });
};
