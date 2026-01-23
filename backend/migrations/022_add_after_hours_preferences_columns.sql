-- Migration 022: Add age range and orientation to After Hours preferences
-- Description: Extends after_hours_preferences table with min_age, max_age, and sexual_orientation columns
-- Date: 2026-01-22

ALTER TABLE after_hours_preferences
  ADD COLUMN IF NOT EXISTS min_age INTEGER DEFAULT 18,
  ADD COLUMN IF NOT EXISTS max_age INTEGER DEFAULT 99,
  ADD COLUMN IF NOT EXISTS sexual_orientation VARCHAR(50);

COMMENT ON COLUMN after_hours_preferences.min_age IS 'Minimum age preference for matching (default 18)';
COMMENT ON COLUMN after_hours_preferences.max_age IS 'Maximum age preference for matching (default 99)';
COMMENT ON COLUMN after_hours_preferences.sexual_orientation IS 'Sexual orientation filter for matching';
