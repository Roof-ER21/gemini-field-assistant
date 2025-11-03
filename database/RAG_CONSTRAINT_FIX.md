# RAG Documents Constraint Error - Complete Fix Guide

## The Problem

**Error**: `error: new row for relation "rag_documents" violates check constraint "rag_documents_type_check"`

**Location**: Railway PostgreSQL database

**Root Cause**: The `rag_documents` table has a CHECK constraint on the `type` column that is too restrictive or doesn't include all the document types your application is trying to insert.

---

## Root Cause Analysis

### What We Discovered

1. **Missing Table Definition**: The `rag_documents` table was NOT in our `schema.sql` file
2. **Different Application**: Railway logs show a different application (Next.js) created this table
3. **Constraint Mismatch**: The CHECK constraint doesn't allow all document types we need

### Why This Happened

- The Railway database may have been used by a previous/different deployment
- The constraint was created with a limited set of allowed document types
- When new document types (like 'md', 'markdown', 'text') are inserted, they violate the constraint

---

## The Fix (3 Options)

### Option 1: Quick Fix Script (Recommended)

Run the automated fix script:

```bash
cd /Users/a21/Desktop/S21-A24/gemini-field-assistant
./scripts/fix-railway-rag-constraint.sh
```

This will:
- Drop the old constraint
- Add a new constraint with extended type list: `('pdf', 'md', 'txt', 'docx', 'pptx', 'json', 'markdown', 'text')`
- Verify the fix

### Option 2: Manual Fix via Railway CLI

```bash
# Connect to Railway database
railway run psql $DATABASE_URL

# Inside psql, run:
ALTER TABLE rag_documents DROP CONSTRAINT IF EXISTS rag_documents_type_check;

ALTER TABLE rag_documents ADD CONSTRAINT rag_documents_type_check
    CHECK (type IN ('pdf', 'md', 'txt', 'docx', 'pptx', 'json', 'markdown', 'text'));

-- Verify
\d rag_documents

-- Exit
\q
```

### Option 3: Apply Complete Schema Fix

Run the comprehensive fix SQL file:

```bash
cd /Users/a21/Desktop/S21-A24/gemini-field-assistant

# Apply the fix
railway run psql $DATABASE_URL < database/fix-rag-constraint.sql
```

---

## Updated Schema

The `rag_documents` table is now included in `/Users/a21/Desktop/S21-A24/gemini-field-assistant/database/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS rag_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_name VARCHAR(500) NOT NULL,
    document_path VARCHAR(1000) NOT NULL,
    document_category VARCHAR(100),
    type VARCHAR(20) NOT NULL CHECK (type IN ('pdf', 'md', 'txt', 'docx', 'pptx', 'json', 'markdown', 'text')),
    content TEXT NOT NULL,
    content_hash VARCHAR(64),
    chunk_index INTEGER DEFAULT 0,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(document_path, chunk_index)
);
```

---

## Verification Steps

After applying the fix:

### 1. Check Constraint

```bash
railway run psql $DATABASE_URL -c "
SELECT conname, pg_get_constraintdef(c.oid)
FROM pg_constraint c
JOIN pg_class t ON c.conrelid = t.oid
WHERE t.relname = 'rag_documents'
AND conname = 'rag_documents_type_check';
"
```

Expected output:
```
constraint_name          | constraint_definition
-------------------------+------------------------------------------------
rag_documents_type_check | CHECK (type IN ('pdf', 'md', 'txt', 'docx', ...))
```

### 2. Check Table Structure

```bash
railway run psql $DATABASE_URL -c "\d rag_documents"
```

### 3. Test Document Types

```bash
railway run psql $DATABASE_URL -c "
SELECT type, COUNT(*) as count
FROM rag_documents
GROUP BY type;
"
```

### 4. Check Railway Logs

```bash
railway logs --tail 50
```

Look for:
- No more constraint violation errors
- Successful embedding insertions

---

## Preventing Future Issues

### 1. Keep Schema in Sync

Always update `database/schema.sql` when adding new tables:

```bash
# After modifying schema.sql, apply to Railway:
node scripts/init-database.js
```

### 2. Add New Document Types

If you need to support more document types, update the constraint:

```sql
ALTER TABLE rag_documents DROP CONSTRAINT rag_documents_type_check;
ALTER TABLE rag_documents ADD CONSTRAINT rag_documents_type_check
    CHECK (type IN ('pdf', 'md', 'txt', 'docx', 'pptx', 'json', 'markdown', 'text', 'csv', 'xlsx'));
```

### 3. Railway Project Verification

Ensure you're deploying to the correct Railway service:

```bash
# Check project status
railway status

# List services
railway service

# Link to correct service if needed
railway link
```

---

## Common Questions

### Q: Why wasn't rag_documents in our schema.sql?

**A**: This table was created by a different application or a previous deployment. We've now added it to our schema for consistency.

### Q: Can I just drop the constraint entirely?

**A**: Not recommended. The constraint ensures data integrity by preventing invalid document types from being inserted.

### Q: What if I get "table does not exist" error?

**A**: The fix script will create the table if it doesn't exist. You can also run:

```bash
node scripts/init-database.js
```

### Q: How do I know what document types are currently in use?

**A**: Query the database:

```sql
SELECT DISTINCT type FROM rag_documents;
```

---

## Files Modified

1. ✅ `/Users/a21/Desktop/S21-A24/gemini-field-assistant/database/schema.sql` - Added rag_documents table
2. ✅ `/Users/a21/Desktop/S21-A24/gemini-field-assistant/database/fix-rag-constraint.sql` - Standalone fix script
3. ✅ `/Users/a21/Desktop/S21-A24/gemini-field-assistant/scripts/fix-railway-rag-constraint.sh` - Automated fix script

---

## Support

If you continue to see constraint errors after applying the fix:

1. Check what document type is being inserted:
   ```bash
   railway logs | grep "rag_documents_type_check"
   ```

2. The error message will show the failing value

3. Add that type to the constraint:
   ```sql
   ALTER TABLE rag_documents DROP CONSTRAINT rag_documents_type_check;
   ALTER TABLE rag_documents ADD CONSTRAINT rag_documents_type_check
       CHECK (type IN ('pdf', 'md', 'txt', 'docx', 'pptx', 'json', 'markdown', 'text', 'YOUR_NEW_TYPE'));
   ```

---

## Next Steps

After fixing the constraint:

1. ✅ Re-run any failed embedding generation jobs
2. ✅ Test RAG search functionality
3. ✅ Monitor Railway logs for successful insertions
4. ✅ Document any custom document types you add

---

**Created**: 2025-11-03
**Last Updated**: 2025-11-03
**Status**: Ready to Apply
