-- Migration 020: Add Token Rotation Support
-- This migration adds columns and tables to support refresh token rotation
-- Token rotation improves security by issuing new refresh tokens on each use
-- and detecting token reuse (replay attacks)

-- Add token family tracking for rotation and reuse detection
-- token_family groups all tokens from the same login session
-- rotated_at marks when a token was used and replaced
-- superseded_by links to the new token that replaced this one
ALTER TABLE refresh_tokens
ADD COLUMN IF NOT EXISTS token_family UUID DEFAULT gen_random_uuid(),
ADD COLUMN IF NOT EXISTS rotated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS superseded_by VARCHAR(64);

-- Index for efficient family lookups (for revoking entire family on reuse detection)
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family
ON refresh_tokens(token_family);

-- Index for checking superseded tokens (reuse detection)
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_superseded
ON refresh_tokens(superseded_by) WHERE superseded_by IS NOT NULL;

-- Track reuse attempts for security monitoring and incident response
-- This table logs when someone tries to use an already-rotated token
-- which may indicate a token theft/replay attack
CREATE TABLE IF NOT EXISTS token_reuse_attempts (
  id SERIAL PRIMARY KEY,
  token_hash VARCHAR(64) NOT NULL,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_family UUID NOT NULL,
  attempted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT
);

-- Index for querying reuse attempts by user
CREATE INDEX IF NOT EXISTS idx_token_reuse_user
ON token_reuse_attempts(user_id, attempted_at DESC);

-- Index for querying reuse attempts by family (for incident investigation)
CREATE INDEX IF NOT EXISTS idx_token_reuse_family
ON token_reuse_attempts(token_family);

-- Table comment
COMMENT ON TABLE token_reuse_attempts IS 'Logs attempts to reuse already-rotated refresh tokens. High frequency of entries may indicate token theft or replay attacks.';

-- Column comments for refresh_tokens additions
COMMENT ON COLUMN refresh_tokens.token_family IS 'UUID grouping all tokens from the same login session. Used to revoke all tokens if reuse is detected.';
COMMENT ON COLUMN refresh_tokens.rotated_at IS 'Timestamp when this token was used and rotated. NULL if token has not been used yet.';
COMMENT ON COLUMN refresh_tokens.superseded_by IS 'Hash of the new token that replaced this one. Used to detect reuse of old tokens.';

-- Column comments for token_reuse_attempts
COMMENT ON COLUMN token_reuse_attempts.token_hash IS 'Hash of the token that was attempted to be reused';
COMMENT ON COLUMN token_reuse_attempts.user_id IS 'User whose token was attempted to be reused';
COMMENT ON COLUMN token_reuse_attempts.token_family IS 'Token family that was compromised and subsequently revoked';
COMMENT ON COLUMN token_reuse_attempts.ip_address IS 'IP address of the reuse attempt for incident investigation';
COMMENT ON COLUMN token_reuse_attempts.user_agent IS 'User agent of the reuse attempt for incident investigation';
