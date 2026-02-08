/**
 * Inspection Presentation API Routes
 * Handles roof inspection photos, AI analysis, and presentation generation
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { GoogleGenAI } from '@google/genai';

const router = Router();

// Environment helper function (server-side only)
const getEnvKey = (key: string) => process.env[key] || process.env[`VITE_${key}`] || '';

// Types
interface InspectionPhoto {
  id: string;
  inspection_id: string;
  photo_url: string;
  photo_data: string; // base64
  file_name: string;
  file_size: number;
  mime_type: string;
  category: 'damage' | 'overview' | 'detail' | 'measurements' | 'other';
  notes?: string;
  ai_analysis?: any;
  analyzed_at?: Date;
  created_at: Date;
}

interface Inspection {
  id: string;
  user_id: string;
  job_id?: string;
  property_address: string;
  customer_name: string;
  inspection_date: Date;
  inspector_notes?: string;
  weather_conditions?: string;
  roof_type?: string;
  roof_age?: number;
  status: 'draft' | 'in_progress' | 'completed' | 'presented';
  photo_count: number;
  analyzed_photo_count: number;
  created_at: Date;
  updated_at: Date;
}

interface Presentation {
  id: string;
  inspection_id: string;
  user_id: string;
  title: string;
  customer_name: string;
  property_address: string;
  presentation_type: 'standard' | 'insurance' | 'detailed';
  slides: PresentationSlide[];
  branding?: {
    logo_url?: string;
    company_name?: string;
    contact_info?: string;
  };
  share_token?: string;
  is_public: boolean;
  view_count: number;
  status: 'draft' | 'ready' | 'shared';
  created_at: Date;
  updated_at: Date;
}

interface PresentationSlide {
  id: string;
  slide_number: number;
  slide_type: 'cover' | 'photo' | 'analysis' | 'summary' | 'recommendations' | 'contact';
  title: string;
  content: string;
  photo_id?: string;
  photo_url?: string;
  ai_insights?: any;
  layout: 'full-image' | 'split' | 'grid' | 'text-only';
}

// Helper to get pool from app
const getPool = (req: Request): Pool => {
  return req.app.get('pool');
};

// Helper to get user ID from email
const getUserIdFromEmail = async (pool: Pool, email: string): Promise<string | null> => {
  const result = await pool.query(
    'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
    [email]
  );
  return result.rows[0]?.id || null;
};

// Helper to generate share token
const generateShareToken = (): string => {
  return Math.random().toString(36).substring(2, 15) +
         Math.random().toString(36).substring(2, 15);
};

// Helper to ensure tables exist
const ensureTablesExist = async (pool: Pool): Promise<void> => {
  const createTablesSQL = `
    -- Create inspections table if not exists
    CREATE TABLE IF NOT EXISTS inspections (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_id UUID,
      property_address TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      inspection_date TIMESTAMPTZ DEFAULT NOW(),
      inspector_notes TEXT,
      weather_conditions TEXT,
      roof_type TEXT,
      roof_age INTEGER,
      status TEXT DEFAULT 'draft',
      photo_count INTEGER DEFAULT 0,
      analyzed_photo_count INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Create inspection_photos table if not exists
    CREATE TABLE IF NOT EXISTS inspection_photos (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      inspection_id UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      photo_url TEXT,
      photo_data TEXT,
      file_name TEXT,
      file_size INTEGER,
      mime_type TEXT,
      category TEXT DEFAULT 'other',
      notes TEXT,
      ai_analysis JSONB,
      analyzed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Create presentations table if not exists
    CREATE TABLE IF NOT EXISTS presentations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      inspection_id UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      property_address TEXT NOT NULL,
      presentation_type TEXT DEFAULT 'standard',
      slides JSONB DEFAULT '[]'::jsonb,
      branding JSONB,
      share_token TEXT UNIQUE,
      is_public BOOLEAN DEFAULT false,
      view_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'draft',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Create indexes if not exists
    CREATE INDEX IF NOT EXISTS idx_inspections_user_id ON inspections(user_id);
    CREATE INDEX IF NOT EXISTS idx_inspection_photos_inspection_id ON inspection_photos(inspection_id);
    CREATE INDEX IF NOT EXISTS idx_presentations_inspection_id ON presentations(inspection_id);
    CREATE INDEX IF NOT EXISTS idx_presentations_share_token ON presentations(share_token) WHERE share_token IS NOT NULL;
  `;

  await pool.query(createTablesSQL);
  console.log('[Inspections API] Ensured tables exist');
};

// Track if tables have been initialized
let tablesInitialized = false;

// ============================================================================
// ADMIN / INITIALIZATION
// ============================================================================

/**
 * POST /api/inspections/init
 * Initialize database tables (admin only)
 */
