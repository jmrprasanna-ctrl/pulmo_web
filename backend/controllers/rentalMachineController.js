const { Op } = require("sequelize");
const db = require("../config/database");
const RentalMachine = require("../models/RentalMachine");
const RentalMachineCount = require("../models/RentalMachineCount");
const RentalMachineConsumable = require("../models/RentalMachineConsumable");
const Customer = require("../models/Customer");

function toUpperSafe(value) {
  return String(value || "").trim().toUpperCase();
}

exports.getRentalMachines = async (req, res) => {
  try {
    const rows = await RentalMachine.findAll({
      include: [{ model: Customer, attributes: ["id", "name", "address", "customer_mode"] }],
      order: [["createdAt", "DESC"], ["id", "DESC"]],
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to load rental machines." });
  }
};

exports.getLastMachineId = async (_req, res) => {
  try {
    const last = await RentalMachine.findOne({
      where: { machine_id: { [Op.like]: "PTR%" } },
      order: [["createdAt", "DESC"], ["id", "DESC"]],
    });
    res.json(last || null);
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to get last machine id." });
  }
};

exports.createRentalMachine = async (req, res) => {
  try {
    let {
      machine_id,
      customer_id,
      customer_name,
      address,
      model,
      machine_title,
      serial_no,
      start_count,
      updated_count,
      page_per_price,
    } = req.body;

    machine_id = toUpperSafe(machine_id);
    customer_name = String(customer_name || "").trim();
    address = String(address || "").trim();
    model = toUpperSafe(model);
    machine_title = toUpperSafe(machine_title);
    serial_no = toUpperSafe(serial_no);
    const parsedCustomerId = Number(customer_id);
    const parsedStartCount = Number.parseInt(start_count, 10);
    const parsedUpdatedCount = Number.isNaN(Number.parseInt(updated_count, 10))
      ? parsedStartCount
      : Number.parseInt(updated_count, 10);
    const parsedPagePerPrice = Number.isNaN(Number.parseFloat(page_per_price))
      ? 0
      : Number.parseFloat(page_per_price);

    if (!machine_id || !Number.isFinite(parsedCustomerId) || !model || !machine_title || Number.isNaN(parsedStartCount)) {
      return res.status(400).json({ message: "Missing required fields." });
    }
    if (parsedUpdatedCount < 0 || parsedPagePerPrice < 0) {
      return res.status(400).json({ message: "Updated Count and Page per price cannot be negative." });
    }

    const customer = await Customer.findByPk(parsedCustomerId);
    if (!customer) {
      return res.status(404).json({ message: "Selected customer not found." });
    }
    if (String(customer.customer_mode || "").toLowerCase() !== "rental") {
      return res.status(400).json({ message: "Selected customer is not a Rental customer." });
    }

    const exists = await RentalMachine.findOne({ where: { machine_id } });
    if (exists) {
      return res.status(400).json({ message: "Machine ID already exists." });
    }

    const created = await RentalMachine.create({
      machine_id,
      customer_id: parsedCustomerId,
      customer_name: customer_name || customer.name,
      address: address || customer.address || "",
      model,
      machine_title,
      serial_no: serial_no || null,
      start_count: parsedStartCount,
      updated_count: parsedUpdatedCount,
      page_per_price: parsedPagePerPrice,
    });

    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to save rental machine." });
  }
};

exports.getRentalMachineById = async (req, res) => {
  try {
    const { id } = req.params;
    const row = await RentalMachine.findByPk(id, {
      include: [{ model: Customer, attributes: ["id", "name", "address", "customer_mode"] }],
    });
    if (!row) {
      return res.status(404).json({ message: "Rental machine not found." });
    }
    res.json(row);
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to load rental machine." });
  }
};

exports.updateRentalMachine = async (req, res) => {
  try {
    const { id } = req.params;
    let {
      machine_id,
      customer_id,
      customer_name,
      address,
      model,
      machine_title,
      serial_no,
      start_count,
      updated_count,
      page_per_price,
    } = req.body;

    machine_id = toUpperSafe(machine_id);
    customer_name = String(customer_name || "").trim();
    address = String(address || "").trim();
    model = toUpperSafe(model);
    machine_title = toUpperSafe(machine_title);
    serial_no = toUpperSafe(serial_no);
    const parsedCustomerId = Number(customer_id);
    const parsedStartCount = Number.parseInt(start_count, 10);
    const parsedUpdatedCount = Number.isNaN(Number.parseInt(updated_count, 10))
      ? parsedStartCount
      : Number.parseInt(updated_count, 10);
    const parsedPagePerPrice = Number.isNaN(Number.parseFloat(page_per_price))
      ? 0
      : Number.parseFloat(page_per_price);

    if (!machine_id || !Number.isFinite(parsedCustomerId) || !model || !machine_title || Number.isNaN(parsedStartCount)) {
      return res.status(400).json({ message: "Missing required fields." });
    }
    if (parsedUpdatedCount < 0 || parsedPagePerPrice < 0) {
      return res.status(400).json({ message: "Updated Count and Page per price cannot be negative." });
    }

    const row = await RentalMachine.findByPk(id);
    if (!row) {
      return res.status(404).json({ message: "Rental machine not found." });
    }

    const customer = await Customer.findByPk(parsedCustomerId);
    if (!customer) {
      return res.status(404).json({ message: "Selected customer not found." });
    }
    if (String(customer.customer_mode || "").toLowerCase() !== "rental") {
      return res.status(400).json({ message: "Selected customer is not a Rental customer." });
    }

    const duplicate = await RentalMachine.findOne({
      where: {
        machine_id,
        id: { [Op.ne]: row.id },
      },
    });
    if (duplicate) {
      return res.status(400).json({ message: "Machine ID already exists." });
    }

    await row.update({
      machine_id,
      customer_id: parsedCustomerId,
      customer_name: customer_name || customer.name,
      address: address || customer.address || "",
      model,
      machine_title,
      serial_no: serial_no || null,
      start_count: parsedStartCount,
      updated_count: parsedUpdatedCount,
      page_per_price: parsedPagePerPrice,
    });

    res.json(row);
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to update rental machine." });
  }
};

exports.deleteRentalMachine = async (req, res) => {
  try {
    const { id } = req.params;
    const row = await RentalMachine.findByPk(id);
    if (!row) {
      return res.status(404).json({ message: "Rental machine not found." });
    }

    await db.transaction(async (transaction) => {
      // Some environments have non-cascading FK constraints in existing DBs.
      // Delete child rows explicitly to keep delete reliable.
      await RentalMachineCount.destroy({
        where: { rental_machine_id: row.id },
        transaction,
      });

      await RentalMachineConsumable.destroy({
        where: { rental_machine_id: row.id },
        transaction,
      });

      await row.destroy({ transaction });
    });

    res.json({ message: "Rental machine deleted successfully." });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to delete rental machine." });
  }
};
