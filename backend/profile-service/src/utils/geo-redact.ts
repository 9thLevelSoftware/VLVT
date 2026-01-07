/**
 * Redact coordinates to city-level precision (2 decimal places = ~1.1km)
 * For logging purposes only - does not affect stored data
 */
export function redactCoordinates(
  latitude: number,
  longitude: number
): { latitude: number; longitude: number } {
  return {
    latitude: Math.round(latitude * 100) / 100,
    longitude: Math.round(longitude * 100) / 100
  };
}
