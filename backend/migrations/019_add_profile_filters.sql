-- Migration: Add profile filter columns
-- Description: Add gender, sexual_preference, and intent columns to profiles table
-- Date: 2026-01-01

-- ============================================
-- 1. ADD FILTER COLUMNS TO PROFILES
-- ============================================
-- These columns are used for discovery filtering:
-- - gender: User's gender identity
-- - sexual_preference: User's dating preference
-- - intent: What the user is looking for (chat, hookup, dating, relationship)

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gender VARCHAR(50);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sexual_preference VARCHAR(50);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS intent VARCHAR(50);

-- ============================================
-- 2. CREATE INDEXES FOR EFFICIENT FILTERING
-- ============================================
-- These indexes speed up discovery queries that filter by these fields

CREATE INDEX IF NOT EXISTS idx_profiles_gender ON profiles(gender);
CREATE INDEX IF NOT EXISTS idx_profiles_sexual_preference ON profiles(sexual_preference);
CREATE INDEX IF NOT EXISTS idx_profiles_intent ON profiles(intent);

-- ============================================
-- 3. ADD COMMENTS
-- ============================================
COMMENT ON COLUMN profiles.gender IS 'User gender: Male, Female, Non-Binary';
COMMENT ON COLUMN profiles.sexual_preference IS 'Dating preference: Straight, Gay, Bisexual, Pansexual';
COMMENT ON COLUMN profiles.intent IS 'Looking for: Chat, Hookup, Dating, Relationship';
