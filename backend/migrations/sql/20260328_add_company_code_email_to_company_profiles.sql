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
