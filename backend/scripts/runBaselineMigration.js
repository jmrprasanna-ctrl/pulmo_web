const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const MIGRATIONS_SQL_DIR = path.resolve(__dirname, "..", "migrations", "sql");

function parseArg(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length).trim() : "";
}

function normalizeDbName(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  if (!/^[a-z0-9_]+$/.test(normalized)) return "";
  return normalized;
}

function getDatabases() {
  const fromArg = parseArg("databases");
  const fromEnv = String(process.env.DB_MIGRATION_DATABASES || "").trim();
  const source = fromArg || fromEnv || "inventory";
  const dbs = source
    .split(",")
    .map((x) => normalizeDbName(x))
    .filter(Boolean);
  return [...new Set(dbs)];
}

function resolveDefaultSqlFile() {
  if (!fs.existsSync(MIGRATIONS_SQL_DIR)) return "";
  const files = fs
    .readdirSync(MIGRATIONS_SQL_DIR)
    .filter((name) => name.toLowerCase().endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));
  if (!files.length) return "";
  return path.resolve(MIGRATIONS_SQL_DIR, files[files.length - 1]);
}

function runPsql({ filePath, database }) {
  return new Promise((resolve, reject) => {
    const psql = String(process.env.PSQL_PATH || (process.platform === "win32" ? "psql.exe" : "psql")).trim();
    const host = String(process.env.DB_HOST || "127.0.0.1").trim();
    const port = String(process.env.DB_PORT || "5432").trim();
    const user = String(process.env.DB_USER || "postgres").trim();
    const args = [
      "-v",
      "ON_ERROR_STOP=1",
      "-h",
      host,
      "-p",
      port,
      "-U",
      user,
      "-d",
      database,
      "-f",
      filePath,
    ];

    const child = spawn(psql, args, {
      stdio: "inherit",
      env: {
        ...process.env,
        PGPASSWORD: String(process.env.DB_PASSWORD || ""),
      },
    });

    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`psql exited with code ${code} for database '${database}'`));
      }
    });
  });
}

async function main() {
  const inputFile = parseArg("file");
  const defaultFile = resolveDefaultSqlFile();
  const filePath = inputFile ? path.resolve(inputFile) : defaultFile;
  if (!filePath) {
    throw new Error(`No SQL file found in: ${MIGRATIONS_SQL_DIR}`);
  }
  if (!fs.existsSync(filePath)) {
    throw new Error(`SQL file not found: ${filePath}`);
  }

  const databases = getDatabases();
  if (!databases.length) {
    throw new Error("No valid databases provided. Use --databases=inventory");
  }

  console.log("==> Running SQL migration file");
  console.log(`    file: ${filePath}`);
  console.log(`    databases: ${databases.join(", ")}`);

  for (const database of databases) {
    console.log(`==> Applying SQL on '${database}'...`);
    await runPsql({ filePath, database });
    console.log(`    done: ${database}`);
  }

  console.log("==> SQL migration completed successfully");
}

main().catch((err) => {
  console.error("SQL migration failed:", err.message || err);
  process.exit(1);
});
