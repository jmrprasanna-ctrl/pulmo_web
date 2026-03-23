const Vendor = require("../models/Vendor");
const Product = require("../models/Product");

const ALLOWED_VENDOR_CATEGORIES = new Set([
    "Photocopier",
    "Printer",
    "Plotter",
    "Computer",
    "Laptop",
    "Accessory",
    "Consumable",
    "Machine",
    "CCTV",
    "Duplo",
    "Service",
    "Other"
]);

const ALLOWED_VENDOR_CATEGORY_MAP = new Map(
    Array.from(ALLOWED_VENDOR_CATEGORIES).map((x) => [String(x).toLowerCase(), x])
);

function normalizeVendorCategories(input){
    const values = Array.isArray(input)
        ? input
        : String(input || "").split(",");

    const out = [];
    const seen = new Set();
    values.forEach((raw) => {
        const key = String(raw || "").trim().toLowerCase();
        if(!key) return;
        const canonical = ALLOWED_VENDOR_CATEGORY_MAP.get(key);
        if(!canonical || seen.has(canonical)) return;
        seen.add(canonical);
        out.push(canonical);
    });
    return out;
}

function categoriesToStorage(values){
    return values.join(", ");
}

function parseStoredCategories(value){
    return normalizeVendorCategories(String(value || "").split(","));
}

exports.getVendors = async (req,res)=>{
    const vendors = await Vendor.findAll();
    const normalized = vendors.map((v) => {
        const row = v.toJSON ? v.toJSON() : v;
        const categoryList = parseStoredCategories(row.category);
        return {
            ...row,
            category: categoryList.join(", "),
            category_list: categoryList
        };
    });
    res.json(normalized);
}

exports.getVendorById = async (req,res)=>{
    const { id } = req.params;
    const vendor = await Vendor.findByPk(id);
    if(!vendor){
        return res.status(404).json({ message: "Vendor not found." });
    }
    const row = vendor.toJSON ? vendor.toJSON() : vendor;
    const categoryList = parseStoredCategories(row.category);
    res.json({
        ...row,
        category: categoryList.join(", "),
        category_list: categoryList
    });
};

exports.getVendorProducts = async (req,res)=>{
    try{
        const { id } = req.params;
        const products = await Product.findAll({
            where: { vendor_id: id },
            attributes: ["id", "product_id", "description", "model"]
        });
        res.json(products);
    }catch(err){
        res.status(500).json({ message: err.message || "Failed to load vendor products." });
    }
};

exports.createVendor = async (req,res)=>{
    try{
        let { name, address, category } = req.body;
        const categoryList = normalizeVendorCategories(category);
        if(!name || !categoryList.length){
            return res.status(400).json({ message: "Vendor name and category are required." });
        }
        const vendor = await Vendor.create({ name, address, category: categoriesToStorage(categoryList) });
        res.status(201).json(vendor);
    }catch(err){
        res.status(500).json({ message: err.message || "Failed to add vendor." });
    }
};

exports.updateVendor = async (req,res)=>{
    try{
        const { id } = req.params;
        let { name, address, category } = req.body;
        const categoryList = normalizeVendorCategories(category);
        if(!name || !categoryList.length){
            return res.status(400).json({ message: "Vendor name and category are required." });
        }
        const vendor = await Vendor.findByPk(id);
        if(!vendor){
            return res.status(404).json({ message: "Vendor not found." });
        }
        await vendor.update({ name, address, category: categoriesToStorage(categoryList) });
        res.json(vendor);
    }catch(err){
        res.status(500).json({ message: err.message || "Failed to update vendor." });
    }
};

exports.deleteVendor = async (req,res)=>{
    try{
        const { id } = req.params;
        const vendor = await Vendor.findByPk(id);
        if(!vendor){
            return res.status(404).json({ message: "Vendor not found." });
        }
        const productCount = await Product.count({ where: { vendor_id: id } });
        if(productCount > 0){
            return res.status(400).json({
                message: "Cannot delete vendor. Products are linked to this vendor."
            });
        }
        await vendor.destroy();
        res.json({ message: "Vendor deleted successfully." });
    }catch(err){
        res.status(500).json({ message: err.message || "Failed to delete vendor." });
    }
};
