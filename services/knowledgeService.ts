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

// Base path for documents in public folder (accessible via Vite static serving)
const DOCS_BASE_PATH = '/extracted_content';

export const knowledgeService = {
  // Get list of all available documents
  async getDocumentIndex(): Promise<Document[]> {
    return [
      // Adjuster Resources (2 documents)
      {
        name: 'Adjuster_Inspector Information Sheet1',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Adjuster_Inspector Information Sheet1.md`,
        type: 'docx',
        category: 'Adjuster Resources'
      },
      {
        name: 'Adjuster Meeting Outcome Script',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/images samp/Pitches/Adjuster Meeting Outcome Script.md`,
        type: 'docx',
        category: 'Adjuster Resources'
      },

      // Agreements & Contracts (9 documents)
      {
        name: 'DMV Blank Contingency',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/DMV Blank Contingency.md`,
        type: 'docx',
        category: 'Agreements & Contracts'
      },
      {
        name: 'PA Blank Contingency',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/PA Blank Contingency.md`,
        type: 'docx',
        category: 'Agreements & Contracts'
      },
      {
        name: 'Repair Attempt Agreement',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Agreements/Repair Attempt Agreement.md`,
        type: 'pdf',
        category: 'Agreements & Contracts'
      },
      {
        name: 'Project Agreement - Repair - VA',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Agreements/Project Agreement - Repair - VA.md`,
        type: 'pdf',
        category: 'Agreements & Contracts'
      },
      {
        name: 'InsuranceAgrement_Updated',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Agreements/InsuranceAgrement_Updated.md`,
        type: 'pdf',
        category: 'Agreements & Contracts'
      },
      {
        name: 'iTel Agreement',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Agreements/iTel Agreement.md`,
        type: 'pdf',
        category: 'Agreements & Contracts'
      },
      {
        name: 'Emergency Tarp',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Agreements/Emergency Tarp.md`,
        type: 'pdf',
        category: 'Agreements & Contracts'
      },
      {
        name: 'Claim Authorization Form',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Agreements/Claim Authorization Form.md`,
        type: 'pdf',
        category: 'Agreements & Contracts'
      },
      {
        name: 'Project Agreement - Repair - MD',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Agreements/Project Agreement - Repair - MD.md`,
        type: 'pdf',
        category: 'Agreements & Contracts'
      },

      // Branding (1 documents)
      {
        name: 'RESIDENTIAL_BRAND_GUIDELINES',
        path: `${DOCS_BASE_PATH}/RESIDENTIAL_BRAND_GUIDELINES.md`,
        type: 'docx',
        category: 'Branding'
      },

      // Company Culture (2 documents)
      {
        name: 'Mission, Values, & Commitment',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Mission, Values, & Commitment.md`,
        type: 'docx',
        category: 'Company Culture'
      },
      {
        name: 'Role+',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Role+.md`,
        type: 'docx',
        category: 'Company Culture'
      },

      // Customer Resources (13 documents)
      {
        name: 'SP Exclusion Form',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Customer Resources(Products, Warranties, etc.)/SP Exclusion Form.md`,
        type: 'pdf',
        category: 'Customer Resources'
      },
      {
        name: 'What is a Deductible_',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Customer Resources(Products, Warranties, etc.)/What is a Deductible_.md`,
        type: 'pdf',
        category: 'Customer Resources'
      },
      {
        name: 'Workmanship Warranty',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Customer Resources(Products, Warranties, etc.)/Workmanship Warranty.md`,
        type: 'pdf',
        category: 'Customer Resources'
      },
      {
        name: 'Warranty Comparison Prsentation',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Customer Resources(Products, Warranties, etc.)/Warranty Comparison Prsentation.md`,
        type: 'pdf',
        category: 'Customer Resources'
      },
      {
        name: 'RoofER Standard Materials',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Customer Resources(Products, Warranties, etc.)/RoofER Standard Materials.md`,
        type: 'pdf',
        category: 'Customer Resources'
      },
      {
        name: 'GAF Standard Warranty',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Customer Resources(Products, Warranties, etc.)/GAF Standard Warranty.md`,
        type: 'pdf',
        category: 'Customer Resources'
      },
      {
        name: 'GAF Warranty Comparison',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Customer Resources(Products, Warranties, etc.)/GAF Warranty Comparison.md`,
        type: 'pdf',
        category: 'Customer Resources'
      },
      {
        name: 'Golden_Pledge_Limited_RESWT161_Legal_Sample',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Customer Resources(Products, Warranties, etc.)/Golden_Pledge_Limited_RESWT161_Legal_Sample.md`,
        type: 'pdf',
        category: 'Customer Resources'
      },
      {
        name: 'GAF Timberline HDZ Presentation',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Customer Resources(Products, Warranties, etc.)/GAF Timberline HDZ Presentation.md`,
        type: 'pdf',
        category: 'Customer Resources'
      },
      {
        name: 'Roof-ER',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Customer Resources(Products, Warranties, etc.)/Roof-ER.md`,
        type: 'pdf',
        category: 'Customer Resources'
      },
      {
        name: 'Silver Pledge Legalese',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Customer Resources(Products, Warranties, etc.)/Silver Pledge Legalese.md`,
        type: 'pdf',
        category: 'Customer Resources'
      },
      {
        name: 'Silver Pledge Warranty Brochure',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Customer Resources(Products, Warranties, etc.)/Silver Pledge Warranty Brochure.md`,
        type: 'pdf',
        category: 'Customer Resources'
      },
      {
        name: 'Post Sign Up Timeline',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Customer Resources(Products, Warranties, etc.)/Post Sign Up Timeline.md`,
        type: 'pdf',
        category: 'Customer Resources'
      },

      // Email Templates (11 documents)
      {
        name: 'iTel Shingle Template',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Email Templates/iTel Shingle Template.md`,
        type: 'docx',
        category: 'Email Templates'
      },
      {
        name: 'Post AM Email Template',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Email Templates/Post AM Email Template.md`,
        type: 'docx',
        category: 'Email Templates'
      },
      {
        name: 'Request For Appraisal',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Email Templates/Request For Appraisal.md`,
        type: 'docx',
        category: 'Email Templates'
      },
      {
        name: 'Repair Attempt Template',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Email Templates/Repair Attempt Template.md`,
        type: 'docx',
        category: 'Email Templates'
      },
      {
        name: 'Danny_s Repair Attempt Video Template',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Email Templates/Danny_s Repair Attempt Video Template.md`,
        type: 'docx',
        category: 'Email Templates'
      },
      {
        name: 'Photo Report Template',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Email Templates/Photo Report Template.md`,
        type: 'docx',
        category: 'Email Templates'
      },
      {
        name: 'Template from Customer to Insurance',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Email Templates/Template from Customer to Insurance.md`,
        type: 'docx',
        category: 'Email Templates'
      },
      {
        name: 'Estimate Request Template',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Email Templates/Estimate Request Template.md`,
        type: 'docx',
        category: 'Email Templates'
      },
      {
        name: 'Generic Partial Template',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Email Templates/Generic Partial Template.md`,
        type: 'docx',
        category: 'Email Templates'
      },
      {
        name: 'GAF Guidelines Template',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Email Templates/GAF Guidelines Template.md`,
        type: 'docx',
        category: 'Email Templates'
      },
      {
        name: 'Siding Argument',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Email Templates/Siding Argument.md`,
        type: 'docx',
        category: 'Email Templates'
      },

      // Financial (1 documents)
      {
        name: 'Required Mortgage Endorsement Companies',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Required Mortgage Endorsement Companies.md`,
        type: 'docx',
        category: 'Financial'
      },

      // Insurance Arguments (15 documents)
      {
        name: 'Engineers',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Insurance Argument Resources/Engineers.md`,
        type: 'docx',
        category: 'Insurance Arguments'
      },
      {
        name: 'Maryland Insurance Administration Matching Requirement 3',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Insurance Argument Resources/Maryland Insurance Administration Matching Requirement 3.md`,
        type: 'docx',
        category: 'Insurance Arguments'
      },
      {
        name: 'Complaint Forms',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Insurance Argument Resources/Complaint Forms.md`,
        type: 'docx',
        category: 'Insurance Arguments'
      },
      {
        name: 'Maryland Insurance Administration Matching Requirement 2',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Insurance Argument Resources/Maryland Insurance Administration Matching Requirement 2.md`,
        type: 'docx',
        category: 'Insurance Arguments'
      },
      {
        name: 'Maryland Exterior Wrap Code R703',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Insurance Argument Resources/Maryland Exterior Wrap Code R703.md`,
        type: 'docx',
        category: 'Insurance Arguments'
      },
      {
        name: 'Virginia Residential Building Codes',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Insurance Argument Resources/Virginia Residential Building Codes.md`,
        type: 'docx',
        category: 'Insurance Arguments'
      },
      {
        name: 'Low Roof_Flat Roof Code',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Insurance Argument Resources/Low Roof_Flat Roof Code.md`,
        type: 'docx',
        category: 'Insurance Arguments'
      },
      {
        name: 'Maryland Insurance Administration Matching Requirement 1',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Insurance Argument Resources/Maryland Insurance Administration Matching Requirement 1.md`,
        type: 'docx',
        category: 'Insurance Arguments'
      },
      {
        name: 'Flashing Codes',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Insurance Argument Resources/Flashing Codes.md`,
        type: 'docx',
        category: 'Insurance Arguments'
      },
      {
        name: 'Arbitration Information',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Insurance Argument Resources/Arbitration Information.md`,
        type: 'docx',
        category: 'Insurance Arguments'
      },
      {
        name: 'PHILLY PARTIALS',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Insurance Argument Resources/PHILLY PARTIALS.md`,
        type: 'docx',
        category: 'Insurance Arguments'
      },
      {
        name: 'GAF Requirement - Slope Replacement',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Insurance Argument Resources/GAF Requirement - Slope Replacement.md`,
        type: 'docx',
        category: 'Insurance Arguments'
      },
      {
        name: 'Discontinued-Shingle-List',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Insurance Argument Resources/Discontinued-Shingle-List.md`,
        type: 'docx',
        category: 'Insurance Arguments'
      },
      {
        name: 'GAF Storm Damage Guidelines ',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Insurance Argument Resources/GAF Storm Damage Guidelines .md`,
        type: 'docx',
        category: 'Insurance Arguments'
      },
      {
        name: 'Virginia building codes Re-roofing Chapters',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Insurance Argument Resources/Virginia building codes Re-roofing Chapters.md`,
        type: 'docx',
        category: 'Insurance Arguments'
      },

      // Licenses & Certifications (18 documents)
      {
        name: 'PA license 2025 - 2027',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Licenses, Certifications, & General Liability Ins/PA license 2025 - 2027.md`,
        type: 'docx',
        category: 'Licenses & Certifications'
      },
      {
        name: 'TAX ID Information',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Licenses, Certifications, & General Liability Ins/TAX ID Information.md`,
        type: 'docx',
        category: 'Licenses & Certifications'
      },
      {
        name: 'Roof-ER CertainTeed ShingleMaster',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Licenses, Certifications, & General Liability Ins/Roof-ER CertainTeed ShingleMaster.md`,
        type: 'docx',
        category: 'Licenses & Certifications'
      },
      {
        name: 'GAF Master Elite 2025',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Licenses, Certifications, & General Liability Ins/GAF Master Elite 2025.md`,
        type: 'docx',
        category: 'Licenses & Certifications'
      },
      {
        name: 'Form W-9 (Rev. March 2024) (1)',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Licenses, Certifications, & General Liability Ins/Form W-9 (Rev. March 2024) (1).md`,
        type: 'docx',
        category: 'Licenses & Certifications'
      },
      {
        name: 'COI - workers comp 2026',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Licenses, Certifications, & General Liability Ins/COI - workers comp 2026.md`,
        type: 'docx',
        category: 'Licenses & Certifications'
      },
      {
        name: 'Pennsylvania License Valid Through 2027',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Licenses, Certifications, & General Liability Ins/Pennsylvania License Valid Through 2027.md`,
        type: 'docx',
        category: 'Licenses & Certifications'
      },
      {
        name: 'Maryland License Valid through 2027',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Licenses, Certifications, & General Liability Ins/Maryland License Valid through 2027.md`,
        type: 'docx',
        category: 'Licenses & Certifications'
      },
      {
        name: 'Master Elite Reference Letter for Customers',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Licenses, Certifications, & General Liability Ins/Master Elite Reference Letter for Customers.md`,
        type: 'docx',
        category: 'Licenses & Certifications'
      },
      {
        name: 'COI - General Liability',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Licenses, Certifications, & General Liability Ins/COI - General Liability.md`,
        type: 'docx',
        category: 'Licenses & Certifications'
      },
      {
        name: 'VA License 2025 - 2027',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Licenses, Certifications, & General Liability Ins/VA License 2025 - 2027.md`,
        type: 'docx',
        category: 'Licenses & Certifications'
      },
      {
        name: 'MD License (Valid through 7_2025)',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Licenses, Certifications, & General Liability Ins/Expired Docs/MD License (Valid through 7_2025).md`,
        type: 'docx',
        category: 'Licenses & Certifications'
      },
      {
        name: 'VA Class A License (Valid through 12_2024',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Licenses, Certifications, & General Liability Ins/Expired Docs/VA Class A License (Valid through 12_2024.md`,
        type: 'docx',
        category: 'Licenses & Certifications'
      },
      {
        name: 'Copy of MD License (Valid through 7_2025)',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Licenses, Certifications, & General Liability Ins/Expired Docs/Copy of MD License (Valid through 7_2025).md`,
        type: 'docx',
        category: 'Licenses & Certifications'
      },
      {
        name: 'MD License',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Licenses & Certifications/MD License.md`,
        type: 'docx',
        category: 'Licenses & Certifications'
      },
      {
        name: 'VA Class A License',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Licenses & Certifications/VA Class A License.md`,
        type: 'docx',
        category: 'Licenses & Certifications'
      },
      {
        name: 'Roof-ER CertainTeed ShingleMaster',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Licenses & Certifications/Roof-ER CertainTeed ShingleMaster.md`,
        type: 'docx',
        category: 'Licenses & Certifications'
      },
      {
        name: 'CERTIFIED_CERTIFICATE',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Licenses & Certifications/CERTIFIED_CERTIFICATE.md`,
        type: 'docx',
        category: 'Licenses & Certifications'
      },

      // Miscellaneous (27 documents)
      {
        name: 'Roof-ER Roof & Siding Claim Response Packet',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Roof-ER Roof & Siding Claim Response Packet.md`,
        type: 'docx',
        category: 'Miscellaneous'
      },
      {
        name: '📧 Email Generator ',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/📧 Email Generator .md`,
        type: 'docx',
        category: 'Miscellaneous'
      },
      {
        name: 'Roof-ER Siding Claim Response Packet',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Roof-ER Siding Claim Response Packet.md`,
        type: 'docx',
        category: 'Miscellaneous'
      },
      {
        name: 'RoofER_Top10_CheatSheet_Fixed',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/RoofER_Top10_CheatSheet_Fixed.md`,
        type: 'pdf',
        category: 'Miscellaneous'
      },
      {
        name: 'Brochure',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Brochure.md`,
        type: 'pdf',
        category: 'Miscellaneous'
      },
      {
        name: 'Untitled document',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Untitled document.md`,
        type: 'docx',
        category: 'Miscellaneous'
      },
      {
        name: 'Hover ESX_XML_PDF Process',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Hover ESX_XML_PDF Process.md`,
        type: 'docx',
        category: 'Miscellaneous'
      },
      {
        name: 'AM Outcome Process',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/images samp/Process/AM Outcome Process.md`,
        type: 'docx',
        category: 'Miscellaneous'
      },
      {
        name: 'docs_temps',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Q&A Susan AI-21/docs_temps.md`,
        type: 'docx',
        category: 'Miscellaneous'
      },
      {
        name: 'Stuck_do',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Q&A Susan AI-21/Stuck_do.md`,
        type: 'docx',
        category: 'Miscellaneous'
      },
      {
        name: 'susan_ai',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Q&A Susan AI-21/susan_ai.md`,
        type: 'docx',
        category: 'Miscellaneous'
      },
      {
        name: 'Knowledge',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Q&A Susan AI-21/Knowledge.md`,
        type: 'docx',
        category: 'Miscellaneous'
      },
      {
        name: 'Escal',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Q&A Susan AI-21/Escal.md`,
        type: 'docx',
        category: 'Miscellaneous'
      },
      {
        name: 'Pushback',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Q&A Susan AI-21/Pushback.md`,
        type: 'docx',
        category: 'Miscellaneous'
      },
      {
        name: 'GAF_Storm',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Q&A Susan AI-21/GAF_Storm.md`,
        type: 'docx',
        category: 'Miscellaneous'
      },
      {
        name: 'Sample Photo Report 4',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Rep Reports & Photo Examples/Sample Photo Report 4.md`,
        type: 'docx',
        category: 'Miscellaneous'
      },
      {
        name: 'Sample Photo Report 1',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Rep Reports & Photo Examples/Sample Photo Report 1.md`,
        type: 'docx',
        category: 'Miscellaneous'
      },
      {
        name: 'Sample Photo Report 2',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Rep Reports & Photo Examples/Sample Photo Report 2.md`,
        type: 'docx',
        category: 'Miscellaneous'
      },
      {
        name: 'Sample Photo Report 3',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Rep Reports & Photo Examples/Sample Photo Report 3.md`,
        type: 'docx',
        category: 'Miscellaneous'
      },
      {
        name: 'EXAMPLE PHOTOS',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Rep Reports & Photo Examples/EXAMPLE PHOTOS.md`,
        type: 'docx',
        category: 'Miscellaneous'
      },
      {
        name: 'docs_temps',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Questions/docs_temps.md`,
        type: 'docx',
        category: 'Miscellaneous'
      },
      {
        name: 'Stuck_do',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Questions/Stuck_do.md`,
        type: 'docx',
        category: 'Miscellaneous'
      },
      {
        name: 'susan_ai',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Questions/susan_ai.md`,
        type: 'docx',
        category: 'Miscellaneous'
      },
      {
        name: 'Knowledge',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Questions/Knowledge.md`,
        type: 'docx',
        category: 'Miscellaneous'
      },
      {
        name: 'Escal',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Questions/Escal.md`,
        type: 'docx',
        category: 'Miscellaneous'
      },
      {
        name: 'Pushback',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Questions/Pushback.md`,
        type: 'docx',
        category: 'Miscellaneous'
      },
      {
        name: 'GAF_Storm',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Questions/GAF_Storm.md`,
        type: 'docx',
        category: 'Miscellaneous'
      },

      // Operations (1 documents)
      {
        name: 'Sales Operations and Tasks',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Sales Operations and Tasks.md`,
        type: 'docx',
        category: 'Operations'
      },

      // Procedures (1 documents)
      {
        name: 'How to do a Repair Attempt [EXAMPLE]',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/How to do a Repair Attempt [EXAMPLE].md`,
        type: 'docx',
        category: 'Procedures'
      },

      // Quick Reference (2 documents)
      {
        name: 'Roof-ER Quick Strike Guide',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Roof-ER Quick Strike Guide.md`,
        type: 'docx',
        category: 'Quick Reference'
      },
      {
        name: 'Roof-ER Quick Cheat Sheet',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Roof-ER Quick Cheat Sheet.md`,
        type: 'pdf',
        category: 'Quick Reference'
      },

      // Reference (8 documents)
      {
        name: 'Merged_PDFs_6',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Merged_PDFs_6.md`,
        type: 'docx',
        category: 'Reference'
      },
      {
        name: 'Merged_PDFs_2',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Merged_PDFs_2.md`,
        type: 'docx',
        category: 'Reference'
      },
      {
        name: 'Merged_PDFs_3',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Merged_PDFs_3.md`,
        type: 'docx',
        category: 'Reference'
      },
      {
        name: 'Merged_PDFs_4',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Merged_PDFs_4.md`,
        type: 'docx',
        category: 'Reference'
      },
      {
        name: 'Merged_PDFs_5',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Merged_PDFs_5.md`,
        type: 'docx',
        category: 'Reference'
      },
      {
        name: 'RoofER_Master_Documents',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/RoofER_Master_Documents.md`,
        type: 'docx',
        category: 'Reference'
      },
      {
        name: 'Merged_PDFs_1',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Merged_PDFs_1.md`,
        type: 'docx',
        category: 'Reference'
      },
      {
        name: 'RoofER_Master_Documents_Updated',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/RoofER_Master_Documents_Updated.md`,
        type: 'docx',
        category: 'Reference'
      },

      // Sales Scripts (7 documents)
      {
        name: 'Post Adjuster Meeting Script',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Sales Scripts /Post Adjuster Meeting Script.md`,
        type: 'docx',
        category: 'Sales Scripts'
      },
      {
        name: 'Contingency and Claim Authorization Script',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Sales Scripts /Contingency and Claim Authorization Script.md`,
        type: 'docx',
        category: 'Sales Scripts'
      },
      {
        name: 'Initial Pitch Script',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Sales Scripts /Initial Pitch Script.md`,
        type: 'docx',
        category: 'Sales Scripts'
      },
      {
        name: 'Inspection and Post Inspection Script',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Sales Scripts /Inspection and Post Inspection Script.md`,
        type: 'docx',
        category: 'Sales Scripts'
      },
      {
        name: 'Claim Filing Information Sheet',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Sales Scripts /Claim Filing Information Sheet.md`,
        type: 'docx',
        category: 'Sales Scripts'
      },
      {
        name: 'Full Approval Estimate Phone Call',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Sales Scripts /Full Approval Estimate Phone Call.md`,
        type: 'docx',
        category: 'Sales Scripts'
      },
      {
        name: 'Partial Estimate Phone Call',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Sales Scripts /Partial Estimate Phone Call.md`,
        type: 'docx',
        category: 'Sales Scripts'
      },

      // Training (5 documents)
      {
        name: 'Roof-ER Sales Training (1)',
        path: `${DOCS_BASE_PATH}/Roof-ER Sales Training (1).md`,
        type: 'docx',
        category: 'Training'
      },
      {
        name: 'Training Manual',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Training Manual.md`,
        type: 'docx',
        category: 'Training'
      },
      {
        name: 'Roof-ER Sales Training.pptx',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Roof-ER Sales Training.pptx.md`,
        type: 'pptx',
        category: 'Training'
      },
      {
        name: 'Training',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Q&A Susan AI-21/Training.md`,
        type: 'docx',
        category: 'Training'
      },
      {
        name: 'Training',
        path: `${DOCS_BASE_PATH}/Sales Rep Resources 2/Questions/Training.md`,
        type: 'docx',
        category: 'Training'
      }

    ];
  },


  // Load document content
  async loadDocument(path: string): Promise<DocumentContent> {
    try {
      const name = path.split('/').pop()?.replace('.md', '') || 'Unknown';

      // Fetch markdown content from public folder via Vite static serving
      const response = await fetch(path);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const content = await response.text();

      return {
        name,
        content,
        metadata: {
          lastModified: new Date()
        }
      };
    } catch (error) {
      console.error('Error loading document:', error);
      throw new Error(`Failed to load document: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  // Search documents (simple text search for now)
  async searchDocuments(query: string, documents: Document[]): Promise<Array<{
    document: Document;
    relevance: number;
    snippet: string;
  }>> {
    const queryLower = query.toLowerCase();

    // Simple relevance scoring based on name match
    const results = documents
      .map(doc => {
        const nameLower = doc.name.toLowerCase();
        const categoryLower = (doc.category || '').toLowerCase();

        let relevance = 0;

        // Exact match in name
        if (nameLower === queryLower) relevance += 1.0;
        // Contains query in name
        else if (nameLower.includes(queryLower)) relevance += 0.8;
        // Contains query in category
        if (categoryLower.includes(queryLower)) relevance += 0.5;

        // Keyword matching
        const keywords = query.toLowerCase().split(' ');
        keywords.forEach(keyword => {
          if (keyword.length > 2) {
            if (nameLower.includes(keyword)) relevance += 0.3;
            if (categoryLower.includes(keyword)) relevance += 0.2;
          }
        });

        return {
          document: doc,
          relevance,
          snippet: `${doc.name} - ${doc.category || 'General'}`
        };
      })
      .filter(result => result.relevance > 0)
      .sort((a, b) => b.relevance - a.relevance);

    return results;
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
