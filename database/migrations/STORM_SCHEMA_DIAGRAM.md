# Storm Data Schema Diagram

## Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         STORM DATA SYSTEM                           │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────────────┐         ┌─────────────────────────┐
│     storm_events     │         │ storm_claim_outcomes    │
├──────────────────────┤         ├─────────────────────────┤
│ id (PK)             │◄────┐   │ id (PK)                │
│ address             │     │   │ storm_event_id (FK)    │
│ street_address      │     └───│ job_id (FK)            │
│ city                │         │ user_id (FK)           │
│ state               │         │                         │
│ zip_code            │         │ insurance_company       │
│ county              │         │ adjuster_name          │
│                     │         │ claim_number           │
│ latitude            │         │ claim_filed_date       │
│ longitude           │         │                         │
│                     │         │ claim_status           │
│ event_date          │         │ claim_result           │
│ event_type          │         │ approval_amount        │
│ hail_size_inches    │         │ final_settlement       │
│ hail_size_desc      │         │                         │
│ wind_speed_mph      │         │ key_arguments[]        │◄──┐
│                     │         │ supporting_evidence[]   │   │
│ data_source         │         │ challenges_faced[]      │   │ LEARNING
│ source_confidence   │         │ resolution_method       │   │  DATA
│ source_url          │         │                         │   │
│ source_metadata     │         │ adjuster_behavior       │   │
│                     │         │ adjuster_notes         │   │
│ discovered_by (FK)  │─┐       │ response_time_days     │   │
│ verified_by (FK)    │ │       │ required_reinspection  │   │
│ lookup_timestamp    │ │       │                         │   │
│ job_id (FK)         │─┼───┐   │ initial_denial_reasons[]│  │
│                     │ │   │   │ appeal_strategy        │   │
│ notes               │ │   │   │ appeal_outcome         │   │
│ is_active           │ │   │   │                         │   │
│ created_at          │ │   │   │ success_factors[]      │───┘
│ updated_at          │ │   │   │ lessons_learned        │
│ search_vector       │ │   │   │ created_at             │
└──────────────────────┘ │   │   │ updated_at             │
                         │   │   └─────────────────────────┘
                         │   │
         ┌───────────────┘   │   ┌─────────────────────────┐
         │                   │   │  storm_area_patterns    │
         │                   │   ├─────────────────────────┤
         ▼                   │   │ id (PK)                │
    ┌─────────┐              │   │ scope_type             │
    │  users  │              │   │ state                  │
    ├─────────┤              │   │ county                 │
    │ id (PK) │              │   │ city                   │
    │ email   │              │   │ zip_code               │
    │ name    │              │   │                         │
    │ role    │              │   │ total_events           │
    │ state   │              │   │ total_claims           │
    └─────────┘              │   │ successful_claims      │
         ▲                   │   │ success_rate           │
         │                   │   │                         │
         │                   │   │ common_event_types     │
         │                   │   │ common_insurers        │
         └───────────────┐   │   │ avg_approval_amount    │
                         │   │   │                         │
                         │   │   │ top_arguments[]        │
                         │   │   │ top_evidence_types[]   │
                         │   │   │ typical_adjuster_behavior│
    ┌─────────┐          │   │   │                         │
    │  jobs   │          │   │   │ earliest_event_date    │
    ├─────────┤          │   │   │ latest_event_date      │
    │ id (PK) │◄─────────┼───┘   │                         │
    │ job_num │          │       │ last_calculated_at     │
    │ user_id │          │       │ created_at             │
    │ title   │          │       │ updated_at             │
    │ status  │          │       └─────────────────────────┘
    │ ...     │          │
    └─────────┘          │       ┌─────────────────────────┐
                         │       │ storm_lookup_analytics  │
                         │       ├─────────────────────────┤
                         │       │ id (PK)                │
                         │       │ user_id (FK)           │
                         └───────┤                         │
                                 │ query_type             │
                                 │ query_address          │
                                 │ query_latitude         │
                                 │ query_longitude        │
                                 │ query_radius_miles     │
                                 │ query_date_range       │
                                 │                         │
                                 │ results_found          │
                                 │ storm_event_ids[]      │
                                 │                         │
                                 │ related_job_id (FK)    │
                                 │ session_id             │
                                 │ created_at             │
                                 └─────────────────────────┘
