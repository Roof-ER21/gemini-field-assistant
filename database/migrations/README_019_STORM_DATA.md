# Migration 019: Storm Data Learning System

## Overview

This migration adds comprehensive storm/hail data tracking for Susan's learning capabilities. It enables storing verified storm events, tracking claim outcomes, and analyzing patterns to help reps win more claims.

## Schema Design

### Tables Created

#### 1. `storm_events`
**Purpose**: Core table for verified storm/hail events

**Key Features**:
- Full address and coordinate storage for geo-queries
- Storm event details (date, type, hail size, wind speed)
- Multiple data sources (IHM, NOAA, NWS, manual entry)
- User discovery and verification tracking
- Links to jobs table
- Full-text search support

**Indexes**:
- Geographic (state, city, zip)
- Temporal (event date)
- Coordinate-based proximity
- User tracking
- Full-text search

**Example Usage**:
```sql
-- Find all hail storms in Fredericksburg, VA
SELECT * FROM storm_events
WHERE city = 'Fredericksburg'
  AND state = 'VA'
  AND event_type = 'hail'
  AND is_active = TRUE
ORDER BY event_date DESC;
```

#### 2. `storm_claim_outcomes`
**Purpose**: Track claim outcomes and successful strategies

**Key Features**:
- Complete claim lifecycle tracking
- Insurance company and adjuster information
- Success/failure outcomes with amounts
- **Key arguments used** (array field)
- **Supporting evidence types** (array field)
- Adjuster behavior patterns
- Timeline tracking (initial, appeal, resolution)
- Success factors and lessons learned

**Indexes**:
- Storm event linking
- Job linking
- Insurance company
- Claim result
- GIN indexes on array fields for fast searches

**Example Usage**:
```sql
-- Find successful claims with specific argument
SELECT * FROM storm_claim_outcomes
WHERE claim_result = 'won'
  AND 'IHM_report' = ANY(supporting_evidence)
ORDER BY outcome_date DESC
LIMIT 10;
```

#### 3. `storm_area_patterns`
**Purpose**: Pre-calculated aggregates for geographic areas

**Key Features**:
- Multi-level geography (zip, city, county, state)
- Success rate calculations
- Common patterns (event types, insurers)
- Top arguments and evidence types
- Auto-calculated statistics

**Scopes**:
- `zip_code`: Most granular (best for specific addresses)
- `city`: City-level patterns
- `county`: County-wide analysis
- `state`: State-level trends

**Example Usage**:
```sql
-- Get patterns for specific zip code
SELECT * FROM storm_area_patterns
WHERE scope_type = 'zip_code'
  AND zip_code = '22401';
```

#### 4. `storm_lookup_analytics`
**Purpose**: Track how users query storm data

**Key Features**:
- Query type tracking
- Search parameters logging
- Results tracking
- Session and job context

**Use Cases**:
- Understand what reps search for most
- Identify gaps in storm data
- Improve search recommendations

### Functions Created

#### 1. `calculate_distance_miles(lat1, lon1, lat2, lon2)`
**Purpose**: Calculate distance between two coordinates

**Returns**: Distance in miles (DECIMAL)

**Algorithm**: Haversine formula

**Example**:
```sql
SELECT calculate_distance_miles(
    38.3032053, -77.4605399,  -- Fredericksburg, VA
    38.9072, -77.0369          -- Washington, DC
) as distance_miles;
-- Returns: ~53.42
```

#### 2. `find_storms_near_location(latitude, longitude, radius_miles, days_back)`
**Purpose**: Find storms within radius of coordinates

**Parameters**:
- `p_latitude`: Target latitude
- `p_longitude`: Target longitude
- `p_radius_miles`: Search radius (default: 10)
- `p_days_back`: Days to look back (default: 365)

**Returns**: Table with storm details and distances

**Example**:
```sql
-- Find storms within 25 miles in last 2 years
SELECT * FROM find_storms_near_location(
    38.3032053,  -- lat
    -77.4605399, -- lon
    25,          -- radius
    730          -- days
);
```

#### 3. `get_area_claim_strategies(state, city, zip_code, insurance_company)`
**Purpose**: Get aggregated successful strategies for an area

**Parameters**:
- `p_state`: State code (required)
- `p_city`: City name (optional)
- `p_zip_code`: ZIP code (optional)
- `p_insurance_company`: Filter by insurer (optional)

**Returns**:
- `total_claims`: Number of successful claims
- `success_rate`: Win percentage
- `top_arguments`: Most successful arguments
- `common_evidence`: Most effective evidence types
- `avg_settlement`: Average settlement amount

