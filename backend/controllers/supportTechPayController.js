const fs = require("fs");
const path = require("path");
const Sequelize = require("sequelize");
const Invoice = require("../models/Invoice");
const InvoiceItem = require("../models/InvoiceItem");
const Product = require("../models/Product");
const Customer = require("../models/Customer");
const SupportTechPay = require("../models/SupportTechPay");
const db = require("../config/database");

const Op = Sequelize.Op;
const STORAGE_ROOT = path.resolve(__dirname, "../storage/support-tech-pay");
const IMAGE_MIME_EXTENSIONS = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/bmp": ".bmp",
  "image/webp": ".webp",
};
const EXTENSION_MIME_MAP = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

function normalizePaymentMethod(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "online") return "Online";
  if (raw === "cheque") return "Cheque";
  return "Cash";
}

function normalizePaymentStatus(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "paid") return "Paid";
  return "Pending";
}

function toAmount(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return Number(fallback || 0);
  }
  return Number(parsed.toFixed(2));
}

function calculateVendorPayAmount(items) {
  const sum = (items || []).reduce((acc, item) => {
    const qty = Number(item?.qty || 0);
    const dealer = Number(item?.Product?.dealer_price || 0);
    return acc + qty * dealer;
  }, 0);
  return Number(sum.toFixed(2));
}

function calculateSupportTechPayAmount(invoice, vendorPayAmount = 0) {
  const total = Number(invoice?.total_amount || 0);
  const percentage = Number(invoice?.support_technician_percentage || 0);
  const vendor = Number(vendorPayAmount || 0);
  if (!Number.isFinite(total) || !Number.isFinite(percentage) || !Number.isFinite(vendor)) return 0;
  const payableBase = Math.max(total - vendor, 0);
  return Number(((payableBase * percentage) / 100).toFixed(2));
}

function getRequestDbName(req) {
  const normalized = db.normalizeDatabaseName(
    req?.databaseName || req?.user?.database_name || req?.headers?.["x-database-name"]
  );
  return normalized || "inventory";
}

function ensureStorageDir(req) {
  const dbName = getRequestDbName(req);
  const dir = path.join(STORAGE_ROOT, dbName);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return { dbName, dir };
}

function parseBase64Image(fileDataBase64) {
  const raw = String(fileDataBase64 || "").trim();
  if (!raw) return null;

  let mime = "image/jpeg";
  let payload = raw;
  const dataUrlMatch = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (dataUrlMatch) {
    mime = String(dataUrlMatch[1] || "").toLowerCase();
    payload = String(dataUrlMatch[2] || "");
  }

  const ext = IMAGE_MIME_EXTENSIONS[mime];
  if (!ext) {
    throw new Error("Unsupported image type. Allowed: JPG, PNG, GIF, BMP, WEBP.");
  }

  const buffer = Buffer.from(payload, "base64");
  if (!buffer.length) {
    throw new Error("Payment proof image is empty.");
  }

  return { buffer, ext };
}

function parseBase64Pdf(fileDataBase64) {
  const raw = String(fileDataBase64 || "").trim();
  if (!raw) return null;

  let payload = raw;
  const dataUrlMatch = raw.match(/^data:application\/pdf(?:;[^,]*)?;base64,(.+)$/i);
  if (dataUrlMatch) {
    payload = String(dataUrlMatch[1] || "");
  }

  const buffer = Buffer.from(payload, "base64");
  if (!buffer.length) {
    throw new Error("Generated PDF is empty.");
  }

  return { buffer, ext: ".pdf" };
}

function toPublicImageUrl(relPath) {
  const clean = String(relPath || "").trim().replace(/\\/g, "/");
  if (!clean) return "";

  const lower = clean.toLowerCase();
  const storageMarker = "/storage/";
  const markerIndex = lower.lastIndexOf(storageMarker);
  if (markerIndex !== -1) {
    const tail = clean.slice(markerIndex + storageMarker.length).replace(/^\/+/, "");
    return tail ? `/storage/${tail}` : "";
  }

  let normalized = clean.replace(/^\/+/, "");
  if (normalized.toLowerCase().startsWith("storage/")) {
    normalized = normalized.slice("storage/".length);
  }

  return normalized ? `/storage/${normalized}` : "";
}

