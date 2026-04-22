/**
 * /api/hail/rep-report endpoints
 *
 * Mount point in server/index.ts (when ready):
 *   import { repReportRoutes } from './routes/repReportRoutes.js';
 *   app.use('/api/hail', repReportRoutes(pool));
 *
 * Endpoints:
 *   POST   /rep-report              — rep submits a new event
 *   POST   /customer-report         — public customer submission (no auth required?)
 *   GET    /rep-report/pending      — admin: list queue
 *   POST   /rep-report/:id/approve  — admin: approve
 *   POST   /rep-report/:id/reject   — admin: reject
 *
 * Feature flag: REP_REPORTS_ENABLED (default: false)
 */
import { Router } from 'express';
import { RepReportService } from '../services/repReportService.js';
export function repReportRoutes(pool) {
    const router = Router();
    const svc = new RepReportService(pool);
    const enabled = () => process.env.REP_REPORTS_ENABLED === 'true';
    // ─── REP SUBMISSION ───
    router.post('/rep-report', async (req, res) => {
        if (!enabled())
            return res.status(503).json({ error: 'rep reports disabled' });
        try {
            const { latitude, longitude, event_date, hail_size_inches, wind_mph, tornado_ef_rank, photo_urls, notes, state, } = req.body;
            if (latitude == null || longitude == null || !event_date) {
                return res.status(400).json({ error: 'latitude, longitude, event_date required' });
            }
            // Assume auth middleware populated req.user
            const userId = req.user?.id;
            if (!userId)
                return res.status(401).json({ error: 'authentication required' });
            const result = await svc.submit({
                latitude: Number(latitude),
                longitude: Number(longitude),
                eventDate: event_date,
                hailSizeInches: hail_size_inches != null ? Number(hail_size_inches) : undefined,
                windMph: wind_mph != null ? Number(wind_mph) : undefined,
                tornadoEfRank: tornado_ef_rank != null ? Number(tornado_ef_rank) : undefined,
                photoUrls: Array.isArray(photo_urls) ? photo_urls : [],
                notes,
                state,
                submittedByUserId: userId,
                isCustomerReport: false,
            });
            res.json({ success: true, result });
        }
        catch (err) {
            res.status(400).json({ error: err.message });
        }
    });
    // ─── PUBLIC CUSTOMER SUBMISSION ───
    router.post('/customer-report', async (req, res) => {
        if (!enabled())
            return res.status(503).json({ error: 'customer reports disabled' });
        try {
            const { latitude, longitude, event_date, hail_size_inches, wind_mph, photo_urls, notes, state, email, phone, // customer contact info (stored in source_details)
             } = req.body;
            if (latitude == null || longitude == null || !event_date) {
                return res.status(400).json({ error: 'latitude, longitude, event_date required' });
            }
            const result = await svc.submit({
                latitude: Number(latitude),
                longitude: Number(longitude),
                eventDate: event_date,
                hailSizeInches: hail_size_inches != null ? Number(hail_size_inches) : undefined,
                windMph: wind_mph != null ? Number(wind_mph) : undefined,
                photoUrls: Array.isArray(photo_urls) ? photo_urls : [],
                notes: [notes, email ? `contact: ${email}` : '', phone ? `phone: ${phone}` : ''].filter(Boolean).join(' | '),
                state,
                isCustomerReport: true,
            });
            res.json({ success: true, result, message: 'Thank you! Your report is pending review.' });
        }
        catch (err) {
            res.status(400).json({ error: err.message });
        }
    });
    // ─── ADMIN QUEUE ───
    router.get('/rep-report/pending', async (req, res) => {
        if (!enabled())
            return res.status(503).json({ error: 'rep reports disabled' });
        const user = req.user;
        if (!user?.isAdmin)
            return res.status(403).json({ error: 'admin required' });
        try {
            const queue = await svc.getPendingQueue(100);
            res.json({ success: true, queue });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    router.post('/rep-report/:id/approve', async (req, res) => {
        if (!enabled())
            return res.status(503).json({ error: 'rep reports disabled' });
        const user = req.user;
        if (!user?.isAdmin)
            return res.status(403).json({ error: 'admin required' });
        try {
            await svc.approve(req.params.id, user.id);
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    router.post('/rep-report/:id/reject', async (req, res) => {
        if (!enabled())
            return res.status(503).json({ error: 'rep reports disabled' });
        const user = req.user;
        if (!user?.isAdmin)
            return res.status(403).json({ error: 'admin required' });
        try {
            await svc.reject(req.params.id, user.id, req.body?.reason);
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    return router;
}
