-- ==========================================================
-- pulmotech_inhouse - PostgreSQL Safe Sync Script
-- ==========================================================
-- This script is DATA-SAFE:
-- 1) No DROP TABLE statements
-- 2) No DELETE/TRUNCATE statements
-- 3) Uses CREATE TABLE IF NOT EXISTS and ALTER ... IF NOT EXISTS
--
-- Backend DB link (Sequelize): backend/config/database.js
-- Frontend API link: frontend/assets/js/api.js and frontend/js/api.js
-- ==========================================================

BEGIN;

-- --------------------------
-- USERS
-- --------------------------
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    company VARCHAR(100),
    department VARCHAR(100),
    telephone VARCHAR(50),
    email VARCHAR(100) NOT NULL,
    role VARCHAR(20) DEFAULT 'user',
    password VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS company VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS department VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS telephone VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'users_email_unique'
    ) THEN
        ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);
    END IF;
END $$;

-- --------------------------
-- CATEGORIES
-- --------------------------
CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'categories_name_unique'
    ) THEN
        ALTER TABLE categories ADD CONSTRAINT categories_name_unique UNIQUE (name);
    END IF;
END $$;

-- --------------------------
-- VENDORS
-- --------------------------
CREATE TABLE IF NOT EXISTS vendors (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    address TEXT,
    category VARCHAR(255),
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

ALTER TABLE vendors ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP DEFAULT NOW();
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP DEFAULT NOW();

-- --------------------------
-- CUSTOMERS
-- --------------------------
CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    customer_id VARCHAR(20),
    name VARCHAR(100) NOT NULL,
    address TEXT,
    tel VARCHAR(50),
    contact_person VARCHAR(100),
    customer_type VARCHAR(20) DEFAULT 'Silver',
    customer_mode VARCHAR(20) DEFAULT 'General',
    vat_number VARCHAR(100),
    email VARCHAR(100),
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_type VARCHAR(20) DEFAULT 'Silver';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_mode VARCHAR(20) DEFAULT 'General';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS vat_number VARCHAR(100);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_id VARCHAR(20);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS contact_person VARCHAR(100);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP DEFAULT NOW();
ALTER TABLE customers ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'customers_email_unique'
    ) THEN
        ALTER TABLE customers ADD CONSTRAINT customers_email_unique UNIQUE (email);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'customers_customer_id_unique'
    ) THEN
        ALTER TABLE customers ADD CONSTRAINT customers_customer_id_unique UNIQUE (customer_id);
    END IF;
END $$;

-- --------------------------
-- RENTAL MACHINES
-- --------------------------
CREATE TABLE IF NOT EXISTS rental_machines (
    id SERIAL PRIMARY KEY,
    machine_id VARCHAR(20) NOT NULL,
    customer_id INT NOT NULL,
    customer_name VARCHAR(100) NOT NULL,
    address TEXT,
    model VARCHAR(100) NOT NULL,
    machine_title VARCHAR(150) NOT NULL,
    serial_no VARCHAR(100),
    start_count INT DEFAULT 0,
    updated_count INT DEFAULT 0,
    page_per_price DECIMAL(12,4) DEFAULT 0,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

ALTER TABLE rental_machines ADD COLUMN IF NOT EXISTS customer_name VARCHAR(100);
ALTER TABLE rental_machines ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE rental_machines ADD COLUMN IF NOT EXISTS machine_title VARCHAR(150);
ALTER TABLE rental_machines ADD COLUMN IF NOT EXISTS serial_no VARCHAR(100);
ALTER TABLE rental_machines ADD COLUMN IF NOT EXISTS start_count INT DEFAULT 0;
ALTER TABLE rental_machines ADD COLUMN IF NOT EXISTS updated_count INT DEFAULT 0;
ALTER TABLE rental_machines ADD COLUMN IF NOT EXISTS page_per_price DECIMAL(12,4) DEFAULT 0;
ALTER TABLE rental_machines ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP DEFAULT NOW();
ALTER TABLE rental_machines ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'rental_machines_machine_id_unique'
    ) THEN
        ALTER TABLE rental_machines ADD CONSTRAINT rental_machines_machine_id_unique UNIQUE (machine_id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'rental_machines_customer_fk'
    ) THEN
        ALTER TABLE rental_machines
        ADD CONSTRAINT rental_machines_customer_fk
        FOREIGN KEY (customer_id) REFERENCES customers(id);
    END IF;