**Example**:
```sql
-- Get strategies for State Farm claims in VA
SELECT * FROM get_area_claim_strategies(
    'VA',
    NULL,
    NULL,
    'State Farm'
);
```

### Views Created

#### 1. `recent_successful_claims`
**Purpose**: Quick access to recent wins with full details

**Use Case**: Show reps what's working right now

**Example**:
```sql
-- Get recent wins in Maryland
SELECT * FROM recent_successful_claims
WHERE state = 'MD'
LIMIT 10;
```

#### 2. `storm_hotspots`
**Purpose**: Identify areas with high storm activity and success rates

**Filters**: Only areas with 3+ storms

**Use Case**: Target high-value areas for canvassing

**Example**:
```sql
-- Find top storm areas with best success rates
SELECT * FROM storm_hotspots
WHERE state = 'VA'
  AND success_rate >= 80
ORDER BY total_storms DESC;
```

## Query Examples for Susan

### 1. "Any storms near this address?"

```sql
-- Using coordinates from geocoding
SELECT
    se.event_date,
    se.event_type,
    se.hail_size_description,
    se.city,
    se.zip_code,
    calculate_distance_miles(
        38.3032053, -77.4605399,
        se.latitude, se.longitude
    ) as miles_away
FROM storm_events se
WHERE
    calculate_distance_miles(38.3032053, -77.4605399, se.latitude, se.longitude) <= 10
    AND se.is_active = TRUE
    AND se.event_date >= CURRENT_DATE - INTERVAL '2 years'
ORDER BY miles_away ASC, event_date DESC;

-- Or use the helper function
SELECT * FROM find_storms_near_location(38.3032053, -77.4605399, 10, 730);
```

### 2. "What worked for similar claims in this area?"

```sql
-- Get successful strategies for zip code
SELECT
    sco.insurance_company,
    sco.key_arguments,
    sco.supporting_evidence,
    sco.success_factors,
    sco.final_settlement,
    sco.adjuster_behavior
FROM storm_claim_outcomes sco
JOIN storm_events se ON sco.storm_event_id = se.id
WHERE
    se.zip_code = '22401'
    AND sco.claim_result IN ('won', 'partial_win')
ORDER BY sco.outcome_date DESC
LIMIT 10;

-- Or use aggregated function
SELECT * FROM get_area_claim_strategies('VA', 'Fredericksburg', '22401');
```

### 3. "Common storm patterns in this zip code?"

```sql
-- From patterns table (pre-calculated)
SELECT
    total_events,
    success_rate,
    common_event_types,
    common_insurers,
    top_arguments,
    average_approval_amount
FROM storm_area_patterns
WHERE scope_type = 'zip_code'
  AND zip_code = '22401';

-- Or calculate on-the-fly
SELECT
    COUNT(*) as total_storms,
    AVG(hail_size_inches) as avg_hail_size,
    MODE() WITHIN GROUP (ORDER BY event_type) as most_common_type,
    MAX(event_date) as last_storm,
    MIN(event_date) as first_storm
FROM storm_events
WHERE zip_code = '22401'
  AND is_active = TRUE;
```

### 4. "Show me what arguments work with difficult adjusters"

```sql
SELECT
    sco.adjuster_name,
    sco.insurance_company,
    sco.adjuster_behavior,
    ARRAY_AGG(DISTINCT arg) as successful_arguments,
    COUNT(*) as wins
FROM storm_claim_outcomes sco
CROSS JOIN UNNEST(sco.key_arguments) as arg
WHERE
    sco.claim_result = 'won'
    AND sco.adjuster_behavior = 'initially_resistant'
GROUP BY sco.adjuster_name, sco.insurance_company, sco.adjuster_behavior
HAVING COUNT(*) >= 2
ORDER BY wins DESC;
```

### 5. "Best evidence types for State Farm claims"

```sql
SELECT
    unnest(supporting_evidence) as evidence_type,
    COUNT(*) as times_used,
    ROUND(AVG(final_settlement), 2) as avg_settlement,
    ROUND(
        100.0 * COUNT(*) FILTER (WHERE claim_result = 'won') / COUNT(*),
        2
    ) as success_rate
FROM storm_claim_outcomes
WHERE insurance_company = 'State Farm'
  AND claim_result IN ('won', 'partial_win')
GROUP BY evidence_type
ORDER BY success_rate DESC, times_used DESC;
```

### 6. "Timeline analysis: How long until approval?"

