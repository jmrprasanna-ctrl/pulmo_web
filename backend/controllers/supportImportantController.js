const SupportImportant = require("../models/SupportImportant");

const normalizeTitle = (title, importantText) => {
  const cleanTitle = String(title || "").trim();
  if (cleanTitle) return cleanTitle;
  // Keep DB compatibility for older schemas while UI uses only one input.
  return String(importantText || "").trim().slice(0, 120) || "IMPORTANT";
};

exports.getSupportImportants = async (_req, res) => {
  try {
    const rows = await SupportImportant.findAll({ order: [["id", "DESC"]] });
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || "Failed to load support importants." });
  }
};

exports.createSupportImportant = async (req, res) => {
  try {
    const important_text = String(req.body.important_text || req.body.important || "").trim();
    const title = normalizeTitle(req.body.title, important_text);

    if (!important_text) {
      return res.status(400).json({ message: "Important text is required." });
    }

    const created = await SupportImportant.create({ title, important_text });
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || "Failed to create support important." });
  }
};

exports.updateSupportImportant = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const row = await SupportImportant.findByPk(id);
    if (!row) return res.status(404).json({ message: "Support important not found." });

    const important_text = String(req.body.important_text || req.body.important || "").trim();
    const title = normalizeTitle(req.body.title, important_text);
    if (!important_text) {
      return res.status(400).json({ message: "Important text is required." });
    }

    await row.update({ title, important_text });
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || "Failed to update support important." });
  }
};

exports.deleteSupportImportant = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const row = await SupportImportant.findByPk(id);
    if (!row) return res.status(404).json({ message: "Support important not found." });

    await row.destroy();
    res.json({ message: "Support important deleted successfully." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || "Failed to delete support important." });
  }
};
