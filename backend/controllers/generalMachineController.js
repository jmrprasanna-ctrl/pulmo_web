const { Op } = require("sequelize");
const GeneralMachine = require("../models/GeneralMachine");
const Customer = require("../models/Customer");

function toUpperSafe(value) {
  return String(value || "").trim().toUpperCase();
}

exports.getGeneralMachines = async (_req, res) => {
  try {
    const rows = await GeneralMachine.findAll({
      include: [{ model: Customer, attributes: ["id", "name", "address", "customer_mode"] }],
      order: [["createdAt", "DESC"], ["id", "DESC"]],
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to load general machines." });
  }
};

exports.getLastMachineId = async (_req, res) => {
  try {
    const last = await GeneralMachine.findOne({
      where: { machine_id: { [Op.like]: "GTR%" } },
      order: [["createdAt", "DESC"], ["id", "DESC"]],
    });
    res.json(last || null);
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to get last machine id." });
  }
};

exports.createGeneralMachine = async (req, res) => {
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
    } = req.body;

    machine_id = toUpperSafe(machine_id);
    customer_name = String(customer_name || "").trim();
    address = String(address || "").trim();
    model = toUpperSafe(model);
    machine_title = toUpperSafe(machine_title);
    serial_no = toUpperSafe(serial_no);
    const parsedCustomerId = Number(customer_id);
    const parsedStartCount = Number.parseInt(start_count, 10);

    if (!machine_id || !Number.isFinite(parsedCustomerId) || !model || !machine_title || Number.isNaN(parsedStartCount)) {
      return res.status(400).json({ message: "Missing required fields." });
    }

    const customer = await Customer.findByPk(parsedCustomerId);
    if (!customer) {
      return res.status(404).json({ message: "Selected customer not found." });
    }
    if (String(customer.customer_mode || "").toLowerCase() !== "general") {
      return res.status(400).json({ message: "Selected customer is not a General customer." });
    }

    const exists = await GeneralMachine.findOne({ where: { machine_id } });
    if (exists) {
      return res.status(400).json({ message: "Machine ID already exists." });
    }

    const created = await GeneralMachine.create({
      machine_id,
      customer_id: parsedCustomerId,
      customer_name: customer_name || customer.name,
      address: address || customer.address || "",
      model,
      machine_title,
      serial_no: serial_no || null,
      start_count: parsedStartCount,
    });

    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to save general machine." });
  }
};

exports.getGeneralMachineById = async (req, res) => {
  try {
    const { id } = req.params;
    const row = await GeneralMachine.findByPk(id, {
      include: [{ model: Customer, attributes: ["id", "name", "address", "customer_mode"] }],
    });
    if (!row) {
      return res.status(404).json({ message: "General machine not found." });
    }
    res.json(row);
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to load general machine." });
  }
};

exports.updateGeneralMachine = async (req, res) => {
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
    } = req.body;

    machine_id = toUpperSafe(machine_id);
    customer_name = String(customer_name || "").trim();
    address = String(address || "").trim();
    model = toUpperSafe(model);
    machine_title = toUpperSafe(machine_title);
    serial_no = toUpperSafe(serial_no);
    const parsedCustomerId = Number(customer_id);
    const parsedStartCount = Number.parseInt(start_count, 10);

    if (!machine_id || !Number.isFinite(parsedCustomerId) || !model || !machine_title || Number.isNaN(parsedStartCount)) {
      return res.status(400).json({ message: "Missing required fields." });
    }

    const row = await GeneralMachine.findByPk(id);
    if (!row) {
      return res.status(404).json({ message: "General machine not found." });
    }

    const customer = await Customer.findByPk(parsedCustomerId);
    if (!customer) {
      return res.status(404).json({ message: "Selected customer not found." });
    }
    if (String(customer.customer_mode || "").toLowerCase() !== "general") {
      return res.status(400).json({ message: "Selected customer is not a General customer." });
    }

    const duplicate = await GeneralMachine.findOne({
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
    });

    res.json(row);
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to update general machine." });
  }
};

exports.deleteGeneralMachine = async (req, res) => {
  try {
    const { id } = req.params;
    const row = await GeneralMachine.findByPk(id);
    if (!row) {
      return res.status(404).json({ message: "General machine not found." });
    }
    await row.destroy();
    res.json({ message: "General machine deleted successfully." });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to delete general machine." });
  }
};

