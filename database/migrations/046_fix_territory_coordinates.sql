-- Fix Territory Coordinates
-- Update existing territories (DMV, PA, RA) with proper coordinate data

-- Update DMV (DC/Maryland/Virginia)
UPDATE territories
SET
  north_lat = 39.7,
  south_lat = 38.0,
  east_lng = -76.0,
  west_lng = -78.5,
  center_lat = 38.9072,
  center_lng = -77.0369,
  updated_at = NOW()
WHERE LOWER(name) = 'dmv' AND archived_at IS NULL;

-- Update PA (Pennsylvania)
UPDATE territories
SET
  north_lat = 42.3,
  south_lat = 39.7,
  east_lng = -74.7,
  west_lng = -80.5,
  center_lat = 40.2732,
  center_lng = -76.8867,
  updated_at = NOW()
WHERE LOWER(name) = 'pa' AND archived_at IS NULL;

-- Update RA (Richmond Area - Virginia)
UPDATE territories
SET
  north_lat = 38.2,
  south_lat = 36.8,
  east_lng = -76.5,
  west_lng = -78.5,
  center_lat = 37.5407,
  center_lng = -77.4360,
  updated_at = NOW()
WHERE LOWER(name) = 'ra' AND archived_at IS NULL;

-- Verify the updates
DO $$
DECLARE
  dmv_coords_ok BOOLEAN;
  pa_coords_ok BOOLEAN;
  ra_coords_ok BOOLEAN;
BEGIN
  -- Check DMV
  SELECT (north_lat IS NOT NULL AND south_lat IS NOT NULL AND
          east_lng IS NOT NULL AND west_lng IS NOT NULL AND
          center_lat IS NOT NULL AND center_lng IS NOT NULL)
  INTO dmv_coords_ok
  FROM territories WHERE LOWER(name) = 'dmv' AND archived_at IS NULL LIMIT 1;

  -- Check PA
  SELECT (north_lat IS NOT NULL AND south_lat IS NOT NULL AND
          east_lng IS NOT NULL AND west_lng IS NOT NULL AND
          center_lat IS NOT NULL AND center_lng IS NOT NULL)
  INTO pa_coords_ok
  FROM territories WHERE LOWER(name) = 'pa' AND archived_at IS NULL LIMIT 1;

  -- Check RA
  SELECT (north_lat IS NOT NULL AND south_lat IS NOT NULL AND
          east_lng IS NOT NULL AND west_lng IS NOT NULL AND
          center_lat IS NOT NULL AND center_lng IS NOT NULL)
  INTO ra_coords_ok
  FROM territories WHERE LOWER(name) = 'ra' AND archived_at IS NULL LIMIT 1;

  IF dmv_coords_ok AND pa_coords_ok AND ra_coords_ok THEN
    RAISE NOTICE '✅ All territory coordinates updated successfully';
  ELSE
    RAISE WARNING '⚠️ Some territory coordinates may be missing:';
    IF NOT dmv_coords_ok THEN RAISE WARNING '  - DMV coordinates incomplete or missing'; END IF;
    IF NOT pa_coords_ok THEN RAISE WARNING '  - PA coordinates incomplete or missing'; END IF;
    IF NOT ra_coords_ok THEN RAISE WARNING '  - RA coordinates incomplete or missing'; END IF;
  END IF;
END $$;