```

## Key Relationships

```
┌────────────────────────────────────────────────────────────┐
│                    RELATIONSHIP FLOWS                      │
└────────────────────────────────────────────────────────────┘

1. Storm Discovery Flow:
   User → discovers → Storm Event → links to → Job

2. Claim Outcome Flow:
   Storm Event → generates → Claim Outcome → records → Success Data

3. Learning Flow:
   Claim Outcomes → aggregate to → Area Patterns → inform → Susan AI

4. Analytics Flow:
   User → searches → Storm Events → tracks in → Lookup Analytics
```

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    SUSAN'S LEARNING PROCESS                     │
└─────────────────────────────────────────────────────────────────┘

1. DATA INPUT
   ┌─────────────┐
   │   Rep logs  │
   │ storm event │
   └──────┬──────┘
          │
          ▼
   ┌─────────────────┐
   │ storm_events    │ ──┐
   │ - location      │   │
   │ - date          │   │
   │ - hail size     │   │
   └─────────────────┘   │
                         │
2. CLAIM TRACKING        │
   ┌─────────────┐       │
   │  Rep wins   │       │
   │    claim    │       │
   └──────┬──────┘       │
          │              │
          ▼              │
   ┌─────────────────────┤
   │ storm_claim_outcomes│
   │ - what worked       │
   │ - arguments         │
   │ - evidence          │
   │ - adjuster behavior │
   └─────────┬───────────┘
             │
             │
3. AGGREGATION           │
             │            │
             ▼            │
   ┌────────────────────┐ │
   │ storm_area_patterns│ │
   │ - success rates    │ │
   │ - top strategies   │ │
   │ - common patterns  │ │
   └─────────┬──────────┘ │
             │            │
             │            │
4. SUSAN USES            │
             │            │
             ▼            │
   ┌──────────────────────┼───────────┐
   │  Susan AI Recommendations        │
   ├──────────────────────────────────┤
   │ "Based on 47 similar claims      │
   │  in this area, here's what       │
   │  works best..."                  │
   │                                  │
   │ ✓ Nearby storms                  │◄┘
   │ ✓ Success strategies             │
   │ ✓ Top arguments                  │
   │ ✓ Best evidence                  │
   │ ✓ Recent wins                    │
   └──────────────────────────────────┘
```

## Query Pattern Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    COMMON QUERY PATTERNS                        │
└─────────────────────────────────────────────────────────────────┘

1. "Storms near this address?"
   ┌────────────────┐
   │ Input:         │
   │ - lat/lon      │
   │ - radius       │
   └────────┬───────┘
            │
            ▼
   ┌──────────────────────────────┐
   │ find_storms_near_location()  │
   │ - Haversine distance calc    │
   │ - Filter by radius           │
   └────────┬─────────────────────┘
            │
            ▼
   ┌──────────────────────────────┐
   │ Returns:                     │
   │ - Storm list with distances  │
   │ - Sorted by proximity        │
   └──────────────────────────────┘

2. "What worked in this area?"
   ┌────────────────┐
   │ Input:         │
   │ - state        │
   │ - city/zip     │
   │ - insurer      │
   └────────┬───────┘
            │
            ▼
   ┌──────────────────────────────┐
   │ get_area_claim_strategies()  │
   │ - Join outcomes + events     │
   │ - Aggregate success data     │
   └────────┬─────────────────────┘
            │
            ▼
   ┌──────────────────────────────┐
   │ Returns:                     │
   │ - Success rate               │
   │ - Top arguments              │
   │ - Common evidence            │
   │ - Avg settlement             │
   └──────────────────────────────┘

3. "Show me recent wins"
   ┌────────────────┐
   │ Input:         │
   │ - state (opt)  │
   │ - limit        │
   └────────┬───────┘
            │
            ▼
   ┌──────────────────────────────┐
   │ recent_successful_claims view│
   │ - Pre-joined data            │
   │ - Filtered by result='won'   │
   └────────┬─────────────────────┘
            │
            ▼
   ┌──────────────────────────────┐
   │ Returns:                     │
   │ - Recent claim details       │
   │ - What made them successful  │
   └──────────────────────────────┘
