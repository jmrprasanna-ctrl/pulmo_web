-- ==========================
-- Database: it_inventory_db
-- ==========================

-- Drop tables if they exist
DROP TABLE IF EXISTS invoice_items CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS rental_machine_consumables CASCADE;
DROP TABLE IF EXISTS general_machines CASCADE;
DROP TABLE IF EXISTS rental_machines CASCADE;
DROP TABLE IF EXISTS conditions CASCADE;
DROP TABLE IF EXISTS stocks CASCADE;
DROP TABLE IF EXISTS expenses CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS vendors CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS category_model_options CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ==========================
-- Users Table
-- ==========================
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    company VARCHAR(100),
    department VARCHAR(100),
    telephone VARCHAR(50),
    email VARCHAR(100) NOT NULL UNIQUE,
    role VARCHAR(20) DEFAULT 'user',
    password VARCHAR(255) NOT NULL,
    createdAt TIMESTAMP DEFAULT NOW(),
    updatedAt TIMESTAMP DEFAULT NOW()
);


-- ==========================
-- Categories Table
-- ==========================
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL
);

INSERT INTO categories(name)
VALUES
('Photocopier'),('Printer'),('Plotter'),('Computer'),
('Laptop'),('Accessory'),('Consumable'),('Machine'),
('CCTV'),('Duplo'),('Other');

-- ==========================
-- Category Model Options
-- ==========================
CREATE TABLE category_model_options (
    id SERIAL PRIMARY KEY,
    category_name VARCHAR(100) NOT NULL,
    model_name VARCHAR(100) NOT NULL,
    createdAt TIMESTAMP DEFAULT NOW(),
    updatedAt TIMESTAMP DEFAULT NOW(),
    UNIQUE (category_name, model_name)
);

INSERT INTO category_model_options(category_name, model_name) VALUES
('Accessory', 'CANON'),('Accessory', 'TOSHIBA'),('Accessory', 'RECOH'),('Accessory', 'SHARP'),('Accessory', 'KYOCERA'),('Accessory', 'SEROX'),('Accessory', 'SAMSUNG'),('Accessory', 'HP'),('Accessory', 'DELL'),
('Consumable', 'CANON'),('Consumable', 'TOSHIBA'),('Consumable', 'RECOH'),('Consumable', 'SHARP'),('Consumable', 'KYOCERA'),('Consumable', 'SEROX'),('Consumable', 'SAMSUNG'),('Consumable', 'HP'),('Consumable', 'DELL'),
('Machine', 'CANON'),('Machine', 'TOSHIBA'),('Machine', 'RECOH'),('Machine', 'SHARP'),('Machine', 'KYOCERA'),('Machine', 'SEROX'),('Machine', 'SAMSUNG'),('Machine', 'HP'),('Machine', 'DELL'),
('Photocopier', 'CANON'),('Photocopier', 'TOSHIBA'),('Photocopier', 'RECOH'),('Photocopier', 'SHARP'),('Photocopier', 'KYOCERA'),('Photocopier', 'SEROX'),('Photocopier', 'SAMSUNG'),('Photocopier', 'HP'),('Photocopier', 'DELL'),
('Printer', 'CANON'),('Printer', 'HP'),('Printer', 'EPSON'),('Printer', 'BROTHER'),('Printer', 'LEXMARK'),('Printer', 'OTHER'),('Printer', 'SEROX'),('Printer', 'SAMSUNG'),
('Computer', 'HP'),('Computer', 'DELL'),('Computer', 'ASUS'),('Computer', 'SONY'),('Computer', 'SINGER'),('Computer', 'SAMSUNG'),('Computer', 'SPARE PARTS'),('Computer', 'OTHER'),
('Laptop', 'HP'),('Laptop', 'DELL'),('Laptop', 'ASUS'),('Laptop', 'SONY'),('Laptop', 'SINGER'),('Laptop', 'SAMSUNG'),('Laptop', 'SPARE PARTS'),('Laptop', 'OTHER'),
('Plotter', 'CANON'),('Plotter', 'HP'),('Plotter', 'EPSON'),('Plotter', 'OTHER'),
('CCTV', 'HICKVISION'),('CCTV', 'DAHUA'),('CCTV', 'OTHER'),
('Duplo', 'RONGDA'),('Duplo', 'RISO'),('Duplo', 'RECOH'),('Duplo', 'DUPLO'),
('Other', 'OTHER');

