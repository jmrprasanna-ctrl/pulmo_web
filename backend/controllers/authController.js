const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { Client } = require("pg");
const db = require("../config/database");
const User = require("../models/User");
const { Op } = require("sequelize");

const isBcryptHash = (value = "") => /^\$2[aby]\$\d{2}\$/.test(value);
const AUTH_DB_NAME = String(process.env.DB_NAME || "inventory").trim() || "inventory";

function getAuthDbClient() {
  return new Client({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "",
    database: AUTH_DB_NAME,
  });
}

exports.login = async (req, res) => {
  const { email, password } = req.body;

  const client = getAuthDbClient();
  try {
    await client.connect();
    const userRs = await client.query(
      `SELECT id, username, email, role, password, company
       FROM users
       WHERE email = $1 OR username = $1
       LIMIT 1`,
      [String(email || "").trim()]
    );
    const user = userRs.rows[0];
    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    let isMatch = false;

    if (isBcryptHash(user.password)) {
      isMatch = await bcrypt.compare(password, user.password);
    } else {
      // Support legacy plain-text seeded passwords and upgrade on login.
      isMatch = password === user.password;
      if (isMatch) {
        const hashed = await bcrypt.hash(password, 10);
        await client.query("UPDATE users SET password = $1 WHERE id = $2", [hashed, user.id]);
      }
    }

    if (!isMatch) {
      return res.status(400).json({ message: "Invalid password" });
    }

    let databaseName = null;
    let mappedCompanyName = null;
    let mappedCompanyCode = null;
    let mappedCompanyEmail = null;
    let mappedCompanyLogoUrl = null;

    const mappingRs = await client.query(
      `SELECT um.database_name, cp.company_name, cp.company_code, cp.email, cp.logo_path
       FROM user_mappings um
       JOIN company_profiles cp ON cp.id = um.company_profile_id
       WHERE um.user_id = $1
       LIMIT 1`,
      [user.id]
    );
    if (mappingRs.rowCount) {
      const mappedDb = db.normalizeDatabaseName(mappingRs.rows[0]?.database_name || "");
      if (mappedDb) {
        await db.registerDatabase(mappedDb).catch(() => {});
        databaseName = mappedDb;
      }
      mappedCompanyName = String(mappingRs.rows[0]?.company_name || "").trim() || null;
      mappedCompanyCode = String(mappingRs.rows[0]?.company_code || "").trim().toUpperCase() || null;
      mappedCompanyEmail = String(mappingRs.rows[0]?.email || "").trim().toLowerCase() || null;
      const logoPath = String(mappingRs.rows[0]?.logo_path || "").trim();
      if (logoPath) {
        const clean = logoPath.replace(/\\/g, "/").replace(/^\/+/, "");
        mappedCompanyLogoUrl = `/${clean}`;
      }
    }

    if (!databaseName && String(user.role || "").toLowerCase() === "user") {
      const accessRs = await client.query(
        `SELECT database_name
         FROM user_accesses
         WHERE user_id = $1
           AND LOWER(COALESCE(user_database, 'inventory')) = 'inventory'
         ORDER BY "updatedAt" DESC NULLS LAST, "createdAt" DESC NULLS LAST, id DESC
         LIMIT 1`,
        [user.id]
      );
      const normalized = db.normalizeDatabaseName(accessRs.rows[0]?.database_name || "");
      if (normalized) {
        await db.registerDatabase(normalized).catch(() => {});
        databaseName = normalized;
      }
    }

    const token = jwt.sign(
      { id: user.id, role: user.role, database_name: databaseName },
      process.env.JWT_SECRET || "supersecretjwtkey",
      { expiresIn: process.env.JWT_EXPIRES_IN || "8h" }
    );

    const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    const ipAddress = forwarded || req.socket?.remoteAddress || req.ip || null;
    const userAgent = String(req.headers["user-agent"] || "").trim() || null;
    await client.query(
      `INSERT INTO user_login_logs (user_id, username, role, login_time, ip_address, user_agent, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, NOW(), $4, $5, NOW(), NOW())`,
      [user.id, user.username, user.role, ipAddress, userAgent]
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        company: user.company || "",
        database_name: databaseName,
        mapped_company_name: mappedCompanyName,
        mapped_company_code: mappedCompanyCode,
        mapped_company_email: mappedCompanyEmail,
        mapped_company_logo_url: mappedCompanyLogoUrl,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  } finally {
    await client.end().catch(() => {});
  }
};

exports.register = async (req, res) => {
  const { username, email, password, role, company, department, telephone } = req.body;

  try {
    const existing = await User.findOne({ where: { email } });
    if (existing) {
      return res.status(400).json({ message: "Email already in use" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      username,
      email,
      password: hashedPassword,
      role: role || "user",
      company,
      department,
      telephone,
    });

    res.status(201).json({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};
