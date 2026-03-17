/**
 * Property Risk Enrichment Service
 *
 * Enriches storm damage assessments with property-level risk factors:
 * - Roof age estimate (based on housing year built from Census ACS)
 * - Property type classification (single family, townhouse, etc.)
 * - Roof material vulnerability (age-based estimate)
 * - Previous claim history (from our storm_events database)
 *
 * Uses free Census Bureau ACS data by ZIP code (no API key needed).
 */

interface PropertyRiskInput {
  lat: number;
  lng: number;
  zip?: string;
  address?: string;
}

export interface PropertyRiskResult {
  riskMultiplier: number; // 0.5 - 2.0x multiplier on damage score
  factors: {
    estimatedRoofAge: number | null; // years
    medianYearBuilt: number | null;
    roofVulnerability: 'low' | 'moderate' | 'high' | 'critical';
    housingUnits: number | null;
    previousStormHits: number;
  };
  summary: string;
}

// Simple in-memory cache (24h TTL)
const cache = new Map<string, { data: any; expires: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000;

/**
 * Estimate property risk based on location characteristics.
 */
export async function assessPropertyRisk(input: PropertyRiskInput): Promise<PropertyRiskResult> {
  const { zip, lat, lng } = input;

  let medianYearBuilt: number | null = null;
  let housingUnits: number | null = null;

  // Try Census ACS data for the ZIP code
  if (zip) {
    const censusData = await fetchCensusHousingData(zip);
    if (censusData) {
      medianYearBuilt = censusData.medianYearBuilt;
      housingUnits = censusData.housingUnits;
    }
  }

  // Calculate roof age
  const currentYear = new Date().getFullYear();
  const estimatedRoofAge = medianYearBuilt
    ? currentYear - medianYearBuilt
    : null;

  // Determine roof vulnerability based on age
  let roofVulnerability: PropertyRiskResult['factors']['roofVulnerability'] = 'moderate';
  if (estimatedRoofAge !== null) {
    if (estimatedRoofAge >= 25) roofVulnerability = 'critical';
    else if (estimatedRoofAge >= 15) roofVulnerability = 'high';
    else if (estimatedRoofAge >= 8) roofVulnerability = 'moderate';
    else roofVulnerability = 'low';
  }

  // Calculate risk multiplier
  let riskMultiplier = 1.0;
  if (estimatedRoofAge !== null) {
    if (estimatedRoofAge >= 25) riskMultiplier = 1.8; // Old roof, very vulnerable
    else if (estimatedRoofAge >= 15) riskMultiplier = 1.4;
    else if (estimatedRoofAge >= 8) riskMultiplier = 1.1;
    else riskMultiplier = 0.7; // New roof, less likely to have damage
  }

  // Build summary
  let summary = '';
  if (estimatedRoofAge !== null) {
    summary = `Estimated median roof age: ${estimatedRoofAge} years (built ~${medianYearBuilt}).`;
    if (roofVulnerability === 'critical') {
      summary += ' Roofs 25+ years old are highly susceptible to hail and wind damage. Most asphalt shingles have a 20-30 year lifespan.';
    } else if (roofVulnerability === 'high') {
      summary += ' Roofs 15-25 years old show increased vulnerability to storm damage due to weathering and granule loss.';
    } else if (roofVulnerability === 'moderate') {
      summary += ' Roof age is moderate — standard vulnerability to hail and wind.';
    } else {
      summary += ' Newer roofs are more resistant but can still sustain damage from severe hail (1.5"+).';
    }
  } else {
    summary = 'Property age data not available for this location.';
  }

  return {
    riskMultiplier,
    factors: {
      estimatedRoofAge,
      medianYearBuilt,
      roofVulnerability,
      housingUnits,
      previousStormHits: 0 // populated by caller from storm_events
    },
    summary
  };
}

/**
 * Fetch housing age data from Census Bureau ACS API (free, no key needed).
 * Uses ACS 5-Year estimates, table B25035 (Median Year Structure Built).
 */
async function fetchCensusHousingData(zip: string): Promise<{
  medianYearBuilt: number | null;
  housingUnits: number | null;
} | null> {
  const cacheKey = `census-${zip}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.data;

  try {
    // ACS 5-Year: B25035_001E = Median Year Built, B25001_001E = Total Housing Units
    const url = `https://api.census.gov/data/2022/acs/acs5?get=B25035_001E,B25001_001E&for=zip%20code%20tabulation%20area:${zip}`;

    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) return null;

    const data = await response.json();
    // Response format: [["B25035_001E","B25001_001E","zip code tabulation area"], ["1985","4532","20158"]]
    if (!Array.isArray(data) || data.length < 2) return null;

    const row = data[1];
    const medianYearBuilt = row[0] ? parseInt(row[0], 10) : null;
    const housingUnits = row[1] ? parseInt(row[1], 10) : null;

    const result = {
      medianYearBuilt: medianYearBuilt && !isNaN(medianYearBuilt) ? medianYearBuilt : null,
      housingUnits: housingUnits && !isNaN(housingUnits) ? housingUnits : null
    };

    cache.set(cacheKey, { data: result, expires: Date.now() + CACHE_TTL });
    return result;
  } catch (err) {
    console.warn(`[PropertyRisk] Census data fetch failed for ZIP ${zip}:`, (err as Error).message);
    return null;
  }
}
