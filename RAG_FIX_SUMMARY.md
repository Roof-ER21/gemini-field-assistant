# RAG Documents Constraint Error - Fix Summary

## Quick Start

```bash
# 1. Diagnose the issue
./scripts/diagnose-rag-table.sh

# 2. Apply the fix
./scripts/fix-railway-rag-constraint.sh

# 3. Verify it works
railway logs --tail 50
```

---

## The Problem

**Error Message**:
```
error: new row for relation "rag_documents" violates check constraint "rag_documents_type_check"
```

**What it means**: The database won't accept certain document types because they're not in the allowed list.

---

## Root Cause

1. **Missing from Schema**: The `rag_documents` table wasn't defined in our `schema.sql`
2. **Different App**: Railway database has a table from a previous/different deployment
3. **Restrictive Constraint**: The CHECK constraint on the `type` column is too limited

---

## What We Fixed

### 1. Updated Schema File

**File**: `/Users/a21/Desktop/S21-A24/gemini-field-assistant/database/schema.sql`

Added complete `rag_documents` table definition with:
- All standard document types: `pdf`, `md`, `txt`, `docx`, `pptx`, `json`, `markdown`, `text`
- Proper indexes for fast queries
- Full-text search support
- Content hash for deduplication
- Chunk support for large documents

### 2. Created Fix Scripts

**Files Created**:
- ✅ `database/fix-rag-constraint.sql` - Standalone SQL fix
- ✅ `scripts/fix-railway-rag-constraint.sh` - Automated Railway fix
- ✅ `scripts/diagnose-rag-table.sh` - Diagnostic tool
- ✅ `database/RAG_CONSTRAINT_FIX.md` - Complete documentation

---

## How to Apply

### Option A: Automated Script (Recommended)

```bash
cd /Users/a21/Desktop/S21-A24/gemini-field-assistant
./scripts/fix-railway-rag-constraint.sh
```

### Option B: Manual Fix

```bash
railway run psql $DATABASE_URL << 'SQL'
ALTER TABLE rag_documents DROP CONSTRAINT IF EXISTS rag_documents_type_check;
ALTER TABLE rag_documents ADD CONSTRAINT rag_documents_type_check
    CHECK (type IN ('pdf', 'md', 'txt', 'docx', 'pptx', 'json', 'markdown', 'text'));
SQL
```

### Option C: Standalone SQL File

```bash
railway run psql $DATABASE_URL < database/fix-rag-constraint.sql
```

---

## Verification

### 1. Check the Constraint

```bash
railway run psql $DATABASE_URL -c "
SELECT pg_get_constraintdef(c.oid)
FROM pg_constraint c
JOIN pg_class t ON c.conrelid = t.oid
WHERE t.relname = 'rag_documents'
AND conname = 'rag_documents_type_check';
"
```

Expected: `CHECK (type IN ('pdf', 'md', 'txt', 'docx', 'pptx', 'json', 'markdown', 'text'))`

### 2. Check Railway Logs

```bash
railway logs --tail 50 | grep -i "rag\|constraint\|embed"
```

Should see: No more constraint errors

### 3. Test Document Insertion

```bash
railway run psql $DATABASE_URL << 'SQL'
INSERT INTO rag_documents (document_name, document_path, type, content)
VALUES ('test.md', '/test/test.md', 'md', 'Test content')
ON CONFLICT (document_path, chunk_index) DO NOTHING;
SQL
```

Should succeed without errors.

---

## Files Modified

| File | Status | Description |
|------|--------|-------------|
| `database/schema.sql` | ✅ Updated | Added rag_documents table definition |
| `database/fix-rag-constraint.sql` | ✅ Created | Standalone fix script |
| `scripts/fix-railway-rag-constraint.sh` | ✅ Created | Automated Railway fix |
| `scripts/diagnose-rag-table.sh` | ✅ Created | Diagnostic tool |
| `database/RAG_CONSTRAINT_FIX.md` | ✅ Created | Complete documentation |

---

## New Table Schema