router.post('/init', async (req: Request, res: Response) => {
  try {
    const pool = getPool(req);
    await ensureTablesExist(pool);
    tablesInitialized = true;
    res.json({ success: true, message: 'Tables initialized successfully' });
  } catch (error) {
    console.error('[Inspections API] Error initializing tables:', error);
    res.status(500).json({ error: 'Failed to initialize tables', details: String(error) });
  }
});

/**
 * GET /api/inspections/status
 * Get system status
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const pool = getPool(req);

    // Check if tables exist
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'inspections'
      ) as inspections_exists,
      EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'presentations'
      ) as presentations_exists
    `);

    res.json({
      status: 'ok',
      tables: {
        inspections: tableCheck.rows[0].inspections_exists,
        presentations: tableCheck.rows[0].presentations_exists
      },
      initialized: tablesInitialized
    });
  } catch (error) {
    console.error('[Inspections API] Error checking status:', error);
    res.status(500).json({ error: 'Failed to check status' });
  }
});

// ============================================================================
// INSPECTIONS
// ============================================================================

/**
 * POST /api/inspections
 * Create new inspection
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const pool = getPool(req);
    const userEmail = req.headers['x-user-email'] as string;

    if (!userEmail) {
      return res.status(401).json({ error: 'User email required' });
    }

    // Auto-initialize tables on first use
    if (!tablesInitialized) {
      try {
        await ensureTablesExist(pool);
        tablesInitialized = true;
      } catch (initError) {
        console.error('[Inspections API] Table initialization error:', initError);
        // Continue anyway - tables might already exist
      }
    }

    const userId = await getUserIdFromEmail(pool, userEmail);
    if (!userId) {
      return res.status(404).json({ error: 'User not found' });
    }

    const {
      job_id,
      property_address,
      customer_name,
      inspection_date,
      inspector_notes,
      weather_conditions,
      roof_type,
      roof_age,
    } = req.body;

    // Validation
    if (!property_address?.trim()) {
      return res.status(400).json({ error: 'Property address is required' });
    }
    if (!customer_name?.trim()) {
      return res.status(400).json({ error: 'Customer name is required' });
    }

    const result = await pool.query(
      `INSERT INTO inspections (
        user_id, job_id, property_address, customer_name,
        inspection_date, inspector_notes, weather_conditions,
        roof_type, roof_age, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft')
      RETURNING *`,
      [
        userId,
        job_id || null,
        property_address.trim(),
        customer_name.trim(),
        inspection_date || new Date(),
        inspector_notes || null,
        weather_conditions || null,
        roof_type || null,
        roof_age || null,
      ]
    );

    const inspection = result.rows[0];
    console.log('[Inspections API] Created inspection:', inspection.id);
    res.status(201).json({ inspection });
  } catch (error) {
    console.error('[Inspections API] Error creating inspection:', error);
    res.status(500).json({ error: 'Failed to create inspection' });
  }
});

/**
 * GET /api/inspections/:id
 * Get inspection details
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    const userEmail = req.headers['x-user-email'] as string;

    if (!userEmail) {
      return res.status(401).json({ error: 'User email required' });
    }

    const userId = await getUserIdFromEmail(pool, userEmail);
    if (!userId) {
      return res.status(404).json({ error: 'User not found' });
    }

    const result = await pool.query(
      `SELECT * FROM inspections WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Inspection not found' });
    }

    const inspection = result.rows[0];

    // Check ownership or admin
    const userCheck = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
    const isAdmin = userCheck.rows[0]?.role === 'admin';

    if (inspection.user_id !== userId && !isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ inspection });
  } catch (error) {
    console.error('[Inspections API] Error getting inspection:', error);
    res.status(500).json({ error: 'Failed to get inspection' });
  }
});

// ============================================================================
// PHOTOS
// ============================================================================

/**
 * POST /api/inspections/:id/photos
 * Upload photo to inspection (accepts base64)
 */
