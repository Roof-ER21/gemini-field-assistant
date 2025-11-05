-- ============================================================================
-- FIX ADMIN ROLE FOR ahmed.mahmoud@theroofdocs.com
-- ============================================================================

-- Show current state
SELECT '=== BEFORE UPDATE ===' as status;
SELECT email, name, role, created_at
FROM users
WHERE LOWER(email) = LOWER('ahmed.mahmoud@theroofdocs.com');

-- Check if user exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE LOWER(email) = LOWER('ahmed.mahmoud@theroofdocs.com')) THEN
    RAISE NOTICE 'WARNING: User ahmed.mahmoud@theroofdocs.com does not exist in database!';
    RAISE NOTICE 'User must log in first to create their account.';
  ELSE
    RAISE NOTICE 'User exists - proceeding with admin role update';
  END IF;
END $$;

-- Update role to admin
UPDATE users
SET role = 'admin',
    updated_at = NOW()
WHERE LOWER(email) = LOWER('ahmed.mahmoud@theroofdocs.com');

-- Show updated state
SELECT '=== AFTER UPDATE ===' as status;
SELECT email, name, role, updated_at
FROM users
WHERE LOWER(email) = LOWER('ahmed.mahmoud@theroofdocs.com');

-- Show all admin users
SELECT '=== ALL ADMIN USERS ===' as status;
SELECT email, name, role
FROM users
WHERE role = 'admin'
ORDER BY created_at;

-- Show all users (for reference)
SELECT '=== ALL USERS ===' as status;
SELECT email, name, role, created_at
FROM users
ORDER BY created_at DESC;
