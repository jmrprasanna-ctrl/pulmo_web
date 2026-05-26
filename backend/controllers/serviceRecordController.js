const { Op, DataTypes } = require("sequelize");
const ServiceRecord = require("../models/ServiceRecord");
const Customer = require("../models/Customer");
const GeneralMachine = require("../models/GeneralMachine");
const RentalMachine = require("../models/RentalMachine");

function normalizeServiceType(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "general" || raw === "rental") return raw;
  return "";
}

function normalizeServiceMode(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "breakdown" || raw === "service") return raw;
  return "";
}

const SERVICE_SPARE_OPTIONS = [
  "Copier",
  "Printer",
  "Drum Assembly",
  "Developer assembly",
  "CIS",
  "Laser Assembly",
  "M/Board",
  "P/Board",
  "Drum OPC",
  "Cleaning Blade",
  "Developer Rollor",
  "Developer",
  "Pickup Rollor",
  "S/Pad",
  "Other",
];
const SERVICE_SPARE_LOOKUP = SERVICE_SPARE_OPTIONS.reduce((acc, label) => {
  acc[String(label || "").toLowerCase()] = label;
  return acc;
}, {});

function normalizeServiceSpare(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  return SERVICE_SPARE_LOOKUP[raw] || "";
}

function parseDateOnly(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
  const dt = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return "";
  return raw;
}

function parsePositiveInt(value) {
  const num = Number.parseInt(value, 10);
  return Number.isFinite(num) && num > 0 ? num : 0;
}

async function ensureServiceRecordColumns() {
  const queryInterface = ServiceRecord.sequelize?.getQueryInterface?.();
  if (!queryInterface) return;

  try {
    const tableName = ServiceRecord.getTableName ? ServiceRecord.getTableName() : "service_records";
    const columns = await queryInterface.describeTable(tableName);
    if (!columns.service_mode) {
      await queryInterface.addColumn(tableName, "service_mode", {
        type: DataTypes.STRING(20),
        allowNull: true,
      });
    }
    if (!columns.service_spare) {
      await queryInterface.addColumn(tableName, "service_spare", {
        type: DataTypes.STRING(80),
        allowNull: true,
      });
    }
  } catch (_err) {
    // Ignore schema-guard errors; normal API errors will still be returned by handlers.
  }
}

async function resolveMachineRecord(serviceType, machineId) {
  if (serviceType === "general") {
    return GeneralMachine.findByPk(machineId);
  }
  if (serviceType === "rental") {
    return RentalMachine.findByPk(machineId);
  }
  return null;
}

