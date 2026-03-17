const CategoryModelOption = require("../models/CategoryModelOption");

exports.getCategoryModelOptions = async (req, res) => {
  try {
    const category = String(req.query.category || "").trim();
    const where = category ? { category_name: category } : {};
    const rows = await CategoryModelOption.findAll({
      where,
      order: [["model_name", "ASC"]],
    });
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || "Failed to load category model options." });
  }
};

