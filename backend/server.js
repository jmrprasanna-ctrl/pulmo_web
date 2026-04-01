require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const { Client } = require("pg");
const db = require("./config/database");
const { getRuntimeChecks, summarizeStatus } = require("./utils/startupChecks");
const { extractCustomerPrefix } = require("./utils/customerCodeGenerator");

         
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

const authRoutes = require("./routes/authRoutes");                          
const userRoutes = require("./routes/userRoutes");                              

const app = express();
let appHealth = {
  ok: false,
  dbConnected: false,
  checks: null,
  startedAt: null,
};
let businessDatabaseNames = ["inventory", "demo"];

function toDbName(value) {
  return db.normalizeDatabaseName(value);
}

function getPgConfig(database) {
  return {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || "postgres",
    password: String(process.env.DB_PASSWORD || ""),
    database,
  };
}

async function discoverBusinessDatabases() {
  const defaults = new Set(["inventory", "demo", toDbName(process.env.DB_NAME || "inventory")].filter(Boolean));
  const admin = new Client(getPgConfig("postgres"));
  await admin.connect();
  try {
    const existingRs = await admin.query("SELECT datname FROM pg_database WHERE datistemplate = false");
    const existing = new Set((existingRs.rows || []).map((r) => toDbName(r.datname)).filter(Boolean));
    const discovered = new Set(defaults);

    const inventoryClient = new Client(getPgConfig("inventory"));
    try {
      await inventoryClient.connect();

      const profileTableRs = await inventoryClient.query("SELECT to_regclass('public.company_profiles') AS name");
      if (profileTableRs.rows?.[0]?.name) {
        const profileDbRs = await inventoryClient.query(
          `SELECT DISTINCT LOWER(TRIM(database_name)) AS database_name
           FROM company_profiles
           WHERE database_name IS NOT NULL AND TRIM(database_name) <> ''`
        );
        for (const row of profileDbRs.rows || []) {
          const name = toDbName(row.database_name);
          if (name) discovered.add(name);
        }
      }

      const userMappingsTableRs = await inventoryClient.query("SELECT to_regclass('public.user_mappings') AS name");
      if (userMappingsTableRs.rows?.[0]?.name) {
        const mapDbRs = await inventoryClient.query(
          `SELECT DISTINCT LOWER(TRIM(database_name)) AS database_name
           FROM user_mappings
           WHERE database_name IS NOT NULL AND TRIM(database_name) <> ''`
        );
        for (const row of mapDbRs.rows || []) {
          const name = toDbName(row.database_name);
          if (name) discovered.add(name);
        }
      }

      const createdDbTableRs = await inventoryClient.query("SELECT to_regclass('public.company_databases') AS name");
      if (createdDbTableRs.rows?.[0]?.name) {
        const createdDbRs = await inventoryClient.query(
          `SELECT DISTINCT LOWER(TRIM(database_name)) AS database_name
           FROM company_databases
           WHERE database_name IS NOT NULL AND TRIM(database_name) <> ''`
        );
        for (const row of createdDbRs.rows || []) {
          const name = toDbName(row.database_name);
          if (name) discovered.add(name);
        }
      }
    } catch (_err) {
                                                                   
    } finally {
      await inventoryClient.end().catch(() => {});
    }

    return [...discovered].filter((name) => existing.has(name)).sort((a, b) => a.localeCompare(b));
  } finally {
    await admin.end().catch(() => {});
  }
}

