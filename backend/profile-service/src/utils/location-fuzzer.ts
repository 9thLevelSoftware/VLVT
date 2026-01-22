/**
 * Location Fuzzing for After Hours Mode
 *
 * Privacy-preserving location obfuscation to prevent trilateration attacks.
 *
 * Algorithm:
 * 1. Add random offset within specified radius (default 500m)
 * 2. Round to 3 decimal places (~111m precision)
 *
 * Result: True location hidden within ~611m maximum radius
 *
 * @see https://privacypatterns.org/patterns/Location-granularity
 */

// Re-export for backward compatibility
export { redactCoordinates } from './geo-redact';

/**
 * Fuzzed coordinate pair with reduced precision
 */
export interface FuzzedCoordinates {
  latitude: number;
  longitude: number;
}

// Earth radius in kilometers
const EARTH_RADIUS_KM = 6371;

// Conversion constants
const KM_PER_DEGREE_LATITUDE = 111.32;

/**
 * Apply random jitter and precision reduction to coordinates for privacy protection.
 *
 * Uses sqrt-based random distance for uniform distribution within the fuzz circle.
 * This prevents clustering near the center which would weaken privacy.
 *
 * @param latitude - Original latitude (-90 to 90)
 * @param longitude - Original longitude (-180 to 180)
 * @param fuzzRadiusKm - Maximum offset radius in kilometers (default: 0.5km = 500m)
 * @returns Fuzzed coordinates rounded to 3 decimal places
 * @throws Error if coordinates are outside valid ranges
 */
export function fuzzLocationForAfterHours(
  latitude: number,
  longitude: number,
  fuzzRadiusKm: number = 0.5
): FuzzedCoordinates {
  // Input validation
  if (latitude < -90 || latitude > 90) {
    throw new Error(`Invalid latitude: ${latitude}. Must be between -90 and 90.`);
  }
  if (longitude < -180 || longitude > 180) {
    throw new Error(`Invalid longitude: ${longitude}. Must be between -180 and 180.`);
  }

  // If no fuzzing requested, just round
  if (fuzzRadiusKm === 0) {
    return {
      latitude: roundToThreeDecimals(latitude),
      longitude: roundToThreeDecimals(longitude)
    };
  }

  // Random angle (0 to 2*PI) for uniform direction
  const randomAngle = Math.random() * 2 * Math.PI;

  // sqrt-based random distance for uniform distribution within circle
  // Without sqrt, points would cluster near center
  const randomDistance = Math.sqrt(Math.random()) * fuzzRadiusKm;

  // Convert distance to coordinate offset
  // Latitude: 1 degree = ~111.32 km
  const latOffset = (randomDistance * Math.sin(randomAngle)) / KM_PER_DEGREE_LATITUDE;

  // Longitude: depends on latitude (converges at poles)
  const latRadians = latitude * (Math.PI / 180);
  const kmPerDegreeLongitude = KM_PER_DEGREE_LATITUDE * Math.cos(latRadians);
  // Avoid division by zero near poles
  const lonOffset = kmPerDegreeLongitude > 0.001
    ? (randomDistance * Math.cos(randomAngle)) / kmPerDegreeLongitude
    : 0;

  // Apply offsets
  let fuzzedLat = latitude + latOffset;
  let fuzzedLon = longitude + lonOffset;

  // Clamp to valid ranges (handles edge cases near poles/meridian)
  fuzzedLat = Math.max(-90, Math.min(90, fuzzedLat));

  // Wrap longitude if it crosses the antimeridian
  if (fuzzedLon > 180) {
    fuzzedLon = fuzzedLon - 360;
  } else if (fuzzedLon < -180) {
    fuzzedLon = fuzzedLon + 360;
  }

  // Round to 3 decimal places (~111m precision)
  return {
    latitude: roundToThreeDecimals(fuzzedLat),
    longitude: roundToThreeDecimals(fuzzedLon)
  };
}

/**
 * Round a number to 3 decimal places
 */
function roundToThreeDecimals(value: number): number {
  return Math.round(value * 1000) / 1000;
}
