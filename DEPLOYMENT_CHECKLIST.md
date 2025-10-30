# RAG System - Deployment Checklist

## Pre-Deployment Verification

### 1. Environment Setup
- [ ] Gemini API key configured in `.env.local`
- [ ] Node modules installed (`npm install`)
- [ ] Documents present in `/public/extracted_content/`
- [ ] Build completes successfully (`npm run build`)

### 2. Functional Testing
- [ ] App starts in dev mode (`npm run dev`)
- [ ] Chat interface loads without errors
- [ ] Browser console accessible (F12)

### 3. RAG Functionality Tests

#### Test 1: Sales Script Query
- [ ] Enter: "What's the initial pitch script?"
- [ ] Console shows: `[RAG] Enhancing query with knowledge base...`
- [ ] Console shows: `[RAG] Found 3 relevant documents`
- [ ] Response includes specific script details
- [ ] Sources section appears at bottom
- [ ] At least one citation to "Initial Pitch Script"

#### Test 2: Email Template Query
- [ ] Enter: "Show me the repair attempt email template"
- [ ] RAG triggered (console logs)
- [ ] Response contains email template
- [ ] Sources include "Repair Attempt Template"

#### Test 3: Insurance Query
- [ ] Enter: "What are the Maryland insurance matching requirements?"
- [ ] RAG triggered
- [ ] Multiple Maryland documents retrieved
- [ ] Response cites specific requirements
- [ ] Multiple sources listed

#### Test 4: Non-Sales Query (Fallback)
- [ ] Enter: "What's the weather like?"
- [ ] NO RAG logs in console
- [ ] Response provided (general knowledge)
- [ ] No error messages
- [ ] Chat continues to work

### 4. Performance Verification
- [ ] Responses complete within 5 seconds
- [ ] No JavaScript errors in console
- [ ] No network errors (check Network tab)
- [ ] Document loading succeeds (check console for failures)

### 5. Error Handling
- [ ] Test with very long query (200+ words)
- [ ] Test with special characters in query
- [ ] Test rapid successive queries
- [ ] Verify graceful degradation if docs fail to load

## Deployment Steps

### Step 1: Final Build
```bash
cd /Users/a21/Desktop/gemini-field-assistant
npm run build
```
- [ ] Build completes without errors
- [ ] No TypeScript errors
- [ ] Bundle size acceptable (<500KB)

### Step 2: Environment Variables
- [ ] Production API key configured
- [ ] Environment variables secured
- [ ] No keys in source code

### Step 3: Deploy Application
- [ ] Files uploaded to hosting
- [ ] Static assets accessible
- [ ] `/extracted_content/` directory included
- [ ] Environment variables set on server

### Step 4: Post-Deployment Verification
- [ ] Production URL accessible
- [ ] Chat loads without errors
- [ ] Test at least 3 RAG queries
- [ ] Verify source citations appear
- [ ] Check browser console for errors

## User Training

### Documentation to Share
- [ ] `/RAG_QUICKSTART.md` - For quick overview
- [ ] Example queries provided
- [ ] Source citation explanation
- [ ] Limitations communicated

### Key Points to Cover
- [ ] How to ask effective questions
- [ ] When RAG will be used (automatic)
- [ ] What source citations mean
- [ ] How to interpret responses
- [ ] Who to contact for issues

## Monitoring Setup

### Metrics to Track
- [ ] RAG trigger rate (% of queries)
- [ ] Average response time
- [ ] Document load success rate
- [ ] Most common queries
- [ ] Most retrieved documents

### Logging
- [ ] RAG usage logged
- [ ] Error conditions captured
- [ ] Performance metrics recorded

## Rollback Plan

### If Issues Arise
- [ ] Backup of old code available
- [ ] Rollback procedure documented
- [ ] Alternative query path available

### Emergency Contacts
- [ ] Development team contact info
- [ ] API key reset procedure
- [ ] Hosting provider support

## Post-Launch Tasks

### Week 1
- [ ] Monitor error logs daily
- [ ] Collect user feedback
- [ ] Track response times
- [ ] Document any issues

### Week 2-4
- [ ] Analyze usage patterns
- [ ] Identify improvement areas
- [ ] Plan first iteration
- [ ] Update documentation if needed

### Month 2+
- [ ] Tune relevance scoring based on feedback
- [ ] Add popular requested documents
- [ ] Expand trigger keywords
- [ ] Consider advanced features

## Success Criteria

### Technical
- [ ] 95%+ uptime
- [ ] <3s average response time
- [ ] <5% error rate
- [ ] 90%+ RAG trigger accuracy

### User Satisfaction
- [ ] Users find responses helpful
- [ ] Source citations trusted
- [ ] Prefer RAG answers over manual search
- [ ] Request feature in other tools

## Sign-Off

### Development Team
- [ ] Code reviewed
- [ ] Tests passed
- [ ] Documentation complete
- [ ] Ready for deployment

**Signed:** ________________  **Date:** ________

### Product Owner
- [ ] Features verified
- [ ] User stories complete
- [ ] Acceptance criteria met
- [ ] Approved for release

**Signed:** ________________  **Date:** ________

### QA Team
- [ ] Test cases executed
- [ ] Bugs resolved
- [ ] Performance acceptable
- [ ] Ready for production

**Signed:** ________________  **Date:** ________

---

## Notes

**Deployment Date:** __________

**Version:** 1.0

**Deployed By:** __________

**Issues Encountered:**

---

**Post-Deployment Status:**
- [ ] All checks passed
- [ ] Users trained
- [ ] Monitoring active
- [ ] Support plan in place

---

*Use this checklist to ensure smooth deployment of the RAG system.*