function resolveStoredImageAbsolutePath(storedPath) {
  const raw = String(storedPath || "").trim();
  if (!raw) return "";

  const normalized = raw.replace(/\\/g, "/");
  const lower = normalized.toLowerCase();
  const storageRoot = path.resolve(__dirname, "../storage");
  const candidates = [];

  if (path.isAbsolute(raw)) {
    candidates.push(path.resolve(raw));
  }

  const marker = "/storage/";
  const markerIndex = lower.lastIndexOf(marker);
  if (markerIndex !== -1) {
    const rel = normalized.slice(markerIndex + marker.length).replace(/^\/+/, "");
    if (rel) candidates.push(path.resolve(storageRoot, rel));
  }

  let relPath = normalized.replace(/^\/+/, "");
  if (relPath.toLowerCase().startsWith("storage/")) {
    relPath = relPath.slice("storage/".length);
  }
  if (relPath) {
    candidates.push(path.resolve(storageRoot, relPath));
  }

  for (const abs of candidates) {
    try {
      if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
        return abs;
      }
    } catch (_err) {
    }
  }

  return "";
}

function getMimeTypeFromPath(filePath) {
  const ext = path.extname(String(filePath || "").toLowerCase());
  return EXTENSION_MIME_MAP[ext] || "application/octet-stream";
}

function deleteStoredFileIfExists(relPath) {
  const clean = String(relPath || "").trim();
  if (!clean) return;
  const absolute = path.resolve(__dirname, "../storage", clean);
  const normalizedStorageRoot = path.resolve(STORAGE_ROOT);
  if (!absolute.startsWith(normalizedStorageRoot)) return;
  if (fs.existsSync(absolute)) {
    fs.unlinkSync(absolute);
  }
}

function supportTechWhereClause() {
  return {
    [Op.and]: [
      { support_technician: { [Op.not]: null } },
      Sequelize.where(Sequelize.fn("TRIM", Sequelize.col("support_technician")), {
        [Op.ne]: "",
      }),
    ],
  };
}

async function loadInvoiceWithItems(invoiceId) {
  return Invoice.findByPk(invoiceId, {
    include: [
      { model: Customer, attributes: ["id", "name", "customer_mode", "address", "tel"] },
      {
        model: InvoiceItem,
        attributes: ["id", "qty", "rate", "vat", "gross", "product_id"],
        include: [
          {
            model: Product,
            attributes: ["id", "product_id", "description", "model", "dealer_price", "selling_price"],
          },
        ],
      },
    ],
  });
}

exports.listSupportTechPayInvoices = async (req, res) => {
  try {
    const invoices = await Invoice.findAll({
      where: supportTechWhereClause(),
      include: [
        { model: Customer, attributes: ["id", "name"] },
        {
          model: InvoiceItem,
          attributes: ["id", "qty"],
          include: [{ model: Product, attributes: ["id", "dealer_price"] }],
        },
      ],
      order: [["invoice_date", "DESC"], ["createdAt", "DESC"]],
    });

    const invoiceIds = invoices.map((inv) => inv.id);
    const payRecords = invoiceIds.length
      ? await SupportTechPay.findAll({ where: { invoice_id: { [Op.in]: invoiceIds } } })
      : [];
    const payMap = new Map(payRecords.map((row) => [row.invoice_id, row]));

    const rows = invoices.map((inv) => {
      const vendorPayAmountDefault = calculateVendorPayAmount(inv.InvoiceItems || []);
      const record = payMap.get(inv.id);
      const status = record ? normalizePaymentStatus(record.payment_status) : "Pending";
      const vendorAmount = toAmount(record?.vendor_pay_amount, vendorPayAmountDefault);
      const supportAmount = calculateSupportTechPayAmount(inv, vendorAmount);

      return {
        invoice_id: inv.id,
        invoice_no: inv.invoice_no || "",
        customer_name: inv.Customer?.name || "",
        invoice_date: inv.invoice_date || inv.createdAt || null,
        support_technician: String(inv.support_technician || "").trim(),
        support_technician_percentage: Number(inv.support_technician_percentage || 0),
        total_amount: toAmount(inv.total_amount, 0),
        vendor_pay_amount: vendorAmount,
        support_tech_pay_amount: supportAmount,
        payment_status: status,
        payment_method: normalizePaymentMethod(record?.payment_method || "Cash"),
      };
    });

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || "Failed to load support technician payments." });
  }
};

