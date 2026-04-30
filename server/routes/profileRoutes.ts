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
import { createCalendarEvent } from '../services/googleCalendarService.js';
import { sendGmailEmail } from '../services/googleGmailService.js';

// Persistent uploads directory:
// - Railway: /app/data/uploads (Railway Volume, survives redeployments)
// - Local dev: ./public/uploads (local filesystem)
const isRailway = !!process.env.RAILWAY_ENVIRONMENT || !!process.env.RAILWAY_PROJECT_ID;
const UPLOADS_ROOT = isRailway ? '/app/data/uploads' : path.join(process.cwd(), 'public/uploads');
// Ensure directory tree exists on startup
try {
  fs.mkdirSync(path.join(UPLOADS_ROOT, 'headshots'), { recursive: true });
  fs.mkdirSync(path.join(UPLOADS_ROOT, 'videos'), { recursive: true });
  console.log(`📂 Uploads root: ${UPLOADS_ROOT} (railway=${isRailway})`);
} catch (e) {
  console.error('❌ Failed to create uploads dirs:', e);
}

// Service type labels for calendar events and emails
const SERVICE_LABELS: Record<string, string> = {
  roof_inspection: 'Roof Inspection',
  roof_repair: 'Roof Repair',
  roof_replacement: 'Roof Replacement',
  storm_damage: 'Storm Damage Assessment',
  siding: 'Siding',
  gutters: 'Gutters',
  windows_doors: 'Windows & Doors',
  solar: 'Solar',
  other: 'Service Request',
};

// Multer config for headshot uploads
const headshotStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(UPLOADS_ROOT, 'headshots');
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
    const dir = path.join(UPLOADS_ROOT, 'videos');
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

// JotForm webhooks send multipart/form-data with text fields only (no files).
// Express's default urlencoded parser ignores multipart, leaving req.body
// empty. multer().none() parses the text fields into req.body without
// accepting any file uploads. Bump fieldSize because `rawRequest` is a
// JSON-stringified blob of the full form payload (can exceed default 1MB
// when forms have many fields or long messages).
const jotformParser = multer({
  limits: { fieldSize: 5 * 1024 * 1024, fields: 200 },
}).none();

