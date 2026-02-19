/**
 * QR Profile Routes
 * API endpoints for employee profile pages, QR codes, and public access
 */

import { Router, Request, Response } from 'express';
import type { Pool } from 'pg';
import crypto from 'crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Multer config for headshot uploads
const headshotStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(process.cwd(), 'public/uploads/headshots');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
  }
});

const videoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(process.cwd(), 'public/uploads/videos');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.mp4';
    cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
  }
});

const uploadHeadshot = multer({
  storage: headshotStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|heic/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype) || file.mimetype === 'image/heic';
    cb(null, ext || mime);
  }
});

const uploadVideo = multer({
  storage: videoStorage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
  fileFilter: (_req, file, cb) => {
    const allowed = /mp4|mov|webm|m4v/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = file.mimetype.startsWith('video/');
    cb(null, ext || mime);
  }
});

export interface EmployeeProfile {
  id: string;
  user_id: string | null;
  name: string;
  title: string | null;
  role_type: string;
  email: string | null;
  phone_number: string | null;
  bio: string | null;
  image_url: string | null;
  slug: string;
  start_year: number | null;
  is_active: boolean;
  is_claimed: boolean;
  referral_count: number;
  created_at: string;
  updated_at: string;
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function hashIP(ip: string): string {
  return crypto.createHash('sha256').update(ip + 'sa21-salt').digest('hex').substring(0, 16);
}

function getDeviceType(userAgent: string | undefined): string {
  if (!userAgent) return 'unknown';
  const ua = userAgent.toLowerCase();
  if (/mobile|android|iphone|ipad|ipod/.test(ua)) return 'mobile';
  if (/tablet/.test(ua)) return 'tablet';
  return 'desktop';
}

export function createProfileRoutes(pool: Pool) {
  const router = Router();

  // Helper: Check if user is admin
  async function isAdminUser(email?: string): Promise<boolean> {
    if (!email) return false;
    try {
      const result = await pool.query(
        'SELECT role FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
        [email]
      );
      return result.rows[0]?.role === 'admin';
    } catch (error) {
      console.error('❌ Profile admin check failed:', error);
      return false;
    }
  }

  // Helper: Check if feature is enabled
  async function isFeatureEnabled(key: string): Promise<boolean> {
    try {
      const result = await pool.query(
        'SELECT enabled FROM feature_flags WHERE key = $1 LIMIT 1',
        [key]
      );
      return result.rows[0]?.enabled === true;
    } catch (error) {
      // Table might not exist yet, default to false
      return false;
    }
  }

  // ==========================================================================
  // PUBLIC ENDPOINTS (No Auth Required)
  // ==========================================================================

  /**
   * GET /api/profiles/slug/:slug
   * Get profile by slug (public view for QR landing pages)
   */
  router.get('/slug/:slug', async (req: Request, res: Response) => {
    try {
      const { slug } = req.params;

      // Check if feature is enabled (or allow if admin)
      const userEmail = req.headers['x-user-email'] as string | undefined;
      const featureEnabled = await isFeatureEnabled('qr_profiles_enabled');
      const isAdmin = await isAdminUser(userEmail);

      if (!featureEnabled && !isAdmin) {
        return res.status(404).json({
          success: false,
          error: 'Profile not found'
        });
      }

      const result = await pool.query(
        `SELECT * FROM employee_profiles WHERE slug = $1 AND is_active = true LIMIT 1`,
        [slug]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Profile not found'
        });
      }

      const profile = result.rows[0];

      // Get videos for this profile
      const videosResult = await pool.query(
        `SELECT id, title, description, url, thumbnail_url, is_welcome_video, duration
         FROM profile_videos
         WHERE profile_id = $1
         ORDER BY display_order ASC`,
        [profile.id]
      );

      res.json({
        success: true,
        profile: {
          ...profile,
          videos: videosResult.rows
        }
      });
    } catch (error) {
      console.error('❌ Profile slug lookup error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to load profile'
      });
    }
  });

  /**
   * POST /api/profiles/contact
   * Submit contact form (lead capture) - Public endpoint
   */
  router.post('/contact', async (req: Request, res: Response) => {
    try {
      const {
        profileId,
        homeownerName,
        homeownerEmail,
        homeownerPhone,
        address,
        serviceType,
        message
      } = req.body;

      if (!homeownerName) {
        return res.status(400).json({
          success: false,
          error: 'Name is required'
        });
      }

      const result = await pool.query(
        `INSERT INTO profile_leads
         (profile_id, homeowner_name, homeowner_email, homeowner_phone, address, service_type, message, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'new')
         RETURNING id`,
        [profileId || null, homeownerName, homeownerEmail, homeownerPhone, address, serviceType, message]
      );

      res.json({
        success: true,
        leadId: result.rows[0].id,
        message: 'Thank you! We will contact you shortly.'
      });
    } catch (error) {
      console.error('❌ Lead submission error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to submit contact form'
      });
    }
  });

  /**
   * POST /api/profiles/track-scan
   * Track QR code scan - Public endpoint
   */
  router.post('/track-scan', async (req: Request, res: Response) => {
    try {
      const { profileSlug, source = 'qr' } = req.body;

      if (!profileSlug) {
        return res.status(400).json({
          success: false,
          error: 'Profile slug required'
        });
      }

      // Get profile ID
      const profileResult = await pool.query(
        'SELECT id FROM employee_profiles WHERE slug = $1 LIMIT 1',
        [profileSlug]
      );

      const profileId = profileResult.rows[0]?.id || null;
      const userAgent = req.headers['user-agent'] as string;
      const referrer = req.headers['referer'] as string;
      const ip = req.ip || req.headers['x-forwarded-for'] as string || '';

      await pool.query(
        `INSERT INTO qr_scans
         (profile_id, profile_slug, user_agent, referrer, ip_hash, device_type, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          profileId,
          profileSlug,
          userAgent?.substring(0, 500) || null,
          referrer?.substring(0, 500) || null,
          hashIP(ip),
          getDeviceType(userAgent),
          source
        ]
      );

      res.json({ success: true });
    } catch (error) {
      console.error('❌ Scan tracking error:', error);
      // Don't fail the user experience for tracking errors
      res.json({ success: true });
    }
  });

  // ==========================================================================
  // AUTHENTICATED ENDPOINTS
  // ==========================================================================

  /**
   * GET /api/profiles/me
   * Get current user's profile
   */
  router.get('/me', async (req: Request, res: Response) => {
    try {
      const userEmail = req.headers['x-user-email'] as string;

      if (!userEmail) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      // Get user ID
      const userResult = await pool.query(
        'SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
        [userEmail]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      const userId = userResult.rows[0].id;

      // Get profile linked to this user
      const result = await pool.query(
        'SELECT * FROM employee_profiles WHERE user_id = $1 LIMIT 1',
        [userId]
      );

      if (result.rows.length === 0) {
        return res.json({
          success: true,
          profile: null,
          message: 'No profile linked to your account'
        });
      }

      res.json({
        success: true,
        profile: result.rows[0]
      });
    } catch (error) {
      console.error('❌ Get my profile error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to load profile'
      });
    }
  });

  /**
   * PUT /api/profiles/me
   * Update current user's profile
   */
  router.put('/me', async (req: Request, res: Response) => {
    try {
      const userEmail = req.headers['x-user-email'] as string;

      if (!userEmail) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const { name, title, bio, phone_number, image_url, start_year } = req.body;

      // Get user ID
      const userResult = await pool.query(
        'SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
        [userEmail]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      const userId = userResult.rows[0].id;

      const result = await pool.query(
        `UPDATE employee_profiles
         SET name = COALESCE($1, name),
             title = COALESCE($2, title),
             bio = COALESCE($3, bio),
             phone_number = COALESCE($4, phone_number),
             image_url = COALESCE($5, image_url),
             start_year = COALESCE($6, start_year),
             updated_at = NOW()
         WHERE user_id = $7
         RETURNING *`,
        [name, title, bio, phone_number, image_url, start_year, userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'No profile linked to your account'
        });
      }

      res.json({
        success: true,
        profile: result.rows[0]
      });
    } catch (error) {
      console.error('❌ Update profile error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update profile'
      });
    }
  });

  /**
   * POST /api/profiles/claim/:id
   * Claim an unclaimed profile
   */
  router.post('/claim/:id', async (req: Request, res: Response) => {
    try {
      const userEmail = req.headers['x-user-email'] as string;
      const { id } = req.params;

      if (!userEmail) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      // Get user
      const userResult = await pool.query(
        'SELECT id, email FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
        [userEmail]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      const user = userResult.rows[0];

      // Check if user already has a profile
      const existingResult = await pool.query(
        'SELECT id FROM employee_profiles WHERE user_id = $1 LIMIT 1',
        [user.id]
      );

      if (existingResult.rows.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'You already have a claimed profile'
        });
      }

      // Get the profile to claim
      const profileResult = await pool.query(
        'SELECT * FROM employee_profiles WHERE id = $1 LIMIT 1',
        [id]
      );

      if (profileResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Profile not found'
        });
      }

      const profile = profileResult.rows[0];

      if (profile.is_claimed) {
        return res.status(400).json({
          success: false,
          error: 'This profile has already been claimed'
        });
      }

      // Verify email matches (case-insensitive)
      if (profile.email && profile.email.toLowerCase() !== user.email.toLowerCase()) {
        return res.status(403).json({
          success: false,
          error: 'Email does not match this profile'
        });
      }

      // Claim the profile
      const result = await pool.query(
        `UPDATE employee_profiles
         SET user_id = $1, is_claimed = TRUE, updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [user.id, id]
      );

      res.json({
        success: true,
        message: 'Profile claimed successfully',
        profile: result.rows[0]
      });
    } catch (error) {
      console.error('❌ Claim profile error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to claim profile'
      });
    }
  });

  // ==========================================================================
  // ADMIN ENDPOINTS
  // ==========================================================================

  /**
   * GET /api/profiles
   * List all profiles (admin only)
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const userEmail = req.headers['x-user-email'] as string;

      if (!await isAdminUser(userEmail)) {
        return res.status(403).json({
          success: false,
          error: 'Admin access required'
        });
      }

      const { status, claimed, search } = req.query;

      let query = 'SELECT * FROM employee_profiles WHERE 1=1';
      const params: any[] = [];
      let paramIndex = 1;

      if (status === 'active') {
        query += ` AND is_active = TRUE`;
      } else if (status === 'inactive') {
        query += ` AND is_active = FALSE`;
      }

      if (claimed === 'true') {
        query += ` AND is_claimed = TRUE`;
      } else if (claimed === 'false') {
        query += ` AND is_claimed = FALSE`;
      }

      if (search) {
        query += ` AND (LOWER(name) LIKE $${paramIndex} OR LOWER(email) LIKE $${paramIndex})`;
        params.push(`%${(search as string).toLowerCase()}%`);
        paramIndex++;
      }

      query += ' ORDER BY created_at DESC';

      const result = await pool.query(query, params);

      res.json({
        success: true,
        count: result.rows.length,
        profiles: result.rows
      });
    } catch (error) {
      console.error('❌ List profiles error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to list profiles'
      });
    }
  });

  /**
   * POST /api/profiles
   * Create new profile (admin only)
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const userEmail = req.headers['x-user-email'] as string;

      if (!await isAdminUser(userEmail)) {
        return res.status(403).json({
          success: false,
          error: 'Admin access required'
        });
      }

      const {
        name, title, email, phone_number, bio, image_url,
        role_type, start_year, slug: customSlug, user_id
      } = req.body;

      if (!name) {
        return res.status(400).json({
          success: false,
          error: 'Name is required'
        });
      }

      // Generate slug if not provided
      let slug = customSlug || generateSlug(name);

      // Check if slug exists
      const slugCheck = await pool.query(
        'SELECT id FROM employee_profiles WHERE slug = $1',
        [slug]
      );

      if (slugCheck.rows.length > 0) {
        // Add random suffix
        slug = `${slug}-${Math.random().toString(36).substring(2, 6)}`;
      }

      const result = await pool.query(
        `INSERT INTO employee_profiles
         (name, title, email, phone_number, bio, image_url, role_type, start_year, slug, user_id, is_claimed)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          name,
          title || null,
          email || null,
          phone_number || null,
          bio || null,
          image_url || null,
          role_type || 'sales_rep',
          start_year || null,
          slug,
          user_id || null,
          user_id ? true : false
        ]
      );

      res.json({
        success: true,
        profile: result.rows[0]
      });
    } catch (error) {
      console.error('❌ Create profile error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create profile'
      });
    }
  });

  /**
   * PUT /api/profiles/:id
   * Update profile (admin only)
   */
  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const userEmail = req.headers['x-user-email'] as string;
      const { id } = req.params;

      if (!await isAdminUser(userEmail)) {
        return res.status(403).json({
          success: false,
          error: 'Admin access required'
        });
      }

      const {
        name, title, email, phone_number, bio, image_url,
        role_type, start_year, slug, is_active, user_id
      } = req.body;

      const result = await pool.query(
        `UPDATE employee_profiles
         SET name = COALESCE($1, name),
             title = COALESCE($2, title),
             email = COALESCE($3, email),
             phone_number = COALESCE($4, phone_number),
             bio = COALESCE($5, bio),
             image_url = COALESCE($6, image_url),
             role_type = COALESCE($7, role_type),
             start_year = COALESCE($8, start_year),
             slug = COALESCE($9, slug),
             is_active = COALESCE($10, is_active),
             user_id = COALESCE($11, user_id),
             updated_at = NOW()
         WHERE id = $12
         RETURNING *`,
        [name, title, email, phone_number, bio, image_url, role_type, start_year, slug, is_active, user_id, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Profile not found'
        });
      }

      res.json({
        success: true,
        profile: result.rows[0]
      });
    } catch (error) {
      console.error('❌ Update profile error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update profile'
      });
    }
  });

  /**
   * DELETE /api/profiles/:id
   * Delete profile (admin only)
   */
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const userEmail = req.headers['x-user-email'] as string;
      const { id } = req.params;

      if (!await isAdminUser(userEmail)) {
        return res.status(403).json({
          success: false,
          error: 'Admin access required'
        });
      }

      const result = await pool.query(
        'DELETE FROM employee_profiles WHERE id = $1 RETURNING id',
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Profile not found'
        });
      }

      res.json({
        success: true,
        message: 'Profile deleted'
      });
    } catch (error) {
      console.error('❌ Delete profile error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete profile'
      });
    }
  });

  /**
   * POST /api/profiles/:id/reset-claim
   * Reset profile claim (admin only)
   */
  router.post('/:id/reset-claim', async (req: Request, res: Response) => {
    try {
      const userEmail = req.headers['x-user-email'] as string;
      const { id } = req.params;

      if (!await isAdminUser(userEmail)) {
        return res.status(403).json({
          success: false,
          error: 'Admin access required'
        });
      }

      const result = await pool.query(
        `UPDATE employee_profiles
         SET user_id = NULL, is_claimed = FALSE, updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Profile not found'
        });
      }

      res.json({
        success: true,
        message: 'Profile claim reset',
        profile: result.rows[0]
      });
    } catch (error) {
      console.error('❌ Reset claim error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to reset claim'
      });
    }
  });

  /**
   * POST /api/profiles/bulk-generate
   * Generate profiles for all SA21 users without profiles (admin only)
   */
  router.post('/bulk-generate', async (req: Request, res: Response) => {
    try {
      const userEmail = req.headers['x-user-email'] as string;

      if (!await isAdminUser(userEmail)) {
        return res.status(403).json({
          success: false,
          error: 'Admin access required'
        });
      }

      // Get users without profiles
      const usersResult = await pool.query(`
        SELECT u.id, u.email, u.name
        FROM users u
        LEFT JOIN employee_profiles ep ON ep.user_id = u.id
        WHERE ep.id IS NULL AND u.is_active = TRUE
      `);

      const users = usersResult.rows;
      let created = 0;
      const errors: string[] = [];

      for (const user of users) {
        try {
          const name = user.name || user.email.split('@')[0];
          let slug = generateSlug(name);

          // Check if slug exists
          const slugCheck = await pool.query(
            'SELECT id FROM employee_profiles WHERE slug = $1',
            [slug]
          );

          if (slugCheck.rows.length > 0) {
            slug = `${slug}-${Math.random().toString(36).substring(2, 6)}`;
          }

          await pool.query(
            `INSERT INTO employee_profiles
             (name, email, slug, user_id, is_claimed)
             VALUES ($1, $2, $3, $4, TRUE)`,
            [name, user.email, slug, user.id]
          );
          created++;
        } catch (err) {
          errors.push(`Failed to create profile for ${user.email}: ${(err as Error).message}`);
        }
      }

      res.json({
        success: true,
        message: `Generated ${created} profiles`,
        usersWithoutProfiles: users.length,
        profilesCreated: created,
        errors: errors.length > 0 ? errors : undefined
      });
    } catch (error) {
      console.error('❌ Bulk generate error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate profiles'
      });
    }
  });

  /**
   * GET /api/profiles/feature-status
   * Get QR profiles feature status (admin only)
   */
  router.get('/feature-status', async (req: Request, res: Response) => {
    try {
      const userEmail = req.headers['x-user-email'] as string;

      if (!await isAdminUser(userEmail)) {
        return res.status(403).json({
          success: false,
          error: 'Admin access required'
        });
      }

      const enabled = await isFeatureEnabled('qr_profiles_enabled');

      const statsResult = await pool.query(`
        SELECT
          COUNT(*) as total_profiles,
          COUNT(*) FILTER (WHERE is_active = TRUE) as active_profiles,
          COUNT(*) FILTER (WHERE is_claimed = TRUE) as claimed_profiles
        FROM employee_profiles
      `);

      const leadsResult = await pool.query(`
        SELECT COUNT(*) as total_leads
        FROM profile_leads
        WHERE created_at > NOW() - INTERVAL '30 days'
      `);

      const scansResult = await pool.query(`
        SELECT COUNT(*) as total_scans
        FROM qr_scans
        WHERE scanned_at > NOW() - INTERVAL '30 days'
      `);

      res.json({
        success: true,
        enabled,
        stats: {
          totalProfiles: parseInt(statsResult.rows[0].total_profiles),
          activeProfiles: parseInt(statsResult.rows[0].active_profiles),
          claimedProfiles: parseInt(statsResult.rows[0].claimed_profiles),
          leadsLast30Days: parseInt(leadsResult.rows[0].total_leads),
          scansLast30Days: parseInt(scansResult.rows[0].total_scans)
        }
      });
    } catch (error) {
      console.error('❌ Feature status error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get feature status'
      });
    }
  });

  /**
   * POST /api/profiles/toggle-feature
   * Enable/disable QR profiles feature (admin only)
   */
  router.post('/toggle-feature', async (req: Request, res: Response) => {
    try {
      const userEmail = req.headers['x-user-email'] as string;

      if (!await isAdminUser(userEmail)) {
        return res.status(403).json({
          success: false,
          error: 'Admin access required'
        });
      }

      const { enabled } = req.body;

      await pool.query(
        `UPDATE feature_flags SET enabled = $1, updated_at = NOW() WHERE key = 'qr_profiles_enabled'`,
        [enabled === true]
      );

      res.json({
        success: true,
        enabled: enabled === true,
        message: enabled ? 'QR profiles feature enabled' : 'QR profiles feature disabled'
      });
    } catch (error) {
      console.error('❌ Toggle feature error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to toggle feature'
      });
    }
  });

  // ============================================================================
  // IMAGE UPLOAD
  // ============================================================================

  /**
   * POST /api/profiles/:id/image
   * Upload headshot image for a profile — stores as base64 data URL in DB
   */
  router.post('/:id/image', uploadHeadshot.single('image'), async (req: Request, res: Response) => {
    try {
      const userEmail = req.headers['x-user-email'] as string;
      const { id } = req.params;

      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No image file provided' });
      }

      // Check admin or profile owner
      const isAdmin = await isAdminUser(userEmail);
      if (!isAdmin) {
        const ownerCheck = await pool.query(
          `SELECT id FROM employee_profiles WHERE id = $1 AND email = $2`,
          [id, userEmail]
        );
        if (ownerCheck.rows.length === 0) {
          fs.unlinkSync(req.file.path);
          return res.status(403).json({ success: false, error: 'Not authorized' });
        }
      }

      // Read file and convert to base64 data URL for DB storage (Railway has ephemeral filesystem)
      const fileBuffer = fs.readFileSync(req.file.path);
      const mimeType = req.file.mimetype || 'image/jpeg';
      const base64 = fileBuffer.toString('base64');
      const dataUrl = `data:${mimeType};base64,${base64}`;

      // Clean up temp file
      fs.unlinkSync(req.file.path);

      const result = await pool.query(
        `UPDATE employee_profiles SET image_url = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
        [dataUrl, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Profile not found' });
      }

      res.json({ success: true, profile: result.rows[0], imageUrl: dataUrl });
    } catch (error) {
      console.error('❌ Image upload error:', error);
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      res.status(500).json({ success: false, error: 'Failed to upload image' });
    }
  });

  // ============================================================================
  // VIDEO MANAGEMENT
  // ============================================================================

  /**
   * GET /api/profiles/:id/videos
   * List all videos for a profile
   */
  router.get('/:id/videos', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const result = await pool.query(
        `SELECT * FROM profile_videos WHERE profile_id = $1 ORDER BY display_order ASC, created_at DESC`,
        [id]
      );
      res.json({ success: true, videos: result.rows });
    } catch (error) {
      console.error('❌ Get videos error:', error);
      res.status(500).json({ success: false, error: 'Failed to get videos' });
    }
  });

  /**
   * POST /api/profiles/:id/videos
   * Add a video to a profile via URL (YouTube, Vimeo, direct MP4 link, etc.)
   * File uploads are not supported on Railway (ephemeral filesystem)
   */
  router.post('/:id/videos', async (req: Request, res: Response) => {
    try {
      const userEmail = req.headers['x-user-email'] as string;
      const { id } = req.params;

      const isAdmin = await isAdminUser(userEmail);
      if (!isAdmin) {
        const ownerCheck = await pool.query(
          `SELECT id FROM employee_profiles WHERE id = $1 AND email = $2`,
          [id, userEmail]
        );
        if (ownerCheck.rows.length === 0) {
          return res.status(403).json({ success: false, error: 'Not authorized' });
        }
      }

      const { title, description, video_url, url, is_welcome_video, duration, display_order } = req.body;
      const videoUrl = video_url || url;

      if (!videoUrl) {
        return res.status(400).json({ success: false, error: 'Video URL is required. Paste a YouTube, Vimeo, or direct MP4 link.' });
      }
      if (!title) {
        return res.status(400).json({ success: false, error: 'Title is required' });
      }

      const result = await pool.query(
        `INSERT INTO profile_videos (profile_id, title, description, url, is_welcome_video, duration, display_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [id, title, description || null, videoUrl, is_welcome_video === 'true' || is_welcome_video === true, duration ? parseInt(duration as string) : null, display_order ? parseInt(display_order as string) : 0]
      );

      res.json({ success: true, video: result.rows[0] });
    } catch (error) {
      console.error('❌ Add video error:', error);
      res.status(500).json({ success: false, error: 'Failed to add video' });
    }
  });

  /**
   * DELETE /api/profiles/:profileId/videos/:videoId
   * Remove a video
   */
  router.delete('/:profileId/videos/:videoId', async (req: Request, res: Response) => {
    try {
      const userEmail = req.headers['x-user-email'] as string;
      const { profileId, videoId } = req.params;

      const isAdmin = await isAdminUser(userEmail);
      if (!isAdmin) {
        return res.status(403).json({ success: false, error: 'Admin access required' });
      }

      // Delete file if local
      const videoResult = await pool.query(`SELECT url FROM profile_videos WHERE id = $1 AND profile_id = $2`, [videoId, profileId]);
      if (videoResult.rows[0]?.url?.startsWith('/uploads/')) {
        const filePath = path.join(process.cwd(), 'public', videoResult.rows[0].url);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }

      await pool.query(`DELETE FROM profile_videos WHERE id = $1 AND profile_id = $2`, [videoId, profileId]);
      res.json({ success: true, message: 'Video deleted' });
    } catch (error) {
      console.error('❌ Delete video error:', error);
      res.status(500).json({ success: false, error: 'Failed to delete video' });
    }
  });

  /**
   * POST /api/profiles/bulk-import
   * Bulk import profiles from JSON array
   */
  router.post('/bulk-import', async (req: Request, res: Response) => {
    try {
      const userEmail = req.headers['x-user-email'] as string;
      if (!await isAdminUser(userEmail)) {
        return res.status(403).json({ success: false, error: 'Admin access required' });
      }

      const { profiles } = req.body;
      if (!Array.isArray(profiles) || profiles.length === 0) {
        return res.status(400).json({ success: false, error: 'Profiles array required' });
      }

      const results = { created: 0, skipped: 0, errors: [] as string[] };

      for (const p of profiles) {
        try {
          if (!p.name) { results.skipped++; continue; }
          const slug = p.slug || generateSlug(p.name);

          // Skip if slug exists
          const existing = await pool.query(`SELECT id FROM employee_profiles WHERE slug = $1`, [slug]);
          if (existing.rows.length > 0) {
            results.skipped++;
            continue;
          }

          await pool.query(
            `INSERT INTO employee_profiles (name, title, role_type, email, phone_number, bio, image_url, slug, start_year, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [p.name, p.title || null, p.role_type || 'sales_rep', p.email || null, p.phone_number || null, p.bio || null, p.image_url || null, slug, p.start_year || null, p.is_active !== false]
          );
          results.created++;
        } catch (err: any) {
          results.errors.push(`${p.name}: ${err.message}`);
        }
      }

      res.json({ success: true, ...results });
    } catch (error) {
      console.error('❌ Bulk import error:', error);
      res.status(500).json({ success: false, error: 'Failed to bulk import' });
    }
  });

  return router;
}

export default createProfileRoutes;
