# Phase 1 Implementation - Code Snippets

**Quick-start code for adding the first 26 critical documents**

---

## Step 1: Update DOCS_BASE Path

**File:** `services/knowledgeService.ts`
**Line:** 26

**Before:**
```typescript
const DOCS_BASE = '/extracted_content';
```

**After:**
```typescript
const DOCS_BASE = '/docs';
```

---

## Step 2: Add New Categories and Documents

**File:** `services/knowledgeService.ts`
**Lines:** 31-92 (expand this section)

Add these entries to the `getDocumentIndex()` return array:

```typescript
// NEW CATEGORY: Product Information & Warranties (13 docs)
{
  name: 'GAF Standard Warranty',
  path: `${DOCS_BASE}/Sales Rep Resources 2/Customer Resources(Products, Warranties, etc.)/GAF Standard Warranty.md`,
  type: 'md',
  category: 'Product Information & Warranties'
},
{
  name: 'GAF Timberline HDZ Presentation',
  path: `${DOCS_BASE}/Sales Rep Resources 2/Customer Resources(Products, Warranties, etc.)/GAF Timberline HDZ Presentation.md`,
  type: 'md',
  category: 'Product Information & Warranties'
},
{
  name: 'GAF Warranty Comparison',
  path: `${DOCS_BASE}/Sales Rep Resources 2/Customer Resources(Products, Warranties, etc.)/GAF Warranty Comparison.md`,
  type: 'md',
  category: 'Product Information & Warranties'
},
{
  name: 'Golden Pledge Limited Warranty Legal Sample',
  path: `${DOCS_BASE}/Sales Rep Resources 2/Customer Resources(Products, Warranties, etc.)/Golden_Pledge_Limited_RESWT161_Legal_Sample.md`,
  type: 'md',
  category: 'Product Information & Warranties'
},
{
  name: 'Silver Pledge Legalese',
  path: `${DOCS_BASE}/Sales Rep Resources 2/Customer Resources(Products, Warranties, etc.)/Silver Pledge Legalese.md`,
  type: 'md',
  category: 'Product Information & Warranties'
},
{
  name: 'Silver Pledge Warranty Brochure',
  path: `${DOCS_BASE}/Sales Rep Resources 2/Customer Resources(Products, Warranties, etc.)/Silver Pledge Warranty Brochure.md`,
  type: 'md',
  category: 'Product Information & Warranties'
},
{
  name: 'Warranty Comparison Presentation',
  path: `${DOCS_BASE}/Sales Rep Resources 2/Customer Resources(Products, Warranties, etc.)/Warranty Comparison Prsentation.md`,
  type: 'md',
  category: 'Product Information & Warranties'
},
{
  name: 'Workmanship Warranty',
  path: `${DOCS_BASE}/Sales Rep Resources 2/Customer Resources(Products, Warranties, etc.)/Workmanship Warranty.md`,
  type: 'md',
  category: 'Product Information & Warranties'
},
{
  name: 'What is a Deductible',
  path: `${DOCS_BASE}/Sales Rep Resources 2/Customer Resources(Products, Warranties, etc.)/What is a Deductible_.md`,
  type: 'md',
  category: 'Product Information & Warranties'
},
{
  name: 'RoofER Standard Materials',
  path: `${DOCS_BASE}/Sales Rep Resources 2/Customer Resources(Products, Warranties, etc.)/RoofER Standard Materials.md`,
  type: 'md',
  category: 'Product Information & Warranties'
},
{
  name: 'Roof-ER Company Overview',
  path: `${DOCS_BASE}/Sales Rep Resources 2/Customer Resources(Products, Warranties, etc.)/Roof-ER.md`,
  type: 'md',
  category: 'Product Information & Warranties'
},
{
  name: 'SP Exclusion Form',
  path: `${DOCS_BASE}/Sales Rep Resources 2/Customer Resources(Products, Warranties, etc.)/SP Exclusion Form.md`,
  type: 'md',
  category: 'Product Information & Warranties'
},
{
  name: 'Post Sign Up Timeline',
  path: `${DOCS_BASE}/Sales Rep Resources 2/Customer Resources(Products, Warranties, etc.)/Post Sign Up Timeline.md`,
  type: 'md',
  category: 'Product Information & Warranties'
},

// NEW CATEGORY: Licenses & Certifications (13 docs)
{
  name: 'GAF Master Elite 2025',
  path: `${DOCS_BASE}/Sales Rep Resources 2/Licenses, Certifications, & General Liability Ins/GAF Master Elite 2025.md`,
  type: 'md',
  category: 'Licenses & Certifications'
},
{
  name: 'Master Elite Reference Letter for Customers',
  path: `${DOCS_BASE}/Sales Rep Resources 2/Licenses, Certifications, & General Liability Ins/Master Elite Reference Letter for Customers.md`,
  type: 'md',
  category: 'Licenses & Certifications'
},
{
  name: 'Maryland License Valid through 2027',
  path: `${DOCS_BASE}/Sales Rep Resources 2/Licenses, Certifications, & General Liability Ins/Maryland License Valid through 2027.md`,
  type: 'md',
  category: 'Licenses & Certifications'
},
{
  name: 'Pennsylvania License Valid Through 2027',
  path: `${DOCS_BASE}/Sales Rep Resources 2/Licenses, Certifications, & General Liability Ins/Pennsylvania License Valid Through 2027.md`,
  type: 'md',
  category: 'Licenses & Certifications'
},
{
  name: 'PA License 2025 - 2027',
  path: `${DOCS_BASE}/Sales Rep Resources 2/Licenses, Certifications, & General Liability Ins/PA license 2025 - 2027.md`,
  type: 'md',
  category: 'Licenses & Certifications'
},
{
  name: 'VA License 2025 - 2027',
  path: `${DOCS_BASE}/Sales Rep Resources 2/Licenses, Certifications, & General Liability Ins/VA License 2025 - 2027.md`,
  type: 'md',
  category: 'Licenses & Certifications'
},
{
  name: 'COI - General Liability',
  path: `${DOCS_BASE}/Sales Rep Resources 2/Licenses, Certifications, & General Liability Ins/COI - General Liability.md`,
  type: 'md',
  category: 'Licenses & Certifications'
},
{
  name: 'COI - Workers Compensation 2026',
  path: `${DOCS_BASE}/Sales Rep Resources 2/Licenses, Certifications, & General Liability Ins/COI - workers comp 2026.md`,
  type: 'md',
  category: 'Licenses & Certifications'
},
{
  name: 'MD License',
  path: `${DOCS_BASE}/Sales Rep Resources 2/Licenses & Certifications/MD License.md`,
  type: 'md',
  category: 'Licenses & Certifications'
},
{
  name: 'VA Class A License',
  path: `${DOCS_BASE}/Sales Rep Resources 2/Licenses & Certifications/VA Class A License.md`,
  type: 'md',
  category: 'Licenses & Certifications'
},
{
  name: 'Roof-ER CertainTeed ShingleMaster',
  path: `${DOCS_BASE}/Sales Rep Resources 2/Licenses, Certifications, & General Liability Ins/Roof-ER CertainTeed ShingleMaster.md`,
  type: 'md',
  category: 'Licenses & Certifications'
},
{
  name: 'Certified Certificate',
  path: `${DOCS_BASE}/Sales Rep Resources 2/Licenses & Certifications/CERTIFIED_CERTIFICATE.md`,
  type: 'md',
  category: 'Licenses & Certifications'
},
{
  name: 'TAX ID Information',
  path: `${DOCS_BASE}/Sales Rep Resources 2/Licenses, Certifications, & General Liability Ins/TAX ID Information.md`,
  type: 'md',
  category: 'Licenses & Certifications'
},
```