exports.getServiceRecords = async (req, res) => {
  try {
    await ensureServiceRecordColumns();

    const serviceType = normalizeServiceType(req.query.service_type);
    const serviceMode = normalizeServiceMode(req.query.service_mode);
    const customerId = parsePositiveInt(req.query.customer_id);
    const fromDate = parseDateOnly(req.query.from_date);
    const toDate = parseDateOnly(req.query.to_date);
    const where = {};

    if (serviceType) where.service_type = serviceType;
    if (serviceMode) {
      where.service_mode = serviceMode;
      if (!serviceType) where.service_type = "general";
    }
    if (customerId) where.customer_id = customerId;
    if (fromDate && toDate) {
      where.service_date = { [Op.between]: [fromDate, toDate] };
    } else if (fromDate) {
      where.service_date = { [Op.gte]: fromDate };
    } else if (toDate) {
      where.service_date = { [Op.lte]: toDate };
    }

    const rows = await ServiceRecord.findAll({
      where,
      include: [{ model: Customer, attributes: ["id", "name", "customer_mode"] }],
      order: [["service_date", "DESC"], ["id", "DESC"]],
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to load services." });
  }
};

exports.getServiceRecordById = async (req, res) => {
  try {
    await ensureServiceRecordColumns();

    const id = parsePositiveInt(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Invalid service id." });
    }

    const row = await ServiceRecord.findByPk(id, {
      include: [{ model: Customer, attributes: ["id", "name", "customer_mode"] }],
    });
    if (!row) {
      return res.status(404).json({ message: "Service record not found." });
    }
    return res.json(row);
  } catch (err) {
    return res.status(500).json({ message: err.message || "Failed to load service entry." });
  }
};

exports.createServiceRecord = async (req, res) => {
  try {
    await ensureServiceRecordColumns();

    const service_date = parseDateOnly(req.body.service_date);
    const service_type = normalizeServiceType(req.body.service_type);
    const service_mode = normalizeServiceMode(req.body.service_mode);
    const raw_service_spare = String(req.body.service_spare || "").trim();
    const service_spare = normalizeServiceSpare(raw_service_spare);
    const customer_id = parsePositiveInt(req.body.customer_id);
    const machine_ref_id = parsePositiveInt(req.body.machine_ref_id);
    const counter_value = String(req.body.counter_value || "").trim();
    const comment_text = String(req.body.comment_text || "").trim();

    if (!service_date) {
      return res.status(400).json({ message: "Valid service date is required." });
    }
    if (!service_type) {
      return res.status(400).json({ message: "Service type must be General or Rental." });
    }
    if (service_type === "general" && !service_mode) {
      return res.status(400).json({ message: "Mode must be Breakdown or Service for General type." });
    }
    if (raw_service_spare && !service_spare) {
      return res.status(400).json({ message: "Invalid spare selection." });
    }
    if (!customer_id) {
      return res.status(400).json({ message: "Customer is required." });
    }
    if (!machine_ref_id) {
      return res.status(400).json({ message: "Machine is required." });
    }
    if (!counter_value) {
      return res.status(400).json({ message: "Counter is required." });
    }

    const customer = await Customer.findByPk(customer_id);
    if (!customer) {
      return res.status(404).json({ message: "Selected customer not found." });
    }

    const customerMode = String(customer.customer_mode || "").trim().toLowerCase();
    if (customerMode !== service_type) {
      return res.status(400).json({
        message: `Selected customer is not a ${service_type} customer.`,
      });
    }

    const machine = await resolveMachineRecord(service_type, machine_ref_id);
    if (!machine) {
      return res.status(404).json({ message: "Selected machine not found." });
    }

    const machineCustomerId = Number(machine.customer_id || 0);
    if (machineCustomerId && machineCustomerId !== customer_id) {
      return res.status(400).json({ message: "Selected machine does not belong to selected customer." });
    }

    const payload = {
      service_date,
      service_type,
      service_mode: service_type === "general" ? service_mode : null,
      customer_id,
      customer_name: String(customer.name || "").trim(),
      machine_ref_id,
      machine_code: String(machine.machine_id || "").trim(),
      machine_title: String(machine.machine_title || "").trim(),
      service_spare: service_spare || null,
      counter_value: counter_value.slice(0, 120),
      comment_text: comment_text.slice(0, 2000),
      created_by: Number(req.user?.id || req.user?.userId || 0) || null,
    };

    const created = await ServiceRecord.create(payload);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to add service." });
  }
};

exports.updateServiceRecord = async (req, res) => {
  try {
    await ensureServiceRecordColumns();

    const id = parsePositiveInt(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Invalid service id." });
    }

    const row = await ServiceRecord.findByPk(id);
    if (!row) {
      return res.status(404).json({ message: "Service record not found." });
    }

    const service_date = parseDateOnly(req.body.service_date);
    const service_type = normalizeServiceType(req.body.service_type);
    const service_mode = normalizeServiceMode(req.body.service_mode);
    const raw_service_spare = String(req.body.service_spare || "").trim();
    const service_spare = normalizeServiceSpare(raw_service_spare);
    const customer_id = parsePositiveInt(req.body.customer_id);
    const machine_ref_id = parsePositiveInt(req.body.machine_ref_id);
    const counter_value = String(req.body.counter_value || "").trim();
    const comment_text = String(req.body.comment_text || "").trim();

    if (!service_date) {
      return res.status(400).json({ message: "Valid service date is required." });
    }
    if (!service_type) {
      return res.status(400).json({ message: "Service type must be General or Rental." });
    }
    if (service_type === "general" && !service_mode) {
      return res.status(400).json({ message: "Mode must be Breakdown or Service for General type." });
    }
    if (raw_service_spare && !service_spare) {
      return res.status(400).json({ message: "Invalid spare selection." });
    }
    if (!customer_id) {
      return res.status(400).json({ message: "Customer is required." });
    }
    if (!machine_ref_id) {
      return res.status(400).json({ message: "Machine is required." });
    }
    if (!counter_value) {
      return res.status(400).json({ message: "Counter is required." });
    }

    const customer = await Customer.findByPk(customer_id);
    if (!customer) {
      return res.status(404).json({ message: "Selected customer not found." });
    }

    const customerMode = String(customer.customer_mode || "").trim().toLowerCase();
    if (customerMode !== service_type) {
      return res.status(400).json({
        message: `Selected customer is not a ${service_type} customer.`,
      });
    }

    const machine = await resolveMachineRecord(service_type, machine_ref_id);
    if (!machine) {
      return res.status(404).json({ message: "Selected machine not found." });
    }

    const machineCustomerId = Number(machine.customer_id || 0);
    if (machineCustomerId && machineCustomerId !== customer_id) {
      return res.status(400).json({ message: "Selected machine does not belong to selected customer." });
    }

    await row.update({
      service_date,
      service_type,
      service_mode: service_type === "general" ? service_mode : null,
      customer_id,
      customer_name: String(customer.name || "").trim(),
      machine_ref_id,
      machine_code: String(machine.machine_id || "").trim(),
      machine_title: String(machine.machine_title || "").trim(),
      service_spare: service_spare || null,
      counter_value: counter_value.slice(0, 120),
      comment_text: comment_text.slice(0, 2000),
    });

    res.json(row);
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to update service entry." });
  }
};

exports.deleteServiceRecord = async (req, res) => {
  try {
    await ensureServiceRecordColumns();

    const id = parsePositiveInt(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Invalid service id." });
    }
    const row = await ServiceRecord.findByPk(id);
    if (!row) {
      return res.status(404).json({ message: "Service record not found." });
    }
    await row.destroy();
    res.json({ message: "Service record deleted successfully." });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to delete service record." });
  }
};
