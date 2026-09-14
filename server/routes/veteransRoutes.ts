/**
 * Veterans Day giveaway — nomination log + dashboard API.
 *
 * The giveaway landing page is a SEPARATE Railway app with its own Postgres
 * (`veterans-day-giveaway`), and that DB stays the source of truth. It already
 * POSTs every new nomination to sa21's /api/webhooks/veterans-nomination so the
 * team gets an email. Before this, that email was the ONLY place a nomination
 * existed for the team — the giveaway DB has no public URL, so marketing had
 * nothing to open and no way to count anything.
 *
 * So we persist what the webhook hands us. This table is a notification LOG,
 * not the system of record: if the webhook ever fails, the giveaway DB still
 * has the row and this one won't. `notified_at`/`email_status` record how that
 * delivery went, which is exactly what you want when someone asks "did we miss
 * one?".
 *
 * Gate is canManageQR (admin + marketing) — the same roles that run the QR
 * program, since this is the campaign those cards point at. It does NOT use the
 * `?email=` server-rendered admin pages: nominations carry a veteran's name,
 * home address, phone and personal story, and those pages authenticate on a
 * spoofable query param.
 */

import { Router, Request, Response } from 'express';
import type { Pool } from 'pg';
import { canManageQR } from '../lib/permissions.js';

export interface VeteranNominationRecord {
  reference: string;
  veteranName: string;
  branch: string;
  veteranAddress: string;
  veteranPhone: string;
  veteranEmail: string | null;
  story: string;
  nominatorName: string;
  nominatorPhone: string;
  nominatorEmail: string | null;
  repSlug: string | null;
  source: string | null;
}

let schemaReady: Promise<void> | null = null;

/**
 * Created on first use rather than in a migration file — same approach the
 * giveaway app takes (src/db/ensure.ts), and it keeps the two halves of this
 * campaign consistent. Idempotent, so repeated calls are free.
 */
