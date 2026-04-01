                                  
                                                           
                                                                                           

                                                                
CREATE TABLE IF NOT EXISTS general_machines (
  id SERIAL PRIMARY KEY,
  machine_id VARCHAR(20) UNIQUE NOT NULL,
  customer_id INT NOT NULL REFERENCES customers(id),
  customer_name VARCHAR(100) NOT NULL,
  address TEXT,
  model VARCHAR(100) NOT NULL,
  machine_title VARCHAR(150) NOT NULL,
  serial_no VARCHAR(100),
  start_count INT DEFAULT 0,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

ALTER TABLE general_machines
ADD COLUMN IF NOT EXISTS entry_date DATE;

UPDATE general_machines
SET entry_date = COALESCE(entry_date, DATE("createdAt"), CURRENT_DATE)
WHERE entry_date IS NULL;

CREATE INDEX IF NOT EXISTS general_machines_entry_date_idx
ON general_machines(entry_date);
                                                              

                                                                
ALTER TABLE ui_settings
ADD COLUMN IF NOT EXISTS quotation2_template_pdf_path VARCHAR(500);
                                                              

                                                                
ALTER TABLE ui_settings
ADD COLUMN IF NOT EXISTS quotation3_template_pdf_path VARCHAR(500);
                                                              

                                                               
ALTER TABLE rental_machines
ADD COLUMN IF NOT EXISTS entry_date DATE;

UPDATE rental_machines
SET entry_date = COALESCE(entry_date, DATE("createdAt"), CURRENT_DATE)
WHERE entry_date IS NULL;

CREATE INDEX IF NOT EXISTS rental_machines_entry_date_idx
ON rental_machines(entry_date);
                                                             

                                                                 
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
    primary_color VARCHAR(24),
    background_color VARCHAR(24),
    button_color VARCHAR(24),
    mode_theme VARCHAR(16),
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);
                                                               

                                                                            
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

ALTER TABLE company_profiles
ADD COLUMN IF NOT EXISTS company_code VARCHAR(40);

ALTER TABLE company_profiles
ADD COLUMN IF NOT EXISTS email VARCHAR(200);

CREATE UNIQUE INDEX IF NOT EXISTS company_profiles_company_code_unique_idx
ON company_profiles (UPPER(company_code))
WHERE company_code IS NOT NULL AND TRIM(company_code) <> '';
                                                                          

                                                           
CREATE INDEX IF NOT EXISTS invoices_invoice_date_no_idx
ON invoices(invoice_date, invoice_no);
                                                         

                                                                   
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

ALTER TABLE user_mappings
ADD COLUMN IF NOT EXISTS mapped_email VARCHAR(200);
                                                                 

                                                                  
ALTER TABLE rental_machine_counts
ADD COLUMN IF NOT EXISTS entry_date DATE;

ALTER TABLE rental_machine_counts
ALTER COLUMN entry_date SET DEFAULT CURRENT_DATE;

UPDATE rental_machine_counts
SET entry_date = COALESCE(entry_date, DATE("createdAt"), CURRENT_DATE)
WHERE entry_date IS NULL;

CREATE INDEX IF NOT EXISTS rental_machine_counts_entry_date_idx
ON rental_machine_counts(entry_date);

ALTER TABLE rental_machine_consumables
ADD COLUMN IF NOT EXISTS entry_date DATE;

ALTER TABLE rental_machine_consumables
ALTER COLUMN entry_date SET DEFAULT CURRENT_DATE;

UPDATE rental_machine_consumables
SET entry_date = COALESCE(entry_date, DATE("createdAt"), CURRENT_DATE)
WHERE entry_date IS NULL;

CREATE INDEX IF NOT EXISTS rental_machine_consumables_entry_date_idx
ON rental_machine_consumables(entry_date);
                                                                

                                                         
CREATE INDEX IF NOT EXISTS expenses_date_idx
ON expenses(date);
                                                       

                                                              
CREATE INDEX IF NOT EXISTS invoices_pending_lookup_idx
ON invoices(payment_status, invoice_date DESC, id DESC);
                                                            

                                                                             
CREATE INDEX IF NOT EXISTS rental_machine_consumables_customer_entry_idx
ON rental_machine_consumables(customer_id, entry_date, id);
                                                                           

                                                                                
CREATE INDEX IF NOT EXISTS rental_machine_counts_customer_entry_machine_idx
ON rental_machine_counts(customer_id, entry_date, rental_machine_id, id);
                                                                              

                                                                      
ALTER TABLE ui_settings
ADD COLUMN IF NOT EXISTS sign_q2_path VARCHAR(500);

ALTER TABLE ui_settings
ADD COLUMN IF NOT EXISTS seal_q2_path VARCHAR(500);

ALTER TABLE ui_settings
ADD COLUMN IF NOT EXISTS sign_q3_path VARCHAR(500);

ALTER TABLE ui_settings
ADD COLUMN IF NOT EXISTS seal_q3_path VARCHAR(500);

ALTER TABLE user_preference_settings
ADD COLUMN IF NOT EXISTS sign_q2_path VARCHAR(500);

ALTER TABLE user_preference_settings
ADD COLUMN IF NOT EXISTS seal_q2_path VARCHAR(500);

ALTER TABLE user_preference_settings
ADD COLUMN IF NOT EXISTS sign_q3_path VARCHAR(500);

ALTER TABLE user_preference_settings
ADD COLUMN IF NOT EXISTS seal_q3_path VARCHAR(500);
                                                                    

                                                                      
ALTER TABLE user_invoice_mappings
ADD COLUMN IF NOT EXISTS sign_q2_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE user_invoice_mappings
ADD COLUMN IF NOT EXISTS seal_q2_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE user_invoice_mappings
ADD COLUMN IF NOT EXISTS sign_q3_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE user_invoice_mappings
ADD COLUMN IF NOT EXISTS seal_q3_enabled BOOLEAN NOT NULL DEFAULT FALSE;
                                                                    

                                                                       
ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS quotation2_customer_name VARCHAR(255);

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS quotation3_customer_name VARCHAR(255);
                                                                     

                                                                 
ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS quotation2_date DATE DEFAULT CURRENT_DATE;

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS quotation3_date DATE DEFAULT CURRENT_DATE;

UPDATE invoices
SET quotation2_date = COALESCE(quotation2_date, quotation_date, invoice_date, DATE("createdAt"), CURRENT_DATE)
WHERE quotation2_date IS NULL;

UPDATE invoices
SET quotation3_date = COALESCE(quotation3_date, quotation_date, invoice_date, DATE("createdAt"), CURRENT_DATE)
WHERE quotation3_date IS NULL;
                                                               

                                                                       
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
    UNIQUE (user_id, database_name, quotation_type)
);

ALTER TABLE user_quotation_render_settings
ADD COLUMN IF NOT EXISTS render_overrides_json TEXT NOT NULL DEFAULT '{}';
                                                                     

                                                             
ALTER TABLE users
ADD COLUMN IF NOT EXISTS password_plain VARCHAR(255);

UPDATE users
SET password_plain = password
WHERE (password_plain IS NULL OR TRIM(password_plain) = '')
  AND COALESCE(password, '') !~ '^\\$2[aby]\\$';
                                                           