```

## Index Strategy Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    INDEX OPTIMIZATION                           │
└─────────────────────────────────────────────────────────────────┘

storm_events table:
├─ PRIMARY KEY (id)                     ← Unique lookups
├─ idx_storm_events_location            ← Geographic filters
│  (state, city, zip_code)
├─ idx_storm_events_coords              ← Proximity searches
│  (latitude, longitude)
├─ idx_storm_events_date                ← Temporal queries
│  (event_date DESC)
├─ idx_storm_events_state_date          ← Combined queries
│  (state, event_date DESC)
│  WHERE is_active = TRUE
└─ idx_storm_events_search              ← Full-text search
   USING GIN(search_vector)

storm_claim_outcomes table:
├─ PRIMARY KEY (id)
├─ idx_storm_outcomes_storm             ← Link to storm
│  (storm_event_id)
├─ idx_storm_outcomes_job               ← Link to job
│  (job_id)
├─ idx_storm_outcomes_insurer           ← Filter by insurer
│  (insurance_company)
├─ idx_storm_outcomes_result            ← Success filtering
│  (claim_result)
├─ idx_storm_outcomes_arguments         ← Array searches
│  USING GIN(key_arguments)
└─ idx_storm_outcomes_evidence          ← Array searches
   USING GIN(supporting_evidence)
```

## Function Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    HELPER FUNCTIONS                             │
└─────────────────────────────────────────────────────────────────┘

calculate_distance_miles(lat1, lon1, lat2, lon2)
├─ Input: Two coordinate pairs
├─ Algorithm: Haversine formula
├─ Returns: Distance in miles
└─ Usage: Geographic proximity queries

find_storms_near_location(lat, lon, radius, days_back)
├─ Input: Search coordinates and filters
├─ Process:
│  1. Calculate distance for all storms
│  2. Filter by radius
│  3. Filter by date range
│  4. Sort by distance
├─ Returns: TABLE with storm details
└─ Usage: "Storms near this address?"

get_area_claim_strategies(state, city, zip, insurer)
├─ Input: Geographic and insurer filters
├─ Process:
│  1. Join outcomes with events
│  2. Filter by location
│  3. Aggregate success metrics
│  4. Extract top arguments/evidence
├─ Returns: Aggregated success data
└─ Usage: "What works in this area?"
```

## View Composition

```
┌─────────────────────────────────────────────────────────────────┐
│                    ANALYTICAL VIEWS                             │
└─────────────────────────────────────────────────────────────────┘

recent_successful_claims
├─ Source: storm_claim_outcomes ⋈ storm_events
├─ Filter: claim_result IN ('won', 'partial_win')
├─ Columns:
│  - Event details (date, location, type)
│  - Claim details (insurer, settlement)
│  - Success data (arguments, evidence, factors)
└─ Order: outcome_date DESC

storm_hotspots
├─ Source: storm_events ⟕ storm_claim_outcomes
├─ Group by: state, city, zip_code
├─ Calculations:
│  - Total storms
│  - Successful claims count
│  - Success rate percentage
│  - Average hail size
├─ Filter: COUNT(*) >= 3
└─ Order: total_storms DESC, success_rate DESC
```

## Scale & Performance

```
┌─────────────────────────────────────────────────────────────────┐
│                    PERFORMANCE TARGETS                          │
└─────────────────────────────────────────────────────────────────┘

Expected Data Volume:
├─ storm_events:         100K - 1M rows
├─ storm_claim_outcomes: 10K - 100K rows
├─ storm_area_patterns:  1K - 10K rows
└─ storm_lookup_analytics: 10K+ rows (cleaned periodically)

Query Performance:
├─ Geographic lookup (<10 mi):     < 100ms
├─ Area strategies:                < 50ms  (pre-calculated)
├─ Recent wins view:               < 30ms  (indexed)
├─ Storm search (filtered):        < 200ms
└─ Susan recommendations (all):    < 300ms

Optimization Strategies:
├─ Haversine function marked IMMUTABLE
├─ Composite indexes on common query patterns
├─ GIN indexes for full-text and array searches
├─ Pre-calculated area_patterns table
├─ Generated tsvector column for search
└─ Optional PostGIS for production scale
```

---

**Legend**:
- `(PK)` = Primary Key
- `(FK)` = Foreign Key
- `[]` = Array field
- `⋈` = Inner join
- `⟕` = Left join
- `→` = References
- `◄` = Referenced by