exports.getSupportTechPayInvoice = async (req, res) => {
  const invoiceId = Number(req.params.invoiceId);
  const includeImageBase64 = String(req.query?.include_image_base64 || "").trim() === "1";
  if (!Number.isFinite(invoiceId) || invoiceId <= 0) {
    return res.status(400).json({ message: "Invalid invoice id." });
  }

  try {
    const invoice = await loadInvoiceWithItems(invoiceId);
    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found." });
    }
    if (!String(invoice.support_technician || "").trim()) {
      return res.status(400).json({ message: "This invoice has no support technician assigned." });
    }

    const payRecord = await SupportTechPay.findOne({ where: { invoice_id: invoice.id } });
    const vendorPayAmountDefault = calculateVendorPayAmount(invoice.InvoiceItems || []);
    const vendorPayAmount = toAmount(payRecord?.vendor_pay_amount, vendorPayAmountDefault);
    const supportPayAmount = calculateSupportTechPayAmount(invoice, vendorPayAmount);

    let paymentProofImageBase64 = "";
    let paymentProofImageMime = "";
    if (includeImageBase64) {
      const storedImagePath = String(payRecord?.payment_proof_image_path || "").trim();
      if (storedImagePath) {
        const absPath = resolveStoredImageAbsolutePath(storedImagePath);
        if (absPath) {
          try {
            const buffer = fs.readFileSync(absPath);
            if (buffer && buffer.length) {
              paymentProofImageBase64 = buffer.toString("base64");
              paymentProofImageMime = getMimeTypeFromPath(absPath);
            }
          } catch (_err) {
          }
        }
      }
    }

    const items = (invoice.InvoiceItems || []).map((item) => {
      const qty = Number(item.qty || 0);
      const sellRate = Number(item.rate || 0);
      const dealerPrice = Number(item.Product?.dealer_price || 0);
      const lineSellTotal = Number((qty * sellRate).toFixed(2));
      const lineVendorTotal = Number((qty * dealerPrice).toFixed(2));
      return {
        id: item.id,
        product_id: item.Product?.product_id || "",
        description: item.Product?.description || "",
        model: item.Product?.model || "",
        qty,
        sell_rate: sellRate,
        dealer_price: dealerPrice,
        line_sell_total: lineSellTotal,
        line_vendor_total: lineVendorTotal,
        vat: Number(item.vat || 0),
        gross: Number(item.gross || 0),
      };
    });

    res.json({
      invoice: {
        id: invoice.id,
        invoice_no: invoice.invoice_no || "",
        invoice_date: invoice.invoice_date || invoice.createdAt || null,
        customer_name: invoice.Customer?.name || "",
        customer_mode: invoice.Customer?.customer_mode || "",
        support_technician: String(invoice.support_technician || "").trim(),
        support_technician_percentage: Number(invoice.support_technician_percentage || 0),
        total_amount: toAmount(invoice.total_amount, 0),
      },
      items,
      payment: {
        vendor_pay_amount: vendorPayAmount,
        support_tech_pay_amount: supportPayAmount,
        payment_method: normalizePaymentMethod(payRecord?.payment_method || "Cash"),
        payment_status: payRecord ? normalizePaymentStatus(payRecord.payment_status) : "Pending",
        payment_proof_image_url: toPublicImageUrl(payRecord?.payment_proof_image_path || ""),
        payment_proof_image_path: String(payRecord?.payment_proof_image_path || ""),
        payment_proof_pdf_url: toPublicImageUrl(payRecord?.payment_proof_pdf_path || ""),
        payment_proof_pdf_path: String(payRecord?.payment_proof_pdf_path || ""),
        payment_proof_image_base64: paymentProofImageBase64,
        payment_proof_image_mime: paymentProofImageMime,
        paid_at: payRecord?.paid_at || null,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || "Failed to load support technician payment detail." });
  }
};

