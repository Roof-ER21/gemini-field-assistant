import { Router } from 'express';
// PDF generation concurrency limiter — prevents server freeze when many PDFs generated simultaneously
let activePdfCount = 0;
const MAX_CONCURRENT_PDFS = 3;
const PDF_QUEUE_TIMEOUT = 30000; // 30s max wait
function acquirePdfSlot() {
    if (activePdfCount < MAX_CONCURRENT_PDFS) {
        activePdfCount++;
        return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const check = setInterval(() => {
            if (activePdfCount < MAX_CONCURRENT_PDFS) {
                clearInterval(check);
                activePdfCount++;
                resolve();
            }
            else if (Date.now() - start > PDF_QUEUE_TIMEOUT) {
                clearInterval(check);
                reject(new Error('PDF generation queue full — please try again in a moment'));
            }
        }, 500);
    });
}
function releasePdfSlot() {
    activePdfCount = Math.max(0, activePdfCount - 1);
}
import { noaaStormService } from '../services/noaaStormService.js';
import { damageScoreService } from '../services/damageScoreService.js';
import { hotZoneService } from '../services/hotZoneService.js';
import { pdfReportServiceV2 } from '../services/pdfReportServiceV2.js';
import { getHistoricalMrmsOverlay, getMrmsHailAtPoint } from '../services/historicalMrmsService.js';
import { fetchNexradImage } from '../services/nexradService.js';
import { fetchNWSAlerts } from '../services/nwsAlertService.js';
import { fetchMapImage } from '../services/mapImageService.js';
import { assessPropertyRisk } from '../services/propertyRiskService.js';
import { searchEvidenceCandidates } from '../services/evidenceSearchService.js';
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
    // Fallback to Nominatim — try full address first, then city/state/zip
    const nominatimAttempts = [
        [address, city, state, zip].filter(Boolean).join(', '),
        ...(address ? [[city, state, zip].filter(Boolean).join(', ')] : []),
    ];
    for (const query of nominatimAttempts) {
        try {
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
    }
    return null;
};
// Simple geocode cache to avoid rate-limiting from Nominatim
const geocodeCache = new Map();
const GEOCODE_CACHE_TTL = 24 * 60 * 60 * 1000; // 24h
// GET /api/hail/geocode?q=<address|city|zip>
// Server-side proxy for Census Bureau geocoding (avoids CORS on the client)
router.get('/geocode', async (req, res) => {
    const q = (req.query.q || '').trim();
    if (!q)
        return res.status(400).json({ error: 'Missing ?q= parameter' });
    // Check cache first
    const cacheKey = q.toLowerCase();
    const cached = geocodeCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < GEOCODE_CACHE_TTL) {
        return res.json({ address: cached.address, lat: cached.lat, lng: cached.lng });
    }
    try {
        // Try Census Bureau first (best for street addresses)
        const params = new URLSearchParams({ address: q, benchmark: 'Public_AR_Current', format: 'json' });
        const censusRes = await fetch(`https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?${params}`);
        if (censusRes.ok) {
            const data = await censusRes.json();
            const matches = data?.result?.addressMatches;
            if (matches?.length) {
                const f = matches[0];
                const result = { address: f.matchedAddress, lat: f.coordinates.y, lng: f.coordinates.x };
                geocodeCache.set(cacheKey, { ...result, ts: Date.now() });
                return res.json(result);
            }
        }
        // Fallback to Nominatim (handle rate-limiting gracefully)
        try {
            const nomRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=us`, {
                headers: { 'User-Agent': 'RoofER-GeminiFieldAssistant/1.0' }
            });
            if (nomRes.ok) {
                const nomData = await nomRes.json();
                if (Array.isArray(nomData) && nomData.length > 0) {
                    const result = { address: nomData[0].display_name, lat: parseFloat(nomData[0].lat), lng: parseFloat(nomData[0].lon) };
                    geocodeCache.set(cacheKey, { ...result, ts: Date.now() });
                    return res.json(result);
                }
            }
            else {
                console.warn(`Nominatim returned ${nomRes.status} for "${q}" — may be rate-limited`);
            }
        }
        catch (nomErr) {
            console.warn('Nominatim fallback failed:', nomErr.message);
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
    const sources = ['NOAA Storm Events Database', 'NWS Alerts', 'NEXRAD Radar'];
    res.json({
        noaaAvailable: true,
        nwsAvailable: true,
        nexradAvailable: true,
        primarySource: 'NOAA Storm Events Database',
        activeSources: sources,
        message: `${sources.length} data sources active`,
        provider: sources.join(' + ')
    });
});
// GET /api/hail/rep-profile - Get the logged-in rep's report profile
router.get('/rep-profile', async (req, res) => {
    try {
        const email = req.header('x-user-email');
        if (!email)
            return res.status(401).json({ error: 'Not authenticated' });
        const pool = req.app.get('pool');
        const { rows } = await pool.query('SELECT name, email, phone, company_name FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1', [email]);
        if (!rows.length)
            return res.json({ name: null, email, phone: null, companyName: null });
        const u = rows[0];
        // Fall back to system_settings for company defaults
        let companyName = u.company_name;
        if (!companyName) {
            const s = await pool.query("SELECT value FROM system_settings WHERE key = 'company_name' LIMIT 1");
            if (s.rows.length)
                companyName = JSON.parse(s.rows[0].value);
        }
        res.json({ name: u.name, email: u.email, phone: u.phone, companyName });
    }
    catch (e) {
        console.error('Rep profile fetch error:', e);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});
// PUT /api/hail/rep-profile - Update the logged-in rep's report profile
router.put('/rep-profile', async (req, res) => {
    try {
        const email = req.header('x-user-email');
        if (!email)
            return res.status(401).json({ error: 'Not authenticated' });
        const { phone, companyName, name } = req.body;
        const pool = req.app.get('pool');
        const sets = [];
        const vals = [];
        let idx = 1;
        if (phone !== undefined) {
            sets.push(`phone = $${idx++}`);
            vals.push(phone);
        }
        if (companyName !== undefined) {
            sets.push(`company_name = $${idx++}`);
            vals.push(companyName);
        }
        if (name !== undefined) {
            sets.push(`name = $${idx++}`);
            vals.push(name);
        }
        if (!sets.length)
            return res.status(400).json({ error: 'Nothing to update' });
        vals.push(email);
        const sql = `UPDATE users SET ${sets.join(', ')} WHERE LOWER(email) = LOWER($${idx})`;
        await pool.query(sql, vals);
        res.json({ success: true });
    }
    catch (e) {
        const msg = e.message;
        console.error('Rep profile update error:', msg);
        res.status(500).json({ error: msg });
    }
});
// POST /api/hail/run-profile-migration - One-time migration to add phone/company columns
router.post('/run-profile-migration', async (req, res) => {
    try {
        const pool = req.app.get('pool');
        await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS company_name VARCHAR(255);
    `);
        // Sync phones from employee_profiles
        try {
            await pool.query(`
        UPDATE users u SET phone = ep.phone_number
        FROM employee_profiles ep
        WHERE LOWER(u.email) = LOWER(ep.email)
          AND ep.phone_number IS NOT NULL AND ep.phone_number != ''
          AND (u.phone IS NULL OR u.phone = '')
      `);
        }
        catch { /* employee_profiles may not exist */ }
        // Set company for all
        await pool.query(`UPDATE users SET company_name = 'Roof ER The Roof Docs' WHERE company_name IS NULL OR company_name = ''`);
        res.json({ success: true, message: 'Profile columns added and data synced' });
    }
    catch (e) {
        console.error('Profile migration error:', e);
        res.status(500).json({ error: e.message });
    }
});
// GET /api/hail/search?address=...&months=24 OR lat/lng
router.get('/search', async (req, res) => {
    try {
        const { address, lat, lng, months = '24', radius = '50', street, city, state, zip } = req.query;
        const monthsNum = parseInt(months, 10);
        const radiusNum = parseFloat(radius);
        const yearsNum = Math.ceil(monthsNum / 12);
        let noaaData = [];
        // Extract coordinates from request
        let searchLat = lat ? parseFloat(lat) : null;
        let searchLng = lng ? parseFloat(lng) : null;
        // Handle address-based search
        if (street || city || state || zip) {
            if (!street || !city || !state || !zip) {
                return res.status(400).json({ error: 'street, city, state, and zip are required' });
            }
            // Geocode the address
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
            // Fetch NOAA data
            if (searchLat && searchLng) {
                try {
                    noaaData = await noaaStormService.getStormEvents(searchLat, searchLng, radiusNum, yearsNum);
                }
                catch (e) {
                    console.error('NOAA search error:', e);
                }
            }
            return res.json({
                events: [],
                noaaEvents: noaaData,
                searchArea: {
                    center: { lat: searchLat, lng: searchLng },
                    radiusMiles: radiusNum
                },
                dataSource: ['NOAA'],
                message: 'NOAA Storm Events Database'
            });
        }
        // Handle coordinate-based search
        if (lat && lng) {
            searchLat = parseFloat(lat);
            searchLng = parseFloat(lng);
            try {
                noaaData = await noaaStormService.getStormEvents(searchLat, searchLng, radiusNum, yearsNum);
            }
            catch (e) {
                console.error('NOAA search error:', e);
            }
            // Also query local storm_alerts to fill the SPC→NOAA gap (days 8-30+)
            try {
                const pool = req.app.get('pool');
                // Get all recent alerts in VA/MD/PA territory — NOT radius-filtered so PA storms show
                const localAlerts = await pool.query(`SELECT event_type, TO_CHAR(event_date, 'YYYY-MM-DD') AS event_date_str, magnitude, magnitude_unit, latitude, longitude, location, county, state, narrative, alert_phase
           FROM storm_alerts
           WHERE event_date >= CURRENT_DATE - INTERVAL '90 days'
             AND state IN ('VA','MD','PA')
           ORDER BY event_date DESC
           LIMIT 200`);
                console.log(`[StormAlerts] Local merge: found ${localAlerts.rows.length} alerts from storm_alerts table`);
                // Normalize NOAA dates to YYYY-MM-DD for consistent dedup keys
                const toDateKey = (dateVal) => {
                    if (!dateVal)
                        return '';
                    const s = String(dateVal);
                    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
                    return m ? m[1] : s;
                };
                // Merge local alerts that aren't already in NOAA results (avoid duplicates by date+location)
                const existingDates = new Set(noaaData.map((e) => `${toDateKey(e.date)}-${(Number(e.latitude) || 0).toFixed(2)}`));
                let merged = 0;
                for (const a of localAlerts.rows) {
                    const alertDate = a.event_date_str || toDateKey(a.event_date);
                    const alertLat = Number(a.latitude) || 0;
                    const alertLng = Number(a.longitude) || 0;
                    const key = `${alertDate}-${alertLat.toFixed(2)}`;
                    if (!existingDates.has(key)) {
                        noaaData.push({
                            id: `local-${alertDate}-${a.location}-${alertLat.toFixed(2)}`,
                            eventType: a.event_type || 'Hail',
                            date: alertDate,
                            latitude: alertLat !== 0 ? alertLat : searchLat,
                            longitude: alertLng !== 0 ? alertLng : searchLng,
                            magnitude: a.magnitude ? Number(a.magnitude) : null,
                            state: a.state,
                            county: a.county || '',
                            location: a.location,
                            narrative: a.narrative || `${a.event_type} at ${a.location}, ${a.state}`,
                            source: a.alert_phase === 'noaa_reconciled' ? 'NOAA (verified)' : 'SPC/NWS (local)'
                        });
                        existingDates.add(key); // prevent duplicates within storm_alerts
                        merged++;
                    }
                }
                console.log(`[StormAlerts] Merged ${merged} local alerts into results (PA: ${localAlerts.rows.filter((r) => r.state === 'PA').length} events)`);
            }
            catch (e) {
                console.error('[StormAlerts] Local merge error:', e.message);
            }
            return res.json({
                events: [],
                noaaEvents: noaaData,
                searchArea: {
                    center: { lat: searchLat, lng: searchLng },
                    radiusMiles: radiusNum
                },
                dataSource: ['NOAA', 'Local Storm Alerts'],
                message: 'NOAA Storm Events Database + Local Alerts'
            });
        }
        if (address) {
            return res.status(400).json({ error: 'Use street, city, state, and zip for address search' });
        }
        return res.status(400).json({ error: 'Provide street/city/state/zip or lat/lng' });
    }
    catch (error) {
        console.error('❌ Hail search error:', error);
        res.status(500).json({ error: error.message });
    }
});
/**
 * GET /api/hail/address-history — IHM-style Hail Impact Report
 *
 * Returns property-level hail history with distance bands matching
 * Interactive Hail Maps format: At Location, Within 1mi, Within 3mi, Within 10mi.
 * Combines NOAA Storm Events DB + storm_alerts (NWS/SPC) + NWS warnings.
 * No scores, no percentages — just dates, sizes, distances, and sources.
 *
 * Query params: street, city, state, zip  OR  lat, lng
 * Optional: years (default 5, max 10)
 */
