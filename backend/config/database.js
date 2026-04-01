const { Sequelize } = require("sequelize");
const { AsyncLocalStorage } = require("async_hooks");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const MODEL_PROXY_SYMBOL = Symbol("ModelProxy");
const dbKeys = ["inventory", "demo"];
const asyncLocalStorage = new AsyncLocalStorage();

const MAIN_DB_NAME = "inventory";
const DEMO_DB_NAME = "demo";
const modelsByDb = Object.create(null);
const sequelizeByDb = Object.create(null);
const modelProxyByName = Object.create(null);
const modelDefinitionsByName = Object.create(null);
const associationOperations = [];

function toPositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function toNonNegativeInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
}

function normalizeDatabaseName(name) {
  const normalized = String(name || "").trim().toLowerCase();
  if (!normalized) return "";
  if (!/^[a-z0-9_]+$/.test(normalized)) return "";
  return normalized;
}

function createSequelize(databaseName) {
  const poolMax = toPositiveInt(process.env.DB_POOL_MAX, 6);
  const poolMin = Math.min(toNonNegativeInt(process.env.DB_POOL_MIN, 0), poolMax);
  const poolAcquire = toPositiveInt(process.env.DB_POOL_ACQUIRE_MS, 45000);
  const poolIdle = toPositiveInt(process.env.DB_POOL_IDLE_MS, 10000);
  const poolEvict = toPositiveInt(process.env.DB_POOL_EVICT_MS, 1000);
  const statementTimeout = toPositiveInt(process.env.DB_STATEMENT_TIMEOUT_MS, 45000);
  const idleTxTimeout = toPositiveInt(process.env.DB_IDLE_TX_TIMEOUT_MS, 30000);

  return new Sequelize(
    databaseName,
    process.env.DB_USER || "postgres",
    String(process.env.DB_PASSWORD || ""),
    {
      host: process.env.DB_HOST || "localhost",
      port: Number(process.env.DB_PORT || 5432),
      dialect: "postgres",
      logging: false,
      pool: {
        max: poolMax,
        min: poolMin,
        acquire: poolAcquire,
        idle: poolIdle,
        evict: poolEvict,
      },
      dialectOptions: {
        statement_timeout: statementTimeout,
        idle_in_transaction_session_timeout: idleTxTimeout,
      },
    }
  );
}

function registerBaseDatabase(databaseName) {
  const normalized = normalizeDatabaseName(databaseName);
  if (!normalized || sequelizeByDb[normalized]) return;
  sequelizeByDb[normalized] = createSequelize(normalized);
  modelsByDb[normalized] = Object.create(null);
}

function getRegisteredDatabaseKeys() {
  return [...dbKeys];
}

function resolveKnownDatabase(databaseName) {
  const normalized = normalizeDatabaseName(databaseName);
  if (!normalized) return MAIN_DB_NAME;
  if (!sequelizeByDb[normalized]) return MAIN_DB_NAME;
  return normalized;
}

function getContextDatabase() {
  const store = asyncLocalStorage.getStore();
  const key = resolveKnownDatabase(store?.database);
  return key || MAIN_DB_NAME;
}

function withDatabase(databaseName, fn) {
  const key = resolveKnownDatabase(databaseName) || MAIN_DB_NAME;
  return asyncLocalStorage.run({ database: key }, fn);
}

function resolveProxyModel(modelLike, databaseName) {
  if (!modelLike || !modelLike[MODEL_PROXY_SYMBOL]) return modelLike;
  return modelsByDb[databaseName][modelLike.__modelName];
}

function mapValueForDb(value, databaseName) {
  if (Array.isArray(value)) {
    return value.map((item) => mapValueForDb(item, databaseName));
  }

  if (value && value[MODEL_PROXY_SYMBOL]) {
    return resolveProxyModel(value, databaseName);
  }

  if (value && typeof value === "object") {
    const out = value;

    if (Object.prototype.hasOwnProperty.call(out, "model")) {
      const mappedInclude = Object.prototype.hasOwnProperty.call(out, "include")
        ? mapValueForDb(out.include, databaseName)
        : [];
      return {
        ...out,
        model: mapValueForDb(out.model, databaseName),
        include: Array.isArray(mappedInclude) ? mappedInclude : [],
      };
    }

    if (Object.prototype.hasOwnProperty.call(out, "include")) {
      return {
        ...out,
        include: mapValueForDb(out.include, databaseName),
      };
    }
  }

  return value;
}

function mapArgsForDb(args, databaseName) {
  return args.map((arg) => mapValueForDb(arg, databaseName));
}