```sql
SELECT
    insurance_company,
    ROUND(AVG(response_time_days), 1) as avg_response_days,
    COUNT(*) FILTER (WHERE required_reinspection) as reinspections_required,
    COUNT(*) as total_claims,
    ROUND(AVG(final_settlement), 2) as avg_settlement
FROM storm_claim_outcomes
WHERE claim_result IN ('won', 'partial_win')
  AND response_time_days IS NOT NULL
GROUP BY insurance_company
ORDER BY avg_response_days ASC;
```

## Data Entry Workflow

### Adding a New Storm Event

```sql
INSERT INTO storm_events (
    address,
    street_address,
    city,
    state,
    zip_code,
    county,
    latitude,
    longitude,
    event_date,
    event_type,
    hail_size_inches,
    hail_size_description,
    data_source,
    source_confidence,
    discovered_by,
    job_id,
    notes
) VALUES (
    '456 Oak Ave, Richmond, VA 23220',
    '456 Oak Ave',
    'Richmond',
    'VA',
    '23220',
    'Richmond City',
    37.5407,
    -77.4360,
    '2024-08-20',
    'hail',
    2.00,
    'tennis ball',
    'IHM',
    'verified',
    '123e4567-e89b-12d3-a456-426614174000', -- user_id
    '456e7890-e89b-12d3-a456-426614174000', -- job_id
    'Confirmed via IHM report #12345'
);
```

### Recording Claim Outcome

```sql
INSERT INTO storm_claim_outcomes (
    storm_event_id,
    job_id,
    user_id,
    insurance_company,
    adjuster_name,
    claim_number,
    claim_status,
    claim_result,
    final_settlement,
    key_arguments,
    supporting_evidence,
    adjuster_behavior,
    response_time_days,
    success_factors,
    lessons_learned
) VALUES (
    '789e0123-e89b-12d3-a456-426614174000', -- storm_event_id
    '456e7890-e89b-12d3-a456-426614174000', -- job_id
    '123e4567-e89b-12d3-a456-426614174000', -- user_id
    'State Farm',
    'John Smith',
    'SF-2024-12345',
    'approved',
    'won',
    15750.00,
    ARRAY[
        'Provided detailed IHM report showing 2-inch hail',
        'Submitted photos of clear impact damage',
        'Referenced VA building codes for required replacement'
    ],
    ARRAY['IHM_report', 'photos', 'engineer_report'],
    'initially_resistant',
    14,
    ARRAY['strong_documentation', 'quick_response', 'professional_presentation'],
    'Adjuster initially denied but approved after engineer report'
);
```

## Integration with Existing Tables

### Links to Jobs Table
```sql
-- Find all storms for a specific job
SELECT se.*
FROM storm_events se
WHERE se.job_id = '456e7890-e89b-12d3-a456-426614174000';

-- Get job details with storm info
SELECT
    j.job_number,
    j.title,
    j.status,
    se.event_date,
    se.event_type,
    se.hail_size_description,
    sco.claim_result,
    sco.final_settlement
FROM jobs j
LEFT JOIN storm_events se ON j.id = se.job_id
LEFT JOIN storm_claim_outcomes sco ON se.id = sco.storm_event_id
WHERE j.user_id = '123e4567-e89b-12d3-a456-426614174000';
```

### Links to Users Table
```sql
-- Track user's storm lookup performance
SELECT
    u.name,
    COUNT(DISTINCT se.id) as storms_found,
    COUNT(DISTINCT sco.id) as claims_filed,
    COUNT(*) FILTER (WHERE sco.claim_result = 'won') as claims_won,
    ROUND(AVG(sco.final_settlement), 2) as avg_settlement
FROM users u
LEFT JOIN storm_events se ON u.id = se.discovered_by
LEFT JOIN storm_claim_outcomes sco ON se.id = sco.storm_event_id
WHERE u.role = 'sales_rep'
GROUP BY u.id, u.name;
```

### Links to Global Learnings
```sql
-- Create global learning from successful storm claim
INSERT INTO global_learnings (
    normalized_key,
    scope_key,
    scope_state,
    scope_insurer,
    content,
    status
)
SELECT
    'storm_claim_strategy',
    'VA_StateF arm',
    'VA',
    'State Farm',
    'For State Farm claims in VA: ' || array_to_string(key_arguments, '; '),
    'ready'
FROM storm_claim_outcomes
WHERE claim_result = 'won'
  AND insurance_company = 'State Farm'
LIMIT 1;
```

## Performance Considerations

### Indexes Explained

1. **Geographic Indexes**: Enable fast location-based queries
2. **Temporal Indexes**: Optimize date range searches
3. **GIN Indexes on Arrays**: Fast searches within array fields
4. **Composite Indexes**: Multi-column queries (state + date)
5. **Full-Text Search**: Text-based address searches

### Query Optimization Tips