router.get('/address-history', async (req, res) => {
    try {
        const { street, city, state, zip, lat, lng, years = '5' } = req.query;
        const yearsBack = Math.min(parseInt(years, 10) || 5, 10);
        let searchLat = lat ? parseFloat(lat) : null;
        let searchLng = lng ? parseFloat(lng) : null;
        let resolvedAddress = '';
        if (street || city || state || zip) {
            resolvedAddress = [street, city, state, zip].filter(Boolean).join(', ');
            if (!searchLat || !searchLng) {
                const geo = await geocodeForHailSearch({
                    address: String(street || ''),
                    city: String(city || ''),
                    state: String(state || ''),
                    zip: String(zip || '')
                });
                if (geo) {
                    searchLat = geo.lat;
                    searchLng = geo.lng;
                }
            }
        }
        if (!searchLat || !searchLng) {
            return res.status(400).json({ error: 'Could not geocode address. Provide street, city, state, zip or lat/lng.' });
        }
        // Fetch NOAA + SPC events within 10 miles (widest band)
        let allEvents = [];
        try {
            allEvents = await noaaStormService.getStormEvents(searchLat, searchLng, 10, yearsBack);
        }
        catch (e) {
            console.warn('[address-history] NOAA fetch error:', e);
        }
        // Fetch storm_alerts — with coordinates (distance filter) OR without (state fallback)
        const pool = req.app.get('pool');
        let recentAlerts = [];
        try {
            const alertResult = await pool.query(`SELECT *,
           CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN
             (3959 * acos(LEAST(1.0,
               cos(radians($1)) * cos(radians(latitude)) *
               cos(radians(longitude) - radians($2)) +
               sin(radians($1)) * sin(radians(latitude))
             )))
           ELSE 999 END AS distance_miles
         FROM storm_alerts
         WHERE event_date >= CURRENT_DATE - INTERVAL '${yearsBack} years'
           AND (
             (latitude IS NOT NULL AND longitude IS NOT NULL)
             OR state IN ('VA','MD','PA')
           )
         ORDER BY event_date DESC
         LIMIT 200`, [searchLat, searchLng]);
            // Filter: keep events within 10 miles OR events without coordinates (state-level)
            recentAlerts = alertResult.rows.filter((r) => Number(r.distance_miles) <= 10 || r.latitude === null);
            console.log(`[address-history] storm_alerts: ${alertResult.rows.length} total, ${recentAlerts.length} after distance filter`);
        }
        catch (e) {
            console.error('[address-history] storm_alerts query error:', e.message);
        }
        // Merge storm_alerts into allEvents (avoid duplicates)
        for (const a of recentAlerts) {
            const alertDate = new Date(a.event_date).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
            const isDup = allEvents.some(e => e.date === alertDate && e.eventType === a.event_type && Math.abs((e.distanceMiles || 0) - Number(a.distance_miles)) < 2);
            if (!isDup) {
                allEvents.push({
                    id: a.spc_event_id,
                    eventType: a.event_type,
                    date: alertDate,
                    state: a.state || '',
                    location: a.location || '',
                    latitude: Number(a.latitude),
                    longitude: Number(a.longitude),
                    magnitude: a.noaa_magnitude ? Number(a.noaa_magnitude) : (a.magnitude ? Number(a.magnitude) : null),
                    magnitudeUnit: a.magnitude_unit || 'inches',
                    source: a.noaa_reconciled ? 'NOAA' : (a.spc_event_id?.startsWith('nws-') ? 'NWS' : 'SPC'),
                    narrative: a.noaa_narrative || a.narrative || '',
                    distanceMiles: Number(a.distance_miles) || 0,
                    noaaReconciled: !!a.noaa_reconciled,
                    time: a.event_time || ''
                });
            }
        }
        // Group all events by storm date → build IHM-style Historical Storm Activity rows
        const stormDateMap = new Map();
        for (const e of allEvents) {
            if (!stormDateMap.has(e.date))
                stormDateMap.set(e.date, []);
            stormDateMap.get(e.date).push(e);
        }
        // Fetch MRMS radar data for all storm dates in parallel
        // MRMS gives us radar-derived hail sizes at the exact property location
        // — this is what makes our "At Location" column match IHM's accuracy
        const mrmsResults = new Map();
        const mrmsPromises = [...stormDateMap.keys()].map(async (date) => {
            const result = await getMrmsHailAtPoint(date, searchLat, searchLng).catch(() => null);
            mrmsResults.set(date, result);
        });
        await Promise.allSettled(mrmsPromises);
        // Distance bands: At Location (<0.5mi), Within 1mi, Within 3mi, Within 10mi
        const BANDS = [
            { key: 'atLocation', label: 'At Location', max: 0.5 },
            { key: 'within1mi', label: 'Within 1mi', max: 1 },
            { key: 'within3mi', label: 'Within 3mi', max: 3 },
            { key: 'within10mi', label: 'Within 10mi', max: 10 },
        ];
        const stormDates = [];
        for (const [date, events] of stormDateMap) {
            const hailEvents = events.filter((e) => e.eventType === 'hail');
            const windEvents = events.filter((e) => e.eventType === 'wind');
            const allHailAndWind = [...hailEvents, ...windEvents];
            // Compute max hail size in each distance band:
            // 1. Ground reports (SPC/NOAA observations within each radius)
            // 2. MRMS radar data (NEXRAD-derived MESH grid values at each radius)
            // Take the MAX of both — radar fills gaps where no spotter was nearby,
            // ground reports fill in when MRMS archive isn't available.
            const bandValues = {};
            const mrms = mrmsResults.get(date) || null;
            for (const band of BANDS) {
                // Ground report value
                const inBand = hailEvents.filter((e) => (e.distanceMiles || 0) <= band.max);
                const groundMax = inBand.length > 0 ? Math.max(...inBand.map((e) => Number(e.magnitude) || 0)) : 0;
                // MRMS radar value
                const radarMax = mrms ? mrms[band.key] || 0 : 0;
                const best = Math.max(groundMax, radarMax);
                // Floor at 0.50" — no adjuster takes sub-half-inch seriously.
                // Round to nearest 0.25" to match industry standard (0.50, 0.75, 1.00, 1.25, etc.)
                if (best < 0.50) {
                    bandValues[band.key] = null;
                }
                else {
                    bandValues[band.key] = Math.round(best * 4) / 4;
                }
            }
            // Find closest event for impact time
            const closest = allHailAndWind.sort((a, b) => (a.distanceMiles || 999) - (b.distanceMiles || 999))[0];
            // Extract direction/speed from NWS narrative if available
            let direction = null;
            let speed = null;
            for (const e of events) {
                const narr = (e.narrative || '').toLowerCase();
                const dirMatch = narr.match(/moving\s+(north|south|east|west|northeast|northwest|southeast|southwest|n|s|e|w|ne|nw|se|sw)\b/i);
                if (dirMatch && !direction) {
                    const dirs = { n: 'North', s: 'South', e: 'East', w: 'West', ne: 'Northeast', nw: 'Northwest', se: 'Southeast', sw: 'Southwest' };
                    direction = dirs[dirMatch[1].toLowerCase()] || dirMatch[1].charAt(0).toUpperCase() + dirMatch[1].slice(1);
                }
                const spdMatch = narr.match(/(\d+\.?\d*)\s*mph/i);
                if (spdMatch && !speed)
                    speed = parseFloat(spdMatch[1]);
            }
            const maxOverall = hailEvents.length > 0 ? Math.max(...hailEvents.map((e) => Number(e.magnitude) || 0)) : null;
            // Build observations table (ground reports within 10mi)
            const observations = allHailAndWind
                .sort((a, b) => (a.distanceMiles || 0) - (b.distanceMiles || 0))
                .slice(0, 10)
                .map((e) => {
                const dist = e.distanceMiles || 0;
                const compassDir = getCompassDirection(searchLat, searchLng, e.latitude, e.longitude);
                return {
                    dateTime: e.time ? `${date} ${e.time}` : date,
                    source: e.source || (e.id?.startsWith('noaa-') ? 'NOAA' : 'SPC'),
                    hailSize: e.eventType === 'hail' && e.magnitude ? `${e.magnitude}"` : null,
                    windSpeed: e.eventType === 'wind' && e.magnitude ? `${e.magnitude} kts` : null,
                    distance: dist < 0.5 ? 'At location' : `${dist.toFixed(1)} miles ${compassDir}`,
                    narrative: e.narrative || ''
                };
            });
            const displayDate = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
                timeZone: 'America/New_York'
            });
            stormDates.push({
                date,
                displayDate,
                impactTime: closest?.time || null,
                direction,
                speed,
                duration: null,
                radarDetected: mrms !== null,
                atLocation: bandValues.atLocation ? `${bandValues.atLocation}"` : null,
                within1mi: bandValues.within1mi ? `${bandValues.within1mi}"` : null,
                within3mi: bandValues.within3mi ? `${bandValues.within3mi}"` : null,
                within10mi: bandValues.within10mi ? `${bandValues.within10mi}"` : null,
                directHit: bandValues.atLocation !== null,
                reportCount: allHailAndWind.length,
                maxHailSize: maxOverall,
                noaaConfirmed: events.some((e) => e.noaaReconciled || e.id?.startsWith('noaa-')),
                observations
            });
        }
        // Sort storm dates newest first
        stormDates.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        // Generate IHM-style narrative for the most recent direct hit
        const latestHit = stormDates.find(s => s.directHit);
        let narrative = null;
        if (latestHit) {
            const addr = resolvedAddress || `${searchLat}, ${searchLng}`;
            const size = latestHit.atLocation || latestHit.within1mi || latestHit.within3mi || '';
            const dir = latestHit.direction ? ` moving ${latestHit.direction}` : '';
            const spd = latestHit.speed ? ` at ${latestHit.speed} miles per hour` : '';
            const time = latestHit.impactTime ? ` at approximately ${latestHit.impactTime}` : '';
            narrative = `On ${latestHit.displayDate}${time}, the property located at ${addr} was impacted by a storm${dir}${spd}. Hail as large as ${size} was detected near the property. ${latestHit.reportCount} ground observation(s) were recorded within 10 miles.${latestHit.noaaConfirmed ? ' This event has been confirmed by the NOAA Storm Events Database — the official federal record.' : ''}`;
        }
        // Summary stats
        const directHitCount = stormDates.filter(s => s.directHit).length;
        const totalDates = stormDates.length;
        const maxHailOverall = stormDates.reduce((max, s) => Math.max(max, s.maxHailSize || 0), 0);
        const noaaCount = stormDates.filter(s => s.noaaConfirmed).length;
        let summary = '';
        if (totalDates === 0) {
            summary = `No documented storm activity within 10 miles in the last ${yearsBack} years.`;
        }
        else {
            summary = `${totalDates} storm date${totalDates > 1 ? 's' : ''} within 10 miles in the last ${yearsBack} years.`;
            if (directHitCount > 0)
                summary += ` ${directHitCount} direct hit${directHitCount > 1 ? 's' : ''} at the property (largest: ${maxHailOverall}").`;
            if (noaaCount > 0)
                summary += ` ${noaaCount} confirmed by NOAA federal records.`;
        }
        return res.json({
            address: resolvedAddress || `${searchLat}, ${searchLng}`,
            latitude: searchLat,
            longitude: searchLng,
            yearsSearched: yearsBack,
            summary,
            narrative,
            directHits: directHitCount,
            totalStormDates: totalDates,
            largestHail: maxHailOverall > 0 ? maxHailOverall : null,
            noaaConfirmed: noaaCount,
            stormDates
        });
    }
    catch (error) {
        console.error('❌ Address history error:', error);
        res.status(500).json({ error: error.message });
    }
});
/** Compass direction from point A to point B */
function getCompassDirection(lat1, lng1, lat2, lng2) {
    const dLat = lat2 - lat1;
    const dLng = lng2 - lng1;
    const angle = Math.atan2(dLng, dLat) * (180 / Math.PI);
    const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const idx = Math.round(((angle + 360) % 360) / 22.5) % 16;
    return dirs[idx];
}
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
        let noaaData = [];
        // Geocode if we have address but no coordinates
        if (!lat && !lng) {
            if ((address || city) && state) {
                const geocodeResult = await geocodeForHailSearch({ address, city, state, zip });
                if (geocodeResult) {
                    lat = geocodeResult.lat;
                    lng = geocodeResult.lng;
                }
            }
        }
        if (!lat || !lng) {
            return res.status(400).json({ error: 'Provide city/state, ZIP code, or coordinates' });
        }
        // Fetch NOAA data
        try {
            noaaData = await noaaStormService.getStormEvents(parseFloat(lat), parseFloat(lng), parseFloat(radius), years);
        }
        catch (error) {
            console.error('NOAA search error:', error);
        }
        // Filter by hail size if specified
        let filteredNoaaEvents = noaaData;
        if (minHailSize) {
            filteredNoaaEvents = noaaData.filter((event) => event.magnitude && event.magnitude >= minHailSize);
        }
        return res.json({
            events: [],
            noaaEvents: filteredNoaaEvents,
            resultsCount: filteredNoaaEvents.length,
            searchArea: {
                center: { lat: parseFloat(lat), lng: parseFloat(lng) },
                radiusMiles: parseFloat(radius)
            },
            searchCriteria: { address, city, state, zip, latitude: lat, longitude: lng, startDate, endDate, minHailSize, radius },
            dataSource: ['NOAA'],
            message: 'NOAA Storm Events Database'
        });
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
        const { address, city, state, lat, lng, radius, events, noaaEvents, historyEvents, damageScore, repName, repPhone, repEmail, companyName, filter, includeNexrad = true, includeMap = true, includeWarnings = true, customerName, dateOfLoss, template = 'standard', evidenceItems = [], } = req.body;
        // Validate required fields
        if (!address || !lat || !lng || !radius || !damageScore) {
            return res.status(400).json({
                error: 'Missing required fields: address, lat, lng, radius, damageScore'
            });
        }
        // Auto-resolve rep profile from authenticated user if not explicitly provided
        let resolvedRepName = repName;
        let resolvedRepPhone = repPhone;
        let resolvedRepEmail = repEmail;
        const resolvedCompanyName = 'Roof ER The Roof Docs';
        const DEFAULT_PHONE = '(703) 239-3738';
        const userEmail = req.header('x-user-email');
        if (userEmail) {
            try {
                const pool = req.app.get('pool');
                // 1. Check users table
                const userRow = await pool.query('SELECT name, email, phone FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1', [userEmail]);
                if (userRow.rows.length > 0) {
                    const u = userRow.rows[0];
                    if (!resolvedRepName)
                        resolvedRepName = u.name;
                    if (!resolvedRepEmail)
                        resolvedRepEmail = u.email;
                    if (!resolvedRepPhone)
                        resolvedRepPhone = u.phone;
                }
                // 2. Fall back to employee_profiles for phone if still missing
                if (!resolvedRepPhone) {
                    const profileRow = await pool.query('SELECT phone_number FROM employee_profiles WHERE LOWER(email) = LOWER($1) AND phone_number IS NOT NULL LIMIT 1', [userEmail]);
                    if (profileRow.rows.length > 0)
                        resolvedRepPhone = profileRow.rows[0].phone_number;
                }
            }
            catch (e) {
                console.warn('Could not resolve rep profile from DB:', e.message);
            }
        }
        // Final defaults
        if (!resolvedRepPhone)
            resolvedRepPhone = DEFAULT_PHONE;
        if (!resolvedRepEmail)
            resolvedRepEmail = userEmail || undefined;
        if (!resolvedRepName)
            resolvedRepName = undefined;
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
        const combinedSourceEvents = [...(events || []), ...(noaaEvents || []), ...(historyEvents || [])];
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
        const normalizedHistoryEvents = (historyEvents || []).map((event) => ({
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
        // Select up to 5 representative events by unique observation, largest hail first
        const allSynthCandidates = [...normalizedEvents, ...normalizedNoaaEvents]
            .sort((a, b) => ((b.magnitude || b.hailSize || 0) - (a.magnitude || a.hailSize || 0)));
        const seenObs = new Set();
        const representativeEvents = [];
        for (const e of allSynthCandidates) {
            const obsKey = `${getDateKey(e.date)}-${(e.comments || '').substring(0, 40)}-${e.magnitude || e.hailSize || 0}`;
            if (!seenObs.has(obsKey)) {
                representativeEvents.push(e);
                seenObs.add(obsKey);
            }
        }
        const syntheticAlerts = realAlerts.length === 0
            ? representativeEvents
                .slice(0, 5)
                .map((matchingEvent, idx) => {
                const date = matchingEvent.date;
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
        // Concurrency gate — max 3 PDFs at once to prevent server freeze
        try {
            await acquirePdfSlot();
        }
        catch (queueErr) {
            return res.status(503).json({ error: queueErr.message });
        }
        console.log(`📄 Generating PDF report (${activePdfCount}/${MAX_CONCURRENT_PDFS} active)`);
        // Generate PDF stream
        const pdfStream = pdfReportServiceV2.generateReport({
            address,
            city,
            state,
            lat: parsedLat,
            lng: parsedLng,
            radius: parseFloat(radius),
            noaaEvents: normalizedNoaaEvents,
            historyEvents: normalizedHistoryEvents,
            dateOfLoss,
            events: normalizedEvents,
            damageScore,
            repName: resolvedRepName,
            repPhone: resolvedRepPhone,
            repEmail: resolvedRepEmail,
            companyName: resolvedCompanyName,
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
            evidenceItems,
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
            releasePdfSlot();
            console.log(`✅ PDF report generated successfully: ${filename}`);
        });
        pdfStream.on('error', (error) => {
            releasePdfSlot();
            console.error('❌ PDF generation error:', error);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Failed to generate PDF report' });
            }
        });
    }
    catch (error) {
        releasePdfSlot();
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
// GET /api/hail/evidence-search - Search public evidence candidates near a property/storm date
router.get('/evidence-search', async (req, res) => {
    try {
        const propertyLabel = String(req.query.propertyLabel || '').trim();
        const lat = Number(req.query.lat);
        const lng = Number(req.query.lng);
        const radiusMiles = req.query.radiusMiles
            ? Number(req.query.radiusMiles)
            : 25;
        if (!propertyLabel || !Number.isFinite(lat) || !Number.isFinite(lng)) {
            return res.status(400).json({
                error: 'propertyLabel, lat, and lng are required',
            });
        }
        const stormDateParams = req.query.stormDates;
        const stormDates = Array.isArray(stormDateParams)
            ? stormDateParams.map(String)
            : typeof stormDateParams === 'string' && stormDateParams.length > 0
                ? stormDateParams.split(',').map((value) => value.trim()).filter(Boolean)
                : [];
        const result = await searchEvidenceCandidates({
            propertyLabel,
            lat,
            lng,
            stormDates,
            radiusMiles: Number.isFinite(radiusMiles) ? radiusMiles : 25,
        });
        res.json(result);
    }
    catch (error) {
        console.error('Evidence search error:', error);
        res.status(500).json({ error: error.message });
    }
});
export default router;
