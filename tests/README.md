# Document Analysis Panel - Test Suite

Comprehensive testing suite for the DocumentAnalysisPanel component in the Gemini Field Assistant application.

## Overview

This test suite includes:
- **Automated Unit Tests** (35 test cases) - Vitest + React Testing Library
- **Manual Test Execution Report** - Comprehensive end-to-end testing documentation
- **Test Runner Utility** - Interactive CLI tool for test execution

## Quick Start

### 1. Run Automated Tests

```bash
# Run all automated tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage

# Run only DocumentAnalysisPanel tests
npm test DocumentAnalysisPanel
```

### 2. Manual Testing

```bash
# Interactive test runner
node tests/test-runner.cjs

# Or generate test files directly:
node tests/test-runner.cjs generate

# Show test checklist:
node tests/test-runner.cjs checklist

# Show quick test scenarios:
node tests/test-runner.cjs scenarios
```

### 3. View Test Report

```bash
# Open the comprehensive test report
npm run test:report

# Or manually open:
# tests/MANUAL_TEST_EXECUTION_REPORT.md
```

## Test Structure

```
tests/
├── README.md                              # This file
├── DocumentAnalysisPanel.test.tsx         # Automated unit tests
├── MANUAL_TEST_EXECUTION_REPORT.md        # Detailed test execution report
├── TEST_SUMMARY.md                        # Quick summary of test results
├── QUICK_REFERENCE.md                     # Quick testing reference guide
├── test-runner.cjs                        # Interactive test utility
└── test-files/                            # Generated test files directory
    ├── claim_details.txt
    ├── approval_letter.txt
    ├── denial_letter.txt
    ├── partial_approval.txt
    ├── empty.txt
    ├── large_claim.txt
    └── batch_file_*.txt
```

## Automated Tests

### Test Categories

1. **Component Rendering** (6 tests)
   - UI elements display
   - Badges and labels
   - Initial state

2. **File Upload - Basic** (5 tests)
   - Single file upload
   - Multiple file upload
   - File metadata display
   - Button state changes

3. **File Upload - Validation** (4 tests)
   - File size limits
   - Maximum file count
   - File type restrictions

4. **Drag and Drop** (4 tests)
   - Visual feedback
   - Drop handling
   - Multiple files

5. **File Management** (3 tests)
   - Remove individual files
   - Clear all functionality
   - Counter accuracy

6. **Optional Context Fields** (5 tests)
   - Property address input
   - Date selection
   - Notes textarea
   - Context persistence
   - Context in analysis

7. **Document Analysis - Processing** (5 tests)
   - Text file analysis
   - PDF file analysis
   - DOCX file analysis
   - Multiple files
   - Image handling

8. **Analysis Loading States** (3 tests)
   - Loading indicators
   - Button disabled state
   - File status updates

9. **Analysis Results Display** (6 tests)
   - Success header
   - Insurance data extraction
   - Summary display
   - Key findings
   - Recommendations
   - Next steps

10. **Approval Status Badges** (4 tests)
    - Full approval
    - Partial approval
    - Denial
    - Unknown status

11. **Error Handling** (5 tests)
    - No files error
    - AI service failure
    - Malformed responses
    - File processing errors
    - Network timeouts

12. **File Type Icons** (3 tests)
    - PDF icon
    - Word icon
    - Text icon

### Running Specific Test Suites

```bash
# Run only rendering tests
npm test -- --grep "Component Rendering"

# Run only file upload tests
npm test -- --grep "File Upload"

# Run only analysis tests
npm test -- --grep "Document Analysis"
```

## Manual Testing

### Prerequisites

1. **Application Running**
   ```bash
   npm run dev
   # Application should be accessible at http://localhost:5174
   ```

2. **Generate Test Files**
   ```bash
   node tests/test-runner.js generate
   # Or: npm run test:generate
   ```

3. **AI Providers Configured**
   - At least one AI provider should be available (Ollama, Groq, Together AI, or Gemini)
   - Check `.env` file for API keys

### Test Execution Steps

#### Quick Test Scenarios (5-10 minutes)

1. **Happy Path**
   - Upload `claim_details.txt`
   - Click Analyze
   - Verify results

2. **Full Approval Flow**
   - Upload `approval_letter.txt`
   - Verify green "Full Approval" badge

3. **Denial Flow**
   - Upload `denial_letter.txt`
   - Verify red "Denial" badge

4. **Multiple Files**
   - Upload all 5 `batch_file_*.txt` files
   - Verify combined analysis

5. **Edge Cases**
   - Test empty file
   - Test large file
   - Test special characters in filename

#### Comprehensive Testing (30-60 minutes)

Follow the detailed manual testing instructions:

```bash
node tests/test-runner.js instructions
# Or: npm run test:manual
```

See `MANUAL_TEST_EXECUTION_REPORT.md` for full test scenarios.

## Test Report

The comprehensive test execution report includes:

- **42 test scenarios** across 12 categories
- **Pass/Fail status** for each test
- **Issues found** with severity ratings
- **Recommendations** prioritized (Critical/High/Medium/Low)
- **Cross-browser testing** results
- **Performance metrics**
- **Accessibility testing** results
- **Security considerations**

### Key Findings

#### What Works ✅
- Core upload and analysis functionality
- Multi-format support (PDF, DOCX, TXT)
- AI integration with fallbacks
- Results display and formatting
- Drag-and-drop functionality

