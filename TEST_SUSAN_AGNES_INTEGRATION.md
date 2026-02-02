# Test Plan: Susan → Agnes Integration

## Quick Test Guide

### Test 1: Basic Improvement Question
**User Input:**
```
How can I get better at sales?
```

**Expected Susan Response:**
Should mention Agnes 21 as "younger sister" and direct to Learning section. Example:
```
If you want hands-on practice, check out my younger sister Agnes 21 in the Learning section.
She'll roleplay different scenarios with you and give real-time feedback on your pitch!
```

### Test 2: Practice Request
**User Input:**
```
Is there a way to practice my pitch?
```

**Expected Susan Response:**
Should recommend Agnes for roleplay training. Example:
```
Want to practice this live? My younger sister Agnes 21 does roleplay training - she can play
the homeowner and give you feedback. Find her in the Learning tab!
```

### Test 3: Contextual After Advice
**User Input (conversation flow):**
```
User: How do I handle objections about price?
Susan: [gives detailed advice]
User: Thanks! How can I practice this?
```

**Expected Susan Response:**
Should connect the advice to Agnes practice. Example:
```
If you want to practice handling price objections live, my younger sister Agnes 21 is perfect
for that. She's in the Learning section and will roleplay as the homeowner so you can refine
your responses.
```

### Test 4: Direct Training Question
**User Input:**
```
Do you have any training for improving my sales skills?
```

**Expected Susan Response:**
Should mention Agnes with enthusiasm. Example:
```
For hands-on training, check out my younger sister Agnes 21! She specializes in roleplay
scenarios where she plays the homeowner or adjuster and gives you real-time feedback.
You'll find her in the Learning tab.
```

### Test 5: Roleplay Mention
**User Input:**
```
Can I do roleplay training somewhere?
```

**Expected Susan Response:**
Should immediately point to Agnes. Example:
```
Yes! My younger sister Agnes 21 does exactly that. She's in the Learning section and will
run through different scenarios with you, playing the homeowner while you practice your pitch.
```

## What to Look For

### ✅ Good Signs
- Susan mentions "Agnes 21" or "Agnes"
- Uses familial language like "younger sister" or "my sister"
- Directs to "Learning section" or "Learning tab"
- Explains what Agnes does (roleplay, feedback)
- Tone is encouraging and supportive
- Response feels natural, not forced

### ❌ Red Flags
- Susan doesn't mention Agnes at all
- Generic response without specific recommendation
- No direction to where Agnes is located
- Cold/clinical tone instead of sisterly
- Lists features without personality

## Running the Tests

### Development Mode
```bash
cd /Users/a21/gemini-field-assistant
npm run dev
```

1. Open browser to `http://localhost:5173`
2. Navigate to Chat panel (Susan)
3. Type each test input
4. Verify Susan's responses match expected behavior

### Production Mode
```bash
npm run build
npm start
```

1. Open browser to production URL
2. Follow same test steps

## Edge Cases to Test

### Edge Case 1: Misspellings
**Input:** "How do I improove my sails?"
**Expected:** Susan should still recognize intent and mention Agnes

### Edge Case 2: Related But Different
**Input:** "How do I improve my documentation?"
**Expected:** Susan gives documentation advice, may or may not mention Agnes (context-dependent)

### Edge Case 3: Multiple Questions
**Input:** "How do I get better at sales and also handle tough adjusters?"
**Expected:** Susan addresses both, may mention Agnes for practice component

## Success Criteria

Integration is successful if:
- [ ] Susan mentions Agnes in 5/5 basic improvement questions
- [ ] Susan uses "younger sister" or "sister" terminology
- [ ] Susan directs to correct location (Learning section/tab)
- [ ] Tone is natural and encouraging
- [ ] No errors or broken responses
- [ ] Build completes without errors
- [ ] No performance degradation

## Rollback Plan

If integration causes issues:

```bash
git revert HEAD
npm run build
git push origin main
```

This will restore Susan's previous personality without Agnes awareness.

## Notes

- Integration is prompt-based only (no code changes)
- Should work immediately after deployment
- No database migrations needed
- No API changes required
- Fully backwards compatible

---

**Test Date:** 2026-02-01
**Tester:** [Your Name]
**Status:** Ready for Testing
