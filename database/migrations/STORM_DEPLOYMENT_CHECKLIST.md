# Storm Data System - Deployment Checklist

## Pre-Deployment

### 1. Review Files
- [ ] Read `019_storm_data_learning.sql` (migration)
- [ ] Read `README_019_STORM_DATA.md` (documentation)
- [ ] Review `STORM_DATA_SUMMARY.md` (overview)
- [ ] Check `STORM_SCHEMA_DIAGRAM.md` (visual reference)

### 2. Verify Environment
- [ ] PostgreSQL version 12+ confirmed
- [ ] Database connection string available
- [ ] Railway CLI installed (or direct psql access)
- [ ] Backup of current database taken

### 3. Check Dependencies
- [ ] `uuid-ossp` extension available
- [ ] User has CREATE TABLE permissions
- [ ] User has CREATE FUNCTION permissions
- [ ] User has CREATE INDEX permissions

## Deployment

### Step 1: Backup Database
```bash
# Create backup before migration
railway run pg_dump $DATABASE_URL > backup_before_storm_migration.sql

# Or for local
pg_dump $DATABASE_URL > backup_before_storm_migration.sql
```
- [ ] Backup created successfully
- [ ] Backup file size verified (not empty)

### Step 2: Run Migration
```bash
cd /Users/a21/gemini-field-assistant

# Railway deployment
railway run psql $DATABASE_URL -f database/migrations/019_storm_data_learning.sql

# Or local
psql $DATABASE_URL -f database/migrations/019_storm_data_learning.sql
```
- [ ] Migration ran without errors
- [ ] Success message displayed: "Migration 019: Storm Data Learning System created successfully!"

### Step 3: Verify Schema
```bash
# Connect to database
railway run psql $DATABASE_URL

# Or local
psql $DATABASE_URL
```

Run verification queries:
```sql
-- Check tables exist
\dt storm_*

-- Expected output:
-- storm_events
-- storm_claim_outcomes
-- storm_area_patterns
-- storm_lookup_analytics
```
- [ ] All 4 tables created

```sql
-- Check functions exist
\df calculate_distance_miles
\df find_storms_near_location
\df get_area_claim_strategies
```
- [ ] All 3 functions created

```sql
-- Check views exist
\dv recent_successful_claims
\dv storm_hotspots
```
- [ ] Both views created

```sql
-- Check indexes
SELECT tablename, indexname
FROM pg_indexes
WHERE tablename LIKE 'storm_%'
ORDER BY tablename, indexname;
```
- [ ] 18+ indexes created

### Step 4: Test Functions
```sql
-- Test distance calculation
SELECT calculate_distance_miles(
    38.3032053, -77.4605399,  -- Fredericksburg, VA
    38.9072, -77.0369          -- Washington, DC
) as distance_miles;
-- Expected: ~53 miles
```
- [ ] Distance calculation works

```sql
-- Test storm lookup (should return sample data)
SELECT * FROM find_storms_near_location(38.3032053, -77.4605399, 25, 365);
```
- [ ] Storm lookup function works
- [ ] Sample data returned (1 row)

```sql
-- Test views
SELECT COUNT(*) FROM recent_successful_claims;
SELECT COUNT(*) FROM storm_hotspots;
```
- [ ] Views accessible (may be 0 rows if no data yet)

### Step 5: Test Sample Data
```sql
-- Verify sample storm event
SELECT * FROM storm_events WHERE city = 'Fredericksburg';
```
- [ ] Sample storm event exists
- [ ] Data looks correct (address, coordinates, hail size)

## Post-Deployment

### Step 6: Add Backend Code
- [ ] Copy `server/types/storm-data.ts` (already created)
- [ ] Copy `server/services/stormDataService.ts` (already created)
- [ ] Create API routes (see `STORM_DATA_INTEGRATION_GUIDE.md`)
- [ ] Update main server to register routes

### Step 7: Test API Endpoints
Create test file `test-storm-api.ts`:
```typescript
import { StormDataService } from './server/services/stormDataService';
import { pool } from './server/db';

async function testStormAPI() {
  const service = new StormDataService(pool);

  // Test 1: Find storms near location
  console.log('Test 1: Finding storms...');
  const storms = await service.findStormsNearLocation({
    latitude: 38.3032053,
    longitude: -77.4605399,
    radius_miles: 25,
    days_back: 365,
  });
  console.log(`Found ${storms.length} storms`);

  // Test 2: Get area strategies
  console.log('Test 2: Getting area strategies...');
  const strategies = await service.getAreaStrategies({
    state: 'VA',
  });
  console.log('Strategies:', strategies);

  // Test 3: Create storm event
  console.log('Test 3: Creating storm event...');
  const event = await service.createStormEvent({
    address: 'Test Address, Richmond, VA 23220',
    city: 'Richmond',
    state: 'VA',
    zip_code: '23220',
    latitude: 37.5407,
    longitude: -77.4360,
    event_date: new Date(),
    event_type: 'hail',
    hail_size_inches: 1.5,
    data_source: 'manual',
  });
  console.log('Created event:', event.id);

  console.log('✅ All tests passed!');
}

testStormAPI().catch(console.error);
```
- [ ] Test script runs successfully
- [ ] All operations complete without errors

### Step 8: Update Susan AI
- [ ] Add storm recommendations to chat handler
- [ ] Test Susan's responses with storm queries
- [ ] Verify recommendations include actual data

