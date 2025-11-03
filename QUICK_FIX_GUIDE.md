# Quick Fix Guide - RAG Constraint Error

## The Error
```
error: new row for relation "rag_documents" violates check constraint "rag_documents_type_check"
```

## The Fix (30 seconds)

```bash
cd /Users/a21/Desktop/S21-A24/gemini-field-assistant

# 1. Apply the fix
./scripts/fix-railway-rag-constraint.sh

# 2. Verify it worked
./scripts/verify-rag-fix.sh
```

That's it! ✅

---

## What Just Happened?

The script:
1. ✅ Dropped the old restrictive constraint
2. ✅ Added a new constraint allowing all document types: `pdf`, `md`, `txt`, `docx`, `pptx`, `json`, `markdown`, `text`
3. ✅ Verified the fix works

---

## Check It Worked

```bash
# Should see no errors
railway logs --tail 20 | grep -i "constraint\|error"
```

If no output = success! 🎉

---

## Manual Fix (If Scripts Don't Work)

```bash
railway run psql $DATABASE_URL << 'SQL'
ALTER TABLE rag_documents DROP CONSTRAINT rag_documents_type_check;
ALTER TABLE rag_documents ADD CONSTRAINT rag_documents_type_check
    CHECK (type IN ('pdf', 'md', 'txt', 'docx', 'pptx', 'json', 'markdown', 'text'));
SQL
```

---

## Troubleshooting

### "railway command not found"
```bash
npm install -g @railway/cli
railway login
railway link
```

### "Table does not exist"
```bash
node scripts/init-database.js
```

### Still getting errors?
```bash
# Diagnose the issue
./scripts/diagnose-rag-table.sh

# Check what's failing
railway logs | grep "rag_documents"
```

---

## Files Created

All fixes are in these locations:

| File | Purpose |
|------|---------|
| `scripts/fix-railway-rag-constraint.sh` | Apply the fix |
| `scripts/verify-rag-fix.sh` | Test the fix |
| `scripts/diagnose-rag-table.sh` | Diagnose issues |
| `database/fix-rag-constraint.sql` | Standalone SQL fix |
| `database/schema.sql` | Updated with rag_documents table |

---

## Complete Documentation

For detailed explanation, see:
- `RAG_FIX_SUMMARY.md` - Complete summary
- `database/RAG_CONSTRAINT_FIX.md` - Detailed guide

---

## Support

If you're still having issues:

1. Run diagnostics:
   ```bash
   ./scripts/diagnose-rag-table.sh
   ```

2. Check the output for specific errors

3. The diagnostic will tell you exactly what's wrong

---

**Quick Fix Time**: ~30 seconds
**Status**: Ready to Deploy
**Tested**: ✅ Yes
