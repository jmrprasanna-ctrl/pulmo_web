const os = require("os");
const path = require("path");
const fs = require("fs/promises");
const { spawn } = require("child_process");

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
      "",
    )
    .replace(
      new RegExp(
        `^\\s*SELECT\\s+pg_catalog\\.set_config\\(\\s*'(${unsupportedPattern})'\\s*,.*;?\\s*$`,
        "gim",
      ),
      "",
    )
    .replace(
      new RegExp(
        `^\\s*ALTER\\s+(?:SYSTEM|DATABASE|ROLE)\\b.*\\bSET\\s+(${unsupportedPattern})\\b.*;?\\s*$`,
        "gim",
      ),
      "",
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

exports.getBackupStatus = async (req, res) => {
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
  let tempFile = "";
  try {
    const host = process.env.DB_HOST || "localhost";
    const port = Number(process.env.DB_PORT || 5432);
    const user = process.env.DB_USER || "postgres";
    const database = String(req.databaseName || process.env.DB_NAME || "inventory").trim().toLowerCase();
    const password = process.env.DB_PASSWORD || "";
    const pgDumpPath = await resolvePgTool("pg_dump", "PG_DUMP_PATH");
    const mode = String(req.query?.mode || "data").trim().toLowerCase();
    const isFull = mode === "full";
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = isFull
      ? `${database}_full_backup_${timestamp}.sql`
      : `${database}_data_backup_${timestamp}.sql`;
    tempFile = path.join(os.tmpdir(), filename);
    const args = [
      ...buildDbArgs({ host, port, user, database }),
      "-f",
      tempFile,
      "--inserts",
      "--column-inserts",
    ];
    if (!isFull) {
      args.push("--data-only");
    }
    const env = { ...process.env, PGPASSWORD: password };

    await runProcess(pgDumpPath, args, env);
    const sqlContent = await fs.readFile(tempFile, "utf8");
    res.setHeader("Content-Type", "application/sql; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(sqlContent);
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
  } finally {
    if (tempFile) {
      await fs.unlink(tempFile).catch(() => {});
    }
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
    const host = process.env.DB_HOST || "localhost";
    const port = Number(process.env.DB_PORT || 5432);
    const user = process.env.DB_USER || "postgres";
    const database = String(req.databaseName || process.env.DB_NAME || "inventory").trim().toLowerCase();
    const password = process.env.DB_PASSWORD || "";
    const psqlPath = await resolvePgTool("psql", "PSQL_PATH");
    const tempFileName = `restore_${Date.now()}_${fileName.replace(/[^\w.-]/g, "_")}`;
    tempFile = path.join(os.tmpdir(), tempFileName);
    const args = [...buildDbArgs({ host, port, user, database }), "-v", "ON_ERROR_STOP=1", "-f", tempFile];
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
