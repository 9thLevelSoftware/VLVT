import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

// Enhanced password requirements for better security
const MIN_LENGTH = 12; // Increased from 8 to 12
const MAX_LENGTH = 64; // Prevent excessively long passwords
const HAS_LETTER = /[a-zA-Z]/;
const HAS_NUMBER = /[0-9]/;
const HAS_SPECIAL = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/; // Special characters
const HAS_UPPERCASE = /[A-Z]/; // At least one uppercase letter
const HAS_LOWERCASE = /[a-z]/; // At least one lowercase letter
const NO_COMMON_PASSWORDS = /^(password|123456|qwerty|letmein|welcome|admin|login|passw0rd|iloveyou)/i; // Block common passwords
const NO_EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+/; // Prevent email-like passwords

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate password meets requirements
 */
export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];

  // Check password length
  if (password.length < MIN_LENGTH) {
    errors.push(`Password must be at least ${MIN_LENGTH} characters`);
  }
  if (password.length > MAX_LENGTH) {
    errors.push(`Password must be less than ${MAX_LENGTH} characters`);
  }

  // Check for common weak passwords
  if (NO_COMMON_PASSWORDS.test(password)) {
    errors.push('Password is too common and easily guessable');
  }

  // Check for email-like patterns
  if (NO_EMAIL_PATTERN.test(password)) {
    errors.push('Password cannot contain email-like patterns');
  }

  // Check character diversity
  if (!HAS_UPPERCASE.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!HAS_LOWERCASE.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!HAS_NUMBER.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (!HAS_SPECIAL.test(password)) {
    errors.push('Password must contain at least one special character (!@#$%^&* etc.)');
  }

  // Check for sequential characters (e.g., "1234", "abcd")
  if (/(.)\1{3,}/.test(password)) {
    errors.push('Password cannot contain repeated characters');
  }

  // Check for keyboard sequences
  const keyboardSequences = ['qwerty', 'asdfgh', 'zxcvbn', '123456', '654321'];
  if (keyboardSequences.some(seq => password.toLowerCase().includes(seq))) {
    errors.push('Password cannot contain common keyboard sequences');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
