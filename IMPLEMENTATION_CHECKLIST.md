# Knowledge Base Implementation Checklist

## Phase 1: Foundation (Week 1) - CRITICAL

### Step 1: Path Configuration
- [ ] Backup current `knowledgeService.ts`
- [ ] Update line 26: `const DOCS_BASE = '/docs';`
- [ ] Test document loading with new path
- [ ] Verify all 47 existing documents still load
- [ ] Remove `/public/extracted_content` directory (duplicate)

### Step 2: Clean Up Failed Files
- [ ] Delete `DMV Blank Contingency_ocr.json`
- [ ] Delete `PA Blank Contingency_ocr.json`
- [ ] Delete `RoofER_Top10_CheatSheet_Fixed_ocr.json`
- [ ] Delete `RESIDENTIAL_BRAND_GUIDELINES_ocr.json`
- [ ] Delete `RoofER_Master_Documents_ocr.json`
- [ ] Delete `RoofER_Master_Documents_Updated_ocr.json`

### Step 3: Remove Duplicates
- [ ] Backup `/Sales Rep Resources 2/Questions/` folder
- [ ] Delete `/Sales Rep Resources 2/Questions/` folder (keep Q&A Susan AI-21)
- [ ] Verify Q&A files accessible in Q&A Susan AI-21 folder

### Step 4: Add Critical Warranties (13 documents)
- [ ] GAF Standard Warranty.md
- [ ] GAF Timberline HDZ Presentation.md
- [ ] GAF Warranty Comparison.md
- [ ] Golden_Pledge_Limited_RESWT161_Legal_Sample.md
- [ ] Silver Pledge Legalese.md
- [ ] Silver Pledge Warranty Brochure.md
- [ ] Warranty Comparison Prsentation.md
- [ ] Workmanship Warranty.md
- [ ] What is a Deductible_.md
- [ ] RoofER Standard Materials.md
- [ ] Roof-ER.md
- [ ] SP Exclusion Form.md
- [ ] Post Sign Up Timeline.md

### Step 5: Add Critical Licenses (13 documents)
- [ ] GAF Master Elite 2025.md
- [ ] Master Elite Reference Letter for Customers.md
- [ ] Maryland License Valid through 2027.md
- [ ] Pennsylvania License Valid Through 2027.md
- [ ] PA license 2025 - 2027.md
- [ ] VA License 2025 - 2027.md
- [ ] COI - General Liability.md
- [ ] COI - workers comp 2026.md
- [ ] MD License.md
- [ ] VA Class A License.md
- [ ] Roof-ER CertainTeed ShingleMaster.md
- [ ] CERTIFIED_CERTIFICATE.md
- [ ] TAX ID Information.md

### Step 6: Testing
- [ ] Run full document index retrieval
- [ ] Test search for "warranty" (should return 5+ results)
- [ ] Test search for "license" (should return 5+ results)
- [ ] Test document content loading
- [ ] Verify category count increased to 9
- [ ] Verify total documents = 73

**Phase 1 Completion Target:** 73 indexed documents

---

## Phase 2: Expansion (Week 2-3) - HIGH PRIORITY

### Step 7: Add Photo Examples (5 documents)
- [ ] EXAMPLE PHOTOS.md
- [ ] Sample Photo Report 1.md
- [ ] Sample Photo Report 2.md
- [ ] Sample Photo Report 3.md
- [ ] Sample Photo Report 4.md

### Step 8: Add Q&A Resources (8 documents)
- [ ] GAF_Storm.md
- [ ] Pushback.md
- [ ] Escal.md
- [ ] Knowledge.md
- [ ] Stuck_do.md
- [ ] Training.md
- [ ] docs_temps.md
- [ ] susan_ai.md

### Step 9: Add Claim Response Procedures (2 documents)
- [ ] Roof-ER Roof & Siding Claim Response Packet.md
- [ ] Roof-ER Siding Claim Response Packet.md

### Step 10: Add Additional Scripts (2 documents)
- [ ] Adjuster Meeting Outcome Script.md
- [ ] AM Outcome Process.md

### Step 11: Add Reference Documents (11 documents)
- [ ] RESIDENTIAL_BRAND_GUIDELINES.md
- [ ] RoofER_Master_Documents_Updated.md
- [ ] RoofER_Master_Documents.md
- [ ] RoofER_Top10_CheatSheet_Fixed.md
- [ ] Roof-ER Sales Training (1).md
- [ ] Mission, Values, & Commitment.md
- [ ] Sales Operations and Tasks.md
- [ ] Adjuster_Inspector Information Sheet1.md
- [ ] Brochure.md
- [ ] Required Mortgage Endorsement Companies.md
- [ ] Role+.md

### Step 12: Add Tools & Processes (2 documents)
- [ ] Hover ESX_XML_PDF Process.md
- [ ] 📧 Email Generator .md

### Step 13: Testing
- [ ] Verify total documents = 103
- [ ] Verify all 16 categories present
- [ ] Test search across new categories
- [ ] Test document loading performance

**Phase 2 Completion Target:** 103 indexed documents

---

## Phase 3: Optimization (Week 3-4) - MEDIUM PRIORITY

### Step 14: Review Merged PDFs
- [ ] Review Merged_PDFs_1.md content (549 lines)
- [ ] Review Merged_PDFs_2.md content
- [ ] Review Merged_PDFs_3.md content
- [ ] Review Merged_PDFs_4.md content
- [ ] Review Merged_PDFs_5.md content
- [ ] Review Merged_PDFs_6.md content (932 lines)

