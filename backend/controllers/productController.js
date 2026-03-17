const Product = require("../models/Product");
const Vendor = require("../models/Vendor");
const Category = require("../models/Category");
const InvoiceItem = require("../models/InvoiceItem");
const Stock = require("../models/Stock");
const { Op } = require("sequelize");

const toNum = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
};

const cleanUpper = (value) => String(value || "").trim().toUpperCase();

exports.getProducts = async (req,res)=>{
    const { category } = req.query;
    const where = {};
    if(category) where.category_id = category;
    const products = await Product.findAll({ include:[Vendor, Category] });
    res.json(products);
}

exports.searchProducts = async (req,res)=>{
    try{
        const q = String(req.query.q || "").trim();
        const parsedLimit = Number(req.query.limit);
        const limit = Number.isFinite(parsedLimit)
            ? Math.min(Math.max(parsedLimit, 1), 100)
            : 25;

        if(!q){
            return res.json([]);
        }

        const where = {
            [Op.or]: [
                { product_id: { [Op.iLike]: `%${q}%` } },
                { description: { [Op.iLike]: `%${q}%` } },
                { model: { [Op.iLike]: `%${q}%` } },
                { "$Vendor.name$": { [Op.iLike]: `%${q}%` } }
            ]
        };

        const rows = await Product.findAll({
            where,
            attributes: ["id","product_id","description","model","selling_price","count"],
            include: [{ model: Vendor, attributes: ["id", "name"] }],
            order: [["product_id","ASC"]],
            limit: Math.max(limit, 50)
        });

        const lowerQ = q.toLowerCase();
        const rank = (row) => {
            const code = String(row.product_id || "").toLowerCase();
            const desc = String(row.description || "").toLowerCase();
            const model = String(row.model || "").toLowerCase();
            if(code === lowerQ) return 0;
            if(code.startsWith(lowerQ)) return 1;
            if(desc.startsWith(lowerQ)) return 2;
            if(model.startsWith(lowerQ)) return 3;
            if(code.includes(lowerQ)) return 4;
            if(desc.includes(lowerQ)) return 5;
            if(model.includes(lowerQ)) return 6;
            return 7;
        };

        const ranked = rows
            .sort((a, b) => {
                const ra = rank(a);
                const rb = rank(b);
                if(ra !== rb) return ra - rb;
                return String(a.product_id || "").localeCompare(String(b.product_id || ""));
            })
            .slice(0, limit)
            .map((row) => {
                const plain = row.toJSON();
                return {
                    id: plain.id,
                    product_id: plain.product_id,
                    description: plain.description,
                    model: plain.model,
                    selling_price: plain.selling_price,
                    count: plain.count,
                    vendor_id: plain.Vendor ? plain.Vendor.id : null,
                    vendor_name: plain.Vendor ? plain.Vendor.name : ""
                };
            });

        res.json(ranked);
    }catch(err){
        res.status(500).json({ message: err.message || "Failed to search products." });
    }
};

exports.getProductById = async (req,res)=>{
    const { id } = req.params;
    const product = await Product.findByPk(id, { include:[Vendor, Category] });
    if(!product){
        return res.status(404).json({ message: "Product not found." });
    }
    res.json(product);
};

exports.createProduct = async (req,res)=>{
    try{
        let {
            category,
            product_id,
            description,
            model,
            serial_no,
            count,
            selling_price,
            dealer_price,
            vendor_id
        } = req.body;

        const rawCategory = category;
        category = typeof category === "string" ? category.trim() : "";
        const parsedVendorId = Number(vendor_id);
        const parsedCount = toNum(count, 0);
        const parsedSelling = toNum(selling_price, 0);
        const parsedDealer = toNum(dealer_price, 0);

        product_id = String(product_id || "").trim();
        description = cleanUpper(description);
        model = cleanUpper(model);
        serial_no = cleanUpper(serial_no);

        if((!category && !Number.isFinite(Number(rawCategory))) || !product_id || !description || !model || !Number.isFinite(parsedVendorId) || parsedVendorId <= 0){
            return res.status(400).json({ message: "Missing required fields." });
        }
        if(parsedCount < 0 || parsedSelling < 0 || parsedDealer < 0){
            return res.status(400).json({ message: "Count and prices cannot be negative." });
        }

        let categoryRecord = null;
        const categoryId = Number(rawCategory);
        if(Number.isFinite(categoryId) && categoryId > 0){
            categoryRecord = await Category.findByPk(categoryId);
        }
        if(!categoryRecord && category){
            categoryRecord = await Category.findOne({ where: { name: category } });
        }
        if(!categoryRecord){
            categoryRecord = await Category.create({ name: category || `Category ${Date.now()}` });
        }

        const created = await Product.create({
            product_id,
            description,
            category_id: categoryRecord.id,
            model,
            serial_no: serial_no || null,
            count: parsedCount,
            selling_price: parsedSelling,
            dealer_price: parsedDealer,
            vendor_id: parsedVendorId
        });

        res.status(201).json(created);
    }catch(err){
        res.status(500).json({ message: err.message || "Failed to save product." });
    }
};

