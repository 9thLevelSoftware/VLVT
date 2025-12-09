-- Migration: Security improvements
-- Description: Add age validation, hash reset tokens, improve constraints
-- Date: 2025-12-09

-- ============================================
-- 1. ADD AGE VALIDATION CHECK CONSTRAINT
-- ============================================
-- Ensure age is within reasonable bounds (18-120)

DO $$
BEGIN
    -- Drop existing constraint if it exists
    ALTER TABLE profiles DROP CONSTRAINT IF EXISTS check_age_range;

    -- Add age validation constraint
    ALTER TABLE profiles
        ADD CONSTRAINT check_age_range
        CHECK (age IS NULL OR (age >= 18 AND age <= 120));
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'profiles table does not exist, skipping age constraint';
END $$;

COMMENT ON CONSTRAINT check_age_range ON profiles IS 'Ensures age is between 18 and 120 (legal dating age requirements)';

-- ============================================
-- 2. CHANGE reset_token TO STORE HASH
-- ============================================
-- Increase reset_token column size to store SHA-256 hash (64 hex chars)
-- Note: The application code will need to hash tokens before storing

-- The column is already VARCHAR(64) which is sufficient for SHA-256 hex
-- Just add a comment documenting the change
COMMENT ON COLUMN auth_credentials.reset_token IS 'SHA-256 hash of password reset token (not plaintext)';

-- ============================================
-- 3. ADD ENUM VALIDATION FOR STATUS FIELDS
-- ============================================

-- Reports status validation
DO $$
BEGIN
    ALTER TABLE reports DROP CONSTRAINT IF EXISTS check_report_status;
    ALTER TABLE reports
        ADD CONSTRAINT check_report_status
        CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed'));
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'reports table does not exist, skipping status constraint';
END $$;

-- Message status validation
DO $$
BEGIN
    ALTER TABLE messages DROP CONSTRAINT IF EXISTS check_message_status;
    ALTER TABLE messages
        ADD CONSTRAINT check_message_status
        CHECK (status IS NULL OR status IN ('sent', 'delivered', 'read', 'failed'));
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'messages table does not exist, skipping status constraint';
END $$;

-- ============================================
-- 4. ADD INDEX FOR FASTER TOKEN LOOKUPS
-- ============================================
-- Ensure efficient lookups for reset tokens
-- Note: We can't use NOW() in partial index (not IMMUTABLE), so we just
-- index non-null reset tokens. Application code handles expiry filtering.

CREATE INDEX IF NOT EXISTS idx_auth_credentials_reset_token
    ON auth_credentials(reset_token)
    WHERE reset_token IS NOT NULL;
