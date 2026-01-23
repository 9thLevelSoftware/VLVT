-- Migration 024: Add source column to matches table
-- Description: Track match origin (swipe vs after_hours conversion)
-- Date: 2026-01-22

-- ============================================
-- ADD SOURCE COLUMN TO MATCHES TABLE
-- Tracks whether a match originated from regular swiping or After Hours mode conversion
-- ============================================

-- Add source column if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'matches' AND column_name = 'source'
    ) THEN
        ALTER TABLE matches ADD COLUMN source VARCHAR(50) DEFAULT 'swipe';
    END IF;
END $$;

-- Add comment explaining column purpose
COMMENT ON COLUMN matches.source IS 'How the match was created: swipe (regular matching), after_hours (converted from After Hours mode)';

-- Index for filtering by source if needed
CREATE INDEX IF NOT EXISTS idx_matches_source ON matches(source);

-- ============================================
-- NOTES
-- ============================================
-- This migration is safe to run on existing data:
-- - All existing matches get 'swipe' as the default value
-- - New After Hours conversions will set source='after_hours'
-- - The index enables efficient filtering by match origin for analytics
