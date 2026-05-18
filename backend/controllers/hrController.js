const db = require("../config/database");

const ensuredInOutTableDbs = new Set();
const ensuredSallaryTableDbs = new Set();

const SALLARY_BANK_OPTIONS = new Set([
  "Commercial Bank",
  "Peoples Bank",
  "Bank of Ceylon",
  "Sampath Bank",
  "Seylan Bank",
  "Nation Trust Bank",
  "NDB",
  "HNB",
  "NSB",
  "OTHER",
]);

async function ensureInOutLogTable() {
  const dbName = String(db.getCurrentDatabase ? db.getCurrentDatabase() : "").trim().toLowerCase() || "inventory";
  if (ensuredInOutTableDbs.has(dbName)) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS user_inout_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      username VARCHAR(200) NOT NULL,
      role VARCHAR(40),
      check_in_at TIMESTAMP NOT NULL DEFAULT NOW(),
      check_in_lat DOUBLE PRECISION,
      check_in_lng DOUBLE PRECISION,
      check_in_accuracy DOUBLE PRECISION,
      check_in_location_label VARCHAR(120),
      check_out_at TIMESTAMP,
      check_out_lat DOUBLE PRECISION,
      check_out_lng DOUBLE PRECISION,
      check_out_accuracy DOUBLE PRECISION,
      check_out_location_label VARCHAR(120),
      createdAt TIMESTAMP DEFAULT NOW(),
      updatedAt TIMESTAMP DEFAULT NOW()
    );
  `);
  await db.query(`
    ALTER TABLE user_inout_logs
    ADD COLUMN IF NOT EXISTS check_in_location_label VARCHAR(120);
  `);
  await db.query(`
    ALTER TABLE user_inout_logs
    ADD COLUMN IF NOT EXISTS check_out_location_label VARCHAR(120);
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS user_inout_logs_user_date_idx
    ON user_inout_logs(user_id, check_in_at);
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS user_inout_logs_open_idx
    ON user_inout_logs(user_id, check_out_at);
  `);

  ensuredInOutTableDbs.add(dbName);
}

async function ensureSallaryProfileTable() {
  const dbName = String(db.getCurrentDatabase ? db.getCurrentDatabase() : "").trim().toLowerCase() || "inventory";
  if (ensuredSallaryTableDbs.has(dbName)) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      id SERIAL PRIMARY KEY,
      user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      profile_name VARCHAR(200),
      address TEXT,
      mobile VARCHAR(60),
      id_number VARCHAR(120),
      emergency_contact_no VARCHAR(60),
      authoris_officer VARCHAR(200),
      profile_picture_path VARCHAR(500),
      "createdAt" TIMESTAMP DEFAULT NOW(),
      "updatedAt" TIMESTAMP DEFAULT NOW()
    );
  `);
  await db.query(`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS profile_name VARCHAR(200);`);
  await db.query(`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS address TEXT;`);
  await db.query(`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS mobile VARCHAR(60);`);

  await db.query(`
    CREATE TABLE IF NOT EXISTS user_sallary_profiles (
      id SERIAL PRIMARY KEY,
      user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      username VARCHAR(200) NOT NULL,
      role VARCHAR(40),
      profile_name VARCHAR(200),
      department VARCHAR(160),
      email VARCHAR(200),
      mobile VARCHAR(60),
      address TEXT,
      bank_name VARCHAR(120),
      other_bank_name VARCHAR(160),
      bank_account VARCHAR(120),
      basic_sallary NUMERIC(14,2) NOT NULL DEFAULT 0,
      allowances_json TEXT NOT NULL DEFAULT '[]',
      "createdAt" TIMESTAMP DEFAULT NOW(),
      "updatedAt" TIMESTAMP DEFAULT NOW()
    );
  `);
  await db.query(`ALTER TABLE user_sallary_profiles ADD COLUMN IF NOT EXISTS username VARCHAR(200);`);
  await db.query(`ALTER TABLE user_sallary_profiles ADD COLUMN IF NOT EXISTS role VARCHAR(40);`);
  await db.query(`ALTER TABLE user_sallary_profiles ADD COLUMN IF NOT EXISTS profile_name VARCHAR(200);`);
  await db.query(`ALTER TABLE user_sallary_profiles ADD COLUMN IF NOT EXISTS department VARCHAR(160);`);
  await db.query(`ALTER TABLE user_sallary_profiles ADD COLUMN IF NOT EXISTS email VARCHAR(200);`);
  await db.query(`ALTER TABLE user_sallary_profiles ADD COLUMN IF NOT EXISTS mobile VARCHAR(60);`);
  await db.query(`ALTER TABLE user_sallary_profiles ADD COLUMN IF NOT EXISTS address TEXT;`);
  await db.query(`ALTER TABLE user_sallary_profiles ADD COLUMN IF NOT EXISTS bank_name VARCHAR(120);`);
  await db.query(`ALTER TABLE user_sallary_profiles ADD COLUMN IF NOT EXISTS other_bank_name VARCHAR(160);`);
  await db.query(`ALTER TABLE user_sallary_profiles ADD COLUMN IF NOT EXISTS bank_account VARCHAR(120);`);
  await db.query(`ALTER TABLE user_sallary_profiles ADD COLUMN IF NOT EXISTS basic_sallary NUMERIC(14,2) NOT NULL DEFAULT 0;`);
  await db.query(`ALTER TABLE user_sallary_profiles ADD COLUMN IF NOT EXISTS salary_start_date DATE;`);
  await db.query(`ALTER TABLE user_sallary_profiles ADD COLUMN IF NOT EXISTS salary_end_date DATE;`);
  await db.query(`ALTER TABLE user_sallary_profiles ADD COLUMN IF NOT EXISTS working_days NUMERIC(8,2) NOT NULL DEFAULT 0;`);
  await db.query(`ALTER TABLE user_sallary_profiles ADD COLUMN IF NOT EXISTS ot_pay_amount NUMERIC(14,2) NOT NULL DEFAULT 0;`);
  await db.query(`ALTER TABLE user_sallary_profiles ADD COLUMN IF NOT EXISTS allowances_json TEXT NOT NULL DEFAULT '[]';`);
  await db.query(`
    CREATE INDEX IF NOT EXISTS user_sallary_profiles_profile_name_idx
    ON user_sallary_profiles (LOWER(COALESCE(profile_name, '')));
  `);

  ensuredSallaryTableDbs.add(dbName);
}