-- ==========================
-- Vendors Table
-- ==========================
CREATE TABLE vendors (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    address TEXT,
    category VARCHAR(255)
);


-- ==========================
-- Products Table
-- ==========================
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    product_id VARCHAR(20) UNIQUE,
    description VARCHAR(255),
    category_id INT REFERENCES categories(id),
    model VARCHAR(50),
    serial_no VARCHAR(50),
    count INT DEFAULT 0,
    selling_price FLOAT,
    dealer_price FLOAT,
    vendor_id INT REFERENCES vendors(id),
    createdAt TIMESTAMP DEFAULT NOW(),
    updatedAt TIMESTAMP DEFAULT NOW()
);


-- ==========================
-- Customers Table
-- ==========================
CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    customer_id VARCHAR(20) UNIQUE,
    name VARCHAR(100) NOT NULL,
    address TEXT,
    tel VARCHAR(50),
    contact_person VARCHAR(100),
    customer_type VARCHAR(20) DEFAULT 'Silver',
    customer_mode VARCHAR(20) DEFAULT 'General',
    vat_number VARCHAR(100),
    email VARCHAR(100) UNIQUE,
    createdAt TIMESTAMP DEFAULT NOW(),
    updatedAt TIMESTAMP DEFAULT NOW()
);


-- ==========================
-- Rental Machines Table
-- ==========================
CREATE TABLE rental_machines (
    id SERIAL PRIMARY KEY,
    machine_id VARCHAR(20) UNIQUE NOT NULL,
    customer_id INT NOT NULL REFERENCES customers(id),
    customer_name VARCHAR(100) NOT NULL,
    address TEXT,
    model VARCHAR(100) NOT NULL,
    machine_title VARCHAR(150) NOT NULL,
    serial_no VARCHAR(100),
    entry_date DATE DEFAULT CURRENT_DATE,
    start_count INT DEFAULT 0,
    createdAt TIMESTAMP DEFAULT NOW(),
    updatedAt TIMESTAMP DEFAULT NOW()
);

-- ==========================
-- General Machines Table
-- ==========================
CREATE TABLE general_machines (
    id SERIAL PRIMARY KEY,
    machine_id VARCHAR(20) UNIQUE NOT NULL,
    customer_id INT NOT NULL REFERENCES customers(id),
    customer_name VARCHAR(100) NOT NULL,
    address TEXT,
    model VARCHAR(100) NOT NULL,
    machine_title VARCHAR(150) NOT NULL,
    serial_no VARCHAR(100),
    entry_date DATE DEFAULT CURRENT_DATE,
    start_count INT DEFAULT 0,
    createdAt TIMESTAMP DEFAULT NOW(),
    updatedAt TIMESTAMP DEFAULT NOW()
);

-- ==========================
-- Rental Machine Consumables Table
-- ==========================
CREATE TABLE rental_machine_consumables (
    id SERIAL PRIMARY KEY,
    rental_machine_id INT REFERENCES rental_machines(id) ON DELETE CASCADE,
    customer_id INT REFERENCES customers(id),
    product_id INT REFERENCES products(id),
    save_batch_id VARCHAR(50),
    consumable_name VARCHAR(150) NOT NULL,
    quantity INT DEFAULT 1,
    entry_date DATE DEFAULT CURRENT_DATE,
    unit VARCHAR(50),
    notes TEXT,
    createdAt TIMESTAMP DEFAULT NOW(),
    updatedAt TIMESTAMP DEFAULT NOW()
);