exports.updateSupportTechPayInvoice = async (req, res) => {
  const invoiceId = Number(req.params.invoiceId);
  if (!Number.isFinite(invoiceId) || invoiceId <= 0) {
    return res.status(400).json({ message: "Invalid invoice id." });
  }

  try {
    const invoice = await loadInvoiceWithItems(invoiceId);
    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found." });
    }
    if (!String(invoice.support_technician || "").trim()) {
      return res.status(400).json({ message: "This invoice has no support technician assigned." });
    }

    const defaultVendor = calculateVendorPayAmount(invoice.InvoiceItems || []);
    const existing = await SupportTechPay.findOne({ where: { invoice_id: invoice.id } });

    const vendorPayAmount = req.body.vendor_pay_amount !== undefined
      ? toAmount(req.body.vendor_pay_amount, defaultVendor)
      : toAmount(existing?.vendor_pay_amount, defaultVendor);
    const supportTechPayAmount = calculateSupportTechPayAmount(invoice, vendorPayAmount);
    const paymentMethod = req.body.payment_method !== undefined
      ? normalizePaymentMethod(req.body.payment_method)
      : normalizePaymentMethod(existing?.payment_method || "Cash");
    const paymentStatus = req.body.payment_status !== undefined
      ? normalizePaymentStatus(req.body.payment_status)
      : "Paid";

    let paymentProofImagePath = String(existing?.payment_proof_image_path || "").trim() || null;
    let paymentProofPdfPath = String(existing?.payment_proof_pdf_path || "").trim() || null;
    if (req.body.clear_payment_image === true && paymentProofImagePath) {
      deleteStoredFileIfExists(paymentProofImagePath);
      paymentProofImagePath = null;
    }
    if (req.body.clear_payment_pdf === true && paymentProofPdfPath) {
      deleteStoredFileIfExists(paymentProofPdfPath);
      paymentProofPdfPath = null;
    }

    if (req.body.payment_proof_image_base64 !== undefined && String(req.body.payment_proof_image_base64 || "").trim()) {
      const parsedImage = parseBase64Image(req.body.payment_proof_image_base64);
      const { dbName, dir } = ensureStorageDir(req);
      const fileName = `invoice_${invoice.id}_${Date.now()}${parsedImage.ext}`;
      const targetPath = path.join(dir, fileName);
      fs.writeFileSync(targetPath, parsedImage.buffer);

      if (paymentProofImagePath) {
        deleteStoredFileIfExists(paymentProofImagePath);
      }
      paymentProofImagePath = path.posix.join("support-tech-pay", dbName, fileName);
    }

    if (req.body.payment_proof_pdf_base64 !== undefined && String(req.body.payment_proof_pdf_base64 || "").trim()) {
      const parsedPdf = parseBase64Pdf(req.body.payment_proof_pdf_base64);
      const { dbName, dir } = ensureStorageDir(req);
      const fileName = `invoice_${invoice.id}_${Date.now()}${parsedPdf.ext}`;
      const targetPath = path.join(dir, fileName);
      fs.writeFileSync(targetPath, parsedPdf.buffer);

      if (paymentProofPdfPath) {
        deleteStoredFileIfExists(paymentProofPdfPath);
      }
      paymentProofPdfPath = path.posix.join("support-tech-pay", dbName, fileName);
    }

    const paidAtRaw = String(req.body.paid_at || "").trim();
    const paidAt = paymentStatus === "Paid"
      ? (/^\d{4}-\d{2}-\d{2}$/.test(paidAtRaw) ? paidAtRaw : new Date().toISOString().slice(0, 10))
      : null;

    let row = existing;
    if (!row) {
      row = await SupportTechPay.create({
        invoice_id: invoice.id,
        vendor_pay_amount: vendorPayAmount,
        support_tech_pay_amount: supportTechPayAmount,
        payment_method: paymentMethod,
        payment_status: paymentStatus,
        payment_proof_image_path: paymentProofImagePath,
        payment_proof_pdf_path: paymentProofPdfPath,
        paid_at: paidAt,
      });
    } else {
      await row.update({
        vendor_pay_amount: vendorPayAmount,
        support_tech_pay_amount: supportTechPayAmount,
        payment_method: paymentMethod,
        payment_status: paymentStatus,
        payment_proof_image_path: paymentProofImagePath,
        payment_proof_pdf_path: paymentProofPdfPath,
        paid_at: paidAt,
      });
    }

    res.json({
      message: "Support technician payment updated successfully.",
      payment: {
        invoice_id: row.invoice_id,
        vendor_pay_amount: toAmount(row.vendor_pay_amount, 0),
        support_tech_pay_amount: toAmount(row.support_tech_pay_amount, 0),
        payment_method: normalizePaymentMethod(row.payment_method),
        payment_status: normalizePaymentStatus(row.payment_status),
        payment_proof_image_url: toPublicImageUrl(row.payment_proof_image_path || ""),
        payment_proof_image_path: String(row.payment_proof_image_path || ""),
        payment_proof_pdf_url: toPublicImageUrl(row.payment_proof_pdf_path || ""),
        payment_proof_pdf_path: String(row.payment_proof_pdf_path || ""),
        paid_at: row.paid_at || null,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || "Failed to update support technician payment." });
  }
};

