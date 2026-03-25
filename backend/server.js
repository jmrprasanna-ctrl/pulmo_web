require("dotenv").config();
const express = require("express");
const cors = require("cors");
const db = require("./config/database");
const { getRuntimeChecks, summarizeStatus } = require("./utils/startupChecks");
const { extractCustomerPrefix } = require("./utils/customerCodeGenerator");

// Models
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
const UserLoginLog = require("./models/UserLoginLog");

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
const preferenceRoutes = require("./routes/preferenceRoutes");

const authRoutes = require("./routes/authRoutes"); // login, forgot password
const userRoutes = require("./routes/userRoutes"); // admin only user management

const app = express();
let appHealth = {
  ok: false,
  dbConnected: false,
  checks: null,
  startedAt: null,
};

async function runOnBusinessDatabases(task) {
  await db.withDatabase("inventory", async () => {
    await task("inventory");
  });
  await db.withDatabase("demo", async () => {
    await task("demo");
  });
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
    "CCTV",
    "Duplo",
    "Other",
    "Service",
  ];

  await runOnBusinessDatabases(async () => {
    for (const name of defaults) {
      const existing = await Category.findOne({ where: { name } });
      if (!existing) {
        await Category.create({ name });
      }
    }
  });
}

async function ensureDefaultUiSettings() {
  await runOnBusinessDatabases(async () => {
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
  });
}

async function ensureDefaultCategoryModelOptions() {
  const categoryModels = {
    Accessory: ["CANON", "TOSHIBA", "RECOH", "SHARP", "KYOCERA", "SEROX", "SAMSUNG", "HP", "DELL"],
    Consumable: ["CANON", "TOSHIBA", "RECOH", "SHARP", "KYOCERA", "SEROX", "SAMSUNG", "HP", "DELL"],
    Machine: ["CANON", "TOSHIBA", "RECOH", "SHARP", "KYOCERA", "SEROX", "SAMSUNG", "HP", "DELL"],
    Photocopier: ["CANON", "TOSHIBA", "RECOH", "SHARP", "KYOCERA", "SEROX", "SAMSUNG", "HP", "DELL"],
    Printer: ["CANON", "HP", "EPSON", "BROTHER", "LEXMARK", "OTHER", "SEROX", "SAMSUNG"],
    Computer: ["HP", "DELL", "ASUS", "SONY", "SINGER", "SAMSUNG", "SPARE PARTS", "OTHER"],
    Laptop: ["HP", "DELL", "ASUS", "SONY", "SINGER", "SAMSUNG", "SPARE PARTS", "OTHER"],
    Plotter: ["CANON", "HP", "EPSON", "OTHER"],
    CCTV: ["HICKVISION", "DAHUA", "OTHER"],
    Duplo: ["RONGDA", "RISO", "RECOH", "DUPLO"],
    Other: ["OTHER"],
    Service: ["OTHER"],
  };

  await runOnBusinessDatabases(async () => {
    // Data normalization for renamed Duplo model labels.
    await db.query(`
      DELETE FROM category_model_options
      WHERE category_name = 'Duplo' AND model_name = 'CANON'
        AND EXISTS (
          SELECT 1 FROM category_model_options
          WHERE category_name = 'Duplo' AND model_name = 'RONGDA'
        );
    `);
    await db.query(`
      UPDATE category_model_options
      SET model_name = 'RONGDA'
      WHERE category_name = 'Duplo' AND model_name = 'CANON';
    `);

    await db.query(`
      DELETE FROM category_model_options
      WHERE category_name = 'Duplo' AND model_name = 'TOSHIBA'
        AND EXISTS (
          SELECT 1 FROM category_model_options
          WHERE category_name = 'Duplo' AND model_name = 'RISO'
        );
    `);
    await db.query(`
      UPDATE category_model_options
      SET model_name = 'RISO'
      WHERE category_name = 'Duplo' AND model_name = 'TOSHIBA';
    `);

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
  });
}

async function ensureRentalConsumableSchema() {
  await runOnBusinessDatabases(async () => {
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
    await db.query(`
      ALTER TABLE rental_machine_consumables
      ADD COLUMN IF NOT EXISTS entry_date DATE;
    `);
    await db.query(`
      UPDATE rental_machine_consumables
      SET entry_date = COALESCE(entry_date, DATE("createdAt"), CURRENT_DATE)
      WHERE entry_date IS NULL;
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS rental_machine_consumables_entry_date_idx
      ON rental_machine_consumables(entry_date);
    `);
  });
}

