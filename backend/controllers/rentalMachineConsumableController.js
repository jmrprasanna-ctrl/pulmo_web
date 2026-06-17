const RentalMachineConsumable = require("../models/RentalMachineConsumable");
const RentalMachine = require("../models/RentalMachine");
const Product = require("../models/Product");
const Customer = require("../models/Customer");
const db = require("../config/database");
const { getRequesterRentalCustomerScope } = require("../utils/requestUserScope");
const INVENTORY_DB_NAME = "inventory";
const ADD_RENTAL_CONSUMABLE_PATH = "/products/add-rental-consumable.html";
const EDIT_ADDED_CONSUMABLE_PATH = "/products/edit-added-consumable.html";

function upper(value) {
  return String(value || "").trim().toUpperCase();
}

function parseDateOnly(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
  const dt = new Date(`${raw}T00:00:00`);
  return Number.isNaN(dt.getTime()) ? "" : raw;
}

function getTodayLocalIso() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function normalizeAccessRole(role) {
  const raw = String(role || "").trim().toLowerCase();
  if (raw === "admin" || raw === "manager") return raw;
  return "user";
}

function normalizeUserDatabaseName(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return INVENTORY_DB_NAME;
  if (!/^[a-z0-9_]+$/.test(normalized)) return INVENTORY_DB_NAME;
  return normalized;
}

function toAccessActionKey(path, action) {
  return `${String(path || "").trim().toLowerCase()}::${String(action || "").trim().toLowerCase()}`;
}

function parseAllowedPagesFromAccessRow(row) {
  try {
    const parsed = JSON.parse(String(row?.allowed_pages_json || "[]"));
    if (!Array.isArray(parsed)) return [];
    return Array.from(
      new Set(
        parsed
          .map((entry) => String(entry || "").trim().toLowerCase())
          .filter(Boolean)
      )
    );
  } catch (_err) {
    return [];
  }
}

function parseAllowedActionsFromAccessRow(row) {
  try {
    const parsed = JSON.parse(String(row?.allowed_actions_json || "[]"));
    if (!Array.isArray(parsed)) return [];
    return Array.from(
      new Set(
        parsed
          .map((entry) => String(entry || "").trim().toLowerCase())
          .filter((entry) => entry.includes("::"))
      )
    );
  } catch (_err) {
    return [];
  }
}

async function findAccessRowFromInventory(userId, userDatabase = INVENTORY_DB_NAME) {
  const normalizedDb = normalizeUserDatabaseName(userDatabase);
  return db.withDatabase(INVENTORY_DB_NAME, async () => {
    try {
      const rs = await db.query(
        `SELECT id, allowed_pages_json, allowed_actions_json, user_database, "updatedAt", "createdAt"
         FROM user_accesses
         WHERE user_id = $1
           AND LOWER(COALESCE(user_database, $2)) = $2
         ORDER BY "updatedAt" DESC NULLS LAST, "createdAt" DESC NULLS LAST, id DESC
         LIMIT 1`,
        { bind: [userId, normalizedDb] }
      );
      const rows = Array.isArray(rs?.[0]) ? rs[0] : [];
      return rows[0] || null;
    } catch (_err) {
      return null;
    }
  });
}

async function canAccessConsumablePage(req, pagePath, action = "view") {
  const requesterRole = normalizeAccessRole(req.user?.role);
  const requesterUserId = Number(req.user?.id || req.user?.userId || 0);
  if (!Number.isFinite(requesterUserId) || requesterUserId <= 0) return false;

  const userDatabase = normalizeUserDatabaseName(
    req.databaseName || req.user?.user_database || req.user?.database_name || INVENTORY_DB_NAME
  );
  if (requesterRole === "user" && userDatabase === "demo") {
    return true;
  }

  let accessRow = await findAccessRowFromInventory(requesterUserId, userDatabase);
  if (!accessRow && userDatabase !== INVENTORY_DB_NAME) {
    accessRow = await findAccessRowFromInventory(requesterUserId, INVENTORY_DB_NAME);
  }

  if (!accessRow) {
    return requesterRole === "admin" || requesterRole === "manager";
  }

  const requestedAction = String(action || "view").trim().toLowerCase() || "view";
  const allowedActions = parseAllowedActionsFromAccessRow(accessRow);
  if (allowedActions.includes(toAccessActionKey(pagePath, requestedAction))) {
    return true;
  }

  if (requestedAction === "view") {
    const allowedPages = parseAllowedPagesFromAccessRow(accessRow);
    return allowedPages.includes(String(pagePath || "").trim().toLowerCase());
  }

  return false;
}

async function loadConsumableRows(where) {
  return RentalMachineConsumable.findAll({
    where,
    include: [{ model: RentalMachine }, { model: Customer }, { model: Product }],
    order: [["entry_date", "DESC"], ["createdAt", "DESC"], ["id", "DESC"]],
  });
}

