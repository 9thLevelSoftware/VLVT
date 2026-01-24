-- ============================================
-- MIGRATION 026: Add User Consents Table
-- GDPR-02, GDPR-05: Granular consent tracking with withdrawal support
-- Date: 2026-01-24
-- ============================================

-- Create enum for consent purposes
CREATE TYPE consent_purpose AS ENUM (
  'location_discovery',    -- Allow location-based profile discovery
  'marketing',             -- Receive marketing communications
  'analytics',             -- Allow analytics data collection
  'after_hours'            -- After Hours mode (special category data)
);

-- Create user_consents table
CREATE TABLE IF NOT EXISTS user_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose consent_purpose NOT NULL,
  granted BOOLEAN NOT NULL DEFAULT FALSE,
  granted_at TIMESTAMP WITH TIME ZONE,
  withdrawn_at TIMESTAMP WITH TIME ZONE,
  consent_version TEXT NOT NULL,  -- Links to privacy policy version
  ip_address TEXT,                -- Record IP for audit (optional)
  user_agent TEXT,                -- Record device for audit (optional)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  -- Each user can only have one consent record per purpose
  UNIQUE(user_id, purpose)
);

-- Indexes for common queries
CREATE INDEX idx_user_consents_user_id ON user_consents(user_id);
CREATE INDEX idx_user_consents_purpose ON user_consents(purpose);
CREATE INDEX idx_user_consents_granted ON user_consents(granted) WHERE granted = TRUE;

-- Create trigger function for auto-updating updated_at
-- This function can be reused by other tables
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at
CREATE TRIGGER update_user_consents_updated_at
  BEFORE UPDATE ON user_consents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE user_consents IS 'GDPR: Tracks granular consent per purpose with audit trail';
COMMENT ON COLUMN user_consents.consent_version IS 'Privacy policy version at time of consent (e.g., "2026-01-24")';
COMMENT ON COLUMN user_consents.withdrawn_at IS 'When consent was withdrawn (NULL if still granted)';
COMMENT ON COLUMN user_consents.ip_address IS 'IP address recorded at time of consent action (audit trail)';
COMMENT ON COLUMN user_consents.user_agent IS 'User agent recorded at time of consent action (audit trail)';

-- Migrate existing after_hours_consent from users table to new table
-- This preserves existing consent state
INSERT INTO user_consents (user_id, purpose, granted, granted_at, consent_version)
SELECT
  id,
  'after_hours'::consent_purpose,
  after_hours_consent,
  after_hours_consent_at,
  '2026-01-24'  -- Current version at migration time
FROM users
WHERE after_hours_consent IS NOT NULL
ON CONFLICT (user_id, purpose) DO NOTHING;
