const bcrypt = require("bcrypt");
const fs = require("fs");
const path = require("path");
const db = require("../config/database");
const User = require("../models/User");
const UserAccess = require("../models/UserAccess");
const UserLoginLog = require("../models/UserLoginLog");
const { Sequelize } = require("sequelize");

const USER_LINKED_TABLES = [
  "user_accesses",
  "user_login_logs",
  "user_preference_settings",
  "user_invoice_mappings",
  "user_quotation_render_settings",
  "user_mappings",
  "user_profiles",
];

const USER_PROFILE_TABLE = "user_profiles";
const USER_PROFILE_STORAGE_ROOT = path.resolve(__dirname, "../storage/user-profiles");
const PROFILE_IMAGE_ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".bmp", ".gif", ".png", ".tif", ".tiff", ".webp"]);

let userProfileSchemaEnsured = false;
const ALLOWED_USER_DEPARTMENTS = ["Manager", "IT", "Finance", "Admin", "Cordinater", "Technician"];
const ALLOWED_USER_DEPARTMENT_SET = new Set(ALLOWED_USER_DEPARTMENTS);
const USER_DIRECTORY_DB = db.normalizeDatabaseName(process.env.DB_NAME || "inventory") || "inventory";

function normalizeDepartmentToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z]+/g, "");
}

function normalizeUserDepartment(value) {
  const token = normalizeDepartmentToken(value);
  if (!token) return "";

  if (token === "manager") return "Manager";
  if (token === "it" || token === "informationtechnology" || token === "informationtech") return "IT";
  if (token === "finance" || token === "finances" || token === "accounts" || token === "accounting") return "Finance";
  if (token === "admin" || token === "administrator") return "Admin";
  if (token === "cordinater" || token === "coordinator" || token === "coordinater" || token === "cordinator") return "Cordinater";
  if (token === "technician" || token === "tech") return "Technician";

  return "";
}

function runUserDirectoryDb(task) {
  return db.withDatabase(USER_DIRECTORY_DB, task);
}

function normalizeDatabaseName(value) {
  const normalized = db.normalizeDatabaseName(value);
  return normalized || "inventory";
}

function getRequestDatabaseName(req) {
  return normalizeDatabaseName(req?.databaseName || req?.user?.database_name || req?.headers?.["x-database-name"]);
}

function parseBase64Payload(fileDataBase64) {
  const raw = String(fileDataBase64 || "").trim();
  if (!raw) {
    throw new Error("Missing file data.");
  }
  const parts = raw.split(",");
  const payload = parts.length > 1 ? parts.slice(1).join(",") : raw;
  return Buffer.from(payload, "base64");
}

function resolveProfileUserStorageDir(req, userId) {
  const dbName = getRequestDatabaseName(req);
  return path.join(USER_PROFILE_STORAGE_ROOT, dbName, `user_${Number(userId) || 0}`);
}

function resolveProfilePictureMime(filePath) {
  const ext = path.extname(String(filePath || "").trim().toLowerCase());
  if (ext === ".png") return "image/png";
  if (ext === ".gif") return "image/gif";
  if (ext === ".bmp") return "image/bmp";
  if (ext === ".webp") return "image/webp";
  if (ext === ".tif" || ext === ".tiff") return "image/tiff";
  return "image/jpeg";
}

