# RAG Quick Start Guide

## Get Running in 5 Minutes

### Prerequisites

- Node.js installed
- Gemini API key
- Documents in `/public/extracted_content/`

### Step 1: Environment Setup (30 seconds)

```bash
cd /Users/a21/Desktop/gemini-field-assistant

# Create .env.local if it doesn't exist
echo "GEMINI_API_KEY=your_api_key_here" > .env.local

# Install dependencies (if needed)
npm install
```

### Step 2: Start Application (10 seconds)

```bash
npm run dev
```

Navigate to: `http://localhost:5174`

### Step 3: Test RAG (1 minute)

1. **Open browser console** (F12)
2. **Type in chat:** "What's the initial pitch script?"
3. **Watch for logs:**
   ```
   [RAG] Enhancing query with knowledge base...
   [RAG] Found 3 relevant documents
   ```
4. **Verify response** includes:
   - Specific script details
   - Source citations at bottom

### Step 4: Try More Queries (3 minutes)

```
"Show me the repair attempt email template"
"What are the Maryland insurance matching requirements?"
"Tell me about the training manual"
"How do I handle an adjuster meeting?"
```

**Success Indicator:** Each response should include source citations.

---

## How It Works (30 Second Version)

```
User asks question
    ↓
System searches 50+ documents
    ↓
Finds top 3 most relevant
    ↓
Sends documents + question to Gemini
    ↓
Gemini answers using document context
    ↓
Response shows with source citations
```

---

## Key Files

```
services/
├── knowledgeService.ts    ← Document search
├── ragService.ts          ← RAG orchestration
└── geminiService.ts       ← Gemini API

components/
└── ChatPanel.tsx          ← RAG integration

public/
└── extracted_content/     ← 50+ markdown docs
```

---

## Configuration Quick Reference

### Change Number of Documents

**File:** `components/ChatPanel.tsx` (line 87)
```typescript
const ragContext = await ragService.buildRAGContext(originalQuery, 3);
// Change 3 to 5 for more context
```

### Add Trigger Keywords

**File:** `services/ragService.ts` (line 96)
```typescript
const ragKeywords = [
  'script', 'pitch', 'email', 'template',
  'your-new-keyword'  // Add here
];
```

### Add New Documents

**File:** `services/knowledgeService.ts` (line 24)
```typescript
{
  name: 'New Doc',
  path: `${DOCS_BASE}/path/to/doc.md`,
  type: 'md',
  category: 'Category'
}
```

---

## Common Issues & Quick Fixes

### Issue: "No documents found"
**Fix:** Check `/public/extracted_content/` exists

### Issue: No RAG logs in console
**Fix:** Query needs trigger keyword (see `ragService.ts`)

### Issue: Documents not loading
**Fix:** Verify paths in `knowledgeService.ts` match actual files

### Issue: Slow responses
**Fix:** Reduce number of documents from 3 to 2

---

## Testing Checklist

- [ ] RAG triggers for "What's the initial pitch script?"
- [ ] Console shows RAG logs
- [ ] Response includes source citations
- [ ] Non-sales queries work without RAG
- [ ] Build completes: `npm run build`

---

## Next Steps

1. ✅ Read `/RAG_IMPLEMENTATION.md` for architecture details
2. ✅ Read `/RAG_TESTING_GUIDE.md` for full test suite
3. ✅ Read `/RAG_SUMMARY.md` for overview
4. ✅ Customize trigger keywords for your use case
5. ✅ Add more documents to knowledge base
6. ✅ Deploy to production

---

## Quick Commands

```bash
# Development
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Check for errors (none expected)
npm run build 2>&1 | grep "error"
```

---

## Support

- **Technical Docs:** `/RAG_IMPLEMENTATION.md`
- **Testing:** `/RAG_TESTING_GUIDE.md`
- **Overview:** `/RAG_SUMMARY.md`
- **This Guide:** `/RAG_QUICKSTART.md`

---

**That's it! Your RAG system is ready to use.**
