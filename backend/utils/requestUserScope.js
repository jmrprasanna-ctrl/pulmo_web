const db = require("../config/database");
const User = require("../models/User");

const INVENTORY_DB_NAME = db.normalizeDatabaseName(process.env.DB_NAME || "inventory") || "inventory";
const USER_ROLE_ALIASES = new Set([
  "user",
  "coordinator",
  "cordinator",
  "co-ordinator",
  "co ordinator",
  "co_ordinator",
]);

function normalizeDatabaseName(value) {
  const normalized = db.normalizeDatabaseName(value);
  return normalized || INVENTORY_DB_NAME;
}

function normalizeRoleValue(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (USER_ROLE_ALIASES.has(normalized)) {
    return "user";
  }
  return normalized;
}

function getRequesterId(req) {
  const requesterId = Number(req?.user?.id || req?.user?.userId || 0);
  if (!Number.isFinite(requesterId) || requesterId <= 0) {
    return 0;
  }
  return requesterId;
}

function isDirectoryScopedAuth(req) {
  return String(req?.user?.auth_scope || req?.user?.authScope || "").trim().toLowerCase() === "directory";
}

async function findUserByIdInDatabase(databaseName, userId, options = {}) {
  const normalizedDb = normalizeDatabaseName(databaseName);
  const normalizedUserId = Number(userId || 0);
  if (!normalizedDb || !Number.isFinite(normalizedUserId) || normalizedUserId <= 0) {
    return null;
  }

  return db.withDatabase(normalizedDb, async () => {
    return User.findByPk(normalizedUserId, options);
  });
}

async function findRequesterUser(req, options = {}) {
  const requesterId = getRequesterId(req);
  if (!requesterId) {
    return null;
  }

  if (isDirectoryScopedAuth(req)) {
    const directoryUser = await findUserByIdInDatabase(INVENTORY_DB_NAME, requesterId, options);
    if (directoryUser) {
      return {
        user: directoryUser,
        database_name: INVENTORY_DB_NAME,
        is_directory_user: true,
      };
    }
  }

  const activeDatabaseName = normalizeDatabaseName(
    req?.databaseName || req?.user?.database_name || req?.headers?.["x-database-name"]
  );
  const activeUser = await findUserByIdInDatabase(activeDatabaseName, requesterId, options);
  if (activeUser) {
    return {
      user: activeUser,
      database_name: activeDatabaseName,
      is_directory_user: false,
    };
  }

  return null;
}

function toPlainUser(userLike = {}) {
  return userLike && typeof userLike.toJSON === "function"
    ? userLike.toJSON()
    : { ...(userLike || {}) };
}

function getRentalCustomerScopeFromUser(userLike, requesterRole) {
  const user = toPlainUser(userLike);
  const normalizedRole = normalizeRoleValue(requesterRole || user.role);
  if (normalizedRole !== "user") {
    return null;
  }

  const department = String(user.department || "").trim();
  const customerType = String(user.customer_type || "").trim().toLowerCase();
  const customerId = Number(user.customer_id || 0);
  if (department !== "Customer" || customerType !== "rental") {
    return null;
  }
  if (!Number.isFinite(customerId) || customerId <= 0) {
    return null;
  }

  return {
    customer_id: customerId,
    department,
    customer_type: customerType,
  };
}

async function getRequesterRentalCustomerScope(req) {
  const resolved = await findRequesterUser(req, {
    attributes: ["id", "username", "email", "role", "department", "customer_type", "customer_id"],
  });
  if (!resolved?.user) {
    return null;
  }

  const scope = getRentalCustomerScopeFromUser(resolved.user, req?.user?.role);
  if (!scope) {
    return null;
  }

  return {
    ...scope,
    user: toPlainUser(resolved.user),
    user_database: resolved.database_name,
    is_directory_user: resolved.is_directory_user === true,
  };
}

module.exports = {
  INVENTORY_DB_NAME,
  normalizeDatabaseName,
  normalizeRoleValue,
  getRequesterId,
  isDirectoryScopedAuth,
  findUserByIdInDatabase,
  findRequesterUser,
  getRequesterRentalCustomerScope,
};