END $$;

-- --------------------------
-- RENTAL MACHINE CONSUMABLES
-- --------------------------
CREATE TABLE IF NOT EXISTS rental_machine_consumables (
    id SERIAL PRIMARY KEY,
    rental_machine_id INT,
    customer_id INT,
    product_id INT,
    save_batch_id VARCHAR(50),
    consumable_name VARCHAR(150) NOT NULL,
    quantity INT DEFAULT 1,
    count INT DEFAULT 0,
    unit VARCHAR(50),
    notes TEXT,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

ALTER TABLE rental_machine_consumables ADD COLUMN IF NOT EXISTS quantity INT DEFAULT 1;
ALTER TABLE rental_machine_consumables ADD COLUMN IF NOT EXISTS count INT DEFAULT 0;
ALTER TABLE rental_machine_consumables ADD COLUMN IF NOT EXISTS product_id INT;
ALTER TABLE rental_machine_consumables ADD COLUMN IF NOT EXISTS customer_id INT;
ALTER TABLE rental_machine_consumables ADD COLUMN IF NOT EXISTS save_batch_id VARCHAR(50);
ALTER TABLE rental_machine_consumables ADD COLUMN IF NOT EXISTS unit VARCHAR(50);
ALTER TABLE rental_machine_consumables ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE rental_machine_consumables ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP DEFAULT NOW();
ALTER TABLE rental_machine_consumables ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'rental_machine_consumables_machine_fk'
    ) THEN
        ALTER TABLE rental_machine_consumables
        ADD CONSTRAINT rental_machine_consumables_machine_fk
        FOREIGN KEY (rental_machine_id) REFERENCES rental_machines(id) ON DELETE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'rental_machine_consumables_product_fk'
    ) THEN
        ALTER TABLE rental_machine_consumables
        ADD CONSTRAINT rental_machine_consumables_product_fk
        FOREIGN KEY (product_id) REFERENCES products(id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'rental_machine_consumables_customer_fk'
    ) THEN
        ALTER TABLE rental_machine_consumables
        ADD CONSTRAINT rental_machine_consumables_customer_fk
        FOREIGN KEY (customer_id) REFERENCES customers(id);
    END IF;
END $$;

-- --------------------------
-- RENTAL MACHINE COUNTS
-- --------------------------
CREATE TABLE IF NOT EXISTS rental_machine_counts (
    id SERIAL PRIMARY KEY,
    transaction_id VARCHAR(50) NOT NULL,
    rental_machine_id INT NOT NULL,
    customer_id INT NOT NULL,
    input_count INT DEFAULT 0,
    updated_count INT DEFAULT 0,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

ALTER TABLE rental_machine_counts ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(50);
ALTER TABLE rental_machine_counts ADD COLUMN IF NOT EXISTS rental_machine_id INT;
ALTER TABLE rental_machine_counts ADD COLUMN IF NOT EXISTS customer_id INT;
ALTER TABLE rental_machine_counts ADD COLUMN IF NOT EXISTS input_count INT DEFAULT 0;
ALTER TABLE rental_machine_counts ADD COLUMN IF NOT EXISTS updated_count INT DEFAULT 0;
ALTER TABLE rental_machine_counts ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP DEFAULT NOW();
ALTER TABLE rental_machine_counts ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'rental_machine_counts_transaction_id_unique'
    ) THEN
        ALTER TABLE rental_machine_counts ADD CONSTRAINT rental_machine_counts_transaction_id_unique UNIQUE (transaction_id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'rental_machine_counts_machine_fk'
    ) THEN
        ALTER TABLE rental_machine_counts
        ADD CONSTRAINT rental_machine_counts_machine_fk
        FOREIGN KEY (rental_machine_id) REFERENCES rental_machines(id) ON DELETE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'rental_machine_counts_customer_fk'
    ) THEN
        ALTER TABLE rental_machine_counts
        ADD CONSTRAINT rental_machine_counts_customer_fk
        FOREIGN KEY (customer_id) REFERENCES customers(id);
    END IF;
END $$;

-- --------------------------
-- PRODUCTS
-- --------------------------
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    product_id VARCHAR(20),
    description VARCHAR(255),
    category_id INT,
    model VARCHAR(100),
    serial_no VARCHAR(100),
    count INT DEFAULT 0,
    selling_price DOUBLE PRECISION DEFAULT 0,
    dealer_price DOUBLE PRECISION DEFAULT 0,
    vendor_id INT,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP DEFAULT NOW();