exports.getConsumables = async (req, res) => {
  try {
    const canViewList = await canAccessConsumablePage(req, ADD_RENTAL_CONSUMABLE_PATH, "view");
    if (!canViewList) {
      return res.status(403).json({ message: "Forbidden: Missing Rental Consumables view permission." });
    }

    const where = {};
    const machineId = Number(req.query.rental_machine_id);
    const customerId = Number(req.query.customer_id);
    const requesterScope = await getRequesterRentalCustomerScope(req);
    if (Number.isFinite(machineId) && machineId > 0) {
      where.rental_machine_id = machineId;
    }
    if (requesterScope?.customer_id) {
      where.customer_id = requesterScope.customer_id;
    } else if (Number.isFinite(customerId) && customerId > 0) {
      where.customer_id = customerId;
    }

    const rows = await loadConsumableRows(where);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to load consumables." });
  }
};

exports.getConsumableEntry = async (req, res) => {
  try {
    const canViewEntry = await canAccessConsumablePage(req, EDIT_ADDED_CONSUMABLE_PATH, "view");
    if (!canViewEntry) {
      return res.status(403).json({ message: "Forbidden: Missing Edit Added Consumables view permission." });
    }

    const entryKey = String(req.params.entryKey || "").trim();
    if (!entryKey) {
      return res.status(400).json({ message: "Entry id is required." });
    }

    const requesterScope = await getRequesterRentalCustomerScope(req);
    const where = {};
    if (entryKey.startsWith("ROW-")) {
      const rowId = Number(entryKey.slice(4));
      if (!Number.isFinite(rowId) || rowId <= 0) {
        return res.status(400).json({ message: "Invalid entry id." });
      }
      where.id = rowId;
    } else {
      where.save_batch_id = entryKey;
    }
    if (requesterScope?.customer_id) {
      where.customer_id = requesterScope.customer_id;
    }

    const rows = await loadConsumableRows(where);
    if (!rows.length) {
      return res.status(404).json({ message: "Entry not found." });
    }

    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to load consumable entry." });
  }
};

exports.createConsumable = async (req, res) => {
  try {
    const canAddConsumable = await canAccessConsumablePage(req, ADD_RENTAL_CONSUMABLE_PATH, "add");
    if (!canAddConsumable) {
      return res.status(403).json({ message: "Forbidden: Missing Rental Consumables add permission." });
    }

    const rental_machine_id = Number(req.body.rental_machine_id);
    const customer_id = Number(req.body.customer_id);
    const product_id = Number(req.body.product_id);
    const consumable_name = upper(req.body.consumable_name);
    const quantity = Number.parseInt(req.body.quantity, 10);
    const count = Number.parseInt(req.body.count, 10);
    const notes = String(req.body.notes || "").trim();
    const save_batch_id = String(req.body.save_batch_id || "").trim();
    const entry_date = parseDateOnly(req.body.entry_date) || getTodayLocalIso();

    if (!Number.isFinite(customer_id) || customer_id <= 0 || !consumable_name || Number.isNaN(quantity)) {
      return res.status(400).json({ message: "Missing required fields." });
    }
    const isValidEntryDate = /^\d{4}-\d{2}-\d{2}$/.test(entry_date) && !Number.isNaN(new Date(`${entry_date}T00:00:00`).getTime());
    if (!isValidEntryDate) {
      return res.status(400).json({ message: "Invalid entry date." });
    }

    const customer = await Customer.findByPk(customer_id);
    if (!customer) {
      return res.status(404).json({ message: "Rental customer not found." });
    }
    if (String(customer.customer_mode || "").toLowerCase() !== "rental") {
      return res.status(400).json({ message: "Selected customer is not Rental mode." });
    }

    const requesterScope = await getRequesterRentalCustomerScope(req);
    if (requesterScope?.customer_id && Number(customer.id || 0) !== Number(requesterScope.customer_id)) {
      return res.status(403).json({ message: "Forbidden: You can only save consumables for your mapped rental customer." });
    }

    let linkedMachineId = null;
    if (Number.isFinite(rental_machine_id) && rental_machine_id > 0) {
      const machine = await RentalMachine.findByPk(rental_machine_id);
      if (!machine) {
        return res.status(404).json({ message: "Rental machine not found." });
      }
      if (Number(machine.customer_id) !== Number(customer.id)) {
        return res.status(400).json({ message: "Selected rental machine does not belong to selected customer." });
      }
      linkedMachineId = machine.id;
    }

    let linkedProductId = null;
    if (Number.isFinite(product_id) && product_id > 0) {
      const product = await Product.findByPk(product_id);
      if (!product) {
        return res.status(404).json({ message: "Selected product not found." });
      }
      linkedProductId = product.id;
    }

    const created = await RentalMachineConsumable.create({
      rental_machine_id: linkedMachineId,
      customer_id: customer.id,
      product_id: linkedProductId,
      save_batch_id: save_batch_id || null,
      consumable_name,
      quantity,
      count: Number.isNaN(count) ? 0 : count,
      entry_date,
      notes: notes || null,
    });

    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to save consumable." });
  }
};

