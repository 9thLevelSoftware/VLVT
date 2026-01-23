-- Migration 023: Add matching engine schema additions
-- Description: Schema changes for 3-session decline memory and match decline tracking
-- Date: 2026-01-22

-- ============================================
-- 1. MODIFY AFTER_HOURS_DECLINES FOR 3-SESSION MEMORY
-- Track decline counts across sessions to allow reappearance after N declines
-- ============================================

-- Add decline tracking columns to after_hours_declines
-- Using DO block for idempotent ALTER TABLE operations
DO $$
BEGIN
    -- Add decline_count column if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'after_hours_declines' AND column_name = 'decline_count'
    ) THEN
        ALTER TABLE after_hours_declines ADD COLUMN decline_count INTEGER DEFAULT 1;
    END IF;

    -- Add first_declined_at column if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'after_hours_declines' AND column_name = 'first_declined_at'
    ) THEN
        ALTER TABLE after_hours_declines ADD COLUMN first_declined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
    END IF;

    -- Add last_session_id column if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'after_hours_declines' AND column_name = 'last_session_id'
    ) THEN
        ALTER TABLE after_hours_declines ADD COLUMN last_session_id UUID;
    END IF;
END $$;

-- Drop old session-scoped unique constraint and add user-pair unique constraint
-- This allows tracking declines across sessions (not per-session)
DO $$
BEGIN
    -- Drop the old unique constraint if it exists
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'after_hours_declines_session_id_user_id_declined_user_id_key'
    ) THEN
        ALTER TABLE after_hours_declines
        DROP CONSTRAINT after_hours_declines_session_id_user_id_declined_user_id_key;
    END IF;

    -- Add new user-pair unique constraint if not exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'after_hours_declines_user_pair_unique'
    ) THEN
        ALTER TABLE after_hours_declines
        ADD CONSTRAINT after_hours_declines_user_pair_unique UNIQUE (user_id, declined_user_id);
    END IF;
END $$;

-- Add index for efficient decline lookups during matching
CREATE INDEX IF NOT EXISTS idx_after_hours_declines_lookup
    ON after_hours_declines(user_id, declined_user_id, decline_count);

-- Comments for new columns
COMMENT ON COLUMN after_hours_declines.decline_count IS 'Number of times this user pair has declined each other (reset after reaching threshold)';
COMMENT ON COLUMN after_hours_declines.first_declined_at IS 'Timestamp of first decline in current cycle (for analytics)';
COMMENT ON COLUMN after_hours_declines.last_session_id IS 'Session ID where the most recent decline occurred';

-- ============================================
-- 2. MODIFY AFTER_HOURS_MATCHES FOR DECLINE TRACKING
-- Track which user declined a match and when
-- ============================================

-- Add decline tracking columns to after_hours_matches
DO $$
BEGIN
    -- Add declined_by column if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'after_hours_matches' AND column_name = 'declined_by'
    ) THEN
        ALTER TABLE after_hours_matches ADD COLUMN declined_by VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL;
    END IF;

    -- Add declined_at column if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'after_hours_matches' AND column_name = 'declined_at'
    ) THEN
        ALTER TABLE after_hours_matches ADD COLUMN declined_at TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- Comments for new columns
COMMENT ON COLUMN after_hours_matches.declined_by IS 'User ID of the person who declined this match (NULL = not declined, active match)';
COMMENT ON COLUMN after_hours_matches.declined_at IS 'Timestamp when match was declined';

-- ============================================
-- 3. ADD INDEX FOR ACTIVE MATCH LOOKUP
-- Optimizes finding active (non-declined, non-expired) matches
-- ============================================

-- Partial index for active matches (not declined and not expired)
-- Note: Using a function index with NOW() is not possible, so we create a simpler partial index
CREATE INDEX IF NOT EXISTS idx_after_hours_matches_active
    ON after_hours_matches(user_id_1, user_id_2) WHERE declined_by IS NULL;

-- Index for finding matches by either user
CREATE INDEX IF NOT EXISTS idx_after_hours_matches_user_lookup
    ON after_hours_matches(user_id_1) WHERE declined_by IS NULL;

CREATE INDEX IF NOT EXISTS idx_after_hours_matches_user_lookup_2
    ON after_hours_matches(user_id_2) WHERE declined_by IS NULL;

COMMENT ON INDEX idx_after_hours_matches_active IS 'Partial index for finding active matches (not declined)';
