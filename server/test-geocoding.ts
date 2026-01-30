/**
 * Test Geocoding Function
 *
 * Run: npx tsx server/test-geocoding.ts
 */

/**
 * Geocode using US Census Bureau Geocoder (free, no API key required)
 */
const geocodeWithCensus = async (params: { address: string; city: string; state: string; zipCode: string }) => {
  try {
    const addressLine = `${params.address}, ${params.city}, ${params.state} ${params.zipCode}`;
    const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?` +
      `address=${encodeURIComponent(addressLine)}&` +
      `benchmark=Public_AR_Current&` +
      `format=json`;

    console.log('🔍 Geocoding with Census Bureau:', url);

    const response = await fetch(url);
    const data = await response.json();

    console.log('📍 Census response:', JSON.stringify(data, null, 2));

    if (data.result?.addressMatches?.length > 0) {
      const match = data.result.addressMatches[0];
      const coords = match.coordinates;
      return {
        latitude: coords.y,
        longitude: coords.x
      };
    }

    return null;
  } catch (error) {
    console.error('❌ Census geocoding error:', error);
    return null;
  }
};

/**
 * Geocode using Nominatim (OpenStreetMap)
 */
const geocodeWithNominatim = async (params: { address: string; city: string; state: string; zipCode: string }) => {
  try {
    // Try structured Nominatim query first
    const structuredUrl = `https://nominatim.openstreetmap.org/search?` +
      `street=${encodeURIComponent(params.address)}&` +
      `city=${encodeURIComponent(params.city)}&` +
      `state=${encodeURIComponent(params.state)}&` +
      `postalcode=${encodeURIComponent(params.zipCode)}&` +
      `country=USA&` +
      `format=json&` +
      `limit=1`;

    console.log('🔍 Geocoding with Nominatim (structured):', structuredUrl);

    let response = await fetch(structuredUrl, {
      headers: { 'User-Agent': 'GeminiFieldAssistant/1.0' }
    });

    let data = await response.json();

    // If structured query fails, try simple query format
    if (!Array.isArray(data) || data.length === 0) {
      const simpleQuery = encodeURIComponent(`${params.address}, ${params.city}, ${params.state} ${params.zipCode}, USA`);
      const simpleUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${simpleQuery}&limit=1&countrycodes=us`;

      console.log('🔍 Geocoding with Nominatim (simple):', simpleUrl);

      response = await fetch(simpleUrl, {
        headers: { 'User-Agent': 'GeminiFieldAssistant/1.0' }
      });

      data = await response.json();
    }

    if (Array.isArray(data) && data.length > 0) {
      return {
        latitude: parseFloat(data[0].lat),
        longitude: parseFloat(data[0].lon)
      };
    }

    return null;
  } catch (error) {
    console.error('❌ Nominatim geocoding error:', error);
    return null;
  }
};

/**
 * Multi-provider geocoding with fallback
 * Tries Census Bureau first (most accurate for US addresses), then falls back to Nominatim
 */
const geocodeAddress = async (params: { address: string; city: string; state: string; zipCode: string }) => {
  console.log('🔍 Starting geocoding for:', {
    address: params.address,
    city: params.city,
    state: params.state,
    zipCode: params.zipCode
  });

  // Try Census Bureau first (best for US addresses)
  let result = await geocodeWithCensus(params);
  if (result) {
    console.log('✅ Geocoded successfully with Census Bureau:', result);
    return result;
  }

  // Fallback to Nominatim
  console.log('⚠️ Census geocoding failed, trying Nominatim...');
  result = await geocodeWithNominatim(params);
  if (result) {
    console.log('✅ Geocoded successfully with Nominatim:', result);
    return result;
  }

  console.error('❌ All geocoding providers failed');
  return null;
};

// Test cases
const testAddresses = [
  {
    address: '8100 Boone Boulevard',
    city: 'Vienna',
    state: 'VA',
    zipCode: '22182'
  },
  {
    address: '1600 Pennsylvania Avenue NW',
    city: 'Washington',
    state: 'DC',
    zipCode: '20500'
  },
  {
    address: '123 Main Street',
    city: 'Springfield',
    state: 'IL',
    zipCode: '62701'
  },
  {
    address: '350 Fifth Avenue',
    city: 'New York',
    state: 'NY',
    zipCode: '10118'
  }
];

async function runTests() {
  console.log('🧪 Testing Multi-Provider Geocoding Function\n');

  for (const testAddr of testAddresses) {
    console.log('\n' + '='.repeat(60));
    console.log('Testing:', testAddr.address);
    console.log('='.repeat(60));

    const result = await geocodeAddress(testAddr);

    if (result) {
      console.log('✅ FINAL SUCCESS:', result);
    } else {
      console.log('❌ FINAL FAILED: No result from any provider');
    }

    // Rate limit: wait 1 second between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

runTests().catch(console.error);
