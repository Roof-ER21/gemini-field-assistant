# Document Analysis Panel - Quick Test Reference

**🚀 Fast testing guide for DocumentAnalysisPanel**

---

## 30-Second Quick Test

```bash
# 1. Start app
npm run dev

# 2. Generate test files
node tests/test-runner.cjs generate

# 3. Open http://localhost:5174
# 4. Navigate to "Upload Analysis"
# 5. Upload tests/test-files/claim_details.txt
# 6. Click "Analyze"
# 7. ✅ Verify results appear

# PASS if: Analysis completes, results display correctly
# FAIL if: Errors in console, no results, or crash
```

---

## 5-Minute Smoke Test

### Test Scenarios

**1. Basic Upload (1 min)**
```
✓ Upload claim_details.txt
✓ Verify file appears in list
✓ Click analyze
✓ Verify success message and results
```

**2. Approval Status (1 min)**
```
✓ Clear all
✓ Upload approval_letter.txt
✓ Click analyze
✓ Verify green "Full Approval" badge
```

**3. Multiple Files (1 min)**
```
✓ Clear all
✓ Upload batch_file_1.txt through batch_file_3.txt
✓ Click analyze
✓ Verify all 3 files processed
```

**4. Error Case (1 min)**
```
✓ Upload empty.txt
✓ Click analyze
✓ Should show warning or error
```

**5. File Management (1 min)**
```
✓ Upload 3 files
✓ Remove one file (× button)
✓ Click "Clear All"
✓ Verify all cleared
```

---

## Known Issues Checklist

**Before reporting a bug, check if it's a known issue:**

- [ ] Large PDFs (>100 pages) cause browser to hang → **KNOWN BUG**
- [ ] Empty files (0 bytes) are accepted → **KNOWN BUG**
- [ ] Errors show as browser alerts → **KNOWN BUG**
- [ ] No cancel button during analysis → **KNOWN LIMITATION**
- [ ] Mobile layout cramped → **KNOWN ISSUE**
- [ ] Browser back button loses data → **KNOWN ISSUE**

---

## Critical Test Cases

### Must Pass ✅
1. **Upload text file and analyze** - Core functionality
2. **Display analysis results** - Results rendering
3. **Show extracted claim data** - Data extraction
4. **Handle AI provider failure** - Error handling
5. **Remove files from list** - File management

### Should Pass ⚠️
6. **Handle 10+ files** - Batch processing
7. **Process PDF files** - PDF support
8. **Process DOCX files** - Word support
9. **Show approval status badges** - Status detection
10. **Validate file size limits** - Validation

### May Fail (Known Issues) ❌
11. **Handle very large PDFs** - Performance issue
12. **Reject empty files** - Validation missing
13. **Timeout long requests** - No timeout
14. **Mobile responsive layout** - Layout issue
15. **Warn before data loss** - No warning

---

## Quick Commands

```bash
# Generate test files
node tests/test-runner.cjs generate

# Show test checklist
node tests/test-runner.cjs checklist

# Show quick scenarios
node tests/test-runner.cjs scenarios

# Show full instructions
node tests/test-runner.cjs instructions

# View test report
node tests/test-runner.cjs report

# Interactive menu
node tests/test-runner.cjs
```

---

## Test Files Location

```
tests/test-files/
├── claim_details.txt          ← Start here
├── approval_letter.txt        ← Test approval status
├── denial_letter.txt          ← Test denial status
├── partial_approval.txt       ← Test partial approval
├── empty.txt                  ← Test edge case
└── batch_file_*.txt           ← Test multiple files
```

---

## Expected Results

### Successful Analysis Should Show:
- ✅ Green success header
- ✅ "Analysis Complete" message
- ✅ Extracted claim information (if present)
- ✅ Analysis summary
- ✅ Key findings list
- ✅ Recommendations
- ✅ Next steps
- ✅ Approval status badge (if applicable)

### Common Issues:
- ❌ No results appear → Check console for errors
- ❌ Browser alert appears → Known issue (error handling)
- ❌ Loading never stops → Check AI provider configured
- ❌ Page becomes unresponsive → Large file issue

---

## Browser Console Checks

**Open DevTools (F12) and check:**

### Should NOT See:
- ❌ Red errors (except during error testing)
- ❌ "Failed to fetch" continuously
- ❌ Memory warnings
- ❌ Unhandled promise rejections

### OK to See:
- ✅ "Setting up fake worker" (PDF.js warning)
- ✅ "Failed to fetch localhost:11434" (Ollama not running)
- ✅ Network requests to AI providers
- ✅ State change logs (if debug enabled)

---

## File Type Icons

Verify correct icons display:

