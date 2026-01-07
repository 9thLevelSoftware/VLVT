import {
  generateMatchId,
  generateMessageId,
  generateBlockId,
  generateReportId,
} from '../src/utils/id-generator';

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

  describe('generateMessageId', () => {
    it('should generate a message ID with correct prefix', () => {
      const id = generateMessageId();
      expect(id).toMatch(/^msg_[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    });

    it('should generate unique message IDs', () => {
      const id1 = generateMessageId();
      const id2 = generateMessageId();
      expect(id1).not.toBe(id2);
    });

    it('should generate 1000 unique message IDs without collision', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        ids.add(generateMessageId());
      }
      expect(ids.size).toBe(1000);
    });
  });

  describe('generateBlockId', () => {
    it('should generate a block ID with correct prefix', () => {
      const id = generateBlockId();
      expect(id).toMatch(/^block_[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    });

    it('should generate unique block IDs', () => {
      const id1 = generateBlockId();
      const id2 = generateBlockId();
      expect(id1).not.toBe(id2);
    });

    it('should generate 1000 unique block IDs without collision', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        ids.add(generateBlockId());
      }
      expect(ids.size).toBe(1000);
    });
  });

  describe('generateReportId', () => {
    it('should generate a report ID with correct prefix', () => {
      const id = generateReportId();
      expect(id).toMatch(/^report_[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    });

    it('should generate unique report IDs', () => {
      const id1 = generateReportId();
      const id2 = generateReportId();
      expect(id1).not.toBe(id2);
    });

    it('should generate 1000 unique report IDs without collision', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        ids.add(generateReportId());
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
        promises.push(Promise.resolve(generateMessageId()));
        promises.push(Promise.resolve(generateBlockId()));
        promises.push(Promise.resolve(generateReportId()));
      }

      const results = await Promise.all(promises);
      results.forEach(id => ids.add(id));

      expect(ids.size).toBe(400);
    });
  });
});