function createModelProxy(modelName) {
  const proxyTarget = {
    [MODEL_PROXY_SYMBOL]: true,
    __modelName: modelName,
  };

  return new Proxy(proxyTarget, {
    get(_target, prop) {
      if (prop === MODEL_PROXY_SYMBOL || prop === "__modelName") {
        return proxyTarget[prop];
      }

      if (prop === "withDatabase") {
        return (databaseName) =>
          resolveProxyModel(proxyTarget, resolveKnownDatabase(databaseName) || MAIN_DB_NAME);
      }

      const activeDb = getContextDatabase();
      const activeModel = modelsByDb[activeDb][modelName];
      const value = activeModel[prop];

      if (typeof value !== "function") {
        return value;
      }

      if (prop === "belongsTo" || prop === "hasMany" || prop === "hasOne" || prop === "belongsToMany") {
        return (targetModel, ...args) => {
          const targetModelName = targetModel && targetModel[MODEL_PROXY_SYMBOL] ? targetModel.__modelName : null;
          if (targetModelName) {
            associationOperations.push({
              sourceModelName: modelName,
              relationType: prop,
              targetModelName,
              args,
            });
          }
          for (const dbKey of dbKeys) {
            const source = modelsByDb[dbKey][modelName];
            const target = resolveProxyModel(targetModel, dbKey);
            const mappedArgs = mapArgsForDb(args, dbKey);
            source[prop](target, ...mappedArgs);
          }
          return proxyTarget;
        };
      }

      return (...args) => {
        const dbKey = getContextDatabase();
        const source = modelsByDb[dbKey][modelName];
        const fn = source[prop];
        const mappedArgs = mapArgsForDb(args, dbKey);
        return fn.apply(source, mappedArgs);
      };
    },
  });
}

function applyAssociationForDatabase(operation, databaseName) {
  const source = modelsByDb[databaseName]?.[operation.sourceModelName];
  const target = modelsByDb[databaseName]?.[operation.targetModelName];
  if (!source || !target) return;
  const mappedArgs = mapArgsForDb(Array.isArray(operation.args) ? operation.args : [], databaseName);
  source[operation.relationType](target, ...mappedArgs);
}

async function registerDatabase(databaseName) {
  const normalized = normalizeDatabaseName(databaseName);
  if (!normalized) {
    throw new Error("Invalid database name.");
  }

  if (sequelizeByDb[normalized]) {
    return normalized;
  }

  registerBaseDatabase(normalized);

  for (const [modelName, def] of Object.entries(modelDefinitionsByName)) {
    modelsByDb[normalized][modelName] = sequelizeByDb[normalized].define(
      modelName,
      def.attributes,
      def.options
    );
  }

  for (const operation of associationOperations) {
    applyAssociationForDatabase(operation, normalized);
  }

  if (!dbKeys.includes(normalized)) {
    dbKeys.push(normalized);
  }

  return normalized;
}

registerBaseDatabase(MAIN_DB_NAME);
registerBaseDatabase(DEMO_DB_NAME);

const db = new Proxy(
  {
    normalizeDatabaseName,
    getDatabaseKeys: getRegisteredDatabaseKeys,
    getCurrentDatabase: getContextDatabase,
    runWithDatabase: withDatabase,
    withDatabase,
    registerDatabase,
                                                        
    async switchDatabase(nextNameRaw) {
      return resolveKnownDatabase(nextNameRaw) || MAIN_DB_NAME;
    },
                                                               
    getConnection(databaseName) {
      const dbName = resolveKnownDatabase(databaseName) || MAIN_DB_NAME;
      return sequelizeByDb[dbName];
    },
  },
  {
    get(target, prop) {
      if (Object.prototype.hasOwnProperty.call(target, prop)) {
        return target[prop];
      }

      if (prop === "define") {
        return (modelName, attributes, options) => {
          if (modelProxyByName[modelName]) {
            return modelProxyByName[modelName];
          }

          modelDefinitionsByName[modelName] = { attributes, options };

          for (const dbKey of dbKeys) {
            modelsByDb[dbKey][modelName] = sequelizeByDb[dbKey].define(modelName, attributes, options);
          }

          const proxyModel = createModelProxy(modelName);
          modelProxyByName[modelName] = proxyModel;
          return proxyModel;
        };
      }

      if (prop === "sync") {
        return async (options = {}) => {
          for (const dbKey of dbKeys) {
            await sequelizeByDb[dbKey].sync(options);
          }
        };
      }

      if (prop === "authenticate") {
        return async () => {
          for (const dbKey of dbKeys) {
            await sequelizeByDb[dbKey].authenticate();
          }
        };
      }

      if (prop === "close") {
        return async () => {
          for (const dbKey of dbKeys) {
            await sequelizeByDb[dbKey].close();
          }
        };
      }

      if (prop === "query") {
        return (...args) => {
          const dbKey = getContextDatabase();
          const sequelize = sequelizeByDb[dbKey];
          const mappedArgs = mapArgsForDb(args, dbKey);
          return sequelize.query(...mappedArgs);
        };
      }

      if (prop === "transaction") {
        return (...args) => {
          const dbKey = getContextDatabase();
          const sequelize = sequelizeByDb[dbKey];
          const mappedArgs = mapArgsForDb(args, dbKey);
          return sequelize.transaction(...mappedArgs);
        };
      }

      const dbKey = getContextDatabase();
      const sequelize = sequelizeByDb[dbKey];
      const value = sequelize[prop];
      return typeof value === "function" ? value.bind(sequelize) : value;
    },
  }
);

module.exports = db;
