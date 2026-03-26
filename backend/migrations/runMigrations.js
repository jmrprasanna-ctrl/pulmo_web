require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const MIGRATIONS_TABLE = "schema_migrations";
const MIGRATIONS_DIR = path.resolve(__dirname, "sql");

function getDbConfig(database) {
  return {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "",
    database,
  };
}

async function listTargetDatabases() {
  const admin = new Client(getDbConfig("postgres"));
  await admin.connect();
  try {
    const configured = String(process.env.DB_NAME || "inventory").trim().toLowerCase() || "inventory";
    const requested = Array.from(new Set([configured, "inventory", "demo"]));
    const rs = await admin.query("SELECT datname FROM pg_database WHERE datistemplate = false");
    const existing = new Set((rs.rows || []).map((r) => String(r.datname || "").trim().toLowerCase()));
    return requested.filter((db) => existing.has(db));
  } finally {
    await admin.end().catch(() => {});
  }
}

function getMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.toLowerCase().endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id SERIAL PRIMARY KEY,
      file_name VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
}

async function runForDatabase(databaseName, migrationFiles) {
  const client = new Client(getDbConfig(databaseName));
  await client.connect();
  try {
    await ensureMigrationsTable(client);
    const appliedRs = await client.query(`SELECT file_name FROM ${MIGRATIONS_TABLE}`);
    const applied = new Set((appliedRs.rows || []).map((r) => String(r.file_name || "").trim()));

    for (const fileName of migrationFiles) {
      if (applied.has(fileName)) continue;
      const fullPath = path.join(MIGRATIONS_DIR, fileName);
      const sql = fs.readFileSync(fullPath, "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(`INSERT INTO ${MIGRATIONS_TABLE} (file_name) VALUES ($1)`, [fileName]);
        await client.query("COMMIT");
        console.log(`[migrate] ${databaseName}: applied ${fileName}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  const migrationFiles = getMigrationFiles();
  if (!migrationFiles.length) {
    console.log("[migrate] no sql files found");
    return;
  }
  const dbs = await listTargetDatabases();
  if (!dbs.length) {
    console.log("[migrate] no target databases found");
    return;
  }
  for (const dbName of dbs) {
    await runForDatabase(dbName, migrationFiles);
  }
  console.log("[migrate] complete");
}

main().catch((err) => {
  console.error("[migrate] failed:", err.message || err);
  process.exit(1);
});

