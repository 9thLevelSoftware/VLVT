import { redactCoordinates } from '../src/utils/geo-redact';

describe('Geo Redaction', () => {
  describe('redactCoordinates', () => {
    it('should truncate to 2 decimal places', () => {
      const result = redactCoordinates(40.7128123, -74.0060456);

      expect(result.latitude).toBe(40.71);
      expect(result.longitude).toBe(-74.01);
    });

    it('should preserve sign for negative coordinates', () => {
      const result = redactCoordinates(-33.8688, 151.2093);

      expect(result.latitude).toBe(-33.87);
      expect(result.longitude).toBe(151.21);
    });
  });
});
