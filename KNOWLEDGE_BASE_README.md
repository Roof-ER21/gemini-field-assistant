# S21 Field Assistant - Knowledge Base Documentation

## 🌟 Overview

The S21 Field Assistant now includes a comprehensive Knowledge Base powered by **DeepSeek-OCR**, featuring extracted content from roofing sales training materials, brand guidelines, and operational procedures.

## 📚 What's Inside

### Extracted Documents (10+ Resources)

#### 🎨 Brand & Guidelines
- **RESIDENTIAL_BRAND_GUIDELINES** - 4 pages of brand colors, logos, and usage guidelines

#### 📖 Training Materials
- **Roof-ER Sales Training** - Complete 95-slide training presentation
- **Training Manual** - Comprehensive training documentation
- **Mission, Values & Commitment** - Company culture and values

#### 💼 Sales Resources
- **RoofER Top 10 Cheat Sheet** - Quick reference guide for key selling points
- **Quick Strike Guide** - Fast sales tactics and approaches
- **Sales Operations and Tasks** - Daily operations guide

#### 📋 Procedures & Reference
- **How to do a Repair Attempt** - Step-by-step repair procedures
- **Adjuster/Inspector Information Sheet** - Insurance adjuster details
- **RoofER Master Documents** - 223-page comprehensive reference
- **Required Mortgage Endorsement Companies** - Financial partner information

### Document Categories

All documents are organized by category:
- **Branding** - Visual identity and brand guidelines
- **Training** - Sales training and onboarding
- **Sales Tactics** - Techniques and approaches
- **Operations** - Daily tasks and procedures
- **Insurance** - Adjuster and claims information
- **Quick Reference** - Cheat sheets and guides
- **Company Culture** - Mission and values
- **Reference** - Comprehensive documentation

## 🔍 How to Use

### 1. Accessing the Knowledge Base

1. Open the Field Assistant app
2. Click **"Knowledge Base"** in the left sidebar (📚 icon)
3. You'll see:
   - Search bar at top
   - Category filter in left panel
   - Document list in left panel
   - Content viewer on right

### 2. Browsing Documents

**By Category:**
- Use the dropdown filter to select a category
- View only documents in that category

**By Document:**
- Scroll through the document list
- Click any document to view its content
- Selected document is highlighted in red

### 3. Searching Content

**Basic Search:**
```
Type query → Press Enter or click 🔍 Search
```

**Search Tips:**
- Use keywords: "sales", "training", "insurance", "brand", "repair"
- Search is case-insensitive
- Results show relevance percentage
- Click any result to open the full document

**Example Searches:**
- `sales tactics` - Find sales approach documents
- `brand colors` - Find brand guideline information
- `insurance adjuster` - Find adjuster procedures
- `repair attempt` - Find repair documentation
- `training` - Find all training materials

### 4. Reading Documents

- Documents display in markdown format
- Full content is searchable
- Category badge shows at top
- Scroll to read entire document

## 🤖 DeepSeek-OCR Technology

### What is DeepSeek-OCR?

DeepSeek-OCR is a cutting-edge 3B parameter vision-language model that:
- Extracts text from PDFs, PowerPoints, and Word docs
- Compresses text 10x using visual tokens
- Maintains 97% accuracy
- Processes 200,000 pages/day on GPU

### Extraction Process

All documents were extracted using this workflow:

```bash
# 1. Install DeepSeek-OCR
cd /Users/a21/Desktop/DeepSeek-OCR
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 2. Run extraction script
python simple_extract.py

# 3. Content saved to
/Users/a21/Desktop/extracted_content/
```

### Extraction Statistics

- **Total Documents Processed**: 62 PDFs + 57 DOCX files
- **Content Extracted**:
  - RESIDENTIAL_BRAND_GUIDELINES: 4 pages, 12,526 characters
  - Roof-ER Sales Training: 95 slides, ~30,000 characters
  - RoofER Master Documents: 223 pages, ~180,000 characters
  - Additional resources: 10+ documents

### Quality Assessment

✅ **High Quality Extraction:**
- Brand guidelines: Perfect text extraction
- PowerPoint slides: Complete content capture
- Training manuals: Full procedure documentation
- Reference materials: Comprehensive coverage

## 🛠️ Technical Details

### File Locations

```bash
# Application
/Users/a21/Desktop/gemini-field-assistant/

# Extracted Content
/Users/a21/Desktop/extracted_content/
├── RESIDENTIAL_BRAND_GUIDELINES.md
├── Roof-ER Sales Training (1).md
├── INDEX.md
└── Sales Rep Resources 2/
    ├── RoofER_Top10_CheatSheet_Fixed.md
    ├── Training Manual.md
    ├── Quick Strike Guide.md
    └── [more documents...]

# Source Documents
/Users/a21/Desktop/Sales Rep Resources 2/

# OCR Tool
/Users/a21/Desktop/DeepSeek-OCR/
```

### Knowledge Service API

The `knowledgeService.ts` provides:

```typescript
// Get all documents
await knowledgeService.getDocumentIndex()

// Load specific document
await knowledgeService.loadDocument(path)

// Search documents
await knowledgeService.searchDocuments(query, documents)

// Get by category
await knowledgeService.getDocumentsByCategory(category)

// Get all categories
await knowledgeService.getCategories()
```

