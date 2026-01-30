-- Seed default territories: DMV, PA, Richmond Area
-- These are company-wide territories that all reps can see

INSERT INTO territories (id, name, description, color, north_lat, south_lat, east_lng, west_lng, center_lat, center_lng, is_shared, created_at, updated_at)
VALUES
  -- DMV: Northern Virginia & Maryland
  (gen_random_uuid(), 'DMV', 'Northern Virginia & Maryland metro area', '#3b82f6', 39.5, 38.5, -76.5, -77.5, 39.0, -77.0, true, NOW(), NOW()),

  -- PA: Pennsylvania
  (gen_random_uuid(), 'PA', 'Pennsylvania state coverage', '#22c55e', 42.3, 39.7, -74.7, -80.5, 41.0, -77.5, true, NOW(), NOW()),

  -- RA: Richmond Area
  (gen_random_uuid(), 'RA', 'Richmond, Virginia metro area', '#f59e0b', 37.8, 37.3, -77.2, -77.7, 37.55, -77.45, true, NOW(), NOW())
ON CONFLICT DO NOTHING;
