import { Router } from 'express';
import { hailMapsService } from '../services/hailMapsService.js';
import { noaaStormService } from '../services/noaaStormService.js';
const router = Router();
/**
 * Multi-provider geocoding - Census Bureau + Nominatim fallback
 */
const geocodeForHailSearch = async (params) => {
    const { address = '', city = '', state = '', zip = '' } = params;
    // Try Census Bureau first (best for US addresses)
    if (address && city && state) {
        try {
            const addressLine = `${address}, ${city}, ${state} ${zip}`.trim();
            const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?` +
                `address=${encodeURIComponent(addressLine)}&` +
                `benchmark=Public_AR_Current&format=json`;
            console.log('🔍 Hail search geocoding with Census Bureau:', addressLine);
            const response = await fetch(url);
            const data = await response.json();
            if (data.result?.addressMatches?.length > 0) {
                const coords = data.result.addressMatches[0].coordinates;
                console.log('✅ Census geocoding succeeded:', coords);
                return { lat: coords.y, lng: coords.x };
            }
        }
        catch (e) {
            console.error('Census geocoding error:', e);
        }
    }
    // Fallback to Nominatim
    try {
        const queryParts = [address, city, state, zip].filter(Boolean);
        const query = queryParts.join(', ');
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=us`;
        console.log('🔍 Hail search geocoding with Nominatim:', query);
        const response = await fetch(url, {
            headers: { 'User-Agent': 'RoofER-GeminiFieldAssistant/1.0' }
        });
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
            console.log('✅ Nominatim geocoding succeeded');
            return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        }
    }
    catch (e) {
        console.error('Nominatim geocoding error:', e);
    }
    return null;
};
// GET /api/hail/status
router.get('/status', (_req, res) => {
    const ihmConfigured = hailMapsService.isConfigured();
    res.json({
        ihmConfigured,
        noaaAvailable: true,
        message: ihmConfigured
            ? 'IHM and NOAA data available'
            : 'NOAA data available (IHM not configured)',
        provider: ihmConfigured ? 'Interactive Hail Maps + NOAA' : 'NOAA Storm Events Database'
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
        const { address, lat, lng, months = '24', radius = '50', marker_id, street, city, state, zip } = req.query;
        const monthsNum = parseInt(months, 10);
        const radiusNum = parseFloat(radius);
        const yearsNum = Math.ceil(monthsNum / 12);
        const ihmConfigured = hailMapsService.isConfigured();
        let ihmData = null;
        let noaaData = [];
        const dataSources = [];
        // Extract coordinates from request
        let searchLat = lat ? parseFloat(lat) : null;
        let searchLng = lng ? parseFloat(lng) : null;
        // Handle marker_id (IHM only)
        if (marker_id) {
            if (!ihmConfigured) {
                return res.status(503).json({ error: 'Marker ID search requires IHM configuration' });
            }
            const data = await hailMapsService.searchByMarkerId(marker_id, monthsNum);
            return res.json({ ...data, dataSource: ['IHM'] });
        }
        // Handle address-based search
        if (street || city || state || zip) {
            if (!street || !city || !state || !zip) {
                return res.status(400).json({ error: 'street, city, state, and zip are required' });
            }
            // Try IHM if configured
            if (ihmConfigured) {
                try {
                    ihmData = await hailMapsService.searchByAddress({
                        street: String(street),
                        city: String(city),
                        state: String(state),
                        zip: String(zip)
                    }, monthsNum);
                    dataSources.push('IHM');
                    // Extract coordinates from IHM response
                    if (ihmData?.searchArea?.center) {
                        searchLat = ihmData.searchArea.center.lat;
                        searchLng = ihmData.searchArea.center.lng;
                    }
                }
                catch (error) {
                    console.error('IHM search error:', error);
                }
            }
            // If we don't have coordinates yet, geocode
            if (!searchLat || !searchLng) {
                const geocodeResult = await geocodeForHailSearch({
                    address: String(street),
                    city: String(city),
                    state: String(state),
                    zip: String(zip)
                });
                if (geocodeResult) {
                    searchLat = geocodeResult.lat;
                    searchLng = geocodeResult.lng;
                }
            }
            // Always fetch NOAA data if we have coordinates
            if (searchLat && searchLng) {
                try {
                    noaaData = await noaaStormService.getStormEvents(searchLat, searchLng, radiusNum, yearsNum);
                    dataSources.push('NOAA');
                }
                catch (error) {
                    console.error('NOAA search error:', error);
                }
            }
            return res.json({
                events: ihmData?.events || [],
                noaaEvents: noaaData,
                searchArea: ihmData?.searchArea || {
                    center: { lat: searchLat, lng: searchLng },
                    radiusMiles: radiusNum
                },
                dataSource: dataSources,
                message: ihmConfigured ? 'IHM and NOAA data' : 'NOAA data only (IHM not configured)'
            });
        }
        // Handle coordinate-based search
        if (lat && lng) {
            searchLat = parseFloat(lat);
            searchLng = parseFloat(lng);
            // Try IHM if configured
            if (ihmConfigured) {
                try {
                    ihmData = await hailMapsService.searchByCoordinates(searchLat, searchLng, monthsNum, radiusNum);
                    dataSources.push('IHM');
                }
                catch (error) {
                    console.error('IHM search error:', error);
                }
            }
            // Always fetch NOAA data
            try {
                noaaData = await noaaStormService.getStormEvents(searchLat, searchLng, radiusNum, yearsNum);
                dataSources.push('NOAA');
            }
            catch (error) {
                console.error('NOAA search error:', error);
            }
            return res.json({
                events: ihmData?.events || [],
                noaaEvents: noaaData,
                searchArea: ihmData?.searchArea || {
                    center: { lat: searchLat, lng: searchLng },
                    radiusMiles: radiusNum
                },
                dataSource: dataSources,
                message: ihmConfigured ? 'IHM and NOAA data' : 'NOAA data only (IHM not configured)'
            });
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
// POST /api/hail/search-advanced - Advanced search with multiple criteria
router.post('/search-advanced', async (req, res) => {
    try {
        const { address, city, state, zip, latitude, longitude, startDate, endDate, minHailSize, radius = 50 } = req.body;
        let lat = latitude;
        let lng = longitude;
        // Calculate months from date range or use default
        let months = 24;
        if (startDate && endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);
            months = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30));
        }
        const years = Math.ceil(months / 12);
        const ihmConfigured = hailMapsService.isConfigured();
        let ihmData = null;
        let noaaData = [];
        const dataSources = [];
        // If we have city, state, and zip - use address search
        if (city && state && zip) {
            // Try IHM if configured
            if (ihmConfigured) {
                try {
                    ihmData = await hailMapsService.searchByAddress({
                        street: address || '',
                        city,
                        state,
                        zip
                    }, months);
                    dataSources.push('IHM');
                    // Extract coordinates from IHM response
                    if (ihmData?.searchArea?.center) {
                        lat = ihmData.searchArea.center.lat;
                        lng = ihmData.searchArea.center.lng;
                    }
                }
                catch (error) {
                    console.error('IHM search error:', error);
                }
            }
            // If we don't have coordinates yet, geocode
            if (!lat || !lng) {
                const geocodeResult = await geocodeForHailSearch({ address, city, state, zip });
                if (geocodeResult) {
                    lat = geocodeResult.lat;
                    lng = geocodeResult.lng;
                }
            }
            // Fetch NOAA data if we have coordinates
            if (lat && lng) {
                try {
                    noaaData = await noaaStormService.getStormEvents(lat, lng, parseFloat(radius), years);
                    dataSources.push('NOAA');
                }
                catch (error) {
                    console.error('NOAA search error:', error);
                }
            }
            // Filter by hail size if specified
            let filteredIhmEvents = ihmData?.events || [];
            if (minHailSize) {
                filteredIhmEvents = filteredIhmEvents.filter((event) => event.hailSize && event.hailSize >= minHailSize);
            }
            let filteredNoaaEvents = noaaData;
            if (minHailSize) {
                filteredNoaaEvents = noaaData.filter((event) => event.magnitude && event.magnitude >= minHailSize);
            }
            return res.json({
                events: filteredIhmEvents,
                noaaEvents: filteredNoaaEvents,
                resultsCount: filteredIhmEvents.length + filteredNoaaEvents.length,
                searchArea: ihmData?.searchArea || {
                    center: { lat, lng },
                    radiusMiles: parseFloat(radius)
                },
                searchCriteria: {
                    address,
                    city,
                    state,
                    zip,
                    latitude: lat,
                    longitude: lng,
                    startDate,
                    endDate,
                    minHailSize,
                    radius
                },
                dataSource: dataSources,
                message: ihmConfigured ? 'IHM and NOAA data' : 'NOAA data only (IHM not configured)'
            });
        }
        // If we have address/city/state but no zip, geocode first
        if ((address || city) && state && !zip && !lat && !lng) {
            // Use multi-provider geocoding (Census Bureau + Nominatim fallback)
            const geocodeResult = await geocodeForHailSearch({ address, city, state });
            if (!geocodeResult) {
                return res.status(400).json({ error: 'Address not found. Try adding a ZIP code for better results.' });
            }
            lat = geocodeResult.lat;
            lng = geocodeResult.lng;
            console.log(`✅ Geocoded "${address}, ${city}, ${state}" to ${lat}, ${lng}`);
        }
        // Search by coordinates
        if (lat && lng) {
            // Try IHM if configured
            if (ihmConfigured) {
                try {
                    ihmData = await hailMapsService.searchByCoordinates(parseFloat(lat), parseFloat(lng), months, parseFloat(radius));
                    dataSources.push('IHM');
                }
                catch (error) {
                    console.error('IHM search error:', error);
                }
            }
            // Always fetch NOAA data
            try {
                noaaData = await noaaStormService.getStormEvents(parseFloat(lat), parseFloat(lng), parseFloat(radius), years);
                dataSources.push('NOAA');
            }
            catch (error) {
                console.error('NOAA search error:', error);
            }
            // Filter by hail size if specified
            let filteredIhmEvents = ihmData?.events || [];
            if (minHailSize) {
                filteredIhmEvents = filteredIhmEvents.filter((event) => event.hailSize && event.hailSize >= minHailSize);
            }
            let filteredNoaaEvents = noaaData;
            if (minHailSize) {
                filteredNoaaEvents = noaaData.filter((event) => event.magnitude && event.magnitude >= minHailSize);
            }
            return res.json({
                events: filteredIhmEvents,
                noaaEvents: filteredNoaaEvents,
                resultsCount: filteredIhmEvents.length + filteredNoaaEvents.length,
                searchArea: ihmData?.searchArea || {
                    center: { lat: parseFloat(lat), lng: parseFloat(lng) },
                    radiusMiles: parseFloat(radius)
                },
                searchCriteria: {
                    address,
                    city,
                    state,
                    zip,
                    latitude: lat,
                    longitude: lng,
                    startDate,
                    endDate,
                    minHailSize,
                    radius
                },
                dataSource: dataSources,
                message: ihmConfigured ? 'IHM and NOAA data' : 'NOAA data only (IHM not configured)'
            });
        }
        return res.status(400).json({ error: 'Provide city and state (optionally address), ZIP code, or coordinates' });
    }
    catch (error) {
        console.error('❌ Advanced hail search error:', error);
        res.status(500).json({ error: error.message });
    }
});
// POST /api/hail/reports - Save a search as a report
router.post('/reports', async (req, res) => {
    try {
        const pool = req.app.get('pool');
        const { userId, name, searchCriteria, resultsCount, ihmEventsCount, noaaEventsCount, maxHailSize, avgHailSize } = req.body;
        if (!userId || !name || !searchCriteria) {
            return res.status(400).json({ error: 'userId, name, and searchCriteria are required' });
        }
        const result = await pool.query(`INSERT INTO hail_reports (
        user_id, name, search_criteria, results_count,
        ihm_events_count, noaa_events_count, max_hail_size, avg_hail_size
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`, [
            userId,
            name,
            JSON.stringify(searchCriteria),
            resultsCount || 0,
            ihmEventsCount || 0,
            noaaEventsCount || 0,
            maxHailSize || null,
            avgHailSize || null
        ]);
        res.json({ success: true, report: result.rows[0] });
    }
    catch (error) {
        console.error('❌ Save hail report error:', error);
        res.status(500).json({ error: error.message });
    }
});
// GET /api/hail/reports?userId=xxx - Get user's saved reports
router.get('/reports', async (req, res) => {
    try {
        const pool = req.app.get('pool');
        const { userId } = req.query;
        if (!userId) {
            return res.status(400).json({ error: 'userId is required' });
        }
        const result = await pool.query(`SELECT * FROM hail_reports
       WHERE user_id = $1
       ORDER BY created_at DESC`, [userId]);
        res.json({ reports: result.rows });
    }
    catch (error) {
        console.error('❌ Get hail reports error:', error);
        res.status(500).json({ error: error.message });
    }
});
// DELETE /api/hail/reports/:id - Delete a saved report
router.delete('/reports/:id', async (req, res) => {
    try {
        const pool = req.app.get('pool');
        const { id } = req.params;
        const result = await pool.query(`DELETE FROM hail_reports WHERE id = $1 RETURNING id`, [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Report not found' });
        }
        res.json({ success: true, deletedId: result.rows[0].id });
    }
    catch (error) {
        console.error('❌ Delete hail report error:', error);
        res.status(500).json({ error: error.message });
    }
});
// PUT /api/hail/reports/:id/access - Update last accessed time
router.put('/reports/:id/access', async (req, res) => {
    try {
        const pool = req.app.get('pool');
        const { id } = req.params;
        await pool.query(`UPDATE hail_reports SET last_accessed_at = NOW() WHERE id = $1`, [id]);
        res.json({ success: true });
    }
    catch (error) {
        console.error('❌ Update report access error:', error);
        res.status(500).json({ error: error.message });
    }
});
export default router;