### Document Schema

```typescript
interface Document {
  name: string;        // Display name
  path: string;        // File path
  type: 'pdf' | 'pptx' | 'docx' | 'md';
  category?: string;   // Organizational category
}
```

## 📊 Document Index

| Document | Type | Pages/Slides | Category | Size |
|----------|------|--------------|----------|------|
| Brand Guidelines | PDF | 4 pages | Branding | ~13KB |
| Sales Training | PPTX | 95 slides | Training | ~30KB |
| Top 10 Cheat Sheet | PDF | 1 page | Quick Reference | ~1.4KB |
| Training Manual | DOCX | Multiple | Training | ~15KB |
| Quick Strike Guide | DOCX | Multiple | Sales Tactics | ~8KB |
| Repair Attempt Guide | DOCX | Multiple | Procedures | ~12KB |
| Master Documents | PDF | 223 pages | Reference | ~180KB |
| Adjuster Info Sheet | PDF | 1 page | Insurance | ~19KB |
| Sales Operations | DOCX | Multiple | Operations | ~10KB |
| Mission & Values | DOCX | Multiple | Company Culture | ~5KB |

## 🚀 Adding New Documents

### Process for Adding Documents

1. **Place source document** in the extraction folder:
   ```bash
   cp "New Sales Guide.pdf" "/Users/a21/Desktop/Sales Rep Resources 2/"
   ```

2. **Run extraction**:
   ```bash
   cd /Users/a21/Desktop/DeepSeek-OCR
   source venv/bin/activate
   python simple_extract.py
   ```

3. **Update knowledge service**:
   Edit `services/knowledgeService.ts` and add to `getDocumentIndex()`:
   ```typescript
   {
     name: 'New Sales Guide',
     path: `${EXTRACTED_CONTENT_PATH}/New Sales Guide.md`,
     type: 'pdf',
     category: 'Sales Tactics'
   }
   ```

4. **Restart the app** to see new document

### Supported File Types

- ✅ **PDF** - Text extraction with PyMuPDF
- ✅ **PPTX** - Slide content with python-pptx
- ✅ **DOCX** - Full text with python-docx
- ✅ **Markdown** - Direct display
- ⏳ **Images** - Coming soon with OCR
- ⏳ **Excel** - Coming soon

## 💡 Use Cases

### For Sales Reps
- **Quick Reference**: Search "top 10" for instant cheat sheet
- **Training**: Review sales training slides before calls
- **Procedures**: Follow repair attempt procedures step-by-step
- **Branding**: Check brand guidelines before creating materials

### For Managers
- **Onboarding**: Share training materials with new reps
- **Quality**: Ensure reps follow documented procedures
- **Resources**: Centralized knowledge repository
- **Updates**: Easy to add new materials

### For Operations
- **Documentation**: Single source of truth
- **Procedures**: Standardized operational guides
- **Insurance**: Adjuster information at fingertips
- **Compliance**: Mortgage endorsement requirements

## 🔮 Future Enhancements

### Planned Features

1. **Vector Search**
   - Semantic search using embeddings
   - "Find similar content" functionality
   - AI-powered recommendations

2. **Document Viewer Enhancements**
   - PDF rendering (not just text)
   - Image viewing
   - Table formatting
   - Syntax highlighting

3. **Collaboration**
   - Document annotations
   - Bookmarks and highlights
   - Share snippets with team
   - Comments and notes

4. **Advanced Search**
   - Filters by date, author, type
   - Boolean operators (AND, OR, NOT)
   - Regular expression support
   - Search history

5. **Analytics**
   - Most viewed documents
   - Search trends
   - Content gaps
   - Usage statistics

6. **Offline Mode**
   - Cached documents
   - Sync when online
   - Download for offline use

## 🐛 Troubleshooting

### Documents Not Loading

**Problem**: Documents show "Error loading document"

**Solution**:
1. Check file path in `knowledgeService.ts`
2. Verify file exists in `/Users/a21/Desktop/extracted_content/`
3. Check file permissions
4. Review browser console for errors

### Search Not Working

**Problem**: Search returns no results

**Solution**:
1. Ensure documents are loaded (check document list)
2. Try simpler search terms
3. Check spelling
4. Try different category filter

### Poor Search Results

**Problem**: Irrelevant results

**Solution**:
- Use more specific keywords
- Filter by category first
- Try exact phrases
- Browse documents manually

## 📞 Support

For issues or questions:
1. Check this documentation
2. Review browser console for errors
3. Check file paths and permissions
4. Re-run extraction if needed

## 📝 Quick Reference Commands

```bash
# View extracted content
ls -la /Users/a21/Desktop/extracted_content

# Run extraction
cd /Users/a21/Desktop/DeepSeek-OCR && source venv/bin/activate && python simple_extract.py

# View specific document
cat /Users/a21/Desktop/extracted_content/RESIDENTIAL_BRAND_GUIDELINES.md

# Search in terminal
grep -r "search term" /Users/a21/Desktop/extracted_content/

# Count documents
find /Users/a21/Desktop/extracted_content -name "*.md" | wc -l

# Check extraction stats
wc -l /Users/a21/Desktop/extracted_content/**/*.md
```

---

**Powered by DeepSeek-OCR | Built for S21 Sales Teams**

Last Updated: 2025-10-26
