const db = require("../config/database");

const ensuredInOutTableDbs = new Set();

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
    const rs = await db.query(
      `SELECT id, user_id, username, role, check_in_at, check_in_lat, check_in_lng, check_in_accuracy,
              check_in_location_label,
              check_out_at, check_out_lat, check_out_lng, check_out_accuracy, check_out_location_label
       FROM user_inout_logs
       WHERE user_id = $1
       ORDER BY check_in_at DESC, id DESC
       LIMIT 1`,
      { bind: [userId] }
    );
    const rows = Array.isArray(rs?.[0]) ? rs[0] : [];
    const latest = rows[0] || null;
    const isCheckedIn = !!(latest && !latest.check_out_at);
    res.json({ latest, is_checked_in: isCheckedIn });
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

    const lat = toNullableFloat(req.body?.lat);
    const lng = toNullableFloat(req.body?.lng);
    const accuracy = toNullableFloat(req.body?.accuracy);
    const locationLabel = toLocationLabel(
      req.body?.location_label,
      Number.isFinite(lat) && Number.isFinite(lng) ? "GPS" : "Computer"
    );
    const insertRs = await db.query(
      `INSERT INTO user_inout_logs
       (user_id, username, role, check_in_at, check_in_lat, check_in_lng, check_in_accuracy, check_in_location_label, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7, NOW(), NOW())
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
    const openRs = await db.query(
      `SELECT id
       FROM user_inout_logs
       WHERE user_id = $1 AND check_out_at IS NULL
       ORDER BY check_in_at DESC, id DESC
       LIMIT 1`,
      { bind: [userId] }
    );
    const openRows = Array.isArray(openRs?.[0]) ? openRs[0] : [];
    if (!openRows.length) {
      return res.status(400).json({ message: "No open Check In found. Please Check In first." });
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
           check_out_location_label = $5,
           "updatedAt" = NOW()
       WHERE id = $1
       RETURNING id, user_id, username, role, check_in_at, check_in_lat, check_in_lng, check_in_accuracy, check_in_location_label,
                 check_out_at, check_out_lat, check_out_lng, check_out_accuracy, check_out_location_label`,
      { bind: [Number(openRows[0].id || 0), lat, lng, accuracy, locationLabel] }
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
