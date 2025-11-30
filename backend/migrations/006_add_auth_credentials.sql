-- Migration 006: Add Auth Credentials Table for Multi-Provider Authentication
-- This migration creates tables to support email/password auth alongside OAuth providers (Google, Apple, Instagram)
-- Allows users to have multiple auth methods linked to the same account

-- Main auth credentials table
CREATE TABLE IF NOT EXISTS auth_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Provider information
  provider VARCHAR(50) NOT NULL CHECK (provider IN ('google', 'apple', 'instagram', 'email')),
  provider_id VARCHAR(255), -- OAuth provider's user ID (NULL for email provider)
  email VARCHAR(255) NOT NULL,

  -- Email/password authentication
  password_hash VARCHAR(255), -- bcrypt hash, only populated for email provider
  email_verified BOOLEAN DEFAULT false,

  -- Email verification tokens
  verification_token VARCHAR(64),
  verification_expires TIMESTAMP WITH TIME ZONE,

  -- Password reset tokens
  reset_token VARCHAR(64),
  reset_expires TIMESTAMP WITH TIME ZONE,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  -- Constraints
  UNIQUE(provider, provider_id), -- One OAuth account per provider

  -- Email provider must have password_hash, OAuth providers must have provider_id
  CONSTRAINT check_email_provider CHECK (
    (provider = 'email' AND password_hash IS NOT NULL AND provider_id IS NULL) OR
    (provider != 'email' AND provider_id IS NOT NULL)
  )
);

-- Rate limiting table for email operations (verification, password reset, login attempts)
CREATE TABLE IF NOT EXISTS auth_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier VARCHAR(255) NOT NULL, -- email or IP address
  operation VARCHAR(50) NOT NULL CHECK (operation IN ('login', 'verification', 'reset', 'signup')),
  attempt_count INTEGER DEFAULT 1,
  window_start TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_attempt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  locked_until TIMESTAMP WITH TIME ZONE, -- Temporary lockout timestamp after too many failed attempts

  UNIQUE(identifier, operation)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_auth_credentials_user_id ON auth_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_credentials_provider ON auth_credentials(provider);
CREATE INDEX IF NOT EXISTS idx_auth_credentials_provider_email ON auth_credentials(provider, email);
CREATE INDEX IF NOT EXISTS idx_auth_credentials_provider_id ON auth_credentials(provider, provider_id) WHERE provider_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_auth_credentials_email ON auth_credentials(email);
CREATE INDEX IF NOT EXISTS idx_auth_credentials_verification_token ON auth_credentials(verification_token) WHERE verification_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_auth_credentials_reset_token ON auth_credentials(reset_token) WHERE reset_token IS NOT NULL;

-- Partial unique index for (provider, email) that only applies when email IS NOT NULL
-- This prevents UNIQUE constraint violations with NULL emails for OAuth providers
CREATE UNIQUE INDEX idx_auth_credentials_provider_email_unique
  ON auth_credentials(provider, email)
  WHERE email IS NOT NULL;

-- Rate limiting indexes
CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_identifier_operation ON auth_rate_limits(identifier, operation);
CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_window_start ON auth_rate_limits(window_start);

-- Table comments
COMMENT ON TABLE auth_credentials IS 'Stores authentication credentials for multiple auth providers (Google, Apple, Instagram, email/password). Supports account linking and multi-provider login.';
COMMENT ON TABLE auth_rate_limits IS 'Rate limiting for authentication operations to prevent abuse (brute force, spam verification emails, etc.)';

-- Column comments for auth_credentials
COMMENT ON COLUMN auth_credentials.provider IS 'Authentication provider: google, apple, instagram, or email';
COMMENT ON COLUMN auth_credentials.provider_id IS 'Unique user ID from OAuth provider (NULL for email auth)';
COMMENT ON COLUMN auth_credentials.password_hash IS 'Bcrypt hash of password (only for email provider)';
COMMENT ON COLUMN auth_credentials.email_verified IS 'Whether the email address has been verified';
COMMENT ON COLUMN auth_credentials.verification_token IS 'Token for email verification link';
COMMENT ON COLUMN auth_credentials.reset_token IS 'Token for password reset link';

-- Column comments for auth_rate_limits
COMMENT ON COLUMN auth_rate_limits.identifier IS 'Email address or IP address being rate limited';
COMMENT ON COLUMN auth_rate_limits.operation IS 'Type of operation: login, verification, reset, signup';
COMMENT ON COLUMN auth_rate_limits.attempt_count IS 'Number of attempts in current time window';
COMMENT ON COLUMN auth_rate_limits.window_start IS 'Start of current rate limiting window';
COMMENT ON COLUMN auth_rate_limits.locked_until IS 'Timestamp until which the account/IP is locked after too many failed attempts';
