require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const db = require("./config/database");
const { getRuntimeChecks, summarizeStatus } = require("./utils/startupChecks");

// Models
const User = require("./models/User");
const Product = require("./models/Product");
const Category = require("./models/Category");
const Customer = require("./models/Customer");
const Vendor = require("./models/Vendor");
const Invoice = require("./models/Invoice");
const InvoiceItem = require("./models/InvoiceItem");
const InvoiceImportant = require("./models/InvoiceImportant");
const Expense = require("./models/Expense");
const Stock = require("./models/Stock");
const Condition = require("./models/Condition");
const Message = require("./models/Message");
const Notification = require("./models/Notification");
const Todo = require("./models/Todo");
const RentalMachine = require("./models/RentalMachine");
const GeneralMachine = require("./models/GeneralMachine");
const RentalMachineConsumable = require("./models/RentalMachineConsumable");
const RentalMachineCount = require("./models/RentalMachineCount");
const Technician = require("./models/Technician");
const SupportImportant = require("./models/SupportImportant");
const CategoryModelOption = require("./models/CategoryModelOption");
const UiSetting = require("./models/UiSetting");
const EmailSetup = require("./models/EmailSetup");
const UserAccess = require("./models/UserAccess");

// Routes
const dashboardRoutes = require("./routes/dashboardRoutes");
const productRoutes = require("./routes/productRoutes");
const customerRoutes = require("./routes/customerRoutes");
const vendorRoutes = require("./routes/vendorRoutes");
const invoiceRoutes = require("./routes/invoiceRoutes");
const conditionRoutes = require("./routes/conditionRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const expenseRoutes = require("./routes/expenseRoutes");
const stockRoutes = require("./routes/stockRoutes");
const reportRoutes = require("./routes/reportRoutes");
const messageRoutes = require("./routes/messageRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const todoRoutes = require("./routes/todoRoutes");
const rentalMachineRoutes = require("./routes/rentalMachineRoutes");
const generalMachineRoutes = require("./routes/generalMachineRoutes");
const rentalMachineConsumableRoutes = require("./routes/rentalMachineConsumableRoutes");
const rentalMachineCountRoutes = require("./routes/rentalMachineCountRoutes");
const technicianRoutes = require("./routes/technicianRoutes");
const supportImportantRoutes = require("./routes/supportImportantRoutes");
const categoryModelOptionRoutes = require("./routes/categoryModelOptionRoutes");
const uiSettingsRoutes = require("./routes/uiSettingsRoutes");
const emailSetupRoutes = require("./routes/emailSetupRoutes");
const systemBackupRoutes = require("./routes/systemBackupRoutes");

const authRoutes = require("./routes/authRoutes"); // login, forgot password
const userRoutes = require("./routes/userRoutes"); // admin only user management

const app = express();
let appHealth = {
  ok: false,
  dbConnected: false,
  checks: null,
  startedAt: null,
};

async function ensureDefaultUsers() {
  const defaults = [
    {
      username: "admin",
      company: "IT Corp",
      department: "IT",
      telephone: "1234567890",
      email: "admin@example.com",
      role: "admin",
      password: "admin123",
    },
    {
      username: "manager",
      company: "IT Corp",
      department: "Sales",
      telephone: "0987654321",
      email: "manager@example.com",
      role: "manager",
      password: "manager123",
    },
    {
      username: "user",
      company: "IT Corp",
      department: "Sales",
      telephone: "0112233445",
      email: "user@example.com",
      role: "user",
      password: "user123",
    },
  ];

  for (const item of defaults) {
    const existing = await User.findOne({ where: { email: item.email } });
    if (!existing) {
      const hashed = await bcrypt.hash(item.password, 10);
      await User.create({
        username: item.username,
        company: item.company,
        department: item.department,
        telephone: item.telephone,
        email: item.email,
        role: item.role,
        password: hashed,
      });
    }
  }
}

async function ensureDefaultCategories() {
  const defaults = [
    "Photocopier",
    "Printer",
    "Plotter",
    "Computer",
    "Laptop",
    "Accessory",
    "Consumable",
    "Machine",
    "Service",
  ];

  for (const name of defaults) {
    const existing = await Category.findOne({ where: { name } });
    if (!existing) {
      await Category.create({ name });
    }
  }
}

async function ensureDefaultUiSettings() {
  const first = await UiSetting.findOne({ order: [["id", "ASC"]] });
  if (!first) {
    await UiSetting.create({
      app_name: "PULMO TECHNOLOGIES",
      footer_text: "© All Right Recieved with CRONIT SOLLUTIONS - JMR Prasanna.",
      primary_color: "#0f6abf",
      accent_color: "#11a36f",
    });
    return;
  }

  const currentAppName = String(first.app_name || "").trim().toLowerCase();
  if (currentAppName === "pulmotech_inhouse" || currentAppName === "ulmotech_inhouse") {
    await first.update({ app_name: "PULMO TECHNOLOGIES" });
  }
}

async function ensureDefaultCategoryModelOptions() {
  const categoryModels = {
    Accessory: ["CANON", "TOSHIBA", "RECOH", "SHARP", "KYOCERA", "SEROX", "SAMSUNG", "HP", "DELL"],
    Consumable: ["CANON", "TOSHIBA", "RECOH", "SHARP", "KYOCERA", "SEROX", "SAMSUNG", "HP", "DELL"],
    Machine: ["CANON", "TOSHIBA", "RECOH", "SHARP", "KYOCERA", "SEROX", "SAMSUNG", "HP", "DELL"],
    Photocopier: ["CANON", "TOSHIBA", "RECOH", "SHARP", "KYOCERA", "SEROX", "SAMSUNG", "HP", "DELL"],
    Printer: ["CANON", "HP", "EPSON", "BROTHER", "OTHER", "SEROX", "SAMSUNG"],
    Computer: ["HP", "DELL", "ASUS", "SONY", "SINGER", "SAMSUNG", "OTHER"],
    Laptop: ["HP", "DELL", "ASUS", "SONY", "SINGER", "SAMSUNG", "OTHER"],
    Plotter: ["CANON", "HP", "EPSON", "OTHER"],
    Service: ["OTHER"],
  };

  for (const [categoryName, models] of Object.entries(categoryModels)) {
    for (const modelName of models) {
      const existing = await CategoryModelOption.findOne({
        where: { category_name: categoryName, model_name: modelName },
      });
      if (!existing) {
        await CategoryModelOption.create({
          category_name: categoryName,
          model_name: modelName,
        });
      }
    }
  }
}

async function ensureRentalConsumableSchema() {
  await db.query(`
    ALTER TABLE rental_machine_consumables
    ALTER COLUMN rental_machine_id DROP NOT NULL;
  `);

  await db.query(`
    ALTER TABLE rental_machine_consumables
    ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id);
  `);

  await db.query(`
    ALTER TABLE rental_machine_consumables
    ADD COLUMN IF NOT EXISTS save_batch_id VARCHAR(50);
  `);

  await db.query(`
    ALTER TABLE rental_machine_consumables
    ADD COLUMN IF NOT EXISTS count INTEGER DEFAULT 0;
  `);
}

async function ensureRentalMachineCountSchema() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS rental_machine_counts (
      id SERIAL PRIMARY KEY,
      transaction_id VARCHAR(50) NOT NULL UNIQUE,
      rental_machine_id INTEGER NOT NULL REFERENCES rental_machines(id) ON DELETE CASCADE,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      input_count INTEGER DEFAULT 0,
      updated_count INTEGER DEFAULT 0,
      "createdAt" TIMESTAMP DEFAULT NOW(),
      "updatedAt" TIMESTAMP DEFAULT NOW()
    );
  `);

  await db.query(`
    ALTER TABLE rental_machine_counts
    ADD COLUMN IF NOT EXISTS input_count INTEGER DEFAULT 0;
  `);

  await db.query(`
    ALTER TABLE rental_machine_counts
    ADD COLUMN IF NOT EXISTS updated_count INTEGER DEFAULT 0;
  `);
}

// Middleware
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({extended:true}));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/products", productRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/vendors", vendorRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/invoices/conditions", conditionRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/stocks", stockRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/todos", todoRoutes);
app.use("/api/rental-machines", rentalMachineRoutes);
app.use("/api/general-machines", generalMachineRoutes);
app.use("/api/rental-machine-consumables", rentalMachineConsumableRoutes);
app.use("/api/rental-machine-counts", rentalMachineCountRoutes);
app.use("/api/technicians", technicianRoutes);
app.use("/api/support-importants", supportImportantRoutes);
app.use("/api/category-model-options", categoryModelOptionRoutes);
app.use("/api/ui-settings", uiSettingsRoutes);
app.use("/api/email-setup", emailSetupRoutes);
app.use("/api/system-backup", systemBackupRoutes);

// Test route
app.get("/",(req,res)=>res.send("PULMO TECHNOLOGIES is running"));
app.get("/api/health", (_req, res) => {
  const statusCode = appHealth.ok ? 200 : 503;
  res.status(statusCode).json({
    ...appHealth,
    now: new Date().toISOString(),
  });
});

// Database sync and server start
const PORT = Number(process.env.PORT || 5000);
const AUTO_DB_SYNC = String(process.env.AUTO_DB_SYNC || "true").toLowerCase() !== "false";
const DB_SYNC_ALTER = String(process.env.DB_SYNC_ALTER || "true").toLowerCase() !== "false";
const DB_SYNC_FORCE = String(process.env.DB_SYNC_FORCE || "false").toLowerCase() === "true";

async function startServer() {
  try {
    if (AUTO_DB_SYNC) {
      const syncOptions = DB_SYNC_FORCE ? { force: true } : { alter: DB_SYNC_ALTER };
      await db.sync(syncOptions);
      console.log(`Database sync completed (${DB_SYNC_FORCE ? "force=true" : `alter=${DB_SYNC_ALTER}`})`);
    } else {
      await db.authenticate();
      console.log("Database connection verified (AUTO_DB_SYNC=false)");
    }

    await ensureRentalConsumableSchema();
    await ensureRentalMachineCountSchema();
    await ensureDefaultUsers();
    await ensureDefaultCategories();
    await ensureDefaultCategoryModelOptions();
    await ensureDefaultUiSettings();

    const checks = await getRuntimeChecks();
    appHealth = {
      ...summarizeStatus(checks, true),
      startedAt: new Date().toISOString(),
      sync: {
        auto: AUTO_DB_SYNC,
        alter: DB_SYNC_ALTER,
        force: DB_SYNC_FORCE,
      },
    };

    if (!appHealth.ok) {
      console.warn("Startup checks report missing dependencies. Check /api/health for details.");
    }

    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (err) {
    const checks = await getRuntimeChecks().catch(() => null);
    appHealth = {
      ...(checks ? summarizeStatus(checks, false) : { ok: false, dbConnected: false, checks: null }),
      startedAt: new Date().toISOString(),
      dbError: String(err && err.message ? err.message : err),
      sync: {
        auto: AUTO_DB_SYNC,
        alter: DB_SYNC_ALTER,
        force: DB_SYNC_FORCE,
      },
    };
    console.error("Startup failed:", err);
  }
}

startServer();
