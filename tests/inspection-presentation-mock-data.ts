/**
 * Mock Data for Inspection Presentation Tests
 *
 * Reusable test data for inspections, photos, AI analysis, and presentations
 */

// ============================================================================
// SAMPLE BASE64 IMAGE DATA
// ============================================================================

/**
 * Minimal valid JPEG (1x1 red pixel)
 * Use this for testing photo upload without large file overhead
 */
export const SAMPLE_JPEG_BASE64 = `data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAA//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AH//Z`;

/**
 * Minimal valid PNG (1x1 red pixel)
 */
export const SAMPLE_PNG_BASE64 = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==`;

/**
 * Large photo sample (simulates ~5MB photo)
 */
export const LARGE_PHOTO_BASE64 = `data:image/jpeg;base64,${'/9j/4AAQSkZJRg'.repeat(500000)}`;

// ============================================================================
// ROOF DAMAGE SCENARIOS
// ============================================================================

/**
 * Severe wind damage - high claim viability
 */
export const WIND_DAMAGE_ANALYSIS = {
  damageDetected: true,
  damageType: ['wind'],
  severity: 'severe',
  affectedArea: 'North-facing slope, ridge line, approximately 40 linear feet',
  estimatedSize: '180 sq ft or 20% of total roof area',
  claimViability: 'strong',
  policyLanguage: 'Sudden and accidental wind damage from documented storm event on January 12, 2025',
  insuranceArguments: [
    'Wind speed data from NOAA confirms sustained winds of 65mph during documented storm event',
    'Shingle lifting pattern consistent with wind direction during storm',
    'Granule loss exceeds 40% threshold indicating end of service life',
    'Multiple shingles show creasing and folding from wind uplift',
    'No evidence of gradual wear - damage is sudden and accidental',
  ],
  recommendations: [
    'Document NOAA wind speed data for January 12, 2025 storm event',
    'Obtain shingle manufacturer discontinuation letter (GAF Timberline HD in Colonial Slate)',
    'Photograph matching issues with remaining inventory',
    'Request full roof replacement due to matching concerns',
    'Document code upgrade requirements (ice & water shield, hip/ridge ventilation)',
  ],
  followUpQuestions: [
    'Date of last roof inspection or maintenance?',
    'Any previous storm damage claims filed?',
    'Original installation date and installer warranty information?',
    'Homeowner aware of the documented storm event?',
  ],
  urgency: 'high',
  confidence: 94,
  detailedAnalysis: `This roof exhibits severe wind damage consistent with the documented storm event on January 12, 2025. NOAA data confirms sustained winds of 65mph with gusts to 78mph during this event. The damage pattern shows:

1. WIND DAMAGE EVIDENCE: Shingles show lifting, creasing, and tearing consistent with high wind uplift forces. The pattern follows the documented wind direction from the northwest.

2. MATCHING CONCERNS: GAF Timberline HD in Colonial Slate was discontinued in 2018. Current inventory shows significant color variation. This triggers the aesthetic mismatch clause in most policies.

3. CODE UPGRADES: Local code now requires ice & water shield at eaves and valleys, plus ridge ventilation. These upgrades are covered under most policies as necessary to bring the roof to current code.

4. CLAIM STRATEGY: Position this as sudden and accidental wind damage, not wear and tear. Emphasize the documented storm event and matching concerns. Request full replacement rather than repair.

