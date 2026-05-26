const jwt = require("jsonwebtoken");
const db = require("../config/database");

const DEFAULT_DB = db.normalizeDatabaseName(process.env.DB_NAME || "inventory") || "inventory";
const USER_DB_CACHE_TTL_MS = Math.max(1000, Number(process.env.AUTH_USER_DB_CACHE_TTL_MS || 30000));
const ensuredMachineEntryDateDbs = new Set();
const ensuredCatalogSeedDbs = new Set();
const ensuredRegisteredDbs = new Set(
  (typeof db.getDatabaseKeys === "function" ? db.getDatabaseKeys() : [])
    .map((name) => db.normalizeDatabaseName(name))
    .filter(Boolean)
);
const userDatabaseCache = new Map();
const registerDbInFlight = new Map();
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

function getCachedUserDatabaseInfo(userId) {
  const cached = userDatabaseCache.get(userId);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    userDatabaseCache.delete(userId);
    return null;
  }
  return cached.payload;
}

function setCachedUserDatabaseInfo(userId, payload) {
  if (userDatabaseCache.size > 5000) {
    const now = Date.now();
    for (const [key, value] of userDatabaseCache.entries()) {
      if (!value || now > value.expiresAt) {
        userDatabaseCache.delete(key);
      }
    }
    if (userDatabaseCache.size > 5000) {
      const firstKey = userDatabaseCache.keys().next().value;
      if (firstKey !== undefined) {
        userDatabaseCache.delete(firstKey);
      }
    }
  }
  userDatabaseCache.set(userId, {
    payload,
    expiresAt: Date.now() + USER_DB_CACHE_TTL_MS,
  });
}

async function resolveUserDatabaseInfoUncached(userId) {
  try {
    return await db.withDatabase(DEFAULT_DB, async () => {
      const [rows] = await db.query(
        `SELECT
           (SELECT database_name
            FROM user_mappings
            WHERE user_id = $1
            ORDER BY "updatedAt" DESC NULLS LAST, id DESC
            LIMIT 1) AS mapped_database_name,
           (SELECT database_name
            FROM user_accesses
            WHERE user_id = $1
              AND LOWER(COALESCE(user_database, 'inventory')) = 'inventory'
            ORDER BY "updatedAt" DESC NULLS LAST, "createdAt" DESC NULLS LAST, id DESC
            LIMIT 1) AS assigned_database_name`,
        { bind: [userId] }
      );

      const row = Array.isArray(rows) ? rows[0] : null;
      const mappedDb = db.normalizeDatabaseName(row?.mapped_database_name || "");
      const assignedDb = db.normalizeDatabaseName(row?.assigned_database_name || "") || mappedDb || DEFAULT_DB;
      return {
        mappedDb: mappedDb || null,
        assignedDb: assignedDb || DEFAULT_DB,
      };
    });
  } catch (_err) {
    return {
      mappedDb: null,
      assignedDb: null,
    };
  }
}

async function resolveUserDatabaseInfo(userId) {
  if (!Number.isFinite(userId) || userId <= 0) {
    return { mappedDb: null, assignedDb: null };
  }

  const cached = getCachedUserDatabaseInfo(userId);
  if (cached) {
    return cached;
  }

  const resolved = await resolveUserDatabaseInfoUncached(userId);
  setCachedUserDatabaseInfo(userId, resolved);
  return resolved;
}

async function ensureRegisteredDatabase(databaseName) {
  const normalized = db.normalizeDatabaseName(databaseName || "");
  if (!normalized) {
    throw new Error("Invalid database name.");
  }

  if (ensuredRegisteredDbs.has(normalized)) {
    return normalized;
  }

  const existingInFlight = registerDbInFlight.get(normalized);
  if (existingInFlight) {
    await existingInFlight;
    return normalized;
  }

  const pending = db
    .registerDatabase(normalized)
    .then(() => {
      ensuredRegisteredDbs.add(normalized);
      return normalized;
    })
    .finally(() => {
      registerDbInFlight.delete(normalized);
    });

  registerDbInFlight.set(normalized, pending);
  await pending;
  return normalized;
}

async function warmupDatabaseCatalog(targetDb) {
  try {
    await ensureCatalogSeedData(targetDb);
  } catch (_err) {
  }
  try {
    await ensureMachineEntryDateColumns(targetDb);
  } catch (_err) {
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
        await ensureRegisteredDatabase(tokenDb);
        targetDb = tokenDb;
      } catch (_err) {
      }
    }

    if (Number.isFinite(userId) && userId > 0) {
      const resolvedDbInfo = await resolveUserDatabaseInfo(userId);

      if (role === "user") {
        const assignedDb = resolvedDbInfo.assignedDb || resolvedDbInfo.mappedDb || tokenDb || DEFAULT_DB;
        if (!assignedDb) {
          return res.status(503).json({ message: "Unable to resolve user database assignment." });
        }
        try {
          await ensureRegisteredDatabase(assignedDb);
          targetDb = assignedDb;
        } catch (_err) {
          return res.status(403).json({ message: "Invalid assigned database access." });
        }
      } else if (resolvedDbInfo.mappedDb) {
        try {
          await ensureRegisteredDatabase(resolvedDbInfo.mappedDb);
          targetDb = resolvedDbInfo.mappedDb;
        } catch (_err) {
        }
      }
    }

    await warmupDatabaseCatalog(targetDb);

    req.user = decoded;
    req.databaseName = targetDb;
    return db.runWithDatabase(targetDb, () => next());
  } catch (err) {
    return res.status(401).json({ message: "Invalid token." });
  }
};

module.exports = authMiddleware;
