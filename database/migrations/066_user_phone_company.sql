-- Add phone column to users table for storm report PDFs
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS company_name VARCHAR(255);

-- Seed existing users with company default
UPDATE users SET company_name = 'The Roof Docs' WHERE company_name IS NULL;

-- Add company defaults to system_settings if not exists
INSERT INTO system_settings (key, value, description)
VALUES
  ('company_name', '"The Roof Docs"', 'Default company name for reports and branding'),
  ('company_phone', '"(703) 555-0199"', 'Default company phone number')
ON CONFLICT (key) DO NOTHING;