export function ensureVeteranSchema(pool: Pool): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS veteran_nominations (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          reference VARCHAR(40) UNIQUE NOT NULL,
          veteran_name VARCHAR(120) NOT NULL,
          branch VARCHAR(40) NOT NULL,
          veteran_address VARCHAR(220) NOT NULL,
          veteran_phone VARCHAR(20),
          veteran_email VARCHAR(200),
          story TEXT NOT NULL,
          nominator_name VARCHAR(120) NOT NULL,
          nominator_phone VARCHAR(20) NOT NULL,
          nominator_email VARCHAR(200),
          rep_slug VARCHAR(80),
          source VARCHAR(40),
          email_status VARCHAR(20),
          email_error TEXT,
          notified_at TIMESTAMPTZ,
          received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_veteran_nominations_received ON veteran_nominations(received_at DESC)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_veteran_nominations_rep ON veteran_nominations(rep_slug)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_veteran_nominations_source ON veteran_nominations(source)`);
    })().catch((e) => {
      // Don't cache a failed attempt — a transient DB blip would otherwise
      // poison every later write for the life of the process.
      schemaReady = null;
      throw e;
    });
  }
  return schemaReady;
}

/**
 * Store the nomination. Called from the webhook BEFORE the email goes out, so a
 * send failure still leaves a row marketing can see and chase.
 *
 * The giveaway retries a failed POST, so the same reference can arrive twice —
 * ON CONFLICT keeps the first row and reports it, which is how the caller knows
 * not to email again.
 */
export async function recordVeteranNomination(
  pool: Pool,
  n: VeteranNominationRecord
): Promise<{ stored: boolean; duplicate: boolean }> {
  await ensureVeteranSchema(pool);
  const result = await pool.query(
    `INSERT INTO veteran_nominations
       (reference, veteran_name, branch, veteran_address, veteran_phone, veteran_email,
        story, nominator_name, nominator_phone, nominator_email, rep_slug, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (reference) DO NOTHING
     RETURNING id`,
    [
      n.reference, n.veteranName, n.branch, n.veteranAddress, n.veteranPhone, n.veteranEmail,
      n.story, n.nominatorName, n.nominatorPhone, n.nominatorEmail, n.repSlug, n.source,
    ]
  );
  const duplicate = result.rowCount === 0;
  return { stored: !duplicate, duplicate };
}

/** Record how the team email went, so "did we miss one?" has an answer. */
export async function recordVeteranNotifyResult(
  pool: Pool,
  reference: string,
  result: { success: boolean; error?: string }
): Promise<void> {
  try {
    await pool.query(
      `UPDATE veteran_nominations
          SET email_status = $2, email_error = $3, notified_at = NOW()
        WHERE reference = $1`,
      [reference, result.success ? 'sent' : 'failed', result.success ? null : (result.error ?? 'unknown').slice(0, 500)]
    );
  } catch (e) {
    // The nomination itself is already safe; a missing status stamp is not
    // worth failing the webhook over.
    console.error('[veterans] notify-status update failed:', (e as Error)?.message);
  }
}

export function createVeteransRoutes(pool: Pool) {
  const router = Router();

  /**
   * GET /api/veterans/nominations
   * The whole campaign on one screen: counts, where the traffic came from,
   * which rep gets credit, and every nomination in full.
   * Admin / marketing only.
   */
  router.get('/nominations', async (req: Request, res: Response) => {
    try {
      const userEmail = req.headers['x-user-email'] as string;
      if (!await canManageQR(pool, userEmail)) {
        return res.status(403).json({ success: false, error: 'Marketing or admin access required' });
      }

      await ensureVeteranSchema(pool);

      const [summary, bySource, byRep, rows] = await Promise.all([
        pool.query(`
          SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE received_at > NOW() - INTERVAL '1 day')  AS today,
            COUNT(*) FILTER (WHERE received_at > NOW() - INTERVAL '7 days') AS week,
            COUNT(*) FILTER (WHERE email_status = 'failed')                 AS email_failed,
            MAX(received_at) AS latest
          FROM veteran_nominations
        `),
        pool.query(`
          SELECT COALESCE(source, 'direct') AS source, COUNT(*) AS count
            FROM veteran_nominations
           GROUP BY 1 ORDER BY 2 DESC
        `),
        // Left join so a nomination credited to a slug that no longer has a
        // profile still shows up, with the raw slug as its name.
        pool.query(`
          SELECT n.rep_slug AS slug,
                 COALESCE(p.name, n.rep_slug) AS name,
                 COUNT(*) AS count
            FROM veteran_nominations n
            LEFT JOIN employee_profiles p ON p.slug = n.rep_slug
           WHERE n.rep_slug IS NOT NULL
           GROUP BY n.rep_slug, p.name
           ORDER BY 3 DESC
        `),
        pool.query(`
          SELECT n.id, n.reference, n.veteran_name, n.branch, n.veteran_address,
                 n.veteran_phone, n.veteran_email, n.story,
                 n.nominator_name, n.nominator_phone, n.nominator_email,
                 n.rep_slug, COALESCE(p.name, n.rep_slug) AS rep_name,
                 n.source, n.email_status, n.received_at
            FROM veteran_nominations n
            LEFT JOIN employee_profiles p ON p.slug = n.rep_slug
           ORDER BY n.received_at DESC
           LIMIT 500
        `),
      ]);

      const s = summary.rows[0];
      res.json({
        success: true,
        summary: {
          total: parseInt(s.total, 10),
          today: parseInt(s.today, 10),
          week: parseInt(s.week, 10),
          emailFailed: parseInt(s.email_failed, 10),
          latest: s.latest,
        },
        bySource: bySource.rows.map(r => ({ source: r.source, count: parseInt(r.count, 10) })),
        byRep: byRep.rows.map(r => ({ slug: r.slug, name: r.name, count: parseInt(r.count, 10) })),
        nominations: rows.rows.map(r => ({
          id: r.id,
          reference: r.reference,
          veteranName: r.veteran_name,
          branch: r.branch,
          veteranAddress: r.veteran_address,
          veteranPhone: r.veteran_phone,
          veteranEmail: r.veteran_email,
          story: r.story,
          nominatorName: r.nominator_name,
          nominatorPhone: r.nominator_phone,
          nominatorEmail: r.nominator_email,
          repSlug: r.rep_slug,
          repName: r.rep_name,
          source: r.source,
          emailStatus: r.email_status,
          receivedAt: r.received_at,
        })),
      });
    } catch (error) {
      console.error('[veterans] nominations fetch error:', (error as Error)?.message);
      res.status(500).json({ success: false, error: 'Failed to load nominations' });
    }
  });

  return router;
}