exports.getLastProductByCategoryName = async (req,res)=>{
    const { categoryName } = req.params;
    if(!categoryName){
        return res.json(null);
    }

    const category = await Category.findOne({ where: { name: categoryName } });
    if(!category){
        return res.json(null);
    }

    const lastProduct = await Product.findOne({
        where: { category_id: category.id },
        order: [["createdAt","DESC"], ["id","DESC"]],
    });

    res.json(lastProduct || null);
};

exports.updateProduct = async (req,res)=>{
    try{
        const { id } = req.params;
        let {
            category,
            product_id,
            description,
            model,
            serial_no,
            count,
            selling_price,
            dealer_price,
            vendor_id
        } = req.body;

        const rawCategory = category;
        category = typeof category === "string" ? category.trim() : "";
        const parsedVendorId = Number(vendor_id);
        const parsedCount = toNum(count, 0);
        const parsedSelling = toNum(selling_price, 0);
        const parsedDealer = toNum(dealer_price, 0);

        product_id = String(product_id || "").trim();
        description = cleanUpper(description);
        model = cleanUpper(model);
        serial_no = cleanUpper(serial_no);

        if((!category && !Number.isFinite(Number(rawCategory))) || !description || !model || !Number.isFinite(parsedVendorId) || parsedVendorId <= 0){
            return res.status(400).json({ message: "Missing required fields." });
        }
        if(parsedCount < 0 || parsedSelling < 0 || parsedDealer < 0){
            return res.status(400).json({ message: "Count and prices cannot be negative." });
        }

        let categoryRecord = null;
        const categoryId = Number(rawCategory);
        if(Number.isFinite(categoryId) && categoryId > 0){
            categoryRecord = await Category.findByPk(categoryId);
        }
        if(!categoryRecord && category){
            categoryRecord = await Category.findOne({ where: { name: category } });
        }
        if(!categoryRecord){
            categoryRecord = await Category.create({ name: category || `Category ${Date.now()}` });
        }

        const product = await Product.findByPk(id);
        if(!product){
            return res.status(404).json({ message: "Product not found." });
        }

        await product.update({
            product_id: product_id || product.product_id,
            description,
            category_id: categoryRecord.id,
            model,
            serial_no: serial_no || null,
            count: parsedCount,
            selling_price: parsedSelling,
            dealer_price: parsedDealer,
            vendor_id: parsedVendorId
        });

        res.json(product);
    }catch(err){
        res.status(500).json({ message: err.message || "Failed to update product." });
    }
};

exports.deleteProduct = async (req,res)=>{
    try{
        const { id } = req.params;
        const product = await Product.findByPk(id);
        if(!product){
            return res.status(404).json({ message: "Product not found." });
        }
        const currentCount = Number(product.count) || 0;
        if(currentCount !== 0){
            return res.status(400).json({
                message: "Only products with quantity 0 can be deleted."
            });
        }
        const invoiceCount = await InvoiceItem.count({ where: { product_id: id } });
        if(invoiceCount > 0){
            return res.status(400).json({
                message: "Cannot delete product. Invoices are linked to this product."
            });
        }
        // Remove stock history rows for this product so zero-quantity cleanup can proceed.
        await Stock.destroy({ where: { product_id: id } });
        await product.destroy();
        res.json({ message: "Product deleted successfully." });
    }catch(err){
        res.status(500).json({ message: err.message || "Failed to delete product." });
    }
};
