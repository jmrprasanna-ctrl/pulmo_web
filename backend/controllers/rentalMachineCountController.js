const { Op } = require("sequelize");
const db = require("../config/database");
const RentalMachineCount = require("../models/RentalMachineCount");
const RentalMachine = require("../models/RentalMachine");
const Customer = require("../models/Customer");

exports.getLastTransactionId = async (_req, res) => {
  try {
    const last = await RentalMachineCount.findOne({
      where: { transaction_id: { [Op.like]: "RMC-%" } },
      order: [["createdAt", "DESC"], ["id", "DESC"]],
    });
    res.json(last || null);
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to load last transaction id." });
  }
};

exports.getMachineNextCount = async (req, res) => {
  try {
    const rentalMachineId = Number(req.query.rental_machine_id);
    if (!Number.isFinite(rentalMachineId) || rentalMachineId <= 0) {
      return res.status(400).json({ message: "rental_machine_id is required." });
    }

    const machine = await RentalMachine.findByPk(rentalMachineId);
    if (!machine) {
      return res.status(404).json({ message: "Rental machine not found." });
    }

    const lastCount = await RentalMachineCount.findOne({
      where: { rental_machine_id: rentalMachineId },
      order: [["createdAt", "DESC"], ["id", "DESC"]],
    });

    const nextInput = lastCount
      ? Number(lastCount.updated_count || 0)
      : Number(machine.updated_count ?? machine.start_count ?? 0);

    res.json({
      rental_machine_id: machine.id,
      next_input_count: Number.isNaN(nextInput) ? 0 : nextInput,
      machine_start_count: Number(machine.start_count || 0),
      machine_updated_count: Number(machine.updated_count || 0),
    });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to load next input count." });
  }
};

exports.getRentalMachineCounts = async (req, res) => {
  try {
    const where = {};
    const rentalMachineId = Number(req.query.rental_machine_id);
    const customerId = Number(req.query.customer_id);

    if (Number.isFinite(rentalMachineId) && rentalMachineId > 0) {
      where.rental_machine_id = rentalMachineId;
    }
    if (Number.isFinite(customerId) && customerId > 0) {
      where.customer_id = customerId;
    }

    const rows = await RentalMachineCount.findAll({
      where,
      include: [{ model: RentalMachine }, { model: Customer }],
      order: [["createdAt", "DESC"], ["id", "DESC"]],
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to load rental counts." });
  }
};

exports.createRentalMachineCount = async (req, res) => {
  const transaction = await db.transaction();
  try {
    const rental_machine_id = Number(req.body.rental_machine_id);
    const updated_count = Number.parseInt(req.body.updated_count, 10);
    let transaction_id = String(req.body.transaction_id || "").trim().toUpperCase();

    if (!Number.isFinite(rental_machine_id) || rental_machine_id <= 0 || Number.isNaN(updated_count)) {
      await transaction.rollback();
      return res.status(400).json({ message: "Rental machine and updated count are required." });
    }
    if (updated_count < 0) {
      await transaction.rollback();
      return res.status(400).json({ message: "Updated count cannot be negative." });
    }

    const machine = await RentalMachine.findByPk(rental_machine_id, { transaction });
    if (!machine) {
      await transaction.rollback();
      return res.status(404).json({ message: "Rental machine not found." });
    }

    const customer = await Customer.findByPk(machine.customer_id, { transaction });
    if (!customer) {
      await transaction.rollback();
      return res.status(404).json({ message: "Linked customer not found." });
    }

    const lastCount = await RentalMachineCount.findOne({
      where: { rental_machine_id },
      order: [["createdAt", "DESC"], ["id", "DESC"]],
      transaction,
    });

    const input_count = lastCount
      ? Number(lastCount.updated_count || 0)
      : Number(machine.updated_count ?? machine.start_count ?? 0);

    if (!transaction_id) {
      transaction_id = `RMC-${Date.now()}`;
    }

    const duplicate = await RentalMachineCount.findOne({
      where: { transaction_id },
      transaction,
    });
    if (duplicate) {
      await transaction.rollback();
      return res.status(400).json({ message: "Transaction ID already exists." });
    }

    const created = await RentalMachineCount.create(
      {
        transaction_id,
        rental_machine_id,
        customer_id: machine.customer_id,
        input_count,
        updated_count,
      },
      { transaction }
    );

    await machine.update({ updated_count }, { transaction });
    await transaction.commit();

    res.status(201).json(created);
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ message: err.message || "Failed to save rental count." });
  }
};