- 📄 = PDF files (.pdf)
- 📝 = Word files (.doc, .docx)
- 📊 = Excel files (.xls, .xlsx)
- 📃 = Text files (.txt, .md)
- 🖼️ = Images (.jpg, .png)
- 📎 = Other files

---

## Approval Status Badges

Verify correct badges:

- **Green badge "✓ Full Approval"** → Full approval
- **Yellow badge "◐ Partial Approval"** → Partial approval
- **Red badge "✗ Denial"** → Denial
- **No badge** → Unknown/unclear status

---

## Performance Benchmarks

### Expected Times:
- File upload: **< 0.1s** per file
- Text analysis: **3-5 seconds**
- PDF analysis (small): **8-12 seconds**
- Multiple files (3): **10-15 seconds**

### If Slower:
- Check network speed
- Check AI provider status
- Check file sizes
- Check CPU usage

---

## Troubleshooting

### "Analyze" Button Disabled
- ✅ Expected if no files uploaded
- ❌ Issue if files are uploaded

### Loading Never Stops
1. Check browser console for errors
2. Check network tab for failed requests
3. Verify AI provider configured in .env
4. Try with different AI provider
5. Check internet connection

### No Results Display
1. Check if analysis actually completed
2. Look for error messages in console
3. Verify AI returned valid response
4. Check if results panel rendering

### Files Not Uploading
1. Check file size (must be < 10MB)
2. Check file type (must be supported)
3. Check browser console for errors
4. Try different file

### Error Alerts Appearing
1. **Normal** - This is current behavior (uses alert)
2. Read error message for details
3. Check which AI provider failed
4. Verify API keys configured
5. Check network connectivity

---

## Environment Check

Before testing, verify:

- [ ] App running at http://localhost:5174
- [ ] Test files generated in tests/test-files/
- [ ] At least one AI provider configured (.env)
- [ ] Browser DevTools open (F12)
- [ ] Network tab recording
- [ ] Console tab visible

---

## Quick Fix Commands

```bash
# App not starting?
npm install
npm run dev

# Test files missing?
node tests/test-runner.cjs generate

# Need test instructions?
node tests/test-runner.cjs instructions

# Want to see full report?
open tests/MANUAL_TEST_EXECUTION_REPORT.md

# Clear everything and restart?
rm -rf node_modules
npm install
node tests/test-runner.cjs generate
npm run dev
```

---

## Report Issue Template

**When reporting an issue, include:**

```
**Issue:** [Brief description]

**Steps to Reproduce:**
1. [First step]
2. [Second step]
3. [Third step]

**Expected:** [What should happen]
**Actual:** [What actually happened]

**Environment:**
- Browser: [Chrome/Firefox/Safari]
- OS: [Windows/Mac/Linux]
- App URL: http://localhost:5174
- Test File: [filename]

**Console Errors:** [Paste any red errors]

**Screenshot:** [If applicable]
```

---

## Success Criteria

### Component is Working If:
✅ Files upload successfully
✅ Analysis completes within reasonable time
✅ Results display with structured data
✅ Status badges show correctly
✅ No console errors during normal operation
✅ File management (add/remove) works
✅ Context fields accept input
✅ Clear all resets everything

### Component Needs Fixes If:
❌ Browser crashes with large files
❌ Analysis hangs indefinitely
❌ Errors show as browser alerts
❌ Mobile layout broken
❌ Keyboard navigation broken
❌ Empty files crash analysis

---

## Testing Priorities

### P0 - Must Test (Critical)
1. Basic upload and analysis
2. Results display
3. Error handling

### P1 - Should Test (Important)
4. Multiple file types
5. File management
6. Approval status detection

### P2 - Nice to Test (Enhancement)
7. Edge cases (empty, large)
8. Mobile layout
9. Accessibility
10. Performance

---

## Resources

- **Full Report:** `tests/MANUAL_TEST_EXECUTION_REPORT.md` (42 scenarios)
- **Test Suite:** `tests/DocumentAnalysisPanel.test.tsx` (35 automated tests)
- **README:** `tests/README.md` (Complete documentation)
- **Summary:** `tests/TEST_SUMMARY.md` (Executive summary)

---

## Final Checklist

**After making changes, verify:**

- [ ] Automated tests still pass
- [ ] Basic upload and analysis works
- [ ] No new console errors
- [ ] Results display correctly
- [ ] Error handling works
- [ ] Mobile layout acceptable
- [ ] Performance acceptable

---

**Happy Testing! 🎉**

_For detailed testing instructions, see: `tests/MANUAL_TEST_EXECUTION_REPORT.md`_
_For complete documentation, see: `tests/README.md`_
_For quick summary, see: `tests/TEST_SUMMARY.md`_
