const jwt = require("jsonwebtoken");
const db = require("../config/database");
const { Client } = require("pg");

const DEFAULT_DB = db.normalizeDatabaseName(process.env.DB_NAME || "inventory") || "inventory";
const ensuredMachineEntryDateDbs = new Set();
const ensuredCatalogSeedDbs = new Set();
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

function getAuthDbClient() {
  return new Client({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || "postgres",
    password: String(process.env.DB_PASSWORD || ""),
    database: DEFAULT_DB,
  });
}

async function resolveUserAssignedDatabase(userId) {
  const client = getAuthDbClient();
  try {
    await client.connect();
    const rs = await client.query(
      `SELECT database_name
       FROM user_accesses
       WHERE user_id = $1
         AND LOWER(COALESCE(user_database, 'inventory')) = 'inventory'
       ORDER BY "updatedAt" DESC NULLS LAST, "createdAt" DESC NULLS LAST, id DESC
       LIMIT 1`,
      [userId]
    );
    const selected = db.normalizeDatabaseName(rs.rows[0]?.database_name || "");
    if (selected) {
      return selected;
    }

    const mappingRs = await client.query(
      `SELECT database_name
       FROM user_mappings
       WHERE user_id = $1
       ORDER BY "updatedAt" DESC NULLS LAST, id DESC
       LIMIT 1`,
      [userId]
    );
    const mapped = db.normalizeDatabaseName(mappingRs.rows[0]?.database_name || "");
    if (mapped) {
      return mapped;
    }
    return DEFAULT_DB;
  } catch (_err) {
    return null;
  } finally {
    await client.end().catch(() => {});
  }
}

async function resolveMappedDatabase(userId) {
  const client = getAuthDbClient();
  try {
    await client.connect();
    const rs = await client.query(
      `SELECT database_name
       FROM user_mappings
       WHERE user_id = $1
       ORDER BY "updatedAt" DESC NULLS LAST, id DESC
       LIMIT 1`,
      [userId]
    );
    const selected = db.normalizeDatabaseName(rs.rows[0]?.database_name || "");
    return selected || null;
  } catch (_err) {
    return null;
  } finally {
    await client.end().catch(() => {});
  }
}

async function ensureMachineEntryDateColumns(databaseName) {
  const targetDb = db.normalizeDatabaseName(databaseName || "");
  if (!targetDb || ensuredMachineEntryDateDbs.has(targetDb)) {
    return;
  }

  await db.withDatabase(targetDb, async () => {
    const tableExistsRs = await db.query(
      `SELECT to_regclass('public.rental_machines') AS rental_table, to_regclass('public.general_machines') AS general_table`
    );
    const row = Array.isArray(tableExistsRs?.[0]) ? tableExistsRs[0][0] : tableExistsRs?.[0];
    const hasRental = Boolean(row?.rental_table);
    const hasGeneral = Boolean(row?.general_table);

    if (hasRental) {
      await db.query(`
        ALTER TABLE rental_machines
        ADD COLUMN IF NOT EXISTS entry_date DATE;
      `);
      await db.query(`
        UPDATE rental_machines
        SET entry_date = COALESCE(entry_date, DATE("createdAt"), CURRENT_DATE)
        WHERE entry_date IS NULL;
      `);
      await db.query(`
        CREATE INDEX IF NOT EXISTS rental_machines_entry_date_idx
        ON rental_machines(entry_date);
      `);
    }

    if (hasGeneral) {
      await db.query(`
        ALTER TABLE general_machines
        ADD COLUMN IF NOT EXISTS entry_date DATE;
      `);
      await db.query(`
        UPDATE general_machines
        SET entry_date = COALESCE(entry_date, DATE("createdAt"), CURRENT_DATE)
        WHERE entry_date IS NULL;
      `);
      await db.query(`
        CREATE INDEX IF NOT EXISTS general_machines_entry_date_idx
        ON general_machines(entry_date);
      `);
    }
  });

  ensuredMachineEntryDateDbs.add(targetDb);
}

async function ensureCatalogSeedData(databaseName) {
  const targetDb = db.normalizeDatabaseName(databaseName || "");
  if (!targetDb || ensuredCatalogSeedDbs.has(targetDb)) {
    return;
  }

  await db.withDatabase(targetDb, async () => {
    const tableExistsRs = await db.query(
      `SELECT to_regclass('public.categories') AS categories_table, to_regclass('public.category_model_options') AS cmo_table`
    );
    const row = Array.isArray(tableExistsRs?.[0]) ? tableExistsRs[0][0] : tableExistsRs?.[0];
    const hasCategories = Boolean(row?.categories_table);
    const hasCmo = Boolean(row?.cmo_table);

    if (hasCategories) {
      for (const name of DEFAULT_CATEGORIES) {
        await db.query(
          `INSERT INTO categories(name)
           SELECT $1
           WHERE NOT EXISTS (
             SELECT 1 FROM categories WHERE LOWER(name) = LOWER($1)
           )`,
          { bind: [name] }
        );
      }
    }

    if (hasCmo) {
      for (const [categoryName, models] of Object.entries(DEFAULT_CATEGORY_MODELS)) {
        for (const modelName of models) {
          await db.query(
            `INSERT INTO category_model_options(category_name, model_name, "createdAt", "updatedAt")
             SELECT $1, $2, NOW(), NOW()
             WHERE NOT EXISTS (
               SELECT 1 FROM category_model_options
               WHERE LOWER(category_name) = LOWER($1) AND LOWER(model_name) = LOWER($2)
             )`,
            { bind: [categoryName, modelName] }
          );
        }
      }
    }
  });

  ensuredCatalogSeedDbs.add(targetDb);
}

const authMiddleware = async (req, res, next) => {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Access denied. No token provided." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "supersecretjwtkey");
    let targetDb = DEFAULT_DB;
    const role = String(decoded?.role || "").toLowerCase();
    const userId = Number(decoded?.id || decoded?.userId || 0);

    const tokenDb = db.normalizeDatabaseName(decoded?.database_name || "");
    if (tokenDb) {
      try {
        await db.registerDatabase(tokenDb);
        targetDb = tokenDb;
      } catch (_err) {
      }
    }

    if (Number.isFinite(userId) && userId > 0) {
      const mappedDb = await resolveMappedDatabase(userId);
      if (mappedDb) {
        try {
          await db.registerDatabase(mappedDb);
          targetDb = mappedDb;
        } catch (_err) {
        }
      }
    }

    if (role === "user") {
      const assignedDb = await resolveUserAssignedDatabase(userId);
      if (!assignedDb) {
        return res.status(503).json({ message: "Unable to resolve user database assignment." });
      }
      try {
        await db.registerDatabase(assignedDb);
      } catch (_err) {
        return res.status(403).json({ message: "Invalid assigned database access." });
      }
      targetDb = assignedDb;
    }

    try {
      await ensureCatalogSeedData(targetDb);
    } catch (_err) {
    }

    try {
      await ensureMachineEntryDateColumns(targetDb);
    } catch (_err) {
    }

    req.user = decoded;
    req.databaseName = targetDb;
    return db.runWithDatabase(targetDb, () => next());
  } catch (err) {
    return res.status(401).json({ message: "Invalid token." });
  }
};

module.exports = authMiddleware;
