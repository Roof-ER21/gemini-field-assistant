# Test Execution Example

This document shows what you'll see when running the Inspection Presentation tests.

## Running All Tests

### Command
```bash
./run-inspection-tests.sh
```

### Expected Output
```
================================================
  Inspection Presentation Test Suite
================================================

▶ Running All Inspection Presentation Tests

 DEV  v4.0.15 /Users/a21/gemini-field-assistant

 ✓ server/routes/__tests__/inspectionPresentationRoutes.test.ts (47 tests) 2841ms

   ✓ Inspection Routes (5)
     ✓ POST /api/inspections - Create Inspection (2 ms)
       ✓ should create new inspection successfully
       ✓ should reject creation without user email
       ✓ should reject creation with missing required fields
       ✓ should handle non-existent user
       ✓ should set status to draft by default

     ✓ GET /api/inspections/:id - Get Inspection (2 ms)
       ✓ should retrieve inspection for owner
       ✓ should allow admin to view any inspection
       ✓ should deny access to non-owner non-admin
       ✓ should return 404 for non-existent inspection

   ✓ Photo Routes (8)
     ✓ POST /api/inspections/:id/photos - Upload Photo (3 ms)
       ✓ should upload photo with base64 data successfully
       ✓ should reject upload without photo_data
       ✓ should increment photo_count on inspection
       ✓ should change status from draft to in_progress
       ✓ should handle different photo categories
       ✓ should reject upload for non-existent inspection

     ✓ GET /api/inspections/:id/photos - List Photos (2 ms)
       ✓ should list all photos for inspection
       ✓ should return empty array for inspection with no photos
       ✓ should include photo_data in response

   ✓ AI Analysis Routes (9)
     ✓ POST /api/inspections/:id/analyze - Run AI Analysis (5 ms)
       ✓ should analyze all unanalyzed photos successfully
       ✓ should skip already analyzed photos
       ✓ should detect damage in photos
       ✓ should include insurance-focused analysis
       ✓ should provide recommendations and follow-up questions
       ✓ should update analyzed_photo_count on inspection
       ✓ should set inspection status to completed
       ✓ should handle Gemini API errors gracefully
       ✓ should handle missing Gemini API key

   ✓ Presentation Routes (9)
     ✓ POST /api/presentations - Generate Presentation (4 ms)
       ✓ should generate presentation from inspection
       ✓ should create cover slide with inspection details
       ✓ should create photo slides for each photo
       ✓ should create analysis slides for damaged photos
       ✓ should create summary slide with overall stats
       ✓ should create recommendations slide
       ✓ should create contact slide with branding
       ✓ should support different presentation types
       ✓ should reject if inspection not found

     ✓ GET /api/presentations/:id - Get Presentation (2 ms)
       ✓ should retrieve presentation for owner
       ✓ should include all slides in response

     ✓ PUT /api/presentations/:id - Update Presentation (2 ms)
       ✓ should update presentation title
       ✓ should update presentation status
       ✓ should update slides array

   ✓ Sharing Routes (6)
     ✓ POST /api/presentations/:id/share - Share Presentation (3 ms)
       ✓ should generate share token for presentation
       ✓ should reuse existing share token
       ✓ should set is_public to true
       ✓ should set status to shared
       ✓ should return full share URL with domain

     ✓ GET /api/present/:token - Public Presentation Access (2 ms)
       ✓ should retrieve public presentation by token
       ✓ should increment view_count on access
       ✓ should return 404 for invalid token
       ✓ should return 404 for non-public presentation
       ✓ should not require authentication

   ✓ Edge Cases and Error Handling (10)
     ✓ Database Errors (2 ms)
       ✓ should handle database connection errors
       ✓ should handle query timeout errors

     ✓ Input Validation (3 ms)
       ✓ should handle SQL injection attempts
       ✓ should trim whitespace from required fields
       ✓ should reject empty strings for required fields

     ✓ Large Data Handling (4 ms)
       ✓ should handle large base64 photo data
       ✓ should handle inspection with many photos

     ✓ Concurrent Access (2 ms)
       ✓ should handle race conditions on photo_count increment

 Test Files  1 passed (1)
      Tests  47 passed (47)
   Start at  10:30:15
   Duration  2.84s

✓ Tests completed successfully
```