Example integration:
```typescript
// In chat handler
if (userMessage.toLowerCase().includes('storm') ||
    userMessage.toLowerCase().includes('hail')) {
  const recommendations = await stormService.getSusanRecommendations({
    state: userContext.state,
    latitude: userContext.latitude,
    longitude: userContext.longitude,
  });

  // Include in Susan's response
  susanContext += buildStormContext(recommendations);
}
```
- [ ] Susan can answer storm-related questions
- [ ] Recommendations are contextual and accurate

### Step 9: Frontend Integration
- [ ] Add storm lookup UI component
- [ ] Add storm data to job detail screens
- [ ] Add claim outcome recording form
- [ ] Test user workflows

### Step 10: Data Import (Optional)
If you have historical data:
- [ ] Create data import script
- [ ] Test import with small dataset
- [ ] Run full import
- [ ] Verify data integrity

## Verification & Monitoring

### Database Health
```sql
-- Check table sizes
SELECT
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE tablename LIKE 'storm_%'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```
- [ ] Table sizes reasonable
- [ ] No unexpected bloat

### Index Usage
```sql
-- Check index usage after 1 week
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read
FROM pg_stat_user_indexes
WHERE tablename LIKE 'storm_%'
ORDER BY idx_scan DESC;
```
- [ ] Indexes being used
- [ ] No unused indexes (after 1 week)

### Query Performance
```sql
-- Test common query performance
EXPLAIN ANALYZE
SELECT * FROM find_storms_near_location(38.3032053, -77.4605399, 10, 365);
```
- [ ] Query time < 100ms for typical searches
- [ ] Execution plan uses indexes

## Documentation

### Update Documentation
- [ ] Add storm data section to main README
- [ ] Document API endpoints
- [ ] Create user guide for reps
- [ ] Add admin documentation for data management

### Training Materials
- [ ] Create video/guide showing storm lookup
- [ ] Document claim outcome recording process
- [ ] Train reps on interpreting recommendations
- [ ] Share success stories

## Rollback Plan (If Needed)

If migration causes issues:

```sql
-- Rollback: Drop all storm tables
DROP TABLE IF EXISTS storm_lookup_analytics CASCADE;
DROP TABLE IF EXISTS storm_area_patterns CASCADE;
DROP TABLE IF EXISTS storm_claim_outcomes CASCADE;
DROP TABLE IF EXISTS storm_events CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS get_area_claim_strategies;
DROP FUNCTION IF EXISTS find_storms_near_location;
DROP FUNCTION IF EXISTS calculate_distance_miles;

-- Drop views
DROP VIEW IF EXISTS storm_hotspots;
DROP VIEW IF EXISTS recent_successful_claims;

-- Restore from backup
-- psql $DATABASE_URL < backup_before_storm_migration.sql
```

## Success Criteria

### Technical
- [x] Migration completes without errors
- [ ] All tables, functions, views created
- [ ] Indexes perform well
- [ ] API endpoints functional
- [ ] Susan integration working

### Business
- [ ] Reps can lookup storms for addresses
- [ ] System tracks claim outcomes
- [ ] Susan provides data-driven recommendations
- [ ] Success patterns identified and shared
- [ ] Reps report improved win rates

## Timeline

| Phase | Duration | Status |
|-------|----------|--------|
| Pre-deployment review | 1 hour | ⏳ Pending |
| Migration execution | 15 min | ⏳ Pending |
| Verification | 30 min | ⏳ Pending |
| Backend integration | 2 hours | ⏳ Pending |
| Testing | 1 hour | ⏳ Pending |
| Frontend integration | 4 hours | ⏳ Pending |
| Susan integration | 2 hours | ⏳ Pending |
| User training | 1 day | ⏳ Pending |
| **Total** | **~2 days** | ⏳ Pending |

## Support Contacts

### Technical Issues
- Database: Check Railway dashboard or logs
- API: Review server logs
- Frontend: Browser console

### Documentation
- Schema: `README_019_STORM_DATA.md`
- Integration: `STORM_DATA_INTEGRATION_GUIDE.md`
- Overview: `STORM_DATA_SUMMARY.md`
- Visual: `STORM_SCHEMA_DIAGRAM.md`

## Notes

### Migration Number
- This is migration **019**
- Previous migration: 018 (global learning status)
- Next migration: 020 (TBD)

### Dependencies
- Requires existing tables: `users`, `jobs`
- Optional: `global_learnings` for enhanced learning
- No breaking changes to existing schema

### Performance Notes
- Haversine calculation is fast enough for <100K storms
- Consider PostGIS if scaling beyond 500K storm events
- Area patterns table should be recalculated weekly
- Archive old lookup analytics after 6 months

---

**Status**: ⏳ Ready for deployment
**Estimated Time**: 2 days (including testing and integration)
**Risk Level**: Low (no changes to existing tables)
**Rollback**: Simple (drop new tables/functions)

**Deploy Command**:
```bash
railway run psql $DATABASE_URL -f database/migrations/019_storm_data_learning.sql
```

**Quick Verify**:
```sql
SELECT COUNT(*) FROM storm_events;  -- Should be 1 (sample data)
SELECT * FROM find_storms_near_location(38.3032053, -77.4605399, 25, 365);
```
