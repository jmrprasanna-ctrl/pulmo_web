const RentalMachineConsumable = require("../models/RentalMachineConsumable");
const RentalMachine = require("../models/RentalMachine");
const Product = require("../models/Product");
const Customer = require("../models/Customer");
const db = require("../config/database");

function upper(value) {
  return String(value || "").trim().toUpperCase();
}

exports.getConsumables = async (req, res) => {
  try {
    const where = {};
    const machineId = Number(req.query.rental_machine_id);
    const customerId = Number(req.query.customer_id);
    if (Number.isFinite(machineId) && machineId > 0) {
      where.rental_machine_id = machineId;
    }
    if (Number.isFinite(customerId) && customerId > 0) {
      where.customer_id = customerId;
    }

    const rows = await RentalMachineConsumable.findAll({
      where,
      include: [{ model: RentalMachine }, { model: Customer }, { model: Product }],
      order: [["createdAt", "DESC"], ["id", "DESC"]],
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to load consumables." });
  }
};

exports.createConsumable = async (req, res) => {
  try {
    const rental_machine_id = Number(req.body.rental_machine_id);
    const customer_id = Number(req.body.customer_id);
    const product_id = Number(req.body.product_id);
    const consumable_name = upper(req.body.consumable_name);
    const quantity = Number.parseInt(req.body.quantity, 10);
    const count = Number.parseInt(req.body.count, 10);
    const notes = String(req.body.notes || "").trim();
    const save_batch_id = String(req.body.save_batch_id || "").trim();

    if (!Number.isFinite(customer_id) || customer_id <= 0 || !consumable_name || Number.isNaN(quantity)) {
      return res.status(400).json({ message: "Missing required fields." });
    }

    const customer = await Customer.findByPk(customer_id);
    if (!customer) {
      return res.status(404).json({ message: "Rental customer not found." });
    }
    if (String(customer.customer_mode || "").toLowerCase() !== "rental") {
      return res.status(400).json({ message: "Selected customer is not Rental mode." });
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
    const customer_id = Number(req.body.customer_id);
    const rental_machine_id = Number(req.body.rental_machine_id);
    const items = Array.isArray(req.body.items) ? req.body.items : [];

    if (!Number.isFinite(customer_id) || customer_id <= 0 || !items.length) {
      await transaction.rollback();
      return res.status(400).json({ message: "Customer and at least one consumable item are required." });
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