1. **Use the helper functions** for complex calculations
2. **Filter by state first** to reduce search space
3. **Use views** for common queries (pre-optimized)
4. **Consider PostGIS** for advanced geographic queries
5. **Use EXPLAIN ANALYZE** to check query plans

### Optional PostGIS Enhancement

For production deployments with heavy geographic queries:

```sql
-- Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- Add geography column
ALTER TABLE storm_events
ADD COLUMN location GEOGRAPHY(POINT, 4326);

-- Update existing data
UPDATE storm_events
SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography;

-- Create spatial index
CREATE INDEX idx_storm_events_geography
ON storm_events USING GIST(location);

-- Query within radius (much faster than Haversine)
SELECT *
FROM storm_events
WHERE ST_DWithin(
    location,
    ST_SetSRID(ST_MakePoint(-77.4605399, 38.3032053), 4326)::geography,
    16093.4  -- 10 miles in meters
)
ORDER BY ST_Distance(
    location,
    ST_SetSRID(ST_MakePoint(-77.4605399, 38.3032053), 4326)::geography
) ASC;
```

## Maintenance & Updates

### Updating Area Patterns

The `storm_area_patterns` table should be recalculated periodically:

```sql
-- Recalculate patterns for a zip code
INSERT INTO storm_area_patterns (
    scope_type, state, zip_code,
    total_events, total_claims, successful_claims, success_rate,
    common_event_types, average_approval_amount,
    earliest_event_date, latest_event_date,
    last_calculated_at
)
SELECT
    'zip_code',
    se.state,
    se.zip_code,
    COUNT(DISTINCT se.id),
    COUNT(DISTINCT sco.id),
    COUNT(*) FILTER (WHERE sco.claim_result IN ('won', 'partial_win')),
    ROUND(
        100.0 * COUNT(*) FILTER (WHERE sco.claim_result IN ('won', 'partial_win'))
        / NULLIF(COUNT(DISTINCT sco.id), 0),
        2
    ),
    jsonb_object_agg(se.event_type, type_count),
    ROUND(AVG(sco.final_settlement), 2),
    MIN(se.event_date),
    MAX(se.event_date),
    NOW()
FROM storm_events se
LEFT JOIN storm_claim_outcomes sco ON se.id = sco.storm_event_id
CROSS JOIN LATERAL (
    SELECT se.event_type, COUNT(*) as type_count
    FROM storm_events
    WHERE zip_code = se.zip_code
    GROUP BY event_type
) type_counts
WHERE se.zip_code = '22401'
GROUP BY se.state, se.zip_code
ON CONFLICT (scope_type, state, county, city, zip_code)
DO UPDATE SET
    total_events = EXCLUDED.total_events,
    total_claims = EXCLUDED.total_claims,
    successful_claims = EXCLUDED.successful_claims,
    success_rate = EXCLUDED.success_rate,
    common_event_types = EXCLUDED.common_event_types,
    average_approval_amount = EXCLUDED.average_approval_amount,
    earliest_event_date = EXCLUDED.earliest_event_date,
    latest_event_date = EXCLUDED.latest_event_date,
    last_calculated_at = NOW();
```

## Running the Migration

```bash
# From project root
cd /Users/a21/gemini-field-assistant

# Run migration on Railway
railway run psql $DATABASE_URL -f database/migrations/019_storm_data_learning.sql

# Or connect locally
psql $DATABASE_URL -f database/migrations/019_storm_data_learning.sql
```

## Testing the Schema

```sql
-- Test distance calculation
SELECT calculate_distance_miles(38.3032053, -77.4605399, 38.9072, -77.0369);

-- Test storm lookup
SELECT * FROM find_storms_near_location(38.3032053, -77.4605399, 25, 365);

-- Test views
SELECT * FROM recent_successful_claims LIMIT 5;
SELECT * FROM storm_hotspots WHERE state = 'VA' LIMIT 5;

-- Test sample data
SELECT * FROM storm_events WHERE city = 'Fredericksburg';
```

## Next Steps

1. **Backend API Integration**: Create REST endpoints for storm queries
2. **Frontend UI**: Build storm lookup interface for reps
3. **Automated Data Import**: Set up cron jobs to import IHM/NOAA data
4. **Susan Integration**: Connect to chat system for contextual recommendations
5. **Analytics Dashboard**: Visualize storm patterns and claim success rates

## Related Migrations

- `009_jobs_table.sql`: Job tracking (linked via `job_id`)
- `016_chat_feedback.sql`: User feedback system
- `017_global_learning.sql`: Knowledge base (can reference storm strategies)

---

**Migration Author**: Claude Code
**Date**: January 29, 2025
**Version**: 019
