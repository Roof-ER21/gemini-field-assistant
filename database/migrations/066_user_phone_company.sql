-- Add phone column to users table for storm report PDFs
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS company_name VARCHAR(255);

-- Set company for all users
UPDATE users SET company_name = 'Roof ER The Roof Docs' WHERE company_name IS NULL OR company_name = 'The Roof Docs';

-- Sync phone numbers from employee_profiles into users table where missing
UPDATE users u
SET phone = ep.phone_number
FROM employee_profiles ep
WHERE LOWER(u.email) = LOWER(ep.email)
  AND ep.phone_number IS NOT NULL
  AND ep.phone_number != ''
  AND (u.phone IS NULL OR u.phone = '');