### Step 15: Analyze Merged Content
- [ ] Identify unique content in merged docs
- [ ] Check for duplicates with indexed docs
- [ ] Decide: Index as composite or extract sections
- [ ] Document decision in project notes

### Step 16: Implement Chunking (if needed)
- [ ] Identify docs over 500 lines
- [ ] Implement chunking strategy
- [ ] Test chunked document retrieval
- [ ] Verify search quality maintained

### Step 17: Archive Old Documents
- [ ] Move expired licenses to `/archived_docs`
- [ ] Copy of MD License (Valid through 7_2025).md
- [ ] MD License (Valid through 7_2025).md
- [ ] VA Class A License (Valid through 12_2024.md

### Step 18: Final Testing
- [ ] Full regression test of all documents
- [ ] Performance testing with full index
- [ ] Search quality assessment
- [ ] User acceptance testing

**Phase 3 Completion Target:** 103-109 indexed documents (optimized)

---

## Phase 4: Enhancement (Month 2) - OPTIONAL

### Step 19: Implement Advanced Features
- [ ] Add document versioning tracking
- [ ] Implement usage analytics
- [ ] Add semantic search improvements
- [ ] Create document relationship mapping

### Step 20: Admin Dashboard
- [ ] Create document management UI
- [ ] Add document upload functionality
- [ ] Implement OCR quality checker
- [ ] Add duplicate detection tool

### Step 21: Documentation
- [ ] Update developer documentation
- [ ] Create user guide for document management
- [ ] Document search best practices
- [ ] Create troubleshooting guide

---

## Quick Reference: Category Names

```typescript
// Use these exact category names in knowledgeService.ts

'Sales Scripts'                      // 7 docs (existing)
'Additional Sales Scripts'           // 2 docs (new)
'Email Templates'                    // 11 docs (existing)
'Insurance Arguments'                // 15 docs (existing)
'Training'                          // 2 docs (existing)
'Agreements & Contracts'            // 9 docs (existing)
'Quick Reference'                   // 2 docs (existing)
'Procedures'                        // 1 doc (existing)
'Product Information & Warranties'  // 13 docs (new)
'Licenses & Certifications'         // 13 docs (new)
'Photo Documentation Examples'      // 5 docs (new)
'Q&A & Troubleshooting'            // 8 docs (new)
'Claim Response Procedures'         // 2 docs (new)
'Reference & Master Documents'      // 11 docs (new)
'Tools & Technical Processes'       // 2 docs (new)
'Composite Reference Documents'     // 6 docs (review)
```

---

## File Paths Reference

### Warranties Path Template
```typescript
`${DOCS_BASE}/Sales Rep Resources 2/Customer Resources(Products, Warranties, etc.)/[FILENAME].md`
```

### Licenses Path Template
```typescript
`${DOCS_BASE}/Sales Rep Resources 2/Licenses, Certifications, & General Liability Ins/[FILENAME].md`
```

### Q&A Path Template
```typescript
`${DOCS_BASE}/Sales Rep Resources 2/Q&A Susan AI-21/[FILENAME].md`
```

### Photo Examples Path Template
```typescript
`${DOCS_BASE}/Sales Rep Resources 2/Rep Reports & Photo Examples/[FILENAME].md`
```

### Scripts Path Template
```typescript
`${DOCS_BASE}/Sales Rep Resources 2/images samp/Pitches/[FILENAME].md`
`${DOCS_BASE}/Sales Rep Resources 2/images samp/Process/[FILENAME].md`
```

---

## Testing Commands

```bash
# Count total markdown files
find /Users/a21/Desktop/S21-A24/gemini-field-assistant/public/docs -name "*.md" | wc -l
# Expected: 124

# Verify no empty files
find /Users/a21/Desktop/S21-A24/gemini-field-assistant/public/docs -name "*.md" -size 0
# Expected: (no output)

# Check for duplicates
fdupes -r /Users/a21/Desktop/S21-A24/gemini-field-assistant/public/docs
# Expected: List of duplicates to remove
```

```typescript
// Test document index
const docs = await knowledgeService.getDocumentIndex();
console.log('Total documents:', docs.length);
console.log('Categories:', await knowledgeService.getCategories());

// Test search
const results = await knowledgeService.searchDocuments('warranty', 10);
console.log('Warranty results:', results.length);

// Test category filtering
const warranties = await knowledgeService.getDocumentsByCategory('Product Information & Warranties');
console.log('Warranty documents:', warranties.length);
```

---

## Rollback Plan

If issues occur:

1. **Restore knowledgeService.ts from backup**
2. **Restore extracted_content folder if needed**
3. **Verify original 47 documents still work**
4. **Document what went wrong**
5. **Fix issue before retry**

---

## Success Criteria

### Phase 1 Success
✅ 73 total documents indexed
✅ All paths use `/docs`
✅ No duplicate folders
✅ No failed OCR files
✅ Warranty search returns results
✅ License search returns results

### Phase 2 Success
✅ 103 total documents indexed
✅ All 16 categories present
✅ Q&A search returns results
✅ Photo example search returns results
✅ All reference docs accessible

### Phase 3 Success
✅ Merged PDFs reviewed
✅ Expired docs archived
✅ Performance optimized
✅ All tests passing

---

**Last Updated:** October 31, 2025
**Project:** S21-A24/gemini-field-assistant
**Owner:** Development Team