ALTER TABLE products ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'products_product_id_unique'
    ) THEN
        ALTER TABLE products ADD CONSTRAINT products_product_id_unique UNIQUE (product_id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'products_category_fk'
    ) THEN
        ALTER TABLE products
        ADD CONSTRAINT products_category_fk
        FOREIGN KEY (category_id) REFERENCES categories(id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'products_vendor_fk'
    ) THEN
        ALTER TABLE products
        ADD CONSTRAINT products_vendor_fk
        FOREIGN KEY (vendor_id) REFERENCES vendors(id);
    END IF;
END $$;

-- --------------------------
-- INVOICES
-- --------------------------
CREATE TABLE IF NOT EXISTS invoices (
    id SERIAL PRIMARY KEY,
    invoice_no VARCHAR(30),
    customer_id INT,
    invoice_date DATE DEFAULT CURRENT_DATE,
    quotation_date DATE DEFAULT CURRENT_DATE,
    total_amount DOUBLE PRECISION DEFAULT 0,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS total_amount DOUBLE PRECISION DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS support_technician_percentage DOUBLE PRECISION;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS quotation_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP DEFAULT NOW();
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'invoices_invoice_no_unique'
    ) THEN
        ALTER TABLE invoices ADD CONSTRAINT invoices_invoice_no_unique UNIQUE (invoice_no);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'invoices_customer_fk'
    ) THEN
        ALTER TABLE invoices
        ADD CONSTRAINT invoices_customer_fk
        FOREIGN KEY (customer_id) REFERENCES customers(id);
    END IF;
END $$;

-- --------------------------
-- INVOICE ITEMS
-- --------------------------
CREATE TABLE IF NOT EXISTS invoice_items (
    id SERIAL PRIMARY KEY,
    invoice_id INT,
    product_id INT,
    qty INT DEFAULT 1,
    rate DOUBLE PRECISION DEFAULT 0,
    vat DOUBLE PRECISION DEFAULT 0,
    gross DOUBLE PRECISION DEFAULT 0,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP DEFAULT NOW();
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'invoice_items_invoice_fk'
    ) THEN
        ALTER TABLE invoice_items
        ADD CONSTRAINT invoice_items_invoice_fk
        FOREIGN KEY (invoice_id) REFERENCES invoices(id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'invoice_items_product_fk'
    ) THEN
        ALTER TABLE invoice_items
        ADD CONSTRAINT invoice_items_product_fk
        FOREIGN KEY (product_id) REFERENCES products(id);
    END IF;
END $$;

