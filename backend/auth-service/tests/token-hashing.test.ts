import { generateVerificationToken, generateResetToken, hashToken, verifyToken } from '../src/utils/crypto';

describe('Verification Token Hashing', () => {
  it('should generate a token and its hash', () => {
    const { token, tokenHash } = generateVerificationToken();

    expect(token).toHaveLength(64); // 32 bytes hex = 64 chars
    expect(tokenHash).toHaveLength(64); // SHA-256 hex = 64 chars
    expect(token).not.toBe(tokenHash);
  });

  it('should verify token against stored hash', () => {
    const { token, tokenHash } = generateVerificationToken();

    expect(verifyToken(token, tokenHash)).toBe(true);
    expect(verifyToken('wrong-token', tokenHash)).toBe(false);
  });

  it('should generate unique tokens each time', () => {
    const token1 = generateVerificationToken();
    const token2 = generateVerificationToken();

    expect(token1.token).not.toBe(token2.token);
    expect(token1.tokenHash).not.toBe(token2.tokenHash);
  });

  it('should hash tokens consistently', () => {
    const token = 'a'.repeat(64);
    const hash1 = hashToken(token);
    const hash2 = hashToken(token);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it('should use timing-safe comparison', () => {
    const { token, tokenHash } = generateVerificationToken();

    // Valid token should pass
    expect(verifyToken(token, tokenHash)).toBe(true);

    // Wrong token of same length should fail
    const wrongToken = 'b'.repeat(64);
    expect(verifyToken(wrongToken, tokenHash)).toBe(false);

    // Wrong token of different length should fail gracefully
    expect(verifyToken('short', tokenHash)).toBe(false);
    expect(verifyToken('', tokenHash)).toBe(false);
  });
});

describe('Reset Token Hashing', () => {
  it('should generate a reset token with correct structure', () => {
    const result = generateResetToken();

    // Should return { token, tokenHash, expires }
    expect(result).toHaveProperty('token');
    expect(result).toHaveProperty('tokenHash');
    expect(result).toHaveProperty('expires');
  });

  it('should generate 64-char hex token', () => {
    const { token } = generateResetToken();

    expect(token).toHaveLength(64); // 32 bytes hex = 64 chars
    expect(/^[a-f0-9]+$/.test(token)).toBe(true);
  });

  it('should generate 64-char hex hash different from token', () => {
    const { token, tokenHash } = generateResetToken();

    expect(tokenHash).toHaveLength(64); // SHA-256 hex = 64 chars
    expect(/^[a-f0-9]+$/.test(tokenHash)).toBe(true);
    expect(token).not.toBe(tokenHash);
  });

  it('should expire in approximately 1 hour (not 24 hours)', () => {
    const { expires } = generateResetToken();
    const now = Date.now();
    const expiresTime = expires.getTime();

    // Should be roughly 1 hour from now (with small tolerance for test execution time)
    const oneHourMs = 60 * 60 * 1000;
    const twentyFourHoursMs = 24 * 60 * 60 * 1000;
    const toleranceMs = 5000; // 5 seconds tolerance

    expect(expiresTime - now).toBeGreaterThan(oneHourMs - toleranceMs);
    expect(expiresTime - now).toBeLessThan(oneHourMs + toleranceMs);
    // Verify it's NOT 24 hours
    expect(expiresTime - now).toBeLessThan(twentyFourHoursMs - oneHourMs);
  });

  it('should generate unique tokens each time', () => {
    const result1 = generateResetToken();
    const result2 = generateResetToken();

    expect(result1.token).not.toBe(result2.token);
    expect(result1.tokenHash).not.toBe(result2.tokenHash);
  });

  it('should be verifiable using verifyToken', () => {
    const { token, tokenHash } = generateResetToken();

    expect(verifyToken(token, tokenHash)).toBe(true);
    expect(verifyToken('wrong-token', tokenHash)).toBe(false);
  });
});
