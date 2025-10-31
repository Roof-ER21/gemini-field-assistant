export interface Document {
  name: string;
  path: string;
  type: 'pdf' | 'pptx' | 'docx' | 'md';
  category?: string;
}

export interface DocumentContent {
  name: string;
  content: string;
  metadata?: {
    pages?: number;
    slides?: number;
    lastModified?: Date;
  };
}

export interface SearchResult {
  document: Document;
  relevance: number;
  snippet: string;
  content?: string;
}

// Documents are in /docs in the public folder
const DOCS_BASE = '/docs';

export const knowledgeService = {
  // Get list of all 86 key documents (70% of 123 total) - Phase 1 & 2A Complete
  // Categories: Sales Scripts (7), Email Templates (11), Insurance Arguments (15),
  // Training (2), Agreements (9), Quick Reference (2), Procedures (1),
  // Product Information & Warranties (13), Licenses & Certifications (13),
  // Photo Reports & Examples (5), Q&A Resources (8)
  async getDocumentIndex(): Promise<Document[]> {
    return [
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

      // Photo Reports & Examples (5)
      { name: 'Example Photos Guide', path: `${DOCS_BASE}/Sales Rep Resources 2/Rep Reports & Photo Examples/EXAMPLE PHOTOS.md`, type: 'md', category: 'Photo Reports & Examples' },
      { name: 'Sample Photo Report 1', path: `${DOCS_BASE}/Sales Rep Resources 2/Rep Reports & Photo Examples/Sample Photo Report 1.md`, type: 'md', category: 'Photo Reports & Examples' },
      { name: 'Sample Photo Report 2', path: `${DOCS_BASE}/Sales Rep Resources 2/Rep Reports & Photo Examples/Sample Photo Report 2.md`, type: 'md', category: 'Photo Reports & Examples' },
      { name: 'Sample Photo Report 3', path: `${DOCS_BASE}/Sales Rep Resources 2/Rep Reports & Photo Examples/Sample Photo Report 3.md`, type: 'md', category: 'Photo Reports & Examples' },
      { name: 'Sample Photo Report 4', path: `${DOCS_BASE}/Sales Rep Resources 2/Rep Reports & Photo Examples/Sample Photo Report 4.md`, type: 'md', category: 'Photo Reports & Examples' },

      // Q&A Resources (8)
      { name: 'Escalation Procedures Q&A', path: `${DOCS_BASE}/Sales Rep Resources 2/Q&A Susan AI-21/Escal.md`, type: 'md', category: 'Q&A Resources' },
      { name: 'GAF Storm Damage Q&A', path: `${DOCS_BASE}/Sales Rep Resources 2/Q&A Susan AI-21/GAF_Storm.md`, type: 'md', category: 'Q&A Resources' },
      { name: 'Knowledge Base Q&A', path: `${DOCS_BASE}/Sales Rep Resources 2/Q&A Susan AI-21/Knowledge.md`, type: 'md', category: 'Q&A Resources' },
      { name: 'Pushback Handling Q&A', path: `${DOCS_BASE}/Sales Rep Resources 2/Q&A Susan AI-21/Pushback.md`, type: 'md', category: 'Q&A Resources' },
      { name: 'When Stuck - What to Do Q&A', path: `${DOCS_BASE}/Sales Rep Resources 2/Q&A Susan AI-21/Stuck_do.md`, type: 'md', category: 'Q&A Resources' },
      { name: 'Susan AI Training Q&A', path: `${DOCS_BASE}/Sales Rep Resources 2/Q&A Susan AI-21/susan_ai.md`, type: 'md', category: 'Q&A Resources' },
      { name: 'Training Resources Q&A', path: `${DOCS_BASE}/Sales Rep Resources 2/Q&A Susan AI-21/Training.md`, type: 'md', category: 'Q&A Resources' },
      { name: 'Document Templates Q&A', path: `${DOCS_BASE}/Sales Rep Resources 2/Q&A Susan AI-21/docs_temps.md`, type: 'md', category: 'Q&A Resources' }
    ];
  },

  // Load document content
  async loadDocument(path: string): Promise<DocumentContent> {
    try {
      const name = path.split('/').pop()?.replace('.md', '') || 'Unknown';
      const response = await fetch(path);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const content = await response.text();

      return { name, content, metadata: { lastModified: new Date() } };
    } catch (error) {
      console.error(`Error loading document ${path}:`, error);
      throw error;
    }
  },

  // Search documents with content loading
  async searchDocuments(query: string, limit: number = 5): Promise<SearchResult[]> {
    const queryLower = query.toLowerCase();
    const documents = await this.getDocumentIndex();

    // Extract keywords
    const keywords = queryLower
      .split(/\s+/)
      .filter(w => w.length > 2)
      .map(w => w.replace(/[^a-z0-9]/g, ''));

    const results: SearchResult[] = [];

    for (const doc of documents) {
      const nameLower = doc.name.toLowerCase();
      const categoryLower = (doc.category || '').toLowerCase();
      let relevance = 0;

      // Exact matches
      if (nameLower === queryLower) relevance += 5.0;
      if (categoryLower === queryLower) relevance += 3.0;

      // Partial matches
      if (nameLower.includes(queryLower)) relevance += 2.0;
      if (categoryLower.includes(queryLower)) relevance += 1.5;

      // Keyword matching
      keywords.forEach(kw => {
        if (kw.length > 2) {
          if (nameLower.includes(kw)) relevance += 0.8;
          if (categoryLower.includes(kw)) relevance += 0.5;
        }
      });

      // Boost important categories
      const boosts: Record<string, string[]> = {
        'script': ['script', 'pitch', 'initial', 'meeting'],
        'email': ['email', 'template', 'send'],
        'insurance': ['insurance', 'claim', 'argument', 'adjuster'],
        'training': ['training', 'learn', 'how', 'manual'],
        'agreement': ['agreement', 'contract', 'sign']
      };

      Object.entries(boosts).forEach(([cat, terms]) => {
        if (keywords.some(kw => terms.includes(kw))) {
          if (categoryLower.includes(cat) || nameLower.includes(cat)) {
            relevance += 2.0;
          }
        }
      });

      if (relevance > 0) {
        results.push({
          document: doc,
          relevance,
          snippet: `${doc.name} - ${doc.category || 'General'}`
        });
      }
    }

    // Sort and limit
    const topResults = results
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);

    // Load content for top results
    for (const result of topResults) {
      try {
        const docContent = await this.loadDocument(result.document.path);
        result.content = docContent.content;
      } catch (error) {
        console.warn(`Could not load ${result.document.name}:`, error);
        result.content = `[Content unavailable for ${result.document.name}]`;
      }
    }

    return topResults;
  },

  // Get documents by category
  async getDocumentsByCategory(category: string): Promise<Document[]> {
    const allDocs = await this.getDocumentIndex();
    return allDocs.filter(doc => doc.category === category);
  },

  // Get all categories
  async getCategories(): Promise<string[]> {
    const allDocs = await this.getDocumentIndex();
    const categories = new Set(allDocs.map(doc => doc.category).filter(Boolean) as string[]);
    return Array.from(categories).sort();
  }
};