async function runOnBusinessDatabases(task) {
  const targets = Array.isArray(businessDatabaseNames) && businessDatabaseNames.length
    ? businessDatabaseNames
    : ["inventory", "demo"];
  for (const databaseName of targets) {
    await db.withDatabase(databaseName, async () => {
      await task(databaseName);
    });
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
    await db.query(`
      ALTER TABLE ui_settings
      ADD COLUMN IF NOT EXISTS quotation3_template_pdf_path VARCHAR(500);
    `);
    await db.query(`ALTER TABLE ui_settings ADD COLUMN IF NOT EXISTS sign_q2_path VARCHAR(500);`);
    await db.query(`ALTER TABLE ui_settings ADD COLUMN IF NOT EXISTS seal_q2_path VARCHAR(500);`);
    await db.query(`ALTER TABLE ui_settings ADD COLUMN IF NOT EXISTS sign_q3_path VARCHAR(500);`);
    await db.query(`ALTER TABLE ui_settings ADD COLUMN IF NOT EXISTS seal_q3_path VARCHAR(500);`);

    const first = await UiSetting.findOne({ order: [["id", "ASC"]] });
    if (!first) {
      await UiSetting.create({
        app_name: "PULMO TECHNOLOGIES",
        footer_text: "© All Right Recieved with CRONIT SOLLUTIONS - JMRP.",
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
      ALTER TABLE rental_machine_consumables
      ALTER COLUMN entry_date SET DEFAULT CURRENT_DATE;
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
      ALTER TABLE rental_machine_counts
      ALTER COLUMN entry_date SET DEFAULT CURRENT_DATE;
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

async function ensureRentalMachineSchema() {
  await runOnBusinessDatabases(async () => {
    await db.query(`
      ALTER TABLE rental_machines
      ADD COLUMN IF NOT EXISTS entry_date DATE;
    `);
    await db.query(`
      UPDATE rental_machines
      SET entry_date = COALESCE(entry_date, DATE("createdAt"), CURRENT_DATE)
      WHERE entry_date IS NULL;
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS rental_machines_entry_date_idx
      ON rental_machines(entry_date);
    `);
  });
}

async function ensureGeneralMachineSchema() {
  await runOnBusinessDatabases(async () => {
    await db.query(`
      ALTER TABLE general_machines
      ADD COLUMN IF NOT EXISTS entry_date DATE;
    `);
    await db.query(`
      UPDATE general_machines
      SET entry_date = COALESCE(entry_date, DATE("createdAt"), CURRENT_DATE)
      WHERE entry_date IS NULL;
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS general_machines_entry_date_idx
      ON general_machines(entry_date);
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
                                                                                       
      for (const customer of allCustomers) {
        await customer.update({ customer_id: `TMP${customer.id}` }, { transaction });
      }

                                                                                              
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
      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS quotation2_date DATE;
    `);
    await db.query(`
      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS quotation3_date DATE;
    `);
    await db.query(`
      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS quotation2_customer_name VARCHAR(255);
    `);
    await db.query(`
      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS quotation3_customer_name VARCHAR(255);
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
      UPDATE invoices
      SET quotation2_date = COALESCE(quotation2_date, quotation_date, invoice_date, DATE("createdAt"), CURRENT_DATE)
      WHERE quotation2_date IS NULL;
    `);
    await db.query(`
      UPDATE invoices
      SET quotation3_date = COALESCE(quotation3_date, quotation_date, invoice_date, DATE("createdAt"), CURRENT_DATE)
      WHERE quotation3_date IS NULL;
    `);

    await db.query(`
      ALTER TABLE invoices
      ALTER COLUMN invoice_date SET DEFAULT CURRENT_DATE;
    `);
    await db.query(`
      ALTER TABLE invoices
      ALTER COLUMN quotation_date SET DEFAULT CURRENT_DATE;
    `);
    await db.query(`
      ALTER TABLE invoices
      ALTER COLUMN quotation2_date SET DEFAULT CURRENT_DATE;
    `);
    await db.query(`
      ALTER TABLE invoices
      ALTER COLUMN quotation3_date SET DEFAULT CURRENT_DATE;
    `);
  });
}

async function ensureInvoiceNumberingSchema() {
  await runOnBusinessDatabases(async () => {
    await db.query(`
      CREATE INDEX IF NOT EXISTS invoices_invoice_date_no_idx
      ON invoices(invoice_date, invoice_no);
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
      ALTER COLUMN machine_count SET DEFAULT 0;
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
      SET machine_count = 0
      WHERE machine_count IS NULL;
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
        company_code VARCHAR(40),
        email VARCHAR(200),
        folder_name VARCHAR(120) NOT NULL,
        logo_path VARCHAR(500) NOT NULL,
        logo_file_name VARCHAR(255) NOT NULL,
        created_by INTEGER,
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW()
      );
    `);
    await db.query(`
      ALTER TABLE company_profiles
      ADD COLUMN IF NOT EXISTS company_code VARCHAR(40);
    `);
    await db.query(`
      ALTER TABLE company_profiles
      ADD COLUMN IF NOT EXISTS email VARCHAR(200);
    `);
    await db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS company_profiles_company_code_unique_idx
      ON company_profiles (UPPER(company_code))
      WHERE company_code IS NOT NULL AND TRIM(company_code) <> '';
    `);
  });
}

async function ensureUserMappingSchema() {
  await db.withDatabase("inventory", async () => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_mappings (
        id SERIAL PRIMARY KEY,
        user_id INTEGER UNIQUE NOT NULL,
        company_profile_id INTEGER NOT NULL REFERENCES company_profiles(id) ON DELETE CASCADE,
        database_name VARCHAR(120) NOT NULL,
        mapped_email VARCHAR(200),
        is_verified BOOLEAN DEFAULT FALSE,
        created_by INTEGER,
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW()
      );
    `);
    await db.query(`
      ALTER TABLE user_mappings
      ADD COLUMN IF NOT EXISTS mapped_email VARCHAR(200);
    `);
  });
}

async function ensureUserInvoiceMappingSchema() {
  await db.withDatabase("inventory", async () => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_invoice_mappings (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        database_name VARCHAR(120) NOT NULL,
        logo_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        invoice_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        quotation_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        quotation2_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        quotation3_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        sign_c_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        sign_v_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        seal_c_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        seal_v_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        sign_q2_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        seal_q2_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        sign_q3_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        seal_q3_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        theme_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        is_verified BOOLEAN NOT NULL DEFAULT FALSE,
        created_by INTEGER,
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, database_name)
      );
    `);
    await db.query(`ALTER TABLE user_invoice_mappings ADD COLUMN IF NOT EXISTS sign_q2_enabled BOOLEAN NOT NULL DEFAULT FALSE;`);
    await db.query(`ALTER TABLE user_invoice_mappings ADD COLUMN IF NOT EXISTS seal_q2_enabled BOOLEAN NOT NULL DEFAULT FALSE;`);
    await db.query(`ALTER TABLE user_invoice_mappings ADD COLUMN IF NOT EXISTS sign_q3_enabled BOOLEAN NOT NULL DEFAULT FALSE;`);
    await db.query(`ALTER TABLE user_invoice_mappings ADD COLUMN IF NOT EXISTS seal_q3_enabled BOOLEAN NOT NULL DEFAULT FALSE;`);
  });
}

async function ensureUserPreferenceSettingsSchema() {
  await runOnBusinessDatabases(async () => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_preference_settings (
        id SERIAL PRIMARY KEY,
        user_id INTEGER UNIQUE NOT NULL,
        logo_path VARCHAR(500),
        invoice_template_pdf_path VARCHAR(500),
        quotation_template_pdf_path VARCHAR(500),
        quotation2_template_pdf_path VARCHAR(500),
        quotation3_template_pdf_path VARCHAR(500),
        sign_c_path VARCHAR(500),
        sign_v_path VARCHAR(500),
        seal_c_path VARCHAR(500),
        seal_v_path VARCHAR(500),
        sign_q2_path VARCHAR(500),
        seal_q2_path VARCHAR(500),
        sign_q3_path VARCHAR(500),
        seal_q3_path VARCHAR(500),
        primary_color VARCHAR(24),
        background_color VARCHAR(24),
        button_color VARCHAR(24),
        mode_theme VARCHAR(16),
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW()
      );
    `);
    await db.query(`ALTER TABLE user_preference_settings ADD COLUMN IF NOT EXISTS sign_q2_path VARCHAR(500);`);
    await db.query(`ALTER TABLE user_preference_settings ADD COLUMN IF NOT EXISTS seal_q2_path VARCHAR(500);`);
    await db.query(`ALTER TABLE user_preference_settings ADD COLUMN IF NOT EXISTS sign_q3_path VARCHAR(500);`);
    await db.query(`ALTER TABLE user_preference_settings ADD COLUMN IF NOT EXISTS seal_q3_path VARCHAR(500);`);
  });
}

async function ensureUserQuotationRenderSettingsSchema() {
  await runOnBusinessDatabases(async () => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_quotation_render_settings (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        database_name VARCHAR(120) NOT NULL,
        quotation_type VARCHAR(32) NOT NULL,
        render_visibility_json TEXT NOT NULL DEFAULT '{}',
        render_overrides_json TEXT NOT NULL DEFAULT '{}',
        created_by INTEGER,
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, database_name, quotation_type)
      );
    `);
    await db.query(`
      ALTER TABLE user_quotation_render_settings
      ADD COLUMN IF NOT EXISTS render_overrides_json TEXT NOT NULL DEFAULT '{}';
    `);
  });
}

async function ensureUserSuperSchema() {
  await runOnBusinessDatabases(async () => {
    await db.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS is_super_user BOOLEAN DEFAULT FALSE;
    `);
    await db.query(`
      UPDATE users
      SET is_super_user = FALSE
      WHERE is_super_user IS NULL;
    `);
    await db.query(`
      ALTER TABLE users
      ALTER COLUMN is_super_user SET DEFAULT FALSE;
    `);
  });
}

