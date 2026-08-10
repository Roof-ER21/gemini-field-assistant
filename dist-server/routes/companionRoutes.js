/**
 * Rep Companion API Routes
 *
 * The triage sink for the "something's wrong" button. A report is the client
 * capture envelope (console/network/breadcrumb ring buffers + request ids) —
 * see src/lib/companionCore.ts. The request ids inside a report join to
 * backend log lines via the requestId middleware, which is the whole point.
 *
 * POST is deliberately soft-gated (x-user-email only): a broken auth state is
 * exactly when a rep needs the button. Reads/updates are admin-gated.
 */
import { Router } from 'express';
import crypto from 'crypto';
import { canManageQR } from '../lib/permissions.js';
const router = Router();
const getPool = (req) => req.app.get('pool');
const ENVELOPE_SCHEMA = 'roofer.companion-report.v1';
const MAX_MESSAGE = 2000;
const MAX_CONSOLE = 300;
const MAX_NETWORK = 100;
const MAX_CRUMBS = 100;
let tableReady = null;
function ensureTable(pool) {
    if (!tableReady) {
        tableReady = pool.query(`
      CREATE TABLE IF NOT EXISTS companion_reports (
        id TEXT PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        app TEXT NOT NULL,
        route TEXT,
        user_email TEXT,
        build_hash TEXT,
        user_agent TEXT,
        message TEXT,
        request_ids JSONB NOT NULL DEFAULT '[]',
        console JSONB NOT NULL DEFAULT '[]',
        network JSONB NOT NULL DEFAULT '[]',
        breadcrumbs JSONB NOT NULL DEFAULT '[]',
        screenshot TEXT,
        server_request_id TEXT,
        status TEXT NOT NULL DEFAULT 'new'
      )
    `).then(() => { });
    }
    return tableReady;
}
// POST /api/companion/report — file a report. Returns the reportId the rep sees.
router.post('/report', async (req, res) => {
    try {
        const pool = getPool(req);
        await ensureTable(pool);
        const r = req.body || {};
        if (r.schema !== ENVELOPE_SCHEMA) {
            return res.status(400).json({ error: `Expected schema ${ENVELOPE_SCHEMA}` });
        }
        const reportId = typeof r.reportId === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(r.reportId)
            ? r.reportId
            : crypto.randomUUID();
        const email = String(req.header('x-user-email') || r.userId || '').toLowerCase().slice(0, 200) || null;
        await pool.query(`INSERT INTO companion_reports
         (id, app, route, user_email, build_hash, user_agent, message,
          request_ids, console, network, breadcrumbs, screenshot, server_request_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (id) DO NOTHING`, [
            reportId,
            String(r.app || 'unknown').slice(0, 50),
            String(r.route || '').slice(0, 300),
            email,
            r.buildHash ? String(r.buildHash).slice(0, 64) : null,
            String(r.userAgent || '').slice(0, 300),
            String(r.message || '').slice(0, MAX_MESSAGE),
            JSON.stringify(Array.isArray(r.requestIds) ? r.requestIds.slice(0, 50) : []),
            JSON.stringify(Array.isArray(r.console) ? r.console.slice(-MAX_CONSOLE) : []),
            JSON.stringify(Array.isArray(r.network) ? r.network.slice(-MAX_NETWORK) : []),
            JSON.stringify(Array.isArray(r.breadcrumbs) ? r.breadcrumbs.slice(-MAX_CRUMBS) : []),
            typeof r.screenshot === 'string' && r.screenshot.startsWith('data:image/') ? r.screenshot : null,
            req.requestId,
        ]);
        console.log(`[Companion] report ${reportId} from ${email || 'anonymous'} on ${r.app}${r.route} rid=${req.requestId}`);
        res.json({ ok: true, reportId });
    }
    catch (error) {
        console.error('[Companion] report save failed:', error?.message);
        res.status(500).json({ error: 'Failed to save report' });
    }
});
// GET /api/companion/reports?status=new — triage listing (admin/marketing gate)
router.get('/reports', async (req, res) => {
    try {
        const pool = getPool(req);
        if (!(await canManageQR(pool, req.header('x-user-email')))) {
            return res.status(403).json({ error: 'Not authorized' });
        }
        await ensureTable(pool);
        const status = typeof req.query.status === 'string' ? req.query.status : null;
        const { rows } = await pool.query(`SELECT id, created_at, app, route, user_email, message, status, request_ids,
              jsonb_array_length(console) AS console_entries,
              jsonb_array_length(network) AS network_entries,
              (screenshot IS NOT NULL) AS has_screenshot
       FROM companion_reports
       WHERE ($1::text IS NULL OR status = $1)
       ORDER BY created_at DESC LIMIT 200`, [status]);
        res.json({ reports: rows });
    }
    catch (error) {
        console.error('[Companion] listing failed:', error?.message);
        res.status(500).json({ error: 'Failed to list reports' });
    }
});
// GET /api/companion/reports/:id — full envelope for triage
router.get('/reports/:id', async (req, res) => {
    try {
        const pool = getPool(req);
        if (!(await canManageQR(pool, req.header('x-user-email')))) {
            return res.status(403).json({ error: 'Not authorized' });
        }
        await ensureTable(pool);
        const { rows } = await pool.query('SELECT * FROM companion_reports WHERE id = $1', [req.params.id]);
        if (!rows[0])
            return res.status(404).json({ error: 'Report not found' });
        res.json({ report: rows[0] });
    }
    catch (error) {
        console.error('[Companion] fetch failed:', error?.message);
        res.status(500).json({ error: 'Failed to fetch report' });
    }
});
// PATCH /api/companion/reports/:id — triage status (new | seen | fixed)
router.patch('/reports/:id', async (req, res) => {
    try {
        const pool = getPool(req);
        if (!(await canManageQR(pool, req.header('x-user-email')))) {
            return res.status(403).json({ error: 'Not authorized' });
        }
        const status = String(req.body?.status || '');
        if (!['new', 'seen', 'fixed'].includes(status)) {
            return res.status(400).json({ error: 'status must be new | seen | fixed' });
        }
        await ensureTable(pool);
        const { rowCount } = await pool.query('UPDATE companion_reports SET status = $1 WHERE id = $2', [status, req.params.id]);
        if (!rowCount)
            return res.status(404).json({ error: 'Report not found' });
        res.json({ ok: true });
    }
    catch (error) {
        console.error('[Companion] status update failed:', error?.message);
        res.status(500).json({ error: 'Failed to update report' });
    }
});
export default router;