exports.createConsumablesBatch = async (req, res) => {
  const transaction = await db.transaction();
  try {
    const canAddConsumables = await canAccessConsumablePage(req, ADD_RENTAL_CONSUMABLE_PATH, "add");
    if (!canAddConsumables) {
      await transaction.rollback();
      return res.status(403).json({ message: "Forbidden: Missing Rental Consumables add permission." });
    }

    const customer_id = Number(req.body.customer_id);
    const rental_machine_id = Number(req.body.rental_machine_id);
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const entry_date = parseDateOnly(req.body.entry_date) || getTodayLocalIso();

    if (!Number.isFinite(customer_id) || customer_id <= 0 || !items.length) {
      await transaction.rollback();
      return res.status(400).json({ message: "Customer and at least one consumable item are required." });
    }
    const isValidEntryDate = /^\d{4}-\d{2}-\d{2}$/.test(entry_date) && !Number.isNaN(new Date(`${entry_date}T00:00:00`).getTime());
    if (!isValidEntryDate) {
      await transaction.rollback();
      return res.status(400).json({ message: "Invalid entry date." });
    }

    const customer = await Customer.findByPk(customer_id, { transaction });
    if (!customer) {
      await transaction.rollback();
      return res.status(404).json({ message: "Rental customer not found." });
    }
    if (String(customer.customer_mode || "").toLowerCase() !== "rental") {
      await transaction.rollback();
      return res.status(400).json({ message: "Selected customer is not Rental mode." });
    }

    const requesterScope = await getRequesterRentalCustomerScope(req);
    if (requesterScope?.customer_id && Number(customer.id || 0) !== Number(requesterScope.customer_id)) {
      await transaction.rollback();
      return res.status(403).json({ message: "Forbidden: You can only save consumables for your mapped rental customer." });
    }

    let linkedMachineId = null;
    if (Number.isFinite(rental_machine_id) && rental_machine_id > 0) {
      const machine = await RentalMachine.findByPk(rental_machine_id, { transaction });
      if (!machine) {
        await transaction.rollback();
        return res.status(404).json({ message: "Rental machine not found." });
      }
      if (Number(machine.customer_id) !== Number(customer.id)) {
        await transaction.rollback();
        return res.status(400).json({ message: "Selected rental machine does not belong to selected customer." });
      }
      linkedMachineId = machine.id;
    }

    const saveBatchId = `RC-${Date.now()}`;
    const createdItems = [];

    for (const item of items) {
      const product_id = Number(item.product_id);
      const consumable_name = upper(item.consumable_name);
      const quantity = Number.parseInt(item.quantity, 10);
      const count = Number.parseInt(item.count, 10);

      if (!consumable_name || Number.isNaN(quantity)) {
        await transaction.rollback();
        return res.status(400).json({ message: "Invalid consumable item in batch." });
      }

      let linkedProductId = null;
      if (Number.isFinite(product_id) && product_id > 0) {
        const product = await Product.findByPk(product_id, { transaction });
        if (!product) {
          await transaction.rollback();
          return res.status(404).json({ message: "One selected product was not found." });
        }
        linkedProductId = product.id;
      }

      const created = await RentalMachineConsumable.create(
        {
          rental_machine_id: linkedMachineId,
          customer_id: customer.id,
          product_id: linkedProductId,
          save_batch_id: saveBatchId,
          consumable_name,
          quantity,
          count: Number.isNaN(count) ? 0 : count,
          entry_date,
        },
        { transaction }
      );
      createdItems.push(created);
    }

    await transaction.commit();
    res.status(201).json({ save_batch_id: saveBatchId, count: createdItems.length, items: createdItems });
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ message: err.message || "Failed to save consumables batch." });
  }
};

exports.deleteConsumableById = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ message: "Invalid consumable id." });
    }

    const row = await RentalMachineConsumable.findByPk(id);
    if (!row) {
      return res.status(404).json({ message: "Consumable entry not found." });
    }

    await row.destroy();
    res.json({ message: "Consumable entry deleted successfully." });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to delete consumable entry." });
  }
};

exports.deleteConsumablesByBatch = async (req, res) => {
  try {
    const save_batch_id = String(req.params.save_batch_id || "").trim();
    if (!save_batch_id) {
      return res.status(400).json({ message: "save_batch_id is required." });
    }

    const count = await RentalMachineConsumable.destroy({
      where: { save_batch_id },
    });

    if (!count) {
      return res.status(404).json({ message: "No consumables found for this entry." });
    }

    res.json({ message: "Consumables entry deleted successfully.", deleted_count: count });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to delete consumables entry." });
  }
};