async function ensureUserPasswordRecoverySchema() {
  await runOnBusinessDatabases(async () => {
    await db.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS password_plain VARCHAR(255);
    `);
    await db.query(`
      UPDATE users
      SET password_plain = password
      WHERE (password_plain IS NULL OR TRIM(password_plain) = '')
        AND COALESCE(password, '') !~ '^\\$2[aby]\\$';
    `);
  });
}

             
app.use(cors());
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
                                                                                        
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self' http: https:; script-src 'self' https: 'unsafe-inline'; style-src 'self' https: 'unsafe-inline'; img-src 'self' data: blob: http: https:; font-src 'self' data: https:; connect-src 'self' http: https: ws: wss:; object-src 'none'; frame-ancestors 'self'; base-uri 'self'; form-action 'self';"
  );
  next();
});
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({extended:true}));
app.use("/storage", express.static(path.resolve(__dirname, "storage")));

         
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

             
app.get("/",(req,res)=>res.send("PULMO TECHNOLOGIES is running"));
app.get("/api/health", (_req, res) => {
  const statusCode = appHealth.ok ? 200 : 503;
  res.status(statusCode).json({
    ...appHealth,
    now: new Date().toISOString(),
  });
});

                                 
const PORT = Number(process.env.PORT || 5000);
const AUTO_DB_SYNC = String(process.env.AUTO_DB_SYNC || "true").toLowerCase() !== "false";
const DB_SYNC_ALTER = String(process.env.DB_SYNC_ALTER || "true").toLowerCase() !== "false";
const DB_SYNC_FORCE = String(process.env.DB_SYNC_FORCE || "false").toLowerCase() === "true";

async function startServer() {
  try {
    try {
      businessDatabaseNames = await discoverBusinessDatabases();
    } catch (_err) {
      businessDatabaseNames = ["inventory", "demo"];
    }
    for (const databaseName of businessDatabaseNames) {
      await db.registerDatabase(databaseName).catch(() => {});
    }

    if (AUTO_DB_SYNC) {
      const syncOptions = DB_SYNC_FORCE ? { force: true } : { alter: DB_SYNC_ALTER };
      await db.sync(syncOptions);
      console.log(`Database sync completed (${DB_SYNC_FORCE ? "force=true" : `alter=${DB_SYNC_ALTER}`})`);
    } else {
      await db.authenticate();
      console.log("Database connection verified (AUTO_DB_SYNC=false)");
    }

    await ensureRentalMachineSchema();
    await ensureGeneralMachineSchema();
    await ensureRentalConsumableSchema();
    await ensureRentalMachineCountSchema();
    await ensureCustomerCodeSchema();
    await ensureVendorCategorySchema();
    await ensureUserAccessSchema();
    await ensureCompanyProfilesSchema();
    await ensureUserMappingSchema();
    await ensureUserInvoiceMappingSchema();
    await ensureUserPreferenceSettingsSchema();
    await ensureUserQuotationRenderSettingsSchema();
    await ensureUserSuperSchema();
    await ensureUserPasswordRecoverySchema();
    await ensureInvoiceDateSchema();
    await ensureInvoiceNumberingSchema();
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
        databases: businessDatabaseNames,
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
        databases: businessDatabaseNames,
      },
    };
    console.error("Startup failed:", err);
  }
}

startServer();