---

## Step 3: Full knowledgeService.ts After Phase 1

**Complete updated `getDocumentIndex()` function:**

```typescript
async getDocumentIndex(): Promise<Document[]> {
  return [
    // ===== EXISTING CATEGORIES (47 docs) =====

    // Sales Scripts (7)
    { name: 'Initial Pitch Script', path: `${DOCS_BASE}/Sales Rep Resources 2/Sales Scripts /Initial Pitch Script.md`, type: 'md', category: 'Sales Scripts' },
    { name: 'Post Adjuster Meeting Script', path: `${DOCS_BASE}/Sales Rep Resources 2/Sales Scripts /Post Adjuster Meeting Script.md`, type: 'md', category: 'Sales Scripts' },
    { name: 'Contingency and Claim Authorization Script', path: `${DOCS_BASE}/Sales Rep Resources 2/Sales Scripts /Contingency and Claim Authorization Script.md`, type: 'md', category: 'Sales Scripts' },
    { name: 'Inspection and Post Inspection Script', path: `${DOCS_BASE}/Sales Rep Resources 2/Sales Scripts /Inspection and Post Inspection Script.md`, type: 'md', category: 'Sales Scripts' },
    { name: 'Full Approval Estimate Phone Call', path: `${DOCS_BASE}/Sales Rep Resources 2/Sales Scripts /Full Approval Estimate Phone Call.md`, type: 'md', category: 'Sales Scripts' },
    { name: 'Partial Estimate Phone Call', path: `${DOCS_BASE}/Sales Rep Resources 2/Sales Scripts /Partial Estimate Phone Call.md`, type: 'md', category: 'Sales Scripts' },
    { name: 'Claim Filing Information Sheet', path: `${DOCS_BASE}/Sales Rep Resources 2/Sales Scripts /Claim Filing Information Sheet.md`, type: 'md', category: 'Sales Scripts' },

    // Email Templates (11)
    { name: 'iTel Shingle Template', path: `${DOCS_BASE}/Sales Rep Resources 2/Email Templates/iTel Shingle Template.md`, type: 'md', category: 'Email Templates' },
    { name: 'Post AM Email Template', path: `${DOCS_BASE}/Sales Rep Resources 2/Email Templates/Post AM Email Template.md`, type: 'md', category: 'Email Templates' },
    { name: 'Request For Appraisal', path: `${DOCS_BASE}/Sales Rep Resources 2/Email Templates/Request For Appraisal.md`, type: 'md', category: 'Email Templates' },
    { name: 'Repair Attempt Template', path: `${DOCS_BASE}/Sales Rep Resources 2/Email Templates/Repair Attempt Template.md`, type: 'md', category: 'Email Templates' },
    { name: 'Photo Report Template', path: `${DOCS_BASE}/Sales Rep Resources 2/Email Templates/Photo Report Template.md`, type: 'md', category: 'Email Templates' },
    { name: 'Template from Customer to Insurance', path: `${DOCS_BASE}/Sales Rep Resources 2/Email Templates/Template from Customer to Insurance.md`, type: 'md', category: 'Email Templates' },
    { name: 'Estimate Request Template', path: `${DOCS_BASE}/Sales Rep Resources 2/Email Templates/Estimate Request Template.md`, type: 'md', category: 'Email Templates' },
    { name: 'Generic Partial Template', path: `${DOCS_BASE}/Sales Rep Resources 2/Email Templates/Generic Partial Template.md`, type: 'md', category: 'Email Templates' },
    { name: 'GAF Guidelines Template', path: `${DOCS_BASE}/Sales Rep Resources 2/Email Templates/GAF Guidelines Template.md`, type: 'md', category: 'Email Templates' },
    { name: 'Siding Argument', path: `${DOCS_BASE}/Sales Rep Resources 2/Email Templates/Siding Argument.md`, type: 'md', category: 'Email Templates' },
    { name: 'Danny_s Repair Attempt Video Template', path: `${DOCS_BASE}/Sales Rep Resources 2/Email Templates/Danny_s Repair Attempt Video Template.md`, type: 'md', category: 'Email Templates' },

    // Insurance Arguments (15)
    { name: 'GAF Storm Damage Guidelines', path: `${DOCS_BASE}/Sales Rep Resources 2/Insurance Argument Resources/GAF Storm Damage Guidelines .md`, type: 'md', category: 'Insurance Arguments' },
    { name: 'Maryland Insurance Administration Matching Requirement 1', path: `${DOCS_BASE}/Sales Rep Resources 2/Insurance Argument Resources/Maryland Insurance Administration Matching Requirement 1.md`, type: 'md', category: 'Insurance Arguments' },
    { name: 'Maryland Insurance Administration Matching Requirement 2', path: `${DOCS_BASE}/Sales Rep Resources 2/Insurance Argument Resources/Maryland Insurance Administration Matching Requirement 2.md`, type: 'md', category: 'Insurance Arguments' },
    { name: 'Maryland Insurance Administration Matching Requirement 3', path: `${DOCS_BASE}/Sales Rep Resources 2/Insurance Argument Resources/Maryland Insurance Administration Matching Requirement 3.md`, type: 'md', category: 'Insurance Arguments' },
    { name: 'Virginia Residential Building Codes', path: `${DOCS_BASE}/Sales Rep Resources 2/Insurance Argument Resources/Virginia Residential Building Codes.md`, type: 'md', category: 'Insurance Arguments' },
    { name: 'Virginia building codes Re-roofing Chapters', path: `${DOCS_BASE}/Sales Rep Resources 2/Insurance Argument Resources/Virginia building codes Re-roofing Chapters.md`, type: 'md', category: 'Insurance Arguments' },
    { name: 'Flashing Codes', path: `${DOCS_BASE}/Sales Rep Resources 2/Insurance Argument Resources/Flashing Codes.md`, type: 'md', category: 'Insurance Arguments' },
    { name: 'Discontinued-Shingle-List', path: `${DOCS_BASE}/Sales Rep Resources 2/Insurance Argument Resources/Discontinued-Shingle-List.md`, type: 'md', category: 'Insurance Arguments' },
    { name: 'GAF Requirement - Slope Replacement', path: `${DOCS_BASE}/Sales Rep Resources 2/Insurance Argument Resources/GAF Requirement - Slope Replacement.md`, type: 'md', category: 'Insurance Arguments' },
    { name: 'PHILLY PARTIALS', path: `${DOCS_BASE}/Sales Rep Resources 2/Insurance Argument Resources/PHILLY PARTIALS.md`, type: 'md', category: 'Insurance Arguments' },
    { name: 'Arbitration Information', path: `${DOCS_BASE}/Sales Rep Resources 2/Insurance Argument Resources/Arbitration Information.md`, type: 'md', category: 'Insurance Arguments' },
    { name: 'Complaint Forms', path: `${DOCS_BASE}/Sales Rep Resources 2/Insurance Argument Resources/Complaint Forms.md`, type: 'md', category: 'Insurance Arguments' },
    { name: 'Engineers', path: `${DOCS_BASE}/Sales Rep Resources 2/Insurance Argument Resources/Engineers.md`, type: 'md', category: 'Insurance Arguments' },
    { name: 'Low Roof_Flat Roof Code', path: `${DOCS_BASE}/Sales Rep Resources 2/Insurance Argument Resources/Low Roof_Flat Roof Code.md`, type: 'md', category: 'Insurance Arguments' },
    { name: 'Maryland Exterior Wrap Code R703', path: `${DOCS_BASE}/Sales Rep Resources 2/Insurance Argument Resources/Maryland Exterior Wrap Code R703.md`, type: 'md', category: 'Insurance Arguments' },

    // Training (2)
    { name: 'Training Manual', path: `${DOCS_BASE}/Sales Rep Resources 2/Training Manual.md`, type: 'md', category: 'Training' },
    { name: 'Roof-ER Sales Training', path: `${DOCS_BASE}/Sales Rep Resources 2/Roof-ER Sales Training.pptx.md`, type: 'md', category: 'Training' },

    // Agreements (9)
    { name: 'DMV Blank Contingency', path: `${DOCS_BASE}/Sales Rep Resources 2/DMV Blank Contingency.md`, type: 'md', category: 'Agreements & Contracts' },
    { name: 'PA Blank Contingency', path: `${DOCS_BASE}/Sales Rep Resources 2/PA Blank Contingency.md`, type: 'md', category: 'Agreements & Contracts' },
    { name: 'Repair Attempt Agreement', path: `${DOCS_BASE}/Sales Rep Resources 2/Agreements/Repair Attempt Agreement.md`, type: 'md', category: 'Agreements & Contracts' },
    { name: 'InsuranceAgrement_Updated', path: `${DOCS_BASE}/Sales Rep Resources 2/Agreements/InsuranceAgrement_Updated.md`, type: 'md', category: 'Agreements & Contracts' },
    { name: 'Emergency Tarp', path: `${DOCS_BASE}/Sales Rep Resources 2/Agreements/Emergency Tarp.md`, type: 'md', category: 'Agreements & Contracts' },
    { name: 'Claim Authorization Form', path: `${DOCS_BASE}/Sales Rep Resources 2/Agreements/Claim Authorization Form.md`, type: 'md', category: 'Agreements & Contracts' },
    { name: 'Project Agreement - Repair - MD', path: `${DOCS_BASE}/Sales Rep Resources 2/Agreements/Project Agreement - Repair - MD.md`, type: 'md', category: 'Agreements & Contracts' },
    { name: 'Project Agreement - Repair - VA', path: `${DOCS_BASE}/Sales Rep Resources 2/Agreements/Project Agreement - Repair - VA.md`, type: 'md', category: 'Agreements & Contracts' },
    { name: 'iTel Agreement', path: `${DOCS_BASE}/Sales Rep Resources 2/Agreements/iTel Agreement.md`, type: 'md', category: 'Agreements & Contracts' },

    // Quick Reference (2)
    { name: 'Roof-ER Quick Strike Guide', path: `${DOCS_BASE}/Sales Rep Resources 2/Roof-ER Quick Strike Guide.md`, type: 'md', category: 'Quick Reference' },
    { name: 'Roof-ER Quick Cheat Sheet', path: `${DOCS_BASE}/Sales Rep Resources 2/Roof-ER Quick Cheat Sheet.md`, type: 'md', category: 'Quick Reference' },

    // Procedures (1)
    { name: 'How to do a Repair Attempt [EXAMPLE]', path: `${DOCS_BASE}/Sales Rep Resources 2/How to do a Repair Attempt [EXAMPLE].md`, type: 'md', category: 'Procedures' },

    // ===== NEW CATEGORIES (26 docs) =====

    // Product Information & Warranties (13)
    { name: 'GAF Standard Warranty', path: `${DOCS_BASE}/Sales Rep Resources 2/Customer Resources(Products, Warranties, etc.)/GAF Standard Warranty.md`, type: 'md', category: 'Product Information & Warranties' },
    { name: 'GAF Timberline HDZ Presentation', path: `${DOCS_BASE}/Sales Rep Resources 2/Customer Resources(Products, Warranties, etc.)/GAF Timberline HDZ Presentation.md`, type: 'md', category: 'Product Information & Warranties' },
    { name: 'GAF Warranty Comparison', path: `${DOCS_BASE}/Sales Rep Resources 2/Customer Resources(Products, Warranties, etc.)/GAF Warranty Comparison.md`, type: 'md', category: 'Product Information & Warranties' },
    { name: 'Golden Pledge Limited Warranty Legal Sample', path: `${DOCS_BASE}/Sales Rep Resources 2/Customer Resources(Products, Warranties, etc.)/Golden_Pledge_Limited_RESWT161_Legal_Sample.md`, type: 'md', category: 'Product Information & Warranties' },
    { name: 'Silver Pledge Legalese', path: `${DOCS_BASE}/Sales Rep Resources 2/Customer Resources(Products, Warranties, etc.)/Silver Pledge Legalese.md`, type: 'md', category: 'Product Information & Warranties' },
    { name: 'Silver Pledge Warranty Brochure', path: `${DOCS_BASE}/Sales Rep Resources 2/Customer Resources(Products, Warranties, etc.)/Silver Pledge Warranty Brochure.md`, type: 'md', category: 'Product Information & Warranties' },
    { name: 'Warranty Comparison Presentation', path: `${DOCS_BASE}/Sales Rep Resources 2/Customer Resources(Products, Warranties, etc.)/Warranty Comparison Prsentation.md`, type: 'md', category: 'Product Information & Warranties' },
    { name: 'Workmanship Warranty', path: `${DOCS_BASE}/Sales Rep Resources 2/Customer Resources(Products, Warranties, etc.)/Workmanship Warranty.md`, type: 'md', category: 'Product Information & Warranties' },
    { name: 'What is a Deductible', path: `${DOCS_BASE}/Sales Rep Resources 2/Customer Resources(Products, Warranties, etc.)/What is a Deductible_.md`, type: 'md', category: 'Product Information & Warranties' },
    { name: 'RoofER Standard Materials', path: `${DOCS_BASE}/Sales Rep Resources 2/Customer Resources(Products, Warranties, etc.)/RoofER Standard Materials.md`, type: 'md', category: 'Product Information & Warranties' },
    { name: 'Roof-ER Company Overview', path: `${DOCS_BASE}/Sales Rep Resources 2/Customer Resources(Products, Warranties, etc.)/Roof-ER.md`, type: 'md', category: 'Product Information & Warranties' },
    { name: 'SP Exclusion Form', path: `${DOCS_BASE}/Sales Rep Resources 2/Customer Resources(Products, Warranties, etc.)/SP Exclusion Form.md`, type: 'md', category: 'Product Information & Warranties' },
    { name: 'Post Sign Up Timeline', path: `${DOCS_BASE}/Sales Rep Resources 2/Customer Resources(Products, Warranties, etc.)/Post Sign Up Timeline.md`, type: 'md', category: 'Product Information & Warranties' },

    // Licenses & Certifications (13)
    { name: 'GAF Master Elite 2025', path: `${DOCS_BASE}/Sales Rep Resources 2/Licenses, Certifications, & General Liability Ins/GAF Master Elite 2025.md`, type: 'md', category: 'Licenses & Certifications' },
    { name: 'Master Elite Reference Letter for Customers', path: `${DOCS_BASE}/Sales Rep Resources 2/Licenses, Certifications, & General Liability Ins/Master Elite Reference Letter for Customers.md`, type: 'md', category: 'Licenses & Certifications' },
    { name: 'Maryland License Valid through 2027', path: `${DOCS_BASE}/Sales Rep Resources 2/Licenses, Certifications, & General Liability Ins/Maryland License Valid through 2027.md`, type: 'md', category: 'Licenses & Certifications' },
    { name: 'Pennsylvania License Valid Through 2027', path: `${DOCS_BASE}/Sales Rep Resources 2/Licenses, Certifications, & General Liability Ins/Pennsylvania License Valid Through 2027.md`, type: 'md', category: 'Licenses & Certifications' },
    { name: 'PA License 2025 - 2027', path: `${DOCS_BASE}/Sales Rep Resources 2/Licenses, Certifications, & General Liability Ins/PA license 2025 - 2027.md`, type: 'md', category: 'Licenses & Certifications' },
    { name: 'VA License 2025 - 2027', path: `${DOCS_BASE}/Sales Rep Resources 2/Licenses, Certifications, & General Liability Ins/VA License 2025 - 2027.md`, type: 'md', category: 'Licenses & Certifications' },
    { name: 'COI - General Liability', path: `${DOCS_BASE}/Sales Rep Resources 2/Licenses, Certifications, & General Liability Ins/COI - General Liability.md`, type: 'md', category: 'Licenses & Certifications' },
    { name: 'COI - Workers Compensation 2026', path: `${DOCS_BASE}/Sales Rep Resources 2/Licenses, Certifications, & General Liability Ins/COI - workers comp 2026.md`, type: 'md', category: 'Licenses & Certifications' },
    { name: 'MD License', path: `${DOCS_BASE}/Sales Rep Resources 2/Licenses & Certifications/MD License.md`, type: 'md', category: 'Licenses & Certifications' },
    { name: 'VA Class A License', path: `${DOCS_BASE}/Sales Rep Resources 2/Licenses & Certifications/VA Class A License.md`, type: 'md', category: 'Licenses & Certifications' },
    { name: 'Roof-ER CertainTeed ShingleMaster', path: `${DOCS_BASE}/Sales Rep Resources 2/Licenses, Certifications, & General Liability Ins/Roof-ER CertainTeed ShingleMaster.md`, type: 'md', category: 'Licenses & Certifications' },
    { name: 'Certified Certificate', path: `${DOCS_BASE}/Sales Rep Resources 2/Licenses & Certifications/CERTIFIED_CERTIFICATE.md`, type: 'md', category: 'Licenses & Certifications' },
    { name: 'TAX ID Information', path: `${DOCS_BASE}/Sales Rep Resources 2/Licenses, Certifications, & General Liability Ins/TAX ID Information.md`, type: 'md', category: 'Licenses & Certifications' },
  ];
}
```

