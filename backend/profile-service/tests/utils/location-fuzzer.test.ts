import { fuzzLocationForAfterHours, FuzzedCoordinates } from '../../src/utils/location-fuzzer';

/**
 * Calculate haversine distance between two points in kilometers
 */
function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in km
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

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Count decimal places in a number
 */
function countDecimalPlaces(value: number): number {
  const str = value.toString();
  const decimalIndex = str.indexOf('.');
  if (decimalIndex === -1) return 0;
  return str.length - decimalIndex - 1;
}

describe('Location Fuzzer', () => {
  describe('fuzzLocationForAfterHours', () => {
    const testLat = 40.7128;
    const testLon = -74.006;

    it('should return different coordinates from input (with high probability)', () => {
      // Run multiple times to ensure randomness is working
      const results: FuzzedCoordinates[] = [];
      for (let i = 0; i < 10; i++) {
        results.push(fuzzLocationForAfterHours(testLat, testLon));
      }

      // At least some results should be different from each other
      const uniqueResults = new Set(
        results.map((r) => `${r.latitude},${r.longitude}`)
      );
      expect(uniqueResults.size).toBeGreaterThan(1);

      // Results should differ from original (after rounding)
      const roundedOriginal = {
        latitude: Math.round(testLat * 1000) / 1000,
        longitude: Math.round(testLon * 1000) / 1000
      };

      // At least some should differ from the rounded original
      const differentFromOriginal = results.filter(
        (r) =>
          r.latitude !== roundedOriginal.latitude ||
          r.longitude !== roundedOriginal.longitude
      );
      expect(differentFromOriginal.length).toBeGreaterThan(0);
    });

    it('should output at most 3 decimal places', () => {
      for (let i = 0; i < 50; i++) {
        const result = fuzzLocationForAfterHours(testLat, testLon);
        expect(countDecimalPlaces(result.latitude)).toBeLessThanOrEqual(3);
        expect(countDecimalPlaces(result.longitude)).toBeLessThanOrEqual(3);
      }
    });

    it('should keep fuzzed results within expected max distance (~611m)', () => {
      // Default fuzz radius is 0.5km, plus 3 decimal precision (~111m)
      // Max expected distance is ~611m, but we add margin for edge cases
      const maxExpectedDistance = 0.7; // km (700m with margin)

      for (let i = 0; i < 100; i++) {
        const result = fuzzLocationForAfterHours(testLat, testLon);
        const distance = haversineDistance(
          testLat,
          testLon,
          result.latitude,
          result.longitude
        );
        expect(distance).toBeLessThanOrEqual(maxExpectedDistance);
      }
    });

    it('should throw error for latitude > 90', () => {
      expect(() => fuzzLocationForAfterHours(91, testLon)).toThrow(
        'Invalid latitude: 91'
      );
    });

    it('should throw error for latitude < -90', () => {
      expect(() => fuzzLocationForAfterHours(-91, testLon)).toThrow(
        'Invalid latitude: -91'
      );
    });

    it('should throw error for longitude > 180', () => {
      expect(() => fuzzLocationForAfterHours(testLat, 181)).toThrow(
        'Invalid longitude: 181'
      );
    });

    it('should throw error for longitude < -180', () => {
      expect(() => fuzzLocationForAfterHours(testLat, -181)).toThrow(
        'Invalid longitude: -181'
      );
    });

    it('should handle coordinates near North Pole without overflow', () => {
      const polarLat = 89.9;
      const polarLon = 0;

      for (let i = 0; i < 20; i++) {
        const result = fuzzLocationForAfterHours(polarLat, polarLon);
        expect(result.latitude).toBeLessThanOrEqual(90);
        expect(result.latitude).toBeGreaterThanOrEqual(-90);
        expect(result.longitude).toBeLessThanOrEqual(180);
        expect(result.longitude).toBeGreaterThanOrEqual(-180);
      }
    });

    it('should handle coordinates near South Pole without overflow', () => {
      const polarLat = -89.9;
      const polarLon = 0;

      for (let i = 0; i < 20; i++) {
        const result = fuzzLocationForAfterHours(polarLat, polarLon);
        expect(result.latitude).toBeLessThanOrEqual(90);
        expect(result.latitude).toBeGreaterThanOrEqual(-90);
        expect(result.longitude).toBeLessThanOrEqual(180);
        expect(result.longitude).toBeGreaterThanOrEqual(-180);
      }
    });

    it('should handle coordinates near antimeridian (180/-180) without overflow', () => {
      const meridianLat = 0;
      const meridianLon = 179.99;

      for (let i = 0; i < 20; i++) {
        const result = fuzzLocationForAfterHours(meridianLat, meridianLon);
        expect(result.latitude).toBeLessThanOrEqual(90);
        expect(result.latitude).toBeGreaterThanOrEqual(-90);
        expect(result.longitude).toBeLessThanOrEqual(180);
        expect(result.longitude).toBeGreaterThanOrEqual(-180);
      }

      // Test negative side too
      const negativeMeridianLon = -179.99;
      for (let i = 0; i < 20; i++) {
        const result = fuzzLocationForAfterHours(meridianLat, negativeMeridianLon);
        expect(result.longitude).toBeLessThanOrEqual(180);
        expect(result.longitude).toBeGreaterThanOrEqual(-180);
      }
    });

    it('should produce larger spread with custom fuzz radius of 1.0km', () => {
      const defaultRadiusDistances: number[] = [];
      const largerRadiusDistances: number[] = [];

      for (let i = 0; i < 50; i++) {
        const defaultResult = fuzzLocationForAfterHours(testLat, testLon, 0.5);
        defaultRadiusDistances.push(
          haversineDistance(testLat, testLon, defaultResult.latitude, defaultResult.longitude)
        );

        const largerResult = fuzzLocationForAfterHours(testLat, testLon, 1.0);
        largerRadiusDistances.push(
          haversineDistance(testLat, testLon, largerResult.latitude, largerResult.longitude)
        );
      }

      // Average distance with 1.0km radius should be larger than 0.5km radius
      const avgDefault =
        defaultRadiusDistances.reduce((a, b) => a + b, 0) / defaultRadiusDistances.length;
      const avgLarger =
        largerRadiusDistances.reduce((a, b) => a + b, 0) / largerRadiusDistances.length;

      expect(avgLarger).toBeGreaterThan(avgDefault);

      // Max distance with 1.0km radius should be within ~1.2km (1km + 111m precision)
      const maxLarger = Math.max(...largerRadiusDistances);
      expect(maxLarger).toBeLessThanOrEqual(1.3); // km with margin
    });

    it('should return only rounded coordinates with zero fuzz radius', () => {
      const preciseCoords = {
        lat: 40.71284567,
        lon: -74.00601234
      };

      // With fuzzRadiusKm=0, should just round without jitter
      const result = fuzzLocationForAfterHours(
        preciseCoords.lat,
        preciseCoords.lon,
        0
      );

      // Result should be exactly the rounded version
      expect(result.latitude).toBe(Math.round(preciseCoords.lat * 1000) / 1000);
      expect(result.longitude).toBe(Math.round(preciseCoords.lon * 1000) / 1000);

      // Multiple calls with 0 radius should return same result
      const result2 = fuzzLocationForAfterHours(
        preciseCoords.lat,
        preciseCoords.lon,
        0
      );
      expect(result2.latitude).toBe(result.latitude);
      expect(result2.longitude).toBe(result.longitude);
    });

    it('should accept boundary coordinates (exact 90/-90 latitude)', () => {
      // These should not throw
      expect(() => fuzzLocationForAfterHours(90, 0)).not.toThrow();
      expect(() => fuzzLocationForAfterHours(-90, 0)).not.toThrow();
    });

    it('should accept boundary coordinates (exact 180/-180 longitude)', () => {
      // These should not throw
      expect(() => fuzzLocationForAfterHours(0, 180)).not.toThrow();
      expect(() => fuzzLocationForAfterHours(0, -180)).not.toThrow();
    });
  });
});
