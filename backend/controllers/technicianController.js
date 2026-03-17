const Technician = require("../models/Technician");

exports.getTechnicians = async (_req, res) => {
  try {
    const rows = await Technician.findAll({ order: [["id", "DESC"]] });
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || "Failed to load technicians." });
  }
};

exports.getTechnicianById = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const row = await Technician.findByPk(id);
    if (!row) return res.status(404).json({ message: "Technician not found." });
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || "Failed to load technician." });
  }
};

exports.createTechnician = async (req, res) => {
  try {
    const technician_name = String(req.body.technician_name || "").trim();
    const company = String(req.body.company || "").trim();
    const department = String(req.body.department || "").trim();
    const telephone = String(req.body.telephone || "").trim();
    const email = String(req.body.email || "").trim();

    if (!technician_name || !company || !department || !telephone || !email) {
      return res.status(400).json({ message: "All technician fields are required." });
    }

    const exists = await Technician.findOne({ where: { email } });
    if (exists) {
      return res.status(400).json({ message: "Email already in use." });
    }

    const created = await Technician.create({
      technician_name,
      company,
      department,
      telephone,
      email,
    });

    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || "Failed to create technician." });
  }
};

exports.updateTechnician = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const row = await Technician.findByPk(id);
    if (!row) return res.status(404).json({ message: "Technician not found." });

    const technician_name = String(req.body.technician_name || "").trim();
    const company = String(req.body.company || "").trim();
    const department = String(req.body.department || "").trim();
    const telephone = String(req.body.telephone || "").trim();
    const email = String(req.body.email || "").trim();

    if (!technician_name || !company || !department || !telephone || !email) {
      return res.status(400).json({ message: "All technician fields are required." });
    }

    const duplicate = await Technician.findOne({ where: { email } });
    if (duplicate && Number(duplicate.id) !== id) {
      return res.status(400).json({ message: "Email already in use." });
    }

    await row.update({
      technician_name,
      company,
      department,
      telephone,
      email,
    });

    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || "Failed to update technician." });
  }
};

exports.deleteTechnician = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const row = await Technician.findByPk(id);
    if (!row) return res.status(404).json({ message: "Technician not found." });

    await row.destroy();
    res.json({ message: "Technician deleted successfully." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || "Failed to delete technician." });
  }
};