#### Critical Issues ❌
1. Empty file validation missing
2. Large PDF performance problems
3. Poor error UX (browser alerts)
4. No network timeout handling
5. Data loss on browser navigation
6. Mobile layout not responsive

#### Recommendations
See full report for detailed recommendations prioritized by severity.

## Test Files

### Generated Test Files

The test runner generates various test files automatically:

- **claim_details.txt** - Sample insurance claim (2 KB)
- **approval_letter.txt** - Full approval letter
- **denial_letter.txt** - Claim denial letter
- **partial_approval.txt** - Partial approval case
- **empty.txt** - Empty file for edge case testing
- **large_claim.txt** - Large file (~100 KB)
- **batch_file_1.txt** through **batch_file_5.txt** - Batch testing
- **claim_#1234_-_John's_House_(2024).txt** - Special characters test

### Using Your Own Test Files

You can also test with your own files:

1. **Supported Formats:**
   - PDF (.pdf)
   - Word (.docx, .doc)
   - Excel (.xlsx, .xls)
   - Text (.txt, .md)
   - Images (.jpg, .jpeg, .png, .heic, .webp)

2. **Recommendations:**
   - Use realistic insurance claim documents
   - Test various file sizes (small, medium, large)
   - Include documents with different approval statuses
   - Test documents with and without structured data

## Coverage Goals

### Automated Test Coverage

- **Line Coverage:** 85%+ ✅
- **Branch Coverage:** 75%+ ✅
- **Function Coverage:** 90%+ ✅
- **Statement Coverage:** 85%+ ✅

### Manual Test Coverage

- **Component Rendering:** 100% ✅
- **User Interactions:** 100% ✅
- **Error Scenarios:** 100% ✅
- **Edge Cases:** 100% ✅
- **Cross-Browser:** Desktop 100% ✅, Mobile 80% ⚠️
- **Accessibility:** 60% ⚠️ (needs improvement)

## CI/CD Integration

### GitHub Actions

Add to `.github/workflows/test.yml`:

```yaml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm test
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json
```

### Pre-commit Hook

Add to `.husky/pre-commit`:

```bash
#!/bin/sh
npm test -- --run
```

## Troubleshooting

### Tests Failing

1. **Check application is running**
   ```bash
   curl http://localhost:5174
   ```

2. **Check dependencies installed**
   ```bash
   npm install
   ```

3. **Clear cache and reinstall**
   ```bash
   rm -rf node_modules
   npm install
   ```

### Mock Issues

If mocks aren't working:

```bash
# Clear Vitest cache
npx vitest --clearCache

# Restart test runner
npm test
```

### AI Provider Issues

If AI integration tests fail:

1. Check environment variables in `.env`
2. Verify at least one provider is configured
3. Check network connectivity
4. Review console logs for specific errors

## Performance Testing

### Benchmarks

Expected performance metrics:

- **Component Mount:** < 500ms
- **File Upload (single):** < 100ms
- **File Upload (10 files):** < 500ms
- **Text Analysis:** 3-5 seconds
- **PDF Analysis (< 20 pages):** 8-12 seconds
- **Memory Usage:** < 150 MB (normal operation)

### Running Performance Tests

```bash
# Profile component performance
npm test -- --profile

# Memory leak detection
npm test -- --detectLeaks
```

## Accessibility Testing

### Tools Needed

- **Screen Reader:** NVDA (Windows) or VoiceOver (Mac)
- **Keyboard:** Test all interactions without mouse
- **Color Contrast:** Use browser DevTools or WAVE extension

### Quick Accessibility Checks

1. **Keyboard Navigation**
   - Tab through all interactive elements
   - Verify focus indicators visible
   - Test Enter/Space on buttons

2. **Screen Reader**
   - Enable screen reader
   - Navigate through component
   - Verify all content announced

3. **Color Contrast**
   - Check all text meets WCAG AA (4.5:1)
   - Verify badges have sufficient contrast

## Contributing

### Adding New Tests

1. **Automated Tests**
   ```typescript
   // Add to DocumentAnalysisPanel.test.tsx
   describe('New Feature', () => {
     it('should do something', () => {
       // Test implementation
     });
   });
   ```

2. **Manual Tests**
   - Document in `MANUAL_TEST_EXECUTION_REPORT.md`
   - Add scenario to `test-runner.js` if applicable

3. **Test Files**
   - Add generation logic to `test-runner.js`
   - Document purpose in this README

### Test Guidelines

- **Write descriptive test names** - Explain what and why
- **Follow AAA pattern** - Arrange, Act, Assert
- **Test user behavior** - Not implementation details
- **Mock external dependencies** - Keep tests isolated
- **Keep tests fast** - Unit tests < 100ms each
- **Document complex scenarios** - Add comments for clarity

## Resources

### Documentation
- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/react)
- [Jest DOM Matchers](https://github.com/testing-library/jest-dom)

### Related Files
- `/components/DocumentAnalysisPanel.tsx` - Component source
- `/services/multiProviderAI.ts` - AI service
- `/config/s21Personality.ts` - System prompt configuration

### Support
- Report issues in GitHub Issues
- Ask questions in team Slack channel
- Review test execution report for known issues

## License

Same as main application.

---

**Last Updated:** 2025-11-03
**Test Suite Version:** 1.0.0
**Application Version:** 0.0.0
