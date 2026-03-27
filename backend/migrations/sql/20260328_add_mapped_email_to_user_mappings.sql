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