async function ensureRentalMachineCountSchema() {
  await runOnBusinessDatabases(async () => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS rental_machine_counts (
        id SERIAL PRIMARY KEY,
        transaction_id VARCHAR(50) NOT NULL UNIQUE,
        rental_machine_id INTEGER NOT NULL REFERENCES rental_machines(id) ON DELETE CASCADE,
        customer_id INTEGER NOT NULL REFERENCES customers(id),
        input_count INTEGER DEFAULT 0,
        updated_count INTEGER DEFAULT 0,
        entry_date DATE,
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
    await db.query(`
      ALTER TABLE rental_machine_counts
      ADD COLUMN IF NOT EXISTS entry_date DATE;
    `);
    await db.query(`
      UPDATE rental_machine_counts
      SET entry_date = COALESCE(entry_date, DATE("createdAt"), CURRENT_DATE)
      WHERE entry_date IS NULL;
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS rental_machine_counts_entry_date_idx
      ON rental_machine_counts(entry_date);
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS rental_machine_counts_customer_created_idx
      ON rental_machine_counts(customer_id, "createdAt");
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS rental_machine_counts_machine_created_idx
      ON rental_machine_counts(rental_machine_id, "createdAt");
    `);
  });
}

async function ensureCustomerCodeSchema() {
  await runOnBusinessDatabases(async () => {
    await db.query(`
      ALTER TABLE customers
      ADD COLUMN IF NOT EXISTS customer_id VARCHAR(20);
    `);
    await db.query(`
      ALTER TABLE customers
      ADD COLUMN IF NOT EXISTS contact_person VARCHAR(100);
    `);

    await db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS customers_customer_id_unique_idx
      ON customers(customer_id)
      WHERE customer_id IS NOT NULL;
    `);

    const allCustomers = await Customer.findAll({
      order: [["id", "ASC"]],
    });

    await db.transaction(async (transaction) => {
      // Step 1: assign temporary unique codes to avoid collisions during re-numbering.
      for (const customer of allCustomers) {
        await customer.update({ customer_id: `TMP${customer.id}` }, { transaction });
      }

      // Step 2: assign final codes using the requested initials rule, by creation order (id).
      const prefixCounters = Object.create(null);
      for (const customer of allCustomers) {
        const prefix = extractCustomerPrefix(customer.name);
        const nextNumber = (prefixCounters[prefix] || 0) + 1;
        prefixCounters[prefix] = nextNumber;
        const finalCode = `${prefix}${String(nextNumber).padStart(2, "0")}`;
        await customer.update({ customer_id: finalCode }, { transaction });
      }
    });
  });
}

async function ensureInvoiceDateSchema() {
  await runOnBusinessDatabases(async () => {
    await db.query(`
      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS invoice_date DATE;
    `);
    await db.query(`
      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS quotation_date DATE;
    `);

    await db.query(`
      UPDATE invoices
      SET invoice_date = COALESCE(invoice_date, DATE("createdAt"), CURRENT_DATE)
      WHERE invoice_date IS NULL;
    `);
    await db.query(`
      UPDATE invoices
      SET quotation_date = COALESCE(quotation_date, invoice_date, DATE("createdAt"), CURRENT_DATE)
      WHERE quotation_date IS NULL;
    `);

    await db.query(`
      ALTER TABLE invoices
      ALTER COLUMN invoice_date SET DEFAULT CURRENT_DATE;
    `);
    await db.query(`
      ALTER TABLE invoices
      ALTER COLUMN quotation_date SET DEFAULT CURRENT_DATE;
    `);
  });
}

async function ensureInvoicePaymentSchema() {
  await runOnBusinessDatabases(async () => {
    await db.query(`
      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS machine_description VARCHAR(255);
    `);
    await db.query(`
      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS serial_no VARCHAR(100);
    `);
    await db.query(`
      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS machine_count INTEGER;
    `);
    await db.query(`
      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS support_technician VARCHAR(150);
    `);
    await db.query(`
      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS support_technician_percentage DOUBLE PRECISION;
    `);
    await db.query(`
      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'Cash';
    `);
    await db.query(`
      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS cheque_no VARCHAR(100);
    `);
    await db.query(`
      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'Pending';
    `);
    await db.query(`
      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS payment_date DATE;
    `);

    await db.query(`
      UPDATE invoices
      SET payment_status = 'Received'
      WHERE LOWER(COALESCE(payment_status, '')) IN ('received', 'recieved');
    `);
    await db.query(`
      UPDATE invoices
      SET payment_status = 'Pending'
      WHERE payment_status IS NULL OR TRIM(payment_status) = '';
    `);
    await db.query(`
      UPDATE invoices
      SET payment_date = COALESCE(payment_date, invoice_date, DATE("updatedAt"), DATE("createdAt"), CURRENT_DATE)
      WHERE payment_status = 'Received' AND payment_date IS NULL;
    `);
  });
}

async function ensureSupportImportantSchema() {
  await runOnBusinessDatabases(async () => {
    await db.query(`
      ALTER TABLE support_importants
      ADD COLUMN IF NOT EXISTS warranty_period VARCHAR(20) DEFAULT '3 month';
    `);

    await db.query(`
      UPDATE support_importants
      SET warranty_period = '3 month'
      WHERE warranty_period IS NULL OR TRIM(warranty_period) = '';
    `);
  });
}

async function ensureInvoiceImportantWarrantySchema() {
  await runOnBusinessDatabases(async () => {
    await db.query(`
      ALTER TABLE invoice_importants
      ADD COLUMN IF NOT EXISTS warranty_period VARCHAR(20);
    `);
    await db.query(`
      ALTER TABLE invoice_importants
      ADD COLUMN IF NOT EXISTS warranty_expiry_date DATE;
    `);

    await db.query(`
      UPDATE invoice_importants
      SET warranty_period = CASE
        WHEN LOWER(COALESCE(note, '')) ~ '\\m3\\s*month\\M' THEN '3 month'
        WHEN LOWER(COALESCE(note, '')) ~ '\\m6\\s*month\\M' THEN '6 month'
        WHEN LOWER(COALESCE(note, '')) ~ '\\m1\\s*year\\M' THEN '1 year'
        WHEN LOWER(COALESCE(note, '')) ~ '\\m2\\s*year\\M' THEN '2 year'
        ELSE NULL
      END
      WHERE warranty_period IS NULL OR TRIM(warranty_period) = '';
    `);

    await db.query(`
      UPDATE invoice_importants ii
      SET warranty_expiry_date = CASE
        WHEN ii.warranty_period = '3 month' THEN (COALESCE(i.invoice_date, DATE(ii."createdAt")) + INTERVAL '3 months')::date
        WHEN ii.warranty_period = '6 month' THEN (COALESCE(i.invoice_date, DATE(ii."createdAt")) + INTERVAL '6 months')::date
        WHEN ii.warranty_period = '1 year' THEN (COALESCE(i.invoice_date, DATE(ii."createdAt")) + INTERVAL '1 year')::date
        WHEN ii.warranty_period = '2 year' THEN (COALESCE(i.invoice_date, DATE(ii."createdAt")) + INTERVAL '2 years')::date
        ELSE NULL
      END
      FROM invoices i
      WHERE i.id = ii.invoice_id
        AND (ii.warranty_expiry_date IS NULL);
    `);
  });
}

async function ensureVendorCategorySchema() {
  await runOnBusinessDatabases(async () => {
    await db.query(`
      ALTER TABLE vendors
      ALTER COLUMN category TYPE VARCHAR(255);
    `);

    await db.query(`
      DO $$
      DECLARE
        constraint_name TEXT;
      BEGIN
        FOR constraint_name IN
          SELECT c.conname
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          WHERE t.relname = 'vendors'
            AND c.contype = 'c'
            AND pg_get_constraintdef(c.oid) ILIKE '%category%'
        LOOP
          EXECUTE format('ALTER TABLE vendors DROP CONSTRAINT IF EXISTS %I', constraint_name);
        END LOOP;
      END $$;
    `);
  });
}

async function ensureUserAccessSchema() {
  await runOnBusinessDatabases(async () => {
    await db.query(`
      ALTER TABLE user_accesses
      ADD COLUMN IF NOT EXISTS user_database VARCHAR(20) DEFAULT 'inventory';
    `);

    await db.query(`
      UPDATE user_accesses
      SET user_database = 'inventory'
      WHERE user_database IS NULL OR TRIM(user_database) = '';
    `);

    await db.query(`
      ALTER TABLE user_accesses
      ADD COLUMN IF NOT EXISTS allowed_actions_json TEXT DEFAULT '[]';
    `);

    await db.query(`
      UPDATE user_accesses
      SET allowed_actions_json = '[]'
      WHERE allowed_actions_json IS NULL OR TRIM(allowed_actions_json) = '';
    `);

    await db.query(`
      ALTER TABLE user_accesses
      DROP CONSTRAINT IF EXISTS user_accesses_user_id_key;
    `);

    await db.query(`
      WITH ranked AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY user_id, LOWER(COALESCE(user_database, 'inventory'))
            ORDER BY "updatedAt" DESC NULLS LAST, "createdAt" DESC NULLS LAST, id DESC
          ) AS rn
        FROM user_accesses
      )
      DELETE FROM user_accesses ua
      USING ranked r
      WHERE ua.id = r.id
        AND r.rn > 1;
    `);

    await db.query(`
      DROP INDEX IF EXISTS user_accesses_user_db_unique_idx;
    `);

    await db.query(`
      CREATE UNIQUE INDEX user_accesses_user_db_unique_idx
      ON user_accesses(user_id, LOWER(COALESCE(user_database, 'inventory')));
    `);
  });
}

async function ensureCompanyProfilesSchema() {
  await db.withDatabase("inventory", async () => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS company_profiles (
        id SERIAL PRIMARY KEY,
        company_name VARCHAR(200) UNIQUE NOT NULL,
        folder_name VARCHAR(120) NOT NULL,
        logo_path VARCHAR(500) NOT NULL,
        logo_file_name VARCHAR(255) NOT NULL,
        created_by INTEGER,
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW()
      );
    `);
  });
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
app.use("/api/preferences", preferenceRoutes);

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
    await ensureCustomerCodeSchema();
    await ensureVendorCategorySchema();
    await ensureUserAccessSchema();
    await ensureCompanyProfilesSchema();
    await ensureInvoiceDateSchema();
    await ensureInvoicePaymentSchema();
    await ensureSupportImportantSchema();
    await ensureInvoiceImportantWarrantySchema();
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