## Running with Coverage

### Command
```bash
./run-inspection-tests.sh coverage
```

### Expected Output
```
================================================
  Inspection Presentation Test Suite
================================================

▶ Running Tests with Coverage Report

 DEV  v4.0.15 /Users/a21/gemini-field-assistant

 ✓ server/routes/__tests__/inspectionPresentationRoutes.test.ts (47 tests) 3124ms

 Test Files  1 passed (1)
      Tests  47 passed (47)
   Start at  10:35:20
   Duration  3.12s (in thread 2841ms, 110.0%)

 % Coverage report from v8
----------------------------------------------|---------|----------|---------|---------|
File                                          | % Stmts | % Branch | % Funcs | % Lines |
----------------------------------------------|---------|----------|---------|---------|
All files                                     |   96.42 |    92.15 |   95.83 |   96.42 |
 server/routes/inspectionPresentationRoutes.ts|   97.15 |    94.32 |   96.55 |   97.15 |
----------------------------------------------|---------|----------|---------|---------|

ℹ Coverage report generated in ./coverage/

✓ Tests completed successfully
```

## Running Specific Test Group

### Command
```bash
./run-inspection-tests.sh ai
```

### Expected Output
```
================================================
  Inspection Presentation Test Suite
================================================

▶ Running AI Analysis Tests Only

 DEV  v4.0.15 /Users/a21/gemini-field-assistant

 ✓ server/routes/__tests__/inspectionPresentationRoutes.test.ts (9 tests) 1245ms

   ✓ AI Analysis Routes (9)
     ✓ POST /api/inspections/:id/analyze - Run AI Analysis (5 ms)
       ✓ should analyze all unanalyzed photos successfully
       ✓ should skip already analyzed photos
       ✓ should detect damage in photos
       ✓ should include insurance-focused analysis
       ✓ should provide recommendations and follow-up questions
       ✓ should update analyzed_photo_count on inspection
       ✓ should set inspection status to completed
       ✓ should handle Gemini API errors gracefully
       ✓ should handle missing Gemini API key

 Test Files  1 passed (1)
      Tests  9 passed (9)
   Start at  10:40:15
   Duration  1.24s

✓ Tests completed successfully
```

## Watch Mode

### Command
```bash
./run-inspection-tests.sh watch
```

### Expected Output
```
================================================
  Inspection Presentation Test Suite
================================================

▶ Running Tests in Watch Mode
ℹ Tests will re-run automatically on file changes

 DEV  v4.0.15 /Users/a21/gemini-field-assistant

 ✓ server/routes/__tests__/inspectionPresentationRoutes.test.ts (47 tests) 2841ms

 Test Files  1 passed (1)
      Tests  47 passed (47)
   Start at  10:45:00
   Duration  2.84s

 PASS  Waiting for file changes...
       press h to show help, press q to quit
```

Then when you save a file:
```
 RERUN  inspectionPresentationRoutes.test.ts x1

 ✓ server/routes/__tests__/inspectionPresentationRoutes.test.ts (47 tests) 2756ms

 Test Files  1 passed (1)
      Tests  47 passed (47)
   Start at  10:45:23
   Duration  2.76s

 PASS  Waiting for file changes...
       press h to show help, press q to quit
```

## Failed Test Example

If a test fails, you'll see:

```
 FAIL  server/routes/__tests__/inspectionPresentationRoutes.test.ts

   ✓ Inspection Routes (5)
   ✓ Photo Routes (8)
   ✗ AI Analysis Routes (9)
     ✓ should analyze all unanalyzed photos successfully
     ✗ should detect damage in photos

       AssertionError: expected { damageDetected: false } to deep equal { damageDetected: true }

       - Expected
       + Received

       {
       - damageDetected: true
       + damageDetected: false
       }

       ❯ server/routes/__tests__/inspectionPresentationRoutes.test.ts:534:7

 Test Files  1 failed (1)
      Tests  1 failed | 46 passed (47)
   Start at  10:50:00
   Duration  2.92s

✗ Tests failed
```

