-- Promote Ahmed Mahmoud to admin role
-- Run this with: railway run psql < scripts/promote-ahmed-admin.sql
-- Or via Railway console

UPDATE users
SET role = 'admin'
WHERE email = 'ahmed.mahmoud@theroofdocs.com';

-- Show result
SELECT id, email, name, role
FROM users
WHERE email = 'ahmed.mahmoud@theroofdocs.com';