function parseAllowances(raw) {
  let list = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed;
    } catch (_err) {
      list = [];
    }
  }

  const normalized = [];
  list.forEach((entry, index) => {
    const name = String(entry?.name ?? entry?.label ?? "").trim().slice(0, 120);
    const amountRaw = Number(entry?.amount ?? entry?.value ?? 0);
    const amount = Number.isFinite(amountRaw) ? Number(amountRaw.toFixed(2)) : 0;
    if (!name && amount <= 0) return;
    normalized.push({
      name: name || `Allowance ${index + 1}`,
      amount: Math.max(0, amount),
    });
  });

  return normalized;
}

function parseStoredAllowances(rawJson) {
  try {
    const parsed = JSON.parse(String(rawJson || "[]"));
    return parseAllowances(parsed);
  } catch (_err) {
    return [];
  }
}

function normalizeBasicSallary(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Number(parsed.toFixed(2)));
}

function normalizeBankName(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (SALLARY_BANK_OPTIONS.has(trimmed)) return trimmed;
  return "OTHER";
}

function canViewAllSallaryUsers(role) {
  const normalized = String(role || "").trim().toLowerCase();
  return normalized === "admin" || normalized === "manager";
}

async function getSallaryUserRow(userId) {
  const rs = await db.query(
    `SELECT u.id AS user_id,
            u.username,
            u.role,
            u.department,
            u.email,
            COALESCE(NULLIF(TRIM(up.profile_name), ''), u.username) AS profile_name,
            COALESCE(NULLIF(TRIM(up.mobile), ''), NULLIF(TRIM(u.telephone), ''), '') AS mobile,
            COALESCE(NULLIF(TRIM(up.address), ''), '') AS address,
            sp.bank_name,
            sp.other_bank_name,
            sp.bank_account,
            sp.basic_sallary,
            sp.salary_start_date,
            sp.salary_end_date,
            sp.working_days,
            sp.ot_pay_amount,
            sp.allowances_json
     FROM users u
     LEFT JOIN user_profiles up ON up.user_id = u.id
     LEFT JOIN user_sallary_profiles sp ON sp.user_id = u.id
     WHERE u.id = $1
     LIMIT 1`,
    { bind: [userId] }
  );
  const rows = Array.isArray(rs?.[0]) ? rs[0] : [];
  return rows[0] || null;
}

