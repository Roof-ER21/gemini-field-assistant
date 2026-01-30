import { Router, Request, Response } from 'express';
import { hailMapsService } from '../services/hailMapsService.js';
import type { Pool } from 'pg';

const router = Router();

/**
 * Multi-provider geocoding - Census Bureau + Nominatim fallback
 */
const geocodeForHailSearch = async (params: { address?: string; city?: string; state?: string; zip?: string }) => {
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
    } catch (e) {
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
  } catch (e) {
    console.error('Nominatim geocoding error:', e);
  }

  return null;
};

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
    const { street, city, state, zip } = req.body as { street?: string; city?: string; state?: string; zip?: string };
    if (!street || !city || !state || !zip) {
      return res.status(400).json({ error: 'street, city, state, and zip are required' });
    }
    if (!hailMapsService.isConfigured()) {
      return res.status(503).json({ error: 'Hail maps service not configured' });
    }

    const result = await hailMapsService.createAddressMonitor({ street, city, state, zip });
    res.json(result);
  } catch (error) {
    console.error('❌ Hail monitor error:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// GET /api/hail/search?address=...&months=24 OR lat/lng
router.get('/search', async (req, res) => {
  try {
    if (!hailMapsService.isConfigured()) {
      return res.status(503).json({ error: 'Hail maps service not configured' });
    }

    const { address, lat, lng, months = '24', radius = '0', marker_id, street, city, state, zip } = req.query;
    const monthsNum = parseInt(months as string, 10);
    const radiusNum = parseFloat(radius as string);

    if (marker_id) {
      const data = await hailMapsService.searchByMarkerId(marker_id as string, monthsNum);
      return res.json(data);
    }

    if (street || city || state || zip) {
      if (!street || !city || !state || !zip) {
        return res.status(400).json({ error: 'street, city, state, and zip are required' });
      }
      const data = await hailMapsService.searchByAddress(
        {
          street: String(street),
          city: String(city),
          state: String(state),
          zip: String(zip)
        },
        monthsNum
      );
      return res.json(data);
    }

    if (lat && lng) {
      const data = await hailMapsService.searchByCoordinates(
        parseFloat(lat as string),
        parseFloat(lng as string),
        monthsNum,
        radiusNum
      );
      return res.json(data);
    }

    if (address) {
      return res.status(400).json({ error: 'Use street, city, state, and zip for address search' });
    }

    return res.status(400).json({ error: 'Provide street/city/state/zip, marker_id, or lat/lng' });
  } catch (error) {
    console.error('❌ Hail search error:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /api/hail/search-advanced - Advanced search with multiple criteria
router.post('/search-advanced', async (req: Request, res: Response) => {
  try {
    if (!hailMapsService.isConfigured()) {
      return res.status(503).json({ error: 'Hail maps service not configured' });
    }

    const {
      address,
      city,
      state,
      zip,
      latitude,
      longitude,
      startDate,
      endDate,
      minHailSize,
      radius = 50
    } = req.body;

    let lat = latitude;
    let lng = longitude;

    // Calculate months from date range or use default
    let months = 24;
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      months = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30));
    }

    // If we have city, state, and zip - use address search
    if (city && state && zip) {
      const data = await hailMapsService.searchByAddress(
        {
          street: address || '',
          city,
          state,
          zip
        },
        months
      );

      // Filter by hail size if specified
      let filteredEvents = data.events || [];
      if (minHailSize) {
        filteredEvents = filteredEvents.filter(
          (event: any) => event.hailSize && event.hailSize >= minHailSize
        );
      }

      return res.json({
        ...data,
        events: filteredEvents,
        resultsCount: filteredEvents.length,
        searchCriteria: {
          address,
          city,
          state,
          zip,
          latitude: data.searchArea.center.lat,
          longitude: data.searchArea.center.lng,
          startDate,
          endDate,
          minHailSize,
          radius
        }
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
      const data = await hailMapsService.searchByCoordinates(
        parseFloat(lat),
        parseFloat(lng),
        months,
        parseFloat(radius as any)
      );

      let filteredEvents = data.events || [];
      if (minHailSize) {
        filteredEvents = filteredEvents.filter(
          (event: any) => event.hailSize && event.hailSize >= minHailSize
        );
      }

      return res.json({
        ...data,
        events: filteredEvents,
        resultsCount: filteredEvents.length,
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
        }
      });
    }

    return res.status(400).json({ error: 'Provide city and state (optionally address), ZIP code, or coordinates' });
  } catch (error) {
    console.error('❌ Advanced hail search error:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /api/hail/reports - Save a search as a report
router.post('/reports', async (req: Request, res: Response) => {
  try {
    const pool: Pool = req.app.get('pool');
    const { userId, name, searchCriteria, resultsCount, ihmEventsCount, noaaEventsCount, maxHailSize, avgHailSize } = req.body;

    if (!userId || !name || !searchCriteria) {
      return res.status(400).json({ error: 'userId, name, and searchCriteria are required' });
    }

    const result = await pool.query(
      `INSERT INTO hail_reports (
        user_id, name, search_criteria, results_count,
        ihm_events_count, noaa_events_count, max_hail_size, avg_hail_size
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        userId,
        name,
        JSON.stringify(searchCriteria),
        resultsCount || 0,
        ihmEventsCount || 0,
        noaaEventsCount || 0,
        maxHailSize || null,
        avgHailSize || null
      ]
    );

    res.json({ success: true, report: result.rows[0] });
  } catch (error) {
    console.error('❌ Save hail report error:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// GET /api/hail/reports?userId=xxx - Get user's saved reports
router.get('/reports', async (req: Request, res: Response) => {
  try {
    const pool: Pool = req.app.get('pool');
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const result = await pool.query(
      `SELECT * FROM hail_reports
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    res.json({ reports: result.rows });
  } catch (error) {
    console.error('❌ Get hail reports error:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// DELETE /api/hail/reports/:id - Delete a saved report
router.delete('/reports/:id', async (req: Request, res: Response) => {
  try {
    const pool: Pool = req.app.get('pool');
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM hail_reports WHERE id = $1 RETURNING id`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    res.json({ success: true, deletedId: result.rows[0].id });
  } catch (error) {
    console.error('❌ Delete hail report error:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// PUT /api/hail/reports/:id/access - Update last accessed time
router.put('/reports/:id/access', async (req: Request, res: Response) => {
  try {
    const pool: Pool = req.app.get('pool');
    const { id } = req.params;

    await pool.query(
      `UPDATE hail_reports SET last_accessed_at = NOW() WHERE id = $1`,
      [id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Update report access error:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
