-- Rollback for 086_marketing_role.sql.
--
-- Demotes any marketing users back to sales_rep. The role column itself is
-- VARCHAR(50) and unchanged, so there's no DDL to reverse beyond restoring
-- the previous comment. The idx_users_role index is left in place since
-- earlier code paths already used it.

COMMENT ON COLUMN users.role IS
  'sales_rep | manager | admin';

UPDATE users SET role = 'sales_rep' WHERE role = 'marketing';