function toNullableFloat(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toLocationLabel(value, fallback = "") {
  const raw = String(value || "").trim();
  if (raw) return raw.slice(0, 120);
  const normalizedFallback = String(fallback || "").trim();
  return normalizedFallback ? normalizedFallback.slice(0, 120) : null;
}

function normalizeDateOnly(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
  return raw;
}

function parseMonthRange(monthRaw) {
  const raw = String(monthRaw || "").trim();
  const month = /^\d{4}-\d{2}$/.test(raw) ? raw : new Date().toISOString().slice(0, 7);
  const [y, m] = month.split("-").map((x) => Number(x));
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return {
    month,
    startIso: start.toISOString().slice(0, 10),
    endIso: end.toISOString().slice(0, 10),
  };
}

async function getUserName(userId) {
  const rs = await db.query(
    `SELECT username FROM users WHERE id = $1 LIMIT 1`,
    { bind: [userId] }
  );
  const rows = Array.isArray(rs?.[0]) ? rs[0] : [];
  return String(rows[0]?.username || "").trim() || `User ${userId}`;
}

exports.getInOutStatus = async (req, res) => {
  const userId = Number(req.user?.id || req.user?.userId || 0);
  if (!Number.isFinite(userId) || userId <= 0) {
    return res.status(401).json({ message: "Invalid token user." });
  }

  try {
    await ensureInOutLogTable();
    const latestRs = await db.query(
      `SELECT id, user_id, username, role, check_in_at, check_in_lat, check_in_lng, check_in_accuracy,
              check_in_location_label,
              check_out_at, check_out_lat, check_out_lng, check_out_accuracy, check_out_location_label
       FROM user_inout_logs
       WHERE user_id = $1
       ORDER BY check_in_at DESC, id DESC
       LIMIT 1`,
      { bind: [userId] }
    );
    const latestRows = Array.isArray(latestRs?.[0]) ? latestRs[0] : [];
    const latest = latestRows[0] || null;
    const isCheckedIn = !!(latest && !latest.check_out_at);

    const todayRs = await db.query(
      `SELECT id, check_in_at, check_out_at
       FROM user_inout_logs
       WHERE user_id = $1
         AND DATE(check_in_at) = CURRENT_DATE
       ORDER BY check_in_at DESC, id DESC
       LIMIT 1`,
      { bind: [userId] }
    );
    const todayRows = Array.isArray(todayRs?.[0]) ? todayRs[0] : [];
    const todayLog = todayRows[0] || null;
    const hasTodayIn = !!todayLog;
    const hasTodayOut = !!(todayLog && todayLog.check_out_at);

    res.json({
      latest,
      today_log: todayLog,
      is_checked_in: isCheckedIn,
      has_today_in: hasTodayIn,
      has_today_out: hasTodayOut,
      can_check_in_today: !hasTodayIn && !isCheckedIn,
      can_check_out_today: hasTodayIn && !hasTodayOut,
    });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to load INOUT status." });
  }
};

exports.checkIn = async (req, res) => {
  const userId = Number(req.user?.id || req.user?.userId || 0);
  const role = String(req.user?.role || "").trim().toLowerCase() || "user";
  if (!Number.isFinite(userId) || userId <= 0) {
    return res.status(401).json({ message: "Invalid token user." });
  }

  try {
    await ensureInOutLogTable();
    const userName = await getUserName(userId);

    const openRs = await db.query(
      `SELECT id, check_in_at
       FROM user_inout_logs
       WHERE user_id = $1 AND check_out_at IS NULL
       ORDER BY check_in_at DESC, id DESC
       LIMIT 1`,
      { bind: [userId] }
    );
    const openRows = Array.isArray(openRs?.[0]) ? openRs[0] : [];
    if (openRows.length) {
      return res.status(400).json({
        message: `Already checked in at ${new Date(openRows[0].check_in_at).toLocaleString()}. Please Time Out first.`,
      });
    }

    const todayRs = await db.query(
      `SELECT id, check_in_at, check_out_at
       FROM user_inout_logs
       WHERE user_id = $1
         AND DATE(check_in_at) = CURRENT_DATE
       ORDER BY check_in_at DESC, id DESC
       LIMIT 1`,
      { bind: [userId] }
    );
    const todayRows = Array.isArray(todayRs?.[0]) ? todayRs[0] : [];
    if (todayRows.length) {
      if (todayRows[0].check_out_at) {
        return res.status(400).json({
          message: "Today Time In and Time Out already saved.",
        });
      }
      return res.status(400).json({
        message: `Today Time In already saved at ${new Date(todayRows[0].check_in_at).toLocaleString()}.`,
      });
    }

    const lat = toNullableFloat(req.body?.lat);
    const lng = toNullableFloat(req.body?.lng);
    const accuracy = toNullableFloat(req.body?.accuracy);
    const locationLabel = toLocationLabel(
      req.body?.location_label,
      Number.isFinite(lat) && Number.isFinite(lng) ? "GPS" : "Computer"
    );
    const insertRs = await db.query(
      `INSERT INTO user_inout_logs
       (user_id, username, role, check_in_at, check_in_lat, check_in_lng, check_in_accuracy, check_in_location_label)
       VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7)
       RETURNING id, user_id, username, role, check_in_at, check_in_lat, check_in_lng, check_in_accuracy, check_in_location_label,
                 check_out_at, check_out_lat, check_out_lng, check_out_accuracy, check_out_location_label`,
      { bind: [userId, userName, role, lat, lng, accuracy, locationLabel] }
    );
    const rows = Array.isArray(insertRs?.[0]) ? insertRs[0] : [];
    return res.json({
      message: "Check In saved successfully.",
      log: rows[0] || null,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Failed to save Check In." });
  }
};

exports.checkOut = async (req, res) => {
  const userId = Number(req.user?.id || req.user?.userId || 0);
  if (!Number.isFinite(userId) || userId <= 0) {
    return res.status(401).json({ message: "Invalid token user." });
  }

  try {
    await ensureInOutLogTable();
    const todayRs = await db.query(
      `SELECT id, check_in_at, check_out_at
       FROM user_inout_logs
       WHERE user_id = $1
         AND DATE(check_in_at) = CURRENT_DATE
       ORDER BY check_in_at DESC, id DESC
       LIMIT 1`,
      { bind: [userId] }
    );
    const todayRows = Array.isArray(todayRs?.[0]) ? todayRs[0] : [];
    if (!todayRows.length) {
      return res.status(400).json({ message: "No Time In found for today." });
    }
    if (todayRows[0].check_out_at) {
      return res.status(400).json({
        message: `Today Time Out already saved at ${new Date(todayRows[0].check_out_at).toLocaleString()}.`,
      });
    }

    const lat = toNullableFloat(req.body?.lat);
    const lng = toNullableFloat(req.body?.lng);
    const accuracy = toNullableFloat(req.body?.accuracy);
    const locationLabel = toLocationLabel(
      req.body?.location_label,
      Number.isFinite(lat) && Number.isFinite(lng) ? "GPS" : "Computer"
    );
    const updateRs = await db.query(
      `UPDATE user_inout_logs
       SET check_out_at = NOW(),
           check_out_lat = $2,
           check_out_lng = $3,
           check_out_accuracy = $4,
           check_out_location_label = $5
       WHERE id = $1
       RETURNING id, user_id, username, role, check_in_at, check_in_lat, check_in_lng, check_in_accuracy, check_in_location_label,
                 check_out_at, check_out_lat, check_out_lng, check_out_accuracy, check_out_location_label`,
      { bind: [Number(todayRows[0].id || 0), lat, lng, accuracy, locationLabel] }
    );
    const rows = Array.isArray(updateRs?.[0]) ? updateRs[0] : [];
    return res.json({
      message: "Time Out saved successfully.",
      log: rows[0] || null,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Failed to save Time Out." });
  }
};

exports.getMonthlyTimeSheet = async (req, res) => {
  const role = String(req.user?.role || "").trim().toLowerCase();
  const requesterUserId = Number(req.user?.id || req.user?.userId || 0);
  if (!Number.isFinite(requesterUserId) || requesterUserId <= 0) {
    return res.status(401).json({ message: "Invalid token user." });
  }

  try {
    await ensureInOutLogTable();
    const range = parseMonthRange(req.query?.month);

    const requestedUserId = Number(req.query?.user_id || 0);
    const canViewAll = role === "admin" || role === "manager";
    const targetUserId = canViewAll && Number.isFinite(requestedUserId) && requestedUserId > 0
      ? requestedUserId
      : requesterUserId;

    const queryAll = canViewAll && (!Number.isFinite(requestedUserId) || requestedUserId <= 0);
    const bindings = queryAll ? [range.startIso, range.endIso] : [targetUserId, range.startIso, range.endIso];
    const whereClause = queryAll
      ? `DATE(check_in_at) >= $1 AND DATE(check_in_at) < $2`
      : `user_id = $1 AND DATE(check_in_at) >= $2 AND DATE(check_in_at) < $3`;

    const rs = await db.query(
      `SELECT id, user_id, username, role,
              check_in_at, check_in_lat, check_in_lng, check_in_accuracy, check_in_location_label,
              check_out_at, check_out_lat, check_out_lng, check_out_accuracy, check_out_location_label,
              CASE
                WHEN check_out_at IS NULL THEN NULL
                ELSE ROUND(EXTRACT(EPOCH FROM (check_out_at - check_in_at)) / 60.0, 2)
              END AS duration_minutes
       FROM user_inout_logs
       WHERE ${whereClause}
       ORDER BY check_in_at DESC, id DESC`,
      { bind: bindings }
    );
    const rows = Array.isArray(rs?.[0]) ? rs[0] : [];

    let userOptions = [];
    if (canViewAll) {
      const usersRs = await db.query(
        `SELECT DISTINCT user_id, username
         FROM user_inout_logs
         ORDER BY username ASC, user_id ASC`
      );
      const usersRows = Array.isArray(usersRs?.[0]) ? usersRs[0] : [];
      userOptions = usersRows.map((row) => ({
        user_id: Number(row.user_id || 0),
        username: String(row.username || ""),
      }));
    }

    return res.json({
      month: range.month,
      rows,
      user_options: userOptions,
      target_user_id: queryAll ? null : targetUserId,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Failed to load monthly timesheet." });
  }
};

exports.getSallaryUsers = async (req, res) => {
  const role = String(req.user?.role || "").trim().toLowerCase();
  const requesterUserId = Number(req.user?.id || req.user?.userId || 0);
  if (!Number.isFinite(requesterUserId) || requesterUserId <= 0) {
    return res.status(401).json({ message: "Invalid token user." });
  }

  try {
    await ensureSallaryProfileTable();
    const viewAll = canViewAllSallaryUsers(role);
    const rs = await db.query(
      `SELECT u.id AS user_id,
              u.username,
              u.role,
              u.department,
              u.email,
              COALESCE(NULLIF(TRIM(up.profile_name), ''), u.username) AS profile_name,
              COALESCE(NULLIF(TRIM(up.mobile), ''), NULLIF(TRIM(u.telephone), ''), '') AS mobile,
              COALESCE(NULLIF(TRIM(up.address), ''), '') AS address,
              sp.bank_name,
              sp.bank_account,
              sp.basic_sallary,
              sp."updatedAt" AS sallary_updated_at
       FROM users u
       LEFT JOIN user_profiles up ON up.user_id = u.id
       LEFT JOIN user_sallary_profiles sp ON sp.user_id = u.id
       WHERE ($1::boolean = TRUE OR u.id = $2)
       ORDER BY LOWER(COALESCE(NULLIF(TRIM(up.profile_name), ''), u.username)) ASC, u.id ASC`,
      { bind: [viewAll, requesterUserId] }
    );
    const rows = Array.isArray(rs?.[0]) ? rs[0] : [];
    const normalizedRows = rows.map((row) => ({
      user_id: Number(row.user_id || 0),
      username: String(row.username || ""),
      role: String(row.role || ""),
      profile_name: String(row.profile_name || "").trim() || String(row.username || ""),
      department: String(row.department || "").trim(),
      email: String(row.email || "").trim(),
      mobile: String(row.mobile || "").trim(),
      address: String(row.address || "").trim(),
      bank_name: String(row.bank_name || "").trim(),
      bank_account: String(row.bank_account || "").trim(),
      basic_sallary: normalizeBasicSallary(row.basic_sallary),
      sallary_updated_at: row.sallary_updated_at ? new Date(row.sallary_updated_at).toISOString() : "",
    }));

    return res.json({
      rows: normalizedRows,
      can_view_all: viewAll,
      requester_user_id: requesterUserId,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Failed to load sallary users." });
  }
};

exports.getSallaryDetailByUserId = async (req, res) => {
  const role = String(req.user?.role || "").trim().toLowerCase();
  const requesterUserId = Number(req.user?.id || req.user?.userId || 0);
  const userId = Number(req.params?.userId || 0);
  if (!Number.isFinite(requesterUserId) || requesterUserId <= 0) {
    return res.status(401).json({ message: "Invalid token user." });
  }
  if (!Number.isFinite(userId) || userId <= 0) {
    return res.status(400).json({ message: "Invalid user id." });
  }

  try {
    await ensureSallaryProfileTable();
    const viewAll = canViewAllSallaryUsers(role);
    if (!viewAll && userId !== requesterUserId) {
      return res.status(403).json({ message: "Forbidden: You can only view your own sallary profile." });
    }

    const row = await getSallaryUserRow(userId);
    if (!row) {
      return res.status(404).json({ message: "User not found." });
    }

    return res.json({
      user_id: Number(row.user_id || 0),
      username: String(row.username || "").trim(),
      role: String(row.role || "").trim(),
      department: String(row.department || "").trim(),
      email: String(row.email || "").trim(),
      profile_name: String(row.profile_name || "").trim() || String(row.username || "").trim(),
      mobile: String(row.mobile || "").trim(),
      address: String(row.address || "").trim(),
      bank_name: String(row.bank_name || "").trim(),
      other_bank_name: String(row.other_bank_name || "").trim(),
      bank_account: String(row.bank_account || "").trim(),
      basic_sallary: normalizeBasicSallary(row.basic_sallary),
      salary_start_date: row.salary_start_date ? new Date(row.salary_start_date).toISOString().slice(0, 10) : "",
      salary_end_date: row.salary_end_date ? new Date(row.salary_end_date).toISOString().slice(0, 10) : "",
      working_days: normalizeBasicSallary(row.working_days),
      ot_pay_amount: normalizeBasicSallary(row.ot_pay_amount),
      allowances: parseStoredAllowances(row.allowances_json),
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Failed to load sallary detail." });
  }
};

exports.upsertSallaryDetailByUserId = async (req, res) => {
  const role = String(req.user?.role || "").trim().toLowerCase();
  const requesterUserId = Number(req.user?.id || req.user?.userId || 0);
  const userId = Number(req.params?.userId || 0);
  if (!Number.isFinite(requesterUserId) || requesterUserId <= 0) {
    return res.status(401).json({ message: "Invalid token user." });
  }
  if (!Number.isFinite(userId) || userId <= 0) {
    return res.status(400).json({ message: "Invalid user id." });
  }

  try {
    await ensureSallaryProfileTable();
    const viewAll = canViewAllSallaryUsers(role);
    if (!viewAll && userId !== requesterUserId) {
      return res.status(403).json({ message: "Forbidden: You can only update your own sallary profile." });
    }

    const sourceRow = await getSallaryUserRow(userId);
    if (!sourceRow) {
      return res.status(404).json({ message: "User not found." });
    }

    const bankName = normalizeBankName(req.body?.bank_name);
    const otherBankName = bankName === "OTHER"
      ? String(req.body?.other_bank_name || "").trim().slice(0, 160)
      : "";
    const bankAccount = String(req.body?.bank_account || "").trim().slice(0, 120);
    const basicSallary = normalizeBasicSallary(req.body?.basic_sallary ?? req.body?.basic_salary);
    const salaryStartDate = normalizeDateOnly(req.body?.salary_start_date);
    const salaryEndDate = normalizeDateOnly(req.body?.salary_end_date);
    if (salaryStartDate && salaryEndDate && salaryEndDate < salaryStartDate) {
      return res.status(400).json({ message: "End date cannot be before start date." });
    }
    const workingDays = normalizeBasicSallary(req.body?.working_days);
    const otPayAmount = normalizeBasicSallary(req.body?.ot_pay_amount);
    const allowances = parseAllowances(req.body?.allowances);

    await db.query(
      `INSERT INTO user_sallary_profiles
         (user_id, username, role, profile_name, department, email, mobile, address,
          bank_name, other_bank_name, bank_account, basic_sallary, salary_start_date, salary_end_date, working_days, ot_pay_amount, allowances_json, "createdAt", "updatedAt")
       VALUES
         ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW(), NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET
         username = EXCLUDED.username,
         role = EXCLUDED.role,
         profile_name = EXCLUDED.profile_name,
         department = EXCLUDED.department,
         email = EXCLUDED.email,
         mobile = EXCLUDED.mobile,
         address = EXCLUDED.address,
         bank_name = EXCLUDED.bank_name,
         other_bank_name = EXCLUDED.other_bank_name,
         bank_account = EXCLUDED.bank_account,
         basic_sallary = EXCLUDED.basic_sallary,
         salary_start_date = EXCLUDED.salary_start_date,
         salary_end_date = EXCLUDED.salary_end_date,
         working_days = EXCLUDED.working_days,
         ot_pay_amount = EXCLUDED.ot_pay_amount,
         allowances_json = EXCLUDED.allowances_json,
         "updatedAt" = NOW()`,
      {
        bind: [
          userId,
          String(sourceRow.username || "").trim(),
          String(sourceRow.role || "").trim(),
          String(sourceRow.profile_name || "").trim(),
          String(sourceRow.department || "").trim(),
          String(sourceRow.email || "").trim(),
          String(sourceRow.mobile || "").trim(),
          String(sourceRow.address || "").trim(),
          bankName || null,
          otherBankName || null,
          bankAccount || null,
          basicSallary,
          salaryStartDate || null,
          salaryEndDate || null,
          workingDays,
          otPayAmount,
          JSON.stringify(allowances),
        ],
      }
    );

    const row = await getSallaryUserRow(userId);
    return res.json({
      message: "Sallary details saved successfully.",
      detail: {
        user_id: Number(row?.user_id || 0),
        username: String(row?.username || "").trim(),
        role: String(row?.role || "").trim(),
        department: String(row?.department || "").trim(),
        email: String(row?.email || "").trim(),
        profile_name: String(row?.profile_name || "").trim() || String(row?.username || "").trim(),
        mobile: String(row?.mobile || "").trim(),
        address: String(row?.address || "").trim(),
        bank_name: String(row?.bank_name || "").trim(),
        other_bank_name: String(row?.other_bank_name || "").trim(),
        bank_account: String(row?.bank_account || "").trim(),
        basic_sallary: normalizeBasicSallary(row?.basic_sallary),
        salary_start_date: row?.salary_start_date ? new Date(row.salary_start_date).toISOString().slice(0, 10) : "",
        salary_end_date: row?.salary_end_date ? new Date(row.salary_end_date).toISOString().slice(0, 10) : "",
        working_days: normalizeBasicSallary(row?.working_days),
        ot_pay_amount: normalizeBasicSallary(row?.ot_pay_amount),
        allowances: parseStoredAllowances(row?.allowances_json),
      },
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Failed to save sallary detail." });
  }
};

exports.getSallaryWorkSummary = async (req, res) => {
  const role = String(req.user?.role || "").trim().toLowerCase();
  const requesterUserId = Number(req.user?.id || req.user?.userId || 0);
  const userId = Number(req.params?.userId || 0);
  if (!Number.isFinite(requesterUserId) || requesterUserId <= 0) {
    return res.status(401).json({ message: "Invalid token user." });
  }
  if (!Number.isFinite(userId) || userId <= 0) {
    return res.status(400).json({ message: "Invalid user id." });
  }

  const startDate = normalizeDateOnly(req.query?.start_date);
  const endDate = normalizeDateOnly(req.query?.end_date);
  if (!startDate || !endDate) {
    return res.status(400).json({ message: "Start date and end date are required." });
  }
  if (endDate < startDate) {
    return res.status(400).json({ message: "End date cannot be before start date." });
  }

  try {
    await ensureSallaryProfileTable();
    await ensureInOutLogTable();
    const viewAll = canViewAllSallaryUsers(role);
    if (!viewAll && userId !== requesterUserId) {
      return res.status(403).json({ message: "Forbidden: You can only view your own work summary." });
    }

    const rs = await db.query(
      `WITH filtered AS (
         SELECT DATE(check_in_at) AS log_date,
                CASE
                  WHEN check_out_at IS NULL THEN 0
                  ELSE GREATEST(EXTRACT(EPOCH FROM (check_out_at - check_in_at)) / 3600.0, 0)
                END AS duration_hours
         FROM user_inout_logs
         WHERE user_id = $1
           AND DATE(check_in_at) >= $2
           AND DATE(check_in_at) <= $3
       ),
       per_day AS (
         SELECT log_date, SUM(duration_hours) AS day_hours
         FROM filtered
         GROUP BY log_date
       )
       SELECT COALESCE(ROUND(SUM(day_hours)::numeric, 2), 0) AS total_working_hours,
              COALESCE(ROUND(SUM(CASE WHEN day_hours > 8 THEN day_hours - 8 ELSE 0 END)::numeric, 2), 0) AS total_ot_hours,
              COALESCE(ROUND(SUM(LEAST(day_hours, 8) / 8.0)::numeric, 2), 0) AS calculated_working_days,
              COUNT(*)::INTEGER AS present_days
       FROM per_day`,
      { bind: [userId, startDate, endDate] }
    );
    const rows = Array.isArray(rs?.[0]) ? rs[0] : [];
    const row = rows[0] || {};
    return res.json({
      user_id: userId,
      start_date: startDate,
      end_date: endDate,
      present_days: Number(row.present_days || 0),
      calculated_working_days: normalizeBasicSallary(row.calculated_working_days),
      total_working_hours: normalizeBasicSallary(row.total_working_hours),
      total_ot_hours: normalizeBasicSallary(row.total_ot_hours),
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Failed to calculate work summary." });
  }
};