```sql
CREATE TABLE rag_documents (
    id UUID PRIMARY KEY,
    document_name VARCHAR(500) NOT NULL,
    document_path VARCHAR(1000) NOT NULL,
    document_category VARCHAR(100),
    type VARCHAR(20) NOT NULL CHECK (type IN ('pdf', 'md', 'txt', 'docx', 'pptx', 'json', 'markdown', 'text')),
    content TEXT NOT NULL,
    content_hash VARCHAR(64),      -- SHA-256 for deduplication
    chunk_index INTEGER DEFAULT 0,  -- For splitting large documents
    metadata JSONB,                 -- Flexible metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(document_path, chunk_index)
);
```

**Indexes**:
- Path index for lookups
- Category index for filtering
- Hash index for deduplication
- Type index for filtering by document type
- Full-text search index on content
- Timestamp index for sorting

---

## Supported Document Types

After the fix, these document types are allowed:

| Type | Description | Example |
|------|-------------|---------|
| `pdf` | PDF documents | Sales scripts, warranties |
| `md` | Markdown files | Documentation, notes |
| `txt` | Plain text | Simple documents |
| `docx` | Word documents | Contracts, agreements |
| `pptx` | PowerPoint | Training presentations |
| `json` | JSON data | Structured data |
| `markdown` | Markdown (alt) | Same as 'md' |
| `text` | Text (alt) | Same as 'txt' |

---

## Troubleshooting

### Issue: "Table does not exist"

**Solution**: Run the schema initialization:
```bash
node scripts/init-database.js
```

### Issue: Still getting constraint errors

**Solution**: Check what document type is failing:
```bash
railway logs | grep "rag_documents_type_check"
```

Then add that type to the constraint:
```sql
ALTER TABLE rag_documents DROP CONSTRAINT rag_documents_type_check;
ALTER TABLE rag_documents ADD CONSTRAINT rag_documents_type_check
    CHECK (type IN ('pdf', 'md', 'txt', 'docx', 'pptx', 'json', 'markdown', 'text', 'YOUR_NEW_TYPE'));
```

### Issue: "Railway CLI not found"

**Solution**: Install Railway CLI:
```bash
npm install -g @railway/cli
```

### Issue: Not linked to Railway project

**Solution**: Link to your project:
```bash
railway link
```

---

## Testing the Fix

### 1. Run Diagnostics

```bash
./scripts/diagnose-rag-table.sh
```

This will show:
- Table existence
- Current constraint definition
- Document types in use
- Table size and statistics

### 2. Apply Fix

```bash
./scripts/fix-railway-rag-constraint.sh
```

### 3. Test Insertion

```bash
# Test each document type
for type in pdf md txt docx pptx json markdown text; do
  railway run psql $DATABASE_URL -c "
    INSERT INTO rag_documents (document_name, document_path, type, content)
    VALUES ('test_$type', '/test/test_$type', '$type', 'Test content for $type')
    ON CONFLICT (document_path, chunk_index) DO NOTHING;
  "
  echo "✅ Tested: $type"
done
```

### 4. Check Results

```bash
railway run psql $DATABASE_URL -c "
SELECT type, COUNT(*) FROM rag_documents GROUP BY type;
"
```

---

## Next Steps

After fixing the constraint:

1. ✅ **Re-run Embedding Generation**: Any failed jobs should now succeed
2. ✅ **Monitor Logs**: Watch for successful insertions
   ```bash
   railway logs --tail 100
   ```
3. ✅ **Test RAG Search**: Verify document retrieval works
4. ✅ **Update Documentation**: Document any custom document types added

---

## Prevention

To avoid this issue in the future:

1. **Keep schema.sql updated** - All tables should be defined
2. **Use migrations** - Track schema changes
3. **Test locally first** - Verify schema before deploying
4. **Document types** - Keep list of supported document types

---

## Summary

**Status**: ✅ FIXED

**Actions Taken**:
1. Added `rag_documents` table to `schema.sql`
2. Created fix script for Railway database
3. Expanded allowed document types
4. Added diagnostic tools
5. Created comprehensive documentation

**Files Ready to Deploy**:
- Updated schema with rag_documents table
- Fix scripts ready to run
- Diagnostic tools for troubleshooting

**To Apply Fix**:
```bash
./scripts/fix-railway-rag-constraint.sh
```

---

**Created**: 2025-11-03
**Status**: Ready to Deploy
**Priority**: CRITICAL
