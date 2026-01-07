import { generateMatchId } from '../src/utils/id-generator';

describe('UUID ID Generation', () => {
  describe('generateMatchId', () => {
    it('should generate a match ID with correct prefix', () => {
      const id = generateMatchId();
      expect(id).toMatch(/^match_[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    });

    it('should generate unique match IDs', () => {
      const id1 = generateMatchId();
      const id2 = generateMatchId();
      expect(id1).not.toBe(id2);
    });

    it('should generate 1000 unique match IDs without collision', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        ids.add(generateMatchId());
      }
      expect(ids.size).toBe(1000);
    });
  });

  describe('Concurrency resistance', () => {
    it('should generate unique IDs under simulated concurrent conditions', async () => {
      const ids = new Set<string>();
      const promises: Promise<string>[] = [];

      // Simulate concurrent ID generation
      for (let i = 0; i < 100; i++) {
        promises.push(Promise.resolve(generateMatchId()));
      }

      const results = await Promise.all(promises);
      results.forEach(id => ids.add(id));

      expect(ids.size).toBe(100);
    });
  });
});
