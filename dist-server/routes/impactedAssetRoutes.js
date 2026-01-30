/**
 * Impacted Asset API Routes
 *
 * Endpoints for monitoring customer properties and generating storm impact alerts.
 * Enables proactive outreach when past customers are affected by new storms.
 */
import { Router } from 'express';
import { createImpactedAssetService } from '../services/impactedAssetService.js';
const router = Router();
const geocodeAddress = async (params) => {
    try {
        const query = encodeURIComponent(`${params.address}, ${params.city}, ${params.state} ${params.zipCode}`);
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`;
        const response = await fetch(url, {
            headers: { 'User-Agent': 'GeminiFieldAssistant/1.0' }
        });
        if (!response.ok)
            return null;
        const data = await response.json();
        if (!Array.isArray(data) || data.length === 0)
            return null;
        return {
            latitude: parseFloat(data[0].lat),
            longitude: parseFloat(data[0].lon)
        };
    }
    catch (error) {
        console.error('Geocoding error:', error);
        return null;
    }
};
// Get pool from app
const getPool = (req) => {
    return req.app.get('pool');
};
// Get user ID from email header
const getUserIdFromEmail = async (pool, email) => {
    const result = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    return result.rows[0]?.id || null;
};
/**
 * POST /api/assets/properties
 * Add a customer property to monitor
 *
 * Body:
 * {
 *   customerName: string;
 *   customerPhone?: string;
 *   customerEmail?: string;
 *   address: string;
 *   streetAddress?: string;
 *   city: string;
 *   state: string;
 *   zipCode: string;
 *   latitude: number;
 *   longitude: number;
 *   propertyType?: string;
 *   roofType?: string;
 *   roofAgeYears?: number;
 *   lastRoofDate?: string;
 *   relationshipStatus?: string;
 *   originalJobId?: string;
 *   lifetimeValue?: number;
 *   notifyOnHail?: boolean;
 *   notifyOnWind?: boolean;
 *   notifyOnTornado?: boolean;
 *   notifyThresholdHailSize?: number;
 *   notifyRadiusMiles?: number;
 *   preferredContactMethod?: string;
 *   notes?: string;
 *   tags?: string[];
 * }
 */
router.post('/properties', async (req, res) => {
    try {
        const pool = getPool(req);
        const userEmail = req.headers['x-user-email'];
        if (!userEmail) {
            return res.status(401).json({ error: 'User email required' });
        }
        const userId = await getUserIdFromEmail(pool, userEmail);
        if (!userId) {
            return res.status(404).json({ error: 'User not found' });
        }
        const { customerName, address, city, state, zipCode } = req.body;
        let latitude = req.body.latitude;
        let longitude = req.body.longitude;
        // Validate required fields
        if (!customerName || !address || !city || !state || !zipCode) {
            return res.status(400).json({
                error: 'customerName, address, city, and state are required'
            });
        }
        if (latitude === undefined || longitude === undefined) {
            const geo = await geocodeAddress({ address, city, state, zipCode });
            if (geo) {
                latitude = geo.latitude;
                longitude = geo.longitude;
            }
        }
        if (latitude === undefined || longitude === undefined) {
            return res.status(400).json({
                error: 'latitude and longitude are required (enable location or provide a full address for geocoding)'
            });
        }
        const service = createImpactedAssetService(pool);
        const property = await service.addCustomerProperty({
            userId,
            ...req.body
        });
        console.log(`✅ Added customer property: ${customerName} at ${address}`);
        res.json({
            success: true,
            property
        });
    }
    catch (error) {
        console.error('❌ Error adding customer property:', error);
        res.status(500).json({ error: error.message });
    }
});
/**
 * GET /api/assets/properties
 * Get all customer properties for the user
 *
 * Query params:
 * - activeOnly?: boolean (default: true)
 */
router.get('/properties', async (req, res) => {
    try {
        const pool = getPool(req);
        const userEmail = req.headers['x-user-email'];
        if (!userEmail) {
            return res.status(401).json({ error: 'User email required' });
        }
        const userId = await getUserIdFromEmail(pool, userEmail);
        if (!userId) {
            return res.status(404).json({ error: 'User not found' });
        }
        const { activeOnly = 'true' } = req.query;
        const service = createImpactedAssetService(pool);
        const properties = await service.getUserProperties(userId, activeOnly === 'true');
        res.json({
            success: true,
            count: properties.length,
            properties
        });
    }
    catch (error) {
        console.error('❌ Error getting properties:', error);
        res.status(500).json({ error: error.message });
    }
});
/**
 * GET /api/assets/properties/:id
 * Get a single customer property by ID
 */
router.get('/properties/:id', async (req, res) => {
    try {
        const pool = getPool(req);
        const userEmail = req.headers['x-user-email'];
        if (!userEmail) {
            return res.status(401).json({ error: 'User email required' });
        }
        const userId = await getUserIdFromEmail(pool, userEmail);
        if (!userId) {
            return res.status(404).json({ error: 'User not found' });
        }
        const { id } = req.params;
        const service = createImpactedAssetService(pool);
        const property = await service.getPropertyById(id);
        if (!property) {
            return res.status(404).json({ error: 'Property not found' });
        }
        // Verify the property belongs to the user
        if (property.userId !== userId) {
            return res.status(403).json({ error: 'Access denied' });
        }
        res.json({
            success: true,
            property
        });
    }
    catch (error) {
        console.error('❌ Error getting property:', error);
        res.status(500).json({ error: error.message });
    }
});
/**
 * PUT /api/assets/properties/:id
 * Update a customer property
 *
 * Body: Partial<CustomerProperty>
 */
router.put('/properties/:id', async (req, res) => {
    try {
        const pool = getPool(req);
        const userEmail = req.headers['x-user-email'];
        if (!userEmail) {
            return res.status(401).json({ error: 'User email required' });
        }
        const userId = await getUserIdFromEmail(pool, userEmail);
        if (!userId) {
            return res.status(404).json({ error: 'User not found' });
        }
        const { id } = req.params;
        const service = createImpactedAssetService(pool);
        // Verify property belongs to user
        const existingProperty = await service.getPropertyById(id);
        if (!existingProperty) {
            return res.status(404).json({ error: 'Property not found' });
        }
        if (existingProperty.userId !== userId) {
            return res.status(403).json({ error: 'Access denied' });
        }
        const property = await service.updateProperty(id, req.body);
        console.log(`✅ Updated customer property: ${id}`);
        res.json({
            success: true,
            property
        });
    }
    catch (error) {
        console.error('❌ Error updating property:', error);
        res.status(500).json({ error: error.message });
    }
});
/**
 * DELETE /api/assets/properties/:id
 * Remove (deactivate) a customer property
 */
router.delete('/properties/:id', async (req, res) => {
    try {
        const pool = getPool(req);
        const userEmail = req.headers['x-user-email'];
        if (!userEmail) {
            return res.status(401).json({ error: 'User email required' });
        }
        const userId = await getUserIdFromEmail(pool, userEmail);
        if (!userId) {
            return res.status(404).json({ error: 'User not found' });
        }
        const { id } = req.params;
        const service = createImpactedAssetService(pool);
        const deleted = await service.deleteProperty(id, userId);
        if (!deleted) {
            return res.status(404).json({ error: 'Property not found or access denied' });
        }
        console.log(`✅ Deleted customer property: ${id}`);
        res.json({
            success: true,
            message: 'Property deleted'
        });
    }
    catch (error) {
        console.error('❌ Error deleting property:', error);
        res.status(500).json({ error: error.message });
    }
});
/**
 * GET /api/assets/alerts
 * Get pending impact alerts for the user
 */
router.get('/alerts', async (req, res) => {
    try {
        const pool = getPool(req);
        const userEmail = req.headers['x-user-email'];
        if (!userEmail) {
            return res.status(401).json({ error: 'User email required' });
        }
        const userId = await getUserIdFromEmail(pool, userEmail);
        if (!userId) {
            return res.status(404).json({ error: 'User not found' });
        }
        const service = createImpactedAssetService(pool);
        const alerts = await service.getPendingAlerts(userId);
        res.json({
            success: true,
            count: alerts.length,
            alerts
        });
    }
    catch (error) {
        console.error('❌ Error getting alerts:', error);
        res.status(500).json({ error: error.message });
    }
});
/**
 * PUT /api/assets/alerts/:id
 * Update alert status
 *
 * Body:
 * {
 *   status: string;
 *   outcome?: string;
 *   contactNotes?: string;
 * }
 */
router.put('/alerts/:id', async (req, res) => {
    try {
        const pool = getPool(req);
        const userEmail = req.headers['x-user-email'];
        if (!userEmail) {
            return res.status(401).json({ error: 'User email required' });
        }
        const userId = await getUserIdFromEmail(pool, userEmail);
        if (!userId) {
            return res.status(404).json({ error: 'User not found' });
        }
        const { id } = req.params;
        const { status, outcome, contactNotes } = req.body;
        if (!status) {
            return res.status(400).json({ error: 'status is required' });
        }
        const service = createImpactedAssetService(pool);
        const alert = await service.updateAlertStatus(id, status, outcome, contactNotes);
        if (!alert) {
            return res.status(404).json({ error: 'Alert not found' });
        }
        console.log(`✅ Updated alert status: ${id} to ${status}`);
        res.json({
            success: true,
            alert
        });
    }
    catch (error) {
        console.error('❌ Error updating alert:', error);
        res.status(500).json({ error: error.message });
    }
});
/**
 * POST /api/assets/alerts/:id/convert
 * Convert alert to job
 *
 * Body:
 * {
 *   jobId: string;
 * }
 */
router.post('/alerts/:id/convert', async (req, res) => {
    try {
        const pool = getPool(req);
        const userEmail = req.headers['x-user-email'];
        if (!userEmail) {
            return res.status(401).json({ error: 'User email required' });
        }
        const userId = await getUserIdFromEmail(pool, userEmail);
        if (!userId) {
            return res.status(404).json({ error: 'User not found' });
        }
        const { id } = req.params;
        const { jobId } = req.body;
        if (!jobId) {
            return res.status(400).json({ error: 'jobId is required' });
        }
        const service = createImpactedAssetService(pool);
        const alert = await service.convertAlert(id, jobId);
        if (!alert) {
            return res.status(404).json({ error: 'Alert not found' });
        }
        console.log(`✅ Converted alert to job: ${id} -> ${jobId}`);
        res.json({
            success: true,
            alert
        });
    }
    catch (error) {
        console.error('❌ Error converting alert:', error);
        res.status(500).json({ error: error.message });
    }
});
/**
 * GET /api/assets/stats
 * Get impact statistics for the user
 *
 * Query params:
 * - daysBack?: number (default: 90)
 */
router.get('/stats', async (req, res) => {
    try {
        const pool = getPool(req);
        const userEmail = req.headers['x-user-email'];
        if (!userEmail) {
            return res.status(401).json({ error: 'User email required' });
        }
        const userId = await getUserIdFromEmail(pool, userEmail);
        if (!userId) {
            return res.status(404).json({ error: 'User not found' });
        }
        const { daysBack = '90' } = req.query;
        const service = createImpactedAssetService(pool);
        let stats;
        try {
            stats = await service.getUserImpactStats(userId, parseInt(daysBack));
        }
        catch (statsError) {
            console.warn('⚠️ Impact stats unavailable, returning defaults:', statsError);
            stats = {
                totalProperties: 0,
                totalAlerts: 0,
                alertsPending: 0,
                alertsConverted: 0,
                conversionRate: 0,
                totalConversionValue: 0
            };
        }
        res.json({
            success: true,
            stats
        });
    }
    catch (error) {
        console.error('❌ Error getting stats:', error);
        res.status(500).json({ error: error.message });
    }
});
/**
 * POST /api/assets/check-storm
 * Manually check storm impact against customer properties
 *
 * Body:
 * {
 *   latitude: number;
 *   longitude: number;
 *   eventType: string;
 *   stormDate: string;
 *   hailSize?: number;
 *   windSpeed?: number;
 *   stormEventId?: string;
 * }
 */
router.post('/check-storm', async (req, res) => {
    try {
        const pool = getPool(req);
        const userEmail = req.headers['x-user-email'];
        if (!userEmail) {
            return res.status(401).json({ error: 'User email required' });
        }
        const userId = await getUserIdFromEmail(pool, userEmail);
        if (!userId) {
            return res.status(404).json({ error: 'User not found' });
        }
        const { latitude, longitude, eventType, stormDate } = req.body;
        // Validate required fields
        if (latitude === undefined || longitude === undefined || !eventType || !stormDate) {
            return res.status(400).json({
                error: 'latitude, longitude, eventType, and stormDate are required'
            });
        }
        const service = createImpactedAssetService(pool);
        // Create impact alerts
        const alerts = await service.createImpactAlerts(req.body);
        console.log(`✅ Created ${alerts.length} impact alerts for storm check`);
        res.json({
            success: true,
            alertsGenerated: alerts.length,
            alerts
        });
    }
    catch (error) {
        console.error('❌ Error checking storm impact:', error);
        res.status(500).json({ error: error.message });
    }
});
export default router;
