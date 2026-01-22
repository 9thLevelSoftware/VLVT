-- Migration 021: Add After Hours Mode Tables
-- Description: Foundation schema for After Hours Mode feature - time-boxed spontaneous connections
-- Date: 2026-01-22

-- ============================================
-- 1. AFTER HOURS PROFILES
-- Separate profile for After Hours Mode (distinct from main profile)
-- ============================================
CREATE TABLE IF NOT EXISTS after_hours_profiles (
    user_id VARCHAR(255) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    photo_url TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE after_hours_profiles IS 'Separate profile for After Hours Mode (distinct from main dating profile)';
COMMENT ON COLUMN after_hours_profiles.photo_url IS 'Single photo URL for After Hours profile display';
COMMENT ON COLUMN after_hours_profiles.description IS 'Short bio/description specific to After Hours Mode';

-- ============================================
-- 2. AFTER HOURS PREFERENCES
-- User preferences for After Hours matching (gender seeking, distance, interests)
-- ============================================
CREATE TABLE IF NOT EXISTS after_hours_preferences (
    user_id VARCHAR(255) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    seeking_gender VARCHAR(50) NOT NULL DEFAULT 'Any',
    max_distance_km INTEGER DEFAULT 10,
    interests TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_after_hours_preferences_seeking
    ON after_hours_preferences(seeking_gender);

COMMENT ON TABLE after_hours_preferences IS 'User preferences for After Hours matching (gender seeking, distance, interests)';
COMMENT ON COLUMN after_hours_preferences.seeking_gender IS 'Gender preference for matching: Any, Male, Female, Non-binary';
COMMENT ON COLUMN after_hours_preferences.max_distance_km IS 'Maximum distance in kilometers for potential matches';
COMMENT ON COLUMN after_hours_preferences.interests IS 'Array of interests/kinks for matching';

-- ============================================
-- 3. AFTER HOURS SESSIONS
-- Timed sessions with location data for matching
-- ============================================
CREATE TABLE IF NOT EXISTS after_hours_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ended_at TIMESTAMP WITH TIME ZONE,
    -- Exact location (NEVER exposed to other users)
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    -- Fuzzed location for display (~500m accuracy)
    fuzzed_latitude DECIMAL(10, 8) NOT NULL,
    fuzzed_longitude DECIMAL(11, 8) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Only one active session per user (ended_at IS NULL means active)
CREATE UNIQUE INDEX IF NOT EXISTS idx_after_hours_sessions_active_user
    ON after_hours_sessions(user_id) WHERE ended_at IS NULL;

-- Index for session cleanup jobs
CREATE INDEX IF NOT EXISTS idx_after_hours_sessions_expires
    ON after_hours_sessions(expires_at) WHERE ended_at IS NULL;

-- Index for proximity queries (finding nearby active sessions)
CREATE INDEX IF NOT EXISTS idx_after_hours_sessions_location
    ON after_hours_sessions(fuzzed_latitude, fuzzed_longitude) WHERE ended_at IS NULL;

COMMENT ON TABLE after_hours_sessions IS 'Active and historical After Hours sessions with location data';
COMMENT ON COLUMN after_hours_sessions.latitude IS 'Exact latitude (PRIVACY: never exposed to other users)';
COMMENT ON COLUMN after_hours_sessions.longitude IS 'Exact longitude (PRIVACY: never exposed to other users)';
COMMENT ON COLUMN after_hours_sessions.fuzzed_latitude IS 'Fuzzed latitude for display to other users (~500m accuracy)';
COMMENT ON COLUMN after_hours_sessions.fuzzed_longitude IS 'Fuzzed longitude for display to other users (~500m accuracy)';
COMMENT ON COLUMN after_hours_sessions.ended_at IS 'When session was ended manually; NULL means session is active';
COMMENT ON COLUMN after_hours_sessions.expires_at IS 'Automatic session expiry time (fixed duration sessions)';

-- ============================================
-- 4. AFTER HOURS DECLINES
-- Session-scoped declines (reset each session, not permanent blocks)
-- ============================================
CREATE TABLE IF NOT EXISTS after_hours_declines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES after_hours_sessions(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    declined_user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id, user_id, declined_user_id)
);

CREATE INDEX IF NOT EXISTS idx_after_hours_declines_session
    ON after_hours_declines(session_id);

CREATE INDEX IF NOT EXISTS idx_after_hours_declines_user
    ON after_hours_declines(user_id);

COMMENT ON TABLE after_hours_declines IS 'Session-scoped declines (reset each session, not permanent blocks). Declined users reappear in future sessions.';
COMMENT ON COLUMN after_hours_declines.session_id IS 'Session during which decline occurred (auto-deleted when session deleted)';
COMMENT ON COLUMN after_hours_declines.declined_user_id IS 'User who was declined (hidden for remainder of session only)';

-- ============================================
-- 5. AFTER HOURS MATCHES
-- Ephemeral matches (deleted when session expires unless both users save)
-- ============================================
CREATE TABLE IF NOT EXISTS after_hours_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES after_hours_sessions(id) ON DELETE CASCADE,
    user_id_1 VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_id_2 VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    user1_save_vote BOOLEAN DEFAULT FALSE,
    user2_save_vote BOOLEAN DEFAULT FALSE,
    converted_to_match_id VARCHAR(255) REFERENCES matches(id),
    UNIQUE(session_id, user_id_1, user_id_2)
);

CREATE INDEX IF NOT EXISTS idx_after_hours_matches_session
    ON after_hours_matches(session_id);

CREATE INDEX IF NOT EXISTS idx_after_hours_matches_users
    ON after_hours_matches(user_id_1, user_id_2);

CREATE INDEX IF NOT EXISTS idx_after_hours_matches_expires
    ON after_hours_matches(expires_at);

COMMENT ON TABLE after_hours_matches IS 'Ephemeral After Hours matches (auto-deleted when session ends unless both users vote to save)';
COMMENT ON COLUMN after_hours_matches.user1_save_vote IS 'User 1 voted to save this match as permanent';
COMMENT ON COLUMN after_hours_matches.user2_save_vote IS 'User 2 voted to save this match as permanent';
COMMENT ON COLUMN after_hours_matches.converted_to_match_id IS 'Reference to permanent match if both users voted to save';

-- ============================================
-- 6. AFTER HOURS MESSAGES
-- Ephemeral messages (deleted with match unless match is saved)
-- ============================================
CREATE TABLE IF NOT EXISTS after_hours_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID NOT NULL REFERENCES after_hours_matches(id) ON DELETE CASCADE,
    sender_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_after_hours_messages_match
    ON after_hours_messages(match_id);

CREATE INDEX IF NOT EXISTS idx_after_hours_messages_created
    ON after_hours_messages(created_at);

COMMENT ON TABLE after_hours_messages IS 'Ephemeral messages in After Hours matches (deleted when match expires unless saved)';
COMMENT ON COLUMN after_hours_messages.match_id IS 'Reference to the After Hours match this message belongs to';
COMMENT ON COLUMN after_hours_messages.sender_id IS 'User who sent this message';

-- ============================================
-- 7. GDPR CONSENT TRACKING ON USERS TABLE
-- Explicit consent for After Hours location sharing (GDPR requirement)
-- ============================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS after_hours_consent BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS after_hours_consent_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN users.after_hours_consent IS 'GDPR: Explicit consent for After Hours location sharing (must be true to use feature)';
COMMENT ON COLUMN users.after_hours_consent_at IS 'GDPR: Timestamp when user granted After Hours location consent (for audit trail)';