-- --------------------------
-- EXPENSES
-- --------------------------
CREATE TABLE IF NOT EXISTS expenses (
    id SERIAL PRIMARY KEY,
    title VARCHAR(150),
    customer VARCHAR(150),
    amount DOUBLE PRECISION DEFAULT 0,
    date DATE,
    category VARCHAR(100),
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS customer VARCHAR(150);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP DEFAULT NOW();
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP DEFAULT NOW();

-- --------------------------
-- STOCKS
-- --------------------------
CREATE TABLE IF NOT EXISTS stocks (
    id SERIAL PRIMARY KEY,
    product_id INT,
    change INT,
    type VARCHAR(10),
    date TIMESTAMP DEFAULT NOW(),
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

ALTER TABLE stocks ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP DEFAULT NOW();
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'stocks_product_fk'
    ) THEN
        ALTER TABLE stocks
        ADD CONSTRAINT stocks_product_fk
        FOREIGN KEY (product_id) REFERENCES products(id);
    END IF;
END $$;

-- --------------------------
-- CONDITIONS
-- --------------------------
CREATE TABLE IF NOT EXISTS conditions (
    id SERIAL PRIMARY KEY,
    condition VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

ALTER TABLE conditions ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP DEFAULT NOW();
ALTER TABLE conditions ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP DEFAULT NOW();

-- --------------------------
-- MESSAGES
-- --------------------------
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    from_user_id INT,
    to_user_id INT,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

ALTER TABLE messages ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP DEFAULT NOW();
ALTER TABLE messages ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP DEFAULT NOW();

-- --------------------------
-- NOTIFICATIONS
-- --------------------------
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP DEFAULT NOW();
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP DEFAULT NOW();

-- --------------------------
-- TODOS
-- --------------------------
CREATE TABLE IF NOT EXISTS todos (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    done BOOLEAN DEFAULT FALSE,
    created_by INT,
    assigned_to INT,
    done_by INT,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

ALTER TABLE todos ADD COLUMN IF NOT EXISTS done BOOLEAN DEFAULT FALSE;
ALTER TABLE todos ADD COLUMN IF NOT EXISTS created_by INT;
ALTER TABLE todos ADD COLUMN IF NOT EXISTS assigned_to INT;
ALTER TABLE todos ADD COLUMN IF NOT EXISTS done_by INT;
ALTER TABLE todos ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP DEFAULT NOW();
ALTER TABLE todos ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP DEFAULT NOW();

-- --------------------------
-- UI SETTINGS
-- --------------------------
CREATE TABLE IF NOT EXISTS ui_settings (
    id SERIAL PRIMARY KEY,
    app_name VARCHAR(120) NOT NULL DEFAULT 'pulmotech_inhouse',
    footer_text VARCHAR(255) NOT NULL DEFAULT '© All Right Recieved with CRONIT SOLLUTIONS - JMR Prasanna.',
    primary_color VARCHAR(24) NOT NULL DEFAULT '#0f6abf',
    accent_color VARCHAR(24) NOT NULL DEFAULT '#11a36f',
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

ALTER TABLE ui_settings ADD COLUMN IF NOT EXISTS app_name VARCHAR(120) NOT NULL DEFAULT 'pulmotech_inhouse';
ALTER TABLE ui_settings ADD COLUMN IF NOT EXISTS footer_text VARCHAR(255) NOT NULL DEFAULT '© All Right Recieved with CRONIT SOLLUTIONS - JMR Prasanna.';
ALTER TABLE ui_settings ADD COLUMN IF NOT EXISTS primary_color VARCHAR(24) NOT NULL DEFAULT '#0f6abf';
ALTER TABLE ui_settings ADD COLUMN IF NOT EXISTS accent_color VARCHAR(24) NOT NULL DEFAULT '#11a36f';
ALTER TABLE ui_settings ADD COLUMN IF NOT EXISTS background_color VARCHAR(24) NOT NULL DEFAULT '#edf3fb';
ALTER TABLE ui_settings ADD COLUMN IF NOT EXISTS button_color VARCHAR(24) NOT NULL DEFAULT '#0f6abf';
ALTER TABLE ui_settings ADD COLUMN IF NOT EXISTS mode_theme VARCHAR(16) NOT NULL DEFAULT 'light';
ALTER TABLE ui_settings ADD COLUMN IF NOT EXISTS logo_path VARCHAR(500);
ALTER TABLE ui_settings ADD COLUMN IF NOT EXISTS invoice_template_pdf_path VARCHAR(500);
ALTER TABLE ui_settings ADD COLUMN IF NOT EXISTS quotation_template_pdf_path VARCHAR(500);
ALTER TABLE ui_settings ADD COLUMN IF NOT EXISTS quotation2_template_pdf_path VARCHAR(500);
ALTER TABLE ui_settings ADD COLUMN IF NOT EXISTS sign_c_path VARCHAR(500);
ALTER TABLE ui_settings ADD COLUMN IF NOT EXISTS sign_v_path VARCHAR(500);
ALTER TABLE ui_settings ADD COLUMN IF NOT EXISTS seal_c_path VARCHAR(500);
ALTER TABLE ui_settings ADD COLUMN IF NOT EXISTS seal_v_path VARCHAR(500);
ALTER TABLE ui_settings ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP DEFAULT NOW();
ALTER TABLE ui_settings ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP DEFAULT NOW();

-- --------------------------
-- SAFE DEFAULT SEED (NO DATA LOSS)
-- --------------------------
INSERT INTO categories(name)
VALUES
('Photocopier'),
('Printer'),
('Plotter'),
('Computer'),
('Laptop'),
('Accessory'),
('Consumable'),
('Machine'),
('Service')
ON CONFLICT DO NOTHING;

INSERT INTO ui_settings(app_name, footer_text, primary_color, accent_color)
SELECT
    'pulmotech_inhouse',
    '© All Right Recieved with CRONIT SOLLUTIONS - JMR Prasanna.',
    '#0f6abf',
    '#11a36f'
WHERE NOT EXISTS (SELECT 1 FROM ui_settings);

COMMIT;
