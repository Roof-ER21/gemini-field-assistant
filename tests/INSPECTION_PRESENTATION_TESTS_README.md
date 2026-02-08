# Inspection Presentation Tests

Comprehensive test suite for the Roof Inspection Presentation feature.

## Overview

This test suite covers all aspects of the inspection presentation feature:
- **Inspection CRUD operations** - Create, read, update inspection records
- **Photo upload & management** - Base64 photo handling, categorization
- **AI analysis with Gemini** - Damage detection, insurance-focused analysis
- **Presentation generation** - Automated slide creation from inspection data
- **Sharing functionality** - Public links, view tracking
- **Security & access control** - Ownership verification, admin overrides

## Test Files

### 1. API Routes Tests
**File**: `/server/routes/__tests__/inspectionPresentationRoutes.test.ts`

Comprehensive API endpoint testing:
- ✅ **47+ test cases**
- ✅ **Inspection CRUD** (5 tests)
- ✅ **Photo Upload** (8 tests)
- ✅ **AI Analysis** (9 tests)
- ✅ **Presentation Generation** (9 tests)
- ✅ **Sharing** (6 tests)
- ✅ **Edge Cases** (10+ tests)

### 2. Mock Data
**File**: `/tests/inspection-presentation-mock-data.ts`

Reusable test data including:
- Sample base64 images (JPEG, PNG)
- Realistic AI analysis scenarios (wind, hail, minor, no damage)
- Mock users (sales rep, manager, admin)
- Mock inspections (draft, in-progress, completed)
- Mock photos (analyzed, unanalyzed, various categories)
- Mock presentations (draft, shared)
- Helper functions for generating test data

## Running Tests

### Run All Inspection Presentation Tests
```bash
npm test -- inspectionPresentationRoutes.test.ts
```

### Run with Coverage
```bash
npm test -- inspectionPresentationRoutes.test.ts --coverage
```

### Run Specific Test Suite
```bash
npm test -- inspectionPresentationRoutes.test.ts -t "Inspection Routes"
npm test -- inspectionPresentationRoutes.test.ts -t "AI Analysis"
npm test -- inspectionPresentationRoutes.test.ts -t "Sharing"
```

### Watch Mode (for development)
```bash
npm test -- inspectionPresentationRoutes.test.ts --watch
```

## Test Data Examples

### Sample Inspection
```typescript
import { MOCK_INSPECTIONS } from './inspection-presentation-mock-data';

const inspection = MOCK_INSPECTIONS.completed;
// {
//   id: 'insp-complete-003',
//   property_address: '789 Elm St, Columbia, MD 21045',
//   customer_name: 'Bob Johnson',
//   status: 'completed',
//   photo_count: 12,
//   analyzed_photo_count: 12,
//   ...
// }
```

### Sample AI Analysis
```typescript
import { WIND_DAMAGE_ANALYSIS } from './inspection-presentation-mock-data';

// Realistic wind damage analysis
// {
//   damageDetected: true,
//   damageType: ['wind'],
//   severity: 'severe',
//   claimViability: 'strong',
//   insuranceArguments: [...],
//   recommendations: [...],
//   confidence: 94,
//   ...
// }
```

### Generate Test Photos
```typescript
import { generateMockPhotos } from './inspection-presentation-mock-data';

const photos = generateMockPhotos(10, 'inspection-id-123');
// Creates 10 photos with varied categories and AI analysis
```

## Test Scenarios Covered

### 1. Inspection Management
- ✅ Create inspection with required fields
- ✅ Validate property address and customer name
- ✅ Handle missing user authentication
- ✅ Check ownership and admin access
- ✅ Return 404 for non-existent inspections
- ✅ Trim whitespace from input fields

### 2. Photo Upload
- ✅ Upload base64-encoded photos
- ✅ Support multiple categories (damage, overview, detail, measurements, other)
- ✅ Increment photo_count on inspection
- ✅ Update status from 'draft' to 'in_progress'
- ✅ Validate photo_data is required
- ✅ Handle large photo data (5MB+)
- ✅ Access control (owner/admin only)

### 3. AI Analysis
- ✅ Analyze unanalyzed photos with Google Gemini
- ✅ Detect damage types (wind, hail, impact)
- ✅ Provide insurance-focused analysis
- ✅ Include claim viability assessment
- ✅ Generate policy language suggestions
- ✅ List insurance arguments
- ✅ Provide recommendations and follow-up questions
- ✅ Update analyzed_photo_count
- ✅ Set inspection status to 'completed'
- ✅ Handle Gemini API errors gracefully
- ✅ Skip already-analyzed photos

### 4. Presentation Generation
- ✅ Generate presentation from inspection
- ✅ Create cover slide with property details
- ✅ Create photo slides for each image
- ✅ Create analysis slides for damaged areas
- ✅ Create summary slide with statistics
- ✅ Create recommendations slide
- ✅ Create contact slide with branding
- ✅ Support presentation types (standard, insurance, detailed)
- ✅ Include custom branding (logo, company name, contact)
- ✅ Aggregate recommendations from all photos

### 5. Sharing & Public Access
- ✅ Generate unique share token
- ✅ Reuse existing token if already shared
- ✅ Set is_public flag to true
- ✅ Update status to 'shared'
- ✅ Create shareable URL with full domain
- ✅ Public access without authentication
- ✅ Increment view_count on each access
- ✅ Return 404 for invalid or private presentations

### 6. Security & Access Control
- ✅ Require x-user-email header for authenticated endpoints
- ✅ Verify user exists in database
- ✅ Check resource ownership (inspections, presentations)
- ✅ Allow admin override for all resources
- ✅ Deny access to non-owner, non-admin users
- ✅ Protect against SQL injection
- ✅ Public endpoint doesn't require auth (GET /api/present/:token)