Estimated claim value: $18,500 - $22,000 for full roof replacement including code upgrades.`,
};

/**
 * Moderate hail damage - moderate claim viability
 */
export const HAIL_DAMAGE_ANALYSIS = {
  damageDetected: true,
  damageType: ['hail'],
  severity: 'moderate',
  affectedArea: 'West-facing slope, scattered impacts across 60% of surface',
  estimatedSize: '240 sq ft or 25% of total roof area',
  claimViability: 'moderate',
  policyLanguage: 'Hail damage from severe weather event causing functional and cosmetic damage to roof surface',
  insuranceArguments: [
    'Hail strike density exceeds 8 per 100 sq ft threshold',
    'Granule loss from hail impacts exposes asphalt layer',
    'NOAA storm reports confirm 1.5-inch hail in area on documented date',
    'Roof functionality compromised by exposed asphalt mat',
  ],
  recommendations: [
    'Document hail size from NOAA storm reports',
    'Measure hail strike density across multiple test squares',
    'Photograph granule loss and exposed asphalt',
    'Check gutters and downspouts for granule accumulation',
  ],
  followUpQuestions: [
    'When was the hail storm event?',
    'Were there other properties in area with similar damage?',
    'Has homeowner noticed any leaks or interior damage?',
  ],
  urgency: 'medium',
  confidence: 87,
  detailedAnalysis: `Moderate hail damage observed across west-facing slope. Hail strikes show typical bruising pattern with granule displacement. Density analysis reveals 10-12 strikes per 100 sq ft test square, exceeding the insurance threshold of 8 per 100 sq ft.