router.post('/:id/photos', async (req: Request, res: Response) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    const userEmail = req.headers['x-user-email'] as string;

    if (!userEmail) {
      return res.status(401).json({ error: 'User email required' });
    }

    const userId = await getUserIdFromEmail(pool, userEmail);
    if (!userId) {
      return res.status(404).json({ error: 'User not found' });
    }

    const {
      photo_data, // base64 string
      file_name,
      file_size,
      mime_type,
      category = 'other',
      notes,
    } = req.body;

    // Validation
    if (!photo_data) {
      return res.status(400).json({ error: 'Photo data is required' });
    }

    // Verify inspection exists and user owns it
    const inspectionCheck = await pool.query(
      'SELECT user_id FROM inspections WHERE id = $1',
      [id]
    );

    if (inspectionCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Inspection not found' });
    }

    const userCheck = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
    const isAdmin = userCheck.rows[0]?.role === 'admin';

    if (inspectionCheck.rows[0].user_id !== userId && !isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Store photo
    const result = await pool.query(
      `INSERT INTO inspection_photos (
        inspection_id, photo_data, file_name, file_size,
        mime_type, category, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        id,
        photo_data,
        file_name || 'photo.jpg',
        file_size || 0,
        mime_type || 'image/jpeg',
        category,
        notes || null,
      ]
    );

    // Update inspection photo count and status
    await pool.query(
      `UPDATE inspections
       SET photo_count = photo_count + 1,
           status = CASE WHEN status = 'draft' THEN 'in_progress' ELSE status END,
           updated_at = NOW()
       WHERE id = $1`,
      [id]
    );

    const photo = result.rows[0];
    console.log('[Inspections API] Added photo:', photo.id, 'to inspection:', id);
    res.status(201).json({ photo });
  } catch (error) {
    console.error('[Inspections API] Error uploading photo:', error);
    res.status(500).json({ error: 'Failed to upload photo' });
  }
});

/**
 * GET /api/inspections/:id/photos
 * List photos for inspection
 */
router.get('/:id/photos', async (req: Request, res: Response) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    const userEmail = req.headers['x-user-email'] as string;

    if (!userEmail) {
      return res.status(401).json({ error: 'User email required' });
    }

    const userId = await getUserIdFromEmail(pool, userEmail);
    if (!userId) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check access
    const inspectionCheck = await pool.query(
      'SELECT user_id FROM inspections WHERE id = $1',
      [id]
    );

    if (inspectionCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Inspection not found' });
    }

    const userCheck = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
    const isAdmin = userCheck.rows[0]?.role === 'admin';

    if (inspectionCheck.rows[0].user_id !== userId && !isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get photos
    const result = await pool.query(
      `SELECT
        id, inspection_id, file_name, file_size, mime_type,
        category, notes, ai_analysis, analyzed_at, created_at,
        photo_data
       FROM inspection_photos
       WHERE inspection_id = $1
       ORDER BY created_at ASC`,
      [id]
    );

    res.json({ photos: result.rows });
  } catch (error) {
    console.error('[Inspections API] Error listing photos:', error);
    res.status(500).json({ error: 'Failed to list photos' });
  }
});

// ============================================================================
// AI ANALYSIS
// ============================================================================

/**
 * POST /api/inspections/:id/analyze
 * Run AI analysis on all photos
 */
router.post('/:id/analyze', async (req: Request, res: Response) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    const userEmail = req.headers['x-user-email'] as string;

    if (!userEmail) {
      return res.status(401).json({ error: 'User email required' });
    }

    const userId = await getUserIdFromEmail(pool, userEmail);
    if (!userId) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check access
    const inspectionCheck = await pool.query(
      'SELECT user_id, property_address, customer_name, roof_type, roof_age FROM inspections WHERE id = $1',
      [id]
    );

    if (inspectionCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Inspection not found' });
    }

    const userCheck = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
    const isAdmin = userCheck.rows[0]?.role === 'admin';

    if (inspectionCheck.rows[0].user_id !== userId && !isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get unanalyzed photos
    const photosResult = await pool.query(
      `SELECT id, photo_data, file_name, mime_type, category
       FROM inspection_photos
       WHERE inspection_id = $1 AND ai_analysis IS NULL
       ORDER BY created_at ASC`,
      [id]
    );

    if (photosResult.rows.length === 0) {
      return res.json({
        message: 'All photos already analyzed',
        analyzed_count: 0,
      });
    }

    // Initialize Gemini AI
    const apiKey = getEnvKey('GOOGLE_AI_API_KEY') || getEnvKey('GEMINI_API_KEY');
    if (!apiKey || apiKey === 'PLACEHOLDER_API_KEY') {
      return res.status(500).json({ error: 'Gemini API key not configured' });
    }

    const genAI = new GoogleGenAI({ apiKey });
    const inspection = inspectionCheck.rows[0];
    let analyzedCount = 0;

    // Analyze each photo
    for (const photo of photosResult.rows) {
      try {
        const context = `
Property: ${inspection.property_address}
Customer: ${inspection.customer_name}
${inspection.roof_type ? `Roof Type: ${inspection.roof_type}` : ''}
${inspection.roof_age ? `Roof Age: ${inspection.roof_age} years` : ''}
Photo Category: ${photo.category}
        `.trim();

        const prompt = `You are Susan, an insurance claims specialist for Roof-ER. Analyze this roof damage photo and provide INSURANCE-FOCUSED guidance.

${context}

ANALYSIS REQUIREMENTS:
1. Damage Documentation (For Insurance Adjuster):
   - What specific covered peril caused this? (wind, hail, storm, falling object, etc.)
   - Is this sudden and accidental (covered) or gradual wear (not covered)?
   - Manufacturer defects vs. storm damage?
   - Code violations requiring upgrades?

2. Scope of Loss:
   - Affected area size and location
   - Repairable or requires replacement?
   - If repairable: Why it's not repairable
   - If replacement: What percentage of roof affected?

3. Matching & Code Arguments:
   - Shingles discontinued?
   - Can match color/texture/style?
   - Code upgrade triggers?
   - Aesthetic mismatch concerns?

FORMAT YOUR RESPONSE AS JSON:
{
  "damageDetected": true/false,
  "damageType": ["wind", "hail", "impact", etc.],
  "severity": "minor|moderate|severe|critical",
  "affectedArea": "Specific location with insurance terminology",
  "estimatedSize": "X sq ft or X% of total roof area",
  "claimViability": "strong|moderate|weak|none",
  "policyLanguage": "Exact phrase to use with adjuster",
  "insuranceArguments": [
    "Key argument for adjuster",
    "Another key argument"
  ],
  "recommendations": [
    "Action items for rep",
    "Next steps"
  ],
  "followUpQuestions": [
    "Questions needed to complete documentation"
  ],
  "urgency": "low|medium|high|urgent",
  "confidence": 0-100,
  "detailedAnalysis": "Insurance adjuster-focused analysis"
}`;

        const response = await genAI.models.generateContent({
          model: 'gemini-2.0-flash-exp',
          contents: [
            {
              role: 'user',
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType: photo.mime_type,
                    data: photo.photo_data.includes(',')
                      ? photo.photo_data.split(',')[1]
                      : photo.photo_data,
                  },
                },
              ],
            },
          ],
        });

        const responseText = response.text || '';

        // Try to extract JSON from response
        let analysis;
        try {
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            analysis = JSON.parse(jsonMatch[0]);
          } else {
            analysis = {
              damageDetected: false,
              rawResponse: responseText,
              error: 'Could not parse AI response',
            };
          }
        } catch (parseError) {
          analysis = {
            damageDetected: false,
            rawResponse: responseText,
            error: 'JSON parse error',
          };
        }

        // Update photo with analysis
        await pool.query(
          `UPDATE inspection_photos
           SET ai_analysis = $1, analyzed_at = NOW()
           WHERE id = $2`,
          [JSON.stringify(analysis), photo.id]
        );

        analyzedCount++;
      } catch (photoError) {
        console.error(`[Inspections API] Error analyzing photo ${photo.id}:`, photoError);
        // Continue with next photo
      }
    }

    // Update inspection
    await pool.query(
      `UPDATE inspections
       SET analyzed_photo_count = analyzed_photo_count + $1,
           status = 'completed',
           updated_at = NOW()
       WHERE id = $2`,
      [analyzedCount, id]
    );

    console.log('[Inspections API] Analyzed', analyzedCount, 'photos for inspection:', id);
    res.json({
      message: `Successfully analyzed ${analyzedCount} photos`,
      analyzed_count: analyzedCount,
    });
  } catch (error) {
    console.error('[Inspections API] Error analyzing photos:', error);
    res.status(500).json({ error: 'Failed to analyze photos' });
  }
});

// ============================================================================
// PRESENTATIONS
// ============================================================================

/**
 * POST /api/presentations
 * Generate presentation from inspection
 */
router.post('/presentations', async (req: Request, res: Response) => {
  try {
    const pool = getPool(req);
    const userEmail = req.headers['x-user-email'] as string;

    if (!userEmail) {
      return res.status(401).json({ error: 'User email required' });
    }

    const userId = await getUserIdFromEmail(pool, userEmail);
    if (!userId) {
      return res.status(404).json({ error: 'User not found' });
    }

    const {
      inspection_id,
      title,
      presentation_type = 'standard',
      branding,
    } = req.body;

    if (!inspection_id) {
      return res.status(400).json({ error: 'Inspection ID is required' });
    }

    // Get inspection details
    const inspectionResult = await pool.query(
      `SELECT * FROM inspections WHERE id = $1`,
      [inspection_id]
    );

    if (inspectionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Inspection not found' });
    }

    const inspection = inspectionResult.rows[0];

    // Check ownership
    const userCheck = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
    const isAdmin = userCheck.rows[0]?.role === 'admin';

    if (inspection.user_id !== userId && !isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get photos with analysis
    const photosResult = await pool.query(
      `SELECT * FROM inspection_photos
       WHERE inspection_id = $1
       ORDER BY created_at ASC`,
      [inspection_id]
    );

    // Generate slides
    const slides: PresentationSlide[] = [];
    let slideNumber = 1;

    // Cover slide
    slides.push({
      id: `slide-${slideNumber}`,
      slide_number: slideNumber++,
      slide_type: 'cover',
      title: title || `Roof Inspection - ${inspection.customer_name}`,
      content: `Property: ${inspection.property_address}\nInspection Date: ${new Date(inspection.inspection_date).toLocaleDateString()}`,
      layout: 'text-only',
    });

    // Photo slides with analysis
    for (const photo of photosResult.rows) {
      const analysis = photo.ai_analysis;

      slides.push({
        id: `slide-${slideNumber}`,
        slide_number: slideNumber++,
        slide_type: 'photo',
        title: `Photo ${photo.category.charAt(0).toUpperCase() + photo.category.slice(1)}`,
        content: photo.notes || '',
        photo_id: photo.id,
        photo_url: `data:${photo.mime_type};base64,${photo.photo_data}`,
        ai_insights: analysis,
        layout: 'split',
      });

      // Add analysis slide if available
      if (analysis && analysis.damageDetected) {
        slides.push({
          id: `slide-${slideNumber}`,
          slide_number: slideNumber++,
          slide_type: 'analysis',
          title: 'AI Analysis Results',
          content: analysis.detailedAnalysis || '',
          ai_insights: analysis,
          layout: 'text-only',
        });
      }
    }

    // Summary slide
    const damagePhotos = photosResult.rows.filter(p => p.ai_analysis?.damageDetected);
    const summaryContent = `
Total Photos: ${photosResult.rows.length}
Damage Detected: ${damagePhotos.length}
Overall Severity: ${damagePhotos.length > 0 ? 'Requires attention' : 'No significant damage'}
    `.trim();

    slides.push({
      id: `slide-${slideNumber}`,
      slide_number: slideNumber++,
      slide_type: 'summary',
      title: 'Inspection Summary',
      content: summaryContent,
      layout: 'text-only',
    });

    // Recommendations slide
    const allRecommendations = photosResult.rows
      .flatMap(p => p.ai_analysis?.recommendations || [])
      .filter((v, i, a) => a.indexOf(v) === i); // unique

    if (allRecommendations.length > 0) {
      slides.push({
        id: `slide-${slideNumber}`,
        slide_number: slideNumber++,
        slide_type: 'recommendations',
        title: 'Recommendations',
        content: allRecommendations.join('\n'),
        layout: 'text-only',
      });
    }

    // Contact slide
    slides.push({
      id: `slide-${slideNumber}`,
      slide_number: slideNumber++,
      slide_type: 'contact',
      title: 'Contact Information',
      content: branding?.contact_info || 'Contact us for more information',
      layout: 'text-only',
    });

    // Create presentation
    const result = await pool.query(
      `INSERT INTO presentations (
        inspection_id, user_id, title, customer_name,
        property_address, presentation_type, slides,
        branding, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft')
      RETURNING *`,
      [
        inspection_id,
        userId,
        title || `Roof Inspection - ${inspection.customer_name}`,
        inspection.customer_name,
        inspection.property_address,
        presentation_type,
        JSON.stringify(slides),
        branding ? JSON.stringify(branding) : null,
      ]
    );

    const presentation = result.rows[0];
    console.log('[Presentations API] Created presentation:', presentation.id);
    res.status(201).json({ presentation });
  } catch (error) {
    console.error('[Presentations API] Error creating presentation:', error);
    res.status(500).json({ error: 'Failed to create presentation' });
  }
});

/**
 * GET /api/presentations/:id
 * Get presentation with slides
 */
router.get('/presentations/:id', async (req: Request, res: Response) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    const userEmail = req.headers['x-user-email'] as string;

    if (!userEmail) {
      return res.status(401).json({ error: 'User email required' });
    }

    const userId = await getUserIdFromEmail(pool, userEmail);
    if (!userId) {
      return res.status(404).json({ error: 'User not found' });
    }

    const result = await pool.query(
      `SELECT * FROM presentations WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Presentation not found' });
    }

    const presentation = result.rows[0];

    // Check ownership or admin
    const userCheck = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
    const isAdmin = userCheck.rows[0]?.role === 'admin';

    if (presentation.user_id !== userId && !isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ presentation });
  } catch (error) {
    console.error('[Presentations API] Error getting presentation:', error);
    res.status(500).json({ error: 'Failed to get presentation' });
  }
});

