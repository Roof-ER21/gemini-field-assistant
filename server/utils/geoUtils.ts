/**
 * Geographic Utility Functions
 *
 * Utilities for working with geographic coordinates, distances, and location data.
 */

/**
 * Calculate distance between two coordinates using Haversine formula
 *
 * @param lat1 - Latitude of first point
 * @param lon1 - Longitude of first point
 * @param lat2 - Latitude of second point
 * @param lon2 - Longitude of second point
 * @returns Distance in miles
 */
export function calculateDistanceMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3958.8; // Earth's radius in miles

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
    Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Convert degrees to radians
 */
function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Format distance for display
 *
 * @param miles - Distance in miles
 * @returns Formatted string (e.g., "2.5 mi", "0.3 mi")
 */
export function formatDistance(miles: number): string {
  if (miles < 0.1) {
    return 'nearby';
  } else if (miles < 1) {
    return `${miles.toFixed(1)} mi`;
  } else {
    return `${Math.round(miles)} mi`;
  }
}

/**
 * Get a simple location description from coordinates
 * This is a placeholder - in production, you'd use reverse geocoding
 *
 * @param lat - Latitude
 * @param lng - Longitude
 * @returns Location description
 */
export function getLocationDescription(lat: number, lng: number): string {
  // In a real implementation, this would call a reverse geocoding API
  // For now, just return coordinates formatted nicely
  return `${lat.toFixed(4)}°, ${lng.toFixed(4)}°`;
}
