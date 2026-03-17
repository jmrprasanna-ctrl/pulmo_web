const Category = require("../models/Category");

exports.getCategories = async (req, res) => {
    const categories = await Category.findAll({ order: [["name", "ASC"]] });
    res.json(categories);
};