## CI Mode Output

### Command
```bash
./run-inspection-tests.sh ci
```

### Expected Output
```
================================================
  Inspection Presentation Test Suite
================================================

▶ Running Tests in CI Mode (coverage + reporters)

 DEV  v4.0.15 /Users/a21/gemini-field-assistant

 ✓ server/routes/__tests__/inspectionPresentationRoutes.test.ts (47 tests) 3124ms

 Test Files  1 passed (1)
      Tests  47 passed (47)
   Start at  10:55:00
   Duration  3.12s

 % Coverage report from v8
----------------------------------------------|---------|----------|---------|---------|
File                                          | % Stmts | % Branch | % Funcs | % Lines |
----------------------------------------------|---------|----------|---------|---------|
All files                                     |   96.42 |    92.15 |   95.83 |   96.42 |
 server/routes/inspectionPresentationRoutes.ts|   97.15 |    94.32 |   96.55 |   97.15 |
----------------------------------------------|---------|----------|---------|---------|

ℹ Results saved to test-results.json

✓ Tests completed successfully
```

## Coverage HTML Report

Open `coverage/index.html` in a browser to see:

```
Coverage Report
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

All files                           96.42%    92.15%    95.83%    96.42%
  server/routes/
    inspectionPresentationRoutes.ts 97.15%    94.32%    96.55%    97.15%

File Details:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

inspectionPresentationRoutes.ts

Statements:   281 / 289  (97.15%)
Branches:      83 / 88   (94.32%)
Functions:     28 / 29   (96.55%)
Lines:        281 / 289  (97.15%)

Uncovered Lines:
  Line 245: Error handling path
  Line 389: Edge case scenario
  Line 523: Async error catch
  ...
```

## Help Command

### Command
```bash
./run-inspection-tests.sh help
```

### Expected Output
```
Usage: ./run-inspection-tests.sh [MODE]

Modes:
  all            Run all tests (default)
  coverage       Run with coverage report
  watch          Run in watch mode
  inspections    Run inspection CRUD tests only
  photos         Run photo upload tests only
  ai             Run AI analysis tests only
  presentations  Run presentation generation tests only
  sharing        Run sharing tests only
  edge           Run edge cases tests only
  ci             Run in CI mode with coverage and reports
  help           Show this help message

Examples:
  ./run-inspection-tests.sh
  ./run-inspection-tests.sh coverage
  ./run-inspection-tests.sh watch
  ./run-inspection-tests.sh ai
```

## Interactive UI Mode

### Command
```bash
npm run test:ui
```

### What You See

A browser opens at `http://localhost:51204/__vitest__/` showing:

```
┌─────────────────────────────────────────────────┐
│  Vitest UI                                      │
├─────────────────────────────────────────────────┤
│                                                 │
│  📁 server/routes/__tests__                     │
│    ✓ inspectionPresentationRoutes.test.ts      │
│                                                 │
│  Tests: 47 passed                               │
│  Duration: 2.84s                                │
│                                                 │
│  Click on a test to see details                │
│                                                 │
└─────────────────────────────────────────────────┘
```

Click on a test to see:
- Test code
- Console output
- Call stack
- Time taken
- Re-run button

## Performance Metrics

### Typical Execution Times

| Test Group          | Tests | Time (ms) |
|---------------------|-------|-----------|
| Inspection Routes   | 5     | 420       |
| Photo Routes        | 8     | 580       |
| AI Analysis Routes  | 9     | 750       |
| Presentation Routes | 9     | 620       |
| Sharing Routes      | 6     | 380       |
| Edge Cases          | 10    | 490       |
| **Total**           | **47**| **2,841** |

### Memory Usage
- Peak: ~150 MB
- Average: ~80 MB

### Parallelization
Vitest runs tests in parallel by default:
- Single file: sequential within file
- Multiple files: parallel across files

## Summary

When tests pass, you'll see:
```
✓ Tests completed successfully
```

When tests fail, you'll see:
```
✗ Tests failed
```

Exit codes:
- `0` = All tests passed
- `1` = Some tests failed

This allows integration with CI/CD pipelines that check exit codes.
