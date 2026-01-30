-- Fix duplicate territories issue
-- 1. Remove duplicate territories (keep oldest)
-- 2. Add unique constraint on name field

-- Step 1: Delete duplicate territories, keeping only the oldest one for each name
WITH duplicates AS (
  SELECT id,
         name,
         ROW_NUMBER() OVER (PARTITION BY name ORDER BY created_at ASC) as rn
  FROM territories
  WHERE archived_at IS NULL
)
DELETE FROM territories
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Step 2: Add unique constraint on name field if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'territories_name_unique'
  ) THEN
    ALTER TABLE territories ADD CONSTRAINT territories_name_unique UNIQUE (name);
  END IF;
END $$;

-- Step 3: Verify we have exactly 3 default territories
DO $$
DECLARE
  territory_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO territory_count
  FROM territories
  WHERE name IN ('DMV', 'PA', 'RA') AND archived_at IS NULL;

  IF territory_count < 3 THEN
    RAISE NOTICE 'Missing default territories. Expected 3, found %.', territory_count;
  ELSIF territory_count > 3 THEN
    RAISE WARNING 'Duplicate territories still exist! Found % territories.', territory_count;
  ELSE
    RAISE NOTICE 'Territory cleanup successful. 3 unique territories confirmed.';
  END IF;
END $$;
