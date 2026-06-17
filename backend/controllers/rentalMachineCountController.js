const { Op } = require("sequelize");
const db = require("../config/database");
const RentalMachineCount = require("../models/RentalMachineCount");
const RentalMachine = require("../models/RentalMachine");
const Customer = require("../models/Customer");
const { getRequesterRentalCustomerScope } = require("../utils/requestUserScope");

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

    const requesterScope = await getRequesterRentalCustomerScope(req);
    if (requesterScope?.customer_id && Number(machine.customer_id || 0) !== Number(requesterScope.customer_id)) {
      return res.status(403).json({ message: "Forbidden: You can only access counts for your mapped customer machines." });
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
    const requesterScope = await getRequesterRentalCustomerScope(req);

    if (Number.isFinite(rentalMachineId) && rentalMachineId > 0) {
      where.rental_machine_id = rentalMachineId;
    }
    if (requesterScope?.customer_id) {
      where.customer_id = requesterScope.customer_id;
    } else if (Number.isFinite(customerId) && customerId > 0) {
      where.customer_id = customerId;
    }

    const rows = await RentalMachineCount.findAll({
      where,
      include: [{ model: RentalMachine }, { model: Customer }],
      order: [["entry_date", "DESC"], ["createdAt", "DESC"], ["id", "DESC"]],
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
    const rawEntryDate = String(req.body.entry_date || "").trim();
    const entry_date = rawEntryDate || new Date().toISOString().slice(0, 10);

    if (!Number.isFinite(rental_machine_id) || rental_machine_id <= 0 || Number.isNaN(updated_count)) {
      await transaction.rollback();
      return res.status(400).json({ message: "Rental machine and updated count are required." });
    }
    const isValidEntryDate = /^\d{4}-\d{2}-\d{2}$/.test(entry_date) && !Number.isNaN(new Date(`${entry_date}T00:00:00`).getTime());
    if (!isValidEntryDate) {
      await transaction.rollback();
      return res.status(400).json({ message: "Invalid entry date." });
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

    const requesterScope = await getRequesterRentalCustomerScope(req);
    if (requesterScope?.customer_id && Number(machine.customer_id || 0) !== Number(requesterScope.customer_id)) {
      await transaction.rollback();
      return res.status(403).json({ message: "Forbidden: You can only save counts for your mapped customer machines." });
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
        entry_date,
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

exports.deleteRentalMachineCount = async (req, res) => {
  const transaction = await db.transaction();
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      await transaction.rollback();
      return res.status(400).json({ message: "Invalid rental count id." });
    }

    const row = await RentalMachineCount.findByPk(id, { transaction });
    if (!row) {
      await transaction.rollback();
      return res.status(404).json({ message: "Rental count record not found." });
    }

    const machine = await RentalMachine.findByPk(row.rental_machine_id, { transaction });
    if (!machine) {
      await transaction.rollback();
      return res.status(404).json({ message: "Linked rental machine not found." });
    }

    await row.destroy({ transaction });

    const latestRemaining = await RentalMachineCount.findOne({
      where: { rental_machine_id: machine.id },
      order: [["createdAt", "DESC"], ["id", "DESC"]],
      transaction,
    });

    const updatedCount = latestRemaining
      ? Number(latestRemaining.updated_count || 0)
      : Number(machine.start_count || 0);

    await machine.update({ updated_count: updatedCount }, { transaction });
    await transaction.commit();

    res.json({ message: "Rental count record deleted successfully." });
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ message: err.message || "Failed to delete rental count record." });
  }
};
