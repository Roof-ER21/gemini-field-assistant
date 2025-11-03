import { documentBatchLoader } from './batchDocumentLoader';

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
  score: number; // Alias for relevance to match Message.sources type
  snippet: string;
  content?: string;
}

// Documents are in /docs in the public folder
const DOCS_BASE = '/docs';

export const knowledgeService = {
  // Get list of all 117 key documents (95% of 123 total) - Phase 1, 2A, 3, & Final Complete + Objections
  // Categories: Sales Scripts (9), Email Templates (11), Insurance Arguments (15),
  // Training (5), Objection Handling (3), Agreements (9), Quick Reference (11), Procedures & Operations (5),
  // Product Information & Warranties (13), Licenses & Certifications (16),
  // Photo Reports & Examples (5), Q&A Resources (8), Tools & Utilities (6)
  // Remaining 6 docs: 6 Merged PDFs (review needed)
  async getDocumentIndex(): Promise<Document[]> {
    const baseDocs: Document[] = [
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
      { name: 'PA Permit Denial - Siding Replacement', path: `${DOCS_BASE}/Sales Rep Resources 2/Email Templates/PA Permit Denial - Siding Replacement.md`, type: 'md', category: 'Email Templates' },
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
      { name: 'PA Partials', path: `${DOCS_BASE}/Sales Rep Resources 2/Insurance Argument Resources/PA Partials.md`, type: 'md', category: 'Insurance Arguments' },
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

      // Objection Handling (3) - NEW
      { name: 'Price & Cost Objections', path: `${DOCS_BASE}/objections/price-objections.md`, type: 'md', category: 'Objection Handling' },
      { name: 'Timing & Decision Objections', path: `${DOCS_BASE}/objections/timing-objections.md`, type: 'md', category: 'Objection Handling' },
      { name: 'Trust & Credibility Objections', path: `${DOCS_BASE}/objections/trust-objections.md`, type: 'md', category: 'Objection Handling' },

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
      { name: 'Document Templates Q&A', path: `${DOCS_BASE}/Sales Rep Resources 2/Q&A Susan AI-21/docs_temps.md`, type: 'md', category: 'Q&A Resources' },

      // Procedures & Operations (4)
      { name: 'Sales Operations and Tasks', path: `${DOCS_BASE}/Sales Rep Resources 2/Sales Operations and Tasks.md`, type: 'md', category: 'Procedures & Operations' },
      { name: 'Mission, Values, & Commitment', path: `${DOCS_BASE}/Sales Rep Resources 2/Mission, Values, & Commitment.md`, type: 'md', category: 'Procedures & Operations' },
      { name: 'Hover ESX_XML_PDF Process', path: `${DOCS_BASE}/Sales Rep Resources 2/Hover ESX_XML_PDF Process.md`, type: 'md', category: 'Procedures & Operations' },
      { name: 'Adjuster_Inspector Information Sheet', path: `${DOCS_BASE}/Sales Rep Resources 2/Adjuster_Inspector Information Sheet1.md`, type: 'md', category: 'Procedures & Operations' },

      // Additional Reference Materials (6)
      { name: 'RoofER Top 10 Cheat Sheet', path: `${DOCS_BASE}/Sales Rep Resources 2/RoofER_Top10_CheatSheet_Fixed.md`, type: 'md', category: 'Quick Reference' },
      { name: 'RoofER Master Documents', path: `${DOCS_BASE}/Sales Rep Resources 2/RoofER_Master_Documents.md`, type: 'md', category: 'Quick Reference' },
      { name: 'RoofER Master Documents Updated', path: `${DOCS_BASE}/Sales Rep Resources 2/RoofER_Master_Documents_Updated.md`, type: 'md', category: 'Quick Reference' },
      { name: 'Roof-ER Roof & Siding Claim Response Packet', path: `${DOCS_BASE}/Sales Rep Resources 2/Roof-ER Roof & Siding Claim Response Packet.md`, type: 'md', category: 'Quick Reference' },
      { name: 'Roof-ER Siding Claim Response Packet', path: `${DOCS_BASE}/Sales Rep Resources 2/Roof-ER Siding Claim Response Packet.md`, type: 'md', category: 'Quick Reference' },
      { name: 'Required Mortgage Endorsement Companies', path: `${DOCS_BASE}/Sales Rep Resources 2/Required Mortgage Endorsement Companies.md`, type: 'md', category: 'Quick Reference' },

      // Additional Training Materials (3)
      { name: 'Brochure', path: `${DOCS_BASE}/Sales Rep Resources 2/Brochure.md`, type: 'md', category: 'Training' },
      { name: 'RESIDENTIAL BRAND GUIDELINES', path: `${DOCS_BASE}/RESIDENTIAL_BRAND_GUIDELINES.md`, type: 'md', category: 'Training' },
      { name: 'Roof-ER Sales Training Full', path: `${DOCS_BASE}/Roof-ER Sales Training (1).md`, type: 'md', category: 'Training' },

      // Additional Scripts & Processes (2)
      { name: 'Adjuster Meeting Outcome Script', path: `${DOCS_BASE}/Sales Rep Resources 2/images samp/Pitches/Adjuster Meeting Outcome Script.md`, type: 'md', category: 'Sales Scripts' },
      { name: 'AM Outcome Process', path: `${DOCS_BASE}/Sales Rep Resources 2/images samp/Process/AM Outcome Process.md`, type: 'md', category: 'Procedures & Operations' },

      // Tools & Utilities (3)
      { name: 'Email Generator Guide', path: `${DOCS_BASE}/Sales Rep Resources 2/📧 Email Generator .md`, type: 'md', category: 'Tools & Utilities' },
      { name: 'Role+ Information', path: `${DOCS_BASE}/Sales Rep Resources 2/Role+.md`, type: 'md', category: 'Tools & Utilities' },
      { name: 'Untitled Document', path: `${DOCS_BASE}/Sales Rep Resources 2/Untitled document.md`, type: 'md', category: 'Tools & Utilities' },

      // Additional Quick Reference (3)
      { name: 'Roof-ER Quick Cheat Sheet', path: `${DOCS_BASE}/Sales Rep Resources 2/Roof-ER Quick Cheat Sheet.md`, type: 'md', category: 'Quick Reference' },
      { name: 'Roof-ER Quick Strike Guide', path: `${DOCS_BASE}/Sales Rep Resources 2/Roof-ER Quick Strike Guide.md`, type: 'md', category: 'Quick Reference' },
      { name: 'Document Index', path: `${DOCS_BASE}/INDEX.md`, type: 'md', category: 'Quick Reference' },

      // Additional Licenses & Certifications (3)
      { name: 'CertainTeed Certified Certificate', path: `${DOCS_BASE}/Sales Rep Resources 2/Licenses & Certifications/CERTIFIED_CERTIFICATE.md`, type: 'md', category: 'Licenses & Certifications' },
      { name: 'Maryland Contractor License', path: `${DOCS_BASE}/Sales Rep Resources 2/Licenses & Certifications/MD License.md`, type: 'md', category: 'Licenses & Certifications' },
      { name: 'Virginia Class A License', path: `${DOCS_BASE}/Sales Rep Resources 2/Licenses & Certifications/VA Class A License.md`, type: 'md', category: 'Licenses & Certifications' },

      // State-Specific Resources (CRITICAL)
      { name: 'State-Specific Matching Requirements', path: `${DOCS_BASE}/State-Specific-Matching-Requirements.md`, type: 'md', category: 'State-Specific Codes' },
      { name: 'Virginia Roofing Law Overview', path: `${DOCS_BASE}/State-Law-Overviews/Virginia-Roofing-Law-Overview.md`, type: 'md', category: 'State-Specific Codes' },
      { name: 'Maryland Roofing Law Overview', path: `${DOCS_BASE}/State-Law-Overviews/Maryland-Roofing-Law-Overview.md`, type: 'md', category: 'State-Specific Codes' },
      { name: 'Pennsylvania Roofing Law Overview', path: `${DOCS_BASE}/State-Law-Overviews/Pennsylvania-Roofing-Law-Overview.md`, type: 'md', category: 'State-Specific Codes' }
    ];

    // Append user-uploaded documents from localStorage (if any)
    try {
      const raw = localStorage.getItem('user_uploads') || '[]';
      const uploads = JSON.parse(raw);
      const uploadDocs: Document[] = uploads.map((u: any) => ({
        name: u.name || 'User Upload',
        path: u.path || `local:uploads/${u.id}`,
        type: 'md',
        category: 'User Uploads'
      }));
      return [...uploadDocs, ...baseDocs];
    } catch {
      return baseDocs;
    }
  },

  // Load document content
  async loadDocument(path: string): Promise<DocumentContent> {
    try {
      // Local user uploads
      if (path.startsWith('local:uploads/')) {
        const raw = localStorage.getItem('user_uploads') || '[]';
        const uploads = JSON.parse(raw);
        const id = path.split('/').pop();
        const doc = uploads.find((u: any) => u.id === id || u.path === path);
        if (doc) {
          return { name: doc.name, content: doc.content || '', metadata: { lastModified: new Date() } };
        }
        throw new Error('Local upload not found');
      }

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

  // Enhanced search with content-based matching and state-awareness
  async searchDocuments(query: string, limit: number = 5, selectedState?: string): Promise<SearchResult[]> {
    const queryLower = query.toLowerCase();
    const documents = await this.getDocumentIndex();

    // Extract keywords and clean them
    const keywords = queryLower
      .split(/\s+/)
      .filter(w => w.length > 2)
      .map(w => w.replace(/[^a-z0-9]/g, ''));

    // Detect state mentions in query
    const stateKeywords = {
      'VA': ['virginia', 'va'],
      'MD': ['maryland', 'md'],
      'PA': ['pennsylvania', 'pa', 'philly', 'philadelphia']
    };

    const detectedStates: string[] = [];
    Object.entries(stateKeywords).forEach(([state, stateWords]) => {
      if (stateWords.some(sw => queryLower.includes(sw))) {
        detectedStates.push(state);
      }
    });

    // Use selected state if provided, otherwise use detected states
    const relevantStates = selectedState ? [selectedState] : detectedStates;

    const results: SearchResult[] = [];

    for (const doc of documents) {
      const nameLower = doc.name.toLowerCase();
      const categoryLower = (doc.category || '').toLowerCase();
      let relevance = 0;

      // CRITICAL: State-specific documents get massive boost
      if (doc.category === 'State-Specific Codes' && relevantStates.length > 0) {
        relevance += 10.0;
      }

      // State mentions in document name
      relevantStates.forEach(state => {
        const stateLower = state.toLowerCase();
        if (nameLower.includes(stateLower) || categoryLower.includes(stateLower)) {
          relevance += 5.0;
        }
      });

      // Exact matches
      if (nameLower === queryLower) relevance += 8.0;
      if (categoryLower === queryLower) relevance += 5.0;

      // Partial matches
      if (nameLower.includes(queryLower)) relevance += 3.0;
      if (categoryLower.includes(queryLower)) relevance += 2.0;

      // Keyword matching with TF-IDF-like scoring
      const uniqueKeywords = new Set(keywords);
      const nameWords = nameLower.split(/\s+/);
      const matchedKeywords = keywords.filter(kw => {
        if (kw.length > 2) {
          if (nameLower.includes(kw)) return true;
          if (categoryLower.includes(kw)) return true;
        }
        return false;
      });

      // Score based on keyword density
      const keywordDensity = matchedKeywords.length / Math.max(uniqueKeywords.size, 1);
      relevance += keywordDensity * 4.0;

      // Multi-word phrase matching (higher precision)
      if (query.split(/\s+/).length > 1) {
        const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        const matchedWords = queryWords.filter(qw => nameLower.includes(qw) || categoryLower.includes(qw));
        if (matchedWords.length === queryWords.length) {
          relevance += 6.0; // All query words present
        }
      }

      // Boost critical categories with enhanced logic
      const categoryBoosts: Record<string, { terms: string[], boost: number }> = {
        'state': { terms: ['state', 'virginia', 'maryland', 'pennsylvania', 'code', 'matching', 'requirement'], boost: 8.0 },
        'script': { terms: ['script', 'pitch', 'initial', 'meeting', 'call'], boost: 3.0 },
        'email': { terms: ['email', 'template', 'send', 'letter'], boost: 3.0 },
        'insurance': { terms: ['insurance', 'claim', 'argument', 'adjuster', 'partial', 'approval'], boost: 4.0 },
        'training': { terms: ['training', 'learn', 'how', 'manual', 'guide'], boost: 2.0 },
        'agreement': { terms: ['agreement', 'contract', 'sign', 'contingency'], boost: 2.5 },
        'building': { terms: ['building', 'code', 'irc', 'r908', 'flashing', 'roof'], boost: 4.5 }
      };

      Object.entries(categoryBoosts).forEach(([catKey, { terms, boost }]) => {
        const matchedTerms = terms.filter(term => keywords.includes(term) || queryLower.includes(term));
        if (matchedTerms.length > 0) {
          if (categoryLower.includes(catKey) || nameLower.includes(catKey)) {
            relevance += boost * (matchedTerms.length / terms.length);
          }
        }
      });

      if (relevance > 0) {
        results.push({
          document: doc,
          relevance,
          score: relevance, // Set score to match relevance for Message.sources compatibility
          snippet: `${doc.name} - ${doc.category || 'General'}`
        });
      }
    }

    // Sort by relevance (descending)
    let topResults = results.sort((a, b) => b.relevance - a.relevance);

    // Ensure state-specific docs are ALWAYS included if states detected
    if (relevantStates.length > 0) {
      const stateDoc = topResults.find(r => r.document.category === 'State-Specific Codes');
      if (stateDoc && topResults.indexOf(stateDoc) > 0) {
        // Move to top if not already there
        topResults = [stateDoc, ...topResults.filter(r => r !== stateDoc)];
      }
    }

    // Limit results
    topResults = topResults.slice(0, limit);

    // Load content for top results using batch loader
    const loadResult = await documentBatchLoader.loadInBatches(
      topResults,
      async (result) => {
        const docContent = await this.loadDocument(result.document.path);
        result.content = docContent.content;

        // CONTENT-BASED SCORING: Boost if query terms appear in content
        if (docContent.content) {
          const contentLower = docContent.content.toLowerCase();
          let contentRelevance = 0;

          keywords.forEach(kw => {
            const regex = new RegExp(`\\b${kw}\\b`, 'gi');
            const matches = contentLower.match(regex);
            if (matches) {
              contentRelevance += Math.min(matches.length * 0.5, 3.0); // Cap at 3.0
            }
          });

          // Add content relevance to total
          result.relevance += contentRelevance;

          // Extract better snippet from content
          const firstMatch = keywords.find(kw => contentLower.includes(kw));
          if (firstMatch) {
            const index = contentLower.indexOf(firstMatch);
            const start = Math.max(0, index - 50);
            const end = Math.min(docContent.content.length, index + 150);
            const snippet = docContent.content.substring(start, end).trim();
            result.snippet = `...${snippet}...`;
          }
        }

        return result;
      },
      {
        onProgress: (progress) => {
          console.log(`Loading documents: ${progress.percentage}% (${progress.loaded}/${progress.total})`);
        },
        onError: (result, error, attempt) => {
          console.warn(`Failed to load ${result.document.name} (attempt ${attempt}):`, error.message);
        }
      }
    );

    // Handle failed loads
    loadResult.failed.forEach(({ item }) => {
      item.content = `[Content unavailable for ${item.document.name}]`;
    });

    // Re-sort after content-based scoring
    const allResults = [...loadResult.success, ...loadResult.failed.map(f => f.item)];
    return allResults.sort((a, b) => b.relevance - a.relevance);
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