### 7. Edge Cases
- ✅ Database connection errors
- ✅ Query timeout handling
- ✅ SQL injection attempts
- ✅ Empty/whitespace-only required fields
- ✅ Large photo data (10MB+)
- ✅ Inspections with 100+ photos
- ✅ Concurrent photo uploads
- ✅ Gemini API failures
- ✅ Missing API keys
- ✅ Malformed JSON responses from AI

## AI Analysis Mock Data

The test suite includes realistic AI analysis for different damage scenarios:

### 1. Severe Wind Damage
- **Claim Viability**: Strong
- **Confidence**: 94%
- **Key Arguments**: NOAA wind data, shingle lifting pattern, matching concerns
- **Estimated Claim**: $18,500 - $22,000

### 2. Moderate Hail Damage
- **Claim Viability**: Moderate
- **Confidence**: 87%
- **Key Arguments**: Hail strike density, granule loss, NOAA hail reports
- **Estimated Claim**: $12,000 - $16,000

### 3. Minor Damage
- **Claim Viability**: Weak
- **Confidence**: 78%
- **Type**: Normal wear and tear
- **Recommendation**: Targeted repair, not insurance claim

### 4. No Damage
- **Claim Viability**: None
- **Confidence**: 95%
- **Purpose**: Baseline documentation

## Test Coverage Goals

- ✅ **API Routes**: 95%+ line coverage
- ✅ **Error Handling**: 100% error paths covered
- ✅ **Security**: 100% access control scenarios
- ✅ **Edge Cases**: All identified edge cases tested
- ✅ **Integration**: Gemini API mocked and tested

## Expected Test Results

When running the full test suite, you should see:

```
 ✓ Inspection Routes (5 tests)
   ✓ POST /api/inspections - Create Inspection
   ✓ GET /api/inspections/:id - Get Inspection

 ✓ Photo Routes (8 tests)
   ✓ POST /api/inspections/:id/photos - Upload Photo
   ✓ GET /api/inspections/:id/photos - List Photos

 ✓ AI Analysis Routes (9 tests)
   ✓ POST /api/inspections/:id/analyze - Run AI Analysis

 ✓ Presentation Routes (9 tests)
   ✓ POST /api/presentations - Generate Presentation
   ✓ GET /api/presentations/:id - Get Presentation
   ✓ PUT /api/presentations/:id - Update Presentation

 ✓ Sharing Routes (6 tests)
   ✓ POST /api/presentations/:id/share - Share Presentation
   ✓ GET /api/present/:token - Public Presentation Access

 ✓ Edge Cases and Error Handling (10+ tests)

Test Suites: 1 passed, 1 total
Tests:       47+ passed, 47+ total
Time:        3.5s
Coverage:    95%+ (routes, services)
```

## Troubleshooting

### Tests Fail Due to Missing Dependencies
```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

### Gemini Mock Not Working
Check that `@google/genai` is mocked at the top of the test file:
```typescript
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: {
      generateContent: vi.fn().mockResolvedValue({ text: '...' }),
    },
  })),
}));
```

### Database Query Mock Issues
Ensure `mockPool.query` is properly mocked before each test:
```typescript
beforeEach(() => {
  mockPool = createMockPool();
  vi.clearAllMocks();
});
```

### Coverage Not Showing
Run with coverage flag:
```bash
npm test -- --coverage
```

## Adding New Tests

### 1. Add to Existing Suite
```typescript
it('should handle new scenario', async () => {
  // Arrange
  (mockPool.query as any)
    .mockResolvedValueOnce({ rows: [{ id: 'user-123' }] })
    .mockResolvedValueOnce({ rows: [mockData] });

  // Act
  req.body = { /* test data */ };

  // Assert
  // Add assertions here
});
```

### 2. Create New Mock Data
```typescript
// In inspection-presentation-mock-data.ts
export const NEW_SCENARIO_DATA = {
  // Your mock data
};
```

### 3. Test New API Endpoint
```typescript
describe('NEW_ENDPOINT - Description', () => {
  it('should handle success case', async () => {
    // Test implementation
  });

  it('should handle error case', async () => {
    // Test implementation
  });
});
```

## Integration with CI/CD

Add to your CI/CD pipeline:

```yaml
# .github/workflows/test.yml
- name: Run Inspection Presentation Tests
  run: npm test -- inspectionPresentationRoutes.test.ts --coverage

- name: Upload Coverage
  uses: codecov/codecov-action@v3
  with:
    files: ./coverage/lcov.info
```

## Best Practices

1. **Isolation**: Each test is independent, no shared state
2. **Clarity**: Descriptive test names explain what is being tested
3. **AAA Pattern**: Arrange, Act, Assert structure
4. **Mocking**: External dependencies (database, API) are mocked
5. **Coverage**: Aim for 95%+ line coverage
6. **Edge Cases**: Test error paths and boundary conditions
7. **Security**: Verify all access control scenarios
8. **Performance**: Tests run quickly (<5 seconds total)

## Related Documentation

- [Inspection Presentation API Specification](/docs/api/inspection-presentation.md)
- [Gemini AI Integration](/docs/ai/gemini-integration.md)
- [Database Schema](/db/schema/inspections.sql)
- [Security & Access Control](/docs/security/access-control.md)

## Contributing

When adding new features to the inspection presentation system:

1. ✅ Write tests first (TDD approach)
2. ✅ Add mock data to `inspection-presentation-mock-data.ts`
3. ✅ Update this README with new test scenarios
4. ✅ Ensure coverage stays above 95%
5. ✅ Run full test suite before committing

## Support

For questions or issues with the test suite:
- Check this README first
- Review test file comments
- Check Vitest documentation
- Contact: dev@roofer.com
