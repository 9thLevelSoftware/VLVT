import crypto from 'crypto';

/**
 * Generate a cryptographically secure random token
 * @param bytes Number of random bytes (default 32, produces 64-char hex string)
 */
export function generateToken(bytes: number = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Generate a verification token with 24-hour expiry
 * Returns both the raw token (to send via email) and the hash (to store in database)
 * SECURITY: Never store raw verification tokens - always store the hash
 */
export function generateVerificationToken(): { token: string; tokenHash: string; expires: Date } {
  const token = generateToken(32);
  const tokenHash = hashToken(token);
  return {
    token,
    tokenHash,
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
  };
}

/**
 * Generate a password reset token with 1-hour expiry
 * Returns both the raw token (to send via email) and the hash (to store in database)
 * SECURITY: Never store raw reset tokens - always store the hash
 */
export function generateResetToken(): { token: string; tokenHash: string; expires: Date } {
  const token = generateToken(32);
  const tokenHash = hashToken(token);
  return {
    token,
    tokenHash,
    expires: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
  };
}

/**
 * Generate a refresh token with 7-day expiry
 * Returns both the raw token (to send to client) and the hash (to store in database)
 */
export function generateRefreshToken(): { token: string; tokenHash: string; expires: Date } {
  const token = generateToken(64); // 128-char hex string for extra security
  const tokenHash = hashToken(token);
  return {
    token,
    tokenHash,
    expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
  };
}

/**
 * Hash a token using SHA-256 for secure storage
 * Never store raw refresh tokens in the database
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Check if a token has expired
 */
export function isTokenExpired(expires: Date): boolean {
  return new Date() > new Date(expires);
}

/**
 * Verify a token against a stored hash using timing-safe comparison
 * Use this instead of direct string comparison to prevent timing attacks
 * @param token The raw token submitted by the user
 * @param storedHash The SHA-256 hash stored in the database
 * @returns true if the token matches the stored hash
 */
export function verifyToken(token: string, storedHash: string): boolean {
  try {
    const computedHash = hashToken(token);
    // Both hashes should be 64-char hex strings (256 bits / 4 bits per hex char)
    if (computedHash.length !== storedHash.length || storedHash.length !== 64) {
      return false;
    }
    return crypto.timingSafeEqual(
      Buffer.from(computedHash, 'hex'),
      Buffer.from(storedHash, 'hex')
    );
  } catch {
    // Handle any edge cases (malformed input, etc.)
    return false;
  }
}
