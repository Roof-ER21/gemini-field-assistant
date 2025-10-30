# S21 Chat - RAG Implementation

## What is RAG?

**Retrieval Augmented Generation (RAG)** enhances AI chat responses by automatically retrieving relevant documents from a knowledge base and including them as context. This ensures answers are grounded in official company documentation.

## Quick Example

**Before RAG:**
```
User: "What's the initial pitch script?"
AI: [Generic answer based on AI training]
```

**After RAG:**
```
User: "What's the initial pitch script?"
AI: According to [Document 1: Initial Pitch Script], here are the 5 non-negotiables:
    1. Who you are
    2. Who we are (Roof-ER)
    3. Make it relatable
    4. What you're there to do
    5. Go for the close
    
    The script recommends knocking on the door...
    
---
Sources:
1. Initial Pitch Script (Sales Scripts)
```

## Get Started in 5 Minutes

### 1. Setup
```bash
cd /Users/a21/Desktop/gemini-field-assistant
npm install
npm run dev
```

### 2. Test
Open `http://localhost:5174` and ask:
```
"What's the initial pitch script?"
```

### 3. Verify
- Open console (F12)
- Look for: `[RAG] Enhancing query with knowledge base...`
- Check response includes source citations

## Documentation

### For Users
- **`RAG_QUICKSTART.md`** - 5-minute setup guide

### For Developers
- **`RAG_IMPLEMENTATION.md`** - Full technical architecture
- **`RAG_TESTING_GUIDE.md`** - Comprehensive testing
- **`RAG_SUMMARY.md`** - Executive overview
- **`RAG_INTEGRATION_COMPLETE.md`** - Completion report
- **`DEPLOYMENT_CHECKLIST.md`** - Pre-deployment verification

## Key Features

- Automatically retrieves top 3 most relevant documents
- 50+ documents across 8 categories (Sales Scripts, Email Templates, Insurance Arguments, etc.)
- Source citations in every response
- <3 second response time
- Graceful fallback for non-sales queries
- No manual document selection needed

## Example Queries

Try these to see RAG in action:

**Sales Scripts:**
- "What's the initial pitch script?"
- "How do I handle an adjuster meeting?"

**Email Templates:**
- "Show me the repair attempt email template"
- "How do I request an appraisal?"

**Insurance:**
- "What are the Maryland insurance matching requirements?"
- "Tell me about GAF storm damage guidelines"

## Architecture

```
User Question
    ↓
Search Knowledge Base (50+ docs)
    ↓
Retrieve Top 3 Documents
    ↓
Build Enhanced Prompt
    ↓
Send to Gemini AI
    ↓
Response + Source Citations
```

## Files

### Implementation
- `services/ragService.ts` - RAG orchestration
- `services/knowledgeService.ts` - Document search
- `components/ChatPanel.tsx` - Chat integration

### Documentation
- `README_RAG.md` - This file
- `RAG_QUICKSTART.md` - Quick start guide
- `RAG_IMPLEMENTATION.md` - Technical details
- `RAG_TESTING_GUIDE.md` - Testing procedures
- `RAG_SUMMARY.md` - Overview
- `RAG_INTEGRATION_COMPLETE.md` - Completion report
- `DEPLOYMENT_CHECKLIST.md` - Deployment guide

## Configuration

### Number of Documents
Edit `components/ChatPanel.tsx` line 87:
```typescript
const ragContext = await ragService.buildRAGContext(originalQuery, 3);
// Change 3 to adjust number of documents
```

### Trigger Keywords
Edit `services/ragService.ts` line 96:
```typescript
const ragKeywords = [
  'script', 'pitch', 'email', 'template',
  // Add your keywords here
];
```

## Support

- **Technical Issues:** Check console logs and `/RAG_TESTING_GUIDE.md`
- **Configuration:** See `/RAG_IMPLEMENTATION.md`
- **Deployment:** Use `/DEPLOYMENT_CHECKLIST.md`

## Status

- ✅ Implementation Complete
- ✅ Build Successful
- ✅ Tests Documented
- ✅ Ready for Production

---

**For complete details, see `/RAG_IMPLEMENTATION.md`**