exports.deleteSupportTechPayInvoice = async (req, res) => {
  const invoiceId = Number(req.params.invoiceId);
  if (!Number.isFinite(invoiceId) || invoiceId <= 0) {
    return res.status(400).json({ message: "Invalid invoice id." });
  }

  try {
    const invoice = await loadInvoiceWithItems(invoiceId);
    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found." });
    }

    const row = await SupportTechPay.findOne({ where: { invoice_id: invoice.id } });
    if (!row) {
      return res.status(404).json({ message: "Support technician payment not found." });
    }

    const storedImagePath = String(row.payment_proof_image_path || "").trim();
    if (storedImagePath) {
      deleteStoredFileIfExists(storedImagePath);
    }
    const storedPdfPath = String(row.payment_proof_pdf_path || "").trim();
    if (storedPdfPath) {
      deleteStoredFileIfExists(storedPdfPath);
    }

    const vendorPayAmount = calculateVendorPayAmount(invoice.InvoiceItems || []);
    const supportTechPayAmount = calculateSupportTechPayAmount(invoice, vendorPayAmount);

    await row.update({
      vendor_pay_amount: vendorPayAmount,
      support_tech_pay_amount: supportTechPayAmount,
      payment_method: "Cash",
      payment_status: "Pending",
      payment_proof_image_path: null,
      payment_proof_pdf_path: null,
      paid_at: null,
    });

    res.json({ message: "Support technician payment reset to pending successfully." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || "Failed to delete support technician payment." });
  }
};

exports.getSupportTechPayProofImage = async (req, res) => {
  const invoiceId = Number(req.params.invoiceId);
  if (!Number.isFinite(invoiceId) || invoiceId <= 0) {
    return res.status(400).json({ message: "Invalid invoice id." });
  }

  try {
    const row = await SupportTechPay.findOne({ where: { invoice_id: invoiceId } });
    if (!row) {
      return res.status(404).json({ message: "Support technician payment not found." });
    }

    const storedPath = String(row.payment_proof_image_path || "").trim();
    if (!storedPath) {
      return res.status(404).json({ message: "Payment proof image not found." });
    }

    const absPath = resolveStoredImageAbsolutePath(storedPath);
    if (!absPath || !fs.existsSync(absPath)) {
      return res.status(404).json({ message: "Payment proof image file is missing." });
    }

    res.setHeader("Content-Type", getMimeTypeFromPath(absPath));
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(absPath);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || "Failed to load payment proof image." });
  }
};
