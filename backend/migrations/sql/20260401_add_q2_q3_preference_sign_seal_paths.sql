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
