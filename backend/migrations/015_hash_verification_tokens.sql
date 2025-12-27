-- Migration 015: Hash Verification and Reset Tokens
-- SECURITY: Tokens are now stored as SHA-256 hashes instead of plaintext
-- This prevents attackers from generating valid tokens if the database is compromised

-- Add new hashed token columns
ALTER TABLE auth_credentials
  ADD COLUMN IF NOT EXISTS verification_token_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS reset_token_hash VARCHAR(64);

-- Create index for faster lookups on hashed columns
CREATE INDEX IF NOT EXISTS idx_auth_credentials_verification_hash
  ON auth_credentials(verification_token_hash) WHERE verification_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_auth_credentials_reset_hash
  ON auth_credentials(reset_token_hash) WHERE reset_token_hash IS NOT NULL;

-- Mark old columns as deprecated (will remove in future migration after data migration)
COMMENT ON COLUMN auth_credentials.verification_token IS 'DEPRECATED: Use verification_token_hash instead';
COMMENT ON COLUMN auth_credentials.reset_token IS 'DEPRECATED: Use reset_token_hash instead';

-- Note: The old verification_token and reset_token columns are intentionally kept
-- for backward compatibility during the transition period.
-- A future migration should:
-- 1. Verify all new tokens use the _hash columns
-- 2. Drop the old plaintext columns
-- 3. Rename _hash columns to remove the suffix