-- ==========================
-- Invoices Table
-- ==========================
CREATE TABLE invoices (
    id SERIAL PRIMARY KEY,
    invoice_no VARCHAR(20) UNIQUE,
    customer_id INT REFERENCES customers(id),
    invoice_date DATE DEFAULT CURRENT_DATE,
    quotation_date DATE DEFAULT CURRENT_DATE,
    machine_description VARCHAR(255),
    serial_no VARCHAR(100),
    machine_count INT DEFAULT 0,
    support_technician VARCHAR(150),
    support_technician_percentage FLOAT,
    payment_method VARCHAR(50) DEFAULT 'Cash',
    cheque_no VARCHAR(100),
    payment_status VARCHAR(50) DEFAULT 'Pending',
    payment_date DATE,
    total_amount FLOAT DEFAULT 0,
    createdAt TIMESTAMP DEFAULT NOW(),
    updatedAt TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rental_machine_consumables_customer_entry_idx
ON rental_machine_consumables(customer_id, entry_date, id);
CREATE INDEX IF NOT EXISTS invoices_invoice_date_no_idx ON invoices(invoice_date, invoice_no);
CREATE INDEX IF NOT EXISTS invoices_pending_lookup_idx ON invoices(payment_status, invoice_date, id);

-- ==========================
-- Invoice Items Table
-- ==========================
CREATE TABLE invoice_items (
    id SERIAL PRIMARY KEY,
    invoice_id INT REFERENCES invoices(id),
    product_id INT REFERENCES products(id),
    qty INT DEFAULT 1,
    rate FLOAT,
    vat FLOAT DEFAULT 0,
    gross FLOAT DEFAULT 0,
    createdAt TIMESTAMP DEFAULT NOW(),
    updatedAt TIMESTAMP DEFAULT NOW()
);

-- ==========================
-- Expenses Table
-- ==========================
CREATE TABLE expenses (
    id SERIAL PRIMARY KEY,
    title VARCHAR(100),
    amount FLOAT,
    date DATE,
    category VARCHAR(50),
    createdAt TIMESTAMP DEFAULT NOW(),
    updatedAt TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS expenses_date_idx ON expenses(date);

DO $$
BEGIN
    IF to_regclass('public.rental_machine_counts') IS NOT NULL THEN
        CREATE INDEX IF NOT EXISTS rental_machine_counts_customer_entry_machine_idx
        ON rental_machine_counts(customer_id, entry_date, rental_machine_id, id);
    END IF;
END $$;


-- ==========================
-- Stocks Table
-- ==========================
CREATE TABLE stocks (
    id SERIAL PRIMARY KEY,
    product_id INT REFERENCES products(id),
    change INT,
    type VARCHAR(10) CHECK(type IN ('IN','OUT')),
    date TIMESTAMP DEFAULT NOW(),
    createdAt TIMESTAMP DEFAULT NOW(),
    updatedAt TIMESTAMP DEFAULT NOW()
);

-- ==========================
-- Conditions Table
-- ==========================
CREATE TABLE conditions (
    id SERIAL PRIMARY KEY,
    condition TEXT NOT NULL,
    createdAt TIMESTAMP DEFAULT NOW(),
    updatedAt TIMESTAMP DEFAULT NOW()
);


-- ==========================
-- UI Settings Table
-- ==========================
CREATE TABLE IF NOT EXISTS ui_settings (
    id SERIAL PRIMARY KEY,
    app_name VARCHAR(120) NOT NULL DEFAULT 'PULMO TECHNOLOGIES',
    footer_text VARCHAR(255) NOT NULL DEFAULT '© All Right Recieved with CRONIT SOLLUTIONS - JMR Prasanna.',
    primary_color VARCHAR(24) NOT NULL DEFAULT '#0f6abf',
    accent_color VARCHAR(24) NOT NULL DEFAULT '#11a36f',
    background_color VARCHAR(24) NOT NULL DEFAULT '#edf3fb',
    button_color VARCHAR(24) NOT NULL DEFAULT '#0f6abf',
    mode_theme VARCHAR(16) NOT NULL DEFAULT 'light',
    logo_path VARCHAR(500),
    invoice_template_pdf_path VARCHAR(500),
    quotation_template_pdf_path VARCHAR(500),
    quotation2_template_pdf_path VARCHAR(500),
    sign_c_path VARCHAR(500),
    sign_v_path VARCHAR(500),
    seal_c_path VARCHAR(500),
    seal_v_path VARCHAR(500),
    createdAt TIMESTAMP DEFAULT NOW(),
    updatedAt TIMESTAMP DEFAULT NOW()
);
