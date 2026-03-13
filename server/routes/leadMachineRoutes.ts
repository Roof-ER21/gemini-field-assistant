/**
 * Lead Machine Routes
 * Endpoints for the 5 lead generation automation features:
 *   1. Storm Multi-Channel Blast — auto-blast SMS/email when storm hits a ZIP
 *   2. Digital Door Knocking — auto-contact neighbors of completed jobs
 *   3. GBP Auto-Posting — schedule Google Business Profile posts
 *   4. Craigslist Auto-Poster — daily service posts in DC/Baltimore/NoVA
 *   5. HOA Outreach — find & email HOA management companies
 */

import { Router, Request, Response } from 'express';
import type { Pool } from 'pg';
import { twilioService } from '../services/twilioService.js';
import { emailService } from '../services/emailService.js';

export function createLeadMachineRoutes(pool: Pool) {
  const router = Router();

  // =========================================================================
  // Auth helper
  // =========================================================================

  async function requireAdmin(req: Request, res: Response): Promise<boolean> {
    const email = req.headers['x-user-email'] as string;
    if (!email) {
      res.status(401).json({ error: 'Authentication required' });
      return false;
    }
    try {
      const result = await pool.query(
        'SELECT role FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
        [email]
      );
      if (result.rows[0]?.role !== 'admin') {
        res.status(403).json({ error: 'Admin access required' });
        return false;
      }
      return true;
    } catch {
      res.status(500).json({ error: 'Auth check failed' });
      return false;
    }
  }

  /** Fire-and-forget Telegram notification */
  function notifyTelegram(message: string): void {
    const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
    fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message }),
    }).catch(() => {});
  }

  // =========================================================================
  // 1. STORM MULTI-CHANNEL BLAST
  // =========================================================================

  /**
   * POST /api/lead-machine/storm-blast
   * Create a storm blast campaign — auto-generates landing page URL,
   * queues SMS + emails to contacts in the affected ZIP codes.
   */
  router.post('/storm-blast', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;

    try {
      const { zipCode, city, state, eventType, severity, contacts } = req.body;

      if (!zipCode || !eventType) {
        return res.status(400).json({ error: 'zipCode and eventType are required' });
      }

      // Check for active storm zone or create one
      let stormZoneId: string | null = null;
      const existingZone = await pool.query(
        `SELECT id FROM storm_zones WHERE zip_code = $1 AND is_active = true
         AND event_date >= NOW() - INTERVAL '7 days' LIMIT 1`,
        [zipCode]
      );

      if (existingZone.rows.length > 0) {
        stormZoneId = existingZone.rows[0].id;
      } else {
        const newZone = await pool.query(
          `INSERT INTO storm_zones (zip_code, city, state, event_type, event_date, severity, source, is_active)
           VALUES ($1, $2, $3, $4, NOW(), $5, 'blast', true)
           RETURNING id`,
          [zipCode, city || null, state || 'MD', eventType, severity || 'moderate']
        );
        stormZoneId = newZone.rows[0].id;
      }

      // Generate landing page URL
      const baseUrl = process.env.PUBLIC_URL || `https://${req.get('host')}`;
      const landingPageUrl = `${baseUrl}/storm/${zipCode}`;

      // Create blast campaign
      const campaign = await pool.query(
        `INSERT INTO storm_blast_campaigns
         (storm_zone_id, zip_code, city, state, event_type, severity, status, landing_page_url, started_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, NOW())
         RETURNING *`,
        [stormZoneId, zipCode, city || null, state || 'MD', eventType, severity || 'moderate', landingPageUrl]
      );

      const campaignId = campaign.rows[0].id;
      let smsSent = 0;
      let emailsSent = 0;

      // Import contacts if provided
      const contactList: Array<{ name?: string; phone?: string; email?: string; address?: string }> =
        contacts || [];

      // Also pull past customers in this ZIP
      const pastCustomers = await pool.query(
        `SELECT DISTINCT
           j.customer->>'name' as name,
           j.customer->>'phone' as phone,
           j.customer->>'email' as email,
           j.property->>'address' as address
         FROM jobs j
         WHERE j.property->>'zip' = $1
           AND j.status IN ('completed', 'closed')
         LIMIT 200`,
        [zipCode]
      );

      const allContacts = [
        ...contactList,
        ...pastCustomers.rows.map(c => ({ ...c, source: 'past_customer' })),
      ];

      for (const contact of allContacts) {
        const contactResult = await pool.query(
          `INSERT INTO storm_blast_contacts (campaign_id, name, phone, email, address, zip_code, source)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [
            campaignId,
            contact.name || null,
            contact.phone || null,
            contact.email || null,
            contact.address || null,
            zipCode,
            (contact as any).source || 'manual',
          ]
        );

        const contactId = contactResult.rows[0].id;
        const firstName = (contact.name || 'Homeowner').split(' ')[0];

        // Send SMS if phone available
        if (contact.phone && twilioService.isConfigured()) {
          const smsMessage =
            `${firstName}, a ${eventType} event was reported near ${zipCode}. ` +
            `Your roof may be damaged. The Roof Docs offers FREE storm damage inspections. ` +
            `Schedule yours: ${landingPageUrl}\n\nReply STOP to opt out.`;

          try {
            const result = await twilioService.sendSMS(contact.phone, smsMessage);
            if (result.success) {
              smsSent++;
              await pool.query(
                'UPDATE storm_blast_contacts SET sms_sent = true WHERE id = $1',
                [contactId]
              );
            }
          } catch {
            // Non-fatal
          }
          // Rate limit
          await new Promise(r => setTimeout(r, 1100));
        }

        // Send email if available
        if (contact.email) {
          try {
            await emailService.sendCustomEmail(contact.email, {
              subject: `Storm Alert: Free Roof Inspection in ${zipCode}`,
              html: `
                <h2>Recent ${eventType} damage reported near you</h2>
                <p>Hi ${firstName},</p>
                <p>A <strong>${eventType}</strong> event was recently reported in the ${zipCode} area.
                Many homes in your neighborhood may have damage that isn't visible from the ground.</p>
                <p><strong>The Roof Docs</strong> is offering <strong>FREE storm damage inspections</strong>
                to homeowners in affected areas.</p>
                <p><a href="${landingPageUrl}" style="display:inline-block;padding:12px 24px;
                  background:#b60807;color:white;text-decoration:none;border-radius:6px;font-weight:600;">
                  Schedule Free Inspection</a></p>
                <p>Or call us: <a href="tel:+15715208507">(571) 520-8507</a></p>
                <p style="color:#666;font-size:12px;">The Roof Docs • GAF Master Elite Certified<br>
                8100 Boone Blvd, Suite 400, Vienna, VA 22182</p>
              `,
              text: `Storm alert: ${eventType} near ${zipCode}. Free inspection: ${landingPageUrl}`,
            });
            emailsSent++;
            await pool.query(
              'UPDATE storm_blast_contacts SET email_sent = true WHERE id = $1',
              [contactId]
            );
          } catch {
            // Non-fatal
          }
        }
      }

      // Update campaign stats
      await pool.query(
        `UPDATE storm_blast_campaigns
         SET sms_sent = $1, emails_sent = $2, total_contacts = $3, status = 'completed', completed_at = NOW()
         WHERE id = $4`,
        [smsSent, emailsSent, allContacts.length, campaignId]
      );

      notifyTelegram(
        `🌩️ Storm Blast Complete\nZIP: ${zipCode} | ${eventType}\n` +
        `Contacts: ${allContacts.length} | SMS: ${smsSent} | Emails: ${emailsSent}\n` +
        `Landing: ${landingPageUrl}`
      );

      res.json({
        success: true,
        campaignId,
        landingPageUrl,
        stats: { totalContacts: allContacts.length, smsSent, emailsSent },
      });
    } catch (error) {
      console.error('[LeadMachine] Storm blast error:', error);
      res.status(500).json({ error: 'Failed to create storm blast' });
    }
  });

  /**
   * GET /api/lead-machine/storm-blasts
   * List all storm blast campaigns
   */
  router.get('/storm-blasts', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;

    try {
      const result = await pool.query(
        `SELECT * FROM storm_blast_campaigns ORDER BY created_at DESC LIMIT 50`
      );
      res.json({ campaigns: result.rows });
    } catch (error) {
      console.error('[LeadMachine] List storm blasts error:', error);
      res.status(500).json({ error: 'Failed to list campaigns' });
    }
  });

  // =========================================================================
  // 2. DIGITAL DOOR KNOCKING
  // =========================================================================

  /**
   * POST /api/lead-machine/door-knock
   * Create a door-knock campaign from a completed job.
   * Auto-contacts neighbors within a radius with SMS/postcard offers.
   */
  router.post('/door-knock', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;

    try {
      const { jobId, originAddress, originZip, originCity, originState, radiusMiles, addresses } = req.body;

      if (!originAddress) {
        return res.status(400).json({ error: 'originAddress is required' });
      }

      // If jobId provided, pull job details
      let jobAddress = originAddress;
      let jobZip = originZip;
      let jobCity = originCity;

      if (jobId) {
        const job = await pool.query('SELECT * FROM jobs WHERE id = $1', [jobId]);
        if (job.rows.length > 0) {
          const prop = job.rows[0].property || {};
          jobAddress = prop.address || originAddress;
          jobZip = prop.zip || originZip;
          jobCity = prop.city || originCity;
        }
      }

      const campaign = await pool.query(
        `INSERT INTO door_knock_campaigns
         (job_id, origin_address, origin_zip, origin_city, origin_state, radius_miles, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'active')
         RETURNING *`,
        [
          jobId || null,
          jobAddress,
          jobZip || null,
          jobCity || null,
          originState || 'MD',
          radiusMiles || 0.5,
        ]
      );

      const campaignId = campaign.rows[0].id;

      // Import provided neighbor addresses
      const neighborAddresses: Array<{
        address: string;
        homeownerName?: string;
        phone?: string;
        email?: string;
        contactMethod?: string;
      }> = addresses || [];

      let contacted = 0;

      for (const addr of neighborAddresses) {
        await pool.query(
          `INSERT INTO door_knock_addresses
           (campaign_id, address, zip_code, homeowner_name, phone, email, contact_method)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            campaignId,
            addr.address,
            jobZip || null,
            addr.homeownerName || null,
            addr.phone || null,
            addr.email || null,
            addr.contactMethod || 'postcard',
          ]
        );

        // Auto-send SMS if phone provided
        if (addr.phone && twilioService.isConfigured()) {
          const firstName = (addr.homeownerName || 'Neighbor').split(' ')[0];
          const baseUrl = process.env.PUBLIC_URL || `https://${req.get('host')}`;

          const smsMessage =
            `Hi ${firstName}! The Roof Docs just completed a roof project on your street (${jobAddress}). ` +
            `We're offering FREE inspections to nearby homeowners. ` +
            `Book yours: ${baseUrl}/free-inspection\n\nReply STOP to opt out.`;

          try {
            const result = await twilioService.sendSMS(addr.phone, smsMessage);
            if (result.success) {
              contacted++;
              await pool.query(
                `UPDATE door_knock_addresses SET contacted = true, contacted_at = NOW()
                 WHERE campaign_id = $1 AND address = $2`,
                [campaignId, addr.address]
              );
            }
          } catch {
            // Non-fatal
          }
          await new Promise(r => setTimeout(r, 1100));
        }
      }

      // Update campaign counts
      await pool.query(
        `UPDATE door_knock_campaigns
         SET total_addresses = $1, contacted = $2
         WHERE id = $3`,
        [neighborAddresses.length, contacted, campaignId]
      );

      notifyTelegram(
        `🚪 Door Knock Campaign\nOrigin: ${jobAddress}\n` +
        `Addresses: ${neighborAddresses.length} | Contacted: ${contacted}`
      );

      res.json({
        success: true,
        campaignId,
        stats: { totalAddresses: neighborAddresses.length, contacted },
      });
    } catch (error) {
      console.error('[LeadMachine] Door knock error:', error);
      res.status(500).json({ error: 'Failed to create door knock campaign' });
    }
  });

  /**
   * GET /api/lead-machine/door-knocks
   * List door knock campaigns
   */
  router.get('/door-knocks', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;

    try {
      const result = await pool.query(
        `SELECT * FROM door_knock_campaigns ORDER BY created_at DESC LIMIT 50`
      );
      res.json({ campaigns: result.rows });
    } catch (error) {
      console.error('[LeadMachine] List door knocks error:', error);
      res.status(500).json({ error: 'Failed to list campaigns' });
    }
  });

  /**
   * POST /api/lead-machine/door-knock/auto-trigger
   * Auto-create a door knock campaign when a job is completed.
   * Called internally when job status changes to 'completed'.
   */
  router.post('/door-knock/auto-trigger', async (req: Request, res: Response) => {
    try {
      const { jobId } = req.body;
      if (!jobId) return res.status(400).json({ error: 'jobId is required' });

      const job = await pool.query('SELECT * FROM jobs WHERE id = $1', [jobId]);
      if (job.rows.length === 0) {
        return res.status(404).json({ error: 'Job not found' });
      }

      const j = job.rows[0];
      const prop = j.property || {};

      // Don't create duplicate campaigns for same job
      const existing = await pool.query(
        `SELECT id FROM door_knock_campaigns WHERE job_id = $1 LIMIT 1`,
        [jobId]
      );
      if (existing.rows.length > 0) {
        return res.json({ success: true, campaignId: existing.rows[0].id, duplicate: true });
      }

      const campaign = await pool.query(
        `INSERT INTO door_knock_campaigns
         (job_id, origin_address, origin_zip, origin_city, origin_state, radius_miles, status)
         VALUES ($1, $2, $3, $4, $5, 0.5, 'pending')
         RETURNING id`,
        [jobId, prop.address || 'Unknown', prop.zip || null, prop.city || null, prop.state || 'MD']
      );

      notifyTelegram(
        `🚪 Door Knock Ready\nJob completed at: ${prop.address || 'Unknown'}\n` +
        `Campaign created — add neighbor addresses to activate.`
      );

      res.json({ success: true, campaignId: campaign.rows[0].id });
    } catch (error) {
      console.error('[LeadMachine] Auto-trigger error:', error);
      res.status(500).json({ error: 'Failed to auto-trigger door knock' });
    }
  });

  // =========================================================================
  // 3. GBP AUTO-POSTING
  // =========================================================================

  /**
   * POST /api/lead-machine/gbp-posts
   * Create or schedule a Google Business Profile post.
   */
  router.post('/gbp-posts', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;

    try {
      const {
        postType, title, content, imageUrl, callToAction, ctaUrl,
        scheduledFor, autoGenerated, generationSource, sourceId,
      } = req.body;

      if (!content) {
        return res.status(400).json({ error: 'content is required' });
      }

      const status = scheduledFor ? 'scheduled' : 'draft';

      const result = await pool.query(
        `INSERT INTO gbp_posts
         (post_type, title, content, image_url, call_to_action, cta_url,
          status, scheduled_for, auto_generated, generation_source, source_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          postType || 'update',
          title || null,
          content,
          imageUrl || null,
          callToAction || 'LEARN_MORE',
          ctaUrl || null,
          status,
          scheduledFor || null,
          autoGenerated || false,
          generationSource || null,
          sourceId || null,
        ]
      );

      res.json({ success: true, post: result.rows[0] });
    } catch (error) {
      console.error('[LeadMachine] GBP post error:', error);
      res.status(500).json({ error: 'Failed to create GBP post' });
    }
  });

  /**
   * GET /api/lead-machine/gbp-posts
   * List GBP posts
   */
  router.get('/gbp-posts', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;

    try {
      const { status } = req.query;
      let query = 'SELECT * FROM gbp_posts';
      const params: any[] = [];

      if (status) {
        query += ' WHERE status = $1';
        params.push(status);
      }
      query += ' ORDER BY created_at DESC LIMIT 50';

      const result = await pool.query(query, params);
      res.json({ posts: result.rows });
    } catch (error) {
      console.error('[LeadMachine] List GBP posts error:', error);
      res.status(500).json({ error: 'Failed to list GBP posts' });
    }
  });

  /**
   * POST /api/lead-machine/gbp-posts/auto-generate
   * Auto-generate GBP posts from recent activity (storms, testimonials, job completions).
   */
  router.post('/gbp-posts/auto-generate', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;

    try {
      const postsCreated: any[] = [];

      // 1. Storm-based posts — recent storms in service area
      const recentStorms = await pool.query(
        `SELECT * FROM storm_zones
         WHERE is_active = true AND event_date >= NOW() - INTERVAL '14 days'
         ORDER BY event_date DESC LIMIT 3`
      );

      for (const storm of recentStorms.rows) {
        // Don't duplicate
        const exists = await pool.query(
          `SELECT id FROM gbp_posts WHERE generation_source = 'storm_alert' AND source_id = $1`,
          [storm.id]
        );
        if (exists.rows.length > 0) continue;

        const content =
          `⚠️ Recent ${storm.event_type} damage reported in ${storm.city || storm.zip_code}!\n\n` +
          `If you live in the ${storm.zip_code} area, your roof may have been affected. ` +
          `The Roof Docs offers FREE storm damage inspections. ` +
          `Don't wait — most insurance claims must be filed within 12 months.\n\n` +
          `📞 Call (571) 520-8507 or visit our website to schedule.`;

        const post = await pool.query(
          `INSERT INTO gbp_posts
           (post_type, title, content, call_to_action, status, auto_generated, generation_source, source_id)
           VALUES ('update', $1, $2, 'CALL', 'draft', true, 'storm_alert', $3)
           RETURNING *`,
          [`Storm Alert: ${storm.event_type} in ${storm.zip_code}`, content, storm.id]
        );
        postsCreated.push(post.rows[0]);
      }

      // 2. Job completion posts — celebrate recent work
      const recentJobs = await pool.query(
        `SELECT j.id, j.title, j.property->>'city' as city, j.property->>'state' as state
         FROM jobs j
         WHERE j.status = 'completed'
           AND j.updated_at >= NOW() - INTERVAL '7 days'
         ORDER BY j.updated_at DESC LIMIT 3`
      );

      for (const job of recentJobs.rows) {
        const exists = await pool.query(
          `SELECT id FROM gbp_posts WHERE generation_source = 'job_complete' AND source_id = $1`,
          [job.id]
        );
        if (exists.rows.length > 0) continue;

        const content =
          `✅ Another successful project completed in ${job.city || 'the area'}!\n\n` +
          `The Roof Docs team just finished a ${job.title || 'roofing project'}. ` +
          `Our GAF Master Elite certification ensures your roof is installed to the highest standards.\n\n` +
          `Need a roof inspection? Call (571) 520-8507 for a FREE estimate.`;

        const post = await pool.query(
          `INSERT INTO gbp_posts
           (post_type, title, content, call_to_action, status, auto_generated, generation_source, source_id)
           VALUES ('update', $1, $2, 'CALL', 'draft', true, 'job_complete', $3)
           RETURNING *`,
          [`Project Complete in ${job.city || 'Your Area'}`, content, job.id]
        );
        postsCreated.push(post.rows[0]);
      }

      res.json({ success: true, postsCreated: postsCreated.length, posts: postsCreated });
    } catch (error) {
      console.error('[LeadMachine] GBP auto-generate error:', error);
      res.status(500).json({ error: 'Failed to auto-generate posts' });
    }
  });

  // =========================================================================
  // 4. CRAIGSLIST AUTO-POSTER
  // =========================================================================

  const CL_TEMPLATES: Record<string, { title: string; body: string }> = {
    storm_damage: {
      title: '⚠️ FREE Storm Damage Roof Inspection — Licensed & Insured',
      body: `Did your area recently experience a storm? Your roof may have hidden damage that could lead to costly leaks.

The Roof Docs offers FREE storm damage inspections throughout the DC/Maryland/Virginia area.

✅ GAF Master Elite Certified (Top 2% of roofers nationwide)
✅ BBB A+ Rated
✅ We work directly with your insurance company
✅ Licensed in VA, MD, and PA

Storm damage claims must be filed within 12 months — don't miss your window!

📞 Call (571) 520-8507
🌐 Schedule online at theroofdocs.com

The Roof Docs
8100 Boone Blvd, Suite 400, Vienna, VA 22182
VA License: 2705194709 | MD License: 164697`,
    },
    free_inspection: {
      title: '🏠 FREE Roof Inspection — GAF Master Elite Certified',
      body: `Is your roof more than 10 years old? You could have damage you don't even know about.

The Roof Docs provides FREE, no-obligation roof inspections. Our certified inspectors will:

• Check for missing or damaged shingles
• Inspect flashing and ventilation
• Look for signs of water damage
• Provide a detailed report with photos

✅ GAF Master Elite Certified
✅ BBB A+ Rated
✅ Licensed in VA, MD, and PA
✅ Financing available

📞 (571) 520-8507
🌐 theroofdocs.com

The Roof Docs — Your Trusted Roof Experts`,
    },
    insurance_help: {
      title: '🛡️ Insurance Claim Help — We Handle the Paperwork',
      body: `Dealing with a denied or underpaid roof insurance claim? We can help.

The Roof Docs specializes in insurance claim assistance:

• FREE claim review and damage documentation
• We meet with your adjuster on-site
• Supplement filing for underpaid claims
• Appeal assistance for denials

Our team has a 90%+ approval rate on storm damage claims.

✅ GAF Master Elite Certified
✅ 1000+ insurance claims handled
✅ We don't get paid until your claim is approved

📞 (571) 520-8507
🌐 theroofdocs.com

The Roof Docs
Licensed: VA 2705194709 | MD 164697 | PA 145926`,
    },
    seasonal: {
      title: '🍂 Spring Roof Checkup — FREE Inspection Before Storm Season',
      body: `Spring storms are coming. Is your roof ready?

The Roof Docs is offering FREE pre-storm-season inspections to homeowners in DC, Maryland, and Virginia.

We'll check for:
• Winter damage from ice and snow
• Loose or missing shingles
• Gutter and drainage issues
• Ventilation problems

Don't wait for a leak to find out your roof needs attention!

✅ GAF Master Elite Certified (Top 2% nationwide)
✅ BBB A+ Rated
✅ Same-week appointments available

📞 (571) 520-8507
🌐 theroofdocs.com

The Roof Docs — Protecting Your Home Since Day One`,
    },
  };

  const CL_MARKETS = ['washingtondc', 'baltimore', 'norfolk'];

  /**
   * POST /api/lead-machine/craigslist-posts
   * Create a Craigslist post (manual or from template)
   */
  router.post('/craigslist-posts', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;

    try {
      const { market, title, body, zipCode, templateName, scheduledFor } = req.body;

      if (!market || !CL_MARKETS.includes(market)) {
        return res.status(400).json({ error: `market must be one of: ${CL_MARKETS.join(', ')}` });
      }

      // Use template if specified
      let postTitle = title;
      let postBody = body;
      if (templateName && CL_TEMPLATES[templateName]) {
        postTitle = postTitle || CL_TEMPLATES[templateName].title;
        postBody = postBody || CL_TEMPLATES[templateName].body;
      }

      if (!postTitle || !postBody) {
        return res.status(400).json({ error: 'title and body are required (or use a templateName)' });
      }

      const status = scheduledFor ? 'scheduled' : 'draft';

      const result = await pool.query(
        `INSERT INTO craigslist_posts
         (market, title, body, zip_code, template_name, status, scheduled_for, auto_generated)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [market, postTitle, postBody, zipCode || null, templateName || null, status, scheduledFor || null, !!templateName]
      );

      res.json({ success: true, post: result.rows[0] });
    } catch (error) {
      console.error('[LeadMachine] Craigslist post error:', error);
      res.status(500).json({ error: 'Failed to create Craigslist post' });
    }
  });

  /**
   * GET /api/lead-machine/craigslist-posts
   * List Craigslist posts
   */
  router.get('/craigslist-posts', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;

    try {
      const { market, status } = req.query;
      let query = 'SELECT * FROM craigslist_posts WHERE 1=1';
      const params: any[] = [];
      let idx = 1;

      if (market) { query += ` AND market = $${idx++}`; params.push(market); }
      if (status) { query += ` AND status = $${idx++}`; params.push(status); }
      query += ' ORDER BY created_at DESC LIMIT 50';

      const result = await pool.query(query, params);
      res.json({ posts: result.rows });
    } catch (error) {
      console.error('[LeadMachine] List Craigslist posts error:', error);
      res.status(500).json({ error: 'Failed to list posts' });
    }
  });

  /**
   * GET /api/lead-machine/craigslist-templates
   * List available Craigslist post templates
   */
  router.get('/craigslist-templates', (_req: Request, res: Response) => {
    const templates = Object.entries(CL_TEMPLATES).map(([key, val]) => ({
      name: key,
      title: val.title,
      preview: val.body.substring(0, 120) + '...',
    }));
    res.json({ templates, markets: CL_MARKETS });
  });

  /**
   * POST /api/lead-machine/craigslist-posts/batch
   * Create posts for all 3 markets from a single template
   */
  router.post('/craigslist-posts/batch', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;

    try {
      const { templateName, scheduledFor } = req.body;

      if (!templateName || !CL_TEMPLATES[templateName]) {
        return res.status(400).json({
          error: `templateName must be one of: ${Object.keys(CL_TEMPLATES).join(', ')}`,
        });
      }

      const template = CL_TEMPLATES[templateName];
      const posts: any[] = [];

      for (const market of CL_MARKETS) {
        const result = await pool.query(
          `INSERT INTO craigslist_posts
           (market, title, body, template_name, status, scheduled_for, auto_generated)
           VALUES ($1, $2, $3, $4, $5, $6, true)
           RETURNING *`,
          [market, template.title, template.body, templateName, scheduledFor ? 'scheduled' : 'draft', scheduledFor || null]
        );
        posts.push(result.rows[0]);
      }

      notifyTelegram(
        `📋 Craigslist Batch Created\nTemplate: ${templateName}\n` +
        `Markets: ${CL_MARKETS.join(', ')}\nStatus: ${scheduledFor ? 'scheduled' : 'draft'}`
      );

      res.json({ success: true, posts });
    } catch (error) {
      console.error('[LeadMachine] Craigslist batch error:', error);
      res.status(500).json({ error: 'Failed to create batch posts' });
    }
  });

  // =========================================================================
  // 5. HOA OUTREACH
  // =========================================================================

  const HOA_EMAIL_TEMPLATES: Record<string, { subject: string; body: (params: { companyName: string; contactName?: string }) => string }> = {
    intro: {
      subject: 'Roofing Partnership — The Roof Docs',
      body: ({ companyName, contactName }) => {
        const greeting = contactName ? `Hi ${contactName.split(' ')[0]}` : `Hello`;
        return `${greeting},

I'm reaching out from The Roof Docs — a GAF Master Elite certified roofing company serving the DC/Maryland/Virginia area.

We specialize in working with HOA and property management companies like ${companyName} to provide:

• **FREE roof inspections** for all community properties
• **Storm damage assessments** after severe weather events
• **Bulk pricing** for multi-unit roof replacements
• **Direct insurance claim coordination** — we handle the paperwork
• **Dedicated project manager** for your community

As a GAF Master Elite contractor (top 2% nationwide), we offer industry-leading warranties — up to 50 years on materials and workmanship.

Would you be open to a brief call to discuss how we can support your communities?

Best regards,
The Roof Docs Team
(571) 520-8507 | theroofdocs.com
Licensed: VA 2705194709 | MD 164697 | PA 145926`;
      },
    },
    followup: {
      subject: 'Following up — Free HOA Roof Assessment',
      body: ({ companyName, contactName }) => {
        const greeting = contactName ? `Hi ${contactName.split(' ')[0]}` : `Hello`;
        return `${greeting},

I wanted to follow up on my previous email about partnering with ${companyName} for roofing services.

Spring storm season is approaching, and many HOA communities find themselves dealing with unexpected roof damage. Our team can:

✅ Conduct a **free community-wide roof assessment**
✅ Identify properties that may have existing damage
✅ Provide a prioritized repair/replacement plan
✅ Work directly with homeowner insurance companies

No obligation — we'd be happy to start with a single property assessment to show you our process.

Would next week work for a quick 15-minute call?

Best,
The Roof Docs Team
(571) 520-8507`;
      },
    },
    value_add: {
      subject: 'Severe Weather Guide for HOA Communities',
      body: ({ companyName, contactName }) => {
        const greeting = contactName ? `Hi ${contactName.split(' ')[0]}` : `Hello`;
        return `${greeting},

I thought ${companyName} might find this useful — we've put together a guide on **how HOA communities should respond after severe weather events**.

Key takeaways:
1. Document damage within 48 hours (photos + written notes)
2. File insurance claims within the policy window (usually 12 months)
3. Get a professional inspection BEFORE calling insurance
4. Request an independent adjuster if the claim is undervalued

We'd be happy to share the full guide and discuss how we can support your communities.

📞 (571) 520-8507
🌐 theroofdocs.com

Best,
The Roof Docs Team`;
      },
    },
  };

  /**
   * POST /api/lead-machine/hoa-contacts
   * Add an HOA management company to the outreach list
   */
  router.post('/hoa-contacts', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;

    try {
      const {
        companyName, contactName, email, phone, website,
        city, state, zipCodes, estimatedUnits, source, notes,
      } = req.body;

      if (!companyName) {
        return res.status(400).json({ error: 'companyName is required' });
      }

      const result = await pool.query(
        `INSERT INTO hoa_contacts
         (company_name, contact_name, email, phone, website, city, state, zip_codes, estimated_units, source, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          companyName,
          contactName || null,
          email || null,
          phone || null,
          website || null,
          city || null,
          state || 'MD',
          zipCodes || null,
          estimatedUnits || null,
          source || 'manual',
          notes || null,
        ]
      );

      res.json({ success: true, contact: result.rows[0] });
    } catch (error) {
      console.error('[LeadMachine] HOA contact error:', error);
      res.status(500).json({ error: 'Failed to add HOA contact' });
    }
  });

  /**
   * GET /api/lead-machine/hoa-contacts
   * List HOA contacts with optional status filter
   */
  router.get('/hoa-contacts', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;

    try {
      const { status, state } = req.query;
      let query = 'SELECT * FROM hoa_contacts WHERE 1=1';
      const params: any[] = [];
      let idx = 1;

      if (status) { query += ` AND status = $${idx++}`; params.push(status); }
      if (state) { query += ` AND state = $${idx++}`; params.push(state); }
      query += ' ORDER BY updated_at DESC LIMIT 100';

      const result = await pool.query(query, params);
      res.json({ contacts: result.rows });
    } catch (error) {
      console.error('[LeadMachine] List HOA contacts error:', error);
      res.status(500).json({ error: 'Failed to list contacts' });
    }
  });

  /**
   * POST /api/lead-machine/hoa-contacts/:id/send-email
   * Send an outreach email to an HOA contact
   */
  router.post('/hoa-contacts/:id/send-email', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;

    try {
      const { id } = req.params;
      const { emailType } = req.body;

      const contact = await pool.query('SELECT * FROM hoa_contacts WHERE id = $1', [id]);
      if (contact.rows.length === 0) {
        return res.status(404).json({ error: 'Contact not found' });
      }

      const hoa = contact.rows[0];
      if (!hoa.email) {
        return res.status(400).json({ error: 'Contact has no email address' });
      }

      if (hoa.status === 'do_not_contact') {
        return res.status(400).json({ error: 'Contact is marked do_not_contact' });
      }

      const templateType = emailType || 'intro';
      const template = HOA_EMAIL_TEMPLATES[templateType];
      if (!template) {
        return res.status(400).json({
          error: `emailType must be one of: ${Object.keys(HOA_EMAIL_TEMPLATES).join(', ')}`,
        });
      }

      const emailBody = template.body({
        companyName: hoa.company_name,
        contactName: hoa.contact_name,
      });

      try {
        await emailService.sendCustomEmail(hoa.email, {
          subject: template.subject,
          text: emailBody,
          html: emailBody.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'),
        });
      } catch (emailErr) {
        // Log the email send attempt even if it fails
        await pool.query(
          `INSERT INTO hoa_email_log (hoa_contact_id, email_type, subject, body_preview, error_message)
           VALUES ($1, $2, $3, $4, $5)`,
          [id, templateType, template.subject, emailBody.substring(0, 200), String(emailErr)]
        );
        return res.status(500).json({ error: 'Failed to send email' });
      }

      // Log successful send
      await pool.query(
        `INSERT INTO hoa_email_log (hoa_contact_id, email_type, subject, body_preview)
         VALUES ($1, $2, $3, $4)`,
        [id, templateType, template.subject, emailBody.substring(0, 200)]
      );

      // Update contact status
      const stepMap: Record<string, number> = { intro: 1, followup: 2, value_add: 3 };
      const nextStep = stepMap[templateType] || 1;
      const nextEmailDays = templateType === 'intro' ? 3 : templateType === 'followup' ? 5 : 14;

      await pool.query(
        `UPDATE hoa_contacts
         SET status = CASE WHEN status = 'new' THEN 'contacted' ELSE status END,
             last_contacted = NOW(),
             contact_count = contact_count + 1,
             email_sequence_step = $1,
             next_email_at = NOW() + INTERVAL '${nextEmailDays} days',
             updated_at = NOW()
         WHERE id = $2`,
        [nextStep, id]
      );

      notifyTelegram(
        `📧 HOA Outreach Sent\nTo: ${hoa.company_name} (${hoa.email})\nType: ${templateType}`
      );

      res.json({ success: true, emailType: templateType });
    } catch (error) {
      console.error('[LeadMachine] HOA email error:', error);
      res.status(500).json({ error: 'Failed to send email' });
    }
  });

  /**
   * POST /api/lead-machine/hoa-contacts/batch-import
   * Bulk import HOA contacts
   */
  router.post('/hoa-contacts/batch-import', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;

    try {
      const { contacts } = req.body;
      if (!Array.isArray(contacts) || contacts.length === 0) {
        return res.status(400).json({ error: 'contacts array is required' });
      }

      let imported = 0;
      let skipped = 0;

      for (const c of contacts) {
        if (!c.companyName) { skipped++; continue; }

        // Skip duplicates by company name + email
        if (c.email) {
          const exists = await pool.query(
            `SELECT id FROM hoa_contacts WHERE LOWER(company_name) = LOWER($1) AND LOWER(email) = LOWER($2) LIMIT 1`,
            [c.companyName, c.email]
          );
          if (exists.rows.length > 0) { skipped++; continue; }
        }

        await pool.query(
          `INSERT INTO hoa_contacts
           (company_name, contact_name, email, phone, website, city, state, zip_codes, estimated_units, source)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            c.companyName,
            c.contactName || null,
            c.email || null,
            c.phone || null,
            c.website || null,
            c.city || null,
            c.state || 'MD',
            c.zipCodes || null,
            c.estimatedUnits || null,
            c.source || 'import',
          ]
        );
        imported++;
      }

      res.json({ success: true, imported, skipped, total: contacts.length });
    } catch (error) {
      console.error('[LeadMachine] HOA batch import error:', error);
      res.status(500).json({ error: 'Failed to import contacts' });
    }
  });

  /**
   * PATCH /api/lead-machine/hoa-contacts/:id
   * Update an HOA contact's status or info
   */
  router.patch('/hoa-contacts/:id', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;

    try {
      const { id } = req.params;
      const allowed = ['status', 'contact_name', 'email', 'phone', 'notes', 'website', 'estimated_units'];
      const sets: string[] = [];
      const values: any[] = [];
      let idx = 1;

      for (const [key, val] of Object.entries(req.body)) {
        const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase(); // camelCase to snake_case
        if (allowed.includes(dbKey)) {
          sets.push(`${dbKey} = $${idx++}`);
          values.push(val);
        }
      }

      if (sets.length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
      }

      sets.push('updated_at = NOW()');
      values.push(id);

      const result = await pool.query(
        `UPDATE hoa_contacts SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Contact not found' });
      }

      res.json({ success: true, contact: result.rows[0] });
    } catch (error) {
      console.error('[LeadMachine] HOA update error:', error);
      res.status(500).json({ error: 'Failed to update contact' });
    }
  });

  // =========================================================================
  // DASHBOARD — unified stats across all lead machine features
  // =========================================================================

  /**
   * GET /api/lead-machine/dashboard
   * Summary stats for all lead machine features
   */
  router.get('/dashboard', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;

    try {
      const [stormBlasts, doorKnocks, gbpPosts, clPosts, hoaContacts] = await Promise.all([
        pool.query(`SELECT
          COUNT(*) as total,
          COALESCE(SUM(sms_sent), 0) as total_sms,
          COALESCE(SUM(emails_sent), 0) as total_emails,
          COALESCE(SUM(leads_generated), 0) as total_leads
          FROM storm_blast_campaigns`),
        pool.query(`SELECT
          COUNT(*) as total,
          COALESCE(SUM(total_addresses), 0) as total_addresses,
          COALESCE(SUM(contacted), 0) as total_contacted,
          COALESCE(SUM(leads_generated), 0) as total_leads
          FROM door_knock_campaigns`),
        pool.query(`SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'posted') as posted,
          COUNT(*) FILTER (WHERE status = 'scheduled') as scheduled,
          COUNT(*) FILTER (WHERE status = 'draft') as drafts
          FROM gbp_posts`),
        pool.query(`SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'posted') as posted,
          COUNT(*) FILTER (WHERE status = 'scheduled') as scheduled,
          COALESCE(SUM(leads_generated), 0) as total_leads
          FROM craigslist_posts`),
        pool.query(`SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'contacted') as contacted,
          COUNT(*) FILTER (WHERE status = 'meeting_set') as meetings,
          COUNT(*) FILTER (WHERE status = 'proposal_sent') as proposals,
          COUNT(*) FILTER (WHERE status = 'won') as won
          FROM hoa_contacts`),
      ]);

      res.json({
        stormBlasts: stormBlasts.rows[0],
        doorKnocks: doorKnocks.rows[0],
        gbpPosts: gbpPosts.rows[0],
        craigslistPosts: clPosts.rows[0],
        hoaOutreach: hoaContacts.rows[0],
      });
    } catch (error) {
      console.error('[LeadMachine] Dashboard error:', error);
      res.status(500).json({ error: 'Failed to load dashboard' });
    }
  });

  return router;
}
