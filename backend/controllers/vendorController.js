const Vendor = require("../models/Vendor");
const Product = require("../models/Product");

exports.getVendors = async (req,res)=>{
    const vendors = await Vendor.findAll();
    res.json(vendors);
}

exports.getVendorById = async (req,res)=>{
    const { id } = req.params;
    const vendor = await Vendor.findByPk(id);
    if(!vendor){
        return res.status(404).json({ message: "Vendor not found." });
    }
    res.json(vendor);
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
        if(Array.isArray(category)){
            category = category.map(c => String(c).trim()).filter(Boolean).join(", ");
        }
        if(typeof category === "string"){
            category = category.trim();
        }
        if(!name || !category){
            return res.status(400).json({ message: "Vendor name and category are required." });
        }
        const vendor = await Vendor.create({ name, address, category });
        res.status(201).json(vendor);
    }catch(err){
        res.status(500).json({ message: err.message || "Failed to add vendor." });
    }
};

exports.updateVendor = async (req,res)=>{
    try{
        const { id } = req.params;
        let { name, address, category } = req.body;
        if(Array.isArray(category)){
            category = category.map(c => String(c).trim()).filter(Boolean).join(", ");
        }
        if(typeof category === "string"){
            category = category.trim();
        }
        if(!name || !category){
            return res.status(400).json({ message: "Vendor name and category are required." });
        }
        const vendor = await Vendor.findByPk(id);
        if(!vendor){
            return res.status(404).json({ message: "Vendor not found." });
        }
        await vendor.update({ name, address, category });
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
