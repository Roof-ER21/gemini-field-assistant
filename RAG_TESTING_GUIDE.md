# RAG Testing Guide

## Quick Start Testing

### 1. Start the Application

```bash
cd /Users/a21/Desktop/gemini-field-assistant
npm run dev
```

Navigate to `http://localhost:5174`

### 2. Open Browser Console

Press `F12` or `Cmd+Option+I` to see RAG logs

### 3. Test Queries

Try these queries in order to verify RAG functionality:

## Test Suite

### Test 1: Sales Script Retrieval

**Query:** "What's the initial pitch script?"

**Expected Behavior:**
- Console shows: `[RAG] Enhancing query with knowledge base...`
- Console shows: `[RAG] Found 3 relevant documents`
- Response includes script details (5 non-negotiables, door approach, etc.)
- Sources section at bottom lists:
  1. Initial Pitch Script (Sales Scripts)

**What to Look For:**
- Specific details about who you are, who Roof-ER is, making it relatable
- Reference to inspection and getting the close
- Citation: "According to [Document 1: Initial Pitch Script]..."

---

### Test 2: Email Template

**Query:** "Show me the repair attempt email template"

**Expected Behavior:**
- RAG triggered (console logs)
- 3 documents retrieved
- Response contains email template structure
- Sources include "Repair Attempt Template"

**What to Look For:**
- Actual email template text
- Subject line suggestions
- Proper formatting
- Clear citation

---

### Test 3: Insurance Arguments

**Query:** "What are the Maryland insurance matching requirements?"

**Expected Behavior:**
- RAG triggered
- Retrieved: Maryland Insurance Administration documents
- Detailed requirements explained
- Multiple sources cited

**What to Look For:**
- Specific Maryland law/regulation references
- Matching requirement details
- Citations from multiple Maryland documents

---

### Test 4: Training Materials

**Query:** "Tell me about the training manual"

**Expected Behavior:**
- RAG triggered
- Training Manual document retrieved
- Overview of training content
- Source citation

---

### Test 5: Non-RAG Query (Fallback)

**Query:** "What's the weather like today?"

**Expected Behavior:**
- No RAG logs in console
- General response (Gemini's knowledge)
- No source citations
- Note: "No specific documents found in the knowledge base"

**What to Look For:**
- System gracefully handles non-sales queries
- Still provides helpful response
- No errors

---

### Test 6: Complex Query

**Query:** "How do I handle an adjuster meeting and what email should I send after?"

**Expected Behavior:**
- RAG triggered
- Multiple relevant documents retrieved:
  - Post Adjuster Meeting Script
  - Adjuster Meeting Outcome Script
  - Post AM Email Template
- Comprehensive response covering both aspects
- Multiple source citations

---

## Verification Checklist

### Functional Requirements

- [ ] RAG triggers for sales-related queries
- [ ] Top 3 most relevant documents retrieved
- [ ] Document content included in context
- [ ] Gemini cites specific documents
- [ ] Source citations appended to response
- [ ] Non-relevant queries work without RAG
- [ ] Failed document loads don't break chat
- [ ] Response times < 3 seconds

### Quality Checks

- [ ] Retrieved documents are actually relevant
- [ ] Responses cite correct document names
- [ ] Citations use format: "[Document N: Name]"
- [ ] Sources section lists all used documents
- [ ] Responses are actionable and specific
- [ ] No hallucinated information
- [ ] Professional tone maintained

### Edge Cases

- [ ] Very short query: "script"
- [ ] Very long query: 200+ words
- [ ] Misspellings: "adjstar meeting"
- [ ] Query with no matches
- [ ] Rapid successive queries
- [ ] Voice input queries

## Console Output Reference

### Successful RAG Flow

```
[RAG] Enhancing query with knowledge base...
[RAG] Found 3 relevant documents
```

### Document Loading

```
// Success (no log)

// Failure
Could not load Initial Pitch Script: Error: HTTP 404
```

### No RAG Triggered

```
// No logs - query sent directly
```

## Common Issues

### Issue 1: No Documents Found

**Symptoms:** Response says "No specific documents found"

**Debug:**
1. Check query contains trigger keywords
2. Verify document paths in `knowledgeService.ts`
3. Check `/public/extracted_content/` exists

**Fix:** Add relevant keywords to `ragService.shouldUseRAG()`

---

### Issue 2: Document Load Failures

**Symptoms:** Console shows "Could not load..."

**Debug:**
1. Check file exists: `/public/extracted_content/Sales Rep Resources 2/...`
2. Verify file permissions
3. Check path in document index

**Fix:** Correct path in `knowledgeService.ts` document index

---

### Issue 3: Irrelevant Documents Retrieved

**Symptoms:** Sources don't match query intent

**Debug:**
1. Check relevance scores in console
2. Review keyword extraction logic
3. Examine category matching

**Fix:** Adjust scoring weights in `searchDocuments()`

---

### Issue 4: No Citations in Response

**Symptoms:** Gemini doesn't cite documents

**Debug:**
1. Verify RAG was triggered (console logs)
2. Check prompt format in `buildEnhancedPrompt()`
3. Ensure instructions are clear

**Fix:** Update prompt instructions to emphasize citations

---

## Performance Benchmarks

### Target Metrics

- **Document Search:** < 10ms
- **Document Load (per doc):** < 100ms
- **Total RAG Overhead:** < 300ms
- **End-to-End Response:** < 3 seconds

### Measuring Performance

Add timing logs to `ChatPanel.tsx`:

```typescript
const startTime = Date.now();
const ragContext = await ragService.buildRAGContext(originalQuery, 3);
console.log(`RAG time: ${Date.now() - startTime}ms`);
```

## Advanced Testing

### Load Testing

Test with rapid queries:

```javascript
const queries = [
  "What's the initial pitch script?",
  "Show me email templates",
  "Tell me about insurance arguments"
];

queries.forEach((q, i) => {
  setTimeout(() => {
    // Send query
    console.log(`Query ${i + 1}: ${q}`);
  }, i * 1000);
});
```

### Stress Testing

Test with long context:

```javascript
const longQuery = "Tell me everything about " + "insurance ".repeat(100);
// Should handle gracefully
```

### Error Injection

Test resilience:

```javascript
// Modify path to non-existent file
// Verify graceful degradation
```

## Success Criteria

The RAG implementation is considered successful if:

1. **Accuracy:** 90%+ of sales queries get relevant documents
2. **Performance:** 95%+ of queries respond in < 3 seconds
3. **Reliability:** 99%+ uptime (no crashes from RAG errors)
4. **User Experience:** Sales reps prefer RAG-enhanced answers
5. **Source Trust:** Citations allow verification of information

## Reporting Issues

When reporting RAG issues, include:

1. **Query:** Exact text entered
2. **Expected:** What should happen
3. **Actual:** What did happen
4. **Console Logs:** RAG-related output
5. **Network Tab:** Document load failures
6. **Screenshots:** Visual issues

## Next Steps

After testing:

1. [ ] Document test results
2. [ ] Identify improvement areas
3. [ ] Tune relevance scoring
4. [ ] Add more trigger keywords
5. [ ] Expand document index
6. [ ] Optimize prompt format
7. [ ] Collect user feedback