/**
 * PUT /api/presentations/:id
 * Update presentation
 */
router.put('/presentations/:id', async (req: Request, res: Response) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    const userEmail = req.headers['x-user-email'] as string;

    if (!userEmail) {
      return res.status(401).json({ error: 'User email required' });
    }

    const userId = await getUserIdFromEmail(pool, userEmail);
    if (!userId) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check ownership
    const existing = await pool.query(
      'SELECT user_id FROM presentations WHERE id = $1',
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Presentation not found' });
    }

    const userCheck = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
    const isAdmin = userCheck.rows[0]?.role === 'admin';

    if (existing.rows[0].user_id !== userId && !isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const {
      title,
      presentation_type,
      slides,
      branding,
      status,
    } = req.body;

    const result = await pool.query(
      `UPDATE presentations SET
        title = COALESCE($1, title),
        presentation_type = COALESCE($2, presentation_type),
        slides = COALESCE($3, slides),
        branding = COALESCE($4, branding),
        status = COALESCE($5, status),
        updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [
        title,
        presentation_type,
        slides ? JSON.stringify(slides) : null,
        branding ? JSON.stringify(branding) : null,
        status,
        id,
      ]
    );

    const presentation = result.rows[0];
    console.log('[Presentations API] Updated presentation:', presentation.id);
    res.json({ presentation });
  } catch (error) {
    console.error('[Presentations API] Error updating presentation:', error);
    res.status(500).json({ error: 'Failed to update presentation' });
  }
});

/**
 * POST /api/presentations/:id/share
 * Share presentation (generates public link)
 */
router.post('/presentations/:id/share', async (req: Request, res: Response) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    const userEmail = req.headers['x-user-email'] as string;

    if (!userEmail) {
      return res.status(401).json({ error: 'User email required' });
    }

    const userId = await getUserIdFromEmail(pool, userEmail);
    if (!userId) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check ownership
    const existing = await pool.query(
      'SELECT user_id, share_token FROM presentations WHERE id = $1',
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Presentation not found' });
    }

    const userCheck = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
    const isAdmin = userCheck.rows[0]?.role === 'admin';

    if (existing.rows[0].user_id !== userId && !isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Generate share token if not exists
    let shareToken = existing.rows[0].share_token;
    if (!shareToken) {
      shareToken = generateShareToken();

      await pool.query(
        `UPDATE presentations
         SET share_token = $1, is_public = true, status = 'shared', updated_at = NOW()
         WHERE id = $2`,
        [shareToken, id]
      );
    } else {
      // Just mark as public if token exists
      await pool.query(
        `UPDATE presentations
         SET is_public = true, status = 'shared', updated_at = NOW()
         WHERE id = $1`,
        [id]
      );
    }

    const shareUrl = `${req.protocol}://${req.get('host')}/api/present/${shareToken}`;

    console.log('[Presentations API] Shared presentation:', id, 'token:', shareToken);
    res.json({
      share_url: shareUrl,
      share_token: shareToken,
    });
  } catch (error) {
    console.error('[Presentations API] Error sharing presentation:', error);
    res.status(500).json({ error: 'Failed to share presentation' });
  }
});