NOAA reports confirm 1.5-inch hail documented in the area. Recommend full documentation of strike density and correlation with weather event for claim support.`,
};

/**
 * Minor damage - weak claim viability
 */
export const MINOR_DAMAGE_ANALYSIS = {
  damageDetected: true,
  damageType: ['wear'],
  severity: 'minor',
  affectedArea: 'Ridge cap, isolated shingle tabs',
  estimatedSize: '15 sq ft or 2% of total roof area',
  claimViability: 'weak',
  policyLanguage: 'Localized wear consistent with normal weathering and age of roof',
  insuranceArguments: [
    'Damage appears gradual rather than sudden and accidental',
    'Wear pattern consistent with UV exposure and thermal cycling',
    'No correlation with documented storm events',
  ],
  recommendations: [
    'Document for maintenance records',
    'Consider targeted repair rather than insurance claim',
    'Monitor for progression',
    'Budget for replacement in 3-5 years',
  ],
  followUpQuestions: [
    'Age of roof?',
    'Any recent storm events?',
    'History of maintenance?',
  ],
  urgency: 'low',
  confidence: 78,
  detailedAnalysis: `Observed damage appears to be normal wear and tear rather than storm-related. Ridge cap shows typical UV degradation. Not recommended for insurance claim as damage does not meet sudden and accidental criteria.`,
};

/**
 * No damage detected - overview photo
 */
export const NO_DAMAGE_ANALYSIS = {
  damageDetected: false,
  damageType: [],
  severity: 'none',
  affectedArea: 'Overall roof condition - south-facing slope',
  estimatedSize: '0 sq ft',
  claimViability: 'none',
  policyLanguage: 'No covered perils identified',
  insuranceArguments: [],
  recommendations: [
    'Document overall condition for baseline records',
    'Note any future changes for comparison',
    'Continue regular maintenance inspections',
  ],
  followUpQuestions: [],
  urgency: 'low',
  confidence: 95,
  detailedAnalysis: 'South-facing slope shows no evidence of damage. Shingles in good condition with normal granule retention. This photo serves as baseline documentation.',
};

// ============================================================================
// MOCK USERS
// ============================================================================

export const MOCK_USERS = {
  salesRep: {
    id: 'user-sales-123',
    email: 'john@roofer.com',
    role: 'sales_rep',
    name: 'John Sales',
    state: 'MD',
  },
  manager: {
    id: 'user-manager-456',
    email: 'sarah@roofer.com',
    role: 'manager',
    name: 'Sarah Manager',
    state: 'VA',
  },
  admin: {
    id: 'user-admin-789',
    email: 'admin@roofer.com',
    role: 'admin',
    name: 'Admin User',
    state: null,
  },
  otherRep: {
    id: 'user-other-999',
    email: 'other@roofer.com',
    role: 'sales_rep',
    name: 'Other Rep',
    state: 'PA',
  },
};

// ============================================================================
// MOCK INSPECTIONS
// ============================================================================

export const MOCK_INSPECTIONS = {
  draft: {
    id: 'insp-draft-001',
    user_id: MOCK_USERS.salesRep.id,
    job_id: null,
    property_address: '123 Main St, Baltimore, MD 21201',
    customer_name: 'John Smith',
    inspection_date: new Date('2025-01-15T10:00:00Z'),
    inspector_notes: null,
    weather_conditions: null,
    roof_type: null,
    roof_age: null,
    status: 'draft',
    photo_count: 0,
    analyzed_photo_count: 0,
    created_at: new Date('2025-01-15T10:00:00Z'),
    updated_at: new Date('2025-01-15T10:00:00Z'),
  },
  inProgress: {
    id: 'insp-progress-002',
    user_id: MOCK_USERS.salesRep.id,
    job_id: 'job-456',
    property_address: '456 Oak Ave, Towson, MD 21204',
    customer_name: 'Jane Doe',
    inspection_date: new Date('2025-01-16T14:00:00Z'),
    inspector_notes: 'Visible wind damage on north slope',
    weather_conditions: 'Clear, 55°F',
    roof_type: 'Asphalt Shingle',
    roof_age: 12,
    status: 'in_progress',
    photo_count: 5,
    analyzed_photo_count: 0,
    created_at: new Date('2025-01-16T14:00:00Z'),
    updated_at: new Date('2025-01-16T15:30:00Z'),
  },
  completed: {
    id: 'insp-complete-003',
    user_id: MOCK_USERS.salesRep.id,
    job_id: 'job-789',
    property_address: '789 Elm St, Columbia, MD 21045',
    customer_name: 'Bob Johnson',
    inspection_date: new Date('2025-01-14T11:00:00Z'),
    inspector_notes: 'Hail damage west slope, wind damage north slope',
    weather_conditions: 'Partly cloudy, 62°F',
    roof_type: 'Architectural Shingle',
    roof_age: 8,
    status: 'completed',
    photo_count: 12,
    analyzed_photo_count: 12,
    created_at: new Date('2025-01-14T11:00:00Z'),
    updated_at: new Date('2025-01-14T16:45:00Z'),
  },
};

// ============================================================================
// MOCK PHOTOS
// ============================================================================

export const MOCK_PHOTOS = {
  unanalyzedDamage: {
    id: 'photo-001',
    inspection_id: MOCK_INSPECTIONS.inProgress.id,
    photo_data: SAMPLE_JPEG_BASE64,
    file_name: 'north-slope-damage.jpg',
    file_size: 2560000,
    mime_type: 'image/jpeg',
    category: 'damage',
    notes: 'Severe wind damage on ridge line',
    ai_analysis: null,
    analyzed_at: null,
    created_at: new Date('2025-01-16T15:00:00Z'),
  },
  analyzedWind: {
    id: 'photo-002',
    inspection_id: MOCK_INSPECTIONS.completed.id,
    photo_data: SAMPLE_JPEG_BASE64,
    file_name: 'wind-damage-north.jpg',
    file_size: 3200000,
    mime_type: 'image/jpeg',
    category: 'damage',
    notes: 'Wind damage with shingle lifting',
    ai_analysis: WIND_DAMAGE_ANALYSIS,
    analyzed_at: new Date('2025-01-14T16:15:00Z'),
    created_at: new Date('2025-01-14T15:30:00Z'),
  },
  analyzedHail: {
    id: 'photo-003',
    inspection_id: MOCK_INSPECTIONS.completed.id,
    photo_data: SAMPLE_JPEG_BASE64,
    file_name: 'hail-damage-west.jpg',
    file_size: 2890000,
    mime_type: 'image/jpeg',
    category: 'damage',
    notes: 'Hail strikes on west slope',
    ai_analysis: HAIL_DAMAGE_ANALYSIS,
    analyzed_at: new Date('2025-01-14T16:20:00Z'),
    created_at: new Date('2025-01-14T15:35:00Z'),
  },
  overview: {
    id: 'photo-004',
    inspection_id: MOCK_INSPECTIONS.completed.id,
    photo_data: SAMPLE_JPEG_BASE64,
    file_name: 'south-overview.jpg',
    file_size: 3100000,
    mime_type: 'image/jpeg',
    category: 'overview',
    notes: 'Overall south-facing slope',
    ai_analysis: NO_DAMAGE_ANALYSIS,
    analyzed_at: new Date('2025-01-14T16:10:00Z'),
    created_at: new Date('2025-01-14T15:25:00Z'),
  },
  detail: {
    id: 'photo-005',
    inspection_id: MOCK_INSPECTIONS.completed.id,
    photo_data: SAMPLE_JPEG_BASE64,
    file_name: 'ridge-detail.jpg',
    file_size: 2750000,
    mime_type: 'image/jpeg',
    category: 'detail',
    notes: 'Close-up of ridge cap',
    ai_analysis: MINOR_DAMAGE_ANALYSIS,
    analyzed_at: new Date('2025-01-14T16:25:00Z'),
    created_at: new Date('2025-01-14T15:40:00Z'),
  },
};

// ============================================================================
// MOCK PRESENTATIONS
// ============================================================================

export const MOCK_PRESENTATIONS = {
  draft: {
    id: 'pres-draft-001',
    inspection_id: MOCK_INSPECTIONS.completed.id,
    user_id: MOCK_USERS.salesRep.id,
    title: 'Roof Inspection - Bob Johnson',
    customer_name: 'Bob Johnson',
    property_address: '789 Elm St, Columbia, MD 21045',
    presentation_type: 'standard',
    slides: [
      {
        id: 'slide-1',
        slide_number: 1,
        slide_type: 'cover',
        title: 'Roof Inspection - Bob Johnson',
        content: 'Property: 789 Elm St, Columbia, MD 21045\nInspection Date: 1/14/2025',
        layout: 'text-only',
      },
      {
        id: 'slide-2',
        slide_number: 2,
        slide_type: 'photo',
        title: 'Photo Damage',
        content: 'Wind damage with shingle lifting',
        photo_id: MOCK_PHOTOS.analyzedWind.id,
        photo_url: MOCK_PHOTOS.analyzedWind.photo_data,
        ai_insights: WIND_DAMAGE_ANALYSIS,
        layout: 'split',
      },
      {
        id: 'slide-3',
        slide_number: 3,
        slide_type: 'summary',
        title: 'Inspection Summary',
        content: 'Total Photos: 5\nDamage Detected: 3\nOverall Severity: Requires attention',
        layout: 'text-only',
      },
    ],
    branding: {
      company_name: 'Roof-ER',
      contact_info: 'contact@roofer.com | (410) 555-1234',
    },
    share_token: null,
    is_public: false,
    view_count: 0,
    status: 'draft',
    created_at: new Date('2025-01-14T17:00:00Z'),
    updated_at: new Date('2025-01-14T17:00:00Z'),
  },
  shared: {
    id: 'pres-shared-002',
    inspection_id: MOCK_INSPECTIONS.completed.id,
    user_id: MOCK_USERS.salesRep.id,
    title: 'Professional Roof Assessment - Bob Johnson',
    customer_name: 'Bob Johnson',
    property_address: '789 Elm St, Columbia, MD 21045',
    presentation_type: 'insurance',
    slides: [
      {
        id: 'slide-1',
        slide_number: 1,
        slide_type: 'cover',
        title: 'Professional Roof Assessment',
        content: 'Customer: Bob Johnson\nProperty: 789 Elm St, Columbia, MD 21045\nInspection Date: January 14, 2025\nInspector: John Sales',
        layout: 'text-only',
      },
    ],
    branding: {
      logo_url: 'https://example.com/logo.png',
      company_name: 'Roof-ER Professional Services',
      contact_info: 'contact@roofer.com | (410) 555-1234',
    },
    share_token: 'abc123xyz789',
    is_public: true,
    view_count: 15,
    status: 'shared',
    created_at: new Date('2025-01-14T17:30:00Z'),
    updated_at: new Date('2025-01-15T09:00:00Z'),
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate multiple mock photos for testing
 */
export function generateMockPhotos(count: number, inspectionId: string): any[] {
  const categories = ['damage', 'overview', 'detail', 'measurements', 'other'];
  const analyses = [WIND_DAMAGE_ANALYSIS, HAIL_DAMAGE_ANALYSIS, NO_DAMAGE_ANALYSIS, MINOR_DAMAGE_ANALYSIS];

  return Array.from({ length: count }, (_, i) => ({
    id: `photo-gen-${i + 1}`,
    inspection_id: inspectionId,
    photo_data: SAMPLE_JPEG_BASE64,
    file_name: `photo-${i + 1}.jpg`,
    file_size: 2000000 + Math.floor(Math.random() * 2000000),
    mime_type: 'image/jpeg',
    category: categories[i % categories.length],
    notes: `Test photo ${i + 1}`,
    ai_analysis: i % 2 === 0 ? analyses[i % analyses.length] : null,
    analyzed_at: i % 2 === 0 ? new Date() : null,
    created_at: new Date(Date.now() - (count - i) * 60000),
  }));
}

/**
 * Generate complete presentation with all slide types
 */
export function generateFullPresentation(inspectionId: string, userId: string): any {
  return {
    id: `pres-full-${Date.now()}`,
    inspection_id: inspectionId,
    user_id: userId,
    title: 'Complete Roof Inspection Presentation',
    customer_name: 'Test Customer',
    property_address: '123 Test St',
    presentation_type: 'detailed',
    slides: [
      {
        id: 'slide-1',
        slide_number: 1,
        slide_type: 'cover',
        title: 'Complete Roof Inspection',
        content: 'Full analysis with all slide types',
        layout: 'text-only',
      },
      {
        id: 'slide-2',
        slide_number: 2,
        slide_type: 'photo',
        title: 'Wind Damage',
        content: 'Severe wind damage analysis',
        photo_url: SAMPLE_JPEG_BASE64,
        ai_insights: WIND_DAMAGE_ANALYSIS,
        layout: 'split',
      },
      {
        id: 'slide-3',
        slide_number: 3,
        slide_type: 'analysis',
        title: 'Detailed Analysis',
        content: WIND_DAMAGE_ANALYSIS.detailedAnalysis,
        ai_insights: WIND_DAMAGE_ANALYSIS,
        layout: 'text-only',
      },
      {
        id: 'slide-4',
        slide_number: 4,
        slide_type: 'summary',
        title: 'Summary',
        content: 'Total Photos: 10\nDamage Detected: 6\nSeverity: High',
        layout: 'text-only',
      },
      {
        id: 'slide-5',
        slide_number: 5,
        slide_type: 'recommendations',
        title: 'Recommendations',
        content: WIND_DAMAGE_ANALYSIS.recommendations.join('\n'),
        layout: 'text-only',
      },
      {
        id: 'slide-6',
        slide_number: 6,
        slide_type: 'contact',
        title: 'Contact Us',
        content: 'Roof-ER Professional Services\ncontact@roofer.com',
        layout: 'text-only',
      },
    ],
    branding: {
      company_name: 'Roof-ER',
      contact_info: 'contact@roofer.com',
    },
    share_token: null,
    is_public: false,
    view_count: 0,
    status: 'draft',
    created_at: new Date(),
    updated_at: new Date(),
  };
}

/**
 * Create inspection with photos for testing
 */
export function createInspectionWithPhotos(userId: string, photoCount: number = 5): any {
  const inspection = {
    ...MOCK_INSPECTIONS.inProgress,
    id: `insp-test-${Date.now()}`,
    user_id: userId,
    photo_count: photoCount,
  };

  const photos = generateMockPhotos(photoCount, inspection.id);

  return { inspection, photos };
}