async function ensureUserProfileSchema() {
  if (userProfileSchemaEnsured) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS ${USER_PROFILE_TABLE} (
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
  await db.query(`ALTER TABLE ${USER_PROFILE_TABLE} ADD COLUMN IF NOT EXISTS mobile VARCHAR(60);`);
  await db.query(`ALTER TABLE ${USER_PROFILE_TABLE} ADD COLUMN IF NOT EXISTS id_number VARCHAR(120);`);
  await db.query(`ALTER TABLE ${USER_PROFILE_TABLE} ADD COLUMN IF NOT EXISTS emergency_contact_no VARCHAR(60);`);
  await db.query(`ALTER TABLE ${USER_PROFILE_TABLE} ADD COLUMN IF NOT EXISTS authoris_officer VARCHAR(200);`);
  await db.query(`ALTER TABLE ${USER_PROFILE_TABLE} ADD COLUMN IF NOT EXISTS profile_picture_path VARCHAR(500);`);
  await db.query(`CREATE INDEX IF NOT EXISTS user_profiles_profile_name_idx ON ${USER_PROFILE_TABLE}(LOWER(COALESCE(profile_name, '')));`);
  userProfileSchemaEnsured = true;
}

async function ensureProfileRowForUser(userId) {
  await ensureUserProfileSchema();
  await db.query(
    `INSERT INTO ${USER_PROFILE_TABLE} (user_id, "createdAt", "updatedAt")
     VALUES ($1, NOW(), NOW())
     ON CONFLICT (user_id) DO NOTHING`,
    { bind: [userId] }
  );
}

async function getProfileRowByUserId(userId) {
  await ensureUserProfileSchema();
  const result = await db.query(
    `SELECT id, user_id, profile_name, address, mobile, id_number, emergency_contact_no, authoris_officer, profile_picture_path, "createdAt", "updatedAt"
     FROM ${USER_PROFILE_TABLE}
     WHERE user_id = $1
     LIMIT 1`,
    { bind: [userId] }
  );
  const rows = Array.isArray(result?.[0]) ? result[0] : [];
  return rows[0] || null;
}

function toProfileResponse(user, profileRow) {
  const userPlain = user && typeof user.toJSON === "function" ? user.toJSON() : (user || {});
  const picturePath = String(profileRow?.profile_picture_path || "").trim();
  return {
    user_id: Number(userPlain.id || 0),
    profile_name: String(profileRow?.profile_name || "").trim() || String(userPlain.username || "").trim(),
    email: String(userPlain.email || "").trim(),
    login_user: String(userPlain.username || "").trim(),
    department: String(userPlain.department || "").trim(),
    mobile: String(profileRow?.mobile || "").trim() || String(userPlain.telephone || "").trim(),
    address: String(profileRow?.address || "").trim(),
    id_number: String(profileRow?.id_number || "").trim(),
    emergency_contact_no: String(profileRow?.emergency_contact_no || "").trim(),
    authoris_officer: String(profileRow?.authoris_officer || "").trim(),
    picture_url: picturePath ? `/api/users/profiles/${Number(userPlain.id || 0)}/picture` : "",
    updated_at: profileRow?.updatedAt ? new Date(profileRow.updatedAt).toISOString() : "",
  };
}

function cleanupUserProfileAssets(userId) {
  if (!fs.existsSync(USER_PROFILE_STORAGE_ROOT)) return;
  const userFolderName = `user_${Number(userId) || 0}`;
  for (const dbFolder of fs.readdirSync(USER_PROFILE_STORAGE_ROOT)) {
    const target = path.join(USER_PROFILE_STORAGE_ROOT, dbFolder, userFolderName);
    try {
      if (fs.existsSync(target)) {
        fs.rmSync(target, { recursive: true, force: true });
      }
    } catch (_err) {
    }
  }
}

async function ensureUserSuperColumn() {
  try {
    await db.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS is_super_user BOOLEAN DEFAULT FALSE;
    `);
    await db.query(`
      UPDATE users
      SET is_super_user = FALSE
      WHERE is_super_user IS NULL;
    `);
  } catch (_err) {
  }
}

async function isRequesterSuperAdmin(req) {
  await ensureUserSuperColumn();
  const role = String(req?.user?.role || "").toLowerCase();
  if (role !== "admin") return false;
  const requesterId = Number(req?.user?.id || req?.user?.userId || 0);
  if (!Number.isFinite(requesterId) || requesterId <= 0) return false;
  const me = await User.findByPk(requesterId, { attributes: ["id", "role", "is_super_user"] });
  return Boolean(me && String(me.role || "").toLowerCase() === "admin" && me.is_super_user);
}

function getRequesterId(req) {
  const requesterId = Number(req?.user?.id || req?.user?.userId || 0);
  if (!Number.isFinite(requesterId) || requesterId <= 0) return 0;
  return requesterId;
}

async function canRequesterAccessProfileUser(req, targetUserId) {
  const requesterId = getRequesterId(req);
  if (!requesterId || !Number.isFinite(targetUserId) || targetUserId <= 0) return false;
  const requesterIsSuper = await isRequesterSuperAdmin(req);
  if (requesterIsSuper) return true;
  return requesterId === Number(targetUserId);
}

function isTargetProtectedSuperAdmin(targetUser, requesterId, requesterIsSuper) {
  const isTargetAdmin = String(targetUser?.role || "").toLowerCase() === "admin";
  const isTargetSuper = Boolean(targetUser?.is_super_user);
  return isTargetAdmin && isTargetSuper && Number(targetUser?.id || 0) !== Number(requesterId || 0) && !requesterIsSuper;
}

async function deleteFromUserLinkedTables(userId, transaction) {
  for (const tableName of USER_LINKED_TABLES) {
    try {
      await db.query(`DELETE FROM ${tableName} WHERE user_id = $1`, {
        bind: [userId],
        transaction,
      });
    } catch (err) {
      const code = String(err?.original?.code || err?.parent?.code || "");
      // Ignore "relation does not exist" to support partially provisioned DBs.
      if (code === "42P01") {
        continue;
      }
      throw err;
    }
  }
}

exports.getUsers = async (req, res) => {
  return runUserDirectoryDb(async () => {
    try {
      await ensureUserSuperColumn();
      const users = await User.findAll({
        attributes: ["id", "username", "company", "department", "telephone", "email", "role", "is_super_user", "createdAt"],
        order: [["id", "DESC"]],
      });
      const requesterId = Number(req?.user?.id || req?.user?.userId || 0);
      const requesterIsSuper = await isRequesterSuperAdmin(req);
      const filtered = (Array.isArray(users) ? users : []).filter((u) => {
        if (!isTargetProtectedSuperAdmin(u, requesterId, requesterIsSuper)) return true;
        return false;
      });
      res.json(filtered);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Server error" });
    }
  });
};

exports.getUserById = async (req, res) => {
  const { id } = req.params;
  return runUserDirectoryDb(async () => {
    try {
      await ensureUserSuperColumn();
      const user = await User.findByPk(id, {
        attributes: ["id", "username", "company", "department", "telephone", "email", "role", "is_super_user"],
      });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const requesterId = Number(req?.user?.id || req?.user?.userId || 0);
      const requesterIsSuper = await isRequesterSuperAdmin(req);
      if (isTargetProtectedSuperAdmin(user, requesterId, requesterIsSuper)) {
        return res.status(403).json({ message: "Forbidden: Super admin user is protected." });
      }
      res.json(user);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Server error" });
    }
  });
};

exports.addUser = async (req, res) => {
  const username = String(req.body?.username || "").trim();
  const company = String(req.body?.company || "").trim();
  const department = normalizeUserDepartment(req.body?.department);
  const telephone = String(req.body?.telephone || "").trim();
  const email = String(req.body?.email || "").trim();
  const password = String(req.body?.password || "");
  const role = String(req.body?.role || "").trim().toLowerCase();

  return runUserDirectoryDb(async () => {
    try {
      if (!username || !company || !telephone || !email || !password || !role) {
        return res.status(400).json({ message: "Missing required fields." });
      }

      if (!ALLOWED_USER_DEPARTMENT_SET.has(department)) {
        return res.status(400).json({
          message: `Department must be one of: ${ALLOWED_USER_DEPARTMENTS.join(", ")}`,
        });
      }

      const existing = await User.findOne({ where: { email } });
      if (existing) {
        return res.status(400).json({ message: "Email already in use" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await User.create({
        username,
        company,
        department,
        telephone,
        email,
        password: hashedPassword,
        password_plain: String(password || "").trim(),
        role: role || "user",
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
  });
};

exports.updateUser = async (req, res) => {
  const { id } = req.params;
  const username = typeof req.body?.username === "undefined" ? undefined : String(req.body.username || "").trim();
  const company = typeof req.body?.company === "undefined" ? undefined : String(req.body.company || "").trim();
  const departmentRaw = typeof req.body?.department === "undefined" ? undefined : req.body.department;
  const department = typeof departmentRaw === "undefined" ? undefined : normalizeUserDepartment(departmentRaw);
  const telephone = typeof req.body?.telephone === "undefined" ? undefined : String(req.body.telephone || "").trim();
  const email = typeof req.body?.email === "undefined" ? undefined : String(req.body.email || "").trim();
  const password = typeof req.body?.password === "undefined" ? "" : String(req.body.password || "");
  const role = typeof req.body?.role === "undefined" ? undefined : String(req.body.role || "").trim().toLowerCase();

  return runUserDirectoryDb(async () => {
    try {
      await ensureUserSuperColumn();
      const user = await User.findByPk(id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const requesterId = Number(req?.user?.id || req?.user?.userId || 0);
      const requesterIsSuper = await isRequesterSuperAdmin(req);
      if (isTargetProtectedSuperAdmin(user, requesterId, requesterIsSuper)) {
        return res.status(403).json({ message: "Forbidden: Super admin user is protected." });
      }

      if (email && email !== user.email) {
        const existing = await User.findOne({ where: { email } });
        if (existing && existing.id !== user.id) {
          return res.status(400).json({ message: "Email already in use" });
        }
      }

      if (typeof department !== "undefined" && !ALLOWED_USER_DEPARTMENT_SET.has(department)) {
        return res.status(400).json({
          message: `Department must be one of: ${ALLOWED_USER_DEPARTMENTS.join(", ")}`,
        });
      }

      user.username = username ?? user.username;
      user.company = company ?? user.company;
      user.department = department ?? user.department;
      user.telephone = telephone ?? user.telephone;
      user.email = email ?? user.email;
      user.role = role ?? user.role;

      if (password) {
        user.password = await bcrypt.hash(password, 10);
        user.password_plain = String(password || "").trim();
      }

      await user.save();

      const persisted = await User.findByPk(user.id, {
        attributes: ["id", "username", "company", "department", "telephone", "email", "role"],
      });
      if (!persisted) {
        return res.status(500).json({ message: "User was updated but could not be reloaded." });
      }

      res.json({
        id: persisted.id,
        username: persisted.username,
        company: persisted.company,
        department: persisted.department,
        telephone: persisted.telephone,
        email: persisted.email,
        role: persisted.role,
        database_name: USER_DIRECTORY_DB,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Server error" });
    }
  });
};

exports.getUserProfiles = async (req, res) => {
  try {
    await ensureUserSuperColumn();
    await ensureUserProfileSchema();

    const requesterId = getRequesterId(req);
    if (!requesterId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const requesterIsSuper = await isRequesterSuperAdmin(req);

    let filteredUsers = [];
    if (requesterIsSuper) {
      const users = await User.findAll({
        attributes: ["id", "username", "department", "telephone", "email", "role", "is_super_user"],
        order: [["id", "DESC"]],
      });
      filteredUsers = Array.isArray(users)
        ? users.filter((u) => !isTargetProtectedSuperAdmin(u, requesterId, requesterIsSuper))
        : [];
    } else {
      const me = await User.findByPk(requesterId, {
        attributes: ["id", "username", "department", "telephone", "email", "role", "is_super_user"],
      });
      filteredUsers = me ? [me] : [];
    }

    const result = [];
    for (const user of filteredUsers) {
      const profileRow = await getProfileRowByUserId(Number(user.id || 0));
      result.push(toProfileResponse(user, profileRow));
    }
    result.sort((a, b) => String(a.profile_name || "").localeCompare(String(b.profile_name || ""), undefined, { sensitivity: "base" }));
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err?.message || "Failed to load user profiles." });
  }
};

exports.getUserProfileByUserId = async (req, res) => {
  const userId = Number(req.params.userId || 0);
  if (!Number.isFinite(userId) || userId <= 0) {
    return res.status(400).json({ message: "Invalid user id" });
  }

  try {
    await ensureUserSuperColumn();
    const canAccessTarget = await canRequesterAccessProfileUser(req, userId);
    if (!canAccessTarget) {
      return res.status(403).json({ message: "Forbidden: You can only access your own profile." });
    }

    const user = await User.findByPk(userId, {
      attributes: ["id", "username", "department", "telephone", "email", "role", "is_super_user"],
    });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const requesterId = Number(req?.user?.id || req?.user?.userId || 0);
    const requesterIsSuper = await isRequesterSuperAdmin(req);
    if (isTargetProtectedSuperAdmin(user, requesterId, requesterIsSuper)) {
      return res.status(403).json({ message: "Forbidden: Super admin user is protected." });
    }

    await ensureProfileRowForUser(userId);
    const profileRow = await getProfileRowByUserId(userId);
    res.json(toProfileResponse(user, profileRow));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err?.message || "Failed to load profile." });
  }
};

exports.updateUserProfile = async (req, res) => {
  const userId = Number(req.params.userId || 0);
  if (!Number.isFinite(userId) || userId <= 0) {
    return res.status(400).json({ message: "Invalid user id" });
  }

  try {
    await ensureUserSuperColumn();
    const canAccessTarget = await canRequesterAccessProfileUser(req, userId);
    if (!canAccessTarget) {
      return res.status(403).json({ message: "Forbidden: You can only update your own profile." });
    }

    const user = await User.findByPk(userId, {
      attributes: ["id", "username", "department", "telephone", "email", "role", "is_super_user"],
    });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const requesterId = Number(req?.user?.id || req?.user?.userId || 0);
    const requesterIsSuper = await isRequesterSuperAdmin(req);
    if (isTargetProtectedSuperAdmin(user, requesterId, requesterIsSuper)) {
      return res.status(403).json({ message: "Forbidden: Super admin user is protected." });
    }

    await ensureProfileRowForUser(userId);

    const profileName = String(req.body?.profile_name || "").trim().slice(0, 200);
    const address = String(req.body?.address || "").trim().slice(0, 1000);
    const mobile = String(req.body?.mobile || "").trim().slice(0, 60);
    const idNumber = String(req.body?.id_number || "").trim().slice(0, 120);
    const emergencyContactNo = String(req.body?.emergency_contact_no || "").trim().slice(0, 60);
    const authorisOfficer = String(req.body?.authoris_officer || "").trim().slice(0, 200);

    await db.query(
      `UPDATE ${USER_PROFILE_TABLE}
       SET profile_name = $1,
           address = $2,
           mobile = $3,
           id_number = $4,
           emergency_contact_no = $5,
           authoris_officer = $6,
           "updatedAt" = NOW()
       WHERE user_id = $7`,
      {
        bind: [
          profileName || null,
          address || null,
          mobile || null,
          idNumber || null,
          emergencyContactNo || null,
          authorisOfficer || null,
          userId,
        ],
      }
    );

    const profileRow = await getProfileRowByUserId(userId);
    res.json({
      message: "Profile saved successfully.",
      profile: toProfileResponse(user, profileRow),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err?.message || "Failed to save profile." });
  }
};

exports.uploadUserProfilePicture = async (req, res) => {
  const userId = Number(req.params.userId || 0);
  if (!Number.isFinite(userId) || userId <= 0) {
    return res.status(400).json({ message: "Invalid user id" });
  }

  try {
    await ensureUserSuperColumn();
    const canAccessTarget = await canRequesterAccessProfileUser(req, userId);
    if (!canAccessTarget) {
      return res.status(403).json({ message: "Forbidden: You can only update your own profile picture." });
    }

    const user = await User.findByPk(userId, {
      attributes: ["id", "username", "department", "telephone", "email", "role", "is_super_user"],
    });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const requesterId = Number(req?.user?.id || req?.user?.userId || 0);
    const requesterIsSuper = await isRequesterSuperAdmin(req);
    if (isTargetProtectedSuperAdmin(user, requesterId, requesterIsSuper)) {
      return res.status(403).json({ message: "Forbidden: Super admin user is protected." });
    }

    const fileName = String(req.body?.fileName || "").trim();
    const ext = path.extname(fileName).toLowerCase();
    if (!PROFILE_IMAGE_ALLOWED_EXTENSIONS.has(ext)) {
      return res.status(400).json({ message: "Invalid image format. Allowed: .jpg, .jpeg, .bmp, .gif, .png, .tif, .tiff, .webp" });
    }

    const fileBuffer = parseBase64Payload(req.body?.fileDataBase64);
    if (!fileBuffer.length) {
      return res.status(400).json({ message: "Uploaded image is empty." });
    }

    const targetDir = resolveProfileUserStorageDir(req, userId);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const targetPath = path.join(targetDir, `profile-picture${ext}`);
    fs.writeFileSync(targetPath, fileBuffer);

    await ensureProfileRowForUser(userId);
    await db.query(
      `UPDATE ${USER_PROFILE_TABLE}
       SET profile_picture_path = $1,
           "updatedAt" = NOW()
       WHERE user_id = $2`,
      {
        bind: [targetPath, userId],
      }
    );

    res.json({
      message: "Profile picture uploaded successfully.",
      picture_url: `/api/users/profiles/${userId}/picture`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err?.message || "Failed to upload profile picture." });
  }
};

exports.getUserProfilePicture = async (req, res) => {
  const userId = Number(req.params.userId || 0);
  if (!Number.isFinite(userId) || userId <= 0) {
    return res.status(400).json({ message: "Invalid user id" });
  }

  try {
    const canAccessTarget = await canRequesterAccessProfileUser(req, userId);
    if (!canAccessTarget) {
      return res.status(403).json({ message: "Forbidden: You can only view your own profile picture." });
    }

    const user = await User.findByPk(userId, { attributes: ["id"] });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    const profileRow = await getProfileRowByUserId(userId);
    const picturePath = String(profileRow?.profile_picture_path || "").trim();
    if (!picturePath || !fs.existsSync(picturePath)) {
      return res.status(404).json({ message: "Profile picture not found." });
    }

    res.setHeader("Content-Type", resolveProfilePictureMime(picturePath));
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.resolve(picturePath));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err?.message || "Failed to load profile picture." });
  }
};

exports.deleteUser = async (req, res) => {
  const { id } = req.params;
  const userId = Number(id);

  if (!Number.isFinite(userId) || userId <= 0) {
    return res.status(400).json({ message: "Invalid user id" });
  }

  return runUserDirectoryDb(async () => {
    try {
      await ensureUserSuperColumn();
      const user = await User.findByPk(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const requesterId = Number(req?.user?.id || req?.user?.userId || 0);
      const requesterIsSuper = await isRequesterSuperAdmin(req);
      if (isTargetProtectedSuperAdmin(user, requesterId, requesterIsSuper)) {
        return res.status(403).json({ message: "Forbidden: Super admin user is protected." });
      }

      await deleteFromUserLinkedTables(userId, null);
      // Keep model-level cleanup as a fallback for environments where tables exist
      // and are managed via Sequelize model metadata.
      await UserLoginLog.destroy({ where: { user_id: userId } });
      await UserAccess.destroy({ where: { user_id: userId } });
      await User.destroy({ where: { id: userId } });
      cleanupUserProfileAssets(userId);

      res.json({ message: "User deleted successfully" });
    } catch (err) {
      if (err instanceof Sequelize.ForeignKeyConstraintError) {
        const detail = String(err?.original?.detail || "").trim();
        return res.status(409).json({
          message: detail
            ? `Cannot delete user because linked records still exist: ${detail}`
            : "Cannot delete user because linked records still exist.",
        });
      }
      console.error(err);
      res.status(500).json({ message: err?.message || "Server error" });
    }
  });
};