/**
 * GET /api/present/:token
 * Public presentation viewer endpoint
 */
router.get('/present/:token', async (req: Request, res: Response) => {
  try {
    const pool = getPool(req);
    const { token } = req.params;

    const result = await pool.query(
      `SELECT * FROM presentations WHERE share_token = $1 AND is_public = true`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Presentation not found or not public' });
    }

    // Increment view count
    await pool.query(
      `UPDATE presentations SET view_count = view_count + 1 WHERE id = $1`,
      [result.rows[0].id]
    );

    const presentation = result.rows[0];
    console.log('[Presentations API] Public view:', presentation.id);
    res.json({ presentation });
  } catch (error) {
    console.error('[Presentations API] Error viewing presentation:', error);
    res.status(500).json({ error: 'Failed to view presentation' });
  }
});

/**
 * POST /api/present/:token/analytics
 * Track viewer session analytics (no auth required)
 */
router.post('/present/:token/analytics', async (req: Request, res: Response) => {
  try {
    const pool = getPool(req);
    const { token } = req.params;
    const { timestamp, referrer, userAgent } = req.body;

    // Get presentation ID from token
    const result = await pool.query(
      `SELECT id FROM presentations WHERE share_token = $1 AND is_public = true`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Presentation not found' });
    }

    const presentationId = result.rows[0].id;

    // Store analytics data (you can create a presentation_views table if needed)
    // For now, we'll just log it
    console.log('[Presentations API] Viewer analytics:', {
      presentationId,
      timestamp,
      referrer,
      userAgent: userAgent?.substring(0, 100)
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[Presentations API] Error tracking analytics:', error);
    // Don't fail the presentation load if analytics fails
    res.json({ success: false });
  }
});

export default router;
