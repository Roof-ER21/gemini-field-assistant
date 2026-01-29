import { Router } from 'express';
import { hailMapsService } from '../services/hailMapsService.js';
const router = Router();
// GET /api/hail/status
router.get('/status', (_req, res) => {
    res.json({
        configured: hailMapsService.isConfigured(),
        provider: 'Interactive Hail Maps'
    });
});
// POST /api/hail/monitor
router.post('/monitor', async (req, res) => {
    try {
        const { street, city, state, zip } = req.body;
        if (!street || !city || !state || !zip) {
            return res.status(400).json({ error: 'street, city, state, and zip are required' });
        }
        if (!hailMapsService.isConfigured()) {
            return res.status(503).json({ error: 'Hail maps service not configured' });
        }
        const result = await hailMapsService.createAddressMonitor({ street, city, state, zip });
        res.json(result);
    }
    catch (error) {
        console.error('❌ Hail monitor error:', error);
        res.status(500).json({ error: error.message });
    }
});
// GET /api/hail/search?address=...&months=24 OR lat/lng
router.get('/search', async (req, res) => {
    try {
        if (!hailMapsService.isConfigured()) {
            return res.status(503).json({ error: 'Hail maps service not configured' });
        }
        const { address, lat, lng, months = '24', radius = '0', marker_id, street, city, state, zip } = req.query;
        const monthsNum = parseInt(months, 10);
        const radiusNum = parseFloat(radius);
        if (marker_id) {
            const data = await hailMapsService.searchByMarkerId(marker_id, monthsNum);
            return res.json(data);
        }
        if (street || city || state || zip) {
            if (!street || !city || !state || !zip) {
                return res.status(400).json({ error: 'street, city, state, and zip are required' });
            }
            const data = await hailMapsService.searchByAddress({
                street: String(street),
                city: String(city),
                state: String(state),
                zip: String(zip)
            }, monthsNum);
            return res.json(data);
        }
        if (lat && lng) {
            const data = await hailMapsService.searchByCoordinates(parseFloat(lat), parseFloat(lng), monthsNum, radiusNum);
            return res.json(data);
        }
        if (address) {
            return res.status(400).json({ error: 'Use street, city, state, and zip for address search' });
        }
        return res.status(400).json({ error: 'Provide street/city/state/zip, marker_id, or lat/lng' });
    }
    catch (error) {
        console.error('❌ Hail search error:', error);
        res.status(500).json({ error: error.message });
    }
});
export default router;