---

## Step 4: Test the Implementation

**Test script:**

```typescript
// Test 1: Verify document count
const docs = await knowledgeService.getDocumentIndex();
console.log('Total documents:', docs.length);
// Expected: 73

// Test 2: Verify categories
const categories = await knowledgeService.getCategories();
console.log('Categories:', categories);
// Expected: 9 categories including new ones

// Test 3: Search warranties
const warrantyResults = await knowledgeService.searchDocuments('warranty', 10);
console.log('Warranty search results:', warrantyResults.length);
// Expected: 5-10 results

// Test 4: Search licenses
const licenseResults = await knowledgeService.searchDocuments('license', 10);
console.log('License search results:', licenseResults.length);
// Expected: 5-10 results

// Test 5: Load specific document
const gafWarranty = await knowledgeService.loadDocument(
  '/docs/Sales Rep Resources 2/Customer Resources(Products, Warranties, etc.)/GAF Standard Warranty.md'
);
console.log('GAF Warranty loaded:', gafWarranty.content.length > 0);
// Expected: true
```

---

## Step 5: Cleanup Commands

**Delete failed OCR files:**

```bash
cd /Users/a21/Desktop/S21-A24/gemini-field-assistant/public/docs

rm "DMV Blank Contingency_ocr.json"
rm "PA Blank Contingency_ocr.json"
rm "RoofER_Top10_CheatSheet_Fixed_ocr.json"
rm "RESIDENTIAL_BRAND_GUIDELINES_ocr.json"
rm "RoofER_Master_Documents_ocr.json"
rm "RoofER_Master_Documents_Updated_ocr.json"
```

**Remove duplicate Questions folder:**

```bash
rm -rf "/Users/a21/Desktop/S21-A24/gemini-field-assistant/public/docs/Sales Rep Resources 2/Questions"
```

**Remove duplicate extracted_content folder:**

```bash
rm -rf /Users/a21/Desktop/S21-A24/gemini-field-assistant/public/extracted_content
```

---

## Expected Results After Phase 1

```
✅ Document count: 73 (up from 47)
✅ Category count: 9 (up from 7)
✅ Path standardized: /docs
✅ No failed OCR files
✅ No duplicate folders
✅ Warranty searches work
✅ License searches work
✅ All tests passing
```

---

## Rollback (if needed)

If something goes wrong:

```bash
# Restore from git
git checkout services/knowledgeService.ts

# OR restore from backup
cp services/knowledgeService.ts.backup services/knowledgeService.ts
```

---

**Time Estimate:** 2-4 hours
**Difficulty:** Easy (copy-paste with path verification)
**Risk:** Low (easily reversible)

---

**Next:** After Phase 1 is complete and tested, proceed to Phase 2 to add remaining 30 documents.
