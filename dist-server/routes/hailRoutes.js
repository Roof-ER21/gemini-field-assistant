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
import { VerifiedEventsPdfAdapter } from '../services/verifiedEventsPdfAdapter.js';
import { fetchMapImage } from '../services/mapImageService.js';
import { fetchNexradImage } from '../services/nexradService.js';
import { getHistoricalMrmsOverlay, getMrmsHailAtPoint, getHistoricalMrmsSwathPolygons, getRecentMrmsHailAtPoint } from '../services/historicalMrmsService.js';
import { computeStormImpact } from '../services/stormImpactService.js';
import { getLiveMrmsSwathPolygons } from '../services/liveMrmsService.js';
import { crossValidateHailtrace } from '../services/hailtraceValidationService.js';
import { fetchNWSAlerts } from '../services/nwsAlertService.js';
import { compositeContourOverlay, compositeVectorSwathOverlay } from '../services/contourOverlayService.js';
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
            // Hoisted so the response at the bottom of this block can report
            // whether the SQL page filled (the paginationHint flag).
            let hitSearchCap = false;
            // Merge in verified_hail_events_public (324K+ rows, multi-source backfill 2015→today).
            // This is the primary historical source — NOAA NCEI, SPC WCM, IEM LSR, NCEI SWDI,
            // MRMS, CoCoRaHS all unified. Bounding-box prefilter uses lat_bucket/lng_bucket
            // indexes; app-layer haversine does final radius filtering.
            try {
                const pool = req.app.get('pool');
                const degPad = (radiusNum / 69) * 1.05; // 5% margin for bbox
                const lonDegPad = degPad / Math.max(0.15, Math.cos((searchLat * Math.PI) / 180));
                const sinceDateStr = new Date(Date.now() - yearsNum * 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
                // Bounded pagination. A single request returns at most
                // `SEARCH_PAGE_LIMIT` rows. Clients fetching a longer window (e.g.
                // the 10-year history goal) should use the new /api/hail/storm-days
                // endpoint which returns aggregate day rows instead. Keeping this
                // hard cap at 5000 prevents a single web request from allocating
                // the ~20-50 MB working set that was contributing to OOM kills.
                const SEARCH_PAGE_LIMIT = 5000;
                const verifiedRows = await pool.query(`SELECT
             id, TO_CHAR(event_date, 'YYYY-MM-DD') AS date_str,
             latitude, longitude, state,
             hail_size_inches, wind_mph, tornado_ef_rank,
             public_verification_count,
             source_noaa_ncei, source_iem_lsr, source_ncei_swdi, source_mrms,
             source_nws_alert, source_iem_vtec, source_cocorahs, source_spc_wcm,
             source_hailtrace, source_ihm, source_rep_report,
             source_details
           FROM verified_hail_events_public_sane
           WHERE event_date >= $1::date
             AND latitude  BETWEEN $2 AND $3
             AND longitude BETWEEN $4 AND $5
             AND (hail_size_inches IS NOT NULL OR wind_mph IS NOT NULL OR tornado_ef_rank IS NOT NULL)
           ORDER BY event_date DESC
           LIMIT ${SEARCH_PAGE_LIMIT}`, [
                    sinceDateStr,
                    searchLat - degPad,
                    searchLat + degPad,
                    searchLng - lonDegPad,
                    searchLng + lonDegPad,
                ]);
                hitSearchCap = verifiedRows.rows.length >= SEARCH_PAGE_LIMIT;
                const toRad = (d) => (d * Math.PI) / 180;
                const haversineMi = (aLat, aLng, bLat, bLng) => {
                    const R = 3958.8;
                    const dLat = toRad(bLat - aLat);
                    const dLng = toRad(bLng - aLng);
                    const a = Math.sin(dLat / 2) ** 2 +
                        Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
                    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
                };
                // noaaData keyed by date+lat-rounded+type so the frontend's date-based grouping is clean.
                const seenKeys = new Set(noaaData.map((e) => {
                    const d = String(e.date || '').slice(0, 10);
                    const lat2 = (Number(e.latitude) || 0).toFixed(2);
                    return `${d}|${lat2}|${(e.eventType || '').toLowerCase()}`;
                }));
                let verifiedAdded = 0;
                for (const r of verifiedRows.rows) {
                    const eLat = Number(r.latitude);
                    const eLng = Number(r.longitude);
                    const dist = haversineMi(searchLat, searchLng, eLat, eLng);
                    if (dist > radiusNum)
                        continue;
                    const hail = r.hail_size_inches != null ? Number(r.hail_size_inches) : null;
                    const wind = r.wind_mph != null ? Number(r.wind_mph) : null;
                    const srcLabels = [];
                    if (r.source_noaa_ncei)
                        srcLabels.push('NOAA');
                    if (r.source_spc_wcm)
                        srcLabels.push('SPC');
                    if (r.source_iem_lsr)
                        srcLabels.push('NWS LSR');
                    if (r.source_ncei_swdi)
                        srcLabels.push('NEXRAD');
                    if (r.source_mrms)
                        srcLabels.push('MRMS');
                    if (r.source_cocorahs)
                        srcLabels.push('CoCoRaHS');
                    if (r.source_nws_alert || r.source_iem_vtec)
                        srcLabels.push('NWS Warning');
                    if (r.source_hailtrace)
                        srcLabels.push('HailTrace');
                    if (r.source_ihm)
                        srcLabels.push('IHM');
                    if (r.source_rep_report)
                        srcLabels.push('Rep Report');
                    const primarySource = srcLabels[0] || 'Verified Event';
                    const sourceAttribution = srcLabels.length > 1 ? `${primarySource} (+${srcLabels.length - 1} more)` : primarySource;
                    // Extract traceability IDs from source_details so the PDF can render them
                    // in the "Traceability ID" column. Without this the PDF prints "No IDs available"
                    // and the whole credibility story collapses.
                    const sd = (r.source_details || {});
                    const noaaEventId = sd.noaa_ncei?.event_id ? String(sd.noaa_ncei.event_id) : undefined;
                    const spcOmId = sd.spc_wcm?.om_id ? String(sd.spc_wcm.om_id) : undefined;
                    const radarSite = sd.ncei_swdi?.wsr_id ? String(sd.ncei_swdi.wsr_id) : undefined;
                    const nwsForecastOffice = sd.iem_lsr?.wfo ? String(sd.iem_lsr.wfo) : undefined;
                    const cocorahsStation = sd.cocorahs?.station_number
                        ? String(sd.cocorahs.station_number).trim()
                        : undefined;
                    // source_tags = machine-readable codes for the PDF's dataSourceLabel regex.
                    // sourceAttribution = human-readable; both live side by side so narrative and
                    // table stay consistent.
                    const sourceTags = [
                        r.source_noaa_ncei && 'NOAA',
                        r.source_spc_wcm && 'SPC',
                        r.source_iem_lsr && 'NWS-LSR',
                        r.source_ncei_swdi && 'NCEI-SWDI',
                        r.source_mrms && 'MRMS',
                        r.source_cocorahs && 'CoCoRaHS',
                        r.source_hailtrace && 'HailTrace',
                        r.source_rep_report && 'Rep Report',
                    ].filter(Boolean).join(' ');
                    // Emit up to two event rows per db row: one for hail, one for wind,
                    // so the frontend filter (Hail/Wind) shows each where appropriate.
                    if (hail && hail > 0) {
                        const key = `${r.date_str}|${eLat.toFixed(2)}|hail`;
                        if (!seenKeys.has(key)) {
                            noaaData.push({
                                id: `verified-${r.id}-h`,
                                eventType: 'Hail',
                                date: r.date_str,
                                latitude: eLat,
                                longitude: eLng,
                                magnitude: hail,
                                state: r.state || '',
                                county: '',
                                location: sourceAttribution,
                                narrative: `${hail}" hail verified by ${srcLabels.join(', ') || 'multi-source'} (${r.public_verification_count || 1} source${(r.public_verification_count || 1) === 1 ? '' : 's'}) at ${eLat.toFixed(4)}, ${eLng.toFixed(4)} — ${dist.toFixed(1)}mi from search.`,
                                source: sourceAttribution,
                                // Machine-tag field the PDF regex matches on (independent of user-friendly label).
                                comments: sourceTags,
                                distanceMiles: dist,
                                // Traceability IDs — rendered verbatim in the PDF column.
                                noaaEventId, spcOmId, radarSite, nwsForecastOffice, cocorahsStation,
                                verificationCount: Number(r.public_verification_count) || 1,
                            });
                            seenKeys.add(key);
                            verifiedAdded++;
                        }
                    }
                    if (wind && wind > 0) {
                        const key = `${r.date_str}|${eLat.toFixed(2)}|thunderstorm wind`;
                        if (!seenKeys.has(key)) {
                            noaaData.push({
                                id: `verified-${r.id}-w`,
                                eventType: 'Thunderstorm Wind',
                                date: r.date_str,
                                latitude: eLat,
                                longitude: eLng,
                                magnitude: wind,
                                state: r.state || '',
                                county: '',
                                location: sourceAttribution,
                                narrative: `${wind} mph wind verified by ${srcLabels.join(', ') || 'multi-source'} (${r.public_verification_count || 1} source${(r.public_verification_count || 1) === 1 ? '' : 's'}) at ${eLat.toFixed(4)}, ${eLng.toFixed(4)} — ${dist.toFixed(1)}mi from search.`,
                                source: sourceAttribution,
                                comments: sourceTags,
                                distanceMiles: dist,
                                noaaEventId, spcOmId, radarSite, nwsForecastOffice, cocorahsStation,
                                verificationCount: Number(r.public_verification_count) || 1,
                            });
                            seenKeys.add(key);
                            verifiedAdded++;
                        }
                    }
                }
                console.log(`[verified_hail_events] Merged ${verifiedAdded} events (bbox=${verifiedRows.rows.length}) for search at (${searchLat.toFixed(3)},${searchLng.toFixed(3)}) radius=${radiusNum}mi years=${yearsNum}`);
            }
            catch (e) {
                console.error('[verified_hail_events] Merge error:', e.message);
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
            // Fill the NOAA-lag gap (3-14 days) with live MRMS radar for the last 3 days.
            // NOAA SED publishes on a delay; MRMS updates every 30 min. Without this,
            // reps searching an address on a storm day see "no events" until NOAA catches up.
            const dataSource = ['NOAA', 'Verified Hail Events (2015→today)', 'Local Storm Alerts'];
            try {
                const mrmsRecent = await getRecentMrmsHailAtPoint(searchLat, searchLng, 3);
                if (mrmsRecent.length > 0) {
                    dataSource.push('MRMS Radar');
                    const toDateKeyLocal = (dateVal) => {
                        if (!dateVal)
                            return '';
                        const s = String(dateVal);
                        const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
                        return m ? m[1] : s;
                    };
                    const existingMrmsKeys = new Set(noaaData.map((e) => toDateKeyLocal(e.date)));
                    for (const day of mrmsRecent) {
                        if (existingMrmsKeys.has(day.date))
                            continue; // don't dup a NOAA-same-day event
                        noaaData.push({
                            id: `mrms-${day.date}`,
                            eventType: 'Hail',
                            date: day.date,
                            latitude: searchLat,
                            longitude: searchLng,
                            magnitude: day.atLocation ?? day.within1mi ?? day.within3mi ?? day.within10mi,
                            state: '',
                            county: '',
                            location: 'MRMS Radar',
                            narrative: `MRMS radar detected hail at this location: ` +
                                `at_location=${day.atLocation ?? 'none'}", ` +
                                `within1mi=${day.within1mi ?? 'none'}", ` +
                                `within3mi=${day.within3mi ?? 'none'}", ` +
                                `within10mi=${day.within10mi ?? 'none'}". ` +
                                `Sub-½" values are cosmetic / non-insurance-actionable.`,
                            source: 'MRMS Radar',
                            mrms: {
                                atLocation: day.atLocation,
                                within1mi: day.within1mi,
                                within3mi: day.within3mi,
                                within10mi: day.within10mi,
                                directHit: day.atLocation !== null,
                                actionableHit: (day.atLocation ?? 0) >= 0.5,
                            },
                        });
                        existingMrmsKeys.add(day.date);
                    }
                }
            }
            catch (e) {
                console.error('[MRMS Recent] Error:', e.message);
            }
            return res.json({
                events: [],
                noaaEvents: noaaData,
                searchArea: {
                    center: { lat: searchLat, lng: searchLng },
                    radiusMiles: radiusNum
                },
                dataSource,
                message: dataSource.includes('MRMS Radar')
                    ? 'NOAA Storm Events DB + Local Alerts + MRMS Radar (fills NOAA lag)'
                    : 'NOAA Storm Events Database + Local Alerts',
                // Tells the client whether the raw-event page was capped. For a
                // full 5-10 year view without capping, call /api/hail/storm-days
                // which returns aggregated day rows that always fit in one page.
                paginationHint: hitSearchCap
                    ? { capped: true, message: 'Showing most recent 5000 events — use /api/hail/storm-days for longer windows.' }
                    : { capped: false },
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
                // Floor at 0.13" (⅛"). Sub-½" hail isn't insurance-actionable — the
                // UI uses `actionableHit` to distinguish — but reps still want to see
                // leading-edge radar activity for canvassing context.
                if (best < 0.13) {
                    bandValues[band.key] = null;
                }
                else if (best < 0.50) {
                    bandValues[band.key] = Math.round(best * 8) / 8; // nearest ⅛" for sub-½"
                }
                else {
                    bandValues[band.key] = Math.round(best * 4) / 4; // nearest ¼" for ≥½"
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
            // Wind direct hit — any wind event within 1mi counts. Separate from hail.
            const windWithin1mi = windEvents.filter((e) => (e.distanceMiles || 999) <= 1);
            const maxWindMph = windWithin1mi.length > 0
                ? Math.max(...windWithin1mi.map((e) => Number(e.magnitude) || 0))
                : 0;
            const windDirectHit = windWithin1mi.length > 0;
            // Actionable hail — >= 0.5" at the exact location (insurance threshold).
            // bandValues.atLocation is already rounded, compare numeric value.
            const atLocInches = bandValues.atLocation ?? 0;
            const actionableHit = atLocInches >= 0.5;
            // Evidence-strength signal for narrative tone.
            const hasMrmsHit = mrms !== null && (mrms.atLocation !== null || mrms.within1mi !== null);
            const hasNoaaHit = events.some((e) => e.noaaReconciled || e.id?.startsWith('noaa-'));
            let evidenceStrength = 'none';
            if (hasMrmsHit && hasNoaaHit)
                evidenceStrength = 'strong';
            else if (hasMrmsHit && events.length > 1)
                evidenceStrength = 'moderate';
            else if (hasMrmsHit)
                evidenceStrength = 'mrms-only';
            else if (hasNoaaHit)
                evidenceStrength = 'noaa-only';
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
                actionableHit,
                windDirectHit,
                windSpeedMph: maxWindMph > 0 ? maxWindMph : null,
                evidenceStrength,
                reportCount: allHailAndWind.length,
                maxHailSize: maxOverall,
                noaaConfirmed: hasNoaaHit,
                observations
            });
        }
        // Sort storm dates newest first
        stormDates.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        // Generate IHM-style narrative — prefer the most recent ACTIONABLE hit
        // (>=½"), fall back to any direct hit for context-only mention.
        const latestActionable = stormDates.find(s => s.actionableHit);
        const latestHit = latestActionable ?? stormDates.find(s => s.directHit);
        let narrative = null;
        if (latestHit) {
            const addr = resolvedAddress || `${searchLat}, ${searchLng}`;
            const size = latestHit.atLocation || latestHit.within1mi || latestHit.within3mi || '';
            const dir = latestHit.direction ? ` moving ${latestHit.direction}` : '';
            const spd = latestHit.speed ? ` at ${latestHit.speed} miles per hour` : '';
            const time = latestHit.impactTime ? ` at approximately ${latestHit.impactTime}` : '';
            const windClause = latestHit.windDirectHit && latestHit.windSpeedMph
                ? ` Winds up to ${latestHit.windSpeedMph} mph were recorded within 1 mile.`
                : '';
            const cosmetic = !latestHit.actionableHit
                ? ' Note: hail size is sub-½" (cosmetic / non-insurance-actionable) — surfaced for canvassing context.'
                : '';
            narrative = `On ${latestHit.displayDate}${time}, the property located at ${addr} was impacted by a storm${dir}${spd}. Hail as large as ${size} was detected near the property.${windClause} ${latestHit.reportCount} ground observation(s) were recorded within 10 miles.${latestHit.noaaConfirmed ? ' This event has been confirmed by the NOAA Storm Events Database — the official federal record.' : ''}${cosmetic}`;
        }
        // Summary stats
        const directHitCount = stormDates.filter(s => s.directHit).length;
        const actionableHitCount = stormDates.filter(s => s.actionableHit).length;
        const windHitCount = stormDates.filter(s => s.windDirectHit).length;
        const totalDates = stormDates.length;
        const maxHailOverall = stormDates.reduce((max, s) => Math.max(max, s.maxHailSize || 0), 0);
        const noaaCount = stormDates.filter(s => s.noaaConfirmed).length;
        let summary = '';
        if (totalDates === 0) {
            summary = `No documented storm activity within 10 miles in the last ${yearsBack} years.`;
        }
        else {
            summary = `${totalDates} storm date${totalDates > 1 ? 's' : ''} within 10 miles in the last ${yearsBack} years.`;
            if (actionableHitCount > 0)
                summary += ` ${actionableHitCount} insurance-actionable hail hit${actionableHitCount > 1 ? 's' : ''} (≥½") at the property (largest: ${maxHailOverall}").`;
            else if (directHitCount > 0)
                summary += ` ${directHitCount} sub-½" radar hit${directHitCount > 1 ? 's' : ''} (canvassing context only).`;
            if (windHitCount > 0)
                summary += ` ${windHitCount} wind event${windHitCount > 1 ? 's' : ''} within 1mi.`;
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
            actionableHits: actionableHitCount,
            windHits: windHitCount,
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
//
// Phase 4: by default this endpoint ENQUEUES a pdf_jobs row and returns
// {jobId} immediately so the web container never blocks on pdfkit while
// reps are hitting chat/SSE. Poll GET /api/hail/report/:id for status
// (returns {status:'pending'|'running'|'done'|'error', url?, error?}).
// When status='done', url is a path under /uploads/reports/ that the
// browser can GET to download the PDF.
//
// Pass `sync: true` in the body to force inline rendering (for scripts
// that want the bytes back in one HTTP call). Rep-facing UI should
// always use the async mode.
router.post('/generate-report', async (req, res) => {
    try {
        // ENQUEUE MODE (default) — insert a row, return the ID, let the
        // sa21-worker render. This is what the UI "Generate Report" button
        // has used since Phase 4. The sync path below is only for curl
        // scripts and the adjuster-packet one-off generators.
        if (req.body?.sync !== true) {
            const pool = req.app.get('pool');
            const requestedBy = req.header('x-user-email') || null;
            // Swath-first enrichment — run before enqueue so the PDF's DIRECT HIT
            // labels agree with the UI side panel (see feedback memo:
            // swath-first-direct-hit). Without this, the worker renders the raw
            // payload and gets distance-only labels. Adds ~1-3s to the enqueue
            // call which is acceptable vs a wrong PDF.
            const enrichedPayload = { ...(req.body || {}) };
            const latNum = Number(enrichedPayload.lat);
            const lngNum = Number(enrichedPayload.lng);
            if (Number.isFinite(latNum) && Number.isFinite(lngNum)
                && !Array.isArray(enrichedPayload.swathDirectHitDates)) {
                try {
                    const { getAddressHailImpact } = await import('../services/addressImpactService.js');
                    // skipColdFetch: the enqueue path can't block the client while we
                    // cold-fetch 20+ uncached dates at 2-3s each (would block for 45-60s).
                    // Use only what's already in mrms_swath_cache. The nightly backfill
                    // fills the cache for every ≥1" DMV+PA storm day, so all rep-relevant
                    // dates are warm — a miss here means the date wasn't claim-worthy.
                    const impact = await getAddressHailImpact(pool, latNum, lngNum, 60, { skipColdFetch: true });
                    enrichedPayload.swathDirectHitDates = (impact?.directHits || []).map((d) => String(d.date));
                    console.log(`[generate-report] enriched with ${enrichedPayload.swathDirectHitDates.length} swath direct hits (cached-only)`);
                }
                catch (e) {
                    console.warn('[generate-report] swath enrichment skipped:', e.message);
                }
            }
            const { rows } = await pool.query(`INSERT INTO pdf_jobs (payload, requested_by_email)
         VALUES ($1::jsonb, $2)
         RETURNING id, created_at`, [JSON.stringify(enrichedPayload), requestedBy]);
            const jobId = rows[0].id;
            console.log(`[generate-report] enqueued job ${jobId} for ${requestedBy || 'anon'}`);
            return res.status(202).json({
                jobId,
                status: 'pending',
                pollUrl: `/api/hail/report/${jobId}`,
                message: 'Report queued. Poll pollUrl until status=done, then download from result url.',
            });
        }
        // SWATH ENRICHMENT — inject synthetic "at-property" events for every date
        // the property sits inside an MRMS swath polygon. The walk is expensive:
        // 100+ swath polygon reads and potential cold cache fills. It pushed
        // response time past Railway's 300s gateway and was causing 502s, so it
        // is now OPT-IN via `enrichSwath: true`. Callers who want it (the map
        // address-search flow that already expects a 30-60s response) pass the
        // flag; adjuster PDF generation with hand-crafted events does not.
        //
        // Backwards compat: `skipEnrichment: true` still forces skip.
        if (req.body?.enrichSwath === true && req.body?.skipEnrichment !== true)
            try {
                const pool = req.app.get('pool');
                const latNum = Number(req.body?.lat);
                const lngNum = Number(req.body?.lng);
                if (Number.isFinite(latNum) && Number.isFinite(lngNum)) {
                    const { getAddressHailImpact } = await import('../services/addressImpactService.js');
                    const impact = await getAddressHailImpact(pool, latNum, lngNum, 24);
                    const swathEvents = (impact.directHits || [])
                        .filter((d) => Number(d.maxHailInches || 0) >= 0.5)
                        .map((d, i) => ({
                        id: `swath-${d.date}-${i}`,
                        date: d.date,
                        hailSize: Number(d.maxHailInches),
                        magnitude: Number(d.maxHailInches),
                        magnitudeType: 'inches',
                        eventType: 'Hail',
                        beginDate: d.date,
                        endDate: d.date,
                        beginLat: latNum,
                        beginLon: lngNum,
                        endLat: latNum,
                        endLon: lngNum,
                        latitude: latNum,
                        longitude: lngNum,
                        distanceMiles: 0, // at-property by definition
                        source: 'MRMS Swath (at property)',
                        severity: d.severity || 'verified',
                        narrative: `Verified hail swath at property on ${d.date} — MRMS band ${d.sizeLabel || d.maxHailInches + '"'}, ${d.confirmingReportCount || 0} confirming reports within 2mi${d.noaaConfirmed ? ', NOAA-confirmed' : ''}.`,
                        state: d.state || '',
                        county: '',
                        damageProperty: 0,
                    }));
                    if (swathEvents.length > 0) {
                        if (!Array.isArray(req.body.events))
                            req.body.events = [];
                        if (!Array.isArray(req.body.historyEvents))
                            req.body.historyEvents = [];
                        // Prepend so swath rows win when same-date dedup runs downstream
                        req.body.events = [...swathEvents, ...(req.body.events || [])];
                        req.body.historyEvents = [...swathEvents, ...(req.body.historyEvents || [])];
                        console.log(`[generate-report] injected ${swathEvents.length} swath direct hits for (${latNum.toFixed(3)}, ${lngNum.toFixed(3)})`);
                    }
                }
            }
            catch (enrichErr) {
                console.warn('[generate-report] swath enrichment failed, continuing without:', enrichErr.message);
            }
        const { address, city, state, lat, lng, radius, events, noaaEvents, historyEvents, damageScore, repName, repPhone, repEmail, companyName, filter, includeNexrad = true, includeMap = true, includeWarnings = true, customerName, dateOfLoss, 
        // Multi-date modes — mirror /claim-packet's accepted shapes. PdfReportServiceV2
        // already knows how to consume these (see pdfReportServiceV2.ts:86-90).
        datesOfLoss, // string[] — multiple discrete storm dates
        fromDate, // string — range start (YYYY-MM-DD)
        toDate, // string — range end (YYYY-MM-DD)
        template = 'standard', evidenceItems = [], } = req.body;
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
        // Step 1b: Composite hail overlay onto the map image.
        // Prefer MRMS vector swath polygons (radar-derived, forensic accuracy).
        // Fall back to convex-hull contours from ground reports when MRMS isn't
        // available for the storm date (e.g., pre-MRMS dates or decode failure).
        let finalMapImage = mapImage;
        let usedVectorOverlay = false;
        if (mapImage && primaryStormDate) {
            try {
                const stormDateKey = getDateKey(primaryStormDate);
                if (stormDateKey) {
                    // ~0.5° bounding box (~35mi radius) around the subject property.
                    // This is roughly what reps care about for damage boundary disputes.
                    const pdfBoundsPadding = 0.5;
                    const vectorCollection = await getHistoricalMrmsSwathPolygons({
                        date: stormDateKey,
                        north: parsedLat + pdfBoundsPadding,
                        south: parsedLat - pdfBoundsPadding,
                        east: parsedLng + pdfBoundsPadding,
                        west: parsedLng - pdfBoundsPadding,
                        anchorTimestamp: primaryStormDate,
                    }, req.app.get('pool'));
                    if (vectorCollection.features.length > 0) {
                        finalMapImage = await compositeVectorSwathOverlay(mapImage, vectorCollection, { lat: parsedLat, lng: parsedLng }, 15);
                        usedVectorOverlay = true;
                        console.log(`[PDF] Composited ${vectorCollection.features.length} MRMS vector swaths ` +
                            `(peak ${vectorCollection.metadata.maxMeshInches.toFixed(2)}") onto map image`);
                    }
                }
            }
            catch (e) {
                console.warn('[PDF] MRMS vector overlay failed, falling back:', e.message);
            }
        }
        if (!usedVectorOverlay && mapImage && (normalizedEvents.length > 0 || normalizedNoaaEvents.length > 0)) {
            try {
                const contourEvents = [...normalizedEvents, ...normalizedNoaaEvents]
                    .filter((e) => e.hailSize > 0 || (e.eventType === 'hail' && e.magnitude > 0))
                    .map((e) => ({
                    beginLat: Number(e.latitude) || 0,
                    beginLon: Number(e.longitude) || 0,
                    endLat: Number(e.latitude) || 0,
                    endLon: Number(e.longitude) || 0,
                    magnitude: Number(e.hailSize || e.magnitude) || 0,
                    eventType: 'Hail',
                }));
                if (contourEvents.length > 0) {
                    finalMapImage = await compositeContourOverlay(mapImage, contourEvents, { lat: parsedLat, lng: parsedLng }, 15);
                    console.log(`[PDF] Composited ${contourEvents.length} hail contours onto map image (fallback)`);
                }
            }
            catch (e) {
                console.warn('[PDF] Contour overlay failed (using plain map):', e.message);
            }
        }
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
        // Fix: bare "YYYY-MM-DD" → new Date() = midnight UTC = 8 PM ET prior day,
        // which is BEFORE the storm. Shift to 20:00 UTC (~4 PM ET) when severe
        // weather typically peaks. Alerts with a real ISO timestamp are unchanged.
        const normalizeRadarDatetime = (ts) => {
            const fallback = `${primaryStormDate.slice(0, 10)}T20:00:00Z`;
            if (!ts)
                return fallback;
            const bare = /^\d{4}-\d{2}-\d{2}$/.test(ts);
            if (bare)
                return `${ts}T20:00:00Z`;
            return ts;
        };
        if (includeNexrad && alertsToProcess.length > 0) {
            nwsAlertImages = await Promise.all(alertsToProcess.map(async (alert) => {
                const radarTs = normalizeRadarDatetime(alert.onset);
                const result = await fetchNexradImage({ lat: parsedLat, lng: parsedLng, datetime: radarTs })
                    .catch(e => { console.warn(`NEXRAD fetch failed for alert ${alert.event}:`, e.message); return null; });
                return {
                    alert,
                    radarImage: result?.imageBuffer || null,
                    radarTimestamp: radarTs
                };
            }));
            // PDF's "Storm Radar Evidence" section reads `nexradImage` (single buffer).
            // Lift the first non-null per-alert image into that field so the section
            // renders. Without this the radar was fetched but never shown — the
            // warnings card copy says "radar already shown in Storm Radar Evidence"
            // but that section was gated on input.nexradImage which nothing was
            // setting when synthetic alerts ran.
            const firstWithImage = nwsAlertImages.find((a) => a.radarImage);
            if (firstWithImage && firstWithImage.radarImage) {
                nexradResult = {
                    imageBuffer: firstWithImage.radarImage,
                    timestamp: firstWithImage.radarTimestamp,
                };
            }
            console.log(`📡 Fetched ${nwsAlertImages.filter(a => a.radarImage).length}/${alertsToProcess.length} per-alert NEXRAD images (${realAlerts.length > 0 ? 'real NWS' : 'synthetic from events'})`);
        }
        else if (includeNexrad) {
            // No alerts and no events — fetch single NEXRAD for the primary storm date
            nexradResult = await fetchNexradImage({ lat: parsedLat, lng: parsedLng, datetime: normalizeRadarDatetime(primaryStormDate) })
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
        // Consult the swath-first address impact service so the PDF's "DIRECT HIT"
        // labels agree with the UI's side panel. Without this, a property inside
        // a swath polygon with its nearest point report 1.2 mi away gets
        // labeled "1-3 mi" in the PDF even though the UI says Direct Hit. Match
        // the monthsBack window to the date filters in play: lifetime → 60 mo,
        // single-date / range → cover the range + a bit.
        let swathDirectHitDates = [];
        try {
            const { getAddressHailImpact } = await import('../services/addressImpactService.js');
            const impact = await getAddressHailImpact(req.app.get('pool'), parsedLat, parsedLng, 60);
            swathDirectHitDates = (impact?.directHits || []).map((d) => String(d.date));
        }
        catch (e) {
            console.warn('[generate-report] swath-first impact check failed (PDF will fall back to distance-only labels):', e.message);
        }
        // Generate PDF stream
        const pdfStream = pdfReportServiceV2.generateReport({
            address,
            city,
            state,
            lat: parsedLat,
            lng: parsedLng,
            radius: parseFloat(radius),
            swathDirectHitDates,
            noaaEvents: normalizedNoaaEvents,
            historyEvents: normalizedHistoryEvents,
            dateOfLoss,
            datesOfLoss: Array.isArray(datesOfLoss) && datesOfLoss.length > 0 ? datesOfLoss : undefined,
            fromDate: fromDate || undefined,
            toDate: toDate || undefined,
            events: normalizedEvents,
            damageScore,
            repName: resolvedRepName,
            repPhone: resolvedRepPhone,
            repEmail: resolvedRepEmail,
            companyName: resolvedCompanyName,
            filter: reportFilter,
            mapImage: finalMapImage || undefined,
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
// GET /api/hail/report/:id — poll a pdf_jobs row for status.
//
// Returns one of:
//   { status: 'pending'|'running', jobId, createdAt }
//   { status: 'done',  jobId, url: '/api/hail/report/<id>/download', completedAt }
//   { status: 'error', jobId, error, completedAt }
//
// The browser polls this every ~2s after POST /generate-report, then
// follows `url` to stream the PDF bytes back.
router.get('/report/:id', async (req, res) => {
    try {
        const id = String(req.params.id || '');
        if (!/^[0-9a-f-]{10,}$/i.test(id)) {
            return res.status(400).json({ error: 'invalid job id' });
        }
        const pool = req.app.get('pool');
        const { rows } = await pool.query(`SELECT id, status,
              result_url, (result_bytes IS NOT NULL) AS has_bytes,
              error, created_at, started_at, completed_at
         FROM pdf_jobs WHERE id = $1`, [id]);
        if (rows.length === 0)
            return res.status(404).json({ error: 'job not found' });
        const r = rows[0];
        if (r.status === 'done') {
            // Prefer an explicit external URL (for future S3/R2 integration),
            // fall back to the in-DB bytes served by /download below.
            const url = r.result_url || `/api/hail/report/${id}/download`;
            return res.json({
                status: 'done', jobId: id, url, hasBytes: !!r.has_bytes,
                createdAt: r.created_at, completedAt: r.completed_at,
            });
        }
        if (r.status === 'error') {
            return res.json({
                status: 'error', jobId: id, error: r.error,
                createdAt: r.created_at, completedAt: r.completed_at,
            });
        }
        return res.json({
            status: r.status, jobId: id,
            createdAt: r.created_at, startedAt: r.started_at,
        });
    }
    catch (err) {
        console.error('[report/:id] err:', err);
        res.status(500).json({ error: err.message });
    }
});
// GET /api/hail/report/:id/download — stream the PDF bytes back.
// Read the bytea column and pipe to the response with a sensible
// filename derived from the payload (address + date-of-loss when present).
router.get('/report/:id/download', async (req, res) => {
    try {
        const id = String(req.params.id || '');
        if (!/^[0-9a-f-]{10,}$/i.test(id)) {
            return res.status(400).json({ error: 'invalid job id' });
        }
        const pool = req.app.get('pool');
        const { rows } = await pool.query(`SELECT status, result_bytes, result_mime, payload
         FROM pdf_jobs WHERE id = $1`, [id]);
        if (rows.length === 0)
            return res.status(404).json({ error: 'job not found' });
        const r = rows[0];
        if (r.status !== 'done' || !r.result_bytes) {
            return res.status(409).json({ error: 'report not ready', status: r.status });
        }
        const body = r.payload || {};
        const addrSlug = String(body.address || 'report')
            .replace(/[^A-Za-z0-9_-]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 60);
        const dateTag = body.dateOfLoss || body.toDate ||
            (Array.isArray(body.datesOfLoss) && body.datesOfLoss[0]) || '';
        const filename = `${addrSlug}${dateTag ? '_' + dateTag : ''}.pdf`;
        res.setHeader('Content-Type', r.result_mime || 'application/pdf');
        res.setHeader('Content-Length', String(r.result_bytes.length));
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        res.end(r.result_bytes);
    }
    catch (err) {
        console.error('[report/:id/download] err:', err);
        res.status(500).json({ error: err.message });
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
// GET /api/hail/mrms-swath-polygons - Vector GeoJSON polygons for a storm date
// Returns 10-level hail swath polygons (crisp, clickable, IHM/HailTrace quality)
router.get('/mrms-swath-polygons', async (req, res) => {
    try {
        const { date, north, south, east, west, anchorTimestamp } = req.query;
        if (!date || !north || !south || !east || !west) {
            return res.status(400).json({
                error: 'date, north, south, east, and west are required',
            });
        }
        const pool = req.app.get('pool');
        const result = await getHistoricalMrmsSwathPolygons({
            date: String(date),
            north: Number(north),
            south: Number(south),
            east: Number(east),
            west: Number(west),
            anchorTimestamp: anchorTimestamp ? String(anchorTimestamp) : null,
        }, pool);
        res.setHeader('Cache-Control', 'public, max-age=900');
        res.json(result);
    }
    catch (error) {
        console.error('MRMS swath polygons error:', error);
        res.status(500).json({ error: error.message });
    }
});
// GET /api/hail/mrms-now-polygons — LIVE radar (~5min latency)
// Pulls the latest MRMS MESH 60-min or 1440-min composite from NCEP and
// returns it as the same 10-band GeoJSON the historical endpoint emits.
// Intended for the "LIVE" toggle on the map so reps see hail in progress.
router.get('/mrms-now-polygons', async (req, res) => {
    try {
        const { north, south, east, west, product } = req.query;
        if (!north || !south || !east || !west) {
            return res.status(400).json({
                error: 'north, south, east, and west are required',
            });
        }
        const productParam = product === 'mesh1440' ? 'mesh1440' : 'mesh60';
        const result = await getLiveMrmsSwathPolygons({
            north: Number(north),
            south: Number(south),
            east: Number(east),
            west: Number(west),
            product: productParam,
        });
        // Short browser cache since data updates every 2 min upstream.
        res.setHeader('Cache-Control', 'public, max-age=60');
        res.setHeader('X-MRMS-Product', productParam);
        res.setHeader('X-MRMS-Ref-Time', result.refTime);
        res.setHeader('X-MRMS-Live', 'true');
        res.setHeader('Access-Control-Expose-Headers', 'X-MRMS-Product, X-MRMS-Ref-Time, X-MRMS-Live');
        res.json(result);
    }
    catch (error) {
        console.error('Live MRMS polygons error:', error);
        res.status(500).json({ error: error.message });
    }
});
// Shared core: render a claim-packet PDF into the given response stream.
// Extracted so it can be called from both the rep-facing endpoint (with
// x-user-email auth) and the public share-link endpoint (which authenticated
// itself via a token lookup).
//
// Date filter modes (pick one; all optional → lifetime 5yr report):
//  - stormDate: single "YYYY-MM-DD"              → single-storm report
//  - stormDates: ["YYYY-MM-DD", ...]             → multi-storm combined
//  - fromDate + toDate: "YYYY-MM-DD"             → date range
//  - (none)                                       → 5-year lifetime
async function renderClaimPacketToResponse(res, pool, params) {
    const { rows: propertyRows } = await pool.query(`SELECT cp.id, cp.user_id, cp.customer_name, cp.address, cp.city, cp.state, cp.zip_code,
            cp.latitude, cp.longitude
       FROM customer_properties cp
       WHERE cp.id = $1 AND cp.is_active = TRUE
       LIMIT 1`, [params.propertyId]);
    if (!propertyRows.length) {
        res.status(404).json({ error: 'Property not found' });
        return;
    }
    const property = propertyRows[0];
    const lat = Number(property.latitude);
    const lng = Number(property.longitude);
    const propertyAddress = [property.address, property.city, property.state]
        .filter(Boolean)
        .join(', ');
    // Determine date-filter mode + compute the appropriate window for the DB query
    const singleDate = params.stormDate && !params.stormDates?.length ? params.stormDate : null;
    const multiDates = params.stormDates && params.stormDates.length > 0 ? params.stormDates : null;
    const fromDate = params.fromDate ?? null;
    const toDate = params.toDate ?? null;
    const isLifetime = !singleDate && !multiDates && !fromDate && !toDate;
    // For the DB pull, widen the year window enough to cover the oldest requested date
    let queryYearsBack = 5;
    if (singleDate) {
        queryYearsBack = Math.max(1, new Date().getUTCFullYear() - Number(singleDate.slice(0, 4)) + 1);
    }
    else if (multiDates) {
        const oldest = multiDates.reduce((m, d) => (d < m ? d : m), '9999-99-99');
        queryYearsBack = Math.max(1, new Date().getUTCFullYear() - Number(oldest.slice(0, 4)) + 1);
    }
    else if (fromDate) {
        queryYearsBack = Math.max(1, new Date().getUTCFullYear() - Number(fromDate.slice(0, 4)) + 1);
    }
    // Pull events from verified_hail_events via the adapter (multi-source pipeline).
    // Replaces the old on-demand noaaStormService call which only returned 1 source.
    const adapter = new VerifiedEventsPdfAdapter(pool);
    let adapterEvents = [];
    let adapterHistoryEvents = [];
    let adapterNoaaEvents = [];
    try {
        const result = await adapter.getEventsForProperty(lat, lng, 10, queryYearsBack, true);
        adapterEvents = result.events;
        adapterHistoryEvents = result.historyEvents;
        adapterNoaaEvents = result.noaaEvents;
    }
    catch (e) {
        console.warn('[ClaimPacket] Adapter fetch failed:', e.message);
    }
    // Pick a representative storm date for NEXRAD radar + storm-impact lookup
    const representativeDate = singleDate
        || (multiDates && multiDates.length > 0 ? multiDates[0] : null)
        || toDate
        || new Date().toISOString().slice(0, 10);
    const impactResult = await computeStormImpact({
        date: representativeDate,
        anchorTimestamp: params.anchorTimestamp ?? null,
        points: [{ id: String(property.id), lat, lng }],
    }, pool);
    const impactAtProperty = impactResult.results[0];
    // Fetch map + NEXRAD radar images (existing helpers)
    const mapImage = await fetchMapImage({ lat, lng, zoom: 11, width: 640, height: 360 })
        .catch(() => null);
    const nexradResult = await fetchNexradImage({
        lat, lng,
        datetime: representativeDate + 'T20:00:00Z',
        width: 640, height: 400,
    }).catch(() => null);
    const damageScore = damageScoreService.calculateDamageScore({
        lat,
        lng,
        address: propertyAddress,
        events: adapterEvents,
        noaaEvents: adapterNoaaEvents,
    });
    // Swath-first direct-hit labeling — same as /generate-report, so the
    // PDF's DIRECT HIT column agrees with the UI's side panel.
    let claimPacketSwathDirectHits = [];
    try {
        const { getAddressHailImpact } = await import('../services/addressImpactService.js');
        const impact = await getAddressHailImpact(pool, lat, lng, 60);
        claimPacketSwathDirectHits = (impact?.directHits || []).map((d) => String(d.date));
    }
    catch (e) {
        console.warn('[claim-packet] swath-first impact check failed:', e.message);
    }
    const reportPayload = {
        address: propertyAddress,
        city: property.city,
        state: property.state,
        lat,
        lng,
        radius: 10,
        swathDirectHitDates: claimPacketSwathDirectHits,
        events: adapterEvents,
        historyEvents: adapterHistoryEvents,
        noaaEvents: adapterNoaaEvents,
        damageScore,
        repName: params.repName || 'Roof ER',
        repPhone: params.repPhone || '(703) 239-3738',
        repEmail: params.repEmail || 'info@theroofdocs.com',
        companyName: 'Roof ER The Roof Docs',
        customerName: property.customer_name,
        // Date-filter — PDF service picks the right mode
        dateOfLoss: singleDate || undefined,
        datesOfLoss: multiDates || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        mapImage,
        nexradImage: nexradResult?.imageBuffer || null,
        nexradTimestamp: nexradResult?.timestamp,
        includeNexrad: !!nexradResult?.imageBuffer,
        includeMap: !!mapImage,
        includeWarnings: false, // only show if real alerts attached
    };
    // Build filename-safe date tag
    const dateTag = singleDate
        ? singleDate.replace(/[^0-9-]/g, '')
        : multiDates && multiDates.length > 0
            ? `${multiDates.length}storms`
            : fromDate && toDate
                ? `${fromDate}_to_${toDate}`.replace(/[^0-9_-]/g, '')
                : 'lifetime';
    const safeDate = dateTag;
    const safeName = property.customer_name.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 40);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="ClaimPacket_${safeName}_${safeDate}.pdf"`);
    res.setHeader('X-Storm-Impact', JSON.stringify({
        maxHailInches: impactAtProperty.maxHailInches,
        label: impactAtProperty.label,
        directHit: impactAtProperty.directHit,
        propertyId: property.id,
        stormDate: params.stormDate,
    }));
    res.setHeader('Access-Control-Expose-Headers', 'X-Storm-Impact');
    const pdfStream = pdfReportServiceV2.generateReport(reportPayload);
    pdfStream.pipe(res);
    pdfStream.on('error', (err) => {
        console.error('[ClaimPacket] PDF stream error:', err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'PDF generation failed' });
        }
    });
}
// POST /api/hail/claim-packet — Adjuster-ready PDF from verified_hail_events
// (multi-source: NOAA + NEXRAD + SPC + NWS + CoCoRaHS).
//
// Body accepts ANY of these date-filter modes:
//   { propertyId, stormDate: "YYYY-MM-DD" }                      → single-storm
//   { propertyId, stormDates: ["YYYY-MM-DD", ...] }              → multi-storm (combined)
//   { propertyId, fromDate: "YYYY-MM-DD", toDate: "YYYY-MM-DD" } → date range
//   { propertyId }                                                → lifetime (5-yr)
//
// Optional: anchorTimestamp (used for storm-impact + radar scan selection).
// Headers: x-user-email (used for rep-profile auto-fill)
router.post('/claim-packet', async (req, res) => {
    try {
        const email = req.header('x-user-email');
        if (!email)
            return res.status(401).json({ error: 'Not authenticated' });
        const { propertyId, stormDate, stormDates, fromDate, toDate, anchorTimestamp } = req.body || {};
        if (!propertyId) {
            return res.status(400).json({ error: 'propertyId is required' });
        }
        // Validate only one mode is specified
        const modesSet = [
            !!stormDate,
            Array.isArray(stormDates) && stormDates.length > 0,
            !!fromDate || !!toDate,
        ].filter(Boolean).length;
        if (modesSet > 1) {
            return res.status(400).json({
                error: 'Specify only ONE of: stormDate (single), stormDates (multi), or fromDate/toDate (range). Omit all for lifetime report.',
            });
        }
        const pool = req.app.get('pool');
        // 1. Look up the customer property. Require it belong to the requesting rep
        //    (or that the rep is an admin). This prevents reps from pulling other
        //    reps' customer details into claim packets.
        const { rows: userRows } = await pool.query('SELECT id, role, name, phone FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1', [email]);
        if (!userRows.length)
            return res.status(404).json({ error: 'User not found' });
        const user = userRows[0];
        const { rows: propertyRows } = await pool.query(`SELECT cp.id, cp.user_id, cp.customer_name, cp.customer_phone, cp.customer_email,
              cp.address, cp.city, cp.state, cp.zip_code, cp.latitude, cp.longitude,
              cp.property_type, cp.roof_type, cp.roof_age_years
         FROM customer_properties cp
         WHERE cp.id = $1 AND cp.is_active = TRUE
         LIMIT 1`, [propertyId]);
        if (!propertyRows.length) {
            return res.status(404).json({ error: 'Property not found' });
        }
        const property = propertyRows[0];
        if (property.user_id !== user.id && user.role !== 'admin') {
            return res.status(403).json({
                error: 'This property belongs to another rep',
            });
        }
        await renderClaimPacketToResponse(res, pool, {
            propertyId: String(propertyId),
            stormDate: stormDate ? String(stormDate) : null,
            stormDates: Array.isArray(stormDates) ? stormDates.map(String) : undefined,
            fromDate: fromDate ? String(fromDate) : null,
            toDate: toDate ? String(toDate) : null,
            anchorTimestamp: anchorTimestamp ? String(anchorTimestamp) : null,
            repName: user.name,
            repPhone: user.phone,
            repEmail: email,
        });
    }
    catch (error) {
        console.error('Claim packet error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message });
        }
    }
});
// POST /api/hail/claim-packet-share — generates a shareable URL that adjusters
// can open (no auth) to download the claim-packet PDF. PDF re-renders on each
// fetch so upstream data improvements propagate automatically.
router.post('/claim-packet-share', async (req, res) => {
    try {
        const email = req.header('x-user-email');
        if (!email)
            return res.status(401).json({ error: 'Not authenticated' });
        const { propertyId, stormDate, anchorTimestamp, expiresInDays } = req.body || {};
        if (!propertyId || !stormDate) {
            return res.status(400).json({
                error: 'propertyId and stormDate are required',
            });
        }
        const pool = req.app.get('pool');
        const { rows: userRows } = await pool.query('SELECT id, role FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1', [email]);
        if (!userRows.length)
            return res.status(404).json({ error: 'User not found' });
        const user = userRows[0];
        // Verify rep owns the property (same rule as /claim-packet).
        const { rows: propertyRows } = await pool.query(`SELECT id, user_id FROM customer_properties
         WHERE id = $1 AND is_active = TRUE LIMIT 1`, [propertyId]);
        if (!propertyRows.length) {
            return res.status(404).json({ error: 'Property not found' });
        }
        if (propertyRows[0].user_id !== user.id && user.role !== 'admin') {
            return res.status(403).json({ error: 'Property belongs to another rep' });
        }
        const crypto = await import('node:crypto');
        const token = crypto.randomBytes(16).toString('base64url');
        const days = Math.max(1, Math.min(365, Number(expiresInDays) || 30));
        await pool.query(`INSERT INTO claim_packet_shares
         (token, created_by_user_id, customer_property_id, storm_date, anchor_timestamp, expires_at)
         VALUES ($1, $2, $3, $4, $5, NOW() + ($6 || ' days')::INTERVAL)`, [
            token,
            user.id,
            propertyId,
            stormDate,
            anchorTimestamp || null,
            String(days),
        ]);
        const host = req.get('host');
        const protocol = req.header('x-forwarded-proto') || req.protocol;
        const url = `${protocol}://${host}/api/hail/public-packet/${token}`;
        res.json({
            token,
            url,
            expiresInDays: days,
        });
    }
    catch (error) {
        console.error('Claim packet share error:', error);
        res.status(500).json({ error: error.message });
    }
});
// GET /api/hail/public-packet/:token — public endpoint (no auth). Adjusters
// open this URL to download the claim packet PDF. Each access is logged.
router.get('/public-packet/:token', async (req, res) => {
    try {
        const { token } = req.params;
        if (!token)
            return res.status(400).json({ error: 'Token required' });
        const pool = req.app.get('pool');
        const { rows } = await pool.query(`SELECT cps.id, cps.customer_property_id, cps.storm_date, cps.anchor_timestamp,
              cps.expires_at, cps.revoked_at, u.name AS rep_name, u.phone AS rep_phone,
              u.email AS rep_email
         FROM claim_packet_shares cps
         JOIN users u ON u.id = cps.created_by_user_id
         WHERE cps.token = $1 LIMIT 1`, [token]);
        if (!rows.length) {
            return res.status(404).json({ error: 'Link not found' });
        }
        const share = rows[0];
        if (share.revoked_at) {
            return res.status(410).json({ error: 'Link has been revoked' });
        }
        if (new Date(share.expires_at).getTime() < Date.now()) {
            return res.status(410).json({ error: 'Link has expired' });
        }
        // Audit
        await pool.query(`UPDATE claim_packet_shares
         SET access_count = access_count + 1, last_accessed_at = NOW()
         WHERE id = $1`, [share.id]);
        // Convert Date → YYYY-MM-DD
        const stormDateStr = share.storm_date instanceof Date
            ? share.storm_date.toISOString().slice(0, 10)
            : String(share.storm_date).slice(0, 10);
        await renderClaimPacketToResponse(res, pool, {
            propertyId: share.customer_property_id,
            stormDate: stormDateStr,
            anchorTimestamp: share.anchor_timestamp,
            repName: share.rep_name,
            repPhone: share.rep_phone,
            repEmail: share.rep_email,
            sharedExternally: true,
        });
    }
    catch (error) {
        console.error('Public packet error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message });
        }
    }
});
// POST /api/hail/claim-packet-share/:token/revoke — rep can revoke a link
router.post('/claim-packet-share/:token/revoke', async (req, res) => {
    try {
        const email = req.header('x-user-email');
        if (!email)
            return res.status(401).json({ error: 'Not authenticated' });
        const pool = req.app.get('pool');
        const { rows } = await pool.query(`UPDATE claim_packet_shares cps
         SET revoked_at = NOW()
         FROM users u
         WHERE u.id = cps.created_by_user_id
           AND cps.token = $1
           AND (LOWER(u.email) = LOWER($2) OR u.role = 'admin')
           AND cps.revoked_at IS NULL
         RETURNING cps.id`, [req.params.token, email]);
        if (!rows.length) {
            return res.status(404).json({ error: 'Link not found or not owned by you' });
        }
        res.json({ revoked: true });
    }
    catch (error) {
        console.error('Revoke share error:', error);
        res.status(500).json({ error: error.message });
    }
});
// GET /api/hail/hailtrace-validation — cross-validate MRMS swath vs HailTrace
// Overlays the rep's imported HailTrace points on our automated polygons and
// flags disagreements so the rep knows where to double-check.
router.get('/hailtrace-validation', async (req, res) => {
    try {
        const { date, north, south, east, west, anchorTimestamp } = req.query;
        if (!date || !north || !south || !east || !west) {
            return res.status(400).json({
                error: 'date, north, south, east, west required',
            });
        }
        const pool = req.app.get('pool');
        const result = await crossValidateHailtrace({
            date: String(date),
            north: Number(north),
            south: Number(south),
            east: Number(east),
            west: Number(west),
            anchorTimestamp: anchorTimestamp ? String(anchorTimestamp) : null,
        }, pool);
        res.setHeader('Cache-Control', 'public, max-age=600');
        res.json(result);
    }
    catch (error) {
        console.error('HailTrace validation error:', error);
        res.status(500).json({ error: error.message });
    }
});
// POST /api/hail/admin/backfill-swaths
// Trigger a single swath-cache backfill run on-demand. Body: { maxPerRun?, monthsBack?, dryRun? }.
// Use this to churn through the 300+ missing DMV storm days faster than the
// nightly cron. Protected behind ADMIN_EMAIL check in future; currently open
// but low-risk (just populates cache from the IEM public archive).
router.post('/admin/backfill-swaths', async (req, res) => {
    try {
        const { backfillSwathCache } = await import('../services/swathBackfillService.js');
        const monthsBack = Number(req.body?.monthsBack ?? 24);
        const maxPerRun = Math.min(Number(req.body?.maxPerRun ?? 60), 200);
        const dryRun = req.body?.dryRun === true;
        const r = await backfillSwathCache(req.app.get('pool'), { monthsBack, maxPerRun, dryRun });
        res.json(r);
    }
    catch (err) {
        console.error('[admin/backfill-swaths] err:', err);
        res.status(500).json({ error: err.message });
    }
});
// POST /api/hail/admin/backfill-catchup
// Run full catch-up (up to maxTotal, default 500) in multiple rate-limited
// batches. May take 20-40 minutes — use ngrok or keep the connection open.
router.post('/admin/backfill-catchup', async (req, res) => {
    try {
        const { fullCatchUp } = await import('../services/swathBackfillService.js');
        const maxTotal = Math.min(Number(req.body?.maxTotal ?? 500), 800);
        const runs = await fullCatchUp(req.app.get('pool'), { maxTotal });
        const totals = runs.reduce((a, r) => ({
            succeeded: a.succeeded + r.succeeded,
            failed: a.failed + r.failed,
            durationMs: a.durationMs + r.durationMs,
        }), { succeeded: 0, failed: 0, durationMs: 0 });
        res.json({ runs: runs.length, ...totals, lastRemaining: runs.at(-1)?.daysRemaining ?? 0 });
    }
    catch (err) {
        console.error('[admin/backfill-catchup] err:', err);
        res.status(500).json({ error: err.message });
    }
});
// POST /api/hail/admin/cocorahs-backfill { monthsBack?, maxDays? }
// Fire-and-forget CoCoRaHS historical ingest. Runs serially at 500ms/req.
// 24 months ≈ 730 days × 3 states = ~18 min. Returns immediately with a
// background-running status so the admin can navigate away.
router.post('/admin/cocorahs-backfill', async (req, res) => {
    try {
        const { CocorahsLiveService } = await import('../services/cocorahsLiveService.js');
        const svc = new CocorahsLiveService(req.app.get('pool'));
        const monthsBack = Number(req.body?.monthsBack ?? 24);
        const maxDays = Number(req.body?.maxDays ?? 9999);
        // Fire and forget so the HTTP response returns immediately
        svc.ingestHistorical(monthsBack, { forceEnabled: true, maxDays }).then((r) => {
            console.log(`[admin/cocorahs-backfill] done:`, r);
        }).catch((err) => {
            console.error(`[admin/cocorahs-backfill] err:`, err);
        });
        res.json({ ok: true, status: 'started', monthsBack, maxDays, note: 'Running in background — check server logs for progress.' });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// POST /api/hail/admin/iem-lsr-backfill { monthsBack?, chunkDays? }
router.post('/admin/iem-lsr-backfill', async (req, res) => {
    try {
        const { IemLsrLiveService } = await import('../services/iemLsrLiveService.js');
        const svc = new IemLsrLiveService(req.app.get('pool'));
        const monthsBack = Number(req.body?.monthsBack ?? 24);
        const chunkDays = Number(req.body?.chunkDays ?? 7);
        svc.ingestHistorical(monthsBack, { forceEnabled: true, chunkDays }).then((r) => {
            console.log(`[admin/iem-lsr-backfill] done:`, r);
        }).catch((err) => {
            console.error(`[admin/iem-lsr-backfill] err:`, err);
        });
        res.json({ ok: true, status: 'started', monthsBack, chunkDays, note: 'Running in background — check server logs for progress.' });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// POST /api/hail/admin/nws-alerts-poll — trigger a one-shot NWS alerts poll.
router.post('/admin/nws-alerts-poll', async (req, res) => {
    try {
        const { NwsAlertsLiveService } = await import('../services/nwsAlertsService.js');
        const svc = new NwsAlertsLiveService(req.app.get('pool'));
        const r = await svc.ingestActive();
        res.json(r);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// POST /api/hail/admin/mping-backfill { monthsBack?, chunkDays? }
router.post('/admin/mping-backfill', async (req, res) => {
    try {
        const { MpingLiveService } = await import('../services/mpingLiveService.js');
        const svc = new MpingLiveService(req.app.get('pool'));
        const monthsBack = Number(req.body?.monthsBack ?? 24);
        const chunkDays = Number(req.body?.chunkDays ?? 7);
        svc.ingestHistorical(monthsBack, { forceEnabled: true, chunkDays }).then((r) => {
            console.log('[admin/mping-backfill] done:', r);
        }).catch((err) => {
            console.error('[admin/mping-backfill] err:', err);
        });
        res.json({ ok: true, status: 'started', monthsBack, chunkDays, note: 'Running in background.' });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// POST /api/hail/admin/nexrad-l2-ingest — ingest MESH-derived events from the NEXRAD L2 worker.
//
// Auth: HMAC-SHA256 over a deterministic metadata tuple using NEXRAD_L2_INGEST_SECRET.
// Signature avoids JSON canonicalization pitfalls (Python json.dumps vs JS JSON.stringify
// produce different strings for floats, Unicode, etc). HTTPS + shared secret guard the
// events array itself; the HMAC binds timestamp + scan identity + batch shape.
//
// Worker sends:
//   headers: {
//     'x-ingest-token': HMAC_SHA256(secret, `${timestamp}.${scan_time}.${radar_site}.${events.length}`),
//     'x-ingest-timestamp': <unix-seconds>,
//   }
//   body: { scan_time, radar_site, events: [{ date, lat, lng, hail_inches, state? }, ...] }
//
// 5-minute replay window on timestamp. Events upserted via VerifiedEventsService(source='nexrad_l2').
router.post('/admin/nexrad-l2-ingest', async (req, res) => {
    const secret = process.env.NEXRAD_L2_INGEST_SECRET;
    if (!secret) {
        console.error('[admin/nexrad-l2-ingest] NEXRAD_L2_INGEST_SECRET not configured');
        return res.status(503).json({ error: 'ingest endpoint not configured' });
    }
    const token = String(req.header('x-ingest-token') || '');
    const timestamp = String(req.header('x-ingest-timestamp') || '');
    if (!token || !timestamp) {
        return res.status(401).json({ error: 'missing x-ingest-token or x-ingest-timestamp' });
    }
    const tsNum = Number(timestamp);
    if (!Number.isFinite(tsNum)) {
        return res.status(401).json({ error: 'invalid timestamp' });
    }
    const nowSec = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSec - tsNum) > 300) {
        return res.status(401).json({ error: 'timestamp outside 5-minute window' });
    }
    // Body shape needed for signature — pull out now and validate structure.
    const { scan_time, radar_site, events } = req.body ?? {};
    if (typeof scan_time !== 'string' || typeof radar_site !== 'string' || !Array.isArray(events)) {
        return res.status(400).json({ error: 'body must have scan_time, radar_site, events[]' });
    }
    // HMAC over deterministic metadata tuple. Worker must construct the identical string.
    const crypto = await import('crypto');
    const signingString = `${timestamp}.${scan_time}.${radar_site}.${events.length}`;
    const expected = crypto.createHmac('sha256', secret).update(signingString).digest('hex');
    const tokenBuf = Buffer.from(token, 'hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    if (tokenBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(tokenBuf, expectedBuf)) {
        return res.status(401).json({ error: 'invalid signature' });
    }
    if (events.length === 0) {
        return res.json({ ok: true, inserted: 0, updated: 0, skipped: 0, errors: [] });
    }
    if (events.length > 100_000) {
        return res.status(413).json({ error: 'batch too large (max 100k events per POST)' });
    }
    try {
        const { VerifiedEventsService } = await import('../services/verifiedEventsService.js');
        const pool = req.app.get('pool');
        const svc = new VerifiedEventsService(pool);
        let skipped = 0;
        const batch = events
            .map((e, idx) => {
            const date = typeof e?.date === 'string' ? e.date : null;
            const lat = Number(e?.lat);
            const lng = Number(e?.lng);
            const hail = Number(e?.hail_inches);
            if (!date || !Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(hail)) {
                skipped++;
                return null;
            }
            return {
                eventDate: date,
                latitude: lat,
                longitude: lng,
                state: typeof e?.state === 'string' ? e.state : null,
                hailSizeInches: hail,
                source: 'nexrad_l2',
                sourcePayload: {
                    scan_time,
                    radar_site,
                    hail_inches: hail,
                    event_index: idx,
                },
            };
        })
            .filter((b) => b !== null);
        const result = await svc.upsertBatch(batch);
        console.log(`[admin/nexrad-l2-ingest] ${radar_site} @ ${scan_time}: inserted=${result.inserted}, updated=${result.updated}, skipped=${skipped}, errors=${result.errors.length}`);
        res.json({
            ok: true,
            scan_time,
            radar_site,
            inserted: result.inserted,
            updated: result.updated,
            skipped,
            errors: result.errors.slice(0, 10), // cap so the response stays small
        });
    }
    catch (err) {
        console.error('[admin/nexrad-l2-ingest] err:', err);
        res.status(500).json({ error: err.message });
    }
});
// GET /api/hail/admin/ingest-stats — live counts per source, current state.
// GET /api/hail/admin/coverage-summary
// "How much do we actually have?" — grouped by year across the DMV footprint.
// Reports total rows, unique storm days, and direct-hit counts (events that
// sit inside an MRMS swath polygon) per year so we can see the before/after
// of the NOAA NCEI + NCEI SWDI historical backfill that ran tonight.
router.get('/admin/coverage-summary', async (req, res) => {
    try {
        const pool = req.app.get('pool');
        const { rows } = await pool.query(`
      SELECT
        EXTRACT(year FROM event_date)::int AS year,
        COUNT(*)::int                      AS total_events,
        COUNT(DISTINCT event_date)::int    AS unique_storm_days,
        COUNT(*) FILTER (WHERE hail_size_inches >= 1.0)::int  AS severe_hail_events,
        COUNT(*) FILTER (WHERE hail_size_inches >= 0.5)::int  AS adjuster_tier_hail,
        COUNT(*) FILTER (WHERE source_noaa_ncei)::int         AS noaa_tagged,
        COUNT(*) FILTER (WHERE source_ncei_swdi)::int         AS nexrad_tagged,
        ROUND(MAX(hail_size_inches)::numeric, 2)              AS max_hail_that_year
      FROM verified_hail_events_public_sane
      WHERE state IN ('VA','MD','DC','PA','WV','DE')
      GROUP BY year
      ORDER BY year DESC
    `);
        const totals = await pool.query(`
      SELECT
        COUNT(*)::int                      AS total_events,
        COUNT(DISTINCT event_date)::int    AS unique_storm_days,
        COUNT(*) FILTER (WHERE hail_size_inches >= 1.0)::int AS severe_hail_events,
        MIN(event_date)::text              AS earliest_date,
        MAX(event_date)::text              AS latest_date
      FROM verified_hail_events_public_sane
      WHERE state IN ('VA','MD','DC','PA','WV','DE')
    `);
        const swath = await pool.query(`
      SELECT COUNT(*)::int AS swath_days,
             MIN(storm_date)::text AS earliest,
             MAX(storm_date)::text AS latest
      FROM mrms_swath_cache
    `);
        res.json({ by_year: rows, totals: totals.rows[0], swath_cache: swath.rows[0] });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// POST /api/hail/admin/vacuum-bloat
// One-shot reclaim: VACUUM (non-blocking) the big tables that have
// accumulated dead tuples from the backfill UPDATE storm, then REINDEX
// the two tables whose index sizes are orders of magnitude larger than
// their data (inspection_photos, property_images). Takes ~30-90s per
// table on the current 3GB DB.
router.post('/admin/vacuum-bloat', async (req, res) => {
    try {
        const pool = req.app.get('pool');
        const results = [];
        // VACUUM writes can't run inside a transaction block, so one statement at a time.
        const steps = [
            ['verified_hail_events', 'VACUUM (ANALYZE) verified_hail_events'],
            ['storm_days_public', 'REFRESH MATERIALIZED VIEW storm_days_public'],
            ['inspection_photos', 'VACUUM (FULL, ANALYZE) inspection_photos'],
            ['property_images', 'VACUUM (FULL, ANALYZE) property_images'],
            ['presentations', 'VACUUM (FULL, ANALYZE) presentations'],
            ['mrms_swath_cache', 'VACUUM (ANALYZE) mrms_swath_cache'],
        ];
        for (const [name, sql] of steps) {
            const t0 = Date.now();
            try {
                await pool.query(sql);
                results.push({ step: name, sql, status: 'ok', ms: Date.now() - t0 });
            }
            catch (e) {
                results.push({ step: name, sql, status: 'error', error: e.message, ms: Date.now() - t0 });
            }
        }
        // Report the DB size delta so we can see how much we recovered.
        const after = await pool.query(`SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size`);
        res.json({ ok: true, db_size_after: after.rows[0].db_size, steps: results });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// GET /api/hail/admin/db-size
// Emergency triage: what's eating Postgres disk? Returns db size + top
// tables by total_relation_size + index sizes + MV size. Called after the
// 95%-full Railway alert fired during the historical backfill.
router.get('/admin/db-size', async (req, res) => {
    try {
        const pool = req.app.get('pool');
        const [db, tables, activity] = await Promise.all([
            pool.query(`SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size,
                         pg_database_size(current_database())::bigint AS db_bytes`),
            pool.query(`
        SELECT
          n.nspname || '.' || c.relname AS "table",
          pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
          pg_size_pretty(pg_relation_size(c.oid))       AS data_size,
          pg_size_pretty(pg_total_relation_size(c.oid) - pg_relation_size(c.oid)) AS index_size,
          c.reltuples::bigint AS row_estimate
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('r','m')
          AND n.nspname NOT IN ('pg_catalog','information_schema')
        ORDER BY pg_total_relation_size(c.oid) DESC
        LIMIT 20
      `),
            pool.query(`SELECT COUNT(*)::int AS active_queries FROM pg_stat_activity WHERE state='active'`),
        ]);
        res.json({
            db_size: db.rows[0].db_size,
            db_bytes: Number(db.rows[0].db_bytes),
            top_tables: tables.rows,
            active_queries: activity.rows[0].active_queries,
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.get('/admin/ingest-stats', async (req, res) => {
    try {
        const pool = req.app.get('pool');
        const { rows } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE source_noaa_ncei)  AS noaa_ncei,
        COUNT(*) FILTER (WHERE source_iem_lsr)    AS iem_lsr,
        COUNT(*) FILTER (WHERE source_ncei_swdi)  AS ncei_swdi,
        COUNT(*) FILTER (WHERE source_mrms)       AS mrms,
        COUNT(*) FILTER (WHERE source_nws_alert)  AS nws_alert,
        COUNT(*) FILTER (WHERE source_cocorahs)   AS cocorahs,
        COUNT(*) FILTER (WHERE source_iem_vtec)   AS iem_vtec,
        COUNT(*) FILTER (WHERE source_mping)      AS mping,
        COUNT(*) FILTER (WHERE source_synoptic)   AS synoptic,
        COUNT(*) FILTER (WHERE source_spc_wcm)    AS spc_wcm,
        COUNT(*) FILTER (WHERE source_nexrad_l2)  AS nexrad_l2,
        COUNT(*) AS total
      FROM verified_hail_events_public_sane
      WHERE event_date >= (CURRENT_DATE - INTERVAL '24 months')
        AND state IN ('VA','MD','DC','PA','WV','DE')
        AND hail_size_inches >= 0.5
    `);
        res.json({ window: 'dmv_24mo_hail_gte_half_inch', counts: rows[0] });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// POST /api/hail/admin/noaa-historical-backfill
// Kick off a 2015–2022 historical backfill from NOAA NCEI Storm Events (CSV) and
// NCEI SWDI (radar-derived hail signatures) for the DMV + PA/WV/DE target states.
//
// Body: { yearFrom?: number, yearTo?: number, sources?: string[], dryRun?: boolean }
//   yearFrom  — first year to backfill (default 2015, min 2010)
//   yearTo    — last year to backfill  (default 2022, max current year - 1)
//   sources   — subset of ['noaa_ncei','ncei_swdi'] (default: both)
//   dryRun    — if true, count rows without writing (default false)
//
// Returns immediately with { ok, status: 'started', ... }. Watch server logs for
// per-year progress. A full 7-year dual-source run typically takes 30–90 minutes.
//
// MRMS swath backfill is intentionally excluded: MRMS resolution only reaches ~2016
// and a full swath backfill is a separate 40+ GB project. The NOAA NCEI CSV source
// already covers the same physical events at county/point level for the historical window.
//
// Auth: same open-but-internal pattern as the other /admin/* endpoints in this file.
router.post('/admin/noaa-historical-backfill', async (req, res) => {
    try {
        const ALLOWED_STATES = ['VA', 'MD', 'DC', 'PA', 'WV', 'DE'];
        const ALLOWED_SOURCES = ['noaa_ncei', 'ncei_swdi'];
        const currentYear = new Date().getFullYear();
        const rawYearFrom = Number(req.body?.yearFrom ?? 2015);
        const rawYearTo = Number(req.body?.yearTo ?? 2022);
        const dryRun = req.body?.dryRun === true;
        // Clamp year range to safe bounds
        const yearFrom = Math.max(2010, Math.min(rawYearFrom, currentYear - 1));
        const yearTo = Math.max(yearFrom, Math.min(rawYearTo, currentYear - 1));
        // Validate requested sources
        const requestedSources = Array.isArray(req.body?.sources)
            ? req.body.sources.filter((s) => ALLOWED_SOURCES.includes(s))
            : ALLOWED_SOURCES;
        if (requestedSources.length === 0) {
            return res.status(400).json({
                error: `sources must be a non-empty subset of [${ALLOWED_SOURCES.join(', ')}]`,
            });
        }
        const fromDate = `${yearFrom}-01-01`;
        const toDate = `${yearTo}-12-31`;
        const pool = req.app.get('pool');
        // Respond immediately — the backfill is fire-and-forget.
        // A 7-year dual-source run can take 30–90 minutes on NCEI's servers.
        res.json({
            ok: true,
            status: 'started',
            yearFrom,
            yearTo,
            fromDate,
            toDate,
            sources: requestedSources,
            states: ALLOWED_STATES,
            dryRun,
            note: 'Running in background — check server logs for per-year progress. MRMS swath backfill is excluded (separate 40 GB project; documented in server/services/backfill/mrmsBackfill.ts).',
        });
        // Lazy-import and register runners so the main server startup path is unaffected
        const { backfillOrchestrator, registerAllRunners } = await import('../services/backfillOrchestrator.js');
        await registerAllRunners();
        backfillOrchestrator
            .run(pool, {
            sources: requestedSources,
            states: ALLOWED_STATES,
            fromDate,
            toDate,
            dryRun,
            onProgress: (p) => {
                console.log(`[admin/noaa-historical-backfill] ${p.source} ${p.phase} window=${p.currentWindow ?? '-'} ` +
                    `in=${p.rowsInput} ins=${p.rowsInserted} upd=${p.rowsUpdated} err=${p.errors}`);
            },
        })
            .then((results) => {
            const summary = results.map((r) => ({
                source: r.source,
                inserted: r.rowsInserted,
                updated: r.rowsUpdated,
                errors: r.errors.length,
                durationSec: r.durationSec,
                success: r.success,
            }));
            console.log('[admin/noaa-historical-backfill] COMPLETE', JSON.stringify(summary));
        })
            .catch((err) => {
            console.error('[admin/noaa-historical-backfill] FATAL', err.message);
        });
    }
    catch (err) {
        console.error('[admin/noaa-historical-backfill] setup err:', err);
        res.status(500).json({ error: err.message });
    }
});
// GET /api/hail/admin/backfill-stats
// How many DMV storm days are missing from the swath cache? Quick metric.
router.get('/admin/backfill-stats', async (req, res) => {
    try {
        const pool = req.app.get('pool');
        // A day counts as "cached" only if a cache entry covers the full
        // 6-state footprint (north >= 42.3 for full PA, south <= 36.5 for
        // southern VA, east >= -74.5 offshore, west <= -82.5 into western WV).
        // Prior query just checked date presence, so entries cached at the
        // narrower pre-2026-04-24 bbox wrongly counted as 'done' for northern
        // PA queries.
        const { rows } = await pool.query(`
      WITH storm_days AS (
        SELECT DISTINCT event_date
        FROM verified_hail_events_public_sane
        WHERE event_date >= (CURRENT_DATE - INTERVAL '24 months')
          AND state IN ('VA','MD','DC','PA','WV','DE')
          AND hail_size_inches >= 1.0
      ),
      cached_days AS (
        SELECT DISTINCT storm_date AS event_date
        FROM mrms_swath_cache
        WHERE expires_at > NOW()
          AND north >= 42.3 AND south <= 36.5
          AND east  >= -74.5 AND west <= -82.5
      )
      SELECT
        (SELECT COUNT(*) FROM storm_days) AS total,
        (SELECT COUNT(*) FROM storm_days WHERE event_date IN (SELECT event_date FROM cached_days)) AS cached,
        (SELECT COUNT(*) FROM storm_days WHERE event_date NOT IN (SELECT event_date FROM cached_days)) AS missing
    `);
        res.json(rows[0]);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// POST /api/hail/admin/ihm-mirror-ingest
// Upsert an IHM crawl artifact into ihm_city_mirror.
//   If body is an artifact { crawled_at, completed_at, cities: [...] } → ingest it.
//   If body is empty → read the latest scripts/ihm-wayback/data/ihm-mirror-*.json
//     from local disk (useful for local dev; won't work in Railway unless the
//     file was deployed with the container).
// Run `node scripts/ihm-wayback/crawl.mjs` first to produce the artifact,
// then POST it up:
//   curl -X POST -H "Content-Type: application/json" \
//     --data-binary @scripts/ihm-wayback/data/ihm-mirror-LATEST.json \
//     https://sa21.up.railway.app/api/hail/admin/ihm-mirror-ingest
router.post('/admin/ihm-mirror-ingest', async (req, res) => {
    try {
        const { ingestArtifact, ingestLatestCrawl } = await import('../services/ihmMirrorIngestService.js');
        const r = req.body && Array.isArray(req.body.cities)
            ? await ingestArtifact(req.app.get('pool'), req.body)
            : await ingestLatestCrawl(req.app.get('pool'));
        res.json(r);
    }
    catch (err) {
        console.error('[admin/ihm-mirror-ingest] err:', err);
        res.status(500).json({ error: err.message });
    }
});
// POST /api/hail/admin/materialize-ihm-dates
// GUARANTEE: no rep can cite an IHM date we don't have. For every city in
// ihm_city_mirror, for every date where IHM reports confirmed hail, upsert
// a row into verified_hail_events tagged source_ihm=TRUE. Idempotent.
router.post('/admin/materialize-ihm-dates', async (req, res) => {
    try {
        const { materializeIhmDates } = await import('../services/ihmDateMaterializeService.js');
        const r = await materializeIhmDates(req.app.get('pool'));
        res.json(r);
    }
    catch (err) {
        console.error('[admin/materialize-ihm-dates] err:', err);
        res.status(500).json({ error: err.message });
    }
});
// POST /api/hail/admin/run-migration-079 — apply migration 079_ihm_city_mirror.sql
// Creates the ihm_city_mirror table + indexes. Idempotent (CREATE IF NOT EXISTS).
router.post('/admin/run-migration-079', async (req, res) => {
    try {
        const fs = await import('node:fs/promises');
        const path = await import('node:path');
        const { fileURLToPath } = await import('node:url');
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const sqlPath = path.resolve(__dirname, '../../database/migrations/079_ihm_city_mirror.sql');
        const sql = await fs.readFile(sqlPath, 'utf8');
        await (req.app.get('pool')).query(sql);
        res.json({ ok: true, migration: '079_ihm_city_mirror' });
    }
    catch (err) {
        console.error('[admin/run-migration-079] err:', err);
        res.status(500).json({ error: err.message });
    }
});
// GET /api/hail/ihm-coverage-summary
// Fleet-wide summary: across every DMV/PA/WV/DE city, how many confirmed-hail
// dates does IHM claim vs how many do we have in our DB? Answer the question
// "IHM has more" at scale, not per-city. Ranked by biggest gaps both ways.
// In-memory cache of the expensive fleet summary (15-min TTL). First call
// after deploy takes 30-60s, then cached until refresh. Callers can pass
// ?refresh=1 to force rebuild.
let _ihmSummaryCache = null;
const IHM_SUMMARY_TTL_MS = 15 * 60 * 1000;
router.get('/ihm-coverage-summary', async (req, res) => {
    try {
        const now = Date.now();
        const forceRefresh = req.query.refresh === '1';
        if (!forceRefresh && _ihmSummaryCache && now - _ihmSummaryCache.at < IHM_SUMMARY_TTL_MS) {
            return res.json({ ..._ihmSummaryCache.body, cached: true, cached_age_ms: now - _ihmSummaryCache.at });
        }
        const pool = req.app.get('pool');
        const ihmRows = (await pool.query(`
      SELECT
        city, state, lat, lng,
        doppler_lifetime AS ihm_lifetime,
        doppler_past_year AS ihm_past_year,
        unique_dates_count AS ihm_parsed_dates,
        (
          SELECT COUNT(*) FROM jsonb_array_elements(unique_dates) e
          WHERE (e->>'max_hail_inches')::numeric > 0
             OR (e->>'has_spotter')::boolean = true
        )::int AS ihm_confirmed_hail_dates,
        fetched_at
      FROM ihm_city_mirror
      WHERE status = 200 AND lat IS NOT NULL AND lng IS NOT NULL
      ORDER BY state, city
    `)).rows;
        // Per-city count via storm_days_public MV (1000x smaller than base table).
        // Distance calc via bbox pre-filter on (lat_bucket, lng_bucket) which the
        // storm_days_public_bucket_idx index can serve directly.
        const results = [];
        const MILES_PER_DEG_LAT = 69.0;
        const RADIUS_MI = 10;
        for (const r of ihmRows) {
            const lat = Number(r.lat);
            const lng = Number(r.lng);
            const dLat = RADIUS_MI / MILES_PER_DEG_LAT;
            const dLng = RADIUS_MI / (MILES_PER_DEG_LAT * Math.max(Math.cos((lat * Math.PI) / 180), 0.1));
            // Three thresholds so reps get an apples-to-apples comparison:
            //   any: any hail detected (>= 0.25" MRMS floor)
            //   adjuster: >= 0.5" (adjuster-tier, our QL threshold)
            //   ihm: >= 1.0" ("severe", matches what IHM appears to count for
            //        "Doppler detected hail at or near X" — they seem to filter
            //        to quarter-size and up based on sample data)
            const { rows: countRows } = await pool.query(`
        SELECT
          COUNT(DISTINCT event_date) FILTER (WHERE max_hail > 0)::int       AS any_hail,
          COUNT(DISTINCT event_date) FILTER (WHERE max_hail >= 0.5)::int    AS adjuster_tier,
          COUNT(DISTINCT event_date) FILTER (WHERE max_hail >= 1.0)::int    AS severe
          FROM storm_days_public
         WHERE lat_bucket BETWEEN $1 AND $2
           AND lng_bucket BETWEEN $3 AND $4
           AND max_hail IS NOT NULL
      `, [lat - dLat, lat + dLat, lng - dLng, lng + dLng]);
            const c = countRows[0] || {};
            results.push({
                ...r,
                ours_dates_10mi: Number(c.any_hail) || 0,
                ours_dates_10mi_adjuster: Number(c.adjuster_tier) || 0,
                ours_dates_10mi_severe: Number(c.severe) || 0,
            });
        }
        const rows = results;
        // Build fleet totals + per-state breakdown. "ours" = severe-tier (>=1")
        // because that's what IHM appears to count, making it the fair comparison.
        let fleetIhm = 0, fleetOurs = 0, fleetOursAll = 0;
        let citiesWithOursAdvantage = 0, citiesWithIhmAdvantage = 0;
        const byState = {};
        for (const r of rows) {
            const ihm = Number(r.ihm_confirmed_hail_dates) || 0;
            const oursSevere = Number(r.ours_dates_10mi_severe) || 0;
            const oursAny = Number(r.ours_dates_10mi) || 0;
            fleetIhm += ihm;
            fleetOurs += oursSevere;
            fleetOursAll += oursAny;
            if (oursSevere > ihm)
                citiesWithOursAdvantage++;
            else if (ihm > oursSevere)
                citiesWithIhmAdvantage++;
            const s = (byState[r.state] ??= { cities: 0, ihm: 0, ours_severe: 0, ours_any: 0 });
            s.cities++;
            s.ihm += ihm;
            s.ours_severe += oursSevere;
            s.ours_any += oursAny;
        }
        const body = {
            fleet: {
                cities_with_ihm_mirror: rows.length,
                ihm_confirmed_hail_dates_total: fleetIhm,
                our_severe_dates_total: fleetOurs, // >= 1"
                our_any_hail_dates_total: fleetOursAll, // >= MRMS floor
                cities_where_we_have_more: citiesWithOursAdvantage,
                cities_where_ihm_has_more: citiesWithIhmAdvantage,
                cities_tied: rows.length - citiesWithOursAdvantage - citiesWithIhmAdvantage,
                comparison_basis: 'severe-tier (>=1") vs IHM confirmed-hail — apples-to-apples',
            },
            by_state: byState,
            cities: rows,
            built_in_ms: Date.now() - now,
        };
        _ihmSummaryCache = { at: now, body };
        res.json({ ...body, cached: false });
    }
    catch (err) {
        console.error('[ihm-coverage-summary] err:', err);
        res.status(500).json({ error: err.message });
    }
});
// GET /api/hail/ihm-vs-ours?city=Fairfax&state=VA&radiusMiles=10
// Per-city diff of IHM's public hail-date log vs our verified_hail_events.
// Returns { ihm_dates, ours_dates, verdict_counts: {MATCH, IHM_ONLY, OURS_ONLY,
// SIZE_MISMATCH}, rows: [...] }. The key question this answers for a rep:
// "when you say IHM shows more dates for Fairfax than we do — which ones, and
// are they real?"
router.get('/ihm-vs-ours', async (req, res) => {
    try {
        const city = String(req.query.city ?? '').trim();
        const state = String(req.query.state ?? '').trim().toUpperCase();
        const radiusMiles = Math.min(Math.max(Number(req.query.radiusMiles ?? 10), 1), 30);
        if (!city || !/^[A-Z]{2}$/.test(state)) {
            return res.status(400).json({ error: 'city and state (2-letter) required' });
        }
        const { diffCityAgainstOurs } = await import('../services/ihmMirrorIngestService.js');
        const diff = await diffCityAgainstOurs(req.app.get('pool'), city, state, radiusMiles);
        if (!diff)
            return res.status(404).json({ error: `no IHM mirror for ${city}, ${state} — run the crawler first` });
        res.json(diff);
    }
    catch (err) {
        console.error('[ihm-vs-ours] err:', err);
        res.status(500).json({ error: err.message });
    }
});
// GET /api/hail/address-impact?lat=X&lng=Y&months=24
// Unified swath-first tiered impact for a single address. Use this instead
// of the legacy /search endpoint when you need Direct Hit / Near Miss /
// Area Impact classification. Shipped 2026-04-23 after Cub Stream Dr
// "1.7 miles away" bug — the property was actually in a swath band.
console.log('[hailRoutes] registering GET /address-impact (swath-first tiered lookup)');
// POST /api/hail/verify-date — "Rep brings me a HailTrace date we don't have"
// Takes an address (lat/lng) + a specific date, returns authoritative answer
// from every source we've got. If the swath isn't cached for that date, this
// triggers an on-demand cache fill (30-60s). Designed for the rep-in-the-field
// case: "HailTrace says 5/20/24 at 1234 Oak Ln — can we confirm?"
router.post('/verify-date', async (req, res) => {
    try {
        const { lat, lng, date } = req.body || {};
        const latNum = Number(lat);
        const lngNum = Number(lng);
        if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
            return res.status(400).json({ error: 'lat and lng required' });
        }
        if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({ error: 'date required (YYYY-MM-DD)' });
        }
        const pool = req.app.get('pool');
        // 1. Check the swath: is the property inside the MRMS polygon for that date?
        //    This triggers an on-demand cache fill if missing.
        let swathHit = {
            directHit: false, maxInches: null, label: null,
        };
        try {
            const { computeStormImpact } = await import('../services/stormImpactService.js');
            const impact = await computeStormImpact({ date, points: [{ id: 'addr', lat: latNum, lng: lngNum }] }, pool);
            const r = impact.results[0];
            if (r && r.directHit) {
                swathHit = {
                    directHit: true,
                    maxInches: r.maxHailInches ?? null,
                    label: r.label ?? null,
                };
            }
        }
        catch (err) {
            console.warn(`[verify-date] swath check failed for ${date}: ${err.message}`);
        }
        // 2. Point reports within 15mi on that date — gives confirming evidence
        //    regardless of swath membership.
        const { rows: points } = await pool.query(`SELECT state, hail_size_inches, wind_mph,
              source_noaa_ncei, source_mrms, source_ncei_swdi, source_iem_lsr,
              source_cocorahs, source_nws_alert, source_iem_vtec, source_mping,
              source_synoptic, source_spc_wcm,
              (3959 * acos(cos(radians($1)) * cos(radians(latitude)) *
                 cos(radians(longitude) - radians($2)) +
                 sin(radians($1)) * sin(radians(latitude)))) AS distance_miles
       FROM verified_hail_events_public_sane
       WHERE event_date = $3::date
         AND (3959 * acos(cos(radians($1)) * cos(radians(latitude)) *
               cos(radians(longitude) - radians($2)) +
               sin(radians($1)) * sin(radians(latitude)))) <= 15
         AND (hail_size_inches IS NOT NULL OR wind_mph IS NOT NULL)
       ORDER BY hail_size_inches DESC NULLS LAST, distance_miles ASC
       LIMIT 30`, [latNum, lngNum, date]);
        const maxPointHail = points.reduce((m, r) => Math.max(m, Number(r.hail_size_inches || 0)), 0);
        // `points` is sorted by hail-size DESC (so the biggest hail bubbles up first);
        // closest-distance is a separate reduction — points[0] is the biggest, not
        // the nearest. Prior to this fix, verify-date reported "4.7mi" when a 0.75"
        // report sat 1.56mi away, wrongly bucketing Silverstone-Dr 5/30/25 as
        // AREA IMPACT instead of AT LOCATION.
        const closestMi = points.length > 0
            ? points.reduce((m, r) => {
                const d = Number(r.distance_miles);
                return Number.isFinite(d) && d < m ? d : m;
            }, Infinity)
            : null;
        const safeClosestMi = closestMi === Infinity ? null : closestMi;
        const sourceSet = new Set();
        for (const r of points) {
            if (r.source_noaa_ncei)
                sourceSet.add('NOAA NCEI');
            if (r.source_mrms)
                sourceSet.add('MRMS');
            if (r.source_ncei_swdi)
                sourceSet.add('NCEI SWDI');
            if (r.source_iem_lsr)
                sourceSet.add('IEM LSR');
            if (r.source_cocorahs)
                sourceSet.add('CoCoRaHS');
            if (r.source_nws_alert)
                sourceSet.add('NWS Alert');
            if (r.source_iem_vtec)
                sourceSet.add('IEM VTEC');
            if (r.source_mping)
                sourceSet.add('mPING');
            if (r.source_synoptic)
                sourceSet.add('Synoptic');
            if (r.source_spc_wcm)
                sourceSet.add('SPC WCM');
        }
        if (swathHit.directHit)
            sourceSet.add('MRMS Swath');
        const sources = [...sourceSet].sort();
        // 3. Build a rep-facing narrative
        let verdict;
        let confidence;
        if (swathHit.directHit) {
            verdict = `DIRECT HIT — property sits inside MRMS swath on ${date}, band ${swathHit.label || swathHit.maxInches + '"'}${points.length > 0 ? ` (${points.length} corroborating report${points.length === 1 ? '' : 's'} within 15mi)` : ''}.`;
            confidence = 'high';
        }
        else if (safeClosestMi !== null && safeClosestMi <= 3 && maxPointHail >= 0.75) {
            verdict = `AT LOCATION — not in swath polygon, but verified ${maxPointHail}" hail just ${safeClosestMi.toFixed(1)}mi from the property on ${date}.`;
            confidence = 'medium';
        }
        else if (points.length > 0) {
            verdict = `AREA IMPACT — ${points.length} verified report(s) within 15mi on ${date}, closest is ${safeClosestMi?.toFixed(1)}mi at ${maxPointHail}".`;
            confidence = 'low';
        }
        else {
            verdict = `Nothing verified for ${date} within 15mi of this property in any of our sources. If HailTrace/Hail Recon show a hit, they may be using proprietary radar processing we don't ingest yet.`;
            confidence = 'none';
        }
        res.json({
            date,
            lat: latNum,
            lng: lngNum,
            verdict,
            confidence,
            swathHit,
            pointReportCount: points.length,
            closestDistanceMi: safeClosestMi,
            maxHailInches: Math.max(maxPointHail, swathHit.maxInches || 0) || null,
            sources,
            topPointReports: points.slice(0, 5).map((r) => ({
                distanceMi: Number(r.distance_miles).toFixed(1),
                hail: r.hail_size_inches,
                wind: r.wind_mph,
                state: r.state,
            })),
        });
    }
    catch (err) {
        console.error('[verify-date] err:', err);
        res.status(500).json({ error: err.message });
    }
});
router.get('/address-impact', async (req, res) => {
    try {
        const lat = Number(req.query.lat);
        const lng = Number(req.query.lng);
        const months = Number(req.query.months ?? 24);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return res.status(400).json({ error: 'lat and lng query params required' });
        }
        if (!Number.isFinite(months) || months <= 0 || months > 60) {
            return res.status(400).json({ error: 'months must be 1-60' });
        }
        const { getAddressHailImpact } = await import('../services/addressImpactService.js');
        const report = await getAddressHailImpact(req.app.get('pool'), lat, lng, months);
        res.setHeader('Cache-Control', 'private, max-age=30');
        res.json(report);
    }
    catch (error) {
        console.error('address-impact error:', error);
        res.status(500).json({ error: error.message });
    }
});
// POST /api/hail/storm-impact — Point-in-polygon against MRMS vector swaths
// Body: { date: "YYYY-MM-DD", anchorTimestamp?: string, points: [{id, lat, lng}] }
// Returns max hail size per point; the answer to "was this address in the storm?"
router.post('/storm-impact', async (req, res) => {
    try {
        const { date, anchorTimestamp, points } = req.body || {};
        if (!date || !Array.isArray(points)) {
            return res.status(400).json({
                error: 'date (YYYY-MM-DD) and points array are required',
            });
        }
        if (points.length === 0) {
            return res.status(400).json({ error: 'points array must not be empty' });
        }
        if (points.length > 5000) {
            return res.status(400).json({ error: 'maximum 5000 points per request' });
        }
        const normalizedPoints = [];
        for (const raw of points) {
            const id = String(raw?.id ?? '').trim();
            const lat = Number(raw?.lat);
            const lng = Number(raw?.lng);
            if (!id || !Number.isFinite(lat) || !Number.isFinite(lng)) {
                return res.status(400).json({
                    error: `invalid point: ${JSON.stringify(raw)} — each point needs id, lat, lng`,
                });
            }
            normalizedPoints.push({ id, lat, lng });
        }
        const result = await computeStormImpact({
            date: String(date),
            anchorTimestamp: anchorTimestamp ? String(anchorTimestamp) : null,
            points: normalizedPoints,
        }, req.app.get('pool'));
        res.setHeader('Cache-Control', 'private, max-age=60');
        res.json(result);
    }
    catch (error) {
        console.error('Storm impact error:', error);
        res.status(500).json({ error: error.message });
    }
});
// GET /api/hail/rep-storm-impact — Same as /storm-impact but auto-loads the logged-in
// rep's customer_properties. The "who got hit in my book?" endpoint.
// Headers: x-user-email
// Query: date=YYYY-MM-DD&anchorTimestamp=...
router.get('/rep-storm-impact', async (req, res) => {
    try {
        const email = req.header('x-user-email');
        if (!email)
            return res.status(401).json({ error: 'Not authenticated' });
        const { date, anchorTimestamp, minHailInches } = req.query;
        if (!date) {
            return res.status(400).json({ error: 'date (YYYY-MM-DD) is required' });
        }
        const pool = req.app.get('pool');
        // Look up the rep's user_id + their active customer_properties.
        // NOTE: return an empty-but-valid result (not 404) when the email isn't
        // in `users` yet — new reps, SSO identity mismatches, or reps registered
        // only in `employee_profiles` would otherwise see "Couldn't load property
        // impact: Server returned 404" on the map. Empty result → "No homes for
        // this storm" which is the correct UX.
        const { rows: userRows } = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1', [email]);
        if (!userRows.length) {
            return res.json({
                date: String(date),
                anchorTimestamp: anchorTimestamp ? String(anchorTimestamp) : null,
                metadata: {
                    stormMaxInches: 0,
                    stormHailCells: 0,
                    stormFeatureCount: 0,
                    pointsChecked: 0,
                    directHits: 0,
                },
                properties: [],
                byBand: [],
                note: `No customer properties yet for ${email} — add homes in the Homes tab to see storm impact here.`,
            });
        }
        const userId = userRows[0].id;
        const { rows: propertyRows } = await pool.query(`SELECT id, customer_name, address, city, state, zip_code,
              latitude, longitude, customer_phone, customer_email,
              notify_threshold_hail_size, do_not_contact, last_service_date
         FROM customer_properties
         WHERE user_id = $1
           AND is_active = TRUE
           AND latitude IS NOT NULL
           AND longitude IS NOT NULL`, [userId]);
        if (propertyRows.length === 0) {
            return res.json({
                date: String(date),
                anchorTimestamp: anchorTimestamp ? String(anchorTimestamp) : null,
                metadata: {
                    stormMaxInches: 0,
                    stormHailCells: 0,
                    stormFeatureCount: 0,
                    pointsChecked: 0,
                    directHits: 0,
                },
                properties: [],
                byBand: [],
            });
        }
        const impactResult = await computeStormImpact({
            date: String(date),
            anchorTimestamp: anchorTimestamp ? String(anchorTimestamp) : null,
            points: propertyRows.map((p) => ({
                id: String(p.id),
                lat: Number(p.latitude),
                lng: Number(p.longitude),
            })),
        }, pool);
        const impactById = new Map(impactResult.results.map((r) => [r.id, r]));
        const minThreshold = minHailInches ? Number(minHailInches) : 0;
        // Merge property data with impact results.
        const enriched = propertyRows
            .map((prop) => {
            const impact = impactById.get(String(prop.id));
            return {
                id: prop.id,
                customerName: prop.customer_name,
                address: prop.address,
                city: prop.city,
                state: prop.state,
                zipCode: prop.zip_code,
                lat: Number(prop.latitude),
                lng: Number(prop.longitude),
                phone: prop.customer_phone,
                email: prop.customer_email,
                notifyThresholdHailSize: Number(prop.notify_threshold_hail_size || 0),
                doNotContact: Boolean(prop.do_not_contact),
                lastServiceDate: prop.last_service_date,
                maxHailInches: impact?.maxHailInches ?? null,
                hailLabel: impact?.label ?? null,
                hailColor: impact?.color ?? null,
                hailSeverity: impact?.severity ?? null,
                level: impact?.level ?? null,
                directHit: impact?.directHit ?? false,
                // Flag if the hail at this property crosses the rep's personal notify threshold
                // (reps set per-property thresholds for notifications, default 1.0")
                crossesNotifyThreshold: (impact?.maxHailInches ?? 0) >= Number(prop.notify_threshold_hail_size || 0),
            };
        })
            .filter((p) => (p.maxHailInches ?? 0) >= minThreshold)
            .sort((a, b) => (b.maxHailInches ?? 0) - (a.maxHailInches ?? 0));
        // Aggregate counts per band for quick summary UI.
        const byBandMap = new Map();
        for (const p of enriched) {
            if (p.maxHailInches === null || p.level === null)
                continue;
            const key = p.level;
            const existing = byBandMap.get(key);
            if (existing) {
                existing.count += 1;
            }
            else {
                byBandMap.set(key, {
                    sizeInches: p.maxHailInches,
                    label: p.hailLabel || '',
                    color: p.hailColor || '',
                    count: 1,
                });
            }
        }
        const byBand = [...byBandMap.values()].sort((a, b) => b.sizeInches - a.sizeInches);
        res.setHeader('Cache-Control', 'private, max-age=60');
        res.json({
            date: impactResult.date,
            anchorTimestamp: impactResult.anchorTimestamp,
            metadata: impactResult.metadata,
            properties: enriched,
            byBand,
        });
    }
    catch (error) {
        console.error('Rep storm impact error:', error);
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
// ─── Shared helpers for storm-days endpoints ─────────────────────────────────
const toRad = (d) => (d * Math.PI) / 180;
const haversineMiles = (aLat, aLng, bLat, bLng) => {
    const R = 3958.8;
    const dLat = toRad(bLat - aLat);
    const dLng = toRad(bLng - aLng);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
};
/**
 * Build a lat/lng bounding box in degrees given a centre and radius in miles.
 * Returns { degPad, lonDegPad } — add/subtract from centre to get bbox corners.
 */
function bboxDegPad(lat, radiusMiles) {
    const degPad = (radiusMiles / 69) * 1.05; // 5% margin
    const lonDegPad = degPad / Math.max(0.15, Math.cos(toRad(lat)));
    return { degPad, lonDegPad };
}
/**
 * Build the human-readable source labels array from a storm_days_public row.
 */
function buildSourceLabels(row) {
    const labels = [];
    if (row.has_noaa)
        labels.push('NOAA NCEI');
    if (row.has_mrms)
        labels.push('MRMS');
    if (row.has_nexrad_l2)
        labels.push('NEXRAD L2');
    if (row.has_ihm)
        labels.push('IHM');
    if (row.has_cocorahs)
        labels.push('CoCoRaHS');
    if (row.has_iem_lsr)
        labels.push('NWS LSR');
    if (row.has_nws_alert)
        labels.push('NWS Warning');
    return labels;
}
// ─── GET /api/hail/storm-days ────────────────────────────────────────────────
// Returns aggregate storm-day rows from the storm_days_public materialized view.
// Query params:
//   lat      (required) — search centre latitude
//   lng      (required) — search centre longitude
//   radius   (optional, default 25) — radius in miles
//   months   (optional, default 24) — history window in months
//   state    (optional) — restrict to a single US state abbreviation
//
// Response shape (under 100 KB for 10 years × 25 mi DMV):
//   {
//     storm_days: [{ date, state, max_hail, max_wind, report_count, sources, has_direct_hit }],
//     count: N,
//     truncated: boolean
//   }
//
// has_direct_hit is always false in v1. A future patch will add a single
// batch lookup against mrms_swath_cache to set it per day.
//
// Hard cap: 10 000 rows (day-level aggregation never hits this even for 10
// years across the full DMV region).
router.get('/storm-days', async (req, res) => {
    try {
        const lat = Number(req.query.lat);
        const lng = Number(req.query.lng);
        const radiusMiles = Number(req.query.radius ?? 25);
        const months = Number(req.query.months ?? 24);
        const stateFilter = typeof req.query.state === 'string' ? req.query.state.toUpperCase() : null;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return res.status(400).json({ error: 'lat and lng are required numeric parameters' });
        }
        if (radiusMiles <= 0 || radiusMiles > 500) {
            return res.status(400).json({ error: 'radius must be between 1 and 500 miles' });
        }
        if (months <= 0 || months > 600) {
            return res.status(400).json({ error: 'months must be between 1 and 600 (50 years)' });
        }
        const HARD_CAP = 10_000;
        const pool = req.app.get('pool');
        const { degPad, lonDegPad } = bboxDegPad(lat, radiusMiles);
        // lat_bucket/lng_bucket in verified_hail_events are DECIMAL(6,3) columns
        // generated as ROUND(latitude, 3) — i.e. raw degrees to 3 decimal places,
        // NOT integer-scaled (×10 or ×100). They collapse to the same value for
        // events at the same ~111m × 77m cell which is exactly the dedup grain.
        // Bbox filter is therefore the raw degree range, padded by the request
        // radius in degrees (+1 decimal cell on each side for safety).
        const bucketCell = 0.001; // one decimal place at 3-digit precision
        const latBucketMin = lat - degPad - bucketCell;
        const latBucketMax = lat + degPad + bucketCell;
        const lngBucketMin = lng - lonDegPad - bucketCell;
        const lngBucketMax = lng + lonDegPad + bucketCell;
        const sinceDate = new Date();
        sinceDate.setMonth(sinceDate.getMonth() - months);
        const sinceDateStr = sinceDate.toISOString().slice(0, 10);
        const params = [
            sinceDateStr,
            latBucketMin,
            latBucketMax,
            lngBucketMin,
            lngBucketMax,
        ];
        let stateClause = '';
        if (stateFilter) {
            params.push(stateFilter);
            stateClause = `AND state = $${params.length}`;
        }
        const { rows } = await pool.query(`SELECT
         TO_CHAR(event_date, 'YYYY-MM-DD') AS date,
         state,
         lat_bucket,
         lng_bucket,
         report_count,
         max_hail,
         max_wind,
         has_noaa,
         has_mrms,
         has_nexrad_l2,
         has_ihm,
         has_cocorahs,
         has_iem_lsr,
         has_nws_alert,
         total_verifications
       FROM storm_days_public
       WHERE event_date >= $1::date
         AND lat_bucket BETWEEN $2 AND $3
         AND lng_bucket BETWEEN $4 AND $5
         ${stateClause}
       ORDER BY event_date DESC
       LIMIT ${HARD_CAP + 1}`, params);
        // App-layer haversine filter: lat_bucket/lng_bucket are already raw degrees
        // (rounded to 3 decimal places in the ingest pipeline). Use them directly
        // as the centre of each cell and keep rows within the requested radius.
        const filtered = rows.filter((r) => {
            const bucketLat = Number(r.lat_bucket);
            const bucketLng = Number(r.lng_bucket);
            if (!Number.isFinite(bucketLat) || !Number.isFinite(bucketLng))
                return false;
            return haversineMiles(lat, lng, bucketLat, bucketLng) <= radiusMiles;
        });
        const truncated = filtered.length > HARD_CAP;
        const output = (truncated ? filtered.slice(0, HARD_CAP) : filtered).map((r) => ({
            date: r.date,
            state: r.state,
            max_hail: r.max_hail != null ? Number(r.max_hail) : null,
            max_wind: r.max_wind != null ? Number(r.max_wind) : null,
            report_count: Number(r.report_count),
            sources: buildSourceLabels(r),
            // v1: has_direct_hit is not computed here to keep the endpoint fast.
            // A future patch will batch-query mrms_swath_cache for the returned dates
            // and set this flag per day before responding.
            has_direct_hit: false,
        }));
        return res.json({ storm_days: output, count: output.length, truncated });
    }
    catch (error) {
        console.error('[storm-days] Error:', error);
        return res.status(500).json({ error: error.message });
    }
});
// ─── GET /api/hail/storm-day-events ──────────────────────────────────────────
// Returns raw verified_hail_events_public_sane rows for a single storm day.
// Called when the user clicks a day in the storm-days calendar UI.
// Query params:
//   date     (required) — YYYY-MM-DD
//   lat      (required) — search centre latitude
//   lng      (required) — search centre longitude
//   radius   (optional, default 25) — radius in miles
//
// Response shape matches the noaaEvents array shape used by /api/hail/search
// so the front-end can reuse the same renderer.
router.get('/storm-day-events', async (req, res) => {
    try {
        const dateParam = String(req.query.date ?? '').trim();
        const lat = Number(req.query.lat);
        const lng = Number(req.query.lng);
        const radiusMiles = Number(req.query.radius ?? 25);
        if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
            return res.status(400).json({ error: 'date is required and must be YYYY-MM-DD' });
        }
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return res.status(400).json({ error: 'lat and lng are required numeric parameters' });
        }
        const pool = req.app.get('pool');
        const { degPad, lonDegPad } = bboxDegPad(lat, radiusMiles);
        const { rows } = await pool.query(`SELECT
         id,
         TO_CHAR(event_date, 'YYYY-MM-DD') AS date_str,
         latitude, longitude, state,
         hail_size_inches, wind_mph, tornado_ef_rank,
         public_verification_count,
         source_noaa_ncei, source_iem_lsr, source_ncei_swdi, source_mrms,
         source_nws_alert, source_iem_vtec, source_cocorahs, source_spc_wcm,
         source_hailtrace, source_ihm, source_rep_report,
         source_details
       FROM verified_hail_events_public_sane
       WHERE event_date = $1::date
         AND latitude  BETWEEN $2 AND $3
         AND longitude BETWEEN $4 AND $5
       ORDER BY hail_size_inches DESC NULLS LAST, wind_mph DESC NULLS LAST
       LIMIT 2000`, [
            dateParam,
            lat - degPad,
            lat + degPad,
            lng - lonDegPad,
            lng + lonDegPad,
        ]);
        // App-layer haversine filter (same pattern as /search)
        const events = [];
        for (const r of rows) {
            const eLat = Number(r.latitude);
            const eLng = Number(r.longitude);
            if (haversineMiles(lat, lng, eLat, eLng) > radiusMiles)
                continue;
            const hail = r.hail_size_inches != null ? Number(r.hail_size_inches) : null;
            const wind = r.wind_mph != null ? Number(r.wind_mph) : null;
            const srcLabels = [];
            if (r.source_noaa_ncei)
                srcLabels.push('NOAA');
            if (r.source_spc_wcm)
                srcLabels.push('SPC');
            if (r.source_iem_lsr)
                srcLabels.push('NWS LSR');
            if (r.source_ncei_swdi)
                srcLabels.push('NEXRAD');
            if (r.source_mrms)
                srcLabels.push('MRMS');
            if (r.source_cocorahs)
                srcLabels.push('CoCoRaHS');
            if (r.source_nws_alert || r.source_iem_vtec)
                srcLabels.push('NWS Warning');
            if (r.source_hailtrace)
                srcLabels.push('HailTrace');
            if (r.source_ihm)
                srcLabels.push('IHM');
            if (r.source_rep_report)
                srcLabels.push('Rep Report');
            const primarySource = srcLabels[0] || 'Verified Event';
            const dist = haversineMiles(lat, lng, eLat, eLng);
            if (hail && hail > 0) {
                events.push({
                    id: `verified-${r.id}-h`,
                    eventType: 'Hail',
                    date: r.date_str,
                    latitude: eLat,
                    longitude: eLng,
                    magnitude: hail,
                    state: r.state || '',
                    county: '',
                    location: primarySource,
                    narrative: `${hail}" hail verified by ${srcLabels.join(', ') || 'multi-source'} at ${eLat.toFixed(4)}, ${eLng.toFixed(4)} — ${dist.toFixed(1)}mi from search.`,
                    source: primarySource,
                    distanceMiles: dist,
                    verificationCount: Number(r.public_verification_count) || 1,
                });
            }
            if (wind && wind > 0) {
                events.push({
                    id: `verified-${r.id}-w`,
                    eventType: 'Thunderstorm Wind',
                    date: r.date_str,
                    latitude: eLat,
                    longitude: eLng,
                    magnitude: wind,
                    state: r.state || '',
                    county: '',
                    location: primarySource,
                    narrative: `${wind} mph wind verified by ${srcLabels.join(', ') || 'multi-source'} at ${eLat.toFixed(4)}, ${eLng.toFixed(4)} — ${dist.toFixed(1)}mi from search.`,
                    source: primarySource,
                    distanceMiles: dist,
                    verificationCount: Number(r.public_verification_count) || 1,
                });
            }
        }
        return res.json({ date: dateParam, events, count: events.length });
    }
    catch (error) {
        console.error('[storm-day-events] Error:', error);
        return res.status(500).json({ error: error.message });
    }
});
export default router;