export { UPLOADS_ROOT };

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

  // Helper: Lead → Calendar + Gmail integrations
  //
  // Shared by /contact (in-app form) and /jotform-webhook (JotForm submissions)
  // so both paths produce identical artifacts: rep gets a notification email,
  // a calendar event is created if a date was provided, and a local
  // calendar_events row lands so the rep's CalendarPanel reflects the booking.
  //
  // Fire-and-forget — runs in its own async block so the caller can return
  // success to the client without waiting on Calendar/Gmail latency.
  function processLeadIntegrations(
    profileId: string,
    leadId: string,
    leadData: {
      homeownerName: string;
      homeownerEmail?: string | null;
      homeownerPhone?: string | null;
      address?: string | null;
      serviceType?: string | null;
      preferredDate?: string | null;
      preferredTime?: string | null;
      message?: string | null;
      sourceLabel?: string; // e.g. "QR code contact form" / "JotForm"
    },
  ): void {
    const sourceLabel = leadData.sourceLabel || 'QR code contact form';
    (async () => {
      try {
        const profileRow = await pool.query(
          'SELECT user_id, name, email FROM employee_profiles WHERE id = $1',
          [profileId],
        );
        const repUserId = profileRow.rows[0]?.user_id;
        const repName = profileRow.rows[0]?.name || 'Rep';
        const repEmail = profileRow.rows[0]?.email;
        if (!repUserId) return;

        // Resolve admin user once — used as fallback sender when rep hasn't
        // OAuth'd their Google account. Most reps are forgetful and will
        // never connect; admin's account is always live so we route through
        // it rather than dropping the email/invite.
        const adminEmailAddr = process.env.LEAD_ADMIN_EMAIL || 'ahmed.mahmoud@theroofdocs.com';
        const adminUserRow = await pool.query(
          'SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
          [adminEmailAddr],
        );
        const adminUserId: string | null = adminUserRow.rows[0]?.id || null;

        const serviceLabel = leadData.serviceType
          ? SERVICE_LABELS[leadData.serviceType] || leadData.serviceType.replace(/_/g, ' ')
          : 'Service Request';

        // 1) Calendar event if a date was provided
        if (leadData.preferredDate) {
          const startTime = leadData.preferredTime
            ? `${leadData.preferredDate}T${leadData.preferredTime}:00`
            : `${leadData.preferredDate}T09:00:00`;
          const start = new Date(startTime);
          const end = new Date(start.getTime() + 90 * 60 * 1000); // 90 min

          const eventDescription = [
            `Homeowner: ${leadData.homeownerName}`,
            leadData.homeownerEmail ? `Email: ${leadData.homeownerEmail}` : '',
            leadData.homeownerPhone ? `Phone: ${leadData.homeownerPhone}` : '',
            leadData.address ? `Address: ${leadData.address}` : '',
            leadData.message ? `\nNotes: ${leadData.message}` : '',
            `\nLead ID: ${leadId}`,
            `Scheduled via ${sourceLabel}`,
          ].filter(Boolean).join('\n');

          // Try the rep's connected Google Calendar first — preferred path
          // because the event lives on the rep's calendar where they expect it.
          let calResult = await createCalendarEvent(pool, repUserId, {
            summary: `${serviceLabel} - ${leadData.homeownerName}`,
            startTime: start.toISOString(),
            endTime: end.toISOString(),
            location: leadData.address || undefined,
            description: eventDescription,
            attendeeEmails: leadData.homeownerEmail ? [leadData.homeownerEmail] : undefined,
            timeZone: 'America/New_York',
          });

          if (calResult.success) {
            console.log(`[QR Lead] Google Calendar event created for rep=${repUserId} lead=${leadId} event=${calResult.eventId}`);
          } else {
            console.log(`[QR Lead] Google Calendar not available for rep=${repUserId}: ${calResult.error}`);

            // Fallback: create the event on admin's calendar, with both rep
            // and homeowner as attendees. Both still get Google Calendar
            // invites; the event just lives on admin's calendar instead of
            // the rep's. Reps can connect their own Google later for cleaner
            // attribution.
            if (adminUserId) {
              const fallbackAttendees: string[] = [];
              if (repEmail) fallbackAttendees.push(repEmail);
              if (leadData.homeownerEmail) fallbackAttendees.push(leadData.homeownerEmail);
              const adminCalResult = await createCalendarEvent(pool, adminUserId, {
                summary: `[${repName}] ${serviceLabel} - ${leadData.homeownerName}`,
                startTime: start.toISOString(),
                endTime: end.toISOString(),
                location: leadData.address || undefined,
                description: `Rep: ${repName} (not OAuth'd)\n\n${eventDescription}`,
                attendeeEmails: fallbackAttendees.length > 0 ? fallbackAttendees : undefined,
                timeZone: 'America/New_York',
              });
              if (adminCalResult.success) {
                console.log(`[QR Lead] Admin-fallback calendar event created lead=${leadId} event=${adminCalResult.eventId} attendees=${fallbackAttendees.join(',')}`);
                // Treat admin-fallback as success for the local-row link
                calResult = adminCalResult;
              } else {
                console.log(`[QR Lead] Admin-fallback calendar also failed: ${adminCalResult.error}`);
              }
            }
          }

          // Always create local calendar event (ensures it shows in CalendarPanel)
          try {
            await pool.query(
              `INSERT INTO calendar_events
               (user_id, summary, description, location, start_time, end_time, event_type, attendees, color, google_event_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
              [
                repUserId,
                `${serviceLabel} - ${leadData.homeownerName}`,
                eventDescription,
                leadData.address || null,
                start.toISOString(),
                end.toISOString(),
                'inspection',
                JSON.stringify(leadData.homeownerEmail
                  ? [{ email: leadData.homeownerEmail, name: leadData.homeownerName }]
                  : []),
                '#dc2626',
                calResult.success ? calResult.eventId : null,
              ],
            );
            console.log(`[QR Lead] Local calendar event created for rep=${repUserId} lead=${leadId}`);
          } catch (localCalErr) {
            console.error(`[QR Lead] Failed to create local calendar event:`, localCalErr);
          }
        }

        // 2) Notification email to the rep — try rep's Gmail first, then
        // fall back to admin's Gmail addressed to the rep's email so reps
        // who never connected Google still get notified.
        const repEmailBody = `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: #dc2626; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                <h2 style="margin: 0;">New Lead from QR Code</h2>
              </div>
              <div style="background: #1a1a1a; color: #e5e5e5; padding: 20px; border: 1px solid #333; border-top: none; border-radius: 0 0 8px 8px;">
                <p style="margin-top: 0;">Hey ${repName.split(' ')[0]}, you have a new lead!</p>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr><td style="padding: 8px 0; color: #999;">Name</td><td style="padding: 8px 0; font-weight: 600;">${leadData.homeownerName}</td></tr>
                  ${leadData.homeownerEmail ? `<tr><td style="padding: 8px 0; color: #999;">Email</td><td style="padding: 8px 0;">${leadData.homeownerEmail}</td></tr>` : ''}
                  ${leadData.homeownerPhone ? `<tr><td style="padding: 8px 0; color: #999;">Phone</td><td style="padding: 8px 0;">${leadData.homeownerPhone}</td></tr>` : ''}
                  ${leadData.address ? `<tr><td style="padding: 8px 0; color: #999;">Address</td><td style="padding: 8px 0;">${leadData.address}</td></tr>` : ''}
                  <tr><td style="padding: 8px 0; color: #999;">Service</td><td style="padding: 8px 0;">${serviceLabel}</td></tr>
                  ${leadData.preferredDate ? `<tr><td style="padding: 8px 0; color: #999;">Preferred Date</td><td style="padding: 8px 0; font-weight: 600;">${leadData.preferredDate}${leadData.preferredTime ? ` at ${leadData.preferredTime}` : ''}</td></tr>` : ''}
                  ${leadData.message ? `<tr><td style="padding: 8px 0; color: #999;">Message</td><td style="padding: 8px 0;">${leadData.message}</td></tr>` : ''}
                </table>
                ${leadData.preferredDate ? '<p style="color: #4ade80; margin-top: 16px;">A calendar event has been created for this appointment.</p>' : ''}
                <p style="margin-top: 16px; font-size: 13px; color: #666;">Sent from Susan AI Field Assistant — source: ${sourceLabel}</p>
              </div>
            </div>
          `;
        const repEmailSubject = `New Lead: ${leadData.homeownerName} - ${serviceLabel}`;

        let emailResult = await sendGmailEmail(pool, repUserId, {
          to: repEmail || 'me',
          subject: repEmailSubject,
          body: repEmailBody,
        });

        if (emailResult.success) {
          console.log(`[QR Lead] Notification email sent to rep=${repUserId} via own Gmail msgId=${emailResult.messageId}`);
        } else {
          console.log(`[QR Lead] Rep Gmail not available for rep=${repUserId}: ${emailResult.error}`);
          // Fallback: send via admin's Gmail to the rep's email address.
          if (adminUserId && repEmail) {
            const fallbackResult = await sendGmailEmail(pool, adminUserId, {
              to: repEmail,
              subject: repEmailSubject,
              body: repEmailBody,
            });
            if (fallbackResult.success) {
              console.log(`[QR Lead] Notification email sent via admin-fallback to ${repEmail} msgId=${fallbackResult.messageId}`);
              emailResult = fallbackResult;
            } else {
              console.log(`[QR Lead] Admin-fallback email also failed: ${fallbackResult.error}`);
            }
          } else if (!repEmail) {
            console.log(`[QR Lead] No rep email on file — skipping fallback send`);
          }
        }

        // 3) In-app notification on the rep's bell icon. Survives even if the
        // rep's Gmail isn't connected — admin (below) is the third backstop.
        // team_notifications.type has a CHECK constraint limiting it to
        // mention/direct_message/shared_content/system — we use 'system'
        // and put the new_lead semantics in the data JSON.
        try {
          await pool.query(
            `INSERT INTO team_notifications (user_id, type, title, body, data, created_at)
             VALUES ($1, 'system', $2, $3, $4, NOW())`,
            [
              repUserId,
              `New lead: ${leadData.homeownerName}`,
              [
                `${serviceLabel} request from ${leadData.homeownerName}`,
                leadData.homeownerPhone ? `Phone: ${leadData.homeownerPhone}` : '',
                leadData.address ? `Address: ${leadData.address}` : '',
                leadData.preferredDate ? `Appointment: ${leadData.preferredDate}${leadData.preferredTime ? ` at ${leadData.preferredTime}` : ''}` : '',
              ].filter(Boolean).join(' · '),
              JSON.stringify({ kind: 'new_lead', lead_id: leadId, source: sourceLabel }),
            ],
          );
          console.log(`[QR Lead] In-app notification inserted for rep=${repUserId}`);
        } catch (notifErr) {
          console.error(`[QR Lead] Failed to insert in-app notification:`, notifErr);
        }

        // 4) Admin BCC email — every lead, regardless of rep Gmail state.
        // adminUserId / adminEmailAddr resolved once at top of fn for reuse
        // by the calendar + email fallbacks above.
        try {
          if (adminUserId) {
            const adminResult = await sendGmailEmail(pool, adminUserId, {
              to: adminEmailAddr,
              subject: `[Lead] ${leadData.homeownerName} → ${repName} (${sourceLabel})`,
              body: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
                  <div style="background: #1a1a1a; color: white; padding: 16px; border-radius: 8px 8px 0 0;">
                    <h3 style="margin: 0; font-size: 16px;">Admin copy — new ${sourceLabel} lead</h3>
                  </div>
                  <div style="background: white; color: #1a1a1a; padding: 16px; border: 1px solid #e5e5e5; border-top: none; border-radius: 0 0 8px 8px;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                      <tr><td style="padding: 6px 0; color: #666;">Rep</td><td style="padding: 6px 0; font-weight: 600;">${repName}</td></tr>
                      <tr><td style="padding: 6px 0; color: #666;">Homeowner</td><td style="padding: 6px 0; font-weight: 600;">${leadData.homeownerName}</td></tr>
                      ${leadData.homeownerEmail ? `<tr><td style="padding: 6px 0; color: #666;">Email</td><td style="padding: 6px 0;">${leadData.homeownerEmail}</td></tr>` : ''}
                      ${leadData.homeownerPhone ? `<tr><td style="padding: 6px 0; color: #666;">Phone</td><td style="padding: 6px 0;">${leadData.homeownerPhone}</td></tr>` : ''}
                      ${leadData.address ? `<tr><td style="padding: 6px 0; color: #666;">Address</td><td style="padding: 6px 0;">${leadData.address}</td></tr>` : ''}
                      <tr><td style="padding: 6px 0; color: #666;">Service</td><td style="padding: 6px 0;">${serviceLabel}</td></tr>
                      ${leadData.preferredDate ? `<tr><td style="padding: 6px 0; color: #666;">Appointment</td><td style="padding: 6px 0;">${leadData.preferredDate}${leadData.preferredTime ? ` at ${leadData.preferredTime}` : ''}</td></tr>` : ''}
                    </table>
                    <p style="margin-top: 12px; font-size: 12px; color: #999;">Lead ID: ${leadId}</p>
                  </div>
                </div>
              `,
            });
            if (adminResult.success) {
              console.log(`[QR Lead] Admin BCC sent msgId=${adminResult.messageId}`);
            } else {
              console.log(`[QR Lead] Admin BCC skipped: ${adminResult.error}`);
            }
          }
        } catch (adminErr) {
          console.error(`[QR Lead] Admin BCC failed:`, adminErr);
        }
      } catch (err) {
        console.error('[QR Lead] Calendar/Email integration error:', err);
      }
    })();
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
        preferredDate,
        preferredTime,
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
         (profile_id, homeowner_name, homeowner_email, homeowner_phone, address, service_type, preferred_date, preferred_time, message, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'new')
         RETURNING id`,
        [profileId || null, homeownerName, homeownerEmail, homeownerPhone, address, serviceType, preferredDate || null, preferredTime || null, message]
      );

      const leadId = result.rows[0].id;

      // Calendar + Gmail integrations run async in their own block so the
      // client gets a quick success response. Both /contact and the JotForm
      // webhook share processLeadIntegrations() so leads from either path
      // produce identical artifacts (rep email, local + Google calendar
      // events). See the helper definition for behavior.
      if (profileId) {
        processLeadIntegrations(profileId, leadId, {
          homeownerName,
          homeownerEmail,
          homeownerPhone,
          address,
          serviceType,
          preferredDate,
          preferredTime,
          message,
          sourceLabel: 'QR code contact form',
        });
      }

      res.json({
        success: true,
        leadId,
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
   * POST /api/profiles/jotform-webhook
   * JotForm submission ingest — public endpoint configured in JotForm's
   * webhooks settings ("Settings → Integrations → Webhooks").
   *
   * JotForm posts multipart/form-data with these top-level keys:
   *   - submissionID, formID, ip, formTitle, username, customParams
   *   - rawRequest (JSON-stringified): the actual form fields keyed by their
   *     internal field names (q3_name, q4_email, etc.) plus our prefilled
   *     URL params (howDid, provideComments).
   *   - pretty: human-readable "Field Label:Value, ..." string
   *
   * We extract:
   *   - Homeowner contact details from the rawRequest fields (matched by
   *     fuzzy field names since JotForm doesn't guarantee key shape).
   *   - The rep slug from `provideComments`, which we prefill on the
   *     iframe URL as "Rep: {Name} ({slug})".
   *   - Then look up profile_id from slug, insert into profile_leads, and
   *     call the shared processLeadIntegrations helper.
   *
   * Idempotency: ON CONFLICT (jotform_submission_id) DO NOTHING — JotForm
   * retries on failures and we don't want duplicate leads or double
   * calendar events.
   */
  router.post('/jotform-webhook', jotformParser, async (req: Request, res: Response) => {
    try {
      // Shared-secret check. JotForm doesn't sign webhooks, so we lock down
      // the endpoint with a query-param key. When JOTFORM_WEBHOOK_SECRET is
      // unset (initial rollout), all requests are accepted so we don't break
      // the existing flow before the JotForm dashboard URL is updated.
      const requiredSecret = process.env.JOTFORM_WEBHOOK_SECRET;
      if (requiredSecret) {
        const providedKey = String(req.query.key || req.header('x-jotform-key') || '');
        if (providedKey !== requiredSecret) {
          console.warn(
            `[JotForm Webhook] rejected — bad/missing key from ip=${req.ip}`,
          );
          return res.status(401).json({ success: false, error: 'unauthorized' });
        }
      }

      const body = (req.body || {}) as Record<string, any>;

      // JotForm sends the actual fields under `rawRequest` as a JSON string.
      // Some integrations also send fields directly on the body — fall back
      // gracefully so we capture as much as possible regardless of payload
      // shape. JotForm has been known to vary this between webhook versions.
      let rawRequest: Record<string, any> = {};
      if (typeof body.rawRequest === 'string') {
        try { rawRequest = JSON.parse(body.rawRequest); }
        catch { rawRequest = {}; }
      } else if (body.rawRequest && typeof body.rawRequest === 'object') {
        rawRequest = body.rawRequest as Record<string, any>;
      }

      const fields: Record<string, any> = { ...body, ...rawRequest };
      const submissionID = String(body.submissionID || rawRequest.submissionID || '').trim();
      const formID = String(body.formID || '').trim();

      // JotForm field-name fuzzy matcher. Field keys look like:
      //   q3_name, q4_email, q5_phoneNumber, q6_typeA, q7_address, q8_message,
      //   plus our prefilled `howDid` and `provideComments`.
      // We pluck by the conceptual name (the suffix), not the q-prefix
      // number, so this still works if the form layout changes.
      const findField = (...candidates: string[]): string | null => {
        for (const cand of candidates) {
          const lower = cand.toLowerCase();
          for (const [key, value] of Object.entries(fields)) {
            const keyLower = key.toLowerCase();
            // Match exact suffix (after q{N}_) or full-name match
            const suffix = keyLower.replace(/^q\d+_/, '');
            if (suffix === lower || keyLower === lower) {
              if (value === null || value === undefined) continue;
              if (typeof value === 'string' && value.trim() === '') continue;
              if (typeof value === 'object') {
                // Compound fields (e.g. name = {first, last}) — flatten
                const flat = Object.values(value)
                  .filter((v) => typeof v === 'string' && v.trim() !== '')
                  .join(' ').trim();
                if (flat) return flat;
                continue;
              }
              return String(value).trim();
            }
          }
        }
        return null;
      };

      // typeA / typeB / typeC are JotForm's internal widget names for compound
      // fields like "Full Name" (typeA = {first, last}) — surfaces as q8_typeA
      // in this form's payload. We try concrete labels first, then the typeX
      // family, then a firstName/lastName fallback.
      const homeownerName =
        findField('name', 'fullName', 'homeownerName', 'yourName') ||
        findField('typeA', 'typeB', 'typeC') ||
        [findField('firstName', 'first'), findField('lastName', 'last')].filter(Boolean).join(' ').trim() ||
        '';
      // Email: must contain @ and a dot. Drop garbage rather than store junk.
      // Phone: keep only digits, format US numbers as (XXX) XXX-XXXX. Foreign
      // or partial numbers fall through as the digit string so we don't lose
      // data — the lead still saves.
      const rawEmail = findField('email', 'emailAddress', 'homeownerEmail');
      const homeownerEmail = (() => {
        if (!rawEmail) return null;
        const trimmed = String(rawEmail).trim().toLowerCase();
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : null;
      })();
      const rawPhone = findField('phone', 'phoneNumber', 'homeownerPhone', 'tel', 'mobile');
      const homeownerPhone = (() => {
        if (!rawPhone) return null;
        const digits = String(rawPhone).replace(/\D/g, '');
        if (digits.length === 10) return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
        if (digits.length === 11 && digits.startsWith('1')) {
          const d = digits.slice(1);
          return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
        }
        return digits || null;
      })();

      const addressFull = findField('address', 'streetAddress', 'fullAddress', 'propertyAddress');
      const message = findField('message', 'comments', 'notes', 'additionalInfo', 'inquiry');
      const provideComments = findField('provideComments', 'comments') || '';
      const howDid = findField('howDid', 'howDidYouHear');
      const referralName = findField('provideName', 'referralName', 'nameOfReferral');

      // Service type: try matching against our known service labels first.
      // `selectThe` is this form's checkbox group ("Select the areas...").
      const rawService = (findField('service', 'serviceType', 'typeOfService', 'requestType', 'selectThe') || '').toLowerCase();
      let serviceType: string | null = null;
      for (const [key, label] of Object.entries(SERVICE_LABELS)) {
        if (rawService.includes(key.replace(/_/g, ' ')) || rawService.includes(label.toLowerCase())) {
          serviceType = key;
          break;
        }
      }

      // Date/time fields are tricky in JotForm.
      // The Appointment widget surfaces as a single composite string like:
      //   "new 2026-05-05 09:00 60 America/New_York (GMT-04:00)"
      // The DB column is `date`, so we have to extract YYYY-MM-DD or PG
      // throws "invalid input syntax for type date" and the whole row fails.
      // Other compound widgets come through findField pre-flattened.
      const rawApptStr = findField('preferredDate', 'date', 'datetime', 'inspectionDate', 'appointment') || '';
      let preferredDateRaw: string | null = null;
      let preferredTimeRaw: string | null = findField('preferredTime', 'time', 'inspectionTime');
      if (rawApptStr) {
        // Match YYYY-MM-DD anywhere in the string
        const dateMatch = rawApptStr.match(/(\d{4}-\d{2}-\d{2})/);
        if (dateMatch) preferredDateRaw = dateMatch[1];
        // Match HH:MM (24-hr) — but only if no time was already extracted
        if (!preferredTimeRaw) {
          const timeMatch = rawApptStr.match(/\b(\d{1,2}:\d{2})\b/);
          if (timeMatch) preferredTimeRaw = timeMatch[1];
        }
        // If no date matched, fall back to null (don't pass garbage to PG)
        if (!preferredDateRaw && !preferredTimeRaw) {
          console.warn(`[JotForm Webhook] could not parse appointment string: ${rawApptStr.slice(0, 100)}`);
        }
      }

      // Rep attribution: prefer the hidden repSlug field (tamper-proof) added
      // to the JotForm form. Fall back to regex on provideComments for any
      // submissions that came in before the hidden field was added.
      const repSlugDirect = findField('repSlug', 'rep_slug', 'repslug');
      const repSlugMatch = provideComments.match(/\(([a-z0-9-]+)\)\s*$/i);
      const repSlug = repSlugDirect || (repSlugMatch ? repSlugMatch[1] : null);

      let profileId: string | null = null;
      if (repSlug) {
        const profileRow = await pool.query(
          'SELECT id FROM employee_profiles WHERE slug = $1 AND is_active = true LIMIT 1',
          [repSlug],
        );
        profileId = profileRow.rows[0]?.id || null;
      }

      // Bare minimum: a name. JotForm's required-field validation should
      // ensure this on the form side, but defend in code anyway.
      if (!homeownerName) {
        // Dump the body shape so we can fix the fuzzy-matcher when JotForm
        // ships a new field-naming convention. body.rawRequest may be
        // a JSON string, an object, or absent — log all three views.
        const bodyKeys = Object.keys(body);
        const fieldKeys = Object.keys(fields);
        const sample: Record<string, any> = {};
        for (const k of fieldKeys.slice(0, 20)) {
          const v = (fields as any)[k];
          sample[k] = typeof v === 'string' ? v.slice(0, 100) : v;
        }
        console.warn(
          `[JotForm Webhook] missing homeowner name — submissionID=${submissionID} formID=${formID} repSlug=${repSlug}\n` +
          `  bodyKeys=${JSON.stringify(bodyKeys)}\n` +
          `  fieldKeys=${JSON.stringify(fieldKeys)}\n` +
          `  sample=${JSON.stringify(sample)}`,
        );
        return res.status(400).json({ success: false, error: 'Missing homeowner name' });
      }

      // Idempotency: dedup on submissionID via partial unique index. We
      // have to spell out the predicate in ON CONFLICT because the index
      // is partial (WHERE jotform_submission_id IS NOT NULL) — PG uses the
      // predicate to pick the right index for the conflict check. If
      // submissionID is empty (rare — JotForm should always send one)
      // we skip the dedup branch and just insert.
      const insertSql = submissionID
        ? `INSERT INTO profile_leads (
             profile_id, homeowner_name, homeowner_email, homeowner_phone,
             address, service_type, preferred_date, preferred_time, message, status,
             jotform_submission_id, jotform_form_id, raw_payload, source,
             how_did_hear, referral_name
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'new', $10, $11, $12::jsonb, 'jotform', $13, $14)
           ON CONFLICT (jotform_submission_id) WHERE jotform_submission_id IS NOT NULL DO NOTHING
           RETURNING id`
        : `INSERT INTO profile_leads (
             profile_id, homeowner_name, homeowner_email, homeowner_phone,
             address, service_type, preferred_date, preferred_time, message, status,
             jotform_submission_id, jotform_form_id, raw_payload, source,
             how_did_hear, referral_name
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'new', $10, $11, $12::jsonb, 'jotform', $13, $14)
           RETURNING id`;
      const insertResult = await pool.query(insertSql,
        [
          profileId,
          homeownerName,
          homeownerEmail || null,
          homeownerPhone || null,
          addressFull || null,
          serviceType,
          preferredDateRaw || null,
          preferredTimeRaw || null,
          message || null,
          submissionID || null,
          formID || null,
          JSON.stringify({ ...body, rawRequest: undefined, rawRequestParsed: rawRequest }),
          howDid || null,
          referralName || null,
        ],
      );

      // ON CONFLICT skip → no row returned. Ack OK, log it.
      if (insertResult.rowCount === 0) {
        console.log(
          `[JotForm Webhook] duplicate submission skipped — submissionID=${submissionID}`,
        );
        return res.json({ success: true, deduped: true });
      }

      const leadId = insertResult.rows[0].id;
      console.log(
        `[JotForm Webhook] new lead — submissionID=${submissionID} leadId=${leadId} ` +
        `rep=${repSlug || 'unknown'} name="${homeownerName}"`,
      );

      // Wire calendar + email via the same helper /contact uses, so JotForm
      // and in-app submissions land identically in the rep's inbox + calendar.
      if (profileId) {
        processLeadIntegrations(profileId, leadId, {
          homeownerName,
          homeownerEmail,
          homeownerPhone,
          address: addressFull,
          serviceType,
          preferredDate: preferredDateRaw,
          preferredTime: preferredTimeRaw,
          message,
          sourceLabel: 'JotForm',
        });
      }

      res.json({ success: true, leadId });
    } catch (error) {
      console.error('❌ JotForm webhook error:', error);
      res.status(500).json({ success: false, error: 'Webhook processing failed' });
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

  /**
   * POST /api/profiles/track-share
   * Track when a homeowner shares a rep's profile/QR — public endpoint.
   * shareType: 'native' | 'copy_link' | 'sms' | 'email' | 'social'
   */
  router.post('/track-share', async (req: Request, res: Response) => {
    try {
      const { profileSlug, shareType = 'native' } = req.body;
      if (!profileSlug) return res.status(400).json({ success: false, error: 'Profile slug required' });

      const profileResult = await pool.query(
        'SELECT id FROM employee_profiles WHERE slug = $1 LIMIT 1',
        [profileSlug],
      );
      const profileId = profileResult.rows[0]?.id || null;
      const userAgent = (req.headers['user-agent'] as string) || '';
      const ip = req.ip || ((req.headers['x-forwarded-for'] as string) || '');

      await pool.query(
        `INSERT INTO profile_shares (profile_id, profile_slug, share_type, user_agent, ip_hash)
         VALUES ($1, $2, $3, $4, $5)`,
        [profileId, profileSlug, shareType, userAgent.substring(0, 500), hashIP(ip)],
      );
      res.json({ success: true });
    } catch (error) {
      console.error('❌ Share tracking error:', error);
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
   * Upload headshot image for a profile — saves to persistent volume
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

      const imageUrl = `/uploads/headshots/${req.file.filename}`;

      // Delete old file if exists on volume
      const oldResult = await pool.query(`SELECT image_url FROM employee_profiles WHERE id = $1`, [id]);
      const oldUrl = oldResult.rows[0]?.image_url;
      if (oldUrl?.startsWith('/uploads/')) {
        const oldPath = path.join(UPLOADS_ROOT, oldUrl.replace('/uploads/', ''));
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }

      const result = await pool.query(
        `UPDATE employee_profiles SET image_url = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
        [imageUrl, id]
      );

      if (result.rows.length === 0) {
        fs.unlinkSync(req.file.path);
        return res.status(404).json({ success: false, error: 'Profile not found' });
      }

      console.log(`✅ Headshot uploaded for profile ${id}: ${imageUrl} (stored at ${UPLOADS_ROOT})`);
      res.json({ success: true, profile: result.rows[0], imageUrl });
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
   * Add a video to a profile — supports file upload OR URL
   * Files are stored on Railway persistent volume
   */
  router.post('/:id/videos', uploadVideo.single('video'), async (req: Request, res: Response) => {
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
          if (req.file) fs.unlinkSync(req.file.path);
          return res.status(403).json({ success: false, error: 'Not authorized' });
        }
      }

      const { title, description, video_url, url, is_welcome_video, duration, display_order } = req.body;
      const videoUrl = req.file ? `/uploads/videos/${req.file.filename}` : (video_url || url);

      if (!videoUrl) {
        return res.status(400).json({ success: false, error: 'Please upload a video file or provide a URL' });
      }
      if (!title) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(400).json({ success: false, error: 'Title is required' });
      }

      const isWelcome = is_welcome_video === 'true' || is_welcome_video === true;

      // If this is a welcome video, delete any existing welcome video for this profile first
      // so we never have two welcome-video rows for the same rep.
      if (isWelcome) {
        await pool.query(
          `DELETE FROM profile_videos WHERE profile_id = $1 AND is_welcome_video = true`,
          [id]
        );
      }

      const result = await pool.query(
        `INSERT INTO profile_videos (profile_id, title, description, url, is_welcome_video, duration, display_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [id, title, description || null, videoUrl, isWelcome, duration ? parseInt(duration as string) : null, display_order ? parseInt(display_order as string) : 0]
      );

      console.log(`✅ Video added for profile ${id}: ${videoUrl} (volume: ${UPLOADS_ROOT})`);
      res.json({ success: true, video: result.rows[0] });
    } catch (error) {
      console.error('❌ Add video error:', error);
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
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

  // ==========================================================================
  // REVIEWS — admin curates per-rep + global testimonials shown on /profile/:slug
  // ==========================================================================

  /**
   * GET /api/profiles/reviews/global
   * List the global fallback reviews (profile_id IS NULL).
   * Public-readable so the renderer can fall back, but admin gets full set.
   */
  router.get('/reviews/global', async (_req: Request, res: Response) => {
    try {
      const r = await pool.query(
        `SELECT id, profile_id, text, author, date_label, source, source_url, rating, display_order, is_active, created_at
           FROM profile_reviews
          WHERE profile_id IS NULL
          ORDER BY display_order ASC, created_at ASC`,
      );
      res.json({ success: true, reviews: r.rows });
    } catch (error) {
      console.error('❌ Global reviews list error:', error);
      res.status(500).json({ success: false, error: 'Failed to load reviews' });
    }
  });

  /**
   * GET /api/profiles/:id/reviews
   * List reviews curated for a specific rep. Admin-only because this exposes
   * is_active rows and ordering; the public renderer pulls reviews via the
   * SSR /profile/:slug handler instead.
   */
  router.get('/:id/reviews', async (req: Request, res: Response) => {
    try {
      const userEmail = req.headers['x-user-email'] as string;
      if (!(await isAdminUser(userEmail))) {
        return res.status(403).json({ success: false, error: 'Admin access required' });
      }
      const r = await pool.query(
        `SELECT id, profile_id, text, author, date_label, source, source_url, rating, display_order, is_active, created_at
           FROM profile_reviews
          WHERE profile_id = $1
          ORDER BY display_order ASC, created_at ASC`,
        [req.params.id],
      );
      res.json({ success: true, reviews: r.rows });
    } catch (error) {
      console.error('❌ Profile reviews list error:', error);
      res.status(500).json({ success: false, error: 'Failed to load reviews' });
    }
  });

  /**
   * POST /api/profiles/:id/reviews
   * Create a review for a rep. Pass `:id = "global"` to create a global row.
   */
  router.post('/:id/reviews', async (req: Request, res: Response) => {
    try {
      const userEmail = req.headers['x-user-email'] as string;
      if (!(await isAdminUser(userEmail))) {
        return res.status(403).json({ success: false, error: 'Admin access required' });
      }
      const profileIdParam = req.params.id === 'global' ? null : req.params.id;
      const { text, author, date_label, source, source_url, rating, display_order } = req.body || {};
      if (!text || !author) {
        return res.status(400).json({ success: false, error: 'text and author are required' });
      }
      const r = await pool.query(
        `INSERT INTO profile_reviews (profile_id, text, author, date_label, source, source_url, rating, display_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          profileIdParam,
          String(text).trim(),
          String(author).trim(),
          date_label || null,
          source || 'google',
          source_url || null,
          Number.isFinite(rating) ? rating : 5,
          Number.isFinite(display_order) ? display_order : 0,
        ],
      );
      res.json({ success: true, review: r.rows[0] });
    } catch (error) {
      console.error('❌ Profile review create error:', error);
      res.status(500).json({ success: false, error: 'Failed to create review' });
    }
  });

  /**
   * PUT /api/profiles/reviews/:reviewId
   * Update any field on an existing review.
   */
  router.put('/reviews/:reviewId', async (req: Request, res: Response) => {
    try {
      const userEmail = req.headers['x-user-email'] as string;
      if (!(await isAdminUser(userEmail))) {
        return res.status(403).json({ success: false, error: 'Admin access required' });
      }
      const { text, author, date_label, source, source_url, rating, display_order, is_active } = req.body || {};
      const r = await pool.query(
        `UPDATE profile_reviews SET
           text = COALESCE($2, text),
           author = COALESCE($3, author),
           date_label = COALESCE($4, date_label),
           source = COALESCE($5, source),
           source_url = COALESCE($6, source_url),
           rating = COALESCE($7, rating),
           display_order = COALESCE($8, display_order),
           is_active = COALESCE($9, is_active),
           updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [
          req.params.reviewId,
          text != null ? String(text).trim() : null,
          author != null ? String(author).trim() : null,
          date_label != null ? date_label : null,
          source != null ? source : null,
          source_url != null ? source_url : null,
          Number.isFinite(rating) ? rating : null,
          Number.isFinite(display_order) ? display_order : null,
          typeof is_active === 'boolean' ? is_active : null,
        ],
      );
      if (r.rowCount === 0) return res.status(404).json({ success: false, error: 'Review not found' });
      res.json({ success: true, review: r.rows[0] });
    } catch (error) {
      console.error('❌ Profile review update error:', error);
      res.status(500).json({ success: false, error: 'Failed to update review' });
    }
  });

  /**
   * DELETE /api/profiles/reviews/:reviewId
   * Hard-delete a review row.
   */
  router.delete('/reviews/:reviewId', async (req: Request, res: Response) => {
    try {
      const userEmail = req.headers['x-user-email'] as string;
      if (!(await isAdminUser(userEmail))) {
        return res.status(403).json({ success: false, error: 'Admin access required' });
      }
      const r = await pool.query(
        'DELETE FROM profile_reviews WHERE id = $1 RETURNING id',
        [req.params.reviewId],
      );
      if (r.rowCount === 0) return res.status(404).json({ success: false, error: 'Review not found' });
      res.json({ success: true });
    } catch (error) {
      console.error('❌ Profile review delete error:', error);
      res.status(500).json({ success: false, error: 'Failed to delete review' });
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
