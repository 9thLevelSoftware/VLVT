-- Migration: Create matches and messages tables
-- Description: Core matching and messaging functionality
-- Date: 2025-11-05

-- Matches table
CREATE TABLE IF NOT EXISTS matches (
    id VARCHAR(255) PRIMARY KEY,
    user_id_1 VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_id_2 VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id_1, user_id_2)
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_matches_user1 ON matches(user_id_1);
CREATE INDEX IF NOT EXISTS idx_matches_user2 ON matches(user_id_2);
CREATE INDEX IF NOT EXISTS idx_matches_created_at ON matches(created_at);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
    id VARCHAR(255) PRIMARY KEY,
    match_id VARCHAR(255) NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    sender_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for message queries
CREATE INDEX IF NOT EXISTS idx_messages_match ON messages(match_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);

-- Add comments
COMMENT ON TABLE matches IS 'Stores mutual matches between users';
COMMENT ON TABLE messages IS 'Chat messages between matched users';
COMMENT ON COLUMN matches.user_id_1 IS 'First user in the match';
COMMENT ON COLUMN matches.user_id_2 IS 'Second user in the match';
COMMENT ON COLUMN messages.match_id IS 'Reference to the match this message belongs to';
