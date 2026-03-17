const Product = require("../models/Product");
const Category = require("../models/Category");
const Stock = require("../models/Stock");
const Vendor = require("../models/Vendor");

const isTypeCheckViolation = (err) => {
  const constraint = err?.parent?.constraint || err?.original?.constraint || "";
  const msg = String(err?.message || "");
  return constraint === "stocks_type_check" || msg.includes("stocks_type_check");
};

const stockTypeCandidates = (action, change) => {
  if (action === "remove" || (action === "set" && change < 0)) {
    return ["out", "OUT", "remove", "REMOVE", "stock_out"];
  }
  return ["in", "IN", "add", "ADD", "stock_in"];
};

const createStockLogWithFallback = async ({ product_id, change, date, action }) => {
  const candidates = stockTypeCandidates(action, change);
  let lastErr = null;

  for (const type of candidates) {
    try {
      await Stock.create({ product_id, change, type, date });
      return type;
    } catch (err) {
      lastErr = err;
      if (!isTypeCheckViolation(err)) throw err;
    }
  }

  // If every candidate fails by the type check, skip logging and allow stock update.
  // This keeps stock management functional across legacy DB constraints.
  if (isTypeCheckViolation(lastErr)) {
    return null;
  }
  throw lastErr;
};

exports.getProductStocks = async (_req, res) => {
  try {
    const products = await Product.findAll({
      include: [
        { model: Category, attributes: ["id", "name"] },
        { model: Vendor, attributes: ["id", "name"] },
      ],
      order: [["id", "DESC"]],
    });
    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || "Failed to load product stocks." });
  }
};

exports.adjustProductStock = async (req, res) => {
  const productId = Number(req.body.product_id);
  const action = String(req.body.action || "").toLowerCase(); // add | remove | set
  const qty = Number(req.body.quantity);

  if (!Number.isFinite(productId) || !Number.isFinite(qty) || qty < 0) {
    return res.status(400).json({ message: "Invalid stock adjustment data." });
  }
  if (!["add", "remove", "set"].includes(action)) {
    return res.status(400).json({ message: "Invalid stock action." });
  }

  try {
    const product = await Product.findByPk(productId);
    if (!product) return res.status(404).json({ message: "Product not found." });

    const current = Number(product.count) || 0;
    let next = current;
    let change = 0;

    if (action === "add") {
      next = current + qty;
      change = qty;
    } else if (action === "remove") {
      if (qty > current) {
        return res.status(400).json({ message: "Cannot reduce stock below zero." });
      }
      next = current - qty;
      change = -qty;
    } else {
      next = qty;
      change = next - current;
    }

    product.count = next;
    await product.save();

    let stockType = null;
    try {
      stockType = await createStockLogWithFallback({
        product_id: product.id,
        change,
        date: new Date(),
        action,
      });
    } catch (stockErr) {
      console.error("Stock history log failed:", stockErr?.message || stockErr);
    }

    res.json({
      message: "Stock updated successfully.",
      product_id: product.id,
      previous_count: current,
      new_count: next,
      change,
      type: stockType,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || "Failed to adjust stock." });
  }
};
