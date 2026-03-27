import { Router } from 'express';
import { hailMapsService } from '../services/hailMapsService.js';
import { noaaStormService } from '../services/noaaStormService.js';
import { damageScoreService } from '../services/damageScoreService.js';
import { hotZoneService } from '../services/hotZoneService.js';
import { pdfReportService } from '../services/pdfReportService.js';
import { pdfReportServiceV2 } from '../services/pdfReportServiceV2.js';
import { hailtraceImportService } from '../services/hailtraceImportService.js';
import { getHistoricalMrmsOverlay } from '../services/historicalMrmsService.js';
import { fetchNexradImage } from '../services/nexradService.js';
import { fetchNWSAlerts } from '../services/nwsAlertService.js';
import { fetchMapImage } from '../services/mapImageService.js';
import { weatherService } from '../services/weatherService.js';
import { assessPropertyRisk } from '../services/propertyRiskService.js';
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
// GET /api/hail/geocode?q=<address|city|zip>
// Server-side proxy for Census Bureau geocoding (avoids CORS on the client)
router.get('/geocode', async (req, res) => {
    const q = (req.query.q || '').trim();
    if (!q)
        return res.status(400).json({ error: 'Missing ?q= parameter' });
    try {
        const params = new URLSearchParams({ address: q, benchmark: 'Public_AR_Current', format: 'json' });
        const censusRes = await fetch(`https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?${params}`);
        if (censusRes.ok) {
            const data = await censusRes.json();
            const matches = data?.result?.addressMatches;
            if (matches?.length) {
                const f = matches[0];
                return res.json({ address: f.matchedAddress, lat: f.coordinates.y, lng: f.coordinates.x });
            }
        }
        // Fallback to Nominatim
        const nomRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=us`, {
            headers: { 'User-Agent': 'RoofER-GeminiFieldAssistant/1.0' }
        });
        const nomData = await nomRes.json();
        if (Array.isArray(nomData) && nomData.length > 0) {
            return res.json({ address: nomData[0].display_name, lat: parseFloat(nomData[0].lat), lng: parseFloat(nomData[0].lon) });
        }
        return res.json({ address: null, lat: null, lng: null });
    }
    catch (err) {
        console.error('Geocode proxy error:', err);
        return res.status(500).json({ error: 'Geocoding failed' });
    }
});
// GET /api/hail/reverse-geocode?lat=<lat>&lng=<lng>
router.get('/reverse-geocode', async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return res.status(400).json({ error: 'Missing or invalid lat/lng parameters' });
    }
    try {
        const params = new URLSearchParams({
            lat: lat.toString(),
            lon: lng.toString(),
            format: 'jsonv2',
            zoom: '18',
            addressdetails: '1',
        });
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, {
            headers: { 'User-Agent': 'RoofER-GeminiFieldAssistant/1.0' },
        });
        if (!response.ok) {
            return res.json({ address: null });
        }
        const data = await response.json();
        return res.json({ address: data?.display_name || null });
    }
    catch (err) {
        console.error('Reverse geocode proxy error:', err);
        return res.status(500).json({ error: 'Reverse geocoding failed' });
    }
});
// GET /api/hail/status
router.get('/status', (_req, res) => {
    const ihmConfigured = hailMapsService.isConfigured();
    const vcConfigured = weatherService.isConfigured();
    const sources = ['NOAA Storm Events Database', 'NWS Alerts', 'NEXRAD Radar'];
    if (ihmConfigured)
        sources.push('Interactive Hail Maps (legacy)');
    if (vcConfigured)
        sources.push('Visual Crossing Weather');
    res.json({
        noaaAvailable: true,
        nwsAvailable: true,
        nexradAvailable: true,
        ihmConfigured,
        visualCrossingConfigured: vcConfigured,
        primarySource: 'NOAA Storm Events Database',
        activeSources: sources,
        message: `${sources.length} data sources active`,
        provider: sources.join(' + ')
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
        let weatherData = [];
        const dataSources = [];
        // Helper: fetch Visual Crossing weather data (wind/thunderstorm events)
        const fetchWeatherData = async (sLat, sLng) => {
            if (weatherService.isConfigured()) {
                try {
                    weatherData = await weatherService.getStormEvents(sLat, sLng, monthsNum);
                    if (weatherData.length > 0)
                        dataSources.push('VisualCrossing');
                }
                catch (error) {
                    console.error('Visual Crossing error:', error);
                }
            }
        };
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
            // Fetch NOAA + Visual Crossing in parallel
            if (searchLat && searchLng) {
                await Promise.all([
                    noaaStormService.getStormEvents(searchLat, searchLng, radiusNum, yearsNum)
                        .then(d => { noaaData = d; dataSources.push('NOAA'); })
                        .catch(e => console.error('NOAA search error:', e)),
                    fetchWeatherData(searchLat, searchLng)
                ]);
            }
            return res.json({
                events: ihmData?.events || [],
                noaaEvents: noaaData,
                weatherEvents: weatherData,
                searchArea: ihmData?.searchArea || {
                    center: { lat: searchLat, lng: searchLng },
                    radiusMiles: radiusNum
                },
                dataSource: dataSources,
                message: `NOAA Storm Events Database${ihmConfigured ? ' + IHM' : ''}${weatherData.length > 0 ? ' + Visual Crossing' : ''}`
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
            // Fetch NOAA + Visual Crossing in parallel
            await Promise.all([
                noaaStormService.getStormEvents(searchLat, searchLng, radiusNum, yearsNum)
                    .then(d => { noaaData = d; dataSources.push('NOAA'); })
                    .catch(e => console.error('NOAA search error:', e)),
                fetchWeatherData(searchLat, searchLng)
            ]);
            return res.json({
                events: ihmData?.events || [],
                noaaEvents: noaaData,
                weatherEvents: weatherData,
                searchArea: ihmData?.searchArea || {
                    center: { lat: searchLat, lng: searchLng },
                    radiusMiles: radiusNum
                },
                dataSource: dataSources,
                message: `NOAA Storm Events Database${ihmConfigured ? ' + IHM' : ''}${weatherData.length > 0 ? ' + Visual Crossing' : ''}`
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
                message: dataSources.join(" + ") || "NOAA Storm Events Database"
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
                message: dataSources.join(" + ") || "NOAA Storm Events Database"
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
// POST /api/hail/damage-score - Calculate damage score for a location
router.post('/damage-score', async (req, res) => {
    try {
        const { lat, lng, address, events, noaaEvents } = req.body;
        // Validate input
        if (!lat && !lng && !address) {
            return res.status(400).json({
                error: 'Either coordinates (lat/lng) or address is required'
            });
        }
        // Calculate damage score
        const result = damageScoreService.calculateDamageScore({
            lat,
            lng,
            address,
            events: events || [],
            noaaEvents: noaaEvents || [],
        });
        console.log(`✅ Damage score calculated: ${result.score} (${result.riskLevel}) for ${address || `${lat},${lng}`}`);
        res.json(result);
    }
    catch (error) {
        console.error('❌ Damage score calculation error:', error);
        res.status(500).json({ error: error.message });
    }
});
// GET /api/hail/property-risk - Assess property-level risk factors (roof age, vulnerability)
router.get('/property-risk', async (req, res) => {
    try {
        const { lat, lng, zip, address } = req.query;
        if (!zip && (!lat || !lng)) {
            return res.status(400).json({ error: 'zip or lat/lng required' });
        }
        const result = await assessPropertyRisk({
            lat: lat ? parseFloat(lat) : 0,
            lng: lng ? parseFloat(lng) : 0,
            zip: zip,
            address: address
        });
        res.json(result);
    }
    catch (error) {
        console.error('Property risk error:', error);
        res.status(500).json({ error: error.message });
    }
});
// GET /api/hail/hot-zones - Get hot zones for canvassing
router.get('/hot-zones', async (req, res) => {
    try {
        const { territoryId, north, south, east, west, lat, lng, radius } = req.query;
        // Build params for hot zone service
        const params = {};
        if (territoryId) {
            // Fetch territory bounds from database
            const pool = req.app.get('pool');
            const result = await pool.query(`SELECT north_lat, south_lat, east_lng, west_lng FROM territories WHERE id = $1`, [territoryId]);
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Territory not found' });
            }
            const territory = result.rows[0];
            params.north = territory.north_lat;
            params.south = territory.south_lat;
            params.east = territory.east_lng;
            params.west = territory.west_lng;
        }
        else if (north && south && east && west) {
            // Use provided bounds
            params.north = parseFloat(north);
            params.south = parseFloat(south);
            params.east = parseFloat(east);
            params.west = parseFloat(west);
        }
        else if (lat && lng) {
            // Use center point with optional radius
            params.centerLat = parseFloat(lat);
            params.centerLng = parseFloat(lng);
            params.radiusMiles = radius ? parseFloat(radius) : 50;
        }
        else {
            return res.status(400).json({
                error: 'Provide territoryId, bounding box (north/south/east/west), or center coordinates (lat/lng)'
            });
        }
        console.log('🔥 Hot zones request:', params);
        const hotZones = await hotZoneService.getHotZones(params);
        res.json({
            success: true,
            hotZones,
            count: hotZones.length,
            message: `Found ${hotZones.length} hot zones for canvassing`
        });
    }
    catch (error) {
        console.error('❌ Hot zones error:', error);
        res.status(500).json({ error: error.message });
    }
});
// POST /api/hail/generate-report - Generate Curran-style PDF report
router.post('/generate-report', async (req, res) => {
    try {
        const { address, city, state, lat, lng, radius, events, noaaEvents, damageScore, repName, repPhone, repEmail, companyName, filter, includeNexrad = true, includeMap = true, includeWarnings = true, customerName, dateOfLoss, template = 'standard' } = req.body;
        // Validate required fields
        if (!address || !lat || !lng || !radius || !damageScore) {
            return res.status(400).json({
                error: 'Missing required fields: address, lat, lng, radius, damageScore'
            });
        }
        // Validate filter if provided
        const validFilters = ['all', 'hail-only', 'hail-wind', 'ihm-only', 'noaa-only'];
        const reportFilter = validFilters.includes(filter) ? filter : 'all';
        const parsedLat = parseFloat(lat);
        const parsedLng = parseFloat(lng);
        console.log(`📄 Generating Curran-style PDF report for ${address} (filter: ${reportFilter})...`);
        const getDateKey = (value) => {
            if (!value)
                return null;
            const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
            return match ? match[1] : null;
        };
        const isDateOnly = (value) => {
            return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
        };
        const parseReportDate = (value) => {
            if (!value)
                return null;
            const dateOnlyMatch = value.match(/^(\d{4}-\d{2}-\d{2})$/);
            const parsed = dateOnlyMatch
                ? new Date(`${dateOnlyMatch[1]}T12:00:00Z`)
                : new Date(value);
            return Number.isNaN(parsed.getTime()) ? null : parsed;
        };
        const combinedSourceEvents = [...(events || []), ...(noaaEvents || [])];
        const preferredTimestampByDate = new Map();
        for (const event of combinedSourceEvents) {
            const eventDate = typeof event?.date === 'string' ? event.date : '';
            const dateKey = getDateKey(eventDate);
            const parsed = parseReportDate(eventDate);
            if (!dateKey || !parsed || isDateOnly(eventDate))
                continue;
            const existing = preferredTimestampByDate.get(dateKey);
            const existingParsed = parseReportDate(existing);
            if (!existingParsed || parsed.getTime() > existingParsed.getTime()) {
                preferredTimestampByDate.set(dateKey, eventDate);
            }
        }
        const normalizeEventDate = (value) => {
            const raw = typeof value === 'string' ? value : '';
            const dateKey = getDateKey(raw);
            if (!dateKey)
                return raw;
            if (!isDateOnly(raw))
                return raw;
            return preferredTimestampByDate.get(dateKey) || `${dateKey}T17:00:00-04:00`;
        };
        const normalizedEvents = (events || []).map((event) => ({
            ...event,
            date: normalizeEventDate(event?.date),
        }));
        const normalizedNoaaEvents = (noaaEvents || []).map((event) => ({
            ...event,
            date: normalizeEventDate(event?.date),
        }));
        // Determine primary storm date from events for NEXRAD/NWS queries
        const allDates = [
            ...normalizedEvents.map((e) => e.date),
            ...normalizedNoaaEvents.map((e) => e.date)
        ]
            .filter(Boolean)
            .sort((a, b) => (parseReportDate(b)?.getTime() || 0) - (parseReportDate(a)?.getTime() || 0));
        const selectedLossDates = dateOfLoss
            ? allDates.filter((value) => getDateKey(value) === dateOfLoss)
            : [];
        const primaryStormDate = selectedLossDates[0] || allDates[0] || normalizeEventDate(dateOfLoss) || new Date().toISOString();
        const earliestDate = selectedLossDates[selectedLossDates.length - 1] || allDates[allDates.length - 1] || primaryStormDate;
        // Step 1: Fetch NWS alerts + map image + property risk in parallel
        // Extract zip from request body for Census lookup
        const { zip } = req.body;
        const [nwsAlerts, mapImage, propertyRiskData] = await Promise.all([
            includeWarnings
                ? fetchNWSAlerts({ lat: parsedLat, lng: parsedLng, startDate: earliestDate, endDate: primaryStormDate }).catch(e => { console.warn('NWS alerts fetch failed:', e.message); return []; })
                : Promise.resolve([]),
            includeMap
                ? fetchMapImage({ lat: parsedLat, lng: parsedLng, zoom: 15 }).catch(e => { console.warn('Map image fetch failed:', e.message); return null; })
                : Promise.resolve(null),
            zip
                ? assessPropertyRisk({ lat: parsedLat, lng: parsedLng, zip }).catch(() => null)
                : Promise.resolve(null)
        ]);
        // Step 2: Fetch per-alert NEXRAD radar images in parallel (up to 5 alerts)
        // If NWS returned real alerts, use those. Otherwise, synthesize from event dates
        // so we still get per-event radar snapshots in the IHM layout.
        const realAlerts = (nwsAlerts || []).slice(0, 5);
        // Build synthetic alerts from event data when NWS has no historical results
        const syntheticAlerts = realAlerts.length === 0
            ? [...new Set([...normalizedEvents, ...normalizedNoaaEvents].map((e) => e.date))]
                .sort((a, b) => (parseReportDate(a)?.getTime() || 0) - (parseReportDate(b)?.getTime() || 0))
                .slice(0, 5)
                .map((date, idx) => {
                const matchingEvent = [...normalizedEvents, ...normalizedNoaaEvents].find((e) => e.date === date);
                const isHail = matchingEvent && ('hailSize' in matchingEvent || matchingEvent.eventType === 'hail');
                const isWind = matchingEvent && matchingEvent.eventType === 'wind';
                const isTornado = matchingEvent && matchingEvent.eventType === 'tornado';
                const mag = matchingEvent?.magnitude || matchingEvent?.hailSize;
                // Build event-type-specific description
                let desc = matchingEvent?.comments || '';
                if (!desc) {
                    const timeStr = new Date(date).toLocaleString('en-US', { timeZone: 'America/New_York' });
                    desc = `Storm event recorded at ${timeStr}.`;
                    if (isHail && mag)
                        desc += ` Hail size: ${mag} inches.`;
                    else if (isWind && mag)
                        desc += ` Wind gust: ${mag} knots (${Math.round(mag * 1.15)} mph).`;
                    else if (isTornado)
                        desc += ` Tornado reported.`;
                }
                // Event-specific hailSize and windSpeed for the alert
                const alertHailSize = isHail && mag ? `${mag}"` : null;
                const alertWindSpeed = isWind && mag ? `${Math.round(mag * 1.15)} mph` : null;
                return {
                    id: `synthetic-${idx}`,
                    headline: `${isWind ? 'Damaging wind' : isTornado ? 'Tornado' : 'Severe hail'} activity near ${address}`,
                    description: desc,
                    severity: (isTornado || (isHail && mag > 1.5) || (isWind && mag > 65)) ? 'Severe' : 'Moderate',
                    certainty: 'Observed',
                    event: isTornado ? 'Tornado Warning' : 'Severe Thunderstorm Warning',
                    onset: date,
                    expires: new Date(new Date(date).getTime() + 30 * 60 * 1000).toISOString(),
                    senderName: 'NOAA Storm Events Database',
                    areaDesc: `${city || ''} ${state || ''}`.trim() || 'Local area',
                    hailSize: alertHailSize,
                    windSpeed: alertWindSpeed
                };
            })
            : [];
        const alertsToProcess = realAlerts.length > 0 ? realAlerts : syntheticAlerts;
        let nwsAlertImages = [];
        let nexradResult = null;
        if (includeNexrad && alertsToProcess.length > 0) {
            nwsAlertImages = await Promise.all(alertsToProcess.map(async (alert) => {
                const radarTs = alert.onset || primaryStormDate;
                const result = await fetchNexradImage({ lat: parsedLat, lng: parsedLng, datetime: radarTs })
                    .catch(e => { console.warn(`NEXRAD fetch failed for alert ${alert.event}:`, e.message); return null; });
                return {
                    alert,
                    radarImage: result?.imageBuffer || null,
                    radarTimestamp: radarTs
                };
            }));
            console.log(`📡 Fetched ${nwsAlertImages.filter(a => a.radarImage).length}/${alertsToProcess.length} per-alert NEXRAD images (${realAlerts.length > 0 ? 'real NWS' : 'synthetic from events'})`);
        }
        else if (includeNexrad) {
            // No alerts and no events — fetch single NEXRAD for the primary storm date
            nexradResult = await fetchNexradImage({ lat: parsedLat, lng: parsedLng, datetime: primaryStormDate })
                .catch(e => { console.warn('NEXRAD fetch failed:', e.message); return null; });
        }
        console.log(`📊 Supplemental data: NEXRAD=${nwsAlertImages.length > 0 ? `${nwsAlertImages.length} per-alert` : (nexradResult ? 'single' : 'no')}, NWS=${(nwsAlerts || []).length} alerts, Map=${mapImage ? 'yes' : 'no'}`);
        // Select template: 'standard' (IHM-style) or 'noaa-forward' (federal data emphasis)
        const useV2 = template === 'noaa-forward' || template === 'v2';
        const reportService = useV2 ? pdfReportServiceV2 : pdfReportService;
        console.log(`📄 Using ${useV2 ? 'NOAA-Forward (V2)' : 'Standard (IHM)'} template`);
        // Generate PDF stream
        const pdfStream = reportService.generateReport({
            address,
            city,
            state,
            lat: parsedLat,
            lng: parsedLng,
            radius: parseFloat(radius),
            noaaEvents: normalizedNoaaEvents,
            dateOfLoss,
            events: normalizedEvents,
            damageScore,
            repName,
            repPhone,
            repEmail,
            companyName,
            filter: reportFilter,
            mapImage: mapImage || undefined,
            nexradImage: nexradResult?.imageBuffer || undefined,
            nexradTimestamp: nexradResult?.timestamp || undefined,
            nwsAlerts: nwsAlerts || undefined,
            nwsAlertImages: nwsAlertImages.length > 0 ? nwsAlertImages : undefined,
            includeNexrad,
            includeMap,
            includeWarnings,
            customerName,
            propertyRisk: propertyRiskData ? {
                estimatedRoofAge: propertyRiskData.factors.estimatedRoofAge,
                medianYearBuilt: propertyRiskData.factors.medianYearBuilt,
                roofVulnerability: propertyRiskData.factors.roofVulnerability,
                riskMultiplier: propertyRiskData.riskMultiplier
            } : undefined
        });
        // Set response headers for PDF download
        const filename = `Storm_Report_${address.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        // Pipe the PDF stream to response
        pdfStream.pipe(res);
        pdfStream.on('end', () => {
            console.log(`✅ PDF report generated successfully: ${filename}`);
        });
        pdfStream.on('error', (error) => {
            console.error('❌ PDF generation error:', error);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Failed to generate PDF report' });
            }
        });
    }
    catch (error) {
        console.error('❌ PDF report generation error:', error);
        res.status(500).json({ error: error.message });
    }
});
// GET /api/hail/nws-warnings - Fetch NWS severe weather warnings for location
router.get('/nws-warnings', async (req, res) => {
    try {
        const { lat, lng, startDate, endDate } = req.query;
        if (!lat || !lng) {
            return res.status(400).json({ error: 'lat and lng are required' });
        }
        const parsedLat = parseFloat(lat);
        const parsedLng = parseFloat(lng);
        const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const end = endDate || new Date().toISOString();
        const alerts = await fetchNWSAlerts({
            lat: parsedLat,
            lng: parsedLng,
            startDate: start,
            endDate: end
        });
        res.json({ alerts, count: alerts.length });
    }
    catch (error) {
        console.error('NWS warnings error:', error);
        res.status(500).json({ error: error.message });
    }
});
// GET /api/hail/nexrad-image - Serve historical NEXRAD radar image for map overlay
router.get('/nexrad-image', async (req, res) => {
    try {
        const { lat, lng, datetime, zoom } = req.query;
        if (!lat || !lng || !datetime) {
            return res.status(400).json({ error: 'lat, lng, and datetime are required' });
        }
        const result = await fetchNexradImage({
            lat: parseFloat(lat),
            lng: parseFloat(lng),
            datetime: datetime,
            zoomMiles: zoom ? parseFloat(zoom) : 50,
            width: 800,
            height: 600
        });
        if (!result) {
            return res.status(404).json({ error: 'No radar data available for this time/location' });
        }
        // Return image as PNG with bbox metadata in headers
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('X-Radar-Bbox', JSON.stringify(result.bbox));
        res.setHeader('X-Radar-Timestamp', result.timestamp);
        res.setHeader('Access-Control-Expose-Headers', 'X-Radar-Bbox, X-Radar-Timestamp');
        res.send(result.imageBuffer);
    }
    catch (error) {
        console.error('NEXRAD image error:', error);
        res.status(500).json({ error: error.message });
    }
});
// GET /api/hail/nexrad-meta - Get NEXRAD image as base64 with bbox (for Leaflet ImageOverlay)
router.get('/nexrad-meta', async (req, res) => {
    try {
        const { lat, lng, datetime, zoom } = req.query;
        if (!lat || !lng || !datetime) {
            return res.status(400).json({ error: 'lat, lng, and datetime are required' });
        }
        const result = await fetchNexradImage({
            lat: parseFloat(lat),
            lng: parseFloat(lng),
            datetime: datetime,
            zoomMiles: zoom ? parseFloat(zoom) : 50,
            width: 800,
            height: 600
        });
        if (!result) {
            return res.json({ available: false });
        }
        res.json({
            available: true,
            imageBase64: `data:image/png;base64,${result.imageBuffer.toString('base64')}`,
            bbox: result.bbox, // [minLng, minLat, maxLng, maxLat]
            timestamp: result.timestamp
        });
    }
    catch (error) {
        console.error('NEXRAD meta error:', error);
        res.status(500).json({ error: error.message });
    }
});
// GET /api/hail/mrms-historical-meta - Historical MRMS MESH overlay metadata for a storm date/bounds
router.get('/mrms-historical-meta', async (req, res) => {
    try {
        const { date, north, south, east, west, anchorTimestamp } = req.query;
        if (!date || !north || !south || !east || !west) {
            return res.status(400).json({
                error: 'date, north, south, east, and west are required',
            });
        }
        const result = await getHistoricalMrmsOverlay({
            date: String(date),
            north: Number(north),
            south: Number(south),
            east: Number(east),
            west: Number(west),
            anchorTimestamp: anchorTimestamp ? String(anchorTimestamp) : null,
        });
        res.json({
            ...result.metadata,
            overlay_url: `/api/hail/mrms-historical-image?date=${encodeURIComponent(String(date))}` +
                `&north=${encodeURIComponent(String(north))}` +
                `&south=${encodeURIComponent(String(south))}` +
                `&east=${encodeURIComponent(String(east))}` +
                `&west=${encodeURIComponent(String(west))}` +
                (anchorTimestamp
                    ? `&anchorTimestamp=${encodeURIComponent(String(anchorTimestamp))}`
                    : ''),
        });
    }
    catch (error) {
        console.error('Historical MRMS meta error:', error);
        res.status(500).json({ error: error.message });
    }
});
// GET /api/hail/mrms-historical-image - Historical MRMS MESH overlay PNG for a storm date/bounds
router.get('/mrms-historical-image', async (req, res) => {
    try {
        const { date, north, south, east, west, anchorTimestamp } = req.query;
        if (!date || !north || !south || !east || !west) {
            return res.status(400).json({
                error: 'date, north, south, east, and west are required',
            });
        }
        const result = await getHistoricalMrmsOverlay({
            date: String(date),
            north: Number(north),
            south: Number(south),
            east: Number(east),
            west: Number(west),
            anchorTimestamp: anchorTimestamp ? String(anchorTimestamp) : null,
        });
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=900');
        res.setHeader('X-MRMS-Ref-Time', result.metadata.ref_time);
        res.setHeader('X-MRMS-Bounds', JSON.stringify(result.metadata.bounds));
        res.setHeader('Access-Control-Expose-Headers', 'X-MRMS-Ref-Time, X-MRMS-Bounds');
        res.send(result.imageBuffer);
    }
    catch (error) {
        console.error('Historical MRMS image error:', error);
        res.status(500).json({ error: error.message });
    }
});
// POST /api/hail/import-hailtrace - Manual HailTrace import trigger
router.post('/import-hailtrace', async (req, res) => {
    try {
        const { filepath } = req.body;
        if (!filepath) {
            return res.status(400).json({ error: 'filepath is required' });
        }
        console.log(`[HailTrace API] Manual import requested for: ${filepath}`);
        const result = await hailtraceImportService.importFromFile(filepath);
        if (result.success) {
            res.json({
                success: true,
                message: 'Import completed successfully',
                ...result
            });
        }
        else {
            res.status(400).json({
                success: false,
                message: 'Import completed with errors',
                ...result
            });
        }
    }
    catch (error) {
        console.error('❌ HailTrace import error:', error);
        res.status(500).json({ error: error.message });
    }
});
// GET /api/hail/hailtrace-status - HailTrace integration status
router.get('/hailtrace-status', async (_req, res) => {
    try {
        const status = await hailtraceImportService.getStatus();
        res.json({
            success: true,
            ...status,
            message: status.watching
                ? `Watching for files (${status.pendingFiles.length} pending)`
                : 'File watching is stopped'
        });
    }
    catch (error) {
        console.error('❌ HailTrace status error:', error);
        res.status(500).json({ error: error.message });
    }
});
// POST /api/hail/hailtrace-watch - Start/stop HailTrace file watching
router.post('/hailtrace-watch', async (req, res) => {
    try {
        const { action, intervalMs } = req.body;
        if (action === 'start') {
            hailtraceImportService.startWatching(intervalMs || 60000);
            res.json({
                success: true,
                message: 'HailTrace file watching started',
                intervalMs: intervalMs || 60000
            });
        }
        else if (action === 'stop') {
            hailtraceImportService.stopWatching();
            res.json({
                success: true,
                message: 'HailTrace file watching stopped'
            });
        }
        else {
            res.status(400).json({ error: 'action must be "start" or "stop"' });
        }
    }
    catch (error) {
        console.error('❌ HailTrace watch control error:', error);
        res.status(500).json({ error: error.message });
    }
});
// POST /api/hail/hailtrace-scan - Manually trigger directory scan
router.post('/hailtrace-scan', async (_req, res) => {
    try {
        console.log('[HailTrace API] Manual scan triggered');
        const result = await hailtraceImportService.manualScan();
        res.json({
            success: true,
            message: 'Manual scan completed',
            ...result
        });
    }
    catch (error) {
        console.error('❌ HailTrace scan error:', error);
        res.status(500).json({ error: error.message });
    }
});
// GET /api/hail/hailtrace-events - Get HailTrace events
router.get('/hailtrace-events', async (req, res) => {
    try {
        const { startDate, endDate, minHailSize, limit } = req.query;
        const events = await hailtraceImportService.getEvents({
            startDate: startDate,
            endDate: endDate,
            minHailSize: minHailSize ? parseFloat(minHailSize) : undefined,
            limit: limit ? parseInt(limit, 10) : 100
        });
        res.json({
            success: true,
            events,
            count: events.length
        });
    }
    catch (error) {
        console.error('❌ HailTrace events fetch error:', error);
        res.status(500).json({ error: error.message });
    }
});
// GET /api/hail/hailtrace-stats - Get import statistics
router.get('/hailtrace-stats', async (_req, res) => {
    try {
        const stats = await hailtraceImportService.getImportStats();
        res.json({
            success: true,
            stats
        });
    }
    catch (error) {
        console.error('❌ HailTrace stats error:', error);
        res.status(500).json({ error: error.message });
    }
});
export default router;
